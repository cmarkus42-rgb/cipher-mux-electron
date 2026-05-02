# Welle 5 — Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip all feature flags to production defaults, fix test regressions, create migration script with reverse mode, prepare cutover evidence structure.

**Architecture:** Feature flags in ConfigStore defaults flip to `true`. A standalone migration script (`scripts/migrate-to-cyber-factory.ts`) transforms user config files (JSON) from old naming (mpo, watchdog) to new naming (cyber-factory, testing-assistant). Reverse mode undoes the transformation. All 12 test failures get fixed to establish a green baseline.

**Tech Stack:** TypeScript, node:test, node:fs, ConfigStore JSON format

---

### Task 1: Fix entity-registry tests (count + projectPath)

**Files:**
- Modify: `test/main/entity-registry.test.ts:93-128`

- [ ] **Step 1: Update entity count and expected IDs**

The registry now has 10 builtin entities (added debugger + testing-assistant in Welle 4). The test expects 8 and is missing both IDs.

```typescript
// test/main/entity-registry.test.ts — line 93
it('registers all 10 builtin entities', () => {
  const registry = new EntityRegistry()
  registerBuiltinEntities(registry, '~/.config/cipher-mux/orchestrator', '~/.config/cipher-mux/cyber-factory')
  const entities = registry.list()
  assert.strictEqual(entities.length, 10)
  const ids = entities.map((e: any) => e.id).sort()
  assert.deepStrictEqual(ids, [
    'audit', 'companion', 'cyber-factory', 'debugger',
    'ideation-partner', 'launcher', 'orchestrator',
    'refinement', 'testing-assistant', 'voice-relay',
  ])
})
```

- [ ] **Step 2: Fix projectPath test — params are ignored (prefixed with `_`)**

