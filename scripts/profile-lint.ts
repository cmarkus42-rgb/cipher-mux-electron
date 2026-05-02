#!/usr/bin/env tsx
/**
 * Profile lint — CI check that community builds contain no cipher-specific paths.
 *
 * Scans src/ for hardcoded paths that should only appear in profile.cipher.yaml.
 * Exit code 0 = clean, 1 = violations found.
 */

import * as fs from 'fs'
import * as path from 'path'

const FORBIDDEN_PATTERNS = [
  /\/Users\/Shared\/Nextcloud/,
  /cipher-boox/,
  /ClaudeCode01/,
]

// Files that are allowed to contain these patterns (the profile files themselves)
const ALLOWED_FILES = new Set([
  'profile.cipher.yaml',
  'profile-lint.ts',
  'brand.test.ts',
])

function walkDir(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'out', '.git'].includes(entry.name)) continue
      results.push(...walkDir(full))
    } else if (/\.(ts|tsx|js|json|yaml|yml)$/.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}

const projectRoot = path.resolve(__dirname, '..')
const files = walkDir(path.join(projectRoot, 'src'))
let violations = 0

for (const file of files) {
  const basename = path.basename(file)
  if (ALLOWED_FILES.has(basename)) continue

  const content = fs.readFileSync(file, 'utf-8')
  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      const rel = path.relative(projectRoot, file)
      console.error(`VIOLATION: ${rel} contains "${match[0]}"`)
      violations++
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} violation(s) found. Use BRAND.* constants instead of hardcoded paths.`)
  process.exit(1)
} else {
  console.log('Profile lint passed — no cipher-specific paths in src/')
  process.exit(0)
}
