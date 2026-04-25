import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { NoteTagging, parseTagResponse, SEED_TAGS } from '../../src/main/notes/note-tagging'

describe('NoteTagging', () => {
  let tmpDir: string
  let tagging: NoteTagging

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-tagging-test-'))
    tagging = new NoteTagging(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('initializes tag repository with seed tags', () => {
    const repo = tagging.getTagRepository()
    assert.ok(repo.tags, 'repo.tags should exist')
    // A sample of seed tags should be present
    assert.ok('trading' in repo.tags, 'should have "trading" tag')
    assert.ok('typescript' in repo.tags, 'should have "typescript" tag')
    assert.ok('journal' in repo.tags, 'should have "journal" tag')
    assert.ok('infra' in repo.tags, 'should have "infra" tag')
    // Counts start at 0
    assert.equal(repo.tags['trading'].count, 0)
    assert.equal(repo.tags['typescript'].count, 0)
  })

  it('updates tag repository, incrementing existing and adding new tags', () => {
    tagging.updateRepository(['trading', 'typescript', 'custom-new-tag'])
    const repo = tagging.getTagRepository()
    assert.equal(repo.tags['trading'].count, 1)
    assert.equal(repo.tags['typescript'].count, 1)
    assert.ok('custom-new-tag' in repo.tags, 'should add new tag')
    assert.equal(repo.tags['custom-new-tag'].count, 1)
  })

  it('persists tag repository to .tags.json on disk', () => {
    tagging.updateRepository(['trading'])
    const tagsPath = path.join(tmpDir, '.tags.json')
    assert.ok(fs.existsSync(tagsPath), '.tags.json should exist after updateRepository')
    const raw = JSON.parse(fs.readFileSync(tagsPath, 'utf-8'))
    assert.equal(raw.tags['trading'].count, 1)
  })

  it('loads persisted tags on re-instantiation', () => {
    tagging.updateRepository(['trading', 'trading', 'python'])
    // Create fresh instance pointing to same dir
    const tagging2 = new NoteTagging(tmpDir)
    const repo = tagging2.getTagRepository()
    assert.equal(repo.tags['trading'].count, 2)
    assert.equal(repo.tags['python'].count, 1)
  })

  it('seed tags cover cipher ecosystem key domains', () => {
    const tags = Object.keys(SEED_TAGS)
    // Trading domain
    assert.ok(tags.includes('trading'), 'should include "trading"')
    assert.ok(tags.includes('risk'), 'should include "risk"')
    assert.ok(tags.includes('portfolio'), 'should include "portfolio"')
    // Infrastructure domain
    assert.ok(tags.includes('infra'), 'should include "infra"')
    assert.ok(tags.includes('tailscale'), 'should include "tailscale"')
    assert.ok(tags.includes('truenas'), 'should include "truenas"')
    // Development domain
    assert.ok(tags.includes('typescript'), 'should include "typescript"')
    assert.ok(tags.includes('testing'), 'should include "testing"')
    assert.ok(tags.includes('architecture'), 'should include "architecture"')
    // Projects domain
    assert.ok(tags.includes('cipher-mux'), 'should include "cipher-mux"')
    assert.ok(tags.includes('openclaw'), 'should include "openclaw"')
    // Operations domain
    assert.ok(tags.includes('automation'), 'should include "automation"')
    assert.ok(tags.includes('security'), 'should include "security"')
    // Personal domain
    assert.ok(tags.includes('journal'), 'should include "journal"')
    assert.ok(tags.includes('todo'), 'should include "todo"')
  })

  describe('parseTagResponse', () => {
    it('parses a clean JSON array response', () => {
      const result = parseTagResponse('["trading", "typescript", "architecture"]')
      assert.deepEqual(result, ['trading', 'typescript', 'architecture'])
    })

    it('parses a JSON array embedded in surrounding text', () => {
      const result = parseTagResponse('Here are the tags: ["trading", "python"] — good luck!')
      assert.deepEqual(result, ['trading', 'python'])
    })

    it('parses comma-separated tags as fallback', () => {
      const result = parseTagResponse('trading, typescript, testing')
      assert.deepEqual(result, ['trading', 'typescript', 'testing'])
    })

    it('limits result to 5 tags maximum', () => {
      const result = parseTagResponse('["a", "b", "c", "d", "e", "f", "g"]')
      assert.equal(result.length, 5)
    })

    it('lowercases all tags', () => {
      const result = parseTagResponse('["Trading", "TypeScript", "TESTING"]')
      assert.deepEqual(result, ['trading', 'typescript', 'testing'])
    })

    it('limits comma-separated fallback to 5 tags', () => {
      const result = parseTagResponse('a, b, c, d, e, f, g')
      assert.equal(result.length, 5)
    })
  })
})
