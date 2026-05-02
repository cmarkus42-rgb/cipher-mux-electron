# cipher-mux-electron

Electron-basierte Kommandozentrale für Claude Code Projekte. Ein Fenster mit eingebetteten Terminals (tmux + xterm.js), Message Bus für Inter-Session-Kommunikation, MCP-Server, Orchestrator-Session und komfortablem Projekt-Kick-off.

## Aktueller Status

**Phase: Komplett — Polish & Erweiterung**

Phasen-Übersicht:
1. ~~Anforderungsinterview (Touchpoint) → `docs/requirements.md`~~ ✅ (2026-04-13)
2. ~~Spezifikation erstellen (Autonom) → `docs/SPEC.md`~~ ✅ (2026-04-13)
3. ~~Technische Entscheidungen (Touchpoint) → `docs/decisions/`~~ ✅ (2026-04-13)
4. ~~Task-Dekomposition (Autonom) → `docs/todo.md`~~ ✅ (2026-04-13)
5. ~~Autonome Implementierung (Autonom) → Code~~ ✅ (2026-04-14)
6. ~~Review, Test & Iteration → Feedback-Loop~~ ✅ (2026-04-17)
7. ~~Voice-Pipeline (VAD + STT + TTS) + Bugreport-Interview~~ ✅ (2026-04-19)
8. ~~AgentAdapter (TP-2) + Task-System + MPO~~ ✅ (2026-04-23)
9. ~~Phase A (Theme-System) + Phase B (MCP/Terminal/StatusLine Polish)~~ ✅ (2026-04-23)
10. ~~Phase C4 (Session Coloring) + Phase D (Workspaces + Personas) + Phase E (Communication) + Phase G1 (Shell Button)~~ ✅ (2026-04-24)
11. ~~v0.9.1–0.9.5: Unified Sidebar, Workspace Apply E2E, Bugfixes, Cell Split, Terminal Width~~ ✅ (2026-04-24)
12. ~~v0.9.6: Notes Editor — dritte Grid-Cell-Option, CodeMirror 6, Ollama Auto-Tagging~~ ✅ (2026-04-25)
13. ~~v0.9.7–0.9.8: Hands-Free Scroll, Voice Settings, Grid-Nav, Keep Working, TTS Stop~~ ✅ (2026-05-02)
14. ~~v0.9.9: Keep Working Restore Fix, BT Shutter App-Bundle~~ ✅ (2026-05-02)
15. ~~v0.9.10: Keep Working Restore Fix v2 — 3-Layer Bug~~ ✅ (2026-05-02)

**Status:** v0.9.11, 591 Tests (54 Test-Dateien). BT Shutter Fix: macOS 26 blockiert `kIOHIDOptionsTypeSeizeDevice` fuer adhoc-signierte Binaries — umgestellt auf non-exclusive HID + CGEventTap Volume-Suppression.

### Keep Working Restore — Fragile Zone

Keep Working Restore war Gegenstand von 3 Bug-Fix-Runden (v0.9.9–v0.9.10). Die Kette ist lang und hat enge Timing-Abhängigkeiten. **Wenn du in dieser Gegend arbeitest, lies das hier.**

#### Datenfluss (happy path)

```
Quit:  destroy() → keepWorkingSnapshot in Config schreiben (Session-Namen, Pfade, Grid-Slots)
       → tmux.disconnect() (Sessions überleben, tmux-Server bleibt)

Start: init() → synchron: stale Session-IDs aus ui.grid clearen
       → async: mcpServer.start → tmux.connect → sessionManager.recover()
         → restoreKeepWorkingFromRecovery(): tmux-Sessions matchen, Grid-State in Config schreiben
         → Push KEEP_WORKING_RESTORE an Renderer + Cache setzen
       Renderer: Poll (500ms/10s) holt Cache → applyKeepWorkingRestore() → Grid + Sessions da
```

#### Was leicht kaputtgeht

1. **tmux-Output ist nicht sauber.** `listSessions()` parst `tmux list-panes -a` — das liefert gelegentlich malformed Lines (leere Felder, Zombie-Sessions). Jeder Code der auf `tmuxSession.name` etc. zugreift MUSS defensiv sein. Ein Crash hier killt die gesamte Init-Chain still.

