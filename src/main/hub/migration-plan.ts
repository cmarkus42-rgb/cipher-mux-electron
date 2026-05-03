/**
 * REQ-HUB-003 · mux_hub_migration_plan — Generate 3-section migration plan.
 * Sections: "Bleibt unveraendert", "Bleibt, wird erweitert", "Kommt neu hinzu".
 * Based on inventory results.
 */

import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { projectMigrationsDir, dateSuffix, projectDir } from './hub-paths'
import type { InventoryResult } from './inventory'
import type { MigrationPlanStep } from './types'

export const MigrationPlanInputSchema = z.object({
  projectName: z.string().describe('Name of the project in the hub'),
  mode: z.enum(['voll', 'pack-light']).optional().default('voll').describe('Migration mode'),
  components: z.array(z.string()).optional().describe('Only for pack-light: list of components'),
})

export type MigrationPlanInput = z.infer<typeof MigrationPlanInputSchema>

export interface MigrationPlanResult {
  planPath: string
  sections: {
    unchanged: number
    extended: number
    new: number
  }
  gaps: string[]
}

/** Known pack components for pack-light mode validation. */
const VALID_PACK_COMPONENTS = [
  'personas',
  'global-rules',
  'refinement',
  'ideation-partner',
  'cyber-factory',
  'debugger',
  'testing-assistant',
  'audit',
  'workspace-memory',
  'companion',
] as const

/**
 * Load the latest inventory report for a project.
 */
function loadLatestInventory(projectName: string): InventoryResult | null {
  const migDir = projectMigrationsDir(projectName)
  if (!fs.existsSync(migDir)) return null

  const files = fs.readdirSync(migDir)
    .filter(f => f.startsWith('inventory-') && f.endsWith('.md'))
    .sort()
    .reverse()

  if (files.length === 0) return null

  // Parse the inventory report back into a result structure.
  // For a robust approach we also check for a JSON sidecar.
  const jsonSidecar = path.join(migDir, files[0].replace('.md', '.json'))
  if (fs.existsSync(jsonSidecar)) {
    return JSON.parse(fs.readFileSync(jsonSidecar, 'utf-8'))
  }

  // If no JSON sidecar, we need to re-run inventory (but we shouldn't import it
  // to avoid circular deps). Return null to signal "run inventory first".
  return null
}

/**
 * Build the plan steps based on inventory and mode.
 */
function buildSteps(
  inv: InventoryResult,
  mode: 'voll' | 'pack-light',
  components?: string[],
): { steps: MigrationPlanStep[]; gaps: string[] } {
  const steps: MigrationPlanStep[] = []
  const gaps: string[] = []
  let stepCounter = 0

  function nextId(): string {
    return `S-${String(++stepCounter).padStart(3, '0')}`
  }

  // Section 1: Unchanged — existing project structure stays
  if (inv.structure.codeDir) {
    steps.push({
      id: nextId(),
      section: 'unchanged',
      description: `Code-Verzeichnis: ${inv.structure.codeDir}/`,
      action: 'keep',
    })
  }
  if (inv.structure.testDir) {
    steps.push({
      id: nextId(),
      section: 'unchanged',
      description: `Test-Verzeichnis: ${inv.structure.testDir}/`,
      action: 'keep',
    })
  }
  if (inv.structure.docsDir) {
    steps.push({
      id: nextId(),
      section: 'unchanged',
      description: `Docs-Verzeichnis: ${inv.structure.docsDir}/`,
      action: 'keep',
    })
  }
  if (inv.stack.manifest) {
    steps.push({
      id: nextId(),
      section: 'unchanged',
      description: `Manifest: ${inv.stack.manifest}`,
      action: 'keep',
    })
  }

  // Section 2: Extended — existing files that get additions
  if (inv.structure.hasClaudeMd) {
    steps.push({
      id: nextId(),
      section: 'extended',
      description: 'CLAUDE.md — Hub-Konventionen ergaenzen',
      action: 'extend',
    })
  }

  // Section 3: New — things that need to be created
  if (!inv.structure.hasClaudeMd) {
    steps.push({
      id: nextId(),
      section: 'new',
      description: 'CLAUDE.md anlegen (Hub-Konventionen)',
      action: 'create',
    })
    gaps.push('Kein CLAUDE.md vorhanden — wird angelegt')
  }
  if (!inv.structure.hasProjectMeta) {
    steps.push({
      id: nextId(),
      section: 'new',
      description: '.project-meta.json anlegen (archived_origin, lifecycle_phase)',
      action: 'create',
    })
  }

  // Always add workspace config as new
  steps.push({
    id: nextId(),
    section: 'new',
    description: 'Workspace-Config (ws-<name>.json) anlegen',
    action: 'create',
  })

  // In pack-light mode, filter "new" to only requested components
  if (mode === 'pack-light' && components && components.length > 0) {
    const packSteps: MigrationPlanStep[] = []
    for (const comp of components) {
      packSteps.push({
        id: nextId(),
        section: 'new',
        description: `Pack-Komponente: ${comp}`,
        action: 'create',
      })
    }
    steps.push(...packSteps)
  } else if (mode === 'voll') {
    // Full mode: add all standard extensions
    if (inv.specs.existingSpecs.length === 0) {
      steps.push({
        id: nextId(),
        section: 'new',
        description: 'docs/SPEC.md anlegen',
        action: 'create',
      })
      gaps.push('Keine Spezifikation vorhanden')
    }
    if (inv.specs.adrsFound === 0) {
      steps.push({
        id: nextId(),
        section: 'new',
        description: 'docs/decisions/ anlegen',
        action: 'create',
      })
    }
    if (inv.specs.reqIdsFound === 0) {
      gaps.push('Keine REQ-IDs vorhanden')
    }
  }

  return { steps, gaps }
}

