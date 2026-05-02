# Task Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent task queue with state machine, stall detection, completion hooks, and extensible task sources to cipher-mux-electron, enabling the orchestrator to manage work instead of supervising agents.

**Architecture:** New `src/main/task/` module with TaskManager (SQLite-backed state machine), TaskWatcher (dual-level stall detection), TaskHooks (shell-based completion verification), and TaskSource interface (BugreportTaskSource as first implementation). Wired into existing IpcHub, MCP tools, and renderer via preload bridge.

**Tech Stack:** TypeScript strict, better-sqlite3 (WAL), Node.js EventEmitter, node:test, fs.watch

**Security note:** TaskHooks uses `child_process.exec()` intentionally — hook commands are admin-configured shell pipelines (e.g. `npm test && npm run lint`) that require shell interpretation. These are NOT user-input-driven; they come from AppConfig or task policy set by the orchestrator/admin. This is analogous to git hooks or CI scripts.

---

### Task 1: Shared Types and Constants

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Create: `test/main/task-types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/main/task-types.test.ts`:

```typescript
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import type {
  Task, TaskState, TaskPolicy, TaskResult,
  CreateTaskOpts, TaskPatch, TaskFilter,
} from '../../src/shared/types'

describe('Task types', () => {
  it('should allow constructing a valid Task object', () => {
    const task: Task = {
      id: '01ABC',
      parentId: null,
      sessionId: null,
      source: 'orchestrator',
      title: 'Fix bug',
      description: 'Fix the login bug',
      state: 'queued',
      policy: null,
      retryCount: 0,
      maxRetries: 2,
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
    }
    assert.equal(task.state, 'queued')
    assert.equal(task.source, 'orchestrator')
  })

  it('should allow all valid TaskState values', () => {
    const states: TaskState[] = [
      'queued', 'dispatched', 'running', 'validating',
      'completed', 'failed', 'stalled',
    ]
    assert.equal(states.length, 7)
  })

  it('should allow constructing CreateTaskOpts', () => {
    const opts: CreateTaskOpts = {
      title: 'Test task',
      source: 'bugreport',
      description: 'desc',
      parentId: '01XYZ',
      policy: {
        stallTimeout: 300000,
        maxRetries: 3,
        hooks: { afterRun: 'npm test', timeout: 60000 },
      },
    }
    assert.equal(opts.source, 'bugreport')
    assert.equal(opts.policy?.hooks?.afterRun, 'npm test')
  })

  it('should allow constructing TaskFilter', () => {
    const filter: TaskFilter = {
      state: ['queued', 'running'],
      source: 'bugreport',
      parentId: null,
    }
    assert.ok(Array.isArray(filter.state))
  })

  it('should allow constructing TaskResult', () => {
    const result: TaskResult = {
      summary: 'Fixed the bug',
      branch: 'fix/BUG-001',
      exitCode: 0,
    }
    assert.equal(result.exitCode, 0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "Task types" 2>&1 | tail -20`
Expected: FAIL — types not exported from `src/shared/types.ts`

- [ ] **Step 3: Add Task types to src/shared/types.ts**

Add at the end of `src/shared/types.ts`:

```typescript
// ─── Tasks ──────────────────────────────────────────────

export type TaskState =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'stalled'

export interface TaskPolicy {
  stallTimeout?: number
  maxRetries?: number
  hooks?: {
    beforeRun?: string
    afterRun?: string
    timeout?: number
  }
}

export interface TaskResult {
  summary?: string
  branch?: string
  exitCode?: number
  error?: string
}

export interface Task {
  id: string
  parentId: string | null
  sessionId: string | null
  source: string
  title: string
  description: string | null
  state: TaskState
  policy: TaskPolicy | null
  retryCount: number
  maxRetries: number
  result: TaskResult | null
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

export interface CreateTaskOpts {
  title: string
  description?: string
  source: string
  parentId?: string
  policy?: TaskPolicy
}

export interface TaskPatch {
  state?: TaskState
  sessionId?: string
  description?: string
  policy?: TaskPolicy
  result?: TaskResult
}

export interface TaskFilter {
  state?: TaskState | TaskState[]
  source?: string
  parentId?: string | null
  sessionId?: string
}
```

- [ ] **Step 4: Add task constants to src/shared/constants.ts**

Add at the end of `src/shared/constants.ts`:

```typescript
/** Task stall detection defaults */
export const TASK_STALL_TIMEOUT_MS = 300_000       // 5 minutes
export const TASK_WATCH_INTERVAL_MS = 30_000       // 30 seconds
export const TASK_HOOK_TIMEOUT_MS = 60_000         // 60 seconds
export const TASK_DEFAULT_MAX_RETRIES = 2
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "Task types" 2>&1 | tail -20`
Expected: PASS — all 5 tests green

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts test/main/task-types.test.ts
git commit -m "feat(task): add Task types and constants to shared modules"
```

---

### Task 2: Task Schema (SQLite)

**Files:**
- Create: `src/main/task/task-schema.ts`
- Create: `test/main/task-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/main/task-schema.test.ts`:

```typescript
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { TASK_SCHEMA_SQL } from '../../src/main/task/task-schema'

describe('Task schema', () => {
  it('should create the tasks table in a fresh database', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
    ).all()
    assert.equal(tables.length, 1)
    db.close()
  })

  it('should create all required indices', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)

    const indices = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_tasks_%'"
    ).all() as { name: string }[]
    const names = indices.map((i) => i.name).sort()

    assert.deepEqual(names, [
      'idx_tasks_parent',
      'idx_tasks_session',
      'idx_tasks_source',
      'idx_tasks_state',
    ])
    db.close()
  })

  it('should enforce foreign key on parent_id (self-referencing)', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(TASK_SCHEMA_SQL)

    const stmt = db.prepare(
      `INSERT INTO tasks (id, source, title, state, retry_count, max_retries, created_at, updated_at, parent_id)
       VALUES ('t1', 'test', 'child', 'queued', 0, 2, 1000, 1000, 'nonexistent')`
    )
    assert.throws(() => stmt.run(), /FOREIGN KEY/)
    db.close()
  })

  it('should allow null parent_id for top-level tasks', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)

    db.prepare(
      `INSERT INTO tasks (id, source, title, state, retry_count, max_retries, created_at, updated_at)
       VALUES ('t1', 'test', 'top-level', 'queued', 0, 2, 1000, 1000)`
    ).run()

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('t1') as { title: string }
    assert.equal(row.title, 'top-level')
    db.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "Task schema" 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement task-schema.ts**

Create `src/main/task/task-schema.ts`:

