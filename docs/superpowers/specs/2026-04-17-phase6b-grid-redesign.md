# Phase 6b — Grid-Layout Redesign

cipher-mux-electron UI-Redesign nach User-Test-Feedback.
Ersetzt ActivityRail + Binary-Split-Tree durch ein konfigurierbares Grid-Layout
mit Click-basierter Steuerung. Fixes für Config-Persistence, Bugreport-Enrichment,
Theme-System und Git-basierte Versionierung.

**Designprinzip:** we build to share — cipher-mux ist ein allgemeines Claude Code
Cockpit. Code, Kommentare und Doku für externe Nutzbarkeit geschrieben.

## 1. Grid-Layout-System

### Entfernt
- `ActivityRail.tsx` — ersetzt durch Grid als Navigation
- `SplitContainer.tsx` — ersetzt durch CSS Grid
- `useLayout.ts` (Binary-Tree-Hook) — ersetzt durch Grid-State

### Neues Datenmodell
```typescript
interface GridConfig {
  cols: number;   // 1–5, default 5
  rows: number;   // 1–3, default 2
}

interface GridSlot {
  sessionId: string | null;  // null = launcher-zelle
  rowSpan: number;           // 1–3, default 1 (breite immer 1)
}

// persistent in ConfigStore
interface GridState {
  config: GridConfig;
  slots: GridSlot[];  // length = cols * rows, sparse (nicht alle belegt)
}
```

### Verhalten
- CSS Grid mit `grid-template-columns: repeat(cols, 1fr)` und `grid-template-rows: repeat(rows, 1fr)`
- Click in Zelle setzt Tastatur-Fokus direkt ins Terminal
- 1x1 Grid = Fokus-Modus (kein separates Feature)
- Grid-Größe persistent — letzter Wert bleibt bis User ändert
- Sessions können vertikal spannen (`rowSpan > 1`), Breite immer 1 Spalte

### Grid-Controls
- +/− Buttons unten rechts: "spalten −/+" und "zeilen −/+"
- Änderung sofort persistent
- Minimum 1x1, Maximum 5x3 bei dghd, sonst angepasst an auflösung

### Drag & Drop
- Session-Header als Drag-Handle
- Drop auf leere Zelle oder Swap mit anderer Session
- Visuelles Feedback beim Drag (z.B. Border-Highlight auf Drop-Target)

### Leere Zelle = Launcher
- Dashed Border, `+` Icon, "projekt auswählen" Label
- Click öffnet Cockpit-Popup (Projektauswahl-Dialog)
- Neue Session startet in dieser Zelle

## 2. Session-Zellen

