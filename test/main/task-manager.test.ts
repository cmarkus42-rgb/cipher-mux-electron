import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { TaskManager } from '../../src/main/task/task-manager'
import type { Task, TaskState } from '../../src/shared/types'
import { TASK_DEFAULT_MAX_RETRIES } from '../../src/shared/constants'

function createManager(): TaskManager {
  const db = new Database(':memory:')
  return new TaskManager(db)
}

describe('TaskManager', () => {
  let mgr: TaskManager

  beforeEach(() => {
    mgr = createManager()
  })

  afterEach(() => {
    mgr.destroy()
  })

  // ─── CRUD ────────────────────────────────────────────────

  describe('create', () => {
    it('should create a task with required fields', () => {
      const task = mgr.create({ title: 'Test task', source: 'orchestrator' })

      assert.ok(task.id, 'should have an id')
      assert.equal(task.title, 'Test task')
      assert.equal(task.source, 'orchestrator')
      assert.equal(task.state, 'queued')
      assert.equal(task.retryCount, 0)
      assert.equal(task.maxRetries, TASK_DEFAULT_MAX_RETRIES)
      assert.equal(task.parentId, null)
      assert.equal(task.sessionId, null)
      assert.equal(task.description, null)
      assert.equal(task.policy, null)
      assert.equal(task.result, null)
      assert.equal(task.completedAt, null)
      assert.ok(task.createdAt > 0)
      assert.ok(task.updatedAt > 0)
    })

    it('should set description and parentId', () => {
      const parent = mgr.create({ title: 'Parent', source: 'test' })
      const child = mgr.create({
        title: 'Child',
        source: 'test',
        description: 'child desc',
        parentId: parent.id,
      })

      assert.equal(child.description, 'child desc')
      assert.equal(child.parentId, parent.id)
    })

    it('should store and deserialize policy', () => {
      const task = mgr.create({
        title: 'With policy',
        source: 'test',
        policy: { stallTimeout: 10000, maxRetries: 5 },
      })

      assert.deepEqual(task.policy, { stallTimeout: 10000, maxRetries: 5 })
      assert.equal(task.maxRetries, 5)
    })

    it('should use policy.maxRetries for maxRetries field', () => {
      const task = mgr.create({
        title: 'Custom retries',
        source: 'test',
        policy: { maxRetries: 7 },
      })
      assert.equal(task.maxRetries, 7)
    })

    it('should emit task:created event', () => {
      const events: Task[] = []
      mgr.on('task:created', (t: Task) => events.push(t))

      const task = mgr.create({ title: 'Event task', source: 'test' })
      assert.equal(events.length, 1)
      assert.equal(events[0].id, task.id)
    })

    it('should generate unique IDs', () => {
      const t1 = mgr.create({ title: 'T1', source: 'test' })
      const t2 = mgr.create({ title: 'T2', source: 'test' })
      assert.notEqual(t1.id, t2.id)
    })
  })

  describe('get', () => {
    it('should return undefined for unknown id', () => {
      assert.equal(mgr.get('nonexistent'), undefined)
    })

    it('should retrieve created task by id', () => {
      const created = mgr.create({ title: 'Find me', source: 'test' })
      const found = mgr.get(created.id)
      assert.ok(found)
      assert.equal(found.id, created.id)
      assert.equal(found.title, 'Find me')
    })
  })

  describe('list', () => {
    it('should list all tasks without filter', () => {
      mgr.create({ title: 'T1', source: 'src-a' })
      mgr.create({ title: 'T2', source: 'src-b' })
      mgr.create({ title: 'T3', source: 'src-a' })

      const all = mgr.list()
      assert.equal(all.length, 3)
    })

    it('should filter by state (single)', () => {
      const t1 = mgr.create({ title: 'T1', source: 'test' })
      mgr.create({ title: 'T2', source: 'test' })
      mgr.dispatch(t1.id)

      const queued = mgr.list({ state: 'queued' })
      assert.equal(queued.length, 1)
      assert.equal(queued[0].title, 'T2')

      const dispatched = mgr.list({ state: 'dispatched' })
      assert.equal(dispatched.length, 1)
      assert.equal(dispatched[0].id, t1.id)
    })

    it('should filter by state (array)', () => {
      const t1 = mgr.create({ title: 'T1', source: 'test' })
      const t2 = mgr.create({ title: 'T2', source: 'test' })
      mgr.dispatch(t1.id)
      mgr.dispatch(t2.id)
      mgr.markRunning(t2.id)

      const results = mgr.list({ state: ['dispatched', 'running'] })
      assert.equal(results.length, 2)
    })

    it('should filter by source', () => {
      mgr.create({ title: 'T1', source: 'src-a' })
      mgr.create({ title: 'T2', source: 'src-b' })
      mgr.create({ title: 'T3', source: 'src-a' })

      const srcA = mgr.list({ source: 'src-a' })
      assert.equal(srcA.length, 2)
      assert.ok(srcA.every((t) => t.source === 'src-a'))
    })

    it('should filter by parentId (non-null)', () => {
      const parent = mgr.create({ title: 'Parent', source: 'test' })
      mgr.create({ title: 'Child 1', source: 'test', parentId: parent.id })
      mgr.create({ title: 'Child 2', source: 'test', parentId: parent.id })
      mgr.create({ title: 'Unrelated', source: 'test' })

      const kids = mgr.list({ parentId: parent.id })
      assert.equal(kids.length, 2)
      assert.ok(kids.every((t) => t.parentId === parent.id))
    })

    it('should filter by parentId = null (top-level)', () => {
      const parent = mgr.create({ title: 'Parent', source: 'test' })
      mgr.create({ title: 'Child', source: 'test', parentId: parent.id })

      const topLevel = mgr.list({ parentId: null })
      assert.equal(topLevel.length, 1)
      assert.equal(topLevel[0].id, parent.id)
    })

    it('should return empty array when nothing matches', () => {
      mgr.create({ title: 'T1', source: 'test' })
      const result = mgr.list({ source: 'nonexistent' })
      assert.equal(result.length, 0)
    })
  })

  describe('children', () => {
    it('should return direct children', () => {
      const parent = mgr.create({ title: 'Parent', source: 'test' })
      const c1 = mgr.create({ title: 'C1', source: 'test', parentId: parent.id })
      const c2 = mgr.create({ title: 'C2', source: 'test', parentId: parent.id })
      mgr.create({ title: 'Unrelated', source: 'test' })

      const kids = mgr.children(parent.id)
      assert.equal(kids.length, 2)
      const ids = kids.map((t) => t.id)
      assert.ok(ids.includes(c1.id))
      assert.ok(ids.includes(c2.id))
    })

    it('should return empty array if no children', () => {
      const task = mgr.create({ title: 'Lone', source: 'test' })
      assert.deepEqual(mgr.children(task.id), [])
    })
  })

  describe('update', () => {
    it('should update description', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      const updated = mgr.update(task.id, { description: 'new desc' })
      assert.ok(updated)
      assert.equal(updated.description, 'new desc')
    })

    it('should update policy', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      const updated = mgr.update(task.id, { policy: { stallTimeout: 5000 } })
      assert.ok(updated)
      assert.deepEqual(updated.policy, { stallTimeout: 5000 })
    })

    it('should return undefined for unknown id', () => {
      const result = mgr.update('nonexistent', { description: 'x' })
      assert.equal(result, undefined)
    })

    it('should update updatedAt', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      const before = task.updatedAt
      // small delay to ensure timestamp differs
      const updated = mgr.update(task.id, { description: 'changed' })
      assert.ok(updated!.updatedAt >= before)
    })
  })

  // ─── Queue ───────────────────────────────────────────────

  describe('nextQueued', () => {
    it('should return undefined when queue is empty', () => {
      assert.equal(mgr.nextQueued(), undefined)
    })

    it('should return the oldest queued task (FIFO)', () => {
      const t1 = mgr.create({ title: 'First', source: 'test' })
      mgr.create({ title: 'Second', source: 'test' })

      const next = mgr.nextQueued()
      assert.ok(next)
      assert.equal(next.id, t1.id)
    })

    it('should filter by source', () => {
      mgr.create({ title: 'Src-A', source: 'src-a' })
      const t2 = mgr.create({ title: 'Src-B', source: 'src-b' })

      const next = mgr.nextQueued('src-b')
      assert.ok(next)
      assert.equal(next.id, t2.id)
    })

    it('should skip non-queued tasks', () => {
      const t1 = mgr.create({ title: 'T1', source: 'test' })
      const t2 = mgr.create({ title: 'T2', source: 'test' })
      mgr.dispatch(t1.id)

      const next = mgr.nextQueued()
      assert.ok(next)
      assert.equal(next.id, t2.id)
    })
  })

  // ─── State Machine ───────────────────────────────────────

  describe('dispatch', () => {
    it('should transition queued → dispatched', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      const updated = mgr.dispatch(task.id)
      assert.equal(updated.state, 'dispatched')
    })

    it('should emit task:state-changed with prevState', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      const events: Array<[Task, TaskState]> = []
      mgr.on('task:state-changed', (t: Task, prev: TaskState) => events.push([t, prev]))

      mgr.dispatch(task.id)

      assert.equal(events.length, 1)
      assert.equal(events[0][0].state, 'dispatched')
      assert.equal(events[0][1], 'queued')
    })

    it('should throw for invalid transition (dispatched → dispatched)', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      assert.throws(() => mgr.dispatch(task.id), /Invalid transition/)
    })

    it('should throw for nonexistent task', () => {
      assert.throws(() => mgr.dispatch('nonexistent'), /not found/)
    })
  })

  describe('markRunning', () => {
    it('should transition dispatched → running', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      const running = mgr.markRunning(task.id)
      assert.equal(running.state, 'running')
    })

    it('should assign sessionId when provided', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      const running = mgr.markRunning(task.id, 'session-42')
      assert.equal(running.sessionId, 'session-42')
    })

    it('should leave sessionId null when not provided', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      const running = mgr.markRunning(task.id)
      assert.equal(running.sessionId, null)
    })

    it('should throw for invalid transition (queued → running)', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      assert.throws(() => mgr.markRunning(task.id), /Invalid transition/)
    })
  })

  describe('markValidating', () => {
    it('should transition running → validating', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      const validating = mgr.markValidating(task.id)
      assert.equal(validating.state, 'validating')
    })

    it('should throw for invalid transition (queued → validating)', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      assert.throws(() => mgr.markValidating(task.id), /Invalid transition/)
    })
  })

  describe('markCompleted', () => {
    it('should transition running → completed', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      const done = mgr.markCompleted(task.id)
      assert.equal(done.state, 'completed')
      assert.ok(done.completedAt !== null)
    })

    it('should transition validating → completed', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      mgr.markValidating(task.id)
      const done = mgr.markCompleted(task.id)
      assert.equal(done.state, 'completed')
    })

    it('should store result', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      const done = mgr.markCompleted(task.id, { summary: 'All good', exitCode: 0 })
      assert.deepEqual(done.result, { summary: 'All good', exitCode: 0 })
    })

    it('should emit task:completed event', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)

      const events: Task[] = []
      mgr.on('task:completed', (t: Task) => events.push(t))
      mgr.markCompleted(task.id)

      assert.equal(events.length, 1)
      assert.equal(events[0].state, 'completed')
    })

    it('should throw for invalid transition (queued → completed)', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      assert.throws(() => mgr.markCompleted(task.id), /Invalid transition/)
    })
  })

  describe('markFailed', () => {
    it('should transition running → failed', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      const failed = mgr.markFailed(task.id)
      assert.equal(failed.state, 'failed')
      assert.ok(failed.completedAt !== null)
    })

    it('should transition validating → failed', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      mgr.markValidating(task.id)
      const failed = mgr.markFailed(task.id)
      assert.equal(failed.state, 'failed')
    })

    it('should transition stalled → failed', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      mgr.markStalled(task.id)
      const failed = mgr.markFailed(task.id)
      assert.equal(failed.state, 'failed')
    })

    it('should store error result', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      const failed = mgr.markFailed(task.id, { error: 'Something blew up' })
      assert.deepEqual(failed.result, { error: 'Something blew up' })
    })

    it('should emit task:failed event', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)

      const events: Task[] = []
      mgr.on('task:failed', (t: Task) => events.push(t))
      mgr.markFailed(task.id)

      assert.equal(events.length, 1)
      assert.equal(events[0].state, 'failed')
    })
  })

  describe('markStalled', () => {
    it('should transition running → stalled', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      const stalled = mgr.markStalled(task.id)
      assert.equal(stalled.state, 'stalled')
    })

    it('should emit task:stalled event', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)

      const events: Task[] = []
      mgr.on('task:stalled', (t: Task) => events.push(t))
      mgr.markStalled(task.id)

      assert.equal(events.length, 1)
      assert.equal(events[0].state, 'stalled')
    })

    it('should throw for invalid transition (queued → stalled)', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      assert.throws(() => mgr.markStalled(task.id), /Invalid transition/)
    })
  })

  // ─── retry ───────────────────────────────────────────────

  describe('retry', () => {
    it('should retry a failed task: back to queued, retryCount++', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      mgr.markFailed(task.id)

      const retried = mgr.retry(task.id)
      assert.equal(retried.state, 'queued')
      assert.equal(retried.retryCount, 1)
      assert.equal(retried.sessionId, null)
      assert.equal(retried.completedAt, null)
    })

    it('should retry a stalled task', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id, 'sess-1')
      mgr.markStalled(task.id)

      const retried = mgr.retry(task.id)
      assert.equal(retried.state, 'queued')
      assert.equal(retried.sessionId, null)
    })

    it('should emit task:retrying and task:state-changed events', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      mgr.markFailed(task.id)

      const retryingEvents: Task[] = []
      const stateChangedEvents: Array<[Task, TaskState]> = []
      mgr.on('task:retrying', (t: Task) => retryingEvents.push(t))
      mgr.on('task:state-changed', (t: Task, prev: TaskState) =>
        stateChangedEvents.push([t, prev])
      )

      mgr.retry(task.id)

      assert.equal(retryingEvents.length, 1)
      assert.equal(retryingEvents[0].state, 'queued')

      // state-changed fired for retry
      const retryChange = stateChangedEvents.find(([t]) => t.state === 'queued' && t.retryCount === 1)
      assert.ok(retryChange, 'should have a state-changed event for the retry')
      assert.equal(retryChange![1], 'failed')
    })

    it('should allow retry up to maxRetries times', () => {
      const task = mgr.create({
        title: 'T',
        source: 'test',
        policy: { maxRetries: 2 },
      })

      // first run → fail → retry
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      mgr.markFailed(task.id)
      const r1 = mgr.retry(task.id)
      assert.equal(r1.retryCount, 1)

      // second run → fail → retry
      mgr.dispatch(r1.id)
      mgr.markRunning(r1.id)
      mgr.markFailed(r1.id)
      const r2 = mgr.retry(r1.id)
      assert.equal(r2.retryCount, 2)

      // third fail → should throw (exhausted)
      mgr.dispatch(r2.id)
      mgr.markRunning(r2.id)
      mgr.markFailed(r2.id)
      assert.throws(() => mgr.retry(r2.id), /exhausted/)
    })

    it('should throw when retrying a queued task', () => {
      const task = mgr.create({ title: 'T', source: 'test' })
      assert.throws(() => mgr.retry(task.id), /only failed\/stalled/)
    })

    it('should throw for nonexistent task', () => {
      assert.throws(() => mgr.retry('nope'), /not found/)
    })
  })

  // ─── Full happy-path workflow ────────────────────────────

  describe('full workflow', () => {
    it('queued → dispatched → running → validating → completed', () => {
      const task = mgr.create({ title: 'Full run', source: 'orchestrator' })
      assert.equal(task.state, 'queued')

      const d = mgr.dispatch(task.id)
      assert.equal(d.state, 'dispatched')

      const r = mgr.markRunning(d.id, 'session-abc')
      assert.equal(r.state, 'running')
      assert.equal(r.sessionId, 'session-abc')

      const v = mgr.markValidating(r.id)
      assert.equal(v.state, 'validating')

      const c = mgr.markCompleted(v.id, { summary: 'done', branch: 'main' })
      assert.equal(c.state, 'completed')
      assert.ok(c.completedAt !== null)
      assert.deepEqual(c.result, { summary: 'done', branch: 'main' })
    })

    it('queued → dispatched → running → stalled → queued (retry loop)', () => {
      const task = mgr.create({ title: 'Stall loop', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id, 'sess-1')
      mgr.markStalled(task.id)

      const retried = mgr.retry(task.id)
      assert.equal(retried.state, 'queued')
      assert.equal(retried.retryCount, 1)

      // Can be dispatched again
      const d2 = mgr.dispatch(retried.id)
      assert.equal(d2.state, 'dispatched')
    })

    it('should track all events through lifecycle', () => {
      const emitted: Array<{ event: string; state: TaskState }> = []
      mgr.on('task:created', (t: Task) => emitted.push({ event: 'created', state: t.state }))
      mgr.on('task:state-changed', (t: Task) => emitted.push({ event: 'state-changed', state: t.state }))
      mgr.on('task:completed', (t: Task) => emitted.push({ event: 'completed', state: t.state }))

      const task = mgr.create({ title: 'Event chain', source: 'test' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      mgr.markCompleted(task.id)

      const eventNames = emitted.map((e) => e.event)
      assert.ok(eventNames.includes('created'))
      assert.ok(eventNames.includes('completed'))
      assert.equal(
        emitted.filter((e) => e.event === 'state-changed').length,
        3 // dispatched, running, completed
      )
    })
  })
})
