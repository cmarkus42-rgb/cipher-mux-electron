import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePersonaForPreset,
  PRESET_PERSONA_DEFAULTS,
  type PersonaResolverDeps,
} from '../../src/main/session/persona-resolver'
import { SEED_CHARACTERS } from '../../src/main/character/character-defaults'

function makeDeps(overrides: Partial<PersonaResolverDeps> = {}): PersonaResolverDeps {
  return {
    getCharacters: () => [...SEED_CHARACTERS],
    getActiveCharacterId: () => 'relay',
    getGlobalActivePersonaId: () => null,
    ...overrides,
  }
}

describe('resolvePersonaForPreset', () => {
  it('returns default persona from matrix when no overrides', () => {
    const deps = makeDeps()
    const result = resolvePersonaForPreset('cyber-factory', deps)
    assert.equal(result.id, 'cipher', 'cyber-factory default should be cipher')
  })

  it('returns theaitetos for companion by default', () => {
    const deps = makeDeps()
    const result = resolvePersonaForPreset('companion', deps)
    assert.equal(result.id, 'theaitetos')
  })

  it('returns relay for audit by default', () => {
    const deps = makeDeps()
    const result = resolvePersonaForPreset('audit', deps)
    assert.equal(result.id, 'relay')
  })

  it('global persona overrides preset default', () => {
    const deps = makeDeps({ getGlobalActivePersonaId: () => 'kyniker' })
    const result = resolvePersonaForPreset('cyber-factory', deps)
    assert.equal(result.id, 'kyniker', 'global should win over preset default')
  })

  it('global persona overrides per-preset override', () => {
    const deps = makeDeps({ getGlobalActivePersonaId: () => 'glitch' })
    const result = resolvePersonaForPreset('companion', deps, 'wayne')
    assert.equal(result.id, 'glitch', 'global should win over per-preset override')
  })

  it('per-preset override wins over default matrix', () => {
    const deps = makeDeps()
    const result = resolvePersonaForPreset('cyber-factory', deps, 'wayne')
    assert.equal(result.id, 'wayne', 'override should win over default cipher')
  })

  it('falls back to relay for unknown preset', () => {
    const deps = makeDeps()
    const result = resolvePersonaForPreset('unknown-preset', deps)
    assert.equal(result.id, 'relay', 'unknown preset should fall back to relay')
  })

  it('falls back to relay when override ID not found', () => {
    const deps = makeDeps()
    const result = resolvePersonaForPreset('unknown-preset', deps, 'nonexistent-persona')
    assert.equal(result.id, 'relay')
  })

  it('falls back to relay when global ID not found in characters', () => {
    const deps = makeDeps({ getGlobalActivePersonaId: () => 'deleted-persona' })
    const result = resolvePersonaForPreset('cyber-factory', deps)
    assert.equal(result.id, 'cipher', 'should fall through to preset default when global not found')
  })

  it('PRESET_PERSONA_DEFAULTS covers all expected presets', () => {
    const expected = [
      'companion', 'cyber-factory', 'refinement', 'ideation-partner',
      'debugger', 'testing-assistant', 'audit', 'voice-relay',
      'orchestrator', 'launcher',
    ]
    for (const preset of expected) {
      assert.ok(
        PRESET_PERSONA_DEFAULTS[preset],
        `${preset} should have a default persona mapping`
      )
    }
  })
})
