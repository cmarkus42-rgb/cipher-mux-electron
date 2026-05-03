import { z } from 'zod'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SessionManager } from '../session/session-manager'
import type { MessageBus } from '../message-bus/message-bus'
import type { StatusLineMonitor } from '../monitoring/statusline-monitor'
import type { KickoffOrchestrator } from '../project/kickoff-orchestrator'
import type { TaskManager } from '../task/task-manager'
import type { Topic } from '../../shared/types'
import type { NoteManager } from '../notes/note-manager'
import type { NoteSearchIndex } from '../notes/note-search-index'
import type { MemoryStore } from '../companion/memory-store'
import { IPC } from '../../shared/ipc-channels'
import { registerAllHandoffTools } from './handoff-kernel'
import { integrate, inventory, migrationPlan, hubApply, hubVerify, hubRelease, hubRollback } from '../hub'

/**
 * Context passed to tool handlers — references to core services.
 */
export interface ToolContext {
  sessionManager: SessionManager
  messageBus: MessageBus | null
  statusLineMonitor: StatusLineMonitor | null
  kickoffOrchestrator: KickoffOrchestrator | null
  taskManager: TaskManager | null
  inputRequestWatcher: import('../mpo/input-request-watcher').InputRequestWatcher | null
  windowManager: { sendToMainWindow(channel: string, data: unknown): void } | null
  noteManager: NoteManager | null
  noteSearchIndex: NoteSearchIndex | null
  memoryStore: MemoryStore | null
  getVoiceManager?: () => import('../voice/voice-manager').VoiceManager | null
  testingAssistantManager?: import('../testing-assistant/testing-assistant-manager').TestingAssistantManager
  auditManager?: import('../audit/audit-manager').AuditManager
}

const VALID_TOPICS: readonly string[] = ['status', 'bug', 'review', 'chat', 'system']

/**
 * Escape text for safe injection via tmux send-keys.
 * For long messages (>500 chars), uses base64 encoding to avoid quoting issues.
 */
/**
 * Escape text for tmux send-keys -l (literal) fallback path.
 * The primary hex path (send-keys -H) needs no escaping.
 * Kept minimal — only used when control mode is unavailable.
 */
export function escapeForTmux(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
}

/**
 * Find a session by its display name or tmux session name.
 */
export function findSessionByName(
  sessionManager: ToolContext['sessionManager'],
  name: string,
): string | null {
  const sessions = sessionManager.list()
  const match = sessions.find(s => s.name === name || s.tmuxSession === name)
  return match?.id ?? null
}

