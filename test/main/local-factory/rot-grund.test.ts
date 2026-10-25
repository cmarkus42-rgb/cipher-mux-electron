import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { rotAusTestfehler } from '../../../src/main/local-factory/gate'
import * as P from './rot-proben'

// L16a: Ist der Abnahmetest vorab aus dem richtigen Grund rot? Ein Fehler, dessen
// Ort im Test selbst liegt, spricht dagegen. Geprüft an echten Ausgaben.
const R = '/repo'

describe('rotAusTestfehler: Fehler im Test selbst', () => {
  it('node:test (TAP, ohne TTY): TypeError an Test-Hilfsobjekt → Helfer erkannt', () => {
    const b = rotAusTestfehler(P.nodeTapHelfer, ['test/helfer.test.js'], R)
    assert.deepEqual(b, { fehler: 'TypeError', datei: 'test/helfer.test.js', helfer: '__calls' })
  })
  it('node:test (spec-Reporter): dasselbe', () => {
    assert.equal(rotAusTestfehler(P.nodeSpecHelfer, ['test/helfer.test.js'], R)?.helfer, '__calls')
  })
  it('vitest: TypeError mit Ort in der Testdatei unter src/', () => {
    const b = rotAusTestfehler(P.vitestHelfer, ['src/lib/zaehler.test.ts'], R)
    assert.deepEqual(b, { fehler: 'TypeError', datei: 'src/lib/zaehler.test.ts', helfer: '__calls' })
  })
  it('vitest: globalThis.<name> ist ein Test-Hilfsobjekt', () => {
    assert.equal(rotAusTestfehler(P.vitestGlobalThis, ['src/lib/zaehler.test.ts'], R)?.helfer, 'globalThis.meldeSpy')
  })
  it('vitest: ReferenceError im Test ohne Hilfsnamen → übersteuerbar (helfer null)', () => {
    assert.deepEqual(rotAusTestfehler(P.vitestReferenceImTest, ['src/lib/rechner.test.ts'], R),
      { fehler: 'ReferenceError', datei: 'src/lib/rechner.test.ts', helfer: null })
  })
  it('pytest lang: NameError übersteuerbar, AttributeError __claimCalls nicht', () => {
    const nur = (name: string) => P.pytestLang.split('____ ').find(x => x.startsWith(name))!
    assert.deepEqual(rotAusTestfehler(nur('test_name'), ['tests/test_kasse.py'], R),
      { fehler: 'NameError', datei: 'tests/test_kasse.py', helfer: null })
    assert.deepEqual(rotAusTestfehler(nur('test_attr'), ['tests/test_kasse.py'], R),
      { fehler: 'AttributeError', datei: 'tests/test_kasse.py', helfer: '__claimCalls' })
  })
  it('pytest: in der Gesamtausgabe gewinnt der nicht übersteuerbare Fund', () => {
    assert.equal(rotAusTestfehler(P.pytestLang, ['tests/test_kasse.py'], R)?.helfer, '__claimCalls')
    assert.equal(rotAusTestfehler(P.pytestKurz, ['tests/test_kasse.py'], R)?.helfer, '__claimCalls')
  })
  it('pytest: Dunder mit __ an beiden Enden (__enter__) bleibt übersteuerbar', () => {
    const nur = P.pytestKurz.split('____ ').find(x => x.startsWith('test_dunder'))!
    assert.deepEqual(rotAusTestfehler(nur, ['tests/test_kasse.py'], R),
      { fehler: 'AttributeError', datei: 'tests/test_kasse.py', helfer: null })
  })
})

describe('rotAusTestfehler: kein Block', () => {
  it('node:test: Produktions-TypeError mit Ort in src/ → null, obwohl der Test im Stack steht', () => {
    assert.equal(rotAusTestfehler(P.nodeTapProd, ['test/prod.test.js'], R), null)
  })
  it('vitest: Produktions-TypeError → null', () => {
    assert.equal(rotAusTestfehler(P.vitestProd, ['src/lib/rechner.test.ts'], R), null)
  })
  it('Ort nicht lesbar → null (fail-open)', () => {
    assert.equal(rotAusTestfehler(P.ohneOrt, ['test/helfer.test.js'], R), null)
  })
  it('Ort in einer nicht geschützten Datei → null', () => {
    assert.equal(rotAusTestfehler(P.nodeTapHelfer, ['test/anderer.test.js'], R), null)
  })
  it('gewöhnliches Rot (Assertion) → null', () => {
    assert.equal(rotAusTestfehler('AssertionError: expected 1 to be 2\n ❯ test/a.test.ts:3:4', ['test/a.test.ts'], R), null)
  })
})

describe('rotAusTestfehler: echte vitest-4.1.8-Ausgabe (projekt-a)', () => {
  const T = ['src/lib/zaehler.test.ts']
  const zeilen = P.vitestEcht.split('\n')
  // Fall n: vom n-ten „ FAIL “-Kopf bis vor den nächsten
  const fall = (n: number): string => {
    const koepfe = zeilen.map((z, i) => (z.startsWith(' FAIL ') ? i : -1)).filter(i => i >= 0)
    return zeilen.slice(koepfe[n - 1], koepfe[n] ?? zeilen.length).join('\n')
  }
  it('Fall 1: TypeError G.__calls → nicht übersteuerbar', () => {
    assert.deepEqual(rotAusTestfehler(fall(1), T, R), { fehler: 'TypeError', datei: 'src/lib/zaehler.test.ts', helfer: '__calls' })
  })
  it('Fall 2: ReferenceError nichtDa → blockt, übersteuerbar', () => {
    assert.deepEqual(rotAusTestfehler(fall(2), T, R), { fehler: 'ReferenceError', datei: 'src/lib/zaehler.test.ts', helfer: null })
  })
  it('Fall 3: TypeError m.teile (Ort im Test) → blockt, übersteuerbar', () => {
    assert.deepEqual(rotAusTestfehler(fall(3), T, R), { fehler: 'TypeError', datei: 'src/lib/zaehler.test.ts', helfer: null })
  })
  it('Fall 4: AssertionError → kein Block', () => {
    assert.equal(rotAusTestfehler(fall(4), T, R), null)
  })
  it('Gesamtausgabe → nicht übersteuerbar wegen Fall 1', () => {
    assert.equal(rotAusTestfehler(P.vitestEcht, T, R)?.helfer, '__calls')
  })
  it('Fehlerklasse nur im Testnamen (Übersicht, Codeauszug) ist kein Fehler — Kopf + Fall 4 → kein Block', () => {
    const kopf = zeilen.slice(0, zeilen.findIndex(z => z.startsWith(' FAIL ')))
    assert.ok(kopf.some(z => z.includes('ReferenceError im Test')))
    assert.equal(rotAusTestfehler([...kopf, fall(4)].join('\n'), T, R), null)
  })
})
