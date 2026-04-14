# Testcase — cipher-mux-electron v0.2.1

## Voraussetzungen

```bash
cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
npm run build    # Muss fehlerfrei kompilieren
npm test         # Muss 86 Tests bestehen
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

## Feedback erwünscht

1. **Look & Feel** — Stimmt die cipher ivory Ästhetik? Farben, Fonts, Cut-Corners?
	1. ja, sehr ugt - das dunkle theme ist gut - es soll aber auch das helle geben - das wird das primäre - bin nicht so der dark-modler - aber alle anderen wollen es.... - aber gut gelungen - die icons könnten etwas größer sein oder etwas klarer, aber der style passt - typografisch / grafisch - nicht bunte emoticons ooder sowas...
2. **Layout** — Funktioniert die Aufteilung (Rail + Content + Sidebar)?
	1. an sich ja - nur sessions gehen gerade nicht auf - es gehen auch nicht mehrere parallel - tmux müsste schon mitsstartetn oder wenn man die app öffenet - 
3. **Project Cards** — Werden die richtigen Projekte gefunden? Stimmen die Metadaten?
4. ja - aber was heißt dirty?
5. **Allgemeines** — Was fehlt, was stört, was ist gut?
	1. naja - sessions gehen ja nicht - insofern noch schwer zu sagen - spanned wird es mit mehreren sessions parralel in der ansicht - im grid oder nebeneienander - und natürlich dann der projektlauncher und der chatroom - das sind ja die 'Features' --- bis hierhin aber shcon sehr cool :)
