# Audit Report — cipher-mux-electron

**Datum:** 2026-05-03
**Version:** 0.9.99 (commit `5e506b5`)
**Auditor:** Relay (cipher-mux Audit Entity)
**Scope:** Pre-Release OSS Audit — Security, Code Quality, Dokumentation

---

## Zusammenfassung

cipher-mux ist ein substantielles Electron-Projekt (~42.800 LOC, 202 Source-Dateien) mit einer durchdachten Architektur: typisierte IPC-Kanäle, contextBridge-Isolation, Profile-System für OSS vs. Private, Zod-Validierung auf der MCP-Ebene, und ein Credential-Filter im Memory-Store. Die Testsuite ist mit **1207 Tests / 0 Failures** für ein Projekt dieser Größe beeindruckend.

Für eine OSS-Veröffentlichung ist das Projekt in gutem Zustand. Die gefundenen Issues sind überwiegend Hygiene- und Härtungs-Themen, keine architektonischen Schwächen.

---

## Bewertungstabelle

| Bereich | Note | Kommentar |
|---------|------|-----------|
| Security | **B+** | Solide Grundlagen (Bearer Auth, contextIsolation, CSP, kein nodeIntegration). Einige Härtungslücken. |
| Code Quality | **B+** | Klare Modulgrenzen, gute Tests, einige God-File-Tendenzen (ipc-hub 2389 LOC). |
| Dokumentation | **A-** | README, ARCHITECTURE, CONTRIBUTING, SECURITY, HOWTO, ADRs — alles vorhanden und konsistent. |
| Testing | **A** | 1207 Tests, 0 Failures, ~90s Laufzeit. Starke Abdeckung für Main-Process-Logic. |

---

## Security Findings

### S-001 — `sandbox: false` in allen BrowserWindows
**Schweregrad:** MEDIUM
**Datei:** `src/main/window-manager.ts:56, 129, 174`
**Beschreibung:** Alle drei BrowserWindows (main, workspaces, sidebar) setzen `sandbox: false`. Das deaktiviert die Chromium-Sandbox für den Renderer-Process. Obwohl `contextIsolation: true` und `nodeIntegration: false` aktiv sind, reduziert `sandbox: false` die Defense-in-Depth.
**Warum ist es so:** Vermutlich wegen `better-sqlite3` native module im Preload oder weil die Preload-Scripts nicht sandbox-kompatibel sind.
**Empfehlung:** Prüfen ob `sandbox: true` mit dem aktuellen Preload-Setup funktioniert. Falls nicht möglich: im SECURITY.md dokumentieren warum.

### S-002 — CORS `Access-Control-Allow-Origin: *`
**Schweregrad:** LOW
**Datei:** `src/main/mcp/mcp-server.ts:197`
**Beschreibung:** Der MCP-Server erlaubt CORS von allen Origins. Da der Server nur auf `127.0.0.1` bindet UND Bearer-Auth erfordert, ist das Risiko gering — aber eine bösartige Website könnte theoretisch Requests an localhost:3100 schicken (der Bearer müsste erraten werden).
**Empfehlung:** CORS auf `null` oder einen festen lokalen Origin einschränken (z.B. nur die Electron-App selbst). Alternativ: explizit im Security-Doc begründen.

### S-003 — npm audit: 15 Vulnerabilities (11 high) in Dev-Dependencies
**Schweregrad:** LOW (DevDeps, nicht in Runtime)
**Beschreibung:** Alle 15 Findings stecken in `electron-builder` -> `tar` -> `cacache` Dependency-Chain. Betrifft nur den Build-Prozess, nicht die ausgelieferte App.
**Empfehlung:** `npm audit fix --force` oder auf electron-builder 26.x upgraden (breaking change). Vor Release einmal durchführen — für CI-Badge-Optik relevant.

### S-004 — Health-Endpoint `/health` ohne Auth
**Schweregrad:** INFO
**Datei:** `src/main/mcp/mcp-server.ts:210-218`
**Beschreibung:** `/health` antwortet ohne Bearer-Token mit Session-Count und Uptime. Kein Credential-Leak, aber gibt einem lokalen Angreifer Metadaten.
**Empfehlung:** Bewusste Design-Entscheidung, aber im Security-Doc erwähnen.

