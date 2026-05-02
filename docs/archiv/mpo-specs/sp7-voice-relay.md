# SP-7: Voice Relay Session — Detail-Spec

> MPO Sub-Projekt 7 | Wave 3 | Aufwand: ~1-1.5d
> 6. Entity | Voice-Backend existiert bereits, Entity-Integration fehlt

---

## Ziel

Voice Relay als eigenstaendige Entity registrieren. Nicht ein UI-Toggle, sondern eine vollwertige Background-Session mit MCP-Operator-Rolle die ueber Voice gesteuert wird.

## Kontext

- **Voice-Backend existiert:** `src/main/voice/` hat VAD, Whisper STT, Piper TTS, ConversationEngine, VoiceManager
- **IPC-Channels existieren:** voice:start, voice:stop, voice:state-changed, etc. (siehe `ipc-channels.ts`)
- **Renderer-Hooks existieren:** `useVoiceSession.ts`, `VoiceControl.tsx`
- **Was fehlt:** Entity-Registration, eigene Session die Voice-Input empfaengt, MCP-Operator-Prompt, Entity-Template

## Was neu kommt

### A1: Entity registrieren (entity-registry.ts)
- Neue Entity `voice-relay` in `registerBuiltinEntities()`:
  ```ts
  {
    id: 'voice-relay',
    displayName: 'Voice',
    icon: '🎙',
    color: '#9b59b6',
    projectPath: `${entitiesBase}/voice-relay`,
    features: ['mcp'],
    visible: true,
    autoResume: false,
  }
  ```
- StatusBar-Reihenfolge aktualisieren: Workspaces → Companion → Refinement → Orchestrator → MPO → **Voice** → Audit → Bugreport
- Test aktualisieren: `entity-registry.test.ts` — Count + ID-Liste

### A2: Voice-Relay Template (audit-template.ts Pattern)
- Neue Datei: `src/main/session/voice-relay-template.ts`
- `generateVoiceRelayClaudeMd()` — der Prompt fuer die Voice-Session:
  - Relay-Charakter (wird via Persona-Injection eingefuegt, s. SP-11)
  - MCP-Operator-Rolle: "Du hast Zugriff auf cipher-mux MCP-Tools"
  - Konversations-Modus: natuerliche Sprache, keine Code-Bloecke, keine Markdown-Formatierung
  - Proaktives Tool-Angebot: "Soll ich mal in die Session schauen?"
  - Grenzen: spricht, tippt nicht direkt in Sessions
- In `session-manager.ts` → `startEntity()`: Voice-Relay bekommt eigenen Template-Generator (wie Audit)

### A3: Voice-Input an Entity-Session routen
- `voice-input-router.ts` anpassen: Wenn Voice-Relay-Entity laeuft, Transcriptions dorthin routen
- Aktueller Flow: VAD → Whisper → Transcription → ... (pruefen wohin es aktuell geht)
- Neuer Flow: VAD → Whisper → Transcription → `mux_send` an Voice-Relay-Session
- Fallback: Wenn Voice-Relay nicht laeuft, bestehendes Verhalten beibehalten

### A4: Voice-Output von Entity-Session
- Voice-Relay-Session Antworten → TTS (Piper)
- `voice-output-router.ts` anpassen: Session-Output der Voice-Relay-Entity abfangen → TTS
- Conversation-Turn-Management: Warten bis TTS fertig, dann wieder VAD aktivieren

### A5: StatusBar Voice-Button
- Voice-Entity-Button in StatusBar (wie andere Entities)
- Zusaetzlich: Kleiner Mic-Indikator wenn Voice aktiv (pulsierender Punkt)
- Click startet Voice-Relay Entity (wenn nicht laufend) ODER oeffnet sie im Grid

## Wichtig: Was NICHT in diesem SP

- Kein neues Voice-UI-Design (das ist cipher-desktop, nicht cipher-mux)
- Kein VAD/Whisper/Piper-Umbau — die Engines bleiben wie sie sind
- Keine Voice-Settings-UI — bestehende Settings reichen erstmal

## Reihenfolge

1. A1 (Entity) → A2 (Template) → A5 (StatusBar)
2. A3 (Input-Routing) + A4 (Output-Routing) parallel nach A1

## Quality Gate

| # | Kriterium | Pruefung |
|---|---|---|
| Q1 | Entity registriert | `voice-relay` in EntityRegistry.list() |
| Q2 | CLAUDE.md deployed | `startEntity('voice-relay')` schreibt Template |
| Q3 | StatusBar zeigt Voice | Button zwischen MPO und Audit |
| Q4 | Input-Routing | Transcription landet in Voice-Session |
| Q5 | Output-Routing | Session-Antwort geht an TTS |
| Q6 | Tests gruen | Bestehende + neue Entity-Registry-Tests |
| Q7 | Build sauber | `npm run build` |

## Testcases

1. Voice-Relay Entity starten → Session erscheint im Grid → CLAUDE.md hat Voice-Prompt
2. Voice aktivieren → Sprechen → Transcription erscheint in Voice-Session
3. Voice-Session antwortet → Antwort wird via TTS gesprochen
4. Voice-Session stoppen → Voice-Input geht an Fallback (bisheriges Verhalten)
5. StatusBar: Voice-Button sichtbar, klickbar

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- Voice-Backend: `src/main/voice/`
- VoiceControl: `src/renderer/components/VoiceControl.tsx`
- useVoiceSession: `src/renderer/hooks/useVoiceSession.ts`
- Entity-Registry: `src/main/session/entity-registry.ts`
- Persona-Drafts: `docs/mpo-specs/persona-drafts/overlay-voice-relay.md`
