# Prompt für Claude Code — Theme-Picker in cipher-mux-electron

Kopier alles unterhalb der Trennlinie in Claude Code hinein.

---

## Aufgabe

Erweitere **cipher-mux-electron** von 2 Themes (`ivory`, `dark`) auf **10 Themes** mit einem leichtgewichtigen Theme-Picker im Settings-Tab. Die CSS-Dateien liegen fertig vor.

## Quell-Material

Ein Ordner `claude-code-handoff/` liegt im Projekt-Root und enthält:

- `themes/theme-*.css` — 10 fertige Theme-Dateien (Token-Struktur 1:1 kompatibel zu existierenden `theme-ivory.css` / `theme-dark.css`)
- `themes.json` — Master-Manifest mit id, name, mode, `previewSwatches[8]`, tokens, ansi
- `src-snippets/terminal-themes.generated.ts` — xterm.js-Themes pro Theme-ID
- `settings-theme-picker.html` — visuelles Mockup, so soll der Picker aussehen

## Schritt-für-Schritt

### 1. CSS-Dateien reinkopieren

```
cp claude-code-handoff/themes/theme-*.css   src/renderer/styles/
cp claude-code-handoff/themes.json          src/renderer/
cp claude-code-handoff/src-snippets/terminal-themes.generated.ts   src/shared/
```

Existierende `theme-ivory.css` und `theme-dark.css` werden überschrieben — das ist ok, die neuen Dateien sind inhaltlich identisch (Ivory auf `:root`, Dark auf `body[data-theme="cipher-dark"]`).

### 2. `src/renderer/styles/theme.css` anpassen

Imports erweitern:

```css
@import './theme-cipher-ivory.css';
@import './theme-cipher-dark.css';
@import './theme-blueprint.css';
@import './theme-warm-paper.css';
@import './theme-gruvbox-dark.css';
@import './theme-nord.css';
@import './theme-synthwave.css';
@import './theme-matrix.css';
@import './theme-brutalist.css';
@import './theme-high-contrast.css';
```

### 3. `src/shared/grid-types.ts` — `ThemeName` erweitern

```ts
export type ThemeName =
  | 'cipher-ivory' | 'cipher-dark'
  | 'blueprint' | 'warm-paper'
  | 'gruvbox-dark' | 'nord'
  | 'synthwave' | 'matrix'
  | 'brutalist' | 'high-contrast'

// Legacy-Aliasse für persistierte Configs (aus alten Versionen):
export const LEGACY_THEME_ALIASES: Record<string, ThemeName> = {
  'ivory': 'cipher-ivory',
  'dark':  'cipher-dark',
}

export const DEFAULT_THEME: ThemeName = 'cipher-ivory'
```

### 4. `src/renderer/hooks/useTheme.ts` umstellen

- Statt `body.theme-dark` togglen: **`document.body.dataset.theme = theme`** setzen.
- Legacy-Werte beim Laden durch `LEGACY_THEME_ALIASES` mappen.
- `body.theme-dark` optional weiter-setzen, solange CSS noch darauf referenziert (Grep-Check vorher: `grep -r "body.theme-dark" src/`).
- `toggleTheme()` kann bleiben (wechselt zwischen letztem Light und letztem Dark), ODER durch `setTheme(id)` ersetzen.

### 5. `src/shared/terminal-theme.ts` ersetzen

Die aktuelle `getTerminalTheme(theme)` kann alle 10 Themes nicht hardcoden. Stattdessen aus `terminal-themes.generated.ts` lesen:

```ts
import { TERMINAL_THEMES } from './terminal-themes.generated'
import type { ThemeName } from './grid-types'

export function getTerminalTheme(theme: ThemeName) {
  return TERMINAL_THEMES[theme] ?? TERMINAL_THEMES['cipher-ivory']
}
```

Den bestehenden `TerminalThemeColors`-Typ behalten — die generierte Datei importiert ihn.

### 6. Theme-Picker-UI in `InfoSettingsView.tsx` (Tab „settings")

Bau eine neue Sektion **„theme"** direkt unter der `scan-pfade`-Sektion. Render für jedes Theme aus `themes.json`:

```
┌─────────────────────────────────────────────────────┐
│ ○  Cipher Ivory           ▌▌▌▌▌▌▌▌    light · aktiv│
│ ●  Cipher Dark            ▌▌▌▌▌▌▌▌    dark          │
│ ○  Blueprint              ▌▌▌▌▌▌▌▌    dark          │
│ ○  Matrix                 ▌▌▌▌▌▌▌▌    dark          │
│ …                                                    │
└─────────────────────────────────────────────────────┘
```

