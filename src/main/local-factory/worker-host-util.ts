import * as fs from 'fs'
import * as path from 'path'
import * as http from 'node:http'
import * as https from 'node:https'
import { readLocalWorkerConfig } from './local-provider'

/**
 * Reine Hilfen des Hosts, ohne Electron-Abhängigkeit — damit sie sich
 * testen lassen, ohne handoff-kernel (und damit electron) zu laden.
 */

export function endpointProbeUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/models'
}

export function readUsageFile(
  dir: string,
  sessionId: string,
): { mtime: number; tokens: { input: number; output: number } | null } | null {
  const f = path.join(dir, `${sessionId}.json`)
  try {
    const mtime = fs.statSync(f).mtimeMs
    const cw = JSON.parse(fs.readFileSync(f, 'utf-8'))?.context_window
    const tokens = cw && typeof cw.total_input_tokens === 'number'
      ? { input: cw.total_input_tokens, output: cw.total_output_tokens ?? 0 }
      : null
    return { mtime, tokens }
  } catch {
    return null
  }
}

export type ProbeResult = { ok: true } | { ok: false; detail: string }

/**
 * Nur 2xx zählt. Ein 404 (baseUrl ohne /v1) heißt: der Worker käme hoch und
 * fände kein Modell — das verbrauchte einen Versuch für einen Konfigfehler.
 * node:http statt fetch: fetch im Main-Prozess läuft über Chromiums Netzstack
 * und fällt dort über System-Proxy-Einstellungen.
 */
export function probeEndpoint(url: string, timeoutMs = 5000): Promise<ProbeResult> {
  return new Promise(resolve => {
    const mod = url.startsWith('https:') ? https : http
    try {
      const req = mod.get(url, { timeout: timeoutMs }, res => {
        res.resume()
        const code = res.statusCode ?? 0
        resolve(code >= 200 && code < 300 ? { ok: true } : { ok: false, detail: `HTTP ${code}` })
      })
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: `keine Antwort in ${timeoutMs} ms` }) })
      req.on('error', err => resolve({ ok: false, detail: err.message }))
    } catch (err) {
      resolve({ ok: false, detail: String(err) })
    }
  })
}

/**
 * Bereitschaft des lokalen Workers (Ruling R15): null = bereit, sonst der Grund.
 * „Nicht konfiguriert“ und „Endpunkt weg“ sind verschiedene Gründe, und
 * skipPermissions wird nicht pro Rolle still erzwungen, sondern benannt.
 */
export async function checkWorkerReady(deps: {
  localWorker: unknown
  skipPermissions: boolean
  probe: (url: string) => Promise<ProbeResult>
}): Promise<string | null> {
  const cfg = readLocalWorkerConfig(deps.localWorker)
  if (!cfg) return 'Local Worker nicht konfiguriert (agent.localWorker fehlt oder ist unvollständig)'
  if (!deps.skipPermissions) return 'Worker braucht agent.skipPermissions — sonst hängt opencode im Rückfrage-Dialog'
  const url = endpointProbeUrl(cfg.baseUrl)
  const p = await deps.probe(url)
  return p.ok ? null : `Endpunkt des lokalen Modells nicht erreichbar: ${url} (${p.detail})`
}