```typescript
/** SQLite schema for the task queue */

export const TASK_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    parent_id     TEXT,
    session_id    TEXT,
    source        TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    state         TEXT NOT NULL DEFAULT 'queued',
    policy        TEXT,
    retry_count   INTEGER NOT NULL DEFAULT 0,
    max_retries   INTEGER NOT NULL DEFAULT 2,
    result        TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    completed_at  INTEGER,
    FOREIGN KEY (parent_id) REFERENCES tasks(id)
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_state
    ON tasks (state);
  CREATE INDEX IF NOT EXISTS idx_tasks_source
    ON tasks (source);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent
    ON tasks (parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_session
    ON tasks (session_id);
`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "Task schema" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/task/task-schema.ts test/main/task-schema.test.ts
git commit -m "feat(task): add SQLite schema for tasks table"
```

---

### Task 3: TaskManager — Core CRUD and State Machine

**Files:**
- Create: `src/main/task/task-manager.ts`
- Create: `test/main/task-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/main/task-manager.test.ts`:

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { TaskManager } from '../../src/main/task/task-manager'
import { TASK_SCHEMA_SQL } from '../../src/main/task/task-schema'
import type { Task, CreateTaskOpts } from '../../src/shared/types'

function createManager(): { manager: TaskManager; db: Database.Database } {
  const db = new Database(':memory:')
  db.exec(TASK_SCHEMA_SQL)
  const manager = new TaskManager(db)
  return { manager, db }
}

describe('TaskManager', () => {
  let manager: TaskManager
  let db: Database.Database

  beforeEach(() => {
    const setup = createManager()
    manager = setup.manager
    db = setup.db
  })

  afterEach(() => {
    db.close()
  })

  // ─── CRUD ────────────────────────────────────────────

  describe('create', () => {
    it('should create a task with defaults', () => {
      const task = manager.create({ title: 'Fix bug', source: 'orchestrator' })
      assert.ok(task.id)
      assert.equal(task.title, 'Fix bug')
      assert.equal(task.source, 'orchestrator')
      assert.equal(task.state, 'queued')
      assert.equal(task.retryCount, 0)
      assert.equal(task.maxRetries, 2)
      assert.equal(task.parentId, null)
      assert.equal(task.sessionId, null)
    })

    it('should create a task with policy and parent', () => {
      const parent = manager.create({ title: 'Parent', source: 'orchestrator' })
      const child = manager.create({
        title: 'Child',
        source: 'orchestrator',
        parentId: parent.id,
        policy: { stallTimeout: 600000, maxRetries: 5 },
      })
      assert.equal(child.parentId, parent.id)
      assert.equal(child.policy?.stallTimeout, 600000)
      assert.equal(child.maxRetries, 5)
    })

    it('should emit task:created event', () => {
      const events: Task[] = []
      manager.on('task:created', (t: Task) => events.push(t))
      manager.create({ title: 'Test', source: 'test' })
      assert.equal(events.length, 1)
      assert.equal(events[0].title, 'Test')
    })
  })

  describe('get and list', () => {
    it('should get a task by id', () => {
      const created = manager.create({ title: 'A', source: 'test' })
      const fetched = manager.get(created.id)
      assert.equal(fetched?.id, created.id)
    })

    it('should return undefined for non-existent id', () => {
      assert.equal(manager.get('nonexistent'), undefined)
    })

    it('should list with filters', () => {
      manager.create({ title: 'A', source: 'bugreport' })
      manager.create({ title: 'B', source: 'orchestrator' })
      manager.create({ title: 'C', source: 'bugreport' })

      const bugs = manager.list({ source: 'bugreport' })
      assert.equal(bugs.length, 2)

      const all = manager.list()
      assert.equal(all.length, 3)
    })

    it('should filter by state array', () => {
      const a = manager.create({ title: 'A', source: 'test' })
      manager.create({ title: 'B', source: 'test' })
      manager.dispatch(a.id, 'session-1')
      manager.markRunning(a.id)

      const result = manager.list({ state: ['running', 'queued'] })
      assert.equal(result.length, 2)
    })

    it('should filter by parentId null for top-level', () => {
      const parent = manager.create({ title: 'Parent', source: 'test' })
      manager.create({ title: 'Child', source: 'test', parentId: parent.id })

      const topLevel = manager.list({ parentId: null })
      assert.equal(topLevel.length, 1)
      assert.equal(topLevel[0].title, 'Parent')
    })

    it('should get children of a parent', () => {
      const parent = manager.create({ title: 'P', source: 'test' })
      manager.create({ title: 'C1', source: 'test', parentId: parent.id })
      manager.create({ title: 'C2', source: 'test', parentId: parent.id })

      const children = manager.children(parent.id)
      assert.equal(children.length, 2)
    })
  })

  // ─── State Machine ──────────────────────────────────

  describe('state transitions', () => {
    it('queued -> dispatched -> running -> validating -> completed', () => {
      const task = manager.create({ title: 'Full flow', source: 'test' })
      assert.equal(task.state, 'queued')

      const dispatched = manager.dispatch(task.id, 'session-1')
      assert.equal(dispatched.state, 'dispatched')
      assert.equal(dispatched.sessionId, 'session-1')

      const running = manager.markRunning(task.id)
      assert.equal(running.state, 'running')

      const validating = manager.markValidating(task.id)
      assert.equal(validating.state, 'validating')

      const completed = manager.markCompleted(task.id, { summary: 'Done', exitCode: 0 })
      assert.equal(completed.state, 'completed')
      assert.ok(completed.completedAt)
      assert.equal(completed.result?.summary, 'Done')
    })

    it('running -> stalled (via markStalled)', () => {
      const task = manager.create({ title: 'Stall test', source: 'test' })
      manager.dispatch(task.id, 's1')
      manager.markRunning(task.id)

      const stalled = manager.markStalled(task.id)
      assert.equal(stalled.state, 'stalled')
    })

    it('should reject invalid transitions', () => {
      const task = manager.create({ title: 'Invalid', source: 'test' })
      // queued -> running is invalid (must go through dispatched)
      assert.throws(() => manager.markRunning(task.id), /Invalid state transition/)
    })

    it('should reject dispatching a non-queued task', () => {
      const task = manager.create({ title: 'X', source: 'test' })
      manager.dispatch(task.id, 's1')
      // dispatched -> dispatched is invalid
      assert.throws(() => manager.dispatch(task.id, 's2'), /Invalid state transition/)
    })

    it('validating -> failed', () => {
      const task = manager.create({ title: 'Fail', source: 'test' })
      manager.dispatch(task.id, 's1')
      manager.markRunning(task.id)
      manager.markValidating(task.id)

      const failed = manager.markFailed(task.id, 'tests broke')
      assert.equal(failed.state, 'failed')
      assert.equal(failed.result?.error, 'tests broke')
    })

    it('should emit task:state-changed on every transition', () => {
      const events: { task: Task; previousState: string }[] = []
      manager.on('task:state-changed', (t: Task, prev: string) =>
        events.push({ task: t, previousState: prev })
      )

      const task = manager.create({ title: 'Events', source: 'test' })
      manager.dispatch(task.id, 's1')
      manager.markRunning(task.id)

      assert.equal(events.length, 2)
      assert.equal(events[0].previousState, 'queued')
      assert.equal(events[0].task.state, 'dispatched')
      assert.equal(events[1].previousState, 'dispatched')
      assert.equal(events[1].task.state, 'running')
    })

    it('should emit task:completed on completion', () => {
      const completed: Task[] = []
      manager.on('task:completed', (t: Task) => completed.push(t))

      const task = manager.create({ title: 'Done', source: 'test' })
      manager.dispatch(task.id, 's1')
      manager.markRunning(task.id)
      manager.markValidating(task.id)
      manager.markCompleted(task.id, { summary: 'ok' })

      assert.equal(completed.length, 1)
    })

    it('should emit task:failed on failure', () => {
      const failed: Task[] = []
      manager.on('task:failed', (t: Task) => failed.push(t))

      const task = manager.create({ title: 'Fail', source: 'test' })
      manager.dispatch(task.id, 's1')
      manager.markRunning(task.id)
      manager.markFailed(task.id, 'error')

      assert.equal(failed.length, 1)
    })
  })

  // ─── Queue Operations ───────────────────────────────

  describe('queue operations', () => {
    it('nextQueued should return oldest queued task', () => {
      manager.create({ title: 'First', source: 'test' })
      manager.create({ title: 'Second', source: 'test' })

      const next = manager.nextQueued()
      assert.equal(next?.title, 'First')
    })

    it('nextQueued should filter by source', () => {
      manager.create({ title: 'Bug1', source: 'bugreport' })
      manager.create({ title: 'Task1', source: 'orchestrator' })

      const next = manager.nextQueued('orchestrator')
      assert.equal(next?.title, 'Task1')
    })

    it('nextQueued should return undefined when queue is empty', () => {
      assert.equal(manager.nextQueued(), undefined)
    })
  })

  // ─── Retry ──────────────────────────────────────────

  describe('retry', () => {
    it('should move failed task back to queued and increment retry_count', () => {
      const task = manager.create({ title: 'Retry', source: 'test' })
      manager.dispatch(task.id, 's1')
      manager.markRunning(task.id)
      manager.markFailed(task.id, 'error')

      const retried = manager.retry(task.id)
      assert.equal(retried.state, 'queued')
      assert.equal(retried.retryCount, 1)
      assert.equal(retried.sessionId, null)
    })

    it('should move stalled task back to queued', () => {
      const task = manager.create({ title: 'Stall retry', source: 'test' })
      manager.dispatch(task.id, 's1')
      manager.markRunning(task.id)
      manager.markStalled(task.id)

      const retried = manager.retry(task.id)
      assert.equal(retried.state, 'queued')
      assert.equal(retried.retryCount, 1)
    })

    it('should reject retry on non-failed/stalled task', () => {
      const task = manager.create({ title: 'No retry', source: 'test' })
      assert.throws(() => manager.retry(task.id), /Can only retry/)
    })

    it('should emit task:retrying', () => {
      const events: Task[] = []
      manager.on('task:retrying', (t: Task) => events.push(t))

      const task = manager.create({ title: 'Retry event', source: 'test' })
      manager.dispatch(task.id, 's1')
      manager.markRunning(task.id)
      manager.markFailed(task.id, 'err')
      manager.retry(task.id)

      assert.equal(events.length, 1)
    })
  })

  // ─── Update ─────────────────────────────────────────

  describe('update', () => {
    it('should update description and policy', () => {
      const task = manager.create({ title: 'Updatable', source: 'test' })
      const updated = manager.update(task.id, {
        description: 'New desc',
        policy: { stallTimeout: 999 },
      })
      assert.equal(updated.description, 'New desc')
      assert.equal(updated.policy?.stallTimeout, 999)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "TaskManager" 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement task-manager.ts**

Create `src/main/task/task-manager.ts`:

```typescript
import { EventEmitter } from 'events'
import type Database from 'better-sqlite3'
import { ulid } from 'ulidx'
import { TASK_DEFAULT_MAX_RETRIES } from '../../shared/constants'
import type {
  Task, TaskState, CreateTaskOpts, TaskPatch,
  TaskFilter, TaskPolicy, TaskResult,
} from '../../shared/types'

