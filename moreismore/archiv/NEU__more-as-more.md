# more-as-more — Offene Feature Requests v0.11

> Was noch vor dem Cyber-Factory-Pack umgesetzt werden soll.
> Cyber-Factory-Pack Items → siehe `moreismore/cyber-factory-pack/`

---

## Offene Items

### Workspace-System

#### WS-1: Workspace-Start mit Resume-Option (SHOULD)
*(Ref: 01KQCEBCV6B6XST8AWJE8GD1Z8)*

Wenn ein Workspace geladen wird und es noch laufende Sessions gibt, soll der User gefragt werden: "Sessions aus dem letzten Mal weiterfuehren oder neu starten?" — bezogen auf alle Sessions die im Workspace definiert sind.

**Per-Workspace-Setting (Resume-Praeferenz):**
- **Immer Resume** — Sessions werden mit --resume gestartet, kein Prompt
- **Immer frisch** — Neue Sessions, kein Prompt
- **Fragen** (Default) — Prompt beim Laden

Verwaiste Sessions (nicht mehr einem Workspace zugehoerig) tauchen einfach in der Sidebar auf. Kein Recovery-Popup noetig.

**Auswirkung auf bestehende Features:**
- Recovery-Dialog (ganzseitiges Overlay) wird fuer den Normalfall obsolet. Bleibt evtl. als Fallback fuer echte Crash-Recovery, aber nicht als primaerer Flow.
- Testcases T-GR.14/T-GR.15 (Session-Recovery) muessen angepasst werden — Recovery ist dann Teil des Workspace-Ladens.

**Einstieg:**
- Workspace-Lade-Logik: `workspaceManager` bzw. `applyWorkspace()` im Main-Process
- UI: Neuer Dialog/Popup der beim Workspace-Laden erscheint wenn laufende Sessions erkannt werden
- Abhaengigkeit zu WS-7 (Lade-Tracker, DONE) — der Tracker kann den Resume-Status mitliefern

#### WS-4: Workspace speichern — Update-Option (SHOULD)
*(Ref: 01KQCNADWNZ4BMM2N03V5MZ9TG)*

Im Workspace-Picker (kleines Popup in der Menueleiste) zwei Speicher-Optionen anbieten:

1. **Aktualisieren** — ueberschreibt den aktuell aktiven Workspace mit dem jetzigen Grid-Zustand. Nur sichtbar wenn ein Workspace ausgewaehlt/aktiv ist.
2. **Als neuen Workspace speichern** — legt neuen Workspace an. Immer verfuegbar.

Primaer im Workspace-Picker. Kann zusaetzlich auch im grossen Workspace-Editor integriert werden, aber der Picker ist der Hauptort. Verhindert Duplikate.

#### WS-5: Workspace-Popup vereinfachen (SHOULD)
*(Ref: 01KQCNRG4QJSMM93GKVNQZ5Z2J)*

Das kleine Workspace-Popup in der Menueleiste vereinfachen:

1. **Companion-Direktlink entfernen** — Companion-Auswahl gehoert in den grossen Editor, braucht keinen Shortcut im Popup
2. **Aktionen klarer benennen:**
   - Anlegen / Aktualisieren (siehe WS-4)
   - Editor (oeffnet grosses Fenster)
   - Workspace laden (Auswahl)

Kein "Bearbeiten" als separate Aktion noetig — das ist der Editor.

#### WS-6: Mitgelieferter Default-Workspace (MUST)
*(Ref: 01KQEXBVYKHP9QRAFRMWBM5NCQ)*

App wird mit vordefiniertem Default-Workspace ausgeliefert:
- **Grid:** 2x2
- **Zelle links oben:** Coding Companion
- **Rest:** leer (LauncherCells)
- **Als Favorit/Default gesetzt** (Stern)

Damit hat jeder Erststart ein funktionierendes Setup. Kein leeres Grid, kein manuelles Konfigurieren noetig. Loest das Problem dass die App nach Neustart mit leerem Grid startet wenn der Default-Workspace nicht laedt.

