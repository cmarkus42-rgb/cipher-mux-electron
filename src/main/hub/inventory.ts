/**
 * REQ-HUB-002 · mux_hub_inventory — Brownfield inventory of a hub project.
 * Idempotent, read-only analysis. Detects stack, structure, specs, tests.
 * Writes report to migrations/<projectName>/.
 */

import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { projectDir, projectMigrationsDir, dateSuffix } from './hub-paths'
import type { RuntimeKind, StackInfo } from './types'

export const InventoryInputSchema = z.object({
  projectName: z.string().describe('Name of the project in the hub'),
})

export type InventoryInput = z.infer<typeof InventoryInputSchema>

export interface InventoryResult {
  projectName: string
  hubPath: string
  stack: {
    runtime: RuntimeKind
    manifest: string
    framework: string | null
    testFramework: string | null
  }
  structure: {
    codeDir: string
    testDir: string | null
    docsDir: string | null
    hasClaudeMd: boolean
    hasProjectMeta: boolean
  }
  specs: {
    existingSpecs: string[]
    reqIdsFound: number
    adrsFound: number
  }
  tests: {
    testFileCount: number
    lastRunStatus: 'unknown' | 'green' | 'red'
  }
  brownfieldSignals: number
  pathAliases: Record<string, string>
}

// ─── Stack Detection ──────────────────────────────────────────

interface ManifestInfo {
  file: string
  runtime: RuntimeKind
  framework: string | null
  testFramework: string | null
}

function detectStack(projectPath: string): ManifestInfo {
  // Node.js
  if (fs.existsSync(path.join(projectPath, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const framework = detectNodeFramework(deps)
    const testFramework = detectNodeTestFramework(deps, pkg.scripts)
    return { file: 'package.json', runtime: 'node', framework, testFramework }
  }
  // Python
  if (fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
    return { file: 'pyproject.toml', runtime: 'python', framework: null, testFramework: 'pytest' }
  }
  if (fs.existsSync(path.join(projectPath, 'setup.py'))) {
    return { file: 'setup.py', runtime: 'python', framework: null, testFramework: 'pytest' }
  }
  if (fs.existsSync(path.join(projectPath, 'requirements.txt'))) {
    return { file: 'requirements.txt', runtime: 'python', framework: null, testFramework: null }
  }
  // Rust
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
    return { file: 'Cargo.toml', runtime: 'rust', framework: null, testFramework: 'cargo-test' }
  }
  // Go
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
    return { file: 'go.mod', runtime: 'go', framework: null, testFramework: 'go-test' }
  }
  return { file: '', runtime: 'unknown', framework: null, testFramework: null }
}

function detectNodeFramework(deps: Record<string, string>): string | null {
  if (deps['electron']) return 'electron'
  if (deps['next']) return 'next'
  if (deps['nuxt']) return 'nuxt'
  if (deps['express']) return 'express'
  if (deps['fastify']) return 'fastify'
  if (deps['react']) return 'react'
  if (deps['vue']) return 'vue'
  if (deps['svelte']) return 'svelte'
  return null
}

function detectNodeTestFramework(
  deps: Record<string, string>,
  scripts?: Record<string, string>,
): string | null {
  if (deps['vitest']) return 'vitest'
  if (deps['jest']) return 'jest'
  if (deps['mocha']) return 'mocha'
  // node:test (built-in) — check test script
  if (scripts?.test?.includes('node --test')) return 'node:test'
  return null
}

// ─── Structure Detection ──────────────────────────────────────

function detectStructure(projectPath: string): {
  codeDir: string
  testDir: string | null
  docsDir: string | null
  hasClaudeMd: boolean
  hasProjectMeta: boolean
  pathAliases: Record<string, string>
} {
  const codeDirCandidates = ['src', 'source', 'lib', 'app']
  const testDirCandidates = ['test', 'tests', '__tests__', 'spec']
  const docsDirCandidates = ['docs', 'doc', 'documentation']

  let codeDir = '.'
  const pathAliases: Record<string, string> = {}

  for (const c of codeDirCandidates) {
    if (fs.existsSync(path.join(projectPath, c)) &&
        fs.statSync(path.join(projectPath, c)).isDirectory()) {
      codeDir = c
      if (c !== 'src') {
        pathAliases['src'] = c
      }
      break
    }
  }

  let testDir: string | null = null
  for (const c of testDirCandidates) {
    if (fs.existsSync(path.join(projectPath, c)) &&
        fs.statSync(path.join(projectPath, c)).isDirectory()) {
      testDir = c
      if (c !== 'test') {
        pathAliases['test'] = c
      }
      break
    }
  }

  let docsDir: string | null = null
  for (const c of docsDirCandidates) {
    if (fs.existsSync(path.join(projectPath, c)) &&
        fs.statSync(path.join(projectPath, c)).isDirectory()) {
      docsDir = c
      break
    }
  }

  return {
    codeDir,
    testDir,
    docsDir,
    hasClaudeMd: fs.existsSync(path.join(projectPath, 'CLAUDE.md')),
    hasProjectMeta: fs.existsSync(path.join(projectPath, '.project-meta.json')),
    pathAliases,
  }
}

// ─── Spec Detection ───────────────────────────────────────────