- **Farbschema-Streifen** = 8 Swatches à 14×28px aus `previewSwatches[]` (bg, bg-elevated, border, text, accent, success, warning, error).
- Row = klickbar, selektiert per `setTheme(id)`.
- Aktives Theme: linker Rand 3px solid `--color-accent` + `aria-checked="true"`.
- Radiogroup-Semantik: `<div role="radiogroup" aria-label="Theme">` + Rows als `role="radio"`.
- Leicht! Keine Modals, keine Tabs. Nur die Liste direkt im Tab.

Exakte Markup + Styles: siehe **`settings-theme-picker.html`** im Handoff-Ordner.

### 7. Statusbar-Label

`StatusBar.tsx` zeigt aktuell nur „theme: ivory/dark". Umstellen auf den Namen aus `themes.json` (z.B. „theme: Matrix"). Klick auf das Label öffnet weiterhin den Settings-Tab mit dem Theme-Bereich sichtbar.

### 8. Config-Migration

`ConfigStore` liest `ui.theme`. Beim ersten Laden nach Update:

```ts
const saved = ui?.theme
const mapped = LEGACY_THEME_ALIASES[saved] ?? (THEME_IDS.has(saved) ? saved : DEFAULT_THEME)
```

Kein destruktives Rewriting der Config nötig — beim nächsten `config.set('ui', ...)` wird der neue Name persistiert.

### 9. Tests

- `terminal-theme.test.ts`: alle 10 Theme-IDs müssen ein valides `TerminalThemeColors`-Objekt zurückgeben (background, foreground, 16 ANSI slots).
- Snapshot-Test auf `themes.json`: Schema stabil (id, mode, previewSwatches.length === 8).
- Legacy-Alias-Test: `getTheme('ivory') → cipher-ivory`, `getTheme('dark') → cipher-dark`.

### 10. CLAUDE.md ergänzen

In `cipher-mux-electron/CLAUDE.md` unter „themes" dokumentieren:

> 10 Themes, definiert via `body[data-theme="<id>"]` in `src/renderer/styles/theme-*.css`.
> Neue Themes: CSS im Playground generieren → `claude-code-handoff/themes/` → hierher kopieren → `theme.css` import + `ThemeName` union erweitern + `terminal-themes.generated.ts` regenerieren.

## Nicht ändern

- Bestehende Token-Namen (`--color-bg`, `--color-neon-green`, …) — alle 10 Themes nutzen dieselbe Struktur, damit Components nicht angefasst werden müssen.
- Layout, `layout.css`, `grid.css`, `components.css`: kein Touch, die lesen alle über Variablen.
- `scanline-opacity`-Referenzen: bleibt wie ist.

## Fertig-Definition

- [ ] 10 Themes per Dropdown/Liste in Settings wählbar, Klick wechselt live
- [ ] Jedes Theme hat den 8-Farben-Preview-Streifen
- [ ] Terminal nimmt beim Wechsel die zugehörige ANSI-Palette an
- [ ] `ivory` / `dark` aus alten Configs werden automatisch zu `cipher-ivory` / `cipher-dark`
- [ ] Alle bestehenden Tests grün
- [ ] `pnpm lint` sauber

---

# Teil 2 — Workspaces + Personas

Zweites, unabhängiges Feature im selben Handoff-Paket.

## Kurz-Brief

- **Workspace** = gespeichertes Session-Grid (cols × rows, merges, pro Zelle eine Persona + Projekt + optionaler Prompt).
- **Persona** = benannte Rolle (z. B. `Orchestrator`, `MPO`, `Worker`, oder eigene wie `Researcher`, `Reviewer`). Hat Farbe + Default-Prompt. Global wiederverwendbar über alle Workspaces.
- Zwei neue Settings-Tabs: **Workspaces** und **Personas**.
- Ein **Popup unten links in der Appbar**: Schnell-Picker zum Laden gespeicherter Workspaces.

Alle drei UI-Teile liegen im Handoff-Ordner als Mockups:
- `workspaces-popup.html` — Popup-Verhalten + Thumbnails mit Persona-Farben
- `settings-workspaces.html` — Manage-Tab mit Grid-Editor, Merge-Handles, Overrides
- `settings-personas.html` — einfacher Liste + Edit-Panel

Datenmodell + Auflösungslogik: `personas.js` im Handoff-Ordner ist die Referenz-Implementation (in Plain JS mit localStorage — in der Electron-App bitte via `ConfigStore` persistieren).

## Datenmodell

### `Persona`
```ts
interface Persona {
  id: string            // z.B. 'orchestrator', 'mpo', 'worker', 'persona-<timestamp>'
  name: string          // Display-Name
  color: string         // Hex, für Chip/Dot/Thumb
  defaultPrompt: string // Standard-System-Prompt
  builtin?: boolean     // true für orchestrator, mpo, worker, empty → nicht löschbar, name gelockt
}
```

