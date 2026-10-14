# Spec: opencode 2.0 — Plugins und Adapter portieren

**Datum:** 2026-10-14
**Status:** umgesetzt im Branch `opencode-2` (Tests grün); Abnahme in der TUI (§7) offen
**Gemessen an:** opencode **2.0.29** (macOS, `/opt/homebrew/bin/opencode`), 2026-10-14
**Vorgänger:** `docs/superpowers/handovers/2026-10-01-drei-cli-adapter.md` (Messungen an 1.18.34/35)
**Branch/Worktree:** `opencode-2` in `.claude/worktrees/opencode-2`

> Die Messungen unten gelten für genau diese Version. Wer hier weiterarbeitet, misst nach,
> statt sie zu glauben — dieselbe Regel wie im Vorgänger.

## 1. Ausgangslage

opencode 2 hat drei absichtliche Brüche: die **Plugin-API**, die **Server-API** und die
**Client-Konfiguration** (`cli.json`). Alles andere (Config-Felder, `AGENTS.md`, Agenten,
Skills) soll kompatibel bleiben. V1 und V2 werden nicht nebeneinander installiert.

Der Mux erzeugt drei Plugins, alle in der V1-Form (`export default async () => ({ … })`):

| Datei | Erzeuger | Zweck |
|---|---|---|
| `cipher-mux-usage.js` | `monitoring/opencode-usage-plugin.ts` | Context-Usage → `<statusLineDir>/<muxSessionId>.json` |
| `cipher-mux-role-boundary.js` | `session/entity-boundaries.ts` | Rollengrenze (`tool.execute.before` wirft) |
| `cipher-mux-idle.js` | `local-factory/worker-done.ts` | Idle-Signal für den lokalen Worker |

**Folgen ohne Port, beide still:** Der Dienst weist V1-Plugins ab; sichtbar ist das nur als
`level=WARN … failed to load plugin` (nur mit `--print-logs`, und im Server-Log). Die Session
startet und sieht gesund aus — aber ohne Rollengrenze, ohne Usage, ohne Idle-Signal.

## 2. Messergebnisse (2.0.29)

### 2.1 Plugins laden

1. **V1-Plugin wird abgewiesen:** „Plugin must export a default definition with an id and an
   effect or setup function."
2. **V2-Plugin als reines Objekt** `export default { id, async setup(ctx) { … } }` lädt
   **ohne** `@opencode/plugin`-Import. Die generierten Plugins bleiben abhängigkeitsfrei.
3. **`.opencode/plugins/` (Plural) wird auto-entdeckt** (Log: `loading plugin id=…/.opencode/plugins/…`).
   Die Doku nennt den Plural als bevorzugt; `.opencode/plugin/` (Singular) wird laut Doku
   ebenfalls gescannt, war aber nicht Gegenstand der Messung.
4. `ctx` trägt: `app, location, options, agent, aisdk, command, credential, event,
   experimental, generate, model, provider, integration, mcp, permission, plugin, reference,
   rpc, skill, storage, tool, vcs, websearch, worktree, session, shell`.

### 2.2 Dienst und Prozessgrenze (die Messung, die das Design ändert)

V2-Plugins laufen im **geteilten Hintergrunddienst**, nicht im TUI-Prozess.

| Modus | `process.env.CIPHER_MUX_SESSION_ID` im Plugin | Events |
|---|---|---|
| Geteilter Dienst, zwei Läufe in zwei Verzeichnissen mit je eigener Variable | **ID der Session, die den Dienst gestartet hat** (hier: projekt-a) — beide Variablen kamen nicht an | beide Plugin-Instanzen sehen die Events **beider** Verzeichnisse |
| `--standalone` | **korrekt** (Wert des startenden Prozesses) | nur eigene |

`--standalone` startet `opencode serve --stdio` als Kindprozess der CLI (Log:
`spawning process … role=cli`); die Umgebung wird geerbt.

Nicht jedes Event trägt `location`: `session.usage.updated` hat nur `sessionID`.

### 2.3 Rollengrenze

