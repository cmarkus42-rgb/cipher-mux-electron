// src/renderer/components/NotesCell.tsx

import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { NoteEditor } from './NoteEditor'
import { TagBar } from './TagBar'
import { TestcaseView } from './TestcaseView'
import { useNotes } from '../hooks/useNotes'
import type { NoteInfo } from '../../shared/types'
import type { ParsedTestcase, TestcaseSection } from '../../main/notes/testcase-parser'

interface NoteTab {
  id: string
  title: string
  content: string
  tags: string[]
  dirty: boolean
  /** Parsed testcase data — present only if this is a testcase note. */
  testcase?: ParsedTestcase
  /** Raw file content including frontmatter (for testcase serialization). */
  rawContent?: string
}

interface NotesCellProps {
  rowSpan: number
  maxRows: number
  activeWorkspaceId: string | null
  slotIndex: number
  slotCol?: number
  slotRow?: number
  onClose: () => void
  onToggleExpand: () => void
  onDragStart: () => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
  dragOver?: boolean
}

export function NotesCell({
  rowSpan,
  maxRows,
  activeWorkspaceId,
  slotIndex,
  slotCol,
  slotRow,
  onClose,
  onToggleExpand,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  dragOver,
}: NotesCellProps) {
  const { t } = useTranslation()
  const { saveNote, deleteNote } = useNotes()
  const [tabs, setTabs] = useState<NoteTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  const openNote = useCallback(
    async (info: NoteInfo) => {
      // Check if already open
      const existing = tabs.find((t) => t.id === info.id)
      if (existing) {
        // Detect noteType change: if testcase tag was added or removed, reload the tab
        const wasTestcase = !!existing.testcase
        const isTestcase = !!info.tags?.includes('testcase')
        if (wasTestcase === isTestcase) {
          setActiveTabId(info.id)
          return
        }
        // noteType changed — remove stale tab and fall through to reload
        setTabs((prev) => prev.filter((t) => t.id !== info.id))
      }
      // Read content
      const apiObj = (window as any).cipherMux
      const result = await apiObj.notes.read(info.id)
      if (!result) return

      // Detect testcase note — parsing runs in main process via IPC
      let testcase: ParsedTestcase | undefined
      if (info.tags?.includes('testcase')) {
        try {
          const parsed = await apiObj.notes.parseTestcase(info.id)
          testcase = parsed ?? undefined
        } catch (err) {
          console.error('[NotesCell] Failed to parse testcase:', err)
        }
      }

      const tab: NoteTab = {
        id: info.id,
        title: info.title,
        content: result.body,
        tags: info.tags ?? [],
        dirty: false,
        testcase,
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
      await deleteNote(tab.id)
      closeTab(tabId)
    },
    [tabs, deleteNote, closeTab],
  )

  const handleCreateNote = useCallback(async () => {
    const apiObj = (window as any).cipherMux
    const note = await apiObj.notes.create('', '# ')
    const tab: NoteTab = {
      id: note.id,
      title: t('notesCell.newTitle'),
      content: '# ',
      tags: note.tags ?? [],
      dirty: false,
    }
    setTabs((prev) => [...prev, tab])
    setActiveTabId(note.id)
  }, [])

  const handleSave = useCallback(
    async (content: string) => {
      if (!activeTab) return
      const result = await saveNote(activeTab.id, content)
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
      const result = await apiObj.notes.save(activeTab.id, content, undefined, true)
      const title = result?.title || activeTab.title
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, content, title, dirty: false } : t)),
      )
    },
    [activeTab],
  )

  const handleTagsChange = useCallback(
    async (newTags: string[]) => {
      if (!activeTab) return
      const apiObj = (window as any).cipherMux
      // Save with current body + new tags
      await apiObj.notes.save(activeTab.id, activeTab.content, newTags, true)
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, tags: newTags } : t)),
      )
    },
    [activeTab],
  )

  // Testcase: update sections → serialize via IPC → save
  const handleTestcaseUpdate = useCallback(
    async (sections: TestcaseSection[]) => {
      if (!activeTab?.testcase) return
      const apiObj = (window as any).cipherMux
      const updated: ParsedTestcase = { ...activeTab.testcase, sections }
      const body = await apiObj.notes.serializeTestcaseBody(sections)
      if (!body) { console.error('[NotesCell] serializeTestcaseBody returned null'); return }
      const result = await saveNote(activeTab.id, body)
      const title = result?.title || activeTab.title
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id ? { ...t, content: body, title, testcase: updated, dirty: false } : t
        ),
      )
    },
    [activeTab, saveNote],
  )

  // Testcase: archive — summarize locally (pure logic), serialize via IPC
  const handleTestcaseArchive = useCallback(async () => {
    if (!activeTab?.testcase) return
    const apiObj = (window as any).cipherMux
    // Summarize locally (no Node.js deps needed)
    const sections = activeTab.testcase.sections
    let total = 0, pass = 0, fail = 0
    for (const s of sections) {
      for (const item of s.items) {
        total++
        if (item.status === 'pass') pass++
        else if (item.status === 'fail') fail++
      }
    }
    const fm = {
      ...activeTab.testcase.frontmatter,
      archived: true,
      archivedAt: new Date().toISOString(),
      summary: `${pass}/${total} PASS, ${fail} FAIL`,
    }
    const body = await apiObj.notes.serializeTestcaseBody(sections)
    if (!body) { console.error('[NotesCell] serializeTestcaseBody returned null on archive'); return }
    await saveNote(activeTab.id, body)
    const updated: ParsedTestcase = { ...activeTab.testcase, frontmatter: fm as any }
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id ? { ...t, testcase: updated } : t
      ),
    )
  }, [activeTab, saveNote])

  // Testcase: screenshot (invokes macOS screencapture)
  const handleTestcaseScreenshot = useCallback(async (itemId: string) => {
    if (!activeTab) return
    const apiObj = (window as any).cipherMux
    // Use IPC to trigger screencapture in main process
    if (apiObj?.notes?.screenshot) {
      const result = await apiObj.notes.screenshot(activeTab.id, itemId)
      if (result?.path) {
        // Store screenshot as separate attribute — do NOT append to comment text
        const newSections = activeTab.testcase!.sections.map(s => ({
          ...s,
          items: s.items.map(item =>
            item.id === itemId
              ? { ...item, screenshotRef: result.path }
              : item
          ),
        }))
        handleTestcaseUpdate(newSections)
      }
    }
  }, [activeTab, handleTestcaseUpdate])

  // Testcase: feature request export
  const handleFeatureRequest = useCallback(async (itemId: string, description: string) => {
    const apiObj = (window as any).cipherMux
    await apiObj.notes.create(
      `Feature Request: ${itemId}`,
      `# Feature Request: ${itemId}\n\n${description}\n\nSource: testcase ${activeTab?.id}`,
      ['feature-request'],
    )
  }, [activeTab])

  // Expose openNote for external calls (from sidebar / MCP) — per-slot registry
  useEffect(() => {
    const reg = ((window as any).__notesCellRegistry ??= {} as Record<number, typeof openNote>)
    reg[slotIndex] = openNote
    return () => {
      delete reg[slotIndex]
    }
  }, [openNote, slotIndex])

  // Handle note drops directly (works even when cell is empty/first time)
  const handleNoteDrop = useCallback((e: DragEvent) => {
    const cipherType = e.dataTransfer?.getData('application/x-cipher-type')
    if (cipherType === 'note') {
      const noteJson = e.dataTransfer?.getData('application/x-cipher-note')
      if (noteJson) {
        try {
          const note = JSON.parse(noteJson)
          openNote(note)
          e.stopPropagation()
          return
        } catch { /* fall through to grid handler */ }
      }
    }
    onDrop(e)
  }, [openNote, onDrop])

  const isAtMax = rowSpan >= maxRows
  const cellStyle = rowSpan > 1 ? { gridRow: `span ${rowSpan}` } : undefined

  return (
    <div
      class={`session-cell notes-cell${dragOver ? ' session-cell--drag-over' : ''}`}
      style={cellStyle}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleNoteDrop}
      data-highlight={slotCol != null && slotRow != null ? `cell-${slotCol}-${slotRow}` : undefined}
    >
      <div class="cell-header" draggable onDragStart={onDragStart}>
        <div class="cell-header__left">
          <span class="neon-dot neon-dot--info" />
          <span class="cell-name">{t('notesCell.header')}</span>
          {activeWorkspaceId && (
            <>
              <span class="cell-sep">·</span>
              <span class="cell-ctx ctx-ok">{activeWorkspaceId}</span>
            </>
          )}
        </div>
        <div class="cell-header__right">
          {maxRows > 1 && (
            <button
              class={`cell-btn ${isAtMax ? 'cell-btn--active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
              title={isAtMax ? t('notesCell.collapseHeight') : t('notesCell.expandHeight')}
            >
              {isAtMax ? '↥' : '↧'}
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
              <>
                <button
                  class="notes-tab__action"
                  onClick={(e) => {
                    e.stopPropagation()
                    const api = (window as any).cipherMux
                    if ((window as any).__cipherMuxTtsSpeaking) {
                      api?.voice?.stopSpeech?.()
                      ;(window as any).__cipherMuxTtsSpeaking = false
                    } else {
                      const body = (tab.content || '').replace(/^---[\s\S]*?---\n?/, '').trim()
                      if (body) {
                        ;(window as any).__cipherMuxTtsSpeaking = true
                        api?.voice?.speak?.(body.slice(0, 2000)).finally(() => {
                          ;(window as any).__cipherMuxTtsSpeaking = false
                        })
                      }
                    }
                  }}
                  title="Vorlesen / Stopp (TTS)"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', opacity: 0.6, padding: '0 3px' }}
                >
                  {(window as any).__cipherMuxTtsSpeaking ? '\u25A0' : '\u25B6'}
                </button>
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
              </>
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

      {/* Tag bar for active note */}
      {activeTab && !activeTab.testcase && (
        <TagBar tags={activeTab.tags} onTagsChange={handleTagsChange} />
      )}

      {/* Editor or TestcaseView */}
      <div class="notes-editor-area">
        {activeTab?.testcase ? (
          <TestcaseView
            key={activeTab.id}
            testcase={activeTab.testcase}
            onUpdate={handleTestcaseUpdate}
            onArchive={handleTestcaseArchive}
            onScreenshot={handleTestcaseScreenshot}
            onFeatureRequest={handleFeatureRequest}
          />
        ) : activeTab ? (
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
