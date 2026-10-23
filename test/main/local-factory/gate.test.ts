import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  decideGate, touchedProtected, testWarnungen, readGateRecord, pruefeErsetzungen, diffAusserhalbAuftrag, pruefeVerboteneMuster,
} from '../../../src/main/local-factory/gate'

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
  // changedChecksums ist entfallen (ungenutzt); decideGate deckt beides ab:
  it('decideGate: fehlende Prüfsumme danach → Baseline-Grund, rot', () => {
    const g = decideGate({
      workerFinished: true, testExitCode: 0,
      checksumsBefore: { 'test/a.test.ts': '1', 'test/b.test.ts': '2' },
      checksumsAfter: { 'test/a.test.ts': '1' },
      changedFiles: [], protectedFiles: ['test/a.test.ts', 'test/b.test.ts'],
    })
    assert.equal(g.verdict, 'rot')
    assert.deepEqual(g.reasons, ['Baseline fehlt für geschützten Test: test/b.test.ts'])
  })
  it('decideGate: Prüfsummen-Schlüssel mit ./ werden normalisiert → grün', () => {
    const g = decideGate({
      workerFinished: true, testExitCode: 0,
      checksumsBefore: { './test/a.test.ts': '1' },
      checksumsAfter: { 'test/a.test.ts': '1' },
      changedFiles: [], protectedFiles: ['test/a.test.ts'],
    })
    assert.deepEqual(g, { verdict: 'gruen', reasons: [] })
  })
})

describe('decideGate ohne Testpflicht', () => {
  it('testPflicht false: leere Schutzliste und Test grün → grün', () => {
    assert.equal(decideGate({ workerFinished: true, testExitCode: 0, checksumsBefore: {}, checksumsAfter: {},
      changedFiles: ['a.ts'], protectedFiles: [], testPflicht: false }).verdict, 'gruen')
  })
})

describe('testWarnungen (L10)', () => {
  it('pytest „N deselected“ in der Zusammenfassung → eine Warnung mit Anzahl', () => {
    const w = testWarnungen('collected 44 items / 41 deselected / 3 selected\n...\n== 3 passed, 41 deselected in 0.5s ==\n')
    assert.equal(w.length, 1)
    assert.match(w[0], /41 Tests deselected/)
    assert.match(w[0], /-k/)
  })
  it('ohne Filter keine Warnung', () => {
    assert.deepEqual(testWarnungen('== 44 passed in 1.2s =='), [])
    assert.deepEqual(testWarnungen(''), [])
  })
  it('„0 deselected“ ist keine Warnung', () => {
    assert.deepEqual(testWarnungen('== 3 passed, 0 deselected in 0.1s =='), [])
  })
})

describe('readGateRecord (alte Gates)', () => {
  it('altes Gate ohne warnungen/diagnose → leere Warnungen, keine Diagnose', () => {
    const g = readGateRecord({ verdict: 'rot', reasons: ['x'], testOutput: 'out' })
    assert.deepEqual(g, { verdict: 'rot', reasons: ['x'], testOutput: 'out', warnungen: [], diagnose: null })
  })
  it('kaputte Felder werden nicht übernommen, nie ein Wurf', () => {
    const g = readGateRecord({ reasons: 'nein', warnungen: [1, 'w'], diagnose: 'x' })
    assert.deepEqual(g.reasons, [])
    assert.deepEqual(g.warnungen, ['w'])
    assert.equal(g.diagnose, null)
    assert.equal(readGateRecord(null).testOutput, '')
  })
  it('Diagnose bleibt erhalten', () => {
    const diagnose = { laufzeitSek: 12, tokens: null, letzteAktivitaet: null, paneTail: ['a'] }
    assert.deepEqual(readGateRecord({ verdict: 'haengt', reasons: [], testOutput: '', diagnose }).diagnose, diagnose)
  })
})

