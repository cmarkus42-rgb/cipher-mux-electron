import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Terminal } from '@xterm/xterm'
import {
  registerTerminal, unregisterTerminal, getTerminal,
  setMarker, getMarker, clearMarker, clearAllTextureAtlases,
} from '../../src/renderer/terminal-registry'

/** Terminal-Attrappe, die nur `clearTextureAtlas` traegt. */
function atlasStub(clear: () => unknown): Terminal {
  return { clearTextureAtlas: clear } as unknown as Terminal
}

// Minimal Terminal stub — only the fields the registry cares about
function makeTermStub() {
  return { buffer: { active: { baseY: 0, cursorY: 0 } } } as any
}

describe('terminal-registry', () => {
  beforeEach(() => {
    unregisterTerminal('s1')
    unregisterTerminal('s2')
    clearMarker('s1')
    clearMarker('s2')
  })

  it('registers and retrieves a terminal', () => {
    const term = makeTermStub()
    registerTerminal('s1', term)
    assert.equal(getTerminal('s1'), term)
  })

  it('returns undefined for unregistered session', () => {
    assert.equal(getTerminal('unknown'), undefined)
  })

  it('unregisters a terminal', () => {
    const term = makeTermStub()
    registerTerminal('s1', term)
    unregisterTerminal('s1')
    assert.equal(getTerminal('s1'), undefined)
  })

  it('stores and retrieves a marker', () => {
    setMarker('s1', 42)
    assert.equal(getMarker('s1'), 42)
  })

  it('returns undefined for missing marker', () => {
    assert.equal(getMarker('s1'), undefined)
  })

  it('clears a marker', () => {
    setMarker('s1', 10)
    clearMarker('s1')
    assert.equal(getMarker('s1'), undefined)
  })

  it('overwrites marker on repeated set', () => {
    setMarker('s1', 10)
    setMarker('s1', 99)
    assert.equal(getMarker('s1'), 99)
  })

  // xterm teilt den Glyphen-Atlas zwischen allen Terminals gleicher Schrift, Groesse,
  // Theme und DPR. Verwirft ihn eines allein, behalten die anderen ihre alten
  // Texturkoordinaten und zeigen fremde Glyphen. Deshalb nur alle zusammen.
  it('verwirft den Atlas fuer jedes registrierte Terminal', () => {
    const aufrufe: string[] = []
    registerTerminal('s1', atlasStub(() => aufrufe.push('s1')))
    registerTerminal('s2', atlasStub(() => aufrufe.push('s2')))
    clearAllTextureAtlases()
    assert.deepEqual(aufrufe.sort(), ['s1', 's2'])
  })

  it('ein Terminal ohne Atlas haelt die anderen nicht auf', () => {
    const aufrufe: string[] = []
    registerTerminal('s1', atlasStub(() => { throw new Error('kein Atlas') }))
    registerTerminal('s2', atlasStub(() => aufrufe.push('s2')))
    assert.doesNotThrow(() => clearAllTextureAtlases())
    assert.deepEqual(aufrufe, ['s2'])
  })
})
