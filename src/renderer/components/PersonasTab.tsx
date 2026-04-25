// src/renderer/components/PersonasTab.tsx — Personas settings tab
import { useCallback, useEffect, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { Persona, Workspace } from '../../shared/persona-types'
import { PERSONA_SWATCHES } from '../../shared/persona-types'

const api = (window as any).cipherMux

function countUsage(personaId: string, workspaces: Workspace[]) {
  let cellCount = 0
  const wsNames: string[] = []
  for (const ws of workspaces) {
    const hits = ws.cells.filter((c) => c.persona === personaId).length
    if (hits > 0) {
      cellCount += hits
      wsNames.push(ws.name)
    }
  }
  return { cellCount, wsNames }
}

export function PersonasTab() {
  const { t } = useTranslation()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [activeId, setActiveId] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [dirty, setDirty] = useState(false)

  // Draft state for the currently selected persona (editable copy)
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState('')
  const [draftPrompt, setDraftPrompt] = useState('')

  const loadAll = useCallback(async () => {
    const list: Persona[] = await api.personas.list()
    setPersonas(list)
    if (list.length > 0 && !activeId) {
      setActiveId(list[0].id)
      applyDraft(list[0])
    }
    const wsList: Workspace[] = await api.workspaces.list()
    setWorkspaces(wsList)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const applyDraft = (p: Persona) => {
    setDraftName(p.name)
    setDraftColor(p.color)
    setDraftPrompt(p.defaultPrompt)
    setDirty(false)
  }

  const selectPersona = (id: string) => {
    const p = personas.find((x) => x.id === id)
    if (!p) return
    setActiveId(id)
    applyDraft(p)
  }

  const active = personas.find((p) => p.id === activeId)
  const isBuiltin = active?.builtin === true
  const usage = active ? countUsage(active.id, workspaces) : { cellCount: 0, wsNames: [] }

  // ── CRUD Handlers ──

  const handleSave = async () => {
    if (!active) return
    const updated: Persona = {
      ...active,
      name: isBuiltin ? active.name : draftName.trim() || active.name,
      color: isBuiltin ? active.color : draftColor,
      defaultPrompt: draftPrompt,
    }
    const res = await api.personas.save(updated)
    if (res.ok) {
      setPersonas((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      setDirty(false)
    }
  }

  const handleRevert = async () => {
    const list: Persona[] = await api.personas.list()
    setPersonas(list)
    const p = list.find((x) => x.id === activeId)
    if (p) applyDraft(p)
  }

  const handleAdd = () => {
    const id = 'persona-' + Date.now()
    const newP: Persona = {
      id,
      name: 'NEW PERSONA',
      color: '#4A6FA5',
      builtin: false,
      defaultPrompt: '',
    }
    const next = [...personas, newP]
    setPersonas(next)
    setActiveId(id)
    applyDraft(newP)
    setDirty(true)
  }

  const handleDuplicate = () => {
    if (!active) return
    const id = 'persona-' + Date.now()
    const dup: Persona = {
      ...active,
      id,
      name: (isBuiltin ? active.name : draftName) + ' COPY',
      color: isBuiltin ? active.color : draftColor,
      defaultPrompt: draftPrompt,
      builtin: false,
    }
    const next = [...personas, dup]
    setPersonas(next)
    setActiveId(id)
    applyDraft(dup)
    setDirty(true)
  }

  const handleDelete = async () => {
    if (!active || isBuiltin) return
    const ok = confirm(t('personasTab.confirmDelete', { name: draftName }))
    if (!ok) return
    const res = await api.personas.delete(active.id)
    if (res.ok) {
      const next = personas.filter((p) => p.id !== active.id)
      setPersonas(next)
      if (next.length > 0) {
        setActiveId(next[0].id)
        applyDraft(next[0])
      }
    }
  }

  // ── Render ──

  if (personas.length === 0) {
    return <div class="pp-pane"><div class="pp-edit pp-edit--empty">{t('personasTab.loading')}</div></div>
  }

  return (
    <div class="pp-pane">
      {/* LEFT: list */}
      <div class="pp-list">
        <div class="pp-list-head">
          <span>{t('personasTab.title')}</span>
          <button onClick={handleAdd}>{t('personasTab.addNew')}</button>
        </div>
        <div class="pp-list-items">
          {personas.map((p) => {
            const preview = (p.defaultPrompt || '').slice(0, 48).replace(/\n/g, ' ')
            return (
              <div
                key={p.id}
                class={`pp-item ${p.id === activeId ? 'pp-item--active' : ''}`}
                onClick={() => selectPersona(p.id)}
              >
                <div class="pp-dot" style={{ background: p.color }} />
                <div class="pp-item-meta">
                  <div class="pp-item-name">{p.name}</div>
                  <div class={`pp-item-sub ${preview ? '' : 'pp-item-sub--empty'}`}>
                    {preview || t('personasTab.noPrompt')}
                  </div>
                </div>
                {p.builtin ? <div class="pp-badge">{t('personasTab.builtIn')}</div> : <div />}
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT: editor */}
      {active ? (
        <div class="pp-edit">
          {/* Header */}
          <div class="pp-edit-head">
            <div class="pp-edit-dot" style={{ background: isBuiltin ? active.color : draftColor }} />
            <input
              class="pp-edit-name"
              value={isBuiltin ? active.name : draftName}
              disabled={isBuiltin}
              placeholder={t('personasTab.namePlaceholder')}
              onInput={(e) => {
                setDraftName((e.target as HTMLInputElement).value)
                setDirty(true)
              }}
            />
            <div class="pp-edit-actions">
              <button onClick={handleDuplicate}>{t('personasTab.duplicate')}</button>
              <button
                class="pp-btn-danger"
                onClick={handleDelete}
                disabled={isBuiltin}
                title={isBuiltin ? t('personasTab.deleteBuiltinHint') : undefined}
              >
                {t('personasTab.delete')}
              </button>
            </div>
          </div>

          {/* Color swatches */}
          <div class="pp-colors">
            <div class="pp-colors-label">
              {t('personasTab.colorLabel')}{' '}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'none', letterSpacing: '0', color: isBuiltin ? active.color : draftColor }}>
                {isBuiltin ? active.color : draftColor}
              </span>
              {isBuiltin && (
                <span style={{ color: 'var(--color-text-dim)', textTransform: 'uppercase', marginLeft: '8px' }}>
                  {t('personasTab.locked')}
                </span>
              )}
            </div>
            {PERSONA_SWATCHES.map((c) => (
              <div
                key={c}
                class={`pp-swatch ${(isBuiltin ? active.color : draftColor) === c ? 'pp-swatch--selected' : ''} ${isBuiltin ? 'pp-swatch--locked' : ''}`}
                style={{ background: c }}
                onClick={() => {
                  if (isBuiltin) return
                  setDraftColor(c)
                  setDirty(true)
                }}
              />
            ))}
          </div>

          {/* Prompt textarea */}
          <div class="pp-field">
            <label>{t('personasTab.defaultPrompt')}</label>
            <div class="pp-hint">
              {t('personasTab.promptHint')}
            </div>
            <textarea
              value={draftPrompt}
              onInput={(e) => {
                setDraftPrompt((e.target as HTMLTextAreaElement).value)
                setDirty(true)
              }}
              placeholder={t('personasTab.promptPlaceholder')}
            />
            {active?.builtin && active.id !== 'empty' && (
              <div class="persona-hint">
                {t('personasTab.builtinNote', { name: active.name })}
              </div>
            )}
          </div>

          {/* Usage footer */}
          <div class="pp-usage">
            {usage.cellCount > 0 ? (
              <span>
                Used in <b>{usage.wsNames.length}</b> workspace{usage.wsNames.length === 1 ? '' : 's'},{' '}
                <b>{usage.cellCount}</b> cell{usage.cellCount === 1 ? '' : 's'}:{' '}
                {usage.wsNames.map((n, i) => (
                  <span key={n}>
                    {i > 0 && ', '}
                    <b>{n}</b>
                  </span>
                ))}
              </span>
            ) : (
              <span class="pp-usage-empty">{t('personasTab.notUsed')}</span>
            )}
          </div>

          {/* Save / Revert */}
          <div class="pp-foot-actions">
            <button onClick={handleRevert} disabled={!dirty}>
              {t('personasTab.revert')}
            </button>
            <button class="pp-btn-primary" onClick={handleSave} disabled={!dirty}>
              {t('personasTab.save')}
            </button>
          </div>
        </div>
      ) : (
        <div class="pp-edit pp-edit--empty">{t('personasTab.selectPersona')}</div>
      )}
    </div>
  )
}
