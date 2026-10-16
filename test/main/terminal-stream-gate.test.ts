import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { StreamGate } from '../../src/shared/terminal-resync'

/**
 * Das Tor zwischen Livestream und Neuaufbau. Die Faelle sind genau die zwei, die
 * im Mux Reste im Eingabefeld stehen liessen: ein Stueck doppelt, eines verloren.
 */
function setup() {
  const out: string[] = []
  const gate = new StreamGate((d) => out.push(d))
  return { out, gate }
}

describe('StreamGate', () => {
  it('ohne Neuaufbau geht jedes Stueck sofort durch', () => {
    const { out, gate } = setup()
    gate.data(1, 'a')
    gate.data(2, 'b')
    assert.deepEqual(out, ['a', 'b'])
  })

  it('waehrend des Neuaufbaus wird gesammelt, nicht geschrieben', () => {
    const { out, gate } = setup()
    gate.hold()
    gate.data(1, 'a')
    assert.deepEqual(out, [])
  })

  it('was schon im Schnappschuss steckt, wird nicht noch einmal angewendet', () => {
    const { out, gate } = setup()
    const t = gate.hold()
    gate.data(4, 'drin')
    gate.data(5, 'danach')
    gate.release(t, { seq: 4, rewrite: () => out.push('SNAP') })
    assert.deepEqual(out, ['SNAP', 'danach'])
  })

  it('was nach dem Schnappschuss kam, geht nicht verloren — auch nach der Freigabe', () => {
    const { out, gate } = setup()
    const t = gate.hold()
    gate.release(t, { seq: 4, rewrite: () => out.push('SNAP') })
    gate.data(5, 'spaet')
    assert.deepEqual(out, ['SNAP', 'spaet'])
  })

  it('ein verspaetetes Stueck aus dem Schnappschuss wird verworfen', () => {
    const { out, gate } = setup()
    const t = gate.hold()
    gate.release(t, { seq: 4, rewrite: () => out.push('SNAP') })
    gate.data(3, 'alt')
    assert.deepEqual(out, ['SNAP'])
  })

  it('der Neuaufbau schreibt vor dem Gesammelten', () => {
    const { out, gate } = setup()
    const t = gate.hold()
    gate.data(9, 'x')
    gate.release(t, { seq: 8, rewrite: () => out.push('SNAP') })
    assert.equal(out[0], 'SNAP')
  })

  it('ohne Schnitt (leerer Schnappschuss, Fehler) wird alles Gesammelte geschrieben', () => {
    const { out, gate } = setup()
    const t = gate.hold()
    gate.data(1, 'a')
    gate.data(2, 'b')
    gate.release(t)
    assert.deepEqual(out, ['a', 'b'])
    gate.data(1, 'nochmal')
    assert.deepEqual(out, ['a', 'b', 'nochmal'], 'ohne Schnitt wird nichts verworfen')
  })

  it('bei zwei Neuaufbauten gilt nur der juengste', () => {
    const { out, gate } = setup()
    const alt = gate.hold()
    gate.data(1, 'a')
    const neu = gate.hold()
    gate.data(2, 'b')
    assert.equal(gate.release(alt, { seq: 1, rewrite: () => out.push('ALT') }), false)
    assert.deepEqual(out, [], 'der aeltere darf weder schreiben noch freigeben')
    assert.equal(gate.release(neu, { seq: 1, rewrite: () => out.push('NEU') }), true)
    assert.deepEqual(out, ['NEU', 'b'])
  })

  it('ein Stueck ohne Nummer gilt als neu', () => {
    const { out, gate } = setup()
    const t = gate.hold()
    gate.release(t, { seq: 10, rewrite: () => {} })
    gate.data(undefined, 'x')
    assert.deepEqual(out, ['x'])
  })
})
