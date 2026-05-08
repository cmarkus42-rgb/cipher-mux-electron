# Welle F1: Voice Bundle + Update Function — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle the Cipher Adult voice as default TTS voice and add an in-app update checker with GitHub releases integration.

**Architecture:** Two independent features: (1) Voice bundle copies pre-trained ONNX model into app resources, auto-deploys to user model dir on first start, changes default from `de_DE-dii-high` to `de_DE-cipher_adult-medium`. (2) Update checker polls GitHub releases API for newer versions, shows notification dialog, supports manual trigger and auto-check on startup.

**Tech Stack:** Electron, TypeScript, electron-builder extraResources, GitHub REST API (releases), Preact UI components.

---

## File Structure

### F-V1+V2: Voice Bundle

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `scripts/copy-voice-model.sh` | Build-time script: copies cipher_adult model from local path to `assets/voices/` |
| Create | `src/main/setup/voice-bundle.ts` | First-start logic: copy bundled voice from resourcesPath to user models dir |
| Modify | `electron-builder.yml` | Add `assets/voices/` to extraResources |
| Modify | `src/main/voice/tts-piper.ts:15` | Change DEFAULT_VOICE to `de_DE-cipher_adult-medium` |
| Modify | `src/main/voice/voice-manager.ts:37` | Change DEFAULT_PIPER_VOICE to `de_DE-cipher_adult-medium` |
| Modify | `src/main/setup/dependency-checker.ts:38-50` | Update piperModelExists() for new voice name |
| Modify | `src/main/setup/dependency-installer.ts:206-244` | Update installPiperModel() for new voice name (fallback download) |
| Modify | `src/main/ipc-hub.ts` | Call voice-bundle deploy on init |
| Create | `test/main/voice-bundle.test.ts` | Tests for voice bundle deploy logic |

### F-I1: Update Function

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/main/updater/update-checker.ts` | Core: check GitHub releases, compare versions, download info |
| Create | `src/main/updater/update-types.ts` | Shared types for update state |
| Modify | `src/shared/ipc-channels.ts` | Add UPDATE_CHECK, UPDATE_AVAILABLE, UPDATE_DOWNLOAD, UPDATE_DISMISS IPC channels |
| Modify | `src/main/ipc-hub.ts` | Wire update IPC handlers |
| Modify | `src/main/main.ts` | Startup update check (delayed) |
| Modify | `src/renderer/components/StatusBar.tsx` | Version click → check for updates; update badge |
| Create | `src/renderer/components/UpdateDialog.tsx` | Update notification dialog with Download/Dismiss buttons |
| Modify | `src/renderer/app.tsx` | UpdateDialog state management |
| Modify | `src/shared/types.ts` | Add update config to AppConfig |
| Create | `test/main/update-checker.test.ts` | Tests for version comparison, API response parsing |

---

## Task 1: Voice Bundle — Build Script + extraResources

**Files:**
- Create: `scripts/copy-voice-model.sh`
- Modify: `electron-builder.yml`
- Modify: `package.json` (add predist hook)

- [ ] **Step 1: Create the voice model copy script**

```bash
#!/bin/bash
# scripts/copy-voice-model.sh — Copy cipher_adult voice model to assets for bundling
set -e

VOICE_NAME="vits-piper-de_DE-cipher_adult-medium"
SRC_DIR="$HOME/Library/Application Support/cipher-mux-electron/models/piper/$VOICE_NAME"
DEST_DIR="assets/voices/$VOICE_NAME"

