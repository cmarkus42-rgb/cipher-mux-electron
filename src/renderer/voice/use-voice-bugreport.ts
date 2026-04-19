import { useState, useCallback, useEffect, useRef } from 'preact/hooks'

const api = () => (window as any).cipherMux

export type VoiceBugreportState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'recording'
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

  const audioCtxRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
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

      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
        },
      })
      streamRef.current = stream

      // 2. Create AudioContext
      const audioCtx = new AudioContext({ sampleRate: 48000 })
      audioCtxRef.current = audioCtx

      // 3. Load AudioWorklet module (served from public/ dir)
      await audioCtx.audioWorklet.addModule('./audio-capture-worklet.js')

      // 4. Create AudioWorkletNode
      const workletNode = new AudioWorkletNode(audioCtx, 'audio-capture')
      workletNodeRef.current = workletNode

      // 5. Connect audio graph: source -> worklet -> destination
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(workletNode)
      workletNode.connect(audioCtx.destination)

      // 6. Forward audio chunks to main process via IPC
      workletNode.port.onmessage = (e: MessageEvent) => {
        if (e.data.audio) {
          api().voice.sendAudioChunk(e.data.audio)
        }
        // silenceTimeout and energy are handled by main process indirectly
        // or can be used for UI feedback later
      }

      // 7. Start interview in main process
      const result = await api().voice.start()
      if (result && !result.ok) {
        setError(result.error || 'Voice-Interview fehlgeschlagen')
        setVoiceState('error')
        return
      }

      // 8. Auto-start recording — no second click needed
      workletNode.port.postMessage({ cmd: 'start' })
      setVoiceState('recording')
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize voice interview')
      setVoiceState('error')
    }
  }, [])

  // ─── Toggle Recording ─────────────────────────────────────
  const toggleRecording = useCallback(() => {
    const worklet = workletNodeRef.current
    if (!worklet) return

    if (voiceState === 'ready') {
      worklet.port.postMessage({ cmd: 'start' })
      setVoiceState('recording')
    } else if (voiceState === 'recording') {
      worklet.port.postMessage({ cmd: 'stop' })
      setVoiceState('processing')
      api().voice.stop()
    }
  }, [voiceState])

  // ─── Stop Voice Interview ─────────────────────────────────
  const stopVoiceInterview = useCallback(() => {
    // Stop worklet capture
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ cmd: 'stop' })
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }

    // Close AudioContext
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }

    // Stop media stream tracks
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    // Clear playback queue
    audioQueueRef.current = []
    playingRef.current = false

    setVoiceState('idle')
  }, [])

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
