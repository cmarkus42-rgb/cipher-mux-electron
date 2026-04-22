import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CODING_BIAS_PROMPT } from '../../src/main/voice/stt-engine'

describe('STT Engine — coding bias prompt', () => {
  it('exports a non-empty coding bias prompt string', () => {
    assert.ok(typeof CODING_BIAS_PROMPT === 'string')
    assert.ok(CODING_BIAS_PROMPT.length > 20)
  })

  it('contains key programming terms', () => {
    assert.ok(CODING_BIAS_PROMPT.includes('function'))
    assert.ok(CODING_BIAS_PROMPT.includes('TypeScript'))
    assert.ok(CODING_BIAS_PROMPT.includes('async'))
    assert.ok(CODING_BIAS_PROMPT.includes('interface'))
  })
})
