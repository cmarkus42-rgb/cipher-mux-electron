// src/renderer/components/DetachedSessionView.tsx

import { h } from 'preact'
import { useState, useEffect, useCallback } from 'preact/hooks'
import { useTerminal } from '../hooks/useTerminal'
import { useTheme } from '../hooks/useTheme'
import type { SessionInfo } from '../../shared/types'

interface DetachedSessionViewProps {
  sessionId: string
}

export function DetachedSessionView({ sessionId }: DetachedSessionViewProps) {
  const { theme } = useTheme()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { terminalRef } = useTerminal(sessionId, theme, session?.createdAt)

  // Fetch initial session info
  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.sessions?.list) {
      setError('API not available')
      return
    }
    api.sessions.list().then((list: SessionInfo[]) => {
      const found = list.find((s: SessionInfo) => s.id === sessionId)
      if (found) {
        setSession(found)
      } else {
        setError(`Session "${sessionId}" not found`)
      }
    }).catch((err: Error) => {
      setError(err.message)
    })

    // Listen for session changes (rename, etc.)
    const unsub = api.sessions.onChanged((data: any) => {
      if (data?.id === sessionId) {
        setSession((prev: SessionInfo | null) => prev ? { ...prev, ...data } : data)
      }
    })
    return unsub
  }, [sessionId])

  // Dynamic window title
  useEffect(() => {
    document.title = session?.name ?? sessionId
  }, [session?.name, sessionId])

  const handleDock = useCallback(() => {
    const api = (window as any).cipherMux
    api?.detach?.dock?.(sessionId)
  }, [sessionId])

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg)', fontFamily: 'monospace' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Session unavailable</div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Minimal titlebar with drag region and dock button */}
      <div class="drag-region" style={{
        height: 28,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
      }}>
        <span style={{ fontSize: 11, opacity: 0.5, color: 'var(--fg)', pointerEvents: 'none' }}>
          {session?.name ?? sessionId}
        </span>
        <button
          onClick={handleDock}
          title="Dock back to grid"
          style={{
            background: 'none',
            border: '1px solid var(--border, #555)',
            borderRadius: 3,
            color: 'var(--fg)',
            fontSize: 10,
            padding: '1px 6px',
            cursor: 'pointer',
            opacity: 0.6,
            WebkitAppRegion: 'no-drag',
          }}
        >
          Dock
        </button>
      </div>

      {/* Terminal fills remaining space */}
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
