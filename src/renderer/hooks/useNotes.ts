import { useState, useEffect, useCallback } from 'preact/hooks'
import type { NoteInfo, NoteContent, TagRepository } from '../../shared/types'

const api = () => (window as any).cipherMux

export function useNotes() {
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [tagRepo, setTagRepo] = useState<TagRepository>({ tags: {} })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [list, tags] = await Promise.all([
        api().notes.list(),
        api().notes.tags(),
      ])
      setNotes(list)
      setTagRepo(tags)
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

  /** Full-text search via FlexSearch backend. Returns NoteInfo[] for matching notes. */
  const searchNotes = useCallback(async (query: string, tags?: string[]): Promise<NoteInfo[]> => {
    if (!query.trim()) return []
    const results = await api().notes.search(query, tags)
    return (results as Array<{ info: NoteInfo; body: string }>).map(r => r.info)
  }, [])

  return {
    notes,
    tagRepo,
    loading,
    refresh,
    createNote,
    readNote,
    saveNote,
    deleteNote,
    searchNotes,
  }
}
