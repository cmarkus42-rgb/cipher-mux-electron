import { useEffect, useRef, useCallback, useState } from 'preact/hooks'

const api = () => (window as any).cipherMux

export interface GlobalTtsState {
  isSpeaking: boolean
  stopSpeech: () => void
}

/** Decode a base64 WAV string into an AudioBuffer via AudioContext. */
function decodeBase64Wav(ctx: AudioContext, base64: string): Promise<AudioBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return ctx.decodeAudioData(bytes.buffer.slice(0))
}

/**
 * Global TTS audio playback hook — always mounted in App.
 *
 * Gapless playback inspired by cipher-android AudioPlayer.playPcmStream():
 * uses a single AudioContext and schedules each AudioBufferSourceNode at the
 * exact sample-accurate end time of the previous one. No onended polling,
 * no inter-chunk gap.
 */
export function useGlobalTtsPlayback(): GlobalTtsState {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const chunkCountRef = useRef(0)
  const finishedCountRef = useRef(0)

  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
      nextStartTimeRef.current = 0
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  const scheduleBuffer = useCallback((buffer: AudioBuffer) => {
    const ctx = getAudioCtx()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    // Schedule at exact end of previous chunk (sample-accurate, no gap)
    const startAt = Math.max(nextStartTimeRef.current, ctx.currentTime)
    source.start(startAt)
    nextStartTimeRef.current = startAt + buffer.duration

    activeSourcesRef.current.push(source)
    chunkCountRef.current++
    setIsSpeaking(true)

    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source)
      finishedCountRef.current++
      // All chunks finished and generation is done
      if (activeSourcesRef.current.length === 0) {
        setIsSpeaking(false)
        api().voice?.playbackDone?.()
      }
    }
  }, [getAudioCtx])

  const stopSpeech = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try { source.stop() } catch { /* already stopped */ }
    }
    activeSourcesRef.current = []
    nextStartTimeRef.current = 0
    chunkCountRef.current = 0
    finishedCountRef.current = 0
    setIsSpeaking(false)
    api().voice?.stopSpeech?.()
  }, [])

  useEffect(() => {
    const voice = api()?.voice
    if (!voice) return

    const cleanups: Array<() => void> = []

    if (voice.onAgentAudio) {
      cleanups.push(voice.onAgentAudio((base64Wav: string) => {
        const ctx = getAudioCtx()
        decodeBase64Wav(ctx, base64Wav)
          .then(buf => scheduleBuffer(buf))
          .catch(err => console.error('[TtsPlayback] decode error:', err))
      }))
    }

    if (voice.onStopPlayback) {
      cleanups.push(voice.onStopPlayback(() => {
        stopSpeech()
      }))
    }

    if (voice.onGenerationDone) {
      cleanups.push(voice.onGenerationDone(() => {
        if (activeSourcesRef.current.length === 0) {
          api().voice?.playbackDone?.()
        }
      }))
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [scheduleBuffer, stopSpeech, getAudioCtx])

  return { isSpeaking, stopSpeech }
}
