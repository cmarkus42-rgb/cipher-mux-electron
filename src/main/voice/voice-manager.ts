/**
 * VoiceManager — top-level orchestrator for the voice pipeline.
 *
 * Wires together STT (Whisper via STTRouter), TTS (PiperTTS),
 * ConversationEngine (toggle-to-speak turns), OllamaChat (local LLM),
 * and BugreportInterview into a single lifecycle manager.
 *
 * Instantiated in ipc-hub.ts; controls the entire voice pipeline lifecycle.
 */

import path from 'node:path'
import { EventEmitter } from 'node:events'
import { STTRouter } from './stt-router'
import { PiperTTS } from './tts-piper'
import { configStore } from '../config/config-store'
import { ConversationEngine, type ConversationTransport } from './conversation-engine'
import { VoiceState } from './voice-state'
import { OllamaChat } from './ollama-chat'
import { ClaudeChat } from './claude-chat'
import { BugreportInterview, BUGREPORT_SYSTEM_PROMPT } from './bugreport-interview'
import { VoiceInputRouter } from './voice-input-router'
import { VoiceOutputRouter } from './voice-output-router'



export interface VoiceManagerConfig {
  whisperModelDir?: string
  piperModelsDir?: string
  piperVoice?: string
  ollamaHost?: string
  ollamaPort?: number
  ollamaModel?: string
  interactionMode?: 'toggle' | 'always-listen'
  skipTTS?: boolean
}

const DEFAULT_PIPER_VOICE = 'de_DE-dii-high'

/** Read Ollama config from configStore (single source of truth). */
function getOllamaDefaults() {
  try {
    const llm = configStore.get('llm')
    return {
      host: llm?.ollamaHost ?? '127.0.0.1',
      port: llm?.ollamaPort ?? 11434,
      model: llm?.ollamaModel ?? 'gemma4:26b',
    }
  } catch {
    return { host: '127.0.0.1', port: 11434, model: 'gemma4:26b' }
  }
}

export class VoiceManager extends EventEmitter {
  private readonly config: Required<VoiceManagerConfig>
  private sttRouter: STTRouter | null = null
  private piperTTS: PiperTTS | null = null
  private conversation: ConversationEngine | null = null
  private interview: BugreportInterview | null = null
  private inputRouter: VoiceInputRouter | null = null
  private outputRouter: VoiceOutputRouter | null = null
  private transport: ConversationTransport | null = null
  private _initialized = false

  constructor(config?: VoiceManagerConfig) {
    super()

    // Use ~/.config/cipher-mux for model storage — stable across dev/prod
    // (electron getPath('userData') returns different paths in dev vs packaged)
    const userDataDir = path.join(process.env.HOME ?? '', '.config', 'cipher-mux')
    const ollama = getOllamaDefaults()

    this.config = {
      whisperModelDir: config?.whisperModelDir
        ?? path.join(userDataDir, 'models', 'whisper'),
      piperModelsDir: config?.piperModelsDir
        ?? path.join(userDataDir, 'models', 'piper'),
      piperVoice: config?.piperVoice ?? DEFAULT_PIPER_VOICE,
      ollamaHost: config?.ollamaHost ?? ollama.host,
      ollamaPort: config?.ollamaPort ?? ollama.port,
      ollamaModel: config?.ollamaModel ?? ollama.model,
      interactionMode: config?.interactionMode ?? 'toggle',
      skipTTS: config?.skipTTS ?? false,
    }
  }

  /**
   * Set the conversation transport (IPC bridge to renderer).
   * Must be called before init().
   */
  setTransport(transport: ConversationTransport): void {
    this.transport = transport
  }

  /**
   * Initialize the voice pipeline:
   * 1. STTRouter (local Whisper)
   * 2. PiperTTS (voice synthesis)
   * 3. ConversationEngine (turn management)
   */
  async init(): Promise<void> {
    console.log('[Voice] VoiceManager.init() starting...')
    if (!this.transport) {
      throw new Error('VoiceManager: transport must be set before init(). Call setTransport() first.')
    }

    this.sttRouter = new STTRouter({
      local: { modelDir: this.config.whisperModelDir },
      onStatusChange: (msg, level) => {
        this.emit('status', msg, level)
      },
    })
    await this.sttRouter.init()

    if (!this.config.skipTTS) {
      const appNodeModules = path.join(__dirname, '..', '..', '..', '..', 'node_modules')
      this.piperTTS = new PiperTTS({
        voice: this.config.piperVoice,
        modelsDir: this.config.piperModelsDir,
        nodeModulesPath: appNodeModules,
      })
      await this.piperTTS.init()
    }

    this.conversation = new ConversationEngine({
      sttRouter: this.sttRouter,
      transport: this.transport,
      interactionMode: this.config.interactionMode,
    })
    if (this.piperTTS) {
      this.conversation.setTTS(this.piperTTS)
    }

    this._initialized = true
    console.log('[Voice] VoiceManager.init() complete — pipeline ready')
    this.emit('initialized')
  }

