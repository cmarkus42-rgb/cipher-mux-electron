# cipher-mux-electron

Electron-Kommandozentrale für Coding-CLIs: ein Fenster mit eingebetteten Terminals
(tmux + xterm.js), Rollen-Presets mit eigenem Kontext, Notes als sichtbare Übergabe-Artefakte,
MCP-Server und Projekt-Kick-off. Zielbild und Begründung:
`docs/superpowers/specs/2026-09-29-prozess-substrat-strategie.md`.

## Bevor du hier arbeitest — die fünf Fallen

1. **Tests brauchen Node 22.** Vor jedem Test-/Typecheck-Befehl:
   `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`. Unter dem System-Node 26 kompiliert
   `better-sqlite3` nicht, `rebuild:node` bricht ab, und die `&&`-Kette in `npm run test`
   führt **null** Tests aus — sieht aus wie ein sauberer Lauf. Keine Testausgabe heißt:
   PATH vergessen. `.nvmrc` und `engines.node` sind gesetzt, npm wertet beides nicht aus.
2. **`node --test` direkt aufzurufen ist nicht dasselbe wie `npm run test`.** Ohne den
   vorgeschalteten `rebuild:node` fehlt die better-sqlite3-ABI, und es fallen schlagartig über
   150 Tests um — alle in SQLite-gestützten Suiten (TaskManager, MessageBus, MemoryStore,
   CyberFactory, Debugger, Audit). Das Fehlerbild ist eindeutig: viele Fehler, alle dort.
3. **Die Suite ist grün und soll grün bleiben.** Stand: **1742 Tests, 1742 pass, 0 fail,
   0 cancelled** (seit 4f12f22). Ältere Dokumente nennen „vier vorbestehend rote Suiten" —
   das galt bis zum 2026-09-30 und ist erledigt; keiner der Fälle war ein Flake. Ein roter
   Lauf ist ab jetzt eine echte Regression.
4. **`npm run lint` ist projektweit rot** (830 Probleme, 478 Fehler) und war es vorher schon.
   Ein grüner Lauf ist kein erreichbares Abnahmekriterium. Das Gate lautet: *keine neuen
   Probleme in den geänderten Dateien*, geprüft per `npx eslint <dateien>` gegen `git blame`.
   Der **Typecheck** dagegen ist grün — `tsconfig.main.json` und `tsconfig.renderer.json`
   beide null Fehler. Der Root-`tsconfig.json` zieht `conserved/` mit und rauscht; nimm die
   beiden spezifischen.
5. **Vier Sektionen dieser Datei werden von Mux injiziert**, nicht von Hand gepflegt:
   `## Global Rules`, `## Workspace Prompt`, `## Context Directories`, `## Session Identity`.
   Handarbeit daran wird beim nächsten Sessionstart überschrieben. Global Rules bearbeitet man
   in `~/.config/cipher-mux/global-rules.md`, Workspace-Inhalte im Workspace-Editor.

## Build & Test

```bash
npm install
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"   # Pflicht für test/typecheck
npm run test           # node --test über alle test/**/*.test.ts
npm run lint           # ESLint (vorbestehend rot, siehe oben)
npm start              # App starten — NICHT `electron .`
npm run dist           # unsignierte DMG nach out/
```

`npm run test` rebuildet better-sqlite3 für Node, `npm start` für Electron. Nach einem Testlauf
nie `electron .` direkt aufrufen — der prestart-Hook garantiert die Electron-ABI, sonst fehlen
MessageBus-DB und TaskManager.

**`npm start` baut nicht.** Es ist `electron .` plus `prestart` (nur App-Deps). Electron führt
`dist/` aus. Wer am Main-Prozess arbeitet und die Änderung in der App sehen will, braucht
vorher `npm run build:main`, bei Renderer-Änderungen zusätzlich `npm run build:renderer`.
Nimm nicht `npm run build` — das ruft `version:generate` und schreibt `src/shared/version.ts`
neu, das laut Konvention nicht committet werden soll.

## Hub

Alle Projekte liegen unter `hubPath/projects/`. Pfadauflösung zentral in
`src/main/project/hub-paths.ts`. Beim Erststart fragt `HubSetupDialog` danach.

## Aktueller Stand

Version 0.9.104. Multi-Workspace-Sessions (Paket A) ist gemergt: jede Session trägt ihren
Workspace, Presets laufen parallel in mehreren Workspaces. Die manuelle Abnahme dazu steht
noch aus — `docs/superpowers/acceptance/2026-09-20-multi-workspace-sessions-manual.md`.

