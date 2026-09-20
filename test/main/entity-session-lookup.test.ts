import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  findEntitySessions,
  hasActiveEntitySession,
  entityStartKey,
} = require('../../src/main/session/entity-session-lookup')

const SESSIONS = [
  { id: 's1', entityId: 'companion', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's2', entityId: 'companion', status: 'active', workspaceId: 'ws-beta' },
  { id: 's3', entityId: 'companion', status: 'exited', workspaceId: 'ws-alpha' },
  { id: 's4', entityId: 'debugger', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's5', entityId: 'audit', status: 'active', workspaceId: null },
  { id: 's6', entityId: 'audit', status: 'active' },
  { id: 's7', status: 'active', workspaceId: 'ws-alpha' },
]

describe('findEntitySessions', () => {
  it('matches only the requested entity in the requested workspace', () => {
    const found = findEntitySessions(SESSIONS, 'companion', 'ws-alpha')
    assert.deepEqual(found.map((s: any) => s.id), ['s1'])
  })

  it('does not leak sessions across workspaces', () => {
    const found = findEntitySessions(SESSIONS, 'companion', 'ws-beta')
    assert.deepEqual(found.map((s: any) => s.id), ['s2'])
  })

  it('ignores sessions that are not active', () => {
    const found = findEntitySessions(SESSIONS, 'companion', 'ws-alpha')
    assert.equal(found.some((s: any) => s.id === 's3'), false)
  })

  it('treats a missing workspaceId as unbound, same as null', () => {
    const found = findEntitySessions(SESSIONS, 'audit', null)
    assert.deepEqual(found.map((s: any) => s.id), ['s5', 's6'])
  })

  it('ignores sessions without an entityId', () => {
    const found = findEntitySessions(SESSIONS, 'companion', 'ws-alpha')
    assert.equal(found.some((s: any) => s.id === 's7'), false)
  })

  it('returns an empty array when nothing matches', () => {
    assert.deepEqual(findEntitySessions(SESSIONS, 'refinement', 'ws-alpha'), [])
  })
})

describe('hasActiveEntitySession', () => {
  it('is true where the entity runs', () => {
    assert.equal(hasActiveEntitySession(SESSIONS, 'debugger', 'ws-alpha'), true)
  })

  it('is false in a workspace where it does not run — this is what lets a singleInstance entity start a second time elsewhere', () => {
    assert.equal(hasActiveEntitySession(SESSIONS, 'debugger', 'ws-beta'), false)
  })

  it('is false for an unbound lookup when the entity only runs bound', () => {
    assert.equal(hasActiveEntitySession(SESSIONS, 'debugger', null), false)
  })
})

describe('entityStartKey', () => {
  it('separates the same entity across workspaces', () => {
    assert.notEqual(entityStartKey('companion', 'ws-alpha'), entityStartKey('companion', 'ws-beta'))
  })

  it('uses the _global sentinel when unbound', () => {
    assert.equal(entityStartKey('companion', null), 'companion@_global')
  })

  it('is stable for the same pair', () => {
    assert.equal(entityStartKey('companion', 'ws-alpha'), 'companion@ws-alpha')
  })
})
