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
import { OllamaChat } from './ollama-chat'
import { BugreportInterview, BUGREPORT_SYSTEM_PROMPT } from './bugreport-interview'

// Optional import — app may not be available in all contexts (e.g. tests)
let electronApp: { getPath(name: string): string } | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  electronApp = require('electron').app
} catch {
  // Not running in Electron context
}

export interface VoiceManagerConfig {
  whisperModelDir?: string
  piperModelsDir?: string
  piperVoice?: string
  ollamaHost?: string
  ollamaPort?: number
  ollamaModel?: string
}

const DEFAULT_PIPER_VOICE = 'de_DE-dii-high'
const DEFAULT_OLLAMA_HOST = '127.0.0.1'
const DEFAULT_OLLAMA_PORT = 11433
const DEFAULT_OLLAMA_MODEL = 'gemma3:4b'

export class VoiceManager extends EventEmitter {
  private readonly config: Required<VoiceManagerConfig>
  private sttRouter: STTRouter | null = null
  private piperTTS: PiperTTS | null = null
  private conversation: ConversationEngine | null = null
  private interview: BugreportInterview | null = null
  private transport: ConversationTransport | null = null
  private _initialized = false

  constructor(config?: VoiceManagerConfig) {
    super()

    const userDataDir = electronApp?.getPath?.('userData')
      ?? path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'cipher-mux')

    this.config = {
      whisperModelDir: config?.whisperModelDir
        ?? path.join(userDataDir, 'models', 'whisper'),
      piperModelsDir: config?.piperModelsDir
        ?? path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'cipher-desktop', 'models', 'piper'),
      piperVoice: config?.piperVoice ?? DEFAULT_PIPER_VOICE,
      ollamaHost: config?.ollamaHost ?? DEFAULT_OLLAMA_HOST,
      ollamaPort: config?.ollamaPort ?? DEFAULT_OLLAMA_PORT,
      ollamaModel: config?.ollamaModel ?? DEFAULT_OLLAMA_MODEL,
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
    if (!this.transport) {
      throw new Error('VoiceManager: transport must be set before init(). Call setTransport() first.')
    }

    // 1. Init STTRouter
    this.sttRouter = new STTRouter({
      local: { modelDir: this.config.whisperModelDir },
      onStatusChange: (msg, level) => {
        this.emit('status', msg, level)
      },
    })
    await this.sttRouter.init()

    // 2. Init PiperTTS
    const appNodeModules = path.join(__dirname, '..', '..', '..', '..', 'node_modules')
    this.piperTTS = new PiperTTS({
      voice: this.config.piperVoice,
      modelsDir: this.config.piperModelsDir,
      nodeModulesPath: appNodeModules,
    })
    await this.piperTTS.init()

    // 3. Create ConversationEngine
    this.conversation = new ConversationEngine({
      sttRouter: this.sttRouter,
      transport: this.transport,
    })

    // 4. Set TTS on conversation engine
    this.conversation.setTTS(this.piperTTS)

    this._initialized = true
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

    // 1. Create OllamaChat with bugreport system prompt
    const chat = new OllamaChat({
      model: this.config.ollamaModel,
      host: this.config.ollamaHost,
      port: this.config.ollamaPort,
      systemPrompt: BUGREPORT_SYSTEM_PROMPT,
    })

    // 2. Create BugreportInterview
    this.interview = new BugreportInterview(chat)

    // 3. Wire conversation transcription → interview
    // Remove any previous listener from a prior interview
    this.conversation.removeAllListeners('transcription')
    const onTranscription = (text: string): void => {
      this.interview?.onUserTranscription(text)
    }
    this.conversation.on('transcription', onTranscription)

    // 4. Wire interview agent-speaking → conversation TTS playback
    const onAgentSpeaking = (text: string): void => {
      this.conversation?.speakResponse(text)
    }
    this.interview.on('agent-speaking', onAgentSpeaking)

    // Forward interview events
    this.interview.on('interview-complete', (report: string) => {
      this.emit('interview-complete', report)
    })
    this.interview.on('turn-update', (data: unknown) => {
      this.emit('turn-update', data)
    })
    this.interview.on('error', (err: Error) => {
      this.emit('error', err)
    })

    return this.interview
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
