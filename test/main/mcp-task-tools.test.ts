/**
 * Tests for the TaskManager API contract exercised by the MCP task tools.
 * We test the TaskManager directly (not the MCP server which requires network).
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { TaskManager } from '../../src/main/task/task-manager'

function createManager(): TaskManager {
  const db = new Database(':memory:')
  return new TaskManager(db)
}

describe('MCP task tools — TaskManager API contract', () => {
  let mgr: TaskManager

  beforeEach(() => {
    mgr = createManager()
  })

  afterEach(() => {
    mgr.destroy()
  })

  // ─── mux_task_create contract ──────────────────────────────

  describe('mux_task_create contract', () => {
    it('creates a task with title + source (required fields)', () => {
      const task = mgr.create({ title: 'Fix bug', source: 'orchestrator' })

      assert.ok(task.id, 'should have an id')
      assert.equal(task.title, 'Fix bug')
      assert.equal(task.source, 'orchestrator')
      assert.equal(task.state, 'queued')
      assert.equal(task.parentId, null)
      assert.equal(task.description, null)
      assert.equal(task.policy, null)
    })

    it('creates a task with optional description and parentId', () => {
      const parent = mgr.create({ title: 'Parent task', source: 'orchestrator' })
      const child = mgr.create({
        title: 'Child task',
        source: 'orchestrator',
        description: 'Do something specific',
        parentId: parent.id,
      })

      assert.equal(child.description, 'Do something specific')
      assert.equal(child.parentId, parent.id)
    })

    it('maps snake_case policy to camelCase for TaskManager', () => {
      // This simulates what mux_task_create does: convert stall_timeout → stallTimeout etc.
      const snakeCasePolicy = {
        stall_timeout: 30000,
        max_retries: 3,
        before_run: 'git stash',
        after_run: 'git stash pop',
      }

      const camelCasePolicy = {
        stallTimeout: snakeCasePolicy.stall_timeout,
        maxRetries: snakeCasePolicy.max_retries,
        beforeRun: snakeCasePolicy.before_run,
        afterRun: snakeCasePolicy.after_run,
      }

      const task = mgr.create({
        title: 'Task with policy',
        source: 'orchestrator',
        policy: camelCasePolicy,
      })

      assert.ok(task.policy, 'should have a policy')
      assert.equal(task.policy!.stallTimeout, 30000)
      assert.equal(task.policy!.maxRetries, 3)
      assert.equal(task.policy!.beforeRun, 'git stash')
      assert.equal(task.policy!.afterRun, 'git stash pop')
      assert.equal(task.maxRetries, 3)
    })
  })

  // ─── mux_task_update contract ─────────────────────────────

  describe('mux_task_update contract', () => {
    it('dispatched state → dispatch()', () => {
      const task = mgr.create({ title: 'Task', source: 'orchestrator' })
      const dispatched = mgr.dispatch(task.id)

      assert.equal(dispatched.state, 'dispatched')
    })

    it('running state → markRunning()', () => {
      const task = mgr.create({ title: 'Task', source: 'orchestrator' })
      mgr.dispatch(task.id)
      const running = mgr.markRunning(task.id, 'session-abc')

      assert.equal(running.state, 'running')
      assert.equal(running.sessionId, 'session-abc')
    })

    it('done state → markValidating()', () => {
      const task = mgr.create({ title: 'Task', source: 'orchestrator' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      const validating = mgr.markValidating(task.id)

      assert.equal(validating.state, 'validating')
    })

    it('failed state → markFailed()', () => {
      const task = mgr.create({ title: 'Task', source: 'orchestrator' })
      mgr.dispatch(task.id)
      mgr.markRunning(task.id)
      const failed = mgr.markFailed(task.id, { summary: 'Timed out' })

      assert.equal(failed.state, 'failed')
      assert.ok(failed.result, 'should have a result')
      assert.equal((failed.result as any).summary, 'Timed out')
    })

    it('throws on invalid state transition — caught by MCP tool try/catch', () => {
      const task = mgr.create({ title: 'Task', source: 'orchestrator' })
      // Cannot go directly from queued → running
      assert.throws(
        () => mgr.markRunning(task.id),
        /Invalid transition/
      )
    })

    it('returns undefined for non-existent task update', () => {
      const result = mgr.update('nonexistent-id', { sessionId: 'abc' })
      assert.equal(result, undefined)
    })
  })

  // ─── mux_task_list contract ───────────────────────────────

  describe('mux_task_list contract', () => {
    it('lists all tasks when no filter provided', () => {
      mgr.create({ title: 'Task 1', source: 'orchestrator' })
      mgr.create({ title: 'Task 2', source: 'worker' })

      const tasks = mgr.list()
      assert.equal(tasks.length, 2)
    })

    it('filters by state', () => {
      const t1 = mgr.create({ title: 'Task 1', source: 'orchestrator' })
      mgr.create({ title: 'Task 2', source: 'orchestrator' })
      mgr.dispatch(t1.id)

      const dispatched = mgr.list({ state: 'dispatched' })
      assert.equal(dispatched.length, 1)
      assert.equal(dispatched[0].id, t1.id)
    })

    it('filters by source', () => {
      mgr.create({ title: 'Task 1', source: 'orchestrator' })
      mgr.create({ title: 'Task 2', source: 'worker' })

      const orchestratorTasks = mgr.list({ source: 'orchestrator' })
      assert.equal(orchestratorTasks.length, 1)
      assert.equal(orchestratorTasks[0].source, 'orchestrator')
    })

    it('filters by parentId', () => {
      const parent = mgr.create({ title: 'Parent', source: 'orchestrator' })
      mgr.create({ title: 'Child 1', source: 'orchestrator', parentId: parent.id })
      mgr.create({ title: 'Child 2', source: 'orchestrator', parentId: parent.id })
      mgr.create({ title: 'Standalone', source: 'orchestrator' })

      const children = mgr.list({ parentId: parent.id })
      assert.equal(children.length, 2)
    })

    it('filters by sessionId', () => {
      const t1 = mgr.create({ title: 'Task 1', source: 'orchestrator' })
      mgr.create({ title: 'Task 2', source: 'orchestrator' })
      mgr.dispatch(t1.id)
      mgr.markRunning(t1.id, 'session-xyz')

      const sessionTasks = mgr.list({ sessionId: 'session-xyz' })
      assert.equal(sessionTasks.length, 1)
      assert.equal(sessionTasks[0].sessionId, 'session-xyz')
    })
  })

  // ─── mux_task_get contract ────────────────────────────────

  describe('mux_task_get contract', () => {
    it('returns task and its children', () => {
      const parent = mgr.create({ title: 'Parent', source: 'orchestrator' })
      mgr.create({ title: 'Child 1', source: 'orchestrator', parentId: parent.id })
      mgr.create({ title: 'Child 2', source: 'orchestrator', parentId: parent.id })

      const task = mgr.get(parent.id)
      assert.ok(task, 'parent task should exist')
      assert.equal(task!.title, 'Parent')

      const children = mgr.children(parent.id)
      assert.equal(children.length, 2)
    })

    it('returns undefined for non-existent task', () => {
      const task = mgr.get('nonexistent-id')
      assert.equal(task, undefined)
    })

    it('returns empty children for task with no children', () => {
      const task = mgr.create({ title: 'Leaf task', source: 'orchestrator' })
      const children = mgr.children(task.id)
      assert.equal(children.length, 0)
    })
  })
})
