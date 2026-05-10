import * as fs from 'node:fs'
import * as path from 'node:path'
import type { TagClassRepository, TagClass } from '../../shared/types'

const TAGS_FILENAME = '.tags.json'

// ─── Seed Classes ────────────────────────────────────────

export const SEED_CLASSES: Record<string, TagClass> = {
  kind: {
    values: ['bugreport', 'feature-request', 'reference', 'testcase', 'handoff', 'spec', 'todo'],
    color: '#6366f1',
  },
  status: {
    values: ['open', 'in-progress', 'done', 'blocked', 'archived'],
    color: '#f59e0b',
  },
  domain: {
    values: ['ui'],
    color: '#10b981',
  },
  project: {
    values: ['cipher-mux'],
    color: '#8b5cf6',
  },
  scope: {
    values: [],
    color: '#64748b',
  },
}

// ─── TagClassRepository ──────────────────────────────────

export class TagClassRepo {
  private filePath: string
  private data: TagClassRepository

  constructor(notesDir: string) {
    this.filePath = path.join(notesDir, TAGS_FILENAME)
    this.data = { classes: {} }
    this.load()
  }

  private load(): void {
    // Start with seeds
    const merged: Record<string, TagClass> = {}
    for (const [cls, entry] of Object.entries(SEED_CLASSES)) {
      merged[cls] = { values: [...entry.values], color: entry.color }
    }

    let synonyms: Record<string, string> = {}

    // Merge persisted
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const persisted = JSON.parse(raw) as TagClassRepository
      if (persisted.classes && typeof persisted.classes === 'object') {
        for (const [cls, entry] of Object.entries(persisted.classes)) {
          if (merged[cls]) {
            // Merge values (union), persisted color wins
            const valueSet = new Set([...merged[cls].values, ...entry.values])
            merged[cls] = {
              values: [...valueSet],
              color: entry.color ?? merged[cls].color,
            }
          } else {
            merged[cls] = { values: [...entry.values], color: entry.color }
          }
        }
      }
      // Load synonyms (additive field, backward compatible)
      if (persisted.synonyms && typeof persisted.synonyms === 'object') {
        synonyms = { ...persisted.synonyms }
      }
    } catch {
      // File doesn't exist yet — use seeds only
    }

