# Testcase — Phase 6b Grid-Layout Redesign

## Voraussetzungen

```bash
cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
npm run build    # Muss fehlerfrei kompilieren
npm test         # Muss 133 Tests bestehen
```

---

## Test 1: App startet mit Ivory Theme

```bash
npm run dev
```

**Erwartetes Ergebnis:**
- [ ] Electron-Fenster öffnet sich
- [ ] Ivory Theme (heller Hintergrund #F2F2E8, nicht dunkel)
- [ ] Kein ActivityRail links — stattdessen Grid mit leeren Zellen
- [ ] StatusBar unten: Version links, "bugreport · theme: ivory · info" rechts
- [ ] Alles lowercase (Labels, Buttons, StatusBar)
- [ ] Rajdhani Headings, Fira Code Mono Schrift

**Ergebnis:** _hier eintragen_

---

## Test 2: Grid-Layout (leerer Zustand)

**Erwartetes Ergebnis:**
- [ ] 5x2 Grid mit 10 leeren Zellen sichtbar
- [ ] Jede leere Zelle zeigt: dashed Border, "+" Icon, "projekt auswählen" Label
- [ ] Grid-Controls unten rechts: "spalten −/+" und "zeilen −/+"
- [ ] Cut-Corner-Design auf allen Zellen (abgeschnittene Ecken, kein border-radius)

**Ergebnis:** _hier eintragen_

---

## Test 3: Grid-Größe ändern

**Aktion:** Grid-Controls benutzen

**Schritte:**
1. "spalten −" klicken bis 1 → Grid zeigt 1 Spalte
2. "zeilen −" klicken bis 1 → Grid zeigt 1x1 (Fokus-Modus)
3. "spalten +" bis 5, "zeilen +" bis 3 → Grid zeigt 5x3 (Maximum)
4. Buttons bei Min/Max ausgegraut?

**Erwartetes Ergebnis:**
- [ ] Grid passt sich sofort an
- [ ] Minimum 1x1, Maximum 5x3
- [ ] Buttons disabled am Limit
- [ ] Grid-Größe bleibt nach App-Neustart erhalten (persistent)

**Ergebnis:** _hier eintragen_

---

## Test 4: Session starten via Launcher-Zelle

**Aktion:** Klick auf eine leere Grid-Zelle ("+"-Symbol)

**Erwartetes Ergebnis:**
- [ ] ProjectPopup öffnet sich (Modal-Overlay, abgedunkelt)
- [ ] Titel zeigt "projekt auswählen"
- [ ] Projektliste mit Filtern/Suchfeld
- [ ] "↻" Button zum Rescannen
- [ ] Klick auf ein Projekt startet eine Session
- [ ] Session erscheint in der angeklickten Zelle (nicht irgendwo)

**Ergebnis:** _hier eintragen_

---

## Test 5: Session-Zelle

**Voraussetzung:** Mindestens eine laufende Session

**Erwartetes Ergebnis:**
- [ ] Cell Header zeigt: Status-Dot · Projektname (lowercase) · "·" · Context-Usage %
- [ ] Rechts im Header: "⇄" (projekt wechseln) · "✕" (session schließen)
- [ ] Terminal-Bereich darunter (xterm.js)
- [ ] Terminal hat Ivory-Hintergrund (#F5F5EC) — hell, nicht dunkel
- [ ] Inset-Shadow auf dem Terminal-Bereich
- [ ] Klick in die Zelle setzt Fokus (Border-Highlight)

**Ergebnis:** _hier eintragen_

---

## Test 6: Projekt wechseln (⇄)

**Aktion:** "⇄" Button in einem Session-Header klicken

**Erwartetes Ergebnis:**
- [ ] ProjectPopup öffnet sich
- [ ] Titel zeigt "projekt wechseln" (nicht "auswählen")
- [ ] Klick auf Projekt: alte Session wird gestoppt, neue Session startet im selben Slot
- [ ] Terminal zeigt neues Projekt

**Ergebnis:** _hier eintragen_

---

## Test 7: Session schließen (✕)

**Aktion:** "✕" Button in einem Session-Header klicken

**Erwartetes Ergebnis:**
- [ ] Session wird gestoppt
- [ ] Zelle wird wieder zur Launcher-Zelle (dashed Border, "+" Icon)
- [ ] Fokus wechselt auf nächste vorhandene Session

**Ergebnis:** _hier eintragen_

---

## Test 8: Drag & Drop

**Voraussetzung:** 2+ Sessions im Grid

**Aktion:** Session-Header greifen, auf andere Zelle ziehen

**Erwartetes Ergebnis:**
- [ ] Drag-Handle am Header (cursor: grab)
- [ ] Drop auf leere Zelle: Session wandert dorthin
- [ ] Drop auf andere Session: Swap (Positionen tauschen)
- [ ] Drop-Target zeigt visuelles Feedback (dashed Border)

**Ergebnis:** _hier eintragen_

---

## Test 9: Theme-Wechsel

**Aktion:** "theme: ivory" in der StatusBar klicken

**Erwartetes Ergebnis:**
- [ ] Sofortiger Wechsel auf Dark Theme
- [ ] StatusBar zeigt "theme: dark"
- [ ] Terminals wechseln auf dunklen Hintergrund (#222228)
- [ ] Alle Farben passen zum Dark Theme (muted neon accents)
- [ ] Nochmal klicken: zurück auf Ivory
- [ ] Theme-Wahl bleibt nach App-Neustart erhalten

**Ergebnis:** _hier eintragen_

---

## Test 10: Chatroom Toggle

**Aktion:** Floating-Button am rechten Rand klicken (✉)

**Erwartetes Ergebnis:**
- [ ] Chatroom-Panel schiebt sich von rechts auf (~220px)
- [ ] Button verschwindet wenn Panel offen
- [ ] Message-Bubbles mit #F5F5EC Hintergrund (Ivory) / Dark-Äquivalent
- [ ] Panel schließen: Button erscheint wieder

**Ergebnis:** _hier eintragen_

---

## Test 11: StatusBar

**Erwartetes Ergebnis:**
- [ ] Links: Version (z.B. "v0.3.0-dev" oder "v0.3.0+42")
- [ ] Rechts: "bugreport" · "theme: ivory" · "info" — alles lowercase, klickbar
- [ ] 24px Höhe, fest am unteren Rand

**Ergebnis:** _hier eintragen_

---

## Test 12: Bugreport mit Ollama-Enrichment

**Aktion:** "bugreport" in StatusBar klicken (oder Cmd+B)

**Schritte:**
1. Dialog öffnet sich
2. Freitext-Beschreibung eingeben (z.B. "terminal friert ein bei großem output")
3. "vorschau" klicken

**Erwartetes Ergebnis (Ollama läuft):**
- [ ] Ladeindikator während Ollama arbeitet
- [ ] Strukturierte Vorschau: Title, Severity, Tags, Steps, Summary
- [ ] Vorschau editierbar
- [ ] "absenden" schreibt Markdown mit YAML-Frontmatter in Outbox

**Erwartetes Ergebnis (Ollama nicht erreichbar):**
- [ ] Hinweis "ollama nicht erreichbar"
- [ ] Rohtext wird ohne Enrichment gespeichert

**Ergebnis:** _hier eintragen_

---

## Test 13: Info-Dialog

**Aktion:** "info" in StatusBar klicken

**Erwartetes Ergebnis:**
- [ ] Modal-Overlay öffnet sich mit InfoSettingsView
- [ ] Klick auf Overlay schließt Dialog
- [ ] Tabs: Shortcuts, Features, Einstellungen

**Ergebnis:** _hier eintragen_

---

## Test 14: Config-Persistenz

**Schritte:**
1. Grid auf 3x2 ändern
2. Theme auf Dark wechseln
3. 1-2 Sessions starten
4. App beenden (Cmd+Q)
5. App neustarten

**Erwartetes Ergebnis:**
- [ ] Grid ist 3x2 (nicht zurück auf 5x2)
- [ ] Theme ist Dark (nicht zurück auf Ivory)
- [ ] Config-Datei `~/Library/Application Support/cipher-mux/cipher-mux-config.json` ist NICHT leer

**Prüfen:**
```bash
cat ~/Library/Application\ Support/cipher-mux/cipher-mux-config.json | python3 -m json.tool
```

**Ergebnis:** _hier eintragen_

---

## Test 15: Orchestrator im Grid

**Voraussetzung:** Orchestrator-Session existiert

**Erwartetes Ergebnis:**
- [ ] Orchestrator-Zelle hat Cyan-Akzent (Border #007a8a ivory / #5090A8 dark)
- [ ] Kein "⇄"-Button (Projekt wechseln nicht möglich für Orchestrator)
- [ ] "✕" Button funktioniert normal

**Ergebnis:** _hier eintragen_

---

## Test 16: Context-Usage Farbkodierung

**Voraussetzung:** Session mit Claude Code aktiv

**Erwartetes Ergebnis:**
- [ ] 0–60%: Grün (#2d8a4e ivory / #5C9A6E dark)
- [ ] 60–85%: Orange (#c05000 ivory / #C07840 dark)
- [ ] 85–100%: Rot (#cc0030 ivory / #B85060 dark)
- [ ] Status-Dot ändert Farbe passend

**Ergebnis:** _hier eintragen_

---

## Bekannte Einschränkungen (Phase 6b)

- Keyboard-Shortcuts bis auf Cmd+B und Escape entfernt — alles per Click
- rowSpan (vertikales Session-Spanning) im Datenmodell vorhanden, aber UI setzt es noch nicht ein
- STT-Input für Bugreport ist geplant aber nicht in Phase 6b enthalten
- Grid-Maximum 5x3 bei großen Bildschirmen — auflösungsabhängiges Maximum noch nicht implementiert
