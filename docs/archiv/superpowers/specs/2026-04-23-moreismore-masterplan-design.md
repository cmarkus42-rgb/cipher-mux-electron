# Masterplan: moreismore — Bugfixes, Theme-System, Workspaces, Kommunikation

_Design-Doc erstellt 2026-04-23 aus dem gesamten `moreismore/`-Ordner._

## Quellen

Alle Items stammen aus `moreismore/`:
- 12 Bugreports (BUG-*.md)
- 1 Design-Set (CipherMux-design-set.zip → 10 Themes + Workspaces/Personas)
- 1 Architektur-Proposal (message-bus-push-delivery.md)
- 4 Feature-Requests (feature-*.md, texteditor, How-To)
- 1 Test-Findings-Dokument (test-findings-2026-04-23.md)
- 1 Architektur-Korrektur (architecture-adapter-section-outdated.md)

## Bereits erledigt / Duplikate

| Item | Status |
|------|--------|
| BUG-MSGBUS (MessageBus ABI) | resolved — prestart-Hook |
| BUG-8NG1QN (MPO Button) | resolved — bereits implementiert |
| Q88ZHP + WVDTTM | Duplikat — zusammengefasst in C2 |

---

## Phase A: Stabilitaets-Sprint

Ziel: Kernfunktionalitaet absichern bevor neue Features gebaut werden.

### A1 — MCP Session Lifecycle (HIGH)
**Quelle:** BUG-2026-04-22-A29FD6

MCP-Sessions werden nach `/clear` oder Context-Compression zu Zombies. Orchestrator verliert MCP-Tools.

**Fixes:**
- Session Timeout GC (30 min Inaktivitaet → Session entfernen)
- Graceful Re-Initialize bei unbekannter Session-ID (statt 404)
- Session-Limit pro Client (max 3 parallele Sessions)
- `/health` Endpoint fuer Monitoring

**Dateien:** `src/main/mcp/mcp-server.ts`, `src/main/mcp/mcp-tools.ts`

### A2 — Session Recovery unvollstaendig (HIGH)
**Quelle:** BUG-2026-04-22-ZACT8J

Beim App-Start werden nur 2 von 6 tmux-Sessions im Dialog angezeigt. Recovery-Logik findet nicht alle Sessions.

**Dateien:** `src/main/session/session-manager.ts`

### A3 — `--dangerously-skip-permissions` hardcoded (HIGH)
**Quelle:** test-findings-2026-04-23

`ClaudeCodeAdapter.buildLaunchCommand()` hat das Flag hardcoded. Muss konfigurierbar sein (ConfigStore Setting, Default: off).

**Dateien:** `src/main/agent/claude-code-adapter.ts`, `src/main/config/config-store.ts`

### A4 — Context-Usage stuck bei 0% (HIGH)
**Quelle:** test-findings-2026-04-23

StatusLine-Hook liefert keine Daten. Context-Budget im PaneHeader und auf Cards zeigt immer 0%.

**Dateien:** `src/main/monitoring/statusline-monitor.ts`, `src/main/monitoring/statusline-hook.ts`

### A5 — Terminal-Rendering MPO zerfaellt (MEDIUM)
**Quelle:** BUG-2026-04-22-TNDXR0

Zeilen brechen auseinander / Text-Wrapping-Glitches in xterm.js bei aktiver MPO-Session. Moeglicherweise Resize-/Reflow-Issue bei dynamischer Grid-Aenderung.

**Dateien:** `src/renderer/components/TerminalPane.tsx`, `src/renderer/hooks/useTerminal.ts`

---

## Phase B: Theme-System (10 Themes + Picker)

Ziel: Von 2 Themes auf 10, mit Settings-Picker und korrekten Terminal-Paletten. Loest gleichzeitig BUG-DDEKTM (Terminal-Farben zu grell).

**Quellen:** CipherMux-design-set.zip (Teil 1), BUG-2026-04-23-DDEKTM

Fertige Assets im Handoff-Ordner:
- `themes/theme-*.css` — 10 CSS-Dateien (Token-kompatibel)
- `themes.json` — Master-Manifest mit Swatches, Tokens, ANSI
- `src-snippets/terminal-themes.generated.ts` — xterm.js Paletten
- `settings-theme-picker.html` — UI-Mockup

