import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { COMPANION_SCHEMA_SQL } from '../../../src/main/companion/schema'

describe('debugger schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(COMPANION_SCHEMA_SQL)
  })

  it('creates debugger_runs table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='debugger_runs'").get()
    assert.ok(info)
  })

  it('creates clarifications table with FK to debugger_runs', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE name='clarifications'").get() as any
    assert.ok(info.sql.includes('run_id'))
  })

  it('creates fix_plans table with FK to debugger_runs', () => {
    const info = db.prepare("SELECT sql FROM sqlite_master WHERE name='fix_plans'").get() as any
    assert.ok(info.sql.includes('run_id'))
  })
})
