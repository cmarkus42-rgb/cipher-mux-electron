import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  applyRespellings,
  loadRespellings,
  invalidateRespellings,
  type RespellingMap,
} from '../../src/main/voice/respellings'

describe('applyRespellings', () => {
  const map: RespellingMap = {
    SAP: 'Es-A-Peh',
    Grow: 'Groh',
    'CI/CD': 'Zeh-I Zeh-Deh',
    Cache: 'Käsch',
  }

  it('applies substitutions to matching whole words', () => {
    const input = 'Der SAP-Job, ein Grow und CI/CD, der Cache.'
    const expected = 'Der Es-A-Peh-Job, ein Groh und Zeh-I Zeh-Deh, der Käsch.'
    assert.equal(applyRespellings(input, map), expected)
  })

  it('is a no-op when the map is null (non-domain voices unaffected)', () => {
    const input = 'Der SAP-Job, ein Grow und CI/CD, der Cache.'
    assert.equal(applyRespellings(input, null), input)
  })

  it('respects whole-word boundaries — "Grower" stays "Grower"', () => {
    assert.equal(applyRespellings('Ein Grower im Grow.', map), 'Ein Grower im Groh.')
  })

  it('treats "/" as part of a token so CI/CD matches as a unit', () => {
    // A bare "CI" should not be rewritten, and "CD/CI" should not partial-match.
    assert.equal(applyRespellings('CI und CD getrennt.', map), 'CI und CD getrennt.')
    assert.equal(applyRespellings('CI/CD-Pipeline', map), 'Zeh-I Zeh-Deh-Pipeline')
  })

  it('applies longest match first', () => {
    const overlap: RespellingMap = { AB: 'x', ABC: 'y' }
    assert.equal(applyRespellings('ABC', overlap), 'y')
  })
})

describe('loadRespellings', () => {
  let dir: string
  const voiceId = 'de_DE-test-medium'

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'respell-'))
    invalidateRespellings(voiceId)
  })

  afterEach(() => {
    invalidateRespellings(voiceId)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when no respellings.json is present', () => {
    assert.equal(loadRespellings(dir, voiceId), null)
  })

  it('loads and returns the map when the file is present', () => {
    fs.writeFileSync(path.join(dir, 'respellings.json'), JSON.stringify({ SAP: 'Es-A-Peh' }))
    const map = loadRespellings(dir, voiceId)
    assert.deepEqual(map, { SAP: 'Es-A-Peh' })
  })

  it('caches by voice id (second call does not re-read a deleted file)', () => {
    fs.writeFileSync(path.join(dir, 'respellings.json'), JSON.stringify({ SAP: 'Es-A-Peh' }))
    loadRespellings(dir, voiceId)
    fs.rmSync(path.join(dir, 'respellings.json'))
    // Still cached from the first load.
    assert.deepEqual(loadRespellings(dir, voiceId), { SAP: 'Es-A-Peh' })
    // After invalidation, re-reads from disk (now absent → null).
    invalidateRespellings(voiceId)
    assert.equal(loadRespellings(dir, voiceId), null)
  })

  it('treats a malformed file as absent (no-op)', () => {
    fs.writeFileSync(path.join(dir, 'respellings.json'), '{ not valid json')
    assert.equal(loadRespellings(dir, voiceId), null)
  })
})
