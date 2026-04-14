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
- [ ] Session wird erstellt (Activity Rail zeigt neue Session)
- [ ] Verzeichnis existiert: `~/.config/cipher-mux/orchestrator/`
- [ ] Datei existiert: `~/.config/cipher-mux/orchestrator/CLAUDE.md`
- [ ] CLAUDE.md enthält MCP-URL `http://127.0.0.1:3100/mcp`
- [ ] CLAUDE.md enthält Bearer-Token (32-Zeichen Hex)
- [ ] CLAUDE.md enthält alle 7 Tools (mux_sessions, mux_create_session, mux_kill_session, mux_send, mux_read, mux_status, mux_context_usage)
- [ ] CLAUDE.md enthält "Maximal 2 Retry-Versuche"

**Prüfen per Terminal:**
```bash
cat ~/.config/cipher-mux/orchestrator/CLAUDE.md
```

**Ergebnis:** _hier eintragen_

### 6b: Orchestrator-Status abfragen

**Aktion:**
```js
await window.cipherMux.orchestrator.status()
```

**Erwartetes Ergebnis:**
- [ ] `{ running: true, sessionId: "01..." }` — sessionId ist ein ULID

**Ergebnis:** _hier eintragen_

### 6c: Doppelstart verhindern

**Aktion:**
```js
await window.cipherMux.orchestrator.start()
```

**Erwartetes Ergebnis:**
- [ ] Fehler: "Orchestrator is already running"

**Ergebnis:** _hier eintragen_

### 6d: Orchestrator stoppen

**Aktion:**
```js
await window.cipherMux.orchestrator.stop()
```

**Erwartetes Ergebnis:**
- [ ] `{ ok: true }`
- [ ] Activity Rail: Session verschwindet
- [ ] Status danach: `await window.cipherMux.orchestrator.status()` → `{ running: false, sessionId: null }`

**Ergebnis:** _hier eintragen_

### 6e: Neustart nach Stopp

**Aktion:**
```js
await window.cipherMux.orchestrator.start()
```

**Erwartetes Ergebnis:**
- [ ] Neue Session wird erstellt (neuer ULID)
- [ ] CLAUDE.md wird frisch generiert (ggf. neuer API-Key falls geändert)

**Ergebnis:** _hier eintragen_

---

## Test 7: Orchestrator-UI (Task 5.2)

**Voraussetzung:** App läuft (`npm run dev`)

### 7a: Blitz-Icon in Activity Rail

**Erwartetes Ergebnis:**
- [ ] Activity Rail zeigt ein ϟ (Koppa/Blitz) Icon zwischen den Session-Slots und dem Spacer
- [ ] Icon ist im inaktiven Zustand in gedämpfter Farbe (wie andere Icons)
- [ ] Hover zeigt hellere Border

**Ergebnis:** _hier eintragen_

### 7b: Orchestrator starten via Blitz-Icon

**Aktion:** Klicke auf das ϟ Icon

**Erwartetes Ergebnis:**
- [ ] Icon wechselt auf Cyan-Akzent (nicht grün wie normale Sessions)
- [ ] Pulsierender Dot erscheint unten-rechts am Icon
- [ ] Status Bar zeigt "Orch: running" mit cyan Dot
- [ ] Neue Session erscheint in der Activity Rail (nummeriert)

**Ergebnis:** _hier eintragen_

### 7c: Orchestrator stoppen via Blitz-Icon

**Aktion:** Klicke erneut auf das ϟ Icon

**Erwartetes Ergebnis:**
- [ ] Icon kehrt zum inaktiven Zustand zurück
- [ ] Pulsierender Dot verschwindet
- [ ] Status Bar zeigt "Orch: off" mit dimmed Dot
- [ ] Orchestrator-Session wird aus der Activity Rail entfernt

**Ergebnis:** _hier eintragen_

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

**Ergebnis:** _hier eintragen_

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

**Ergebnis:** _hier eintragen_

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

## Feedback erwünscht

1. **Look & Feel** — Stimmt die cipher ivory Ästhetik? Farben, Fonts, Cut-Corners?
	1. ja, sehr ugt - das dunkle theme ist gut - es soll aber auch das helle geben - das wird das primäre - bin nicht so der dark-modler - aber alle anderen wollen es.... - aber gut gelungen - die icons könnten etwas größer sein oder etwas klarer, aber der style passt - typografisch / grafisch - nicht bunte emoticons ooder sowas...
2. **Layout** — Funktioniert die Aufteilung (Rail + Content + Sidebar)?
	1. an sich ja - nur sessions gehen gerade nicht auf - es gehen auch nicht mehrere parallel - tmux müsste schon mitsstartetn oder wenn man die app öffenet - 
3. **Project Cards** — Werden die richtigen Projekte gefunden? Stimmen die Metadaten?
4. ja - aber was heißt dirty?
5. **Allgemeines** — Was fehlt, was stört, was ist gut?
	1. naja - sessions gehen ja nicht - insofern noch schwer zu sagen - spanned wird es mit mehreren sessions parralel in der ansicht - im grid oder nebeneienander - und natürlich dann der projektlauncher und der chatroom - das sind ja die 'Features' --- bis hierhin aber shcon sehr cool :)
