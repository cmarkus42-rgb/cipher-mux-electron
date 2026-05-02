# Testcase — cipher-mux-electron v0.2.1

## Voraussetzungen

```bash
cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
npm run build    # Muss fehlerfrei kompilieren
npm test         # Muss 91 Tests bestehen
```

## Test 1: App startet

```bash
npm run start
```

**Erwartetes Ergebnis:**
- Electron-Fenster öffnet sich
- Dunkles Theme (cipher ivory) mit Rajdhani-Heading "CIPHER-MUX" im Titlebar
- Activity Rail links (48px) mit Cockpit-Icon (◉), Chat-Icon, Info-Icon
- Status Bar unten zeigt "0 sessions" mit grauem Dot
- Version v0.1.0 rechts im Titlebar

passt

## Test 2: Cockpit zeigt Projekte

**Aktion:** Klicke auf "Scan Projects" Button

**Erwartetes Ergebnis:**
- Project Cards erscheinen im Grid
- Jede Card zeigt: Projektname, SDD-Phase (falls vorhanden), Git-Branch
- cipher-mux-electron sollte als Projekt erkannt werden (hat CLAUDE.md)
- Cards haben cut-corner Design (abgeschnittene Ecken)

## Test 3: Session starten

**Aktion:** Klicke "Start Session" auf einer Project Card

**Erwartetes Ergebnis:**
- View wechselt auf Terminal
- Activity Rail zeigt Session als nummeriertes Icon (1)
- Pane Header zeigt Projekt-Name
- Terminal-Bereich erscheint (xterm.js)
- Status Bar zeigt "1 session" mit grünem Dot

## Test 4: Activity Rail Navigation

**Aktion:** Klicke auf verschiedene Rail-Icons

**Erwartetes Ergebnis:**
- ◉ (Cockpit) → zeigt Project Grid
- 1 (Session) → zeigt Terminal für diese Session
- ▦ (Chat) → öffnet/schließt Chatroom-Panel rechts
- i (Info) → zeigt Info-Seite

## Test 5: Chatroom Panel

**Aktion:** Klicke auf Chat-Icon in der Activity Rail

**Erwartetes Ergebnis:**
- Panel schiebt sich von rechts auf (280px Breite)
- Header zeigt "CHATROOM"
- Input-Feld unten (noch deaktiviert)
- Erneuter Klick schließt das Panel

## Bekannte Einschränkungen (v0.1.0)

- Terminal-Eingabe funktioniert nur wenn tmux läuft und Session korrekt erstellt wurde
- Chatroom-Messages können noch nicht gesendet werden (UI disabled)
- MCP-Server ist noch nicht implementiert (Status Bar: "MCP: offline")
- Keyboard-Shortcuts (Cmd+0-9, Cmd+K) sind noch nicht verdrahtet
- Context-Usage wird noch nicht angezeigt

---

## Test 6: Orchestrator starten (NEU — Task 5.1)

**Voraussetzung:** App läuft, mindestens ein Projekt gescannt, MCP-Server aktiv (Status Bar zeigt "MCP: port 3100")

### 6a: Orchestrator-Verzeichnis + CLAUDE.md

**Aktion:** Im DevTools Console eingeben:
```js
await window.cipherMux.orchestrator.start()
```

**Erwartetes Ergebnis:**
- [x] Session wird erstellt (Activity Rail zeigt neue Session)
- [x] Verzeichnis existiert: `~/.config/cipher-mux/orchestrator/`
- [x] Datei existiert: `~/.config/cipher-mux/orchestrator/CLAUDE.md`
- [x] CLAUDE.md enthält MCP-URL `http://127.0.0.1:3100/mcp`
- [x] CLAUDE.md enthält Bearer-Token (32-Zeichen Hex)
- [x] CLAUDE.md enthält alle 7 Tools (mux_sessions, mux_create_session, mux_kill_session, mux_send, mux_read, mux_status, mux_context_usage)
- [x] CLAUDE.md enthält "Maximal 2 Retry-Versuche"

