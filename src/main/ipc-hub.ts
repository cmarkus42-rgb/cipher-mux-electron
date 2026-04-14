import { app, dialog, ipcMain } from 'electron'
import * as path from 'path'
import { WindowManager } from './window-manager'
import { SessionManager } from './session/session-manager'
import { TmuxManager } from './tmux/tmux-manager'
import { MessageBus } from './message-bus/message-bus'
import { ProjectScanner } from './project/project-scanner'
import { configStore } from './config/config-store'
import { StatusLineMonitor } from './monitoring/statusline-monitor'
import { McpServerManager } from './mcp/mcp-server'
import { generateApiKey } from './mcp/mcp-auth'
import { KickoffManager } from './project/kickoff-manager'
import { IPC } from '../shared/ipc-channels'
import { MCP_DEFAULT_PORT, MCP_DEFAULT_HOST } from '../shared/constants'
import type { StartSessionOpts, SendMessage, Topic, ContextUsage, KickoffOpts } from '../shared/types'

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
  private kickoffManager: KickoffManager
  private cachedProjects: Awaited<ReturnType<ProjectScanner['scan']>> = []

  constructor(private windowManager: WindowManager) {
    this.tmux = new TmuxManager()
    this.sessionManager = new SessionManager(this.tmux)
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
    this.kickoffManager = new KickoffManager()
  }

  init(): void {
    this.registerSessionChannels()
    this.registerTerminalChannels()
    this.registerMessageChannels()
    this.registerProjectChannels()
    this.registerContextChannels()
    this.registerConfigChannels()
    this.registerDialogChannels()
    this.registerOrchestratorChannels()
    this.registerBugreportChannels()
    this.setupEventForwarding()

    // Start context usage monitor
    this.statusLineMonitor.start()

    // Connect tmux control mode
    this.tmux.connect().catch((err) => {
      console.error('[IpcHub] tmux connect failed:', err)
    })

    // Recover orphaned sessions
    this.sessionManager.recover().catch((err) => {
      console.error('[IpcHub] session recovery failed:', err)
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
    }).catch((err) => {
      console.error('[IpcHub] MCP server start failed:', err)
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
      this.cachedProjects = await this.projectScanner.scan(scanPaths)
      return this.cachedProjects
    })

    ipcMain.handle(IPC.PROJECTS_KICKOFF, async (_e, opts: KickoffOpts) => {
      return this.kickoffManager.kickoff(opts)
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

    ipcMain.handle(IPC.CONFIG_SAVE_LAYOUT, async (_e, layout) => {
      configStore.set('ui', { ...configStore.get('ui'), layout })
      return { ok: true }
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
      return this.sessionManager.startOrchestrator({
        mcpHost: mcpConfig?.host ?? MCP_DEFAULT_HOST,
        mcpPort: mcpConfig?.port ?? MCP_DEFAULT_PORT,
        mcpApiKey: mcpConfig?.apiKey ?? '',
      })
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

  // ─── Bugreport ─────────────────────────────────────────
  private registerBugreportChannels(): void {
    ipcMain.handle(IPC.BUGREPORT_COLLECT, async () => {
      return { error: 'Not implemented' }
    })

    ipcMain.handle(IPC.BUGREPORT_EXPORT, async (_e, _opts) => {
      return { error: 'Not implemented' }
    })
  }

  async destroy(): Promise<void> {
    await this.mcpServer.stop().catch(() => {})
    this.statusLineMonitor.stop()
    this.projectScanner.stopWatch()
    if (this.messageBus) this.messageBus.destroy()
    await this.sessionManager.destroy()
  }
}
