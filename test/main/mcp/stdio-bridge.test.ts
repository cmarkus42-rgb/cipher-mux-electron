/**
 * Die MCP-Bruecke, als echter Kindprozess gegen echte HTTP-Server.
 *
 * Der Fake-Server legt offen, was ankommt (zaehlt Aufrufe, liest Koepfe); der letzte
 * Block faehrt den echten McpServerManager herunter und wieder hoch.
 */
import { describe, it, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { buildBridgeMcpEntry, ensureBridgeScript, buildResilientMcpEntry } from '../../../src/main/mcp/stdio-bridge'
import { McpServerManager } from '../../../src/main/mcp/mcp-server'
import type { ToolContext } from '../../../src/main/mcp/mcp-tools'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bridge-'))
const script = ensureBridgeScript(dir)
const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string } }
type Behaviour = 'normal' | 'drop-tools-call'

/** Ein MCP-Server, gerade genug: vergibt Sessions, antwortet per SSE oder JSON. */
class FakeServer {
  server: http.Server | null = null
  port = 0
  calls: Rpc[] = []
  inits: http.IncomingHttpHeaders[] = []
  deletes = 0
  sessions = new Set<string>()
  behaviour: Behaviour = 'normal'
  version = 'v1'
  private next = 0

  async start(port = 0): Promise<void> {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => this.handle(req, res, chunks))
    })
    await new Promise<void>(r => this.server!.listen(port, '127.0.0.1', r))
    this.port = (this.server.address() as AddressInfo).port
  }
  async stop(): Promise<void> {
    const s = this.server
    this.server = null
    if (!s) return
    s.closeAllConnections()
    await new Promise<void>(r => s.close(() => r()))
  }
  private handle(req: http.IncomingMessage, res: http.ServerResponse, chunks: Buffer[]): void {
    const sid = req.headers['mcp-session-id'] as string | undefined
    if (req.method === 'DELETE') {
      this.deletes++
      res.writeHead(200).end()
      return
    }
    const msg = JSON.parse(Buffer.concat(chunks).toString()) as Rpc
    if (msg.method === 'initialize') {
      this.inits.push(req.headers)
      const id = `s${++this.next}`
      this.sessions.add(id)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'mcp-session-id': id })
      res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: INIT.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake', version: this.version } } })}\n\n`)
      return
    }
    if (!sid || !this.sessions.has(sid)) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"Session not found"}')
      return
    }
    if (msg.id === undefined) { res.writeHead(202).end(); return }
    this.calls.push(msg)
    if (this.behaviour === 'drop-tools-call' && msg.method === 'tools/call') {
      res.socket?.destroy()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: msg.method } }))
  }
}

/** Die Bruecke als Kindprozess, wie Claude Code sie aus dem Eintrag startet. */
class Bridge {
  proc: ChildProcess
  private messages: Rpc[] = []
  private waiters: Array<() => void> = []
  private buf = ''
  exited: Promise<number | null>

