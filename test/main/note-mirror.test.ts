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

// ─── Refreshing a mirror ────────────────────────────────────
//
// The loop was open at its last step: after a role incorporated a correction
// into the file, the note still carried the old body and the old mirror
// commit. Refreshing pulls the committed content back in and moves the
// mirror point — and hands back what it replaced, because a human correction
// that has not been incorporated yet would otherwise vanish silently.

describe('NoteManager.refreshMirror', () => {
  let tmpDir: string
  let repo: string
  let mgr: NoteManager
  let firstCommit: string

  before(async () => {
    tmpDir = await makeTempDir()
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'note-mirror-repo-'))
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const run = promisify(execFile)
    const git = async (args: string[]) => (await run('git', ['-C', repo, ...args])).stdout.trim()

    await git(['init', '-b', 'main'])
    await fs.mkdir(path.join(repo, 'docs'), { recursive: true })
    await fs.writeFile(path.join(repo, 'docs', 'spec.md'), '# Spec\n\nerste Fassung\n')
    await git(['add', '-A'])
    await git(['-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', 'erste'])
    firstCommit = await git(['rev-parse', 'HEAD'])

    await fs.writeFile(path.join(repo, 'docs', 'spec.md'), '# Spec\n\nzweite Fassung\n')
    await git(['add', '-A'])
    await git(['-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', 'zweite'])
  })

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    await fs.rm(repo, { recursive: true, force: true })
  })

  beforeEach(() => {
    mgr = new NoteManager(tmpDir)
  })

  it('pulls the committed content in and moves the mirror point', async () => {
    const note = await mgr.create('Spec', '# Spec\n\nerste Fassung\n', ['spec'], {
      type: 'spec', mirrorsFile: 'docs/spec.md', mirrorCommit: firstCommit, anchorRepo: repo,
    })

    const result = await mgr.refreshMirror(note.id)

    assert.equal(result.ok, true)
    assert.ok(result.note?.mirrorCommit)
    assert.notEqual(result.note!.mirrorCommit, firstCommit, 'the mirror point must move')

    const read = await mgr.read(note.id)
    assert.ok(read!.body.includes('zweite Fassung'))
    assert.equal(read!.info.noteType, 'spec', 'type must survive a refresh')
    assert.equal(read!.info.mirrorsFile, 'docs/spec.md')
  })

  it('hands back the body it replaced', async () => {
    const note = await mgr.create('Spec2', '# Spec2\n\nmit Korrektur vom Menschen\n', [], {
      type: 'spec', mirrorsFile: 'docs/spec.md', mirrorCommit: firstCommit, anchorRepo: repo,
    })

    const result = await mgr.refreshMirror(note.id)
    assert.ok(
      result.replacedBody?.includes('mit Korrektur vom Menschen'),
      'what was overwritten must be recoverable, not silently dropped',
    )
  })

  it('refuses a note that mirrors nothing', async () => {
    const note = await mgr.create('Schlicht', '# Schlicht\n\nX.')
    const result = await mgr.refreshMirror(note.id)
    assert.equal(result.ok, false)
    assert.ok(result.problems.length > 0)
  })

  it('refuses an unknown note instead of throwing', async () => {
    const result = await mgr.refreshMirror('01NOSUCHNOTE0000000000000')
    assert.equal(result.ok, false)
  })

  it('reports a broken repository instead of destroying the note', async () => {
    const note = await mgr.create('Kaputt', '# Kaputt\n\nInhalt bleibt.\n', [], {
      type: 'spec', mirrorsFile: 'docs/spec.md', mirrorCommit: firstCommit,
      anchorRepo: '/definitely/not/here',
    })

    const result = await mgr.refreshMirror(note.id)
    assert.equal(result.ok, false)

    const read = await mgr.read(note.id)
    assert.ok(read!.body.includes('Inhalt bleibt.'), 'a failed refresh must not empty the note')
  })
})

// ─── kind:<type> tags derive the note type ──────────────────
//
// Testcases established the convention: the tag `kind:testcase` sets
// `type: testcase`, which is what makes the TestcaseView pick the note up.
// Findings need the same, and hard-coding a second special case would mean a
// third one for the type after that.

describe('NoteManager.create — type from kind: tag', () => {
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

  it('derives the type from a kind: tag for every known type', async () => {
    for (const type of ['testcase', 'finding', 'spec', 'requirements', 'research']) {
      const note = await mgr.create(`N-${type}`, `# N-${type}\n\nX.`, [`kind:${type}`])
      assert.equal(note.noteType, type, `kind:${type} should set the type`)
    }
  })

  it('does not invent a type from an unknown kind tag', async () => {
    const note = await mgr.create('Fremd', '# Fremd\n\nX.', ['kind:irgendwas'])
    assert.equal(note.noteType, undefined, 'an unknown kind must not become a type')
    assert.deepEqual(note.tags, ['kind:irgendwas'], 'the tag itself is kept')
  })

  it('an explicit type wins over the tag', async () => {
    const note = await mgr.create('Explizit', '# Explizit\n\nX.', ['kind:testcase'], { type: 'spec' })
    assert.equal(note.noteType, 'spec')
  })
})
