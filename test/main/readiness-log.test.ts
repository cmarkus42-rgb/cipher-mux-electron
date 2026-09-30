import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import path from 'path'
import os from 'os'
import { ReadinessLog } from '../../src/main/mcp/readiness-log'

// ─── Welches Signal hat die Session bereit gemeldet? ────────
//
// Die Bereitschaftspruefung hat seit dem 2026-09-30 zwei Signale: die
// Selbstmeldung der Session ueber ihren statusLine-Hook, und als Rueckfall den
// Prompt im Terminal. Der Rueckfall bleibt, weil er nachweislich funktioniert
// hat und die Selbstmeldung neu ist.
//
// Damit sich nach ein paar Wochen sagen laesst, ob die Selbstmeldung traegt,
// muss mitgeschrieben werden, welches Signal tatsaechlich gegriffen hat --
// statt es zu vermuten. Genau das ist der Auftrag: trackbar machen.
//
// Bewusst eine Datei und keine Datenbank: es ist eine Beobachtung ueber Wochen,
// niemand fragt sie im Betrieb ab, und eine Zeile pro Zustellung ist in einem
// Jahr keine Groesse, die eine Datenbank rechtfertigt.

describe('ReadinessLog', () => {
  let dir: string

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'readiness-log-'))
  })

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('schreibt einen Eintrag und liest ihn zurueck', () => {
    const log = new ReadinessLog(path.join(dir, 'a.jsonl'))
    log.record({ entityId: 'debugger', via: 'status-line', attempts: 1, wasExisting: false })

    const entries = log.read()
    assert.equal(entries.length, 1)
    assert.equal(entries[0].entityId, 'debugger')
    assert.equal(entries[0].via, 'status-line')
    assert.ok(entries[0].ts > 0, 'ein Eintrag ohne Zeitpunkt ist nicht auswertbar')
  })

  it('zaehlt, welches Signal wie oft gegriffen hat', () => {
    const log = new ReadinessLog(path.join(dir, 'b.jsonl'))
    log.record({ entityId: 'a', via: 'status-line', attempts: 1, wasExisting: false })
    log.record({ entityId: 'b', via: 'status-line', attempts: 2, wasExisting: false })
    log.record({ entityId: 'c', via: 'prompt', attempts: 3, wasExisting: true })
    log.record({ entityId: 'd', via: null, attempts: 5, wasExisting: false })

    const s = log.summarize()
    assert.equal(s.total, 4)
    assert.equal(s.bySignal['status-line'], 2)
    assert.equal(s.bySignal['prompt'], 1)
    assert.equal(s.failed, 1, 'kein Signal heisst gescheitert, nicht "sonstiges"')
  })

  it('nennt den Anteil der Selbstmeldung — die Zahl, um die es geht', () => {
    const log = new ReadinessLog(path.join(dir, 'c.jsonl'))
    for (let i = 0; i < 3; i++) log.record({ entityId: 'x', via: 'status-line', attempts: 1, wasExisting: false })
    log.record({ entityId: 'y', via: 'prompt', attempts: 1, wasExisting: false })

    const s = log.summarize()
    assert.equal(s.selfReportShare, 0.75)
  })

  it('liefert eine leere Auswertung statt zu werfen, wenn noch nichts da ist', () => {
    const log = new ReadinessLog(path.join(dir, 'leer.jsonl'))
    const s = log.summarize()
    assert.equal(s.total, 0)
    assert.equal(s.selfReportShare, null, 'ohne Daten gibt es keinen Anteil, auch nicht null Prozent')
  })

  it('ueberspringt eine kaputte Zeile, statt die ganze Datei zu verwerfen', () => {
    const file = path.join(dir, 'kaputt.jsonl')
    const log = new ReadinessLog(file)
    log.record({ entityId: 'a', via: 'prompt', attempts: 1, wasExisting: false })
    fsSync.appendFileSync(file, '{kein json\n')
    log.record({ entityId: 'b', via: 'status-line', attempts: 1, wasExisting: false })

    assert.equal(log.read().length, 2)
  })

  it('kappt die Datei, damit sie nicht unbegrenzt waechst', () => {
    const file = path.join(dir, 'lang.jsonl')
    const log = new ReadinessLog(file, 5)
    for (let i = 0; i < 12; i++) {
      log.record({ entityId: `e${i}`, via: 'prompt', attempts: 1, wasExisting: false })
    }
    const entries = log.read()
    assert.ok(entries.length <= 5, `nicht mehr als das Limit, waren ${entries.length}`)
    assert.equal(entries[entries.length - 1].entityId, 'e11', 'die juengsten bleiben')
  })

  it('schreibt ohne zu werfen, wenn das Verzeichnis fehlt', () => {
    const log = new ReadinessLog(path.join(dir, 'gibtsnicht', 'tief', 'x.jsonl'))
    assert.doesNotThrow(() => {
      log.record({ entityId: 'a', via: 'prompt', attempts: 1, wasExisting: false })
    })
  })
})
