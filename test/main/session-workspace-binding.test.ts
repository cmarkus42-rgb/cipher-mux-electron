import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { toPersistedSession } = require('../../src/main/session/session-store')

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
