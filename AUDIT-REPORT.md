# Audit Report — cipher-mux-electron v0.9.102

**Datum:** 2026-05-15
**Auditor:** Cipher (Audit Entity)
**Scope:** Welle (letzte 3 Tage, ~30 Commits) + Vollprojekt-Baseline
**Projekt:** Electron-basierte Kommandozentrale fuer Claude Code
**Stack:** TypeScript, Electron 34, Preact, xterm.js, better-sqlite3, MCP SDK, tmux
**Umfang:** 229 Source-Files, ~12.300 LoC, 142 Test-Files, 1494 Tests

---

## Rating-Uebersicht

| Bereich | Rating | Trend |
|---------|--------|-------|
| Security | B | Gleich |
| Architecture | B+ | Gleich |
| Error Handling | B | Gleich |
| Testing | B- | Gleich |
| Typing & Linting | C- | Verschlechtert (817 ESLint-Probleme) |
| AI Anti-Patterns | B+ | Gleich |
| Documentation | B+ | Gleich |
| **Gesamt** | **B-** | — |

---

## Security Findings

| # | Severity | Finding | Datei | Empfehlung |
|---|----------|---------|-------|------------|
| S1 | HIGH | Electron 34: 18 CVE-Advisories (Memory Corruption, IPC Bypass, ASAR Integrity) | package.json | Upgrade auf 42.x — eigenes Ticket angelegt |
| S2 | HIGH | tar <=7.5.10: Path Traversal via Symlinks | node-gyp dependency | Wird durch Electron-Upgrade ggf. mit geloest |
| S3 | MEDIUM | `.mcp.json` nicht in .gitignore — Bearer Token Leak-Risiko | .gitignore | `.mcp.json` und `*-mcp-connection.md` aufnehmen |
| S4 | MEDIUM | IPC-Handler ohne Runtime-Validierung (TypeScript-only) | src/main/ipc-hub.ts | Zod-Schemas an IPC-Boundary |
| S5 | MEDIUM | Session-IDOR: jeder Renderer kann jede Session lesen/schreiben | src/main/ipc-hub.ts | Ownership-Check (Single-User: LOW, Multi-Principal: HIGH) |
| S6 | MODERATE | Hono MCP-Server: JWT-Validation, Cache-Leakage, bodyLimit-Bypass | @hono dependency | Update Hono, bodyLimit pruefen |
| S7 | LOW | MCP-Tool-Handler vertrauen auf SDK-Validation | src/main/mcp/mcp-tools.ts | Explizites `zod.safeParse()` in Handlern |
| S8 | INFO | Bundled VAD-Assets ohne SRI-Hashes, Silero Legacy-Modell (2023) | src/renderer/public/vad-assets/ | Provenance dokumentieren |

### Was sauber ist

- Keine hardcoded Secrets, Credential-Filtering in Memory-Store aktiv
- `execFile` mit Array-Args — kein Command Injection
- SQLite durchgehend Prepared Statements — kein SQL Injection
- CSP restriktiv, contextIsolation=true, nodeIntegration=false
- MCP-Key: `crypto.randomBytes` + `timingSafeEqual`
- Path-Handling via `path.join()` — kein Path Traversal

---

## Code Quality Findings

### Architecture (B+)

| # | Severity | Finding | Datei |
|---|----------|---------|-------|
| A1 | MEDIUM | IpcHub: 3033 Zeilen, 65 Fields — Router-Facade, aber BT Shutter + Keep-Working extrahierbar | src/main/ipc-hub.ts |
| A2 | MEDIUM | app.tsx: 1490 Zeilen, 58 Hooks — Dialog-State extrahierbar | src/renderer/app.tsx |
| A3 | MEDIUM | Renderer importiert Runtime-Funktionen aus Main (`spanOf`, `resizeCells`) | src/renderer/components/WorkspacesTab.tsx:5 |

**Positiv:** Zero Circular Dependencies, saubere main/renderer/shared-Trennung, Registry-Pattern statt Dispatch-Sprawl.

### Error Handling (B)

| # | Severity | Finding | Datei |
|---|----------|---------|-------|
| E1 | LOW | ~40x `.catch(() => {})` im Renderer — stale State moeglich | src/renderer/app.tsx |
| E2 | LOW | `(window as any).cipherMux` an 10+ Stellen ohne Null-Check | src/renderer/app.tsx:85,98,115 |

**Positiv:** Main-Process konsequent mit try/catch + Logging auf allen kritischen Pfaden.

### Testing (B-)

| # | Severity | Finding | Datei |
|---|----------|---------|-------|
| T1 | MEDIUM | TmuxManager selbst untested (nur Parser) | src/main/tmux/tmux-manager.ts |
| T2 | MEDIUM | Renderer: 0 Unit Tests fuer 1490 Zeilen app.tsx | src/renderer/app.tsx |
| T3 | LOW | Migration-Test importiert nicht-existentes Script | test/main/migrate-to-cyber-factory.test.ts |

**Positiv:** 1494 Tests, 99.93% Pass Rate. Kritische Pfade (Session Recovery, MCP Auth, Companion Memory, Config Store) gut abgedeckt.

### Typing & Linting (C-)

