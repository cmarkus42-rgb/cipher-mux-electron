// src/main/audit/release-recommender.ts
import type { AuditFinding, AuditVerdict, ReleaseRecommendation } from './types'

/**
 * Generate release recommendation based on findings.
 * Rules:
 * - 0 High, <=3 Medium -> release
 * - 0 High, 4-10 Medium -> release-after-fix
 * - 0 High, >10 Medium -> blocked
 * - >=1 High or Critical -> blocked
 */
export function generateReleaseRecommendation(runId: string, findings: AuditFinding[]): ReleaseRecommendation {
  const highCount = findings.filter(f => f.severity === 'high' || f.severity === 'critical').length
  const mediumCount = findings.filter(f => f.severity === 'medium').length
  const lowCount = findings.filter(f => f.severity === 'low' || f.severity === 'info').length

  let verdict: AuditVerdict
  let rationale: string

  if (highCount > 0) {
    verdict = 'blocked'
    rationale = `${highCount} High-Severity Finding(s) muessen gefixt werden vor Release.`
  } else if (mediumCount > 10) {
    verdict = 'blocked'
    rationale = `${mediumCount} Medium-Severity Findings — Welle ueberarbeiten.`
  } else if (mediumCount > 3) {
    verdict = 'release-after-fix'
    rationale = `${mediumCount} Medium-Severity Findings — kritischste >50% fixen, dann Re-Audit.`
  } else {
    verdict = 'release'
    rationale = mediumCount > 0
      ? `${mediumCount} Medium-Findings, akzeptabel. Release empfohlen.`
      : 'Sauber. Release empfohlen.'
  }

  return { runId, verdict, rationale, highCount, mediumCount, lowCount }
}
