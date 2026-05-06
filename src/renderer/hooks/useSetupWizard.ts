// src/renderer/hooks/useSetupWizard.ts
import { useState, useEffect, useCallback } from 'preact/hooks'
import type { SetupDependency } from '../components/SetupWizard'

const api = (window as any).cipherMux

interface ProgressPayload {
  stepId: string | null
  message: string
  done: boolean
  error?: boolean
  dependencies?: SetupDependency[]
}

export function useSetupWizard() {
  const [dependencies, setDependencies] = useState<SetupDependency[]>([])
  const [installing, setInstalling] = useState(false)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState(false)
  const [visible, setVisible] = useState(false)

  // Initial check — load dependency status
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await api.setup.check()
        if (cancelled) return
        const deps: SetupDependency[] = result?.dependencies ?? []
        setDependencies(deps)
        // Show wizard only when at least one dependency is missing
        const hasMissing = deps.some((d: SetupDependency) => !d.installed)
        setVisible(hasMissing)
        if (!hasMissing) setDone(true)
      } catch {
        // If setup IPC not available, don't show wizard
        setVisible(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Listen for progress updates from main process
  useEffect(() => {
    if (!api?.setup?.onProgress) return
    const unsub = api.setup.onProgress((data: ProgressPayload) => {
      if (data.stepId !== undefined) setCurrentStep(data.stepId)
      if (data.message) setProgress(data.message)
      if (data.dependencies) setDependencies(data.dependencies)
      if (data.error) {
        setError(true)
        setInstalling(false)
        setCurrentStep(null)
      }
      if (data.done) {
        setDone(true)
        setInstalling(false)
        setCurrentStep(null)
      }
    })
    return unsub
  }, [])

  const installAll = useCallback(async (selectedIds?: string[]) => {
    setInstalling(true)
    setProgress('')
    setError(false)
    try {
      await api.setup.installAll(selectedIds ? { selectedIds } : undefined)
    } catch {
      setInstalling(false)
    }
  }, [])

  // Auto-close overlay 1.5s after done
  useEffect(() => {
    if (!done || !visible) return
    const timer = setTimeout(() => setVisible(false), 1500)
    return () => clearTimeout(timer)
  }, [done, visible])

  const skip = useCallback(() => {
    setVisible(false)
    api?.setup?.skip?.()
  }, [])

  return { dependencies, installing, currentStep, progress, done, error, visible, installAll, skip }
}
