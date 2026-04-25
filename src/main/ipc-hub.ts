import { app, dialog, ipcMain, screen } from 'electron'
import * as path from 'path'
import * as os from 'os'
import { WindowManager } from './window-manager'
import { SessionManager } from './session/session-manager'
import { TmuxManager } from './tmux/tmux-manager'
import { MessageBus } from './message-bus/message-bus'
import { ProjectScanner } from './project/project-scanner'
import { configStore } from './config/config-store'
import { StatusLineMonitor } from './monitoring/statusline-monitor'
import { McpServerManager } from './mcp/mcp-server'
import { generateApiKey } from './mcp/mcp-auth'
import { KickoffOrchestrator } from './project/kickoff-orchestrator'
import { BugreportManager } from './bugreport/bugreport-manager'
import { VoiceManager } from './voice/voice-manager'
import type { ConversationTransport } from './voice/conversation-engine'
import { TaskManager } from './task/task-manager'
import { TaskWatcher } from './task/task-watcher'
import { InputRequestWatcher } from './mpo/input-request-watcher'
import { TaskHooks } from './task/task-hooks'
import { BugreportTaskSource } from './task/sources/bugreport-source'
import { NoteManager } from './notes/note-manager'
import { NoteTagging } from './notes/note-tagging'
import { TASK_SCHEMA_SQL } from './task/task-schema'
import { AdapterRegistry } from './agent/registry'
import { IPC } from '../shared/ipc-channels'
import { MCP_DEFAULT_PORT, MCP_DEFAULT_HOST } from '../shared/constants'
import { BRAND } from '../shared/brand'
import type { StartSessionOpts, SendMessage, Topic, ContextUsage, KickoffRequest } from '../shared/types'
import type { Persona, Workspace } from '../shared/persona-types'
import { applyWorkspace } from './workspace/workspace-manager'

/**
 * IPC Hub — Central router for all IPC channels.
 * Connects renderer requests to main process services.
 */
export class IpcHub {
  private tmux: TmuxManager
  private sessionManager: SessionManager
  private messageBus: MessageBus
  private projectScanner: ProjectScanner
  private statusLineMonitor: StatusLineMonitor
  private mcpServer: McpServerManager
  private kickoffOrchestrator: KickoffOrchestrator
  private bugreportManager: BugreportManager
  private voiceManager: VoiceManager | null = null
  private taskManager: TaskManager | null = null
  private taskWatcher: TaskWatcher | null = null
  private taskHooks: TaskHooks | null = null
  private bugreportSource: BugreportTaskSource | null = null
  private inputRequestWatcher: InputRequestWatcher | null = null
  private noteManager!: NoteManager
  private noteTagging!: NoteTagging
  private cachedProjects: Awaited<ReturnType<ProjectScanner['scan']>> = []

  private adapterRegistry: AdapterRegistry

  constructor(private windowManager: WindowManager) {
    this.adapterRegistry = new AdapterRegistry()
    this.tmux = new TmuxManager()
    this.sessionManager = new SessionManager(this.tmux, this.adapterRegistry)
    try {
      this.messageBus = new MessageBus({
        dbPath: path.join(app.getPath('userData'), 'messages.db'),
      })
    } catch (err) {
      console.error('[IpcHub] MessageBus init failed (native module mismatch?):', err)
      this.messageBus = null as any
    }
    this.projectScanner = new ProjectScanner()
    this.statusLineMonitor = new StatusLineMonitor()
    this.mcpServer = new McpServerManager()
    const appConfig = configStore.get('app')
    this.kickoffOrchestrator = new KickoffOrchestrator({
      sessionManager: this.sessionManager,
      adapterRegistry: this.adapterRegistry,
      projectlauncherPath: appConfig?.projectlauncherPath || BRAND.projectLauncherDir,
      timeoutMs: ((appConfig?.kickoffTimeoutMinutes ?? 15) * 60_000),
    })
    this.bugreportManager = new BugreportManager({ messageBus: this.messageBus })

    const notesDir = path.join(os.homedir(), '.config', 'cipher-mux', 'notes')
    this.noteManager = new NoteManager(notesDir)
    this.noteTagging = new NoteTagging(notesDir)

    // Initialize TaskManager — reuse MessageBus DB for single-writer consistency
    try {
      if (this.messageBus) {
        const db = this.messageBus.getDatabase()
        db.exec(TASK_SCHEMA_SQL)
        this.taskManager = new TaskManager(db)
      }
    } catch (err) {
      console.error('[IpcHub] TaskManager init failed:', err)
    }
  }

