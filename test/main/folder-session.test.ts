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
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { OpenCodeAdapter } from '../../src/main/agent/adapters/opencode'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
import {
  ensureInstructionsFile,
  resolveWorkspaceSections,
  buildFolderAutoLaunch,
  restoreAdapterId,
  formatWorkspacePrompt,
  newInstructionsFile,
  workspaceProjects,
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

describe('Projekte des Workspaces', () => {
  const ENT = '/home/u/.config/cipher-mux/entities'
  const keel = [{
    id: 'ws-k', name: 'KEEL', contextPaths: ['/p/cipher-keel'],
    cells: [
      { project: `${ENT}/cyber-factory` },
      { project: `${ENT}/testing-assistant` },
      { project: '/p/cipher-keel-electron' },
      { project: '' },
      { project: '/p/cipher-keel-electron' },
      {},
    ],
  }]

  it('workspaceProjects: Zellen-Projekte, ohne Rollenverzeichnisse, leere und doppelte', () => {
    assert.deepEqual(workspaceProjects(keel[0], ENT), ['/p/cipher-keel-electron'])
  })

  it('workspaceProjects: kaputte Zellen aus der Config werfen nicht', () => {
    assert.deepEqual(workspaceProjects({ id: 'x', cells: null as never }, ENT), [])
    assert.deepEqual(workspaceProjects({ id: 'x', cells: [null as never, { project: 3 as never }] }, ENT), [])
  })

  it('resolveWorkspaceSections reicht die Projekte durch', () => {
    const r = resolveWorkspaceSections({ workspaceId: 'ws-k' }, keel, ENT)
    assert.deepEqual(r.workspaceProjects, ['/p/cipher-keel-electron'])
    assert.deepEqual(r.contextPaths, ['/p/cipher-keel'])
  })

  it('formatWorkspacePrompt: Name, Projekte und Hinweis auf die Kontextordner', () => {
    const text = formatWorkspacePrompt({
      workspaceId: 'ws-k', workspaceName: 'KEEL',
      workspaceProjects: ['/p/cipher-keel-electron'], contextPaths: ['/p/cipher-keel'],
    })!
    assert.ok(text.startsWith('Du arbeitest im Workspace **KEEL** (`ws-k`).'))
    assert.ok(text.includes('- `/p/cipher-keel-electron`'))
    assert.ok(text.includes('## Context Directories'), 'verweist auf die Kontextordner-Sektion')
  })

  it('formatWorkspacePrompt: ohne Kontextordner kein Verweis darauf', () => {
    const text = formatWorkspacePrompt({ workspaceId: 'ws-k', workspaceName: 'KEEL', workspaceProjects: ['/a'] })!
    assert.ok(!text.includes('Context Directories'))
  })
})

describe('ensureInstructionsFile — die Datei, die die CLI wirklich liest', () => {
  // opencode 2 liest CLAUDE.md nicht mehr (nur AGENTS.md). Der Entity-Pfad schrieb
  // die Rollen-Anweisung (Preset, Persona, Global Rules) bisher ausschliesslich als
  // CLAUDE.md ins Run-Verzeichnis — unter opencode 1.x als Rueckfall gelesen, unter
  // 2.x gar nicht: die Rolle haette ohne ihren Prompt gearbeitet, ohne jede Meldung.
  const opencode = new OpenCodeAdapter({ getSkipPermissions: () => false })
  const claude = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-instr-'))

  it('opencode 2, nur CLAUDE.md im Run-Verzeichnis: legt AGENTS.md mit Verweis an', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'CLAUDE.md'), '# Rolle\n')
    assert.equal(ensureInstructionsFile(d, opencode), 'AGENTS.md')
    const agents = fs.readFileSync(path.join(d, 'AGENTS.md'), 'utf-8')
    assert.match(agents, /CLAUDE\.md/)
    assert.match(agents, /vollständig/)
    assert.equal(fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf-8'), '# Rolle\n', 'CLAUDE.md angefasst')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('Claude Code: CLAUDE.md, es wird keine AGENTS.md angelegt', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'CLAUDE.md'), '# Rolle\n')
    assert.equal(ensureInstructionsFile(d, claude), 'CLAUDE.md')
    assert.ok(!fs.existsSync(path.join(d, 'AGENTS.md')))
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('eine vorhandene AGENTS.md wird nie ueberschrieben', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'AGENTS.md'), '# Eigene Regeln\n')
    fs.writeFileSync(path.join(d, 'CLAUDE.md'), '# Rolle\n')
    assert.equal(ensureInstructionsFile(d, opencode), 'AGENTS.md')
    assert.equal(fs.readFileSync(path.join(d, 'AGENTS.md'), 'utf-8'), '# Eigene Regeln\n')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('ein Adapter ohne instructionsTarget bleibt bei CLAUDE.md', () => {
    const d = tmp()
    assert.equal(ensureInstructionsFile(d, {} as never), 'CLAUDE.md')
    assert.ok(!fs.existsSync(path.join(d, 'AGENTS.md')))
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('wirft nicht, wenn das Verzeichnis fehlt', () => {
    assert.equal(ensureInstructionsFile('/gibt/es/nicht/wirklich', opencode), 'AGENTS.md')
  })
})
