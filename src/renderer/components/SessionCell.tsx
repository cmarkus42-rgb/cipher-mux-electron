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
  isVoiceTarget: boolean
  isVoicePinned: boolean
  onToggleVoicePin: (sessionId: string) => void
  theme: ThemeName
  rowSpan: number
  maxRows: number
  slotCol?: number
  slotRow?: number
  onFocus: (sessionId: string) => void
  onClose: (sessionId: string) => void
  onSwitchProject: (sessionId: string) => void
  onToggleExpand: (sessionId: string) => void
  onShell: (sessionId: string, projectPath: string | null) => void
  onFork: (sessionId: string) => void
  onSendToBackground: (sessionId: string) => void
  onDragStart: (sessionId: string) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
  dragOver?: boolean
}

export function SessionCell({
  session, contextUsage, focused, isOrchestrator, isVoiceTarget, isVoicePinned, onToggleVoicePin, theme,
  rowSpan, maxRows, slotCol, slotRow,
  onFocus, onClose, onSwitchProject, onToggleExpand, onShell, onFork, onSendToBackground, onDragStart, onDragOver, onDragLeave, onDrop, dragOver,
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
  const handleVoicePin = useCallback((e: Event) => {
    e.stopPropagation()
    onToggleVoicePin(session.id)
  }, [session.id, onToggleVoicePin])

  // Fork only available for Claude Code sessions (have adapter capabilities)
  const isClaudeSession = session.capabilities?.['status-line'] === true

  const dotClass = pct >= 85 ? 'neon-dot--error' : pct >= 60 ? 'neon-dot--warn' : 'neon-dot--ok'

  // Context bar: color based on breakpoints, width scaled so 65% displayed = full bar
  const barWidth = Math.min((pct / 65) * 100, 100)
  const barColor = pct >= 56 ? '#e53935' : pct >= 41 ? '#fb8c00' : pct >= 26 ? '#fdd835' : '#43a047'

  // Entity color mapping — matches EntityConfig.color values
  const ENTITY_COLORS: Record<EntityId, string> = {
    orchestrator: '#4fc3f7',
    'cyber-factory': '#ab47bc',
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
    dragOver && 'session-cell--drag-over',
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
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-highlight={slotCol != null && slotRow != null ? `cell-${slotCol}-${slotRow}` : undefined}
    >
      <div
        class="cell-header"
        draggable
        onDragStart={() => onDragStart(session.id)}
        style={entityColor ? { borderLeft: `3px solid ${entityColor}` } : undefined}
        data-highlight={slotCol != null && slotRow != null ? `cell-head-${slotCol}-${slotRow}` : undefined}
      >
        {pct > 0 && (
          <div
            class="cell-header__ctx-bar"
            style={{ width: `${barWidth}%`, backgroundColor: barColor }}
          />
        )}
        <div class="cell-header__left">
          {entityColor
            ? <span class="neon-dot" style={{ background: entityColor, boxShadow: `0 0 4px ${entityColor}` }} />
            : <span class={`neon-dot ${dotClass}`} />}
          <span class="cell-name">{session.name}</span>
          {isVoiceTarget && (
            <button
              class={`cell-btn voice-target-btn${isVoicePinned ? ' voice-target-btn--pinned' : ''}`}
              onClick={handleVoicePin}
              title={isVoicePinned ? t('sessionCell.unpinVoice') : t('sessionCell.pinVoice')}
            >
              &#x25C9;
            </button>
          )}
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
          <button class="cell-btn" onClick={handleSwitch} title={t('sessionCell.switchProject')}>⇄</button>
          <button class="cell-btn" onClick={handleSendToBackground} title={t('sessionCell.sendToBackground')}>⏏</button>
          <button class="cell-btn" onClick={handleShell} title={t('sessionCell.openShell')}>$</button>
          <button class="cell-btn" onClick={handleClose} title={t('sessionCell.closeSession')} disabled={session.status === 'closing'}>✕</button>
        </div>
      </div>
      <div class="cell-terminal" ref={terminalRef} />
      {session.status === 'closing' && (
        <div class="cell-closing-overlay">
          <span class="workspace-loading-spinner" />
          <span>{t('sessionCell.closing', 'Session wird beendet...')}</span>
        </div>
      )}
    </div>
  )
}
