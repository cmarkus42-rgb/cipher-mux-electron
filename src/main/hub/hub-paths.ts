import * as path from 'path'
import * as fs from 'fs'

/**
 * Resolve the hub root by walking up from this file until we find ARCHIV-VERWEIS.md.
 * Works in both dev (tsx, src/) and production (dist/) layouts.
 * Can be overridden via HUB_ROOT_OVERRIDE for testing.
 */
let _hubRoot: string | null = null

function resolveHubRoot(): string {
  if (process.env.HUB_ROOT_OVERRIDE) return process.env.HUB_ROOT_OVERRIDE

  if (_hubRoot) return _hubRoot

  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'ARCHIV-VERWEIS.md'))) {
      _hubRoot = dir
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fallback: assume standard layout (hub is grandparent of project root)
  _hubRoot = path.resolve(__dirname, '..', '..', '..', '..', '..')
  return _hubRoot
}

/** Hub root directory. All hub operations resolve paths relative to this. */
export function hubRoot(): string {
  return resolveHubRoot()
}

/** Reset cached hub root (for testing). */
export function _resetHubRoot(): void {
  _hubRoot = null
}

/** Projects directory inside the hub. */
export function projectsDir(): string {
  return path.join(hubRoot(), 'projects')
}

/** Absolute path to a specific project inside the hub. */
export function projectDir(projectName: string): string {
  return path.join(projectsDir(), projectName)
}

/** Migrations base directory. */
export function migrationsDir(): string {
  return path.join(hubRoot(), 'migrations')
}

/** Migrations directory for a specific project. */
export function projectMigrationsDir(projectName: string): string {
  return path.join(migrationsDir(), projectName)
}

/** Workspaces directory. */
export function workspacesDir(): string {
  return path.join(hubRoot(), 'workspaces')
}

/** Path to ARCHIV-VERWEIS.md at hub root. */
export function archivVerweisPath(): string {
  return path.join(hubRoot(), 'ARCHIV-VERWEIS.md')
}

/** ISO date string for filenames (YYYY-MM-DD). */
export function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Default build artifact directories to exclude during copy. */
export const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  '.cache',
  '__pycache__',
  'target',
] as const
