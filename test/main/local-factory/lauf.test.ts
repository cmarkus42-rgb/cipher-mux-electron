import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  newLauf, beginVersuch, endVersuch, markAbgenommen, markBeurteilt, abortRunning, countWeckruf,
  parseLauf, loadLauf, saveLauf, MAX_VERSUCHE, zaehlendeVersuche, type Lauf,
} from '../../../src/main/local-factory/lauf'

const ok = <T>(r: T | { error: string }): T => {
  if ('error' in (r as object)) throw new Error((r as { error: string }).error)
  return r as T
}

describe('Lauf-Zustand', () => {
  it('neues Häppchen bekommt die nächste Nummer, Versuch 1', () => {
    const r = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 }))
    assert.equal(r.nummer, 1)
    assert.equal(r.versuch, 1)
    assert.equal(r.lauf.haeppchen[0].status, 'laeuft')
  })

  it('zweiter Versuch auf dasselbe Häppchen nach rot', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 2)
    const r = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 3 }))
    assert.equal(r.versuch, 2)
  })

  it(`nach ${MAX_VERSUCHE} Fehlschlägen: eskaliert und kein dritter Versuch`, () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 2)
    l = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 3 })).lauf
    l = endVersuch(l, 1, { verdict: 'haengt' }, 4)
    assert.equal(l.haeppchen[0].status, 'eskaliert')
    const r = beginVersuch(l, { nummer: 1, ziel: 'a', now: 5 })
    assert.ok('error' in r)
    assert.match((r as { error: string }).error, /eskaliert/)
  })

  it('kein neuer Versuch, solange einer läuft (nacheinander)', () => {
    const l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    assert.ok('error' in beginVersuch(l, { ziel: 'b', now: 2 }))
  })

  it('grün → wartet; abgenommen erst durch den Architekten', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'gruen', commit: 'abc' }, 2)
    assert.equal(l.haeppchen[0].status, 'wartet')
    assert.equal(markAbgenommen(l, 1).haeppchen[0].status, 'abgenommen')
  })

  it('unbekannte Nummer → Fehler', () => {
    assert.ok('error' in beginVersuch(newLauf('L', '/p', 0), { nummer: 7, ziel: 'a', now: 1 }))
  })

  it('abortRunning markiert laufende Häppchen als abgebrochen', () => {
    const l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    assert.equal(abortRunning(l).haeppchen[0].status, 'abgebrochen')
  })

  it('countWeckruf zählt hoch', () => {
    assert.equal(countWeckruf(newLauf('L', '/p', 0)).weckrufe, 1)
  })

  it('endVersuch auf eskaliert: bleibt eskaliert auch mit grün-Verdict', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 2)
    l = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 3 })).lauf
    l = endVersuch(l, 1, { verdict: 'haengt' }, 4)
    assert.equal(l.haeppchen[0].status, 'eskaliert')
    l = endVersuch(l, 1, { verdict: 'gruen' }, 5)
    assert.equal(l.haeppchen[0].status, 'eskaliert')
  })

  it('markAbgenommen auf laeuft: unverändert', () => {
    const l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    assert.equal(l.haeppchen[0].status, 'laeuft')
    const marked = markAbgenommen(l, 1)
    assert.equal(marked.haeppchen[0].status, 'laeuft')
  })

  it('markAbgenommen nach rot-Verdict (nicht grün): unverändert', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 2)
    assert.equal(l.haeppchen[0].status, 'wartet')
    const marked = markAbgenommen(l, 1)
    assert.equal(marked.haeppchen[0].status, 'wartet')
  })

  it('abgebrochen + Versuch rot → eskaliert, kein Versuch möglich', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = abortRunning(l)
    assert.equal(l.haeppchen[0].status, 'abgebrochen')
    const r = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 2 }))
    l = endVersuch(r.lauf, 1, { verdict: 'rot' }, 3)
    assert.equal(l.haeppchen[0].status, 'eskaliert')
    assert.ok('error' in beginVersuch(l, { nummer: 1, ziel: 'a', now: 4 }))
  })

  it('parseLauf mit gemischten versuche: alle behalten, ungültige durch Stub ersetzen', () => {
    const l = parseLauf({
      id: 'L',
      projekt: '/p',
      haeppchen: [{ nummer: 1, ziel: 'a', versuche: [{ nr: 1, gestartet: 100 }, 'kaputt'] }],
    })!
    assert.equal(l.haeppchen[0].versuche.length, 2)
    assert.deepEqual(l.haeppchen[0].versuche[0], { nr: 1, gestartet: 100 })
    assert.deepEqual(l.haeppchen[0].versuche[1], { nr: 2, gestartet: 0, verdict: 'haengt' })
    const r = beginVersuch(l, { nummer: 1, ziel: 'a', now: 1 })
    assert.ok('error' in r)
  })
})

