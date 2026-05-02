// src/main/audit/cognitive-debt-evaluator.ts
import * as fs from 'fs'
import * as path from 'path'
import type { CognitiveDebtNote } from './types'

export interface CognitiveDebtOpts {
  projectPath: string
  scopePaths?: string[]
  functionLengthThreshold?: number
}

/**
 * Evaluate cognitive debt heuristics — finds long functions.
 */
export function evaluateCognitiveDebt(opts: CognitiveDebtOpts, runId: string): CognitiveDebtNote[] {
  const threshold = opts.functionLengthThreshold ?? 50
  const notes: CognitiveDebtNote[] = []
  const scanDirs = opts.scopePaths?.length
    ? opts.scopePaths.map(p => path.join(opts.projectPath, p))
    : [path.join(opts.projectPath, 'src')]

  let noteIdx = 0
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue
    const files = collectTsFiles(dir)
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')
      const relPath = path.relative(opts.projectPath, file)

      const longFunctions = findLongFunctions(lines, threshold)
      for (const lf of longFunctions) {
        noteIdx++
        notes.push({
          id: `adbt-${noteIdx}`,
          runId,
          area: `${relPath}:${lf.startLine}`,
          suggestion: `Function at line ${lf.startLine} has ${lf.lineCount} lines (threshold: ${threshold}). Consider splitting.`,
          lineCount: lf.lineCount,
        })
      }
    }
  }

  return notes
}

interface LongFunction { startLine: number; lineCount: number }

function findLongFunctions(lines: string[], threshold: number): LongFunction[] {
  const results: LongFunction[] = []
  const funcPattern = /^(?:export\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\()/

  for (let i = 0; i < lines.length; i++) {
    if (funcPattern.test(lines[i].trim())) {
      let depth = 0
      let started = false
      let endLine = i
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') { depth++; started = true }
          if (ch === '}') depth--
        }
        if (started && depth <= 0) { endLine = j; break }
      }
      const lineCount = endLine - i + 1
      if (lineCount > threshold) {
        results.push({ startLine: i + 1, lineCount })
      }
    }
  }
  return results
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = []
  const skip = new Set(['node_modules', 'dist', '.git', 'coverage'])
  function walk(d: string) {
    const entries = fs.readdirSync(d, { withFileTypes: true })
    for (const entry of entries) {
      if (skip.has(entry.name)) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) results.push(full)
    }
  }
  walk(dir)
  return results
}