  init(): void {
    this.registerSessionChannels()
    this.registerTerminalChannels()
    this.registerMessageChannels()
    this.registerProjectChannels()
    this.registerContextChannels()
    this.registerConfigChannels()
    this.registerWindowChannels()
    this.registerDialogChannels()
    this.registerOrchestratorChannels()
    this.registerMpoChannels()
    this.registerBugreportChannels()
    this.registerVoiceChannels()
    this.registerTaskChannels()
    this.registerInputRequestChannels()
    this.registerPersonaChannels()
    this.registerWorkspaceChannels()
    this.registerNoteChannels()
    this.setupEventForwarding()

    // Start context usage monitor
    this.statusLineMonitor.start()

    // Start Task infrastructure
    if (this.taskManager) {
      const orchConfig = configStore.get('orchestrator')

      this.taskHooks = new TaskHooks(orchConfig?.defaultHooks ? {
        beforeRun: orchConfig.defaultHooks.beforeRun,
        afterRun: orchConfig.defaultHooks.afterRun,
        timeout: orchConfig.defaultHooks.timeout,
      } : undefined)

      this.taskWatcher = new TaskWatcher({
        taskManager: this.taskManager,
        sessionManager: this.sessionManager as any,
        tmuxManager: this.tmux as any,
        watchInterval: orchConfig?.watchInterval,
        defaultStallTimeout: orchConfig?.stallTimeout,
      })
      this.taskWatcher.start()

      // Start bugreport task source
      const sourceConfig = orchConfig?.taskSources?.bugreport
      if (sourceConfig?.enabled !== false) {
        const rawPath = sourceConfig?.path
          ?? path.join(app.getPath('home'), '.config', 'cipher-mux', 'bugreports', 'outbox')
        const outboxPath = rawPath.startsWith('~/')
          ? path.join(app.getPath('home'), rawPath.slice(2))
          : rawPath
        this.bugreportSource = new BugreportTaskSource(outboxPath)
        this.bugreportSource.start((opts) => this.taskManager!.create(opts))
      }
    }

    // Connect tmux control mode, THEN recover sessions.
    // Recovery must wait for connect() so the tmux server is fully
    // available before we enumerate sessions.
    this.tmux.connect().then(() => {
      return this.sessionManager.recover()
    }).then((result) => {
      if (result.orphaned.length > 0 || result.recovered.length > 0) {
        this.windowManager.sendToMainWindow(IPC.SESSIONS_RECOVERY_RESULT, result)
      }
    }).catch((err) => {
      console.error('[IpcHub] tmux connect or session recovery failed:', err)
    })

    // Initial cleanup
    if (this.messageBus) {
      this.messageBus.cleanup()
    }

    // Start MCP server
    const mcpConfig = configStore.get('mcp')
    const port = mcpConfig?.port ?? MCP_DEFAULT_PORT
    const host = mcpConfig?.host ?? MCP_DEFAULT_HOST
    const apiKey = mcpConfig?.apiKey || generateApiKey()
    // Persist generated key
    if (!mcpConfig?.apiKey) {
      configStore.set('mcp', { ...mcpConfig, port, host, apiKey })
    }
    // Inject MCP config into SessionManager for auto-injection into new sessions
    this.sessionManager.setMcpConfig({
      mcpHost: host,
      mcpPort: port,
      mcpApiKey: apiKey,
    })

    this.mcpServer.start(port, host, apiKey, {
      sessionManager: this.sessionManager,
      messageBus: this.messageBus,
      statusLineMonitor: this.statusLineMonitor,
      kickoffOrchestrator: this.kickoffOrchestrator,
      taskManager: this.taskManager,
      inputRequestWatcher: this.inputRequestWatcher,
      windowManager: this.windowManager,
    }).then(() => {
      // Auto-start orchestrator after MCP server is ready
      this.autoStartOrchestrator()
    }).catch((err) => {
      console.error('[IpcHub] MCP server start failed:', err)
    })
  }

  /**
   * Auto-start the Orchestrator session after MCP server is ready.
   * The Claude launch is queued; it fires only after the renderer opens
   * the terminal and reports its real size (TERMINAL_READY).
   */
  private autoStartOrchestrator(): void {
    const mcpConfig = configStore.get('mcp')
    this.sessionManager.startOrchestrator({
      mcpHost: mcpConfig?.host ?? MCP_DEFAULT_HOST,
      mcpPort: mcpConfig?.port ?? MCP_DEFAULT_PORT,
      mcpApiKey: mcpConfig?.apiKey ?? '',
    }).then((session) => {
      console.log(`[IpcHub] Orchestrator auto-started: ${session.id}`)
      // Notify renderer about orchestrator state
      this.windowManager.sendToMainWindow(IPC.ORCHESTRATOR_STARTED, session)
      // Queue Claude launch — fires when renderer reports real size
      try {
        this.sessionManager.queueOrchestratorClaude()
      } catch (err) {
        console.error('[IpcHub] Failed to queue orchestrator claude:', err)
      }
    }).catch((err) => {
      console.error('[IpcHub] Orchestrator auto-start failed:', err)
    })
  }

  getTmuxManager(): TmuxManager {
    return this.tmux
  }

  getSessionManager(): SessionManager {
    return this.sessionManager
  }

  getMcpServer(): McpServerManager {
    return this.mcpServer
  }