### B1 — CSS-Dateien integrieren
10 Theme-CSS-Dateien nach `src/renderer/styles/` kopieren. Existierende `theme-ivory.css` und `theme-dark.css` als `_original`-Backup behalten — die neuen Dateien kommen daneben. Falls die neuen inhaltlich identisch sind, einfach die alten durch die neuen ersetzen (umbenennen).

### B2 — Manifest + Terminal-Themes
`themes.json` nach `src/renderer/`, `terminal-themes.generated.ts` nach `src/shared/`.

### B3 — useTheme.ts umstellen
Von `body.theme-dark` Toggle auf `document.body.dataset.theme = themeId`. Legacy-Check: `grep -r "body.theme-dark" src/` — falls Referenzen existieren, `body.theme-dark` Klasse weiter-setzen als Compat-Shim.

### B4 — ThemeName Type erweitern
```typescript
export type ThemeName =
  | 'cipher-ivory' | 'cipher-dark'
  | 'blueprint' | 'warm-paper'
  | 'gruvbox-dark' | 'nord'
  | 'synthwave' | 'matrix'
  | 'brutalist' | 'high-contrast'

export const LEGACY_THEME_ALIASES: Record<string, ThemeName> = {
  'ivory': 'cipher-ivory',
  'dark': 'cipher-dark',
}
```

### B5 — getTerminalTheme() aus Generated TS
Ersetzt hardcoded Palette durch Lookup in `terminal-themes.generated.ts`. Loest DDEKTM — jedes Theme hat seine eigene ANSI-Palette, keine grellen Farben mehr im Dark-Modus.

### B6 — Theme-Picker UI
Neue Sektion in `InfoSettingsView.tsx` (Settings-Tab). Radiogroup mit 8-Farb-Swatch-Streifen pro Theme. Live-Preview bei Klick. Markup nach `settings-theme-picker.html` Mockup.

### B7 — StatusBar Theme-Label
Zeigt Theme-Name aus `themes.json` statt "ivory/dark". Klick oeffnet Settings.

### B8 — Config-Migration + Tests
Legacy-Aliases mappen, Schema-Validation auf `themes.json`, alle 10 Theme-IDs muessen valides Terminal-Theme liefern.

---

## Phase C: Window & Grid Layout (groesstenteils erledigt)

Ziel: Fenstergroesse reagiert auf Grid-Config, Panels quetschen keine Sessions.

### C1 — Fensterhoehe aus Grid-Config (DONE)
**Quelle:** BUG-2026-04-22-HEIGHT-REGRESSION

5 Root-Causes:
1. `resizable: false` in window-manager.ts → `resizable: true`
2. Initial Height ignoriert Row-Count → berechnen aus `rows * targetCellHeight + chrome`
3. `targetCellHeight = 200` zu klein → `Math.max(MIN, screenHeight / rows)`
4. `minHeight: 600` hardcoded → dynamisch aus Grid-Config
5. CSS `overflow: auto` auf `.session-grid-area` → `overflow: hidden`

**Dateien:** `src/main/window-manager.ts`, `src/main/ipc-hub.ts`, `src/renderer/styles/grid.css`, `src/shared/constants.ts`

### C2 — InputRequests-Panel expandiert Fenster (DONE)
**Quelle:** BUG-2026-04-22-Q88ZHP + BUG-2026-04-23-WVDTTM

Sessions-Breite bleibt fix. Wenn InputRequests-Panel oeffnet, muss das Fenster breiter werden statt Sessions zu quetschen.

**Dateien:** `src/main/window-manager.ts`, `src/renderer/app.tsx`

### C3 — Voice-Toggle: Emoji → CSS-Toggle (DONE)
**Quelle:** BUG-2026-04-23-BH1ESP

Aktuell Mikrofon-Emoji-Button. Soll ein CSS-Toggle-Switch werden wie in cipher-desktop-electron. Regel: "CSS art yes, emoticons/emoji — no way."

**Dateien:** `src/renderer/components/StatusBar.tsx`, `src/renderer/styles/components.css`

### C4 — MPO + Orchestrator in Session-Liste mit Farbmarkierung (offen)
**Quelle:** BUG-2026-04-23-AA0R7N

Beide als Links in der Session-Liste unten rechts. Visuell hervorgehoben mit Farbe (Orchestrator: orange, MPO: gruen) um sie als cipher-mux-eigene Komponenten zu kennzeichnen.

**Dateien:** `src/renderer/components/StatusBar.tsx`

---

## Phase D: Workspaces + Personas

Ziel: Gespeicherte Session-Grids mit wiederverwendbaren Rollen, Prompt-Aufloesungslogik, Grid-Editor.

