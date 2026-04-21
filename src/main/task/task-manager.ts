import { EventEmitter } from 'events'
import Database from 'better-sqlite3'
import { ulid } from 'ulidx'
import { TASK_SCHEMA_SQL } from './task-schema'
import { TASK_DEFAULT_MAX_RETRIES } from '../../shared/constants'
import type {
  Task,
  TaskState,
  CreateTaskOpts,
  TaskPatch,
  TaskFilter,
} from '../../shared/types'

// ─── Valid State Transitions ────────────────────────────────

const VALID_TRANSITIONS: Partial<Record<TaskState, TaskState[]>> = {
  queued:      ['dispatched'],
  dispatched:  ['running'],
  running:     ['validating', 'completed', 'stalled', 'failed'],
  validating:  ['completed', 'failed'],
  stalled:     ['queued', 'failed'],
  failed:      ['queued'],
}

// ─── Internal DB row type ───────────────────────────────────

interface TaskRow {
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

// ─── TaskManager ────────────────────────────────────────────

export class TaskManager extends EventEmitter {
  private db: Database.Database

  private stmtInsert: Database.Statement
  private stmtGetById: Database.Statement
  private stmtUpdatePatch: Database.Statement
  private stmtNextQueued: Database.Statement
  private stmtNextQueuedBySource: Database.Statement

