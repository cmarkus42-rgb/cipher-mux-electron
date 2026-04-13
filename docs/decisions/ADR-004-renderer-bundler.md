# ADR-004: Renderer-Bundler

**Status:** Entschieden
**Datum:** 2026-04-13
**Betrifft:** SPEC.md Abschnitt 2 (Renderer), Abschnitt 8 (Build & Packaging)

## Kontext

Der Renderer nutzt Preact mit TSX-Komponenten. TSX erfordert einen Build-Step (Transpilation). Die Wahl des Bundlers beeinflusst Dev-Ergonomie (HMR, Build-Speed) und Production-Build-Qualität.

Referenz: cipher-desktop-electron nutzt keinen Bundler (Vanilla JS), was für TSX nicht möglich ist.

## Optionen

### Option A: Vite

- **Vorteile:**
  - Native ESM-basierter Dev-Server mit HMR (~100ms Updates)
  - `@preact/preset-vite` Plugin (out-of-the-box Preact + TSX)
  - Rollup-basierter Production-Build (Tree-Shaking, Code-Splitting)
  - Grosses Plugin-Ecosystem
  - Electron-Integration via `vite-plugin-electron` oder manuell
- **Nachteile:**
  - Eine zusätzliche Dependency (~15MB node_modules)
  - Vite-Config für Electron braucht Anpassung (kein Browser-Target)
- **Risiko:** niedrig (bewährt, grosse Community)

### Option B: esbuild (direkt)

- **Vorteile:**
  - Extrem schnell (~10x schneller als Vite Production Build)
  - Minimale Config (ein CLI-Command)
  - Bereits transitive Dependency von Vite
  - Simpler: kein Dev-Server, kein Plugin-System
- **Nachteile:**
  - Kein HMR (manueller Rebuild + Electron-Reload)
  - Kein Plugin-Ecosystem
  - Tree-Shaking weniger ausgereift als Rollup
  - CSS-Handling limitiert (kein PostCSS out-of-the-box)
- **Risiko:** niedrig (aber schlechtere Dev-Experience)

### Option C: tsc + kein Bundler

- **Vorteile:** Keine zusätzliche Dependency
- **Nachteile:** Kein JSX-Runtime-Support ohne zusätzliche Config, kein Bundling, kein Tree-Shaking, kein HMR
- **Risiko:** hoch (nicht praktikabel für Preact + TSX)

## Empfehlung

**Option A: Vite**

HMR ist bei UI-Entwicklung ein massiver Produktivitätsgewinn — besonders bei einem Projekt mit 11+ Renderer-Komponenten. `@preact/preset-vite` macht die Preact-Integration trivial. Der Production-Build via Rollup ist ausgereifter als esbuild für Frontend-Bundles.

## Entscheidung

**Option A: Vite** — HMR für Dev-Ergonomie, @preact/preset-vite für triviale Preact-Integration.

## Konsequenzen

- `vite.config.ts` mit `@preact/preset-vite` Plugin
- Dev-Workflow: `vite dev` für Renderer + `tsc --watch` für Main Process
- Production: `vite build` erzeugt Bundle in `dist/renderer/`
- Electron-Builder packt `dist/renderer/` in die App
- npm scripts: `dev` startet beides parallel, `build` baut sequentiell
