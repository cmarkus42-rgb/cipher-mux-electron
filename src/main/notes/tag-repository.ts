import * as fs from 'node:fs'
import * as path from 'node:path'
import type { TagClassRepository, TagClass } from '../../shared/types'

const TAGS_FILENAME = '.tags.json'

// ─── Seed Classes ────────────────────────────────────────

export const SEED_CLASSES: Record<string, TagClass> = {
  kind: {
    values: ['bugreport', 'feature', 'research', 'journal', 'reference', 'testcase', 'handoff', 'idea', 'todo'],
    color: '#6366f1',
  },
  status: {
    values: ['open', 'in-progress', 'done', 'blocked', 'archived'],
    color: '#f59e0b',
  },
  domain: {
    values: ['trading', 'infra', 'coding', 'ai-ml', 'security', 'automation'],
    color: '#10b981',
  },
  project: {
    values: ['cipher-mux', 'cipher-boox', 'openclaw'],
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
    } catch {
      // File doesn't exist yet — use seeds only
    }

    this.data = { classes: merged }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
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
}
