# Funktionale Testcases — MPO Run 2026-04-22/23

> Manuelle Tests für die 5 TPs nach dem ersten MPO-Durchlauf.
> Durchzuführen vor Merge in Production oder Release.

---

## Vorbereitung

1. Production cipher-mux.app beenden (Single-Instance-Lock)
2. `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron`
3. `npm run build` — muss fehlerfrei durchlaufen
4. `npm start` — App muss starten

---

## TP-1: Profile-Overlay-System

### Test 1.1: Community-Build
```bash
BUILD_PROFILE=community npm run build
```
- [ ] Build läuft fehlerfrei
- [ ] Keine Cipher-spezifischen Pfade im Output (`grep -r "Nextcloud" dist/`)
- [ ] App startet mit neutralen Defaults

### Test 1.2: Cipher-Build
```bash
BUILD_PROFILE=cipher npm run build
```
- [ ] Build läuft fehlerfrei
- [ ] Cipher-Pfade werden korrekt aufgelöst
- [ ] App verhält sich identisch zum Pre-Refactor-Zustand

### Test 1.3: Fehlende Profildatei
- [ ] Wenn `profile.cipher.yaml` nicht existiert: App startet trotzdem mit Community-Defaults (kein Crash)

### Test 1.4: Onboarding
- [ ] Bei leeren Scan-Pfaden (Community-Profil): Onboarding-Dialog erscheint
- [ ] User kann Scan-Pfad konfigurieren

--- passt - müsstest du auch selber getestst haben / es können

## TP-2: AgentAdapter

### Test 2.1: Claude-Code-Session starten
- [ ] Session erstellen → Claude Code startet in tmux-Pane
- [ ] `--dangerously-skip-permissions` Flag aktiv ---- oh - das müssen wir noch anders machen - das sollte eine option in den einstellungen sein, denn vorzugeben, so mutig zu sein, das wollen wir nicht ----
- [ ] MCP-Tools werden geladen (kein BUG-mcp-tools-not-loaded)
- [ ] Context-Usage wird angezeigt (statusLine-Hook funktioniert) - nein, leider bleibt die anzeige bei 0%

### Test 2.2: Adapter-Capabilities in mux_sessions
- [ ] `mux_sessions` MCP-Call liefert `capabilities` pro Session
- [ ] Claude-Code-Session hat alle 6 Capabilities auf `true`

pass

### Test 2.3: UI-Degradation (Mock)
- [ ] PaneHeader zeigt `—` statt Context-% wenn `status-line` Capability `false`
- [ ] Chatroom zeigt "Read-only Bus" Badge für Non-MCP Sessions - ich glaub die schrieben da gar nicht rein...
- [ ] Kein Crash bei deaktivierten Capabilities ?

Message BUS funktioniert - aber es ist eine rein anzeigefunktion --- er soll ja dazu dienen, dass man die kommunikation der hintergrundsessions mit dem orchestrator mitbekommt --- wie wäre ein Kärtchen je laufender hintergrundsess (+ orchestrator und MPO orchestrator) sesison - header mit kleinem textbody in der die jeweils letzte nachricht der session steht - doppelklick öffnet die session im mux - un dgubt so user zugriff - 

### Test 2.4: Orchestrator-Session
- [ ] Orchestrator startet automatisch - ja
- [ ] Orchestrator-Template enthält adapter-spezifische Prompt-Fragmente (kein hardkodiertes `claude`)

pass

### Test 2.5: Reference-Stub
- [ ] `_reference-stub.ts` kompiliert
- [ ] Alle Methoden werfen `Not implemented` Errors
- [ ] TSDoc und TODO-Kommentare sind vollständig
 pass
---

## TP-3: 21-Session UI

### Test 3.1: MAX_SESSIONS
- [ ] 21 Sessions können erstellt werden (nicht mehr)
- [ ] Session 22 wird mit klarer Fehlermeldung abgelehnt

pass

