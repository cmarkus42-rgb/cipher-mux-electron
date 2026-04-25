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