  // ─── Event Forwarding to Renderer ──────────────────────
  private setupEventForwarding(): void {
    this.sessionManager.on('session-changed', (session) => {
      this.windowManager.sendToMainWindow(IPC.SESSION_CHANGED, session)
    })

    this.sessionManager.on('session-stopped', (session) => {
      this.windowManager.sendToMainWindow(IPC.SESSION_STOPPED, session)
    })

    this.sessionManager.on('mpo-started', (session) => {
      this.windowManager.sendToMainWindow(IPC.MPO_STARTED, session)
    })

    this.tmux.on('output', (paneId: string, data: string) => {
      this.windowManager.sendToMainWindow(IPC.TERMINAL_DATA, { paneId, data })
    })

    if (this.messageBus) {
      this.messageBus.on('message', (msg) => {
        this.windowManager.sendToMainWindow(IPC.MESSAGE_RECEIVED, msg)
      })
    }

    this.statusLineMonitor.on('usage-updated', (sessionId: string, usage: ContextUsage) => {
      this.windowManager.sendToMainWindow(IPC.CONTEXT_UPDATED, { sessionId, usage })
    })

    this.statusLineMonitor.on('usage-warning', (sessionId: string, usage: ContextUsage) => {
      this.windowManager.sendToMainWindow(IPC.CONTEXT_WARNING, { sessionId, usage })
    })

    this.kickoffOrchestrator.on('kickoff-complete', (event) => {
      // Persist the project's parent directory as a scan path, so that the
      // renderer's post-completion rescan (and any future manual rescan) finds
      // the new project even if it lives outside the default scan paths.
      const projectPath = event.handle.projectDir
      const parentDir = path.dirname(projectPath)
      const appCfg = configStore.get('app')
      const scanPaths = appCfg?.scanPaths ?? []
      if (!scanPaths.includes(parentDir)) {
        configStore.set('app', { ...appCfg, scanPaths: [...scanPaths, parentDir] })
      }

      // Pre-populate cachedProjects so the new project shows up immediately
      // without waiting for the renderer's rescan round-trip.
      this.projectScanner.inspectProject(projectPath).then((projectInfo) => {
        if (projectInfo) {
          this.cachedProjects = this.cachedProjects.filter((p) => p.path !== projectInfo.path)
          this.cachedProjects.push(projectInfo)
          this.cachedProjects.sort((a, b) => a.name.localeCompare(b.name))
        }
      }).catch((err) => {
        console.warn('[IpcHub] kickoff-complete: inspectProject failed:', err)
      })

      this.windowManager.sendToMainWindow(
        IPC.PROJECT_KICKOFF_COMPLETED,
        { status: 'complete', event },
      )
    })

    this.kickoffOrchestrator.on('kickoff-timeout', (data) => {
      this.windowManager.sendToMainWindow(
        IPC.PROJECT_KICKOFF_COMPLETED,
        { status: 'timeout', ...data },
      )
    })

    this.kickoffOrchestrator.on('kickoff-error', (data) => {
      this.windowManager.sendToMainWindow(
        IPC.PROJECT_KICKOFF_COMPLETED,
        {
          status: 'error',
          handle: data.handle,
          error: data.error instanceof Error ? data.error.message : String(data.error),
        },
      )
    })

    // Task events → renderer
    if (this.taskManager) {
      this.taskManager.on('task:created', (task) => {
        this.windowManager.sendToMainWindow(IPC.TASK_CREATED, task)
      })
      this.taskManager.on('task:state-changed', (task, previousState) => {
        this.windowManager.sendToMainWindow(IPC.TASK_STATE_CHANGED, { task, previousState })
      })
    }

    // Completion verification hooks
    if (this.taskManager && this.taskHooks) {
      const tm = this.taskManager
      const hooks = this.taskHooks
      tm.on('task:state-changed', async (task) => {
        if (task.state === 'validating') {
          const session = task.sessionId ? this.sessionManager.get(task.sessionId) : null
          const projectPath = session?.projectPath ?? '/tmp'
          const result = await hooks.runAfterRun(task, projectPath)
          if (result.success) {
            tm.markCompleted(task.id, {
              summary: result.stdout.slice(0, 500), exitCode: result.exitCode,
            })
          } else {
            tm.markFailed(task.id, {
              error: result.timedOut ? 'hook timed out' : `hook failed: ${result.stderr.slice(0, 500)}`,
            })
          }
        }
      })
    }
  }

  // ─── Sessions ──────────────────────────────────────────
  private registerSessionChannels(): void {
    ipcMain.handle(IPC.SESSIONS_LIST, async () => {
      return this.sessionManager.list()
    })

    ipcMain.handle(IPC.SESSIONS_START, async (_e, opts: StartSessionOpts) => {
      return this.sessionManager.start(opts)
    })

    ipcMain.handle(IPC.SESSIONS_STOP, async (_e, { sessionId }: { sessionId: string }) => {
      await this.sessionManager.stop(sessionId)
      return { ok: true }
    })

    ipcMain.handle(IPC.SESSIONS_RECOVER, async () => {
      return this.sessionManager.recover()
    })

    ipcMain.handle(IPC.SESSIONS_RECOVERY_ACTION, async (_e, { action, tmuxSession, displayName }: {
      action: 'adopt' | 'kill'
      tmuxSession: string
      displayName?: string
    }) => {
      if (action === 'adopt') {
        return this.sessionManager.adoptOrphan(tmuxSession, displayName)
      } else {
        await this.sessionManager.killOrphan(tmuxSession)
        return { ok: true }
      }
    })

    ipcMain.handle('cipher-mux:sessions:capture', async (_e: any, sessionId: string) => {
      try {
        const content = await this.sessionManager.capture(sessionId)
        if (!content) return null
        const lines = content.split('\n').filter((l: string) => l.trim())
        return lines.slice(-5).join('\n')
      } catch {
        return null
      }
    })
  }

  // ─── Terminal ──────────────────────────────────────────
  private registerTerminalChannels(): void {
    ipcMain.on(IPC.TERMINAL_WRITE, (_e, { paneId, data }: { paneId: string; data: string }) => {
      this.sessionManager.sendKeys(paneId, data).catch((err) => {
        console.error('terminal write error:', err)
      })
    })

    ipcMain.on(IPC.TERMINAL_RESIZE, (_e, { paneId, cols, rows }: { paneId: string; cols: number; rows: number }) => {
      this.sessionManager.resize(paneId, cols, rows).catch((err) => {
        console.error('terminal resize error:', err)
      })
    })

    ipcMain.handle(IPC.TERMINAL_SPLIT, async (_e, { paneId, direction }: { paneId: string; direction: string }) => {
      const session = this.sessionManager.get(paneId)
      if (!session) return { error: 'Session not found' }
      const target = session.tmuxPane ?? session.tmuxSession
      const newPaneId = await this.tmux.splitPane(target, direction as 'horizontal' | 'vertical')
      return { paneId: newPaneId }
    })

    ipcMain.handle(IPC.TERMINAL_CAPTURE, async (_e, { paneId, lines }: { paneId: string; lines?: number }) => {
      return this.sessionManager.capture(paneId, lines)
    })

    ipcMain.on(IPC.TERMINAL_READY, (_e, { paneId, cols, rows }: { paneId: string; cols: number; rows: number }) => {
      this.sessionManager.markReady(paneId, cols, rows).catch((err) => {
        console.error('terminal ready error:', err)
      })
    })
  }

