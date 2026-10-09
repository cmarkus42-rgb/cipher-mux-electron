import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'events'

import * as fsSyncIso from 'fs'
import pathIso from 'path'
import osIso from 'os'

// Point every SessionStore in this process at a throwaway file. Without this,
// constructing a real SessionManager wrote test fixtures into the user's live
// ~/.config/cipher-mux/sessions.json, wiping their sessions and grid layout.
// SessionStore now refuses the live path in a test process, so this is also
// what keeps these tests runnable.
process.env.CIPHER_MUX_SESSION_STORE = pathIso.join(
  fsSyncIso.mkdtempSync(pathIso.join(osIso.tmpdir(), 'cmux-session-store-test-')),
  'sessions.json',
)

/**
 * SP-5: Session Resume, Fork, and Orphan Detection tests.
 */

// ─���─ Mock TmuxManager ──────────────────────────────────────

interface MockTmuxSession {
  id: string
  name: string
  width: number
  height: number
  created: number
  paneCwd: string
}

class MockTmuxManager extends EventEmitter {
  sessions: MockTmuxSession[] = []
  killed: string[] = []
  created: Array<{ name: string; opts: any }> = []

  async listSessions() {
    return this.sessions
  }

  async killSession(name: string) {
    this.killed.push(name)
  }

  watchSession() {}
  unwatchSession() {}
  disconnect() {}
  isConnected() { return true }

  async createSession(name: string, opts?: unknown) {
    this.created.push({ name, opts })
    return `$${Math.random().toString(36).slice(2, 6)}`
  }

  async sendKeys() {}
  async resizePane() {}
  async capturePane() { return '' }
  async splitPane() { return '' }
}

// ─── Mock AdapterRegistry ──────────────────────────────────

function mockAdapter() {
  return {
    id: 'test',
    displayName: 'Test',
    tier: 'tier-1' as const,
    isAvailable: () => Promise.resolve(true),
    supports: () => true,
    getCapabilities: () => ({
      'mcp-injection': true,
      'status-line': true,
      'skip-permissions': true,
      'sub-agents': true,
      'project-instructions': true,
      'message-bus-participant': true,
      'companion-mcp': false,
    }),
    buildLaunchCommand: (opts: any) => {
      const args: string[] = []
      if (opts.forkFromClaudeSessionId) {
        args.push('--fork-session', opts.forkFromClaudeSessionId)
      }
      return { cmd: 'claude', args }
    },
    buildOrchestratorPromptFragment: () => '',
    buildCyberFactoryPromptFragment: () => '',
    buildLauncherPromptFragment: () => '',
    getProjectMarkers: () => ['CLAUDE.md'],
    readProjectInstructions: () => Promise.resolve(null),
    getContextUsage: () => Promise.resolve(null),
    attachStatusHook: () => Promise.resolve(),
    sendPrompt: () => Promise.resolve(),
    postLaunchInjection: () => Promise.resolve(),
  }
}

function mockRegistry() {
  return {
    getDefault: () => mockAdapter(),
    get: (id: string) => (id === 'test' ? mockAdapter() : undefined),
    register: () => {},
    list: () => [mockAdapter()],
  }
}

// ─── Helper ─────────────────────────────────────────────────

function createSessionManager(tmux: MockTmuxManager) {
  const { SessionManager } = require('../../src/main/session/session-manager')
  return new SessionManager(tmux as any, mockRegistry() as any)
}

// ─── Session Start Tests ────────────────────────────────────

describe('SP-5: Session Start (no resume)', () => {
  let tmux: MockTmuxManager

  beforeEach(() => {
    tmux = new MockTmuxManager()
  })

  it('start without autoLaunch does not queue pending launch', async () => {
    const sm = createSessionManager(tmux)
    const session = await sm.start({
      name: 'Worker',
      projectPath: '/tmp/test',
    })
    const pending = (sm as any).pendingLaunch as Map<string, any>
    assert.ok(!pending.has(session.id), 'should not have a pending launch')
  })

  it('start with explicit autoLaunch queues it', async () => {
    const sm = createSessionManager(tmux)
    const session = await sm.start({
      name: 'Worker',
      projectPath: '/tmp/test',
      autoLaunch: 'custom-command\n',
    })
    const pending = (sm as any).pendingLaunch as Map<string, any>
    assert.ok(pending.has(session.id))
    assert.equal(pending.get(session.id).command, 'custom-command\n')
  })
})

