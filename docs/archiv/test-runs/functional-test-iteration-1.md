# Funktionale Testcases — Iteration 1 (Post-Bugfix)

> Aktualisierte Testcases nach Bugfix-Iteration 1 (2026-04-23).
> Bugfixes: Voice CSS, Voice Pipeline, Terminal Theme, Window Height, Fixed-Width Sessions, Session Discovery.

---

## Vorbereitung

1. Production cipher-mux.app beenden (oder Dev-Mode nutzen — Single-Instance-Lock ist jetzt deaktiviert im Dev)
2. `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron`
3. `npm run build` — muss fehlerfrei durchlaufen
4. `npm run dev` — App muss starten

---

## Voice (TP-5 + Bugfixes BH1ESP)

### Test V.1: Voice Toggle UI
- [ ] Floating Pill unten links sichtbar
- [ ] **Square Toggle Switch** (kein Emoji!) — 32x18px, quadratisch, kein border-radius
- [ ] Toggle schaltet Voice-Pipeline ein/aus
- [ ] Neon-grüner Glow wenn aktiviert
- [ ] **LED-Indicator** (7x7px Quadrat) zeigt State:
  - off: grau
  - ready: grün mit Glow
  - recording: rot pulsierend
  - processing: orange pulsierend

### Test V.2: Voice Availability
- [ ] DevTools öffnen (Cmd+Alt+I)
- [ ] Voice Toggle klicken
- [ ] Console zeigt `[VoiceSession]` Diagnose-Logs
- [ ] Falls "not available": Whisper-Modell prüfen (`~/.config/cipher-mux/models/whisper/ggml-small.bin`)
- [ ] Falls verfügbar: `[Voice] startSessionMode` in Console

### Test V.3: PTT → Session-Input
- [ ] Voice aktivieren (Toggle grün)
- [ ] Session fokussieren (Grid-Kachel klicken)
- [ ] Ctrl+Shift+Space halten → LED rot
- [ ] Sprechen: "hello world"
- [ ] Loslassen → LED orange (processing)
- [ ] Toast (amber): Transkription anzeigen
- [ ] Text erscheint in fokussierter tmux-Session
- [ ] Toast (grün): "Sent to [Session-Name]"
- [ ] LED zurück auf grün (ready)

### Test V.4: Keine Session fokussiert
- [ ] Voice aktiv, keine Session ausgewählt
- [ ] PTT → Hinweis statt stilles Verwerfen

### Test V.5: Coding-Begriffe
- [ ] "function async await TypeScript" sprechen
- [ ] Transkription enthält korrekte Coding-Terminologie

### Test V.6: Bugreport-Flow Regression
- [ ] Bugreport-Dialog öffnen (Status-Bar Button)
- [ ] Voice-Bugreport-Interview funktioniert weiterhin
- [ ] Kein Konflikt zwischen Bugreport-Modus und Session-Input

---

## Terminal Theme (Bugfix DDEKTM)

