import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  executeHandoff,
  isBusy,
  startEntitySession,
  registerHandoffTool,
  registerAllHandoffTools,
  type HandoffConfig,
  type HandoffResult,
  type HandoffError,
} from '../../../src/main/mcp/handoff-kernel'
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
  startEntityError?: string
}

function makeCtx(opts: MockCtxOpts = {}): ToolContext & { sendKeysCalls: string[][]; messageBusCalls: any[]; visibleAddCalls: any[]; noteCreateCalls: any[]; inputRequestCalls: any[] } {
  const sessions = opts.sessions ?? []
  const sendKeysCalls: string[][] = []
  const messageBusCalls: any[] = []
  const visibleAddCalls: any[] = []
  const noteCreateCalls: any[] = []
  const inputRequestCalls: any[] = []

  const entityRegistry = {
    get: (entityId: EntityId) => {
      if (entityId === 'unknown-entity') return undefined
      return {
        id: entityId,
        displayName: entityId,
        color: '#fff',
        projectPath: '/tmp/entity',
        features: ['mcp'],
        singleInstance: opts.singleInstance ?? false,
      }
    },
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
      if (opts.startEntityError) throw new Error(opts.startEntityError)
      if (opts.startEntityResult) return opts.startEntityResult
      return makeSession({ id: `new-${entityId}`, entityId, name: entityId })
    },
    activeCount: () => sessions.filter(s => s.status === 'active').length,
    capture: async () => opts.captureOutput ?? '❯',
    // Expose tmux for isBusy check
    tmux: {
      getPaneCommand: async () => opts.paneCommand ?? 'zsh',
    },
  } as any

  const messageBus = {
    send: (msg: any) => {
      messageBusCalls.push(msg)
      return { id: 'msg-1', ...msg }
    },
  } as any

  const windowManager = {
    sendToMainWindow: (channel: string, data: unknown) => {
      visibleAddCalls.push({ channel, data })
    },
  }

  const noteManager = {
    create: async (title: string, body: string, tags: string[]) => {
      const note = { id: 'note-123', title, tags }
      noteCreateCalls.push({ title, body, tags })
      return note
    },
  } as any

  const inputRequestWatcher = {
    createRequest: (req: any) => {
      inputRequestCalls.push(req)
    },
  } as any

  return {
    sessionManager,
    messageBus,
    statusLineMonitor: null,
    kickoffOrchestrator: null,
    taskManager: null,
    inputRequestWatcher,
    windowManager,
    noteManager,
    noteSearchIndex: null,
    memoryStore: null,
    sendKeysCalls,
    messageBusCalls,
    visibleAddCalls,
    noteCreateCalls,
    inputRequestCalls,
  }
}

// ─── Tests ─────────────────────────────────────────────────

describe('handoff-kernel: isBusy', () => {
  it('returns false when pane runs zsh (idle)', async () => {
    const ctx = makeCtx({ paneCommand: 'zsh' })
    const session = makeSession()
    assert.equal(await isBusy(ctx, session), false)
  })

  it('returns true when pane runs claude (active)', async () => {
    const ctx = makeCtx({ paneCommand: 'claude' })
    const session = makeSession()
    assert.equal(await isBusy(ctx, session), true)
  })

  it('returns false on error', async () => {
    const ctx = makeCtx()
    // Remove tmux to trigger error path
    ;(ctx.sessionManager as any).tmux = null
    const session = makeSession()
    assert.equal(await isBusy(ctx, session), false)
  })
})

