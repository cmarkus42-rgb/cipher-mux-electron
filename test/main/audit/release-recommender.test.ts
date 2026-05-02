import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateReleaseRecommendation } from '../../../src/main/audit/release-recommender'
import type { AuditFinding } from '../../../src/main/audit/types'

describe('release-recommender', () => {
  const makeFinding = (severity: 'critical' | 'high' | 'medium' | 'low'): AuditFinding => ({
    id: `f-${Math.random()}`, runId: 'r1', severity, category: 'security',
    filePath: null, lineNumber: null, description: 'test', recommendation: 'fix',
  })

  it('release when no high and <=3 medium', () => {
    const rec = generateReleaseRecommendation('r1', [makeFinding('medium'), makeFinding('low')])
    assert.equal(rec.verdict, 'release')
  })

  it('release-after-fix when 4-10 medium', () => {
    const findings = Array.from({ length: 5 }, () => makeFinding('medium'))
    const rec = generateReleaseRecommendation('r1', findings)
    assert.equal(rec.verdict, 'release-after-fix')
  })

  it('blocked when >10 medium', () => {
    const findings = Array.from({ length: 11 }, () => makeFinding('medium'))
    const rec = generateReleaseRecommendation('r1', findings)
    assert.equal(rec.verdict, 'blocked')
  })

  it('blocked when any high', () => {
    const rec = generateReleaseRecommendation('r1', [makeFinding('high')])
    assert.equal(rec.verdict, 'blocked')
  })

  it('blocked when critical', () => {
    const rec = generateReleaseRecommendation('r1', [makeFinding('critical')])
    assert.equal(rec.verdict, 'blocked')
  })

  it('release when clean', () => {
    const rec = generateReleaseRecommendation('r1', [])
    assert.equal(rec.verdict, 'release')
    assert.ok(rec.rationale.includes('Sauber'))
  })
})
