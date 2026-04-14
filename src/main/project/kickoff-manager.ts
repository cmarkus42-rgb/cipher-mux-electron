import * as fs from 'fs'
import * as path from 'path'
import type { KickoffOpts } from '../../shared/types'

export interface KickoffResult {
  projectPath: string
  claudeMdPath: string
  requirementsCopied: boolean
}

/**
 * KickoffManager — Creates project scaffolds for new kick-offs.
 */
export class KickoffManager {
  /**
   * Create a new project scaffold for kick-off.
   *
   * 1. Create targetDir/projectName directory
   * 2. Create docs/ subdirectory
   * 3. Copy requirements file to docs/requirements.md
   * 4. Generate a minimal CLAUDE.md with project name and phase 1 marker
   * 5. Return result
   */
  async kickoff(opts: KickoffOpts): Promise<KickoffResult> {
    const projectPath = path.join(opts.targetDir, opts.projectName)

    // Fail if project directory already exists
    if (fs.existsSync(projectPath)) {
      throw new Error(`Project directory already exists: ${projectPath}`)
    }

    // Validate requirements file exists
    if (!fs.existsSync(opts.requirementsFile)) {
      throw new Error(`Requirements file not found: ${opts.requirementsFile}`)
    }

    // Create project directory
    fs.mkdirSync(projectPath, { recursive: true })

    // Create docs/ subdirectory
    const docsDir = path.join(projectPath, 'docs')
    fs.mkdirSync(docsDir)

    // Copy requirements file
    const requirementsDest = path.join(docsDir, 'requirements.md')
    fs.copyFileSync(opts.requirementsFile, requirementsDest)

    // Generate CLAUDE.md
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md')
    const claudeMdContent = generateClaudeMd(opts.projectName)
    fs.writeFileSync(claudeMdPath, claudeMdContent, 'utf-8')

    return {
      projectPath,
      claudeMdPath,
      requirementsCopied: true,
    }
  }
}

/**
 * Generate a minimal CLAUDE.md for a new project.
 */
function generateClaudeMd(projectName: string): string {
  return `# ${projectName}

## Status
**Phase: 1 — Anforderungsinterview**

## Build & Test
_Noch nicht konfiguriert._
`
}
