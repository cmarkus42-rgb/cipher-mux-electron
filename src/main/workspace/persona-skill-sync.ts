// src/main/workspace/persona-skill-sync.ts — Sync active character as SKILL.md

import type { Character } from '../../shared/types'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * generateCharacterSkillContent — Generates a markdown SKILL.md for the active character.
 *
 * Returns null if prompt is empty/whitespace.
 */
export function generateCharacterSkillContent(character: Character): string | null {
  if (character.prompt.trim() === '') {
    return null
  }

  return `---
name: companion-persona
description: Active companion persona — ${character.name}
---

${character.prompt}
`
}

/**
 * syncCharacterSkill — Writes a single SKILL.md for the active companion character.
 *
 * - Creates skillsDir if it does not exist.
 * - Writes companion-persona/SKILL.md with the active character's prompt.
 * - Removes any old persona-* directories (legacy cleanup).
 * - Skips write if content is unchanged.
 */
export function syncCharacterSkill(character: Character, skillsDir: string): void {
  fs.mkdirSync(skillsDir, { recursive: true })

  const dirName = 'companion-persona'
  const personaDir = path.join(skillsDir, dirName)
  fs.mkdirSync(personaDir, { recursive: true })

  const content = generateCharacterSkillContent(character)
  const skillFile = path.join(personaDir, 'SKILL.md')

  if (content === null) {
    // Remove skill file if character has no prompt
    try { fs.unlinkSync(skillFile) } catch { /* ok */ }
    return
  }

  // Only write if content differs
  let existingContent: string | null = null
  try {
    existingContent = fs.readFileSync(skillFile, 'utf8')
  } catch { /* ok */ }

  if (existingContent !== content) {
    fs.writeFileSync(skillFile, content, 'utf8')
  }

  // Clean up old persona-* directories (legacy)
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('persona-')) {
      fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true })
    }
  }
}

// ── Legacy API (kept for backward compat with existing tests) ──

import type { Persona } from '../../shared/persona-types'

/** @deprecated Use generateCharacterSkillContent instead */
export function generateSkillContent(persona: Persona): string | null {
  if (persona.id === 'empty') return null
  if (persona.defaultPrompt.trim() === '') return null

  return `---
name: persona-${persona.id}
description: Load the ${persona.name} persona into the current session
---

# Persona: ${persona.name}

You are now operating as **${persona.name}**.

${persona.defaultPrompt}
`
}

/** @deprecated Use syncCharacterSkill instead */
export function syncPersonaSkills(personas: Persona[], skillsDir: string): void {
  fs.mkdirSync(skillsDir, { recursive: true })
  const expectedDirs = new Set<string>()

  for (const persona of personas) {
    const content = generateSkillContent(persona)
    if (content === null) continue

    const dirName = `persona-${persona.id}`
    expectedDirs.add(dirName)
    const personaDir = path.join(skillsDir, dirName)
    fs.mkdirSync(personaDir, { recursive: true })
    const skillFile = path.join(personaDir, 'SKILL.md')

    let existingContent: string | null = null
    try { existingContent = fs.readFileSync(skillFile, 'utf8') } catch { /* ok */ }
    if (existingContent !== content) {
      fs.writeFileSync(skillFile, content, 'utf8')
    }
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith('persona-')) continue
    if (!expectedDirs.has(entry.name)) {
      fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true })
    }
  }
}
