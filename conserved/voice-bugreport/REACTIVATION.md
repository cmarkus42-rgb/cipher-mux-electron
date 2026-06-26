# Voice-Bugreport — konservierte self-contained Pipeline

> **Was das ist:** Die ursprüngliche Bug-Report-Funktion aus *cipher-mux-electron*
> (Einstellungen → Bug melden) mit **eigenem, vollständig lokalem Voice-Mode**:
> Mikrofon → **Whisper.cpp (STT)** → **Ollama/Gemma-Interview** → **Piper (TTS)**.
> Kein Cloud-Call, kein Claude-Code-Entity-Relay. Genau die nützliche Version, die
> wir behalten wollten.

## Herkunft

- **Snapshot-Commit:** `ff56708` — *„merge: Phase 7b — Voice-Bugreport pipeline (STT + Ollama + Piper TTS)"*
- Dies ist der **reinste** self-contained Stand: vor dem späteren Umbau auf
  „voice-relay" (`a6e06bf`) und das heutige Entity-Session-Modell (`ec4095c`).
- Im aktuellen `main` ist das **Bugreport-Gehirn entfernt** (Interview + Chat-Clients
  + Original-Dialog gelöscht). Der generische Voice-Stack (stt-engine, tts-piper,
  piper-worker, voice-manager) lebt teils noch — siehe „Was in HEAD noch lebt".

## Datenfluss

```
[Mic] ─ AudioWorklet (48→16 kHz PCM) ─IPC─▶ STTEngine  (@fugood/whisper.node, lokal)
                                                  │  Transkript
                                                  ▼
                                          VoiceManager ─▶ ConversationEngine (toggle-to-speak)
                                                  │
                                                  ▼
                                          OllamaChat (/api/chat, multi-turn)
                                                  │
                                                  ▼
                                     BugreportInterview (Gemma) ─▶ strukturierter Report
                                                  │  Antwort-Text
                                                  ▼
                                          PiperTTS ─fork─▶ piper-worker.js (sherpa-onnx, System-Node)
                                                  │  WAV
                                                  ▼
                                          [Lautsprecher] + BugreportDialog (Mic-Button + Chat-Bubbles)
```

## Externe Abhängigkeiten (NICHT in package.json!)

Diese werden als native Module / gespawnte Binaries / lokale Dienste gebraucht — beim
Wiedereinbau explizit mitinstallieren:

| Komponente | Bezug | Hinweis |
|---|---|---|
| `@fugood/whisper.node` | npm, native | Lazy-`import()` in `stt-engine.ts`. Whisper.cpp-Binding für STT |
| `sherpa-onnx-node` | npm, native | Läuft in **geforktem `piper-worker.js` unter System-Node** (nicht Electrons embedded Node). Braucht `DYLD_LIBRARY_PATH` auf `node_modules/sherpa-onnx-node` |
| System-`node` | via `which node` | `tts-piper.ts` forkt den Worker darunter |
| **Ollama** lokal laufend | `http://localhost:11434/api/chat` | Multi-Turn-Interview-Modell (Gemma). Muss laufen |

## Modelle

`scripts/download-models.sh` lädt/erwartet:

| Modell | Pfad | Quelle |
|---|---|---|
| Whisper `ggml-small.bin` | `~/Library/Application Support/cipher-mux/models/whisper/` | `huggingface.co/ggerganov/whisper.cpp` |
| Piper `vits-piper-de_DE-dii-high` (`.onnx` + `tokens.txt`) | `~/Library/Application Support/cipher-desktop/models/piper/` | `huggingface.co/rhasspy/piper-voices` |

> ⚠️ Piper-Pfad zeigt historisch auf `cipher-desktop` (geteilt). Beim Wiedereinbau
> ggf. auf `cipher-mux` vereinheitlichen (siehe `voice-manager.ts` `piperModelsDir`-Default).

## Verzeichnis dieses Pakets

```
conserved/voice-bugreport/
├── REACTIVATION.md            ← dieses Dokument
├── MANIFEST.md                ← Datei-für-Datei-Liste mit Rolle
├── snapshot/                  ← Code @ ff56708, strukturerhaltend (1:1 zurückkopierbar)
│   ├── src/main/voice/...     ← kompletter Voice-Stack
│   ├── src/renderer/...       ← BugreportDialog + Hook + AudioWorklet
│   ├── scripts/download-models.sh
│   ├── test/main/...          ← 5 zugehörige Tests
│   └── docs/                  ← Original Design-Spec + 2731-Zeilen-Implementierungsplan
└── wiring/
    ├── phase7b-wiring.diff    ← Änderungen in geteilten Dateien (ipc-hub, preload,
    │                            ipc-channels, components.css) — diese NICHT 1:1 kopieren,
    │                            sondern als Referenz für die IPC-/Preload-Verdrahtung
    └── package.snapshot.json  ← package.json @ Snapshot (Build-Scripts als Referenz)
```

## Wiedereinbau — Schritte

1. **Code zurücklegen:** `snapshot/src/**` strukturerhaltend ins Ziel-Repo kopieren.
   `snapshot/scripts/download-models.sh` und `snapshot/test/main/**` ebenso.
2. **Verdrahtung:** `wiring/phase7b-wiring.diff` lesen und die IPC-Channels
   (`src/shared/ipc-channels.ts`), Hub-Handler (`src/main/ipc-hub.ts`), Preload-API
   (`src/main/preload.ts`) und CSS (`components.css`) **manuell nachziehen** — diese
   Dateien sind im aktuellen Repo längst weitergewandert, ein 1:1-Patch würde brechen.
3. **Native Deps:** `@fugood/whisper.node` + `sherpa-onnx-node` installieren und
   für Electron rebuilden (`electron-rebuild`). System-Node muss auffindbar sein.
4. **Modelle:** `bash scripts/download-models.sh` (Whisper) + Piper-Voice manuell
   ablegen.
5. **Ollama:** lokal starten, Interview-Modell (Gemma) vorhalten.
6. **Tests:** `test/main/{audio-utils,bugreport-interview,ollama-chat,stt-engine,voice-state}.test.ts`
   laufen lassen — sie pinnen das erwartete Verhalten.

## Was in HEAD (heute) noch lebt — beim Wiedereinbau prüfen, nicht doppeln

Diese Dateien existieren im aktuellen `main` noch (evtl. in neuerer Form):
`stt-engine.ts`, `stt-router.ts`, `tts-piper.ts`, `tts-engine.ts`, `piper-worker.js`,
`voice-manager.ts`, `voice-state.ts`, `audio-utils.ts`, `whisper-node.d.ts`,
`audio-capture-worklet.js`.

**Gelöscht** (= der eigentliche Kern, der hier konserviert ist):
`bugreport-interview.ts`, `ollama-chat.ts`, `conversation-engine.ts` (Bugreport-Variante),
`use-voice-bugreport.ts`, der self-contained `BugreportDialog.tsx`, sowie die Tests
`bugreport-interview.test.ts` / `ollama-chat.test.ts`.

→ Beim Reaktivieren primär die **gelöschten** Stücke einsetzen und gegen die
ggf. weiterentwickelten HEAD-Versionen der erhaltenen Dateien anpassen.
