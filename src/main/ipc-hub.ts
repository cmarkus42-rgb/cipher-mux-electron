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
import { MemoryStore } from './companion/memory-store'
import { TASK_SCHEMA_SQL } from './task/task-schema'
import { AdapterRegistry } from './agent/registry'
import { EntityRegistry, registerBuiltinEntities } from './session/entity-registry'
import { IPC } from '../shared/ipc-channels'
import { MCP_DEFAULT_PORT, MCP_DEFAULT_HOST } from '../shared/constants'
import { BRAND } from '../shared/brand'
import type { StartSessionOpts, SendMessage, Topic, ContextUsage, KickoffRequest, EntityId, Character, RecoveryResult } from '../shared/types'
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
  private memoryStore: MemoryStore | null = null
  private cachedProjects: Awaited<ReturnType<ProjectScanner['scan']>> = []
  private cachedRecoveryResult: RecoveryResult | null = null

  private adapterRegistry: AdapterRegistry

  constructor(private windowManager: WindowManager) {
    this.adapterRegistry = new AdapterRegistry()
    const entityRegistry = new EntityRegistry()
    registerBuiltinEntities(entityRegistry, BRAND.orchestratorDir, BRAND.mpoDir)
    this.tmux = new TmuxManager()
    // Resolve app root for entity asset deployment
    const appRoot = path.resolve(__dirname, '..', '..', '..')
    this.sessionManager = new SessionManager(this.tmux, this.adapterRegistry, entityRegistry, appRoot)
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

    // Initialize Companion MemoryStore
    try {
      const companionDbPath = path.join(os.homedir(), '.config', 'cipher-mux', 'companion.db')
      this.memoryStore = new MemoryStore(companionDbPath)
    } catch (err) {
      console.error('[IpcHub] MemoryStore init failed:', err)
    }

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
    this.registerLlmChannels()
    this.registerVoiceChannels()
    this.registerTaskChannels()
    this.registerInputRequestChannels()
    this.registerPersonaChannels()
    this.registerCharacterChannels()
    this.registerWorkspaceChannels()
    this.registerNoteChannels()
    this.registerGridControlChannels()
    this.registerEntityChannels()
    this.registerCompanionChannels()
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

    // Forward orphan detection events to renderer
    this.sessionManager.on('orphans-detected', (orphans: any[]) => {
      this.windowManager.sendToMainWindow(IPC.SESSION_ORPHANS_DETECTED, orphans)
    })

    // Clear all messages from previous runs — each app start begins with a clean bus
    if (this.messageBus) {
      this.messageBus.clearAll()
    }

    // Start MCP server first — sessions need MCP config injected.
    const mcpConfig = configStore.get('mcp')
    const port = mcpConfig?.port ?? MCP_DEFAULT_PORT
    const host = mcpConfig?.host ?? MCP_DEFAULT_HOST
    const apiKey = mcpConfig?.apiKey || generateApiKey()
    if (!mcpConfig?.apiKey) {
      configStore.set('mcp', { ...mcpConfig, port, host, apiKey })
    }
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
      noteManager: this.noteManager,
      memoryStore: this.memoryStore,
    }).then(() => {
      // MCP ready → connect tmux, recover sessions, then auto-start defaults
      return this.tmux.connect()
    }).then(() => {
      return this.sessionManager.recover()
    }).then((result) => {
      // Cache for pull-based retrieval by the renderer
      this.cachedRecoveryResult = result
      if (result.orphaned.length > 0 || result.recovered.length > 0) {
        this.windowManager.sendToMainWindow(IPC.SESSIONS_RECOVERY_RESULT, result)
      }
      this.sessionManager.startOrphanDetection()
      this.sessionManager.startExitDetection()

      // Only auto-start if no sessions were recovered
      if (result.recovered.length === 0) {
        this.autoStartDefault()
      }
    }).catch((err) => {
      console.error('[IpcHub] startup failed:', err)
      const msg = err?.message ?? String(err)
      if (msg.includes('EADDRINUSE') || msg.includes('already in use')) {
        dialog.showErrorBox(
          'Port Conflict',
          `MCP server could not start: Port ${port} is already in use.\n\nIs another cipher-mux instance running?\n\nThe app will continue without MCP server.`,
        )
      }
    })
  }

  /**
   * Auto-start default sessions when no sessions were recovered.
   *
   * Without default workspace → start only Companion.
   * With default workspace → workspace loading is handled by the renderer
   * (the active workspace ID is persisted in config and loaded on mount).
   *
   * Orchestrator does NOT auto-start — it must be in a workspace or
   * started manually via the StatusBar button.
   */
  private autoStartDefault(): void {
    const activeWorkspaceId = configStore.get('activeWorkspaceId')

    if (activeWorkspaceId) {
      // Workspace is set — renderer will load it via useEffect on mount.
      // Don't auto-start anything here; the workspace apply flow handles it.
      console.log(`[IpcHub] Default workspace "${activeWorkspaceId}" set — renderer will apply it`)
      return
    }

    // No workspace → start Companion only
    console.log('[IpcHub] No default workspace — auto-starting Companion')
    this.sessionManager.startEntity('companion').then((session) => {
      console.log(`[IpcHub] Companion auto-started: ${session.id}`)
      this.windowManager.sendToMainWindow(IPC.ENTITY_STARTED, {
        entityId: 'companion',
        session,
      })
      try {
        this.sessionManager.queueEntityClaude('companion')
        this.sessionManager.scheduleStartupGreeting('companion')
      } catch (err) {
        console.error('[IpcHub] Failed to queue companion claude:', err)
      }
    }).catch((err) => {
      console.error('[IpcHub] Companion auto-start failed:', err)
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

    this.sessionManager.on('entity-started', (data: { entityId: string; session: unknown }) => {
      this.windowManager.sendToMainWindow(IPC.ENTITY_STARTED, data)
      // Start voice output routing when voice-relay entity starts
      if (data.entityId === 'voice-relay' && this.voiceManager) {
        this.voiceManager.startOutputRouting()
      }
    })

    this.sessionManager.on('entity-stopped', (data: { entityId: string }) => {
      // Stop voice output routing when voice-relay entity stops
      if (data.entityId === 'voice-relay' && this.voiceManager) {
        this.voiceManager.stopOutputRouting()
      }
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

    this.statusLineMonitor.on('claude-session-id', (sessionId: string, claudeSessionId: string) => {
      this.sessionManager.updateClaudeSessionId(sessionId, claudeSessionId)
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
      // Return cached recovery result (from startup) instead of re-running
      // recover(), which would double-register sessions.
      return this.cachedRecoveryResult
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

    ipcMain.handle(IPC.SESSIONS_RECOVERY_DECLINE, async () => {
      // User declined session restore — kill all recovered sessions and auto-start defaults
      if (this.cachedRecoveryResult) {
        for (const session of this.cachedRecoveryResult.recovered) {
          try {
            await this.sessionManager.stop(session.id)
          } catch {
            // Session may already be gone
          }
        }
        this.cachedRecoveryResult = null
      }
      this.autoStartDefault()
      return { ok: true }
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

    ipcMain.handle(IPC.SESSION_FORK, async (_e, { sessionId }: { sessionId: string }) => {
      return this.sessionManager.forkSession(sessionId)
    })

    ipcMain.handle(IPC.SESSION_ORPHANS, async () => {
      return this.sessionManager.detectOrphans()
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
      // Broadcast theme changes to all windows (sidebar, workspaces)
      if (key === 'ui' && value && typeof value === 'object') {
        const ui = value as Record<string, unknown>
        if (ui.theme !== undefined) {
          this.windowManager.sendToAllWindows(IPC.THEME_CHANGED, {
            theme: ui.theme,
            activeCustomThemeId: ui.activeCustomThemeId ?? null,
            customThemeTokens: ui.customThemeTokens ?? null,
          })
        }
      }
      return { ok: true }
    })

    ipcMain.handle(IPC.CONFIG_SAVE_GRID, (_event, grid) => {
      const ui = configStore.get('ui')
      configStore.set('ui', { ...ui, grid })
      // Also persist grid state + slot assignments to SessionStore for recovery
      if (grid?.config && grid?.slots) {
        this.sessionManager.persistGridState({
          config: grid.config,
          slots: grid.slots,
        })
      }
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
      // Map legacy 'personas' tab to 'companion'
      const tab = initialTab === 'personas' ? 'companion' : initialTab
      this.windowManager.openWorkspacesWindow(tab as 'workspaces' | 'companion' | 'tags' | undefined)
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

    ipcMain.handle(IPC.DIALOG_OPEN_DIR, async (_e, opts?: { title?: string; defaultPath?: string }) => {
      const win = this.windowManager.getMainWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        title: opts?.title ?? 'Select Directory',
        defaultPath: opts?.defaultPath ?? os.homedir(),
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

    ipcMain.handle(IPC.BUGREPORT_SUBMIT, async (_e, { description, project, screenshots, reportType }: {
      description: string
      project?: string
      screenshots?: string[]
      reportType?: string
    }) => {
      const id = await this.bugreportManager.submit(description, this.sessionManager.list(), project, undefined, screenshots, reportType)
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

  // ─── LLM Provider ─────────────────────────────────────────
  private registerLlmChannels(): void {
    ipcMain.handle(IPC.LLM_TEST_CONNECTION, async (_e, { host, port }: { host?: string; port?: number } = {}) => {
      const { testOllamaConnection } = await import('./bugreport/ollama-client')
      return testOllamaConnection(host, port)
    })

    ipcMain.handle(IPC.LLM_LIST_MODELS, async (_e, { host, port }: { host?: string; port?: number } = {}) => {
      const { listOllamaModels } = await import('./bugreport/ollama-client')
      return listOllamaModels(host, port)
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

    // ── COM Mode (Voice Companion) ──

    ipcMain.handle(IPC.VOICE_START_COM, async () => {
      console.log('[Voice] VOICE_START_COM handler invoked')
      try {
        // Shut down any existing voice manager
        if (this.voiceManager) {
          this.voiceManager.shutdown()
          this.voiceManager = null as any
        }

        // Create VoiceManager WITH TTS for COM mode
        console.log('[Voice] Creating VoiceManager for COM mode (with TTS)')
        this.voiceManager = new VoiceManager({ skipTTS: false })
        const transport: ConversationTransport = {
          sendStartCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'recording'),
          sendStopCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'processing'),
          sendTranscription: (text) => this.windowManager.sendToMainWindow(IPC.VOICE_TRANSCRIPTION, text),
          sendAudioPlayback: () => this.windowManager.sendToMainWindow(IPC.VOICE_COM_STATE, 'speaking'),
          sendStateChange: (state) => {
            this.windowManager.sendToMainWindow(IPC.VOICE_STATE, state)
            this.windowManager.sendToMainWindow(IPC.VOICE_COM_STATE, state)
          },
          sendStopPlayback: () => this.windowManager.sendToMainWindow(IPC.VOICE_COM_STATE, 'idle'),
          sendGenerationDone: () => this.windowManager.sendToMainWindow(IPC.VOICE_COM_STATE, 'idle'),
          dispatchStatus: (text: string, level: string) => console.log(`[Voice:${level}] ${text}`),
          cancelStream: () => {},
        }
        this.voiceManager.setTransport(transport)
        await this.voiceManager.init()

        // Start session mode (which wires input/output routers)
        console.log('[Voice] Starting session mode for COM...')
        const inputRouter = this.voiceManager.startSessionMode(this.sessionManager)
        inputRouter.on('dispatched', (data: { sessionId: string; sessionName: string; text: string }) => {
          console.log('[Voice] COM dispatched to:', data.sessionName, 'text:', data.text.slice(0, 80))
          this.windowManager.sendToMainWindow(IPC.VOICE_DISPATCHED, data)
        })
        inputRouter.on('error', (data: { code: string; message: string }) => {
          this.windowManager.sendToMainWindow(IPC.VOICE_ERROR, data.message)
        })

        // Start voice-relay entity as background session (no grid placement)
        if (!this.sessionManager.isEntityRunning('voice-relay')) {
          console.log('[Voice] Starting voice-relay entity...')
          await this.sessionManager.startEntity('voice-relay')
          // Queue Claude launch + startup greeting for background entity
          try {
            this.sessionManager.queueEntityClaude('voice-relay')
            this.sessionManager.scheduleStartupGreeting('voice-relay')
          } catch (err) {
            console.error('[Voice] Failed to queue voice-relay claude:', err)
          }
          // Output routing is auto-started by entity-started event handler
        } else {
          // Already running — just start output routing
          this.voiceManager.startOutputRouting()
        }

        this.windowManager.sendToMainWindow(IPC.VOICE_COM_STATE, 'idle')
        console.log('[Voice] VOICE_START_COM => ok')
        return { ok: true }
      } catch (err) {
        const msg = (err as Error).message
        console.error('[Voice] VOICE_START_COM error:', msg)
        if (this.voiceManager && !this.voiceManager.isInitialized()) {
          this.voiceManager.shutdown()
          this.voiceManager = null
        }
        this.windowManager.sendToMainWindow(IPC.VOICE_ERROR, msg)
        return { ok: false, error: msg }
      }
    })

    ipcMain.handle(IPC.VOICE_STOP_COM, async () => {
      console.log('[Voice] VOICE_STOP_COM handler invoked')
      try {
        // Stop output routing
        if (this.voiceManager) {
          this.voiceManager.stopOutputRouting()
          this.voiceManager.shutdown()
          this.voiceManager = null
        }
        // Graceful shutdown: send farewell to voice-relay before killing
        if (this.sessionManager.isEntityRunning('voice-relay')) {
          const relaySessionId = this.sessionManager.getEntitySessionId('voice-relay')
          if (relaySessionId) {
            try {
              console.log('[Voice] Sending graceful shutdown to voice-relay...')
              await this.sessionManager.sendKeys(relaySessionId, 'Session wird beendet. Sichere offene Notizen und beende dich.')
              await this.sessionManager.sendKeys(relaySessionId, '\r')
              // Give voice-relay time to process the farewell (max 8s)
              await new Promise(r => setTimeout(r, 8_000))
            } catch (err) {
              console.warn('[Voice] Graceful shutdown message failed:', err)
            }
          }
          await this.sessionManager.stopEntity('voice-relay')
        }
        this.windowManager.sendToMainWindow(IPC.VOICE_COM_STATE, 'idle')
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
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

  // ─── Characters (Companion Persona) ──────────────────
  private registerCharacterChannels(): void {
    ipcMain.handle(IPC.CHARACTERS_LIST, () => {
      return configStore.get('characters')
    })

    ipcMain.handle(IPC.CHARACTERS_ACTIVE, () => {
      const activeId = configStore.get('activeCharacterId')
      const characters = configStore.get('characters')
      return characters.find(c => c.id === activeId) ?? characters[0] ?? null
    })

    ipcMain.handle(IPC.CHARACTERS_SAVE, (_e, character: Character) => {
      const characters = [...configStore.get('characters')]
      const idx = characters.findIndex(c => c.id === character.id)
      const now = new Date().toISOString()
      if (idx >= 0) {
        characters[idx] = { ...character, updatedAt: now }
      } else {
        characters.push({ ...character, isDefault: false, createdAt: now, updatedAt: now })
      }
      configStore.set('characters', characters)
      // Re-sync skill for active character
      const activeId = configStore.get('activeCharacterId')
      if (character.id === activeId) {
        this.syncActiveCharacterSkill()
      }
      return { ok: true }
    })

    ipcMain.handle(IPC.CHARACTERS_DELETE, (_e, characterId: string) => {
      const characters = configStore.get('characters')
      const target = characters.find(c => c.id === characterId)
      if (!target) return { ok: false, error: 'Character not found' }
      if (target.isDefault) return { ok: false, error: 'Cannot delete default character' }
      configStore.set('characters', characters.filter(c => c.id !== characterId))
      // If deleted character was active, switch to default
      if (configStore.get('activeCharacterId') === characterId) {
        const defaultChar = configStore.get('characters').find(c => c.isDefault)
        if (defaultChar) {
          configStore.set('activeCharacterId', defaultChar.id)
          this.syncActiveCharacterSkill()
        }
      }
      return { ok: true }
    })

    ipcMain.handle(IPC.CHARACTERS_SWITCH, (_e, characterId: string) => {
      const characters = configStore.get('characters')
      const target = characters.find(c => c.id === characterId)
      if (!target) return { ok: false, error: 'Character not found' }
      configStore.set('activeCharacterId', characterId)
      this.syncActiveCharacterSkill()
      return { ok: true }
    })
  }

  /** Sync the active character's prompt as a SKILL.md to all project skills directories. */
  private syncActiveCharacterSkill(): void {
    const activeId = configStore.get('activeCharacterId')
    const characters = configStore.get('characters')
    const active = characters.find(c => c.id === activeId)
    if (!active) return

    const { syncCharacterSkill } = require('./workspace/persona-skill-sync')
    // Sync to the app-level skills dir
    const os = require('os')
    const path = require('path')
    const skillsDir = path.join(os.homedir(), '.claude', 'skills', 'personas')
    syncCharacterSkill(active, skillsDir)
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
      try {
        // Always list all notes — global + workspace-scoped.
        // Scope-specific listing missed global notes when a workspace was active.
        return await this.noteManager.listAll()
      } catch (err) {
        console.error('[IpcHub] NOTES_LIST failed:', err)
        return []
      }
    })

    ipcMain.handle(IPC.NOTES_READ, async (_e, { id, scope }: { id: string; scope: string }) => {
      return this.noteManager.read(id, scope)
    })

    ipcMain.handle(IPC.NOTES_SAVE, async (_e, { id, scope, body, tags, skipTagging }: {
      id: string; scope: string; body: string; tags?: string[]; skipTagging?: boolean
    }) => {
      const note = await this.noteManager.save(id, scope, body, tags)
      this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'updated', note })
      // Async auto-tagging (fire-and-forget, only on manual Cmd+S save)
      if (!tags && !skipTagging) {
        this.noteTagging.autoTag(body).then(async (autoTags) => {
          if (autoTags && autoTags.length > 0) {
            await this.noteTagging.updateRepository(autoTags)
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

    ipcMain.handle(IPC.NOTES_TAG_LIST, async () => {
      this.noteTagging.recountTags()
      const repo = this.noteTagging.getTagRepository()
      const tags = Object.entries(repo.tags).map(([name, entry]) => ({
        name,
        count: entry.count,
        description: entry.description,
        isSeed: this.noteTagging.isSeedTag(name),
      }))
      return tags
    })

    ipcMain.handle(IPC.NOTES_TAG_CREATE, async (_e, { name, description }: { name: string; description: string }) => {
      const ok = this.noteTagging.createTag(name, description)
      return { ok }
    })

    ipcMain.handle(IPC.NOTES_TAG_RENAME, async (_e, { oldName, newName }: { oldName: string; newName: string }) => {
      const affected = this.noteTagging.renameTag(oldName, newName)
      if (affected.length > 0) {
        this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'tags-updated' })
      }
      return { ok: affected.length >= 0, affected: affected.length }
    })

    ipcMain.handle(IPC.NOTES_TAG_UPDATE, async (_e, { name, description }: { name: string; description: string }) => {
      const ok = this.noteTagging.updateTagDescription(name, description)
      return { ok }
    })

    ipcMain.handle(IPC.NOTES_TAG_DELETE, async (_e, { name }: { name: string }) => {
      const affected = this.noteTagging.deleteTag(name)
      if (affected.length > 0) {
        this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'tags-updated' })
      }
      return { ok: true, affected: affected.length }
    })
  }

  // ─── Grid Control (MCP App-Control) ─────────────────────
  private registerGridControlChannels(): void {
    ipcMain.handle(IPC.GRID_RESIZE, (_e, { cols, rows }: { cols: number; rows: number }) => {
      this.windowManager.sendToMainWindow(IPC.GRID_RESIZE, { cols, rows })
      return { ok: true }
    })

    ipcMain.handle(IPC.GRID_PLACE, (_e, { sessionId, col, row }: { sessionId: string; col: number; row: number }) => {
      this.windowManager.sendToMainWindow(IPC.GRID_PLACE, { sessionId, col, row })
      return { ok: true }
    })

    ipcMain.handle(IPC.SESSION_FOCUS, (_e, { sessionId }: { sessionId: string }) => {
      this.windowManager.sendToMainWindow(IPC.SESSION_FOCUS, { sessionId })
      return { ok: true }
    })

    ipcMain.handle(IPC.SESSION_EJECT, (_e, { sessionId }: { sessionId: string }) => {
      this.windowManager.sendToMainWindow(IPC.SESSION_EJECT, { sessionId })
      return { ok: true }
    })

    ipcMain.handle(IPC.SIDEBAR_TOGGLE, (_e, { visible }: { visible?: boolean }) => {
      this.windowManager.sendToMainWindow(IPC.SIDEBAR_TOGGLE, { visible })
      return { ok: true }
    })
  }

  // ─── Entity Framework ──────────────────────────────────
  private registerEntityChannels(): void {
    ipcMain.handle(IPC.ENTITY_START, async (_e, { entityId }: { entityId: EntityId }) => {
      const mcpConfig = configStore.get('mcp')
      // Ensure MCP config is set on session manager
      this.sessionManager.setMcpConfig({
        mcpHost: mcpConfig?.host ?? MCP_DEFAULT_HOST,
        mcpPort: mcpConfig?.port ?? MCP_DEFAULT_PORT,
        mcpApiKey: mcpConfig?.apiKey ?? '',
      })
      const session = await this.sessionManager.startEntity(entityId)
      // Queue Claude launch for entity
      try {
        this.sessionManager.queueEntityClaude(entityId)
        this.sessionManager.scheduleStartupGreeting(entityId)
      } catch (err) {
        console.error(`[IpcHub] Failed to queue ${entityId} claude:`, err)
      }
      return session
    })

    ipcMain.handle(IPC.ENTITY_STOP, async (_e, { entityId }: { entityId: EntityId }) => {
      await this.sessionManager.stopEntity(entityId)
      return { ok: true }
    })

    ipcMain.handle(IPC.ENTITY_STATUS, async (_e, { entityId }: { entityId: EntityId }) => {
      return {
        running: this.sessionManager.isEntityRunning(entityId),
        sessionId: this.sessionManager.getEntitySessionId(entityId),
      }
    })

    ipcMain.handle(IPC.ENTITY_LIST, async () => {
      return this.sessionManager.getEntityRegistry().list()
    })
  }

  // ─── Companion Memory ──────────────────────────────────
  private registerCompanionChannels(): void {
    ipcMain.handle(IPC.COMPANION_RECALL, async (_e, { limit }: { limit?: number }) => {
      if (!this.memoryStore) return []
      return this.memoryStore.recall({ limit })
    })

    ipcMain.handle(IPC.COMPANION_LIST_MEMORIES, async (_e, opts?: { limit?: number; kind?: string; since?: number }) => {
      if (!this.memoryStore) return []
      return this.memoryStore.recall({
        limit: opts?.limit,
        kindFilter: opts?.kind as import('../shared/types').MemoryKind | undefined,
        since: opts?.since,
      })
    })

    ipcMain.handle(IPC.COMPANION_SEARCH, async (_e, { query, limit }: { query: string; limit?: number }) => {
      if (!this.memoryStore) return []
      return this.memoryStore.search(query, { limit })
    })

    ipcMain.handle(IPC.COMPANION_DELETE_MEMORY, async (_e, { id }: { id: string }) => {
      if (!this.memoryStore) return { ok: false }
      const deleted = this.memoryStore.forget(id)
      return { ok: deleted }
    })
  }

  async destroy(): Promise<void> {
    this.noteManager.destroy()
    this.memoryStore?.close()
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
