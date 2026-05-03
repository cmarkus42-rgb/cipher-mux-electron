import * as fs from 'node:fs'
import * as path from 'node:path'
import matter from 'gray-matter'
import type { TagIndexData } from '../../shared/types'
import { TagClassRepo } from './tag-repository'

// ─── TagIndex ────────────────────────────────────────────
// Pure runtime cache built from notes frontmatter.
// Not persisted — rebuilt on startup and on changes.

export class TagIndex {
  private notesDir: string
  private tagClassRepo: TagClassRepo
  private index: TagIndexData

  constructor(notesDir: string, tagClassRepo: TagClassRepo) {
    this.notesDir = notesDir
    this.tagClassRepo = tagClassRepo
    this.index = this.emptyIndex()
  }

  private emptyIndex(): TagIndexData {
    return {
      tagToNoteIds: {},
      classValueCounts: {},
      totalNotes: 0,
      builtAt: new Date().toISOString(),
    }
  }

  /** Build the full index from all notes on disk. */
  rebuild(): TagIndexData {
    const idx = this.emptyIndex()

    let files: string[]
    try {
      files = fs.readdirSync(this.notesDir).filter(f => f.endsWith('.md'))
    } catch {
      this.index = idx
      return idx
    }

    for (const file of files) {
      const noteId = path.basename(file, '.md')
      try {
        const raw = fs.readFileSync(path.join(this.notesDir, file), 'utf-8')
        const parsed = matter(raw)
        const tags: string[] = parsed.data.tags ?? []

        idx.totalNotes++

        for (const tag of tags) {
          const normalized = tag.toLowerCase().trim()
          if (!normalized) continue

          // Tag → NoteIds
          if (!idx.tagToNoteIds[normalized]) {
            idx.tagToNoteIds[normalized] = []
          }
          idx.tagToNoteIds[normalized].push(noteId)

          // Class → Value → Count
          const { tagClass, value } = TagClassRepo.parseTag(normalized)
          if (tagClass) {
            if (!idx.classValueCounts[tagClass]) {
              idx.classValueCounts[tagClass] = {}
            }
            idx.classValueCounts[tagClass][value] = (idx.classValueCounts[tagClass][value] ?? 0) + 1

            // Auto-register unknown class:value combinations
            this.tagClassRepo.ensureTag(normalized)
          }
        }
      } catch {
        // Skip unparseable files
      }
    }

    idx.builtAt = new Date().toISOString()
    this.index = idx
    return idx
  }

  /** Get the current index data (snapshot). */
  getIndex(): TagIndexData {
    return this.index
  }

  /** Get note IDs for a specific tag. */
  getNoteIds(tag: string): string[] {
    return this.index.tagToNoteIds[tag.toLowerCase().trim()] ?? []
  }

  /** Get all values with counts for a class. */
  getClassCounts(className: string): Record<string, number> {
    return this.index.classValueCounts[className] ?? {}
  }

  /** Update index incrementally when a note changes. */
  updateNote(noteId: string, newTags: string[]): void {
    // Remove old entries for this noteId
    for (const [tag, ids] of Object.entries(this.index.tagToNoteIds)) {
      const filtered = ids.filter(id => id !== noteId)
      if (filtered.length === 0) {
        delete this.index.tagToNoteIds[tag]
      } else {
        this.index.tagToNoteIds[tag] = filtered
      }
    }

    // Rebuild classValueCounts from scratch (simpler than diffing)
    this.rebuildClassCounts()

    // Add new tags
    for (const tag of newTags) {
      const normalized = tag.toLowerCase().trim()
      if (!normalized) continue

      if (!this.index.tagToNoteIds[normalized]) {
        this.index.tagToNoteIds[normalized] = []
      }
      if (!this.index.tagToNoteIds[normalized].includes(noteId)) {
        this.index.tagToNoteIds[normalized].push(noteId)
      }

      const { tagClass, value } = TagClassRepo.parseTag(normalized)
      if (tagClass) {
        if (!this.index.classValueCounts[tagClass]) {
          this.index.classValueCounts[tagClass] = {}
        }
        this.index.classValueCounts[tagClass][value] = (this.index.classValueCounts[tagClass][value] ?? 0) + 1
        this.tagClassRepo.ensureTag(normalized)
      }
    }
  }

  /** Remove a note from the index. */
  removeNote(noteId: string): void {
    for (const [tag, ids] of Object.entries(this.index.tagToNoteIds)) {
      const filtered = ids.filter(id => id !== noteId)
      if (filtered.length === 0) {
        delete this.index.tagToNoteIds[tag]
      } else {
        this.index.tagToNoteIds[tag] = filtered
      }
    }
    this.index.totalNotes = Math.max(0, this.index.totalNotes - 1)
    this.rebuildClassCounts()
  }

  /** Add a new note to the index. */
  addNote(noteId: string, tags: string[]): void {
    this.index.totalNotes++
    for (const tag of tags) {
      const normalized = tag.toLowerCase().trim()
      if (!normalized) continue

      if (!this.index.tagToNoteIds[normalized]) {
        this.index.tagToNoteIds[normalized] = []
      }
      if (!this.index.tagToNoteIds[normalized].includes(noteId)) {
        this.index.tagToNoteIds[normalized].push(noteId)
      }

      const { tagClass, value } = TagClassRepo.parseTag(normalized)
      if (tagClass) {
        if (!this.index.classValueCounts[tagClass]) {
          this.index.classValueCounts[tagClass] = {}
        }
        this.index.classValueCounts[tagClass][value] = (this.index.classValueCounts[tagClass][value] ?? 0) + 1
        this.tagClassRepo.ensureTag(normalized)
      }
    }
  }

  /** Rebuild classValueCounts from tagToNoteIds. */
  private rebuildClassCounts(): void {
    this.index.classValueCounts = {}
    for (const [tag, ids] of Object.entries(this.index.tagToNoteIds)) {
      const { tagClass, value } = TagClassRepo.parseTag(tag)
      if (!tagClass) continue
      if (!this.index.classValueCounts[tagClass]) {
        this.index.classValueCounts[tagClass] = {}
      }
      this.index.classValueCounts[tagClass][value] = ids.length
    }
  }
}