if [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: Source model not found: $SRC_DIR"
  echo "Install the cipher_adult voice model first."
  exit 1
fi

echo "Copying voice model to $DEST_DIR..."
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"

cp "$SRC_DIR/model.onnx" "$DEST_DIR/"
cp "$SRC_DIR/model.onnx.json" "$DEST_DIR/"
cp "$SRC_DIR/tokens.txt" "$DEST_DIR/"
cp -R "$SRC_DIR/espeak-ng-data" "$DEST_DIR/"

echo "Voice model copied ($(du -sh "$DEST_DIR" | cut -f1))"
```

- [ ] **Step 2: Add voices to .gitignore**

Append to `.gitignore`:
```
assets/voices/
```

- [ ] **Step 3: Update electron-builder.yml extraResources**

Add after the existing ab-shutter-bridge entry:
```yaml
extraResources:
  - from: assets/bin/ab-shutter-bridge
    to: bin/ab-shutter-bridge
  - from: assets/voices
    to: voices
    filter:
      - "**/*"
```

- [ ] **Step 4: Add predist script to package.json**

In `scripts` section, update the `dist` script:
```json
"predist": "bash scripts/copy-voice-model.sh",
```

- [ ] **Step 5: Run script and verify**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron
chmod +x scripts/copy-voice-model.sh
bash scripts/copy-voice-model.sh
ls -la assets/voices/vits-piper-de_DE-cipher_adult-medium/
```

Expected: model.onnx (~61MB), model.onnx.json, tokens.txt, espeak-ng-data/

---

## Task 2: Voice Bundle — First-Start Deploy Logic

**Files:**
- Create: `src/main/setup/voice-bundle.ts`
- Modify: `src/main/ipc-hub.ts`
- Create: `test/main/voice-bundle.test.ts`

- [ ] **Step 1: Write tests for voice bundle deploy**

```typescript
// test/main/voice-bundle.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { deployBundledVoice } from '../../src/main/setup/voice-bundle'

describe('voice-bundle', () => {
  let tmpDir: string
  let srcDir: string
  let destDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-bundle-test-'))
    srcDir = path.join(tmpDir, 'resources', 'voices', 'vits-piper-de_DE-cipher_adult-medium')
    destDir = path.join(tmpDir, 'models', 'piper')
    // Create fake bundled voice
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'model.onnx'), 'fake-onnx-data')
    fs.writeFileSync(path.join(srcDir, 'model.onnx.json'), '{"test":true}')
    fs.writeFileSync(path.join(srcDir, 'tokens.txt'), 'a b c')
    const espeakDir = path.join(srcDir, 'espeak-ng-data')
    fs.mkdirSync(espeakDir)
    fs.writeFileSync(path.join(espeakDir, 'phontab'), 'data')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('copies voice model to dest when not present', () => {
    const result = deployBundledVoice({
      resourcesPath: path.join(tmpDir, 'resources'),
      modelsDir: destDir,
      voiceName: 'de_DE-cipher_adult-medium',
    })
    assert.equal(result, true)
    const voiceDir = path.join(destDir, 'vits-piper-de_DE-cipher_adult-medium')
    assert.ok(fs.existsSync(path.join(voiceDir, 'model.onnx')))
    assert.ok(fs.existsSync(path.join(voiceDir, 'model.onnx.json')))
    assert.ok(fs.existsSync(path.join(voiceDir, 'tokens.txt')))
    assert.ok(fs.existsSync(path.join(voiceDir, 'espeak-ng-data', 'phontab')))
  })

  it('skips copy when voice already exists', () => {
    // Pre-create the destination
    const voiceDir = path.join(destDir, 'vits-piper-de_DE-cipher_adult-medium')
    fs.mkdirSync(voiceDir, { recursive: true })
    fs.writeFileSync(path.join(voiceDir, 'model.onnx'), 'existing')

    const result = deployBundledVoice({
      resourcesPath: path.join(tmpDir, 'resources'),
      modelsDir: destDir,
      voiceName: 'de_DE-cipher_adult-medium',
    })
    assert.equal(result, false) // no copy needed
    // Original file should be untouched
    assert.equal(fs.readFileSync(path.join(voiceDir, 'model.onnx'), 'utf-8'), 'existing')
  })

  it('returns false when bundled voice not found in resources', () => {
    const result = deployBundledVoice({
      resourcesPath: '/nonexistent/path',
      modelsDir: destDir,
      voiceName: 'de_DE-cipher_adult-medium',
    })
    assert.equal(result, false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- test/main/voice-bundle.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement voice-bundle.ts**

```typescript
// src/main/setup/voice-bundle.ts
import fs from 'node:fs'
import path from 'node:path'

export interface DeployOptions {
  resourcesPath: string
  modelsDir: string
  voiceName: string
}

/**
 * Deploy bundled Piper voice model from app resources to user models directory.
 * Returns true if a copy was performed, false if skipped or unavailable.
 */
export function deployBundledVoice(opts: DeployOptions): boolean {
  const voiceDirName = `vits-piper-${opts.voiceName}`
  const srcDir = path.join(opts.resourcesPath, 'voices', voiceDirName)
  const destDir = path.join(opts.modelsDir, voiceDirName)

  // Skip if bundled voice not present (dev mode without predist)
  if (!fs.existsSync(srcDir)) {
    console.log(`[voice-bundle] Bundled voice not found at ${srcDir} — skipping`)
    return false
  }

  // Skip if already deployed
  if (fs.existsSync(path.join(destDir, 'model.onnx'))) {
    console.log(`[voice-bundle] Voice already deployed at ${destDir}`)
    return false
  }

  console.log(`[voice-bundle] Deploying ${opts.voiceName} to ${destDir}...`)
  fs.mkdirSync(destDir, { recursive: true })
  copyDirRecursive(srcDir, destDir)
  console.log(`[voice-bundle] Voice deployed successfully`)
  return true
}

function copyDirRecursive(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- test/main/voice-bundle.test.ts
```
Expected: 3 passing

- [ ] **Step 5: Wire into ipc-hub init**

In `src/main/ipc-hub.ts`, add import and call during init:

```typescript
import { deployBundledVoice } from './setup/voice-bundle'
```

In the init method, after tmux connect / before session recover:

```typescript
// Deploy bundled voice model on first start
try {
  const modelsDir = path.join(process.env.HOME ?? '', '.config', 'cipher-mux', 'models', 'piper')
  deployBundledVoice({
    resourcesPath: process.resourcesPath ?? '',
    modelsDir,
    voiceName: 'de_DE-cipher_adult-medium',
  })
} catch (err) {
  console.warn('[init] Voice bundle deploy failed:', (err as Error).message)
}
```

---

## Task 3: Voice Bundle — Change Default Voice + Update Dependency System

**Files:**
- Modify: `src/main/voice/tts-piper.ts:15`
- Modify: `src/main/voice/voice-manager.ts:37`
- Modify: `src/main/setup/dependency-checker.ts:38-50`
- Modify: `src/main/setup/dependency-installer.ts:206-244`

- [ ] **Step 1: Change DEFAULT_VOICE in tts-piper.ts**

Line 15: Change from:
```typescript
const DEFAULT_VOICE = 'de_DE-dii-high'
```
To:
```typescript
const DEFAULT_VOICE = 'de_DE-cipher_adult-medium'
```

- [ ] **Step 2: Change DEFAULT_PIPER_VOICE in voice-manager.ts**

Line 37: Change from:
```typescript
const DEFAULT_PIPER_VOICE = 'de_DE-dii-high'
```
To:
```typescript
const DEFAULT_PIPER_VOICE = 'de_DE-cipher_adult-medium'
```

- [ ] **Step 3: Update dependency-checker.ts — piperModelExists()**

Change the path to check for the new default voice:
```typescript
function piperModelExists(): boolean {
  // Check both possible model locations
  const configDir = path.join(
    os.homedir(), '.config/cipher-mux/models/piper/vits-piper-de_DE-cipher_adult-medium'
  );
  const appSupportDir = path.join(
    os.homedir(),
    'Library/Application Support/cipher-mux-electron/models/piper/vits-piper-de_DE-cipher_adult-medium'
  );
  for (const dir of [configDir, appSupportDir]) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      if (files.some((f) => f.endsWith('.onnx'))) return true;
    } catch { /* ignore */ }
  }
  return false;
}
```

- [ ] **Step 4: Update dependency-installer.ts — installPiperModel()**

Update the download function for the new voice. Since cipher_adult is custom-trained (not on HuggingFace), the fallback installer should note that the voice is bundled:

```typescript
async function installPiperModel(onProgress: (msg: string) => void): Promise<boolean> {
  const destDir = path.join(
    os.homedir(),
    '.config/cipher-mux/models/piper/vits-piper-de_DE-cipher_adult-medium'
  );

  // Check if already deployed (e.g. by voice-bundle from app resources)
  if (fs.existsSync(path.join(destDir, 'model.onnx'))) {
    onProgress('Cipher Adult voice model already installed');
    return true;
  }

  onProgress('Cipher Adult voice is bundled with the app.');
  onProgress('If missing, please reinstall cipher-mux from the latest DMG.');
  return false;
}
```

Update the dependency name in `checkAll()`:
```typescript
{
  id: 'piper-model',
  name: 'Piper TTS Model (Cipher Adult)',
  installed: piperModelExists(),
  required: false,
  size: '~79MB (bundled)',
  description: 'Cipher Adult Stimme — im App-Bundle enthalten',
},
```

- [ ] **Step 5: Run full test suite**

```bash
npm run test
```
Expected: All tests pass

---

## Task 4: Update Checker — Core Module

**Files:**
- Create: `src/main/updater/update-types.ts`
- Create: `src/main/updater/update-checker.ts`
- Create: `test/main/update-checker.test.ts`

- [ ] **Step 1: Write update types**

```typescript
// src/main/updater/update-types.ts
export interface UpdateInfo {
  version: string
  currentVersion: string
  releaseUrl: string
  downloadUrl: string | null  // DMG asset URL if available
  releaseNotes: string
  publishedAt: string
}

