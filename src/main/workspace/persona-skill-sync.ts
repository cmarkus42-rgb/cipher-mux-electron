// src/main/workspace/persona-skill-sync.ts — Sync persona definitions to .claude/skills/personas/

import type { Persona } from '../../shared/persona-types'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * generateSkillContent — Generates a markdown SKILL.md for a given persona.
 *
 * Returns null for the 'empty' persona or any persona with a whitespace-only
 * defaultPrompt. Otherwise returns a fully-formed skill markdown file.
 */
export function generateSkillContent(persona: Persona): string | null {
  if (persona.id === 'empty') {
    return null
  }

  if (persona.defaultPrompt.trim() === '') {
    return null
  }

  return `---
name: persona-${persona.id}
description: Load the ${persona.name} persona into the current session
---

# Persona: ${persona.name}

You are now operating as **${persona.name}**.

${persona.defaultPrompt}
`
}

/**
 * syncPersonaSkills — Synchronises .claude/skills/personas/ with the current persona list.
 *
 * - Creates skillsDir if it does not exist.
 * - For each persona where generateSkillContent() returns non-null:
 *     - Creates persona-{id}/ directory under skillsDir
 *     - Writes SKILL.md inside it
 *     - Skips write if content is unchanged (avoids unnecessary disk writes / mtime churn)
 * - Removes any persona-* directories in skillsDir that don't correspond to a current persona.
 */
export function syncPersonaSkills(personas: Persona[], skillsDir: string): void {
  // Ensure the skills directory exists
  fs.mkdirSync(skillsDir, { recursive: true })

  // Build set of expected dir names for personas that have skill content
  const expectedDirs = new Set<string>()

  for (const persona of personas) {
    const content = generateSkillContent(persona)
    if (content === null) {
      continue
    }

    const dirName = `persona-${persona.id}`
    expectedDirs.add(dirName)

    const personaDir = path.join(skillsDir, dirName)
    fs.mkdirSync(personaDir, { recursive: true })

    const skillFile = path.join(personaDir, 'SKILL.md')

    // Only write if content differs from what's already on disk
    let existingContent: string | null = null
    try {
      existingContent = fs.readFileSync(skillFile, 'utf8')
    } catch {
      // File doesn't exist yet — that's fine
    }

    if (existingContent !== content) {
      fs.writeFileSync(skillFile, content, 'utf8')
    }
  }

  // Remove stale persona-* directories
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith('persona-')) continue
    if (!expectedDirs.has(entry.name)) {
      fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true })
    }
  }
}