### S-005 — `task-hooks.ts` verwendet Shell-Interpretation
**Schweregrad:** LOW (admin-configured, kein User-Input)
**Datei:** `src/main/task/task-hooks.ts:43`
**Beschreibung:** Task-Hooks verwenden Shell-Interpretation für Hook-Commands. Das ist dokumentiert ("hook commands are admin-configured shell pipelines") und der Input kommt aus der Config, nicht von externen Quellen. Shell-Interpretation ist hier bewusst gewählt damit Pipes und Redirects funktionieren.
**Empfehlung:** OK so — der Kommentar ist bereits vorhanden. Im Contributor-Guide erwähnen dass Hook-Commands niemals aus User-Input stammen dürfen.

### S-006 — API-Key-Persistenz im Config-Store
**Schweregrad:** INFO
**Datei:** `src/main/ipc-hub.ts:286`
**Beschreibung:** Der MCP Bearer-Token wird in `config.json` im App-Data-Verzeichnis persistiert (kein tmp, sondern `~/.config/cipher-mux/config.json`). Das ist korrekt für Session-Reconnect, aber die Datei sollte `0600` Permissions haben.
**Empfehlung:** Bei Erstellung von `config.json` explizit `fs.chmod(path, 0o600)` setzen.

---

## Code Quality Findings

### Q-001 — `ipc-hub.ts` ist ein God-File (2389 LOC)
**Schweregrad:** MEDIUM
**Beschreibung:** Die Datei ist der zentrale Router für ~97 IPC-Kanäle. Sie importiert 46 Module und ist das Herz der Anwendung. Das funktioniert, aber die Datei wächst mit jedem Feature.
**Empfehlung:** Kein Blocker für die Veröffentlichung — aber ein natürlicher Refactoring-Kandidat. Handler-Gruppen (notes, tasks, voice, audit) könnten in separate Dateien extrahiert werden (ähnlich wie `handoff-kernel.ts` das für Handoffs bereits macht).

### Q-002 — 227x `as any` im Source (58x davon in `mcp-tools.ts`)
**Schweregrad:** LOW
**Beschreibung:** Die `mcp-tools.ts` Casts sind dokumentiert als Workaround für TS2589 (deep type instantiation mit Zod + MCP SDK). Das ist ein bekanntes Library-Problem. Die restlichen Renderer-Casts sind typisch für Preact/React IPC-Bridging wo `window.cipherMux` untyped ist.
**Empfehlung:** Für die Veröffentlichung akzeptabel. Langfristig: ein `declare global { interface Window { cipherMux: CipherMuxApi } }` Type-Declaration File würde die Renderer-Casts eliminieren.

### Q-003 — `mcp-tools.ts` Tool-Registrierung: Inline-Lambdas mit Error-Wrapping
**Schweregrad:** LOW
**Beschreibung:** Jede Tool-Registration ist ein One-Liner mit identischem try/catch Pattern. Das ist funktional, aber repetitiv (DRY-Verletzung über ~40 Tools).
**Empfehlung:** Ein `registerSafe(server, name, schema, handler)` Helper würde den Boilerplate eliminieren. Kein Blocker.

### Q-004 — `app.tsx` Root-Component mit 37 State-Variablen
**Schweregrad:** LOW
**Datei:** `src/renderer/app.tsx`
**Beschreibung:** Die App-Komponente hat viele State-Variables auf Top-Level. Das ist bei Electron-Apps mit wenig Routing üblich — aber bei weiterem Wachstum wird es unübersichtlich.
**Empfehlung:** Für v1.0 akzeptabel. Bei nächster größerer Feature-Welle: Context/Reducer-Pattern für zusammengehörige State-Gruppen (voice, grid, dialogs).

### Q-005 — Kein `strict: true` in tsconfig
**Schweregrad:** INFO
**Dateien:** `tsconfig.json`, `tsconfig.main.json`, `tsconfig.renderer.json`
**Beschreibung:** TypeScript-Strict-Mode ist nicht aktiv. Das erklärt die ~227 `as any` Casts teilweise.
**Empfehlung:** Nicht vor Release umstellen (zu viele Änderungen). Als Post-1.0 Roadmap-Item aufnehmen.

---

## Dokumentation Findings

### D-001 — SECURITY.md: Version-Tabelle veraltet
**Schweregrad:** LOW
**Datei:** `SECURITY.md:9`
**Beschreibung:** Supported Versions zeigt `0.8.x` — das Projekt ist bei `0.9.99`.
**Empfehlung:** Auf `0.9.x` aktualisieren.

