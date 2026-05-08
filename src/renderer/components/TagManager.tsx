// src/renderer/components/TagManager.tsx
// Tag Management UI for the Workspaces/Personas window
import { useState, useEffect, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'

interface TagInfo {
  name: string
  count: number
  description: string
  isSeed: boolean
}

const api = (window as any).cipherMux

export function TagManager() {
  const { t } = useTranslation()
  const [tags, setTags] = useState<TagInfo[]>([])
  const [search, setSearch] = useState('')
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [renamingTag, setRenamingTag] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagDesc, setNewTagDesc] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [mergeMode, setMergeMode] = useState(false)
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set())

  const loadTags = useCallback(async () => {
    const list = await api.notes.tagList()
    setTags(list)
  }, [])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(search.toLowerCase()) ||
    tag.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    const name = newTagName.trim().toLowerCase()
    if (!name) return
    const result = await api.notes.tagCreate(name, newTagDesc.trim())
    if (result.ok) {
      setNewTagName('')
      setNewTagDesc('')
      setShowCreate(false)
      await loadTags()
    }
  }

  const handleRename = async (oldName: string) => {
    const newName = renameValue.trim().toLowerCase()
    if (!newName || newName === oldName) {
      setRenamingTag(null)
      return
    }
    await api.notes.tagRename(oldName, newName)
    setRenamingTag(null)
    setRenameValue('')
    await loadTags()
  }

  const handleUpdateDesc = async (name: string) => {
    await api.notes.tagUpdate(name, editDesc)
    setEditingTag(null)
    setEditDesc('')
    await loadTags()
  }

  const handleDelete = async (name: string) => {
    const confirmed = window.confirm(t('tags.deleteConfirm', { name }))
    if (!confirmed) return
    await api.notes.tagDelete(name)
    await loadTags()
  }

  const toggleMergeSelect = (name: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleMerge = async () => {
    if (selectedForMerge.size < 2) return
    const sources = [...selectedForMerge]
    const target = sources[0]
    const confirmed = window.confirm(
      `Merge ${sources.length} tags into "${target}"?\n\nSource tags: ${sources.join(', ')}\nAll notes will be updated.`
    )
    if (!confirmed) return
    await api.notes.tagMerge(sources, target)
    setSelectedForMerge(new Set())
    setMergeMode(false)
    await loadTags()
  }

  const handleArchiveLegacy = async () => {
    // Find notes created before CF update (2026-05-01)
    const allNotes = await api.notes.list()
    const cutoff = '2026-05-01T00:00:00.000Z'
    const legacy = allNotes.filter((n: any) => n.createdAt < cutoff)
    if (legacy.length === 0) {
      window.alert('No legacy notes found (all notes are post-CF).')
      return
    }
    const confirmed = window.confirm(
      `Archive ${legacy.length} legacy notes (created before 2026-05-01)?\n\nThey will be moved to trash and can be restored.`
    )
    if (!confirmed) return
    await api.notes.trashMany(legacy.map((n: any) => n.id))
    await loadTags()
  }

  return (
    <div class="tag-manager">
      <div class="tag-manager__header">
        <input
          type="text"
          class="tag-manager__search"
          placeholder={t('tags.search')}
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
          <>
            <button
              class="tag-manager__add-btn"
              onClick={() => setShowCreate(!showCreate)}
            >
              {showCreate ? t('tags.cancel') : t('tags.newTag')}
            </button>
            <button
              class="tag-manager__add-btn"
              onClick={handleArchiveLegacy}
              title="Move pre-CF notes to trash"
            >
              Archive Legacy
            </button>
          </>
        )}
      </div>

      {mergeMode && selectedForMerge.size >= 2 && (
        <div class="tag-manager__merge-bar">
          <span>{selectedForMerge.size} selected — merge into "{[...selectedForMerge][0]}"</span>
          <button class="tag-manager__btn tag-manager__btn--primary" onClick={handleMerge}>
            {t('tags.mergeNow', 'Merge Now')}
          </button>
        </div>
      )}

      {showCreate && !mergeMode && (
        <div class="tag-manager__create">
          <input
            type="text"
            class="tag-manager__input"
            placeholder={t('tags.newTagName')}
            value={newTagName}
            onInput={(e) => setNewTagName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <input
            type="text"
            class="tag-manager__input tag-manager__input--wide"
            placeholder={t('tags.newTagDesc')}
            value={newTagDesc}
            onInput={(e) => setNewTagDesc((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button class="tag-manager__btn tag-manager__btn--primary" onClick={handleCreate}>
            {t('tags.create')}
          </button>
        </div>
      )}

      {filteredTags.length === 0 ? (
        <div class="tag-manager__empty">{t('tags.empty')}</div>
      ) : (
        <table class="tag-manager__table">
          <thead>
            <tr>
              {mergeMode && <th class="tag-manager__col-check" />}
              <th>{t('tags.name')}</th>
              <th class="tag-manager__col-count">{t('tags.count')}</th>
              <th>{t('tags.description')}</th>
              {!mergeMode && <th class="tag-manager__col-actions">{t('tags.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {filteredTags.map((tag) => (
              <tr
                key={tag.name}
                class={`tag-manager__row${selectedForMerge.has(tag.name) ? ' tag-manager__row--selected' : ''}`}
                onClick={mergeMode ? () => toggleMergeSelect(tag.name) : undefined}
                style={mergeMode ? { cursor: 'pointer' } : undefined}
              >
                {mergeMode && (
                  <td class="tag-manager__col-check">
                    <input
                      type="checkbox"
                      checked={selectedForMerge.has(tag.name)}
                      onChange={() => toggleMergeSelect(tag.name)}
                    />
                  </td>
                )}
                <td class="tag-manager__name-cell">
                  {renamingTag === tag.name ? (
                    <input
                      type="text"
                      class="tag-manager__inline-input"
                      value={renameValue}
                      onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(tag.name)
                        if (e.key === 'Escape') setRenamingTag(null)
                      }}
                      onBlur={() => handleRename(tag.name)}
                      autoFocus
                    />
                  ) : (
                    <span class="tag-manager__tag-name">
                      {tag.name}
                      {tag.isSeed && <span class="tag-manager__badge">{t('tags.seed')}</span>}
                    </span>
                  )}
                </td>
                <td class="tag-manager__col-count">{tag.count}</td>
                <td>
                  {editingTag === tag.name ? (
                    <input
                      type="text"
                      class="tag-manager__inline-input tag-manager__inline-input--wide"
                      value={editDesc}
                      onInput={(e) => setEditDesc((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateDesc(tag.name)
                        if (e.key === 'Escape') setEditingTag(null)
                      }}
                      onBlur={() => handleUpdateDesc(tag.name)}
                      autoFocus
                    />
                  ) : (
                    <span
                      class="tag-manager__desc"
                      onClick={!mergeMode ? () => { setEditingTag(tag.name); setEditDesc(tag.description) } : undefined}
                      title={!mergeMode ? 'Click to edit' : undefined}
                    >
                      {tag.description || '\u2014'}
                    </span>
                  )}
                </td>
                {!mergeMode && (
                  <td class="tag-manager__col-actions">
                    <button
                      class="tag-manager__action"
                      onClick={() => { setRenamingTag(tag.name); setRenameValue(tag.name) }}
                      title={t('tags.rename')}
                    >
                      Aa
                    </button>
                    <button
                      class="tag-manager__action tag-manager__action--danger"
                      onClick={() => handleDelete(tag.name)}
                      title={t('tags.delete')}
                    >
                      x
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
