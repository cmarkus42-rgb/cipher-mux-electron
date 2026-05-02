import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { Message, SendMessage } from '../../shared/types'

const api = () => (window as any).cipherMux

/**
 * Hook for chatroom messages — loads history, subscribes to live updates,
 * provides send function and unread count.
 */
export function useMessages(limit = 100) {
  const [messages, setMessages] = useState<Message[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const mountedRef = useRef(true)

  // Load initial messages + unread count
  useEffect(() => {
    mountedRef.current = true

    api().messages.list({ limit }).then((msgs: Message[]) => {
      if (!mountedRef.current) return
      // API returns newest-first, we want oldest-first for chat display
      setMessages(msgs.reverse())
    })

    api().messages.unread().then((count: number) => {
      if (!mountedRef.current) return
      setUnreadCount(count)
    })

    return () => { mountedRef.current = false }
  }, [limit])

  // Subscribe to live message events
  useEffect(() => {
    const unsubscribe = api().messages.onReceived((msg: Message) => {
      setMessages((prev) => [...prev, msg])
      setUnreadCount((prev) => prev + 1)
    })
    return unsubscribe
  }, [])

  const send = useCallback(async (text: string) => {
    const msg: SendMessage = {
      topic: 'chat',
      sender: 'user',
      payload: { text },
    }
    await api().messages.send(msg)
  }, [])

  const markAllRead = useCallback(async () => {
    if (messages.length === 0) return
    const ids = messages.map((m) => m.id)
    await api().messages.markRead(ids)
    setUnreadCount(0)
  }, [messages])

  return { messages, unreadCount, send, markAllRead }
}
