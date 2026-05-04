/**
 * One-time migration: extract preset.md from entity CLAUDE.md files.
 *
 * For each entity directory under ~/.config/cipher-mux/entities/ that has a
 * CLAUDE.md but no preset.md, strips injected H2 sections (Global Rules,
 * Persona, Workspace Prompt, Context Directories) and writes the remainder
 * as preset.md — the entity's own source-of-truth content.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { configStore } from '../config/config-store'

const ENTITIES_DIR = path.join(os.homedir(), '.config/cipher-mux/entities')

/** H2 section names that are injected at runtime and must be stripped. */
const INJECTED_SECTIONS = [
  'Global Rules',
  'Persona',
  'Workspace Prompt',
  'Context Directories',
]

/**
 * Strip injected H2 sections from CLAUDE.md content.
 * Each section runs from its `## Title` line to the next `## ` or EOF.
 */
export function stripInjectedSections(content: string): string {
  let result = content
  for (const section of INJECTED_SECTIONS) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match ## <Section> (possibly with trailing whitespace) until next ## or end of string.
    // Uses (?=^## ) for next heading, with a separate replace for trailing-section case.
    const pattern = new RegExp(
      `^## ${escaped}[^\\S\\n]*\\n[\\s\\S]*?(?=^## )`,
      'gm',
    )
    result = result.replace(pattern, '')
    // Handle case where the injected section is the last section (no following ##)
    const tailPattern = new RegExp(
      `^## ${escaped}[^\\S\\n]*\\n[\\s\\S]*$`,
      'gm',
    )
    result = result.replace(tailPattern, '')
  }
  return result.trim()
}

/**
 * Run the preset migration if it hasn't been done yet.
 * Idempotent — sets configStore.presetMigrationDone = true on completion.
 */
export function migratePresetsIfNeeded(): void {
  if (configStore.get('presetMigrationDone')) return

  if (!fs.existsSync(ENTITIES_DIR)) {
    configStore.set('presetMigrationDone', true)
    return
  }

  const entries = fs.readdirSync(ENTITIES_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const entityDir = path.join(ENTITIES_DIR, entry.name)
    const presetPath = path.join(entityDir, 'preset.md')
    const claudeMdPath = path.join(entityDir, 'CLAUDE.md')

    // Skip if preset.md already exists or CLAUDE.md is missing
    if (fs.existsSync(presetPath)) continue
    if (!fs.existsSync(claudeMdPath)) continue

    const claudeMd = fs.readFileSync(claudeMdPath, 'utf-8')
    const presetContent = stripInjectedSections(claudeMd)

    if (presetContent.length > 0) {
      fs.writeFileSync(presetPath, presetContent + '\n', 'utf-8')
    }
  }

  configStore.set('presetMigrationDone', true)
}
