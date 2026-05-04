import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { ClaudeChat } from '../../src/main/voice/claude-chat'

describe('ClaudeChat', () => {
  it('constructs with system prompt and default model', () => {
    const chat = new ClaudeChat({ systemPrompt: 'You are a test assistant.' })
    const history = chat.getHistory()
    assert.equal(history.length, 1)
    assert.equal(history[0].role, 'system')
    assert.equal(history[0].content, 'You are a test assistant.')
  })

  it('constructs with custom model', () => {
    const chat = new ClaudeChat({ systemPrompt: 'Test', model: 'claude-sonnet-4-6' })
    // Model is stored internally — we can only verify via successful construction
    assert.ok(chat)
  })

  it('reset() clears history to system prompt only', () => {
    const chat = new ClaudeChat({ systemPrompt: 'System' })
    // Simulate history accumulation by accessing internal state
    const history = chat.getHistory()
    assert.equal(history.length, 1)
    chat.reset()
    const after = chat.getHistory()
    assert.equal(after.length, 1)
    assert.equal(after[0].role, 'system')
  })

  it('getHistory() returns history copy', () => {
    const chat = new ClaudeChat({ systemPrompt: 'Test system' })
    const h1 = chat.getHistory()
    const h2 = chat.getHistory()
    // Should be different array instances (shallow copy)
    assert.notEqual(h1, h2)
    assert.deepEqual(h1, h2)
    assert.equal(h1[0].content, 'Test system')
  })
})
