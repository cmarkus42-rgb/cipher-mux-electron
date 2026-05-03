// src/main/notes/note-search-index.ts
// FlexSearch-based full-text search index for notes (REQ-NOTES-002).
// In-memory index, source of truth remains the MD files on disk.

import { Document } from 'flexsearch'
import type { NoteInfo, NoteContent } from '../../shared/types'
import type { NoteManager } from './note-manager'

interface NoteDoc {
  [key: string]: string
  id: string
  title: string
  tags: string
  body: string
}

export interface NoteSearchResult {
  info: NoteInfo
  body: string
}

export class NoteSearchIndex {
  private index: Document<NoteDoc>
  private noteCache = new Map<string, NoteContent>()

  constructor() {
    this.index = new Document<NoteDoc>({
      document: {
        id: 'id',
        index: ['title', 'tags', 'body'],
      },
      tokenize: 'forward',
    })
  }

  /** Build index from all notes on disk. Call once at startup. */
  async buildFromManager(manager: NoteManager): Promise<void> {
    const notes = await manager.list()
    const contents = await Promise.all(notes.map(n => manager.read(n.id)))

    for (const content of contents) {
      if (!content) continue
      this.addToIndex(content)
    }
  }

  /** Add or update a note in the index. */
  addOrUpdate(content: NoteContent): void {
    // Remove first to avoid stale data
    try { this.index.remove(content.info.id) } catch { /* not in index yet */ }
    this.addToIndex(content)
  }

  /** Remove a note from the index. */
  remove(id: string): void {
    try { this.index.remove(id) } catch { /* not in index */ }
    this.noteCache.delete(id)
  }

  /**
   * Search notes by query string. Searches title, tags, and body.
   * Returns up to `limit` results (default 50).
   */
  search(query: string, limit = 50): NoteSearchResult[] {
    if (!query.trim()) return []

    const results = this.index.search(query, { limit }) as any

    // FlexSearch Document.search returns per-field arrays: [{ field, result: [id, ...] }, ...]
    const idSet: Record<string, boolean> = {}
    if (Array.isArray(results)) {
      for (const item of results) {
        if (typeof item === 'object' && item.result) {
          for (const id of item.result) {
            idSet[String(id)] = true
          }
        } else if (typeof item === 'string' || typeof item === 'number') {
          idSet[String(item)] = true
        }
      }
    }

    const ids = Object.keys(idSet)
    const matched: NoteSearchResult[] = []
    for (const id of ids) {
      const cached = this.noteCache.get(id)
      if (cached) {
        matched.push({ info: cached.info, body: cached.body })
      }
    }

    // Sort: title matches first, then by modifiedAt desc
    const lowerQuery = query.toLowerCase()
    matched.sort((a, b) => {
      const aTitle = a.info.title.toLowerCase().includes(lowerQuery) ? 0 : 1
      const bTitle = b.info.title.toLowerCase().includes(lowerQuery) ? 0 : 1
      if (aTitle !== bTitle) return aTitle - bTitle
      return b.info.modifiedAt.localeCompare(a.info.modifiedAt)
    })

    return matched.slice(0, limit)
  }

  /** Get the number of indexed notes. */
  get size(): number {
    return this.noteCache.size
  }

  private addToIndex(content: NoteContent): void {
    const doc: NoteDoc = {
      id: content.info.id,
      title: content.info.title,
      tags: content.info.tags.join(' '),
      body: content.body,
    }
    this.index.add(doc)
    this.noteCache.set(content.info.id, content)
  }
}
