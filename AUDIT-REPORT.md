# Audit Report — cipher-mux-electron

**Datum:** 2026-05-11
**Version:** 0.9.995 (commit `a65488e`, HEAD)
**Vorheriger Audit:** 2026-05-03 (commit `5e506b5`, v0.9.99)
**Auditor:** Cipher (cipher-mux Audit Entity)
**Scope:** Welle-Audit — 30 Commits seit letztem Audit, Fokus auf neue Features und Security

---

## Zusammenfassung

cipher-mux ist auf ~48.300 LOC (226 Source-Dateien) gewachsen. Seit dem letzten Audit kamen **Detachable Windows**, **Grid Focus Mode**, **Session Tokens**, **Testing Collaboration**, umfangreiche **Voice/STT-Fixes** und eine **i18n-Vervollstaendigung** hinzu. Die Testsuite ist auf **1497 Tests / 0 Failures** gewachsen (+290 Tests). Die drei kritischsten Security-Findings (Timing Attack, Path Traversal, Body Size Limit) wurden noch waehrend des Audits vom Debugger gefixt und committed.

Das Projekt ist in gutem Zustand. Die architektonischen Grundlagen halten der Feature-Last stand. Die Hauptbaustelle ist die ipc-hub God-File-Tendenz (jetzt 2979 LOC) und die veraltete ARCHITECTURE.md.

---

## Bewertungstabelle

| Bereich | Note | Trend | Kommentar |
|---------|------|-------|-----------|
| Security | **B+** | = | 3 Findings waehrend Audit gefixt. Sandbox-Frage bleibt offen. |
| Code Quality | **B** | -0.5 | ipc-hub +25%, DetachedNoteView Save-Path hat Silent Failures. |
| Testing | **A** | = | 1497 Tests, 0 Failures, +290 neue Tests. Gute Edge-Case-Abdeckung. |
| Dokumentation | **B+** | -0.5 | ARCHITECTURE.md veraltet (v0.9.9). README fehlt Detach-Feature. |

---

## Security Findings

### S-001 — Timing Attack in Bearer Auth
**Schweregrad:** HIGH → **FIXED** (commit `a65488e`)
**Datei:** `src/main/mcp/mcp-auth.ts:18`
**Beschreibung:** `parts[1] === apiKey` war anfaellig fuer Timing-Side-Channel-Attacks.
**Fix:** `crypto.timingSafeEqual()` mit Laengenvergleich davor. Korrekt implementiert.

### S-002 — Path Traversal in mux_ideation_skill_run
**Schweregrad:** HIGH → **FIXED** (commit `a65488e`)
**Datei:** `src/main/mcp/mcp-tools.ts:1946-1957`
**Beschreibung:** `args.skillId` wurde unvalidiert in `path.join()` verwendet. MCP-Client konnte beliebige Dateien lesen.
**Fix:** Regex-Validierung (`/^[a-zA-Z0-9_-]+$/`) + Pfad-Containment-Check. Korrekt implementiert.

### S-003 — No Request Body Size Limit
**Schweregrad:** MEDIUM → **FIXED** (commit `a65488e`)
**Datei:** `src/main/mcp/mcp-server.ts:239-240`
**Beschreibung:** POST-Body wurde ohne Groessenlimit akkumuliert.
**Fix:** 10MB Limit mit `req.destroy()` bei Ueberschreitung. `aborted`-Flag verhindert Doppel-Response. Sauber.

### S-004 — `sandbox: false` auf allen BrowserWindows (Carry-Over)
**Schweregrad:** MEDIUM
**Datei:** `src/main/window-manager.ts:57, 150, 195, 299`
**Beschreibung:** Vier BrowserWindows (main, workspaces, sidebar, NEU: detached) setzen `sandbox: false`. Betrifft jetzt auch Pop-Out-Fenster. `contextIsolation: true` und `nodeIntegration: false` sind aktiv.
**Kontext:** Vermutlich wegen better-sqlite3 im Preload. SECURITY.md dokumentiert die Entscheidung bereits.
**Empfehlung:** Weiterhin pruefen ob sandbox: true moeglich ist. Kein Blocker.

