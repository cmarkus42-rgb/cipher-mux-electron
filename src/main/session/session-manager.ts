import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ulid } from 'ulidx'
import type { SessionInfo, StartSessionOpts, RecoveryResult, EntityId } from '../../shared/types'
import { MAX_SESSIONS, ORCHESTRATOR_MAX_RETRIES, MPO_MAX_RETRIES } from '../../shared/constants'
import { BRAND } from '../../shared/brand'
import { TmuxManager } from '../tmux/tmux-manager'
import { generateOrchestratorClaudeMd } from './orchestrator-template'
import { generateMpoClaudeMd } from './mpo-template'
import { generateAuditClaudeMd } from './audit-template'
import { EntityRegistry } from './entity-registry'
import { deployEntityAssets } from './entity-assets'
import type { AgentAdapter } from '../agent/agent-adapter'
import type { AdapterRegistry } from '../agent/registry'

/**
 * SessionManager — Registry for cipher-mux sessions.
 *
 * Manages session lifecycle (create, stop, recover) and enforces
 * the MAX_SESSIONS limit. Each session maps to a tmux session.
 */
export interface OrchestratorConfig {
  mcpHost: string
  mcpPort: number
  mcpApiKey: string
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map()
  private tmux: TmuxManager
  private adapterRegistry: AdapterRegistry
  private sessionAdapters: Map<string, AgentAdapter> = new Map()
  private orchestratorSessionId: string | null = null
  private mpoSessionId: string | null = null
  private mcpConfig: OrchestratorConfig | null = null
  /** Entity registry for functional entities. */
  private entityRegistry: EntityRegistry
  /** Maps entity IDs to their active session IDs. */
  private entitySessionIds: Map<EntityId, string> = new Map()
  /** App root for resolving template paths during asset deployment. */
  private appRoot: string
  /**
   * Commands queued to be sent to a session once its terminal reports
   * the real (post-mount) size via markReady(). Prevents launching TUIs
   * like Claude at the default 80x24 before xterm has fitted.
   */
  private pendingLaunch: Map<string, { command: string; timer: NodeJS.Timeout }> = new Map()

  constructor(tmux: TmuxManager, adapterRegistry: AdapterRegistry, entityRegistry?: EntityRegistry, appRoot?: string) {
    super()
    this.tmux = tmux
    this.adapterRegistry = adapterRegistry
    this.entityRegistry = entityRegistry ?? new EntityRegistry()
    this.appRoot = appRoot ?? process.cwd()
  }

  /** Get the entity registry. */
  getEntityRegistry(): EntityRegistry {
    return this.entityRegistry
  }

  /**
   * Set MCP config for auto-injection into new sessions.
   * When set, every new session gets CIPHER_MUX_MCP_URL and CIPHER_MUX_MCP_KEY
   * as environment variables.
   */
  setMcpConfig(config: OrchestratorConfig | null): void {
    this.mcpConfig = config
  }

  /**
   * Start a new session.
   */
  async start(opts: StartSessionOpts): Promise<SessionInfo> {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Maximum sessions (${MAX_SESSIONS}) reached`)
    }

    const id = ulid()
    const tmuxName = `cmux-${id.slice(-8).toLowerCase()}`
    const now = Date.now()

    // Inject CIPHER_MUX_SESSION_ID so the StatusLine hook writes to the
    // correct per-session file in /tmp/cipher-mux/context/.
    let env: Record<string, string> = {
      ...opts.env,
      CIPHER_MUX_SESSION_ID: id,
    }

    // Resolve adapter for this session
    const adapter = this.adapterRegistry.getDefault()

    // Merge MCP env vars if config is set
    if (this.mcpConfig) {
      const mcpUrl = `http://${this.mcpConfig.mcpHost}:${this.mcpConfig.mcpPort}`
      env = {
        ...env,
        CIPHER_MUX_MCP_URL: mcpUrl,
        CIPHER_MUX_MCP_KEY: this.mcpConfig.mcpApiKey,
      }

      // Inject MCP config via adapter (handles CLI + direct settings.json)
      if (opts.projectPath && adapter.supports('mcp-injection') && adapter.postLaunchInjection) {
        const mcpFullUrl = `http://${this.mcpConfig.mcpHost}:${this.mcpConfig.mcpPort}/mcp`
        try {
          await adapter.postLaunchInjection({
            projectPath: opts.projectPath,
            mcpUrl: mcpFullUrl,
            mcpApiKey: this.mcpConfig.mcpApiKey,
            sessionId: id,
          })
        } catch (err) {
          console.warn('[SessionManager] Adapter MCP injection failed:', err)
        }
      }
    }