**Prüfen per Terminal:**
```bash
cat ~/.config/cipher-mux/orchestrator/CLAUDE.md
```

**Ergebnis:** passt_

### 6b: Orchestrator-Status abfragen

**Aktion:**
```js
await window.cipherMux.orchestrator.status()
```

**Erwartetes Ergebnis:**
- [ ] `{ running: true, sessionId: "01..." }` — sessionId ist ein ULID

**Ergebnis:** _das steht jetzt nur function - im UI steht Orchestrator auch als Off

### 6c: Doppelstart verhindern

**Aktion:**
```js
await window.cipherMux.orchestrator.start()
```

**Erwartetes Ergebnis:**
- [x] Fehler: "Orchestrator is already running"

**Ergebnis:** _hier eintragen - das sagt er mir wenn ich den blitz klicke - nicht beim bash vorhin - im ui steht weietrhin orch:off_

### 6d: Orchestrator stoppen

**Aktion:**
```js
await window.cipherMux.orchestrator.stop()
```

**Erwartetes Ergebnis:**
- [ ] `{ ok: true }`
- [ ] Activity Rail: Session verschwindet
- [ ] Status danach: `await window.cipherMux.orchestrator.status()` → `{ running: false, sessionId: null }`

**Ergebnis:** _hier eintragen --- da steht nur funktion_

### 6e: Neustart nach Stopp

**Aktion:**
```js
await window.cipherMux.orchestrator.start()
```

**Erwartetes Ergebnis:**
- [ ] Neue Session wird erstellt (neuer ULID)
- [ ] CLAUDE.md wird frisch generiert (ggf. neuer API-Key falls geändert)

**Ergebnis:** _hier eintragen.  same_

---

## Test 7: Orchestrator-UI (Task 5.2)

**Voraussetzung:** App läuft (`npm run dev`)

### 7a: Blitz-Icon in Activity Rail

**Erwartetes Ergebnis:**
- [x] Activity Rail zeigt ein ϟ (Koppa/Blitz) Icon zwischen den Session-Slots und dem Spacer
- [x] Icon ist im inaktiven Zustand in gedämpfter Farbe (wie andere Icons)
- [x] Hover zeigt hellere Border

**Ergebnis:** _hier eintragen_ok

### 7b: Orchestrator starten via Blitz-Icon

**Aktion:** Klicke auf das ϟ Icon

**Erwartetes Ergebnis:**
- [x] Icon wechselt auf Cyan-Akzent (nicht grün wie normale Sessions)
- [x] Pulsierender Dot erscheint unten-rechts am Icon
- [x] Status Bar zeigt "Orch: running" mit cyan Dot
- [x] Neue Session erscheint in der Activity Rail (nummeriert)

**Ergebnis:** _hier eintragen_ok --- anmerkung: der orchestrator sollte immer mit dem start des mux mit gestartet werden - nicht always on, aber autostart


### 7c: Orchestrator stoppen via Blitz-Icon

**Aktion:** Klicke erneut auf das ϟ Icon

**Erwartetes Ergebnis:**
- [x] Icon kehrt zum inaktiven Zustand zurück
- [x] Pulsierender Dot verschwindet
- [x] Status Bar zeigt "Orch: off" mit dimmed Dot
- [x] Orchestrator-Session wird aus der Activity Rail entfernt

**Ergebnis:** _hier eintragen_ok ...

### 7d: Orchestrator-Messages im Chatroom

**Aktion:** Orchestrator starten, dann via DevTools Console eine Message senden:
```js
await window.cipherMux.messages.send({
  topic: 'status',
  sender: 'Orchestrator',
  payload: { text: 'Task delegated to worker-1' }
})
```
Dann Chatroom öffnen (▦ Icon).

**Erwartetes Ergebnis:**
- [ ] Message erscheint im Chatroom
- [ ] Sender "Orchestrator" ist in Cyan dargestellt (nicht Standard-Farbe)
- [ ] Normale Messages (anderer Sender) sind weiterhin in Standard-Farbe

**Ergebnis:** _hier eintragen_sinnloser test - das soll doch der orchestrator machen...ich kann aber schonmal nichts in den chatroom schicken


