// src/renderer/components/NoteEditor.tsx

import { useEffect, useRef } from 'preact/hooks'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'

interface NoteEditorProps {
  content: string
  onSave: (content: string) => void
  onAutoSave: (content: string) => void
}

/** CodeMirror 6 theme — editor chrome (bg, cursor, gutter) */
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
  })
}

/** CodeMirror 6 syntax highlighting — Obsidian-style markdown tokens */
function createCipherHighlighting() {
  const style = HighlightStyle.define([
    { tag: tags.heading1, fontSize: '1.4em', fontWeight: 'bold', color: 'var(--color-accent)' },
    { tag: tags.heading2, fontSize: '1.2em', fontWeight: 'bold', color: 'var(--color-accent)' },
    { tag: tags.heading3, fontSize: '1.1em', fontWeight: 'bold', color: 'var(--color-accent)' },
    { tag: tags.heading4, fontSize: '1.05em', fontWeight: 'bold', color: 'var(--color-accent)' },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--color-text-dim)' },
    { tag: tags.link, color: 'var(--color-neon-cyan)', textDecoration: 'underline' },
    { tag: tags.url, color: 'var(--color-text-dim)' },
    { tag: tags.monospace, color: 'var(--color-neon-green)' },
    { tag: tags.processingInstruction, color: 'var(--color-text-dim)' }, // frontmatter ---
    { tag: tags.quote, color: 'var(--color-text-secondary)', fontStyle: 'italic' },
    { tag: tags.list, color: 'var(--color-accent)' },
    { tag: tags.contentSeparator, color: 'var(--color-border)' }, // ---
  ])
  return syntaxHighlighting(style)
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
        // Track editor content to avoid re-dispatching on auto-save round-trip
        prevContentProp.current = doc
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
        createCipherHighlighting(),
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

  // DOM-level keyboard + clipboard handlers
  // Electron menu roles (copy/paste) use webContents.copy() which reads the
  // DOM Selection API, but CM6 doesn't always sync its internal selection to
  // the DOM. We intercept Cmd+C/V/X in capture phase and bridge CM6 ↔ clipboard.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 's') {
        e.preventDefault()
        e.stopPropagation()
        if (viewRef.current) {
          onSaveRef.current(viewRef.current.state.doc.toString())
        }
        return
      }

      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main

      if (e.key === 'c' || e.key === 'x') {
        if (from === to) return // no selection
        const text = view.state.sliceDoc(from, to)
        navigator.clipboard.writeText(text).catch(() => {})
        if (e.key === 'x') {
          view.dispatch({ changes: { from, to, insert: '' } })
        }
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (e.key === 'v') {
        e.preventDefault()
        e.stopPropagation()
        navigator.clipboard.readText().then(text => {
          if (text && view) {
            view.dispatch(view.state.replaceSelection(text))
          }
        }).catch(() => {})
        return
      }

      if (e.key === 'a') {
        e.preventDefault()
        e.stopPropagation()
        view.dispatch({
          selection: { anchor: 0, head: view.state.doc.length },
        })
        return
      }
    }

    el.addEventListener('keydown', onKeyDown, true)
    return () => el.removeEventListener('keydown', onKeyDown, true)
  }, [])

  // Voice STT: notify main when editor gains/loses focus
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const api = (window as any).cipherMux

    const onFocusIn = () => api?.voice?.setNotesFocus?.(true)
    const onFocusOut = () => api?.voice?.setNotesFocus?.(false)

    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('focusout', onFocusOut)
    return () => {
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('focusout', onFocusOut)
      // Ensure we clear notes focus on unmount
      api?.voice?.setNotesFocus?.(false)
    }
  }, [])

  // Voice STT: insert transcribed text at cursor
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.voice?.onNotesInsert) return

    const unsub = api.voice.onNotesInsert((data: { text: string }) => {
      const view = viewRef.current
      if (!view) return
      const cursor = view.state.selection.main.head
      view.dispatch({
        changes: { from: cursor, insert: data.text },
        selection: { anchor: cursor + data.text.length },
      })
    })
    return () => unsub()
  }, [])

  return <div ref={containerRef} class="note-editor" style={{ height: '100%', overflow: 'hidden' }} />
}
