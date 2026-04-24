---
id: BUG-2026-04-23-MSGBUS
status: resolved
project: cipher-mux-electron
projectPath: /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
created: 2026-04-23T21:30:00.000Z
---

## Beschreibung

MessageBus und TaskManager sind beim Start nicht verfügbar. `mux_status` zeigt `messageBus: false`, und `mux_task_list` gibt `TaskManager not available` zurück. Sessions laufen (Orchestrator + MPO aktiv), aber ohne MessageBus kann keine Inter-Session-Kommunikation stattfinden — keine Messages lesen/senden, keine Task-Queue, keine Bug-Dispatch-Pipeline.

## Erwartetes Verhalten

Nach dem Start von cipher-mux sollten MessageBus und TaskManager automatisch initialisiert und verfügbar sein, sobald Sessions aktiv sind.

## Tatsächliches Verhalten

- `mux_status` → `messageBus: false`, `statusLineMonitor: true`
- `mux_read(topic: 'chat')` → `MessageBus not available`
- `mux_task_list()` → `TaskManager not available`
- Sessions selbst sind aktiv und responsive

## Impact

- Orchestrator kann keine Tasks delegieren oder überwachen
- Bug-Pipeline komplett blockiert (kein Lesen/Schreiben auf topic 'bug')
- Status-Updates zwischen Sessions unmöglich

## Diagnostik

- **App-Version:** unbekannt (kein Zugriff auf package.json von hier)
- **OS:** Darwin 25.4.0
- **Aktive Sessions:** 2 (Orchestrator, MPO)
- **MessageBus:** false
- **TaskManager:** nicht verfügbar

### Vermutung

MessageBus/TaskManager werden möglicherweise erst durch einen separaten Init-Schritt oder eine fehlende Konfiguration aktiviert. Oder ein Startup-Race-Condition verhindert die Initialisierung.

## Resolution (2026-04-23)

**Root Cause:** `better-sqlite3` Native-Modul war für Node.js ABI kompiliert statt für Electron ABI. `npm run test` führt `rebuild:node` aus, das better-sqlite3 für Node.js rebuilt — danach ist das Modul inkompatibel mit Electron. Der MessageBus-Constructor wirft beim `new Database()`, wird gecatcht (ipc-hub.ts:60-62), und `messageBus` bleibt `null`. Alle downstream Services (TaskManager, TaskWatcher, BugreportTaskSource) werden übersprungen.

**Fix:** `npx electron-rebuild -f -w better-sqlite3` + App-Neustart. Der `prestart`-Hook in package.json (`electron-builder install-app-deps`) fängt das bei `npm start` automatisch ab.

**Prevention:** App immer mit `npm start` starten (nicht `electron .` direkt), damit der prestart-Hook den ABI-Rebuild garantiert.