---

## Test 8: KickoffManager (Task 5.3)

### 8a: Projekt-Kickoff via DevTools

**Aktion:**
```js
await window.cipherMux.projects.kickoff({
  requirementsFile: '/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/docs/requirements.md',
  targetDir: '/tmp',
  projectName: 'test-kickoff-project',
  autoInterview: false
})
```

**Erwartetes Ergebnis:**
- [ ] Rückgabe: `{ projectPath: "/tmp/test-kickoff-project", claudeMdPath: "...", requirementsCopied: true }`
- [ ] Verzeichnis existiert: `/tmp/test-kickoff-project/`
- [ ] Unterverzeichnis existiert: `/tmp/test-kickoff-project/docs/`
- [ ] Datei existiert: `/tmp/test-kickoff-project/CLAUDE.md`
- [ ] Datei existiert: `/tmp/test-kickoff-project/docs/requirements.md`

**Prüfen per Terminal:**
```bash
ls -la /tmp/test-kickoff-project/
cat /tmp/test-kickoff-project/CLAUDE.md
```

**Ergebnis:** _hier eintragen_

### 8b: Doppel-Kickoff verhindern

**Aktion:** Gleichen Kickoff nochmal ausführen (selber Projektname + targetDir)

**Erwartetes Ergebnis:**
- [ ] Fehler: Verzeichnis existiert bereits

**Ergebnis:** _hier eintragen_

### 8c: Aufräumen

```bash
rm -rf /tmp/test-kickoff-project
```

---

## Test 9: MCP Auto-Injection (Task 5.5)

### 9a: Env-Vars in neuer Session prüfen

**Aktion:** Session starten (via Cockpit oder DevTools), dann im Terminal eingeben:
```bash
echo $CIPHER_MUX_MCP_URL
echo $CIPHER_MUX_MCP_KEY
```

**Erwartetes Ergebnis:**
- [ ] `CIPHER_MUX_MCP_URL` zeigt `http://127.0.0.1:3100` (oder konfigurierten Port)
- [ ] `CIPHER_MUX_MCP_KEY` zeigt einen 32-Zeichen Hex-String (API Key)

**Ergebnis:** _hier eintragen_selber machen

---

## Test 10: Kickoff-Dialog UI (Task 5.4)

### 10a: Dialog öffnen via Cmd+N

**Aktion:** Cmd+N drücken

**Erwartetes Ergebnis:**
- [ ] Modal-Overlay erscheint (abgedunkelt)
- [ ] Dialog zeigt: Projektname-Input, Requirements-Datei-Input mit "..."-Button, Zielverzeichnis-Input mit "..."-Button
- [ ] Auto-Interview Toggle ist standardmäßig aktiv
- [ ] "Projekt erstellen" und "Abbrechen" Buttons unten

**Ergebnis:** _hier eintragen_

### 10b: File-Picker für Requirements

**Aktion:** Klicke den "..." Button neben "Requirements-Datei"

**Erwartetes Ergebnis:**
- [ ] Nativer macOS File-Picker öffnet sich
- [ ] Filter zeigt .md, .txt, .yaml, .yml Dateien
- [ ] Nach Auswahl: Pfad erscheint im Input-Feld

**Ergebnis:** _hier eintragen_

### 10c: Directory-Picker für Zielverzeichnis

**Aktion:** Klicke den "..." Button neben "Zielverzeichnis"

**Erwartetes Ergebnis:**
- [ ] Nativer macOS Verzeichnis-Picker öffnet sich
- [ ] Nach Auswahl: Pfad erscheint im Input-Feld

**Ergebnis:** _hier eintragen_

### 10d: Validation

**Aktion:** "Projekt erstellen" klicken ohne Felder auszufüllen

**Erwartetes Ergebnis:**
- [ ] Fehlermeldung in rot erscheint (z.B. "Requirements-Datei fehlt")

**Ergebnis:** _hier eintragen_

### 10e: Kickoff durchführen

