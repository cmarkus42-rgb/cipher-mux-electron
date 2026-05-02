import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TESTING_ASSISTANT_DEFAULTS } from '../../../src/main/testing-assistant/types'

describe('testing-assistant/types', () => {
  it('TESTING_ASSISTANT_DEFAULTS has all required fields', () => {
    assert.equal(TESTING_ASSISTANT_DEFAULTS.enabled, false)
    assert.equal(TESTING_ASSISTANT_DEFAULTS.adversarialDepth, 'standard')
    assert.equal(TESTING_ASSISTANT_DEFAULTS.owaspChecks, true)
    assert.equal(TESTING_ASSISTANT_DEFAULTS.autoHandoffOnSeverityHigh, true)
  })

  it('defaults are frozen', () => {
    assert.throws(() => {
      ;(TESTING_ASSISTANT_DEFAULTS as any).enabled = true
    })
  })
})