/** Valid state transitions: from -> [to, to, ...] */
const VALID_TRANSITIONS: Record<string, TaskState[]> = {
  queued:     ['dispatched'],
  dispatched: ['running'],
  running:    ['validating', 'stalled', 'failed'],
  validating: ['completed', 'failed'],
  stalled:    ['queued', 'failed'],
  failed:     ['queued'],
  completed:  [],
}

interface RawTaskRow {
  id: string
  parent_id: string | null
  session_id: string | null
  source: string
  title: string
  description: string | null
  state: string
  policy: string | null
  retry_count: number
  max_retries: number
  result: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
}

function rowToTask(row: RawTaskRow): Task {
  return {
    id: row.id,
    parentId: row.parent_id,
    sessionId: row.session_id,
    source: row.source,
    title: row.title,
    description: row.description,
    state: row.state as TaskState,
    policy: row.policy ? JSON.parse(row.policy) as TaskPolicy : null,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    result: row.result ? JSON.parse(row.result) as TaskResult : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

export class TaskManager extends EventEmitter {
  private stmtInsert: Database.Statement
  private stmtGetById: Database.Statement
  private stmtUpdate: Database.Statement
  private stmtNextQueued: Database.Statement
  private stmtNextQueuedBySource: Database.Statement
  private stmtChildren: Database.Statement

  constructor(private db: Database.Database) {
    super()

    this.stmtInsert = db.prepare(
      `INSERT INTO tasks (id, parent_id, session_id, source, title, description, state, policy, retry_count, max_retries, result, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    this.stmtGetById = db.prepare(`SELECT * FROM tasks WHERE id = ?`)

    this.stmtUpdate = db.prepare(
      `UPDATE tasks SET parent_id=?, session_id=?, source=?, title=?, description=?, state=?, policy=?, retry_count=?, max_retries=?, result=?, updated_at=?, completed_at=?
       WHERE id = ?`
    )

    this.stmtNextQueued = db.prepare(
      `SELECT * FROM tasks WHERE state = 'queued' ORDER BY created_at ASC LIMIT 1`
    )

    this.stmtNextQueuedBySource = db.prepare(
      `SELECT * FROM tasks WHERE state = 'queued' AND source = ? ORDER BY created_at ASC LIMIT 1`
    )

    this.stmtChildren = db.prepare(
      `SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC`
    )
  }

  create(opts: CreateTaskOpts): Task {
    const id = ulid()
    const now = Date.now()
    const maxRetries = opts.policy?.maxRetries ?? TASK_DEFAULT_MAX_RETRIES
    const policyJson = opts.policy ? JSON.stringify(opts.policy) : null

    this.stmtInsert.run(
      id, opts.parentId ?? null, null, opts.source, opts.title,
      opts.description ?? null, 'queued', policyJson, 0, maxRetries,
      null, now, now, null,
    )

    const task = this.get(id)!
    this.emit('task:created', task)
    return task
  }

  get(id: string): Task | undefined {
    const row = this.stmtGetById.get(id) as RawTaskRow | undefined
    return row ? rowToTask(row) : undefined
  }

  list(filter?: TaskFilter): Task[] {
    let sql = 'SELECT * FROM tasks WHERE 1=1'
    const params: unknown[] = []

    if (filter?.state) {
      if (Array.isArray(filter.state)) {
        const placeholders = filter.state.map(() => '?').join(', ')
        sql += ` AND state IN (${placeholders})`
        params.push(...filter.state)
      } else {
        sql += ' AND state = ?'
        params.push(filter.state)
      }
    }
    if (filter?.source) {
      sql += ' AND source = ?'
      params.push(filter.source)
    }
    if (filter?.parentId === null) {
      sql += ' AND parent_id IS NULL'
    } else if (filter?.parentId) {
      sql += ' AND parent_id = ?'
      params.push(filter.parentId)
    }
    if (filter?.sessionId) {
      sql += ' AND session_id = ?'
      params.push(filter.sessionId)
    }

    sql += ' ORDER BY created_at ASC'
    const rows = this.db.prepare(sql).all(...params) as RawTaskRow[]
    return rows.map(rowToTask)
  }

  children(parentId: string): Task[] {
    const rows = this.stmtChildren.all(parentId) as RawTaskRow[]
    return rows.map(rowToTask)
  }

  update(id: string, patch: TaskPatch): Task {
    const task = this.get(id)
    if (!task) throw new Error(`Task not found: ${id}`)

    const now = Date.now()
    const updated: Task = { ...task, updatedAt: now }
    if (patch.description !== undefined) updated.description = patch.description
    if (patch.sessionId !== undefined) updated.sessionId = patch.sessionId
    if (patch.policy !== undefined) updated.policy = patch.policy
    if (patch.result !== undefined) updated.result = patch.result

    this.stmtUpdate.run(
      updated.parentId, updated.sessionId, updated.source, updated.title,
      updated.description, updated.state,
      updated.policy ? JSON.stringify(updated.policy) : null,
      updated.retryCount, updated.maxRetries,
      updated.result ? JSON.stringify(updated.result) : null,
      now, updated.completedAt, id,
    )

    return this.get(id)!
  }

  // ─── State transitions ─────────────────────────────

  private transition(id: string, toState: TaskState, extra?: Partial<Task>): Task {
    const task = this.get(id)
    if (!task) throw new Error(`Task not found: ${id}`)

    const allowed = VALID_TRANSITIONS[task.state] ?? []
    if (!allowed.includes(toState)) {
      throw new Error(`Invalid state transition: ${task.state} -> ${toState}`)
    }

    const now = Date.now()
    const completedAt = toState === 'completed' ? now : task.completedAt

    this.stmtUpdate.run(
      extra?.parentId ?? task.parentId,
      extra?.sessionId ?? task.sessionId,
      task.source, task.title, task.description, toState,
      task.policy ? JSON.stringify(task.policy) : null,
      extra?.retryCount ?? task.retryCount, task.maxRetries,
      extra?.result ? JSON.stringify(extra.result) : (task.result ? JSON.stringify(task.result) : null),
      now, completedAt, id,
    )

    const updated = this.get(id)!
    const previousState = task.state
    this.emit('task:state-changed', updated, previousState)
    if (toState === 'completed') this.emit('task:completed', updated)
    if (toState === 'failed') this.emit('task:failed', updated)
    if (toState === 'stalled') this.emit('task:stalled', updated)

    return updated
  }

  dispatch(taskId: string, sessionId: string): Task {
    return this.transition(taskId, 'dispatched', { sessionId })
  }

  markRunning(taskId: string): Task {
    return this.transition(taskId, 'running')
  }

  markValidating(taskId: string): Task {
    return this.transition(taskId, 'validating')
  }

  markCompleted(taskId: string, result: TaskResult): Task {
    return this.transition(taskId, 'completed', { result })
  }

  markFailed(taskId: string, reason: string): Task {
    const task = this.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    const existingResult = task.result ?? {}
    return this.transition(taskId, 'failed', {
      result: { ...existingResult, error: reason },
    })
  }

  markStalled(taskId: string): Task {
    return this.transition(taskId, 'stalled')
  }

  retry(taskId: string): Task {
    const task = this.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    if (task.state !== 'failed' && task.state !== 'stalled') {
      throw new Error(`Can only retry failed or stalled tasks, got: ${task.state}`)
    }
    const updated = this.transition(taskId, 'queued', {
      retryCount: task.retryCount + 1,
      sessionId: null,
    })
    this.emit('task:retrying', updated)
    return updated
  }

  // ─── Queue ──────────────────────────────────────────

  nextQueued(source?: string): Task | undefined {
    const row = source
      ? this.stmtNextQueuedBySource.get(source) as RawTaskRow | undefined
      : this.stmtNextQueued.get() as RawTaskRow | undefined
    return row ? rowToTask(row) : undefined
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "TaskManager" 2>&1 | tail -30`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/main/task/task-manager.ts test/main/task-manager.test.ts
git commit -m "feat(task): implement TaskManager with state machine and queue"
```

---

### Task 4: TaskHooks — Completion Verification

**Files:**
- Create: `src/main/task/task-hooks.ts`
- Create: `test/main/task-hooks.test.ts`

**Security note:** `exec()` is intentional here — hook commands are admin-configured shell pipelines (e.g. `npm test && npm run lint`) from AppConfig, not user input.

- [ ] **Step 1: Write the failing test**

Create `test/main/task-hooks.test.ts`:

```typescript
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { TaskHooks } from '../../src/main/task/task-hooks'
import type { Task } from '../../src/shared/types'

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: 't1', parentId: null, sessionId: 's1', source: 'test',
    title: 'Test task', description: null, state: 'validating',
    policy: null, retryCount: 0, maxRetries: 2, result: null,
    createdAt: Date.now(), updatedAt: Date.now(), completedAt: null,
    ...overrides,
  }
}

describe('TaskHooks', () => {
  const hooks = new TaskHooks()

  it('should run a successful after_run hook', async () => {
    const task = makeTask({
      policy: { hooks: { afterRun: 'echo "ok"', timeout: 5000 } },
    })
    const result = await hooks.runAfterRun(task, '/tmp')
    assert.equal(result.success, true)
    assert.equal(result.exitCode, 0)
    assert.ok(result.stdout.includes('ok'))
    assert.equal(result.timedOut, false)
  })

  it('should run a failing after_run hook', async () => {
    const task = makeTask({
      policy: { hooks: { afterRun: 'exit 1', timeout: 5000 } },
    })
    const result = await hooks.runAfterRun(task, '/tmp')
    assert.equal(result.success, false)
    assert.equal(result.exitCode, 1)
    assert.equal(result.timedOut, false)
  })

  it('should return success when no hook is configured', async () => {
    const task = makeTask({ policy: null })
    const result = await hooks.runAfterRun(task, '/tmp')
    assert.equal(result.success, true)
    assert.equal(result.exitCode, 0)
  })

  it('should run before_run hook', async () => {
    const task = makeTask({
      policy: { hooks: { beforeRun: 'echo "before"', timeout: 5000 } },
    })
    const result = await hooks.runBeforeRun(task, '/tmp')
    assert.equal(result.success, true)
    assert.ok(result.stdout.includes('before'))
  })

  it('should timeout if hook takes too long', async () => {
    const task = makeTask({
      policy: { hooks: { afterRun: 'sleep 10', timeout: 200 } },
    })
    const result = await hooks.runAfterRun(task, '/tmp')
    assert.equal(result.success, false)
    assert.equal(result.timedOut, true)
  })

  it('should use default hook from config when task has no hook', async () => {
    const hooksWithDefaults = new TaskHooks({
      afterRun: 'echo "default-hook"',
      timeout: 5000,
    })
    const task = makeTask({ policy: null })
    const result = await hooksWithDefaults.runAfterRun(task, '/tmp')
    assert.equal(result.success, true)
    assert.ok(result.stdout.includes('default-hook'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "TaskHooks" 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement task-hooks.ts**

Create `src/main/task/task-hooks.ts`:

```typescript
// NOTE: exec() is used intentionally — hook commands are admin-configured
// shell pipelines (e.g. "npm test && npm run lint") from AppConfig/task policy,
// not user input. This is analogous to git hooks or CI scripts.
import { exec } from 'child_process'
import { TASK_HOOK_TIMEOUT_MS } from '../../shared/constants'
import type { Task } from '../../shared/types'

export interface HookResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface DefaultHooks {
  beforeRun?: string
  afterRun?: string
  timeout?: number
}

export class TaskHooks {
  constructor(private defaultHooks?: DefaultHooks) {}

  async runBeforeRun(task: Task, projectPath: string): Promise<HookResult> {
    const cmd = task.policy?.hooks?.beforeRun ?? this.defaultHooks?.beforeRun
    const timeout = task.policy?.hooks?.timeout ?? this.defaultHooks?.timeout ?? TASK_HOOK_TIMEOUT_MS
    return this.runHook(cmd, projectPath, timeout)
  }

  async runAfterRun(task: Task, projectPath: string): Promise<HookResult> {
    const cmd = task.policy?.hooks?.afterRun ?? this.defaultHooks?.afterRun
    const timeout = task.policy?.hooks?.timeout ?? this.defaultHooks?.timeout ?? TASK_HOOK_TIMEOUT_MS
    return this.runHook(cmd, projectPath, timeout)
  }

  private runHook(cmd: string | undefined, cwd: string, timeout: number): Promise<HookResult> {
    if (!cmd) {
      return Promise.resolve({
        success: true, exitCode: 0, stdout: '', stderr: '', timedOut: false,
      })
    }

    return new Promise((resolve) => {
      const child = exec(cmd, { cwd, timeout }, (error, stdout, stderr) => {
        const timedOut = error?.killed === true
        const exitCode = timedOut ? -1 : (error?.code ?? 0)
        resolve({
          success: !error,
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          timedOut,
        })
      })
      child.unref?.()
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "TaskHooks" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/task/task-hooks.ts test/main/task-hooks.test.ts
git commit -m "feat(task): implement TaskHooks for completion verification"
```

---

### Task 5: TaskWatcher — Stall Detection

**Files:**
- Create: `src/main/task/task-watcher.ts`
- Create: `test/main/task-watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/main/task-watcher.test.ts`:

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { EventEmitter } from 'events'
import Database from 'better-sqlite3'
import { TaskManager } from '../../src/main/task/task-manager'
import { TaskWatcher } from '../../src/main/task/task-watcher'
import { TASK_SCHEMA_SQL } from '../../src/main/task/task-schema'
import type { Task } from '../../src/shared/types'

class MockSessionManager extends EventEmitter {
  private sessions = new Map<string, { id: string; projectPath: string | null }>()
  addSession(id: string, projectPath: string | null = '/tmp'): void {
    this.sessions.set(id, { id, projectPath })
  }
  get(id: string) { return this.sessions.get(id) }
  stop(): Promise<void> { return Promise.resolve() }
}

class MockTmuxManager extends EventEmitter {}

describe('TaskWatcher', () => {
  let db: Database.Database
  let taskManager: TaskManager
  let sessionManager: MockSessionManager
  let tmuxManager: MockTmuxManager
  let watcher: TaskWatcher

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)
    taskManager = new TaskManager(db)
    sessionManager = new MockSessionManager()
    tmuxManager = new MockTmuxManager()
  })

  afterEach(() => {
    watcher?.stop()
    db.close()
  })

  it('should track output timestamps from tmux events', () => {
    watcher = new TaskWatcher({
      taskManager,
      sessionManager: sessionManager as any,
      tmuxManager: tmuxManager as any,
      watchInterval: 60000,
      defaultStallTimeout: 5000,
    })
    watcher.start()
    tmuxManager.emit('output', 'pane-1', 'some output')

    const ts = watcher.getLastOutputTimestamp('pane-1')
    assert.ok(ts)
    assert.ok(Date.now() - ts! < 1000)
  })

  it('should detect stalled tasks based on output silence', () => {
    const stalledEvents: Task[] = []
    taskManager.on('task:stalled', (t: Task) => stalledEvents.push(t))

    watcher = new TaskWatcher({
      taskManager,
      sessionManager: sessionManager as any,
      tmuxManager: tmuxManager as any,
      watchInterval: 100,
      defaultStallTimeout: 50,
    })

    sessionManager.addSession('s1')
    const task = taskManager.create({ title: 'Stall me', source: 'test' })
    taskManager.dispatch(task.id, 's1')
    taskManager.markRunning(task.id)

    watcher.start()
    tmuxManager.emit('output', 's1', 'initial output')

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        assert.ok(stalledEvents.length >= 1, `Expected stall event, got ${stalledEvents.length}`)
        resolve()
      }, 300)
    })
  })

  it('should respect stall_timeout: -1 (never stall)', () => {
    const stalledEvents: Task[] = []
    taskManager.on('task:stalled', (t: Task) => stalledEvents.push(t))

    watcher = new TaskWatcher({
      taskManager,
      sessionManager: sessionManager as any,
      tmuxManager: tmuxManager as any,
      watchInterval: 50,
      defaultStallTimeout: 30,
    })

    sessionManager.addSession('s1')
    const task = taskManager.create({
      title: 'Never stall',
      source: 'test',
      policy: { stallTimeout: -1 },
    })
    taskManager.dispatch(task.id, 's1')
    taskManager.markRunning(task.id)
    watcher.start()

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        assert.equal(stalledEvents.length, 0, 'Should not stall with timeout -1')
        resolve()
      }, 200)
    })
  })

  it('should auto-retry stalled tasks within max_retries', () => {
    const retryEvents: Task[] = []
    taskManager.on('task:retrying', (t: Task) => retryEvents.push(t))

    watcher = new TaskWatcher({
      taskManager,
      sessionManager: sessionManager as any,
      tmuxManager: tmuxManager as any,
      watchInterval: 50,
      defaultStallTimeout: 30,
    })

    sessionManager.addSession('s1')
    const task = taskManager.create({
      title: 'Auto retry',
      source: 'test',
      policy: { maxRetries: 3 },
    })
    taskManager.dispatch(task.id, 's1')
    taskManager.markRunning(task.id)
    watcher.start()

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        assert.ok(retryEvents.length >= 1, 'Should have retried')
        const retried = taskManager.get(task.id)!
        assert.equal(retried.state, 'queued')
        assert.ok(retried.retryCount >= 1)
        resolve()
      }, 200)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "TaskWatcher" 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement task-watcher.ts**

