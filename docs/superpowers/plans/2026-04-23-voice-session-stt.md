# Voice → Session (STT-Input Router) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route spoken prompts into focused tmux sessions via PTT, reusing the existing Whisper STT pipeline.

**Architecture:** A VoiceInputRouter in the main process receives transcriptions from ConversationEngine and dispatches them via SessionManager.sendKeys(). The renderer gets a Floating Pill component (VoiceControl) with PTT hotkey support. VoiceManager gains a `startSessionMode()` that initializes only the STT pipeline (no LLM/TTS).

**Tech Stack:** TypeScript, Preact, Electron IPC, existing ConversationEngine + STTRouter + Whisper.node

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/shared/ipc-channels.ts` | Modify | Add 4 new voice IPC channels |
| `src/main/voice/voice-input-router.ts` | Create | Route transcriptions to sessions or nowhere |
| `src/main/voice/voice-output-router.ts` | Create | Placeholder interface for future TTS output |
| `src/main/voice/voice-manager.ts` | Modify | Add `startSessionMode()` for STT-only lifecycle |
| `src/main/voice/stt-engine.ts` | Modify | Accept optional `prompt` parameter for Whisper bias |
| `src/main/voice/stt-router.ts` | Modify | Pass `prompt` through to STTEngine |
| `src/main/ipc-hub.ts` | Modify | Wire new IPC handlers for session voice mode |
| `src/main/preload.ts` | Modify | Expose new voice API methods to renderer |
| `src/renderer/hooks/useVoiceSession.ts` | Create | PTT state, VAD lifecycle, toast management |
| `src/renderer/components/VoiceControl.tsx` | Create | Floating Pill UI |
| `src/renderer/app.tsx` | Modify | Mount VoiceControl, push focusedSessionId to main |
| `src/renderer/styles/components.css` | Modify | Floating Pill + LED + toast styles |
| `test/main/voice-input-router.test.ts` | Create | Unit tests for VoiceInputRouter |
| `test/main/stt-engine-prompt.test.ts` | Create | Test bias prompt passthrough |

---

### Task 1: IPC Channels

**Files:**
- Modify: `src/shared/ipc-channels.ts:65-81`

- [ ] **Step 1: Add 4 new voice IPC channels**

In `src/shared/ipc-channels.ts`, add after line 81 (`VOICE_STOP_PLAYBACK`):

```typescript
  // Voice Session Input
  VOICE_START_SESSION: 'cipher-mux:voice:start-session',
  VOICE_SET_ROUTING_MODE: 'cipher-mux:voice:set-routing-mode',
  VOICE_SESSION_TARGET: 'cipher-mux:voice:session-target',
  VOICE_DISPATCHED: 'cipher-mux:voice:dispatched',
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(voice): add IPC channels for session voice input"
```

---

### Task 2: VoiceInputRouter

**Files:**
- Create: `src/main/voice/voice-input-router.ts`
- Create: `test/main/voice-input-router.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/main/voice-input-router.test.ts`:

```typescript
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { VoiceInputRouter } from '../../src/main/voice/voice-input-router'

function makeStubSessionManager(sessions: Map<string, { id: string; name: string; status: string }>) {
  return {
    sendKeys: async (_id: string, _keys: string) => {},
    getSession: (id: string) => sessions.get(id) ?? null,
  }
}