**Quellen:** CipherMux-design-set.zip (Teil 2), feature-requests-next (Workspaces)

Fertige Assets:
- `personas.js` — Referenz-Datenmodell (Plain JS, localStorage → portieren auf ConfigStore)
- `settings-personas.html` — Mockup Personas-Tab
- `settings-workspaces.html` — Mockup Grid-Editor mit Merge-Handles
- `workspaces-popup.html` — Mockup Appbar-Popup
- `workspaces.css` — Shared Design-Tokens

### D1 — Datenmodell
```typescript
interface Persona {
  id: string
  name: string
  color: string
  defaultPrompt: string
  builtin?: boolean
}

interface WorkspaceCell {
  persona: string    // persona.id
  project: string    // Projekt-Path/Slug
  prompt: string     // per-cell override
}

interface Workspace {
  id: string
  name: string
  cols: number       // 1..10
  rows: number       // 1..6
  cells: WorkspaceCell[]  // row-major, length === cols*rows
  merges: Record<string, true>  // "col:row" → merged DOWN
  promptOverrides: Record<string, string>  // personaId → workspace prompt
  panelDetached: { sessions: boolean; requests: boolean }
}
```

Built-in Personas (immutable ID, nur defaultPrompt editierbar):
- `orchestrator` — `#B8601A`
- `mpo` — `#2d8a4e`
- `worker` — `#6A6A72`
- `empty` — neutral (Platzhalter)

Zusaetzliche Seed-Personas (custom, editierbar, loeschbar):
- `requirements-engineer` — Anforderungsanalyse, Stakeholder-Interviews, Requirements-Dokumente
- `system-engineer` — Systemarchitektur, Integrationen, Infrastruktur, Deployment
- `developer` — Feature-Implementierung, Code schreiben, Debugging
- `architect` — Technische Entscheidungen, ADRs, Systemdesign, Patterns
- `auditor` — Quality-Checks, Whitehat Security-Audit, Code-Review, OWASP, Best Practices

Diese Personas werden als eigene Development-Tasks implementiert (D13-D17). Jede bekommt einen auf die Taetigkeit zugeschnittenen `defaultPrompt` der die Rolle funktional beschreibt. Tiefere Persona-Auspraegung (Stil, Ton, Haltung) folgt spaeter.

**Dual-Use-Architektur:** Personas sind nicht nur fuer Workspace-Spawning. Jede Persona wird zusaetzlich als **Claude Code Skill** bereitgestellt (`.claude/skills/personas/`), der auf die Persona-Daten im ConfigStore referenziert. So kann jede Persona jederzeit in einer bereits laufenden Session per `/persona-<name>` geladen werden — unabhaengig davon ob die Session aus einem Workspace stammt oder manuell gestartet wurde.

Skill-Mechanik:
- Skill liest den aktuellen `defaultPrompt` der Persona aus ConfigStore (via MCP-Tool oder generierte Datei)
- Aenderungen am Prompt im Personas-Editor wirken sich beim naechsten Skill-Aufruf aus
- Built-in und Custom Personas bekommen beide einen Skill
- Skills werden beim App-Start / Persona-CRUD automatisch synchronisiert

### D2 — ConfigStore Erweiterung
3 neue Keys: `personas`, `workspaces`, `activeWorkspaceId`. Migration seeded Built-in-Personas + Default-Workspace.

### D3 — Prompt-Aufloesung
```
1. cell.prompt (nicht leer)              → verwenden [source: 'cell']
2. workspace.promptOverrides[persona]    → verwenden [source: 'workspace-override']
3. persona.defaultPrompt                 → verwenden [source: 'persona-default']
```
Inspector-UI zeigt aktive Quelle an.

### D4 — Merge-Logik
Nur vertikale Merges. `spanOf(ws, col, row)` → 1 (normal), 2+ (Top), 0 (hidden). CSS Grid: `grid-row: N / span K`.

### D5 — Settings-Tab "Personas"
Linke Liste + rechts Edit-Panel. Built-ins: Name/Farbe/Delete gelockt, nur Prompt editierbar. Custom: voller CRUD. Usage-Footer zeigt referenzierende Workspaces. Mockup: `settings-personas.html`.

### D6 — Settings-Tab "Workspaces"
Grid-Editor mit Dim-Stepper (Cols 1..10, Rows 1..6), Merge-Handles (6px untere Kante, Hover → Accent-Linie, Klick → merge/unmerge), Cell-Inspector (Persona-Select, Project-Select, Prompt-Textarea mit Source-Note), Persona Prompt Overrides Sektion. Mockup: `settings-workspaces.html`.

