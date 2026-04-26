# v0.11 Wave 3 — Anforderungspaket

> MPO-Dispatch-Paket | Stand: 2026-04-26 19:00
> Kontext: v0.11 Wave 1+2 committed + getestet. 38 PASS, 10 FAIL, 3 PARTIAL.
> Ziel: Bugfixes aus Abnahme (Prio 1) + UX-Korrekturen + neue Features.

---

## Priorisierung

### Prio 1: Bugfixes (muessen vor allem anderen rein)
1. **SP-BF:** Kritische Bugfixes aus Abnahme (10 FAILs)

### Prio 2: UX-Korrekturen + Features
2. **SP-F:** Tag Management UI
3. **SP-J:** Sidebar Visual Polish
4. **SP-K:** Voice Mode Integration (3-State: OFF/STT/COM)
5. **SP-L:** MCP App-Control Tools (Companion steuert Grid/Sessions)

### Prio 3: Bugreport-Architektur
6. **SP-G:** Bugreport aus StatusBar raus, in Settings verschieben
7. **SP-H:** LLM Provider Settings (Ollama/API-Config)
8. **SP-I:** Companion Bugreport/Feature-Request Skill (kein Button, nur in Sessions nutzbar)

---

## SP-BF: Bugfixes aus Abnahme

### BF-1: Session-Recovery zeigt leere Flaeche (F4) — HOCH

Nach App-Restart werden Sessions wiederhergestellt, aber Terminal-Inhalt ist unsichtbar. Erst nach Klick + Eingabe + Enter wird Content sichtbar.

**Ursache (vermutlich):** xterm.js Terminal-Instanz wird erstellt aber kein reflow/refresh getriggert nach Attach.
**Fix:** Nach Session-Recovery `terminal.refresh(0, terminal.rows - 1)` oder `terminal.resize()` aufrufen.
**Dateien:** `src/renderer/` — Terminal-Komponente, Session-Recovery-Handler

### BF-2: Eject-to-Background-Button ohne Funktion (F9) — HOCH

Cell-Header Button "In Hintergrund" reagiert nicht. Session bleibt im Grid.

**Dateien:** `src/renderer/components/` — CellHeader oder GridCell, app.tsx Handler

### BF-3: Notes nicht in Sidebar sichtbar (F5) — HOCH

Notes existieren in `~/.config/cipher-mux/notes/global/`, Sidebar zeigt "Keine Notes gefunden."

**Moegliche Ursache:** Notes-Scan-Pfad falsch, oder Frontmatter-Parsing fehlerhaft.
**Dateien:** `src/main/notes/`, Sidebar Notes-Sektion

### BF-4: Message-Bus Nachrichten nicht sichtbar (G1.2) — HOCH

MPO sendet Nachrichten (ok:true), aber kein Chat/Nachrichtenbereich oeffnet sich in der Sidebar.

**Moegliche Ursache:** Sidebar Nachrichten-Sektion empfaengt keine Events, oder IPC-Weiterleitung fehlt.
**Dateien:** `src/main/message-bus/`, `src/renderer/components/SidebarPanel.tsx`

### BF-5: Grid-Resize verschiebt Sessions / Reflow-Bug (F11) — MITTEL

Beim Verkleinern des Grids werden Sessions durchgeschoben statt ueberzaehlige in den Hintergrund zu verschieben. Sessions sollen an ihrer Position bleiben.

**Erwartetes Verhalten:** Sessions bleiben an ihrer Grid-Position. Nur was keinen Platz mehr hat wandert in Hintergrund.
**Dateien:** Grid-Resize-Logik in `src/renderer/` oder `src/main/`

### BF-6: Hardcodierte Persona in Entity-Templates (D2.4-6) — MITTEL

MPO, Orchestrator und Audit CLAUDE.md haben hardcodiertes "Wayne Szalinski light" statt dynamischen Charakter-Switch.

**Fix:** Persona-Abschnitt aus den Templates entfernen oder dynamisch aus config-store laden.
**Dateien:** `src/main/session/mpo-template.ts`, `src/main/session/audit-template.ts`, Orchestrator-Template

### BF-7: DevTools nicht oeffenbar in gepackter App (F13) — MITTEL

Cmd+Option+I ohne Funktion. DevTools muessen auch in gepackter App erreichbar sein.

**Fix:** `globalShortcut.register` oder Menu-Item fuer DevTools hinzufuegen.
**Dateien:** `src/main/main.ts`

### BF-8: 1 Test-Fail bugreport-source (TX.2) — KLEIN

