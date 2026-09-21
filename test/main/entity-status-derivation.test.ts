import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deriveEntityStatus, findEntitySessionId, isEntityRunningIn } from '../../src/shared/entity-status'
import { GLOBAL_WORKSPACE_KEY } from '../../src/shared/workspace-key'

const SESSIONS = [
  { id: 's1', entityId: 'companion', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's2', entityId: 'companion', status: 'active', workspaceId: 'ws-beta' },
  { id: 's3', entityId: 'companion', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's4', entityId: 'debugger', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's5', entityId: 'audit', status: 'active', workspaceId: null },
  { id: 's6', entityId: 'refinement', status: 'exited', workspaceId: 'ws-alpha' },
  { id: 's7', status: 'active', workspaceId: 'ws-alpha' },
]

describe('deriveEntityStatus', () => {
  it('lists every workspace an entity runs in', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.deepEqual([...status.companion].sort(), ['ws-alpha', 'ws-beta'])
  })

  it('deduplicates two instances in the same workspace', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.equal(status.companion.filter((w: string) => w === 'ws-alpha').length, 1)
  })

  it('represents unbound sessions with the _global sentinel', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.deepEqual(status.audit, [GLOBAL_WORKSPACE_KEY])
  })

  it('omits entities whose sessions are not active', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.equal('refinement' in status, false)
  })

  it('ignores sessions without an entityId', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.equal(Object.values(status).flat().length, 4)
  })

  it('returns an empty object for an empty session list', () => {
    assert.deepEqual(deriveEntityStatus([]), {})
  })
})

describe('findEntitySessionId', () => {
  it('finds the session of an entity in a given workspace', () => {
    assert.equal(findEntitySessionId(SESSIONS, 'debugger', 'ws-alpha'), 's4')
  })

  it('returns null when the entity runs only elsewhere', () => {
    assert.equal(findEntitySessionId(SESSIONS, 'debugger', 'ws-beta'), null)
  })

  it('finds unbound sessions with a null lookup', () => {
    assert.equal(findEntitySessionId(SESSIONS, 'audit', null), 's5')
  })

  it('returns the first match when several instances run in one workspace', () => {
    assert.equal(findEntitySessionId(SESSIONS, 'companion', 'ws-alpha'), 's1')
  })

  // Fix round 1 (coordinator review, commit 333de16): unbound sessions
  // (workspaceId null → key _global) are visible from EVERY workspace, not
  // from none. Otherwise a running-but-unbound instance of a non-singleInstance
  // preset (companion/refinement/audit) reads as "not running" everywhere a
  // real workspace is active, and clicking it spawns a second instance instead
  // of focusing the existing one.

  it('finds an unbound session when a lookup for a real (non-null) workspace has no bound match', () => {
    // 'audit' in SESSIONS has only the unbound s5 — no session bound to ws-alpha.
    // Before the fix, strict keying returned null here.
    assert.equal(findEntitySessionId(SESSIONS, 'audit', 'ws-alpha'), 's5')
  })
})

describe('findEntitySessionId — unbound fallback is one-directional (fix round 1)', () => {
  // Kept in its own fixture, separate from SESSIONS above, so these additions
  // cannot perturb the already-reviewed assertions on that fixture (in
  // particular the exact-count assertions in the deriveEntityStatus block).
  //
  // Deliberately ordered bound-session-first, unbound-session-second: a naive
  // over-wide fix ("an entity's session matches from ANY workspace, not just
  // _global") would do a plain unfiltered find() and return the bound f2
  // first due to array order — which is exactly the leak the "does not leak"
  // test below must catch.
  const FALLBACK_SESSIONS = [
    { id: 'f2', entityId: 'watchdog', status: 'active', workspaceId: 'ws-alpha' }, // bound
    { id: 'f1', entityId: 'watchdog', status: 'active', workspaceId: null },       // unbound
  ]

  it('prefers a bound session over an unbound one when both exist for the same workspace', () => {
    assert.equal(findEntitySessionId(FALLBACK_SESSIONS, 'watchdog', 'ws-alpha'), 'f2')
  })

  it('does not leak a session bound to one workspace into a lookup for another workspace', () => {
    // ws-beta has neither a bound nor is it ws-alpha (where f2 lives). The correct
    // fallback is the unbound f1 — NOT f2. If this returns 'f2', the widening has
    // gone from "unbound -> every workspace" to "bound -> every OTHER workspace too",
    // which breaks the workspace isolation the whole multi-workspace-sessions plan
    // is about.
    assert.equal(findEntitySessionId(FALLBACK_SESSIONS, 'watchdog', 'ws-beta'), 'f1')
  })

  it('returns null for an entity with no sessions at all', () => {
    assert.equal(findEntitySessionId(FALLBACK_SESSIONS, 'nonexistent-entity', 'ws-alpha'), null)
  })
})

describe('isEntityRunningIn', () => {
  // This is the single source of truth for "is it running here?" — the
  // launcher card click, the workspace-chip picker, and app.tsx's collapsed
  // boolean map all have to agree, so this exercises every branch of the
  // rule directly rather than through a consuming component.
  const STATUS = {
    debugger: ['ws-alpha'],
    audit: [GLOBAL_WORKSPACE_KEY],
    'cyber-factory': ['ws-alpha', 'ws-beta'],
  }

  it('is true when the entity runs in the requested workspace', () => {
    assert.equal(isEntityRunningIn(STATUS, 'debugger', 'ws-alpha'), true)
  })

  it('is true when the entity runs only unbound (_global)', () => {
    assert.equal(isEntityRunningIn(STATUS, 'audit', 'ws-alpha'), true)
    assert.equal(isEntityRunningIn(STATUS, 'audit', null), true)
  })

  it('is false when the entity runs only in a different workspace', () => {
    assert.equal(isEntityRunningIn(STATUS, 'debugger', 'ws-beta'), false)
  })

  it('is false when the entity is not running at all', () => {
    assert.equal(isEntityRunningIn(STATUS, 'nonexistent', 'ws-alpha'), false)
  })

  it('is true when the requested workspace is null and the entity is bound to the _global key', () => {
    assert.equal(isEntityRunningIn(STATUS, 'audit', null), true)
  })

  it('is true for a multi-workspace entity checked against either of its workspaces', () => {
    assert.equal(isEntityRunningIn(STATUS, 'cyber-factory', 'ws-alpha'), true)
    assert.equal(isEntityRunningIn(STATUS, 'cyber-factory', 'ws-beta'), true)
  })
})
