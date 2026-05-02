/** Cyber Factory — diagnose tool: health reports for active CF runs */

import type {
  CyberFactoryRun,
  Welle,
  DiagnoseReport,
  WelleStatus,
  SubProjektStatus,
  EscalationLevel,
} from './types.js'

// ─── Input Types ──────────────────────────────────────────

export interface WorkerSnapshot {
  subProjektId: string
  name: string
  status: string
  tmuxSession: string | null
  contextUsagePercent: number | null
  lastOutput: string | null
  lastHeartbeat: number | null
}

export interface DiagnoseInput {
  run: CyberFactoryRun
  wellen: Welle[]
  workers: WorkerSnapshot[]
  escalationBacklog: number
}

// ─── generateDiagnoseReport ───────────────────────────────

export function generateDiagnoseReport(input: DiagnoseInput): DiagnoseReport {
  const wellenStatus: WelleStatus[] = input.wellen.map((w) => w.status)

  const workerStatus: SubProjektStatus[] = input.workers.map(
    (w) => w.status as SubProjektStatus,
  )

  // Represent the escalation backlog count as an array of level-1 entries.
  // The exact escalation levels are not conveyed in DiagnoseInput — we use
  // level 1 as a sentinel so callers can check `.length` for the count.
  const escalationBacklog: EscalationLevel[] = Array.from(
    { length: input.escalationBacklog },
    () => 1 as EscalationLevel,
  )

  return {
    runId: input.run.id,
    timestamp: Date.now(),
    runStatus: input.run.status,
    wellenStatus,
    workerStatus,
    escalationBacklog,
  }
}

// ─── formatDiagnoseMarkdown ───────────────────────────────

export function formatDiagnoseMarkdown(report: DiagnoseReport): string {
  const isoTimestamp = new Date(report.timestamp).toISOString()
  const lines: string[] = []

  lines.push('# Cyber Factory Diagnose')
  lines.push('')
  lines.push(`**Run:** ${report.runId}`)
  lines.push(`**Status:** ${report.runStatus}`)
  lines.push(`**Timestamp:** ${isoTimestamp}`)
  lines.push(`**Eskalations-Backlog:** ${report.escalationBacklog.length}`)
  lines.push('')

  lines.push('## Wellen')
  if (report.wellenStatus.length === 0) {
    lines.push('- (keine)')
  } else {
    report.wellenStatus.forEach((status, idx) => {
      lines.push(`- Welle ${idx + 1}: ${status}`)
    })
  }
  lines.push('')

  lines.push('## Worker')
  if (report.workerStatus.length === 0) {
    lines.push('- (keine)')
  } else {
    report.workerStatus.forEach((status) => {
      lines.push(`- [${status}]`)
    })
  }

  return lines.join('\n')
}
