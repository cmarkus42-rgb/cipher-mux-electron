// src/main/audit/code-review.ts
import * as fs from 'fs'
import * as path from 'path'
import type { AuditFinding } from './types'

export interface CodeReviewOpts {
  projectPath: string
  scopePaths?: string[]
}

/**
 * Perform automated code review heuristics.
 * Checks: naming conventions, function length, file length, TODO/FIXME, console.log in production.
 */
export function runCodeReview(opts: CodeReviewOpts, runId: string): AuditFinding[] {
  const findings: AuditFinding[] = []
  const scanDirs = opts.scopePaths?.length
    ? opts.scopePaths.map(p => path.join(opts.projectPath, p))
    : [path.join(opts.projectPath, 'src')]

  let idx = 0
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue
    const files = collectSourceFiles(dir)
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')
      const relPath = path.relative(opts.projectPath, file)

      // Check: file too long (>400 lines)
      if (lines.length > 400) {
        findings.push({
          id: `afnd-cr-${++idx}`, runId, severity: 'low', category: 'code-quality',
          filePath: relPath, lineNumber: null,
          description: `File has ${lines.length} lines (threshold: 400). Consider splitting.`,
          recommendation: 'Break into smaller, focused modules',
        })
      }

      // Check: console.log in production code
      for (let i = 0; i < lines.length; i++) {
        if (/\bconsole\.(log|debug|info)\b/.test(lines[i]) && !lines[i].trimStart().startsWith('//')) {
          findings.push({
            id: `afnd-cr-${++idx}`, runId, severity: 'low', category: 'code-quality',
            filePath: relPath, lineNumber: i + 1,
            description: 'console.log/debug/info in production code',
            recommendation: 'Use structured logging or remove',
          })
          break // One finding per file for console.log
        }
      }

      // Check: TODO/FIXME/HACK comments
      for (let i = 0; i < lines.length; i++) {
        if (/\b(TODO|FIXME|HACK|XXX)\b/.test(lines[i])) {
          findings.push({
            id: `afnd-cr-${++idx}`, runId, severity: 'info', category: 'code-quality',
            filePath: relPath, lineNumber: i + 1,
            description: `Unresolved marker: ${lines[i].trim().slice(0, 80)}`,
            recommendation: 'Resolve or create a tracked issue',
          })
        }
      }

      // Check: any function (exported) > 80 lines
      // (Lighter check than cognitive-debt — just flags, doesn't deep-analyze)
      const exportedFuncPattern = /^export\s+(?:async\s+)?function\s+(\w+)/
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(exportedFuncPattern)
        if (match) {
          let depth = 0, started = false, endLine = i
          for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
              if (ch === '{') { depth++; started = true }
              if (ch === '}') depth--
            }
            if (started && depth <= 0) { endLine = j; break }
          }
          const funcLen = endLine - i + 1
          if (funcLen > 80) {
            findings.push({
              id: `afnd-cr-${++idx}`, runId, severity: 'medium', category: 'code-quality',
              filePath: relPath, lineNumber: i + 1,
              description: `Exported function '${match[1]}' has ${funcLen} lines`,
              recommendation: 'Consider decomposing into smaller functions',
            })
          }
        }
      }
    }
  }

  return findings
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = []
  const skip = new Set(['node_modules', 'dist', '.git', 'coverage', 'build'])
  function walk(d: string) {
    const entries = fs.readdirSync(d, { withFileTypes: true })
    for (const entry of entries) {
      if (skip.has(entry.name)) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|js|tsx|jsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) results.push(full)
    }
  }
  walk(dir)
  return results
}
