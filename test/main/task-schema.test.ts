import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { TASK_SCHEMA_SQL } from '../../src/main/task/task-schema'

describe('Task schema', () => {
  it('should create the tasks table in a fresh database', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
    ).all()
    assert.equal(tables.length, 1)
    db.close()
  })

  it('should create all required indices', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)

    const indices = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_tasks_%'"
    ).all() as { name: string }[]
    const names = indices.map((i) => i.name).sort()

    assert.deepEqual(names, [
      'idx_tasks_parent',
      'idx_tasks_session',
      'idx_tasks_source',
      'idx_tasks_state',
    ])
    db.close()
  })

  it('should enforce foreign key on parent_id (self-referencing)', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(TASK_SCHEMA_SQL)

    const stmt = db.prepare(
      `INSERT INTO tasks (id, source, title, state, retry_count, max_retries, created_at, updated_at, parent_id)
       VALUES ('t1', 'test', 'child', 'queued', 0, 2, 1000, 1000, 'nonexistent')`
    )
    assert.throws(() => stmt.run(), /FOREIGN KEY/)
    db.close()
  })

  it('should allow null parent_id for top-level tasks', () => {
    const db = new Database(':memory:')
    db.exec(TASK_SCHEMA_SQL)

    db.prepare(
      `INSERT INTO tasks (id, source, title, state, retry_count, max_retries, created_at, updated_at)
       VALUES ('t1', 'test', 'top-level', 'queued', 0, 2, 1000, 1000)`
    ).run()

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('t1') as { title: string }
    assert.equal(row.title, 'top-level')
    db.close()
  })
})