// ─── Fork Tests ─────────────────────────────────────────────

describe('SP-5: Session Fork', () => {
  let tmux: MockTmuxManager

  beforeEach(() => {
    tmux = new MockTmuxManager()
  })

  it('forkSession creates new session with --fork-session flag', async () => {
    const sm = createSessionManager(tmux)
    const source = await sm.start({
      name: 'Original',
      projectPath: '/tmp/project',
    })
    // Simulate statusline providing a Claude session ID
    sm.updateClaudeSessionId(source.id, 'claude-sess-123')

    const forked = await sm.forkSession(source.id)
    assert.equal(forked.name, 'Original-fork')
    assert.equal(forked.projectPath, '/tmp/project')

    const pending = (sm as any).pendingLaunch as Map<string, any>
    assert.ok(pending.has(forked.id))
    const cmd = pending.get(forked.id).command
    assert.ok(cmd.includes('--fork-session'), `should include --fork-session, got: ${cmd}`)
    assert.ok(cmd.includes('claude-sess-123'), `should include source session ID, got: ${cmd}`)
  })

  it('forkSession throws when source has no claudeSessionId', async () => {
    const sm = createSessionManager(tmux)
    const source = await sm.start({
      name: 'Original',
      projectPath: '/tmp/project',
    })

    await assert.rejects(
      () => sm.forkSession(source.id),
      /no Claude session ID/i,
    )
  })

  it('forkSession throws for non-existent source', async () => {
    const sm = createSessionManager(tmux)
    await assert.rejects(
      () => sm.forkSession('nonexistent'),
      /not found/,
    )
  })

  it('updateClaudeSessionId updates session state', () => {
    const sm = createSessionManager(tmux)
    // Need to start a session first
    return sm.start({ name: 'Test', projectPath: '/tmp' }).then((session: any) => {
      sm.updateClaudeSessionId(session.id, 'my-claude-id')
      const updated = sm.get(session.id)
      assert.equal(updated.claudeSessionId, 'my-claude-id')
    })
  })
})

// ─── Orphan Detection Tests ──────────────────────────────────

describe('SP-5: Orphan Detection', () => {
  let tmux: MockTmuxManager

  beforeEach(() => {
    tmux = new MockTmuxManager()
  })

  it('detectOrphans finds cmux- sessions not in registry', async () => {
    const sm = createSessionManager(tmux)
    tmux.sessions = [
      { id: '$0', name: 'cipher-mux-control', width: 200, height: 50, created: 1000, paneCwd: '' },
      { id: '$1', name: 'cmux-orphan01', width: 80, height: 24, created: 1000, paneCwd: '/tmp/orphan' },
      { id: '$2', name: 'cmux-orphan02', width: 80, height: 24, created: 1001, paneCwd: '' },
    ]

    const orphans = await sm.detectOrphans()
    assert.equal(orphans.length, 2)
    assert.equal(orphans[0].tmuxSession, 'cmux-orphan01')
    assert.equal(orphans[0].projectPath, '/tmp/orphan')
    assert.equal(orphans[1].tmuxSession, 'cmux-orphan02')
  })

  it('detectOrphans ignores non-cmux sessions', async () => {
    const sm = createSessionManager(tmux)
    tmux.sessions = [
      { id: '$1', name: 'my-personal-session', width: 80, height: 24, created: 1000, paneCwd: '' },
      { id: '$2', name: 'cmux-orphan01', width: 80, height: 24, created: 1000, paneCwd: '' },
    ]

    const orphans = await sm.detectOrphans()
    assert.equal(orphans.length, 1)
    assert.equal(orphans[0].tmuxSession, 'cmux-orphan01')
  })

  it('detectOrphans excludes registered sessions', async () => {
    const sm = createSessionManager(tmux)
    const session = await sm.start({ name: 'Known', projectPath: '/tmp' })

    tmux.sessions = [
      { id: '$1', name: session.tmuxSession, width: 80, height: 24, created: 1000, paneCwd: '/tmp' },
      { id: '$2', name: 'cmux-unknown1', width: 80, height: 24, created: 1000, paneCwd: '' },
    ]

    const orphans = await sm.detectOrphans()
    assert.equal(orphans.length, 1)
    assert.equal(orphans[0].tmuxSession, 'cmux-unknown1')
  })

  it('detectOrphans returns empty when no orphans', async () => {
    const sm = createSessionManager(tmux)
    tmux.sessions = [
      { id: '$0', name: 'cipher-mux-control', width: 200, height: 50, created: 1000, paneCwd: '' },
    ]

    const orphans = await sm.detectOrphans()
    assert.equal(orphans.length, 0)
  })

  it('detectOrphans emits orphans-detected event', async () => {
    const sm = createSessionManager(tmux)
    tmux.sessions = [
      { id: '$1', name: 'cmux-orphan01', width: 80, height: 24, created: 1000, paneCwd: '' },
    ]

    let emitted = false
    sm.on('orphans-detected', () => { emitted = true })

    await sm.detectOrphans()
    assert.ok(emitted, 'should emit orphans-detected event')
  })

  it('startOrphanDetection and stopOrphanDetection lifecycle', () => {
    const sm = createSessionManager(tmux)
    sm.startOrphanDetection()
    assert.ok((sm as any).orphanTimer != null, 'timer should be set')

    sm.stopOrphanDetection()
    assert.equal((sm as any).orphanTimer, null, 'timer should be cleared')
  })
})

