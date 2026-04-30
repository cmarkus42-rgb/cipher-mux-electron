/**
 * useVoiceSession — Preact hook for 3-state voice mode: OFF / STT / COM.
 *
 * OFF: No voice active.
 * STT: VAD + Whisper → keystrokes to focused session (existing behavior).
 * COM: Voice-relay entity as background session, STT→relay, relay→TTS.
 */

import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { MicVADInstance } from '../voice/vad-loader'

export type VoiceMode = 'off' | 'stt' | 'com'

const PTT_COMBO = { ctrlKey: true, shiftKey: true, code: 'Space' }

interface Toast {
  text: string
  type: 'transcription' | 'dispatched' | 'error'
}

export function useVoiceSession(focusedSessionId: string | null, _focusedSessionName: string | null) {
  const [mode, setMode] = useState<VoiceMode>('off')
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [voiceState, setVoiceState] = useState('idle')
  const [comState, setComState] = useState('idle')
  const [toast, setToast] = useState<Toast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pinned, setPinned] = useState(false)
  const [pinnedSessionId, setPinnedSessionId] = useState<string | null>(null)
  const [activeVoiceSessionId, setActiveVoiceSessionId] = useState<string | null>(null)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vadRef = useRef<MicVADInstance | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Derived: active means STT or COM
  const active = mode !== 'off'

  const showToast = useCallback((t: Toast) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])

  // Push focused session to main process whenever it changes (STT mode only)
  useEffect(() => {
    if (mode !== 'stt') return
    const api = (window as any).cipherMux
    api.voice.setSessionTarget(focusedSessionId)
  }, [focusedSessionId, mode])

  /** Teardown VAD + mic stream + AudioContext */
  const teardownVAD = useCallback(() => {
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
  }, [])

  /** Initialize VAD + mic stream for STT pipeline */
  const initVAD = useCallback(async () => {
    const api = (window as any).cipherMux

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
    })
    streamRef.current = stream

    const audioCtx = new AudioContext({ sampleRate: 16000 })
    audioCtxRef.current = audioCtx

    const { initVAD: loadVAD } = await import('../voice/vad-loader')
    vadRef.current = await loadVAD(stream, audioCtx, {
      onSpeechStart: () => {
        api.voice.vadSpeechStart()
      },
      onSpeechEnd: (audio: Float32Array) => {
        api.voice.vadSpeechEnd(Array.from(audio))
      },
      onVADMisfire: () => {
        api.voice.vadMisfire()
      },
    })
    vadRef.current.start()
  }, [])

  /** Switch to a new voice mode */
  const switchMode = useCallback(async (newMode: VoiceMode) => {
    if (newMode === mode) return
    const api = (window as any).cipherMux

    // Deactivate current mode
    if (mode === 'stt') {
      api.voice.setRoutingMode('off')
      teardownVAD()
      setRecording(false)
      setProcessing(false)
      setVoiceState('idle')
      setPinned(false)
      setPinnedSessionId(null)
      ;(window as any).__cipherMuxSessionVoiceActive = false
    } else if (mode === 'com') {
      teardownVAD()
      try { await api.voice.stopCom() } catch { /* ignore */ }
      setRecording(false)
      setProcessing(false)
      setVoiceState('idle')
      setComState('idle')
      ;(window as any).__cipherMuxSessionVoiceActive = false
    }

    if (newMode === 'off') {
      setMode('off')
      setError(null)
      return
    }

    // Activate new mode
    try {
      const availResult = await api.voice.available()
      if (!availResult.available) {
        const reason = availResult.reason ?? 'native modules missing'
        setError(`Voice not available — ${reason}`)
        setMode('off')
        return
      }

      if (newMode === 'stt') {
        const result = await api.voice.startSession()
        if (!result.ok) {
          setError(result.error ?? 'Failed to start STT mode')
          setMode('off')
          return
        }
        await initVAD()
        api.voice.setSessionTarget(focusedSessionId)
        api.voice.setRoutingMode('session')
        setMode('stt')
        ;(window as any).__cipherMuxSessionVoiceActive = true
        setVoiceState('ready')
        setError(null)
      } else if (newMode === 'com') {
        const result = await api.voice.startCom()
        if (!result.ok) {
          setError(result.error ?? 'Failed to start COM mode')
          setMode('off')
          return
        }
        await initVAD()
        setMode('com')
        ;(window as any).__cipherMuxSessionVoiceActive = true
        setVoiceState('ready')
        setError(null)
      }
    } catch (err) {
      console.error('[VoiceSession] Activation error:', err)
      setError((err as Error).message)
      setMode('off')
    }
  }, [mode, focusedSessionId, teardownVAD, initVAD])

  // Legacy toggle for backwards compat (toggles STT)
  const toggle = useCallback(async () => {
    await switchMode(mode === 'off' ? 'stt' : 'off')
  }, [mode, switchMode])

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

    unsubs.push(api.voice.onComState((state: string) => {
      setComState(state)
    }))

    if (api.voice.onPinStatus) {
      unsubs.push(api.voice.onPinStatus((data: { pinned: boolean; sessionId: string | null }) => {
        setPinned(data.pinned)
        setPinnedSessionId(data.sessionId)
      }))
    }

    if (api.voice.onActiveSession) {
      unsubs.push(api.voice.onActiveSession((data: { sessionId: string | null }) => {
        setActiveVoiceSessionId(data.sessionId)
      }))
    }

    return () => unsubs.forEach(fn => fn())
  }, [active, showToast])

  // PTT hotkey handler (Ctrl+Shift+Space)
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
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [active])

  const togglePin = useCallback((sessionId: string) => {
    const api = (window as any).cipherMux
    api.voice.pinSession?.(sessionId)
  }, [])

  return {
    mode,
    active,
    recording,
    processing,
    voiceState,
    comState,
    toast,
    error,
    toggle,
    switchMode,
    pinned,
    pinnedSessionId,
    activeVoiceSessionId,
    togglePin,
  }
}
