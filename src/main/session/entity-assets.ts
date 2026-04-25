import * as fs from 'fs'
import * as path from 'path'
import type { EntityConfig } from '../../shared/types'

const MARKER_FILE = '.entity-deployed'

/**
 * Deploy entity assets (CLAUDE.md, guides, skills, etc.) to the entity's
 * working directory. Skips deployment if assets were already deployed
 * (marker file exists), preserving any user modifications.
 *
 * @param config Entity configuration with projectPath and templatePath.
 * @param appRoot Root directory of the application (for resolving templatePath).
 * @returns true if assets were deployed, false if skipped.
 */
export function deployEntityAssets(config: EntityConfig, appRoot: string): boolean {
  if (!config.templatePath) return false

  const targetDir = config.projectPath
  const markerPath = path.join(targetDir, MARKER_FILE)

  // Skip if already deployed — preserve user modifications
  if (fs.existsSync(markerPath)) {
    return false
  }

  const sourceDir = path.join(appRoot, config.templatePath)
  if (!fs.existsSync(sourceDir)) {
    console.warn(`[EntityAssets] Template directory not found: ${sourceDir}`)
    return false
  }

  // Ensure target directory exists
  fs.mkdirSync(targetDir, { recursive: true })

  // Copy all files recursively
  copyDirRecursive(sourceDir, targetDir)

  // Write marker file with deployment timestamp
  fs.writeFileSync(markerPath, JSON.stringify({
    deployedAt: new Date().toISOString(),
    entityId: config.id,
    sourceDir,
  }, null, 2), 'utf-8')

  console.log(`[EntityAssets] Deployed ${config.id} assets from ${sourceDir} to ${targetDir}`)
  return true
}

/**
 * Recursively copy a directory. Does NOT overwrite existing files —
 * only copies files that don't exist in the target.
 */
function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      // Skip hidden directories like .git
      if (entry.name.startsWith('.')) continue
      copyDirRecursive(srcPath, destPath)
    } else {
      // Don't overwrite existing files
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
}
