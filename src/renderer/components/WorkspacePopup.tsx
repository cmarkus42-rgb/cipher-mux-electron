// src/renderer/components/WorkspacePopup.tsx
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { Workspace, Persona, WorkspaceCell } from '../../shared/persona-types'
import type { GridState } from '../../shared/grid-types'

interface WorkspacePopupProps {
  visible: boolean
  onClose: () => void
  onApply: (workspaceId: string) => void
  onOpenSettings: (tab: 'personas' | 'workspaces') => void
  currentGrid?: GridState
  sessions?: Array<{ id: string; name: string; projectPath?: string }>
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

export function WorkspacePopup({ visible, onClose, onApply, onOpenSettings, currentGrid, sessions: currentSessions }: WorkspacePopupProps) {
  const { t } = useTranslation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)

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

  const handleSaveCurrentOpen = useCallback(() => {
    const now = new Date()
    const defaultName = `Workspace ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    setSaveName(defaultName)
    setShowSaveDialog(true)
  }, [])

  const handleSaveCurrentConfirm = useCallback(async () => {
    if (!currentGrid || !saveName.trim()) return
    setSaving(true)
    try {
      const api = (window as any).cipherMux
      const sessionMap: Record<string, { name: string; projectPath?: string }> = {}
      for (const s of currentSessions ?? []) {
        sessionMap[s.id] = s
      }

      const cells: WorkspaceCell[] = currentGrid.slots.map(slot => {
        const session = slot.sessionId ? sessionMap[slot.sessionId] : undefined
        return {
          persona: 'empty',
          project: session?.projectPath ?? '',
          prompt: '',
          type: slot.type,
        }
      })

      const ws: Workspace = {
        id: `ws-${Date.now()}`,
        name: saveName.trim(),
        cols: currentGrid.config.cols,
        rows: currentGrid.config.rows,
        cells,
        merges: {},
        promptOverrides: {},
      }

      await api.workspaces.save(ws)
      // Reload list
      const wsList = await api.workspaces.list() as Workspace[]
      setWorkspaces(wsList ?? [])
      setSelectedId(ws.id)
      setShowSaveDialog(false)
    } catch (err) {
      console.error('[WorkspacePopup] save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [currentGrid, currentSessions, saveName])

  const selectedWorkspace = workspaces.find((w) => w.id === selectedId) ?? null
  const legend = selectedWorkspace ? buildLegend(selectedWorkspace, personas) : []

  if (!visible) return null

  return (
    <div class="wp-backdrop" onClick={handleBackdropClick} style={{ position: 'fixed', inset: 0, zIndex: 9 }}>
      <div class="workspaces-popup" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="wp-head">
          <span class="wp-title">{t('workspacePopup.title')}</span>
          <div class="wp-head-actions">
            <button onClick={onClose}>✕</button>
          </div>
        </div>

        {/* List */}
        <div class="wp-list">
          {workspaces.length === 0 && (
            <div style={{ padding: '16px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)' }}>
              {t('workspacePopup.noWorkspaces')}
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
                <span class="wp-badge">{t('workspacePopup.active')}</span>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        {legend.length > 0 && (
          <div class="wp-legend">
            <span class="wp-legend-label">{t('workspacePopup.personas')}</span>
            {legend.map(({ persona, count }) => (
              <span key={persona.id} class="wp-legend-item">
                <span class="dot" style={{ background: persona.color }} />
                <span>{persona.name}</span>
                <span class="count">×{count}</span>
              </span>
            ))}
          </div>
        )}

        {/* Save Dialog */}
        {showSaveDialog && (
          <div class="wp-save-overlay">
            <div class="wp-save-dialog">
              <div class="wp-save-dialog__title">{t('workspacePopup.saveTitle')}</div>
              <input
                class="input input--sm"
                type="text"
                value={saveName}
                onInput={(e) => setSaveName((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCurrentConfirm() }}
                placeholder={t('workspacePopup.saveNamePlaceholder')}
                autoFocus
                style={{ width: '100%', marginBottom: '8px' }}
              />
              <div class="wp-save-dialog__info">
                {currentGrid ? `${currentGrid.config.cols}×${currentGrid.config.rows} · ${currentGrid.slots.filter(s => s.sessionId).length} ${t('workspacePopup.activeSessions')}` : ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '8px' }}>
                <button class="ghost" onClick={() => setShowSaveDialog(false)}>{t('bugreport.cancel')}</button>
                <button onClick={handleSaveCurrentConfirm} disabled={saving || !saveName.trim()}>
                  {saving ? t('workspacesTab.saved') : t('workspacePopup.save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div class="wp-foot">
          <button class="ghost" onClick={handleSaveCurrentOpen} disabled={!currentGrid}>{t('workspacePopup.saveCurrent')}</button>
          <button class="ghost" onClick={() => onOpenSettings('personas')}>{t('workspacePopup.personasBtn')}</button>
          <button class="ghost" onClick={() => onOpenSettings('workspaces')}>{t('workspacePopup.editBtn')}</button>
          <button onClick={handleLoad} disabled={!selectedId}>{t('workspacePopup.load')}</button>
        </div>
      </div>
    </div>
  )
}