`bugreport-source.test.ts` "detects new .md file written after start" failt.

**Dateien:** `test/main/bugreport-source.test.ts`

### BF-10: Whisper-Halluzination "verwendet." rausfiltern — KLEIN

Wenn VAD triggert aber kein echter Speech-Input da ist, halluziniert Whisper repetitiv "verwendet." (klassisches Whisper-Artefakt). Blocklist fuer bekannte Halluzinationen einbauen.

**Fix:** Nach Whisper-Transkription pruefen ob Output in Blocklist ist. Wenn ja, verwerfen (nicht an Session senden).
**Blocklist (Startset):** `"verwendet."`, `"Untertitel von"`, `"Danke fürs Zuschauen"`, `"..."`, `"Vielen Dank."`, `"SWR 2021"`, `"SWR 2022"`
**Dateien:** `src/main/voice/stt-engine.ts` oder `src/main/voice/voice-input-router.ts` (nach Transkription, vor Routing)

### BF-9: LauncherCell umgeht Grid-Placement nicht (F2) — MITTEL

LauncherCell startet Session aber zeigt trotzdem Placement-Popup, obwohl die Zielzelle eindeutig ist (die LauncherCell selbst).

**Fix:** Wenn Session aus LauncherCell gestartet wird, direkt in diese Zelle platzieren, kein Popup.
**Dateien:** `src/renderer/app.tsx`, LauncherCell-Handler

### Quality Gate
- Alle 10 FAILs gefixt
- npm run test → 0 Failures (auch TX.2)
- npm run build sauber

---

## SP-LC: LauncherCell-Popup als zentraler Einstieg (Korrektur von Wave 2)

### Ueberblick
Der "+" Button in der StatusBar war NIE gewollt. Sessions werden ausschliesslich ueber die LauncherCell (grosses "+" in leeren Grid-Zellen) gestartet. Das UnifiedSessionDialog-Popup wird in die LauncherCell integriert.

### Aenderungen

#### StatusBar aufraeumen
- "+" Button aus StatusBar entfernen
- Cmd+N Shortcut bleibt (oeffnet LauncherCell-Popup, fokussiert auf erste leere Zelle)

#### LauncherCell-Popup (ersetzt UnifiedSessionDialog)
Das Popup oeffnet sich wenn man auf eine leere Grid-Zelle (LauncherCell) klickt:

**Drei Bereiche:**
1. **Presets** — Entity-Karten: Companion, Refinement, Voice, Audit
   - Name + kurze Beschreibung + Farbakzent
   - Kein Emoji, clean text
   - Klick → Entity startet direkt in DIESER Zelle (kein Placement-Popup!)
2. **Pfad oeffnen** — FolderPickerInput + Recents + Start-Optionen
   - Gleiche Funktionalitaet wie bisheriger Pfad-Tab
   - Start → Session oeffnet sich in DIESER Zelle
3. **Notes** — Vorhandene Notes anzeigen + "Neue Note"
   - Note auswaehlen → Notes-Editor oeffnet sich in dieser Zelle
   - "Neue Note" → leerer Editor

#### Was mit UnifiedSessionDialog passiert
- Komponente wird in LauncherCell-Popup umgebaut (nicht geloescht, wiederverwendet)
- Oder: LauncherCell importiert die Inhalte direkt

### Dateien
- Aendern: `src/renderer/components/StatusBar.tsx` ("+"-Button raus)
- Aendern: `src/renderer/app.tsx` (Cmd+N Logik anpassen, LauncherCell-Handler)
- Aendern/Neu: LauncherCell-Popup-Komponente
- Aendern: `src/renderer/components/UnifiedSessionDialog.tsx` → refactoren oder ersetzen
- i18n de.json + en.json

### Quality Gate
- Kein "+" in StatusBar
- Leere Zelle klicken → Popup mit 3 Bereichen
- Preset klicken → Entity startet in dieser Zelle (KEIN Placement-Popup)
- Pfad waehlen → Session startet in dieser Zelle
- Note waehlen → Editor oeffnet sich in dieser Zelle
- Cmd+N funktioniert

---

## SP-F: Tag Management UI

### Ueberblick
Dritter Tab "Tags" im Workspaces/Personas-Fenster. CRUD-Verwaltung fuer das Tag-Repository des Notes-Systems.

### Anforderungen

#### Must Have
- Tab "Tags" im Workspaces/Personas-Fenster (neben "Workspaces" und "Personas")
- Liste aller Tags mit Count (wie viele Notizen) und Description
- Tags umbenennen (propagiert in alle Notizen via Frontmatter-Update)
- Tags loeschen (entfernt aus allen Notizen)
- Tag-Description editieren
- Neue Tags manuell anlegen

