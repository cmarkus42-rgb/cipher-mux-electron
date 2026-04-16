import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ulid } from 'ulidx'
import type { SessionInfo, SessionStatus, StartSessionOpts, RecoveryResult } from '../../shared/types'
import { MAX_SESSIONS, ORCHESTRATOR_DIR, ORCHESTRATOR_MAX_RETRIES } from '../../shared/constants'
import { TmuxManager } from '../tmux/tmux-manager'
import { generateOrchestratorClaudeMd } from './orchestrator-template'
import { runCommand } from '../util/exec-util'

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
  private orchestratorSessionId: string | null = null
  private mcpConfig: OrchestratorConfig | null = null
  /**
   * Commands queued to be sent to a session once its terminal reports
   * the real (post-mount) size via markReady(). Prevents launching TUIs
   * like Claude at the default 80x24 before xterm has fitted.
   */
  private pendingLaunch: Map<string, { command: string; timer: NodeJS.Timeout }> = new Map()

  constructor(tmux: TmuxManager) {
    super()
    this.tmux = tmux
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

    // Merge MCP env vars if config is set
    let env = opts.env
    if (this.mcpConfig) {
      const mcpUrl = `http://${this.mcpConfig.mcpHost}:${this.mcpConfig.mcpPort}`
      env = {
        ...env,
        CIPHER_MUX_MCP_URL: mcpUrl,
        CIPHER_MUX_MCP_KEY: this.mcpConfig.mcpApiKey,
      }

      // Register MCP server in Claude Code project-level settings
      // so claude CLI can discover it on startup (env vars alone are ignored)
      if (opts.projectPath) {
        await this.registerMcpForProject(opts.projectPath, this.mcpConfig)
      }
    }

    // Create tmux session
    const tmuxSession = await this.tmux.createSession(tmuxName, {
      cwd: opts.projectPath,
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
    }

    this.sessions.set(id, session)

    // Start output watcher — emits terminal data with session ULID as ID
    this.tmux.watchSession(tmuxName, id)

    // Queue auto-launch (e.g. `claude --...`) to fire once the renderer
    // reports the real terminal size, so TUIs start at the correct dims.
    if (opts.autoLaunch) {
      this.setPendingLaunch(id, opts.autoLaunch)
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
  }

  /**
   * Recover sessions by scanning existing tmux sessions.
   * Matches known sessions and marks unknowns as orphaned.
   */
  async recover(): Promise<RecoveryResult> {
    const tmuxSessions = await this.tmux.listSessions()
    const recovered: SessionInfo[] = []
    const orphaned: SessionInfo[] = []

    for (const tmuxSession of tmuxSessions) {
      // Check if this is one of our sessions (prefix cmux-)
      if (!tmuxSession.name.startsWith('cmux-')) continue

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
        // Orphaned session — kill it, don't count against limit
        console.log(`[SessionManager] killing orphaned tmux session: ${tmuxSession.name}`)
        try {
          await this.tmux.killSession(tmuxSession.name)
        } catch {
          // may already be gone
        }
        orphaned.push({
          id: ulid(),
          name: tmuxSession.name,
          projectPath: null,
          tmuxSession: tmuxSession.name,
          tmuxPane: null,
          status: 'orphaned',
          createdAt: tmuxSession.created * 1000,
          updatedAt: Date.now(),
        })
      }
    }

    // Restore orchestrator link if a recovered session is named "Orchestrator"
    for (const session of recovered) {
      if (session.name === 'Orchestrator') {
        this.orchestratorSessionId = session.id
        break
      }
    }

    return { recovered, orphaned }
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

  // ─── MCP Registration ───────────────────────────────────

  /**
   * Register the cipher-mux MCP server for a project directory.
   * Uses `claude mcp add-json` with local scope so Claude Code discovers it on startup.
   */
  private async registerMcpForProject(projectPath: string, config: OrchestratorConfig): Promise<void> {
    const mcpUrl = `http://${config.mcpHost}:${config.mcpPort}/mcp`
    const serverJson = JSON.stringify({
      type: 'http',
      url: mcpUrl,
      headers: { Authorization: `Bearer ${config.mcpApiKey}` },
    })

    try {
      // Remove existing entry first (ignore errors if it doesn't exist)
      await runCommand('claude', [
        'mcp', 'remove', '-s', 'local', 'cipher-mux',
      ], { cwd: projectPath, timeout: 10_000 }).catch(() => {})

      await runCommand('claude', [
        'mcp', 'add-json', '-s', 'local', 'cipher-mux', serverJson,
      ], { cwd: projectPath, timeout: 15_000 })
      console.log(`[SessionManager] MCP registered for project: ${projectPath}`)
    } catch (err) {
      console.warn(`[SessionManager] MCP registration failed for ${projectPath}:`, err)
    }
  }

  // ─── Orchestrator ─────────────────────────────────────

  /**
   * Resolve the orchestrator directory path (expand ~).
   */
  private resolveOrchestratorDir(): string {
    return ORCHESTRATOR_DIR.replace(/^~/, os.homedir())
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

    // Generate and write CLAUDE.md
    const claudeMd = generateOrchestratorClaudeMd({
      mcpHost: config.mcpHost,
      mcpPort: config.mcpPort,
      mcpApiKey: config.mcpApiKey,
      maxRetries: ORCHESTRATOR_MAX_RETRIES,
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
    // Prepending `clear` wipes the shell prompt + command-echo before claude
    // takes over the pane; without it xterm's viewport could remain scrolled
    // above Claude's TUI. Do NOT send RIS (ESC c) here — tmux's per-pane
    // charset state doesn't survive it, leaving DEC line-drawing chars
    // rendered as `@`/`0` glyphs.
    this.setPendingLaunch(
      this.orchestratorSessionId,
      'clear; claude --dangerously-skip-permissions\n',
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

  /**
   * Destroy all sessions and disconnect tmux.
   */
  async destroy(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.status === 'active') {
        try {
          await this.tmux.killSession(session.tmuxSession)
        } catch {
          // ignore
        }
      }
    }
    this.sessions.clear()
    this.tmux.disconnect()
  }
}
