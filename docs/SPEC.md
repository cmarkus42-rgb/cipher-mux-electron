# Technische Spezifikation — cipher-mux-electron

_Erstellt in Phase 2 auf Basis von `docs/requirements.md` (2026-04-13)._

## 1. Systemübersicht

### Architekturdiagramm

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
|  |  |           (cipher-mux: prefixed channels)              |  |  |
|  |  +------+-----------------------------------------+-------+  |  |
|  |         |                                         |           |  |
|  |  +------+-------+  +----------+  +---------------+--------+  |  |
|  |  | SessionMgr   |  |ConfigStore|  | ProjectScanner        |  |  |
|  |  |              |  | (JSON)    |  | (fs + git CLI)        |  |  |
|  |  +--------------+  +----------+  +------------------------+  |  |
|  |                                                                |  |
|  |  +--------------+  +--------------+  +----------------+       |  |
|  |  | StatusLine   |  | KickoffMgr   |  | BugreportMgr   |      |  |
|  |  | Monitor      |  |              |  |                |      |  |
|  |  +--------------+  +--------------+  +----------------+       |  |
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
|  |  | (48px)    | |  (xterm.js) | |                       |     |  |
|  |  +----------+ +--------------+ +-----------------------+      |  |
|  |                                                                |  |
|  |  +------------------+  +--------------+  +------------+       |  |
|  |  |  Cockpit View    |  |  Kickoff     |  |  Info/Help |       |  |
|  |  |  (Card Grid)     |  |  Dialog      |  |  Page      |       |  |
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
|                 |          |   OpenClaw, etc.)   |
+-----------------+          +--------------------+
```

### Komponentenübersicht

| Komponente | Prozess | Verantwortung |
|-----------|---------|---------------|
| TmuxManager | Main | tmux Control Mode Client, Session-Lifecycle, Output-Streaming |
| MessageBus | Main | SQLite-basierte Inter-Session-Kommunikation, Topics, Unread-Tracking |
| MCP Server | Main | Streamable HTTP Endpoint, Tool-Registrierung, API-Key-Auth |
| IPC Hub | Main | Zentraler Router für alle Renderer-Main-Kommunikation |
| SessionManager | Main | Session-Registry, Status-Tracking, Recovery |
| ConfigStore | Main | App-Einstellungen (JSON), Layout-Persistenz |
| ProjectScanner | Main | Projektentdeckung via Ordner-Scan (CLAUDE.md-Marker) |
| StatusLineMonitor | Main | Empfängt Context-Usage JSON von Claude Code Sessions |
| KickoffManager | Main | Projekt-Scaffold, Session-Spawn, Auto-Interview-Trigger |
| BugreportManager | Main | Diagnostik-Sammlung, Report-Export |
| Activity Rail | Renderer | Session-Icons, Unread-Badges, View-Wechsel |
| Terminal Panes | Renderer | xterm.js Rendering, Splitting, Resize |
| Chatroom Panel | Renderer | Message Bus Feed, bidirektionale Kommunikation |
| Cockpit View | Renderer | Projekt-Card-Grid, Session-Start, Context-Budget |
| Kickoff Dialog | Renderer | Dateipfad + Zielverzeichnis Input |
| Info Page | Renderer | In-App-Hilfe und Anleitung |

## 2. Module & Verzeichnisstruktur

```
cipher-mux-electron/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
├── electron-builder.yml
│
├── docs/
│   ├── SPEC.md
│   ├── requirements.md
│   ├── todo.md
│   └── decisions/
│
├── src/
│   ├── main/
│   │   ├── main.ts                  <- App-Lifecycle, Window-Creation
│   │   ├── window-manager.ts        <- BrowserWindow, Geometry-Persistenz
│   │   ├── ipc-hub.ts               <- Zentraler IPC-Router
│   │   ├── preload.ts               <- contextBridge, window.cipherMux
│   │   │
│   │   ├── tmux/
│   │   │   ├── tmux-manager.ts      <- Control Mode Client (-C)
│   │   │   ├── tmux-parser.ts       <- %output, %begin/%end Parser
│   │   │   └── output-batcher.ts    <- 16ms Batching für IPC
│   │   │
│   │   ├── message-bus/
│   │   │   ├── message-bus.ts       <- SQLite CRUD, Topic-Routing
│   │   │   ├── schema.ts            <- CREATE TABLE Statements
│   │   │   └── message-types.ts     <- Message-Interfaces
│   │   │
│   │   ├── mcp/
│   │   │   ├── mcp-server.ts        <- Streamable HTTP Server
│   │   │   ├── mcp-tools.ts         <- Tool-Registrierungen
│   │   │   └── mcp-auth.ts          <- API-Key Middleware
│   │   │
│   │   ├── session/
│   │   │   ├── session-manager.ts   <- Registry, Status, Recovery
│   │   │   └── session-types.ts     <- Session-Interfaces
│   │   │
│   │   ├── project/
│   │   │   ├── project-scanner.ts   <- Ordner-Scan, Git-Status, SDD-Phase
│   │   │   └── kickoff-manager.ts   <- Scaffold, Session-Spawn, Auto-Interview
│   │   │
│   │   ├── config/
│   │   │   └── config-store.ts      <- electron-store Wrapper
│   │   │
│   │   ├── monitoring/
│   │   │   └── statusline-monitor.ts <- Claude Code statusLine JSON Parser
│   │   │
│   │   ├── bugreport/
│   │   │   └── bugreport-manager.ts  <- Diagnostik-Sammlung, Export
│   │   │
│   │   └── util/
│   │       ├── exec-util.ts          <- Safe Shell Execution
│   │       └── dependency-check.ts   <- tmux-Verfügbarkeit
│   │
│   ├── renderer/
│   │   ├── index.html                <- Single Entry Point
│   │   ├── app.tsx                   <- Preact Root, Router
│   │   │
│   │   ├── components/
│   │   │   ├── ActivityRail.tsx      <- Icon-Leiste, Badges
│   │   │   ├── TerminalPane.tsx      <- xterm.js Wrapper
│   │   │   ├── TerminalSplitter.tsx  <- Split/Resize-Logik
│   │   │   ├── PaneHeader.tsx        <- Projektname, Phase, Context-%
│   │   │   ├── ChatroomPanel.tsx     <- Message Feed + Input
│   │   │   ├── CockpitView.tsx       <- Card Grid
│   │   │   ├── ProjectCard.tsx       <- Einzelne Projekt-Card
│   │   │   ├── KickoffDialog.tsx     <- Dateipfad + Verzeichnis
│   │   │   ├── InfoPage.tsx          <- Hilfe/Anleitung
│   │   │   ├── StatusBar.tsx         <- Untere Statusleiste
│   │   │   └── BugreportDialog.tsx   <- Bug-Report UI
│   │   │
│   │   ├── hooks/
│   │   │   ├── useTerminal.ts        <- xterm.js Lifecycle
│   │   │   ├── useMessages.ts        <- Message Bus Subscription
│   │   │   ├── useSessions.ts        <- Session-Liste + Status
│   │   │   └── useContextUsage.ts    <- StatusLine-Daten
│   │   │
│   │   ├── styles/
│   │   │   ├── theme.css             <- cipher ivory Design Tokens
│   │   │   ├── layout.css            <- Activity Rail, Splitter, Panels
│   │   │   └── components.css        <- Komponent-spezifische Styles
│   │   │
│   │   └── fonts/
│   │       ├── Rajdhani-Bold.woff2
│   │       ├── Rajdhani-SemiBold.woff2
│   │       └── FiraCode-Regular.woff2
│   │
│   └── shared/
│       ├── ipc-channels.ts           <- Channel-Namen als Typed Constants
│       ├── types.ts                  <- Shared Interfaces (Session, Message, Project)
│       └── constants.ts              <- App-weite Konstanten
│
└── test/
    ├── main/
    │   ├── tmux-manager.test.ts
    │   ├── message-bus.test.ts
    │   ├── session-manager.test.ts
    │   ├── project-scanner.test.ts
    │   └── config-store.test.ts
    └── shared/
        └── types.test.ts
