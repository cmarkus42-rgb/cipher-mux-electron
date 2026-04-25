import { promises as fs } from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { ulid } from 'ulidx'
import type { NoteInfo, NoteContent } from '../../shared/types'

// ─── NoteManager ────────────────────────────────────────────

export class NoteManager {
  private notesDir: string

  constructor(notesDir: string) {
    this.notesDir = notesDir
    // Ensure global/ directory exists synchronously-ish via async call
    // (caller should await ensureReady() or rely on lazy creation in create())
    void fs.mkdir(path.join(this.notesDir, 'global'), { recursive: true })
  }

  // ─── Helpers ──────────────────────────────────────────────

  private scopeDir(scope: string): string {
    return path.join(this.notesDir, scope)
  }

  private filePath(id: string, scope: string): string {
    return path.join(this.scopeDir(scope), `${id}.md`)
  }

  /** Extract title from first # heading in body, fallback to 'Untitled' */
  private extractTitle(body: string): string {
    const match = body.match(/^#\s+(.+)$/m)
    return match ? match[1].trim() : 'Untitled'
  }

  /** Parse a .md file into NoteInfo + body */
  private async parseFile(filePath: string, scope: string): Promise<NoteContent | null> {
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf-8')
    } catch {
      return null
    }

    const parsed = matter(raw)
    const fm = parsed.data as {
      title?: string
      tags?: string[]
      created?: string
      modified?: string
    }

    const id = path.basename(filePath, '.md')
    const info: NoteInfo = {
      id,
      title: fm.title ?? 'Untitled',
      tags: fm.tags ?? [],
      scope,
      relativePath: path.join(scope, `${id}.md`),
      createdAt: fm.created ?? new Date().toISOString(),
      modifiedAt: fm.modified ?? new Date().toISOString(),
    }

    return { info, body: parsed.content.trimStart() }
  }

  /** Serialize note to markdown with frontmatter */
  private stringify(fm: {
    title: string
    tags: string[]
    created: string
    modified: string
  }, body: string): string {
    return matter.stringify('\n' + body, fm)
  }

  // ─── Public API ───────────────────────────────────────────

  async create(scope: string, title: string, body: string): Promise<NoteInfo> {
    const id = ulid()
    const now = new Date().toISOString()
    const dir = this.scopeDir(scope)
    await fs.mkdir(dir, { recursive: true })

    const fm = {
      title,
      tags: [] as string[],
      created: now,
      modified: now,
    }

    const content = this.stringify(fm, body)
    await fs.writeFile(this.filePath(id, scope), content, 'utf-8')

    return {
      id,
      title,
      tags: [],
      scope,
      relativePath: path.join(scope, `${id}.md`),
      createdAt: now,
      modifiedAt: now,
    }
  }

  async list(scope: string): Promise<NoteInfo[]> {
    const dir = this.scopeDir(scope)
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      return []
    }

    const mdFiles = entries.filter(e => e.endsWith('.md'))
    const notes = await Promise.all(
      mdFiles.map(async f => {
        const result = await this.parseFile(path.join(dir, f), scope)
        return result?.info ?? null
      })
    )

    return (notes.filter(Boolean) as NoteInfo[]).sort(
      (a, b) => b.modifiedAt.localeCompare(a.modifiedAt)
    )
  }

  async listAll(): Promise<NoteInfo[]> {
    let scopes: string[]
    try {
      const entries = await fs.readdir(this.notesDir, { withFileTypes: true })
      scopes = entries.filter(e => e.isDirectory()).map(e => e.name)
    } catch {
      return []
    }

    const results = await Promise.all(scopes.map(s => this.list(s)))
    const all = results.flat()
    return all.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  }

  async read(id: string, scope: string): Promise<NoteContent | null> {
    return this.parseFile(this.filePath(id, scope), scope)
  }

  async save(id: string, scope: string, body: string, tags?: string[]): Promise<NoteInfo> {
    const existing = await this.parseFile(this.filePath(id, scope), scope)
    const now = new Date().toISOString()
    const title = this.extractTitle(body)

    const fm = {
      title,
      tags: tags ?? existing?.info.tags ?? [],
      created: existing?.info.createdAt ?? now,
      modified: now,
    }

    const dir = this.scopeDir(scope)
    await fs.mkdir(dir, { recursive: true })

    const content = this.stringify(fm, body)
    await fs.writeFile(this.filePath(id, scope), content, 'utf-8')

    return {
      id,
      title,
      tags: fm.tags,
      scope,
      relativePath: path.join(scope, `${id}.md`),
      createdAt: fm.created,
      modifiedAt: now,
    }
  }

  async delete(id: string, scope: string): Promise<boolean> {
    try {
      await fs.unlink(this.filePath(id, scope))
      return true
    } catch {
      return false
    }
  }

  destroy(): void {
    // cleanup placeholder — no persistent resources
  }
}
