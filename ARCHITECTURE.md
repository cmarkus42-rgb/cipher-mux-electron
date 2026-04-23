# Architecture

This document describes the high-level architecture of cipher-mux. It is intended for contributors who want to understand the codebase before making changes.

If you want to build a new adapter, see [CONTRIBUTING.md](CONTRIBUTING.md#writing-an-adapter) and the [adapter test protocol](docs/contributing/adapter-test-protocol.md).

## Overview

cipher-mux is an Electron application with a classic two-process architecture: a **main process** (Node.js) that manages tmux sessions, a SQLite database, an MCP server, and all system integrations; and a **renderer process** (Preact) that displays the terminal grid, chatroom, and cockpit UI.

Communication between main and renderer flows through typed IPC channels defined in `src/shared/ipc-channels.ts`. The renderer never accesses Node.js APIs directly - everything goes through the `contextBridge` preload API (`window.cipherMux`).

```
+---------------------------------------------------------------------+
|                        Electron App                                  |
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
|  |  +--------------+  +--------------+                            |  |
|  |  | VoiceManager |  | BugreportMgr |                           |  |
|  |  | (STT/TTS/VAD)|  |              |                           |  |
|  |  +--------------+  +--------------+                            |  |
|  +---------------------------------------------------------------+  |
|                              |                                       |
|                     contextBridge (preload.ts)                       |
|                     window.cipherMux API                             |
|                              |                                       |
|  +---------------------------------------------------------------+  |
|  |                  Renderer Process (Preact)                     |  |
|  |                                                                |  |
|  |  +----------+ +--------------+ +-----------------------+      |  |
|  |  | Activity  | |  Terminal    | |   Chatroom Panel      |     |  |
|  |  | Rail      | |  Panes      | |   (Message Bus Feed)  |     |  |
|  |  +----------+ +--------------+ +-----------------------+      |  |
|  |                                                                |  |
|  |  +------------------+  +--------------+  +------------+       |  |
|  |  |  Cockpit View    |  |  Kickoff     |  |  Info/Help |       |  |
|  |  |  (Project Cards) |  |  Dialog      |  |  Settings  |       |  |
|  |  +------------------+  +--------------+  +------------+       |  |
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
| **MCP Server** | `mcp/` | Streamable HTTP endpoint on `127.0.0.1:3100`. Bearer token auth. Exposes 13+ tools (`mux_send`, `mux_read`, `mux_create_session`, `mux_status`, `mux_context_usage`, `mux_task_*`, etc.). See [ADR-002](docs/decisions/ADR-002-mcp-transport.md). |
| **IPC Hub** | `ipc-hub.ts` | Central router for all renderer-main IPC. Registers handlers for ~97 typed channels. |
| **SessionManager** | `session/` | Session registry, status tracking, crash recovery. Manages the lifecycle of tmux-backed agent sessions. |
| **ConfigStore** | `config/` | App settings persistence via JSON (electron-store pattern). Grid layout, theme, scan paths. |
| **ProjectScanner** | `project/` | Discovers projects by scanning configured directories for marker files (`CLAUDE.md`, `AGENTS.md`). Powers the cockpit project card grid. |
| **KickoffManager** | `project/` | Project scaffolding and session spawn. Handles the "launch a new project" flow with optional requirements interview. |
| **StatusLineMonitor** | `monitoring/` | Reads real-time context/token usage from Claude Code sessions via the statusLine hook. See [ADR-003](docs/decisions/ADR-003-statusline-integration.md). |
| **TaskManager** | `task/` | SQLite-backed task outbox. State machine (inbox -> in-progress -> done/parked/dropped). Watcher, hooks, MCP tool integration. |
| **BugreportManager** | `bugreport/` | Session diagnostics collection, structured bug report creation, resolution workflow. |
| **VoiceManager** | `voice/` | Local voice pipeline: Whisper STT, Piper TTS, Silero VAD. Powers voice bug reports and (planned) voice-to-session prompt input. |
| **Utilities** | `util/` | `exec-util.ts` (safe child_process wrapper with PATH patching), `dependency-check.ts` (tmux/claude availability). |

### Renderer Process (`src/renderer/`)

| Module | Directory | Responsibility |
|--------|-----------|---------------|
| **App** | `app.tsx` | Root component, view routing (grid / cockpit / chatroom / info) |
| **ActivityRail** | `components/` | Left sidebar with session icons, status dots, unread badges, view switcher |
| **TerminalPane** | `components/` | xterm.js terminal instance, fit addon, WebGL/Canvas renderer ([ADR-005](docs/decisions/ADR-005-xterm-renderer.md)) |
| **SessionGrid** | `components/` | Dynamic grid layout for terminal panes. Configurable columns/rows. |
| **Chatroom** | `components/` | Message bus feed, send messages between sessions |
| **Cockpit** | `components/` | Project card grid, context usage overview, session management |
| **Hooks** | `hooks/` | `useTerminal`, `useSessions`, `useMessages`, `useGrid`, `useContextUsage`, `useTheme`, `useShortcuts` - all wrap IPC calls |

### Shared (`src/shared/`)

| File | Purpose |
|------|---------|
| `ipc-channels.ts` | ~97 typed IPC channel constants. Single source of truth for all main-renderer communication. |
| `types.ts` | Domain interfaces: `SessionInfo`, `Message`, `ProjectInfo`, `ContextUsage`, `Task`, `BugreportData`, etc. |
| `grid-types.ts` | Grid state management utilities: `createEmptyGrid`, `assignSessionToGrid`, `computeGridStyle` |
| `constants.ts` | App configuration: MCP port, context warning threshold, retention days, grid limits |
| `terminal-theme.ts` | xterm.js color theme shared between main and renderer |

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
| `status-line` | Context % shows `—` instead of percentage; context warnings skip this session |
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
7. **`src/renderer/app.tsx`** — Renderer entry point. See the view structure.
8. **`src/renderer/hooks/useTerminal.ts`** — How terminal data flows from IPC to xterm.js.

For adapter development specifically:
1. **`src/main/agent/agent-adapter.ts`** — The adapter interface
2. **`src/main/agent/adapters/_reference-stub.ts`** — Documented skeleton
3. **`src/main/session/session-manager.ts`** — Where adapters are consumed
