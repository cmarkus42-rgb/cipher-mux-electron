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

export function useVoiceSession(focusedSessionId: string | null, _focusedSessionName: string | null) {
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
      console.log('[VoiceSession] Deactivating voice session')
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
      ;(window as any).__cipherMuxSessionVoiceActive = false
      setRecording(false)
      setProcessing(false)
      setVoiceState('idle')
      return
    }

    // Activate
    try {
      console.log('[VoiceSession] Checking voice availability...')
      const availResult = await api.voice.available()
      console.log('[VoiceSession] voice.available() =>', availResult)
      if (!availResult.available) {
        const reason = availResult.reason ?? 'native modules missing'
        const msg = `Voice not available — ${reason}`
        console.log('[VoiceSession] BLOCKED:', msg, '(full reason:', reason, ')')
        setError(msg)
        return
      }

      console.log('[VoiceSession] Starting voice session mode...')
      const result = await api.voice.startSession()
      console.log('[VoiceSession] voice.startSession() =>', result)
      if (!result.ok) {
        setError(result.error ?? 'Failed to start voice session mode')
        return
      }

      // Get mic access
      console.log('[VoiceSession] Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })
      streamRef.current = stream
      console.log('[VoiceSession] Microphone access granted, tracks:', stream.getAudioTracks().length)

      const audioCtx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = audioCtx
      console.log('[VoiceSession] AudioContext created, sampleRate:', audioCtx.sampleRate)

      // Initialize VAD
      console.log('[VoiceSession] Initializing VAD...')
      const { initVAD } = await import('../voice/vad-loader')
      vadRef.current = await initVAD(stream, audioCtx, {
        onSpeechStart: () => {
          console.log('[VoiceSession] VAD: speech start detected')
          api.voice.vadSpeechStart()
        },
        onSpeechEnd: (audio: Float32Array) => {
          console.log('[VoiceSession] VAD: speech end, samples:', audio.length)
          api.voice.vadSpeechEnd(Array.from(audio))
        },
        onVADMisfire: () => {
          console.log('[VoiceSession] VAD: misfire')
          api.voice.vadMisfire()
        },
      })
      console.log('[VoiceSession] VAD initialized, starting...')
      vadRef.current.start()
      console.log('[VoiceSession] VAD started')

      // Target MUST be set before routing mode — otherwise first utterance
      // hits "No session focused" because the router has no target yet.
      api.voice.setSessionTarget(focusedSessionId)
      api.voice.setRoutingMode('session')
      setActive(true)
      ;(window as any).__cipherMuxSessionVoiceActive = true
      setVoiceState('ready')
      setError(null)
      console.log('[VoiceSession] Voice session ACTIVE, focusedSession:', focusedSessionId)
    } catch (err) {
      console.error('[VoiceSession] Activation error:', err)
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

  // PTT hotkey handler (Ctrl+Shift+Space)
  // In session mode, VAD handles speech detection automatically.
  // PTT serves as a manual override: keydown forces speech-start,
  // keyup is a no-op (VAD's onSpeechEnd delivers the audio).
  useEffect(() => {
    if (!active) return

    const api = (window as any).cipherMux
    let pttDown = false

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey === PTT_COMBO.ctrlKey && e.shiftKey === PTT_COMBO.shiftKey && e.code === PTT_COMBO.code) {
        e.preventDefault()
        if (!pttDown) {
          pttDown = true
          console.log('[VoiceSession] PTT keydown — sending vadSpeechStart')
          api.voice.vadSpeechStart()
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === PTT_COMBO.code && pttDown) {
        pttDown = false
        console.log('[VoiceSession] PTT keyup — VAD handles speech end automatically')
        // No action needed: VAD's onSpeechEnd callback delivers the audio
        // to the main process for STT processing.
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
