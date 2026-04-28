import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'

// ─── Helpers ────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'note-manager-test-'))
}

// ─── NoteManager ────────────────────────────────────────────

describe('NoteManager', () => {
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

  // ─── 1. Create ───────────────────────────────────────────

  it('creates a note with frontmatter on disk', async () => {
    const info = await mgr.create('My First Note', '# My First Note\n\nHello world.')

    assert.ok(info.id, 'should have an id')
    assert.equal(info.title, 'My First Note')
    assert.deepEqual(info.tags, [])
    assert.equal(info.scope, 'global')
    assert.ok(info.createdAt)
    assert.ok(info.modifiedAt)
    assert.equal(info.relativePath, `${info.id}.md`)

    // Verify file actually exists on disk (flat directory)
    const filePath = path.join(tmpDir, `${info.id}.md`)
    const raw = await fs.readFile(filePath, 'utf-8')
    assert.ok(raw.includes('title: My First Note'), 'frontmatter title missing')
    assert.ok(raw.includes('tags:'), 'frontmatter tags missing')
    assert.ok(raw.includes('created:'), 'frontmatter created missing')
    assert.ok(raw.includes('modified:'), 'frontmatter modified missing')
    assert.ok(raw.includes('Hello world.'), 'body content missing')
  })

  it('creates a note with initial tags', async () => {
    const info = await mgr.create('Tagged Note', '# Tagged Note\n\nBody.', ['test', 'alpha'])
    assert.deepEqual(info.tags, ['test', 'alpha'])

    const content = await mgr.read(info.id)
    assert.ok(content)
    assert.deepEqual(content.info.tags, ['test', 'alpha'])
  })

  // ─── 2. List ─────────────────────────────────────────────

  it('lists all notes in flat directory', async () => {
    const freshDir = await makeTempDir()
    const freshMgr = new NoteManager(freshDir)
    await freshMgr.create('Note A', 'Content A')
    await freshMgr.create('Note B', 'Content B')
    await freshMgr.create('Note C', 'Content C')

    const notes = await freshMgr.list()
    assert.equal(notes.length, 3)
    for (const n of notes) {
      assert.equal(n.scope, 'global')
    }

    freshMgr.destroy()
    await fs.rm(freshDir, { recursive: true, force: true })
  })

  it('filters notes by tags', async () => {
    const freshDir = await makeTempDir()
    const freshMgr = new NoteManager(freshDir)
    const n1 = await freshMgr.create('A', 'a', ['alpha'])
    await freshMgr.save(n1.id, 'a', ['alpha'])
    const n2 = await freshMgr.create('B', 'b', ['beta'])
    await freshMgr.save(n2.id, 'b', ['beta'])
    await freshMgr.create('C', 'c', ['alpha', 'beta'])

    const alphaOnly = await freshMgr.list(['alpha'])
    assert.equal(alphaOnly.length, 2) // n1 + n3

    const betaOnly = await freshMgr.list(['beta'])
    assert.equal(betaOnly.length, 2) // n2 + n3

    freshMgr.destroy()
    await fs.rm(freshDir, { recursive: true, force: true })
  })

  it('returns empty array for empty directory', async () => {
    const freshDir = await makeTempDir()
    const freshMgr = new NoteManager(freshDir)
    const notes = await freshMgr.list()
    assert.deepEqual(notes, [])
    freshMgr.destroy()
    await fs.rm(freshDir, { recursive: true, force: true })
  })

  // ─── 3. Read ─────────────────────────────────────────────

  it('reads note content and frontmatter', async () => {
    const info = await mgr.create('Readable Note', '# Readable Note\n\nBody text here.')

    const content = await mgr.read(info.id)
    assert.ok(content, 'should return content')
    assert.equal(content.info.id, info.id)
    assert.equal(content.info.title, 'Readable Note')
    assert.ok(content.body.includes('Body text here.'))
  })

  it('returns null for non-existent note', async () => {
    const result = await mgr.read('nonexistent-id')
    assert.equal(result, null)
  })

  // ─── 4. Save ─────────────────────────────────────────────

  it('saves note with updated content and tags', async () => {
    const info = await mgr.create('Saveable Note', '# Saveable Note\n\nOriginal.')

    const updatedInfo = await mgr.save(
      info.id,
      '# Updated Title\n\nNew content.',
      ['alpha', 'beta']
    )

    assert.equal(updatedInfo.title, 'Updated Title')
    assert.deepEqual(updatedInfo.tags, ['alpha', 'beta'])
    assert.equal(updatedInfo.createdAt, info.createdAt)
    assert.ok(updatedInfo.modifiedAt >= info.modifiedAt)

    // Verify on disk
    const content = await mgr.read(info.id)
    assert.ok(content)
    assert.equal(content.info.title, 'Updated Title')
    assert.deepEqual(content.info.tags, ['alpha', 'beta'])
    assert.ok(content.body.includes('New content.'))
  })

  it('preserves existing tags when save called without tags arg', async () => {
    const info = await mgr.create('Tag Note', 'Body')
    await mgr.save(info.id, 'Updated body', ['keep-me'])
    const saved = await mgr.save(info.id, '# New Title\n\nBody again')

    assert.deepEqual(saved.tags, ['keep-me'])
  })

  // ─── 5. Delete ───────────────────────────────────────────

  it('deletes a note', async () => {
    const info = await mgr.create('Delete Me', 'Temporary note.')

    const deleted = await mgr.delete(info.id)
    assert.equal(deleted, true)

    const content = await mgr.read(info.id)
    assert.equal(content, null)
  })

  it('returns false when deleting non-existent note', async () => {
    const result = await mgr.delete('does-not-exist')
    assert.equal(result, false)
  })

  // ─── 6. listAll (backward compat) ────────────────────────

  it('listAll returns same as list', async () => {
    const freshDir = await makeTempDir()
    const freshMgr = new NoteManager(freshDir)
    await freshMgr.create('Note 1', 'body1')
    await freshMgr.create('Note 2', 'body2')

    const all = await freshMgr.listAll()
    const list = await freshMgr.list()
    assert.equal(all.length, list.length)

    freshMgr.destroy()
    await fs.rm(freshDir, { recursive: true, force: true })
  })
})
