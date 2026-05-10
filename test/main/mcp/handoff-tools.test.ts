import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { registerAllHandoffTools } from '../../../src/main/mcp/handoff-kernel'
import type { ToolContext } from '../../../src/main/mcp/mcp-tools'
import type { SessionInfo, EntityId } from '../../../src/shared/types'

// ─── Mock Helpers ──────────────────────────────────────────

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: `sess-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Session',
    projectPath: '/tmp/test',
    tmuxSession: 'cmux-test',
    tmuxPane: '%0',
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

interface MockCtxOpts {
  sessions?: SessionInfo[]
  paneCommand?: string
  captureOutput?: string
  singleInstance?: boolean
  startEntityResult?: SessionInfo
}

function makeCtx(opts: MockCtxOpts = {}) {
  const sessions = opts.sessions ?? []
  const sendKeysCalls: string[][] = []
  const noteCreateCalls: any[] = []
  const entityRegistry = {
    get: (entityId: EntityId) => ({
      id: entityId,
      displayName: entityId,
      color: '#fff',
      projectPath: '/tmp/entity',
      features: ['mcp'],
      singleInstance: opts.singleInstance ?? false,
    }),
    list: () => [],
    linkSession: () => {},
    unlinkSession: () => {},
  }

  const sessionManager = {
    list: () => sessions,
    get: (id: string) => sessions.find(s => s.id === id),
    getEntityRegistry: () => entityRegistry,
    sendKeys: async (sessionId: string, keys: string) => {
      sendKeysCalls.push([sessionId, keys])
    },
    startEntity: async (entityId: EntityId, _opts?: any) => {
      if (opts.startEntityResult) return opts.startEntityResult
      return makeSession({ id: `new-${entityId}`, entityId, name: entityId })
    },
    activeCount: () => sessions.filter(s => s.status === 'active').length,
    capture: async () => opts.captureOutput ?? '❯',
    tmux: {
      getPaneCommand: async () => opts.paneCommand ?? 'zsh',
    },
  } as any

  const windowManager = {
    sendToMainWindow: () => {},
  }

  const noteManager = {
    create: async (title: string, body: string, tags: string[]) => {
      const note = { id: 'note-abc', title, tags }
      noteCreateCalls.push({ title, body, tags })
      return note
    },
  } as any

  const ctx: ToolContext = {
    sessionManager,
    messageBus: null,
    statusLineMonitor: null,
    kickoffOrchestrator: null,
    taskManager: null,
    windowManager,
    noteManager,
    noteSearchIndex: null,
    memoryStore: null,
  }

  return { ctx, sendKeysCalls, noteCreateCalls }
}

type ToolHandler = (args: any) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>

function registerAndCollect(ctx: ToolContext): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>()
  const server = {
    registerTool: (name: string, _config: any, handler: any) => {
      handlers.set(name, handler)
    },
  } as any
  registerAllHandoffTools(server, ctx)
  return handlers
}

function parseResult(result: { content: { type: string; text: string }[] }) {
  return JSON.parse(result.content[0].text)
}

// ─── REQ-TOOLS-001: mux_ideation_handoff_refinement ──────

describe('REQ-TOOLS-001: mux_ideation_handoff_refinement', () => {
  it('is registered with correct name', () => {
    const { ctx } = makeCtx()
    const handlers = registerAndCollect(ctx)
    assert.ok(handlers.has('mux_ideation_handoff_refinement'))
  })

  it('targets refinement entity from ideation-partner', async () => {
    const session = makeSession({ entityId: 'refinement' as EntityId })
    const { ctx, sendKeysCalls } = makeCtx({ sessions: [session] })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_ideation_handoff_refinement')!

    const result = await handler({ anforderungspaketPath: '/tmp/paket.md' })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.wasExisting, true)
    assert.equal(parsed.targetSessionId, session.id)

    // Verify delivery contains sender identity
    // Index 1: payload (index 0 is Escape to dismiss Suggested Prompt)
    const message = sendKeysCalls[1][1]
    assert.ok(message.includes('[HANDOFF from ideation-partner]'))
    assert.ok(message.includes('anforderungspaketPath'))
    assert.ok(message.includes('/tmp/paket.md'))
  })

  it('starts new refinement session when none exists', async () => {
    const { ctx } = makeCtx({ sessions: [], paneCommand: 'claude' })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_ideation_handoff_refinement')!

    const result = await handler({ anforderungspaketPath: '/tmp/paket.md' })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.wasExisting, false)
  })
})

// ─── REQ-TOOLS-002: mux_refinement_handoff_cyber_factory ──

describe('REQ-TOOLS-002: mux_refinement_handoff_cyber_factory', () => {
  it('is registered with correct name', () => {
    const { ctx } = makeCtx()
    const handlers = registerAndCollect(ctx)
    assert.ok(handlers.has('mux_refinement_handoff_cyber_factory'))
  })

  it('targets cyber-factory from refinement with spec and lifecycle', async () => {
    const session = makeSession({ entityId: 'cyber-factory' as EntityId })
    const { ctx, sendKeysCalls } = makeCtx({ sessions: [session] })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_refinement_handoff_cyber_factory')!

    const result = await handler({
      detailSpecPath: '/tmp/spec.md',
      projectPath: '/projects/my-app',
      lifecyclePhase: 'builder',
    })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.targetSessionId, session.id)

    // Index 1: payload (index 0 is Escape to dismiss Suggested Prompt)
    const message = sendKeysCalls[1][1]
    assert.ok(message.includes('[HANDOFF from refinement]'))
    assert.ok(message.includes('detailSpecPath'))
    assert.ok(message.includes('builder'))
  })

  it('defaults lifecyclePhase to architect', async () => {
    const session = makeSession({ entityId: 'cyber-factory' as EntityId })
    const { ctx, sendKeysCalls } = makeCtx({ sessions: [session] })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_refinement_handoff_cyber_factory')!

    await handler({
      detailSpecPath: '/tmp/spec.md',
      projectPath: '/projects/my-app',
    })

    // Index 1: payload (index 0 is Escape to dismiss Suggested Prompt)
    const message = sendKeysCalls[1][1]
    assert.ok(message.includes('architect'))
  })

  it('reuses existing CF session instead of crashing', async () => {
    const session = makeSession({ entityId: 'cyber-factory' as EntityId, name: 'CF-existing' })
    const { ctx } = makeCtx({ sessions: [session], singleInstance: true })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_refinement_handoff_cyber_factory')!

    const result = await handler({
      detailSpecPath: '/tmp/spec.md',
      projectPath: '/projects/my-app',
    })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.wasExisting, true)
  })
})

// ─── REQ-TOOLS-003: mux_refinement_handoff_ideation ───────

describe('REQ-TOOLS-003: mux_refinement_handoff_ideation', () => {
  it('is registered with correct name', () => {
    const { ctx } = makeCtx()
    const handlers = registerAndCollect(ctx)
    assert.ok(handlers.has('mux_refinement_handoff_ideation'))
  })

  it('targets ideation-partner (with hyphen) from refinement', async () => {
    const session = makeSession({ entityId: 'ideation-partner' as EntityId })
    const { ctx, sendKeysCalls } = makeCtx({ sessions: [session] })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_refinement_handoff_ideation')!

    const result = await handler({
      reason: 'NFR gaps',
      gaps: ['No performance spec', 'Missing error handling'],
    })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.targetSessionId, session.id)

    // Index 1: payload (index 0 is Escape to dismiss Suggested Prompt)
    const message = sendKeysCalls[1][1]
    assert.ok(message.includes('[HANDOFF from refinement]'))
    assert.ok(message.includes('NFR gaps'))
    assert.ok(message.includes('No performance spec'))
    assert.ok(message.includes('Missing error handling'))
  })

})

// ─── REQ-TOOLS-004: mux_cyber_factory_handoff_testing ─────

describe('REQ-TOOLS-004: mux_cyber_factory_handoff_testing', () => {
  it('is registered with correct name', () => {
    const { ctx } = makeCtx()
    const handlers = registerAndCollect(ctx)
    assert.ok(handlers.has('mux_cyber_factory_handoff_testing'))
  })

  it('targets testing-assistant from cyber-factory', async () => {
    const session = makeSession({ entityId: 'testing-assistant' as EntityId })
    const { ctx, sendKeysCalls } = makeCtx({ sessions: [session] })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_cyber_factory_handoff_testing')!

    const result = await handler({
      run_id: 'run-001',
      welle_id: 'welle-3',
      summary: '## Test Results\n\nAll green',
    })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.targetSessionId, session.id)

    // Index 1: payload (index 0 is Escape to dismiss Suggested Prompt)
    const message = sendKeysCalls[1][1]
    assert.ok(message.includes('[HANDOFF from cyber-factory]'))
    assert.ok(message.includes('run_id'))
    assert.ok(message.includes('welle-3'))
  })

  it('creates a note with handoff and testing tags', async () => {
    const session = makeSession({ entityId: 'testing-assistant' as EntityId })
    const { ctx, noteCreateCalls } = makeCtx({ sessions: [session] })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_cyber_factory_handoff_testing')!

    await handler({
      run_id: 'run-001',
      welle_id: 'welle-3',
      summary: 'Test summary',
    })

    assert.equal(noteCreateCalls.length, 1)
    assert.ok(noteCreateCalls[0].title.includes('Welle welle-3'))
    assert.ok(noteCreateCalls[0].tags.includes('kind:handoff'))
    assert.ok(noteCreateCalls[0].tags.includes('scope:testing'))
  })

  it('starts testing session when none exists', async () => {
    const { ctx } = makeCtx({ sessions: [], paneCommand: 'claude' })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_cyber_factory_handoff_testing')!

    const result = await handler({
      run_id: 'run-001',
      welle_id: 'welle-1',
      summary: 'Summary',
    })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.wasExisting, false)
  })
})

// ─── REQ-TOOLS-005: mux_cyber_factory_handoff_debugger ────

describe('REQ-TOOLS-005: mux_cyber_factory_handoff_debugger', () => {
  it('is registered with correct name', () => {
    const { ctx } = makeCtx()
    const handlers = registerAndCollect(ctx)
    assert.ok(handlers.has('mux_cyber_factory_handoff_debugger'))
  })

  it('targets debugger from cyber-factory with findings', async () => {
    const session = makeSession({ entityId: 'debugger' as EntityId })
    const { ctx, sendKeysCalls } = makeCtx({ sessions: [session] })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_cyber_factory_handoff_debugger')!

    const result = await handler({
      run_id: 'run-002',
      findings_report: '## Findings\n\nCrash in module X',
      severity_summary: '2 high, 1 medium',
    })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.targetSessionId, session.id)

    // Index 1: payload (index 0 is Escape to dismiss Suggested Prompt)
    const message = sendKeysCalls[1][1]
    assert.ok(message.includes('[HANDOFF from cyber-factory]'))
    assert.ok(message.includes('findings_report'))
    assert.ok(message.includes('severity_summary'))
  })

  it('creates a note with debugging scope', async () => {
    const session = makeSession({ entityId: 'debugger' as EntityId })
    const { ctx, noteCreateCalls } = makeCtx({ sessions: [session] })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_cyber_factory_handoff_debugger')!

    await handler({
      run_id: 'run-002',
      findings_report: 'Report content',
      severity_summary: '1 critical',
    })

    assert.equal(noteCreateCalls.length, 1)
    assert.ok(noteCreateCalls[0].title.includes('1 critical'))
    assert.ok(noteCreateCalls[0].tags.includes('kind:handoff'))
    assert.ok(noteCreateCalls[0].tags.includes('scope:debugging'))
  })

  it('starts debugger session when none exists', async () => {
    const { ctx } = makeCtx({ sessions: [], paneCommand: 'claude' })
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_cyber_factory_handoff_debugger')!

    const result = await handler({
      run_id: 'run-002',
      findings_report: 'Report',
      severity_summary: 'low',
    })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.wasExisting, false)
  })
})

// ─── REQ-TOOLS-006: mux_testing_findings_handoff_debugger ──

describe('REQ-TOOLS-006: mux_testing_findings_handoff_debugger', () => {
  it('is registered with correct name', () => {
    const { ctx } = makeCtx()
    const handlers = registerAndCollect(ctx)
    assert.ok(handlers.has('mux_testing_findings_handoff_debugger'))
  })

  it('returns error when testingAssistantManager is unavailable', async () => {
    const { ctx } = makeCtx()
    // ctx has no testingAssistantManager
    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_testing_findings_handoff_debugger')!

    const result = await handler({ runId: 'run-123' })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, false)
    assert.ok(parsed.error.includes('TestingAssistantManager'))
    assert.equal(result.isError, true)
  })

  it('builds payload from testingAssistantManager and delivers to debugger', async () => {
    const session = makeSession({ entityId: 'debugger' as EntityId })
    const { ctx, sendKeysCalls } = makeCtx({ sessions: [session] })

    // Add mock testingAssistantManager
    ;(ctx as any).testingAssistantManager = {
      listFindings: (runId: string) => [
        { id: 'f1', runId, type: 'failure', severity: 'high', description: 'Test X failed', file: 'test.ts' },
      ],
    }

    const handlers = registerAndCollect(ctx)
    const handler = handlers.get('mux_testing_findings_handoff_debugger')!

    const result = await handler({ runId: 'run-456' })
    const parsed = parseResult(result)

    assert.equal(parsed.ok, true)
    assert.equal(parsed.targetSessionId, session.id)

    // Verify tmux delivery happened: Escape + message + \r (at minimum)
    assert.ok(sendKeysCalls.length >= 3)
    // Index 1: payload (index 0 is Escape to dismiss Suggested Prompt)
    const message = sendKeysCalls[1][1]
    assert.ok(message.includes('[HANDOFF from testing-assistant]'))
  })
})
