/**
 * ARCHIV-VERWEIS.md parser and updater.
 * Reads and writes the status table in the hub's ARCHIV-VERWEIS.md file.
 * Uses cooperative file lock for atomic updates (REQ-HUB-Q01).
 */

import * as fs from 'fs'
import { archivVerweisPath } from './hub-paths'
import type { HubStatus, ArchivVerweisEntry } from './types'
import { VALID_HUB_STATUSES } from './types'

const TABLE_HEADER_PATTERN = /^\|\s*Projekt\s*\|/
const LOCK_TIMEOUT_MS = 5000
const LOCK_POLL_MS = 50

function lockFilePath(p: string): string {
  return p + '.lock'
}

async function acquireLock(p: string): Promise<void> {
  const lp = lockFilePath(p)
  const start = Date.now()
  while (Date.now() - start < LOCK_TIMEOUT_MS) {
    try {
      fs.writeFileSync(lp, String(process.pid), { flag: 'wx' })
      return
    } catch {
      await new Promise(r => setTimeout(r, LOCK_POLL_MS))
    }
  }
  // Stale lock: remove if older than timeout
  try {
    const stat = fs.statSync(lp)
    if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
      fs.unlinkSync(lp)
      fs.writeFileSync(lp, String(process.pid), { flag: 'wx' })
      return
    }
  } catch { /* ignore */ }
  throw new Error('ARCHIV-VERWEIS.md lock timeout')
}

function releaseLock(p: string): void {
  try { fs.unlinkSync(lockFilePath(p)) } catch { /* ignore */ }
}

/**
 * Parse the Markdown table in ARCHIV-VERWEIS.md into structured entries.
 */
export function readEntries(filePath?: string): ArchivVerweisEntry[] {
  const p = filePath ?? archivVerweisPath()
  if (!fs.existsSync(p)) return []

  const content = fs.readFileSync(p, 'utf-8')
  const lines = content.split('\n')
  const entries: ArchivVerweisEntry[] = []

  let inTable = false
  for (const line of lines) {
    if (TABLE_HEADER_PATTERN.test(line)) {
      inTable = true
      continue
    }
    if (inTable && line.startsWith('|---')) continue
    if (inTable && line.startsWith('|')) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean)
      if (cols.length >= 4) {
        entries.push({
          projekt: cols[0],
          originalPfad: cols[1],
          hubPfad: cols[2],
          status: cols[3] as HubStatus,
          freigabeDatum: cols[4] && cols[4] !== '—' ? cols[4] : null,
        })
      }
    } else if (inTable && !line.startsWith('|')) {
      inTable = false
    }
  }
  return entries
}

/**
 * Get a single entry by project name.
 */
export function getEntry(projectName: string, filePath?: string): ArchivVerweisEntry | null {
  return readEntries(filePath).find(e => e.projekt === projectName) ?? null
}

/**
 * Update the status of a project in ARCHIV-VERWEIS.md (with file lock).
 */
export async function updateStatus(projectName: string, status: HubStatus, freigabeDatum?: string, filePath?: string): Promise<void> {
  if (!VALID_HUB_STATUSES.includes(status)) {
    throw new Error(`Invalid hub status: "${status}". Valid: ${VALID_HUB_STATUSES.join(', ')}`)
  }

  const p = filePath ?? archivVerweisPath()
  if (!fs.existsSync(p)) {
    throw new Error(`ARCHIV-VERWEIS.md not found at: ${p}`)
  }

  await acquireLock(p)
  try {
    const content = fs.readFileSync(p, 'utf-8')
    const lines = content.split('\n')
    let updated = false

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('|')) continue
      const cols = lines[i].split('|').map(c => c.trim()).filter(Boolean)
      if (cols[0] === projectName) {
        cols[3] = status
        cols[4] = freigabeDatum ?? cols[4] ?? '—'
        lines[i] = '| ' + cols.join(' | ') + ' |'
        updated = true
        break
      }
    }

    if (!updated) {
      throw new Error(`Project "${projectName}" not found in ARCHIV-VERWEIS.md`)
    }

    fs.writeFileSync(p, lines.join('\n'), 'utf-8')
  } finally {
    releaseLock(p)
  }
}

/**
 * Add a new entry to ARCHIV-VERWEIS.md (with file lock).
 * Throws if project already exists.
 */
export async function addEntry(entry: ArchivVerweisEntry, filePath?: string): Promise<void> {
  if (!VALID_HUB_STATUSES.includes(entry.status)) {
    throw new Error(`Invalid hub status: "${entry.status}". Valid: ${VALID_HUB_STATUSES.join(', ')}`)
  }

  const p = filePath ?? archivVerweisPath()
  if (!fs.existsSync(p)) {
    throw new Error(`ARCHIV-VERWEIS.md not found at: ${p}`)
  }

  await acquireLock(p)
  try {
    const existing = readEntries(p)
    if (existing.find(e => e.projekt === entry.projekt)) {
      throw new Error(`Project "${entry.projekt}" already exists in ARCHIV-VERWEIS.md`)
    }

    const content = fs.readFileSync(p, 'utf-8')
    const lines = content.split('\n')

    // Find the last table row and insert after it
    let lastRowIdx = -1
    let inTable = false
    for (let i = 0; i < lines.length; i++) {
      if (TABLE_HEADER_PATTERN.test(lines[i])) {
        inTable = true
        continue
      }
      if (inTable && lines[i].startsWith('|---')) continue
      if (inTable && lines[i].startsWith('|')) {
        lastRowIdx = i
      } else if (inTable && !lines[i].startsWith('|')) {
        break
      }
    }

    const newRow = `| ${entry.projekt} | ${entry.originalPfad} | ${entry.hubPfad} | ${entry.status} | ${entry.freigabeDatum ?? '—'} |`

    if (lastRowIdx >= 0) {
      lines.splice(lastRowIdx + 1, 0, newRow)
    } else {
      // No table rows yet — append after separator
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('|---')) {
          lines.splice(i + 1, 0, newRow)
          break
        }
      }
    }

    fs.writeFileSync(p, lines.join('\n'), 'utf-8')
  } finally {
    releaseLock(p)
  }
}
