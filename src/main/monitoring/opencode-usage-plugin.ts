import * as fs from 'fs'
import * as path from 'path'
import { BRAND } from '../../shared/brand'

/**
 * Context-Usage fuer opencode-Sessions — derselbe Briefkasten, dritter Zusteller.
 *
 * Claude Code hat eine `statusLine`, Codex einen `PostToolUse`-Hook auf der
 * Rollout-JSONL (`codex-usage-hook.ts`). opencode hat beides nicht. Was es hat
 * (gemessen an **2.0.29 am 2026-10-14**, Spec 2026-10-14-opencode-2-anpassung §2):
 *
 *  - Ein Plugin ist ein Objekt `{ id, setup(ctx) }`, und `ctx.event.subscribe()`
 *    liefert den Strom der Ereignisse. (opencode 1.x: eine Funktion mit
 *    `event`-Hook; ein solches Plugin weist 2.x mit einer WARN-Zeile ab.)
 *  - `session.step.started` traegt als EINZIGES das Modell
 *    (`data.model = { id, providerID }`) und die `assistantMessageID`.
 *  - `session.step.ended` traegt `data.tokens = { input, output, reasoning,
 *    cache: { read, write } }` — **pro Schritt**, ohne `total`, und `input` ist
 *    der Teil OHNE den gecachten Anteil (1.x: einschliesslich). Gemessen an
 *    fuenf Schritten eines Laufs: `cache.read` 1536 → 8192 → 8448 → 8704 → 8960.
 *  - `session.usage.updated` ist **kumulativ** ueber die Session und kommt auch
 *    mitten im Schritt. Als Kontextgroesse unbrauchbar und deshalb hier
 *    absichtlich nicht ausgewertet.
 *
 * Daraus entsteht dasselbe JSON, das der `StatusLineMonitor` schon liest. Wie
 * bei Codex also **kein zweiter Leser**, nur ein weiterer Schreiber.
 *
 * **Was „gemessen" heisst:** ein `step.ended` mit Zahlen in `tokens`. Das alte
 * Kriterium (`tokens.total` ist eine Zahl) gibt es nicht mehr. Ohne ein solches
 * Ereignis schreibt das Plugin `context_window` NICHT — sonst stuende 0 % in der
 * Anzeige, wo nichts steht.
 *
 * Das `session_id`-Feld ist nicht Beiwerk: der Monitor zieht es unabhaengig von
 * den Zahlen heraus und meldet es als `claude-session-id`. Daran haengt Keep
 * Working, weil ein Restore `opencode --session <id>` braucht und nicht
 * `--continue` auf „die letzte Unterhaltung dieses Verzeichnisses". Deshalb
 * schreibt schon `step.started` die Datei, noch vor der ersten Messung.
 *
 * **Warum die Mux-Session-ID aus der Umgebung kommt, und warum das nur unter
 * `--standalone` traegt.** Ein V2-Plugin laeuft im opencode-Server, nicht in der
 * TUI. Im geteilten Hintergrunddienst ist `process.env.CIPHER_MUX_SESSION_ID`
 * die ID der Session, die den Dienst gestartet hat — gemessen: zwei Laeufe mit je
 * eigener Variable bekamen beide die ID von „projekt-a". Jede opencode-Mux-Session
 * haette in die Datei einer fremden Session geschrieben, ohne Fehlermeldung.
 * Der Adapter startet deshalb mit `--standalone` (privater Server als Kind der
 * CLI, Umgebung geerbt — gemessen korrekt). Siehe `adapters/opencode.ts`.
 *
 * **Was geschaetzt ist und als Schaetzung gekennzeichnet bleibt:** die Groesse
 * des Kontextfensters, wenn sie sich nicht erfragen laesst. Mit
 * `lookupModelLimit` fragt das Plugin `ctx.model.list()` (gemessen: `{ location,
 * data: [{ providerID, id, limit: { context } }] }`, 414 Eintraege) nach dem
 * Modell des Schritts. Ein selbst eingetragener Anbieter oder ein Katalog ohne
 * Zahl faellt auf den eingebackenen Wert zurueck — dieselbe Entscheidung wie
 * `CODEX_FALLBACK_CONTEXT_WINDOW`: eine grobe Anzeige ist brauchbarer als keine,
 * solange sie als grob benannt ist. Der Profilwert des lokalen Workers behaelt
 * Vorrang (dort ist die Groesse bekannt, `lookupModelLimit` aus).
 */