    // Inject status hook via adapter
    if (opts.projectPath && adapter.supports('status-line') && adapter.attachStatusHook) {
      try {
        await adapter.attachStatusHook(opts.projectPath)
      } catch (err) {
        console.warn('[SessionManager] Adapter statusline hook injection failed:', err)
      }
    }

    // Create tmux session (empty projectPath → home dir)
    const cwd = opts.projectPath || require('os').homedir()
    const tmuxSession = await this.tmux.createSession(tmuxName, {
      cwd,
      command: opts.command,
      env,
    })

    const session: SessionInfo = {
      id,
      name: opts.name,
      projectPath: opts.projectPath,
      tmuxSession: tmuxName,
      tmuxPane: tmuxSession,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      adapterId: adapter.id,
      capabilities: adapter.getCapabilities(),
    }

    this.sessions.set(id, session)
    this.sessionAdapters.set(id, adapter)

    // Start output watcher — emits terminal data with session ULID as ID
    this.tmux.watchSession(tmuxName, id)

    // Queue auto-launch (e.g. `claude --...`) to fire once the renderer
    // reports the real terminal size, so TUIs start at the correct dims.
    if (opts.autoLaunch) {
      this.setPendingLaunch(id, opts.autoLaunch)
    } else if (opts.resume || opts.forkFromClaudeSessionId) {
      // Build auto-launch with resume/fork flags via adapter
      const launchCmd = adapter.buildLaunchCommand({
        projectPath: opts.projectPath || os.homedir(),
        sessionName: opts.name,
        resume: opts.resume,
        forkFromClaudeSessionId: opts.forkFromClaudeSessionId,
      })
      const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
      // When resuming, fall back to fresh start if no prior session exists
      if (opts.resume && !opts.forkFromClaudeSessionId) {
        const fallbackCmd = adapter.buildLaunchCommand({
          projectPath: opts.projectPath || os.homedir(),
          sessionName: opts.name,
        })
        const fallbackStr = [fallbackCmd.cmd, ...fallbackCmd.args].join(' ')
        this.setPendingLaunch(id, `clear; ${cmdStr} || ${fallbackStr}\n`)
      } else {
        this.setPendingLaunch(id, `clear; ${cmdStr}\n`)
      }
    }