```

### Modul-APIs

#### TmuxManager

```typescript
class TmuxManager extends EventEmitter {
  // Lifecycle
  connect(): Promise<void>                    // Startet tmux Control Mode Client
  disconnect(): void                          // Beendet Control Mode

  // Session-Operationen
  createSession(opts: CreateSessionOpts): Promise<TmuxSession>
  killSession(sessionName: string): Promise<void>
  listSessions(): Promise<TmuxSession[]>

  // Pane-Operationen
  sendKeys(paneId: string, keys: string): Promise<void>
  splitPane(paneId: string, direction: 'h' | 'v'): Promise<string>
  resizePane(paneId: string, cols: number, rows: number): Promise<void>
  capturePane(paneId: string, lines?: number): Promise<string>

  // Events (via Control Mode)
  on('output', (paneId: string, data: string) => void): this
  on('session-changed', (sessions: TmuxSession[]) => void): this
  on('pane-changed', (paneId: string) => void): this
  on('exit', () => void): this
}

interface CreateSessionOpts {
  name: string
  cwd: string
  command?: string          // z.B. 'claude' for Auto-Interview
  env?: Record<string, string>
}
```

#### MessageBus

```typescript
class MessageBus {
  constructor(dbPath: string)

  // Schreiben
  send(msg: SendMessage): Message
  sendBatch(msgs: SendMessage[]): Message[]

