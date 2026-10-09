import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { decideGate, touchedProtected, changedChecksums } from '../../../src/main/local-factory/gate'

const base = {
  workerFinished: true,
  testExitCode: 0,
  checksumsBefore: { 'test/a.test.ts': 'h1' },
  checksumsAfter: { 'test/a.test.ts': 'h1' },
  changedFiles: ['src/a.ts'],
  protectedFiles: ['test/a.test.ts'],
}

describe('decideGate', () => {
  it('grün: fertig, Tests grün, Schutz intakt', () => {
    assert.deepEqual(decideGate(base), { verdict: 'gruen', reasons: [] })
  })
  it('hängt: Worker nicht fertig geworden, egal was die Tests sagen', () => {
    assert.equal(decideGate({ ...base, workerFinished: false }).verdict, 'haengt')
  })
  it('hängt mit Gründen: Worker nicht fertig, aber geschützte Tests verändert', () => {
    const r = decideGate({ ...base, workerFinished: false, changedFiles: ['src/a.ts', 'test/a.test.ts'] })
    assert.equal(r.verdict, 'haengt')
    assert.match(r.reasons.join(), /Geschützte Tests verändert/)
  })
  it('rot: Tests rot', () => {
    const r = decideGate({ ...base, testExitCode: 1 })
    assert.equal(r.verdict, 'rot')
    assert.match(r.reasons.join(), /Testbefehl/)
  })
  it('rot: Testbefehl nicht gelaufen (null)', () => {
    assert.equal(decideGate({ ...base, testExitCode: null }).verdict, 'rot')
  })
  it('rot trotz grüner Tests, wenn ein geschützter Test im Diff steht (Shell-Weg)', () => {
    const r = decideGate({ ...base, changedFiles: ['src/a.ts', 'test/a.test.ts'] })
    assert.equal(r.verdict, 'rot')
    assert.match(r.reasons.join(), /test\/a\.test\.ts/)
  })
  it('rot, wenn die Prüfsumme abweicht, auch ohne Diff-Eintrag', () => {
    const r = decideGate({ ...base, checksumsAfter: { 'test/a.test.ts': 'h2' } })
    assert.equal(r.verdict, 'rot')
    assert.match(r.reasons.join(), /Prüfsumme/)
  })
  it('rot, wenn eine geschützte Datei verschwunden ist (Baseline fehlt)', () => {
    const r = decideGate({ ...base, checksumsAfter: {} })
    assert.equal(r.verdict, 'rot')
    assert.match(r.reasons.join(), /Baseline fehlt/)
  })
  it('rot: leere checksumsBefore mit nicht-leeren protectedFiles', () => {
    const r = decideGate({ ...base, checksumsBefore: {} })
    assert.equal(r.verdict, 'rot')
    assert.match(r.reasons.join(), /Baseline fehlt/)
  })
  it('grün: Path-Normalisierung ./test/a.test.ts → test/a.test.ts, unverändert', () => {
    const r = decideGate({
      ...base,
      checksumsBefore: { './test/a.test.ts': 'h1' },
      checksumsAfter: { './test/a.test.ts': 'h1' },
    })
    assert.equal(r.verdict, 'gruen')
  })
  it('rot: Path-Normalisierung test/../test/a.test.ts → test/a.test.ts, verändert', () => {
    const r = decideGate({
      ...base,
      checksumsBefore: { 'test/../test/a.test.ts': 'h1' },
      checksumsAfter: { 'test/../test/a.test.ts': 'h2' },
    })
    assert.equal(r.verdict, 'rot')
    assert.match(r.reasons.join(), /Prüfsumme/)
  })
  it('rot: protectedFiles leer', () => {
    const r = decideGate({ ...base, protectedFiles: [] })
    assert.equal(r.verdict, 'rot')
    assert.match(r.reasons.join(), /Keine geschützten Abnahmetests/)
  })
})

describe('Hilfsfunktionen', () => {
  it('touchedProtected normalisiert führendes ./', () => {
    assert.deepEqual(touchedProtected(['./test/a.test.ts'], ['test/a.test.ts']), ['test/a.test.ts'])
  })
  it('changedChecksums iteriert über protectedFiles und meldet fehlende/geänderte', () => {
    assert.deepEqual(
      changedChecksums(
        { 'test/a.test.ts': '1', 'test/b.test.ts': '2' },
        { 'test/a.test.ts': '1' },
        ['test/a.test.ts', 'test/b.test.ts']
      ),
      ['test/b.test.ts']
    )
  })
  it('changedChecksums mit normalisierten Pfaden', () => {
    assert.deepEqual(
      changedChecksums(
        { './test/a.test.ts': '1' },
        { 'test/a.test.ts': '1' },
        ['test/a.test.ts']
      ),
      []
    )
  })
})
