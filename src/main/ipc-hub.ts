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
import { KickoffOrchestrator } from './project/kickoff-orchestrator'
import { BugreportManager } from './bugreport/bugreport-manager'
import { VoiceManager } from './voice/voice-manager'
import type { ConversationTransport } from './voice/conversation-engine'
import { IPC } from '../shared/ipc-channels'
import { MCP_DEFAULT_PORT, MCP_DEFAULT_HOST } from '../shared/constants'
import type { StartSessionOpts, SendMessage, Topic, ContextUsage, KickoffRequest } from '../shared/types'

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
    const appConfig = configStore.get('app')
    this.kickoffOrchestrator = new KickoffOrchestrator({
      sessionManager: this.sessionManager,
      projectlauncherPath: appConfig?.projectlauncherPath
        ?? '/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher',
      timeoutMs: ((appConfig?.kickoffTimeoutMinutes ?? 15) * 60_000),
    })
    this.bugreportManager = new BugreportManager({ messageBus: this.messageBus })
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
    this.registerBugreportChannels()
    this.registerVoiceChannels()
    this.setupEventForwarding()

    // Start context usage monitor
    this.statusLineMonitor.start()

    // Connect tmux control mode
    this.tmux.connect().catch((err) => {
      console.error('[IpcHub] tmux connect failed:', err)
    })

    // Recover orphaned sessions
    this.sessionManager.recover().then((result) => {
      if (result.orphaned.length > 0) {
        this.windowManager.sendToMainWindow(IPC.SESSIONS_RECOVERY_RESULT, result)
      }
    }).catch((err) => {
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
      kickoffOrchestrator: this.kickoffOrchestrator,
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
  }

  // ─── Window ─────────────────────────────────────────────
  private registerWindowChannels(): void {
    ipcMain.handle(IPC.WINDOW_FIT_GRID, (_e, { cols }: { cols: number }) => {
      const win = this.windowManager.getMainWindow()
      if (!win) return
      const cellWidth = 640
      const panelWidth = 280 // chatroom
      const padding = 20
      const newWidth = cols * cellWidth + panelWidth + padding
      const [, currentHeight] = win.getSize()
      // Set minSize first — otherwise shrinking is blocked by old minimum
      win.setMinimumSize(newWidth, 600)
      win.setSize(newWidth, currentHeight)
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
      const fs = require('fs')
      // Check native modules exist (don't import — ABI mismatch crashes)
      try {
        require.resolve('@fugood/whisper.node')
      } catch {
        return { available: false, reason: 'whisper.node nicht installiert' }
      }
      try {
        require.resolve('sherpa-onnx-node')
      } catch {
        return { available: false, reason: 'sherpa-onnx-node nicht installiert' }
      }
      // Check whisper model
      const modelPath = path.join(app.getPath('userData'), 'models', 'whisper', 'ggml-small.bin')
      if (!fs.existsSync(modelPath)) {
        return { available: false, reason: 'Whisper-Model fehlt — scripts/download-models.sh' }
      }
      return { available: true }
    })

    ipcMain.handle(IPC.VOICE_START, async () => {
      try {
        if (!this.voiceManager) {
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
        }

        const interview = this.voiceManager.startInterview()
        interview.on('turn-update', (turn: { role: string; text: string }) => {
          // Only forward assistant turns — user turns reach renderer via VOICE_TRANSCRIPTION
          if (turn.role === 'assistant') {
            this.windowManager.sendToMainWindow(IPC.VOICE_AGENT_TEXT, turn.text)
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
      this.voiceManager?.onVADSpeechStart()
    })

    ipcMain.on(IPC.VOICE_VAD_SPEECH_END, (_event, audioData: number[]) => {
      this.voiceManager?.onVADSpeechEnd(audioData)
    })

    ipcMain.on(IPC.VOICE_VAD_MISFIRE, () => {
      this.voiceManager?.onVADMisfire()
    })
  }

  async destroy(): Promise<void> {
    this.voiceManager?.shutdown()
    await this.mcpServer.stop().catch(() => {})
    this.statusLineMonitor.stop()
    this.projectScanner.stopWatch()
    this.kickoffOrchestrator.destroy()
    if (this.messageBus) this.messageBus.destroy()
    await this.sessionManager.destroy()
  }
}