---

### UI & Theme

#### UI-1: Kompakte Darstellung der Hintergrundsessions (SHOULD)

Hintergrundsessions in der Sidebar: Minimalmodus (2 Zeilen: Name + Token-Usage) als Default, Detailmodus (5 Zeilen) per Klick aufklappbar, Doppelklick oeffnet Session.

#### UI-2: Highlight-Farbe im Theme-Editor anpassbar (SHOULD)
*(Ref: 01KQEXHEQD1C4WPSZGXSP32ZGF)*

Die Highlight-Farbe (Glow/Outline) soll zum jeweiligen Theme passen. Aktuell unklar ob die Farbe hardcoded ist oder aus dem Theme kommt.

**Optionen:**
1. **Theme-Editor:** Highlight-Farbe als eigenes Feld im Theme-Editor aufnehmen (wie accent, neon-green etc.)
2. **Automatisch:** Komplementaerfarbe oder kontrastierende Farbe aus der Farblehre ableiten (z.B. basierend auf accent oder border-focus)
3. **Kombination:** Default ist automatisch berechnet, aber im Theme-Editor ueberschreibbar

#### UI-3: Note-Drop auf Session wechselt Fokus (SHOULD)

Wenn eine Note auf eine Session-Zelle gezogen wird, soll der Fokus auf diese Zelle wechseln — damit man direkt Enter druecken oder STT nutzen kann.

#### UI-5: Settings-Dialog UX-Ueberarbeitung (SHOULD)
*(Ref: 01KQAGT04HXDS9XJKR79FRMNQ0)*

Mehrere zusammenhaengende UX-Probleme im Settings-Dialog:

1. **Reiter statt Endlos-Liste:** Settings als lange scrollbare Liste ist bei wachsender Anzahl unuebersichtlich. Settings auf Tabs verteilen (z.B. "Allgemein", "Layout", "Modelle", "Themes", "Shortcuts").
2. **Versioninfo auf Ueber-Seite verschieben:** Versionsinformationen stehen zwischen den Einstellungen. Gehoeren auf eigenen "Ueber"-Tab.
3. **Layout-Tab als Startseite fragwuerdig:** User landet beim Oeffnen im Layout-Bereich — nicht die haeufigste Einstellung. Sinnvoller: letzten Tab merken oder meistgenutzten als Default.

Haengt zusammen mit Demo-Mode-Steuerung: Companion soll auf bestimmte Settings zeigen koennen.

#### UI-6: Demo-Mode Feinsteuerung (SHOULD)
*(Ref: 01KQAGTBGSHY71T4TTDECAWFJC)*

Drei Luecken verhindern echte interaktive Fuehrung im Demo-Mode:

1. **Kein Input waehrend Popup offen:** Wenn Companion den Settings-Dialog oeffnet, kann der User nicht in die Session tippen/sprechen. Session-Input (oder zumindest STT) muss bei offenem Popup weiterlaufen.
2. **Kein Scroll-to-Element:** Companion oeffnet Dialog, scrollt aber nicht zur relevanten Stelle. `mux_ui_open` oder `mux_ui_highlight` sollte optional scroll-into-view unterstuetzen.
3. **Keine Tab-Navigation innerhalb Popups:** Companion kann Dialog oeffnen, aber nicht auf bestimmten Tab wechseln. `mux_ui_open` mit context-Parameter fuer Tab/Sektion erweitern, z.B. `{ target: "info-dialog", context: { tab: "themes" } }`.

**Design-Prinzip:** Bestehende Tools erweitern (context-Objekt), keine neuen Tools. Tool-Anzahl gleich, Maechtigkeitsgrad steigt. Companion ist Guide (zeigt wo), nicht Puppeteer (macht fuer dich).

#### UI-7: Drag & Drop aus Sidebar ins Grid (SHOULD)
*(Ref: 01KQ9A1N0WJ1Q94S335PSS6HYG)*

Hintergrundsessions und Notes sollen per Drag & Drop aus der Sidebar ins Grid gezogen werden koennen.