2. **Session-IDs überleben keinen Restart.** `recover()` vergibt neue IDs für recovered Sessions. `ui.grid` Config enthält alte IDs. Deshalb werden Slot-Session-IDs beim Startup synchron genullt. Wenn du an `configStore` oder `ui.grid` Persistence arbeitest: nie davon ausgehen, dass Session-IDs über Restarts stabil sind.

3. **Timing Main ↔ Renderer.** Die Init-Chain ist async (200ms–2s). Der Renderer mounted schneller. Deshalb: Pull ist ein Poll (nicht einmaliger Abruf), und Push kann vor `dom-ready` gedropt werden. Wenn du neue IPC-Events in der Init-Chain hinzufügst: gleiches Pattern (Cache + Poll + Push als Backup).

4. **`destroy()` muss durchlaufen.** Nur Cmd+Q schreibt den Snapshot. Force-Kill → kein Snapshot → kein Restore. Das ist by design, aber wichtig zu wissen.

#### Diagnostik

- **`/tmp/kw-debug.json`** — wird bei jedem Startup geschrieben (Success UND Error-Fall). Prüfe `phase`, `error`, `recovered`, `orphaned`.
- **Terminal-Start für Logs:** `/Applications/cipher-mux.app/Contents/MacOS/cipher-mux 2>&1 | tee /tmp/kw-test.log`

## Build & Test

```bash
npm install
npm run build          # TypeScript + Electron Builder
npm run dev            # Electron dev mit Hot-Reload
npm run test           # Node.js test runner
npm run lint           # ESLint
```

## Projektstruktur

```
cipher-mux-electron/
├── CLAUDE.md
├── package.json
├── tsconfig.json / tsconfig.main.json / tsconfig.renderer.json
├── electron-builder.yml
├── docs/
│   ├── SPEC.md            ← Technische Spezifikation (Phase 2)
│   ├── requirements.md    ← Anforderungskatalog (Phase 1)
│   ├── todo.md            ← Task-Liste mit Abhängigkeiten (Phase 4)
│   └── decisions/         ← ADRs (Phase 3)
├── .claude/
│   ├── settings.json
│   └── skills/            ← Workflow-Skills für jede Phase
├── src/
│   ├── main/
│   │   ├── main.ts, window-manager.ts, ipc-hub.ts, preload.ts
│   │   ├── tmux/          ← TmuxManager (Control Mode), Parser, Batcher
│   │   ├── message-bus/   ← SQLite CRUD, Schema
│   │   ├── mcp/           ← Streamable HTTP Server, Tools, Auth
│   │   ├── session/       ← SessionManager, OrchestratorTemplate, MpoTemplate
│   │   ├── project/       ← ProjectScanner, KickoffOrchestrator, LauncherPrompt, KickoffWatcher
│   │   ├── config/        ← ConfigStore (JSON-File Store)
│   │   ├── monitoring/    ← StatusLineMonitor, StatusLineHook
│   │   ├── bugreport/     ← BugreportManager, BugreportResolve, OllamaClient
│   │   ├── voice/         ← VoiceManager, ConversationEngine, STT (Whisper), TTS (Piper), VoiceInputRouter
│   │   ├── agent/         ← AgentAdapter Interface, ClaudeCodeAdapter, AdapterRegistry
│   │   ├── task/          ← TaskManager, TaskWatcher, TaskHooks, BugreportSource
│   │   ├── mpo/           ← InputRequestWatcher (MPO Input Requests)
│   │   ├── notes/         ← NoteManager (Filesystem CRUD), NoteTagging (Ollama Auto-Tagging)
│   │   ├── workspace/     ← WorkspaceManager (Apply, Prompt Resolution, Persona Skill Sync)
│   │   └── util/          ← exec-util, dependency-check, deep-merge
│   ├── renderer/
│   │   ├── app.tsx, index.html
│   │   ├── components/    ← SessionGrid, SessionCell, LauncherCell, NotesCell, NoteEditor,
│   │   │                     TerminalPane, PaneHeader, SidebarPanel, SidebarWindow,
│   │   │                     GridPlacementPopup, StatusBar, GridControls, KickoffDialog,
│   │   │                     SessionDialog, ProjectCard, ProjectPopup, BugreportDialog,
│   │   │                     InfoSettingsView, RecoveryDialog, VoiceControl,
│   │   │                     WorkspacesWindow, WorkspacesTab, PersonasTab, WorkspacePopup
│   │   ├── hooks/         ← useTerminal, useMessages, useSessions, useContextUsage,
│   │   │                     useVoiceSession, useGrid, useInputRequests, useProjects,
│   │   │                     useShortcuts, useTheme, useNotes
│   │   ├── voice/         ← vad-loader (Silero ONNX), audio-capture-worklet
│   │   ├── styles/        ← theme.css, layout.css, components.css
│   │   └── fonts/         ← Rajdhani, Fira Code
│   └── shared/
│       ├── ipc-channels.ts ← Typed Channel Constants
│       ├── types.ts        ← Shared Interfaces
│       ├── constants.ts    ← App-weite Konstanten
│       ├── brand.ts        ← Branding-Config (Pfade, Namen)
│       ├── grid-types.ts   ← Grid-Layout Types
│       ├── terminal-theme.ts ← xterm.js Farbthema
│       └── version.ts      ← Auto-generierte Versionsnummer
└── test/
    └── main/              ← Unit-Tests für Business-Logik (43 Dateien)
```

