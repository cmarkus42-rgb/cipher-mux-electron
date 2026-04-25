import Database from 'better-sqlite3'
import { ulid } from 'ulidx'
import { COMPANION_SCHEMA_SQL, COMPANION_FTS5_SQL, COMPANION_TRIGGERS_SQL } from './schema'
import type { Memory, MemoryKind, PendingUpdate, PendingUpdateStatus, ProfileField, PersonaStateEntry } from '../../shared/types'

export interface WriteMemoryOpts {
  text: string
  kind: MemoryKind
  sessionId?: string
  persona?: string
  salience?: number
  ttlDays?: number
  sourceExcerpt?: string
}

export interface RecallOpts {
  limit?: number
  kindFilter?: MemoryKind
  since?: number
}

interface RawMemoryRow {
  id: string
  ts: number
  session_id: string | null
  persona: string | null
  kind: string
  text: string
  salience: number
  ttl_days: number | null
  source_excerpt: string | null
}

interface RawFtsRow extends RawMemoryRow {
  rank: number
}

interface RawProfileRow {
  field: string
  value: string
  updated_at: number
  evidence: string | null
}

interface RawPersonaRow {
  key: string
  value: string
  updated_at: number
  is_frozen: number
}

interface RawPendingRow {
  id: string
  ts: number
  target: string
  proposed_value: string
  current_value: string | null
  reasoning: string | null
  evidence_memory_ids: string | null
  status: string
}

/**
 * Companion Memory Store — SQLite CRUD + FTS5 for the companion subsystem.
 * DB path: ~/.config/cipher-mux/companion.db
 */
export class MemoryStore {
  private db: Database.Database

  private stmtInsert: Database.Statement
  private stmtRecall: Database.Statement
  private stmtRecallSince: Database.Statement
  private stmtRecallKind: Database.Statement
  private stmtRecallKindSince: Database.Statement
  private stmtSearch: Database.Statement
  private stmtDeleteMemory: Database.Statement

  // Profile
  private stmtProfileGet: Database.Statement
  private stmtProfileGetAll: Database.Statement
  private stmtProfileUpsert: Database.Statement

  // Persona state
  private stmtPersonaGet: Database.Statement
  private stmtPersonaGetAll: Database.Statement
  private stmtPersonaUpsert: Database.Statement

  // Pending updates
  private stmtPendingInsert: Database.Statement
  private stmtPendingList: Database.Statement
  private stmtPendingUpdateStatus: Database.Statement
  private stmtPendingGet: Database.Statement

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(COMPANION_SCHEMA_SQL)

