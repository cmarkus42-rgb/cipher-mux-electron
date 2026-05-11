# Design Spec: Code-Audit 2026-05-11 — 6 Auftraege

**Datum:** 2026-05-11
**Quelle:** Testing-Assistant Code-Audit + Findings-Report
**Testcase-Note:** "Retest-Testcases: Konsolidiert 2026-05-10"
**Projekt:** `cipher-mux-electron`

---

## Uebersicht

Sechs Auftraege aus dem Code-Audit, aufgeteilt in drei sequentielle Wellen:

| # | Auftrag | Testcases | Welle |
|---|---------|-----------|-------|
| A1 | Bugreport-Dialog → Session-basiert | T-BVRL.3/4/5/7/9/11 | 2 |
| A2 | Orchestrator → Workshop Rename | — | 1 |
| A3 | Theme-Editor Bereinigung | T-THEME.1/3/4, T-FW.10 | 3 |
| A4 | Keep-Working Race Fix | T-FW.22 | 1 |
| A5 | Barge-In Echo Guard Fix | T-VOICE.12 | 3 |
| A6 | Preset-Editor: Copy as Custom entfernen, Template verbessern | T-PRESET.1 | 1 |

---

## A1: Bugreport-Dialog → Session-basiert (F-HIGH-01)

### Problem

`BugreportDialog.tsx` ruft `api().bugreport.enrich()` auf, was ueber `bugreport-manager.ts` → `ollama-client.ts` einen direkten HTTPS-Call an `api.anthropic.com` (Claude Haiku) oder lokales Ollama macht. Das Bugreport-Entity-Preset (`~/.config/cipher-mux/entities/bugreport/CLAUDE.md`) existiert, wird aber komplett ignoriert.

### Soll-Flow

1. User oeffnet Bugreport-Dialog (Cmd+B)
2. User gibt Text ein (Textarea + STT)
3. Button "Verarbeiten" → IPC-Call → Main-Process startet Bugreport-Entity-Session im Hintergrund
4. Text wird per `tmux send-keys` an die Session geschickt
5. Warte-Anzeige im Dialog waehrend Session arbeitet
6. Session liefert strukturierten Report zurueck (via tmux capture-pane Polling oder IPC-Rueckkanal)
7. "Absenden" Button wird scharf geschaltet
8. Absenden → GitHub Issue + Note via `mux_notes_create`

### Was entfernt wird

- `src/main/bugreport/ollama-client.ts`: `enrichViaClaude()`, `enrichViaOllama()`, `enrichBugreport()` — die drei Funktionen fuer direktes Bugreport-Enrichment. `testOllamaConnection()`, `listOllamaModels()`, `parseEnrichedOutput()` bleiben (werden von Note-Tagging und Settings genutzt).
- `BugreportDialog.tsx`: `handleEnrich` Logik (direkter IPC-Call zu `bugreport.enrich`)
- `config-store.ts`: `bugreportEnrichBackend` Config-Key (cloud/local Auswahl)
- `bugreport-manager.ts`: `enrich()` Methode

### Was hinzukommt

**IPC-Channels (ipc-channels.ts):**
- `BUGREPORT_PROCESS` — startet Bugreport-Entity-Session, sendet Text, liefert strukturiertes Ergebnis zurueck

**Main-Process (bugreport-manager.ts oder neues Modul):**
- `processBugreport(description: string)`: startet Bugreport-Entity-Session (background, nicht im Grid), sendet den User-Text als Prompt per `tmux send-keys`, pollt `tmux capture-pane` auf strukturierten Output, parsed das Ergebnis, killt die Session, gibt `EnrichedBugreport` zurueck.
- Session wird als `autoLaunchedSession` gefuehrt (wie voice-relay), erscheint nicht im Grid.
- Timeout: 120s, danach Session killen und Fehler zurueckgeben.

**Renderer (BugreportDialog.tsx):**
- "Verarbeiten" Button → `api().bugreport.process(description)` (neuer IPC-Call)
- State: `processing` (boolean) statt `enriching`
- Warte-Anzeige: Spinner + Text ("Session verarbeitet...")
- "Absenden" erst aktiv wenn `enriched` gesetzt ist
- Direkter Submit ohne Enrichment bleibt als Fallback (wenn User will)

### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/main/bugreport/ollama-client.ts` | `enrichViaClaude`, `enrichViaOllama`, `enrichBugreport` entfernen |
| `src/main/bugreport/bugreport-manager.ts` | `enrich()` entfernen, `processBugreport()` hinzufuegen |
| `src/renderer/components/BugreportDialog.tsx` | handleEnrich → handleProcess, Warte-UI |
| `src/shared/ipc-channels.ts` | `BUGREPORT_PROCESS` hinzufuegen |
| `src/main/ipc-hub.ts` | IPC-Handler fuer `BUGREPORT_PROCESS` |
| `src/main/preload.ts` | `bugreport.process()` exponieren |
| `src/shared/types.ts` | ggf. `bugreportEnrichBackend` aus Config-Type entfernen |
| `src/main/config/config-store.ts` | `bugreportEnrichBackend` Default entfernen |

---

## A2: Orchestrator → Workshop Rename (F-HIGH-02)

### Problem

Entity-ID ist `'orchestrator'` im Code und Filesystem, obwohl das Konzept "Workshop" heisst. `displayName` ist bereits `'Workshop'` in `entity-registry.ts:74`, aber ID, Pfade, IPC-Channels und Locale-Keys sagen noch "orchestrator".

### Rename-Mapping

| Alt | Neu |
|-----|-----|
| Entity-ID `'orchestrator'` | `'workshop'` |
| IPC `ORCHESTRATOR_START` / `cipher-mux:orchestrator:start` | `WORKSHOP_START` / `cipher-mux:workshop:start` |
| IPC `ORCHESTRATOR_STOP` / `cipher-mux:orchestrator:stop` | `WORKSHOP_STOP` / `cipher-mux:workshop:stop` |
| IPC `ORCHESTRATOR_STATUS` / `cipher-mux:orchestrator:status` | `WORKSHOP_STATUS` / `cipher-mux:workshop:status` |
| IPC `ORCHESTRATOR_STARTED` / `cipher-mux:orchestrator:started` | `WORKSHOP_STARTED` / `cipher-mux:workshop:started` |
| Filesystem `~/.config/cipher-mux/entities/orchestrator/` | `~/.config/cipher-mux/entities/workshop/` |
| Config-Key `configStore.get('orchestrator')` | `configStore.get('workshop')` |

### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/main/session/entity-registry.ts` | `id: 'orchestrator'` → `'workshop'`, `projectPath` anpassen |
| `src/shared/ipc-channels.ts` | `ORCHESTRATOR_*` → `WORKSHOP_*` (Konstanten + Strings) |
| `src/main/ipc-hub.ts` | Alle `'orchestrator'` Referenzen → `'workshop'` (deploy, IPC-Handler, ENTITIES_WITH_TEMPLATE, config-key) |
| `src/main/session/resolve-session-topic.ts` | Map-Key `orchestrator` → `workshop` |
| `src/main/session/entity-scanner.ts` | Kommentare aktualisieren (kein funktionaler Code betroffen) |
| `src/main/preload.ts` | `orchestrator` API → `workshop` |
| `src/renderer/app.tsx` | Alle `orchestrator` Referenzen → `workshop` |
| `src/renderer/locales/en.json` | Keys/Values umbenennen |
| `src/renderer/locales/de.json` | Keys/Values umbenennen |
| `src/renderer/components/*.tsx` | Grep + Replace in SessionGrid, SessionCell, PaneHeader, SidebarPanel, CompanionTab, SidebarWindow, InfoSettingsView |
| `src/shared/types.ts` | Ggf. Type-Referenzen |
| `src/shared/brand.ts` | `orchestratorDir` → `workshopDir` |
| `src/shared/constants.ts` | Pruefen auf Referenzen |
| `src/main/workshop/workshop-template.ts` | Interne Referenzen pruefen |
| `src/main/config/config-store.ts` | Config-Key `orchestrator` → `workshop` |
| `src/main/project/kickoff-orchestrator.ts` | Klasse/Datei ggf. umbenennen (KickoffOrchestrator → KickoffWorkshop) |
| `src/main/mcp/mcp-tools.ts` | Tool-Referenzen pruefen |
| `src/main/mcp/handoff-kernel.ts` | Referenzen pruefen |
| `src/main/entity-content/companion-*.ts` | Alle 5 Dateien auf `orchestrator` Referenzen pruefen |
| `src/main/character/character-defaults.ts` | Pruefen |
| `src/shared/persona-types.ts` | Pruefen |
| `src/main/agent/agent-adapter.ts` | Pruefen |
| `src/main/agent/adapters/claude-code.ts` | Pruefen |
| `src/main/agent/adapters/_reference-stub.ts` | Pruefen |

### Migration