**Übergaben (2026-09-30, Branch `handoff-notes-delta`):** Eine Handoff-Note trägt einen
Anker-Commit; der Weltzustand wird beim Dispatch berechnet statt gespeichert
(`notes/handoff-delta.ts`, `notes/handoff-dispatch.ts`, Tool
`mux_notes_handoff_dispatch`). Notes können typisiert sein und eine Datei in git spiegeln,
mit sichtbarer Drift statt behaupteter Nicht-Autorität (`notes/mirror-drift.ts`). Beides ist
end-to-end gegen eine echte Session belegt. Zielbild:
`docs/superpowers/specs/2026-09-30-notes-als-projektgedaechtnis.md`.

Nächste Richtung laut Strategiepapier: Rolle → Modell/Adapter, Rollengrenzen als Constraint,
Memory auf Companion begrenzen. Offene Entscheidungen stehen dort in Abschnitt 7, die zur
Spiegelung im Papier vom 2026-09-30.

## Projektstruktur

```
src/main/     a11y agent audit bluetooth bugreport character companion config cyber-factory
              debugger entity-content hub mcp message-bus monitoring notes project refinement
              session setup task testing-assistant tmux updater util voice workspace
              workspace-memory workshop
src/renderer/ components/ hooks/ voice/ styles/ fonts/
src/shared/   types, ipc-channels, constants, brand, grid-types, workspace-key, entity-status,
              workspace-badge, terminal-theme, version
test/main/    ~110 Testdateien, Unit-Tests für Main-Logik
docs/         decisions/ (9 ADRs), superpowers/specs/, superpowers/plans/, superpowers/acceptance/
```

**Der Message Bus ist deprecated.** `src/main/message-bus/` existiert noch und wird in
`ipc-hub.ts` instanziiert, trägt aber praktisch nur noch die SQLite-DB für den TaskManager
mit. `mux_send`/`mux_read` sind kein Weg, einer Session etwas zu sagen — dafür `tmux send-keys`.

**Drei tote Komponenten**, nirgends importiert: `TerminalPane.tsx`, `UnifiedSessionDialog.tsx`
und `PaneHeader.tsx` (nur von TerminalPane importiert). Nicht anfassen, nicht als Vorlage nehmen.

## Fragile Zone: Keep Working Restore

War Gegenstand von drei Bugfix-Runden (v0.9.9–v0.9.10) und wurde vom Multi-Workspace-Paket an
sieben Stellen berührt. **Wenn du hier arbeitest, gelten drei Regeln:**

1. **Jeder Lesezugriff auf ein persistiertes Feld ist defensiv** — `?? null`, nie annehmen,
   dass ein Feld existiert. `SessionStore.load()` castet `JSON.parse` ungeprüft; die Typen
   lügen für alles, was vor dem jeweiligen Feature geschrieben wurde.
2. **Ein geworfener Fehler in der Init-Kette killt den gesamten Session-Restore — still.**
   Der User verliert seine Sessions ohne Fehlermeldung. Neue Pfade dort gehören in `try`/`catch`.
3. **Session-IDs überleben keinen Neustart.** `recover()` vergibt neue; `ui.grid` in der Config
   enthält alte. Slot-IDs werden beim Startup synchron genullt.

Diagnose: `/tmp/kw-debug.json` wird bei jedem Startup geschrieben (Erfolg **und** Fehler) und
enthält `phase`, `error`, `recovered`, `orphaned` sowie `workspaceId` pro Session.
Logs: `/Applications/cipher-mux.app/Contents/MacOS/cipher-mux 2>&1 | tee /tmp/kw-test.log`.

## Workspaces, Personas, Multi-Workspace

Personas definieren Rollen (Name, Farbe, Default-Prompt), Workspaces kombinieren sie in einem
Grid mit Projekt-Zuweisungen. Eigenes Fenster (`index.html?view=workspaces`).

- **Prompt-Auflösung (3 Ebenen):** `cell.prompt` > `workspace.promptOverrides[persona]` > `persona.defaultPrompt`
- **Injektion:** Workspace-Prompt und Context-Paths gehen als CLAUDE.md-Sektionen in die
  Projekt-Cells — nicht als CLI-Argument, damit sie `/clear` überleben. Last-Write-Wins bei
  mehreren Cells auf demselben Projekt.
