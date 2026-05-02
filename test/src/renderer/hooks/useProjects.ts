import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { ProjectInfo } from '../../shared/types'

const api = (window as any).cipherMux

export interface UseProjectsResult {
  projects: ProjectInfo[]
  scanning: boolean
  rescan: () => Promise<void>
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const mountedRef = useRef(true)

  const rescan = useCallback(async () => {
    setScanning(true)
    try {
      const list = await api.projects.scan()
      if (mountedRef.current) {
        setProjects(list)
      }
    } catch (err) {
      console.error('[useProjects] scan failed:', err)
    } finally {
      if (mountedRef.current) {
        setScanning(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    rescan()
    return () => {
      mountedRef.current = false
    }
  }, [rescan])

  return { projects, scanning, rescan }
}
