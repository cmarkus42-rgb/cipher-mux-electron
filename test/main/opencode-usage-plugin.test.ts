import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  buildOpenCodeUsagePlugin,
  writeOpenCodeUsagePlugin,
  OPENCODE_USAGE_PLUGIN_FILENAME,
} from '../../src/main/monitoring/opencode-usage-plugin'
import { StatusLineMonitor } from '../../src/main/monitoring/statusline-monitor'

/**
 * Das erzeugte Plugin wird hier **ausgefuehrt**, nicht nur nach Zeichenketten
 * abgesucht. Ein Modul, das die richtigen Woerter enthaelt und beim Laden
 * scheitert, ist genau der stille Fehlschlag, den die Abnahme zweimal gefunden
 * hat: opencode laedt kein CommonJS-Plugin und sagt es nur unter --print-logs.
 *
 * Die Ereignisform stammt aus einer Messung an opencode 1.18.34 vom 2026-10-01:
 * `{ event: { id, type, properties: { info: { role, sessionID, modelID,
 * tokens } } } }` — genau ein Schluessel oben, und `tokens.total` fehlt in der
 * ersten, noch leeren Fassung derselben Nachricht.
 */

interface UsageHooks {
  event: (raw: unknown) => Promise<void>
}

async function loadPlugin(dir: string, statusLineDir: string): Promise<UsageHooks> {
  const file = path.join(dir, OPENCODE_USAGE_PLUGIN_FILENAME)
  fs.writeFileSync(file, buildOpenCodeUsagePlugin({ contextWindowSize: 1000, statusLineDir }), 'utf-8')
  // Wie opencode selbst: dynamischer Import einer file://-URL.
  const mod = await import(`file://${file}`)
  assert.equal(typeof mod.default, 'function', 'Default-Export ist keine Funktion')
  return (await mod.default({})) as UsageHooks
}

function assistantEvent(tokens: unknown, sessionID = 'ses_abc'): unknown {
  return {
    event: {
      id: 'evt_1',
      type: 'message.updated',
      properties: {
        sessionID,
        info: { role: 'assistant', sessionID, modelID: 'ollama/qwen3', tokens },
      },
    },
  }
}

