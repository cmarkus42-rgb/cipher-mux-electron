// src/renderer/components/PresetEditor.tsx — Entity preset CLAUDE.md editor
import { useCallback, useEffect, useState } from 'preact/hooks'

const api = (window as any).cipherMux

interface PresetInfo {
  id: string
  displayName: string
  color: string
  icon?: string
  projectPath: string
  sortOrder: number
  launcherHidden: boolean
}

/** Section keys matching CLAUDE.md headings */
const SECTION_KEYS = ['rolle', 'faehigkeiten', 'arbeitsregeln', 'scope'] as const
type SectionKey = (typeof SECTION_KEYS)[number]

const SECTION_LABELS: Record<SectionKey, string> = {
  rolle: 'Rolle',
  faehigkeiten: 'Faehigkeiten',
  arbeitsregeln: 'Arbeitsregeln',
  scope: 'Scope',
}

/** Parse a CLAUDE.md into sections keyed by h2 headings. */
function parseSections(content: string): { title: string; sections: Record<SectionKey, string>; raw: string } {
  const lines = content.split('\n')
  let title = ''
  const sections: Record<SectionKey, string> = {
    rolle: '',
    faehigkeiten: '',
    arbeitsregeln: '',
    scope: '',
  }

  // Extract title from first h1
  const h1Idx = lines.findIndex(l => /^#\s/.test(l))
  if (h1Idx >= 0) {
    title = lines[h1Idx].replace(/^#\s*/, '').trim()
  }

  // Find h2 sections
  let currentKey: SectionKey | null = null
  let currentLines: string[] = []

  const flushSection = () => {
    if (currentKey) {
      sections[currentKey] = currentLines.join('\n').trim()
    }
    currentLines = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const h2Match = line.match(/^##\s+(.+)/)
    if (h2Match) {
      flushSection()
      const heading = h2Match[1].trim().toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      // Match known sections
      const matched = SECTION_KEYS.find(k => heading.includes(k))
      currentKey = matched ?? null
      continue
    }
    if (currentKey) {
      currentLines.push(line)
    }
  }
  flushSection()

  return { title, sections, raw: content }
}

/** Reassemble a CLAUDE.md from title + sections. */
function assembleSections(title: string, sections: Record<SectionKey, string>): string {
  const parts: string[] = [`# ${title}`]
  for (const key of SECTION_KEYS) {
    parts.push('')
    parts.push(`## ${SECTION_LABELS[key]}`)
    parts.push('')
    parts.push(sections[key])
  }
  return parts.join('\n') + '\n'
}

export function PresetEditor() {
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [activeTab, setActiveTab] = useState<SectionKey>('rolle')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editConfirmed, setEditConfirmed] = useState(false)

  // Draft state
  const [draftTitle, setDraftTitle] = useState('')
  const [draftSections, setDraftSections] = useState<Record<SectionKey, string>>({
    rolle: '',
    faehigkeiten: '',
    arbeitsregeln: '',
    scope: '',
  })
  const [rawContent, setRawContent] = useState('')

  // New preset creation
  const [showCreate, setShowCreate] = useState(false)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')

  const loadPresets = useCallback(async () => {
    try {
      const list: PresetInfo[] = await api.presets.list()
      setPresets(list)
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
      }
    } catch {
      // empty
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPresets() }, [loadPresets])

  // Load CLAUDE.md when selection changes
  useEffect(() => {
    if (!selectedId) return
    setEditConfirmed(false)
    api.presets.read(selectedId).then((res: { ok: boolean; content: string }) => {
      if (res.ok) {
        const parsed = parseSections(res.content)
        setDraftTitle(parsed.title)
        setDraftSections({ ...parsed.sections })
        setRawContent(res.content)
        setDirty(false)
      }
    }).catch(() => {})
  }, [selectedId])

  const selectPreset = (id: string) => {
    if (dirty) {
      const ok = confirm('Unsaved changes will be lost. Continue?')
      if (!ok) return
    }
    setSelectedId(id)
    setActiveTab('rolle')
  }

  const handleSectionChange = (key: SectionKey, value: string) => {
    if (!editConfirmed) {
      const ok = confirm('Preset definitions affect the behavior of all sessions using this preset. Continue?')
      if (!ok) return
      setEditConfirmed(true)
    }
    setDraftSections(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (!selectedId) return
    const content = assembleSections(draftTitle, draftSections)
    const res = await api.presets.save(selectedId, content)
    if (res.ok) {
      setRawContent(content)
      setDirty(false)
    }
  }

  const handleRevert = () => {
    if (!rawContent) return
    const parsed = parseSections(rawContent)
    setDraftTitle(parsed.title)
    setDraftSections({ ...parsed.sections })
    setDirty(false)
    setEditConfirmed(false)
  }

  const handleSortOrderChange = async (id: string, value: number) => {
    const overrides = (await api.config.get('entitySortOrders')) ?? {}
    overrides[id] = value
    await api.config.set('entitySortOrders', overrides)
    setPresets(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, sortOrder: value } : p)
      return updated.sort((a, b) => a.sortOrder - b.sortOrder)
    })
  }

  const handleVisibilityToggle = async (id: string, hidden: boolean) => {
    const overrides = (await api.config.get('entityHidden')) ?? {}
    if (hidden) {
      overrides[id] = true
    } else {
      delete overrides[id]
    }
    await api.config.set('entityHidden', overrides)
    setPresets(prev => prev.map(p => p.id === id ? { ...p, launcherHidden: hidden } : p))
  }

  const handleDelete = async () => {
    if (!selectedId) return
    const preset = presets.find(p => p.id === selectedId)
    const ok = confirm(`Delete preset "${preset?.displayName || selectedId}"? This removes the entire entity directory.`)
    if (!ok) return
    const res = await api.presets.delete(selectedId)
    if (res.ok) {
      const next = presets.filter(p => p.id !== selectedId)
      setPresets(next)
      setSelectedId(next.length > 0 ? next[0].id : '')
      setDirty(false)
    }
  }

  const handleCreate = async () => {
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const name = newName.trim()
    if (!id || !name) return

    const res = await api.presets.create(id, name)
    if (res.ok) {
      setShowCreate(false)
      setNewId('')
      setNewName('')
      await loadPresets()
      setSelectedId(id)
    } else {
      alert(res.error || 'Failed to create preset')
    }
  }

  const selected = presets.find(p => p.id === selectedId)

  if (loading) {
    return <div class="pp-pane"><div class="pp-edit pp-edit--empty">Loading presets...</div></div>
  }

  return (
    <div class="pp-pane" style={{ minHeight: '400px' }}>
      {/* LEFT: Preset list */}
      <div class="pp-list">
        <div class="pp-list-head">
          <span>Presets</span>
          <button onClick={() => setShowCreate(true)}>+ New</button>
        </div>
        <div class="pp-list-items">
          {presets.map(p => {
            const preview = p.projectPath.split('/').pop() || p.id
            return (
              <div
                key={p.id}
                class={`pp-item ${p.id === selectedId ? 'pp-item--active' : ''}`}
                onClick={() => selectPreset(p.id)}
                style={p.launcherHidden ? { opacity: 0.5 } : undefined}
              >
                <div
                  class="pp-dot"
                  style={{ background: p.color }}
                />
                <div class="pp-item-meta">
                  <div class="pp-item-name">{p.displayName}</div>
                  <div class="pp-item-sub">{preview}</div>
                </div>
              </div>
            )
          })}
          {presets.length === 0 && (
            <div style={{ padding: '20px 12px', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              No presets found. Create one or add entity directories to ~/.config/cipher-mux/entities/
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Editor */}
      {selected ? (
        <div class="pp-edit" style={{ minHeight: '400px' }}>
          <div class="pp-edit-head">
            <div class="pp-edit-dot" style={{ background: selected.color }} />
            <input
              class="pp-edit-name"
              value={draftTitle}
              placeholder="Preset name"
              disabled
              title="Name is derived from the CLAUDE.md heading"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--color-text-dim)', marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={!selected.launcherHidden}
                onChange={e => handleVisibilityToggle(selected.id, !(e.target as HTMLInputElement).checked)}
              />
              Launcher
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
              Rang
              <input
                type="number"
                value={selected.sortOrder}
                onInput={e => {
                  const v = parseInt((e.target as HTMLInputElement).value, 10)
                  if (!isNaN(v)) handleSortOrderChange(selected.id, v)
                }}
                style={{ width: '48px', textAlign: 'center' }}
                class="input input--sm"
                min={1}
                max={999}
              />
            </label>
            <div class="pp-edit-actions">
              <button
                class="pp-btn-danger"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div class="preset-tabs">
            {SECTION_KEYS.map(key => (
              <button
                key={key}
                class={`preset-tab ${activeTab === key ? 'preset-tab--active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {SECTION_LABELS[key]}
              </button>
            ))}
          </div>

          {/* Active section editor */}
          <div class="pp-field" style={{ flex: 1 }}>
            <label>{SECTION_LABELS[activeTab]}</label>
            <div class="pp-hint">
              Section from entity CLAUDE.md &mdash; changes affect all sessions with this preset
            </div>
            <textarea
              value={draftSections[activeTab]}
              onInput={e => handleSectionChange(activeTab, (e.target as HTMLTextAreaElement).value)}
              placeholder={`Write ${SECTION_LABELS[activeTab].toLowerCase()} definition here...`}
              style={{ minHeight: '280px', flex: 1 }}
            />
          </div>

          <div class="pp-foot-actions">
            <button onClick={handleRevert} disabled={!dirty}>Revert</button>
            <button class="pp-btn-primary" onClick={handleSave} disabled={!dirty}>Save</button>
          </div>
        </div>
      ) : (
        <div class="pp-edit pp-edit--empty">
          {presets.length === 0 ? 'Create a preset to get started' : 'Select a preset'}
        </div>
      )}

      {/* Create dialog overlay */}
      {showCreate && (
        <div class="preset-create-overlay">
          <div class="preset-create-dialog">
            <div class="preset-create-title">New Preset</div>
            <div class="pp-field">
              <label>ID (directory name)</label>
              <input
                class="preset-create-input"
                value={newId}
                onInput={e => setNewId((e.target as HTMLInputElement).value)}
                placeholder="e.g. my-reviewer"
              />
            </div>
            <div class="pp-field" style={{ marginTop: '8px' }}>
              <label>Display Name</label>
              <input
                class="preset-create-input"
                value={newName}
                onInput={e => setNewName((e.target as HTMLInputElement).value)}
                placeholder="e.g. My Reviewer"
              />
            </div>
            <div class="preset-create-actions">
              <button class="preset-create-btn" onClick={() => { setShowCreate(false); setNewId(''); setNewName('') }}>Cancel</button>
              <button class="preset-create-btn preset-create-btn--primary" onClick={handleCreate} disabled={!newId.trim() || !newName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
