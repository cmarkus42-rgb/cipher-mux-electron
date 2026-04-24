# Bug: ARCHITECTURE.md §"Adapter Contract" ist veraltet

## Status: Bug

**Erstellt:** 2026-04-23
**Betroffene Datei:** `ARCHITECTURE.md`, Zeile 116-148
**Prioritaet:** Niedrig — funktional kein Impact, aber irreführend für Contributors

---

## Problem

Die "Adapter Contract"-Sektion in ARCHITECTURE.md enthaelt einen veralteten Note und ein Interface-Beispiel, das nicht mehr dem aktuellen Code entspricht.

### 1. Veralteter Note (Zeile 118)

Aktuell steht dort:
> "The AgentAdapter interface is being finalized in TP-2. This section will be updated after that work completes. The current codebase has direct Claude Code coupling in session-manager.ts."

**Realitaet:** Das Interface ist fertig implementiert in `src/main/agent/agent-adapter.ts`. Der Claude-Code-Adapter (`adapters/claude-code.ts`) und ein Reference-Stub (`adapters/_reference-stub.ts`) existieren. Der Session-Manager nutzt den Adapter via `buildOrchestratorPromptFragment()`. Es gibt keine "direct Claude Code coupling" mehr in der Prompt-Generierung.

### 2. Interface-Beispiel ist unvollstaendig (Zeile 122-133)

Das gezeigte Interface:
```typescript
interface AgentAdapter {
  id: string
  displayName: string
  tier: 'tier-1' | 'tier-2'
  buildLaunchCommand(opts: LaunchOpts): string  // FALSCH: gibt LaunchCommand zurueck, nicht string
  postLaunchInjection?(ctx: AdapterContext): Promise<void>
  getProjectMarkers(): string[]
  supports(feature: AdapterFeature): boolean
}
```

Das tatsaechliche Interface (`src/main/agent/agent-adapter.ts`) hat zusaetzlich:
- `buildLaunchCommand()` gibt `LaunchCommand` zurueck (nicht `string`)
- `readProjectInstructions(projectPath): Promise<ProjectInstructions | null>`
- `getCapabilities(): AdapterCapabilities`
- `getContextUsage?(sessionId): Promise<ContextUsage | null>`
- `attachStatusHook?(projectPath): Promise<void>`
- `sendPrompt(tmuxTarget, prompt, opts?): Promise<void>`
- `buildOrchestratorPromptFragment(lang): string`
- `buildLauncherPromptFragment(lang): string`

### 3. Capabilities-Tabelle ist unvollstaendig (Zeile 140-146)

Es fehlt die Capability `sub-agents` in der Tabelle. Das aktuelle `AdapterCapabilities`-Interface hat 6 Eintraege:
- `mcp-injection`
- `status-line`
- `skip-permissions`
- `sub-agents` ← fehlt in ARCHITECTURE.md
- `project-instructions` ← fehlt in ARCHITECTURE.md
- `message-bus-participant`

---

## Fix

1. **Note entfernen** — das Interface ist implementiert, nicht mehr "being finalized"
2. **Interface-Beispiel aktualisieren** — vollstaendiges Interface aus `agent-adapter.ts` uebernehmen
3. **Capabilities-Tabelle vervollstaendigen** — alle 6 Capabilities mit Degradation-Verhalten listen
4. **Verweis auf Reference-Stub beibehalten** — der ist korrekt und hilfreich

## Betroffene Dateien

- `ARCHITECTURE.md` (einzige Datei, nur Doku-Update)