**Aktion:** Felder ausfüllen:
- Projektname: `test-kickoff-ui`
- Requirements: beliebige .md Datei wählen
- Zielverzeichnis: `/tmp`

Dann "Projekt erstellen" klicken.

**Erwartetes Ergebnis:**
- [ ] Dialog schließt sich
- [ ] Verzeichnis `/tmp/test-kickoff-ui/` wurde erstellt
- [ ] CLAUDE.md und docs/requirements.md existieren darin

**Prüfen:**
```bash
ls -la /tmp/test-kickoff-ui/
cat /tmp/test-kickoff-ui/CLAUDE.md
```

**Ergebnis:** _hier eintragen_

### 10f: Dialog schließen

**Aktion:** Escape drücken oder "Abbrechen" klicken

**Erwartetes Ergebnis:**
- [ ] Dialog schließt sich, kein Kickoff passiert

**Aufräumen:**
```bash
rm -rf /tmp/test-kickoff-ui
```

**Ergebnis:** _hier eintragen_

---

## Test 11 — Kickoff mit Obsidian-Verzeichnis

**Setup:**
1. Erstelle in Nextcloud ein leeres Testverzeichnis, z.B. `/Users/Shared/Nextcloud/ClaudeCode01/kickoff-test-obsidian/`.
2. Lege darin eine Datei `requirements.md` mit 3-5 Bullet-Points zum Projektkonzept an (beliebiges Thema).

**Schritte:**
1. Starte cipher-mux-electron.
2. Drücke `Cmd+N` → Dialog "Neues Projekt aus Konzept" öffnet sich.
3. Pastet den Pfad `.../kickoff-test-obsidian/` ins Feld "Projekt-Verzeichnis".
4. Lass "Anforderungsdatei" leer (schon im Verzeichnis).
5. Tippe im Freitext-Feld: "Stack-Präferenz: Python" (oder Equivalent).
6. Klick "Projekt aufsetzen".

**Erwartung:**
- Dialog schließt sich.
- Eine neue Session namens "Launcher: kickoff-test-obsidian" erscheint und läuft.
- Nach einigen Sekunden startet Claude in dieser Session, bekommt den Launcher-Prompt und fängt an zu arbeiten (sichtbare Subagent-Dispatches idealerweise).
- Wenn der Launcher fertig ist: Eine neue Session `kickoff-test-obsidian` wird automatisch gestartet, Focus wechselt dorthin, Claude läuft und startet `/interview`.
- Das Projekt-Verzeichnis hat jetzt: `CLAUDE.md`, `.claude/`, `docs/SPEC.md`, `docs/todo.md`, `.gitignore`, ggf. `.git/`.

## Test 12 — Kickoff mit externer `.docx`-Anforderungsdatei

**Setup:**
1. Leeres Testverzeichnis wie in Test 11 — **ohne** Anforderungsdatei drin.
2. Eine externe `.docx`-Datei mit Anforderungen an einem beliebigen anderen Ort (z.B. Desktop).

**Schritte:**
1. `Cmd+N`, pastet den Verzeichnis-Pfad.
2. Im Feld "Anforderungsdatei": pastet den `.docx`-Pfad.
3. Klick "Projekt aufsetzen".

**Erwartung:**
- Vor dem Launcher-Start: im Projekt-Verzeichnis liegt jetzt `docs/requirements.docx` (Extension erhalten).
- Launcher-Session läuft, Claude liest die `.docx`-Datei (über geeigneten Reader oder verweist auf Missing-Tool).
- Folge-Session öffnet sich nach Completion.

## Test 13 — Kickoff-Fehlerfälle

**Testschritte:**
1. `Cmd+N`, pastet einen **nicht existierenden** Pfad ins Verzeichnis-Feld → Klick "Projekt aufsetzen".
   **Erwartung:** Dialog zeigt Fehler "Project directory does not exist", Dialog bleibt offen.
2. `Cmd+N`, pastet einen Pfad zu einer **Datei** (nicht Verzeichnis) → Klick.
   **Erwartung:** Fehler "Project path is not a directory".
