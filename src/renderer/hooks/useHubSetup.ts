// src/renderer/hooks/useHubSetup.ts
import { useState, useEffect, useCallback } from 'preact/hooks'

const api = (window as any).cipherMux

export function useHubSetup() {
  const [needsSetup, setNeedsSetup] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const hubPath = await api.hub.getPath()
        if (cancelled) return
        setNeedsSetup(!hubPath)
      } catch {
        // If hub IPC not available yet, don't block
        if (!cancelled) setNeedsSetup(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const completeSetup = useCallback(async (path: string) => {
    await api.hub.setup(path)
    setNeedsSetup(false)
  }, [])

  return { needsSetup, loading, completeSetup }
}
