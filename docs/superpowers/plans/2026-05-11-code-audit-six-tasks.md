# Code-Audit 2026-05-11 — Implementation Plan (6 Tasks, 3 Waves)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 findings from the Testing-Assistant Code-Audit: Bugreport session-based rewrite, Orchestrator-to-Workshop rename, Theme-Editor cleanup, Keep-Working race fix, Barge-In amplitude detector, Preset-Editor cleanup.

**Architecture:** Each task is self-contained. Wave 1 (Tasks 1-3) handles isolated fixes. Wave 2 (Task 4) rewrites the Bugreport pipeline. Wave 3 (Tasks 5-6) covers Theme-Editor and Voice. Workers per wave operate on non-overlapping files.

**Tech Stack:** Electron (main + renderer), Preact, xterm.js, TypeScript, tmux IPC

**Spec:** `docs/superpowers/specs/2026-05-11-code-audit-five-tasks-design.md`

---

## Wave 1 — Task 1: Orchestrator → Workshop Rename (Worker 1-A)

### File Map

| Action | File |
|--------|------|
| Modify | `src/shared/ipc-channels.ts` |
| Modify | `src/shared/brand.ts` |
| Modify | `src/shared/types.ts` |
| Modify | `src/main/session/entity-registry.ts` |
| Modify | `src/main/session/resolve-session-topic.ts` |
| Modify | `src/main/ipc-hub.ts` |
| Modify | `src/main/preload.ts` |
| Modify | `src/main/config/config-store.ts` |
| Modify | `src/main/workshop/workshop-template.ts` |
| Modify | `src/main/project/kickoff-orchestrator.ts` |
| Modify | `src/main/mcp/mcp-tools.ts` |
| Modify | `src/main/mcp/handoff-kernel.ts` |
| Modify | `src/main/entity-content/companion-*.ts` (5 files) |
| Modify | `src/main/character/character-defaults.ts` |
| Modify | `src/main/agent/agent-adapter.ts` |
| Modify | `src/main/agent/adapters/claude-code.ts` |
| Modify | `src/main/agent/adapters/_reference-stub.ts` |
| Modify | `src/shared/persona-types.ts` |
| Modify | `src/shared/constants.ts` |
| Modify | `src/renderer/app.tsx` |
| Modify | `src/renderer/locales/en.json` |
| Modify | `src/renderer/locales/de.json` |
| Modify | `src/renderer/components/SessionGrid.tsx` |
| Modify | `src/renderer/components/SessionCell.tsx` |
| Modify | `src/renderer/components/PaneHeader.tsx` |
| Modify | `src/renderer/components/SidebarPanel.tsx` |
| Modify | `src/renderer/components/CompanionTab.tsx` |
| Modify | `src/renderer/components/SidebarWindow.tsx` |
| Modify | `src/renderer/components/InfoSettingsView.tsx` |

- [ ] **Step 1: Rename IPC channel constants**

In `src/shared/ipc-channels.ts`, replace the Orchestrator block (lines 56-60):

```typescript
  // Workshop
  WORKSHOP_START: 'cipher-mux:workshop:start',
  WORKSHOP_STOP: 'cipher-mux:workshop:stop',
  WORKSHOP_STATUS: 'cipher-mux:workshop:status',
  WORKSHOP_STARTED: 'cipher-mux:workshop:started',
```

- [ ] **Step 2: Rename brand config**

In `src/shared/brand.ts`:
- Rename interface field `orchestratorDir` → `workshopDir` (line 27)
- Rename in `COMMUNITY_DEFAULTS` (line 44): `workshopDir: '~/.config/cipher-mux/workshop'`
- Update `loadProfile` (line 112): key `workshopDir`

- [ ] **Step 3: Rename entity registry**

In `src/main/session/entity-registry.ts`:
- Line 67: change parameter name `_orchestratorDir` → `_workshopDir`
- Line 73: `id: 'workshop'`
- Line 77: `projectPath: \`\${entitiesBase}/workshop\``

- [ ] **Step 4: Rename resolve-session-topic map**

In `src/main/session/resolve-session-topic.ts` (line 19):
Change `orchestrator: 'Orchestrator'` → `workshop: 'Workshop'`

- [ ] **Step 5: Rename preload API**

In `src/main/preload.ts` (around line 153):

```typescript
  // ─── Workshop ────────────────────────────────────────
  workshop: {
    start: () => ipcRenderer.invoke(IPC.WORKSHOP_START),
    stop: () => ipcRenderer.invoke(IPC.WORKSHOP_STOP),
    status: () => ipcRenderer.invoke(IPC.WORKSHOP_STATUS),
```

- [ ] **Step 6: Bulk rename in ipc-hub.ts**

