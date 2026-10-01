import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readEntityOverride, withEntityOverride } from '../../src/main/agent/entity-override-map'

describe('readEntityOverride', () => {
  it('liefert den gesetzten Adapter', () => {
    assert.equal(readEntityOverride({ 'testing-assistant': 'codex' }, 'testing-assistant'), 'codex')
  })

  it('liefert null fuer eine Rolle ohne Eintrag', () => {
    assert.equal(readEntityOverride({ debugger: 'codex' }, 'companion'), null)
  })

  it('liefert null statt zu werfen, wenn die Zuordnung fehlt', () => {
    // Die Config ist JSON auf der Platte und von Hand editierbar.
    assert.equal(readEntityOverride(undefined, 'companion'), null)
    assert.equal(readEntityOverride({} as never, 'companion'), null)
  })

  it('behandelt leere und reine Leerzeichen-Werte als keine Praeferenz', () => {
    // So raeumt eine UI ein Feld. Ein Adapter namens "" steht in keiner Registry.
    assert.equal(readEntityOverride({ a: '' }, 'a'), null)
    assert.equal(readEntityOverride({ a: '   ' }, 'a'), null)
  })

  it('ignoriert Werte, die keine Strings sind', () => {
    assert.equal(readEntityOverride({ a: 42 } as never, 'a'), null)
    assert.equal(readEntityOverride({ a: null } as never, 'a'), null)
  })

  it('schneidet Leerzeichen ab', () => {
    assert.equal(readEntityOverride({ a: '  codex  ' }, 'a'), 'codex')
  })
})

describe('withEntityOverride', () => {
  it('setzt einen neuen Eintrag', () => {
    assert.deepEqual(withEntityOverride({}, 'companion', 'codex'), { companion: 'codex' })
  })

  it('loescht den Schluessel bei null, statt ihn zu leeren', () => {
    // Der Unterschied entscheidet: ein leerer Wert waere „Adapter mit leerem
    // Namen", ein fehlender Schluessel ist „keine Praeferenz".
    const out = withEntityOverride({ companion: 'codex', debugger: 'opencode' }, 'companion', null)
    assert.deepEqual(out, { debugger: 'opencode' })
    assert.ok(!('companion' in out))
  })

  it('loescht auch bei einem leeren String', () => {
    assert.deepEqual(withEntityOverride({ a: 'codex' }, 'a', '   '), {})
  })

  it('laesst die Eingabe unveraendert', () => {
    // Der Aufrufer soll die alte Fassung noch haben, wenn das Schreiben scheitert.
    const before = { companion: 'codex' }
    withEntityOverride(before, 'debugger', 'opencode')
    assert.deepEqual(before, { companion: 'codex' })
  })

  it('ueberschreibt einen bestehenden Eintrag', () => {
    assert.deepEqual(withEntityOverride({ a: 'codex' }, 'a', 'opencode'), { a: 'opencode' })
  })

  it('vertraegt eine fehlende Ausgangszuordnung', () => {
    assert.deepEqual(withEntityOverride(undefined, 'a', 'codex'), { a: 'codex' })
    assert.deepEqual(withEntityOverride(undefined, 'a', null), {})
  })

  it('lesen und schreiben passen zusammen', () => {
    const map = withEntityOverride(undefined, 'audit', 'opencode')
    assert.equal(readEntityOverride(map, 'audit'), 'opencode')
    assert.equal(readEntityOverride(withEntityOverride(map, 'audit', null), 'audit'), null)
  })
})
