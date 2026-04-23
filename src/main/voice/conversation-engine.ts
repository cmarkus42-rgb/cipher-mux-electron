/**
 * ConversationEngine — toggle-to-speak + always-listen turn management.
 *
 * Manages the full voice conversation lifecycle: audio capture, STT transcription,
 * response generation, and TTS playback. Supports two interaction modes:
 *
 *   toggle:        user presses mic -> records -> STT -> transcription -> TTS -> ready
 *   always-listen: VAD detects speech -> records -> STT -> transcription -> streaming TTS -> ready
 *
 * Key features:
 *   - Echo guard: suppresses VAD triggers caused by TTS speaker echo
 *   - Barge-in: user can interrupt agent speech (via repeated VAD misfires)
 *   - Streaming TTS: sentences are spoken as they arrive from the LLM
 *   - Safety timeouts: auto-recovery from stuck states (recording, processing)
 */

import { EventEmitter } from 'node:events'
import { VoiceStateMachine, VoiceState } from './voice-state'
import { STTRouter } from './stt-router'
import { TTSEngine } from './tts-engine'

/** IPC bridge between the ConversationEngine (main process) and the renderer. */
export interface ConversationTransport {
  sendStartCapture(): void
  sendStopCapture(): void
  sendTranscription(text: string): void
  sendAudioPlayback(base64Wav: string): void
  sendStateChange(state: VoiceState): void
  sendStopPlayback(): void
  sendGenerationDone(): void
  dispatchStatus(text: string, level: string): void
  cancelStream(): void
}

export interface ConversationEngineOptions {
  sttRouter: STTRouter
  transport: ConversationTransport
  interactionMode?: 'toggle' | 'always-listen'
  bargeInEnabled?: boolean
  echoGuardDurationMs?: number
  endpointing?: {
    minUtteranceDurationMs?: number
    maxUtteranceDurationMs?: number
  }
  maxRecordingMs?: number    // default: 30000
  minAudioBytes?: number     // default: 16000
}

// ── Timing constants ──

const DEFAULT_MAX_RECORDING_MS = 30_000
const DEFAULT_MIN_AUDIO_BYTES = 16_000
/** Grace period after stop-capture to accept in-flight audio chunks */
const LATE_CHUNK_WINDOW_MS = 200
/** Delay before auto-recovering from ERROR state */
const ERROR_RECOVERY_MS = 1000
const DEFAULT_ECHO_GUARD_MS = 800
const DEFAULT_MIN_UTTERANCE_MS = 300
const DEFAULT_MAX_UTTERANCE_MS = 30_000
/** Auto-recover from PROCESSING if no LLM response arrives within this window */
const PROCESSING_TIMEOUT_MS = 90_000

export class ConversationEngine extends EventEmitter {
  readonly stateMachine: VoiceStateMachine

  private readonly sttRouter: STTRouter
  private readonly transport: ConversationTransport
  private readonly maxRecordingMs: number
  private readonly minAudioBytes: number

  private tts: TTSEngine | null = null
  private audioBuffers: Buffer[] = []
  private recordingTimer: ReturnType<typeof setTimeout> | null = null
  private _acceptLateChunks = false
  private lateChunkTimer: ReturnType<typeof setTimeout> | null = null
  private errorRecoveryTimer: ReturnType<typeof setTimeout> | null = null

  // ── Interaction mode ──
  private _interactionMode: 'toggle' | 'always-listen'

  // ── Echo guard: suppresses VAD triggers caused by TTS speaker echo ──
  private _echoGuardActive = false
  private _echoGuardTimer: ReturnType<typeof setTimeout> | null = null
  private _echoGuardDurationMs: number

  // ── Barge-in: lets the user interrupt agent speech ──
  private _bargeInEnabled: boolean
  private _bargeInPending = false
  private _bargeInMisfireTimestamps: number[] = []
  private readonly _bargeInMisfireThreshold = 3
  private readonly _bargeInMisfireWindowMs = 2000
  private _lastSpokenText = ''
  private _interruptedContext: string | null = null

