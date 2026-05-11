// src/renderer/components/DetachedNoteView.tsx

import { h } from 'preact'
import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { useTheme } from '../hooks/useTheme'
import { NoteEditor } from './NoteEditor'
import { TestcaseView } from './TestcaseView'
import { TagBar } from './TagBar'
import type { ParsedTestcase, TestcaseSection } from '../../main/notes/testcase-parser'

interface DetachedNoteViewProps {
  noteId: string
}

export function DetachedNoteView({ noteId }: DetachedNoteViewProps) {
  useTheme()
  const [title, setTitle] = useState<string>('')
  const [content, setContent] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [testcase, setTestcase] = useState<ParsedTestcase | null>(null)
  const [voiceState, setVoiceState] = useState<string>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const loadedRef = useRef(false)

  // Dynamic window title
  useEffect(() => {
    document.title = title || 'Note'
  }, [title])

  // Track latest content for close-save
  const latestContentRef = useRef<string | null>(null)

  // Flush pending save on window close
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        const api = (window as any).cipherMux
        api?.notes?.save?.(noteId, latestContentRef.current!, undefined, true)
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [noteId])

  // Auto-dismiss save errors after 5s
  useEffect(() => {
    if (!saveError) return
    const t = setTimeout(() => setSaveError(null), 5000)
    return () => clearTimeout(t)
  }, [saveError])

  // Voice state tracking for STT indicator
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.voice?.onState) return
    const unsub = api.voice.onState((state: string) => setVoiceState(state))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (loadedRef.current) return
    const api = (window as any).cipherMux
    if (!api?.notes?.read) {
      setError('Notes API not available')
      return
    }
    api.notes.read(noteId).then(async (result: any) => {
      if (!result) {
        setError(`Note "${noteId}" not found`)
        return
      }
      loadedRef.current = true
      setTitle(result.info?.title ?? 'Untitled')
      setContent(result.body ?? '')
      setTags(result.info?.tags ?? [])
      // Detect testcase note
      if (result.info?.tags?.includes('kind:testcase')) {
        try {
          const parsed = await api.notes.parseTestcase(noteId)
          if (parsed) setTestcase(parsed)
        } catch (err) {
          console.error('[DetachedNoteView] Failed to parse testcase:', err)
        }
      }
    }).catch((err: Error) => {
      setError(err.message)
    })
  }, [noteId])

  const handleSave = useCallback(async (body: string) => {
    latestContentRef.current = body
    dirtyRef.current = true
    try {
      const api = (window as any).cipherMux
      const result = await api.notes.save(noteId, body)
      if (result?.title) setTitle(result.title)
      dirtyRef.current = false
      setSaveError(null)
    } catch (err: any) {
      setSaveError(err?.message ?? 'Save failed')
    }
  }, [noteId])

  const handleAutoSave = useCallback(async (body: string) => {
    latestContentRef.current = body
    dirtyRef.current = true
    try {
      const api = (window as any).cipherMux
      const result = await api.notes.save(noteId, body, undefined, true)
      if (result?.title) setTitle(result.title)
      dirtyRef.current = false
      setSaveError(null)
    } catch (err: any) {
      setSaveError(err?.message ?? 'Auto-save failed')
    }
  }, [noteId])

  const handleTagsChange = useCallback(async (newTags: string[]) => {
    try {
      const api = (window as any).cipherMux
      await api.notes.save(noteId, content ?? '', newTags, true)
      setTags(newTags)
    } catch (err: any) {
      setSaveError(err?.message ?? 'Tag save failed')
    }
  }, [noteId, content])

  const handleDock = useCallback(() => {
    const api = (window as any).cipherMux
    api?.detach?.dock?.(noteId)
  }, [noteId])

  const handleTestcaseUpdate = useCallback(async (sections: TestcaseSection[]) => {
    if (!testcase) return
    try {
      const api = (window as any).cipherMux
      const updated: ParsedTestcase = { ...testcase, sections }
      const body = await api.notes.serializeTestcaseBody(sections)
      if (!body) { console.error('[DetachedNoteView] serializeTestcaseBody returned null'); return }
      dirtyRef.current = true
      const result = await api.notes.save(noteId, body, undefined, true)
      if (result?.title) setTitle(result.title)
      latestContentRef.current = body
      dirtyRef.current = false
      setContent(body)
      setTestcase(updated)
    } catch (err: any) {
      setSaveError(err?.message ?? 'Testcase save failed')
    }
  }, [noteId, testcase])

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg)', fontFamily: 'monospace' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Note unavailable</div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>{error}</div>
        </div>
      </div>
    )
  }

  if (content === null) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg)', fontFamily: 'monospace', opacity: 0.5 }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Minimal titlebar with drag region and dock button */}
      <div class="drag-region" style={{
        height: 28,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
      }}>
        <span style={{ fontSize: 11, opacity: 0.5, color: 'var(--fg)', pointerEvents: 'none' }}>
          {title}
        </span>
        <button
          onClick={handleDock}
          title="Dock back to grid"
          style={{
            background: 'none',
            border: '1px solid var(--border, #555)',
            borderRadius: 3,
            color: 'var(--fg)',
            fontSize: 10,
            padding: '1px 6px',
            cursor: 'pointer',
            opacity: 0.6,
            WebkitAppRegion: 'no-drag',
          }}
        >
          Dock
        </button>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div style={{
          padding: '3px 8px',
          fontSize: 11,
          color: '#fff',
          background: 'var(--color-neon-red, #ef4444)',
          textAlign: 'center',
          flexShrink: 0,
          cursor: 'pointer',
        }} onClick={() => setSaveError(null)}>
          Save failed: {saveError}
        </div>
      )}

      {/* STT recording indicator */}
      {voiceState === 'recording' && (
        <div style={{
          padding: '2px 8px',
          fontSize: 10,
          color: 'var(--color-neon-red, #ef4444)',
          background: 'var(--color-bg-sunken, #111)',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          STT recording...
        </div>
      )}

      {/* Tag bar — hide for testcase notes */}
      {!testcase && <TagBar tags={tags} onTagsChange={handleTagsChange} />}

      {/* Editor or TestcaseView */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} class="notes-editor-area">
        {testcase ? (
          <TestcaseView
            key={noteId}
            testcase={testcase}
            onUpdate={handleTestcaseUpdate}
          />
        ) : (
          <NoteEditor
            key={noteId}
            content={content}
            onSave={handleSave}
            onAutoSave={handleAutoSave}
          />
        )}
      </div>
    </div>
  )
}
