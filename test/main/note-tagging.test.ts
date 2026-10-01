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
    // Eine Auswahl der Achsenwerte muss da sein. `domain:*` und `tech:*`
    // standen hier, bis der Umzug am 2026-10-01 diese Klassen aufgeloest hat.
    assert.ok('kind:journal' in repo.tags, 'should have "kind:journal" tag')
    assert.ok('kind:spec' in repo.tags, 'should have "kind:spec" tag')
    assert.ok('phase:coding' in repo.tags, 'should have "phase:coding" tag')
    assert.ok('status:open' in repo.tags, 'should have "status:open" tag')
    // Functional tags (no prefix)
    assert.ok('handoff' in repo.tags, 'should have "handoff" functional tag')
    assert.ok('kind:testcase' in repo.tags, 'should have "kind:testcase" tag')
    // Counts start at 0
    assert.equal(repo.tags['kind:journal'].count, 0)
    assert.equal(repo.tags['phase:coding'].count, 0)
  })

  it('updates tag repository, incrementing existing and adding new tags', () => {
    tagging.updateRepository(['kind:spec', 'phase:coding', 'custom:new-tag'])
    const repo = tagging.getTagRepository()
    assert.equal(repo.tags['kind:spec'].count, 1)
    assert.equal(repo.tags['phase:coding'].count, 1)
    assert.ok('custom:new-tag' in repo.tags, 'should add new tag')
    assert.equal(repo.tags['custom:new-tag'].count, 1)
  })

  it('persists tag repository to .tags.json on disk', () => {
    tagging.updateRepository(['kind:spec'])
    const tagsPath = path.join(tmpDir, '.tags.json')
    assert.ok(fs.existsSync(tagsPath), '.tags.json should exist after updateRepository')
    const raw = JSON.parse(fs.readFileSync(tagsPath, 'utf-8'))
    assert.equal(raw.tags['kind:spec'].count, 1)
    // Tag classes should be documented in the JSON
    assert.ok(raw._tagClasses, '.tags.json should include _tagClasses')
    assert.ok(raw._tagClasses.kind, '_tagClasses should document "kind"')
    assert.ok(raw._tagClasses.phase, '_tagClasses should document "phase"')
  })

  it('loads persisted tags on re-instantiation', () => {
    tagging.updateRepository(['kind:spec', 'kind:spec', 'phase:testing'])
    // Create fresh instance pointing to same dir
    const tagging2 = new NoteTagging(tmpDir)
    const repo = tagging2.getTagRepository()
    assert.equal(repo.tags['kind:spec'].count, 2)
    assert.equal(repo.tags['phase:testing'].count, 1)
  })

  it('seed tags cover the axes (klasse:wert)', () => {
    const tags = Object.keys(SEED_TAGS)
    // Der Bezug ist jetzt der Arbeitsablauf, nicht das Fachgebiet: `domain:*`
    // und `tech:*` sind am 2026-10-01 aufgeloest worden.
    assert.ok(tags.includes('kind:spec'), 'should include "kind:spec"')
    assert.ok(tags.includes('kind:handoff'), 'should include "kind:handoff"')
    assert.ok(tags.includes('phase:architecture'), 'should include "phase:architecture"')
    assert.ok(tags.includes('phase:monitoring'), 'should include "phase:monitoring"')
    assert.ok(tags.includes('entity:cyber-factory'), 'should include "entity:cyber-factory"')
    // Jede Phase des Arbeitsablaufs
    assert.ok(tags.includes('phase:testing'), 'should include "phase:testing"')
    assert.ok(tags.includes('phase:automation'), 'should include "phase:automation"')
    // Zustaende
    assert.ok(tags.includes('status:open'), 'should include "status:open"')
    assert.ok(tags.includes('status:done'), 'should include "status:done"')
    // Und die Typen mit eigener Ansicht
    assert.ok(tags.includes('kind:journal'), 'should include "kind:journal"')
    assert.ok(tags.includes('kind:todo'), 'should include "kind:todo"')
    assert.ok(tags.includes('kind:testcase'), 'should include "kind:testcase"')
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
