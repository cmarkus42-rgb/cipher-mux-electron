# Voice Pipeline Debug — Session Handoff

> **Ziel:** Voice STT → Session-Input end-to-end zum Laufen bringen.
> **Status:** STT funktioniert (Whisper erkennt Sprache), aber die Dispatching-Kette zum tmux-Pane ist noch nicht nutzbar.

## Was funktioniert

- **Whisper STT:** Model geladen (`~/.config/cipher-mux/models/whisper/ggml-small.bin`), transkribiert korrekt
- **Silero VAD:** Läuft im Renderer, erkennt Sprache zuverlässig
- **UI:** Voice-Toggle in Statusbar (links), LED-Indikator, Toast-Overlays
- **IPC-Kanäle:** Alle registriert und verdrahtet
- **VoiceManager + ConversationEngine:** State-Machine funktioniert

## Was NICHT funktioniert

### 1. Focus-Propagation Race Condition (Kritisch)

**Problem:** `setRoutingMode('session')` wird VOR `setSessionTarget(focusedSessionId)` aufgerufen.

**Datei:** `src/renderer/hooks/useVoiceSession.ts`

```
toggle() → api.voice.setRoutingMode('session')   // Zeile ~123
useEffect → api.voice.setSessionTarget(id)        // Erst DANACH, async
```

**Effekt:** Erste Spracheingabe scheitert mit "No session focused", weil der Router noch kein Target hat.

**Fix:** In `toggle()` den `setSessionTarget()` SYNCHRON vor `setRoutingMode('session')` aufrufen:
```typescript
// In toggle(), nach startSession():
api.voice.setSessionTarget(focusedSessionId)  // ERST Target setzen
api.voice.setRoutingMode('session')            // DANN Router aktivieren
```

### 2. VoiceInputRouter — Dispatch-Pfad prüfen

**Datei:** `src/main/voice/voice-input-router.ts`

- `routeTranscription(text)` wird von ConversationEngine aufgerufen
- Prüft `mode === 'session'` und `focusedSessionId != null`
- Ruft `sessionManager.sendKeys(focusedSessionId, text + '\n')`
- **Debugging:** Console-Logs in `routeTranscription()` einfügen um zu sehen ob Text ankommt

### 3. ConversationEngine → VoiceInputRouter Wiring

**Datei:** `src/main/voice/conversation-engine.ts`

- Nach STT-Transkription wird `emit('transcription', text)` gefeuert
- **Prüfen:** Ob VoiceInputRouter dieses Event auch empfängt
- **Prüfen:** Ob der CODING_BIAS_PROMPT korrekt an `transcribeBatch()` übergeben wird

### 4. Focus-Wechsel während STT-Processing

**Szenario:** User spricht, klickt dann andere Session → Text geht an alte Session, Toast zeigt neue Session.

**Prio:** Niedrig, aber Toast-Text sollte die tatsächliche Ziel-Session zeigen, nicht die aktuelle.

## Debug-Strategie

### Phase 1: Logging einbauen
An diesen Stellen `console.log` einfügen:

1. `useVoiceSession.ts` — toggle(): `"[Voice] toggle: focusedSessionId=${id}, active=${active}"`
2. `useVoiceSession.ts` — PTT keydown/keyup: `"[Voice] PTT keydown/keyup"`
3. `voice-manager.ts` — onVADSpeechEnd: `"[Voice] VAD speech end, ${samples} samples"`
4. `conversation-engine.ts` — nach STT: `"[Voice] STT result: '${text}'"`
5. `voice-input-router.ts` — routeTranscription: `"[Voice] routing '${text}' to session ${id}"`
6. `session-manager.ts` — sendKeys: `"[Session] sendKeys to ${sessionId}: '${text}'"`

### Phase 2: Focus Race fixen
```typescript
// useVoiceSession.ts — in toggle(), nach startSession() Erfolg:
const api = (window as any).cipherMux
api.voice.setSessionTarget(focusedSessionId)  // Synchron BEFORE routing
api.voice.setRoutingMode('session')
```

### Phase 3: End-to-End Test
1. App starten, Session öffnen, Session fokussieren
2. Voice-Toggle aktivieren (Statusbar links)
3. Ctrl+Shift+Space gedrückt halten, sprechen, loslassen
4. In DevTools Console prüfen: VAD-Events, STT-Result, Dispatch
5. Im tmux-Pane prüfen: Text erscheint

## Architektur-Überblick

```
Renderer                          Main Process
────────                          ────────────
useVoiceSession
  │ toggle()
  │→ api.voice.startSession() ──→ IPC_HUB: new VoiceManager
  │→ api.voice.setSessionTarget() → VoiceInputRouter.setFocusedSession()
  │→ api.voice.setRoutingMode()  → VoiceInputRouter.setMode()
  │
  │ Ctrl+Shift+Space (keydown)
  │→ api.voice.vadSpeechStart() → VoiceManager.onVADSpeechStart()
  │                                → ConversationEngine: READY→USER_SPEAKING
  │
  │ User spricht...
  │ Silero VAD buffert Float32
  │
  │ Ctrl+Shift+Space (keyup)
  │→ api.voice.vadSpeechEnd(pcm) → VoiceManager.onVADSpeechEnd()
  │                                → ConversationEngine: USER_SPEAKING→PROCESSING
  │                                → STTRouter.transcribeBatch(pcm, bias)
  │                                → STTEngine (Whisper.cpp) → text
  │                                → emit('transcription', text)
  │                                → VoiceInputRouter.routeTranscription(text)
  │                                → SessionManager.sendKeys(id, text+'\n')
  │                                → tmux send-keys -t <pane> "text" Enter
  │
  │← IPC: VOICE_DISPATCHED ─────← emit('dispatched', {sessionId, name, text})
  │ Toast: "Sent to [Session]"
```

## Schlüssel-Dateien

| Datei | Verantwortung |
|-------|--------------|
| `src/renderer/hooks/useVoiceSession.ts` | Toggle, PTT, VAD-Init, Focus-Sync |
| `src/renderer/components/VoiceControl.tsx` | UI (jetzt inline in Statusbar) |
| `src/main/voice/voice-manager.ts` | Orchestriert STT + Router |
| `src/main/voice/conversation-engine.ts` | State-Machine, Audio→STT |
| `src/main/voice/stt-engine.ts` | Whisper.cpp Wrapper |
| `src/main/voice/stt-router.ts` | STT-Delegation |
| `src/main/voice/voice-input-router.ts` | Text→tmux Dispatch |
| `src/main/ipc-hub.ts` (Zeilen 700-752) | IPC Handler für Voice |
| `src/main/preload.ts` (Zeilen 175-237) | Preload API |

## Kontext

- **Interaction Mode:** `always-listen` (VAD läuft permanent nach Aktivierung)
- **PTT:** Ctrl+Shift+Space ist Override/Trigger — VAD erkennt auch ohne PTT
- **Whisper Language:** `de` (hardcoded in stt-engine.ts Zeile 92)
- **Coding Bias:** `CODING_BIAS_PROMPT` aus stt-engine.ts wird an Whisper übergeben für bessere Code-Term-Erkennung
- **TTS Output:** Nicht implementiert (Placeholder `voice-output-router.ts`), out of scope
