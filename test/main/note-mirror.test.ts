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

describe('NoteManager.save — keeps what the frontmatter carries', () => {
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

  // save() preserved these fields on disk but dropped them from its return
  // value. A caller that renders what it gets back — the UI does — showed a
  // note that had just lost its type and its mirror, until something reloaded.
  it('returns type and mirror fields after saving', async () => {
    const created = await mgr.create('Spec', '# Spec\n\nerst.', ['a'], {
      type: 'spec', mirrorsFile: 'docs/x.md', mirrorCommit: 'abc1234', anchorRepo: '/repo',
    })

    const saved = await mgr.save(created.id, '# Spec\n\nzweite Fassung.', ['a'])

    assert.equal(saved.noteType, 'spec', 'type must survive the save in the return value')
    assert.equal(saved.mirrorsFile, 'docs/x.md')
    assert.equal(saved.mirrorCommit, 'abc1234')
    assert.equal(saved.anchorRepo, '/repo')
  })

  it('keeps them on disk too', async () => {
    const created = await mgr.create('Spec2', '# Spec2\n\nerst.', [], {
      type: 'spec', mirrorsFile: 'docs/y.md', mirrorCommit: 'deadbee',
    })
    await mgr.save(created.id, '# Spec2\n\nneu.', [])

    const read = await mgr.read(created.id)
    assert.equal(read?.info.noteType, 'spec')
    assert.equal(read?.info.mirrorsFile, 'docs/y.md')
  })

  it('keeps handoff fields across a save', async () => {
    const h = await mgr.createHandoff('Übergabe', 'Body.', 'Session A', 'debugger', {
      anchorCommit: 'abc1234', anchorRepo: '/repo',
    })
    const saved = await mgr.save(h.id, '# Übergabe\n\nkorrigiert.', h.tags)

    assert.equal(saved.handoffStatus, 'pending')
    assert.equal(saved.fromSession, 'Session A')
    assert.equal(saved.toEntity, 'debugger')
    assert.equal(saved.anchorCommit, 'abc1234')
  })
})