**Built-in Personas (immutable IDs, seed-on-first-run):**
- `orchestrator` — Farbe `#B8601A` — koordiniert, plant, gated merges via MPO
- `mpo` — Farbe `#2d8a4e` — Meta-Prompt Officer, verifiziert Claims, blockt Merges mit Evidenz
- `worker` — Farbe `#6A6A72` — führt einen fokussierten Task aus
- `empty` — Farbe neutral — Platzhalter-Zelle, kein Prompt, keine Persona aktiv

Built-ins sind in der UI gelockt: `name` + `color` + `delete` sind disabled. **Nur `defaultPrompt` ist editierbar**, damit User ihren Orchestrator-Stil tunen können.

### `Workspace`
```ts
interface WorkspaceCell {
  persona: string            // persona.id — Pflicht (defaults to 'empty')
  project: string            // Projekt-Path/Slug aus dem Project-Picker; '' = unassigned
  prompt: string             // per-cell override; '' = fall through
}

interface Workspace {
  id: string
  name: string
  cols: number                // 1..10
  rows: number                // 1..6
  cells: WorkspaceCell[]      // length === cols*rows, row-major
  merges: Record<string, true> // key "col:row" → merges this cell DOWN into col:row+1
  promptOverrides: Record<string, string> // personaId → workspace-scoped prompt override
}
```

### Prompt-Auflösung pro Zelle (wichtig!)
```
1. cell.prompt (trim != '')               → use it  [source: 'cell']
2. workspace.promptOverrides[cell.persona] → use it  [source: 'workspace-override']
3. persona.defaultPrompt                   → use it  [source: 'persona-default']
```
Die Inspector-UI zeigt an, welche Ebene greift. Siehe `CM.resolvePrompt(ws, cell)` in `personas.js`.

### Merges
- Nur **vertikale Merges** (Spalten bleiben fix, Zelle spannt nach unten).
- Key `"col:row"` in `merges` bedeutet: die Zelle (col, row) ist nach unten gemerged → (col, row+1) wird unsichtbar.
- Mehrfach-Merges erlaubt (`"0:0"` + `"0:1"` → Zelle (0,0) ist 3× hoch).
- `spanOf(ws, col, row)` liefert 1 (normal), 2+ (Top eines Stacks), 0 (hidden).

## Settings-Tab „Personas"

Layout: linke Liste + rechts Edit-Panel. Siehe `settings-personas.html`.

Features:
- Liste zeigt Dot + Name + Prompt-Preview + `BUILT-IN`-Badge.
- Rechts: Dot-Picker (10 Preset-Swatches — **gelockt für Built-ins**), Name-Input (gelockt für Built-ins), große Prompt-Textarea (für alle editierbar).
- `+ NEW` → neue Persona mit Default-Werten, sofort editierbar.
- `duplicate` → Kopie (nie built-in, egal ob Original built-in war).
- `delete` → nur Custom-Personas. Zellen, die die gelöschte Persona referenzieren, **fallen auf `empty` zurück** (nicht silently löschen, sonst verliert User Zelle).
- Footer-Zeile zeigt Usage: „Used in 2 workspaces, 4 cells: TRIAGE, HACKER TALL".
- `save` → persist in ConfigStore. Änderungen propagieren: alle offenen Terminals mit dieser Persona lesen beim nächsten Spawn den neuen `defaultPrompt`; **laufende Sessions nicht umreißen** — nur beim nächsten Boot der Zelle.

## Settings-Tab „Workspaces"

Layout: linke Liste + rechts Editor mit Grid + Inspector + Overrides. Siehe `settings-workspaces.html`.

### Linke Workspace-Liste
- Thumbs nutzen Persona-Farben (nicht Rollen-Farben). Bei Persona-Löschung: grauer Strich.
- Name, `<cols>×<rows>`-Subline, Slot-Count.
- Klick → activate, `+ NEW` → neuer leerer Workspace.

### Editor (rechts)
- Name-Input (inline), `duplicate`, `delete`, Style-Toggle `pixel` ↔ `line`.
- Dim-Stepper für Cols (1..10) und Rows (1..6). Shrink droppt die überschüssigen Zellen; Grow füllt mit `empty`.
- **Grid-Viewport** (`pixel` = 3px schwarzer Grout / `line` = 1px Border):
  - Jede Zelle: Persona-Chip (Dot + Name), Koordinate `[col,row]` (optional `×N` bei Span), Projekt-Name, Prompt-Preview.
  - Prompt-Preview-Marker: `>` = per-cell, `≡` (dim) = inherited (workspace-override oder persona-default).
  - **Merge-Handle**: 6px hohe unsichtbare Zone auf der unteren Kante. Hover → Accent-Linie sichtbar. Klick → mergt mit der Zelle direkt darunter. Zweiter Klick löst den Merge.
  - Klick auf Zelle (nicht auf Handle) → selektiert für Inspector.

