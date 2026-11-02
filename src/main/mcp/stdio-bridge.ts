// src/main/mcp/stdio-bridge.ts — Die Bruecke zwischen Claude Code und dem MCP-Server.
//
// Der MCP-Server lebt im Electron-Main-Prozess, die Sessions in tmux. Startet der
// Mux neu, laufen die Sessions weiter und der Server ist weg. Eine direkte
// HTTP-Verbindung gibt Claude Code dann nach fuenf Versuchen in rund 15 Sekunden
// endgueltig auf (gemessen an 2.1.316, mcp-logs vom 2026-11-01), und nach einem 404
// auf eine unbekannte Session-ID genauso. Danach bleibt der Server fuer den Rest der
// Session tot.
//
// Mit der Bruecke spricht Claude Code stdio mit einem eigenen Kindprozess, und der
// sieht keinen Ausfall: Das Skript wartet auf den Server und meldet sich nach einem
// 404 selbst neu an — mit denselben Koepfen, also derselben Workspace- und
// Rollenbindung.
//
// Die eine Regel, die nicht verhandelbar ist: Ein `tools/call`, dessen Verbindung
// mitten im Aufruf abreisst, wird NICHT wiederholt. Ob er gelaufen ist, weiss niemand,
// und ein zweiter mux_entity_start oder mux_notes_create waere ein echter Schaden.
// Wiederholt wird nur, was den Server nachweislich nicht erreicht hat
// (Verbindung abgelehnt, 404 auf die Session).
//
// Abhaengigkeitsfrei und CommonJS wie die Rollengrenzen: laeuft mit jedem `node` auf
// dem PATH, unabhaengig von Electron.

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { buildMcpServerConfig } from './workspace-header'

export const BRIDGE_URL_ENV = 'CIPHER_MUX_BRIDGE_URL'
export const BRIDGE_HEADERS_ENV = 'CIPHER_MUX_BRIDGE_HEADERS'

export interface BridgeMcpEntry {
  type: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
}

/** Der `mcpServers['cipher-mux']`-Eintrag, der die Bruecke startet. */
export function buildBridgeMcpEntry(
  scriptPath: string,
  mcpUrl: string,
  apiKey: string,
  workspaceId: string | null,
  entityId?: string | null,
): BridgeMcpEntry {
  const { headers } = buildMcpServerConfig(mcpUrl, apiKey, workspaceId, entityId)
  return {
    type: 'stdio',
    command: 'node',
    args: [scriptPath],
    env: { [BRIDGE_URL_ENV]: mcpUrl, [BRIDGE_HEADERS_ENV]: JSON.stringify(headers) },
  }
}

/**
 * Legt das Skript ab und gibt den Pfad zurueck. Laufende Bruecken stoert das nicht,
 * sie haben ihren Stand im Speicher; umbenannt wird, damit ein gleichzeitiger Start
 * nie eine halbe Datei liest.
 */
