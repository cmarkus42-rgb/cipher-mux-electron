/**
 * STT Engine — Whisper.cpp wrapper with hallucination/noise filtering
 *
 * Uses @fugood/whisper.node for local speech-to-text.
 * The native module is lazy-imported and only required at runtime.
 * Pure filtering functions are exported separately for testing.
 *
 * ## Voice Setup (native modules)
 *
 * Voice requires native modules compiled for Electron's ABI:
 *
 *   1. Install:  npm install @fugood/whisper.node sherpa-onnx-node
 *   2. Rebuild:  npm run rebuild:voice
 *   3. Model:    scripts/download-models.sh  (downloads ggml-small.bin to ~/.config/cipher-mux/models/whisper/)
 *
 * After `npm run test` the native modules get rebuilt for Node.js ABI.
 * Before running the app again, either `npm start` (prestart hook rebuilds
 * better-sqlite3 for Electron) or run `npm run rebuild:voice` explicitly.
 *
 * ABI mismatch symptoms: "Voice not available — whisper.node ABI-Mismatch"
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

/**
 * Exact-match blocklist for common Whisper hallucinations on silence/noise.
 * Compared case-insensitively against trimmed transcription (with trailing
 * punctuation stripped for matching).
 */
export const HALLUCINATION_BLOCKLIST: string[] = [
  'verwendet.',
  'verwendet',
  'untertitel von',
  'danke fürs zuschauen',
  'danke fuers zuschauen',
  'vielen dank.',
  'vielen dank',
  'swr 2021',
  'swr 2022',
]

/** Inline markers to strip (bracketed/parenthesised annotations, music notes) */
const HALLUCINATION_STRIP_RE = /\[.*?\]|\(.*?\)|♪.*?♪/g

/** Text consisting only of punctuation and whitespace */
const NOISE_RE = /^[.,!?\-\u2013\u2014\u2026\s]+$/

/**
 * Coding-terminology bias prompt for Whisper.
 * WHY: Whisper often misrecognizes programming terms as natural language
 * (e.g., "const" → "Konst", "async" → "a sync"). Providing a prompt with
 * common coding vocabulary biases the decoder toward these tokens.
 * Used only in session-input mode — not in bugreport mode where natural
 * language transcription quality matters more.
 */
export const CODING_BIAS_PROMPT =
  'programming: function, variable, class, return, async, await, ' +
  'TypeScript, React, import, export, const, let, interface, component'

/**
 * Filter known Whisper hallucination patterns.
 * Returns cleaned text or '' if the input is a hallucination.
 */
export function filterHallucinations(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''

  if (HALLUCINATION_RE.test(trimmed)) return ''

  // Exact-match blocklist (case-insensitive)
  const lower = trimmed.toLowerCase()
  if (HALLUCINATION_BLOCKLIST.some(h => lower === h)) return ''

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

/**
 * Local speech-to-text engine wrapping whisper.node (Whisper.cpp).
 *
 * Expects 16-bit PCM audio at 16 kHz mono. Applies hallucination and noise
 * filtering to the raw transcription before returning results.
 */
export class STTEngine extends EventEmitter {
  private readonly modelDir: string
  private readonly modelName: string
  private readonly language: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- whisper.node context is untyped
  private context: any = null
  private ready = false

  constructor(opts: STTEngineOptions) {
    super()
    this.modelDir = opts.modelDir
    this.modelName = opts.model ?? 'ggml-small.bin'
    const lang = opts.language ?? ''
    this.language = lang === 'auto' ? '' : (lang || 'de')
  }

  /** Full path to the GGML model file */
  get modelPath(): string {
    return path.join(this.modelDir, this.modelName)
  }

  /**
   * Initialize whisper.node context with GPU acceleration.
   * Throws if the native module is unavailable or model is missing.
   */
  async init(): Promise<void> {
    if (this.ready) return

    // Check model file
    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`Whisper model not found: ${this.modelPath}`)
    }

    // Lazy import and init context — native module may not be installed
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { initWhisper } = require('@fugood/whisper.node')
      this.context = await initWhisper({
        filePath: this.modelPath,
        useGpu: true,
      })
      console.log('[STT] whisper.node context initialized (GPU enabled)')
    } catch (err) {
      throw new Error(
        `Failed to init whisper.node: ${(err as Error).message}`
      )
    }

    this.ready = true
    this.emit('ready')
  }

  /**
   * Transcribe a PCM audio buffer (16-bit, 16 kHz, mono).
   * Returns filtered text or '' if hallucination/noise.
   */
  async transcribe(pcmBuffer: Buffer, prompt?: string): Promise<string> {
    if (!this.ready || !this.context) {
      throw new Error('STTEngine not initialized — call init() first')
    }

    // Pass raw ArrayBuffer to whisper.node (expects Int16 PCM)
    const arrayBuffer = pcmBuffer.buffer.slice(
      pcmBuffer.byteOffset,
      pcmBuffer.byteOffset + pcmBuffer.byteLength
    )

    const { promise } = this.context.transcribeData(arrayBuffer, {
      language: this.language,
      maxLen: 1,
      tokenTimestamps: false,
      ...(prompt ? { prompt } : {}),
    })
    const { result } = await promise

    const raw: string = (result || '').trim()

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
    this.context = null
    this.emit('shutdown')
    this.removeAllListeners()
  }
}
