# Phase 7b — Voice-Bugreport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port cipher-desktop voice pipeline to cipher-mux-electron (JS→TS, audited), add mic button to BugreportDialog that starts a voice conversation with Gemma 4 (via Ollama) to interview the user about a bug and generate a structured report.

**Architecture:** AudioWorklet captures 16kHz PCM → Main process runs Whisper STT (Metal GPU) → transcription feeds into Ollama Chat API (Gemma 4) for multi-turn bug interview → Piper TTS speaks Gemma's responses back → after 2-3 turns Gemma generates structured report → report lands in BugreportDialog textarea for editing.

**Tech Stack:** Electron (Main + Renderer), TypeScript, Preact, `@fugood/whisper.node` (STT), `sherpa-onnx-node` (TTS/Piper), Ollama Chat API (Gemma 4), AudioWorklet API

**Source:** Ported from `cipher-desktop-electron/src/voice-core/` (CommonJS/JS → TypeScript), audited for publication.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/main/voice/voice-state.ts` | Port + TS | FSM: idle→ready→recording→processing→agent_speaking |
| `src/main/voice/audio-utils.ts` | Port + TS | Float32→Int16 PCM, pcmToWav |
| `src/main/voice/stt-engine.ts` | Port + TS | Whisper.cpp STT with Metal GPU, hallucination filtering |
| `src/main/voice/stt-router.ts` | Port + Simplify | STT provider abstraction (local only, no cloud) |
| `src/main/voice/tts-engine.ts` | Port + TS | Abstract TTS interface (AsyncGenerator) |
| `src/main/voice/tts-piper.ts` | Port + TS | Piper VITS via sherpa-onnx child process |
| `src/main/voice/piper-worker.js` | Port (JS) | Child process worker for sherpa-onnx (System Node.js) |
| `src/main/voice/conversation-engine.ts` | Port + Simplify | Turn management: toggle-to-speak, no barge-in/VAD/echo-guard |
| `src/main/voice/ollama-chat.ts` | New | Multi-turn chat client for Ollama `/api/chat` |
| `src/main/voice/bugreport-interview.ts` | New | Bug interview logic: system prompt, turn routing, report detection |
| `src/main/voice/voice-manager.ts` | New | Orchestrator: init STT+TTS, wire conversation engine |
| `src/renderer/voice/audio-capture-worklet.js` | Port (JS) | AudioWorklet: capture, downsample to 16kHz Int16 PCM |
| `src/renderer/voice/use-voice-bugreport.ts` | New | Preact hook for voice bugreport UI state |
| `src/renderer/components/BugreportDialog.tsx` | Modify | Add mic button, chat bubbles, voice states |
| `src/shared/ipc-channels.ts` | Modify | Add voice IPC channel constants |
| `src/main/preload.ts` | Modify | Expose voice API to renderer |
| `src/main/ipc-hub.ts` | Modify | Wire voice IPC handlers |
| `scripts/download-models.sh` | New | Download Whisper + Piper models |
| `test/main/voice-state.test.ts` | New | ~5 tests |
| `test/main/audio-utils.test.ts` | New | ~3 tests |
| `test/main/ollama-chat.test.ts` | New | ~4 tests |
| `test/main/bugreport-interview.test.ts` | New | ~4 tests |
| `test/main/stt-engine.test.ts` | New | ~2 tests |

---

### Task 1: Voice State Machine + Audio Utils (Foundation)

**Files:**
- Create: `src/main/voice/voice-state.ts`
- Create: `src/main/voice/audio-utils.ts`
- Create: `test/main/voice-state.test.ts`
- Create: `test/main/audio-utils.test.ts`

- [ ] **Step 1: Write voice-state tests**

```typescript
// test/main/voice-state.test.ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { VoiceStateMachine, VoiceState } from '../../src/main/voice/voice-state'

