---
id: BUG-2026-04-23-INPUTREQ
status: open
project: cipher-mux-electron
projectPath: /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
created: 2026-04-23T19:45:00.000Z
---

## Beschreibung

MCP-Tool `mux_input_request_create` gibt `"InputRequestWatcher not available"` zurueck. Input Requests koennen nicht erstellt werden — der MPO kann keine Bubble-Fragen an die Sidebar senden.

## Root Cause

**Race Condition / Profile-Mismatch bei `BRAND.inputRequestsPath`.**

Der `InputRequestWatcher` wird in `ipc-hub.ts:828-835` nur erstellt wenn `BRAND.inputRequestsPath` truthy ist:

```typescript
private registerInputRequestChannels(): void {
  const INPUT_REQUESTS_PATH = BRAND.inputRequestsPath
  if (!INPUT_REQUESTS_PATH) {          // ← hier steigt er aus
    ipcMain.handle(IPC.MPO_INPUT_REQUESTS, () => ({ requests: [] }))
    return                              // ← watcher wird NIE erstellt
  }
  this.inputRequestWatcher = new InputRequestWatcher(INPUT_REQUESTS_PATH)
  // ...
}
```

`BRAND` wird in `brand.ts:149` als Singleton geladen via `resolveProfilePath()`, die `BUILD_PROFILE` env var ausliest (default: `community`). Das `profile.community.yaml` hat `inputRequestsPath: ""` (leer String) — ergo kein Watcher.

**Moegliche Ursachen:**
1. App wurde ohne `BUILD_PROFILE=cipher` gestartet → community profile aktiv → leerer Pfad
2. `resolveProfilePath()` findet das cipher-Profil nicht (walking up from `__dirname` nach Build kann fehlschlagen wenn dist-Struktur nicht erwartet)
3. Im gebauten Electron-Bundle liegt `__dirname` woanders als erwartet → Fallback auf community defaults

## Betroffene Dateien

| Datei | Zeilen | Rolle |
|-------|--------|-------|
| `src/shared/brand.ts` | 128-149 | Profile-Aufloesung, `BRAND` singleton |
| `src/shared/brand.ts` | 52 | `COMMUNITY_DEFAULTS.inputRequestsPath = ''` |
| `src/main/ipc-hub.ts` | 828-835 | Watcher-Guard (early return bei leerem Pfad) |
| `src/main/mcp/mcp-tools.ts` | 500-503 | MCP-Tool prueft `ctx.inputRequestWatcher` |
| `profile.cipher.yaml` | 13 | Definiert korrekten Pfad |
| `profile.community.yaml` | — | `inputRequestsPath: ""` |

## Reproduktion

1. App starten (egal wie — Electron, dev-mode)
2. MCP-Tool `mux_input_request_create` aufrufen
3. → Error: `"InputRequestWatcher not available"`

## Vorgeschlagener Fix

**Option A — Build sicherstellen:** Dev-Scripts und Electron-Builder muessen `BUILD_PROFILE=cipher` setzen. Pruefen ob `package.json` scripts und Forge-Config das tun.

**Option B — Defensiver Fallback:** Wenn `BRAND.inputRequestsPath` leer ist aber die Datei am bekannten Cipher-Pfad existiert, automatisch verwenden:

```typescript
const INPUT_REQUESTS_PATH = BRAND.inputRequestsPath
  || (fs.existsSync(KNOWN_CIPHER_PATH) ? KNOWN_CIPHER_PATH : '')
```

**Option C — Logging:** Mindestens ein `console.warn` wenn der Watcher nicht erstellt wird, damit man den Fehler schneller findet:

```typescript
if (!INPUT_REQUESTS_PATH) {
  console.warn('[IpcHub] inputRequestsPath is empty — InputRequestWatcher disabled. Check BUILD_PROFILE.')
  // ...
}
```

**Empfehlung:** Option A (Root Cause fixen) + Option C (Logging fuer Zukunft).

## Verifizierung

Pruefen mit:
```bash
# Im laufenden Electron-Prozess checken welches Profil geladen wurde:
# Dev-Console → erreichbar via View > Toggle Developer Tools
# Dort: require('./shared/brand').BRAND.inputRequestsPath
# Sollte den vollen Pfad zeigen, nicht ''
```
