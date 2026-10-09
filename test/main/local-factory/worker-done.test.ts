import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { classifyWorker, buildIdlePlugin, IDLE_EVENT_TYPE } from '../../../src/main/local-factory/worker-done'

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

describe('buildIdlePlugin', () => {
  it('schreibt die Signaldatei nur beim Idle-Ereignis', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-'))
    const signal = path.join(dir, 'sig')
    const p = path.join(dir, 'p.mjs')
    fs.writeFileSync(p, buildIdlePlugin(signal))
    const hooks = await (await import(p)).default()
    await hooks.event({ event: { type: 'message.updated' } })
    assert.equal(fs.existsSync(signal), false)
    await hooks.event({ event: { type: IDLE_EVENT_TYPE } })
    assert.ok(Number(fs.readFileSync(signal, 'utf-8')) > 0)
  })
})
