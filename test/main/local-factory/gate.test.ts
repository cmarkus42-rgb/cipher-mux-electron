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
  })
  it('rot, wenn eine geschützte Datei verschwunden ist', () => {
    assert.equal(decideGate({ ...base, checksumsAfter: {} }).verdict, 'rot')
  })
})

describe('Hilfsfunktionen', () => {
  it('touchedProtected normalisiert führendes ./', () => {
    assert.deepEqual(touchedProtected(['./test/a.test.ts'], ['test/a.test.ts']), ['test/a.test.ts'])
  })
  it('changedChecksums meldet geänderte und fehlende', () => {
    assert.deepEqual(changedChecksums({ a: '1', b: '2' }, { a: '1' }), ['b'])
  })
})
