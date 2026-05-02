-- Companion Memory Schema (SP-4)
-- Source of Truth: cipher-mux-companion-kickoff/SPEC.md §5

-- Memories (append-only, agent-curated)
-- SQLite creates an implicit INTEGER rowid alongside the TEXT PK.
-- FTS5 uses this rowid for content-sync.
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,                 -- ULID
  ts INTEGER NOT NULL,
  session_id TEXT,
  persona TEXT,                        -- e.g. 'relay'
  kind TEXT NOT NULL,                  -- 'fact'|'preference'|'interaction'|'event'
  text TEXT NOT NULL,
  salience REAL DEFAULT 0.5,           -- 0..1
  ttl_days INTEGER,                    -- NULL = forever
  embedding BLOB,                      -- 768d float32, NULL until Phase 2
  source_excerpt TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_ts ON memories(ts);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);

-- FTS5 as external-content table: content-sync via triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(text, content='memories', content_rowid='rowid');

-- Trigger: keep FTS5 in sync on INSERT and DELETE.
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;

-- User-Profile (single-row-per-field)
CREATE TABLE IF NOT EXISTS user_profile (
  field TEXT PRIMARY KEY,
  value TEXT NOT NULL,                 -- JSON
  updated_at INTEGER NOT NULL,
  evidence TEXT                        -- last accepted pending_update.id
);

-- Persona-State (display_name, core_prompt, annotations)
CREATE TABLE IF NOT EXISTS persona_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  is_frozen INTEGER DEFAULT 0
);

-- Pending-Queue (for profile + persona-annotation patches)
CREATE TABLE IF NOT EXISTS pending_updates (
  id TEXT PRIMARY KEY,                 -- ULID
  ts INTEGER NOT NULL,
  target TEXT NOT NULL,                -- 'profile.<field>' | 'persona.tone_annotations' | 'persona.self_observations'
  proposed_value TEXT NOT NULL,        -- JSON
  current_value TEXT,                  -- snapshot at proposal time
  reasoning TEXT,
  evidence_memory_ids TEXT,            -- JSON-array
  status TEXT DEFAULT 'pending'        -- 'pending'|'accepted'|'rejected'
);

CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_updates(status);
