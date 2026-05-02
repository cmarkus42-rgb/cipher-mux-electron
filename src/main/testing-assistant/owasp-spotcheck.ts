// src/main/testing-assistant/owasp-spotcheck.ts
import * as fs from 'fs'
import * as path from 'path'
import type { FindingSeverity } from './types'

export interface OwaspFinding {
  rule: string
  severity: FindingSeverity
  filePath: string
  lineNumber: number
  description: string
}

const XSS_PATTERN = new RegExp('innerHTML\\s*=|dangerouslySetInnerHTML|v-html', 'i')

const OWASP_RULES: Array<{
  id: string
  pattern: RegExp
  severity: FindingSeverity
  description: string
}> = [
  { id: 'SQL-INJ', pattern: /`[^`]*\$\{[^}]+\}[^`]*`.*(?:query|exec|prepare|raw)/i, severity: 'high', description: 'Possible SQL injection — string interpolation in query' },
  { id: 'SQL-INJ-CONCAT', pattern: /(?:query|exec|execute)\s*\(\s*['"][^'"]*['"]\s*\+/i, severity: 'high', description: 'Possible SQL injection — string concatenation in query' },
  { id: 'HARDCODED-SECRET', pattern: /(?:password|secret|apikey|api_key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, severity: 'high', description: 'Hardcoded secret or credential' },
  { id: 'XSS-INNERHTML', pattern: XSS_PATTERN, severity: 'medium', description: 'Potential XSS — unescaped HTML insertion' },
  { id: 'EVAL', pattern: /\beval\s*\(|new\s+Function\s*\(/i, severity: 'medium', description: 'Use of eval or Function constructor' },
]

export function runOwaspSpotcheck(projectPath: string): OwaspFinding[] {
  const findings: OwaspFinding[] = []
  const files = collectSourceFiles(projectPath)

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    const relPath = path.relative(projectPath, file)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue

      for (const rule of OWASP_RULES) {
        if (rule.pattern.test(line)) {
          findings.push({
            rule: rule.id,
            severity: rule.severity,
            filePath: relPath,
            lineNumber: i + 1,
            description: rule.description,
          })
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
    if (!fs.existsSync(d)) return
    const entries = fs.readdirSync(d, { withFileTypes: true })
    for (const entry of entries) {
      if (skip.has(entry.name)) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|js|tsx|jsx|mjs|cjs)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        results.push(full)
      }
    }
  }

  walk(dir)
  return results
}