function detectSpecs(projectPath: string): {
  existingSpecs: string[]
  reqIdsFound: number
  adrsFound: number
} {
  const existingSpecs: string[] = []
  let reqIdsFound = 0
  let adrsFound = 0

  // Look for spec files
  const specCandidates = ['docs/SPEC.md', 'docs/spec.md', 'SPEC.md']
  for (const c of specCandidates) {
    if (fs.existsSync(path.join(projectPath, c))) {
      existingSpecs.push(c)
    }
  }

  // Look for requirements
  const reqCandidates = ['docs/requirements.md', 'requirements.md']
  for (const c of reqCandidates) {
    if (fs.existsSync(path.join(projectPath, c))) {
      existingSpecs.push(c)
    }
  }

  // Count REQ-IDs across all found specs
  for (const spec of existingSpecs) {
    try {
      const content = fs.readFileSync(path.join(projectPath, spec), 'utf-8')
      const matches = content.match(/REQ-[A-Z]+-\d+/g)
      if (matches) reqIdsFound += matches.length
    } catch { /* ignore */ }
  }

  // Count ADRs
  const adrDir = path.join(projectPath, 'docs', 'decisions')
  if (fs.existsSync(adrDir) && fs.statSync(adrDir).isDirectory()) {
    const adrFiles = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'))
    adrsFound = adrFiles.length
  }

  return { existingSpecs, reqIdsFound, adrsFound }
}

// ─── Test Detection ───────────────────────────────────────────

function countTestFiles(projectPath: string): number {
  let count = 0
  const testPatterns = ['.test.ts', '.test.js', '.spec.ts', '.spec.js', '_test.go', '_test.py', 'test_']

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name === '.git') continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          walk(full)
        } else if (e.isFile() && testPatterns.some(p => e.name.includes(p))) {
          count++
        }
      }
    } catch { /* permission errors */ }
  }

  walk(projectPath)
  return count
}

// ─── Brownfield Signals ───────────────────────────────────────

function countBrownfieldSignals(
  hasClaudeMd: boolean,
  hasProjectMeta: boolean,
  specCount: number,
  adrCount: number,
  testCount: number,
  reqIdCount: number,
): number {
  let signals = 0
  if (hasClaudeMd) signals++
  if (hasProjectMeta) signals++
  if (specCount > 0) signals++
  if (adrCount > 0) signals++
  if (testCount > 0) signals++
  if (reqIdCount > 0) signals++
  return signals
}

// ─── Report Generation ───────────────────────────────────────

function generateReport(result: InventoryResult): string {
  return `# Inventur-Report: ${result.projectName}

**Datum:** ${dateSuffix()}
**Hub-Pfad:** ${result.hubPath}

## Stack

| Feld | Wert |
|------|------|
| Runtime | ${result.stack.runtime} |
| Manifest | ${result.stack.manifest} |
| Framework | ${result.stack.framework ?? '—'} |
| Test-Framework | ${result.stack.testFramework ?? '—'} |

## Struktur

| Feld | Wert |
|------|------|
| Code-Dir | ${result.structure.codeDir} |
| Test-Dir | ${result.structure.testDir ?? '—'} |
| Docs-Dir | ${result.structure.docsDir ?? '—'} |
| CLAUDE.md | ${result.structure.hasClaudeMd ? 'ja' : 'nein'} |
| .project-meta.json | ${result.structure.hasProjectMeta ? 'ja' : 'nein'} |

## Specs

- Gefundene Spec-Dateien: ${result.specs.existingSpecs.length > 0 ? result.specs.existingSpecs.join(', ') : '—'}
- REQ-IDs: ${result.specs.reqIdsFound}
- ADRs: ${result.specs.adrsFound}

## Tests

- Test-Dateien: ${result.tests.testFileCount}
- Letzter Run: ${result.tests.lastRunStatus}

## Brownfield-Signale: ${result.brownfieldSignals}/6

## Path-Aliases

${Object.keys(result.pathAliases).length > 0
    ? Object.entries(result.pathAliases).map(([k, v]) => `- \`${k}\` → \`${v}\``).join('\n')
    : '— (Standard-Verzeichnisstruktur)'}
`
}

// ─── Main ─────────────────────────────────────────────────────

export async function inventory(input: InventoryInput): Promise<InventoryResult> {
  const { projectName } = InventoryInputSchema.parse(input)
  const hubPath = projectDir(projectName)

  if (!fs.existsSync(hubPath)) {
    throw new Error(`Projekt nicht gefunden. Zuerst mux_hub_integrate ausfuehren.`)
  }

  const dirEntries = fs.readdirSync(hubPath)
  if (dirEntries.length === 0) {
    throw new Error(`Leeres Verzeichnis: ${hubPath}`)
  }

  const stackInfo = detectStack(hubPath)
  const structureInfo = detectStructure(hubPath)
  const specInfo = detectSpecs(hubPath)
  const testFileCount = countTestFiles(hubPath)

  const brownfieldSignals = countBrownfieldSignals(
    structureInfo.hasClaudeMd,
    structureInfo.hasProjectMeta,
    specInfo.existingSpecs.length,
    specInfo.adrsFound,
    testFileCount,
    specInfo.reqIdsFound,
  )

  const result: InventoryResult = {
    projectName,
    hubPath,
    stack: {
      runtime: stackInfo.runtime,
      manifest: stackInfo.file,
      framework: stackInfo.framework,
      testFramework: stackInfo.testFramework,
    },
    structure: {
      codeDir: structureInfo.codeDir,
      testDir: structureInfo.testDir,
      docsDir: structureInfo.docsDir,
      hasClaudeMd: structureInfo.hasClaudeMd,
      hasProjectMeta: structureInfo.hasProjectMeta,
    },
    specs: specInfo,
    tests: {
      testFileCount,
      lastRunStatus: 'unknown',
    },
    brownfieldSignals,
    pathAliases: structureInfo.pathAliases,
  }

  // Write report to migrations dir
  const migDir = projectMigrationsDir(projectName)
  fs.mkdirSync(migDir, { recursive: true })
  const reportPath = path.join(migDir, `inventory-${dateSuffix()}.md`)
  fs.writeFileSync(reportPath, generateReport(result), 'utf-8')

  return result
}