  // ── Streaming TTS: sentence-by-sentence playback while LLM generates ──
  private _streamBuffer = ''
  private _streamDone = false
  private _speakingStarted = false
  private _processingTimeout: ReturnType<typeof setTimeout> | null = null

  // ── VAD endpointing: min/max utterance duration thresholds ──
  private _endpointing: { minUtteranceDurationMs: number; maxUtteranceDurationMs: number }

  constructor(opts: ConversationEngineOptions) {
    super()
    this.sttRouter = opts.sttRouter
    this.transport = opts.transport
    this.maxRecordingMs = opts.maxRecordingMs ?? DEFAULT_MAX_RECORDING_MS
    this.minAudioBytes = opts.minAudioBytes ?? DEFAULT_MIN_AUDIO_BYTES

    this._interactionMode = opts.interactionMode ?? 'toggle'
    this._bargeInEnabled = opts.bargeInEnabled ?? true
    this._echoGuardDurationMs = opts.echoGuardDurationMs ?? DEFAULT_ECHO_GUARD_MS
    this._endpointing = {
      minUtteranceDurationMs: opts.endpointing?.minUtteranceDurationMs ?? DEFAULT_MIN_UTTERANCE_MS,
      maxUtteranceDurationMs: opts.endpointing?.maxUtteranceDurationMs ?? DEFAULT_MAX_UTTERANCE_MS,
    }

    this.stateMachine = new VoiceStateMachine()
    this.stateMachine.onTransition((newState, oldState) => {
      this.transport.sendStateChange(newState)
      this.emit('stateChange', newState, oldState)

      // Activate echo guard when agent starts speaking (suppress speaker echo from VAD)
      if (newState === VoiceState.AGENT_SPEAKING) {
        this._activateEchoGuard()
      }

      // Re-activate echo guard after agent stops speaking (tail echo from external speakers)
      if (oldState === VoiceState.AGENT_SPEAKING && newState === VoiceState.READY) {
        this._activateEchoGuard()
      }
    })
  }

  /** Current voice state (delegated to the state machine). */
  get state(): VoiceState {
    return this.stateMachine.state
  }

  /** Attach a TTS engine for agent speech playback. */
  setTTS(tts: TTSEngine): void {
    this.tts = tts
  }

  /** Switch between toggle (push-to-talk) and always-listen (VAD) modes. */
  setInteractionMode(mode: 'toggle' | 'always-listen'): void {
    this._interactionMode = mode
  }

  /**
   * Handle a mic-button toggle press.
   * Behavior depends on current state: starts recording, stops recording,
   * or recovers from error.
   */
  handleToggle(): void {
    switch (this.state) {
      case VoiceState.IDLE:
      case VoiceState.READY:
        this.startRecording()
        break
      case VoiceState.RECORDING:
        this.stopRecording()
        break
      case VoiceState.PROCESSING:
      case VoiceState.AGENT_SPEAKING:
        // ignore toggle during processing or playback
        break
      case VoiceState.ERROR:
        // allow recovery from error via toggle
        this.startRecording()
        break
    }
  }

  /** Begin audio capture. Transitions IDLE -> READY -> RECORDING. */
  startRecording(): void {
    if (this.state === VoiceState.IDLE) {
      this.stateMachine.transition(VoiceState.READY)
    }

    if (!this.stateMachine.transition(VoiceState.RECORDING)) {
      return
    }

    this.audioBuffers = []
    this.transport.sendStartCapture()

    this.clearRecordingTimer()
    this.recordingTimer = setTimeout(() => {
      if (this.state === VoiceState.RECORDING) {
        this.stopRecording()
      }
    }, this.maxRecordingMs)
  }

  /** Stop audio capture, allow late chunks, then trigger STT processing. */
  stopRecording(): void {
    this.clearRecordingTimer()

    if (!this.stateMachine.transition(VoiceState.PROCESSING)) {
      return
    }

    this.transport.sendStopCapture()
    this._acceptLateChunks = true
    this.lateChunkTimer = setTimeout(() => {
      this._acceptLateChunks = false
      this.processAudio()
    }, LATE_CHUNK_WINDOW_MS)
  }

