import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { findBestSession, startEntitySession } from '../../src/main/mcp/handoff-kernel'
import type { ToolContext } from '../../src/main/mcp/mcp-tools'
import type { StartSessionOpts } from '../../src/shared/types'

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

// d-beta listed first on purpose: an entityId-only filter that ignores
// workspace entirely would preserve array order and hand back d-beta as the
// first idle candidate for EVERY caller — including the ws-alpha caller
// below, which expects d-alpha. That ordering makes the first test below
// actually discriminate between "filters by workspace" and "filters by
// entityId only, workspace check is a no-op" instead of passing either way
// by accident of array position.
const SESSIONS: MockSession[] = [
  { id: 'd-beta', entityId: 'debugger', status: 'active', workspaceId: 'ws-beta', tmuxSession: 't2', tmuxPane: null },
  { id: 'd-alpha', entityId: 'debugger', status: 'active', workspaceId: 'ws-alpha', tmuxSession: 't1', tmuxPane: null },
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

// ─── startEntitySession — workspace forwarding ──────────────

/**
 * ctx for exercising startEntitySession(). It touches sessionManager.startEntity
 * (opts capture happens here), then unconditionally calls queueEntityClaude and
 * scheduleStartupGreeting inside a try/catch that swallows failures — stubbed
 * as no-ops so the test stays focused on the one thing under test: what opts
 * object reaches startEntity. windowManager stays null so the
 * SESSION_VISIBLE_ADD branch is skipped, same as the rest of this file.
 */
function ctxForStartEntity(workspaceId: string | null | undefined, captured: { opts?: Partial<StartSessionOpts> }): ToolContext {
  const sessionManager = {
    startEntity: async (entityId: string, opts: Partial<StartSessionOpts>) => {
      captured.opts = opts
      return { id: 'new-session', entityId, name: entityId, status: 'active' }
    },
    queueEntityClaude: () => {},
    scheduleStartupGreeting: () => {},
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

describe('startEntitySession — workspace forwarding', () => {
  it('forwards the caller workspace to sessionManager.startEntity', async () => {
    const captured: { opts?: Partial<StartSessionOpts> } = {}
    await startEntitySession(ctxForStartEntity('ws-beta', captured), 'debugger')
    assert.strictEqual(captured.opts?.workspaceId, 'ws-beta')
  })

  it('forwards null — not undefined — when ctx.workspaceId is unset', async () => {
    // ctx.workspaceId left `undefined` on purpose (field omitted), not
    // explicitly `null`. This is the case that actually exercises the
    // `?? null` normalization: if ctx.workspaceId were already `null`,
    // `null ?? null` and a bare pass-through both yield `null` and the
    // test could not tell a correct forward from a dropped fallback. Only
    // the `undefined` case distinguishes them, because startEntity/
    // resolveEntityWorkspace treats `undefined` as "resolve the active
    // workspace" and `null` as "stay explicitly unbound" — exactly the
    // silent-cross-workspace-leak this fallback exists to prevent.
    const captured: { opts?: Partial<StartSessionOpts> } = {}
    await startEntitySession(ctxForStartEntity(undefined, captured), 'debugger')
    assert.strictEqual(captured.opts?.workspaceId, null)
    assert.ok(
      captured.opts !== undefined && Object.prototype.hasOwnProperty.call(captured.opts, 'workspaceId'),
      'workspaceId key must be present, not merely absent-and-therefore-undefined',
    )
  })
})