### D7 — Workspace-Popup (Appbar unten links)
Schnell-Picker mit Mini-Thumbnails in Persona-Farben. Name + Subline (`cols x rows, N slots`). Persona-Legende. Double-Click oder Load-Button → Workspace anwenden. Footer: `personas...`, `edit...`, `load`. Mockup: `workspaces-popup.html`.

### D8 — Apply-Logik
1. Fehlende Personas → Zellen fallen auf `empty` + Toast
2. Nicht-empty Zellen → tmux-Session im Projekt-cwd spawnen
3. Aufgeloester Prompt beim Boot injizieren
4. Merge-Topologie auf Grid anwenden
5. `activeWorkspaceId` persistieren

### D9 — Tests
`resolvePrompt` alle 3 Quellen, `spanOf` 1x/2x/3x Merges, Persona-Delete-Fallback, Config-Migration, Workspace-Apply Edge Cases.

### D10 — Detachable Panels: Sessions-Seite
Button oben rechts im Panel-Header. Klick → Panel oeffnet in eigenem skalierbarem BrowserWindow (Default: App-Groesse). Im eigenen Fenster hat der Button umgekehrte Funktion: wieder integrieren.

### D11 — Detachable Panels: InputRequests
Gleiche Mechanik wie D10 fuer das InputRequests-Panel.

### D12 — Detach-State Persistenz
Zustand `panelDetached: { sessions: boolean, requests: boolean }` als Workspace-Parameter. Beim naechsten Oeffnen geht das Panel so auf wie zuletzt gewaehlt.

### D13 — Persona + Skill: Requirements Engineer
Seed-Persona mit `defaultPrompt` fuer: Anforderungserhebung, strukturierte Interviews, User Stories, Akzeptanzkriterien, Requirements-Dokumente (docs/requirements.md), Stakeholder-Kommunikation.
Skill: `/persona-requirements-engineer` — laedt die Rolle in jede laufende Session.

### D14 — Persona + Skill: System Engineer
Seed-Persona mit `defaultPrompt` fuer: Systemarchitektur-Umsetzung, Infrastruktur, CI/CD, Deployment, Integrationen zwischen Subsystemen, Monitoring, Performance.
Skill: `/persona-system-engineer`

### D15 — Persona + Skill: Developer
Seed-Persona mit `defaultPrompt` fuer: Feature-Implementierung, TDD, Debugging, Code schreiben der funktioniert und lesbar ist, Tests, kleine fokussierte Commits.
Skill: `/persona-developer`

### D16 — Persona + Skill: Architect
Seed-Persona mit `defaultPrompt` fuer: Technische Entscheidungen (ADRs), Systemdesign, Patterns, API-Design, Abhaengigkeitsanalyse, Trade-off-Bewertungen, Spezifikationen.
Skill: `/persona-architect`

### D17 — Persona + Skill: Auditor (Quality + Whitehat)
Seed-Persona mit `defaultPrompt` fuer: Code-Review, Security-Audit (OWASP Top 10), Dependency-Checks, Test-Coverage-Analyse, Performance-Bottlenecks, Best-Practice-Compliance, Findings als strukturierte Reports.
Skill: `/persona-auditor`

### D18 — Persona-Skill-Sync
Automatische Synchronisation zwischen ConfigStore-Personas und `.claude/skills/personas/`-Dateien:
- App-Start: Skills fuer alle Personas generieren/aktualisieren
- Persona erstellt/editiert/geloescht im Editor → Skill-Datei wird erstellt/aktualisiert/entfernt
- Skill-Datei liest den aktuellen `defaultPrompt` — Aenderungen im Editor wirken beim naechsten `/persona-*` Aufruf
- Gilt fuer Built-in UND Custom Personas (User-erstellte Personas bekommen automatisch einen Skill)

---

## Phase E: Kommunikation

Ziel: Message Bus wird zum echten Kommunikationskanal, Sessions koennen direkt angesprochen werden.

### E1 — BUG: InputRequestWatcher disabled (HIGH)
**Quelle:** BUG-2026-04-23-INPUTREQ

`BRAND.inputRequestsPath` ist leer weil `BUILD_PROFILE=cipher` nicht gesetzt oder Profil-Aufloesung fehlschlaegt.

