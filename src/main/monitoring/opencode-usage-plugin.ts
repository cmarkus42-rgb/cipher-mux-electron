import * as fs from 'fs'
import * as path from 'path'
import { BRAND } from '../../shared/brand'

/**
 * Context-Usage fuer opencode-Sessions — derselbe Briefkasten, dritter Zusteller.
 *
 * Claude Code hat eine `statusLine`, Codex einen `PostToolUse`-Hook auf der
 * Rollout-JSONL (`codex-usage-hook.ts`). opencode hat beides nicht. Was es hat
 * (gemessen an 1.18.34 am 2026-10-01):
 *
 *  - Ein Plugin kann `event` registrieren und sieht damit **jedes**
 *    Bus-Ereignis. Die Eingabe hat genau einen Schluessel: `{ event: { id, type,
 *    properties } }` — nachgemessen, nicht angenommen.
 *  - Bei `type: "message.updated"` traegt `properties.info` fuer eine
 *    Assistentennachricht `sessionID`, `modelID` und `tokens` mit
 *    `{ total, input, output, reasoning, cache: { read, write } }`.
 *  - Die **erste** Fassung derselben Nachricht kommt mit `tokens` ganz auf Null
 *    und **ohne** `total`. Die fertige Fassung hat `total`. Das ist der
 *    Unterschied, an dem sich „noch nichts gemessen" von „gemessen" trennen
 *    laesst — und deshalb schreibt dieses Plugin `context_window` nur, wenn
 *    `total` eine Zahl ist. Sonst stuende 0 % in der Anzeige, wo nichts steht.
 *
 * Daraus entsteht dasselbe JSON, das der `StatusLineMonitor` schon liest. Wie
 * bei Codex also **kein zweiter Leser**, nur ein weiterer Schreiber.
 *
 * Das `session_id`-Feld ist nicht Beiwerk: der Monitor zieht es unabhaengig von
 * den Zahlen heraus und meldet es als `claude-session-id`. Daran haengt Keep
 * Working, weil ein Restore `opencode --session <id>` braucht und nicht
 * `--continue` auf „die letzte Unterhaltung dieses Verzeichnisses".
 *
 * **Was hier geschaetzt ist und als Schaetzung gekennzeichnet bleibt:** die
 * Groesse des Kontextfensters. Die Tokenzahlen sind gemessen, die Grenze ist es
 * nicht — `GET /api/model` eines laufenden opencode liefert ohne angemeldeten
 * Anbieter eine **leere** Liste, und der Modellkatalog kennt einen selbst
 * eingetragenen Anbieter (etwa ein lokales Ollama) ohnehin nicht. Es gibt damit
 * keinen gepruefften Weg, die echte Grenze pro Modell zu erfahren. Die
 * Prozentzahl ist deshalb eine Schaetzung gegen eine Rueckfalloption — dieselbe
 * Entscheidung wie `CODEX_FALLBACK_CONTEXT_WINDOW`, aus demselben Grund: eine
 * grobe Anzeige ist brauchbarer als keine, solange sie als grob benannt ist.
 */

/** Was das erzeugte Plugin ueber die Session wissen muss. */
export interface OpenCodeUsagePluginOpts {
  /** Groesse des Kontextfensters in Tokens. Rueckfalloption, keine Messung. */
  contextWindowSize: number
  /** Zielverzeichnis fuer die JSON-Dateien. Nur fuer Tests abweichend. */
  statusLineDir?: string
}

/** Wo das Plugin im Plugin-Verzeichnis liegt. */
export const OPENCODE_USAGE_PLUGIN_FILENAME = 'cipher-mux-usage.js'