  // ─── Messages ──────────────────────────────────────────
  private registerMessageChannels(): void {
    ipcMain.handle(IPC.MESSAGES_SEND, async (_e, msg: SendMessage) => {
      if (!this.messageBus) return { error: 'MessageBus not available' }
      return this.messageBus.send(msg)
    })

    ipcMain.handle(IPC.MESSAGES_LIST, async (_e, opts?: { topic?: Topic; limit?: number; before?: number }) => {
      if (!this.messageBus) return []
      if (opts?.topic) {
        return this.messageBus.getByTopic(opts.topic, opts.limit, opts.before)
      }
      return this.messageBus.getAll(opts?.limit, opts?.before)
    })

    ipcMain.handle(IPC.MESSAGES_UNREAD, async () => {
      if (!this.messageBus) return 0
      return this.messageBus.unreadCount('renderer')
    })

    ipcMain.handle(IPC.MESSAGES_MARK_READ, async (_e, { messageIds }: { messageIds: string[] }) => {
      if (!this.messageBus) return { ok: false }
      this.messageBus.markRead(messageIds, 'renderer')
      return { ok: true }
    })
  }

  // ─── Projects ──────────────────────────────────────────
  private registerProjectChannels(): void {
    ipcMain.handle(IPC.PROJECTS_LIST, async () => {
      return this.cachedProjects
    })

    ipcMain.handle(IPC.PROJECTS_SCAN, async () => {
      const appConfig = configStore.get('app')
      const scanPaths = appConfig?.scanPaths ?? []
      const scanDepth = appConfig?.scanDepth ?? 1
      this.cachedProjects = await this.projectScanner.scan(scanPaths, scanDepth)
      return this.cachedProjects
    })

    ipcMain.handle(IPC.PROJECTS_KICKOFF, async (_e, req: KickoffRequest) => {
      const handle = await this.kickoffOrchestrator.start(req)
      return handle
    })
  }

  // ─── Context ───────────────────────────────────────────
  private registerContextChannels(): void {
    ipcMain.handle(IPC.CONTEXT_GET, async (_e, { sessionId }: { sessionId: string }) => {
      return this.statusLineMonitor.get(sessionId) ?? null
    })

    ipcMain.handle(IPC.CONTEXT_ALL, async () => {
      const map = this.statusLineMonitor.getAll()
      const result: Record<string, ContextUsage> = {}
      for (const [key, value] of map) {
        result[key] = value
      }
      return result
    })
  }

  // ─── Config ────────────────────────────────────────────
  private registerConfigChannels(): void {
    ipcMain.handle(IPC.CONFIG_GET, async (_e, { key }: { key: string }) => {
      return configStore.get(key as any)
    })

    ipcMain.handle(IPC.CONFIG_SET, async (_e, { key, value }: { key: string; value: unknown }) => {
      configStore.set(key as any, value as any)
      return { ok: true }
    })

    ipcMain.handle(IPC.CONFIG_SAVE_GRID, (_event, grid) => {
      const ui = configStore.get('ui')
      configStore.set('ui', { ...ui, grid })
    })

    ipcMain.handle('cipher-mux:config:get-skip-permissions', () => {
      const agent = configStore.get('agent') as any
      return agent?.skipPermissions ?? false
    })

    ipcMain.handle('cipher-mux:config:set-skip-permissions', (_e: any, value: boolean) => {
      const agent = (configStore.get('agent') as any) ?? {}
      configStore.set('agent' as any, { ...agent, skipPermissions: value })
      return { ok: true }
    })
  }

  // ─── Window ─────────────────────────────────────────────
  private registerWindowChannels(): void {
    ipcMain.handle(IPC.WINDOW_FIT_GRID, (_e, { cols, rows, panelWidth: extraPanels }: { cols: number; rows: number; panelWidth?: number }) => {
      const win = this.windowManager.getMainWindow()
      if (!win) return
      const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
      const targetCellWidth = 664
      const panels = extraPanels ?? 280 // default: chatroom only
      const padding = 20
      const idealWidth = cols * targetCellWidth + panels + padding
      // Height: fixed cell height × rows + chrome
      const cellHeight = 380 // SESSION_CELL_HEIGHT
      const chromeHeight = 38 + 28 // drag region + status bar
      const gridPadding = 12 // 6px padding top+bottom on .session-grid-area
      const gridGaps = (rows - 1) * 4 // 4px gap between rows
      const idealHeight = rows * cellHeight + chromeHeight + gridPadding + gridGaps
      // Cap to screen dimensions — grid scrolls when content exceeds window
      const newWidth = Math.min(idealWidth, screenW)
      const newHeight = Math.min(idealHeight, screenH)
      // Set minSize first — otherwise shrinking is blocked by old minimum
      win.setMinimumSize(Math.min(newWidth, screenW), Math.min(newHeight, screenH))
      win.setSize(newWidth, newHeight)
    })

    ipcMain.handle(IPC.WINDOW_OPEN_WORKSPACES, (_e, initialTab?: string) => {
      this.windowManager.openWorkspacesWindow(initialTab as 'workspaces' | 'personas' | undefined)
    })

    ipcMain.handle(IPC.SIDEBAR_DETACH, () => {
      this.windowManager.openSidebarWindow()
      configStore.set('sidebarDetached', true)
      return { ok: true }
    })

    ipcMain.handle(IPC.SIDEBAR_REATTACH, () => {
      this.windowManager.closeSidebarWindow()
      configStore.set('sidebarDetached', false)
      return { ok: true }
    })

    ipcMain.handle('cipher-mux:sidebar:is-detached', () => {
      return configStore.get('sidebarDetached') ?? false
    })
  }

