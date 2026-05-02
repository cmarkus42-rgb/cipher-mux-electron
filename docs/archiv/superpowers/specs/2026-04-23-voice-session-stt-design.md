# Design: Voice → Session (STT-Input Router)

**Date:** 2026-04-23
**Status:** Approved
**TP:** 5 (mux-community-evolution)

## Purpose

Route spoken prompts into the focused tmux session via sendKeys. The voice pipeline (Whisper STT, Piper TTS, VAD, ConversationEngine) already exists — this adds a VoiceInputRouter that directs transcribed text to sessions instead of only to the bugreport chat.

**Scope:** STT input only. No TTS output of session responses (interface prepared, not implemented).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Voice modes | Two separate modes: "Bugreport" (LLM+TTS+turns) and "Session-Input" (STT+sendKeys only) | Session-Input needs no LLM/TTS/turn-management — reusing ConversationEngine for pure dispatch is over-engineering |
| UI placement | Floating Pill (bottom-left) | Minimal invasion into existing layout, contextual expansion, no collision with ActivityRail or Grid |
| Focus propagation | Renderer pushes focusedSessionId to Main via IPC on each click | Simplest approach: one handler storing a string. No latency per transcription, no over-engineering SessionManager |
| Input method | PTT only (Ctrl+Shift+Space) | Sending text to tmux is destructive — Always-Listen with auto-submit risks accidental prompts from coughs or background speech. PTT gives explicit control |
| Post-STT flow | Direct dispatch, no review step | Review step defeats the speed advantage of voice. Preview toast (2s) shows what was sent; user can Ctrl+C in session if wrong |
| Whisper bias prompt | Session-mode only | Coding terminology bias improves code-related transcription but would degrade natural language in bugreport mode |

## Architecture

```
[Renderer]                          [Main Process]

Floating Pill (VoiceControl)        VoiceInputRouter
  ├─ Mic Toggle (PTT)                ├─ mode: 'session' | 'off'
  ├─ Mode Badge                      ├─ focusedSessionId: string | null
  ├─ LED Indicator                   ├─ routeTranscription(text)
  └─ Toast Preview                   │    ├─ session → SessionManager.sendKeys()
                                     │    └─ off → noop
PTT Hotkey (Ctrl+Shift+Space)       │
  └─ keydown → vadSpeechStart()     ConversationEngine (shared STT)
     keyup  → vadSpeechEnd()          ├─ processAudio() → Whisper
                                      └─ emit('transcription', text)
                                           └─ VoiceInputRouter.routeTranscription()
```

## New Files

### `src/main/voice/voice-input-router.ts` (~60 LOC)

Routing logic for transcribed text.

```typescript
interface VoiceInputRouterDeps {
  sessionManager: SessionManager
}

class VoiceInputRouter extends EventEmitter {
  private mode: 'session' | 'off' = 'off'
  private focusedSessionId: string | null = null

  setMode(mode: 'session' | 'off'): void
  setFocusedSession(sessionId: string | null): void
  routeTranscription(text: string): Promise<void>
  // session mode: sessionManager.sendKeys(focusedSessionId, text + '\n')
  // emits 'dispatched' with { sessionId, sessionName, text }
  // emits 'error' with { code: 'no-session' | 'session-inactive', message }
}
```

### `src/main/voice/voice-output-router.ts` (~15 LOC)

Placeholder for future TTS output routing. Empty class with interface definition and TODO comments. No implementation.

```typescript
interface VoiceOutputRouter {
  routeAgentResponse(sessionId: string, text: string): Promise<void>
}
// TODO: Implement when TTS output of session responses is needed
```

### `src/renderer/components/VoiceControl.tsx` (~120 LOC)

Floating Pill component, bottom-left corner.

**States:**
- Collapsed (inactive): Mic icon with dim LED dot
- Expanded (active): LED (green=ready, red=recording, amber=processing) + Mode badge ("Session: [Name]") + Recording pulse animation
- Toast overlay: Transcription preview (2s) and "Sent to [Name]" feedback (2s)

