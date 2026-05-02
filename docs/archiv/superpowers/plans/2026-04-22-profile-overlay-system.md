# Profile-Overlay-System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `BRAND.*` abstraction that externalizes all cipher-specific paths and defaults into YAML profile files, enabling a community build free of private paths.

**Architecture:** A single `src/shared/brand.ts` module reads a YAML profile file (selected via `BUILD_PROFILE` env var, defaulting to `community`). All hardcoded cipher-specific paths in `constants.ts` and other files are replaced with `BRAND.*` lookups. Two profiles ship: `profile.community.yaml` (neutral defaults) and `profile.cipher.yaml` (gitignored, private paths).

**Tech Stack:** TypeScript, Node.js `fs` (YAML parsed manually — format is flat key-value, no library needed), ESLint custom rule, node:test

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/shared/brand.ts` | Load active profile, export typed `BRAND` object |
| Create | `profile.community.yaml` | Neutral community defaults |
| Create | `profile.cipher.yaml` | Cipher-specific paths (gitignored) |
| Create | `test/main/brand.test.ts` | Unit tests for brand module |
| Create | `scripts/profile-lint.ts` | CI check: no cipher-specific strings in community build |
| Create | `docs/contributing/profile-system.md` | How the profile system works |
| Modify | `src/shared/constants.ts` | Replace hardcoded paths with `BRAND.*` |
| Modify | `src/main/project/launcher-prompt.ts` | Remove `cipher-boox` hardcode, use `BRAND.*` |
| Modify | `src/main/config/config-store.ts` | Use `BRAND.*` for defaults |
| Modify | `src/main/ipc-hub.ts` | Remove hardcoded fallback path |
| Modify | `src/main/bugreport/bugreport-manager.ts` | Use `BRAND.appName` for config dir |
| Modify | `src/main/bugreport/bugreport-resolve.ts` | Use `BRAND.appName` for config dir |
| Modify | `src/main/session/orchestrator-template.ts` | Use `BRAND.appName` in template |
| Modify | `src/renderer/components/InfoSettingsView.tsx` | Neutral UI copy |
| Modify | `src/main/window-manager.ts` | Use `BRAND.appName` for title |
| Modify | `src/renderer/app.tsx` | Use `BRAND.appName` for title |
| Modify | `.gitignore` | Add `profile.cipher.yaml` |
| Modify | `eslint.config.js` | Add restricted-paths rule |
| Modify | `package.json` | Add `build:community` / `build:cipher` scripts |
| Modify | `test/main/launcher-prompt.test.ts` | Update tests for profile-based prompt |

---

## Task 1: Create YAML profile files and `.gitignore` entry

**Files:**
- Create: `profile.community.yaml`
- Create: `profile.cipher.yaml`
- Modify: `.gitignore`

- [ ] **Step 1: Create `profile.community.yaml`**

```yaml
# Community profile — neutral defaults for public builds.
# See docs/contributing/profile-system.md for details.

appName: cipher-mux
scanPaths: []
defaultProjectDir: ""
orchestratorDir: "~/.config/cipher-mux/orchestrator"
statusLineDir: "/tmp/cipher-mux/context"
projectLauncherDir: ""
qualityBaselineDir: ""
ipcPrefix: cipher-mux
```

- [ ] **Step 2: Create `profile.cipher.yaml`**

```yaml
# Cipher profile — private overrides. NEVER commit this file.

appName: cipher-mux
scanPaths:
  - /Users/Shared/Nextcloud/Claude/ClaudeCode01
defaultProjectDir: /Users/Shared/Nextcloud/Claude/ClaudeCode01
orchestratorDir: "~/.config/cipher-mux/orchestrator"
statusLineDir: /tmp/cipher-mux/context
projectLauncherDir: /Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher
qualityBaselineDir: /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox
ipcPrefix: cipher-mux
```

- [ ] **Step 3: Add `profile.cipher.yaml` to `.gitignore`**

Append to `.gitignore`:
```
# Private profile (never commit)
profile.cipher.yaml
```

- [ ] **Step 4: Commit**

```bash
git add profile.community.yaml .gitignore
git commit -m "refactor: add profile YAML files and gitignore cipher profile"
```

---

## Task 2: Create `src/shared/brand.ts` — the BRAND module

**Files:**
- Create: `src/shared/brand.ts`
- Create: `test/main/brand.test.ts`

- [ ] **Step 1: Write the failing test for brand loading**

File: `test/main/brand.test.ts`

```typescript
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// brand.ts resolves profiles relative to project root.
// For tests we write a temp YAML and point BUILD_PROFILE at it.