  constructor(url: string, opts: { workspace?: string; entity?: string; env?: Record<string, string> } = {}) {
    const entry = buildBridgeMcpEntry(script, url, 'key', opts.workspace ?? null, opts.entity ?? null)
    this.proc = spawn(process.execPath, entry.args, { env: { ...process.env, ...entry.env, ...opts.env }, stdio: ['pipe', 'pipe', 'ignore'] })
    this.exited = new Promise(r => this.proc.on('exit', c => r(c)))
    this.proc.stdout!.setEncoding('utf-8')
    this.proc.stdout!.on('data', (c: string) => {
      this.buf += c
      let cut
      while ((cut = this.buf.indexOf('\n')) !== -1) {
        this.messages.push(JSON.parse(this.buf.slice(0, cut)))
        this.buf = this.buf.slice(cut + 1)
      }
      this.waiters.splice(0).forEach(w => w())
    })
  }
  send(msg: Rpc): void { this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n') }
  async waitFor(id: unknown, timeoutMs = 10_000): Promise<Rpc> {
    const end = Date.now() + timeoutMs
    for (;;) {
      const hit = this.messages.find(m => m.id === id)
      if (hit) return hit
      const left = end - Date.now()
      if (left <= 0) throw new Error(`keine Antwort auf ${String(id)}`)
      await new Promise<void>(r => {
        const t = setTimeout(r, left)
        this.waiters.push(() => { clearTimeout(t); r() })
      })
    }
  }
  seen(pred: (m: Rpc) => boolean): boolean { return this.messages.some(pred) }
  async init(): Promise<Rpc> {
    this.send({ id: 'i', method: 'initialize', params: INIT })
    const r = await this.waitFor('i')
    this.send({ method: 'notifications/initialized' })
    return r
  }
  kill(): void { this.proc.kill('SIGKILL') }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('MCP-Bruecke', () => {
  let server: FakeServer
  let bridge: Bridge
  const up = async () => {
    server = new FakeServer()
    await server.start()
    return `http://127.0.0.1:${server.port}/mcp`
  }
  afterEach(async () => {
    bridge?.kill()
    await server?.stop()
  })

  it('reicht Anmeldung und Aufruf durch, auch als SSE', async () => {
    bridge = new Bridge(await up())
    const i = await bridge.init()
    assert.equal(i.result?.protocolVersion, INIT.protocolVersion)
    bridge.send({ id: 1, method: 'tools/list' })
    assert.deepEqual((await bridge.waitFor(1)).result, { ok: 'tools/list' })
  })

  it('uebersteht einen Neustart des Servers und ruft danach erfolgreich auf', async () => {
    bridge = new Bridge(await up())
    await bridge.init()
    const port = server.port
    await server.stop()
    bridge.send({ id: 2, method: 'tools/call', params: { name: 'x' } })
    await sleep(600)
    const fresh = new FakeServer()
    await fresh.start(port)
    server = fresh
    const r = await bridge.waitFor(2)
    assert.equal(r.error, undefined)
    assert.equal(server.calls.filter(c => c.method === 'tools/call').length, 1)
  })

  it('meldet sich nach 404 selbst neu an — mit derselben Bindung', async () => {
    bridge = new Bridge(await up(), { workspace: 'ws-1', entity: 'debugger' })
    await bridge.init()
    server.sessions.clear()
    bridge.send({ id: 3, method: 'tools/call', params: { name: 'x' } })
    const r = await bridge.waitFor(3)
    assert.equal(r.error, undefined)
    assert.equal(server.inits.length, 2)
    for (const h of server.inits) {
      assert.equal(h['x-mux-workspace'], 'ws-1')
      assert.equal(h['x-mux-entity'], 'debugger')
      assert.equal(h.authorization, 'Bearer key')
    }
  })

  it('wiederholt einen tools/call NICHT, wenn die Verbindung mittendrin abreisst', async () => {
    bridge = new Bridge(await up())
    await bridge.init()
    server.behaviour = 'drop-tools-call'
    bridge.send({ id: 4, method: 'tools/call', params: { name: 'mux_notes_create' } })
    const r = await bridge.waitFor(4)
    assert.match(r.error?.message ?? '', /unbekannt/)
    await sleep(800)
    assert.equal(server.calls.filter(c => c.method === 'tools/call').length, 1)
  })

  it('wiederholt ein tools/list, wenn die Verbindung abreisst', async () => {
    bridge = new Bridge(await up())
    await bridge.init()
    const port = server.port
    await server.stop()
    bridge.send({ id: 5, method: 'tools/list' })
    await sleep(300)
    const fresh = new FakeServer()
    await fresh.start(port)
    server = fresh
    assert.deepEqual((await bridge.waitFor(5)).result, { ok: 'tools/list' })
  })

  it('fuehrt einen waehrend des Ausfalls abgebrochenen Aufruf nicht mehr aus', async () => {
    bridge = new Bridge(await up())
    await bridge.init()
    const port = server.port
    await server.stop()
    bridge.send({ id: 6, method: 'tools/call', params: { name: 'x' } })
    await sleep(200)
    bridge.send({ method: 'notifications/cancelled', params: { requestId: 6 } })
    await sleep(100)
    const fresh = new FakeServer()
    await fresh.start(port)
    server = fresh
    await sleep(2500)
    assert.equal(server.calls.length, 0)
  })

  it('antwortet nach der Frist mit Fehler, lebt aber weiter', async () => {
    bridge = new Bridge(await up(), { env: { CIPHER_MUX_BRIDGE_OUTAGE_WAIT_MS: '700' } })
    await bridge.init()
    const port = server.port
    await server.stop()
    bridge.send({ id: 7, method: 'tools/call', params: { name: 'x' } })
    assert.match((await bridge.waitFor(7)).error?.message ?? '', /nicht erreichbar/)
    const fresh = new FakeServer()
    await fresh.start(port)
    server = fresh
    bridge.send({ id: 8, method: 'tools/call', params: { name: 'x' } })
    assert.equal((await bridge.waitFor(8)).error, undefined)
  })

  it('meldet eine neue Serverversion als geaenderte Werkzeugliste, sonst nicht', async () => {
    bridge = new Bridge(await up())
    await bridge.init()
    server.sessions.clear()
    bridge.send({ id: 9, method: 'tools/list' })
    await bridge.waitFor(9)
    const listChanged = (m: Rpc) => m.method === 'notifications/tools/list_changed'
    assert.equal(bridge.seen(listChanged), false)
    server.sessions.clear()
    server.version = 'v2'
    bridge.send({ id: 10, method: 'tools/list' })
    await bridge.waitFor(10)
    assert.equal(bridge.seen(listChanged), true)
  })

  it('wartet beim Start auf den Server und scheitert sonst mit Antwort statt zu haengen', async () => {
    const url = await up()
    const port = server.port
    await server.stop()
    bridge = new Bridge(url, { env: { CIPHER_MUX_BRIDGE_INIT_WAIT_MS: '500' } })
    bridge.send({ id: 'i', method: 'initialize', params: INIT })
    assert.match((await bridge.waitFor('i')).error?.message ?? '', /nicht erreichbar/)
    bridge.kill()
    bridge = new Bridge(url)
    bridge.send({ id: 'i', method: 'initialize', params: INIT })
    await sleep(300)
    await server.start(port)
    assert.equal((await bridge.waitFor('i')).error, undefined)
  })

  it('gibt beim Ende von stdin die Server-Session frei und beendet sich', async () => {
    bridge = new Bridge(await up())
    await bridge.init()
    bridge.proc.stdin!.end()
    assert.equal(await bridge.exited, 0)
    assert.equal(server.deletes, 1)
  })
})

describe('MCP-Bruecke gegen den echten McpServerManager', () => {
  it('uebersteht stop/start auf demselben Port', async () => {
    const ctx = { sessionManager: {}, messageBus: null, statusLineMonitor: null, kickoffOrchestrator: null, taskManager: null, inputRequestWatcher: null } as unknown as ToolContext
    const probe = http.createServer()
    await new Promise<void>(r => probe.listen(0, '127.0.0.1', r))
    const port = (probe.address() as AddressInfo).port
    await new Promise(r => probe.close(r))
    let mgr = new McpServerManager()
    await mgr.start(port, '127.0.0.1', 'key', ctx)
    const bridge = new Bridge(`http://127.0.0.1:${port}/mcp`)
    try {
      await bridge.init()
      bridge.send({ id: 1, method: 'tools/list' })
      const before = (await bridge.waitFor(1)).result?.tools as unknown[]
      assert.ok(before.length > 0)
      await mgr.stop()
      bridge.send({ id: 2, method: 'tools/list' })
      await sleep(500)
      mgr = new McpServerManager()
      await mgr.start(port, '127.0.0.1', 'key', ctx)
      const after = (await bridge.waitFor(2)).result?.tools as unknown[]
      assert.equal(after.length, before.length)
    } finally {
      bridge.kill()
      await mgr.stop()
    }
  })
})

describe('buildResilientMcpEntry', () => {
  it('faellt auf HTTP zurueck, wenn das Skript nicht ablegbar ist', () => {
    const file = path.join(dir, 'kein-verzeichnis')
    fs.writeFileSync(file, '')
    const e = buildResilientMcpEntry('http://h/mcp', 'k', 'ws', null, file)
    assert.equal(e.type, 'http')
  })
})
