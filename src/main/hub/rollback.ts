/**
 * REQ-HUB-007 · mux_hub_rollback — Revert to original project path.
 *
 * - Points workspace config back to original
 * - Restores push URL from .project-meta.json
 * - Deletes MIGRATED.md from original
 * - Optionally removes hub copy (with user confirmation)
 */

import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { projectDir, workspacesDir } from './hub-paths'
import { updateStatus, getEntry } from './archiv-verweis'
import type { RollbackOptions, RollbackResult, ProjectMeta } from './types'
import type { InputRequestCreator } from './apply'

/**
 * Read .project-meta.json to get original_push_url.
 */
function readProjectMeta(projPath: string): ProjectMeta | null {
  const metaPath = path.join(projPath, '.project-meta.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Restore push URL in original repo.
 */
function restorePushUrl(repoPath: string, url: string): boolean {
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
 * Remove MIGRATED.md from original.
 */
function removeMigratedMd(originalPath: string): boolean {
  const mdPath = path.join(originalPath, 'MIGRATED.md')
  if (!fs.existsSync(mdPath)) return true
  try {
    fs.unlinkSync(mdPath)
    return true
  } catch {
    return false
  }
}

/**
 * Point workspace config back to original path.
 */
function revertWorkspaceConfig(projectName: string, originalPath: string): boolean {
  const wsPath = path.join(workspacesDir(), `ws-${projectName}.json`)
  if (!fs.existsSync(wsPath)) return false

  try {
    const config = JSON.parse(fs.readFileSync(wsPath, 'utf-8'))
    config.projectPath = originalPath
    config.rolledBackAt = new Date().toISOString()
    fs.writeFileSync(wsPath, JSON.stringify(config, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

/**
 * Recursively remove a directory.
 */
function removeDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true })
}

/**
 * Rollback: revert workspace to original, remove push lock, clean up.
 */
export async function hubRollback(
  options: RollbackOptions,
  inputRequest?: InputRequestCreator,
): Promise<RollbackResult> {
  const { projectName, removeHubCopy = false } = options

  const entry = getEntry(projectName)
  if (!entry) {
    throw new Error(`Projekt "${projectName}" nicht in ARCHIV-VERWEIS.md gefunden.`)
  }

  const hubPath = projectDir(projectName)
  const originalPath = entry.originalPfad

  if (!fs.existsSync(originalPath)) {
    throw new Error(`Original-Pfad nicht gefunden: ${originalPath}. Manueller Eingriff noetig.`)
  }

  // Read original push URL from project meta
  const meta = readProjectMeta(hubPath)
  const originalPushUrl = meta?.original_push_url

  // Restore push URL
  let pushSperreEntfernt = false
  if (originalPushUrl && originalPushUrl !== 'unknown') {
    pushSperreEntfernt = restorePushUrl(originalPath, originalPushUrl)
  } else if (originalPushUrl === 'unknown' || !originalPushUrl) {
    // Cannot restore — warn via result (push lock remains)
    pushSperreEntfernt = false
  }

  // Remove MIGRATED.md
  removeMigratedMd(originalPath)

  // Revert workspace config
  revertWorkspaceConfig(projectName, originalPath)

  // Optionally remove hub copy
  let hubCopyRemoved = false
  if (removeHubCopy && fs.existsSync(hubPath)) {
    // Require user confirmation for destructive action
    if (inputRequest) {
      const answer = await inputRequest.create(
        projectName,
        `Hub-Kopie loeschen: ${hubPath}\n\nDiese Aktion ist nicht rueckgaengig zu machen.`,
        [
          { key: 'yes', label: 'Loeschen' },
          { key: 'no', label: 'Behalten' },
        ],
      )
      if (answer === 'yes') {
        removeDir(hubPath)
        hubCopyRemoved = true
      }
    } else {
      // Without input request mechanism, refuse destructive action
      // (safety: never delete without confirmation)
    }
  }

  // Update ARCHIV-VERWEIS.md status
  const newStatus = hubCopyRemoved ? 'nicht-migriert' : 'parallel-betrieben'
  await updateStatus(projectName, newStatus)

  return {
    rolledBack: true,
    workspacePointsTo: originalPath,
    pushSperreEntfernt,
    hubCopyRemoved,
  }
}