- **Multi-Workspace:** Jede Session trägt `SessionInfo.workspaceId`, persistiert in
  `sessions.json`. Entity-Sessions laufen in `~/.config/cipher-mux/runs/<workspaceId>/<entityId>/`
  — dort liegen die **generierten** Artefakte (CLAUDE.md, .mcp.json, settings), während
  `~/.config/cipher-mux/entities/<id>/` die **authored** behält (preset.md, Skills, Guides).
  Diese Trennung ist es, die zwei Workspaces daran hindert, sich die CLAUDE.md zu überschreiben.
- `singleInstance` gilt **pro Workspace**. MCP-Aufrufe tragen `X-Mux-Workspace`, beim
  `initialize` einmalig in den Tool-Kontext gebunden.
- **Drei-Zustands-Disziplin, durchgängig:** `undefined` = keine Präferenz (→ aktiver Workspace),
  `null` = ausdrücklich ungebunden, String = dieser Workspace. Ein `??`, wo `=== undefined`
  nötig wäre, macht aus „starte ungebunden" ein „starte, wo der User gerade hinschaut".
- Ungebundene Sessions sind aus **jedem** Workspace sichtbar und tragen das Badge
  „ohne Workspace". Die Main-Seite (`findEntitySessions`) bleibt bewusst strenger.
- **Noch global, nicht workspace-skopiert:** Notes-Tagging und Companion-Memory (Paket B).

## Entities, MCP, Voice

- **Entities** sind Rollen mit eigenem Verzeichnis, eigener CLAUDE.md und Recovery-Fähigkeit:
  Workshop, Cyber Factory, Companion, Refinement, Ideation Partner, Debugger,
  Testing Assistant, Audit, Voice-Relay, Launcher. Registry: `src/main/session/entity-registry.ts`.
- **MCP-Server** im Main-Prozess, ~52 Tools, **eine `McpServer`-Instanz pro Client**
  (`mcp-server.ts:createSession`) — deshalb kann Workspace-Kontext pro Verbindung gebunden werden.
- **Worker-Startup:** Nach `mux_create_session` 8–10s warten, dann `tmux capture-pane` prüfen,
  dann `tmux send-keys`. `mux_send` ist Inter-Session-Kommunikation, **kein** Prompt-Input.
- **Voice:** Silero VAD im Renderer → Whisper STT → `VoiceInputRouter` → tmux sendKeys.
  Whisper-Model unter `~/.config/cipher-mux/models/whisper/`, **nicht** `app.getPath('userData')`.
  tmux sendKeys nutzt `\r` (0x0d), nicht `\n`.
- **Piper-Voices** brauchen ONNX-Metadata direkt im Modell, nicht nur in `model.onnx.json` —
  sonst hängt der Worker bis zum 30s-Timeout und fällt auf macOS `say` zurück.

## Konventionen

- TypeScript strict, Preact mit JSX, ESLint + Prettier, typed IPC über `shared/ipc-channels.ts`
- Electron: `contextIsolation=true`, `nodeIntegration=false`
- **Tests importieren per ESM `import`** (67 von 71 Dateien); `require()` nutzen vier Ausreißer
  und erzeugt einen Lintfehler
- CSS: Tokens mit `--color-*`-Präfix, **nicht** `--accent`/`--text-secondary`. `--radius-*` ist
  projektweit `0` — keine abgerundeten Ecken. 10 Themes über `body[data-theme]`
- **Preact-Falle:** kein `stopPropagation()` auf Popup-Containern — bricht Child-Klicks in
  preact/compat. Stattdessen `e.target === e.currentTarget` auf dem Overlay prüfen

## Bekannte Constraints

- **macOS-only** (tmux, osascript, Keychain), Apple Silicon
- **tmux als einziges Session-Backend** — Sessions überleben Electron-Crashes
- **xterm.js Streaming** braucht Batching; Terminal-Fit mit 150ms Debounce und Min-Size-Guard
- **DMG ist unsigniert** (`CSC_IDENTITY_AUTO_DISCOVERY=false` im `dist`-Skript, Absicht)
- `src/shared/version.ts` ist ein Build-Artefakt (`scripts/git-version.sh`) und zählt Commits
  seit dem letzten Tag — es zu committen erhöht die Zahl und macht die Datei erneut veraltet

## Weiterführend

| Thema | Datei |
|---|---|
| Zielbild, Strategie, offene Entscheidungen | `docs/superpowers/specs/2026-09-29-prozess-substrat-strategie.md` |
| Architekturentscheidungen (9 ADRs) | `docs/decisions/` |
| BT-Shutter / HID auf macOS 26+ | `docs/bt-shutter.md` |
| Testcase-Note-Format | `docs/testcase-notes.md` |
| Offene manuelle Abnahme | `docs/superpowers/acceptance/` |

