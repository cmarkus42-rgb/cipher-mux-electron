// src/main/testing-assistant/findings-reporter.ts
import type { Finding, TestSuiteResult, TestQualityReport } from './types'
import type { OffLimitsViolation } from './off-limits-audit'

export interface ReportData {
  runId: string
  welleId: string | null
  date: string
  suiteResult: TestSuiteResult | null
  qualityReport: TestQualityReport | null
  findings: Finding[]
  offLimitsViolations: OffLimitsViolation[]
}

export function generateFindingsReport(data: ReportData): string {
  const { runId, welleId, date, suiteResult, qualityReport, findings, offLimitsViolations } = data

  const hasFindings = findings.length > 0 || offLimitsViolations.length > 0
  const status = hasFindings ? 'Findings vorhanden' : 'sauber'

  const lines: string[] = []

  // Header
  lines.push(`# Testing-Run-Report — ${runId}`)
  lines.push('')
  lines.push(`- **Welle:** ${welleId ?? '—'}`)
  lines.push(`- **Datum:** ${date}`)
  lines.push(`- **Status:** ${status}`)
  lines.push('')

  // Test-Suite section
  lines.push('## Test-Suite')
  lines.push('')
  if (suiteResult === null) {
    lines.push('konnte nicht ausgefuehrt werden')
  } else {
    lines.push(`- **Total:** ${suiteResult.total}`)
    lines.push(`- **Passed:** ${suiteResult.passed}`)
    lines.push(`- **Failed:** ${suiteResult.failed}`)
  }
  lines.push('')

  // Test-Qualitaet section
  lines.push('## Test-Qualitaet')
  lines.push('')
  if (qualityReport === null) {
    lines.push('—')
  } else {
    const total = qualityReport.behavioralCount + qualityReport.implementationCount
    const behavioralPct = total === 0 ? 0 : Math.round((qualityReport.behavioralCount / total) * 100)
    lines.push(`- **Behavioral:** ${qualityReport.behavioralCount} (${behavioralPct}%)`)
    lines.push(`- **Implementations-Verdacht:** ${qualityReport.implementationCount}`)
    if (qualityReport.problematicTests.length > 0) {
      lines.push(`- **Problematische Tests:** ${qualityReport.problematicTests.join(', ')}`)
    }
  }
  lines.push('')

  // Findings section
  lines.push('## Findings')
  lines.push('')

  const highFindings = findings.filter(f => f.severity === 'high')
  const mediumFindings = findings.filter(f => f.severity === 'medium')
  const lowFindings = findings.filter(f => f.severity === 'low')

  if (findings.length === 0) {
    lines.push('Keine Findings')
  } else {
    if (highFindings.length > 0) {
      lines.push(`### Hoch (${highFindings.length})`)
      lines.push('')
      for (const f of highFindings) {
        lines.push(formatFinding(f))
      }
      lines.push('')
    }
    if (mediumFindings.length > 0) {
      lines.push(`### Mittel (${mediumFindings.length})`)
      lines.push('')
      for (const f of mediumFindings) {
        lines.push(formatFinding(f))
      }
      lines.push('')
    }
    if (lowFindings.length > 0) {
      lines.push(`### Niedrig (${lowFindings.length})`)
      lines.push('')
      for (const f of lowFindings) {
        lines.push(formatFinding(f))
      }
      lines.push('')
    }
  }

  // Off-Limits section
  lines.push('## Off-Limits')
  lines.push('')
  if (offLimitsViolations.length === 0) {
    lines.push('Keine Verstösse')
  } else {
    for (const v of offLimitsViolations) {
      lines.push(`- **${v.severity.toUpperCase()}** \`${v.filePath}\` — ${v.description}`)
    }
  }
  lines.push('')

  return lines.join('\n')
}

function formatFinding(f: Finding): string {
  const location = f.filePath
    ? `\`${f.filePath}${f.lineNumber !== null ? `:${f.lineNumber}` : ''}\``
    : null
  const parts = [`- **[${f.category}]** ${f.description}`]
  if (location) parts.push(`  - Ort: ${location}`)
  if (f.reproduction) parts.push(`  - Reproduktion: ${f.reproduction}`)
  if (f.suggestion) parts.push(`  - Vorschlag: ${f.suggestion}`)
  return parts.join('\n')
}