### S-005 — Keine Integritaetspruefung bei Voice-Model-Downloads
**Schweregrad:** MEDIUM
**Datei:** `src/main/voice/voice-downloader.ts:73-85`
**Beschreibung:** .onnx-Modelle von HuggingFace werden per HTTPS heruntergeladen, aber ohne SHA256-Validierung geladen.
**Kontext:** HTTPS schuetzt die Verbindung. Fuer ein Desktop-Tool akzeptables Risiko. Checksum waere Defense-in-Depth.
**Empfehlung:** SHA256-Hashes fuer bekannte Modelle hardcoden oder aus HuggingFace-Metadata abrufen.

### S-006 — Health-Endpoint ohne Auth (Carry-Over)
**Schweregrad:** LOW
**Datei:** `src/main/mcp/mcp-server.ts:212-219`
**Beschreibung:** `/health` leakt Session-Count und Uptime ohne Auth. Nur auf localhost erreichbar.
**Status:** Bewusste Design-Entscheidung. In SECURITY.md dokumentiert.

### S-007 — TTS Temp-File mit vorhersagbarem Namen
**Schweregrad:** LOW
**Datei:** `src/main/voice/voice-manager.ts:477`
**Beschreibung:** `cipher-mux-tts-${Date.now()}.wav` im tmpdir. Vorhersagbar, aber nur lokal relevant.
**Empfehlung:** `fs.mkdtempSync()` waere sauberer. Kein Blocker.

### S-008 — npm audit: 18 Vulnerabilities in DevDeps
**Schweregrad:** LOW
**Beschreibung:** Alle in electron-builder → tar → cacache Chain. Kein Runtime-Impact. Upgrade auf electron-builder 26.x wuerde sie beheben (Breaking Change).

### S-009 — CORS: Verbessert seit letztem Audit
**Schweregrad:** INFO (FIXED)
**Beschreibung:** Von `Access-Control-Allow-Origin: *` auf localhost-only Regex. Korrekt implementiert.

### S-010 — config.json Permissions
**Schweregrad:** INFO (FIXED)
**Beschreibung:** `0o600` Permissions werden beim Schreiben gesetzt. Fix aus letztem Audit verifiziert.

### S-011 — Credential Filter funktional
**Schweregrad:** INFO (OK)
**Beschreibung:** `CREDENTIAL_PATTERNS` in memory-store.ts fangen Secrets ab. Kein Bypass gefunden.

---

## Code Quality Findings

### Q-001 — ipc-hub.ts God-File (2979 LOC, +25%)
**Schweregrad:** MEDIUM
**Beschreibung:** Von 2389 auf 2979 LOC gewachsen. Importiert ~60 Module. Feature-getrieben (Detach, Voice Relay, Grid Focus), nicht Spaghetti — aber das Limit ist erreicht.
**Extraktions-Kandidaten:**
- `WorkspaceResolver` — Workspace-Lookup mit identischem `(workspaces as any[]).find()` Pattern taucht 6x auf
- `GridSnapshotManager` — Keep-Working-Snapshot-Logik (destroy + restore)
- Handler-Gruppen (Notes, Voice, Grid) in separate Dateien
**Empfehlung:** WorkspaceResolver-Extraktion als Quick Win (eliminiert 6x `as any`). Rest nach Bedarf.

### Q-002 — DetachedNoteView: Silent Save Failures
**Schweregrad:** MEDIUM
**Datei:** `src/renderer/components/DetachedNoteView.tsx:83-95`
**Beschreibung:** `handleSave()` hat kein Error-Handling — wenn der Save fehlschlaegt, bekommt der User kein Feedback. `beforeunload`-Flush ist unwaited (Save kann vor Window-Close nicht fertig werden).
**Empfehlung:** try/catch mit Error-State in handleSave. beforeunload kann nicht awaited werden (Browser-Limitation), aber ein Dirty-Flag mit Warnung waere moeglich.

