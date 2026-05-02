# VAD Voice Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace toggle-to-speak voice with VAD-based always-listen conversation for the bugreport voice assistant, porting the proven logic from cipher-desktop's voice-core.

**Architecture:** The Silero VAD model runs in the renderer (via `@ricky0123/vad-web` bundle loaded as UMD scripts). It detects speech start/end and produces Float32Array audio segments. These are sent to the main process via IPC, where the extended ConversationEngine handles turn management with echo guard and barge-in support. The existing STT (Whisper) and TTS (Piper) engines remain unchanged.

**Tech Stack:** Silero ONNX (VAD model), ONNX Runtime WASM, @ricky0123/vad-web (UMD bundle), Preact, TypeScript, Electron IPC

**Source Reference:** cipher-desktop voice-core at `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-desktop-electron/src/voice-core/conversation-engine.js` (782 lines, proven)

---

### Task 1: Add `user_speaking` State to VoiceStateMachine

**Files:**
- Modify: `src/main/voice/voice-state.ts`
- Test: `test/main/voice-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/main/voice-state.test.ts`:

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { VoiceStateMachine, VoiceState } from '../../src/main/voice/voice-state'

describe('VoiceStateMachine', () => {
  it('should transition ready → user_speaking', () => {
    const sm = new VoiceStateMachine()
    sm.transition(VoiceState.READY)
    assert.ok(sm.transition(VoiceState.USER_SPEAKING))
    assert.equal(sm.state, VoiceState.USER_SPEAKING)
  })

  it('should transition user_speaking → processing', () => {
    const sm = new VoiceStateMachine()
    sm.transition(VoiceState.READY)
    sm.transition(VoiceState.USER_SPEAKING)
    assert.ok(sm.transition(VoiceState.PROCESSING))
  })

  it('should transition agent_speaking → user_speaking (barge-in)', () => {
    const sm = new VoiceStateMachine()
    sm.transition(VoiceState.READY)
    sm.transition(VoiceState.RECORDING)
    sm.transition(VoiceState.PROCESSING)
    sm.transition(VoiceState.AGENT_SPEAKING)
    assert.ok(sm.transition(VoiceState.USER_SPEAKING))
  })

  it('should reject invalid transitions', () => {
    const sm = new VoiceStateMachine()
    assert.ok(!sm.transition(VoiceState.USER_SPEAKING)) // idle → user_speaking not valid
  })

  it('should fire transition callbacks', () => {
    const sm = new VoiceStateMachine()
    const transitions: [string, string][] = []
    sm.onTransition((n, o) => transitions.push([n, o]))
    sm.transition(VoiceState.READY)
    sm.transition(VoiceState.USER_SPEAKING)
    assert.equal(transitions.length, 2)
    assert.deepEqual(transitions[1], [VoiceState.USER_SPEAKING, VoiceState.READY])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx test/main/voice-state.test.ts`
Expected: FAIL — `VoiceState.USER_SPEAKING` does not exist

- [ ] **Step 3: Add USER_SPEAKING state and update transitions**

In `src/main/voice/voice-state.ts`:

Add `USER_SPEAKING = 'user_speaking'` to the enum.

Update `VALID_TRANSITIONS`:
```typescript
const VALID_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  [VoiceState.IDLE]: [VoiceState.READY],
  [VoiceState.READY]: [VoiceState.RECORDING, VoiceState.USER_SPEAKING, VoiceState.IDLE],
  [VoiceState.RECORDING]: [VoiceState.PROCESSING, VoiceState.READY, VoiceState.IDLE],
  [VoiceState.USER_SPEAKING]: [VoiceState.PROCESSING, VoiceState.READY, VoiceState.IDLE],
  [VoiceState.PROCESSING]: [VoiceState.AGENT_SPEAKING, VoiceState.READY, VoiceState.IDLE, VoiceState.ERROR],
  [VoiceState.AGENT_SPEAKING]: [VoiceState.USER_SPEAKING, VoiceState.READY, VoiceState.IDLE],
  [VoiceState.ERROR]: [VoiceState.READY, VoiceState.IDLE],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx test/main/voice-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/voice/voice-state.ts test/main/voice-state.test.ts
git commit -m "feat(voice): add USER_SPEAKING state for VAD support"
```

---

### Task 2: Extend ConversationEngine with VAD Support

Port the VAD logic from cipher-desktop's `conversation-engine.js` into the existing TypeScript class.

**Files:**
- Modify: `src/main/voice/conversation-engine.ts`
- Test: `test/main/conversation-engine-vad.test.ts`

**Key additions from cipher-desktop:**
- `onVADSpeechStart()` — handles speech detection in always-listen mode
- `onVADSpeechEnd(audioData)` — receives VAD audio segment, converts Float32→Int16 PCM, processes through STT
- `onVADMisfire()` — accumulates rapid misfires for barge-in confirmation
- Echo guard — blocks VAD events briefly after TTS stops playing
- Barge-in — interrupts TTS when user speaks during agent_speaking
- Streaming TTS — `feedResponseChunk()` and `_startStreamingSpeech()`
- Interaction mode — `'toggle'` vs `'always-listen'`
- Playback complete signaling — `sendGenerationDone()` in transport

- [ ] **Step 1: Write failing tests**

Create `test/main/conversation-engine-vad.test.ts`:

```typescript
import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { ConversationEngine, type ConversationTransport } from '../../src/main/voice/conversation-engine'
import { STTRouter } from '../../src/main/voice/stt-router'
import { VoiceState } from '../../src/main/voice/voice-state'

function mockTransport(): ConversationTransport {
  return {
    sendStartCapture: mock.fn(),
    sendStopCapture: mock.fn(),
    sendTranscription: mock.fn(),
    sendAudioPlayback: mock.fn(),
    sendStateChange: mock.fn(),
    sendStopPlayback: mock.fn(),
    sendGenerationDone: mock.fn(),
    dispatchStatus: mock.fn(),
    cancelStream: mock.fn(),
  }
}

function mockSTTRouter(): STTRouter {
  return {
    init: mock.fn(async () => {}),
    isReady: mock.fn(() => true),
    activeProvider: mock.fn(() => 'local' as const),
    transcribeBatch: mock.fn(async () => 'test transcription'),
    shutdown: mock.fn(),
    on: mock.fn(),
    emit: mock.fn(),
  } as any
}

describe('ConversationEngine VAD', () => {
  let engine: ConversationEngine
  let transport: ConversationTransport
  let stt: STTRouter

  beforeEach(() => {
    transport = mockTransport()
    stt = mockSTTRouter()
    engine = new ConversationEngine({
      sttRouter: stt,
      transport,
      interactionMode: 'always-listen',
    })
    engine.stateMachine.transition(VoiceState.READY)
  })

  it('should transition to user_speaking on VAD speech start', () => {
    engine.onVADSpeechStart()
    assert.equal(engine.state, VoiceState.USER_SPEAKING)
  })

  it('should ignore VAD speech start during echo guard', () => {
    // Simulate echo guard active
    ;(engine as any)._echoGuardActive = true
    engine.onVADSpeechStart()
    assert.equal(engine.state, VoiceState.READY) // unchanged
  })

  it('should process audio on VAD speech end', async () => {
    engine.onVADSpeechStart()
    assert.equal(engine.state, VoiceState.USER_SPEAKING)

    // Create 1 second of audio at 16kHz
    const audio = new Float32Array(16000)
    for (let i = 0; i < audio.length; i++) audio[i] = Math.sin(i * 0.1) * 0.5

    await engine.onVADSpeechEnd(Array.from(audio))
    // Should have called transcribeBatch
    assert.equal((stt.transcribeBatch as any).mock.callCount(), 1)
  })

  it('should reject too-short speech', async () => {
    engine.onVADSpeechStart()
    // 100ms of audio — below minimum
    const audio = new Float32Array(1600)
    await engine.onVADSpeechEnd(Array.from(audio))
    // Should go back to ready without transcribing
    assert.equal(engine.state, VoiceState.READY)
    assert.equal((stt.transcribeBatch as any).mock.callCount(), 0)
  })

  it('should ignore VAD events in toggle mode', () => {
    const toggleEngine = new ConversationEngine({
      sttRouter: stt,
      transport,
      interactionMode: 'toggle',
    })
    toggleEngine.stateMachine.transition(VoiceState.READY)
    toggleEngine.onVADSpeechStart()
    assert.equal(toggleEngine.state, VoiceState.READY) // unchanged
  })

  it('should activate echo guard after agent_speaking → ready', () => {
    engine.stateMachine.transition(VoiceState.USER_SPEAKING)
    engine.stateMachine.transition(VoiceState.PROCESSING)
    engine.stateMachine.transition(VoiceState.AGENT_SPEAKING)
    engine.onPlaybackComplete()
    assert.equal(engine.state, VoiceState.READY)
    assert.equal((engine as any)._echoGuardActive, true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx test/main/conversation-engine-vad.test.ts`
Expected: FAIL — methods don't exist yet

- [ ] **Step 3: Extend ConversationTransport interface**

Add new methods to the `ConversationTransport` interface in `src/main/voice/conversation-engine.ts`:

```typescript
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
```

- [ ] **Step 4: Add ConversationEngineOptions for interaction mode**

Update the options interface:

```typescript
export interface ConversationEngineOptions {
  sttRouter: STTRouter
  transport: ConversationTransport
  interactionMode?: 'toggle' | 'always-listen'
  bargeInEnabled?: boolean
  echoGuardDurationMs?: number
  endpointing?: {
    silenceThresholdMs?: number
    maxUtteranceDurationMs?: number
    minUtteranceDurationMs?: number
  }
  maxRecordingMs?: number
  minAudioBytes?: number
}
```

- [ ] **Step 5: Add VAD state and echo guard fields to ConversationEngine constructor**

Add private fields (ported from cipher-desktop conversation-engine.js lines 42-87):

```typescript
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
private _maxUtteranceTimer: ReturnType<typeof setTimeout> | null = null
```

Initialize in constructor from options with defaults from cipher-desktop.

- [ ] **Step 6: Add echo guard methods**

Port from cipher-desktop conversation-engine.js lines 729-736:

```typescript
private _activateEchoGuard(): void {
  this._echoGuardActive = true
  if (this._echoGuardTimer) clearTimeout(this._echoGuardTimer)
  this._echoGuardTimer = setTimeout(() => {
    this._echoGuardActive = false
  }, this._echoGuardDurationMs)
}
```

Add echo guard activation to the state transition hook:
```typescript
// In constructor, extend the onTransition callback:
if (oldState === VoiceState.AGENT_SPEAKING && newState === VoiceState.READY) {
  this._activateEchoGuard()
}
```

- [ ] **Step 7: Add VAD event handlers**

Port from cipher-desktop conversation-engine.js lines 235-331:

```typescript
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

  // Handle pending barge-in
  if (this._bargeInPending) {
    this._bargeInPending = false
    this._handleBargeIn()
  }

  if (this.state !== VoiceState.USER_SPEAKING) return

  const float32 = new Float32Array(audioData)
  const durationMs = (float32.length / 16000) * 1000

  // Check minimum utterance duration
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
```

- [ ] **Step 8: Add barge-in handler**

Port from cipher-desktop conversation-engine.js lines 335-366:

```typescript
private _handleBargeIn(): void {
  // Stop TTS
  if (this.tts) this.tts.stop()
  this.transport.sendStopPlayback()

  // Clear streaming TTS state
  this._streamBuffer = ''
  this._streamDone = true
  this._speakingStarted = false
  if (this._processingTimeout) clearTimeout(this._processingTimeout)

  // Cancel LLM stream
  this.transport.cancelStream()

  // Save interrupted context
  if (this._lastSpokenText) {
    this._interruptedContext = `[User interrupted after: '${this._lastSpokenText.slice(0, 200)}']`
  }

  this._bargeInMisfireTimestamps = []
  this.stateMachine.transition(VoiceState.USER_SPEAKING)
  this.transport.dispatchStatus('Listening...', 'info')
  this.emit('bargeIn', { lastSpokenText: this._lastSpokenText })
}
```

- [ ] **Step 9: Add streaming TTS methods**

Port `feedResponseChunk()` and `_startStreamingSpeech()` from cipher-desktop conversation-engine.js lines 527-607:

```typescript
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
```

- [ ] **Step 10: Update `speakResponse()` for streaming TTS awareness and interrupted context**

Modify existing `speakResponse()` to:
- Check if streaming TTS already started
- Prepend interrupted context to transcription in `processAudio()`
- Add processing timeout (90s safety)
- Track `_lastSpokenText`

- [ ] **Step 11: Add `setInteractionMode()` method**

```typescript
setInteractionMode(mode: 'toggle' | 'always-listen'): void {
  this._interactionMode = mode
}
```

- [ ] **Step 12: Update `shutdown()` to clear new timers**

```typescript
shutdown(): void {
  this.clearRecordingTimer()
  if (this.lateChunkTimer) { clearTimeout(this.lateChunkTimer); this.lateChunkTimer = null }
  if (this.errorRecoveryTimer) { clearTimeout(this.errorRecoveryTimer); this.errorRecoveryTimer = null }
  if (this._echoGuardTimer) { clearTimeout(this._echoGuardTimer); this._echoGuardTimer = null }
  if (this._processingTimeout) { clearTimeout(this._processingTimeout); this._processingTimeout = null }
  if (this._maxUtteranceTimer) { clearTimeout(this._maxUtteranceTimer); this._maxUtteranceTimer = null }
  this._acceptLateChunks = false
  this._bargeInPending = false
  this._streamDone = true
  this.audioBuffers = []
  this.stateMachine.reset()
  this.removeAllListeners()
}
```

- [ ] **Step 13: Run tests to verify they pass**

Run: `node --test --import tsx test/main/conversation-engine-vad.test.ts`
Expected: ALL PASS

- [ ] **Step 14: Run full test suite**

Run: `npm test`
Expected: All existing tests still pass

- [ ] **Step 15: Commit**

```bash
git add src/main/voice/conversation-engine.ts test/main/conversation-engine-vad.test.ts
git commit -m "feat(voice): extend ConversationEngine with VAD, echo guard, barge-in"
```

---

### Task 3: Update VoiceManager for Always-Listen Mode

**Files:**
- Modify: `src/main/voice/voice-manager.ts`

- [ ] **Step 1: Add interaction mode to VoiceManagerConfig**

```typescript
export interface VoiceManagerConfig {
  whisperModelDir?: string
  piperModelsDir?: string
  piperVoice?: string
  ollamaHost?: string
  ollamaPort?: number
  ollamaModel?: string
  interactionMode?: 'toggle' | 'always-listen'
}
```

- [ ] **Step 2: Pass interactionMode to ConversationEngine in init()**

```typescript
this.conversation = new ConversationEngine({
  sttRouter: this.sttRouter,
  transport: this.transport,
  interactionMode: this.config.interactionMode,
})
```

- [ ] **Step 3: Add delegate methods for VAD events**

```typescript
onVADSpeechStart(): void {
  this.conversation?.onVADSpeechStart()
}

async onVADSpeechEnd(audioData: number[]): Promise<void> {
  await this.conversation?.onVADSpeechEnd(audioData)
}

onVADMisfire(): void {
  this.conversation?.onVADMisfire()
}

setInteractionMode(mode: 'toggle' | 'always-listen'): void {
  this.conversation?.setInteractionMode(mode)
}
```

- [ ] **Step 4: Set always-listen mode by default for bugreport interviews**

In `startInterview()`, after creating the interview, set always-listen:

```typescript
startInterview(): BugreportInterview {
  // ... existing code ...

  // Set always-listen mode for natural conversation
  this.conversation.setInteractionMode('always-listen')

  return this.interview
}
```

- [ ] **Step 5: Commit**

```bash
git add src/main/voice/voice-manager.ts
git commit -m "feat(voice): VoiceManager delegates VAD events, sets always-listen for interviews"
```

---

### Task 4: Add VAD IPC Channels

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/ipc-hub.ts`

- [ ] **Step 1: Add IPC channel constants**

In `src/shared/ipc-channels.ts`, add to the Voice section:

```typescript
VOICE_VAD_SPEECH_START: 'cipher-mux:voice:vad-speech-start',
VOICE_VAD_SPEECH_END: 'cipher-mux:voice:vad-speech-end',
VOICE_VAD_MISFIRE: 'cipher-mux:voice:vad-misfire',
VOICE_GENERATION_DONE: 'cipher-mux:voice:generation-done',
VOICE_STOP_PLAYBACK: 'cipher-mux:voice:stop-playback',
```

- [ ] **Step 2: Add to preload API**

In `src/main/preload.ts`, extend the voice section:

```typescript
voice: {
  // ... existing ...
  vadSpeechStart: () => ipcRenderer.send(IPC.VOICE_VAD_SPEECH_START),
  vadSpeechEnd: (audioData: number[]) => ipcRenderer.send(IPC.VOICE_VAD_SPEECH_END, audioData),
  vadMisfire: () => ipcRenderer.send(IPC.VOICE_VAD_MISFIRE),
  onGenerationDone: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.VOICE_GENERATION_DONE, handler)
    return () => ipcRenderer.removeListener(IPC.VOICE_GENERATION_DONE, handler)
  },
  onStopPlayback: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.VOICE_STOP_PLAYBACK, handler)
    return () => ipcRenderer.removeListener(IPC.VOICE_STOP_PLAYBACK, handler)
  },
},
```

- [ ] **Step 3: Add IPC handlers in ipc-hub.ts**

In `registerVoiceChannels()`, add:

```typescript
ipcMain.on(IPC.VOICE_VAD_SPEECH_START, () => {
  this.voiceManager?.onVADSpeechStart()
})

ipcMain.on(IPC.VOICE_VAD_SPEECH_END, (_event, audioData: number[]) => {
  this.voiceManager?.onVADSpeechEnd(audioData)
})

ipcMain.on(IPC.VOICE_VAD_MISFIRE, () => {
  this.voiceManager?.onVADMisfire()
})
```

- [ ] **Step 4: Update transport in VOICE_START handler**

Extend the transport object in ipc-hub.ts `VOICE_START` handler:

```typescript
const transport: ConversationTransport = {
  sendStartCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'recording'),
  sendStopCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'processing'),
  sendTranscription: (text) => this.windowManager.sendToMainWindow(IPC.VOICE_TRANSCRIPTION, text),
  sendAudioPlayback: (b64) => this.windowManager.sendToMainWindow(IPC.VOICE_AGENT_AUDIO, b64),
  sendStateChange: (state) => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, state),
  sendStopPlayback: () => this.windowManager.sendToMainWindow(IPC.VOICE_STOP_PLAYBACK),
  sendGenerationDone: () => this.windowManager.sendToMainWindow(IPC.VOICE_GENERATION_DONE),
  dispatchStatus: (text, level) => console.log(`[Voice:${level}] ${text}`),
  cancelStream: () => { /* no LLM stream cancel needed for bugreport */ },
}
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/preload.ts src/main/ipc-hub.ts
git commit -m "feat(voice): add VAD IPC channels (speechStart, speechEnd, misfire)"
```

---

### Task 5: Copy VAD Assets to Renderer

**Files:**
- Create: `src/renderer/public/vad-assets/` (copy from cipher-desktop)
- Modify: `src/renderer/index.html`
- Modify: Content-Security-Policy for `blob:` workers

- [ ] **Step 1: Copy VAD assets from cipher-desktop**

```bash
cp -r /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-desktop-electron/src/renderer/shared/vad-assets/ \
  src/renderer/public/vad-assets/
```

Files copied (~38MB):
- `silero_vad_legacy.onnx` — Silero VAD model
- `ort-wasm-simd-threaded.wasm` — ONNX Runtime WASM
- `ort-wasm-simd-threaded.jsep.wasm` — ONNX Runtime WASM (JSEP)
- `ort-wasm-simd-threaded.mjs` — ONNX Runtime JS
- `ort.wasm.min.js` — ONNX Runtime loader
- `vad-web.bundle.min.js` — @ricky0123/vad-web UMD bundle
- `vad.worklet.bundle.min.js` — VAD AudioWorklet

- [ ] **Step 2: Add VAD script tags to index.html**

The VAD scripts must load before the app. Add them as regular (non-module) script tags, because they are UMD bundles that set `window.vad` and `window.ort`:

```html
<head>
  <!-- ... existing meta tags ... -->
  <!-- VAD: ONNX Runtime + Silero VAD (UMD bundles, set window.ort + window.vad) -->
  <script src="./vad-assets/ort.wasm.min.js"></script>
  <script src="./vad-assets/vad-web.bundle.min.js"></script>
</head>
```

- [ ] **Step 3: Update Content-Security-Policy for blob: workers**

The ONNX Runtime creates blob: workers internally. Update the CSP:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: file:; worker-src 'self' blob:;"
/>
```

- [ ] **Step 4: Add vad-assets to .gitignore (binary assets)**

The VAD assets are ~38MB of binary files. Add to `.gitignore`:

```
# VAD assets (downloaded, not tracked)
src/renderer/public/vad-assets/
```

Create a download script or document how to obtain them.

- [ ] **Step 5: Create VAD asset download script**

Create `scripts/download-vad-assets.sh`:

```bash
#!/bin/bash
# Download VAD assets for voice pipeline
# Source: cipher-desktop-electron (or npm @ricky0123/vad-web)

set -e
ASSETS_DIR="src/renderer/public/vad-assets"

if [ -f "$ASSETS_DIR/silero_vad_legacy.onnx" ]; then
  echo "VAD assets already present in $ASSETS_DIR"
  exit 0
fi

CIPHER_DESKTOP="/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-desktop-electron/src/renderer/shared/vad-assets"

if [ -d "$CIPHER_DESKTOP" ]; then
  echo "Copying VAD assets from cipher-desktop..."
  mkdir -p "$ASSETS_DIR"
  cp "$CIPHER_DESKTOP"/* "$ASSETS_DIR/"
  echo "Done. Assets in $ASSETS_DIR"
else
  echo "ERROR: cipher-desktop VAD assets not found at $CIPHER_DESKTOP"
  echo "Please install @ricky0123/vad-web and copy assets manually."
  exit 1
fi
```

```bash
chmod +x scripts/download-vad-assets.sh
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html scripts/download-vad-assets.sh .gitignore
git commit -m "feat(voice): VAD asset pipeline (Silero ONNX + WASM loader scripts)"
```

---

### Task 6: Create VAD Loader for Renderer

**Files:**
- Create: `src/renderer/voice/vad-loader.ts`

Port from cipher-desktop's `src/renderer/shared/vad-loader.js`, adapted for TypeScript and the cipher-mux asset path.

- [ ] **Step 1: Create vad-loader.ts**

```typescript
/**
 * vad-loader.ts — Initialize Silero VAD in Electron renderer.
 *
 * Loads MicVAD with local assets (no CDN). Shares the existing MediaStream
 * so only one getUserMedia() call is needed.
 *
 * Ported from cipher-desktop's vad-loader.js (proven, battle-tested).
 */

declare global {
  interface Window {
    vad?: { MicVAD: any }
    ort?: { env: { wasm: { numThreads: number } } }
  }
}

// Build absolute URL for VAD assets relative to the page
const VAD_ASSETS_PATH = new URL('./vad-assets/', window.location.href).href

export interface VADCallbacks {
  onSpeechStart: () => void
  onSpeechEnd: (audio: Float32Array) => void
  onVADMisfire?: () => void
}

export interface VADConfig {
  positiveSpeechThreshold?: number
  negativeSpeechThreshold?: number
  redemptionFrames?: number
  minSpeechFrames?: number
  preSpeechPadFrames?: number
}

export interface MicVADInstance {
  start: () => void
  pause: () => void
  destroy: () => void
}

/**
 * Initialize Silero VAD with local assets and a shared MediaStream.
 *
 * @param stream - Existing getUserMedia stream
 * @param audioCtx - Existing AudioContext (shared with worklet if present)
 * @param callbacks - Speech detection callbacks
 * @param vadConfig - VAD sensitivity config
 */
export async function initVAD(
  stream: MediaStream,
  audioCtx: AudioContext,
  callbacks: VADCallbacks,
  vadConfig: VADConfig = {},
): Promise<MicVADInstance> {
  if (!window.vad?.MicVAD) {
    throw new Error('VAD not loaded — ensure ort.wasm.min.js and vad-web.bundle.min.js are included in index.html')
  }

  const config = {
    positiveSpeechThreshold: vadConfig.positiveSpeechThreshold ?? 0.7,
    negativeSpeechThreshold: vadConfig.negativeSpeechThreshold ?? 0.3,
    redemptionFrames: vadConfig.redemptionFrames ?? 8,
    minSpeechFrames: vadConfig.minSpeechFrames ?? 5,
    preSpeechPadFrames: vadConfig.preSpeechPadFrames ?? 3,
  }

  console.log('[VAD] Initializing Silero VAD with config:', config)
  console.log('[VAD] Asset path:', VAD_ASSETS_PATH)

  // Disable multi-threaded WASM — blob workers can't resolve file:// paths
  if (window.ort?.env?.wasm) {
    window.ort.env.wasm.numThreads = 1
    console.log('[VAD] ONNX WASM threads set to 1 (single-thread)')
  }

  const micVAD = await window.vad.MicVAD.new({
    // Use shared stream — no second getUserMedia call
    getStream: () => Promise.resolve(stream),
    pauseStream: () => Promise.resolve(),
    resumeStream: () => Promise.resolve(stream),

    // Share AudioContext
    audioContext: audioCtx,

    // Local asset paths (no CDN)
    baseAssetPath: VAD_ASSETS_PATH,
    onnxWASMBasePath: VAD_ASSETS_PATH,

    // Model
    model: 'legacy',

    // Don't start automatically
    startOnLoad: false,

    // VAD sensitivity
    ...config,

    // Callbacks
    onSpeechStart: () => {
      console.log('[VAD] Speech start detected')
      callbacks.onSpeechStart()
    },

    onSpeechEnd: (audio: Float32Array) => {
      const durationMs = Math.round((audio.length / 16000) * 1000)
      console.log(`[VAD] Speech end — ${audio.length} samples (${durationMs}ms)`)
      callbacks.onSpeechEnd(audio)
    },

    onVADMisfire: () => {
      console.log('[VAD] Misfire (speech too short)')
      callbacks.onVADMisfire?.()
    },
  })

  console.log('[VAD] Silero VAD initialized successfully')
  return micVAD
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/voice/vad-loader.ts
git commit -m "feat(voice): VAD loader for renderer (Silero MicVAD init)"
```

---

### Task 7: Rewrite Renderer Voice Hook for VAD

**Files:**
- Modify: `src/renderer/voice/use-voice-bugreport.ts`

Replace the manual AudioWorklet capture with VAD-based automatic speech detection.

- [ ] **Step 1: Rewrite use-voice-bugreport.ts**

The hook now:
1. Requests mic access
2. Creates AudioContext
3. Initializes VAD via vad-loader
4. VAD detects speech → sends events via IPC to main process
5. No manual toggle needed — conversation flows naturally

```typescript
import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { initVAD, type MicVADInstance } from './vad-loader'

const api = () => (window as any).cipherMux

export type VoiceBugreportState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'recording'
  | 'user_speaking'
  | 'processing'
  | 'agent_speaking'
  | 'complete'
  | 'error'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export function useVoiceBugreport() {
  const [voiceState, setVoiceState] = useState<VoiceBugreportState>('idle')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const vadRef = useRef<MicVADInstance | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioQueueRef = useRef<string[]>([])
  const playingRef = useRef(false)

  // ─── Audio Playback Queue ──────────────────────────────────
  const playNextAudio = useCallback(() => {
    const queue = audioQueueRef.current
    if (queue.length === 0) {
      playingRef.current = false
      api().voice.playbackDone()
      return
    }

    playingRef.current = true
    const base64Wav = queue.shift()!
    const audio = new Audio(`data:audio/wav;base64,${base64Wav}`)
    audio.onended = () => playNextAudio()
    audio.onerror = () => playNextAudio()
    audio.play().catch(() => playNextAudio())
  }, [])

  // ─── IPC Event Listeners ──────────────────────────────────
  useEffect(() => {
    const voice = api()?.voice
    if (!voice) return

    const cleanups: Array<() => void> = []

    try {
      cleanups.push(voice.onState((state: string) => {
        setVoiceState(state as VoiceBugreportState)
      }))
      cleanups.push(voice.onTranscription((text: string) => {
        setTurns((prev) => [...prev, { role: 'user', text }])
      }))
      cleanups.push(voice.onAgentText((text: string) => {
        setTurns((prev) => [...prev, { role: 'assistant', text }])
      }))
      cleanups.push(voice.onAgentAudio((base64Wav: string) => {
        audioQueueRef.current.push(base64Wav)
        if (!playingRef.current) playNextAudio()
      }))
      cleanups.push(voice.onInterviewDone((reportText: string) => {
        setReport(reportText)
        setVoiceState('complete')
      }))
      cleanups.push(voice.onError((msg: string) => {
        setError(msg)
        setVoiceState('error')
      }))
      // Stop playback on barge-in
      cleanups.push(voice.onStopPlayback(() => {
        audioQueueRef.current = []
        playingRef.current = false
      }))
      // Generation done — wait for playback queue to drain
      cleanups.push(voice.onGenerationDone(() => {
        if (!playingRef.current && audioQueueRef.current.length === 0) {
          api().voice.playbackDone()
        }
        // else: playNextAudio() will call playbackDone when queue drains
      }))
    } catch (err) {
      console.warn('[useVoiceBugreport] Failed to register listeners:', err)
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [playNextAudio])

  // ─── Start Voice Interview ────────────────────────────────
  const startVoiceInterview = useCallback(async () => {
    try {
      setVoiceState('initializing')
      setTurns([])
      setReport(null)
      setError(null)
      audioQueueRef.current = []
      playingRef.current = false

      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      // 2. Create AudioContext (16kHz for VAD)
      const audioCtx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = audioCtx

      // 3. Start interview in main process (initializes STT + TTS)
      const result = await api().voice.start()
      if (result && !result.ok) {
        setError(result.error || 'Voice-Interview fehlgeschlagen')
        setVoiceState('error')
        return
      }

      // 4. Initialize VAD — sends events to main process via IPC
      const vad = await initVAD(stream, audioCtx, {
        onSpeechStart: () => {
          api().voice.vadSpeechStart()
        },
        onSpeechEnd: (audio: Float32Array) => {
          // Convert Float32Array to regular array for IPC serialization
          api().voice.vadSpeechEnd(Array.from(audio))
        },
        onVADMisfire: () => {
          api().voice.vadMisfire()
        },
      })

      vadRef.current = vad

      // 5. Start VAD listening
      vad.start()
      setVoiceState('ready')
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize voice interview')
      setVoiceState('error')
    }
  }, [])

  // ─── Stop Voice Interview ─────────────────────────────────
  const stopVoiceInterview = useCallback(() => {
    // Stop VAD
    if (vadRef.current) {
      vadRef.current.destroy()
      vadRef.current = null
    }

    // Close AudioContext
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }

    // Stop media stream tracks
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    // Clear playback queue
    audioQueueRef.current = []
    playingRef.current = false

    setVoiceState('idle')
  }, [])

  // toggleRecording is no longer needed with VAD, but kept for API compatibility
  const toggleRecording = useCallback(() => {
    // VAD handles recording automatically — this is a no-op
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

- [ ] **Step 2: Update BugreportDialog voice button**

In `src/renderer/components/BugreportDialog.tsx`, simplify the voice button since VAD handles recording:

Change `handleVoiceClick`:
```typescript
const handleVoiceClick = useCallback(() => {
  if (voiceState === 'idle' || voiceState === 'error') startVoiceInterview()
  else if (isVoiceActive) stopVoiceInterview()
}, [voiceState, startVoiceInterview, stopVoiceInterview, isVoiceActive])
```

Update `isVoiceActive` to include `user_speaking`:
```typescript
const isVoiceActive = voiceState === 'initializing' || voiceState === 'ready' || voiceState === 'user_speaking' || voiceState === 'recording' || voiceState === 'processing' || voiceState === 'agent_speaking'
```

Update button text:
```tsx
<button class="btn btn--sm" onClick={handleVoiceClick}
  disabled={voiceState === 'initializing'}>
  {isVoiceActive ? 'voice stoppen' : 'voice'}
</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/voice/use-voice-bugreport.ts src/renderer/components/BugreportDialog.tsx
git commit -m "feat(voice): VAD-based voice hook — always-listen conversation"
```

---

### Task 8: Build, Test & Integration Verification

**Files:**
- Modify: `package.json` (build:main copy for piper-worker stays, no new changes needed)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass including new VAD tests.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: Clean build, no TS errors.

- [ ] **Step 3: Copy VAD assets if not present**

```bash
./scripts/download-vad-assets.sh
```

- [ ] **Step 4: Manual integration test**

```bash
npm start
```

Test flow:
1. Open Bug-Assistant dialog
2. Click "voice" button
3. Allow microphone access
4. Speak naturally — VAD should detect speech start/end
5. Wait for transcription → Ollama response → TTS playback
6. Speak again while TTS is playing (barge-in test)
7. Click "voice stoppen" to end

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(voice): VAD voice pipeline integration (Silero + always-listen)"
```

---

## Summary

| Task | What | Key Files |
|------|------|-----------|
| 1 | USER_SPEAKING state | voice-state.ts |
| 2 | ConversationEngine VAD/barge-in/echo-guard | conversation-engine.ts |
| 3 | VoiceManager always-listen mode | voice-manager.ts |
| 4 | IPC channels for VAD events | ipc-channels.ts, preload.ts, ipc-hub.ts |
| 5 | VAD assets + scripts + index.html | public/vad-assets/, index.html |
| 6 | VAD loader for renderer | vad-loader.ts |
| 7 | Renderer hook rewrite | use-voice-bugreport.ts, BugreportDialog.tsx |
| 8 | Build, test, integration | Full verification |
