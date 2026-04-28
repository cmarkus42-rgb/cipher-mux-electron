// src/renderer/components/NotesTreeView.tsx
// Hierarchical tag tree + filtered note list for the sidebar Notes section.

import { h } from 'preact'
import { useState, useMemo, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { NoteInfo } from '../../shared/types'

// ─── Tag Tree Node ──────────────────────────────────────────

interface TagNode {
  name: string          // leaf segment, e.g. "ui"
  fullPath: string      // full slash path, e.g. "bugs/ui"
  count: number         // notes with this exact tag or any child tag
  children: TagNode[]
}

function buildTagTree(tags: string[], noteTags: Map<string, number>): TagNode[] {
  const root: TagNode[] = []
  const nodeMap = new Map<string, TagNode>()

  for (const tag of tags) {
    const parts = tag.split('/')
    let parentList = root
    let pathSoFar = ''

    for (let i = 0; i < parts.length; i++) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${parts[i]}` : parts[i]

      let node = nodeMap.get(pathSoFar)
      if (!node) {
        node = { name: parts[i], fullPath: pathSoFar, count: 0, children: [] }
        nodeMap.set(pathSoFar, node)
        parentList.push(node)
      }
      parentList = node.children
    }
  }

  // Count: for each tag, count notes that have this tag or any descendant
  for (const [tag, count] of noteTags) {
    const parts = tag.split('/')
    let pathSoFar = ''
    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part
      const node = nodeMap.get(pathSoFar)
      if (node) node.count += count
    }
  }

  return root
}

// ─── Tree Node Renderer ────────────────────────────────────

interface TreeNodeProps {
  node: TagNode
  depth: number
  expanded: Set<string>
  selectedPath: string | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}

function TreeNodeItem({ node, depth, expanded, selectedPath, onToggle, onSelect }: TreeNodeProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.fullPath)
  const isSelected = selectedPath === node.fullPath

  return (
    <>
      <div
        class={`tree-node${isSelected ? ' tree-node--selected' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => {
          if (hasChildren) onToggle(node.fullPath)
          onSelect(node.fullPath)
        }}
      >
        <span class="tree-node__arrow">
          {hasChildren ? (isExpanded ? '▾' : '▸') : ' '}
        </span>
        <span class="tree-node__label">{node.name}/</span>
        {node.count > 0 && (
          <span class="tree-node__count">({node.count})</span>
        )}
      </div>
      {hasChildren && isExpanded && node.children.map(child => (
        <TreeNodeItem
          key={child.fullPath}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

// ─── Notes Tree View ────────────────────────────────────────

interface NotesTreeViewProps {
  notes: NoteInfo[]
  searchTerm: string
  tagFilter: string[]
  onSearchChange: (term: string) => void
  onTagFilterChange: (tags: string[]) => void
  onNoteDoubleClick: (note: NoteInfo) => void
  onNoteDelete: (note: NoteInfo, e: Event) => void
  onNoteDragStart: (note: NoteInfo, e: DragEvent) => void
}

export function NotesTreeView({
  notes,
  searchTerm,
  tagFilter,
  onSearchChange,
  onTagFilterChange,
  onNoteDoubleClick,
  onNoteDelete,
  onNoteDragStart,
}: NotesTreeViewProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedTagPath, setSelectedTagPath] = useState<string | null>(null)

  // Build unique tags and their counts
  const { allTags, tagCounts } = useMemo(() => {
    const counts = new Map<string, number>()
    const tagSet = new Set<string>()
    for (const note of notes) {
      for (const tag of note.tags) {
        tagSet.add(tag)
        counts.set(tag, (counts.get(tag) || 0) + 1)
      }
    }
    return { allTags: [...tagSet].sort(), tagCounts: counts }
  }, [notes])

  // Build tree
  const tree = useMemo(() => buildTagTree(allTags, tagCounts), [allTags, tagCounts])

  // Toggle expanded state
  const toggleExpand = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  // Select a tag path — updates the filter
  const selectTagPath = useCallback((path: string) => {
    if (selectedTagPath === path) {
      // Deselect
      setSelectedTagPath(null)
      onTagFilterChange([])
    } else {
      setSelectedTagPath(path)
      // Filter: show notes that have this tag or any child tag (prefix match)
      onTagFilterChange([path])
    }
  }, [selectedTagPath, onTagFilterChange])

  // Filter notes
  const filteredNotes = useMemo(() => {
    let result = notes

    // Tag filter (tree selection uses prefix matching)
    if (tagFilter.length > 0) {
      result = result.filter(n =>
        n.tags.some(t =>
          tagFilter.some(f => t === f || t.startsWith(f + '/'))
        )
      )
    }

    // Search term
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))
      )
    }

    return result
  }, [notes, tagFilter, searchTerm])

  const hasTree = tree.length > 0

  return (
    <div class="notes-tree-view">
      {/* Search */}
      <input
        type="text"
        class="sidebar-notes__search"
        placeholder={t('sidebar.notesSearch')}
        value={searchTerm}
        onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
      />

      {/* Tag Tree */}
      {hasTree && (
        <div class="notes-tree-view__tree">
          {selectedTagPath && (
            <div
              class="tree-node tree-node--clear"
              onClick={() => { setSelectedTagPath(null); onTagFilterChange([]) }}
            >
              <span class="tree-node__label">{t('sidebar.allNotes', 'All Notes')}</span>
            </div>
          )}
          {tree.map(node => (
            <TreeNodeItem
              key={node.fullPath}
              node={node}
              depth={0}
              expanded={expanded}
              selectedPath={selectedTagPath}
              onToggle={toggleExpand}
              onSelect={selectTagPath}
            />
          ))}
        </div>
      )}

      {/* Separator */}
      {hasTree && <div class="notes-tree-view__sep" />}

      {/* Note List */}
      <div class="notes-tree-view__list">
        {filteredNotes.map(note => (
          <div
            key={note.id}
            class="bg-card"
            onDblClick={() => onNoteDoubleClick(note)}
            title={t('sidebar.noteDoubleClick')}
            draggable
            onDragStart={(e) => onNoteDragStart(note, e as any)}
          >
            <div class="bg-card__head">
              <span class="bg-card__name">
                {note.title && note.title !== 'Untitled' ? note.title : t('notesCell.untitled')}
              </span>
              <button
                class="bg-card__delete"
                onClick={(e) => onNoteDelete(note, e)}
                title={t('sidebar.noteDelete')}
              >✕</button>
            </div>
            <div class="bg-card__preview" style={{ fontSize: 'var(--font-size-xs)' }}>
              {note.tags.map(t => `#${t}`).join(' ')}
            </div>
            <div class="bg-card__preview" style={{ fontSize: 'var(--font-size-xs)', opacity: 0.5 }}>
              {note.modifiedAt ? new Date(note.modifiedAt).toLocaleDateString() : ''}
            </div>
          </div>
        ))}
        {filteredNotes.length === 0 && (
          <div class="sidebar-panel__empty" style={{ padding: 'var(--space-sm)' }}>
            {t('sidebar.noNotes')}
          </div>
        )}
      </div>
    </div>
  )
}
