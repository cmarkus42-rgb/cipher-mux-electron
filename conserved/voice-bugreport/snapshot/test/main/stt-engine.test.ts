import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { filterHallucinations, isNoiseOnly } from '../../src/main/voice/stt-engine'

describe('STT Engine — hallucination filtering', () => {
  it('detects hallucination patterns', () => {
    assert.equal(filterHallucinations('[Musik]'), '')
    assert.equal(filterHallucinations('(Gesang)'), '')
    assert.equal(filterHallucinations('♪ lalala ♪'), '')
    assert.equal(filterHallucinations('Vielen Dank'), '')
    assert.equal(filterHallucinations('Thanks for watching'), '')
    assert.equal(filterHallucinations('Untertitel'), '')
    assert.equal(filterHallucinations('...'), '')
    assert.equal(filterHallucinations('SWR'), '')
  })
  it('passes valid transcriptions through', () => {
    assert.equal(filterHallucinations('Der Button funktioniert nicht'), 'Der Button funktioniert nicht')
    assert.equal(filterHallucinations('Hallo, ich habe einen Bug gefunden'), 'Hallo, ich habe einen Bug gefunden')
  })
})

describe('STT Engine — noise filtering', () => {
  it('rejects punctuation-only text', () => {
    assert.equal(isNoiseOnly('...'), true)
    assert.equal(isNoiseOnly('. . .'), true)
    assert.equal(isNoiseOnly('!?'), true)
    assert.equal(isNoiseOnly('— —'), true)
  })
  it('rejects too-short text', () => {
    assert.equal(isNoiseOnly('a'), true)
    assert.equal(isNoiseOnly(''), true)
  })
  it('accepts normal text', () => {
    assert.equal(isNoiseOnly('Hallo'), false)
    assert.equal(isNoiseOnly('Bug Report'), false)
  })
})
