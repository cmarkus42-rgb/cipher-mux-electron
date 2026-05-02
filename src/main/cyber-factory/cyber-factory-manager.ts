import { ulid } from 'ulidx'
import type { MemoryStore } from '../companion/memory-store'
import type {
  CyberFactoryRun,
  CyberFactoryRunStatus,
  Welle,
  WelleStatus,
  SubProjekt,
  SubProjektStatus,
  ModelChoice,
} from './types'

// ─── Options ──────────────────────────────────────────────

export interface CreateRunOpts {
  detailSpecPath: string
  projectPath: string
  workspaceId?: string
  config?: Record<string, unknown>
}

export interface CreateSubProjektOpts {
  name: string
  auftragPath?: string
  model?: ModelChoice
  tokenBudget?: number
}

export interface UpdateSubProjektOpts {
  status?: SubProjektStatus
  tmuxSession?: string
  sessionId?: string
  currentPhase?: string
  lastHeartbeat?: number
}

// ─── Raw DB row types ──────────────────────────────────────

interface RawRunRow {
  id: string
  detail_spec_path: string
  project_path: string
  workspace_id: string | null
  status: string
  started_at: number
  finished_at: number | null
  config: string | null
}

interface RawWelleRow {
  id: string
  run_id: string
  reihenfolge: number
  status: string
  started_at: number | null
  finished_at: number | null
}

interface RawSubProjektRow {
  id: string
  welle_id: string
  name: string
  auftrag_path: string | null
  model: string | null
  token_budget: number | null
  status: string
  tmux_session: string | null
  session_id: string | null
  current_phase: string | null
  last_heartbeat: number | null
}

// ─── Row mappers ──────────────────────────────────────────

function rowToRun(row: RawRunRow): CyberFactoryRun {
  return {
    id: row.id,
    detailSpecPath: row.detail_spec_path,
    projectPath: row.project_path,
    workspaceId: row.workspace_id,
    status: row.status as CyberFactoryRunStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    config: row.config ? JSON.parse(row.config) : null,
  }
}

function rowToWelle(row: RawWelleRow): Welle {
  return {
    id: row.id,
    runId: row.run_id,
    reihenfolge: row.reihenfolge,
    status: row.status as WelleStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

function rowToSubProjekt(row: RawSubProjektRow): SubProjekt {
  return {
    id: row.id,
    welleId: row.welle_id,
    name: row.name,
    auftragPath: row.auftrag_path,
    model: row.model as ModelChoice | null,
    tokenBudget: row.token_budget,
    status: row.status as SubProjektStatus,
    tmuxSession: row.tmux_session,
    sessionId: row.session_id,
    currentPhase: row.current_phase,
    lastHeartbeat: row.last_heartbeat,
  }
}

// ─── Terminal statuses that set finished_at ───────────────

const TERMINAL_RUN_STATUSES: ReadonlySet<CyberFactoryRunStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
])

// ─── Manager ──────────────────────────────────────────────

export class CyberFactoryManager {
  private stmtInsertRun
  private stmtGetRun
  private stmtUpdateRunStatus
  private stmtUpdateRunStatusFinished

  private stmtInsertWelle
  private stmtListWellen

  private stmtInsertSubProjekt
  private stmtGetSubProjekt
  private stmtListSubProjekte