export function ensureBridgeScript(
  dir: string = path.join(os.homedir(), '.config', 'cipher-mux'),
): string {
  const scriptPath = path.join(dir, 'mcp-bridge.cjs')
  let current: string | null = null
  try { current = fs.readFileSync(scriptPath, 'utf-8') } catch { /* noch nicht da */ }
  if (current !== BRIDGE_SCRIPT) {
    fs.mkdirSync(dir, { recursive: true })
    const tmp = `${scriptPath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, BRIDGE_SCRIPT, 'utf-8')
    fs.renameSync(tmp, scriptPath)
  }
  return scriptPath
}

/**
 * Der Eintrag fuer eine Claude-Code-Session. Laesst sich das Skript nicht ablegen,
 * bleibt es beim direkten HTTP-Eintrag: lieber eine Verbindung, die einen Neustart
 * nicht uebersteht, als gar keine.
 */
export function buildResilientMcpEntry(
  mcpUrl: string,
  apiKey: string,
  workspaceId: string | null,
  entityId?: string | null,
  scriptDir?: string,
): BridgeMcpEntry | ReturnType<typeof buildMcpServerConfig> {
  try {
    return buildBridgeMcpEntry(ensureBridgeScript(scriptDir), mcpUrl, apiKey, workspaceId, entityId)
  } catch (err) {
    console.warn('[stdio-bridge] Skript nicht ablegbar, bleibe bei HTTP:', err)
    return buildMcpServerConfig(mcpUrl, apiKey, workspaceId, entityId)
  }
}

export const BRIDGE_SCRIPT = String.raw`#!/usr/bin/env node
// cipher-mux MCP-Bruecke (auto-generiert, nicht editieren). Siehe src/main/mcp/stdio-bridge.ts.
'use strict'
const http = require('http')
const https = require('https')
const readline = require('readline')

const target = new URL(process.env.CIPHER_MUX_BRIDGE_URL)
const baseHeaders = JSON.parse(process.env.CIPHER_MUX_BRIDGE_HEADERS || '{}')
const lib = target.protocol === 'https:' ? https : http
// Claude Code wartet beim Verbinden 30 s; die Antwort muss vorher da sein.
const INIT_WAIT_MS = Number(process.env.CIPHER_MUX_BRIDGE_INIT_WAIT_MS) || 25000
const OUTAGE_WAIT_MS = Number(process.env.CIPHER_MUX_BRIDGE_OUTAGE_WAIT_MS) || 120000
const MAX_BACKOFF_MS = 2000

let clientInit = null
let sessionId = null
let protocolVersion = null
let serverVersion = null
let establishing = null
let internalId = 0
const cancelled = new Set()

const log = (text) => process.stderr.write('[mcp-bridge] ' + text + '\n')
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function headersFor(sid) {
  const h = {
    ...baseHeaders,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (sid) h['mcp-session-id'] = sid
  if (protocolVersion) h['mcp-protocol-version'] = protocolVersion
  return h
}

/**
 * Ein POST. onMessage bekommt jede JSON-RPC-Nachricht, sobald sie ankommt.
 * Der Fehler traegt connected: false, wenn der Server nachweislich nichts erhalten hat.
 * agent: false, damit kein alter Keep-Alive-Socket einen frischen Server wie einen
 * Abbruch mitten im Aufruf aussehen laesst.
 */
function post(body, sid, onMessage) {
  return new Promise((resolve, reject) => {
    let connected = false
    const fail = (err) => { err.connected = connected; reject(err) }
    const req = lib.request(target, { method: 'POST', headers: headersFor(sid), agent: false }, (res) => {
      const isSse = String(res.headers['content-type'] || '').includes('text/event-stream')
      const ok = res.statusCode >= 200 && res.statusCode < 300
      let buffer = ''
      res.setEncoding('utf-8')
      const emitEvent = (event) => {
        const data = event.split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n')
        if (!data) return
        try { onMessage(JSON.parse(data)) } catch { /* Fragment ohne JSON */ }
      }
      res.on('data', (chunk) => {
        buffer += chunk
        if (!isSse || !ok) return
        buffer = buffer.replace(/\r\n/g, '\n')
        let cut
        while ((cut = buffer.indexOf('\n\n')) !== -1) {
          emitEvent(buffer.slice(0, cut))
          buffer = buffer.slice(cut + 2)
        }
      })
      res.on('error', fail)
      res.on('aborted', () => fail(new Error('Antwort abgebrochen')))
      res.on('end', () => {
        if (ok && isSse) emitEvent(buffer)
        else if (ok && buffer.trim()) {
          try { onMessage(JSON.parse(buffer)) } catch { /* kein JSON */ }
        }
        resolve({
          status: res.statusCode,
          sessionId: res.headers['mcp-session-id'] || null,
          text: ok ? '' : buffer,
        })
      })
    })
    req.on('socket', (s) => s.once('connect', () => { connected = true }))
    req.on('error', fail)
    req.end(JSON.stringify(body))
  })
}

/** Neue Server-Session mit der Anmeldung des Clients. Nur eine gleichzeitig. */
function establish(deadline) {
  if (establishing) return establishing
  establishing = (async () => {
    const reconnect = serverVersion !== null
    const id = 'bridge-init-' + ++internalId
    let backoff = 250
    for (;;) {
      try {
        let result = null
        let error = null
        protocolVersion = null
        const r = await post(
          { jsonrpc: '2.0', id, method: 'initialize', params: clientInit },
          null,
          (m) => { if (m.id === id) { result = m.result || null; error = m.error || null } },
        )
        if (r.status === 401) throw Object.assign(new Error('Server lehnt den Schluessel ab (401)'), { fatal: true })
        if (error) throw new Error(error.message || 'initialize abgelehnt')
        if (result && r.sessionId) {
          sessionId = r.sessionId
          protocolVersion = result.protocolVersion || null
          await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId, () => {})
          const version = (result.serverInfo && result.serverInfo.version) || ''
          if (reconnect) {
            log('neu angemeldet (Server ' + version + ')')
            // Nach einem Update kann die Werkzeugliste anders sein.
            if (version !== serverVersion) send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })
          }
          serverVersion = version
          return result
        }
        throw new Error('initialize ohne Session (HTTP ' + r.status + ')')
      } catch (err) {
        if (err.fatal || Date.now() + backoff > deadline) throw err
        await sleep(backoff)
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      }
    }
  })().finally(() => { establishing = null })
  return establishing
}

