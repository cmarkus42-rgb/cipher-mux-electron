/**
 * REQ-HUB-006 · mux_hub_release — Release a migrated project.
 *
 * - Marks project as 'freigegeben' in ARCHIV-VERWEIS.md
 * - Writes MIGRATED.md in the original directory
 * - Saves original push URL in .project-meta.json
 * - Sets push lock on original (git remote set-url --push origin no-push)
 * - Updates workspace config
 */

import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { projectDir, workspacesDir, dateSuffix } from './hub-paths'
import { updateStatus, getEntry } from './archiv-verweis'
import type { ReleaseResult, ProjectMeta } from './types'

/**
 * Read the push URL from a git repo.
 */
function readPushUrl(repoPath: string): string | null {
  try {
    const result = execFileSync('git', ['remote', 'get-url', '--push', 'origin'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 5000,
    })
    return result.trim() || null
  } catch {
    return null
  }
}

/**
 * Set the push URL for a git remote.
 */
function setPushUrl(repoPath: string, url: string): boolean {
  try {
    execFileSync('git', ['remote', 'set-url', '--push', 'origin', url], {
      cwd: repoPath,
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Write MIGRATED.md in the original project directory.
 */
function writeMigratedMd(originalPath: string, hubPath: string): boolean {
  try {
    const content = [
      '# MIGRATED',
      '',
      `Dieses Projekt wurde in den CIPHER-MUX-Hub migriert.`,
      '',
      `**Neuer Pfad:** ${hubPath}`,
      `**Datum:** ${new Date().toISOString().slice(0, 10)}`,
      '',
      'Bitte arbeite im Hub-Pfad. Push aus diesem Verzeichnis ist gesperrt.',
      '',
    ].join('\n')

    fs.writeFileSync(path.join(originalPath, 'MIGRATED.md'), content, 'utf-8')
    return true
  } catch {
    return false
  }
}

/**
 * Save original push URL in .project-meta.json.
 */
function saveOriginalPushUrl(projPath: string, pushUrl: string): void {
  const metaPath = path.join(projPath, '.project-meta.json')
  let meta: ProjectMeta = { archived_origin: '', lifecycle_phase: 'freigegeben' }

  if (fs.existsSync(metaPath)) {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  }

  meta.original_push_url = pushUrl
  meta.lifecycle_phase = 'freigegeben'
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
}

/**
 * Update workspace config to confirm it points to hub path.
 */
function updateWorkspaceConfig(projectName: string, hubPath: string): boolean {
  const wsPath = path.join(workspacesDir(), `ws-${projectName}.json`)
  if (!fs.existsSync(wsPath)) return false

  try {
    const config = JSON.parse(fs.readFileSync(wsPath, 'utf-8'))
    config.projectPath = hubPath
    config.releasedAt = new Date().toISOString()
    fs.writeFileSync(wsPath, JSON.stringify(config, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

/**
 * Release a project: mark as primary in hub, lock original.
 */
export async function hubRelease(projectName: string): Promise<ReleaseResult> {
  const entry = getEntry(projectName)
  if (!entry) {
    throw new Error(`Projekt "${projectName}" nicht in ARCHIV-VERWEIS.md gefunden.`)
  }

  if (entry.status !== 'migriert-getestet') {
    throw new Error(`Projekt muss erst verifiziert werden (mux_hub_verify). Aktueller Status: "${entry.status}"`)
  }

  const hubPath = projectDir(projectName)
  const originalPath = entry.originalPfad
  const warnings: string[] = []

  // Read and save original push URL BEFORE setting lock
  let originalPushUrl = 'unknown'
  if (fs.existsSync(originalPath)) {
    const url = readPushUrl(originalPath)
    originalPushUrl = url ?? 'unknown'
  } else {
    warnings.push(`Original-Pfad nicht erreichbar: ${originalPath}`)
  }

  // Save push URL in project meta
  saveOriginalPushUrl(hubPath, originalPushUrl)

  // Set push lock on original
  let pushSperreGesetzt = false
  if (fs.existsSync(originalPath) && originalPushUrl !== 'unknown') {
    pushSperreGesetzt = setPushUrl(originalPath, 'no-push')
  }

  // Write MIGRATED.md in original
  let migratedMdGeschrieben = false
  if (fs.existsSync(originalPath)) {
    migratedMdGeschrieben = writeMigratedMd(originalPath, hubPath)
  }

  // Update workspace config
  const workspaceUpdated = updateWorkspaceConfig(projectName, hubPath)

  // Update ARCHIV-VERWEIS.md status
  await updateStatus(projectName, 'freigegeben', dateSuffix())

  return {
    released: true,
    hubPath,
    originalPath,
    originalPushUrl,
    pushSperreGesetzt,
    migratedMdGeschrieben,
    workspaceUpdated,
  }
}