describe('handoff-kernel: executeHandoff', () => {
  it('reuses existing idle session and delivers via sendKeys', async () => {
    const existingSession = makeSession({ entityId: 'refinement' as EntityId })
    const ctx = makeCtx({ sessions: [existingSession], paneCommand: 'zsh' })

    const config: HandoffConfig = {
      targetEntityId: 'refinement',
      senderEntityId: 'ideation-partner',
      sessionName: 'Refinement',
      payload: { specPath: '/tmp/spec.md' },
    }

    const result = await executeHandoff(ctx, config)
    assert.equal((result as HandoffResult).ok, true)
    assert.equal((result as HandoffResult).wasExisting, true)
    assert.equal((result as HandoffResult).targetSessionId, existingSession.id)

    // Verify sendKeys was called with formatted payload
    assert.ok(ctx.sendKeysCalls.length >= 2)
    const fullMessage = ctx.sendKeysCalls[0][1]
    assert.ok(fullMessage.includes('[HANDOFF from ideation-partner]'))
    assert.ok(fullMessage.includes('specPath'))
  })

  it('starts new entity session when none exists', async () => {
    const newSession = makeSession({ id: 'new-refinement', entityId: 'refinement' as EntityId })
    const ctx = makeCtx({ sessions: [], startEntityResult: newSession, paneCommand: 'claude' })

    const config: HandoffConfig = {
      targetEntityId: 'refinement',
      senderEntityId: 'ideation-partner',
      sessionName: 'Refinement',
      payload: { data: 'test' },
    }

    const result = await executeHandoff(ctx, config)
    assert.equal((result as HandoffResult).ok, true)
    assert.equal((result as HandoffResult).wasExisting, false)
    assert.equal((result as HandoffResult).targetSessionId, 'new-refinement')
  })

  it('returns error when entity is unknown', async () => {
    const ctx = makeCtx({ sessions: [], startEntityError: 'Unknown entity: bad-id' })

    const config: HandoffConfig = {
      targetEntityId: 'bad-id' as EntityId,
      senderEntityId: 'test',
      sessionName: 'Bad',
      payload: {},
    }

    const result = await executeHandoff(ctx, config)
    assert.equal((result as HandoffError).ok, false)
    assert.ok((result as HandoffError).error.includes('Unknown entity'))
  })

  it('creates note when createNote is set', async () => {
    const existingSession = makeSession({ entityId: 'debugger' as EntityId })
    const ctx = makeCtx({ sessions: [existingSession], paneCommand: 'zsh' })

    const config: HandoffConfig = {
      targetEntityId: 'debugger',
      senderEntityId: 'testing-assistant',
      sessionName: 'Debugger',
      payload: { findings: 'bug in X' },
      createNote: { title: 'Bug Findings', body: 'Details here', tags: ['kind:handoff'] },
    }

    const result = await executeHandoff(ctx, config)
    assert.equal((result as HandoffResult).ok, true)
    assert.equal((result as HandoffResult).noteId, 'note-123')
    assert.equal(ctx.noteCreateCalls.length, 1)
    assert.equal(ctx.noteCreateCalls[0].title, 'Bug Findings')
  })

  it('creates input request when createInputRequest is set', async () => {
    const existingSession = makeSession({ entityId: 'ideation-partner' as EntityId })
    const ctx = makeCtx({ sessions: [existingSession], paneCommand: 'zsh' })

    const config: HandoffConfig = {
      targetEntityId: 'ideation-partner',
      senderEntityId: 'refinement',
      sessionName: 'Ideation',
      payload: { reason: 'gaps found' },
      createInputRequest: { question: 'Review gaps?', context: 'Details' },
    }

    const result = await executeHandoff(ctx, config)
    assert.equal((result as HandoffResult).ok, true)
    assert.equal(ctx.inputRequestCalls.length, 1)
    assert.equal(ctx.inputRequestCalls[0].question, 'Review gaps?')
  })

  it('writes to MessageBus when windowManager is null (background fallback)', async () => {
    const existingSession = makeSession({ entityId: 'audit' as EntityId })
    const ctx = makeCtx({ sessions: [existingSession], paneCommand: 'zsh' })
    // Remove windowManager to simulate background-only delivery
    ;(ctx as any).windowManager = null

    const config: HandoffConfig = {
      targetEntityId: 'audit',
      senderEntityId: 'cyber-factory',
      sessionName: 'Audit',
      payload: { scope: 'full' },
    }

    const result = await executeHandoff(ctx, config)
    assert.equal((result as HandoffResult).ok, true)
    assert.equal(ctx.messageBusCalls.length, 1)
    assert.ok(ctx.messageBusCalls[0].payload.text.includes('audit'))
  })

  it('does not write to MessageBus when session is made visible', async () => {
    const existingSession = makeSession({ entityId: 'audit' as EntityId })
    const ctx = makeCtx({ sessions: [existingSession], paneCommand: 'zsh' })

    const config: HandoffConfig = {
      targetEntityId: 'audit',
      senderEntityId: 'cyber-factory',
      sessionName: 'Audit',
      payload: { scope: 'full' },
    }

    await executeHandoff(ctx, config)
    assert.equal(ctx.messageBusCalls.length, 0)
  })
})

