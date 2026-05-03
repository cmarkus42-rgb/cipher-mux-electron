import * as fs from 'fs'
import * as path from 'path'
import type { EntityConfig } from '../../shared/types'
import { APP_VERSION } from '../../shared/constants'

const MARKER_FILE = '.entity-deployed'

interface DeployMarker {
  deployedAt: string
  entityId: string
  sourceDir: string
  appVersion?: string
}

/**
 * Deploy entity assets (CLAUDE.md, guides, skills, etc.) to the entity's
 * working directory. On first deploy, copies all files. On version upgrade,
 * force-overwrites template files (except .claude/settings.local.json which
 * is always merged via ensureTemplateSettings).
 *
 * @param config Entity configuration with projectPath and templatePath.
 * @param appRoot Root directory of the application (for resolving templatePath).
 * @returns true if assets were deployed, false if skipped.
 */
export function deployEntityAssets(config: EntityConfig, appRoot: string): boolean {
  if (!config.templatePath) return false

  const targetDir = config.projectPath
  const markerPath = path.join(targetDir, MARKER_FILE)

  // Check existing marker for version comparison
  if (fs.existsSync(markerPath)) {
    try {
      const marker: DeployMarker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
      if (marker.appVersion === APP_VERSION) {
        return false // Same version — skip
      }
      // Version differs — redeploy with force
      console.log(`[EntityAssets] Version upgrade detected for ${config.id}: ${marker.appVersion ?? 'unknown'} → ${APP_VERSION}`)
    } catch {
      // Corrupt marker — treat as upgrade (redeploy)
      console.warn(`[EntityAssets] Corrupt marker for ${config.id}, redeploying`)
    }
  }

  const sourceDir = path.join(appRoot, config.templatePath)
  if (!fs.existsSync(sourceDir)) {
    console.warn(`[EntityAssets] Template directory not found: ${sourceDir}`)
    return false
  }

  // Determine if this is an upgrade (marker exists but version differs)
  const isUpgrade = fs.existsSync(markerPath)

  // Ensure target directory exists
  fs.mkdirSync(targetDir, { recursive: true })

  // Copy all files recursively — force overwrite on upgrade
  copyDirRecursive(sourceDir, targetDir, isUpgrade)

  // Write marker file with deployment timestamp and version
  fs.writeFileSync(markerPath, JSON.stringify({
    deployedAt: new Date().toISOString(),
    entityId: config.id,
    sourceDir,
    appVersion: APP_VERSION,
  }, null, 2), 'utf-8')

  console.log(`[EntityAssets] ${isUpgrade ? 'Upgraded' : 'Deployed'} ${config.id} assets from ${sourceDir} to ${targetDir}`)
  return true
}

/**
 * Ensure the entity's `.claude/settings.local.json` contains base settings
 * from the template (permissions, model, statusLine). Called on every entity
 * start — not just first deployment — so that settings survive even if
 * the file was deleted or the initial deployment skipped `.claude`.
 *
 * Merges template settings as base, preserving any keys already present
 * in the target (e.g. mcpServers added by postLaunchInjection).
 */
export function ensureTemplateSettings(config: EntityConfig, appRoot: string): void {
  if (!config.templatePath) return

  const templateSettingsPath = path.join(appRoot, config.templatePath, '.claude', 'settings.local.json')
  if (!fs.existsSync(templateSettingsPath)) return

  const targetClaudeDir = path.join(config.projectPath, '.claude')
  const targetSettingsPath = path.join(targetClaudeDir, 'settings.local.json')

  fs.mkdirSync(targetClaudeDir, { recursive: true })

  let templateSettings: Record<string, unknown> = {}
  try {
    templateSettings = JSON.parse(fs.readFileSync(templateSettingsPath, 'utf-8'))
  } catch { return }

  let currentSettings: Record<string, unknown> = {}
  try {
    currentSettings = JSON.parse(fs.readFileSync(targetSettingsPath, 'utf-8'))
  } catch { /* doesn't exist yet */ }

  // Template as base, current overrides (preserves mcpServers from postLaunchInjection)
  const merged = { ...templateSettings, ...currentSettings }

  // Union-merge permissions.allow: template + current (new tools propagate automatically)
  const tplPerms = (templateSettings.permissions as any)?.allow ?? []
  const curPerms = (currentSettings.permissions as any)?.allow ?? []
  if (tplPerms.length || curPerms.length) {
    const union = [...new Set([...tplPerms, ...curPerms])]
    merged.permissions = { ...((merged.permissions as any) ?? {}), allow: union }
  }

  fs.writeFileSync(targetSettingsPath, JSON.stringify(merged, null, 2), 'utf-8')
}

/**
 * Recursively copy a directory.
 * @param force When true, overwrites existing files (for version upgrades).
 *              When false, only copies files that don't exist in the target.
 *              .claude/settings.local.json is NEVER overwritten (handled by ensureTemplateSettings).
 */
function copyDirRecursive(src: string, dest: string, force = false): void {
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      // Skip hidden directories like .git, but allow .claude (settings, permissions)
      if (entry.name.startsWith('.') && entry.name !== '.claude') continue
      copyDirRecursive(srcPath, destPath, force)
    } else {
      // Never overwrite settings.local.json — ensureTemplateSettings handles merging
      if (entry.name === 'settings.local.json' && dest.endsWith('.claude')) continue

      if (force || !fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
}