### Q-003 — 101x `as any` in src/main/
**Schweregrad:** LOW
**Aufschluesselung:**
- 58x in mcp-tools.ts (MCP SDK TS2589 Workaround, dokumentiert)
- 20x in ipc-hub.ts (Workspace/Grid Casts, extrahierbar)
- 23x Rest (verteilt, ueberwiegend akzeptabel)
**Trend:** Stabil. Kein Anstieg der "echten" Any-Casts.

### Q-004 — mcp-tools.ts: Gut organisiert (2085 LOC)
**Schweregrad:** INFO
**Beschreibung:** 58 Tools in logischen Gruppen. Zod-Validierung konsistent. Die Datei ist gross, aber gut strukturiert. Kein unmittelbarer Handlungsbedarf.

### Q-005 — Voice Pipeline: Sauber (583 LOC)
**Schweregrad:** INFO
**Beschreibung:** Graceful Degradation (Piper → Re-Init → macOS Say). Process-Cleanup robust. Voice-Swap-Queue hat einen theoretischen Edge Case (release! non-null assertion), aber praktisch sicher.

---

## Testing Findings

### T-001 — 1497 Tests, 0 Failures
**Rating:** A
**Beschreibung:** +290 Tests seit letztem Audit. 142 Test-Dateien, 302 Suites. Laufzeit ~91s.

### T-002 — Neue Tests fuer neue Features
- Detachable Windows: 6 Tests (grid-slot-state, ipc-routing, keep-working-persistence, view-routing, window-registry, workspace-block)
- Entity Registry: 14 Tests
- Grid Focus Mode: Abgedeckt in grid-slot-state
- Voice Downloader: 10 Tests (URL-Building, Deletion, Name-Parsing)

### T-003 — Luecken bei Security-kritischem Code
**Schweregrad:** MEDIUM
- `mcp-auth.ts` (validateBearer, generateApiKey) hat **keine Unit-Tests**. Wird indirekt durch MCP-Lifecycle-Tests abgedeckt, aber Security-kritische Funktionen verdienen eigene Tests.
- `window-manager.ts` hat keine Unit-Tests fuer Grid-Sizing und Detach-Lifecycle.
**Empfehlung:** 5 min fuer mcp-auth Tests, 30 min fuer window-manager Tests.

---

## Dokumentation Findings

### D-001 — ARCHITECTURE.md veraltet (v0.9.9)
**Schweregrad:** MEDIUM
**Beschreibung:** Kein WindowManager-Subsystem, kein Detach, keine Voice-Methoden, kein TTS Focus Gate dokumentiert.
**Empfehlung:** Update auf v1.0.0 mit neuen Subsystemen.

### D-002 — README fehlt Detachable Windows
**Schweregrad:** LOW
**Beschreibung:** Key Feature nicht in Feature-Liste erwaehnt. Ein Einzeiler unter "Focus Mode" wuerde reichen.

### D-003 — JSDoc-Luecken bei neuen Public APIs
**Schweregrad:** LOW
**Dateien:** `window-manager.ts` (openDetachedWindow, closeDetachedWindow), `voice-manager.ts` (hotSwapVoice, initPiperOnly)
**Beschreibung:** Public Methoden ohne JSDoc.

### D-004 — docs/retest-2026-05-09.md ist stale
**Schweregrad:** INFO
**Beschreibung:** Internes QA-Dokument, referenziert entfernte Features. Aufraeum-Kandidat.

---

## Top-5 Empfehlungen

