# Task Infrastructure — Symphony-inspirierte Arbeitssteuerung

**Datum:** 2026-04-21
**Status:** Design approved
**Inspiration:** OpenAI Symphony (Poll-Dispatch-Resolve), MultiProjectOrchestrator (Swarm-of-Swarms)

## Motivation

Der Orchestrator hat sich durch Trial & Error proaktives Monitoring, Worker-Startup-Protokolle und Build-Before-Kill-Verhalten in seine eigenen Memory-Dateien geschrieben — weil cipher-mux diese Konzepte nicht als Infrastruktur bietet. Dieses Design überführt gelerntes Verhalten in deterministische Infrastruktur.

**Kernprinzip (Symphony):** "Manage work instead of supervising coding agents" — Queue-Management gehört in die Infrastruktur, nicht in den LLM-Context.

**Drei Use Cases:**
1. **Orchestrator-Alltag:** 10 Bugfixes in einer Queue, automatisches Stall-Detection, Completion-Verification
2. **Multi-Projekt:** Orchestrator spawnt N Projektlauncher-Sessions, jede mit eigenen Sub-Tasks (Swarm of Swarms)
3. **Erweiterbare Quellen:** Bugreport-Outbox als erste automatische Quelle, weitere registrierbar

## Architektur-Überblick

```
┌─────────────────────────────────────────────────────────┐
│                    cipher-mux-electron                    │
│                                                           │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │ TaskSource│──▸│ TaskManager  │◂──│ MCP Tools        │ │
│  │ (Ingest) │   │ (State+Queue)│   │ (mux_task_*)     │ │
│  └──────────┘   └──────┬───────┘   └──────────────────┘ │
│                         │                                 │
│              ┌──────────┼──────────┐                     │
│              ▼          ▼          ▼                     │
│  ┌──────────────┐ ┌──────────┐ ┌──────────────┐        │
│  │ TaskWatcher   │ │TaskHooks │ │ IPC → UI     │        │
│  │ (Stall Det.) │ │(Verify)  │ │ (TaskPanel)  │        │
│  └──────────────┘ └──────────┘ └──────────────┘        │
│                                                           │
│  ┌───────────────────────────────────────────────────┐   │
│  │                SQLite (WAL)                        │   │
│  │  ┌──────────┐  ┌──────────┐                       │   │
│  │  │ messages │  │  tasks   │                       │   │
│  │  └──────────┘  └──────────┘                       │   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 1. Task-Datenmodell

### SQLite-Tabelle

```sql
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT,
  session_id    TEXT,
  source        TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  state         TEXT NOT NULL DEFAULT 'queued',
  policy        TEXT,
  retry_count   INTEGER DEFAULT 0,
  max_retries   INTEGER DEFAULT 2,
  result        TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  completed_at  INTEGER,
  FOREIGN KEY (parent_id) REFERENCES tasks(id)
);

CREATE INDEX idx_tasks_state ON tasks(state);
CREATE INDEX idx_tasks_source ON tasks(source);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_session ON tasks(session_id);
```

- `id`: ULID (wie Messages)
- `parent_id`: Hierarchie — Projektlauncher-Task → Sub-Tasks, oder null für Top-Level
- `session_id`: Zugewiesene Session, null wenn `queued`
- `source`: Herkunft — `'orchestrator'`, `'bugreport'`, `'kickoff'`, oder custom String
- `state`: State-Machine-Zustand (siehe unten)
- `policy`: JSON — `{ stall_timeout?, max_retries?, hooks?: { before_run?, after_run?, timeout? } }`
- `result`: JSON — `{ summary?, branch?, exit_code?, error? }`

### State Machine

```
queued ──▸ dispatched ──▸ running ──▸ validating ──▸ completed
                                  │               │
                                  ▼               ▼
                               stalled         failed
                                  │               │
                                  ▼               ▼
                          ┌─ retry_count < max_retries? ─┐
                          │ ja                        nein│
                          ▼                              ▼
                        queued                        failed
                     (retry_count++)                 (terminal)