### D-002 — README Version-Badge zeigt `0.9.9` statt `0.9.99`
**Schweregrad:** INFO
**Datei:** `README.md:12`
**Beschreibung:** Der Badge ist statisch und zeigt die alte Version.
**Empfehlung:** Dynamischen Badge verwenden oder vor Release aktualisieren.

### D-003 — Screenshot-Block im README noch auskommentiert
**Schweregrad:** LOW
**Datei:** `README.md:20-32`
**Beschreibung:** Für eine Veröffentlichung ist ein Screenshot wichtig — es ist der erste visuelle Eindruck.
**Empfehlung:** Mindestens einen Screenshot in `assets/screenshots/` bereitstellen und Block aktivieren.

### D-004 — `profile.cipher.yaml` ist im Repo-Worktree vorhanden
**Schweregrad:** INFO
**Beschreibung:** Die Datei ist korrekt gitignored und NICHT in git tracked. Keine Aktion nötig — nur Bestätigung dass das Profil-System sauber getrennt ist.

---

## Top-5 Empfehlungen (Release-Blockend -> Nice-to-Have)

| # | Priorität | Finding | Aufwand | Empfehlung |
|---|-----------|---------|---------|------------|
| 1 | **Hoch** | D-001 + D-002 | 5 min | SECURITY.md + README Badge aktualisieren |
| 2 | **Hoch** | D-003 | 30 min | Screenshot erstellen und README aktivieren |
| 3 | **Mittel** | S-001 | 1-2h | `sandbox: true` testen oder in SECURITY.md begründen |
| 4 | **Mittel** | S-003 | 10 min | `npm audit fix --force` (electron-builder Upgrade) |
| 5 | **Niedrig** | S-006 | 5 min | `config.json` mit 0600 Permissions erstellen |

---

## Positiv-Findings (was gut ist)

- **Credential-Filter im Memory-Store** (`CREDENTIAL_PATTERNS`) — verhindert dass Secrets in die Companion-DB geschrieben werden.
- **`execFile` statt Shell-Interpretation** überall außer dem dokumentierten Hooks-Ausnahmefall.
- **`shellEscapePath`** korrekt implementiert (POSIX single-quote idiom).
- **`contextIsolation: true` + `nodeIntegration: false`** auf allen Windows.
- **CSP-Header** via `onHeadersReceived` — robuster als Meta-Tag.
- **Profile-System** sauber: cipher-spezifische Pfade in gitignored YAML, Community-Profile neutral.
- **ESLint-Rule gegen Hardcoded-Pfade** (`no-restricted-syntax` für `/Users/Shared/Nextcloud`).
- **Single-Instance-Lock** verhindert Doppelstart.
- **1207 Tests** — für ein Pre-1.0 Projekt exzellent. Tests decken Security-relevante Module (credential-filter, shell-escape, MCP lifecycle) explizit ab.
- **ARCHITECTURE.md** mit ASCII-Diagramm und Module-Map — selten bei Projekten dieser Phase.
- **ADR-Dokumentation** vorhanden (decisions/).
- **Keine unsicheren DOM-Manipulationen** im Produktivcode.
- **MCP-Auth korrekt:** Bearer-Token wird per `crypto.randomBytes(16)` erzeugt, validiert mit Split+Compare.
- **Kein einziger Hardcoded Secret** im Source.

---

## Anhang

### Projekt-Steckbrief

| Eigenschaft | Wert |
|-------------|------|
| Sprache | TypeScript (100%) |
| Framework | Electron 34 + Preact 10 |
| Build | Vite (Renderer) + tsc (Main) |
| Paketierung | electron-builder |
| DB | better-sqlite3 (WAL mode) |
| MCP | @modelcontextprotocol/sdk (Streamable HTTP) |
| Lizenz | MIT |
| LOC (src/) | ~42.800 |
| Tests | 1207 (node:test + tsx) |
| Dependencies (prod) | 12 |
| Dependencies (dev) | 15 |

### Audit-Methodik

- Source-Code-Review der sicherheitskritischen Module (MCP Server, Session Manager, Preload, Window Manager)
- `npm audit` für Dependency-Vulnerabilities
- Pattern-Suche nach Secrets, Code-Injection-Vektoren, unsicherer DOM-Nutzung, Shell-Injection
- Electron Security Checklist (nodeIntegration, contextIsolation, sandbox, CSP, webSecurity)
- TypeScript-Kompilierung (noEmit Check)
- Vollständiger Test-Lauf
- Dokumentations-Vollständigkeitsprüfung

---

*Report generiert am 2026-05-03 von der cipher-mux Audit Entity.*