| # | Prioritaet | Finding | Aufwand | Status |
|---|-----------|---------|---------|--------|
| 1 | **Erledigt** | S-001/S-002/S-003: Timing Attack, Path Traversal, Body Limit | — | Fixed in `a65488e` |
| 2 | **Hoch** | Q-002: DetachedNoteView Save Error-Handling | 30 min | Offen |
| 3 | **Hoch** | D-001: ARCHITECTURE.md auf v1.0 updaten | 1-2h | Offen |
| 4 | **Mittel** | T-003: Unit-Tests fuer mcp-auth.ts | 5 min | Offen |
| 5 | **Mittel** | Q-001: WorkspaceResolver extrahieren | 1h | Offen |

---

## Positiv-Findings

- **Security-Fixes waehrend Audit**: 3 HIGH/MEDIUM Findings vom Debugger verifiziert und gefixt bevor der Report fertig war. Audit-Debugger-Pipeline funktioniert.
- **CORS verbessert** seit letztem Audit (von `*` auf localhost-only).
- **config.json 0o600** seit letztem Audit gefixt.
- **Credential Filter** weiterhin robust, kein Bypass gefunden.
- **sendKeys Hex-Encoding** (`send-keys -H`) neutralisiert Command Injection komplett.
- **execFile statt Shell** durchgehend (ausser dokumentierte Hooks-Ausnahme).
- **1497 Tests** — beeindruckend fuer ein Projekt dieser Groesse. Edge-Case-Abdeckung gut.
- **Detach-Windows** architektonisch sauber (contextIsolation, encodeURIComponent, Bounds-Persistence).
- **Voice Graceful Degradation** (Piper → Re-Init → macOS Say) robust implementiert.
- **i18n-Vervollstaendigung** (de/en) reduziert hardcoded Strings im Renderer.
- **Profile-System** weiterhin sauber getrennt (cipher vs. community).

---

## Anhang

### Projekt-Steckbrief

| Eigenschaft | Wert | Delta |
|-------------|------|-------|
| Sprache | TypeScript (100%) | — |
| Framework | Electron 34 + Preact 10 | — |
| Build | Vite (Renderer) + tsc (Main) | — |
| Paketierung | electron-builder | — |
| DB | better-sqlite3 (WAL mode) | — |
| MCP | @modelcontextprotocol/sdk (Streamable HTTP) | — |
| Lizenz | MIT | — |
| LOC (src/) | ~48.300 | +5.500 |
| Source-Dateien | 226 | +24 |
| Tests | 1497 (node:test + tsx) | +290 |
| Dependencies (prod) | 12 | — |
| Dependencies (dev) | 15 | — |

### Audit-Methodik

- Welle-Audit: 30 Commits seit 5e506b5 (2026-05-03 bis 2026-05-11)
- Parallele Sub-Agent-Exploration fuer MCP, Voice, Dependencies, Code Quality, Tests, Docs
- Manuelle Verifikation aller HIGH/MEDIUM Findings mit File:Line-Referenzen
- npm audit, vollstaendiger Test-Lauf (1497/1497 pass)
- Debugger-Handoff fuer Fix-Verifikation und Implementation
- False-Positive-Pruefung (macOS Voice Injection, sendKeys Injection, noteId Traversal — alle drei als FP bestaetigt)

### Vergleich zum Vor-Audit

| Finding | Letzter Audit | Dieser Audit |
|---------|--------------|-------------|
| S-001 Sandbox | MEDIUM (offen) | MEDIUM (offen, +1 Window) |
| S-002 CORS | LOW | INFO (fixed) |
| S-003 npm audit | LOW (15 vulns) | LOW (18 vulns, gleiche Chain) |
| S-004 Health | INFO | LOW (unveraendert) |
| S-006 config.json | INFO | INFO (fixed) |
| Q-001 ipc-hub | MEDIUM (2389 LOC) | MEDIUM (2979 LOC) |
| Tests | 1207 | 1497 |
| LOC | ~42.800 | ~48.300 |

---

*Report generiert am 2026-05-11 von der cipher-mux Audit Entity (Run arun-01KR9T2R7M10WSFN1GNT8TC4DC).*
