# Phase 7b — Voice-Bugreport mit Gemma Interview

**Datum:** 2026-04-19
**Status:** Approved
**Scope:** Voice-Pipeline Port + LLM-gesteuertes Bug-Interview im Bugreport-Dialog

---

## Zusammenfassung

Port der cipher-desktop Voice-Pipeline (voice-core) nach cipher-mux-electron, konvertiert von CommonJS/JS zu TypeScript, auditiert für Veröffentlichung. Im Bugreport-Dialog wird ein Mikrofon-Button ergänzt. Klick startet ein kurzes Voice-Gespräch mit Gemma 4 (via Ollama): User beschreibt den Bug frei, Gemma fragt gezielt nach fehlenden Details (1-2 Rückfragen), generiert am Ende einen strukturierten Report. Text landet editierbar im Textarea.

## Kernanforderung

- Voice-Input für Bugreport statt nur Text-Eingabe
- Kurzes geführtes Interview statt stumpfe Transkription
- Komplett lokal: Whisper STT + Piper TTS + Ollama/Gemma 4
- Code auditiert und optimiert für Veröffentlichung ("we build to share")

## Design-Entscheidungen

| Frage | Entscheidung | Begründung |
|-------|-------------|------------|
| STT-Provider | Whisper lokal (primär), Deepgram-Fallback möglich via STT-Router | Offline, kein API-Key, Metal GPU auf ARM64 |
| TTS-Provider | Piper mit `de_DE-dii-high` | Schnell (~200ms), offline, deutsche Stimme |
| LLM für Interview | Gemma 4 via Ollama Chat API (`127.0.0.1:11433`) | Lokal, multi-turn fähig, schnell genug für Gespräch |
| Conversation-Stil | Hybrid — User spricht frei, Gemma fragt nach Lücken | Natürlichster Flow |
| UI | Mic-Button im bestehenden BugreportDialog | Kein neues UI-Paradigma nötig |
| Voice-Pipeline Quelle | Port aus cipher-desktop voice-core, JS→TS Konvertierung + Audit | Plattform-agnostisch designed, bewährt |
| Koexistenz | Beide Apps können laufen, nur ein Voice-Modus aktiv | Geteilte Modelle auf Disk, getrennte Prozesse |

## Architektur

### Portierte Module (cipher-desktop → cipher-mux)

Alle Module aus `cipher-desktop/src/voice-core/` werden nach `cipher-mux/src/main/voice/` portiert und von CommonJS/JS zu TypeScript konvertiert. Audit: tote Code-Pfade entfernen, Typen ergänzen, Naming vereinheitlichen.

| Quell-Modul (cipher-desktop) | Ziel-Modul (cipher-mux) | Zweck |
|------------------------------|-------------------------|-------|
| `stt-engine.js` | `src/main/voice/stt-engine.ts` | Lokales Whisper.cpp (Metal GPU) |
| `stt-router.js` | `src/main/voice/stt-router.ts` | STT-Provider-Abstraktion + Fallback |
| `tts-engine.js` | `src/main/voice/tts-engine.ts` | Abstrakte TTS-Schnittstelle |
| `tts-piper.js` | `src/main/voice/tts-piper.ts` | Piper VITS via sherpa-onnx Worker |
| `piper-worker.js` | `src/main/voice/piper-worker.js` | Child-Process Worker (bleibt JS, System-Node) |
| `audio-utils.js` | `src/main/voice/audio-utils.ts` | PCM/WAV Konvertierung |
| `voice-state.js` | `src/main/voice/voice-state.ts` | FSM (idle→ready→recording→processing→agent_speaking) |
| `conversation-engine.js` | `src/main/voice/conversation-engine.ts` | Turn-Management, Toggle-to-Speak |
| `audio-capture-worklet.js` | `src/renderer/voice/audio-capture-worklet.js` | AudioWorklet (bleibt JS, Web API) |

### Nicht portiert (out of scope)

| Modul | Grund |
|-------|-------|
| `stt-deepgram.js` | Cloud-Provider, nicht für Phase 7b (STT-Router Interface bleibt, kann später nachgerüstet werden) |
| `stt-elevenlabs.js` | Cloud-Provider, nicht für Phase 7b |
| `tts-kokoro.js` | Alternativer TTS-Provider, nicht nötig |
| `tts-elevenlabs.js` | Cloud TTS, nicht nötig |
| `tts-factory.js` | Factory für Multi-Provider, Overkill (nur Piper) |
| `voice-manager.js` | Cipher-desktop-spezifischer Orchestrator, ersetzen durch schlankere Integration |
| `voice-modes.js` | Sovereign/Flow/Everyday Presets, nicht relevant |
| `vad-loader.js` + VAD-Assets | VAD nicht nötig (Toggle-to-Speak only) |