  // Lesen
  getByTopic(topic: Topic, opts?: QueryOpts): Message[]
  getUnreadCount(sessionId?: string): Record<Topic, number>
  markRead(messageIds: string[]): void

  // Subscriptions (in-process)
  on('message', (msg: Message) => void): this
  on('message:topic', (topic: Topic, msg: Message) => void): this

  // Maintenance
  cleanup(olderThan: Date): number
  close(): void
}

interface SendMessage {
  topic: Topic
  sender: string              // Session-ID oder 'user'
  payload: Record<string, unknown>
}

type Topic = 'status' | 'bug' | 'review' | 'chat' | 'system'
```

#### MCP Server

```typescript
class CipherMuxMcpServer {
  constructor(opts: McpServerOpts)

  start(): Promise<void>      // HTTP Server starten
  stop(): Promise<void>       // Graceful Shutdown

  // Tools werden intern registriert:
  // mux_send, mux_read, mux_status, mux_sessions,
  // mux_create_session, mux_kill_session, mux_context_usage
}

interface McpServerOpts {
  port: number                // Default: 3100
  host: string                // Default: '127.0.0.1'
  apiKey: string              // Required
  sessionManager: SessionManager
  messageBus: MessageBus
  statusLineMonitor: StatusLineMonitor
}
```

#### SessionManager

```typescript
class SessionManager extends EventEmitter {
  constructor(tmux: TmuxManager, configStore: ConfigStore)

  // CRUD
  register(session: SessionInfo): void
  unregister(sessionId: string): void
  getAll(): SessionInfo[]
  getById(sessionId: string): SessionInfo | undefined

  // Lifecycle
  startSession(opts: StartSessionOpts): Promise<SessionInfo>
  stopSession(sessionId: string): Promise<void>

  // Recovery
  recoverSessions(): Promise<RecoveryResult>

  // Events
  on('session-started', (session: SessionInfo) => void): this
  on('session-stopped', (sessionId: string) => void): this
  on('session-orphaned', (session: SessionInfo) => void): this

  // Limits
  readonly MAX_SESSIONS: 10
}

interface RecoveryResult {
  recovered: SessionInfo[]
  orphaned: SessionInfo[]
}
```

#### StatusLineMonitor

```typescript
class StatusLineMonitor extends EventEmitter {
  constructor()

  // Registrierung
  registerSession(sessionId: string, configPath: string): void
  unregisterSession(sessionId: string): void

  // Abfrage
  getUsage(sessionId: string): ContextUsage | undefined
  getAllUsage(): Map<string, ContextUsage>

  // Events
  on('usage-updated', (sessionId: string, usage: ContextUsage) => void): this
  on('usage-warning', (sessionId: string, percentage: number) => void): this
}

interface ContextUsage {
  usedPercentage: number      // 0-100
  remainingPercentage: number // 0-100
  totalInputTokens: number
  totalOutputTokens: number
  contextWindowSize: number
  modelId: string
  updatedAt: Date
}
```

#### ProjectScanner

```typescript
class ProjectScanner {
  constructor(scanPaths: string[])

  // Scan
  discoverProjects(): Promise<ProjectInfo[]>
  getProjectInfo(path: string): Promise<ProjectInfo>

  // Watch
  watch(onChange: (projects: ProjectInfo[]) => void): () => void  // Returns unwatch
}