function replyError(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } })
}

async function forwardRequest(msg) {
  const deadline = Date.now() + OUTAGE_WAIT_MS
  // Ein tools/call kann etwas tun; alles andere liest nur und darf nochmal.
  const repeatable = msg.method !== 'tools/call'
  let backoff = 250
  for (;;) {
    if (cancelled.delete(msg.id)) return
    let sid = sessionId
    try {
      if (!sid) {
        await establish(deadline)
        sid = sessionId
        // Waehrend des Wartens abgebrochen: nicht mehr ausfuehren.
        if (cancelled.delete(msg.id)) return
      }
      let answered = false
      const r = await post(msg, sid, (m) => {
        if (m.id === msg.id && !m.method) answered = true
        send(m)
      })
      if (answered) return
      if (r.status === 404) {
        // Server kennt die Session nicht: der Aufruf ist nachweislich nicht gelaufen.
        if (sessionId === sid) sessionId = null
      } else if (r.status >= 200 && r.status < 300) {
        // Strom zu Ende ohne Antwort — der Server ist mittendrin weggegangen.
        if (!repeatable) {
          replyError(msg.id, 'Die Verbindung zum Mux brach waehrend des Aufrufs ab. Ob er ausgefuehrt wurde, ist unbekannt — erst pruefen, dann ggf. wiederholen.')
          return
        }
      } else {
        replyError(msg.id, 'Mux-Server antwortet mit HTTP ' + r.status + ': ' + String(r.text).slice(0, 300))
        return
      }
    } catch (err) {
      if (err.fatal) { replyError(msg.id, err.message); return }
      if (err.connected && !repeatable) {
        if (sessionId === sid) sessionId = null
        replyError(msg.id, 'Die Verbindung zum Mux brach waehrend des Aufrufs ab. Ob er ausgefuehrt wurde, ist unbekannt — erst pruefen, dann ggf. wiederholen.')
        return
      }
      if (sessionId === sid) sessionId = null
    }
    if (Date.now() + backoff > deadline) {
      replyError(msg.id, 'Mux nicht erreichbar (' + Math.round(OUTAGE_WAIT_MS / 1000) + ' s gewartet). Die Verbindung bleibt bestehen — spaeter einfach nochmal aufrufen.')
      return
    }
    await sleep(backoff)
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
  }
}

async function handleInitialize(msg) {
  clientInit = msg.params
  try {
    const result = await establish(Date.now() + INIT_WAIT_MS)
    send({ jsonrpc: '2.0', id: msg.id, result })
  } catch (err) {
    replyError(msg.id, 'Mux nicht erreichbar: ' + err.message)
  }
}

function handleMessage(msg) {
  if (msg.method === 'initialize') return void handleInitialize(msg)
  // Hat die Bruecke beim Anmelden schon selbst geschickt.
  if (msg.method === 'notifications/initialized') return
  if (msg.method === 'notifications/cancelled' && msg.params) cancelled.add(msg.params.requestId)
  if (msg.method && msg.id !== undefined) return void forwardRequest(msg)
  // Benachrichtigungen und Antworten des Clients: ohne Session gibt es keinen Empfaenger.
  if (sessionId) post(msg, sessionId, send).catch(() => {})
}

let closing = false
function shutdown() {
  if (closing) return
  closing = true
  const done = () => process.exit(0)
  if (!sessionId) return done()
  // Den Platz am Server freigeben; er haelt nur eine begrenzte Zahl Sessions.
  const req = lib.request(target, { method: 'DELETE', headers: headersFor(sessionId), agent: false }, (res) => {
    res.resume()
    res.on('end', done)
  })
  req.on('error', done)
  req.end()
  setTimeout(done, 1000).unref()
}

process.stdout.on('error', () => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
lines.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try { msg = JSON.parse(line) } catch { log('kein JSON auf stdin'); return }
  for (const m of Array.isArray(msg) ? msg : [msg]) handleMessage(m)
})
lines.on('close', shutdown)
`
