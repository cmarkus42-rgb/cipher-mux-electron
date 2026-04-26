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

const STORE_DIR = path.join(os.homedir(), '.config', 'cipher-mux')
const STORE_PATH = path.join(STORE_DIR, 'sessions.json')

/**
 * SessionStore — persists session-to-entity and session-to-grid mappings
 * to disk so they survive app restarts. Simple JSON file, written atomically.
 */
export class SessionStore {
  private data: SessionStoreData = { sessions: [], gridState: null, savedAt: 0 }

  /** Load sessions.json from disk. Returns true if file existed. */
  load(): boolean {
    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8')
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
    try { fs.unlinkSync(STORE_PATH) } catch { /* ok */ }
  }

  /** Write data to disk atomically (write tmp + rename). */
  private flush(): void {
    try {
      fs.mkdirSync(STORE_DIR, { recursive: true })
      const tmp = STORE_PATH + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
      fs.renameSync(tmp, STORE_PATH)
    } catch (err) {
      console.error('[SessionStore] flush failed:', err)
    }
  }
}