3. Starte einen gültigen Kickoff, dann **warte 15 Minuten ohne Interaktion** (oder setze in `ConfigStore` `kickoffTimeoutMinutes: 1` und warte 1 Minute).
   **Erwartung:** Toast oder Console-Warning über Timeout. Launcher-Session bleibt sichtbar, Folge-Session startet nicht automatisch.

---

## Phase 6: Polish & Split-Layout

### Test 11: Keyboard Shortcuts
1. App starten
2. Cmd+0 → sollte auf Cockpit wechseln
3. Session starten, Cmd+1 → sollte Session 1 fokussieren
4. Cmd+K → Chatroom sollte ein-/ausgeblendet werden
5. Cmd+N → Kickoff-Dialog sollte sich öffnen
6. Cmd+B → Bugreport-Dialog sollte sich öffnen

### Test 12: Split-View
1. Session starten (Cmd+N oder aus Cockpit)
2. Cmd+\ → sollte nach Verzeichnis fragen, dann vertikal splitten
3. Beide Terminals rendern und resizen unabhängig
4. Divider ziehen — Ratio sollte sich anpassen
5. Cmd+- → sollte die aktive Pane horizontal splitten
6. Cmd+W → sollte aktive Pane schließen, Sibling kollabiert nach oben
7. Alle Panes schließen → sollte zu Empty-State oder Cockpit zurückkehren

### Test 13: Layout-Persistenz
1. Split-Layout erstellen (2-3 Panes)
2. App beenden (Cmd+Q)
3. App neustarten → Layout sollte mit gleichen Split-Ratios wiederhergestellt werden
4. Sessions sollten via Recovery reconnecten

### Test 14: Session Recovery
1. 2-3 Sessions erstellen
2. Electron force-killen (kill -9)
3. App neustarten
4. Recovery-Dialog sollte verwaiste Sessions zeigen
5. "Übernehmen" → Session erscheint in der Activity Rail
6. "Beenden" → tmux-Session wird gekillt
7. "Alle beenden" → alle Orphans werden entfernt

### Test 15: Info & Einstellungen
1. "i" in der Activity Rail klicken
2. Drei Tabs sichtbar: Shortcuts, Features, Einstellungen
3. Shortcuts-Tab zeigt alle registrierten Shortcuts aus der Registry
4. Features-Tab zeigt Feature-Beschreibungen
5. Einstellungen-Tab zeigt Scan-Pfade + Über

### Test 16: Bugreport
1. Cmd+B → Bugreport-Dialog öffnet sich
2. Beschreibung eingeben, "Absenden" klicken
3. Bestätigung zeigt Report-ID
4. Prüfen: `~/.config/cipher-mux/bugreports/outbox/` → Datei existiert mit korrektem Frontmatter

---

## Feedback erwünscht

1. **Look & Feel** — Stimmt die cipher ivory Ästhetik? Farben, Fonts, Cut-Corners?
	1. ja, sehr ugt - das dunkle theme ist gut - es soll aber auch das helle geben - das wird das primäre - bin nicht so der dark-modler - aber alle anderen wollen es.... - aber gut gelungen - die icons könnten etwas größer sein oder etwas klarer, aber der style passt - typografisch / grafisch - nicht bunte emoticons ooder sowas...
2. **Layout** — Funktioniert die Aufteilung (Rail + Content + Sidebar)?
	1. an sich ja - nur sessions gehen gerade nicht auf - es gehen auch nicht mehrere parallel - tmux müsste schon mitsstartetn oder wenn man die app öffenet - 
3. **Project Cards** — Werden die richtigen Projekte gefunden? Stimmen die Metadaten?
4. ja - aber was heißt dirty?
5. **Allgemeines** — Was fehlt, was stört, was ist gut?
	1. naja - sessions gehen ja nicht - insofern noch schwer zu sagen - spanned wird es mit mehreren sessions parralel in der ansicht - im grid oder nebeneienander - und natürlich dann der projektlauncher und der chatroom - das sind ja die 'Features' --- bis hierhin aber shcon sehr cool :)
