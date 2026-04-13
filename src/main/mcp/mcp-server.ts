import * as http from 'http'
import { randomUUID } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { APP_NAME, APP_VERSION, MCP_DEFAULT_PORT, MCP_DEFAULT_HOST } from '../../shared/constants'
import { validateBearer } from './mcp-auth'
import { registerTools, ToolContext } from './mcp-tools'

/**
 * McpServerManager — Runs an MCP server over Streamable HTTP in the Electron main process.
 *
 * Uses @modelcontextprotocol/sdk's McpServer + StreamableHTTPServerTransport
 * with API-key auth via Bearer token.
 */
export class McpServerManager {
  private httpServer: http.Server | null = null
  private mcpServer: McpServer | null = null
  private transport: StreamableHTTPServerTransport | null = null
  private port: number = MCP_DEFAULT_PORT
  private host: string = MCP_DEFAULT_HOST
  private apiKey: string = ''

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

    // Create MCP server
    this.mcpServer = new McpServer(
      { name: APP_NAME, version: APP_VERSION },
      { capabilities: { tools: {} } }
    )

    // Register tools
    registerTools(this.mcpServer, ctx)

    // Create transport (stateful mode with session IDs)
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    })

    // Connect transport to MCP server
    await this.mcpServer.connect(this.transport)

    // Create HTTP server with auth middleware
    this.httpServer = http.createServer((req, res) => {
      this.handleRequest(req, res)
    })

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject)
      this.httpServer!.listen(this.port, this.host, () => {
        this.httpServer!.removeListener('error', reject)
        console.log(`[McpServer] listening on ${this.host}:${this.port}`)
        resolve()
      })
    })
  }

  /**
   * Stop the MCP server.
   */
  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close()
      this.transport = null
    }

    if (this.mcpServer) {
      await this.mcpServer.close()
      this.mcpServer = null
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
   * Handle an incoming HTTP request.
   * Validates auth, sets CORS headers, routes to transport.
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

    // Delegate to transport
    if (!this.transport) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'MCP transport not initialized' }))
      return
    }

    // For POST requests, collect body and pass as parsedBody
    if (req.method === 'POST') {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          this.transport!.handleRequest(req, res, body)
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        }
      })
    } else if (req.method === 'GET' || req.method === 'DELETE') {
      this.transport.handleRequest(req, res)
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Method not allowed' }))
    }
  }
}
