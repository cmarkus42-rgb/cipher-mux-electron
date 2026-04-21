import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { EventEmitter } from 'events'
import Database from 'better-sqlite3'
import { TaskManager } from '../../src/main/task/task-manager'
import { TaskWatcher } from '../../src/main/task/task-watcher'

// ─── Mock Helpers ──────────────────────────────────────────

function makeDb(): Database.Database {
  return new Database(':memory:')
}

class MockSessionManager extends EventEmitter {
  stopped: string[] = []
  async stop(id: string): Promise<void> {
    this.stopped.push(id)
  }
}

class MockTmuxManager extends EventEmitter {}

// ─── Tests ─────────────────────────────────────────────────

describe('TaskWatcher', () => {
  let db: Database.Database
  let taskManager: TaskManager
  let sessionManager: MockSessionManager
  let tmuxManager: MockTmuxManager
  let watcher: TaskWatcher

  beforeEach(() => {
    db = makeDb()
    taskManager = new TaskManager(db)
    sessionManager = new MockSessionManager()
    tmuxManager = new MockTmuxManager()
  })

  afterEach(() => {
    watcher?.stop()
    taskManager.destroy()
  })

  it('tracks output timestamps from tmux events', async () => {
    watcher = new TaskWatcher({
      taskManager,
      sessionManager,
      tmuxManager,
      watchInterval: 100,
      defaultStallTimeout: 50,
    })
    watcher.start()

    assert.equal(watcher.getLastOutputTimestamp('session-1'), undefined)

    const before = Date.now()
    tmuxManager.emit('output', 'session-1', 'some output data')
    const after = Date.now()

    const ts = watcher.getLastOutputTimestamp('session-1')
    assert.ok(ts !== undefined, 'timestamp should be set after output event')
    assert.ok(ts >= before && ts <= after + 5, 'timestamp should be close to now')
  })

  it('detects stalled tasks and marks them', async () => {
    watcher = new TaskWatcher({
      taskManager,
      sessionManager,
      tmuxManager,
      watchInterval: 100,
      defaultStallTimeout: 50,
    })

    // Create and move a task to running state
    const task = taskManager.create({ title: 'Test task', source: 'test' })
    taskManager.dispatch(task.id)
    taskManager.markRunning(task.id, 'session-abc')

    // Manually backdate updatedAt so the task appears stalled
    // (set updated_at to 200ms ago, well beyond the 50ms stallTimeout)
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?')
      .run(Date.now() - 200, task.id)

    watcher.start()

    // Wait for the watcher to fire at least once
    await new Promise<void>((resolve) => setTimeout(resolve, 300))

    const updated = taskManager.get(task.id)
    assert.ok(
      updated?.state === 'stalled' || updated?.state === 'queued' || updated?.state === 'failed',
      `Expected stalled/queued/failed, got: ${updated?.state}`
    )
  })

  it('respects stallTimeout === -1 (never stall)', async () => {
    watcher = new TaskWatcher({
      taskManager,
      sessionManager,
      tmuxManager,
      watchInterval: 100,
      defaultStallTimeout: 50,
    })

    const task = taskManager.create({
      title: 'Immortal task',
      source: 'test',
      policy: { stallTimeout: -1, maxRetries: 2 },
    })
    taskManager.dispatch(task.id)
    taskManager.markRunning(task.id, 'session-xyz')

    // Backdate the task to make it look very old
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?')
      .run(Date.now() - 10_000, task.id)

    watcher.start()

    await new Promise<void>((resolve) => setTimeout(resolve, 300))

    const updated = taskManager.get(task.id)
    assert.equal(updated?.state, 'running', 'Task with stallTimeout=-1 should remain running')
  })

  it('auto-retries within maxRetries limit', async () => {
    watcher = new TaskWatcher({
      taskManager,
      sessionManager,
      tmuxManager,
      watchInterval: 100,
      defaultStallTimeout: 50,
    })

    const task = taskManager.create({
      title: 'Retryable task',
      source: 'test',
      policy: { stallTimeout: 50, maxRetries: 2 },
    })
    taskManager.dispatch(task.id)
    taskManager.markRunning(task.id, 'session-retry')

    // Backdate so it stalls immediately
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?')
      .run(Date.now() - 200, task.id)

    watcher.start()

    await new Promise<void>((resolve) => setTimeout(resolve, 400))

    const updated = taskManager.get(task.id)
    assert.ok(
      updated?.state === 'queued' || updated?.state === 'stalled',
      `Expected queued (retrying) or stalled, got: ${updated?.state}`
    )
    assert.ok(
      (updated?.retryCount ?? 0) >= 1,
      'retryCount should have been incremented'
    )
  })

  it('marks task failed after exhausting retries', async () => {
    watcher = new TaskWatcher({
      taskManager,
      sessionManager,
      tmuxManager,
      watchInterval: 100,
      defaultStallTimeout: 50,
    })

    // Create a task that has already used all its retries
    const task = taskManager.create({
      title: 'Exhausted task',
      source: 'test',
      policy: { stallTimeout: 50, maxRetries: 0 },
    })
    taskManager.dispatch(task.id)
    taskManager.markRunning(task.id, 'session-exhausted')

    // Backdate so it stalls immediately
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?')
      .run(Date.now() - 200, task.id)

    watcher.start()

    await new Promise<void>((resolve) => setTimeout(resolve, 300))

    const updated = taskManager.get(task.id)
    assert.equal(updated?.state, 'failed', 'Task with exhausted retries should be marked failed')
  })

  it('stop() prevents further checks', async () => {
    watcher = new TaskWatcher({
      taskManager,
      sessionManager,
      tmuxManager,
      watchInterval: 100,
      defaultStallTimeout: 50,
    })

    const task = taskManager.create({ title: 'Stable task', source: 'test' })
    taskManager.dispatch(task.id)
    taskManager.markRunning(task.id, 'session-stop-test')

    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?')
      .run(Date.now() - 200, task.id)

    watcher.start()
    // Stop immediately — no checks should fire
    watcher.stop()

    await new Promise<void>((resolve) => setTimeout(resolve, 300))

    const updated = taskManager.get(task.id)
    assert.equal(updated?.state, 'running', 'Task should remain running after watcher is stopped')
  })

  it('uses last tmux output timestamp over updatedAt for freshness check', async () => {
    watcher = new TaskWatcher({
      taskManager,
      sessionManager,
      tmuxManager,
      watchInterval: 100,
      defaultStallTimeout: 200,
    })

    const task = taskManager.create({ title: 'Active output task', source: 'test' })
    taskManager.dispatch(task.id)
    taskManager.markRunning(task.id, 'session-output-test')

    // Backdate updatedAt to simulate a stale DB record
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?')
      .run(Date.now() - 1_000, task.id)

    // Start the watcher so it registers the output listener
    watcher.start()

    // Emit a fresh output event immediately — this sets the tmux timestamp to "now"
    // so the watcher check (which runs at 100ms) should see fresh activity
    tmuxManager.emit('output', 'session-output-test', 'still alive')

    // Wait exactly 1 interval to verify the check respects the fresh timestamp
    await new Promise<void>((resolve) => setTimeout(resolve, 150))

    const updated = taskManager.get(task.id)
    assert.equal(updated?.state, 'running', 'Task should not stall when fresh output is received')
  })
})
