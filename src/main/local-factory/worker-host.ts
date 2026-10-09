import * as http from 'node:http'
import * as https from 'node:https'
import type { ToolContext } from '../mcp/mcp-tools'
import type { WorkerHost } from './runner'
import { startEntitySession } from '../mcp/handoff-kernel'
import { findEntitySessions } from '../session/entity-session-lookup'
import { resolveRunDir } from '../session/entity-run-dir'
import { readLocalWorkerConfig } from './local-provider'
import { endpointProbeUrl, readUsageFile } from './worker-host-util'
import { BRAND } from '../../shared/brand'

export { endpointProbeUrl, readUsageFile }

/**
 * Der echte Host: SessionManager, tmux, Usage-Dateien. node:http statt fetch —
 * fetch im Main-Prozess läuft über Chromiums Netzstack und fällt dort über
 * System-Proxy-Einstellungen (dieselbe Falle wie beim Gateway-Klienten).
 */

function probe(url: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise(resolve => {
    const mod = url.startsWith('https:') ? https : http
    try {
      const req = mod.get(url, { timeout: timeoutMs }, res => {
        res.resume()
        resolve((res.statusCode ?? 500) < 500)
      })
      req.on('timeout', () => { req.destroy(); resolve(false) })
      req.on('error', () => resolve(false))
    } catch {
      resolve(false)
    }
  })
}

export function createWorkerHost(ctx: ToolContext): WorkerHost {
  const sm = ctx.sessionManager
  const ws = ctx.workspaceId ?? null
  return {
    async endpointReachable() {
      const { configStore } = await import('../config/config-store')
      const cfg = readLocalWorkerConfig(configStore.get('agent')?.localWorker ?? null)
      return cfg ? probe(endpointProbeUrl(cfg.baseUrl)) : false
    },
    async startFreshWorker(projekt) {
      for (const s of findEntitySessions(sm.list(), 'local-worker', ws)) {
        await sm.stopEntity('local-worker', s.id)
      }
      const session = await startEntitySession(ctx, 'local-worker', { projectPath: projekt })
      return { runDir: resolveRunDir(ws, 'local-worker'), sessionId: session.id }
    },
    async sendToWorker(sessionId, line) {
      await sm.sendKeys(sessionId, line + '\r')
    },
    async stopWorker(sessionId) {
      try { await sm.stopEntity('local-worker', sessionId) } catch { /* schon weg */ }
    },
    lastActivityAt(sessionId) {
      return readUsageFile(BRAND.statusLineDir, sessionId)?.mtime ?? 0
    },
    tokensAt(sessionId) {
      return readUsageFile(BRAND.statusLineDir, sessionId)?.tokens ?? null
    },
    async wakeArchitect(line) {
      const target = findEntitySessions(sm.list(), 'local-factory', ws)[0]
      if (!target) {
        console.warn('[local-factory] Architekt nicht gefunden, Weckzeile verloren:', line)
        return
      }
      await sm.sendKeys(target.id, line + '\r')
    },
  }
}