describe('L11 Ersetzungen', () => {
  const datei = (inhalt: string | null) => () => inhalt
  it('alt weg, neu da → kein Grund', () => {
    assert.deepEqual(pruefeErsetzungen([{ datei: 'a.ts', alt: 'foo', neu: 'bar' }], datei('x bar y')), [])
  })
  it('alt noch da → ROT-Grund mit Datei und Anzahl', () => {
    const r = pruefeErsetzungen([{ datei: 'a.ts', alt: 'foo', neu: 'bar' }], datei('bar foo foo'))
    assert.equal(r.length, 1)
    assert.match(r[0], /a\.ts/)
    assert.match(r[0], /„foo“ kommt noch 2× vor/)
  })
  it('neu fehlt → ROT-Grund', () => {
    const r = pruefeErsetzungen([{ datei: 'a.ts', alt: 'foo', neu: 'bar' }], datei('nichts'))
    assert.match(r.join(), /„bar“ fehlt/)
  })
  it('neu enthält alt: Vorkommen werden verrechnet', () => {
    const e = [{ datei: 'a.ts', alt: 'foo', neu: 'foo()' }]
    assert.deepEqual(pruefeErsetzungen(e, datei('x foo() y foo()')), [])
    assert.match(pruefeErsetzungen(e, datei('foo foo()')).join(), /kommt noch 1× vor/)
  })
  it('Datei fehlt → ROT-Grund', () => {
    assert.match(pruefeErsetzungen([{ datei: 'weg.ts', alt: 'a', neu: 'b' }], datei(null)).join(), /weg\.ts.*nicht lesbar/)
  })
  it('leeres neu (Löschung) prüft nur alt', () => {
    assert.deepEqual(pruefeErsetzungen([{ datei: 'a.ts', alt: 'foo', neu: '' }], datei('bar')), [])
  })
})

describe('L11 Diff außerhalb des Auftrags', () => {
  it('meldet nur Dateien, die weder Auftrag noch geschützter Test noch Testpfad sind', () => {
    const w = diffAusserhalbAuftrag(
      ['impl.txt', 'andere.txt', 'test/accept.sh', 'src/x.test.ts', 'e2e-tests/fall.py', 'lib/b.ts'],
      { dateien: ['impl.txt', 'lib/'], prot: ['test/accept.sh'], testpfade: ['e2e-tests/'] },
    )
    assert.deepEqual(w, ['andere.txt'])
  })
  it('alles im Auftrag → leer', () => {
    assert.deepEqual(diffAusserhalbAuftrag(['./impl.txt'], { dateien: ['impl.txt'], prot: [], testpfade: [] }), [])
  })
})

describe('L16b verbotene Muster', () => {
  const m = [{ pfad: 'src/', regex: 'globalThis\\.__', grund: 'Testcode in der Produktion' }]
  it('Treffer in passender Datei → Grund mit Fundstelle', () => {
    const r = pruefeVerboteneMuster([{ datei: 'src/lib/a.ts', zeile: 7, text: '  globalThis.__calls = []' }], m)
    assert.equal(r.length, 1)
    assert.match(r[0], /Testcode in der Produktion/)
    assert.match(r[0], /src\/lib\/a\.ts:7/)
    assert.match(r[0], /globalThis\.__calls = \[\]/)
  })
  it('Präfix: andere Verzeichnisse und Namensvettern zählen nicht', () => {
    assert.deepEqual(pruefeVerboteneMuster([
      { datei: 'test/a.test.ts', zeile: 1, text: 'globalThis.__calls' },
      { datei: 'srcx/a.ts', zeile: 1, text: 'globalThis.__calls' },
    ], m), [])
    assert.equal(pruefeVerboteneMuster([{ datei: 'src/a.ts', zeile: 1, text: 'globalThis.__x' }], [{ ...m[0], pfad: 'src' }]).length, 1)
  })
  it('Glob als pfad', () => {
    const g = [{ pfad: 'src/**/*.ts', regex: 'console\\.log', grund: 'kein Debug-Log' }]
    assert.equal(pruefeVerboteneMuster([{ datei: 'src/x/y.ts', zeile: 3, text: 'console.log(1)' }], g).length, 1)
    assert.equal(pruefeVerboteneMuster([{ datei: 'src/x/y.js', zeile: 3, text: 'console.log(1)' }], g).length, 0)
  })
  it('mehrere Fundstellen eines Musters: ein Grund, höchstens fünf Orte', () => {
    const zeilen = Array.from({ length: 8 }, (_, i) => ({ datei: 'src/a.ts', zeile: i + 1, text: 'globalThis.__x' }))
    const r = pruefeVerboteneMuster(zeilen, m)
    assert.equal(r.length, 1)
    assert.match(r[0], /8 Fundstellen/)
    assert.doesNotMatch(r[0], /src\/a\.ts:6/)
  })
})