describe('handoff-kernel: session matching priority', () => {
  it('prefers idle session over busy when singleInstance', async () => {
    const busySession = makeSession({ id: 'busy-1', entityId: 'cyber-factory' as EntityId })
    const idleSession = makeSession({ id: 'idle-1', entityId: 'cyber-factory' as EntityId })
    // Use paneCommand='zsh' (idle) — but we need per-session control
    // Since our mock returns the same for all, test with all idle
    const ctx = makeCtx({
      sessions: [busySession, idleSession],
      paneCommand: 'zsh',
      singleInstance: true,
    })

    const config: HandoffConfig = {
      targetEntityId: 'cyber-factory',
      senderEntityId: 'testing-assistant',
      sessionName: 'CF',
      payload: { results: 'pass' },
    }

    const result = await executeHandoff(ctx, config)
    assert.equal((result as HandoffResult).ok, true)
    assert.equal((result as HandoffResult).wasExisting, true)
    // Should pick first idle
    assert.equal((result as HandoffResult).targetSessionId, busySession.id)
  })

  it('sends to busy singleInstance session when all are busy', async () => {
    const busySession = makeSession({ id: 'busy-cf', entityId: 'cyber-factory' as EntityId })
    const ctx = makeCtx({
      sessions: [busySession],
      paneCommand: 'claude', // all busy
      singleInstance: true,
    })

    const config: HandoffConfig = {
      targetEntityId: 'cyber-factory',
      senderEntityId: 'debugger',
      sessionName: 'CF',
      payload: { findings: 'data' },
    }

    const result = await executeHandoff(ctx, config)
    assert.equal((result as HandoffResult).ok, true)
    assert.equal((result as HandoffResult).wasExisting, true)
    assert.equal((result as HandoffResult).targetSessionId, 'busy-cf')
  })

  it('starts new session when all busy and multi-instance', async () => {
    const busySession = makeSession({ id: 'busy-test', entityId: 'testing-assistant' as EntityId })
    const newSession = makeSession({ id: 'new-testing', entityId: 'testing-assistant' as EntityId })
    const ctx = makeCtx({
      sessions: [busySession],
      paneCommand: 'claude', // busy
      singleInstance: false,
      startEntityResult: newSession,
    })

    const config: HandoffConfig = {
      targetEntityId: 'testing-assistant',
      senderEntityId: 'debugger',
      sessionName: 'Testing',
      payload: { fix: 'applied' },
    }

    const result = await executeHandoff(ctx, config)
    assert.equal((result as HandoffResult).ok, true)
    assert.equal((result as HandoffResult).wasExisting, false)
    assert.equal((result as HandoffResult).targetSessionId, 'new-testing')
  })
})

describe('handoff-kernel: delivery format', () => {
  it('formats payload as readable Markdown with HANDOFF prefix', async () => {
    const session = makeSession({ entityId: 'refinement' as EntityId })
    const ctx = makeCtx({ sessions: [session], paneCommand: 'zsh' })

    const config: HandoffConfig = {
      targetEntityId: 'refinement',
      senderEntityId: 'ideation-partner',
      sessionName: 'Refinement',
      payload: { specPath: '/tmp/spec.md', phase: 'architect' },
    }

    await executeHandoff(ctx, config)

    const delivered = ctx.sendKeysCalls[0][1]
    assert.ok(delivered.startsWith('[HANDOFF from ideation-partner]'))
    assert.ok(delivered.includes('**specPath:** /tmp/spec.md'))
    assert.ok(delivered.includes('**phase:** architect'))
  })

  it('formats arrays as bullet lists', async () => {
    const session = makeSession({ entityId: 'ideation-partner' as EntityId })
    const ctx = makeCtx({ sessions: [session], paneCommand: 'zsh' })

    const config: HandoffConfig = {
      targetEntityId: 'ideation-partner',
      senderEntityId: 'refinement',
      sessionName: 'Ideation',
      payload: { gaps: ['NFR missing', 'No error handling spec'] },
    }

    await executeHandoff(ctx, config)

    const delivered = ctx.sendKeysCalls[0][1]
    assert.ok(delivered.includes('**gaps:**'))
    assert.ok(delivered.includes('- NFR missing'))
    assert.ok(delivered.includes('- No error handling spec'))
  })

  it('sends Enter (\\r) after payload', async () => {
    const session = makeSession({ entityId: 'audit' as EntityId })
    const ctx = makeCtx({ sessions: [session], paneCommand: 'zsh' })

    const config: HandoffConfig = {
      targetEntityId: 'audit',
      senderEntityId: 'cyber-factory',
      sessionName: 'Audit',
      payload: { scope: 'security' },
    }

    await executeHandoff(ctx, config)

    // Last sendKeys call should be \r
    const lastCall = ctx.sendKeysCalls[ctx.sendKeysCalls.length - 1]
    assert.equal(lastCall[1], '\r')
  })

})