### Test T.1: Dark Theme Terminal
- [ ] Theme auf Dark umschalten (Status-Bar Theme-Button)
- [ ] Terminal-Text ist **gedämpftes Grün** (#8aac8e), nicht helles Weiß
- [ ] Hintergrund dunkler als vorher (#1a1e24)
- [ ] Blaue Accents sichtbar aber dunkler als vorher
- [ ] Kein helles Weiß (#FFFFFF) irgendwo im Terminal-Output
- [ ] Text gut lesbar auf dunklem Hintergrund

### Test T.2: Ivory Theme Regression
- [ ] Theme auf Ivory (hell) zurückschalten
- [ ] Terminal-Text dunkel auf hellem Hintergrund — unverändert
- [ ] Keine Regression

---

## Window Height & Grid (Bugfixes HEIGHT-REGRESSION, Q88ZHP)

### Test W.1: Initiale Fensterhöhe
- [ ] Grid auf 1x1 setzen → App neustarten → Fenster klein (~480px hoch)
- [ ] Grid auf 2x2 setzen → App neustarten → Fenster ~864px hoch
- [ ] Grid auf 3x3 setzen → App neustarten → Fenster ~1248px hoch (oder Bildschirmhöhe)

### Test W.2: Sessions behalten feste Breite
- [ ] 1 Session erstellen → passt ins Fenster
- [ ] 2. Session erstellen → **Fenster wird breiter**, beide Sessions gleich breit
- [ ] 3. Session erstellen → Fenster wächst weiter (oder neue Zeile)
- [ ] Sessions werden **nie** komprimiert/gequetscht

### Test W.3: Grid-Layout dynamisch
- [ ] 1 Session: 1x1 Grid
- [ ] 6 Sessions: 3x2 Grid
- [ ] 12 Sessions: 4x3 Grid
- [ ] 21 Sessions: 7x3 Grid
- [ ] Grid skaliert dynamisch bei Session-Änderung

### Test W.4: DQHD (5120x1440)
- [ ] Bei maximaler Fenstergröße: 7x3 Grid passt ohne Scroll
- [ ] Kacheln sind groß genug für sinnvolle Terminal-Nutzung

### Test W.5: Kleiner Bildschirm (1440x900)
- [ ] Horizontaler Scroll wenn Grid > Fensterbreite
- [ ] Kacheln bleiben bei min. 640px Breite

---

## Session Discovery (Bugfix ZACT8J)

### Test S.1: Recovery nach Restart
- [ ] 5 Sessions erstellen
- [ ] App beenden & neustarten
- [ ] Recovery-Dialog zeigt **alle 5** Sessions (nicht nur 2)
- [ ] "Übernehmen" übernimmt Session → **erscheint im Grid** (nicht nur in Registry)

### Test S.2: Session-Namen mit Sonderzeichen
- [ ] Session mit Doppelpunkt im Namen → wird korrekt geparst
- [ ] tmux list-sessions parsing bricht nicht

---

## Profile-Overlay (TP-1)

### Test P.1: Community-Build
```bash
BUILD_PROFILE=community npm run build
```
- [ ] Build läuft fehlerfrei
- [ ] Keine Cipher-spezifischen Pfade im Output

### Test P.2: Cipher-Build
```bash
BUILD_PROFILE=cipher npm run build
```
- [ ] Build läuft fehlerfrei
- [ ] Cipher-Pfade korrekt aufgelöst

### Test P.3: Onboarding
- [ ] Bei leeren Scan-Pfaden: Onboarding-Dialog erscheint
- [ ] User kann Scan-Pfad hinzufügen

---

## AgentAdapter (TP-2)

### Test A.1: Session mit Claude Code
- [ ] Session erstellen → Claude Code startet in tmux
- [ ] `--dangerously-skip-permissions` aktiv
- [ ] MCP-Tools geladen
- [ ] Context-Usage sichtbar

### Test A.2: Orchestrator
- [ ] Startet automatisch
- [ ] Template enthält adapter-spezifische Prompt-Fragmente

---

## OSS-Infrastruktur (TP-4)

### Test O.1: Dokumentation
- [ ] README.md vorhanden
- [ ] CONTRIBUTING.md vorhanden
- [ ] ARCHITECTURE.md vorhanden (Adapter-Sektion aktualisiert)
- [ ] CHANGELOG.md vorhanden
- [ ] NOTICE vorhanden
- [ ] CODE_OF_CONDUCT.md vorhanden

### Test O.2: GitHub-Templates
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md` vorhanden
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md` vorhanden
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` vorhanden

---

## Integration

### Test I.1: Vollständiger Flow
- [ ] App starten → Orchestrator startet → 3 Sessions erstellen → Voice einschalten → Session fokussieren → Sprechen → Text landet in Session

### Test I.2: Test-Suite
```bash
npm test
```
- [ ] Alle Tests grün (erwartet: 369+)
- [ ] Keine neuen Warnungen

### Test I.3: Build
```bash
npm run build
```
- [ ] TypeScript 0 Errors
- [ ] Vite Build OK

---

## Gesamtbewertung

| Bereich | Status | Blocker? |
|---------|--------|----------|
| Voice Toggle + PTT | [ ] Bestanden | |
| Terminal Theme | [ ] Bestanden | |
| Window Height | [ ] Bestanden | |
| Fixed-Width Sessions | [ ] Bestanden | |
| Session Discovery | [ ] Bestanden | |
| Profile-Overlay | [ ] Bestanden | |
| AgentAdapter | [ ] Bestanden | |
| OSS-Infra | [ ] Bestanden | |
| Integration | [ ] Bestanden | |

**Release-ready:** [ ] Ja / [ ] Nein — Blocker: ___

**Offene Punkte (Iteration 2):**
- MCP Session Resilience (A29FD6)
- Message Bus Push Delivery
- MPO Button in Footer
- Voice in Bug-Assistant
- Performance-Test 21 Sessions (>30 FPS)
