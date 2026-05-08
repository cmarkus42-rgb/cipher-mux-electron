import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { resolveSessionTopic, extractPromptFromCapture } from '../../src/main/session/resolve-session-topic'

describe('resolveSessionTopic', () => {
  const baseSession = { id: 's1', name: 'Worker-1', projectPath: '/home/user/my-project', entityId: undefined as string | undefined }

  it('returns running task title when available', () => {
    const tasks = [
      { title: 'Bugfix-Welle 2 — UI/Layout', state: 'running' as const, sessionId: 's1', updatedAt: 100 },
    ]
    const result = resolveSessionTopic(baseSession, tasks, undefined)
    assert.equal(result, 'Bugfix-Welle 2 — UI/Layout')
  })

  it('prefers running over completed tasks', () => {
    const tasks = [
      { title: 'Old completed task', state: 'completed' as const, sessionId: 's1', updatedAt: 50 },
      { title: 'Active work', state: 'running' as const, sessionId: 's1', updatedAt: 100 },
    ]
    const result = resolveSessionTopic(baseSession, tasks, undefined)
    assert.equal(result, 'Active work')
  })

  it('falls back to most recent completed task', () => {
    const tasks = [
      { title: 'Earlier task', state: 'completed' as const, sessionId: 's1', updatedAt: 50 },
      { title: 'Latest task', state: 'completed' as const, sessionId: 's1', updatedAt: 100 },
    ]
    const result = resolveSessionTopic(baseSession, tasks, undefined)
    assert.equal(result, 'Latest task')
  })

  it('falls back to tmux capture when no tasks', () => {
    const capture = '\n\n> implement the grid resize handler\n\n$'
    const result = resolveSessionTopic(baseSession, [], capture)
    assert.equal(result, 'implement the grid resize handler')
  })

  it('falls back to project basename when no tasks and no capture', () => {
    const result = resolveSessionTopic(baseSession, [], undefined)
    assert.equal(result, 'my-project')
  })

  it('prefixes entity name when entityId is set', () => {
    const session = { ...baseSession, entityId: 'cyber-factory' }
    const tasks = [
      { title: 'Bugfix-Welle 2', state: 'running' as const, sessionId: 's1', updatedAt: 100 },
    ]
    const result = resolveSessionTopic(session, tasks, undefined)
    assert.equal(result, 'Cyber Factory — Bugfix-Welle 2')
  })

  it('uses separator dot for entity fallback without task', () => {
    const session = { ...baseSession, entityId: 'orchestrator' }
    const result = resolveSessionTopic(session, [], undefined)
    assert.equal(result, 'Orchestrator · my-project')
  })
})

describe('extractPromptFromCapture', () => {
  it('extracts substantive line from capture', () => {
    const capture = 'some output\n\nrefactor the useGrid hook to support dynamic columns\n> '
    assert.equal(extractPromptFromCapture(capture), 'refactor the useGrid hook to support dynamic columns')
  })

  it('skips short filler words', () => {
    const capture = 'output\nja\nok\nweiter\nimplement session topic feature\n> '
    assert.equal(extractPromptFromCapture(capture), 'implement session topic feature')
  })

  it('returns undefined when only filler', () => {
    const capture = '\nja\nok\n\n'
    assert.equal(extractPromptFromCapture(capture), undefined)
  })

  it('truncates long lines to 80 chars', () => {
    const long = 'a'.repeat(120)
    const capture = `${long}\n`
    const result = extractPromptFromCapture(capture)
    assert.ok(result)
    assert.equal(result.length, 80)
  })

  it('strips leading prompt markers', () => {
    const capture = '> implement the new feature\n'
    assert.equal(extractPromptFromCapture(capture), 'implement the new feature')
  })
})
