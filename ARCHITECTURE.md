# Architecture (v0.9.995)

This document describes the high-level architecture of cipher-mux. It is intended for contributors who want to understand the codebase before making changes.

If you want to build a new adapter, see [CONTRIBUTING.md](CONTRIBUTING.md#writing-an-adapter) and the [adapter test protocol](docs/contributing/adapter-test-protocol.md).

## Overview

cipher-mux is an Electron application with a classic two-process architecture: a **main process** (Node.js) that manages tmux sessions, a SQLite database, an MCP server, and all system integrations; and a **renderer process** (Preact) that displays the terminal grid, chatroom, and cockpit UI.

As of v0.9.995 the system supports **11 entity types** (Launcher, Orchestrator, Refinement, Cyber Factory, Companion, Debugger, Testing Assistant, Audit, Ideation Partner, Voice Relay, Bugreport) that replace the old persona-based session model. The MCP server exposes **40+ tools** covering session management, message bus, tasks, notes, companion memory, voice, grid navigation, UI choreography, handoffs, and more. Key subsystems added since v0.9.6 include:

- **Companion memory store** — per-entity SQLite FTS5 memory with recall/search/forget via MCP.
- **Notes system** — full CRUD + search + Ollama auto-tagging, exposed as MCP tools (`mux_notes_*`).
- **Voice scroll + grid navigation** — BT shutter remote triggers scroll and grid-cell focus commands.
- **UI choreography system** — programmatic highlight overlays, sidebar toggles, and TTS narration for demos and onboarding.
- **WindowManager detach-lifecycle** — BrowserWindow registry for pop-out/dock-in of sessions and notes with bounds persistence and focus-driven voice routing.
- **TTS focus gate** — `mux_tts_speak` gates playback on the caller's sessionId matching the focused cell; focus source tracking distinguishes grid vs detached windows.
- **Voice hotSwap / initPiperOnly** — runtime voice switching via queued swap (waits for active speak chain) and lazy TTS-only initialization for entities that need TTS without full voice pipeline.
- **Testing-collaboration IPC** — dialog-target mode in VoiceInputRouter bypasses voice commands and routes raw STT text to the bugreport dialog's description field via `VOICE_DIALOG_INSERT`.

Communication between main and renderer flows through typed IPC channels defined in `src/shared/ipc-channels.ts`. The renderer never accesses Node.js APIs directly - everything goes through the `contextBridge` preload API (`window.cipherMux`).

```
+---------------------------------------------------------------------+
|                       Electron App (v0.9.995)                        |
|                                                                      |
|  +---------------------------------------------------------------+  |
|  |                    Main Process                                |  |
|  |                                                                |  |
|  |  +-------------+  +--------------+  +----------------+        |  |
|  |  | TmuxManager  |  | MessageBus   |  |  MCP Server    |       |  |
|  |  | (Control -C) |  | (SQLite/WAL) |  | (Streamable    |       |  |
|  |  |              |  |              |  |  HTTP + Auth)  |       |  |
|  |  +------+-------+  +------+-------+  +-------+--------+      |  |
|  |         |                 |                   |                |  |
|  |  +------+-----------------+-------------------+------------+  |  |
|  |  |                    IPC Hub                              |  |  |
|  |  +------+-----------------------------------------+-------+  |  |
|  |         |                                         |           |  |
|  |  +------+-------+  +----------+  +---------------+--------+  |  |
|  |  | SessionMgr   |  |ConfigStore|  | ProjectScanner        |  |  |
|  |  | + Adapters    |  | (JSON)    |  | (fs + git CLI)        |  |  |
|  |  +--------------+  +----------+  +------------------------+  |  |
|  |                                                                |  |
|  |  +--------------+  +--------------+  +----------------+       |  |
|  |  | StatusLine   |  | KickoffMgr   |  | TaskManager    |      |  |
|  |  | Monitor      |  |              |  | (Outbox)       |      |  |
|  |  +--------------+  +--------------+  +----------------+       |  |
|  |                                                                |  |
|  |  +--------------+  +--------------+  +----------------+       |  |
|  |  | VoiceManager |  | BugreportMgr |  | NoteManager    |      |  |
|  |  | (STT/TTS/VAD)|  |              |  | (CRUD+Search)  |      |  |
|  |  +--------------+  +--------------+  +----------------+       |  |
|  |                                                                |  |
|  |  +--------------+  +--------------+  +----------------+       |  |
|  |  | EntityReg-   |  | MemoryStore  |  | BtShutter-     |      |  |
|  |  | istry        |  | (companion)  |  | Manager        |      |  |
|  |  +--------------+  +--------------+  +----------------+       |  |
|  +---------------------------------------------------------------+  |
|                              |                                       |
|                     contextBridge (preload.ts)                       |
|                     window.cipherMux API                             |
|                              |                                       |
|  +---------------------------------------------------------------+  |
|  |                  Renderer Process (Preact)                     |  |
|  |                                                                |  |
|  +----------+ +--------------+ +-----------------------+          |  |
|  | Activity  | |  Terminal    | |   Chatroom Panel      |         |  |
|  | Rail      | |  Panes      | |   (Message Bus Feed)  |         |  |
|  +----------+ +--------------+ +-----------------------+          |  |
|                                                                   |  |
|  +------------------+  +--------------+  +------------+           |  |
|  |  Cockpit View    |  |  Kickoff     |  |  Info/Help |           |  |
|  |  (Project Cards) |  |  Dialog      |  |  Settings  |           |  |
|  +------------------+  +--------------+  +------------+           |  |
|                                                                   |  |
|  +------------------+  +--------------+  +------------------+     |  |
|  |  CompanionTab    |  | EntityPicker |  | HighlightOverlay |    |  |
|  |  + MemoryView    |  | Popup        |  | (Choreography)   |    |  |
|  +------------------+  +--------------+  +------------------+     |  |
|  +---------------------------------------------------------------+  |
+---------------------------------------------------------------------+
         |                              |
         | tmux Control Mode            | Streamable HTTP
         | (stdin/stdout)               | (JSON-RPC 2.0)
         v                              v
+-----------------+          +--------------------+
|  tmux Server    |          |  External Clients   |
|  (Sessions)     |          |  (Claude Code CLI,  |
|                 |          |   Orchestrator)      |
+-----------------+          +--------------------+
```

## Module Map

### Main Process (`src/main/`)

| Module | Directory | Responsibility |
|--------|-----------|---------------|
| **TmuxManager** | `tmux/` | tmux Control Mode client. Spawns sessions, streams output, handles pane lifecycle. Uses a 16ms output batcher to throttle high-frequency terminal data. See [ADR-001](docs/decisions/ADR-001-tmux-streaming.md). |
| **MessageBus** | `message-bus/` | SQLite-backed inter-session communication. Topics, messages, unread tracking. Single-writer from main process (WAL mode). 7-day retention ([ADR-007](docs/decisions/ADR-007-message-retention.md)). |
| **MCP Server** | `mcp/` | Streamable HTTP endpoint on `127.0.0.1:3100`. Bearer token auth. Exposes 40+ tools (`mux_send`, `mux_read`, `mux_create_session`, `mux_status`, `mux_context_usage`, `mux_task_*`, `mux_notes_*`, `companion_memory_*`, `mux_ui_*`, `mux_tts_speak`, `mux_grid_*`, `mux_cell_scroll`, `mux_cyber_factory_*`, `mux_debugger_*`, `mux_testing_*`, handoff tools, etc.). See [ADR-002](docs/decisions/ADR-002-mcp-transport.md). |
| **WindowManager** | `window-manager.ts` | BrowserWindow registry for detached sessions/notes. Pop-out, dock-in, bounds persistence, focus callbacks for voice routing. |
| **IPC Hub** | `ipc-hub.ts` | Central router for all renderer-main IPC. Registers handlers for ~97 typed channels. |
| **SessionManager** | `session/` | Session registry, status tracking, crash recovery. Manages the lifecycle of tmux-backed agent sessions. |
| **EntityRegistry** | `session/entity-registry.ts` | Entity registration and lifecycle. Registers 7 built-in entities at startup and manages their configs. |
| **EntityScanner** | `session/entity-scanner.ts` | Dynamic entity discovery from `~/.config/cipher-mux/entities/`. Scans for directories containing `CLAUDE.md`. |
| **EntityAssets** | `session/entity-assets.ts` | Entity asset management (icons, colors, feature flags). |
| **ConfigStore** | `config/` | App settings persistence via JSON (electron-store pattern). Grid layout, theme, scan paths. |
| **ProjectScanner** | `project/` | Discovers projects by scanning configured directories for marker files (`CLAUDE.md`, `AGENTS.md`). Powers the cockpit project card grid. |
| **KickoffManager** | `project/` | Project scaffolding and session spawn. Handles the "launch a new project" flow with optional requirements interview. |
| **StatusLineMonitor** | `monitoring/` | Reads real-time context/token usage from Claude Code sessions via the statusLine hook. See [ADR-003](docs/decisions/ADR-003-statusline-integration.md). |
| **TaskManager** | `task/` | SQLite-backed task outbox. State machine (inbox -> in-progress -> done/parked/dropped). Watcher, hooks, MCP tool integration. |
| **NoteManager** | `notes/note-manager.ts` | Note CRUD + full-text search. SQLite-backed. Powers `mux_notes_*` MCP tools. |
| **NoteTagging** | `notes/note-tagging.ts` | Ollama-powered auto-tagging for notes. |
| **TestcaseParser** | `notes/testcase-parser.ts` | Parses structured testcases from note content. |
| **BugreportManager** | `bugreport/` | Session diagnostics collection, structured bug report creation, resolution workflow. |
| **VoiceManager** | `voice/` | Local voice pipeline: Whisper STT, Piper TTS, Silero VAD. Powers voice bug reports and voice-to-session prompt input via VoiceInputRouter. |
| **MemoryStore** | `companion/memory-store.ts` | SQLite FTS5 companion memory store. Per-entity persistent memory with salience scoring and TTL. |
| **MemoryRetriever** | `companion/retriever.ts` | Memory retrieval logic — recall, search, and forget operations exposed via MCP. |
| **BtShutterManager** | `bluetooth/bt-shutter-manager.ts` | Bluetooth remote integration. Maps BT shutter button presses to scroll, grid navigation, and custom actions. |
| **WorkspaceManager** | `workspace/` | Personas (named roles with colors/prompts), workspaces (grid layouts with project assignments), 3-level prompt resolution, persona skill sync. |
| **Utilities** | `util/` | `exec-util.ts` (safe child_process wrapper with PATH patching), `dependency-check.ts` (tmux/claude availability). |

### Renderer Process (`src/renderer/`)

| Module | Directory | Responsibility |
|--------|-----------|---------------|
| **App** | `app.tsx` | Root component, view routing (grid / cockpit / chatroom / info) |
| **ActivityRail** | `components/` | Left sidebar with session icons, status dots, unread badges, view switcher |
| **TerminalPane** | `components/` | xterm.js terminal instance, fit addon, WebGL/Canvas renderer ([ADR-005](docs/decisions/ADR-005-xterm-renderer.md)) |
| **SessionGrid** | `components/` | Dynamic grid layout for terminal panes. Configurable columns/rows. |
| **Chatroom** | `components/` | Message bus feed, send messages between sessions, background session cards |
| **Cockpit** | `components/` | Project card grid, context usage overview, session management |
| **CompanionTab** | `components/` | Companion entity view — chat-like interaction surface for the companion session |
| **CompanionMemoryView** | `components/` | Memory browser for companion memory entries (recall, search, inspect) |
| **EntityPickerPopup** | `components/` | Entity selection popup for launching sessions by entity type |
| **HighlightOverlay** | `components/` | Programmatic highlight overlay for UI choreography and onboarding demos |
| **NotesTreeView** | `components/` | Tree-structured note browser with tag filtering and search |
| **TestcaseView** | `components/` | Structured testcase display parsed from notes |
| **UnifiedSessionDialog** | `components/` | Unified dialog for session creation, replacing older scattered launch flows |
| **WorkspacesWindow** | `components/` | Standalone editor window for personas and workspaces (960x720, separate BrowserWindow) |
| **WorkspacePopup** | `components/` | Quick-access popup above statusbar for loading workspaces |
| **Hooks** | `hooks/` | `useTerminal`, `useSessions`, `useMessages`, `useGrid`, `useContextUsage`, `useTheme`, `useShortcuts`, `useProjects`, `useVoiceSession`, `useEntityPresets`, `useScrollHandler`, `useGlobalTtsPlayback` - all wrap IPC calls |

### Shared (`src/shared/`)

| File | Purpose |
|------|---------|
| `ipc-channels.ts` | ~97 typed IPC channel constants. Single source of truth for all main-renderer communication. |
| `types.ts` | Domain interfaces: `SessionInfo`, `Message`, `ProjectInfo`, `ContextUsage`, `Task`, `BugreportData`, `EntityConfig`, `NoteData`, `MemoryEntry`, etc. |
| `grid-types.ts` | Grid state management utilities: `createEmptyGrid`, `assignSessionToGrid`, `computeGridStyle` |
| `constants.ts` | App configuration: MCP port, context warning threshold, retention days, grid limits |
| `terminal-theme.ts` | xterm.js color theme shared between main and renderer |

## Entity Framework

As of v0.9.995 cipher-mux uses an entity-based session model that replaces the earlier persona system.

### EntityRegistry

11 built-in entities are registered at startup:

| Entity | Role |
|--------|------|
| **Launcher** | Main process orchestration, project scaffolding, session lifecycle |
| **Orchestrator** | Multi-session coordination, task delegation |
| **Refinement** | Requirements analysis, purpose-check, REQ-ID tracking, handoff to Cyber Factory |
| **Cyber Factory** | Multi-session build orchestrator (replaces MPO). Decomposes specs into waves, spawns parallel workers |
| **Companion** | Persistent memory store, user-facing advisor, scope-aware recall/search/forget |
| **Debugger** | Post-build diagnostics: findings intake, clarification, fix planning, worker dispatch, verification |
| **Testing Assistant** | Test execution, quality audit, adversarial probing, OWASP checks, findings reporting |
| **Audit** | Code review, security audit, ADR consistency, cognitive debt analysis, release recommendation |
| **Ideation Partner** | Brainstorming, skill registry, Anforderungspaket generation |
| **Voice Relay** | Background entity that polls tmux output and routes stable responses to TTS |
| **Bugreport** | Structured bug report creation with voice dictation support |

### EntityScanner

At startup `EntityScanner` scans `~/.config/cipher-mux/entities/` for subdirectories containing a `CLAUDE.md` file. Each discovered directory becomes a registered entity. This allows user-defined entities alongside the built-in set.

### EntityConfig

Each entity is described by an `EntityConfig` object:

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier (e.g. `companion`, `builder`) |
| `displayName` | Human-readable label shown in UI |
| `icon` | Icon identifier for the activity rail and entity picker |
| `color` | Accent color for session borders, badges, and theming |
| `projectPath` | Default working directory for sessions of this entity |
| `features` | Feature flags (e.g. memory, notes, tts) that enable/disable subsystems |
| `singleInstance` | When `true`, only one session of this entity may exist at a time |

### Migration from Personas

Entities replace the old persona-based session launch. Where personas were display-only labels with color and prompt, entities are full lifecycle objects with feature flags, filesystem-backed definitions, and MCP-aware capabilities. Existing workspace configurations referencing personas continue to work via a compatibility layer.

## Adapter Contract

The AgentAdapter interface (`src/main/agent/agent-adapter.ts`) abstracts over coding agent CLIs. TP-2 is complete: ClaudeCodeAdapter is the production Tier-1 implementation; ReferenceStubAdapter is a documented Tier-2 template for new adapters. SessionManager is fully decoupled from Claude Code specifics.

```typescript
interface AgentAdapter {
  id: string                    // e.g. 'claude-code'
  displayName: string
  tier: 'tier-1' | 'tier-2'

  buildLaunchCommand(opts: LaunchOpts): { cmd: string; args: string[] }
  postLaunchInjection?(ctx: AdapterContext): Promise<void>   // optional: MCP registration
  getProjectMarkers(): string[]                               // e.g. ['CLAUDE.md', '.claude']
  readProjectInstructions(path: string): Promise<string | null>
  supports(feature: AdapterFeature): boolean
  getCapabilities(): Record<AdapterFeature, boolean>
  getContextUsage?(sessionId: string): Promise<ContextUsage | null>
  attachStatusHook?(projectPath: string): Promise<void>
  sendPrompt(tmuxTarget: string, prompt: string): Promise<void>
  buildOrchestratorPromptFragment(lang: string): string
  buildLauncherPromptFragment(lang: string): string
}
```

### Adapter Capabilities (AdapterFeature)

Six features gate optional behaviour. The UI degrades gracefully when a feature is unsupported:

| Feature | When unsupported |
|---------|-----------------|
| `mcp-injection` | Badge "MCP not active" on pane header; session excluded from MCP tool delegation |
| `status-line` | Context % shows `---` instead of percentage; context warnings skip this session |
| `skip-permissions` | User must manually confirm prompts in the terminal |
| `sub-agents` | Multi-agent orchestration unavailable for this session |
| `project-instructions` | Project instruction display skipped in cockpit card |
| `message-bus-participant` | Badge "Read-only Bus"; no send capability in chatroom for this session |

### Implemented Adapters

| Adapter | Tier | All capabilities | Location |
|---------|------|-----------------|----------|
| `ClaudeCodeAdapter` | Tier-1 | All 6 enabled | `src/main/agent/adapters/claude-code-adapter.ts` |
| `ReferenceStubAdapter` | Tier-2 | All disabled | `src/main/agent/adapters/_reference-stub.ts` |

### AdapterRegistry

Singleton (`src/main/agent/adapter-registry.ts`) that pre-registers `ClaudeCodeAdapter` as the default. Additional adapters are registered via `registry.register(adapter)`.

See `src/main/agent/adapters/_reference-stub.ts` for a fully annotated skeleton.

## Data Flow

### Terminal Output

```
tmux server
  -> TmuxManager (Control Mode stdout)
  -> OutputBatcher (16ms throttle)
  -> IPC Hub (cipher-mux:terminal:data)
  -> preload bridge
  -> useTerminal hook
  -> xterm.js write()
```

### Message Bus

```
Claude Code session (MCP client)
  -> HTTP POST to MCP Server
  -> mux_send tool handler
  -> MessageBus.send() (SQLite INSERT)
  -> IPC Hub emits cipher-mux:message:received
  -> Chatroom component updates
```

### Context Usage

```
Claude Code CLI
  -> writes JSON to statusLine hook path
  -> StatusLineMonitor (fs.watch)
  -> IPC Hub emits cipher-mux:context:updated
  -> ActivityRail + PaneHeader update
```

### Companion Memory

```
Entity session (MCP client)
  -> companion_memory_write / recall / search / forget
  -> MCP Server tool handler
  -> MemoryStore (SQLite FTS5 INSERT/SELECT)
  -> IPC Hub emits update (if subscribed)
  -> CompanionMemoryView updates
```

## Subsystem Deep-Dives (v0.9.10+)

### WindowManager Detach-Lifecycle

`WindowManager` (`src/main/window-manager.ts`) maintains a registry of detached `BrowserWindow` instances (`Map<entityId, { window, entry }>`). Sessions and notes can be popped out into their own OS window and docked back.

**Lifecycle:**

```
Pop-out:  openDetachedWindow(type, entityId, bounds?)
            → new BrowserWindow with ?view=session|note&id=<entityId>
            → save bounds to ConfigStore (detachedWindowBounds)
            → register onDetachedFocus callback for voice routing

Dock-in:  markDockInitiated(entityId) → close window (no state-change event)
            → DETACH_STATE_CHANGED IPC → renderer re-docks cell

Startup:  restoreDetachedWindows(entries, isValid)
            → validator skips stale sessions/notes
            → restore saved bounds per entityId
```

**Key functions:** `openDetachedWindow()`, `closeDetachedWindow()`, `markDockInitiated()`, `getDetachedEntries()`, `restoreDetachedWindows()`, `onDetachedFocus(cb)`, `onMainWindowFocus(cb)`.

**IPC channels:** `DETACH_REQUEST`, `DOCK_REQUEST`, `DETACH_STATE_CHANGED`.

### TTS Focus Gate

The `mux_tts_speak` MCP tool (`src/main/mcp/mcp-tools.ts`) implements focus-gating: if a `sessionId` parameter is passed, TTS only plays when that session is in the focused cell. This prevents background sessions from speaking over the user's active work.

Focus source is tracked as `'grid' | 'detached'` by `VoiceInputRouter` (`src/main/voice/voice-input-router.ts`). When a detached window gains OS focus, `WindowManager.onDetachedFocus()` fires a callback that switches the TTS/STT target. When the main grid window regains focus, `onMainWindowFocus()` reverts routing.

For entity sessions with voice-relay enabled, `VoiceOutputRouter` (`src/main/voice/voice-output-router.ts`) polls tmux output every 500ms, detects stable agent responses, and routes them to `ConversationEngine.speakResponse()`.

### Voice hotSwap / initPiperOnly

`VoiceManager` (`src/main/voice/voice-manager.ts`) supports two initialization paths:

1. **`init()`** — full pipeline: STT (Whisper) + TTS (Piper) + ConversationEngine.
2. **`initPiperOnly()`** — lazy TTS-only mode for entities that need `mux_tts_speak` but not voice input.

**Runtime voice switching** via `swapVoice(newVoiceName)`:
- Uses a `_swapQueue` (Promise chain) to serialize concurrent swap requests.
- Waits for the active speak chain to finish.
- Disposes old PiperTTS instance, creates new one with the target voice model.
- Updates ConversationEngine's TTS reference after swap.
- `isSwapping` getter exposes swap-in-progress state.

### Testing-Collaboration IPC (Simplified Bugreport Dialog)

When the bugreport dialog opens, `VoiceInputRouter.setDialogTarget('bugreport')` switches to dialog-target mode. In this mode, STT transcriptions bypass voice command matching (scroll, grid-nav, submit) and flow directly to the renderer via `VOICE_DIALOG_INSERT` IPC. The renderer inserts the text into the dialog's description field, enabling hands-free dictation.

**IPC channels:** `BUGREPORT_DIALOG_OPEN` (triggers `setDialogTarget`), `BUGREPORT_DIALOG_CLOSE` (triggers `clearDialogTarget`), `VOICE_DIALOG_INSERT` (raw STT text → renderer input field).

**Key functions:** `VoiceInputRouter.setDialogTarget(target)`, `clearDialogTarget()`, `routeTranscription(text)` (checks dialogTarget as priority 1).

## Key Design Decisions

All architectural decisions are recorded as ADRs in `docs/decisions/`:

| ADR | Decision |
|-----|----------|
| [001](docs/decisions/ADR-001-tmux-streaming.md) | tmux Control Mode for session streaming |
| [002](docs/decisions/ADR-002-mcp-transport.md) | Streamable HTTP for MCP transport |
| [003](docs/decisions/ADR-003-statusline-integration.md) | statusLine hook for real-time context usage |
| [004](docs/decisions/ADR-004-renderer-bundler.md) | Vite as renderer bundler |
| [005](docs/decisions/ADR-005-xterm-renderer.md) | WebGL + Canvas fallback for xterm.js |
| [006](docs/decisions/ADR-006-ulid-library.md) | ulidx for ULID generation |
| [007](docs/decisions/ADR-007-message-retention.md) | 7-day time-based message retention |
| [008](docs/decisions/ADR-008-orchestrator-template.md) | Structured orchestrator CLAUDE.md template |

## Where to Start Reading

If you are new to the codebase, read in this order:

1. **`src/shared/types.ts`** — All domain types. This tells you what the system talks about.
2. **`src/shared/ipc-channels.ts`** — All IPC channels. This tells you how main and renderer communicate.
3. **`src/main/main.ts`** — Application entry point. See how modules are wired together.
4. **`src/main/ipc-hub.ts`** — The central IPC router. Follow a channel from registration to handler.
5. **`src/main/tmux/tmux-manager.ts`** — The session backend. Understand how tmux Control Mode works.
6. **`src/main/mcp/mcp-server.ts`** — The MCP server. See which tools are exposed and how.
7. **`src/main/session/entity-registry.ts`** — The entity framework. See how entities are defined and registered.
8. **`src/renderer/app.tsx`** — Renderer entry point. See the view structure.
9. **`src/renderer/hooks/useTerminal.ts`** — How terminal data flows from IPC to xterm.js.

For adapter development specifically:
1. **`src/main/agent/agent-adapter.ts`** — The adapter interface
2. **`src/main/agent/adapters/_reference-stub.ts`** — Documented skeleton
3. **`src/main/session/session-manager.ts`** — Where adapters are consumed
