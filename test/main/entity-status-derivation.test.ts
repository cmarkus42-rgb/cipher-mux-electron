import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deriveEntityStatus, findEntitySessionId } from '../../src/shared/entity-status'
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
})
