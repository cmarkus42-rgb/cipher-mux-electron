/**
 * Ausnahmeliste der CLAUDE.md-Montage (`assembleEntityClaudeMd` im
 * SessionManager). Rein und wurffrei, weil sie in der Init-Kette liegt.
 *
 * - voice-relay und bugreport sprechen per TTS als Hauptkanal — ein
 *   Voice-Output-Abschnitt wäre dort doppelt.
 * - local-worker (Ruling R16) ist ein lokales Modell mit kleinem Kontext, das
 *   genau einen Auftrag abarbeitet: Persona, Voice und Global Rules wären
 *   Rauschen, und die Global Rules nennen Werkzeuge und Abläufe, die der
 *   Worker nicht hat.
 */

export interface ClaudeMdExemptions {
  persona: boolean
  voiceOutput: boolean
  globalRules: boolean
}

const TTS_PRIMARY = new Set(['voice-relay', 'bugreport'])
const BARE = new Set(['local-worker'])

export function claudeMdExemptions(entityId: string): ClaudeMdExemptions {
  const bare = BARE.has(entityId)
  return {
    persona: bare,
    voiceOutput: bare || TTS_PRIMARY.has(entityId),
    globalRules: bare,
  }
}
