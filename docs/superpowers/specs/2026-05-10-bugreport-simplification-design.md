# Bugreport Simplification — Voice-Relay Removal

**Date:** 2026-05-10
**Status:** Approved
**Testcase-Ref:** T-BVRL.2-10 in Note ID 01KR8CPRPDZGZPR9YGYAKGZSNX

## Problem

The Voice-Relay Bugreport flow is broken (T-BVRL.3-6, T-WK10.12, T-BF08.19). It starts a dedicated Claude Code entity session for a TTS-guided interview, which introduces:

- Session-startup latency (8-10s)
- Complex relay lifecycle (starting/ready/error states)
- Chat-bubble UI with live TTS responses
- STT routing to a tmux session that may not be ready
- Race conditions between entity-started events and STT activation

The text-based bugreport flow (type + Enrich + Submit) works fine. The problem is exclusively the Voice-Relay layer.

## Solution

Remove the Voice-Relay Bugreport entirely. Replace with direct STT-to-Textarea routing:

1. User opens Bugreport Dialog
2. If STT is active, transcriptions go directly into the textarea (no session, no relay)
3. User edits text if needed
4. User presses "Vorschau" — Enrich (Ollama/Claude-API) formats as structured report
5. User reviews, optionally edits, presses "Absenden"
6. GitHub delivery (gh-CLI or browser) unchanged

## Architecture

### New STT Routing: Dialog Mode

A new routing target in VoiceInputRouter that sends transcriptions to the renderer as IPC events instead of to a tmux session.

```
Renderer opens BugreportDialog
  → IPC BUGREPORT_DIALOG_OPEN
  → ipc-hub sets inputRouter.setDialogTarget('bugreport')

STT transcription arrives
  → VoiceInputRouter.routeTranscription()
  → Priority 1: dialogTarget set → emit('dialogInsert', text)
  → (Priority 2-4 unchanged: voice-relay, notes-editor, pinned/focused session)

Renderer receives VOICE_DIALOG_INSERT
  → BugreportDialog appends text to textarea

Renderer closes BugreportDialog
  → IPC BUGREPORT_DIALOG_CLOSE
  → ipc-hub calls inputRouter.clearDialogTarget()
  → STT returns to normal routing
```

### Routing Priority (after change)

```
1. Dialog target (bugreport textarea)     ← NEW (replaces old bugreport-relay priority)
2. Voice-relay entity (unchanged)
3. Notes editor focused (unchanged)
4. Pinned session (unchanged)
5. Focused session (unchanged)
```

Voice commands (Enter, Clear, Scroll, Grid-Nav) are NOT matched in dialog mode — all text goes verbatim into the textarea.

## What Gets Removed

### Files to delete

| File | Reason |
|------|--------|
| `src/main/bugreport/bugreport-preset-template.ts` | Bugreport entity template — no longer needed |

### Code to remove (by file)

**`src/main/bugreport/bugreport-manager.ts`** (~60 LOC):
- `relaySessionId` and `relayStarting` members
- `getRelaySessionId()`
- `isRelayActive()`
- `startRelaySession()`
- `markRelayReady()`
- `stopRelaySession()`

BugreportManager becomes a plain submit/enrich service with no session awareness.

**`src/main/ipc-hub.ts`** (~40 LOC):
- `bugreportRelaySessionId` member
- `registerBugreportChannels()`: BUGREPORT_RELAY_START and BUGREPORT_RELAY_STOP handlers (lines 1135-1166)
- `entity-started` handler: bugreport relay-ready block (lines 544-553)

**`src/main/voice/voice-input-router.ts`** (~30 LOC):
- `bugreportSessionId` member
- `setBugreportSession()`, `clearBugreportSession()`, `getBugreportSessionId()`
- `routeToBugreportRelay()` private method
- Priority-1 bugreport block in `routeTranscription()`

**`src/main/preload.ts`** (~12 LOC):
- `bugreport.startRelay`, `bugreport.stopRelay`
- `bugreport.onRelayReady`, `bugreport.onTtsText`

**`src/shared/ipc-channels.ts`** (4 channels):
- `BUGREPORT_RELAY_START`, `BUGREPORT_RELAY_STOP`, `BUGREPORT_RELAY_READY`, `BUGREPORT_TTS_TEXT`

**`src/renderer/components/BugreportDialog.tsx`** (~100 LOC):
- `RelayState` type, `ChatTurn` interface
- `ChatBubbles` component
- State: `relayState`, `relayError`, `relaySessionId`, `turns`, `closingRef`
- `relayActive` derived state
- `startRelay()`, `stopRelay()` callbacks
- Auto-start relay useEffect (lines 109-117)
- Relay event listener useEffect (lines 120-149)
- All relay-related JSX (status messages, chat bubbles, voice button, voice-stop button)
- `disabled={relayActive}` guards on textarea and buttons

**`src/main/session/entity-registry.ts`**:
- `bugreport` entity entry (lines 191-201)

**`src/main/ipc-hub.ts`** (entity deploy list):
- `'bugreport'` from the entity-deploy array (line 2280)

**`src/main/session/voice-relay-template.ts`** (~3 lines):
- Bugreport/Feature Request section (lines 59-61) — voice-relay entity itself stays

## What Gets Added

### New IPC Channels (`src/shared/ipc-channels.ts`)