/**
 * Baut das abhaengigkeitsfreie Plugin-Modul.
 *
 * ESM mit Default-Export einer **Funktion**: ein CommonJS-Modul weist opencode
 * mit „Plugin export is not a function" ab, und diese Zeile steht nur unter
 * `--print-logs`. Ein Plugin, das nicht laedt, ist genau die Art stiller
 * Fehlschlag, um die der ganze Abschnitt herum gebaut ist.
 *
 * Es schweigt bei jedem Fehler. Context-Usage ist eine Anzeige, keine Zusage —
 * und ein Wurf in einem `event`-Hook laeuft durch `Plugin.trigger`, das jeden
 * Hook gleich behandelt.
 */
export function buildOpenCodeUsagePlugin(opts: OpenCodeUsagePluginOpts): string {
  const dir = opts.statusLineDir ?? BRAND.statusLineDir
  return `// Auto-generiert von cipher-mux (opencode-usage-plugin.ts). Nicht editieren.
import * as fs from 'node:fs'
import * as path from 'node:path'

const CONTEXT_WINDOW = ${JSON.stringify(opts.contextWindowSize)}
const OUT_DIR = ${JSON.stringify(dir)}

export default async () => ({
  event: async (raw) => {
    try {
      // Genau ein Schluessel, gemessen: { event: { id, type, properties } }.
      const ev = raw && raw.event
      if (!ev || ev.type !== 'message.updated') return

      const info = ev.properties && ev.properties.info
      if (!info || info.role !== 'assistant') return

      // Ohne diese Variable entstuende '<dir>/.json', und genau die Datei
      // ueberspringt der Monitor als namenlos. Dann lieber gar nicht schreiben.
      const muxSessionId = process.env.CIPHER_MUX_SESSION_ID
      if (!muxSessionId) return

      const out = {
        session_id: info.sessionID || null,
        model: { id: info.modelID || (info.model && info.model.modelID) || '' },
      }

      const t = info.tokens
      // \`total\` fehlt in der ersten, noch leeren Fassung derselben Nachricht.
      // Sie als 0 % zu schreiben hiesse, eine Messung zu behaupten.
      if (t && typeof t.total === 'number') {
        const input = t.input || 0
        const output = t.output || 0
        const cache = t.cache || {}
        // Was beim naechsten Zug mitgeschickt wird: der Prompt (gecachte
        // Anteile eingeschlossen, sie zaehlen im Fenster mit) plus die letzte
        // Antwort.
        const used = input + output
        const pct = CONTEXT_WINDOW > 0 ? (used / CONTEXT_WINDOW) * 100 : 0
        out.context_window = {
          used_percentage: Math.min(100, Math.round(pct * 10) / 10),
          remaining_percentage: Math.max(0, Math.round((100 - pct) * 10) / 10),
          total_input_tokens: input,
          total_output_tokens: output,
          context_window_size: CONTEXT_WINDOW,
          current_usage: {
            input_tokens: input,
            output_tokens: output,
            cache_read_input_tokens: cache.read || 0,
            cache_creation_input_tokens: cache.write || 0,
          },
        }
      }

      fs.mkdirSync(OUT_DIR, { recursive: true })
      fs.writeFileSync(path.join(OUT_DIR, muxSessionId + '.json'), JSON.stringify(out), 'utf-8')
    } catch {
      // Anzeige, keine Zusage.
    }
  },
})
`
}

/**
 * Schreibt das Plugin in das uebergebene Plugin-Verzeichnis und gibt den Pfad
 * zurueck.
 *
 * `pluginDir` und nicht `projectPath`: wo opencode seine Plugins sucht, weiss
 * der Adapter, nicht die Ueberwachung. Das Verzeichnis wird angelegt, falls es
 * fehlt — bei einer frisch erzeugten Entity gibt es es noch nicht.
 */
export function writeOpenCodeUsagePlugin(
  pluginDir: string,
  opts: OpenCodeUsagePluginOpts,
): string {
  fs.mkdirSync(pluginDir, { recursive: true })
  const pluginPath = path.join(pluginDir, OPENCODE_USAGE_PLUGIN_FILENAME)
  fs.writeFileSync(pluginPath, buildOpenCodeUsagePlugin(opts), { encoding: 'utf-8', mode: 0o644 })
  return pluginPath
}
