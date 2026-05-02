// src/main/ideation-partner/skill-registry.ts — Known ideation skills registry
//
// Lists available ideation skills and checks if their markdown files exist.

import * as fs from 'fs'
import * as path from 'path'

export interface IdeationSkill {
  id: string
  name: string
  description: string
  /** When to suggest this skill during ideation. */
  suggestWhen: string
}

/** Built-in ideation skills from the Pack spec. */
export const KNOWN_SKILLS: IdeationSkill[] = [
  {
    id: 'persona-roundtable',
    name: 'Persona Roundtable',
    description: 'Stakeholder-Perspektiven einholen: verschiedene Nutzer-Typen bewerten die Idee.',
    suggestWhen: 'Zielgruppe unklar oder "fuer alle"',
  },
  {
    id: 'pre-mortem',
    name: 'Pre-Mortem',
    description: 'Scheitern in 2 Jahren simulieren, Gruende gewichten, Vorkehrungen ableiten.',
    suggestWhen: 'Idee klingt zu rund, keine Einwaende sichtbar',
  },
  {
    id: 'future-backwards',
    name: 'Future Backwards',
    description: 'Endzustand in 3-5 Jahren definieren, rueckwaerts planen.',
    suggestWhen: 'Ambition pruefen bei grossen Projekten',
  },
  {
    id: 'oss-telescope',
    name: 'OSS Telescope',
    description: 'Open-Source-Bausteine kartieren, Lizenzen pruefen, Adoption bewerten.',
    suggestWhen: 'Loesungslandschaft kartieren, vor Build-vs-Buy-Entscheidung',
  },
  {
    id: 'external-review',
    name: 'External Review',
    description: 'Frische-Session-Review: Verstaendlichkeit und Kohaerenz pruefen lassen.',
    suggestWhen: 'Vor v1.0-Release oder nach grosser Konzept-Aenderung',
  },
]

/**
 * List all available skills, with existence check against skillsDir.
 *
 * @param skillsDir  Directory where skill markdown files live
 * @returns          Skills with `available` flag based on file existence
 */
export function listSkills(skillsDir: string): Array<IdeationSkill & { available: boolean; filepath: string | null }> {
  return KNOWN_SKILLS.map(skill => {
    const filepath = path.join(skillsDir, `${skill.id}.md`)
    const available = fs.existsSync(filepath)
    return { ...skill, available, filepath: available ? filepath : null }
  })
}

/**
 * Read a skill's markdown content.
 *
 * @param skillsDir  Directory where skill markdown files live
 * @param skillId    Skill ID (e.g. 'pre-mortem')
 * @returns          Markdown content or null if not found
 */
export function readSkill(skillsDir: string, skillId: string): string | null {
  const skill = KNOWN_SKILLS.find(s => s.id === skillId)
  if (!skill) return null

  const filepath = path.join(skillsDir, `${skillId}.md`)
  try {
    return fs.readFileSync(filepath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Suggest skills based on ideation phase and context signals.
 *
 * @param phase  Current ideation phase (0-4)
 * @returns      Suggested skill IDs for the current phase
 */
export function suggestSkillsForPhase(phase: number): string[] {
  switch (phase) {
    case 1: return ['oss-telescope'] // Recherche
    case 2: return ['persona-roundtable'] // Fokussierung — Zielgruppe klaeren
    case 3: return ['pre-mortem', 'future-backwards', 'external-review'] // Robustheits-Gate
    default: return []
  }
}