  /** Accept an incoming audio chunk from the renderer's AudioWorklet. */
  receiveAudioChunk(chunk: Buffer | ArrayBuffer): void {
    if (this.state !== VoiceState.RECORDING && !this._acceptLateChunks) {
      return
    }
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    this.audioBuffers.push(buf)
  }

  // ── VAD event handlers (always-listen mode) ──

  /** VAD detected speech onset. In always-listen mode, transition to USER_SPEAKING. */
  onVADSpeechStart(): void {
    console.log('[ConvEngine] onVADSpeechStart — mode:', this._interactionMode, 'state:', this.state, 'echoGuard:', this._echoGuardActive)
    if (this._interactionMode !== 'always-listen') return
    if (this._echoGuardActive) return

    if (this.state === VoiceState.READY) {
      this.stateMachine.transition(VoiceState.USER_SPEAKING)
      this.transport.dispatchStatus('Listening...', 'info')
    } else if (this.state === VoiceState.AGENT_SPEAKING && this._bargeInEnabled && !this._echoGuardActive) {
      if (!this._bargeInPending) {
        this._bargeInPending = true
      }
    }
  }

  /**
   * VAD misfire — speech was too short to be meaningful.
   * During agent playback, accumulate misfires to detect barge-in intent.
   */
  onVADMisfire(): void {
    if (this.state !== VoiceState.AGENT_SPEAKING || !this._bargeInEnabled) return
    if (this._echoGuardActive) return  // Suppress speaker echo misfires

    const now = Date.now()
    this._bargeInMisfireTimestamps.push(now)
    const cutoff = now - this._bargeInMisfireWindowMs
    this._bargeInMisfireTimestamps = this._bargeInMisfireTimestamps.filter(t => t > cutoff)

    if (this._bargeInMisfireTimestamps.length >= this._bargeInMisfireThreshold) {
      this._bargeInMisfireTimestamps = []
      this._bargeInPending = false
      this._handleBargeIn()
    }
  }

  /**
   * VAD detected speech end with captured audio.
   * Validates utterance duration, converts to PCM, and triggers STT processing.
   */
  async onVADSpeechEnd(audioData: number[]): Promise<void> {
    console.log('[ConvEngine] onVADSpeechEnd — mode:', this._interactionMode, 'state:', this.state, 'samples:', audioData?.length)
    // -- Input validation --
    // audioData arrives from the renderer via IPC as a serialized number[].
    // Guard against non-array, non-numeric entries, or oversized payloads that
    // could cause OOM when allocated as a typed array.
    if (!Array.isArray(audioData)) {
      console.warn('[ConvEngine] onVADSpeechEnd: audioData is not an array, ignoring')
      return
    }
    // Cap at ~60s of 16 kHz mono audio (960 000 samples).
    const MAX_SAMPLES = 960_000
    if (audioData.length === 0 || audioData.length > MAX_SAMPLES) {
      console.warn(`[ConvEngine] onVADSpeechEnd: sample count ${audioData.length} out of bounds [1..${MAX_SAMPLES}], ignoring`)
      return
    }

    if (this._interactionMode !== 'always-listen') return

    if (this._bargeInPending) {
      this._bargeInPending = false
      this._handleBargeIn()
    }

    if (this.state !== VoiceState.USER_SPEAKING) return

    // Sanitize: coerce each value to a finite number (NaN/Infinity/non-number -> 0)
    const float32 = new Float32Array(audioData.length)
    for (let i = 0; i < audioData.length; i++) {
      const v = Number(audioData[i])
      float32[i] = Number.isFinite(v) ? v : 0
    }
    const durationMs = (float32.length / 16000) * 1000

    if (durationMs < this._endpointing.minUtteranceDurationMs) {
      this.stateMachine.transition(VoiceState.READY)
      this.transport.dispatchStatus('Voice: ready (listening...)', 'info')
      return
    }

    // Transition to PROCESSING before transcription
    if (!this.stateMachine.transition(VoiceState.PROCESSING)) {
      return
    }

    // Convert Float32 to Int16 PCM
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s * 32767
    }
    const pcmBuffer = Buffer.from(int16.buffer)

