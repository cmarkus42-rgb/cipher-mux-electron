import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseFindings, isStructuredFindings } from '../../../src/main/debugger/findings-parser'

describe('findings-parser', () => {
  const structured = {
    symptom: 'App crashes on startup',
    reproduction: '1. Launch app 2. Click button',
    severity: 'high' as const,
    suspectedCause: 'Null pointer in init',
    affectedAreas: ['src/main/main.ts', 'src/main/window-manager.ts'],
    source: 'testing-assistant' as const,
  }

  it('parses valid structured findings', () => {
    const result = parseFindings(structured)
    assert.equal(result.symptom, 'App crashes on startup')
    assert.equal(result.severity, 'high')
    assert.deepEqual(result.affectedAreas, ['src/main/main.ts', 'src/main/window-manager.ts'])
  })

  it('isStructuredFindings returns true for valid input', () => {
    assert.equal(isStructuredFindings(structured), true)
  })

  it('isStructuredFindings returns false for missing fields', () => {
    assert.equal(isStructuredFindings({ symptom: 'x' }), false)
  })

  it('parses unstructured text into findings with defaults', () => {
    const result = parseFindings('The button does not work when clicked fast')
    assert.equal(result.symptom, 'The button does not work when clicked fast')
    assert.equal(result.severity, 'medium')
    assert.equal(result.source, 'manual')
    assert.deepEqual(result.affectedAreas, [])
  })

  it('normalizes severity to lowercase', () => {
    const result = parseFindings({ ...structured, severity: 'HIGH' as any })
    assert.equal(result.severity, 'high')
  })
})
