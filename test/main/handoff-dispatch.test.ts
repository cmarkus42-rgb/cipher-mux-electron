import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { NoteManager } from '../../src/main/notes/note-manager'
import { dispatchHandoffNote } from '../../src/main/notes/handoff-dispatch'
import type { DeliverFn, DeliverConfig } from '../../src/main/notes/handoff-dispatch'

const runGit = promisify(execFile)

// ─── Helpers ────────────────────────────────────────────────

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await runGit('git', ['-C', repo, ...args])
  return stdout.trim()
}

async function makeRepoWithCommits(): Promise<{ repo: string; anchor: string }> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'handoff-dispatch-repo-'))
  await git(repo, ['init', '-b', 'main'])
  await fs.mkdir(path.join(repo, 'src'), { recursive: true })
  await fs.writeFile(path.join(repo, 'src', 'alpha.ts'), 'export const a = 1\n')
  await git(repo, ['add', '-A'])
  await git(repo, ['-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', 'initial'])
  const anchor = await git(repo, ['rev-parse', 'HEAD'])

  await fs.writeFile(path.join(repo, 'src', 'alpha.ts'), 'export const a = 2\n')
  await git(repo, ['add', '-A'])
  await git(repo, ['-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', 'alpha bewegt'])

  return { repo, anchor }
}

/** Records what would have been delivered, without touching tmux. */
function recordingDeliver(result?: Awaited<ReturnType<DeliverFn>>): {
  fn: DeliverFn
  calls: DeliverConfig[]
} {
  const calls: DeliverConfig[] = []
  const fn: DeliverFn = async (config) => {
    calls.push(config)
    return result ?? { ok: true, targetSessionId: 'sess-42', wasExisting: false }
  }
  return { fn, calls }
}

// ─── dispatchHandoffNote ────────────────────────────────────

