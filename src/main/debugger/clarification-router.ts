import type { DebuggerManager } from './debugger-manager'
import type { FindingsIntake, Clarification } from './types'

/**
 * ClarificationRouter — identifies gaps in findings and creates
 * clarification questions for the user.
 */
export class ClarificationRouter {
  constructor(private mgr: DebuggerManager) {}

  /** Identify what's missing from findings that needs user input. */
  identifyGaps(findings: FindingsIntake): string[] {
    const gaps: string[] = []

    if (!findings.reproduction || findings.reproduction.trim().length < 5) {
      gaps.push('Wie laesst sich der Bug reproduzieren? (Schritt-fuer-Schritt)')
    }

    if (!findings.suspectedCause && findings.affectedAreas.length === 0) {
      gaps.push('Gibt es eine Vermutung zur Ursache oder betroffene Code-Bereiche?')
    }

    return gaps
  }

  /** Create clarification records for identified gaps. Returns created clarifications. */
  createClarificationsForRun(runId: string, findings: FindingsIntake): Clarification[] {
    const gaps = this.identifyGaps(findings)
    return gaps.map(question => this.mgr.createClarification(runId, question, null))
  }

  /** Check whether all clarifications for a run have been answered. */
  allAnswered(runId: string): boolean {
    const clars = this.mgr.listClarifications(runId)
    if (clars.length === 0) return true
    return clars.every(c => c.status === 'answered')
  }
}
