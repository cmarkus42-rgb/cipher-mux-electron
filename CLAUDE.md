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

**Status:** v0.8.9-beta, ~448 Tests (43 Test-Dateien), Build sauber. Workspaces, Personas, Push-Delivery, Shell Sessions und separates Workspace-Editor-Fenster komplett. v0.9.0 nach Polish + Final Round.

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
│   │   ├── workspace/     ← WorkspaceManager (Apply, Prompt Resolution, Persona Skill Sync)
│   │   └── util/          ← exec-util, dependency-check, deep-merge
│   ├── renderer/
│   │   ├── app.tsx, index.html
│   │   ├── components/    ← SessionGrid, SessionCell, LauncherCell, TerminalPane, PaneHeader,
│   │   │                     ChatroomPanel, ChatToggleButton, StatusBar, GridControls,
│   │   │                     KickoffDialog, SessionDialog, ProjectCard, ProjectPopup,
│   │   │                     InputRequestsPanel, BugreportDialog, InfoSettingsView,
│   │   │                     RecoveryDialog, VoiceControl, WorkspacesWindow,
│   │   │                     WorkspacesTab, PersonasTab, WorkspacePopup
│   │   ├── hooks/         ← useTerminal, useMessages, useSessions, useContextUsage,
│   │   │                     useVoiceSession, useGrid, useInputRequests, useProjects,
│   │   │                     useShortcuts, useTheme
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

Der MCP-Server stellt Tools bereit (`mux_create_session`, `mux_send`, etc.), die von der Orchestrator-Session genutzt werden. **Wichtig für Konsumenten (Orchestrator/Clients):**

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
Renderer (Silero VAD) → IPC → Main (ConversationEngine → Whisper STT → VoiceInputRouter → tmux sendKeys)
```

- **STT:** Whisper.cpp via `@fugood/whisper.node`, Model unter `~/.config/cipher-mux/models/whisper/ggml-small.bin`
- **VAD:** Silero ONNX im Renderer, erkennt Sprache lokal ohne Netzwerk
- **Routing:** VoiceInputRouter dispatcht Transkription an fokussierte tmux-Session
- **Voice-Commands:** "abschicken"/"absenden"/"senden" → Enter, "neue zeile" → Newline. Text wird ohne Enter diktiert, Submit per Sprachbefehl.
- **TTS:** Piper (nur für Bugreport-Interview, nicht für Session-Modus)
- **Status:** E2E funktional — VAD erkennt Sprache, Whisper transkribiert, Text erscheint in Session, Submit per Voice-Command
- **tmux sendKeys:** Verwendet `\r` (0x0d, Carriage Return) für Enter, nicht `\n` (0x0a)

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
- **Grid-Placement:** Naechster freier Slot (oben-links, links-nach-rechts)

## Bekannte Constraints

- **macOS-only:** tmux als harte Abhängigkeit, osascript-Integration
- **tmux als einziges Session-Backend:** Kein Dual-Stack mit node-pty. Sessions überleben Electron-Crashes
- **Single-Writer SQLite:** Nur Main Process schreibt — kein Concurrent-Write-Problem
- **xterm.js Streaming:** High-frequency tmux-Output erfordert Batching/Throttling der IPC-Bridge. Terminal-Fit mit 150ms Debounce und Min-Size-Guard
- **StatusLine 2.x:** Parser unterstuetzt Claude Code 2.x `context_window` nested Format zusaetzlich zum 1.x Flat-Format
- **Preact statt React:** ~3KB, React-API-kompatibel, aber einige React-Ecosystem-Libs brauchen Aliasing
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
