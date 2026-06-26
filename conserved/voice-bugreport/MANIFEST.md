# MANIFEST — voice-bugreport snapshot (@ ff56708)

Datei-für-Datei, mit Rolle in der Pipeline. Pfade relativ zu `snapshot/`.

## Main-Prozess — Voice-Stack (`src/main/voice/`)

| Datei | Rolle |
|---|---|
| `voice-manager.ts` | **Orchestrator.** Verdrahtet STT (Whisper via STTRouter), TTS (PiperTTS), ConversationEngine und das Bugreport-Interview. Einstiegspunkt der Pipeline. Hält Modell-Pfad-Defaults |
| `stt-engine.ts` | Whisper.cpp-Wrapper (`@fugood/whisper.node`, lazy-import) + Halluzinations-/Rausch-Filter |
| `stt-router.ts` | Local-only Routing-Layer über STTEngine (vereinfachter Port aus cipher-desktop) |
| `tts-engine.ts` | Abstrakte TTS-Basisklasse (Interface für konkrete Engines) |
| `tts-piper.ts` | PiperTTS via `sherpa-onnx-node`. Forkt `piper-worker.js` unter System-Node, setzt `DYLD_LIBRARY_PATH` |
| `piper-worker.js` | Child-Process für Piper-Inferenz. Läuft unter System-Node (nicht Electron), weil `sherpa-onnx-node` das braucht |
| `conversation-engine.ts` | Toggle-to-speak Turn-Management (~200 Zeilen, Port aus cipher-desktop) |
| `ollama-chat.ts` | Multi-Turn `/api/chat`-Client gegen lokales Ollama |
| `bugreport-interview.ts` | **Das „Gehirn".** Gemma-geführtes Interview → strukturierter Bug-Report. Enthält `BUGREPORT_SYSTEM_PROMPT` |
| `audio-utils.ts` | `pcmToWav`: Float32-PCM → WAV-Buffer (1ch, 16-bit, RIFF-Header) |
| `voice-state.ts` | VoiceStateMachine (FSM für Aufnahme-/Sprech-Zustände) |
| `whisper-node.d.ts` | Typdeklarationen für die optionale native Dependency `@fugood/whisper.node` |

## Renderer (`src/renderer/`)

| Datei | Rolle |
|---|---|
| `components/BugreportDialog.tsx` | UI: Mic-Button + Chat-Bubbles. Self-contained Dialog der Phase-7b-Ära |
| `voice/use-voice-bugreport.ts` | React-Hook: Audio-Capture-Lifecycle + IPC-Anbindung an VoiceManager |
| `voice/audio-capture-worklet.js` | AudioWorklet: Mikrofon-Capture + Downsampling 48 kHz → 16 kHz PCM |

## Scripts & Tests

| Datei | Rolle |
|---|---|
| `scripts/download-models.sh` | Lädt Whisper `ggml-small.bin`, prüft/erwartet Piper-Voice |
| `test/main/audio-utils.test.ts` | WAV-Header-Konvertierung |
| `test/main/stt-engine.test.ts` | STT + Halluzinations-Filter |
| `test/main/bugreport-interview.test.ts` | Interview-Logik → strukturierter Report |
| `test/main/ollama-chat.test.ts` | Multi-Turn-Chat-Client |
| `test/main/voice-state.test.ts` | FSM-Übergänge |

## Docs (`docs/`)

| Datei | Rolle |
|---|---|
| `2026-04-19-voice-bugreport-DESIGN.md` | Original Design-Spec |
| `2026-04-19-voice-bugreport-PLAN.md` | 2731-Zeilen TDD-Implementierungsplan (12 Tasks) — die maßgebliche Bauanleitung |

## Wiring (`../wiring/`)

| Datei | Rolle |
|---|---|
| `phase7b-wiring.diff` | Diff der geteilten Dateien (`ipc-hub.ts`, `preload.ts`, `ipc-channels.ts`, `components.css`) ggü. `ff56708^1`. Referenz für IPC-/Preload-Verdrahtung — **nicht 1:1 patchen** |
| `package.snapshot.json` | `package.json` @ Snapshot (Build-/Rebuild-Scripts als Referenz) |
