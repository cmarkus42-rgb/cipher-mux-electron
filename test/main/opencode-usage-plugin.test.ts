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
 * Das erzeugte Plugin wird hier **geladen und mit einem Fake-`ctx` ausgefuehrt**,
 * nicht nach Zeichenketten abgesucht. opencode 2.0.29 weist ein V1-Plugin ab und
 * sagt es nur im WARN-Log — ein Modul mit den richtigen Woertern, das nicht
 * laedt, ist der stille Fehlschlag, den diese Datei verhindern soll.
 *
 * Die Ereignisform stammt aus einer Messung an opencode 2.0.29 vom 2026-10-14
 * (`ctx.event.subscribe()`):
 *
 *  - `session.step.started`: `data { sessionID, assistantMessageID, agent,
 *    model: { id, providerID, variant } }` — der EINZIGE Ort mit dem Modell.
 *  - `session.step.ended`: `data { sessionID, assistantMessageID, finish, cost,
 *    tokens: { input, output, reasoning, cache: { read, write } } }` — pro
 *    Schritt, ohne `total`, `input` OHNE den gecachten Anteil.
 *  - `session.usage.updated`: `data { sessionID, cost, tokens }` — KUMULATIV ueber
 *    die Session, also keine Kontextgroesse.
 */

type RawEvent = Record<string, unknown>

/** Ein `ctx`, dem Ereignisse von aussen zugestellt werden — und der meldet, wann das Plugin fertig ist. */
function fakeCtx(models: unknown[] | 'throw' = []) {
  const queue: Array<{ ev: RawEvent; done: () => void }> = []
  let waiter: ((item: { ev: RawEvent; done: () => void } | null) => void) | null = null
  let lastDone: (() => void) | null = null
  let closed = false

  const ctx = {
    location: { directory: '/p', project: { id: 'x', directory: '/p', canonical: '/p' } },
    event: {
      subscribe(opts?: { signal?: AbortSignal }) {
        opts?.signal?.addEventListener('abort', () => {
          closed = true
          waiter?.(null)
        })
        return {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                // Das Plugin fragt das naechste Ereignis an: das vorige ist durch.
                lastDone?.()
                lastDone = null
                if (closed) return { value: undefined, done: true as const }
                const item = await new Promise<{ ev: RawEvent; done: () => void } | null>(res => {
                  const q = queue.shift()
                  if (q) res(q)
                  else waiter = res
                })
                if (!item) return { value: undefined, done: true as const }
                lastDone = item.done
                return { value: item.ev, done: false as const }
              },
              async return() {
                return { value: undefined, done: true as const }
              },
            }
          },
        }
      },
    },
    model: {
      async list() {
        if (models === 'throw') throw new Error('model.list kaputt')
        return { location: { directory: '/p' }, data: models }
      },
    },
  }

  /** Stellt ein Ereignis zu und wartet, bis das Plugin es verarbeitet hat. */
  function deliver(ev: RawEvent): Promise<void> {
    return new Promise<void>(done => {
      const item = { ev, done }
      if (waiter) {
        const w = waiter
        waiter = null
        w(item)
      } else {
        queue.push(item)
      }
    })
  }

  return { ctx, deliver }
}

const stepStarted = (sessionID: string, assistantMessageID: string, modelId = 'qwen3', providerID = 'ollama'): RawEvent => ({
  id: 'evt_s', created: 1, type: 'session.step.started',
  data: { sessionID, assistantMessageID, agent: 'build', model: { id: modelId, providerID, variant: 'default' }, started: 1 },
})

const stepEnded = (
  sessionID: string,
  assistantMessageID: string,
  tokens: unknown,
): RawEvent => ({
  id: 'evt_e', created: 2, type: 'session.step.ended',
  data: { sessionID, assistantMessageID, finish: 'stop', rawFinish: 'stop', cost: 0, tokens },
})

const tok = (input: number, output: number, read = 0, write = 0, reasoning = 0) => ({
  input, output, reasoning, cache: { read, write },
})