// ─── ClaudeCodeAdapter Tests ─────────────────────────────────

describe('SP-5: ClaudeCodeAdapter.buildLaunchCommand', () => {
  it('adds --fork-session when forkFromClaudeSessionId is set', () => {
    const { ClaudeCodeAdapter } = require('../../src/main/agent/adapters/claude-code')
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    const cmd = adapter.buildLaunchCommand({
      projectPath: '/tmp',
      sessionName: 'test',
      forkFromClaudeSessionId: 'abc-123',
    })
    assert.ok(cmd.args.includes('--fork-session'), 'should include --fork-session')
    assert.ok(cmd.args.includes('abc-123'), 'should include the session ID')
    assert.ok(!cmd.args.includes('--resume'), 'should not include --resume')
  })

  it('does not add flags when no fork is set', () => {
    const { ClaudeCodeAdapter } = require('../../src/main/agent/adapters/claude-code')
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    const cmd = adapter.buildLaunchCommand({
      projectPath: '/tmp',
      sessionName: 'test',
    })
    assert.ok(!cmd.args.includes('--resume'))
    assert.ok(!cmd.args.includes('--fork-session'))
  })
})

// ─── Ordner-Start ───────────────────────────────────────────

function pendingCommand(sm: unknown, id: string): string {
  return (sm as { pendingLaunch: Map<string, { command: string }> }).pendingLaunch.get(id)!.command
}

describe('Ordner-Start: Workspace-Sektionen und Startzeile', () => {
  const STALE = '# Projekt\n\nText\n\n## Workspace Prompt\n\nalter Prompt\n\n## Context Directories\n\n- `/alt`\n'
  let tmux: MockTmuxManager
  let dir: string

  beforeEach(() => {
    tmux = new MockTmuxManager()
    dir = fsSyncIso.mkdtempSync(pathIso.join(osIso.tmpdir(), 'ordner-start-'))
    fsSyncIso.writeFileSync(pathIso.join(dir, 'CLAUDE.md'), STALE)
  })

  it('ausdruecklich ohne Workspace: der alte Prompt verschwindet', async () => {
    const sm = createSessionManager(tmux)
    await sm.start({ name: 'ordner', projectPath: dir, workspaceId: null, folderLaunch: {} })
    const md = fsSyncIso.readFileSync(pathIso.join(dir, 'CLAUDE.md'), 'utf-8')
    assert.ok(!md.includes('## Workspace Prompt'), md)
    assert.ok(!md.includes('alter Prompt'))
    assert.ok(!md.includes('## Context Directories'))
    assert.ok(md.includes('# Projekt'), 'der eigene Inhalt bleibt')
  })

  it('ohne Angabe (Shell aus dem Zellenkopf): die Datei bleibt, wie sie ist', async () => {
    const sm = createSessionManager(tmux)
    await sm.start({ name: 'Shell', projectPath: dir })
    const md = fsSyncIso.readFileSync(pathIso.join(dir, 'CLAUDE.md'), 'utf-8')
    assert.ok(md.includes('alter Prompt'))
  })

  it('folderLaunch: die Startzeile kommt vom Adapter der Session', async () => {
    const sm = createSessionManager(tmux)
    const s = await sm.start({ name: 'ordner', projectPath: dir, workspaceId: null, folderLaunch: { resume: true } })
    const cmd = pendingCommand(sm, s.id)
    assert.equal(cmd, `cd '${dir}' && clear; claude\n`)
  })

  it('folderLaunch nur Shell: kein CLI-Start', async () => {
    const sm = createSessionManager(tmux)
    const s = await sm.start({ name: 'ordner', projectPath: dir, workspaceId: null, folderLaunch: { shellOnly: true } })
    const cmd = pendingCommand(sm, s.id)
    assert.equal(cmd, `cd '${dir}' && clear\n`)
  })

  it('der Fork laeuft unter der CLI der Quelle, auch fuer die Injektion', async () => {
    const sm = createSessionManager(tmux)
    const source = await sm.start({ name: 'Original', projectPath: dir })
    sm.updateClaudeSessionId(source.id, 'abc')
    const forked = await sm.forkSession(source.id)
    assert.equal(forked.adapterId, 'test')
  })
})