describe('VoiceStateMachine', () => {
  let fsm: VoiceStateMachine

  beforeEach(() => {
    fsm = new VoiceStateMachine()
  })

  it('starts in idle state', () => {
    assert.equal(fsm.state, VoiceState.IDLE)
  })

  it('allows valid transitions', () => {
    assert.equal(fsm.transition(VoiceState.READY), true)
    assert.equal(fsm.state, VoiceState.READY)
    assert.equal(fsm.transition(VoiceState.RECORDING), true)
    assert.equal(fsm.state, VoiceState.RECORDING)
  })

  it('rejects invalid transitions', () => {
    // idle → processing is not valid
    assert.equal(fsm.transition(VoiceState.PROCESSING), false)
    assert.equal(fsm.state, VoiceState.IDLE)
  })

  it('calls onTransition callback on valid transition', () => {
    const transitions: Array<{ from: string; to: string }> = []
    fsm.onTransition((to, from) => transitions.push({ from, to }))
    fsm.transition(VoiceState.READY)
    assert.equal(transitions.length, 1)
    assert.equal(transitions[0].from, VoiceState.IDLE)
    assert.equal(transitions[0].to, VoiceState.READY)
  })

  it('reset goes back to idle', () => {
    fsm.transition(VoiceState.READY)
    fsm.transition(VoiceState.RECORDING)
    fsm.reset()
    assert.equal(fsm.state, VoiceState.IDLE)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "VoiceStateMachine"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement voice-state.ts**

```typescript
// src/main/voice/voice-state.ts

export enum VoiceState {
  IDLE = 'idle',
  READY = 'ready',
  RECORDING = 'recording',
  PROCESSING = 'processing',
  AGENT_SPEAKING = 'agent_speaking',
  ERROR = 'error',
}

const VALID_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  [VoiceState.IDLE]: [VoiceState.READY],
  [VoiceState.READY]: [VoiceState.RECORDING, VoiceState.IDLE],
  [VoiceState.RECORDING]: [VoiceState.PROCESSING, VoiceState.READY, VoiceState.IDLE],
  [VoiceState.PROCESSING]: [VoiceState.AGENT_SPEAKING, VoiceState.READY, VoiceState.IDLE, VoiceState.ERROR],
  [VoiceState.AGENT_SPEAKING]: [VoiceState.READY, VoiceState.IDLE],
  [VoiceState.ERROR]: [VoiceState.READY, VoiceState.IDLE],
}

type TransitionCallback = (newState: VoiceState, oldState: VoiceState) => void

export class VoiceStateMachine {
  private _state: VoiceState = VoiceState.IDLE
  private _listeners: TransitionCallback[] = []

  get state(): VoiceState {
    return this._state
  }

  transition(newState: VoiceState): boolean {
    const allowed = VALID_TRANSITIONS[this._state]
    if (!allowed || !allowed.includes(newState)) {
      return false
    }
    const oldState = this._state
    this._state = newState
    for (const cb of this._listeners) {
      cb(newState, oldState)
    }
    return true
  }

  onTransition(cb: TransitionCallback): void {
    this._listeners.push(cb)
  }

  reset(): void {
    const oldState = this._state
    this._state = VoiceState.IDLE
    if (oldState !== VoiceState.IDLE) {
      for (const cb of this._listeners) {
        cb(VoiceState.IDLE, oldState)
      }
    }
  }
}
```

- [ ] **Step 4: Run voice-state tests**

Run: `npm test -- --test-name-pattern "VoiceStateMachine"`
Expected: 5 PASS

- [ ] **Step 5: Write audio-utils tests**

```typescript
// test/main/audio-utils.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pcmToWav } from '../../src/main/voice/audio-utils'

describe('pcmToWav', () => {
  it('creates valid WAV header from Float32 PCM', () => {
    const pcm = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0])
    const wav = pcmToWav(pcm, 16000)
    // RIFF header
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
    assert.equal(wav.toString('ascii', 12, 16), 'fmt ')
    // 16-bit PCM format
    assert.equal(wav.readUInt16LE(20), 1) // PCM format
    assert.equal(wav.readUInt16LE(22), 1) // mono
    assert.equal(wav.readUInt32LE(24), 16000) // sample rate
    assert.equal(wav.readUInt16LE(34), 16) // bits per sample
    // Data size: 5 samples * 2 bytes = 10
    assert.equal(wav.readUInt32LE(40), 10)
    assert.equal(wav.length, 44 + 10) // header + data
  })

  it('converts Float32 samples to Int16 correctly', () => {
    const pcm = new Float32Array([0.0, 1.0, -1.0])
    const wav = pcmToWav(pcm, 16000)
    // Read Int16 samples after 44-byte header
    assert.equal(wav.readInt16LE(44), 0)       // 0.0 → 0
    assert.equal(wav.readInt16LE(46), 32767)   // 1.0 → 32767
    assert.equal(wav.readInt16LE(48), -32768)  // -1.0 → -32768
  })

  it('throws on empty PCM data', () => {
    assert.throws(() => pcmToWav(new Float32Array(0), 16000), /empty/i)
  })
})
```

- [ ] **Step 6: Run audio-utils tests to verify they fail**

Run: `npm test -- --test-name-pattern "pcmToWav"`
Expected: FAIL — module not found

- [ ] **Step 7: Implement audio-utils.ts**

```typescript
// src/main/voice/audio-utils.ts

/**
 * Convert Float32 PCM samples to a complete WAV file buffer.
 * Input: Float32 in [-1.0, 1.0], mono.
 * Output: 16-bit PCM WAV with RIFF header.
 */
export function pcmToWav(pcmData: Float32Array, sampleRate: number): Buffer {
  if (!pcmData || pcmData.length === 0) {
    throw new Error('Empty PCM data')
  }

  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const dataSize = pcmData.length * bytesPerSample
  const headerSize = 44
  const buffer = Buffer.alloc(headerSize + dataSize)

  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(headerSize - 8 + dataSize, 4)
  buffer.write('WAVE', 8)

  // fmt chunk
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)                               // chunk size
  buffer.writeUInt16LE(1, 20)                                 // PCM format
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28) // byte rate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32)      // block align
  buffer.writeUInt16LE(bitsPerSample, 34)

  // data chunk
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  // Convert Float32 → Int16
  for (let i = 0; i < pcmData.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcmData[i]))
    const int16 = sample >= 0
      ? Math.round(sample * 32767)
      : Math.round(sample * 32768)
    buffer.writeInt16LE(int16, headerSize + i * bytesPerSample)
  }

  return buffer
}
```

- [ ] **Step 8: Run audio-utils tests**

Run: `npm test -- --test-name-pattern "pcmToWav"`
Expected: 3 PASS

- [ ] **Step 9: Run full test suite**

Run: `npm test`
Expected: All existing + 8 new tests PASS

- [ ] **Step 10: Commit**

```bash
git add src/main/voice/voice-state.ts src/main/voice/audio-utils.ts test/main/voice-state.test.ts test/main/audio-utils.test.ts
git commit -m "feat(voice): Task 1 — voice state machine + audio utils (TS port)"
```

---

### Task 2: STT Engine (Whisper.cpp)

**Files:**
- Create: `src/main/voice/stt-engine.ts`
- Create: `test/main/stt-engine.test.ts`

- [ ] **Step 1: Write stt-engine tests**

```typescript
// test/main/stt-engine.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { filterHallucinations, isNoiseOnly } from '../../src/main/voice/stt-engine'

describe('STT Engine — hallucination filtering', () => {
  it('detects hallucination patterns', () => {
    assert.equal(filterHallucinations('[Musik]'), '')
    assert.equal(filterHallucinations('(Gesang)'), '')
    assert.equal(filterHallucinations('♪ lalala ♪'), '')
    assert.equal(filterHallucinations('Vielen Dank'), '')
    assert.equal(filterHallucinations('Thanks for watching'), '')
    assert.equal(filterHallucinations('Untertitel'), '')
    assert.equal(filterHallucinations('...'), '')
    assert.equal(filterHallucinations('SWR'), '')
  })

  it('passes valid transcriptions through', () => {
    assert.equal(filterHallucinations('Der Button funktioniert nicht'), 'Der Button funktioniert nicht')
    assert.equal(filterHallucinations('Hallo, ich habe einen Bug gefunden'), 'Hallo, ich habe einen Bug gefunden')
  })
})

describe('STT Engine — noise filtering', () => {
  it('rejects punctuation-only text', () => {
    assert.equal(isNoiseOnly('...'), true)
    assert.equal(isNoiseOnly('. . .'), true)
    assert.equal(isNoiseOnly('!?'), true)
    assert.equal(isNoiseOnly('— —'), true)
  })

  it('rejects too-short text', () => {
    assert.equal(isNoiseOnly('a'), true)
    assert.equal(isNoiseOnly(''), true)
  })

  it('accepts normal text', () => {
    assert.equal(isNoiseOnly('Hallo'), false)
    assert.equal(isNoiseOnly('Bug Report'), false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern "STT Engine"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement stt-engine.ts**

```typescript
// src/main/voice/stt-engine.ts
import path from 'node:path'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'

/**
 * Hallucination patterns — Whisper produces these on silence/noise.
 * Matches full-line patterns like [Musik], (Gesang), ♪...♪, broadcaster tags.
 */
const HALLUCINATION_RE = /^\s*(\[.*?\]|\(.*?\)|♪.*?♪|Musik|Gesang|Music|Singing|Untertitel|Subtitles|Vielen Dank|Thank you|Thanks for watching|\.{2,}|MoU|SWR|ZDF|ARD)\s*$/i

/** Inline hallucination markers to strip from otherwise valid text */
const HALLUCINATION_STRIP_RE = /\[.*?\]|\(.*?\)|♪.*?♪/g

/** Punctuation/whitespace-only noise */
const NOISE_RE = /^[.,!?\-–—…\s]+$/

/**
 * Filter Whisper hallucinations. Returns cleaned text or empty string.
 */
export function filterHallucinations(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (HALLUCINATION_RE.test(trimmed)) return ''
  // Strip inline markers
  const cleaned = trimmed.replace(HALLUCINATION_STRIP_RE, '').trim()
  if (!cleaned || HALLUCINATION_RE.test(cleaned)) return ''
  return cleaned
}

/**
 * Check if text is noise-only (too short or only punctuation).
 */
export function isNoiseOnly(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2) return true
  if (NOISE_RE.test(trimmed)) return true
  return false
}

export interface STTEngineOptions {
  modelDir: string
  model?: string
  language?: string
}

/**
 * Local STT via Whisper.cpp with Metal GPU acceleration.
 * Ported from cipher-desktop voice-core/stt-engine.js — audited for publication.
 */
export class STTEngine extends EventEmitter {
  private modelDir: string
  private modelName: string
  private language: string
  private whisper: any = null
  private _ready = false

  constructor(opts: STTEngineOptions) {
    super()
    this.modelDir = opts.modelDir
    this.modelName = opts.model ?? 'ggml-small.bin'
    this.language = opts.language ?? ''
  }

  get modelPath(): string {
    return path.join(this.modelDir, this.modelName)
  }

  async init(): Promise<void> {
    // Lazy-import native module — may not be available in test/CI
    const whisperModule = await import('@fugood/whisper.node')

    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`Whisper model not found: ${this.modelPath}. Run scripts/download-models.sh first.`)
    }

    this.whisper = new whisperModule.Whisper(this.modelPath, { useGpu: true })
    this._ready = true
  }

  /**
   * Transcribe 16kHz Int16 PCM buffer to text.
   * Returns cleaned text with hallucinations filtered, or empty string on noise/silence.
   */
  async transcribe(pcmBuffer: Buffer): Promise<string> {
    if (!this._ready || !this.whisper) {
      throw new Error('STT engine not initialized — call init() first')
    }

    const result = await this.whisper.transcribe(pcmBuffer, {
      language: this.language || undefined,
    })

    const rawText: string = typeof result === 'string' ? result : result?.text ?? ''
    const filtered = filterHallucinations(rawText)
    if (!filtered || isNoiseOnly(filtered)) return ''
    return filtered
  }

  isReady(): boolean {
    return this._ready
  }

  shutdown(): void {
    this.whisper = null
    this._ready = false
  }
}
```

- [ ] **Step 4: Run stt-engine tests**

Run: `npm test -- --test-name-pattern "STT Engine"`
Expected: 4 PASS (unit tests for pure functions — no native module needed)

- [ ] **Step 5: Commit**

```bash
git add src/main/voice/stt-engine.ts test/main/stt-engine.test.ts
git commit -m "feat(voice): Task 2 — STT engine with Whisper.cpp (TS port)"
```

---

### Task 3: STT Router (Simplified — Local Only)

**Files:**
- Create: `src/main/voice/stt-router.ts`

- [ ] **Step 1: Implement stt-router.ts**

```typescript
// src/main/voice/stt-router.ts
import { EventEmitter } from 'node:events'
import { STTEngine, type STTEngineOptions } from './stt-engine'

export interface STTRouterConfig {
  local: STTEngineOptions
  onStatusChange?: (msg: string, level: string) => void
}

/**
 * STT provider abstraction — simplified for cipher-mux (local Whisper only).
 * Cloud providers (Deepgram, ElevenLabs) not included — interface preserved for future.
 * Ported from cipher-desktop voice-core/stt-router.js.
 */
export class STTRouter extends EventEmitter {
  private engine: STTEngine
  private _ready = false
  private onStatusChange?: (msg: string, level: string) => void

  constructor(config: STTRouterConfig) {
    super()
    this.engine = new STTEngine(config.local)
    this.onStatusChange = config.onStatusChange
  }

  async init(): Promise<void> {
    this.onStatusChange?.('Initializing local STT (Whisper)...', 'info')
    try {
      await this.engine.init()
      this._ready = true
      this.onStatusChange?.('STT ready (Whisper local)', 'info')
    } catch (err) {
      this.onStatusChange?.(`STT init failed: ${(err as Error).message}`, 'error')
      throw err
    }
  }

  isReady(): boolean {
    return this._ready
  }

  activeProvider(): 'local' {
    return 'local'
  }

  /**
   * Transcribe a completed audio buffer (batch mode).
   */
  async transcribeBatch(pcmBuffer: Buffer): Promise<string> {
    if (!this._ready) throw new Error('STT router not initialized')
    return this.engine.transcribe(pcmBuffer)
  }

  shutdown(): void {
    this.engine.shutdown()
    this._ready = false
    this.removeAllListeners()
  }
}
```

No dedicated test file — STTRouter is a thin wrapper over STTEngine. The STTEngine tests cover the core logic. Integration tested via E2E.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.main.json 2>&1 | head -20`
Expected: No errors related to voice modules (may have pre-existing warnings)

- [ ] **Step 3: Commit**

```bash
git add src/main/voice/stt-router.ts
git commit -m "feat(voice): Task 3 — STT router (local-only, simplified TS port)"
```

---

### Task 4: TTS Stack (Engine + Piper + Worker)

**Files:**
- Create: `src/main/voice/tts-engine.ts`
- Create: `src/main/voice/tts-piper.ts`
- Create: `src/main/voice/piper-worker.js`

- [ ] **Step 1: Implement tts-engine.ts (abstract base)**

```typescript
// src/main/voice/tts-engine.ts

/**
 * Abstract TTS engine interface.
 * Subclasses implement speak() as AsyncGenerator yielding audio chunks.
 * Ported from cipher-desktop voice-core/tts-engine.js — audited for publication.
 */
export abstract class TTSEngine {
  protected config: Record<string, unknown>

  constructor(config?: Record<string, unknown>) {
    this.config = config ?? {}
  }

  abstract init(): Promise<void>

  /**
   * Generate audio for text. Yields WAV Buffer chunks (one per sentence).
   * Generator can be interrupted via stop().
   */
  abstract speak(text: string): AsyncGenerator<Buffer>

  abstract stop(): void

  abstract isReady(): boolean

  abstract shutdown(): void
}
```

- [ ] **Step 2: Implement piper-worker.js (child process, stays JS)**

```javascript
// src/main/voice/piper-worker.js
//
// Child process for Piper TTS via sherpa-onnx-node.
// Runs under System Node.js (not Electron) — spawned by tts-piper.ts.
// Protocol: JSON messages over IPC (process.send / process.on('message')).
//
// Commands IN:  { cmd: 'init', modelDir, numThreads }
//               { cmd: 'generate', text, sid, speed, id }
//               { cmd: 'shutdown' }
// Messages OUT: { type: 'ready' }
//               { type: 'audio', id, sampleRate, samples (base64 Float32LE) }
//               { type: 'error', id?, message }
//               { type: 'log', level, message }

'use strict'

let tts = null

function log(level, message) {
  if (process.send) process.send({ type: 'log', level, message })
}

async function handleInit(msg) {
  try {
    const sherpa = require('sherpa-onnx-node')
    const fs = require('fs')
    const path = require('path')

    const modelDir = msg.modelDir
    const numThreads = msg.numThreads || 2

    // Find .onnx model file
    const files = fs.readdirSync(modelDir)
    const onnxFile = files.find(f => f.endsWith('.onnx'))
    if (!onnxFile) throw new Error(`No .onnx model file in ${modelDir}`)

    const tokensFile = path.join(modelDir, 'tokens.txt')
    if (!fs.existsSync(tokensFile)) throw new Error(`tokens.txt not found in ${modelDir}`)

    const dataDir = path.join(modelDir, 'espeak-ng-data')

    const config = {
      offlineTtsVitsModelConfig: {
        model: path.join(modelDir, onnxFile),
        tokens: tokensFile,
        dataDir: fs.existsSync(dataDir) ? dataDir : undefined,
      },
      numThreads,
      debug: 0,
    }

    tts = new sherpa.OfflineTts(config)
    log('info', `Piper TTS ready: ${onnxFile}`)
    if (process.send) process.send({ type: 'ready' })
  } catch (err) {
    log('error', `Init failed: ${err.message}`)
    if (process.send) process.send({ type: 'error', message: err.message })
  }
}

function handleGenerate(msg) {
  if (!tts) {
    if (process.send) process.send({ type: 'error', id: msg.id, message: 'TTS not initialized' })
    return
  }

  try {
    const result = tts.generate({
      text: msg.text,
      sid: msg.sid || 0,
      speed: msg.speed || 1.0,
    })

    // Convert Float32Array to base64 for IPC transfer
    const buffer = Buffer.from(result.samples.buffer)
    const b64 = buffer.toString('base64')

    if (process.send) {
      process.send({
        type: 'audio',
        id: msg.id,
        sampleRate: result.sampleRate,
        samples: b64,
      })
    }
  } catch (err) {
    if (process.send) process.send({ type: 'error', id: msg.id, message: err.message })
  }
}

process.on('message', (msg) => {
  switch (msg.cmd) {
    case 'init':
      handleInit(msg)
      break
    case 'generate':
      handleGenerate(msg)
      break
    case 'shutdown':
      log('info', 'Shutting down')
      process.exit(0)
      break
    default:
      log('warn', `Unknown command: ${msg.cmd}`)
  }
})

process.on('disconnect', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))

log('info', 'Piper worker started')
```

- [ ] **Step 3: Implement tts-piper.ts**

```typescript
// src/main/voice/tts-piper.ts
import path from 'node:path'
import fs from 'node:fs'
import { fork, type ChildProcess } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { TTSEngine } from './tts-engine'
import { pcmToWav } from './audio-utils'

const DEFAULT_VOICE = 'de_DE-dii-high'

/**
 * Find system Node.js binary (not Electron's embedded node).
 * Required because sherpa-onnx-node must run under real Node.js.
 */
export function findSystemNode(): string | null {
  const candidates = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ]

  // Check NVM
  const nvmDir = process.env.NVM_DIR
  if (nvmDir) {
    try {
      const defaultAlias = path.join(nvmDir, 'alias', 'default')
      if (fs.existsSync(defaultAlias)) {
        const version = fs.readFileSync(defaultAlias, 'utf-8').trim()
        candidates.unshift(path.join(nvmDir, 'versions', 'node', `v${version}`, 'bin', 'node'))
      }
    } catch { /* ignore */ }
  }

  // Check Volta
  const voltaHome = process.env.VOLTA_HOME
  if (voltaHome) {
    candidates.unshift(path.join(voltaHome, 'bin', 'node'))
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  // Fallback: which node (safe — no user input)
  try {
    const result = execFileSync('which', ['node'], { encoding: 'utf-8' }).trim()
    if (result && fs.existsSync(result)) return result
  } catch { /* ignore */ }

  return null
}

export interface PiperTTSConfig {
  voice?: string
  modelsDir?: string
  numThreads?: number
  nodeModulesPath?: string
}

/**
 * Piper TTS via sherpa-onnx child process.
 * Ported from cipher-desktop voice-core/tts-piper.js — audited for publication.
 */
export class PiperTTS extends TTSEngine {
  private voice: string
  private modelsDir: string
  private numThreads: number
  private nodeModulesPath?: string
  private worker: ChildProcess | null = null
  private _ready = false
  private _interrupted = false
  private pendingRequests = new Map<number, {
    resolve: (value: { sampleRate: number; samples: Float32Array }) => void
    reject: (err: Error) => void
  }>()
  private nextId = 1

  constructor(config?: PiperTTSConfig) {
    super(config)
    this.voice = config?.voice ?? DEFAULT_VOICE
    this.modelsDir = config?.modelsDir ?? path.join(
      process.env.HOME ?? '~',
      'Library/Application Support/cipher-desktop/models/piper'
    )
    this.numThreads = config?.numThreads ?? 2
    this.nodeModulesPath = config?.nodeModulesPath
  }

  async init(): Promise<void> {
    const nodeBin = findSystemNode()
    if (!nodeBin) throw new Error('System Node.js not found — required for Piper TTS')

    const modelDir = path.join(this.modelsDir, `vits-piper-${this.voice}`)
    if (!fs.existsSync(modelDir)) {
      throw new Error(`Piper model not found: ${modelDir}. Run scripts/download-models.sh first.`)
    }

    const workerPath = path.join(__dirname, 'piper-worker.js')

    // Resolve sherpa-onnx-node native lib path for DYLD
    let dyldPath = ''
    const nodeModules = this.nodeModulesPath ?? path.join(process.cwd(), 'node_modules')
    const sherpaDir = path.join(nodeModules, 'sherpa-onnx-node')
    if (fs.existsSync(sherpaDir)) {
      dyldPath = sherpaDir
    }

    this.worker = fork(workerPath, [], {
      execPath: nodeBin,
      env: {
        ...process.env,
        ...(dyldPath ? { DYLD_LIBRARY_PATH: dyldPath } : {}),
        NODE_PATH: nodeModules,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    this.worker.on('message', (msg: any) => {
      switch (msg.type) {
        case 'ready':
          this._ready = true
          break
        case 'audio': {
          const pending = this.pendingRequests.get(msg.id)
          if (pending) {
            const buf = Buffer.from(msg.samples, 'base64')
            const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
            pending.resolve({ sampleRate: msg.sampleRate, samples })
            this.pendingRequests.delete(msg.id)
          }
          break
        }
        case 'error': {
          if (msg.id) {
            const pending = this.pendingRequests.get(msg.id)
            if (pending) {
              pending.reject(new Error(msg.message))
              this.pendingRequests.delete(msg.id)
            }
          }
          break
        }
      }
    })

    this.worker.on('exit', () => {
      this._ready = false
      this.worker = null
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error('Worker exited'))
      }
      this.pendingRequests.clear()
    })

    // Send init command
    this.worker.send({ cmd: 'init', modelDir, numThreads: this.numThreads })

    // Wait for ready (up to 10s)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Piper init timeout (10s)')), 10000)
      const check = setInterval(() => {
        if (this._ready) {
          clearInterval(check)
          clearTimeout(timeout)
          resolve()
        }
      }, 100)
    })
  }

  /**
   * Generate audio for text. Yields WAV buffers, one per sentence.
   */
  async *speak(text: string): AsyncGenerator<Buffer> {
    if (!this._ready || !this.worker) {
      throw new Error('Piper TTS not initialized')
    }

    this._interrupted = false

    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]

    for (const sentence of sentences) {
      if (this._interrupted) break

      const trimmed = sentence.trim()
      if (!trimmed) continue

      const id = this.nextId++
      const result = await new Promise<{ sampleRate: number; samples: Float32Array }>(
        (resolve, reject) => {
          this.pendingRequests.set(id, { resolve, reject })
          this.worker!.send({ cmd: 'generate', text: trimmed, sid: 0, speed: 1.0, id })
        }
      )

      if (this._interrupted) break

      // Convert Float32 PCM → WAV
      yield pcmToWav(result.samples, result.sampleRate)
    }
  }

  stop(): void {
    this._interrupted = true
  }

  isReady(): boolean {
    return this._ready
  }

  shutdown(): void {
    this._interrupted = true
    if (this.worker) {
      this.worker.send({ cmd: 'shutdown' })
      const w = this.worker
      setTimeout(() => { try { w.kill('SIGTERM') } catch { /* ok */ } }, 1000)
      setTimeout(() => { try { w.kill('SIGKILL') } catch { /* ok */ } }, 3000)
      this.worker = null
    }
    this._ready = false
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('TTS shutdown'))
    }
    this.pendingRequests.clear()
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.main.json 2>&1 | head -20`
Expected: No new errors from voice modules

- [ ] **Step 5: Commit**

```bash
git add src/main/voice/tts-engine.ts src/main/voice/tts-piper.ts src/main/voice/piper-worker.js
git commit -m "feat(voice): Task 4 — TTS stack (Piper + sherpa-onnx worker, TS port)"
```

---

### Task 5: Conversation Engine (Simplified — Toggle-to-Speak)

**Files:**
- Create: `src/main/voice/conversation-engine.ts`

- [ ] **Step 1: Implement conversation-engine.ts**

The cipher-desktop conversation engine (782 lines) has many features we don't need (barge-in, echo guard, VAD, cloud endpointing, streaming TTS). This is a simplified port (~200 lines) keeping only toggle-to-speak turn management.

```typescript
// src/main/voice/conversation-engine.ts
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
  maxRecordingMs?: number    // Safety stop (default: 30000ms)
  minAudioBytes?: number     // Minimum buffer size to transcribe (default: 16000)
}

/**
 * Simplified conversation engine — toggle-to-speak only.
 * Ported from cipher-desktop voice-core/conversation-engine.js.
 *
 * Removed: barge-in, echo guard, VAD, cloud endpointing, streaming TTS,
 *          interrupted context tracking, always-listen mode.
 */
export class ConversationEngine extends EventEmitter {
  readonly stateMachine: VoiceStateMachine
  private stt: STTRouter
  private transport: ConversationTransport
  private tts: TTSEngine | null = null
  private audioBuffer: Buffer[] = []
  private maxRecordingMs: number
  private minAudioBytes: number
  private recordingTimer: ReturnType<typeof setTimeout> | null = null
  private _acceptLateChunks = false

  constructor(opts: ConversationEngineOptions) {
    super()
    this.stateMachine = new VoiceStateMachine()
    this.stt = opts.sttRouter
    this.transport = opts.transport
    this.maxRecordingMs = opts.maxRecordingMs ?? 30000
    this.minAudioBytes = opts.minAudioBytes ?? 16000

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

  /**
   * Toggle recording on/off.
   * Idle/Ready → start recording. Recording → stop and process.
   */
  handleToggle(): void {
    const s = this.stateMachine.state
    if (s === VoiceState.IDLE || s === VoiceState.READY) {
      this.startRecording()
    } else if (s === VoiceState.RECORDING) {
      this.stopRecording()
    }
    // During processing/agent_speaking: ignore toggle
  }

  startRecording(): void {
    // Ensure we're in a state that can transition to recording
    if (this.stateMachine.state === VoiceState.IDLE) {
      this.stateMachine.transition(VoiceState.READY)
    }
    if (!this.stateMachine.transition(VoiceState.RECORDING)) return

    this.audioBuffer = []
    this.transport.sendStartCapture()

    // Safety timeout
    this.recordingTimer = setTimeout(() => {
      if (this.stateMachine.state === VoiceState.RECORDING) {
        this.stopRecording()
      }
    }, this.maxRecordingMs)
  }

  stopRecording(): void {
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer)
      this.recordingTimer = null
    }

    if (!this.stateMachine.transition(VoiceState.PROCESSING)) return
    this.transport.sendStopCapture()

    // Accept late-arriving chunks for 200ms
    this._acceptLateChunks = true
    setTimeout(() => {
      this._acceptLateChunks = false
      this.processAudio()
    }, 200)
  }

  /**
   * Receive PCM audio chunk from AudioWorklet (Int16 16kHz).
   */
  receiveAudioChunk(chunk: Buffer | ArrayBuffer): void {
    if (this.stateMachine.state !== VoiceState.RECORDING && !this._acceptLateChunks) return
    const buf = chunk instanceof ArrayBuffer ? Buffer.from(chunk) : chunk
    this.audioBuffer.push(buf)
  }

  private async processAudio(): Promise<void> {
    const totalBytes = this.audioBuffer.reduce((sum, b) => sum + b.length, 0)
    if (totalBytes < this.minAudioBytes) {
      // Too short — go back to ready
      this.stateMachine.transition(VoiceState.READY)
      this.emit('transcription', '')
      return
    }

    const combined = Buffer.concat(this.audioBuffer)
    this.audioBuffer = []

    try {
      const text = await this.stt.transcribeBatch(combined)
      this.emit('transcription', text)
      if (text) {
        this.transport.sendTranscription(text)
      } else {
        // Empty transcription (noise/silence) — go back to ready
        this.stateMachine.transition(VoiceState.READY)
      }
    } catch (err) {
      this.emit('error', err)
      this.stateMachine.transition(VoiceState.ERROR)
      // Try to recover
      setTimeout(() => this.stateMachine.transition(VoiceState.READY), 1000)
    }
  }

  /**
   * Speak a response via TTS. Transitions processing → agent_speaking → ready.
   */
  async speakResponse(text: string): Promise<void> {
    if (!this.tts || !this.tts.isReady()) {
      // No TTS — just transition back
      this.stateMachine.transition(VoiceState.READY)
      return
    }

    this.stateMachine.transition(VoiceState.AGENT_SPEAKING)

    try {
      for await (const wavBuffer of this.tts.speak(text)) {
        if (this.stateMachine.state !== VoiceState.AGENT_SPEAKING) break
        const b64 = wavBuffer.toString('base64')
        this.transport.sendAudioPlayback(b64)
      }
    } catch (err) {
      this.emit('error', err)
    }

    // Transition back to ready when done
    if (this.stateMachine.state === VoiceState.AGENT_SPEAKING) {
      this.stateMachine.transition(VoiceState.READY)
    }
  }

  /**
   * Called by renderer when playback of all queued audio is complete.
   */
  onPlaybackComplete(): void {
    if (this.stateMachine.state === VoiceState.AGENT_SPEAKING) {
      this.stateMachine.transition(VoiceState.READY)
    }
  }

  shutdown(): void {
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer)
      this.recordingTimer = null
    }
    this.audioBuffer = []
    this.stateMachine.reset()
    this.removeAllListeners()
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.main.json 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/main/voice/conversation-engine.ts
git commit -m "feat(voice): Task 5 — conversation engine (toggle-to-speak, simplified TS port)"
```

---

### Task 6: Ollama Chat Client

**Files:**
- Create: `src/main/voice/ollama-chat.ts`
- Create: `test/main/ollama-chat.test.ts`

- [ ] **Step 1: Write ollama-chat tests**

```typescript
// test/main/ollama-chat.test.ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { OllamaChat, type ChatMessage } from '../../src/main/voice/ollama-chat'

describe('OllamaChat', () => {
  let chat: OllamaChat

  beforeEach(() => {
    chat = new OllamaChat({
      model: 'gemma3:4b',
      host: '127.0.0.1',
      port: 11433,
      systemPrompt: 'Du bist ein Test-Assistent.',
    })
  })

  it('initializes with system prompt in history', () => {
    const history = chat.getHistory()
    assert.equal(history.length, 1)
    assert.equal(history[0].role, 'system')
    assert.equal(history[0].content, 'Du bist ein Test-Assistent.')
  })

  it('builds correct message history after injections', () => {
    chat.injectAssistantMessage('Hallo, wie kann ich helfen?')
    chat.injectUserMessage('Ich habe einen Bug.')
    chat.injectAssistantMessage('Kannst du den Bug beschreiben?')

    const history = chat.getHistory()
    assert.equal(history.length, 4) // system + 3 messages
    assert.equal(history[1].role, 'assistant')
    assert.equal(history[2].role, 'user')
    assert.equal(history[3].role, 'assistant')
  })

  it('reset clears history except system prompt', () => {
    chat.injectUserMessage('test')
    chat.injectAssistantMessage('response')
    assert.equal(chat.getHistory().length, 3)

    chat.reset()
    const history = chat.getHistory()
    assert.equal(history.length, 1)
    assert.equal(history[0].role, 'system')
  })

  it('constructs correct URL', () => {
    assert.equal(chat.url, 'http://127.0.0.1:11433/api/chat')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern "OllamaChat"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ollama-chat.ts**

```typescript
// src/main/voice/ollama-chat.ts

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OllamaChatOpts {
  model: string          // e.g. 'gemma3:4b'
  host: string           // e.g. '127.0.0.1'
  port: number           // e.g. 11433
  systemPrompt: string
}

/**
 * Multi-turn chat client for Ollama /api/chat endpoint.
 * Maintains conversation history for coherent multi-turn interviews.
 * Independent from the existing ollama-client.ts (which does batch enrichment).
 */
export class OllamaChat {
  private model: string
  private host: string
  private port: number
  private history: ChatMessage[] = []

  constructor(opts: OllamaChatOpts) {
    this.model = opts.model
    this.host = opts.host
    this.port = opts.port
    this.history = [{ role: 'system', content: opts.systemPrompt }]
  }

  get url(): string {
    return `http://${this.host}:${this.port}/api/chat`
  }

  /**
   * Send a user message and get the assistant response.
   * Appends both to history for multi-turn conversation.
   */
  async send(userMessage: string): Promise<string> {
    this.history.push({ role: 'user', content: userMessage })

    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: this.history,
        stream: false,
      }),
    })

    if (!response.ok) {
      // Remove the user message we just added
      this.history.pop()
      throw new Error(`Ollama chat failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as { message?: { content?: string } }
    const assistantContent = data.message?.content ?? ''

    this.history.push({ role: 'assistant', content: assistantContent })
    return assistantContent
  }

  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  /** Inject a user message into history (for testing). */
  injectUserMessage(content: string): void {
    this.history.push({ role: 'user', content })
  }

  /** Inject an assistant message into history (for testing). */
  injectAssistantMessage(content: string): void {
    this.history.push({ role: 'assistant', content })
  }

  reset(): void {
    const systemPrompt = this.history[0]
    this.history = [systemPrompt]
  }
}
```

- [ ] **Step 4: Run ollama-chat tests**

Run: `npm test -- --test-name-pattern "OllamaChat"`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/voice/ollama-chat.ts test/main/ollama-chat.test.ts
git commit -m "feat(voice): Task 6 — Ollama multi-turn chat client"
```

---

### Task 7: Bugreport Interview Logic

**Files:**
- Create: `src/main/voice/bugreport-interview.ts`
- Create: `test/main/bugreport-interview.test.ts`

- [ ] **Step 1: Write bugreport-interview tests**

```typescript
// test/main/bugreport-interview.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BUGREPORT_SYSTEM_PROMPT, isReportComplete, extractReport } from '../../src/main/voice/bugreport-interview'

describe('BugreportInterview', () => {
  it('system prompt contains required sections', () => {
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Bug-Interview-Assistent'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('cipher-mux'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Steps to Reproduce'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Expected Behavior'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Actual Behavior'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Severity'))
  })

  it('detects complete report in Gemma response', () => {
    const incomplete = 'Kannst du mir mehr über den Bug erzählen?'
    assert.equal(isReportComplete(incomplete), false)

    const complete = `# Terminal scrollt nicht zurück
## Summary
Nach Session-Wechsel scrollt das Terminal nicht mehr zurück.
## Steps to Reproduce
1. Session A öffnen
2. Zu Session B wechseln
3. Zurück zu Session A
## Expected Behavior
Terminal zeigt vorherigen Scroll-Position.
## Actual Behavior
Terminal springt nach unten.
**Severity:** medium
**Tags:** terminal, scroll`
    assert.equal(isReportComplete(complete), true)
  })

  it('extracts report from mixed Gemma response', () => {
    const mixed = `Danke für die Details! Hier ist der Report:

# Grid resize Bug
## Summary
Grid reagiert nicht auf Resize.
## Steps to Reproduce
1. Fenster verkleinern
## Expected Behavior
Grid passt sich an.
## Actual Behavior
Grid bleibt gleich groß.
**Severity:** low
**Tags:** grid, resize

Ich hoffe das hilft!`

    const report = extractReport(mixed)
    assert.ok(report.startsWith('# Grid resize Bug'))
    assert.ok(report.includes('## Summary'))
    assert.ok(report.includes('**Tags:** grid, resize'))
  })

  it('returns empty string when no report found', () => {
    const noReport = 'Kannst du mir mehr Details geben?'
    assert.equal(extractReport(noReport), '')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern "BugreportInterview"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement bugreport-interview.ts**

```typescript
// src/main/voice/bugreport-interview.ts
import { EventEmitter } from 'node:events'
import type { OllamaChat } from './ollama-chat'

/**
 * System prompt for Gemma 4 — guides the bug interview conversation.
 */
export const BUGREPORT_SYSTEM_PROMPT = `Du bist ein Bug-Interview-Assistent für die Anwendung cipher-mux.
Der User beschreibt dir gerade einen Bug den er gefunden hat.

Deine Aufgabe:
1. Höre zu und fasse den Bug kurz zusammen
2. Frage gezielt nach fehlenden Details:
   - Schritte zur Reproduktion (falls unklar)
   - Erwartetes vs. tatsächliches Verhalten
   - Kontext (was hat der User gerade gemacht?)
3. Halte dich kurz — maximal 1-2 Sätze pro Antwort
4. Nach 2-3 Rückfragen: Generiere den finalen Report

Wenn du den Report generierst, benutze exakt dieses Format:
# [Bug-Titel]
## Summary
[1-2 Sätze]
## Steps to Reproduce
1. ...
## Expected Behavior
...
## Actual Behavior
...
**Severity:** [low/medium/high/critical]
**Tags:** [kommasepariert]

Antworte auf Deutsch.`

/** Opening greeting for the voice interview */
const GREETING = 'Hallo! Beschreib mir den Bug den du gefunden hast. Was ist passiert?'

/**
 * Detect whether Gemma's response contains a final structured report.
 * Checks for the presence of key report sections.
 */
export function isReportComplete(text: string): boolean {
  const hasTitle = /^#\s+.+/m.test(text)
  const hasSummary = /^##\s+Summary/m.test(text)
  const hasSteps = /^##\s+Steps to Reproduce/m.test(text)
  const hasSeverity = /\*\*Severity:\*\*/m.test(text)
  return hasTitle && hasSummary && hasSteps && hasSeverity
}

/**
 * Extract the structured report from Gemma's response.
 * The report starts at the first `# ` heading and goes to the end (or until
 * Gemma adds trailing chatter).
 */
export function extractReport(text: string): string {
  const lines = text.split('\n')
  let startIdx = -1
  let endIdx = lines.length - 1

  // Find first markdown heading (the report title)
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+/.test(lines[i])) {
      startIdx = i
      break
    }
  }

  if (startIdx === -1) return ''

  // Find end: last line that's part of the report structure
  // Trim trailing chatter (lines starting with common German filler)
  for (let i = lines.length - 1; i >= startIdx; i--) {
    const line = lines[i].trim()
    if (line && !line.startsWith('Ich ') && !line.startsWith('Viel') && !line.startsWith('Hoffe')) {
      endIdx = i
      break
    }
  }

  return lines.slice(startIdx, endIdx + 1).join('\n').trim()
}

/**
 * Bug interview orchestrator — connects voice pipeline with Ollama chat.
 * Manages the multi-turn conversation flow: greeting → user turns → report.
 */
export class BugreportInterview extends EventEmitter {
  private chat: OllamaChat
  private _complete = false
  private _report = ''
  private turnCount = 0

  constructor(chat: OllamaChat) {
    super()
    this.chat = chat
  }

  /**
   * Start the interview — emits the greeting for TTS playback.
   */
  start(): void {
    this._complete = false
    this._report = ''
    this.turnCount = 0
    this.emit('agent-speaking', GREETING)
    this.emit('turn-update', { role: 'assistant', text: GREETING })
  }

  /**
   * Process a user's transcribed speech. Sends to Gemma and handles response.
   */
  async onUserTranscription(text: string): Promise<void> {
    if (this._complete || !text.trim()) return

    this.turnCount++
    this.emit('turn-update', { role: 'user', text })

    try {
      const response = await this.chat.send(text)

      if (isReportComplete(response)) {
        this._report = extractReport(response)
        this._complete = true
        this.emit('agent-speaking', 'Fertig! Der Report ist erstellt.')
        this.emit('turn-update', { role: 'assistant', text: response })
        this.emit('interview-complete', this._report)
      } else {
        this.emit('agent-speaking', response)
        this.emit('turn-update', { role: 'assistant', text: response })
      }
    } catch (err) {
      this.emit('error', err as Error)
    }
  }

  isComplete(): boolean {
    return this._complete
  }

  getReport(): string {
    return this._report
  }

  getTurnCount(): number {
    return this.turnCount
  }
}
```

- [ ] **Step 4: Run bugreport-interview tests**

Run: `npm test -- --test-name-pattern "BugreportInterview"`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/voice/bugreport-interview.ts test/main/bugreport-interview.test.ts
git commit -m "feat(voice): Task 7 — bugreport interview logic + system prompt"
```

---

### Task 8: Voice Manager (Orchestrator)

**Files:**
- Create: `src/main/voice/voice-manager.ts`

- [ ] **Step 1: Implement voice-manager.ts**

```typescript
// src/main/voice/voice-manager.ts
import path from 'node:path'
import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { STTRouter } from './stt-router'
import { PiperTTS } from './tts-piper'
import { ConversationEngine, type ConversationTransport } from './conversation-engine'
import { OllamaChat } from './ollama-chat'
import { BugreportInterview, BUGREPORT_SYSTEM_PROMPT } from './bugreport-interview'

export interface VoiceManagerConfig {
  whisperModelDir?: string
  piperModelsDir?: string
  piperVoice?: string
  ollamaHost?: string
  ollamaPort?: number
  ollamaModel?: string
}

/**
 * Voice manager — orchestrates STT, TTS, conversation engine, and interview.
 * Slim replacement for cipher-desktop's voice-manager.js.
 */
export class VoiceManager extends EventEmitter {
  private stt: STTRouter | null = null
  private tts: PiperTTS | null = null
  private conversation: ConversationEngine | null = null
  private interview: BugreportInterview | null = null
  private chat: OllamaChat | null = null
  private config: Required<VoiceManagerConfig>
  private _initialized = false
  private transport: ConversationTransport | null = null

  constructor(config?: VoiceManagerConfig) {
    super()
    const appSupport = app?.getPath?.('userData')
      ?? path.join(process.env.HOME ?? '~', 'Library/Application Support/cipher-mux')

    this.config = {
      whisperModelDir: config?.whisperModelDir
        ?? path.join(appSupport, 'models', 'whisper'),
      piperModelsDir: config?.piperModelsDir
        ?? path.join(process.env.HOME ?? '~', 'Library/Application Support/cipher-desktop/models/piper'),
      piperVoice: config?.piperVoice ?? 'de_DE-dii-high',
      ollamaHost: config?.ollamaHost ?? '127.0.0.1',
      ollamaPort: config?.ollamaPort ?? 11433,
      ollamaModel: config?.ollamaModel ?? 'gemma3:4b',
    }
  }

  /**
   * Set the IPC transport for communicating with the renderer.
   * Must be called before init().
   */
  setTransport(transport: ConversationTransport): void {
    this.transport = transport
  }

  /**
   * Initialize all voice subsystems (STT, TTS, conversation engine).
   */
  async init(): Promise<void> {
    if (!this.transport) throw new Error('Transport not set — call setTransport() first')

    // Init STT
    this.stt = new STTRouter({
      local: { modelDir: this.config.whisperModelDir },
      onStatusChange: (msg, level) => this.emit('status', msg, level),
    })
    await this.stt.init()

    // Init TTS
    this.tts = new PiperTTS({
      voice: this.config.piperVoice,
      modelsDir: this.config.piperModelsDir,
    })
    await this.tts.init()

    // Init conversation engine
    this.conversation = new ConversationEngine({
      sttRouter: this.stt,
      transport: this.transport,
    })
    this.conversation.setTTS(this.tts)

    this._initialized = true
  }

  /**
   * Start a new bugreport voice interview.
   * Creates a fresh Ollama chat session and interview instance.
   */
  startInterview(): BugreportInterview {
    if (!this._initialized || !this.conversation) {
      throw new Error('Voice manager not initialized')
    }

    // Create Ollama chat session
    this.chat = new OllamaChat({
      model: this.config.ollamaModel,
      host: this.config.ollamaHost,
      port: this.config.ollamaPort,
      systemPrompt: BUGREPORT_SYSTEM_PROMPT,
    })

    // Create interview
    this.interview = new BugreportInterview(this.chat)

    // Wire: conversation transcription → interview → Gemma → TTS
    this.conversation.on('transcription', async (text: string) => {
      if (!text || !this.interview || this.interview.isComplete()) return
      await this.interview.onUserTranscription(text)
    })

    this.interview.on('agent-speaking', async (text: string) => {
      if (this.conversation) {
        await this.conversation.speakResponse(text)
      }
    })

    return this.interview
  }

  /** Get the conversation engine for toggle/audio control */
  getConversation(): ConversationEngine | null {
    return this.conversation
  }

  /** Get the current interview */
  getInterview(): BugreportInterview | null {
    return this.interview
  }

  isInitialized(): boolean {
    return this._initialized
  }

  shutdown(): void {
    this.conversation?.shutdown()
    this.tts?.shutdown()
    this.stt?.shutdown()
    this.interview?.removeAllListeners()
    this.conversation = null
    this.tts = null
    this.stt = null
    this.interview = null
    this.chat = null
    this._initialized = false
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.main.json 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/main/voice/voice-manager.ts
git commit -m "feat(voice): Task 8 — voice manager orchestrator"
```

---

### Task 9: IPC Channels + Preload + IPC Hub Wiring

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/ipc-hub.ts`

- [ ] **Step 1: Add voice IPC channels to ipc-channels.ts**

Add after the existing `BUGREPORT_ENRICH` line (line 62), before `} as const`:

```typescript
  // Voice
  VOICE_START: 'cipher-mux:voice:start',
  VOICE_STOP: 'cipher-mux:voice:stop',
  VOICE_AUDIO_CHUNK: 'cipher-mux:voice:audio-chunk',
  VOICE_STATE: 'cipher-mux:voice:state',
  VOICE_TRANSCRIPTION: 'cipher-mux:voice:transcription',
  VOICE_AGENT_TEXT: 'cipher-mux:voice:agent-text',
  VOICE_AGENT_AUDIO: 'cipher-mux:voice:agent-audio',
  VOICE_INTERVIEW_DONE: 'cipher-mux:voice:interview-done',
  VOICE_PLAYBACK_DONE: 'cipher-mux:voice:playback-done',
  VOICE_ERROR: 'cipher-mux:voice:error',
```

- [ ] **Step 2: Add voice API to preload.ts**

Add after the `bugreport` section (after line 134), before `}`:

```typescript
  // ─── Voice ──────────────────────────────────────────────
  voice: {
    start: () => ipcRenderer.invoke(IPC.VOICE_START),
    stop: () => ipcRenderer.invoke(IPC.VOICE_STOP),
    sendAudioChunk: (chunk: ArrayBuffer) =>
      ipcRenderer.send(IPC.VOICE_AUDIO_CHUNK, chunk),
    playbackDone: () => ipcRenderer.send(IPC.VOICE_PLAYBACK_DONE),
    onState: (cb: (state: string) => void) => {
      const handler = (_e: unknown, state: string) => cb(state)
      ipcRenderer.on(IPC.VOICE_STATE, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_STATE, handler)
    },
    onTranscription: (cb: (text: string) => void) => {
      const handler = (_e: unknown, text: string) => cb(text)
      ipcRenderer.on(IPC.VOICE_TRANSCRIPTION, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_TRANSCRIPTION, handler)
    },
    onAgentText: (cb: (text: string) => void) => {
      const handler = (_e: unknown, text: string) => cb(text)
      ipcRenderer.on(IPC.VOICE_AGENT_TEXT, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_AGENT_TEXT, handler)
    },
    onAgentAudio: (cb: (base64Wav: string) => void) => {
      const handler = (_e: unknown, b64: string) => cb(b64)
      ipcRenderer.on(IPC.VOICE_AGENT_AUDIO, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_AGENT_AUDIO, handler)
    },
    onInterviewDone: (cb: (report: string) => void) => {
      const handler = (_e: unknown, report: string) => cb(report)
      ipcRenderer.on(IPC.VOICE_INTERVIEW_DONE, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_INTERVIEW_DONE, handler)
    },
    onError: (cb: (msg: string) => void) => {
      const handler = (_e: unknown, msg: string) => cb(msg)
      ipcRenderer.on(IPC.VOICE_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_ERROR, handler)
    },
  },
```

- [ ] **Step 3: Wire voice IPC handlers in ipc-hub.ts**

Add imports at the top of `ipc-hub.ts`:

```typescript
import { VoiceManager } from './voice/voice-manager'
import type { ConversationTransport } from './voice/conversation-engine'
```

Add property to the IpcHub class:

```typescript
private voiceManager: VoiceManager | null = null
```

Add handlers in the `registerHandlers()` or equivalent init method:

```typescript
// ─── Voice ──────────────────────────────────────────────
ipcMain.handle(IPC.VOICE_START, async () => {
  try {
    if (!this.voiceManager) {
      this.voiceManager = new VoiceManager()
      const transport: ConversationTransport = {
        sendStartCapture: () => this.mainWindow?.webContents.send(IPC.VOICE_STATE, 'recording'),
        sendStopCapture: () => this.mainWindow?.webContents.send(IPC.VOICE_STATE, 'processing'),
        sendTranscription: (text) => this.mainWindow?.webContents.send(IPC.VOICE_TRANSCRIPTION, text),
        sendAudioPlayback: (b64) => this.mainWindow?.webContents.send(IPC.VOICE_AGENT_AUDIO, b64),
        sendStateChange: (state) => this.mainWindow?.webContents.send(IPC.VOICE_STATE, state),
      }
      this.voiceManager.setTransport(transport)
      await this.voiceManager.init()
    }

    const interview = this.voiceManager.startInterview()
    interview.on('turn-update', (turn) => {
      this.mainWindow?.webContents.send(IPC.VOICE_AGENT_TEXT, JSON.stringify(turn))
    })
    interview.on('interview-complete', (report) => {
      this.mainWindow?.webContents.send(IPC.VOICE_INTERVIEW_DONE, report)
    })
    interview.on('error', (err) => {
      this.mainWindow?.webContents.send(IPC.VOICE_ERROR, (err as Error).message)
    })
    interview.start()
    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message
    this.mainWindow?.webContents.send(IPC.VOICE_ERROR, msg)
    return { ok: false, error: msg }
  }
})

ipcMain.handle(IPC.VOICE_STOP, () => {
  this.voiceManager?.getConversation()?.handleToggle()
  return { ok: true }
})

ipcMain.on(IPC.VOICE_AUDIO_CHUNK, (_event, chunk: ArrayBuffer) => {
  this.voiceManager?.getConversation()?.receiveAudioChunk(chunk)
})

ipcMain.on(IPC.VOICE_PLAYBACK_DONE, () => {
  this.voiceManager?.getConversation()?.onPlaybackComplete()
})
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.main.json 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 5: Run existing tests (no regression)**

Run: `npm test`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/preload.ts src/main/ipc-hub.ts
git commit -m "feat(voice): Task 9 — IPC channels, preload API, hub wiring"
```

---

### Task 10: AudioWorklet + Renderer Voice Hook

**Files:**
- Create: `src/renderer/voice/audio-capture-worklet.js`
- Create: `src/renderer/voice/use-voice-bugreport.ts`

- [ ] **Step 1: Port audio-capture-worklet.js**

```javascript
// src/renderer/voice/audio-capture-worklet.js
//
// AudioWorklet processor — captures mic audio, downsamples to 16kHz Int16 PCM.
// Ported from cipher-desktop/src/renderer/shared/audio-capture-worklet.js.
// Runs in AudioWorklet context (no Node.js APIs).

'use strict'

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.capturing = false
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIdx = 0
    this.energySmooth = 0
    this.reportCounter = 0
    this.silenceThreshold = 0.01
    this.silenceTimeoutMs = 8000
    this.silenceStart = 0

    this.port.onmessage = (e) => {
      switch (e.data.cmd) {
        case 'start':
          this.capturing = true
          this.silenceStart = 0
          break
        case 'stop':
          this.capturing = false
          this.bufferIdx = 0
          break
        case 'set_silence_timeout':
          this.silenceTimeoutMs = e.data.value || 0
          break
      }
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const samples = input[0]

    // Compute RMS energy
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    const rms = Math.sqrt(sum / samples.length)
    this.energySmooth = 0.7 * this.energySmooth + 0.3 * rms

    // Report energy ~10x/sec
    this.reportCounter++
    if (this.reportCounter >= 37) {
      this.port.postMessage({ energy: this.energySmooth })
      this.reportCounter = 0
    }

    if (!this.capturing) return true

    // Silence timeout check
    if (this.silenceTimeoutMs > 0) {
      if (rms < this.silenceThreshold) {
        if (!this.silenceStart) this.silenceStart = currentTime * 1000
        else if (currentTime * 1000 - this.silenceStart > this.silenceTimeoutMs) {
          this.port.postMessage({ silenceTimeout: true })
          this.capturing = false
          return true
        }
      } else {
        this.silenceStart = 0
      }
    }

    // Buffer audio and downsample
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.bufferIdx++] = samples[i]
      if (this.bufferIdx >= this.bufferSize) {
        // Downsample to 16kHz (nearest-neighbor)
        const ratio = sampleRate / 16000
        const outputLength = Math.floor(this.bufferSize / ratio)
        const int16 = new Int16Array(outputLength)

        for (let j = 0; j < outputLength; j++) {
          const srcIdx = Math.floor(j * ratio)
          const sample = Math.max(-1, Math.min(1, this.buffer[srcIdx]))
          int16[j] = Math.round(sample * 32767)
        }

        this.port.postMessage({ audio: int16.buffer }, [int16.buffer])
        this.bufferIdx = 0
      }
    }

    return true
  }
}