### Test 3.2: Grid-Layout
- [ ] 1 Session: 1×1 Grid
- [ ] 6 Sessions: 3×2 Grid
- [ ] 12 Sessions: 4×3 Grid
- [ ] 21 Sessions: 7×3 Grid
- [ ] Grid skaliert dynamisch bei Session-Änderung

pass

### Test 3.3: DQHD (5120×1440)
- [ ] Bei maximaler Fenstergröße: 7×3 Grid passt ohne Scroll
- [ ] Kacheln sind groß genug für sinnvolle Terminal-Nutzung

pass

### Test 3.4: Kleiner Bildschirm (1440×900)
- [ ] Grid scrollt sauber
- [ ] Kacheln bleiben bedienbar (nicht zu klein)

pass - aber nicht getestet - es geht auf allen auflösungen die ich nutze - also auf qhd und dqhd getestet

### Test 3.5: Activity-Rail
- [ ] Icons bei 21 Sessions sichtbar (kompakt, 36px)
- [ ] Scroll bei Überlauf
- [ ] Auto-Scroll zu aktiver Session

wir haen keine activity rail mehr - wenn die unsichtbar noch lebt - die bracuhen wir eigentlich nicht - jede aktive session ist ja sichtabr...

### Test 3.6: Recovery-Dialog
- [ ] Nach Electron-Restart: Recovery-Dialog zeigt alle 21 Sessions
- [ ] Dialog ist scrollbar

### Test 3.7: Performance
- [ ] 21 Sessions mit aktivem Terminal-Output
- [ ] >30 FPS (keine sichtbaren Ruckler)
- [ ] Kein Memory-Leak über 10 Minuten
we will see
---

## TP-4: OSS-Infrastruktur

### Test 4.1: Dokumentation vorhanden
- [ ] README.md — community-ready, 10-Sekunden-Test bestanden
- [ ] CONTRIBUTING.md — Dev-Setup funktioniert wenn man den Anweisungen folgt
- [ ] ARCHITECTURE.md — AgentAdapter-Sektion vorhanden
- [ ] CHANGELOG.md — Unreleased Section gepflegt
- [ ] NOTICE — Lizenzen gelistet