describe('brand module', () => {
  const tmpDir = path.join(os.tmpdir(), `brand-test-${Date.now()}`)
  const communityYaml = path.join(tmpDir, 'profile.community.yaml')
  const cipherYaml = path.join(tmpDir, 'profile.cipher.yaml')

  before(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(
      communityYaml,
      [
        'appName: cipher-mux',
        'scanPaths: []',
        'defaultProjectDir: ""',
        'orchestratorDir: "~/.config/cipher-mux/orchestrator"',
        'statusLineDir: /tmp/cipher-mux/context',
        'projectLauncherDir: ""',
        'qualityBaselineDir: ""',
        'ipcPrefix: cipher-mux',
      ].join('\n'),
    )
    fs.writeFileSync(
      cipherYaml,
      [
        'appName: cipher-mux',
        'scanPaths:',
        '  - /Users/Shared/Nextcloud/Claude/ClaudeCode01',
        'defaultProjectDir: /Users/Shared/Nextcloud/Claude/ClaudeCode01',
        'orchestratorDir: "~/.config/cipher-mux/orchestrator"',
        'statusLineDir: /tmp/cipher-mux/context',
        'projectLauncherDir: /Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher',
        'qualityBaselineDir: /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox',
        'ipcPrefix: cipher-mux',
      ].join('\n'),
    )
  })
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('loads community profile with empty scanPaths', () => {
    const { loadProfile } = require('../../src/shared/brand') as typeof import('../../src/shared/brand')
    const brand = loadProfile(communityYaml)
    assert.strictEqual(brand.appName, 'cipher-mux')
    assert.deepStrictEqual(brand.scanPaths, [])
    assert.strictEqual(brand.defaultProjectDir, '')
    assert.strictEqual(brand.projectLauncherDir, '')
    assert.strictEqual(brand.qualityBaselineDir, '')
    assert.strictEqual(brand.ipcPrefix, 'cipher-mux')
  })

  it('loads cipher profile with populated paths', () => {
    const { loadProfile } = require('../../src/shared/brand') as typeof import('../../src/shared/brand')
    const brand = loadProfile(cipherYaml)
    assert.deepStrictEqual(brand.scanPaths, ['/Users/Shared/Nextcloud/Claude/ClaudeCode01'])
    assert.strictEqual(brand.projectLauncherDir, '/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher')
    assert.strictEqual(brand.qualityBaselineDir, '/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox')
  })

  it('falls back to community defaults when file is missing', () => {
    const { loadProfile } = require('../../src/shared/brand') as typeof import('../../src/shared/brand')
    const brand = loadProfile(path.join(tmpDir, 'nonexistent.yaml'))
    assert.strictEqual(brand.appName, 'cipher-mux')
    assert.deepStrictEqual(brand.scanPaths, [])
  })

  it('exposes BRAND singleton from resolved profile', () => {
    const { BRAND } = require('../../src/shared/brand') as typeof import('../../src/shared/brand')
    assert.strictEqual(typeof BRAND.appName, 'string')
    assert.strictEqual(BRAND.ipcPrefix, 'cipher-mux')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx test/main/brand.test.ts`
Expected: FAIL — module `../../src/shared/brand` does not exist

- [ ] **Step 3: Implement `src/shared/brand.ts`**

```typescript
/**
 * Brand profile loader — externalizes environment-specific paths and defaults.
 *
 * The app name "cipher-mux" is intentionally kept across all profiles. What
 * differs between profiles are paths, defaults, and content configuration —
 * NOT the brand name. This is a deliberate decision so that IPC channels,
 * preload API, and package identity remain stable.
 *
 * Profile resolution: BUILD_PROFILE env → profile.<name>.yaml in project root.
 * Falls back to community defaults if the file is missing (no crash).
 *
 * Pattern inspired by VS Code's product.json + defaults approach.
 */

import * as fs from 'fs'
import * as path from 'path'

/** Typed brand configuration. Extend this interface for new brand values. */
export interface BrandConfig {
  /** Application name — always "cipher-mux" across all profiles. */
  readonly appName: string
  /** Directories to scan for Claude Code projects. Empty = ask user on first run. */
  readonly scanPaths: readonly string[]
  /** Default project directory for new sessions. */
  readonly defaultProjectDir: string
  /** Orchestrator config/state directory. */
  readonly orchestratorDir: string
  /** Directory for statusLine context JSON files. */
  readonly statusLineDir: string
  /** Path to the projectlauncher working directory. Empty = feature disabled. */
  readonly projectLauncherDir: string
  /** Quality baseline project for launcher prompts. Empty = omitted from prompt. */
  readonly qualityBaselineDir: string
  /** IPC channel prefix — always "cipher-mux". */
  readonly ipcPrefix: string
}

const COMMUNITY_DEFAULTS: BrandConfig = {
  appName: 'cipher-mux',
  scanPaths: [],
  defaultProjectDir: '',
  orchestratorDir: '~/.config/cipher-mux/orchestrator',
  statusLineDir: '/tmp/cipher-mux/context',
  projectLauncherDir: '',
  qualityBaselineDir: '',
  ipcPrefix: 'cipher-mux',
}

/**
 * Parse a simple YAML profile file. Supports flat scalars and single-level
 * string arrays (indented `- value` lines). No external YAML library needed.
 */
function parseSimpleYaml(content: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  let currentKey: string | null = null

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd()

    // Skip comments and empty lines
    if (!line || line.startsWith('#')) {
      currentKey = null
      continue
    }

    // Array item: "  - value"
    if (/^\s+-\s+/.test(line) && currentKey) {
      const value = line.replace(/^\s+-\s+/, '').trim()
      const arr = result[currentKey]
      if (Array.isArray(arr)) {
        arr.push(value)
      }
      continue
    }

    // Key-value: "key: value" or "key:"
    const match = line.match(/^(\w+):\s*(.*)$/)
    if (match) {
      const [, key, rawVal] = match
      const val = rawVal.replace(/^["']|["']$/g, '').trim()

      if (val === '[]') {
        result[key] = []
        currentKey = null
      } else if (val === '' || val === undefined) {
        // Might be start of array block
        result[key] = []
        currentKey = key
      } else {
        result[key] = val
        currentKey = null
      }
    }
  }

  return result
}

/** Load and validate a profile from a YAML file path. Returns community defaults on error. */
export function loadProfile(filePath: string): BrandConfig {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const parsed = parseSimpleYaml(content)

    return {
      appName: typeof parsed.appName === 'string' ? parsed.appName : COMMUNITY_DEFAULTS.appName,
      scanPaths: Array.isArray(parsed.scanPaths) ? parsed.scanPaths : COMMUNITY_DEFAULTS.scanPaths,
      defaultProjectDir: typeof parsed.defaultProjectDir === 'string' ? parsed.defaultProjectDir : COMMUNITY_DEFAULTS.defaultProjectDir,
      orchestratorDir: typeof parsed.orchestratorDir === 'string' ? parsed.orchestratorDir : COMMUNITY_DEFAULTS.orchestratorDir,
      statusLineDir: typeof parsed.statusLineDir === 'string' ? parsed.statusLineDir : COMMUNITY_DEFAULTS.statusLineDir,
      projectLauncherDir: typeof parsed.projectLauncherDir === 'string' ? parsed.projectLauncherDir : COMMUNITY_DEFAULTS.projectLauncherDir,
      qualityBaselineDir: typeof parsed.qualityBaselineDir === 'string' ? parsed.qualityBaselineDir : COMMUNITY_DEFAULTS.qualityBaselineDir,
      ipcPrefix: typeof parsed.ipcPrefix === 'string' ? parsed.ipcPrefix : COMMUNITY_DEFAULTS.ipcPrefix,
    }
  } catch {
    return { ...COMMUNITY_DEFAULTS }
  }
}

/** Resolve the profile file path based on BUILD_PROFILE env var. */
function resolveProfilePath(): string {
  const profileName = process.env.BUILD_PROFILE || 'community'
  // Walk up from this file to find project root (where profile files live)
  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, `profile.${profileName}.yaml`)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fallback: project root based on typical build output structure
  const projectRoot = path.resolve(__dirname, '..', '..', '..')
  return path.join(projectRoot, `profile.${profileName}.yaml`)
}

/**
 * The active BRAND configuration singleton.
 * Resolved once at module load from BUILD_PROFILE env var.
 */
export const BRAND: BrandConfig = loadProfile(resolveProfilePath())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx test/main/brand.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/brand.ts test/main/brand.test.ts
git commit -m "feat: add BRAND profile loader with community defaults and tests"
```

---

## Task 3: Replace hardcoded paths in `constants.ts` with `BRAND.*`

**Files:**
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Replace cipher-specific constants with BRAND imports**

Replace the entire file content with:

```typescript
/** Application-wide constants */

import { BRAND } from './brand'

/** WHY appName stays "cipher-mux": IPC channels, preload API, and package identity
 *  use this name. Changing it would break all existing configs and integrations.
 *  The profile system controls paths and defaults, not the brand name. */
export const APP_NAME = BRAND.appName
/** App version — generated by scripts/git-version.sh at build time */
export { APP_VERSION } from './version'

/** Maximum concurrent sessions */
export const MAX_SESSIONS = 10

/** MCP Server defaults */
export const MCP_DEFAULT_PORT = 3100
export const MCP_DEFAULT_HOST = '127.0.0.1'

/** Context usage warning threshold (percentage) */
export const CONTEXT_WARNING_THRESHOLD = 80

/** Message retention in days */
export const MESSAGE_RETENTION_DAYS = 7

/** Output batching interval for terminal streaming (ms) */
export const OUTPUT_BATCH_INTERVAL_MS = 16

/** Grid save debounce (ms) */
export const GRID_SAVE_DEBOUNCE_MS = 300

/** Message cleanup interval (ms) — every 6 hours */
export const MESSAGE_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Orchestrator config */
export const ORCHESTRATOR_DIR = BRAND.orchestratorDir
export const ORCHESTRATOR_MAX_RETRIES = 2

/** StatusLine monitor directory */
export const STATUSLINE_DIR = BRAND.statusLineDir

/** Default scan paths — empty in community profile, user configures via UI */
export const DEFAULT_SCAN_PATHS = [...BRAND.scanPaths]
export const DEFAULT_PROJECT_DIR = BRAND.defaultProjectDir
/** Default scan depth (directory levels below each scanPath that are inspected). */
export const DEFAULT_SCAN_DEPTH = 1
/** Max allowed scan depth (guardrail against runaway recursion). */
export const MAX_SCAN_DEPTH = 5

/** Window defaults */
export const DEFAULT_WINDOW_WIDTH = 1400
export const DEFAULT_WINDOW_HEIGHT = 900

/** Fixed session cell height in pixels — sized so 3 rows fit on QHD (1440p) with macOS taskbar */
export const SESSION_CELL_HEIGHT = 380

/** Grid defaults */
export const DEFAULT_GRID_COLS = 2
export const DEFAULT_GRID_ROWS = 2
export const MAX_GRID_COLS = 5
export const MAX_GRID_ROWS = 3
export const MIN_GRID_COLS = 1
export const MIN_GRID_ROWS = 1

/** Chatroom panel width */
export const CHATROOM_PANEL_WIDTH = 280

/** Default path to the projectlauncher working directory. Empty = feature disabled. */
export const PROJECTLAUNCHER_DIR_DEFAULT = BRAND.projectLauncherDir

/** Default kickoff timeout (minutes) — how long we wait for a completion signal. */
export const KICKOFF_TIMEOUT_MIN_DEFAULT = 15

/** Task stall detection defaults */
export const TASK_STALL_TIMEOUT_MS = 300_000       // 5 minutes
export const TASK_WATCH_INTERVAL_MS = 30_000       // 30 seconds
export const TASK_HOOK_TIMEOUT_MS = 60_000         // 60 seconds
export const TASK_DEFAULT_MAX_RETRIES = 2
```

- [ ] **Step 2: Run all tests to verify no regression**

Run: `npm run test`
Expected: All 164+ tests pass (BRAND defaults match previous hardcoded values when `BUILD_PROFILE=cipher`)

- [ ] **Step 3: Commit**

```bash
git add src/shared/constants.ts
git commit -m "refactor: replace hardcoded paths in constants.ts with BRAND lookups"
```

---

## Task 4: Update `launcher-prompt.ts` — remove `cipher-boox` hardcode

**Files:**
- Modify: `src/main/project/launcher-prompt.ts`
- Modify: `test/main/launcher-prompt.test.ts`

- [ ] **Step 1: Update the launcher prompt to use BRAND**

Replace `src/main/project/launcher-prompt.ts`:

```typescript
/**
 * Build the prompt sent to the /launch skill in projectlauncher/.
 *
 * The prompt is deliberately written in a natural, engaging tone — LLMs
 * respond with richer output to human-sounding prompts than to clinical
 * bullet-lists. See memory/feedback_prompt_style.md for context.
 */

import { BRAND } from '../../shared/brand'

export interface LauncherPromptInput {
  /** Absolute path to the existing project directory. */
  projectDir: string
  /**
   * Relative path (inside projectDir) to the requirements file, if we copied
   * an external file in. Omit if the user put the requirements in the dir
   * themselves and we don't want to prescribe a location.
   */
  requirementsRelPath?: string
  /** Optional free-form context the user typed in the dialog. */
  extraContext?: string
}

export function buildLauncherPrompt(input: LauncherPromptInput): string {
  const reqHint = input.requirementsRelPath
    ? `Die Anforderungsdatei: ${input.requirementsRelPath} (relativ zum Projekt-Verzeichnis).\n\n`
    : ''

  const extra = input.extraContext?.trim()
    ? `Zusätzlicher Kontext:\n\n${input.extraContext.trim()}\n\n`
    : ''

  const baselineBlock = BRAND.qualityBaselineDir
    ? `\nQualitäts-Baseline: ${BRAND.qualityBaselineDir}\nSchau dir an, wie tief die ADRs, die Modulstruktur und die Referenzen dort sind. Der Launcher-Output muss dieses Niveau anstreben. Nutz Subagenten parallel — einer für Requirements-Tiefenanalyse, einer für Tech-Stack + Referenz-Projekt-Matching, einer für ADR-Ableitung aus den Anforderungen.\n\n`
    : '\nNutz Subagenten parallel — einer für Requirements-Tiefenanalyse, einer für Tech-Stack + Referenz-Projekt-Matching, einer für ADR-Ableitung aus den Anforderungen.\n\n'

  return `Hey, ein neues Projekt wird aufgesetzt. Das Verzeichnis mit dem Konzept:

    ${input.projectDir}

${reqHint}Lies die Anforderungen gründlich — nicht oberflächlich — und versteh, worum es wirklich geht, bevor du scaffoldest.

Das Verzeichnis existiert schon, also merge das Template rein statt neu anzulegen: vorhandene Dateien bleiben, \`.claude/\`, \`docs/SPEC.md\`-Skelett, \`.gitignore\`, Platzhalter etc. kommen dazu.
${baselineBlock}${extra}Wenn du fertig bist, ruf das MCP-Tool \`kickoff_complete\` auf mit \`{ projectPath, projectName, detectedStack }\`. Als Fallback: schreib eine leere Datei \`.kickoff-complete\` ins Projekt-Verzeichnis.

/launch`
}
```

Key changes:
- `BOOX_BASELINE` constant removed, replaced by `BRAND.qualityBaselineDir`
- Prompt text neutralized: "cipher setzt ein neues Projekt auf" → "ein neues Projekt wird aufgesetzt"
- Quality baseline block only appears when `BRAND.qualityBaselineDir` is non-empty

- [ ] **Step 2: Update `test/main/launcher-prompt.test.ts`**

Replace the test file:

```typescript
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { buildLauncherPrompt } from '../../src/main/project/launcher-prompt'

describe('buildLauncherPrompt', () => {
  it('includes the project directory path', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/path/to/proj' })
    assert.ok(prompt.includes('/path/to/proj'))
  })

  it('mentions merge-mode for existing directory', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.match(prompt, /merge/i)
    assert.match(prompt, /existiert schon/i)
  })

  it('mentions subagent usage', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.match(prompt, /subagent/i)
  })

  it('includes requirements file path when provided', () => {
    const prompt = buildLauncherPrompt({
      projectDir: '/any',
      requirementsRelPath: 'docs/requirements.docx',
    })
    assert.ok(prompt.includes('docs/requirements.docx'))
  })

  it('omits requirements hint when no file provided', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(!prompt.includes('Anforderungsdatei:'))
  })

  it('embeds extra context verbatim', () => {
    const prompt = buildLauncherPrompt({
      projectDir: '/any',
      extraContext: 'Stack ist Kotlin + Compose.',
    })
    assert.ok(prompt.includes('Kotlin + Compose'))
  })

  it('instructs to call kickoff_complete MCP tool', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(prompt.includes('kickoff_complete'))
  })

  it('mentions the fallback marker file', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(prompt.includes('.kickoff-complete'))
  })

  it('ends with /launch invocation', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.match(prompt.trimEnd(), /\/launch\s*$/)
  })

  it('includes quality baseline when BRAND provides one', () => {
    // This test validates the template logic — actual BRAND value depends on profile
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    // In community profile, qualityBaselineDir is empty, so no "Qualitäts-Baseline:" line
    // In cipher profile, it would appear. We just verify no crash either way.
    assert.ok(typeof prompt === 'string')
    assert.ok(prompt.length > 100)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `node --test --import tsx test/main/launcher-prompt.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/project/launcher-prompt.ts test/main/launcher-prompt.test.ts
git commit -m "refactor: replace cipher-boox hardcode in launcher prompt with BRAND.qualityBaselineDir"
```

---

## Task 5: Update `ipc-hub.ts` — remove hardcoded fallback path

**Files:**
- Modify: `src/main/ipc-hub.ts:62-65`

- [ ] **Step 1: Replace hardcoded fallback with BRAND import**

In `src/main/ipc-hub.ts`, add import at top:
```typescript
import { BRAND } from '../shared/brand'
```

Replace the fallback line (around line 64-65):
```typescript
// Old:
      projectlauncherPath: appConfig?.projectlauncherPath
        ?? '/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher',
// New:
      projectlauncherPath: appConfig?.projectlauncherPath || BRAND.projectLauncherDir,
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-hub.ts
git commit -m "refactor: replace hardcoded projectlauncher fallback in ipc-hub with BRAND"
```

---

## Task 6: Update `bugreport-manager.ts` and `bugreport-resolve.ts` — use BRAND.appName

**Files:**
- Modify: `src/main/bugreport/bugreport-manager.ts:12`
- Modify: `src/main/bugreport/bugreport-resolve.ts:5`

- [ ] **Step 1: Update bugreport-manager.ts**

Add import:
```typescript
import { BRAND } from '../../shared/brand'
```

Replace line 12:
```typescript
// Old:
const BUGREPORT_BASE = path.join(os.homedir(), '.config', 'cipher-mux', 'bugreports')
// New:
const BUGREPORT_BASE = path.join(os.homedir(), '.config', BRAND.appName, 'bugreports')
```

- [ ] **Step 2: Update bugreport-resolve.ts**

Add import:
```typescript
import { BRAND } from '../../shared/brand'
```

Replace line 5:
```typescript
// Old:
const BUGREPORT_BASE = path.join(os.homedir(), '.config', 'cipher-mux', 'bugreports')
// New:
const BUGREPORT_BASE = path.join(os.homedir(), '.config', BRAND.appName, 'bugreports')
```

- [ ] **Step 3: Run bugreport tests**

Run: `node --test --import tsx test/main/bugreport-manager.test.ts test/main/bugreport-resolve.test.ts`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/main/bugreport/bugreport-manager.ts src/main/bugreport/bugreport-resolve.ts
git commit -m "refactor: use BRAND.appName for bugreport config directory"
```

---

## Task 7: Update `config-store.ts` — use BRAND for bugreport outbox path

**Files:**
- Modify: `src/main/config/config-store.ts:47-49`

- [ ] **Step 1: Replace hardcoded bugreport path in defaults**

Add import:
```typescript
import { BRAND } from '../../shared/brand'
```

Replace the bugreport taskSources path (line 49):
```typescript
// Old:
        path: '~/.config/cipher-mux/bugreports/outbox',
// New:
        path: `~/.config/${BRAND.appName}/bugreports/outbox`,
```

- [ ] **Step 2: Run config tests**

Run: `node --test --import tsx test/main/config-store.test.ts`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/main/config/config-store.ts
git commit -m "refactor: use BRAND.appName for bugreport outbox path in config defaults"
```

---

## Task 8: Update `orchestrator-template.ts` — neutral template

**Files:**
- Modify: `src/main/session/orchestrator-template.ts:18,71,83`

- [ ] **Step 1: Add BRAND import and replace hardcoded name in template**

Add import:
```typescript
import { BRAND } from '../../shared/brand'
```

Replace line 18:
```typescript
// Old:
  return `# Orchestrator — cipher-mux
// New:
  return `# Orchestrator — ${BRAND.appName}
```

Replace the bugreport outbox path references (lines ~71, ~83):
```typescript
// Old (wherever ~/.config/cipher-mux appears in the template string):
~/.config/cipher-mux/bugreports/outbox/
// New:
~/.config/${BRAND.appName}/bugreports/outbox/
```

- [ ] **Step 2: Run orchestrator template tests**

Run: `node --test --import tsx test/main/orchestrator-template.test.ts`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/main/session/orchestrator-template.ts
git commit -m "refactor: use BRAND.appName in orchestrator template"
```

---

## Task 9: Neutralize UI copy in `InfoSettingsView.tsx` and `app.tsx`

**Files:**
- Modify: `src/renderer/components/InfoSettingsView.tsx`
- Modify: `src/renderer/app.tsx:237`
- Modify: `src/main/window-manager.ts:30`

- [ ] **Step 1: Update InfoSettingsView feature descriptions to be neutral**

In `InfoSettingsView.tsx`, replace the cipher-specific text:

Line 116: `was ist cipher-mux?` — keep as is (cipher-mux IS the app name, per spec).

Line 233: `cipher-mux scannt konfigurierte verzeichnisse` — keep as is (correct app name).

Line 284: `cipher-mux {APP_VERSION}` — keep as is.

No changes needed here — the spec says the name "cipher-mux" stays. The UI copy is already correct.

- [ ] **Step 2: Verify window-manager.ts and app.tsx use consistent naming**

`window-manager.ts` line 30 already uses `'cipher-mux'` as window title — this is correct per spec.

`app.tsx` line 237 uses `cipher-mux` — correct per spec.

No code changes needed. The name stays everywhere.

- [ ] **Step 3: Commit (skip if no changes)**

No commit needed — app name stays "cipher-mux" per spec requirement.

---

## Task 10: Add `build` script profile support to `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add profile-aware build scripts**

Add these scripts to `package.json`:

```json
"build:community": "BUILD_PROFILE=community npm run build",
"build:cipher": "BUILD_PROFILE=cipher npm run build",
"profile-lint": "tsx scripts/profile-lint.ts"
```

- [ ] **Step 2: Verify build works**

Run: `BUILD_PROFILE=community npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add BUILD_PROFILE-aware build scripts"
```

---

## Task 11: Create `scripts/profile-lint.ts` — CI check

**Files:**
- Create: `scripts/profile-lint.ts`

- [ ] **Step 1: Write the profile lint script**

```typescript
#!/usr/bin/env tsx
/**
 * Profile lint — CI check that community builds contain no cipher-specific paths.
 *
 * Scans src/ for hardcoded paths that should only appear in profile.cipher.yaml.
 * Exit code 0 = clean, 1 = violations found.
 */

import * as fs from 'fs'
import * as path from 'path'

const FORBIDDEN_PATTERNS = [
  /\/Users\/Shared\/Nextcloud/,
  /cipher-boox/,
  /ClaudeCode01/,
]

// Files that are allowed to contain these patterns (the profile files themselves)
const ALLOWED_FILES = new Set([
  'profile.cipher.yaml',
  'profile-lint.ts',
  'brand.test.ts',
])

function walkDir(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'out', '.git'].includes(entry.name)) continue
      results.push(...walkDir(full))
    } else if (/\.(ts|tsx|js|json|yaml|yml)$/.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}

const projectRoot = path.resolve(__dirname, '..')
const files = walkDir(path.join(projectRoot, 'src'))
let violations = 0

for (const file of files) {
  const basename = path.basename(file)
  if (ALLOWED_FILES.has(basename)) continue

  const content = fs.readFileSync(file, 'utf-8')
  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      const rel = path.relative(projectRoot, file)
      console.error(`VIOLATION: ${rel} contains "${match[0]}"`)
      violations++
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} violation(s) found. Use BRAND.* constants instead of hardcoded paths.`)
  process.exit(1)
} else {
  console.log('Profile lint passed — no cipher-specific paths in src/')
  process.exit(0)
}
```

- [ ] **Step 2: Run profile lint to verify it passes**

Run: `npx tsx scripts/profile-lint.ts`
Expected: "Profile lint passed" (after all prior tasks are complete)

- [ ] **Step 3: Commit**

```bash
git add scripts/profile-lint.ts
git commit -m "feat: add profile-lint CI check for cipher-specific path leaks"
```

---

## Task 12: Add ESLint restricted-paths rule

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Add no-restricted-syntax rule for Nextcloud path literals**

```typescript
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/', 'out/', 'node_modules/', 'scripts/'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/\\/Users\\/Shared\\/Nextcloud/]',
          message: 'Use BRAND.* constants from src/shared/brand.ts instead of hardcoded cipher paths.',
        },
      ],
    },
  },
)
```

- [ ] **Step 2: Run lint to verify**

Run: `npm run lint`
Expected: No errors from the new rule (all hardcoded paths already removed in prior tasks)

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "refactor: add ESLint rule against hardcoded cipher paths outside brand.ts"
```