Create `src/main/task/task-watcher.ts`:

```typescript
import type { EventEmitter } from 'events'
import type { TaskManager } from './task-manager'
import type { Task } from '../../shared/types'
import { TASK_STALL_TIMEOUT_MS, TASK_WATCH_INTERVAL_MS } from '../../shared/constants'

export interface TaskWatcherOpts {
  taskManager: TaskManager
  sessionManager: EventEmitter & { stop(id: string): Promise<void> }
  tmuxManager: EventEmitter
  watchInterval?: number
  defaultStallTimeout?: number
}

export class TaskWatcher {
  private taskManager: TaskManager
  private sessionManager: EventEmitter & { stop(id: string): Promise<void> }
  private tmuxManager: EventEmitter
  private watchInterval: number
  private defaultStallTimeout: number
  private timer: ReturnType<typeof setInterval> | null = null
  private lastOutputTimestamps = new Map<string, number>()
  private outputHandler: ((paneId: string, data: string) => void) | null = null

  constructor(opts: TaskWatcherOpts) {
    this.taskManager = opts.taskManager
    this.sessionManager = opts.sessionManager
    this.tmuxManager = opts.tmuxManager
    this.watchInterval = opts.watchInterval ?? TASK_WATCH_INTERVAL_MS
    this.defaultStallTimeout = opts.defaultStallTimeout ?? TASK_STALL_TIMEOUT_MS
  }

  start(): void {
    this.outputHandler = (paneId: string) => {
      this.lastOutputTimestamps.set(paneId, Date.now())
    }
    this.tmuxManager.on('output', this.outputHandler)

    this.timer = setInterval(() => this.check(), this.watchInterval)
    if (this.timer.unref) this.timer.unref()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.outputHandler) {
      this.tmuxManager.removeListener('output', this.outputHandler)
      this.outputHandler = null
    }
  }

  getLastOutputTimestamp(sessionId: string): number | undefined {
    return this.lastOutputTimestamps.get(sessionId)
  }

  private check(): void {
    const activeTasks = this.taskManager.list({
      state: ['running', 'dispatched'],
    })

    const now = Date.now()
    for (const task of activeTasks) {
      if (!task.sessionId) continue

      const stallTimeout = task.policy?.stallTimeout ?? this.defaultStallTimeout
      if (stallTimeout === -1) continue

      const lastOutput = this.lastOutputTimestamps.get(task.sessionId)
      const lastActivity = lastOutput ?? task.updatedAt

      if (now - lastActivity > stallTimeout) {
        this.handleStall(task)
      }
    }
  }

  private handleStall(task: Task): void {
    const effectiveMaxRetries = task.policy?.maxRetries ?? task.maxRetries

    try {
      this.taskManager.markStalled(task.id)
    } catch {
      return // already transitioned
    }

    if (task.retryCount < effectiveMaxRetries) {
      if (task.sessionId) {
        this.sessionManager.stop(task.sessionId).catch(() => {})
      }
      this.taskManager.retry(task.id)
    } else {
      this.taskManager.markFailed(task.id, 'max retries exceeded after stall')
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "TaskWatcher" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/task/task-watcher.ts test/main/task-watcher.test.ts
git commit -m "feat(task): implement TaskWatcher with dual-level stall detection"
```

