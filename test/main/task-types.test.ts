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
