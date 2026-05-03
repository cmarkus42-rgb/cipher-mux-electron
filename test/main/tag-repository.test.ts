import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { TagClassRepo, SEED_CLASSES } from '../../src/main/notes/tag-repository'

describe('TagClassRepo', () => {
  let tmpDir: string
  let repo: TagClassRepo

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-repo-test-'))
    repo = new TagClassRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ─── Initialization ────────────────────────────────────

  it('initializes with seed classes', () => {
    const data = repo.getRepository()
    assert.ok(data.classes.kind, 'should have "kind" class')
    assert.ok(data.classes.status, 'should have "status" class')
    assert.ok(data.classes.domain, 'should have "domain" class')
    assert.ok(data.classes.project, 'should have "project" class')
  })

  it('seed kind class has expected values', () => {
    const data = repo.getRepository()
    const kindValues = data.classes.kind.values
    assert.ok(kindValues.includes('bugreport'))
    assert.ok(kindValues.includes('feature'))
    assert.ok(kindValues.includes('testcase'))
    assert.ok(kindValues.includes('handoff'))
  })

  it('seed classes have colors', () => {
    const data = repo.getRepository()
    assert.ok(data.classes.kind.color, 'kind should have color')
    assert.ok(data.classes.status.color, 'status should have color')
  })

  // ─── parseTag ──────────────────────────────────────────

  it('parses class:value tags', () => {
    const result = TagClassRepo.parseTag('kind:bugreport')
    assert.equal(result.tagClass, 'kind')
    assert.equal(result.value, 'bugreport')
  })

  it('parses legacy tags without colon', () => {
    const result = TagClassRepo.parseTag('trading')
    assert.equal(result.tagClass, null)
    assert.equal(result.value, 'trading')
  })

  it('handles tags with multiple colons', () => {
    const result = TagClassRepo.parseTag('scope:workspace:abc')
    assert.equal(result.tagClass, 'scope')
    assert.equal(result.value, 'workspace:abc')
  })

  // ─── ensureTag ─────────────────────────────────────────

  it('auto-adds unknown class:value', () => {
    const changed = repo.ensureTag('priority:high')
    assert.equal(changed, true)
    const data = repo.getRepository()
    assert.ok(data.classes.priority, 'should create "priority" class')
    assert.ok(data.classes.priority.values.includes('high'))
  })

  it('adds new value to existing class', () => {
    const changed = repo.ensureTag('kind:epic')
    assert.equal(changed, true)
    const data = repo.getRepository()
    assert.ok(data.classes.kind.values.includes('epic'))
  })

  it('returns false for already-known tag', () => {
    const changed = repo.ensureTag('kind:bugreport')
    assert.equal(changed, false)
  })

  it('ignores legacy tags (no class)', () => {
    const changed = repo.ensureTag('trading')
    assert.equal(changed, false)
  })

  // ─── ensureTags (batch) ────────────────────────────────

  it('registers multiple tags at once', () => {
    const changed = repo.ensureTags(['kind:bugreport', 'priority:high', 'priority:low'])
    assert.equal(changed, true)
    const data = repo.getRepository()
    assert.ok(data.classes.priority.values.includes('high'))
    assert.ok(data.classes.priority.values.includes('low'))
  })

  it('returns false when all tags already known', () => {
    const changed = repo.ensureTags(['kind:bugreport', 'kind:feature'])
    assert.equal(changed, false)
  })

  // ─── Persistence ───────────────────────────────────────

  it('persists to .tags.json', () => {
    repo.ensureTag('priority:critical')
    const tagsPath = path.join(tmpDir, '.tags.json')
    assert.ok(fs.existsSync(tagsPath))
    const raw = JSON.parse(fs.readFileSync(tagsPath, 'utf-8'))
    assert.ok(raw.classes.priority)
    assert.ok(raw.classes.priority.values.includes('critical'))
  })

  it('loads persisted data on re-instantiation', () => {
    repo.ensureTag('priority:critical')
    repo.setClassColor('priority', '#ff0000')

    const repo2 = new TagClassRepo(tmpDir)
    const data = repo2.getRepository()
    assert.ok(data.classes.priority.values.includes('critical'))
    assert.equal(data.classes.priority.color, '#ff0000')
  })

  it('merges persisted values with seeds', () => {
    repo.ensureTag('kind:epic')
    const repo2 = new TagClassRepo(tmpDir)
    const data = repo2.getRepository()
    // Should have both seed values and the new one
    assert.ok(data.classes.kind.values.includes('bugreport'), 'seed value preserved')
    assert.ok(data.classes.kind.values.includes('epic'), 'persisted value preserved')
  })

  // ─── setClassColor ─────────────────────────────────────

  it('sets color for existing class', () => {
    repo.setClassColor('kind', '#ff0000')
    const data = repo.getRepository()
    assert.equal(data.classes.kind.color, '#ff0000')
  })

  it('creates class when setting color for unknown class', () => {
    repo.setClassColor('newclass', '#00ff00')
    const data = repo.getRepository()
    assert.ok(data.classes.newclass)
    assert.equal(data.classes.newclass.color, '#00ff00')
    assert.deepEqual(data.classes.newclass.values, [])
  })

  // ─── Helpers ───────────────────────────────────────────

  it('getClassNames returns all class names', () => {
    const names = repo.getClassNames()
    assert.ok(names.includes('kind'))
    assert.ok(names.includes('status'))
    assert.ok(names.includes('domain'))
    assert.ok(names.includes('project'))
  })

  it('getClassValues returns values for a class', () => {
    const values = repo.getClassValues('kind')
    assert.ok(values.includes('bugreport'))
    assert.ok(values.includes('feature'))
  })

  it('getClassValues returns empty array for unknown class', () => {
    const values = repo.getClassValues('nonexistent')
    assert.deepEqual(values, [])
  })
})
