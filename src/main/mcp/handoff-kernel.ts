/**
 * Handoff Kernel — shared infrastructure for all entity-to-entity handoffs.
 *
 * REQ-HANDOFF-001 through REQ-HANDOFF-006.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { EntityId, SessionInfo } from '../../shared/types'
import { IPC } from '../../shared/ipc-channels'
import type { ToolContext } from './mcp-tools'
import type { Topic } from '../../shared/types'

// ─── Types ─────────────────────────────────────────────────

export interface HandoffConfig {
  targetEntityId: EntityId
  senderEntityId: string
  sessionName: string
  projectPath?: string
  payload: Record<string, unknown>
  createNote?: { title: string; body: string; tags: string[] }
  createInputRequest?: { question: string; context: string }
}

export interface HandoffResult {
  ok: true
  targetSessionId: string
  wasExisting: boolean
  noteId?: string
}

export interface HandoffError {
  ok: false
  error: string
}

export interface HandoffToolDef {
  toolName: string
  description: string
  targetEntityId: EntityId
  senderEntityId: string
  inputSchema: Record<string, z.ZodType>
  buildPayload: (args: any) => Record<string, unknown>
  buildSessionName?: (args: any) => string
  buildProjectPath?: (args: any) => string | undefined
  sideEffects?: {
    createNote?: (args: any) => { title: string; body: string; tags: string[] }
    createInputRequest?: (args: any) => { question: string; context: string }
  }
}

// ─── Busy Check (REQ-HANDOFF-003) ──────────────────────────

/**
 * Check if a session is busy (Claude is actively producing output).
 * Uses tmux pane_current_command — 'claude' means active, 'zsh'/'bash' means idle.
 */
export async function isBusy(ctx: ToolContext, session: SessionInfo): Promise<boolean> {
  try {
    const target = session.tmuxPane ?? session.tmuxSession
    const tmux = (ctx.sessionManager as any).tmux
    if (!tmux || !tmux.getPaneCommand) return false
    const cmd = await tmux.getPaneCommand(target)
    // If claude process is running in the pane, it's busy
    return cmd.includes('claude')
  } catch {
    return false
  }
}

// ─── Session Matching (REQ-HANDOFF-003) ────────────────────

interface SessionCandidate {
  session: SessionInfo
  visible: boolean
  busy: boolean
}

/**
 * Find the best matching session for a handoff target entity.
 * Priority: visible+idle > background+idle > visible+busy(singleInstance) >
 *           background+busy(singleInstance) > new session
 */
async function findBestSession(
  ctx: ToolContext,
  entityId: EntityId,
): Promise<{ session: SessionInfo; wasExisting: true } | null> {
  const sessions = ctx.sessionManager.list()
  const entitySessions = sessions.filter(
    s => s.entityId === entityId && s.status === 'active'
  )

  if (entitySessions.length === 0) return null

  // Determine visibility: sessions in the grid are visible
  // We treat all active entity sessions as potentially visible for simplicity;
  // the window manager handles actual placement.
  const candidates: SessionCandidate[] = []
  for (const session of entitySessions) {
    const busy = await isBusy(ctx, session)
    // A session is "visible" if it's in the grid — we approximate by checking
    // if it has been placed. For the kernel's purposes we check grid state.
    candidates.push({ session, visible: true, busy })
  }

  // Priority 1: visible, not busy
  const visibleIdle = candidates.find(c => c.visible && !c.busy)
  if (visibleIdle) return { session: visibleIdle.session, wasExisting: true }

  // Priority 2: any not-busy (background sessions)
  const anyIdle = candidates.find(c => !c.busy)
  if (anyIdle) return { session: anyIdle.session, wasExisting: true }

  // Priority 3/4: busy session exists — for singleInstance, send anyway
  const registry = ctx.sessionManager.getEntityRegistry()
  const config = registry.get(entityId)
  if (config?.singleInstance && candidates.length > 0) {
    // Pick first visible busy, or any busy
    const visibleBusy = candidates.find(c => c.visible && c.busy)
    return { session: (visibleBusy ?? candidates[0]).session, wasExisting: true }
  }

  // Priority 5: all busy + multi-instance → caller should start new session
  return null
}

// ─── Payload Formatting (REQ-HANDOFF-005) ──────────────────

/**
 * Format a handoff payload as readable Markdown for tmux injection.
 */
