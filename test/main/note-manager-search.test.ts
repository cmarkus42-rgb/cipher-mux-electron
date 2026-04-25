/**
 * Tests for NoteManager.search(), createHandoff(), and extended frontmatter.
 * Covers SP-2 quality gate T1-T13.
 */
import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'
import { NoteManager } from '../../src/main/notes/note-manager'

// ─── Helpers ────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'note-search-test-'))
}

// ─── NoteManager.search() ───────────────────────────────────

describe('NoteManager — search + handoff (SP-2)', () => {
  let tmpDir: string
  let mgr: NoteManager

  before(async () => {
    tmpDir = await makeTempDir()
  })

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    mgr = new NoteManager(tmpDir)
  })

  // ─── T1: read with valid ID ─────────────────────────────

  it('T1: reads note content by valid ID', async () => {
    const info = await mgr.create('global', 'Read Test', '# Read Test\n\nBody here.')
    const result = await mgr.read(info.id, 'global')
    assert.ok(result, 'should return content')
    assert.equal(result.info.id, info.id)
    assert.ok(result.body.includes('Body here.'))
  })

  // ─── T2: read with invalid ID ──────────────────────────

  it('T2: returns null for non-existent note', async () => {
    const result = await mgr.read('nonexistent-id-xyz', 'global')
    assert.equal(result, null)
  })

  // ─── T3: update only tags ──────────────────────────────

  it('T3: update only tags preserves body', async () => {
    const info = await mgr.create('global', 'Tag Only', '# Tag Only\n\nOriginal body.')
    const updated = await mgr.save(info.id, 'global', '# Tag Only\n\nOriginal body.', ['newtag'])
    assert.deepEqual(updated.tags, ['newtag'])
    const content = await mgr.read(info.id, 'global')
    assert.ok(content)
    assert.ok(content.body.includes('Original body.'))
  })

  // ─── T4: update body + tags ─────────────────────────────

  it('T4: update body + tags together', async () => {
    const info = await mgr.create('global', 'Both Update', '# Both Update\n\nOld.')
    const updated = await mgr.save(info.id, 'global', '# New Title\n\nNew body.', ['alpha', 'beta'])
    assert.equal(updated.title, 'New Title')
    assert.deepEqual(updated.tags, ['alpha', 'beta'])
    assert.ok(updated.modifiedAt >= info.modifiedAt)
  })

  // ─── T5: search with query ─────────────────────────────

  it('T5: search returns matching notes', async () => {
    const scope = 'search-scope-t5'
    await mgr.create(scope, 'Alpha Note', '# Alpha Note\n\nSome alpha content.')
    await mgr.create(scope, 'Beta Note', '# Beta Note\n\nSome beta content.')
    await mgr.create(scope, 'Gamma Note', '# Gamma Note\n\nAlpha mentioned in body.')

    const results = await mgr.search('alpha', { scope })
    assert.ok(results.length >= 2, `expected >=2 results, got ${results.length}`)
    // Title match should come first
    assert.equal(results[0].info.title, 'Alpha Note')
  })

  // ─── T6: search with tag filter ────────────────────────

  it('T6: search with tags filter returns only matching tags', async () => {
    const scope = 'search-scope-t6'
    const note1 = await mgr.create(scope, 'Tagged A', '# Tagged A\n\nContent.')
    await mgr.save(note1.id, scope, '# Tagged A\n\nContent.', ['important'])
    const note2 = await mgr.create(scope, 'Tagged B', '# Tagged B\n\nContent.')
    await mgr.save(note2.id, scope, '# Tagged B\n\nContent.', ['trivial'])

    const results = await mgr.search('Content', { scope, tags: ['important'] })
    assert.equal(results.length, 1)
    assert.equal(results[0].info.id, note1.id)
  })

  // ─── T7: search without matches ────────────────────────

  it('T7: search without matches returns empty array', async () => {
    const scope = 'search-scope-t7'
    await mgr.create(scope, 'Findable', '# Findable\n\nSomething.')
    const results = await mgr.search('xyznonexistent', { scope })
    assert.deepEqual(results, [])
  })

  // ─── T8: delete note ───────────────────────────────────

  it('T8: delete removes note', async () => {
    const info = await mgr.create('global', 'Delete Target', '# Delete Target\n\nGone.')
    const deleted = await mgr.delete(info.id, 'global')
    assert.equal(deleted, true)
    const check = await mgr.read(info.id, 'global')
    assert.equal(check, null)
  })

  // ─── T9: handoff create ────────────────────────────────

  it('T9: createHandoff creates note with correct frontmatter', async () => {
    const note = await mgr.createHandoff(
      'Handoff: Auth context',
      '# Handoff: Auth context\n\nFindings here.',
      'worker-1',
      'companion',
    )

    assert.ok(note.id)
    assert.equal(note.title, 'Handoff: Auth context')
    assert.deepEqual(note.tags, ['handoff'])
    assert.equal(note.fromSession, 'worker-1')
    assert.equal(note.toEntity, 'companion')
    assert.equal(note.handoffStatus, 'pending')
    assert.equal(note.scope, 'global')

    // Verify on disk
    const filePath = path.join(tmpDir, 'global', `${note.id}.md`)
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = matter(raw)
    assert.equal(parsed.data.from_session, 'worker-1')
    assert.equal(parsed.data.to_entity, 'companion')
    assert.equal(parsed.data.handoff_status, 'pending')
  })

  // ─── T10: handoff search by to_entity ──────────────────

  it('T10: handoff search filters by to_entity', async () => {
    const freshDir = await makeTempDir()
    const freshMgr = new NoteManager(freshDir)

    await freshMgr.createHandoff('H1', 'Body1', 'sess-a', 'companion')
    await freshMgr.createHandoff('H2', 'Body2', 'sess-b', 'reviewer')
    await freshMgr.createHandoff('H3', 'Body3', 'sess-c', 'any')

    const all = await freshMgr.list('global')
    const companionNotes = all.filter(n =>
      n.tags.includes('handoff') &&
      (n.toEntity === 'companion' || n.toEntity === 'any') &&
      (n.handoffStatus || 'pending') === 'pending'
    )
    // Should match H1 (companion) and H3 (any)
    assert.equal(companionNotes.length, 2)

    freshMgr.destroy()
    await fs.rm(freshDir, { recursive: true, force: true })
  })

  // ─── T11: handoff search by status ─────────────────────

  it('T11: handoff search filters by status', async () => {
    const freshDir = await makeTempDir()
    const freshMgr = new NoteManager(freshDir)

    const h1 = await freshMgr.createHandoff('Pending', 'Body', 'sess-a', 'any')
    // Mark h1 as consumed by re-writing frontmatter
    const filePath = path.join(freshDir, 'global', `${h1.id}.md`)
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = matter(raw)
    parsed.data.handoff_status = 'consumed'
    await fs.writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8')

    await freshMgr.createHandoff('Still Pending', 'Body2', 'sess-b', 'any')

    const all = await freshMgr.list('global')
    const consumed = all.filter(n =>
      n.tags.includes('handoff') && n.handoffStatus === 'consumed'
    )
    assert.equal(consumed.length, 1)
    assert.equal(consumed[0].id, h1.id)

    const pending = all.filter(n =>
      n.tags.includes('handoff') && (n.handoffStatus || 'pending') === 'pending'
    )
    assert.equal(pending.length, 1)

    freshMgr.destroy()
    await fs.rm(freshDir, { recursive: true, force: true })
  })

  // ─── T12: mark handoff as consumed via update ──────────

  it('T12: handoff_status can be updated via file manipulation', async () => {
    const note = await mgr.createHandoff('Consume Me', 'Body', 'sess-x', 'any')
    const filePath = path.join(tmpDir, 'global', `${note.id}.md`)

    // Simulate what mux_notes_update does
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = matter(raw)
    parsed.data.handoff_status = 'consumed'
    parsed.data.modified = new Date().toISOString()
    await fs.writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8')

    // Re-read and verify
    const updated = await mgr.read(note.id, 'global')
    assert.ok(updated)
    assert.equal(updated.info.handoffStatus, 'consumed')
  })

  // ─── T13: NoteManager.search() full contract ──────────

  it('T13: search combines fulltext + tag filter correctly', async () => {
    const scope = 'search-scope-t13'
    const n1 = await mgr.create(scope, 'API Design', '# API Design\n\nREST endpoints.')
    await mgr.save(n1.id, scope, '# API Design\n\nREST endpoints.', ['architecture'])
    const n2 = await mgr.create(scope, 'Bug Report', '# Bug Report\n\nAPI crash on null.')
    await mgr.save(n2.id, scope, '# Bug Report\n\nAPI crash on null.', ['bug'])
    const n3 = await mgr.create(scope, 'Meeting Notes', '# Meeting Notes\n\nDiscussed API.')
    await mgr.save(n3.id, scope, '# Meeting Notes\n\nDiscussed API.', ['meeting'])

    // Search "API" with tag "architecture" — only n1 should match
    const results = await mgr.search('API', { scope, tags: ['architecture'] })
    assert.equal(results.length, 1)
    assert.equal(results[0].info.id, n1.id)

    // Search "API" without tag filter — all 3 should match
    const allResults = await mgr.search('API', { scope })
    assert.equal(allResults.length, 3)
    // Title match first
    assert.equal(allResults[0].info.title, 'API Design')
  })

  // ─── search: max 50 results cap ───────────────────────

  it('search caps at 50 results', async () => {
    const scope = 'search-scope-cap'
    for (let i = 0; i < 55; i++) {
      await mgr.create(scope, `Note ${i}`, `# Note ${i}\n\nCommon keyword here.`)
    }
    const results = await mgr.search('keyword', { scope })
    assert.ok(results.length <= 50, `expected <=50, got ${results.length}`)
  })

  // ─── createHandoff defaults to_entity to "any" ────────

  it('createHandoff defaults to_entity to "any"', async () => {
    const note = await mgr.createHandoff('Default Entity', 'Body', 'sess-z')
    assert.equal(note.toEntity, 'any')
  })
})
