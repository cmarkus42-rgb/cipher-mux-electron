import type { ActiveView, SessionInfo } from '../../shared/types'

interface ActivityRailProps {
  activeView: ActiveView
  sessions: SessionInfo[]
  chatroomVisible: boolean
  activeSessionId: string | null
  unreadCount?: number
  onViewChange: (view: ActiveView) => void
  onToggleChatroom: () => void
  onSessionSelect: (sessionId: string) => void
}

function RailItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: string
  label: string
  active: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <div
      class={`activity-rail__item ${active ? 'activity-rail__item--active' : ''}`}
      onClick={onClick}
      title={label}
    >
      {icon}
      {badge != null && badge > 0 && (
        <span class="activity-rail__badge">{badge}</span>
      )}
    </div>
  )
}

export function ActivityRail({
  activeView,
  sessions,
  chatroomVisible,
  activeSessionId,
  unreadCount,
  onViewChange,
  onToggleChatroom,
  onSessionSelect,
}: ActivityRailProps) {
  const activeSessions = sessions.filter((s) => s.status === 'active')

  return (
    <nav class="activity-rail">
      {/* Cockpit — always slot 0 */}
      <RailItem
        icon="◉"
        label="Cockpit"
        active={activeView === 'cockpit'}
        badge={activeSessions.length > 0 ? activeSessions.length : undefined}
        onClick={() => onViewChange('cockpit')}
      />

      {/* Session slots (1-9) */}
      {activeSessions.slice(0, 9).map((session, idx) => (
        <RailItem
          key={session.id}
          icon={String(idx + 1)}
          label={session.name}
          active={activeView === 'terminal' && activeSessionId === session.id}
          onClick={() => onSessionSelect(session.id)}
        />
      ))}

      <div class="activity-rail__spacer" />

      {/* Chat toggle */}
      <RailItem
        icon="&#x25A8;"
        label="Chatroom"
        active={chatroomVisible}
        badge={!chatroomVisible ? unreadCount : undefined}
        onClick={onToggleChatroom}
      />

      {/* Info */}
      <RailItem
        icon="i"
        label="Info"
        active={activeView === 'info'}
        onClick={() => onViewChange('info')}
      />
    </nav>
  )
}
