// src/renderer/components/HighlightOverlay.tsx
// Renders highlight overlays on data-highlight elements, driven by IPC from MCP tools.

import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { IPC } from '../../shared/ipc-channels'

interface ActiveHighlight {
  id: string
  target: string
  style: 'glow' | 'outline'
  rect: DOMRect | null
}

const api = () => (window as any).cipherMux

export function HighlightOverlay() {
  const [highlights, setHighlights] = useState<ActiveHighlight[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const clearAll = useCallback(() => {
    for (const timer of timersRef.current.values()) clearTimeout(timer)
    timersRef.current.clear()
    setHighlights([])
  }, [])

  const addHighlight = useCallback((target: string, duration: number, style: 'glow' | 'outline') => {
    const el = document.querySelector(`[data-highlight="${target}"]`)
    if (!el) return false

    const rect = el.getBoundingClientRect()
    const id = `hl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    setHighlights(prev => [...prev.filter(h => h.target !== target), { id, target, style, rect }])

    if (duration > 0) {
      const timer = setTimeout(() => {
        setHighlights(prev => prev.filter(h => h.id !== id))
        timersRef.current.delete(id)
      }, duration)
      timersRef.current.set(id, timer)
    }

    return true
  }, [])

  // Listen for IPC highlight events
  useEffect(() => {
    const a = api()
    if (!a?.ui?.onHighlight) return
    const unsub = a.ui.onHighlight((data: { target?: string; duration?: number; style?: string; clear?: boolean }) => {
      if (data.clear) {
        clearAll()
        return
      }
      if (data.target) {
        addHighlight(data.target, data.duration ?? 3000, (data.style as 'glow' | 'outline') ?? 'glow')
      }
    })
    return () => unsub()
  }, [addHighlight, clearAll])


  // Reposition on resize/scroll
  useEffect(() => {
    if (highlights.length === 0) return

    const reposition = () => {
      setHighlights(prev => prev.map(h => {
        const el = document.querySelector(`[data-highlight="${h.target}"]`)
        return el ? { ...h, rect: el.getBoundingClientRect() } : h
      }))
    }

    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [highlights.length > 0])

  if (highlights.length === 0) return null

  return (
    <>
      {highlights.map(h => {
        if (!h.rect) return null
        return (
          <div
            key={h.id}
            class={`highlight-overlay highlight-overlay--${h.style}`}
            style={{
              top: `${h.rect.top}px`,
              left: `${h.rect.left}px`,
              width: `${h.rect.width}px`,
              height: `${h.rect.height}px`,
            }}
          />
        )
      })}
    </>
  )
}