    // FTS5 + triggers — check if table exists first
    const ftsExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'"
    ).get()
    if (!ftsExists) {
      this.db.exec(COMPANION_FTS5_SQL)
    }

    // Triggers — check existence
    const triggerAi = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='memories_ai'"
    ).get()
    if (!triggerAi) {
      this.db.exec(COMPANION_TRIGGERS_SQL)
    }

    // Prepare statements
    this.stmtInsert = this.db.prepare(
      `INSERT INTO memories (id, ts, session_id, persona, kind, text, salience, ttl_days, source_excerpt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    this.stmtRecall = this.db.prepare(
      `SELECT id, ts, session_id, persona, kind, text, salience, ttl_days, source_excerpt
       FROM memories ORDER BY ts DESC LIMIT ?`
    )

    this.stmtRecallSince = this.db.prepare(
      `SELECT id, ts, session_id, persona, kind, text, salience, ttl_days, source_excerpt
       FROM memories WHERE ts >= ? ORDER BY ts DESC LIMIT ?`
    )

    this.stmtRecallKind = this.db.prepare(
      `SELECT id, ts, session_id, persona, kind, text, salience, ttl_days, source_excerpt
       FROM memories WHERE kind = ? ORDER BY ts DESC LIMIT ?`
    )

    this.stmtRecallKindSince = this.db.prepare(
      `SELECT id, ts, session_id, persona, kind, text, salience, ttl_days, source_excerpt
       FROM memories WHERE kind = ? AND ts >= ? ORDER BY ts DESC LIMIT ?`
    )

    this.stmtSearch = this.db.prepare(
      `SELECT m.id, m.ts, m.session_id, m.persona, m.kind, m.text, m.salience, m.ttl_days, m.source_excerpt, fts.rank
       FROM memories_fts fts
       JOIN memories m ON m.rowid = fts.rowid
       WHERE memories_fts MATCH ?
       ORDER BY fts.rank
       LIMIT ?`
    )

    this.stmtDeleteMemory = this.db.prepare(
      `DELETE FROM memories WHERE id = ?`
    )

    // Profile
    this.stmtProfileGet = this.db.prepare(
      `SELECT field, value, updated_at, evidence FROM user_profile WHERE field = ?`
    )
    this.stmtProfileGetAll = this.db.prepare(
      `SELECT field, value, updated_at, evidence FROM user_profile ORDER BY field`
    )
    this.stmtProfileUpsert = this.db.prepare(
      `INSERT INTO user_profile (field, value, updated_at, evidence)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(field) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, evidence = excluded.evidence`
    )

    // Persona state
    this.stmtPersonaGet = this.db.prepare(
      `SELECT key, value, updated_at, is_frozen FROM persona_state WHERE key = ?`
    )
    this.stmtPersonaGetAll = this.db.prepare(
      `SELECT key, value, updated_at, is_frozen FROM persona_state ORDER BY key`
    )
    this.stmtPersonaUpsert = this.db.prepare(
      `INSERT INTO persona_state (key, value, updated_at, is_frozen)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )

    // Pending updates
    this.stmtPendingInsert = this.db.prepare(
      `INSERT INTO pending_updates (id, ts, target, proposed_value, current_value, reasoning, evidence_memory_ids, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.stmtPendingList = this.db.prepare(
      `SELECT id, ts, target, proposed_value, current_value, reasoning, evidence_memory_ids, status
       FROM pending_updates WHERE status = ? ORDER BY ts DESC`
    )
    this.stmtPendingUpdateStatus = this.db.prepare(
      `UPDATE pending_updates SET status = ? WHERE id = ?`
    )
    this.stmtPendingGet = this.db.prepare(
      `SELECT id, ts, target, proposed_value, current_value, reasoning, evidence_memory_ids, status
       FROM pending_updates WHERE id = ?`
    )
  }

  // ─── Memories CRUD ──────────────────────────────────────

  /** Write a new memory. FTS5 is updated via trigger. */
  write(opts: WriteMemoryOpts): Memory {
    const id = ulid()
    const ts = Date.now()
    this.stmtInsert.run(
      id, ts,
      opts.sessionId ?? null,
      opts.persona ?? null,
      opts.kind,
      opts.text,
      opts.salience ?? 0.5,
      opts.ttlDays ?? null,
      opts.sourceExcerpt ?? null,
    )
    return {
      id, ts,
      sessionId: opts.sessionId ?? null,
      persona: opts.persona ?? null,
      kind: opts.kind,
      text: opts.text,
      salience: opts.salience ?? 0.5,
      ttlDays: opts.ttlDays ?? null,
      sourceExcerpt: opts.sourceExcerpt ?? null,
    }
  }

  /** Recall recent memories, newest first. */
  recall(opts?: RecallOpts): Memory[] {
    const limit = opts?.limit ?? 20
    let rows: RawMemoryRow[]

    if (opts?.kindFilter && opts?.since) {
      rows = this.stmtRecallKindSince.all(opts.kindFilter, opts.since, limit) as RawMemoryRow[]
    } else if (opts?.kindFilter) {
      rows = this.stmtRecallKind.all(opts.kindFilter, limit) as RawMemoryRow[]
    } else if (opts?.since) {
      rows = this.stmtRecallSince.all(opts.since, limit) as RawMemoryRow[]
    } else {
      rows = this.stmtRecall.all(limit) as RawMemoryRow[]
    }

    return rows.map(rowToMemory)
  }

  /** Full-text search via FTS5 MATCH. Results ranked by relevance. */
  search(query: string, opts?: { limit?: number }): Memory[] {
    const limit = opts?.limit ?? 20
    if (!query.trim()) return []
    try {
      const rows = this.stmtSearch.all(query, limit) as RawFtsRow[]
      return rows.map(r => ({ ...rowToMemory(r), score: r.rank }))
    } catch {
      // FTS5 query syntax error — return empty
      return []
    }
  }

  /** Delete a memory by ID. Returns true if found and deleted. */
  forget(id: string): boolean {
    const result = this.stmtDeleteMemory.run(id)
    return result.changes > 0
  }

  // ─── User Profile ───────────────────────────────────────

  /** Get a single profile field. */
  profileGet(field: string): ProfileField | null {
    const row = this.stmtProfileGet.get(field) as RawProfileRow | undefined
    return row ? rowToProfile(row) : null
  }

  /** Get all profile fields. */
  profileGetAll(): ProfileField[] {
    return (this.stmtProfileGetAll.all() as RawProfileRow[]).map(rowToProfile)
  }

  /** Set a profile field (upsert). */
  profileSet(field: string, value: string, evidence?: string): void {
    this.stmtProfileUpsert.run(field, value, Date.now(), evidence ?? null)
  }

  // ─── Persona State ─────────────────────────────────────

  /** Get a persona state entry. */
  personaGet(key: string): PersonaStateEntry | null {
    const row = this.stmtPersonaGet.get(key) as RawPersonaRow | undefined
    return row ? rowToPersona(row) : null
  }

  /** Get all persona state entries. */
  personaGetAll(): PersonaStateEntry[] {
    return (this.stmtPersonaGetAll.all() as RawPersonaRow[]).map(rowToPersona)
  }

  /** Set a persona state entry (upsert). Does NOT change is_frozen on update. */
  personaSet(key: string, value: string, isFrozen = false): void {
    this.stmtPersonaUpsert.run(key, value, Date.now(), isFrozen ? 1 : 0)
  }

  // ─── Pending Updates ───────────────────────────────────

  /** Create a pending update. */
  pendingCreate(opts: {
    target: string
    proposedValue: string
    currentValue?: string
    reasoning?: string
    evidenceMemoryIds?: string[]
  }): PendingUpdate {
    const id = ulid()
    const ts = Date.now()
    this.stmtPendingInsert.run(
      id, ts,
      opts.target,
      opts.proposedValue,
      opts.currentValue ?? null,
      opts.reasoning ?? null,
      opts.evidenceMemoryIds ? JSON.stringify(opts.evidenceMemoryIds) : null,
      'pending',
    )
    return {
      id, ts,
      target: opts.target,
      proposedValue: opts.proposedValue,
      currentValue: opts.currentValue ?? null,
      reasoning: opts.reasoning ?? null,
      evidenceMemoryIds: opts.evidenceMemoryIds ?? null,
      status: 'pending',
    }
  }

  /** List pending updates by status. */
  pendingList(status: PendingUpdateStatus = 'pending'): PendingUpdate[] {
    return (this.stmtPendingList.all(status) as RawPendingRow[]).map(rowToPending)
  }

  /** Accept or reject a pending update. */
  pendingSetStatus(id: string, status: 'accepted' | 'rejected'): boolean {
    const result = this.stmtPendingUpdateStatus.run(status, id)
    return result.changes > 0
  }

  /** Get a single pending update. */
  pendingGet(id: string): PendingUpdate | null {
    const row = this.stmtPendingGet.get(id) as RawPendingRow | undefined
    return row ? rowToPending(row) : null
  }

  // ─── Lifecycle ─────────────────────────────────────────

  /** Close the database. */
  close(): void {
    this.db.close()
  }

  /** Expose the underlying database (for tests). */
  getDatabase(): Database.Database {
    return this.db
  }
}

// ─── Row mappers ─────────────────────────────────────────

function rowToMemory(row: RawMemoryRow): Memory {
  return {
    id: row.id,
    ts: row.ts,
    sessionId: row.session_id,
    persona: row.persona,
    kind: row.kind as MemoryKind,
    text: row.text,
    salience: row.salience,
    ttlDays: row.ttl_days,
    sourceExcerpt: row.source_excerpt,
  }
}

function rowToProfile(row: RawProfileRow): ProfileField {
  return {
    field: row.field,
    value: row.value,
    updatedAt: row.updated_at,
    evidence: row.evidence,
  }
}

function rowToPersona(row: RawPersonaRow): PersonaStateEntry {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
    isFrozen: row.is_frozen === 1,
  }
}

function rowToPending(row: RawPendingRow): PendingUpdate {
  return {
    id: row.id,
    ts: row.ts,
    target: row.target,
    proposedValue: row.proposed_value,
    currentValue: row.current_value,
    reasoning: row.reasoning,
    evidenceMemoryIds: row.evidence_memory_ids ? JSON.parse(row.evidence_memory_ids) : null,
    status: row.status as PendingUpdateStatus,
  }
}