1. `ctx.tool.hook("execute.before", cb)` erhält `{ tool, sessionID, agent, messageID, id, input }`.
2. **Ein Wurf im Callback verhindert die Ausführung.** Gemessen: Datei nicht angelegt,
   `session.tool.failed` mit `executed: false`, die Session läuft weiter, der zweite Aufruf
   (erlaubter Pfad) im selben Zug läuft durch.
3. **`--auto` umgeht das nicht.**
4. Der Grund erreicht das Modell wörtlich, verpackt als
   `{"error":{"type":"unknown","message":"<REASON>"}}`.
5. **Das Pfadfeld heißt `path`,** nicht `filePath`: `write` = `{path, content}`,
   `edit` = `{path, oldString, newString}`. (Das Binary liest in seiner eigenen Pfadauflösung
   `path` zuerst und `filePath` als Rückfall.)
6. **Pfade kommen relativ.** `edit` erhielt `path: "t.txt"`. Eine Teilstring-Regel auf
   `/src/` trifft `src/x.ts` nicht — ohne Auflösen gegen `ctx.location.directory` (und
   Einklappen von `..`) ist das eine Lücke. Die V1-Grenze sah absolute Pfade.
7. **Tool-IDs:** `write`, `edit`, `patch` (V1: `apply_patch`; das Binary führt den Alias
   `apply_patch → patch`), außerdem `shell` (V1: `bash`), `read`, `glob`, `grep`, `question`,
   `skill`, `subagent`, `webfetch`, `websearch`.
8. **`patch` nimmt `{ patchText }`** — ein Text mit `*** Begin Patch` … `*** End Patch` und den
   Kopfzeilen `*** Add File: <pfad>`, `*** Update File: <pfad>`, `*** Delete File: <pfad>`,
   optional `*** Move to: <ziel>`. **Aus dem Binary gelesen, nicht an einem Aufruf gemessen:**
   das Testmodell bekam `patch` nicht angeboten.
9. Ein `patch` kann **mehrere Dateien** berühren. Die V1-Grenze (`output.args.filePath`) hat
   `apply_patch` vermutlich nie erfasst: ohne `filePath` kehrte sie früh zurück. *Vermutung
   zur V1-Seite, nicht nachgemessen.*

### 2.4 Usage

1. **`tokens` hat kein `total`.** Form: `{ input, output, reasoning, cache: { read, write } }`.
   `input` ist **ohne** den gecachten Anteil (V1: einschließlich).
2. **`session.step.ended`** trägt `{ sessionID, assistantMessageID, finish, rawFinish, cost,
   tokens }` und zählt **pro Schritt**. Fünf Schritte eines Laufs: `cache.read` 1536 → 8192 →
   8448 → 8704 → 8960, `input` 6758 → 383 → 264 → 313 → 439. Die Promptgröße des letzten
   Schritts ist `input + cache.read + cache.write` (Schritt 5: 439 + 8960 = 9399).
3. **Reasoning zählt zum Kontext.** Gemessen in der TUI: letzter Schritt `{ input 3282, output 223,
   reasoning 353, cache.read 9728 }`, angezeigt als „13.6K" — `3282 + 9728 + 223 + 353 = 13586`.
   Die Mux-Anzeige zählt `output + reasoning` als erzeugt, damit beide dieselbe Zahl nennen.
4. **`session.usage.updated`** (`{ sessionID, cost, tokens }`) ist **kumulativ** über die
   Session und kommt auch mitten im Schritt; die Summen passten nicht exakt zu den
   Schrittwerten (Differenz 64 Tokens). **Nicht als Kontextgröße verwendbar.**
5. **Das Modell steht nur in `session.step.started`** (`{ sessionID, assistantMessageID,
   agent, model: { id, providerID, variant }, started }`). Verknüpfung über `assistantMessageID`.
6. **`ctx.model.list()` liefert `{ location, data: [...] }`** (414 Einträge an dieser Installation),
   jeder mit `id`, `modelID`, `providerID`, `limit: { context, output, input? }`. Beispiel
   `opencode/big-pickle`: `context 200000`, `input 160000`. Damit ist das Fenster pro Modell
   abfragbar (D12).
7. `ctx.model.default()` liefert das **Standardmodell der Config**, nicht das Modell der
   laufenden Session.

### 2.5 Idle

1. Turn-Ende: `session.execution.started` → `session.execution.succeeded` (jeweils
   `{ sessionID }`). Im Binary zusätzlich `session.execution.failed` und
   `session.execution.interrupted`.
