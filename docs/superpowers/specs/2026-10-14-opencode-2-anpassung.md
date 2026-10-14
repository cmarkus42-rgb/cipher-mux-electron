# Spec: opencode 2.0 — Plugins und Adapter portieren

**Datum:** 2026-10-14
**Status:** Entwurf, Messungen abgeschlossen, Umsetzung offen
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
6. **Tool-IDs:** `write`, `edit`, `patch` (V1: `apply_patch`; das Binary führt den Alias
   `apply_patch → patch`), außerdem `shell` (V1: `bash`), `read`, `glob`, `grep`, `question`,
   `skill`, `subagent`, `webfetch`, `websearch`.
7. **`patch` nimmt `{ patchText }`** — ein Text mit `*** Begin Patch` … `*** End Patch` und den
   Kopfzeilen `*** Add File: <pfad>`, `*** Update File: <pfad>`, `*** Delete File: <pfad>`,
   optional `*** Move to: <ziel>`. **Aus dem Binary gelesen, nicht an einem Aufruf gemessen:**
   das Testmodell bekam `patch` nicht angeboten.
8. Ein `patch` kann **mehrere Dateien** berühren. Die V1-Grenze (`output.args.filePath`) hat
   `apply_patch` vermutlich nie erfasst: ohne `filePath` kehrte sie früh zurück. *Vermutung
   zur V1-Seite, nicht nachgemessen.*

### 2.4 Usage

1. **`tokens` hat kein `total`.** Form: `{ input, output, reasoning, cache: { read, write } }`.
   `input` ist **ohne** den gecachten Anteil (V1: einschließlich).
2. **`session.step.ended`** trägt `{ sessionID, assistantMessageID, finish, rawFinish, cost,
   tokens }` und zählt **pro Schritt**. Fünf Schritte eines Laufs: `cache.read` 1536 → 8192 →
   8448 → 8704 → 8960, `input` 6758 → 383 → 264 → 313 → 439. Die Promptgröße des letzten
   Schritts ist `input + cache.read + cache.write` (Schritt 5: 439 + 8960 = 9399).
3. **`session.usage.updated`** (`{ sessionID, cost, tokens }`) ist **kumulativ** über die
   Session und kommt auch mitten im Schritt; die Summen passten nicht exakt zu den
   Schrittwerten (Differenz 64 Tokens). **Nicht als Kontextgröße verwendbar.**
4. **Das Modell steht nur in `session.step.started`** (`{ sessionID, assistantMessageID,
   agent, model: { id, providerID, variant }, started }`). Verknüpfung über `assistantMessageID`.
5. `ctx.model.list()` liefert `{ location, data }`. Die Form von `data` ist nicht gemessen;
   die Doku zeigt `model.limit.context`.
6. `ctx.model.default()` liefert das **Standardmodell der Config**, nicht das Modell der
   laufenden Session.

### 2.5 Idle

1. Turn-Ende: `session.execution.started` → `session.execution.succeeded` (jeweils
   `{ sessionID }`). Im Binary zusätzlich `session.execution.failed` und
   `session.execution.interrupted`.
2. **`session.idle` kam im `opencode run`-Lauf nicht an**, steht aber als Eventname im Binary.
   Ob die TUI es sendet, ist nicht gemessen. (V1 sendete es genau einmal am Zugende.)

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
| D7 | **Projektanweisungen immer in `AGENTS.md`.** `instructionsTarget()` gibt stets `AGENTS.md` zurück. | §2.7. Eine nur geschriebene `CLAUDE.md` wird nicht gelesen. |
| D8 | **Plugins nach `.opencode/plugins/`, ohne Eintrag in der Config.** Alte Dateien in `.opencode/plugin/` und Alteinträge im `plugin`-Feld werden entfernt. | Auto-Entdeckung ist gemessen; ein Alteintrag auf eine V1-Datei erzeugte bei jedem Start eine WARN-Zeile. |
| D9 | **Config-Formen bleiben V1** (`mcp.<name>`, `provider`, `model`). | Still normalisiert, gemessen; keine unnötige Umstellung. |
| D10 | **`--model` fällt weg; ein Rollen-Override wird als `model` in die `opencode.json` geschrieben.** `AdapterContext` bekommt ein optionales `model`. | §2.6. Das Feld `model` ist V1/V2-gemeinsam. Ein vom Mux gesetzter Wert muss als solcher erkennbar sein (Besitz wie bei `cipher-local/`). |
| D11 | **Fork: vorerst ein klarer Fehler**, kein stilles Weiterführen derselben Unterhaltung. Folgearbeit: Fork über `POST /api/session/{id}/fork`, dann `opencode --standalone --session <neu>`. | §2.6. Ein Fork, der die Quelle fortsetzt, wäre ein stiller Fehlschlag. |
| D12 | **Kontextfenster aus `ctx.model.list()` (`limit.context`) für das Modell der Session**, Rückfall `OPENCODE_FALLBACK_CONTEXT_WINDOW`. Der Profilwert des lokalen Workers (`contextWindow`) behält Vorrang. | §2.4. Aus einer Schätzung wird, wo möglich, ein gemessener Wert. |
| D13 | `sub-agents` bleibt `false` (ungemessen). | Gate sagt die Wahrheit (Vorgänger §5.3). |

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
  `step.started` merkt sich `assistantMessageID → model`; `step.ended` schreibt die JSON-Datei
  im bekannten Format (`session_id`, `model.id`, `context_window.*`). `used = input +
  cache.read + cache.write + output`. Ohne `CIPHER_MUX_SESSION_ID` wird nichts geschrieben.
  Der Schreiber filtert auf die eigene Session nicht — unter `--standalone` gibt es nur eine.
