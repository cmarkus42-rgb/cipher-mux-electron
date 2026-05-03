import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ulid } from 'ulidx'
import type { SessionInfo, StartSessionOpts, RecoveryResult, EntityId } from '../../shared/types'
import { MAX_SESSIONS } from '../../shared/constants'
import { BRAND } from '../../shared/brand'
import { TmuxManager } from '../tmux/tmux-manager'
import { generateAuditClaudeMd } from './audit-template'
import { generateVoiceRelayClaudeMd } from './voice-relay-template'
import { generateDebuggerClaudeMd } from '../debugger/debugger-template'
import { generateBugreportPresetClaudeMd } from '../bugreport/bugreport-preset-template'
import { EntityRegistry } from './entity-registry'
import { deployEntityAssets, ensureTemplateSettings } from './entity-assets'
import { SessionStore } from './session-store'
import { runCommand } from '../util/exec-util'
import type { PersistedSession, PersistedGridState } from './session-store'
import type { AgentAdapter } from '../agent/agent-adapter'
import type { AdapterRegistry } from '../agent/registry'
import { configStore } from '../config/config-store'
import { getCachedGlobalRules } from '../config/global-rules'
import { extractCharacterBlock } from '../character/character-defaults'
import { resolvePersonaForPreset } from './persona-resolver'

/**
 * Sanitize a name for use as tmux session suffix.
 * Lowercase, special chars → dash, max 32 chars, no leading/trailing dashes.
 */
function sanitizeTmuxName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
    || 'session'
}

/** MCP tool permission prefix. */
const MCP_PREFIX = 'mcp__cipher-mux__'

/**
 * Return pre-approved MCP tool permissions for a given entity.
 * Entities WITH a templatePath get permissions from their template's
 * settings.local.json. This function covers template-less entities only.
 */
