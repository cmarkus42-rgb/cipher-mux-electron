// test/main/testing-assistant/findings-reporter.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateFindingsReport } from '../../../src/main/testing-assistant/findings-reporter'
import type { ReportData } from '../../../src/main/testing-assistant/findings-reporter'
import type { Finding, TestSuiteResult, TestQualityReport } from '../../../src/main/testing-assistant/types'

function makeRunId(): string {
  return 'run-test-001'
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f-001',
    runId: makeRunId(),
    severity: 'medium',
    category: 'adversarial',
    filePath: 'src/main/foo.ts',
    lineNumber: 42,
    description: 'Null-Input not handled',
    reproduction: 'call foo(null)',
    suggestion: 'Add null guard',
    ...overrides,
  }
}

describe('generateFindingsReport', () => {
  it('generates full report with findings — checks all sections, severity counts, behavioral percentage', () => {
    const runId = makeRunId()

    const suiteResult: TestSuiteResult = {
      runId,
      total: 20,
      passed: 18,
      failed: 2,
      rawOutput: 'test output...',
    }

    const qualityReport: TestQualityReport = {
      runId,
      behavioralCount: 15,
      implementationCount: 5,
      problematicTests: ['foo.test.ts'],
    }

    const findings: Finding[] = [
      makeFinding({ id: 'f-001', severity: 'high', category: 'owasp', description: 'SQL injection risk' }),
      makeFinding({ id: 'f-002', severity: 'high', category: 'off-limits', description: 'Off-limits file touched' }),
      makeFinding({ id: 'f-003', severity: 'medium', category: 'adversarial', description: 'Boundary not handled' }),
      makeFinding({ id: 'f-004', severity: 'low', category: 'test-failure', description: 'Minor smell' }),
    ]

    const data: ReportData = {
      runId,
      welleId: 'welle-4',
      date: '2026-05-02',
      suiteResult,
      qualityReport,
      findings,
      offLimitsViolations: [],
    }

    const report = generateFindingsReport(data)

    // Header
    assert.ok(report.includes(`# Testing-Run-Report — ${runId}`), 'Missing header')
    assert.ok(report.includes('Welle:** welle-4'), 'Missing welle')
    assert.ok(report.includes('2026-05-02'), 'Missing date')
    assert.ok(report.includes('Findings vorhanden'), 'Status should be Findings vorhanden')

    // Test-Suite section
    assert.ok(report.includes('## Test-Suite'), 'Missing Test-Suite section')
    assert.ok(report.includes('Total:** 20'), 'Missing total count')
    assert.ok(report.includes('Passed:** 18'), 'Missing passed count')
    assert.ok(report.includes('Failed:** 2'), 'Missing failed count')

    // Test-Qualitaet — 15/(15+5) = 75%
    assert.ok(report.includes('## Test-Qualitaet'), 'Missing Test-Qualitaet section')
    assert.ok(report.includes('75%'), 'Missing behavioral percentage 75%')
    assert.ok(report.includes('Implementations-Verdacht:** 5'), 'Missing implementation count')

    // Findings section — severity subsections with counts
    assert.ok(report.includes('## Findings'), 'Missing Findings section')
    assert.ok(report.includes('### Hoch (2)'), 'Missing Hoch subsection with count 2')
    assert.ok(report.includes('### Mittel (1)'), 'Missing Mittel subsection with count 1')
    assert.ok(report.includes('### Niedrig (1)'), 'Missing Niedrig subsection with count 1')

    // Off-Limits section
    assert.ok(report.includes('## Off-Limits'), 'Missing Off-Limits section')
    assert.ok(report.includes('Keine Verstösse'), 'Should show keine Verstösse when empty')
  })

  it('generates clean report — checks sauber status and Keine Findings', () => {
    const runId = 'run-clean-001'

    const data: ReportData = {
      runId,
      welleId: null,
      date: '2026-05-02',
      suiteResult: {
        runId,
        total: 10,
        passed: 10,
        failed: 0,
        rawOutput: '',
      },
      qualityReport: null,
      findings: [],
      offLimitsViolations: [],
    }

    const report = generateFindingsReport(data)

    assert.ok(report.includes('Status:** sauber'), 'Status should be sauber')
    assert.ok(report.includes('Keine Findings'), 'Should show Keine Findings when no findings')
    assert.ok(report.includes('Keine Verstösse'), 'Should show Keine Verstösse')
    // No hoch/mittel/niedrig subsections
    assert.ok(!report.includes('### Hoch'), 'Should not have Hoch subsection')
    assert.ok(!report.includes('### Mittel'), 'Should not have Mittel subsection')
    assert.ok(!report.includes('### Niedrig'), 'Should not have Niedrig subsection')
  })
})