  // ─── Dialogs ────────────────────────────────────────────
  private registerDialogChannels(): void {
    ipcMain.handle(IPC.DIALOG_OPEN_FILE, async (_e, opts?: { title?: string; filters?: Electron.FileFilter[] }) => {
      const win = this.windowManager.getMainWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        title: opts?.title ?? 'Select File',
        properties: ['openFile'],
        filters: opts?.filters,
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    })

    ipcMain.handle(IPC.DIALOG_OPEN_DIR, async (_e, opts?: { title?: string }) => {
      const win = this.windowManager.getMainWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        title: opts?.title ?? 'Select Directory',
        properties: ['openDirectory', 'createDirectory'],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    })
  }

  // ─── Orchestrator ────────────────────────────────────────
  private registerOrchestratorChannels(): void {
    ipcMain.handle(IPC.ORCHESTRATOR_START, async () => {
      const mcpConfig = configStore.get('mcp')
      const session = await this.sessionManager.startOrchestrator({
        mcpHost: mcpConfig?.host ?? MCP_DEFAULT_HOST,
        mcpPort: mcpConfig?.port ?? MCP_DEFAULT_PORT,
        mcpApiKey: mcpConfig?.apiKey ?? '',
      })
      // Queue Claude launch — fires when renderer reports real terminal size
      try {
        this.sessionManager.queueOrchestratorClaude()
      } catch (err) {
        console.error('[IpcHub] Failed to queue orchestrator claude:', err)
      }
      return session
    })

    ipcMain.handle(IPC.ORCHESTRATOR_STOP, async () => {
      await this.sessionManager.stopOrchestrator()
      return { ok: true }
    })

    ipcMain.handle(IPC.ORCHESTRATOR_STATUS, async () => {
      return {
        running: this.sessionManager.isOrchestratorRunning(),
        sessionId: this.sessionManager.getOrchestratorSessionId(),
      }
    })
  }

  // ─── MPO ─────────────────────────────────────────────
  private registerMpoChannels(): void {
    ipcMain.handle(IPC.MPO_START, async () => {
      const mcpConfig = configStore.get('mcp')
      const session = await this.sessionManager.startMpo({
        mcpHost: mcpConfig?.host ?? MCP_DEFAULT_HOST,
        mcpPort: mcpConfig?.port ?? MCP_DEFAULT_PORT,
        mcpApiKey: mcpConfig?.apiKey ?? '',
      })
      try {
        this.sessionManager.queueMpoClaude()
      } catch (err) {
        console.error('[IpcHub] Failed to queue MPO claude:', err)
      }
      return session
    })

    ipcMain.handle(IPC.MPO_STOP, async () => {
      await this.sessionManager.stopMpo()
      return { ok: true }
    })

    ipcMain.handle(IPC.MPO_STATUS, async () => {
      return {
        running: this.sessionManager.isMpoRunning(),
        sessionId: this.sessionManager.getMpoSessionId(),
      }
    })
  }

  // ─── Bugreport ─────────────────────────────────────────
  private registerBugreportChannels(): void {
    ipcMain.handle(IPC.BUGREPORT_COLLECT, async () => {
      return this.bugreportManager.collectDiagnostics(this.sessionManager.list())
    })

    ipcMain.handle(IPC.BUGREPORT_SUBMIT, async (_e, { description, project, screenshots }: {
      description: string
      project?: string
      screenshots?: string[]
    }) => {
      const id = await this.bugreportManager.submit(description, this.sessionManager.list(), project, undefined, screenshots)
      return { id }
    })

    ipcMain.handle(IPC.BUGREPORT_ENRICH, async (_event, { description }: { description: string }) => {
      return this.bugreportManager.enrich(description)
    })

    ipcMain.handle(IPC.BUGREPORT_PICK_SCREENSHOT, async () => {
      const { dialog } = await import('electron')
      const result = await dialog.showOpenDialog({
        title: 'Screenshots anhängen',
        filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
        properties: ['openFile', 'multiSelections'],
      })
      return result.canceled ? [] : result.filePaths
    })
  }

