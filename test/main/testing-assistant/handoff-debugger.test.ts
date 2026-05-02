// test/main/testing-assistant/handoff-debugger.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decideHandoff, buildDebuggerHandoff } from '../../../src/main/testing-assistant/handoff-debugger'
import type { Finding } from '../../../src/main/testing-assistant/types'

function makeFinding(id: string, severity: Finding['severity'], category: Finding['category'] = 'adversarial'): Finding {
  return {
    id,
    runId: 'run-001',
    severity,
    category,
    filePath: 'src/foo.ts',
    lineNumber: 1,
    description: `Finding ${id}`,
    reproduction: null,
    suggestion: null,
  }
}

describe('decideHandoff', () => {
  it('returns debugger when there is a high-severity finding', () => {
    const findings: Finding[] = [
      makeFinding('f-1', 'high'),
      makeFinding('f-2', 'low'),
    ]
    assert.equal(decideHandoff(findings), 'debugger')
  })

  it('returns debugger when there are more than 5 medium findings', () => {
    const findings: Finding[] = Array.from({ length: 6 }, (_, i) =>
      makeFinding(`f-${i}`, 'medium')
    )
    assert.equal(decideHandoff(findings), 'debugger')
  })

  it('returns optional-debugger when there are 5 or fewer medium findings and no high', () => {
    const findings: Finding[] = [
      makeFinding('f-1', 'medium'),
      makeFinding('f-2', 'medium'),
      makeFinding('f-3', 'low'),
    ]
    assert.equal(decideHandoff(findings), 'optional-debugger')
  })

  it('returns audit when there are only low-severity findings', () => {
    const findings: Finding[] = [
      makeFinding('f-1', 'low'),
      makeFinding('f-2', 'low'),
    ]
    assert.equal(decideHandoff(findings), 'audit')
  })

  it('returns audit when findings list is empty', () => {
    assert.equal(decideHandoff([]), 'audit')
  })
})

describe('buildDebuggerHandoff', () => {
  it('only includes high and medium findings, sets source to testing-assistant', () => {
    const findings: Finding[] = [
      makeFinding('f-high', 'high'),
      makeFinding('f-medium', 'medium'),
      makeFinding('f-low', 'low'),
    ]

    const handoff = buildDebuggerHandoff(findings, 'run-001')

    assert.equal(handoff.runId, 'run-001')
    assert.equal(handoff.source, 'testing-assistant')
    assert.equal(handoff.findings.length, 2, 'Should only include high+medium')
    assert.ok(handoff.findings.every(f => f.severity === 'high' || f.severity === 'medium'), 'All findings must be high or medium')
    assert.ok(!handoff.findings.some(f => f.severity === 'low'), 'Low findings must be excluded')
  })
})