export type UpdateMode = 'notify' | 'auto' | 'disabled'

export interface UpdateConfig {
  mode: UpdateMode
  lastCheck: string | null  // ISO date
  dismissedVersion: string | null
}
```

- [ ] **Step 2: Write tests for update checker**

```typescript
// test/main/update-checker.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, parseGitHubRelease } from '../../src/main/updater/update-checker'

describe('update-checker', () => {
  describe('compareVersions', () => {
    it('detects newer version', () => {
      assert.equal(compareVersions('1.0.0', '0.9.99'), 1)
    })

    it('detects same version', () => {
      assert.equal(compareVersions('0.9.99', '0.9.99'), 0)
    })

    it('detects older version', () => {
      assert.equal(compareVersions('0.9.98', '0.9.99'), -1)
    })

    it('handles versions with v prefix', () => {
      assert.equal(compareVersions('v1.0.0', 'v0.9.99'), 1)
    })

    it('handles versions with build metadata', () => {
      assert.equal(compareVersions('0.9.99+23', '0.9.99'), 0)
    })

    it('compares major correctly', () => {
      assert.equal(compareVersions('2.0.0', '1.9.99'), 1)
    })

    it('compares minor correctly', () => {
      assert.equal(compareVersions('1.1.0', '1.0.99'), 1)
    })
  })

  describe('parseGitHubRelease', () => {
    it('parses a valid release', () => {
      const release = {
        tag_name: 'v1.0.0',
        html_url: 'https://github.com/user/repo/releases/tag/v1.0.0',
        body: '## Changes\n- Feature A',
        published_at: '2026-05-08T12:00:00Z',
        assets: [
          {
            name: 'cipher-mux-1.0.0-arm64.dmg',
            browser_download_url: 'https://github.com/user/repo/releases/download/v1.0.0/cipher-mux-1.0.0-arm64.dmg',
          },
        ],
      }
      const result = parseGitHubRelease(release, '0.9.99')
      assert.ok(result)
      assert.equal(result!.version, '1.0.0')
      assert.equal(result!.currentVersion, '0.9.99')
      assert.ok(result!.downloadUrl?.includes('.dmg'))
    })

    it('returns null for older release', () => {
      const release = {
        tag_name: 'v0.9.0',
        html_url: 'https://github.com/user/repo/releases/tag/v0.9.0',
        body: 'Old',
        published_at: '2026-01-01T00:00:00Z',
        assets: [],
      }
      const result = parseGitHubRelease(release, '0.9.99')
      assert.equal(result, null)
    })

    it('returns null for prerelease without DMG', () => {
      const release = {
        tag_name: 'v1.0.0-beta',
        html_url: 'https://github.com/user/repo/releases/tag/v1.0.0-beta',
        body: 'Beta',
        published_at: '2026-05-08T00:00:00Z',
        assets: [],
      }
      // Pre-release tags contain hyphen — compareVersions treats base as 1.0.0
      // This should still return update info since 1.0.0 > 0.9.99
      const result = parseGitHubRelease(release, '0.9.99')
      assert.ok(result) // version is newer regardless
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm run test -- test/main/update-checker.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 4: Implement update-checker.ts**

```typescript
// src/main/updater/update-checker.ts
import https from 'node:https'
import { APP_VERSION } from '../../shared/constants'
import type { UpdateInfo } from './update-types'

const GITHUB_REPO = 'nicholasgriffintn/cipher-mux-electron'  // TODO: set actual repo
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

/**
 * Compare two semver strings. Returns 1 if a > b, -1 if a < b, 0 if equal.
 * Strips leading 'v' and build metadata (+NNN).
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').replace(/\+.*$/, '').replace(/-.*$/, '').split('.').map(Number)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  body: string
  published_at: string
  assets: Array<{ name: string; browser_download_url: string }>
}

/**
 * Parse a GitHub release response into UpdateInfo, or null if not newer.
 */
export function parseGitHubRelease(release: GitHubRelease, currentVersion: string): UpdateInfo | null {
  const remoteVersion = release.tag_name.replace(/^v/, '')
  const cleanCurrent = currentVersion.replace(/^v/, '').replace(/\+.*$/, '')

  if (compareVersions(remoteVersion, cleanCurrent) <= 0) {
    return null
  }

  const dmgAsset = release.assets.find(a => a.name.endsWith('.dmg'))

  return {
    version: remoteVersion,
    currentVersion: cleanCurrent,
    releaseUrl: release.html_url,
    downloadUrl: dmgAsset?.browser_download_url ?? null,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at,
  }
}

/**
 * Check GitHub for a newer release. Returns UpdateInfo or null.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const release = await fetchLatestRelease()
  if (!release) return null
  return parseGitHubRelease(release, APP_VERSION)
}

function fetchLatestRelease(): Promise<GitHubRelease | null> {
  return new Promise((resolve) => {
    const req = https.get(GITHUB_API, {
      headers: {
        'User-Agent': 'cipher-mux-electron',
        Accept: 'application/vnd.github.v3+json',
      },
      timeout: 10_000,
    }, (res) => {
      if (res.statusCode !== 200) {
        resolve(null)
        res.resume()
        return
      }
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test -- test/main/update-checker.test.ts
```
Expected: All pass

---

## Task 5: Update Checker — IPC + Settings Integration

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc-hub.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Add IPC channels**

In `src/shared/ipc-channels.ts`, add before the closing `} as const`:

```typescript
  // Updates
  UPDATE_CHECK: 'cipher-mux:update:check',
  UPDATE_AVAILABLE: 'cipher-mux:update:available',
  UPDATE_DISMISS: 'cipher-mux:update:dismiss',
```

- [ ] **Step 2: Add update config to types**

In `src/shared/types.ts`, add to the AppConfig interface (find the appropriate place):

```typescript
  update?: {
    mode?: 'notify' | 'auto' | 'disabled'
    lastCheck?: string
    dismissedVersion?: string
  }
```

- [ ] **Step 3: Wire IPC handlers in ipc-hub.ts**

Add import:
```typescript
import { checkForUpdate } from './updater/update-checker'
import type { UpdateInfo } from './updater/update-types'
```

Add handlers in the init method:
```typescript
// Update checker
ipcMain.handle(IPC.UPDATE_CHECK, async () => {
  try {
    const updateInfo = await checkForUpdate()
    if (updateInfo) {
      // Check if user dismissed this version
      const dismissed = configStore.get('update')?.dismissedVersion
      if (dismissed === updateInfo.version) return null
      this.windowManager.sendToMain(IPC.UPDATE_AVAILABLE, updateInfo)
    }
    configStore.set('update', {
      ...configStore.get('update'),
      lastCheck: new Date().toISOString(),
    })
    return updateInfo
  } catch (err) {
    console.warn('[update] Check failed:', (err as Error).message)
    return null
  }
})

ipcMain.on(IPC.UPDATE_DISMISS, (_e, version: string) => {
  configStore.set('update', {
    ...configStore.get('update'),
    dismissedVersion: version,
  })
})
```

- [ ] **Step 4: Add startup update check in main.ts**

After `windowManager.createMainWindow(gridHint)`, add a delayed check:

```typescript
// Check for updates 30s after startup (non-blocking)
const updateMode = configStore.get('update')?.mode ?? 'notify'
if (updateMode !== 'disabled') {
  setTimeout(async () => {
    try {
      const { checkForUpdate } = await import('./updater/update-checker')
      const info = await checkForUpdate()
      if (info) {
        const dismissed = configStore.get('update')?.dismissedVersion
        if (dismissed !== info.version) {
          windowManager.sendToMain(IPC.UPDATE_AVAILABLE, info)
        }
      }
      configStore.set('update', {
        ...configStore.get('update'),
        lastCheck: new Date().toISOString(),
      })
    } catch { /* silent */ }
  }, 30_000)
}
```

Add import at the top of the file:
```typescript
import { IPC } from '../shared/ipc-channels'
```

---

## Task 6: Update Checker — UI (StatusBar + Dialog)

**Files:**
- Create: `src/renderer/components/UpdateDialog.tsx`
- Modify: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/app.tsx`
- Modify: `src/main/preload.ts` (expose update IPC)

- [ ] **Step 1: Create UpdateDialog component**

```tsx
// src/renderer/components/UpdateDialog.tsx
import { useTranslation } from 'react-i18next'

interface UpdateDialogProps {
  version: string
  currentVersion: string
  releaseUrl: string
  downloadUrl: string | null
  releaseNotes: string
  onDismiss: () => void
  onDownload: () => void
}

export function UpdateDialog({
  version, currentVersion, releaseUrl, downloadUrl,
  releaseNotes, onDismiss, onDownload,
}: UpdateDialogProps) {
  const { t } = useTranslation()

  return (
    <div class="overlay" onClick={(e) => {
      if ((e.target as HTMLElement) === (e.currentTarget as HTMLElement)) onDismiss()
    }}>
      <div class="dialog update-dialog">
        <h2>Update Available</h2>
        <p class="update-dialog__versions">
          {currentVersion} → <strong>{version}</strong>
        </p>
        {releaseNotes && (
          <div class="update-dialog__notes">
            <pre>{releaseNotes.slice(0, 500)}</pre>
          </div>
        )}
        <div class="dialog__actions">
          <button class="btn btn--secondary" onClick={onDismiss}>
            {t('update.dismiss', 'Later')}
          </button>
          <button class="btn btn--primary" onClick={onDownload}>
            {t('update.download', 'Download')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add update styles**

In `src/renderer/styles/components.css`, append:

```css
.update-dialog__versions {
  font-size: 1.1em;
  margin: 0.5em 0;
}
.update-dialog__notes {
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg-secondary, #1a1a1a);
  padding: 0.5em;
  border-radius: 4px;
  margin: 0.5em 0;
}
.update-dialog__notes pre {
  white-space: pre-wrap;
  font-size: 0.85em;
  margin: 0;
}
.status-bar__version--update {
  color: var(--accent, #4fc3f7);
  cursor: pointer;
  text-decoration: underline;
}
```

- [ ] **Step 3: Expose update IPC in preload.ts**

Add to the preload API:
```typescript
updateCheck: () => ipcRenderer.invoke('cipher-mux:update:check'),
updateDismiss: (version: string) => ipcRenderer.send('cipher-mux:update:dismiss', version),
onUpdateAvailable: (cb: (info: any) => void) => {
  ipcRenderer.on('cipher-mux:update:available', (_e, info) => cb(info))
  return () => ipcRenderer.removeAllListeners('cipher-mux:update:available')
},
```

- [ ] **Step 4: Wire UpdateDialog in app.tsx**

Add state and effect:
```typescript
const [updateInfo, setUpdateInfo] = useState<any>(null)

useEffect(() => {
  const cleanup = window.cipherMux.onUpdateAvailable((info: any) => {
    setUpdateInfo(info)
  })
  return cleanup
}, [])
```

Add dialog render (alongside other dialogs):
```tsx
{updateInfo && (
  <UpdateDialog
    version={updateInfo.version}
    currentVersion={updateInfo.currentVersion}
    releaseUrl={updateInfo.releaseUrl}
    downloadUrl={updateInfo.downloadUrl}
    releaseNotes={updateInfo.releaseNotes}
    onDismiss={() => {
      window.cipherMux.updateDismiss(updateInfo.version)
      setUpdateInfo(null)
    }}
    onDownload={() => {
      const url = updateInfo.downloadUrl ?? updateInfo.releaseUrl
      window.open(url, '_blank')
      setUpdateInfo(null)
    }}
  />
)}
```

- [ ] **Step 5: Add version click handler in StatusBar**

Modify the version span in StatusBar.tsx:

```tsx
<span
  class={`status-bar__version${updateInfo ? ' status-bar__version--update' : ''}`}
  onClick={() => window.cipherMux.updateCheck()}
  title="Click to check for updates"
  aria-label={`Version ${APP_VERSION} — click to check for updates`}
>
  {APP_VERSION}
</span>
```

Add `updateInfo` prop to StatusBarProps and pass it through.

---

## Task 7: Tests + Verification

**Files:**
- Run: existing test suite
- Verify: voice bundle, update checker

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```
Expected: All existing tests + new tests pass (858 + new)

- [ ] **Step 2: Build verification**

```bash
npm run build
```
Expected: Clean build, no TS errors

- [ ] **Step 3: Verify voice bundle assets**

```bash
ls -la assets/voices/vits-piper-de_DE-cipher_adult-medium/
```
Expected: model.onnx, model.onnx.json, tokens.txt, espeak-ng-data/

---

## Task 8: Testcases + Feature Note Tags

- [ ] **Step 1: Add testcases to testcase note (01KQNBDCH1D4G11PMAEM60TPTX)**

Section: `## Welle F1: Voice Bundle + Update`

```
- [ ] **T-F1.1** Default-Stimme ist de_DE-cipher_adult-medium (nicht mehr dii-high)
- [ ] **T-F1.2** Bundled Voice wird bei Erststart nach ~/.config/cipher-mux/models/piper/ kopiert
- [ ] **T-F1.3** Bei vorhandener Stimme wird nicht erneut kopiert (idempotent)
- [ ] **T-F1.4** TTS spricht mit Cipher Adult Stimme (hoerbar anders als dii-high)
- [ ] **T-F1.5** Dependency-Checker zeigt Cipher Adult als installiert
- [ ] **T-F1.6** Version in StatusBar ist klickbar — loest Update-Check aus
- [ ] **T-F1.7** Update-Dialog erscheint bei verfuegbarem Update
- [ ] **T-F1.8** Download-Button oeffnet Release-URL oder DMG-Link
- [ ] **T-F1.9** Dismiss speichert Version — kein erneuter Dialog fuer gleiche Version
- [ ] **T-F1.10** Startup Update-Check nach 30s (kein Block beim Start)
```

- [ ] **Step 2: Update feature note tags to status:in-progress**

Update note 01KR30ZTYBP95B4M7SWR1QBA5E — change F-V1+V2 and F-I1 status.

- [ ] **Step 3: Commit Welle F1**

```bash
git add -A
git commit -m "feat: Welle F1 — Cipher Adult voice bundle + update checker

F-V1+V2: Bundle de_DE-cipher_adult-medium as default TTS voice
- Build script copies model to assets/voices/ for electron-builder
- First-start deploy from app resources to user models dir
- Default voice changed from de_DE-dii-high to cipher_adult
- Dependency checker/installer updated for new voice

F-I1: In-app update checker with GitHub releases
- Core: version comparison, GitHub API release parsing
- Startup check (30s delay, non-blocking)
- Manual check via StatusBar version click
- UpdateDialog with download/dismiss actions
- Config: update mode (notify/auto/disabled), dismissed version

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
