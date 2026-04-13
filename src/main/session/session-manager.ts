import { EventEmitter } from 'events'
import { ulid } from 'ulidx'
import type { SessionInfo, SessionStatus, StartSessionOpts, RecoveryResult } from '../../shared/types'
import { MAX_SESSIONS } from '../../shared/constants'
import { TmuxManager } from '../tmux/tmux-manager'

/**
 * SessionManager — Registry for cipher-mux sessions.
 *
 * Manages session lifecycle (create, stop, recover) and enforces
 * the MAX_SESSIONS limit. Each session maps to a tmux session.
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map()
  private tmux: TmuxManager

  constructor(tmux: TmuxManager) {
    super()
    this.tmux = tmux
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

    // Create tmux session
    const tmuxSession = await this.tmux.createSession(tmuxName, {
      cwd: opts.projectPath,
      command: opts.command,
      env: opts.env,
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
        // Orphaned session — create a placeholder entry
        const orphanSession: SessionInfo = {
          id: ulid(),
          name: tmuxSession.name,
          projectPath: null,
          tmuxSession: tmuxSession.name,
          tmuxPane: null,
          status: 'orphaned',
          createdAt: tmuxSession.created * 1000,
          updatedAt: Date.now(),
        }
        this.sessions.set(orphanSession.id, orphanSession)
        orphaned.push(orphanSession)
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
   * Capture content from a session's pane.
   */
  async capture(sessionId: string, lines?: number): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    const target = session.tmuxPane ?? session.tmuxSession
    return this.tmux.capturePane(target, lines)
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
