/**
 * Ordner-Sessions: welche Workspace-Sektionen in die CLAUDE.md gehoeren und wie
 * die Startzeile aussieht.
 *
 * Der Befund dahinter (2026-10-09): eine Ordner-Session ohne Workspace fasste
 * die CLAUDE.md nie an. Was ein frueherer Workspace-Start hineingeschrieben
 * hatte, blieb stehen und wurde nie erneuert — die Session las einen
 * Workspace-Prompt, der zu keinem Workspace mehr gehoerte.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveWorkspaceSections,
  buildFolderAutoLaunch,
  restoreAdapterId,
  formatWorkspacePrompt,
  newInstructionsFile,
} from '../../src/main/session/folder-session'

const workspaces = [
  { id: 'ws-a', name: 'A', workspacePrompt: '  Prompt A  ', contextPaths: ['/x', '/y'] },
  { id: 'ws-leer', name: 'Leer' },
]

describe('resolveWorkspaceSections', () => {
  it('undefined: keine Entscheidung — die Datei bleibt unangetastet (Shell, alte Aufrufer)', () => {
    assert.deepEqual(resolveWorkspaceSections({}, workspaces), { reconcile: false })
  })

  it('null: ausdruecklich ohne Workspace — Sektionen werden entfernt, nicht stehengelassen', () => {
    const r = resolveWorkspaceSections({ workspaceId: null }, workspaces)
    assert.equal(r.reconcile, true)
    assert.equal(r.workspacePrompt, undefined)
    assert.equal(r.contextPaths, undefined)
  })

  it('ID: Prompt und Kontextpfade kommen aus dem Workspace, getrimmt', () => {
    const r = resolveWorkspaceSections({ workspaceId: 'ws-a' }, workspaces)
    assert.deepEqual(r, {
      reconcile: true, workspaceId: 'ws-a', workspaceName: 'A',
      workspacePrompt: 'Prompt A', contextPaths: ['/x', '/y'],
    })
  })

  it('ID eines Workspaces ohne Prompt: abgleichen heisst entfernen', () => {
    const r = resolveWorkspaceSections({ workspaceId: 'ws-leer' }, workspaces)
    assert.equal(r.reconcile, true)
    assert.equal(r.workspacePrompt, undefined)
    assert.equal(r.contextPaths, undefined)
  })

  it('unbekannte ID: wie ohne Workspace — nie den Prompt eines anderen raten', () => {
    const r = resolveWorkspaceSections({ workspaceId: 'ws-weg' }, workspaces)
    assert.deepEqual(r, { reconcile: true })
  })

  it('ausdrueckliche Werte (Workspace-Apply mit Zellen-Prompt) schlagen die Nachschlage', () => {
    const r = resolveWorkspaceSections(
      { workspaceId: 'ws-a', workspacePrompt: 'Zelle', contextPaths: ['/z'] },
      workspaces,
    )
    assert.deepEqual(r, {
      reconcile: true, workspaceId: 'ws-a', workspaceName: 'A',
      workspacePrompt: 'Zelle', contextPaths: ['/z'],
    })
  })

  it('ausdrueckliche Werte ohne workspaceId: weiter injizieren wie bisher', () => {
    const r = resolveWorkspaceSections({ workspacePrompt: 'P' }, workspaces)
    assert.equal(r.reconcile, true)
    assert.equal(r.workspacePrompt, 'P')
  })

  it('kaputte Workspace-Liste aus der Config wirft nicht', () => {
    const r = resolveWorkspaceSections({ workspaceId: 'ws-a' }, undefined as never)
    assert.deepEqual(r, { reconcile: true })
  })
})

describe('buildFolderAutoLaunch', () => {
  it('nur Shell: wechselt ins Verzeichnis und startet nichts', () => {
    assert.equal(buildFolderAutoLaunch('/a/b', null), "cd '/a/b' && clear\n")
  })

  it('mit CLI: Kommando aus dem Adapter, Argumente einzeln', () => {
    const line = buildFolderAutoLaunch('/a/b', { cmd: 'codex', args: ['fork', '--last', '-c', 'x=false'] })
    assert.equal(line, "cd '/a/b' && clear; codex fork --last -c x=false\n")
  })

  it('Pfad mit Hochkomma wird fuer die Shell maskiert', () => {
    assert.equal(buildFolderAutoLaunch("/a/it's", null), "cd '/a/it'\\''s' && clear\n")
  })

  it('Argumente mit Leer- oder Sonderzeichen werden gequotet', () => {
    const line = buildFolderAutoLaunch('/p', { cmd: 'claude', args: ['--model', 'a b', "it's"] })
    assert.equal(line, "cd '/p' && clear; claude --model 'a b' 'it'\\''s'\n")
  })
})

describe('restoreAdapterId — welche CLI eine wiederhergestellte Session bekommt', () => {
  const known = (id: string) => ['claude-code', 'codex', 'opencode'].includes(id)

  it('Ordner-Session: die gespeicherte CLI, nicht der Default', () => {
    assert.equal(restoreAdapterId({ adapterId: 'codex' }, known), 'codex')
  })

  it('Rolle: entscheidet weiter selbst — die Rolle kann inzwischen umgestellt sein', () => {
    assert.equal(restoreAdapterId({ entityId: 'workshop', adapterId: 'codex' }, known), undefined)
  })

  it('unbekannte oder fehlende CLI (alter Snapshot): Default, kein Wurf', () => {
    assert.equal(restoreAdapterId({ adapterId: 'weg' }, known), undefined)
    assert.equal(restoreAdapterId({}, known), undefined)
    assert.equal(restoreAdapterId({ adapterId: null, entityId: null }, known), undefined)
  })
})

describe('Workspace beim Namen nennen', () => {
  it('resolveWorkspaceSections liefert Name und ID des Workspaces mit', () => {
    const r = resolveWorkspaceSections({ workspaceId: 'ws-leer' }, workspaces)
    assert.equal(r.workspaceName, 'Leer')
    assert.equal(r.workspaceId, 'ws-leer')
  })

  it('auch auf dem ausdruecklichen Weg (Workspace-Apply)', () => {
    const r = resolveWorkspaceSections({ workspaceId: 'ws-a', workspacePrompt: 'Zelle' }, workspaces)
    assert.equal(r.workspaceName, 'A')
  })

  it('ohne oder mit unbekanntem Workspace: kein Name', () => {
    assert.equal(resolveWorkspaceSections({ workspaceId: null }, workspaces).workspaceName, undefined)
    assert.equal(resolveWorkspaceSections({ workspaceId: 'ws-weg' }, workspaces).workspaceName, undefined)
  })

  it('formatWorkspacePrompt: Identitaet vor dem Prompt', () => {
    assert.equal(
      formatWorkspacePrompt({ workspaceId: 'ws-a', workspaceName: 'KEEL', workspacePrompt: 'Mach X.' }),
      'Du arbeitest im Workspace **KEEL** (`ws-a`).\n\nMach X.',
    )
  })

  it('formatWorkspacePrompt: Workspace ohne Prompt nennt trotzdem den Namen', () => {
    assert.equal(
      formatWorkspacePrompt({ workspaceId: 'ws-a', workspaceName: 'KEEL' }),
      'Du arbeitest im Workspace **KEEL** (`ws-a`).',
    )
  })

  it('formatWorkspacePrompt: ohne Workspace nur der Prompt, ohne beides nichts', () => {
    assert.equal(formatWorkspacePrompt({ workspacePrompt: 'P' }), 'P')
    assert.equal(formatWorkspacePrompt({}), undefined)
  })
})

describe('newInstructionsFile — der Kopf einer neu angelegten Anweisungsdatei', () => {
  it('mit Verweis: die CLI soll die CLAUDE.md lesen', () => {
    const c = newInstructionsFile({ file: 'AGENTS.md', pointerTo: 'CLAUDE.md' })
    assert.ok(c.includes('`CLAUDE.md`'))
    assert.ok(c.startsWith('# '))
  })

  it('ohne Verweis: nur eine Ueberschrift', () => {
    assert.equal(newInstructionsFile({ file: 'AGENTS.md' }), '# Projektanweisungen\n')
  })
})
