// src/main/audit/audit-manager.ts — Audit lifecycle (rudimentary, full in Welle 4)
//
// Welle 1a: skeleton only — data types + storage.
// Welle 4: full implementation with code-review, security-audit, ADR consistency,
//          cognitive-debt evaluator, findings reporter, release recommender.

import type { AuditRun, AuditStatus } from './types'

export class AuditManager {
  private runs: Map<string, AuditRun> = new Map()
  private counter = 0

  createRun(scope: string): AuditRun {
    const run: AuditRun = {
      id: `audit-${Date.now()}-${++this.counter}`,
      scope,
      started: new Date().toISOString(),
      status: 'pending',
      findings: [],
    }
    this.runs.set(run.id, run)
    return run
  }

  getRun(id: string): AuditRun | undefined {
    return this.runs.get(id)
  }

  listRuns(): AuditRun[] {
    return Array.from(this.runs.values())
  }

  updateStatus(id: string, status: AuditStatus): void {
    const run = this.runs.get(id)
    if (run) {
      run.status = status
    }
  }
}
