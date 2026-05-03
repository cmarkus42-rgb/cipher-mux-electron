import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'
import { NoteSearchIndex } from '../../src/main/notes/note-search-index'

// ─── Helpers ────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'note-search-test-'))
}

// ─── NoteSearchIndex ────────────────────────────────────────

describe('NoteSearchIndex', () => {
  let tmpDir: string
  let mgr: NoteManager
  let idx: NoteSearchIndex

  before(async () => {
    tmpDir = await makeTempDir()
    mgr = new NoteManager(tmpDir)

    // Create sample notes
    await mgr.create('TypeScript Guide', '# TypeScript Guide\n\nStrict mode, interfaces, generics.', ['tech:typescript', 'kind:reference'])
    await mgr.create('Trading Strategy', '# Trading Strategy\n\nMoving average crossover for EUR/USD.', ['domain:trading', 'phase:research'])
    await mgr.create('Bug Fix Log', '# Bug Fix Log\n\nFixed tmux crash on disconnect.', ['project:cipher-mux', 'phase:debugging'])
  })

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    idx = new NoteSearchIndex()
  })

  it('builds index from NoteManager', async () => {
    await idx.buildFromManager(mgr)
    assert.equal(idx.size, 3)
  })

  it('searches by title', async () => {
    await idx.buildFromManager(mgr)
    const results = idx.search('TypeScript')
    assert.ok(results.length >= 1, 'should find at least one result')
    assert.equal(results[0].info.title, 'TypeScript Guide')
  })

  it('searches by body content', async () => {
    await idx.buildFromManager(mgr)
    const results = idx.search('moving average')
    assert.ok(results.length >= 1, 'should find at least one result')
    assert.equal(results[0].info.title, 'Trading Strategy')
  })

  it('searches by tags', async () => {
    await idx.buildFromManager(mgr)
    const results = idx.search('debugging')
    assert.ok(results.length >= 1, 'should find at least one result')
    assert.equal(results[0].info.title, 'Bug Fix Log')
  })

  it('returns empty for empty query', async () => {
    await idx.buildFromManager(mgr)
    const results = idx.search('')
    assert.equal(results.length, 0)
  })

  it('returns empty for whitespace query', async () => {
    await idx.buildFromManager(mgr)
    const results = idx.search('   ')
    assert.equal(results.length, 0)
  })

  it('addOrUpdate updates existing entry', async () => {
    await idx.buildFromManager(mgr)
    const notes = await mgr.list()
    const tsNote = notes.find(n => n.title === 'TypeScript Guide')!

    // Update the note content
    const updatedInfo = await mgr.save(tsNote.id, '# TypeScript Guide\n\nReact hooks and preact compat.', ['tech:typescript'])
    idx.addOrUpdate({ info: updatedInfo, body: '# TypeScript Guide\n\nReact hooks and preact compat.' })

    // Old content should not match
    const oldResults = idx.search('generics')
    const oldMatch = oldResults.find(r => r.info.id === tsNote.id)
    assert.equal(oldMatch, undefined, 'old content should not match after update')

    // New content should match
    const newResults = idx.search('preact')
    assert.ok(newResults.length >= 1)
    assert.equal(newResults[0].info.id, tsNote.id)
  })

  it('remove() removes note from index', async () => {
    await idx.buildFromManager(mgr)
    const notes = await mgr.list()
    const bugNote = notes.find(n => n.title === 'Bug Fix Log')!

    idx.remove(bugNote.id)
    assert.equal(idx.size, 2)

    const results = idx.search('tmux crash')
    const match = results.find(r => r.info.id === bugNote.id)
    assert.equal(match, undefined, 'removed note should not appear in search')
  })

  it('respects limit parameter', async () => {
    await idx.buildFromManager(mgr)
    const results = idx.search('guide strategy log', 1)
    assert.ok(results.length <= 1)
  })

  it('prioritizes title matches', async () => {
    await idx.buildFromManager(mgr)
    // "TypeScript" appears in both title and body of the TS note
    const results = idx.search('TypeScript')
    if (results.length > 1) {
      // The one with TypeScript in the title should be first
      assert.equal(results[0].info.title, 'TypeScript Guide')
    }
  })
})
