// src/renderer/components/TagManager.tsx
// Tag Management UI — class-grouped layout with CRUD, merge, synonyms
import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { TagClass, TagIndexData } from '../../shared/types'

interface TagInfo {
  name: string
  count: number
  description: string
  isSeed: boolean
}

interface ClassData {
  name: string
  color?: string
  values: TagValueRow[]
  collapsed: boolean
}

interface TagValueRow {
  fullTag: string
  value: string
  count: number
  isSeed: boolean
}

const api = (window as any).cipherMux

const CLASS_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#78716c', '#64748b',
]

export function TagManager() {
  const { t } = useTranslation()
  const [classes, setClasses] = useState<ClassData[]>([])
  const [unclassed, setUnclassed] = useState<TagValueRow[]>([])
  const [synonyms, setSynonyms] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')

  // Merge state
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set())
  const [mergeMode, setMergeMode] = useState(false)
  const [mergePreview, setMergePreview] = useState<number | null>(null)

  // Inline edit
  const [renamingTag, setRenamingTag] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Class CRUD
  const [showClassCreate, setShowClassCreate] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [newClassColor, setNewClassColor] = useState(CLASS_COLORS[0])
  const [renamingClass, setRenamingClass] = useState<string | null>(null)
  const [classRenameValue, setClassRenameValue] = useState('')
  const [editingClassColor, setEditingClassColor] = useState<string | null>(null)

  // Add value to class
  const [addingValueToClass, setAddingValueToClass] = useState<string | null>(null)
  const [newValueText, setNewValueText] = useState('')

  // Inline delete confirmation (replaces window.confirm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [classDeleteConfirm, setClassDeleteConfirm] = useState<string | null>(null)
  const [mergeConfirmPending, setMergeConfirmPending] = useState(false)

  const loadData = useCallback(async () => {
    const [tagList, classRepo, indexData, synMap]: [
      TagInfo[],
      { classes: Record<string, TagClass> },
      TagIndexData,
      Record<string, string>,
    ] = await Promise.all([
      api.notes.tagList(),
      api.notes.tagClassRepo(),
      api.notes.tagIndex(),
      api.notes.tagSynonymsList(),
    ])

    setSynonyms(synMap || {})

    // Build tag → count from index
    const tagCounts: Record<string, number> = {}
    for (const [tag, ids] of Object.entries(indexData.tagToNoteIds)) {
      tagCounts[tag] = ids.length
    }

    // Build seed set from tagList
    const seedSet = new Set(tagList.filter(t => t.isSeed).map(t => t.name))

    // Group by class
    const classEntries: ClassData[] = []
    const classedTags = new Set<string>()

    for (const [clsName, clsData] of Object.entries(classRepo.classes)) {
      const values: TagValueRow[] = clsData.values.map(v => {
        const fullTag = `${clsName}:${v}`
        classedTags.add(fullTag)
        return {
          fullTag,
          value: v,
          count: tagCounts[fullTag] || 0,
          isSeed: seedSet.has(fullTag),
        }
      })
      values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      classEntries.push({
        name: clsName,
        color: clsData.color,
        values,
        collapsed: false,
      })
    }
    classEntries.sort((a, b) => a.name.localeCompare(b.name))

    // Unclassed: tags that exist but don't belong to any class
    const uncl: TagValueRow[] = tagList
      .filter(t => !classedTags.has(t.name) && t.name.includes(':'))
      .map(t => ({
        fullTag: t.name,
        value: t.name,
        count: tagCounts[t.name] || t.count,
        isSeed: t.isSeed,
      }))

    setClasses(prev => {
      // Preserve collapsed state
      const collapsedMap = new Map(prev.map(c => [c.name, c.collapsed]))
      return classEntries.map(c => ({
        ...c,
        collapsed: collapsedMap.get(c.name) ?? false,
      }))
    })
    setUnclassed(uncl)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Listen for tag changes
  useEffect(() => {
    if (!api?.notes?.onChanged) return
    const unsub = api.notes.onChanged((data: any) => {
      if (data?.action === 'tags-updated' || data?.action === 'saved' || data?.action === 'deleted') {
        loadData()
      }
    })
    return unsub
  }, [loadData])

  // Toggle class collapse
  const toggleCollapse = (clsName: string) => {
    setClasses(prev => prev.map(c =>
      c.name === clsName ? { ...c, collapsed: !c.collapsed } : c
    ))
  }

  // Tag value rename
  const handleRename = async (oldTag: string) => {
    const newName = renameValue.trim().toLowerCase()
    if (!newName || newName === oldTag) {
      setRenamingTag(null)
      return
    }
    await api.notes.tagRename(oldTag, newName)
    setRenamingTag(null)
    setRenameValue('')
    await loadData()
  }

  // Tag value delete
  const handleDelete = async (tag: string) => {
    await api.notes.tagDelete(tag)
    setDeleteConfirm(null)
    await loadData()
  }

  // Merge
  const toggleMergeSelect = (tag: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  // Compute merge preview when selection changes
  useEffect(() => {
    if (selectedForMerge.size < 2) {
      setMergePreview(null)
      return
    }
    // Count unique notes affected
    api.notes.tagIndex().then((idx: TagIndexData) => {
      const noteSet = new Set<string>()
      for (const tag of selectedForMerge) {
        const ids = idx.tagToNoteIds[tag]
        if (ids) ids.forEach(id => noteSet.add(id))
      }
      setMergePreview(noteSet.size)
    }).catch(() => setMergePreview(null))
  }, [selectedForMerge])

  const handleMerge = async () => {
    if (selectedForMerge.size < 2) return
    if (!mergeConfirmPending) {
      setMergeConfirmPending(true)
      return
    }
    const sources = [...selectedForMerge]
    const target = sources[0]
    await api.notes.tagMerge(sources, target)
    setSelectedForMerge(new Set())
    setMergeMode(false)
    setMergeConfirmPending(false)
    await loadData()
  }

  // Class CRUD
  const handleClassCreate = async () => {
    const name = newClassName.trim().toLowerCase()
    if (!name) return
    await api.notes.tagClassCreate(name, newClassColor)
    setNewClassName('')
    setNewClassColor(CLASS_COLORS[0])
    setShowClassCreate(false)
    await loadData()
  }

  const handleClassRename = async (oldName: string) => {
    const newName = classRenameValue.trim().toLowerCase()
    if (!newName || newName === oldName) {
      setRenamingClass(null)
      return
    }
    await api.notes.tagClassRename(oldName, newName)
    setRenamingClass(null)
    setClassRenameValue('')
    await loadData()
  }

  const handleClassDelete = async (name: string) => {
    await api.notes.tagClassDelete(name)
    setClassDeleteConfirm(null)
    await loadData()
  }

  const handleClassColorChange = async (name: string, color: string) => {
    await api.notes.tagClassSetColor(name, color)
    setEditingClassColor(null)
    await loadData()
  }

  const handleAddValue = async (className: string) => {
    const value = newValueText.trim().toLowerCase()
    if (!value) return
    await api.notes.tagClassAddValue(className, value)
    setAddingValueToClass(null)
    setNewValueText('')
    await loadData()
  }

  // Get synonyms pointing to tags in a class
  const getSynonymsForTag = (canonicalTag: string): string[] => {
    return Object.entries(synonyms)
      .filter(([, target]) => target === canonicalTag)
      .map(([syn]) => syn)
  }

  // Search filter
  const matchesSearch = (tag: string): boolean => {
    if (!search) return true
    return tag.toLowerCase().includes(search.toLowerCase())
  }

  const filteredClasses = classes.map(cls => ({
    ...cls,
    values: cls.values.filter(v => matchesSearch(v.fullTag) || matchesSearch(v.value)),
  })).filter(cls => matchesSearch(cls.name) || cls.values.length > 0)

  const filteredUnclassed = unclassed.filter(v => matchesSearch(v.fullTag))

  const renderValueRow = (row: TagValueRow) => {
    const syns = getSynonymsForTag(row.fullTag)
    const isSelected = selectedForMerge.has(row.fullTag)
    const isTarget = isSelected && [...selectedForMerge][0] === row.fullTag

    return (
      <div
        key={row.fullTag}
        class={`tag-manager__value-row${isSelected ? ' tag-manager__value-row--selected' : ''}${isTarget ? ' tag-manager__value-row--target' : ''}`}
        onClick={mergeMode ? () => toggleMergeSelect(row.fullTag) : undefined}
        style={mergeMode ? { cursor: 'pointer' } : undefined}
      >
        {mergeMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleMergeSelect(row.fullTag)}
            class="tag-manager__merge-check"
          />
        )}

        <div class="tag-manager__value-name">
          {renamingTag === row.fullTag ? (
            <input
              type="text"
              class="tag-manager__inline-input"
              value={renameValue}
              onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(row.fullTag)
                if (e.key === 'Escape') setRenamingTag(null)
              }}
              onBlur={() => handleRename(row.fullTag)}
              autoFocus
            />
          ) : (
            <span class="tag-manager__value-label">
              {row.value}
              {row.isSeed && <span class="tag-manager__badge">{t('tags.seed', 'seed')}</span>}
              {isTarget && <span class="tag-manager__badge tag-manager__badge--target">{t('tags.mergeTarget', 'target')}</span>}
            </span>
          )}
        </div>

        <span class="tag-manager__value-count">{row.count}</span>

        {syns.length > 0 && (
          <div class="tag-manager__synonyms">
            {syns.map(s => (
              <span key={s} class="tag-manager__synonym-badge" title={t('tags.synonymOf', { target: row.fullTag, defaultValue: `Synonym of ${row.fullTag}` })}>
                {s}
              </span>
            ))}
          </div>
        )}

        {!mergeMode && (
          <div class="tag-manager__value-actions">
            <button
              class="tag-manager__action"
              onClick={(e) => { e.stopPropagation(); setRenamingTag(row.fullTag); setRenameValue(row.fullTag) }}
              title={t('tags.rename', 'Rename')}
            >
              Aa
            </button>
            {deleteConfirm === row.fullTag ? (
              <>
                <button
                  class="tag-manager__action tag-manager__action--danger"
                  onClick={(e) => { e.stopPropagation(); handleDelete(row.fullTag) }}
                  title={t('tags.delete', 'Delete')}
                >
                  {t('tags.confirmYes', 'Yes')}
                </button>
                <button
                  class="tag-manager__action"
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}
                >
                  {t('tags.confirmNo', 'No')}
                </button>
              </>
            ) : (
              <button
                class="tag-manager__action tag-manager__action--danger"
                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row.fullTag) }}
                title={t('tags.delete', 'Delete')}
              >
                x
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderClassSection = (cls: ClassData & { values: TagValueRow[] }) => {
    const totalCount = cls.values.reduce((sum, v) => sum + v.count, 0)

    return (
      <div key={cls.name} class="tag-manager__class-section">
        <div class="tag-manager__class-header" onClick={() => toggleCollapse(cls.name)}>
          <span class="tag-manager__collapse-icon">{cls.collapsed ? '\u25B6' : '\u25BC'}</span>

          {cls.color && (
            <span
              class="tag-manager__class-dot"
              style={{ background: cls.color }}
              onClick={(e) => { e.stopPropagation(); setEditingClassColor(editingClassColor === cls.name ? null : cls.name) }}
              title={t('tags.changeColor', 'Change color')}
            />
          )}

          {renamingClass === cls.name ? (
            <input
              type="text"
              class="tag-manager__inline-input"
              value={classRenameValue}
              onInput={(e) => setClassRenameValue((e.target as HTMLInputElement).value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleClassRename(cls.name)
                if (e.key === 'Escape') setRenamingClass(null)
              }}
              onBlur={() => handleClassRename(cls.name)}
              autoFocus
            />
          ) : (
            <span class="tag-manager__class-name">{cls.name}</span>
          )}

          <span class="tag-manager__class-count">{cls.values.length} {t('tags.values', 'values')} / {totalCount} {t('tags.notes', 'notes')}</span>

          <div class="tag-manager__class-actions" onClick={(e) => e.stopPropagation()}>
            <button
              class="tag-manager__action"
              onClick={() => { setAddingValueToClass(addingValueToClass === cls.name ? null : cls.name); setNewValueText('') }}
              title={t('tags.addValue', 'Add tag value')}
            >
              +
            </button>
            <button
              class="tag-manager__action"
              onClick={() => { setRenamingClass(cls.name); setClassRenameValue(cls.name) }}
              title={t('tags.renameClass', 'Rename class')}
            >
              Aa
            </button>
            {classDeleteConfirm === cls.name ? (
              <>
                <button
                  class="tag-manager__action tag-manager__action--danger"
                  onClick={() => handleClassDelete(cls.name)}
                  title={t('tags.deleteClass', 'Delete class')}
                >
                  {t('tags.confirmYes', 'Yes')}
                </button>
                <button
                  class="tag-manager__action"
                  onClick={() => setClassDeleteConfirm(null)}
                >
                  {t('tags.confirmNo', 'No')}
                </button>
              </>
            ) : (
              <button
                class="tag-manager__action tag-manager__action--danger"
                onClick={() => setClassDeleteConfirm(cls.name)}
                title={t('tags.deleteClass', 'Delete class')}
              >
                x
              </button>
            )}
          </div>
        </div>

        {editingClassColor === cls.name && (
          <div class="tag-manager__color-picker" onClick={(e) => e.stopPropagation()}>
            {CLASS_COLORS.map(c => (
              <button
                key={c}
                class={`tag-manager__color-swatch${cls.color === c ? ' tag-manager__color-swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => handleClassColorChange(cls.name, c)}
              />
            ))}
            <input
              type="color"
              class="tag-manager__color-custom"
              value={cls.color || '#6366f1'}
              onChange={(e) => handleClassColorChange(cls.name, (e.target as HTMLInputElement).value)}
              title={t('tags.customColor', 'Custom color')}
            />
          </div>
        )}

        {!cls.collapsed && (
          <div class="tag-manager__values-list">
            {cls.values.map(renderValueRow)}
            {addingValueToClass === cls.name && (
              <div class="tag-manager__add-value-row">
                <input
                  type="text"
                  class="tag-manager__inline-input"
                  placeholder={t('tags.newValue', 'New tag value...')}
                  value={newValueText}
                  onInput={(e) => setNewValueText((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddValue(cls.name)
                    if (e.key === 'Escape') setAddingValueToClass(null)
                  }}
                  autoFocus
                />
                <button
                  class="tag-manager__action"
                  onClick={() => handleAddValue(cls.name)}
                  title={t('tags.add', 'Add')}
                >
                  {'\u2713'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div class="tag-manager">
      <div class="tag-manager__header">
        <input
          type="text"
          class="tag-manager__search"
          placeholder={t('tags.search', 'Search tags...')}
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
        <button
          class={`tag-manager__add-btn${mergeMode ? ' tag-manager__add-btn--active' : ''}`}
          onClick={() => { setMergeMode(!mergeMode); setSelectedForMerge(new Set()) }}
        >
          {mergeMode ? t('tags.cancel', 'Cancel') : t('tags.merge', 'Merge')}
        </button>
        {!mergeMode && (
          <button
            class="tag-manager__add-btn"
            onClick={() => setShowClassCreate(!showClassCreate)}
          >
            {showClassCreate ? t('tags.cancel', 'Cancel') : t('tags.newClass', '+ Class')}
          </button>
        )}
      </div>

      {/* Merge bar */}
      {mergeMode && selectedForMerge.size >= 2 && (
        <div class="tag-manager__merge-bar">
          <span>
            {selectedForMerge.size} {t('tags.selected', 'selected')} — {t('tags.mergeInto', 'merge into')} "{[...selectedForMerge][0]}"
            {mergePreview !== null && (
              <span class="tag-manager__merge-preview">
                {' '}({mergePreview} {t('tags.notesAffected', 'notes affected')})
              </span>
            )}
          </span>
          {mergeConfirmPending ? (
            <>
              <span style={{ color: 'var(--color-neon-red, #ef4444)', fontSize: 11 }}>
                {t('tags.mergeConfirmInline', 'Sure?')}
              </span>
              <button class="tag-manager__btn tag-manager__btn--primary" onClick={handleMerge}>
                {t('tags.confirmYes', 'Yes')}
              </button>
              <button class="tag-manager__btn" onClick={() => setMergeConfirmPending(false)}>
                {t('tags.confirmNo', 'No')}
              </button>
            </>
          ) : (
            <button class="tag-manager__btn tag-manager__btn--primary" onClick={handleMerge}>
              {t('tags.mergeNow', 'Merge Now')}
            </button>
          )}
        </div>
      )}

      {/* Class create form */}
      {showClassCreate && !mergeMode && (
        <div class="tag-manager__create">
          <input
            type="text"
            class="tag-manager__input"
            placeholder={t('tags.className', 'Class name')}
            value={newClassName}
            onInput={(e) => setNewClassName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && handleClassCreate()}
          />
          <div class="tag-manager__color-picker tag-manager__color-picker--inline">
            {CLASS_COLORS.slice(0, 6).map(c => (
              <button
                key={c}
                class={`tag-manager__color-swatch${newClassColor === c ? ' tag-manager__color-swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => setNewClassColor(c)}
              />
            ))}
            <input
              type="color"
              class="tag-manager__color-custom"
              value={newClassColor}
              onChange={(e) => setNewClassColor((e.target as HTMLInputElement).value)}
            />
          </div>
          <button class="tag-manager__btn tag-manager__btn--primary" onClick={handleClassCreate}>
            {t('tags.create', 'Create')}
          </button>
        </div>
      )}

      {/* Class sections */}
      {filteredClasses.length === 0 && filteredUnclassed.length === 0 ? (
        <div class="tag-manager__empty">{t('tags.empty', 'No tags found')}</div>
      ) : (
        <div class="tag-manager__sections">
          {filteredClasses.map(renderClassSection)}

          {filteredUnclassed.length > 0 && (
            <div class="tag-manager__class-section tag-manager__class-section--unclassed">
              <div class="tag-manager__class-header tag-manager__class-header--unclassed">
                <span class="tag-manager__class-name">{t('tags.unclassed', 'Unclassed')}</span>
                <span class="tag-manager__class-count">{filteredUnclassed.length} {t('tags.values', 'values')}</span>
              </div>
              <div class="tag-manager__values-list">
                {filteredUnclassed.map(renderValueRow)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
