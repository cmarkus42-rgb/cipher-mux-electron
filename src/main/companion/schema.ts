/** Companion Memory SQLite schema — exported as string for better-sqlite3 exec(). */

export const COMPANION_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    session_id TEXT,
    persona TEXT,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    salience REAL DEFAULT 0.5,
    ttl_days INTEGER,
    embedding BLOB,
    source_excerpt TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_memories_ts ON memories(ts);
  CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);

  CREATE TABLE IF NOT EXISTS user_profile (
    field TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    evidence TEXT
  );

  CREATE TABLE IF NOT EXISTS persona_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    is_frozen INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pending_updates (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    target TEXT NOT NULL,
    proposed_value TEXT NOT NULL,
    current_value TEXT,
    reasoning TEXT,
    evidence_memory_ids TEXT,
    status TEXT DEFAULT 'pending'
  );

  CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_updates(status);

  CREATE TABLE IF NOT EXISTS cyber_factory_runs (
    id TEXT PRIMARY KEY,
    detail_spec_path TEXT NOT NULL,
    project_path TEXT NOT NULL,
    workspace_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    config TEXT
  );

  CREATE TABLE IF NOT EXISTS wellen (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES cyber_factory_runs(id),
    reihenfolge INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at INTEGER,
    finished_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sub_projekte (
    id TEXT PRIMARY KEY,
    welle_id TEXT NOT NULL REFERENCES wellen(id),
    name TEXT NOT NULL,
    auftrag_path TEXT,
    model TEXT,
    token_budget INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    tmux_session TEXT,
    session_id TEXT,
    current_phase TEXT,
    last_heartbeat INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_wellen_run ON wellen(run_id);
  CREATE INDEX IF NOT EXISTS idx_sub_projekte_welle ON sub_projekte(welle_id);

  CREATE TABLE IF NOT EXISTS debugger_runs (
    id TEXT PRIMARY KEY,
    bug_report_id TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    severity TEXT NOT NULL DEFAULT 'medium',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'intake',
    retry_count INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    project_path TEXT NOT NULL,
    workspace_id TEXT
  );

  CREATE TABLE IF NOT EXISTS clarifications (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES debugger_runs(id),
    question TEXT NOT NULL,
    options TEXT,
    answer TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_clarifications_run ON clarifications(run_id);

  CREATE TABLE IF NOT EXISTS fix_plans (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES debugger_runs(id),
    hypothesis TEXT NOT NULL,
    confidence_level TEXT NOT NULL DEFAULT 'likely',
    plan_md TEXT NOT NULL,
    test_extension TEXT NOT NULL DEFAULT '',
    risk_assessment TEXT NOT NULL DEFAULT '',
    effort TEXT NOT NULL DEFAULT 'small',
    status TEXT NOT NULL DEFAULT 'draft',
    user_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_fix_plans_run ON fix_plans(run_id);
`

/**
 * FTS5 setup — must run AFTER base schema because FTS5 references the memories table.
 * Separated because CREATE VIRTUAL TABLE IF NOT EXISTS is not supported by all
 * SQLite builds for FTS5 external-content tables. We check existence first.
 */
export const COMPANION_FTS5_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(text, content='memories', content_rowid='rowid');
`

export const COMPANION_TRIGGERS_SQL = `
  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, text) VALUES (new.rowid, new.text);
  END;
  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  END;
`
