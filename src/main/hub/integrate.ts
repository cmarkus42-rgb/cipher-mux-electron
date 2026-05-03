/**
 * REQ-HUB-001 · mux_hub_integrate — Copy a project into the hub.
 * Copies source project to CIPHER-MUX/projects/<name>/, excludes build artifacts,
 * updates ARCHIV-VERWEIS.md. Original stays untouched.
 */

import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { projectDir, DEFAULT_EXCLUDE_DIRS } from './hub-paths'
import { addEntry, getEntry } from './archiv-verweis'

export const IntegrateInputSchema = z.object({
  sourcePath: z.string().describe('Absolute path to the source project'),
  projectName: z.string().optional().describe('Name in the hub (default: directory name from sourcePath)'),
  excludeBuildArtifacts: z.boolean().optional().default(true).describe('Exclude node_modules, dist, .cache, __pycache__, target'),
})

export type IntegrateInput = z.infer<typeof IntegrateInputSchema>

export interface IntegrateResult {
  success: boolean
  hubPath: string
  filesCopied: number
  filesExcluded: number
  warnings: string[]
}

/**
 * Recursively copy a directory, excluding specified directory names.
 * Returns counts of copied and excluded files, plus warnings for symlinks.
 */
function copyDir(
  src: string,
  dest: string,
  excludes: Set<string>,
  warnings: string[],
): { copied: number; excluded: number } {
  let copied = 0
  let excluded = 0

  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isSymbolicLink()) {
      warnings.push(`Symlink nicht aufgeloest: ${srcPath}`)
      // Copy symlink as-is (readlink + symlink)
      const target = fs.readlinkSync(srcPath)
      try {
        fs.symlinkSync(target, destPath)
        copied++
      } catch {
        warnings.push(`Symlink konnte nicht kopiert werden: ${srcPath}`)
      }
      continue
    }

    if (entry.isDirectory()) {
      if (excludes.has(entry.name)) {
        // Count files inside excluded dir
        excluded += countFiles(srcPath)
        continue
      }
      const sub = copyDir(srcPath, destPath, excludes, warnings)
      copied += sub.copied
      excluded += sub.excluded
      continue
    }

    if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
      copied++
    }
  }

  return { copied, excluded }
}

/** Count all files recursively in a directory. */
function countFiles(dir: string): number {
  let count = 0
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory()) {
        count += countFiles(path.join(dir, e.name))
      } else {
        count++
      }
    }
  } catch { /* permission errors etc */ }
  return count
}

/**
 * Copy a project into the hub.
 */
export async function integrate(input: IntegrateInput): Promise<IntegrateResult> {
  const parsed = IntegrateInputSchema.parse(input)
  const name = parsed.projectName || path.basename(parsed.sourcePath)
  const hubPath = projectDir(name)
  const warnings: string[] = []

  // Validate source exists
  if (!fs.existsSync(parsed.sourcePath)) {
    throw new Error(`Source path does not exist: ${parsed.sourcePath}`)
  }
  if (!fs.statSync(parsed.sourcePath).isDirectory()) {
    throw new Error(`Source path is not a directory: ${parsed.sourcePath}`)
  }

  // Check if project already exists in hub
  if (fs.existsSync(hubPath)) {
    throw new Error(`Projekt existiert bereits unter ${hubPath}. Zuerst rollback oder manuell loeschen.`)
  }

  // Check for .git in source
  if (!fs.existsSync(path.join(parsed.sourcePath, '.git'))) {
    warnings.push('Kein .git/ im Quell-Projekt — Rollback ist eingeschraenkt.')
  }

  // Build exclude set
  const excludes = parsed.excludeBuildArtifacts
    ? new Set<string>(DEFAULT_EXCLUDE_DIRS as unknown as string[])
    : new Set<string>()

  // Copy
  const { copied, excluded } = copyDir(parsed.sourcePath, hubPath, excludes, warnings)

  // Update ARCHIV-VERWEIS.md
  const existing = getEntry(name)
  if (existing) {
    // Entry exists but project dir didn't — update status
    const { updateStatus } = await import('./archiv-verweis')
    await updateStatus(name, 'kopiert')
  } else {
    await addEntry({
      projekt: name,
      originalPfad: parsed.sourcePath,
      hubPfad: `projects/${name}`,
      status: 'kopiert',
      freigabeDatum: null,
    })
  }

  return {
    success: true,
    hubPath,
    filesCopied: copied,
    filesExcluded: excluded,
    warnings,
  }
}
