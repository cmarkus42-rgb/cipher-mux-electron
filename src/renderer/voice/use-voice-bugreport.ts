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
 * Handles microphone access, VAD initialization, and IPC event wiring.
 * Audio playback is handled globally by useGlobalTtsPlayback (mounted in App).
 */
export function useVoiceBugreport() {
  const [voiceState, setVoiceState] = useState<VoiceBugreportState>('idle')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const vadRef = useRef<MicVADInstance | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /** Whether session voice was active before bugreport took over */
  const sessionVoiceWasActiveRef = useRef(false)
  /** Guard: only process voice events after interview has started */
  const interviewActiveRef = useRef(false)

  // ── IPC event listeners: wire main-process voice events to React state ──
  // Note: Audio playback (onAgentAudio, onStopPlayback, onGenerationDone)
  // is handled by the global useGlobalTtsPlayback hook in App.
  // Events arriving before startVoiceInterview() are discarded via
  // interviewActiveRef to prevent stale session-voice state from leaking in.

  useEffect(() => {
    const voice = api()?.voice
    if (!voice) return

    const cleanups: Array<() => void> = []

    try {
      cleanups.push(voice.onState((state: string) => {
        if (!interviewActiveRef.current) return
        setVoiceState(state as VoiceBugreportState)
      }))
      cleanups.push(voice.onTranscription((text: string) => {
        if (!interviewActiveRef.current) return
        setTurns((prev) => [...prev, { role: 'user', text }])
      }))
      cleanups.push(voice.onAgentText((text: string) => {
        if (!interviewActiveRef.current) return
        setTurns((prev) => [...prev, { role: 'assistant', text }])
      }))
      cleanups.push(voice.onInterviewDone((reportText: string) => {
        if (!interviewActiveRef.current) return
        setReport(reportText)
        setVoiceState('complete')
      }))
      cleanups.push(voice.onError((msg: string) => {
        if (!interviewActiveRef.current) return
        setError(msg)
        setVoiceState('error')
      }))
    } catch (err) {
      console.warn('[useVoiceBugreport] Failed to register listeners:', err)
    }

    return () => {
      interviewActiveRef.current = false
      for (const cleanup of cleanups) cleanup()
    }
  }, [])

  // ── Start voice interview: mic access -> main-process init -> VAD ──

  const startVoiceInterview = useCallback(async () => {
    try {
      setVoiceState('initializing')
      setTurns([])
      setReport(null)
      setError(null)
      // Enable the event guard AFTER clearing state — events before this point are discarded
      interviewActiveRef.current = true
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
      }, {
        // Bugreport interview needs longer pause tolerance (~1.5s instead of ~0.8s)
        // to avoid cutting off the user mid-thought during natural speech.
        redemptionFrames: 16,
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
    interviewActiveRef.current = false

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
