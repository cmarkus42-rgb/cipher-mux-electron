/**
 * STT Engine — Whisper.cpp wrapper with hallucination/noise filtering
 *
 * Uses @fugood/whisper.node for local speech-to-text.
 * The native module is lazy-imported and only required at runtime.
 * Pure filtering functions are exported separately for testing.
 */

import { EventEmitter } from 'node:events'
import path from 'node:path'
import fs from 'node:fs'

// ---------------------------------------------------------------------------
// Hallucination & Noise Filters (pure functions)
// ---------------------------------------------------------------------------

/** Whisper produces these on silence/noise — full-line hallucinations */
const HALLUCINATION_RE =
  /^\s*(\[.*?\]|\(.*?\)|♪.*?♪|Musik|Gesang|Music|Singing|Untertitel|Subtitles|Vielen Dank|Thank you|Thanks for watching|\.{2,}|MoU|SWR|ZDF|ARD)\s*$/i

/** Inline markers to strip (bracketed/parenthesised annotations, music notes) */
const HALLUCINATION_STRIP_RE = /\[.*?\]|\(.*?\)|♪.*?♪/g

/** Text consisting only of punctuation and whitespace */
const NOISE_RE = /^[.,!?\-\u2013\u2014\u2026\s]+$/

/**
 * Filter known Whisper hallucination patterns.
 * Returns cleaned text or '' if the input is a hallucination.
 */
export function filterHallucinations(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''

  if (HALLUCINATION_RE.test(trimmed)) return ''

  const cleaned = trimmed.replace(HALLUCINATION_STRIP_RE, '').trim()
  return cleaned
}

/**
 * Returns true if text is noise — fewer than 2 meaningful characters
 * or only punctuation/whitespace.
 */
export function isNoiseOnly(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2) return true
  return NOISE_RE.test(trimmed)
}

// ---------------------------------------------------------------------------
// STTEngine class
// ---------------------------------------------------------------------------

export interface STTEngineOptions {
  modelDir: string
  model?: string      // default: 'ggml-small.bin'
  language?: string   // default: '' (auto-detect)
}

export class STTEngine extends EventEmitter {
  private readonly modelDir: string
  private readonly modelName: string
  private readonly language: string
  private whisper: any = null
  private ready = false

  constructor(opts: STTEngineOptions) {
    super()
    this.modelDir = opts.modelDir
    this.modelName = opts.model ?? 'ggml-small.bin'
    this.language = opts.language ?? ''
  }

  /** Full path to the GGML model file */
  get modelPath(): string {
    return path.join(this.modelDir, this.modelName)
  }

  /**
   * Lazy-import @fugood/whisper.node and verify model file exists.
   * Throws if the native module is unavailable or model is missing.
   */
  async init(): Promise<void> {
    if (this.ready) return

    // Check model file
    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`Whisper model not found: ${this.modelPath}`)
    }

    // Lazy import — native module may not be installed
    try {
      this.whisper = await import('@fugood/whisper.node')
    } catch (err) {
      throw new Error(
        `Failed to load @fugood/whisper.node: ${(err as Error).message}`
      )
    }

    this.ready = true
    this.emit('ready')
  }

  /**
   * Transcribe a PCM audio buffer (16-bit, 16 kHz, mono).
   * Returns filtered text or '' if hallucination/noise.
   */
  async transcribe(pcmBuffer: Buffer): Promise<string> {
    if (!this.ready || !this.whisper) {
      throw new Error('STTEngine not initialized — call init() first')
    }

    const float32 = new Float32Array(pcmBuffer.length / 2)
    for (let i = 0; i < float32.length; i++) {
      float32[i] = pcmBuffer.readInt16LE(i * 2) / 32768.0
    }

    const result = await this.whisper.transcribe(this.modelPath, float32, {
      language: this.language || undefined,
    })

    const raw: string = typeof result === 'string' ? result : result?.text ?? ''

    const filtered = filterHallucinations(raw)
    if (filtered === '' || isNoiseOnly(filtered)) return ''

    return filtered
  }

  /** Whether the engine is initialized and ready for transcription */
  isReady(): boolean {
    return this.ready
  }

  /** Shut down the engine and release resources */
  shutdown(): void {
    this.ready = false
    this.whisper = null
    this.emit('shutdown')
    this.removeAllListeners()
  }
}