  constructor(private readonly memoryStore: MemoryStore) {
    const db = memoryStore.getDatabase()

    // Runs
    this.stmtInsertRun = db.prepare(
      `INSERT INTO cyber_factory_runs
         (id, detail_spec_path, project_path, workspace_id, status, started_at, finished_at, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.stmtGetRun = db.prepare(
      `SELECT id, detail_spec_path, project_path, workspace_id, status, started_at, finished_at, config
       FROM cyber_factory_runs WHERE id = ?`
    )
    this.stmtUpdateRunStatus = db.prepare(
      `UPDATE cyber_factory_runs SET status = ? WHERE id = ?`
    )
    this.stmtUpdateRunStatusFinished = db.prepare(
      `UPDATE cyber_factory_runs SET status = ?, finished_at = ? WHERE id = ?`
    )

    // Wellen
    this.stmtInsertWelle = db.prepare(
      `INSERT INTO wellen (id, run_id, reihenfolge, status, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    this.stmtListWellen = db.prepare(
      `SELECT id, run_id, reihenfolge, status, started_at, finished_at
       FROM wellen WHERE run_id = ? ORDER BY reihenfolge ASC`
    )

    // Sub-Projekte
    this.stmtInsertSubProjekt = db.prepare(
      `INSERT INTO sub_projekte
         (id, welle_id, name, auftrag_path, model, token_budget, status,
          tmux_session, session_id, current_phase, last_heartbeat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.stmtGetSubProjekt = db.prepare(
      `SELECT id, welle_id, name, auftrag_path, model, token_budget, status,
              tmux_session, session_id, current_phase, last_heartbeat
       FROM sub_projekte WHERE id = ?`
    )
    this.stmtListSubProjekte = db.prepare(
      `SELECT id, welle_id, name, auftrag_path, model, token_budget, status,
              tmux_session, session_id, current_phase, last_heartbeat
       FROM sub_projekte WHERE welle_id = ?`
    )
  }

  // ─── Runs ──────────────────────────────────────────────

  createRun(opts: CreateRunOpts): CyberFactoryRun {
    const id = `cf-${ulid()}`
    const startedAt = Date.now()
    const configJson = opts.config ? JSON.stringify(opts.config) : null

    this.stmtInsertRun.run(
      id,
      opts.detailSpecPath,
      opts.projectPath,
      opts.workspaceId ?? null,
      'pending',
      startedAt,
      null,
      configJson,
    )

    return {
      id,
      detailSpecPath: opts.detailSpecPath,
      projectPath: opts.projectPath,
      workspaceId: opts.workspaceId ?? null,
      status: 'pending',
      startedAt,
      finishedAt: null,
      config: opts.config ? (opts.config as CyberFactoryRun['config']) : null,
    }
  }

  getRun(id: string): CyberFactoryRun | null {
    const row = this.stmtGetRun.get(id) as RawRunRow | undefined
    return row ? rowToRun(row) : null
  }

  updateRunStatus(id: string, status: CyberFactoryRunStatus): void {
    if (TERMINAL_RUN_STATUSES.has(status)) {
      this.stmtUpdateRunStatusFinished.run(status, Date.now(), id)
    } else {
      this.stmtUpdateRunStatus.run(status, id)
    }
  }

  // ─── Wellen ────────────────────────────────────────────

  createWelle(runId: string, reihenfolge: number): Welle {
    const id = `welle-${ulid()}`

    this.stmtInsertWelle.run(id, runId, reihenfolge, 'pending', null, null)

    return {
      id,
      runId,
      reihenfolge,
      status: 'pending',
      startedAt: null,
      finishedAt: null,
    }
  }

  listWellen(runId: string): Welle[] {
    const rows = this.stmtListWellen.all(runId) as RawWelleRow[]
    return rows.map(rowToWelle)
  }

  // ─── Sub-Projekte ──────────────────────────────────────

  createSubProjekt(welleId: string, opts: CreateSubProjektOpts): SubProjekt {
    const id = `sp-${ulid()}`

    this.stmtInsertSubProjekt.run(
      id,
      welleId,
      opts.name,
      opts.auftragPath ?? null,
      opts.model ?? null,
      opts.tokenBudget ?? null,
      'pending',
      null,
      null,
      null,
      null,
    )

    return {
      id,
      welleId,
      name: opts.name,
      auftragPath: opts.auftragPath ?? null,
      model: opts.model ?? null,
      tokenBudget: opts.tokenBudget ?? null,
      status: 'pending',
      tmuxSession: null,
      sessionId: null,
      currentPhase: null,
      lastHeartbeat: null,
    }
  }

  getSubProjekt(id: string): SubProjekt | null {
    const row = this.stmtGetSubProjekt.get(id) as RawSubProjektRow | undefined
    return row ? rowToSubProjekt(row) : null
  }

  listSubProjekte(welleId: string): SubProjekt[] {
    const rows = this.stmtListSubProjekte.all(welleId) as RawSubProjektRow[]
    return rows.map(rowToSubProjekt)
  }

  updateSubProjekt(id: string, opts: UpdateSubProjektOpts): void {
    const db = this.memoryStore.getDatabase()

    const setClauses: string[] = []
    const params: unknown[] = []

    if (opts.status !== undefined) { setClauses.push('status = ?'); params.push(opts.status) }
    if (opts.tmuxSession !== undefined) { setClauses.push('tmux_session = ?'); params.push(opts.tmuxSession) }
    if (opts.sessionId !== undefined) { setClauses.push('session_id = ?'); params.push(opts.sessionId) }
    if (opts.currentPhase !== undefined) { setClauses.push('current_phase = ?'); params.push(opts.currentPhase) }
    if (opts.lastHeartbeat !== undefined) { setClauses.push('last_heartbeat = ?'); params.push(opts.lastHeartbeat) }

    if (setClauses.length === 0) return

    params.push(id)
    db.prepare(`UPDATE sub_projekte SET ${setClauses.join(', ')} WHERE id = ?`).run(...params)
  }
}
