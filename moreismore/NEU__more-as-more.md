# more-as-more — Feature Requests & Ideen

> Konsolidiert aus Watchdog-Testlaeufen v0.11 (2026-04-29 + 2026-04-30).
> Quellen: Notes-System, moreismore-Einzeldateien, User-Feedback.

---

## Workspace-System

### WS-1: Workspace-Start mit Resume-Option (SHOULD)
**Note:** 01KQCEBCV6B6XST8AWJE8GD1Z8

Wenn Workspace geladen wird und es noch laufende Sessions gibt: User fragen "Weiterfuehren oder neu starten?". Per-Workspace-Setting: Immer Resume / Immer frisch / Fragen (Default). Verwaiste Sessions tauchen einfach in der Sidebar auf — kein Recovery-Popup noetig.

### WS-2: Lade-Indikator beim Workspace-Start (SHOULD)
**Note:** 01KQCDK7V3DA30PY8RBE4HW8QR

Kurzer Hinweis "Workspace wird geladen..." waehrend Sessions starten. User weiss sonst nicht ob etwas passiert.

### zunaechst aussen vor / WS-3: Recovery-Dialog als Popup statt Full-Page-Overlay (SHOULD)
**Note:** 01KQCBZST3ZBXKFMSJAGTVXXQT

Konsistenz mit restlichem UI. Recovery als echtes Popup wie GridSelector, Shortcuts etc.

### WS-4: Workspace speichern — Update-Option (SHOULD)
**Note:** 01KQCNADWNZ4BMM2N03V5MZ9TG

Wenn Workspace aktiv: Auswahl "Aktualisieren" vs. "Neu anlegen" statt immer neuen Workspace. Verhindert Duplikate.

### WS-5: Workspace-Popup vereinfachen (SHOULD)
**Note:** 01KQCNRG4QJSMM93GKVNQZ5Z2J

Companion-Direktlink raus. Aktionen klarer: Anlegen/Aktualisieren, Editor, Workspace laden.

### WS-6: Mitgelieferter Default-Workspace (MUST)
**Note:** 01KQEXBVYKHP9QRAFRMWBM5NCQ

App wird mit vordefiniertem Default-Workspace ausgeliefert: 2x2 Grid, Coding Companion links oben, Rest leer. Als Favorit gesetzt. Damit hat jeder Erststart ein funktionierendes Setup.

---

## Entity & Preset-System

### EN-1: Preset-Editor Erweiterungen (SHOULD)
**Note:** 01KQCN3DDDKDX7JYCV5V081WD6

1. **Editierbare Rangfolge** fuer Preset-Sortierung im Popup (statt hardcoded)
2. **Preset-Namen editierbar** (mindestens selbst erstellte)
3. **VoiceRelay als Companion-Variante** statt eigener Preset — Split-Button: Start / Resume / Voice

### EN-2: Globale Basisregeln + Persona-Ausrichtung + Worker-Phasenmodell (SHOULD)
**Note:** 01KQEWKJPQGWYDFSCNX5XSZAVR

Eigener Bereich im Preset-Editor fuer Regeln die ALLEN Presets mitgegeben werden: Sicherheit, Meta-Anforderungen, operationale Grundtugenden (Readiness-Loop, Sub-Session-Protokoll). Dazu ein **Worker-Phasenmodell** das jeder Worker durchlaufen muss (Untersuchen → Plan → Plan pruefen → Umsetzen → Umsetzung pruefen → Tests → Fertig melden). Plus Persona-Ausrichtung (Anfaenger/Fortgeschrittener/Experte) und 3 mitgelieferte Personas.

### EN-3: Holistische Analyse bei Implementierung (SHOULD)
**Note:** 01KQEVN1VWRH0YJJJCJ86QBMFY

Meta-Anforderung: Bei jeder Funktions-Implementierung holistisch pruefen — hat die Funktion UI-Kopplung? Muss der UI-State mitaktualisiert werden? Kann die UI-Entscheidung autonom getroffen werden oder braucht sie User-Input?

---

## UI & Theme

### UI-1: Kompakte Darstellung der Hintergrundsessions (SHOULD)

Hintergrundsessions in der Sidebar: Minimalmodus (2 Zeilen: Name + Token-Usage) als Default, Detailmodus (5 Zeilen) per Klick aufklappbar, Doppelklick oeffnet Session.

### UI-2: Highlight-Farbe im Theme-Editor anpassbar (SHOULD)
**Note:** 01KQEXHEQD1C4WPSZGXSP32ZGF

Highlight-Farbe (Glow/Outline) soll zum Theme passen. Optionen: eigenes Feld im Theme-Editor, automatisch berechnet, oder Kombination.

### UI-3: Note-Drop auf Session wechselt Fokus (SHOULD)

Wenn eine Note auf eine Session-Zelle gezogen wird, soll der Fokus auf diese Zelle wechseln — damit man direkt Enter druecken oder STT nutzen kann.

---

## Demo-Mode

### DM-1: Glow-Highlight deutlicher (NICE-TO-HAVE)
**Note:** 01KQCQNHDDMB7DF9SSE3CEC7HJ

Glow-Style etwas staerker machen. Outline passt gut. Glow soll mehr "hier gucken" signalisieren.

---

## Notes-System

### NT-1: Notes-System Iteration — Sammelstelle (SHOULD)
**Note:** 01KQCPJKF5QX5PP85FYTTD99GY

Offene Punkte fuer naechsten Notes-Umbau:
- Tag-Baum: Max 5-6 Top-Level-Tags, Rest verschachtelt
- Tags-Tab: Textbuttons statt Icon-Buttons, Level-Angaben
- Notes in Sidebar: Drei Textlevel (Titel, Tags, Preview) wie bei Hintergrundsessions
- Testcase-View: Eigenes Fenster/Grid-Zelle statt Notes-Integration?

### NT-2: STT im Notes-Editor (SHOULD)

Speech-to-Text soll auch im Notes-Editor funktionieren — direkt in eine Note diktieren.

### NT-3: STT fuer TestcaseView-Kommentare (SHOULD)
**Note:** 01KQET6Y8816YDQFVGNQ8RCCB7

STT-Diktierung in den Kommentarfeldern des TestcaseView.

### NT-4: Notes-Verwaltung mit Tag-Hierarchie + Volltextsuche (SHOULD)

Slash-Tags als virtuelles Ordnersystem (`bugs/ui/grid`), aufklappbarer Baum links, gefilterte Liste rechts, FlexSearch fuer Volltextsuche.

### NT-5: Tag-Management UI (SHOULD)

Dritter Tab "Tags" im Workspaces/Personas-Fenster: Tag-Liste mit Count/Description, Tags umbenennen/loeschen/mergen, Sortierung. Neuer IPC-Channel noetig.

### NT-6: Copy & Paste im Notes-Editor (BUG/SHOULD)

Cmd+C / Cmd+V im Notes-Editor (CodeMirror 6) funktioniert nicht. Vermutlich wird das Clipboard-Event in der Electron-Integration geschluckt.

---

## Infrastruktur

### IF-1: MCP-Verbindung droppt spontan (BUG/SHOULD)

MCP-Tools verschwinden waehrend laufender Session ohne Ausloeseer. Alle cipher-mux Tools gleichzeitig weg. App-Neustart noetig.

---

*Konsolidiert am 2026-04-30. Quellen: Watchdog-Testlaeufe (2026-04-29 + 2026-04-30), moreismore-Einzeldateien, User-Feedback.*