  /**
   * Initialize only PiperTTS (no STT, no ConversationEngine).
   * Used by MCP mux_tts_speak when voice mode is not active but local TTS is preferred.
   */
  private _piperOnlyInitialized = false

  async initPiperOnly(): Promise<void> {
    if (this._piperOnlyInitialized || this._initialized) return
    console.log('[Voice] VoiceManager.initPiperOnly() starting...')
    const appNodeModules = path.join(__dirname, '..', '..', '..', '..', 'node_modules')
    this.piperTTS = new PiperTTS({
      voice: this.config.piperVoice,
      modelsDir: this.config.piperModelsDir,
      nodeModulesPath: appNodeModules,
    })
    await this.piperTTS.init()
    this._piperOnlyInitialized = true
    console.log('[Voice] VoiceManager.initPiperOnly() complete — Piper ready')
  }

  /** Whether Piper TTS is available (either via full init or piperOnly). */
  isPiperReady(): boolean {
    return this._piperOnlyInitialized || (this._initialized && this.piperTTS !== null)
  }

  /**
   * Start a bugreport interview session.
   * Creates an OllamaChat with the bugreport system prompt,
   * wires transcription → interview → TTS playback.
   */
  startInterview(): BugreportInterview {
    if (!this._initialized || !this.conversation) {
      throw new Error('VoiceManager: not initialized. Call init() first.')
    }

    // Use llm.bugreportEnrichBackend as the single source of truth for cloud vs local.
    // This is the same toggle visible in the BugreportDialog UI.
    const enrichBackend = configStore.get('llm')?.bugreportEnrichBackend ?? 'cloud'
    const provider = enrichBackend === 'cloud' ? 'haiku' : 'ollama'
    const chat: { send(msg: string): Promise<string> } = provider === 'haiku'
      ? new ClaudeChat({ systemPrompt: BUGREPORT_SYSTEM_PROMPT })
      : new OllamaChat({
          model: this.config.ollamaModel,
          host: this.config.ollamaHost,
          port: this.config.ollamaPort,
          systemPrompt: BUGREPORT_SYSTEM_PROMPT,
        })
    console.log(`[Voice] Bugreport interview using ${provider} backend`)
    this.interview = new BugreportInterview(chat)

    // Wire: conversation transcription -> interview -> TTS playback
    this.conversation.removeAllListeners('transcription')
    this.conversation.on('transcription', (text: string) => {
      this.interview?.onUserTranscription(text)
    })
    this.interview.on('agent-speaking', (text: string) => {
      this.conversation?.speakResponse(text)
    })

    // Forward interview lifecycle events to VoiceManager consumers
    this.interview.on('interview-complete', (report: string) => {
      this.emit('interview-complete', report)
    })
    this.interview.on('turn-update', (data: unknown) => {
      this.emit('turn-update', data)
    })
    this.interview.on('error', (err: Error) => {
      this.emit('error', err)
    })

    // Enable always-listen mode for natural conversation flow
    this.conversation.setInteractionMode('always-listen')
    this.conversation.stateMachine.transition(VoiceState.READY)

    return this.interview
  }

  /**
   * Start session-input mode: STT-only pipeline, no LLM/TTS/interview.
   * Transcriptions are routed through VoiceInputRouter to the focused session.
   * Uses coding bias prompt for better recognition of programming terms.
   */
  startSessionMode(sessionManager: import('../session/session-manager').SessionManager): VoiceInputRouter {
    if (!this._initialized || !this.conversation) {
      throw new Error('VoiceManager: not initialized. Call init() first.')
    }

    this.inputRouter = new VoiceInputRouter({ sessionManager })
    this.inputRouter.setMode('session')

    // VoiceOutputRouter disabled — voice-relay session uses mux_tts_speak
    // directly (like all other sessions), so terminal-polling TTS is not needed.

    // Wire: conversation transcription -> input router (session dispatch)
    // In session mode there's no TTS/LLM, so we must transition back to READY
    // after dispatch — otherwise the state machine stays stuck in PROCESSING.
    this.conversation.removeAllListeners('transcription')
    this.conversation.on('transcription', async (text: string) => {
      if (!this.inputRouter || !this.conversation) return
      console.log('[Voice] Session transcription received:', JSON.stringify(text?.slice(0, 80)))
      await this.inputRouter.routeTranscription(text)
      // Transition back to READY so VAD can accept the next utterance
      if (this.conversation.state === VoiceState.PROCESSING) {
        console.log('[Voice] Session dispatch done — transitioning PROCESSING → READY')
        this.conversation.stateMachine.transition(VoiceState.READY)
      }
    })

    // Session mode uses always-listen: VAD captures speech segments automatically.
    // PTT (Ctrl+Shift+Space) provides additional manual control overlay.
    this.conversation.setInteractionMode('always-listen')
    this.conversation.stateMachine.transition(VoiceState.READY)
    console.log('[Voice] Session mode started — interaction: always-listen, state: READY')

    return this.inputRouter
  }

