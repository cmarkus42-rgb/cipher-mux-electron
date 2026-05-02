import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEBUGGER_DEFAULTS } from '../../../src/main/debugger/types'

describe('debugger/types', () => {
  it('DEBUGGER_DEFAULTS has expected shape', () => {
    assert.equal(DEBUGGER_DEFAULTS.enabled, false)
    assert.equal(DEBUGGER_DEFAULTS.maxRetries, 2)
    assert.equal(DEBUGGER_DEFAULTS.qualityGate, 'strict')
    assert.equal(DEBUGGER_DEFAULTS.walkthroughDefaultOffer, true)
  })

  it('DEBUGGER_DEFAULTS is frozen', () => {
    assert.throws(() => {
      ;(DEBUGGER_DEFAULTS as any).enabled = true
    })
  })
})
