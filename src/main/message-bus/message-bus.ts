import { EventEmitter } from 'events'
import Database from 'better-sqlite3'
import { ulid } from 'ulidx'
import { SCHEMA_SQL } from './schema'
import {
  MESSAGE_RETENTION_DAYS,
  MESSAGE_CLEANUP_INTERVAL_MS,
} from '../../shared/constants'
import type { Message, SendMessage, Topic } from '../../shared/types'

export interface MessageBusOptions {
  /** Path to the SQLite database file, or ':memory:' for in-memory */
  dbPath: string
  /** If true, skip starting the periodic cleanup timer (useful for tests) */
  skipCleanupTimer?: boolean
}

export class MessageBus extends EventEmitter {
  private db: Database.Database
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  private stmtInsert: Database.Statement
  private stmtByTopic: Database.Statement
  private stmtByTopicBefore: Database.Statement
  private stmtAll: Database.Statement
  private stmtAllBefore: Database.Statement
  private stmtGetReadBy: Database.Statement
  private stmtUpdateReadBy: Database.Statement
  private stmtUnreadCount: Database.Statement
  private stmtCleanup: Database.Statement

  constructor(opts: MessageBusOptions) {
    super()

    this.db = new Database(opts.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA_SQL)

    // Prepare all statements
    this.stmtInsert = this.db.prepare(
      `INSERT INTO messages (id, topic, sender, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )

    this.stmtByTopic = this.db.prepare(
      `SELECT id, topic, sender, payload, created_at, read_by
       FROM messages WHERE topic = ? ORDER BY created_at DESC LIMIT ?`
    )

    this.stmtByTopicBefore = this.db.prepare(
      `SELECT id, topic, sender, payload, created_at, read_by
       FROM messages WHERE topic = ? AND created_at < ?
       ORDER BY created_at DESC LIMIT ?`
    )

    this.stmtAll = this.db.prepare(
      `SELECT id, topic, sender, payload, created_at, read_by
       FROM messages ORDER BY created_at DESC LIMIT ?`
    )

    this.stmtAllBefore = this.db.prepare(
      `SELECT id, topic, sender, payload, created_at, read_by
       FROM messages WHERE created_at < ?
       ORDER BY created_at DESC LIMIT ?`
    )

    this.stmtGetReadBy = this.db.prepare(
      `SELECT read_by FROM messages WHERE id = ?`
    )

    this.stmtUpdateReadBy = this.db.prepare(
      `UPDATE messages SET read_by = ? WHERE id = ?`
    )

    this.stmtUnreadCount = this.db.prepare(
      `SELECT COUNT(*) AS count FROM messages
       WHERE read_by NOT LIKE ?`
    )

    this.stmtCleanup = this.db.prepare(
      `DELETE FROM messages WHERE created_at < ?`
    )

    if (!opts.skipCleanupTimer) {
      this.cleanupTimer = setInterval(
        () => this.cleanup(),
        MESSAGE_CLEANUP_INTERVAL_MS
      )
      // Allow the Node.js process to exit even if the timer is active
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref()
      }
    }
  }

  /** Send a message to the bus */
  send(msg: SendMessage): Message {
    const id = ulid()
    const createdAt = Date.now()
    const payloadJson = JSON.stringify(msg.payload)

    this.stmtInsert.run(id, msg.topic, msg.sender, payloadJson, createdAt)

    const message: Message = {
      id,
      topic: msg.topic,
      sender: msg.sender,
      payload: msg.payload,
      createdAt,
    }

    this.emit('message', message)
    return message
  }

  /** Get messages by topic, newest first */
  getByTopic(topic: Topic, limit = 50, before?: number): Message[] {
    const rows = before !== undefined
      ? this.stmtByTopicBefore.all(topic, before, limit) as RawRow[]
      : this.stmtByTopic.all(topic, limit) as RawRow[]

    return rows.map(rowToMessage)
  }

  /** Get all messages, newest first */
  getAll(limit = 50, before?: number): Message[] {
    const rows = before !== undefined
      ? this.stmtAllBefore.all(before, limit) as RawRow[]
      : this.stmtAll.all(limit) as RawRow[]

    return rows.map(rowToMessage)
  }

  /** Mark messages as read by a specific reader */
  markRead(messageIds: string[], readerId: string): void {
    const markOne = this.db.transaction(() => {
      for (const id of messageIds) {
        const row = this.stmtGetReadBy.get(id) as { read_by: string } | undefined
        if (!row) continue

        const readBy: string[] = JSON.parse(row.read_by)
        if (!readBy.includes(readerId)) {
          readBy.push(readerId)
          this.stmtUpdateReadBy.run(JSON.stringify(readBy), id)
        }
      }
    })
    markOne()
  }

  /** Count messages not yet read by this reader */
  unreadCount(readerId: string): number {
    // Match messages where read_by does NOT contain the readerId
    // We use a LIKE pattern: if readerId is in the JSON array, the string
    // will contain "readerId" (with quotes)
    const pattern = `%"${readerId}"%`
    const row = this.stmtUnreadCount.get(pattern) as { count: number }
    return row.count
  }

  /** Delete messages older than MESSAGE_RETENTION_DAYS, return count deleted */
  cleanup(): number {
    const cutoff = Date.now() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
    const result = this.stmtCleanup.run(cutoff)
    return result.changes
  }

  /** Expose the underlying database for shared table access (tasks) */
  getDatabase(): Database.Database {
    return this.db
  }

  /** Stop cleanup timer and close the database */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.db.close()
  }
}

// ─── Internal helpers ──────────────────────────────────────

interface RawRow {
  id: string
  topic: string
  sender: string
  payload: string
  created_at: number
  read_by: string
}

function rowToMessage(row: RawRow): Message {
  return {
    id: row.id,
    topic: row.topic as Topic,
    sender: row.sender,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.created_at,
  }
}
