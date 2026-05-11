// src/renderer/components/CompanionTab.tsx — Companion character editor (replaces PersonasTab)
import { useCallback, useEffect, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { Character } from '../../shared/types'
import { assignCharacterColor } from '../../shared/character-palette'
import { PersonaAvatar } from './PersonaAvatar'

const api = (window as any).cipherMux

export function CompanionTab() {
  const { t } = useTranslation()
  const [characters, setCharacters] = useState<Character[]>([])
  const [activeId, setActiveId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [dirty, setDirty] = useState(false)

  const [draftName, setDraftName] = useState('')
  const [draftPrompt, setDraftPrompt] = useState('')
  const [globalPersonaId, setGlobalPersonaId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const list: Character[] = await api.characters.list()
    const active: Character = await api.characters.active()
    setCharacters(list)
    setActiveId(active?.id ?? list[0]?.id ?? '')
    if (!selectedId && list.length > 0) {
      const sel = active?.id ?? list[0].id
      setSelectedId(sel)
      const c = list.find(x => x.id === sel)
      if (c) applyDraft(c)
    }
    // Load global persona override
    try {
      const gp = await api.characters.getGlobalPersona()
      setGlobalPersonaId(gp)
    } catch { /* older backend without this channel */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll() }, [loadAll])

  const applyDraft = (c: Character) => {
    setDraftName(c.name)
    setDraftPrompt(c.prompt)
    setDirty(false)
  }

  const selectCharacter = (id: string) => {
    const c = characters.find(x => x.id === id)
    if (!c) return
    setSelectedId(id)
    applyDraft(c)
  }

  const selected = characters.find(c => c.id === selectedId)
  const isDefault = selected?.isDefault === true

  const handleSave = async () => {
    if (!selected) return
    const updated: Character = {
      ...selected,
      name: draftName.trim() || selected.name,
      prompt: draftPrompt,
      updatedAt: new Date().toISOString(),
    }
    const res = await api.characters.save(updated)
    if (res.ok) {
      setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c))
      setDirty(false)
    }
  }

  const handleActivate = async () => {
    if (!selected) return
    const res = await api.characters.switch(selected.id)
    if (res.ok) {
      setActiveId(selected.id)
    }
  }

  const handleAdd = () => {
    const id = 'char-' + Date.now()
    const now = new Date().toISOString()
    const existingColors = characters.map(c => c.color).filter(Boolean)
    const newChar: Character = {
      id,
      name: 'New Character',
      prompt: '',
      color: assignCharacterColor(existingColors),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    }
    setCharacters(prev => [...prev, newChar])
    setSelectedId(id)
    applyDraft(newChar)
    setDirty(true)
  }

  const handleDelete = async () => {
    if (!selected || isDefault) return
    const ok = confirm(`Delete character "${draftName}"?`)
    if (!ok) return
    const res = await api.characters.delete(selected.id)
    if (res.ok) {
      const next = characters.filter(c => c.id !== selected.id)
      setCharacters(next)
      if (next.length > 0) {
        setSelectedId(next[0].id)
        applyDraft(next[0])
      }
    }
  }

  const handleRevert = async () => {
    const list: Character[] = await api.characters.list()
    setCharacters(list)
    const c = list.find(x => x.id === selectedId)
    if (c) applyDraft(c)
  }

  if (characters.length === 0) {
    return <div class="pp-pane"><div class="pp-edit pp-edit--empty">Loading...</div></div>
  }

  return (
    <div class="pp-pane">
      {/* LEFT: character list */}
      <div class="pp-list">
        <div class="pp-list-head">
          <span>Companion</span>
          <button onClick={handleAdd}>+ New</button>
        </div>
        <div class="pp-list-items">
          {characters.map(c => {
            const preview = (c.prompt || '').slice(0, 48).replace(/\n/g, ' ')
            return (
              <div
                key={c.id}
                class={`pp-item ${c.id === selectedId ? 'pp-item--active' : ''}`}
                onClick={() => selectCharacter(c.id)}
              >
                <PersonaAvatar characterId={c.id} color={c.color || '#6A6A72'} />
                <div class="pp-dot" style={{ background: c.color || '#6A6A72', opacity: c.id === activeId ? 1 : 0.4 }} />
                <div class="pp-item-meta">
                  <div class="pp-item-name">{c.name}</div>
                  <div class={`pp-item-sub ${preview ? '' : 'pp-item-sub--empty'}`}>
                    {preview || 'No prompt'}
                  </div>
                </div>
                {c.id === globalPersonaId && <div class="pp-badge" style={{ background: 'var(--color-accent, #4fc3f7)' }}>GLOBAL</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT: editor */}
      {selected ? (
        <div class="pp-edit">
          <div class="pp-edit-head">
            <div class="pp-edit-dot" style={{ background: selected.color || '#6A6A72', opacity: selected.id === activeId ? 1 : 0.4 }} />
            <input
              class="pp-edit-name"
              value={draftName}
              placeholder="Character name"
              onInput={e => {
                setDraftName((e.target as HTMLInputElement).value)
                setDirty(true)
              }}
            />
            <div class="pp-edit-actions">
              {selected.id !== activeId && (
                <button onClick={handleActivate}>Activate</button>
              )}
              <button
                class="pp-btn-danger"
                onClick={handleDelete}
                disabled={isDefault}
                title={isDefault ? 'Default character cannot be deleted' : undefined}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Global persona override toggle */}
          <div class="pp-field" style={{ paddingBottom: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={globalPersonaId === selected.id}
                onChange={async () => {
                  const newVal = globalPersonaId === selected.id ? null : selected.id
                  await api.characters.setGlobalPersona(newVal)
                  setGlobalPersonaId(newVal)
                }}
              />
              <span>Globaler Override — diese Persona fuer ALLE Presets verwenden</span>
            </label>
            {globalPersonaId && globalPersonaId === selected.id && (
              <div class="pp-hint" style={{ color: 'var(--color-accent)', marginTop: '4px' }}>
                Diese Persona ueberschreibt alle preset-spezifischen Persona-Zuweisungen.
              </div>
            )}
          </div>

          <div class="pp-field">
            <label>Persona-Prompt</label>
            <div class="pp-hint">
              Dieser Prompt wird in alle Entity-Sessions injiziert (Workshop, Cyber Factory, Companion, Audit, etc.)
            </div>
            <textarea
              value={draftPrompt}
              onInput={e => {
                setDraftPrompt((e.target as HTMLTextAreaElement).value)
                setDirty(true)
              }}
              placeholder="Write the character's personality, tone rules, and behavior here..."
              style={{ minHeight: '300px' }}
            />
          </div>

          <div class="pp-foot-actions">
            <button onClick={handleRevert} disabled={!dirty}>Revert</button>
            <button class="pp-btn-primary" onClick={handleSave} disabled={!dirty}>Save</button>
          </div>
        </div>
      ) : (
        <div class="pp-edit pp-edit--empty">Select a character</div>
      )}
    </div>
  )
}
