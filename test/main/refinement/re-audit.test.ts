import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  auditRequirements,
  REQUIRED_FIELDS,
  NFR_CATEGORIES,
} from '../../../src/main/refinement/re-audit'

describe('auditRequirements', () => {
  const completePackage = `
## Projektziel
Ein CLI-Tool zum Sortieren von Dateien.

## Zielgruppe
Entwickler, die ihre Downloads-Ordner organisieren wollen.

## Funktionale Anforderungen
- Dateien nach Typ sortieren
- Konfigurierbare Regeln

## Meta-Requirements
Stack: Node.js, TypeScript

## Wirksamkeits-Test
Manuell: Ordner mit 50 Dateien sortieren, alle korrekt zugeordnet.

## Ausgeschlossener Scope
Keine GUI, kein Cloud-Sync.
`

  it('passes when all required fields are present', () => {
    const result = auditRequirements(completePackage, 'basic')
    assert.equal(result.requiredFieldsMissing.length, 0)
    assert.equal(result.requiredFieldsPresent.length, REQUIRED_FIELDS.length)
  })

  it('detects missing required fields', () => {
    const partial = `
## Projektziel
Ein Tool.

## Funktionale Anforderungen
- Feature A
`
    const result = auditRequirements(partial, 'basic')
    assert.ok(result.requiredFieldsMissing.includes('Zielgruppe'))
    assert.ok(result.requiredFieldsMissing.includes('Wirksamkeits-Test'))
    assert.ok(result.requiredFieldsMissing.includes('Ausgeschlossener Scope'))
    assert.ok(result.requiredFieldsMissing.includes('Meta-Requirements'))
    assert.equal(result.overallStatus, 'critical-gaps')
  })

  it('all missing fields produce high-severity findings', () => {
    const result = auditRequirements('', 'basic')
    const missingFieldFindings = result.findings.filter(f => f.category === 'missing-field')
    assert.equal(missingFieldFindings.length, REQUIRED_FIELDS.length)
    for (const f of missingFieldFindings) {
      assert.equal(f.severity, 'high')
    }
  })

  it('standard depth checks NFR categories', () => {
    const result = auditRequirements(completePackage, 'standard')
    const nfrFindings = result.findings.filter(f =>
      f.category === 'missing-nfr' || f.category === 'missing-privacy'
      || f.category === 'missing-ux' || f.category === 'missing-test-strategy'
    )
    assert.ok(nfrFindings.length > 0, 'should find missing NFRs')
  })

  it('basic depth does NOT check NFRs', () => {
    const result = auditRequirements(completePackage, 'basic')
    const nfrFindings = result.findings.filter(f =>
      f.category === 'missing-nfr' || f.category === 'missing-privacy'
    )
    assert.equal(nfrFindings.length, 0)
  })

  it('deep depth checks interfaces', () => {
    const result = auditRequirements(completePackage, 'deep')
    const ifFindings = result.findings.filter(f => f.category === 'missing-interface')
    assert.ok(ifFindings.length > 0, 'should flag missing interface description')
  })

  it('deep depth does not flag interfaces when API mentioned', () => {
    const withApi = completePackage + '\n## Schnittstellen\nREST API auf Port 3000.\n'
    const result = auditRequirements(withApi, 'deep')
    const ifFindings = result.findings.filter(f => f.category === 'missing-interface')
    assert.equal(ifFindings.length, 0)
  })

  it('returns pass status when complete package with NFRs', () => {
    const full = completePackage + NFR_CATEGORIES.map(c => `\n## ${c}\nAdressiert.\n`).join('')
    const result = auditRequirements(full, 'standard')
    assert.equal(result.overallStatus, 'pass')
  })

  it('returns gaps-found when only NFRs are missing', () => {
    const result = auditRequirements(completePackage, 'standard')
    assert.equal(result.overallStatus, 'gaps-found')
  })

  it('provides recommendations for each missing required field', () => {
    const result = auditRequirements('', 'basic')
    for (const f of result.findings) {
      assert.ok(f.recommendation.length > 0, `recommendation should not be empty for ${f.description}`)
    }
  })
})
