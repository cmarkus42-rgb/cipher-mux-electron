// src/main/audit/audit-manager.ts — Audit lifecycle (full, Welle 4)
import Database from 'better-sqlite3'
import { ulid } from 'ulidx'
import type {
  AuditRun, AuditFinding, AuditStatus, AuditScope, AuditSeverity, AuditCategory,
  CognitiveDebtNote, ReleaseRecommendation, AuditVerdict,
} from './types'

export class AuditManager {
  private db: Database.Database
  private stmtInsertRun: Database.Statement
  private stmtInsertFinding: Database.Statement
  private stmtInsertDebt: Database.Statement
  private stmtInsertRecommendation: Database.Statement
  private stmtUpdateStatus: Database.Statement
  private stmtGetRun: Database.Statement
  private stmtListFindings: Database.Statement
  private stmtGetRecommendation: Database.Statement

  constructor(db: Database.Database) {
    this.db = db
    this.stmtInsertRun = db.prepare(
      `INSERT INTO audit_runs (id, scope, scope_detail, started_at, status, project_path, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    this.stmtInsertFinding = db.prepare(
      `INSERT INTO audit_findings (id, run_id, severity, category, file_path, line_number, description, recommendation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.stmtInsertDebt = db.prepare(
      `INSERT INTO audit_cognitive_debt (id, run_id, area, suggestion, line_count) VALUES (?, ?, ?, ?, ?)`
    )
    this.stmtInsertRecommendation = db.prepare(
      `INSERT OR REPLACE INTO audit_recommendations (run_id, verdict, rationale, high_count, medium_count, low_count) VALUES (?, ?, ?, ?, ?, ?)`
    )
    this.stmtUpdateStatus = db.prepare(
      `UPDATE audit_runs SET status = ?, finished_at = ? WHERE id = ?`
    )
    this.stmtGetRun = db.prepare(`SELECT * FROM audit_runs WHERE id = ?`)
    this.stmtListFindings = db.prepare(`SELECT * FROM audit_findings WHERE run_id = ? ORDER BY severity ASC`)
    this.stmtGetRecommendation = db.prepare(`SELECT * FROM audit_recommendations WHERE run_id = ?`)
  }

  createRun(opts: { scope: AuditScope; scopeDetail?: string; projectPath: string; workspaceId?: string }): AuditRun {
    const id = `arun-${ulid()}`
    const now = Date.now()
    this.stmtInsertRun.run(id, opts.scope, opts.scopeDetail ?? null, now, 'pending', opts.projectPath, opts.workspaceId ?? null)
    return { id, scope: opts.scope, scopeDetail: opts.scopeDetail ?? null, startedAt: now, finishedAt: null, status: 'pending', projectPath: opts.projectPath, workspaceId: opts.workspaceId ?? null }
  }

  getRun(id: string): AuditRun | null {
    const row = this.stmtGetRun.get(id) as any
    if (!row) return null
    return { id: row.id, scope: row.scope, scopeDetail: row.scope_detail, startedAt: row.started_at, finishedAt: row.finished_at, status: row.status, projectPath: row.project_path, workspaceId: row.workspace_id }
  }

  updateStatus(id: string, status: AuditStatus): void {
    const finishedAt = (status === 'completed' || status === 'failed') ? Date.now() : null
    this.stmtUpdateStatus.run(status, finishedAt, id)
  }

  addFinding(opts: { runId: string; severity: AuditSeverity; category: AuditCategory; description: string; recommendation: string; filePath?: string; lineNumber?: number }): AuditFinding {
    const id = `afnd-${ulid()}`
    this.stmtInsertFinding.run(id, opts.runId, opts.severity, opts.category, opts.filePath ?? null, opts.lineNumber ?? null, opts.description, opts.recommendation)
    return { id, runId: opts.runId, severity: opts.severity, category: opts.category, filePath: opts.filePath ?? null, lineNumber: opts.lineNumber ?? null, description: opts.description, recommendation: opts.recommendation }
  }

  listFindings(runId: string): AuditFinding[] {
    return (this.stmtListFindings.all(runId) as any[]).map(r => ({
      id: r.id, runId: r.run_id, severity: r.severity, category: r.category, filePath: r.file_path, lineNumber: r.line_number, description: r.description, recommendation: r.recommendation,
    }))
  }

  addCognitiveDebt(opts: { runId: string; area: string; suggestion: string; lineCount?: number }): CognitiveDebtNote {
    const id = `adbt-${ulid()}`
    this.stmtInsertDebt.run(id, opts.runId, opts.area, opts.suggestion, opts.lineCount ?? null)
    return { id, runId: opts.runId, area: opts.area, suggestion: opts.suggestion, lineCount: opts.lineCount ?? null }
  }

  saveRecommendation(opts: { runId: string; verdict: AuditVerdict; rationale: string; highCount: number; mediumCount: number; lowCount: number }): void {
    this.stmtInsertRecommendation.run(opts.runId, opts.verdict, opts.rationale, opts.highCount, opts.mediumCount, opts.lowCount)
  }

  getRecommendation(runId: string): ReleaseRecommendation | null {
    const row = this.stmtGetRecommendation.get(runId) as any
    if (!row) return null
    return { runId: row.run_id, verdict: row.verdict, rationale: row.rationale, highCount: row.high_count, mediumCount: row.medium_count, lowCount: row.low_count }
  }
}
