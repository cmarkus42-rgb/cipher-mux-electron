// src/main/testing-assistant/handoff-debugger.ts
import type { Finding } from './types'

export type HandoffDecision = 'debugger' | 'optional-debugger' | 'audit'

export interface DebuggerHandoff {
  runId: string
  source: 'testing-assistant'
  decision: HandoffDecision
  findings: Finding[]
}

/**
 * Decides what handoff action to take based on findings:
 * - 'debugger': any high-severity finding, or more than 5 medium findings
 * - 'optional-debugger': up to 5 medium findings, no high
 * - 'audit': clean (no findings) or only low-severity findings
 */
export function decideHandoff(findings: Finding[]): HandoffDecision {
  const highCount = findings.filter(f => f.severity === 'high').length
  const mediumCount = findings.filter(f => f.severity === 'medium').length

  if (highCount > 0 || mediumCount > 5) {
    return 'debugger'
  }
  if (mediumCount > 0) {
    return 'optional-debugger'
  }
  return 'audit'
}

/**
 * Builds a structured debugger handoff payload.
 * Only includes high and medium severity findings.
 */
export function buildDebuggerHandoff(findings: Finding[], runId: string): DebuggerHandoff {
  const relevantFindings = findings.filter(
    f => f.severity === 'high' || f.severity === 'medium'
  )
  const decision = decideHandoff(findings)

  return {
    runId,
    source: 'testing-assistant',
    decision,
    findings: relevantFindings,
  }
}
