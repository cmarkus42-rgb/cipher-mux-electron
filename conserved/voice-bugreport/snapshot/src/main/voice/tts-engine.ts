/**
 * TTSEngine — Abstract base class for text-to-speech engines.
 *
 * Concrete implementations (e.g. PiperTTS) extend this class and provide
 * streaming WAV output via the async generator speak() method.
 */

export abstract class TTSEngine {
  protected config: Record<string, unknown>

  constructor(config?: Record<string, unknown>) {
    this.config = config ?? {}
  }

  /** Initialize the engine (load model, spawn worker, etc.) */
  abstract init(): Promise<void>

  /** Yield WAV chunks — one per sentence or segment */
  abstract speak(text: string): AsyncGenerator<Buffer>

  /** Interrupt current speech generation */
  abstract stop(): void

  /** Whether the engine is initialized and ready */
  abstract isReady(): boolean

  /** Shut down the engine and release all resources */
  abstract shutdown(): void
}