**Hintergrundsessions → Grid:**
- Auf leere Zelle droppen: Session oeffnet sich dort
- Auf belegte Zelle droppen: Neue Session uebernimmt Zelle, bisherige geht in den Hintergrund

**Notes → Grid:**
- Auf leere Zelle (kein Notes-Editor offen): Notes-Editor oeffnet sich in Zelle mit der Note
- Auf leere Zelle (Notes-Editor schon offen): Note oeffnet sich im bestehenden Editor
- Auf belegte Zelle (Session laeuft): Prompt wird in die Session geschrieben mit Note-Inhalt als Kontext

---

### Notes-System

#### NT-1: Notes-System Iteration — Sammelstelle (SHOULD)
*(Ref: 01KQCPJKF5QX5PP85FYTTD99GY)*

Sammel-Note fuer die naechste Notes-System-Iteration. Die konkreten Teilaspekte sind in NT-4 (Tag-Hierarchie) und NT-5 (Tag-Management UI) ausgearbeitet. Hier die uebergreifenden offenen Punkte:

- **Tag-Baum:** Erste Ebene zu voll — maximal 5-6 Top-Level-Tags, Rest verschachtelt. Level-Angaben oder textbasierte Ordnerstruktur zum Pflegen der Hierarchie fehlen komplett. → Details in NT-4.
- **Tags-Tab UI:** Edit- und Loeschen-Buttons sollen als Textbuttons gestaltet werden (wie in der Menueleiste unten), nicht als Icon-Buttons. → Details in NT-5.
- **Notes in Sidebar:** Drei Textlevel fehlen: Titel (immer), Tags (kompakt), Preview (hover) — Hintergrundsessions haben es, Notes nicht.
- **Testcase-View:** Eigenes Fenster/Grid-Zelle statt Integration in Notes-Editor? → Entscheidung gefallen: Ja, eigene Grid-Zelle. Details in NT-7.

#### NT-2: STT im Notes-Editor (SHOULD)

Speech-to-Text soll im Notes-Editor funktionieren — direkt in eine Note diktieren.

**Abgrenzung zu NT-3:** NT-3 (DONE) betraf STT spezifisch in den Kommentarfeldern des TestcaseView. NT-2 betrifft STT im allgemeinen Notes-Editor (Markdown-Body einer Note bearbeiten per Spracheingabe). Andere Komponente, andere Integration.

#### NT-4: Notes-Verwaltung mit Tag-Hierarchie + Volltextsuche (SHOULD)

Slash-Tags als virtuelles Ordnersystem (`bugs/ui/grid`), aufklappbarer Baum links, gefilterte Liste rechts, FlexSearch fuer Volltextsuche.

Konkreter Teilaspekt aus NT-1 (Sammel-Note). Definiert das Datenmodell und die Navigation fuer verschachtelte Tags.

#### NT-5: Tag-Management UI (SHOULD)

Dritter Tab "Tags" im Workspaces/Personas-Fenster: Tag-Liste mit Count/Description, Tags umbenennen/loeschen/mergen, Sortierung. Neuer IPC-Channel noetig.

Konkreter Teilaspekt aus NT-1 (Sammel-Note). Definiert die Verwaltungsoberflaeche fuer Tags.

#### NT-6: Copy & Paste im Notes-Editor (BUG/SHOULD)
*(Ref: 01KQAA89AR98VHRJ8B7QCTDM39)*

Cmd+C / Cmd+V im Notes-Editor (CodeMirror 6) funktioniert nicht. User will Notes auch fuer Prompts, Snippets und andere Inhalte nutzen, die man reinkopieren oder rauskopieren will. Ohne Copy/Paste ist der Editor stark eingeschraenkt.

**Vermutung:** Das Clipboard-Event wird in der Electron-Integration geschluckt. CodeMirror 6 in Electron braucht moeglicherweise explizite Clipboard-Handler oder die Electron-Menu-Shortcuts ueberschreiben die CodeMirror-Keybindings.