```

**Transitions:**
- `queued → dispatched`: TaskManager.dispatch(taskId, sessionId) — Session zugewiesen
- `dispatched → running`: Worker meldet Start via mux_task_update
- `running → validating`: Worker meldet done, after_run Hook wird ausgeführt
- `validating → completed`: Hook Exit-Code 0
- `validating → failed`: Hook Exit-Code != 0
- `running → stalled`: TaskWatcher erkennt Inaktivität
- `stalled → queued`: Auto-Retry (Policy erlaubt)
- `stalled → failed`: Max Retries erreicht
- `failed → queued`: Manueller Retry (User oder Orchestrator)

### Hierarchie-Beispiele

**Bugreport-Alltag (flach):**
```
Task "Fix BUG-001.md" (source: bugreport, state: running)
Task "Fix BUG-002.md" (source: bugreport, state: queued)
Task "Fix BUG-003.md" (source: bugreport, state: queued)
```

**Multi-Projekt (hierarchisch):**
```
Task "Projekt X implementieren" (source: orchestrator)
  ├─ Task "Frontend" (source: orchestrator, session: Launcher-1)
  │   ├─ Task "Component A" (source: launcher, session: Worker-A)
  │   └─ Task "Component B" (source: launcher, session: Worker-B)
  └─ Task "Backend" (source: orchestrator, session: Launcher-2)
      └─ Task "API Endpoints" (source: launcher, session: Worker-C)
```

## 2. TaskManager Service

**Datei:** `src/main/task/task-manager.ts`

```typescript
class TaskManager extends EventEmitter {
  constructor(db: Database)

  // CRUD
  create(opts: CreateTaskOpts): Task
  update(id: string, patch: TaskPatch): Task
  get(id: string): Task | undefined
  list(filter?: TaskFilter): Task[]
  children(parentId: string): Task[]

  // Queue-Operationen
  nextQueued(source?: string): Task | undefined
  dispatch(taskId: string, sessionId: string): Task
  markRunning(taskId: string): Task
  markValidating(taskId: string): Task
  markCompleted(taskId: string, result: TaskResult): Task
  markFailed(taskId: string, reason: string): Task
  retry(taskId: string): Task

  // Events:
  //   'task:created'        (Task)
  //   'task:state-changed'  (Task, previousState)
  //   'task:completed'      (Task)
  //   'task:failed'         (Task)
  //   'task:stalled'        (Task)
  //   'task:retrying'       (Task)
}
```

**TaskFilter:**
```typescript
interface TaskFilter {
  state?: TaskState | TaskState[]
  source?: string
  parentId?: string | null    // null = Top-Level only
  sessionId?: string
}
```

**CreateTaskOpts:**
```typescript
interface CreateTaskOpts {
  title: string
  description?: string
  source: string
  parentId?: string
  policy?: TaskPolicy
}
```

**TaskPolicy:**
```typescript
interface TaskPolicy {
  stall_timeout?: number       // ms, default aus AppConfig
  max_retries?: number         // default aus AppConfig
  hooks?: {
    before_run?: string        // Shell-Command
    after_run?: string         // Shell-Command
    timeout?: number           // ms, default 60000
  }
}
```

## 3. TaskWatcher — Stall Detection

**Datei:** `src/main/task/task-watcher.ts`

Zwei-Ebenen-Erkennung:

### Session-Level (Baseline, immer aktiv)

- Lauscht auf TmuxManager `output`-Events
- Speichert letzten Output-Timestamp pro Session in Memory-Map
- Prüft im Intervall (Default 30s, konfigurierbar):
  - Für jede Session mit einem Task im State `running` oder `dispatched`:
    - `now - lastOutputTimestamp > stallTimeout` → `task:stalled`

### Task-Level (Bonus, wenn Worker kooperiert)

- Worker ruft `mux_task_update` auf → `updatedAt` wird refresht
- Prüft im Intervall:
  - Task in State `running` mit `now - updatedAt > task.policy.stall_timeout` → `task:stalled`

### Stall-Reaktion (Policy-basiert)

```typescript
onStall(task: Task):
  if task.retry_count < effectiveMaxRetries(task):
    // Auto-Recovery
    sessionManager.stop(task.session_id)   // Kill stalled Session
    taskManager.retry(task)                // queued, retry_count++
    emit 'task:retrying'
  else:
    taskManager.markFailed(task.id, 'max retries exceeded after stall')
    emit 'task:failed'
    // Orchestrator wird via Event benachrichtigt → kann eskalieren
```

**Orchestrator-Override:** Task-Policy kann `stall_timeout: -1` setzen → "diesen Task nie auto-stallan, der dauert halt lang".

## 4. TaskHooks — Completion Verification

**Datei:** `src/main/task/task-hooks.ts`

```typescript
class TaskHooks {
  runBeforeRun(task: Task, projectPath: string): Promise<HookResult>
  runAfterRun(task: Task, projectPath: string): Promise<HookResult>
}

