import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toPersistedSession, type PersistedSession } from '../../src/main/session/session-store'
import { SessionManager } from '../../src/main/session/session-manager'
import { resolveRestoredWorkspaceId } from '../../src/main/session/resolve-restored-workspace'
import type { SessionInfo } from '../../src/shared/types'

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: '01J000000000000000000001',
    name: 'Companion',
    projectPath: '/tmp/x',
    tmuxSession: 'cmux-companion-0001',
    tmuxPane: '%1',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('toPersistedSession', () => {
  it('carries workspaceId through to the persisted shape', () => {
    const ps = toPersistedSession(session({ workspaceId: 'ws-alpha' }), null)
    assert.equal(ps.workspaceId, 'ws-alpha')
  })

  it('maps a missing workspaceId to null, never undefined', () => {
    const ps = toPersistedSession(session(), null)
    assert.equal(ps.workspaceId, null)
    assert.ok('workspaceId' in ps)
  })

  it('maps a missing entityId to null (existing behaviour, guarded)', () => {
    const ps = toPersistedSession(session(), null)
    assert.equal(ps.entityId, null)
  })

  it('passes the grid slot through unchanged', () => {
    const ps = toPersistedSession(session({ workspaceId: 'ws-beta' }), 3)
    assert.equal(ps.gridSlot, 3)
    assert.equal(ps.workspaceId, 'ws-beta')
  })
})

// ─── SessionManager.bindWorkspace ────────────────────────────────
//
// bindWorkspace() only touches the in-memory `sessions` Map and calls the
// private persistSession() → toPersistedSession() → sessionStore.upsertSession()
// chain. Object.create(SessionManager.prototype) gives us a real instance
// (so private methods resolve correctly) without running the constructor —
// no TmuxManager, AdapterRegistry, or real SessionStore/disk I/O needed.

function makeBoundManager() {
  const sessions = new Map<string, SessionInfo>()
  const upserted: PersistedSession[] = []
  const manager = Object.create(SessionManager.prototype) as SessionManager
  ;(manager as unknown as { sessions: Map<string, SessionInfo> }).sessions = sessions
  ;(manager as unknown as { sessionStore: { upsertSession: (ps: PersistedSession) => void } }).sessionStore = {
    upsertSession: (ps: PersistedSession) => { upserted.push(ps) },
  }
  return { manager, sessions, upserted }
}

describe('SessionManager.bindWorkspace', () => {
  it('rebinding an existing session updates workspaceId and persists', () => {
    const { manager, sessions, upserted } = makeBoundManager()
    const s: SessionInfo = {
      id: 'sess-1',
      name: 'Companion',
      projectPath: '/tmp/x',
      tmuxSession: 'cmux-companion-0001',
      tmuxPane: '%1',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
      workspaceId: 'ws-old',
    }
    sessions.set(s.id, s)

    manager.bindWorkspace('sess-1', 'ws-new')

    assert.equal(sessions.get('sess-1')?.workspaceId, 'ws-new')
    assert.equal(upserted.length, 1)
  })

  it('an unknown session id is a no-op and does not throw', () => {
    const { manager, sessions, upserted } = makeBoundManager()
    assert.doesNotThrow(() => manager.bindWorkspace('does-not-exist', 'ws-new'))
    assert.equal(sessions.size, 0)
    assert.equal(upserted.length, 0)
  })

  it('workspaceId survives the mapping through toPersistedSession', () => {
    const { manager, sessions, upserted } = makeBoundManager()
    const s: SessionInfo = {
      id: 'sess-2',
      name: 'Worker',
      projectPath: '/tmp/y',
      tmuxSession: 'cmux-worker-0001',
      tmuxPane: '%2',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    }
    sessions.set(s.id, s)

    manager.bindWorkspace('sess-2', 'ws-persisted')

    assert.equal(upserted.length, 1)
    assert.equal(upserted[0].workspaceId, 'ws-persisted')
  })
})

// ─── resolveRestoredWorkspaceId ───────────────────────────────────
//
// Pure resolution rule used by restoreKeepWorkingFromRecovery() in
// ipc-hub.ts when re-binding a recovered session to a workspace. Pinned
// here directly since IpcHub itself isn't cheaply constructible in a unit
// test (tmux, MCP server, window manager, ...).
//
// The recovered session's own binding (from sessions.json, via recover())
// wins — it's the continuously-maintained, structured record. The snapshot
// entry (written once at quit, matched back to sessions heuristically by
// name/projectPath) is only a fallback for when the recovered session has
// no binding of its own.

describe('resolveRestoredWorkspaceId', () => {
  it('protects against a projectPath-fallback mismatch: match wins over a different entry value', () => {
    assert.equal(resolveRestoredWorkspaceId('ws-from-match', 'ws-from-entry'), 'ws-from-match')
  })

  it('old-snapshot case: match wins when the entry has no workspaceId key at all', () => {
    assert.equal(resolveRestoredWorkspaceId('ws-from-match', undefined), 'ws-from-match')
  })

  it('pre-upgrade sessions.json fallback: entry wins when match has no binding', () => {
    assert.equal(resolveRestoredWorkspaceId(null, 'ws-from-entry'), 'ws-from-entry')
  })

  it('resolves to null when match is explicitly unbound and the entry agrees', () => {
    assert.equal(resolveRestoredWorkspaceId(null, null), null)
  })

  it('resolves to null when match has no binding and the entry has no key either', () => {
    assert.equal(resolveRestoredWorkspaceId(null, undefined), null)
  })
})