describe('VoiceInputRouter', () => {
  let router: VoiceInputRouter
  let sentKeys: { sessionId: string; keys: string }[]
  const sessions = new Map([
    ['sess-1', { id: 'sess-1', name: 'my-project', status: 'active' }],
    ['sess-2', { id: 'sess-2', name: 'stopped-project', status: 'stopped' }],
  ])

  beforeEach(() => {
    sentKeys = []
    const sm = makeStubSessionManager(sessions)
    sm.sendKeys = async (id: string, keys: string) => { sentKeys.push({ sessionId: id, keys }) }
    router = new VoiceInputRouter({ sessionManager: sm as any })
  })

  it('defaults to mode=off and does nothing on dispatch', async () => {
    router.setFocusedSession('sess-1')
    await router.routeTranscription('hello')
    assert.equal(sentKeys.length, 0)
  })

  it('dispatches text to focused session in session mode', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('hello world')
    assert.equal(sentKeys.length, 1)
    assert.equal(sentKeys[0].sessionId, 'sess-1')
    assert.equal(sentKeys[0].keys, 'hello world\n')
  })

  it('emits dispatched event with session info', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let dispatched: any = null
    router.on('dispatched', (data) => { dispatched = data })
    await router.routeTranscription('test input')
    assert.ok(dispatched)
    assert.equal(dispatched.sessionId, 'sess-1')
    assert.equal(dispatched.sessionName, 'my-project')
    assert.equal(dispatched.text, 'test input')
  })

  it('emits error when no session focused', async () => {
    router.setMode('session')
    let error: any = null
    router.on('error', (data) => { error = data })
    await router.routeTranscription('hello')
    assert.ok(error)
    assert.equal(error.code, 'no-session')
    assert.equal(sentKeys.length, 0)
  })

  it('emits error when focused session is not active', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-2')
    let error: any = null
    router.on('error', (data) => { error = data })
    await router.routeTranscription('hello')
    assert.ok(error)
    assert.equal(error.code, 'session-inactive')
    assert.equal(sentKeys.length, 0)
  })

  it('ignores empty transcriptions', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    await router.routeTranscription('')
    await router.routeTranscription('   ')
    assert.equal(sentKeys.length, 0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/main/voice-input-router.test.ts`
Expected: FAIL — module `voice-input-router` not found

- [ ] **Step 3: Implement VoiceInputRouter**

Create `src/main/voice/voice-input-router.ts`:

```typescript
/**
 * VoiceInputRouter — routes transcribed text to the focused tmux session.
 *
 * In 'session' mode, transcriptions are sent as keystrokes to the focused
 * session via SessionManager.sendKeys(). In 'off' mode, transcriptions
 * are silently discarded (the bugreport flow handles its own routing).
 */

import { EventEmitter } from 'node:events'
import type { SessionManager } from '../session/session-manager'

export interface VoiceInputRouterDeps {
  sessionManager: SessionManager
}

export class VoiceInputRouter extends EventEmitter {
  private mode: 'session' | 'off' = 'off'
  private focusedSessionId: string | null = null
  private readonly sessionManager: SessionManager

  constructor(deps: VoiceInputRouterDeps) {
    super()
    this.sessionManager = deps.sessionManager
  }

  setMode(mode: 'session' | 'off'): void {
    this.mode = mode
  }

  getMode(): 'session' | 'off' {
    return this.mode
  }

  setFocusedSession(sessionId: string | null): void {
    this.focusedSessionId = sessionId
  }

  async routeTranscription(text: string): Promise<void> {
    if (this.mode === 'off') return

    const trimmed = text.trim()
    if (trimmed === '') return

    if (!this.focusedSessionId) {
      this.emit('error', { code: 'no-session', message: 'No session focused — click a session first' })
      return
    }

    const session = (this.sessionManager as any).getSession
      ? (this.sessionManager as any).getSession(this.focusedSessionId)
      : null

    if (session && session.status !== 'active') {
      this.emit('error', {
        code: 'session-inactive',
        message: `Session "${session.name}" is not active`,
      })
      return
    }

    try {
      await this.sessionManager.sendKeys(this.focusedSessionId, trimmed + '\n')
      this.emit('dispatched', {
        sessionId: this.focusedSessionId,
        sessionName: session?.name ?? this.focusedSessionId,
        text: trimmed,
      })
    } catch (err) {
      this.emit('error', {
        code: 'send-failed',
        message: (err as Error).message,
      })
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/main/voice-input-router.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/voice/voice-input-router.ts test/main/voice-input-router.test.ts
git commit -m "feat(voice): add VoiceInputRouter with session dispatch"
```

---

### Task 3: VoiceOutputRouter Placeholder

**Files:**
- Create: `src/main/voice/voice-output-router.ts`

- [ ] **Step 1: Create placeholder**

Create `src/main/voice/voice-output-router.ts`:

```typescript
/**
 * VoiceOutputRouter — placeholder for future TTS output of session responses.
 *
 * This interface defines the contract for routing agent responses from
 * tmux sessions back through TTS. Not implemented yet — the current
 * scope is STT input only.
 *
 * TODO: Implement when TTS output of session responses is needed.
 * Likely approach: poll tmux capture-pane for new output, detect
 * completed responses, feed through PiperTTS.
 */

/** Route an agent's text response to TTS for spoken playback. */
export interface VoiceOutputRouterContract {
  routeAgentResponse(sessionId: string, text: string): Promise<void>
  shutdown(): void
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/voice/voice-output-router.ts
git commit -m "feat(voice): add VoiceOutputRouter placeholder interface"
```

---

### Task 4: Whisper Bias Prompt Support

**Files:**
- Modify: `src/main/voice/stt-engine.ts:123-147`
- Modify: `src/main/voice/stt-router.ts:57-59`
- Create: `test/main/stt-engine-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/main/stt-engine-prompt.test.ts`:

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CODING_BIAS_PROMPT } from '../../src/main/voice/stt-engine'

describe('STT Engine — coding bias prompt', () => {
  it('exports a non-empty coding bias prompt string', () => {
    assert.ok(typeof CODING_BIAS_PROMPT === 'string')
    assert.ok(CODING_BIAS_PROMPT.length > 20)
  })

  it('contains key programming terms', () => {
    assert.ok(CODING_BIAS_PROMPT.includes('function'))
    assert.ok(CODING_BIAS_PROMPT.includes('TypeScript'))
    assert.ok(CODING_BIAS_PROMPT.includes('async'))
    assert.ok(CODING_BIAS_PROMPT.includes('interface'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/main/stt-engine-prompt.test.ts`
Expected: FAIL — `CODING_BIAS_PROMPT` not exported

- [ ] **Step 3: Add bias prompt constant and prompt parameter to STTEngine**

In `src/main/voice/stt-engine.ts`, add after the `NOISE_RE` constant (line 25):

```typescript
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
```

Modify the `transcribe` method signature at line 123 to accept an optional prompt:

```typescript
  async transcribe(pcmBuffer: Buffer, prompt?: string): Promise<string> {
```

In the `transcribeData` call at line 134, add the prompt option:

```typescript
    const { promise } = this.context.transcribeData(arrayBuffer, {
      language: this.language,
      maxLen: 1,
      tokenTimestamps: false,
      ...(prompt ? { prompt } : {}),
    })
```

- [ ] **Step 4: Update STTRouter to pass prompt through**

In `src/main/voice/stt-router.ts`, modify `transcribeBatch` at line 57:

```typescript
  async transcribeBatch(pcmBuffer: Buffer, prompt?: string): Promise<string> {
    return this.engine.transcribe(pcmBuffer, prompt)
  }
```

- [ ] **Step 5: Run tests**

Run: `node --test test/main/stt-engine-prompt.test.ts && node --test test/main/stt-engine.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/voice/stt-engine.ts src/main/voice/stt-router.ts test/main/stt-engine-prompt.test.ts
git commit -m "feat(voice): add coding bias prompt for Whisper in session mode"
```

---

### Task 5: VoiceManager.startSessionMode()

**Files:**
- Modify: `src/main/voice/voice-manager.ts`

- [ ] **Step 1: Add VoiceInputRouter import and startSessionMode method**

In `src/main/voice/voice-manager.ts`, add import at line 15:

```typescript
import { VoiceInputRouter } from './voice-input-router'
import { CODING_BIAS_PROMPT } from './stt-engine'
```

Add a field after `private transport` (line 50):

```typescript
  private inputRouter: VoiceInputRouter | null = null
```

Add a new method after `startInterview()` (after line 161):

```typescript
  /**
   * Start session-input mode: STT-only pipeline, no LLM/TTS/interview.
   * Transcriptions are routed through VoiceInputRouter to the focused session.
   * Requires a SessionManager reference for sendKeys dispatch.
   */
  startSessionMode(sessionManager: import('../session/session-manager').SessionManager): VoiceInputRouter {
    if (!this._initialized || !this.conversation) {
      throw new Error('VoiceManager: not initialized. Call init() first.')
    }

    this.inputRouter = new VoiceInputRouter({ sessionManager })
    this.inputRouter.setMode('session')

    // Wire: conversation transcription -> input router (session dispatch)
    this.conversation.removeAllListeners('transcription')
    this.conversation.on('transcription', (text: string) => {
      this.inputRouter?.routeTranscription(text)
    })

    // Session mode uses PTT (toggle), not always-listen
    this.conversation.setInteractionMode('toggle')
    this.conversation.stateMachine.transition(VoiceState.READY)

    return this.inputRouter
  }

  /** Get the input router (null if not in session mode) */
  getInputRouter(): VoiceInputRouter | null {
    return this.inputRouter
  }
```

Update `shutdown()` (line 199) to also clean up the input router. Add before `if (this.interview)`:

```typescript
    if (this.inputRouter) {
      this.inputRouter.removeAllListeners()
      this.inputRouter = null
    }
```

- [ ] **Step 2: Make init() skip TTS when not needed**

The current `init()` always initializes PiperTTS. Session mode doesn't need TTS. Add an optional `skipTTS` flag to `init()`:

In `VoiceManagerConfig` (line 29), add:

```typescript
  skipTTS?: boolean
```

In the `init()` method, wrap the PiperTTS init block (lines 99-105) with a condition:

```typescript
    if (!this.config.skipTTS) {
      const appNodeModules = path.join(__dirname, '..', '..', '..', '..', 'node_modules')
      this.piperTTS = new PiperTTS({
        voice: this.config.piperVoice,
        modelsDir: this.config.piperModelsDir,
        nodeModulesPath: appNodeModules,
      })
      await this.piperTTS.init()
    }
```

Update the ConversationEngine creation (lines 107-112) to only set TTS if available:

```typescript
    this.conversation = new ConversationEngine({
      sttRouter: this.sttRouter,
      transport: this.transport,
      interactionMode: this.config.interactionMode,
    })
    if (this.piperTTS) {
      this.conversation.setTTS(this.piperTTS)
    }
```

Update the config defaults (line 59 area) — add `skipTTS` default:

```typescript
      skipTTS: config?.skipTTS ?? false,
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/main/voice/voice-manager.ts
git commit -m "feat(voice): add startSessionMode() for STT-only session input"
```

---

### Task 6: IPC Hub Wiring

**Files:**
- Modify: `src/main/ipc-hub.ts:614-684`

- [ ] **Step 1: Add VOICE_START_SESSION handler and routing handlers**

In `src/main/ipc-hub.ts`, inside `registerVoiceChannels()` (after the `VOICE_VAD_MISFIRE` handler at line 683), add:

```typescript
    // ── Session Voice Mode ──

    ipcMain.handle(IPC.VOICE_START_SESSION, async () => {
      try {
        if (!this.voiceManager) {
          this.voiceManager = new VoiceManager({ skipTTS: true })
          const transport: ConversationTransport = {
            sendStartCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'recording'),
            sendStopCapture: () => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, 'processing'),
            sendTranscription: (text) => this.windowManager.sendToMainWindow(IPC.VOICE_TRANSCRIPTION, text),
            sendAudioPlayback: () => {},
            sendStateChange: (state) => this.windowManager.sendToMainWindow(IPC.VOICE_STATE, state),
            sendStopPlayback: () => {},
            sendGenerationDone: () => {},
            dispatchStatus: (text: string, level: string) => console.log(`[Voice:${level}] ${text}`),
            cancelStream: () => {},
          }
          this.voiceManager.setTransport(transport)
          await this.voiceManager.init()
        }

        const inputRouter = this.voiceManager.startSessionMode(this.sessionManager)
        inputRouter.on('dispatched', (data: { sessionId: string; sessionName: string; text: string }) => {
          this.windowManager.sendToMainWindow(IPC.VOICE_DISPATCHED, data)
        })
        inputRouter.on('error', (data: { code: string; message: string }) => {
          this.windowManager.sendToMainWindow(IPC.VOICE_ERROR, data.message)
        })
        return { ok: true }
      } catch (err) {
        const msg = (err as Error).message
        if (this.voiceManager && !this.voiceManager.isInitialized()) {
          this.voiceManager.shutdown()
          this.voiceManager = null
        }
        this.windowManager.sendToMainWindow(IPC.VOICE_ERROR, msg)
        return { ok: false, error: msg }
      }
    })

    ipcMain.on(IPC.VOICE_SET_ROUTING_MODE, (_event, { mode }: { mode: 'session' | 'off' }) => {
      this.voiceManager?.getInputRouter()?.setMode(mode)
    })

    ipcMain.on(IPC.VOICE_SESSION_TARGET, (_event, { sessionId }: { sessionId: string | null }) => {
      this.voiceManager?.getInputRouter()?.setFocusedSession(sessionId)
    })
```

- [ ] **Step 2: Add VoiceInputRouter import**

At the top of `ipc-hub.ts`, the VoiceInputRouter import is not needed since we access it through VoiceManager. But we need to import `VOICE_START_SESSION`, `VOICE_SET_ROUTING_MODE`, `VOICE_SESSION_TARGET`, and `VOICE_DISPATCHED` from IPC — these are already available via the `IPC` import.

Verify the file compiles:

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-hub.ts
git commit -m "feat(voice): wire session voice IPC handlers in IpcHub"
```

---

### Task 7: Preload API

**Files:**
- Modify: `src/main/preload.ts:175-226`

- [ ] **Step 1: Add session voice methods to the preload voice API**

In `src/main/preload.ts`, inside the `voice` object (after `onStopPlayback` at line 224), add before the closing `},` of the voice section:

```typescript
    startSession: () => ipcRenderer.invoke(IPC.VOICE_START_SESSION),
    setRoutingMode: (mode: 'session' | 'off') =>
      ipcRenderer.send(IPC.VOICE_SET_ROUTING_MODE, { mode }),
    setSessionTarget: (sessionId: string | null) =>
      ipcRenderer.send(IPC.VOICE_SESSION_TARGET, { sessionId }),
    onDispatched: (cb: (data: { sessionId: string; sessionName: string; text: string }) => void) => {
      const handler = (_e: unknown, data: { sessionId: string; sessionName: string; text: string }) => cb(data)
      ipcRenderer.on(IPC.VOICE_DISPATCHED, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_DISPATCHED, handler)
    },
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat(voice): expose session voice API in preload"
```

---

### Task 8: useVoiceSession Hook

**Files:**
- Create: `src/renderer/hooks/useVoiceSession.ts`

- [ ] **Step 1: Create the hook**

Create `src/renderer/hooks/useVoiceSession.ts`:

```typescript
/**
 * useVoiceSession — Preact hook for PTT voice input into focused sessions.
 *
 * Manages the push-to-talk lifecycle (Ctrl+Shift+Space), VAD initialization,
 * and toast state for transcription preview and dispatch feedback.
 */

import { useState, useEffect, useCallback, useRef } from 'preact/hooks'

const PTT_COMBO = { ctrlKey: true, shiftKey: true, code: 'Space' }

interface Toast {
  text: string
  type: 'transcription' | 'dispatched' | 'error'
}

export interface VoiceSessionState {
  active: boolean
  recording: boolean
  processing: boolean
  voiceState: string
  toast: Toast | null
  error: string | null
}

export function useVoiceSession(focusedSessionId: string | null, focusedSessionName: string | null) {
  const [active, setActive] = useState(false)
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [voiceState, setVoiceState] = useState('idle')
  const [toast, setToast] = useState<Toast | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vadRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const showToast = useCallback((t: Toast) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])

  // Push focused session to main process whenever it changes
  useEffect(() => {
    if (!active) return
    const api = (window as any).cipherMux
    api.voice.setSessionTarget(focusedSessionId)
  }, [focusedSessionId, active])

  // Toggle voice session mode
  const toggle = useCallback(async () => {
    const api = (window as any).cipherMux
    if (active) {
      // Deactivate
      api.voice.setRoutingMode('off')
      if (vadRef.current) {
        vadRef.current.destroy()
        vadRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      setActive(false)
      setRecording(false)
      setProcessing(false)
      setVoiceState('idle')
      return
    }

    // Activate
    try {
      const { available } = await api.voice.available()
      if (!available) {
        setError('Voice not available — native modules missing')
        return
      }
      const result = await api.voice.startSession()
      if (!result.ok) {
        setError(result.error ?? 'Failed to start voice session mode')
        return
      }

      // Get mic access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })
      streamRef.current = stream

      // Initialize VAD
      const { initVAD } = await import('../voice/vad-loader')
      vadRef.current = await initVAD(stream, {
        onSpeechStart: () => api.voice.vadSpeechStart(),
        onSpeechEnd: (audio: Float32Array) => api.voice.vadSpeechEnd(Array.from(audio)),
        onVADMisfire: () => api.voice.vadMisfire(),
      })

      api.voice.setRoutingMode('session')
      api.voice.setSessionTarget(focusedSessionId)
      setActive(true)
      setVoiceState('ready')
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [active, focusedSessionId])

  // Listen for voice events from main
  useEffect(() => {
    if (!active) return

    const api = (window as any).cipherMux
    const unsubs: (() => void)[] = []

    unsubs.push(api.voice.onState((state: string) => {
      setVoiceState(state)
      setRecording(state === 'recording')
      setProcessing(state === 'processing')
    }))

    unsubs.push(api.voice.onTranscription((text: string) => {
      showToast({ text, type: 'transcription' })
    }))

    unsubs.push(api.voice.onDispatched((data: { sessionName: string; text: string }) => {
      showToast({ text: `Sent to ${data.sessionName}`, type: 'dispatched' })
    }))

    unsubs.push(api.voice.onError((msg: string) => {
      showToast({ text: msg, type: 'error' })
    }))

    return () => unsubs.forEach(fn => fn())
  }, [active, showToast])

  // PTT hotkey handler
  useEffect(() => {
    if (!active) return

    const api = (window as any).cipherMux
    let pttDown = false

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey === PTT_COMBO.ctrlKey && e.shiftKey === PTT_COMBO.shiftKey && e.code === PTT_COMBO.code) {
        e.preventDefault()
        if (!pttDown) {
          pttDown = true
          api.voice.vadSpeechStart()
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === PTT_COMBO.code && pttDown) {
        pttDown = false
        // VAD will handle the speech-end with audio data
        // For PTT we need to stop capture via the toggle mechanism
        api.voice.stop()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [active])

  return {
    active,
    recording,
    processing,
    voiceState,
    toast,
    error,
    toggle,
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/useVoiceSession.ts
git commit -m "feat(voice): add useVoiceSession hook with PTT support"
```

---

### Task 9: VoiceControl Component

**Files:**
- Create: `src/renderer/components/VoiceControl.tsx`

- [ ] **Step 1: Create the Floating Pill component**

Create `src/renderer/components/VoiceControl.tsx`:

```tsx
/**
 * VoiceControl — Floating Pill for voice-to-session input.
 *
 * Sits bottom-left of the app. Collapsed: mic icon with LED dot.
 * Expanded (when active): LED + mode badge + recording indicator.
 * Shows toast overlays for transcription preview and dispatch feedback.
 */

import { useVoiceSession } from '../hooks/useVoiceSession'

interface VoiceControlProps {
  focusedSessionId: string | null
  focusedSessionName: string | null
}

export function VoiceControl({ focusedSessionId, focusedSessionName }: VoiceControlProps) {
  const {
    active,
    recording,
    processing,
    voiceState,
    toast,
    error,
    toggle,
  } = useVoiceSession(focusedSessionId, focusedSessionName)

  const ledClass = recording
    ? 'voice-led voice-led--recording'
    : processing
      ? 'voice-led voice-led--processing'
      : active
        ? 'voice-led voice-led--ready'
        : 'voice-led voice-led--off'

  return (
    <div class={`voice-pill${active ? ' voice-pill--active' : ''}`}>
      {/* Toast overlay */}
      {toast && (
        <div class={`voice-toast voice-toast--${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* Error display */}
      {error && !active && (
        <div class="voice-toast voice-toast--error">{error}</div>
      )}

      {/* Pill body */}
      <button
        class="voice-pill__btn"
        onClick={toggle}
        title={active ? 'Disable voice input (Ctrl+Shift+Space to talk)' : 'Enable voice input'}
      >
        <span class={ledClass} />
        <span class="voice-pill__icon">
          {recording ? '\u23FA' : '\u{1F3A4}'}
        </span>
      </button>

      {/* Expanded info */}
      {active && (
        <div class="voice-pill__info">
          <span class="voice-pill__mode">
            {focusedSessionName
              ? `Session: ${focusedSessionName}`
              : 'No session focused'}
          </span>
          <span class="voice-pill__hint">Ctrl+Shift+Space</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/VoiceControl.tsx
git commit -m "feat(voice): add VoiceControl floating pill component"
```

---

### Task 10: Mount VoiceControl in App

**Files:**
- Modify: `src/renderer/app.tsx`

- [ ] **Step 1: Import VoiceControl and add it to the render tree**

In `src/renderer/app.tsx`, add import at line 21 (after `SessionDialog` import):

```typescript
import { VoiceControl } from './components/VoiceControl'
```

Add a `focusedSessionName` memo after line 41 (`useInputRequests`):

```typescript
  const focusedSessionName = useMemo(() => {
    if (!focusedSessionId) return null
    const session = sessions.find(s => s.id === focusedSessionId)
    return session?.name ?? null
  }, [focusedSessionId, sessions])
```

Add the VoiceControl component in the render tree, after the `StatusBar` component (after line 282):

```tsx
      {/* voice input pill */}
      <VoiceControl
        focusedSessionId={focusedSessionId}
        focusedSessionName={focusedSessionName}
      />
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.tsx
git commit -m "feat(voice): mount VoiceControl pill in App"
```

---

### Task 11: CSS Styles

**Files:**
- Modify: `src/renderer/styles/components.css`

- [ ] **Step 1: Add Floating Pill, LED, and toast styles**

Append to `src/renderer/styles/components.css`:

```css
/* ── Voice Control Floating Pill ── */

.voice-pill {
  position: fixed;
  bottom: 36px; /* above status bar */
  left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 100;
  transition: all 0.2s ease;
}

.voice-pill--active {
  background: var(--surface-elevated, #1a1a2e);
  border: 1px solid var(--border-subtle, #333);
  border-radius: 20px;
  padding: 4px 12px 4px 4px;
}

.voice-pill__btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface-elevated, #1a1a2e);
  border: 1px solid var(--border-subtle, #333);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary, #aaa);
  font-size: 14px;
  transition: all 0.15s ease;
}

.voice-pill--active .voice-pill__btn {
  border: none;
  background: transparent;
}

.voice-pill__btn:hover {
  border-color: var(--accent, #e8d5b7);
  color: var(--text-primary, #eee);
}

.voice-pill__icon {
  font-size: 14px;
  line-height: 1;
}

.voice-pill__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.voice-pill__mode {
  font-family: 'Rajdhani', sans-serif;
  font-size: 11px;
  color: var(--text-secondary, #aaa);
  white-space: nowrap;
}

.voice-pill__hint {
  font-family: 'Fira Code', monospace;
  font-size: 9px;
  color: var(--text-muted, #666);
}

/* LED indicator */
.voice-led {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.2s ease;
}

.voice-led--off {
  background: var(--text-muted, #444);
}

.voice-led--ready {
  background: #4ade80;
  box-shadow: 0 0 4px #4ade8066;
}

.voice-led--recording {
  background: #ef4444;
  box-shadow: 0 0 6px #ef444488;
  animation: voice-pulse 1s ease-in-out infinite;
}

.voice-led--processing {
  background: #f59e0b;
  box-shadow: 0 0 4px #f59e0b66;
  animation: voice-pulse 0.6s ease-in-out infinite;
}

@keyframes voice-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Toast overlay */
.voice-toast {
  position: absolute;
  bottom: 40px;
  left: 0;
  background: var(--surface-elevated, #1a1a2e);
  border: 1px solid var(--border-subtle, #333);
  border-radius: 8px;
  padding: 6px 12px;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--text-secondary, #aaa);
  white-space: nowrap;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  animation: voice-toast-in 0.15s ease;
  pointer-events: none;
}

.voice-toast--dispatched {
  border-color: #4ade8044;
  color: #4ade80;
}

.voice-toast--error {
  border-color: #ef444444;
  color: #ef4444;
}

.voice-toast--transcription {
  border-color: var(--accent-dim, #e8d5b744);
  color: var(--accent, #e8d5b7);
}

@keyframes voice-toast-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/styles/components.css
git commit -m "feat(voice): add floating pill, LED, and toast CSS"
```

---

### Task 12: Full Integration Test

- [ ] **Step 1: Run all existing tests**

Run: `npm run test`
Expected: All 164+ tests pass — no regressions

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit any final fixes if needed**

```bash
git add -A
git commit -m "chore: fix integration issues from voice session input"
```