function getMcpPermissionsForEntity(entityId: EntityId): string[] {
  switch (entityId) {
    case 'voice-relay':
      return [
        `${MCP_PREFIX}mux_sessions`,
        `${MCP_PREFIX}mux_status`,
        `${MCP_PREFIX}mux_read`,
        `${MCP_PREFIX}mux_send`,
        `${MCP_PREFIX}mux_context_usage`,
        `${MCP_PREFIX}mux_create_session`,
        `${MCP_PREFIX}mux_kill_session`,
        `${MCP_PREFIX}mux_task_list`,
        `${MCP_PREFIX}mux_task_get`,
        `${MCP_PREFIX}mux_notes_create`,
        `${MCP_PREFIX}mux_notes_list`,
        `${MCP_PREFIX}mux_notes_search`,
        `${MCP_PREFIX}mux_notes_read`,
        `${MCP_PREFIX}mux_grid_resize`,
        `${MCP_PREFIX}mux_grid_place`,
        `${MCP_PREFIX}mux_session_focus`,
        `${MCP_PREFIX}mux_session_eject`,
        `${MCP_PREFIX}mux_sidebar_toggle`,
        `${MCP_PREFIX}mux_tts_speak`,
        `${MCP_PREFIX}mux_ui_open`,
        `${MCP_PREFIX}mux_ui_highlight`,
        `${MCP_PREFIX}mux_theme_set`,
        `${MCP_PREFIX}mux_bugreport_resolve`,
        `${MCP_PREFIX}companion_memory_write`,
        `${MCP_PREFIX}companion_memory_recall`,
        `${MCP_PREFIX}companion_memory_search`,
        `${MCP_PREFIX}companion_memory_forget`,
      ]
    case 'orchestrator':
    case 'cyber-factory':
    case 'launcher':
      return [
        `${MCP_PREFIX}mux_sessions`,
        `${MCP_PREFIX}mux_status`,
        `${MCP_PREFIX}mux_read`,
        `${MCP_PREFIX}mux_send`,
        `${MCP_PREFIX}mux_context_usage`,
        `${MCP_PREFIX}mux_create_session`,
        `${MCP_PREFIX}mux_kill_session`,
        `${MCP_PREFIX}mux_task_create`,
        `${MCP_PREFIX}mux_task_update`,
        `${MCP_PREFIX}mux_task_list`,
        `${MCP_PREFIX}mux_task_get`,
        `${MCP_PREFIX}mux_input_request_create`,
        `${MCP_PREFIX}mux_notes_create`,
        `${MCP_PREFIX}mux_notes_list`,
        `${MCP_PREFIX}mux_notes_search`,
        `${MCP_PREFIX}mux_notes_read`,
        `${MCP_PREFIX}mux_notes_update`,
        `${MCP_PREFIX}mux_notes_delete`,
        `${MCP_PREFIX}mux_notes_handoff_create`,
        `${MCP_PREFIX}mux_notes_handoff_search`,
        `${MCP_PREFIX}mux_bugreport_resolve`,
        `${MCP_PREFIX}mux_grid_resize`,
        `${MCP_PREFIX}mux_grid_place`,
        `${MCP_PREFIX}mux_session_focus`,
        `${MCP_PREFIX}mux_session_eject`,
        `${MCP_PREFIX}mux_sidebar_toggle`,
        `${MCP_PREFIX}mux_tts_speak`,
        `${MCP_PREFIX}kickoff_complete`,
        'Bash(tmux:*)',
      ]
    case 'audit':
      return [
        `${MCP_PREFIX}mux_sessions`,
        `${MCP_PREFIX}mux_status`,
        `${MCP_PREFIX}mux_read`,
        `${MCP_PREFIX}mux_context_usage`,
        `${MCP_PREFIX}mux_notes_create`,
        `${MCP_PREFIX}mux_notes_list`,
        `${MCP_PREFIX}mux_notes_search`,
        `${MCP_PREFIX}mux_notes_read`,
      ]
    default:
      return []
  }
}

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
  private cyberFactorySessionId: string | null = null
  private mcpConfig: OrchestratorConfig | null = null
  /** Entity registry for functional entities. */
  private entityRegistry: EntityRegistry
  /** Maps entity IDs to their active session IDs (supports multi-instance). */
  private entitySessionIds: Map<EntityId, Set<string>> = new Map()
  /** Mutex: entities currently being started (prevents double-start race). */
  private startingEntities: Set<EntityId> = new Set()
  /** App root for resolving template paths during asset deployment. */
  private appRoot: string
  /**
   * Commands queued to be sent to a session once its terminal reports
   * the real (post-mount) size via markReady(). Prevents launching TUIs
   * like Claude at the default 80x24 before xterm has fitted.
   */
  private pendingLaunch: Map<string, { command: string; timer: NodeJS.Timeout }> = new Map()
  /** Sessions that had an autoLaunch command (Claude CLI). Plain terminal sessions are NOT in this set. */
  private autoLaunchedSessions: Set<string> = new Set()
  /** Persistent session store — survives app restarts. */
  private sessionStore: SessionStore

  constructor(tmux: TmuxManager, adapterRegistry: AdapterRegistry, entityRegistry?: EntityRegistry, appRoot?: string) {
    super()
    this.tmux = tmux
    this.adapterRegistry = adapterRegistry
    this.entityRegistry = entityRegistry ?? new EntityRegistry()
    this.appRoot = appRoot ?? process.cwd()
    this.sessionStore = new SessionStore()
  }

  // ─── Entity Session Tracking Helpers ─────────────────────
  private addEntitySession(entityId: EntityId, sessionId: string): void {
    let set = this.entitySessionIds.get(entityId)
    if (!set) {
      set = new Set()
      this.entitySessionIds.set(entityId, set)
    }
    set.add(sessionId)
  }

  private removeEntitySession(entityId: EntityId, sessionId: string): void {
    const set = this.entitySessionIds.get(entityId)
    if (!set) return
    set.delete(sessionId)
    if (set.size === 0) this.entitySessionIds.delete(entityId)
  }

  private getFirstEntitySessionId(entityId: EntityId): string | undefined {
    const set = this.entitySessionIds.get(entityId)
    if (!set || set.size === 0) return undefined
    return set.values().next().value as string
  }

  private getAllEntitySessionIds(entityId: EntityId): string[] {
    const set = this.entitySessionIds.get(entityId)
    return set ? Array.from(set) : []
  }

  /** Get the session store for external grid-state persistence. */
  getSessionStore(): SessionStore {
    return this.sessionStore
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
    const shortId = id.slice(-4).toLowerCase()
    const tmuxName = opts.name
      ? `cmux-${sanitizeTmuxName(opts.name)}-${shortId}`
      : `cmux-${id.slice(-8).toLowerCase()}`
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

    // Inject workspace prompt + context directories into project CLAUDE.md
    if (opts.projectPath && (opts.workspacePrompt || opts.contextPaths?.length)) {
      try {
        this.injectWorkspaceSections(opts.projectPath, opts.workspacePrompt, opts.contextPaths)
      } catch (err) {
        console.warn('[SessionManager] Workspace section injection failed:', err)
      }
    }

    // REQ-GLOBAL-002: Inject global rules into manual (non-entity) sessions.
    // Entity sessions are handled in startEntity() before this point.
    if (opts.projectPath && !opts._entityInjected) {
      this.injectGlobalRulesSection(opts.projectPath)
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

    // Persist to disk
    this.persistSession(session)

    // Start output watcher — emits terminal data with session ULID as ID
    this.tmux.watchSession(tmuxName, id)

    // Queue auto-launch (e.g. `claude --...`) to fire once the renderer
    // reports the real terminal size, so TUIs start at the correct dims.
    if (opts.autoLaunch) {
      this.autoLaunchedSessions.add(id)
      this.setPendingLaunch(id, opts.autoLaunch)
    } else if (opts.forkFromClaudeSessionId) {
      // Build auto-launch with fork flag via adapter
      this.autoLaunchedSessions.add(id)
      const launchCmd = adapter.buildLaunchCommand({
        projectPath: opts.projectPath || os.homedir(),
        sessionName: opts.name,
        forkFromClaudeSessionId: opts.forkFromClaudeSessionId,
      })
      const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
      this.setPendingLaunch(id, `clear; ${cmdStr}\n`)
    }

    this.emit('session-changed', session)
    return session
  }

  /**
   * Graceful stop: immediately removes the session from the grid (cell becomes
   * free), then sends a shutdown prompt to the tmux session in the background.
   * The session has up to timeoutMs to clean up before a hard kill.
   */
  async gracefulStop(sessionId: string, timeoutMs = 30_000): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // 1. Immediately free the cell — stop watching, remove from grid + state
    this.tmux.unwatchSession(session.tmuxSession)
    const tmuxName = session.tmuxSession
    session.status = 'stopped'
    session.updatedAt = Date.now()
    this.emit('session-stopped', session)
    this.sessions.delete(sessionId)
    this.sessionAdapters.delete(sessionId)
    this.autoLaunchedSessions.delete(sessionId)
    if (session.entityId) {
      const entityId = session.entityId as EntityId
      this.removeEntitySession(entityId, sessionId)
      this.entityRegistry.unlinkSession(sessionId)
      if (entityId === 'orchestrator') this.orchestratorSessionId = null
      if (entityId === 'cyber-factory') this.cyberFactorySessionId = null
    }
    this.sessionStore.removeSession(sessionId)
    this._cleanupGridSlot(sessionId)

    // 2. Send shutdown prompt and wait in background — fire-and-forget
    this._backgroundGracefulKill(tmuxName, timeoutMs).catch((err) => {
      console.error(`[SessionManager] Background graceful kill error:`, (err as Error).message)
    })
  }

  /** Background: send shutdown prompt, poll, then hard-kill on timeout. */
  private async _backgroundGracefulKill(tmuxName: string, timeoutMs: number): Promise<void> {
    const shutdownPrompt = [
      'Deine Session wird beendet. Bevor du gehst:',
      '1. Gibt es ungespeicherte Ergebnisse? → Als Note anlegen oder ins Memory schreiben',
      '2. Gibt es offene Findings? → Dokumentieren',
      '3. Gibt es laufende Aufgaben? → Status melden',
      'Wenn alles erledigt ist, beende dich mit /exit.',
    ].join('\n')

    try {
      await this.tmux.sendKeys(tmuxName, shutdownPrompt + '\r')
    } catch {
      // Can't send keys — just kill it
      console.warn(`[SessionManager] Could not send graceful prompt to tmux "${tmuxName}", hard-killing`)
      try { await this.tmux.killSession(tmuxName) } catch { /* already gone */ }
      return
    }

    // Poll until tmux session disappears or timeout
    const pollInterval = 2_000
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollInterval))
      try {
        await runCommand('tmux', ['has-session', '-t', tmuxName])
        // Still alive, keep waiting
      } catch {
        // Session exited gracefully
        console.log(`[SessionManager] tmux "${tmuxName}" exited gracefully`)
        return
      }
    }

    // Timeout — hard kill
    console.warn(`[SessionManager] Graceful shutdown timed out for tmux "${tmuxName}", hard-killing`)
    try { await this.tmux.killSession(tmuxName) } catch { /* already gone */ }
  }

  /** Clean up grid slots referencing a session. */
  private _cleanupGridSlot(sessionId: string): void {
    const gridState = this.sessionStore.getGridState()
    if (gridState) {
      let dirty = false
      for (const slot of gridState.slots) {
        if (slot.sessionId === sessionId) {
          slot.sessionId = null
          dirty = true
        }
      }
      if (dirty) {
        this.sessionStore.saveGridState(gridState)
      }
    }
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

    // Kill tmux session — retry once if first attempt fails (e.g. control-mode lag)
    const tmuxName = session.tmuxSession
    try {
      await this.tmux.killSession(tmuxName)
    } catch {
      // Retry after short delay
      try {
        await new Promise((r) => setTimeout(r, 200))
        await this.tmux.killSession(tmuxName)
      } catch {
        console.warn(`[SessionManager] tmux kill-session failed for "${tmuxName}", session may linger as orphan`)
      }
    }

    session.status = 'stopped'
    session.updatedAt = Date.now()
    this.emit('session-stopped', session)
    this.sessions.delete(sessionId)
    this.sessionAdapters.delete(sessionId)
    this.autoLaunchedSessions.delete(sessionId)

    // Clean up entity links if this was an entity session
    if (session.entityId) {
      const entityId = session.entityId as EntityId
      this.removeEntitySession(entityId, sessionId)
      this.entityRegistry.unlinkSession(sessionId)
      if (entityId === 'orchestrator') this.orchestratorSessionId = null
      if (entityId === 'cyber-factory') this.cyberFactorySessionId = null
    }

    // Remove from persistent store — must happen AFTER in-memory cleanup
    // so that any concurrent persistGridState() call (debounced from renderer)
    // will also filter this session out via the this.sessions.has() check.
    this.sessionStore.removeSession(sessionId)
    this._cleanupGridSlot(sessionId)
  }

  /**
   * Recover sessions by cross-referencing sessions.json with live tmux sessions.
   *
   * Flow:
   * 1. Load sessions.json → for each entry, check if tmux session is still alive
   *    - alive → recovered (entity links restored from file)
   *    - gone  → cleaned up (removed from store)
   * 2. Scan tmux for cmux-* sessions NOT in sessions.json → orphaned
   * 3. Auto-kill launcher/kickoff orphans
   * 4. If no sessions.json: fall back to tmux-only enumeration with entityNameMap
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

    console.log(`[SessionManager] recover: ${tmuxSessions.length} tmux sessions found`)

    // Build a set of live tmux session names for quick lookup
    const liveTmuxNames = new Set(tmuxSessions.map(s => s.name))
    // Track which tmux sessions are claimed by sessions.json
    const claimedTmuxNames = new Set<string>()

    // ── Step 1: Try sessions.json-based recovery ──
    const hasStore = this.sessionStore.load()

    if (hasStore) {
      const persisted = this.sessionStore.getSessions()
      console.log(`[SessionManager] recover: sessions.json has ${persisted.length} entries`)

      for (const ps of persisted) {
        if (liveTmuxNames.has(ps.tmuxSession)) {
          // tmux session still alive → recover
          const session: SessionInfo = {
            id: ps.id,
            name: ps.name,
            projectPath: ps.projectPath,
            tmuxSession: ps.tmuxSession,
            tmuxPane: null,
            status: 'active',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            entityId: ps.entityId ?? undefined,
          }
          this.sessions.set(session.id, session)
          this.tmux.watchSession(ps.tmuxSession, session.id)
          recovered.push(session)
          claimedTmuxNames.add(ps.tmuxSession)

          // Restore entity links
          if (ps.entityId) {
            this.addEntitySession(ps.entityId, session.id)
            this.entityRegistry.linkSession(session.id, ps.entityId)
            if (ps.entityId === 'orchestrator') this.orchestratorSessionId = session.id
            if (ps.entityId === 'cyber-factory') this.cyberFactorySessionId = session.id
          }
        } else {
          // tmux session gone → clean up from store
          console.log(`[SessionManager] recover: tmux session "${ps.tmuxSession}" gone, removing from store`)
          this.sessionStore.removeSession(ps.id)
        }
      }
    }

    // ── Step 2: Find orphaned tmux sessions (not in sessions.json) ──
    for (const tmuxSession of tmuxSessions) {
      if (!tmuxSession.name) continue // skip entries with missing/undefined name
      if (tmuxSession.name === 'cipher-mux-control') continue
      if (!tmuxSession.name.startsWith('cmux-')) continue
      if (claimedTmuxNames.has(tmuxSession.name)) continue

      // Also check in-memory registry (sessions already known this run)
      let alreadyKnown = false
      for (const session of this.sessions.values()) {
        if (session.tmuxSession === tmuxSession.name) {
          alreadyKnown = true
          break
        }
      }
      if (alreadyKnown) continue

      const lowerName = tmuxSession.name.toLowerCase()
      const isLauncher = lowerName.includes('launcher') || lowerName.includes('kickoff')
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
        console.log(`[SessionManager] auto-killing launcher/kickoff session: ${tmuxSession.name}`)
        try { await this.tmux.killSession(tmuxSession.name) } catch { /* ok */ }
        killed.push(sessionInfo)
      } else {
        console.log(`[SessionManager] orphaned session: ${tmuxSession.name} (cwd: ${projectPath ?? 'unknown'})`)
        orphaned.push(sessionInfo)
      }
    }

    // ── Step 3: Fallback entity name matching for sessions recovered without store ──
    if (!hasStore) {
      const entityNameMap: Record<string, EntityId> = {
        'Orchestrator': 'orchestrator',
        'Cyber Factory': 'cyber-factory',
        'Coding Companion': 'companion',
        'Refinement': 'refinement',
        'Voice': 'voice-relay',
      }
      for (const session of recovered) {
        const entityId = entityNameMap[session.name]
        if (entityId) {
          session.entityId = entityId
          this.addEntitySession(entityId, session.id)
          this.entityRegistry.linkSession(session.id, entityId)
          if (entityId === 'orchestrator') this.orchestratorSessionId = session.id
          if (entityId === 'cyber-factory') this.cyberFactorySessionId = session.id
        }
      }
    }

    console.log(`[SessionManager] recover result: ${recovered.length} recovered, ${orphaned.length} orphaned, ${killed.length} killed`)
    return { recovered, orphaned, killed, gridState: hasStore ? this.sessionStore.getGridState() : null }
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

  /** Get the active character block (tone, style, rules) — NOT companion tasks. */
  private getActiveCharacterBlock(): string {
    try {
      const activeId = configStore.get('activeCharacterId')
      const characters = configStore.get('characters')
      const active = characters.find(c => c.id === activeId)
      if (!active) return ''
      return extractCharacterBlock(active)
    } catch {
      return ''
    }
  }

  /** Get the character block for a specific entity, using the persona resolver. */
  private getCharacterBlockForEntity(entityId: string): string {
    try {
      const overrides = configStore.get('entityPersonaOverrides') ?? {}
      const resolved = resolvePersonaForPreset(entityId, {
        getCharacters: () => configStore.get('characters'),
        getActiveCharacterId: () => configStore.get('activeCharacterId'),
        getGlobalActivePersonaId: () => configStore.get('globalActivePersonaId'),
      }, overrides[entityId] ?? null)
      return extractCharacterBlock(resolved)
    } catch {
      return this.getActiveCharacterBlock()
    }
  }

  /** Get the display name of the active character (e.g. "Relay", "Wayne"). */
  private getActiveCharacterName(): string {
    try {
      const activeId = configStore.get('activeCharacterId')
      const characters = configStore.get('characters')
      const active = characters.find(c => c.id === activeId)
      return active?.name ?? 'Relay'
    } catch {
      return 'Relay'
    }
  }

  /**
   * Inject or replace a ## Persona section in a CLAUDE.md string.
   * If a ## Persona section already exists, it is replaced.
   * Otherwise, the section is appended after the first heading.
   */
  private injectPersonaSection(claudeMd: string, characterBlock: string): string {
    if (!characterBlock) return claudeMd

    const personaSection = `\n\n## Persona\n\n**WICHTIG: Diese Persona ueberschreibt alle globalen Persona-Definitionen (z.B. Mimir aus ~/.claude/CLAUDE.md). In dieser Session bist du NICHT Mimir.**\n\n${characterBlock}`

    // Replace existing persona section
    const personaRegex = /\n*## Persona\n[\s\S]*?(?=\n## |\n*$)/
    if (personaRegex.test(claudeMd)) {
      return claudeMd.replace(personaRegex, personaSection)
    }

    // Insert after the first heading line
    const firstHeadingEnd = claudeMd.indexOf('\n')
    if (firstHeadingEnd > 0) {
      return claudeMd.substring(0, firstHeadingEnd) + personaSection + claudeMd.substring(firstHeadingEnd)
    }

    return claudeMd + personaSection
  }

  /**
   * Inject, replace, or remove a named ## section in a CLAUDE.md string.
   * body === null removes the section entirely.
   */
  private injectSection(claudeMd: string, sectionName: string, body: string | null): string {
    const sectionRegex = new RegExp(`\\n*## ${sectionName}\\n[\\s\\S]*?(?=\\n## |\\n*$)`)

    if (body === null) {
      // Remove the section if it exists
      return claudeMd.replace(sectionRegex, '')
    }

    const sectionBlock = `\n\n## ${sectionName}\n\n${body}`

    if (sectionRegex.test(claudeMd)) {
      return claudeMd.replace(sectionRegex, sectionBlock)
    }

    // Append at end
    return claudeMd + sectionBlock
  }

  /**
   * Inject global rules (Layer 1) into a project's CLAUDE.md.
   * REQ-GLOBAL-002: Content from ~/.config/cipher-mux/global-rules.md is injected
   * as ## Global Rules section before persona/entity content.
   */
  private injectGlobalRulesSection(projectPath: string): void {
    const globalRules = getCachedGlobalRules()
    if (!globalRules.trim()) return

    const claudeMdPath = path.join(projectPath, 'CLAUDE.md')
    if (!fs.existsSync(claudeMdPath)) return

    const content = fs.readFileSync(claudeMdPath, 'utf-8')
    const updated = this.injectSection(content, 'Global Rules', globalRules.trim())
    fs.writeFileSync(claudeMdPath, updated, 'utf-8')
  }

  /**
   * Inject workspace prompt and context directories into a project's CLAUDE.md.
   * Called during workspace apply for project-path cells.
   */
  injectWorkspaceSections(projectPath: string, workspacePrompt?: string, contextPaths?: string[]): void {
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md')
    let content = ''
    try {
      content = fs.readFileSync(claudeMdPath, 'utf-8')
    } catch {
      // CLAUDE.md doesn't exist yet — start fresh
    }

    // Inject or remove Workspace Prompt section
    if (workspacePrompt && workspacePrompt.trim()) {
      content = this.injectSection(content, 'Workspace Prompt', workspacePrompt.trim())
    } else {
      content = this.injectSection(content, 'Workspace Prompt', null)
    }

    // Inject or remove Context Directories section
    if (contextPaths && contextPaths.length > 0) {
      const body = contextPaths.map((p) => `- \`${p}\``).join('\n')
      content = this.injectSection(content, 'Context Directories', body)
    } else {
      content = this.injectSection(content, 'Context Directories', null)
    }

    fs.writeFileSync(claudeMdPath, content, 'utf-8')
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

    // Mutex: prevent concurrent starts of the same entity
    if (this.startingEntities.has(entityId)) {
      throw new Error(`${config.displayName} is already starting`)
    }
    this.startingEntities.add(entityId)

    try {
    // Singleton check — only block multi-start for singleInstance entities
    if (config.singleInstance) {
      const existingIds = this.getAllEntitySessionIds(entityId)
      for (const eid of existingIds) {
        const existing = this.sessions.get(eid)
        if (existing && existing.status === 'active') {
          throw new Error(`${config.displayName} is already running`)
        }
        this.removeEntitySession(entityId, eid)
        this.entityRegistry.unlinkSession(eid)
      }
    }

    // Deploy assets if this entity has a template
    if (config.templatePath) {
      deployEntityAssets(config, this.appRoot)
    }

    // Ensure entity directory exists
    fs.mkdirSync(config.projectPath, { recursive: true })

    // Write CLAUDE.md for entities without asset templates.
    // Each entity gets a role-specific CLAUDE.md so it overrides the global
    // Mimir persona from ~/.claude/CLAUDE.md (fixes B07 persona distribution).
    // Code-generated templates (voice-relay, audit) are always refreshed so
    // updates propagate on next session start. Orchestrator and Cyber Factory use
    // pre-authored CLAUDE.md in their entity directories (no code generation).
    // Only truly generic fallback CLAUDE.md is write-once (preserves manual edits).
    if (!config.templatePath) {
      const claudeMdPath = path.join(config.projectPath, 'CLAUDE.md')
      if (config.id === 'audit') {
        fs.writeFileSync(claudeMdPath, generateAuditClaudeMd(), 'utf-8')
      } else if (config.id === 'voice-relay') {
        fs.writeFileSync(claudeMdPath, generateVoiceRelayClaudeMd(), 'utf-8')
      } else if (config.id === 'debugger') {
        // Write-once: preserve manual edits to the debugger's CLAUDE.md
        if (!fs.existsSync(claudeMdPath)) {
          fs.writeFileSync(claudeMdPath, generateDebuggerClaudeMd(), 'utf-8')
        }
      } else if (config.id === 'bugreport') {
        fs.writeFileSync(claudeMdPath, generateBugreportPresetClaudeMd(), 'utf-8')
      } else if (!fs.existsSync(claudeMdPath)) {
        // Generic fallback — only write once to preserve manual edits
        fs.writeFileSync(claudeMdPath, `# ${config.displayName}\n\n${config.displayName} Persona — wird vom User konfiguriert.\n`, 'utf-8')
      }
      // Always update MCP connection file for entities that use MCP
      if (config.features.includes('mcp') && this.mcpConfig) {
        const mcpUrl = `http://${this.mcpConfig.mcpHost}:${this.mcpConfig.mcpPort}/mcp`
        fs.writeFileSync(
          path.join(config.projectPath, '.mcp-connection.md'),
          `# MCP-Verbindung (auto-generiert, nicht editieren)\n\n- **URL:** ${mcpUrl}\n- **Auth:** Bearer ${this.mcpConfig.mcpApiKey}\n`,
          'utf-8',
        )
      }

      // Ensure MCP tool permissions for template-less entities that use MCP.
      // Entities with templates get permissions via ensureTemplateSettings().
      // Without pre-approved permissions, Claude Code blocks on tool approval
      // prompts — fatal for non-interactive sessions like voice-relay.
      if (config.features.includes('mcp') && this.mcpConfig) {
        const claudeDir = path.join(config.projectPath, '.claude')
        const settingsPath = path.join(claudeDir, 'settings.local.json')
        fs.mkdirSync(claudeDir, { recursive: true })

        let settings: Record<string, unknown> = {}
        try {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
        } catch { /* doesn't exist yet */ }

        // Only inject permissions if none are set (don't override user customization)
        if (!settings.permissions) {
          const mcpPerms = getMcpPermissionsForEntity(config.id)
          if (mcpPerms.length > 0) {
            settings.permissions = { allow: mcpPerms }
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
          }
        }
      }
    }

    // Ensure template .claude/settings.local.json base settings (permissions,
    // model, statusLine) are present BEFORE start() calls postLaunchInjection,
    // so the merge preserves them alongside the injected mcpServers config.
    ensureTemplateSettings(config, this.appRoot)

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

    // ─── Global Rules Injection (Layer 1) ──────────────────
    // REQ-GLOBAL-002: Inject global-rules.md content into EVERY session's CLAUDE.md
    // before persona/entity content. This is Layer 1 in the 5-layer prompt model.
    this.injectGlobalRulesSection(config.projectPath)

    // ─── Universal Persona Injection ───────────────────────
    // Inject the resolved character block (tone, style, rules) into every
    // entity's CLAUDE.md. Uses persona-resolver: global > preset override > default matrix > fallback.
    const claudeMdPath = path.join(config.projectPath, 'CLAUDE.md')
    if (fs.existsSync(claudeMdPath)) {
      const characterBlock = this.getCharacterBlockForEntity(entityId)
      if (characterBlock) {
        const existing = fs.readFileSync(claudeMdPath, 'utf-8')
        const withPersona = this.injectPersonaSection(existing, characterBlock)
        fs.writeFileSync(claudeMdPath, withPersona, 'utf-8')
      }
    }

    // For multi-instance entities, append instance number to display name
    let displayName = config.displayName
    if (!config.singleInstance) {
      const existingCount = this.getAllEntitySessionIds(entityId).length
      if (existingCount > 0) {
        displayName = `${config.displayName} #${existingCount + 1}`
      }
    }

    // Start session
    const session = await this.start({
      name: displayName,
      projectPath: config.projectPath,
      ...opts,
      _entityInjected: true,
    })

    // Tag session with entity
    session.entityId = entityId
    this.addEntitySession(entityId, session.id)
    this.entityRegistry.linkSession(session.id, entityId)

    // Backward compat: update orchestrator/cyber-factory session ID refs
    if (entityId === 'orchestrator') this.orchestratorSessionId = session.id
    if (entityId === 'cyber-factory') this.cyberFactorySessionId = session.id

    // Re-persist with entity ID and notify renderer so entityStatus updates
    this.persistSession(session)
    this.emit('session-changed', session)

    this.emit('entity-started', { entityId, session })
    return session
    } finally {
      this.startingEntities.delete(entityId)
    }
  }

  /**
   * Queue Claude Code launch for an entity session.
   * For multi-instance entities, targets the most recently added session.
   * Use queueEntityClaudeForSession() to target a specific session.
   */
  queueEntityClaude(entityId: EntityId, targetSessionId?: string): void {
    const sessionId = targetSessionId ?? this.getFirstEntitySessionId(entityId)
    if (!sessionId) {
      throw new Error(`${entityId} is not running`)
    }
    const config = this.entityRegistry.get(entityId)
    if (!config) return

    const adapter = this.adapterRegistry.getDefault()
    const launchCmd = adapter.buildLaunchCommand({
      projectPath: config.projectPath,
      sessionName: config.displayName,
      isOrchestrator: entityId === 'orchestrator',
      isCyberFactory: entityId === 'cyber-factory',
    })
    const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
    this.setPendingLaunch(sessionId, `clear; ${cmdStr}\n`)
  }

  /**
   * Queue Claude Code launch with --resume for an entity session.
   * Stops the existing session first, then starts a fresh one with --resume.
   */
  async resumeEntity(entityId: EntityId): Promise<SessionInfo> {
    // Stop existing session if running
    if (this.isEntityRunning(entityId)) {
      await this.stopEntity(entityId)
    }

    // Start fresh session
    const session = await this.startEntity(entityId)

    // Queue Claude launch with --resume flag
    const sessionId = this.getFirstEntitySessionId(entityId)
    if (!sessionId) throw new Error(`${entityId} is not running after restart`)

    const config = this.entityRegistry.get(entityId)
    if (!config) throw new Error(`Unknown entity: ${entityId}`)

    const adapter = this.adapterRegistry.getDefault()
    const launchCmd = adapter.buildLaunchCommand({
      projectPath: config.projectPath,
      sessionName: config.displayName,
      isOrchestrator: entityId === 'orchestrator',
      isCyberFactory: entityId === 'cyber-factory',
      resume: true,
    })
    const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
    this.setPendingLaunch(sessionId, `clear; ${cmdStr}\n`)

    return session
  }

  /**
   * Schedule a startup greeting to be sent after Claude is ready.
   * Waits ~12s for Claude CLI to boot, then sends the greeting via tmux.
   */
  scheduleStartupGreeting(entityId: EntityId): void {
    const config = this.entityRegistry.get(entityId)
    if (!config?.startupGreeting) return

    const sessionId = this.getFirstEntitySessionId(entityId)
    if (!sessionId) return

    setTimeout(async () => {
      try {
        const session = this.sessions.get(sessionId)
        if (!session || session.status !== 'active') return
        await this.sendKeys(sessionId, config.startupGreeting + '\r')
      } catch (err) {
        console.warn(`[SessionManager] startup greeting failed for ${entityId}:`, err)
      }
    }, 12_000)
  }

  /**
   * Stop an entity session. For singleInstance entities, stops the one session.
   * For multi-instance, stops a specific session (by targetSessionId) or ALL sessions.
   */
  async stopEntity(entityId: EntityId, targetSessionId?: string): Promise<void> {
    const sessionIds = targetSessionId
      ? [targetSessionId]
      : this.getAllEntitySessionIds(entityId)
    if (sessionIds.length === 0) return // already stopped

    for (const sessionId of sessionIds) {
      try {
        await this.stop(sessionId)
      } catch {
        // Session may already be gone
      }
      // stop() already calls removeEntitySession via the entity cleanup block,
      // but unlinkSession is also called there — no extra cleanup needed.
    }

    // Backward compat
    if (entityId === 'orchestrator') this.orchestratorSessionId = null
    if (entityId === 'cyber-factory') this.cyberFactorySessionId = null

    this.emit('entity-stopped', { entityId })
  }

  /**
   * Check if an entity is currently running (any instance).
   */
  isEntityRunning(entityId: EntityId): boolean {
    for (const sid of this.getAllEntitySessionIds(entityId)) {
      const session = this.sessions.get(sid)
      if (session?.status === 'active') return true
    }
    return false
  }

  /**
   * Get the first session ID for an entity (or null).
   * For multi-instance entities, returns the most recently tracked session.
   */
  getEntitySessionId(entityId: EntityId): string | null {
    return this.getFirstEntitySessionId(entityId) ?? null
  }

  /**
   * Get all session IDs for an entity.
   */
  getEntitySessionIds(entityId: EntityId): string[] {
    return this.getAllEntitySessionIds(entityId)
  }

  /**
   * Link an existing session to an entity (used by keepWorking restore to
   * re-establish entity links on recovered sessions).
   */
  linkEntity(sessionId: string, entityId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.entityId = entityId
    this.addEntitySession(entityId as EntityId, sessionId)
    if (this.entityRegistry) {
      this.entityRegistry.linkSession(sessionId, entityId as EntityId)
    }
    if (entityId === 'orchestrator') this.orchestratorSessionId = sessionId
    if (entityId === 'cyber-factory') this.cyberFactorySessionId = sessionId
    this.persistSession(session)
    this.emit('session-changed', session)
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
   * Fork an existing session: creates a new session with --fork-session <id>.
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

  // ─── Session Exit Detection ─────────────────────────────

  private exitCheckTimer: NodeJS.Timeout | null = null

  /**
   * Start periodic check for ended Claude processes (every 5s).
   * Detects when the Claude CLI exits within a tmux session and
   * marks the session as stopped, freeing the grid cell.
   */
  startExitDetection(): void {
    if (this.exitCheckTimer) return
    this.exitCheckTimer = setInterval(() => {
      this.checkSessionExits().catch((err) => {
        console.error('[SessionManager] exit detection error:', err)
      })
    }, 5_000)
  }

  /**
   * Stop periodic exit detection.
   */
  stopExitDetection(): void {
    if (this.exitCheckTimer) {
      clearInterval(this.exitCheckTimer)
      this.exitCheckTimer = null
    }
  }

  /**
   * Check all active sessions for exited Claude processes.
   * When the pane command is a shell (zsh, bash, fish, sh) instead of
   * 'claude', the Claude process has ended. The session is removed from
   * the registry (freeing the grid cell) and the tmux session is killed.
   */
  private async checkSessionExits(): Promise<void> {
    const shellCommands = new Set(['zsh', 'bash', 'fish', 'sh', 'dash'])
    const checks: Promise<void>[] = []

    for (const [sessionId, session] of this.sessions) {
      if (session.status !== 'active') continue
      // Skip sessions that have a pending launch (Claude hasn't started yet)
      if (this.pendingLaunch.has(sessionId)) continue
      // Skip plain terminal sessions (no autoLaunch/Claude) — they naturally run a shell
      if (!this.autoLaunchedSessions.has(sessionId)) continue

      checks.push(
        this.tmux.getPaneCommand(session.tmuxSession).then(async (cmd) => {
          if (!cmd) return // pane doesn't exist or couldn't be queried
          if (shellCommands.has(cmd)) {
            console.log(`[SessionManager] session ${session.name} (${sessionId}): Claude exited (pane command: ${cmd})`)
            session.status = 'stopped'
            session.updatedAt = Date.now()
            this.tmux.unwatchSession(session.tmuxSession)
            try { await this.tmux.killSession(session.tmuxSession) } catch { /* already gone */ }
            this.emit('session-stopped', session)
            this.sessions.delete(sessionId)
            this.sessionAdapters.delete(sessionId)
            this.autoLaunchedSessions.delete(sessionId)
            this.sessionStore.removeSession(sessionId)
          }
        }),
      )
    }

    await Promise.allSettled(checks)
  }

  // ─── Session Persistence ──────────────────────────────

  /**
   * Persist a session to the SessionStore.
   * Grid slot is set to null (background) by default — the renderer
   * calls persistGridState() to update slot assignments.
   */
  private persistSession(session: SessionInfo): void {
    this.sessionStore.upsertSession({
      id: session.id,
      name: session.name,
      tmuxSession: session.tmuxSession,
      entityId: (session.entityId as EntityId) ?? null,
      projectPath: session.projectPath,
      gridSlot: null, // updated by renderer via persistGridState()
      status: 'active',
    })
  }

  /**
   * Save the current grid state to the session store.
   * Called by IpcHub whenever the grid changes so recovery
   * can restore sessions to their correct slots.
   */
  persistGridState(gridState: PersistedGridState): void {
    // Also update gridSlot on each persisted session
    // Filter out sessions no longer in the in-memory registry — prevents
    // a stale grid-save from re-adding sessions that were already stopped.
    const sessions = this.sessionStore.getSessions()
      .filter(ps => this.sessions.has(ps.id))

    // Build set of valid session IDs for slot cleanup
    const validIds = new Set(sessions.map(s => s.id))

    // Clean grid slots that reference sessions no longer in the registry
    for (const slot of gridState.slots) {
      if (slot.sessionId && !validIds.has(slot.sessionId)) {
        slot.sessionId = null
      }
    }

    for (const ps of sessions) {
      const slotIdx = gridState.slots.findIndex(s => s.sessionId === ps.id)
      ps.gridSlot = slotIdx >= 0 ? slotIdx : null
      ps.status = slotIdx >= 0 ? 'active' : 'background'
    }
    this.sessionStore.saveSessions(sessions, gridState)
  }

  /**
   * Disconnect from tmux without killing sessions.
   * Sessions survive app quit and are recovered on next launch.
   */
  async destroy(): Promise<void> {
    this.stopOrphanDetection()
    this.stopExitDetection()
    this.sessions.clear()
    this.tmux.disconnect()
  }
}
