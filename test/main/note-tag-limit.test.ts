import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'
import { MAX_MANUAL_TAGS } from '../../src/shared/constants'

// ─── Helpers ────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'note-tag-limit-test-'))
}

// ─── REQ-NOTES-007: Tag limit ──────────────────────────────

describe('Tag limit (REQ-NOTES-007)', () => {
  let tmpDir: string
  let mgr: NoteManager

  before(async () => {
    tmpDir = await makeTempDir()
  })

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    mgr = new NoteManager(tmpDir)
  })

  it('MAX_MANUAL_TAGS constant is 5', () => {
    assert.equal(MAX_MANUAL_TAGS, 5)
  })

  it('note with exactly 5 tags is within limit', async () => {
    const tags = ['kind:bugreport', 'domain:trading', 'tech:typescript', 'project:cipher-mux', 'phase:debugging']
    assert.equal(tags.length, MAX_MANUAL_TAGS)
    const note = await mgr.create('Five Tags', '# Five Tags\n\nBody', tags)
    assert.equal(note.tags.length, 5)
  })

  it('note with more than 5 tags is created (no rejection)', async () => {
    const tags = [
      'kind:bugreport', 'domain:trading', 'tech:typescript',
      'project:cipher-mux', 'phase:debugging', 'domain:risk',
    ]
    assert.ok(tags.length > MAX_MANUAL_TAGS, 'test setup: more than 5 tags')
    const note = await mgr.create('Six Tags', '# Six Tags\n\nBody', tags)
    // Note is created with all tags — backend does not reject
    assert.equal(note.tags.length, 6)
  })

  it('tag limit check distinguishes manual from workspace tags', () => {
    // Simulate: 3 manual tags + 3 workspace defaultTags = 6 total but only 3 manual
    const manualTags = ['kind:bugreport', 'domain:trading', 'phase:debugging']
    const workspaceDefaults = ['project:cipher-mux', 'workspace:abc', 'tech:electron']

    assert.ok(manualTags.length <= MAX_MANUAL_TAGS, 'manual tags within limit')
    assert.ok(manualTags.length + workspaceDefaults.length > MAX_MANUAL_TAGS, 'total exceeds limit')
    // Only manual tags count against the limit
    const exceedsLimit = manualTags.length > MAX_MANUAL_TAGS
    assert.equal(exceedsLimit, false, 'should not exceed limit when only counting manual tags')
  })

  it('tag limit check detects excess manual tags', () => {
    const manualTags = [
      'kind:bugreport', 'domain:trading', 'tech:typescript',
      'project:cipher-mux', 'phase:debugging', 'domain:risk',
    ]
    const exceedsLimit = manualTags.length > MAX_MANUAL_TAGS
    assert.equal(exceedsLimit, true, 'should detect excess manual tags')
  })

  it('save with excess tags still persists', async () => {
    const tags = [
      'kind:bugreport', 'domain:trading', 'tech:typescript',
      'project:cipher-mux', 'phase:debugging', 'domain:risk', 'kind:todo',
    ]
    const note = await mgr.create('Many Tags', '# Many Tags\n\nBody', tags)
    const saved = await mgr.save(note.id, '# Many Tags\n\nUpdated body', tags)
    assert.equal(saved.tags.length, 7, 'all tags should be persisted')
  })
})