/**
 * Render the plan to a Markdown string.
 */
function renderPlan(
  projectName: string,
  steps: MigrationPlanStep[],
  gaps: string[],
  inventoryDate: string,
): string {
  const unchanged = steps.filter(s => s.section === 'unchanged')
  const extended = steps.filter(s => s.section === 'extended')
  const newSteps = steps.filter(s => s.section === 'new')

  let md = `# Migrations-Plan: ${projectName}

**Datum:** ${dateSuffix()}
**Basis:** Inventur vom ${inventoryDate}

## 1. Bleibt unveraendert

${unchanged.length > 0
    ? unchanged.map(s => `- [ ] **${s.id}** ${s.description}`).join('\n')
    : '— (nichts)'}

## 2. Bleibt, wird erweitert

${extended.length > 0
    ? extended.map(s => `- [ ] **${s.id}** ${s.description}`).join('\n')
    : '— (nichts)'}

## 3. Kommt neu hinzu

${newSteps.length > 0
    ? newSteps.map(s => `- [ ] **${s.id}** ${s.description}`).join('\n')
    : '— (nichts)'}
`

  if (gaps.length > 0) {
    md += `
## Luecken (informativ)

${gaps.map(g => `- ${g}`).join('\n')}
`
  }

  return md
}

/**
 * Generate a migration plan for a project.
 */
export async function migrationPlan(input: MigrationPlanInput): Promise<MigrationPlanResult> {
  const parsed = MigrationPlanInputSchema.parse(input)
  const { projectName, mode, components } = parsed

  // Validate project exists
  if (!fs.existsSync(projectDir(projectName))) {
    throw new Error(`Projekt nicht gefunden. Zuerst mux_hub_integrate ausfuehren.`)
  }

  // Validate pack-light components
  if (mode === 'pack-light' && components) {
    const invalid = components.filter(c => !(VALID_PACK_COMPONENTS as readonly string[]).includes(c))
    if (invalid.length > 0) {
      throw new Error(
        `Unbekannte Pack-Komponenten: ${invalid.join(', ')}. ` +
        `Gueltig: ${VALID_PACK_COMPONENTS.join(', ')}`,
      )
    }
  }

  // Try to load inventory
  let inv = loadLatestInventory(projectName)
  if (!inv) {
    // Re-run inventory inline
    const { inventory: runInventory } = await import('./inventory')
    inv = await runInventory({ projectName })
  }

  // Save inventory as JSON sidecar for future re-loads
  const migDir = projectMigrationsDir(projectName)
  fs.mkdirSync(migDir, { recursive: true })
  const jsonPath = path.join(migDir, `inventory-${dateSuffix()}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(inv, null, 2), 'utf-8')

  const { steps, gaps } = buildSteps(inv, mode, components)

  // Write plan
  const planPath = path.join(migDir, `migration-plan-${dateSuffix()}.md`)
  fs.writeFileSync(planPath, renderPlan(projectName, steps, gaps, dateSuffix()), 'utf-8')

  return {
    planPath,
    sections: {
      unchanged: steps.filter(s => s.section === 'unchanged').length,
      extended: steps.filter(s => s.section === 'extended').length,
      new: steps.filter(s => s.section === 'new').length,
    },
    gaps,
  }
}
