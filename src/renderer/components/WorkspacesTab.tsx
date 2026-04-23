// src/renderer/components/WorkspacesTab.tsx — Workspaces grid editor settings tab
import { useCallback, useEffect, useState } from 'preact/hooks'
import type { Persona, Workspace, WorkspaceCell, ResolvedPrompt } from '../../shared/persona-types'
import type { ProjectInfo } from '../../shared/types'
import { resolvePrompt, spanOf, resizeCells } from '../../main/workspace/workspace-manager'

const api = (window as any).cipherMux

export function WorkspacesTab() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [activeWsId, setActiveWsId] = useState('')
  const [selectedCell, setSelectedCell] = useState(0)
  const [dirty, setDirty] = useState(false)

  const loadAll = useCallback(async () => {
    const [wsList, pList, projList] = await Promise.all([
      api.workspaces.list() as Promise<Workspace[]>,
      api.personas.list() as Promise<Persona[]>,
      api.projects.list() as Promise<ProjectInfo[]>,
    ])
    setWorkspaces(wsList)
    setPersonas(pList)
    setProjects(projList)
    if (wsList.length > 0 && !activeWsId) {
      setActiveWsId(wsList[0].id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll() }, [loadAll])

  const ws = workspaces.find((w) => w.id === activeWsId)

  // ── Helpers ──

  const getPersona = (id: string): Persona =>
    personas.find((p) => p.id === id) ?? { id, name: id, color: '#6A6A72', defaultPrompt: '' }

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
    const ok = confirm(`Delete "${ws.name}"?`)
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
    const n = Math.max(1, Math.min(10, ws.cols + d))
    if (n === ws.cols) return
    const result = resizeCells(ws.cells, ws.merges, ws.cols, ws.rows, n, ws.rows)
    updateWs({ cols: n, cells: result.cells, merges: result.merges })
    if (selectedCell >= n * ws.rows) setSelectedCell(0)
  }

  const handleStepRows = (d: number) => {
    if (!ws) return
    const n = Math.max(1, Math.min(6, ws.rows + d))
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

  const handleOverrideChange = (personaId: string, value: string) => {
    if (!ws) return
    const next = { ...ws.promptOverrides }
    if (value.trim()) next[personaId] = value
    else delete next[personaId]
    updateWs({ promptOverrides: next })
  }

  const handleAddOverride = (personaId: string) => {
    if (!ws || !personaId) return
    const next = { ...ws.promptOverrides, [personaId]: '' }
    updateWs({ promptOverrides: next })
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
        const persona = getPersona(cell?.persona ?? 'empty')
        const isEmpty = cell?.persona === 'empty'
        const bg = isEmpty
          ? 'repeating-linear-gradient(45deg, var(--color-bg-elevated) 0 2px, var(--color-bg-sunken) 2px 4px)'
          : persona.color
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

  if (workspaces.length === 0 && personas.length === 0) {
    return <div class="ws-pane"><div class="ws-editor" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>loading...</div></div>
  }

  // ── Cell inspector data ──

  const cellData = ws?.cells[selectedCell]
  const cellCol = ws ? selectedCell % ws.cols : 0
  const cellRow = ws ? Math.floor(selectedCell / ws.cols) : 0
  const cellSpan = ws ? spanOf(ws, cellCol, cellRow) : 1
  const cellPersona = cellData ? getPersona(cellData.persona) : null
  const cellResolved: ResolvedPrompt | null =
    ws && cellData ? resolvePrompt(ws, cellData, personas) : null

  const sourceNote =
    cellResolved?.source === 'cell'
      ? 'Per-cell override in effect'
      : cellResolved?.source === 'workspace-override'
        ? "Using this workspace's persona override"
        : 'Using persona default from Personas tab'

  // ── Overrides data ──

  const personasUsed = ws
    ? [...new Set(ws.cells.map((c) => c.persona).filter((p) => p !== 'empty'))]
    : []
  const personasWithOverride = ws ? Object.keys(ws.promptOverrides) : []
  const overridePersonaIds = [...new Set([...personasUsed, ...personasWithOverride])]
  const missingPersonas = personas.filter(
    (p) => p.id !== 'empty' && !overridePersonaIds.includes(p.id),
  )

  return (
    <div class="ws-pane">
      {/* LEFT: workspace list */}
      <div class="ws-list">
        <div class="ws-list-head">
          <span>Saved</span>
          <button onClick={handleAddWs}>+ NEW</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {workspaces.map((w) => {
            const filledCount = w.cells.filter((c) => c.persona !== 'empty').length
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
              <button class="ws-ed-tool" onClick={handleDuplicate}>duplicate</button>
              <button class="ws-ed-tool danger" onClick={handleDelete}>delete</button>
            </div>

            {/* Dimension steppers */}
            <div class="ws-dims">
              <span class="dim-label">Cols</span>
              <div class="dim-stepper">
                <button onClick={() => handleStepCols(-1)}>-</button>
                <span class="dim-val">{ws.cols}</span>
                <button onClick={() => handleStepCols(1)}>+</button>
              </div>
              <span class="dim-label" style={{ marginLeft: '14px' }}>Rows</span>
              <div class="dim-stepper">
                <button onClick={() => handleStepRows(-1)}>-</button>
                <span class="dim-val">{ws.rows}</span>
                <button onClick={() => handleStepRows(1)}>+</button>
              </div>
              <span class="dim-note">
                <kbd>click</kbd> cell &middot; <kbd>hover</kbd> bottom edge to merge down
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
                      const persona = getPersona(cell.persona)
                      const resolved = resolvePrompt(ws, cell, personas)
                      const promptDisplay = resolved.text
                        ? resolved.text.slice(0, 48).replace(/\n/g, ' ')
                        : '(no prompt)'
                      const inherited = resolved.source !== 'cell'
                      const canMergeDown = row + span - 1 < ws.rows - 1

                      gridCells.push(
                        <div
                          key={`${col}-${row}`}
                          class="ed-cell"
                          data-idx={idx}
                          data-col={col}
                          data-row={row}
                          data-persona={cell.persona}
                          data-selected={idx === selectedCell ? 'true' : 'false'}
                          data-merged={span > 1 ? 'true' : 'false'}
                          style={{
                            gridColumn: `${col + 1}`,
                            gridRow: `${row + 1} / span ${span}`,
                            '--persona-color': persona.color,
                          } as any}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).classList.contains('merge-handle')) return
                            setSelectedCell(idx)
                          }}
                        >
                          <div class="ed-cell-row">
                            <span class="persona-chip">
                              <span class="dot" style={{ background: persona.color }} />
                              {persona.name}
                            </span>
                            <span class="ed-cell-coord" data-span={span}>
                              [{col},{row}]
                            </span>
                          </div>
                          <div class="ed-cell-project">
                            {cell.project || (cell.persona === 'empty' ? '\u2014' : 'unassigned')}
                          </div>
                          <div
                            class={`ed-cell-prompt ${inherited ? 'inherited' : ''}`}
                            title={resolved.source}
                          >
                            {promptDisplay}
                          </div>
                          {canMergeDown && (
                            <div
                              class="merge-handle"
                              title="Merge with cell below"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggleMerge(col, row + span - 1)
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
            {cellData && cellPersona && cellResolved && (
              <div class="inspector">
                <div class="insp-head">
                  <span>Cell Inspector</span>
                  <span class="coord">
                    [{cellCol}, {cellRow}]
                    {cellSpan > 1 ? ` \u00B7 ${cellSpan}\u00D7 tall` : ''}
                  </span>
                </div>
                <div class="insp-grid">
                  <div class="insp-field">
                    <label>
                      Persona{' '}
                      <span class="source-note" style={{ color: cellPersona.color }}>
                        {'\u25CF'} {cellPersona.name}
                      </span>
                    </label>
                    <select
                      value={cellData.persona}
                      onChange={(e) =>
                        handleCellUpdate('persona', (e.target as HTMLSelectElement).value)
                      }
                    >
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.builtin ? '' : ' (custom)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div class="insp-field">
                    <label>Project</label>
                    <select
                      value={cellData.project}
                      onChange={(e) =>
                        handleCellUpdate('project', (e.target as HTMLSelectElement).value)
                      }
                    >
                      <option value="">{'\u2014'} none {'\u2014'}</option>
                      {projects.map((p) => (
                        <option key={p.path} value={p.path}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div class="insp-field wide">
                    <label>
                      Cell Prompt <span class="source-note">{sourceNote}</span>
                    </label>
                    <textarea
                      value={cellData.prompt}
                      placeholder={
                        cellData.persona !== 'empty'
                          ? (cellResolved.text || '').slice(0, 140)
                          : ''
                      }
                      onInput={(e) =>
                        handleCellUpdate('prompt', (e.target as HTMLTextAreaElement).value)
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Persona Prompt Overrides */}
            <div class="overrides-wrap">
              <div class="overrides-head">
                <span>Persona Prompt Overrides</span>
                <span class="sub">
                  Per-workspace prompt injections for specific personas &middot; fall back to
                  persona default when empty
                </span>
              </div>
              <div class="overrides-list">
                {overridePersonaIds.length > 0 ? (
                  overridePersonaIds.map((pid) => {
                    const p = getPersona(pid)
                    const override = ws.promptOverrides[pid] ?? ''
                    const usingBase = !override
                    const projCount = ws.cells.filter((c) => c.persona === pid).length
                    const projectsUsing = [
                      ...new Set(
                        ws.cells
                          .filter((c) => c.persona === pid && c.project)
                          .map((c) => c.project),
                      ),
                    ]
                    return (
                      <div key={pid} class="ov-col" style={{ '--persona-color': p.color } as any}>
                        <div class="ov-label">
                          <span class="dot" />
                          <span>{p.name}</span>
                          <span class="project-count">
                            {projCount} cell{projCount === 1 ? '' : 's'}
                            {projectsUsing.length > 0 ? ` \u00B7 ${projectsUsing.join(', ')}` : ''}
                          </span>
                        </div>
                        <textarea
                          value={override}
                          placeholder="Leave empty to use persona default"
                          onInput={(e) =>
                            handleOverrideChange(pid, (e.target as HTMLTextAreaElement).value)
                          }
                        />
                        <div class={`ov-base ${usingBase ? 'using-base' : ''}`}>
                          {(p.defaultPrompt || '(no default)').slice(0, 110)}
                          {(p.defaultPrompt || '').length > 110 ? '\u2026' : ''}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--color-text-dim)',
                      gridColumn: '1 / -1',
                      padding: '8px 0',
                    }}
                  >
                    No personas assigned to cells yet. Pick one in the Cell Inspector above.
                  </div>
                )}
              </div>
              {missingPersonas.length > 0 && (
                <div class="overrides-add">
                  <select id="ws-override-picker">
                    {missingPersonas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const el = document.getElementById('ws-override-picker') as HTMLSelectElement
                      if (el?.value) handleAddOverride(el.value)
                    }}
                  >
                    + add override
                  </button>
                </div>
              )}
            </div>

            {/* Save / Revert footer */}
            <div class="foot-actions">
              <button onClick={handleRevert} disabled={!dirty}>
                revert
              </button>
              <button class="primary" onClick={handleSave} disabled={!dirty}>
                save
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            {workspaces.length === 0 ? 'No workspaces yet — click + NEW' : 'Select a workspace'}
          </div>
        )}
      </div>
    </div>
  )
}