**Ort:** Notes-Editor in der Sidebar (CodeMirror 6 Instanz).

#### NT-7: TestcaseView als eigene Grid-Zelle (SHOULD)
*(Ref: 01KQFCWSZ7KW9NXRW521M3N212)*

TestcaseView soll NICHT im Notes-Editor integriert bleiben, sondern als eigene Grid-Zellen-Komponente laufen.

**Konzept:**
- Eigene Grid-Zelle die weiss, dass sie fuer Testcases zustaendig ist
- **Einstiegsscreen:** Uebersicht aller anliegenden Testcase-Notes (erkennbar am Tag "testcase" oder type-Feld)
- **Testcase-Auswahl:** Klick oeffnet den TestcaseView fuer diesen Testcase
- **Status:** Jeder Testcase hat einen Status (offen/in-arbeit/abgeschlossen), ueber Tags steuerbar
- Testcase-Notes bleiben normale Notes im System, sind nur speziell getaggt

**Vorteile gegenueber Notes-Integration:**
1. User kann parallel Notizen machen (Notes-Editor bleibt frei)
2. Kein Frontmatter-Problem (type-Feld geht beim Save verloren)
3. Eigene UI-Logik ohne Konflikt mit dem Notes-Editor
4. Einstiegsscreen gibt Ueberblick ueber alle offenen Testlaeufe

**Einstieg:**
- Grid-System: Neuer Zellen-Typ `testcase` neben `session`, `notes`, `launcher`
- Renderer: Neue Komponente `TestcaseCell` die TestcaseView rendert
- Notes-Integration: IPC-Query fuer Notes mit Tag "testcase"
- Abhaengigkeit zu NT-4 (Tag-Hierarchie) — Testcases werden ueber Tags identifiziert

---

### Voice & Hands-Free

#### VC-1: Voice-gesteuerte Grid-Navigation (SHOULD)
*(Ref: 01KQJJCDQQ7E47ZF4FYAERFQCP)*

Voice Commands fuer Grid-Fokus-Navigation: Per Sprachbefehl zwischen Zellen im Grid wechseln.

| Sprachbefehl | Aktion |
|---|---|
| "grid hoch" | Fokus eine Zeile nach oben |
| "grid runter" | Fokus eine Zeile nach unten |
| "grid links" | Fokus eine Spalte nach links |
| "grid rechts" | Fokus eine Spalte nach rechts |

STT-Pipeline erkennt bereits Trigger-Phrasen ("abschicken", "neue zeile") — Erweiterung um Navigations-Befehle. `mux_session_focus` existiert bereits zum programmatischen Fokus-Wechsel. Grid-Geometrie und aktuelle Fokus-Position sind bekannt. Logik: aktuelle Position + Richtungsvektor → Ziel-Zelle berechnen → focus aufrufen. Edge-Case: Wrap-around oder Stop am Rand ist Design-Entscheidung.

#### VC-2: Voice-gesteuertes Scrollen in Zellen (SHOULD)
*(Ref: 01KQJJCHCSE8W2XPV8CNFDZWWC)*

Voice Commands fuer Scroll-Steuerung innerhalb der fokussierten Zelle.

| Sprachbefehl | Aktion |
|---|---|
| "hoch scrollen" / "scroll hoch" | mux_cell_scroll action: up |
| "runter scrollen" / "scroll runter" | mux_cell_scroll action: down |
| "ganz nach oben" | mux_cell_scroll action: top |
| "ganz nach unten" | mux_cell_scroll action: bottom |
| "zum Anfang" | mux_cell_scroll action: to-marker |

`mux_cell_scroll` existiert bereits mit allen noetigen Actions. STT-Pipeline muss weitere Trigger-Phrasen erkennen und statt Text-Insertion den Scroll-Call ausloesen. Ziel ist immer die fokussierte Zelle.

#### VC-3: Notes-Vorlesefunktion via TTS (SHOULD)
*(Ref: 01KQJ7AF1AH6SF8RGW4Z068QBB)*

