import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import matter from 'gray-matter'
import { TagIndex } from '../../src/main/notes/tag-index'
import { TagClassRepo } from '../../src/main/notes/tag-repository'

/** Write a minimal note file with tags. */
function writeNote(dir: string, id: string, tags: string[]): void {
  const fm = { title: `Note ${id}`, tags, created: '2026-01-01', modified: '2026-01-01' }
  const content = matter.stringify(`\n# Note ${id}\n\nBody of ${id}.`, fm)
  fs.writeFileSync(path.join(dir, `${id}.md`), content, 'utf-8')
}

describe('TagIndex', () => {
  let tmpDir: string
  let tagClassRepo: TagClassRepo
  let index: TagIndex

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-index-test-'))
    tagClassRepo = new TagClassRepo(tmpDir)
    index = new TagIndex(tmpDir, tagClassRepo)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ─── rebuild ───────────────────────────────────────────

  it('builds index from notes on disk', () => {
    writeNote(tmpDir, 'n1', ['kind:bugreport', 'status:open'])
    writeNote(tmpDir, 'n2', ['kind:feature', 'status:open'])
    writeNote(tmpDir, 'n3', ['kind:bugreport', 'domain:trading'])

    const data = index.rebuild()
    assert.equal(data.totalNotes, 3)
    assert.deepEqual(data.tagToNoteIds['kind:bugreport']?.sort(), ['n1', 'n3'])
    assert.deepEqual(data.tagToNoteIds['status:open']?.sort(), ['n1', 'n2'])
    assert.deepEqual(data.tagToNoteIds['kind:feature'], ['n2'])
    assert.deepEqual(data.tagToNoteIds['domain:trading'], ['n3'])
  })

  it('populates classValueCounts', () => {
    writeNote(tmpDir, 'n1', ['kind:bugreport', 'status:open'])
    writeNote(tmpDir, 'n2', ['kind:feature', 'status:open'])

    const data = index.rebuild()
    assert.equal(data.classValueCounts['kind']['bugreport'], 1)
    assert.equal(data.classValueCounts['kind']['feature'], 1)
    assert.equal(data.classValueCounts['status']['open'], 2)
  })

  it('handles empty directory', () => {
    const data = index.rebuild()
    assert.equal(data.totalNotes, 0)
    assert.deepEqual(data.tagToNoteIds, {})
  })

  it('handles notes without tags', () => {
    const fm = { title: 'No Tags', tags: [], created: '2026-01-01', modified: '2026-01-01' }
    const content = matter.stringify('\n# No Tags\n\nBody.', fm)
    fs.writeFileSync(path.join(tmpDir, 'empty.md'), content, 'utf-8')

    const data = index.rebuild()
    assert.equal(data.totalNotes, 1)
    assert.deepEqual(data.tagToNoteIds, {})
  })

  it('handles legacy tags (no colon)', () => {
    writeNote(tmpDir, 'n1', ['trading', 'kind:bugreport'])

    const data = index.rebuild()
    assert.deepEqual(data.tagToNoteIds['trading'], ['n1'])
    assert.deepEqual(data.tagToNoteIds['kind:bugreport'], ['n1'])
    // Legacy tags should not appear in classValueCounts
    assert.equal(data.classValueCounts['trading'], undefined)
    // But class:value should
    assert.equal(data.classValueCounts['kind']['bugreport'], 1)
  })

  it('auto-registers unknown class:value in TagClassRepo on rebuild', () => {
    writeNote(tmpDir, 'n1', ['priority:high'])
    index.rebuild()

    const repo = tagClassRepo.getRepository()
    assert.ok(repo.classes.priority, 'should auto-register priority class')
    assert.ok(repo.classes.priority.values.includes('high'))
  })

  it('sets builtAt timestamp', () => {
    const before = new Date().toISOString()
    const data = index.rebuild()
    assert.ok(data.builtAt >= before)
  })

  // ─── getNoteIds ────────────────────────────────────────

  it('returns note IDs for a tag', () => {
    writeNote(tmpDir, 'n1', ['kind:bugreport'])
    writeNote(tmpDir, 'n2', ['kind:bugreport'])
    index.rebuild()

    const ids = index.getNoteIds('kind:bugreport')
    assert.deepEqual(ids.sort(), ['n1', 'n2'])
  })

  it('returns empty array for unknown tag', () => {
    index.rebuild()
    assert.deepEqual(index.getNoteIds('nonexistent'), [])
  })

  // ─── getClassCounts ────────────────────────────────────

  it('returns class value counts', () => {
    writeNote(tmpDir, 'n1', ['kind:bugreport'])
    writeNote(tmpDir, 'n2', ['kind:feature'])
    writeNote(tmpDir, 'n3', ['kind:bugreport'])
    index.rebuild()

    const counts = index.getClassCounts('kind')
    assert.equal(counts['bugreport'], 2)
    assert.equal(counts['feature'], 1)
  })

  it('returns empty object for unknown class', () => {
    index.rebuild()
    assert.deepEqual(index.getClassCounts('nonexistent'), {})
  })

  // ─── addNote (incremental) ─────────────────────────────

  it('adds a note incrementally', () => {
    index.rebuild()
    index.addNote('new1', ['kind:bugreport', 'status:open'])

    const data = index.getIndex()
    assert.deepEqual(data.tagToNoteIds['kind:bugreport'], ['new1'])
    assert.deepEqual(data.tagToNoteIds['status:open'], ['new1'])
    assert.equal(data.totalNotes, 1)
    assert.equal(data.classValueCounts['kind']['bugreport'], 1)
  })

  it('does not duplicate note ID on re-add', () => {
    index.rebuild()
    index.addNote('n1', ['kind:bugreport'])
    index.addNote('n1', ['kind:bugreport'])

    assert.deepEqual(index.getNoteIds('kind:bugreport'), ['n1'])
  })

  // ─── updateNote (incremental) ──────────────────────────

  it('updates a note, replacing old tags', () => {
    writeNote(tmpDir, 'n1', ['kind:bugreport', 'status:open'])
    index.rebuild()

    index.updateNote('n1', ['kind:feature', 'status:done'])

    assert.deepEqual(index.getNoteIds('kind:bugreport'), [])
    assert.deepEqual(index.getNoteIds('status:open'), [])
    assert.deepEqual(index.getNoteIds('kind:feature'), ['n1'])
    assert.deepEqual(index.getNoteIds('status:done'), ['n1'])
  })

  it('updates classValueCounts after update', () => {
    writeNote(tmpDir, 'n1', ['kind:bugreport'])
    writeNote(tmpDir, 'n2', ['kind:bugreport'])
    index.rebuild()

    index.updateNote('n1', ['kind:feature'])

    const counts = index.getClassCounts('kind')
    assert.equal(counts['bugreport'], 1)
    assert.equal(counts['feature'], 1)
  })

  // ─── removeNote (incremental) ──────────────────────────

  it('removes a note from the index', () => {
    writeNote(tmpDir, 'n1', ['kind:bugreport'])
    writeNote(tmpDir, 'n2', ['kind:bugreport'])
    index.rebuild()

    index.removeNote('n1')

    assert.deepEqual(index.getNoteIds('kind:bugreport'), ['n2'])
    const data = index.getIndex()
    assert.equal(data.totalNotes, 1)
  })

  it('removes empty tag entries on note removal', () => {
    writeNote(tmpDir, 'n1', ['kind:bugreport'])
    index.rebuild()

    index.removeNote('n1')

    const data = index.getIndex()
    assert.equal(data.tagToNoteIds['kind:bugreport'], undefined)
  })

  // ─── Performance ──────────────────────────────────────

  it('rebuilds 500 notes in under 2 seconds', () => {
    // Generate 500 notes
    for (let i = 0; i < 500; i++) {
      const tags = [`kind:${i % 3 === 0 ? 'bugreport' : 'feature'}`, `status:${i % 2 === 0 ? 'open' : 'done'}`]
      writeNote(tmpDir, `perf-${i}`, tags)
    }

    const start = Date.now()
    const data = index.rebuild()
    const elapsed = Date.now() - start

    assert.equal(data.totalNotes, 500)
    assert.ok(elapsed < 2000, `rebuild took ${elapsed}ms, expected < 2000ms`)
  })
})