  /** Get the input router (null if not in session mode) */
  getInputRouter(): VoiceInputRouter | null {
    return this.inputRouter
  }

  /** Get the output router (null if not in session mode) */
  getOutputRouter(): VoiceOutputRouter | null {
    return this.outputRouter
  }

  /** Start output routing (call when voice-relay entity starts) */
  startOutputRouting(): void {
    if (this.outputRouter) this.outputRouter.start()
  }

  /** Stop output routing (call when voice-relay entity stops) */
  stopOutputRouting(): void {
    if (this.outputRouter) this.outputRouter.stop()
  }

  /** Delegate VAD speech-start event to the conversation engine */
  onVADSpeechStart(): void {
    console.log('[Voice] onVADSpeechStart — state:', this.conversation?.state, 'initialized:', this._initialized)
    this.conversation?.onVADSpeechStart()
  }

  /** Delegate VAD speech-end event (with audio data) to the conversation engine */
  async onVADSpeechEnd(audioData: number[]): Promise<void> {
    console.log('[Voice] onVADSpeechEnd — samples:', audioData?.length, 'state:', this.conversation?.state)
    await this.conversation?.onVADSpeechEnd(audioData)
  }

  /** Delegate VAD misfire event to the conversation engine */
  onVADMisfire(): void {
    console.log('[Voice] onVADMisfire — state:', this.conversation?.state)
    this.conversation?.onVADMisfire()
  }

  /** Propagate an interaction mode change to the conversation engine */
  setInteractionMode(mode: 'toggle' | 'always-listen'): void {
    this.conversation?.setInteractionMode(mode)
  }

  /** Get the conversation engine (null if not initialized) */
  getConversation(): ConversationEngine | null {
    return this.conversation
  }

  /** Get the current interview (null if none active) */
  getInterview(): BugreportInterview | null {
    return this.interview
  }

  /** Whether the voice pipeline is initialized and ready */
  isInitialized(): boolean {
    return this._initialized
  }

  /**
   * Speak text via TTS (used by mux_tts_speak MCP tool).
   * Tries PiperTTS first (with lazy-init), falls back to macOS `say` if unavailable.
   *
   * Serialized: each call waits for the previous one to complete, preventing
   * dual-voice overlap. With interrupt=true, the previous call is stopped first.
   */
  private _speakChain: Promise<void> = Promise.resolve()

  async speakText(text: string, interrupt = false): Promise<void> {
    if (!this._initialized && !this._piperOnlyInitialized) {
      throw new Error('VoiceManager not initialized')
    }
    if (configStore.get('ttsEnabled') === false) return

    if (interrupt) {
      this.stopSpeech()
      // Reset chain so we don't wait for the killed playback
      this._speakChain = Promise.resolve()
    }

    // Chain: wait for previous speak to finish, then run ours
    const prev = this._speakChain
    let release!: () => void
    this._speakChain = new Promise<void>(r => { release = r })

    await prev

    try {
      await this._speakTextInner(text)
    } finally {
      release()
    }
  }

