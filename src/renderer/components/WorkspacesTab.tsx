// src/renderer/components/WorkspacesTab.tsx — Workspaces grid editor settings tab
import { useCallback, useEffect, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { Workspace, WorkspaceCell } from '../../shared/persona-types'
import { spanOf, resizeCells } from '../../main/workspace/workspace-manager'
import { useEntityPresets } from '../hooks/useEntityPresets'
import { EntityPickerPopup } from './EntityPickerPopup'
import type { EntityId } from '../../shared/types'

const api = (window as any).cipherMux

/** Clipboard copy button with checkmark feedback. */
function CopyButton({ getText, title }: { getText: () => string; title?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={handleCopy}
      title={title}
      style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '12px', color: copied ? 'var(--color-success, #4caf50)' : 'var(--color-text-dim)', display: 'inline-flex', alignItems: 'center', gap: '2px', lineHeight: 1 }}
    >
      {copied ? '\u2713' : '\u2398'}
    </button>
  )
}

export function WorkspacesTab() {
  const { t } = useTranslation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWsId, setActiveWsId] = useState('')
  const [selectedCell, setSelectedCell] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [knownProjects, setKnownProjects] = useState<Array<{ path: string; name: string }>>([])
  const [activeWsForDefault, setActiveWsForDefault] = useState<string | null>(null)
  const entityPresets = useEntityPresets()
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [onboardingHint, setOnboardingHint] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const loadAll = useCallback(async () => {
    const wsList: Workspace[] = await api.workspaces.list()
    setWorkspaces(wsList)
    if (wsList.length > 0 && !activeWsId) {
      setActiveWsId(wsList[0].id)
    }
    // Load known projects for the project picker — try cache first, scan if empty
    try {
      let projects = await api.projects.list()
      if (!projects || projects.length === 0) {
        projects = await api.projects.scan()
      }
      setKnownProjects(projects ?? [])
    } catch { /* ignore */ }
    // Load default workspace id
    try {
      const defId = await api.config.get('activeWorkspaceId')
      setActiveWsForDefault(defId ?? null)
    } catch { /* ignore */ }
    // Load available tags for autocomplete
    try {
      const tags = await api.notes?.tags?.()
      setAllTags(tags ?? [])
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll() }, [loadAll])

  // Re-sync when another window saves/deletes a workspace
  useEffect(() => {
    const unsub = api.workspaces.onChanged?.(() => { loadAll() })
    return () => { unsub?.() }
  }, [loadAll])

  const ws = workspaces.find((w) => w.id === activeWsId)

  const updateWs = (patch: Partial<Workspace>) => {
    if (!ws) return
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === ws.id ? { ...w, ...patch } : w)),
    )
    setDirty(true)
  }

  // ── Actions ──

  const selectWs = (id: string) => {
    setActiveWsId(id)
    setSelectedCell(0)
    setDirty(false)
  }

  const handleAddWs = () => {
    const id = 'ws-' + Date.now()
    const newWs: Workspace = {
      id,
      name: 'NEW WORKSPACE',
      cols: 3,
      rows: 2,
      promptOverrides: {},
      cells: Array.from({ length: 6 }, () => ({ persona: 'empty', project: '', prompt: '' })),
      merges: {},
    }
    const isFirst = workspaces.length === 0
    setWorkspaces((prev) => [...prev, newWs])
    setActiveWsId(id)
    setSelectedCell(0)
    setDirty(true)
    if (isFirst) setOnboardingHint(true)
  }

  const handleDuplicate = () => {
    if (!ws) return
    const id = 'ws-' + Date.now()
    const dup: Workspace = JSON.parse(JSON.stringify({ ...ws, id, name: ws.name + ' COPY' }))
    setWorkspaces((prev) => [...prev, dup])
    setActiveWsId(id)
    setDirty(true)
  }

  const handleDelete = async () => {
    if (!ws) return
    const ok = confirm(t('workspacesTab.confirmDelete', { name: ws.name }))
    if (!ok) return
    await api.workspaces.delete(ws.id)
    const next = workspaces.filter((w) => w.id !== ws.id)
    setWorkspaces(next)
    if (next.length > 0) {
      setActiveWsId(next[0].id)
      setSelectedCell(0)
    }
    setDirty(false)
  }

  const handleSave = async () => {
    if (!ws) return
    const res = await api.workspaces.save(ws)
    if (res.ok) setDirty(false)
  }

  const handleRevert = async () => {
    const list: Workspace[] = await api.workspaces.list()
    setWorkspaces(list)
    setDirty(false)
    const existing = list.find((w) => w.id === activeWsId)
    if (!existing && list.length > 0) {
      setActiveWsId(list[0].id)
      setSelectedCell(0)
    }
  }

  const handleStepCols = (d: number) => {
    if (!ws) return
    const n = Math.max(1, Math.min(7, ws.cols + d))
    if (n === ws.cols) return
    const result = resizeCells(ws.cells, ws.merges, ws.cols, ws.rows, n, ws.rows)
    updateWs({ cols: n, cells: result.cells, merges: result.merges })
    if (selectedCell >= n * ws.rows) setSelectedCell(0)
  }

  const handleStepRows = (d: number) => {
    if (!ws) return
    const n = Math.max(1, Math.min(3, ws.rows + d))
    if (n === ws.rows) return
    const result = resizeCells(ws.cells, ws.merges, ws.cols, ws.rows, ws.cols, n)
    updateWs({ rows: n, cells: result.cells, merges: result.merges })
    if (selectedCell >= ws.cols * n) setSelectedCell(0)
  }

  const handleToggleMerge = (col: number, row: number) => {
    if (!ws) return
    const key = `${col}:${row}`
    const next = { ...ws.merges }
    if (next[key]) delete next[key]
    else next[key] = true
    updateWs({ merges: next })
  }

  const handleCellUpdate = (field: keyof WorkspaceCell, value: string) => {
    if (!ws) return
    const cells = [...ws.cells]
    cells[selectedCell] = { ...cells[selectedCell], [field]: value }
    updateWs({ cells })
  }

  // ── Workspace-level context paths ──

  const handleWsContextPathAdd = async () => {
    if (!ws) return
    const result = await api.dialog.openDir({ title: t('workspacesTab.addDirectory') })
    if (!result) return
    const existing = ws.contextPaths ?? []
    if (!existing.includes(result)) {
      updateWs({ contextPaths: [...existing, result] })
    }
  }

  const handleWsContextPathRemove = (pathToRemove: string) => {
    if (!ws) return
    const filtered = (ws.contextPaths ?? []).filter((p) => p !== pathToRemove)
    updateWs({ contextPaths: filtered.length > 0 ? filtered : undefined })
  }

  // ── Cell-level context paths ──

  const handleContextPathAdd = async () => {
    if (!ws) return
    const result = await api.dialog.openDir({ title: t('workspacesTab.addDirectory') })
    if (!result) return
    const cells = [...ws.cells]
    const cell = cells[selectedCell]
    const existing = cell.contextPaths ?? []
    if (!existing.includes(result)) {
      cells[selectedCell] = { ...cell, contextPaths: [...existing, result] }
      updateWs({ cells })
    }
  }

  const handleContextPathRemove = (pathToRemove: string) => {
    if (!ws) return
    const cells = [...ws.cells]
    const cell = cells[selectedCell]
    const filtered = (cell.contextPaths ?? []).filter((p) => p !== pathToRemove)
    cells[selectedCell] = { ...cell, contextPaths: filtered.length > 0 ? filtered : undefined }
    updateWs({ cells })
  }

  const handleCellPresetChange = (presetId: string) => {
    if (!ws) return
    const cells = [...ws.cells]
    cells[selectedCell] = { ...cells[selectedCell], presetId: presetId || undefined }
    updateWs({ cells })
  }

  /** Atomically set preset + project on selected cell (avoids stale-state overwrites). */
  const handleCellAssign = (presetId: string, project: string) => {
    if (!ws) return
    const cells = [...ws.cells]
    cells[selectedCell] = { ...cells[selectedCell], presetId: presetId || undefined, project }
    updateWs({ cells })
  }

  const handleActivate = async (wsId: string) => {
    const nextId = activeWsForDefault === wsId ? null : wsId
    await api.config.set('activeWorkspaceId', nextId)
    setActiveWsForDefault(nextId)
  }

  const handleTagInputChange = (value: string) => {
    setTagInput(value)
    if (value.trim()) {
      const lower = value.toLowerCase()
      const current = ws?.defaultTags ?? []
      // REQ-NOTES-011: only suggest klasse:wert format tags
      setTagSuggestions(allTags.filter(t => t.includes(':') && t.toLowerCase().includes(lower) && !current.includes(t)).slice(0, 5))
    } else {
      setTagSuggestions([])
    }
  }

  const handleAddTag = (tag: string) => {
    if (!ws) return
    const normalized = tag.trim().toLowerCase()
    // REQ-NOTES-011: only klasse:wert format allowed
    if (!normalized || !normalized.includes(':')) return
    const [klasse, ...rest] = normalized.split(':')
    if (!klasse || rest.join(':').length === 0) return
    const current = ws.defaultTags ?? []
    if (!current.includes(normalized)) {
      updateWs({ defaultTags: [...current, normalized] })
    }
    setTagInput('')
    setTagSuggestions([])
  }

  const handleRemoveTag = (tag: string) => {
    if (!ws) return
    const current = ws.defaultTags ?? []
    updateWs({ defaultTags: current.filter(t => t !== tag) })
  }

  const getPresetInfo = (presetId?: string) => {
    if (!presetId) return null
    return entityPresets.find(p => p.id === presetId) ?? null
  }

  // ── Mini thumbnail ──

  const renderThumb = (w: Workspace) => {
    const cells: preact.JSX.Element[] = []
    for (let row = 0; row < w.rows; row++) {
      for (let col = 0; col < w.cols; col++) {
        const idx = row * w.cols + col
        const span = spanOf(w, col, row)
        if (span === 0) continue
        const cell = w.cells[idx]
        const hasProject = cell?.project && cell.project !== ''
        const thumbPreset = cell?.presetId ? entityPresets.find(p => p.id === cell.presetId) : null
        const bg = thumbPreset
          ? thumbPreset.color
          : hasProject
            ? 'var(--color-accent, #4fc3f7)'
            : 'repeating-linear-gradient(45deg, var(--color-bg-elevated) 0 2px, var(--color-bg-sunken) 2px 4px)'
        cells.push(
          <div
            key={`${col}-${row}`}
            style={{
              background: bg,
              gridColumn: `${col + 1}`,
              gridRow: `${row + 1} / span ${span}`,
            }}
          />,
        )
      }
    }
    return (
      <div
        class="ws-item-thumb"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${w.cols}, 1fr)`,
          gridAutoRows: '1fr',
          gap: '2px',
          background: 'var(--color-text)',
          padding: '2px',
        }}
      >
        {cells}
      </div>
    )
  }

  // ── Loading state ──

  if (workspaces.length === 0) {
    return <div class="ws-pane"><div class="ws-editor" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{t('workspacesTab.loading')}</div></div>
  }

  // ── Cell inspector data ──

  const cellData = ws?.cells[selectedCell]
  const cellCol = ws ? selectedCell % ws.cols : 0
  const cellRow = ws ? Math.floor(selectedCell / ws.cols) : 0
  const cellSpan = ws ? spanOf(ws, cellCol, cellRow) : 1

  return (
    <div class="ws-pane">
      {onboardingHint && (
        <div class="ws-onboarding" role="status">
          <span>{t('workspacesTab.onboardingHint')}</span>
          <button onClick={() => setOnboardingHint(false)} style={{ marginLeft: '8px', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontSize: '14px' }}>&times;</button>
        </div>
      )}
      {/* LEFT: workspace list */}
      <div class="ws-list">
        <div class="ws-list-head">
          <span>{t('workspacesTab.saved')}</span>
          <button onClick={handleAddWs}>{t('workspacesTab.addNew')}</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {workspaces.map((w) => {
            const filledCount = w.cells.filter((c) => c.project && c.project !== '').length
            const presetCount = w.cells.filter((c) => c.presetId).length
            return (
              <div
                key={w.id}
                class={`ws-item ${w.id === activeWsId ? 'ws-item--active' : ''}`}
                onClick={() => selectWs(w.id)}
              >
                {renderThumb(w)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div class="ws-item-name">
                    {activeWsForDefault === w.id && <span class="ws-active-marker" title={t('workspacesTab.isActive')}>{'\u25C9'} </span>}
                    {w.name}
                  </div>
                  <div class="ws-item-sub">
                    {w.cols}&times;{w.rows} &middot; {t('workspacesTab.slotCount', { count: filledCount })}
                    {presetCount > 0 && ` \u00B7 ${t('workspacesTab.presetCount', { count: presetCount })}`}
                  </div>
                  {w.defaultTags && w.defaultTags.length > 0 && (
                    <div class="ws-item-tags">
                      {w.defaultTags.map(tag => <span key={tag} class="ws-tag-chip">#{tag}</span>)}
                    </div>
                  )}
                </div>
                <button
                  class={`ws-default-toggle${activeWsForDefault === w.id ? ' ws-default-toggle--active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleActivate(w.id) }}
                  title={t('workspacesTab.activate')}
                >
                  {activeWsForDefault === w.id ? '\u25C9' : '\u25CB'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT: editor */}
      <div class="ws-editor">
        {ws ? (
          <>
            {/* Name row */}
            <div class="ws-ed-row">
              {activeWsForDefault === ws.id && <span class="ws-active-marker" title={t('workspacesTab.isActive')}>{'\u25C9'}</span>}
              <input
                class="ws-ed-name"
                value={ws.name}
                onInput={(e) => updateWs({ name: (e.target as HTMLInputElement).value })}
              />
              <button
                class={`ws-ed-tool${activeWsForDefault === ws.id ? ' ws-ed-tool--star-active' : ''}`}
                onClick={() => handleActivate(ws.id)}
                title={t('workspacesTab.activate')}
              >
                {activeWsForDefault === ws.id ? '\u25C9' : '\u25CB'}
              </button>
              <button class="ws-ed-tool" onClick={handleDuplicate}>{t('workspacesTab.duplicate')}</button>
              <button class="ws-ed-tool danger" onClick={handleDelete}>{t('workspacesTab.delete')}</button>
            </div>

            {/* Sort order */}
            <div class="ws-ed-row" style={{ gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{t('workspacesTab.sort')}</span>
              <input
                type="number"
                min={1}
                max={999}
                style={{ width: '50px', fontSize: '12px', padding: '2px 4px', background: 'var(--color-bg-sunken)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
                value={ws.sortOrder ?? 100}
                onInput={(e) => updateWs({ sortOrder: Number((e.target as HTMLInputElement).value) || 100 })}
              />
            </div>

            {/* Dimension steppers */}
            <div class="ws-dims">
              <span class="dim-label">{t('workspacesTab.cols')}</span>
              <div class="dim-stepper">
                <button onClick={() => handleStepCols(-1)}>-</button>
                <span class="dim-val">{ws.cols}</span>
                <button onClick={() => handleStepCols(1)}>+</button>
              </div>
              <span class="dim-label" style={{ marginLeft: '14px' }}>{t('workspacesTab.rows')}</span>
              <div class="dim-stepper">
                <button onClick={() => handleStepRows(-1)}>-</button>
                <span class="dim-val">{ws.rows}</span>
                <button onClick={() => handleStepRows(1)}>+</button>
              </div>
            </div>

            {/* Tags */}
            <div class="ws-ed-tags">
              <span class="dim-label">{t('workspacesTab.tags')}</span>
              <div class="ws-ed-tags__chips">
                {(ws.defaultTags ?? []).map(tag => (
                  <span key={tag} class="ws-tag-chip ws-tag-chip--editable">
                    #{tag}
                    <span class="ws-tag-chip__remove" onClick={() => handleRemoveTag(tag)}>&times;</span>
                  </span>
                ))}
                <div class="ws-ed-tags__input-wrap">
                  <input
                    class="ws-ed-tags__input"
                    type="text"
                    value={tagInput}
                    onInput={(e) => handleTagInputChange((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault()
                        handleAddTag(tagInput)
                      }
                    }}
                    placeholder={t('workspacesTab.addTag')}
                  />
                  {tagSuggestions.length > 0 && (
                    <div class="ws-ed-tags__suggestions">
                      {tagSuggestions.map(s => (
                        <div key={s} class="ws-ed-tags__suggestion" onClick={() => handleAddTag(s)}>{s}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notes Global toggle */}
            <label class="ws-ed-row" style={{ gap: '6px', alignItems: 'center', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={ws.notesGlobal ?? false}
                onChange={(e) => updateWs({ notesGlobal: (e.target as HTMLInputElement).checked })}
              />
              <span>{t('workspacesTab.notesGlobal')}</span>
              <span style={{ fontSize: '10px', color: 'var(--color-text-dim)' }}>
                {t('workspacesTab.notesGlobalHint')}
              </span>
            </label>

            {/* Workspace Prompt + Context Directories */}
            <div class="ws-ed-sections">
              <div class="insp-field wide">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <label style={{ margin: 0 }}>{t('workspacesTab.workspacePrompt')}</label>
                  <CopyButton getText={() => ws.workspacePrompt ?? ''} title={t('workspacesTab.copyToClipboard')} />
                </div>
                <div class="pp-hint" style={{ color: 'var(--color-warning)', marginBottom: 4 }}>
                  {t('workspacesTab.changeHint')}
                </div>
                <textarea
                  value={ws.workspacePrompt ?? ''}
                  placeholder={t('workspacesTab.workspacePromptPlaceholder')}
                  onInput={(e) => updateWs({ workspacePrompt: (e.target as HTMLTextAreaElement).value || undefined })}
                  style={{ minHeight: '50px' }}
                />
              </div>
              <div class="insp-field wide">
                <label>{t('workspacesTab.contextDirectories')}</label>
                <div class="context-path-list">
                  {(ws.contextPaths ?? []).map((p) => (
                    <div key={p} class="context-path-item">
                      <span class="context-path-text" title={p}>{p}</span>
                      <button
                        class="context-path-remove"
                        onClick={() => handleWsContextPathRemove(p)}
                        title={t('workspacesTab.remove')}
                      >&times;</button>
                    </div>
                  ))}
                  <button
                    class="btn btn--sm context-path-add"
                    onClick={handleWsContextPathAdd}
                    style={{ fontSize: '11px', marginTop: '4px' }}
                  >{t('workspacesTab.addDirectory')}</button>
                </div>
              </div>
            </div>

            {/* Interactive grid */}
            <div class="ed-grid-wrap">
              <div class="ed-grid" style={{ '--cols': ws.cols } as any}>
                {(() => {
                  const gridCells: preact.JSX.Element[] = []
                  for (let row = 0; row < ws.rows; row++) {
                    for (let col = 0; col < ws.cols; col++) {
                      const idx = row * ws.cols + col
                      const span = spanOf(ws, col, row)
                      if (span === 0) continue
                      const cell = ws.cells[idx] ?? { persona: 'empty', project: '', prompt: '' }
                      const hasProject = cell.project && cell.project !== ''
                      const cellPreset = getPresetInfo(cell.presetId)
                      const hasContent = hasProject || !!cellPreset
                      const promptDisplay = cell.prompt
                        ? cell.prompt.slice(0, 48).replace(/\n/g, ' ')
                        : t('workspacesTab.noPrompt')
                      const canMergeDown = row + span - 1 < ws.rows - 1
                      const isMerged = span > 1

                      const cellClasses = [
                        'ed-cell',
                        !hasContent ? 'ed-cell--empty' : '',
                      ].filter(Boolean).join(' ')

                      const presetTooltip = cellPreset
                        ? `${cellPreset.displayName}${cellPreset.singleInstance ? ' (single instance)' : ''}`
                        : undefined

                      gridCells.push(
                        <div
                          key={`${col}-${row}`}
                          class={cellClasses}
                          data-idx={idx}
                          data-col={col}
                          data-row={row}
                          data-selected={idx === selectedCell ? 'true' : 'false'}
                          data-merged={isMerged ? 'true' : 'false'}
                          title={presetTooltip}
                          style={{
                            gridColumn: `${col + 1}`,
                            gridRow: `${row + 1} / span ${span}`,
                            '--persona-color': cellPreset ? cellPreset.color : hasProject ? 'var(--color-accent, #4fc3f7)' : '#6A6A72',
                          } as any}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).classList.contains('merge-handle')) return
                            if ((e.target as HTMLElement).classList.contains('split-handle')) return
                            setSelectedCell(idx)
                            if (!hasContent) setPickerOpen(true)
                          }}
                        >
                          {hasContent ? (
                            <>
                              <div class="ed-cell-row">
                                <span class="ed-cell-coord" data-span={span}>
                                  [{col},{row}]
                                </span>
                              </div>
                              {cellPreset ? (
                                <div class="ed-cell-preset">
                                  <span class="ed-cell-preset__dot" style={{ background: cellPreset.color }} />
                                  <span class="ed-cell-preset__name" style={{ color: cellPreset.color }}>
                                    {cellPreset.displayName}
                                  </span>
                                </div>
                              ) : hasProject ? (
                                <div class="ed-cell-project">
                                  {cell.project}
                                </div>
                              ) : null}
                              <div class="ed-cell-prompt">
                                {promptDisplay}
                              </div>
                            </>
                          ) : (
                            <>
                              <div class="ed-cell-row" style={{ position: 'absolute', top: '6px', right: '8px' }}>
                                <span class="ed-cell-coord" data-span={span}>
                                  [{col},{row}]
                                </span>
                              </div>
                              <div class="ed-cell-empty-label">
                                <span class="ed-cell-empty-label__icon">+</span>
                                <span class="ed-cell-empty-label__text">{t('workspacesTab.emptyCell')}</span>
                              </div>
                            </>
                          )}
                          {canMergeDown && (
                            <div
                              class="merge-handle"
                              title={t('workspacesTab.mergeHint')}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggleMerge(col, row + span - 1)
                              }}
                            />
                          )}
                          {isMerged && !canMergeDown && (
                            <div
                              class="merge-handle split-handle"
                              title={t('workspacesTab.splitHint')}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggleMerge(col, row + span - 2)
                              }}
                            />
                          )}
                        </div>,
                      )
                    }
                  }
                  return gridCells
                })()}
              </div>
            </div>

            {/* Cell Inspector */}
            {cellData && (
              <div class="inspector">
                <div class="insp-head">
                  <span>{t('workspacesTab.cellInspector')}</span>
                  <span class="coord">
                    [{cellCol}, {cellRow}]
                    {cellSpan > 1 ? ` \u00B7 ${cellSpan}\u00D7 ${t('workspacesTab.tall')}` : ''}
                  </span>
                </div>
                <div class="insp-grid">
                  <div class="insp-field">
                    <label>{t('workspacesTab.cellType')}</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        class={`btn btn--sm${cellData.type !== 'notes' ? ' btn--active' : ''}`}
                        onClick={() => handleCellUpdate('type', undefined)}
                        style={{ padding: '2px 10px', fontSize: '11px' }}
                      >
                        {t('workspacesTab.cellTypeSession')}
                      </button>
                      <button
                        class={`btn btn--sm${cellData.type === 'notes' ? ' btn--active' : ''}`}
                        onClick={() => handleCellUpdate('type', 'notes')}
                        style={{ padding: '2px 10px', fontSize: '11px' }}
                      >
                        {t('workspacesTab.cellTypeNotes')}
                      </button>
                    </div>
                  </div>
                  {cellData.type !== 'notes' && (<>
                  <div class="insp-field">
                    <label>{t('workspacesTab.preset')}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {cellData.presetId && getPresetInfo(cellData.presetId) ? (
                        <span style={{ color: getPresetInfo(cellData.presetId)!.color, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                          {getPresetInfo(cellData.presetId)!.displayName}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                          {cellData.project || t('workspacesTab.presetNone')}
                        </span>
                      )}
                      <button
                        class="btn btn--sm"
                        onClick={() => setPickerOpen(true)}
                        title={t('workspacesTab.preset')}
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                      >
                        {cellData.presetId || cellData.project ? '\u270E' : '+'}
                      </button>
                      {(cellData.presetId || cellData.project) && (
                        <button
                          class="btn btn--sm"
                          onClick={() => handleCellAssign('', '')}
                          title={t('workspacesTab.clear')}
                          style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--color-text-dim)' }}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </div>
                  <div class="insp-field wide">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <label style={{ margin: 0 }}>{t('workspacesTab.cellPrompt')}</label>
                      <CopyButton getText={() => cellData.prompt} title={t('workspacesTab.copyToClipboard')} />
                    </div>
                    <div class="pp-hint" style={{ color: 'var(--color-warning)', marginBottom: 4 }}>
                      {t('workspacesTab.changeHint')}
                    </div>
                    <textarea
                      value={cellData.prompt}
                      placeholder={t('workspacesTab.cellPromptPlaceholder')}
                      onInput={(e) =>
                        handleCellUpdate('prompt', (e.target as HTMLTextAreaElement).value)
                      }
                    />
                  </div>
                  {/* Context Directories — only for project-path cells */}
                  {cellData.project && !cellData.presetId && (
                    <div class="insp-field wide">
                      <label>{t('workspacesTab.contextDirectories')}</label>
                      <div class="context-path-list">
                        {(cellData.contextPaths ?? []).map((p) => (
                          <div key={p} class="context-path-item">
                            <span class="context-path-text" title={p}>{p}</span>
                            <button
                              class="context-path-remove"
                              onClick={() => handleContextPathRemove(p)}
                              title={t('workspacesTab.remove')}
                            >&times;</button>
                          </div>
                        ))}
                        <button
                          class="btn btn--sm context-path-add"
                          onClick={handleContextPathAdd}
                          style={{ fontSize: '11px', marginTop: '4px' }}
                        >{t('workspacesTab.addDirectory')}</button>
                      </div>
                    </div>
                  )}
                  </>)}
                  {cellData.type === 'notes' && (
                    <div class="insp-field wide">
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>
                        {t('workspacesTab.notesCellHint')}
                      </span>
                    </div>
                  )}
                </div>
                {pickerOpen && (
                  <EntityPickerPopup
                    onSelectPreset={(presetId: EntityId) => {
                      handleCellAssign(presetId, '')
                      setPickerOpen(false)
                    }}
                    onSelectPath={(path: string) => {
                      handleCellAssign('', path)
                      setPickerOpen(false)
                    }}
                    onSelectNote={() => {
                      // Notes are not applicable in workspace editor
                      setPickerOpen(false)
                    }}
                    onClose={() => setPickerOpen(false)}
                  />
                )}
              </div>
            )}

            {/* Save / Revert footer */}
            <div class="foot-actions">
              <button onClick={handleRevert} disabled={!dirty}>
                {t('workspacesTab.revert')}
              </button>
              <button class="primary" onClick={handleSave} disabled={!dirty}>
                {t('workspacesTab.save')}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            {workspaces.length === 0 ? t('workspacesTab.noWorkspaces') : t('workspacesTab.selectWorkspace')}
          </div>
        )}
      </div>
    </div>
  )
}