### Neue Module

| Modul | Zweck |
|-------|-------|
| `src/main/voice/voice-manager.ts` | Schlanker Voice-Manager für cipher-mux: Init STT+TTS, steuert Conversation-Engine |
| `src/main/voice/ollama-chat.ts` | Multi-Turn Chat-Client für Ollama `/api/chat` mit Gemma 4 |
| `src/main/voice/bugreport-interview.ts` | Bug-Interview-Logik: System-Prompt, Turn-Routing, Report-Generierung |
| `src/renderer/voice/use-voice-bugreport.ts` | Preact Hook für Voice-Bugreport UI-State |

### End-to-End Flow

```
User klickt Mic-Button im BugreportDialog
        ↓
AudioWorklet startet Capture (16kHz PCM)
        ↓
User spricht → Toggle-to-Speak (Mic-Button loslassen)
        ↓
PCM-Chunks → Main Process → Whisper STT
        ↓
Transkription → Ollama Chat API (Gemma 4)
  System-Prompt: "Du bist ein Bug-Interview-Assistent für cipher-mux.
   Fasse den Bug zusammen und frage gezielt nach fehlenden Details.
   Halte dich kurz (1-2 Sätze). Nach 2-3 Rückfragen: generiere
   den finalen strukturierten Report im Markdown-Format."
        ↓
Gemma antwortet (Text)
        ↓
Piper TTS → Audio → Renderer Playback
        ↓
User antwortet auf Rückfrage (nächster Turn)
        ↓  ... (1-3 Turns) ...
        ↓
Gemma generiert finalen Report
        ↓
Report-Text → Textarea im BugreportDialog (editierbar)
```

### Conversation-Engine Anpassung

Die cipher-desktop Conversation-Engine hat Features die wir brauchen und solche die wir nicht brauchen:

**Behalten:**
- Turn-State-Machine (idle → ready → recording → processing → agent_speaking)
- Toggle-to-Speak (Mic-Button = Start/Stop)
- Audio-Buffer-Management
- Silence-Timeout (Safety-Stop nach 30s)

**Entfernen/Vereinfachen:**
- Barge-In (kein Unterbrechen von Gemma nötig — die Antworten sind 1-2 Sätze)
- Echo-Guard (kein Always-Listen-Modus)
- VAD-Integration (kein VAD)
- Cloud-Endpointing (kein Streaming-STT)
- Interrupted-Context-Tracking

### Ollama Chat Integration

Neuer Client `ollama-chat.ts`, unabhängig vom bestehenden `ollama-client.ts` (der macht Batch-Enrichment):

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OllamaChatOpts {
  model: string          // 'gemma3:4b'
  host: string           // '127.0.0.1'
  port: number           // 11433
  systemPrompt: string
}

class OllamaChat {
  constructor(opts: OllamaChatOpts)
  async send(userMessage: string): Promise<string>  // Returns assistant response
  getHistory(): ChatMessage[]
  reset(): void
}
```

### Bugreport-Interview

`bugreport-interview.ts` verbindet Voice-Pipeline mit Ollama:

```typescript
class BugreportInterview extends EventEmitter {
  constructor(opts: { voiceManager: VoiceManager, ollamaChat: OllamaChat })

  start(): void           // Startet Interview, spielt Begrüßung
  onUserTranscription(text: string): void  // STT-Ergebnis → Gemma
  isComplete(): boolean   // Gemma hat finalen Report generiert
  getReport(): string     // Strukturierter Report-Text

  // Events:
  // 'agent-speaking' — Gemma antwortet (Text für TTS)
  // 'interview-complete' — Report fertig
  // 'error' — Ollama nicht erreichbar etc.
}
```

System-Prompt für Gemma:
```
Du bist ein Bug-Interview-Assistent für die Anwendung cipher-mux.
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

