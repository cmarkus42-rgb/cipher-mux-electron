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
    const info = await mgr.create('global', 'My First Note', '# My First Note\n\nHello world.')

    assert.ok(info.id, 'should have an id')
    assert.equal(info.title, 'My First Note')
    assert.deepEqual(info.tags, [])
    assert.equal(info.scope, 'global')
    assert.ok(info.createdAt)
    assert.ok(info.modifiedAt)
    assert.ok(info.relativePath.startsWith('global/'))

    // Verify file actually exists on disk
    const filePath = path.join(tmpDir, info.relativePath)
    const raw = await fs.readFile(filePath, 'utf-8')
    assert.ok(raw.includes('title: My First Note'), 'frontmatter title missing')
    assert.ok(raw.includes('tags:'), 'frontmatter tags missing')
    assert.ok(raw.includes('created:'), 'frontmatter created missing')
    assert.ok(raw.includes('modified:'), 'frontmatter modified missing')
    assert.ok(raw.includes('Hello world.'), 'body content missing')
  })

  // ─── 2. List ─────────────────────────────────────────────

  it('lists notes for a scope', async () => {
    const scope = 'list-test-scope'
    await mgr.create(scope, 'Note A', 'Content A')
    await mgr.create(scope, 'Note B', 'Content B')
    await mgr.create(scope, 'Note C', 'Content C')

    const notes = await mgr.list(scope)
    assert.equal(notes.length, 3)
    // All have correct scope
    for (const n of notes) {
      assert.equal(n.scope, scope)
    }
  })

  it('returns empty array for non-existent scope', async () => {
    const notes = await mgr.list('no-such-scope')
    assert.deepEqual(notes, [])
  })

  // ─── 3. Read ─────────────────────────────────────────────

  it('reads note content and frontmatter', async () => {
    const info = await mgr.create('global', 'Readable Note', '# Readable Note\n\nBody text here.')

    const content = await mgr.read(info.id, 'global')
    assert.ok(content, 'should return content')
    assert.equal(content.info.id, info.id)
    assert.equal(content.info.title, 'Readable Note')
    assert.ok(content.body.includes('Body text here.'))
  })

  it('returns null for non-existent note', async () => {
    const result = await mgr.read('nonexistent-id', 'global')
    assert.equal(result, null)
  })

  // ─── 4. Save ─────────────────────────────────────────────

  it('saves note with updated content and tags', async () => {
    const info = await mgr.create('global', 'Saveable Note', '# Saveable Note\n\nOriginal.')

    const updatedInfo = await mgr.save(
      info.id,
      'global',
      '# Updated Title\n\nNew content.',
      ['alpha', 'beta']
    )

    assert.equal(updatedInfo.title, 'Updated Title')
    assert.deepEqual(updatedInfo.tags, ['alpha', 'beta'])
    // createdAt should be preserved from original
    assert.equal(updatedInfo.createdAt, info.createdAt)
    // modifiedAt should be updated
    assert.ok(updatedInfo.modifiedAt >= info.modifiedAt)

    // Verify on disk
    const content = await mgr.read(info.id, 'global')
    assert.ok(content)
    assert.equal(content.info.title, 'Updated Title')
    assert.deepEqual(content.info.tags, ['alpha', 'beta'])
    assert.ok(content.body.includes('New content.'))
  })

  it('preserves existing tags when save called without tags arg', async () => {
    const info = await mgr.create('global', 'Tag Note', 'Body')
    await mgr.save(info.id, 'global', 'Updated body', ['keep-me'])
    const saved = await mgr.save(info.id, 'global', '# New Title\n\nBody again')

    // tags not passed → should be preserved from existing frontmatter
    assert.deepEqual(saved.tags, ['keep-me'])
  })

  // ─── 5. Workspace-scoped notes ───────────────────────────

  it('creates workspace-scoped notes', async () => {
    const wsScope = 'workspace-abc123'
    const info = await mgr.create(wsScope, 'Workspace Note', '# Workspace Note\n\nWS body.')

    assert.equal(info.scope, wsScope)
    const filePath = path.join(tmpDir, wsScope, `${info.id}.md`)
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    assert.ok(exists, 'workspace note file should exist on disk')
  })

  // ─── 6. listAll ──────────────────────────────────────────

  it('lists all notes across scopes', async () => {
    // Use fresh tmpDir to avoid pollution from earlier tests
    const freshDir = await makeTempDir()
    const freshMgr = new NoteManager(freshDir)

    await freshMgr.create('global', 'Global 1', 'g1')
    await freshMgr.create('global', 'Global 2', 'g2')
    await freshMgr.create('workspace-xyz', 'WS Note', 'ws body')

    const all = await freshMgr.listAll()
    assert.equal(all.length, 3)
    const scopes = new Set(all.map(n => n.scope))
    assert.ok(scopes.has('global'))
    assert.ok(scopes.has('workspace-xyz'))

    freshMgr.destroy()
    await fs.rm(freshDir, { recursive: true, force: true })
  })

  // ─── 7. Delete ───────────────────────────────────────────

  it('deletes a note', async () => {
    const info = await mgr.create('global', 'Delete Me', 'Temporary note.')

    const deleted = await mgr.delete(info.id, 'global')
    assert.equal(deleted, true)

    // File should be gone
    const content = await mgr.read(info.id, 'global')
    assert.equal(content, null)
  })

  it('returns false when deleting non-existent note', async () => {
    const result = await mgr.delete('does-not-exist', 'global')
    assert.equal(result, false)
  })
})
