import type { DebuggerManager } from './debugger-manager'
import type { DebuggerRun, DebuggerConfig, FixPlan } from './types'

/**
 * WorkerLauncher — builds worker instructions and manages retry logic.
 * Actual session creation happens via MCP/IPC (not in this module).
 */
export class WorkerLauncher {
  constructor(
    private mgr: DebuggerManager,
    private config: DebuggerConfig,
  ) {}

  /** Whether the run can still retry (retryCount < maxRetries). */
  canRetry(run: DebuggerRun): boolean {
    return run.retryCount < this.config.maxRetries
  }

  /** Build the instruction text to send to the worker sub-session. */
  buildWorkerInstruction(run: DebuggerRun, plan: FixPlan): string {
    const lines: string[] = []

    lines.push('# Debugger Worker — Fix-Auftrag')
    lines.push('')

    if (run.retryCount > 0) {
      lines.push(`> **Retry ${run.retryCount}/${this.config.maxRetries}** — Vorheriger Versuch war nicht erfolgreich. Analysiere was schiefging, bevor du den gleichen Ansatz wiederholst.`)
      lines.push('')
    }

    lines.push('## Fix-Plan')
    lines.push('')
    lines.push(plan.planMd)
    lines.push('')

    lines.push('## Test-Erweiterung')
    lines.push('')
    lines.push(plan.testExtension)
    lines.push('')

    lines.push('## Regeln')
    lines.push('')
    lines.push('- Verhaltens-Test schreiben (muss erst rot sein, dann gruen nach Fix)')
    lines.push('- Bestehende Test-Suite muss gruen bleiben')
    lines.push(`- Du hast maximal ${this.config.maxRetries} Versuche insgesamt`)
    lines.push('- Bei Unklarheit: eskalieren, nicht raten')
    lines.push('- Worker-Phasenmodell einhalten (Plan > Test > Impl > Verify)')
    lines.push('')

    lines.push('## Risiko-Einschaetzung')
    lines.push('')
    lines.push(plan.riskAssessment)
    lines.push('')

    lines.push(`## Projektpfad: \`${run.projectPath}\``)

    return lines.join('\n')
  }

  /** Record a retry attempt. Returns whether retry is still possible. */
  recordRetry(runId: string): boolean {
    this.mgr.incrementRetry(runId)
    const run = this.mgr.getRun(runId)
    return run ? this.canRetry(run) : false
  }
}
