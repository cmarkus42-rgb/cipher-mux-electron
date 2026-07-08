/**
 * Per-voice pronunciation respellings.
 *
 * A voice may ship a `respellings.json` in its model dir
 * (`vits-piper-<id>/respellings.json`) — a flat map of
 * `{ "term": "respelling", ... }`. Before synthesis text is phonemized,
 * matching whole-word terms are substituted with their respelling so that
 * domain voices (e.g. Cedric) pronounce jargon correctly.
 *
 * Voices without the file are unaffected (the map loads as null → no-op).
 */

import fs from 'node:fs'
import path from 'node:path'

export type RespellingMap = Record<string, string>

// Cache keyed by voice id. `null` means "checked, no file present".
const cache = new Map<string, RespellingMap | null>()

/**
 * Load (and cache) the respellings map for a voice.
 * @param voiceModelDir the voice's model dir (vits-piper-<id>/)
 * @param voiceId cache key (the voice id)
 */
export function loadRespellings(voiceModelDir: string, voiceId: string): RespellingMap | null {
  if (cache.has(voiceId)) return cache.get(voiceId) ?? null

  const file = path.join(voiceModelDir, 'respellings.json')
  let map: RespellingMap | null = null
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        map = parsed as RespellingMap
      }
    }
  } catch {
    // Malformed file → treat as absent (no-op).
    map = null
  }

  cache.set(voiceId, map)
  return map
}

/** Invalidate the cached map for a voice (called when the active voice changes). */
export function invalidateRespellings(voiceId: string): void {
  cache.delete(voiceId)
}

/**
 * Apply a respelling substitution map to text.
 * Terms are matched longest-first, on whole-word boundaries where `/` counts
 * as part of a token (so "CI/CD" is respelled as a unit, "Grower" is left intact).
 * A null map is a no-op.
 */
export function applyRespellings(text: string, map: RespellingMap | null): string {
  if (!map) return text
  const terms = Object.keys(map).sort((a, b) => b.length - a.length) // longest first
  for (const term of terms) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp('(?<![\\w/])' + esc + '(?![\\w/])', 'g') // '/' is part of tokens like CI/CD
    text = text.replace(re, map[term])
  }
  return text
}
