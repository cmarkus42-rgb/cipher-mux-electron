/**
 * ConversationEngine — toggle-to-speak + always-listen turn management
 *
 * Port of cipher-desktop's conversation engine with full VAD support.
 * Supports toggle mode (push-to-talk) and always-listen mode (VAD-driven).
 *
 * Flow (toggle):   user presses mic → records → STT → transcription → TTS → ready
 * Flow (VAD):      VAD detects speech → records → STT → transcription → streaming TTS → ready
 */

import { EventEmitter } from 'node:events'
import { VoiceStateMachine, VoiceState } from './voice-state'
import { STTRouter } from './stt-router'
import { TTSEngine } from './tts-engine'

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

const DEFAULT_MAX_RECORDING_MS = 30000
const DEFAULT_MIN_AUDIO_BYTES = 16000
const LATE_CHUNK_WINDOW_MS = 200
const ERROR_RECOVERY_MS = 1000
const DEFAULT_ECHO_GUARD_MS = 300
const DEFAULT_MIN_UTTERANCE_MS = 300
const DEFAULT_MAX_UTTERANCE_MS = 30000
const PROCESSING_TIMEOUT_MS = 90000

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

  // Interaction mode
  private _interactionMode: 'toggle' | 'always-listen'

  // Echo guard (prevents VAD triggers from TTS echo)
  private _echoGuardActive = false
  private _echoGuardTimer: ReturnType<typeof setTimeout> | null = null
  private _echoGuardDurationMs: number

  // Barge-in (user interrupts agent)
  private _bargeInEnabled: boolean
  private _bargeInPending = false
  private _bargeInMisfireTimestamps: number[] = []
  private _bargeInMisfireThreshold = 3
  private _bargeInMisfireWindowMs = 2000
  private _lastSpokenText = ''
  private _interruptedContext: string | null = null

  // Streaming TTS
  private _streamBuffer = ''
  private _streamDone = false
  private _speakingStarted = false
  private _processingTimeout: ReturnType<typeof setTimeout> | null = null

  // Endpointing
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

      // After agent stops speaking, block VAD events briefly
      if (oldState === VoiceState.AGENT_SPEAKING && newState === VoiceState.READY) {
        this._activateEchoGuard()
      }
    })
  }

  get state(): VoiceState {
    return this.stateMachine.state
  }

  setTTS(tts: TTSEngine): void {
    this.tts = tts
  }

  setInteractionMode(mode: 'toggle' | 'always-listen'): void {
    this._interactionMode = mode
  }

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

  startRecording(): void {
    // Ensure we're in ready state first
    if (this.state === VoiceState.IDLE) {
      this.stateMachine.transition(VoiceState.READY)
    }

    if (!this.stateMachine.transition(VoiceState.RECORDING)) {
      return
    }

    // Clear audio buffer
    this.audioBuffers = []

    // Notify transport to start capturing
    this.transport.sendStartCapture()

    // Safety timeout — auto-stop after maxRecordingMs
    this.clearRecordingTimer()
    this.recordingTimer = setTimeout(() => {
      if (this.state === VoiceState.RECORDING) {
        this.stopRecording()
      }
    }, this.maxRecordingMs)
  }

  stopRecording(): void {
    this.clearRecordingTimer()

    if (!this.stateMachine.transition(VoiceState.PROCESSING)) {
      return
    }

    this.transport.sendStopCapture()

    // Accept late chunks for a short window, then process
    this._acceptLateChunks = true
    this.lateChunkTimer = setTimeout(() => {
      this._acceptLateChunks = false
      this.processAudio()
    }, LATE_CHUNK_WINDOW_MS)
  }

  receiveAudioChunk(chunk: Buffer | ArrayBuffer): void {
    if (this.state !== VoiceState.RECORDING && !this._acceptLateChunks) {
      return
    }
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    this.audioBuffers.push(buf)
  }

  // ── VAD event handlers ──

  onVADSpeechStart(): void {
    if (this._interactionMode !== 'always-listen') return
    if (this._echoGuardActive) return

    if (this.state === VoiceState.READY) {
      this.stateMachine.transition(VoiceState.USER_SPEAKING)
      this.transport.dispatchStatus('Listening...', 'info')
    } else if (this.state === VoiceState.AGENT_SPEAKING && this._bargeInEnabled) {
      if (!this._bargeInPending) {
        this._bargeInPending = true
      }
    }
  }

  onVADMisfire(): void {
    if (this.state !== VoiceState.AGENT_SPEAKING || !this._bargeInEnabled) return
    if (this._echoGuardActive) return

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

  async onVADSpeechEnd(audioData: number[]): Promise<void> {
    if (this._interactionMode !== 'always-listen') return

    if (this._bargeInPending) {
      this._bargeInPending = false
      this._handleBargeIn()
    }

    if (this.state !== VoiceState.USER_SPEAKING) return

    const float32 = new Float32Array(audioData)
    const durationMs = (float32.length / 16000) * 1000

    if (durationMs < this._endpointing.minUtteranceDurationMs) {
      this.stateMachine.transition(VoiceState.READY)
      this.transport.dispatchStatus('Voice: ready (listening...)', 'info')
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

  feedResponseChunk(delta: string): void {
    if (this.state !== VoiceState.PROCESSING && this.state !== VoiceState.AGENT_SPEAKING) return

    this._streamBuffer = (this._streamBuffer || '') + delta

    if (!this._speakingStarted && this.tts?.isReady() && /[.!?]\s*$/.test(this._streamBuffer)) {
      this._speakingStarted = true
      this._startStreamingSpeech()
    }
  }

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
        const remaining = (this._streamBuffer || '').trim()
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

  // ── Barge-in ──

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

  private _activateEchoGuard(): void {
    this._echoGuardActive = true
    if (this._echoGuardTimer) clearTimeout(this._echoGuardTimer)
    this._echoGuardTimer = setTimeout(() => {
      this._echoGuardActive = false
    }, this._echoGuardDurationMs)
  }

  // ── Audio processing ──

  async processAudio(): Promise<void> {
    const totalBytes = this.audioBuffers.reduce((sum, b) => sum + b.length, 0)

    if (totalBytes < this.minAudioBytes) {
      // Too short — go back to ready
      this.stateMachine.transition(VoiceState.READY)
      return
    }

    const pcmBuffer = Buffer.concat(this.audioBuffers)
    this.audioBuffers = []

    try {
      const text = await this.sttRouter.transcribeBatch(pcmBuffer)
      this.emit('transcription', text)

      if (text && text.trim().length > 0) {
        // Prepend interrupted context if available
        let fullText = text
        const ctx = this._interruptedContext
        if (ctx) {
          this._interruptedContext = null
          fullText = ctx + '\n\n' + text
        }
        this.transport.sendTranscription(fullText)

        // Processing timeout — auto-recover if no response arrives
        this._processingTimeout = setTimeout(() => {
          if (this.state === VoiceState.PROCESSING) {
            this.stateMachine.transition(VoiceState.READY)
            this.transport.dispatchStatus('Voice: ready', 'info')
          }
        }, PROCESSING_TIMEOUT_MS)
      } else {
        // Empty transcription — go back to ready
        this.stateMachine.transition(VoiceState.READY)
      }
    } catch (err) {
      this.emit('error', err)
      this.stateMachine.transition(VoiceState.ERROR)

      // Auto-recover after a delay
      this.errorRecoveryTimer = setTimeout(() => {
        if (this.state === VoiceState.ERROR) {
          this.stateMachine.transition(VoiceState.READY)
        }
      }, ERROR_RECOVERY_MS)
    }
  }

  async speakResponse(text: string): Promise<void> {
    if (this._processingTimeout) clearTimeout(this._processingTimeout)

    if (!this.tts) {
      this.stateMachine.transition(VoiceState.READY)
      return
    }

    // If streaming TTS already started, just signal done
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

  onPlaybackComplete(): void {
    if (this.state === VoiceState.AGENT_SPEAKING) {
      this.stateMachine.transition(VoiceState.READY)
    }
  }

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
