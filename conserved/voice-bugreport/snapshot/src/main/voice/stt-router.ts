/**
 * STT Router — local-only speech-to-text routing layer
 *
 * Simplified port from cipher-desktop: only local Whisper via STTEngine.
 * The router interface is preserved so cloud STT providers could be
 * added later without changing the consumer API.
 */

import { EventEmitter } from 'node:events'
import { STTEngine, type STTEngineOptions } from './stt-engine'

export interface STTRouterConfig {
  local: STTEngineOptions
  onStatusChange?: (msg: string, level: string) => void
}

export class STTRouter extends EventEmitter {
  private readonly engine: STTEngine
  private readonly onStatus: ((msg: string, level: string) => void) | undefined

  constructor(config: STTRouterConfig) {
    super()
    this.engine = new STTEngine(config.local)
    this.onStatus = config.onStatusChange
  }

  /**
   * Initialize the local STT engine.
   * Reports status via the onStatusChange callback.
   */
  async init(): Promise<void> {
    this.onStatus?.('Initializing local STT engine…', 'info')
    try {
      await this.engine.init()
      this.onStatus?.('Local STT engine ready', 'info')
    } catch (err) {
      const msg = `STT init failed: ${(err as Error).message}`
      this.onStatus?.(msg, 'error')
      throw err
    }
  }

  /** Whether the underlying engine is initialized and ready */
  isReady(): boolean {
    return this.engine.isReady()
  }

  /** Always 'local' — cipher-mux only supports local Whisper */
  activeProvider(): 'local' {
    return 'local'
  }

  /**
   * Transcribe a PCM audio buffer (16-bit, 16 kHz, mono).
   * Delegates to the local STTEngine.
   */
  async transcribeBatch(pcmBuffer: Buffer): Promise<string> {
    return this.engine.transcribe(pcmBuffer)
  }

  /** Shut down the engine and remove all listeners */
  shutdown(): void {
    this.engine.shutdown()
    this.removeAllListeners()
  }
}
