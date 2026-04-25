// src/renderer/components/NotesCell.tsx

import { useState, useCallback, useEffect } from 'preact/hooks'
import { NoteEditor } from './NoteEditor'
import { useNotes } from '../hooks/useNotes'
import type { NoteInfo } from '../../shared/types'

interface NoteTab {
  id: string
  scope: string
  title: string
  content: string
  dirty: boolean
}

interface NotesCellProps {
  rowSpan: number
  maxRows: number
  activeWorkspaceId: string | null
  onClose: () => void
  onToggleExpand: () => void
  onDragStart: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function NotesCell({
  rowSpan,
  maxRows,
  activeWorkspaceId,
  onClose,
  onToggleExpand,
  onDragStart,
  onDragOver,
  onDrop,
}: NotesCellProps) {
  const scope = activeWorkspaceId ? `workspace-${activeWorkspaceId}` : 'global'
  const { saveNote } = useNotes(scope)
  const [tabs, setTabs] = useState<NoteTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  const openNote = useCallback(
    async (info: NoteInfo) => {
      // Check if already open
      const existing = tabs.find((t) => t.id === info.id)
      if (existing) {
        setActiveTabId(info.id)
        return
      }
      // Read content
      const apiObj = (window as any).cipherMux
      const result = await apiObj.notes.read(info.id, info.scope)
      if (!result) return

      const tab: NoteTab = {
        id: info.id,
        scope: info.scope,
        title: info.title,
        content: result.body,
        dirty: false,
      }
      setTabs((prev) => [...prev, tab])
      setActiveTabId(info.id)
    },
    [tabs],
  )

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId)
        if (activeTabId === tabId) {
          setActiveTabId(filtered.length > 0 ? filtered[filtered.length - 1].id : null)
        }
        return filtered
      })
    },
    [activeTabId],
  )

  const handleCreateNote = useCallback(async () => {
    const apiObj = (window as any).cipherMux
    const note = await apiObj.notes.create(scope, '', '# ')
    const tab: NoteTab = {
      id: note.id,
      scope: note.scope,
      title: '(new)',
      content: '# ',
      dirty: false,
    }
    setTabs((prev) => [...prev, tab])
    setActiveTabId(note.id)
  }, [scope])

  const handleSave = useCallback(
    (content: string) => {
      if (!activeTab) return
      saveNote(activeTab.id, activeTab.scope, content)
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, content, dirty: false } : t)),
      )
    },
    [activeTab, saveNote],
  )

  const handleAutoSave = useCallback(
    (content: string) => {
      if (!activeTab) return
      const apiObj = (window as any).cipherMux
      // Auto-save writes file but doesn't trigger tagging
      apiObj.notes.save(activeTab.id, activeTab.scope, content, undefined, true)
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, content, dirty: false } : t)),
      )
    },
    [activeTab],
  )

  // Expose openNote for external calls (from sidebar)
  useEffect(() => {
    ;(window as any).__notesCell_openNote = openNote
    return () => {
      delete (window as any).__notesCell_openNote
    }
  }, [openNote])

  const expanded = rowSpan > 1
  const cellStyle = expanded ? { gridRow: `span ${rowSpan}` } : undefined

  return (
    <div
      class="session-cell notes-cell"
      style={cellStyle}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div class="cell-header" draggable onDragStart={onDragStart}>
        <div class="cell-header__left">
          <span class="neon-dot neon-dot--info" />
          <span class="cell-name">NOTES</span>
          <span class="cell-sep">·</span>
          <span class="cell-ctx ctx-ok">
            {scope === 'global' ? 'global' : activeWorkspaceId}
          </span>
        </div>
        <div class="cell-header__right">
          {maxRows > 1 && (
            <button
              class={`cell-btn ${expanded ? 'cell-btn--active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
              title={expanded ? 'höhe zurücksetzen' : 'volle höhe'}
            >
              {expanded ? '↥' : '↧'}
            </button>
          )}
          <button
            class="cell-btn"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            title="notes schließen"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div class="notes-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            class={`notes-tab ${tab.id === activeTabId ? 'notes-tab--active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span class="notes-tab__title">{tab.title || '(new)'}</span>
            <button
              class="notes-tab__close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button class="notes-tab notes-tab--add" onClick={handleCreateNote} title="neue note">
          +
        </button>
      </div>

      {/* Editor */}
      <div class="notes-editor-area">
        {activeTab ? (
          <NoteEditor
            key={activeTab.id}
            content={activeTab.content}
            onSave={handleSave}
            onAutoSave={handleAutoSave}
          />
        ) : (
          <div class="notes-empty">
            <p>Doppelklick auf eine Note in der Sidebar</p>
            <p>oder</p>
            <button class="btn btn--sm" onClick={handleCreateNote}>
              + neue note
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
