import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readEntityAdapter, withEntityAdapter } from '../../src/main/agent/entity-adapter-map'

describe('readEntityAdapter', () => {
  it('liefert den gesetzten Adapter', () => {
    assert.equal(readEntityAdapter({ 'testing-assistant': 'codex' }, 'testing-assistant'), 'codex')
  })

  it('liefert null fuer eine Rolle ohne Eintrag', () => {
    assert.equal(readEntityAdapter({ debugger: 'codex' }, 'companion'), null)
  })

  it('liefert null statt zu werfen, wenn die Zuordnung fehlt', () => {
    // Die Config ist JSON auf der Platte und von Hand editierbar.
    assert.equal(readEntityAdapter(undefined, 'companion'), null)
    assert.equal(readEntityAdapter({} as never, 'companion'), null)
  })

  it('behandelt leere und reine Leerzeichen-Werte als keine Praeferenz', () => {
    // So raeumt eine UI ein Feld. Ein Adapter namens "" steht in keiner Registry.
    assert.equal(readEntityAdapter({ a: '' }, 'a'), null)
    assert.equal(readEntityAdapter({ a: '   ' }, 'a'), null)
  })

  it('ignoriert Werte, die keine Strings sind', () => {
    assert.equal(readEntityAdapter({ a: 42 } as never, 'a'), null)
    assert.equal(readEntityAdapter({ a: null } as never, 'a'), null)
  })

  it('schneidet Leerzeichen ab', () => {
    assert.equal(readEntityAdapter({ a: '  codex  ' }, 'a'), 'codex')
  })
})

describe('withEntityAdapter', () => {
  it('setzt einen neuen Eintrag', () => {
    assert.deepEqual(withEntityAdapter({}, 'companion', 'codex'), { companion: 'codex' })
  })

  it('loescht den Schluessel bei null, statt ihn zu leeren', () => {
    // Der Unterschied entscheidet: ein leerer Wert waere „Adapter mit leerem
    // Namen", ein fehlender Schluessel ist „keine Praeferenz".
    const out = withEntityAdapter({ companion: 'codex', debugger: 'opencode' }, 'companion', null)
    assert.deepEqual(out, { debugger: 'opencode' })
    assert.ok(!('companion' in out))
  })

  it('loescht auch bei einem leeren String', () => {
    assert.deepEqual(withEntityAdapter({ a: 'codex' }, 'a', '   '), {})
  })

  it('laesst die Eingabe unveraendert', () => {
    // Der Aufrufer soll die alte Fassung noch haben, wenn das Schreiben scheitert.
    const before = { companion: 'codex' }
    withEntityAdapter(before, 'debugger', 'opencode')
    assert.deepEqual(before, { companion: 'codex' })
  })

  it('ueberschreibt einen bestehenden Eintrag', () => {
    assert.deepEqual(withEntityAdapter({ a: 'codex' }, 'a', 'opencode'), { a: 'opencode' })
  })

  it('vertraegt eine fehlende Ausgangszuordnung', () => {
    assert.deepEqual(withEntityAdapter(undefined, 'a', 'codex'), { a: 'codex' })
    assert.deepEqual(withEntityAdapter(undefined, 'a', null), {})
  })

  it('lesen und schreiben passen zusammen', () => {
    const map = withEntityAdapter(undefined, 'audit', 'opencode')
    assert.equal(readEntityAdapter(map, 'audit'), 'opencode')
    assert.equal(readEntityAdapter(withEntityAdapter(map, 'audit', null), 'audit'), null)
  })
})
