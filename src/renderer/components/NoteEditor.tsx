// src/renderer/components/NoteEditor.tsx

import { useEffect, useRef } from 'preact/hooks'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'

interface NoteEditorProps {
  content: string
  onSave: (content: string) => void
  onAutoSave: (content: string) => void
}

function createCipherTheme() {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: 'var(--font-size-base)',
      fontFamily: 'var(--font-mono)',
      backgroundColor: 'var(--color-bg-terminal)',
      color: 'var(--color-text)',
    },
    '.cm-content': {
      padding: 'var(--space-md)',
      caretColor: 'var(--color-accent)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--color-accent)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--color-accent-soft)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--color-accent-soft) !important',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    // Markdown highlighting
    '.cm-header-1': {
      fontSize: '1.4em',
      fontWeight: 'bold',
      color: 'var(--color-accent)',
    },
    '.cm-header-2': {
      fontSize: '1.2em',
      fontWeight: 'bold',
      color: 'var(--color-accent)',
    },
    '.cm-header-3': {
      fontSize: '1.1em',
      fontWeight: 'bold',
      color: 'var(--color-text-accent)',
    },
    '.cm-strong': {
      fontWeight: 'bold',
      color: 'var(--color-text)',
    },
    '.cm-emphasis': {
      fontStyle: 'italic',
    },
    '.cm-link': {
      color: 'var(--color-neon-cyan)',
      textDecoration: 'underline',
    },
    '.cm-url': {
      color: 'var(--color-text-dim)',
    },
    '.cm-monospace, .cm-inlineCode': {
      fontFamily: 'var(--font-mono)',
      color: 'var(--color-neon-green)',
      backgroundColor: 'var(--color-bg-sunken)',
      padding: '1px 4px',
      borderRadius: '2px',
    },
    '.cm-list': {
      color: 'var(--color-accent)',
    },
  })
}

export function NoteEditor({ content, onSave, onAutoSave }: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Store latest callbacks in refs to avoid recreating editor
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onAutoSaveRef = useRef(onAutoSave)
  onAutoSaveRef.current = onAutoSave

  useEffect(() => {
    if (!containerRef.current) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: (view) => {
          onSaveRef.current(view.state.doc.toString())
          return true
        },
      },
    ])

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const doc = update.state.doc.toString()
        // Debounced auto-save
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
        autoSaveTimer.current = setTimeout(() => {
          onAutoSaveRef.current(doc)
        }, 2000)
      }
    })

    const state = EditorState.create({
      doc: content,
      extensions: [
        createCipherTheme(),
        markdown(),
        saveKeymap,
        keymap.of([...defaultKeymap, indentWithTab, ...searchKeymap]),
        updateListener,
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      view.destroy()
      viewRef.current = null
    }
  }, []) // Only mount once

  // Update content when prop changes (different note selected)
  const prevContentProp = useRef(content)
  useEffect(() => {
    if (content !== prevContentProp.current && viewRef.current) {
      prevContentProp.current = content
      const view = viewRef.current
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      })
    }
  }, [content])

  return <div ref={containerRef} class="note-editor" style={{ height: '100%', overflow: 'hidden' }} />
}