In `src/main/ipc-hub.ts`, replace all occurrences:
- `'orchestrator'` → `'workshop'` (entity ID strings)
- `ORCHESTRATOR_START` → `WORKSHOP_START` (IPC constants)
- `ORCHESTRATOR_STOP` → `WORKSHOP_STOP`
- `ORCHESTRATOR_STATUS` → `WORKSHOP_STATUS`
- `ORCHESTRATOR_STARTED` → `WORKSHOP_STARTED`
- `registerOrchestratorChannels` → `registerWorkshopChannels`
- `BRAND.orchestratorDir` → `BRAND.workshopDir`
- `configStore.get('orchestrator')` → `configStore.get('workshop')`

Critical spots:
- Line 109: `registerBuiltinEntities(entityRegistry, BRAND.workshopDir, BRAND.cyberFactoryDir)`
- Line 186: `deployEntity('workshop', generateWorkshopClaudeMd(...))`
- Line 257: `configStore.get('workshop')`
- Line 1031-1052: IPC handlers
- Line 2286: `ENTITIES_WITH_TEMPLATE` set entry
- Autostart comment at line 472

- [ ] **Step 7: Rename in renderer files**

Grep all `src/renderer/` files for `orchestrator` (case-insensitive) and replace:
- `app.tsx`: all `orchestrator` references → `workshop`
- `SessionGrid.tsx`, `SessionCell.tsx`, `PaneHeader.tsx`, `SidebarPanel.tsx`, `CompanionTab.tsx`, `SidebarWindow.tsx`, `InfoSettingsView.tsx`: replace any `orchestrator` string references

- [ ] **Step 8: Update locales**

In `src/renderer/locales/en.json`:
- `"statusBar.orchestrator"` → `"statusBar.workshop": "workshop"`
- All `info.feature.orchestrator.*` keys → `info.feature.workshop.*`
- Replace "orchestrator" in values with "workshop"
- `"unified.desc.orchestrator"` → `"unified.desc.workshop"`

Same pattern in `src/renderer/locales/de.json`:
- `"statusBar.orchestrator"` → `"statusBar.workshop": "workshop"`
- All `info.feature.orchestrator.*` → `info.feature.workshop.*`
- Replace "orchestrator"/"Orchestrator" in German values with "Workshop"
- `"unified.desc.orchestrator"` → `"unified.desc.workshop"`

- [ ] **Step 9: Rename remaining main-process references**

Check and rename in each file (grep for `orchestrator`, case-insensitive):
- `src/main/workshop/workshop-template.ts`
- `src/main/project/kickoff-orchestrator.ts` (keep filename, rename class `KickoffOrchestrator` → `KickoffWorkshop`)
- `src/main/mcp/mcp-tools.ts`
- `src/main/mcp/handoff-kernel.ts`
- `src/main/entity-content/companion-preset.ts`
- `src/main/entity-content/companion-startup.ts`
- `src/main/entity-content/companion-ref.ts`
- `src/main/entity-content/companion-info-popup.ts`
- `src/main/entity-content/companion-guides.ts`
- `src/main/character/character-defaults.ts`
- `src/shared/persona-types.ts`
- `src/shared/constants.ts`
- `src/main/agent/agent-adapter.ts`
- `src/main/agent/adapters/claude-code.ts`
- `src/main/agent/adapters/_reference-stub.ts`
- `src/main/config/config-store.ts`

- [ ] **Step 10: Add filesystem migration**

In `src/main/ipc-hub.ts`, in the startup sequence (before `registerBuiltinEntities`), add migration logic:

```typescript
// Migrate orchestrator → workshop directory
const oldDir = path.join(os.homedir(), '.config/cipher-mux/entities/orchestrator')
const newDir = path.join(os.homedir(), '.config/cipher-mux/entities/workshop')
if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
  try {
    fs.renameSync(oldDir, newDir)
    console.log('[IpcHub] Migrated orchestrator → workshop entity directory')
  } catch (err) {
    console.error('[IpcHub] Failed to migrate orchestrator directory:', err)
  }
}

// Migrate config key
const oldConfig = configStore.get('orchestrator' as any)
if (oldConfig) {
  configStore.set('workshop', oldConfig)
  configStore.set('orchestrator' as any, undefined as any)
  console.log('[IpcHub] Migrated orchestrator → workshop config key')
}
```

- [ ] **Step 11: Build and verify**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npm run build`
Expected: No TypeScript errors referencing "orchestrator"

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: rename orchestrator → workshop entity ID

Renames entity ID, IPC channels, preload API, locales, and all
code references. Adds startup migration for filesystem directory
and config key."
```

---

## Wave 1 — Task 2: Keep-Working Race Fix (Worker 1-B)

### File Map

| Action | File |
|--------|------|
| Modify | `src/main/ipc-hub.ts` |

- [ ] **Step 1: Understand the race**

Read the keepWorking startup path in `src/main/ipc-hub.ts`:
- Line 416-427: keepWorking branch
- Line 423: `await this.restoreKeepWorkingFromRecovery(...)` — sends `KEEP_WORKING_RESTORE` at line 2824
- Line 427: `this.cachedRecoveryResult = { recovered: [], ... }` — set AFTER await, but renderer may not have processed KEEP_WORKING_RESTORE yet