Notes sollen vorgelesen werden koennen — als gezielter Test der TTS-Pipeline und als eigenstaendiges Feature.

**Konzept:**
- MCP-Tool oder UI-Button: "Note vorlesen"
- Nutzt die bestehende TTS-Pipeline (`mux_tts_speak`)
- Liest den Body einer Note vor (oder eine Zusammenfassung)
- Stopp-Funktion: `mux_tts_speak` mit `priority: "interrupt"` existiert bereits, alternativ dedizierter Stopp-Button oder BT Shutter als Stopp-Trigger

**Nutzen:** TTS-Pipeline-Test (isoliert), Accessibility (Notes hoeren waehrend man anderes tut), Watchdog (Testergebnisse vorlesen).

#### VC-4: Voice-Mode Auto-Submit vs. BT-Clicker (SHOULD)
*(Ref: 01KQJMK4F4NR4GHPA4RM05RW1C)*

Einstellung die steuert wann erkannter STT-Text abgeschickt wird:

**Option A — Auto-Submit (aktuelles Verhalten):** Nach jedem erkannten Satz wird automatisch Enter gesendet.

**Option B — BT-Clicker-gesteuert:** Erkannter Text wird in die Session geschrieben, aber NICHT abgeschickt. User drueckt BT-Clicker zum Absenden. Erlaubt mehrere Saetze sammeln, Korrektur vor Absenden, natuerlicherer Workflow fuer laengere Prompts.

**Einstellungs-Ort:** Voice-Einstellungen (InfoSettingsView), nur sichtbar wenn BT-Clicker konfiguriert ist (`btShutter.enabled === true`).

**Technisch:** ConfigStore `voiceSubmitMode: 'auto' | 'manual'` (Default: `auto`). VoiceInputRouter sendet bei `manual` kein `\r` nach transkribiertem Text. BT Shutter sendet bei `manual` das Enter.

#### VC-5: System-Audio-Filterung STT / Echo Cancellation (SHOULD)
*(Ref: 01KQJPHC0CMHR20H5B7XA9V2JW)*

STT soll sich nicht von System-Audio irritieren lassen — Videos, Musik, System-Sounds, TTS-Output. Besonders relevant wenn TTS (Piper) und STT (Whisper) gleichzeitig aktiv sind.

**Weg 1 — WebRTC-Bordmittel (niedrig-haengend):** Chromium/Electron hat eingebaute Audio-Processing-Constraints (`echoCancellation`, `noiseSuppression`, `autoGainControl`). Pruefen ob aktiv, falls nicht: Constraints setzen. Risiko: optimiert fuer Videokonferenzen, bei Musik moeglicherweise nicht ausreichend.

**Weg 2 — Loopback-Capture + dedizierte AEC (praezise):** System-Audio-Output als Referenzsignal capturen (macOS 13+: ScreenCaptureKit), per DSP aus Mic-Input subtrahieren (SpeexDSP, RNNoise, WebAudio API), bereinigtes Signal an Silero VAD → Whisper. Hoeher im Aufwand, dafuer zuverlaessig bei komplexem Audio.

**Empfehlung:** Weg 1 zuerst testen. Wenn ausreichend: fertig. Wenn nicht: Weg 2 als Upgrade.

#### VC-6: Hands-Free Scroll Control (SHOULD)
*(Ref: 01KQJ50YTHY01QTWXVFBK554YX)*

Zwei komplementaere Features fuer vollstaendig hands-free Scroll-Steuerung.

**Feature A — `mux_cell_scroll` MCP-Tool:** Bereits implementiert. Claude kann Scroll-Zustand programmatisch steuern. Marker-Mechanismus: Claude setzt unsichtbaren Marker vor Substanz der Antwort, `action: "to-marker"` scrollt dorthin.

**Feature B — Voice-Navigation-Layer (Frontend-Intercept):** Faengt kurze Navigations-Befehle ab BEVOR sie das Terminal erreichen. Kein Enter, kein Auto-Scroll-to-Bottom, keine Claude-Roundtrip-Latenz.

