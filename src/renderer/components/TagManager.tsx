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
          class="tag-manager__add-btn"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? t('tags.cancel') : t('tags.newTag')}
        </button>
      </div>

      {showCreate && (
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
              <th>{t('tags.name')}</th>
              <th class="tag-manager__col-count">{t('tags.count')}</th>
              <th>{t('tags.description')}</th>
              <th class="tag-manager__col-actions">{t('tags.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredTags.map((tag) => (
              <tr key={tag.name} class="tag-manager__row">
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
                      onClick={() => { setEditingTag(tag.name); setEditDesc(tag.description) }}
                      title="Click to edit"
                    >
                      {tag.description || '—'}
                    </span>
                  )}
                </td>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