Beim App-Start: wenn `~/.config/cipher-mux/entities/orchestrator/` existiert und `workshop/` nicht, automatisch umbenennen (`fs.renameSync`). Log-Meldung ausgeben. Bestehende Sessions mit `entityId: 'orchestrator'` werden durch tmux-Session-Matching bei Recovery sowieso korrekt zugeordnet — der Entity-Scanner matcht auf Verzeichnisnamen, nicht auf gespeicherte entityIds.

Zusaetzlich: `configStore` Migration-Hook der `orchestrator`-Key auf `workshop` umbenennt.

---

## A3: Theme-Editor Session-Gruppe bereinigen

### Aenderungen an der Session-Token-Gruppe

| Token | Aktion |
|-------|--------|
| `--session-bg` | Bleibt (funktioniert) |
| `--session-text` | Fixen: CSS-Wiring pruefen, Token muss auf Session-Cell-Text wirken |
| `--session-border` | Fixen: CSS-Wiring pruefen, Token muss auf Session-Cell-Border wirken |
| `--session-font-size` | Entfernen (redundant mit A11Y) |
| `--color-session-header-bg` | Bleibt (funktioniert) |
| `--shadow-inset` | Entfernen |

### Terminal-Farben hinzufuegen

Neue Tokens fuer xterm.js Rendering:
- `--terminal-bg` — Terminal-Hintergrundfarbe
- `--terminal-foreground` — Terminal-Standard-Textfarbe
- `--terminal-cursor` — Cursor-Farbe
- `--terminal-selection` — Auswahl-Hintergrund
- ANSI-Farb-Tokens: `--terminal-ansi-black`, `--terminal-ansi-red`, `--terminal-ansi-green`, `--terminal-ansi-yellow`, `--terminal-ansi-blue`, `--terminal-ansi-magenta`, `--terminal-ansi-cyan`, `--terminal-ansi-white` (jeweils normal + bright Variante)

Diese Tokens werden in `SessionCell.tsx` (oder wo xterm.js initialisiert wird) als `theme`-Objekt an xterm.js uebergeben.

### Terminal-Gruppe im Theme-Editor entfernen

Die gesamte Terminal-Gruppe (Font-Family, Font-Size, Line-Height) wird aus dem Theme-Editor entfernt. Diese Einstellungen leben ausschliesslich in den A11Y-Settings.

Betroffener Code: `InfoSettingsView.tsx` — der Block ab `{/* Terminal font / size / line-height */}` (ca. Zeile 583-625) wird entfernt.

### Theme-CSS-Dateien aktualisieren

Alle 14 Theme-CSS-Dateien muessen die neuen Terminal-Farb-Tokens erhalten. Sinnvolle Defaults pro Theme ableiten (z.B. Nord bekommt Nord-Terminal-Farben, Matrix bekommt gruene Schrift auf schwarzem Grund).

### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/renderer/components/InfoSettingsView.tsx` | Session-Gruppe bereinigen, Terminal-Gruppe entfernen, Terminal-Farben-UI hinzufuegen |
| `src/renderer/styles/grid.css` | `--session-text`, `--session-border` wiring fixen |
| `src/renderer/styles/components.css` | Ggf. wiring fixen |
| `src/renderer/styles/theme-*.css` (14 Dateien) | Neue Terminal-Tokens, `--session-font-size` + `--shadow-inset` entfernen |
| `src/renderer/themes.json` | Ggf. Token-Liste aktualisieren |
| `SessionCell.tsx` oder Terminal-Init-Code | xterm.js theme-Objekt aus CSS-Variablen lesen |

---

## A4: Keep-Working Race — Hintergrundsessions (T-FW.22)

### Problem

Keep-Working + App-Neustart produziert doppelte Hintergrundsessions. Race Condition zwischen keepWorking-Restore und RecoveryDialog.

### Root Cause

1. `ipc-hub.ts:427` — `cachedRecoveryResult` wird synchron auf `{ recovered: [], orphaned: [], killed: [], gridState: null }` gesetzt
2. RecoveryDialog pollt `SESSIONS_RECOVER`, bekommt das leere Result, resolved sofort
3. `app.tsx:934` — `handleRecoveryDone` feuert
4. `keepWorkingApplied.current` ist noch `false` (keepWorking-Restore-Event noch nicht im Renderer angekommen)
5. Race-Guard (Zeile 942-950) prueft `pullKeepWorkingRestore()`, aber die Daten sind im Main-Process auch noch nicht fertig (async Session-Starts laufen noch)
6. `sessionsRef.current.length === 0` → Default-Workspace wird geladen → doppelte Sessions