| # | Severity | Finding | Datei |
|---|----------|---------|-------|
| L1 | HIGH | 817 ESLint-Probleme (476 Errors, 341 Warnings) — nicht enforced | src/ |
| L2 | MEDIUM | 247x `as any` (57 in mcp-tools.ts, 42 in app.tsx) | diverse |
| L3 | LOW | 4x `require()` in TypeScript statt ES6 import | src/main/bluetooth/bt-shutter-manager.ts |

**Positiv:** TypeScript strict mode aktiv, `tsc --noEmit` clean (0 Compile Errors).

---

## AI-Code Anti-Pattern Check

| # | Pattern | Gefunden | Severity | Trend |
|---|---------|----------|----------|-------|
| 1 | God Object | Teilweise | MEDIUM | Gleich — IpcHub ist Router-Facade, nicht Zustandsblob |
| 2 | Feature-Local Blindness | Nein | — | — |
| 3 | Conditional Dispatch Sprawl | Nein | — | Besser (Registry + Templates) |
| 4 | Positional Array Magic Numbers | Nein | — | — |
| 5 | Scope Creep | Teilweise | LOW | Kontrolliert (ADRs, ARCHITECTURE.md) |
| 6 | Concurrent State Mutation | Ja | MEDIUM | Neu — `inFlightEntityStarts` ohne Mutex |
| 7 | View-State Wrong Place | Teilweise | LOW | ~8 Dialog-lokale useState in app.tsx Root |
| 8 | Missing Architecture Before Code | Nein | — | ARCHITECTURE.md + 9 ADRs vorhanden |
| 9 | Flat Keymap | Nein | — | Context-aware Shortcut-Registry |

---

## Documentation Findings

| # | Severity | Finding | Datei |
|---|----------|---------|-------|
| D1 | HIGH | Broken Link: `ref/mcp-tools.md` existiert nicht, korrekt ist `docs/mcp-tools.md` | README.md:221 |
| D2 | MEDIUM | Version Badge zeigt 0.9.101, package.json ist 0.9.102 | README.md:16 |
| D3 | MEDIUM | Kein zentraler Config/Deployment-Guide (Env Vars, Pfade, Ports verstreut) | fehlt |
| D4 | LOW | "Orchestrator" vs "Workshop" Inkonsistenz | ARCHITECTURE.md |

**Positiv:** README, CHANGELOG, SECURITY.md, CONTRIBUTING.md, HOWTO.md alle vollstaendig und aktuell. ARCHITECTURE.md mit 25KB Tiefe. 9 ADRs. Keep Working Restore exzellent dokumentiert.

---

## Top-5 Empfehlungen

### 1. Electron 34 → 42 Upgrade (HIGH)
18 CVEs, davon Memory Corruption und IPC Bypass. Eigene Cyber-Factory-Session, nicht nebenbei. Note "Task: Electron 34→42 Upgrade" angelegt.

### 2. ESLint enforced machen (HIGH)
476 Errors die durchgehen. Pre-Commit Hook oder CI-Gate einrichten. `as any` in MCP-Tools via Type-Safe Wrapper reduzieren.

### 3. `.mcp.json` in .gitignore (MEDIUM — Quick Fix)
Bearer Token Leak-Risiko. 30 Sekunden Fix.

### 4. Broken README Link fixen (MEDIUM — Quick Fix)
`ref/mcp-tools.md` → `docs/mcp-tools.md`. Sofort machbar.

### 5. IPC-Boundary Zod-Validation (MEDIUM)
Runtime-Validierung an der Renderer→Main-Grenze. Schuetzt gegen Type Coercion und malformed Data.

---

## Appendix

### Dateien mit >500 Zeilen

| Datei | Zeilen | Bewertung |
|-------|--------|-----------|
| ipc-hub.ts | 3033 | Router-Facade, extrahierbar |
| mcp-tools.ts | 2122 | Tool-Registry, akzeptabel |
| session-manager.ts | 1642 | Session-Lifecycle, gerechtfertigt |
| app.tsx | 1490 | Layout-Root, Dialog-State extrahierbar |
| companion-guides.ts | 1269 | Content-Daten, generiert |
| companion-ref.ts | 890 | Content-Daten, generiert |
| NotesTreeView.tsx | 808 | UI-Komponente, Split-Kandidat |
| preload.ts | 636 | API-Gateway, akzeptabel |

### Dependency-CVE-Zusammenfassung

| Severity | Anzahl | Hauptverursacher |
|----------|--------|-----------------|
| HIGH | 12 | Electron (18 Advisories), tar (6 CVEs) |
| MODERATE | 4 | Hono (6), ip-address, PostCSS |
| LOW | 2 | Cacache (via tar) |
| **Gesamt** | **18** | — |

### Test-Verteilung

| Bereich | Test-Files | Abdeckung |
|---------|-----------|-----------|
| Main Process | 86 | Gut (Session, MCP, Companion, Config) |
| Hub | 9 | Gut |
| Debugger | 9 | Gut |
| Cyber Factory | 8 | Gut |
| Testing Assistant | 7 | Gut |
| Detachable Windows | 6 | Layout-Logik |
| Refinement | 4 | Gut |
| Ideation Partner | 4 | Gut |
| Companion | 3 | Gut |
| MCP | 2 | Basis |
| Audit | 2 | Basis |
| Shared | 1 | Minimal |
| Renderer | 0 | Fehlend |
