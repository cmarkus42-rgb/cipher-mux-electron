/**
 * Memory as a pointer index, not a barrel.
 *
 * The strategy paper's rule for handovers: the memory line is a pointer, the
 * note is the content. Title, one-liner, note id — not the text. That turns
 * recall into a card index instead of something that grows heavier with every
 * entry, and it stops the same content living in two places where one copy can
 * go stale.
 *
 * Second half of the same problem: recall ordered by `ts DESC` alone, so
 * `salience` was written on every memory and never read. The more the store
 * filled up, the more irrelevant material each session start had to wade
 * through — the opposite of a relevance index.
 */
import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import path from 'path'
import os from 'os'
import Database from 'better-sqlite3'
import { MemoryStore } from '../../../src/main/companion/memory-store'

describe('MemoryStore — note pointers', () => {
  let tmpDir: string
  let store: MemoryStore

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-pointer-'))
    store = new MemoryStore(path.join(tmpDir, 'companion.db'))
  })

  after(async () => {
    store.close()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('stores and returns a note id', () => {
    const written = store.write({
      kind: 'fact',
      text: 'Übergabe: Anker und Delta — siehe Note',
      noteId: '01M3Q7GGPJMR6A708QG57C608J',
    })
    assert.equal(written.noteId, '01M3Q7GGPJMR6A708QG57C608J')

    const recalled = store.recall({ limit: 5 }).find(m => m.id === written.id)
    assert.equal(recalled?.noteId, '01M3Q7GGPJMR6A708QG57C608J')
  })

  it('leaves the field null for a memory that points nowhere', () => {
    const written = store.write({ kind: 'fact', text: 'Nur ein Fakt' })
    assert.equal(written.noteId, null)
  })

  it('carries the pointer through full-text search', () => {
    store.write({ kind: 'fact', text: 'Zeigerdurchgriff Suchbegriff', noteId: 'note-xyz' })
    const hits = store.search('Zeigerdurchgriff')
    assert.ok(hits.length > 0)
    assert.equal(hits[0].noteId, 'note-xyz')
  })
})

describe('MemoryStore — relevance ordering', () => {
  let tmpDir: string
  let store: MemoryStore

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-rank-'))
    store = new MemoryStore(path.join(tmpDir, 'companion.db'))

    // Oldest but most important, then two newer trivia.
    store.write({ kind: 'fact', text: 'WICHTIG alt', salience: 0.95 })
    store.write({ kind: 'event', text: 'nebensaechlich mittel', salience: 0.2 })
    store.write({ kind: 'event', text: 'nebensaechlich neu', salience: 0.1 })
  })

  after(async () => {
    store.close()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('ranks by salience before recency by default', () => {
    const texts = store.recall({ limit: 10 }).map(m => m.text)
    assert.equal(texts[0], 'WICHTIG alt', 'the important old memory must not be buried')
  })

  it('still offers pure recency when that is what is wanted', () => {
    const texts = store.recall({ limit: 10, rank: 'recent' }).map(m => m.text)
    assert.equal(texts[0], 'nebensaechlich neu')
  })

  it('breaks salience ties by recency', async () => {
    const tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), 'memory-tie-'))
    const s = new MemoryStore(path.join(tmp, 'c.db'))
    try {
      // Zeitstempel muessen sich unterscheiden: write() setzt ts selbst, und
      // zwei Aufrufe in derselben Millisekunde sind nicht ordenbar.
      s.write({ kind: 'fact', text: 'erst', salience: 0.5 })
      await new Promise(r => setTimeout(r, 3))
      s.write({ kind: 'fact', text: 'dann', salience: 0.5 })
      const texts = s.recall({ limit: 10 }).map(m => m.text)
      assert.deepEqual(texts, ['dann', 'erst'])
    } finally {
      s.close()
      fsSync.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('MemoryStore — migration of an existing database', () => {
  it('adds the pointer column to a store written before it existed', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-migrate-'))
    const dbPath = path.join(tmpDir, 'companion.db')
    try {
      // Build a store, then strip the column to simulate the older schema.
      const first = new MemoryStore(dbPath)
      first.write({ kind: 'fact', text: 'Bestand vor der Migration' })
      first.close()

      const raw = new Database(dbPath)
      const hadColumn = raw.prepare(
        "SELECT COUNT(*) as cnt FROM pragma_table_info('memories') WHERE name='note_id'",
      ).get() as { cnt: number }
      assert.equal(hadColumn.cnt, 1, 'fresh stores must have the column')
      raw.exec('DROP INDEX IF EXISTS idx_memories_note')
      raw.exec('ALTER TABLE memories DROP COLUMN note_id')
      raw.close()

      // Reopening must migrate rather than fail, and keep the existing row.
      const second = new MemoryStore(dbPath)
      try {
        const all = second.recall({ limit: 10 })
        assert.ok(all.some(m => m.text === 'Bestand vor der Migration'))
        assert.equal(all[0].noteId, null, 'rows from before carry no pointer')
      } finally {
        second.close()
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