    this.emit('session-changed', session)
    return session
  }

  /**
   * Stop a session and kill its tmux session.
   */
  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Stop output watcher before killing session
    this.tmux.unwatchSession(session.tmuxSession)

    try {
      await this.tmux.killSession(session.tmuxSession)
    } catch {
      // tmux session may already be gone
    }

    session.status = 'stopped'
    session.updatedAt = Date.now()
    this.emit('session-stopped', session)
    this.sessions.delete(sessionId)
    this.sessionAdapters.delete(sessionId)
  }

  /**
   * Recover sessions by scanning existing tmux sessions.
   * - Launcher/kickoff sessions (name contains "launcher" or "kickoff") are auto-killed → killed[]
   * - Unknown sessions are presented to the user for adopt/kill → orphaned[]
   * - Known sessions are restored → recovered[]
   */
  async recover(): Promise<RecoveryResult> {
    // Retry up to 3 times with a short delay — tmux may still be
    // initialising right after the control-mode attach.
    let tmuxSessions = await this.tmux.listSessions()
    if (tmuxSessions.length <= 1) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`[SessionManager] recover: only ${tmuxSessions.length} sessions found, retry ${attempt}/2 in 500ms`)
        await new Promise((r) => setTimeout(r, 500))
        tmuxSessions = await this.tmux.listSessions()
        if (tmuxSessions.length > 1) break
      }
    }

    const recovered: SessionInfo[] = []
    const orphaned: SessionInfo[] = []
    const killed: SessionInfo[] = []

    console.log(`[SessionManager] recover: ${tmuxSessions.length} tmux sessions found, ${this.sessions.size} in registry`)
    console.log(`[SessionManager] recover: session names: ${tmuxSessions.map(s => s.name).join(', ')}`)

    for (const tmuxSession of tmuxSessions) {
      // Skip the cipher-mux control session — it's infrastructure, not a user session
      if (tmuxSession.name === 'cipher-mux-control') {
        continue
      }

      // Check if this is one of our sessions (prefix cmux-)
      if (!tmuxSession.name.startsWith('cmux-')) {
        console.log(`[SessionManager] recover: skipping non-cmux session "${tmuxSession.name}"`)
        continue
      }

      // Try to find in our registry
      let found = false
      for (const session of this.sessions.values()) {
        if (session.tmuxSession === tmuxSession.name) {
          session.status = 'active'
          session.updatedAt = Date.now()
          recovered.push(session)
          found = true
          break
        }
      }

      if (!found) {
        const lowerName = tmuxSession.name.toLowerCase()
        const isLauncher = lowerName.includes('launcher') || lowerName.includes('kickoff')

        // Use pane cwd as projectPath when available — gives the user
        // context about what directory the session was working in.
        const projectPath = tmuxSession.paneCwd || null

        const sessionInfo: SessionInfo = {
          id: ulid(),
          name: tmuxSession.name,
          projectPath,
          tmuxSession: tmuxSession.name,
          tmuxPane: null,
          status: 'orphaned',
          createdAt: tmuxSession.created * 1000,
          updatedAt: Date.now(),
        }

        if (isLauncher) {
          // Auto-kill launcher/kickoff sessions — they are transient
          console.log(`[SessionManager] auto-killing launcher/kickoff session: ${tmuxSession.name}`)
          try {
            await this.tmux.killSession(tmuxSession.name)
          } catch {
            // may already be gone
          }
          killed.push(sessionInfo)
        } else {
          // Present unknown sessions to the user for adopt/kill decision
          console.log(`[SessionManager] orphaned session queued for user decision: ${tmuxSession.name} (cwd: ${projectPath ?? 'unknown'})`)
          orphaned.push(sessionInfo)
        }
      }
    }

    // Restore entity links from recovered sessions
    const entityNameMap: Record<string, EntityId> = {
      'Orchestrator': 'orchestrator',
      'MPO': 'mpo',
      'Coding Companion': 'companion',
      'Refinement': 'refinement',
    }
    for (const session of recovered) {
      const entityId = entityNameMap[session.name]
      if (entityId) {
        session.entityId = entityId
        this.entitySessionIds.set(entityId, session.id)
        this.entityRegistry.linkSession(session.id, entityId)
        if (entityId === 'orchestrator') this.orchestratorSessionId = session.id
        if (entityId === 'mpo') this.mpoSessionId = session.id
      }
    }

    console.log(`[SessionManager] recover result: ${recovered.length} recovered, ${orphaned.length} orphaned, ${killed.length} killed`)
    return { recovered, orphaned, killed }
  }

  /**
   * Adopt an orphaned tmux session into the session registry.
   */
  async adoptOrphan(tmuxSessionName: string, displayName?: string): Promise<SessionInfo> {
    const id = ulid()
    const now = Date.now()
    const session: SessionInfo = {
      id,
      name: displayName ?? tmuxSessionName,
      projectPath: null,
      tmuxSession: tmuxSessionName,
      tmuxPane: tmuxSessionName,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    this.sessions.set(id, session)
    this.tmux.watchSession(tmuxSessionName, id)
    console.log(`[SessionManager] adopted orphan "${tmuxSessionName}" as session ${id}`)
    this.emit('session-changed', session)
    return session
  }

  /**
   * Kill an orphaned tmux session (no registry entry).
   */
  async killOrphan(tmuxSessionName: string): Promise<void> {
    try { await this.tmux.killSession(tmuxSessionName) } catch { /* may be gone */ }
  }

  /**
   * Get all sessions.
   */
  list(): SessionInfo[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Get a single session by ID.
   */
  get(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get count of active sessions.
   */
  activeCount(): number {
    let count = 0
    for (const s of this.sessions.values()) {
      if (s.status === 'active') count++
    }
    return count
  }

  /**
   * Send keys to a session's tmux pane.
   */
  async sendKeys(sessionId: string, keys: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    const target = session.tmuxPane ?? session.tmuxSession
    await this.tmux.sendKeys(target, keys)
  }

  /**
   * Resize a session's tmux pane.
   */
  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    const target = session.tmuxPane ?? session.tmuxSession
    await this.tmux.resizePane(target, cols, rows)
  }

  /**
   * Queue a command to be sent once the renderer reports its real
   * terminal size via markReady(). Falls back to firing after 4s.
   */
  setPendingLaunch(sessionId: string, command: string): void {
    const existing = this.pendingLaunch.get(sessionId)
    if (existing) clearTimeout(existing.timer)
    const timer = setTimeout(() => {
      console.warn(`[SessionManager] pending launch fallback fired for ${sessionId}`)
      this.flushPendingLaunch(sessionId).catch((err) => {
        console.error('[SessionManager] pending launch flush error:', err)
      })
    }, 4000)
    this.pendingLaunch.set(sessionId, { command, timer })
  }

  /**
   * Called by the renderer after xterm has mounted and applied its first
   * real resize. Resizes the pane once more (defensive) and flushes any
   * pending launch command so the TUI starts at the right size.
   */
  async markReady(sessionId: string, cols: number, rows: number): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    // Apply the resize defensively — renderer already did it, but a second
    // pass ensures tmux state matches before we launch a TUI.
    const target = session.tmuxPane ?? session.tmuxSession
    try {
      await this.tmux.resizePane(target, cols, rows)
    } catch (err) {
      console.warn('[SessionManager] markReady resize failed:', err)
    }
    // Give tmux time to propagate the new size to the pane's process group
    // before spawning a TUI that reads size once at startup. 250ms is a
    // conservative upper bound — on slow machines 100ms was racy and claude
    // would start at 80x24, ending up with the input line in the wrong row.
    await new Promise((r) => setTimeout(r, 250))
    await this.flushPendingLaunch(sessionId)
  }

  private async flushPendingLaunch(sessionId: string): Promise<void> {
    const pending = this.pendingLaunch.get(sessionId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingLaunch.delete(sessionId)
    try {
      await this.sendKeys(sessionId, pending.command)
    } catch (err) {
      console.warn('[SessionManager] sending pending launch failed:', err)
    }
  }

  /**
   * Capture content from a session's pane.
   */
  async capture(sessionId: string, lines?: number): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    const target = session.tmuxPane ?? session.tmuxSession
    return this.tmux.capturePane(target, lines)
  }

  // ─── Adapter ──────────────────────────────────────────

  /**
   * Get the adapter associated with a session.
   */
  getAdapterForSession(sessionId: string): AgentAdapter | undefined {
    return this.sessionAdapters.get(sessionId)
  }

  // ─── Entity Framework ───────────────────────────────────

  /**
   * Start an entity session by ID. Deploys assets if needed, creates
   * the session, and tags it with the entity ID.
   */
  async startEntity(entityId: EntityId, opts?: Partial<StartSessionOpts>): Promise<SessionInfo> {
    const config = this.entityRegistry.get(entityId)
    if (!config) {
      throw new Error(`Unknown entity: ${entityId}`)
    }

    // Check if already running
    const existingId = this.entitySessionIds.get(entityId)
    if (existingId) {
      const existing = this.sessions.get(existingId)
      if (existing && existing.status === 'active') {
        throw new Error(`${config.displayName} is already running`)
      }
      this.entitySessionIds.delete(entityId)
      this.entityRegistry.unlinkSession(existingId)
    }

    // Deploy assets if this entity has a template
    if (config.templatePath) {
      deployEntityAssets(config, this.appRoot)
    }

    // Ensure entity directory exists
    fs.mkdirSync(config.projectPath, { recursive: true })

    // Write CLAUDE.md for entities without asset templates
    if (!config.templatePath) {
      const claudeMdPath = path.join(config.projectPath, 'CLAUDE.md')
      if (config.id === 'audit') {
        fs.writeFileSync(claudeMdPath, generateAuditClaudeMd(), 'utf-8')
      } else if (!fs.existsSync(claudeMdPath)) {
        fs.writeFileSync(claudeMdPath, `# ${config.displayName}\n\n${config.displayName} Persona — wird vom User konfiguriert.\n`, 'utf-8')
      }
    }

    // Write .mcp.json for MCP auto-discovery (if entity uses MCP)
    if (config.features.includes('mcp') && this.mcpConfig) {
      const mcpUrl = `http://${this.mcpConfig.mcpHost}:${this.mcpConfig.mcpPort}/mcp`
      const mcpJsonPath = path.join(config.projectPath, '.mcp.json')
      const mcpJson = {
        mcpServers: {
          'cipher-mux': {
            type: 'http',
            url: mcpUrl,
            headers: { Authorization: `Bearer ${this.mcpConfig.mcpApiKey}` },
          },
        },
      }
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2), 'utf-8')
    }

    // Start session
    const session = await this.start({
      name: config.displayName,
      projectPath: config.projectPath,
      ...opts,
    })

    // Tag session with entity
    session.entityId = entityId
    this.entitySessionIds.set(entityId, session.id)
    this.entityRegistry.linkSession(session.id, entityId)

    // Backward compat: update orchestrator/mpo session ID refs
    if (entityId === 'orchestrator') this.orchestratorSessionId = session.id
    if (entityId === 'mpo') this.mpoSessionId = session.id

    this.emit('entity-started', { entityId, session })
    return session
  }

  /**
   * Queue Claude Code launch for an entity session.
   */
  queueEntityClaude(entityId: EntityId): void {
    const sessionId = this.entitySessionIds.get(entityId)
    if (!sessionId) {
      throw new Error(`${entityId} is not running`)
    }
    const config = this.entityRegistry.get(entityId)
    if (!config) return

    const adapter = this.adapterRegistry.getDefault()
    const useResume = config.autoResume ?? true
    const launchCmd = adapter.buildLaunchCommand({
      projectPath: config.projectPath,
      sessionName: config.displayName,
      isOrchestrator: entityId === 'orchestrator',
      isMpo: entityId === 'mpo',
      resume: useResume,
    })
    const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
    // When resuming, fall back to fresh start if no prior session exists
    if (useResume) {
      const fallbackCmd = adapter.buildLaunchCommand({
        projectPath: config.projectPath,
        sessionName: config.displayName,
        isOrchestrator: entityId === 'orchestrator',
        isMpo: entityId === 'mpo',
      })
      const fallbackStr = [fallbackCmd.cmd, ...fallbackCmd.args].join(' ')
      this.setPendingLaunch(sessionId, `clear; ${cmdStr} || ${fallbackStr}\n`)
    } else {
      this.setPendingLaunch(sessionId, `clear; ${cmdStr}\n`)
    }
  }

  /**
   * Stop an entity session.
   */
  async stopEntity(entityId: EntityId): Promise<void> {
    const sessionId = this.entitySessionIds.get(entityId)
    if (!sessionId) return // already stopped
    try {
      await this.stop(sessionId)
    } catch {
      // Session may already be gone
    }
    this.entitySessionIds.delete(entityId)
    this.entityRegistry.unlinkSession(sessionId)

    // Backward compat
    if (entityId === 'orchestrator') this.orchestratorSessionId = null
    if (entityId === 'mpo') this.mpoSessionId = null

    this.emit('entity-stopped', { entityId })
  }

  /**
   * Check if an entity is currently running.
   */
  isEntityRunning(entityId: EntityId): boolean {
    const sessionId = this.entitySessionIds.get(entityId)
    if (!sessionId) return false
    const session = this.sessions.get(sessionId)
    return (session?.status === 'active') || false
  }

  /**
   * Get the session ID for an entity (or null).
   */
  getEntitySessionId(entityId: EntityId): string | null {
    return this.entitySessionIds.get(entityId) ?? null
  }

  // ─── Orchestrator ─────────────────────────────────────

  /**
   * Resolve the orchestrator directory path (expand ~).
   */
  private resolveOrchestratorDir(): string {
    return BRAND.orchestratorDir.replace(/^~/, os.homedir())
  }

  /**
   * Start the Orchestrator session.
   * Creates the orchestrator directory and CLAUDE.md, then starts
   * a special session pointing at that directory.
   */
  async startOrchestrator(config: OrchestratorConfig): Promise<SessionInfo> {
    if (this.orchestratorSessionId) {
      const existing = this.sessions.get(this.orchestratorSessionId)
      if (existing && existing.status === 'active') {
        throw new Error('Orchestrator is already running')
      }
      // Stale reference — clear it
      this.orchestratorSessionId = null
    }

    const orchestratorDir = this.resolveOrchestratorDir()

    // Ensure directory exists
    fs.mkdirSync(orchestratorDir, { recursive: true })

    // Generate and write CLAUDE.md with adapter-specific prompt fragment
    const adapter = this.adapterRegistry.getDefault()
    const claudeMd = generateOrchestratorClaudeMd({
      mcpHost: config.mcpHost,
      mcpPort: config.mcpPort,
      mcpApiKey: config.mcpApiKey,
      maxRetries: ORCHESTRATOR_MAX_RETRIES,
      adapterFragment: adapter.buildOrchestratorPromptFragment('de'),
    })
    fs.writeFileSync(path.join(orchestratorDir, 'CLAUDE.md'), claudeMd, 'utf-8')

    // Write .mcp.json into the orchestrator project directory.
    // Claude Code reads this file when starting in the project dir.
    const mcpUrl = `http://${config.mcpHost}:${config.mcpPort}/mcp`
    const mcpJsonPath = path.join(orchestratorDir, '.mcp.json')
    const mcpJson = {
      mcpServers: {
        'cipher-mux': {
          type: 'http',
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${config.mcpApiKey}`,
          },
        },
      },
    }
    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2), 'utf-8')

    // MCP registration via `claude mcp add-json` happens automatically
    // in start() when mcpConfig is set. The .mcp.json above is an
    // additional fallback specific to the orchestrator directory.

    // Start session — command is sent separately after renderer has resized
    const session = await this.start({
      name: 'Orchestrator',
      projectPath: orchestratorDir,
    })

    this.orchestratorSessionId = session.id
    this.emit('orchestrator-started', session)
    return session
  }

  /**
   * Queue Claude Code launch in the Orchestrator session.
   * The command is sent only after the renderer marks the terminal ready
   * with its real size, so the TUI doesn't start at tmux's default 80x24.
   */
  queueOrchestratorClaude(): void {
    if (!this.orchestratorSessionId) {
      throw new Error('Orchestrator is not running')
    }
    const adapter = this.adapterRegistry.getDefault()
    const launchCmd = adapter.buildLaunchCommand({
      projectPath: this.resolveOrchestratorDir(),
      sessionName: 'Orchestrator',
      isOrchestrator: true,
      resume: true,
    })
    const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
    this.setPendingLaunch(
      this.orchestratorSessionId,
      `clear; ${cmdStr}\n`,
    )
  }

  /**
   * Stop the Orchestrator session.
   */
  async stopOrchestrator(): Promise<void> {
    if (!this.orchestratorSessionId) {
      throw new Error('Orchestrator is not running')
    }
    await this.stop(this.orchestratorSessionId)
    this.orchestratorSessionId = null
    this.emit('orchestrator-stopped')
  }

  /**
   * Check if the Orchestrator is currently running.
   */
  isOrchestratorRunning(): boolean {
    if (!this.orchestratorSessionId) return false
    const session = this.sessions.get(this.orchestratorSessionId)
    return (session?.status === 'active') || false
  }

  /**
   * Get the Orchestrator session ID (or null).
   */
  getOrchestratorSessionId(): string | null {
    return this.orchestratorSessionId
  }

  // ─── MPO (Multi-Project Orchestrator) ───────────────

  /**
   * Resolve the MPO directory path (expand ~).
   */
  private resolveMpoDir(): string {
    return BRAND.mpoDir.replace(/^~/, os.homedir())
  }

  /**
   * Start the MPO session.
   * Creates the MPO directory and CLAUDE.md, then starts
   * a special session pointing at that directory.
   */
  async startMpo(config: OrchestratorConfig): Promise<SessionInfo> {
    if (this.mpoSessionId) {
      const existing = this.sessions.get(this.mpoSessionId)
      if (existing && existing.status === 'active') {
        throw new Error('MPO is already running')
      }
      this.mpoSessionId = null
    }

    const mpoDir = this.resolveMpoDir()
    fs.mkdirSync(mpoDir, { recursive: true })

    // Generate CLAUDE.md with adapter-specific prompt fragment
    const adapter = this.adapterRegistry.getDefault()
    const claudeMd = generateMpoClaudeMd({
      mcpHost: config.mcpHost,
      mcpPort: config.mcpPort,
      mcpApiKey: config.mcpApiKey,
      maxRetries: MPO_MAX_RETRIES,
      adapterFragment: adapter.buildMpoPromptFragment('de'),
    })
    fs.writeFileSync(path.join(mpoDir, 'CLAUDE.md'), claudeMd, 'utf-8')

    // Write .mcp.json for Claude Code MCP auto-discovery
    const mcpUrl = `http://${config.mcpHost}:${config.mcpPort}/mcp`
    const mcpJsonPath = path.join(mpoDir, '.mcp.json')
    const mcpJson = {
      mcpServers: {
        'cipher-mux': {
          type: 'http',
          url: mcpUrl,
          headers: { Authorization: `Bearer ${config.mcpApiKey}` },
        },
      },
    }
    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2), 'utf-8')

    const session = await this.start({
      name: 'MPO',
      projectPath: mpoDir,
    })

    this.mpoSessionId = session.id
    this.emit('mpo-started', session)
    return session
  }

  /**
   * Queue Claude Code launch in the MPO session.
   */
  queueMpoClaude(): void {
    if (!this.mpoSessionId) {
      throw new Error('MPO is not running')
    }
    const adapter = this.adapterRegistry.getDefault()
    const launchCmd = adapter.buildLaunchCommand({
      projectPath: this.resolveMpoDir(),
      sessionName: 'MPO',
      isMpo: true,
      resume: true,
    })
    const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
    this.setPendingLaunch(this.mpoSessionId, `clear; ${cmdStr}\n`)
  }

  /**
   * Stop the MPO session.
   */
  async stopMpo(): Promise<void> {
    if (!this.mpoSessionId) {
      return // already stopped — no-op
    }
    try {
      await this.stop(this.mpoSessionId)
    } catch {
      // Session may already be gone (killed externally)
    }
    this.mpoSessionId = null
    this.emit('mpo-stopped')
  }

  /**
   * Check if the MPO is currently running.
   */
  isMpoRunning(): boolean {
    if (!this.mpoSessionId) return false
    const session = this.sessions.get(this.mpoSessionId)
    return (session?.status === 'active') || false
  }

  /**
   * Get the MPO session ID (or null).
   */
  getMpoSessionId(): string | null {
    return this.mpoSessionId
  }

  // ─── Session Resume / Fork ──────────────────────────────

  /**
   * Update the Claude Code session ID for a session (tracked from statusline).
   */
  updateClaudeSessionId(sessionId: string, claudeSessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.claudeSessionId = claudeSessionId
      session.updatedAt = Date.now()
    }
  }

  /**
   * Fork an existing session: creates a new session with --fork-session --resume <id>.
   */
  async forkSession(sourceSessionId: string): Promise<SessionInfo> {
    const source = this.sessions.get(sourceSessionId)
    if (!source) throw new Error(`Source session ${sourceSessionId} not found`)

    // Try to read Claude session ID from statusline file if not already set
    if (!source.claudeSessionId) {
      const statusFile = path.join(BRAND.statusLineDir, `${sourceSessionId}.json`)
      try {
        const raw = fs.readFileSync(statusFile, 'utf-8')
        const data = JSON.parse(raw)
        const sid = data?.session_id || data?.sessionId
        if (typeof sid === 'string' && sid) {
          source.claudeSessionId = sid
          source.updatedAt = Date.now()
        }
      } catch {
        // File may not exist or be invalid
      }
    }
    if (!source.claudeSessionId) {
      throw new Error('Source session has no Claude session ID — cannot fork')
    }

    const adapter = this.adapterRegistry.getDefault()
    const launchCmd = adapter.buildLaunchCommand({
      projectPath: source.projectPath || os.homedir(),
      sessionName: `${source.name}-fork`,
      forkFromClaudeSessionId: source.claudeSessionId,
    })
    const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')

    const newSession = await this.start({
      name: `${source.name}-fork`,
      projectPath: source.projectPath || '',
    })

    this.setPendingLaunch(newSession.id, `clear; ${cmdStr}\n`)
    return newSession
  }

  // ─── Orphan Detection ─────────────────────────────────

  private orphanTimer: NodeJS.Timeout | null = null

  /**
   * Start periodic orphan detection (every 5 minutes).
   */
  startOrphanDetection(): void {
    if (this.orphanTimer) return
    this.orphanTimer = setInterval(() => {
      this.detectOrphans().catch((err) => {
        console.error('[SessionManager] orphan detection error:', err)
      })
    }, 5 * 60 * 1000)
  }

  /**
   * Stop periodic orphan detection.
   */
  stopOrphanDetection(): void {
    if (this.orphanTimer) {
      clearInterval(this.orphanTimer)
      this.orphanTimer = null
    }
  }

  /**
   * Detect orphaned cmux-* sessions not in the registry.
   */
  async detectOrphans(): Promise<SessionInfo[]> {
    let tmuxSessions: Array<{ name: string; created: number; paneCwd?: string | null }>
    try {
      tmuxSessions = await this.tmux.listSessions()
    } catch {
      return []
    }

    const knownTmuxNames = new Set<string>()
    for (const session of this.sessions.values()) {
      knownTmuxNames.add(session.tmuxSession)
    }

    const orphans: SessionInfo[] = []
    for (const ts of tmuxSessions) {
      if (ts.name === 'cipher-mux-control') continue
      if (!ts.name.startsWith('cmux-')) continue
      if (knownTmuxNames.has(ts.name)) continue

      orphans.push({
        id: ulid(),
        name: ts.name,
        projectPath: ts.paneCwd || null,
        tmuxSession: ts.name,
        tmuxPane: null,
        status: 'orphaned',
        createdAt: ts.created * 1000,
        updatedAt: Date.now(),
      })
    }

    if (orphans.length > 0) {
      this.emit('orphans-detected', orphans)
    }
    return orphans
  }

  /**
   * Disconnect from tmux without killing sessions.
   * Sessions survive app quit and are recovered on next launch.
   */
  async destroy(): Promise<void> {
    this.stopOrphanDetection()
    this.sessions.clear()
    this.tmux.disconnect()
  }
}
