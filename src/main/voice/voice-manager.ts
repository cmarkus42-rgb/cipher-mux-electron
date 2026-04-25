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
import { ConversationEngine, type ConversationTransport } from './conversation-engine'
import { VoiceState } from './voice-state'
import { OllamaChat } from './ollama-chat'
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
const DEFAULT_OLLAMA_HOST = '127.0.0.1'
const DEFAULT_OLLAMA_PORT = 11433
const DEFAULT_OLLAMA_MODEL = 'cipher-gemma4:latest'

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

    this.config = {
      whisperModelDir: config?.whisperModelDir
        ?? path.join(userDataDir, 'models', 'whisper'),
      piperModelsDir: config?.piperModelsDir
        ?? path.join(userDataDir, 'models', 'piper'),
      piperVoice: config?.piperVoice ?? DEFAULT_PIPER_VOICE,
      ollamaHost: config?.ollamaHost ?? DEFAULT_OLLAMA_HOST,
      ollamaPort: config?.ollamaPort ?? DEFAULT_OLLAMA_PORT,
      ollamaModel: config?.ollamaModel ?? DEFAULT_OLLAMA_MODEL,
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
   * Start a bugreport interview session.
   * Creates an OllamaChat with the bugreport system prompt,
   * wires transcription → interview → TTS playback.
   */
  startInterview(): BugreportInterview {
    if (!this._initialized || !this.conversation) {
      throw new Error('VoiceManager: not initialized. Call init() first.')
    }

    const chat = new OllamaChat({
      model: this.config.ollamaModel,
      host: this.config.ollamaHost,
      port: this.config.ollamaPort,
      systemPrompt: BUGREPORT_SYSTEM_PROMPT,
    })
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

    // Set up voice output router for TTS playback of voice-relay responses
    this.outputRouter = new VoiceOutputRouter(sessionManager)
    if (this.conversation) {
      this.outputRouter.setConversationEngine(this.conversation)
    }
    // Start output polling if voice-relay entity is already running
    if (sessionManager.isEntityRunning('voice-relay')) {
      this.outputRouter.start()
    }

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

  /** Shut down all subsystems and release references */
  shutdown(): void {
    this._initialized = false

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