- **Idle:** wie bisher, mit den Events aus D5.

## 5. Adapter

- `buildLaunchCommand`: `--standalone` und `--auto` (bei skipPermissions); `--session <id>`,
  `--continue`; **kein** `--model`, `--fork`, `--pure`. Fork → Fehler (D11).
- `postLaunchInjection`: Plugins nach `.opencode/plugins/`; Altdateien in
  `.opencode/plugin/` mit den eigenen Namen löschen; Alteinträge aus `plugin` entfernen
  (`mergeOpenCodeConfig` behält fremde Einträge); `model` nach D10.
- `instructionsTarget`: immer `AGENTS.md` (D7). Bestehende `CLAUDE.md` bleibt unberührt.
- `getCapabilities`: unverändert, bis die Abnahme etwas anderes zeigt.
- Prompt-Fragmente: `--pure`-Hinweis ersetzen („Plugins werden aus `.opencode/plugins/`
  geladen"), Startzeile `opencode --standalone --auto`, Anweisungen **nur** aus `AGENTS.md`.
- Texte mit „1.18.35" in `companion-info-popup.ts`, `companion-ref.ts` und den Kommentaren
  nachziehen.

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

## 7. Abnahme (gegen die echte CLI, in der TUI)

Das Feuern nachweisen, nicht die Datei schreiben (Vorgänger §1). Jeweils im tmux-Pane unter
`--standalone`, nicht nur mit `opencode run`:

1. Rolle mit Grenze: verbotener Pfad entsteht nicht, erlaubter schon, Session läuft weiter.
2. **Zwei opencode-Mux-Sessions gleichzeitig:** jede schreibt in **ihre** Usage-Datei.
3. Context-Prozent im Mux-Fenster stimmt mit `input + cache` des letzten Schritts überein.
4. Idle-Signal erscheint am Zugende (TUI-Quelle klären: `session.idle` oder `execution.*`).
5. Restore mit `--session <id>`.
6. Startlog der Session enthält **kein** `failed to load plugin`.

## 8. Risiken und offene Punkte

- **Kind-Sessions (Sub-Agents):** Ihre `step.ended` tragen eine andere `sessionID` und könnten
  die Anzeige der Hauptsession überschreiben. `sub-agents` ist ungemessen; Verhalten klären,
  bevor das Gate je `true` wird.
- **`patch`-Eingabe** ist nur aus dem Binary gelesen — im Abnahmelauf mit einem Modell
  messen, das `patch` angeboten bekommt.
- **`session.idle` in der TUI** ungemessen (§2.5).
- **Fork** (D11) bleibt offen, bis die API-Variante gemessen ist (läuft ein Fork gegen die
  Datenbank einer `--standalone`-Session? ungemessen).
- **Laufende Sessions** (heute z. B. projekt-a) tragen die V1-Plugins bis zum nächsten Start.
  Der geteilte Hintergrunddienst läuft weiter, wird aber nicht mehr benutzt.
- **Lokaler Worker / Local Cyber Factory** hängt an `cipher-mux-idle.js` und am Anbieterblock
  in der `opencode.json`; beide fallen unter D5/D9. Die dortige Spec
  (`2026-10-09-local-cyber-factory-design.md` §10a) nennt `session.idle` aus 1.18.35 und ist
  danach zu ergänzen.
- `ctx.model.list()`: Form von `data` und der Eintrag für ein selbst eingetragenes Modell
  (Anbieter `cipher-local`) sind ungemessen; Rückfall bleibt.
