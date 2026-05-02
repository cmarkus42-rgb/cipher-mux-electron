// src/main/audit/findings-reporter.ts
import type { AuditFinding, AuditRun, CognitiveDebtNote, ReleaseRecommendation } from './types'

export interface AuditReportData {
  run: AuditRun
  findings: AuditFinding[]
  cognitiveDebt: CognitiveDebtNote[]
  recommendation: ReleaseRecommendation | null
}

/**
 * Generate a structured Markdown audit report.
 */
export function generateAuditReport(data: AuditReportData): string {
  const { run, findings, cognitiveDebt, recommendation } = data
  const timestamp = new Date(run.startedAt).toISOString()

  const criticalCount = findings.filter(f => f.severity === 'critical').length
  const highCount = findings.filter(f => f.severity === 'high').length
  const mediumCount = findings.filter(f => f.severity === 'medium').length
  const lowCount = findings.filter(f => f.severity === 'low').length
  const infoCount = findings.filter(f => f.severity === 'info').length

  let md = `# Audit-Run-Report — ${run.id}\n\n`
  md += `**Scope:** ${run.scope}${run.scopeDetail ? ` (${run.scopeDetail})` : ''}\n`
  md += `**Datum:** ${timestamp}\n\n`

  // Executive Summary
  md += `## Executive Summary\n\n`
  if (findings.length === 0) {
    md += `Keine Findings. Code ist sauber.\n\n`
  } else {
    md += `${findings.length} Findings gesamt: ${criticalCount + highCount} kritisch/hoch, ${mediumCount} mittel, ${lowCount + infoCount} niedrig/info.\n\n`
  }

  // Findings by severity
  md += `## Findings\n\n`
  if (criticalCount + highCount > 0) {
    md += `### Hoch (${criticalCount + highCount})\n\n`
    for (const f of findings.filter(f => f.severity === 'critical' || f.severity === 'high')) {
      md += `- **${f.id}** [${f.category}]: ${f.description}\n`
      if (f.filePath) md += `  - Datei: ${f.filePath}${f.lineNumber ? `:${f.lineNumber}` : ''}\n`
      md += `  - Empfehlung: ${f.recommendation}\n`
    }
    md += '\n'
  }
  if (mediumCount > 0) {
    md += `### Mittel (${mediumCount})\n\n`
    for (const f of findings.filter(f => f.severity === 'medium')) {
      md += `- **${f.id}** [${f.category}]: ${f.description}\n`
      if (f.filePath) md += `  - Datei: ${f.filePath}${f.lineNumber ? `:${f.lineNumber}` : ''}\n`
      md += `  - Empfehlung: ${f.recommendation}\n`
    }
    md += '\n'
  }
  if (lowCount + infoCount > 0) {
    md += `### Niedrig/Info (${lowCount + infoCount})\n\n`
    for (const f of findings.filter(f => f.severity === 'low' || f.severity === 'info')) {
      md += `- **${f.id}** [${f.category}]: ${f.description}\n`
    }
    md += '\n'
  }
  if (findings.length === 0) {
    md += `Keine Findings.\n\n`
  }

  // Cognitive Debt
  md += `## Cognitive-Debt\n\n`
  if (cognitiveDebt.length === 0) {
    md += `Keine auffaelligen Bereiche.\n\n`
  } else {
    for (const d of cognitiveDebt) {
      md += `- **${d.area}**: ${d.suggestion}\n`
    }
    md += '\n'
  }

  // Release Recommendation
  md += `## Release-Empfehlung\n\n`
  if (recommendation) {
    md += `**Verdict:** ${recommendation.verdict}\n\n`
    md += `${recommendation.rationale}\n`
  } else {
    md += `Noch keine Empfehlung generiert.\n`
  }

  return md
}
