import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { findBestSession } from '../../src/main/mcp/handoff-kernel'
import type { ToolContext } from '../../src/main/mcp/mcp-tools'

/**
 * Minimal ToolContext stand-in.
 * isBusy() (handoff-kernel.ts) reads (sessionManager as any).tmux.getPaneCommand()
 * with `session.tmuxPane ?? session.tmuxSession` as the target, and treats a
 * command containing 'claude' as busy.
 */
interface MockSession {
  id: string
  entityId: string
  status: string
  workspaceId: string | null
  tmuxSession: string
  tmuxPane?: string | null
}

function ctxWith(sessions: MockSession[], workspaceId: string | null, busyTargets: string[] = []): ToolContext {
  const sessionManager = {
    list: () => sessions,
    getEntityRegistry: () => ({
      get: (id: string) => ({ id, displayName: id, singleInstance: id === 'debugger' }),
    }),
    tmux: {
      getPaneCommand: async (target: string) =>
        busyTargets.includes(target) ? 'claude' : 'zsh',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  return {
    workspaceId,
    sessionManager,
    messageBus: null,
    statusLineMonitor: null,
    kickoffWorkshop: null,
    taskManager: null,
    windowManager: null,
    noteManager: null,
    noteSearchIndex: null,
    memoryStore: null,
    tagClassRepo: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const SESSIONS: MockSession[] = [
  { id: 'd-alpha', entityId: 'debugger', status: 'active', workspaceId: 'ws-alpha', tmuxSession: 't1', tmuxPane: null },
  { id: 'd-beta', entityId: 'debugger', status: 'active', workspaceId: 'ws-beta', tmuxSession: 't2', tmuxPane: null },
]

describe('findBestSession — workspace isolation', () => {
  it('picks the entity session in the caller workspace', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, 'ws-alpha'), 'debugger')
    assert.equal(result?.session.id, 'd-alpha')
  })

  it('picks the other workspace when the caller sits there', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, 'ws-beta'), 'debugger')
    assert.equal(result?.session.id, 'd-beta')
  })

  it('returns null when the entity runs only in a foreign workspace — the caller must start its own', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, 'ws-gamma'), 'debugger')
    assert.equal(result, null)
  })

  it('an unbound caller does not reach into bound sessions', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, null), 'debugger')
    assert.equal(result, null)
  })

  it('an unbound caller finds unbound sessions', async () => {
    const sessions: MockSession[] = [
      { id: 'd-global', entityId: 'debugger', status: 'active', workspaceId: null, tmuxSession: 't3' },
    ]
    const result = await findBestSession(ctxWith(sessions, null), 'debugger')
    assert.equal(result?.session.id, 'd-global')
  })

  it('returns null when no session of that entity exists at all', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, 'ws-alpha'), 'refinement')
    assert.equal(result, null)
  })
})
