import { test } from 'node:test'
import assert from 'assert/strict'
import { CYBER_FACTORY_DEFAULTS } from '../../../src/main/cyber-factory/types.js'

test('CYBER_FACTORY_DEFAULTS — top-level scalar fields', () => {
  assert.equal(CYBER_FACTORY_DEFAULTS.enabled, true)
  assert.equal(CYBER_FACTORY_DEFAULTS.maxParallelWorkers, 5)
  assert.equal(CYBER_FACTORY_DEFAULTS.defaultRetries, 2)
  assert.equal(CYBER_FACTORY_DEFAULTS.budgetMultiplier, 1.0)
  assert.equal(CYBER_FACTORY_DEFAULTS.monitoringIntervalMs, 300_000)
  assert.equal(CYBER_FACTORY_DEFAULTS.budgetEscalationThreshold, 0.8)
  assert.equal(CYBER_FACTORY_DEFAULTS.budgetAutoPauseThreshold, 0.95)
})

test('CYBER_FACTORY_DEFAULTS — model routing haiku tasks', () => {
  const r = CYBER_FACTORY_DEFAULTS.modelRouting
  assert.equal(r.trivial, 'haiku')
  assert.equal(r.boilerplate, 'haiku')
  assert.equal(r.tests, 'haiku')
  assert.equal(r.docs, 'haiku')
})

test('CYBER_FACTORY_DEFAULTS — model routing sonnet tasks', () => {
  const r = CYBER_FACTORY_DEFAULTS.modelRouting
  assert.equal(r.refactor, 'sonnet')
  assert.equal(r.business_logic, 'sonnet')
  assert.equal(r.bug_fix, 'sonnet')
  assert.equal(r.adversarial, 'sonnet')
})

test('CYBER_FACTORY_DEFAULTS — model routing opus tasks', () => {
  const r = CYBER_FACTORY_DEFAULTS.modelRouting
  assert.equal(r.architecture, 'opus')
  assert.equal(r.high_risk_domain, 'opus')
  assert.equal(r.audit_full, 'opus')
})

test('CYBER_FACTORY_DEFAULTS — model routing covers all 11 sub-project types', () => {
  const r = CYBER_FACTORY_DEFAULTS.modelRouting
  const keys = Object.keys(r)
  assert.equal(keys.length, 11)
  for (const key of keys) {
    const val = r[key as keyof typeof r]
    assert.ok(
      val === 'haiku' || val === 'sonnet' || val === 'opus',
      `${key} has unexpected value: ${val}`
    )
  }
})

test('CYBER_FACTORY_DEFAULTS — stuck detection thresholds', () => {
  const sd = CYBER_FACTORY_DEFAULTS.stuckDetection
  assert.equal(sd.heartbeatTimeoutMs, 7 * 60 * 1000)
  assert.equal(sd.outputPlateauMs, 3 * 60 * 1000)
  assert.equal(sd.minOutputCharsInPlateau, 100)
})