## Referenz-Projekte

- `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-desktop-electron` — Electron-Patterns, Build-Setup, IPC-Bridge
- `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux` — v1 (Node.js HTTP-Server), Module zur Migration: ProjectScanner, ConfigStore, WorkspaceLoader

## Infrastruktur

- **Session-Backend:** tmux (macOS, Homebrew)
- **Message Bus:** SQLite via better-sqlite3 (WAL-Modus, Single-Writer aus Main Process)
- **MCP-Server:** localhost HTTP im Main Process (Session-GC nach 30min Inaktivitaet, max 5 MCP-Sessions, `/health` Endpoint)
- **Persistenz:** ConfigStore (JSON), SQLite (Messages/Sessions)
- **Keine externe API** — nutzt Claude Code CLI für LLM-Interaktion

## Code-Konventionen

- TypeScript strict mode
- Preact mit JSX (`.tsx` für Renderer-Komponenten)
- ESLint + Prettier
- Electron: contextIsolation=true, nodeIntegration=false
- IPC: typed channels via shared types
- CSS: 10 Themes via `body[data-theme="<id>"]`, Theme-Picker in Settings, `themes.json` Manifest. Tokens via CSS Custom Properties, ANSI-Farben pro Theme. Default: cipher-ivory (light) / cipher-dark (dark)
- Naming: camelCase für Variablen/Funktionen, PascalCase für Komponenten/Klassen

## Architekturentscheidungen

- **ADR-001:** tmux Control Mode (-C) für Streaming — `docs/decisions/ADR-001-tmux-streaming.md`
- **ADR-002:** Streamable HTTP für MCP Transport — `docs/decisions/ADR-002-mcp-transport.md`
- **ADR-003:** statusLine-Hook für Context-Usage (real-time) — `docs/decisions/ADR-003-statusline-integration.md`
- **ADR-004:** Vite als Renderer-Bundler — `docs/decisions/ADR-004-renderer-bundler.md`
- **ADR-005:** WebGL + Canvas-Fallback für xterm.js — `docs/decisions/ADR-005-xterm-renderer.md`
- **ADR-006:** ulidx für ULID-Generierung — `docs/decisions/ADR-006-ulid-library.md`
- **ADR-007:** 7 Tage zeitbasierte Message-Retention — `docs/decisions/ADR-007-message-retention.md`
- **ADR-008:** Strukturiertes Orchestrator CLAUDE.md Template — `docs/decisions/ADR-008-orchestrator-template.md`

## Workspaces + Personas

Personas definieren Rollen (Name, Farbe, Default-Prompt). Workspaces kombinieren Personas in einem Grid-Layout mit Projekt-Zuweisungen.

