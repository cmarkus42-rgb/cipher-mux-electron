import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../../src/main/companion/schema'
import { cleanupSessionMemory, archiveWorkspaceMemory, deleteWorkspaceMemory } from '../../../src/main/workspace-memory/session-scope-cleanup'

describe('session-scope-cleanup', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
    // Ensure scope columns exist (idempotent migration in memory-store does this,
    // but schema.sql might not have them yet — add if missing)
    const hasScopeKind = db.prepare(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('memories') WHERE name='scope_kind'"
    ).get() as { cnt: number }
    if (hasScopeKind.cnt === 0) {
      db.exec("ALTER TABLE memories ADD COLUMN scope_kind TEXT NOT NULL DEFAULT 'user'")
      db.exec("ALTER TABLE memories ADD COLUMN scope_id TEXT")
    }
  })

  function insertMemory(scopeKind: string, scopeId: string | null, text: string) {
    db.prepare(
      `INSERT INTO memories (id, ts, kind, text, scope_kind, scope_id) VALUES (?, ?, 'fact', ?, ?, ?)`
    ).run(`m-${Math.random()}`, Date.now(), text, scopeKind, scopeId)
  }

  it('cleanupSessionMemory deletes only session-scoped entries', () => {
    insertMemory('session', 'sess-1', 'ephemeral')
    insertMemory('session', 'sess-2', 'other session')
    insertMemory('user', null, 'persistent')
    const deleted = cleanupSessionMemory(db, 'sess-1')
    assert.equal(deleted, 1)
    const remaining = db.prepare('SELECT COUNT(*) as cnt FROM memories').get() as { cnt: number }
    assert.equal(remaining.cnt, 2)
  })

  it('archiveWorkspaceMemory changes scope_kind to archived-workspace', () => {
    insertMemory('workspace', 'ws-1', 'project fact')
    insertMemory('workspace', 'ws-2', 'other workspace')
    const archived = archiveWorkspaceMemory(db, 'ws-1')
    assert.equal(archived, 1)
    const row = db.prepare("SELECT scope_kind FROM memories WHERE text = 'project fact'").get() as any
    assert.equal(row.scope_kind, 'archived-workspace')
  })

  it('deleteWorkspaceMemory permanently removes entries', () => {
    insertMemory('workspace', 'ws-1', 'gone')
    const deleted = deleteWorkspaceMemory(db, 'ws-1')
    assert.equal(deleted, 1)
    const count = db.prepare('SELECT COUNT(*) as cnt FROM memories').get() as { cnt: number }
    assert.equal(count.cnt, 0)
  })
})
