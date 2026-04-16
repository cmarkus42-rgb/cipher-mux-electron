import * as fs from 'fs'
import * as path from 'path'
import { EventEmitter } from 'events'
import { runCommand } from '../util/exec-util'
import type { ProjectInfo } from '../../shared/types'

const EXCLUDE_DIRS = new Set([
  '_template',
  '.claude',
  '.DS_Store',
  'node_modules',
  '.git',
  '.Trash',
])

/**
 * ProjectScanner — Scans directories for Claude Code projects.
 *
 * Recognizes projects by the presence of CLAUDE.md, .claude/, or docs/.
 * Gathers git status, SDD phase, and other metadata.
 * Ported from cipher-mux v1 project-scanner.js.
 */
export class ProjectScanner extends EventEmitter {
  private watchers: fs.FSWatcher[] = []

  /**
   * Scan a list of base directories for projects.
   * @param maxDepth  How many directory levels below each basePath to inspect.
   *                  1 = direct children only (legacy behavior).
   *                  2 = children + grandchildren. Etc.
   *                  When a project is found, recursion stops for that branch.
   */
  async scan(scanPaths: string[], maxDepth = 1): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = []
    const seen = new Set<string>()

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return // skip inaccessible
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (EXCLUDE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        const childPath = path.join(dir, entry.name)
        if (seen.has(childPath)) continue
        seen.add(childPath)
        const info = await this.inspectProject(childPath)
        if (info) {
          projects.push(info)
          // Found a project — don't descend further into nested projects.
          continue
        }
        await walk(childPath, depth + 1)
      }
    }

    for (const basePath of scanPaths) {
      await walk(basePath, 1)
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Inspect a single directory and return ProjectInfo if it's a recognized project.
   */
  async inspectProject(projectPath: string): Promise<ProjectInfo | null> {
    const hasClaudeMd = fs.existsSync(path.join(projectPath, 'CLAUDE.md'))
    const hasClaudeDir = fs.existsSync(path.join(projectPath, '.claude'))
    const hasDocs = fs.existsSync(path.join(projectPath, 'docs'))

    if (!hasClaudeMd && !hasClaudeDir && !hasDocs) {
      return null
    }

    const name = path.basename(projectPath)
    const gitBranch = await this.getGitBranch(projectPath)
    const gitDirty = await this.isGitDirty(projectPath)
    const sddPhase = hasClaudeMd ? await this.extractSddPhase(projectPath) : null

    return {
      path: projectPath,
      name,
      sddPhase,
      gitBranch,
      gitDirty,
      hasClaudeMd,
    }
  }

  /**
   * Watch scan paths for filesystem changes.
   */
  watch(scanPaths: string[], onChange: () => void): void {
    this.stopWatch()
    for (const basePath of scanPaths) {
      try {
        const watcher = fs.watch(basePath, { persistent: false }, () => {
          onChange()
        })
        this.watchers.push(watcher)
      } catch {
        // Skip unwatchable paths
      }
    }
  }

  stopWatch(): void {
    for (const w of this.watchers) {
      w.close()
    }
    this.watchers = []
  }

  private async getGitBranch(projectPath: string): Promise<string | null> {
    try {
      const branch = await runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectPath })
      return branch || null
    } catch {
      return null
    }
  }

  private async isGitDirty(projectPath: string): Promise<boolean> {
    try {
      const status = await runCommand('git', ['status', '--porcelain'], { cwd: projectPath })
      return status.length > 0
    } catch {
      return false
    }
  }

  private async extractSddPhase(projectPath: string): Promise<string | null> {
    try {
      const content = fs.readFileSync(path.join(projectPath, 'CLAUDE.md'), 'utf-8')
      // Match patterns like "**Phase: 5 — Autonome Implementierung**"
      const match = content.match(/\*\*Phase:\s*(.+?)\*\*/)
      return match ? match[1].trim() : null
    } catch {
      return null
    }
  }
}
