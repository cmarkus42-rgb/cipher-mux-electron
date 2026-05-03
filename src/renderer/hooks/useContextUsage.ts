import { useState, useEffect, useRef } from 'preact/hooks'
import type { ContextUsage } from '../../shared/types'

const api = () => (window as any).cipherMux

export function useContextUsage() {
  const [usages, setUsages] = useState<Record<string, ContextUsage>>({})
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    // Load initial data
    api().context.all().then((data: Record<string, ContextUsage>) => {
      if (!mountedRef.current) return
      if (data) setUsages(data)
    })

    // Subscribe to updates
    const unsubUpdated = api().context.onUpdated(
      (payload: { sessionId: string; usage: ContextUsage }) => {
        setUsages((prev) => ({ ...prev, [payload.sessionId]: payload.usage }))
      }
    )

    // Subscribe to warnings
    const unsubWarning = api().context.onWarning(
      (payload: { sessionId: string; usage: ContextUsage }) => {
        // Could show a toast/notification in the future
        console.warn(`[Context] Session ${payload.sessionId} at ${payload.usage.usedPercentage}%`)
      }
    )

    // Clean up usage when session stops (resets bar to 0% for new sessions)
    const unsubStopped = api().sessions?.onStopped?.((session: { id: string }) => {
      setUsages((prev) => {
        const next = { ...prev }
        delete next[session.id]
        return next
      })
    })

    return () => { mountedRef.current = false; unsubUpdated(); unsubWarning(); unsubStopped?.() }
  }, [])

  return usages
}
