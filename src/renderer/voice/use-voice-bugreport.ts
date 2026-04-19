import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { initVAD, type MicVADInstance } from './vad-loader'

const api = () => (window as any).cipherMux

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

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

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

  // ─── Audio Playback Queue ──────────────────────────────────
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

  // ─── IPC Event Listeners ──────────────────────────────────
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
      // Stop playback on barge-in
      cleanups.push(voice.onStopPlayback(() => {
        audioQueueRef.current = []
        playingRef.current = false
      }))
      // Generation done — wait for playback queue to drain
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

  // ─── Start Voice Interview ────────────────────────────────
  const startVoiceInterview = useCallback(async () => {
    try {
      setVoiceState('initializing')
      setTurns([])
      setReport(null)
      setError(null)
      audioQueueRef.current = []
      playingRef.current = false

      // 1. Request microphone access (use browser default sample rate)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      // 2. Create AudioContext (default sample rate — VAD resamples internally to 16kHz)
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx

      // 3. Start interview in main process (initializes STT + TTS)
      const result = await api().voice.start()
      if (result && !result.ok) {
        setError(result.error || 'Voice-Interview fehlgeschlagen')
        setVoiceState('error')
        return
      }

      // 4. Initialize VAD — sends events to main process via IPC
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

      // 5. Start VAD listening
      vad.start()
      setVoiceState('ready')
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize voice interview')
      setVoiceState('error')
    }
  }, [])

  // ─── Stop Voice Interview ─────────────────────────────────
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

    setError(null)
    setTurns([])
    setVoiceState('idle')
  }, [])

  // toggleRecording kept for API compat but is a no-op with VAD
  const toggleRecording = useCallback(() => {}, [])

  return {
    voiceState,
    turns,
    report,
    error,
    startVoiceInterview,
    toggleRecording,
    stopVoiceInterview,
  }
}
