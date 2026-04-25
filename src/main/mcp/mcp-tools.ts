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
import type { MemoryStore } from '../companion/memory-store'
import { IPC } from '../../shared/ipc-channels'

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
  memoryStore: MemoryStore | null
}

const VALID_TOPICS: readonly string[] = ['status', 'bug', 'review', 'chat', 'system']

/**
 * Escape text for safe injection via tmux send-keys.
 * For long messages (>500 chars), uses base64 encoding to avoid quoting issues.
 */
export function escapeForTmux(text: string): string {
  if (text.length > 500) {
    const b64 = Buffer.from(text).toString('base64')
    return `echo '${b64}' | base64 -d`
  }
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/;/g, '\\;')
    .replace(/\n/g, ' ')
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
      },
    },
    async (args: { topic: string; sender: string; text: string; sessionId?: string; sessionName?: string }) => {
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
            // Push-deliver directly — no readiness check needed for active
            // sessions. The old code captured the pane and looked for ❯/$
            // prompts, but that fails when Claude's TUI is running (which is
            // the normal case). The message is on the bus regardless; this
            // injection is best-effort convenience.
            const escaped = escapeForTmux(args.text)
            await ctx.sessionManager.sendKeys(targetId, escaped + '\r')
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
        scope: z.string().optional().describe('Scope: "global" (default) or "workspace-<id>" for workspace-scoped notes'),
        tags: z.array(z.string()).optional().describe('Tags for categorization (max 5, lowercase)'),
      },
    },
    async (args: { title: string; body: string; scope?: string; tags?: string[] }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const scope = args.scope || 'global'
        const fullBody = `# ${args.title}\n\n${args.body}`
        const note = await ctx.noteManager.create(scope, args.title, fullBody)

        // If tags provided, save again with tags
        if (args.tags && args.tags.length > 0) {
          await ctx.noteManager.save(note.id, scope, fullBody, args.tags.slice(0, 5))
        }

        // Notify UI
        if (ctx.windowManager) {
          ctx.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'created', note })
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id: note.id, title: note.title, scope }) }],
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
      description: 'List notes in the cipher-mux Notes system. Returns title, tags, scope, and timestamps.',
      inputSchema: {
        scope: z.string().optional().describe('Scope to list: "global", "workspace-<id>", or omit for all notes'),
      },
    },
    async (args: { scope?: string }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const notes = args.scope
          ? await ctx.noteManager.list(args.scope)
          : await ctx.noteManager.listAll()

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
        scope: z.string().optional().describe('Scope: "global" (default) or "workspace-<id>"'),
      },
    },
    async (args: { id: string; scope?: string }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const scope = args.scope || 'global'
        const result = await ctx.noteManager.read(args.id, scope)
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
        scope: z.string().optional().describe('Scope: "global" (default) or "workspace-<id>"'),
        title: z.string().optional().describe('New title — updates the first # heading in the body'),
        body: z.string().optional().describe('New markdown body (replaces entire body)'),
        tags: z.array(z.string()).optional().describe('New tags (max 5, replaces all existing tags)'),
        handoff_status: z.enum(['pending', 'consumed']).optional().describe('Update handoff status for handoff notes'),
      },
    },
    async (args: { id: string; scope?: string; title?: string; body?: string; tags?: string[]; handoff_status?: 'pending' | 'consumed' }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const scope = args.scope || 'global'
        const existing = await ctx.noteManager.read(args.id, scope)
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

        const note = await ctx.noteManager.save(args.id, scope, body, tags)

        // Update handoff_status in frontmatter if provided (requires re-reading and re-writing the raw file)
        if (args.handoff_status) {
          const filePath = path.join(
            (ctx.noteManager as any).notesDir,
            scope,
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
        scope: z.string().optional().describe('Scope filter: "global", "workspace-<id>", or omit to search all'),
        tags: z.array(z.string()).optional().describe('Tag filter — only notes with at least one matching tag'),
      },
    },
    async (args: { query: string; scope?: string; tags?: string[] }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const results = await ctx.noteManager.search(args.query, {
          scope: args.scope,
          tags: args.tags,
        })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(results.map(r => r.info), null, 2) }],
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
        scope: z.string().optional().describe('Scope: "global" (default) or "workspace-<id>"'),
      },
    },
    async (args: { id: string; scope?: string }) => {
      if (!ctx.noteManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NoteManager not available' }) }], isError: true }
      }
      try {
        const scope = args.scope || 'global'
        const deleted = await ctx.noteManager.delete(args.id, scope)
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
        const allNotes = await ctx.noteManager.list('global')
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
      },
    },
    async (args: { text: string; kind: 'fact' | 'preference' | 'interaction' | 'event'; session_id?: string; context_tags?: string[]; salience?: number }) => {
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
      },
    },
    async (args: { limit?: number; entity_filter?: string; since_hours?: number }) => {
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
}
