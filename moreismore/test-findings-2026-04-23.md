# Test-Findings vom funktionalen Test — 2026-04-23

> Aus dem ersten manuellen Testdurchlauf nach MPO Run.
> Priorität: Bugs und Feature-Requests für die nächste Session.

---

## Bugs / Nicht bestanden

### BUG: `--dangerously-skip-permissions` hardkodiert
- **Was:** Der Claude-Code-Adapter hardkodiert `--dangerously-skip-permissions`
- **Soll:** Das muss eine Option in den Einstellungen sein. Wir wollen Usern nicht vorgeben, so mutig zu sein.
- **Wo:** `src/main/agent/adapters/claude-code.ts` → `buildLaunchCommand()`
- **Priorität:** Hoch

### BUG: Context-Usage bleibt bei 0%
- **Was:** Die Anzeige bleibt bei 0%, statusLine-Hook scheint nicht zu funktionieren
- **Wo:** StatusLineMonitor / statusline-hook.ts Integration
- **Priorität:** Hoch (Kernfeature)

### BUG: Voice nicht testbar — "not available - native modules..."
- **Was:** Voice-Pipeline startet nicht, native Module fehlen
- **Vermutung:** Whisper.node / sherpa-onnx-node nicht korrekt für den Dev-Build kompiliert
- **Priorität:** Mittel (TP-5 nicht validierbar ohne Fix)

### FEHLEND: `.github/` Verzeichnis existiert nicht
- **Was:** TP-4 hat behauptet GitHub-Templates, CI-Workflow, CODEOWNERS erstellt zu haben — aber `.github/` existiert nicht
- **Betroffen:** Issue-Templates, PR-Template, CODEOWNERS, CI-Workflow
- **CHANGELOG erwähnt diese unter "Unreleased" — aber die Dateien fehlen
- **Priorität:** Mittel (nötig für OSS-Release)

### FEHLEND: Linux AppImage Config
- **Was:** electron-builder Config hat keine Linux-Targets. `npm run dist` baut nur `--mac dmg`
- **Priorität:** Mittel (nötig für Linux-Release)

### FEHLEND: TSDoc-Lint nicht installiert
- **Was:** `eslint-plugin-tsdoc` weder in package.json noch in ESLint-Config
- **CHANGELOG erwähnt es unter "Unreleased" — aber nicht installiert
- **Priorität:** Niedrig (Empfehlung, nicht Enforcement in v1)

---

## Feature-Requests / Verbesserungen

### Chatroom / Message Bus UI überarbeiten
- **Was:** Chatroom zeigt Messages, aber die UX ist nicht ideal
- **Vorschlag:** Kärtchen je laufender Hintergrund-Session (+ Orchestrator + MPO Orchestrator):
  - Header mit Session-Name
  - Kleiner Text-Body mit letzter Nachricht der Session
  - Doppelklick öffnet die Session im Mux (gibt User Zugriff)
- **Zweck:** User soll die Kommunikation der Hintergrund-Sessions mit dem Orchestrator mitbekommen
- **Priorität:** Mittel (UX-Verbesserung)

### Activity-Rail existiert nicht mehr
- **Was:** Tests referenzieren Activity-Rail, aber die gibt es nicht mehr im UI
- **Kontext:** Jede aktive Session ist direkt im Grid sichtbar — Activity-Rail ist überflüssig
- **Aktion:** Tests und Doku anpassen, Activity-Rail-Referenzen entfernen

---

## Bestanden

- TP-1 Profile-Overlay: App startet, Profile funktionieren ✓
- TP-2 AgentAdapter: Adapter-Capabilities in mux_sessions ✓, Reference-Stub ✓, Orchestrator-Template ✓
- TP-3 21-Session Grid: Layout korrekt auf QHD und DQHD ✓, dynamische Skalierung ✓
- TP-4 Platform-Abstraktion: xdg-open Fallback vorhanden ✓, kein osascript ohne Check ✓
- TP-4 Doku: README, CONTRIBUTING, ARCHITECTURE, CHANGELOG vorhanden ✓

---

## TP-4 Drift-Analyse

TP-4 hat mehrere Deliverables im CHANGELOG als "done" markiert die tatsächlich nicht existieren:
- `.github/` Templates und Workflows
- `eslint-plugin-tsdoc` Installation
- Linux AppImage Build-Target

Das ist ein **Drift-Problem**: Die Session hat die CHANGELOG-Einträge geschrieben aber die eigentlichen Dateien nicht erstellt. Mögliche Ursache: Session hat die Tasks als "done" markiert während sie noch am Schreiben war, dann Kontextfenster-Limit erreicht oder abgebrochen.

**Learning für MPO:** Akzeptanzkriterien müssen durch den Orchestrator VERIFIZIERT werden (Datei-Existenz-Check), nicht nur durch Session-Selbstauskunft.
