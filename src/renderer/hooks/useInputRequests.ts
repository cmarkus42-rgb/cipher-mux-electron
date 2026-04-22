import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { InputRequest, InputRequestUpdate } from '../../shared/types'

const api = () => (window as any).cipherMux

export function useInputRequests() {
  const [requests, setRequests] = useState<InputRequest[]>([])
  const mountedRef = useRef(true)

  // Load initial requests
  useEffect(() => {
    mountedRef.current = true
    api().inputRequests.get().then((data: { requests: InputRequest[] }) => {
      if (!mountedRef.current) return
      setRequests(data.requests ?? [])
    })
    return () => { mountedRef.current = false }
  }, [])

  // Subscribe to full refreshes
  useEffect(() => {
    return api().inputRequests.onChanged((data: { requests: InputRequest[] }) => {
      setRequests(data.requests ?? [])
    })
  }, [])

  // Subscribe to granular updates
  useEffect(() => {
    return api().inputRequests.onUpdate((update: InputRequestUpdate) => {
      setRequests((prev) => {
        switch (update.action) {
          case 'added':
            if (prev.some((r) => r.id === update.request.id)) return prev
            return [...prev, update.request]
          case 'updated':
            return prev.map((r) => r.id === update.request.id ? update.request : r)
          case 'removed':
            return prev.filter((r) => r.id !== update.request.id)
          default:
            return prev
        }
      })
    })
  }, [])

  const openCount = requests.filter((r) => r.status === 'open').length

  const answerRequest = useCallback(async (id: string, answer: string) => {
    await api().inputRequests.answer(id, answer)
    // Optimistic update
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: 'answered' as const, answer, answeredAt: new Date().toISOString() }
          : r
      )
    )
  }, [])

  const openReview = useCallback(async (filePath: string) => {
    await api().inputRequests.openReview(filePath)
  }, [])

  return { requests, openCount, answerRequest, openReview }
}
