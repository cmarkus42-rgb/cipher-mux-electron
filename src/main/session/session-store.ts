import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { EntityId } from '../../shared/types'

/**
 * Persisted session entry — written to sessions.json on every session change.
 */
export interface PersistedSession {
  id: string
  name: string
  tmuxSession: string
  entityId: EntityId | null
  projectPath: string | null
  gridSlot: number | null
  status: 'active' | 'background'
  /** Workspace binding. null = unbound. Absent in stores written before v0.9.12. */
  workspaceId: string | null
  /**
   * Claude Code's own conversation id, as the session reported it via its
   * statusLine. Lets a restore resume that exact conversation
   * (`--resume <id>`) instead of opening the interactive picker, where an
   * unattended entity session would sit forever. Absent in older stores.
   */
  claudeSessionId?: string | null
  /**
   * The CLI the session was started with. Read back for folder sessions, which
   * have no role to resolve one from. Absent in stores before 0.12.1.
   */
  adapterId?: string | null
}

export interface PersistedGridState {
  config: { cols: number; rows: number }
  slots: Array<{ sessionId: string | null; rowSpan: number; type: 'session' | 'notes' }>
}

export interface SessionStoreData {
  sessions: PersistedSession[]
  gridState: PersistedGridState | null
  savedAt: number
}

const LIVE_STORE_PATH = path.join(os.homedir(), '.config', 'cipher-mux', 'sessions.json')

/**
 * Where a store with no explicit path writes. `CIPHER_MUX_SESSION_STORE` lets a
 * test point every SessionStore in the process at a throwaway file without
 * touching constructor signatures all the way down through SessionManager.
 */
function defaultStorePath(): string {
  return process.env.CIPHER_MUX_SESSION_STORE || LIVE_STORE_PATH
}

/**
 * True when this process is a test runner.
 *
 * Guards the live registry: SessionStore's path used to be a module constant,
 * so any test that built a real SessionManager wrote test fixtures straight
 * into the user's sessions.json — wiping their sessions and grid layout, which
 * a Keep Working restore would then read back as the truth. Tests must pass an
 * explicit path; defaulting to the live one inside a test process is refused
 * rather than merely discouraged.
 */
function isTestProcess(): boolean {
  return process.env.NODE_ENV === 'test'
    || process.env.CIPHER_MUX_TEST === '1'
    || Boolean(process.env.NODE_TEST_CONTEXT)
    || process.argv.some(a => a === '--test' || a.endsWith('.test.ts') || a.endsWith('.test.js'))
}

/**
 * SessionStore — persists session-to-entity and session-to-grid mappings
 * to disk so they survive app restarts. Simple JSON file, written atomically.
 */
export class SessionStore {
  private data: SessionStoreData = { sessions: [], gridState: null, savedAt: 0 }
  private readonly storePath: string

  /**
   * @param storePath Where to persist. Defaults to the live registry; tests
   *   must pass a path of their own (see isTestProcess).
   */
  constructor(storePath?: string) {
    const resolved = storePath ?? defaultStorePath()
    if (resolved === LIVE_STORE_PATH && isTestProcess()) {
      throw new Error(
        `SessionStore: refusing to use the live registry (${LIVE_STORE_PATH}) from a `
        + 'test process — pass an explicit path or set CIPHER_MUX_SESSION_STORE.',
      )
    }
    this.storePath = resolved
  }

  /** Load sessions.json from disk. Returns true if file existed. */
  load(): boolean {
    try {
      const raw = fs.readFileSync(this.storePath, 'utf-8')
      const parsed = JSON.parse(raw) as SessionStoreData
      if (parsed && Array.isArray(parsed.sessions)) {
        this.data = parsed
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /** Get all persisted sessions. */
  getSessions(): PersistedSession[] {
    return this.data.sessions
  }

  /** Get the persisted grid state (may be null). */
  getGridState(): PersistedGridState | null {
    return this.data.gridState
  }

  /** Update the full session list and save to disk. */
  saveSessions(sessions: PersistedSession[], gridState?: PersistedGridState | null): void {
    this.data.sessions = sessions
    if (gridState !== undefined) {
      this.data.gridState = gridState
    }
    this.data.savedAt = Date.now()
    this.flush()
  }

  /** Add or update a single session entry and save. */
  upsertSession(session: PersistedSession): void {
    const idx = this.data.sessions.findIndex(s => s.id === session.id)
    if (idx >= 0) {
      this.data.sessions[idx] = session
    } else {
      this.data.sessions.push(session)
    }
    this.data.savedAt = Date.now()
    this.flush()
  }

  /** Remove a session by ID and save. */
  removeSession(sessionId: string): void {
    this.data.sessions = this.data.sessions.filter(s => s.id !== sessionId)
    this.data.savedAt = Date.now()
    this.flush()
  }

  /** Update grid state and save. */
  saveGridState(gridState: PersistedGridState): void {
    this.data.gridState = gridState
    this.data.savedAt = Date.now()
    this.flush()
  }

  /** Clear all persisted data and remove the file. */
  clear(): void {
    this.data = { sessions: [], gridState: null, savedAt: 0 }
    try { fs.unlinkSync(this.storePath) } catch { /* ok */ }
  }

  /** Write data to disk atomically (write tmp + rename). */
  private flush(): void {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true })
      const tmp = this.storePath + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
      fs.renameSync(tmp, this.storePath)
    } catch (err) {
      console.error('[SessionStore] flush failed:', err)
    }
  }
}

/**
 * Map an in-memory session to its persisted shape.
 * Pure — no disk access — so the mapping can be tested directly.
 */
export function toPersistedSession(
  session: {
    id: string
    name: string
    tmuxSession: string
    entityId?: string | null
    projectPath: string | null
    workspaceId?: string | null
    claudeSessionId?: string | null
    adapterId?: string | null
  },
  gridSlot: number | null,
): PersistedSession {
  return {
    id: session.id,
    name: session.name,
    tmuxSession: session.tmuxSession,
    entityId: (session.entityId as EntityId) ?? null,
    projectPath: session.projectPath,
    ...(session.claudeSessionId ? { claudeSessionId: session.claudeSessionId } : {}),
    ...(session.adapterId ? { adapterId: session.adapterId } : {}),
    gridSlot,
    status: gridSlot === null ? 'background' : 'active',
    workspaceId: session.workspaceId ?? null,
  }
}
