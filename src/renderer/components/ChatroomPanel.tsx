import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import type { Message } from '../../shared/types'
import { useMessages } from '../hooks/useMessages'

interface ChatroomPanelProps {
  visible: boolean
}

export function ChatroomPanel({ visible }: ChatroomPanelProps) {
  const { messages, unreadCount, send, markAllRead } = useMessages()
  const [input, setInput] = useState('')
  const feedRef = useRef<HTMLDivElement>(null!)
  const inputRef = useRef<HTMLInputElement>(null!)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = feedRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  // Mark as read when panel becomes visible
  useEffect(() => {
    if (visible && unreadCount > 0) {
      markAllRead()
    }
  }, [visible, unreadCount, markAllRead])

  // Focus input when panel opens
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus()
    }
  }, [visible])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    await send(text)
  }, [input, send])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <aside class={`chatroom-panel ${visible ? 'chatroom-panel--open' : ''}`}>
      <div class="chatroom-panel__header">
        <span>Chatroom</span>
        {unreadCount > 0 && (
          <span class="badge badge--info">{unreadCount}</span>
        )}
      </div>

      <div class="chatroom-panel__messages" ref={feedRef}>
        {messages.length === 0 ? (
          <div class="empty-state" style={{ height: 'auto', padding: '32px 16px' }}>
            <div class="empty-state__text">No messages yet</div>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))
        )}
      </div>

      <div class="chatroom-panel__input">
        <input
          ref={inputRef}
          type="text"
          placeholder="Message..."
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </aside>
  )
}

function ChatMessage({ message }: { message: Message }) {
  const isSystem = message.topic === 'system' || message.sender === 'system'
  const isOrchestrator = message.sender === 'Orchestrator'
  const text = (message.payload as any)?.text ?? JSON.stringify(message.payload)
  const time = formatTime(message.createdAt)

  const cls = [
    'chat-message',
    isSystem ? 'chat-message--system' : '',
    isOrchestrator ? 'chat-message--orchestrator' : '',
  ].filter(Boolean).join(' ')

  return (
    <div class={cls}>
      <div class="chat-message__header">
        <span class="chat-message__sender">{message.sender}</span>
        <span class="chat-message__time">{time}</span>
      </div>
      <div class="chat-message__text">{text}</div>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}
