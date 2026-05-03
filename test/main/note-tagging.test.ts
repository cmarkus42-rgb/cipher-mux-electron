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
    // A sample of seed tags in klasse:wert format should be present
    assert.ok('domain:trading' in repo.tags, 'should have "domain:trading" tag')
    assert.ok('tech:typescript' in repo.tags, 'should have "tech:typescript" tag')
    assert.ok('kind:journal' in repo.tags, 'should have "kind:journal" tag')
    assert.ok('domain:infra' in repo.tags, 'should have "domain:infra" tag')
    // Functional tags (no prefix)
    assert.ok('handoff' in repo.tags, 'should have "handoff" functional tag')
    assert.ok('testcase' in repo.tags, 'should have "testcase" functional tag')
    // Counts start at 0
    assert.equal(repo.tags['domain:trading'].count, 0)
    assert.equal(repo.tags['tech:typescript'].count, 0)
  })

  it('updates tag repository, incrementing existing and adding new tags', () => {
    tagging.updateRepository(['domain:trading', 'tech:typescript', 'custom:new-tag'])
    const repo = tagging.getTagRepository()
    assert.equal(repo.tags['domain:trading'].count, 1)
    assert.equal(repo.tags['tech:typescript'].count, 1)
    assert.ok('custom:new-tag' in repo.tags, 'should add new tag')
    assert.equal(repo.tags['custom:new-tag'].count, 1)
  })

  it('persists tag repository to .tags.json on disk', () => {
    tagging.updateRepository(['domain:trading'])
    const tagsPath = path.join(tmpDir, '.tags.json')
    assert.ok(fs.existsSync(tagsPath), '.tags.json should exist after updateRepository')
    const raw = JSON.parse(fs.readFileSync(tagsPath, 'utf-8'))
    assert.equal(raw.tags['domain:trading'].count, 1)
    // Tag classes should be documented in the JSON
    assert.ok(raw._tagClasses, '.tags.json should include _tagClasses')
    assert.ok(raw._tagClasses.kind, '_tagClasses should document "kind"')
    assert.ok(raw._tagClasses.domain, '_tagClasses should document "domain"')
  })

  it('loads persisted tags on re-instantiation', () => {
    tagging.updateRepository(['domain:trading', 'domain:trading', 'tech:python'])
    // Create fresh instance pointing to same dir
    const tagging2 = new NoteTagging(tmpDir)
    const repo = tagging2.getTagRepository()
    assert.equal(repo.tags['domain:trading'].count, 2)
    assert.equal(repo.tags['tech:python'].count, 1)
  })

  it('seed tags cover cipher ecosystem key domains (klasse:wert)', () => {
    const tags = Object.keys(SEED_TAGS)
    // Trading domain
    assert.ok(tags.includes('domain:trading'), 'should include "domain:trading"')
    assert.ok(tags.includes('domain:risk'), 'should include "domain:risk"')
    assert.ok(tags.includes('domain:portfolio'), 'should include "domain:portfolio"')
    // Infrastructure / tech
    assert.ok(tags.includes('domain:infra'), 'should include "domain:infra"')
    assert.ok(tags.includes('tech:tailscale'), 'should include "tech:tailscale"')
    assert.ok(tags.includes('tech:truenas'), 'should include "tech:truenas"')
    // Development
    assert.ok(tags.includes('tech:typescript'), 'should include "tech:typescript"')
    assert.ok(tags.includes('phase:testing'), 'should include "phase:testing"')
    assert.ok(tags.includes('phase:architecture'), 'should include "phase:architecture"')
    // Projects
    assert.ok(tags.includes('project:cipher-mux'), 'should include "project:cipher-mux"')
    assert.ok(tags.includes('project:openclaw'), 'should include "project:openclaw"')
    // Operations
    assert.ok(tags.includes('phase:automation'), 'should include "phase:automation"')
    assert.ok(tags.includes('domain:security'), 'should include "domain:security"')
    // Personal / kind
    assert.ok(tags.includes('kind:journal'), 'should include "kind:journal"')
    assert.ok(tags.includes('kind:todo'), 'should include "kind:todo"')
  })

  describe('parseTagResponse', () => {
    it('parses a clean JSON array response', () => {
      const result = parseTagResponse('["domain:trading", "tech:typescript", "phase:architecture"]')
      assert.deepEqual(result, ['domain:trading', 'tech:typescript', 'phase:architecture'])
    })

    it('parses a JSON array embedded in surrounding text', () => {
      const result = parseTagResponse('Here are the tags: ["domain:trading", "tech:python"] — good luck!')
      assert.deepEqual(result, ['domain:trading', 'tech:python'])
    })

    it('parses comma-separated tags as fallback', () => {
      const result = parseTagResponse('domain:trading, tech:typescript, phase:testing')
      assert.deepEqual(result, ['domain:trading', 'tech:typescript', 'phase:testing'])
    })

    it('limits result to 5 tags maximum', () => {
      const result = parseTagResponse('["a", "b", "c", "d", "e", "f", "g"]')
      assert.equal(result.length, 5)
    })

    it('lowercases all tags', () => {
      const result = parseTagResponse('["Domain:Trading", "Tech:TypeScript", "PHASE:TESTING"]')
      assert.deepEqual(result, ['domain:trading', 'tech:typescript', 'phase:testing'])
    })

    it('limits comma-separated fallback to 5 tags', () => {
      const result = parseTagResponse('a, b, c, d, e, f, g')
      assert.equal(result.length, 5)
    })
  })
})
