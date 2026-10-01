import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'

// ─── Helpers ────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'note-handoff-anchor-test-'))
}

// ─── Handoff Anchor & Workspace Tag ─────────────────────────
//
// A handoff note carries the one thing that cannot be derived from the
// repo: the commit it was written against. Everything else about the
// world state is computed at dispatch time, never stored.

describe('NoteManager.createHandoff — anchor', () => {
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

  it('stores anchor commit and repo in frontmatter', async () => {
    const info = await mgr.createHandoff(
      'Handoff: Delta am Dispatch',
      'Kontext und Entscheidungen.',
      'Refinement',
      'cyber-factory',
      { anchorCommit: 'e07a306abc', anchorRepo: '/repo/cipher-mux-electron' },
    )

    assert.equal(info.anchorCommit, 'e07a306abc')
    assert.equal(info.anchorRepo, '/repo/cipher-mux-electron')

    const raw = await fs.readFile(path.join(tmpDir, `${info.id}.md`), 'utf-8')
    assert.ok(raw.includes('anchor_commit: e07a306abc'), 'anchor_commit missing in frontmatter')
    assert.ok(raw.includes('anchor_repo: /repo/cipher-mux-electron'), 'anchor_repo missing in frontmatter')
  })

  it('reads anchor back through read()', async () => {
    const info = await mgr.createHandoff(
      'Handoff: Wiedereinlesen',
      'Body.',
      'Workshop',
      'debugger',
      { anchorCommit: 'deadbeef', anchorRepo: '/repo/x' },
    )

    const content = await mgr.read(info.id)
    assert.ok(content, 'note should be readable')
    assert.equal(content.info.anchorCommit, 'deadbeef')
    assert.equal(content.info.anchorRepo, '/repo/x')
    assert.equal(content.info.handoffStatus, 'pending')
  })

  it('surfaces anchor through list()', async () => {
    const info = await mgr.createHandoff(
      'Handoff: Liste',
      'Body.',
      'Audit',
      'any',
      { anchorCommit: 'c0ffee1', anchorRepo: '/repo/y' },
    )

    const notes = await mgr.list()
    const found = notes.find(n => n.id === info.id)
    assert.ok(found, 'note should appear in list')
    assert.equal(found.anchorCommit, 'c0ffee1')
  })

  it('works without an anchor — the field is optional', async () => {
    const info = await mgr.createHandoff('Handoff: ankerlos', 'Body.', 'Companion')

    assert.equal(info.anchorCommit, undefined)
    assert.equal(info.anchorRepo, undefined)

    const raw = await fs.readFile(path.join(tmpDir, `${info.id}.md`), 'utf-8')
    assert.ok(!raw.includes('anchor_commit'), 'must not write an empty anchor_commit key')
    assert.ok(!raw.includes('anchor_repo'), 'must not write an empty anchor_repo key')

    const content = await mgr.read(info.id)
    assert.ok(content, 'anchorless handoff note must still be readable')
    assert.equal(content.info.handoffStatus, 'pending')
  })

  it('parses a pre-existing handoff note that predates the anchor field', async () => {
    // Written by hand the way createHandoff wrote them before this change.
    const legacy = [
      '---',
      'title: Alter Handoff',
      'tags:',
      '  - handoff',
      'from_session: Refinement',
      'to_entity: cyber-factory',
      'handoff_status: pending',
      'created: 2026-09-01T10:00:00.000Z',
      'modified: 2026-09-01T10:00:00.000Z',
      '---',
      '',
      'Alter Inhalt.',
    ].join('\n')
    await fs.writeFile(path.join(tmpDir, '01LEGACYHANDOFF00000000000.md'), legacy, 'utf-8')

    const content = await mgr.read('01LEGACYHANDOFF00000000000')
    assert.ok(content, 'legacy note must parse')
    assert.equal(content.info.anchorCommit, undefined)
    assert.equal(content.info.fromSession, 'Refinement')
    assert.equal(content.info.handoffStatus, 'pending')
  })
})