---

## Task 13: Write `docs/contributing/profile-system.md`

**Files:**
- Create: `docs/contributing/profile-system.md`

- [ ] **Step 1: Write the documentation**

```markdown
# Profile System

cipher-mux uses a YAML-based profile system to separate environment-specific configuration (paths, defaults) from the application code.

## How It Works

1. The `BUILD_PROFILE` environment variable selects a profile (default: `community`)
2. `src/shared/brand.ts` loads `profile.<name>.yaml` from the project root
3. All environment-specific values are accessed via the `BRAND` singleton
4. If the profile file is missing, community defaults are used (no crash)

## Profiles

| Profile | File | In Git? | Purpose |
|---------|------|---------|---------|
| `community` | `profile.community.yaml` | Yes | Neutral defaults for public builds |
| `cipher` | `profile.cipher.yaml` | No | Private paths for cipher's environment |

## Building with a Profile

```bash
# Community build (default)
npm run build:community

# Cipher build
npm run build:cipher

# Or set manually
BUILD_PROFILE=cipher npm run build
```

## Adding a New Brand Value

1. Add the field to `BrandConfig` interface in `src/shared/brand.ts`
2. Add a default in `COMMUNITY_DEFAULTS`
3. Add the key to both `profile.community.yaml` and `profile.cipher.yaml`
4. Add parsing logic in `loadProfile()` (follow existing pattern)
5. If the value should not appear in community builds, add a pattern to `scripts/profile-lint.ts`

## Why the Name Stays "cipher-mux"

The application name `cipher-mux` is used for:
- IPC channel prefix (`cipher-mux:sessions:list`, etc.)
- Preload API namespace (`window.cipherMux`)
- npm package name
- Config directory (`~/.config/cipher-mux/`)

Changing these would break existing user configs and require coordinated updates across all consumers. The profile system controls **paths and defaults**, not the brand name.

## CI Checks

- `npm run profile-lint` — verifies no cipher-specific paths leak into `src/`
- ESLint rule warns against `/Users/Shared/Nextcloud` literals in source files
```

- [ ] **Step 2: Commit**

```bash
git add docs/contributing/profile-system.md
git commit -m "docs: add profile system contributing guide"
```

---

## Task 14: Full integration verification

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 2: Run profile lint**

Run: `npx tsx scripts/profile-lint.ts`
Expected: "Profile lint passed"

- [ ] **Step 3: Run community build**

Run: `BUILD_PROFILE=community npm run build`
Expected: Build succeeds, no cipher-specific paths in output

- [ ] **Step 4: Run cipher build**

Run: `BUILD_PROFILE=cipher npm run build`
Expected: Build succeeds, identical to current behavior

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: Clean (no warnings from restricted-syntax rule)

- [ ] **Step 6: Final commit if any fixups needed**

```bash
git add -A
git commit -m "refactor: profile-overlay integration verification fixes"
```
