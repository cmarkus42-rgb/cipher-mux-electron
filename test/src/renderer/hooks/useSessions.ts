import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { SessionInfo, StartSessionOpts } from '../../shared/types'

const api = (window as any).cipherMux

export interface UseSessionsResult {
  sessions: SessionInfo[]
  startSession: (opts: StartSessionOpts) => Promise<SessionInfo>
  stopSession: (sessionId: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const list = await api.sessions.list()
      if (mountedRef.current) {
        setSessions(list)
      }
    } catch (err) {
      console.error('[useSessions] refresh failed:', err)
    }
  }, [])

  const startSession = useCallback(async (opts: StartSessionOpts): Promise<SessionInfo> => {
    const session = await api.sessions.start(opts)
    await refresh()
    return session
  }, [refresh])

  const stopSession = useCallback(async (sessionId: string): Promise<void> => {
    await api.sessions.stop(sessionId)
    await refresh()
  }, [refresh])

  useEffect(() => {
    mountedRef.current = true
    refresh()

    const unsubChanged = api.sessions.onChanged(() => {
      refresh()
    })

    const unsubStopped = api.sessions.onStopped(() => {
      refresh()
    })

    return () => {
      mountedRef.current = false
      unsubChanged()
      unsubStopped()
    }
  }, [refresh])

  return { sessions, startSession, stopSession, refresh }
}
