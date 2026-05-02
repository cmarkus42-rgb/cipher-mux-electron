// src/main/testing-assistant/test-quality-audit.ts
import * as fs from 'fs'
import * as path from 'path'
import type { TestQualityReport } from './types'

/** Heuristic patterns that suggest implementation-detail tests. */
const IMPLEMENTATION_PATTERNS = [
  /\.toHaveBeenCalled/,
  /\.toHaveBeenCalledWith/,
  /mock\.(calls|results|instances)/i,
  /jest\.spyOn|vi\.spyOn|sinon\.spy/,
  /expect\(.*\.mock\./,
  /renders\s+(a|the|correctly)/i,
  /calls\s+(the|a)\s+\w+\s+(method|function)/i,
  /invokes\s+/i,
]

/** Heuristic patterns that suggest behavioral tests. */
const BEHAVIORAL_PATTERNS = [
  /should\s+(return|throw|reject|resolve|produce|output|emit)/i,
  /returns?\s+(the|a|an|correct|expected)/i,
  /throws?\s+(when|if|on|for)/i,
  /given\s+.*when\s+.*then/i,
  /assert\.(equal|deepEqual|ok|throws|rejects)/,
  /expect\(result\)/,
]

export interface QualityAuditOpts {
  projectPath: string
}

/**
 * Analyze test files for behavioral vs implementation test ratio.
 */
export function auditTestQuality(opts: QualityAuditOpts, runId: string): TestQualityReport {
  const testDir = findTestDir(opts.projectPath)
  if (!testDir) {
    return { runId, behavioralCount: 0, implementationCount: 0, problematicTests: [] }
  }

  const files = collectTestFiles(testDir)
  let behavioralCount = 0
  let implementationCount = 0
  const problematicTests: string[] = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const relPath = path.relative(opts.projectPath, file)

    const implScore = IMPLEMENTATION_PATTERNS.reduce(
      (score, p) => score + (p.test(content) ? 1 : 0), 0
    )
    const behavScore = BEHAVIORAL_PATTERNS.reduce(
      (score, p) => score + (p.test(content) ? 1 : 0), 0
    )

    if (implScore > behavScore && implScore >= 3) {
      implementationCount++
      problematicTests.push(relPath)
    } else {
      behavioralCount++
    }
  }

  return { runId, behavioralCount, implementationCount, problematicTests }
}

function findTestDir(projectPath: string): string | null {
  for (const candidate of ['test', 'tests', '__tests__', 'spec']) {
    const dir = path.join(projectPath, candidate)
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir
  }
  return null
}

function collectTestFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...collectTestFiles(full))
    } else if (entry.isFile() && /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}
