import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { TaskManager } from '../../src/main/task/task-manager'
import { TaskHooks } from '../../src/main/task/task-hooks'
import { BugreportTaskSource } from '../../src/main/task/sources/bugreport-source'
import type { CreateTaskOpts } from '../../src/shared/types'

function createManager(): TaskManager {
  const db = new Database(':memory:')
  return new TaskManager(db)
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cipher-task-integration-'))
}

function removeTmpDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
}

/** Wait up to maxMs for predicate to return true, polling every 50ms */
async function waitFor(predicate: () => boolean, maxMs = 5000): Promise<void> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('waitFor timed out')
}

// ─── Test 1: Full lifecycle ──────────────────────────────────────────────────

describe('Integration: Full lifecycle', () => {
  let mgr: TaskManager
  let tmpDir: string
  let source: BugreportTaskSource

  beforeEach(() => {
    mgr = createManager()
    tmpDir = makeTmpDir()
    source = new BugreportTaskSource(tmpDir)
  })

  afterEach(() => {
    source.stop()
    mgr.destroy()
    removeTmpDir(tmpDir)
  })

  it('creates task from .md file and progresses through full lifecycle', async () => {
    // Wire source into manager
    source.start((opts: CreateTaskOpts) => {
      mgr.create(opts)
    })

    // Write a bugreport markdown file
    const reportFile = path.join(tmpDir, 'login-crash.md')
    fs.writeFileSync(reportFile, '# Bug\nLogin button crashes on click.')

    // Give fs.watch a chance, then fall back to manual rescan (fs.watch is unreliable under load)
    await waitFor(() => mgr.nextQueued('bugreport') !== undefined, 2000)
      .catch(() => { source.rescan() })

    // nextQueued → dispatch
    const queued = mgr.nextQueued('bugreport')
    assert.ok(queued, 'task should be queued')
    assert.equal(queued.source, 'bugreport')
    assert.equal(queued.title, 'login-crash')
    assert.equal(queued.state, 'queued')

    const dispatched = mgr.dispatch(queued.id)
    assert.equal(dispatched.state, 'dispatched')

    // dispatch → running
    const running = mgr.markRunning(queued.id, 'session-abc')
    assert.equal(running.state, 'running')
    assert.equal(running.sessionId, 'session-abc')

    // running → validating
    const validating = mgr.markValidating(queued.id)
    assert.equal(validating.state, 'validating')

    // Run afterRun hook with `echo ok`
    const hooks = new TaskHooks()
    // Override the policy hook to a simple echo for the test
    const taskForHook = { ...validating, policy: { hooks: { afterRun: 'echo ok' } } }
    const hookResult = await hooks.runAfterRun(taskForHook, tmpDir)
    assert.equal(hookResult.success, true)
    assert.equal(hookResult.exitCode, 0)
    assert.equal(hookResult.timedOut, false)
    assert.match(hookResult.stdout.trim(), /ok/)

    // validating → completed
    const completed = mgr.markCompleted(queued.id, { summary: 'fixed', artifacts: [] })
    assert.equal(completed.state, 'completed')
    assert.ok(completed.completedAt !== null, 'completedAt should be set')
    assert.deepEqual(completed.result, { summary: 'fixed', artifacts: [] })
  })
})

// ─── Test 2: Hierarchical tasks ─────────────────────────────────────────────

describe('Integration: Hierarchical tasks', () => {
  let mgr: TaskManager

  beforeEach(() => {
    mgr = createManager()
  })

  afterEach(() => {
    mgr.destroy()
  })

  it('supports parent/child task relationships with independent states', () => {
    // Create parent
    const parent = mgr.create({ title: 'Parent bug fix', source: 'orchestrator' })
    assert.equal(parent.state, 'queued')
    assert.equal(parent.parentId, null)

    // Create two children
    const child1 = mgr.create({
      title: 'Child task 1',
      source: 'orchestrator',
      parentId: parent.id,
    })
    const child2 = mgr.create({
      title: 'Child task 2',
      source: 'orchestrator',
      parentId: parent.id,
    })

    assert.equal(child1.parentId, parent.id)
    assert.equal(child2.parentId, parent.id)

    // Dispatch and run child1 independently
    mgr.dispatch(child1.id)
    mgr.markRunning(child1.id, 'session-child-1')

    // Dispatch and run child2 independently
    mgr.dispatch(child2.id)
    mgr.markRunning(child2.id, 'session-child-2')

    // Complete child1, leave child2 running
    mgr.markCompleted(child1.id)

    // Verify via children()
    const children = mgr.children(parent.id)
    assert.equal(children.length, 2)

    const completed = children.find((c) => c.id === child1.id)!
    const stillRunning = children.find((c) => c.id === child2.id)!

    assert.equal(completed.state, 'completed')
    assert.ok(completed.completedAt !== null)

    assert.equal(stillRunning.state, 'running')
    assert.equal(stillRunning.completedAt, null)

    // Parent should still be queued (independent lifecycle)
    const parentRefreshed = mgr.get(parent.id)!
    assert.equal(parentRefreshed.state, 'queued')
  })
})

// ─── Test 3: Retry flow ──────────────────────────────────────────────────────

describe('Integration: Retry flow', () => {
  let mgr: TaskManager

  beforeEach(() => {
    mgr = createManager()
  })

  afterEach(() => {
    mgr.destroy()
  })

  it('retries a failed task and completes successfully on second attempt', () => {
    // Create → dispatch → run → fail
    const task = mgr.create({
      title: 'Flaky test task',
      source: 'ci',
      policy: { maxRetries: 2 },
    })
    assert.equal(task.state, 'queued')
    assert.equal(task.retryCount, 0)

    mgr.dispatch(task.id)
    mgr.markRunning(task.id)
    mgr.markFailed(task.id, { summary: 'timeout', artifacts: [] })

    const failed = mgr.get(task.id)!
    assert.equal(failed.state, 'failed')

    // retry() → back to queued with retryCount=1
    const retried = mgr.retry(task.id)
    assert.equal(retried.state, 'queued')
    assert.equal(retried.retryCount, 1)
    assert.equal(retried.sessionId, null)
    assert.equal(retried.completedAt, null)

    // Second attempt: dispatch → run → validate → complete
    mgr.dispatch(task.id)
    mgr.markRunning(task.id, 'session-retry-1')
    mgr.markValidating(task.id)
    mgr.markCompleted(task.id, { summary: 'passed on retry', artifacts: [] })

    const finalTask = mgr.get(task.id)!
    assert.equal(finalTask.state, 'completed')
    assert.equal(finalTask.retryCount, 1)
    assert.ok(finalTask.completedAt !== null)
    assert.deepEqual(finalTask.result, { summary: 'passed on retry', artifacts: [] })
  })
})