- [ ] **Step 2: Move cachedRecoveryResult into delayed setter**

Replace lines 424-427 in `src/main/ipc-hub.ts`:

```typescript
        await this.restoreKeepWorkingFromRecovery(snapshotSessions, snapshotGridConfig, result.recovered, snapshotNotesSlots)
        configStore.set('keepWorkingSnapshot', undefined as any)
        // Set empty recovery result so RecoveryDialog resolves immediately
        // (null would cause 15s poll timeout before onDone fires)
        this.cachedRecoveryResult = { recovered: [], orphaned: [], killed: [], gridState: null }
```

With:

```typescript
        await this.restoreKeepWorkingFromRecovery(snapshotSessions, snapshotGridConfig, result.recovered, snapshotNotesSlots)
        configStore.set('keepWorkingSnapshot', undefined as any)
        // Delay setting cachedRecoveryResult: the renderer needs time to process
        // the KEEP_WORKING_RESTORE event (sent by restoreKeepWorkingFromRecovery)
        // and set keepWorkingApplied.current = true. If we set cachedRecoveryResult
        // immediately, RecoveryDialog resolves before keepWorkingApplied is set,
        // triggering default workspace load → duplicate sessions (T-FW.22).
        setTimeout(() => {
          this.cachedRecoveryResult = { recovered: [], orphaned: [], killed: [], gridState: null }
        }, 1500)
```

- [ ] **Step 3: Verify no other code path depends on synchronous cachedRecoveryResult**

Grep for `cachedRecoveryResult` in `ipc-hub.ts` and verify all access points handle `null` gracefully. The `SESSIONS_RECOVER` handler (line 677) already returns `null` when `cachedRecoveryResult` is null, and the RecoveryDialog polls until it gets a non-null result.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-hub.ts
git commit -m "fix: delay cachedRecoveryResult to prevent keepWorking race (T-FW.22)

The RecoveryDialog was resolving before the renderer processed the
KEEP_WORKING_RESTORE event, causing handleRecoveryDone to load the
default workspace and create duplicate sessions. Delaying the empty
recovery result by 1500ms ensures keepWorkingApplied is set first."
```

---

## Wave 1 — Task 3: Preset-Editor Cleanup (Worker 1-C)

### File Map

| Action | File |
|--------|------|
| Modify | `src/renderer/components/PresetEditor.tsx` |
| Modify | `src/main/ipc-hub.ts` |

- [ ] **Step 1: Remove handleCopyAsCustom function**

In `src/renderer/components/PresetEditor.tsx`, delete lines 301-315 (the `handleCopyAsCustom` function):

```typescript
  const handleCopyAsCustom = async () => {
    if (!selected) return
    const copyId = selected.id + '-custom-' + Date.now()
    const copyName = selected.displayName + ' (Custom)'
    const res = await api.presets.create(copyId, copyName)
    if (res.ok) {
      // Write current content into the new preset
      await api.presets.save(copyId, draftContent)
      await loadPresets()
      setSelectedId(copyId)
      setEditConfirmed(true)
    } else {
      alert(res.error || 'Failed to create copy')
    }
  }