registerProcessor('audio-capture', AudioCaptureProcessor)
```

- [ ] **Step 2: Implement use-voice-bugreport.ts hook**

```typescript
// src/renderer/voice/use-voice-bugreport.ts
import { useState, useCallback, useEffect, useRef } from 'preact/hooks'

const api = () => (window as any).cipherMux

export type VoiceBugreportState = 'idle' | 'initializing' | 'ready' | 'recording' | 'processing' | 'agent_speaking' | 'complete' | 'error'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Preact hook for voice bugreport — manages AudioWorklet, IPC events, chat turns.
 */
export function useVoiceBugreport() {
  const [voiceState, setVoiceState] = useState<VoiceBugreportState>('idle')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [report, setReport] = useState('')
  const [error, setError] = useState<string | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioQueueRef = useRef<string[]>([])
  const playingRef = useRef(false)

  const playNextAudio = useCallback(() => {
    if (playingRef.current || audioQueueRef.current.length === 0) return
    playingRef.current = true

    const b64 = audioQueueRef.current.shift()!
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const blob = new Blob([bytes], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => {
      URL.revokeObjectURL(url)
      playingRef.current = false
      if (audioQueueRef.current.length > 0) {
        playNextAudio()
      } else {
        api().voice.playbackDone()
      }
    }
    audio.play().catch(() => {
      playingRef.current = false
      playNextAudio()
    })
  }, [])

  // Cleanup IPC listeners on unmount
  useEffect(() => {
    const cleanups: Array<() => void> = []

    cleanups.push(api().voice.onState((state: string) => {
      setVoiceState(state as VoiceBugreportState)
    }))

    cleanups.push(api().voice.onAgentText((json: string) => {
      try {
        const turn = JSON.parse(json) as ChatTurn
        setTurns(prev => [...prev, turn])
      } catch { /* ignore parse errors */ }
    }))

    cleanups.push(api().voice.onAgentAudio((b64: string) => {
      audioQueueRef.current.push(b64)
      playNextAudio()
    }))

    cleanups.push(api().voice.onInterviewDone((r: string) => {
      setReport(r)
      setVoiceState('complete')
    }))

    cleanups.push(api().voice.onError((msg: string) => {
      setError(msg)
      setVoiceState('error')
    }))

    return () => cleanups.forEach(fn => fn())
  }, [playNextAudio])

  const startVoiceInterview = useCallback(async () => {
    setVoiceState('initializing')
    setTurns([])
    setReport('')
    setError(null)

    try {
      // Request mic permission + setup AudioWorklet
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true }
      })
      streamRef.current = stream

      const ctx = new AudioContext({ sampleRate: 48000 })
      audioCtxRef.current = ctx

      await ctx.audioWorklet.addModule(new URL('./audio-capture-worklet.js', import.meta.url).href)
      const workletNode = new AudioWorkletNode(ctx, 'audio-capture')
      workletNodeRef.current = workletNode

      const source = ctx.createMediaStreamSource(stream)
      source.connect(workletNode)
      workletNode.connect(ctx.destination) // needed to keep processing alive

      // Forward audio chunks to main process
      workletNode.port.onmessage = (e) => {
        if (e.data.audio) {
          api().voice.sendAudioChunk(e.data.audio)
        }
      }

      // Start interview in main process
      const result = await api().voice.start()
      if (!result.ok) {
        setError(result.error || 'Voice init failed')
        setVoiceState('error')
        return
      }

      setVoiceState('ready')
    } catch (err) {
      setError((err as Error).message)
      setVoiceState('error')
    }
  }, [])

  const toggleRecording = useCallback(() => {
    const node = workletNodeRef.current
    if (!node) return

    if (voiceState === 'ready') {
      node.port.postMessage({ cmd: 'start' })
      api().voice.stop() // toggle = start recording in main
    } else if (voiceState === 'recording') {
      node.port.postMessage({ cmd: 'stop' })
      api().voice.stop() // toggle = stop recording in main
    }
  }, [voiceState])

  const stopVoiceInterview = useCallback(() => {
    // Cleanup audio
    workletNodeRef.current?.port.postMessage({ cmd: 'stop' })
    workletNodeRef.current?.disconnect()
    audioCtxRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())
    workletNodeRef.current = null
    audioCtxRef.current = null
    streamRef.current = null
    audioQueueRef.current = []
    playingRef.current = false

    setVoiceState('idle')
  }, [])

  return {
    voiceState,
    turns,
    report,
    error,
    startVoiceInterview,
    toggleRecording,
    stopVoiceInterview,
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.renderer.json 2>&1 | head -20`
Expected: No new errors (worklet.js is excluded from TS)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/voice/audio-capture-worklet.js src/renderer/voice/use-voice-bugreport.ts
git commit -m "feat(voice): Task 10 — AudioWorklet + renderer voice hook"
```

---

### Task 11: BugreportDialog UI (Mic Button + Chat Bubbles)

**Files:**
- Modify: `src/renderer/components/BugreportDialog.tsx`
- Modify: `src/renderer/styles/components.css` (or equivalent CSS file)

- [ ] **Step 1: Update BugreportDialog.tsx**

Replace the entire file with the updated version that adds:
- Import of `useVoiceBugreport` hook
- `MicIcon` component with state-dependent appearance
- `ChatBubbles` component for conversation display
- Mic button next to textarea
- Voice state management

```tsx
// src/renderer/components/BugreportDialog.tsx
import { useState, useCallback } from 'preact/hooks'
import { useVoiceBugreport, type ChatTurn, type VoiceBugreportState } from '../voice/use-voice-bugreport'

const api = () => (window as any).cipherMux

interface EnrichedBugreport {
  title: string
  severity: string
  tags: string[]
  steps_to_reproduce: string[]
  expected_behavior: string
  actual_behavior: string
  summary: string
}

interface BugreportDialogProps {
  visible: boolean
  onClose: () => void
}

function formatEnriched(e: EnrichedBugreport): string {
  const lines: string[] = []
  lines.push(`# ${e.title}`)
  lines.push(``)
  lines.push(`**Severity:** ${e.severity}`)
  if (e.tags.length) lines.push(`**Tags:** ${e.tags.join(', ')}`)
  lines.push(``)
  if (e.summary) {
    lines.push(`## Summary`)
    lines.push(e.summary)
    lines.push(``)
  }
  if (e.steps_to_reproduce.length) {
    lines.push(`## Steps to Reproduce`)
    e.steps_to_reproduce.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
    lines.push(``)
  }
  if (e.expected_behavior) {
    lines.push(`## Expected Behavior`)
    lines.push(e.expected_behavior)
    lines.push(``)
  }
  if (e.actual_behavior) {
    lines.push(`## Actual Behavior`)
    lines.push(e.actual_behavior)
  }
  return lines.join('\n').trim()
}

