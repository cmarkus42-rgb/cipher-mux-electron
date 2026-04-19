// src/renderer/components/ChatToggleButton.tsx

interface ChatToggleButtonProps {
  visible: boolean
  unreadCount: number
  onToggle: () => void
}

export function ChatToggleButton({ visible, unreadCount, onToggle }: ChatToggleButtonProps) {
  if (visible) return null // hide button when panel is open
  return (
    <button
      class={`chat-toggle-btn ${unreadCount > 0 ? 'chat-toggle-btn--unread' : ''}`}
      onClick={onToggle}
      title="message bus"
    >
      ✉
    </button>
  )
}
