// src/renderer/components/NotesTreeView.tsx
// Two-level class:value tag tree + filtered note list for the sidebar Notes section.
// REQ-NOTES-001 (Tag-Baum), REQ-NOTES-003 (Note-List), REQ-NOTES-009 (Alle-Notes-Toggle).

import { h } from 'preact'
import { useState, useMemo, useCallback, useEffect, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { NoteInfo, TagClassRepository, TagIndexData } from '../../shared/types'
import { MAX_MANUAL_TAGS } from '../../shared/constants'

// ─── Types ─────────────────────────────────────────────────

export type TagFilterMode = 'include' | 'exclude'
export type TagFilterState = Record<string, TagFilterMode>

// ─── Class:Value Tree ──────────────────────────────────────

interface ClassNode {
  className: string   // e.g. "kind", "domain", "Unklassifiziert"
  color?: string      // from TagClassRepository
  values: ValueNode[]
  totalCount: number  // sum of all value counts
}

interface ValueNode {
  value: string       // e.g. "bugreport"
  fullTag: string     // e.g. "kind:bugreport" or legacy tag
  count: number
}

const UNCLASSIFIED = 'Unklassifiziert'

/** Build a two-level tree from class:value tags. Legacy tags go under UNCLASSIFIED. */
export function buildClassTree(
  notes: NoteInfo[],
  tagClassRepo: TagClassRepository,
  _tagIndex: TagIndexData,
): ClassNode[] {
  // Count tags from notes (more reliable than tagIndex which may lag)
  const tagCounts = new Map<string, number>()
  for (const note of notes) {
    for (const tag of note.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }
  }

  // Group by class
  const classMap = new Map<string, ValueNode[]>()
  const classColors = new Map<string, string | undefined>()

  for (const [tag, count] of tagCounts) {
    const colonIdx = tag.indexOf(':')
    if (colonIdx === -1) {
      // Legacy tag — goes under Unklassifiziert
      if (!classMap.has(UNCLASSIFIED)) classMap.set(UNCLASSIFIED, [])
      classMap.get(UNCLASSIFIED)!.push({ value: tag, fullTag: tag, count })
    } else {
      const cls = tag.slice(0, colonIdx)
      const val = tag.slice(colonIdx + 1)
      if (!classMap.has(cls)) classMap.set(cls, [])
      classMap.get(cls)!.push({ value: val, fullTag: tag, count })
      if (!classColors.has(cls) && tagClassRepo.classes[cls]?.color) {
        classColors.set(cls, tagClassRepo.classes[cls].color)
      }
    }
  }

  // Build ClassNode array, sorted alphabetically, Unklassifiziert last
  const result: ClassNode[] = []
  const sortedClasses = [...classMap.keys()].sort((a, b) => {
    if (a === UNCLASSIFIED) return 1
    if (b === UNCLASSIFIED) return -1
    return a.localeCompare(b)
  })

  for (const cls of sortedClasses) {
    const values = classMap.get(cls)!.sort((a, b) => a.value.localeCompare(b.value))
    const totalCount = values.reduce((sum, v) => sum + v.count, 0)
    result.push({
      className: cls,
      color: classColors.get(cls),
      values,
      totalCount,
    })
  }

  return result
}

// ─── Tri-state cycle ────────────────────────────────────────

function cycleFilterMode(current: TagFilterMode | undefined): TagFilterMode | undefined {
  if (!current) return 'include'
  if (current === 'include') return 'exclude'
  return undefined // exclude → neutral
}

// ─── Filter logic ───────────────────────────────────────────

function matchesTag(noteTag: string, filterTag: string): boolean {
  return noteTag === filterTag || noteTag.startsWith(filterTag + '/')
}

export function applyTagFilter(notes: NoteInfo[], filter: TagFilterState): NoteInfo[] {
  const includes = Object.entries(filter).filter(([, m]) => m === 'include').map(([t]) => t)
  const excludes = Object.entries(filter).filter(([, m]) => m === 'exclude').map(([t]) => t)

  let result = notes

  if (includes.length > 0) {
    result = result.filter(n =>
      n.tags.some(t => includes.some(f => matchesTag(t, f)))
    )
  }

  if (excludes.length > 0) {
    result = result.filter(n =>
      !n.tags.some(t => excludes.some(f => matchesTag(t, f)))
    )
  }

  return result
}

/** Filter notes by workspace scope tag. */
export function filterByWorkspace(notes: NoteInfo[], workspaceId: string): NoteInfo[] {
  const scopeTag = `scope:${workspaceId}`
  return notes.filter(n => n.tags.some(t => t === scopeTag))
}

// ─── Class Node Renderer ────────────────────────────────────

interface ClassNodeItemProps {
  node: ClassNode
  expanded: boolean
  filterState: TagFilterState
  onToggleExpand: (className: string) => void
  onCycleClassFilter: (className: string, values: ValueNode[]) => void
  onCycleValueFilter: (fullTag: string) => void
}

function ClassNodeItem({ node, expanded, filterState, onToggleExpand, onCycleClassFilter, onCycleValueFilter }: ClassNodeItemProps) {
  const classFilterMode = useMemo(() => {
    const modes = node.values.map(v => filterState[v.fullTag])
    if (modes.length > 0 && modes.every(m => m === 'include')) return 'include' as const
    if (modes.length > 0 && modes.every(m => m === 'exclude')) return 'exclude' as const
    if (modes.some(m => m != null)) return 'partial' as const
    return undefined
  }, [node.values, filterState])

  const modeClass = classFilterMode === 'include' ? ' tree-class--include'
    : classFilterMode === 'exclude' ? ' tree-class--exclude'
    : classFilterMode === 'partial' ? ' tree-class--partial'
    : ''

  return (
    <>
      <div
        class={`tree-class${modeClass}`}
        onClick={() => onCycleClassFilter(node.className, node.values)}
      >
        <span
          class="tree-class__arrow"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand(node.className)
          }}
        >
          {expanded ? '▾' : '▸'}
        </span>
        <span class="tree-class__label" style={node.color ? { color: node.color } : undefined}>
          {node.className}
        </span>
        <span class="tree-class__count">({node.totalCount})</span>
      </div>
      {expanded && node.values.map(v => {
        const mode = filterState[v.fullTag]
        const valClass = mode === 'include' ? ' tree-value--include'
          : mode === 'exclude' ? ' tree-value--exclude'
          : ''
        return (
          <div
            key={v.fullTag}
            class={`tree-value${valClass}`}
            onClick={() => onCycleValueFilter(v.fullTag)}
          >
            <span class="tree-value__label">{v.value}</span>
            <span class="tree-value__count">({v.count})</span>
          </div>
        )
      })}
    </>
  )
}

