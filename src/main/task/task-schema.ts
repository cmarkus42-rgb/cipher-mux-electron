/** SQLite schema for the task queue */

export const TASK_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    parent_id     TEXT,
    session_id    TEXT,
    source        TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    state         TEXT NOT NULL DEFAULT 'queued',
    policy        TEXT,
    retry_count   INTEGER NOT NULL DEFAULT 0,
    max_retries   INTEGER NOT NULL DEFAULT 2,
    result        TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    completed_at  INTEGER,
    FOREIGN KEY (parent_id) REFERENCES tasks(id)
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_state
    ON tasks (state);
  CREATE INDEX IF NOT EXISTS idx_tasks_source
    ON tasks (source);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent
    ON tasks (parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_session
    ON tasks (session_id);
`
