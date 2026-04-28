import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { escapeForTmux, findSessionByName } from '../../src/main/mcp/mcp-tools'
import type { SessionInfo } from '../../src/shared/types'

// ─── escapeForTmux ───────────────────────────────────────

describe('escapeForTmux', () => {
  it('should escape backslashes', () => {
    assert.equal(escapeForTmux('a\\b'), 'a\\\\b')
  })

  it('should escape semicolons', () => {
    assert.equal(escapeForTmux('a; b'), 'a\\; b')
  })

  it('should preserve quotes and newlines (hex path handles them)', () => {
    assert.equal(escapeForTmux('say "hello"'), 'say "hello"')
    assert.equal(escapeForTmux("it's"), "it's")
    assert.equal(escapeForTmux('line1\nline2'), 'line1\nline2')
  })

  it('should not use base64 for long messages', () => {
    const longText = 'x'.repeat(501)
    const result = escapeForTmux(longText)
    assert.ok(!result.includes('base64'), 'no base64 encoding')
    assert.equal(result, longText, 'long text without special chars is unchanged')
  })

  it('should handle combined special characters', () => {
    const result = escapeForTmux('echo "hello"; cat \\ done')
    assert.ok(result.includes('\\\\'), 'backslash escaped')
    assert.ok(result.includes('\\;'), 'semicolon escaped')
    assert.ok(result.includes('"hello"'), 'quotes preserved')
  })
})

// ─── findSessionByName ───────────────────────────────────

describe('findSessionByName', () => {
  // Minimal mock implementing the list() method used by findSessionByName
  function mockSessionManager(sessions: SessionInfo[]) {
    return {
      list: () => sessions,
    } as unknown as import('../../src/main/session/session-manager').SessionManager
  }

  const sessions: SessionInfo[] = [
    {
      id: 'ULID-001',
      name: 'Worker-1',
      projectPath: '/tmp/proj1',
      tmuxSession: 'cmux-abcd1234',
      tmuxPane: null,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'ULID-002',
      name: 'Orchestrator',
      projectPath: '/tmp/orch',
      tmuxSession: 'cmux-efgh5678',
      tmuxPane: null,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]

  it('should find session by display name', () => {
    const sm = mockSessionManager(sessions)
    const result = findSessionByName(sm, 'Worker-1')
    assert.equal(result, 'ULID-001')
  })

  it('should find session by tmux session name', () => {
    const sm = mockSessionManager(sessions)
    const result = findSessionByName(sm, 'cmux-abcd1234')
    assert.equal(result, 'ULID-001')
  })

  it('should return null for unknown name', () => {
    const sm = mockSessionManager(sessions)
    const result = findSessionByName(sm, 'nonexistent')
    assert.equal(result, null)
  })

  it('should return null for empty session list', () => {
    const sm = mockSessionManager([])
    const result = findSessionByName(sm, 'Worker-1')
    assert.equal(result, null)
  })
})