- **Personas:** ConfigStore `personas` Key. Builtin-Personas (Orchestrator, MPO, Worker, empty) sind locked (nur Prompt editierbar). Custom Personas voll editierbar.
- **Workspaces:** ConfigStore `workspaces` Key. Grid-Editor mit Merge-Handles (vertikale Zell-Verschmelzung), Cell Inspector, Prompt Resolution.
- **Prompt Resolution (3-Level):** cell.prompt > workspace.promptOverrides[persona] > persona.defaultPrompt
- **Separates Fenster:** Workspaces + Personas haben ein eigenes BrowserWindow (960x720), erreichbar via Workspace-Popup oder StatusBar. NICHT mehr im Info/Settings-Popup.
- **URL-Routing:** `index.html?view=workspaces#tab` — main.tsx routet zu WorkspacesWindow oder App basierend auf URL-Parameter.
- **Workspace Apply:** Grid wird auf Workspace-Dimensionen resized, Merges werden als rowSpans uebertragen, Sessions spawnen fuer non-empty Cells mit zugewiesenen Projekten.
- **Grid-Limits:** Max 7 Cols x 3 Rows (konsistent mit MAX_GRID_COLS/MAX_GRID_ROWS in constants.ts)
- **Persona Skill Sync:** Generiert .claude/skills/personas/ Skills aus Persona-Prompts.

## MCP-Server: Worker-Session-Handling

Der MCP-Server stellt 20+ Tools bereit, die von Orchestrator, MPO und Worker-Sessions genutzt werden:

**Session-Tools:** `mux_create_session`, `mux_kill_session`, `mux_sessions`, `mux_send`, `mux_read`, `mux_status`, `mux_context_usage`
**Task-Tools:** `mux_task_create`, `mux_task_update`, `mux_task_list`, `mux_task_get`
**Notes-Tools:** `mux_notes_create`, `mux_notes_list` — erlauben MCP-Clients Notes in der Sidebar anzulegen
**UI-Control:** `mux_grid_resize`, `mux_grid_place`, `mux_session_focus`, `mux_session_eject`, `mux_sidebar_toggle`, `mux_ui_highlight`, `mux_ui_open`, `mux_theme_set`
**Voice/Scroll:** `mux_tts_speak` (TTS mit Priority), `mux_cell_scroll` (up/down/top/bottom/to-marker)
**Sonstige:** `kickoff_complete`, `mux_bugreport_resolve`, `mux_input_request_create`

**Wichtig für Konsumenten (Orchestrator/Clients):**

### Worker-Startup-Protokoll (Pflicht)

`mux_send` schreibt auf den Message Bus, aber Claude-Sessions lesen den Bus **nicht automatisch als Prompt-Input**. Messages die vor Claude-Startup gesendet werden, gehen verloren (Race Condition).

**Korrektes Vorgehen:**

1. `mux_create_session` — Session erstellen
2. **8-10s warten** — tmux + zsh + Claude CLI muessen starten
3. `tmux capture-pane -t <tmuxSession> -p | tail -30` — Pruefen ob Claude-Prompt (❯) sichtbar
4. Falls nicht bereit: weitere 5s warten, erneut pruefen
5. **`tmux send-keys -t <tmuxSession> "<instruktion>" Enter`** — Instruktion DIREKT in den Pane schicken
6. **15s warten** — Claude muss Task parsen
7. `tmux capture-pane` — Pruefen ob Worker tatsaechlich arbeitet
8. **Monitoring-Loop (alle 2min):** `tmux capture-pane` + `mux_context_usage` bis Worker fertig

### Warum nicht mux_send?

`mux_send` ist fuer Inter-Session-Kommunikation gedacht (z.B. Status-Updates, Bug-Notifications). Es ist **kein Prompt-Input-Mechanismus**. Claude liest den Bus nur wenn es explizit `mux_read` aufruft — was ein idle Worker nicht tut.

## Voice-Pipeline

STT-basierte Spracheingabe in fokussierte Sessions. Architektur:

```
Renderer (Silero VAD) → IPC → Main (ConversationEngine → Whisper STT → VoiceInputRouter → tmux sendKeys / scroll / gridNav)
```

