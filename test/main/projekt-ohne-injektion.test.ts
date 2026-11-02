import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import path from 'path'
import os from 'os'

// Nie die echte sessions.json, nie das echte runs/.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-ohne-injektion-'))
process.env.CIPHER_MUX_SESSION_STORE = path.join(tmpRoot, 'sessions.json')
process.env.CIPHER_MUX_KONTEXT_BASE = path.join(tmpRoot, 'runs')

// ─── Projektverzeichnisse ohne Injektion (2026-11-02) ────────
//
// Der Mux schreibt nicht mehr in die CLAUDE.md eines Projekts. Global Rules,
// Workspace und Kontextordner reisen in der Startzeile (`muxKontext`).

class MockTmux extends EventEmitter {
  async listSessions() { return [] }
  async killSession() {}
  watchSession() {}
  unwatchSession() {}
  disconnect() {}
  isConnected() { return true }
  async createSession() { return '$1' }
  async sendKeys() {}
  async resizePane() {}
  async capturePane() { return '' }
  async splitPane() { return '' }
}

function adapter(id: string, kontextAtLaunch: boolean) {
  const seen: Array<{ muxKontext?: { file: string; text: string } }> = []
  return {
    seen,
    a: {
      id,
      displayName: id,
      tier: 'tier-1' as const,
      kontextAtLaunch,
      isAvailable: () => Promise.resolve(true),
      supports: () => false,
      getCapabilities: () => ({}),
      instructionsTarget: () => ({ file: 'CLAUDE.md' as const }),
      buildLaunchCommand: (opts: { muxKontext?: { file: string; text: string } }) => {
        seen.push(opts)
        return { cmd: id, args: opts.muxKontext ? ['--append-system-prompt-file', opts.muxKontext.file] : [] }
      },
    },
  }
}

async function manager(a: ReturnType<typeof adapter>['a']) {
  const { SessionManager } = await import('../../src/main/session/session-manager')
  const registry = { getDefault: () => a, get: (id: string) => (id === a.id ? a : undefined), register: () => {}, list: () => [a] }
  type Ctor = ConstructorParameters<typeof SessionManager>
  return new SessionManager(new MockTmux() as unknown as Ctor[0], registry as unknown as Ctor[1])
}

const ORIGINAL = '# Projekt\n\nEigener Inhalt.\n\n## Global Rules\n\nAltlast, bleibt stehen.\n'

describe('Projektverzeichnisse: keine Injektion mehr', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(tmpRoot, 'proj-'))
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), ORIGINAL)
  })

  it('ein Ordner-Start laesst die CLAUDE.md Byte fuer Byte, wie sie war — auch Altlasten', async () => {
    const { a } = adapter('claude-code', true)
    const sm = await manager(a)
    await sm.start({ name: 'ordner', projectPath: dir, workspaceId: null, folderLaunch: {} })
    assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8'), ORIGINAL)
  })

  it('ein Start mit Workspace-Prompt und Kontextordnern ebenso (Workspace-Zelle)', async () => {
    const { a } = adapter('claude-code', true)
    const sm = await manager(a)
    await sm.start({ name: 'zelle', projectPath: dir, workspaceId: 'ws-x', workspacePrompt: 'Mach X.', contextPaths: [tmpRoot], folderLaunch: { skipPermissions: true } })
    assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8'), ORIGINAL)
  })

  it('der Kontext steht stattdessen in einer Mux-Datei und reist in der Startzeile', async () => {
    const { a, seen } = adapter('claude-code', true)
    const sm = await manager(a)
    const s = await sm.start({ name: 'zelle', projectPath: dir, workspaceId: 'ws-x', workspacePrompt: 'Mach X.', folderLaunch: {} })
    const k = seen.at(-1)?.muxKontext
    assert.ok(k, 'muxKontext an den Adapter')
    assert.ok(k.file.startsWith(process.env.CIPHER_MUX_KONTEXT_BASE!), k.file)
    assert.ok(!k.file.startsWith(dir))
    assert.match(fs.readFileSync(k.file, 'utf-8'), /Mach X\./)
    const pending = (sm as unknown as { pendingLaunch: Map<string, { command: string }> }).pendingLaunch.get(s.id)!.command
    assert.ok(pending.includes(k.file))
  })

  it('eine CLI ohne Startweg bekommt keinen Kontext in die Zeile und keine neue Datei im Projekt', async () => {
    const { a, seen } = adapter('opencode', false)
    const sm = await manager(a)
    await sm.start({ name: 'oc', projectPath: dir, workspaceId: null, folderLaunch: {} })
    assert.equal(seen.at(-1)?.muxKontext, undefined)
    assert.deepEqual(fs.readdirSync(dir).sort(), ['CLAUDE.md'])
    assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8'), ORIGINAL)
  })
})
