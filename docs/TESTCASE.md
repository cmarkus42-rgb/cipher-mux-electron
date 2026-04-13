# Testcase — cipher-mux-electron v0.1.0

## Voraussetzungen

```bash
cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
npm run build    # Muss fehlerfrei kompilieren
npm test         # Muss 64 Tests bestehen
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

## Feedback erwünscht

1. **Look & Feel** — Stimmt die cipher ivory Ästhetik? Farben, Fonts, Cut-Corners?
2. **Layout** — Funktioniert die Aufteilung (Rail + Content + Sidebar)?
3. **Project Cards** — Werden die richtigen Projekte gefunden? Stimmen die Metadaten?
4. **Allgemeines** — Was fehlt, was stört, was ist gut?
