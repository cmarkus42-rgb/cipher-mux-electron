// src/main/session/persona-resolver.ts — Persona resolution for session startup
//
// Resolution hierarchy (highest wins):
//   1. Global active persona (user override across all presets)
//   2. Preset-specific persona assignment (defaultPersonaId or personaIdOverride)
//   3. Hardcoded fallback: Relay

import type { Character } from '../../shared/types'
import { DEFAULT_CHARACTER_ID, SEED_CHARACTERS } from '../character/character-defaults'

/** Default persona assignment per preset (from Pack spec 16-persona-presets.md). */
export const PRESET_PERSONA_DEFAULTS: Record<string, string> = {
  companion: 'sokrates',
  'cyber-factory': 'cipher',
  refinement: 'sokrates',
  'ideation-partner': 'sokrates',
  debugger: 'cipher',
  'testing-assistant': 'cipher',
  audit: 'relay',
  'voice-relay': 'relay',
  orchestrator: 'relay',
  mpo: 'relay',
  launcher: 'relay',
}

export interface PersonaResolverDeps {
  getCharacters(): Character[]
  getActiveCharacterId(): string
  getGlobalActivePersonaId(): string | null
}

/**
 * resolvePersonaForPreset — determines which Character to inject for a given preset.
 *
 * @param presetId   The entity/preset ID (e.g. 'cyber-factory', 'companion')
 * @param deps       Access to character store state
 * @param overrideId Optional per-preset persona override (from ConfigStore)
 * @returns          The resolved Character
 */
export function resolvePersonaForPreset(
  presetId: string,
  deps: PersonaResolverDeps,
  overrideId?: string | null,
): Character {
  const characters = deps.getCharacters()

  // Priority 1: Global active persona override
  const globalId = deps.getGlobalActivePersonaId()
  if (globalId) {
    const global = characters.find(c => c.id === globalId)
    if (global) return global
  }

  // Priority 2: Preset-specific override (user chose via dropdown)
  if (overrideId) {
    const override = characters.find(c => c.id === overrideId)
    if (override) return override
  }

  // Priority 2b: Preset default from matrix
  const defaultId = PRESET_PERSONA_DEFAULTS[presetId]
  if (defaultId) {
    const defaultChar = characters.find(c => c.id === defaultId)
    if (defaultChar) return defaultChar
  }

  // Priority 3: Hardcoded fallback (Relay)
  const fallback = characters.find(c => c.id === DEFAULT_CHARACTER_ID)
  if (fallback) return fallback

  // Emergency fallback: first seed character
  return SEED_CHARACTERS[0]
}
