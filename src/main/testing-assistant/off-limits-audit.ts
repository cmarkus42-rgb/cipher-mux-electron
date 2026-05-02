// src/main/testing-assistant/off-limits-audit.ts
import type { FindingSeverity } from './types'

export interface OffLimitsViolation {
  filePath: string
  offLimitsPath: string
  severity: FindingSeverity
  description: string
}

export function checkOffLimits(
  changedFiles: string[],
  offLimitsPaths: string[]
): OffLimitsViolation[] {
  if (offLimitsPaths.length === 0 || changedFiles.length === 0) return []

  const violations: OffLimitsViolation[] = []

  for (const file of changedFiles) {
    for (const offLimit of offLimitsPaths) {
      if (file.startsWith(offLimit) || file === offLimit) {
        violations.push({
          filePath: file,
          offLimitsPath: offLimit,
          severity: 'high',
          description: `File ${file} is in off-limits area: ${offLimit}`,
        })
      }
    }
  }

  return violations
}
