#!/usr/bin/env npx tsx
/**
 * migrate-to-cyber-factory.ts — Welle 5 Cutover migration
 *
 * Usage:
 *   npx tsx scripts/migrate-to-cyber-factory.ts [--reverse] [--dry-run] [--config <path>]
 *
 * Transforms user config from MPO/Watchdog naming to Cyber Factory/Testing Assistant.
 * --reverse: undo the migration
 * --dry-run: print what would change without writing
 * --config:  path to config.json (default: ~/.config/cipher-mux/config.json)
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface MigrationResult {
  changes: string[]
  warnings: string[]
}

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'cipher-mux', 'config.json')

function readConfig(configPath: string): Record<string, any> {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

function writeConfig(configPath: string, config: Record<string, any>): void {
  const backupPath = configPath + '.pre-cutover-backup'
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(configPath, backupPath)
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

function renameKey(
  obj: Record<string, any>,
  oldKey: string,
  newKey: string,
  result: MigrationResult,
  context: string,
): void {
  if (oldKey in obj && !(newKey in obj)) {
    obj[newKey] = obj[oldKey]
    delete obj[oldKey]
    result.changes.push(`${context}: renamed "${oldKey}" -> "${newKey}"`)
  } else if (oldKey in obj && newKey in obj) {
    delete obj[oldKey]
    result.changes.push(`${context}: removed "${oldKey}" (new key "${newKey}" already exists)`)
  }
}

export function migrateForward(config: Record<string, any>): MigrationResult {
  const result: MigrationResult = { changes: [], warnings: [] }

  // 1. ConfigStore section: mpo -> cyber_factory
  if (config.mpo && !config.cyber_factory) {
    config.cyber_factory = config.mpo
    delete config.mpo
    result.changes.push('config section: mpo -> cyber_factory')
  } else if (config.mpo && config.cyber_factory) {
    delete config.mpo
    result.changes.push('config section: removed mpo (cyber_factory already exists)')
  }

  // 2. Workspaces: persona renaming in cells + promptOverrides
  if (Array.isArray(config.workspaces)) {
    for (const ws of config.workspaces) {
      if (Array.isArray(ws.cells)) {
        for (const cell of ws.cells) {
          if (cell.persona === 'mpo') {
            cell.persona = 'cyber-factory'
            result.changes.push(`workspace "${ws.name}": cell persona mpo -> cyber-factory`)
          }
          if (cell.persona === 'watchdog') {
            cell.persona = 'testing-assistant'
            result.changes.push(`workspace "${ws.name}": cell persona watchdog -> testing-assistant`)
          }
        }
      }
      if (ws.promptOverrides) {
        renameKey(ws.promptOverrides, 'mpo', 'cyber-factory', result, `workspace "${ws.name}" promptOverrides`)
        renameKey(ws.promptOverrides, 'watchdog', 'testing-assistant', result, `workspace "${ws.name}" promptOverrides`)
      }
    }
  }

  // 3. Entity-related maps: sortOrders, hidden, personaOverrides
  for (const mapKey of ['entitySortOrders', 'entityHidden', 'entityPersonaOverrides']) {
    if (config[mapKey]) {
      renameKey(config[mapKey], 'mpo', 'cyber-factory', result, mapKey)
      renameKey(config[mapKey], 'watchdog', 'testing-assistant', result, mapKey)
    }
  }

  // 4. Feature flags: ensure experimental defaults
  if (!config.experimental) config.experimental = {}
  const exp = config.experimental
  const flagDefaults: Record<string, boolean> = {
    refinement_v2: true,
    ideation_partner: true,
    cyber_factory: true,
    testing_assistant: true,
    audit_full: true,
  }
  for (const [key, val] of Object.entries(flagDefaults)) {
    if (!(key in exp)) {
      exp[key] = val
      result.changes.push(`experimental.${key}: set to ${val}`)
    }
  }

  // 5. Module enables
  if (config.debugger && !config.debugger.enabled) {
    config.debugger.enabled = true
    result.changes.push('debugger.enabled: false -> true')
  }
  if (config.testing_assistant && !config.testing_assistant.enabled) {
    config.testing_assistant.enabled = true
    result.changes.push('testing_assistant.enabled: false -> true')
  }
  if (config.audit_config && !config.audit_config.enabled) {
    config.audit_config.enabled = true
    result.changes.push('audit_config.enabled: false -> true')
  }

  if (result.changes.length === 0) {
    result.warnings.push('No changes needed — config already migrated')
  }

  return result
}

export function migrateReverse(config: Record<string, any>): MigrationResult {
  const result: MigrationResult = { changes: [], warnings: [] }

  // 1. cyber_factory -> mpo
  if (config.cyber_factory && !config.mpo) {
    config.mpo = config.cyber_factory
    delete config.cyber_factory
    result.changes.push('config section: cyber_factory -> mpo')
  }

  // 2. Workspaces: reverse persona renaming
  if (Array.isArray(config.workspaces)) {
    for (const ws of config.workspaces) {
      if (Array.isArray(ws.cells)) {
        for (const cell of ws.cells) {
          if (cell.persona === 'cyber-factory') {
            cell.persona = 'mpo'
            result.changes.push(`workspace "${ws.name}": cell persona cyber-factory -> mpo`)
          }
          if (cell.persona === 'testing-assistant') {
            cell.persona = 'watchdog'
            result.changes.push(`workspace "${ws.name}": cell persona testing-assistant -> watchdog`)
          }
        }
      }
      if (ws.promptOverrides) {
        renameKey(ws.promptOverrides, 'cyber-factory', 'mpo', result, `workspace "${ws.name}" promptOverrides`)
        renameKey(ws.promptOverrides, 'testing-assistant', 'watchdog', result, `workspace "${ws.name}" promptOverrides`)
      }
    }
  }

  // 3. Entity maps
  for (const mapKey of ['entitySortOrders', 'entityHidden', 'entityPersonaOverrides']) {
    if (config[mapKey]) {
      renameKey(config[mapKey], 'cyber-factory', 'mpo', result, mapKey)
      renameKey(config[mapKey], 'testing-assistant', 'watchdog', result, mapKey)
    }
  }

  // 4. Experimental flags: revert to old defaults
  if (config.experimental) {
    const revert: Record<string, boolean> = {
      refinement_v2: false,
      ideation_partner: false,
      testing_assistant: false,
      audit_full: false,
    }
    for (const [key, val] of Object.entries(revert)) {
      if (key in config.experimental) {
        config.experimental[key] = val
        result.changes.push(`experimental.${key}: reverted to ${val}`)
      }
    }
    // cyber_factory stays true (it was already true pre-cutover)
  }

  // 5. Module disables
  if (config.debugger) { config.debugger.enabled = false; result.changes.push('debugger.enabled -> false') }
  if (config.testing_assistant) { config.testing_assistant.enabled = false; result.changes.push('testing_assistant.enabled -> false') }
  if (config.audit_config) { config.audit_config.enabled = false; result.changes.push('audit_config.enabled -> false') }

  if (result.changes.length === 0) {
    result.warnings.push('No changes needed — config already in pre-cutover state')
  }

  return result
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2)
  const reverse = args.includes('--reverse')
  const dryRun = args.includes('--dry-run')
  const configIdx = args.indexOf('--config')
  const configPath = configIdx >= 0 && args[configIdx + 1]
    ? args[configIdx + 1]
    : DEFAULT_CONFIG_PATH

  console.log(`\n=== Cyber Factory Cutover Migration ${reverse ? '(REVERSE)' : '(FORWARD)'} ===`)
  console.log(`Config: ${configPath}`)
  if (dryRun) console.log('Mode: DRY RUN (no changes written)\n')

  const config = readConfig(configPath)
  const result = reverse ? migrateReverse(config) : migrateForward(config)

  if (result.changes.length > 0) {
    console.log('\nChanges:')
    for (const c of result.changes) console.log(`  + ${c}`)
  }
  if (result.warnings.length > 0) {
    console.log('\nWarnings:')
    for (const w of result.warnings) console.log(`  ! ${w}`)
  }

  if (!dryRun && result.changes.length > 0) {
    writeConfig(configPath, config)
    console.log(`\nConfig written. Backup at: ${configPath}.pre-cutover-backup`)
  }

  console.log('\nDone.\n')
}

main()
