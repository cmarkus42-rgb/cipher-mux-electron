import * as http from 'http'
import { randomUUID } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { APP_NAME, APP_VERSION, MCP_DEFAULT_PORT, MCP_DEFAULT_HOST } from '../../shared/constants'
import { validateBearer } from './mcp-auth'
import { registerTools, ToolContext } from './mcp-tools'

/** Session timeout: sessions inactive for longer than this are garbage-collected. */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
/** How often the GC sweep runs. */
export const SESSION_GC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
/** Maximum concurrent MCP sessions. */
export const MAX_MCP_SESSIONS = 5

/**
 * Per-client MCP session — each connecting client gets its own
 * McpServer + StreamableHTTPServerTransport pair.
 */
interface McpSession {
  sessionId: string
  mcpServer: McpServer
  transport: StreamableHTTPServerTransport
  lastActivity: number
}

/**
 * McpServerManager — Runs an MCP server over Streamable HTTP in the Electron main process.
 *
 * Supports multiple concurrent clients. Each client that sends an `initialize`
 * request gets its own McpServer + Transport pair, keyed by the Mcp-Session-Id header.
 */
export class McpServerManager {
  private httpServer: http.Server | null = null
  private sessions: Map<string, McpSession> = new Map()
  private port: number = MCP_DEFAULT_PORT
  private host: string = MCP_DEFAULT_HOST
  private apiKey: string = ''
  private toolCtx: ToolContext | null = null
  private gcTimer: ReturnType<typeof setInterval> | null = null
  private startTime: number = 0