describe('opencode-Usage-Plugin — laedt und schreibt', () => {
  let dir: string
  let out: string
  const SESSION = '01MUXSESSION'

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-usage-'))
    out = path.join(dir, 'context')
    process.env.CIPHER_MUX_SESSION_ID = SESSION
  })
  after(() => {
    delete process.env.CIPHER_MUX_SESSION_ID
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('ist ein ESM-Modul mit Default-Export einer Funktion', async () => {
    const hooks = await loadPlugin(dir, out)
    assert.equal(typeof hooks.event, 'function')
  })

  it('schreibt <statusLineDir>/<muxSessionId>.json mit Zahlen und Session-ID', async () => {
    const hooks = await loadPlugin(dir, out)
    await hooks.event(assistantEvent({ total: 300, input: 280, output: 20, cache: { read: 5, write: 1 } }))

    const data = JSON.parse(fs.readFileSync(path.join(out, `${SESSION}.json`), 'utf-8'))
    assert.equal(data.session_id, 'ses_abc')
    assert.equal(data.model.id, 'ollama/qwen3')
    assert.equal(data.context_window.total_input_tokens, 280)
    assert.equal(data.context_window.total_output_tokens, 20)
    assert.equal(data.context_window.context_window_size, 1000)
    // (280 + 20) / 1000
    assert.equal(data.context_window.used_percentage, 30)
    assert.equal(data.context_window.remaining_percentage, 70)
    assert.equal(data.context_window.current_usage.cache_read_input_tokens, 5)
    assert.equal(data.context_window.current_usage.cache_creation_input_tokens, 1)
  })

  it('der StatusLineMonitor versteht die Datei ohne jede Aenderung', async () => {
    // Der Sinn der ganzen Form: ein weiterer Schreiber, kein zweiter Leser.
    const hooks = await loadPlugin(dir, out)
    await hooks.event(assistantEvent({ total: 500, input: 400, output: 100, cache: { read: 0, write: 0 } }))

    const monitor = new StatusLineMonitor(out)
    const seen: Array<{ id: string; pct: number }> = []
    monitor.on('usage-updated', (id: string, usage: { usedPercentage: number }) => {
      seen.push({ id, pct: usage.usedPercentage })
    })
    monitor.start()
    monitor.stop()

    assert.deepEqual(seen, [{ id: SESSION, pct: 50 }])
  })

  it('schreibt die Session-ID auch dann, wenn noch keine Zahlen da sind', async () => {
    // Keep Working braucht die opencode-Session-ID fuer `--session <id>`, und
    // eine frisch gestartete Session hat noch keine Tokenzahlen. Die ID
    // hinter `if (!tokens) return` zu verlieren war genau der Fehler, den der
    // Monitor bei Claude Code schon einmal hatte.
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-usage-fresh-'))
    const o = path.join(d, 'ctx')
    const hooks = await loadPlugin(d, o)
    // Erste Fassung: alles Null, kein `total`.
    await hooks.event(assistantEvent({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }))

    const data = JSON.parse(fs.readFileSync(path.join(o, `${SESSION}.json`), 'utf-8'))
    assert.equal(data.session_id, 'ses_abc')
    // Keine behauptete Messung: ohne `total` kein context_window.
    assert.ok(!('context_window' in data), 'context_window ohne Messung geschrieben')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('schreibt nichts ohne CIPHER_MUX_SESSION_ID', async () => {
    // Sonst entstuende '<dir>/.json', und genau die Datei ueberspringt der
    // Monitor als namenlos.
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-usage-noenv-'))
    const o = path.join(d, 'ctx')
    const hooks = await loadPlugin(d, o)
    delete process.env.CIPHER_MUX_SESSION_ID
    await hooks.event(assistantEvent({ total: 10, input: 10, output: 0, cache: {} }))
    process.env.CIPHER_MUX_SESSION_ID = SESSION
    assert.ok(!fs.existsSync(o), 'Verzeichnis trotz fehlender Session-ID angelegt')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('geht an allem vorbei, was keine fertige Assistentennachricht ist', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-usage-skip-'))
    const o = path.join(d, 'ctx')
    const hooks = await loadPlugin(d, o)
    for (const raw of [
      {},
      { event: { type: 'session.created', properties: {} } },
      { event: { type: 'message.updated', properties: {} } },
      // Nutzernachricht: traegt kein Kontextmass.
      {
        event: {
          type: 'message.updated',
          properties: { info: { role: 'user', sessionID: 'ses_x', tokens: { total: 9 } } },
        },
      },
    ]) {
      await hooks.event(raw)
    }
    assert.ok(!fs.existsSync(o))
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('wirft nicht, wenn das Zielverzeichnis nicht beschreibbar ist', async () => {
    // Context-Usage ist eine Anzeige, keine Zusage — und ein Wurf im
    // event-Hook laeuft durch Plugin.trigger wie jeder andere Hook.
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-usage-ro-'))
    const blocker = path.join(d, 'ctx')
    fs.writeFileSync(blocker, 'ich bin eine Datei, kein Verzeichnis', 'utf-8')
    const hooks = await loadPlugin(d, blocker)
    await hooks.event(assistantEvent({ total: 10, input: 10, output: 0, cache: {} }))
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('writeOpenCodeUsagePlugin', () => {
  it('legt das Plugin-Verzeichnis an, wenn es fehlt', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-usage-mkdir-'))
    const target = path.join(d, '.opencode', 'plugin')
    const written = writeOpenCodeUsagePlugin(target, { contextWindowSize: 1 })
    assert.equal(written, path.join(target, OPENCODE_USAGE_PLUGIN_FILENAME))
    assert.ok(fs.existsSync(written))
    fs.rmSync(d, { recursive: true, force: true })
  })
})
