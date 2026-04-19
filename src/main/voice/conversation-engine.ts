/**
 * ConversationEngine — toggle-to-speak turn management
 *
 * Simplified port of cipher-desktop's conversation engine (~200 lines).
 * Removed: barge-in, echo guard, VAD, cloud endpointing, streaming TTS,
 * interrupted context, always-listen mode.
 *
 * Flow: user presses mic → records → STT → emit transcription →
 * (external handler sends to Gemma) → speakResponse() → TTS → playback → ready
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
}

export interface ConversationEngineOptions {
  sttRouter: STTRouter
  transport: ConversationTransport
  maxRecordingMs?: number    // default: 30000
  minAudioBytes?: number     // default: 16000
}

const DEFAULT_MAX_RECORDING_MS = 30000
const DEFAULT_MIN_AUDIO_BYTES = 16000
const LATE_CHUNK_WINDOW_MS = 200
const ERROR_RECOVERY_MS = 1000

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

  constructor(opts: ConversationEngineOptions) {
    super()
    this.sttRouter = opts.sttRouter
    this.transport = opts.transport
    this.maxRecordingMs = opts.maxRecordingMs ?? DEFAULT_MAX_RECORDING_MS
    this.minAudioBytes = opts.minAudioBytes ?? DEFAULT_MIN_AUDIO_BYTES

    this.stateMachine = new VoiceStateMachine()
    this.stateMachine.onTransition((newState, oldState) => {
      this.transport.sendStateChange(newState)
      this.emit('stateChange', newState, oldState)
    })
  }

  get state(): VoiceState {
    return this.stateMachine.state
  }

  setTTS(tts: TTSEngine): void {
    this.tts = tts
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

  private async processAudio(): Promise<void> {
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
        this.transport.sendTranscription(text)
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
    if (!this.tts) {
      this.stateMachine.transition(VoiceState.READY)
      return
    }

    if (!this.stateMachine.transition(VoiceState.AGENT_SPEAKING)) {
      return
    }

    try {
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

    // Transition to ready when done (if still speaking)
    if (this.state === VoiceState.AGENT_SPEAKING) {
      this.stateMachine.transition(VoiceState.READY)
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

    this._acceptLateChunks = false
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