---

### Task 6: TaskSource Interface + BugreportTaskSource

**Files:**
- Create: `src/main/task/task-source.ts`
- Create: `src/main/task/sources/bugreport-source.ts`
- Create: `test/main/bugreport-source.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/main/bugreport-source.test.ts`:

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BugreportTaskSource } from '../../src/main/task/sources/bugreport-source'
import type { CreateTaskOpts } from '../../src/shared/types'

describe('BugreportTaskSource', () => {
  let tmpDir: string
  let source: BugreportTaskSource

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugreport-source-'))
  })

  afterEach(() => {
    source?.stop()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should detect a new .md file and emit a task', async () => {
    const created: CreateTaskOpts[] = []
    source = new BugreportTaskSource(tmpDir)
    source.start((opts) => created.push(opts))

    const bugFile = path.join(tmpDir, 'BUG-2026-04-21-abc.md')
    fs.writeFileSync(bugFile, '# Bug\n\nSomething is broken\n')

    await new Promise((r) => setTimeout(r, 300))
    assert.equal(created.length, 1)
    assert.equal(created[0].source, 'bugreport')
    assert.ok(created[0].title.includes('BUG-2026-04-21-abc'))
    assert.ok(created[0].description?.includes('Something is broken'))
  })

  it('should ignore non-.md files', async () => {
    const created: CreateTaskOpts[] = []
    source = new BugreportTaskSource(tmpDir)
    source.start((opts) => created.push(opts))

    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'not a bug')
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(created.length, 0)
  })

  it('should deduplicate — same file triggers only once', async () => {
    const created: CreateTaskOpts[] = []
    source = new BugreportTaskSource(tmpDir)
    source.start((opts) => created.push(opts))

    const bugFile = path.join(tmpDir, 'BUG-001.md')
    fs.writeFileSync(bugFile, '# Bug 1')
    await new Promise((r) => setTimeout(r, 300))

    fs.writeFileSync(bugFile, '# Bug 1 updated')
    await new Promise((r) => setTimeout(r, 300))

    assert.equal(created.length, 1, 'Should not re-emit for same file')
  })

  it('should pick up existing files on start', () => {
    fs.writeFileSync(path.join(tmpDir, 'BUG-existing.md'), '# Existing bug')

    const created: CreateTaskOpts[] = []
    source = new BugreportTaskSource(tmpDir)
    source.start((opts) => created.push(opts))

    assert.equal(created.length, 1)
    assert.ok(created[0].title.includes('BUG-existing'))
  })

  it('should have name "bugreport"', () => {
    source = new BugreportTaskSource(tmpDir)
    assert.equal(source.name, 'bugreport')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "BugreportTaskSource" 2>&1 | tail -20`
Expected: FAIL — modules not found

- [ ] **Step 3: Create task-source.ts interface**

Create `src/main/task/task-source.ts`:

```typescript
import type { CreateTaskOpts } from '../../shared/types'

export type TaskEmitter = (opts: CreateTaskOpts) => void

export interface TaskSource {
  readonly name: string
  start(emit: TaskEmitter): void
  stop(): void
}
```

- [ ] **Step 4: Implement bugreport-source.ts**

Create `src/main/task/sources/bugreport-source.ts`:

```typescript
import * as fs from 'fs'
import * as path from 'path'
import type { TaskSource, TaskEmitter } from '../task-source'
import type { CreateTaskOpts } from '../../../shared/types'

export class BugreportTaskSource implements TaskSource {
  readonly name = 'bugreport'
  private watcher: fs.FSWatcher | null = null
  private seenFiles = new Set<string>()

  constructor(private watchPath: string) {}

  start(emit: TaskEmitter): void {
    if (!fs.existsSync(this.watchPath)) {
      fs.mkdirSync(this.watchPath, { recursive: true })
    }

    this.scanExisting(emit)

    this.watcher = fs.watch(this.watchPath, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return
      if (this.seenFiles.has(filename)) return

      const filePath = path.join(this.watchPath, filename)
      setTimeout(() => this.ingestFile(filePath, filename, emit), 100)
    })
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  private scanExisting(emit: TaskEmitter): void {
    let entries: string[]
    try { entries = fs.readdirSync(this.watchPath) } catch { return }

    for (const filename of entries) {
      if (!filename.endsWith('.md')) continue
      if (this.seenFiles.has(filename)) continue
      this.ingestFile(path.join(this.watchPath, filename), filename, emit)
    }
  }

  private ingestFile(filePath: string, filename: string, emit: TaskEmitter): void {
    if (this.seenFiles.has(filename)) return
    this.seenFiles.add(filename)

    let content: string
    try { content = fs.readFileSync(filePath, 'utf-8') } catch { return }

    const bugId = filename.replace(/\.md$/, '')
    const opts: CreateTaskOpts = {
      title: `Fix ${bugId}`,
      description: content,
      source: 'bugreport',
      policy: { maxRetries: 2, hooks: { afterRun: 'npm test' } },
    }
    emit(opts)
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "BugreportTaskSource" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/task/task-source.ts src/main/task/sources/bugreport-source.ts test/main/bugreport-source.test.ts
git commit -m "feat(task): add TaskSource interface and BugreportTaskSource"
```

---

### Task 7: MCP Tools Registration

**Files:**
- Modify: `src/main/mcp/mcp-tools.ts`
- Create: `test/main/mcp-task-tools.test.ts`

- [ ] **Step 1: Write contract test**

Create `test/main/mcp-task-tools.test.ts`:

```typescript
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { TaskManager } from '../../src/main/task/task-manager'
import { TASK_SCHEMA_SQL } from '../../src/main/task/task-schema'

describe('MCP task tool contract', () => {
  it('mux_task_create: creates a task with defaults', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)
    const tm = new TaskManager(db)
    const task = tm.create({ title: 'Build feature', source: 'orchestrator', description: 'Build the login page' })
    assert.equal(task.title, 'Build feature')
    assert.equal(task.state, 'queued')
    db.close()
  })

  it('mux_task_update: validates state transitions', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)
    const tm = new TaskManager(db)
    const task = tm.create({ title: 'T', source: 'test' })
    tm.dispatch(task.id, 's1')
    tm.markRunning(task.id)
    assert.throws(() => tm.dispatch(task.id, 's2'))
    db.close()
  })

  it('mux_task_list: filters by source', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)
    const tm = new TaskManager(db)
    tm.create({ title: 'Bug 1', source: 'bugreport' })
    tm.create({ title: 'Bug 2', source: 'bugreport' })
    tm.create({ title: 'Task 1', source: 'orchestrator' })
    assert.equal(tm.list({ source: 'bugreport' }).length, 2)
    db.close()
  })

  it('mux_task_get: returns task with children', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)
    const tm = new TaskManager(db)
    const parent = tm.create({ title: 'Project', source: 'orchestrator' })
    tm.create({ title: 'Sub 1', source: 'orchestrator', parentId: parent.id })
    tm.create({ title: 'Sub 2', source: 'orchestrator', parentId: parent.id })
    assert.equal(tm.children(parent.id).length, 2)
    db.close()
  })
})
```

- [ ] **Step 2: Run contract tests**

Run: `npm test -- --test-name-pattern "MCP task tool" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 3: Add TaskManager to ToolContext and register 4 new tools**