interface HookResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}
```

**Ablauf nach Worker-"done":**

1. Worker ruft `mux_task_update(state: 'done')` auf
2. TaskManager setzt State → `validating`
3. TaskHooks.runAfterRun() wird ausgeführt im `projectPath` der Session
4. Hook-Source (Priorität):
   - `task.policy.hooks.after_run` (per-Task)
   - `AppConfig.orchestrator.defaultHooks.after_run` (global Default)
   - Kein Hook konfiguriert → direkt `completed`
5. Exit-Code 0 → `completed`
6. Exit-Code != 0 → `failed`, zurück in Queue falls Retries übrig

## 5. TaskSource — Erweiterbare Quellen

**Datei:** `src/main/task/task-source.ts`

```typescript
interface TaskSource {
  readonly name: string
  start(emit: (opts: CreateTaskOpts) => void): void
  stop(): void
}
```

### BugreportTaskSource (erste Implementierung)

**Datei:** `src/main/task/sources/bugreport-source.ts`

- Watched Verzeichnis aus `AppConfig.orchestrator.taskSources.bugreport.path`
- Nutzt `fs.watch()` für neue `.md`-Dateien
- Neue Datei → `CreateTaskOpts`:
  ```typescript
  {
    title: `Fix ${filename}`,
    description: fileContent,
    source: 'bugreport',
    policy: {
      max_retries: 2,
      hooks: { after_run: 'npm test' }
    }
  }
  ```
- Deduplizierung: Prüft ob Task mit gleichem Titel + Source bereits existiert

### Weitere Quellen (Zukunft, kein Code jetzt)

- `KickoffTaskSource` — nach kickoff_complete automatisch Implement-Task erstellen
- `GitHubTaskSource` — Issues/PRs als Tasks (für "we build to share")
- `MessageBusTaskSource` — bestimmte Messages als Tasks interpretieren

Neue Quelle = neue Klasse + eine Zeile in IpcHub:
```typescript
const newSource = new MyTaskSource(config)
newSource.start((opts) => this.taskManager.create(opts))
```

## 6. MCP-Tools

Vier neue Tools, registriert in `mcp-tools.ts`:

### mux_task_create

```
Input:  { title, description?, source?, parent_id?, policy? }
Output: { task: Task }
Default source: 'orchestrator'
```

### mux_task_update

```
Input:  { task_id, state?, progress?, result? }
Output: { task: Task }
State-Transitions werden validiert (keine ungültigen Sprünge)
```

### mux_task_list

```
Input:  { state?, source?, parent_id?, session_id?, limit? }
Output: { tasks: Task[], total: number }
```

### mux_task_get

```
Input:  { task_id }
Output: { task: Task, children: Task[] }
```

## 7. IPC-Channels

### Request-Channels (Renderer → Main)

```
task:list           → TaskFilter → Task[]
task:get            → { id } → { task, children }
task:retry          → { id } → Task
task:cancel         → { id } → Task (state → failed, reason: 'cancelled by user')
```

### Push-Channels (Main → Renderer)

```
task:created        → Task
task:state-changed  → { task, previousState }
```

## 8. UI: TaskPanel

Neue Komponente im Cockpit-Bereich (Tab neben Chat/Sessions).

### Layout

```
┌─ Tasks ──────────────────────────────────┐
│ ● bugreport (3)  ○ orchestrator (1)      │  ← Filter by source
│──────────────────────────────────────────│
│ ◉ Fix BUG-001.md          running   ↻    │  ← neon-green dot
│ ◎ Fix BUG-002.md          queued         │  ← neon-yellow dot
│ ◎ Fix BUG-003.md          queued         │  ← neon-yellow dot
│ ◉ Projekt X               running   ▾    │  ← aufklappbar
│   ◉ Frontend              running        │
│   ◎ Backend               queued         │
│ ● Fix BUG-000.md          completed      │  ← neon-blue dot
│ ✖ Fix BUG-099.md          failed    ↻    │  ← neon-red dot, Retry-Button
│──────────────────────────────────────────│
│ Queued: 2 │ Running: 2 │ Done: 1        │  ← Summary-Bar
└──────────────────────────────────────────┘
```

### Interaktionen (Click-first)

- **Klick auf Task** → Detail-Ansicht (Description, Result, Policy, Session-Link)
- **↻ Button** → Retry (task:retry IPC)
- **✕ Button** → Cancel (task:cancel IPC)
- **▾ Button** → Children aufklappen/zuklappen
- **Source-Filter** → Toggle-Buttons oben

### Status-Dots (cipher-Aesthetic)

Gleiche CSS-Technik wie bestehende Session-Status-Dots:
- `queued` → neon-yellow, pulsierend
- `dispatched` → neon-yellow, statisch
- `running` → neon-green, pulsierend
- `validating` → neon-cyan, pulsierend
- `completed` → neon-blue, statisch
- `failed` → neon-red, statisch
- `stalled` → neon-orange, schnell pulsierend

## 9. AppConfig-Erweiterung

```typescript
interface AppConfig {
  // ... bestehendes ...
  orchestrator: {
    dir: string                    // existiert
    maxRetries: number             // existiert
    stallTimeout: number           // NEU: Default 300000 (5min)
    watchInterval: number          // NEU: Default 30000 (30s)
    defaultHooks: {                // NEU
      before_run?: string
      after_run?: string
      timeout?: number             // Default 60000
    }
    taskSources: {                 // NEU
      bugreport: {
        enabled: boolean           // Default true
        path: string               // Default '~/.config/cipher-mux/bugreports/outbox'
      }
      // Erweiterbar: weitere Quellen als Key-Value
      [key: string]: {
        enabled: boolean
        path?: string
        [key: string]: unknown
      }
    }
  }
}
```

## 10. Orchestrator-Template-Anpassung

`orchestrator-template.ts` wird erweitert um Task-Tools-Referenz:

```markdown
## Task Management