### `src/renderer/hooks/useVoiceSession.ts` (~80 LOC)

Preact hook for session voice mode.

- Manages PTT state (keydown/keyup for Ctrl+Shift+Space)
- Calls `voice.startSession()` on activation, `voice.stop()` on deactivation
- Listens for transcription and dispatched events
- Manages toast state (text, visibility, auto-dismiss)

## Modified Files

| File | Change |
|------|--------|
| `src/main/voice/voice-manager.ts` | New `startSessionMode()` — initializes only STT pipeline (no LLM, no TTS, no BugreportInterview). Wires ConversationEngine transcription event to VoiceInputRouter |
| `src/main/voice/stt-engine.ts` | Accept optional `prompt` parameter for Whisper bias prompt, pass through to whisper.node |
| `src/main/voice/conversation-engine.ts` | Accept optional `biasPrompt` in config, pass to STTRouter on transcription |
| `src/main/ipc-hub.ts` | New handlers for `VOICE_START_SESSION`, `VOICE_SET_ROUTING_MODE`, `VOICE_SESSION_TARGET`. New ConversationTransport wiring for session mode (transcription → router instead of interview) |
| `src/main/preload.ts` | New API methods: `voice.startSession()`, `voice.setRoutingMode(mode)`, `voice.onDispatched(cb)` |
| `src/shared/ipc-channels.ts` | 4 new channels (see IPC section) |
| `src/renderer/app.tsx` | Mount VoiceControl component, push focusedSessionId to Main on change |
| `src/renderer/styles/components.css` | Styles for Floating Pill, LED indicator, toast, recording pulse |

## IPC Channels (new)

```typescript
VOICE_START_SESSION:    'cipher-mux:voice:start-session'       // Start STT-only mode (no LLM/TTS)
VOICE_SET_ROUTING_MODE: 'cipher-mux:voice:set-routing-mode'   // { mode: 'session' | 'off' }
VOICE_SESSION_TARGET:   'cipher-mux:voice:session-target'      // { sessionId: string | null }
VOICE_DISPATCHED:       'cipher-mux:voice:dispatched'          // { sessionId, sessionName, text }
```

## PTT Flow (Session Mode)

```
1. User presses Ctrl+Shift+Space (keydown)
   → Renderer: useVoiceSession sets recording=true
   → IPC: voice.vadSpeechStart()
   → Main: ConversationEngine begins audio capture

2. User speaks...
   → Renderer: VAD collects audio chunks

3. User releases (keyup)
   → Renderer: VAD delivers Float32Array
   → IPC: voice.vadSpeechEnd(audio)
   → Main: ConversationEngine → Whisper STT → text

4. Transcription complete
   → Main: VoiceInputRouter.routeTranscription(text)
   → Main: sessionManager.sendKeys(focusedSessionId, text + '\n')
   → IPC: VOICE_DISPATCHED { sessionId, sessionName, text }
   → Renderer: Toast "Sent to [Session-Name]" (2s)
   → Renderer: Toast transcription preview (2s)
```

## Whisper Bias Prompt

```typescript
const CODING_BIAS_PROMPT =
  'programming: function, variable, class, return, async, await, ' +
  'TypeScript, React, import, export, const, let, interface, component'
```

Passed as `prompt` parameter to Whisper in session mode only. Not used in bugreport mode where natural language transcription quality matters more.

## Error Handling

| Condition | Behavior |
|-----------|----------|
| No session focused + PTT | Toast "No session focused", LED blinks red, no sendKeys |
| Session focused but stopped | Toast "Session [Name] is not active", no sendKeys |
| STT returns empty string | No sendKeys, no toast |
| Whisper processing timeout | ConversationEngine existing 90s timeout + recovery applies |
| PTT during active bugreport | Reject — only one voice mode active at a time |

## Non-Goals

- TTS output of session responses (interface only)
- Always-Listen mode for session input (future opt-in)
- Review/edit step before dispatch
- Voice-based session switching
- Global hotkey (requires Accessibility permissions, document for future)