- **STT:** Whisper.cpp via `@fugood/whisper.node`, Model unter `~/.config/cipher-mux/models/whisper/ggml-small.bin`
- **VAD:** Silero ONNX im Renderer, Thresholds: positiveSpeech=0.5, minSpeechFrames=3 (optimiert fuer kurze Befehle)
- **Routing:** VoiceInputRouter dispatcht Transkription an fokussierte tmux-Session (Pin > Focus)
- **Voice-Commands:** "abschicken"/"absenden"/"senden" → Enter, "neue zeile" → Newline
- **Scroll-Commands:** "hoch"/"runter"/"ganz hoch"/"ganz runter"/"zum marker" → Terminal-Scroll via IPC CELL_SCROLL
- **Grid-Nav-Commands:** "grid rechts/links/hoch/runter" → Grid-Fokus wechseln via IPC GRID_NAV. Fuzzy-Matching fuer Whisper-Varianten (grit/gritt/great etc.)
- **Voice Submit Mode:** auto (Enter nach STT) oder manual (BT-Clicker). Konfigurierbar in Settings.
- **TTS:** Piper (lokal) oder macOS say (Fallback/Auswahl). Stoppbar per UI-Toggle oder stopSpeech(). Konfigurierbar: ttsEnabled, ttsVoice (local/macos)
- **Voice Commands Toggle:** voiceCommandsEnabled Config — deaktiviert Scroll/Grid-Nav Matching
- **MCP-Tool:** `mux_cell_scroll` (up/down/top/bottom/to-marker) — programmatisches Scrollen durch Entities
- **Terminal-Registry:** `src/renderer/terminal-registry.ts` — globale Map fuer xterm.js Instanzen + Scroll-Marker per sessionId
- **tmux sendKeys:** Verwendet `\r` (0x0d, Carriage Return) fuer Enter, nicht `\n` (0x0a)
- **CODING_BIAS_PROMPT:** Whisper-Prompt mit Coding-Terminologie + Voice-Command-Woertern fuer bessere Erkennung

## AgentAdapter Interface (TP-2)

Abstraktion für verschiedene AI-Agent-Backends:

- `AgentAdapter` Interface: `isAvailable()`, `getCapabilities()`, `executeCommand()`, `streamOutput()`
- `ClaudeCodeAdapter` (Tier-1): Vollständig implementiert, `--dangerously-skip-permissions` konfigurierbar via ConfigStore `agent.skipPermissions`
- `ReferenceStubAdapter` (Tier-2): Stub für Dokumentation
- `AdapterRegistry`: Discovery + Registrierung

## MPO (Multi-Project Orchestrator)

Eingebaute Funktion von cipher-mux. Empfaengt Anforderungspakete, zerlegt sie in Teilprojekte, startet N parallele Launcher-Sessions und koordiniert deren Arbeit.

- **Managed Dir:** `~/.config/cipher-mux/mpo` (CLAUDE.md + .mcp.json generiert)
- **Session-Name:** `MPO` (recovery-faehig)
- **Template:** `src/main/session/mpo-template.ts` (Persona, 10-Phase-Lifecycle, 5-Level-Eskalation, Monitoring)
- **MCP-Tool:** `mux_input_request_create` fuer Bubble-Requests an die Sidebar
- **StatusBar:** `mpo`-Button mit Active-State
- **Kein Auto-Start** — manuell per Button
- **Grid-Placement:** Naechster freier Slot; bei vollem Grid oeffnet PlacementPopup zur Slot-Auswahl

## Notes Editor

Minimalistischer Markdown-Editor als dritte Grid-Cell-Option (neben Session und Launcher).

- **Storage:** `~/.config/cipher-mux/notes/` (global) bzw. `~/.config/cipher-mux/notes/workspace-<id>/` (workspace-scoped)
- **Format:** Markdown mit YAML-Frontmatter (gray-matter), Tags + Title im Frontmatter
- **Editor:** CodeMirror 6 mit CM6 HighlightStyle (Obsidian-aehnlich), Live-Markdown-Rendering
- **Auto-Tagging:** Ollama (gemma4:26b) schlaegt bis zu 5 Tags vor bei manuellem Cmd+S. Auto-Save (2s Debounce) schreibt nur die Datei, kein Tagging.
- **Tag-Repository:** Seed-Tags (27 vordefiniert) + dynamisch wachsend, persistiert in `.tags.json`
- **Sidebar:** Notes-Tab mit Suchfeld, Tag-Filter-Chips, Doppelklick oeffnet in NotesCell, Delete-Button (hover)
- **Grid-Integration:** LauncherCell hat dritten "notes"-Button, GridSlot hat `type: 'session' | 'notes'`
- **IPC:** 7 Channels (NOTES_LIST, NOTES_READ, NOTES_SAVE, NOTES_CREATE, NOTES_DELETE, NOTES_TAGS, NOTES_CHANGED)
- **MCP:** `mux_notes_create` (mit Tags + Scope) und `mux_notes_list` — MCP-Clients koennen Notes anlegen, UI aktualisiert via NOTES_CHANGED Event
- **Delete:** Sidebar (hover-reveal Button) + aktiver Tab (Trash-Icon), jeweils mit Confirm-Dialog