/** Was das erzeugte Plugin ueber die Session wissen muss. */
export interface OpenCodeUsagePluginOpts {
  /** Groesse des Kontextfensters in Tokens. Rueckfalloption bzw. bekannter Profilwert, keine Messung. */
  contextWindowSize: number
  /**
   * Das Fenster pro Modell aus `ctx.model.list()` lesen. Aus, wenn die Groesse
   * schon bekannt ist (Profil des lokalen Workers).
   */
  lookupModelLimit?: boolean
  /** Zielverzeichnis fuer die JSON-Dateien. Nur fuer Tests abweichend. */
  statusLineDir?: string
}

/** Wo das Plugin im Plugin-Verzeichnis liegt. */
export const OPENCODE_USAGE_PLUGIN_FILENAME = 'cipher-mux-usage.js'

/** Stabile Plugin-id. opencode 2 haengt Speicher und Diagnose daran. */
export const OPENCODE_USAGE_PLUGIN_ID = 'cipher-mux.usage'

/**
 * Baut das abhaengigkeitsfreie Plugin-Modul.
 *
 * ESM mit Default-Export eines **Objekts** `{ id, setup }`: ein V1-Plugin (eine
 * Funktion) weist opencode 2 mit „Plugin must export a default definition with an
 * id and an effect or setup function" ab, und diese Zeile steht nur im WARN-Log.
 * Ein Plugin, das nicht laedt, ist genau die Art stiller Fehlschlag, um die der
 * ganze Abschnitt herum gebaut ist. Ein reines Objekt laedt ohne Import des
 * Plugin-Pakets (gemessen) — die Datei bleibt abhaengigkeitsfrei.
 *
 * Es schweigt bei jedem Fehler, und zwar **pro Ereignis**: Context-Usage ist eine
 * Anzeige, keine Zusage, und ein Wurf aus der Abo-Schleife wuerde jede weitere
 * Messung beenden.
 */