### Cell-Inspector
Drei Felder:
- **Persona**: Select über alle Personas. Wechsel triggert Re-Render mit neuer Farbe.
- **Project**: Select über `CM.MOCK_PROJECTS` → in echt der Project-Picker aus der App.
- **Cell Prompt**: Textarea mit `placeholder` = der aktuell gerbte Prompt (aus Override oder Persona-Default). Source-Note erklärt welche Ebene gerade greift.

### Persona Prompt Overrides (Abschnitt unten)
- Auto-listet **alle Personas, die in diesem Workspace in mindestens einer Zelle vorkommen**.
- Pro Persona: Label (Dot + Name + Zell-Anzahl), Textarea, darunter die `base:` Default-Prompt als Referenz.
- Leer lassen → fällt auf Persona-Default zurück.
- Zusätzlich: Picker + `+ add override`, um Overrides für Personas anzulegen, die noch nicht im Grid sind (z. B. „ich will beim nächsten Worker einen speziellen Prompt haben, bevor ich ihn platziere").

### Save / Revert
- `save` → persist in ConfigStore.
- `revert` → reload from ConfigStore, alle lokalen Edits weg.

## Workspaces-Popup (Appbar unten links)

Siehe `workspaces-popup.html`.

- Trigger: Klick auf `workspaces ▴` in der Appbar. Toggle auf/zu.
- Schließt auf `Esc` und Click-Outside.
- Liste der gespeicherten Workspaces mit **Mini-Thumbnail in Persona-Farben** + Name + Subline (`<cols>×<rows> · N slots · <persona-namen>`).
- Unter der Liste: **Persona-Legende** für den aktuell selektierten Workspace — Dot + Name + Count.
- Default-Workspace hat Badge `DEFAULT`.
- Double-Click auf Row oder Klick auf `load` → Workspace anwenden (siehe unten).
- Footer-Buttons: `personas…` (→ Settings→Personas), `edit…` (→ Settings→Workspaces), `load`.

## Workspace anwenden (Apply-Logik)

Beim `load` eines Workspace:
1. Prüfe, ob alle referenzierten Personas noch existieren. Fehlende → `empty` + Toast „Persona 'Reviewer' not found — cells set to empty".
2. Spawne für jede nicht-`empty`-Zelle eine tmux-Session im entsprechenden Projekt-cwd.
3. Injiziere beim Boot der Session den aufgelösten Prompt (`CM.resolvePrompt`). Quelle ist egal — es fließt ein String in den ersten claude-Call.
4. Wende die Merge-Topology auf das Renderer-Grid an (CSS Grid rows via `grid-row: N / span K`).
5. Persist `activeWorkspaceId` in ConfigStore, damit Reloads wiederherstellen.

## Persistenz

- `ConfigStore` bekommt zwei neue Keys:
  - `personas: Persona[]`
  - `workspaces: Workspace[]`
  - `activeWorkspaceId: string | null`
- Migration: existierende User haben `undefined` → seed mit Built-in-Personas + einem Default-Workspace (`TRIAGE 3×2`, siehe `personas.js` SEED_WORKSPACES).
- Built-in-Personas werden bei jedem Boot **mindestens einmal** in die Store-Liste gemerged (falls User sie beim Migrieren verloren hat). Der User-Anteil (custom Personas) bleibt unangetastet.

## Nicht anfassen

- Die bestehende tmux-Integration (nur der Prompt wird beim Boot injiziert).
- MPO-Flow: das Feature behandelt nur _welche_ Persona in welcher Zelle mit welchem Prompt startet — die MPO-Pipeline läuft unverändert weiter.
- Bestehende Theme-Tokens: `persona.color` ist ein Hex-Wert, nicht an Theme-Variablen gekoppelt (soll in allen Themes gleich aussehen).

## Fertig-Definition

- [ ] `Personas`-Tab in Settings: CRUD für Custom-Personas, Built-ins prompt-editierbar aber sonst gelockt
- [ ] `Workspaces`-Tab in Settings: Grid-Editor mit Merge-Handles, Dim-Stepper, Pixel/Line-Toggle
- [ ] Cell-Inspector: Persona + Project + Prompt, Prompt-Auflösung zeigt Quelle an
- [ ] Persona Prompt Overrides pro Workspace, auto-listet verwendete Personas
- [ ] Popup in Appbar unten links: Liste mit Persona-farbigen Thumbs + Legende, `load` wendet an
- [ ] ConfigStore persistiert `personas`, `workspaces`, `activeWorkspaceId`
- [ ] Alte Configs ohne Workspaces/Personas bekommen Seed-Defaults
- [ ] Persona-Löschung → referenzierende Zellen fallen auf `empty` (nicht crashen)
- [ ] Tests: `resolvePrompt` mit allen drei Quellen, `spanOf` mit 1×/2×/3× Merges, Persona-Delete-Fallback
- [ ] `pnpm lint` sauber
