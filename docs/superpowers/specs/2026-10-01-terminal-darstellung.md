# Darstellung der Terminal-Sessions — Diagnose

**Stand:** 2026-10-01 · Branch `terminal-darstellung` · xterm 5.5.0, addon-fit 0.10.0,
addon-webgl 0.18.0, addon-canvas 0.7.0 · Electron 34.5.8

Diese Datei ist eine **Diagnose**, kein Umbauplan. Jeder Befund trägt, wie sicher er ist:

- **belegt** — im Quelltext nachvollzogen (Datei:Zeile) oder im Log gesehen
- **vermutet** — plausibel, aber nicht nachgewiesen; was zum Nachweis fehlt, steht dabei

Geändert wurde nur, was unter „Was behoben ist" steht. Abschnitt 9 nennt die Lücken.

---

## 0. Methode und ihre Grenze

Die App lief während der Untersuchung und durfte nicht angefasst werden. Gemessen wurde
daher an den vorhandenen Startlogs (`/tmp/mux-start*.log`), an den 66 Bugreports unter
`~/.config/cipher-mux/bugreports/` und an der persistierten Config. Alles andere ist
Quelltextlesung — auch der xterm-Quelltext, der unter
`node_modules/@xterm/xterm/src/` mitgeliefert wird.

**Was dadurch nicht geht:** einen Stacktrace für den offenen Renderer-Fehler holen. Er wird
nicht geloggt (Befund 2.4). Die Mechanik des Fehlers ist belegt, die auslösende Stelle nicht.

---

## 1. Befund: Ein Themewechsel baut jedes Terminal neu — belegt

**Was passiert.** `useTerminal` hatte `theme` im Dependency-Array des Effekts, der das
xterm erzeugt (`useTerminal.ts:456`, vorher `}, [sessionId, theme])`). Jede Änderung des
Theme-Props führt deshalb die komplette Aufräumkette aus und baut danach ein neues
Terminal: `term.dispose()`, neues `new Terminal`, neuer WebGL-Kontext, neuer
`capture-pane`-Restore.

**Warum das jeden Start trifft.** `useTheme` startet bei `DEFAULT_THEME`
(`shared/grid-types.ts:43` → `cipher-ivory`) und setzt das gespeicherte Theme erst, wenn
`config.get('ui')` zurück ist (`useTheme.ts:37-64`). In der Config dieses Nutzers steht
`ui.theme = "nord"`. Der Wert wechselt also bei **jedem** Start von `cipher-ivory` auf
`nord` — und mit ihm das Prop an jeder `SessionCell` (`SessionGrid.tsx:330` →
`SessionCell.tsx:80`). Terminals, die zu diesem Zeitpunkt schon stehen, werden abgerissen
und neu gebaut.

**Drei Folgen, jede für sich sichtbar:**

1. **Scrollback ist weg.** Das neue xterm hat einen leeren Puffer. Was rekonstruiert wird,
   kommt aus `capture-pane` — also nur der sichtbare Bereich plus die mitgegebene
   Zeilenzahl, hart umgebrochen (Befund 3).
2. **Der `isBrandNew`-Guard kippt gegen sich selbst.** `capturedSessions`
   (`useTerminal.ts:61`) merkt sich jede Session beim ersten Mount. Beim Neubau ist
   `alreadyCaptured` deshalb `true`, `isBrandNew` wird `false`, und der Restore-Pfad läuft —
   auch auf einer Session, die gerade erst erzeugt wurde. Genau das, was der Guard laut
   seinem eigenen Kommentar verhindern soll: „to avoid clobbering an in-flight autoLaunch
   TUI". Ein Themewechsel in den ersten Sekunden einer Session schreibt ihr also ein
   halbgemaltes Claude-Startbild über.
3. **Es ist die Stelle, an der der offene Renderer-Fehler fällt** (Befund 2).

**Dass ein Neubau nicht nötig ist, steht im gleichen Effekt.** Ein MutationObserver auf
`document.body` (`useTerminal.ts:275-280`) hört auf `data-theme` und `style` und setzt
`term.options.theme` am **laufenden** Terminal. `theme` als Parameter wird nur als Rückfall
gebraucht, wenn die CSS-Variablen beim Bauen noch nicht stehen
(`getCssTerminalTheme`, Zeile 22-30). Jeder Weg, der das Theme ändert — Erstladen,
`onThemeChanged` aus einem anderen Fenster, Custom-Tokens — ruft `applyTheme` bzw.
`applyCustomTokens` und mutiert damit `body`. Der Observer deckt alle drei ab.

**Behoben:** `theme` liegt jetzt in einem Ref, das Dependency-Array ist `[sessionId]`.

---

## 2. Befund: `Cannot read properties of undefined (reading 'dimensions')`

### 2.1 Die Mechanik — belegt

In xterm 5.5.0 gibt es genau **einen** ungeschützten Zugriff auf `dimensions`:

```ts
// node_modules/@xterm/xterm/src/browser/services/RenderService.ts:50
public get dimensions(): IRenderDimensions { return this._renderer.value!.dimensions; }
```

`_renderer` ist ein `MutableDisposable`. Dessen Getter liefert `undefined`, sobald er
disposed ist (`common/Lifecycle.ts:57-59`), und `RenderService` ist am Terminal registriert.
**Nach `term.dispose()` wirft jeder Zugriff auf `renderService.dimensions` exakt diese
TypeError-Meldung.** Alle anderen Methoden von `RenderService` prüfen `_renderer.value`
vorher — der Getter ist die einzige Ausnahme.