function formatPayload(senderEntityId: string, payload: Record<string, unknown>): string {
  const lines: string[] = [`[HANDOFF from ${senderEntityId}]`]
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      lines.push(`\n**${key}:**`)
      for (const item of value) {
        lines.push(`- ${String(item)}`)
      }
    } else if (typeof value === 'string' && value.includes('\n')) {
      lines.push(`\n**${key}:**\n${value}`)
    } else {
      lines.push(`\n**${key}:** ${String(value)}`)
    }
  }
  return lines.join('\n')
}

// ─── Entity Start (REQ-HANDOFF-006) ────────────────────────

/**
 * Start an entity session using the same code path as the UI button.
 * This is the shared helper used by both mux_entity_start tool and executeHandoff.
 */
export async function startEntitySession(
  ctx: ToolContext,
  entityId: EntityId,
  opts?: { projectPath?: string; name?: string },
): Promise<SessionInfo> {
  const session = await ctx.sessionManager.startEntity(entityId, {
    name: opts?.name ?? entityId,
    ...(opts?.projectPath ? { projectPath: opts.projectPath } : {}),
  })

  // Make session visible
  if (ctx.windowManager) {
    ctx.windowManager.sendToMainWindow(IPC.SESSION_VISIBLE_ADD, { sessionId: session.id })
  }

  return session
}

// ─── Execute Handoff (REQ-HANDOFF-001) ─────────────────────

/**
 * Core handoff execution. Finds or starts target session, delivers payload
 * via tmux send-keys, optionally creates notes and input requests.
 */