## Testcase-Notes schreiben

Testcase-Notes verwenden `noteType: testcase` und ein spezielles Checkbox-Format, das der TestcaseView (Tri-State-Checkboxen, Kommentare, Screenshots) rendert. **Normales Markdown wird NICHT gerendert** — der Parser erkennt nur dieses Format:

```markdown
## Sektions-Titel

- [ ] **T-ID.1** Beschreibung des Testcases
- [ ] **T-ID.2** Noch ein Testcase
- [x] **T-ID.3** Bestandener Test
- [-] **T-ID.4** Fehlgeschlagener Test // Kommentar zum Fehler
```

**Regeln:**
- Sektionen: `## Titel` (H2-Headings)
- Items: `- [ ] **ID** Beschreibung` (Checkbox + Bold-ID + Text)
- Status: `[ ]` = offen, `[x]` = PASS, `[-]` = FAIL
- Kommentare: ` // Kommentartext` nach der Beschreibung
- Screenshots: `![screenshot](pfad)` im Kommentar
- IDs muessen eindeutig sein (z.B. `T-BF.1`, `T-VS.3`)
- Kein anderes Markdown verwenden (keine `###`, keine `**bold**` in Beschreibungen, keine Tabellen)

**Beim Anlegen via MCP:** `mux_notes_create` mit Tag `testcase` — der Tag setzt `noteType: testcase` automatisch.

## BT Shutter / Bluetooth Remote Control

Bluetooth-Fernbedienungen (AB Shutter 3, CamKix, etc.) steuern cipher-mux Sessions. Architektur:

```
BT Remote → macOS HID → ab-shutter-bridge (Swift) → JSON stdout → BtShutterManager (TS) → ipc-hub → tmux sendKeys
```

### Komponenten

- **Swift Bridge:** `/Users/Shared/Nextcloud/Claude/ab-shutter-bridge/ABShutterBridge.swift` (Quellcode)
- **Compiled Binary:** `assets/bin/ab-shutter-bridge` (wird via `extraResources` nach `Contents/Resources/bin/` kopiert)
- **TS Manager:** `src/main/bluetooth/bt-shutter-manager.ts` — spawnt Binary als Child-Process, parst JSON-Events
- **Integration:** `src/main/ipc-hub.ts` → `startBtShutter()` / `stopBtShutter()` — Init-Chain, Button→sendKeys Routing

### macOS 26+ HID-Zugriff (WICHTIG)

**`kIOHIDOptionsTypeSeizeDevice` funktioniert NICHT mehr** auf macOS Tahoe (26.x) fuer adhoc-signierte Binaries. Apple hat die Anforderungen verschaerft — `kIOReturnNotPermitted` (-536870207) auch mit korrekten TCC-Eintraegen.

**Loesung (seit v0.9.11):** Zwei-Stufen-Ansatz:
1. `IOHIDManagerOpen` mit `kIOHIDOptionsTypeNone` (non-exclusive) — funktioniert ohne spezielle Signatur
2. `CGEventTap` auf `.cgSessionEventTap` suppressed NX_SYSDEFINED Events (Subtype 8 = Media Keys) waehrend der HID-Callback aktiv ist

**CGEvent-Feld-Mapping (macOS 26, verifiziert):**
- Field 99 = NX_SYSDEFINED Subtype (8 = `NX_SUBTYPE_AUX_CONTROL_BUTTONS`)
- Field 87 = Media Key Data (keyCode + flags encoded)
- `.mouseEventNumber` (Field 0) enthaelt NICHT data1 fuer SYSDEFINED Events — das war der urspruengliche Bug

### Binary bauen

```bash
cd /Users/Shared/Nextcloud/Claude/ab-shutter-bridge
swiftc ABShutterBridge.swift -o ab-shutter-bridge -framework IOKit -framework Foundation
cp ab-shutter-bridge /path/to/cipher-mux-electron/assets/bin/
```

