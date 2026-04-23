import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { escapeForTmux, findSessionByName } from '../../src/main/mcp/mcp-tools'
import type { SessionInfo } from '../../src/shared/types'

// ─── escapeForTmux ───────────────────────────────────────

describe('escapeForTmux', () => {
  it('should escape backslashes', () => {
    assert.equal(escapeForTmux('a\\b'), 'a\\\\b')
  })

  it('should escape double quotes', () => {
    assert.equal(escapeForTmux('say "hello"'), 'say \\"hello\\"')
  })

  it('should escape single quotes', () => {
    assert.equal(escapeForTmux("it's"), "it\\'s")
  })

  it('should escape semicolons', () => {
    assert.equal(escapeForTmux('a; b'), 'a\\; b')
  })

  it('should replace newlines with spaces', () => {
    assert.equal(escapeForTmux('line1\nline2'), 'line1 line2')
  })

  it('should handle multiple special characters together', () => {
    const input = 'echo "hello"; cat \'file\' \\ done\nend'
    const result = escapeForTmux(input)
    assert.ok(!result.includes('\n'), 'no raw newlines')
    assert.ok(result.includes('\\\\'), 'backslash escaped')
    assert.ok(result.includes('\\"'), 'double quote escaped')
    assert.ok(result.includes("\\'"), 'single quote escaped')
    assert.ok(result.includes('\\;'), 'semicolon escaped')
  })

  it('should use base64 encoding for messages longer than 500 chars', () => {
    const longText = 'x'.repeat(501)
    const result = escapeForTmux(longText)
    assert.ok(result.startsWith("echo '"), 'should start with echo')
    assert.ok(result.endsWith("' | base64 -d"), 'should end with base64 decode')
    // Verify the base64 portion decodes back to the original text
    const b64Part = result.slice("echo '".length, result.length - "' | base64 -d".length)
    const decoded = Buffer.from(b64Part, 'base64').toString('utf-8')
    assert.equal(decoded, longText)
  })

  it('should not use base64 for messages of exactly 500 chars', () => {
    const text = 'y'.repeat(500)
    const result = escapeForTmux(text)
    assert.ok(!result.includes('base64'), 'should not use base64 at boundary')
    assert.equal(result, text, 'plain text with no special chars should be unchanged')
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
