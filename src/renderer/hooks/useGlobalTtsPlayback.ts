import { useEffect, useRef, useCallback } from 'preact/hooks'

const api = () => (window as any).cipherMux

/**
 * Global TTS audio playback hook — always mounted in App.
 * Listens for VOICE_AGENT_AUDIO chunks from Main Process and plays them
 * sequentially via HTMLAudioElement. Works for mux_tts_speak, Watchdog,
 * Voice Companion, and any other TTS source.
 */
export function useGlobalTtsPlayback(): void {
  const audioQueueRef = useRef<string[]>([])
  const playingRef = useRef(false)

  const playNextAudio = useCallback(() => {
    const queue = audioQueueRef.current
    if (queue.length === 0) {
      playingRef.current = false
      api().voice?.playbackDone?.()
      return
    }

    playingRef.current = true
    const base64Wav = queue.shift()!
    const audio = new Audio(`data:audio/wav;base64,${base64Wav}`)
    audio.onended = () => playNextAudio()
    audio.onerror = () => playNextAudio()
    audio.play().catch(() => playNextAudio())
  }, [])

  useEffect(() => {
    const voice = api()?.voice
    if (!voice) return

    const cleanups: Array<() => void> = []

    if (voice.onAgentAudio) {
      cleanups.push(voice.onAgentAudio((base64Wav: string) => {
        audioQueueRef.current.push(base64Wav)
        if (!playingRef.current) playNextAudio()
      }))
    }

    if (voice.onStopPlayback) {
      cleanups.push(voice.onStopPlayback(() => {
        audioQueueRef.current = []
        playingRef.current = false
      }))
    }

    if (voice.onGenerationDone) {
      cleanups.push(voice.onGenerationDone(() => {
        if (!playingRef.current && audioQueueRef.current.length === 0) {
          api().voice?.playbackDone?.()
        }
      }))
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [playNextAudio])
}
