import * as fs from 'fs'
import * as path from 'path'
import { BRAND } from '../../shared/brand'

/**
 * Context-Usage fuer Codex-Sessions — derselbe Briefkasten, anderer Zusteller.
 *
 * Claude Code hat eine `statusLine`, die bei jedem Zug ein JSON auf stdout
 * schiebt; `statusline-hook.ts` biegt das mit `cat >` in
 * `<statusLineDir>/<mux-session>.json` um, und der StatusLineMonitor liest es.
 *
 * Codex hat keine solche Statusline. `status_line` in seiner config.toml ist
 * eine Anzeigeoption der TUI, kein Kommando. Was Codex stattdessen hat
 * (gemessen an 0.155.1 am 2026-10-01):
 *
 *  - Jeder Hook-Input traegt `transcript_path` — den Pfad der Rollout-JSONL.
 *  - In dieser Datei steht pro Antwort ein `token_usage_record` mit
 *    `usage.input_tokens`, `cached_input_tokens` und `output_tokens`.
 *  - `codex debug models --json` nennt pro Modell `context_window`.
 *
 * Daraus laesst sich dasselbe JSON bauen, das der Monitor ohnehin schon
 * versteht — er nimmt die verschachtelte `context_window`-Form von Claude Code
 * 2.x. Deshalb wird hier **kein** zweiter Leser gebaut: der Monitor bleibt, wie
 * er ist, und bekommt nur einen weiteren Schreiber.
 *
 * Das `session_id`-Feld ist nicht Beiwerk. Der Monitor zieht es unabhaengig von
 * den Zahlen heraus und meldet es als `claude-session-id` — daran haengt Keep
 * Working, weil ein Restore `codex exec resume <id>` braucht und nicht den
 * interaktiven Picker.
 */

/** Was das erzeugte Skript ueber die Session wissen muss. */
export interface CodexUsageHookOpts {
  /** Groesse des Kontextfensters in Tokens, aus dem Modellkatalog aufgeloest. */
  contextWindowSize: number
  /** Modell-ID, damit der Monitor sie weiterreichen kann. */
  modelId: string
  /** Zielverzeichnis fuer die JSON-Dateien. Nur fuer Tests abweichend. */
  statusLineDir?: string
}

/**
 * Baut das abhaengigkeitsfreie Node-Skript, das als Codex-Hook laeuft.
 *
 * Abhaengigkeitsfrei aus demselben Grund wie bei den Rollengrenzen: das Skript
 * liegt im Run-Verzeichnis einer Entity, und dort gibt es kein `node_modules`.
 *
 * Es schweigt bei jedem Fehler. Ein Hook, der scheitert, darf die Session nicht
 * aufhalten — Context-Usage ist eine Anzeige, keine Zusage.
 */
export function buildCodexUsageHookScript(opts: CodexUsageHookOpts): string {
  const dir = opts.statusLineDir ?? BRAND.statusLineDir
  return `#!/usr/bin/env node
// Auto-generiert von cipher-mux (codex-usage-hook.ts). Nicht editieren.
const fs = require('fs')
const path = require('path')

const CONTEXT_WINDOW = ${JSON.stringify(opts.contextWindowSize)}
const MODEL_ID = ${JSON.stringify(opts.modelId)}
const OUT_DIR = ${JSON.stringify(dir)}

function readStdin(cb) {
  let raw = ''
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', c => { raw += c })
  process.stdin.on('end', () => cb(raw))
  // Ein Hook, der auf stdin wartet, haelt die Session auf. Nach 5s wird
  // geschrieben, was da ist, und beendet.
  setTimeout(() => cb(raw), 5000).unref?.()
}

/** Letzter token_usage_record in der Rollout-JSONL. Die Datei waechst, also von hinten. */
function lastUsage(transcriptPath) {
  let text
  try { text = fs.readFileSync(transcriptPath, 'utf-8') } catch { return null }
  const lines = text.split('\\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line || line.indexOf('token_usage_record') === -1) continue
    try {
      const rec = JSON.parse(line)
      const usage = rec && rec.payload && rec.payload.usage
      if (usage && typeof usage.input_tokens === 'number') return usage
    } catch { /* halbe Zeile am Dateiende — weiter nach vorn */ }
  }
  return null
}

readStdin(raw => {
  let input = {}
  try { input = JSON.parse(raw) || {} } catch { /* ohne Input nur die Session-ID fehlt */ }

  const muxSessionId = process.env.CIPHER_MUX_SESSION_ID
  // Ohne diese Variable entstuende '<dir>/.json', und genau die Datei ueberspringt
  // der Monitor als namenlos. Dann lieber gar nicht schreiben.
  if (!muxSessionId) { process.stdout.write('{}'); return }

  const usage = input.transcript_path ? lastUsage(input.transcript_path) : null

  const out = {
    session_id: input.session_id || null,
    model: { id: input.model || MODEL_ID },
  }

  if (usage) {
    const input_tokens = usage.input_tokens || 0
    const cached = usage.cached_input_tokens || 0
    const output_tokens = usage.output_tokens || 0
    // Das Kontextfenster traegt, was beim naechsten Zug mitgeschickt wird:
    // der Prompt (gecachte Anteile eingeschlossen, sie zaehlen im Fenster mit)
    // plus die letzte Antwort.
    const used = input_tokens + output_tokens
    const pct = CONTEXT_WINDOW > 0 ? (used / CONTEXT_WINDOW) * 100 : 0
    out.context_window = {
      used_percentage: Math.min(100, Math.round(pct * 10) / 10),
      remaining_percentage: Math.max(0, Math.round((100 - pct) * 10) / 10),
      total_input_tokens: input_tokens,
      total_output_tokens: output_tokens,
      context_window_size: CONTEXT_WINDOW,
      current_usage: {
        input_tokens: input_tokens,
        cached_input_tokens: cached,
        output_tokens: output_tokens,
      },
    }
  }

  try {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(path.join(OUT_DIR, muxSessionId + '.json'), JSON.stringify(out), 'utf-8')
  } catch { /* Anzeige, keine Zusage */ }

  // Immer wohlgeformt und immer durchlassen. Ein Usage-Hook entscheidet nichts.
  process.stdout.write(JSON.stringify({ continue: true }))
})
`
}

/** Wo das Skript im Run-Verzeichnis liegt. */
export const CODEX_USAGE_HOOK_FILENAME = 'cipher-mux-codex-usage-hook.js'

/**
 * Schreibt das Skript ins Projekt und gibt seinen Pfad zurueck.
 *
 * Bewusst kein Schreiben der config.toml: die Hook-Registrierung sammelt der
 * Adapter, weil Rollengrenze und Usage in dieselbe Datei muessen und zwei
 * Schreiber auf derselben TOML sich gegenseitig ueberschreiben wuerden.
 */
export function writeCodexUsageHookScript(projectPath: string, opts: CodexUsageHookOpts): string {
  const scriptPath = path.join(projectPath, CODEX_USAGE_HOOK_FILENAME)
  fs.writeFileSync(scriptPath, buildCodexUsageHookScript(opts), { encoding: 'utf-8', mode: 0o755 })
  return scriptPath
}