NICHT `codesign -fs -` ausfuehren — das erzeugt explicit adhoc (flags=0x2) statt linker-signed (flags=0x20002). Der Compiler erzeugt automatisch linker-signed, was fuer TCC-Erkennung sauberer ist.

### Button-Mapping

| BT Button | HID Usage | Default Action | Relay JSON |
|-----------|-----------|---------------|------------|
| BIG (Vol+) | 0xE9 (Consumer Page 0x0C) | Clear input (Ctrl+U) | `{"button":"big","action":"clear"}` |
| SMALL (Vol-) | 0xEA (Consumer Page 0x0C) | Submit (Enter) | `{"button":"small","action":"submit"}` |

### Permissions (macOS System Settings)

Benoetigt fuer den User:
- **Eingabeueberwachung (Input Monitoring):** ab-shutter-bridge Binary UND cipher-mux.app
- **Bedienungshilfen (Accessibility):** ab-shutter-bridge Binary (fuer CGEventTap)

Bei jedem neuen Binary (Neukompilierung) fragt macOS erneut nach — das ist korrekt, da sich der Code-Hash aendert.

### Erweiterung: Neue BT Remotes

Alle gaengigen BT Camera Shutter Remotes nutzen dasselbe HID Consumer Control Protokoll (Usage Page 0x0C, Volume Up/Down). Die Bridge ist bereits generisch: ohne VID/PID-Filter matched sie JEDES Consumer Control Device. Fuer neue Remote-Typen mit anderen HID Usages: `inputCallback` in `ABShutterBridge.swift` erweitern, neues Usage-Mapping hinzufuegen.

## Bekannte Constraints

- **macOS-only:** tmux als harte Abhängigkeit, osascript-Integration
- **tmux als einziges Session-Backend:** Kein Dual-Stack mit node-pty. Sessions überleben Electron-Crashes
- **Single-Writer SQLite:** Nur Main Process schreibt — kein Concurrent-Write-Problem
- **xterm.js Streaming:** High-frequency tmux-Output erfordert Batching/Throttling der IPC-Bridge. Terminal-Fit mit 150ms Debounce und Min-Size-Guard
- **StatusLine 2.x:** Parser unterstuetzt Claude Code 2.x `context_window` nested Format zusaetzlich zum 1.x Flat-Format
- **Preact statt React:** ~3KB, React-API-kompatibel, aber einige React-Ecosystem-Libs brauchen Aliasing. **Overlay-Dismiss:** KEIN `stopPropagation()` auf Popup-Container verwenden — bricht Child-Klicks in preact/compat. Stattdessen `e.target === e.currentTarget` auf dem Overlay pruefen
- **Whisper Model-Pfad:** Muss `~/.config/cipher-mux/` sein, NICHT `app.getPath('userData')` (dev/prod Divergenz)
- **better-sqlite3 ABI-Mismatch:** `npm run test` rebuilt für Node.js, `npm start` rebuilt für Electron. App immer mit `npm start` starten (prestart-Hook garantiert Electron-ABI). Direktes `electron .` nach Tests → MessageBus/TaskManager nicht verfügbar.

## Workflow-Regeln

1. **Spec first:** Kein Code ohne Eintrag in SPEC.md oder todo.md
2. **Kleine Batches:** Max 5-10 Dateien pro Commit
3. **Tests bei jeder Änderung:** Unit-Tests für Business-Logik
4. **ADR vor Implementierung:** Jede technische Entscheidung wird in `docs/decisions/` dokumentiert
5. **Phasen einhalten:** Skills folgen dem 6-Phasen-Prozess — keine Phase überspringen

## Skill-Referenz

| Phase | Skill | Zweck |
|-------|-------|-------|
| 1 | `/interview` | Anforderungsinterview durchführen |
| 2 | `/spec` | Technische Spezifikation aus Requirements erstellen |
| 3 | `/decide` | ADRs für offene Entscheidungspunkte erstellen |
| 4 | `/decompose` | SPEC.md in implementierbare Tasks zerlegen |
| 5 | `/implement` | Nächsten offenen Task implementieren |
| — | `/doc-review` | Dokumentation mit Code-Stand abgleichen |