describe('parseLauf / loadLauf defensiv', () => {
  it('Müll → null', () => {
    assert.equal(parseLauf(null), null)
    assert.equal(parseLauf('x'), null)
    assert.equal(parseLauf({ id: 1 }), null)
  })
  it('fehlende Felder werden aufgefüllt, kaputte Häppchen fallen weg', () => {
    const l = parseLauf({ id: 'L', projekt: '/p', haeppchen: [{ nummer: 1, ziel: 'a' }, 'kaputt'] })!
    assert.equal(l.weckrufe, 0)
    assert.equal(l.haeppchen.length, 1)
    assert.deepEqual(l.haeppchen[0].versuche, [])
    assert.equal(l.haeppchen[0].status, 'abgebrochen')
  })
  it('Roundtrip über die Platte; kaputte Datei → null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lauf-'))
    const f = path.join(dir, 'x', 'lauf.json')
    const l: Lauf = newLauf('L', '/p', 0)
    saveLauf(f, l)
    assert.deepEqual(loadLauf(f), l)
    fs.writeFileSync(f, '{kaputt')
    assert.equal(loadLauf(f), null)
    assert.equal(loadLauf(path.join(dir, 'fehlt.json')), null)
  })
})

describe('Lauf — Branch', () => {
  it('newLauf übernimmt den Branch, parseLauf liest ihn defensiv', () => {
    assert.equal(newLauf('L', '/p', 0, 'main').branch, 'main')
    assert.equal(parseLauf({ id: 'L', projekt: '/p', branch: 'main' })!.branch, 'main')
    assert.equal(parseLauf({ id: 'L', projekt: '/p' })!.branch, undefined)
    assert.equal(parseLauf({ id: 'L', projekt: '/p', branch: 42 })!.branch, undefined)
  })
})

describe('Lauf — Urteil', () => {
  it('markBeurteilt: grün-wartend und eskaliert ja, laufend und beurteilt nein', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1, mitTest: true })).lauf
    assert.equal(l.haeppchen[0].mitTest, true)
    assert.equal(markBeurteilt(l, 1), l)
    l = endVersuch(l, 1, { verdict: 'gruen' }, 2)
    const b = markBeurteilt(l, 1)
    assert.equal(b.haeppchen[0].status, 'beurteilt')
    assert.equal(markBeurteilt(b, 1), b)
  })
  it('beginVersuch lehnt ein beurteiltes Häppchen ab', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = markBeurteilt(endVersuch(l, 1, { verdict: 'gruen' }, 2), 1)
    const r = beginVersuch(l, { nummer: 1, ziel: 'a', now: 3 })
    assert.deepEqual(r, { error: 'Häppchen #1 ist schon beurteilt.' })
  })
  it('parseLauf kennt den Status beurteilt', () => {
    const l = parseLauf({ id: 'L', projekt: '/p', haeppchen: [{ nummer: 1, ziel: 'a', status: 'beurteilt', versuche: [] }] })!
    assert.equal(l.haeppchen[0].status, 'beurteilt')
  })
})