In `src/main/mcp/mcp-tools.ts`:

Add import:
```typescript
import type { TaskManager } from '../task/task-manager'
```

Add to `ToolContext` interface:
```typescript
  taskManager: TaskManager | null
```

Add 4 tool registrations at the end of `registerTools()`:

```typescript
  // 10. mux_task_create
  ;(server.registerTool as any)(
    'mux_task_create',
    {
      description: 'Create a task in the cipher-mux task queue',
      inputSchema: {
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description (markdown)'),
        source: z.string().optional().describe('Task source (default: orchestrator)'),
        parent_id: z.string().optional().describe('Parent task ID for hierarchical tasks'),
        policy: z.object({
          stall_timeout: z.number().optional(),
          max_retries: z.number().optional(),
          hooks: z.object({
            before_run: z.string().optional(),
            after_run: z.string().optional(),
            timeout: z.number().optional(),
          }).optional(),
        }).optional().describe('Task policy'),
      },
    },
    async (args: {
      title: string; description?: string; source?: string; parent_id?: string
      policy?: { stall_timeout?: number; max_retries?: number; hooks?: { before_run?: string; after_run?: string; timeout?: number } }
    }) => {
      if (!ctx.taskManager) {
        return { content: [{ type: 'text' as const, text: 'TaskManager not available' }], isError: true }
      }
      const task = ctx.taskManager.create({
        title: args.title, description: args.description,
        source: args.source ?? 'orchestrator', parentId: args.parent_id,
        policy: args.policy ? {
          stallTimeout: args.policy.stall_timeout, maxRetries: args.policy.max_retries,
          hooks: args.policy.hooks ? {
            beforeRun: args.policy.hooks.before_run, afterRun: args.policy.hooks.after_run,
            timeout: args.policy.hooks.timeout,
          } : undefined,
        } : undefined,
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, task }) }] }
    }
  )

  // 11. mux_task_update
  ;(server.registerTool as any)(
    'mux_task_update',
    {
      description: 'Update a task state or report progress',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
        state: z.string().optional().describe('New state (running, done, failed, dispatched)'),
        session_id: z.string().optional().describe('Session ID to assign'),
        result: z.object({
          summary: z.string().optional(), branch: z.string().optional(),
          exit_code: z.number().optional(), error: z.string().optional(),
        }).optional().describe('Task result'),
      },
    },
    async (args: { task_id: string; state?: string; session_id?: string; result?: { summary?: string; branch?: string; exit_code?: number; error?: string } }) => {
      if (!ctx.taskManager) {
        return { content: [{ type: 'text' as const, text: 'TaskManager not available' }], isError: true }
      }
      try {
        let task = ctx.taskManager.get(args.task_id)
        if (!task) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Task not found' }) }], isError: true }
        }
        if (args.session_id && !args.state) {
          ctx.taskManager.update(args.task_id, { sessionId: args.session_id })
        }
        if (args.state === 'dispatched' && args.session_id) {
          task = ctx.taskManager.dispatch(args.task_id, args.session_id)
        } else if (args.state === 'running') {
          task = ctx.taskManager.markRunning(args.task_id)
        } else if (args.state === 'done') {
          task = ctx.taskManager.markValidating(args.task_id)
        } else if (args.state === 'failed') {
          task = ctx.taskManager.markFailed(args.task_id, args.result?.error ?? 'unknown')
        } else if (args.result) {
          task = ctx.taskManager.update(args.task_id, {
            result: { summary: args.result.summary, branch: args.result.branch, exitCode: args.result.exit_code, error: args.result.error },
          })
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, task }) }] }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: msg }) }], isError: true }
      }
    }
  )

  // 12. mux_task_list
  ;(server.registerTool as any)(
    'mux_task_list',
    {
      description: 'List tasks from the cipher-mux task queue',
      inputSchema: {
        state: z.string().optional().describe('Filter by state'),
        source: z.string().optional().describe('Filter by source'),
        parent_id: z.string().optional().describe('Filter by parent task ID'),
        session_id: z.string().optional().describe('Filter by session ID'),
      },
    },
    async (args: { state?: string; source?: string; parent_id?: string; session_id?: string }) => {
      if (!ctx.taskManager) {
        return { content: [{ type: 'text' as const, text: 'TaskManager not available' }], isError: true }
      }
      const tasks = ctx.taskManager.list({
        state: args.state as any, source: args.source,
        parentId: args.parent_id, sessionId: args.session_id,
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tasks, total: tasks.length }) }] }
    }
  )

  // 13. mux_task_get
  ;(server.registerTool as any)(
    'mux_task_get',
    {
      description: 'Get a task by ID with its children',
      inputSchema: { task_id: z.string().describe('Task ID') },
    },
    async (args: { task_id: string }) => {
      if (!ctx.taskManager) {
        return { content: [{ type: 'text' as const, text: 'TaskManager not available' }], isError: true }
      }
      const task = ctx.taskManager.get(args.task_id)
      if (!task) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Task not found' }) }], isError: true }
      }
      const children = ctx.taskManager.children(args.task_id)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ task, children }) }] }
    }
  )
```

