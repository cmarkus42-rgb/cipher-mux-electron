import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import path from 'path'
import os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'note-bulk-ops-test-'))
}

// ─── Trash + Restore (REQ-NOTES-006) ────────────────────────

describe('NoteManager — Trash & Restore', () => {
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

  it('trash() moves note to .trash/ directory', async () => {
    const note = await mgr.create('Trash Me', '# Trash Me\n\nBody')
    const ok = await mgr.trash(note.id)

    assert.equal(ok, true)
    // File should no longer exist in notes dir
    const notePath = path.join(tmpDir, `${note.id}.md`)
    assert.equal(fsSync.existsSync(notePath), false, 'note should be removed from notesDir')
    // File should exist in .trash/
    const trashPath = path.join(tmpDir, '.trash', `${note.id}.md`)
    assert.equal(fsSync.existsSync(trashPath), true, 'note should be in .trash/')
  })

  it('restore() moves note back from .trash/', async () => {
    const note = await mgr.create('Restore Me', '# Restore Me\n\nBody')
    await mgr.trash(note.id)
    const ok = await mgr.restore(note.id)

    assert.equal(ok, true)
    const notePath = path.join(tmpDir, `${note.id}.md`)
    assert.equal(fsSync.existsSync(notePath), true, 'note should be back in notesDir')
    const trashPath = path.join(tmpDir, '.trash', `${note.id}.md`)
    assert.equal(fsSync.existsSync(trashPath), false, 'note should be gone from .trash/')
  })

  it('trashMany() moves multiple notes', async () => {
    const n1 = await mgr.create('Bulk1', '# Bulk1')
    const n2 = await mgr.create('Bulk2', '# Bulk2')
    const n3 = await mgr.create('Bulk3', '# Bulk3')

    const trashed = await mgr.trashMany([n1.id, n2.id, n3.id])
    assert.equal(trashed.length, 3)

    for (const id of trashed) {
      assert.equal(fsSync.existsSync(path.join(tmpDir, `${id}.md`)), false)
      assert.equal(fsSync.existsSync(path.join(tmpDir, '.trash', `${id}.md`)), true)
    }
  })

  it('restoreMany() restores multiple notes', async () => {
    const n1 = await mgr.create('RestoreMany1', '# RM1')
    const n2 = await mgr.create('RestoreMany2', '# RM2')

    await mgr.trashMany([n1.id, n2.id])
    const restored = await mgr.restoreMany([n1.id, n2.id])

    assert.equal(restored.length, 2)
    for (const id of restored) {
      assert.equal(fsSync.existsSync(path.join(tmpDir, `${id}.md`)), true)
    }
  })

  it('trash() returns false for non-existent note', async () => {
    const ok = await mgr.trash('nonexistent-id')
    assert.equal(ok, false)
  })

  it('restore() returns false for non-existent trash entry', async () => {
    const ok = await mgr.restore('nonexistent-id')
    assert.equal(ok, false)
  })

  it('trashed note does not appear in list()', async () => {
    const note = await mgr.create('Hidden', '# Hidden\n\nShould not list')
    await mgr.trash(note.id)

    const all = await mgr.list()
    const found = all.find(n => n.id === note.id)
    assert.equal(found, undefined, 'trashed note should not appear in list')
  })

  it('cleanTrash on construction clears .trash/ from previous session', async () => {
    // Simulate leftover trash from previous session
    const trashDir = path.join(tmpDir, '.trash')
    await fs.mkdir(trashDir, { recursive: true })
    await fs.writeFile(path.join(trashDir, 'old-leftover.md'), '# Old', 'utf-8')

    // New NoteManager should clean trash on startup
    const mgr2 = new NoteManager(tmpDir)
    // Give it a moment for async operations (cleanTrash is sync)
    assert.equal(fsSync.existsSync(path.join(trashDir, 'old-leftover.md')), false,
      'leftover trash should be cleaned on startup')
  })
})

// ─── Bulk Tagging (REQ-NOTES-005) ───────────────────────────

describe('NoteManager — Bulk Tagging', () => {
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

  it('bulkAddTag() adds tag to multiple notes', async () => {
    const n1 = await mgr.create('Tag1', '# Tag1', ['existing'])
    const n2 = await mgr.create('Tag2', '# Tag2', [])

    const updated = await mgr.bulkAddTag([n1.id, n2.id], 'new-tag')
    assert.equal(updated.length, 2)

    const r1 = await mgr.read(n1.id)
    const r2 = await mgr.read(n2.id)
    assert.ok(r1!.info.tags.includes('new-tag'))
    assert.ok(r2!.info.tags.includes('new-tag'))
  })

  it('bulkAddTag() skips notes already at tag limit', async () => {
    const n1 = await mgr.create('Full', '# Full', ['a', 'b', 'c', 'd', 'e'])
    const n2 = await mgr.create('HasRoom', '# HasRoom', ['a', 'b'])

    const updated = await mgr.bulkAddTag([n1.id, n2.id], 'new-tag', 5)
    assert.equal(updated.length, 1, 'only note with room should be updated')
    assert.equal(updated[0], n2.id)

    const r1 = await mgr.read(n1.id)
    assert.ok(!r1!.info.tags.includes('new-tag'), 'full note should not get new tag')
  })

  it('bulkAddTag() skips notes that already have the tag', async () => {
    const n1 = await mgr.create('Already', '# Already', ['target'])

    const updated = await mgr.bulkAddTag([n1.id], 'target')
    assert.equal(updated.length, 0, 'no update if tag already exists')
  })

  it('bulkRemoveTag() removes tag from multiple notes', async () => {
    const n1 = await mgr.create('Remove1', '# Remove1', ['keep', 'remove-me'])
    const n2 = await mgr.create('Remove2', '# Remove2', ['remove-me', 'other'])

    const updated = await mgr.bulkRemoveTag([n1.id, n2.id], 'remove-me')
    assert.equal(updated.length, 2)

    const r1 = await mgr.read(n1.id)
    const r2 = await mgr.read(n2.id)
    assert.ok(!r1!.info.tags.includes('remove-me'))
    assert.ok(!r2!.info.tags.includes('remove-me'))
    assert.ok(r1!.info.tags.includes('keep'))
    assert.ok(r2!.info.tags.includes('other'))
  })

  it('bulkRemoveTag() skips notes without the tag', async () => {
    const n1 = await mgr.create('NoTag', '# NoTag', ['other'])

    const updated = await mgr.bulkRemoveTag([n1.id], 'nonexistent')
    assert.equal(updated.length, 0)
  })
})
