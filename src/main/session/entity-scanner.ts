// src/main/session/entity-scanner.ts — Dynamic entity scanner
//
// Scans ~/.config/cipher-mux/entities/ for directories with a CLAUDE.md,
// and registers them as entities in the EntityRegistry. This makes custom
// entities appear in the LauncherCell preset list alongside built-in ones.

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { EntityConfig } from '../../shared/types'
import type { EntityRegistry } from './entity-registry'

const ENTITIES_DIR = path.join(os.homedir(), '.config/cipher-mux/entities')

/** Default colors for known entity IDs. */
const KNOWN_COLORS: Record<string, string> = {
  companion: '#ffb74d',
  refinement: '#ef5350',
  audit: '#c0392b',
  'voice-relay': '#9b59b6',
  watchdog: '#2ecc71',
  projectlauncher: '#3498db',
  bugreport: '#e57373',
}

/** Default icons for known entity IDs. */
const KNOWN_ICONS: Record<string, string> = {
  companion: '🧭',
  refinement: '🔬',
  audit: '🛡',
  'voice-relay': '🎙',
  watchdog: '🐕',
  projectlauncher: '🚀',
  bugreport: '🐛',
}

/** Palette for unknown entities. */
const DYNAMIC_COLORS = ['#26a69a', '#5c6bc0', '#ec407a', '#8d6e63', '#78909c']

/**
 * Scan the entities directory and register any entity that has a CLAUDE.md.
 * Skips entities already registered (built-in ones like orchestrator, cyber-factory).
 *
 * @returns Array of newly registered entity configs.
 */
export function scanAndRegisterEntities(registry: EntityRegistry): EntityConfig[] {
  if (!fs.existsSync(ENTITIES_DIR)) {
    fs.mkdirSync(ENTITIES_DIR, { recursive: true })
    return []
  }

  const registered: EntityConfig[] = []
  let colorIdx = 0

  const entries = fs.readdirSync(ENTITIES_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const entityId = entry.name
    // Skip if already registered (e.g. companion, refinement from registerBuiltinEntities)
    if (registry.get(entityId)) continue

    // Skip hidden legacy entities (marked by .hidden file during cutover)
    const hiddenPath = path.join(ENTITIES_DIR, entityId, '.hidden')
    if (fs.existsSync(hiddenPath)) continue

    const claudeMdPath = path.join(ENTITIES_DIR, entityId, 'CLAUDE.md')
    if (!fs.existsSync(claudeMdPath)) continue

    const displayName = parseDisplayName(claudeMdPath, entityId)
    const color = KNOWN_COLORS[entityId] || DYNAMIC_COLORS[colorIdx++ % DYNAMIC_COLORS.length]
    const icon = KNOWN_ICONS[entityId] || '⚙'

    const config: EntityConfig = {
      id: entityId,
      displayName,
      icon,
      color,
      projectPath: path.join(ENTITIES_DIR, entityId),
      features: ['mcp'],
      visible: true,
    }

    registry.register(config)
    registered.push(config)
  }

  return registered
}

/**
 * Extract display name from a CLAUDE.md first heading.
 * Expects: `# Name — Description` or `# Name`
 */
function parseDisplayName(claudeMdPath: string, fallback: string): string {
  try {
    const content = fs.readFileSync(claudeMdPath, 'utf-8')
    const firstLine = content.split('\n').find(l => l.startsWith('#'))
    if (firstLine) {
      // Remove # prefix and any `—` suffix description
      const name = firstLine.replace(/^#+\s*/, '').split(/\s*[—–-]\s*/)[0].trim()
      if (name) return name
    }
  } catch { /* ignore */ }
  // Capitalize fallback
  return fallback.charAt(0).toUpperCase() + fallback.slice(1)
}
