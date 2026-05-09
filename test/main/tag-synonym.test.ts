import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { TagClassRepo } from '../../src/main/notes/tag-repository'

describe('TagClassRepo — Synonyms', () => {
  let tmpDir: string
  let repo: TagClassRepo

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-synonym-test-'))
    repo = new TagClassRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ─── addSynonym / getSynonyms ─────────────────────────────

  it('adds a synonym mapping', () => {
    repo.addSynonym('kind:bug', 'kind:bugreport')
    const syns = repo.getSynonyms()
    assert.equal(syns['kind:bug'], 'kind:bugreport')
  })

  it('getSynonyms returns empty object initially', () => {
    const syns = repo.getSynonyms()
    assert.deepEqual(syns, {})
  })

  it('overwrites existing synonym', () => {
    repo.addSynonym('kind:bug', 'kind:bugreport')
    repo.addSynonym('kind:bug', 'kind:feature')
    const syns = repo.getSynonyms()
    assert.equal(syns['kind:bug'], 'kind:feature')
  })

  // ─── removeSynonym ────────────────────────────────────────

  it('removes a synonym', () => {
    repo.addSynonym('kind:bug', 'kind:bugreport')
    repo.removeSynonym('kind:bug')
    const syns = repo.getSynonyms()
    assert.equal(syns['kind:bug'], undefined)
  })

  it('removeSynonym is a no-op for unknown key', () => {
    repo.removeSynonym('nonexistent')
    assert.deepEqual(repo.getSynonyms(), {})
  })

  // ─── resolveSynonym ───────────────────────────────────────

  it('resolves a synonym to its canonical tag', () => {
    repo.addSynonym('kind:bug', 'kind:bugreport')
    assert.equal(repo.resolveSynonym('kind:bug'), 'kind:bugreport')
  })

  it('returns original tag when no synonym exists', () => {
    assert.equal(repo.resolveSynonym('kind:bugreport'), 'kind:bugreport')
  })

  // ─── Persistence ──────────────────────────────────────────

  it('persists synonyms to .tags.json', () => {
    repo.addSynonym('status:wip', 'status:in-progress')
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, '.tags.json'), 'utf-8'))
    assert.equal(raw.synonyms['status:wip'], 'status:in-progress')
  })

  it('loads persisted synonyms on re-instantiation', () => {
    repo.addSynonym('status:wip', 'status:in-progress')
    const repo2 = new TagClassRepo(tmpDir)
    assert.equal(repo2.resolveSynonym('status:wip'), 'status:in-progress')
  })

  it('backward compatible — loads .tags.json without synonyms field', () => {
    // Write a .tags.json without synonyms (pre-synonym format)
    const legacy = { classes: { kind: { values: ['bugreport'], color: '#6366f1' } } }
    fs.writeFileSync(path.join(tmpDir, '.tags.json'), JSON.stringify(legacy))
    const repo2 = new TagClassRepo(tmpDir)
    assert.deepEqual(repo2.getSynonyms(), {})
    assert.ok(repo2.getClassValues('kind').includes('bugreport'))
  })
})

describe('TagClassRepo — Class CRUD', () => {
  let tmpDir: string
  let repo: TagClassRepo

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-class-crud-test-'))
    repo = new TagClassRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ─── createClass ──────────────────────────────────────────

  it('creates a new class with color', () => {
    const ok = repo.createClass('priority', '#ff0000')
    assert.equal(ok, true)
    const data = repo.getRepository()
    assert.ok(data.classes.priority)
    assert.equal(data.classes.priority.color, '#ff0000')
    assert.deepEqual(data.classes.priority.values, [])
  })

  it('returns false when class already exists', () => {
    const ok = repo.createClass('kind', '#ff0000')
    assert.equal(ok, false)
  })

  // ─── renameClass ──────────────────────────────────────────

  it('renames a class', () => {
    repo.createClass('prio', '#ff0000')
    repo.ensureTag('prio:high')
    const ok = repo.renameClass('prio', 'priority')
    assert.equal(ok, true)
    const data = repo.getRepository()
    assert.ok(data.classes.priority)
    assert.ok(!data.classes.prio)
    assert.ok(data.classes.priority.values.includes('high'))
  })

  it('renameClass returns false for unknown class', () => {
    assert.equal(repo.renameClass('nonexistent', 'other'), false)
  })

  it('renameClass returns false when target already exists', () => {
    assert.equal(repo.renameClass('kind', 'status'), false)
  })

  // ─── deleteClass ──────────────────────────────────────────

  it('deletes a custom class', () => {
    repo.createClass('priority', '#ff0000')
    repo.ensureTag('priority:high')
    const ok = repo.deleteClass('priority')
    assert.equal(ok, true)
    assert.ok(!repo.getRepository().classes.priority)
  })

  it('deleteClass returns false for unknown class', () => {
    assert.equal(repo.deleteClass('nonexistent'), false)
  })
})