describe('dispatchHandoffNote', () => {
  let notesDir: string
  let mgr: NoteManager
  let repo: string
  let anchor: string

  before(async () => {
    notesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'handoff-dispatch-notes-'))
    const made = await makeRepoWithCommits()
    repo = made.repo
    anchor = made.anchor
  })

  after(async () => {
    await fs.rm(notesDir, { recursive: true, force: true })
    await fs.rm(repo, { recursive: true, force: true })
  })

  beforeEach(() => {
    mgr = new NoteManager(notesDir)
  })

  it('delivers the note body with a freshly computed state block', async () => {
    const note = await mgr.createHandoff(
      'Handoff: Delta am Dispatch',
      'Der Umbau betrifft `src/alpha.ts`. Entscheidung: Anker gehoert in die Note.',
      'Refinement',
      'cyber-factory',
      { anchorCommit: anchor, anchorRepo: repo },
    )

    const deliver = recordingDeliver()
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: note.id },
    )

    assert.equal(outcome.ok, true)
    assert.equal(deliver.calls.length, 1)

    const config = deliver.calls[0]
    assert.equal(config.targetEntityId, 'cyber-factory')
    assert.equal(config.projectPath, repo)

    const content = String(config.payload.content)
    assert.ok(content.includes('Zustand (berechnet beim Dispatch'), 'state block missing')
    assert.ok(content.includes('alpha bewegt'), 'commit since the anchor missing')
    assert.ok(content.includes('Anker gehoert in die Note'), 'note body missing')
  })

  it('marks the note consumed after a successful delivery', async () => {
    const note = await mgr.createHandoff(
      'Handoff: verbraucht',
      'Body mit `src/alpha.ts`.',
      'Refinement',
      'debugger',
      { anchorCommit: anchor, anchorRepo: repo },
    )

    const deliver = recordingDeliver({ ok: true, targetSessionId: 'sess-7', wasExisting: true })
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: note.id },
    )

    assert.equal(outcome.ok, true)

    const after = await mgr.read(note.id)
    assert.ok(after)
    assert.equal(after.info.handoffStatus, 'consumed')

    const raw = await fs.readFile(path.join(notesDir, `${note.id}.md`), 'utf-8')
    assert.ok(raw.includes('consumed_by: sess-7'), 'consumed_by missing')
    assert.ok(raw.includes('consumed_at:'), 'consumed_at missing')
  })

  it('leaves the note pending when delivery fails', async () => {
    const note = await mgr.createHandoff(
      'Handoff: Zustellung scheitert',
      'Body.',
      'Refinement',
      'debugger',
      { anchorCommit: anchor, anchorRepo: repo },
    )

    const deliver = recordingDeliver({ ok: false, error: 'CLI nicht bereit' })
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: note.id },
    )

    assert.equal(outcome.ok, false)

    const after = await mgr.read(note.id)
    assert.ok(after)
    assert.equal(
      after.info.handoffStatus,
      'pending',
      'a handoff that was never delivered must stay pending',
    )
  })

  it('delivers anyway when the delta cannot be computed', async () => {
    const note = await mgr.createHandoff(
      'Handoff: kaputter Anker',
      'Body.',
      'Refinement',
      'debugger',
      { anchorCommit: anchor, anchorRepo: '/definitely/not/a/repo' },
    )

    const deliver = recordingDeliver()
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: note.id },
    )

    assert.equal(outcome.ok, true, 'a broken git call must not block the handoff')
    assert.equal(deliver.calls.length, 1)
    const content = String(deliver.calls[0].payload.content)
    assert.ok(content.includes('Kein git-Repository'), 'the problem must be stated in the payload')
    assert.ok(content.includes('Body.'), 'the note body must still be delivered')
  })

  it('delivers without a state block when the note has no anchor', async () => {
    const note = await mgr.createHandoff('Handoff: ankerlos', 'Body ohne Anker.', 'Refinement', 'debugger')

    const deliver = recordingDeliver()
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: note.id },
    )

    assert.equal(outcome.ok, true)
    const content = String(deliver.calls[0].payload.content)
    assert.ok(content.includes('Body ohne Anker.'))
    assert.ok(/kein anker|ohne anker/i.test(content), 'absence of an anchor should be stated')
  })

  it('lets an explicit target override the note', async () => {
    const note = await mgr.createHandoff(
      'Handoff: umgeleitet',
      'Body.',
      'Refinement',
      'cyber-factory',
      { anchorCommit: anchor, anchorRepo: repo },
    )

    const deliver = recordingDeliver()
    await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: note.id, toEntity: 'testing-assistant' },
    )

    assert.equal(deliver.calls[0].targetEntityId, 'testing-assistant')
  })

  it('lets an explicit project path override the stored anchor repo', async () => {
    const note = await mgr.createHandoff(
      'Handoff: anderer Baum',
      'Body mit `src/alpha.ts`.',
      'Refinement',
      'debugger',
      { anchorCommit: anchor, anchorRepo: '/stale/path' },
    )

    const deliver = recordingDeliver()
    await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: note.id, projectPath: repo },
    )

    assert.equal(deliver.calls[0].projectPath, repo)
    assert.ok(String(deliver.calls[0].payload.content).includes('alpha bewegt'))
  })

  it('refuses an unknown note', async () => {
    const deliver = recordingDeliver()
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: '01NOSUCHNOTE0000000000000' },
    )

    assert.equal(outcome.ok, false)
    assert.ok(!outcome.ok && /nicht gefunden|not found/i.test(outcome.error))
    assert.equal(deliver.calls.length, 0, 'nothing may be delivered for a missing note')
  })

  it('refuses a note that is not a handoff', async () => {
    const plain = await mgr.create('Normale Notiz', '# Normale Notiz\n\nKein Handoff.')

    const deliver = recordingDeliver()
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: plain.id, toEntity: 'debugger' },
    )

    assert.equal(outcome.ok, false)
    assert.equal(deliver.calls.length, 0)
  })

  it('refuses to dispatch when no concrete target is known', async () => {
    const note = await mgr.createHandoff('Handoff: ohne Ziel', 'Body.', 'Refinement', 'any')

    const deliver = recordingDeliver()
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: deliver.fn },
      { noteId: note.id },
    )

    assert.equal(outcome.ok, false, '"any" is not a session that can be started')
    assert.equal(deliver.calls.length, 0)
  })

  it('refuses to dispatch a note that was already consumed', async () => {
    const note = await mgr.createHandoff(
      'Handoff: schon durch',
      'Body.',
      'Refinement',
      'debugger',
      { anchorCommit: anchor, anchorRepo: repo },
    )

    const first = recordingDeliver()
    await dispatchHandoffNote({ noteManager: mgr, deliver: first.fn }, { noteId: note.id })

    const second = recordingDeliver()
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: second.fn },
      { noteId: note.id },
    )

    assert.equal(outcome.ok, false)
    assert.equal(second.calls.length, 0, 'a consumed handoff must not be delivered twice')
  })

  it('dispatches a consumed note again when explicitly forced', async () => {
    const note = await mgr.createHandoff(
      'Handoff: erneut',
      'Body.',
      'Refinement',
      'debugger',
      { anchorCommit: anchor, anchorRepo: repo },
    )

    const first = recordingDeliver()
    await dispatchHandoffNote({ noteManager: mgr, deliver: first.fn }, { noteId: note.id })

    const second = recordingDeliver()
    const outcome = await dispatchHandoffNote(
      { noteManager: mgr, deliver: second.fn },
      { noteId: note.id, force: true },
    )

    assert.equal(outcome.ok, true)
    assert.equal(second.calls.length, 1)
  })
})