### Fix

**Main-Process (`ipc-hub.ts`):**

Die Zeile 427 (`this.cachedRecoveryResult = { recovered: [], ... }`) wird NICHT mehr synchron gesetzt wenn ein keepWorking-Snapshot existiert. Stattdessen:

1. `cachedRecoveryResult` bleibt `null` waehrend keepWorking-Restore laeuft
2. RecoveryDialog pollt weiter (bekommt `null`, wartet)
3. Erst NACHDEM keepWorking-Restore abgeschlossen ist UND `KEEP_WORKING_RESTORE` Event an den Renderer gesendet wurde, wird `cachedRecoveryResult` auf das leere Objekt gesetzt
4. RecoveryDialog bekommt jetzt das leere Result, resolved, `handleRecoveryDone` feuert
5. `keepWorkingApplied.current` ist zu diesem Zeitpunkt bereits `true` → kein Default-Workspace-Load

Konkret: Die keepWorking-Restore-Logik (ab Zeile 410) muss den `cachedRecoveryResult`-Write ans Ende verschieben, nach dem `KEEP_WORKING_RESTORE` Event.

### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/main/ipc-hub.ts` | `cachedRecoveryResult` Timing aendern — erst nach keepWorking-Restore setzen |

---

## A5: Barge-In Echo Guard — Amplitude-Monitor (T-VOICE.12)

### Problem

STT ist komplett tot waehrend TTS spricht. Der Echo Guard (`_echoGuardActive`) wird bei `AGENT_SPEAKING` aktiviert und nie deaktiviert (kein Timer). `onVADSpeechStart()` (Zeile 228) und `onVADMisfire()` (Zeile 246) returnen sofort bei `echoGuardActive === true`. Der gesamte Barge-In-Code ist Dead Code waehrend TTS laeuft.

### Loesung: Option C — Hybrid (Amplitude-Monitor)

Echo Guard bleibt fuer den normalen VAD/STT-Pfad aktiv (verhindert Echo-Halluzinationen). Ein paralleler Amplitude-Monitor laeuft unabhaengig und kann Barge-In direkt triggern.

### Neues Modul: `src/main/voice/barge-in-detector.ts`

```
class BargeInDetector
  - constructor(options: { thresholdDb: number, minDurationMs: number, onBargeIn: () => void })
  - start(audioStream): void — beginnt Amplitude-Monitoring
  - stop(): void — stoppt Monitoring
  - setEnabled(enabled: boolean): void — aktiviert/deaktiviert (nur waehrend AGENT_SPEAKING aktiv)
```

**Funktionsweise:**
- Empfaengt Audio-Samples aus dem Mikrofon-Stream (derselbe Stream den VAD nutzt)
- Berechnet RMS-Amplitude pro Frame (typisch 20-30ms Frames)
- Wenn RMS ueber Threshold fuer >= `minDurationMs` (default: 50ms): `onBargeIn()` Callback feuern
- Threshold konfigurierbar (default: -30dB, anpassbar ueber Voice-Settings)
- Detector ist nur aktiv waehrend `AGENT_SPEAKING` State

### Integration in ConversationEngine

- `conversation-engine.ts`: BargeInDetector instanziieren
- Bei State-Transition zu `AGENT_SPEAKING`: `bargeInDetector.setEnabled(true)`
- Bei State-Transition weg von `AGENT_SPEAKING`: `bargeInDetector.setEnabled(false)`
- `onBargeIn` Callback ruft `_handleBargeIn()` auf
- Echo Guard (`_echoGuardActive`) bleibt komplett unangetastet — wirkt weiterhin auf VAD/STT

### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/main/voice/barge-in-detector.ts` | Neues Modul |
| `src/main/voice/conversation-engine.ts` | BargeInDetector Integration, State-Transitions |
| Voice-Settings UI (optional) | Threshold-Slider (kann in spaeterer Iteration kommen) |

---

## A6: Preset-Editor — Copy as Custom entfernen, Template verbessern (T-PRESET.1)

### Problem

"Copy as Custom" kopiert nur `preset.md` + leere `CLAUDE.md`. Skills, Assets und Unterverzeichnisse des Quell-Entity werden nicht kopiert. User denkt die Kopie kann dasselbe — kann sie nicht.

### Aenderungen