```typescript
BUGREPORT_DIALOG_OPEN: 'cipher-mux:bugreport:dialog-open',
BUGREPORT_DIALOG_CLOSE: 'cipher-mux:bugreport:dialog-close',
VOICE_DIALOG_INSERT: 'cipher-mux:voice:dialog-insert',
```

### VoiceInputRouter: Dialog Target (`src/main/voice/voice-input-router.ts`)

New member and methods:

```typescript
private dialogTarget: 'bugreport' | null = null

setDialogTarget(target: 'bugreport'): void {
  this.dialogTarget = target
}

clearDialogTarget(): void {
  this.dialogTarget = null
}
```

New priority block in `routeTranscription()` (before voice-relay check):

```typescript
// Priority 1: Dialog target — send raw text to renderer, skip voice commands
if (this.dialogTarget) {
  this.emit('dialogInsert', { target: this.dialogTarget, text: trimmed })
  return
}
```

### IPC-Hub: Dialog Handlers (`src/main/ipc-hub.ts`)

Replace relay handlers with:

```typescript
ipcMain.handle(IPC.BUGREPORT_DIALOG_OPEN, () => {
  const inputRouter = this.voiceManager?.getInputRouter()
  if (inputRouter) {
    inputRouter.setDialogTarget('bugreport')
  }
  return { ok: true }
})

ipcMain.handle(IPC.BUGREPORT_DIALOG_CLOSE, () => {
  const inputRouter = this.voiceManager?.getInputRouter()
  if (inputRouter) {
    inputRouter.clearDialogTarget()
  }
  return { ok: true }
})
```

Forward dialogInsert events to renderer:

```typescript
// In voice setup (registerVoiceChannels or similar):
inputRouter.on('dialogInsert', (data: { target: string; text: string }) => {
  this.windowManager.sendToMainWindow(IPC.VOICE_DIALOG_INSERT, data)
})
```

### Preload: Dialog API (`src/main/preload.ts`)

Replace relay API with:

```typescript
bugreport: {
  // ... existing submit, enrich, pickScreenshot ...
  dialogOpen: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.BUGREPORT_DIALOG_OPEN),
  dialogClose: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.BUGREPORT_DIALOG_CLOSE),
  onDialogInsert: (cb: (data: { target: string; text: string }) => void) => {
    const handler = (_: any, data: { target: string; text: string }) => cb(data)
    ipcRenderer.on(IPC.VOICE_DIALOG_INSERT, handler)
    return () => ipcRenderer.removeListener(IPC.VOICE_DIALOG_INSERT, handler)
  },
}
```

### BugreportDialog: STT Integration (`src/renderer/components/BugreportDialog.tsx`)

Two new effects replacing all relay logic:

```tsx
// Notify main process when dialog opens/closes (for STT routing)
useEffect(() => {
  if (visible) {
    api()?.bugreport?.dialogOpen()
  }
  return () => {
    api()?.bugreport?.dialogClose()
  }
}, [visible])

// Receive STT transcriptions and append to textarea
useEffect(() => {
  if (!visible) return
  const cleanup = api()?.bugreport?.onDialogInsert?.((data: { text: string }) => {
    setDescription((prev) => {
      const separator = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
      return prev + separator + data.text
    })
  })
  return () => cleanup?.()
}, [visible])
```

No voice button needed — STT routing is automatic when dialog is open and voice is active.

## What Stays Unchanged

- `bugreport-manager.ts`: `collectDiagnostics()`, `submit()`, `enrich()`
- `ollama-client.ts`: Complete (Enrich via Claude-API/Ollama)
- `github-delivery.ts`: Complete (gh-CLI / browser delivery)
- `bugreport-resolve.ts`: Complete (MCP tool for resolving bugs)
- `BugreportDialog.tsx`: Textarea, Enrich button, Submit, Screenshots, Report-Type toggle
- `voice-relay-template.ts`: Stays as standalone voice-interface entity (minus bugreport section)
- Voice-relay entity session lifecycle in `ipc-hub.ts` (start/stop via voice toggle)

## Risks

1. **STT text quality in textarea**: Whisper transcriptions may lack punctuation. Acceptable because Enrich reformats everything.
2. **Dialog + Voice-Relay coexistence**: If voice-relay is running and user opens bugreport dialog, `dialogTarget` takes priority. Voice-relay gets no input while dialog is open. This is correct — user intent is to write a bugreport, not talk to voice-relay.
3. **No breaking changes**: The keyboard-only bugreport flow is identical. Only the voice-input path changes from relay-session to textarea-append.

## Test Plan

Tests to update/remove:
- Any tests for `startRelaySession`, `stopRelaySession`, `markRelayReady` in bugreport-manager
- Any tests for `setBugreportSession`, `clearBugreportSession`, `routeToBugreportRelay` in voice-input-router

New tests:
- VoiceInputRouter: `setDialogTarget('bugreport')` → transcription emits `dialogInsert` event
- VoiceInputRouter: `clearDialogTarget()` → transcription falls through to normal routing
- VoiceInputRouter: dialog mode skips voice commands (Enter, Clear etc.)

Manual validation:
- Open bugreport dialog with STT active → speak → text appears in textarea
- Close dialog → STT routes to focused session again
- Enrich + Submit flow unchanged
- Screenshots unchanged

## Net Impact

- ~200 LOC removed
- ~40 LOC added
- 1 file deleted (`bugreport-preset-template.ts`)
- 4 IPC channels removed, 3 added
- BugreportManager loses session dependency, becomes simpler service