2. **`session.idle` kam weder im `opencode run`- noch im TUI-Lauf an**, steht aber als Eventname
   im Binary. **In der TUI** (§8) kamen `session.execution.started` und, am Zugende,
   `session.execution.succeeded` plus `session.step.ended`. (V1 sendete `session.idle` genau
   einmal am Zugende.) `session.idle` bleibt in der Liste (D5), ist aber ohne Messung nur Reserve.

### 2.6 CLI

| | Top-Level `opencode` | `opencode run` |
|---|---|---|
| `--auto` | ja | ja |
| `--continue`, `--session <id>` | ja | ja |
| `--standalone`, `--server` | ja | ja |
| `--model` | **nein** | ja (`provider/model#variant`) |
| `--fork` | **nein** | ja |
| `--agent` | nein | ja |
| `--pure` | **entfällt** | — |

- **Unbekannte Flags werden nicht gemeldet:** `--bogus-flag`, `--fork`, `--model x/y` und
  `--pure` am Top-Level drucken die Hilfe und beenden sich. Der heutige Adapter würde mit
  Modell-Override oder Fork im Pane nur die Hilfe zeigen.
- Positionsargument `[directory]` besteht weiter (bleibt ungenutzt, siehe Adapter-Kommentar 3).
- `opencode session` kennt `list`, `delete`, `export`, `import` — **kein** `fork`.
- Fork gibt es als API: `POST /api/session/{id}/fork` (Body `{ before?: MessageID | null }`),
  Operation `session.fork`.
- `OPENCODE_CONFIG_CONTENT` steht im Binary, erscheint aber in `opencode debug config`
  **nicht** als Quelle. Nicht verwenden.

### 2.7 Konfiguration und Anweisungen

- Die V1-Formen (`mcp.<name>`, `provider`, `plugin`, `model`) werden **still normalisiert**;
  `opencode debug config` zeigt die Normalform (`providers`, `capabilities`, `model` als
  `{providerID, model}`). Die laufende projekt-b-Session selbst nutzt die V1-`opencode.json`
  samt `mcp.cipher-mux`, und die Mux-Werkzeuge stehen ihr zur Verfügung.