describe('L12 architektenfehler', () => {
  const zweiRot = (): Lauf => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 2)
    l = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 3 })).lauf
    return endVersuch(l, 1, { verdict: 'rot' }, 4)
  }
  it('aus eskaliert heraus: markiert den letzten Fehlversuch, neuer Versuch zählt nicht gegen MAX_VERSUCHE', () => {
    const l = zweiRot()
    assert.equal(l.haeppchen[0].status, 'eskaliert')
    const r = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 5, architektenfehler: 'Test prüfte falsche Datei' }))
    assert.equal(r.versuch, 3)
    const h = r.lauf.haeppchen[0]
    assert.equal(h.status, 'laeuft')
    assert.equal(h.versuche[1].architektenfehler, 'Test prüfte falsche Datei')
    assert.equal(h.versuche[0].architektenfehler, undefined)
    assert.equal(zaehlendeVersuche(h), 2)
    // rot im dritten Versuch: jetzt (wieder) ausgeschöpft
    assert.equal(endVersuch(r.lauf, 1, { verdict: 'rot' }, 6).haeppchen[0].status, 'eskaliert')
  })
  it('nach einem Fehlversuch: es bleibt noch der reguläre zweite Versuch', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'haengt' }, 2)
    l = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 3, architektenfehler: 'Zuschnitt zu groß' })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 4)
    assert.equal(l.haeppchen[0].status, 'wartet')
    assert.equal(ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 5 })).versuch, 3)
  })
  it('Deckel 1 je Häppchen: ein zweiter architektenfehler wird abgelehnt', () => {
    let l = ok(beginVersuch(zweiRot(), { nummer: 1, ziel: 'a', now: 5, architektenfehler: 'eins' })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 6)
    const r = beginVersuch(l, { nummer: 1, ziel: 'a', now: 7, architektenfehler: 'zwei' })
    assert.ok('error' in r)
    assert.match(r.error, /schon einen Architektenfehler/)
    assert.match(r.error, /höchstens 1/)
  })
  it('ohne Fehlversuch nicht möglich: grüner letzter Versuch oder neues Häppchen', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'gruen' }, 2)
    const g = beginVersuch(l, { nummer: 1, ziel: 'a', now: 3, architektenfehler: 'x' })
    assert.ok('error' in g && /Fehlversuch/.test(g.error))
    const neu = beginVersuch(l, { ziel: 'b', now: 3, architektenfehler: 'x' })
    assert.ok('error' in neu && /haeppchen/.test(neu.error))
  })
  it('architektenfehler übersteht Speichern und Laden', () => {
    const l = ok(beginVersuch(zweiRot(), { nummer: 1, ziel: 'a', now: 5, architektenfehler: 'grund' })).lauf
    assert.equal(parseLauf(JSON.parse(JSON.stringify(l)))!.haeppchen[0].versuche[1].architektenfehler, 'grund')
  })
})

