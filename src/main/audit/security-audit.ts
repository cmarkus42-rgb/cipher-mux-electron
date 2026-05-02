// src/main/audit/security-audit.ts
import { runOwaspSpotcheck } from '../testing-assistant/owasp-spotcheck'
import type { AuditFinding, AuditSeverity } from './types'

/**
 * Full security audit — extends OWASP spotcheck.
 * Returns findings in audit format.
 */
export function runSecurityAudit(projectPath: string, runId: string): AuditFinding[] {
  const owaspResults = runOwaspSpotcheck(projectPath)
  const findings: AuditFinding[] = []

  for (const owasp of owaspResults) {
    findings.push({
      id: `afnd-sec-${findings.length + 1}`,
      runId,
      severity: owasp.severity as AuditSeverity,
      category: 'security',
      filePath: owasp.filePath,
      lineNumber: owasp.lineNumber,
      description: `[${owasp.rule}] ${owasp.description}`,
      recommendation: getRecommendation(owasp.rule),
    })
  }

  return findings
}

function getRecommendation(rule: string): string {
  const recs: Record<string, string> = {
    'SQL-INJ': 'Use parameterized queries / prepared statements',
    'SQL-INJ-CONCAT': 'Use parameterized queries instead of string concatenation',
    'HARDCODED-SECRET': 'Move to environment variable or secret manager',
    'HARDCODED-JWT': 'Remove hardcoded token, use runtime config',
    'XSS-INNERHTML': 'Use safe rendering (textContent, framework escaping)',
    'EVAL': 'Replace eval with safer alternative (JSON.parse, switch/case)',
    'NOSQL-INJ': 'Sanitize user input before query construction',
  }
  return recs[rule] || 'Review and fix the identified pattern'
}
