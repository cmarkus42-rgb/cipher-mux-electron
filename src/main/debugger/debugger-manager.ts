import { ulid } from 'ulidx'
import type Database from 'better-sqlite3'
import type {
  DebuggerRun,
  DebuggerRunStatus,
  Clarification,
  ClarificationStatus,
  FixPlan,
  FixPlanStatus,
  Severity,
} from './types'

// --- Options ---

export interface CreateRunOpts {
  source: DebuggerRun['source']
  severity: Severity
  description: string
  projectPath: string
  bugReportId?: string
  workspaceId?: string
}

export interface CreateFixPlanOpts {
  hypothesis: string
  confidenceLevel: FixPlan['confidenceLevel']
  planMd: string
  testExtension: string
  riskAssessment: string
  effort: FixPlan['effort']
}

// --- Raw DB rows ---

interface RawRunRow {
  id: string
  bug_report_id: string | null
  source: string
  severity: string
  description: string
  status: string
  retry_count: number
  started_at: number
  finished_at: number | null
  project_path: string
  workspace_id: string | null
}

interface RawClarRow {
  id: string
  run_id: string
  question: string
  options: string | null
  answer: string | null
  status: string
  created_at: number
  resolved_at: number | null
}

interface RawPlanRow {
  id: string
  run_id: string
  hypothesis: string
  confidence_level: string
  plan_md: string
  test_extension: string
  risk_assessment: string
  effort: string
  status: string
  user_confirmed: number
  created_at: number
}

// --- Terminal statuses ---

const TERMINAL_STATUSES: DebuggerRunStatus[] = ['completed', 'failed', 'cancelled']

// --- Manager ---

export class DebuggerManager {
  constructor(private db: Database.Database) {}

  createRun(opts: CreateRunOpts): DebuggerRun {
    const id = ulid()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO debugger_runs (id, bug_report_id, source, severity, description, status, retry_count, started_at, project_path, workspace_id)
      VALUES (?, ?, ?, ?, ?, 'intake', 0, ?, ?, ?)
    `).run(id, opts.bugReportId ?? null, opts.source, opts.severity, opts.description, now, opts.projectPath, opts.workspaceId ?? null)

    return {
      id,
      bugReportId: opts.bugReportId ?? null,
      source: opts.source,
      severity: opts.severity,
      description: opts.description,
      status: 'intake',
      retryCount: 0,
      startedAt: now,
      finishedAt: null,
      projectPath: opts.projectPath,
      workspaceId: opts.workspaceId ?? null,
    }
  }

  getRun(id: string): DebuggerRun | null {
    const row = this.db.prepare('SELECT * FROM debugger_runs WHERE id = ?').get(id) as RawRunRow | undefined
    return row ? this.mapRun(row) : null
  }

  updateRunStatus(id: string, status: DebuggerRunStatus): void {
    const finishedAt = TERMINAL_STATUSES.includes(status) ? Date.now() : null
    this.db.prepare('UPDATE debugger_runs SET status = ?, finished_at = COALESCE(?, finished_at) WHERE id = ?')
      .run(status, finishedAt, id)
  }

  incrementRetry(id: string): void {
    this.db.prepare('UPDATE debugger_runs SET retry_count = retry_count + 1 WHERE id = ?').run(id)
  }

  listRunsByStatus(status: DebuggerRunStatus): DebuggerRun[] {
    const rows = this.db.prepare('SELECT * FROM debugger_runs WHERE status = ? ORDER BY started_at DESC').all(status) as RawRunRow[]
    return rows.map(r => this.mapRun(r))
  }

  // --- Clarifications ---

  createClarification(runId: string, question: string, options: string[] | null): Clarification {
    const id = ulid()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO clarifications (id, run_id, question, options, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(id, runId, question, options ? JSON.stringify(options) : null, now)

    return { id, runId, question, options, answer: null, status: 'pending', createdAt: now, resolvedAt: null }
  }

  getClarification(id: string): Clarification | null {
    const row = this.db.prepare('SELECT * FROM clarifications WHERE id = ?').get(id) as RawClarRow | undefined
    return row ? this.mapClarification(row) : null
  }

  answerClarification(id: string, answer: string): void {
    const now = Date.now()
    this.db.prepare("UPDATE clarifications SET answer = ?, status = 'answered', resolved_at = ? WHERE id = ?")
      .run(answer, now, id)
  }

  listClarifications(runId: string): Clarification[] {
    const rows = this.db.prepare('SELECT * FROM clarifications WHERE run_id = ? ORDER BY created_at ASC').all(runId) as RawClarRow[]
    return rows.map(r => this.mapClarification(r))
  }

  // --- Fix Plans ---

  createFixPlan(runId: string, opts: CreateFixPlanOpts): FixPlan {
    const id = ulid()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO fix_plans (id, run_id, hypothesis, confidence_level, plan_md, test_extension, risk_assessment, effort, status, user_confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?)
    `).run(id, runId, opts.hypothesis, opts.confidenceLevel, opts.planMd, opts.testExtension, opts.riskAssessment, opts.effort, now)

    return {
      id, runId,
      hypothesis: opts.hypothesis,
      confidenceLevel: opts.confidenceLevel,
      planMd: opts.planMd,
      testExtension: opts.testExtension,
      riskAssessment: opts.riskAssessment,
      effort: opts.effort,
      status: 'draft',
      userConfirmed: false,
      createdAt: now,
    }
  }

  getFixPlan(id: string): FixPlan | null {
    const row = this.db.prepare('SELECT * FROM fix_plans WHERE id = ?').get(id) as RawPlanRow | undefined
    return row ? this.mapFixPlan(row) : null
  }

  getFixPlanForRun(runId: string): FixPlan | null {
    const row = this.db.prepare('SELECT * FROM fix_plans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(runId) as RawPlanRow | undefined
    return row ? this.mapFixPlan(row) : null
  }

  confirmFixPlan(id: string): void {
    this.db.prepare("UPDATE fix_plans SET status = 'confirmed', user_confirmed = 1 WHERE id = ?").run(id)
  }

  rejectFixPlan(id: string): void {
    this.db.prepare("UPDATE fix_plans SET status = 'rejected' WHERE id = ?").run(id)
  }

  // --- Mappers ---

  private mapRun(row: RawRunRow): DebuggerRun {
    return {
      id: row.id,
      bugReportId: row.bug_report_id,
      source: row.source as DebuggerRun['source'],
      severity: row.severity as Severity,
      description: row.description,
      status: row.status as DebuggerRunStatus,
      retryCount: row.retry_count,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      projectPath: row.project_path,
      workspaceId: row.workspace_id,
    }
  }

  private mapClarification(row: RawClarRow): Clarification {
    return {
      id: row.id,
      runId: row.run_id,
      question: row.question,
      options: row.options ? JSON.parse(row.options) : null,
      answer: row.answer,
      status: row.status as ClarificationStatus,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }
  }

  private mapFixPlan(row: RawPlanRow): FixPlan {
    return {
      id: row.id,
      runId: row.run_id,
      hypothesis: row.hypothesis,
      confidenceLevel: row.confidence_level as FixPlan['confidenceLevel'],
      planMd: row.plan_md,
      testExtension: row.test_extension,
      riskAssessment: row.risk_assessment,
      effort: row.effort as FixPlan['effort'],
      status: row.status as FixPlanStatus,
      userConfirmed: row.user_confirmed === 1,
      createdAt: row.created_at,
    }
  }
}