### Test 4.2: GitHub-Templates
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md` vorhanden
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md` vorhanden
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` vorhanden
- [ ] `.github/CODEOWNERS` vorhanden

### Test 4.3: CI-Workflow
- [ ] `.github/workflows/` enthält CI-Config
- [ ] Workflow testet auf macOS und Linux

### Test 4.4: Linux AppImage
- [ ] `electron-builder` Config für AppImage vorhanden
- [ ] Build-Command dokumentiert

### Test 4.5: TSDoc-Lint
- [ ] `eslint-plugin-tsdoc` konfiguriert
- [ ] Fehlende TSDoc an öffentlichen APIs erzeugt Warnung

### Test 4.6: Platform-Abstraktion
- [ ] Keine `osascript`-Aufrufe ohne Platform-Check
- [ ] Linux-Fallback (xdg-open) vorhanden

Jetzt habe ich ein klares Bild. Hier die Ergebnisse:
                     
  ---                                                                           
  Test 4.2: GitHub-Templates — NICHT BESTANDEN                                  
                                                                                
  - .github/ISSUE_TEMPLATE/bug_report.md — fehlt (kein .github/ Verzeichnis     
  vorhanden)                                                                    
  - .github/ISSUE_TEMPLATE/feature_request.md — fehlt
  - .github/PULL_REQUEST_TEMPLATE.md — fehlt                                    
  - .github/CODEOWNERS — fehlt                                                  
  
  Das gesamte .github/-Verzeichnis existiert nicht.                             ──
                                               
  Test 4.3: CI-Workflow — NICHT BESTANDEN                                       
                                               
  - .github/workflows/ enthält CI-Config — fehlt (kein .github/)                
  - Workflow testet auf macOS und Linux — nicht pruefbar
                                                                                
  CHANGELOG erwaehnt "GitHub Actions CI (macOS + Linux)" unter Unreleased, aber 
  die Dateien existieren noch nicht.                                            
                                                                                
  Test 4.4: Linux AppImage — NICHT BESTANDEN   

  - electron-builder Config fuer AppImage — fehlt. Der dist-Script baut nur     
  --mac dmg. Keine Linux-Targets konfiguriert.
  - Build-Command dokumentiert — ja, npm run dist steht in README und           
  CONTRIBUTING.md                                                               
  
  Test 4.5: TSDoc-Lint — NICHT BESTANDEN                                        
                                               
  - eslint-plugin-tsdoc konfiguriert — nicht installiert. Weder in package.json 
  noch in ESLint-Config referenziert.
  - Fehlende TSDoc erzeugt Warnung — nicht pruefbar                             
                                                                                
  CHANGELOG erwaehnt "TSDoc lint via eslint-plugin-tsdoc" unter Unreleased, aber
   die Dependency/Config existiert noch nicht.                                  
                                                                                
  Test 4.6: Platform-Abstraktion — BESTANDEN   

  - Keine osascript-Aufrufe ohne Platform-Check — kein einziges osascript im    
  gesamten src/
  - Linux-Fallback vorhanden — ipc-hub.ts:787-801: sauberer process.platform ===
   'darwin' Check mit open (macOS) vs xdg-open (Linux)                          
  


---

## TP-5: Voice → Session STT --- Voice ist nicht testbar - 'not availabele - native modules mi.....'

### Test 5.1: Voice-Toggle UI
- [ ] Floating Pill unten links sichtbar
- [ ] Toggle schaltet Voice-Pipeline ein/aus
- [ ] LED-Indicator zeigt State (idle/ready/recording/processing)

### Test 5.2: Session-Fokus
- [ ] Klick auf Grid-Kachel setzt fokussierte Session
- [ ] Fokussierte Session ist visuell erkennbar

### Test 5.3: PTT → Session-Input
- [ ] Ctrl+Shift+Space: Aufnahme startet
- [ ] Loslassen: Whisper transkribiert
- [ ] Transkription erscheint als Preview-Toast (2s, amber)
- [ ] Text wird via sendKeys in fokussierte tmux-Session geschickt
- [ ] "Sent to [Session-Name]" Feedback-Toast (grün)

### Test 5.4: Keine Session fokussiert
- [ ] Wenn keine Session ausgewählt: klarer Hinweis statt stilles Verwerfen

### Test 5.5: Coding-Begriffe
- [ ] Coding-Terminologie (function, async, TypeScript) wird korrekt transkribiert
- [ ] Bias-Prompt verbessert Erkennung gegenüber ohne

### Test 5.6: Bugreport-Flow Regression
- [ ] Bestehender Voice-Bugreport-Interview-Flow funktioniert weiterhin
- [ ] Kein Konflikt zwischen Bugreport-Modus und Session-Input-Modus

### Test 5.7: VoiceOutputRouter Placeholder
- [ ] Interface existiert in `src/main/voice/voice-output-router.ts`
- [ ] Ist ein Placeholder mit TODO-Kommentaren, keine Implementierung

---

## Integration

### Test I.1: Vollständiger Flow
- [ ] App starten → Orchestrator-Session startet → 3 Sessions erstellen → Voice einschalten → Session fokussieren → Sprechen → Text landet in Session

### Test I.2: Test-Suite
```bash
npm test
```
- [ ] Alle Tests grün (erwartet: 369)
- [ ] Keine neuen Warnungen

### Test I.3: Build-Integrität
```bash
npm run build
```
- [ ] TypeScript 0 Errors
- [ ] Vite Build OK

---

## Gesamtbewertung

| TP | Status | Blocker? |
|----|--------|----------|
| TP-1 Profile-Overlay | [ ] Bestanden | |
| TP-2 AgentAdapter | [ ] Bestanden | |
| TP-3 21-Session UI | [ ] Bestanden | |
| TP-4 OSS-Infra | [ ] Bestanden | |
| TP-5 Voice STT | [ ] Bestanden | |
| Integration | [ ] Bestanden | |

**Release-ready:** [ ] Ja / [ ] Nein — Blocker: ___

**Notizen:**
_____
