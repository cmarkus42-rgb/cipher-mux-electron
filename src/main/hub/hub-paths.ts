import * as path from 'path'
import { configStore } from '../config/config-store'

/**
 * Hub root directory from ConfigStore.
 * Returns empty string if hubPath is not configured.
 */
export function hubRoot(): string {
  if (process.env.HUB_ROOT_OVERRIDE) return process.env.HUB_ROOT_OVERRIDE
  return configStore.get('hubPath') ?? ''
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