- [ ] **Step 4: Run all tests**

Run: `npm test 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/mcp-tools.ts test/main/mcp-task-tools.test.ts
git commit -m "feat(task): register mux_task_create/update/list/get MCP tools"
```

---

### Task 8: IPC Channels, Preload Bridge, and AppConfig

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/types.ts` (AppConfig)
- Modify: `src/main/preload.ts`

- [ ] **Step 1: Add IPC channel constants**

Add to `src/shared/ipc-channels.ts` before the closing `} as const`:

```typescript
  // Tasks
  TASKS_LIST: 'cipher-mux:tasks:list',
  TASKS_GET: 'cipher-mux:tasks:get',
  TASKS_RETRY: 'cipher-mux:tasks:retry',
  TASKS_CANCEL: 'cipher-mux:tasks:cancel',
  TASK_CREATED: 'cipher-mux:task:created',
  TASK_STATE_CHANGED: 'cipher-mux:task:state-changed',
```

- [ ] **Step 2: Extend AppConfig orchestrator section**

In `src/shared/types.ts`, replace the `orchestrator` block in `AppConfig`:

```typescript
  orchestrator: {
    dir: string
    maxRetries: number
    stallTimeout: number
    watchInterval: number
    defaultHooks: {
      beforeRun?: string
      afterRun?: string
      timeout?: number
    }
    taskSources: {
      bugreport: {
        enabled: boolean
        path: string
      }
    }
  }
```

- [ ] **Step 3: Add tasks API to preload.ts**

Add before the closing of the `api` object in `src/main/preload.ts`:

```typescript
  // ─── Tasks ──────────────────────────────────────────────
  tasks: {
    list: (filter?: unknown) => ipcRenderer.invoke(IPC.TASKS_LIST, filter),
    get: (id: string) => ipcRenderer.invoke(IPC.TASKS_GET, { id }),
    retry: (id: string) => ipcRenderer.invoke(IPC.TASKS_RETRY, { id }),
    cancel: (id: string) => ipcRenderer.invoke(IPC.TASKS_CANCEL, { id }),
    onCreated: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.TASK_CREATED, handler)
      return () => ipcRenderer.removeListener(IPC.TASK_CREATED, handler)
    },
    onStateChanged: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.TASK_STATE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC.TASK_STATE_CHANGED, handler)
    },
  },
```

- [ ] **Step 4: Run existing tests to verify no breakage**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts src/main/preload.ts
git commit -m "feat(task): add IPC channels, preload bridge, and AppConfig extension"
```

---

### Task 9: IpcHub Wiring

**Files:**
- Modify: `src/main/ipc-hub.ts`
- Modify: `src/main/message-bus/message-bus.ts` (add `getDatabase()` getter)

- [ ] **Step 1: Add getDatabase() to MessageBus**

In `src/main/message-bus/message-bus.ts`, add:

```typescript
  /** Expose the underlying database for shared table access (tasks) */
  getDatabase(): Database.Database {
    return this.db
  }
```

- [ ] **Step 2: Add imports and fields to IpcHub**

In `src/main/ipc-hub.ts`, add imports:

```typescript
import { TaskManager } from './task/task-manager'
import { TaskWatcher } from './task/task-watcher'
import { TaskHooks } from './task/task-hooks'
import { BugreportTaskSource } from './task/sources/bugreport-source'
import { TASK_SCHEMA_SQL } from './task/task-schema'
```

Add fields:

```typescript
  private taskManager: TaskManager | null = null
  private taskWatcher: TaskWatcher | null = null
  private taskHooks: TaskHooks | null = null
  private bugreportSource: BugreportTaskSource | null = null
```

- [ ] **Step 3: Initialize TaskManager in constructor**

After the messageBus try/catch, add:

```typescript
    try {
      if (this.messageBus) {
        this.messageBus.getDatabase().exec(TASK_SCHEMA_SQL)
        this.taskManager = new TaskManager(this.messageBus.getDatabase())
      }
    } catch (err) {
      console.error('[IpcHub] TaskManager init failed:', err)
    }
```

- [ ] **Step 4: Start TaskWatcher and sources in init()**

After `this.statusLineMonitor.start()`, add:

```typescript
    // Start Task infrastructure
    if (this.taskManager) {
      const orchConfig = configStore.get('orchestrator')

      this.taskHooks = new TaskHooks(orchConfig?.defaultHooks ? {
        beforeRun: orchConfig.defaultHooks.beforeRun,
        afterRun: orchConfig.defaultHooks.afterRun,
        timeout: orchConfig.defaultHooks.timeout,
      } : undefined)

      this.taskWatcher = new TaskWatcher({
        taskManager: this.taskManager,
        sessionManager: this.sessionManager as any,
        tmuxManager: this.tmux as any,
        watchInterval: orchConfig?.watchInterval,
        defaultStallTimeout: orchConfig?.stallTimeout,
      })
      this.taskWatcher.start()

      const sourceConfig = orchConfig?.taskSources?.bugreport
      if (sourceConfig?.enabled !== false) {
        const outboxPath = sourceConfig?.path
          ?? path.join(app.getPath('home'), '.config', 'cipher-mux', 'bugreports', 'outbox')
        this.bugreportSource = new BugreportTaskSource(outboxPath)
        this.bugreportSource.start((opts) => this.taskManager!.create(opts))
      }
    }
```

- [ ] **Step 5: Add registerTaskChannels()**

Add method and call it from `init()`:

```typescript
  private registerTaskChannels(): void {
    if (!this.taskManager) return

    ipcMain.handle(IPC.TASKS_LIST, async (_e, filter?: any) => {
      return this.taskManager!.list(filter)
    })

    ipcMain.handle(IPC.TASKS_GET, async (_e, { id }: { id: string }) => {
      const task = this.taskManager!.get(id)
      if (!task) return { task: null, children: [] }
      const children = this.taskManager!.children(id)
      return { task, children }
    })

    ipcMain.handle(IPC.TASKS_RETRY, async (_e, { id }: { id: string }) => {
      return this.taskManager!.retry(id)
    })

    ipcMain.handle(IPC.TASKS_CANCEL, async (_e, { id }: { id: string }) => {
      return this.taskManager!.markFailed(id, 'cancelled by user')
    })
  }
```

In `init()`, add `this.registerTaskChannels()` after `this.registerVoiceChannels()`.

- [ ] **Step 6: Forward task events and wire completion hooks**

Add to `setupEventForwarding()`:

```typescript
    // Task events -> renderer
    if (this.taskManager) {
      this.taskManager.on('task:created', (task) => {
        this.windowManager.sendToMainWindow(IPC.TASK_CREATED, task)
      })
      this.taskManager.on('task:state-changed', (task, previousState) => {
        this.windowManager.sendToMainWindow(IPC.TASK_STATE_CHANGED, { task, previousState })
      })
    }

    // Completion verification hooks
    if (this.taskManager && this.taskHooks) {
      this.taskManager.on('task:state-changed', async (task, _previousState) => {
        if (task.state === 'validating' && this.taskHooks) {
          const session = task.sessionId ? this.sessionManager.get(task.sessionId) : null
          const projectPath = session?.projectPath ?? '/tmp'
          const result = await this.taskHooks.runAfterRun(task, projectPath)
          if (result.success) {
            this.taskManager!.markCompleted(task.id, {
              summary: result.stdout.slice(0, 500), exitCode: result.exitCode,
            })
          } else {
            this.taskManager!.markFailed(task.id,
              result.timedOut ? 'hook timed out' : `hook failed: ${result.stderr.slice(0, 500)}`
            )
          }
        }
      })
    }
```

- [ ] **Step 7: Pass taskManager to MCP server**

Update `this.mcpServer.start()` call:

```typescript
    this.mcpServer.start(port, host, apiKey, {
      sessionManager: this.sessionManager,
      messageBus: this.messageBus,
      statusLineMonitor: this.statusLineMonitor,
      kickoffOrchestrator: this.kickoffOrchestrator,
      taskManager: this.taskManager,
    })
```

- [ ] **Step 8: Cleanup in destroy()**

Add to `destroy()`:

```typescript
    this.bugreportSource?.stop()
    this.taskWatcher?.stop()
```

- [ ] **Step 9: Run all tests**

Run: `npm test 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add src/main/ipc-hub.ts src/main/message-bus/message-bus.ts
git commit -m "feat(task): wire TaskManager, TaskWatcher, and BugreportSource into IpcHub"
```

