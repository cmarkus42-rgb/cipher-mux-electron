import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlinkSync, existsSync } from 'node:fs'
import { MemoryStore } from '../../../src/main/companion/memory-store.js'

function makeTmpPath(): string {
  return join(tmpdir(), `workspace-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('MemoryStore — workspace scope', () => {
  let store: MemoryStore
  let dbPath: string

  beforeEach(() => {
    dbPath = makeTmpPath()
    store = new MemoryStore(dbPath)
  })

  afterEach(() => {
    store.close()
    if (existsSync(dbPath)) unlinkSync(dbPath)
  })

  it('writes memory with default user scope', () => {
    const mem = store.write({ text: 'user fact', kind: 'fact' })
    assert.equal(mem.scopeKind, 'user')
    assert.equal(mem.scopeId, null)

    const recalled = store.recall({ limit: 1 })
    assert.equal(recalled.length, 1)
    assert.equal(recalled[0].scopeKind, 'user')
    assert.equal(recalled[0].scopeId, null)
  })

  it('writes memory with workspace scope', () => {
    const mem = store.write({
      text: 'workspace fact',
      kind: 'fact',
      scopeKind: 'workspace',
      scopeId: 'ws-cipher-mux',
    })
    assert.equal(mem.scopeKind, 'workspace')
    assert.equal(mem.scopeId, 'ws-cipher-mux')

    const recalled = store.recall({ limit: 1 })
    assert.equal(recalled[0].scopeKind, 'workspace')
    assert.equal(recalled[0].scopeId, 'ws-cipher-mux')
  })

  it('recall filters by scope_kind', () => {
    store.write({ text: 'user memory', kind: 'fact' })
    store.write({ text: 'workspace mem 1', kind: 'fact', scopeKind: 'workspace', scopeId: 'ws-1' })
    store.write({ text: 'workspace mem 2', kind: 'preference', scopeKind: 'workspace', scopeId: 'ws-1' })

    const wsMemories = store.recall({ scopeKind: 'workspace' })
    assert.equal(wsMemories.length, 2)
    assert.ok(wsMemories.every(m => m.scopeKind === 'workspace'))
  })

  it('recall without scope filter returns all', () => {
    store.write({ text: 'user memory', kind: 'fact' })
    store.write({ text: 'workspace memory', kind: 'fact', scopeKind: 'workspace', scopeId: 'ws-2' })

    const all = store.recall()
    assert.equal(all.length, 2)
  })

  it('existing memories default to user scope', () => {
    store.write({ text: 'unscoped fact', kind: 'fact' })

    const userMemories = store.recall({ scopeKind: 'user' })
    assert.equal(userMemories.length, 1)
    assert.equal(userMemories[0].scopeKind, 'user')
    assert.equal(userMemories[0].scopeId, null)
  })

  it('cyber factory tables exist', () => {
    const db = store.getDatabase()
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cyber_factory_runs', 'wellen', 'sub_projekte') ORDER BY name"
    ).all() as Array<{ name: string }>

    const tableNames = tables.map(t => t.name)
    assert.ok(tableNames.includes('cyber_factory_runs'), 'cyber_factory_runs table missing')
    assert.ok(tableNames.includes('wellen'), 'wellen table missing')
    assert.ok(tableNames.includes('sub_projekte'), 'sub_projekte table missing')
  })
})