interface ProjectInfo {
  path: string
  name: string
  sddPhase: string | null
  gitBranch: string | null
  gitDirty: boolean
  hasClaudeMd: boolean
}
```

#### KickoffManager

```typescript
class KickoffManager {
  constructor(
    sessionManager: SessionManager,
    projectScanner: ProjectScanner
  )

  kickoff(opts: KickoffOpts): Promise<SessionInfo>
}

interface KickoffOpts {
  requirementsFile: string    // Lokaler Dateipfad
  targetDir: string           // Zielverzeichnis
  projectName: string
  autoInterview: boolean      // Default: true
}
```

#### ConfigStore

```typescript
class ConfigStore {
  constructor()

  get<T>(key: string): T | undefined
  get<T>(key: string, defaultValue: T): T
  set(key: string, value: unknown): void

  // Layout-Persistenz
  saveLayout(layout: LayoutState): void
  getLayout(): LayoutState

  // Typisierte Zugriffe
  getScanPaths(): string[]
  getMcpPort(): number
  getMcpApiKey(): string
  getDefaultProjectDir(): string
}
```

## 3. Datenmodell

### SQLite Schema (Message Bus)

```sql
-- Sessions (Tracking, nicht tmux-State)
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,           -- ULID
  name        TEXT NOT NULL,
  project_path TEXT,
  tmux_session TEXT NOT NULL,             -- tmux session name
  tmux_pane   TEXT,                       -- tmux pane ID (%0, %1, ...)
  status      TEXT NOT NULL DEFAULT 'active',  -- active | stopped | orphaned
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Messages (Inter-Session-Kommunikation)
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,           -- ULID
  topic       TEXT NOT NULL,              -- status | bug | review | chat | system
  sender      TEXT NOT NULL,              -- Session-ID oder 'user'
  payload     TEXT NOT NULL,              -- JSON
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_messages_topic ON messages(topic, created_at);
CREATE INDEX idx_messages_sender ON messages(sender, created_at);

-- Read-Status (für Unread-Badges)
CREATE TABLE read_status (
  session_id  TEXT NOT NULL,              -- Wer hat gelesen
  message_id  TEXT NOT NULL,              -- Was wurde gelesen
  read_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (session_id, message_id)
);

-- Context Usage History (Zukunft -- Schema schon anlegen)
CREATE TABLE context_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  used_pct    REAL NOT NULL,
  remaining_pct REAL NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  context_window_size INTEGER,
  model_id    TEXT,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_context_usage_session ON context_usage(session_id, recorded_at);
