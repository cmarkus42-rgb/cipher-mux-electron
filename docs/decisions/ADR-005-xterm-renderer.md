# ADR-005: xterm.js Renderer

**Status:** Entschieden
**Datum:** 2026-04-13
**Betrifft:** SPEC.md Abschnitt 2 (Terminal Panes), Abschnitt 8 (Performance)

## Kontext

xterm.js bietet drei Rendering-Backends. Bei bis zu 10 parallelen Terminal-Panes mit High-Frequency-Output ist die Renderer-Wahl performance-kritisch.

## Optionen

### Option A: WebGL mit Canvas-Fallback

`@xterm/addon-webgl` als Primary, `@xterm/addon-canvas` als Fallback bei `webglcontextlost`.

- **Vorteile:**
  - 3-5x schneller als Canvas, ~10x schneller als DOM
  - GPU-beschleunigt (macOS Metal via WebGL2)
  - Automatischer Fallback bei GPU-Problemen
  - Best Practice: iTerm2, Hyper Terminal nutzen GPU-Rendering
- **Nachteile:**
  - Zwei Addons als Dependencies
  - WebGL-Context-Limit pro Fenster (~16 Contexts) — bei 10 Terminals knapp
  - `webglcontextlost` Recovery-Logik nötig
- **Risiko:** niedrig (Canvas-Fallback fängt GPU-Probleme ab)

### Option B: Canvas only

`@xterm/addon-canvas` als einziger Renderer.

- **Vorteile:**
  - Einfacher (ein Addon, keine Fallback-Logik)
  - Kein WebGL-Context-Limit-Problem
  - Ausreichend performant für moderate Output-Raten
- **Nachteile:**
  - Langsamer als WebGL bei High-Frequency-Output
  - CPU-basiert (keine GPU-Beschleunigung)
- **Risiko:** niedrig

### Option C: DOM (Default)

Kein Addon, xterm.js Default-Renderer.

- **Vorteile:** Keine zusätzlichen Dependencies
- **Nachteile:** Langsamstes Rendering, nicht geeignet für 10 parallele Terminals
- **Risiko:** hoch (Performance bei Multi-Terminal)

## Empfehlung

**Option A: WebGL mit Canvas-Fallback**

Das Performance-Ziel (16ms Batch-Interval, UI responsiv bei `cat` grosser Dateien) erfordert GPU-Rendering. Das WebGL-Context-Limit (16) ist bei max 10 Terminals unkritisch. Die Fallback-Logik ist minimal:

```typescript
try {
  term.loadAddon(new WebglAddon())
} catch {
  term.loadAddon(new CanvasAddon())
}
term.loadAddon(new FitAddon())
```

## Entscheidung

**Option A: WebGL mit Canvas-Fallback** — GPU-beschleunigt, Canvas als Fallback bei webglcontextlost.

## Konsequenzen

- Dependencies: `@xterm/addon-webgl` + `@xterm/addon-canvas`
- `TerminalPane.tsx` implementiert try/catch Fallback-Pattern
- `useTerminal.ts` Hook handled `webglcontextlost` Event (Recovery: Canvas laden)
- Performance-Monitoring: Bei >5 WebGL-Contexts Warnung loggen