describe('opencode-Usage-Plugin (opencode 2) — laedt und schreibt', () => {
  let dir: string
  let out: string
  const SESSION = '01MUXSESSION'
  let seq = 0

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-usage-'))
    out = path.join(dir, 'context')
    process.env.CIPHER_MUX_SESSION_ID = SESSION
  })
  after(() => {
    delete process.env.CIPHER_MUX_SESSION_ID
    fs.rmSync(dir, { recursive: true, force: true })
  })

  /** Laedt das Plugin wie opencode (file://-Import) und fuehrt `setup` mit dem Fake-ctx aus. */
  async function start(
    opts: { contextWindowSize?: number; lookupModelLimit?: boolean; statusLineDir?: string } = {},
    models: unknown[] | 'throw' = [],
  ) {
    const file = path.join(dir, `u${seq++}-${OPENCODE_USAGE_PLUGIN_FILENAME}`)
    fs.writeFileSync(
      file,
      buildOpenCodeUsagePlugin({ contextWindowSize: 1000, statusLineDir: out, ...opts }),
      'utf-8',
    )
    const mod = await import(`file://${file}`)
    assert.equal(typeof mod.default, 'object', 'Default-Export ist keine Plugin-Definition')
    assert.equal(typeof mod.default.setup, 'function', 'Definition ohne setup()')
    const { ctx, deliver } = fakeCtx(models)
    const cleanup = await mod.default.setup(ctx)
    return { def: mod.default, cleanup, deliver }
  }

  const read = (): Record<string, any> =>
    JSON.parse(fs.readFileSync(path.join(out, `${SESSION}.json`), 'utf-8'))

  const reset = () => fs.rmSync(out, { recursive: true, force: true })

  it('ist eine V2-Definition mit stabiler id und liefert eine Aufraeumfunktion', async () => {
    const { def, cleanup } = await start()
    assert.equal(def.id, 'cipher-mux.usage')
    assert.equal(typeof cleanup, 'function', 'setup() liefert kein Cleanup — der Abo-Strom bliebe offen')
    cleanup()
  })

  it('ist ESM ohne Abhaengigkeit — kein CommonJS, kein Plugin-Paket', () => {
    const src = buildOpenCodeUsagePlugin({ contextWindowSize: 1, statusLineDir: out })
    assert.ok(src.includes('export default'))
    assert.ok(!src.includes('module.exports') && !src.includes('require('))
    assert.ok(!src.includes('@opencode/plugin') && !src.includes('@opencode-ai/plugin'))
  })

  it('schreibt aus step.started + step.ended: Session-ID, Modell, Zahlen', async () => {
    reset()
    const { deliver, cleanup } = await start({ contextWindowSize: 100_000 })
    await deliver(stepStarted('ses_abc', 'msg_1', 'qwen3', 'ollama'))
    // Gemessene Form eines spaeten Schritts: input OHNE Cache, Cache separat.
    await deliver(stepEnded('ses_abc', 'msg_1', tok(383, 93, 8192, 0, 9)))
    cleanup()

    const data = read()
    assert.equal(data.session_id, 'ses_abc')
    assert.equal(data.model.id, 'qwen3')
    const cw = data.context_window
    // Prompt = input + cache.read + cache.write; erzeugt = output + reasoning.
    assert.equal(cw.total_input_tokens, 383 + 8192)
    assert.equal(cw.total_output_tokens, 93 + 9)
    assert.equal(cw.context_window_size, 100_000)
    assert.equal(cw.used_percentage, 8.7) // (383 + 8192 + 93 + 9) / 100000 = 8.677 -> 8.7
    assert.equal(cw.remaining_percentage, 91.3)
    assert.equal(cw.current_usage.input_tokens, 383)
    assert.equal(cw.current_usage.output_tokens, 93 + 9)
    assert.equal(cw.current_usage.cache_read_input_tokens, 8192)
    assert.equal(cw.current_usage.cache_creation_input_tokens, 0)
  })

  it('zaehlt Reasoning mit — so wie die TUI von opencode selbst', async () => {
    // Gemessen in der TUI (2.0.29): letzter Schritt { input 3282, output 223,
    // reasoning 353, cache.read 9728 } — die TUI zeigt „13.6K" (6,8 % von 200000).
    // 3282 + 9728 + 223 = 13233 haette „13.2K" ergeben; erst mit dem Reasoning stimmt
    // die Mux-Anzeige mit der, die der Nutzer im Pane sieht.
    reset()
    const { deliver, cleanup } = await start({ contextWindowSize: 200_000 })
    await deliver(stepStarted('ses_abc', 'msg_1'))
    await deliver(stepEnded('ses_abc', 'msg_1', tok(3282, 223, 9728, 0, 353)))
    cleanup()
    const cw = read().context_window
    assert.equal(cw.used_percentage, 6.8)
    assert.equal(cw.current_usage.input_tokens + cw.current_usage.output_tokens
      + cw.current_usage.cache_read_input_tokens + cw.current_usage.cache_creation_input_tokens, 13_586)
  })

  it('ohne reasoning-Feld (aeltere Form) bleibt alles wie vorher', async () => {
    reset()
    const { deliver, cleanup } = await start({ contextWindowSize: 1000 })
    await deliver(stepStarted('ses_abc', 'msg_1'))
    await deliver(stepEnded('ses_abc', 'msg_1', { input: 100, output: 50, cache: { read: 200, write: 0 } }))
    cleanup()
    assert.equal(read().context_window.used_percentage, 35)
  })

  it('der StatusLineMonitor versteht die Datei ohne jede Aenderung', async () => {
    // Der Sinn der ganzen Form: ein weiterer Schreiber, kein zweiter Leser.
    reset()
    const { deliver, cleanup } = await start({ contextWindowSize: 1000 })
    await deliver(stepStarted('ses_abc', 'msg_1'))
    await deliver(stepEnded('ses_abc', 'msg_1', tok(300, 100, 100, 0)))
    cleanup()

    const monitor = new StatusLineMonitor(out)
    const seen: Array<{ id: string; pct: number }> = []
    monitor.on('usage-updated', (id: string, usage: { usedPercentage: number }) => {
      seen.push({ id, pct: usage.usedPercentage })
    })
    monitor.start()
    monitor.stop()

    assert.deepEqual(seen, [{ id: SESSION, pct: 50 }])
  })

  it('schreibt Session-ID und Modell schon bei step.started — ohne Messung', async () => {
    // Keep Working braucht die opencode-Session-ID fuer `--session <id>`, und
    // eine frisch gestartete Session hat noch kein step.ended.
    reset()
    const { deliver, cleanup } = await start()
    await deliver(stepStarted('ses_fresh', 'msg_1', 'm', 'p'))
    cleanup()

    const data = read()
    assert.equal(data.session_id, 'ses_fresh')
    assert.equal(data.model.id, 'm')
    assert.ok(!('context_window' in data), 'context_window ohne Messung geschrieben')
  })

  it('die Datei traegt immer die LETZTE Messung, und ein neuer Schritt loescht sie nicht', async () => {
    reset()
    const { deliver, cleanup } = await start({ contextWindowSize: 1000 })
    await deliver(stepStarted('ses_abc', 'msg_1'))
    await deliver(stepEnded('ses_abc', 'msg_1', tok(100, 0, 0)))
    assert.equal(read().context_window.used_percentage, 10)

    // Neuer Schritt beginnt: die letzte Messung steht weiter da, nicht 0 %.
    await deliver(stepStarted('ses_abc', 'msg_2'))
    assert.equal(read().context_window.used_percentage, 10)

    await deliver(stepEnded('ses_abc', 'msg_2', tok(40, 10, 200)))
    cleanup()
    assert.equal(read().context_window.used_percentage, 25) // (40 + 200 + 10) / 1000
  })

  it('usage.updated allein schreibt NICHTS — es ist kumulativ, keine Kontextgroesse', async () => {
    reset()
    const { deliver, cleanup } = await start()
    await deliver({
      id: 'evt_u', created: 3, type: 'session.usage.updated',
      data: { sessionID: 'ses_abc', cost: 0, tokens: tok(8221, 765, 36352) },
    })
    cleanup()
    assert.ok(!fs.existsSync(out), 'usage.updated hat eine Kontextanzeige erzeugt')
  })

  it('behauptet keine Messung, wenn tokens fehlen oder keine Zahlen sind', async () => {
    reset()
    const { deliver, cleanup } = await start()
    await deliver(stepStarted('ses_abc', 'msg_1'))
    await deliver(stepEnded('ses_abc', 'msg_1', undefined))
    await deliver(stepEnded('ses_abc', 'msg_1', { input: 'viel', output: null, cache: {} }))
    cleanup()
    assert.ok(!('context_window' in read()))
  })

  it('step.ended ohne vorheriges step.started: Zahlen ja, Modell leer', async () => {
    // Das Plugin kann mitten in einer laufenden Session geladen werden.
    reset()
    const { deliver, cleanup } = await start({ contextWindowSize: 1000 })
    await deliver(stepEnded('ses_mid', 'msg_x', tok(100, 0, 0)))
    cleanup()
    const data = read()
    assert.equal(data.session_id, 'ses_mid')
    assert.equal(data.model.id, '')
    assert.equal(data.context_window.used_percentage, 10)
  })

  it('schreibt nichts ohne CIPHER_MUX_SESSION_ID', async () => {
    // Sonst entstuende '<dir>/.json', und genau die Datei ueberspringt der
    // Monitor als namenlos.
    reset()
    const { deliver, cleanup } = await start()
    delete process.env.CIPHER_MUX_SESSION_ID
    await deliver(stepStarted('ses_abc', 'msg_1'))
    await deliver(stepEnded('ses_abc', 'msg_1', tok(10, 0, 0)))
    process.env.CIPHER_MUX_SESSION_ID = SESSION
    cleanup()
    assert.ok(!fs.existsSync(out), 'Verzeichnis trotz fehlender Session-ID angelegt')
  })

  it('geht an allem vorbei, was kein Schritt ist — auch an Muell', async () => {
    reset()
    const { deliver, cleanup } = await start()
    for (const ev of [
      {},
      { type: 'session.text.delta', data: { sessionID: 'ses_abc', delta: 'x' } },
      { type: 'session.step.ended' },
      { type: 'session.step.ended', data: null },
      { type: 'session.step.started', data: { assistantMessageID: 'msg_1' } },
      { type: 42 },
    ]) {
      await deliver(ev as RawEvent)
    }
    cleanup()
    assert.ok(!fs.existsSync(out))
  })

  it('wirft nicht, wenn das Zielverzeichnis nicht beschreibbar ist', async () => {
    // Context-Usage ist eine Anzeige, keine Zusage. Ein Wurf wuerde die
    // Abo-Schleife beenden — und damit jede weitere Messung.
    const blocker = path.join(dir, 'ist-eine-datei')
    fs.writeFileSync(blocker, 'ich bin eine Datei, kein Verzeichnis', 'utf-8')
    const { deliver, cleanup } = await start({ statusLineDir: blocker })
    await deliver(stepStarted('ses_abc', 'msg_1'))
    await deliver(stepEnded('ses_abc', 'msg_1', tok(10, 0, 0)))
    cleanup()
  })

  it('die Abo-Schleife ueberlebt ein kaputtes Ereignis und verarbeitet das naechste', async () => {
    reset()
    const { deliver, cleanup } = await start({ contextWindowSize: 1000 })
    await deliver({ type: 'session.step.started', data: 'kaputt' })
    await deliver(stepStarted('ses_abc', 'msg_1'))
    await deliver(stepEnded('ses_abc', 'msg_1', tok(100, 0, 0)))
    cleanup()
    assert.equal(read().context_window.used_percentage, 10)
  })

  describe('Kontextfenster', () => {
    const catalog = [
      { providerID: 'opencode', id: 'big-pickle', modelID: 'big-pickle', limit: { context: 200_000, output: 32_000 } },
      { providerID: 'ollama', id: 'qwen3', modelID: 'qwen3', limit: { context: 50_000 } },
    ]

    it('nimmt limit.context des Modells der Session, wenn lookupModelLimit gesetzt ist', async () => {
      reset()
      const { deliver, cleanup } = await start({ contextWindowSize: 1000, lookupModelLimit: true }, catalog)
      await deliver(stepStarted('ses_abc', 'msg_1', 'big-pickle', 'opencode'))
      await deliver(stepEnded('ses_abc', 'msg_1', tok(20_000, 0, 0)))
      cleanup()
      const cw = read().context_window
      assert.equal(cw.context_window_size, 200_000)
      assert.equal(cw.used_percentage, 10)
    })

    it('unterscheidet Anbieter: gleiche Modell-ID, anderer Anbieter, anderes Fenster', async () => {
      reset()
      const both = [
        ...catalog,
        { providerID: 'other', id: 'qwen3', modelID: 'qwen3', limit: { context: 8_000 } },
      ]
      const { deliver, cleanup } = await start({ contextWindowSize: 1000, lookupModelLimit: true }, both)
      await deliver(stepStarted('ses_abc', 'msg_1', 'qwen3', 'ollama'))
      await deliver(stepEnded('ses_abc', 'msg_1', tok(5_000, 0, 0)))
      cleanup()
      assert.equal(read().context_window.context_window_size, 50_000)
    })

    it('der feste Wert hat Vorrang, wenn lookupModelLimit NICHT gesetzt ist (Profilwert des lokalen Workers)', async () => {
      reset()
      const { deliver, cleanup } = await start({ contextWindowSize: 131_072 }, catalog)
      await deliver(stepStarted('ses_abc', 'msg_1', 'big-pickle', 'opencode'))
      await deliver(stepEnded('ses_abc', 'msg_1', tok(13_107, 0, 0)))
      cleanup()
      assert.equal(read().context_window.context_window_size, 131_072)
    })

    it('Rueckfall auf den festen Wert: unbekanntes Modell, kaputtes list(), Limit ohne Zahl', async () => {
      for (const models of [catalog, 'throw' as const, [{ providerID: 'x', id: 'm', limit: { context: 'viel' } }]]) {
        reset()
        const { deliver, cleanup } = await start({ contextWindowSize: 1000, lookupModelLimit: true }, models)
        await deliver(stepStarted('ses_abc', 'msg_1', 'm', 'x'))
        await deliver(stepEnded('ses_abc', 'msg_1', tok(100, 0, 0)))
        cleanup()
        assert.equal(read().context_window.context_window_size, 1000)
        assert.equal(read().context_window.used_percentage, 10)
      }
    })
  })

  describe('Aufraeumen', () => {
    it('die Aufraeumfunktion beendet den Abo-Strom', async () => {
      reset()
      const { deliver, cleanup } = await start({ contextWindowSize: 1000 })
      await deliver(stepStarted('ses_abc', 'msg_1'))
      cleanup()
      // Nach dem Cleanup wird nichts mehr geschrieben; zustellen darf nicht haengen bleiben.
      const settled = await Promise.race([
        deliver(stepEnded('ses_abc', 'msg_1', tok(500, 0, 0))).then(() => 'verarbeitet'),
        new Promise<string>(r => setTimeout(() => r('ignoriert'), 100)),
      ])
      assert.equal(settled, 'ignoriert')
      assert.ok(!('context_window' in read()))
    })
  })
})

describe('writeOpenCodeUsagePlugin', () => {
  it('legt das Plugin-Verzeichnis an, wenn es fehlt', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-usage-mkdir-'))
    const target = path.join(d, '.opencode', 'plugins')
    const written = writeOpenCodeUsagePlugin(target, { contextWindowSize: 1 })
    assert.equal(written, path.join(target, OPENCODE_USAGE_PLUGIN_FILENAME))
    assert.ok(fs.existsSync(written))
    fs.rmSync(d, { recursive: true, force: true })
  })
})