---

### Task 10: Orchestrator Template Update

**Files:**
- Modify: `src/main/session/orchestrator-template.ts`
- Modify: `test/main/orchestrator-template.test.ts`

- [ ] **Step 1: Add test for task management section**

Add to `test/main/orchestrator-template.test.ts`:

```typescript
  it('should include task management tools in the template', () => {
    const md = generateOrchestratorClaudeMd({
      mcpHost: '127.0.0.1', mcpPort: 3100, mcpApiKey: 'key', maxRetries: 2,
    })
    assert.ok(md.includes('mux_task_create'))
    assert.ok(md.includes('mux_task_update'))
    assert.ok(md.includes('mux_task_list'))
    assert.ok(md.includes('mux_task_get'))
    assert.ok(md.includes('Task Management'))
    assert.ok(md.includes('Stall Detection'))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "orchestrator" 2>&1 | tail -20`
Expected: FAIL — new assertion fails

- [ ] **Step 3: Add task management section to template**

In `src/main/session/orchestrator-template.ts`, add before the closing backtick of the template string:

```
## Task Management

Du hast eine persistente Task-Queue. Nutze sie statt dir Tasks im Context zu merken.

### Verfuegbare Task-Tools

- **mux_task_create** — Task in Queue legen (title, description, source, parent_id, policy)
- **mux_task_update** — Status melden (state: running/done/failed, result, session_id)
- **mux_task_list** — Tasks filtern (state, source, parent_id, session_id)
- **mux_task_get** — Task-Details mit Sub-Tasks abrufen

### Bugreport-Queue (automatisch)

Neue Dateien in der Bugreport-Outbox werden automatisch als Tasks erstellt.
Pruefe \`mux_task_list(source: 'bugreport', state: 'queued')\` fuer offene Bugs.

### Delegation mit Tasks

1. \`mux_task_create(title, description)\` — Task anlegen
2. \`mux_create_session(name, projectPath)\` — Worker spawnen
3. \`mux_task_update(task_id, state: 'dispatched', session_id)\` — Task zuweisen
4. Worker arbeitet, meldet Progress via \`mux_task_update\`
5. Nach Worker-Done: Hooks verifizieren automatisch (Tests, Build)
6. Stall Detection greift automatisch — du musst nicht manuell pollen

### Multi-Projekt

Fuer grosse Projekte: Erstelle Parent-Task, dann Child-Tasks pro Launcher-Session.
\`mux_task_get(parent_id)\` zeigt dir den Gesamtfortschritt.

### Stall Detection

Sessions werden automatisch ueberwacht. Wenn ein Worker >5 Minuten keinen Output produziert,
wird er als "stalled" markiert und automatisch retried (bis max_retries erreicht).
Du musst NICHT manuell pollen. Bei Eskalation (max retries ueberschritten) wirst du benachrichtigt.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "orchestrator" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/session/orchestrator-template.ts test/main/orchestrator-template.test.ts
git commit -m "feat(task): update orchestrator template with task management tools"
```

---

### Task 11: Config Store Defaults

**Files:**
- Modify: `src/main/config/config-store.ts`

- [ ] **Step 1: Read config-store.ts**

Read the file to understand the current default structure.

- [ ] **Step 2: Update orchestrator defaults**

Add the new fields to the orchestrator config defaults:

```typescript
orchestrator: {
  dir: ORCHESTRATOR_DIR,
  maxRetries: ORCHESTRATOR_MAX_RETRIES,
  stallTimeout: 300000,
  watchInterval: 30000,
  defaultHooks: {},
  taskSources: {
    bugreport: {
      enabled: true,
      path: '~/.config/cipher-mux/bugreports/outbox',
    },
  },
}
```

Import the new constants if using them instead of literals.

- [ ] **Step 3: Run all tests**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/main/config/config-store.ts
git commit -m "feat(task): add task infrastructure config defaults"
```

---

### Task 12: Full Integration Test

**Files:**
- Create: `test/main/task-integration.test.ts`

- [ ] **Step 1: Write integration test**

Create `test/main/task-integration.test.ts`:

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import Database from 'better-sqlite3'
import { TaskManager } from '../../src/main/task/task-manager'
import { TaskHooks } from '../../src/main/task/task-hooks'
import { BugreportTaskSource } from '../../src/main/task/sources/bugreport-source'
import { TASK_SCHEMA_SQL } from '../../src/main/task/task-schema'
import type { Task } from '../../src/shared/types'

describe('Task infrastructure integration', () => {
  let db: Database.Database
  let taskManager: TaskManager
  let tmpDir: string

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)
    taskManager = new TaskManager(db)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-integ-'))
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('full lifecycle: bugreport source -> queue -> dispatch -> validate -> complete', async () => {
    const events: string[] = []
    taskManager.on('task:created', () => events.push('created'))
    taskManager.on('task:state-changed', (t: Task) => events.push(`->${t.state}`))
    taskManager.on('task:completed', () => events.push('completed'))

    // 1. BugreportSource creates task
    const source = new BugreportTaskSource(tmpDir)
    source.start((opts) => taskManager.create(opts))
    fs.writeFileSync(path.join(tmpDir, 'BUG-TEST.md'), '# Test Bug\nIt is broken')
    await new Promise((r) => setTimeout(r, 300))
    source.stop()

    assert.ok(events.includes('created'))

    // 2. Pick from queue
    const task = taskManager.nextQueued('bugreport')!
    assert.ok(task)
    assert.ok(task.title.includes('BUG-TEST'))

    // 3. Full flow
    taskManager.dispatch(task.id, 'session-1')
    taskManager.markRunning(task.id)
    taskManager.markValidating(task.id)

    // 4. Hook verifies
    const hooks = new TaskHooks()
    const result = await hooks.runAfterRun(
      { ...taskManager.get(task.id)!, policy: { hooks: { afterRun: 'echo ok' } } },
      tmpDir
    )
    assert.equal(result.success, true)

    taskManager.markCompleted(task.id, { summary: 'Fixed', exitCode: 0 })
    assert.ok(events.includes('completed'))
    assert.equal(taskManager.get(task.id)!.state, 'completed')
  })

  it('hierarchical tasks: parent with children', () => {
    const parent = taskManager.create({ title: 'Implement Project X', source: 'orchestrator' })
    const child1 = taskManager.create({ title: 'Frontend', source: 'orchestrator', parentId: parent.id })
    const child2 = taskManager.create({ title: 'Backend', source: 'orchestrator', parentId: parent.id })

    assert.equal(taskManager.children(parent.id).length, 2)

    taskManager.dispatch(child1.id, 'launcher-1')
    taskManager.dispatch(child2.id, 'launcher-2')
    taskManager.markRunning(child1.id)
    taskManager.markRunning(child2.id)
    taskManager.markValidating(child1.id)
    taskManager.markCompleted(child1.id, { summary: 'Done' })

    const states = taskManager.children(parent.id).map((c) => c.state)
    assert.ok(states.includes('completed'))
    assert.ok(states.includes('running'))
  })

  it('retry flow: failed -> queued -> dispatch -> completed', () => {
    const task = taskManager.create({ title: 'Flaky', source: 'test' })
    taskManager.dispatch(task.id, 's1')
    taskManager.markRunning(task.id)
    taskManager.markFailed(task.id, 'flaky test')

    const retried = taskManager.retry(task.id)
    assert.equal(retried.state, 'queued')
    assert.equal(retried.retryCount, 1)

    taskManager.dispatch(task.id, 's2')
    taskManager.markRunning(task.id)
    taskManager.markValidating(task.id)
    taskManager.markCompleted(task.id, { summary: 'Fixed on retry' })

    assert.equal(taskManager.get(task.id)!.state, 'completed')
    assert.equal(taskManager.get(task.id)!.retryCount, 1)
  })
})
```

- [ ] **Step 2: Run integration test**

Run: `npm test -- --test-name-pattern "Task infrastructure integration" 2>&1 | tail -30`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npm test 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add test/main/task-integration.test.ts
git commit -m "test(task): add full integration tests for task infrastructure"
```

---

### Task 13: Build and Lint Verification

- [ ] **Step 1: Run lint**

Run: `npm run lint 2>&1 | tail -30`
Expected: No new errors

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -30`
Expected: Clean TypeScript build

- [ ] **Step 3: Fix any issues and commit**

Only if needed:
```bash
git add -A
git commit -m "fix(task): resolve lint and build issues"
```
