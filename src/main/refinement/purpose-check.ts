// src/main/refinement/purpose-check.ts — Usage purpose classification + OSS license sondierung
//
// Analyzes project description to suggest usage purpose and license policy.

export type UsagePurpose = 'personal' | 'oss-release' | 'commercial' | 'internal' | 'hobby'

export interface PurposeResult {
  suggestedPurpose: UsagePurpose
  confidence: 'high' | 'medium' | 'low'
  signals: string[]
  licenseRecommendation: string
  licenseNotes: string
}

/** Keyword patterns mapped to usage purposes (checked in order of priority). */
const PURPOSE_PATTERNS: Array<{ purpose: UsagePurpose; keywords: string[]; weight: number }> = [
  {
    purpose: 'commercial',
    keywords: ['kunden', 'customer', 'kommerziell', 'commercial', 'revenue', 'saas', 'b2b', 'b2c', 'monetarisierung', 'pricing', 'bezahlung'],
    weight: 3,
  },
  {
    purpose: 'oss-release',
    keywords: ['open source', 'open-source', 'oss', 'community', 'github release', 'npm publish', 'public repo', 'contributors'],
    weight: 3,
  },
  {
    purpose: 'internal',
    keywords: ['intern', 'internal', 'team', 'abteilung', 'department', 'firmen', 'company tool', 'backoffice'],
    weight: 2,
  },
  {
    purpose: 'personal',
    keywords: ['persoenlich', 'personal', 'fuer mich', 'for myself', 'eigenes tool', 'private use', 'nur ich'],
    weight: 2,
  },
  {
    purpose: 'hobby',
    keywords: ['hobby', 'spass', 'fun', 'experiment', 'spielwiese', 'playground', 'learning', 'lernen', 'ausprobieren'],
    weight: 1,
  },
]

const LICENSE_RECOMMENDATIONS: Record<UsagePurpose, { license: string; notes: string }> = {
  commercial: {
    license: 'Proprietaer oder Apache-2.0 (permissive)',
    notes: 'GPL-Abhaengigkeiten vermeiden oder bewusst evaluieren. Lizenz-Vertraeglichkeit kritisch bei Dependencies.',
  },
  'oss-release': {
    license: 'MIT, Apache-2.0, oder GPL — bewusste Wahl noetig',
    notes: 'Lizenz-Wahl bestimmt Contributions-Bereitschaft und Downstream-Nutzung. CLA pruefen.',
  },
  internal: {
    license: 'Kein Lizenz-Druck extern, aber Compliance je nach Branche',
    notes: 'Dependencies mit restriktiven Lizenzen sind weniger kritisch, solange kein Distribution geplant.',
  },
  personal: {
    license: 'Frei waehlbar, MIT als sicherer Default',
    notes: 'Lizenzen dokumentieren fuer den Fall, dass Projekt spaeter geteilt wird.',
  },
  hobby: {
    license: 'MIT oder Unlicense',
    notes: 'Maximale Freiheit. Trotzdem Dependencies pruefen — Gewohnheit trainieren.',
  },
}

/**
 * Classify usage purpose from project description text.
 *
 * @param description  Project description or requirements text
 * @returns            Purpose classification with license recommendation
 */
export function classifyPurpose(description: string): PurposeResult {
  const lower = description.toLowerCase()
  const scores = new Map<UsagePurpose, { score: number; signals: string[] }>()

  for (const pattern of PURPOSE_PATTERNS) {
    let score = 0
    const signals: string[] = []
    for (const kw of pattern.keywords) {
      if (lower.includes(kw)) {
        score += pattern.weight
        signals.push(kw)
      }
    }
    if (score > 0) {
      scores.set(pattern.purpose, { score, signals })
    }
  }

  // Pick highest scoring purpose
  let best: UsagePurpose = 'personal' // fallback
  let bestScore = 0
  let bestSignals: string[] = []

  for (const [purpose, { score, signals }] of scores) {
    if (score > bestScore) {
      best = purpose
      bestScore = score
      bestSignals = signals
    }
  }

  const confidence: PurposeResult['confidence'] =
    bestScore >= 6 ? 'high'
    : bestScore >= 3 ? 'medium'
    : 'low'

  const rec = LICENSE_RECOMMENDATIONS[best]

  return {
    suggestedPurpose: best,
    confidence,
    signals: bestSignals,
    licenseRecommendation: rec.license,
    licenseNotes: rec.notes,
  }
}
