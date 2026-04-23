import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SessionManager } from '../session/session-manager'
import type { MessageBus } from '../message-bus/message-bus'
import type { StatusLineMonitor } from '../monitoring/statusline-monitor'
import type { KickoffOrchestrator } from '../project/kickoff-orchestrator'
import type { TaskManager } from '../task/task-manager'
import type { Topic } from '../../shared/types'

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
}

const VALID_TOPICS: readonly string[] = ['status', 'bug', 'review', 'chat', 'system']

// Helper to work around TS2589 with zod v4 + MCP SDK deep type instantiation.
// We cast the schema shapes to `any` for registerTool's inputSchema, but keep
// runtime validation intact via zod.
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Register all MCP tools on the given McpServer instance.
 */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  // 1. mux_send — Send a message to the message bus
  ;(server.registerTool as any)(
    'mux_send',
    {
      description: 'Send a message to the cipher-mux message bus',
      inputSchema: {
        topic: z.string().describe('Message topic (status, bug, review, chat, system)'),
        sender: z.string().describe('Sender identifier'),
        text: z.string().describe('Message text'),
      },
    },
    async (args: { topic: string; sender: string; text: string }) => {
      if (!ctx.messageBus) {
        return { content: [{ type: 'text' as const, text: 'MessageBus not available' }], isError: true }
      }

      const topic = VALID_TOPICS.includes(args.topic) ? args.topic as Topic : 'chat' as Topic
      const message = ctx.messageBus.send({
        topic,
        sender: args.sender,
        payload: { text: args.text },
      })

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id: message.id }) }],
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
      },
    },
    async (args: { name: string; projectPath: string; command?: string }) => {
      try {
        const session = await ctx.sessionManager.start({
          name: args.name,
          projectPath: args.projectPath,
          command: args.command,
        })

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

  // 6. mux_kill_session — Kill a session
  ;(server.registerTool as any)(
    'mux_kill_session',
    {
      description: 'Kill a cipher-mux session',
      inputSchema: {
        sessionId: z.string().describe('Session ID (ULID)'),
      },
    },
    async (args: { sessionId: string }) => {
      try {
        await ctx.sessionManager.stop(args.sessionId)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
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

  // 14. mux_input_request_create — Create an input request for the MPO sidebar
  ;(server.registerTool as any)(
    'mux_input_request_create',
    {
      description: 'Create an input request bubble for the cipher-mux sidebar (used by MPO to ask the user questions)',
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
}
