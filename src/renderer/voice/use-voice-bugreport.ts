import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { initVAD, type MicVADInstance } from './vad-loader'

/** Typed accessor for the preload-injected API bridge. */
const api = () => (window as any).cipherMux

/** Voice interview lifecycle states (mirrors VoiceState + UI-only states). */
export type VoiceBugreportState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'recording'
  | 'user_speaking'
  | 'processing'
  | 'agent_speaking'
  | 'complete'
  | 'error'

/** A single turn in the voice interview conversation. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Preact hook managing the voice bugreport interview lifecycle.
 *
 * Handles microphone access, VAD initialization, IPC event wiring,
 * and audio playback queue. Returns reactive state for the UI.
 */
export function useVoiceBugreport() {
  const [voiceState, setVoiceState] = useState<VoiceBugreportState>('idle')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const vadRef = useRef<MicVADInstance | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioQueueRef = useRef<string[]>([])
  const playingRef = useRef(false)
  /** Whether session voice was active before bugreport took over */
  const sessionVoiceWasActiveRef = useRef(false)

  // ── Audio playback queue: drains base64 WAV chunks sequentially ──

  const playNextAudio = useCallback(() => {
    const queue = audioQueueRef.current
    if (queue.length === 0) {
      playingRef.current = false
      api().voice.playbackDone()
      return
    }

    playingRef.current = true
    const base64Wav = queue.shift()!
    const audio = new Audio(`data:audio/wav;base64,${base64Wav}`)
    audio.onended = () => playNextAudio()
    audio.onerror = () => playNextAudio()
    audio.play().catch(() => playNextAudio())
  }, [])

  // ── IPC event listeners: wire main-process voice events to React state ──

  useEffect(() => {
    const voice = api()?.voice
    if (!voice) return

    const cleanups: Array<() => void> = []

    try {
      cleanups.push(voice.onState((state: string) => {
        setVoiceState(state as VoiceBugreportState)
      }))
      cleanups.push(voice.onTranscription((text: string) => {
        setTurns((prev) => [...prev, { role: 'user', text }])
      }))
      cleanups.push(voice.onAgentText((text: string) => {
        setTurns((prev) => [...prev, { role: 'assistant', text }])
      }))
      cleanups.push(voice.onAgentAudio((base64Wav: string) => {
        audioQueueRef.current.push(base64Wav)
        if (!playingRef.current) playNextAudio()
      }))
      cleanups.push(voice.onInterviewDone((reportText: string) => {
        setReport(reportText)
        setVoiceState('complete')
      }))
      cleanups.push(voice.onError((msg: string) => {
        setError(msg)
        setVoiceState('error')
      }))
      cleanups.push(voice.onStopPlayback(() => {
        audioQueueRef.current = []
        playingRef.current = false
      }))
      cleanups.push(voice.onGenerationDone(() => {
        if (!playingRef.current && audioQueueRef.current.length === 0) {
          api().voice.playbackDone()
        }
      }))
    } catch (err) {
      console.warn('[useVoiceBugreport] Failed to register listeners:', err)
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [playNextAudio])

  // ── Start voice interview: mic access -> main-process init -> VAD ──

  const startVoiceInterview = useCallback(async () => {
    try {
      setVoiceState('initializing')
      setTurns([])
      setReport(null)
      setError(null)
      audioQueueRef.current = []
      playingRef.current = false

      // Suspend session voice mode if it's active — bugreport takes over the pipeline.
      // Check the global flag set by useVoiceSession when session voice is active.
      const w = window as any
      const sessionVoiceActive = !!w.__cipherMuxSessionVoiceActive
      if (sessionVoiceActive) {
        console.log('[VoiceBugreport] Suspending session voice mode')
        api().voice.setRoutingMode('off')
      }
      sessionVoiceWasActiveRef.current = sessionVoiceActive

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx

      const result = await api().voice.start()
      if (result && !result.ok) {
        setError(result.error || 'Voice-Interview fehlgeschlagen')
        setVoiceState('error')
        return
      }

      const vad = await initVAD(stream, audioCtx, {
        onSpeechStart: () => {
          api().voice.vadSpeechStart()
        },
        onSpeechEnd: (audio: Float32Array) => {
          api().voice.vadSpeechEnd(Array.from(audio))
        },
        onVADMisfire: () => {
          api().voice.vadMisfire()
        },
      })

      vadRef.current = vad
      vad.start()
      setVoiceState('ready')
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize voice interview')
      setVoiceState('error')
    }
  }, [])

  // ── Stop voice interview: destroy VAD, close mic, reset state ──

  const stopVoiceInterview = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.destroy()
      vadRef.current = null
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    audioQueueRef.current = []
    playingRef.current = false

    // Restore session voice mode if it was active before bugreport
    if (sessionVoiceWasActiveRef.current) {
      console.log('[VoiceBugreport] Restoring session voice mode')
      api().voice.setRoutingMode('session')
      sessionVoiceWasActiveRef.current = false
    }

    setError(null)
    setTurns([])
    setVoiceState('idle')
  }, [])

  return {
    voiceState,
    turns,
    report,
    error,
    startVoiceInterview,
    stopVoiceInterview,
  }
}
