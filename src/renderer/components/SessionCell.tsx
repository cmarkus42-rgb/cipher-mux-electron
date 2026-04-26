// src/renderer/components/SessionCell.tsx
import { useTranslation } from 'react-i18next'
import { useCallback } from 'preact/hooks'
import { useTerminal } from '../hooks/useTerminal'
import type { SessionInfo, ContextUsage, EntityId } from '../../shared/types'
import type { ThemeName } from '../../shared/grid-types'

interface SessionCellProps {
  session: SessionInfo
  contextUsage?: ContextUsage
  focused: boolean
  isOrchestrator: boolean
  theme: ThemeName
  rowSpan: number
  maxRows: number
  onFocus: (sessionId: string) => void
  onClose: (sessionId: string) => void
  onSwitchProject: (sessionId: string) => void
  onToggleExpand: (sessionId: string) => void
  onShell: (sessionId: string, projectPath: string | null) => void
  onFork: (sessionId: string) => void
  onSendToBackground: (sessionId: string) => void
  onDragStart: (sessionId: string) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function SessionCell({
  session, contextUsage, focused, isOrchestrator, theme,
  rowSpan, maxRows,
  onFocus, onClose, onSwitchProject, onToggleExpand, onShell, onFork, onSendToBackground, onDragStart, onDragOver, onDrop,
}: SessionCellProps) {
  const { t } = useTranslation()
  const { terminalRef } = useTerminal(session.id, theme, session.createdAt)
  const pct = contextUsage?.usedPercentage ?? 0

  const handleClick = useCallback(() => onFocus(session.id), [session.id, onFocus])
  const handleClose = useCallback((e: Event) => {
    e.stopPropagation()
    onClose(session.id)
  }, [session.id, onClose])
  const handleSwitch = useCallback((e: Event) => {
    e.stopPropagation()
    onSwitchProject(session.id)
  }, [session.id, onSwitchProject])
  const handleExpand = useCallback((e: Event) => {
    e.stopPropagation()
    onToggleExpand(session.id)
  }, [session.id, onToggleExpand])
  const handleShell = useCallback((e: Event) => {
    e.stopPropagation()
    onShell(session.id, session.projectPath)
  }, [session.id, session.projectPath, onShell])
  const handleFork = useCallback((e: Event) => {
    e.stopPropagation()
    onFork(session.id)
  }, [session.id, onFork])
  const handleSendToBackground = useCallback((e: Event) => {
    e.stopPropagation()
    onSendToBackground(session.id)
  }, [session.id, onSendToBackground])

  // Fork only available for Claude Code sessions (have adapter capabilities)
  const isClaudeSession = session.capabilities?.['status-line'] === true

  const ctxClass = pct >= 85 ? 'ctx-error' : pct >= 60 ? 'ctx-warn' : 'ctx-ok'
  const dotClass = pct >= 85 ? 'neon-dot--error' : pct >= 60 ? 'neon-dot--warn' : 'neon-dot--ok'

  // Entity color mapping — matches EntityConfig.color values
  const ENTITY_COLORS: Record<EntityId, string> = {
    orchestrator: '#4fc3f7',
    mpo: '#ab47bc',
    companion: '#ffb74d',
    refinement: '#ef5350',
    launcher: '#66bb6a',
    'voice-relay': '#9b59b6',
    audit: '#c0392b',
  }
  const entityColor = session.entityId ? ENTITY_COLORS[session.entityId] : undefined
  const isEntity = !!session.entityId

  const cellClass = [
    'session-cell',
    focused && 'session-cell--focused',
    (isOrchestrator || isEntity) && 'session-cell--orchestrator',
  ].filter(Boolean).join(' ')

  const expanded = rowSpan > 1
  const cellStyle: Record<string, string | number> = {}
  if (expanded) cellStyle.gridRow = `span ${rowSpan}`

  return (
    <div
      class={cellClass}
      style={cellStyle}
      onClick={handleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        class="cell-header"
        draggable
        onDragStart={() => onDragStart(session.id)}
        style={entityColor ? { borderLeft: `3px solid ${entityColor}` } : undefined}
      >
        <div class="cell-header__left">
          {entityColor
            ? <span class="neon-dot" style={{ background: entityColor, boxShadow: `0 0 4px ${entityColor}` }} />
            : <span class={`neon-dot ${dotClass}`} />}
          <span class="cell-name">{session.name}</span>
          <span class="cell-sep">·</span>
          <span class={`cell-ctx ${ctxClass}`}>{pct}%</span>
        </div>
        <div class="cell-header__right">
          {maxRows > 1 && (
            <button
              class={`cell-btn ${expanded ? 'cell-btn--active' : ''}`}
              onClick={handleExpand}
              title={expanded ? t('sessionCell.collapseHeight') : t('sessionCell.expandHeight')}
            >{expanded ? '↥' : '↧'}</button>
          )}
          {isClaudeSession && (
            <button class="cell-btn" onClick={handleFork} title={t('sessionCell.forkSession')}>⑂</button>
          )}
          {!isOrchestrator && (
            <button class="cell-btn" onClick={handleSwitch} title={t('sessionCell.switchProject')}>⇄</button>
          )}
          <button class="cell-btn" onClick={handleSendToBackground} title={t('sessionCell.sendToBackground')}>⏏</button>
          <button class="cell-btn" onClick={handleShell} title={t('sessionCell.openShell')}>$</button>
          <button class="cell-btn" onClick={handleClose} title={t('sessionCell.closeSession')}>✕</button>
        </div>
      </div>
      <div class="cell-terminal" ref={terminalRef} />
    </div>
  )
}