// Helper to work around TS2589 with zod v4 + MCP SDK deep type instantiation.
// We cast the schema shapes to `any` for registerTool's inputSchema, but keep
// runtime validation intact via zod.
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Register all MCP tools on the given McpServer instance.
 */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  // Register all handoff tools (entity_start + 10 handoff tools) from kernel
  registerAllHandoffTools(server, ctx)

  // === Hub-MCP-Tools (REQ-HUB-001 through 007) ===
  ;(server.registerTool as any)('mux_hub_integrate', {
    description: 'Copy an existing project into the CIPHER-MUX Hub. Excludes build artifacts. Original stays untouched.',
    inputSchema: {
      sourcePath: z.string().describe('Absolute path to source project'),
      projectName: z.string().optional().describe('Name in hub (default: directory name)'),
      excludeBuildArtifacts: z.boolean().optional().describe('Exclude node_modules, dist, .cache etc. (default: true)'),
    },
  }, async (args: any) => { try { return { content: [{ type: 'text', text: JSON.stringify(await integrate(args)) }] } } catch (e: any) { return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }] } } })

  ;(server.registerTool as any)('mux_hub_inventory', {
    description: 'Run a read-only brownfield inventory on a project in the Hub. Detects stack, structure, specs, tests.',
    inputSchema: {
      projectName: z.string().describe('Project name in hub'),
    },
  }, async (args: any) => { try { return { content: [{ type: 'text', text: JSON.stringify(await inventory(args.projectName)) }] } } catch (e: any) { return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }] } } })

  ;(server.registerTool as any)('mux_hub_migration_plan', {
    description: 'Generate a 3-section migration plan based on inventory. Sections: unchanged, extended, new.',
    inputSchema: {
      projectName: z.string().describe('Project name in hub'),
      mode: z.enum(['voll', 'pack-light']).optional().describe('Migration mode (default: voll)'),
      components: z.array(z.string()).optional().describe('Components for pack-light mode'),
    },
  }, async (args: any) => { try { return { content: [{ type: 'text', text: JSON.stringify(await migrationPlan(args)) }] } } catch (e: any) { return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }] } } })

  ;(server.registerTool as any)('mux_hub_apply', {
    description: 'Execute migration plan steps. Idempotent — already-applied steps are skipped.',
    inputSchema: {
      projectName: z.string().describe('Project name in hub'),
      planPath: z.string().optional().describe('Path to plan file (default: latest)'),
      dryRun: z.boolean().optional().describe('Preview only, no changes (default: false)'),
    },
  }, async (args: any) => { try { return { content: [{ type: 'text', text: JSON.stringify(await hubApply(args)) }] } } catch (e: any) { return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }] } } })

  ;(server.registerTool as any)('mux_hub_verify', {
    description: 'Run build and test suite in a hub project. Gate before release — no green verify, no release.',
    inputSchema: {
      projectName: z.string().describe('Project name in hub'),
      installDeps: z.boolean().optional().describe('Install dependencies (default: true)'),
      runBuild: z.boolean().optional().describe('Run build (default: true)'),
      runTests: z.boolean().optional().describe('Run tests (default: true)'),
    },
  }, async (args: any) => { try { return { content: [{ type: 'text', text: JSON.stringify(await hubVerify(args)) }] } } catch (e: any) { return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }] } } })

  ;(server.registerTool as any)('mux_hub_release', {
    description: 'Mark project as released. Sets push-lock on original, writes MIGRATED.md, updates ARCHIV-VERWEIS.',
    inputSchema: {
      projectName: z.string().describe('Project name in hub'),
    },
  }, async (args: any) => { try { return { content: [{ type: 'text', text: JSON.stringify(await hubRelease(args.projectName)) }] } } catch (e: any) { return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }] } } })

  ;(server.registerTool as any)('mux_hub_rollback', {
    description: 'Rollback: workspace back to original path, remove push-lock, delete MIGRATED.md.',
    inputSchema: {
      projectName: z.string().describe('Project name in hub'),
      removeHubCopy: z.boolean().optional().describe('Delete hub copy (destructive, requires confirmation)'),
    },
  }, async (args: any) => { try { return { content: [{ type: 'text', text: JSON.stringify(await hubRollback(args)) }] } } catch (e: any) { return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }] } } })

  // 1. mux_send — Send a message to the message bus (with optional push delivery)
  ;(server.registerTool as any)(
    'mux_send',
    {
      description: 'Send a message to the cipher-mux message bus. Optionally push-deliver to a target session via tmux send-keys.',
      inputSchema: {
        topic: z.string().describe('Message topic (status, bug, review, chat, system)'),
        sender: z.string().describe('Sender identifier'),
        text: z.string().describe('Message text'),
        sessionId: z.string().optional().describe('Target session ID for push delivery'),
        sessionName: z.string().optional().describe('Target session name for push delivery'),
        noEnter: z.boolean().optional().describe('If true, do not send Enter after push-delivered text'),
      },
    },
    async (args: { topic: string; sender: string; text: string; sessionId?: string; sessionName?: string; noEnter?: boolean }) => {
      if (!ctx.messageBus) {
        return { content: [{ type: 'text' as const, text: 'MessageBus not available' }], isError: true }
      }

      const topic = VALID_TOPICS.includes(args.topic) ? args.topic as Topic : 'chat' as Topic
      const message = ctx.messageBus.send({
        topic,
        sender: args.sender,
        payload: { text: args.text },
      })

      // Push delivery via tmux send-keys if target session is specified
      let delivered = false
      const targetId = args.sessionId
        ?? (args.sessionName ? findSessionByName(ctx.sessionManager, args.sessionName) : null)

      if (targetId) {
        const session = ctx.sessionManager.get(targetId)
        if (session && session.status === 'active') {
          try {
            // Push-deliver plaintext directly via sendKeys (hex-encoded in
            // tmux control mode — no escaping or base64 needed). Enter is
            // sent separately so it works regardless of text length.
            await ctx.sessionManager.sendKeys(targetId, args.text)
            if (!args.noEnter) {
              await ctx.sessionManager.sendKeys(targetId, '\r')
            }
            delivered = true
          } catch {
            // sendKeys failed — message is still on the bus
          }
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id: message.id, delivered }) }],
      }
    }
  )

  // 2. mux_read — Read messages from the bus
  ;(server.registerTool as any)(
    'mux_read',
    {
      description: 'Read messages from the cipher-mux message bus',
      inputSchema: {
        topic: z.string().optional().describe('Filter by topic (status, bug, review, chat, system)'),
        limit: z.number().optional().describe('Max messages to return (default 20)'),
      },
    },
    async (args: { topic?: string; limit?: number }) => {
      if (!ctx.messageBus) {
        return { content: [{ type: 'text' as const, text: 'MessageBus not available' }], isError: true }
      }

      const limit = args.limit ?? 20
      let messages

      if (args.topic && VALID_TOPICS.includes(args.topic)) {
        messages = ctx.messageBus.getByTopic(args.topic as Topic, limit)
      } else {
        messages = ctx.messageBus.getAll(limit)
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(messages, null, 2) }],
      }
    }
  )

  // 3. mux_status — Get cipher-mux status
  ;(server.registerTool as any)(
    'mux_status',
    {
      description: 'Get cipher-mux system status',
    },
    async () => {
      const sessionCount = ctx.sessionManager.list().length
      const activeCount = ctx.sessionManager.activeCount()

      const status = {
        sessions: { total: sessionCount, active: activeCount },
        messageBus: ctx.messageBus !== null,
        statusLineMonitor: ctx.statusLineMonitor !== null,
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }],
      }
    }
  )

  // 4. mux_sessions — List all sessions
  ;(server.registerTool as any)(
    'mux_sessions',
    {
      description: 'List all cipher-mux sessions',
    },
    async () => {
      const sessions = ctx.sessionManager.list()

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(sessions, null, 2) }],
      }
    }
  )

  // 5. mux_create_session — Create a new session
  ;(server.registerTool as any)(
    'mux_create_session',
    {
      description: 'Create a new cipher-mux session',
      inputSchema: {
        name: z.string().describe('Session name'),
        projectPath: z.string().describe('Project directory path'),
        command: z.string().optional().describe('Initial command to run'),
        visible: z.boolean().optional().describe('If true, session appears in the grid with focus'),
      },
    },
    async (args: { name: string; projectPath: string; command?: string; visible?: boolean }) => {
      try {
        const session = await ctx.sessionManager.start({
          name: args.name,
          projectPath: args.projectPath,
          command: args.command,
        })

        if (args.visible && ctx.windowManager) {
          ctx.windowManager.sendToMainWindow(IPC.SESSION_VISIBLE_ADD, { sessionId: session.id })
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, session }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: errMsg }) }],
          isError: true,
        }
      }
    }
  )

  // 6. mux_kill_session — Kill a session (graceful by default for Claude sessions)
  ;(server.registerTool as any)(
    'mux_kill_session',
    {
      description: 'Kill a cipher-mux session. Graceful shutdown sends a cleanup prompt to Claude sessions before killing.',
      inputSchema: {
        sessionId: z.string().describe('Session ID (ULID)'),
        graceful: z.boolean().optional().describe('Graceful shutdown (default true). Sends cleanup prompt to Claude sessions before kill.'),
      },
    },
    async (args: { sessionId: string; graceful?: boolean }) => {
      try {
        const useGraceful = args.graceful !== false && ctx.sessionManager.isAutoLaunched(args.sessionId)
        if (useGraceful) {
          await ctx.sessionManager.gracefulStop(args.sessionId)
        } else {
          await ctx.sessionManager.stop(args.sessionId)
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, graceful: useGraceful }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: errMsg }) }],
          isError: true,
        }
      }
    }
  )

  // 7. mux_context_usage — Get context usage
  ;(server.registerTool as any)(
    'mux_context_usage',
    {
      description: 'Get context usage for sessions (from statusLine monitor)',
      inputSchema: {
        sessionId: z.string().optional().describe('Session ID — omit to get all sessions'),
      },
    },
    async (args: { sessionId?: string }) => {
      if (!ctx.statusLineMonitor) {
        return { content: [{ type: 'text' as const, text: 'StatusLineMonitor not available' }], isError: true }
      }

      if (args.sessionId) {
        const usage = ctx.statusLineMonitor.get(args.sessionId)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(usage ?? { error: 'No data for session' }, null, 2),
          }],
        }
      }

      const allUsage = ctx.statusLineMonitor.getAll()
      const result: Record<string, unknown> = {}
      for (const [id, usage] of allUsage) {
        result[id] = usage
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    }
  )

  // 8. kickoff_complete — Signal that /launch finished its work
  ;(server.registerTool as any)(
    'kickoff_complete',
    {
      description:
        'Signal dass der Launcher das Projekt-Scaffolding abgeschlossen hat. '
        + 'cipher-mux reagiert, indem es eine neue Claude-Session im Projekt-'
        + 'Verzeichnis öffnet und /interview startet.',
      inputSchema: {
        projectPath: z.string().describe('Absoluter Pfad zum Projekt-Verzeichnis'),
        projectName: z.string().describe('Projektname (kebab-case, aus dem Verzeichnisnamen)'),
        detectedStack: z.string().optional().describe(
          'Erkannter Tech-Stack, z.B. "kotlin-android", "electron-ts", "python"'
        ),
      },
    },
    async (args: { projectPath: string; projectName: string; detectedStack?: string }) => {
      if (!ctx.kickoffOrchestrator) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'KickoffOrchestrator not available' }) }],
          isError: true,
        }
      }
      try {
        ctx.kickoffOrchestrator.handleCompletion({
          projectPath: args.projectPath,
          projectName: args.projectName,
          detectedStack: args.detectedStack,
        }, 'normal')
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: msg }) }],
          isError: true,
        }
      }
    }
  )

  // 9. mux_bugreport_resolve — Resolve a bugreport (outbox → inbox)
  ;(server.registerTool as any)(
    'mux_bugreport_resolve',
    {
      description:
        'Resolve a bugreport: move from outbox to inbox with result, '
        + 'send chatroom notification. Called by worker sessions after fixing or failing.',
      inputSchema: {
        bugId: z.string().describe('Bug ID (e.g. BUG-2026-04-19-abc123)'),
        status: z.enum(['fixed', 'failed']).describe('Resolution status'),
        summary: z.string().describe('What was done — analysis, fix description, or failure reason'),
        branchName: z.string().optional().describe('Git branch with the fix (only for status=fixed)'),
        filesChanged: z.array(z.string()).optional().describe('List of changed files'),
      },
    },
    async (args: {
      bugId: string
      status: 'fixed' | 'failed'
      summary: string
      branchName?: string
      filesChanged?: string[]
    }) => {
      const { resolveBugreport } = await import('../bugreport/bugreport-resolve.js')

      const result = await resolveBugreport(args)
      if (!result.ok) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          isError: true,
        }
      }

      // Send chatroom notification
      if (ctx.messageBus) {
        const statusText = args.status === 'fixed'
          ? `fixed auf Branch ${args.branchName ?? '(unknown)'}`
          : `failed nach Analyse`
        ctx.messageBus.send({
          topic: 'chat' as Topic,
          sender: 'bugreport-orchestrator',
          payload: { text: `${args.bugId}: ${statusText}. ${args.summary}` },
        })
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      }
    }
  )

  // 10. mux_task_create — Create a task in the queue
  ;(server.registerTool as any)(
    'mux_task_create',
    {
      description: 'Create a task in the cipher-mux task queue',
      inputSchema: {
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        source: z.string().optional().describe('Task source (default: orchestrator)'),
        parent_id: z.string().optional().describe('Parent task ID'),
        policy: z.object({
          stall_timeout: z.number().optional(),
          max_retries: z.number().optional(),
          hooks: z.object({
            before_run: z.string().optional(),
            after_run: z.string().optional(),
            timeout: z.number().optional(),
          }).optional(),
        }).optional().describe('Task policy'),
      },
    },
    async (args: {
      title: string
      description?: string
      source?: string
      parent_id?: string
      policy?: {
        stall_timeout?: number
        max_retries?: number
        hooks?: { before_run?: string; after_run?: string; timeout?: number }
      }
    }) => {
      if (!ctx.taskManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'TaskManager not available' }) }], isError: true }
      }
      try {
        const task = ctx.taskManager.create({
          title: args.title,
          description: args.description,
          source: args.source ?? 'orchestrator',
          parentId: args.parent_id,
          policy: args.policy ? {
            stallTimeout: args.policy.stall_timeout,
            maxRetries: args.policy.max_retries,
            hooks: args.policy.hooks ? {
              beforeRun: args.policy.hooks.before_run,
              afterRun: args.policy.hooks.after_run,
              timeout: args.policy.hooks.timeout,
            } : undefined,
          } : undefined,
        })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, task }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: errMsg }) }],
          isError: true,
        }
      }
    }
  )

  // 11. mux_task_update — Update task state/progress
  ;(server.registerTool as any)(
    'mux_task_update',
    {
      description: 'Update a task state or progress in the cipher-mux task queue',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
        state: z.enum(['dispatched', 'running', 'done', 'failed']).optional().describe('New task state'),
        session_id: z.string().optional().describe('Session ID (required for dispatched→running)'),
        result: z.object({
          summary: z.string().optional(),
          data: z.unknown().optional(),
        }).optional().describe('Task result'),
      },
    },
    async (args: {
      task_id: string
      state?: 'dispatched' | 'running' | 'done' | 'failed'
      session_id?: string
      result?: { summary?: string; data?: unknown }
    }) => {
      if (!ctx.taskManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'TaskManager not available' }) }], isError: true }
      }
      try {
        let task
        if (args.state === 'done') {
          task = ctx.taskManager.markValidating(args.task_id)
        } else if (args.state === 'dispatched') {
          task = ctx.taskManager.dispatch(args.task_id)
        } else if (args.state === 'running') {
          task = ctx.taskManager.markRunning(args.task_id, args.session_id)
        } else if (args.state === 'failed') {
          task = ctx.taskManager.markFailed(args.task_id, args.result as any)
        } else {
          // No state change — update via patch
          task = ctx.taskManager.update(args.task_id, {
            sessionId: args.session_id,
            result: args.result as any,
          })
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, task }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: errMsg }) }],
          isError: true,
        }
      }
    }
  )

  // 12. mux_task_list — List tasks with filters
  ;(server.registerTool as any)(
    'mux_task_list',
    {
      description: 'List tasks in the cipher-mux task queue with optional filters',
      inputSchema: {
        state: z.string().optional().describe('Filter by state'),
        source: z.string().optional().describe('Filter by source'),
        parent_id: z.string().optional().describe('Filter by parent task ID'),
        session_id: z.string().optional().describe('Filter by session ID'),
      },
    },
    async (args: {
      state?: string
      source?: string
      parent_id?: string
      session_id?: string
    }) => {
      if (!ctx.taskManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'TaskManager not available' }) }], isError: true }
      }
      const filter: Record<string, unknown> = {}
      if (args.state !== undefined) filter['state'] = args.state
      if (args.source !== undefined) filter['source'] = args.source
      if (args.parent_id !== undefined) filter['parentId'] = args.parent_id
      if (args.session_id !== undefined) filter['sessionId'] = args.session_id

      const tasks = ctx.taskManager.list(Object.keys(filter).length > 0 ? filter as any : undefined)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }],
      }
    }
  )

  // 13. mux_task_get — Get task by ID with children
  ;(server.registerTool as any)(
    'mux_task_get',
    {
      description: 'Get a task by ID including its children',
      inputSchema: {
        task_id: z.string().describe('Task ID'),
      },
    },
    async (args: { task_id: string }) => {
      if (!ctx.taskManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'TaskManager not available' }) }], isError: true }
      }
      const task = ctx.taskManager.get(args.task_id)
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `Task not found: ${args.task_id}` }) }],
          isError: true,
        }
      }
      const children = ctx.taskManager.children(args.task_id)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, task, children }, null, 2) }],
      }
    }
  )

  // 14. mux_input_request_create — Create an input request for the Cyber Factory sidebar
  ;(server.registerTool as any)(
    'mux_input_request_create',
    {
      description: 'Create an input request bubble for the cipher-mux sidebar (used by Cyber Factory to ask the user questions)',
      inputSchema: {
        projectId: z.string().describe('Project identifier'),
        question: z.string().describe('The question to ask the user'),
        context: z.string().optional().describe('Additional context (2-3 sentences)'),
        options: z.array(z.object({
          key: z.string(),
          label: z.string(),
          description: z.string().optional().default(''),
        })).optional().describe('Answer options (max 4)'),
        recommendation: z.string().optional().describe('Recommended option key'),
      },
    },
    async (args: {
      projectId: string
      question: string
      context?: string
      options?: Array<{ key: string; label: string; description?: string }>
      recommendation?: string
    }) => {
      if (!ctx.inputRequestWatcher) {
        return { content: [{ type: 'text' as const, text: 'InputRequestWatcher not available' }], isError: true }
      }

      const id = `ir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const request: import('../../shared/types').InputRequestBubble = {
        id,
        type: 'bubble',
        projectId: args.projectId,
        question: args.question,
        context: args.context ?? '',
        options: (args.options ?? []).map(o => ({ key: o.key, label: o.label, description: o.description ?? '' })),
        recommendation: args.recommendation,
        status: 'open',
        answer: null,
        createdAt: new Date().toISOString(),
        answeredAt: null,
      }
      ctx.inputRequestWatcher.createRequest(request)

      return {
        content: [{ type: 'text' as const, text: `Input request created: ${id} — "${args.question}"` }],
      }
    }
  )

  // 15. mux_notes_create — Create a note in cipher-mux
  ;(server.registerTool as any)(
    'mux_notes_create',
    {
      description:
        'Create a note in the cipher-mux Notes system. Notes appear in the sidebar and can be opened in the Notes editor. '
        + 'Use this to persist deliverables, summaries, research findings, or any text output that should survive the session.',
      inputSchema: {
        title: z.string().describe('Note title (also used as # heading)'),
        body: z.string().describe('Markdown body (without the title heading — it will be prepended)'),
        tags: z.array(z.string()).optional().describe('Tags for categorization (max 5, lowercase)'),
      },
    },
    async (args: { title: string; body: string; tags?: string[] }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const fullBody = `# ${args.title}\n\n${args.body}`
        let tags = args.tags ?? ([] as string[])
        // REQ-NOTES-007: warn if manual tags exceed limit, but create anyway
        const manualTagCount = tags.length
        const tagLimitWarning = manualTagCount > 5
          ? `Warning: ${manualTagCount} manual tags exceed recommended limit of 5.`
          : undefined
        // P.2: auto-apply workspace defaultTags
        try {
          const { configStore } = require('../config/config-store')
          const activeWsId = configStore.get('activeWorkspaceId')
          if (activeWsId) {
            const workspaces = configStore.get('workspaces') ?? []
            const ws = (workspaces as any[]).find((w: any) => w.id === activeWsId)
            if (ws?.defaultTags?.length) {
              const tagSet = new Set([...tags, ...ws.defaultTags])
              tags = [...tagSet]
            }
          }
        } catch { /* configStore not available */ }
        const note = await ctx.noteManager.create(args.title, fullBody, tags.length > 0 ? tags : undefined)

        // Update search index
        if (ctx.noteSearchIndex) {
          ctx.noteSearchIndex.addOrUpdate({ info: note, body: fullBody })
        }

        // Notify UI
        if (ctx.windowManager) {
          ctx.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'created', note })
        }

        const result: Record<string, unknown> = { ok: true, id: note.id, title: note.title }
        if (tagLimitWarning) result.warning = tagLimitWarning
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: errMsg }) }],
          isError: true,
        }
      }
    }
  )

  // 16. mux_notes_list — List notes
  ;(server.registerTool as any)(
    'mux_notes_list',
    {
      description: 'List notes in the cipher-mux Notes system. Returns title, tags, and timestamps. Optionally filter by tags.',
      inputSchema: {
        tags: z.array(z.string()).optional().describe('Filter by tags — only notes with at least one matching tag'),
      },
    },
    async (args: { tags?: string[] }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const notes = await ctx.noteManager.list(args.tags)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(notes, null, 2) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: errMsg }) }],
          isError: true,
        }
      }
    }
  )

  // 17. mux_notes_read — Read a note by ID
  ;(server.registerTool as any)(
    'mux_notes_read',
    {
      description: 'Read a note by ID from the cipher-mux Notes system. Returns full content including body and frontmatter.',
      inputSchema: {
        id: z.string().describe('Note ID (ULID)'),
      },
    },
    async (args: { id: string }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const result = await ctx.noteManager.read(args.id)
        if (!result) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Note not found: ${args.id}` }) }], isError: true }
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ info: result.info, body: result.body }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 18. mux_notes_update — Partial update of a note
  ;(server.registerTool as any)(
    'mux_notes_update',
    {
      description:
        'Update a note in the cipher-mux Notes system. Supports partial updates: only the provided fields are changed. '
        + 'Can also update handoff_status for handoff notes.',
      inputSchema: {
        id: z.string().describe('Note ID (ULID)'),
        title: z.string().optional().describe('New title — updates the first # heading in the body'),
        body: z.string().optional().describe('New markdown body (replaces entire body)'),
        tags: z.array(z.string()).optional().describe('New tags (max 5, replaces all existing tags)'),
        handoff_status: z.enum(['pending', 'consumed']).optional().describe('Update handoff status for handoff notes'),
      },
    },
    async (args: { id: string; title?: string; body?: string; tags?: string[]; handoff_status?: 'pending' | 'consumed' }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const existing = await ctx.noteManager.read(args.id)
        if (!existing) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Note not found: ${args.id}` }) }], isError: true }
        }

        let body = args.body ?? existing.body
        const tags = args.tags ? args.tags.slice(0, 5) : existing.info.tags

        // Update title heading if title provided
        if (args.title && !args.body) {
          body = body.replace(/^#\s+.+$/m, `# ${args.title}`)
          // If no heading existed, prepend one
          if (!body.match(/^#\s+/m)) {
            body = `# ${args.title}\n\n${body}`
          }
        }

        const note = await ctx.noteManager.save(args.id, body, tags)

        // Update handoff_status in frontmatter if provided (requires re-reading and re-writing the raw file)
        if (args.handoff_status) {
          const filePath = path.join(
            (ctx.noteManager as any).notesDir,
            `${args.id}.md`
          )
          const raw = readFileSync(filePath, 'utf-8')
          const parsed = matter(raw)
          parsed.data.handoff_status = args.handoff_status
          parsed.data.modified = new Date().toISOString()
          const updated = matter.stringify(parsed.content, parsed.data)
          writeFileSync(filePath, updated, 'utf-8')
        }

        // Notify UI
        if (ctx.windowManager) {
          ctx.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'updated', note })
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id: note.id, title: note.title }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 19. mux_notes_search — Full-text search over notes
  ;(server.registerTool as any)(
    'mux_notes_search',
    {
      description:
        'Search notes by text query and/or tags. Returns matching notes sorted by relevance (title matches first, then by date). '
        + 'Max 50 results.',
      inputSchema: {
        query: z.string().describe('Search query — matched case-insensitive against title and body'),
        tags: z.array(z.string()).optional().describe('Tag filter — only notes with at least one matching tag'),
      },
    },
    async (args: { query: string; tags?: string[] }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        // Prefer FlexSearch index, fallback to NoteManager.search
        let resultInfos: import('../../shared/types').NoteInfo[]
        if (ctx.noteSearchIndex) {
          let results = ctx.noteSearchIndex.search(args.query)
          if (args.tags && args.tags.length > 0) {
            const tagSet = new Set(args.tags.map(t => t.toLowerCase()))
            results = results.filter(r => r.info.tags.some(t => tagSet.has(t.toLowerCase())))
          }
          resultInfos = results.map(r => r.info)
        } else {
          const results = await ctx.noteManager.search(args.query, { tags: args.tags })
          resultInfos = results.map(r => r.info)
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(resultInfos, null, 2) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 20. mux_notes_delete — Delete a note by ID
  ;(server.registerTool as any)(
    'mux_notes_delete',
    {
      description: 'Delete a note from the cipher-mux Notes system.',
      inputSchema: {
        id: z.string().describe('Note ID (ULID)'),
      },
    },
    async (args: { id: string }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const deleted = await ctx.noteManager.delete(args.id)
        if (!deleted) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Note not found: ${args.id}` }) }], isError: true }
        }

        // Notify UI
        if (ctx.windowManager) {
          ctx.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'deleted', id: args.id })
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id: args.id }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 21. mux_notes_handoff_create — Create a handoff note
  ;(server.registerTool as any)(
    'mux_notes_handoff_create',
    {
      description:
        'Create a handoff note for session-to-session knowledge transfer. Handoff notes have extended frontmatter '
        + '(from_session, to_entity, handoff_status) and are always global scope. Tag: "handoff".',
      inputSchema: {
        title: z.string().describe('Handoff title, e.g. "Handoff: Auth refactor context"'),
        body: z.string().describe('Markdown body with context, findings, next steps'),
        from_session: z.string().describe('Name of the session creating this handoff'),
        to_entity: z.string().optional().describe('Target entity ID or "any" (default)'),
      },
    },
    async (args: { title: string; body: string; from_session: string; to_entity?: string }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const note = await ctx.noteManager.createHandoff(
          args.title,
          `# ${args.title}\n\n${args.body}`,
          args.from_session,
          args.to_entity || 'any',
        )

        // Notify UI
        if (ctx.windowManager) {
          ctx.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'created', note })
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id: note.id }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 22. mux_notes_handoff_search — Search handoff notes
  ;(server.registerTool as any)(
    'mux_notes_handoff_search',
    {
      description:
        'Search for handoff notes. Filters by to_entity and/or handoff_status. Returns newest first.',
      inputSchema: {
        to_entity: z.string().optional().describe('Filter by target entity ID'),
        status: z.enum(['pending', 'consumed']).optional().describe('Filter by handoff status (default: "pending")'),
      },
    },
    async (args: { to_entity?: string; status?: 'pending' | 'consumed' }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        // Search for all notes with 'handoff' tag
        const allNotes = await ctx.noteManager.list()
        const handoffNotes = allNotes.filter(n => n.tags.includes('handoff'))

        const statusFilter = args.status || 'pending'
        let results = handoffNotes.filter(n => {
          // Read handoff_status — need to check the actual file for extended frontmatter
          return (n.handoffStatus || 'pending') === statusFilter
        })

        if (args.to_entity) {
          results = results.filter(n =>
            n.toEntity === args.to_entity || n.toEntity === 'any'
          )
        }

        // Sort by createdAt desc (newest first)
        results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 22b. mux_notes_open — Open a note in the grid
  ;(server.registerTool as any)(
    'mux_notes_open',
    {
      description:
        'Open a note in the cipher-mux grid as a NotesCell. If the note is already open, focuses the existing cell. '
        + 'Optionally highlights the note in the sidebar.',
      inputSchema: {
        id: z.string().describe('Note ID (ULID)'),
        highlight: z.boolean().optional().describe('If true, highlight the note in the sidebar (default false)'),
      },
    },
    async (args: { id: string; highlight?: boolean }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const result = await ctx.noteManager.read(args.id)
        if (!result) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Note not found: ${args.id}` }) }], isError: true }
        }
        if (!ctx.windowManager) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
        }
        // Send IPC to renderer to open/focus the note
        ctx.windowManager.sendToMainWindow(IPC.NOTES_OPEN, { note: result.info })
        // Optionally highlight in sidebar
        if (args.highlight) {
          ctx.windowManager.sendToMainWindow(IPC.UI_HIGHLIGHT, {
            target: `side-note-${args.id}`,
            duration: 3000,
            style: 'glow',
          })
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id: result.info.id, title: result.info.title }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // ─── Companion Memory Tools ─────────────────────────────

  // 23. companion_memory_write — Write a memory
  ;(server.registerTool as any)(
    'companion_memory_write',
    {
      description:
        'Write a memory to the companion memory store. Memories are transparent and deletable by the user. '
        + 'Use for decisions, preferences, project state, personal facts. NOT for smalltalk or trivial details.',
      inputSchema: {
        text: z.string().describe('Memory text content'),
        kind: z.enum(['fact', 'preference', 'interaction', 'event']).describe('Memory category'),
        session_id: z.string().optional().describe('Session that created this memory (auto-filled if omitted)'),
        context_tags: z.array(z.string()).optional().describe('Optional context tags'),
        salience: z.number().min(0).max(1).optional().describe('Importance 0..1 (default 0.5)'),
        scope_kind: z.enum(['user', 'workspace', 'session']).optional().describe('Memory scope kind (default: user)'),
        scope_id: z.string().optional().describe('Scope identifier (workspace ID or session ID)'),
      },
    },
    async (args: { text: string; kind: 'fact' | 'preference' | 'interaction' | 'event'; session_id?: string; context_tags?: string[]; salience?: number; scope_kind?: 'user' | 'workspace' | 'session'; scope_id?: string }) => {
      if (!ctx.memoryStore) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MemoryStore not available' }) }], isError: true }
      }
      try {
        const memory = ctx.memoryStore.write({
          text: args.text,
          kind: args.kind,
          sessionId: args.session_id,
          salience: args.salience,
          sourceExcerpt: args.context_tags ? args.context_tags.join(', ') : undefined,
          scopeKind: args.scope_kind,
          scopeId: args.scope_id,
        })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id: memory.id }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 24. companion_memory_recall — Recall recent memories
  ;(server.registerTool as any)(
    'companion_memory_recall',
    {
      description:
        'Recall recent memories from the companion store. Returns newest first. '
        + 'Use when the user references past events, decisions, or context.',
      inputSchema: {
        limit: z.number().optional().describe('Max results (default 20)'),
        entity_filter: z.string().optional().describe('Filter by memory kind'),
        since_hours: z.number().optional().describe('Only memories from the last N hours'),
        scope_kind: z.enum(['user', 'workspace', 'session']).optional().describe('Filter by scope kind'),
        scope_id: z.string().optional().describe('Filter by scope identifier'),
      },
    },
    async (args: { limit?: number; entity_filter?: string; since_hours?: number; scope_kind?: 'user' | 'workspace' | 'session'; scope_id?: string }) => {
      if (!ctx.memoryStore) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MemoryStore not available' }) }], isError: true }
      }
      try {
        const since = args.since_hours ? Date.now() - (args.since_hours * 3600_000) : undefined
        const kindFilter = args.entity_filter as import('../../shared/types').MemoryKind | undefined
        const memories = ctx.memoryStore.recall({
          limit: args.limit,
          kindFilter,
          since,
          scopeKind: args.scope_kind,
          scopeId: args.scope_id,
        })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(memories, null, 2) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 25. companion_memory_search — FTS5 search
  ;(server.registerTool as any)(
    'companion_memory_search',
    {
      description:
        'Full-text search over companion memories. Returns results ranked by relevance. '
        + 'Use when the user asks about specific topics or keywords.',
      inputSchema: {
        query: z.string().describe('Search query (FTS5 syntax supported)'),
        limit: z.number().optional().describe('Max results (default 20)'),
      },
    },
    async (args: { query: string; limit?: number }) => {
      if (!ctx.memoryStore) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MemoryStore not available' }) }], isError: true }
      }
      try {
        const memories = ctx.memoryStore.search(args.query, { limit: args.limit })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(memories, null, 2) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 26. companion_memory_forget — Delete a memory
  ;(server.registerTool as any)(
    'companion_memory_forget',
    {
      description: 'Delete a memory from the companion store by ID.',
      inputSchema: {
        id: z.string().describe('Memory ID (ULID)'),
      },
    },
    async (args: { id: string }) => {
      if (!ctx.memoryStore) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MemoryStore not available' }) }], isError: true }
      }
      try {
        const deleted = ctx.memoryStore.forget(args.id)
        if (!deleted) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Memory not found: ${args.id}` }) }], isError: true }
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // ─── Cyber Factory Tools ─────────────────────────────────

  // CF-1. mux_cyber_factory_diagnose — Health report for a CF run
  ;(server.registerTool as any)(
    'mux_cyber_factory_diagnose',
    {
      description:
        'Generate a health/diagnose report for a Cyber Factory run. '
        + 'Returns a markdown document with run status, wellen status, worker status, and escalation backlog.',
      inputSchema: {
        run_id: z.string().describe('Cyber Factory run ID'),
      },
    },
    async (args: { run_id: string }) => {
      if (!ctx.memoryStore) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MemoryStore not available' }) }], isError: true }
      }
      try {
        const { CyberFactoryManager } = await import('../cyber-factory/cyber-factory-manager.js')
        const { generateDiagnoseReport, formatDiagnoseMarkdown } = await import('../cyber-factory/diagnose.js')

        const cfm = new CyberFactoryManager(ctx.memoryStore)
        const run = cfm.getRun(args.run_id)
        if (!run) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Run not found: ${args.run_id}` }) }], isError: true }
        }

        const wellen = cfm.listWellen(args.run_id)
        const workers = wellen.flatMap(w => cfm.listSubProjekte(w.id)).map(sp => ({
          subProjektId: sp.id,
          name: sp.name,
          status: sp.status,
          tmuxSession: sp.tmuxSession,
          contextUsagePercent: null,
          lastOutput: null,
          lastHeartbeat: sp.lastHeartbeat,
        }))

        const report = generateDiagnoseReport({ run, wellen, workers, escalationBacklog: 0 })
        const markdown = formatDiagnoseMarkdown(report)

        return {
          content: [{ type: 'text' as const, text: markdown }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // ─── App-Control Tools ─────────────────────────────────

  // 27. mux_grid_resize — Resize the grid
  ;(server.registerTool as any)(
    'mux_grid_resize',
    {
      description:
        'Resize the cipher-mux grid layout. Changes the number of columns and rows. '
        + 'Max 7 cols, 3 rows. Sessions that no longer fit move to background.',
      inputSchema: {
        cols: z.number().min(1).max(7).describe('Number of columns (1-7)'),
        rows: z.number().min(1).max(3).describe('Number of rows (1-3)'),
      },
    },
    async (args: { cols: number; rows: number }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      ctx.windowManager.sendToMainWindow(IPC.GRID_RESIZE, { cols: args.cols, rows: args.rows })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, cols: args.cols, rows: args.rows }) }],
      }
    }
  )

  // 28. mux_grid_place — Place a session in a specific grid cell
  ;(server.registerTool as any)(
    'mux_grid_place',
    {
      description:
        'Place a session in a specific grid cell (col/row, 0-indexed). '
        + 'The session must exist. If the cell is occupied, sessions swap positions.',
      inputSchema: {
        sessionId: z.string().describe('Session ID (ULID) to place'),
        col: z.number().min(0).describe('Column index (0-based)'),
        row: z.number().min(0).describe('Row index (0-based)'),
      },
    },
    async (args: { sessionId: string; col: number; row: number }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      ctx.windowManager.sendToMainWindow(IPC.GRID_PLACE, {
        sessionId: args.sessionId,
        col: args.col,
        row: args.row,
      })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
      }
    }
  )

  // 29. mux_session_focus — Focus a session in the grid
  ;(server.registerTool as any)(
    'mux_session_focus',
    {
      description:
        'Focus a session in the cipher-mux grid. If the session is in the background, '
        + 'it will be brought into the grid first.',
      inputSchema: {
        sessionId: z.string().describe('Session ID (ULID) to focus'),
      },
    },
    async (args: { sessionId: string }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      ctx.windowManager.sendToMainWindow(IPC.SESSION_FOCUS, { sessionId: args.sessionId })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
      }
    }
  )

  // 30. mux_session_eject — Eject a session to background
  ;(server.registerTool as any)(
    'mux_session_eject',
    {
      description:
        'Eject a session from the grid to the background (sidebar). '
        + 'The session continues running but is no longer visible in the grid.',
      inputSchema: {
        sessionId: z.string().describe('Session ID (ULID) to eject'),
      },
    },
    async (args: { sessionId: string }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      ctx.windowManager.sendToMainWindow(IPC.SESSION_EJECT, { sessionId: args.sessionId })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
      }
    }
  )

  // 31. mux_sidebar_toggle — Toggle sidebar visibility
  ;(server.registerTool as any)(
    'mux_sidebar_toggle',
    {
      description:
        'Toggle the cipher-mux sidebar visibility. Optionally force a specific state.',
      inputSchema: {
        visible: z.boolean().optional().describe('Force visible (true) or hidden (false). Omit to toggle.'),
      },
    },
    async (args: { visible?: boolean }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      ctx.windowManager.sendToMainWindow(IPC.SIDEBAR_TOGGLE, { visible: args.visible })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
      }
    }
  )

  // ─── Companion Demo Mode Tools ─────────────────────────

  // 32. mux_ui_highlight — Highlight a UI element
  ;(server.registerTool as any)(
    'mux_ui_highlight',
    {
      description:
        'Highlight a UI element in the cipher-mux interface. Elements are identified by their data-highlight attribute. '
        + 'Use to visually guide users to specific parts of the UI during demos or help flows. '
        + 'Known targets: sb-voice, sb-grid, sb-workspaces, sb-sidebar, sb-theme, sb-info, '
        + 'cell-{col}-{row}, cell-head-{col}-{row}, side-messages, side-background, side-notes, '
        + 'side-requests, side-memory, popup-workspace, popup-launcher, popup-info.',
      inputSchema: {
        target: z.string().describe('Value of the data-highlight attribute on the target element'),
        duration: z.number().optional().describe('Milliseconds to show the highlight (default 3000, 0 = stays until clear)'),
        style: z.enum(['glow', 'outline']).optional().describe('Highlight style (default: glow)'),
        clear: z.boolean().optional().describe('If true, remove all active highlights'),
      },
    },
    async (args: { target?: string; duration?: number; style?: 'glow' | 'outline'; clear?: boolean }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }

      // Clear all — no target validation needed
      if (args.clear) {
        ctx.windowManager.sendToMainWindow(IPC.UI_HIGHLIGHT, {
          target: args.target,
          duration: args.duration ?? 3000,
          style: args.style ?? 'glow',
          clear: true,
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, target: 'clear' }) }] }
      }

      if (!args.target) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'No target specified' }) }], isError: true }
      }

      // Known static targets
      const knownTargets = [
        'sb-voice', 'sb-grid', 'sb-workspaces', 'sb-sidebar', 'sb-theme', 'sb-info',
        'side-messages', 'side-background', 'side-notes', 'side-requests', 'side-memory',
        'popup-workspace', 'popup-launcher', 'popup-info',
      ]
      // Dynamic target prefixes (cell-*, cell-head-*, side-note-*, side-session-*, side-message-*)
      const dynamicPrefixes = ['cell-', 'cell-head-', 'side-note-', 'side-session-', 'side-message-']

      const isKnown = knownTargets.includes(args.target)
        || dynamicPrefixes.some(prefix => args.target!.startsWith(prefix))

      if (!isKnown) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ok: false,
            error: `Unknown target: "${args.target}"`,
            knownTargets,
            dynamicPrefixes: dynamicPrefixes.map(p => `${p}*`),
          }) }],
          isError: true,
        }
      }

      ctx.windowManager.sendToMainWindow(IPC.UI_HIGHLIGHT, {
        target: args.target,
        duration: args.duration ?? 3000,
        style: args.style ?? 'glow',
        clear: false,
      })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, target: args.target }) }],
      }
    }
  )

  // 33. mux_ui_open — Open/close/toggle a popup/dialog
  ;(server.registerTool as any)(
    'mux_ui_open',
    {
      description:
        'Open, close, or toggle a popup/dialog in the cipher-mux interface. Known targets: '
        + 'workspace-popup (workspace chooser), info-dialog/settings (info/settings/shortcuts), '
        + 'launcher-popup (launcher cell popup, use context.cell e.g. "1-0" to specify which cell), '
        + 'note (open a note in the editor, requires context.noteId). '
        + 'Use context.tab to open a specific tab (e.g. "themes", "shortcuts").',
      inputSchema: {
        target: z.string().describe('Logical name of the popup/dialog'),
        action: z.enum(['open', 'close', 'toggle']).optional().describe('Action to perform (default: toggle)'),
        context: z.record(z.unknown()).optional().describe('Additional context, e.g. { cell: "1-0", tab: "themes" }'),
      },
    },
    async (args: { target: string; action?: 'open' | 'close' | 'toggle'; context?: Record<string, unknown> }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      // Normalize aliases
      const targetAliases: Record<string, string> = { settings: 'info-dialog' }
      const resolvedTarget = targetAliases[args.target] ?? args.target

      const knownTargets = ['workspace-popup', 'info-dialog', 'launcher-popup', 'note']
      if (!knownTargets.includes(resolvedTarget)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `Unknown target: ${args.target}. Known: ${[...knownTargets, 'settings'].join(', ')}` }) }],
          isError: true,
        }
      }
      // Validate note target requires noteId
      if (resolvedTarget === 'note' && !args.context?.noteId) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Target "note" requires context.noteId' }) }],
          isError: true,
        }
      }
      ctx.windowManager.sendToMainWindow(IPC.UI_OPEN, {
        target: resolvedTarget,
        action: args.action ?? 'toggle',
        context: args.context,
      })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, target: resolvedTarget, action: args.action ?? 'toggle' }) }],
      }
    }
  )

  // 34. mux_theme_set — Set the active theme
  ;(server.registerTool as any)(
    'mux_theme_set',
    {
      description:
        'Set the active theme in cipher-mux. Valid theme IDs: cipher-ivory, cipher-dark, blueprint, '
        + 'warm-paper, gruvbox-dark, nord, synthwave, matrix, brutalist, high-contrast.',
      inputSchema: {
        theme: z.string().describe('Theme ID to activate'),
      },
    },
    async (args: { theme: string }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      const validThemes = [
        'cipher-ivory', 'cipher-dark', 'blueprint', 'warm-paper',
        'gruvbox-dark', 'nord', 'synthwave', 'matrix', 'brutalist', 'high-contrast',
      ]
      if (!validThemes.includes(args.theme)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `Unknown theme: ${args.theme}. Valid: ${validThemes.join(', ')}` }) }],
          isError: true,
        }
      }
      ctx.windowManager.sendToMainWindow(IPC.THEME_SET, { theme: args.theme })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, theme: args.theme }) }],
      }
    }
  )

  // 35a. mux_ui_choreography — Client-side UI timeline
  ;(server.registerTool as any)(
    'mux_ui_choreography',
    {
      description:
        'Play a timeline of UI actions client-side with precise timing. One call replaces many '
        + 'sequential mux_theme_set / mux_ui_highlight calls. Actions execute in the renderer '
        + 'with no network roundtrip between steps. '
        + 'Supported actions: "theme" (value: theme ID), "highlight" (target, duration, style), '
        + '"highlight_clear", "open" (target: workspace-popup|info-dialog|launcher-popup), '
        + '"close" (same targets as open), "grid_resize" (cols, rows), '
        + '"sidebar" (visible: true/false/omit to toggle). Times are in ms from timeline start.',
      inputSchema: {
        timeline: z.array(z.object({
          at: z.number().describe('Milliseconds from timeline start'),
          action: z.enum(['theme', 'highlight', 'highlight_clear', 'open', 'close', 'grid_resize', 'sidebar']).describe('Action type'),
          value: z.string().optional().describe('Theme ID (for action=theme)'),
          target: z.string().optional().describe('Element target (highlight: data-highlight attr; open/close: popup ID)'),
          duration: z.number().optional().describe('Highlight duration in ms (default 3000)'),
          style: z.enum(['glow', 'outline']).optional().describe('Highlight style (default glow)'),
          cols: z.number().min(1).max(7).optional().describe('Grid columns (for action=grid_resize, 1-7)'),
          rows: z.number().min(1).max(3).optional().describe('Grid rows (for action=grid_resize, 1-3)'),
          visible: z.boolean().optional().describe('Sidebar visibility (for action=sidebar; omit to toggle)'),
        })).describe('Array of timed UI actions'),
      },
    },
    async (args: { timeline: Array<{ at: number; action: string; value?: string; target?: string; duration?: number; style?: string; cols?: number; rows?: number; visible?: boolean }> }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      if (!args.timeline || args.timeline.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Empty timeline' }) }], isError: true }
      }
      // Cap timeline length and duration
      const timeline = args.timeline.slice(0, 100)
      const maxAt = Math.max(...timeline.map(e => e.at))
      if (maxAt > 30_000) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Timeline too long (max 30s)' }) }], isError: true }
      }
      // Play timeline in main process — dispatch existing IPC events at scheduled times.
      // Local IPC (main→renderer) is sub-ms, so timing is precise.
      for (const step of timeline) {
        setTimeout(() => {
          if (step.action === 'theme' && step.value) {
            ctx.windowManager!.sendToMainWindow(IPC.THEME_SET, { theme: step.value })
          } else if (step.action === 'highlight' && step.target) {
            ctx.windowManager!.sendToMainWindow(IPC.UI_HIGHLIGHT, {
              target: step.target,
              duration: step.duration ?? 3000,
              style: step.style ?? 'glow',
            })
          } else if (step.action === 'highlight_clear') {
            ctx.windowManager!.sendToMainWindow(IPC.UI_HIGHLIGHT, { clear: true })
          } else if ((step.action === 'open' || step.action === 'close') && step.target) {
            ctx.windowManager!.sendToMainWindow(IPC.UI_OPEN, {
              target: step.target,
              action: step.action,
            })
          } else if (step.action === 'grid_resize' && step.cols != null && step.rows != null) {
            ctx.windowManager!.sendToMainWindow(IPC.GRID_RESIZE, {
              cols: step.cols,
              rows: step.rows,
            })
          } else if (step.action === 'sidebar') {
            ctx.windowManager!.sendToMainWindow(IPC.SIDEBAR_TOGGLE, {
              visible: step.visible,
            })
          }
        }, step.at)
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, steps: timeline.length, durationMs: maxAt }) }],
      }
    }
  )

  // 35. mux_tts_speak — Speak text via TTS
  ;(server.registerTool as any)(
    'mux_tts_speak',
    {
      description:
        'Speak text aloud via TTS. Use this to read responses to the user. '
        + 'Only speak the key message — skip code blocks, tool output, and debug info.',
      inputSchema: {
        text: z.string().describe('Text to speak aloud'),
        priority: z.enum(['normal', 'interrupt']).optional()
          .describe('normal = queue after current speech, interrupt = stop current speech and play immediately'),
      },
    },
    async (args: { text: string; priority?: 'normal' | 'interrupt' }) => {
      // Check TTS toggle
      const { configStore: ttsConfigStore } = require('../config/config-store')
      if (ttsConfigStore.get('ttsEnabled') === false) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, skipped: 'tts disabled' }) }] }
      }
      const voiceManager = ctx.getVoiceManager?.()
      if (voiceManager?.isInitialized() || voiceManager?.isPiperReady()) {
        // Full voice pipeline or Piper-only — use Piper/macOS say with echo guard
        try {
          await voiceManager.speakText(args.text, args.priority === 'interrupt')
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, spoken: args.text.slice(0, 100) }) }],
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }],
            isError: true,
          }
        }
      }
      // Lazy-init Piper if configured for local TTS but voice mode not active
      if (voiceManager && ttsConfigStore.get('ttsVoice') !== 'macos') {
        try {
          await voiceManager.initPiperOnly()
          await voiceManager.speakText(args.text, args.priority === 'interrupt')
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, spoken: args.text.slice(0, 100), via: 'piper-lazy' }) }] }
        } catch (err) {
          console.warn('[mux_tts_speak] Piper lazy-init failed, falling back to macOS say:', (err as Error).message)
        }
      }
      // Fallback: macOS say (works without voice mode being active)
      try {
        const { execFile } = require('child_process')
        await new Promise<void>((resolve, reject) => {
          execFile('say', [args.text], (err: Error | null) => err ? reject(err) : resolve())
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, spoken: args.text.slice(0, 100), via: 'macos-say' }) }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as Error).message }) }], isError: true }
      }
    }
  )

  // 36. mux_cell_scroll — Scroll a terminal cell
  ;(server.registerTool as any)(
    'mux_cell_scroll',
    {
      description:
        'Scroll a terminal cell. Actions: "up"/"down" scroll by ~1 page, '
        + '"top"/"bottom" jump to extremes, "to-marker" jumps to the start '
        + 'of the last response (set automatically on each user submission).',
      inputSchema: {
        sessionId: z.string().optional().describe('Target session ID. If omitted, uses the calling session.'),
        cell: z.string().optional().describe('Target cell by grid position (e.g. "cell-0-0"). Alternative to sessionId.'),
        action: z.enum(['up', 'down', 'top', 'bottom', 'to-marker']).describe('Scroll action to perform'),
        lines: z.number().optional().describe('Number of lines to scroll (only for up/down). Default: ~1 page.'),
      },
    },
    async (args: { sessionId?: string; cell?: string; action: string; lines?: number }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      ctx.windowManager.sendToMainWindow(IPC.CELL_SCROLL, args)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
      }
    }
  )

  // D-1. mux_debugger_findings_intake — Submit structured bug findings to the Debugger
  ;(server.registerTool as any)(
    'mux_debugger_findings_intake',
    {
      description: 'Submit structured bug findings to the Debugger. Creates a new debugger run and identifies clarification gaps.',
      inputSchema: {
        symptom: z.string().describe('What is happening (bug description)'),
        reproduction: z.string().describe('Steps to reproduce'),
        severity: z.enum(['high', 'medium', 'low']),
        suspectedCause: z.string().optional().describe('Optional hypothesis about root cause'),
        affectedAreas: z.array(z.string()).optional().describe('File paths likely involved'),
        source: z.enum(['testing-assistant', 'bugreport', 'manual']).optional().default('manual'),
        bugReportId: z.string().optional().describe('Optional link to existing bugreport'),
        projectPath: z.string().describe('Project path for the debugger run'),
      },
    },
    async (args: {
      symptom: string
      reproduction: string
      severity: 'high' | 'medium' | 'low'
      suspectedCause?: string
      affectedAreas?: string[]
      source?: 'testing-assistant' | 'bugreport' | 'manual'
      bugReportId?: string
      projectPath: string
    }) => {
      if (!ctx.messageBus) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MessageBus (DB) not available' }) }], isError: true }
      }
      try {
        const { parseFindings } = await import('../debugger/findings-parser.js')
        const { DebuggerManager } = await import('../debugger/debugger-manager.js')
        const { ClarificationRouter } = await import('../debugger/clarification-router.js')
        const db = ctx.messageBus.getDatabase()
        const findings = parseFindings({
          symptom: args.symptom,
          reproduction: args.reproduction,
          severity: args.severity,
          suspectedCause: args.suspectedCause ?? null,
          affectedAreas: args.affectedAreas ?? [],
          source: args.source ?? 'manual',
          bugReportId: args.bugReportId,
        })
        const debuggerMgr = new DebuggerManager(db)
        const run = debuggerMgr.createRun({
          source: findings.source,
          severity: findings.severity,
          description: findings.symptom,
          projectPath: args.projectPath,
          bugReportId: findings.bugReportId,
        })
        const router = new ClarificationRouter(debuggerMgr)
        const gaps = router.identifyGaps(findings)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ runId: run.id, status: run.status, gaps }) }] }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: errMsg }) }], isError: true }
      }
    }
  )

  // 40. mux_ideation_skill_run — Run an ideation skill with brain context
  ;(server.registerTool as any)(
    'mux_ideation_skill_run',
    {
      description:
        'Run an ideation skill (e.g. pre-mortem, persona-roundtable) with the current brain as context. '
        + 'Reads the skill markdown file and returns its content for execution.',
      inputSchema: {
        skillId: z.string().describe('Skill ID (e.g. "pre-mortem", "persona-roundtable", "oss-telescope")'),
        skillsDir: z.string().optional().describe('Skills directory path (defaults to ~/.config/cipher-mux/skills/ideation/)'),
      },
    },
    async (args: { skillId: string; skillsDir?: string }) => {
      try {
        const skillsDir = args.skillsDir || `${require('os').homedir()}/.config/cipher-mux/skills/ideation`
        const skillPath = require('path').join(skillsDir, `${args.skillId}.md`)
        let skillContent: string

        try {
          skillContent = require('fs').readFileSync(skillPath, 'utf-8')
        } catch {
          // Return known skill description as fallback
          const { KNOWN_SKILLS } = require('../ideation-partner/skill-registry')
          const known = KNOWN_SKILLS.find((s: { id: string }) => s.id === args.skillId)
          if (known) {
            skillContent = `# ${known.name}\n\n${known.description}\n\n**Wann einsetzen:** ${known.suggestWhen}`
          } else {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `Unknown skill: ${args.skillId}` }) }],
              isError: true,
            }
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ok: true,
            skillId: args.skillId,
            skillContent,
          }) }],
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: errMsg }) }],
          isError: true,
        }
      }
    }
  )

  // --- Testing Assistant Tools ---

  ;(server.registerTool as any)(
    'mux_testing_run_start',
    {
      description: 'Start a testing assistant run against a project/welle.',
      inputSchema: {
        projectPath: z.string().describe('Absolute path to the project'),
        testCommand: z.string().optional().describe('Override test command (default: from CLAUDE.md)'),
        cyberFactoryRunId: z.string().optional().describe('Associated CF run ID'),
        welleId: z.string().optional().describe('Associated welle ID'),
        workspaceId: z.string().optional().describe('Workspace scope'),
      },
    },
    async (args: { projectPath: string; testCommand?: string; cyberFactoryRunId?: string; welleId?: string; workspaceId?: string }) => {
      if (!ctx.testingAssistantManager) {
        return { content: [{ type: 'text' as const, text: 'TestingAssistantManager not available' }], isError: true }
      }
      const run = ctx.testingAssistantManager.createRun({
        projectPath: args.projectPath,
        testCommand: args.testCommand,
        cyberFactoryRunId: args.cyberFactoryRunId,
        welleId: args.welleId,
        workspaceId: args.workspaceId,
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, runId: run.id }) }] }
    }
  )

  ;(server.registerTool as any)(
    'mux_testing_run_complete',
    {
      description: 'Mark a testing run as complete and get the handoff recommendation.',
      inputSchema: {
        runId: z.string().describe('Testing run ID to complete'),
      },
    },
    async (args: { runId: string }) => {
      if (!ctx.testingAssistantManager) {
        return { content: [{ type: 'text' as const, text: 'TestingAssistantManager not available' }], isError: true }
      }
      ctx.testingAssistantManager.updateStatus(args.runId, 'completed')
      const findings = ctx.testingAssistantManager.listFindings(args.runId)
      const { decideHandoff } = await import('../testing-assistant/handoff-debugger')
      const decision = decideHandoff(findings)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, decision, findingsCount: findings.length }) }] }
    }
  )

  // --- Audit Tools ---

  ;(server.registerTool as any)(
    'mux_audit_run_start',
    {
      description: 'Start an audit run with a scope parameter.',
      inputSchema: {
        projectPath: z.string().describe('Project path to audit'),
        scope: z.enum(['welle', 'komplett', 'modul']).optional().describe('Audit scope (default: welle)'),
        scopeDetail: z.string().optional().describe('Detail for scope (e.g. git range for welle, directory for modul)'),
        workspaceId: z.string().optional().describe('Workspace scope'),
      },
    },
    async (args: { projectPath: string; scope?: string; scopeDetail?: string; workspaceId?: string }) => {
      if (!ctx.auditManager) {
        return { content: [{ type: 'text' as const, text: 'AuditManager not available' }], isError: true }
      }
      const run = ctx.auditManager.createRun({
        scope: (args.scope as any) || 'welle',
        scopeDetail: args.scopeDetail,
        projectPath: args.projectPath,
        workspaceId: args.workspaceId,
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, runId: run.id }) }] }
    }
  )

  ;(server.registerTool as any)(
    'mux_audit_run_complete',
    {
      description: 'Complete an audit run and generate the release recommendation.',
      inputSchema: {
        runId: z.string().describe('Audit run ID to complete'),
      },
    },
    async (args: { runId: string }) => {
      if (!ctx.auditManager) {
        return { content: [{ type: 'text' as const, text: 'AuditManager not available' }], isError: true }
      }
      const findings = ctx.auditManager.listFindings(args.runId)
      const { generateReleaseRecommendation } = await import('../audit/release-recommender')
      const rec = generateReleaseRecommendation(args.runId, findings)
      ctx.auditManager.saveRecommendation(rec)
      ctx.auditManager.updateStatus(args.runId, 'completed')
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, ...rec }) }] }
    }
  )
}
