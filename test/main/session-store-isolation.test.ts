import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import path from 'path'
import os from 'os'
import { SessionStore, toPersistedSession } from '../../src/main/session/session-store'

// ─── Store isolation ────────────────────────────────────────
//
// SessionStore used to hardcode ~/.config/cipher-mux/sessions.json with no way
// to point it elsewhere. Two test files construct a real SessionManager, which
// constructs a real SessionStore — so running the suite overwrote the user's
// live session registry with test fixtures, wiping their sessions and grid
// layout. A Keep Working restore after a test run would then find only the
// fixture.
//
// These tests pin both halves of the fix: the path is injectable, and a
// default-constructed store cannot be used by accident in a test process.

const LIVE_PATH = path.join(os.homedir(), '.config', 'cipher-mux', 'sessions.json')

function sample(id: string) {
  return {
    id,
    name: `Session ${id}`,
    tmuxSession: `cmux-${id}`,
    entityId: null,
    projectPath: '/tmp/x',
    gridSlot: 0,
    status: 'active' as const,
  }
}

describe('SessionStore — path isolation', () => {
  let dir: string

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-store-iso-'))
  })

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes to an injected path instead of the home directory', () => {
    const storePath = path.join(dir, 'sessions.json')
    const store = new SessionStore(storePath)

    store.upsertSession(sample('injected-1'))

    assert.ok(fsSync.existsSync(storePath), 'injected path should hold the data')
    const parsed = JSON.parse(fsSync.readFileSync(storePath, 'utf-8'))
    assert.equal(parsed.sessions.length, 1)
    assert.equal(parsed.sessions[0].id, 'injected-1')
  })

  it('reads back from the injected path', () => {
    const storePath = path.join(dir, 'roundtrip.json')
    new SessionStore(storePath).upsertSession(sample('roundtrip-1'))

    const fresh = new SessionStore(storePath)
    assert.equal(fresh.load(), true)
    assert.equal(fresh.getSessions()[0].id, 'roundtrip-1')
  })

  it('creates missing parent directories for the injected path', () => {
    const storePath = path.join(dir, 'deep', 'nested', 'sessions.json')
    new SessionStore(storePath).upsertSession(sample('deep-1'))
    assert.ok(fsSync.existsSync(storePath))
  })

  it('two stores on different paths do not see each other', () => {
    const a = path.join(dir, 'a.json')
    const b = path.join(dir, 'b.json')
    new SessionStore(a).upsertSession(sample('only-a'))
    new SessionStore(b).upsertSession(sample('only-b'))

    const reloadedA = new SessionStore(a)
    reloadedA.load()
    assert.deepEqual(reloadedA.getSessions().map(s => s.id), ['only-a'])
  })

  // The guard that makes the original damage impossible rather than unlikely.
  it('refuses to touch the live store when running under a test runner', () => {
    const saved = process.env.CIPHER_MUX_SESSION_STORE
    delete process.env.CIPHER_MUX_SESSION_STORE
    try {
      assert.throws(
        () => new SessionStore(),
        /test/i,
        'a default-constructed store must not be usable inside a test process',
      )
    } finally {
      if (saved !== undefined) process.env.CIPHER_MUX_SESSION_STORE = saved
    }
  })

  it('honours CIPHER_MUX_SESSION_STORE as the default path', () => {
    const storePath = path.join(dir, 'via-env.json')
    const saved = process.env.CIPHER_MUX_SESSION_STORE
    process.env.CIPHER_MUX_SESSION_STORE = storePath
    try {
      new SessionStore().upsertSession(sample('env-1'))
      const parsed = JSON.parse(fsSync.readFileSync(storePath, 'utf-8'))
      assert.equal(parsed.sessions[0].id, 'env-1')
    } finally {
      if (saved === undefined) delete process.env.CIPHER_MUX_SESSION_STORE
      else process.env.CIPHER_MUX_SESSION_STORE = saved
    }
  })

  it('leaves the live session registry untouched', () => {
    // Whatever the user has there, this suite must not have rewritten it.
    const before = fsSync.existsSync(LIVE_PATH)
      ? fsSync.readFileSync(LIVE_PATH, 'utf-8')
      : null

    try {
      new SessionStore()
    } catch { /* expected */ }

    const after = fsSync.existsSync(LIVE_PATH)
      ? fsSync.readFileSync(LIVE_PATH, 'utf-8')
      : null
    assert.equal(after, before, 'the live registry must be byte-identical')
  })
})

// ─── claudeSessionId survives a restart ─────────────────────
//
// Claude Code's own conversation id is what lets a restore resume that exact
// conversation instead of opening the interactive picker. It was kept in
// memory only, so it was gone precisely when a restart needed it — and the
// persisted shape had no field for it at all.

describe('SessionStore — claudeSessionId', () => {
  let dir: string

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-store-claudeid-'))
  })

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('round-trips the conversation id through disk', () => {
    const storePath = path.join(dir, 'ids.json')
    const store = new SessionStore(storePath)
    store.upsertSession({ ...sample('s1'), claudeSessionId: 'abc-123-def' })

    const fresh = new SessionStore(storePath)
    fresh.load()
    assert.equal(fresh.getSessions()[0].claudeSessionId, 'abc-123-def')
  })

  it('reads a store written before the field existed', () => {
    const storePath = path.join(dir, 'legacy.json')
    fsSync.writeFileSync(storePath, JSON.stringify({
      sessions: [{
        id: 'old', name: 'Alt', tmuxSession: 'cmux-old', entityId: null,
        projectPath: '/tmp', gridSlot: 0, status: 'active', workspaceId: null,
      }],
      gridState: null,
      savedAt: 1,
    }), 'utf-8')

    const store = new SessionStore(storePath)
    assert.equal(store.load(), true)
    assert.equal(store.getSessions()[0].claudeSessionId, undefined)
    assert.equal(store.getSessions()[0].id, 'old')
  })
})

describe('toPersistedSession — conversation id', () => {
  it('carries the id when the session has one', () => {
    const ps = toPersistedSession({
      id: 's1', name: 'S', tmuxSession: 'cmux-s', projectPath: null,
      claudeSessionId: 'conv-1',
    }, 0)
    assert.equal(ps.claudeSessionId, 'conv-1')
  })

  it('writes no empty key when there is none', () => {
    const ps = toPersistedSession({
      id: 's2', name: 'S', tmuxSession: 'cmux-s', projectPath: null,
    }, 0)
    assert.ok(!('claudeSessionId' in ps), 'an absent id must not become a null key')
  })
})
