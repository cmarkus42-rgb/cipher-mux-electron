import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { ulid } from 'ulidx'
import type { NoteInfo, NoteContent, HandoffStatus } from '../../shared/types'

// ─── NoteManager ────────────────────────────────────────────
// All notes stored in a flat directory: {notesDir}/{id}.md
// Scope-based subdirectories (global/, workspace-*/) are deprecated.
// Categorization is purely tag-based. Migration from old layout runs once.

export class NoteManager {
  private notesDir: string

  constructor(notesDir: string) {
    this.notesDir = notesDir
    void fs.mkdir(this.notesDir, { recursive: true })
    // Run migration from scope-based dirs (P.3) — synchronous, runs once
    this.migrateFromScopes()
  }

  // ─── P.3 Migration ───────────────────────────────────────

  // One-time migration: move notes from global/ and workspace-<id>/
  // subdirectories into the flat notesDir. Workspace-scoped notes get
  // a workspace:<id> tag. Writes .migration-done marker to prevent re-running.
  private migrateFromScopes(): void {
    const markerPath = path.join(this.notesDir, '.migration-done')
    if (fsSync.existsSync(markerPath)) return

    let entries: fsSync.Dirent[]
    try {
      entries = fsSync.readdirSync(this.notesDir, { withFileTypes: true })
    } catch {
      return
    }

    const scopeDirs = entries.filter(e => e.isDirectory()).map(e => e.name)
    if (scopeDirs.length === 0) {
      // No scope dirs to migrate — write marker and return
      try { fsSync.writeFileSync(markerPath, new Date().toISOString(), 'utf-8') } catch { /* ignore */ }
      return
    }

    let migrated = 0
    for (const scope of scopeDirs) {
      const scopePath = path.join(this.notesDir, scope)
      let files: string[]
      try {
        files = fsSync.readdirSync(scopePath).filter(f => f.endsWith('.md'))
      } catch {
        continue
      }

      for (const file of files) {
        const srcPath = path.join(scopePath, file)
        const destPath = path.join(this.notesDir, file)

        // Skip if destination already exists (name collision)
        if (fsSync.existsSync(destPath)) continue

        try {
          // For workspace-scoped notes, inject workspace tag into frontmatter
          if (scope.startsWith('workspace-')) {
            const workspaceId = scope.replace('workspace-', '')
            const raw = fsSync.readFileSync(srcPath, 'utf-8')
            const parsed = matter(raw)
            const tags: string[] = parsed.data.tags ?? []
            const wsTag = `workspace:${workspaceId}`
            if (!tags.includes(wsTag)) {
              tags.push(wsTag)
            }
            parsed.data.tags = tags
            const updated = matter.stringify(parsed.content, parsed.data)
            fsSync.writeFileSync(destPath, updated, 'utf-8')
            fsSync.unlinkSync(srcPath)
          } else {
            // global/ or other dirs — just move the file
            fsSync.renameSync(srcPath, destPath)
          }
          migrated++
        } catch {
          // Skip files that can't be migrated
        }
      }

      // Remove empty scope directory
      try {
        const remaining = fsSync.readdirSync(scopePath)
        if (remaining.length === 0) {
          fsSync.rmdirSync(scopePath)
        }
      } catch { /* ignore */ }
    }

    if (migrated > 0) {
      console.log(`[NoteManager] Migrated ${migrated} notes from scope directories to flat storage`)
    }

    // Write migration marker
    try { fsSync.writeFileSync(markerPath, new Date().toISOString(), 'utf-8') } catch { /* ignore */ }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private filePath(id: string): string {
    return path.join(this.notesDir, `${id}.md`)
  }

  /** Extract title from first # heading in body, fallback to 'Untitled' */
  private extractTitle(body: string): string {
    const match = body.match(/^#\s+(.+)$/m)
    return match ? match[1].trim() : 'Untitled'
  }

  /** Parse a .md file into NoteInfo + body */
  private async parseFile(filePath: string): Promise<NoteContent | null> {
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch {
      return null
    }

    let parsed: matter.GrayMatterFile<string>
    try {
      parsed = matter(raw)
    } catch {
      return null
    }
    const fm = parsed.data as {
      title?: string
      tags?: string[]
      type?: string
      created?: string
      modified?: string
      from_session?: string
      to_entity?: string
      handoff_status?: HandoffStatus
    }

    const id = path.basename(filePath, '.md')
    const info: NoteInfo = {
      id,
      title: fm.title ?? 'Untitled',
      tags: fm.tags ?? [],
      scope: 'global',
      relativePath: `${id}.md`,
      ...(fm.type ? { noteType: fm.type } : {}),
      createdAt: fm.created ?? new Date().toISOString(),
      modifiedAt: fm.modified ?? new Date().toISOString(),
      ...(fm.from_session ? { fromSession: fm.from_session } : {}),
      ...(fm.to_entity ? { toEntity: fm.to_entity } : {}),
      ...(fm.handoff_status ? { handoffStatus: fm.handoff_status } : {}),
    }

    return { info, body: parsed.content.trimStart() }
  }

  /** Serialize note to markdown with frontmatter */
  private stringify(fm: Record<string, unknown>, body: string): string {
    return matter.stringify('\n' + body, fm)
  }

  // ─── Public API ───────────────────────────────────────────

  async create(title: string, body: string, tags?: string[]): Promise<NoteInfo> {
    const id = ulid()
    const now = new Date().toISOString()
    await fs.mkdir(this.notesDir, { recursive: true })

    const tagList = tags ?? ([] as string[])
    const fm: Record<string, unknown> = {
      title,
      ...(tagList.includes('testcase') ? { type: 'testcase' } : {}),
      tags: tagList,
      created: now,
      modified: now,
    }

    const content = this.stringify(fm, body)
    await fs.writeFile(this.filePath(id), content, 'utf-8')

    return {
      id,
      title,
      tags: tagList,
      scope: 'global',
      relativePath: `${id}.md`,
      createdAt: now,
      modifiedAt: now,
    }
  }

  async list(filterTags?: string[]): Promise<NoteInfo[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(this.notesDir)
    } catch {
      return []
    }

    const mdFiles = entries.filter(e => e.endsWith('.md'))
    const notes = await Promise.all(
      mdFiles.map(async f => {
        const result = await this.parseFile(path.join(this.notesDir, f))
        return result?.info ?? null
      })
    )

    let filtered = notes.filter(Boolean) as NoteInfo[]

    // Filter by tags if provided (note must have at least one matching tag)
    if (filterTags && filterTags.length > 0) {
      const tagSet = new Set(filterTags.map(t => t.toLowerCase()))
      filtered = filtered.filter(n =>
        n.tags.some(t => tagSet.has(t.toLowerCase()))
      )
    }

    return filtered.sort(
      (a, b) => b.modifiedAt.localeCompare(a.modifiedAt)
    )
  }

  /** @deprecated Use list() — kept for backward compat, same behavior. */
  async listAll(): Promise<NoteInfo[]> {
    return this.list()
  }

  async read(id: string): Promise<NoteContent | null> {
    return this.parseFile(this.filePath(id))
  }

  async save(id: string, body: string, tags?: string[]): Promise<NoteInfo> {
    const filePath = this.filePath(id)
    const existing = await this.parseFile(filePath)
    const now = new Date().toISOString()
    const extractedTitle = this.extractTitle(body)

    // Read existing frontmatter to preserve custom fields (type, from_session, etc.)
    let existingFm: Record<string, unknown> = {}
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      existingFm = matter(raw).data as Record<string, unknown>
    } catch { /* new file, no existing frontmatter */ }

    // Preserve existing title when body has no H1 heading (e.g. testcase saves)
    const title = extractedTitle !== 'Untitled'
      ? extractedTitle
      : (existingFm.title as string) ?? existing?.info.title ?? 'Untitled'

    const fm: Record<string, unknown> = {
      ...existingFm,
      title,
      tags: tags ?? existing?.info.tags ?? [],
      created: existing?.info.createdAt ?? now,
      modified: now,
    }

    await fs.mkdir(this.notesDir, { recursive: true })

    const content = this.stringify(fm, body)
    await fs.writeFile(filePath, content, 'utf-8')

    return {
      id,
      title,
      tags: fm.tags as string[],
      scope: 'global',
      relativePath: `${id}.md`,
      createdAt: fm.created as string,
      modifiedAt: now,
    }
  }

