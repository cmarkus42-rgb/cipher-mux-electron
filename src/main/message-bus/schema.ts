/** SQLite schema for the MessageBus messages table */

export const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    topic      TEXT NOT NULL,
    sender     TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_by    TEXT NOT NULL DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_messages_topic
    ON messages (topic);

  CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages (created_at);
`
