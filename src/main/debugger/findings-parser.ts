import type { FindingsIntake, Severity } from './types'

const VALID_SEVERITIES: Severity[] = ['high', 'medium', 'low']

/** Type-guard: check if input is a structured findings object. */
export function isStructuredFindings(input: unknown): input is FindingsIntake {
  if (!input || typeof input !== 'object') return false
  const obj = input as Record<string, unknown>
  return (
    typeof obj.symptom === 'string' &&
    typeof obj.reproduction === 'string' &&
    typeof obj.severity === 'string' &&
    Array.isArray(obj.affectedAreas) &&
    typeof obj.source === 'string'
  )
}

/** Parse findings from structured object or raw text string. */
export function parseFindings(input: FindingsIntake | string): FindingsIntake {
  if (typeof input === 'string') {
    return {
      symptom: input,
      reproduction: '',
      severity: 'medium',
      suspectedCause: null,
      affectedAreas: [],
      source: 'manual',
    }
  }

  const severity = (input.severity?.toLowerCase() ?? 'medium') as Severity
  return {
    symptom: input.symptom,
    reproduction: input.reproduction ?? '',
    severity: VALID_SEVERITIES.includes(severity) ? severity : 'medium',
    suspectedCause: input.suspectedCause ?? null,
    affectedAreas: input.affectedAreas ?? [],
    source: input.source ?? 'manual',
    bugReportId: input.bugReportId,
  }
}
