import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { resolveNoteWorkspaceId } from '../../src/main/notes/note-workspace'

// ─── In welchen Workspace gehoert eine neue Note? ───────────
//
// Befund vom 2026-10-01: zwei Werkzeuge auf derselben Verbindung antworteten
// unterschiedlich.
//
//   mux_notes_create          nahm den AKTIVEN Workspace (getActiveWorkspace)
//                             und ignorierte die Bindung der Verbindung.
//   mux_notes_handoff_create  nahm die BINDUNG (ctx.workspaceId) und ignorierte
//                             den aktiven Workspace.
//
// Beide sind halb richtig, und jede Haelfte hat ihren eigenen Schaden:
//
//   - Nur der aktive Workspace: eine Cyber-Factory-Session, die in Workspace A
//     arbeitet, schreibt ihre Note nach B, weil der Mensch gerade dorthin
//     schaut. Genau die Falle, die CLAUDE.md unter "Drei-Zustands-Disziplin"
//     beschreibt.
//   - Nur die Bindung: eine Verbindung ohne X-Mux-Workspace-Kopf erzeugt eine
//     Note ohne Workspace-Tag, und die ist dann in JEDEM Workspace sichtbar.
//     Die erste Uebergabe-Note dieser Art ist genau so entstanden.
//
// Die Regel: Bindung schlaegt Ansicht, und ohne Bindung die Ansicht.

describe('resolveNoteWorkspaceId', () => {
  it('nimmt die Bindung der Verbindung, wenn es eine gibt', () => {
    assert.equal(resolveNoteWorkspaceId('ws-bound', 'ws-active'), 'ws-bound')
  })

  // Der Kern: die Bindung gewinnt auch dann, wenn der Mensch woanders
  // hinschaut. Eine Rolle arbeitet in ihrem Workspace, nicht im angesehenen.
  it('laesst sich von der Ansicht nicht umstimmen', () => {
    assert.equal(resolveNoteWorkspaceId('ws-a', 'ws-b'), 'ws-a')
  })

  it('nimmt den aktiven Workspace, wenn die Verbindung keinen traegt', () => {
    // resolveWorkspaceId macht aus "kein Kopf" bereits ein null -- die
    // Unterscheidung zwischen "keine Praeferenz" und "ausdruecklich ungebunden"
    // ist an der Verbindungsgrenze schon verloren. Fuer eine Note ist der
    // aktive Workspace die brauchbarere Lesart: sie entsteht ja in einem
    // Projekt.
    assert.equal(resolveNoteWorkspaceId(null, 'ws-active'), 'ws-active')
    assert.equal(resolveNoteWorkspaceId(undefined, 'ws-active'), 'ws-active')
  })

  it('gibt null, wenn es gar keinen Workspace gibt', () => {
    // Dann traegt die Note keinen Workspace-Tag und ist ueberall sichtbar --
    // das ist der dokumentierte Zustand "ohne Workspace", nicht ein Versehen.
    assert.equal(resolveNoteWorkspaceId(null, null), null)
    assert.equal(resolveNoteWorkspaceId(undefined, undefined), null)
  })

  it('vertraegt leere Zeichenketten wie nicht gesetzt', () => {
    // Eine leere Zeichenkette ist, wie ein geleertes Feld in einer Oberflaeche,
    // keine Angabe -- und ganz sicher kein Workspace namens "".
    assert.equal(resolveNoteWorkspaceId('', 'ws-active'), 'ws-active')
    assert.equal(resolveNoteWorkspaceId('  ', 'ws-active'), 'ws-active')
    assert.equal(resolveNoteWorkspaceId('', ''), null)
  })
})