// ─── Notes Tree View ────────────────────────────────────────

interface NotesTreeViewProps {
  notes: NoteInfo[]
  searchTerm: string
  tagFilter: TagFilterState
  tagClassRepo: TagClassRepository
  tagIndex: TagIndexData
  activeWorkspaceId: string | null
  onSearchChange: (term: string) => void
  onTagFilterChange: (filter: TagFilterState) => void
  onNoteDoubleClick: (note: NoteInfo) => void
  onNoteDelete: (note: NoteInfo, e: Event) => void
  onNoteDragStart: (note: NoteInfo, e: DragEvent) => void
  onSearch?: (query: string, tags?: string[]) => Promise<NoteInfo[]>
  /** Bulk delete handler — moves notes to trash with undo support (REQ-NOTES-006) */
  onBulkDelete?: (noteIds: string[]) => void
  /** Bulk tag add handler (REQ-NOTES-005) */
  onBulkTagAdd?: (noteIds: string[], tag: string) => void
  /** Bulk tag remove handler (REQ-NOTES-005) */
  onBulkTagRemove?: (noteIds: string[], tag: string) => void
  /** All known tags for auto-complete */
  allKnownTags?: string[]
}

export function NotesTreeView({
  notes,
  searchTerm,
  tagFilter,
  tagClassRepo,
  tagIndex,
  activeWorkspaceId,
  onSearchChange,
  onTagFilterChange,
  onNoteDoubleClick,
  onNoteDelete,
  onNoteDragStart,
  onSearch,
  onBulkDelete,
  onBulkTagAdd,
  onBulkTagRemove,
  allKnownTags,
}: NotesTreeViewProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [searchResults, setSearchResults] = useState<NoteInfo[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [extendedMode, setExtendedMode] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Selection state (REQ-NOTES-004) ─────────────────────
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [focusIndex, setFocusIndex] = useState<number>(-1)
  const [lastClickIndex, setLastClickIndex] = useState<number>(-1)
  const listRef = useRef<HTMLDivElement>(null)

  // Load persisted expand state, showAll, extendedMode
  useEffect(() => {
    const cfgApi = (window as any).cipherMux?.config
    if (!cfgApi?.get) return
    Promise.all([
      cfgApi.get('notesTreeExpanded').catch(() => null),
      cfgApi.get('notesShowAll').catch(() => null),
      cfgApi.get('notesExtendedMode').catch(() => null),
    ]).then(([saved, savedShowAll, savedExtended]: [string[] | null, boolean | null, boolean | null]) => {
      if (Array.isArray(saved)) setExpanded(new Set(saved))
      if (typeof savedShowAll === 'boolean') setShowAll(savedShowAll)
      if (typeof savedExtended === 'boolean') setExtendedMode(savedExtended)
    })
  }, [])

  // Persist expand state
  const persistExpanded = useCallback((next: Set<string>) => {
    const cfgApi = (window as any).cipherMux?.config
    cfgApi?.set?.('notesTreeExpanded', [...next]).catch(() => {})
  }, [])

  // Debounced FlexSearch query
  useEffect(() => {
    if (!onSearch || !searchTerm.trim()) {
      setSearchResults(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSearch(searchTerm).then(setSearchResults).catch(() => setSearchResults(null))
    }, 150)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchTerm, onSearch])

  // Apply workspace scope filter unless showAll
  const scopedNotes = useMemo(() => {
    if (showAll || !activeWorkspaceId) return notes
    return filterByWorkspace(notes, activeWorkspaceId)
  }, [notes, showAll, activeWorkspaceId])

  // Build class:value tree from scoped notes
  const tree = useMemo(
    () => buildClassTree(scopedNotes, tagClassRepo, tagIndex),
    [scopedNotes, tagClassRepo, tagIndex],
  )

  // Toggle expanded state
  const toggleExpand = useCallback((className: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(className)) next.delete(className)
      else next.add(className)
      persistExpanded(next)
      return next
    })
  }, [persistExpanded])

  // Cycle filter for a single tag value
  const cycleValueFilter = useCallback((fullTag: string) => {
    const next = { ...tagFilter }
    const newMode = cycleFilterMode(next[fullTag])
    if (newMode) {
      next[fullTag] = newMode
    } else {
      delete next[fullTag]
    }
    onTagFilterChange(next)
  }, [tagFilter, onTagFilterChange])

  // Cycle filter for an entire class (set all values to the same mode)
  const cycleClassFilter = useCallback((_className: string, values: ValueNode[]) => {
    const next = { ...tagFilter }
    const modes = values.map(v => next[v.fullTag])
    const allInclude = modes.every(m => m === 'include')
    const allExclude = modes.every(m => m === 'exclude')

    let newMode: TagFilterMode | undefined
    if (allInclude) newMode = 'exclude'
    else if (allExclude) newMode = undefined
    else newMode = 'include'

    for (const v of values) {
      if (newMode) {
        next[v.fullTag] = newMode
      } else {
        delete next[v.fullTag]
      }
    }
    onTagFilterChange(next)
  }, [tagFilter, onTagFilterChange])

  const hasActiveFilter = Object.keys(tagFilter).length > 0

  // Filter notes
  const filteredNotes = useMemo(() => {
    let source = scopedNotes
    if (searchResults && searchTerm.trim()) {
      source = searchResults
      if (!showAll && activeWorkspaceId) {
        source = filterByWorkspace(source, activeWorkspaceId)
      }
    }

    let result = applyTagFilter(source, tagFilter)

    if (searchTerm && !searchResults) {
      const q = searchTerm.toLowerCase()
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))
      )
    }

    return result
  }, [scopedNotes, tagFilter, searchTerm, searchResults, showAll, activeWorkspaceId])

  // ─── Selection: clear stale items when filtered notes change ─
  useEffect(() => {
    const visibleIds = new Set(filteredNotes.map(n => n.id))
    setSelection(prev => {
      const next = new Set([...prev].filter(id => visibleIds.has(id)))
      if (next.size !== prev.size) return next
      return prev
    })
  }, [filteredNotes])

  // ─── Click handlers (REQ-NOTES-004) ─────────────────────
  const handleNoteClick = useCallback((note: NoteInfo, index: number, e: MouseEvent) => {
    const metaKey = e.metaKey || e.ctrlKey

    if (e.shiftKey && lastClickIndex >= 0) {
      const start = Math.min(lastClickIndex, index)
      const end = Math.max(lastClickIndex, index)
      const rangeIds = filteredNotes.slice(start, end + 1).map(n => n.id)
      if (metaKey) {
        setSelection(prev => new Set([...prev, ...rangeIds]))
      } else {
        setSelection(new Set(rangeIds))
      }
    } else if (metaKey) {
      setSelection(prev => {
        const next = new Set(prev)
        if (next.has(note.id)) next.delete(note.id)
        else next.add(note.id)
        return next
      })
      setLastClickIndex(index)
    } else {
      setSelection(new Set([note.id]))
      setLastClickIndex(index)
    }
    setFocusIndex(index)
  }, [filteredNotes, lastClickIndex])

  // ─── Keyboard navigation (REQ-NOTES-004) ────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (filteredNotes.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(focusIndex + 1, filteredNotes.length - 1)
      setFocusIndex(next)
      if (!e.shiftKey) {
        setSelection(new Set([filteredNotes[next].id]))
        setLastClickIndex(next)
      } else {
        setSelection(prev => new Set([...prev, filteredNotes[next].id]))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(focusIndex - 1, 0)
      setFocusIndex(next)
      if (!e.shiftKey) {
        setSelection(new Set([filteredNotes[next].id]))
        setLastClickIndex(next)
      } else {
        setSelection(prev => new Set([...prev, filteredNotes[next].id]))
      }
    } else if (e.key === 'Enter' && focusIndex >= 0 && focusIndex < filteredNotes.length) {
      e.preventDefault()
      onNoteDoubleClick(filteredNotes[focusIndex])
    } else if (e.key === 'Escape') {
      setSelection(new Set())
      setFocusIndex(-1)
    } else if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      setSelection(new Set(filteredNotes.map(n => n.id)))
    }
  }, [filteredNotes, focusIndex, onNoteDoubleClick])

  // ─── Bulk action helpers (REQ-NOTES-005/006) ────────────
  const selectedNotes = useMemo(() =>
    filteredNotes.filter(n => selection.has(n.id)),
    [filteredNotes, selection]
  )

  const commonTags = useMemo(() => {
    if (selectedNotes.length === 0) return []
    const first = new Set(selectedNotes[0].tags)
    for (let i = 1; i < selectedNotes.length; i++) {
      const noteTags = new Set(selectedNotes[i].tags)
      for (const t of first) {
        if (!noteTags.has(t)) first.delete(t)
      }
    }
    return [...first]
  }, [selectedNotes])

  // Collect all known tags for auto-complete from tree
  const autoCompleteTags = useMemo(() => {
    if (allKnownTags && allKnownTags.length > 0) return allKnownTags
    const tags: string[] = []
    for (const cls of tree) {
      for (const v of cls.values) tags.push(v.fullTag)
    }
    return tags
  }, [allKnownTags, tree])

  const handleBulkDelete = useCallback(() => {
    if (onBulkDelete && selection.size > 0) {
      onBulkDelete([...selection])
      setSelection(new Set())
    }
  }, [onBulkDelete, selection])

  const handleBulkTagAdd = useCallback((tag: string) => {
    if (onBulkTagAdd && selection.size > 0) {
      onBulkTagAdd([...selection], tag)
    }
  }, [onBulkTagAdd, selection])

  const handleBulkTagRemove = useCallback((tag: string) => {
    if (onBulkTagRemove && selection.size > 0) {
      onBulkTagRemove([...selection], tag)
    }
  }, [onBulkTagRemove, selection])

  // Toggle handlers with persistence
  const toggleShowAll = useCallback(() => {
    setShowAll(prev => {
      const next = !prev
      const cfgApi = (window as any).cipherMux?.config
      cfgApi?.set?.('notesShowAll', next).catch(() => {})
      return next
    })
  }, [])

  const toggleExtended = useCallback(() => {
    setExtendedMode(prev => {
      const next = !prev
      const cfgApi = (window as any).cipherMux?.config
      cfgApi?.set?.('notesExtendedMode', next).catch(() => {})
      return next
    })
  }, [])

  const hasTree = tree.length > 0

  return (
    <div class="notes-tree-view">
      {/* Toolbar: Search + Toggles */}
      <div class="notes-tree-view__toolbar">
        <input
          type="text"
          class="sidebar-notes__search"
          placeholder={t('sidebar.notesSearch')}
          value={searchTerm}
          onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        />
        <div class="notes-tree-view__toggles">
          {activeWorkspaceId && (
            <button
              class={`notes-toggle${showAll ? ' notes-toggle--active' : ''}`}
              onClick={toggleShowAll}
              title={showAll ? t('sidebar.notesShowWorkspace', 'Workspace only') : t('sidebar.notesShowAll', 'All notes')}
            >
              {showAll ? '◎' : '⊙'}
            </button>
          )}
          <button
            class={`notes-toggle${extendedMode ? ' notes-toggle--active' : ''}`}
            onClick={toggleExtended}
            title={extendedMode ? t('sidebar.notesCompact', 'Compact view') : t('sidebar.notesExtended', 'Extended view')}
          >
            ≡
          </button>
        </div>
      </div>

      {/* Class:Value Tag Tree */}
      {hasTree && (
        <div class="notes-tree-view__tree">
          {hasActiveFilter && (
            <div
              class="tree-class tree-class--clear"
              onClick={() => onTagFilterChange({})}
            >
              <span class="tree-class__label">{t('sidebar.clearFilter', 'Clear filter')}</span>
            </div>
          )}
          {tree.map(node => (
            <ClassNodeItem
              key={node.className}
              node={node}
              expanded={expanded.has(node.className)}
              filterState={tagFilter}
              onToggleExpand={toggleExpand}
              onCycleClassFilter={cycleClassFilter}
              onCycleValueFilter={cycleValueFilter}
            />
          ))}
        </div>
      )}

      {/* Separator */}
      {hasTree && <div class="notes-tree-view__sep" />}

      {/* Bulk Actions Bar (REQ-NOTES-005/006) */}
      {selection.size > 1 && (
        <BulkNotesBar
          count={selection.size}
          commonTags={commonTags}
          allKnownTags={autoCompleteTags}
          selectedNotes={selectedNotes}
          onTagAdd={handleBulkTagAdd}
          onTagRemove={handleBulkTagRemove}
          onDelete={handleBulkDelete}
          onClearSelection={() => setSelection(new Set())}
        />
      )}

      {/* Note List */}
      <div
        class="notes-tree-view__list"
        ref={listRef}
        tabIndex={0}
        onKeyDown={handleKeyDown as any}
      >
        {filteredNotes.map((note, idx) => (
          <div
            key={note.id}
            class={`note-card${extendedMode ? ' note-card--extended' : ''}${selection.has(note.id) ? ' note-card--selected' : ''}${idx === focusIndex ? ' note-card--focused' : ''}`}
            data-highlight={`side-note-${note.id}`}
            onClick={(e) => handleNoteClick(note, idx, e as any)}
            onDblClick={() => onNoteDoubleClick(note)}
            title={t('sidebar.noteDoubleClick')}
            draggable
            onDragStart={(e) => onNoteDragStart(note, e as any)}
          >
            {/* Line 1: Title + Delete */}
            <div class="note-card__head">
              <span class="note-card__title">
                {note.title && note.title !== 'Untitled' ? note.title : t('notesCell.untitled')}
              </span>
              <button
                class="note-card__delete"
                onClick={(e) => { e.stopPropagation(); onNoteDelete(note, e) }}
                title={t('sidebar.noteDelete')}
              >✕</button>
            </div>
            {/* Line 2: Tag chips */}
            <div class="note-card__tags">
              {note.tags.map(tag => {
                const colonIdx = tag.indexOf(':')
                const cls = colonIdx > -1 ? tag.slice(0, colonIdx) : undefined
                const color = cls && tagClassRepo.classes[cls]?.color
                return (
                  <span
                    key={tag}
                    class="note-card__tag"
                    style={color ? { borderColor: color, color } : undefined}
                  >
                    {tag}
                  </span>
                )
              })}
              {note.tags.length > MAX_MANUAL_TAGS && (
                <span class="note-card__tag-warning" title={`${note.tags.length}/${MAX_MANUAL_TAGS} tags`}>!</span>
              )}
            </div>
            {/* Line 3: Preview (hover or extended mode) */}
            {note.preview && (
              <div class={`note-card__preview${extendedMode ? ' note-card__preview--visible' : ''}`}>
                {note.preview}
              </div>
            )}
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

// ─── Bulk Notes Bar (REQ-NOTES-005/006) ─────────────────────

interface BulkNotesBarProps {
  count: number
  commonTags: string[]
  allKnownTags: string[]
  selectedNotes: NoteInfo[]
  onTagAdd: (tag: string) => void
  onTagRemove: (tag: string) => void
  onDelete: () => void
  onClearSelection: () => void
}

function BulkNotesBar({
  count,
  commonTags,
  allKnownTags,
  selectedNotes,
  onTagAdd,
  onTagRemove,
  onDelete,
  onClearSelection,
}: BulkNotesBarProps) {
  const { t } = useTranslation()
  const [tagInput, setTagInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showRemove, setShowRemove] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const canAddTag = useMemo(() => {
    return selectedNotes.every(n => n.tags.length < MAX_MANUAL_TAGS)
  }, [selectedNotes])

  const suggestions = useMemo(() => {
    if (!tagInput.trim()) return []
    const q = tagInput.toLowerCase()
    return allKnownTags
      .filter(t => t.toLowerCase().includes(q))
      .slice(0, 8)
  }, [tagInput, allKnownTags])

  const handleAddTag = useCallback((tag: string) => {
    if (!tag.trim()) return
    onTagAdd(tag.trim())
    setTagInput('')
    setShowSuggestions(false)
  }, [onTagAdd])

  const handleInputKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      handleAddTag(tagInput)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setTagInput('')
    }
  }, [tagInput, handleAddTag])

  return (
    <div class="bulk-notes-bar">
      <div class="bulk-notes-bar__header">
        <span class="bulk-notes-bar__count">{count} selected</span>
        <button
          class="bulk-notes-bar__clear"
          onClick={onClearSelection}
          title="Clear selection"
        >✕</button>
      </div>

      {/* Tag Add */}
      <div class="bulk-notes-bar__tag-add">
        <div class="bulk-notes-bar__input-wrap">
          <input
            ref={inputRef}
            type="text"
            class="bulk-notes-bar__input"
            placeholder={canAddTag ? 'Add tag...' : 'Tag limit reached'}
            value={tagInput}
            disabled={!canAddTag}
            onInput={(e) => {
              setTagInput((e.target as HTMLInputElement).value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={handleInputKeyDown as any}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div class="bulk-notes-bar__suggestions">
              {suggestions.map(s => (
                <div
                  key={s}
                  class="bulk-notes-bar__suggestion"
                  onMouseDown={(e) => { e.preventDefault(); handleAddTag(s) }}
                >#{s}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tag Remove */}
      {commonTags.length > 0 && (
        <div class="bulk-notes-bar__tag-remove">
          <button
            class="bulk-notes-bar__toggle"
            onClick={() => setShowRemove(!showRemove)}
          >
            {showRemove ? '▾' : '▸'} Remove tags
          </button>
          {showRemove && (
            <div class="bulk-notes-bar__common-tags">
              {commonTags.map(tag => (
                <span
                  key={tag}
                  class="bulk-notes-bar__removable-tag"
                  onClick={() => onTagRemove(tag)}
                  title={`Remove #${tag} from all selected`}
                >#{tag} ✕</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete */}
      <button
        class="bulk-notes-bar__delete"
        onClick={onDelete}
      >Delete {count} notes</button>
    </div>
  )
}
