import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { applyWorkspace } from '../../src/main/workspace/workspace-manager'
import type { Workspace, Persona } from '../../src/shared/persona-types'

const PERSONAS: Persona[] = [
  { id: 'orchestrator', name: 'Orchestrator', color: '#B8601A', builtin: true, defaultPrompt: 'coordinate' },
  { id: 'worker', name: 'Worker', color: '#6A6A72', builtin: true, defaultPrompt: 'execute tasks' },
  { id: 'empty', name: '(empty)', color: '#D4D4C8', builtin: true, defaultPrompt: '' },
]

function makeMockStarter() {
  const started: { name: string; projectPath: string; autoLaunch?: string; workspacePrompt?: string; contextPaths?: string[] }[] = []
  return {
    started,
    start: async (opts: { name: string; projectPath: string; autoLaunch?: string; workspacePrompt?: string; contextPaths?: string[] }) => {
      started.push(opts)
      return { id: `session-${started.length}` }
    },
  }
}

describe('applyWorkspace', () => {
  it('spawns sessions for cells with projects', async () => {
    const ws: Workspace = {
      id: 'test', name: 'Test', cols: 2, rows: 1,
      cells: [
        { persona: 'orchestrator', project: '/proj/a', prompt: '' },
        { persona: 'worker', project: '/proj/b', prompt: '' },
      ],
      merges: {}, promptOverrides: {},
    }
    const starter = makeMockStarter()
    let gridSize: { cols: number; rows: number } | null = null
    const result = await applyWorkspace(ws, PERSONAS, starter, (c, r) => { gridSize = { cols: c, rows: r } })

    assert.equal(result.applied, true)
    assert.equal(result.sessionsStarted, 2)
    assert.equal(result.warnings.length, 0)
    assert.deepEqual(gridSize, { cols: 2, rows: 1 })
    assert.equal(starter.started.length, 2)
    // Session name derived from project path
    assert.equal(starter.started[0].name, 'a')
    assert.equal(starter.started[0].projectPath, '/proj/a')
  })

  it('skips cells without projects', async () => {
    const ws: Workspace = {
      id: 'test', name: 'Test', cols: 2, rows: 1,
      cells: [
        { persona: 'orchestrator', project: '/proj/a', prompt: '' },
        { persona: 'empty', project: '', prompt: '' },
      ],
      merges: {}, promptOverrides: {},
    }
    const starter = makeMockStarter()
    const result = await applyWorkspace(ws, PERSONAS, starter, () => {})
    assert.equal(result.sessionsStarted, 1)
    assert.equal(starter.started.length, 1)
  })

  it('skips cells with no project without warning', async () => {
    const ws: Workspace = {
      id: 'test', name: 'Test', cols: 1, rows: 1,
      cells: [{ persona: 'worker', project: '', prompt: '' }],
      merges: {}, promptOverrides: {},
    }
    const starter = makeMockStarter()
    const result = await applyWorkspace(ws, PERSONAS, starter, () => {})
    assert.equal(result.sessionsStarted, 0)
  })

  it('starts sessions even with unknown persona (only project matters now)', async () => {
    const ws: Workspace = {
      id: 'test', name: 'Test', cols: 1, rows: 1,
      cells: [{ persona: 'unknown-persona', project: '/proj/a', prompt: '' }],
      merges: {}, promptOverrides: {},
    }
    const starter = makeMockStarter()
    const result = await applyWorkspace(ws, PERSONAS, starter, () => {})
    assert.equal(result.sessionsStarted, 1)
  })

  it('passes workspace-level prompt as workspacePrompt (not in autoLaunch CLI arg)', async () => {
    const ws: Workspace = {
      id: 'test', name: 'Test', cols: 1, rows: 1,
      cells: [{ persona: 'worker', project: '/proj/a', prompt: '' }],
      merges: {}, promptOverrides: {},
      workspacePrompt: 'run tests',
    }
    const starter = makeMockStarter()
    await applyWorkspace(ws, PERSONAS, starter, () => {})
    assert.equal(starter.started[0].workspacePrompt, 'run tests')
    assert.ok(!starter.started[0].autoLaunch?.includes('run tests'))
    assert.ok(starter.started[0].autoLaunch?.includes('--dangerously-skip-permissions'))
    assert.ok(starter.started[0].autoLaunch?.startsWith('clear;'))
  })

  it('cell prompt overrides workspace prompt', async () => {
    const ws: Workspace = {
      id: 'test', name: 'Test', cols: 1, rows: 1,
      cells: [{ persona: 'worker', project: '/proj/a', prompt: 'cell prompt' }],
      merges: {}, promptOverrides: {},
      workspacePrompt: 'ws prompt',
    }
    const starter = makeMockStarter()
    await applyWorkspace(ws, PERSONAS, starter, () => {})
    assert.equal(starter.started[0].workspacePrompt, 'cell prompt')
  })

  it('returns session IDs mapped to cell indices', async () => {
    const ws: Workspace = {
      id: 'test', name: 'Test', cols: 2, rows: 1,
      cells: [
        { persona: 'orchestrator', project: '/proj/a', prompt: '' },
        { persona: 'worker', project: '/proj/b', prompt: '' },
      ],
      merges: {}, promptOverrides: {},
    }
    const starter = makeMockStarter()
    const result = await applyWorkspace(ws, PERSONAS, starter, () => {})
    assert.equal(result.sessions.length, 2)
    assert.equal(result.sessions[0].cellIndex, 0)
    assert.equal(result.sessions[0].sessionId, 'session-1')
    assert.equal(result.sessions[1].cellIndex, 1)
    assert.equal(result.sessions[1].sessionId, 'session-2')
  })

  it('skips hidden cells in merged areas', async () => {
    const ws: Workspace = {
      id: 'test', name: 'Test', cols: 1, rows: 2,
      cells: [
        { persona: 'orchestrator', project: '/proj/a', prompt: '' },
        { persona: 'worker', project: '/proj/b', prompt: '' },
      ],
      merges: { '0:0': true },
      promptOverrides: {},
    }
    const starter = makeMockStarter()
    const result = await applyWorkspace(ws, PERSONAS, starter, () => {})
    assert.equal(result.sessionsStarted, 1)
    assert.equal(starter.started.length, 1)
    assert.equal(starter.started[0].projectPath, '/proj/a')
  })

  it('catches start failures and adds warning', async () => {
    const ws: Workspace = {
      id: 'test', name: 'Test', cols: 1, rows: 1,
      cells: [{ persona: 'worker', project: '/proj/a', prompt: '' }],
      merges: {}, promptOverrides: {},
    }
    const failStarter = {
      start: async () => { throw new Error('tmux failed') },
    }
    const result = await applyWorkspace(ws, PERSONAS, failStarter, () => {})
    assert.equal(result.sessionsStarted, 0)
    assert.equal(result.warnings.length, 1)
    assert.ok(result.warnings[0].includes('tmux failed'))
  })
})
