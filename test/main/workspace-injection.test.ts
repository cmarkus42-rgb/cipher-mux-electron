/**
 * Sitzungskontext ohne Injektion (2026-11-02).
 *
 * Bis 0.14.2 schrieb der Mux Global Rules, Workspace Prompt und Context
 * Directories dauerhaft in die CLAUDE.md des Projekts — sie wurden
 * mitcommittet und ueberlebten den Workspace, aus dem sie kamen. Jetzt steht der
 * Kontext in einer Datei des Mux und reist in der Startzeile mit.
 *
 * Diese Datei testete vorher eine eingebettete Kopie der Injektionslogik, nicht
 * den echten Code. Jetzt laufen die Tests gegen `folder-session.ts` und die
 * Adapter.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  buildMuxKontext,
  muxKontextPath,
  syncOwnedInstructionsKontext,
  launchLine,
  MUX_OWNED_MARKER,
  MUX_KONTEXT_HEADING,
  newInstructionsFile,
} from '../../src/main/session/folder-session'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
import { CodexAdapter } from '../../src/main/agent/adapters/codex'
import { OpenCodeAdapter } from '../../src/main/agent/adapters/opencode'

const kontext = { file: '/runs/folder/p-1.md', text: 'Zeile 1\nZeile "2" mit \'Quote\'', contextDirs: ['/ctx/a', '/ctx b'] }

describe('buildMuxKontext — derselbe Inhalt wie die frueheren Sektionen', () => {
  it('Workspace, Kontextordner und Global Rules, in dieser Reihenfolge', () => {
    const t = buildMuxKontext(
      { reconcile: true, workspaceId: 'ws-a', workspaceName: 'KEEL', workspacePrompt: 'Mach X.', contextPaths: ['/x'] },
      '  Regel eins.  ',
    )
    assert.ok(t.startsWith(MUX_KONTEXT_HEADING))
    assert.match(t, /Du arbeitest im Workspace \*\*KEEL\*\*/)
    assert.match(t, /Mach X\./)
    assert.match(t, /## Context Directories\n\n- `\/x`/)
    assert.match(t, /## Global Rules\n\nRegel eins\.\n$/)
    assert.ok(t.indexOf('## Workspace Prompt') < t.indexOf('## Context Directories'))
    assert.ok(t.indexOf('## Context Directories') < t.indexOf('## Global Rules'))
  })

  it('ohne Workspace nur die Global Rules — und der Hinweis auf die Mux-Werkzeuge', () => {
    const t = buildMuxKontext({ reconcile: true }, 'R')
    assert.ok(!t.includes('## Workspace Prompt'))
    assert.ok(!t.includes('## Context Directories'))
    assert.match(t, /`mux_\*`/)
    assert.match(t, /## Global Rules\n\nR/)
  })
})

describe('muxKontextPath — eine Datei pro Projekt und Workspace, im Mux', () => {
  it('liegt unter runs/folder, nie im Projekt', () => {
    const p = muxKontextPath('/runs', '/projekte/voice-projekt', 'ws-a')
    assert.equal(path.dirname(p), '/runs/folder')
    assert.ok(!p.startsWith('/projekte'))
    assert.match(path.basename(p), /^voice-projekt-[0-9a-f]{8}\.md$/)
  })

  it('stabil fuer dasselbe Paar, verschieden fuer anderen Workspace', () => {
    assert.equal(muxKontextPath('/r', '/p', 'ws-a'), muxKontextPath('/r', '/p/', 'ws-a'))
    assert.notEqual(muxKontextPath('/r', '/p', 'ws-a'), muxKontextPath('/r', '/p', 'ws-b'))
    assert.equal(muxKontextPath('/r', '/p', null), muxKontextPath('/r', '/p', undefined))
  })
})