## Skill-Referenz

| Skill | Zweck |
|-------|-------|
| `/interview` | Anforderungsinterview |
| `/spec` | Technische Spezifikation aus Requirements |
| `/decide` | ADRs für offene Entscheidungspunkte |
| `/decompose` | Spec in implementierbare Tasks zerlegen |
| `/implement` | Nächsten offenen Task implementieren |
| `/doc-review` | Dokumentation gegen den Code-Stand abgleichen |

Diese Skills stammen aus dem ursprünglichen 6-Phasen-Prozess und setzen `docs/SPEC.md` und
`docs/todo.md` voraus. **Beide Dateien existieren nicht (mehr).** Die Planung läuft heute über
`docs/superpowers/specs/` und `docs/superpowers/plans/`; die Skills sind entsprechend nur
eingeschränkt brauchbar.

## Global Rules

### Universelle Regeln

1. **Plan vor Code.** Nicht-triviale Aenderungen brauchen einen Plan: betroffene Dateien, Reihenfolge, Tests. Plan zeigen, Bestaetigung abwarten.
2. **Spec ist Wahrheitsquelle.** Code, der von der Spec abweicht, ist verdaechtig. Spec zuerst aendern, nicht den Code.
3. **Test-First.** Neuer Code braucht Tests — Verhaltens-Tests, keine Implementations-Tests.
4. **Layered Implementation.** Skelett zuerst, dann Kernlogik, dann Edge Cases, dann Refactor. Kein Mega-Prompt.
5. **Off-Limits respektieren.** Auth, Payment, Migrations, .env, Credentials — ohne expliziten Auftrag tabu.
6. **Risk-Review vor Commit.** Was geaendert, was geloescht, was bricht potenziell.
7. **"Weiss ich nicht" ist valide.** Keine erfundenen Library-Namen, API-Endpunkte oder Versionen.
8. **Token-Disziplin.** Antwort-Laenge passt zur Frage. Kein Wiederholen, keine Floskeln, kein "Hoffe das hilft".
9. **Sicherheit.** Keine PII leaken, keine Credentials lesen/zitieren, keine Default-Geheimnisse in Code.

### Pre-Work-Check (Doppelarbeit & Kollision vermeiden)

**Vor JEDEM Arbeitsbeginn — auch bei klarem Handoff/Spec — zuerst pruefen, ob die Arbeit schon laeuft oder schon erledigt ist. Handoffs und Specs koennen stale sein.**

1. **Ist es schon gebaut?** Den Ist-Zustand im Code/Tree gegen das verifizieren, was der Handoff/die Spec verlangt (grep nach Kern-Symbolen/Dateien/Endpunkten). Wenn vorhanden → NICHT neu bauen, sondern Vollstaendigkeit + Live-Stand pruefen und das melden. Quelle: CF 2026-06-19 — stale Refinement-Handoff "Start bei Task 1", obwohl das komplette Manual-Override-Paket (11 Tasks) bereits in `main` lag; fast komplett neu gebaut.
2. **Arbeitet schon jemand dran?** `mux_sessions` + ggf. `tmux capture-pane` checken: laeuft eine andere Session am selben Repo/Target? Wenn ja → koordinieren (Branch/Worktree, Reihenfolge), nicht blind in denselben Working-Tree/`main` schreiben. Quelle: CF 2026-06-19 — fremder inventory-Commit landete auf `main`, waehrend ein Fix lief (kein Konflikt nur durch Zufall verschiedener Dateien).
3. **Parallel-Worker auf gemeinsamem Repo → Worktree-Isolation.** Jeder schreibende Worker in eigenem git-worktree + Branch; Merge nach `main` erst nach Gruen. Live-`main`-Checkout (Deploy-Quelle) bleibt bis Merge unangetastet.

### Companion Memory

Alle Entities haben Zugriff auf persistente Memory-Tools:
- `companion_memory_write` — Erinnerung speichern (mit scope: user/workspace/session)
- `companion_memory_recall` — letzte Eintraege abrufen (mit scope-Filter)
- `companion_memory_search` — Volltextsuche in Erinnerungen
- `companion_memory_forget` — Eintrag loeschen

Nutze Memory fuer projekt- oder user-spezifisches Wissen das ueber die Session hinaus gilt: Konventionen, Entscheidungen, Praeferenzen. Nicht fuer temporaere Notizen (dafuer `mux_notes_create`).

