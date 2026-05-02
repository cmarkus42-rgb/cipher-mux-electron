import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateProbeSpecs, probeCount } from '../../../src/main/testing-assistant/adversarial-prober'

describe('adversarial-prober', () => {
  it('shallow depth produces at least 2 categories', () => {
    const specs = generateProbeSpecs('shallow')
    assert.ok(specs.length >= 4)
    const cats = new Set(specs.map(s => s.category))
    assert.ok(cats.has('empty-input'))
    assert.ok(cats.has('boundary-conditions'))
  })

  it('standard depth includes unicode + unauthorized', () => {
    const specs = generateProbeSpecs('standard')
    const cats = new Set(specs.map(s => s.category))
    assert.ok(cats.has('unicode'))
    assert.ok(cats.has('unauthorized-access'))
  })

  it('deep depth includes race-conditions + auth-bypass', () => {
    const specs = generateProbeSpecs('deep')
    const cats = new Set(specs.map(s => s.category))
    assert.ok(cats.has('race-conditions'))
    assert.ok(cats.has('auth-bypass'))
  })

  it('probeCount matches specs length', () => {
    assert.equal(probeCount('standard'), generateProbeSpecs('standard').length)
  })
})