  constructor(db: Database.Database) {
    super()
    this.db = db
    this.db.pragma('journal_mode = WAL')
    this.db.exec(TASK_SCHEMA_SQL)

    this.stmtInsert = this.db.prepare(
      `INSERT INTO tasks
         (id, parent_id, session_id, source, title, description, state,
          policy, retry_count, max_retries, result, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    this.stmtGetById = this.db.prepare(
      `SELECT * FROM tasks WHERE id = ?`
    )

    this.stmtUpdatePatch = this.db.prepare(
      `UPDATE tasks
       SET state        = COALESCE(@state,       state),
           session_id   = COALESCE(@session_id,  session_id),
           description  = COALESCE(@description, description),
           policy       = COALESCE(@policy,      policy),
           result       = COALESCE(@result,      result),
           retry_count  = COALESCE(@retry_count, retry_count),
           completed_at = COALESCE(@completed_at, completed_at),
           updated_at   = @updated_at
       WHERE id = @id`
    )

    this.stmtNextQueued = this.db.prepare(
      `SELECT * FROM tasks WHERE state = 'queued' ORDER BY created_at ASC LIMIT 1`
    )

    this.stmtNextQueuedBySource = this.db.prepare(
      `SELECT * FROM tasks WHERE state = 'queued' AND source = ? ORDER BY created_at ASC LIMIT 1`
    )
  }

  // ─── CRUD ──────────────────────────────────────────────────

  /** Create a new task in queued state */
  create(opts: CreateTaskOpts): Task {
    const now = Date.now()
    const id = ulid()
    const maxRetries = opts.policy?.maxRetries ?? TASK_DEFAULT_MAX_RETRIES

    this.stmtInsert.run(
      id,
      opts.parentId ?? null,
      null,
      opts.source,
      opts.title,
      opts.description ?? null,
      'queued',
      opts.policy ? JSON.stringify(opts.policy) : null,
      0,
      maxRetries,
      null,
      now,
      now,
      null
    )

    const task = this.get(id)!
    this.emit('task:created', task)
    return task
  }

  /** Get a task by ID, returns undefined if not found */
  get(id: string): Task | undefined {
    const row = this.stmtGetById.get(id) as TaskRow | undefined
    if (!row) return undefined
    return rowToTask(row)
  }

  /** List tasks with optional filters */
  list(filter?: TaskFilter): Task[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filter?.state !== undefined) {
      if (Array.isArray(filter.state)) {
        const placeholders = filter.state.map(() => '?').join(', ')
        conditions.push(`state IN (${placeholders})`)
        params.push(...filter.state)
      } else {
        conditions.push('state = ?')
        params.push(filter.state)
      }
    }

    if (filter?.source !== undefined) {
      conditions.push('source = ?')
      params.push(filter.source)
    }

    if (filter !== undefined && 'parentId' in filter) {
      if (filter.parentId === null) {
        conditions.push('parent_id IS NULL')
      } else {
        conditions.push('parent_id = ?')
        params.push(filter.parentId)
      }
    }

    if (filter?.sessionId !== undefined) {
      conditions.push('session_id = ?')
      params.push(filter.sessionId)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sql = `SELECT * FROM tasks ${where} ORDER BY created_at ASC`
    const rows = this.db.prepare(sql).all(...params) as TaskRow[]
    return rows.map(rowToTask)
  }

  /** Get all direct children of a parent task */
  children(parentId: string): Task[] {
    return this.list({ parentId })
  }

  /**
   * Apply a partial patch to a task.
   * Returns updated task or undefined if not found.
   */
  update(id: string, patch: TaskPatch): Task | undefined {
    const existing = this.get(id)
    if (!existing) return undefined

    const now = Date.now()

    this.stmtUpdatePatch.run({
      id,
      state: patch.state ?? null,
      session_id: patch.sessionId ?? null,
      description: patch.description ?? null,
      policy: patch.policy ? JSON.stringify(patch.policy) : null,
      result: patch.result ? JSON.stringify(patch.result) : null,
      retry_count: null,
      completed_at: null,
      updated_at: now,
    })

    return this.get(id)!
  }

  // ─── Queue ─────────────────────────────────────────────────

  /** Get the next queued task, optionally filtered by source */
  nextQueued(source?: string): Task | undefined {
    const row = source
      ? (this.stmtNextQueuedBySource.get(source) as TaskRow | undefined)
      : (this.stmtNextQueued.get() as TaskRow | undefined)
    if (!row) return undefined
    return rowToTask(row)
  }

  // ─── State Machine ─────────────────────────────────────────

  /** queued → dispatched */
  dispatch(id: string): Task {
    return this.doTransition(id, 'dispatched')
  }

  /** dispatched → running (optionally assigns a sessionId) */
  markRunning(id: string, sessionId?: string): Task {
    const task = this.get(id)
    if (!task) throw new Error(`Task not found: ${id}`)

    const allowed = VALID_TRANSITIONS[task.state] ?? []
    if (!allowed.includes('running')) {
      throw new Error(`Invalid transition: ${task.state} → running (task ${id})`)
    }

    const prevState = task.state
    const now = Date.now()

    if (sessionId) {
      this.db.prepare(
        `UPDATE tasks SET state = 'running', session_id = ?, updated_at = ? WHERE id = ?`
      ).run(sessionId, now, id)
    } else {
      this.db.prepare(
        `UPDATE tasks SET state = 'running', updated_at = ? WHERE id = ?`
      ).run(now, id)
    }

    const updated = this.get(id)!
    this.emit('task:state-changed', updated, prevState)
    return updated
  }

  /** running → validating */
  markValidating(id: string): Task {
    return this.doTransition(id, 'validating')
  }

  /** running|validating → completed */
  markCompleted(id: string, result?: Task['result']): Task {
    const task = this.get(id)
    if (!task) throw new Error(`Task not found: ${id}`)

    const allowed = VALID_TRANSITIONS[task.state] ?? []
    if (!allowed.includes('completed')) {
      throw new Error(`Invalid transition: ${task.state} → completed (task ${id})`)
    }

    const prevState = task.state
    const now = Date.now()

    const stmt = result
      ? this.db.prepare(
          `UPDATE tasks SET state = 'completed', result = ?, completed_at = ?, updated_at = ? WHERE id = ?`
        )
      : this.db.prepare(
          `UPDATE tasks SET state = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`
        )

    if (result) {
      stmt.run(JSON.stringify(result), now, now, id)
    } else {
      stmt.run(now, now, id)
    }

    const updated = this.get(id)!
    this.emit('task:state-changed', updated, prevState)
    this.emit('task:completed', updated)
    return updated
  }

  /** running|validating|stalled → failed */
  markFailed(id: string, result?: Task['result']): Task {
    const task = this.get(id)
    if (!task) throw new Error(`Task not found: ${id}`)

    const allowed = VALID_TRANSITIONS[task.state] ?? []
    if (!allowed.includes('failed')) {
      throw new Error(`Invalid transition: ${task.state} → failed (task ${id})`)
    }

    const prevState = task.state
    const now = Date.now()

    const stmt = result
      ? this.db.prepare(
          `UPDATE tasks SET state = 'failed', result = ?, completed_at = ?, updated_at = ? WHERE id = ?`
        )
      : this.db.prepare(
          `UPDATE tasks SET state = 'failed', completed_at = ?, updated_at = ? WHERE id = ?`
        )

    if (result) {
      stmt.run(JSON.stringify(result), now, now, id)
    } else {
      stmt.run(now, now, id)
    }

    const updated = this.get(id)!
    this.emit('task:state-changed', updated, prevState)
    this.emit('task:failed', updated)
    return updated
  }

  /** running → stalled */
  markStalled(id: string): Task {
    return this.doTransition(id, 'stalled')
  }

  /**
   * Retry a failed or stalled task.
   * Moves it back to queued, increments retryCount, clears sessionId and completedAt.
   * Throws if retryCount >= maxRetries.
   */
  retry(id: string): Task {
    const task = this.get(id)
    if (!task) throw new Error(`Task not found: ${id}`)

    if (task.state !== 'failed' && task.state !== 'stalled') {
      throw new Error(
        `Cannot retry task in state '${task.state}' — only failed/stalled tasks can be retried`
      )
    }

    if (task.retryCount >= task.maxRetries) {
      throw new Error(
        `Task ${id} has exhausted retries (${task.retryCount}/${task.maxRetries})`
      )
    }

    const prevState = task.state
    const now = Date.now()
    const newRetryCount = task.retryCount + 1

    this.db.prepare(
      `UPDATE tasks
       SET state = 'queued', session_id = NULL, retry_count = ?,
           completed_at = NULL, updated_at = ?
       WHERE id = ?`
    ).run(newRetryCount, now, id)

    const updated = this.get(id)!
    this.emit('task:state-changed', updated, prevState)
    this.emit('task:retrying', updated)
    return updated
  }

  /** Close the underlying database connection */
  destroy(): void {
    this.db.close()
  }

  // ─── Private helpers ────────────────────────────────────────

  private doTransition(id: string, toState: TaskState): Task {
    const task = this.get(id)
    if (!task) throw new Error(`Task not found: ${id}`)

    const allowed = VALID_TRANSITIONS[task.state] ?? []
    if (!allowed.includes(toState)) {
      throw new Error(
        `Invalid transition: ${task.state} → ${toState} (task ${id})`
      )
    }

    const prevState = task.state
    const now = Date.now()

    this.db.prepare(
      `UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?`
    ).run(toState, now, id)

    const updated = this.get(id)!
    this.emit('task:state-changed', updated, prevState)

    if (toState === 'stalled') this.emit('task:stalled', updated)

    return updated
  }
}

// ─── Internal helpers ───────────────────────────────────────

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    parentId: row.parent_id,
    sessionId: row.session_id,
    source: row.source,
    title: row.title,
    description: row.description,
    state: row.state as TaskState,
    policy: row.policy ? (JSON.parse(row.policy) as Task['policy']) : null,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    result: row.result ? (JSON.parse(row.result) as Task['result']) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}