```
STT-Text → cipher-mux Frontend
  ├─ Match gegen Command-Liste? → Scroll-Action direkt, Text NICHT ans Terminal
  └─ Kein Match? → Normal an Claude Code weiterleiten
```

Command-Liste konfigurierbar (Trigger-Woerter, Sprache DE/EN, Scroll-Distanz). Matching: Exact oder Fuzzy mit niedriger Toleranz, nur kurze Inputs (max 3-4 Woerter).

**Zusammenspiel:** Claude scrollt via MCP-Tool nach langer Antwort zum Marker. User scrollt via Voice-Layer stueckweise weiter ("weiter", "zum marker", "ganz runter").

**Offene Fragen:** Marker-Format (Unicode vs. ANSI OSC), Scroll-Distanz abhaengig von Zellhoehe, visuelles Feedback beim Voice-Scroll, Erweiterbarkeit auf andere Voice-Commands ("sidebar auf", "theme dunkel").

**Einstieg:**
1. `mux_cell_scroll` MCP-Tool — Backend + xterm.js Integration, Marker-Format definieren
2. Voice-Navigation-Layer — Frontend-Intercept vor Terminal-Input
3. Konfigurierbare Command-Liste — Settings-UI oder Config-Datei

---

### Session-Management

#### GS-1a: Graceful Shutdown — Sofort in Hintergrund (SHOULD)
*(Ref: 01KQJDGZ8CDEM558PJB690YDTF — offener Teil)*

Grundmechanismus Graceful Shutdown ist implementiert (Abschluss-Prompt, Timeout, Fallback-Kill). Noch offen: Session soll beim Schliessen sofort aus dem Grid verschwinden und im Hintergrund den Graceful-Shutdown durchlaufen. Aktuell blockiert die Graceful-Phase die Zelle. Ziel: User merkt keinen Delay, Session raeumt unsichtbar auf.

---

### Onboarding

#### ON-1: /startup Onboarding-Flow (SHOULD)
*(Ref: 01KQJNE45HCBYSNA1SB7412WQP, Spec: 01KQC1Y204TB501BSVY89CNKFX)*

Der `/startup`-Onboarding-Flow als Companion-Skill. Spec existiert (`entities/companion/docs/specs/2026-04-29-startup-onboarding-design.md`), noch nicht umgesetzt.

**Phasen (aus Spec):**
1. **Bootsequenz** — Theme-Flash, UI-Highlight-Sweep, System-Check. Wow-Moment.
2. **Vorstellung** — Companion stellt sich vor (persona-agnostisch)
3. **Kennenlernen** — STT-Angebot als erstes Feature-Erlebnis, 3-4 Interview-Fragen, Profil wird geschrieben
4. **Feature-Orientierung** — Visuelle Tour: Grid, Presets, Notes/Bugs. Tiefe adaptiv ans Level.
5. **Ordnerstruktur** (optional) — Bestehende Projekte integrieren
6. **Uebergabe** — Naechste Schritte je nach Level