export function buildOpenCodeUsagePlugin(opts: OpenCodeUsagePluginOpts): string {
  const dir = opts.statusLineDir ?? BRAND.statusLineDir
  return `// Auto-generiert von cipher-mux (opencode-usage-plugin.ts). Nicht editieren.
// opencode 2: Default-Export ist eine Plugin-DEFINITION ({ id, setup }).
import * as fs from 'node:fs'
import * as path from 'node:path'

const CONTEXT_WINDOW = ${JSON.stringify(opts.contextWindowSize)}
const LOOKUP_MODEL_LIMIT = ${JSON.stringify(opts.lookupModelLimit === true)}
const OUT_DIR = ${JSON.stringify(dir)}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

export default {
  id: ${JSON.stringify(OPENCODE_USAGE_PLUGIN_ID)},
  async setup(ctx) {
    const controller = new AbortController()
    // assistantMessageID -> Modell. Nur step.started kennt das Modell.
    const stepModels = new Map()
    // sessionID -> was in die Datei kommt (Session-ID, Modell, letzte Messung).
    const states = new Map()
    let limits = null

    const stateOf = (sessionID) => {
      let st = states.get(sessionID)
      if (!st) { st = { sessionID, model: null, context_window: null }; states.set(sessionID, st) }
      return st
    }

    // Fenster des Modells aus dem Katalog; sonst der eingebackene Wert.
    async function windowFor(model) {
      if (!LOOKUP_MODEL_LIMIT || !model || !model.id) return CONTEXT_WINDOW
      try {
        if (!limits) {
          const res = await ctx.model.list()
          const list = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : [])
          const map = new Map()
          for (const m of list) {
            const size = m && m.limit && m.limit.context
            if (isNum(size) && size > 0) map.set(m.providerID + '/' + (m.modelID || m.id), size)
          }
          // Ein leerer Katalog (Anbieter noch nicht bereit) wird nicht gemerkt.
          if (map.size > 0) limits = map
        }
        const size = limits && limits.get(model.providerID + '/' + model.id)
        return isNum(size) ? size : CONTEXT_WINDOW
      } catch {
        return CONTEXT_WINDOW
      }
    }

    function write(st) {
      // Ohne diese Variable entstuende '<dir>/.json', und genau die Datei
      // ueberspringt der Monitor als namenlos. Dann lieber gar nicht schreiben.
      const muxSessionId = process.env.CIPHER_MUX_SESSION_ID
      if (!muxSessionId) return
      const out = { session_id: st.sessionID, model: { id: (st.model && st.model.id) || '' } }
      if (st.context_window) out.context_window = st.context_window
      fs.mkdirSync(OUT_DIR, { recursive: true })
      fs.writeFileSync(path.join(OUT_DIR, muxSessionId + '.json'), JSON.stringify(out), 'utf-8')
    }

    async function handle(ev) {
      if (!ev || typeof ev.type !== 'string') return
      const d = ev.data
      if (!d || typeof d !== 'object' || typeof d.sessionID !== 'string') return

      if (ev.type === 'session.step.started') {
        const m = d.model && typeof d.model === 'object' ? d.model : null
        const model = { id: m && typeof m.id === 'string' ? m.id : '', providerID: m ? m.providerID : undefined }
        if (typeof d.assistantMessageID === 'string') stepModels.set(d.assistantMessageID, model)
        const st = stateOf(d.sessionID)
        st.model = model
        // Die ID gehoert in die Datei, noch bevor es eine Messung gibt (Keep Working).
        write(st)
        return
      }

      if (ev.type === 'session.step.ended') {
        const st = stateOf(d.sessionID)
        const model = (typeof d.assistantMessageID === 'string' && stepModels.get(d.assistantMessageID)) || st.model
        if (typeof d.assistantMessageID === 'string') stepModels.delete(d.assistantMessageID)
        if (model) st.model = model

        const t = d.tokens
        // 'step.ended' mit Zahlen ist die Messung. Ohne sie wird keine behauptet.
        if (t && isNum(t.input) && isNum(t.output)) {
          const cache = t.cache && typeof t.cache === 'object' ? t.cache : {}
          const read = isNum(cache.read) ? cache.read : 0
          const cacheWrite = isNum(cache.write) ? cache.write : 0
          // 'input' ist hier OHNE den gecachten Anteil. Was beim naechsten Zug
          // mitgeschickt wird: der ganze Prompt (Cache zaehlt im Fenster mit)
          // plus die letzte Antwort.
          const prompt = t.input + read + cacheWrite
          const used = prompt + t.output
          const size = await windowFor(model)
          const pct = size > 0 ? (used / size) * 100 : 0
          st.context_window = {
            used_percentage: Math.min(100, Math.round(pct * 10) / 10),
            remaining_percentage: Math.max(0, Math.round((100 - pct) * 10) / 10),
            total_input_tokens: prompt,
            total_output_tokens: t.output,
            context_window_size: size,
            current_usage: {
              input_tokens: t.input,
              output_tokens: t.output,
              cache_read_input_tokens: read,
              cache_creation_input_tokens: cacheWrite,
            },
          }
        }
        write(st)
      }
      // 'session.usage.updated' ist kumulativ und absichtlich nicht ausgewertet.
    }

    void (async () => {
      try {
        for await (const ev of ctx.event.subscribe({ signal: controller.signal })) {
          try { await handle(ev) } catch { /* Anzeige, keine Zusage. */ }
        }
      } catch { /* Strom beendet oder abgebrochen. */ }
    })()

    return () => controller.abort()
  },
}
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
