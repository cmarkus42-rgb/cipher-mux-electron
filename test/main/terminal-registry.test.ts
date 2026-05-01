import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  registerTerminal, unregisterTerminal, getTerminal,
  setMarker, getMarker, clearMarker,
} from '../../src/renderer/terminal-registry'

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
})
