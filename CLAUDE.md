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
3. **Die Suite ist grün und soll grün bleiben.** Stand: **2267 Tests, 2267 pass, 0 fail,
   0 cancelled**, 473 Suiten, rund 91 s (gemessen 2026-10-02). Ältere Dokumente nennen „vier vorbestehend rote Suiten" —
   das galt bis zum 2026-09-30 und ist erledigt; keiner der Fälle war ein Flake. Ein roter
   Lauf ist ab jetzt eine echte Regression.
4. **`npm run lint` ist projektweit rot** (830 Probleme, 478 Fehler) und war es vorher schon.
   Ein grüner Lauf ist kein erreichbares Abnahmekriterium. Das Gate lautet: *keine neuen
   Probleme in den geänderten Dateien*, geprüft per `npx eslint <dateien>`. **Die CI prüft
   seit dem 2026-10-01 genau das** — der Lint-Job nimmt die Dateien aus dem Diff. Vorher führte
   er `npm run lint` aus und konnte deshalb nie grün werden; das hat das CI-Abzeichen seit Mai
   rot gehalten und zwei echte Befunde darin versteckt (Node 20 statt 22, kein tmux auf dem
   macOS-Runner, `distutils` unter Python 3.12). **Ein Gate, das nicht grün werden kann, ist
   kein Signal.** Der **Typecheck** dagegen ist grün — `tsconfig.main.json` und
   `tsconfig.renderer.json` beide null Fehler, und die CI hat dafür jetzt einen eigenen Job.
   Der Root-`tsconfig.json` zieht `conserved/` mit und rauscht; nimm die beiden spezifischen.
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

Version **0.11.5**. Multi-Workspace-Sessions (Paket A) ist gemergt: jede Session trägt ihren
Workspace, Presets laufen parallel in mehreren Workspaces. Die manuelle Abnahme dazu steht
noch aus — `docs/superpowers/acceptance/2026-09-20-multi-workspace-sessions-manual.md`.

Alle Tags von `v0.9.104` bis `v0.11.5` haben inzwischen ein GitHub-Release mit DMG. Die
Release-Liste hörte bis zum 2026-10-01 bei `v0.9.103` auf, obwohl die Tags da waren.

**Übergaben (2026-09-30, Branch `handoff-notes-delta`):** Eine Handoff-Note trägt einen
Anker-Commit; der Weltzustand wird beim Dispatch berechnet statt gespeichert
(`notes/handoff-delta.ts`, `notes/handoff-dispatch.ts`, Tool
`mux_notes_handoff_dispatch`). Notes können typisiert sein und eine Datei in git spiegeln,
mit sichtbarer Drift statt behaupteter Nicht-Autorität (`notes/mirror-drift.ts`). Beides ist
end-to-end gegen eine echte Session belegt. Zielbild:
`docs/superpowers/specs/2026-09-30-notes-als-projektgedaechtnis.md`.

**Zweite CLI (2026-10-01):** Der Codex-Adapter steht und ist end-to-end gegen das echte Codex
belegt — Context-Usage landet im Format, das der bestehende Monitor liest, und Workspace plus
Rolle reisen im Bearer-Token, weil Codex keine freien MCP-Header sendet. Die Rollengrenze
blockiert selektiv — gegen das echte Codex belegt, mit der Begründung, die beim Modell ankommt.
Details und die Messungen im Abschnitt „Zweite CLI: Codex".
**Dritte CLI (2026-10-01, abgenommen):** Der opencode-Adapter steht und ist end-to-end gegen
die echte CLI belegt — MCP über die Verbindungsköpfe (opencode sendet freie Header, anders als
Codex), Rollengrenze über ein Plugin, das selektiv ablehnt, Context-Usage im Format, das der
bestehende Monitor liest. Die Abnahme fand **einen** Fehler, der die Session hochkommen und
aussehen ließ wie Erfolg: das positionale Projektargument. Details und alle Messungen im
Abschnitt „Dritte CLI: opencode".

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

## Rollen als Constraint — und was die CLI dabei wirklich tut

Rollengrenzen sind nicht mehr nur Prompt-Text. Pro Entity mit Grenze erzeugt der Mux ein
abhängigkeitsfreies Node-Skript im Run-Verzeichnis und verdrahtet es als **PreToolUse-Hook**.
Die Grenzen samt Begründung stehen in `src/main/session/entity-boundaries.ts`; eine Rolle ohne
Eintrag ist bewusst unbeschränkt.

**Drei gemessene Eigenschaften der Claude-CLI, die den Weg bestimmen** (2026-09-30, v2.1.284):

