import type { ToolContext } from '../mcp/mcp-tools'
import type { WorkerHost } from './runner'
import { startEntitySession } from '../mcp/handoff-kernel'
import { findEntitySessions } from '../session/entity-session-lookup'
import { endpointProbeUrl, readUsageFile, checkWorkerReady, probeEndpoint } from './worker-host-util'
import { BRAND } from '../../shared/brand'

export { endpointProbeUrl, readUsageFile }

/**
 * Der echte Host: SessionManager, tmux, Usage-Dateien. Die Bereitschaftsprobe
 * steht in worker-host-util.ts (node:http, nur 2xx).
 */

export function createWorkerHost(ctx: ToolContext): WorkerHost {
  const sm = ctx.sessionManager
  const ws = ctx.workspaceId ?? null
  return {
    async workerReady() {
      const { configStore } = await import('../config/config-store')
      const agent = configStore.get('agent')
      return checkWorkerReady({
        localWorker: agent?.localWorker ?? null,
        skipPermissions: agent?.skipPermissions === true,
        probe: url => probeEndpoint(url),
      })
    },
    async startFreshWorker(projekt) {
      for (const s of findEntitySessions(sm.list(), 'local-worker', ws)) {
        await sm.stopEntity('local-worker', s.id)
      }
      const session = await startEntitySession(ctx, 'local-worker', { projectPath: projekt })
      // Das Run-Verzeichnis ist das cwd der Session (startEntity → start({ projectPath: runDir })).
      // Nicht neu berechnen: startEntity löst den Workspace selbst auf (gelöschter
      // Workspace → ungebunden), eine eigene Rechnung zeigte dann ins falsche Verzeichnis.
      if (!session.projectPath) {
        // Wurf im Läufer (nicht in der Session-Init): räumt auf und weckt mit „Läuferfehler“.
        await sm.stopEntity('local-worker', session.id).catch(() => {})
        throw new Error('Worker-Session ohne Arbeitsverzeichnis gestartet')
      }
      return { runDir: session.projectPath, sessionId: session.id }
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
