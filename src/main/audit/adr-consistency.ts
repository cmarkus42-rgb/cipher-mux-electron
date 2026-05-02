// src/main/audit/adr-consistency.ts
import * as fs from 'fs'
import * as path from 'path'
import type { AuditFinding } from './types'

export interface AdrConsistencyOpts {
  projectPath: string
  /** Changed files in this welle (relative paths). */
  changedFiles: string[]
}

/** Directories that, if modified, should have an ADR. */
const SUBSTANTIAL_PATHS = [
  'src/main/mcp/',
  'src/main/companion/',
  'src/main/session/',
  'src/main/config/',
  'src/shared/',
]

/**
 * Check if substantial changes have corresponding ADRs.
 * A "substantial change" is a new file or major modification in core directories.
 */
export function checkAdrConsistency(opts: AdrConsistencyOpts, runId: string): AuditFinding[] {
  const findings: AuditFinding[] = []
  const adrDir = path.join(opts.projectPath, 'docs', 'decisions')
  const existingAdrs = getExistingAdrTopics(adrDir)

  // Find changed files in substantial paths
  const substantialChanges = opts.changedFiles.filter(f =>
    SUBSTANTIAL_PATHS.some(p => f.startsWith(p))
  )

  if (substantialChanges.length === 0) return findings

  // Group by directory (first 3 path segments)
  const changedAreas = new Set(
    substantialChanges.map(f => f.split('/').slice(0, 3).join('/'))
  )

  let idx = 0
  for (const area of changedAreas) {
    // Check if any ADR mentions this area
    const hasAdr = existingAdrs.some(adr =>
      adr.toLowerCase().includes(area.split('/').pop()!.toLowerCase())
    )
    if (!hasAdr) {
      findings.push({
        id: `afnd-adr-${++idx}`, runId, severity: 'medium', category: 'architecture',
        filePath: area, lineNumber: null,
        description: `Substantial changes in '${area}' without a corresponding ADR`,
        recommendation: 'Consider documenting the architectural decision in docs/decisions/',
      })
    }
  }

  return findings
}

function getExistingAdrTopics(adrDir: string): string[] {
  if (!fs.existsSync(adrDir)) return []
  return fs.readdirSync(adrDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
}