```

### ConfigStore Schema (JSON via electron-store)

```json
{
  "app": {
    "scanPaths": ["/Users/Shared/Nextcloud/Claude/ClaudeCode01"],
    "defaultProjectDir": "/Users/Shared/Nextcloud/Claude/ClaudeCode01",
    "maxSessions": 10
  },
  "mcp": {
    "port": 3100,
    "host": "127.0.0.1",
    "apiKey": "<generated-on-first-run>"
  },
  "orchestrator": {
    "dir": "~/.config/cipher-mux/orchestrator",
    "maxRetries": 2
  },
  "ui": {
    "chatroomVisible": false,
    "activeView": "cockpit",
    "layout": {
      "splits": [],
      "activePaneId": null
    }
  },
  "windows": {
    "main": { "x": 0, "y": 0, "width": 1400, "height": 900 }
  }
}
```

### Entity-Beziehungen

```
Session 1--n Message     (sender)
Session 1--n ReadStatus  (session_id)
Message 1--n ReadStatus  (message_id)
Session 1--1 ContextUsage (aktuellster Snapshot)
Project 1--n Session     (project_path, lose Kopplung)
```

## 4. API-Kontrakte / Schnittstellen

### IPC Channels (Main - Renderer)

Alle Channels mit Prefix `cipher-mux:` für Discoverability.

#### Sessions

| Channel | Richtung | Payload | Response |
|---------|----------|---------|----------|
| `cipher-mux:sessions:list` | invoke | -- | `SessionInfo[]` |
| `cipher-mux:sessions:start` | invoke | `StartSessionOpts` | `SessionInfo` |
| `cipher-mux:sessions:stop` | invoke | `{ sessionId: string }` | `void` |
| `cipher-mux:sessions:recover` | invoke | -- | `RecoveryResult` |
| `cipher-mux:session-changed` | push | `SessionInfo` | -- |
| `cipher-mux:session-stopped` | push | `{ sessionId: string }` | -- |

#### Terminals

| Channel | Richtung | Payload | Response |
|---------|----------|---------|----------|
| `cipher-mux:terminal:data` | push | `{ paneId: string, data: string }` | -- |
| `cipher-mux:terminal:write` | send | `{ paneId: string, data: string }` | -- |
| `cipher-mux:terminal:resize` | send | `{ paneId: string, cols: number, rows: number }` | -- |
| `cipher-mux:terminal:split` | invoke | `{ paneId: string, direction: 'h' or 'v' }` | `string` (new paneId) |
| `cipher-mux:terminal:capture` | invoke | `{ paneId: string, lines?: number }` | `string` |

#### Message Bus

| Channel | Richtung | Payload | Response |
|---------|----------|---------|----------|
| `cipher-mux:messages:send` | invoke | `SendMessage` | `Message` |
| `cipher-mux:messages:list` | invoke | `{ topic?: Topic, limit?: number }` | `Message[]` |
| `cipher-mux:messages:unread` | invoke | -- | `Record<Topic, number>` |
| `cipher-mux:messages:mark-read` | invoke | `{ messageIds: string[] }` | `void` |
| `cipher-mux:message-received` | push | `Message` | -- |

#### Projects

| Channel | Richtung | Payload | Response |
|---------|----------|---------|----------|
| `cipher-mux:projects:list` | invoke | -- | `ProjectInfo[]` |
| `cipher-mux:projects:scan` | invoke | -- | `ProjectInfo[]` |
| `cipher-mux:projects:kickoff` | invoke | `KickoffOpts` | `SessionInfo` |

#### Context Usage

| Channel | Richtung | Payload | Response |
|---------|----------|---------|----------|
| `cipher-mux:context:get` | invoke | `{ sessionId: string }` | `ContextUsage or null` |
| `cipher-mux:context:all` | invoke | -- | `Map<string, ContextUsage>` |
| `cipher-mux:context:updated` | push | `{ sessionId: string, usage: ContextUsage }` | -- |
| `cipher-mux:context:warning` | push | `{ sessionId: string, percentage: number }` | -- |

#### Config

| Channel | Richtung | Payload | Response |
|---------|----------|---------|----------|
| `cipher-mux:config:get` | invoke | `{ key: string }` | `unknown` |
| `cipher-mux:config:set` | invoke | `{ key: string, value: unknown }` | `void` |
| `cipher-mux:config:save-layout` | invoke | `LayoutState` | `void` |

#### Bugreport

| Channel | Richtung | Payload | Response |
|---------|----------|---------|----------|
| `cipher-mux:bugreport:collect` | invoke | -- | `BugreportData` |
| `cipher-mux:bugreport:export` | invoke | `{ format: 'json' or 'md' }` | `string` (Dateipfad) |

### MCP Tools (Externe Schnittstelle)

Transport: **Streamable HTTP** auf konfigurierbarem Host/Port.
Auth: `Authorization: Bearer <api-key>` Header.

#### mux_send

```json
{
  "name": "mux_send",
  "description": "Send a message to the cipher-mux message bus",
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic": { "type": "string", "enum": ["status", "bug", "review", "chat", "system"] },
      "sender": { "type": "string", "description": "Session ID or identifier" },
      "payload": { "type": "object", "description": "Message content" }
    },
    "required": ["topic", "sender", "payload"]
  }
}
```

#### mux_read

```json
{
  "name": "mux_read",
  "description": "Read messages from the message bus",
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic": { "type": "string", "enum": ["status", "bug", "review", "chat", "system"] },
      "limit": { "type": "number", "default": 20 },
      "since": { "type": "string", "description": "ULID or ISO timestamp" }
    }
  }
}
```

#### mux_status

```json
{
  "name": "mux_status",
  "description": "Get status of one or all sessions",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Optional: specific session" }
    }
  }
}
```

#### mux_sessions

```json
{
  "name": "mux_sessions",
  "description": "List all active sessions with metadata",
  "inputSchema": { "type": "object", "properties": {} }
}
```

#### mux_create_session

```json
{
  "name": "mux_create_session",
  "description": "Create a new Claude Code session in a tmux pane",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "projectPath": { "type": "string" },
      "command": { "type": "string", "description": "Optional initial command" }
    },
    "required": ["name", "projectPath"]
  }
}
```

#### mux_kill_session

```json
{
  "name": "mux_kill_session",
  "description": "Kill a session by ID",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string" }
    },
    "required": ["sessionId"]
  }
}
```

#### mux_context_usage

```json
{
  "name": "mux_context_usage",
  "description": "Get context window usage for one or all sessions",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sessionId": { "type": "string", "description": "Optional: specific session" }
    }
  }
}
```

## 5. UI-Architektur

### Screen-Map

```
+-------------------------------------------------------------+
|  cipher-mux-electron                                   _ X  |
+----+--------------------------------------------+-----------+
|    |                                            |           |
| A  |         Main Content Area                  |  Chatroom |
| c  |                                            |  Panel    |
| t  |  +- Cockpit View ----------------------+  |  (Cmd+K) |
| i  |  |  [Card] [Card] [Card]               |  |           |
| v  |  |  [Card] [Card] [Card]               |  |  Messages |
| i  |  +-------------------------------------+  |  --------  |
| t  |                                            |  [Input]  |
| y  |  +- Terminal View ---------------------+  |           |
|    |  |  PaneHeader: project | phase | %     |  |           |
| R  |  |  +-----------+-------------+        |  |           |
| a  |  |  | xterm.js  |  xterm.js   |        |  |           |
| i  |  |  | (Sess. 1) |  (Sess. 2)  |        |  |           |
| l  |  |  +-----------+-------------+        |  |           |
|    |  +-------------------------------------+  |           |
| 48 |                                            |   280px   |
| px |                                            |           |
+----+--------------------------------------------+-----------+
|  Status Bar: Session-Count | MCP-Port | Orchestrator        |
+-------------------------------------------------------------+
```

### Views & Navigation

| View | Trigger | Beschreibung |
|------|---------|-------------|
| Cockpit | Cmd+0 / App-Start | Projekt-Card-Grid, Session-Start |
| Fokussiert | Cmd+1-9 / Klick auf Rail-Icon | Einzelne Session fullscreen |
| Split | Cmd+Backslash (vertikal), Cmd+Minus (horizontal) | 2+ Sessions nebeneinander |
| Chatroom | Cmd+K toggle | Rechte Sidebar ein/aus |
| Kickoff | Cmd+N | Dialog für neues Projekt |
| Info | Activity Rail Icon | Hilfe-Seite |
| Bugreport | Menu / Activity Rail | Diagnostik-Dialog |

### State Management

**Kein Redux/Zustand.** Leichtgewichtiger Ansatz:

1. **Server State** (Sessions, Messages, Projects): Via IPC-Queries on demand + Push-Events für Updates
2. **UI State** (aktive View, Split-Layout, Chatroom-Visibility): Preact `useState`/`useReducer` im App-Root
3. **Persistenter State** (Layout, Window-Bounds): ConfigStore via IPC, debounced saves (500ms)

```typescript
// App-Level State
interface AppState {
  activeView: 'cockpit' | 'terminal' | 'info'
  activeSessionId: string | null
  splitLayout: SplitLayout
  chatroomVisible: boolean
}

