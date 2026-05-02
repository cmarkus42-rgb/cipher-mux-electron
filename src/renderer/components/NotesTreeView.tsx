// src/renderer/components/NotesTreeView.tsx
// Hierarchical tag tree + filtered note list for the sidebar Notes section.
// Tag filter is tri-state: neutral → include (green) → exclude (red) → neutral.

import { h } from 'preact'
import { useState, useMemo, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { NoteInfo } from '../../shared/types'

// ─── Types ─────────────────────────────────────────────────

export type TagFilterMode = 'include' | 'exclude'
export type TagFilterState = Record<string, TagFilterMode>

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

// ─── Tri-state cycle ────────────────────────────────────────

function cycleFilterMode(current: TagFilterMode | undefined): TagFilterMode | undefined {
  if (!current) return 'include'
  if (current === 'include') return 'exclude'
  return undefined // exclude → neutral
}

// ─── Filter logic ───────────────────────────────────────────

function matchesTagPrefix(noteTag: string, filterTag: string): boolean {
  return noteTag === filterTag || noteTag.startsWith(filterTag + '/')
}

export function applyTagFilter(notes: NoteInfo[], filter: TagFilterState): NoteInfo[] {
  const includes = Object.entries(filter).filter(([, m]) => m === 'include').map(([t]) => t)
  const excludes = Object.entries(filter).filter(([, m]) => m === 'exclude').map(([t]) => t)

  let result = notes

  // Include: note must match at least one include tag (prefix)
  if (includes.length > 0) {
    result = result.filter(n =>
      n.tags.some(t => includes.some(f => matchesTagPrefix(t, f)))
    )
  }

  // Exclude: note must NOT match any exclude tag (prefix)
  if (excludes.length > 0) {
    result = result.filter(n =>
      !n.tags.some(t => excludes.some(f => matchesTagPrefix(t, f)))
    )
  }

  return result
}

// ─── Tree Node Renderer ────────────────────────────────────

interface TreeNodeProps {
  node: TagNode
  depth: number
  expanded: Set<string>
  filterState: TagFilterState
  onToggleExpand: (path: string) => void
  onCycleFilter: (path: string) => void
}

function TreeNodeItem({ node, depth, expanded, filterState, onToggleExpand, onCycleFilter }: TreeNodeProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.fullPath)
  const mode = filterState[node.fullPath]

  const modeClass = mode === 'include' ? ' tree-node--include'
    : mode === 'exclude' ? ' tree-node--exclude'
    : ''

  return (
    <>
      <div
        class={`tree-node${modeClass}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={(e) => {
          // Arrow area: toggle expand. Label area: cycle filter.
          if (hasChildren && (e.target as HTMLElement).classList.contains('tree-node__arrow')) {
            onToggleExpand(node.fullPath)
          } else {
            onCycleFilter(node.fullPath)
          }
        }}
      >
        <span
          class="tree-node__arrow"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation()
              onToggleExpand(node.fullPath)
            }
          }}
        >
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
          filterState={filterState}
          onToggleExpand={onToggleExpand}
          onCycleFilter={onCycleFilter}
        />
      ))}
    </>
  )
}

// ─── Notes Tree View ────────────────────────────────────────

interface NotesTreeViewProps {
  notes: NoteInfo[]
  searchTerm: string
  tagFilter: TagFilterState
  onSearchChange: (term: string) => void
  onTagFilterChange: (filter: TagFilterState) => void
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

  // Cycle tag filter: neutral → include → exclude → neutral
  const cycleFilter = useCallback((path: string) => {
    const next = { ...tagFilter }
    const newMode = cycleFilterMode(next[path])
    if (newMode) {
      next[path] = newMode
    } else {
      delete next[path]
    }
    onTagFilterChange(next)
  }, [tagFilter, onTagFilterChange])

  // Clear all filters
  const hasActiveFilter = Object.keys(tagFilter).length > 0

  // Filter notes
  const filteredNotes = useMemo(() => {
    let result = applyTagFilter(notes, tagFilter)

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

  // Flat tag chips for tags that don't appear in the tree (single-segment tags)
  const flatTags = useMemo(() => allTags.filter(t => !t.includes('/')), [allTags])

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
          {hasActiveFilter && (
            <div
              class="tree-node tree-node--clear"
              onClick={() => onTagFilterChange({})}
            >
              <span class="tree-node__label">{t('sidebar.clearFilter', 'Clear filter')}</span>
            </div>
          )}
          {tree.map(node => (
            <TreeNodeItem
              key={node.fullPath}
              node={node}
              depth={0}
              expanded={expanded}
              filterState={tagFilter}
              onToggleExpand={toggleExpand}
              onCycleFilter={cycleFilter}
            />
          ))}
        </div>
      )}

      {/* Flat tag chips (for tags without slash hierarchy) */}
      {flatTags.length > 0 && !hasTree && (
        <div class="sidebar-notes__tags">
          {flatTags.map(tag => {
            const mode = tagFilter[tag]
            const cls = mode === 'include' ? 'sidebar-notes__tag--include'
              : mode === 'exclude' ? 'sidebar-notes__tag--exclude'
              : ''
            return (
              <span
                key={tag}
                class={`sidebar-notes__tag ${cls}`}
                onClick={() => cycleFilter(tag)}
              >#{tag}</span>
            )
          })}
        </div>
      )}

      {/* Separator */}
      {(hasTree || flatTags.length > 0) && <div class="notes-tree-view__sep" />}

      {/* Note List */}
      <div class="notes-tree-view__list">
        {filteredNotes.map(note => (
          <div
            key={note.id}
            class="bg-card"
            data-highlight={`side-note-${note.id}`}
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
