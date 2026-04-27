// src/renderer/components/NotesCell.tsx

import { useState, useCallback, useEffect } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
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
  slotCol?: number
  slotRow?: number
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
  slotCol,
  slotRow,
  onClose,
  onToggleExpand,
  onDragStart,
  onDragOver,
  onDrop,
}: NotesCellProps) {
  const { t } = useTranslation()
  const scope = activeWorkspaceId ? `workspace-${activeWorkspaceId}` : 'global'
  const { saveNote, deleteNote } = useNotes(scope)
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

  const handleDeleteNote = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab) return
      if (!confirm(t('notesCell.confirmDelete', { title: tab.title || tab.id }))) return
      await deleteNote(tab.id, tab.scope)
      closeTab(tabId)
    },
    [tabs, deleteNote, closeTab],
  )

  const handleCreateNote = useCallback(async () => {
    const apiObj = (window as any).cipherMux
    const note = await apiObj.notes.create(scope, '', '# ')
    const tab: NoteTab = {
      id: note.id,
      scope: note.scope,
      title: t('notesCell.newTitle'),
      content: '# ',
      dirty: false,
    }
    setTabs((prev) => [...prev, tab])
    setActiveTabId(note.id)
  }, [scope])

  const handleSave = useCallback(
    async (content: string) => {
      if (!activeTab) return
      const result = await saveNote(activeTab.id, activeTab.scope, content)
      const title = result?.title || activeTab.title
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, content, title, dirty: false } : t)),
      )
    },
    [activeTab, saveNote],
  )

  const handleAutoSave = useCallback(
    async (content: string) => {
      if (!activeTab) return
      const apiObj = (window as any).cipherMux
      // Auto-save writes file but doesn't trigger tagging
      const result = await apiObj.notes.save(activeTab.id, activeTab.scope, content, undefined, true)
      const title = result?.title || activeTab.title
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, content, title, dirty: false } : t)),
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
      data-highlight={slotCol != null && slotRow != null ? `cell-${slotCol}-${slotRow}` : undefined}
    >
      <div class="cell-header" draggable onDragStart={onDragStart}>
        <div class="cell-header__left">
          <span class="neon-dot neon-dot--info" />
          <span class="cell-name">{t('notesCell.header')}</span>
          <span class="cell-sep">·</span>
          <span class="cell-ctx ctx-ok">
            {scope === 'global' ? t('notesCell.scopeGlobal') : activeWorkspaceId}
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
              title={expanded ? t('notesCell.collapseHeight') : t('notesCell.expandHeight')}
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
            title={t('notesCell.closeNotes')}
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
            <span class="notes-tab__title">{(tab.title && tab.title !== 'Untitled') ? tab.title : t('notesCell.untitled')}</span>
            {tab.id === activeTabId && (
              <button
                class="notes-tab__delete"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteNote(tab.id)
                }}
                title={t('notesCell.deleteNote')}
              >
                <span class="icon-trash" />
              </button>
            )}
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
        <button class="notes-tab notes-tab--add" onClick={handleCreateNote} title={t('notesCell.newNote')}>
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
            <p>{t('notesCell.emptyHint')}</p>
            <p>{t('notesCell.emptyOr')}</p>
            <button class="btn btn--sm" onClick={handleCreateNote}>
              {t('notesCell.newNoteButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
