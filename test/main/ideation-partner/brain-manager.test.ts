import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  initBrainDir,
  createNote,
  listNotes,
  readNote,
  updateIndex,
  checkUncertaintyMarkers,
} from '../../../src/main/ideation-partner/brain-manager'

const TEST_DIR = path.join(os.tmpdir(), `ideation-test-${Date.now()}`)

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('initBrainDir', () => {
  it('creates brain/ and deliverables/ subdirectories', () => {
    const brainDir = initBrainDir(TEST_DIR)
    assert.ok(fs.existsSync(brainDir))
    assert.ok(fs.existsSync(path.join(TEST_DIR, 'deliverables')))
  })

  it('creates _index.md in brain/', () => {
    const brainDir = initBrainDir(TEST_DIR)
    const indexPath = path.join(brainDir, '_index.md')
    assert.ok(fs.existsSync(indexPath))
    const content = fs.readFileSync(indexPath, 'utf-8')
    assert.ok(content.includes('# Brain Index'))
  })

  it('is idempotent', () => {
    initBrainDir(TEST_DIR)
    initBrainDir(TEST_DIR) // should not throw
    assert.ok(fs.existsSync(path.join(TEST_DIR, 'brain')))
  })
})

describe('createNote', () => {
  it('creates a markdown file with title heading', () => {
    const brainDir = initBrainDir(TEST_DIR)
    const note = createNote(brainDir, 'Research APIs', 'Found three relevant APIs.')
    assert.ok(fs.existsSync(note.filepath))
    const content = fs.readFileSync(note.filepath, 'utf-8')
    assert.ok(content.startsWith('# Research APIs'))
    assert.ok(content.includes('Found three relevant APIs.'))
  })

  it('returns a BrainNote with id and title', () => {
    const brainDir = initBrainDir(TEST_DIR)
    const note = createNote(brainDir, 'My Note', 'Content.')
    assert.equal(note.id, 'my-note')
    assert.equal(note.title, 'My Note')
    assert.ok(note.createdAt > 0)
  })
})

describe('listNotes', () => {
  it('lists all notes except _index.md', () => {
    const brainDir = initBrainDir(TEST_DIR)
    createNote(brainDir, 'Note A', 'Content A')
    createNote(brainDir, 'Note B', 'Content B')
    const notes = listNotes(brainDir)
    assert.equal(notes.length, 2)
    assert.ok(notes.some(n => n.title === 'Note A'))
    assert.ok(notes.some(n => n.title === 'Note B'))
  })

  it('returns empty array for non-existent dir', () => {
    const notes = listNotes('/nonexistent/path')
    assert.equal(notes.length, 0)
  })
})

describe('readNote', () => {
  it('reads note content by id', () => {
    const brainDir = initBrainDir(TEST_DIR)
    createNote(brainDir, 'Test Note', 'Hello world.')
    const content = readNote(brainDir, 'test-note')
    assert.ok(content?.includes('Hello world.'))
  })

  it('returns null for non-existent note', () => {
    const brainDir = initBrainDir(TEST_DIR)
    assert.equal(readNote(brainDir, 'missing'), null)
  })
})

describe('updateIndex', () => {
  it('writes wiki-links for all notes', () => {
    const brainDir = initBrainDir(TEST_DIR)
    createNote(brainDir, 'Alpha', 'A')
    createNote(brainDir, 'Beta', 'B')
    updateIndex(brainDir)
    const index = fs.readFileSync(path.join(brainDir, '_index.md'), 'utf-8')
    assert.ok(index.includes('[[alpha]]'))
    assert.ok(index.includes('[[beta]]'))
  })
})

describe('checkUncertaintyMarkers', () => {
  it('counts [unsicher] markers', () => {
    const result = checkUncertaintyMarkers('Text [unsicher] more [unklar] end [nicht verifiziert]')
    assert.equal(result.count, 3)
    assert.equal(result.sufficient, true)
  })

  it('returns insufficient when fewer than required', () => {
    const result = checkUncertaintyMarkers('Text [unsicher] only one')
    assert.equal(result.count, 1)
    assert.equal(result.sufficient, false)
  })

  it('counts **unsicher** markers', () => {
    const result = checkUncertaintyMarkers('**unsicher** **unklar** **unsicher**')
    assert.equal(result.count, 3)
    assert.equal(result.sufficient, true)
  })

  it('returns zero for clean text', () => {
    const result = checkUncertaintyMarkers('Everything is perfectly clear and verified.')
    assert.equal(result.count, 0)
    assert.equal(result.sufficient, false)
  })
})