describe('NoteManager.markHandoffConsumed', () => {
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

  it('flips status and records the receiving session', async () => {
    const info = await mgr.createHandoff('Handoff: zugestellt', 'Body.', 'Refinement', 'debugger')
    assert.equal(info.handoffStatus, 'pending')

    const updated = await mgr.markHandoffConsumed(info.id, 'sess-99')
    assert.ok(updated)
    assert.equal(updated.handoffStatus, 'consumed')

    const raw = await fs.readFile(path.join(tmpDir, `${info.id}.md`), 'utf-8')
    assert.ok(raw.includes('handoff_status: consumed'))
    assert.ok(raw.includes('consumed_by: sess-99'))
    assert.ok(raw.includes('consumed_at:'))
  })

  it('preserves body, tags and anchor', async () => {
    const info = await mgr.createHandoff(
      'Handoff: unversehrt',
      'Wichtiger Inhalt mit `src/alpha.ts`.',
      'Refinement',
      'debugger',
      { anchorCommit: 'abc1234', anchorRepo: '/repo/z', workspaceId: 'ws-mux' },
    )

    await mgr.markHandoffConsumed(info.id, 'sess-1')

    const content = await mgr.read(info.id)
    assert.ok(content)
    assert.ok(content.body.includes('Wichtiger Inhalt'), 'body must survive the status flip')
    assert.equal(content.info.anchorCommit, 'abc1234')
    assert.equal(content.info.anchorRepo, '/repo/z')
    assert.deepEqual(content.info.tags, ['handoff', 'kind:handoff', 'workspace:ws-mux'])
  })

  it('returns null for an unknown note instead of throwing', async () => {
    const result = await mgr.markHandoffConsumed('01NOSUCHNOTE0000000000000', 'sess-1')
    assert.equal(result, null)
  })
})

describe('NoteManager.createHandoff — workspace binding', () => {
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

  it('adds a workspace tag when the handoff is bound to a workspace', async () => {
    const info = await mgr.createHandoff(
      'Handoff: gebunden',
      'Body.',
      'Refinement',
      'cyber-factory',
      { workspaceId: 'ws-mux' },
    )

    // `kind:handoff` kam am 2026-10-01 dazu: `handoff` ist das Signal "hier
    // wartet eine Uebergabe", der kind-Tag ist der TYP auf der Achse. Ohne ihn
    // hatte die Note keinen Typ und fiel aus jeder Filterung nach Typ heraus.
    assert.deepEqual(info.tags, ['handoff', 'kind:handoff', 'workspace:ws-mux'])

    const notes = await mgr.list(['workspace:ws-mux'])
    assert.equal(notes.length, 1)
    assert.equal(notes[0].id, info.id)
  })

  it('stays unbound without a workspace id', async () => {
    const info = await mgr.createHandoff('Handoff: ungebunden', 'Body.', 'Refinement')
    assert.deepEqual(info.tags, ['handoff', 'kind:handoff'])
    assert.ok(!info.tags.some(t => t.startsWith('workspace:')))
  })

  // Die Rolle, die die Uebergabe schreibt, und die Phase, die sich aus ihr
  // ergibt -- dieselbe Ableitung wie in mux_notes_create.
  it('traegt die Rolle und die abgeleitete Phase, wenn sie bekannt ist', async () => {
    const info = await mgr.createHandoff(
      'Handoff: mit Rolle', 'Body.', 'Refinement', 'cyber-factory',
      { entityId: 'refinement' },
    )
    assert.ok(info.tags.includes('entity:refinement'))
    assert.ok(info.tags.includes('phase:architecture'), 'aus der Rolle abgeleitet')
  })

  it('erfindet keine Rolle', async () => {
    const info = await mgr.createHandoff(
      'Handoff: ohne Rolle', 'Body.', 'Refinement', 'any', { entityId: 'gibtsnicht' },
    )
    assert.ok(!info.tags.some(t => t.startsWith('entity:')))
  })

  it('never writes a duplicate workspace tag', async () => {
    const info = await mgr.createHandoff(
      'Handoff: einmal',
      'Body.',
      'Refinement',
      'any',
      { workspaceId: 'ws-mux' },
    )
    const occurrences = info.tags.filter(t => t === 'workspace:ws-mux').length
    assert.equal(occurrences, 1)
  })
})
