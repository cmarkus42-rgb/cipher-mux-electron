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
    // If targetDir already ends with projectName, don't double-append
    const baseName = path.basename(opts.targetDir)
    const projectPath = baseName === opts.projectName
      ? opts.targetDir
      : path.join(opts.targetDir, opts.projectName)

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

    // Copy SDD workflow skills (.claude/skills/) into the new project
    this.copySkills(projectPath)

    return {
      projectPath,
      claudeMdPath,
      requirementsCopied: true,
    }
  }

  /**
   * Copy the SDD workflow skills from the bundled template into a new project.
   * Skills are stored alongside the app in .claude/skills/.
   */
  private copySkills(projectPath: string): void {
    // Resolve skills template directory relative to the app root
    const appRoot = path.resolve(__dirname, '..', '..', '..')
    const skillsSrc = path.join(appRoot, '.claude', 'skills')

    if (!fs.existsSync(skillsSrc)) {
      console.warn('[KickoffManager] Skills template not found:', skillsSrc)
      return
    }

    const skillsDest = path.join(projectPath, '.claude', 'skills')
    fs.mkdirSync(skillsDest, { recursive: true })

    // Copy each skill directory
    for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const srcDir = path.join(skillsSrc, entry.name)
      const destDir = path.join(skillsDest, entry.name)
      fs.mkdirSync(destDir, { recursive: true })

      for (const file of fs.readdirSync(srcDir)) {
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file))
      }
    }

    console.log(`[KickoffManager] Skills copied to ${skillsDest}`)
  }
}

/**
 * Generate a minimal CLAUDE.md for a new project.
 */
function generateClaudeMd(projectName: string): string {
  return `# ${projectName}

## Status
**Phase: 1 — Anforderungsinterview**

**Nächster Schritt:** \`/interview\` starten — Requirements mit dem Auftraggeber erheben.

## Build & Test
_Noch nicht konfiguriert._

## Workflow-Skills

| Phase | Skill | Zweck |
|-------|-------|-------|
| 1 | \`/interview\` | Anforderungsinterview durchführen |
| 2 | \`/spec\` | Technische Spezifikation erstellen |
| 3 | \`/decide\` | ADRs für Entscheidungspunkte erstellen |
| 4 | \`/decompose\` | Spezifikation in Tasks zerlegen |
| 5 | \`/implement\` | Nächsten Task implementieren |
| — | \`/doc-review\` | Dokumentation mit Code abgleichen |
`
}