  /** Create a handoff note with extended frontmatter fields. */
  async createHandoff(
    title: string,
    body: string,
    fromSession: string,
    toEntity: string = 'any',
  ): Promise<NoteInfo> {
    const id = ulid()
    const now = new Date().toISOString()
    await fs.mkdir(this.notesDir, { recursive: true })

    const fm = {
      title,
      tags: ['handoff'] as string[],
      from_session: fromSession,
      to_entity: toEntity,
      handoff_status: 'pending' as const,
      created: now,
      modified: now,
    }

    const content = matter.stringify('\n' + body, fm)
    await fs.writeFile(this.filePath(id), content, 'utf-8')

    return {
      id,
      title,
      tags: ['handoff'],
      scope: 'global',
      relativePath: `${id}.md`,
      createdAt: now,
      modifiedAt: now,
      fromSession,
      toEntity,
      handoffStatus: 'pending',
    }
  }

  /**
   * Full-text search over notes with optional tag filters.
   * Returns up to 50 results, title matches first, then by modifiedAt desc.
   */
  async search(query: string, opts?: {
    tags?: string[]
  }): Promise<NoteContent[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(this.notesDir)
    } catch {
      return []
    }

    const mdFiles = entries.filter(e => e.endsWith('.md'))
    const allNotes: NoteContent[] = []
    const parsed = await Promise.all(
      mdFiles.map(f => this.parseFile(path.join(this.notesDir, f)))
    )
    for (const p of parsed) {
      if (p) allNotes.push(p)
    }

    const lowerQuery = query.toLowerCase()

    // Filter by query (case-insensitive includes on title + body)
    let results = allNotes.filter(n =>
      n.info.title.toLowerCase().includes(lowerQuery) ||
      n.body.toLowerCase().includes(lowerQuery)
    )

    // Filter by tags (note must have at least one of the given tags)
    if (opts?.tags && opts.tags.length > 0) {
      const filterTags = new Set(opts.tags.map(t => t.toLowerCase()))
      results = results.filter(n =>
        n.info.tags.some(t => filterTags.has(t.toLowerCase()))
      )
    }

    // Sort: title matches first, then by modifiedAt desc
    results.sort((a, b) => {
      const aTitle = a.info.title.toLowerCase().includes(lowerQuery) ? 0 : 1
      const bTitle = b.info.title.toLowerCase().includes(lowerQuery) ? 0 : 1
      if (aTitle !== bTitle) return aTitle - bTitle
      return b.info.modifiedAt.localeCompare(a.info.modifiedAt)
    })

    return results.slice(0, 50)
  }

  async delete(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.filePath(id))
      return true
    } catch {
      return false
    }
  }

  destroy(): void {
    // cleanup placeholder — no persistent resources
  }
}
