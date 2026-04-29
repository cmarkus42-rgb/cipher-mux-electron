# MPO-Auftrag: Konsolidierte Anforderungen cipher-mux-electron

**Erstellt:** 2026-04-28, Orchestrator-Session
**Revidiert:** 2026-04-28 (Vollstaendigkeitscheck + User-Korrekturen Cluster E)
**Quellen:** moreismore/ (aktive Dateien), MCP-Notes (global), Handoff vom 2026-04-28, User-Korrekturen (Voice-Input 2026-04-28)
**Zweck:** Vollstaendige Auftragsgrundlage fuer den naechsten MPO-Run.

---

## Inhaltsverzeichnis

1. [Cluster A: Grid- und Session-Bugs (kritisch)](#cluster-a-grid--und-session-bugs-kritisch)
2. [Cluster B: Demo-Mode / UI-Highlighting](#cluster-b-demo-mode--ui-highlighting)
3. [Cluster C: Notes-System Ausbau](#cluster-c-notes-system-ausbau)
4. [Cluster D: Testcase-Modus + Testing Assistant Entity](#cluster-d-testcase-modus--testing-assistant-entity)
5. [Cluster E: Entity-, Persona- und Preset-System](#cluster-e-entity--persona--und-preset-system)
6. [Cluster F: Voice-Relay (STT + TTS)](#cluster-f-voice-relay-stt--tts)
7. [Cluster G: Settings / UI-Polish](#cluster-g-settings--ui-polish)
8. [Cluster H: Architektur / Infrastruktur](#cluster-h-architektur--infrastruktur)
9. [Cluster I: Showcase / Video-Produktion](#cluster-i-showcase--video-produktion)
10. [Cluster J: Zukunftsmusik (v2, nicht jetzt)](#cluster-j-zukunftsmusik-v2-nicht-jetzt)
11. [Offene Fragen (zu klaeren vor Umsetzung)](#offene-fragen)
12. [Abhaengigkeitsgraph](#abhaengigkeitsgraph)

---

## Cluster A: Grid- und Session-Bugs (kritisch)

### A.1 — Grid-Session verschwindet beim Verschieben

**Quelle:** Note 01KQAG0SE8JFZT5JK3VVJSW8TM, Testcases T-UI.X28
**Schwere:** Hoch — Session nicht mehr erreichbar

**Symptom:** Beim Verschieben einer Session (z.B. Orchestrator von oben rechts nach unten links) verschwindet die Session visuell. Nicht im Grid, nicht in Hintergrund-Sessions, nicht killbar. Taucht erst wieder auf wenn eine andere Session in eine Nachbarzelle verschoben wird.

**Reproduktion:**
1. 2x2 Grid, Companion oben links, Orchestrator oben rechts
2. Orchestrator nach unten links verschieben
3. Session verschwindet, Zelle zeigt gestrichelte Umrandung
4. Companion nach oben rechts verschieben → Orchestrator taucht wieder auf

**Screenshots:** ~/Desktop/Bildschirmfoto 2026-04-28 um 18.47.45.png, ~/Desktop/Bildschirmfoto 2026-04-28 um 18.48.53.png

**Vermutung:** Grid-Layout erkennt die Zelle nicht als belegt. Rendering-Problem, nicht Session-State-Problem (Session lebt weiter im tmux).

**Zusammenhang:** RT-X1, RT-X2 (Grid-Bugs aus vorheriger Iteration), T-LC.7/RT-3 (xterm.js fit())

---

### A.2 — Leere Grid-Zellen ohne LauncherCell nach Verschiebung

**Quelle:** Note 01KQAG0YM6HS0B29Y1GRSVM5CK, Testcases T-UI.X29
**Schwere:** Mittel — Zelle unbrauchbar, aber kein Datenverlust

**Symptom:** Nach Verschieben von Sessions bleiben Zellen leer ohne "+"-Button (LauncherCell). Gestrichelte Umrandung sichtbar, aber kein Klick-Target.

**Reproduktion:**
1. Sessions im Grid verschieben
2. Urspruengliche oder Nachbar-Zelle zeigt keinen "+"

**Erwartung:** Jede unbelegte Zelle muss immer einen "+"-Button zeigen.

**Screenshot:** ~/Desktop/Bildschirmfoto 2026-04-28 um 18.48.53.png

**Zusammenhang:** A.1 (gleicher Verschiebe-Vorgang als Ausloeser), RT-X1

---

### A.3 — Verwaiste Sessions blockieren Preset-Auswahl

**Quelle:** Note 01KQAF2VGZ9M1X0ENXXA3QRRAJ, Testcases T-UI.X27
**Schwere:** Hoch — Entity komplett blockiert, kein Workaround

**Symptom:** Alle 5 Entity-Presets zeigen "laeuft" im LauncherCell-Popup, obwohl nur 2 (Companion, Orchestrator) tatsaechlich sichtbar sind. Die 3 anderen (Refinement, Audit, MPO) sind Geister-Sessions: nicht im Grid, nicht in Sidebar-Hintergrund, aber blockieren neue Starts.

**Root-Cause-Hypothese:** tmux-Sessions aus frueheren Starts oder abgestuerzten Sessions existieren noch. Session-Manager erkennt sie als "aktiv", aber Grid/Hintergrund-Verwaltung kennt sie nicht. Diskrepanz tmux-State vs. App-State.

**Reproduktion:**
1. App starten (ohne Workspace)
2. Companion + Orchestrator manuell starten
3. LauncherCell-Popup → alle 5 Presets zeigen "laeuft"

**Loesungsoptionen:**
- Nur tatsaechlich zugeordnete Sessions als "laeuft" markieren
- ODER: "laeuft"-Sessions per Klick ins Grid holbar machen
- ODER: Verwaiste tmux-Sessions beim App-Start aufraeumen (cleanupDeadSessions erweitern)

**Empfehlung:** Root Cause Analysis auf tmux-State vs. App-State-Diskrepanz. Nicht Symptom-Fix.

**Screenshot:** ~/Desktop/Bildschirmfoto 2026-04-28 um 18.32.31.png

---

### A.4 — MCP-Verbindung droppt spontan

**Quelle:** moreismore/bug-mcp-connection-drops.md, Note im Notes-System
**Schwere:** Hoch — Session wird unbrauchbar

**Symptom:** MCP-Tools verschwinden waehrend laufender Session ohne erkennbaren Trigger. "No such tool available." Alle Tools gleichzeitig betroffen. Erfordert App-Neustart.

**Bisheriger Fix:** Commit 9187e1d — Timeout auf 4h, Keep-Alive, Error-Handler. Problem: Upstream-Bug (Claude Code reconnected nicht nach Drop).

**Status:** Teilweise mitigiert, aber nicht geloest. Passiert weiterhin (mindestens 2x am 2026-04-28).

**Offene Frage:** Ist das ein cipher-mux-Bug oder ein Claude-Code-Upstream-Problem? Wenn upstream: koennen wir die Session automatisch neu verbinden (MCP-Server-Restart + Client-Reconnect)?

---

### A.5 — Session doppelt angezeigt bei Grid-Click (T-LC.5)

**Quelle:** Testcases T-LC.5
**Schwere:** Mittel

**Symptom:** Bei Klick auf andere Zelle im GridSelector-Popup wird Session doppelt angezeigt — nur eine tatsaechliche Session, aber in zwei Zellen sichtbar. Beim Schliessen gehen beide gleichzeitig weg.

**Zusammenhang:** Moeglicherweise Regression von RT-X2. Re-Test noetig.

---

## Cluster B: Demo-Mode / UI-Highlighting

### B.1 — Implementierte MCP-Tools (Stand 2026-04-28)

**Quelle:** moreismore/showcase/2026-04-26-companion-video-demo-mode-spec.md, Commit 0c38666

Drei Tools implementiert:
- `mux_ui_highlight` — Element hervorheben (glow/outline, duration, clear)
- `mux_ui_open` — Popup/Dialog oeffnen (workspace-popup, info-dialog, launcher-popup)
- `mux_theme_set` — Theme wechseln

**Element-Identifikation:** `data-highlight`-Attribute mit Namensschema (sb-*, cell-*, side-*, popup-*)

### B.2 — Test-Status Demo-Mode-Tools (abgeschlossen 2026-04-28)

| Test | Status | Anmerkung |
|------|--------|-----------|
| T-DM.1 Highlight glow | PASS | |
| T-DM.2 Outline-Style | FAIL | Kein Unterschied zu Glow — Style wird ignoriert |
| T-DM.3 Custom duration | PASS | |
| T-DM.4 Permanenter Highlight | PASS | duration: 0 bleibt bis Clear |
| T-DM.5 Clear | PASS | |
| T-DM.6 Mehrere gleichzeitig | PASS | Helligkeit uneinheitlich (→ B.7) |
| T-DM.7 Unbekanntes Target | FAIL | Gibt ok:true statt Fehler |
| T-DM.8 Resize waehrend Highlight | PASS | |
| T-DM.9 Theme-Wechsel waehrend Highlight | PASS | |
| T-DM.10 Workspace-Popup | PASS | |
| T-DM.11 Info-Dialog | PASS | |
| T-DM.12 Launcher-Popup | FAIL | ok:true aber nichts passiert |
| T-DM.13 Unbekanntes UI-Target | PASS | |
| T-DM.14-16 Theme-Wechsel | PASS | |
| T-DM.17 Theme-Persistenz | PASS | Synthwave nach Neustart noch da |
| T-DM.18/19 Doku-Checks | offen | Worker-Job, kein manueller Test |

**Ergebnis:** 14/17 PASS, 3 FAIL (Outline-Style, unbekanntes Target, launcher-popup).

### B.3 — BUG: mux_ui_open launcher-popup oeffnet nicht

**Quelle:** Note 01KQAG15PE02AAY2P73FMARF47, T-DM.12
**Schwere:** Mittel — Demo-Mode eingeschraenkt, hoch fuer Tutor-Mode

**Symptom:** `mux_ui_open` mit `target: "launcher-popup"` + `context: { cell: "0-1" }` gibt ok:true, aber Popup oeffnet nicht.

**Moegliche Ursachen:**
- Cell-Koordinaten-Format passt nicht zum internen Format
- IPC-Event wird gesendet aber nicht empfangen
- Zelle muss leer sein?

---

### B.4 — BUG: Highlight bei unbekanntem Target gibt keinen Fehler

**Quelle:** T-DM.7 FAIL

**Symptom:** `mux_ui_highlight` mit nicht-existierendem Target gibt `ok: true` zurueck statt einen Fehler.

**Erwartung:** Tool soll `ok: false` mit Fehlermeldung zurueckgeben wenn Target-Element nicht im DOM gefunden wird. Liste bekannter Targets mitliefern (wie mux_ui_open es tut).

---

### B.5 — FEATURE: Demo-Mode Feinsteuerung

**Quelle:** Note 01KQAGTBGSHY71T4TTDECAWFJC, Testcases T-UI.X33
**Prioritaet:** SHOULD (fuer echte interaktive Fuehrung noetig)

Drei Luecken:
1. **Kein Input waehrend Popup offen** — Session-Input/STT blockiert bei offenem Dialog
2. **Kein Scroll-to-Element** — Companion kann Dialog oeffnen, aber nicht zur relevanten Stelle scrollen
3. **Keine Tab-Navigation in Popups** — Companion kann nicht auf bestimmten Tab wechseln (z.B. "oeffne Settings auf Tab Themes")

**Loesungsvorschlag:** Bestehende Tools per context-Objekt erweitern (keine neuen Tools). Z.B. `{ target: "info-dialog", context: { tab: "themes" } }`

---

### B.6 — BUG: Popup-Backdrop zu dunkel

**Quelle:** Note 01KQAGTMNVXFSTW012XPJP0W04, Testcases T-UI.X34
**Schwere:** Niedrig (UX)

**Symptom:** Backdrop bei geoeffnetem Popup dunkelt Session-Text zu stark ab (60-70%). Companion-Text nicht gleichzeitig mit Popup lesbar.

**Loesung:** Backdrop auf 20-30% reduzieren oder konfigurierbar machen.

---

### B.7 — Highlight-Design: Border-Glow statt flaechiger Glow

**Quelle:** T-UI.X31 (Testcases-Dokument), Design-Feedback User
**Prioritaet:** MUST (betrifft alle Highlight-Nutzung)

**Problem:** Glow-Effekt ueberstrahlt die Button-Beschriftung, Text wird schlecht lesbar. Helligkeit unterschiedlich zwischen Buttons (Sidebar viel heller als Theme-Button).

**Konkrete Anforderung:** Einheitlich leuchtende Raender (Border-Glow) statt flaechiger Glow. Gilt fuer alle Highlight-Targets gleich — StatusBar-Buttons, Sidebar-Bereiche, Grid-Zellen. Die Raender des Elements leuchten/pulsieren, der Inhalt bleibt unberuehrt. Das ist auch konsistenter: alle Targets sind Rechtecke, also leuchten ueberall Rechteck-Raender.

**Zusaetzlich:** Outline-Style (T-DM.2 FAIL) muss sich SICHTBAR vom Glow unterscheiden. Vorschlag: Glow = pulsierende Border, Outline = statische helle Border ohne Pulsieren. Aktuell sind beide identisch gerendert.

---

### B.8 — FEATURE: mux_ui_open Toggle/Close

**Quelle:** Testcases T-UI.X36
**Prioritaet:** SHOULD

**Problem:** `mux_ui_open` kann Popups oeffnen (info-dialog, workspace-popup), aber nicht wieder schliessen. Companion oeffnet z.B. den Info-Dialog um etwas zu zeigen, kann ihn danach aber nicht programmatisch schliessen.

**Getestet:** info-dialog und workspace-popup jeweils doppelt aufgerufen — beide bleiben offen, kein Toggle.

**Empfehlung:** `mux_ui_open` als Toggle (erneuter Aufruf schliesst), oder neuer Parameter `action: "open" | "close" | "toggle"` (Default: "toggle"). Kein eigenes `mux_ui_close` Tool noetig.

---

### B.9 — FEATURE: Einzelne Notes in Sidebar highlighten

**Quelle:** Testcases T-UI.X37
**Prioritaet:** SHOULD

**Problem:** Aktuell kann nur der gesamte Notes-Bereich gehighlightet werden (`side-notes`). Fuer interaktive Fuehrung muss der Companion einzelne Notes hervorheben koennen.

**Vorschlag:** Dynamisches Highlight-Target `side-note-{id}`, wobei die Note-ID verwendet wird. Companion kann dann per `mux_ui_highlight({ target: "side-note-01KQ..." })` eine bestimmte Note aufleuchten lassen. Gilt analog fuer andere Sidebar-Eintraege (Hintergrund-Sessions, Memory, Nachrichten).

---

## Cluster C: Notes-System Ausbau

### C.1 — Notes-Verwaltungssystem mit Tag-Hierarchie

**Quelle:** moreismore/notes-management-system.md, Note 01KQ99FF6WN6KHHYJ5QEC5GGF4
**Prioritaet:** MUST fuer Skalierung (aktuell ~50 Notes, Ziel: 100-500)

**Kernkonzept:** Slash-Tags als virtuelles Ordnersystem (`bugs/ui/grid`, `status/open`). UI rendert aufklappbaren Baum (links), gefilterte Liste (rechts).

**Funktionen:**
- Baumnavigation filtert die Liste
- Suchfeld: FlexSearch ueber Titel, Tags, Body
- Drei Textlevel: Titel (immer), Tags (kompakt), Preview (hover)
- Einfachklick = Select/Preview, Doppelklick = Editor oeffnen
- Mehrfachselektion fuer Bulk-Ops
- LLM-gestuetzte Reorganisation wenn zu viele Tags entstehen (Auto-Vorschlaege fuer Zusammenfuehrung, Umstrukturierung)

**Technische Basis:**
- Dateien bleiben MD + YAML-Frontmatter (kein DB-Lock-in)
- FlexSearch (~12k Stars, MIT) fuer Volltextsuche im Browser
- Tag-Index aus Frontmatter beim Start gebaut
- Alte flache Tags landen auf oberster Ebene (abwaertskompatibel)

---

### C.2 — Tag-Management UI

**Quelle:** moreismore/tag-management-ui.md
**Prioritaet:** SHOULD

Dritter Tab "Tags" im Workspaces/Personas-Fenster:
- Liste aller Tags mit Count und Description
- Tags umbenennen (propagiert in alle Notizen)
- Tags loeschen (entfernt aus allen Notizen)
- Tag-Description editieren
- Neue Tags manuell anlegen
- UI unterscheidet zwischen Seed-Tags (vordefiniert) und Custom-Tags (User-erstellt)
- Nice-to-have: Tags mergen, Gruppen/Kategorien, Sortierung, Bulk-Ops

**Technische Notizen:**
- Tag-Repository: `~/.config/cipher-mux/notes/.tags.json`
- `NoteTagging` Klasse in `src/main/notes/note-tagging.ts`
- Neue IPC-Channels: `NOTES_TAG_UPDATE`, `NOTES_TAG_DELETE`, `NOTES_TAG_RENAME`
- WorkspacesWindow URL-Routing: `index.html?view=workspaces#tags`

---

### C.3 — BUG: Copy & Paste im Notes-Editor

**Quelle:** moreismore/bug-copy-paste-notes-editor.md, Note 01KQAA89AR98VHRJ8B7QCTDM39
**Schwere:** Hoch — Editor stark eingeschraenkt

**Symptom:** Cmd+C / Cmd+V funktionieren nicht im Notes-Editor (CodeMirror 6 in Sidebar).

**Vermutung:** Nicht CodeMirror-Problem (CM6 kann C&P out of the box). Vermutlich globaler Keyboard-Handler in der Electron-Integration oder fehlende webContents-Permission schluckt das Clipboard-Event.

---

### C.4 — FEATURE: STT im Notes-Editor

**Quelle:** moreismore/feature-stt-in-notes-editor.md
**Prioritaet:** SHOULD

STT soll auch im Notes-Editor diktieren koennen (wenn Cursor dort steht). STT funktioniert bereits in Sessions mit Fokus-Following. Logische Erweiterung.

---

### C.5 — FEATURE: Kompakte Darstellung Hintergrundsessions

**Quelle:** moreismore/feature-compact-background-sessions.md
**Prioritaet:** SHOULD

**Minimalmodus (Default):** Max 2 Zeilen pro Session (statt 5):
- Zeile 1: Anzeigename
- Zeile 2: Token-Usage + Working-Directory (nur Endverzeichnis, nur wenn abweichend vom Anzeigename)

**Detailmodus:** Einfachklick klappt auf (5 Zeilen wie bisher)
**Doppelklick:** Session oeffnen (unveraendert)

---

### C.6 — FEATURE: Drag & Drop aus Sidebar ins Grid

**Quelle:** Note 01KQ9A1N0WJ1Q94S335PSS6HYG
**Prioritaet:** SHOULD

**Hintergrundsessions → Grid:**
- Auf leere Zelle: Session oeffnet sich dort
- Auf belegte Zelle: neue uebernimmt, alte geht in Hintergrund

**Notes → Grid:**
- Auf leere Zelle (kein Editor offen): Notes-Editor oeffnet mit der Note
- Auf leere Zelle (Editor schon offen): Note im bestehenden Editor
- Auf belegte Zelle (Session): Prompt mit Note-Inhalt als Kontext an die Session

---

## Cluster D: Testcase-Modus + Testing Assistant Entity

### D.1 — Vollstaendiger Plan (bereits ausgearbeitet)

**Quelle:** moreismore/feature-testcase-modus.md, moreismore/plan-testcase-modus.md, Note 01KQ98N2EKGQR5MD44CJQQG59F

**WICHTIG — Integration mit Cluster E:** Der Testcase-Modus / Testing Assistant ist eines der Presets im Entity-System aus Cluster E. Die Umsetzung muss auf das Persona- und Preset-Konzept aus E abgestimmt sein. Insbesondere Workstream B (Entity-Struktur und UI-Integration) bezieht sich auf das Entity-Modell. Die Persona des Testing Assistant kommt aus der aktiven Companion-Persona (→ E.1), nicht aus einer eigenen festen Persona.

**Workstream A: Testcase-View (UI)**
- A1: Datenmodell + Parser (Note-Typ `testcase`, MD-Parser, Format-Validierung)
- A2: UI-Komponente (Grid-Zelle, Tri-State Checkboxen, Kommentarfelder, Statusleiste, Archiv)
  - Archivierung: abgearbeitete Testcases read-only, mit Datum + Zusammenfassung
  - Auslagern: Button "Als Feature-Request auslagern" im Kommentarfeld
  - Rueckkanal: Sessions lesen Ergebnis ueber bestehende Notes-Tools
- A3: Screenshot-Integration (macOS Region-Capture oder screencapture CLI, Paste)
- A4: MPO-Workflow (feste Post-Build-Phase, Feature-Request-Export, E2E)

**Workstream B: Testing Assistant Entity**
- B1: Entity-Struktur (CLAUDE.md nach neuem Template aus E.4, Fuenf-Phasen-Modell, Guardrails)
- B2: UI/Tool-Integration (Preset im Entity-System, Tool-Config, Smoke-Test)

**Parallelisierung:** A1+B1 parallel, dann A2+B2 parallel, dann A3, dann A4.

**Screenshot-Methode:** Offener Entscheidungspunkt — `desktopCapturer` (braucht Permission) vs. `screencapture -i -c` (einfacher, keine Permission bei interaktiver Auswahl). Spike vor Phase A3.

**MPO-Vertrag (Testcase-Format):**
```markdown
---
title: "..."
type: testcase
version: "0.11"
created: 2026-04-26
source: mpo
---
## Sektionsname
- [ ] **T-ID.N** Beschreibung
```

**Nicht-funktionale Anforderungen:**
- Design: Pixel-Art / CSS-Art gemaess cipher-mux Design-Direktive, keine Emojis
- Performance: 50+ Items fluessig
- Plattform: macOS (Electron), Screenshot-Capture nutzt macOS-native APIs
- Screenshots als separate Dateien (nicht inline base64)

**Bekannte Risiken:**
- macOS Screen Recording Permission (App muss in System Preferences → Privacy autorisiert werden)
- Parser-Robustheit (nicht alle Markdown-Varianten sauber parsbar)
- Format-Versionierung (Testcase-Format kann sich aendern)
- Grosse Testcases (Performance bei 100+ Items)

---

## Cluster E: Entity-, Persona- und Preset-System

> **ACHTUNG:** Dieses Kapitel wurde am 2026-04-28 komplett neu geschrieben nach User-Korrektur. Die vorherige Version ("Alle Entities sind Relay") war ein Missverstaendnis. Hier das korrekte Konzept.

### E.0 — Grundkonzept (Zusammenfassung)

**Kern-Idee:** Der User baut sich im Companion-Editor eine Persona (Charakter, Ton, Humor, Regeln). Diese Persona wirkt dann konsistent ueber ALLE Entities/Presets. Es geht nicht darum, dass alles "Relay" ist — es geht darum, dass die GEWAEHLTE Persona ueberall gleich klingt.

**Zusammensetzung eines Presets:**
```
Preset = Aktive Companion-Persona (Charakter) + Entity-spezifische Faehigkeiten
```

- **Persona** (auswaehlbar, editierbar): Ton, Sprache, Humor, Do/Don't, Sicherheitsregeln. Wird an ALLE Entities injiziert. Gibt auch den Rollennamen vor.
- **Faehigkeiten** (pro Preset definiert): Was die Entity konkret tut (testen, orchestrieren, beraten, auditieren). Bleibt entity-spezifisch.

**Bestehend im Companion-Editor:** Zwei Personas (Relay, Wayne). Weitere anlegbar. Eine davon ist aktiv.

---

### E.1 — Persona-Konsistenz durch auswaehlbare Companion-Persona

**Quelle:** User-Korrektur 2026-04-28, moreismore/spec-entity-persona-integration.md (korrigiert)
**Prioritaet:** MUST

**Anforderungen:**

- **E.1.1:** Die aktive Persona aus dem Companion-Editor wirkt konsistent ueber ALLE Entities. Nicht nur Companion.
- **E.1.2:** Die Persona ist AUSWAEHLBAR (im Companion-Editor existieren Relay, Wayne, custom). User waehlt eine als aktiv.
- **E.1.3:** Die Persona ist EDITIERBAR (Charakter, Ton, Regeln aenderbar).
- **E.1.4:** Persona-Injection in ZWEI TEILE getrennt:
  1. **Charakter-Block** (Ton, Sprache, Humor, Do/Don't, Sicherheit) → wird an ALLE Entities injiziert
  2. **Skillset/Aufgaben-Block** → bleibt entity-spezifisch (in den jeweiligen Preset-Definitionen)
- **E.1.5:** Aktueller Code (`session-manager.ts`) injiziert Persona nur bei `config.id === 'companion'`. Muss fuer ALLE Preset-Entities gelten.
- **E.1.6:** Aktueller Code (`character-defaults.ts`, `RELAY_PROMPT`) vermischt Charakter und Aufgaben. Muss aufgetrennt werden.
- **E.1.7:** Der Rollenname kommt aus der Persona, nicht fest "Relay". Die Persona vergibt den Rollennamen.
- **E.1.8:** Companion-Memory rollenuebergreifend — memory-Tools (`companion_memory_write`, `companion_memory_recall`, `companion_memory_search`) in jeder Entity verfuegbar.

**Implementierung:**
1. `character-defaults.ts` aufteilen: Charakter-Block (teilbar) vs. Aufgaben-Block (pro Entity)
2. `session-manager.ts`: Persona-Injection fuer alle Entities, nicht nur Companion
3. Persona-Daten aus Companion-Editor-Speicher laden (nicht hardcoded)
4. Companion-Memory-Tools in alle Entity-CLAUDE.md aufnehmen

---

### E.2 — Preset-Editor im Companion-Fenster (NEUE UI-Anforderung)

**Quelle:** User-Korrektur 2026-04-28
**Prioritaet:** MUST

**Was:** Der Companion-Editor (Workspace-Fenster, Companion-Tab) wird um einen **Preset-Editor** erweitert.

**Funktionen:**
- Alle Entities/Presets anzeigen und auf Ebene ihrer Bestandteile bearbeitbar machen
- Bestandteile als **Reiter** organisiert:
  - Rolle (was die Entity tut, 1-3 Saetze)
  - Faehigkeiten (was die Entity kann)
  - Arbeitsregeln (spezifische Regeln fuer diese Rolle)
  - Scope (was die Entity ist und NICHT ist)
- Scrollbares Fenster mit guter Hoehe (damit man auch laengere Definitionen lesen kann)
- **Warnung vor Editierung:** Bevor man aendern kann, muss man bestaetigen ("Bist du sicher?")
- **Transparenz:** Man soll sehen WIE die Presets aufgebaut sind (die Struktur sichtbar machen)
- **Anpassbarkeit:** Man soll Presets veraendern koennen
- **Neue Presets erstellen:** User kann neue Presets anlegen, die genauso wie andere Entities integriert und aufgebaut werden
- **Companion Memory:** Wird NICHT im Preset-Editor angeboten (teilt sich ohnehin zwischen allen Entities)

**Abgrenzung zum Persona-Editor:**
- Persona-Editor (existiert): Editiert den CHARAKTER (Ton, Humor, Regeln) — wirkt global
- Preset-Editor (neu): Editiert die FAEHIGKEITEN pro Entity (Rolle, Skills, Regeln, Scope) — wirkt entity-spezifisch

---

### E.3 — Preset-Vollstaendigkeit und Dynamik

**Quelle:** spec-entity-persona-integration.md § B
**Prioritaet:** MUST

**Fehlende Presets (aktuell nicht im LauncherCell-Popup):**
| Preset | Entity-Pfad |
|--------|------------|
| Refinement | `~/.config/cipher-mux/entities/refinement` |
| Audit | `~/.config/cipher-mux/entities/audit` |
| Project Launcher | `~/.config/cipher-mux/entities/projectlauncher` |
| Watchdog / Testing Assistant | `~/.config/cipher-mux/entities/watchdog` |

**Anforderungen:**
- Presets NICHT hardcoden. Entity-Scanner beim App-Start: `~/.config/cipher-mux/entities/` scannen.
- Jede Entity mit valider CLAUDE.md wird als Preset registriert.
- Zusaetzlich: Orchestrator und MPO aus ihren bekannten Pfaden.
- Project Launcher in `~/.config/cipher-mux/entities/projectlauncher` integrieren (aktuell unter `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher` — muss dorthin migriert oder verlinkt werden).
- Status-Indikator fuer laufende Sessions im LauncherCell-Popup.
- Presets im Preset-Editor erstellbar und editierbar (→ E.2).
- **GEKLAERT:** Watchdog und Testing Assistant sind EINE Entity (nicht zwei). Adversarial-Modus ist ein Phasen-Modus innerhalb des Testing-Presets.

---

### E.4 — Entity-CLAUDE.md: Neues Template und Komplett-Rewrite

**Quelle:** User-Korrektur 2026-04-28, spec-entity-persona-integration.md § D
**Prioritaet:** MUST

**Neues Template:**

```markdown
# [Persona-Rollenname] — [Entity-Funktion]

## Rolle
[1-3 Saetze was diese Entity in dieser Session tut]

## Persona
[Verweis auf aktive Companion-Persona — wird zur Laufzeit injiziert]
Der Charakter-Block kommt aus der aktiven Persona im Companion-Editor.
Rollenspezifisch: [was in dieser Rolle anders ist, z.B. "adversarial beim Testen"]

## Companion-Memory
[Instruktionen fuer Memory-Nutzung in dieser Rolle]
Tools: companion_memory_write, companion_memory_recall, companion_memory_search

## Faehigkeiten
[Was diese Rolle kann und tut — der Skillset-Block]

## Arbeitsregeln
[Spezifische Regeln fuer diese Rolle]

## Scope
[Was diese Session ist und NICHT ist]
```

**ALLE Entity-CLAUDE.md muessen in dieses Format umgeschrieben werden:**
- Companion (existiert, muss angepasst werden)
- Refinement (existiert, muss angepasst werden)
- Audit (existiert als Wayne Szalinski, muss KOMPLETT umgeschrieben werden)
- Orchestrator (existiert, muss angepasst werden)
- MPO (existiert, muss angepasst werden)
- Watchdog / Testing Assistant (neu erstellen)
- Project Launcher (neu erstellen oder adaptieren)

**Wichtig:** Der Header nutzt den Persona-Rollennamen (kommt aus der aktiven Persona zur Laufzeit), nicht fest "Relay".

---

### E.5 — Neue Entity: Watchdog (Testing Assistant)

**Quelle:** moreismore/spec-qa-entity.md
**Prioritaet:** SHOULD

**Rolle:** Systematischer Tester. Adversarial by default. Spec ist Wahrheit.

**Vier Phasen:**
1. Testplan erstellen (Spec lesen, Akzeptanzkriterien extrahieren, Testcases als Checkliste)
2. Tests ausfuehren (manuell + automatisiert wo moeglich)
3. Ergebnisse melden (Testbericht als Note, Bugs direkt in Outbox filen)
4. Regressions-Tracking (Regressions-DB als Note, bei jedem Testlauf pruefen)

**Charakter-Attribute (entity-spezifisch, nicht Persona):** Gruendlich, skeptisch, fair. Adversarial-Modus dominiert Testphasen. Kein Zyniker — will dass die Software gut ist.

**Abgrenzung:**
- Audit: Code-Qualitaet (statisch, liest Code)
- Watchdog: Funktionalitaet (dynamisch, nutzt die App)
- Companion: Erklaerung (explorativ, mit User)

**Werkzeuge:**
- Regressions-DB-Template (Note mit Tag `regressions`)
- Testplan-Template
- Testbericht-Template
- Bugreport-Shortcut (direkt in Outbox schreiben)

**Workflow-Integration mit anderen Entities:**
- Audit meldet Code-Problem → Watchdog prueft ob es sich im Verhalten zeigt
- Companion meldet User-Bug → Watchdog reproduziert systematisch und filed Bugreport
- Orchestrator fix ist done → Watchdog verifiziert den Fix + Regression
- Refinement liefert Spec → Watchdog erstellt Testplan vorab (Shift-Left)
- Orchestrator-CLAUDE.md erweitern: nach Worker-Done optional Watchdog triggern
- Companion-Routing: "Bug gefunden" → an Watchdog weiterleiten statt selbst filen

---

### E.6 — Learning-Separation (Privat vs. Produkt)

**Quelle:** moreismore/spec-learning-separation.md
**Prioritaet:** MUST (greift AB SOFORT beim Preset-Entwickeln, nicht erst nachtraeglich)

**Kern-Problem:** Waehrend wir die Presets entwickeln und verbessern, entstehen zwei Sorten Wissen gleichzeitig — und beide landen aktuell im selben Memory-Topf:

**Zwei-Klassen-System:**
- **Produkt (shipped):** Alles was die Preset-Definitionen selbst verbessert. Wenn wir lernen "der Orchestrator sollte vor Kill immer git status pruefen" oder "der Watchdog braucht in Phase 1 eine bestimmte Frage-Reihenfolge" — das gehoert in die Preset-Definition (CLAUDE.md, Faehigkeiten, Arbeitsregeln) und wird mit cipher-mux ausgeliefert. Jeder neue User bekommt es.
- **Privat (bleibt lokal):** User-spezifisches Wissen — Praeferenzen, aktuelle Projekte, Arbeitsweise, persoenliche Einstellungen. Bleibt im lokalen Memory (Companion-Memory, Claude-Memory), geht nie in den Auslieferungsumfang.

**WICHTIG — Im Entwicklungsprozess verankern:** Die Routing-Regel muss VON ANFANG AN bei jeder Preset-Verbesserung greifen, nicht erst nachtraeglich sortiert werden. Jedes Mal wenn ein Preset verbessert wird, muss klar sein: kommt das in die shipped Definition oder ist das nur lokal.

**Routing-Regel:** "Wuerde ein anderer User mit frischer Installation davon profitieren?"
- Ja + automatisierbar → Code-Feature (Spec nach moreismore/)
- Ja + Judgment → Entity-CLAUDE.md Vorschlag (nach moreismore/) → wird Teil der shipped Preset-Definition
- Ja + Bug-Workaround → Bugreport
- Ja + didaktisch → Guide-Update
- Nein → nur eigener Speicher (Companion-Memory, Claude-Memory)

**Rueckkanal:** Entities schreiben Vorschlaege nach moreismore/, User/Review entscheidet was in den Auslieferungsumfang kommt.

**Dateiformat fuer Learning-Vorschlaege:**
```markdown
# Learning: <Kurzbeschreibung>
**Quelle:** <Entity-Name> (<Datum>)
**Typ:** code-feature | claude-md-update | guide-update | bugreport
**Ziel-Entity:** <welche Entity-CLAUDE.md oder welcher Guide>
## Erkenntnis
## Kontext
## Vorgeschlagene Aenderung
```

**Migrations-Plan bestehende Learnings (Orchestrator, 14 Eintraege):**
- 9 Produkt-Learnings → in Repo-CLAUDE.md / Code migrieren
- 5 Private Learnings → bleiben
- Companion/Refinement/Audit: noch zu inventarisieren

**Code-Features (aus Learnings abgeleitet):**
- Auto-Cleanup Input Requests
- Session-Ready-Wait (`waitForReady: true`)
- Kill-Guard (git status/log vor Kill)
- Learning-Vorschlag-Tool (`mux_learning_suggest`)

---

### E.7 — FEATURE: Preset-Button mit Resume-Option + Start-Prompt abschalten

**Quelle:** Note 01KQ97QCH906RQ7CQ1C5RGNC8Y
**Prioritaet:** SHOULD

Zwei Wuensche:
1. Preset-Button mit zwei Klickzonen: links = neue Session, rechts = --resume
2. Start-Prompt fuer Companion weglassen/leichtgewichtig machen (aktuell zu langsam: user-profile lesen, memory_recall etc.)

---

### E.8 — FEATURE: Auto-Start Companion bei keinem Workspace

**Quelle:** Testcases Feature-Requests
**Prioritaet:** SHOULD

Wenn kein Workspace geladen ist, soll der Companion automatisch starten. Mit Setting zum Abschalten.

---

## Cluster F: Voice-Relay (STT + TTS)

### F.1 — Status: STT funktioniert, TTS fehlt

**Quelle:** Note 01KQAAGB4SVZNPWXKXS92YY8HQ, Note 01KQ981GD0TASF1S8HW29ZNFG4
**Prioritaet:** Hoch (volle Sprach-Schleife ist Kern-Feature)

**STT:** Funktioniert. Fokus-Following laeuft. **NICHT KAPUTTMACHEN** (T-VC.X2 PASS).
**TTS:** Fehlt. Antworten werden nicht vorgelesen. Mehrfach versucht, gescheitert.

### F.2 — TTS: Konzept-Review und Neuansatz noetig

**Quelle:** Note 01KQ981GD0TASF1S8HW29ZNFG4

**Bisheriger Ansatz:** Session-Output mitlesen, an Piper TTS weiterleiten. Funktioniert nicht zuverlaessig.

**Gewuenschtes Vorgehen:**
1. Makro-Ebene betrachten — Gesamtkonzept in Frage stellen
2. Aktuellen Ansatz analysieren — warum funktioniert Session-Mitlesen nicht?
3. Alternativen aufzeigen:
   - Text-Marker im Voice-Relay Output fuer TTS-faehigen Text
   - MCP-Tool das Text direkt an TTS sendet (statt passiv mitlesen)
   - Andere Architektur
4. Latenz beruecksichtigen (niedrig = Prioritaet)
5. Nach Abstimmung mit User: neuer fundierter Fix-Versuch

**Relevanter Code:** `src/main/voice/`, VoiceOutputRouter, PiperTTS, ConversationEngine

---

### F.3 — FEATURE: STT Pin-to-Session (Fokus-Lock)

**Quelle:** Note 01KQ82525VN656M2Y1NP0EECMK
**Prioritaet:** SHOULD

**Mechanik:** Klick auf Session-Anzeige in StatusBar fixiert STT auf diese Session. Nochmal klicken loest. STT-Fokus-Following (default) nicht kaputtmachen.

**Anwendungsfall:** Voice in Session A diktieren, gleichzeitig in Session B klicken/lesen.

---

### F.4 — BUG: STT sendet an Hintergrundsession statt fokussierte (T-VC.X1)

**Quelle:** Testcases T-VC.X1
**Schwere:** Kritisch

**Symptom:** STT-Output wird per send-keys an eine Hintergrundsession (z.B. Worker) geschickt statt an die fokussierte Grid-Session. User quatschte versehentlich in einen laufenden Worker rein.

**Anforderung:** STT muss AUSSCHLIESSLICH an die aktuell fokussierte Session im Grid senden, nie an Hintergrundsessions.

---

### F.5 — BUG: STT Leerzeichen nach Segment fehlt (T-VC.X3 / T-UI.X7)

**Quelle:** Testcases T-VC.X3, T-UI.X7
**Schwere:** Mittel

**Symptom:** Beim Diktieren fehlen Leerzeichen zwischen Segmenten wenn User kurz pausiert. Naechstes Whisper-Segment klebt ohne Leerzeichen am vorherigen.

**Fix:** Nach jedem STT-Segment ein Leerzeichen anhaengen bevor es per send-keys geschickt wird.

---

### F.6 — BUG: BugReport-Popup z-Index und STT-Ablauf (T-VC.4/5)

**Quelle:** Testcases T-VC.4, T-VC.5
**Schwere:** Mittel

**Probleme:**
1. **z-Index:** Info-Popup schwebt UEBER dem BugReport-Popup. BugReport wird einen Layer zu tief geoeffnet.
2. **STT-Pause unzuverlaessig:** STT sollte bei BugReport-Open sofort deaktiviert werden. Aktuell lauft STT teilweise weiter (Bubbles im BugReport zeigen STT-Text an).
3. **STT resumed nicht:** Nach Schliessen des BugReport-Popups kehrt STT nicht zum vorherigen Zustand zurueck.

**Erwarteter Ablauf:**
1. BugReport auswaehlen → STT aus
2. BugReport-Popup oeffnet sich (Voice deaktiviert)
3. User erfasst Report
4. Popup schliessen
5. Falls vorher STT an war: STT wird wieder aktiviert

---

## Cluster G: Settings / UI-Polish

### G.1 — Settings-Dialog UX-Ueberarbeitung

**Quelle:** Note 01KQAGT04HXDS9XJKR79FRMNQ0, Testcases T-UI.X32
**Prioritaet:** SHOULD

1. Reiter statt Endlos-Liste (Allgemein, Layout, Modelle, Themes, Shortcuts)
2. Versioninfo auf eigene "Ueber"-Seite
3. Sinnvoller Default-Tab (letzten merken oder meistgenutzt)

---

### G.2 — BUG: Info-Button umbenennen zu "Settings"

**Quelle:** Note 01KQAGJ60EADHMP4TK21E68N39, Testcases T-UI.X35
**Schwere:** Niedrig (Naming)

StatusBar-Button heisst "info", oeffnet aber Settings. Umbenennen. MCP-Tool "info-dialog" ggf. Alias "settings" einfuehren.

---

### G.3 — BUG: Shortcuts-Fenster unvollstaendig

**Quelle:** Note 01KQAGSS152SS2EYZQ0B7YXRNB, Testcases T-UI.X30
**Schwere:** Niedrig

Nur Copy/Paste gelistet. Fehlen: Session-Wechsel, Grid-Steuerung, alle anderen Shortcuts. Entweder vollstaendig machen oder entfernen.

---

### G.4 — Context-%-Anzeige als Farbbalken

**Quelle:** Handoff-Dokument

**Design-Entscheidung (steht):**
- Keine Prozentzahl mehr
- Ladebalken von links nach rechts hinter der Schrift im Session-Header
- Farbverlauf: Gruen (0-30%) → Gelb (~40%) → Orange (~50%) → Rot (~60%+)
- Frueh warnen (angezeigter Wert niedriger als real, upstream Bug)
- 0% = leer, 65% angezeigt = komplett gefuellt (weil 65% ≈ 85-90% real)
- Halbtransparenter Layer, dezent

**Recherche:** `docs/research-context-and-xterm-2026-04-27.md` Abschnitt 1

---

### G.5 — Sidebar-Fenster: Gesamtverhalten (T-UI.X1)

**Quelle:** Testcases T-UI.X1, T-UI.X14, T-UI.X15, T-UI.X16
**Prioritaet:** Mittel

Das ausgepoppte Sidebar-Fenster hat vier offene Punkte:

1. **Sidebar-Button in StatusBar** soll bei ausgepopptem Fenster als **Show/Hide-Toggle** wirken (aktuell: keine Funktion, T-UI.X16)
2. **Fenster schliessen (X-Button)** soll die Sidebar **weg machen** (Fenster zu, Sidebar weg). NICHT reintegrieren (aktuell: reintegriert, T-UI.X15)
3. **Separater Andock-Button** (kleiner Pfeil o.ae.) in der Fenster-Kopfzeile zum expliziten Reintegrieren — damit "On/Off" getrennt von "Fenster vs. integriert"
4. **Fenstergroesse merken:** Sidebar-Fenster auf bestimmte Groesse gezogen → per Button versteckt → wieder eingeblendet → Groesse erhalten (aktuell: zurueckgesetzt, T-UI.X14)

**Zusammenfassung:** Sidebar-Button = show/hide. Andock-Button = reintegrieren. Fenster-X = schliessen. Groesse persistieren.

---

### G.6 — BUG: Default-Workspace setzbar (T-UI.4, FAIL Runde 2)

**Quelle:** Testcases T-UI.4
**Schwere:** Hoch

Kein Default-Toggle/Button im Workspace-Popup sichtbar. Workspace kann nicht als Default markiert werden. Commit 48d71c6 sollte das fixen, hat nicht gegriffen.

---

### G.7 — BUG: Workspace-Editor Browse oeffnet Finder statt Unified Popup (T-UI.X10, FAIL Runde 2)

**Quelle:** Testcases T-UI.X10
**Schwere:** Hoch

Browse-Button im Workspace-Editor oeffnet nativen macOS Finder-Dialog statt das Unified Selection Popup (Presets/Pfad/Notes). Soll dasselbe Popup wie bei den "+" LauncherCells im Grid oeffnen.

---

### G.8 — BUG: Theme-Editor Live-Preview (T-UI.X20)

**Quelle:** Testcases T-UI.X20
**Schwere:** Mittel

Live-Preview im Theme-Editor funktioniert nicht. Kompromiss: "Preview"-Button der temporaer anwendet ohne zu speichern.

---

### G.9 — BUG: Projektwechseln-Button fehlt beim Orchestrator (T-UI.X26)

**Quelle:** Testcases T-UI.X26
**Schwere:** Mittel

Orchestrator-Session hat keinen Projektwechseln-Button im Header. Companion hat ihn, Orchestrator nicht. Alle Entity-Sessions sollten dieselben Header-Buttons haben.

---

### G.10 — BUG: Workspaces-Fenster oeffnet schwarz mit Fehlermeldung (T-UI.X24)

**Quelle:** Testcases T-UI.X24
**Schwere:** Mittel

Fenster oeffnet sich mit schwarzem Hintergrund und Fehlermeldung. Inhalt nicht sichtbar/nutzbar. Vermutlich URL-Routing-Problem.

---

### G.11 — BUG: Muelleimer-Icon Pixel-Position (T-UI.X21)

**Quelle:** Testcases T-UI.X21
**Schwere:** Niedrig

CSS-Art-Symbol (gefixt in RT-X5) ist ein paar Pixel zu hoch positioniert. Sollte etwas nach unten ruecken.

---

### G.12 — BUG: GridSelector-Darstellung weicht vom echten Grid ab (RT-X3)

**Quelle:** Testcases RT-X3
**Schwere:** Niedrig

GridSelector zeigt andere Zellenaufteilung als das echte Grid.

---

## Cluster H: Architektur / Infrastruktur

### H.1 — Learnings in Session-Templates einpflegen

**Quelle:** Note 01KQ9AMD5DK0SR2BN72JA6DHD0, Handoff
**Prioritaet:** MUST (ohne das gehen Learnings bei Neuinstallation verloren)

**5 Aenderungen:**
1. Quality Gate in MPO Phase 4 (konkrete Testcases, Code-Qualitaets-Regeln, Doku-Anforderungen)
2. Session-Kontinuitaet (Phase 11 + Handoff-Protokoll, Reuse vor Respawn)
3. tmux-Regeln in MPO Phase 5 (Session-Namen statt Pane-IDs, trailing Enter)
4. MCP-API-Warnung (mux_create_session statt manuelles tmux new-session)
5. tmux-Warnung im Orchestrator-Template

**Konkreter Inhalt (aus Handoff):**
- Bugfix-Phasenmodell (Investigate → Fix → Verify)
- Macro-Analysis Eskalation nach 2 Fehlschlaegen
- Worker-Briefing-Regeln (Symptome beschreiben, nicht Loesung vorgeben)
- Thematisches Clustering (ein Worker pro Cluster)
- Worker-Startup-Protokoll (12 Schritte)
- Worker lebt bis Re-Test PASS
- Context-Uebergabe bei >80%
- Subagents fuer Debugging und Investigation

**Betroffene Dateien:** `src/main/session/mpo-template.ts`, `src/main/session/orchestrator-template.ts`
**Risiko:** Gering — nur Text-Ergaenzungen in Template-Strings.

---

### H.2 — CLAUDE.md-Architektur

**Quelle:** Note 01KQ9ACBN772ME36FAYAF469YF

**Geloest:** CLAUDE.md wird nur noch geschrieben wenn sie nicht existiert (Commit 6b7fda9). MCP-Daten in separater `.mcp-connection.md`.

**Offen:** Companion/Refinement nutzen `.entity-deployed` Marker. Template-Aenderungen im Source erreichen bestehende Installationen nicht. Migrations-Mechanismus fehlt.

---

### H.3 — Konfigurierbare LLM-Provider

**Quelle:** Note 01KQ2GZ6BR7KCC6CJ5FGDXTS9P
**Prioritaet:** SHOULD (fuer Veroeffentlichung MUST)

**Anforderungen:**
- LP-01: Ollama-Verbindung bleibt (MUST)
- LP-02: API-Key-Eingabe fuer OpenAI, Anthropic, Google (MUST)
- LP-03: Modell-Auswahl pro Provider (MUST)
- LP-04: Provider-Auswahl fuer Bugreport-Funktion (MUST)
- LP-05: Verbindungstest (SHOULD)
- LP-06: Credentials lokal, nicht im Repo (SHOULD)

**Bugreport-Integration:**
- BR-01: Konfigurierten Provider nutzen (MUST)
- BR-02: Offline-Faehigkeit: kein API → Ollama, kein Ollama → Template-only (MUST)
- BR-03: Provider-Wechsel ohne Restart (SHOULD)

---

### H.4 — mux_send: Duale Delivery (tmux + Message-Bus)

**Quelle:** Testcases T-UI.X6
**Prioritaet:** Mittel

**Architektur-Entscheidung (steht):** Jedes `mux_send` mit Push-Delivery soll BEIDES tun:
1. tmux send-keys an die Ziel-Session
2. Eintrag im Message-Bus (sichtbar in Sidebar)

**Grund:** User will in der Sidebar mitlesen koennen was zwischen (Hintergrund-)Sessions kommuniziert wird. Fuer Grid-Sessions leicht redundant, aber einheitliches Verhalten ist wichtiger als Optimierung.

---

### H.5 — BUG: mux_send Push-Delivery kein Enter (T-UI.X8)

**Quelle:** Testcases T-UI.X8

Push-Delivery per tmux send-keys schreibt Text in die Ziel-Session, aber sendet kein Enter. Default: mit Enter bestaetigen. Optionaler Parameter um das zu unterdruecken.

---

### H.6 — BUG: mux_send Push-Delivery Base64-Blob (T-UI.X9)

**Quelle:** Testcases T-UI.X9

Push-Delivery schickt internen Transport-Mechanismus (base64-encoded echo-Kommando) statt Klartext. Fix: Nur Klartext per send-keys, keine interne Kodierung.

---

### H.7 — BUG: Orchestrator kann keine Messages senden (T-UI.1)

**Quelle:** Testcases T-UI.1
**Schwere:** Mittel

Companion kann senden (PASS), Orchestrator nicht (nichts erscheint in Sidebar). Moeglicherweise MCP-Tool-Problem auf Orchestrator-Seite.

---

### H.8 — mux_create_session: Zwei Modi (Entity-Start vs. Plain)

**Quelle:** Testcases T-UI.X23
**Prioritaet:** SHOULD

**Anforderung:** `mux_create_session` soll zwei Modi unterstuetzen:
1. **Entity-Start:** Claude mit richtigen Optionen starten (z.B. `--dangerously-skip-permissions` je nach User-Setting). Fuer alle Entity-Presets.
2. **Plain-Session:** Nur tmux-Session im Verzeichnis oeffnen, kein Claude starten.

Aktuell: Oeffnet tmux-Session, startet Claude nicht automatisch.

---

### H.9 — Terminal-Zeilen (xterm.js fit()-Bug)

**Quelle:** Testcases T-LC.7, RT-3
**Schwere:** Niedrig (Workaround: Doppelhoehe)

Zeilen fallen auseinander beim Oeffnen einer Session und beim Zurueckholen aus Hintergrund. Recherche liegt vor: `docs/research-context-and-xterm-2026-04-27.md`. Loesung: Visibility-Gate, ResizeObserver pro Grid-Zelle mit 150ms Debounce, Double-Fit bei Session-Attach, explizite tmux resize-pane Synchronisation.

---

### H.10 — Session Restore Dialog (RT-4, geparkt)

**Quelle:** Testcases RT-4
**Status:** 2x gescheitert, ruht bis Workspace-Kontext geklaert

---

## Cluster I: Showcase / Video-Produktion

### I.1 — Companion Video & Demo Mode (Feature)

**Quelle:** moreismore/showcase/feature-companion-video-mode.md
**Status:** IN ARBEIT (MCP-Tools implementiert, Tests laufen)

**Drei Szenarien:**
1. Showreel/Trailer (60-90s, geschnitten)
2. How-To-Clips (2-5 Min, fokussiert)
3. Live-Onboarding in der App (Echtzeit, hoechste Anforderungen)

**Abhaengigkeitskette:** MCP-Tools stabil → UI-Highlighting → Skills → Videos/Onboarding

---

### I.2 — Companion Demo Skills (Vision)

**Quelle:** moreismore/showcase/companion-demo-skills-vision.md
**Status:** Entwurf — wird interaktiv ausgearbeitet wenn Tools stabil

Skills als Markdown-Dateien mit Anweisungen, kein Parser. Drei Skill-Typen:
- Showreel-Skill (beeindruckende Sequenz)
- How-To-Skills (pro Clip ein Skill)
- Live-Hilfe (ad-hoc, kein Skill noetig)

**Offene Fragen:**
- Humor/Persoenlichkeit: kommt aus aktiver Companion-Persona (→ E.1)
- Voice-Over separat oder Terminal-Output?
- Clip-Laenge: strikt 2-5 Min oder flexibel?
- Reihenfolge der Clips?
- Live-Hilfe: aktiv vorschlagen oder nur auf Fragen reagieren?

---

### I.3 — Showcase: Rezept-Extraktor

**Quelle:** moreismore/showcase/showcase-rezept-extraktor.md
**Status:** IDEE

Demo-Szenario: Von ct3003-Prompt (Keno, Vibe-Coding) zu fertigem Tool in einer Sitzung. Zeigt Refinement → MPO → Worker → Testing → Ergebnis.

---

## Cluster J: Zukunftsmusik (v2, nicht jetzt)

### J.1 — Multi-Provider, Cross-Platform

**Quelle:** Note 01KQ9960HWPZ8JK4J1DPNXQRGX
**Status:** Planung, KEIN aktiver Scope

**Leitplanken:**
- v1 = Claude Coding Cockpit, macOS only
- v2 = offenes Multi-Provider-Cockpit, Cross-Platform

**Relevanz fuer v1:** Bei Architektur-Entscheidungen darauf achten, dass v2 nicht verbaut wird (Provider-Abstraktion, tmux-Kapselung, plattformspezifischer Code isoliert).

---

## Offene Fragen

Zu klaeren BEVOR Umsetzung beginnt:

### Architektur / Priorisierung

1. **Grid-Bugs (A.1-A.3) vs. neue Features:** Sollen Grid-Bugs zuerst gefixt werden (Stabilitaet), oder parallel zu neuen Features?
2. **MCP-Drops (A.4):** Ist das fixbar auf unserer Seite, oder muessen wir auf Claude-Code-Update warten? Automatischer Reconnect machbar?
3. **Entity-Scanner (E.3):** Wo liegt die Entity-Registry-Logik? Neuer Service oder Erweiterung des Session-Managers?
4. ~~**Testing Assistant vs. Watchdog:**~~ **GEKLAERT:** Eine Entity. Adversarial-Modus ist Phasen-Modus, kein eigener Charakter.

### Design-Entscheidungen

5. **Backdrop-Opacity:** Fester Wert (30%) oder konfigurierbar? Wenn konfigurierbar: wo in Settings?
6. **Compact Sessions:** Was zaehlt als "abweichendes Working Directory"? Nur wenn projectPath != Anzeigename?
7. **Context-Farbbalken:** Exakte Farb-Breakpoints und Opacity des Layers?
8. **Drag & Drop Notes → Session:** Welcher Prompt-Text wird generiert? Wie detailliert?
9. **Preset-Editor Layout:** Exakte Reiter-Bezeichnungen, Fenster-Mindesthoehe, Warnungs-Text?

### Voice

10. **TTS-Architektur:** Session-Mitlesen vs. MCP-Tool vs. Dritte Option — Macro-Analysis-Worker empfohlen
11. **STT Pin-to-Session:** Visuelles Feedback — nur Farbe oder auch Text/Icon?

### Testcase-Modus

12. **Screenshot-Methode:** Spike durchfuehren oder direkt `screencapture -i -c` waehlen?

---

## Abhaengigkeitsgraph

```
KRITISCH (Stabilitaet):
  A.1/A.2/A.3 (Grid-Bugs) → blockiert zuverlaessiges Arbeiten
  A.4 (MCP-Drops) → blockiert Demo-Mode-Tests, Companion-Nutzung
  C.3 (Copy/Paste) → blockiert Notes-Nutzung

FUNDAMENT (vor Features):
  H.1 (Template-Learnings) → unabhaengig, sofort machbar
  E.1 (Persona-Injection fuer alle) → Code: session-manager.ts + character-defaults.ts

FEATURES (nach Stabilitaet):
  E.2 (Preset-Editor UI) → braucht E.1, braucht E.4 (neues Template)
  E.3 (Presets dynamisch) → braucht E.1 (Persona-Injection), parallel zu E.2
  E.4 (CLAUDE.md Rewrites) → braucht E.1 (Persona-Konzept klar)
  B (Demo-Mode Fixes) → braucht A.4 geloest
  C (Notes-Ausbau) → braucht C.3 geloest
  D (Testcase-Modus) → braucht C (Notes-Basis) + E (Entity-Modell)
  F (Voice TTS) → unabhaengig, eigener Cluster
  G (Settings-Polish) → unabhaengig, niedrige Prio

SHOWCASE:
  I → braucht B (Demo-Mode) stabil + mindestens 1 Feature-Cluster fertig

ZUKUNFT:
  J → nicht vor v1.0 Veroeffentlichung
```

---

## Empfohlene Reihenfolge fuer MPO

1. **Wave 1 (Stabilitaet):** A.1-A.3 (Grid-Bugs, thematisch geclustert), C.3 (Copy/Paste), H.1 (Templates)
2. **Wave 2 (Persona-Fundament):** E.1 (Persona-Injection alle Entities, Code), E.4 (alle CLAUDE.md umschreiben)
3. **Wave 3 (Entity-System UI):** E.2 (Preset-Editor), E.3 (dynamische Presets, Entity-Scanner)
4. **Wave 4 (Demo + Notes):** B.3/B.4/B.7/B.8 (Demo-Bug-Fixes + Toggle), C.1/C.2 (Notes-Verwaltung), G.4 (Farbbalken)
5. **Wave 5 (Testcase + Voice):** D (Testcase-Modus, intern 4 Wellen), F.2 (TTS Macro-Analysis)
6. **Wave 6 (Polish):** G.1-G.3 (Settings), B.5/B.6 (Demo-Feinsteuerung), E.7 (Resume-Option), F.3 (Pin-to-Session)
7. **Wave 7 (Showcase):** I.1-I.3 (Video-Produktion)

---

## Anhang: Vollstaendiger Test-Status (aus docs/v0.11-w3.1-testcases.md)

### Gefixt und verifiziert (PASS)

| Item | Was | Commit |
|------|-----|--------|
| RT-1 | LauncherCell Popup z-Index | a847537 |
| RT-5 | Note-Klick in Sidebar | 2124a61 |
| RT-X1 | Grid LauncherCells nach Neustart (Macro-Analysis) | acb16be |
| RT-X2 | GridSelector Race Condition (Macro-Analysis) | acb16be |
| RT-X6 | Note ohne Titel zeigt "Ohne Titel" statt ID | 6edabe7 |
| RT-2 | Projektwechseln-Button (Companion) | c1a413d |
| T-UI.X5 | Sidebar-Organisation / Reihenfolge | 0136aa9 |
| T-UI.X11 | Pfad-Anzeige Zeilenumbruch | 6edabe7 |
| RT-X5 | Muelleimer-Icon CSS-Art | 6edabe7 |
| T-UI.X12 | "klick"-Beschriftung entfernt | 48d71c6 |
| T-UI.X18 | Scan-Pfade entfernt | 48d71c6 |
| MCP | Connection-Drop Hardening (4h Timeout, Keep-Alive) | 9187e1d |
| CLAUDE.md | Nicht mehr bei jedem Start ueberschrieben | 6b7fda9 |

### Demo-Mode Test-Ergebnisse

| Test | Status |
|------|--------|
| T-DM.1 Highlight glow | PASS |
| T-DM.2 Outline-Style | FAIL — identisch mit Glow |
| T-DM.3 Custom duration | PASS |
| T-DM.4 Permanent (duration: 0) | PASS |
| T-DM.5 Clear | PASS |
| T-DM.6 Mehrere gleichzeitig | PASS |
| T-DM.7 Unbekanntes Target | FAIL — ok:true statt Fehler |
| T-DM.8 Resize waehrend Highlight | PASS |
| T-DM.9 Theme-Wechsel waehrend Highlight | PASS |
| T-DM.10 Workspace-Popup | PASS |
| T-DM.11 Info-Dialog | PASS |
| T-DM.12 Launcher-Popup | FAIL — ok:true aber nichts passiert |
| T-DM.13 Unbekanntes UI-Target | PASS |
| T-DM.14-16 Theme-Wechsel | PASS |
| T-DM.17 Theme-Persistenz | PASS |

### Voice-Cluster Status

| Test | Status |
|------|--------|
| T-VC.1 COM startet Voice-Relay | PASS |
| T-VC.2 STT mit Enter gesendet | PASS |
| T-VC.3 TTS-Antwort | FAIL — kein TTS |
| T-VC.4 STT pausiert bei BugReport | FAIL — z-Index + STT-Pause |
| T-VC.5 STT resumed nach BugReport | FAIL — bleibt haengen |
| T-VC.6 Kein Voice-Preset | PASS |
| T-VC.7 Graceful Shutdown | PASS |
| T-VC.X1 STT an Hintergrundsession | BUG (kritisch) |
| T-VC.X2 STT Fokus-Following | PASS (NICHT KAPUTTMACHEN) |
| T-VC.X3 Leerzeichen nach Segment | BUG |

### Recherche-Dokumente (verfuegbar)

- `docs/research-context-and-xterm-2026-04-27.md` — Context-Anzeige (upstream Bug) + xterm.js fit() (Visibility-Gate, ResizeObserver, Double-Fit)
- `docs/research-notes-management-2026-04-27.md` — Notes-Management-Systeme, Tag-Hierarchien, Libraries (react-arborist, headless-tree)

---

*Dieses Dokument ist die Single Source of Truth fuer den naechsten MPO-Auftrag. Revidiert am 2026-04-28 nach Vollstaendigkeitscheck (187 Anforderungen geprueft) und User-Korrekturen zu Cluster E.*