1. **`--dangerously-skip-permissions` umgeht `permissions.deny` vollständig.** Entity-Sessions
   starten mit diesem Flag. Eine Deny-Regel dort wäre geschrieben und wirkungslos — und damit
   auch die `permissions.allow`-Liste, solange das Flag gesetzt ist.
2. **Ein PreToolUse-Hook feuert unter dem Flag weiterhin** und kann den Aufruf ablehnen. Das ist
   der einzige gemessene Weg, eine Rollengrenze durchzusetzen.
3. **Nur `Edit(glob)` greift bei Dateiedits.** Eine `Write(glob)`-Regel weist die CLI
   ausdrücklich zurück: *„only Edit(path) rules are. Use Edit(src/**) instead (Edit rules cover
   all file-editing tools)."*

Jede dieser drei ist eine Annahme über das Innenleben der CLI. Sie stehen hier, weil sie in
keinem Diff stehen — und sie können mit der nächsten CLI-Version kippen. Wer hier arbeitet,
misst nach, statt sie zu glauben.

**Rolle → Modell/Adapter:** `EntityConfig.model` und `.adapterId`, aufgelöst in
`entity-runtime.ts` als User-Override (configStore `entityModels` / `entityAdapters`) >
Rollen-Default > `agent.defaultAdapter` aus der Config. Keine Rolle trägt einen
Modell-Default; das ist eine Kostenentscheidung und keine Vermutung.

## Zweite CLI: Codex — und die vier Messungen, die den Adapter bestimmen

`adapters/codex.ts` ist Tier-2 und gemessen an **codex-cli 0.155.1 (2026-10-01)**. Dieselbe
Disziplin wie oben: das hier steht in keinem Diff und kann mit der nächsten CLI-Version kippen.

1. **`AGENTS.md` wird befolgt**, hierarchisch nach Scope, und eine direkte Instruktion schlägt
   sie. Damit trägt dieselbe Injektionsmechanik wie CLAUDE.md bei Claude Code.
2. **`PreToolUse`-Hooks tragen wortgleich das Claude-Code-Protokoll** —
   `hookSpecificOutput.permissionDecision` mit `allow`/`deny`/`ask`, `permissionDecisionReason`,
   Exit 2 plus stderr. Ein `deny` wirkt auch unter
   `--dangerously-bypass-approvals-and-sandbox`, und der Grund erreicht das Modell wörtlich.
3. **Ohne `--dangerously-bypass-hook-trust` feuert ein frisch geschriebener Hook nicht — still.**
   Keine Warnung, keine Logzeile, der Aufruf läuft durch. Deshalb setzt der Adapter beide Flags
   gemeinsam. Eine geschriebene und nicht feuernde Grenze ist schlimmer als keine.
4. **Der `matcher` trägt den Claude-Code-Werkzeugnamen.** Der Hook-Input meldet
   `tool_name: "Bash"`, obwohl die Ausgabe `exec` und `/bin/zsh -lc` zeigt. `matcher = "shell"`
   passt auf nichts und überspringt den Hook — wieder still. Der Adapter schreibt deshalb
   **keinen** Matcher und filtert im Hook-Skript.

Dazu zwei Eigenschaften, die den Bau erst möglich machen: eine **projektlokale
`.codex/config.toml`** greift (sonst müsste der Mux die globale Config des Nutzers anfassen, und
zwei Workspaces würden sich überschreiben), und `hooks.<Event>`-Einträge werden **nicht
validiert** — `{bogus=1}` und ein erfundener Eventname gehen durch. Zusammen mit den zwei
stillen Fehlschlägen heißt das: **das Feuern nachweisen, nicht die Datei schreiben.**

**Die Rollengrenze hat einen eigenen Pfadbegriff** (`adapters/codex-boundary.ts`), und das ist
kein Beiwerk: das generische Skript aus `entity-boundaries.ts` liest `tool_input.file_path`, und
**Codex liefert das nicht**. Sein Datei-Werkzeug heißt `apply_patch`, der Input ist
`{"command": "*** Begin Patch\n*** Add File: /abs/pfad\n…"}` — der Pfad steckt in einem
Patch-Umschlag. Das generische Skript hätte einen leeren String gelesen und **jeden** Dateizugriff
durchgelassen. Gezogen werden die Pfade aus allen vier Patch-Köpfen (Add/Update/Delete/Move to);
eine verbotene Datei verbietet den ganzen Aufruf, denn ein Patch lässt sich nicht zur Hälfte
anwenden. Die Regeln selbst bleiben die aus `entity-boundaries.ts` — neu ist nur die Antwort auf
die Frage, **wo der Pfad steht**.

Erzeugt wird sie in `postLaunchInjection`, also dort, wo auch die `.codex/config.toml` entsteht,
die sie registriert. Das ist Absicht: bis zum 2026-10-01 schrieb der SessionManager seine
`role-boundary.js` unbedingt nach `.claude/settings.local.json` — eine Datei, die Codex nicht
liest — und `buildCodexProjectConfig` bekam seinen `boundaryHookPath` von niemandem. Eine
Codex-Session lief ohne Grenze, obwohl der Mechanismus gemessen und der Parameter vorhanden war.
Gefunden bei der opencode-Abnahme. **Wer einen Adapter baut, erzeugt seine Grenze dort, wo die
Datei entsteht, die sie trägt.**

> **Die Shell-Lücke bleibt.** `Bash` trägt keinen Pfad, nur ein Kommando — eine Datei lässt sich
> darüber weiterhin ändern. Dieselbe Lücke hat Claude Code. Sie zu schließen hieße Shell-Syntax
> zu parsen, und ein halbherziger Parser wäre wieder eine Grenze, die nur so aussieht. Die Grenze
> ist eine Leitplanke gegen Versehen, kein Sandkasten.

**Context-Usage ohne Statusline:** Codex' `status_line` ist eine TUI-Anzeigeoption, kein
Kommando. Stattdessen trägt jeder Hook-Input `transcript_path`, und in der Rollout-JSONL steht
pro Antwort ein `token_usage_record`. `monitoring/codex-usage-hook.ts` erzeugt daraus genau das
JSON, das der bestehende `StatusLineMonitor` schon liest — ein weiterer Schreiber, kein zweiter
Leser. Das `session_id`-Feld darin ist nicht Beiwerk: Keep Working braucht es für
`codex resume <id>` statt des interaktiven Pickers.

**Drei Dinge halten eine unbeaufsichtigte Codex-Session auf, und alle drei sind stumm oder
blockierend.** Zwei nimmt der Adapter weg, das dritte braucht einen Eintrag außerhalb:

1. **Verzeichnis-Vertrauen.** Codex lädt projektlokale Config, Hooks und exec-Policies **nur**
   aus einem vertrauten Verzeichnis und fragt sonst in einem blockierenden Dialog. Ein
   nachträgliches „Yes" lädt sie **nicht nach** — die Session steht dann am Prompt und hat
   trotzdem keine MCP-Werkzeuge, keinen Usage-Hook und keine Rollengrenze. Gemessen und
   wirkungslos: `-c projects."<pfad>".trust_level`, `CODEX_NON_INTERACTIVE=1`, beide
   Bypass-Flags. Es geht nur über `~/.codex/config.toml`. `adapters/codex-trust.ts` trägt das
   Run-Verzeichnis dort ein — und **nur** das: der Dialog schützt vor fremdem Inhalt, und unter
   `runs/<workspaceId>/<entityId>/` liegt ausschließlich Mux-Erzeugtes. Jeder andere Pfad wird
   abgewiesen, auf dem aufgelösten Pfad geprüft. Abschaltbar über `agent.codexTrustRunDirs`.
2. **Der Update-Hinweis** ist ein Auswahldialog, kein Banner →
   `-c check_for_update_on_startup=false`.
3. **`-C` auf das falsche Verzeichnis** — siehe `buildLaunchCommand`, der Adapter setzt es
   bewusst nicht.

**Die CLI pro Rolle wählt man in der UI**, seit dem 2026-10-01: Feld „CLI" im Preset-Editor,
„Standard-CLI" in den Einstellungen. Die Auflösung ist älter (`entityAdapters` > Rollen-Default
> `agent.defaultAdapter`); neu ist nur der Weg, sie zu setzen. Die Logik dahinter steht als
reine Funktionen in `agent/entity-adapter-map.ts`, nicht im IPC-Handler — ein fehlender
Schlüssel ist „keine Präferenz", ein leerer wäre ein Adapter namens `""`.

**Die Config liegt in `app.getPath('userData')`**, also
`~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json` — **nicht** in
`~/.config/cipher-mux/config.json`. Diese zweite Datei existiert und wird vom Mux **nicht**
gelesen; wer dort editiert, ändert nichts und sucht lange.

**MCP-Bindung ohne Header: das Token trägt sie.** Codex sendet dem MCP-Server **keine freien
Header** (gemessen gegen einen Horchposten: Verbindung ja, `X-Mux-*` nein; der
`headers`-Schlüssel wird stillschweigend verworfen). Workspace und Rolle reisen deshalb im
Bearer-Token mit — `mcp/bound-token.ts`, Format `<apiKey>.<base64url(JSON)>`:

- Ein Token **ohne Punkt** ist der blanke Schlüssel und heißt „ungebunden" — also exakt das,
  was jeder bestehende Client schickt. Zustandslos, keine Tokenverwaltung.
- `stripBindingFromAuthHeader` läuft **vor** `validateBearer`. Ohne diesen Schritt wäre jede
  Codex-Verbindung ein 401 — und zwar erst beim Benutzen, nicht beim Schreiben der Config.
- Am `initialize` hat der **Kopf Vorrang**, das Token fällt pro Feld ein. Beide werden gegen die
  bekannten IDs geprüft; eine Bindung aus dem Token ist eine Behauptung wie die aus dem Kopf.
- **Der Zusatz ist nicht signiert, und das ist eine Entscheidung.** Wer den Schlüssel hat, kann
  ohnehin jedes Werkzeug rufen — der Zusatz erweitert keine Rechte, er benennt den Anrufer.
  Bekäme der Schlüssel eine feinere Rechtestruktur, wäre eine Signatur Pflicht.
- Das Token steht in der tmux-Umgebung (`CIPHER_MUX_MCP_TOKEN`), **nicht** in der generierten
  `.codex/config.toml`. `CIPHER_MUX_MCP_KEY` bleibt unverändert daneben stehen.

**opencode braucht das nicht** — dieselbe Messung, alle drei Header kamen an. Die Lücke ist
codex-spezifisch, nicht eine des Adapter-Vertrags.

**Companion Memory nur für Companion:** Der MCP-Server bindet die Rolle über `X-Mux-Entity` an
die Verbindung (`src/main/mcp/entity-header.ts`) und registriert die vier `companion_memory_*`
nur für Companion — oder für Verbindungen ohne Rolle, das ist die App selbst. Eine Permission
zu entfernen hätte nicht gereicht: sie erzeugt eine Rückfrage, sie hält kein Werkzeug zurück.

## Dritte CLI: opencode — und der eine Fehler, der wie Erfolg aussah

`adapters/opencode.ts` ist Tier-2 und gemessen an **opencode 1.18.34 (2026-10-01)**, erst gegen
Unit-Tests, dann gegen die laufende CLI mit einem echten Modell. Die zweite Runde ist die, die
zählt.

- **`AGENTS.md`** ist die Projektanweisung (`CLAUDE.md` liest opencode zusätzlich zur
  Verträglichkeit). Der Adapter liest und schreibt nur `AGENTS.md` — zwei Adapter, die in
  dieselbe Datei injizieren, überschreiben sich die Sektionen.
- **Freie MCP-Header kommen an** — `authorization`, `x-mux-workspace`, `x-mux-entity` alle drei,
  unter `user-agent: opencode/1.18.34`, gegen denselben Horchposten wie bei Codex. Deshalb nutzt
  der Adapter `buildMcpServerConfig` aus `mcp/workspace-header.ts` und **nicht** die
  Token-Bindung; die Kopfnamen stehen weiter nur an einer Stelle. Geschrieben wird
  `opencode.json`, **lesen-mergen-schreiben** wie bei `settings.local.json`: Besitz hat der Mux
  an `mcp['cipher-mux']` und an seinen **eigenen zwei** Einträgen im `plugin`-Feld.
- **Die Hülle heißt anders**: `type: "remote"` statt `"http"`, plus ein ausdrückliches
  `enabled: true`. Nur das wird umgeformt, nicht die Köpfe.

**Der Befund der Abnahme: kein positionales Projektargument.** `opencode [project]` nimmt ein
Verzeichnis entgegen, und der Adapter gab `projectPath` dorthin. Gemessen mit tmux-cwd =
Run-Verzeichnis und Argument = authored-Verzeichnis: `pane_current_path` **und** opencodes eigene
Statuszeile zeigten das authored-Verzeichnis, und am Horchposten kam **null** Verbindung an
(gegen zwölf ohne das Argument). Die generierte `opencode.json` lag im Run-Verzeichnis und wurde
nie gelesen — keine MCP-Werkzeuge, keine Grenze, kein Usage, und die Session stand am Prompt und
sah gesund aus. Es ist derselbe Fehler, den Codex' `-C` hatte, aus demselben Grund:
`LaunchOpts.projectPath` ist bei einer Entity-Session das **authored**-Verzeichnis, gearbeitet
wird im **Run**-Verzeichnis. Jetzt wird das cwd des Panes geerbt, wie bei Claude Code.

Der Rest des Startkommandos: `--auto` statt `--dangerously-skip-permissions`, Resume
`--session <id>`, bare Resume `--continue`, Fork `--session <id> --fork` — `--fork` ist allein
ungültig. **Niemals `--pure`**: das lädt die Session ohne Plugins, also ohne Grenze und ohne
Usage.

**Rollengrenzen über ein Plugin — und sie feuern.** opencode hat keine `PreToolUse`-Konfiguration,
sondern Plugin-Module. Von seinen Events kann nur `tool.execute.before` einen Aufruf aufhalten:
ein **Wurf** dort verhindert die Ausführung. Nachgewiesen in `opencode run` *und* in der TUI unter
`--auto`, mit einem echten Modell und dem echten Workshop-Grund aus `entity-boundaries.ts`:

- `src/NOPE.txt` entstand **nicht**, `docs/OK.txt` entstand — selektiv, keine Pauschalsperre.
- Der abgelehnte Aufruf endet als `state.status: "error"` mit dem Grund in `state.error`; das
  Modell zitierte ihn danach wörtlich („Du bist kein Coder, du koordinierst").
- Der Wurf ist pro Werkzeugaufruf eingeschlossen: derselbe Zug lief weiter, die Session blieb.
- `--auto` umgeht ihn nicht. Es beantwortet Permission-Rückfragen automatisch, und das hier ist
  keine — genau deshalb nicht opencodes `permission`-Regelwerk.

**Vier stille Fehlschläge rund um die Plugins**, alle gemessen, alle der Grund für die jetzige
Form:

1. **Ein CommonJS-Plugin lädt nicht.** `module.exports = fn` wird mit „Plugin export is not a
   function" abgewiesen — und diese Zeile steht **nur** unter `--print-logs`. Beide erzeugten
   Plugins sind deshalb ESM mit Default-Export einer Funktion.
2. **Der Hook `permission.ask` feuert nie.** opencodes eigene Hilfe führt ihn auf; im Binary gibt
   es `trigger("…")` für jeden anderen Hooknamen und für diesen keinen. Eine darauf gebaute
   Grenze wäre geschrieben und tot.
3. **`read` trägt auch einen `filePath`.** Eine Grenze auf „irgendein Pfadargument" hätte die
   Rolle blind gemacht statt nur schreibunfähig. Gefiltert wird deshalb nach Werkzeugnamen; die
   drei schreibenden heißen `write`, `edit`, `apply_patch` — abgelesen an
   `GET /experimental/tool/ids`, nicht übersetzt.
4. **`bash` trägt keinen Pfad**, nur `command`. Die Grenze deckt die Shell nicht ab — dieselbe
   Lücke wie bei Claude Code, bewusst gleich gelassen.

**Wo die Plugins liegen und wie sie registriert sind:** `.opencode/plugin/` **und**
`.opencode/plugins/` werden beide gescannt, jede `*.ts` und jede ESM-`*.js` darin wird geladen.
Der Mux schreibt in den Singular *und* trägt die Datei als `file://`-URL im `plugin`-Feld ein —
gemessen lädt das **nicht** doppelt (ein Ladevorgang, ein `plugin_origins`-Eintrag), und der
Eintrag macht die Verdrahtung in `opencode debug config` nachlesbar. Eine Rolle ohne Grenze
verliert Datei *und* Eintrag; ein stehengebliebenes Plugin würde weiter eine Regel erzwingen, die
niemand mehr nennt.

**Context-Usage über denselben Plugin-Weg.** Ein `event`-Hook sieht jedes Bus-Ereignis — Eingabe
ist genau `{ event: { id, type, properties } }` —, und `message.updated` trägt pro
Assistentennachricht `sessionID`, `modelID` und `tokens`. `monitoring/opencode-usage-plugin.ts`
baut daraus genau das JSON, das der `StatusLineMonitor` schon liest: ein weiterer Schreiber, kein
zweiter Leser, wie bei Codex. Das `session_id`-Feld trägt Keep Working (`--session <id>` statt
„die letzte Unterhaltung dieses Verzeichnisses"). Zwei Feinheiten: die **erste** Fassung derselben
Nachricht kommt mit `tokens` auf Null und **ohne** `total` — daran trennt das Plugin „noch nichts
gemessen" von „gemessen", statt 0 % zu behaupten. Und die **Fenstergröße ist geschätzt**: `GET
/api/model` eines laufenden opencode liefert ohne angemeldeten Anbieter eine leere Liste, einen
selbst eingetragenen Anbieter kennt der Katalog nie. Die Tokenzahlen sind gemessen, die
Prozentzahl ist eine Schätzung gegen `OPENCODE_FALLBACK_CONTEXT_WINDOW` — dieselbe Entscheidung
wie bei Codex.

**Was weiter `false` steht:** `sub-agents`. `--agent <name>` existiert, belegt aber keine
Unteragenten, die der Mux sieht.

**Kein blockierender Dialog gefunden.** Anders als Codex (Update-Hinweis als Auswahldialog,
Verzeichnis-Vertrauen) kommt opencode direkt an den Prompt — kein Update-Dialog, keine
Vertrauensfrage. Was eine unbeaufsichtigte Session hier aufhält, ist etwas anderes: **ohne
angemeldeten Anbieter** steht sie am Prompt mit dem Hinweis „Run /connect to add an AI provider"
und tut auf jede Eingabe nichts. Das ist kein Dialog, den ein Flag wegnimmt — es ist eine
Voraussetzung, die vor dem Start erfüllt sein muss.

## Capabilities: zwei schalten, fünf behaupten

`AdapterCapabilities` hat sieben Flaggen. **Gemessen am 2026-10-01 lesen nur zwei davon
überhaupt jemand:**

| Flagge | Leser | Wirkung |
|---|---|---|
| `status-line` | 5 | Context-Anzeige im PaneHeader, Fork-Knopf in `SessionCell` |
| `mcp-injection` | 1 | ob `postLaunchInjection` überhaupt läuft |
| `skip-permissions` | 0 | — |
| `project-instructions` | 0 | — |
| `message-bus-participant` | 0 | — |
| `companion-mcp` | 0 | — |
| `sub-agents` | 0 | — |

Die fünf unteren sind **Aussagen über die CLI, keine Schalter im Programm.** Ein `false`
dort ändert heute nichts — es dokumentiert nur, dass etwas ungemessen oder nicht gebaut ist.

**Das ist eine Falle für die UI.** Der Preset-Editor nannte zunächst alle vier „interessanten"
Flaggen im Hinweis „Unter X fehlt: …" und kündigte damit Folgen an, die nicht eintreten.
`NAMED_CAPABILITIES` nennt deshalb nur noch die zwei wirksamen. Wer eine der fünf verdrahtet,
trägt sie dort nach.

Und `sub-agents` ist ein eigener Fall: **beide Tier-2-CLIs haben Unteragenten.** Codex kennt
die Hook-Events `SubagentStart` / `SubagentStop` und ein `codex agents`-Unterkommando, opencode
hat `--agent <name>` und `opencode agent`. Das `false` heißt dort „ob der Mux davon etwas
sieht, ist ungeprüft" — nicht „gibt es nicht".

## Modellauswahl pro Rolle

`AgentAdapter.listModels()` ist **optional**, weil die drei CLIs es verschieden gut können
(gemessen 2026-10-01):

| CLI | auflistbar | Quelle | Dauer |
|---|---|---|---|
| Claude Code | **nein** | `--help` nennt `opus`, `sonnet`, `fable` als *Beispiel* | 0 ms |
| Codex | ja | `codex debug models` → `slug`, `display_name`, `context_window` | ~26 ms |
| opencode | ja | `opencode models` → `anbieter/modell` | ~920 ms |

**Drei Dinge, die hier leicht kaputtgehen:**

1. **Der Codex-Modellname steht unter `slug`, nicht unter `id`.** Das Feld `id` gibt es in
   diesen Einträgen gar nicht — wer darauf liest, bekommt eine Liste leerer Namen.
2. **Keine dieser Listen ist vollständig.** Alle drei CLIs nehmen auch einen vollen
   Modellnamen, der nicht darin steht. Deshalb ist das Feld ein Freitextfeld *mit* Vorschlägen
   (`datalist`), nicht ein Dropdown — und `ENTITY_MODEL_SET` prüft bewusst **nicht** gegen die
   Liste.
3. **Bei opencode ist die Liste nicht stabil.** Sie zeigt nur Modelle angemeldeter Anbieter:
   ohne Anmeldung acht freie, mit Anmeldung mehr. Das ist richtig — angezeigt gehört, was
   benutzbar ist — aber es heißt, dass die Liste eine Momentaufnahme ist und kein Katalog.
   Zwischengespeichert wird pro App-Lauf; ein Neustart holt sie neu.

## LLM-Aufrufe: das Gateway, nicht der eigene Zoo

Seit dem 2026-10-02 gehen Modellaufrufe an das **litellm-Tier-Gateway auf ms01**
(`http://100.67.95.13:4000/v1`, OpenAI-kompatibel), nicht mehr an einen im Mux gepflegten
Ollama-Katalog. Der Grund ist nicht Bequemlichkeit: Jede Anwendung im Haus, die Host, Port und
Modellnamen selbst hält, pflegt dieselbe Tabelle noch einmal — und sie altert in jeder einzeln.
Das Gateway hat sie einmal (`CIPHER-MUX/projects/DGX/litellm-ms01/config.yaml`).

**Tiers statt Modellnamen.** `t1`/`t2` laufen lokal auf ms01 und kosten nichts, taugen aber nicht
zum Formulieren; `t3` ist das Arbeitstier (MiniMax M3); `t4`/`t5` sind Sonnet und Opus. Wer hier
wählt, wählt eine **Preis- und Qualitätsklasse**, kein Modell — ein Modellwechsel am Gateway
erreicht den Mux ohne Codeänderung.

**Vier Dinge, die hier leicht kaputtgehen:**

1. **Der Schlüssel steht in `~/.cipher-litellm.env`, nicht in der Config.** Eine Config wandert in
   Backups, Logs und Fehlerberichte. `readGatewayKey` liest die Datei, und keine Fehlermeldung
   des Klienten enthält den Wert — `test/main/bugreport-enrich.test.ts` hält das fest. Erkannt
   wird **`LITELLM_MASTER_KEY`** (so heißt er auch im Betriebslog von `topic-briefings`), dazu
   `LLM_API_KEY` und `LITELLM_API_KEY` als geduldete Schreibweisen. Die Datei darf auch
   `LITELLM_BASE_URL` tragen, und die **schlägt die Config**: wer das Gateway umzieht, ändert
   dann genau eine Datei.
2. **`/v1` wird ergänzt, wenn es fehlt.** Die Env-Datei trägt `http://…:4000`, die Config
   `http://…:4000/v1`. Ohne Normalisierung landet die Anfrage auf `/chat/completions` statt
   `/v1/chat/completions`, und litellm antwortet dort **gar nicht** — der Aufruf läuft in die
   Frist statt in einen 404, und ein 45-Sekunden-Timeout sieht aus wie ein überlastetes Gateway.
   Genau daran ist der erste Rauchtest am 2026-10-02 gescheitert; gegen einen Mock wäre weder
   das noch der Schlüsselname je aufgefallen.
3. **`node:http`, nicht `fetch`.** Dieselbe Falle wie beim Ollama-Klienten: `fetch` im
   Main-Prozess geht über Electrons Chromium-Netzstack und fällt dort über
   System-Proxy-Einstellungen.
4. **Der Prompt und `parseEnrichedOutput` müssen dieselben Feldnamen nennen.** Der Parser liest
   zeilenweise `name:` und erkennt Listen an `- `; nennt der Prompt ein Feld anders, fällt es
   **still** auf seinen Default zurück. `ERWARTETE_FELDER` und ein Test halten die Naht.

**Der Bugreport nutzt das als erster:** Diktat rein, aufgeräumter Report raus, Original bleibt
wörtlich erhalten, Ausfall blockiert nichts. Dazu Panezustand (`capture-pane`, Pane-Maße,
`alternate_on`) und Anker-Commit im Report, plus eine Notiz, die die outbox-Datei spiegelt.

## Entities, MCP, Voice

- **Entities** sind Rollen mit eigenem Verzeichnis, eigener CLAUDE.md und Recovery-Fähigkeit:
  Workshop, Cyber Factory, Companion, Refinement, Ideation Partner, Debugger,
  Testing Assistant, Audit, Voice-Relay, Launcher. Registry: `src/main/session/entity-registry.ts`.
- **MCP-Server** im Main-Prozess, **67 Tools**, **eine `McpServer`-Instanz pro Client**
  (`mcp-server.ts:createSession`) — deshalb kann Workspace-Kontext pro Verbindung gebunden werden.
  **Der Grep zählt zu wenig:** `registerMuxTool(` findet 57, weil die zehn Entity-Handoffs in
  `registerAllHandoffTools` aus einer Definition erzeugt werden und nicht einzeln dastehen.
  Maßgeblich ist, was eine Verbindung angeboten bekommt. Referenz: `docs/mcp-tools.md`,
  dort alle 67 in zwölf Kategorien.
- **Worker-Startup:** Nach `mux_create_session` 8–10s warten, dann `tmux capture-pane` prüfen,
  dann `tmux send-keys`. `mux_send` ist Inter-Session-Kommunikation, **kein** Prompt-Input.
- **Voice:** Silero VAD im Renderer → Whisper STT → `VoiceInputRouter` → tmux sendKeys.
  Whisper-Model unter `~/.config/cipher-mux/models/whisper/`, **nicht** `app.getPath('userData')`.
  tmux sendKeys nutzt `\r` (0x0d), nicht `\n`.
- **Piper-Voices** brauchen ONNX-Metadata direkt im Modell, nicht nur in `model.onnx.json` —
  sonst hängt der Worker bis zum 30s-Timeout und fällt auf macOS `say` zurück.

## Tags: fünf Achsen, zwei editierbare Klassen

Die Quelle ist `src/shared/tag-axes.ts` — unter `shared/`, weil Main und Renderer sie beide
brauchen. **Jede andere Stelle leitet ab**, statt dieselbe Tatsache ein zweites Mal
aufzuschreiben: `EXCLUSIVE_TAG_CLASSES` in `shared/constants.ts`, `SEED_CLASSES` in
`tag-repository.ts`, `SEED_TAGS` in `note-tagging.ts`, die Erhaltungsliste in
`note-type-tags.ts`.

**Tatsachen, vom Prozess gesetzt** (`PROCESS_SET_AXES`) — angezeigt, nicht zur Auswahl:

| Achse | Herkunft |
|---|---|
| `workspace` | die aktive Workspace-**ID**, nicht der Anzeigename |
| `entity` | der Verbindungskopf `X-Mux-Entity`, beim `initialize` gebunden |

**Entscheidungen, hart zur Auswahl** (`PICK_ROWS`) — drei Reihen mit Knöpfen im TagBar:

| Klasse | Werte aus | ausschließend |
|---|---|---|
| `kind` | Code (`KIND_VALUES`, 14) | ja |
| `phase` | Code (`PHASE_VALUES`, 7) | nein |
| `status` | Code (`STATUS_VALUES`, 6) | ja |
| `severity` | **Registry**, editierbar; Startbelegung `low mid hi now` | ja |
| `component` | **Registry**, editierbar; keine Startbelegung | nein |

Der Unterschied zwischen `source: 'axis'` und `source: 'registry'` ist die **Herkunft der
Werte**, nicht ihre Verbindlichkeit. Beide erscheinen als Knopf — ein editierbarer Wert, der
nirgends zur Auswahl steht, ist eine Einstellung ohne Wirkung.

**Drei Dinge, die hier leicht kaputtgehen:**

1. **`SEED_CLASSES` wird bei jedem Start eingemischt, `REGISTRY_SEED_CLASSES` nur, wenn die
   Klasse fehlt.** Vertauscht man das, kommt ein im TagManager entfernter `severity`-Wert beim
   nächsten Start zurück — ein Knopf, dessen Wirkung ein Neustart aufhebt.
2. **Der Code darf nur vergebbare Tags nennen.** `mux_notes_create` weist unbekannte Tags hart
   ab, und das trifft auch Tags, die eine Rolle aus ihrer **eigenen** Anweisung nimmt. Am
   2026-10-01 standen 62 solche Stellen in zwölf Dateien (`kind:lueckenanalyse`,
   `status:closed`, `category:owasp`, `skill:pre-mortem`). `test/main/code-writes-axis-tags.test.ts`
   liest dafür den Quelltext von `src/main` — die Handoff-Definitionen stehen inline in
   `registerAllHandoffTools` und lassen sich nicht als Daten durchlaufen.
3. **Auto-Tagging filtert, es bittet nicht.** `filterToAxes` stutzt das Modellergebnis zurecht;
   der Prompt nennt die Achsen zusätzlich. Eine Bitte allein kann ein Modell überhören — genau
   so sind 14 Klassen und 29 `kind`-Werte entstanden.

**Der Umzug der Bestands-Tags** läuft einmalig beim Start (`runTagMigrationOnce`, Marker
`.tag-axes-migration-done`) und ist nachweislich wiederholbar. Die Abbildung samt Begründung
pro Wert steht in `src/main/notes/tag-migration.ts`; `DISSOLVED_CLASSES` nennt die neun
aufgelösten Klassen und **warum** jede ging. Gemessen am 2026-09-30 über 958 Notes:
`kind` 29 → 13 Werte, `phase` von 49 Vergaben (überwiegend Wellennummern) auf 607 echte,
`workspace` 13 Schreibweisen → 8 IDs, klassenlose Tags 269 → 117.

**Offen:** 16 `preset.md` unter `~/.config/cipher-mux/entities/` tragen die alten
Tag-Anweisungen noch. Diese Dateien sind **write-once** (`session-manager.ts:1097`), damit
Handarbeit überlebt — ein Vorlagen-Fix im Code erreicht sie also nicht. Nur `audit` und
`voice-relay` werden bei jedem Sessionstart neu geschrieben.

## Konventionen

- TypeScript strict, Preact mit JSX, ESLint + Prettier, typed IPC über `shared/ipc-channels.ts`
- Electron: `contextIsolation=true`, `nodeIntegration=false`
- **Tests importieren per ESM `import`** (67 von 71 Dateien); `require()` nutzen vier Ausreißer
  und erzeugt einen Lintfehler
- CSS: Tokens mit `--color-*`-Präfix, **nicht** `--accent`/`--text-secondary`. `--radius-*` ist
  projektweit `0` — keine abgerundeten Ecken. **13 Themes** — die Liste steht in
  `shared/grid-types.ts` (`ThemeName`), `useTheme.ts` leitet `ALL_THEMES` daraus ab. Unter
  `styles/` liegen nur **12** `body[data-theme]`-Blöcke: `cipher-ivory` ist der Default und
  braucht kein Attribut. Wer die Blöcke zählt, zählt einen zu wenig
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

