// src/renderer/components/SessionCell.tsx
import { useTranslation } from 'react-i18next'
import { useCallback } from 'preact/hooks'
import { useTerminal } from '../hooks/useTerminal'
import type { SessionInfo, ContextUsage, EntityId } from '../../shared/types'
import type { ThemeName } from '../../shared/grid-types'

/** Status icon next to session status dot (REQ-A11Y-002) */
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'active': return <span class="status-icon" aria-hidden="true" title="Aktiv">&#x2713;</span>
    case 'closing': return <span class="status-icon" aria-hidden="true" title="Wird beendet">&#x23F3;</span>
    case 'error': return <span class="status-icon" aria-hidden="true" title="Fehler">&#x2717;</span>
    case 'paused': return <span class="status-icon" aria-hidden="true" title="Pausiert">&#x23F8;</span>
    default: return null
  }
}

/** Voice status text label (REQ-A11Y-002) */
function VoiceStatusLabel({ voiceState, isSpeaking }: { voiceState: string; isSpeaking: boolean }) {
  if (isSpeaking) return <span class="voice-status-label">Spricht...</span>
  switch (voiceState) {
    case 'user_speaking':
    case 'recording': return <span class="voice-status-label">Hoert zu...</span>
    case 'processing': return <span class="voice-status-label">Verarbeitet...</span>
    default: return null
  }
}

interface SessionCellProps {
  session: SessionInfo
  contextUsage?: ContextUsage
  focused: boolean
  isOrchestrator: boolean
  isVoiceTarget: boolean
  isVoicePinned: boolean
  voiceState: string
  isSpeaking: boolean
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
  onFocusMode?: (sessionId: string) => void
  onDragStart: (sessionId: string) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
  dragOver?: boolean
}

export function SessionCell({
  session, contextUsage, focused, isOrchestrator, isVoiceTarget, isVoicePinned, voiceState, isSpeaking, onToggleVoicePin, theme,
  rowSpan, maxRows, slotCol, slotRow,
  onFocus, onClose, onSwitchProject, onToggleExpand, onShell, onFork, onSendToBackground, onFocusMode, onDragStart, onDragOver, onDragLeave, onDrop, dragOver,
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
  const handleFocusMode = useCallback((e: Event) => {
    e.stopPropagation()
    onFocusMode?.(session.id)
  }, [session.id, onFocusMode])

  // Fork only available for Claude Code sessions (have adapter capabilities)
  const isClaudeSession = session.capabilities?.['status-line'] === true

  const dotClass = pct >= 85 ? 'neon-dot--error' : pct >= 60 ? 'neon-dot--warn' : 'neon-dot--ok'
  const statusLabel = pct >= 85 ? 'Kritisch' : pct >= 60 ? 'Warnung' : 'OK'

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

  // Voice status indicator — only shown when this session is the voice target
  const voiceActive = isVoiceTarget && voiceState !== 'idle'
  const voiceDotClass = isSpeaking
    ? 'voice-dot voice-dot--speaking'
    : voiceState === 'user_speaking' || voiceState === 'recording'
      ? 'voice-dot voice-dot--listening'
      : voiceState === 'processing'
        ? 'voice-dot voice-dot--processing'
        : voiceState === 'ready'
          ? 'voice-dot voice-dot--idle'
          : ''

  const cellClass = [
    'session-cell',
    focused && 'session-cell--focused',
    (isOrchestrator || isEntity) && 'session-cell--orchestrator',
    dragOver && 'session-cell--drag-over',
  ].filter(Boolean).join(' ')

  const expanded = rowSpan > 1
  const cellStyle: Record<string, string | number> = {}
  if (expanded) cellStyle.gridRow = `span ${rowSpan}`

  // ARIA label for the grid cell (REQ-A11Y-007)
  const ariaLabel = `Session: ${session.name}, Status: ${session.status}, Context: ${pct}%`

  return (
    <div
      class={cellClass}
      style={cellStyle}
      onClick={handleClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-highlight={slotCol != null && slotRow != null ? `cell-${slotCol}-${slotRow}` : undefined}
      role="region"
      aria-label={ariaLabel}
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
            role="meter"
            aria-label={`Context-Nutzung: ${pct}%`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        )}
        <div class="cell-header__left">
          {entityColor
            ? <span class="neon-dot" style={{ background: entityColor, boxShadow: `0 0 4px ${entityColor}` }} aria-hidden="true" />
            : <span class={`neon-dot ${dotClass}`} aria-hidden="true" />}
          <StatusIcon status={session.status} />
          <span class="cell-name">{session.name}</span>
          {voiceActive && <span class={voiceDotClass} aria-hidden="true" />}
          {isVoiceTarget && voiceActive && (
            <VoiceStatusLabel voiceState={voiceState} isSpeaking={isSpeaking} />
          )}
          {isVoiceTarget && (
            <button
              class={`cell-btn voice-target-btn${isVoicePinned ? ' voice-target-btn--pinned' : ''}`}
              onClick={handleVoicePin}
              title={isVoicePinned ? t('sessionCell.unpinVoice') : t('sessionCell.pinVoice')}
              aria-label={isVoicePinned ? t('sessionCell.unpinVoice') : t('sessionCell.pinVoice')}
            >
              &#x25C9;
            </button>
          )}
        </div>
        <div class="cell-header__right">
          {onFocusMode && (
            <button
              class="cell-btn"
              onClick={handleFocusMode}
              title="Focus Mode (Cmd+Shift+F)"
              aria-label="Focus Mode aktivieren"
            >&#x26F6;</button>
          )}
          {maxRows > 1 && (
            <button
              class={`cell-btn ${expanded ? 'cell-btn--active' : ''}`}
              onClick={handleExpand}
              title={expanded ? t('sessionCell.collapseHeight') : t('sessionCell.expandHeight')}
              aria-label={expanded ? t('sessionCell.collapseHeight') : t('sessionCell.expandHeight')}
            >{expanded ? '↥' : '↧'}</button>
          )}
          {isClaudeSession && (
            <button class="cell-btn" onClick={handleFork} title={t('sessionCell.forkSession')} aria-label={t('sessionCell.forkSession')}>⑂</button>
          )}
          <button class="cell-btn" onClick={handleSwitch} title={t('sessionCell.switchProject')} aria-label={t('sessionCell.switchProject')}>⇄</button>
          <button class="cell-btn" onClick={handleSendToBackground} title={t('sessionCell.sendToBackground')} aria-label={t('sessionCell.sendToBackground')}>⏏</button>
          <button class="cell-btn" onClick={handleShell} title={t('sessionCell.openShell')} aria-label={t('sessionCell.openShell')}>$</button>
          <button class="cell-btn" onClick={handleClose} title={t('sessionCell.closeSession')} aria-label={t('sessionCell.closeSession')} disabled={session.status === 'closing'}>✕</button>
        </div>
      </div>
      <div class="cell-terminal" ref={terminalRef} role="application" aria-label={`Terminal: ${session.name}`} />
      {session.status === 'closing' && (
        <div class="cell-closing-overlay" role="status" aria-live="polite">
          <span class="workspace-loading-spinner" />
          <span>{t('sessionCell.closing', 'Session wird beendet...')}</span>
        </div>
      )}
    </div>
  )
}
