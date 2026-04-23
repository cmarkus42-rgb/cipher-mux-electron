import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'events'

/**
 * Test session recovery logic with mock tmux data.
 *
 * We create a minimal mock of TmuxManager and AdapterRegistry,
 * then exercise SessionManager.recover() with various session
 * name patterns to verify correct classification.
 */

// ─── Mock TmuxManager ──────────────────────────────────────

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

  async createSession(name: string, _opts?: unknown) {
    return `$${Math.random().toString(36).slice(2, 6)}`
  }

  async sendKeys() {}
  async resizePane() {}
  async capturePane() { return '' }
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
    }),
    buildLaunchCommand: () => ({ cmd: 'test', args: [] }),
    buildOrchestratorPromptFragment: () => '',
    buildMpoPromptFragment: () => '',
  }
}

function mockRegistry() {
  return {
    getDefault: () => mockAdapter(),
    register: () => {},
    list: () => [mockAdapter()],
  }
}

// ─── Helper: import SessionManager lazily ───────────────────

function createSessionManager(tmux: MockTmuxManager) {
  // Require inline to avoid Electron imports at module load time
  const { SessionManager } = require('../../src/main/session/session-manager')
  return new SessionManager(tmux as any, mockRegistry() as any)
}

// ─── Tests ──────────────────────────────────────────────────