#### Nice to Have
- Tags mergen (zwei Tags zu einem zusammenfuehren)
- Sortierung nach Name / Count / zuletzt verwendet

### Technische Notizen
- Tag-Repository: `~/.config/cipher-mux/notes/.tags.json`
- `NoteTagging` Klasse in `src/main/notes/note-tagging.ts`
- Seed-Tags sind hardcoded als `SEED_TAGS` — UI sollte Seed vs Custom unterscheiden
- Umbenennen/Loeschen muss Frontmatter aller betroffenen Notizen aktualisieren (gray-matter round-trip)
- Neue IPC-Channels: `NOTES_TAG_UPDATE`, `NOTES_TAG_DELETE`, `NOTES_TAG_RENAME`, `NOTES_TAG_CREATE`, `NOTES_TAG_LIST`
- WorkspacesWindow URL-Routing erweitern: `#tags` Tab

### Dateien
- Neu: `src/renderer/components/TagManager.tsx` (oder in WorkspacesWindow integriert)
- Aendern: WorkspacesWindow (Tab-Routing)
- Aendern: `src/main/notes/note-tagging.ts` (neue Methoden: rename, delete, update, create)
- Aendern: `src/main/ipc-hub.ts` (neue IPC-Handler)
- Aendern: `src/main/preload.ts` (neue API exposen)
- Aendern: `src/shared/ipc-channels.ts` (neue Channel-Namen)
- Aendern: i18n de.json + en.json

### Quality Gate
- Tag umbenennen → Name aendert sich in Tag-Liste und in allen betroffenen Notizen
- Tag loeschen → verschwindet aus Liste und allen Notizen
- Neuen Tag anlegen → erscheint in Liste
- npm run test + npm run build sauber

---

## SP-J: Sidebar Visual Polish

### Ueberblick
Sidebar-Hintergruende differenzieren fuer bessere visuelle Hierarchie + Notes-Suchfeld Spacing fixen.

### Anforderungen

#### Hintergrund-Abstufung (4 Stufen, dunkel → hell)
1. **Sidebar-Kopfzeile** ("Sidebar") — so dunkel wie die Session-Header im Grid
2. **Bereichs-Ueberschriften** (Nachrichten, Hintergrundsessions, Verwaiste Sessions, Notes, Memory) — etwas dunkler als der Bereichs-Inhalt
3. **Geoeffneter Bereichs-Hintergrund** — leicht dunkler als der Inhalt darin
4. **Inhalte** (einzelne Nachrichten, Session-Eintraege, etc.) — hellste Stufe (aktuell ueberall gleich)

#### Notes-Suchfeld Spacing
- Suchfeld klebt direkt an der Bereichs-Ueberschrift — Abstand einfuegen wie bei Hintergrundsessions

### Dateien
- Aendern: `src/renderer/components/SidebarPanel.tsx` (oder zugehoeriges CSS/Styles)
- Ggf. CSS-Variablen im Theme anpassen

### Quality Gate
- Sidebar zeigt sichtbare Abstufung: Header dunkel, Bereichs-Titel mittel, Inhalt hell
- Notes-Suchfeld hat Abstand zur Ueberschrift
- Dark-Theme bleibt konsistent
- npm run build sauber

---

## SP-K: Voice Mode Integration

### Ueberblick
Bestehende Voice-Pipeline zu 3-State-System zusammenfuehren. Kein Neubau — Verdrahtung + UI.

### Die drei Zustaende (Radio Buttons in StatusBar)

#### OFF
- Kein Voice aktiv.

#### STT
- Genau das aktuelle Verhalten des VoiceControl-Toggles.
- VAD erkennt Sprache, Whisper transkribiert, Text geht als Keystrokes in fokussierte Grid-Zelle.
- Sprachbefehle ("absenden" etc.) senden Enter.
- Aktivitaets-LED und Session-Target-Anzeige bleiben.

#### COM (Voice Companion)
- Startet Voice-Relay Entity als Background-Session (eigene CLAUDE.md mit Sprach-Persona).
- STT-Input geht automatisch an Voice-Relay Session.
- VoiceOutputRouter: pollt tmux-Output, bereinigt, schickt an Piper TTS.
- Session erscheint in Sidebar mit Voice-spezifischem Glow.

### UI-Aenderungen