  /**
   * Start the MCP server.
   */
  async start(port: number, host: string, apiKey: string, ctx: ToolContext): Promise<void> {
    if (this.httpServer) {
      throw new Error('MCP server is already running')
    }

    this.port = port
    this.host = host
    this.apiKey = apiKey
    this.toolCtx = ctx

    // Create HTTP server with auth middleware
    this.httpServer = http.createServer((req, res) => {
      this.handleRequest(req, res)
    })

    this.startTime = Date.now()

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject)
      this.httpServer!.listen(this.port, this.host, () => {
        this.httpServer!.removeListener('error', reject)
        console.log(`[McpServer] listening on ${this.host}:${this.port}`)
        resolve()
      })
    })

    // Start session GC sweep
    this.gcTimer = setInterval(() => this.sweepStaleSessions(), SESSION_GC_INTERVAL_MS)
  }

  /**
   * Stop the MCP server and all sessions.
   */
  async stop(): Promise<void> {
    // Stop GC timer
    if (this.gcTimer) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }

    // Close all sessions
    for (const [id, session] of this.sessions) {
      try {
        await session.transport.close()
        await session.mcpServer.close()
      } catch {
        // ignore cleanup errors
      }
      this.sessions.delete(id)
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve())
      })
      this.httpServer = null
      console.log('[McpServer] stopped')
    }
  }

  /**
   * Get the port the server is running on.
   */
  getPort(): number {
    return this.port
  }

  /**
   * Check if the server is running.
   */
  isRunning(): boolean {
    return this.httpServer !== null && this.httpServer.listening
  }

  /**
   * Create a new MCP session (McpServer + Transport) for a connecting client.
   */
  private async createSession(): Promise<McpSession> {
    // Enforce session limit — evict oldest if at capacity
    if (this.sessions.size >= MAX_MCP_SESSIONS) {
      await this.evictOldestSession()
    }

    const mcpServer = new McpServer(
      { name: APP_NAME, version: APP_VERSION },
      { capabilities: { tools: {} } }
    )

    // Register tools on the new server instance
    registerTools(mcpServer, this.toolCtx!)

    const sessionId = randomUUID()

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (id: string) => {
        console.log(`[McpServer] session initialized: ${id}`)
      },
    })

    // Connect transport to MCP server
    await mcpServer.connect(transport)

    const session: McpSession = { sessionId, mcpServer, transport, lastActivity: Date.now() }
    this.sessions.set(sessionId, session)

    console.log(`[McpServer] new session created: ${sessionId} (total: ${this.sessions.size})`)
    return session
  }

  /**
   * Handle an incoming HTTP request.
   * Validates auth, sets CORS headers, routes to the correct session transport.
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Health endpoint — no auth required
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        sessions: this.sessions.size,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      }))
      return
    }

    // Auth check — require Bearer token on all non-OPTIONS requests
    if (!validateBearer(req.headers.authorization, this.apiKey)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    // Only handle /mcp path (or root)
    const url = req.url ?? '/'
    if (url !== '/mcp' && url !== '/') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    // For POST requests, collect body and route to the right session
    if (req.method === 'POST') {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          this.routePost(req, res, body)
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        }
      })
    } else if (req.method === 'GET' || req.method === 'DELETE') {
      this.routeGetOrDelete(req, res)
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Method not allowed' }))
    }
  }

  /**
   * Route a POST request. If it's an initialize request (no session ID),
   * create a new session. Otherwise, route to the existing session.
   */
  private async routePost(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: unknown
  ): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    // Check if this is an initialize request (no session header)
    if (!sessionId) {
      // Check if the body contains an initialize method
      const isInit = this.isInitializeRequest(body)
      if (isInit) {
        try {
          const session = await this.createSession()
          session.transport.handleRequest(req, res, body)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: msg }, id: null }))
        }
        return
      }
      // Non-init request without session ID — reject
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Mcp-Session-Id header is required' },
        id: null,
      }))
      return
    }

    // Route to existing session
    const session = this.sessions.get(sessionId)
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null,
      }))
      return
    }

    session.lastActivity = Date.now()
    session.transport.handleRequest(req, res, body)
  }

  /**
   * Route GET or DELETE requests to the correct session.
   */
  private routeGetOrDelete(req: http.IncomingMessage, res: http.ServerResponse): void {
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Mcp-Session-Id header is required' },
        id: null,
      }))
      return
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null,
      }))
      return
    }

    session.lastActivity = Date.now()

    // On DELETE, clean up the session after the transport handles it
    if (req.method === 'DELETE') {
      session.transport.handleRequest(req, res)
      // Clean up after a short delay to let the response finish
      setTimeout(async () => {
        try {
          await session.mcpServer.close()
        } catch { /* ignore */ }
        this.sessions.delete(sessionId)
        console.log(`[McpServer] session closed: ${sessionId} (remaining: ${this.sessions.size})`)
      }, 100)
      return
    }

    session.transport.handleRequest(req, res)
  }

  /**
   * Remove sessions that have been inactive for longer than SESSION_TIMEOUT_MS.
   */
  private async sweepStaleSessions(): Promise<void> {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
        console.log(`[McpServer] GC: removing stale session ${id} (idle ${Math.round((now - session.lastActivity) / 1000)}s)`)
        try {
          await session.transport.close()
          await session.mcpServer.close()
        } catch { /* ignore cleanup errors */ }
        this.sessions.delete(id)
      }
    }
  }

  /**
   * Evict the oldest session (by lastActivity) to make room for a new one.
   */
  private async evictOldestSession(): Promise<void> {
    let oldest: McpSession | null = null
    for (const session of this.sessions.values()) {
      if (!oldest || session.lastActivity < oldest.lastActivity) {
        oldest = session
      }
    }
    if (oldest) {
      console.warn(`[McpServer] session limit (${MAX_MCP_SESSIONS}) reached — evicting oldest session ${oldest.sessionId}`)
      try {
        await oldest.transport.close()
        await oldest.mcpServer.close()
      } catch { /* ignore cleanup errors */ }
      this.sessions.delete(oldest.sessionId)
    }
  }

  /**
   * Expose session count for testing.
   */
  getSessionCount(): number {
    return this.sessions.size
  }

  /**
   * Expose the GC sweep for testing (allows manual trigger).
   */
  async _sweepForTest(): Promise<void> {
    await this.sweepStaleSessions()
  }

  /**
   * Check if a JSON-RPC body is an initialize request.
   */
  private isInitializeRequest(body: unknown): boolean {
    if (Array.isArray(body)) {
      return body.some(msg => msg?.method === 'initialize')
    }
    return (body as { method?: string })?.method === 'initialize'
  }
}