- **`CLAUDE.md` wird nicht mehr als Rückfall gelesen** (Migrationsleitfaden: „V2 currently only
  discovers `AGENTS.md`"). Das widerspricht der V1-Messung vom 2026-10-09 und dem heutigen
  `instructionsTarget()`.
- **Das gilt auch für Rollen.** Der Entity-Pfad schreibt die Preset-Anweisung als `CLAUDE.md` ins
  Run-Verzeichnis (`runs/<ws>/<rolle>/`). Unter 1.x wurde sie als Rückfall gelesen, unter 2.x
  gar nicht — Preset, Persona und Global Rules einer Rolle wären still weg. Die vorhandenen
  Run-Verzeichnisse mit `.codex/` haben ebenfalls keine `AGENTS.md`; ob Codex-Rollen davon
  betroffen waren, ist nicht gemessen (D15).
- Unbekannte/ungenutzte Felder bleiben harmlos.

## 3. Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | **Nur V2.** Kein Dual-Export `{…Plugin.define(), server()}`. | V1 und V2 laufen nicht nebeneinander; die Plugins bleiben einfach. |
| D2 | **Rollengrenze bleibt ein Hook** (`ctx.tool.hook("execute.before")`), nicht `ctx.permission.rules`. | 1:1 zum gemessenen V1-Verhalten; Teilstring-Regel statt Glob; `--auto`-Verhalten der Regeln ungemessen. |
| D3 | **`--standalone` im Startkommando.** | Ein Prozess = eine Mux-Session: die Env-Variable stimmt, es gibt keine fremden Events. Preis: ein Serverprozess pro Session. |
| D4 | **Usage aus `step.started` + `step.ended`**, nicht aus `usage.updated`. | §2.4. „Gemessen" heißt: ein `step.ended` mit `tokens` liegt vor. |
| D5 | **Idle aus `session.execution.succeeded|failed|interrupted` und `session.idle`.** | §2.5. Beide Wege, weil die TUI-Quelle ungemessen ist. |
| D6 | **Grenze prüft `input.path` (Rückfall `filePath`) und bei `patch` jeden Pfad aus `patchText`** (`Add/Update/Delete File`, `Move to`). | §2.3. Ein 1:1-Port würde nie matchen. |
| D7 | **Projektanweisungen immer in `AGENTS.md`**, wie bei Codex: fehlt sie und liegt eine `CLAUDE.md` daneben, legt der Mux eine `AGENTS.md` **mit Verweis** auf die `CLAUDE.md` an (`pointerTo`). | §2.7. Eine nur geschriebene `CLAUDE.md` wird nicht gelesen; ohne Verweis ginge dem Projekt seine eigentliche Anweisung verloren. (Mein erster Entwurf sagte „immer `AGENTS.md`" ohne Verweis.) |
| D8 | **Plugins nach `.opencode/plugins/`, ohne Eintrag in der Config.** Eigene Dateien in `.opencode/plugin/` und eigene Einträge in `plugin` **und** `plugins` (String oder `{package}`) werden entfernt; fremde bleiben. | Auto-Entdeckung ist gemessen; ein Alteintrag auf eine V1-Datei erzeugte bei jedem Start eine WARN-Zeile, ein altes Grenzen-Plugin sähe aus, als schütze es. |
| D9 | **Config-Formen bleiben V1** (`mcp.<name>`, `provider`, `model`). | Still normalisiert, gemessen; keine unnötige Umstellung. |
| D10 | **`--model` fällt weg; ein Rollen-/Launcher-Modell wird als `model` in die `opencode.json` geschrieben.** `AdapterContext.model` (optional) trägt es; `SessionManager.start()` und `startEntity()` reichen es durch. **Marker** `.opencode/cipher-mux-model.json` `{ written, replaced }`: beim nächsten Start wird der Mux-Eintrag zurückgenommen (das `model` des Projekts kommt wieder), ein vom Nutzer inzwischen geändertes `model` bleibt. Das Profil des lokalen Workers schlägt den Override. | §2.6. Ein String-Feld verrät nicht, wer es gesetzt hat. Ohne Marker bliebe ein Rollen-Override für immer stehen oder das Projekt-`model` ginge verloren — und eine Ordner-Session läuft im Projekt des Nutzers. `OPENCODE_CONFIG_CONTENT` ist keine Quelle (§2.6). |
| D11 | **Fork: sichtbar verweigert — weder Wurf noch stilles Weiterführen.** Der Adapter liefert `echo opencode Fork ist in opencode 2 nicht verfuegbar` statt `opencode …`. Folgearbeit: Fork über `POST /api/session/{id}/fork`, dann `opencode --standalone --session <neu>`. | §2.6. **Korrektur gegenüber meinem ersten Entwurf („ein klarer Fehler"):** `SessionManager.start()` ruft `buildLaunchCommand` erst nach `tmux.createSession` und `sessions.set` — ein Wurf hinterließe eine registrierte, leere Session. Ein stilles `--continue` setzte die Quelle fort. |
| D12 | **Kontextfenster aus `ctx.model.list()` (`limit.context`) für das Modell der Session**, Rückfall `OPENCODE_FALLBACK_CONTEXT_WINDOW`. Der Profilwert des lokalen Workers (`contextWindow`) behält Vorrang. | §2.4. Aus einer Schätzung wird, wo möglich, ein gemessener Wert. |
| D13 | `sub-agents` bleibt `false` (ungemessen). | Gate sagt die Wahrheit (Vorgänger §5.3). |
| D14 | **Grenze: Pfade werden gegen `ctx.location.directory` aufgelöst, `..` eingeklappt; geprüft wird auch der unaufgelöste Pfad.** Ein Edit-Werkzeug ohne lesbaren Pfad wird abgelehnt (fail-closed). | §2.3 Punkt 6. Sonst trifft `/src/` den Pfad `src/x.ts` nicht. |
| D15 | **Rollen bekommen die Anweisungsdatei ihrer CLI:** `ensureInstructionsFile(runDir, adapter)` (aus `folder-session.ts`, vorher die private `prepareInstructionsFile`) läuft jetzt auch im Entity-Pfad (`startEntity`), nicht nur beim Ordner-Start. | §2.7. Ohne das liefe eine opencode-2-Rolle ohne ihr Preset. **Wirkt auf alle Adapter, die `AGENTS.md` ziehen — also auch Codex;** das ist dort nicht gemessen und sollte beim nächsten Codex-Lauf bestätigt werden. |
| D16 | **Usage schreibt die Datei schon bei `step.started`** (Session-ID und Modell, ohne `context_window`) und behält bei einem neuen Schritt die letzte Messung. | Keep Working braucht die ID vor der ersten Messung (§4). |

## 4. Neue Plugin-Formen

Alle drei bleiben **generierte, abhängigkeitsfreie ESM-Dateien**, die ein Objekt exportieren.

```js
export default {
  id: 'cipher-mux.role-boundary',      // stabil; Speicher und Diagnose hängen daran
  async setup(ctx) {
    await ctx.tool.hook('execute.before', (event) => { … throw new Error(REASON) })
  },
}
```

- **Grenze:** `EDIT_TOOLS = write, edit, patch`. Pfade: `event.input.path ?? event.input.filePath`;
  bei `patch` zusätzlich alle Pfade aus `event.input.patchText`. Weiter Teilstring-Abgleich
  gegen `DENY` und die Datei `denyListFile`. `read` bleibt frei (Regel unverändert).
  **Fail-closed:** Ein Edit-Werkzeug (`write`/`edit`/`patch`) ohne lesbaren Pfad wird mit
  einem eigenen Grund („Pfad nicht lesbar") abgelehnt. Die V1-Grenze ließ so etwas durch;
  genau das hätte ein Feldnamenwechsel wie `filePath` → `path` unbemerkt zur Lücke gemacht.
- **Usage:** `ctx.event.subscribe()` in `setup`, Abbruch über das zurückgegebene Cleanup.
  `step.started` merkt sich `assistantMessageID → { id, providerID }` und schreibt die Datei
  mit `session_id` und `model.id` (D16); `step.ended` ergänzt `context_window.*` im bekannten
  Format. `used = input + cache.read + cache.write + output`; `total_input_tokens` ist der
  ganze Prompt, `current_usage.input_tokens` der ungecachte Teil. Das Fenster kommt mit
  `lookupModelLimit` aus `ctx.model.list()` (Anbieter + Modell), sonst aus dem eingebackenen
  Wert; der Profilwert des lokalen Workers hat Vorrang. Ohne `CIPHER_MUX_SESSION_ID` wird
  nichts geschrieben. Jedes Ereignis läuft in eigenem `try/catch`: ein Wurf beendete sonst
  die Schleife. Der Schreiber filtert nicht auf die eigene Session — unter `--standalone` gibt
  es nur eine.
- **Idle:** wie bisher, mit den Events aus D5.

## 5. Adapter

- `buildLaunchCommand`: `--standalone` immer; `--auto` bei skipPermissions; `--session <id>` /
  `--continue`; **kein** `--model`, `--fork`, `--pure`. Fork → `echo`-Zeile (D11). Ein Test
  hält fest, dass jedes Flag im Startkommando in der Liste der am Top-Level gemessenen steht
  (`--standalone --auto --continue --session`) — gegen das stille „Hilfe drucken und beenden".
- `postLaunchInjection`: frühere Mux-Eintragung in `model` zurücknehmen (Marker), mischen
  (`mergeOpenCodeConfig(existing, entry, local)` — ohne Plugin-Parameter), danach `model`
  setzen (nicht beim lokalen Worker), Marker schreiben oder löschen. Plugins nach
  `.opencode/plugins/`; V1-Altlasten räumen (`removeLegacyPlugins`).
- `attachStatusHook`: räumt ebenfalls die V1-Altlasten und legt das Usage-Plugin an.
- `instructionsTarget`: wie Codex (D7). `ensureInstructionsFile` im Entity-Pfad (D15).
- `getCapabilities`: unverändert, bis die Abnahme etwas anderes zeigt.
- Prompt-Fragmente: Startzeile `opencode --standalone --auto`; kein `--pure`/`--model`/`--fork`;
  Anweisungen nur aus `AGENTS.md`; Plugins aus `.opencode/plugins/`.
- Texte „1.18.x" in `companion-info-popup.ts`, `companion-ref.ts`, `companion-guides.ts`,
  `README.md` → 2.0.29; README nennt die Folgen (`--standalone`, `AGENTS.md`, kein `--model`/`--fork`).

## 6. Tests

**Test-first, Verhalten statt Implementierung.** Die Plugins sind Strings; getestet wird, indem
das erzeugte Modul geladen und mit einem Fake-`ctx` ausgeführt wird (Hook-Registrierung,
Aufruf mit Ereignissen, Dateiausgabe) — nicht per Textvergleich.

- Grenze: verbotener Pfad bei `write`/`edit` wirft mit dem Grund; erlaubter geht durch;
  `read` geht durch; `patch` mit mehreren Dateien, eine verboten → wirft; `Move to` auf
  verbotenen Pfad → wirft; `filePath`-Rückfall; Edit ohne Pfad wirft.
- Usage: `step.ended` ohne vorheriges `step.started` → Datei ohne Modell, mit Prozent;
  zwei Schritte → die Datei trägt den **letzten**; ohne Env-Variable keine Datei;
  `usage.updated` allein schreibt **nichts**.
- Idle: jedes der vier Ereignisse schreibt das Signal; ein fremdes nicht.
- Adapter: Startkommando enthält `--standalone`, nie `--model`/`--fork`/`--pure`;
  Fork wirft; `instructionsTarget` ohne und mit `AGENTS.md`; `mergeOpenCodeConfig` entfernt
  V1-Alteinträge und behält fremde; Altdateien werden gelöscht.

## 7. Abnahme (gegen die echte CLI, in der TUI) — Ergebnis in §8

Das Feuern nachweisen, nicht die Datei schreiben (Vorgänger §1). Jeweils im tmux-Pane unter
`--standalone`, nicht nur mit `opencode run`:

1. Rolle mit Grenze: verbotener Pfad entsteht nicht, erlaubter schon, Session läuft weiter.
2. **Zwei opencode-Mux-Sessions gleichzeitig:** jede schreibt in **ihre** Usage-Datei.
3. Context-Prozent im Mux-Fenster stimmt mit `input + cache` des letzten Schritts überein.
4. Idle-Signal erscheint am Zugende (TUI-Quelle klären: `session.idle` oder `execution.*`).
5. Restore mit `--session <id>`.
6. Startlog der Session enthält **kein** `failed to load plugin`.
7. **Rollen-Modell greift:** eine Rolle mit Modell-Override startet in der TUI mit diesem Modell
   (der Mux schreibt `model` in die Config; ob die TUI es dem zuletzt benutzten Modell
   vorzieht, ist ungemessen). Zweiter Start ohne Override: `model` des Projekts wieder da.
8. **Rolle kennt ihr Preset:** eine opencode-Rolle beantwortet eine Frage, die nur in ihrer
   `CLAUDE.md`/Preset steht — über den Verweis in der neuen `AGENTS.md`.
9. **Rollengrenze mit relativem Pfad** (`src/x.ts`, nicht nur `/p/src/x.ts`) und, wenn ein
   Modell `patch` angeboten bekommt, mit einem mehrteiligen `patch`.
10. Fork im Launcher: die Zeile erscheint im Pane, es entsteht keine halbe Session.

## 8. Abnahmeergebnis (2026-10-14, opencode 2.0.29, TUI unter `--standalone`)

Zwei Sessions parallel in einem eigenen tmux-Server, Verzeichnisse mit dem echten Adapter-Code
erzeugt (`postLaunchInjection`, `ensureInstructionsFile`), Modell `opencode/big-pickle` über den
Override. Umgebung: je eigene `CIPHER_MUX_SESSION_ID`.

| # | Kriterium | Ergebnis |
|---|---|---|
| 1 | Grenze (Rolle `workshop`, **relativer** Pfad `src/no.ts`) | **bestanden.** `docs/ok.md` entstand, `src/` nicht; der Grund kam wörtlich beim Modell an, es umging die Grenze nicht. |
| 2 | Zwei Sessions parallel, getrennte Usage-Dateien | **bestanden.** `ACCEPT-A.json` und `ACCEPT-B.json` trugen je die eigene opencode-Session-ID. |
| 3 | Context-Prozent = TUI | **nach Korrektur bestanden.** Erste Fassung zählte kein Reasoning (13,2K statt 13,6K) → siehe §2.4.3. B stimmte von Anfang an (8.575). Fenster 200000 kam aus `ctx.model.list()`. |
| 4 | Idle-Signal | **bestanden** über `session.execution.succeeded` (kein `session.idle`, §2.5). |
| 5 | Restore mit `--session <id>` | **bestanden.** Frühere Unterhaltung da, Session-ID unverändert, Usage-Datei dieselbe. |
| 6 | Kein `failed to load plugin` | **bestanden** (kein Treffer im Server-Log für die Abnahmeverzeichnisse). |
| 7 | Rollen-Modell greift | **bestanden.** Beide TUIs zeigten „Big Pickle", das Standardmodell der Config ist ein anderes (OpenRouter). Wiederherstellung des Projekt-`model` nur im Unit-Test belegt. |
| 8 | Rolle kennt ihr Preset (über `AGENTS.md`-Verweis) | **bestanden.** Das Codewort stand nur in der `CLAUDE.md`; die Session nannte es nach einem Lesevorgang. |
| 9 | Grenze mit mehrteiligem `patch` | **nicht gemessen** — das Testmodell bekam `patch` nicht angeboten. |
| 10 | Fork im Launcher | **nicht gemessen** (nur Unit-Test; echter Start über den Mux steht aus). |

Nebenbefund: Ein `-m` am Top-Level beendete eine Session sofort (Hilfe gedruckt) — dieselbe
stille Falle wie bei `--model`/`--fork`, hier unfreiwillig bestätigt.

## 9. Risiken und offene Punkte

- **Kind-Sessions (Sub-Agents):** Ihre `step.ended` tragen eine andere `sessionID` und könnten
  die Anzeige der Hauptsession überschreiben. `sub-agents` ist ungemessen; Verhalten klären,
  bevor das Gate je `true` wird.
- **`patch`-Eingabe** ist nur aus dem Binary gelesen (§8 Nr. 9) — mit einem Modell messen, das
  `patch` angeboten bekommt. Bis dahin hält fail-closed die Grenze: ein `patch` ohne lesbare
  `patchText`-Pfade wird abgelehnt.
- **Codex und D15:** `ensureInstructionsFile` läuft jetzt für **alle** Adapter im Entity-Pfad. Für
  Codex-Rollen legt der Mux damit erstmals eine `AGENTS.md` mit Verweis an. Das ist dort ungemessen
  und beim nächsten Codex-Lauf zu bestätigen — es ist die wahrscheinliche Erklärung dafür, dass
  die vorhandenen Codex-Run-Verzeichnisse keine `AGENTS.md` haben.
- **Fork** (D11) bleibt offen, bis die API-Variante gemessen ist (läuft ein Fork gegen die
  Datenbank einer `--standalone`-Session? ungemessen).
- **Wiederherstellung des Projekt-`model`** (D10) ist nur im Unit-Test belegt, nicht in der TUI.
- **Laufende Sessions** (heute z. B. projekt-a und projekt-b) tragen die V1-Plugins in
  `.opencode/plugin/` und den V1-Eintrag in `opencode.json` bis zum nächsten Start mit dem neuen
  Mux; dann werden sie geräumt. Der geteilte Hintergrunddienst läuft weiter, wird aber nicht mehr
  benutzt.
- **Lokaler Worker / Local Cyber Factory** hängt an `cipher-mux-idle.js` und am Anbieterblock
  (V1-Form `provider`, still normalisiert) in der `opencode.json`. Der Anbieterblock ist **nicht**
  an einem echten lokalen Endpunkt gemessen. Die dortige Spec
  (`2026-10-09-local-cyber-factory-design.md` §10a) nennt `session.idle` aus 1.18.35 und ist
  danach zu ergänzen.
- **Ausgabelimit-Messung der Factory (§10a Nr. 2)** wurde an 1.18.35 gemacht und gilt für 2.x
  ungeprüft.
- `ctx.model.list()` kennt für einen selbst eingetragenen Anbieter (`cipher-local`) vermutlich
  keinen Eintrag; Rückfall bleibt der Profilwert.
