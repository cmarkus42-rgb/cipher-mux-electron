import * as fs from 'fs'
import * as path from 'path'

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
