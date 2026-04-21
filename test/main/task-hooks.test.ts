import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { TaskHooks } from '../../src/main/task/task-hooks'
import type { Task } from '../../src/shared/types'

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: 't1',
    parentId: null,
    sessionId: 's1',
    source: 'test',
    title: 'Test',
    description: null,
    state: 'validating',
    policy: null,
    retryCount: 0,
    maxRetries: 2,
    result: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    ...overrides,
  }
}

describe('TaskHooks', () => {
  it('successful after_run hook (echo "ok")', async () => {
    const hooks = new TaskHooks()
    const task = makeTask({ policy: { hooks: { afterRun: 'echo "ok"' } } })
    const result = await hooks.runAfterRun(task, '/tmp')
    assert.equal(result.success, true)
    assert.equal(result.exitCode, 0)
    assert.equal(result.timedOut, false)
    assert.match(result.stdout.trim(), /ok/)
  })

  it('failing after_run hook (exit 1)', async () => {
    const hooks = new TaskHooks()
    const task = makeTask({ policy: { hooks: { afterRun: 'exit 1' } } })
    const result = await hooks.runAfterRun(task, '/tmp')
    assert.equal(result.success, false)
    assert.equal(result.exitCode, 1)
    assert.equal(result.timedOut, false)
  })

  it('no hook configured → success', async () => {
    const hooks = new TaskHooks()
    const task = makeTask()
    const result = await hooks.runAfterRun(task, '/tmp')
    assert.equal(result.success, true)
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
    assert.equal(result.timedOut, false)
  })

  it('before_run hook works', async () => {
    const hooks = new TaskHooks()
    const task = makeTask({ policy: { hooks: { beforeRun: 'echo "before"' } } })
    const result = await hooks.runBeforeRun(task, '/tmp')
    assert.equal(result.success, true)
    assert.equal(result.exitCode, 0)
    assert.match(result.stdout.trim(), /before/)
  })

  it('timeout handling (sleep 10, timeout 200ms)', async () => {
    const hooks = new TaskHooks()
    const task = makeTask({ policy: { hooks: { afterRun: 'sleep 10', timeout: 200 } } })
    const result = await hooks.runAfterRun(task, '/tmp')
    assert.equal(result.success, false)
    assert.equal(result.timedOut, true)
    assert.equal(result.exitCode, -1)
  })

  it('default hooks from config when task has no hook', async () => {
    const hooks = new TaskHooks({ afterRun: 'echo "default"' })
    const task = makeTask()
    const result = await hooks.runAfterRun(task, '/tmp')
    assert.equal(result.success, true)
    assert.match(result.stdout.trim(), /default/)
  })
})