    this.data = { classes: merged, synonyms }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath)
      fs.mkdirSync(dir, { recursive: true })
      // Merge with existing file to avoid clobbering NoteTagging's 'tags' field
      let existing: Record<string, unknown> = {}
      try {
        existing = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
      } catch { /* file missing or invalid — start fresh */ }
      const merged = { ...existing, classes: this.data.classes, synonyms: this.data.synonyms }
      fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf-8')
    } catch {
      // Non-fatal
    }
  }

  getRepository(): TagClassRepository {
    return this.data
  }

  /** Parse a tag string into [class, value]. Legacy tags without colon get class=null. */
  static parseTag(tag: string): { tagClass: string | null; value: string } {
    const idx = tag.indexOf(':')
    if (idx === -1) return { tagClass: null, value: tag }
    return { tagClass: tag.slice(0, idx), value: tag.slice(idx + 1) }
  }

  /** Ensure a tag's class and value are registered. Auto-adds unknown classes/values. */
  ensureTag(tag: string): boolean {
    const { tagClass, value } = TagClassRepo.parseTag(tag)
    if (!tagClass) return false // legacy tag, no class

    let changed = false
    if (!this.data.classes[tagClass]) {
      this.data.classes[tagClass] = { values: [], color: undefined }
      changed = true
    }
    if (!this.data.classes[tagClass].values.includes(value)) {
      this.data.classes[tagClass].values.push(value)
      changed = true
    }
    if (changed) this.save()
    return changed
  }

  /** Register multiple tags at once. Returns true if any were new. */
  ensureTags(tags: string[]): boolean {
    let anyChanged = false
    for (const tag of tags) {
      const { tagClass, value } = TagClassRepo.parseTag(tag)
      if (!tagClass) continue

      if (!this.data.classes[tagClass]) {
        this.data.classes[tagClass] = { values: [], color: undefined }
        anyChanged = true
      }
      if (!this.data.classes[tagClass].values.includes(value)) {
        this.data.classes[tagClass].values.push(value)
        anyChanged = true
      }
    }
    if (anyChanged) this.save()
    return anyChanged
  }

  /** Set or update color for a class. */
  setClassColor(className: string, color: string): void {
    if (!this.data.classes[className]) {
      this.data.classes[className] = { values: [], color }
    } else {
      this.data.classes[className] = { ...this.data.classes[className], color }
    }
    this.save()
  }

  /** Get all known class names. */
  getClassNames(): string[] {
    return Object.keys(this.data.classes)
  }

  /** Get values for a class. */
  getClassValues(className: string): string[] {
    return this.data.classes[className]?.values ?? []
  }

  // ─── Synonyms ─────────────────────────────────────────────

  /** Resolve a single tag through the synonym map. Returns canonical tag or original. */
  resolveSynonym(tag: string): string {
    return this.data.synonyms?.[tag] ?? tag
  }

  /** Resolve multiple tags, replacing synonyms and deduplicating. */
  resolveSynonyms(tags: string[]): string[] {
    const resolved = tags.map(t => this.resolveSynonym(t))
    return [...new Set(resolved)]
  }

  /** Add a synonym mapping (from → to). Persists immediately. */
  addSynonym(from: string, to: string): void {
    if (!this.data.synonyms) this.data.synonyms = {}
    this.data.synonyms[from] = to
    this.save()
  }

  /** Remove a synonym mapping. */
  removeSynonym(from: string): void {
    if (!this.data.synonyms?.[from]) return
    delete this.data.synonyms[from]
    this.save()
  }

  /** Get the full synonym map. */
  getSynonyms(): Record<string, string> {
    return { ...(this.data.synonyms ?? {}) }
  }

  // ─── Class CRUD ───────────────────────────────────────────

  /** Create a new tag class. Returns false if it already exists. */
  createClass(name: string, color: string): boolean {
    if (this.data.classes[name]) return false
    this.data.classes[name] = { values: [], color }
    this.save()
    return true
  }

  /** Rename a tag class. Updates all notes with tags in this class. Returns false on conflict. */
  renameClass(oldName: string, newName: string): boolean {
    if (!this.data.classes[oldName]) return false
    if (this.data.classes[newName]) return false

    // Move class data
    this.data.classes[newName] = { ...this.data.classes[oldName] }
    delete this.data.classes[oldName]
    this.save()

    // Rename tags in note frontmatter: oldName:value → newName:value
    this.propagateClassRename(oldName, newName)
    return true
  }

  /** Delete a tag class. Tags remain in notes as unclassified. */
  deleteClass(className: string): boolean {
    if (!this.data.classes[className]) return false
    delete this.data.classes[className]
    this.save()
    return true
  }

  /** Add a single value to an existing class. Returns true if added (false if class missing or duplicate). */
  addValue(className: string, value: string): boolean {
    const cls = this.data.classes[className]
    if (!cls) return false
    const normalized = value.toLowerCase().trim()
    if (!normalized || cls.values.includes(normalized)) return false
    cls.values.push(normalized)
    this.save()
    return true
  }

  /** Remove a single value from a class. Returns true if the value was found and removed. */
  removeValue(className: string, value: string): boolean {
    const cls = this.data.classes[className]
    if (!cls) return false
    const idx = cls.values.indexOf(value.toLowerCase().trim())
    if (idx === -1) return false
    cls.values.splice(idx, 1)
    this.save()
    return true
  }

  /** Propagate class rename across all notes in the directory. */
  private propagateClassRename(oldClass: string, newClass: string): void {
    const matter = require('gray-matter')
    const dir = path.dirname(this.filePath)
    let files: string[]
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    } catch {
      return
    }

    const prefix = oldClass + ':'
    for (const file of files) {
      const filePath = path.join(dir, file)
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const parsed = matter(raw)
        const tags: string[] = parsed.data.tags ?? []
        let changed = false
        const newTags = tags.map((t: string) => {
          if (t.startsWith(prefix)) {
            changed = true
            return newClass + ':' + t.slice(prefix.length)
          }
          return t
        })
        if (changed) {
          parsed.data.tags = newTags
          parsed.data.modified = new Date().toISOString()
          fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8')
        }
      } catch { /* skip */ }
    }
  }
}
