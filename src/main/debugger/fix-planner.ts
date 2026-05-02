import type { DebuggerManager } from './debugger-manager'
import type { FindingsIntake, FixPlan, Clarification } from './types'

/**
 * FixPlanner — generates fix-plan markdown from findings + clarifications,
 * stores plan in DB, and determines whether user confirmation is needed.
 */
export class FixPlanner {
  constructor(private mgr: DebuggerManager) {}

  /** Generate plan markdown from findings and resolved clarifications. */
  generatePlanMarkdown(findings: FindingsIntake, clarifications: Clarification[]): string {
    const lines: string[] = []

    lines.push('## Hypothese')
    lines.push('')
    if (findings.suspectedCause) {
      lines.push(`**Vermutete Ursache:** ${findings.suspectedCause}`)
    } else {
      lines.push('**Vermutete Ursache:** Noch zu ermitteln (aus Code-Analyse)')
    }
    lines.push('')

    lines.push('## Symptom')
    lines.push('')
    lines.push(findings.symptom)
    lines.push('')

    if (findings.reproduction) {
      lines.push('## Reproduktion')
      lines.push('')
      lines.push(findings.reproduction)
      lines.push('')
    }

    if (clarifications.length > 0) {
      lines.push('## Klaerungen')
      lines.push('')
      for (const c of clarifications) {
        lines.push(`**F:** ${c.question}`)
        lines.push(`**A:** ${c.answer ?? '(offen)'}`)
        lines.push('')
      }
    }

    lines.push('## Geplanter Fix')
    lines.push('')
    if (findings.affectedAreas.length > 0) {
      lines.push('**Betroffene Dateien:**')
      for (const area of findings.affectedAreas) {
        lines.push(`- \`${area}\``)
      }
      lines.push('')
    }
    lines.push('(Detail wird vom Debugger nach Plan-Bestaetigung ausgefuellt)')
    lines.push('')

    lines.push('## Risiko')
    lines.push('')
    lines.push(`**Severity:** ${findings.severity}`)
    lines.push('')

    return lines.join('\n')
  }

  /** Create a fix plan from findings, store it, and return it. */
  createAndStorePlan(runId: string, findings: FindingsIntake, clarifications: Clarification[]): FixPlan {
    const planMd = this.generatePlanMarkdown(findings, clarifications)

    return this.mgr.createFixPlan(runId, {
      hypothesis: findings.suspectedCause ?? 'Aus Code-Analyse zu ermitteln',
      confidenceLevel: findings.suspectedCause ? 'likely' : 'uncertain',
      planMd,
      testExtension: `Verhaltens-Test fuer: ${findings.symptom}`,
      riskAssessment: `Severity ${findings.severity}, betroffene Bereiche: ${findings.affectedAreas.join(', ') || 'unbekannt'}`,
      effort: this.estimateEffort(findings),
    })
  }

  /**
   * Whether user confirmation is required before starting the worker.
   * Only trivial fixes with sure confidence can skip confirmation.
   */
  requiresConfirmation(effort: FixPlan['effort'], confidence: FixPlan['confidenceLevel']): boolean {
    return !(effort === 'trivial' && confidence === 'sure')
  }

  private estimateEffort(findings: FindingsIntake): FixPlan['effort'] {
    if (findings.affectedAreas.length <= 1 && findings.suspectedCause) return 'small'
    if (findings.affectedAreas.length > 3) return 'large'
    return 'medium'
  }
}