describe('handoff-kernel: startEntitySession', () => {
  it('starts entity and makes it visible', async () => {
    const newSession = makeSession({ id: 'new-debugger', entityId: 'debugger' as EntityId })
    const ctx = makeCtx({ startEntityResult: newSession })

    const result = await startEntitySession(ctx, 'debugger', { name: 'Debugger' })
    assert.equal(result.id, 'new-debugger')
    assert.equal(ctx.visibleAddCalls.length, 1)
    assert.deepEqual(ctx.visibleAddCalls[0].data, { sessionId: 'new-debugger' })
  })

  it('throws on unknown entity (no fallback)', async () => {
    const ctx = makeCtx({ startEntityError: 'Unknown entity: bad-entity' })

    await assert.rejects(
      () => startEntitySession(ctx, 'bad-entity' as EntityId),
      /Unknown entity/
    )
  })
})

describe('handoff-kernel: registerHandoffTool', () => {
  it('registers tool on the server and delegates to executeHandoff', async () => {
    const session = makeSession({ entityId: 'refinement' as EntityId })
    const ctx = makeCtx({ sessions: [session], paneCommand: 'zsh' })

    // Mock server
    let registeredHandler: any = null
    const server = {
      registerTool: (name: string, _config: any, handler: any) => {
        registeredHandler = { name, handler }
      },
    } as any

    registerHandoffTool(server, ctx, {
      toolName: 'test_handoff',
      description: 'Test handoff tool',
      targetEntityId: 'refinement',
      senderEntityId: 'ideation-partner',
      inputSchema: { specPath: (await import('zod')).z.string() },
      buildPayload: (args: any) => ({ specPath: args.specPath }),
    })

    assert.equal(registeredHandler.name, 'test_handoff')

    // Call the handler
    const result = await registeredHandler.handler({ specPath: '/tmp/spec.md' })
    const parsed = JSON.parse(result.content[0].text)
    assert.equal(parsed.ok, true)
    assert.equal(parsed.wasExisting, true)
    assert.equal(parsed.targetSessionId, session.id)
  })

  it('returns isError when handoff fails', async () => {
    const ctx = makeCtx({ sessions: [], startEntityError: 'Unknown entity: bad' })

    let registeredHandler: any = null
    const server = {
      registerTool: (_name: string, _config: any, handler: any) => {
        registeredHandler = { handler }
      },
    } as any

    registerHandoffTool(server, ctx, {
      toolName: 'test_fail',
      description: 'Failing tool',
      targetEntityId: 'bad' as EntityId,
      senderEntityId: 'test',
      inputSchema: {},
      buildPayload: () => ({}),
    })

    const result = await registeredHandler.handler({})
    const parsed = JSON.parse(result.content[0].text)
    assert.equal(parsed.ok, false)
    assert.equal(result.isError, true)
  })
})

describe('handoff-kernel: registerAllHandoffTools', () => {
  it('registers mux_entity_start tool', () => {
    const ctx = makeCtx()
    const registered: string[] = []
    const server = {
      registerTool: (name: string, _config: any, _handler: any) => {
        registered.push(name)
      },
    } as any

    registerAllHandoffTools(server, ctx)
    assert.ok(registered.includes('mux_entity_start'))
  })
})

describe('handoff-kernel: mux_entity_start tool', () => {
  it('starts entity session and returns sessionId', async () => {
    const newSession = makeSession({ id: 'started-audit', entityId: 'audit' as EntityId })
    const ctx = makeCtx({ startEntityResult: newSession })

    let handler: any = null
    const server = {
      registerTool: (name: string, _config: any, h: any) => {
        if (name === 'mux_entity_start') handler = h
      },
    } as any

    registerAllHandoffTools(server, ctx)
    assert.ok(handler)

    const result = await handler({ entityId: 'audit' })
    const parsed = JSON.parse(result.content[0].text)
    assert.equal(parsed.ok, true)
    assert.equal(parsed.sessionId, 'started-audit')
    assert.equal(parsed.entityId, 'audit')
  })

  it('returns error for unknown entity', async () => {
    const ctx = makeCtx({ startEntityError: 'Unknown entity: nope' })

    let handler: any = null
    const server = {
      registerTool: (name: string, _config: any, h: any) => {
        if (name === 'mux_entity_start') handler = h
      },
    } as any

    registerAllHandoffTools(server, ctx)

    const result = await handler({ entityId: 'nope' })
    const parsed = JSON.parse(result.content[0].text)
    assert.equal(parsed.ok, false)
    assert.ok(parsed.error.includes('Unknown entity'))
    assert.equal(result.isError, true)
  })
})
