import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { claudeMdExemptions } from '../../src/main/session/entity-claudemd-exemptions'

describe('CLAUDE.md-Montage — Ausnahmeliste', () => {
  it('voice-relay und bugreport: ohne Voice Output, mit Persona und Global Rules (wie bisher)', () => {
    for (const id of ['voice-relay', 'bugreport']) {
      assert.deepEqual(claudeMdExemptions(id), { persona: false, voiceOutput: true, globalRules: false })
    }
  })
  it('local-worker (R16): ohne Persona, Voice Output und Global Rules', () => {
    assert.deepEqual(claudeMdExemptions('local-worker'), { persona: true, voiceOutput: true, globalRules: true })
  })
  it('jede andere Rolle bekommt alles', () => {
    for (const id of ['companion', 'local-factory', 'workshop']) {
      assert.deepEqual(claudeMdExemptions(id), { persona: false, voiceOutput: false, globalRules: false })
    }
  })
})
