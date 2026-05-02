// src/main/testing-assistant/testing-assistant-manager.ts
import Database from 'better-sqlite3'
import { ulid } from 'ulidx'
import type {
  TestingRun, Finding, TestSuiteResult, TestQualityReport,
  TestingRunStatus, FindingSeverity, FindingCategory,
} from './types'

export class TestingAssistantManager {
  private db: Database.Database
  private stmtInsertRun: Database.Statement
  private stmtInsertFinding: Database.Statement
  private stmtInsertSuiteResult: Database.Statement
  private stmtInsertQualityReport: Database.Statement
  private stmtUpdateRunStatus: Database.Statement
  private stmtGetRun: Database.Statement
  private stmtListFindings: Database.Statement

  constructor(db: Database.Database) {
    this.db = db

    this.stmtInsertRun = db.prepare(
      `INSERT INTO testing_runs (id, cyber_factory_run_id, welle_id, status, started_at, project_path, workspace_id, test_command)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.stmtInsertFinding = db.prepare(
      `INSERT INTO testing_findings (id, run_id, severity, category, file_path, line_number, description, reproduction, suggestion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.stmtInsertSuiteResult = db.prepare(
      `INSERT OR REPLACE INTO testing_suite_results (run_id, total, passed, failed, raw_output)
       VALUES (?, ?, ?, ?, ?)`
    )
    this.stmtInsertQualityReport = db.prepare(
      `INSERT OR REPLACE INTO testing_quality_reports (run_id, behavioral_count, implementation_count, problematic_tests)
       VALUES (?, ?, ?, ?)`
    )
    this.stmtUpdateRunStatus = db.prepare(
      `UPDATE testing_runs SET status = ?, finished_at = ? WHERE id = ?`
    )
    this.stmtGetRun = db.prepare(`SELECT * FROM testing_runs WHERE id = ?`)
    this.stmtListFindings = db.prepare(`SELECT * FROM testing_findings WHERE run_id = ? ORDER BY severity ASC`)
  }

  createRun(opts: {
    projectPath: string
    cyberFactoryRunId?: string
    welleId?: string
    workspaceId?: string
    testCommand?: string
  }): TestingRun {
    const id = `trun-${ulid()}`
    const now = Date.now()
    this.stmtInsertRun.run(
      id, opts.cyberFactoryRunId ?? null, opts.welleId ?? null,
      'pending', now, opts.projectPath, opts.workspaceId ?? null, opts.testCommand ?? null
    )
    return {
      id, cyberFactoryRunId: opts.cyberFactoryRunId ?? null,
      welleId: opts.welleId ?? null, status: 'pending',
      startedAt: now, finishedAt: null, projectPath: opts.projectPath,
      workspaceId: opts.workspaceId ?? null, testCommand: opts.testCommand ?? null,
    }
  }

  getRun(id: string): TestingRun | null {
    const row = this.stmtGetRun.get(id) as any
    if (!row) return null
    return {
      id: row.id, cyberFactoryRunId: row.cyber_factory_run_id,
      welleId: row.welle_id, status: row.status as TestingRunStatus,
      startedAt: row.started_at, finishedAt: row.finished_at,
      projectPath: row.project_path, workspaceId: row.workspace_id,
      testCommand: row.test_command,
    }
  }

  updateStatus(id: string, status: TestingRunStatus): void {
    const finishedAt = (status === 'completed' || status === 'failed') ? Date.now() : null
    this.stmtUpdateRunStatus.run(status, finishedAt, id)
  }

  addFinding(opts: {
    runId: string
    severity: FindingSeverity
    category: FindingCategory
    description: string
    filePath?: string
    lineNumber?: number
    reproduction?: string
    suggestion?: string
  }): Finding {
    const id = `tfnd-${ulid()}`
    this.stmtInsertFinding.run(
      id, opts.runId, opts.severity, opts.category,
      opts.filePath ?? null, opts.lineNumber ?? null,
      opts.description, opts.reproduction ?? null, opts.suggestion ?? null
    )
    return {
      id, runId: opts.runId, severity: opts.severity, category: opts.category,
      filePath: opts.filePath ?? null, lineNumber: opts.lineNumber ?? null,
      description: opts.description, reproduction: opts.reproduction ?? null,
      suggestion: opts.suggestion ?? null,
    }
  }

  listFindings(runId: string): Finding[] {
    const rows = this.stmtListFindings.all(runId) as any[]
    return rows.map(r => ({
      id: r.id, runId: r.run_id, severity: r.severity as FindingSeverity,
      category: r.category as FindingCategory, filePath: r.file_path,
      lineNumber: r.line_number, description: r.description,
      reproduction: r.reproduction, suggestion: r.suggestion,
    }))
  }

  saveSuiteResult(result: TestSuiteResult): void {
    this.stmtInsertSuiteResult.run(
      result.runId, result.total, result.passed, result.failed, result.rawOutput
    )
  }

  saveQualityReport(report: TestQualityReport): void {
    this.stmtInsertQualityReport.run(
      report.runId, report.behavioralCount, report.implementationCount,
      JSON.stringify(report.problematicTests)
    )
  }
}