```

- [ ] **Step 2: Remove Copy as Custom button from JSX**

In `PresetEditor.tsx`, replace the builtin preset header block (lines 390-410):

Old:
```tsx
            {isBuiltinPreset ? (
              <button
                onClick={handleCopyAsCustom}
                title="Create an editable copy of this built-in preset"
                style={{ marginLeft: 'auto', fontSize: '11px', padding: '2px 8px', background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-dim)', cursor: 'pointer' }}
              >
                Copy as Custom
              </button>
            ) : (
```

New:
```tsx
            {isBuiltinPreset ? (
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                built-in (read-only)
              </span>
            ) : (
```

- [ ] **Step 3: Update footer hint text**

In `PresetEditor.tsx`, replace the builtin footer block (lines 511-517):

Old:
```tsx
          {isBuiltinPreset && (
            <div class="pp-foot-actions">
              <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                Built-in preset (read-only). Use "Copy as Custom" to create an editable version.
              </span>
            </div>
          )}
```

New:
```tsx
          {isBuiltinPreset && (
            <div class="pp-foot-actions">
              <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                Built-in preset (read-only). Use "+ New" to create your own entity.
              </span>
            </div>
          )}
```

- [ ] **Step 4: Improve create template**

In `src/main/ipc-hub.ts`, replace the template string at line 2383:

Old:
```typescript
        const template = `# ${displayName}\n\n## Rolle\n\n\n\n## Faehigkeiten\n\n\n\n## Arbeitsregeln\n\n\n\n## Scope\n\n`
```

New:
```typescript
        const template = `# ${displayName}

## Rolle

Beschreibe hier die Rolle und Persoenlichkeit des Entity.
Wer ist es, wie spricht es, was ist sein Auftrag?

## Faehigkeiten

Welche MCP-Tools nutzt dieses Entity?
Welche besonderen Workflows beherrscht es?

## Arbeitsregeln

Verhaltensregeln, Grenzen, Off-Limits.
Was darf das Entity, was nicht?

## Scope

Auf welche Projekte, Verzeichnisse oder Themen
ist dieses Entity fokussiert?

---

> Tipp: Schreib erst selbst einen Entwurf — das schaerft dein eigenes Verstaendnis.
> Dann starte eine Session mit dem Coding Companion und bitte ihn,
> daraus einen guten Prompt zu machen.
`
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PresetEditor.tsx src/main/ipc-hub.ts
git commit -m "fix: remove Copy as Custom, improve preset template (T-PRESET.1)

Removes misleading Copy as Custom button that only copied preset.md
without skills/assets. Replaces empty template with descriptive
sections and a tip about using the Companion for prompt writing."
```

---

## Wave 2 — Task 4: Bugreport Dialog → Session-basiert (Workers 2-A + 2-B)

This task is split into backend (4A) and frontend (4B) sub-tasks. 4A creates the IPC infrastructure, 4B rewrites the dialog. They can be done by the same worker sequentially.

### File Map

| Action | File |
|--------|------|
| Modify | `src/shared/ipc-channels.ts` |
| Modify | `src/main/bugreport/ollama-client.ts` |
| Modify | `src/main/bugreport/bugreport-manager.ts` |
| Modify | `src/main/ipc-hub.ts` |
| Modify | `src/main/preload.ts` |
| Modify | `src/main/config/config-store.ts` |
| Modify | `src/shared/types.ts` |
| Modify | `src/renderer/components/BugreportDialog.tsx` |

- [ ] **Step 1: Add IPC channel**

In `src/shared/ipc-channels.ts`, find the Bugreport section and add:

```typescript
  BUGREPORT_PROCESS: 'cipher-mux:bugreport:process',
```

- [ ] **Step 2: Remove enrichment functions from ollama-client.ts**

In `src/main/bugreport/ollama-client.ts`, remove:
- Lines 7-10: `CLAUDE_TIMEOUT_MS`, `CLAUDE_MODEL`, `CLAUDE_API_HOST` constants
- Lines 12-21: `ENRICH_PROMPT` constant
- Lines 33-47: `getLlmConfig()` function — but ONLY the `bugreportEnrichBackend` field. Actually, `getLlmConfig()` is also used by `enrichViaOllama` only. Check if `note-tagging.ts` imports from here. If `getLlmConfig` is only used by the enrich functions, remove it too.
- Lines 49-61: `getAnthropicApiKey()` function
- Lines 63-115: `enrichViaClaude()` function
- Lines 196-210: `enrichViaOllama()` function
- Lines 212-224: `enrichBugreport()` function

Keep: `ollamaPost()`, `ollamaGet()`, `testOllamaConnection()`, `listOllamaModels()`, `parseEnrichedOutput()`, `EnrichedBugreport` interface.

Check `note-tagging.ts` — if it imports `getLlmConfig`, keep the Ollama host/port/model parts and only remove `bugreportEnrichBackend`.

- [ ] **Step 3: Remove enrich() from bugreport-manager.ts**

In `src/main/bugreport/bugreport-manager.ts`:
- Remove the `enrich()` method (lines 188-190)
- Remove the import of `enrichBugreport` from `./ollama-client` (line 9) — keep `EnrichedBugreport` type import

- [ ] **Step 4: Add processBugreport to bugreport-manager.ts**

Add a new method to `BugreportManager`. Use `runCommand` from `../util/exec-util` (already imported in the file) for safe command execution instead of raw `execSync`:

```typescript
  /**
   * Process a bugreport via a background bugreport entity session.
   * Starts a bugreport session, sends the description, polls for structured output,
   * then kills the session and returns the enriched report.
   */
  async processBugreport(
    description: string,
    sessionManager: any, // SessionManager — avoid circular import via any
  ): Promise<EnrichedBugreport | null> {
    const TIMEOUT_MS = 120_000
    const POLL_INTERVAL_MS = 3_000
    const MARKER_START = '```yaml'
    const MARKER_END = '```'

    // Start background bugreport session
    const session = await sessionManager.startEntity('bugreport')
    const tmuxSession = session.tmuxSession

    try {
      // Wait for Claude to be ready
      await new Promise(resolve => setTimeout(resolve, 10_000))

      // Send the description as prompt via tmux send-keys
      const escaped = description.replace(/'/g, "'\\''")
      await runCommand('tmux', [
        'send-keys', '-t', tmuxSession,
        `Verarbeite diesen Bugreport und gib das Ergebnis als YAML-Block aus:\n\n${escaped}`,
        'Enter',
      ], { timeout: 5000 })

      // Poll for structured output
      const startTime = Date.now()
      while (Date.now() - startTime < TIMEOUT_MS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        try {
          const capture = await runCommand('tmux', [
            'capture-pane', '-t', tmuxSession, '-p',
          ], { timeout: 5000 })
          // Look for YAML block in capture
          const yamlStart = capture.lastIndexOf(MARKER_START)
          if (yamlStart !== -1) {
            const afterStart = capture.slice(yamlStart + MARKER_START.length)
            const yamlEnd = afterStart.indexOf(MARKER_END)
            if (yamlEnd !== -1) {
              const yamlText = afterStart.slice(0, yamlEnd).trim()
              const result = parseEnrichedOutput(yamlText)
              if (result) return result
            }
          }
        } catch { /* capture failed, retry */ }
      }
      return null // timeout
    } finally {
      // Always kill the background session
      try {
        await sessionManager.stop(session.id)
      } catch { /* session may already be gone */ }
    }
  }
```

Import `parseEnrichedOutput` from `./ollama-client` at the top of the file (it should already be importable alongside `EnrichedBugreport`).

- [ ] **Step 5: Register IPC handler**

In `src/main/ipc-hub.ts`, find the bugreport IPC handlers section and add:

```typescript
    ipcMain.handle(IPC.BUGREPORT_PROCESS, async (_e, { description }: { description: string }) => {
      try {
        const result = await this.bugreportManager.processBugreport(description, this.sessionManager)
        return { ok: true, result }
      } catch (err: any) {
        console.error('[IpcHub] bugreport process failed:', err)
        return { ok: false, error: err.message }
      }
    })
```

- [ ] **Step 6: Expose in preload**

In `src/main/preload.ts`, in the bugreport section, replace `enrich` with `process`:

```typescript
    process: (description: string) =>
      ipcRenderer.invoke(IPC.BUGREPORT_PROCESS, { description }),
```

Remove the old `enrich` line.

- [ ] **Step 7: Remove bugreportEnrichBackend from config**

In `src/main/config/config-store.ts`, remove `bugreportEnrichBackend` from the LLM config defaults.

In `src/shared/types.ts`, remove `bugreportEnrichBackend` from the config type if present.

- [ ] **Step 8: Rewrite BugreportDialog.tsx**

In `src/renderer/components/BugreportDialog.tsx`:

1. Rename state: `enriching` → `processing`, rename handler: `handleEnrich` → `handleProcess`

2. Replace `handleProcess` implementation:

```typescript
  const handleProcess = useCallback(async () => {
    if (!description.trim()) return
    setProcessing(true)
    setEnrichFailed(false)
    setEnriched(null)
    try {
      const res = await api().bugreport.process(description)
      if (res.ok && res.result) {
        setEnriched(res.result)
        setPreview(formatEnriched(res.result))
      } else {
        setEnrichFailed(true)
      }
    } catch (err) {
      console.error('[BugreportDialog] process failed:', err)
      setEnrichFailed(true)
    } finally {
      setProcessing(false)
    }
  }, [description])
```

3. Update button text: "Verarbeiten" button should show "Session verarbeitet..." while processing.

4. Update the button section — "Absenden" stays disabled until processing is done and enriched is set, but keep direct submit as fallback:

```tsx
              <div class="bugreport-footer">
                <button class="btn btn--sm" onClick={handleClose}>{t('bugreport.cancel')}</button>
                {!enriched && (
                  <button class="btn btn--sm" onClick={handleProcess} disabled={processing || !description.trim()}>
                    {processing ? t('bugreport.processing') : t('bugreport.preview')}
                  </button>
                )}
                <button class="btn btn--sm btn--primary" onClick={handleSubmit}
                  disabled={submitting || (!description.trim() && !preview.trim())}>
                  {submitting ? t('bugreport.sending') : t('bugreport.submit')}
                </button>
              </div>
```

- [ ] **Step 9: Add locale key**

In `en.json` and `de.json`, add:
```json
"bugreport.processing": "Session processing..."
```
(de.json: `"bugreport.processing": "Session verarbeitet..."`)

- [ ] **Step 10: Build and verify**

Run: `npm run build`
Expected: Clean build, no TypeScript errors

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: bugreport dialog uses entity session instead of direct API (F-HIGH-01)

Removes direct Claude Haiku / Ollama API calls for bugreport enrichment.
Instead starts a background bugreport entity session that processes the
report using its own CLAUDE.md context. Adds BUGREPORT_PROCESS IPC
channel and polling-based result extraction."
```

---

## Wave 3 — Task 5: Theme-Editor Session-Gruppe bereinigen (Worker 3-A)

### File Map

| Action | File |
|--------|------|
| Modify | `src/renderer/components/InfoSettingsView.tsx` |
| Modify | `src/renderer/styles/grid.css` |
| Modify | `src/renderer/styles/components.css` |
| Modify | `src/renderer/styles/theme-cipher-dark.css` |
| Modify | `src/renderer/styles/theme-cipher-ivory.css` |
| Modify | `src/renderer/styles/theme-nord.css` |
| Modify | `src/renderer/styles/theme-synthwave.css` |
| Modify | `src/renderer/styles/theme-matrix.css` |
| Modify | `src/renderer/styles/theme-gruvbox-dark.css` |
| Modify | `src/renderer/styles/theme-blueprint.css` |
| Modify | `src/renderer/styles/theme-brutalist.css` |
| Modify | `src/renderer/styles/theme-warm-paper.css` |
| Modify | `src/renderer/styles/theme-high-contrast.css` |
| Modify | `src/renderer/styles/theme-cvd-deuteranopia.css` |
| Modify | `src/renderer/styles/theme-cvd-tritanopia.css` |
| Modify | `src/renderer/styles/theme-cvd-achromatopsia.css` |
| Modify | `src/renderer/components/SessionCell.tsx` (xterm theme wiring) |

- [ ] **Step 1: Clean up session token group in InfoSettingsView.tsx**

In `src/renderer/components/InfoSettingsView.tsx`, find the token group definition (around line 74-77):

Old:
```typescript
    tokens: ['--session-bg', '--session-text', '--session-border', '--session-font-size', '--color-session-header-bg', '--shadow-inset'],
```

New:
```typescript
    tokens: ['--session-bg', '--session-text', '--session-border', '--color-session-header-bg'],
```

- [ ] **Step 2: Remove terminal font/size/line-height group from Theme-Editor**

In `InfoSettingsView.tsx`, delete the entire Terminal group block (around lines 583-625):

```tsx
              {/* Terminal font / size / line-height */}
              <div class="theme-editor__group">
                <div class="theme-editor__group-label">{t('themeEditor.groupTerminal')}</div>
                ...
              </div>
```

Remove the entire `<div class="theme-editor__group">` containing terminal font controls.

- [ ] **Step 3: Add terminal color token group**

In `InfoSettingsView.tsx`, add a new token group to the groups array:

```typescript
  {
    labelKey: 'themeEditor.groupTerminalColors',
    tokens: [
      '--terminal-bg', '--terminal-foreground', '--terminal-cursor', '--terminal-selection',
      '--terminal-ansi-black', '--terminal-ansi-red', '--terminal-ansi-green', '--terminal-ansi-yellow',
      '--terminal-ansi-blue', '--terminal-ansi-magenta', '--terminal-ansi-cyan', '--terminal-ansi-white',
      '--terminal-ansi-bright-black', '--terminal-ansi-bright-red', '--terminal-ansi-bright-green', '--terminal-ansi-bright-yellow',
      '--terminal-ansi-bright-blue', '--terminal-ansi-bright-magenta', '--terminal-ansi-bright-cyan', '--terminal-ansi-bright-white',
    ],
  },
```

Add locale keys in `en.json`/`de.json`:
```json
"themeEditor.groupTerminalColors": "Terminal Colors"
```

- [ ] **Step 4: Fix --session-text and --session-border CSS wiring**

In `src/renderer/styles/grid.css`, find where `.session-cell` or equivalent classes are styled. Ensure:

```css
.session-cell {
  color: var(--session-text);
  border-color: var(--session-border);
}
```

If these tokens are defined but not referenced in the CSS rules, wire them up. Check `components.css` for the same.

- [ ] **Step 5: Remove --session-font-size and --shadow-inset from all theme CSS files**

For each of the 14 theme CSS files (`theme-*.css`), remove the declarations for:
- `--session-font-size`
- `--shadow-inset`

- [ ] **Step 6: Add terminal color tokens to all theme CSS files**

Add terminal color tokens to each theme CSS file with appropriate theme-specific values:

**cipher-dark (dark base):**
```css
  --terminal-bg: #1a1a2e;
  --terminal-foreground: #e0e0e0;
  --terminal-cursor: #00ff88;
  --terminal-selection: rgba(255, 255, 255, 0.15);
  --terminal-ansi-black: #1a1a2e;
  --terminal-ansi-red: #ff5555;
  --terminal-ansi-green: #50fa7b;
  --terminal-ansi-yellow: #f1fa8c;
  --terminal-ansi-blue: #6272a4;
  --terminal-ansi-magenta: #ff79c6;
  --terminal-ansi-cyan: #8be9fd;
  --terminal-ansi-white: #f8f8f2;
  --terminal-ansi-bright-black: #44475a;
  --terminal-ansi-bright-red: #ff6e6e;
  --terminal-ansi-bright-green: #69ff94;
  --terminal-ansi-bright-yellow: #ffffa5;
  --terminal-ansi-bright-blue: #d6acff;
  --terminal-ansi-bright-magenta: #ff92df;
  --terminal-ansi-bright-cyan: #a4ffff;
  --terminal-ansi-bright-white: #ffffff;
```

For each theme, derive appropriate terminal colors from the theme's existing palette:
- **cipher-ivory (light):** dark text on light bg
- **nord:** Nord palette ANSI colors
- **matrix:** green-on-black
- **synthwave:** neon on dark purple
- **gruvbox-dark:** gruvbox ANSI palette
- **blueprint:** blue tones
- **brutalist:** high contrast mono
- **warm-paper:** warm tones
- **high-contrast:** maximum contrast
- **cvd-*** themes: CVD-safe palette variants

- [ ] **Step 7: Wire xterm.js theme to CSS variables**

In `src/renderer/components/SessionCell.tsx` (or wherever xterm.js Terminal is instantiated), read CSS variables and pass them as the xterm.js `theme` option:

```typescript
function getTerminalTheme(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string) => style.getPropertyValue(name).trim()
  return {
    background: get('--terminal-bg') || undefined,
    foreground: get('--terminal-foreground') || undefined,
    cursor: get('--terminal-cursor') || undefined,
    selectionBackground: get('--terminal-selection') || undefined,
    black: get('--terminal-ansi-black') || undefined,
    red: get('--terminal-ansi-red') || undefined,
    green: get('--terminal-ansi-green') || undefined,
    yellow: get('--terminal-ansi-yellow') || undefined,
    blue: get('--terminal-ansi-blue') || undefined,
    magenta: get('--terminal-ansi-magenta') || undefined,
    cyan: get('--terminal-ansi-cyan') || undefined,
    white: get('--terminal-ansi-white') || undefined,
    brightBlack: get('--terminal-ansi-bright-black') || undefined,
    brightRed: get('--terminal-ansi-bright-red') || undefined,
    brightGreen: get('--terminal-ansi-bright-green') || undefined,
    brightYellow: get('--terminal-ansi-bright-yellow') || undefined,
    brightBlue: get('--terminal-ansi-bright-blue') || undefined,
    brightMagenta: get('--terminal-ansi-bright-magenta') || undefined,
    brightCyan: get('--terminal-ansi-bright-cyan') || undefined,
    brightWhite: get('--terminal-ansi-bright-white') || undefined,
  }
}
```

Apply this theme when creating the Terminal instance and when the theme changes. Look for where `new Terminal(...)` is called and add `theme: getTerminalTheme()` to the options.

Also add a listener for theme changes to update the terminal theme dynamically.

- [ ] **Step 8: Build and verify**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: theme-editor cleanup — session tokens, terminal colors (T-THEME.1/3/4)

Removes redundant --session-font-size and --shadow-inset tokens.
Fixes --session-text and --session-border CSS wiring. Removes
terminal font/size/line-height group (lives in A11Y settings).
Adds 20 terminal color tokens (bg, fg, cursor, selection + 16 ANSI)
to all 14 theme CSS files and wires them to xterm.js."
```

---

## Wave 3 — Task 6: Barge-In Amplitude Detector (Worker 3-B)

### File Map

| Action | File |
|--------|------|
| Create | `src/main/voice/barge-in-detector.ts` |
| Modify | `src/main/voice/conversation-engine.ts` |

- [ ] **Step 1: Create barge-in-detector.ts**

Create `src/main/voice/barge-in-detector.ts`:

```typescript
/**
 * BargeInDetector — amplitude-based barge-in detection.
 *
 * Monitors audio RMS amplitude and fires a callback when a sharp onset
 * is detected (loud enough for long enough). Runs independently of the
 * echo guard and VAD/STT pipeline, allowing barge-in even while the
 * echo guard suppresses normal VAD triggers during TTS playback.
 */

export interface BargeInDetectorOptions {
  /** RMS threshold in dB (default: -30). Audio louder than this is considered onset. */
  thresholdDb?: number
  /** Minimum duration in ms the signal must exceed threshold (default: 50). */
  minDurationMs?: number
  /** Callback fired when barge-in is detected. */
  onBargeIn: () => void
}

export class BargeInDetector {
  private thresholdLinear: number
  private minDurationMs: number
  private onBargeIn: () => void
  private enabled = false
  private onsetStartTime: number | null = null
  private fired = false

  constructor(opts: BargeInDetectorOptions) {
    const thresholdDb = opts.thresholdDb ?? -30
    this.thresholdLinear = Math.pow(10, thresholdDb / 20)
    this.minDurationMs = opts.minDurationMs ?? 50
    this.onBargeIn = opts.onBargeIn
  }

  /** Enable or disable the detector. Resets state on disable. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.onsetStartTime = null
      this.fired = false
    }
  }

  /**
   * Feed an audio frame (Int16 PCM samples) for amplitude analysis.
   * Call this with each audio frame from the microphone stream.
   */
  processFrame(samples: Int16Array): void {
    if (!this.enabled || this.fired) return

    const rms = this.computeRMS(samples)

    if (rms >= this.thresholdLinear) {
      if (this.onsetStartTime === null) {
        this.onsetStartTime = Date.now()
      } else if (Date.now() - this.onsetStartTime >= this.minDurationMs) {
        this.fired = true
        this.onBargeIn()
      }
    } else {
      // Signal dropped below threshold — reset onset tracking
      this.onsetStartTime = null
    }
  }

  /** Compute RMS of Int16 PCM samples, normalized to 0..1 range. */
  private computeRMS(samples: Int16Array): number {
    if (samples.length === 0) return 0
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] / 32768
      sum += normalized * normalized
    }
    return Math.sqrt(sum / samples.length)
  }
}
```

- [ ] **Step 2: Integrate into ConversationEngine**

In `src/main/voice/conversation-engine.ts`:

Add import at the top:
```typescript
import { BargeInDetector } from './barge-in-detector'
```

Add field to the class (after the existing barge-in fields, around line 93):
```typescript
  private _bargeInDetector: BargeInDetector
```

Initialize in the constructor (after `this.stateMachine` setup, around line 119):
```typescript
    this._bargeInDetector = new BargeInDetector({
      thresholdDb: -30,
      minDurationMs: 50,
      onBargeIn: () => {
        if (this.state === VoiceState.AGENT_SPEAKING) {
          console.log('[ConvEngine] Barge-in detected via amplitude monitor')
          this._handleBargeIn()
        }
      },
    })
```

- [ ] **Step 3: Wire state transitions**

In `conversation-engine.ts`, in the `onTransition` callback (around line 120-133), add detector enable/disable:

After the existing echo guard activation for `AGENT_SPEAKING`:
```typescript
      // Enable amplitude-based barge-in detector during agent speech
      if (newState === VoiceState.AGENT_SPEAKING) {
        this._bargeInDetector.setEnabled(true)
      }
      if (oldState === VoiceState.AGENT_SPEAKING) {
        this._bargeInDetector.setEnabled(false)
      }
```

- [ ] **Step 4: Feed audio frames to detector**

Find where audio frames from the microphone are received (likely in the VAD/audio capture pipeline). The ConversationEngine needs a method to receive raw audio frames:

```typescript
  /** Feed raw audio frames for amplitude-based barge-in detection. */
  feedAudioFrame(samples: Int16Array): void {
    this._bargeInDetector.processFrame(samples)
  }
```

Then find where audio frames are dispatched to VAD (likely in `voice-manager.ts` or the audio capture module) and add a call to `conversationEngine.feedAudioFrame(samples)` alongside the existing VAD feed.

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add src/main/voice/barge-in-detector.ts src/main/voice/conversation-engine.ts
git commit -m "feat: amplitude-based barge-in detector (T-VOICE.12)

Adds BargeInDetector that monitors microphone RMS amplitude
independently of VAD/STT and echo guard. During AGENT_SPEAKING
state, a sharp audio onset (>threshold for >50ms) triggers
_handleBargeIn() directly, bypassing the echo guard that blocks
normal VAD triggers. The echo guard remains active for VAD/STT
to prevent echo hallucinations."
```

---

## Wave 4 — Testing Handoff

After all implementation waves are complete:

- [ ] **Step 1: Create testcase note**

Create a testcase note via `mux_notes_create` with tag `kind:testcase` listing all affected test cases:

```markdown
- [ ] **T-BVRL.3** Bugreport Dialog: "Verarbeiten" startet Hintergrund-Session
- [ ] **T-BVRL.4** Bugreport Dialog: Warte-Anzeige waehrend Session arbeitet
- [ ] **T-BVRL.5** Bugreport Dialog: strukturierter Report wird angezeigt
- [ ] **T-BVRL.7** Bugreport Dialog: "Absenden" erzeugt GitHub Issue
- [ ] **T-BVRL.9** Bugreport Dialog: Session wird nach Verarbeitung beendet
- [ ] **T-BVRL.11** Bugreport Dialog: Timeout nach 120s
- [ ] **T-FW.22** Keep-Working: keine doppelten Hintergrundsessions nach Restart
- [ ] **T-THEME.1** Theme-Editor: Session-Gruppe zeigt nur funktionierende Tokens
- [ ] **T-THEME.3** Theme-Editor: Terminal-Farben wirken auf xterm.js
- [ ] **T-THEME.4** Theme-Editor: keine Terminal-Font-Controls (lebt in A11Y)
- [ ] **T-FW.10** Theme-Editor: Token-Aenderungen werden live angewendet
- [ ] **T-VOICE.12** Barge-In: Unterbrechung waehrend TTS-Playback moeglich
- [ ] **T-PRESET.1** Preset-Editor: kein Copy as Custom, besseres Template
```

- [ ] **Step 2: Hand off to Testing-Assistant**

Use `mux_cyber_factory_handoff_testing` referencing the testcase note ID.
