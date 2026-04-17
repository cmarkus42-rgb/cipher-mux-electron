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
- [x] Electron-Fenster öffnet sich
- [x] Ivory Theme (heller Hintergrund #F2F2E8, nicht dunkel)
- [x] Kein ActivityRail links — stattdessen Grid mit leeren Zellen
- [x] StatusBar unten: Version links, "bugreport · theme: ivory · info" rechts
- [x] Alles lowercase (Labels, Buttons, StatusBar)
- [x] Rajdhani Headings, Fira Code Mono Schrift

**Ergebnis:** alles gut - sieht gut aus

---

## Test 2: Grid-Layout (leerer Zustand)

**Erwartetes Ergebnis:**
- [x] 5x2 Grid mit 10 leeren Zellen sichtbar
- [x] Jede leere Zelle zeigt: dashed Border, "+" Icon, "projekt auswählen" Label
- [x] Grid-Controls unten rechts: "spalten −/+" und "zeilen −/+"
- [x] Cut-Corner-Design auf allen Zellen (abgeschnittene Ecken, kein border-radius)

**Ergebnis:** _hier eintragen_ja

---

## Test 3: Grid-Größe ändern

**Aktion:** Grid-Controls benutzen

**Schritte:**
1. "spalten −" klicken bis 1 → Grid zeigt 1 Spalte
2. "zeilen −" klicken bis 1 → Grid zeigt 1x1 (Fokus-Modus)
3. "spalten +" bis 5, "zeilen +" bis 3 → Grid zeigt 5x3 (Maximum)
4. Buttons bei Min/Max ausgegraut?

**Erwartetes Ergebnis:**
- [x] Grid passt sich sofort an
- [x] Minimum 1x1, Maximum 5x3
- [x] Buttons disabled am Limit
- [x] Grid-Größe bleibt nach App-Neustart erhalten (persistent)

**Ergebnis:** 
---passt

## Test 4: Session starten via Launcher-Zelle

**Aktion:** Klick auf eine leere Grid-Zelle ("+"-Symbol)

**Erwartetes Ergebnis:**
- [x] ProjectPopup öffnet sich (Modal-Overlay, abgedunkelt)
- [x] Titel zeigt "projekt auswählen"
- [x] Projektliste mit Filtern/Suchfeld
- [x] "↻" Button zum Rescannen
- [x] Klick auf ein Projekt startet eine Session
- [x] Session erscheint in der angeklickten Zelle (nicht irgendwo)

**Ergebnis:** gut
---

## Test 5: Session-Zelle

**Voraussetzung:** Mindestens eine laufende Session

**Erwartetes Ergebnis:**
- [x] Cell Header zeigt: Status-Dot · Projektname (lowercase) · "·" · Context-Usage %
- [x] Rechts im Header: "⇄" (projekt wechseln) · "✕" (session schließen)
- [x] Terminal-Bereich darunter (xterm.js)
- [x] Terminal hat Ivory-Hintergrund (#F5F5EC) — hell, nicht dunkel
- [x] Inset-Shadow auf dem Terminal-Bereich
- [x] Klick in die Zelle setzt Fokus (Border-Highlight)

**Ergebnis:** gut
---

## Test 6: Projekt wechseln (⇄)

**Aktion:** "⇄" Button in einem Session-Header klicken

**Erwartetes Ergebnis:**
- [x] ProjectPopup öffnet sich
- [x] Titel zeigt "projekt wechseln" (nicht "auswählen")
- [x] Klick auf Projekt: alte Session wird gestoppt, neue Session startet im selben Slot
- [x] Terminal zeigt neues Projekt

**Ergebnis:** 
---gut

## Test 7: Session schließen (✕)

**Aktion:** "✕" Button in einem Session-Header klicken

**Erwartetes Ergebnis:**
- [x] Session wird gestoppt
- [x] Zelle wird wieder zur Launcher-Zelle (dashed Border, "+" Icon)
- [x] Fokus wechselt auf nächste vorhandene Session

**Ergebnis:** 
---
ok
## Test 8: Drag & Drop

**Voraussetzung:** 2+ Sessions im Grid

**Aktion:** Session-Header greifen, auf andere Zelle ziehen

**Erwartetes Ergebnis:**
- [x] Drag-Handle am Header (cursor: grab)
- [x] Drop auf leere Zelle: Session wandert dorthin
- [x] Drop auf andere Session: Swap (Positionen tauschen)
- [x] Drop-Target zeigt visuelles Feedback (dashed Border)

**Ergebnis:** 
---schick

## Test 9: Theme-Wechsel

**Aktion:** "theme: ivory" in der StatusBar klicken

**Erwartetes Ergebnis:**
- [x] Sofortiger Wechsel auf Dark Theme
- [x] StatusBar zeigt "theme: dark"
- [x] Terminals wechseln auf dunklen Hintergrund (#222228)
- [x] Alle Farben passen zum Dark Theme (muted neon accents)
- [x] Nochmal klicken: zurück auf Ivory
- [x] Theme-Wahl bleibt nach App-Neustart erhalten

**Ergebnis:** 
---

## Test 10: Chatroom Toggle

**Aktion:** Floating-Button am rechten Rand klicken (✉)

**Erwartetes Ergebnis:**
- [x] Chatroom-Panel schiebt sich von rechts auf (~220px)
- [x] Button verschwindet wenn Panel offen
- [ ] Message-Bubbles mit #F5F5EC Hintergrund (Ivory) / Dark-Äquivalent
- [ ] Panel schließen: Button erscheint wieder

**Ergebnis:** keine bubbles, keine möglichkkeit zu schließen zu sehen
---

## Test 11: StatusBar

**Erwartetes Ergebnis:**
- [ ] Links: Version (z.B. "v0.3.0-dev" oder "v0.3.0+42")
- [x] Rechts: "bugreport" · "theme: ivory" · "info" — alles lowercase, klickbar
- [x] 24px Höhe, fest am unteren Rand

**Ergebnis:** version 020
---

## Test 12: Bugreport mit Ollama-Enrichment

**Aktion:** "bugreport" in StatusBar klicken (oder Cmd+B)

**Schritte:**
1. Dialog öffnet sich
2. Freitext-Beschreibung eingeben (z.B. "terminal friert ein bei großem output")
3. "vorschau" klicken

**Erwartetes Ergebnis (Ollama läuft):**
- [x] Ladeindikator während Ollama arbeitet
- [x] Strukturierte Vorschau: Title, Severity, Tags, Steps, Summary
- [x] Vorschau editierbar
- [x] "absenden" schreibt Markdown mit YAML-Frontmatter in Outbox

**Erwartetes Ergebnis (Ollama nicht erreichbar):**
- [x] Hinweis "ollama nicht erreichbar"
- [x] Rohtext wird ohne Enrichment gespeichert

**Ergebnis:** 
---ja...ollama integration folgt noch? oder?

## Test 13: Info-Dialog

**Aktion:** "info" in StatusBar klicken

**Erwartetes Ergebnis:**
- [x] Modal-Overlay öffnet sich mit InfoSettingsView
- [x] Klick auf Overlay schließt Dialog
- [x] Tabs: Shortcuts, Features, Einstellungen

**Ergebnis:** schon mitgeteilt
---

## Test 14: Config-Persistenz

**Schritte:**
1. Grid auf 3x2 ändern
2. Theme auf Dark wechseln
3. 1-2 Sessions starten
4. App beenden (Cmd+Q)
5. App neustarten

**Erwartetes Ergebnis:**
- [x] Grid ist 3x2 (nicht zurück auf 5x2)
- [x] Theme ist Dark (nicht zurück auf Ivory)
- [x] Config-Datei `~/Library/Application Support/cipher-mux/cipher-mux-config.json` ist NICHT leer

**Prüfen:**
```bash
cat ~/Library/Application\ Support/cipher-mux/cipher-mux-config.json | python3 -m json.tool
```

**Ergebnis:** hatten wir alles durch und den bash kannste dslebst besser
---

## Test 15: Orchestrator im Grid

**Voraussetzung:** Orchestrator-Session existiert

**Erwartetes Ergebnis:**
- [ ] Orchestrator-Zelle hat Cyan-Akzent (Border #007a8a ivory / #5090A8 dark)
- [ ] Kein "⇄"-Button (Projekt wechseln nicht möglich für Orchestrator)
- [ ] "✕" Button funktioniert normal

**Ergebnis:** kein orchestrator
---

## Test 16: Context-Usage Farbkodierung

**Voraussetzung:** Session mit Claude Code aktiv

**Erwartetes Ergebnis:**
- [ ] 0–60%: Grün (#2d8a4e ivory / #5C9A6E dark)
- [ ] 60–85%: Orange (#c05000 ivory / #C07840 dark)
- [ ] 85–100%: Rot (#cc0030 ivory / #B85060 dark)
- [ ] Status-Dot ändert Farbe passend

**Ergebnis:** wird man sehen :)
---

## Bekannte Einschränkungen (Phase 6b)

- Keyboard-Shortcuts bis auf Cmd+B und Escape entfernt — alles per Click
- rowSpan (vertikales Session-Spanning) im Datenmodell vorhanden, aber UI setzt es noch nicht ein
- STT-Input für Bugreport ist geplant aber nicht in Phase 6b enthalten
- Grid-Maximum 5x3 bei großen Bildschirmen — auflösungsabhängiges Maximum noch nicht implementiert