export async function executeHandoff(
  ctx: ToolContext,
  config: HandoffConfig,
): Promise<HandoffResult | HandoffError> {
  try {
    let targetSession: SessionInfo
    let wasExisting = false

    // Find existing session matching the target entity
    const match = await findBestSession(ctx, config.targetEntityId)

    if (match) {
      targetSession = match.session
      wasExisting = true
      // Ensure visible
      if (ctx.windowManager) {
        ctx.windowManager.sendToMainWindow(IPC.SESSION_VISIBLE_ADD, { sessionId: targetSession.id })
      }
    } else {
      // Start new entity session — no fallback to generic sessions
      targetSession = await startEntitySession(ctx, config.targetEntityId, {
        projectPath: config.projectPath,
        name: config.sessionName,
      })

      // Wait for Claude CLI to be ready. A freshly started session has only
      // zsh — Claude CLI launches after the renderer calls markReady() or
      // the 4s fallback timer fires. Without this wait, the payload would
      // be injected directly into zsh, interpreted as shell commands.
      const maxWait = 15_000
      const pollInterval = 500
      let waited = 0
      let ready = false
      while (waited < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval))
        waited += pollInterval
        try {
          const busy = await isBusy(ctx, targetSession)
          if (busy) { ready = true; break }
        } catch { /* ignore */ }
      }
      if (!ready) {
        return { ok: false, error: `Claude CLI did not start in target session within ${maxWait / 1000}s` }
      }
    }

    // Format and deliver via tmux send-keys (REQ-HANDOFF-005)
    const message = formatPayload(config.senderEntityId, config.payload)
    await ctx.sessionManager.sendKeys(targetSession.id, message)
    // Claude CLI needs time to render the text before recognizing Enter as submit.
    // Without delay, the \r arrives while the CLI is still processing the payload
    // and gets swallowed. Combining text+\r in one call doesn't work either —
    // CLI treats the \r as a newline in the text, not as submit.
    await new Promise(resolve => setTimeout(resolve, 500))
    await ctx.sessionManager.sendKeys(targetSession.id, '\r')

    // Paste-check: Claude CLI shows long inputs as "[Pasted text #1 +N lines]"
    // and waits for a second Enter. Check after 2s and resend Enter if needed.
    await new Promise(resolve => setTimeout(resolve, 2000))
    try {
      const captured = await ctx.sessionManager.capture(targetSession.id, 10)
      if (captured.includes('[Pasted text')) {
        await ctx.sessionManager.sendKeys(targetSession.id, '\r')
      }
    } catch {
      // capture may fail if session is gone — ignore
    }

    // MessageBus entry only if session stays in background (REQ-HANDOFF-004)
    // In practice: if windowManager is null, we can't make it visible → write to bus
    if (!ctx.windowManager && ctx.messageBus) {
      ctx.messageBus.send({
        topic: 'system' as Topic,
        sender: config.senderEntityId,
        payload: {
          text: `Handoff to ${config.targetEntityId}: ${Object.keys(config.payload).join(', ')}`,
          sessionId: targetSession.id,
        },
      })
    }

    // Optional side effects
    let noteId: string | undefined
    if (config.createNote && ctx.noteManager) {
      const note = await ctx.noteManager.create(
        config.createNote.title,
        config.createNote.body,
        config.createNote.tags,
      )
      noteId = note.id
    }

    if (config.createInputRequest && ctx.inputRequestWatcher) {
      const irId = `ir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      ctx.inputRequestWatcher.createRequest({
        id: irId,
        type: 'bubble' as const,
        projectId: config.targetEntityId,
        question: config.createInputRequest.question,
        context: config.createInputRequest.context,
        status: 'open' as const,
        answer: null,
        createdAt: new Date().toISOString(),
        answeredAt: null,
      })
    }

    return {
      ok: true,
      targetSessionId: targetSession.id,
      wasExisting,
      ...(noteId ? { noteId } : {}),
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { ok: false, error }
  }
}

// ─── registerHandoffTool (REQ-HANDOFF-002) ─────────────────

/**
 * Register an MCP tool that delegates to executeHandoff with a tool-specific config.
 */
export function registerHandoffTool(
  server: McpServer,
  ctx: ToolContext,
  def: HandoffToolDef,
): void {
  ;(server.registerTool as any)(
    def.toolName,
    {
      description: def.description,
      inputSchema: def.inputSchema,
    },
    async (args: any) => {
      const sessionName = def.buildSessionName
        ? def.buildSessionName(args)
        : def.targetEntityId

      const projectPath = def.buildProjectPath
        ? def.buildProjectPath(args)
        : args.projectPath

      const handoffConfig: HandoffConfig = {
        targetEntityId: def.targetEntityId,
        senderEntityId: def.senderEntityId,
        sessionName,
        projectPath,
        payload: def.buildPayload(args),
        createNote: def.sideEffects?.createNote?.(args),
        createInputRequest: def.sideEffects?.createInputRequest?.(args),
      }

      const result = await executeHandoff(ctx, handoffConfig)

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        ...(!(result as any).ok ? { isError: true } : {}),
      }
    },
  )
}

// ─── mux_entity_start Tool (REQ-HANDOFF-006) ──────────────

function registerEntityStartTool(server: McpServer, ctx: ToolContext): void {
  ;(server.registerTool as any)(
    'mux_entity_start',
    {
      description:
        'Start an entity session (same code path as UI preset button). '
        + 'Use for Orchestrator, Cyber Factory, Refinement, Ideation Partner, '
        + 'Testing Assistant, Debugger, Audit, etc.',
      inputSchema: {
        entityId: z.string().describe('Entity identifier (e.g. "cyber-factory", "refinement", "debugger")'),
        projectPath: z.string().optional().describe('Override project path (optional)'),
        name: z.string().optional().describe('Override display name (optional)'),
      },
    },
    async (args: { entityId: string; projectPath?: string; name?: string }) => {
      try {
        const session = await startEntitySession(ctx, args.entityId as EntityId, {
          projectPath: args.projectPath,
          name: args.name,
        })

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ok: true,
            sessionId: session.id,
            entityId: args.entityId,
          }) }],
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error }) }],
          isError: true,
        }
      }
    },
  )
}

// ─── Register All Handoff Tools ────────────────────────────

/**
 * Register all handoff tools + mux_entity_start. Called from mcp-tools.ts.
 */
export function registerAllHandoffTools(server: McpServer, ctx: ToolContext): void {
  registerEntityStartTool(server, ctx)

  // ─── REQ-TOOLS-001: mux_ideation_handoff_refinement ──────
  registerHandoffTool(server, ctx, {
    toolName: 'mux_ideation_handoff_refinement',
    description:
      'Hand off a completed Anforderungspaket from the Ideation Partner to Refinement. '
      + 'Creates or finds an existing Refinement session and sends the package path as context.',
    targetEntityId: 'refinement',
    senderEntityId: 'ideation-partner',
    inputSchema: {
      anforderungspaketPath: z.string().describe('Absolute path to the Anforderungspaket markdown file'),
      projectPath: z.string().optional().describe('Project directory path (optional)'),
    },
    buildPayload: (args) => ({
      anforderungspaketPath: args.anforderungspaketPath,
    }),
    buildSessionName: () => 'Refinement',
  })

  // ─── REQ-TOOLS-002: mux_refinement_handoff_cyber_factory ──
  registerHandoffTool(server, ctx, {
    toolName: 'mux_refinement_handoff_cyber_factory',
    description:
      'Hand off a completed detail spec from Refinement to the Cyber Factory. '
      + 'Finds an existing CF session or starts a new one with the spec path as context.',
    targetEntityId: 'cyber-factory',
    senderEntityId: 'refinement',
    inputSchema: {
      detailSpecPath: z.string().describe('Absolute path to the detail spec file with REQ-IDs'),
      projectPath: z.string().describe('Project directory path for the Cyber Factory session'),
      lifecyclePhase: z.string().optional().describe('Target lifecycle phase (default: architect)'),
    },
    buildPayload: (args) => ({
      detailSpecPath: args.detailSpecPath,
      lifecyclePhase: args.lifecyclePhase || 'architect',
    }),
    buildSessionName: (args) => `CF-${basename(args.projectPath)}`,
  })

  // ─── REQ-TOOLS-003: mux_refinement_handoff_ideation ───────
  registerHandoffTool(server, ctx, {
    toolName: 'mux_refinement_handoff_ideation',
    description:
      'Hand back to the Ideation Partner when the requirements package has too many gaps. '
      + 'Creates or finds an existing Ideation Partner session and sends the gap summary.',
    targetEntityId: 'ideation-partner',
    senderEntityId: 'refinement',
    inputSchema: {
      reason: z.string().describe('Why the handoff is needed (e.g. "systematic gaps in NFRs")'),
      gaps: z.array(z.string()).describe('List of identified gaps'),
      projectPath: z.string().optional().describe('Project directory path (optional)'),
    },
    buildPayload: (args) => ({
      reason: args.reason,
      gaps: args.gaps,
    }),
    buildSessionName: () => 'Ideation',
    sideEffects: {
      createInputRequest: (args) => ({
        question: `Refinement: Zurueck zum Ideation Partner — ${args.reason}`,
        context: `Identifizierte Luecken:\n${(args.gaps as string[]).map((g: string) => `- ${g}`).join('\n')}`,
      }),
    },
  })

  // ─── REQ-TOOLS-004: mux_cyber_factory_handoff_testing ─────
  registerHandoffTool(server, ctx, {
    toolName: 'mux_cyber_factory_handoff_testing',
    description:
      'Hand off a completed Cyber Factory welle to the Testing Assistant for validation. '
      + 'Starts or finds a Testing session and delivers the test summary.',
    targetEntityId: 'testing-assistant',
    senderEntityId: 'cyber-factory',
    inputSchema: {
      run_id: z.string().describe('Cyber Factory run ID'),
      welle_id: z.string().describe('Welle ID that completed'),
      summary: z.string().describe('Testing summary / handoff body (markdown)'),
    },
    buildPayload: (args) => ({
      run_id: args.run_id,
      welle_id: args.welle_id,
      summary: args.summary,
    }),
    buildSessionName: () => 'Testing Assistant',
    sideEffects: {
      createNote: (args) => ({
        title: `Testing Handoff — Welle ${args.welle_id}`,
        body: `# Testing Handoff — Welle ${args.welle_id}\n\n${args.summary}`,
        tags: ['kind:handoff', 'scope:testing'],
      }),
    },
  })

  // ─── REQ-TOOLS-005: mux_cyber_factory_handoff_debugger ────
  registerHandoffTool(server, ctx, {
    toolName: 'mux_cyber_factory_handoff_debugger',
    description:
      'Hand off findings from the Cyber Factory to the Debugger for investigation. '
      + 'Starts or finds a Debugger session and delivers the findings report.',
    targetEntityId: 'debugger',
    senderEntityId: 'cyber-factory',
    inputSchema: {
      run_id: z.string().describe('Cyber Factory run ID'),
      findings_report: z.string().describe('Detailed findings report (markdown)'),
      severity_summary: z.string().describe('Short severity summary for the title'),
    },
    buildPayload: (args) => ({
      run_id: args.run_id,
      findings_report: args.findings_report,
      severity_summary: args.severity_summary,
    }),
    buildSessionName: () => 'Debugger',
    sideEffects: {
      createNote: (args) => ({
        title: `Debugger Handoff — ${args.severity_summary}`,
        body: `# Debugger Handoff — ${args.severity_summary}\n\n${args.findings_report}`,
        tags: ['kind:handoff', 'scope:debugging'],
      }),
    },
  })

  // ─── REQ-TOOLS-006: mux_testing_findings_handoff_debugger ──
  // Special case: buildPayload needs ctx for TestingAssistantManager access.
  // We register manually instead of using registerHandoffTool.
  ;(server.registerTool as any)(
    'mux_testing_findings_handoff_debugger',
    {
      description: 'Hand off testing findings to the debugger for fixing. Starts or finds a Debugger session and delivers prepared findings.',
      inputSchema: {
        runId: z.string().describe('Testing run ID to hand off'),
      },
    },
    async (args: { runId: string }) => {
      if (!ctx.testingAssistantManager) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'TestingAssistantManager not available' }) }],
          isError: true,
        }
      }

      // Build payload from testing findings
      const findings = ctx.testingAssistantManager.listFindings(args.runId)
      const { buildDebuggerHandoff } = await import('../testing-assistant/handoff-debugger')
      const handoff = buildDebuggerHandoff(findings, args.runId)

      const result = await executeHandoff(ctx, {
        targetEntityId: 'debugger',
        senderEntityId: 'testing-assistant',
        sessionName: 'Debugger',
        payload: { ...handoff },
      })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        ...(!(result as any).ok ? { isError: true } : {}),
      }
    },
  )

  // ─── REQ-TOOLS-007: mux_cyber_factory_handoff_audit ───────
  registerHandoffTool(server, ctx, {
    toolName: 'mux_cyber_factory_handoff_audit',
    description:
      'Hand off completed code from the Cyber Factory to Audit for review. '
      + 'Starts or finds an Audit session and delivers the audit scope.',
    targetEntityId: 'audit',
    senderEntityId: 'cyber-factory',
    inputSchema: {
      run_id: z.string().describe('Cyber Factory run ID'),
      projectPath: z.string().describe('Project directory path to audit'),
      scope: z.string().describe('What should be audited (e.g. "welle-3 changes", "full codebase")'),
    },
    buildPayload: (args) => ({
      run_id: args.run_id,
      projectPath: args.projectPath,
      scope: args.scope,
    }),
    buildSessionName: () => 'Audit',
  })

  // ─── REQ-TOOLS-008: mux_testing_handoff_cyber_factory ─────
  registerHandoffTool(server, ctx, {
    toolName: 'mux_testing_handoff_cyber_factory',
    description:
      'Hand off testing results back to the Cyber Factory. '
      + 'Finds the existing CF session (singleInstance) and delivers structured test results.',
    targetEntityId: 'cyber-factory',
    senderEntityId: 'testing-assistant',
    inputSchema: {
      runId: z.string().describe('Testing run ID'),
      results: z.string().describe('Test results summary (markdown)'),
      passRate: z.number().min(0).max(100).describe('Pass rate percentage (0-100)'),
    },
    buildPayload: (args) => ({
      runId: args.runId,
      results: args.results,
      passRate: args.passRate,
    }),
    buildSessionName: () => 'Cyber Factory',
  })

  // ─── REQ-TOOLS-009: mux_debugger_handoff_testing ──────────
  registerHandoffTool(server, ctx, {
    toolName: 'mux_debugger_handoff_testing',
    description:
      'Hand off a fix from the Debugger to the Testing Assistant for retest. '
      + 'Starts or finds a Testing session and delivers the fix context.',
    targetEntityId: 'testing-assistant',
    senderEntityId: 'debugger',
    inputSchema: {
      fixSummary: z.string().describe('Summary of the fix applied (markdown)'),
      affectedFiles: z.array(z.string()).describe('List of files changed by the fix'),
    },
    buildPayload: (args) => ({
      fixSummary: args.fixSummary,
      affectedFiles: args.affectedFiles,
    }),
    buildSessionName: () => 'Testing Assistant',
  })

  // ─── REQ-TOOLS-010: mux_debugger_handoff_cyber_factory ────
  registerHandoffTool(server, ctx, {
    toolName: 'mux_debugger_handoff_cyber_factory',
    description:
      'Hand off findings and recommendations from the Debugger back to the Cyber Factory. '
      + 'Finds the existing CF session (singleInstance) and delivers structured findings.',
    targetEntityId: 'cyber-factory',
    senderEntityId: 'debugger',
    inputSchema: {
      findings: z.string().describe('Debugging findings summary (markdown)'),
      recommendations: z.array(z.string()).describe('List of actionable recommendations'),
    },
    buildPayload: (args) => ({
      findings: args.findings,
      recommendations: args.recommendations,
    }),
    buildSessionName: () => 'Cyber Factory',
  })
}

/**
 * Extract basename from a path without importing 'path' module.
 */
function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}
