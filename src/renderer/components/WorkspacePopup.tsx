// src/renderer/components/WorkspacePopup.tsx
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks'
import type { Workspace, Persona } from '../../shared/persona-types'

interface WorkspacePopupProps {
  visible: boolean
  onClose: () => void
  onApply: (workspaceId: string) => void
  onOpenSettings: (tab: 'personas' | 'workspaces') => void
}

/** Inline span calculation (mirrors main/workspace/workspace-manager spanOf, renderer-safe) */
function thumbSpanOf(ws: Workspace, col: number, row: number): number {
  if (row > 0 && ws.merges[`${col}:${row - 1}`]) return 0
  let span = 1
  let r = row
  while (ws.merges[`${col}:${r}`] && r + 1 < ws.rows) {
    span++
    r++
  }
  return span
}

function WorkspaceThumbnail({ ws, personas }: { ws: Workspace; personas: Persona[] }) {
  const personaMap = useMemo(() => {
    const m: Record<string, Persona> = {}
    for (const p of personas) m[p.id] = p
    return m
  }, [personas])

  return (
    <div
      class="wp-thumb"
      style={{
        gridTemplateColumns: `repeat(${ws.cols}, 1fr)`,
        gridTemplateRows: `repeat(${ws.rows}, 1fr)`,
      }}
    >
      {Array.from({ length: ws.cols }, (_, col) =>
        Array.from({ length: ws.rows }, (_, row) => {
          const span = thumbSpanOf(ws, col, row)
          if (span === 0) return null
          const cellIdx = row * ws.cols + col
          const cell = ws.cells[cellIdx]
          const persona = cell ? personaMap[cell.persona] : undefined
          const color = persona?.color ?? '#6A6A72'
          return (
            <div
              key={`${col}:${row}`}
              class="vcell"
              style={{
                gridColumn: `${col + 1}`,
                gridRow: `${row + 1} / span ${span}`,
                background: color,
              }}
            />
          )
        })
      )}
    </div>
  )
}

function buildLegend(ws: Workspace, personas: Persona[]): Array<{ persona: Persona; count: number }> {
  const personaMap: Record<string, Persona> = {}
  for (const p of personas) personaMap[p.id] = p

  const counts: Record<string, number> = {}
  for (const cell of ws.cells) {
    if (cell.persona && cell.persona !== 'empty') {
      counts[cell.persona] = (counts[cell.persona] ?? 0) + 1
    }
  }

  return Object.entries(counts)
    .map(([id, count]) => ({ persona: personaMap[id], count }))
    .filter((e) => e.persona != null) as Array<{ persona: Persona; count: number }>
}

function buildSubtitle(ws: Workspace, personas: Persona[]): string {
  const personaMap: Record<string, Persona> = {}
  for (const p of personas) personaMap[p.id] = p

  const uniquePersonas = Array.from(
    new Set(ws.cells.map((c) => c.persona).filter((id) => id && id !== 'empty'))
  )
    .map((id) => personaMap[id]?.name ?? id)

  const slotCount = ws.cols * ws.rows
  return `${ws.cols}×${ws.rows} · ${slotCount} slots · ${uniquePersonas.join(', ')}`
}

export function WorkspacePopup({ visible, onClose, onApply, onOpenSettings }: WorkspacePopupProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Load data on mount
  useEffect(() => {
    const api = (window as any).cipherMux
    Promise.all([
      api.workspaces.list() as Promise<Workspace[]>,
      api.personas.list() as Promise<Persona[]>,
    ]).then(([wsList, pList]) => {
      setWorkspaces(wsList ?? [])
      setPersonas(pList ?? [])
      if (wsList?.length && selectedId === null) {
        setSelectedId(wsList[0].id)
      }
    }).catch((err: unknown) => {
      console.error('[WorkspacePopup] Failed to load data:', err)
    })

    // Load active workspace
    api.workspaces.active().then((id: string | null) => {
      setActiveId(id ?? null)
    }).catch(() => {})
  }, [visible]) // reload whenever popup becomes visible

  // Click outside to close
  const handleBackdropClick = useCallback(
    (e: MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('wp-backdrop')) {
        onClose()
      }
    },
    [onClose]
  )

  // Double-click applies
  const handleRowDoubleClick = useCallback(
    (id: string) => {
      setSelectedId(id)
      onApply(id)
    },
    [onApply]
  )

  const handleLoad = useCallback(() => {
    if (selectedId) onApply(selectedId)
  }, [selectedId, onApply])

  const selectedWorkspace = workspaces.find((w) => w.id === selectedId) ?? null
  const legend = selectedWorkspace ? buildLegend(selectedWorkspace, personas) : []

  if (!visible) return null

  return (
    <div class="wp-backdrop" onClick={handleBackdropClick} style={{ position: 'fixed', inset: 0, zIndex: 9 }}>
      <div class="workspaces-popup" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="wp-head">
          <span class="wp-title">Workspaces</span>
          <div class="wp-head-actions">
            <button onClick={onClose}>✕</button>
          </div>
        </div>

        {/* List */}
        <div class="wp-list">
          {workspaces.length === 0 && (
            <div style={{ padding: '16px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)' }}>
              No workspaces defined.
            </div>
          )}
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              class="wp-row"
              aria-current={selectedId === ws.id ? 'true' : 'false'}
              onClick={() => setSelectedId(ws.id)}
              onDblClick={() => handleRowDoubleClick(ws.id)}
            >
              <WorkspaceThumbnail ws={ws} personas={personas} />
              <div class="wp-meta">
                <div class="wp-name">{ws.name}</div>
                <div class="wp-sub">{buildSubtitle(ws, personas)}</div>
              </div>
              {activeId === ws.id && (
                <span class="wp-badge">active</span>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        {legend.length > 0 && (
          <div class="wp-legend">
            <span class="wp-legend-label">personas</span>
            {legend.map(({ persona, count }) => (
              <span key={persona.id} class="wp-legend-item">
                <span class="dot" style={{ background: persona.color }} />
                <span>{persona.name}</span>
                <span class="count">×{count}</span>
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div class="wp-foot">
          <button class="ghost" onClick={() => onOpenSettings('personas')}>personas...</button>
          <button class="ghost" onClick={() => onOpenSettings('workspaces')}>edit...</button>
          <button onClick={handleLoad} disabled={!selectedId}>load</button>
        </div>
      </div>
    </div>
  )
}