**Was existiert:** Alle benoetigten MCP-Tools (`mux_ui_highlight`, `mux_theme_set`, `mux_tts_speak`, `mux_status`), `user-profile.json`-System, Guides 01-06 und ref/*.

**Was fehlt:**
1. Skill-Implementierung: `/startup` als ausfuehrbarer Companion-Skill
2. Adaptive Tiefe: Level-Erkennung aus Interview → Erklaerungstiefe anpassen
3. Bootsequenz-Choreografie: Timing der Theme-Flashes und Highlights testen/feintunen
4. Unterbrechbarkeit: User muss jederzeit abkuerzen oder Richtung wechseln koennen. Phasenfolge ist Leitplanke, nicht Zwang.
5. Proaktiver Trigger: Companion erkennt fehlendes `user-profile.json` und bietet `/startup` an (nicht erzwingen)

**Offene Design-Fragen:** Delays zwischen Theme-Wechseln, `data-highlight`-Targets gegen UI-Code abgleichen, TTS-Qualitaet live testen, Slash-Command-Name (`/startup` vs `/onboarding` vs `/start`).

---

### Infrastruktur

#### IF-1: MCP-Verbindung droppt spontan (BUG/SHOULD)

MCP-Tools verschwinden waehrend laufender Session ohne Ausloeser. Alle cipher-mux Tools gleichzeitig weg. App-Neustart noetig.

#### IF-2: MCP-Tool: Notes/Testcases in Grid-Zelle oeffnen (SHOULD)

Neues MCP-Tool das Notes und Testcases programmatisch in einer Grid-Zelle oeffnen kann. Aktuell kann man Sessions fokussieren und Notes highlighten, aber nicht oeffnen. Ermoeglicht Watchdog und anderen Sessions Notes direkt anzuzeigen ohne dass der User in der Sidebar klicken muss.

**Einstieg:**
- MCP-Server: Neuer Tool-Handler `mux_notes_open` oder `mux_ui_open` erweitern
- IPC: Neuer Channel der eine Note-ID an eine bestimmte Grid-Zelle sendet
- Renderer: NotesCell muss auf IPC-Event reagieren und Note oeffnen
- Abhaengigkeit zu NT-7 (TestcaseView als Grid-Zelle) — gleiches Pattern fuer Testcases
- Abhaengigkeit zu UI-4 (DONE) — aehnliches Problem war: Zelle muss auch ohne vorherige Interaktion Notes oeffnen koennen

---

### Demo-Mode

#### DM-1: Glow-Highlight deutlicher (NICE-TO-HAVE)
*(Ref: 01KQCQNHDDMB7DF9SSE3CEC7HJ)*

Der Glow-Style (pulsierendes Highlight) koennte ein Tick deutlicher sein. Das Outline (statisch) passt gut. Glow soll staerker "hier, guck genau dahin" signalisieren.

---

## Erledigt (DONE)

| ID | Beschreibung | Erledigt |
|---|---|---|
| WS-2 | Lade-Indikator beim Workspace-Start | v0.11 — subsumiert in WS-7 |
| WS-7 | Workspace-Lade-Tracker + Anzeige + Performance | v0.11 Bug-Fix (MUST-4) |
| NT-3 | STT fuer TestcaseView-Kommentare | v0.11 Bug-Fix (SHOULD-8) |
| EN-4 | Resume-Button immer sichtbar | v0.11 Runde 2 |
| UI-4 | Drag & Drop auf leere Notes-Zelle | v0.11 Runde 1 |
| GS-1 | Graceful Shutdown Grundmechanismus | v0.11 Runde 2 (offen: GS-1a Sofort-in-Hintergrund) |
| — | Voice-Indikator + Pin (Auto-Unpin) | v0.11 Bug-Fix (MUST-2), 6/6 Tests PASS |
| — | TestcaseView Tag-Erkennung | v0.11 Bug-Fix (MUST-1) |
| — | Theme-Editor wirkt auf UI | v0.11 Bug-Fix (SHOULD-6) |
| — | GridSelector nicht bei MPO | v0.11 Bug-Fix (SHOULD-7) |
| — | Companion Startprompt entfernt | v0.11 Bug-Fix (MUST-5) |
| — | BT Shutter Doppel-Enter | v0.11 Runde 2 |
| — | Titel-Verlust beim Save (MCP-Pfad) | v0.11 Runde 2 |

---

Weitere Features → siehe `moreismore/cyber-factory-pack/`

---

*Urspruenglich konsolidiert 2026-04-30 aus Watchdog-Testlaeufen, moreismore-Einzeldateien, User-Feedback.*
*Radikal ueberarbeitet 2026-05-01: Block 2 (Cyber-Factory-Pack) und Block 3 (Hinfaellig) entfernt, DONE-Tabelle erweitert, erledigte Items aus Block 1 verschoben, GS-1 aufgesplittet (Grundmechanismus DONE, GS-1a offen).*