// Live-Test 23.10.: bricht der Läufer selbst ab, ist das kein Hänger des Workers.
describe('Läuferfehler: eigener Ausgang und Retry-Feld laeuferfehler', () => {
  const mitLF = (vorher: Array<'rot' | 'haengt'> = []): Lauf => {
    let l = newLauf('L', '/p', 0)
    let t = 1
    for (const v of vorher) {
      l = ok(beginVersuch(l, { ...(l.haeppchen.length ? { nummer: 1 } : {}), ziel: 'a', now: t++ })).lauf
      l = endVersuch(l, 1, { verdict: v }, t++)
    }
    l = ok(beginVersuch(l, { ...(l.haeppchen.length ? { nummer: 1 } : {}), ziel: 'a', now: t++ })).lauf
    return endVersuch(l, 1, { verdict: 'laeuferfehler', fehler: 'git failed: index.lock' }, t)
  }

  it('endVersuch: Ausgang laeuferfehler mit Meldung, Häppchen wartet, übersteht Speichern und Laden', () => {
    const l = mitLF()
    const h = parseLauf(JSON.parse(JSON.stringify(l)))!.haeppchen[0]
    assert.equal(h.status, 'wartet')
    assert.equal(h.versuche[0].verdict, 'laeuferfehler')
    assert.equal(h.versuche[0].fehler, 'git failed: index.lock')
  })

  it('Retry mit laeuferfehler markiert den Versuch; er zählt nicht gegen MAX_VERSUCHE', () => {
    const r = ok(beginVersuch(mitLF(), { nummer: 1, ziel: 'a', now: 10, laeuferfehler: 'Commit scheiterte an .gitignore' }))
    assert.equal(r.versuch, 2)
    const h = r.lauf.haeppchen[0]
    assert.equal(h.versuche[0].laeuferfehler, 'Commit scheiterte an .gitignore')
    assert.equal(zaehlendeVersuche(h), 1)
  })

  it('auch aus eskaliert heraus (Läuferfehler im zweiten Versuch)', () => {
    const l = mitLF(['rot'])
    assert.equal(l.haeppchen[0].status, 'eskaliert')
    const r = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 10, laeuferfehler: 'grund' }))
    assert.equal(r.lauf.haeppchen[0].status, 'laeuft')
    assert.equal(zaehlendeVersuche(r.lauf.haeppchen[0]), 2)
  })

  it('Deckel 1 je Häppchen: ein zweiter Läuferfehler eskaliert, ein zweites Markieren wird abgelehnt', () => {
    let l = ok(beginVersuch(mitLF(), { nummer: 1, ziel: 'a', now: 10, laeuferfehler: 'eins' })).lauf
    l = endVersuch(l, 1, { verdict: 'laeuferfehler', fehler: 'wieder' }, 11)
    assert.equal(l.haeppchen[0].status, 'eskaliert')
    const r = beginVersuch(l, { nummer: 1, ziel: 'a', now: 12, laeuferfehler: 'zwei' })
    assert.ok('error' in r)
    assert.match(r.error, /schon einen Läuferfehler/)
    assert.match(r.error, /höchstens 1/)
  })

  it('unabhängig vom Deckel für architektenfehler', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 2)
    l = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 3, architektenfehler: 'Test falsch' })).lauf
    l = endVersuch(l, 1, { verdict: 'laeuferfehler', fehler: 'x' }, 4)
    const r = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 5, laeuferfehler: 'Commit-Fehler' }))
    assert.equal(zaehlendeVersuche(r.lauf.haeppchen[0]), 1)
  })

  it('nur nach einem Läuferfehler — oder nach „haengt“ mit grünem Gate (Altfall lf-live)', () => {
    const rot = endVersuch(ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf, 1, { verdict: 'rot' }, 2)
    const r1 = beginVersuch(rot, { nummer: 1, ziel: 'a', now: 3, laeuferfehler: 'x' })
    assert.ok('error' in r1 && /kein Läuferfehler/.test(r1.error))

    const haengt = endVersuch(ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf, 1, { verdict: 'haengt' }, 2)
    const r2 = beginVersuch(haengt, { nummer: 1, ziel: 'a', now: 3, laeuferfehler: 'x' })
    assert.ok('error' in r2 && /kein Läuferfehler/.test(r2.error))
    const r3 = ok(beginVersuch(haengt, { nummer: 1, ziel: 'a', now: 3, laeuferfehler: 'x', letzterGateGruen: true }))
    assert.equal(r3.lauf.haeppchen[0].versuche[0].laeuferfehler, 'x')

    const neu = beginVersuch(haengt, { ziel: 'b', now: 3, laeuferfehler: 'x' })
    assert.ok('error' in neu && /haeppchen/.test(neu.error))
  })
})