Du hast eine persistente Task-Queue. Nutze sie statt dir Tasks im Context zu merken.

- `mux_task_create` — Task in Queue legen
- `mux_task_update` — Status melden (running, done, failed)
- `mux_task_list` — Offene Tasks sehen
- `mux_task_get` — Task-Details mit Sub-Tasks

### Bugreport-Workflow (automatisch)

Neue Dateien in der Bugreport-Outbox werden automatisch als Tasks erstellt.
Prüfe `mux_task_list(source: 'bugreport', state: 'queued')` für offene Bugs.

### Delegation mit Tasks

1. `mux_task_create(title, description)` — Task anlegen
2. `mux_create_session(name, projectPath)` — Worker spawnen
3. `mux_task_update(task_id, state: 'dispatched', session_id)` — Task zuweisen
4. Worker arbeitet, meldet Progress via `mux_task_update`
5. Nach Worker-Done: Hooks verifizieren automatisch (Tests, Build)
6. Stall Detection greift automatisch — du musst nicht manuell pollen

### Multi-Projekt

Für große Projekte: Erstelle Parent-Task, dann Child-Tasks pro Launcher-Session.
`mux_task_get(parent_id)` zeigt dir den Gesamtfortschritt.
```

## 11. Testbarkeit

Alle Services bekommen Dependencies via Constructor Injection:

- `TaskManager(db)` — testbar mit In-Memory SQLite
- `TaskWatcher(taskManager, sessionManager)` — testbar mit Mocks
- `TaskHooks()` — testbar mit gemocktem `exec`
- `BugreportTaskSource(path)` — testbar mit tmp-Verzeichnis

**Test-Dateien:**
- `test/main/task-manager.test.ts` — State Machine, CRUD, Queue-Operationen
- `test/main/task-watcher.test.ts` — Stall Detection Timing, Policy-Logik
- `test/main/task-hooks.test.ts` — Hook-Execution, Timeout, Exit-Codes
- `test/main/bugreport-source.test.ts` — FileWatch, Deduplizierung

## 12. Nicht in Scope (bewusst)

- **Distributed Workers (SSH)** — macOS-only, lokaler Stack
- **Token-Budgeting** — Context-Usage existiert, aber kein Cost-Cap pro Task
- **Persistent Retry-Timers** — Bei App-Restart: Tasks mit Session die noch lebt (tmux) → zurück auf `running`. Tasks ohne Session → `failed`. Stall-Timers starten neu.
- **Task-Migration** — Kein Verschieben von Tasks zwischen Sessions
- **GitHub/Linear Integration** — Zukunft, über TaskSource-Interface erweiterbar
- **Task-Priorität** — FIFO reicht erstmal, Priority-Feld kann später ergänzt werden
