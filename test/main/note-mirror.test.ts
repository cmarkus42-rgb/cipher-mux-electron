import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'

// ─── Typed and mirrored notes ───────────────────────────────
//
// A note may mirror a file in git. The file stays the truth a role reads; the
// note is what the human reads and writes corrections on. For that to be safe
// the note must remember WHICH commit it mirrored, so its age can be computed
// rather than assumed.

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'note-mirror-test-'))
}

describe('NoteManager.create — type and mirror', () => {
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

  it('stores an explicit note type', async () => {
    const info = await mgr.create('Eine Spec', '# Eine Spec\n\nText.', [], { type: 'spec' })
    assert.equal(info.noteType, 'spec')

    const read = await mgr.read(info.id)
    assert.equal(read?.info.noteType, 'spec')
  })

  it('keeps the testcase tag convention working', async () => {
    const info = await mgr.create('Fälle', '# Fälle\n\nText.', ['kind:testcase'])
    assert.equal(info.noteType, 'testcase', 'the existing tag-driven typing must survive')
  })

  it('stores the mirrored file and the commit it was mirrored at', async () => {
    const info = await mgr.create(
      'Gespiegelte Spec',
      '# Gespiegelte Spec\n\nInhalt.',
      [],
      { type: 'spec', mirrorsFile: 'docs/spec.md', mirrorCommit: 'abc1234', anchorRepo: '/repo' },
    )

    assert.equal(info.mirrorsFile, 'docs/spec.md')
    assert.equal(info.mirrorCommit, 'abc1234')
    assert.equal(info.anchorRepo, '/repo')

    const raw = await fs.readFile(path.join(tmpDir, `${info.id}.md`), 'utf-8')
    assert.ok(raw.includes('mirrors_file: docs/spec.md'))
    assert.ok(raw.includes('mirror_commit: abc1234'))
  })

  it('reads mirror fields back through read() and list()', async () => {
    const info = await mgr.create('Wieder', '# Wieder\n\nX.', [], {
      type: 'spec', mirrorsFile: 'docs/a.md', mirrorCommit: 'deadbee',
    })

    const read = await mgr.read(info.id)
    assert.equal(read?.info.mirrorsFile, 'docs/a.md')
    assert.equal(read?.info.mirrorCommit, 'deadbee')

    const listed = (await mgr.list()).find(n => n.id === info.id)
    assert.equal(listed?.mirrorsFile, 'docs/a.md')
  })

  it('writes no mirror keys for an ordinary note', async () => {
    const info = await mgr.create('Schlicht', '# Schlicht\n\nX.')
    const raw = await fs.readFile(path.join(tmpDir, `${info.id}.md`), 'utf-8')
    assert.ok(!raw.includes('mirrors_file'))
    assert.ok(!raw.includes('mirror_commit'))
    assert.ok(!raw.includes('type:'))
    assert.equal(info.noteType, undefined)
  })

  it('parses a note written before mirroring existed', async () => {
    const legacy = [
      '---',
      'title: Alte Notiz',
      'tags: []',
      'created: 2026-01-01T00:00:00.000Z',
      'modified: 2026-01-01T00:00:00.000Z',
      '---',
      '',
      'Alter Inhalt.',
    ].join('\n')
    await fs.writeFile(path.join(tmpDir, '01LEGACYMIRROR000000000000.md'), legacy, 'utf-8')

    const read = await mgr.read('01LEGACYMIRROR000000000000')
    assert.ok(read, 'legacy note must parse')
    assert.equal(read.info.mirrorsFile, undefined)
    assert.equal(read.info.title, 'Alte Notiz')
  })
})