Dass die Meldung von dort kommt und nicht von einem undefinierten `_renderService`, ist
zusätzlich dadurch gestützt, dass `Terminal` kein eigenes `dispose` hat, das das Feld
nullt: die Guards der Form `if (!this._renderService) return`
(`Terminal.ts:307`, `Terminal.ts:1286`) greifen nach einem Dispose also gerade **nicht**.

**Es ist damit ein Zugriff nach dem Dispose** — kein Initialisierungsfehler. Vor dem ersten
`setRenderer` existiert kein Fenster, in dem fremder Code den Getter erreichen könnte:
`open()` setzt den Renderer synchron (`Terminal.ts:502-504`), bevor `Viewport`,
`SelectionService`, `MouseService` und `BufferDecorationRenderer` überhaupt entstehen.

### 2.2 Warum der Fehler nicht in einem `fit()` fällt — belegt

Alle Aufrufe von `fitAddon.fit()` in `useTerminal.ts` liegen in `try`/`catch`
(Zeilen 125, 163, 287). `FitAddon.proposeDimensions` liest zwar
`core._renderService.dimensions` ungeschützt, aber der Wurf käme dort abgefangen an. Der
Fehler ist „Uncaught" — er fällt also in einem Callback, den niemand von uns umschlossen
hat. In Frage kommen die Timer und Animation-Frames, die xterm selbst stellt und beim
Dispose **nicht** abräumt, allen voran
`Viewport`s `setTimeout(() => this.syncScrollArea())` (`Viewport.ts:84`) und
`Viewport.reset()`s `requestAnimationFrame(() => this.syncScrollArea())`
(`Viewport.ts:100`); `syncScrollArea` liest den Getter in Zeile 156.

### 2.3 Wie weit das die Logs erklärt — teils belegt, teils offen

