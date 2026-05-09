import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { TagClassRepo } from '../../src/main/notes/tag-repository'
import { NoteTagging } from '../../src/main/notes/note-tagging'

function writeNote(dir: string, id: string, tags: string[]): void {
  const content = [
    '---',
    `title: Test Note ${id}`,
    `tags: [${tags.map(t => `"${t}"`).join(', ')}]`,
    `created: "2026-01-01T00:00:00.000Z"`,
    `modified: "2026-01-01T00:00:00.000Z"`,
    '---',
    `# Note ${id}`,
    'Body text',
  ].join('\n')
  fs.writeFileSync(path.join(dir, `${id}.md`), content)
}

function readNoteTags(dir: string, id: string): string[] {
  const matter = require('gray-matter')
  const raw = fs.readFileSync(path.join(dir, `${id}.md`), 'utf-8')
  return matter(raw).data.tags ?? []
}

describe('TagClassRepo — resolveSynonyms batch', () => {
  let tmpDir: string
  let repo: TagClassRepo

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-resolve-test-'))
    repo = new TagClassRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('resolves multiple tags, replacing synonyms', () => {
    repo.addSynonym('kind:bug', 'kind:bugreport')
    repo.addSynonym('status:wip', 'status:in-progress')
    const result = repo.resolveSynonyms(['kind:bug', 'status:wip', 'domain:trading'])
    assert.deepEqual(result, ['kind:bugreport', 'status:in-progress', 'domain:trading'])
  })

  it('returns original tags when no synonyms exist', () => {
    const input = ['kind:bugreport', 'domain:trading']
    assert.deepEqual(repo.resolveSynonyms(input), input)
  })

  it('deduplicates after synonym resolution', () => {
    repo.addSynonym('kind:bug', 'kind:bugreport')
    const result = repo.resolveSynonyms(['kind:bug', 'kind:bugreport'])
    assert.deepEqual(result, ['kind:bugreport'])
  })
})

describe('NoteTagging.mergeTags — synonym registration', () => {
  let tmpDir: string
  let tagging: NoteTagging
  let classRepo: TagClassRepo

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-synonym-test-'))
    tagging = new NoteTagging(tmpDir)
    classRepo = new TagClassRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('mergeTags registers source tags as synonyms of target', () => {
    tagging.createTag('domain:trading', 'desc1')
    tagging.createTag('domain:trades', 'desc2')
    writeNote(tmpDir, 'n1', ['domain:trades'])

    tagging.mergeTags(['domain:trading', 'domain:trades'], 'domain:trading')

    // Reload class repo to check synonyms were persisted
    const repo2 = new TagClassRepo(tmpDir)
    assert.equal(repo2.resolveSynonym('domain:trades'), 'domain:trading')
  })

  it('mergeTags with 3-way registers all sources as synonyms', () => {
    tagging.createTag('tech:ts', '')
    tagging.createTag('tech:typescript', '')
    tagging.createTag('tech:tsx', '')
    writeNote(tmpDir, 'n1', ['tech:ts'])
    writeNote(tmpDir, 'n2', ['tech:tsx'])

    tagging.mergeTags(['tech:ts', 'tech:typescript', 'tech:tsx'], 'tech:typescript')

    const repo2 = new TagClassRepo(tmpDir)
    assert.equal(repo2.resolveSynonym('tech:ts'), 'tech:typescript')
    assert.equal(repo2.resolveSynonym('tech:tsx'), 'tech:typescript')
  })
})

describe('TagClassRepo.renameClass — tag propagation', () => {
  let tmpDir: string
  let repo: TagClassRepo

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'class-rename-test-'))
    repo = new TagClassRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('renameClass updates tags in notes', () => {
    repo.createClass('prio', '#ff0000')
    repo.ensureTag('prio:high')
    writeNote(tmpDir, 'n1', ['prio:high', 'kind:bugreport'])

    repo.renameClass('prio', 'priority')

    const tags = readNoteTags(tmpDir, 'n1')
    assert.ok(tags.includes('priority:high'), 'tag should be renamed to priority:high')
    assert.ok(!tags.includes('prio:high'), 'old tag should be gone')
    assert.ok(tags.includes('kind:bugreport'), 'other tags unchanged')
  })

  it('renameClass with multiple values updates all', () => {
    repo.createClass('prio', '#ff0000')
    repo.ensureTag('prio:high')
    repo.ensureTag('prio:low')
    writeNote(tmpDir, 'n1', ['prio:high'])
    writeNote(tmpDir, 'n2', ['prio:low'])

    repo.renameClass('prio', 'priority')

    assert.ok(readNoteTags(tmpDir, 'n1').includes('priority:high'))
    assert.ok(readNoteTags(tmpDir, 'n2').includes('priority:low'))
  })
})
