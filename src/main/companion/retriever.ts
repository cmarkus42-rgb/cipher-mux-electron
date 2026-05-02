import type { MemoryStore } from './memory-store'
import type { Memory } from '../../shared/types'

/**
 * FTS5-based retriever for companion memories.
 * Phase 1: pure text search. Phase 2 will add embedding-based hybrid retrieval.
 */
export class Retriever {
  constructor(private store: MemoryStore) {}

  /** Retrieve memories matching a query, ranked by FTS5 relevance. */
  retrieve(query: string, limit = 5): Memory[] {
    return this.store.search(query, { limit })
  }
}