**1. "Copy as Custom" Button entfernen:**
- `PresetEditor.tsx`: `handleCopyAsCustom` Funktion (Zeile 301) und Button (Zeile 391-397) entfernen
- Hinweistext "Built-in preset (read-only). Use Copy as Custom..." (Zeile 514) anpassen
- Zugehoeriger IPC-Handler im Main-Process ggf. bereinigen

**2. "Neu anlegen" Template verbessern:**

Aktuelles Template (`ipc-hub.ts:2383`): Nur leere H2-Sektionen ohne Erklaerung.

Neues Template:

```markdown
# [Name]

## Rolle

Beschreibe hier die Rolle und Persoenlichkeit des Entity.
Wer ist es, wie spricht es, was ist sein Auftrag?

## Faehigkeiten

Welche MCP-Tools nutzt dieses Entity?
Welche besonderen Workflows beherrscht es?

## Arbeitsregeln

Verhaltensregeln, Grenzen, Off-Limits.
Was darf das Entity, was nicht?

## Scope

Auf welche Projekte, Verzeichnisse oder Themen
ist dieses Entity fokussiert?

---

> Tipp: Schreib erst selbst einen Entwurf — das schaerft dein eigenes Verstaendnis.
> Dann starte eine Session mit dem Coding Companion und bitte ihn,
> daraus einen guten Prompt zu machen.
```

### Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/renderer/components/PresetEditor.tsx` | `handleCopyAsCustom` + Button + Hinweistext entfernen |
| `src/main/ipc-hub.ts` | Template-String (Zeile 2383) durch neues Template ersetzen |
| `src/renderer/locales/en.json` | Ggf. "Copy as Custom" Strings entfernen |
| `src/renderer/locales/de.json` | Ggf. Strings entfernen |

---

## Wave-Plan

### Wave 1: Rename + Race Fix + Preset-Editor (3 parallele Worker)

**Worker 1-A: Workshop Rename**
- Alle Code-Referenzen `orchestrator` → `workshop`
- IPC-Channels umbenennen
- Filesystem-Migration implementieren
- Config-Migration implementieren
- Locales aktualisieren

**Worker 1-B: Keep-Working Race Fix**
- `ipc-hub.ts` cachedRecoveryResult Timing fixen
- Sicherstellen dass RecoveryDialog wartet bis keepWorking-Restore durch ist

**Worker 1-C: Preset-Editor Cleanup**
- "Copy as Custom" Button + Handler entfernen
- Template-String in `ipc-hub.ts` durch beschreibendes Template ersetzen
- Companion-Tipp am Ende einfuegen

**Wave 1 Exit-Kriterien:**
- App startet ohne Fehler
- Workshop-Entity startet und laeuft korrekt
- Keep-Working → Restart → keine doppelten Sessions
- Preset-Editor: kein "Copy as Custom" Button, neues Template bei "Neu anlegen"

### Wave 2: Bugreport Session-Umbau (2 parallele Worker)

**Worker 2-A: Backend (Main-Process)**
- Alte Enrichment-Funktionen entfernen
- Neue `processBugreport()` mit Session-Lifecycle
- IPC-Channel registrieren
- Preload exponieren

**Worker 2-B: Frontend (Dialog)**
- `BugreportDialog.tsx` auf neuen Flow umbauen
- Warte-UI implementieren
- "Absenden" erst nach Session-Ergebnis aktiv

**Wave 2 Exit-Kriterien:**
- Bugreport-Dialog oeffnet sich
- "Verarbeiten" startet Hintergrund-Session
- Strukturierter Report wird angezeigt
- Submit erzeugt GitHub Issue

### Wave 3: Theme + Barge-In (2 parallele Worker)

**Worker 3-A: Theme-Editor**
- Session-Gruppe bereinigen (Tokens raus/fixen)
- Terminal-Farb-Tokens in alle 14 Theme-Dateien
- Terminal-Gruppe aus Theme-Editor entfernen
- xterm.js Theme-Integration

**Worker 3-B: Barge-In Detector**
- `barge-in-detector.ts` implementieren
- In ConversationEngine integrieren
- Echo Guard unangetastet lassen

**Wave 3 Exit-Kriterien:**
- Theme-Editor zeigt bereinigte Session-Gruppe
- Terminal-Farben wirken auf xterm.js
- Barge-In funktioniert waehrend TTS-Playback
- Normaler VAD/STT bleibt durch Echo Guard geschuetzt

### Wave 4: Testing-Handoff

- Testcase-Note erstellen mit allen betroffenen T-Cases
- Testing-Handoff an Testing-Assistant
