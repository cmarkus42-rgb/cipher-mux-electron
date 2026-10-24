import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import path from 'path'
import os from 'os'

// Wie in session-resume-fork-orphan.test.ts: nie die echte sessions.json.
process.env.CIPHER_MUX_SESSION_STORE = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-model-routing-test-')),
  'sessions.json',
)

// ─── Modell-Routing im SessionManager (2026-10-24) ───────────
//
// Vorher startete jede Claude-Code-Session ohne Rolle mit dem CLI-Default, und
// der war wegen ~/.claude/settings.json Opus. Jetzt: Sonnet als Default, und
// CLAUDE_CODE_SUBAGENT_MODEL steht in der tmux-Umgebung — nur bei Claude Code.

class MockTmux extends EventEmitter {
  created: Array<{ name: string; opts: { env?: Record<string, string> } }> = []
  async listSessions() { return [] }
  async killSession() {}
  watchSession() {}
  unwatchSession() {}
  disconnect() {}
  isConnected() { return true }
  async createSession(name: string, opts: { env?: Record<string, string> }) {
    this.created.push({ name, opts })
    return '$1'
  }
  async sendKeys() {}
  async resizePane() {}
  async capturePane() { return '' }
  async splitPane() { return '' }
}

function adapter(id: string) {
  return {
    id,
    displayName: id,
    tier: 'tier-1' as const,
    isAvailable: () => Promise.resolve(true),
    supports: () => false,
    getCapabilities: () => ({}),
    buildLaunchCommand: (opts: { model?: string }) => ({ cmd: id, args: opts.model ? ['--model', opts.model] : [] }),
  }
}

// Dynamisch importiert: die Umgebungsvariable oben muss stehen, bevor der
// SessionManager seinen Store anlegt — ein statischer Import würde vorgezogen.
async function manager(tmux: MockTmux, adapterId: string) {
  const { SessionManager } = await import('../../src/main/session/session-manager')
  const a = adapter(adapterId)
  const registry = { getDefault: () => a, get: (id: string) => (id === adapterId ? a : undefined), register: () => {}, list: () => [a] }
  type Ctor = ConstructorParameters<typeof SessionManager>
  return new SessionManager(tmux as unknown as Ctor[0], registry as unknown as Ctor[1])
}

function pending(sm: unknown, id: string): string {
  return (sm as { pendingLaunch: Map<string, { command: string }> }).pendingLaunch.get(id)!.command
}

describe('Modell-Routing: Sessions ohne Rolle', () => {
  let tmux: MockTmux
  let dir: string
  beforeEach(() => {
    tmux = new MockTmux()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-'))
  })

  it('Ordner-Start mit Claude Code ohne Modell startet auf Sonnet und merkt es sich', async () => {
    const sm = await manager(tmux, 'claude-code')
    const s = await sm.start({ name: 'ordner', projectPath: dir, workspaceId: null, folderLaunch: {} })
    assert.match(pending(sm, s.id), /claude-code --model sonnet/)
    assert.equal(s.model, 'sonnet')
  })

  it('ein ausdrückliches Modell gewinnt', async () => {
    const sm = await manager(tmux, 'claude-code')
    const s = await sm.start({ name: 'ordner', projectPath: dir, workspaceId: null, folderLaunch: {}, model: 'opus' })
    assert.match(pending(sm, s.id), /--model opus/)
    assert.equal(s.model, 'opus')
  })

  it('Subagent-Modell steht in der tmux-Umgebung', async () => {
    const sm = await manager(tmux, 'claude-code')
    await sm.start({ name: 'ordner', projectPath: dir, workspaceId: null, folderLaunch: {} })
    assert.equal(tmux.created[0].opts.env?.CLAUDE_CODE_SUBAGENT_MODEL, 'sonnet')
  })

  it('eine reine Shell bekommt kein Session-Modell', async () => {
    const sm = await manager(tmux, 'claude-code')
    const s = await sm.start({ name: 'shell', projectPath: dir, workspaceId: null, folderLaunch: { shellOnly: true } })
    assert.equal(s.model, undefined)
  })

  it('andere CLIs bekommen weder Default noch Subagent-Variable', async () => {
    const sm = await manager(tmux, 'codex')
    const s = await sm.start({ name: 'ordner', projectPath: dir, workspaceId: null, folderLaunch: {} })
    assert.doesNotMatch(pending(sm, s.id), /--model/)
    assert.equal(tmux.created[0].opts.env?.CLAUDE_CODE_SUBAGENT_MODEL, undefined)
  })
})
