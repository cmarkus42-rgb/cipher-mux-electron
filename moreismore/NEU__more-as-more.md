# more-as-more — Feature Requests & Ideen (v0.11 Testlauf 2026-04-29)

> Konsolidiert aus Watchdog-Testlauf. 84/126 Tests bestanden (67%).
> Quelle: Notes-System, Tags "feature" + "open".

---

## Workspace-System

### WS-1: Workspace-Start mit Resume-Option (SHOULD)
**Note:** 01KQCEBCV6B6XST8AWJE8GD1Z8

Wenn Workspace geladen wird und es noch laufende Sessions gibt: User fragen "Weiterfuehren oder neu starten?". Per-Workspace-Setting: Immer Resume / Immer frisch / Fragen (Default). Verwaiste Sessions tauchen einfach in der Sidebar auf — kein Recovery-Popup noetig.

### WS-2: Lade-Indikator beim Workspace-Start (SHOULD)
**Note:** 01KQCDK7V3DA30PY8RBE4HW8QR

Kurzer Hinweis "Workspace wird geladen..." waehrend Sessions starten. User weiss sonst nicht ob etwas passiert.

### zunächst außen vor / WS-3: Recovery-Dialog als Popup statt Full-Page-Overlay (SHOULD)
**Note:** 01KQCBZST3ZBXKFMSJAGTVXXQT

Konsistenz mit restlichem UI. Recovery als echtes Popup wie GridSelector, Shortcuts etc.

### WS-4: Workspace speichern — Update-Option (SHOULD)
**Note:** 01KQCNADWNZ4BMM2N03V5MZ9TG

Wenn Workspace aktiv: Auswahl "Aktualisieren" vs. "Neu anlegen" statt immer neuen Workspace. Verhindert Duplikate.

### WS-5: Workspace-Popup vereinfachen (SHOULD)
**Note:** 01KQCNRG4QJSMM93GKVNQZ5Z2J

Companion-Direktlink raus. Aktionen klarer: Anlegen/Aktualisieren, Editor, Workspace laden.

---

## Entity & Preset-System

### EN-1: Preset-Editor Erweiterungen (SHOULD)
**Note:** 01KQCN3DDDKDX7JYCV5V081WD6

1. **Editierbare Rangfolge** fuer Preset-Sortierung im Popup (statt hardcoded)
2. **Preset-Namen editierbar** (mindestens selbst erstellte)
3. **VoiceRelay als Companion-Variante** statt eigener Preset — Split-Button: Start / Resume / Voice

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
- User hat weiteren Input angekuendigt

---

*Konsolidiert am 2026-04-29 aus 8 Feature-Notes des Watchdog-Testlaufs.*