describe('syncOwnedInstructionsKontext — nur Dateien, die der Mux angelegt hat', () => {
  function tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mux-kontext-'))
  }

  it('eine fremde AGENTS.md bleibt Byte fuer Byte, wie sie war', () => {
    const d = tmp()
    const f = path.join(d, 'AGENTS.md')
    fs.writeFileSync(f, '# Von Hand\n\nInhalt.\n')
    assert.equal(syncOwnedInstructionsKontext(f, `${MUX_KONTEXT_HEADING}\n\nneu\n`), false)
    assert.equal(fs.readFileSync(f, 'utf-8'), '# Von Hand\n\nInhalt.\n')
  })

  it('eine fehlende Datei legt sie nicht an', () => {
    const f = path.join(tmp(), 'AGENTS.md')
    assert.equal(syncOwnedInstructionsKontext(f, 'x'), false)
    assert.equal(fs.existsSync(f), false)
  })

  it('eine Mux-eigene bekommt den Kontext, und ein zweiter Lauf ersetzt ihn statt anzuhaengen', () => {
    const f = path.join(tmp(), 'AGENTS.md')
    const kopf = newInstructionsFile({ file: 'AGENTS.md', pointerTo: 'CLAUDE.md' })
    fs.writeFileSync(f, kopf)
    assert.ok(syncOwnedInstructionsKontext(f, `${MUX_KONTEXT_HEADING}\n\nalt\n`))
    assert.ok(syncOwnedInstructionsKontext(f, `${MUX_KONTEXT_HEADING}\n\nneu\n`))
    const c = fs.readFileSync(f, 'utf-8')
    assert.ok(c.startsWith(MUX_OWNED_MARKER))
    assert.ok(c.includes('`CLAUDE.md`'), 'der Verweis bleibt')
    assert.ok(c.includes('neu'))
    assert.ok(!c.includes('alt'))
    assert.equal(c.split(MUX_KONTEXT_HEADING).length, 2, 'genau einmal')
  })
})

describe('Startzeile: der Kontext reist mit, je CLI', () => {
  it('Claude Code: --append-system-prompt-file und --add-dir je Kontextordner', () => {
    const { args } = new ClaudeCodeAdapter().buildLaunchCommand({ projectPath: '/p', sessionName: 's', muxKontext: kontext })
    const i = args.indexOf('--append-system-prompt-file')
    assert.equal(args[i + 1], kontext.file)
    assert.deepEqual(args.filter((_, k) => args[k - 1] === '--add-dir'), ['/ctx/a', '/ctx b'])
  })

  it('Claude Code: auch beim Fortsetzen und Abzweigen', () => {
    const a = new ClaudeCodeAdapter()
    for (const o of [{ resume: true }, { resumeClaudeSessionId: 'abc' }, { forkLatest: true }, { forkFromClaudeSessionId: 'x' }]) {
      const { args } = a.buildLaunchCommand({ projectPath: '/p', sessionName: 's', muxKontext: kontext, ...o })
      assert.ok(args.includes('--append-system-prompt-file'), JSON.stringify(o))
    }
  })

  it('ohne Kontext keine Flags — Rollen bleiben, wie sie sind', () => {
    const { args } = new ClaudeCodeAdapter().buildLaunchCommand({ projectPath: '/p', sessionName: 's' })
    assert.ok(!args.includes('--append-system-prompt-file'))
    assert.ok(!args.includes('--add-dir'))
  })

  it('Codex: developer_instructions als TOML-String, ohne echte Zeilenumbrueche', () => {
    const { args } = new CodexAdapter().buildLaunchCommand({ projectPath: '/p', sessionName: 's', muxKontext: kontext })
    const v = args[args.indexOf('-c') + 1]
    assert.ok(v.startsWith('developer_instructions="'))
    assert.ok(!v.includes('\n'), 'ein echter Umbruch schoebe die Zeile beim Tippen ins Pane ab')
    assert.equal(JSON.parse(v.slice('developer_instructions='.length)), kontext.text)
  })

  it('die Zeile quotet Text-Argumente, damit die Shell ihn als ein Argument liest', () => {
    const line = launchLine(new CodexAdapter().buildLaunchCommand({ projectPath: '/p', sessionName: 's', muxKontext: kontext }))
    assert.ok(!line.includes('\n'))
    assert.match(line, / -c 'developer_instructions=/)
  })

  it('kontextAtLaunch: Claude Code und Codex ja, opencode nein', () => {
    assert.equal(new ClaudeCodeAdapter().kontextAtLaunch, true)
    assert.equal(new CodexAdapter().kontextAtLaunch, true)
    assert.ok(!new OpenCodeAdapter().kontextAtLaunch)
  })
})
