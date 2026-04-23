/**
 * Tests for MCP session lifecycle: GC sweep, session limit, health endpoint.
 *
 * We start a real McpServerManager on a random port and hit it with HTTP requests.
 * ToolContext is stubbed — we only care about session management, not tool execution.
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as http from 'http'
import { McpServerManager, MAX_MCP_SESSIONS, SESSION_TIMEOUT_MS } from '../../src/main/mcp/mcp-server'
import type { ToolContext } from '../../src/main/mcp/mcp-tools'

/** Minimal stub context — tools won't be called in these tests. */
function stubCtx(): ToolContext {
  return {
    sessionManager: {} as ToolContext['sessionManager'],
    messageBus: null,
    statusLineMonitor: null,
    kickoffOrchestrator: null,
    taskManager: null,
    inputRequestWatcher: null,
  }
}

const API_KEY = 'test-key-lifecycle'

/** Simple HTTP helper that returns status + parsed JSON body. */
function request(
  port: number,
  opts: { method: string; path: string; headers?: Record<string, string>; body?: unknown }
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const reqOpts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: opts.path,
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    }
    const req = http.request(reqOpts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        let body: unknown
        try { body = JSON.parse(raw) } catch { body = raw }
        resolve({ status: res.statusCode ?? 0, body })
      })
    })
    req.on('error', reject)
    if (opts.body) {
      req.write(JSON.stringify(opts.body))
    }
    req.end()
  })
}

/** Send an MCP initialize request (no session header) and return the session ID from response headers. */
async function initSession(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0.1' } }, id: 1 })
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${API_KEY}`,
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const sid = res.headers['mcp-session-id'] as string | undefined
        if (!sid) {
          reject(new Error(`No Mcp-Session-Id header in response (status ${res.statusCode}): ${Buffer.concat(chunks).toString()}`))
          return
        }
        resolve(sid)
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// Use a port range unlikely to conflict
let portCounter = 13100

describe('McpServerManager — session lifecycle', () => {
  let mgr: McpServerManager
  let port: number

  beforeEach(async () => {
    port = portCounter++
    mgr = new McpServerManager()
    await mgr.start(port, '127.0.0.1', API_KEY, stubCtx())
  })

  afterEach(async () => {
    await mgr.stop()
  })

  // ─── Health endpoint ──────────────────────────────────────

  describe('GET /health', () => {
    it('returns status ok without auth', async () => {
      const { status, body } = await request(port, {
        method: 'GET',
        path: '/health',
        // No Authorization header
      })
      assert.equal(status, 200)
      const data = body as { status: string; sessions: number; uptime: number }
      assert.equal(data.status, 'ok')
      assert.equal(typeof data.sessions, 'number')
      assert.equal(typeof data.uptime, 'number')
      assert.ok(data.uptime >= 0)
    })

    it('reflects session count', async () => {
      // Create one session
      await initSession(port)

      const { body } = await request(port, {
        method: 'GET',
        path: '/health',
      })
      assert.equal((body as { sessions: number }).sessions, 1)
    })
  })

  // ─── Session GC ───────────────────────────────────────────

  describe('session GC', () => {
    it('removes sessions older than SESSION_TIMEOUT_MS', async () => {
      // Create a session
      await initSession(port)
      assert.equal(mgr.getSessionCount(), 1)

      // Monkey-patch lastActivity to simulate age > timeout
      // Access the private sessions map via the test helper
      const sessions = (mgr as unknown as { sessions: Map<string, { lastActivity: number }> }).sessions
      for (const s of sessions.values()) {
        s.lastActivity = Date.now() - SESSION_TIMEOUT_MS - 1000
      }

      // Trigger GC
      await mgr._sweepForTest()

      assert.equal(mgr.getSessionCount(), 0, 'stale session should have been removed')
    })

    it('keeps active sessions alive', async () => {
      await initSession(port)
      assert.equal(mgr.getSessionCount(), 1)

      // Don't age the session — it should survive GC
      await mgr._sweepForTest()

      assert.equal(mgr.getSessionCount(), 1, 'active session should remain')
    })
  })

  // ─── Session limit ────────────────────────────────────────

  describe('session limit', () => {
    it(`evicts oldest when limit (${MAX_MCP_SESSIONS}) is reached`, async () => {
      // Fill to capacity
      const sessionIds: string[] = []
      for (let i = 0; i < MAX_MCP_SESSIONS; i++) {
        const sid = await initSession(port)
        sessionIds.push(sid)
      }
      assert.equal(mgr.getSessionCount(), MAX_MCP_SESSIONS)

      // Create one more — should evict the oldest
      const newSid = await initSession(port)
      assert.ok(newSid, 'new session should be created')
      assert.equal(mgr.getSessionCount(), MAX_MCP_SESSIONS, 'count should not exceed limit')

      // The first session should have been evicted
      const { status } = await request(port, {
        method: 'POST',
        path: '/mcp',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Mcp-Session-Id': sessionIds[0],
        },
        body: { jsonrpc: '2.0', method: 'tools/list', id: 2 },
      })
      assert.equal(status, 404, 'oldest session should have been evicted')
    })
  })
})