  /** Inner speak logic — always runs serialized via _speakChain. */
  private async _speakTextInner(text: string): Promise<void> {
    // Check voice preference — skip Piper and go straight to macOS if preferred
    const voicePref = configStore.get('ttsVoice') ?? 'local'
    if (voicePref === 'macos') {
      this.conversation?.speakEchoGuardOnly()
      await this.speakViaMacosSay(text)
      this.conversation?.releaseEchoGuard()
      return
    }

    // Try PiperTTS first
    try {
      // Lazy-init PiperTTS if needed (session mode starts with skipTTS)
      if (!this.piperTTS) {
        const appNodeModules = path.join(__dirname, '..', '..', '..', '..', 'node_modules')
        this.piperTTS = new PiperTTS({
          voice: this.config.piperVoice,
          modelsDir: this.config.piperModelsDir,
          nodeModulesPath: appNodeModules,
        })
        await this.piperTTS.init()
        if (this.conversation) {
          this.conversation.setTTS(this.piperTTS)
        }
      }

      // Speak via ConversationEngine if available, else directly via PiperTTS
      let piperProducedAudio = false
      if (this.conversation) {
        piperProducedAudio = await this.conversation.speakResponse(text)
      } else {
        for await (const wavChunk of this.piperTTS.speak(text)) {
          piperProducedAudio = true
          if (this.transport) {
            this.transport.sendAudioPlayback(wavChunk.toString('base64'))
          } else {
            // Transport-less playback: write WAV to temp file and play via afplay
            await this.playWavViaAfplay(wavChunk)
          }
        }
      }

      if (piperProducedAudio) return
      console.warn('[VoiceManager] PiperTTS produced no audio, falling back to macOS say')
    } catch (err) {
      console.warn('[VoiceManager] PiperTTS failed, falling back to macOS say:', (err as Error).message)
      this.piperTTS = null
    }

    // Fallback: macOS say (direct, no renderer pipeline needed)
    this.conversation?.speakEchoGuardOnly()
    await this.speakViaMacosSay(text)
    this.conversation?.releaseEchoGuard()
  }

  /** Play a WAV buffer via macOS afplay — transport-less Piper playback. */
  private afplayProcess: import('child_process').ChildProcess | null = null

  private playWavViaAfplay(wavBuffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const os = require('os')
      const fs = require('fs')
      const tmpFile = path.join(os.tmpdir(), `cipher-mux-tts-${Date.now()}.wav`)
      fs.writeFileSync(tmpFile, wavBuffer)
      const { execFile } = require('child_process')
      this.afplayProcess = execFile('afplay', [tmpFile], (err: Error | null) => {
        this.afplayProcess = null
        // Clean up temp file
        try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
        if (err && (err as any).killed) {
          resolve()
        } else if (err) {
          console.error('[VoiceManager] afplay failed:', err.message)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /** Fallback TTS via macOS `say` command — simple and reliable. */
  private sayProcess: import('child_process').ChildProcess | null = null

  private speakViaMacosSay(text: string): Promise<void> {
    // Kill any running say process before starting a new one
    this.stopMacosSay()
    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process')
      this.sayProcess = execFile('say', [text], (err: Error | null) => {
        this.sayProcess = null
        if (err && (err as any).killed) {
          resolve() // intentionally killed via stop — not an error
        } else if (err) {
          console.error('[VoiceManager] macOS say failed:', err.message)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /** Stop all TTS playback (Piper + macOS say + afplay). Called by tts:stop IPC and Escape barge-in. */
  stopSpeech(): void {
    if (this.piperTTS) this.piperTTS.stop()
    this.stopMacosSay()
    this.stopAfplay()
    if (this.transport) this.transport.sendStopPlayback()
    // Transition state machine back to READY after barge-in so next TTS works
    if (this.conversation && this.conversation.state === VoiceState.AGENT_SPEAKING) {
      this.conversation.stateMachine.transition(VoiceState.READY)
    }
  }

  /** Stop any running macOS `say` process. */
  private stopMacosSay(): void {
    if (this.sayProcess) {
      try { this.sayProcess.kill('SIGTERM') } catch { /* ignore */ }
      this.sayProcess = null
    }
  }

  /** Stop any running afplay process (transport-less Piper playback). */
  private stopAfplay(): void {
    if (this.afplayProcess) {
      try { this.afplayProcess.kill('SIGTERM') } catch { /* ignore */ }
      this.afplayProcess = null
    }
  }

  /** Shut down all subsystems and release references */
  shutdown(): void {
    this._initialized = false
    this.stopMacosSay()
    this.stopAfplay()

    if (this.outputRouter) {
      this.outputRouter.shutdown()
      this.outputRouter = null
    }

    if (this.inputRouter) {
      this.inputRouter.removeAllListeners()
      this.inputRouter = null
    }

    if (this.interview) {
      this.interview.removeAllListeners()
      this.interview = null
    }

    if (this.conversation) {
      this.conversation.shutdown()
      this.conversation = null
    }

    if (this.piperTTS) {
      this.piperTTS.shutdown()
      this.piperTTS = null
    }

    if (this.sttRouter) {
      this.sttRouter.shutdown()
      this.sttRouter = null
    }

    this.transport = null
    this.removeAllListeners()
  }
}