function MicIcon({ state }: { state: VoiceBugreportState }) {
  const isRecording = state === 'recording'
  const isProcessing = state === 'processing'
  const isSpeaking = state === 'agent_speaking'

  const className = [
    'bugreport-mic',
    isRecording ? 'bugreport-mic--recording' : '',
    isProcessing ? 'bugreport-mic--processing' : '',
    isSpeaking ? 'bugreport-mic--speaking' : '',
  ].filter(Boolean).join(' ')

  return (
    <span class={className}>
      {isProcessing ? '\u27F3' : isSpeaking ? '\uD83D\uDD0A' : '\uD83C\uDF99'}
    </span>
  )
}

function ChatBubbles({ turns }: { turns: ChatTurn[] }) {
  if (turns.length === 0) return null
  return (
    <div class="bugreport-chat">
      {turns.map((turn, i) => (
        <div key={i} class={`bugreport-chat__bubble bugreport-chat__bubble--${turn.role}`}>
          {turn.text}
        </div>
      ))}
    </div>
  )
}

export function BugreportDialog({ visible, onClose }: BugreportDialogProps) {
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enriched, setEnriched] = useState<EnrichedBugreport | null>(null)
  const [enrichFailed, setEnrichFailed] = useState(false)
  const [preview, setPreview] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const {
    voiceState,
    turns,
    report,
    error: voiceError,
    startVoiceInterview,
    toggleRecording,
    stopVoiceInterview,
  } = useVoiceBugreport()

  // When interview completes, put report into description
  if (report && !description && voiceState === 'complete') {
    setDescription(report)
    stopVoiceInterview()
  }

  const handleEnrich = useCallback(async () => {
    if (!description.trim()) return
    setEnriching(true)
    setEnrichFailed(false)
    setEnriched(null)
    try {
      const res: EnrichedBugreport | null = await api().bugreport.enrich(description)
      if (res) {
        setEnriched(res)
        setPreview(formatEnriched(res))
      } else {
        setEnrichFailed(true)
      }
    } catch (err) {
      console.error('[BugreportDialog] enrich failed:', err)
      setEnrichFailed(true)
    } finally {
      setEnriching(false)
    }
  }, [description])

  const handleSubmit = useCallback(async () => {
    const finalDescription = enriched ? preview : description
    if (!finalDescription.trim()) return
    setSubmitting(true)
    try {
      const res = await api().bugreport.submit(finalDescription)
      setResult(res.id)
      setDescription('')
      setEnriched(null)
      setPreview('')
      setEnrichFailed(false)
    } catch (err) {
      console.error('[BugreportDialog] submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }, [description, enriched, preview])

  const handleClose = useCallback(() => {
    setResult(null)
    setDescription('')
    setEnriched(null)
    setPreview('')
    setEnrichFailed(false)
    stopVoiceInterview()
    onClose()
  }, [onClose, stopVoiceInterview])

  const handleMicClick = useCallback(() => {
    if (voiceState === 'idle') {
      startVoiceInterview()
    } else if (voiceState === 'ready' || voiceState === 'recording') {
      toggleRecording()
    }
    // During processing/agent_speaking: ignore click
  }, [voiceState, startVoiceInterview, toggleRecording])

  const isVoiceActive = voiceState !== 'idle' && voiceState !== 'complete' && voiceState !== 'error'

  if (!visible) return null

  return (
    <div class="dialog-overlay" onClick={handleClose}>
      <div class="dialog bugreport-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 class="dialog__title">Bugreport</h3>
        {result ? (
          <>
            <p class="dialog__text">
              Report <strong>{result}</strong> in Outbox abgelegt.
            </p>
            <div class="dialog__footer">
              <button class="btn btn--sm btn--primary" onClick={handleClose}>OK</button>
            </div>
          </>
        ) : (
          <>
            <p class="dialog__text">
              Beschreibe das Problem oder nutze das Mikrofon für ein Voice-Interview.
            </p>

            {/* Chat bubbles from voice interview */}
            <ChatBubbles turns={turns} />

            {voiceError && (
              <p class="bugreport-dialog__notice">
                Voice-Fehler: {voiceError}
              </p>
            )}

            <div class="bugreport-input-row">
              <textarea
                class="bugreport-textarea"
                rows={5}
                value={description}
                onInput={(e) => {
                  setDescription((e.target as HTMLTextAreaElement).value)
                  if (enriched) {
                    setEnriched(null)
                    setPreview('')
                    setEnrichFailed(false)
                  }
                }}
                placeholder="Was ist passiert? Was hast du erwartet?"
                autoFocus
                disabled={isVoiceActive}
              />
              <button
                class="btn btn--icon bugreport-mic-btn"
                onClick={handleMicClick}
                disabled={voiceState === 'processing' || voiceState === 'agent_speaking' || voiceState === 'initializing'}
                title={voiceState === 'idle' ? 'Voice-Interview starten' : voiceState === 'recording' ? 'Aufnahme stoppen' : 'Voice aktiv'}
              >
                <MicIcon state={voiceState} />
              </button>
            </div>

            {enrichFailed && (
              <p class="bugreport-dialog__notice">
                Ollama nicht erreichbar — Rohtext wird verwendet.
              </p>
            )}

            {enriched && (
              <>
                <p class="bugreport-dialog__label">Vorschau (bearbeitbar):</p>
                <textarea
                  class="bugreport-textarea bugreport-textarea--preview"
                  rows={10}
                  value={preview}
                  onInput={(e) => setPreview((e.target as HTMLTextAreaElement).value)}
                />
              </>
            )}

            <div class="dialog__footer">
              <button class="btn btn--sm" onClick={handleClose}>Abbrechen</button>
              {!enriched && !isVoiceActive && (
                <button
                  class="btn btn--sm"
                  onClick={handleEnrich}
                  disabled={enriching || !description.trim()}
                >
                  {enriching ? 'Analysiere\u2026' : 'Vorschau'}
                </button>
              )}
              <button
                class="btn btn--sm btn--primary"
                onClick={handleSubmit}
                disabled={submitting || isVoiceActive || (!description.trim() && !preview.trim())}
              >
                {submitting ? 'Sende\u2026' : 'Absenden'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for voice UI elements**

Add to the end of the CSS file that contains `.bugreport-textarea` styles:

```css
/* Voice Bugreport */
.bugreport-input-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.bugreport-input-row .bugreport-textarea {
  flex: 1;
}

.bugreport-mic-btn {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
}

.bugreport-mic--recording {
  animation: mic-pulse 1s infinite;
  color: #e74c3c;
}

.bugreport-mic--processing {
  animation: mic-spin 1s linear infinite;
  color: var(--color-text-secondary);
}

.bugreport-mic--speaking {
  color: var(--color-accent);
}

@keyframes mic-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes mic-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.bugreport-chat {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  padding: 8px;
  background: var(--color-bg-secondary, #1a1a2e);
  border-radius: 6px;
}

.bugreport-chat__bubble {
  max-width: 80%;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.4;
}

.bugreport-chat__bubble--user {
  align-self: flex-start;
  background: var(--color-bg-tertiary, #2a2a4a);
  color: var(--color-text-primary);
}

.bugreport-chat__bubble--assistant {
  align-self: flex-end;
  background: var(--color-accent-dim, #3a2a4a);
  color: var(--color-text-primary);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.renderer.json 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Run full test suite (no regression)**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/BugreportDialog.tsx src/renderer/styles/components.css
git commit -m "feat(voice): Task 11 — BugreportDialog mic button + chat bubbles"
```

---

### Task 12: Model Download Script + Build Verification

**Files:**
- Create: `scripts/download-models.sh`

- [ ] **Step 1: Create model download script**

```bash
#!/usr/bin/env bash
# scripts/download-models.sh
# Download Whisper + Piper models for voice bugreport feature.
# Run once after clone or when models need updating.

set -euo pipefail

echo "=== cipher-mux Voice Model Setup ==="
echo ""

# -- Whisper STT Model --
WHISPER_DIR="$HOME/Library/Application Support/cipher-mux/models/whisper"
WHISPER_MODEL="ggml-small.bin"
WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WHISPER_MODEL"

if [ -f "$WHISPER_DIR/$WHISPER_MODEL" ]; then
  echo "[ok] Whisper model already exists: $WHISPER_DIR/$WHISPER_MODEL"
else
  echo "[dl] Downloading Whisper model ($WHISPER_MODEL)..."
  mkdir -p "$WHISPER_DIR"
  curl -L --progress-bar -o "$WHISPER_DIR/$WHISPER_MODEL" "$WHISPER_URL"
  echo "[ok] Whisper model downloaded"
fi

echo ""

# -- Piper TTS Model --
# Shared with cipher-desktop — same model directory
PIPER_DIR="$HOME/Library/Application Support/cipher-desktop/models/piper"
PIPER_VOICE="vits-piper-de_DE-dii-high"
PIPER_MODEL_DIR="$PIPER_DIR/$PIPER_VOICE"

if [ -d "$PIPER_MODEL_DIR" ] && ls "$PIPER_MODEL_DIR"/*.onnx 1>/dev/null 2>&1; then
  echo "[ok] Piper model already exists: $PIPER_MODEL_DIR"
else
  echo "[info] Piper model not found at: $PIPER_MODEL_DIR"
  echo ""
  echo "  If cipher-desktop is installed, the model may already exist."
  echo "  Otherwise, download manually from:"
  echo "  https://huggingface.co/rhasspy/piper-voices/tree/main/de/de_DE/dii/high"
  echo ""
  echo "  Place .onnx and tokens.txt in:"
  echo "  $PIPER_MODEL_DIR/"
  mkdir -p "$PIPER_MODEL_DIR"
  echo "  Directory created."
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Models:"
echo "  Whisper: $WHISPER_DIR/$WHISPER_MODEL"
echo "  Piper:   $PIPER_MODEL_DIR/"
```

- [ ] **Step 2: Make script executable**

Run: `chmod +x scripts/download-models.sh`

- [ ] **Step 3: Install native dependencies**

Run: `npm install @fugood/whisper.node sherpa-onnx-node`

Note: These are native modules with platform-specific binaries. If they fail to install (e.g., in CI), the voice feature gracefully degrades — the mic button shows an error.

- [ ] **Step 4: Verify full build**

Run: `npm run build`
Expected: Build succeeds (TS compilation + Vite bundle)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing 143 + new ~18 = ~161 total)

- [ ] **Step 6: Commit**

```bash
git add scripts/download-models.sh package.json package-lock.json
git commit -m "feat(voice): Task 12 — model download script + native dependencies"
```

---

## Summary

| Task | Component | Tests | Files |
|------|-----------|-------|-------|
| 1 | Voice State + Audio Utils | 8 | 4 |
| 2 | STT Engine (Whisper) | 4 | 2 |
| 3 | STT Router (local only) | — | 1 |
| 4 | TTS Stack (Piper + Worker) | — | 3 |
| 5 | Conversation Engine | — | 1 |
| 6 | Ollama Chat Client | 4 | 2 |
| 7 | Bugreport Interview | 4 | 2 |
| 8 | Voice Manager | — | 1 |
| 9 | IPC + Preload + Hub | — | 3 |
| 10 | AudioWorklet + Hook | — | 2 |
| 11 | BugreportDialog UI | — | 2 |
| 12 | Models + Build | — | 2 |
| **Total** | | **~20** | **~25** |
