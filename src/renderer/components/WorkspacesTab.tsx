// src/renderer/components/WorkspacesTab.tsx — Workspaces grid editor settings tab
import { useCallback, useEffect, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { Workspace, WorkspaceCell } from '../../shared/persona-types'
import type { ProjectInfo } from '../../shared/types'
import { spanOf, resizeCells } from '../../main/workspace/workspace-manager'

const api = (window as any).cipherMux

export function WorkspacesTab() {
  const { t } = useTranslation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [activeWsId, setActiveWsId] = useState('')
  const [selectedCell, setSelectedCell] = useState(0)
  const [dirty, setDirty] = useState(false)

  const loadAll = useCallback(async () => {
    const [wsList, projList] = await Promise.all([
      api.workspaces.list() as Promise<Workspace[]>,
      api.projects.list() as Promise<ProjectInfo[]>,
    ])
    setWorkspaces(wsList)
    setProjects(projList)
    if (wsList.length > 0 && !activeWsId) {
      setActiveWsId(wsList[0].id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll() }, [loadAll])

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
    setWorkspaces((prev) => [...prev, newWs])
    setActiveWsId(id)
    setSelectedCell(0)
    setDirty(true)
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
        const bg = hasProject
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

  if (workspaces.length === 0 && projects.length === 0) {
    return <div class="ws-pane"><div class="ws-editor" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{t('workspacesTab.loading')}</div></div>
  }

  // ── Cell inspector data ──

  const cellData = ws?.cells[selectedCell]
  const cellCol = ws ? selectedCell % ws.cols : 0
  const cellRow = ws ? Math.floor(selectedCell / ws.cols) : 0
  const cellSpan = ws ? spanOf(ws, cellCol, cellRow) : 1

  return (
    <div class="ws-pane">
      {/* LEFT: workspace list */}
      <div class="ws-list">
        <div class="ws-list-head">
          <span>{t('workspacesTab.saved')}</span>
          <button onClick={handleAddWs}>{t('workspacesTab.addNew')}</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {workspaces.map((w) => {
            const filledCount = w.cells.filter((c) => c.project && c.project !== '').length
            return (
              <div
                key={w.id}
                class={`ws-item ${w.id === activeWsId ? 'ws-item--active' : ''}`}
                onClick={() => selectWs(w.id)}
              >
                {renderThumb(w)}
                <div>
                  <div class="ws-item-name">{w.name}</div>
                  <div class="ws-item-sub">
                    {w.cols}&times;{w.rows} &middot; {filledCount} slot{filledCount === 1 ? '' : 's'}
                  </div>
                </div>
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
              <input
                class="ws-ed-name"
                value={ws.name}
                onInput={(e) => updateWs({ name: (e.target as HTMLInputElement).value })}
              />
              <button class="ws-ed-tool" onClick={handleDuplicate}>{t('workspacesTab.duplicate')}</button>
              <button class="ws-ed-tool danger" onClick={handleDelete}>{t('workspacesTab.delete')}</button>
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
              <span class="dim-note">
                {t('workspacesTab.gridHint')}
              </span>
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
                      const promptDisplay = cell.prompt
                        ? cell.prompt.slice(0, 48).replace(/\n/g, ' ')
                        : t('workspacesTab.noPrompt')
                      const canMergeDown = row + span - 1 < ws.rows - 1
                      const isMerged = span > 1

                      gridCells.push(
                        <div
                          key={`${col}-${row}`}
                          class="ed-cell"
                          data-idx={idx}
                          data-col={col}
                          data-row={row}
                          data-selected={idx === selectedCell ? 'true' : 'false'}
                          data-merged={isMerged ? 'true' : 'false'}
                          style={{
                            gridColumn: `${col + 1}`,
                            gridRow: `${row + 1} / span ${span}`,
                            '--persona-color': hasProject ? 'var(--color-accent, #4fc3f7)' : '#6A6A72',
                          } as any}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).classList.contains('merge-handle')) return
                            if ((e.target as HTMLElement).classList.contains('split-handle')) return
                            setSelectedCell(idx)
                          }}
                        >
                          <div class="ed-cell-row">
                            <span class="ed-cell-coord" data-span={span}>
                              [{col},{row}]
                            </span>
                          </div>
                          <div class="ed-cell-project">
                            {cell.project || '\u2014'}
                          </div>
                          <div class="ed-cell-prompt">
                            {promptDisplay}
                          </div>
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
                    {cellSpan > 1 ? ` \u00B7 ${cellSpan}\u00D7 tall` : ''}
                  </span>
                </div>
                <div class="insp-grid">
                  <div class="insp-field">
                    <label>{t('workspacesTab.project')}</label>
                    <select
                      value={cellData.project}
                      onChange={(e) =>
                        handleCellUpdate('project', (e.target as HTMLSelectElement).value)
                      }
                    >
                      <option value="">{t('workspacesTab.projectNone')}</option>
                      {projects.map((p) => (
                        <option key={p.path} value={p.path}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div class="insp-field wide">
                    <label>{t('workspacesTab.cellPrompt')}</label>
                    <textarea
                      value={cellData.prompt}
                      placeholder="Optional cell-specific prompt"
                      onInput={(e) =>
                        handleCellUpdate('prompt', (e.target as HTMLTextAreaElement).value)
                      }
                    />
                  </div>
                </div>
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
