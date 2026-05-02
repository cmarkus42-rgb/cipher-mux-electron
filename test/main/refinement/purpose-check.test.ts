import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyPurpose } from '../../../src/main/refinement/purpose-check'

describe('classifyPurpose', () => {
  it('detects commercial purpose from customer keywords', () => {
    const result = classifyPurpose('Ein SaaS-Produkt fuer unsere Kunden mit Pricing-Modell.')
    assert.equal(result.suggestedPurpose, 'commercial')
    assert.ok(result.signals.length > 0)
    assert.ok(result.licenseRecommendation.length > 0)
  })

  it('detects oss-release purpose', () => {
    const result = classifyPurpose('Open Source CLI-Tool, npm publish, community contributions.')
    assert.equal(result.suggestedPurpose, 'oss-release')
  })

  it('detects internal purpose', () => {
    const result = classifyPurpose('Internes Backoffice-Tool fuer die Abteilung.')
    assert.equal(result.suggestedPurpose, 'internal')
  })

  it('detects personal purpose', () => {
    const result = classifyPurpose('Ein persoenliches Tool nur fuer mich.')
    assert.equal(result.suggestedPurpose, 'personal')
  })

  it('detects hobby purpose', () => {
    const result = classifyPurpose('Hobby-Projekt zum Ausprobieren und Lernen.')
    assert.equal(result.suggestedPurpose, 'hobby')
  })

  it('falls back to personal when no signals found', () => {
    const result = classifyPurpose('Ein Tool.')
    assert.equal(result.suggestedPurpose, 'personal')
    assert.equal(result.confidence, 'low')
  })

  it('higher-weight signals win over lower-weight', () => {
    // commercial (weight 3) vs hobby (weight 1)
    const result = classifyPurpose('Ein Hobby-Projekt mit SaaS-Kunden und Pricing.')
    assert.equal(result.suggestedPurpose, 'commercial')
  })

  it('high confidence when many matching keywords', () => {
    const result = classifyPurpose('Open Source community contributors public repo npm publish OSS.')
    assert.equal(result.confidence, 'high')
  })

  it('provides license notes for every purpose', () => {
    for (const desc of ['Kunden SaaS', 'Open Source', 'intern team', 'persoenlich', 'hobby spass']) {
      const result = classifyPurpose(desc)
      assert.ok(result.licenseNotes.length > 0, `license notes for "${desc}"`)
    }
  })
})