### Header-Leiste (pro Zelle)
- **Links:** Status-Dot · Projektname (lowercase) · `·` · Context-Usage %
- **Rechts:** `⇄` (projekt wechseln) · `✕` (session schließen)
- Orchestrator: Cyan-Akzent (#007a8a ivory / #5090A8 dark), kein ⇄-Button

### Context-Usage Farbkodierung
| Bereich | Ivory | Dark |
|---------|-------|------|
| 0–60% | #2d8a4e | #5C9A6E |
| 60–85% | #c05000 | #C07840 |
| 85–100% | #cc0030 | #B85060 |

### Terminal
- xterm.js mit Theme-gekoppeltem Hintergrund
- Ivory: #F5F5EC + dunkler Text
- Dark: aus bestehendem Dark-Theme (#222228 o.ä.)
- Inset-Shadow für eingelassene Optik

### ⇄ Projekt wechseln
- Öffnet Cockpit-Popup (identisch zur Projektauswahl)
- Wechselt Projekt der bestehenden Session

## 3. Cockpit-Popup (Projektauswahl)

Das bisherige CockpitView wird zum modalen Popup-Dialog:
- Projektliste aus ProjectScanner
- Suchfeld / Filter
- Click auf Projekt startet Session (aus Launcher-Zelle) oder wechselt Projekt (aus ⇄)
- Geöffnet von: leere Grid-Zelle, ⇄-Button in Session-Header

## 4. Chatroom (Message Bus)

- Rechtes Panel, ~220px, wie bisher
- Toggle via Floating-Button am rechten Grid-Rand
- Message-Bubbles: #F5F5EC Hintergrund (ivory) / Dark-Äquivalent
- Cut Corners auf Bubbles
- Wire Divider unter Chatroom-Header

## 5. Statusbar

Feste Leiste am unteren Rand, 24px:
- **Links:** Version (git-basiert, z.B. `v0.3.0+42`)
- **Rechts:** `bugreport` · `theme: ivory` · `info` — alles lowercase, text-only, klickbar

## 6. Theme-System

### Zwei Themes
- **Ivory** (Default): Keramik-Hintergrund #F2F2E8, Anthrazit-Borders #3A3F47, lesbare Akzente
- **Dark**: Bestehendes Dark-Theme (angepasst an neue Akzent-Strategie)

### Implementierung
- CSS Custom Properties auf `:root` (Ivory) und `body.theme-dark` (Dark)
- xterm.js Theme-Objekt koppelt automatisch mit
- Theme-Wahl persistent in ConfigStore
- Umschalten via Click auf "theme: ivory/dark" in Statusbar

### Ivory Akzentfarben (lesbar auf hellem Grund)
- Grün: #2d8a4e (statt #00FF41)
- Orange: #c05000 (statt #FF5F00)
- Rot: #cc0030 (statt #FF003C)
- Cyan: #007a8a (statt #00E5FF)
- Status-Dots: leicht satter (#00CC40, #E05500, #DD0035, #00AACC)

### Dark Akzentfarben (bestehendes Schema, ggf. angepasst)
- Grün: #5C9A6E, Orange: #C07840, Rot: #B85060, Cyan: #5090A8

### Textstil
- Alles lowercase (Labels, Buttons, Header, Statusbar)
- Rajdhani Headings, Fira Code Mono durchgehend
- Cut Corners, kein border-radius

## 7. Bugreport mit Ollama-Enrichment

### Flow
1. User clickt "bugreport" in Statusbar → Dialog öffnet sich
2. User tippt Freitext-Beschreibung
3. Click "vorschau" → POST an Ollama (`http://127.0.0.1:11433/api/generate`)
4. Ollama strukturiert: Tags, Severity, Steps-to-Reproduce, Zusammenfassung
5. Preview im Dialog — User kann editieren
6. "absenden" → Markdown mit YAML-Frontmatter in Outbox schreiben
7. Diagnostik-Daten werden wie bisher angehängt

### Ollama-Integration
- Endpoint: `http://127.0.0.1:11433/api/generate`
- Langes Timeout (60s+) — lokales Modell kann langsam sein
- Fallback: wenn Ollama nicht erreichbar, Rohtext ohne Enrichment speichern
- Prompt erzeugt strukturierten Output mit: title, tags[], severity, steps[], summary

### Spätere Erweiterung (nicht in Phase 6b)
- STT-Input via Voice-Pipeline aus cipher-desktop portieren

## 8. Config-Persistence Fix

### Problem
`~/Library/Application Support/cipher-mux/cipher-mux-config.json` ist leer `{}`.
Layout-Persistenz speichert nie, Session-Recovery hat keine Daten.

### Fix
- Root Cause finden: IPC-Handler `config:saveLayout`, ConfigStore write-path debuggen
- Grid-State (cols, rows, slot-belegung) persistent machen
- Window-Position/Size persistent
- Chatroom-Visibility persistent
- Theme-Wahl persistent

## 9. Session Recovery (angepasst)

### Flow beim App-Start
1. Config laden → Grid-State auslesen
2. tmux-Sessions scannen (prefix `cmux-`)
3. Wenn Config valide: Sessions automatisch in Grid-Positionen aus Config
4. Wenn Config leer/korrupt: Orphan-Dialog, Sessions ins Grid einsortieren
5. Orchestrator-Link wiederherstellen wenn vorhanden

## 10. Git-basierte Versionierung

### Build-Script
- Liest letzten Git-Tag (`git describe --tags --abbrev=0`)
- Zählt Commits seit Tag (`git rev-list --count TAG..HEAD`)
- Schreibt `APP_VERSION = "0.3.0+42"` in Konstante
- Angezeigt in Statusbar links

## 11. Entfernte Features / Keyboard-Shortcuts

### Entfernt
- Cmd+0 (Cockpit-Switch) — Cockpit ist jetzt Popup
- Cmd+1..9 (Session-Jump) — Grid ist die Navigation
- Cmd+\ und Cmd+- (Splits) — Grid statt Splits
- Cmd+K (Chatroom-Toggle) — Floating-Button statt Shortcut
- Cmd+N (Kickoff) — Launcher-Zelle statt Shortcut

### Beibehalten
- Cmd+B (Bugreport) — zusätzlich zum Statusbar-Click
- Escape — ggf. Dialog schließen

### Philosophie
Tastatur gehört IN die Session. Navigation, Layout-Steuerung, Launcher —
alles per Click. Keyboard-Shortcuts nur wo sie nicht mit Terminal-Input
kollidieren können.

## Mockup-Referenz

Visueller Prototyp (Ivory Theme) unter:
`.superpowers/brainstorm/94214-1776447350/content/full-layout-ivory-v5.html`
