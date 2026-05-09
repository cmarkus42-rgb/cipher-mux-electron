/**
 * Tests for TTS Focus Gate (REQ-TTSLV-001).
 * mux_tts_speak should only produce output when the calling session
 * is in the focused cell. Non-focused sessions are silently skipped.
 */
import { describe, it, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'

/**
 * Extracted focus-gate logic from mux_tts_speak tool handler.
 * Returns true if TTS should proceed, false if it should be skipped.
 */
function shouldAllowTts(args: { sessionId?: string }, getFocusedSessionId?: () => string | null): boolean {
  // No focus gate configured → allow (backward compat)
  if (!getFocusedSessionId) return true
  // Caller didn't pass sessionId → allow (backward compat for voice-relay etc.)
  if (!args.sessionId) return true
  const focusedId = getFocusedSessionId()
  // No focused session → allow (nothing to gate against)
  if (!focusedId) return true
  // Gate: only allow if caller is the focused session
  return args.sessionId === focusedId
}

describe('TTS Focus Gate', () => {
  let focusedId: string | null

  beforeEach(() => {
    focusedId = null
  })

  const getFocused = () => focusedId

  it('allows TTS when no getFocusedSessionId is configured', () => {
    assert.ok(shouldAllowTts({ sessionId: 'sess-1' }))
  })

  it('allows TTS when caller does not pass sessionId (backward compat)', () => {
    focusedId = 'sess-2'
    assert.ok(shouldAllowTts({}, getFocused))
  })

  it('allows TTS when no session is focused', () => {
    focusedId = null
    assert.ok(shouldAllowTts({ sessionId: 'sess-1' }, getFocused))
  })

  it('allows TTS when caller IS the focused session', () => {
    focusedId = 'sess-1'
    assert.ok(shouldAllowTts({ sessionId: 'sess-1' }, getFocused))
  })

  it('blocks TTS when caller is NOT the focused session', () => {
    focusedId = 'sess-2'
    assert.equal(shouldAllowTts({ sessionId: 'sess-1' }, getFocused), false)
  })

  it('blocks TTS for any non-focused session', () => {
    focusedId = 'focused-session'
    assert.equal(shouldAllowTts({ sessionId: 'background-worker-1' }, getFocused), false)
    assert.equal(shouldAllowTts({ sessionId: 'background-worker-2' }, getFocused), false)
    // But focused session passes
    assert.ok(shouldAllowTts({ sessionId: 'focused-session' }, getFocused))
  })
})
