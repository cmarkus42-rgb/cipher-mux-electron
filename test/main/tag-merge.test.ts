import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
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

describe('mergeTags', () => {
  let tmpDir: string
  let tagging: NoteTagging

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-merge-test-'))
    tagging = new NoteTagging(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('merges multiple tags into target', () => {
    tagging.createTag('domain:trading', 'desc1')
    tagging.createTag('domain:trades', 'desc2')
    writeNote(tmpDir, 'n1', ['domain:trading'])
    writeNote(tmpDir, 'n2', ['domain:trades'])
    writeNote(tmpDir, 'n3', ['domain:trading', 'domain:trades'])

    const result = tagging.mergeTags(['domain:trading', 'domain:trades'], 'domain:trading')
    assert.equal(result.affected, 2) // n2 renamed, n3 deduped
    assert.deepEqual(readNoteTags(tmpDir, 'n1'), ['domain:trading'])
    assert.deepEqual(readNoteTags(tmpDir, 'n2'), ['domain:trading'])
    assert.deepEqual(readNoteTags(tmpDir, 'n3'), ['domain:trading'])
    // Source tags removed from repository
    const repo = tagging.getTagRepository()
    assert.ok(!repo.tags['domain:trades'])
    assert.ok(repo.tags['domain:trading'])
  })

  it('returns 0 affected when no notes have source tags', () => {
    tagging.createTag('kind:a', '')
    tagging.createTag('kind:b', '')
    const result = tagging.mergeTags(['kind:a', 'kind:b'], 'kind:b')
    assert.equal(result.affected, 0)
  })

  it('rejects merge when target not in sources', () => {
    tagging.createTag('kind:a', '')
    tagging.createTag('kind:b', '')
    const result = tagging.mergeTags(['kind:a', 'kind:c'], 'kind:b')
    assert.equal(result.affected, 0)
    assert.equal(result.error, 'target must be one of the source tags')
  })

  it('rejects merge with fewer than 2 sources', () => {
    const result = tagging.mergeTags(['kind:a'], 'kind:a')
    assert.equal(result.error, 'need at least 2 tags to merge')
  })

  it('handles 3-way merge', () => {
    tagging.createTag('tech:ts', '')
    tagging.createTag('tech:typescript', '')
    tagging.createTag('tech:tsx', '')
    writeNote(tmpDir, 'n1', ['tech:ts'])
    writeNote(tmpDir, 'n2', ['tech:typescript'])
    writeNote(tmpDir, 'n3', ['tech:tsx'])
    writeNote(tmpDir, 'n4', ['tech:ts', 'tech:tsx'])

    const result = tagging.mergeTags(['tech:ts', 'tech:typescript', 'tech:tsx'], 'tech:typescript')
    assert.equal(result.affected, 3) // n2 already has target, only n1/n3/n4 change
    assert.deepEqual(readNoteTags(tmpDir, 'n1'), ['tech:typescript'])
    assert.deepEqual(readNoteTags(tmpDir, 'n2'), ['tech:typescript'])
    assert.deepEqual(readNoteTags(tmpDir, 'n3'), ['tech:typescript'])
    assert.deepEqual(readNoteTags(tmpDir, 'n4'), ['tech:typescript'])
  })
})