`registerBuiltinEntities` ignores its dir params (they're `_orchestratorDir`, `_cyberFactoryDir`). The test asserts custom paths that never get used. Fix to assert actual paths.

```typescript
// test/main/entity-registry.test.ts — line 121
it('orchestrator gets correct projectPath from entitiesBase', () => {
  const registry = new EntityRegistry()
  registerBuiltinEntities(registry)
  const orch = registry.get('orchestrator')
  assert.ok(orch?.projectPath.endsWith('/entities/orchestrator'))
  const cf = registry.get('cyber-factory')
  assert.ok(cf?.projectPath.endsWith('/entities/cyber-factory'))
})
```

- [ ] **Step 3: Run tests to verify**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/entity-registry.test.ts`
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add test/main/entity-registry.test.ts
git commit -m "fix(test): update entity-registry tests for 10 builtin entities"
```

---

### Task 2: Delete orphaned template test files

**Files:**
- Delete: `test/main/orchestrator-template.test.ts`
- Delete: `test/main/mpo-template.test.ts`

Source files `src/main/session/orchestrator-template.ts` and `src/main/session/mpo-template.ts` were removed in Welle 2 (MPO replaced by Cyber Factory). The test files were left behind.

- [ ] **Step 1: Delete test files**

```bash
rm test/main/orchestrator-template.test.ts test/main/mpo-template.test.ts
```

- [ ] **Step 2: Verify no other imports reference these**

```bash
grep -rn "orchestrator-template\|mpo-template" test/ src/ --include="*.ts" | grep -v node_modules
```

Expected: no matches (source files already deleted)

- [ ] **Step 3: Commit**

```bash
git add -A test/main/orchestrator-template.test.ts test/main/mpo-template.test.ts
git commit -m "fix(test): remove orphaned mpo-template + orchestrator-template tests"
```

---

### Task 3: Fix VoiceInputRouter test stub

**Files:**
- Modify: `test/main/voice-input-router.test.ts:5-11`

The `autoUnpinIfBackground()` method (added in Welle 4) calls `this.sessionManager.getSessionStore().getGridState()`. The test stub needs this method. Since the tests don't test the auto-unpin feature itself, the stub just returns empty grid state.

- [ ] **Step 1: Extend the stub with `getSessionStore`**

```typescript
// test/main/voice-input-router.test.ts — replace makeStubSessionManager (lines 5-11)
function makeStubSessionManager(sessions: Map<string, { id: string; name: string; status: string }>) {
  return {
    sendKeys: async (_id: string, _keys: string) => {},
    get: (id: string) => sessions.get(id) ?? undefined,
    getEntitySessionId: (_entityId: string) => null,
    getSessionStore: () => ({
      getGridState: () => ({ slots: [] }),
    }),
  }
}
```

- [ ] **Step 2: Run tests to verify**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/voice-input-router.test.ts`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add test/main/voice-input-router.test.ts
git commit -m "fix(test): add getSessionStore stub to VoiceInputRouter tests"
```

---

### Task 4: Fix resolvePrompt tests (BUILTIN_PERSONAS only has 'empty')

**Files:**
- Modify: `test/main/workspace-manager.test.ts:45-113`

`BUILTIN_PERSONAS` only contains `{ id: 'empty' }`. Tests reference `orchestrator` persona which doesn't exist in builtins — it's a seed custom persona now. Fix by creating test fixture personas instead of depending on BUILTIN_PERSONAS for non-empty defaults.

- [ ] **Step 1: Add test fixture personas and fix 3 failing tests**

```typescript
// test/main/workspace-manager.test.ts — add after makeCell helper (line 24)
const TEST_PERSONAS: Persona[] = [
  ...BUILTIN_PERSONAS,
  { id: 'orchestrator', name: 'Orchestrator', color: '#4fc3f7', defaultPrompt: 'You orchestrate tasks.' },
  { id: 'worker', name: 'Worker', color: '#66bb6a', defaultPrompt: 'You implement features.' },
]
```

Then replace `[...BUILTIN_PERSONAS]` with `TEST_PERSONAS` in the 3 failing tests:

- Line 48: `resolvePrompt(ws, cell, TEST_PERSONAS)` and find orchestrator in `TEST_PERSONAS`
- Line 74: same pattern
- Line 110: same pattern

Full replacements:

```typescript
// Line 45-52: "persona default used when no cell prompt..."
it('persona default used when no cell prompt or workspace override (source: persona-default)', () => {
  const ws = makeWorkspace()
  const cell = makeCell({ persona: 'orchestrator', prompt: '' })
  const result = resolvePrompt(ws, cell, TEST_PERSONAS)
  const orchestratorPersona = TEST_PERSONAS.find((p) => p.id === 'orchestrator')!
  assert.strictEqual(result.text, orchestratorPersona.defaultPrompt)
  assert.strictEqual(result.source, 'persona-default')
})

// Line 70-77: "whitespace-only cell prompt falls through to persona default..."
it('whitespace-only cell prompt falls through to persona default when no override', () => {
  const ws = makeWorkspace()
  const cell = makeCell({ persona: 'orchestrator', prompt: '\t\n ' })
  const orchestratorPersona = TEST_PERSONAS.find((p) => p.id === 'orchestrator')!
  const result = resolvePrompt(ws, cell, TEST_PERSONAS)
  assert.strictEqual(result.text, orchestratorPersona.defaultPrompt)
  assert.strictEqual(result.source, 'persona-default')
})

// Line 106-113: "workspace override that is whitespace-only falls through..."
it('workspace override that is whitespace-only falls through to persona default', () => {
  const ws = makeWorkspace({ promptOverrides: { orchestrator: '   ' } })
  const cell = makeCell({ persona: 'orchestrator', prompt: '' })
  const orchestratorPersona = TEST_PERSONAS.find((p) => p.id === 'orchestrator')!
  const result = resolvePrompt(ws, cell, TEST_PERSONAS)
  assert.strictEqual(result.text, orchestratorPersona.defaultPrompt)
  assert.strictEqual(result.source, 'persona-default')
})
```

- [ ] **Step 2: Run tests to verify**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/workspace-manager.test.ts`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add test/main/workspace-manager.test.ts
git commit -m "fix(test): use fixture personas in resolvePrompt tests"
```

---

### Task 5: Fix BugreportTaskSource flaky test

**Files:**
- Check: `test/main/bugreport-source.test.ts:53-74`

This test uses `fs.watch` which is flaky on macOS. Run the test to confirm — if it passes now, no fix needed. If it fails consistently, increase the timeout.

- [ ] **Step 1: Run the test 3 times**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron
npx tsx --test test/main/bugreport-source.test.ts
npx tsx --test test/main/bugreport-source.test.ts
npx tsx --test test/main/bugreport-source.test.ts
```

If 2/3 pass → flaky, leave as-is. If 3/3 fail → investigate and fix.

- [ ] **Step 2: Commit if changed**

---

### Task 6: Verify green baseline after test fixes

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/**/*.test.ts 2>&1 | tail -15
```

Expected: 0 failures (or only the flaky bugreport-source if Task 5 determined it's timing-only)

---

### Task 7: Flip feature flag defaults to production

**Files:**
- Modify: `src/main/config/config-store.ts:112-132`
- Modify: `src/shared/types.ts:296-307`

- [ ] **Step 1: Add missing flags to types.ts**

In `src/shared/types.ts` the `experimental` type definition is missing `testing_assistant` and `audit_full` — but wait, they ARE there (lines 304-306). Confirmed. No type change needed.

Actually, re-check: the defaults in config-store.ts (line 128-132) only have 3 flags:
```
refinement_v2: false,
ideation_partner: false,
cyber_factory: true,
```

Missing: `testing_assistant` and `audit_full`. Need to add them AND flip all to true.

- [ ] **Step 2: Update experimental defaults in config-store.ts**

```typescript
// src/main/config/config-store.ts — replace lines 128-132
experimental: {
  refinement_v2: true,
  ideation_partner: true,
  cyber_factory: true,
  testing_assistant: true,
  audit_full: true,
},
```

- [ ] **Step 3: Flip debugger.enabled and testing_assistant.enabled and audit_config.enabled**

```typescript
// src/main/config/config-store.ts — line 83 (DEBUGGER_DEFAULTS has enabled: false)
// Change debugger default:
debugger: { ...DEBUGGER_DEFAULTS, enabled: true },

// line 114: testing_assistant.enabled
testing_assistant: {
  enabled: true,  // was false
  ...rest stays same
},

// line 122: audit_config.enabled
audit_config: {
  enabled: true,  // was false
  ...rest stays same
},
```

- [ ] **Step 4: Run tests to verify no regressions**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/**/*.test.ts 2>&1 | tail -15
```

- [ ] **Step 5: Commit**

```bash
git add src/main/config/config-store.ts
git commit -m "feat(welle-5): flip all feature flags to production defaults"
```

---

### Task 8: Create migration script with reverse mode

**Files:**
- Create: `scripts/migrate-to-cyber-factory.ts`

The script reads `~/.config/cipher-mux/config.json`, transforms old keys, writes back. Reverse mode undoes. It operates on the USER's config file, not on code defaults.

Transformations:
1. `config.mpo` section → rename to `cyber_factory` (merge with existing cyber_factory if present)
2. Workspace personas: `"mpo"` → `"cyber-factory"` in cells
3. Workspace personas: `"watchdog"` → `"testing-assistant"` in cells
4. Notes tags: `"mpo"` → `"cyber-factory"`
5. Entity overrides/hidden/sortOrders: `"mpo"` key → `"cyber-factory"` key

- [ ] **Step 1: Write the migration script**

```typescript
#!/usr/bin/env npx tsx
/**
 * migrate-to-cyber-factory.ts — Welle 5 Cutover migration
 *
 * Usage:
 *   npx tsx scripts/migrate-to-cyber-factory.ts [--reverse] [--dry-run] [--config <path>]
 *
 * Transforms user config from MPO/Watchdog naming to Cyber Factory/Testing Assistant.
 * --reverse: undo the migration
 * --dry-run: print what would change without writing
 * --config:  path to config.json (default: ~/.config/cipher-mux/config.json)
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

interface MigrationResult {
  changes: string[]
  warnings: string[]
}

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'cipher-mux', 'config.json')

function readConfig(configPath: string): Record<string, any> {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

function writeConfig(configPath: string, config: Record<string, any>): void {
  const backupPath = configPath + '.pre-cutover-backup'
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(configPath, backupPath)
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

function renameKey(
  obj: Record<string, any>,
  oldKey: string,
  newKey: string,
  result: MigrationResult,
  context: string,
): void {
  if (oldKey in obj && !(newKey in obj)) {
    obj[newKey] = obj[oldKey]
    delete obj[oldKey]
    result.changes.push(`${context}: renamed "${oldKey}" → "${newKey}"`)
  } else if (oldKey in obj && newKey in obj) {
    delete obj[oldKey]
    result.changes.push(`${context}: removed "${oldKey}" (new key "${newKey}" already exists)`)
  }
}

function migrateForward(config: Record<string, any>): MigrationResult {
  const result: MigrationResult = { changes: [], warnings: [] }

  // 1. ConfigStore section: mpo → cyber_factory
  if (config.mpo && !config.cyber_factory) {
    config.cyber_factory = config.mpo
    delete config.mpo
    result.changes.push('config section: mpo → cyber_factory')
  } else if (config.mpo && config.cyber_factory) {
    delete config.mpo
    result.changes.push('config section: removed mpo (cyber_factory already exists)')
  }

  // 2. Workspaces: persona renaming in cells
  if (Array.isArray(config.workspaces)) {
    for (const ws of config.workspaces) {
      if (!Array.isArray(ws.cells)) continue
      for (const cell of ws.cells) {
        if (cell.persona === 'mpo') {
          cell.persona = 'cyber-factory'
          result.changes.push(`workspace "${ws.name}": cell persona mpo → cyber-factory`)
        }
        if (cell.persona === 'watchdog') {
          cell.persona = 'testing-assistant'
          result.changes.push(`workspace "${ws.name}": cell persona watchdog → testing-assistant`)
        }
      }
      // promptOverrides
      if (ws.promptOverrides) {
        renameKey(ws.promptOverrides, 'mpo', 'cyber-factory', result, `workspace "${ws.name}" promptOverrides`)
        renameKey(ws.promptOverrides, 'watchdog', 'testing-assistant', result, `workspace "${ws.name}" promptOverrides`)
      }
    }
  }

  // 3. Entity-related maps: sortOrders, hidden, personaOverrides
  for (const mapKey of ['entitySortOrders', 'entityHidden', 'entityPersonaOverrides']) {
    if (config[mapKey]) {
      renameKey(config[mapKey], 'mpo', 'cyber-factory', result, mapKey)
      renameKey(config[mapKey], 'watchdog', 'testing-assistant', result, mapKey)
    }
  }

  // 4. Feature flags: ensure experimental defaults
  if (!config.experimental) config.experimental = {}
  const exp = config.experimental
  const flagDefaults: Record<string, boolean> = {
    refinement_v2: true,
    ideation_partner: true,
    cyber_factory: true,
    testing_assistant: true,
    audit_full: true,
  }
  for (const [key, val] of Object.entries(flagDefaults)) {
    if (!(key in exp)) {
      exp[key] = val
      result.changes.push(`experimental.${key}: set to ${val}`)
    }
  }

  // 5. Module enables
  if (config.debugger && !config.debugger.enabled) {
    config.debugger.enabled = true
    result.changes.push('debugger.enabled: false → true')
  }
  if (config.testing_assistant && !config.testing_assistant.enabled) {
    config.testing_assistant.enabled = true
    result.changes.push('testing_assistant.enabled: false → true')
  }
  if (config.audit_config && !config.audit_config.enabled) {
    config.audit_config.enabled = true
    result.changes.push('audit_config.enabled: false → true')
  }

  if (result.changes.length === 0) {
    result.warnings.push('No changes needed — config already migrated')
  }

  return result
}

function migrateReverse(config: Record<string, any>): MigrationResult {
  const result: MigrationResult = { changes: [], warnings: [] }

  // 1. cyber_factory → mpo
  if (config.cyber_factory && !config.mpo) {
    config.mpo = config.cyber_factory
    delete config.cyber_factory
    result.changes.push('config section: cyber_factory → mpo')
  }

  // 2. Workspaces: reverse persona renaming
  if (Array.isArray(config.workspaces)) {
    for (const ws of config.workspaces) {
      if (!Array.isArray(ws.cells)) continue
      for (const cell of ws.cells) {
        if (cell.persona === 'cyber-factory') {
          cell.persona = 'mpo'
          result.changes.push(`workspace "${ws.name}": cell persona cyber-factory → mpo`)
        }
        if (cell.persona === 'testing-assistant') {
          cell.persona = 'watchdog'
          result.changes.push(`workspace "${ws.name}": cell persona testing-assistant → watchdog`)
        }
      }
      if (ws.promptOverrides) {
        renameKey(ws.promptOverrides, 'cyber-factory', 'mpo', result, `workspace "${ws.name}" promptOverrides`)
        renameKey(ws.promptOverrides, 'testing-assistant', 'watchdog', result, `workspace "${ws.name}" promptOverrides`)
      }
    }
  }

  // 3. Entity maps
  for (const mapKey of ['entitySortOrders', 'entityHidden', 'entityPersonaOverrides']) {
    if (config[mapKey]) {
      renameKey(config[mapKey], 'cyber-factory', 'mpo', result, mapKey)
      renameKey(config[mapKey], 'testing-assistant', 'watchdog', result, mapKey)
    }
  }

  // 4. Experimental flags: revert to old defaults
  if (config.experimental) {
    const revert: Record<string, boolean> = {
      refinement_v2: false,
      ideation_partner: false,
      testing_assistant: false,
      audit_full: false,
    }
    for (const [key, val] of Object.entries(revert)) {
      if (key in config.experimental) {
        config.experimental[key] = val
        result.changes.push(`experimental.${key}: reverted to ${val}`)
      }
    }
    // cyber_factory stays true (it was already true pre-cutover)
  }

  // 5. Module disables
  if (config.debugger) { config.debugger.enabled = false; result.changes.push('debugger.enabled → false') }
  if (config.testing_assistant) { config.testing_assistant.enabled = false; result.changes.push('testing_assistant.enabled → false') }
  if (config.audit_config) { config.audit_config.enabled = false; result.changes.push('audit_config.enabled → false') }

  if (result.changes.length === 0) {
    result.warnings.push('No changes needed — config already in pre-cutover state')
  }

  return result
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2)
  const reverse = args.includes('--reverse')
  const dryRun = args.includes('--dry-run')
  const configIdx = args.indexOf('--config')
  const configPath = configIdx >= 0 && args[configIdx + 1]
    ? args[configIdx + 1]
    : DEFAULT_CONFIG_PATH

  console.log(`\n=== Cyber Factory Cutover Migration ${reverse ? '(REVERSE)' : '(FORWARD)'} ===`)
  console.log(`Config: ${configPath}`)
  if (dryRun) console.log('Mode: DRY RUN (no changes written)\n')

  const config = readConfig(configPath)
  const result = reverse ? migrateReverse(config) : migrateForward(config)

  if (result.changes.length > 0) {
    console.log('\nChanges:')
    for (const c of result.changes) console.log(`  ✓ ${c}`)
  }
  if (result.warnings.length > 0) {
    console.log('\nWarnings:')
    for (const w of result.warnings) console.log(`  ⚠ ${w}`)
  }

  if (!dryRun && result.changes.length > 0) {
    writeConfig(configPath, config)
    console.log(`\nConfig written. Backup at: ${configPath}.pre-cutover-backup`)
  }

  console.log('\nDone.\n')
}

main()
```

- [ ] **Step 2: Commit**

```bash
git add scripts/migrate-to-cyber-factory.ts
git commit -m "feat(welle-5): migration script with forward + reverse mode"
```

---

### Task 9: Write migration tests

**Files:**
- Create: `test/main/migrate-to-cyber-factory.test.ts`

Tests import the migration functions directly and verify transformations on in-memory config objects.

- [ ] **Step 1: Write the tests**

Extract `migrateForward` and `migrateReverse` as named exports from the script (add `export` keyword to both functions). Then write tests:

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { migrateForward, migrateReverse } from '../../scripts/migrate-to-cyber-factory'

describe('migrateForward', () => {
  it('renames mpo config section to cyber_factory', () => {
    const config: any = { mpo: { maxWorkers: 3 } }
    const result = migrateForward(config)
    assert.deepStrictEqual(config.cyber_factory, { maxWorkers: 3 })
    assert.strictEqual(config.mpo, undefined)
    assert.ok(result.changes.length > 0)
  })

  it('removes mpo section when cyber_factory already exists', () => {
    const config: any = { mpo: { old: true }, cyber_factory: { new: true } }
    migrateForward(config)
    assert.strictEqual(config.mpo, undefined)
    assert.deepStrictEqual(config.cyber_factory, { new: true })
  })

  it('renames workspace cell personas mpo → cyber-factory', () => {
    const config: any = {
      workspaces: [{
        name: 'test', cells: [
          { persona: 'mpo', project: '', prompt: '' },
          { persona: 'worker', project: '', prompt: '' },
        ],
        promptOverrides: {},
      }],
    }
    migrateForward(config)
    assert.strictEqual(config.workspaces[0].cells[0].persona, 'cyber-factory')
    assert.strictEqual(config.workspaces[0].cells[1].persona, 'worker')
  })

  it('renames watchdog → testing-assistant in cells', () => {
    const config: any = {
      workspaces: [{
        name: 'test', cells: [{ persona: 'watchdog', project: '', prompt: '' }],
        promptOverrides: {},
      }],
    }
    migrateForward(config)
    assert.strictEqual(config.workspaces[0].cells[0].persona, 'testing-assistant')
  })

  it('renames entity map keys', () => {
    const config: any = {
      entitySortOrders: { mpo: 20, companion: 40 },
      entityHidden: { watchdog: true },
    }
    migrateForward(config)
    assert.strictEqual(config.entitySortOrders['cyber-factory'], 20)
    assert.strictEqual(config.entitySortOrders.mpo, undefined)
    assert.strictEqual(config.entityHidden['testing-assistant'], true)
    assert.strictEqual(config.entityHidden.watchdog, undefined)
  })

  it('sets experimental flags to true', () => {
    const config: any = { experimental: {} }
    migrateForward(config)
    assert.strictEqual(config.experimental.refinement_v2, true)
    assert.strictEqual(config.experimental.testing_assistant, true)
    assert.strictEqual(config.experimental.audit_full, true)
  })

  it('enables module flags', () => {
    const config: any = {
      debugger: { enabled: false },
      testing_assistant: { enabled: false },
      audit_config: { enabled: false },
    }
    migrateForward(config)
    assert.strictEqual(config.debugger.enabled, true)
    assert.strictEqual(config.testing_assistant.enabled, true)
    assert.strictEqual(config.audit_config.enabled, true)
  })

  it('reports no changes when already migrated', () => {
    const config: any = {
      cyber_factory: { enabled: true },
      experimental: {
        refinement_v2: true, ideation_partner: true, cyber_factory: true,
        testing_assistant: true, audit_full: true,
      },
      debugger: { enabled: true },
      testing_assistant: { enabled: true },
      audit_config: { enabled: true },
    }
    const result = migrateForward(config)
    assert.strictEqual(result.changes.length, 0)
    assert.ok(result.warnings.length > 0)
  })

  it('renames promptOverrides keys', () => {
    const config: any = {
      workspaces: [{
        name: 'test', cells: [],
        promptOverrides: { mpo: 'custom mpo prompt', watchdog: 'watch prompt' },
      }],
    }
    migrateForward(config)
    assert.strictEqual(config.workspaces[0].promptOverrides['cyber-factory'], 'custom mpo prompt')
    assert.strictEqual(config.workspaces[0].promptOverrides['testing-assistant'], 'watch prompt')
    assert.strictEqual(config.workspaces[0].promptOverrides.mpo, undefined)
  })
})

describe('migrateReverse', () => {
  it('renames cyber_factory back to mpo', () => {
    const config: any = { cyber_factory: { maxWorkers: 3 } }
    migrateReverse(config)
    assert.deepStrictEqual(config.mpo, { maxWorkers: 3 })
    assert.strictEqual(config.cyber_factory, undefined)
  })

  it('reverts workspace cell personas', () => {
    const config: any = {
      workspaces: [{
        name: 'test', cells: [
          { persona: 'cyber-factory', project: '', prompt: '' },
          { persona: 'testing-assistant', project: '', prompt: '' },
        ],
        promptOverrides: {},
      }],
    }
    migrateReverse(config)
    assert.strictEqual(config.workspaces[0].cells[0].persona, 'mpo')
    assert.strictEqual(config.workspaces[0].cells[1].persona, 'watchdog')
  })

  it('reverts experimental flags', () => {
    const config: any = {
      experimental: {
        refinement_v2: true, ideation_partner: true, cyber_factory: true,
        testing_assistant: true, audit_full: true,
      },
    }
    migrateReverse(config)
    assert.strictEqual(config.experimental.refinement_v2, false)
    assert.strictEqual(config.experimental.ideation_partner, false)
    assert.strictEqual(config.experimental.cyber_factory, true) // stays true
    assert.strictEqual(config.experimental.testing_assistant, false)
    assert.strictEqual(config.experimental.audit_full, false)
  })

  it('disables module flags', () => {
    const config: any = {
      debugger: { enabled: true },
      testing_assistant: { enabled: true },
      audit_config: { enabled: true },
    }
    migrateReverse(config)
    assert.strictEqual(config.debugger.enabled, false)
    assert.strictEqual(config.testing_assistant.enabled, false)
    assert.strictEqual(config.audit_config.enabled, false)
  })

  it('round-trips: forward then reverse restores mpo section', () => {
    const original: any = {
      mpo: { maxWorkers: 3 },
      workspaces: [{
        name: 'ws', cells: [{ persona: 'mpo', project: '', prompt: '' }],
        promptOverrides: { mpo: 'test' },
      }],
      entitySortOrders: { mpo: 20 },
      entityHidden: { watchdog: true },
      debugger: { enabled: false },
      testing_assistant: { enabled: false },
      audit_config: { enabled: false },
    }
    const config = JSON.parse(JSON.stringify(original))
    migrateForward(config)
    migrateReverse(config)
    assert.deepStrictEqual(config.mpo, { maxWorkers: 3 })
    assert.strictEqual(config.workspaces[0].cells[0].persona, 'mpo')
    assert.strictEqual(config.entitySortOrders.mpo, 20)
    assert.strictEqual(config.entityHidden.watchdog, true)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/migrate-to-cyber-factory.test.ts
```

Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-to-cyber-factory.ts test/main/migrate-to-cyber-factory.test.ts
git commit -m "feat(welle-5): migration tests for forward + reverse cutover"
```

---

### Task 10: Create rollback shell script

**Files:**
- Create: `scripts/cutover-rollback.sh`

Thin wrapper that calls the migration script in reverse mode.

- [ ] **Step 1: Write rollback script**

```bash
#!/bin/bash
# cutover-rollback.sh — Reverts Cyber Factory Cutover (Welle 5)
#
# Usage: scripts/cutover-rollback.sh [--dry-run]
#
# Runs the migration script in reverse mode, restoring MPO/Watchdog naming.
# After running, restart cipher-mux for changes to take effect.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Cyber Factory Cutover ROLLBACK ==="
echo ""

EXTRA_ARGS=""
if [[ "${1:-}" == "--dry-run" ]]; then
  EXTRA_ARGS="--dry-run"
fi

npx tsx "$SCRIPT_DIR/migrate-to-cyber-factory.ts" --reverse $EXTRA_ARGS

echo ""
echo "Rollback complete. Restart cipher-mux to apply."
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x scripts/cutover-rollback.sh
git add scripts/cutover-rollback.sh
git commit -m "feat(welle-5): cutover rollback shell script"
```

---

### Task 11: Prepare cutover evidence structure

**Files:**
- Create: `docs/cutover-evidence/README.md`

- [ ] **Step 1: Create evidence directory with README**

```markdown
# Cutover Evidence — Welle 5

Pre-Cutover E2E validation runs. Each run gets its own file.

## Required (Pre-Mortem Grund 3)

5 echte Cyber-Factory-Runs mit Sub-Tasks variabler Komplexitaet.
Failure-Quote >20% blockiert den Cutover.

## Format pro Run

```
Run: <N>
Date: YYYY-MM-DD
Project: <project path>
Complexity: low | medium | high
Sub-Tasks: <count>
Result: PASS | FAIL
Duration: <minutes>
Notes: <free text>
```

## Status

- [ ] Run 1
- [ ] Run 2
- [ ] Run 3
- [ ] Run 4
- [ ] Run 5

Failure count: _/5
Failure quote: _%
Cutover blocked: yes/no
```

- [ ] **Step 2: Commit**

```bash
git add docs/cutover-evidence/README.md
git commit -m "docs(welle-5): cutover evidence structure for E2E validation"
```

---

### Task 12: Final full test run + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (Welle 5 status)

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsx --test test/main/**/*.test.ts 2>&1 | tail -15
```

Expected: 0 failures

- [ ] **Step 2: Update CLAUDE.md status table**

Add Welle 5 to the phase list and update status.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(welle-5): update CLAUDE.md — cutover infrastructure complete"
```
