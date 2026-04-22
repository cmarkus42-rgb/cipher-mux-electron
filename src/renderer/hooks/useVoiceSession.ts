/**
 * useVoiceSession — Preact hook for PTT voice input into focused sessions.
 *
 * Manages the push-to-talk lifecycle (Ctrl+Shift+Space), VAD initialization,
 * and toast state for transcription preview and dispatch feedback.
 */

import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { MicVADInstance } from '../voice/vad-loader'

const PTT_COMBO = { ctrlKey: true, shiftKey: true, code: 'Space' }

interface Toast {
  text: string
  type: 'transcription' | 'dispatched' | 'error'
}

export function useVoiceSession(focusedSessionId: string | null, focusedSessionName: string | null) {
  const [active, setActive] = useState(false)
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [voiceState, setVoiceState] = useState('idle')
  const [toast, setToast] = useState<Toast | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vadRef = useRef<MicVADInstance | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const showToast = useCallback((t: Toast) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])

  // Push focused session to main process whenever it changes
  useEffect(() => {
    if (!active) return
    const api = (window as any).cipherMux
    api.voice.setSessionTarget(focusedSessionId)
  }, [focusedSessionId, active])

  // Toggle voice session mode
  const toggle = useCallback(async () => {
    const api = (window as any).cipherMux
    if (active) {
      // Deactivate
      api.voice.setRoutingMode('off')
      if (vadRef.current) {
        vadRef.current.destroy()
        vadRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        streamRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      setActive(false)
      setRecording(false)
      setProcessing(false)
      setVoiceState('idle')
      return
    }

    // Activate
    try {
      const { available } = await api.voice.available()
      if (!available) {
        setError('Voice not available — native modules missing')
        return
      }
      const result = await api.voice.startSession()
      if (!result.ok) {
        setError(result.error ?? 'Failed to start voice session mode')
        return
      }

      // Get mic access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })
      streamRef.current = stream
      const audioCtx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = audioCtx

      // Initialize VAD
      const { initVAD } = await import('../voice/vad-loader')
      vadRef.current = await initVAD(stream, audioCtx, {
        onSpeechStart: () => api.voice.vadSpeechStart(),
        onSpeechEnd: (audio: Float32Array) => api.voice.vadSpeechEnd(Array.from(audio)),
        onVADMisfire: () => api.voice.vadMisfire(),
      })

      api.voice.setRoutingMode('session')
      api.voice.setSessionTarget(focusedSessionId)
      setActive(true)
      setVoiceState('ready')
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [active, focusedSessionId])

  // Listen for voice events from main
  useEffect(() => {
    if (!active) return

    const api = (window as any).cipherMux
    const unsubs: (() => void)[] = []

    unsubs.push(api.voice.onState((state: string) => {
      setVoiceState(state)
      setRecording(state === 'recording')
      setProcessing(state === 'processing')
    }))

    unsubs.push(api.voice.onTranscription((text: string) => {
      showToast({ text, type: 'transcription' })
    }))

    unsubs.push(api.voice.onDispatched((data: { sessionName: string; text: string }) => {
      showToast({ text: `Sent to ${data.sessionName}`, type: 'dispatched' })
    }))

    unsubs.push(api.voice.onError((msg: string) => {
      showToast({ text: msg, type: 'error' })
    }))

    return () => unsubs.forEach(fn => fn())
  }, [active, showToast])

  // PTT hotkey handler
  useEffect(() => {
    if (!active) return

    const api = (window as any).cipherMux
    let pttDown = false

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey === PTT_COMBO.ctrlKey && e.shiftKey === PTT_COMBO.shiftKey && e.code === PTT_COMBO.code) {
        e.preventDefault()
        if (!pttDown) {
          pttDown = true
          api.voice.vadSpeechStart()
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === PTT_COMBO.code && pttDown) {
        pttDown = false
        // Stop recording via the toggle mechanism
        api.voice.stop()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [active])

  return {
    active,
    recording,
    processing,
    voiceState,
    toast,
    error,
    toggle,
  }
}