  // ─── Voice ──────────────────────────────────────────────
  private registerVoiceChannels(): void {
    ipcMain.handle(IPC.VOICE_AVAILABLE, () => {
      console.log('[Voice] VOICE_AVAILABLE check starting...')
      const fs = require('fs')

      // ── Step 1: Check whisper.node native module ──
      // require.resolve only checks file resolution, NOT ABI compatibility.
      // We try a full require() to catch ABI mismatch errors (e.g. module
      // compiled for Node.js but loaded in Electron, or vice versa).
      // Fix: npm run rebuild:voice  (rebuilds native modules for Electron ABI)
      try {
        require.resolve('@fugood/whisper.node')
        console.log('[Voice] whisper.node: resolved')
      } catch {
        console.log('[Voice] whisper.node: NOT installed')
        return {
          available: false,
          reason: 'whisper.node nicht installiert — npm install @fugood/whisper.node && npm run rebuild:voice',
        }
      }

      // Try actual native load to detect ABI mismatch
      try {
        require('@fugood/whisper.node')
        console.log('[Voice] whisper.node: loaded OK')
      } catch (err) {
        const msg = (err as Error).message || String(err)
        const isAbiMismatch = msg.includes('was compiled against') || msg.includes('NODE_MODULE_VERSION') || msg.includes('ABI')
        if (isAbiMismatch) {
          console.log('[Voice] whisper.node: ABI mismatch —', msg)
          return {
            available: false,
            reason: 'whisper.node ABI-Mismatch — npm run rebuild:voice',
          }
        }
        console.log('[Voice] whisper.node: load failed —', msg)
        return {
          available: false,
          reason: `whisper.node Ladefehler — npm run rebuild:voice (${msg.slice(0, 80)})`,
        }
      }

      // ── Step 2: sherpa-onnx-node (optional — only for main-process VAD) ──
      try {
        require.resolve('sherpa-onnx-node')
        console.log('[Voice] sherpa-onnx-node: found')
      } catch {
        console.log('[Voice] sherpa-onnx-node: NOT found — skipping (optional for session mode)')
        // sherpa-onnx-node is only needed for VAD in main process (bugreport mode).
        // Session mode uses renderer-side VAD (Silero ONNX via vad-loader.ts).
        // Don't block voice availability for missing sherpa-onnx-node.
      }

      // ── Step 3: Check whisper model file ──
      // Use ~/.config/cipher-mux/ so path is stable regardless of dev vs packaged
      // mode (app.getPath('userData') varies between environments).
      const configBase = path.join(os.homedir(), '.config', 'cipher-mux')
      const modelPath = path.join(configBase, 'models', 'whisper', 'ggml-small.bin')
      if (!fs.existsSync(modelPath)) {
        console.log('[Voice] Whisper model NOT found at:', modelPath)
        return {
          available: false,
          reason: `Whisper-Model fehlt — scripts/download-models.sh ausfuehren`,
        }
      }
      console.log('[Voice] Whisper model found at:', modelPath)
      console.log('[Voice] VOICE_AVAILABLE => true')
      return { available: true }
    })

    ipcMain.handle(IPC.VOICE_START, async () => {
      try {
        // Bugreport interview needs TTS — if a session-mode VoiceManager (skipTTS)
        // is running, shut it down and create a fresh one with TTS enabled.
        if (this.voiceManager) {
          console.log('[Voice] Shutting down existing VoiceManager for bugreport mode')
          this.voiceManager.shutdown()
          this.voiceManager = null as any
        }

        this.voiceManager = new VoiceManager()
        const transport: ConversationTransport = {
          sendStartCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'recording'),
          sendStopCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'processing'),
          sendTranscription: (text) => this.windowManager.sendToMainWindow(IPC.VOICE_TRANSCRIPTION, text),
          sendAudioPlayback: (b64) => this.windowManager.sendToMainWindow(IPC.VOICE_AGENT_AUDIO, b64),
          sendStateChange: (state) => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, state),
          sendStopPlayback: () => this.windowManager.sendToMainWindow(IPC.VOICE_STOP_PLAYBACK, undefined),
          sendGenerationDone: () => this.windowManager.sendToMainWindow(IPC.VOICE_GENERATION_DONE, undefined),
          dispatchStatus: (text: string, level: string) => console.log(`[Voice:${level}] ${text}`),
          cancelStream: () => { /* no LLM stream cancel for bugreport */ },
        }
        this.voiceManager.setTransport(transport)
        await this.voiceManager.init()

        const interview = this.voiceManager.startInterview()
        interview.on('turn-update', (turn: { role: string; content: string }) => {
          // Only forward assistant turns — user turns reach renderer via VOICE_TRANSCRIPTION
          if (turn.role === 'assistant') {
            this.windowManager.sendToMainWindow(IPC.VOICE_AGENT_TEXT, turn.content)
          }
        })
        interview.on('interview-complete', (report) => {
          this.windowManager.sendToMainWindow(IPC.VOICE_INTERVIEW_DONE, report)
        })
        interview.on('error', (err) => {
          this.windowManager.sendToMainWindow(IPC.VOICE_ERROR, (err as Error).message)
        })
        interview.start()
        return { ok: true }
      } catch (err) {
        const msg = (err as Error).message
        // Reset voice manager on init failure so next attempt retries from scratch
        if (this.voiceManager && !this.voiceManager.isInitialized()) {
          this.voiceManager.shutdown()
          this.voiceManager = undefined as any
        }
        this.windowManager.sendToMainWindow(IPC.VOICE_ERROR, msg)
        return { ok: false, error: msg }
      }
    })

    ipcMain.handle(IPC.VOICE_STOP, () => {
      this.voiceManager?.getConversation()?.handleToggle()
      return { ok: true }
    })

    ipcMain.on(IPC.VOICE_AUDIO_CHUNK, (_event, chunk: ArrayBuffer) => {
      this.voiceManager?.getConversation()?.receiveAudioChunk(chunk)
    })

    ipcMain.on(IPC.VOICE_PLAYBACK_DONE, () => {
      this.voiceManager?.getConversation()?.onPlaybackComplete()
    })

    ipcMain.on(IPC.VOICE_VAD_SPEECH_START, () => {
      console.log('[Voice] IPC: VAD_SPEECH_START received, voiceManager:', !!this.voiceManager)
      this.voiceManager?.onVADSpeechStart()
    })

    ipcMain.on(IPC.VOICE_VAD_SPEECH_END, (_event, audioData: number[]) => {
      console.log('[Voice] IPC: VAD_SPEECH_END received, samples:', audioData?.length)
      this.voiceManager?.onVADSpeechEnd(audioData)
    })

    ipcMain.on(IPC.VOICE_VAD_MISFIRE, () => {
      console.log('[Voice] IPC: VAD_MISFIRE received')
      this.voiceManager?.onVADMisfire()
    })

    // ── Session Voice Mode ──

    ipcMain.handle(IPC.VOICE_START_SESSION, async () => {
      console.log('[Voice] VOICE_START_SESSION handler invoked')
      try {
        // Session mode needs skipTTS — if a bugreport VoiceManager (with TTS)
        // is running, shut it down and create a fresh one without TTS.
        if (this.voiceManager) {
          console.log('[Voice] Shutting down existing VoiceManager for session mode')
          this.voiceManager.shutdown()
          this.voiceManager = null as any
        }

        console.log('[Voice] Creating new VoiceManager (skipTTS: true)')
        this.voiceManager = new VoiceManager({ skipTTS: true })
        const transport: ConversationTransport = {
          sendStartCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'recording'),
          sendStopCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'processing'),
          sendTranscription: (text) => this.windowManager.sendToMainWindow(IPC.VOICE_TRANSCRIPTION, text),
          sendAudioPlayback: () => {},
          sendStateChange: (state) => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, state),
          sendStopPlayback: () => {},
          sendGenerationDone: () => {},
          dispatchStatus: (text: string, level: string) => console.log(`[Voice:${level}] ${text}`),
          cancelStream: () => {},
        }
        this.voiceManager.setTransport(transport)
        await this.voiceManager.init()

        console.log('[Voice] Starting session mode...')
        const inputRouter = this.voiceManager.startSessionMode(this.sessionManager)
        inputRouter.on('dispatched', (data: { sessionId: string; sessionName: string; text: string }) => {
          console.log('[Voice] Dispatched to session:', data.sessionName, 'text:', data.text.slice(0, 80))
          this.windowManager.sendToMainWindow(IPC.VOICE_DISPATCHED, data)
        })
        inputRouter.on('error', (data: { code: string; message: string }) => {
          console.log('[Voice] InputRouter error:', data.code, data.message)
          this.windowManager.sendToMainWindow(IPC.VOICE_ERROR, data.message)
        })
        console.log('[Voice] VOICE_START_SESSION => ok')
        return { ok: true }
      } catch (err) {
        const msg = (err as Error).message
        if (this.voiceManager && !this.voiceManager.isInitialized()) {
          this.voiceManager.shutdown()
          this.voiceManager = null
        }
        this.windowManager.sendToMainWindow(IPC.VOICE_ERROR, msg)
        return { ok: false, error: msg }
      }
    })

    ipcMain.on(IPC.VOICE_SET_ROUTING_MODE, (_event, { mode }: { mode: 'session' | 'off' }) => {
      this.voiceManager?.getInputRouter()?.setMode(mode)
    })

    ipcMain.on(IPC.VOICE_SESSION_TARGET, (_event, { sessionId }: { sessionId: string | null }) => {
      this.voiceManager?.getInputRouter()?.setFocusedSession(sessionId)
    })
  }

  // ─── Tasks ────────────────────────────────────────────
  private registerTaskChannels(): void {
    if (!this.taskManager) return

    ipcMain.handle(IPC.TASKS_LIST, async (_e, filter?: any) => {
      return this.taskManager!.list(filter)
    })

    ipcMain.handle(IPC.TASKS_GET, async (_e, { id }: { id: string }) => {
      const task = this.taskManager!.get(id)
      if (!task) return { task: null, children: [] }
      const children = this.taskManager!.children(id)
      return { task, children }
    })

    ipcMain.handle(IPC.TASKS_RETRY, async (_e, { id }: { id: string }) => {
      return this.taskManager!.retry(id)
    })

    ipcMain.handle(IPC.TASKS_CANCEL, async (_e, { id }: { id: string }) => {
      return this.taskManager!.markFailed(id, { error: 'cancelled by user' })
    })
  }

  // ─── Input Requests (MPO) ─────────────────────────────
  private registerInputRequestChannels(): void {
    const INPUT_REQUESTS_PATH = BRAND.inputRequestsPath
      || path.join(BRAND.mpoDir.replace(/^~/, os.homedir()), 'input-requests.json')

    // Always register the handler so renderer doesn't get "No handler" errors
    if (!INPUT_REQUESTS_PATH) {
      console.warn('[IpcHub] inputRequestsPath is empty — InputRequestWatcher disabled. Check BUILD_PROFILE env var.')
      ipcMain.handle(IPC.MPO_INPUT_REQUESTS, () => ({ requests: [] }))
      return
    }

    this.inputRequestWatcher = new InputRequestWatcher(INPUT_REQUESTS_PATH)

    // Forward changes to renderer
    this.inputRequestWatcher.on('requests-changed', (requests: any[]) => {
      this.windowManager.sendToMainWindow(IPC.MPO_INPUT_REQUESTS, { requests })
    })

    this.inputRequestWatcher.on('request-update', (update: any) => {
      this.windowManager.sendToMainWindow(IPC.MPO_REQUEST_UPDATE, update)
    })

    this.inputRequestWatcher.start()

    // Get all requests
    ipcMain.handle(IPC.MPO_INPUT_REQUESTS, () => {
      return { requests: this.inputRequestWatcher?.getRequests() ?? [] }
    })

    // Answer a request
    ipcMain.handle(IPC.MPO_REQUEST_ANSWERED, (_e, { id, answer }: { id: string; answer: string }) => {
      this.inputRequestWatcher?.answerRequest(id, answer)
      return { ok: true }
    })

    // Open review file in system editor (platform-aware)
    ipcMain.handle(IPC.MPO_OPEN_REVIEW, async (_e, { filePath }: { filePath: string }) => {
      const { execFile } = await import('child_process')
      return new Promise((resolve) => {
        if (process.platform === 'darwin') {
          execFile('open', ['-a', 'CotEditor', filePath], (err) => {
            resolve({ ok: !err, error: err?.message })
          })
        } else {
          // Linux: use xdg-open as fallback
          execFile('xdg-open', [filePath], (err) => {
            resolve({ ok: !err, error: err?.message })
          })
        }
      })
    })
  }

  // ─── Personas ─────────────────────────────────────────
  private registerPersonaChannels(): void {
    ipcMain.handle(IPC.PERSONAS_LIST, () => {
      return configStore.get('personas')
    })

    ipcMain.handle(IPC.PERSONAS_SAVE, (_e, persona: Persona) => {
      const personas = [...configStore.get('personas')]
      const idx = personas.findIndex(p => p.id === persona.id)
      if (idx >= 0) {
        // Preserve builtin flag — users can't promote/demote
        personas[idx] = { ...persona, builtin: personas[idx].builtin }
      } else {
        personas.push({ ...persona, builtin: false })
      }
      configStore.set('personas', personas)
      return { ok: true }
    })

    ipcMain.handle(IPC.PERSONAS_DELETE, (_e, personaId: string) => {
      const personas = configStore.get('personas')
      const target = personas.find(p => p.id === personaId)
      if (target?.builtin) return { ok: false, error: 'Cannot delete built-in persona' }
      configStore.set('personas', personas.filter(p => p.id !== personaId))
      return { ok: true }
    })
  }

  // ─── Workspaces ───────────────────────────────────────
  private registerWorkspaceChannels(): void {
    ipcMain.handle(IPC.WORKSPACES_LIST, () => {
      return configStore.get('workspaces')
    })

    ipcMain.handle(IPC.WORKSPACES_SAVE, (_e, workspace: Workspace) => {
      const workspaces = [...configStore.get('workspaces')]
      const idx = workspaces.findIndex(w => w.id === workspace.id)
      if (idx >= 0) workspaces[idx] = workspace
      else workspaces.push(workspace)
      configStore.set('workspaces', workspaces)
      return { ok: true }
    })

    ipcMain.handle(IPC.WORKSPACES_DELETE, (_e, workspaceId: string) => {
      const workspaces = configStore.get('workspaces')
      configStore.set('workspaces', workspaces.filter(w => w.id !== workspaceId))
      return { ok: true }
    })

    ipcMain.handle(IPC.WORKSPACES_APPLY, async (_e, workspaceId: string) => {
      const workspaces = configStore.get('workspaces')
      const ws = workspaces.find(w => w.id === workspaceId)
      if (!ws) return { applied: false, sessionsStarted: 0, warnings: ['Workspace not found'] }

      const personas = configStore.get('personas')
      const result = await applyWorkspace(ws, personas, this.sessionManager, (cols, rows) => {
        this.windowManager.sendToMainWindow(IPC.SESSION_CHANGED, { gridResize: { cols, rows } })
      })

      configStore.set('activeWorkspaceId', workspaceId)
      return result
    })

    ipcMain.handle(IPC.WORKSPACES_ACTIVE, (_e, id?: string) => {
      if (id !== undefined) {
        configStore.set('activeWorkspaceId', id)
      }
      return configStore.get('activeWorkspaceId')
    })
  }

  // ─── Notes ─────────────────────────────────────────────
  private registerNoteChannels(): void {
    ipcMain.handle(IPC.NOTES_LIST, async (_e, { scope }: { scope?: string }) => {
      if (scope) return this.noteManager.list(scope)
      return this.noteManager.listAll()
    })

    ipcMain.handle(IPC.NOTES_READ, async (_e, { id, scope }: { id: string; scope: string }) => {
      return this.noteManager.read(id, scope)
    })

    ipcMain.handle(IPC.NOTES_SAVE, async (_e, { id, scope, body, tags }: {
      id: string; scope: string; body: string; tags?: string[]
    }) => {
      const note = await this.noteManager.save(id, scope, body, tags)
      this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'updated', note })
      // Async auto-tagging (fire-and-forget, only on manual save)
      if (!tags) {
        this.noteTagging.autoTag(body).then(async (autoTags) => {
          if (autoTags && autoTags.length > 0) {
            const updated = await this.noteManager.save(id, scope, body, autoTags)
            this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'tagged', note: updated })
          }
        }).catch(() => { /* Ollama not available — ignore */ })
      }
      return note
    })

    ipcMain.handle(IPC.NOTES_CREATE, async (_e, { scope, title, body }: {
      scope: string; title: string; body: string
    }) => {
      const note = await this.noteManager.create(scope, title, body)
      this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'created', note })
      return note
    })

    ipcMain.handle(IPC.NOTES_DELETE, async (_e, { id, scope }: { id: string; scope: string }) => {
      const ok = await this.noteManager.delete(id, scope)
      if (ok) {
        this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'deleted', id, scope })
      }
      return { ok }
    })

    ipcMain.handle(IPC.NOTES_TAGS, async () => {
      return this.noteTagging.getTagRepository()
    })
  }

  async destroy(): Promise<void> {
    this.noteManager.destroy()
    this.inputRequestWatcher?.stop()
    this.bugreportSource?.stop()
    this.taskWatcher?.stop()
    this.voiceManager?.shutdown()
    await this.mcpServer.stop().catch(() => {})
    this.statusLineMonitor.stop()
    this.projectScanner.stopWatch()
    this.kickoffOrchestrator.destroy()
    if (this.messageBus) this.messageBus.destroy()
    await this.sessionManager.destroy()
  }
}
