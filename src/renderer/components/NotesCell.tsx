// src/renderer/components/NotesCell.tsx

import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { NoteEditor } from './NoteEditor'
import { TestcaseView } from './TestcaseView'
import { useNotes } from '../hooks/useNotes'
import type { NoteInfo } from '../../shared/types'
import type { ParsedTestcase, TestcaseSection } from '../../main/notes/testcase-parser'

// Lazy-load parser to avoid pulling Node.js code into renderer bundle at import time
let _parser: typeof import('../../main/notes/testcase-parser') | null = null
function getParser() {
  if (!_parser) _parser = require('../../main/notes/testcase-parser')
  return _parser!
}

interface NoteTab {
  id: string
  title: string
  content: string
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
        setActiveTabId(info.id)
        return
      }
      // Read content
      const apiObj = (window as any).cipherMux
      const result = await apiObj.notes.read(info.id)
      if (!result) return

      // Detect testcase note
      let testcase: ParsedTestcase | undefined
      if (info.noteType === 'testcase') {
        try {
          const parser = getParser()
          // Reconstruct raw markdown for parser (body already has no frontmatter)
          const fmForParser = { ...result.info, type: result.info.noteType }
          const rawForParser = require('gray-matter').stringify('\n' + result.body, fmForParser)
          testcase = parser.parseTestcase(rawForParser) ?? undefined
        } catch { /* not a valid testcase, open as regular note */ }
      }

      const tab: NoteTab = {
        id: info.id,
        title: info.title,
        content: result.body,
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

  // Testcase: update sections → serialize → save
  const handleTestcaseUpdate = useCallback(
    async (sections: TestcaseSection[]) => {
      if (!activeTab?.testcase) return
      const parser = getParser()
      const updated: ParsedTestcase = { ...activeTab.testcase, sections }
      const body = parser.serializeTestcaseBody(sections)
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

  // Testcase: archive
  const handleTestcaseArchive = useCallback(async () => {
    if (!activeTab?.testcase) return
    const parser = getParser()
    const summary = parser.summarizeTestcase(activeTab.testcase.sections)
    const fm = {
      ...activeTab.testcase.frontmatter,
      archived: true,
      archivedAt: new Date().toISOString(),
      summary: `${summary.pass}/${summary.total} PASS, ${summary.fail} FAIL`,
    }
    const body = parser.serializeTestcaseBody(activeTab.testcase.sections)
    const raw = require('gray-matter').stringify('\n' + body, fm)
    // Write raw to disk via save (the body part)
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
        // Update comment with screenshot ref
        const ref = `![screenshot](${result.path})`
        const parser = getParser()
        const newSections = activeTab.testcase!.sections.map(s => ({
          ...s,
          items: s.items.map(item =>
            item.id === itemId
              ? { ...item, comment: (item.comment ? item.comment + ' ' : '') + ref, screenshotRef: result.path }
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
      class={`session-cell notes-cell${dragOver ? ' session-cell--drag-over' : ''}`}
      style={cellStyle}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