**Fix:** Build-Config fixen (package.json Scripts + electron-builder) + Warn-Logging bei leerem Pfad.

**Dateien:** `src/shared/brand.ts`, `src/main/ipc-hub.ts`, `package.json`

### E2 — mux_send Push-Delivery
**Quelle:** message-bus-push-delivery.md

`mux_send` erhaelt optionale Parameter `sessionId`/`sessionName`. Wenn gesetzt, wird die Message zusaetzlich zur Bus-Persistierung via `tmux send-keys` in die Ziel-Session injiziert.

### E3 — Delivery-Mechanik
- Readiness-Check vor Injection (tmux capture-pane, Claude-Prompt sichtbar?)
- Text-Escaping fuer tmux send-keys
- Base64-Encoding fuer Messages >500 chars
- Response um `delivered: true/false` erweitern

### E4 — Visible Sessions
**Quelle:** feature-requests-next

`mux_create_session` mit `visible: true` Modus. Session erscheint im Grid, Fokus wechselt dorthin. Unterscheidung von Background-Workers.

### E5 — Sessions-Seite: Cards fuer Background-Sessions
**Quelle:** feature-requests-next

Background-Sessions als Cards in der Sessions-Seite (ehem. Chatroom). Letzte Message sichtbar. Klick bringt Session ins Grid.

### E6 — Tests + Doku

---

## Phase F: Voice-Pipeline reparieren

Ziel: Voice funktioniert wieder im Dev-Build, Bugreport-Interview mit TTS.

### F1 — Native Modules kompilieren (MEDIUM)
**Quelle:** BUG-2026-04-23-BH1ESP + test-findings

whisper.node / sherpa-onnx fuer Electron Dev-Build kompilieren. Fehlermeldung "Voice not available — native modules mi..." beheben.

### F2 — Bugreport-Dialog: Voice-Modus + TTS (MEDIUM)
**Quelle:** BUG-2026-04-23-26AH6N

Voice-Toggle aus Main-App im Bug-Dialog spiegeln. Speech-Bubbles sichtbar. TTS fuer Interview-Modus wiederherstellen (wurde beim Community-Refactoring entfernt).

---

## Phase G: Polish & Backlog

Priorisiert nach Bedarf, abhaengig von Phase A-F Ergebnissen.

| # | Item | Groesse | Quelle |
|---|------|---------|--------|
| G1 | Shell-Session Button (plain Terminal ohne Claude) | SMALL | feature-requests-next |
| G2 | Architecture-Doku aktualisieren (AgentAdapter) | SMALL | architecture-adapter-outdated |
| G3 | How-To in Info-Fenster integrieren | SMALL | How To Uebernehmen |
| G4 | Notes-Editor als Grid-Zellen-Option | MEDIUM | texteditor integrieren |
| G5 | LLM-Provider Settings (Bug-Assistant) | MEDIUM | feature-llm-provider |
| G6 | .github/ Templates + CI + AppImage Config | MEDIUM | test-findings |
| G7 | Voice-Controlled App (erweitert) | LARGE | feature-voice-controlled |

---

## Abhaengigkeitsgraph

```
A (Stabilitaet) ─────→ B (Themes) ────→ C (Grid/Layout) ────→ D (Workspaces+Personas)
                  │                                                      │
                  └──→ E (Kommunikation) ←───────────────────────────────┘
                  │
                  └──→ F (Voice) ── parallel zu C/D/E ──────────────────→ G (Backlog)
```

- **A** ist Voraussetzung fuer alles
- **B** vor C (Theme-Tokens muessen stehen bevor Grid-Layout angepasst wird)
- **C** vor D (Grid-Bugs muessen gefixt sein bevor Workspace-Editor darauf aufbaut)
- **E** und **F** sind unabhaengig und koennen parallel zu C/D laufen
- **G** ist nach Bedarf, wenn A-F stehen

## Geschaetzter Umfang

| Phase | Dateien | Charakter |
|-------|---------|-----------|
| A: Stabilitaet | ~15 | Bugfixes, defensiver Code |
| B: Themes | ~20 | Groesstenteils Copy+Wire, fertige Assets |
| C: Grid/Layout | ~8 | Window-Management, CSS |
| D: Workspaces | ~25 | Groesstes Feature, neues Subsystem |
| E: Kommunikation | ~10 | MCP-Erweiterung, Bus-Upgrade |
| F: Voice | ~5 | Native Module Build, TTS Restore |
| G: Backlog | variabel | Nach Bedarf |