Antworte auf Deutsch.
```

### IPC-Channels (neu)

```typescript
// Voice control
'cipher-mux:voice:start'          // Start mic capture
'cipher-mux:voice:stop'           // Stop mic capture
'cipher-mux:voice:audio-chunk'    // PCM chunk from renderer
'cipher-mux:voice:state'          // FSM state update → renderer
'cipher-mux:voice:transcription'  // STT result → renderer (für Live-Anzeige)
'cipher-mux:voice:agent-text'     // Gemma response text → renderer
'cipher-mux:voice:agent-audio'    // TTS audio chunk → renderer (base64 WAV)
'cipher-mux:voice:interview-done' // Report fertig → renderer
'cipher-mux:voice:error'          // Error → renderer
```

### UI-Änderungen (BugreportDialog)

Mic-Button neben dem Textarea. Drei Zustände:

1. **Idle** — Mic-Icon, grau. Klick startet Voice-Interview.
2. **Recording** — Mic-Icon pulsiert rot. User spricht. Klick stoppt Aufnahme.
3. **Processing** — Spinner. Whisper transkribiert / Gemma denkt.
4. **Agent Speaking** — Speaker-Icon. Piper spielt Antwort. Danach zurück zu Idle für nächsten Turn.
5. **Complete** — Report im Textarea, Mic-Button wieder Idle.

Gesprächsverlauf wird als kleine Chat-Bubbles über dem Textarea angezeigt (User-Turns links, Gemma rechts). Am Ende wird nur der finale Report ins Textarea übernommen.

### Geteilte Modelle

Whisper und Piper Modelle liegen unter `~/Library/Application Support/`:
- Whisper: `cipher-mux/models/whisper/ggml-small.bin` (oder shared path)
- Piper: `cipher-desktop/models/piper/vits-piper-de_DE-dii-high/` (geteilt mit cipher-desktop)

cipher-mux nutzt denselben Piper-Modell-Pfad wie cipher-desktop. Kein doppelter Download.

### Dependencies (package.json)

Neue Dependencies:
- `@fugood/whisper.node` — Whisper.cpp mit Metal GPU
- `sherpa-onnx-node` — Piper TTS (optional, System-Node Child-Process)

Bereits vorhanden:
- Ollama-Client (HTTP fetch, kein extra Package)

## Tests

### Unit-Tests

| Modul | Tests | Beschreibung |
|-------|-------|-------------|
| `voice-state.ts` | ~5 | Transitions, invalid transitions, reset |
| `audio-utils.ts` | ~3 | pcmToWav, edge cases |
| `ollama-chat.ts` | ~4 | Multi-turn history, reset, error handling |
| `bugreport-interview.ts` | ~4 | Turn-Routing, Report-Erkennung, System-Prompt |
| `stt-engine.ts` | ~2 | Hallucination filtering, noise filtering |

### Manueller E2E-Test

Voice-Bugreport-Flow (Mic → Sprechen → Gemma-Interview → Report) wird manuell getestet.

## Nicht im Scope

- VAD (Voice Activity Detection) — nur Toggle-to-Speak
- Cloud STT (Deepgram, ElevenLabs) — Interface vorbereitet, nicht implementiert
- Cloud TTS (ElevenLabs, Kokoro) — nur Piper
- Barge-In — Gemma-Antworten sind kurz genug
- Voice-Modes (Sovereign/Flow/Everyday) — nur ein Modus
- Audio-Visualisierung / EQ — nur Mic-Icon-State
- Automatisches Modell-Download-UI — Modelle müssen manuell oder per Script installiert sein

## Dateien (geschätzt)

| Datei | Typ |
|-------|-----|
| `src/main/voice/stt-engine.ts` | Port + TS-Konvertierung |
| `src/main/voice/stt-router.ts` | Port + Vereinfachung (nur local) |
| `src/main/voice/tts-engine.ts` | Port + TS-Konvertierung |
| `src/main/voice/tts-piper.ts` | Port + TS-Konvertierung |
| `src/main/voice/piper-worker.js` | Port (bleibt JS) |
| `src/main/voice/audio-utils.ts` | Port + TS-Konvertierung |
| `src/main/voice/voice-state.ts` | Port + TS-Konvertierung |
| `src/main/voice/conversation-engine.ts` | Port + Vereinfachung |
| `src/main/voice/voice-manager.ts` | Neu — schlanker Orchestrator |
| `src/main/voice/ollama-chat.ts` | Neu — Multi-Turn Chat Client |
| `src/main/voice/bugreport-interview.ts` | Neu — Interview-Logik + Prompt |
| `src/renderer/voice/audio-capture-worklet.js` | Port (bleibt JS) |
| `src/renderer/voice/use-voice-bugreport.ts` | Neu — Preact Hook |
| `src/renderer/components/BugreportDialog.tsx` | Erweitern — Mic-Button + Chat-Bubbles |
| `src/main/ipc-hub.ts` | Erweitern — Voice IPC-Channels |
| `src/main/preload.ts` | Erweitern — Voice API expose |
| `src/shared/ipc-channels.ts` | Erweitern — Voice Channel-Constants |
| `scripts/download-models.sh` | Neu — Whisper + Piper Download-Script |
| `test/main/voice-state.test.ts` | Neu |
| `test/main/audio-utils.test.ts` | Neu |
| `test/main/ollama-chat.test.ts` | Neu |
| `test/main/bugreport-interview.test.ts` | Neu |
| `test/main/stt-engine.test.ts` | Neu |
