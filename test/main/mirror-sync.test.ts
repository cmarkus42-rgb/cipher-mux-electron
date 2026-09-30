import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { NoteManager } from '../../src/main/notes/note-manager'
import { syncMirrors } from '../../src/main/notes/mirror-sync'

const runGit = promisify(execFile)

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await runGit('git', ['-C', repo, ...args])
  return stdout.trim()
}

async function commitAll(repo: string, msg: string): Promise<void> {
  await git(repo, ['add', '-A'])
  await git(repo, ['-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', msg])
}

// ─── Der Mux spiegelt, nicht die Rolle ──────────────────────
//
// Entschieden am 2026-09-30: die Spiegelung laeuft deterministisch. Nicht die
// Rolle legt die Note an, weil eine Rolle es vergessen kann und die Spiegelung
// dann davon abhaengt, ob jemand daran gedacht hat.
//
// Zwei Eigenschaften machen das brauchbar:
//
//  - Wiederholbar. Ein zweiter Lauf darf keine zweite Note erzeugen; die
//    Zuordnung Datei -> Note haengt an mirrors_file, nicht am Titel.
//  - Der Workspace wird vererbt. Der Workspace ist die Heimat eines Projekts
//    und die hoechste Filterebene, also gehoert eine Spec dieses Projekts in
//    seinen Workspace.

describe('syncMirrors', () => {
  let repo: string
  let notesDir: string
  let mgr: NoteManager

  before(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-sync-repo-'))
    await git(repo, ['init', '-b', 'main'])
    await fs.mkdir(path.join(repo, 'docs', 'specs'), { recursive: true })
    await fs.writeFile(path.join(repo, 'docs', 'specs', 'eins.md'), '# Eins\n\nInhalt.\n')
    await fs.writeFile(path.join(repo, 'docs', 'specs', 'zwei.md'), '# Zwei\n\nInhalt.\n')
    await fs.writeFile(path.join(repo, 'docs', 'specs', 'notiz.txt'), 'keine Markdown-Datei\n')
    await commitAll(repo, 'specs angelegt')
  })

  after(async () => {
    await fs.rm(repo, { recursive: true, force: true })
  })

  beforeEach(async () => {
    notesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-sync-notes-'))
    mgr = new NoteManager(notesDir)
  })

  it('legt fuer jede Markdown-Datei eine Note an', async () => {
    const result = await syncMirrors({
      noteManager: mgr, repoPath: repo, directories: ['docs/specs'], noteType: 'spec',
    })

    assert.equal(result.created.length, 2)
    const notes = await mgr.list()
    assert.deepEqual(
      notes.map(n => n.mirrorsFile).sort(),
      ['docs/specs/eins.md', 'docs/specs/zwei.md'],
    )
  })

  it('uebernimmt Titel, Typ und Anker aus Datei und Repository', async () => {
    await syncMirrors({ noteManager: mgr, repoPath: repo, directories: ['docs/specs'], noteType: 'spec' })
    const note = (await mgr.list()).find(n => n.mirrorsFile === 'docs/specs/eins.md')

    assert.ok(note)
    assert.equal(note.title, 'Eins', 'der Titel kommt aus der ersten Ueberschrift')
    assert.equal(note.noteType, 'spec')
    assert.equal(note.anchorRepo, repo)
    assert.ok(note.mirrorCommit && note.mirrorCommit.length >= 7)
    assert.ok(note.tags.includes('kind:spec'), 'der Typ-Tag traegt die Ansicht')
  })

  it('erzeugt beim zweiten Lauf keine zweite Note', async () => {
    await syncMirrors({ noteManager: mgr, repoPath: repo, directories: ['docs/specs'], noteType: 'spec' })
    const second = await syncMirrors({ noteManager: mgr, repoPath: repo, directories: ['docs/specs'], noteType: 'spec' })

    assert.equal(second.created.length, 0)
    assert.equal(second.skipped.length, 2, 'bereits gespiegelte Dateien werden uebersprungen')
    assert.equal((await mgr.list()).length, 2)
  })

  it('erkennt eine bestehende Spiegelung an mirrors_file, nicht am Titel', async () => {
    // Eine Note, deren Titel nicht zur Datei passt, spiegelt sie trotzdem.
    await mgr.create('Ganz anderer Titel', '# X\n', ['kind:spec'], {
      type: 'spec', mirrorsFile: 'docs/specs/eins.md', mirrorCommit: 'abc1234', anchorRepo: repo,
    })
    const result = await syncMirrors({ noteManager: mgr, repoPath: repo, directories: ['docs/specs'], noteType: 'spec' })

    assert.equal(result.created.length, 1, 'nur zwei.md fehlt noch')
    assert.deepEqual(result.skipped, ['docs/specs/eins.md'])
  })

  it('vererbt den Workspace als Tag', async () => {
    await syncMirrors({
      noteManager: mgr, repoPath: repo, directories: ['docs/specs'],
      noteType: 'spec', workspaceId: 'ws-mux',
    })
    for (const note of await mgr.list()) {
      assert.ok(note.tags.includes('workspace:ws-mux'), `${note.mirrorsFile} ohne Workspace-Tag`)
    }
  })

  it('laesst die Note ungebunden, wenn kein Workspace genannt ist', async () => {
    await syncMirrors({ noteManager: mgr, repoPath: repo, directories: ['docs/specs'], noteType: 'spec' })
    for (const note of await mgr.list()) {
      assert.ok(!note.tags.some(t => t.startsWith('workspace:')))
    }
  })

  it('ignoriert alles, was keine Markdown-Datei ist', async () => {
    await syncMirrors({ noteManager: mgr, repoPath: repo, directories: ['docs/specs'], noteType: 'spec' })
    assert.ok(!(await mgr.list()).some(n => n.mirrorsFile?.endsWith('.txt')))
  })

  it('meldet ein fehlendes Verzeichnis, statt zu werfen', async () => {
    const result = await syncMirrors({
      noteManager: mgr, repoPath: repo, directories: ['docs/gibtsnicht'], noteType: 'spec',
    })
    assert.equal(result.created.length, 0)
    assert.ok(result.problems.length > 0)
  })

  it('meldet ein fehlendes Repository, statt zu werfen', async () => {
    const result = await syncMirrors({
      noteManager: mgr, repoPath: '/definitely/not/here', directories: ['docs'], noteType: 'spec',
    })
    assert.equal(result.ok, false)
    assert.ok(result.problems.length > 0)
  })

  it('spiegelt nur, was in git liegt', async () => {
    // Eine uncommittete Datei hat keinen Commit, den der Spiegel nennen koennte.
    await fs.writeFile(path.join(repo, 'docs', 'specs', 'neu.md'), '# Neu\n')
    try {
      const result = await syncMirrors({
        noteManager: mgr, repoPath: repo, directories: ['docs/specs'], noteType: 'spec',
      })
      assert.ok(!result.created.includes('docs/specs/neu.md'))
      assert.ok(result.problems.some(p => p.includes('neu.md')))
    } finally {
      await fs.rm(path.join(repo, 'docs', 'specs', 'neu.md'))
    }
  })
})
