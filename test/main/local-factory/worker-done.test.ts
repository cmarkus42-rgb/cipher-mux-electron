import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { classifyWorker, buildIdlePlugin, IDLE_EVENT_TYPES } from '../../../src/main/local-factory/worker-done'

const cfg = { quietMs: 30_000, timeoutMs: 3_600_000, stallMs: 600_000 }
const o = { now: 100_000, startedAt: 0, reportMtime: null, idleSignalAt: null, lastActivityAt: 99_000 }

describe('classifyWorker', () => {
  it('arbeitet: kein Report, Aktivität frisch', () => {
    assert.equal(classifyWorker(o, cfg), 'arbeitet')
  })
  it('fertig: Report + Idle-Signal danach', () => {
    assert.equal(classifyWorker({ ...o, reportMtime: 90_000, idleSignalAt: 95_000 }, cfg), 'fertig')
  })
  it('nicht fertig: Report, aber Idle-Signal ist älter als der Report und Aktivität frisch', () => {
    assert.equal(classifyWorker({ ...o, reportMtime: 90_000, idleSignalAt: 50_000 }, cfg), 'arbeitet')
  })
  it('fertig ohne Idle-Signal: Report + Ruhe länger als quietMs', () => {
    assert.equal(classifyWorker({ ...o, reportMtime: 60_000, lastActivityAt: 60_000 }, cfg), 'fertig')
  })
  it('hängt: Timeout, auch mit Aktivität', () => {
    assert.equal(classifyWorker({ ...o, now: 3_700_000, lastActivityAt: 3_699_000 }, cfg), 'haengt')
  })
  it('hängt schnell: Idle ohne Report und Ruhe > quietMs (stiller Abbruch am Ausgabelimit)', () => {
    assert.equal(classifyWorker({ ...o, idleSignalAt: 60_000, lastActivityAt: 60_000 }, cfg), 'haengt')
  })
  it('arbeitet: Idle ohne Report, aber Ruhe noch kurz (zwischen zwei Zügen)', () => {
    assert.equal(classifyWorker({ ...o, idleSignalAt: 95_000, lastActivityAt: 95_000 }, cfg), 'arbeitet')
  })
  it('hängt: lange Stille ohne Report', () => {
    assert.equal(classifyWorker({ ...o, now: 700_000, lastActivityAt: 50_000 }, cfg), 'haengt')
  })
})

describe('buildIdlePlugin (opencode 2)', () => {
  // Wie im Usage-Test: das Modul wird GELADEN und mit einem Fake-ctx ausgefuehrt.
  // opencode 2.0.29 weist ein V1-Plugin ab und sagt es nur im WARN-Log; ohne
  // Idle-Signal faellt der Laeufer auf die Ruhezeit zurueck und merkt nichts.
  async function start(signal: string, dir: string) {
    const p = path.join(dir, `p${Math.random().toString(36).slice(2)}.mjs`)
    fs.writeFileSync(p, buildIdlePlugin(signal))
    const mod = await import(p)
    assert.equal(typeof mod.default, 'object', 'Default-Export ist keine Plugin-Definition')
    assert.equal(mod.default.id, 'cipher-mux.idle')

    let push: (ev: unknown) => Promise<void> = async () => {}
    const controller = { aborted: false }
    const cleanup = await mod.default.setup({
      event: {
        subscribe(opts?: { signal?: AbortSignal }) {
          const queue: unknown[] = []
          let wake: (() => void) | null = null
          let handled: (() => void) | null = null
          opts?.signal?.addEventListener('abort', () => { controller.aborted = true; wake?.() })
          push = (ev) => new Promise<void>(res => { queue.push(ev); handled = res; wake?.() })
          return {
            [Symbol.asyncIterator]() {
              return {
                async next() {
                  handled?.(); handled = null
                  while (queue.length === 0) {
                    if (controller.aborted) return { value: undefined, done: true as const }
                    await new Promise<void>(r => { wake = r })
                  }
                  return { value: queue.shift(), done: false as const }
                },
                async return() { return { value: undefined, done: true as const } },
              }
            },
          }
        },
      },
    })
    return { push: (ev: unknown) => push(ev), cleanup, controller }
  }

  it('ist eine V2-Definition und liefert eine Aufraeumfunktion', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-'))
    const { cleanup, controller } = await start(path.join(dir, 'sig'), dir)
    assert.equal(typeof cleanup, 'function')
    cleanup()
    assert.equal(controller.aborted, true)
  })

  it('schreibt die Signaldatei nur beim Ende eines Zuges', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-'))
    const signal = path.join(dir, 'sig')
    const { push, cleanup } = await start(signal, dir)
    for (const type of ['session.step.ended', 'session.execution.started', 'session.text.delta', 'message.updated']) {
      await push({ type, data: { sessionID: 'ses_x' } })
    }
    assert.equal(fs.existsSync(signal), false, 'Signal vor dem Zugende geschrieben')
    cleanup()
  })

  it('jedes Ende eines Zuges setzt das Signal: erfolgreich, fehlgeschlagen, unterbrochen, idle', async () => {
    // Gemessen an 2.0.29 (`opencode run`): session.execution.succeeded. failed und
    // interrupted stehen im Binary; session.idle kam im Lauf nicht an, steht
    // aber als Eventname dort — und die TUI-Quelle ist ungemessen.
    assert.deepEqual([...IDLE_EVENT_TYPES].sort(), [
      'session.execution.failed',
      'session.execution.interrupted',
      'session.execution.succeeded',
      'session.idle',
    ])
    for (const type of IDLE_EVENT_TYPES) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-'))
      const signal = path.join(dir, 'sig')
      const { push, cleanup } = await start(signal, dir)
      await push({ type, data: { sessionID: 'ses_x' } })
      assert.ok(Number(fs.readFileSync(signal, 'utf-8')) > 0, `${type} setzt kein Signal`)
      cleanup()
    }
  })

  it('ein Fehler beim Schreiben beendet die Schleife nicht', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-'))
    const blocked = path.join(dir, 'kein-verzeichnis', 'sig')
    const { push, cleanup } = await start(blocked, dir)
    await push({ type: 'session.execution.succeeded', data: {} })
    // Das Verzeichnis entsteht nachtraeglich: der naechste Zug schreibt wieder.
    fs.mkdirSync(path.dirname(blocked))
    await push({ type: 'session.execution.succeeded', data: {} })
    assert.ok(fs.existsSync(blocked))
    cleanup()
  })

  it('geht an Muell vorbei', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-'))
    const signal = path.join(dir, 'sig')
    const { push, cleanup } = await start(signal, dir)
    for (const ev of [undefined, null, {}, { type: 42 }]) await push(ev)
    assert.equal(fs.existsSync(signal), false)
    cleanup()
  })

  it('ist ESM ohne Abhaengigkeit', () => {
    const src = buildIdlePlugin('/x/sig')
    assert.ok(src.includes('export default'))
    assert.ok(!src.includes('module.exports') && !src.includes('require('))
    assert.ok(!src.includes('@opencode/plugin') && !src.includes('@opencode-ai/plugin'))
  })
})