In den Startlogs steht der Fehler immer zwischen
`[app] keepWorking: poll-based restore received 4 sessions` und
`[RecoveryDialog] processing result` — also im Moment, in dem die Zellen entstehen.
Die Anzahl schwankt: **1** in `mux-start{,2,3,6,7,8,10,11,12}.log`, **4** in
`mux-start9.log`, **0** in `mux-start13.log` (dort startete die App nicht: „Another
cipher-mux instance is already running").

Die **4** passen zu Befund 1: wenn `pullKeepWorkingRestore` früher antwortet als
`config.get('ui')`, mounten vier Zellen mit `cipher-ivory` und werden Millisekunden später
alle vier auf `nord` neu gebaut — vier Disposes, vier Würfe. Beide Aufrufe starten im
gleichen Mount; welcher zuerst zurückkommt, ist nicht festgelegt (`app.tsx:552-580`,
`useTheme.ts:37`).

**Die eine Meldung im Normalfall ist nicht erklärt.** Siehe Abschnitt 9.1.

### 2.4 Warum das sechs Wochen offen blieb — belegt

Der Weiterleiter für Renderer-Konsolenmeldungen verwarf Datei und Zeile:
`webContents.on('console-message', (_event, level, message) => …)`
(`window-manager.ts:82`). Übrig blieb ein Satz ohne Ort. **Behoben:** bei Level `error`
wird `sourceId:line` mitgeschrieben. Das macht die Stelle im gebauten Bundle nachlesbar und
ist der Weg, 2.3 und 9.1 beim nächsten Start zu schliessen.

---

## 3. Befund: Der Resync nach jedem Resize schreibt gegen den Livestream — belegt

Das ist der stärkste Kandidat für „die Zeilen zerfallen", die der Nutzer in
`BUG-2026-04-22-TNDXR0` meldet („schau mal die zeilen in der mpo session - die zerfaleln -
ganz stabil ist das nicht…") und für `BUG-2026-04-23-DDEKTM` („so sieht es aus wenn eine
session voll loslegt").

**Was passiert.** Jeder Resize, der `cols`/`rows` ändert, löst `scheduleResync()` aus
(`useTerminal.ts:181`). 200 ms später wird `capture-pane` geholt, dann `term.reset()` und
der Schnappschuss hineingeschrieben (Zeilen 105-135). Parallel läuft der Livestream
ungebremst weiter: `api().terminal.onData` schreibt jedes `%output` von tmux direkt mit
`term.write` (Zeilen 430-436). **Es gibt keine Unterdrückung während der Neuschrift.**

Drei Dinge gehen dabei gegeneinander:

1. **Relativ gegen absolut.** Der Livestream einer TUI besteht aus cursorrelativen
   Sequenzen, die gegen den *echten* tmux-Bildschirm gerechnet sind. Dazwischen einen
   Vollbild-Schnappschuss plus `reset()` zu schieben, verschiebt die Bezugsbasis unter den
   laufenden Updates weg.
2. **`capture-pane` bricht hart um.** `tmux capture-pane -t <t> -p -e`
   (`tmux-manager.ts:435`) — **ohne `-J`**. Eine logische Zeile, die breiter als der Pane
   ist, kommt als zwei physische Zeilen mit `\n` dazwischen; `content.replace(/\n/g,'\r\n')`
   macht daraus zwei eigenständige Zeilen im xterm-Puffer. Ein späterer Reflow kann sie nicht
   mehr zusammenfügen — der Zerfall ist ab dann **dauerhaft** im Puffer.
3. **Die Reihenfolge gegen tmux ist nicht abgesichert.** Der Renderer schickt
   `terminal.resize` ohne zu warten (Zeile 179); im Main laufen daraufhin *zwei*
   tmux-Aufrufe (`resize-window`, dann `resize-pane`, `tmux-manager.ts:426-428`). Die
   200 ms sind eine Schätzung darauf, dass das durch ist. Ist es das nicht, liefert
   `capture-pane` Inhalt in der **alten** Breite, und es folgt kein weiterer Resync, weil
   `lastSizeRef` schon aktualisiert ist — der falsche Umbruch bleibt bis zum nächsten
   Resize stehen.

**Dazu kommt:** nach einem `resize-pane` schickt tmux der TUI ein SIGWINCH, und die malt
sich von selbst neu. Für TUI-Sessions ist der Resync also nicht nur riskant, sondern
überflüssig. Gebraucht wird er für gewöhnliche Shell-Ausgabe, wo xterm und tmux
unterschiedlich reflowen (das ist der ursprüngliche Anlass, Kommentar bei Zeile 88, T-LC.7).

**Teil 2 behoben am 2026-10-01: `-J` ist jetzt gesetzt.** Gemessen in einem 40 Spalten
breiten Pane: eine Zeile mit 95 Zeichen kommt ohne `-J` als 40 + 40 + 15 zurück, mit `-J`
als eine mit 95. Die Nebenwirkung ist belegt und harmlos: `-J` hängt Leerzeichen an das
Zeilenende, und ein Leerzeichen am Ende malt in einem Terminal nichts — jede Zeile wird mit
`\r\n` abgeschlossen. `test/main/capture-pane-join.test.ts` hält das gegen das echte tmux
fest, weil die Behauptung eine über tmux ist und ein Mock genau die Annahme festschriebe,
die zu prüfen ist.

> **Korrektur vom 2026-10-01, Nacht.** Hier stand zunächst, eine **nie umgebrochene** Zeile
> bleibe Zeichen für Zeichen gleich. Das gilt für tmux 3.7c (macOS) und **nicht** für 3.2a
> aus ubuntu-22.04: dort bekommt auch sie zwei Leerzeichen angehängt. Gefunden hat es der
> Linux-Runner in der CI, nicht ich — der Test verlangte Gleichheit Zeichen für Zeichen und
> fiel dort um. Die Behauptung war zu stark, der Befund stimmt: was dazukommt, sind
> ausschliesslich Leerzeichen am Ende, und das prüft der Test jetzt ausdrücklich, statt
> Gleichheit zu fordern, die tmux nicht zusagt.

**Teile 1 und 3 offen.** Relativ-gegen-absolut und die ungesicherte Reihenfolge brauchen
die Unterscheidung „TUI im Alternate-Screen / gewöhnliche Shell". Der dauerhafte Zerfall ist
mit `-J` weg, das Flackern während der Neuschrift nicht.

### 3.1 Die Messung dazu — und sie wirft die Fragestellung um

Gemessen am **2026-10-02** gegen tmux 3.7c, teils an eigenen Mess-Sessions, teils lesend an
den sechzehn laufenden Sessions der installierten App (`display-message -p`, kein `send-keys`).

**M1 — `alternate_on` ist ablesbar und kippt zuverlässig.** `#{alternate_on}` steht in einer
gewöhnlichen zsh auf `0`, wechselt beim Start von `less` auf `1` und beim Verlassen zurück auf
`0`. `#{pane_in_mode}` ist etwas anderes (tmux' eigener Copy-Mode) und bleibt dabei `0`. An den
laufenden Sessions: **Codex durchgängig `0`, opencode `1`, Claude Code beides** — in einer
Session `1`, in der nächsten `0`, bei derselben Version 2.1.287.

**M2 — Claude Code zeichnet sich bei `alternate_on=0` selbst neu.** Ein idle Claude Code am
Prompt steht zehn Sekunden lang durchgehend auf `0`, also auf dem Normalbildschirm. Zieht man
den Pane dann auf 80, 50 und 70 Spalten, bricht derselbe Prosaabsatz jedes Mal **an
Wortgrenzen** neu um:

```
80: Quick safety check: Is this a project you created or one you trust? (Like your
50: Quick safety check: Is this a project you
70: Quick safety check: Is this a project you created or one you trust?
```

Das kann tmux' Reflow nicht leisten — der fügt nur zusammen und trennt, was er selbst als
umgebrochen markiert hat, und er kennt keine Wortgrenzen. Den Umbruch hat die Anwendung
gemacht, nach SIGWINCH, auf dem Normalbildschirm.

> **Damit ist `alternate_on` das falsche Unterscheidungsmerkmal.** Die Frage, die der Resync
> beantworten muss, ist nicht „steht hier eine TUI im Alternate-Screen", sondern „zeichnet
> diese Anwendung sich nach SIGWINCH selbst neu". Für Claude Code fallen die beiden Antworten
> **auseinander**: `alternate_on` sagt „gewöhnliche Shell", das Verhalten sagt „malt selbst".
> Eine Weiche auf `alternate_on` ließe also genau die Sessionklasse auf dem schädlichen Pfad,
> um die es in `BUG-2026-04-22-TNDXR0` geht — die Claude-Sessions. Die ursprüngliche
> Fragestellung dieses Abschnitts ist beantwortet, und die Antwort ist: so nicht.

**M3 — die 200 ms sind nicht nur geschätzt, sie sind unnötig.** Nach `resize-window` +
`resize-pane` meldet `capture-pane` die neue Breite **sofort**, gemessen bei 0, 50, 200, 500 ms
und 2 s — alle fünf Messungen identisch. tmux' Kommandowarteschlange erledigt das synchron zum
Rückkehren des Kommandos. Es gibt also keine Einschwingzeit, die abzuwarten wäre; ungesichert
ist allein, dass der Renderer `api().terminal.resize(...)` **nicht erwartet**
(`useTerminal.ts:218`) und 200 ms später blind erfasst. Eine Kausalkette ist hier billiger und
genauer als jede Frist.

**M4 — `capture-pane` erfasst nur den sichtbaren Bereich, und das fällt beim Verkleinern auf.**
Eine Zeile mit 95 Zeichen in einem 80 Spalten breiten Pane mit 12 Zeilen kommt mit `-J` als 95
zurück. Nach dem Verkleinern auf 40 Spalten sind es **55** — die fehlenden 40 sind in den
Scrollback gerutscht, weil die reflowte Zeile jetzt drei Zeilen braucht statt zwei. Der
Schnappschuss enthält dann eine logische Zeile, die mitten im Wort beginnt und mit `-J` wie eine
vollständige aussieht. Das ist **kein neuer Defekt** — tmux zeigt an dieser Stelle dasselbe, der
Schnappschuss ist also treu. Es ist der Grund, warum `-S` beim Resync keine Verbesserung wäre,
die man einfach nachtragen kann: mehr Scrollback mitzunehmen heißt, `term.reset()` mit fremdem
Verlauf zu füllen.

### 3.2 Der Resync warf den Scrollback weg — behoben am 2026-10-02

Das ist die Beschwerde, die der Nutzer beim Lesen der Messungen gemeldet hat, und sie ist eine
andere als „die Zeilen zerfallen": **nach dem Vergrößern einer Zelle auf doppelte Höhe und
zurück lässt sich nicht mehr hochscrollen.** Im gewöhnlichen Terminal passiert das nicht, trotz
Resize.

Die Kette, Glied für Glied belegt:

| Glied | Beleg |
|---|---|
| Resize ändert `rows` → `scheduleResync()` | `useTerminal.ts:218` (vorher ohne Bedingung) |
| `capture-pane` **ohne `-S`** liefert nur den sichtbaren Bereich | gemessen: 80×15-Pane, 488 Zeilen Historie → **15** Zeilen zurück, beginnend bei „487"; mit `-S -2000` **503** |
| `term.reset()` ersetzt den Scrollback | `BufferSet.reset()` legt `this._normal = new Buffer(...)` an — xterm 5.5.0, kein Leeren, ein neues Objekt |
| Ergebnis | Puffer = ein Bildschirm, Scrollback = 0 |

Der Parameter war auf dem **ganzen** Weg vorhanden — `capturePane(target, lines)` im
tmux-Manager, `lines` im IPC-Handler (`ipc-hub.ts:873`), `capture(paneId, lines?)` im Preload —
und wurde vom Renderer an beiden Aufrufstellen nie mitgegeben. Ein Aufruf ohne zweites Argument
sieht völlig in Ordnung aus.

**Zwei Änderungen, und die erste ist die wichtigere:**

1. **Kein Resync bei reiner Höhenänderung** (`needsReflowResync`). Der Zweck des Resync ist der
   Reflow-Unterschied, und der entsteht nur bei einem **Spalten**wechsel. Gemessen bei 15 → 30 →
   15 Zeilen und konstanter Breite: tmux holt 15 Zeilen aus der Historie in den sichtbaren
   Bereich (`history_size` 488 → 473) und schiebt sie beim Zurück wieder hinein; Zeile „472"
   bleibt Zeile „472", **nichts wird umgebrochen**. xterm tut mit seinem eigenen Scrollback
   dasselbe. Es gibt dort also nichts auszugleichen — und das ist genau der Griff, den der
   Nutzer häufig macht.
2. **Läuft er doch, trägt er die Historie** (`RESYNC_SCROLLBACK_LINES = 1000`, so groß wie
   xterms `scrollback`-Default). Dasselbe gilt für den Mount-Restore beim App-Start, der bis
   dahin eine wiederhergestellte Session ohne jede Historie hinstellte. Kosten gemessen am
   Worst Case — 120×30-Pane, 1976 Zeilen gefärbte Historie: **72 kB in 530 Zeilen, 11 ms** für
   den tmux-Aufruf; an den tatsächlich laufenden Sessions 1,2 bis 2 kB, weil die drei CLIs an
   Ort und Stelle malen und kaum Scrollback erzeugen.

`test/main/terminal-resync.test.ts` hält beide Hälften: die Entscheidung als reine Funktion, die
tmux-Behauptungen gegen das echte tmux, und einen Quelltext-Wächter darauf, dass die
Aufrufstellen die Tiefe mitgeben — die Stelle ist ohne DOM nicht ausführbar, aber lesbar.
**Beide Wächter sind am zurückgedrehten Defekt rot gesehen worden**, nicht nur grün am
reparierten Code.

> **Was das nicht behebt:** das Zerfallen bei **Breiten**änderung. Der Nutzer bestätigt, dass
> `-J` es besser gemacht hat und dass es manchmal bleibt. Dort läuft der Resync weiter und muss
> es, siehe 3.3.

### 3.3 Was bei Breitenänderung bleibt — und wie weit es reicht

Der Nutzer beschreibt es so: „dass die Zeilen auseinanderfallen bleibt auch wahr … ist besser
geworden, aber manchmal ist es noch so — und da war die Breite zumindest auch ein Faktor." Das
deckt sich mit dem Befund: `-J` hat den **dauerhaften** Zerfall weggenommen, nicht den
Vorgang, der ihn erzeugt.

Zwei Ursachen sind übrig, und sie sind unterschiedlich schwer:

**(a) Der Schnappschuss in der alten Breite — behoben am 2026-10-02.**
`api().terminal.resize(...)` war im Preload ein `ipcRenderer.send`, **ohne Rückgabe und damit
nicht abwartbar**. Der Renderer wartete stattdessen 200 ms und erfasste dann. Kam die Resize-IPC
in dieser Zeit nicht durch, lieferte `capture-pane` Inhalt in der **alten** Breite, der in ein
Terminal der **neuen** geschrieben wurde — und es folgte kein zweiter Resync, weil `lastSizeRef`
schon aktualisiert war. Der falsche Umbruch blieb bis zum nächsten Resize stehen.

Nach M3 war die Frist dafür nicht einmal nötig: nach Rückkehr des tmux-Kommandos ist
`capture-pane` **sofort** richtig. Es gab also nichts einzuschwingen, nur eine Reihenfolge
einzuhalten. Jetzt ist der Kanal `invoke`/`handle` statt `send`/`on`, und der Resync hängt als
`resized.finally(() => scheduleResync())` an der Zusage. Die 200 ms bleiben stehen, haben aber
eine andere Aufgabe: sie **fassen zusammen**, was in schneller Folge kommt — Ziehen am Fenster,
Focus Mode, Zellen-Merge — statt eine Reihenfolge zu raten.

Der Handler wirft einen gescheiterten Resize ausdrücklich **nicht** weiter, sondern loggt ihn wie
vorher; der Aufrufer bekommt nur die Zusage, dass der Versuch durch ist, und erfasst per
`finally` auch dann. Drei Quelltext-Wächter halten die Invariante über die drei Ebenen
(`terminal-resync.test.ts`), und **jeder ist an seinem eigenen zurückgedrehten Defekt rot gesehen
worden**. Eine halbe Rückkehr fällt ohnehin laut auf: mit `send` gibt das Preload `undefined`
zurück und `resized.finally` wirft.

**(b) Die Reihenfolge gegen den Livestream.** Was zwischen dem Erfassen und dem `term.reset()`
über den Livestream eintrifft, wird in den Puffer geschrieben, vom `reset()` verworfen und steht
nicht im Schnappschuss — es ist **verloren**. Eine Lücke im Strom sieht aus wie zerfallene
Zeilen. Die Lücke einfach nachzuspielen genügt nicht: Daten, die uns vor dem Erfassen erreichten,
stehen schon im Schnappschuss, und sie ein zweites Mal zu schreiben verdoppelt Zeilen statt sie
zu retten. Zwischen „verlieren" und „verdoppeln" liegt keine Frist, die beides vermeidet.

**Exakt lösbar ist (b) über die Control-Mode-Verbindung, und die Teile liegen schon da.** Jede
Session hat ihren eigenen `tmux -C`-Client (`watchSession`), gestartet mit
`stdio: ['pipe','pipe','pipe']` — **stdin ist beschreibbar**. Ein `capture-pane` auf *diesem*
Strom gesendet kommt als Antwort auf demselben Strom zurück, auf dem auch die
`%output`-Ereignisse laufen: damit ist die Reihenfolge **total** statt geschätzt. Alles, was vor
dem `%begin` kam, steht im Schnappschuss; alles nach dem `%end` nicht. Der Parser kennt `%begin`,
`%end` und `%error` samt Kommandonummer bereits (`tmux-parser.ts:101-131`), und die Rumpfzeilen
einer Antwort kommen als `{type:'unknown', line}` durch — sie lassen sich also sammeln.

Was fehlt, ist die Zuordnung von Antwort zu Anfrage: `TmuxManager.command()` ist heute ein
Rumpf, der sendet und `''` zurückgibt, mit dem Kommentar
`TODO: implement proper begin/end response matching`. **Das ist der Bau, der ansteht** — kein
neuer Mechanismus, sondern ein offenes Ende.

> **Stand:** (a) ist erledigt, (b) steht. Ob der Rest, den der Nutzer sieht, damit weg ist, lässt
> sich hier nicht entscheiden — das ist eine Beobachtung am laufenden Programm und gehört in die
> Abnahme. (b) zu bauen, ohne vorher zu wissen, ob (a) gereicht hat, wäre eine Änderung in der
> empfindlichsten Schicht auf Verdacht.

---

## 4. Befund: Vier Wege, auf denen die UI Terminals wegwirft — belegt

Jeder davon endet in `term.dispose()` und beim Wiederkommen in einem
`capture-pane`-Rekonstrukt — mit allen Folgen aus Befund 3 und dem Dispose-Fenster aus
Befund 2.

| Aktion | Stelle | Was passiert |
|---|---|---|
| **Focus Mode** (2×2-Expansion) | `SessionGrid.tsx:276-277` | Überlappte Slots geben `null` zurück. Eine Session darin wird **nicht** in den Hintergrund verschoben (`app.tsx:142-144` berechnet nur die Menge) — ihre `SessionCell` unmountet, das Terminal stirbt. Beim Verlassen wird es neu gebaut. |
| **Zellen-Merge** (rowSpan) | `SessionGrid.tsx:273` | `covered.has(idx) → null`. Dasselbe für den überdeckten Slot. |
| **Grid verkleinern** | `shared/grid-types.ts:295-312` | `resizeGrid` bildet auf (row, col) ab; was ausserhalb liegt, „silently becomes background sessions" — Zelle weg, Terminal weg. |
| **Themewechsel** | Befund 1 | behoben |

Der Schlüssel in `SessionGrid` ist `slot.sessionId` (Zeile 320) und damit stabil — ein
**Verschieben** im Grid remountet nicht, es verschiebt den DOM-Knoten. Das ist richtig so.
Das Problem ist das Ausblenden per `null`, nicht die Reihenfolge.

> **Behoben für Focus Mode und Zellen-Merge** (2026-10-01, v0.11.3): eine verdeckte
> Session-Zelle rendert jetzt mit `display: none`, statt zu verschwinden —
> `hiddenSlotDisposition` in `shared/grid-types.ts`, Begründung und die drei geprüften
> Nebenbedingungen in Abschnitt 10.
>
> **Die beiden anderen Wege stehen weiter offen.** „Grid verkleinern" wirft einen Slot
> wirklich weg und ist kein Ausblenden — dort ist das Terminal auch logisch nicht mehr am
> Platz; was dort richtig wäre, ist eine Produktfrage und keine Reparatur. Der Themewechsel
> ist seit Befund 1 erledigt.

---

## 5. Befund: Das Fenster darf breiter als der Bildschirm werden — belegt

`window-manager.ts:29-52`:

```
gridWidth = cols * 664 + CHATROOM_PANEL_WIDTH(280) + 20
width     = Math.min(gridWidth, screenWidth)
minWidth  = gridWidth            // ← ungeklammert
```

`minWidth` gewinnt in Electron gegen die Konstruktorbreite. **Das `Math.min` ist damit
wirkungslos**: sobald `gridWidth > screenWidth`, zieht Electron die Breite wieder auf
`gridWidth` hoch. Bei drei Spalten sind das 2292 px Mindestbreite. Dazu kommt
`will-resize` → `preventDefault()` (Zeile 78): der Nutzer kann es nicht korrigieren.
`.session-grid-area { overflow: auto }` (`grid.css:10`) fängt den Überlauf mit Scrollbalken
statt mit einem Fehler, und `gridTemplateColumns: repeat(cols, minmax(640px, 1fr))`
(`grid-types.ts:289`) hält die Spalten auf 640 px — die rechte Spalte landet also ausserhalb
des Bildschirms oder hinter einem Scrollbalken.

Das ist die Familie der offenen Bugreports `BUG-2026-04-22-HEIGHT-REGRESSION`,
`BUG-2026-04-22-Q88ZHP`, `BUG-2026-04-23-WVDTTM` und `BUG-2026-04-25-HC5EX5` — dreimal
dieselbe Beschwerde, mit „glaub ich schon gesagt" quittiert.

**Behoben am 2026-10-01**, gegen die ursprüngliche Einschätzung. Der Einzeiler steht jetzt
dort. Begründung für die Kehrtwende: ein Fenster, das weder auf den Bildschirm passt noch
sich anfassen lässt (`will-resize` → `preventDefault`), ist kein gleichwertiger Tausch gegen
einen Scrollbalken — es ist schlechter. **Offen bleibt die eigentliche Produktfrage:** ob
statt des Fensters die 640 px Spaltenminimum nachgeben sollen. Welche Hälfte nachgibt — Spalten
unter 640 px oder Fenster über Bildschirmbreite — ist eine Produktentscheidung und keine,
die aus dem Code folgt. Für eine Zelle unter 640 px spricht, dass ein nicht sichtbares
Terminal schlechter ist als ein schmales.

Eine IntersectionObserver-Folge davon: eine aus dem Viewport gescrollte Zelle
(`threshold: 0.1`, `useTerminal.ts:359`) bekommt keinen Fit mehr und wird von xterm selbst
pausiert (`RenderService._handleIntersectionChange`). Beim Zurückscrollen holt der
Doppel-Fit das nach — das ist der Grund, warum es dort steht.

---

## 6. Befund: Acht Sekunden erzwungenes Scrollen nach unten — belegt

`useTerminal.ts:371-378` schreibt nach jedem Mount **200 ms lang im Takt, über 8 Sekunden**
ein leeres `term.write('')` mit `term.scrollToBottom()` im Callback. Dazu drei `nudge()`
nach `reportReady` bei 400/900/1500 ms (Zeilen 314-317). In diesen acht Sekunden kann der
Nutzer nicht hochscrollen: jeder Versuch wird innerhalb von 200 ms zurückgeholt. Die Absicht
steht daneben und ist nachvollziehbar (die TUI-Startsequenz schiebt den Viewport in den
Scrollback). Der Preis ist, dass es nicht aufhört, wenn der Nutzer eingreift — ein
`wasAtBottom`-Test wie in `fitAndSync` (Zeile 160) fehlt hier.

**Behoben am 2026-10-01.** `userScrolledUp()` prüft vor jedem erzwungenen Scrollen, ob der
Nutzer selbst hochgescrollt hat — dieselbe Prüfung, die `fitAndSync` zweimal benutzt, jetzt
als Funktion. Scrollt er hoch, **endet** das Nachschieben (`clearInterval`), es setzt nicht
nur einen Takt aus: ein übersprungener Takt hätte ihn 200 ms später wieder zurückgeholt.
Die Absicht bleibt erhalten — solange niemand eingreift, fängt es die TUI-Startsequenz
weiterhin ab.

---

## 7. Befund: 15 px Rand rechts, die es nicht gibt — belegt

`FitAddon.proposeDimensions` zieht `core.viewport.scrollBarWidth` von der verfügbaren
Breite ab. `Viewport` ermittelt den Wert als `_viewportElement.offsetWidth -
_scrollArea.offsetWidth` **oder** `FALLBACK_SCROLL_BAR_WIDTH = 15`, wenn das 0 ergibt
(`Viewport.ts:15, 68`). Auf macOS mit Overlay-Scrollbars ist es immer 0, also immer 15.
Das Terminal ist dadurch dauerhaft etwa eine bis zwei Spalten schmaler als der Pane, und
rechts bleibt ein leerer Streifen (plus die 4 px aus `.cell-terminal`, `grid.css:179`).
Kein Fehler im Mux, eine Eigenschaft von xterm — aber es ist die Erklärung, falls jemand
„der Text geht nicht bis an den Rand" meldet.

---

## 8. Der 150-ms-Debounce und der Min-Size-Guard: was sie wirklich tun

Beide standen unter Verdacht. Nach Lesung sind sie es nicht.

- **`FIT_DEBOUNCE_MS = 150`** (Zeile 70) koaleszt ResizeObserver-Stürme. Er sitzt
  **nur** im Pfad nach `reportReady`; davor läuft `immediateFit()` ungebremst
  (Zeilen 335-342). Der Wert liegt gleichauf mit `--transition-base: 0.15s`
  (`theme.css:88`) — während einer CSS-Transition feuert der ResizeObserver
  fortlaufend, der Timer wird jedes Mal neu gesetzt, und der Fit kommt 150 ms **nach**
  dem letzten Event. Das ist richtig gerechnet. Dass das Terminal während der Transition
  in der alten Größe gezeichnet bleibt, ist der Preis, nicht der Fehler.
- **`MIN_FIT_DIMENSION = 50`** (Zeile 67) überspringt Fits auf Containern unter 50 px —
  der Fall „Pane ist beim Start noch 0 px breit". Ein übersprungener Fit ist nicht
  endgültig: der ResizeObserver feuert erneut, sobald sich die Größe ändert, und der
  IntersectionObserver zusätzlich beim Sichtbarwerden. Ein Terminal bleibt dadurch nicht
  in falscher Größe stehen. **Einzige Nebenwirkung:** solange kein Fit gelingt, feuert
  `reportReady` nicht, und ein `autoLaunch` wartet — bis der 4-Sekunden-Rückfall in
  `setPendingLaunch` (`session-manager.ts:795-805`) ihn ohnehin abschickt. Dann startet die
  TUI bei 80×24. Nicht beobachtet, aber der Pfad existiert.

**Der aktive Renderer ist WebGL**, mit Canvas als Rückfall (Zeilen 246-266). Die
Entsorgung ist in Ordnung: der `AddonManager` ist am Terminal registriert, `term.dispose()`
entsorgt die Addons, und der WebGL-Addon setzt dabei den DOM-Renderer zurück. Ein
Kontextverlust wird abgefangen und auf Canvas umgeschaltet, mit `refresh()` danach gegen
das schwarze Bild. Ein nicht entsorgter Renderer ist hier **nicht** die Ursache — was aber
zählt: jeder vermeidbare Neubau (Befund 1, Befund 4) erzeugt einen neuen WebGL-Kontext,
und Chromium hält nur eine begrenzte Zahl gleichzeitig.

---

## 9. Was nicht erklärt ist

**9.1 Die eine `dimensions`-Meldung im Normalfall.** Die vier aus `mux-start9.log` erklärt
Befund 1. Die eine, die in allen anderen Läufen steht, erklärt er nicht: wenn das Theme
schon `nord` ist, bevor die Zellen mounten, gibt es dort keinen Dispose. Es bleibt also
mindestens eine zweite Quelle. Kandidaten, nicht geprüft: ein Terminal im abgetrennten
Fenster oder im Sidebar-Fenster; der Übergang `LauncherCell → SessionCell` in einem Slot,
bei dem `sessions` vor `grid.slots` da war; ein `restoreGrid`, das die Slots in zwei
Schritten normalisiert. **Nachweis:** mit dem Logfix aus 2.4 einmal starten und
`sourceId:line` gegen `dist/renderer/assets/*.js` auflösen.

**9.2 Welcher xterm-Callback genau wirft.** Dass es ein Zugriff nach dem Dispose über
`RenderService.dimensions` ist, ist belegt. Welcher der nicht abgeräumten Timer ihn
auslöst, ist es nicht. `Viewport.ts:84` und `:100` sind die nächstliegenden, aber beide
nehmen bei ihrem *ersten* Lauf den Zweig in Zeile 148 und erreichen den Getter nicht —
sie müssten also auf einen vorher schon synchron gelaufenen `syncScrollArea` treffen. Das
ist konstruierbar, nicht nachgewiesen.

**9.3 Ob der Fehler überhaupt etwas verfälscht.** Die Vermutung im Auftrag war, dass
Darstellungsmacken und `dimensions`-Fehler dieselbe Ursache haben. Das Ergebnis ist ein
**Zwischending**: dieselbe *Auslöserkette* (der vermeidbare Neubau), aber nicht dieselbe
*Wirkung*. Der Wurf passiert an einem Terminal, das bereits entsorgt ist — er kann nichts
mehr falsch zeichnen. Falsch gezeichnet wird am **Nachfolger**, und zwar nicht wegen des
Fehlers, sondern wegen des Neubaus mit `capture-pane`-Rekonstruktion. Der Fehler ist der
Zeuge, nicht der Täter. Das ist der eine Punkt, an dem die Ausgangsvermutung nicht hält.

**9.4 Nicht reproduziert, weil die App nicht angefasst werden durfte.**
Grid-Resize, Zellen-Merge, Focus Mode, Sidebar auf/zu, Themewechsel und
abgetrenntes Fenster sind **im Code** durchgegangen, nicht am laufenden Programm beobachtet.
Für Befund 3 und Befund 4 fehlt je eine Messung: wie lange `resize-window` +
`resize-pane` wirklich brauchen (gegen die 200 ms), und ob der Wiederaufbau nach Focus Mode
sichtbar Inhalt verliert oder nur flackert.

**9.5 Fenstergröße ändern** ist kein Fehlerbild, sondern unmöglich: `will-resize` wird
abgelehnt (`window-manager.ts:78`). Der Pfad „Nutzer zieht das Fenster größer" existiert
nicht; es gibt nur `fitGrid` aus dem Main.

---

## 10. Was behoben ist

| Was | Wie | Belegt durch |
|---|---|---|
| Themewechsel baut kein Terminal mehr neu | `theme` aus dem Dependency-Array, in ein Ref; Kommentar nennt den Grund | Befund 1 — Dependency-Array, `ui.theme = nord` vs. `DEFAULT_THEME`, MutationObserver deckt alle drei Themewege ab |
| Renderer-Fehler nennen ihre Herkunft | `sourceId:line` im Weiterleiter für Level `error` | Befund 2.4 — die Parameter kamen an und wurden verworfen |
| Umgebrochene Zeilen bleiben eine Zeile | `capture-pane -J` | Befund 3 — 95 Zeichen in 40 Spalten: 40+40+15 ohne `-J`, 95 mit. Gegen echtes tmux in `test/main/capture-pane-join.test.ts` |
| Erzwungenes Scrollen endet beim Eingriff | `userScrolledUp()` beendet das Intervall, statt es auszusetzen | Befund 6 — ein ausgesetzter Tick hätte beim nächsten wieder zugegriffen |
| Das Fenster bleibt auf dem Bildschirm | `minWidth: Math.min(gridWidth, screenWidth)`, Grid scrollt horizontal | Befund 5 — `minWidth` schlug die Konstruktorbreite und machte das `Math.min` darüber wirkungslos |
| **Verdeckte Terminals leben weiter** | `hiddenSlotDisposition` in `shared/grid-types.ts`; eine verdeckte **Session**-Zelle rendert mit `display: none` statt `null` zurückzugeben | Befund 4 — siehe unten |
| **Ein Resize kostet den Scrollback nicht mehr** | `needsReflowResync` + `RESYNC_SCROLLBACK_LINES` in `shared/terminal-resync.ts`: kein Resync bei reiner Höhenänderung, und wenn er läuft, mit Historie | Befund 3.2 — siehe unten |

### Zu Befund 4, im Detail

Der Unterschied ist "unsichtbar" gegen "tot". Verdeckt wird ein Slot von einem `rowSpan`
darüber oder von der Focus-Mode-Expansion; `display: none` nimmt ihn aus dem Grid-Fluss,
ohne die Zelle abzureißen. Das Terminal bleibt samt Scrollback stehen, und beim
Wiederauftauchen gibt es kein `capture-pane`-Rekonstrukt mehr — womit auch die Folgen aus
Befund 3 und das Dispose-Fenster aus Befund 2 für diesen Weg entfallen.

Drei Dinge, die dabei geprüft wurden und nicht offensichtlich sind:

1. **Ein `fit()` auf einer Fläche von null läuft nicht.** Der Min-Size-Guard in
   `useTerminal` (`MIN_FIT_DIMENSION = 50`) greift, bevor `fitAddon.fit()` dran ist. Ohne
   ihn wäre die Zelle beim Verstecken auf eine Zeile geschrumpft — und tmux mit ihr.
2. **Keine doppelten Keys.** Der Key in `SessionGrid` ist `slot.sessionId`. Eine verdeckte
   Session steht weiter in der Sidebar als Hintergrund-Session (`app.tsx:363`, bewusst so:
   sonst wäre sie im Focus Mode nirgends erreichbar). Wird sie von dort in eine sichtbare
   Zelle geholt, räumen `handlePlacementSelect` und `handleDropSession` den alten Slot
   **vorher** — ein Verschieben, kein zweiter Eintrag.
3. **Nur die Session-Zelle bleibt.** Ein Launcher wird neu gebaut wie er war, eine
   Notes-Zelle schreibt in eine Datei. Ein unsichtbarer Knoten ohne etwas zu verlieren
   wäre Ballast.

**Nicht angefasst**, mit Begründung oben: der Resync-Pfad in seinen beiden anderen Teilen
(Befund 3 — der Vollbild-Schnappschuss gegen den cursor-relativen Livestream und die
ungesicherte Reihenfolge gegen tmux; beides braucht die Unterscheidung „TUI im Alternate
Screen vs. gewöhnliche Shell" und damit eine Messung am laufenden Programm) und der 15-px-Rand
(Befund 7).

**Nachprüfen:** 2249 Tests grün (467 Suiten), beide Typechecks null Fehler, `npx eslint` auf
den geänderten Dateien ohne neue Probleme. Dass der `dimensions`-Fehler weg ist, ist damit
**nicht** belegt — das zeigt erst der nächste Start, und zwar daran, dass in einem Lauf mit
vier wiederhergestellten Sessions keine vier Meldungen mehr stehen. Dass ein verdecktes
Terminal seinen Scrollback behält, ist **auf der Logikseite** belegt (sechs Tests zu
`hiddenSlotDisposition`) und an der laufenden App noch nicht: dazu gehört Focus Mode an und
aus mit sichtbarem Scrollback davor und danach.
