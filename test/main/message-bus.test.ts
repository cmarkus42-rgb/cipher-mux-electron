import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { MessageBus } from '../../src/main/message-bus/message-bus'
import type { Message, SendMessage } from '../../src/shared/types'
import { MESSAGE_RETENTION_DAYS } from '../../src/shared/constants'

function createBus(): MessageBus {
  return new MessageBus({ dbPath: ':memory:', skipCleanupTimer: true })
}

describe('MessageBus', () => {
  let bus: MessageBus

  beforeEach(() => {
    bus = createBus()
  })

  afterEach(() => {
    bus.destroy()
  })

  it('should send and retrieve a message', () => {
    const msg: SendMessage = {
      topic: 'chat',
      sender: 'session-1',
      payload: { text: 'hello' },
    }

    const created = bus.send(msg)

    assert.ok(created.id, 'message should have an id')
    assert.equal(created.topic, 'chat')
    assert.equal(created.sender, 'session-1')
    assert.deepEqual(created.payload, { text: 'hello' })
    assert.ok(created.createdAt > 0, 'createdAt should be a positive timestamp')

    const all = bus.getAll()
    assert.equal(all.length, 1)
    assert.equal(all[0].id, created.id)
    assert.deepEqual(all[0].payload, { text: 'hello' })
  })

  it('should emit a message event on send', () => {
    const received: Message[] = []
    bus.on('message', (msg: Message) => received.push(msg))

    const created = bus.send({
      topic: 'status',
      sender: 'session-1',
      payload: { status: 'active' },
    })

    assert.equal(received.length, 1)
    assert.equal(received[0].id, created.id)
  })

  it('should filter messages by topic', () => {
    bus.send({ topic: 'chat', sender: 's1', payload: { n: 1 } })
    bus.send({ topic: 'bug', sender: 's2', payload: { n: 2 } })
    bus.send({ topic: 'chat', sender: 's3', payload: { n: 3 } })
    bus.send({ topic: 'system', sender: 's4', payload: { n: 4 } })

    const chatMessages = bus.getByTopic('chat')
    assert.equal(chatMessages.length, 2)
    assert.ok(chatMessages.every((m) => m.topic === 'chat'))

    const bugMessages = bus.getByTopic('bug')
    assert.equal(bugMessages.length, 1)
    assert.equal(bugMessages[0].sender, 's2')
  })

  it('should respect limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      bus.send({ topic: 'chat', sender: 's1', payload: { i } })
    }

    const limited = bus.getAll(3)
    assert.equal(limited.length, 3)

    const topicLimited = bus.getByTopic('chat', 5)
    assert.equal(topicLimited.length, 5)
  })

  it('should support before parameter for pagination', () => {
    const messages: Message[] = []
    for (let i = 0; i < 5; i++) {
      messages.push(bus.send({ topic: 'chat', sender: 's1', payload: { i } }))
    }

    // Get messages created before the last message
    const lastMsg = messages[messages.length - 1]
    const before = bus.getAll(50, lastMsg.createdAt)
    // All messages except the last one (same createdAt may exclude some)
    assert.ok(before.length <= 4)
    assert.ok(before.every((m) => m.createdAt < lastMsg.createdAt))
  })

  it('should mark messages as read', () => {
    const m1 = bus.send({ topic: 'chat', sender: 's1', payload: {} })
    const m2 = bus.send({ topic: 'chat', sender: 's2', payload: {} })

    assert.equal(bus.unreadCount('reader-A'), 2)

    bus.markRead([m1.id], 'reader-A')
    assert.equal(bus.unreadCount('reader-A'), 1)

    bus.markRead([m2.id], 'reader-A')
    assert.equal(bus.unreadCount('reader-A'), 0)
  })

  it('should not double-count markRead for same reader', () => {
    const m1 = bus.send({ topic: 'chat', sender: 's1', payload: {} })

    bus.markRead([m1.id], 'reader-A')
    bus.markRead([m1.id], 'reader-A')

    assert.equal(bus.unreadCount('reader-A'), 0)
  })

  it('should track unread counts per reader independently', () => {
    bus.send({ topic: 'chat', sender: 's1', payload: {} })
    const m2 = bus.send({ topic: 'chat', sender: 's2', payload: {} })

    bus.markRead([m2.id], 'reader-A')

    assert.equal(bus.unreadCount('reader-A'), 1)
    assert.equal(bus.unreadCount('reader-B'), 2)
  })

  it('should cleanup old messages', () => {
    // Send a message, then manually backdate it in the DB
    const m1 = bus.send({ topic: 'chat', sender: 's1', payload: { old: true } })
    bus.send({ topic: 'chat', sender: 's2', payload: { recent: true } })

    // Backdate m1 beyond retention period
    const oldTimestamp =
      Date.now() - (MESSAGE_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000
    // Access the db directly through a second connection to backdate
    // We need to use the internal db — create a workaround via raw SQL
    const busAny = bus as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }
    busAny.db
      .prepare('UPDATE messages SET created_at = ? WHERE id = ?')
      .run(oldTimestamp, m1.id)

    const deleted = bus.cleanup()
    assert.equal(deleted, 1)

    const remaining = bus.getAll()
    assert.equal(remaining.length, 1)
    assert.deepEqual(remaining[0].payload, { recent: true })
  })

  it('should return 0 from cleanup when no old messages exist', () => {
    bus.send({ topic: 'chat', sender: 's1', payload: {} })
    const deleted = bus.cleanup()
    assert.equal(deleted, 0)
  })

  it('should enable WAL mode', () => {
    // In-memory databases report 'memory' for journal_mode even after setting WAL.
    // To verify WAL is actually requested, use a file-based database.
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    const dbPath = path.join(os.tmpdir(), `cipher-mux-test-wal-${Date.now()}.db`)
    const fileBus = new MessageBus({ dbPath, skipCleanupTimer: true })
    try {
      const busAny = fileBus as unknown as { db: { pragma: (sql: string) => Array<{ journal_mode: string }> } }
      const result = busAny.db.pragma('journal_mode')
      assert.equal(result[0].journal_mode, 'wal')
    } finally {
      fileBus.destroy()
      // Clean up temp files
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(dbPath + suffix) } catch { /* ignore */ }
      }
    }
  })

  it('should generate unique IDs for each message', () => {
    const m1 = bus.send({ topic: 'chat', sender: 's1', payload: {} })
    const m2 = bus.send({ topic: 'chat', sender: 's1', payload: {} })
    assert.notEqual(m1.id, m2.id)
  })

  it('should handle markRead with non-existent message ID gracefully', () => {
    // Should not throw
    bus.markRead(['non-existent-id'], 'reader-A')
    assert.equal(bus.unreadCount('reader-A'), 0)
  })
})