// Preact Context für globalen Zugriff
const AppContext = createContext<AppState & AppActions>(null!)
```

### Keyboard Shortcuts (MVP -- fix)

| Shortcut | Aktion |
|----------|--------|
| Cmd+0 | Cockpit View |
| Cmd+1-9 | Session 1-9 fokussieren |
| Cmd+Backslash | Vertikaler Split |
| Cmd+Minus | Horizontaler Split |
| Cmd+K | Chatroom toggle |
| Cmd+N | Neues Projekt (Kickoff) |
| Cmd+W | Aktive Session schliessen |

## 6. Offene Entscheidungspunkte (Phase 3)

- [x] **ADR-001: tmux-Streaming-Mechanismus** -- Control Mode (-C) vs pipe-pane vs capture-pane-Polling. Control Mode bietet strukturierte Events (`%output`, `%sessions-changed`) und Flow Control (`pause-after`), ist aber komplexer zu implementieren. pipe-pane ist einfacher, aber unstrukturiert. Empfehlung: Control Mode evaluieren.

- [x] **ADR-002: MCP Transport** -- Streamable HTTP (aktueller MCP-Standard, SSE deprecated) vs stdio-Proxy. Streamable HTTP erlaubt externe Clients (OpenClaw via Tailscale), stdio ist einfacher aber nur für lokale Subprocess-Szenarien. Empfehlung: Streamable HTTP.

- [x] **ADR-003: StatusLine-Integration** -- Hook-basiert (statusLine-Command schreibt in Datei/Named Pipe, Main Process liest, ~300ms Refresh) vs Session-JSONL-Parsing (~/.claude/projects/). Hook ist real-time, JSONL ist offline-fähig. Empfehlung: Hook-basiert mit JSONL als Fallback.

- [x] **ADR-004: Renderer-Bundler** -- esbuild (schnell, simpel, kein HMR) vs Vite (HMR, Plugin-Ecosystem, Preact-Plugin) vs kein Bundler (wie cipher-desktop, aber inkompatibel mit TSX). Preact + TSX erfordert einen Bundler. Empfehlung: Vite für Dev-Ergonomie.

- [x] **ADR-005: xterm.js Renderer** -- WebGL (schnellstes Rendering, @xterm/addon-webgl) vs Canvas (@xterm/addon-canvas) vs DOM (Default, langsamstes). WebGL benötigt GPU, kann `webglcontextlost` werfen. Empfehlung: WebGL mit Canvas-Fallback.

- [x] **ADR-006: ULID-Generierung** -- `ulid` (Original, weit verbreitet) vs `ulidx` (modernerer Fork) vs Custom. Muss monoton sortierbar und performant sein für Message-IDs.

- [x] **ADR-007: Message-Retention** -- Automatisches Cleanup-Intervall und Schwellenwert. Optionen: Zeitbasiert (>7 Tage), Anzahlbasiert (>1000 pro Topic), oder beides. Auswirkung auf WAL-Dateigrösse und Query-Performance.

- [x] **ADR-008: Orchestrator CLAUDE.md Template** -- Rollendefinition, MCP-Config-Injection, Delegation-Constraints (2-Retry-Limit), Task-Sizing-Heuristiken. Muss so formuliert sein, dass Claude Code sinnvoll delegiert.

## 7. Akzeptanzkriterien

### Eingebettete Terminals
- [ ] User kann eine neue tmux-Session starten und sieht Output in xterm.js
- [ ] User kann Text in xterm.js tippen und es erscheint in der tmux-Session
- [ ] Pane-Splitting erzeugt zwei nebeneinander liegende Terminals
- [ ] Pane-Header zeigt Projektname und Context-Usage (%)
- [ ] Bei `cat` einer grossen Datei bleibt die UI responsiv (Batching funktioniert)

### Activity Rail & Layout
- [ ] Icons für alle aktiven Sessions (max 10) in der linken Leiste
- [ ] Klick auf Icon wechselt zur entsprechenden Session
- [ ] Unread-Badge zeigt Anzahl ungelesener Messages pro Session
- [ ] Cmd+0 wechselt zum Cockpit View

### Message Bus
- [ ] Session A kann `mux_send` aufrufen und Session B empfängt die Nachricht
- [ ] Unread-Count aktualisiert sich in Echtzeit
- [ ] Messages ueberleben App-Neustart (SQLite-Persistenz)

### MCP Server
- [ ] HTTP-Request an localhost:3100/mcp mit gueltigem Bearer-Token liefert Tool-Liste
- [ ] Claude Code Session kann via MCP-Config Tools aufrufen
- [ ] Ohne gueltigen API-Key wird Request abgelehnt (401)
- [ ] OpenClaw kann sich verbinden und Tools nutzen

### Chatroom
- [ ] Cmd+K oeffnet/schliesst die rechte Sidebar
- [ ] Messages aus allen Topics erscheinen chronologisch
- [ ] User kann eine Nachricht tippen und an ein Topic senden
- [ ] Context-Warning (>80%) erscheint als System-Message

### Orchestrator
- [ ] Blitz-Icon in Activity Rail startet/zeigt Orchestrator
- [ ] Orchestrator kann via MCP eine neue Session erstellen
- [ ] Bei Fehler: maximal 2 Retries, dann Rueckfrage an User im Chatroom

### Cockpit View
- [ ] Card-Grid zeigt alle entdeckten Projekte aus Scan-Pfad
- [ ] Jede Card zeigt: Name, SDD-Phase, Git-Branch, Context-Usage
- [ ] Klick auf Card startet Session fuer dieses Projekt

### Kick-off
- [ ] Cmd+N oeffnet Kickoff-Dialog
- [ ] User kann Dateipfad (Requirements) und Zielverzeichnis angeben
- [ ] Nach Bestätigung: Verzeichnis wird erstellt, Session gestartet, /interview läuft

### Context-Budget
- [ ] Pane-Header zeigt aktuelle Context-Usage (%) fuer aktive Session
- [ ] Cockpit-Cards zeigen Usage pro Projekt
- [ ] Bei >80% erscheint Warnung im Chatroom
- [ ] MCP-Tool `mux_context_usage` liefert Daten fuer externen Zugriff

### Session Recovery
- [ ] Nach Electron-Crash und Neustart: Alle laufenden tmux-Sessions erscheinen wieder
- [ ] Verwaiste Sessions sind sichtbar und koennen beendet werden

### Info-Seite
- [ ] Erreichbar ueber Activity Rail
- [ ] Zeigt Shortcuts, Features, Workflows

### Bugreport
- [ ] Sammelt App-Version, OS-Version, Session-States, Logs
- [ ] Export als JSON oder Markdown

## 8. Nicht-funktionale Anforderungen (konkret)

### Performance

| Metrik | Ziel |
|--------|------|
| App-Start bis Cockpit sichtbar | < 2s |
| Terminal-Input-Latenz (Keypress bis Echo) | < 50ms |
| Terminal-Streaming (Batch-Interval) | 16ms (~60fps) |
| Session-Start (Cmd+N bis Terminal bereit) | < 1s |
| IPC Round-Trip (invoke) | < 10ms |
| Message Bus Write (single) | < 1ms |
| Cockpit-Scan (20 Projekte) | < 500ms |

### Sicherheit

- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- IPC: Whitelisted Channels, Input-Validierung im Main Process
- MCP: API-Key + Netzwerk-Isolation (Default: 127.0.0.1)
- ConfigStore: API-Key via `safeStorage` + macOS Keychain
- Shell-Execution: Argument-Arrays via `execFile` (kein Shell-Injection)
- Ausschliesslich sichere DOM-APIs (textContent, setAttribute) -- keine unsicheren HTML-Injektionen

### Resilience

- tmux-Sessions ueberleben Electron-Crashes (tmux ist externer Prozess)
- Layout-State wird bei jeder Aenderung gespeichert (debounced 500ms)
- SQLite WAL-Modus: Reads blockieren keine Writes
- StatusLine-Monitor: Defensive JSON-Parsing, graceful bei Format-Aenderungen
- MCP-Server: Graceful Shutdown, offene Requests abschliessen

### Dependencies

| Dependency | Version | Zweck |
|-----------|---------|-------|
| electron | ^34 | App-Shell |
| preact | ^10 | UI-Framework (~3KB) |
| @xterm/xterm | ^5 | Terminal-Emulation |
| @xterm/addon-fit | ^0.10 | Terminal Auto-Sizing |
| @xterm/addon-webgl | ^0.18 | GPU-Rendering |
| @xterm/addon-search | ^0.15 | Terminal-Suche |
| better-sqlite3 | ^11 | Message Bus Persistenz |
| @modelcontextprotocol/sdk | ^1 | MCP Server Framework |
| electron-store | ^10 | ConfigStore |
| ulid | ^2 | Sortierbare IDs |
| zod | ^3 | Schema-Validierung (MCP Tools) |

Dev Dependencies: `typescript`, `vite` (oder esbuild), `@preact/preset-vite`, `electron-builder`, `electron-rebuild`, `eslint`, `prettier`.

### Build & Packaging

```yaml
# electron-builder.yml
appId: com.cipher.mux
productName: cipher-mux
mac:
  category: public.app-category.developer-tools
  icon: assets/icon.icns
  target: [dmg]
  darkModeSupport: true
  entitlements: assets/entitlements.mac.plist
  extendInfo:
    NSAppleEventsUsageDescription: "cipher-mux needs Apple Events for tmux integration."
asarUnpack:
  - "**/node_modules/better-sqlite3/**"
npmRebuild: true
```
