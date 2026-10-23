/**
 * mux_notes_search fand „Handoff: Local Factory Härtung — Go + Nachträge
 * L15–L20" nicht, auch bei exakter Eingabe; mux_notes_handoff_search fand ihn.
 *
 * Die Ursache war nicht der Gedankenstrich und nicht Unicode (die Titel liegen
 * als NFC auf der Platte, und ein frisch gebauter Index findet beide). Der
 * FlexSearch-Index wird beim App-Start aufgebaut und danach nur von
 * mux_notes_create und den Schreibwegen der Oberflaeche gepflegt. Alles andere
 * — mux_notes_handoff_create, mux_notes_update, Testcases, Mirror-Sync,
 * Aenderungen von aussen — schreibt die Datei und laesst den Index stehen.
 * mux_notes_handoff_search liest von der Platte, deshalb fand es.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'
import { NoteSearchIndex } from '../../src/main/notes/note-search-index'

const HANDOFF_TITEL = 'Handoff: Local Factory Härtung — Go + Nachträge L15–L20'
const PLAN_TITEL = 'Plan: Local Factory nach Welle 1 – Läufer, Grenzen, Rollentext, Architekt über opencode'

describe('NoteSearchIndex.syncNote — Index folgt der Platte', () => {
  let dir: string
  let mgr: NoteManager
  let index: NoteSearchIndex

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'note-index-sync-'))
    mgr = new NoteManager(dir)
    await mgr.create('Schon da', '# Schon da\n\ntext')
    index = new NoteSearchIndex()
    await index.buildFromManager(mgr) // App-Start
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('findet eine nach dem Start angelegte Handoff-Note mit genau diesem Titel', async () => {
    const note = await mgr.createHandoff(HANDOFF_TITEL, `# ${HANDOFF_TITEL}\n\nInhalt`, 'projekt-a')
    await index.syncNote(mgr, note.id)

    const treffer = index.search('Local Factory Härtung — Go + Nachträge L15–L20').map(r => r.info.id)
    assert.ok(treffer.includes(note.id), `nicht gefunden: ${JSON.stringify(treffer)}`)
  })

  it('findet den neuen Titel, nachdem eine Note umbenannt wurde', async () => {
    const note = await mgr.create('Plan: Entwurf', '# Plan: Entwurf\n\ntext')
    await index.syncNote(mgr, note.id)
    await mgr.save(note.id, `# ${PLAN_TITEL}\n\ntext`)
    await index.syncNote(mgr, note.id)

    const treffer = index.search(PLAN_TITEL).map(r => r.info.id)
    assert.ok(treffer.includes(note.id), `nicht gefunden: ${JSON.stringify(treffer)}`)
    assert.equal(index.search(PLAN_TITEL)[0].info.title, PLAN_TITEL, 'der Treffer traegt den neuen Titel')
  })

  it('nimmt eine verschwundene Note aus dem Index', async () => {
    const note = await mgr.create('Weg damit', '# Weg damit\n\ntext')
    await index.syncNote(mgr, note.id)
    await fs.rm(path.join(dir, `${note.id}.md`))
    await index.syncNote(mgr, note.id)

    assert.equal(index.search('Weg damit').length, 0)
  })
})