// ─── Anweisungsdatei pro CLI ────────────────────────────────

describe('Ordner-Start: der Mux schreibt in die Datei, die die CLI liest', () => {
  let tmux: MockTmuxManager
  let dir: string

  /** Eine CLI wie Codex: liest nur AGENTS.md, legt sie mit Verweis an. */
  function agentsMdManager() {
    const agents = {
      ...mockAdapter(),
      id: 'agents',
      instructionsTarget: (p: { agentsMd: boolean; claudeMd: boolean }) =>
        !p.agentsMd && p.claudeMd ? { file: 'AGENTS.md', pointerTo: 'CLAUDE.md' } : { file: 'AGENTS.md' },
    }
    const registry = { ...mockRegistry(), get: (id: string) => (id === 'agents' ? agents : id === 'test' ? mockAdapter() : undefined) }
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- verzoegert wie createSessionManager: kein Electron-Import beim Laden
    const { SessionManager } = require('../../src/main/session/session-manager')
    return new SessionManager(tmux as unknown, registry as unknown)
  }
  const read = (f: string) => fsSyncIso.readFileSync(pathIso.join(dir, f), 'utf-8')
  const exists = (f: string) => fsSyncIso.existsSync(pathIso.join(dir, f))

  beforeEach(() => {
    tmux = new MockTmuxManager()
    dir = fsSyncIso.mkdtempSync(pathIso.join(osIso.tmpdir(), 'anweisung-'))
    fsSyncIso.writeFileSync(pathIso.join(dir, 'CLAUDE.md'), '# Eigenes\n\nInhalt\n')
  })

  it('fehlt AGENTS.md: neu angelegt, mit Verweis auf die CLAUDE.md; die CLAUDE.md bleibt unberuehrt', async () => {
    const sm = agentsMdManager()
    await sm.start({ name: 'o', projectPath: dir, adapterId: 'agents', workspacePrompt: 'P', folderLaunch: {} })
    assert.ok(exists('AGENTS.md'))
    assert.ok(read('AGENTS.md').includes('`CLAUDE.md`'), 'Verweis fehlt')
    assert.ok(read('AGENTS.md').includes('## Workspace Prompt\n\nP'))
    assert.equal(read('CLAUDE.md'), '# Eigenes\n\nInhalt\n')
  })

  it('vorhandene AGENTS.md: ihr Inhalt bleibt, die Sektionen kommen dazu', async () => {
    fsSyncIso.writeFileSync(pathIso.join(dir, 'AGENTS.md'), '# Schon da\n')
    const sm = agentsMdManager()
    await sm.start({ name: 'o', projectPath: dir, adapterId: 'agents', workspacePrompt: 'P', folderLaunch: {} })
    assert.ok(read('AGENTS.md').startsWith('# Schon da\n'))
    assert.ok(read('AGENTS.md').includes('## Workspace Prompt'))
  })

  it('nur Shell: keine AGENTS.md — es startet keine CLI, die sie lesen wuerde', async () => {
    const sm = agentsMdManager()
    await sm.start({ name: 'o', projectPath: dir, adapterId: 'agents', workspaceId: null, folderLaunch: { shellOnly: true } })
    assert.ok(!exists('AGENTS.md'))
  })

  it('Claude-artige CLI (kein instructionsTarget): weiter CLAUDE.md', async () => {
    const sm = createSessionManager(tmux)
    await sm.start({ name: 'o', projectPath: dir, workspacePrompt: 'P', folderLaunch: {} })
    assert.ok(!exists('AGENTS.md'))
    assert.ok(read('CLAUDE.md').includes('## Workspace Prompt\n\nP'))
  })
})