describe('SessionManager.recover()', () => {
  let tmux: MockTmuxManager

  beforeEach(() => {
    tmux = new MockTmuxManager()
  })

  it('returns empty result when no tmux sessions exist', async () => {
    const sm = createSessionManager(tmux)
    const result = await sm.recover()
    assert.equal(result.recovered.length, 0)
    assert.equal(result.orphaned.length, 0)
    assert.equal(result.killed.length, 0)
  })

  it('skips cipher-mux-control session', async () => {
    tmux.sessions = [
      { id: '$0', name: 'cipher-mux-control', width: 200, height: 50, created: 1000, paneCwd: '' },
      { id: '$1', name: 'cmux-abcd1234', width: 80, height: 24, created: 1000, paneCwd: '/tmp/project-a' },
    ]
    const sm = createSessionManager(tmux)
    const result = await sm.recover()
    assert.equal(result.orphaned.length, 1)
    assert.equal(result.orphaned[0].tmuxSession, 'cmux-abcd1234')
  })

  it('skips non-cmux sessions', async () => {
    tmux.sessions = [
      { id: '$0', name: 'cipher-mux-control', width: 200, height: 50, created: 1000, paneCwd: '' },
      { id: '$1', name: 'my-personal-session', width: 80, height: 24, created: 1000, paneCwd: '' },
      { id: '$2', name: 'cmux-aaaabbbb', width: 80, height: 24, created: 1000, paneCwd: '' },
    ]
    const sm = createSessionManager(tmux)
    const result = await sm.recover()
    assert.equal(result.orphaned.length, 1)
    assert.equal(result.orphaned[0].tmuxSession, 'cmux-aaaabbbb')
  })

  it('classifies all 6 cmux sessions as orphaned on fresh startup', async () => {
    tmux.sessions = [
      { id: '$0', name: 'cipher-mux-control', width: 200, height: 50, created: 1000, paneCwd: '' },
      { id: '$1', name: 'cmux-session01', width: 80, height: 24, created: 1000, paneCwd: '/project/a' },
      { id: '$2', name: 'cmux-session02', width: 80, height: 24, created: 1001, paneCwd: '/project/b' },
      { id: '$3', name: 'cmux-session03', width: 80, height: 24, created: 1002, paneCwd: '/project/c' },
      { id: '$4', name: 'cmux-session04', width: 80, height: 24, created: 1003, paneCwd: '/project/d' },
      { id: '$5', name: 'cmux-session05', width: 80, height: 24, created: 1004, paneCwd: '/project/e' },
      { id: '$6', name: 'cmux-session06', width: 80, height: 24, created: 1005, paneCwd: '/project/f' },
    ]
    const sm = createSessionManager(tmux)
    const result = await sm.recover()
    assert.equal(result.orphaned.length, 6, `Expected 6 orphaned, got ${result.orphaned.length}`)
    assert.equal(result.recovered.length, 0)
    assert.equal(result.killed.length, 0)
  })

  it('auto-kills launcher and kickoff sessions', async () => {
    tmux.sessions = [
      { id: '$1', name: 'cmux-launcher1', width: 80, height: 24, created: 1000, paneCwd: '' },
      { id: '$2', name: 'cmux-kickoff2', width: 80, height: 24, created: 1000, paneCwd: '' },
      { id: '$3', name: 'cmux-abcd1234', width: 80, height: 24, created: 1000, paneCwd: '' },
    ]
    const sm = createSessionManager(tmux)
    const result = await sm.recover()
    assert.equal(result.killed.length, 2)
    assert.equal(result.orphaned.length, 1)
    assert.ok(tmux.killed.includes('cmux-launcher1'))
    assert.ok(tmux.killed.includes('cmux-kickoff2'))
  })

  it('preserves paneCwd as projectPath on orphaned sessions', async () => {
    tmux.sessions = [
      { id: '$1', name: 'cmux-abcd1234', width: 80, height: 24, created: 1000, paneCwd: '/Users/cipher/projects/foo' },
      { id: '$2', name: 'cmux-efgh5678', width: 80, height: 24, created: 1000, paneCwd: '' },
    ]
    const sm = createSessionManager(tmux)
    const result = await sm.recover()
    assert.equal(result.orphaned.length, 2)
    assert.equal(result.orphaned[0].projectPath, '/Users/cipher/projects/foo')
    assert.equal(result.orphaned[1].projectPath, null)
  })

  it('recovers registered sessions and marks them active', async () => {
    const sm = createSessionManager(tmux)

    // Simulate a pre-registered session (as if it was created before app restart
    // but the registry somehow survived — e.g., in a manual recover() call)
    tmux.sessions = [
      { id: '$1', name: 'cmux-testtest', width: 80, height: 24, created: 1000, paneCwd: '/tmp' },
    ]

    // Manually add session to registry
    const sessions = (sm as any).sessions as Map<string, any>
    sessions.set('test-id', {
      id: 'test-id',
      name: 'Worker-1',
      projectPath: '/tmp',
      tmuxSession: 'cmux-testtest',
      tmuxPane: '$1',
      status: 'stopped',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const result = await sm.recover()
    assert.equal(result.recovered.length, 1)
    assert.equal(result.recovered[0].status, 'active')
    assert.equal(result.orphaned.length, 0)
  })

  it('restores orchestrator and MPO links from recovered sessions', async () => {
    const sm = createSessionManager(tmux)
    const sessions = (sm as any).sessions as Map<string, any>

    sessions.set('orch-id', {
      id: 'orch-id',
      name: 'Orchestrator',
      projectPath: '/tmp/orch',
      tmuxSession: 'cmux-orchorch',
      tmuxPane: null,
      status: 'stopped',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    sessions.set('mpo-id', {
      id: 'mpo-id',
      name: 'MPO',
      projectPath: '/tmp/mpo',
      tmuxSession: 'cmux-mpompo00',
      tmuxPane: null,
      status: 'stopped',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    tmux.sessions = [
      { id: '$1', name: 'cmux-orchorch', width: 80, height: 24, created: 1000, paneCwd: '' },
      { id: '$2', name: 'cmux-mpompo00', width: 80, height: 24, created: 1000, paneCwd: '' },
    ]

    const result = await sm.recover()
    assert.equal(result.recovered.length, 2)
    assert.equal(sm.getOrchestratorSessionId(), 'orch-id')
    assert.equal(sm.getMpoSessionId(), 'mpo-id')
  })

  it('sets createdAt from tmux session creation timestamp', async () => {
    const tmuxCreatedEpoch = 1713900000 // seconds
    tmux.sessions = [
      { id: '$1', name: 'cmux-timetest', width: 80, height: 24, created: tmuxCreatedEpoch, paneCwd: '' },
    ]
    const sm = createSessionManager(tmux)
    const result = await sm.recover()
    assert.equal(result.orphaned[0].createdAt, tmuxCreatedEpoch * 1000)
  })

  it('handles mixed scenario: registered + orphaned + launcher + control', async () => {
    const sm = createSessionManager(tmux)
    const sessions = (sm as any).sessions as Map<string, any>

    sessions.set('known-id', {
      id: 'known-id',
      name: 'Known Session',
      projectPath: '/tmp/known',
      tmuxSession: 'cmux-known000',
      tmuxPane: null,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    tmux.sessions = [
      { id: '$0', name: 'cipher-mux-control', width: 200, height: 50, created: 1000, paneCwd: '' },
      { id: '$1', name: 'cmux-known000', width: 80, height: 24, created: 1000, paneCwd: '/tmp/known' },
      { id: '$2', name: 'cmux-orphan01', width: 80, height: 24, created: 1000, paneCwd: '/tmp/orphan' },
      { id: '$3', name: 'cmux-launcher3', width: 80, height: 24, created: 1000, paneCwd: '' },
      { id: '$4', name: 'some-other-app', width: 80, height: 24, created: 1000, paneCwd: '' },
    ]

    const result = await sm.recover()
    assert.equal(result.recovered.length, 1, 'should recover the known session')
    assert.equal(result.orphaned.length, 1, 'should orphan cmux-orphan01')
    assert.equal(result.killed.length, 1, 'should kill cmux-launcher3')
    assert.equal(result.orphaned[0].projectPath, '/tmp/orphan')
  })
})