#### StatusBar: VoiceControl ersetzen
- Cyberpunk-Toggle-Switch raus.
- Drei quadratische Radio-Buttons: **OFF** | **STT** | **COM**
- Aktivitaets-LED bleibt.
- Session-Target-Anzeige bleibt.

#### Sidebar: Voice-Glow auf Background-Session
- Idle → gedimmter lila Glow (#9b59b6)
- Recording → pulsierender Glow
- Processing → schnelles Pulsieren
- Speaking (TTS) → durchgehend leuchtend
- Klick → Session kommt ins Grid

### Bestehender Code (NICHT neu bauen)
- VoiceInputRouter (session-mode + voice-relay-mode)
- VoiceOutputRouter (tmux capture → TTS)
- VoiceManager, ConversationEngine, PiperTTS
- useVoiceSession Hook, VAD
- Voice-Relay Entity Config + CLAUDE.md

### Was NEU gebaut werden muss
1. Radio-Button-UI in StatusBar
2. COM-Modus-Logik (Entity starten, OutputRouter aktivieren)
3. Sidebar Glow-States (CSS + Events)
4. Eject-to-Background-Button fixen (BF-2, wird in SP-BF gefixt)

### Referenz-Implementierungen
- cipher-desktop-electron: `src/main/voice/` — TTS-Factory, Aktivitaetsanzeige
- cipher-android: VoiceMode — Auto-Submit, UX-Referenz

### Quality Gate
- OFF → STT → COM Wechsel funktioniert
- STT identisch zum jetzigen Verhalten
- COM: Voice-Relay Background, STT rein, TTS raus
- Sidebar Glow-States sichtbar
- npm run test + npm run build sauber

---

## SP-L: MCP App-Control Tools

### Ueberblick
Neue MCP-Tools damit der Companion (und andere Sessions) die App steuern koennen. "Spalte mir das Grid auf" per Sprache oder Text.

### Neue MCP-Tools
- `mux_grid_resize` — Grid-Dimensionen aendern (`{cols: 2, rows: 2}`)
- `mux_grid_place` — Session in bestimmte Zelle setzen (`{sessionId, col, row}`)
- `mux_session_focus` — Session fokussieren
- `mux_session_eject` — Session in Hintergrund schieben
- `mux_sidebar_toggle` — Sidebar ein/aus

### Implementierung
Pro Tool:
1. MCP-Tool-Definition in `src/main/mcp/mcp-server.ts`
2. IPC-Channel in `src/shared/ipc-channels.ts`
3. Handler in `src/main/ipc-hub.ts` (ruft bestehende Grid/Session-Logik auf)
4. Ggf. Renderer-Handler fuer Grid-Manipulation

### Integration
- Companion CLAUDE.md um Tool-Beschreibungen ergaenzen
- Voice-Relay CLAUDE.md ebenfalls (proaktive Angebote: "Soll ich das Grid aufteilen?")

### Quality Gate
- Companion: "Mach das Grid 2x2" → Grid aendert sich
- Companion: "Schieb die Session in den Hintergrund" → Session verschwindet aus Grid
- Voice-Relay: "Zeig mir drei Fenster" → Grid 3x1
- npm run test + npm run build sauber

---

## SP-G: Bugreport aus StatusBar raus, in Settings verschieben

### Ueberblick
Der Bugreport-Button verschwindet aus der StatusBar. Die lokale Bugreport-Funktion (Ollama-basiert) wandert komplett ins Settings-Fenster. Dort ist sie konfigurierbar und startbar. Das Modul wird standalone-faehig extrahiert.

### Aenderungen

#### StatusBar
- Bugreport-Button komplett entfernen (nicht umleiten, nicht verstecken — WEG)

#### Settings-Fenster
- Neuer Bereich "Bugreport" im Settings-Fenster
- Von dort aus startbar (Button "Bugreport erstellen")
- Konfigurierbar: Ollama-Verbindung, Modell, Output-Ordner
- Die bisherige BugreportDialog-UI wird hier eingebettet oder aufgerufen

#### Modul-Extraktion
- Bugreport-Logik in eigenes Modul/Verzeichnis verschieben (`src/main/bugreport/`)
- Klare Schnittstelle: Input (User-Beschreibung, Screenshots, Kontext) → Output (strukturierter Report als MD)
- Muss fuer sich alleine stehen koennen — perspektivisch eigene Mini-App

### Quality Gate
- Kein Bugreport-Button in StatusBar
- Bugreport-Funktion ueber Settings erreichbar und funktional wie vorher
- Code liegt in `src/main/bugreport/` mit klarer API
- npm run test + npm run build sauber

---

## SP-H: LLM Provider Settings

### Ueberblick
Einstellungsfenster fuer die Verbindung zu Ollama und optional externen LLM-APIs. Noetig fuer Veroeffentlichung.

### Anforderungen
- Neuer Bereich "LLM Provider" im Settings-Fenster
- Ollama-Konfiguration: Host, Modell-Auswahl (aus `/api/tags`), Verbindungstest
- Optional: API-Key fuer externe Anbieter (Google, OpenAI, Custom)
- Konfiguration in config-store persistieren
- Bugreport-Modul (SP-G) liest Provider-Config statt hardcoded Ollama-URL

### Quality Gate
- Ollama Host/Modell konfigurierbar
- Test Connection zeigt Erfolg/Fehler
- Bugreport nutzt konfigurierte Verbindung
- npm run test + npm run build sauber

---

## SP-I: Companion Bugreport/Feature-Request Skill

### Ueberblick
Ein Skill der in JEDER Session nutzbar ist — kein Button, kein eigener Dialog, kein automatischer Trigger. User sagt einfach "Hey, notier den Bug" und der Companion/jede Session macht es.

### Anforderungen
- In Entity-CLAUDE.md als Skill-Anweisung einbauen (Companion, Voice-Relay, ggf. andere)
- Erkennt "Bug gefunden", "Bug Report", "Feature Request" etc.
- Strukturiertes Mini-Interview (Was? Wo? Reproduzierbar?)
- Wenn User abblockt ("notier das einfach"): nimmt was er hat, kein Nachhaken
- Output: Strukturierter Report nach Template in `moreismore/` Ordner
- Nutzt bestehende Notes-MCP-Tools zum Speichern

### Kein Button, kein Dialog
- KEIN StatusBar-Button der irgendwas oeffnet
- KEIN spezieller Trigger ausser der User sagt es in einer Session
- Einfach ein Skill in der CLAUDE.md — fertig

### Quality Gate
- In Companion-Session: "Hey, Bug gefunden" → Report landet in moreismore/
- "Notier das einfach" → sofort erstellt ohne Nachfragen
- Feature-Request analog
- npm run test + npm run build sauber

---

## Abhaengigkeiten & Reihenfolge

```
SP-BF (Bugfixes)    ──────→  BLOCKER fuer alles andere
SP-LC (LauncherCell) ─────→  braucht BF-9 (LauncherCell-Placement)
SP-F (Tags)         ──────→  [Unabhaengig nach BF]
SP-J (Sidebar Polish) ────→  [Unabhaengig nach BF]
SP-K (Voice Mode)   ──────→  braucht BF-2 (Eject-Button)
SP-L (MCP Control)  ──────→  [Unabhaengig nach BF]
SP-G (Bugreport)    ──────→  SP-H braucht SP-G
SP-H (LLM Settings) ──────→  braucht SP-G
SP-I (Companion Skill) ───→  [Unabhaengig, nur CLAUDE.md-Aenderung]
```

### Dispatch-Empfehlung

**Welle 1: Bugfixes (2 Worker parallel)**
- Worker 1: BF-1 (Recovery leer) + BF-2 (Eject) + BF-7 (DevTools) + BF-8 (Test-Fail) + BF-9 (LauncherCell-Placement)
- Worker 2: BF-3 (Notes) + BF-4 (Message-Bus) + BF-5 (Grid-Reflow) + BF-6 (Persona hardcoded)

**Welle 2: Features (3 Worker parallel, nach Bugfixes)**
- Worker 3: SP-LC (LauncherCell-Popup) + SP-J (Sidebar Polish)
- Worker 4: SP-K (Voice Mode)
- Worker 5: SP-F (Tags) + SP-L (MCP Control)

**Welle 3: Bugreport-Architektur (2 Worker, nach Welle 2)**
- Worker 6: SP-G (Bugreport raus aus StatusBar) + SP-H (LLM Settings)
- Worker 7: SP-I (Companion Skill — nur CLAUDE.md, klein)

---

## Hinweise fuer Worker

- **NICHT committen** — MPO committed am Ende
- **npm run test + npm run build** als Quality Gate nach jeder Aenderung
- **i18n-Keys** fuer alle neuen UI-Texte (de.json + en.json)
- **Keine Emojis** in UI-Texten
- **Bestehende Tests nicht loeschen** — anpassen wenn Logik sich geaendert hat
- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`

---

*Erstellt: 2026-04-26, MPO Wave 3 Dispatch — ueberarbeitet nach Abnahme-Findings*
