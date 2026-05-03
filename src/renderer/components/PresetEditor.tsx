// src/renderer/components/PresetEditor.tsx — Entity preset CLAUDE.md editor + Global Rules editor
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { Character } from '../../shared/types'

const api = (window as any).cipherMux

const GLOBAL_ID = '__global__'

interface PresetInfo {
  id: string
  displayName: string
  color: string
  icon?: string
  projectPath: string
  sortOrder: number
  launcherHidden: boolean
}


/** Extract H2 headings with their line indices for navigation. */
function extractH2Headings(content: string): { label: string; lineIndex: number }[] {
  const headings: { label: string; lineIndex: number }[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+)/)
    if (m) headings.push({ label: m[1].trim(), lineIndex: i })
  }
  return headings
}

// ─── Global Rules Editor ────────────────────────────────────
function GlobalRulesEditor() {
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.globalRules.read().then((res: { ok: boolean; content: string }) => {
      if (res.ok) {
        setContent(res.content)
        setSavedContent(res.content)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    const res = await api.globalRules.save(content)
    if (res.ok) {
      setSavedContent(content)
      setDirty(false)
    }
  }

  const handleRevert = () => {
    setContent(savedContent)
    setDirty(false)
  }

  if (loading) {
    return <div class="pp-edit pp-edit--empty">Loading global rules...</div>
  }

  return (
    <div class="pp-edit" style={{ minHeight: '400px' }}>
      <div class="pp-edit-head">
        <div class="pp-edit-dot" style={{ background: 'var(--color-accent)' }} />
        <span class="pp-edit-name" style={{ fontWeight: 600 }}>Global Rules</span>
      </div>

      <div class="pp-field" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <label>global-rules.md</label>
        <div class="pp-hint">
          Universelle Regeln — werden in JEDE Entity-Session injiziert (Layer 1). Pfad: ~/.config/cipher-mux/global-rules.md
        </div>
        <textarea
          value={content}
          onInput={e => {
            setContent((e.target as HTMLTextAreaElement).value)
            setDirty(true)
          }}
          placeholder="### Universelle Regeln&#10;&#10;1. ..."
          style={{ minHeight: '360px', flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.5' }}
        />
      </div>

      <div class="pp-foot-actions">
        <button onClick={handleRevert} disabled={!dirty}>Revert</button>
        <button class="pp-btn-primary" onClick={handleSave} disabled={!dirty}>Save</button>
      </div>
    </div>
  )
}

// ─── Preset Editor (main) ───────────────────────────────────
export function PresetEditor() {
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [selectedId, setSelectedId] = useState(GLOBAL_ID)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editConfirmed, setEditConfirmed] = useState(false)

  // Draft state — single textarea for full CLAUDE.md
  const [draftContent, setDraftContent] = useState('')
  const [savedContent, setSavedContent] = useState('')

  // Persona assignment
  const [characters, setCharacters] = useState<Character[]>([])
  const [personaOverrideId, setPersonaOverrideId] = useState<string | null>(null)

  // New preset creation
  const [showCreate, setShowCreate] = useState(false)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')

  const loadPresets = useCallback(async () => {
    try {
      const list: PresetInfo[] = await api.presets.list()
      setPresets(list)
      // Load characters for persona dropdown
      try {
        const chars: Character[] = await api.characters.list()
        setCharacters(chars)
      } catch { /* older backend */ }
    } catch {
      // empty
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadPresets() }, [loadPresets])

  // Load CLAUDE.md + persona override when selection changes
  useEffect(() => {
    if (!selectedId || selectedId === GLOBAL_ID) return
    setEditConfirmed(false)
    // Load persona override for this entity
    api.characters.getEntityPersonaOverride(selectedId).then((id: string | null) => {
      setPersonaOverrideId(id)
    }).catch(() => setPersonaOverrideId(null))
    api.presets.read(selectedId).then((res: { ok: boolean; content: string }) => {
      if (res.ok) {
        setDraftContent(res.content)
        setSavedContent(res.content)
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
    if (id === GLOBAL_ID) setDirty(false)
  }

  const handleContentChange = (value: string) => {
    if (!editConfirmed) {
      const ok = confirm('Preset definitions affect the behavior of all sessions using this preset. Continue?')
      if (!ok) return
      setEditConfirmed(true)
    }
    setDraftContent(value)
    setDirty(true)
  }

  const handleSave = async () => {
    if (!selectedId) return
    const res = await api.presets.save(selectedId, draftContent)
    if (res.ok) {
      setSavedContent(draftContent)
      setDirty(false)
    }
  }

  const handleRevert = () => {
    if (!savedContent) return
    setDraftContent(savedContent)
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
      setSelectedId(next.length > 0 ? next[0].id : GLOBAL_ID)
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
  const isGlobal = selectedId === GLOBAL_ID

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
          {/* Global Rules entry — always first */}
          <div
            class={`pp-item ${isGlobal ? 'pp-item--active' : ''}`}
            onClick={() => selectPreset(GLOBAL_ID)}
          >
            <div
              class="pp-dot"
              style={{ background: 'var(--color-accent)' }}
            />
            <div class="pp-item-meta">
              <div class="pp-item-name">Global Rules</div>
              <div class="pp-item-sub">global-rules.md</div>
            </div>
          </div>

          {/* Separator */}
          <div style={{ borderBottom: '1px solid var(--color-border)', margin: '4px 12px' }} />

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
      {isGlobal ? (
        <GlobalRulesEditor />
      ) : selected ? (
        <div class="pp-edit" style={{ minHeight: '400px' }}>
          <div class="pp-edit-head">
            <div class="pp-edit-dot" style={{ background: selected.color }} />
            <span class="pp-edit-name" style={{ fontWeight: 600 }}>
              {selected.displayName}
            </span>
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

          {/* Persona assignment */}
          {characters.length > 0 && (
            <div class="pp-field" style={{ paddingBottom: '4px', paddingTop: '4px' }}>
              <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-dim)' }}>
                Persona
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={personaOverrideId ?? ''}
                  onChange={async (e) => {
                    const val = (e.target as HTMLSelectElement).value || null
                    await api.characters.setEntityPersonaOverride(selectedId, val)
                    setPersonaOverrideId(val)
                  }}
                  style={{ flex: 1, padding: '4px 8px', fontSize: '12px', background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                >
                  <option value="">Default (from matrix)</option>
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div class="pp-hint" style={{ marginTop: '2px' }}>
                Personas are created in the Companion tab. Changes apply on next session start.
              </div>
            </div>
          )}

          {/* CLAUDE.md editor — full content with H2 navigation */}
          {(() => {
            const headings = extractH2Headings(draftContent)
            const textareaRef = useRef<HTMLTextAreaElement>(null)
            const scrollToHeading = (lineIndex: number) => {
              const ta = textareaRef.current
              if (!ta) return
              const lines = draftContent.split('\n')
              let charPos = 0
              for (let i = 0; i < lineIndex && i < lines.length; i++) {
                charPos += lines[i].length + 1
              }
              ta.focus()
              ta.setSelectionRange(charPos, charPos)
              // Scroll textarea so the heading line is near the top
              const lineHeight = 18 // approximate
              ta.scrollTop = Math.max(0, lineIndex * lineHeight - 20)
            }
            return (
              <div class="pp-field" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label>CLAUDE.md</label>
                <div class="pp-hint">
                  Entity-Definition (Markdown) — definiert Rolle, Regeln und Tools fuer alle Sessions dieses Presets
                </div>
                {headings.length > 0 && (
                  <div class="preset-tabs" style={{ marginBottom: '4px', flexWrap: 'wrap' }}>
                    {headings.map((h, i) => (
                      <button
                        key={i}
                        class="preset-tab"
                        onClick={() => scrollToHeading(h.lineIndex)}
                        title={`Go to ## ${h.label}`}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={draftContent}
                  onInput={e => handleContentChange((e.target as HTMLTextAreaElement).value)}
                  placeholder="# Entity Name&#10;&#10;Rolle, Lifecycle, MCP-Tools, Regeln..."
                  style={{ minHeight: '360px', flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.5' }}
                />
              </div>
            )
          })()}

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