### MCP-Tool-Grundregeln

- **Session-Handoff Timing:** Nach `mux_create_session` mindestens 8-10s warten bevor Instruktionen gesendet werden. tmux + Shell + Claude CLI brauchen Startzeit.
- **mux_send vs. tmux send-keys:** `mux_send` ist fuer Inter-Session-Kommunikation (Message Bus), NICHT fuer Prompt-Input. Direkte Instruktionen via `tmux send-keys`.
- **Context-Monitoring:** Bei laufenden Worker-Sessions regelmaessig `mux_context_usage` pruefen. Bei >80% proaktiv handeln.
- **Task-Updates:** Tasks zeitnah updaten — nicht erst am Ende. Andere Sessions verlassen sich auf aktuelle Task-Stati.
- **Notes fuer Persistenz:** Wichtige Erkenntnisse, die ueber die Session hinaus gelten, als Notes anlegen (`mux_notes_create`).

### TTS-Guardrail

- **Baseline:** `mux_tts_speak` fuer Kernaussagen: Zusammenfassungen, Meilensteine, direkte Antworten. Saetze kurz und klar.
- **Nie per TTS:** Code, Pfade, IDs, technische Details — gehoeren in schriftlichen Output.
- **Override:** Entity-CLAUDE.md kann TTS erweitern (voice-relay), einschraenken oder deaktivieren (cyber-factory, debugger).

### Lessons Learned — Entscheidungsbaum

Wenn du ein Learning erkennst (etwas das beim naechsten Mal anders laufen soll), lege es auf der richtigen Ebene ab:

```
Learning erkannt
  → Betrifft ein spezifisches MCP-Tool?
      → JA: Tool-Description anreichern (in mcp-tools.ts)
  → Muessen ALLE Entities das wissen?
      → JA: Hier eintragen (global-rules.md)
  → Nur fuer EINE Entity relevant?
      → JA: Entity-CLAUDE.md (unter ~/.config/cipher-mux/entities/<id>/)
  → User/Projekt-spezifisch?
      → JA: Companion Memory (companion_memory_write)
```

**Format fuer Eintraege hier:**
```
- **[Kurztitel]:** [Was ab jetzt gilt]. Quelle: [woher das Learning kommt].
```

- **Komponenten-Lieferung ohne Mount ist keine Lieferung:** Build-Abnahme prueft pro neuer Komponente, dass sie tatsaechlich in einer Route importiert/gemountet ist (grep auf Imports genuegt). Eine Build-Session lieferte 8 Journal-Komponenten, 6 davon nie importiert — zwei Debug-Zyklen jagten einen Phantom-Bug in nie gerendertem Code. Quelle: Debugger-Session 2026-06-10 (MixEventForm-Bug, cipher-grow-kit).

### Inter-Entity-Kommunikation

- **Direkt antworten per `mux_send`:** Wenn du eine Nachricht von einer anderen Entity via `mux_send` erhaeltst (z.B. eine Rueckfrage, einen Handoff, ein Ergebnis), antworte direkt per `mux_send` an die sendende Session zurueck. Nicht nur Text an den User ausgeben — die anfragende Entity wartet auf die Antwort in ihrem Kontext.
- **Pattern:** Nachricht empfangen → verarbeiten → `mux_send` an die Quell-Session mit der Antwort.
- **Ohne:** Die anfragende Entity bekommt keine Antwort und blockiert oder wiederholt die Frage.

### Notes-Referenzierung

- **Notes beim Titel nennen, nie bei der ID:** ULIDs sind kryptische interne Handles. Im Gespraech, in TTS und in schriftlichem Output immer den Note-Titel verwenden. Quelle: Refinement-Session 2026-05-04.

### Testcase-Konventionen

- **Testcases gehoeren in die Notes-System-Testcase-Note** (noteType: testcase, ID: `01KQNBDCH1D4G11PMAEM60TPTX`). NICHT in Dateien unter `docs/archiv/`. Der TestcaseView rendert nur Notes mit `noteType: testcase`.
- **Format:** `- [ ] **T-PREFIX.N** Beschreibung` — der Parser braucht dieses exakte Checkbox+Bold-ID-Format.
- **Neue Testcases ans Ende anhaengen**, unter einer neuen `## Section`-Ueberschrift.
## Workspace Prompt

In diesem Workspace arbeiten wir am CIPEHR-MUX - Coding Cockpit für Claude Code - also an dieser Umgebung selber hier. Continous self improvement.

## Context Directories

