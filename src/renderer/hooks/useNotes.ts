import { useState, useEffect, useCallback } from 'preact/hooks'
import type { NoteInfo, NoteContent, TagRepository } from '../../shared/types'

const api = () => (window as any).cipherMux

export function useNotes(activeScope: string = 'global') {
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [tagRepo, setTagRepo] = useState<TagRepository>({ tags: {} })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [list, tags] = await Promise.all([
        api().notes.list(activeScope),
        api().notes.tags(),
      ])
      setNotes(list)
      setTagRepo(tags)
    } catch (err) {
      console.error('[useNotes] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [activeScope])

  useEffect(() => {
    refresh()
    const unsub = api().notes.onChanged(() => refresh())
    return () => unsub()
  }, [refresh])

  const createNote = useCallback(async (title: string, body: string) => {
    return api().notes.create(activeScope, title, body) as Promise<NoteInfo>
  }, [activeScope])

  const readNote = useCallback(async (id: string, scope: string) => {
    return api().notes.read(id, scope) as Promise<NoteContent | null>
  }, [])

  const saveNote = useCallback(async (id: string, scope: string, body: string, tags?: string[]) => {
    return api().notes.save(id, scope, body, tags) as Promise<NoteInfo>
  }, [])

  const deleteNote = useCallback(async (id: string, scope: string) => {
    return api().notes.delete(id, scope) as Promise<{ ok: boolean }>
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
  }
}