    this.audioBuffers = [pcmBuffer]
    await this.processAudio()
  }

  // ── Streaming TTS ──

  /**
   * Feed a text chunk from the streaming LLM response into the TTS buffer.
   * Once a complete sentence is buffered, streaming speech begins automatically.
   */
  feedResponseChunk(delta: string): void {
    if (this.state !== VoiceState.PROCESSING && this.state !== VoiceState.AGENT_SPEAKING) return

    this._streamBuffer += delta

    if (!this._speakingStarted && this.tts?.isReady() && /[.!?]\s*$/.test(this._streamBuffer)) {
      this._speakingStarted = true
      this._startStreamingSpeech()
    }
  }

  /**
   * Stream TTS playback: extract sentences from the buffer as they arrive,
   * speak each one, then wait for more input or stream completion.
   */
  private async _startStreamingSpeech(): Promise<void> {
    if (this._processingTimeout) clearTimeout(this._processingTimeout)
    if (this.state === VoiceState.PROCESSING) {
      this.stateMachine.transition(VoiceState.AGENT_SPEAKING)
    }

    while (true) {
      if (this.state !== VoiceState.AGENT_SPEAKING) break

      const sentenceMatch = this._streamBuffer.match(/^([\s\S]*?[.!?])\s*/)
      if (sentenceMatch) {
        const sentence = sentenceMatch[1].trim()
        this._streamBuffer = this._streamBuffer.slice(sentenceMatch[0].length)
        if (sentence) await this._speakChunk(sentence)
      } else if (this._streamDone) {
        const remaining = this._streamBuffer.trim()
        this._streamBuffer = ''
        if (remaining) await this._speakChunk(remaining)
        break
      } else {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    this._streamBuffer = ''
    this._streamDone = false
    this._speakingStarted = false
    if (this.state === VoiceState.AGENT_SPEAKING) {
      this.transport.sendGenerationDone()
    }
  }

  /** Synthesize and send a single sentence/segment to the renderer for playback. */
  private async _speakChunk(text: string): Promise<void> {
    if (!this.tts) return
    try {
      this._lastSpokenText = text
      for await (const audioChunk of this.tts.speak(text)) {
        if (this.state !== VoiceState.AGENT_SPEAKING) break
        const b64 = audioChunk.toString('base64')
        this.transport.sendAudioPlayback(b64)
      }
    } catch (err) {
      console.error('[ConvEngine] TTS chunk error:', (err as Error).message)
    }
  }

  // ── Barge-in: user interrupts the agent mid-speech ──

  /** Execute barge-in: stop TTS, cancel stream, transition to USER_SPEAKING. */
  private _handleBargeIn(): void {
    if (this.tts) this.tts.stop()
    this.transport.sendStopPlayback()

    this._streamBuffer = ''
    this._streamDone = true
    this._speakingStarted = false
    if (this._processingTimeout) clearTimeout(this._processingTimeout)

    this.transport.cancelStream()

    if (this._lastSpokenText) {
      this._interruptedContext = `[User interrupted after: '${this._lastSpokenText.slice(0, 200)}']`
    }

    this._bargeInMisfireTimestamps = []
    this.stateMachine.transition(VoiceState.USER_SPEAKING)
    this.transport.dispatchStatus('Listening...', 'info')
    this.emit('bargeIn', { lastSpokenText: this._lastSpokenText })
  }

  // ── Echo guard ──

  /** Block VAD events to avoid speaker echo triggering false barge-ins or recordings. */
  private _activateEchoGuard(): void {
    this._echoGuardActive = true
    this._bargeInMisfireTimestamps = []
    if (this._echoGuardTimer) clearTimeout(this._echoGuardTimer)
    this._echoGuardTimer = setTimeout(() => {
      this._echoGuardActive = false
    }, this._echoGuardDurationMs)
  }

  // ── Audio processing ──

  /**
   * Concatenate buffered audio, run STT transcription, and emit the result.
   * Skips processing if the audio is too short (below minAudioBytes).
   */
  async processAudio(): Promise<void> {
    const totalBytes = this.audioBuffers.reduce((sum, b) => sum + b.length, 0)
    console.log('[ConvEngine] processAudio — totalBytes:', totalBytes, 'minRequired:', this.minAudioBytes)

    if (totalBytes < this.minAudioBytes) {
      console.log('[ConvEngine] processAudio — audio too short, returning to READY')
      this.stateMachine.transition(VoiceState.READY)
      return
    }

    const pcmBuffer = Buffer.concat(this.audioBuffers)
    this.audioBuffers = []

    try {
      console.log('[ConvEngine] processAudio — running STT on', pcmBuffer.length, 'bytes...')
      const { CODING_BIAS_PROMPT } = await import('./stt-engine')
      const text = await this.sttRouter.transcribeBatch(pcmBuffer, CODING_BIAS_PROMPT)
      console.log('[ConvEngine] processAudio — STT result:', JSON.stringify(text?.slice(0, 100)))
      this.emit('transcription', text)

      if (text && text.trim().length > 0) {
        let fullText = text
        if (this._interruptedContext) {
          fullText = this._interruptedContext + '\n\n' + text
          this._interruptedContext = null
        }
        this.transport.sendTranscription(fullText)

        this._processingTimeout = setTimeout(() => {
          if (this.state === VoiceState.PROCESSING) {
            this.stateMachine.transition(VoiceState.READY)
            this.transport.dispatchStatus('Voice: ready', 'info')
          }
        }, PROCESSING_TIMEOUT_MS)
      } else {
        this.stateMachine.transition(VoiceState.READY)
      }
    } catch (err) {
      this.emit('error', err)
      this.stateMachine.transition(VoiceState.ERROR)

      this.errorRecoveryTimer = setTimeout(() => {
        if (this.state === VoiceState.ERROR) {
          this.stateMachine.transition(VoiceState.READY)
        }
      }, ERROR_RECOVERY_MS)
    }
  }

  /**
   * Speak a complete response via TTS.
   * If streaming TTS already started (via feedResponseChunk), signals stream-done instead.
   */
  async speakResponse(text: string): Promise<void> {
    if (this._processingTimeout) clearTimeout(this._processingTimeout)

    if (!this.tts) {
      this.stateMachine.transition(VoiceState.READY)
      return
    }

    if (this._speakingStarted) {
      this._streamDone = true
      return
    }

    if (!this.stateMachine.transition(VoiceState.AGENT_SPEAKING)) {
      return
    }

    try {
      this._lastSpokenText = text
      for await (const wavChunk of this.tts.speak(text)) {
        // Check if state changed externally (e.g. shutdown)
        if (this.state !== VoiceState.AGENT_SPEAKING) {
          break
        }
        const base64 = wavChunk.toString('base64')
        this.transport.sendAudioPlayback(base64)
      }
    } catch (err) {
      this.emit('error', err)
    }

    // Signal generation done (if still speaking)
    if (this.state === VoiceState.AGENT_SPEAKING) {
      this.transport.sendGenerationDone()
    }
  }

  /** Called by the renderer when audio playback finishes. Transitions back to READY. */
  onPlaybackComplete(): void {
    if (this.state === VoiceState.AGENT_SPEAKING) {
      this.stateMachine.transition(VoiceState.READY)
    }
  }

  /** Tear down: clear all timers, reset state machine, remove event listeners. */
  shutdown(): void {
    this.clearRecordingTimer()

    if (this.lateChunkTimer) {
      clearTimeout(this.lateChunkTimer)
      this.lateChunkTimer = null
    }

    if (this.errorRecoveryTimer) {
      clearTimeout(this.errorRecoveryTimer)
      this.errorRecoveryTimer = null
    }

    if (this._echoGuardTimer) {
      clearTimeout(this._echoGuardTimer)
      this._echoGuardTimer = null
    }

    if (this._processingTimeout) {
      clearTimeout(this._processingTimeout)
      this._processingTimeout = null
    }

    this._acceptLateChunks = false
    this._bargeInPending = false
    this._streamDone = true
    this.audioBuffers = []
    this.stateMachine.reset()
    this.removeAllListeners()
  }

  private clearRecordingTimer(): void {
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer)
      this.recordingTimer = null
    }
  }
}
