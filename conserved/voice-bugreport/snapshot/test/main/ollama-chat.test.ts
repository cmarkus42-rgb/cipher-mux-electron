import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { OllamaChat } from '../../src/main/voice/ollama-chat'

describe('OllamaChat', () => {
  let chat: OllamaChat
  beforeEach(() => {
    chat = new OllamaChat({
      model: 'gemma3:4b',
      host: '127.0.0.1',
      port: 11433,
      systemPrompt: 'Du bist ein Test-Assistent.',
    })
  })

  it('initializes with system prompt in history', () => {
    const history = chat.getHistory()
    assert.equal(history.length, 1)
    assert.equal(history[0].role, 'system')
    assert.equal(history[0].content, 'Du bist ein Test-Assistent.')
  })

  it('builds correct message history after injections', () => {
    chat.injectAssistantMessage('Hallo, wie kann ich helfen?')
    chat.injectUserMessage('Ich habe einen Bug.')
    chat.injectAssistantMessage('Kannst du den Bug beschreiben?')
    const history = chat.getHistory()
    assert.equal(history.length, 4)
    assert.equal(history[1].role, 'assistant')
    assert.equal(history[2].role, 'user')
    assert.equal(history[3].role, 'assistant')
  })

  it('reset clears history except system prompt', () => {
    chat.injectUserMessage('test')
    chat.injectAssistantMessage('response')
    assert.equal(chat.getHistory().length, 3)
    chat.reset()
    const history = chat.getHistory()
    assert.equal(history.length, 1)
    assert.equal(history[0].role, 'system')
  })

  it('constructs correct URL', () => {
    assert.equal(chat.url, 'http://127.0.0.1:11433/api/chat')
  })
})
