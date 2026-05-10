import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import * as fs from 'fs'
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
import { BtShutterManager } from './bluetooth/bt-shutter-manager'
import type { BtShutterEvent, BtShutterStatus } from './bluetooth/bt-shutter-manager'
import type { ConversationTransport } from './voice/conversation-engine'
import { TaskManager } from './task/task-manager'
import { TaskWatcher } from './task/task-watcher'
import { TaskHooks } from './task/task-hooks'
import { BugreportTaskSource } from './task/sources/bugreport-source'
import { NoteManager } from './notes/note-manager'
import { NoteSearchIndex } from './notes/note-search-index'
import { NoteTagging } from './notes/note-tagging'
import { TagClassRepo } from './notes/tag-repository'
import { TagIndex } from './notes/tag-index'
import { MemoryStore } from './companion/memory-store'
import { TestingAssistantManager } from './testing-assistant/testing-assistant-manager'
import { AuditManager } from './audit/audit-manager'
import { generateTestingAssistantClaudeMd } from './testing-assistant/testing-template'
import { generateAuditClaudeMd } from './audit/audit-template'
import { generateDebuggerClaudeMd } from './debugger/debugger-template'
import { generateCyberFactoryClaudeMd } from './cyber-factory/cyber-factory-template'
import { generateWorkshopClaudeMd } from './workshop/workshop-template'
import { syncIdeationTemplate } from './ideation-partner/ideation-template'
import { syncRefinementTemplate } from './refinement/refinement-template'
import { generateVoiceRelayClaudeMd } from './session/voice-relay-template'
import { generateBugreportPresetClaudeMd } from './bugreport/bugreport-preset-template'
import { generateCompanionClaudeMd } from './entity-content/companion-preset'
import { TASK_SCHEMA_SQL } from './task/task-schema'
import { getGlobalRules, setGlobalRules, ensureGlobalRulesFile, invalidateGlobalRulesCache } from './config/global-rules'
import { AdapterRegistry } from './agent/registry'
import { EntityRegistry, registerBuiltinEntities } from './session/entity-registry'
import { CyberFactoryManager } from './cyber-factory/cyber-factory-manager'
import { scanAndRegisterEntities } from './session/entity-scanner'
import { resolvePersonaForPreset } from './session/persona-resolver'
import { resolveSessionTopic } from './session/resolve-session-topic'
import { IPC } from '../shared/ipc-channels'
import { MCP_DEFAULT_PORT, MCP_DEFAULT_HOST, MAX_MANUAL_TAGS } from '../shared/constants'
import { BRAND } from '../shared/brand'
import type { StartSessionOpts, SendMessage, Topic, ContextUsage, KickoffRequest, EntityId, Character, RecoveryResult } from '../shared/types'
import type { Persona, Workspace } from '../shared/persona-types'
import { applyWorkspace } from './workspace/workspace-manager'
import { NoteWatcher } from './notes/note-watcher'
import { checkAll as setupCheckAll } from './setup/dependency-checker'
import { installDependency } from './setup/dependency-installer'
import { deployBundledVoice } from './setup/voice-bundle'
import { checkForUpdate } from './updater/update-checker'

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
  private bugreportRelaySessionId: string | null = null
  private noteManager!: NoteManager
  private noteTagging!: NoteTagging
  private noteSearchIndex!: NoteSearchIndex
  private tagClassRepo!: TagClassRepo
  private tagIndex!: TagIndex
  private noteWatcher!: NoteWatcher
  private memoryStore: MemoryStore | null = null
  private btShutterManager: BtShutterManager | null = null
  private cyberFactoryManager: CyberFactoryManager | null = null
  private testingAssistantManager: TestingAssistantManager | null = null
  private auditManager: AuditManager | null = null
  private cachedProjects: Awaited<ReturnType<ProjectScanner['scan']>> = []
  private cachedRecoveryResult: RecoveryResult | null = null
  private cachedKeepWorkingRestore: {
    gridConfig: { cols: number; rows: number }
    slots: Array<{ sessionId: string | null; slotIndex: number }>
  } | null = null

  private adapterRegistry: AdapterRegistry
  private setupCompleted = false
  private setupCompleteResolve: (() => void) | null = null
  private setupCompletePromise: Promise<void>

  constructor(private windowManager: WindowManager) {
    this.setupCompletePromise = new Promise<void>(resolve => {
      this.setupCompleteResolve = resolve
    })
    this.adapterRegistry = new AdapterRegistry()
    const entityRegistry = new EntityRegistry()
    registerBuiltinEntities(entityRegistry, BRAND.orchestratorDir, BRAND.cyberFactoryDir)
    // Scan ~/.config/cipher-mux/entities/ for additional entity directories
    const scanned = scanAndRegisterEntities(entityRegistry)
    if (scanned.length > 0) {
      console.log(`[IpcHub] Scanned ${scanned.length} additional entities: ${scanned.map(e => e.id).join(', ')}`)
    }
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
    this.noteSearchIndex = new NoteSearchIndex()
    this.tagClassRepo = new TagClassRepo(notesDir)
    this.tagIndex = new TagIndex(notesDir, this.tagClassRepo)
    this.tagIndex.rebuild()
    this.noteWatcher = new NoteWatcher(notesDir, (noteId) => {
      console.log(`[NoteWatcher] External change detected: ${noteId}`)
      this.tagIndex.rebuild()
      this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, {
        action: 'external-update',
        id: noteId,
      })
    })
    this.noteWatcher.start()

    // Initialize Companion MemoryStore
    try {
      const companionDbPath = path.join(os.homedir(), '.config', 'cipher-mux', 'companion.db')
      this.memoryStore = new MemoryStore(companionDbPath)
      this.cyberFactoryManager = new CyberFactoryManager(this.memoryStore)
      const companionDb = this.memoryStore.getDatabase()
      this.testingAssistantManager = new TestingAssistantManager(companionDb)
      this.auditManager = new AuditManager(companionDb)

      // Deploy entity CLAUDE.md templates for all Welle 1-4 entities
      const entitiesBase = path.join(os.homedir(), '.config', 'cipher-mux', 'entities')
      const mcpHost = configStore.get('mcp')?.host ?? MCP_DEFAULT_HOST
      const mcpPort = configStore.get('mcp')?.port ?? MCP_DEFAULT_PORT
      const mcpApiKey = configStore.get('mcp')?.apiKey ?? ''

      const deployEntity = (id: string, content: string) => {
        const dir = path.join(entitiesBase, id)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'CLAUDE.md'), content, 'utf-8')
        // Also write preset.md (source-of-truth for PresetEditor) if missing
        const presetPath = path.join(dir, 'preset.md')
        if (!fs.existsSync(presetPath)) {
          fs.writeFileSync(presetPath, content, 'utf-8')
        }
      }

      deployEntity('testing-assistant', generateTestingAssistantClaudeMd())
      deployEntity('audit', generateAuditClaudeMd())
      deployEntity('debugger', generateDebuggerClaudeMd())
      deployEntity('cyber-factory', generateCyberFactoryClaudeMd({ mcpHost, mcpPort, mcpApiKey }))
      deployEntity('orchestrator', generateWorkshopClaudeMd({ mcpHost, mcpPort, mcpApiKey }))
      deployEntity('voice-relay', generateVoiceRelayClaudeMd())
      deployEntity('bugreport', generateBugreportPresetClaudeMd())
      deployEntity('companion', generateCompanionClaudeMd())

      // Sync experimental templates (ideation + refinement)
      const exp = configStore.get('experimental') ?? {}
      syncIdeationTemplate(exp.ideation_partner !== false)
      syncRefinementTemplate(exp.refinement_v2 !== false)

      // Hide legacy entity directories (prevent scanner from picking them up)
      for (const legacyId of ['mpo', 'watchdog', 'projectlauncher', 'ideationpartner']) {
        const legacyDir = path.join(entitiesBase, legacyId)
        if (fs.existsSync(legacyDir) && !fs.existsSync(path.join(legacyDir, '.hidden'))) {
          fs.writeFileSync(path.join(legacyDir, '.hidden'), 'Replaced by Cyber Factory Pack. Delete this directory to fully remove.\n', 'utf-8')
        }
      }
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
    this.registerScreenshotChannel()
    this.registerTerminalChannels()
    this.registerMessageChannels()
    this.registerProjectChannels()
    this.registerContextChannels()
    this.registerConfigChannels()
    this.registerWindowChannels()
    this.registerDialogChannels()
    this.registerOrchestratorChannels()
    this.registerCyberFactoryChannels()
    this.registerBugreportChannels()
    this.registerVoiceChannels()
    this.registerTaskChannels()
    this.registerPersonaChannels()
    this.registerCharacterChannels()
    this.registerWorkspaceChannels()
    this.registerNoteChannels()
    // Build FlexSearch index async (non-blocking)
    this.noteSearchIndex.buildFromManager(this.noteManager).catch(err =>
      console.error('[IpcHub] NoteSearchIndex build failed:', err)
    )
    this.registerGridControlChannels()
    this.registerEntityChannels()
    this.registerPresetChannels()
    this.registerGlobalRulesChannels()
    this.registerCompanionChannels()
    this.registerSetupChannels()
    this.registerUpdateChannels()
    ipcMain.handle(IPC.OPEN_EXTERNAL, (_e, url: string) => shell.openExternal(url))
    this.registerDetachChannels()
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

    // Clear stale activeWorkspaceId SYNCHRONOUSLY on startup — the renderer
    // reads this value immediately on mount (before the async init chain).
    if (configStore.get('activeWorkspaceId')) {
      console.log(`[IpcHub] Clearing stale activeWorkspaceId on startup`)
      configStore.set('activeWorkspaceId', null)
    }

    // Clear stale session IDs from ui.grid SYNCHRONOUSLY on startup.
    // These IDs are from the previous app run and won't match recovered sessions.
    // The keepWorking restore (or RecoveryDialog) will set correct IDs once
    // recovery completes. Without this, the renderer loads stale IDs that don't
    // match any live session → empty cells despite correct grid dimensions.
    const startupUi = configStore.get('ui')
    if (startupUi?.grid?.slots?.some((s: any) => s.sessionId)) {
      const clearedSlots = startupUi.grid.slots.map((s: any) => ({ ...s, sessionId: null }))
      configStore.set('ui', { ...startupUi, grid: { ...startupUi.grid, slots: clearedSlots } })
      console.log('[IpcHub] Cleared stale session IDs from ui.grid on startup')
    }

    // Deploy bundled voice models on first start
    try {
      const modelsDir = path.join(process.env.HOME ?? '', '.config', 'cipher-mux', 'models', 'piper')
      for (const voiceName of ['de_DE-cipher_adult-medium', 'de_DE-dii-high']) {
        deployBundledVoice({
          resourcesPath: process.resourcesPath ?? '',
          modelsDir,
          voiceName,
        })
      }
    } catch (err) {
      console.warn('[init] Voice bundle deploy failed:', (err as Error).message)
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

    // Check if setup is needed — if all required deps are present, skip waiting
    setupCheckAll().then(deps => {
      const allRequiredOk = deps.filter(d => d.required).every(d => d.installed)
      if (allRequiredOk) {
        this.setupCompleted = true
        this.onSetupComplete()
      }
    }).catch(() => {
      // If check fails, assume deps are present (don't block existing installs)
      this.setupCompleted = true
      this.onSetupComplete()
    })

    this.mcpServer.start(port, host, apiKey, {
      sessionManager: this.sessionManager,
      messageBus: this.messageBus,
      statusLineMonitor: this.statusLineMonitor,
      kickoffOrchestrator: this.kickoffOrchestrator,
      taskManager: this.taskManager,
      windowManager: this.windowManager,
      noteManager: this.noteManager,
      noteSearchIndex: this.noteSearchIndex,
      memoryStore: this.memoryStore,
      getVoiceManager: () => this.voiceManager,
      testingAssistantManager: this.testingAssistantManager ?? undefined,
      auditManager: this.auditManager ?? undefined,
      getFocusedSessionId: () => this.focusedSessionId,
    }).then(async () => {
      // Wait for setup to complete before connecting tmux
      if (!this.setupCompleted) {
        console.log('[IpcHub] Waiting for setup wizard to complete before tmux connect...')
        await this.setupCompletePromise
        console.log('[IpcHub] Setup complete — proceeding with tmux connect')
      }
      // MCP ready + setup done → connect tmux, recover sessions, then auto-start defaults
      return this.tmux.connect()
    }).then(() => {
      return this.sessionManager.recover()
    }).then(async (result) => {
      // Cache for pull-based retrieval by the renderer
      this.cachedRecoveryResult = result
      console.log(`[IpcHub] recovery complete: ${result.recovered.length} recovered, ${result.orphaned.length} orphaned, gridState=${!!result.gridState}`)
      this.sessionManager.startOrphanDetection()
      this.sessionManager.startExitDetection()

      // Keep Working: restore grid layout from snapshot.
      // If sessions survived in tmux (recovered), reuse them — don't kill/recreate.
      // Only start new sessions with --resume for snapshot entries without a match.
      const kwEnabled = configStore.get('keepWorking')
      const rawSnapshot = configStore.get('keepWorkingSnapshot')
      // Debug: write keepWorking state to file for post-mortem analysis
      try {
        const debugInfo = {
          ts: new Date().toISOString(),
          kwEnabled,
          hasSnapshot: !!rawSnapshot,
          snapshotSessions: rawSnapshot && !Array.isArray(rawSnapshot) ? rawSnapshot.sessions?.length : (Array.isArray(rawSnapshot) ? rawSnapshot.length : 0),
          recovered: result.recovered.map(r => ({ id: r.id, name: r.name })),
          orphaned: result.orphaned.length,
        }
        fs.writeFileSync('/tmp/kw-debug.json', JSON.stringify(debugInfo, null, 2))
      } catch { /* ignore */ }
      // Support both old (Array) and new ({ sessions, gridConfig }) formats
      const snapshotSessions = rawSnapshot
        ? (Array.isArray(rawSnapshot) ? rawSnapshot : rawSnapshot.sessions)
        : null
      const snapshotGridConfig = rawSnapshot && !Array.isArray(rawSnapshot)
        ? rawSnapshot.gridConfig
        : undefined
      const snapshotNotesSlots = rawSnapshot && !Array.isArray(rawSnapshot)
        ? rawSnapshot.notesSlots
        : undefined
      if (snapshotSessions && snapshotSessions.length > 0) {
        // keepWorking mode: skip Recovery Dialog, silently kill orphans, restore seamlessly
        console.log(`[IpcHub] keepWorking: restoring ${snapshotSessions.length} sessions from snapshot (${result.recovered.length} recovered, ${result.orphaned.length} orphaned — auto-cleaning)`)
        // Auto-kill orphaned tmux sessions silently
        for (const orphan of result.orphaned) {
          this.sessionManager.killOrphan(orphan.tmuxSession).catch(() => {})
        }
        await this.restoreKeepWorkingFromRecovery(snapshotSessions, snapshotGridConfig, result.recovered, snapshotNotesSlots)
        configStore.set('keepWorkingSnapshot', undefined as any)
        // Set empty recovery result so RecoveryDialog resolves immediately
        // (null would cause 15s poll timeout before onDone fires)
        this.cachedRecoveryResult = { recovered: [], orphaned: [], killed: [], gridState: null }
      } else {
        // No keepWorking snapshot — show Recovery Dialog if there are sessions to handle
        if (result.orphaned.length > 0 || result.recovered.length > 0) {
          this.windowManager.sendToMainWindow(IPC.SESSIONS_RECOVERY_RESULT, result)
        }
        if (result.recovered.length === 0) {
          // Only auto-start if no sessions were recovered
          this.autoStartDefault()
        }
      }
      // Restore detached windows from previous session
      this.restoreDetachedWindows()

      // Start BT Shutter if enabled (independent of voice mode)
      this.startBtShutter()
    }).catch((err) => {
      console.error('[IpcHub] startup failed:', err)
      // Debug: log startup failures for post-mortem
      try {
        const errorDebug = {
          ts: new Date().toISOString(),
          phase: 'startup-error',
          error: err?.message ?? String(err),
          stack: err?.stack?.split('\n').slice(0, 5),
        }
        fs.writeFileSync('/tmp/kw-debug.json', JSON.stringify(errorDebug, null, 2))
      } catch { /* ignore */ }
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
    const defaultWorkspaceId = configStore.get('defaultWorkspaceId')

    if (defaultWorkspaceId) {
      // Default workspace configured — renderer will load it via handleRecoveryDone.
      // Don't auto-start Companion here; the workspace apply flow handles session creation.
      console.log(`[IpcHub] Default workspace "${defaultWorkspaceId}" set — renderer will apply it after recovery`)
      return
    }

    // No workspace → start Companion only
    console.log('[IpcHub] No default workspace — auto-starting Companion')
    this.sessionManager.startEntity('companion').then((session) => {
      console.log(`[IpcHub] Companion auto-started: ${session.id}`)
      // Note: ENTITY_STARTED is already sent by setupEventForwarding when
      // startEntity emits 'entity-started'. No manual send here (RT-X2 double-event fix).
      try {
        this.sessionManager.queueEntityClaude('companion', session.id)
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
      this.windowManager.sendToAllWindows(IPC.SESSION_CHANGED, session)
    })

    this.sessionManager.on('session-closing', (session) => {
      this.windowManager.sendToMainWindow(IPC.SESSION_CLOSING, session)
    })

    this.sessionManager.on('session-stopped', (session) => {
      this.windowManager.sendToMainWindow(IPC.SESSION_STOPPED, session)
      // Clean up context-usage cache so bar resets to 0% on new session
      this.statusLineMonitor?.remove(session.id)
      // T-VP.3: auto-unpin voice if the stopped session was pinned
      this.voiceManager?.getInputRouter()?.unpinIfSession(session.id)
    })

    this.sessionManager.on('cyber-factory-started', (session) => {
      this.windowManager.sendToMainWindow(IPC.CYBER_FACTORY_STARTED, session)
    })

    this.sessionManager.on('entity-started', (data: { entityId: string; session: unknown }) => {
      this.windowManager.sendToMainWindow(IPC.ENTITY_STARTED, data)
      // Voice-relay uses mux_tts_speak for TTS (like all other sessions).
      // VoiceOutputRouter (terminal-polling) is disabled — it caused duplicate
      // readback of everything visible in the relay pane.

      // Bugreport relay: entity is now ready — activate STT routing and notify renderer
      if (data.entityId === 'bugreport' && this.bugreportRelaySessionId) {
        // STT routing is activated HERE (not at start), so no transcriptions are lost
        const inputRouter = this.voiceManager?.getInputRouter()
        if (inputRouter) {
          inputRouter.setBugreportSession(this.bugreportRelaySessionId)
        }
        this.bugreportManager.markRelayReady()
        this.windowManager.sendToMainWindow(IPC.BUGREPORT_RELAY_READY, { sessionId: this.bugreportRelaySessionId })
      }
    })

    this.sessionManager.on('entity-stopped', (data: { entityId: string }) => {
      // (VoiceOutputRouter disabled — voice-relay uses mux_tts_speak directly)
    })

    this.tmux.on('output', (paneId: string, data: string) => {
      // Route terminal data to detached window if session is detached, else mainWindow
      if (this.windowManager.isDetached?.(paneId)) {
        const detachedWin = this.windowManager.getDetachedWindow?.(paneId)
        if (detachedWin && !detachedWin.isDestroyed()) {
          detachedWin.webContents.send(IPC.TERMINAL_DATA, { paneId, data })
        }
      } else {
        this.windowManager.sendToMainWindow(IPC.TERMINAL_DATA, { paneId, data })
      }
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
      await this.sessionManager.gracefulStop(sessionId)
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

  // ─── Session Screenshot ──────────────────────────────────

  private registerScreenshotChannel(): void {
    ipcMain.handle(IPC.SESSION_SCREENSHOT, async (_e, { sessionId }: { sessionId: string }) => {
      const { execFileSync } = require('child_process')
      const fsNode = require('fs')
      const pathNode = require('path')

      // Save to project screenshots dir, or ~/Pictures/cipher-mux/screenshots/ as fallback
      const session = this.sessionManager.list().find((s: any) => s.id === sessionId)
      const screenshotDir = session?.projectPath
        ? pathNode.join(session.projectPath, 'screenshots')
        : pathNode.join(os.homedir(), 'Pictures', 'cipher-mux', 'screenshots')
      fsNode.mkdirSync(screenshotDir, { recursive: true })

      const timestamp = Date.now()
      const safeName = (session?.name || 'session').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80)
      const filePath = pathNode.join(screenshotDir, `${safeName}-${timestamp}.png`)
      try {
        execFileSync('screencapture', ['-i', filePath], { timeout: 30000 })
        if (!fsNode.existsSync(filePath)) return null

        // Send path to the session via tmux
        if (session?.tmuxSession) {
          const escapedPath = filePath.replace(/'/g, "'\\''")
          await this.sessionManager.sendKeys(sessionId, `# Screenshot: ${escapedPath}\r`)
        }
        return { path: filePath }
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

  // ─── Detachable Windows ────────────────────────────────
  private registerDetachChannels(): void {
    ipcMain.handle(IPC.DETACH_SESSION, async (_e, { sessionId }: { sessionId: string }) => {
      await this.windowManager.openDetachedWindow('session', sessionId)
      this.windowManager.sendToMainWindow(IPC.DETACH_STATE_CHANGED, {
        entries: this.windowManager.getDetachedEntries()
      })
      return { ok: true }
    })

    ipcMain.handle(IPC.DETACH_NOTE, async (_e, { noteId }: { noteId: string }) => {
      await this.windowManager.openDetachedWindow('note', noteId)
      this.windowManager.sendToMainWindow(IPC.DETACH_STATE_CHANGED, {
        entries: this.windowManager.getDetachedEntries()
      })
      return { ok: true }
    })

    ipcMain.handle(IPC.DOCK_REQUEST, async (_e, { entityId }: { entityId: string }) => {
      // Mark as dock-initiated so the 'closed' event sends docked entityId
      this.windowManager.markDockInitiated(entityId)
      this.windowManager.closeDetachedWindow(entityId)
      return { ok: true }
    })

    ipcMain.handle(IPC.DETACH_LIST, async () => {
      return this.windowManager.getDetachedEntries()
    })

    ipcMain.handle(IPC.DETACH_HAS_DETACHED, async () => {
      return this.windowManager.getDetachedEntries().length > 0
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
      // Keep Working: live-update snapshot on every grid change
      if (configStore.get('keepWorking') && grid?.config && grid?.slots) {
        this.updateKeepWorkingSnapshot(grid)
      }
      // T-VP.3: auto-unpin voice if pinned session no longer in grid
      this.voiceManager?.getInputRouter()?.autoUnpinIfBackground()
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

    ipcMain.handle(IPC.SIDEBAR_DOCK, () => {
      this.windowManager.dockSidebarWindow()
      return { ok: true }
    })

    ipcMain.handle('cipher-mux:sidebar:is-detached', () => {
      return configStore.get('sidebarDetached') ?? false
    })

    ipcMain.handle(IPC.SIDEBAR_TOGGLE_WINDOW, () => {
      const visible = this.windowManager.toggleSidebarWindow()
      return { visible }
    })
  }

  // ─── Dialogs ────────────────────────────────────────────
  private registerDialogChannels(): void {
    ipcMain.handle(IPC.DIALOG_OPEN_FILE, async (e, opts?: { title?: string; filters?: Electron.FileFilter[] }) => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? this.windowManager.getMainWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        title: opts?.title ?? 'Select File',
        properties: ['openFile'],
        filters: opts?.filters,
      })
      win.focus()
      return result.canceled ? null : result.filePaths[0] ?? null
    })

    ipcMain.handle(IPC.DIALOG_OPEN_DIR, async (e, opts?: { title?: string; defaultPath?: string }) => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? this.windowManager.getMainWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        title: opts?.title ?? 'Select Directory',
        defaultPath: opts?.defaultPath ?? os.homedir(),
        properties: ['openDirectory', 'createDirectory'],
      })
      win.focus()
      return result.canceled ? null : result.filePaths[0] ?? null
    })
  }

  // ─── Orchestrator ────────────────────────────────────────
  private registerOrchestratorChannels(): void {
    ipcMain.handle(IPC.ORCHESTRATOR_START, async () => {
      const session = await this.sessionManager.startEntity('orchestrator')
      // Queue Claude launch — fires when renderer reports real terminal size
      try {
        this.sessionManager.queueEntityClaude('orchestrator', session.id)
      } catch (err) {
        console.error('[IpcHub] Failed to queue orchestrator claude:', err)
      }
      return session
    })

    ipcMain.handle(IPC.ORCHESTRATOR_STOP, async () => {
      await this.sessionManager.stopEntity('orchestrator')
      return { ok: true }
    })

    ipcMain.handle(IPC.ORCHESTRATOR_STATUS, async () => {
      return {
        running: this.sessionManager.isEntityRunning('orchestrator'),
        sessionId: this.sessionManager.getEntitySessionId('orchestrator'),
      }
    })
  }

  // ─── Cyber Factory ──────────────────────────────────────
  private registerCyberFactoryChannels(): void {
    ipcMain.handle(IPC.CYBER_FACTORY_START, async () => {
      const session = await this.sessionManager.startEntity('cyber-factory')
      try {
        this.sessionManager.queueEntityClaude('cyber-factory', session.id)
      } catch (err) {
        console.error('[IpcHub] Failed to queue Cyber Factory claude:', err)
      }
      return session
    })

    ipcMain.handle(IPC.CYBER_FACTORY_STOP, async () => {
      await this.sessionManager.stopEntity('cyber-factory')
      return { ok: true }
    })

    ipcMain.handle(IPC.CYBER_FACTORY_STATUS, async () => {
      return {
        running: this.sessionManager.isEntityRunning('cyber-factory'),
        sessionId: this.sessionManager.getEntitySessionId('cyber-factory'),
      }
    })

    ipcMain.handle(IPC.CYBER_FACTORY_RUN_STATUS, async (_e, runId: string) => {
      return this.cyberFactoryManager?.getRun(runId) ?? null
    })

    ipcMain.handle(IPC.CYBER_FACTORY_WELLE_LIST, async (_e, runId: string) => {
      return this.cyberFactoryManager?.listWellen(runId) ?? []
    })

    ipcMain.handle(IPC.CYBER_FACTORY_WORKER_STATUS, async (_e, welleId: string) => {
      return this.cyberFactoryManager?.listSubProjekte(welleId) ?? []
    })
  }

  // ─── Bugreport ─────────────────────────────────────────
  private registerBugreportChannels(): void {
    ipcMain.handle(IPC.BUGREPORT_COLLECT, async () => {
      return this.bugreportManager.collectDiagnostics(this.sessionManager.list())
    })

    ipcMain.handle(IPC.BUGREPORT_SUBMIT, async (_e, { description, project, screenshots, reportType, enriched }: {
      description: string
      project?: string
      screenshots?: string[]
      reportType?: string
      enriched?: import('./bugreport/ollama-client').EnrichedBugreport
    }) => {
      const id = await this.bugreportManager.submit(description, this.sessionManager.list(), project, undefined, screenshots, reportType, enriched)
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

    // ── Bugreport Voice Relay ──

    ipcMain.handle(IPC.BUGREPORT_RELAY_START, async () => {
      try {
        const sessionId = await this.bugreportManager.startRelaySession(this.sessionManager)
        this.bugreportRelaySessionId = sessionId
        // STT routing is NOT set here — it's activated in entity-started handler
        // after the session is actually ready, to avoid lost transcriptions.
        console.log('[Bugreport] Relay session started:', sessionId)
        return { ok: true, sessionId }
      } catch (err) {
        const msg = (err as Error).message
        console.error('[Bugreport] Relay start failed:', msg)
        return { ok: false, error: msg }
      }
    })

    ipcMain.handle(IPC.BUGREPORT_RELAY_STOP, async () => {
      try {
        const inputRouter = this.voiceManager?.getInputRouter()
        if (inputRouter) {
          inputRouter.clearBugreportSession()
        }
        this.bugreportRelaySessionId = null
        await this.bugreportManager.stopRelaySession(this.sessionManager)
        console.log('[Bugreport] Relay stopped')
        return { ok: true }
      } catch (err) {
        console.error('[Bugreport] Relay stop failed:', (err as Error).message)
        return { ok: false }
      }
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
        this.voiceManager?.getConversation()?.handleToggle()
        return { ok: true }
      } catch (err) {
        const msg = (err as Error).message
        this.windowManager.sendToAllWindows(IPC.VOICE_ERROR, msg)
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
          sendStartCapture: () => this.windowManager.sendToAllWindows(IPC.VOICE_STATE, 'recording'),
          sendStopCapture: () => this.windowManager.sendToAllWindows(IPC.VOICE_STATE, 'processing'),
          sendTranscription: (text) => this.windowManager.sendToAllWindows(IPC.VOICE_TRANSCRIPTION, text),
          sendAudioPlayback: (b64) => this.windowManager.sendToAllWindows(IPC.VOICE_AGENT_AUDIO, b64),
          sendStateChange: (state) => this.windowManager.sendToAllWindows(IPC.VOICE_STATE, state),
          sendStopPlayback: () => this.windowManager.sendToAllWindows(IPC.VOICE_STOP_PLAYBACK, null),
          sendGenerationDone: () => this.windowManager.sendToAllWindows(IPC.VOICE_GENERATION_DONE, null),
          dispatchStatus: (text: string, level: string) => console.log(`[Voice:${level}] ${text}`),
          cancelStream: () => {},
        }
        this.voiceManager.setTransport(transport)
        await this.voiceManager.init()

        console.log('[Voice] Starting session mode...')
        const inputRouter = this.voiceManager.startSessionMode(this.sessionManager)
        inputRouter.setSubmitMode(configStore.get('voiceSubmitMode') ?? 'auto')
        inputRouter.on('dispatched', (data: { sessionId: string; sessionName: string; text: string }) => {
          console.log('[Voice] Dispatched to session:', data.sessionName, 'text:', data.text.slice(0, 80))
          this.windowManager.sendToAllWindows(IPC.VOICE_DISPATCHED, data)
        })
        inputRouter.on('error', (data: { code: string; message: string }) => {
          console.log('[Voice] InputRouter error:', data.code, data.message)
          this.windowManager.sendToAllWindows(IPC.VOICE_ERROR, data.message)
        })
        inputRouter.on('activeSessionChanged', (sessionId: string | null) => {
          this.windowManager.sendToAllWindows(IPC.VOICE_ACTIVE_SESSION, { sessionId })
        })
        inputRouter.on('notesInsert', (text: string) => {
          this.windowManager.sendToAllWindows(IPC.VOICE_NOTES_INSERT, { text: text.trimEnd() + ' ' })
        })
        inputRouter.on('pinChanged', (data: { pinned: boolean; sessionId: string | null }) => {
          this.windowManager.sendToAllWindows(IPC.VOICE_PIN_STATUS, data)
        })
        inputRouter.on('scroll', (data: { sessionId: string; action: string }) => {
          console.log('[Voice] Scroll command:', data.action, 'session:', data.sessionId)
          this.windowManager.sendToAllWindows(IPC.CELL_SCROLL, {
            sessionId: data.sessionId,
            action: data.action,
          })
        })
        inputRouter.on('gridNav', (data: { direction: string }) => {
          console.log('[Voice] Grid nav:', data.direction)
          this.windowManager.sendToAllWindows(IPC.GRID_NAV, data)
        })
        inputRouter.on('clipboard', (data: { action: string }) => {
          console.log('[Voice] Clipboard command:', data.action)
          this.windowManager.sendToAllWindows(IPC.VOICE_CLIPBOARD, data)
        })
        inputRouter.on('speechInterrupt', () => {
          console.log('[Voice] Speech interrupt — stopping TTS')
          this.voiceManager?.stopSpeech()
        })
        console.log('[Voice] VOICE_START_SESSION => ok')
        this.startBtShutter()
        return { ok: true }
      } catch (err) {
        const msg = (err as Error).message
        if (this.voiceManager && !this.voiceManager.isInitialized()) {
          this.voiceManager.shutdown()
          this.voiceManager = null
        }
        this.windowManager.sendToAllWindows(IPC.VOICE_ERROR, msg)
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
          sendStartCapture: () => this.windowManager.sendToAllWindows(IPC.VOICE_STATE, 'recording'),
          sendStopCapture: () => this.windowManager.sendToAllWindows(IPC.VOICE_STATE, 'processing'),
          sendTranscription: (text) => this.windowManager.sendToAllWindows(IPC.VOICE_TRANSCRIPTION, text),
          sendAudioPlayback: (b64) => {
            this.windowManager.sendToAllWindows(IPC.VOICE_AGENT_AUDIO, b64)
            this.windowManager.sendToAllWindows(IPC.VOICE_COM_STATE, 'speaking')
          },
          sendStateChange: (state) => {
            this.windowManager.sendToAllWindows(IPC.VOICE_STATE, state)
            this.windowManager.sendToAllWindows(IPC.VOICE_COM_STATE, state)
          },
          sendStopPlayback: () => this.windowManager.sendToAllWindows(IPC.VOICE_COM_STATE, 'idle'),
          sendGenerationDone: () => this.windowManager.sendToAllWindows(IPC.VOICE_COM_STATE, 'idle'),
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
          this.windowManager.sendToAllWindows(IPC.VOICE_DISPATCHED, data)
        })
        inputRouter.on('error', (data: { code: string; message: string }) => {
          this.windowManager.sendToAllWindows(IPC.VOICE_ERROR, data.message)
        })
        inputRouter.on('scroll', (data: { sessionId: string; action: string }) => {
          this.windowManager.sendToAllWindows(IPC.CELL_SCROLL, {
            sessionId: data.sessionId,
            action: data.action,
          })
        })
        inputRouter.on('gridNav', (data: { direction: string }) => {
          this.windowManager.sendToAllWindows(IPC.GRID_NAV, data)
        })
        inputRouter.on('clipboard', (data: { action: string }) => {
          this.windowManager.sendToAllWindows(IPC.VOICE_CLIPBOARD, data)
        })
        inputRouter.on('speechInterrupt', () => {
          console.log('[Voice] COM speech interrupt — stopping TTS')
          this.voiceManager?.stopSpeech()
        })

        // Start voice-relay entity as background session (no grid placement)
        if (!this.sessionManager.isEntityRunning('voice-relay')) {
          console.log('[Voice] Starting voice-relay entity...')
          const vrSession = await this.sessionManager.startEntity('voice-relay')
          // Queue Claude launch + startup greeting for background entity
          try {
            this.sessionManager.queueEntityClaude('voice-relay', vrSession.id)
            this.sessionManager.scheduleStartupGreeting('voice-relay')
          } catch (err) {
            console.error('[Voice] Failed to queue voice-relay claude:', err)
          }
          // Voice-relay uses mux_tts_speak — no VoiceOutputRouter polling needed
        } else {
          // Already running — no additional setup needed
        }

        this.windowManager.sendToAllWindows(IPC.VOICE_COM_STATE, 'idle')
        console.log('[Voice] VOICE_START_COM => ok')
        this.startBtShutter()
        return { ok: true }
      } catch (err) {
        const msg = (err as Error).message
        console.error('[Voice] VOICE_START_COM error:', msg)
        if (this.voiceManager && !this.voiceManager.isInitialized()) {
          this.voiceManager.shutdown()
          this.voiceManager = null
        }
        this.windowManager.sendToAllWindows(IPC.VOICE_ERROR, msg)
        return { ok: false, error: msg }
      }
    })

    ipcMain.handle(IPC.VOICE_STOP_COM, async () => {
      console.log('[Voice] VOICE_STOP_COM handler invoked')
      this.stopBtShutter()
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
        this.windowManager.sendToAllWindows(IPC.VOICE_COM_STATE, 'idle')
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    })

    ipcMain.on(IPC.VOICE_SET_ROUTING_MODE, (_event, { mode }: { mode: 'session' | 'off' }) => {
      this.voiceManager?.getInputRouter()?.setMode(mode)
      if (mode === 'off') {
        this.stopBtShutter()
      }
    })

    ipcMain.on(IPC.VOICE_SESSION_TARGET, (_event, { sessionId }: { sessionId: string | null }) => {
      this.focusedSessionId = sessionId
      this.voiceManager?.getInputRouter()?.setFocusedSession(sessionId)
    })

    ipcMain.on(IPC.VOICE_PIN, (_event, { sessionId }: { sessionId: string | null }) => {
      const router = this.voiceManager?.getInputRouter()
      if (!router) return
      if (sessionId) {
        router.togglePin(sessionId)
      } else {
        router.unpinSession()
      }
      this.windowManager.sendToAllWindows(IPC.VOICE_PIN_STATUS, {
        pinned: router.isPinned(),
        sessionId: router.getPinnedSessionId(),
      })
      this.windowManager.sendToAllWindows(IPC.VOICE_ACTIVE_SESSION, {
        sessionId: router.getActiveSessionId(),
      })
    })

    ipcMain.on(IPC.VOICE_NOTES_FOCUS, (_event, { focused }: { focused: boolean }) => {
      this.voiceManager?.getInputRouter()?.setNotesEditorFocused(focused)
    })

    ipcMain.handle('cipher-mux:tts:stop', () => {
      this.voiceManager?.stopSpeech()
      return { ok: true }
    })

    ipcMain.handle('cipher-mux:tts:speak', async (_e, { text }: { text: string }) => {
      if (!this.voiceManager?.isInitialized()) {
        return { ok: false, error: 'Voice not active' }
      }
      try {
        await this.voiceManager.speakText(text)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    })

    // Voice Catalog
    ipcMain.handle(IPC.VOICE_LIST_INSTALLED, () => {
      const { listInstalled } = require('./voice/voice-catalog')
      const piperDir = path.join(os.homedir(), '.config', 'cipher-mux', 'models', 'piper')
      return listInstalled(piperDir)
    })

    ipcMain.handle(IPC.VOICE_CATALOG_SEARCH, async (_e, query?: string) => {
      const { fetchCatalog } = require('./voice/voice-catalog')
      return fetchCatalog(query)
    })

    ipcMain.handle(IPC.VOICE_DOWNLOAD, async (_e, { name }: { name: string }) => {
      const { downloadVoice } = require('./voice/voice-downloader')
      const piperDir = path.join(os.homedir(), '.config', 'cipher-mux', 'models', 'piper')
      const { emitter, promise } = downloadVoice(name, piperDir)
      const mainWin = this.windowManager.getMainWindow()
      emitter.on('progress', (progress: any) => {
        mainWin?.webContents.send(IPC.VOICE_DOWNLOAD_PROGRESS, progress)
      })
      try {
        await promise
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    })

    ipcMain.handle(IPC.VOICE_DELETE, (_e, { name }: { name: string }) => {
      const { deleteVoice } = require('./voice/voice-downloader')
      const piperDir = path.join(os.homedir(), '.config', 'cipher-mux', 'models', 'piper')
      try {
        deleteVoice(name, piperDir)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    })

    ipcMain.handle(IPC.VOICE_SET_ACTIVE, async (_e, { name }: { name: string }) => {
      // Hot-swap if VoiceManager is initialized, otherwise just persist
      if (this.voiceManager && (this.voiceManager.isInitialized() || this.voiceManager.isPiperReady())) {
        try {
          await this.voiceManager.swapVoice(name)
          return { ok: true }
        } catch (err) {
          return { ok: false, error: (err as Error).message }
        }
      }
      configStore.set('piperVoice', name)
      return { ok: true }
    })

    ipcMain.handle(IPC.VOICE_PREVIEW, async (_e, { name }: { name: string }) => {
      try {
        const { PiperTTS } = require('./voice/tts-piper')
        const piperDir = path.join(os.homedir(), '.config', 'cipher-mux', 'models', 'piper')
        const appNodeModules = path.join(__dirname, '..', '..', '..', '..', 'node_modules')
        const tts = new PiperTTS({ voice: name, modelsDir: piperDir, nodeModulesPath: appNodeModules })
        await tts.init()
        const text = 'Dies ist eine Vorschau der Stimme.'
        for await (const chunk of tts.speak(text)) {
          const mainWin = this.windowManager.getMainWindow()
          mainWin?.webContents.send(IPC.VOICE_AGENT_AUDIO, { audio: chunk.toString('base64') })
        }
        tts.shutdown()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    })

    ipcMain.handle(IPC.VOICE_RECOMMEND_DOWNLOADS, () => {
      const { getRecommendedDownloads } = require('./setup/voice-bundle')
      return getRecommendedDownloads()
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

    ipcMain.handle(IPC.CHARACTERS_GLOBAL_PERSONA_GET, () => {
      return configStore.get('globalActivePersonaId')
    })

    ipcMain.handle(IPC.CHARACTERS_GLOBAL_PERSONA_SET, (_e, personaId: string | null) => {
      configStore.set('globalActivePersonaId', personaId)
      return { ok: true }
    })

    ipcMain.handle(IPC.ENTITY_PERSONA_OVERRIDE_GET, (_e, entityId: string) => {
      const overrides = configStore.get('entityPersonaOverrides') ?? {}
      return overrides[entityId] ?? null
    })

    ipcMain.handle(IPC.ENTITY_PERSONA_OVERRIDE_SET, (_e, entityId: string, characterId: string | null) => {
      const overrides = { ...(configStore.get('entityPersonaOverrides') ?? {}) }
      if (characterId) {
        overrides[entityId] = characterId
      } else {
        delete overrides[entityId]
      }
      configStore.set('entityPersonaOverrides', overrides)
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
      const workspaces = configStore.get('workspaces') ?? []
      const defaultId = configStore.get('defaultWorkspaceId')
      // Sort: default workspace first, then by sortOrder (lower first), then by name
      return [...workspaces].sort((a: any, b: any) => {
        if (a.id === defaultId && b.id !== defaultId) return -1
        if (b.id === defaultId && a.id !== defaultId) return 1
        const aSort = a.sortOrder ?? 100
        const bSort = b.sortOrder ?? 100
        if (aSort !== bSort) return aSort - bSort
        return (a.name ?? '').localeCompare(b.name ?? '')
      })
    })

    ipcMain.handle(IPC.WORKSPACES_SAVE, (_e, workspace: Workspace) => {
      const workspaces = [...configStore.get('workspaces')]
      const idx = workspaces.findIndex(w => w.id === workspace.id)
      if (idx >= 0) workspaces[idx] = workspace
      else workspaces.push(workspace)
      configStore.set('workspaces', workspaces)
      this.windowManager.sendToAllWindows(IPC.WORKSPACES_CHANGED, { reason: 'save', id: workspace.id })
      return { ok: true }
    })

    ipcMain.handle(IPC.WORKSPACES_DELETE, (_e, workspaceId: string) => {
      const workspaces = configStore.get('workspaces')
      configStore.set('workspaces', workspaces.filter(w => w.id !== workspaceId))
      this.windowManager.sendToAllWindows(IPC.WORKSPACES_CHANGED, { reason: 'delete', id: workspaceId })
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
    ipcMain.handle(IPC.NOTES_LIST, async () => {
      try {
        return await this.noteManager.list()
      } catch (err) {
        console.error('[IpcHub] NOTES_LIST failed:', err)
        return []
      }
    })

    ipcMain.handle(IPC.NOTES_READ, async (_e, { id }: { id: string }) => {
      return this.noteManager.read(id)
    })

    ipcMain.handle(IPC.NOTES_SAVE, async (_e, { id, body, tags, skipTagging }: {
      id: string; body: string; tags?: string[]; skipTagging?: boolean
    }) => {
      // REQ-NOTES-008: re-merge workspace scope tag + defaultTags so auto-tagging doesn't drop them
      let effectiveTags = tags
      if (effectiveTags) {
        const activeWsId = configStore.get('activeWorkspaceId')
        if (activeWsId) {
          const workspaces = configStore.get('workspaces') ?? []
          const ws = (workspaces as any[]).find((w: any) => w.id === activeWsId)
          if (ws) {
            // notesGlobal: skip workspace scope tag so note stays visible in all workspaces
            if (!ws.notesGlobal) {
              effectiveTags = [...effectiveTags, `workspace:${ws.name ?? ws.id}`]
            }
            if (ws.defaultTags?.length) {
              const tagSet = new Set([...effectiveTags, ...ws.defaultTags])
              effectiveTags = [...tagSet]
            }
          }
        }
      }
      // Resolve synonyms before saving
      if (effectiveTags) {
        effectiveTags = this.tagClassRepo.resolveSynonyms(effectiveTags)
      }
      this.noteWatcher.suppressNext(id)
      const note = await this.noteManager.save(id, body, effectiveTags)
      // Update search index + tag index
      this.noteSearchIndex.addOrUpdate({ info: note, body })
      this.tagIndex.updateNote(note.id, note.tags)
      this.tagClassRepo.ensureTags(note.tags)
      this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'updated', note })
      // Async auto-tagging (fire-and-forget, only on manual Cmd+S save)
      if (!tags && !skipTagging) {
        this.noteTagging.autoTag(body).then(async (autoTags) => {
          if (autoTags && autoTags.length > 0) {
            // Preserve structural tags that auto-tagging must not strip
            const existing = note.tags ?? []
            const preserved = existing.filter(t =>
              t === 'kind:testcase' || t.startsWith('workspace:') || t === 'handoff'
            )
            const merged = [...new Set([...preserved, ...autoTags])]
            await this.noteTagging.updateRepository(autoTags)
            const updated = await this.noteManager.save(id, body, merged)
            this.noteSearchIndex.addOrUpdate({ info: updated, body })
            this.tagIndex.updateNote(updated.id, updated.tags)
            this.tagClassRepo.ensureTags(updated.tags)
            this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'tagged', note: updated })
          }
        }).catch(() => { /* Ollama not available — ignore */ })
      }
      return note
    })

    ipcMain.handle(IPC.NOTES_CREATE, async (_e, { title, body, tags }: {
      title: string; body: string; tags?: string[]
    }) => {
      // REQ-NOTES-007: Tag limit — max 5 manual tags (workspace defaults don't count)
      const manualTags = tags ?? []
      const tagLimitExceeded = manualTags.length > MAX_MANUAL_TAGS
      if (tagLimitExceeded) {
        console.warn(`[IpcHub] NOTES_CREATE: ${manualTags.length} manual tags exceed limit of ${MAX_MANUAL_TAGS}`)
      }

      // P.2: auto-apply workspace scope tag + defaultTags when workspace is active
      let mergedTags = manualTags
      const activeWsId = configStore.get('activeWorkspaceId')
      if (activeWsId) {
        const workspaces = configStore.get('workspaces') ?? []
        const ws = (workspaces as any[]).find((w: any) => w.id === activeWsId)
        if (ws) {
          // notesGlobal: skip workspace scope tag so note is visible in all workspaces
          if (!ws.notesGlobal) {
            mergedTags = [...mergedTags, `workspace:${ws.name ?? ws.id}`]
          }
          if (ws.defaultTags?.length) {
            const tagSet = new Set([...mergedTags, ...ws.defaultTags])
            mergedTags = [...tagSet]
          }
        }
      }
      // Resolve synonyms before creating
      mergedTags = this.tagClassRepo.resolveSynonyms(mergedTags)
      const note = await this.noteManager.create(title, body, mergedTags.length > 0 ? mergedTags : undefined)
      // Update search index + tag index
      const fullBody = body.startsWith('# ') ? body : `# ${title}\n\n${body}`
      this.noteSearchIndex.addOrUpdate({ info: note, body: fullBody })
      this.tagIndex.addNote(note.id, note.tags)
      this.tagClassRepo.ensureTags(note.tags)
      this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'created', note })
      return note
    })

    ipcMain.handle(IPC.NOTES_DELETE, async (_e, { id }: { id: string }) => {
      this.noteWatcher.suppressNext(id)
      const ok = await this.noteManager.delete(id)
      if (ok) {
        this.noteSearchIndex.remove(id)
        this.tagIndex.removeNote(id)
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'deleted', id })
      }
      return { ok }
    })

    // REQ-NOTES-006: Trash (soft delete with undo)
    ipcMain.handle(IPC.NOTES_TRASH, async (_e, { id }: { id: string }) => {
      this.noteWatcher.suppressNext(id)
      const ok = await this.noteManager.trash(id)
      if (ok) {
        this.noteSearchIndex.remove(id)
        this.tagIndex.removeNote(id)
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'deleted', id })
      }
      return { ok }
    })

    ipcMain.handle(IPC.NOTES_TRASH_MANY, async (_e, { ids }: { ids: string[] }) => {
      const trashed = await this.noteManager.trashMany(ids)
      for (const id of trashed) {
        this.noteSearchIndex.remove(id)
        this.tagIndex.removeNote(id)
      }
      if (trashed.length > 0) {
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'deleted', ids: trashed })
      }
      return { trashed }
    })

    ipcMain.handle(IPC.NOTES_RESTORE, async (_e, { id }: { id: string }) => {
      const ok = await this.noteManager.restore(id)
      if (ok) {
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'restored', id })
      }
      return { ok }
    })

    ipcMain.handle(IPC.NOTES_RESTORE_MANY, async (_e, { ids }: { ids: string[] }) => {
      const restored = await this.noteManager.restoreMany(ids)
      if (restored.length > 0) {
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'restored', ids: restored })
      }
      return { restored }
    })

    // REQ-NOTES-005: Bulk tagging
    ipcMain.handle(IPC.NOTES_BULK_TAG_ADD, async (_e, { ids, tag }: { ids: string[]; tag: string }) => {
      const resolvedTag = this.tagClassRepo.resolveSynonym(tag)
      const updated = await this.noteManager.bulkAddTag(ids, resolvedTag, MAX_MANUAL_TAGS)
      if (updated.length > 0) {
        this.tagClassRepo.ensureTag(resolvedTag)
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'updated', ids: updated })
      }
      return { updated }
    })

    ipcMain.handle(IPC.NOTES_BULK_TAG_REMOVE, async (_e, { ids, tag }: { ids: string[]; tag: string }) => {
      // REQ-NOTES-008: protect workspace scope tag + default tags from removal
      const activeWsId = configStore.get('activeWorkspaceId')
      if (activeWsId) {
        const workspaces = configStore.get('workspaces') ?? []
        const ws = (workspaces as any[]).find((w: any) => w.id === activeWsId)
        if (ws && tag === `workspace:${ws.name ?? ws.id}`) {
          return { updated: [], blocked: true }
        }
        if (ws?.defaultTags?.includes(tag)) {
          return { updated: [], blocked: true }
        }
      }
      const updated = await this.noteManager.bulkRemoveTag(ids, tag)
      if (updated.length > 0) {
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'updated', ids: updated })
      }
      return { updated }
    })

    ipcMain.handle(IPC.NOTES_SEARCH, async (_e, { query, tags }: { query: string; tags?: string[] }) => {
      let results = this.noteSearchIndex.search(query)
      // Apply tag filter if provided
      if (tags && tags.length > 0) {
        const tagSet = new Set(tags.map(t => t.toLowerCase()))
        results = results.filter(r => r.info.tags.some(t => tagSet.has(t.toLowerCase())))
      }
      return results
    })

    // Screenshot capture for testcase items (macOS screencapture -i)
    ipcMain.handle(IPC.NOTES_SCREENSHOT, async (_e, { noteId, itemId }: { noteId: string; itemId: string }) => {
      const { execFileSync } = require('child_process')
      const fsNode = require('fs')
      const pathNode = require('path')
      const screenshotDir = pathNode.join(this.noteManager['notesDir'], 'screenshots', noteId)
      fsNode.mkdirSync(screenshotDir, { recursive: true })
      const timestamp = Date.now()
      const filePath = pathNode.join(screenshotDir, `${itemId}-${timestamp}.png`)
      try {
        // Interactive region selection → file (no clipboard permission needed)
        execFileSync('screencapture', ['-i', filePath], { timeout: 30000 })
        if (fsNode.existsSync(filePath)) {
          return { path: filePath }
        }
        return null
      } catch {
        return null
      }
    })

    // Parse a testcase note in main process (where gray-matter is available)
    ipcMain.handle(IPC.NOTES_PARSE_TESTCASE, async (_e, { id }: { id: string }) => {
      try {
        const result = await this.noteManager.read(id)
        if (!result || !result.info.tags?.includes('kind:testcase')) return null
        const { parseTestcase } = require('./notes/testcase-parser')
        // Read raw file to get frontmatter intact for parser
        const fsNode = require('fs')
        const pathNode = require('path')
        const rawPath = pathNode.join(this.noteManager['notesDir'], `${id}.md`)
        const raw = fsNode.readFileSync(rawPath, 'utf-8')
        return parseTestcase(raw) ?? null
      } catch (err) {
        console.error('[IpcHub] NOTES_PARSE_TESTCASE failed:', err)
        return null
      }
    })

    // Serialize testcase sections back to markdown body (main process)
    ipcMain.handle(IPC.NOTES_SERIALIZE_TESTCASE, async (_e, { sections }: { sections: any[] }) => {
      try {
        const { serializeTestcaseBody } = require('./notes/testcase-parser')
        return serializeTestcaseBody(sections)
      } catch (err) {
        console.error('[IpcHub] NOTES_SERIALIZE_TESTCASE failed:', err)
        return null
      }
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
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'tags-updated' })
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
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'tags-updated' })
      }
      return { ok: true, affected: affected.length }
    })

    ipcMain.handle(IPC.NOTES_TAG_MERGE, async (_e, { sources, target }: { sources: string[]; target: string }) => {
      const result = this.noteTagging.mergeTags(sources, target)
      if (result.affected > 0) {
        this.tagIndex.rebuild()
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'tags-updated' })
      }
      return result
    })

    // Tag Class Repository (REQ-NOTES-010)
    ipcMain.handle(IPC.NOTES_TAG_CLASS_REPO, async () => {
      return this.tagClassRepo.getRepository()
    })

    // Tag Class CRUD
    ipcMain.handle(IPC.NOTES_TAG_CLASS_CREATE, async (_e, { name, color }: { name: string; color: string }) => {
      const ok = this.tagClassRepo.createClass(name, color)
      if (ok) {
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'tags-updated' })
      }
      return { ok }
    })

    ipcMain.handle(IPC.NOTES_TAG_CLASS_RENAME, async (_e, { oldName, newName }: { oldName: string; newName: string }) => {
      const ok = this.tagClassRepo.renameClass(oldName, newName)
      if (ok) {
        this.tagIndex.rebuild()
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'tags-updated' })
      }
      return { ok }
    })

    ipcMain.handle(IPC.NOTES_TAG_CLASS_DELETE, async (_e, { name }: { name: string }) => {
      const ok = this.tagClassRepo.deleteClass(name)
      if (ok) {
        this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'tags-updated' })
      }
      return { ok }
    })

    ipcMain.handle(IPC.NOTES_TAG_CLASS_SET_COLOR, async (_e, { name, color }: { name: string; color: string }) => {
      this.tagClassRepo.setClassColor(name, color)
      this.windowManager.sendToAllWindows(IPC.NOTES_CHANGED, { action: 'tags-updated' })
      return { ok: true }
    })

    ipcMain.handle(IPC.NOTES_TAG_SYNONYMS_LIST, async () => {
      return this.tagClassRepo.getSynonyms()
    })

    // Tag Index (REQ-NOTES-012)
    ipcMain.handle(IPC.NOTES_TAG_INDEX, async () => {
      return this.tagIndex.getIndex()
    })

    ipcMain.handle(IPC.NOTES_TAG_INDEX_REFRESH, async () => {
      return this.tagIndex.rebuild()
    })
  }

  // ─── Grid Control (MCP App-Control) ─────────────────────
  private registerGridControlChannels(): void {
    // Pull-based Keep Working restore — renderer polls this until it gets data or times out.
    // Don't null the cache on read — the renderer may poll multiple times if the init chain
    // hasn't completed yet. The cache is cleared when keepWorkingSnapshot is consumed (line ~275).
    ipcMain.handle(IPC.KEEP_WORKING_PULL, () => {
      return this.cachedKeepWorkingRestore // null if no restore pending (yet)
    })

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
      // Feature flag gate: debugger is opt-in (defaults to disabled)
      if (entityId === 'debugger') {
        const debuggerConfig = configStore.get('debugger')
        if (!debuggerConfig?.enabled) {
          throw new Error('Debugger is disabled. Enable it in Settings → Debugger.')
        }
      }

      const mcpConfig = configStore.get('mcp')
      // Ensure MCP config is set on session manager
      this.sessionManager.setMcpConfig({
        mcpHost: mcpConfig?.host ?? MCP_DEFAULT_HOST,
        mcpPort: mcpConfig?.port ?? MCP_DEFAULT_PORT,
        mcpApiKey: mcpConfig?.apiKey ?? '',
      })
      const session = await this.sessionManager.startEntity(entityId)
      // Queue Claude launch for entity — pass session.id for multi-instance support
      try {
        this.sessionManager.queueEntityClaude(entityId, session.id)
        this.sessionManager.scheduleStartupGreeting(entityId)
      } catch (err) {
        console.error(`[IpcHub] Failed to queue ${entityId} claude:`, err)
      }
      return session
    })

    ipcMain.handle(IPC.ENTITY_RESUME, async (_e, { entityId, sessionId }: { entityId: EntityId; sessionId?: string }) => {
      const mcpConfig = configStore.get('mcp')
      this.sessionManager.setMcpConfig({
        mcpHost: mcpConfig?.host ?? MCP_DEFAULT_HOST,
        mcpPort: mcpConfig?.port ?? MCP_DEFAULT_PORT,
        mcpApiKey: mcpConfig?.apiKey ?? '',
      })
      const session = await this.sessionManager.resumeEntity(entityId, sessionId)
      return session
    })

    ipcMain.handle(IPC.ENTITY_STOP, async (_e, { entityId, sessionId }: { entityId: EntityId; sessionId?: string }) => {
      await this.sessionManager.stopEntity(entityId, sessionId)
      return { ok: true }
    })

    ipcMain.handle(IPC.ENTITY_STATUS, async (_e, { entityId }: { entityId: EntityId }) => {
      return {
        running: this.sessionManager.isEntityRunning(entityId),
        sessionId: this.sessionManager.getEntitySessionId(entityId),
        sessionIds: this.sessionManager.getEntitySessionIds(entityId),
      }
    })

    ipcMain.handle(IPC.ENTITY_LIST, async () => {
      const configs = this.sessionManager.getEntityRegistry().list()
      const overrides = configStore.get('entitySortOrders') ?? {}
      const hidden = configStore.get('entityHidden') ?? {}
      return configs.map(c => ({
        ...c,
        sortOrder: overrides[c.id] ?? c.sortOrder ?? 100,
        launcherHidden: hidden[c.id] ?? false,
      }))
    })
  }

  // ─── Presets (Entity CLAUDE.md Editor) ──────────────────
  private registerPresetChannels(): void {
    const entitiesDir = path.join(os.homedir(), '.config/cipher-mux/entities')

    // Entities whose preset.md is code-generated and refreshed at session start.
    // These are read-only in the PresetEditor ("Copy as Custom" to override).
    const ENTITIES_WITH_TEMPLATE = new Set([
      'audit', 'voice-relay', 'bugreport', 'testing-assistant',
      'debugger', 'cyber-factory', 'orchestrator', 'companion',
      'refinement', 'ideation-partner',
    ])

    ipcMain.handle(IPC.PRESETS_LIST, async () => {
      // Return entities that have a projectPath inside ~/.config/cipher-mux/entities
      const registry = this.sessionManager.getEntityRegistry()
      const all = registry.list()
      const overrides = configStore.get('entitySortOrders') ?? {}
      const hidden = configStore.get('entityHidden') ?? {}
      return all
        .filter(e => e.projectPath.startsWith(entitiesDir))
        .map(e => ({
          id: e.id,
          displayName: e.displayName,
          color: e.color,
          icon: e.icon,
          projectPath: e.projectPath,
          sortOrder: overrides[e.id] ?? e.sortOrder ?? 100,
          launcherHidden: hidden[e.id] ?? false,
          hasTemplate: ENTITIES_WITH_TEMPLATE.has(e.id),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder)
    })

    ipcMain.handle(IPC.PRESETS_READ, async (_e, { entityId }: { entityId: string }) => {
      const presetMdPath = path.join(entitiesDir, entityId, 'preset.md')
      const claudeMdPath = path.join(entitiesDir, entityId, 'CLAUDE.md')
      const registry = this.sessionManager.getEntityRegistry()
      const entity = registry.list().find(e => e.id === entityId)
      const displayName = entity?.displayName ?? entityId

      // Primary: preset.md
      if (fs.existsSync(presetMdPath)) {
        try {
          const content = fs.readFileSync(presetMdPath, 'utf-8')
          return { ok: true, content, displayName }
        } catch {
          return { ok: false, content: '', error: 'Failed to read preset.md' }
        }
      }

      // Fallback: CLAUDE.md with injected sections stripped
      if (fs.existsSync(claudeMdPath)) {
        try {
          let content = fs.readFileSync(claudeMdPath, 'utf-8')
          const stripSections = ['Global Rules', 'Persona', 'Workspace Prompt', 'Context Directories']
          for (const section of stripSections) {
            const regex = new RegExp(`\\n## ${section}\\n[\\s\\S]*?(?=\\n## |$)`, 'g')
            content = content.replace(regex, '')
          }
          return { ok: true, content: content.trim(), displayName }
        } catch {
          return { ok: false, content: '', error: 'Failed to read CLAUDE.md' }
        }
      }

      // Last resort: generate template content on-the-fly for known entities
      const templateGenerators: Record<string, () => string> = {
        'voice-relay': generateVoiceRelayClaudeMd,
        bugreport: generateBugreportPresetClaudeMd,
        audit: generateAuditClaudeMd,
        debugger: generateDebuggerClaudeMd,
        companion: generateCompanionClaudeMd,
        'testing-assistant': generateTestingAssistantClaudeMd,
      }
      const gen = templateGenerators[entityId]
      if (gen) {
        const content = gen()
        return { ok: true, content, displayName }
      }

      return { ok: true, content: '', displayName }
    })

    ipcMain.handle(IPC.PRESETS_SAVE, async (_e, { entityId, content }: { entityId: string; content: string }) => {
      const presetMdPath = path.join(entitiesDir, entityId, 'preset.md')
      try {
        // Empty content = delete preset.md so template fallback kicks in
        if (!content.trim()) {
          if (fs.existsSync(presetMdPath)) fs.unlinkSync(presetMdPath)
        } else {
          fs.writeFileSync(presetMdPath, content, 'utf-8')
        }
        return { ok: true }
      } catch (err: any) {
        return { ok: false, error: err.message }
      }
    })

    ipcMain.handle(IPC.PRESETS_CREATE, async (_e, { entityId, displayName }: { entityId: string; displayName: string }) => {
      const dir = path.join(entitiesDir, entityId)
      const presetMdPath = path.join(dir, 'preset.md')
      try {
        if (fs.existsSync(dir)) {
          return { ok: false, error: 'Preset directory already exists' }
        }
        fs.mkdirSync(dir, { recursive: true })
        const template = `# ${displayName}\n\n## Rolle\n\n\n\n## Faehigkeiten\n\n\n\n## Arbeitsregeln\n\n\n\n## Scope\n\n`
        fs.writeFileSync(presetMdPath, template, 'utf-8')
        // Entity scanner requires CLAUDE.md to register the entity
        const claudeMdPath = path.join(dir, 'CLAUDE.md')
        fs.writeFileSync(claudeMdPath, template, 'utf-8')
        // Re-scan to register the new entity
        const registry = this.sessionManager.getEntityRegistry()
        scanAndRegisterEntities(registry)
        return { ok: true }
      } catch (err: any) {
        return { ok: false, error: err.message }
      }
    })

    ipcMain.handle(IPC.PRESETS_DELETE, async (_e, { entityId }: { entityId: string }) => {
      const dir = path.join(entitiesDir, entityId)
      try {
        if (!fs.existsSync(dir)) {
          return { ok: false, error: 'Preset directory not found' }
        }
        fs.rmSync(dir, { recursive: true, force: true })
        return { ok: true }
      } catch (err: any) {
        return { ok: false, error: err.message }
      }
    })

    ipcMain.handle(IPC.PRESETS_READ_INJECTED, async (_e, { entityId }: { entityId: string }) => {
      const sections: Array<{ name: string; source: string }> = []

      // Global Rules — always injected from global-rules.md
      const globalRulesPath = path.join(os.homedir(), '.config/cipher-mux/global-rules.md')
      if (fs.existsSync(globalRulesPath)) {
        sections.push({ name: 'Global Rules', source: 'global-rules.md' })
      }

      // Persona — resolved via persona-resolver
      const overrides = configStore.get('entityPersonaOverrides') ?? {}
      const resolved = resolvePersonaForPreset(entityId, {
        getCharacters: () => configStore.get('characters') ?? [],
        getActiveCharacterId: () => configStore.get('activeCharacterId') ?? 'relay',
        getGlobalActivePersonaId: () => configStore.get('globalActivePersonaId') ?? null,
      }, overrides[entityId] ?? null)
      sections.push({ name: 'Persona', source: `character: ${resolved.name}` })

      // Workspace Prompt + Context Directories — from active workspace if it has them
      const activeWsId = configStore.get('activeWorkspaceId') as string | null
      if (activeWsId) {
        const workspaces = configStore.get('workspaces') ?? []
        const ws = (workspaces as any[]).find((w: any) => w.id === activeWsId)
        if (ws) {
          if (ws.workspacePrompt?.trim()) {
            sections.push({ name: 'Workspace Prompt', source: `workspace: ${ws.name ?? activeWsId}` })
          }
          if (ws.contextPaths?.length) {
            sections.push({ name: 'Context Directories', source: `workspace: ${ws.name ?? activeWsId}` })
          }
        }
      }

      return { sections }
    })
  }

  // ─── Global Rules (global-rules.md Editor) ─────────────
  private registerGlobalRulesChannels(): void {
    ensureGlobalRulesFile()

    ipcMain.handle(IPC.GLOBAL_RULES_READ, async () => {
      try {
        const content = getGlobalRules()
        return { ok: true, content }
      } catch (err: any) {
        return { ok: false, content: '', error: err.message }
      }
    })

    ipcMain.handle(IPC.GLOBAL_RULES_SAVE, async (_e, { content }: { content: string }) => {
      try {
        setGlobalRules(content)
        invalidateGlobalRulesCache()
        return { ok: true }
      } catch (err: any) {
        return { ok: false, error: err.message }
      }
    })
  }

  // ─── Companion Memory ──────────────────────────────────
  private registerCompanionChannels(): void {
    // Helper: workspace-aware recall (user + active workspace, excludes other workspaces)
    const wsAwareRecall = (opts?: { limit?: number; kindFilter?: import('../shared/types').MemoryKind; since?: number }) => {
      const limit = opts?.limit ?? 20
      const activeWsId = configStore.get('activeWorkspaceId') ?? null
      if (activeWsId) {
        const userMems = this.memoryStore!.recall({ ...opts, limit, scopeKind: 'user' })
        const wsMems = this.memoryStore!.recall({ ...opts, limit, scopeKind: 'workspace', scopeId: activeWsId })
        const merged = [...userMems, ...wsMems].sort((a, b) => b.ts - a.ts)
        return merged.slice(0, limit)
      }
      return this.memoryStore!.recall({ ...opts, limit })
    }

    ipcMain.handle(IPC.COMPANION_RECALL, async (_e, { limit }: { limit?: number }) => {
      if (!this.memoryStore) return []
      return wsAwareRecall({ limit })
    })

    ipcMain.handle(IPC.COMPANION_LIST_MEMORIES, async (_e, opts?: { limit?: number; kind?: string; since?: number }) => {
      if (!this.memoryStore) return []
      return wsAwareRecall({
        limit: opts?.limit,
        kindFilter: opts?.kind as import('../shared/types').MemoryKind | undefined,
        since: opts?.since,
      })
    })

    ipcMain.handle(IPC.COMPANION_SEARCH, async (_e, { query, limit }: { query: string; limit?: number }) => {
      if (!this.memoryStore) return []
      const searchLimit = limit ?? 20
      const activeWsId = configStore.get('activeWorkspaceId') ?? null
      const raw = this.memoryStore.search(query, { limit: activeWsId ? searchLimit * 3 : searchLimit })
      if (activeWsId) {
        return raw.filter(m =>
          m.scopeKind === 'user' ||
          (m.scopeKind === 'workspace' && m.scopeId === activeWsId)
        ).slice(0, searchLimit)
      }
      return raw
    })

    ipcMain.handle(IPC.COMPANION_DELETE_MEMORY, async (_e, { id }: { id: string }) => {
      if (!this.memoryStore) return { ok: false }
      const deleted = this.memoryStore.forget(id)
      return { ok: deleted }
    })
  }

  private onSetupComplete(): void {
    if (this.setupCompleteResolve) {
      this.setupCompleteResolve()
      this.setupCompleteResolve = null
    }
  }

  // ─── Setup Wizard ─────────────────────────────────────────
  private registerSetupChannels(): void {
    ipcMain.handle(IPC.SETUP_CHECK, async () => {
      return { dependencies: await setupCheckAll() }
    })

    ipcMain.handle(IPC.SETUP_INSTALL_ALL, async (event, opts?: { selectedIds?: string[] }) => {
      const deps = await setupCheckAll()
      const selectedIds = opts?.selectedIds
      const missing = deps.filter(d => !d.installed && (!selectedIds || d.required || selectedIds.includes(d.id)))

      for (const dep of missing) {
        event.sender.send(IPC.SETUP_PROGRESS, {
          stepId: dep.id,
          message: `Installing ${dep.name}...`,
          done: false,
        })

        const success = await installDependency(dep.id, (msg) => {
          event.sender.send(IPC.SETUP_PROGRESS, {
            stepId: dep.id,
            message: msg,
            done: false,
          })
        })

        if (!success) {
          const updated = await setupCheckAll()
          event.sender.send(IPC.SETUP_PROGRESS, {
            stepId: dep.id,
            message: `Installation of ${dep.name} failed`,
            done: false,
            error: true,
            dependencies: updated,
          })
          return { ok: false, failedId: dep.id }
        }

        const updated = await setupCheckAll()
        event.sender.send(IPC.SETUP_PROGRESS, {
          stepId: dep.id,
          message: `${dep.name} done`,
          done: false,
          dependencies: updated,
        })
      }

      const final = await setupCheckAll()
      event.sender.send(IPC.SETUP_PROGRESS, {
        stepId: null,
        message: 'done',
        done: true,
        dependencies: final,
      })

      // Signal setup complete for tmux gating
      this.setupCompleted = true
      this.onSetupComplete()

      return { ok: true }
    })

    ipcMain.handle(IPC.SETUP_SKIP, () => {
      // User skipped setup — unblock tmux connect
      if (!this.setupCompleted) {
        this.setupCompleted = true
        this.onSetupComplete()
      }
      return { ok: true }
    })
  }

  // ─── Update Checker ──────────────────────────────────────

  private registerUpdateChannels(): void {
    ipcMain.handle(IPC.UPDATE_CHECK, async () => {
      try {
        const updateInfo = await checkForUpdate()
        if (updateInfo) {
          const dismissed = configStore.get('update')?.dismissedVersion
          if (dismissed === updateInfo.version) return null
          this.windowManager.sendToMainWindow(IPC.UPDATE_AVAILABLE, updateInfo)
        }
        configStore.set('update', {
          ...configStore.get('update'),
          lastCheck: new Date().toISOString(),
        })
        return updateInfo
      } catch (err) {
        console.warn('[update] Check failed:', (err as Error).message)
        return null
      }
    })

    ipcMain.on(IPC.UPDATE_DISMISS, (_e, version: string) => {
      configStore.set('update', {
        ...configStore.get('update'),
        dismissedVersion: version,
      })
    })
  }

  // ─── BT Shutter Remote ──────────────────────────────────

  /** Timestamp of last BT Shutter button event — used to suppress the
   *  duplicate HID keystroke that the shutter also sends to macOS. */
  private btShutterLastEventTs = 0
  private btShutterInputGuard: ((e: Electron.Event, input: Electron.Input) => void) | null = null
  private focusedSessionId: string | null = null

  private startBtShutter(): void {
    const btConfig = configStore.get('btShutter')
    if (!btConfig?.enabled) return
    if (this.btShutterManager?.isRunning()) return

    this.btShutterManager = new BtShutterManager({
      binaryPath: btConfig.binaryPath,
      deviceFilter: btConfig.deviceFilter,
    })

    this.btShutterManager.on('button', (event: BtShutterEvent) => {
      // Mark timestamp so the before-input-event guard can suppress the
      // duplicate HID keystroke that arrives ~0-50ms later.
      this.btShutterLastEventTs = Date.now()

      // Route shutter events: VoiceInputRouter (if voice active) → focused session (fallback)
      let targetId: string | null = null
      const router = this.voiceManager?.getInputRouter()
      if (router) {
        targetId = router.getActiveSessionId()
      }
      if (!targetId) {
        // Fallback: send to focused session (tracked via VOICE_SESSION_TARGET IPC)
        targetId = this.focusedSessionId
      }
      if (targetId) {
        const keys = event.action === 'submit' ? '\r' : '\x15'
        this.sessionManager.sendKeys(targetId, keys).catch(err => {
          console.error('[BtShutter] sendKeys failed:', (err as Error).message)
        })
      }
      // Still notify renderer for UI feedback
      this.windowManager.sendToMainWindow(IPC.BT_SHUTTER_EVENT, event)
    })

    this.btShutterManager.on('status', (status: BtShutterStatus) => {
      this.windowManager.sendToMainWindow(IPC.BT_SHUTTER_STATUS, status)
    })

    // Suppress the duplicate Enter keystroke that the BT Shutter HID device
    // sends to macOS (arrives as a normal keydown in the Electron renderer).
    const mainWin = this.windowManager.getMainWindow()
    if (mainWin) {
      this.btShutterInputGuard = (_e: Electron.Event, input: Electron.Input) => {
        const elapsed = Date.now() - this.btShutterLastEventTs
        if (elapsed < 200 && input.type === 'keyDown' && input.key === 'Enter') {
          _e.preventDefault()
          console.log('[BtShutter] Suppressed duplicate HID Enter keystroke')
        }
      }
      mainWin.webContents.on('before-input-event', this.btShutterInputGuard)
    }

    // BT Shutter volume-key side-effects are suppressed at two levels:
    // 1. ab-shutter-bridge uses kIOHIDOptionsTypeSeizeDevice (exclusive HID capture)
    // 2. Electron disables HardwareMediaKeyHandling (Chromium switch in main.ts)

    this.btShutterManager.start()
  }

  private stopBtShutter(): void {
    if (this.btShutterManager) {
      this.btShutterManager.shutdown()
      this.btShutterManager = null
    }

    // Remove the before-input-event guard
    if (this.btShutterInputGuard) {
      const mainWin = this.windowManager.getMainWindow()
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.off('before-input-event', this.btShutterInputGuard)
      }
      this.btShutterInputGuard = null
    }

  }

  /**
   * Restore Keep Working state by reusing recovered tmux sessions where possible.
   * Only creates new sessions (with --resume) for snapshot entries that have no
   * matching recovered session. This avoids killing live Claude sessions and
   * eliminates the race condition where new session IDs wouldn't match the
   * persisted ui.grid config.
   */
  private async restoreKeepWorkingFromRecovery(
    snapshot: Array<{ name: string; projectPath: string; gridSlot: number; entityId?: string; topic?: string }>,
    gridConfig: { cols: number; rows: number } | undefined,
    recovered: Array<{ id: string; name: string; projectPath: string | null; entityId?: string }>,
    notesSlots?: Array<{ slotIndex: number; notesId?: string; openNoteIds?: string[] }>,
  ): Promise<void> {
    const effectiveGrid = gridConfig ?? { cols: 1, rows: 1 }
    const adapter = this.sessionManager['adapterRegistry'].getDefault()

    // Build lookup of recovered sessions by name (primary) and projectPath (fallback)
    const recoveredByName = new Map<string, typeof recovered[0]>()
    const recoveredByPath = new Map<string, typeof recovered[0]>()
    for (const r of recovered) {
      if (r.name) recoveredByName.set(r.name, r)
      if (r.projectPath) recoveredByPath.set(r.projectPath, r)
    }
    const claimed = new Set<string>() // recovered session IDs already matched

    const slotMap: Array<{ sessionId: string | null; slotIndex: number; topic?: string }> = []

    for (const entry of snapshot) {
      // Try to find a matching recovered session
      let match = recoveredByName.get(entry.name)
      if (match && claimed.has(match.id)) match = undefined
      if (!match) {
        match = recoveredByPath.get(entry.projectPath)
        if (match && claimed.has(match.id)) match = undefined
      }

      if (match) {
        // Reuse recovered session — it's still alive in tmux with Claude running
        claimed.add(match.id)
        slotMap.push({ sessionId: match.id, slotIndex: entry.gridSlot, topic: entry.topic })

        // Restore entity link from snapshot if missing
        if (entry.entityId && !match.entityId) {
          this.sessionManager.linkEntity(match.id, entry.entityId)
        }
        console.log(`[IpcHub] keepWorking: reusing recovered "${match.name}" (${match.id}) → slot ${entry.gridSlot}`)
      } else {
        // No matching recovered session — start new with --resume
        try {
          const escaped = entry.projectPath.replace(/'/g, "'\\''")
          const launchCmd = adapter.buildLaunchCommand({
            projectPath: entry.projectPath,
            sessionName: entry.name,
            resume: true,
          })
          const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
          const autoLaunch = `cd '${escaped}' && clear; ${cmdStr}\n`

          const session = await this.sessionManager.start({
            name: entry.name,
            projectPath: entry.projectPath,
            autoLaunch,
          })
          // Restore entity link for newly created sessions too
          if (entry.entityId) {
            this.sessionManager.linkEntity(session.id, entry.entityId)
          }
          slotMap.push({ sessionId: session.id, slotIndex: entry.gridSlot, topic: entry.topic })
          console.log(`[IpcHub] keepWorking: started new "${entry.name}" (--resume) → slot ${entry.gridSlot}`)
        } catch (err) {
          console.error(`[IpcHub] keepWorking: failed to start "${entry.name}":`, (err as Error).message)
        }
      }
    }

    // Persist grid state to ui.grid in configStore so that useGrid's mount load
    // gets the correct session IDs — eliminates the race condition entirely.
    const total = effectiveGrid.cols * effectiveGrid.rows
    const newSlots: Array<{ sessionId: string | null; rowSpan: number; type: 'session' | 'notes'; notesId?: string; openNoteIds?: string[] }> =
      Array.from({ length: total }, () => ({
        sessionId: null as string | null,
        rowSpan: 1,
        type: 'session' as const,
      }))
    for (const { sessionId, slotIndex } of slotMap) {
      if (slotIndex >= 0 && slotIndex < total) {
        newSlots[slotIndex] = { sessionId, rowSpan: 1, type: 'session' }
      }
    }
    // Restore notes slots
    if (notesSlots) {
      for (const ns of notesSlots) {
        if (ns.slotIndex >= 0 && ns.slotIndex < total && !newSlots[ns.slotIndex].sessionId) {
          newSlots[ns.slotIndex] = {
            sessionId: null,
            rowSpan: 1,
            type: 'notes',
            notesId: ns.notesId || `notes-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            openNoteIds: ns.openNoteIds,
          }
        }
      }
    }
    const gridState = { config: effectiveGrid, slots: newSlots }
    const ui = configStore.get('ui')
    configStore.set('ui', { ...ui, grid: gridState })

    // Also update SessionStore grid state for consistency
    this.sessionManager.persistGridState(gridState)

    // Cache + push for renderer (belt-and-suspenders with config persistence above)
    const payload = { gridConfig: effectiveGrid, slots: slotMap, notesSlots: notesSlots ?? undefined }
    this.cachedKeepWorkingRestore = payload
    this.windowManager.sendToMainWindow(IPC.KEEP_WORKING_RESTORE, payload)
    console.log(`[IpcHub] keepWorking: restore complete — ${slotMap.length} sessions (${claimed.size} reused, ${slotMap.length - claimed.size} new), grid ${effectiveGrid.cols}x${effectiveGrid.rows}`)
    // Debug: append restore result to file
    try {
      const restoreDebug = { ts: new Date().toISOString(), slotMap, gridConfig: effectiveGrid, claimed: claimed.size }
      fs.appendFileSync('/tmp/kw-debug.json', '\n--- RESTORE ---\n' + JSON.stringify(restoreDebug, null, 2))
    } catch { /* ignore */ }
  }

  /** Live-update Keep Working snapshot when grid changes (called on every CONFIG_SAVE_GRID). */
  private async updateKeepWorkingSnapshot(grid: { config: { cols: number; rows: number }; slots: Array<{ sessionId: string | null; type?: string; notesId?: string; openNoteIds?: string[] }> }): Promise<void> {
    const sessions = this.sessionManager.list().filter(s => s.status === 'active')
    if (sessions.length === 0 && !grid.slots.some(s => (s as any).type === 'notes')) return
    const allTasks = this.taskManager ? this.taskManager.list() : []
    const snapshot: Array<{ name: string; projectPath: string; gridSlot: number; entityId?: string; topic?: string }> = []
    for (const s of sessions) {
      const slotIdx = grid.slots.findIndex(slot => slot.sessionId === s.id)
      if (!s.projectPath || slotIdx < 0) continue
      let capture: string | undefined
      try {
        if (s.tmuxPane) capture = await this.tmux.capturePane(s.tmuxPane, 10)
      } catch { /* ignore */ }
      snapshot.push({
        name: s.name ?? 'session',
        projectPath: s.projectPath ?? '',
        gridSlot: slotIdx,
        entityId: s.entityId,
        topic: resolveSessionTopic(s, allTasks, capture),
      })
    }
    // Collect notes slots for restoration
    const notesSlots: Array<{ slotIndex: number; notesId?: string; openNoteIds?: string[] }> = []
    for (let i = 0; i < grid.slots.length; i++) {
      const slot = grid.slots[i] as any
      if (slot.type === 'notes') {
        notesSlots.push({ slotIndex: i, notesId: slot.notesId, openNoteIds: slot.openNoteIds })
      }
    }
    configStore.set('keepWorkingSnapshot', {
      sessions: snapshot,
      gridConfig: grid.config,
      notesSlots: notesSlots.length > 0 ? notesSlots : undefined,
    })
  }

  /** Restore detached windows saved from previous session. Stale entries are skipped. */
  private restoreDetachedWindows(): void {
    const saved = configStore.get('detachedWindows') as Array<{ type: 'session' | 'note'; entityId: string; bounds: { x: number; y: number; width: number; height: number } }> | undefined
    if (!saved || saved.length === 0) return

    const activeSessions = this.sessionManager.list().filter(s => s.status === 'active')
    const sessionIds = new Set(activeSessions.map(s => s.id))

    this.windowManager.restoreDetachedWindows(saved, (entry) => {
      if (entry.type === 'session') {
        return sessionIds.has(entry.entityId)
      }
      // For notes: check if note file still exists
      try {
        const note = this.noteManager.read(entry.entityId)
        return !!note
      } catch {
        return false
      }
    })

    // Clear consumed snapshot
    configStore.set('detachedWindows', undefined as any)
    console.log(`[IpcHub] restored detached windows from snapshot`)

    // Notify main window of detach state
    this.windowManager.sendToMainWindow(IPC.DETACH_STATE_CHANGED, {
      entries: this.windowManager.getDetachedEntries()
    })
  }

  async destroy(): Promise<void> {
    // Keep Working: save snapshot of current sessions before shutdown
    if (configStore.get('keepWorking')) {
      const sessions = this.sessionManager.list().filter(s => s.status === 'active')
      const gridState = this.sessionManager.getSessionStore().getGridState()
      if (sessions.length > 0 && gridState) {
        const allTasks = this.taskManager ? this.taskManager.list() : []
        const snapshot: Array<{ name: string; projectPath: string; gridSlot: number; entityId?: string; topic?: string }> = []
        for (const s of sessions) {
          const slotIdx = gridState.slots.findIndex(slot => slot.sessionId === s.id)
          if (!s.projectPath || slotIdx < 0) continue
          let capture: string | undefined
          try {
            if (s.tmuxPane) capture = await this.tmux.capturePane(s.tmuxPane, 10)
          } catch { /* ignore — session may already be gone */ }
          snapshot.push({
            name: s.name ?? 'session',
            projectPath: s.projectPath ?? '',
            gridSlot: slotIdx,
            entityId: s.entityId,
            topic: resolveSessionTopic(s, allTasks, capture),
          })
        }
        // Collect notes slots for restoration
        const notesSlots: Array<{ slotIndex: number; notesId?: string; openNoteIds?: string[] }> = []
        for (let i = 0; i < gridState.slots.length; i++) {
          const slot = gridState.slots[i] as any
          if (slot.type === 'notes') {
            notesSlots.push({ slotIndex: i, notesId: slot.notesId, openNoteIds: slot.openNoteIds })
          }
        }
        configStore.set('keepWorkingSnapshot', {
          sessions: snapshot,
          gridConfig: gridState.config,
          notesSlots: notesSlots.length > 0 ? notesSlots : undefined,
        })
        console.log(`[IpcHub] keepWorking: saved snapshot of ${snapshot.length} sessions, ${notesSlots.length} notes slots (grid: ${gridState.config.cols}x${gridState.config.rows})`)
      }
    }

    // Save detached windows snapshot for restart restoration
    const detachedEntries = this.windowManager.getDetachedEntries()
    if (detachedEntries.length > 0) {
      configStore.set('detachedWindows', detachedEntries)
      console.log(`[IpcHub] saved ${detachedEntries.length} detached window(s) for restart`)
    } else {
      configStore.set('detachedWindows', undefined as any)
    }

    this.stopBtShutter()
    this.noteManager.destroy()
    this.memoryStore?.close()
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
