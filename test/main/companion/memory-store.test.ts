/**
 * Tests for MemoryStore — SP-4 quality gate T1-T14.
 * Covers: CRUD, FTS5, recall, search, forget, schema migration.
 */
import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { MemoryStore } from '../../../src/main/companion/memory-store'

let tmpDir: string
let store: MemoryStore

describe('MemoryStore (SP-4)', () => {
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-test-'))
    store = new MemoryStore(path.join(tmpDir, 'companion.db'))
  })

  after(() => {
    store.close()
    fs.rm(tmpDir, { recursive: true, force: true })
  })

  // T12: Schema migration on fresh DB
  it('T12: creates all tables and triggers on fresh DB', () => {
    const db = store.getDatabase()
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>
    const tableNames = tables.map(t => t.name)
    assert.ok(tableNames.includes('memories'), 'memories table exists')
    assert.ok(tableNames.includes('memories_fts'), 'memories_fts table exists')
    assert.ok(tableNames.includes('user_profile'), 'user_profile table exists')
    assert.ok(tableNames.includes('persona_state'), 'persona_state table exists')
    assert.ok(tableNames.includes('pending_updates'), 'pending_updates table exists')

    // Verify WAL mode
    const journal = db.pragma('journal_mode', { simple: true }) as string
    assert.equal(journal, 'wal')

    // Verify triggers
    const triggers = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger'"
    ).all() as Array<{ name: string }>
    const triggerNames = triggers.map(t => t.name)
    assert.ok(triggerNames.includes('memories_ai'), 'insert trigger exists')
    assert.ok(triggerNames.includes('memories_ad'), 'delete trigger exists')
  })

  // T1: write() with all fields
  it('T1: write() creates memory with all fields', () => {
    const m = store.write({
      text: 'User prefers dark themes',
      kind: 'preference',
      sessionId: 'session-1',
      persona: 'relay',
      salience: 0.8,
      ttlDays: 30,
      sourceExcerpt: 'from settings discussion',
    })
    assert.ok(m.id, 'has id')
    assert.ok(m.ts > 0, 'has timestamp')
    assert.equal(m.text, 'User prefers dark themes')
    assert.equal(m.kind, 'preference')
    assert.equal(m.sessionId, 'session-1')
    assert.equal(m.persona, 'relay')
    assert.equal(m.salience, 0.8)
    assert.equal(m.ttlDays, 30)
    assert.equal(m.sourceExcerpt, 'from settings discussion')
  })

  // T13: FTS5 trigger — insert updates FTS5
  it('T13: FTS5 trigger updates on insert — search finds new text', () => {
    store.write({ text: 'Kubernetes deployment strategy for microservices', kind: 'fact' })
    const results = store.search('Kubernetes microservices')
    assert.ok(results.length > 0, 'FTS5 finds the inserted memory')
    assert.ok(results[0].text.includes('Kubernetes'), 'correct result returned')
  })

  // T2: recall() default — last 20, newest first
  it('T2: recall() returns last 20 memories, newest first', () => {
    // Write enough memories
    for (let i = 0; i < 5; i++) {
      store.write({ text: `Memory entry ${i}`, kind: 'fact' })
    }
    const all = store.recall()
    assert.ok(all.length <= 20, 'respects default limit')
    assert.ok(all.length >= 5, 'returns all written memories')
    // Newest first
    for (let i = 1; i < all.length; i++) {
      assert.ok(all[i - 1].ts >= all[i].ts, 'sorted newest first')
    }
  })

  // T3: recall() with limit + since
  it('T3: recall() with limit and since filter', () => {
    const before = Date.now()
    store.write({ text: 'Recent memory for filter test', kind: 'event' })
    const filtered = store.recall({ limit: 5, since: before })
    assert.ok(filtered.length >= 1, 'returns recent memory')
    assert.ok(filtered.every(m => m.ts >= before), 'all results are after since timestamp')
  })

  // T4: search("keyword") — FTS5 results, ranked
  it('T4: search() returns FTS5 matches ranked', () => {
    store.write({ text: 'React component architecture patterns', kind: 'fact' })
    store.write({ text: 'React hooks best practices guide', kind: 'fact' })
    const results = store.search('React')
    assert.ok(results.length >= 2, 'finds multiple matches')
    assert.ok(results.every(r => r.text.includes('React')), 'all results contain search term')
    assert.ok(results.every(r => r.score !== undefined), 'all results have score')
  })

  // T5: search() with no results
  it('T5: search() returns empty array for no matches', () => {
    const results = store.search('xyznonexistenttermzzz')
    assert.deepEqual(results, [])
  })

  // T6: forget() — deletes memory + FTS5
  it('T6: forget() deletes memory and FTS5 entry', () => {
    const m = store.write({ text: 'Temporary memory to delete fts test', kind: 'interaction' })
    // Verify searchable
    const beforeDelete = store.search('Temporary memory to delete fts test')
    assert.ok(beforeDelete.length > 0, 'found before delete')

    const deleted = store.forget(m.id)
    assert.equal(deleted, true, 'forget returns true')

    // T14: FTS5 trigger — delete cleans FTS5
    const afterDelete = store.search('Temporary memory to delete fts test')
    assert.equal(afterDelete.length, 0, 'FTS5 cleaned after delete')
  })

  // T7: forget() with invalid ID
  it('T7: forget() returns false for invalid ID', () => {
    const result = store.forget('nonexistent-id-12345')
    assert.equal(result, false)
  })

  // Profile CRUD
  it('profile: get/set/getAll', () => {
    store.profileSet('display_name', '"Christian"')
    store.profileSet('role', '"Developer"')

    const name = store.profileGet('display_name')
    assert.ok(name)
    assert.equal(name.value, '"Christian"')

    const all = store.profileGetAll()
    assert.ok(all.length >= 2)
  })

  // Persona state CRUD
  it('persona state: get/set/getAll', () => {
    store.personaSet('display_name', 'Relay', false)
    store.personaSet('core_prompt', 'frozen prompt', true)

    const dn = store.personaGet('display_name')
    assert.ok(dn)
    assert.equal(dn.value, 'Relay')
    assert.equal(dn.isFrozen, false)

    const cp = store.personaGet('core_prompt')
    assert.ok(cp)
    assert.equal(cp.isFrozen, true)

    const all = store.personaGetAll()
    assert.ok(all.length >= 2)
  })

  // Pending updates CRUD
  it('pending updates: create/list/accept/reject', () => {
    const pu = store.pendingCreate({
      target: 'profile.role',
      proposedValue: '"Senior Developer"',
      currentValue: '"Developer"',
      reasoning: 'User mentioned promotion',
      evidenceMemoryIds: ['mem-1', 'mem-2'],
    })
    assert.ok(pu.id)
    assert.equal(pu.status, 'pending')
    assert.deepEqual(pu.evidenceMemoryIds, ['mem-1', 'mem-2'])

    const pending = store.pendingList('pending')
    assert.ok(pending.some(p => p.id === pu.id))

    store.pendingSetStatus(pu.id, 'accepted')
    const accepted = store.pendingGet(pu.id)
    assert.ok(accepted)
    assert.equal(accepted.status, 'accepted')

    // Create another and reject
    const pu2 = store.pendingCreate({ target: 'persona.tone_annotations', proposedValue: '["concise"]' })
    store.pendingSetStatus(pu2.id, 'rejected')
    const rejected = store.pendingGet(pu2.id)
    assert.ok(rejected)
    assert.equal(rejected.status, 'rejected')
  })

  // Recall with kind filter
  it('recall with kind filter returns only matching kind', () => {
    store.write({ text: 'An event memory', kind: 'event' })
    store.write({ text: 'A preference memory', kind: 'preference' })
    const events = store.recall({ kindFilter: 'event' })
    assert.ok(events.every(m => m.kind === 'event'), 'all results are events')
  })

  // Search with empty query
  it('search with empty query returns empty', () => {
    assert.deepEqual(store.search(''), [])
    assert.deepEqual(store.search('   '), [])
  })
})
