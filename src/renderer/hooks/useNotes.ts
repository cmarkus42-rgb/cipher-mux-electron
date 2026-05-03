import { useState, useEffect, useCallback } from 'preact/hooks'
import type { NoteInfo, NoteContent, TagRepository, TagClassRepository, TagIndexData } from '../../shared/types'

const api = () => (window as any).cipherMux

export function useNotes() {
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [tagRepo, setTagRepo] = useState<TagRepository>({ tags: {} })
  const [tagClassRepo, setTagClassRepo] = useState<TagClassRepository>({ classes: {} })
  const [tagIndex, setTagIndex] = useState<TagIndexData>({ tagToNoteIds: {}, classValueCounts: {}, totalNotes: 0, builtAt: '' })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [list, tags, classRepo, idx] = await Promise.all([
        api().notes.list(),
        api().notes.tags(),
        api().notes.tagClassRepo().catch(() => ({ classes: {} } as TagClassRepository)),
        api().notes.tagIndex().catch(() => ({ tagToNoteIds: {}, classValueCounts: {}, totalNotes: 0, builtAt: '' } as TagIndexData)),
      ])
      setNotes(list)
      setTagRepo(tags)
      setTagClassRepo(classRepo)
      setTagIndex(idx)
    } catch (err) {
      console.error('[useNotes] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const unsub = api().notes.onChanged(() => refresh())
    return () => unsub()
  }, [refresh])

  const createNote = useCallback(async (title: string, body: string, tags?: string[]) => {
    return api().notes.create(title, body, tags) as Promise<NoteInfo>
  }, [])

  const readNote = useCallback(async (id: string) => {
    return api().notes.read(id) as Promise<NoteContent | null>
  }, [])

  const saveNote = useCallback(async (id: string, body: string, tags?: string[]) => {
    return api().notes.save(id, body, tags) as Promise<NoteInfo>
  }, [])

  const deleteNote = useCallback(async (id: string) => {
    return api().notes.delete(id) as Promise<{ ok: boolean }>
  }, [])

  /** Trash note (soft delete with undo support). REQ-NOTES-006 */
  const trashNote = useCallback(async (id: string) => {
    return api().notes.trash(id) as Promise<{ ok: boolean }>
  }, [])

  /** Bulk trash with undo support. REQ-NOTES-006 */
  const trashMany = useCallback(async (ids: string[]) => {
    return api().notes.trashMany(ids) as Promise<{ trashed: string[] }>
  }, [])

  /** Restore note from trash. REQ-NOTES-006 */
  const restoreMany = useCallback(async (ids: string[]) => {
    return api().notes.restoreMany(ids) as Promise<{ restored: string[] }>
  }, [])

  /** Bulk add tag. REQ-NOTES-005 */
  const bulkTagAdd = useCallback(async (ids: string[], tag: string) => {
    return api().notes.bulkTagAdd(ids, tag) as Promise<{ updated: string[] }>
  }, [])

  /** Bulk remove tag. REQ-NOTES-005 */
  const bulkTagRemove = useCallback(async (ids: string[], tag: string) => {
    return api().notes.bulkTagRemove(ids, tag) as Promise<{ updated: string[] }>
  }, [])

  /** Full-text search via FlexSearch backend. Returns NoteInfo[] for matching notes. */
  const searchNotes = useCallback(async (query: string, tags?: string[]): Promise<NoteInfo[]> => {
    if (!query.trim()) return []
    const results = await api().notes.search(query, tags)
    return (results as Array<{ info: NoteInfo; body: string }>).map(r => r.info)
  }, [])

  return {
    notes,
    tagRepo,
    tagClassRepo,
    tagIndex,
    loading,
    refresh,
    createNote,
    readNote,
    saveNote,
    deleteNote,
    trashNote,
    trashMany,
    restoreMany,
    bulkTagAdd,
    bulkTagRemove,
    searchNotes,
  }
}
