# Welle F2: Tag Management + Notes File Watching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete tag management system (merge, exclusive categories, cycle-click) and live file watching for notes editor.

**Architecture:** Three independent sub-features: (1) Tag merge function in NoteTagging backend + TagManager UI. (2) Exclusive category enforcement in TagBar + cycle-click on tag chips. (3) fs.watch on notes directory + NOTES_CHANGED listener in NotesCell for live reload of open tabs.

**Tech Stack:** TypeScript, Preact, fs.watch, gray-matter frontmatter.

---

## File Structure

### F-N5+N1: Tag Management (Merge + Exclusive + Cycle)

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/main/notes/note-tagging.ts` | Add `mergeTags()` method |
| Modify | `src/shared/ipc-channels.ts` | Add NOTES_TAG_MERGE channel |
| Modify | `src/main/ipc-hub.ts` | Wire merge IPC handler |
| Modify | `src/main/preload.ts` | Expose `tagMerge()` in preload API |
| Modify | `src/renderer/components/TagManager.tsx` | Add merge UI (multi-select + merge action) |
| Modify | `src/renderer/components/TagBar.tsx` | Exclusive category enforcement + cycle-click |
| Create | `test/main/tag-merge.test.ts` | Tests for merge logic |

### F-N2: Notes Live File Watching

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/main/notes/note-watcher.ts` | fs.watch on notes dir, emits change events |
| Modify | `src/main/ipc-hub.ts` | Start watcher, forward external changes as NOTES_CHANGED |
| Modify | `src/renderer/components/NotesCell.tsx` | Listen for NOTES_CHANGED, reload open tabs |
| Create | `test/main/note-watcher.test.ts` | Tests for watcher debounce/dedup logic |

---

## Task 1: Tag Merge — Backend

**Files:**
- Modify: `src/main/notes/note-tagging.ts`
- Create: `test/main/tag-merge.test.ts`

- [ ] **Step 1: Write tests for mergeTags**

```typescript
// test/main/tag-merge.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { NoteTagging } from '../../src/main/notes/note-tagging'

function writeNote(dir: string, id: string, tags: string[]): void {
  const content = [
    '---',
    `title: Test Note ${id}`,
    `tags: [${tags.map(t => `"${t}"`).join(', ')}]`,
    `created: "2026-01-01T00:00:00.000Z"`,
    `modified: "2026-01-01T00:00:00.000Z"`,
    '---',
    `# Note ${id}`,
    'Body text',
  ].join('\n')
  fs.writeFileSync(path.join(dir, `${id}.md`), content)
}

function readNoteTags(dir: string, id: string): string[] {
  const matter = require('gray-matter')
  const raw = fs.readFileSync(path.join(dir, `${id}.md`), 'utf-8')
  return matter(raw).data.tags ?? []
}

describe('mergeTags', () => {
  let tmpDir: string
  let tagging: NoteTagging

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-merge-test-'))
    tagging = new NoteTagging(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('merges multiple tags into target', () => {
    tagging.createTag('domain:trading', 'desc1')
    tagging.createTag('domain:trades', 'desc2')
    writeNote(tmpDir, 'n1', ['domain:trading'])
    writeNote(tmpDir, 'n2', ['domain:trades'])
    writeNote(tmpDir, 'n3', ['domain:trading', 'domain:trades'])

    const result = tagging.mergeTags(['domain:trading', 'domain:trades'], 'domain:trading')
    assert.equal(result.affected, 2) // n2 renamed, n3 deduped
    assert.deepEqual(readNoteTags(tmpDir, 'n1'), ['domain:trading'])
    assert.deepEqual(readNoteTags(tmpDir, 'n2'), ['domain:trading'])
    assert.deepEqual(readNoteTags(tmpDir, 'n3'), ['domain:trading'])
    // Source tags removed from repository
    const repo = tagging.getTagRepository()
    assert.ok(!repo.tags['domain:trades'])
    assert.ok(repo.tags['domain:trading'])
  })

  it('returns 0 affected when no notes have source tags', () => {
    tagging.createTag('kind:a', '')
    tagging.createTag('kind:b', '')
    const result = tagging.mergeTags(['kind:a', 'kind:b'], 'kind:b')
    assert.equal(result.affected, 0)
  })

  it('rejects merge when target not in sources', () => {
    tagging.createTag('kind:a', '')
    tagging.createTag('kind:b', '')
    const result = tagging.mergeTags(['kind:a'], 'kind:b')
    assert.equal(result.affected, 0)
    assert.equal(result.error, 'target must be one of the source tags')
  })

  it('rejects merge with fewer than 2 sources', () => {
    const result = tagging.mergeTags(['kind:a'], 'kind:a')
    assert.equal(result.error, 'need at least 2 tags to merge')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test --import tsx test/main/tag-merge.test.ts
```

- [ ] **Step 3: Implement mergeTags in note-tagging.ts**

Add after `deleteTag()`:

```typescript
/**
 * Merge multiple tags into one target tag.
 * All source tags (except target) are replaced with target in all notes.
 * Notes that already have target get duplicates removed.
 * Source tags are deleted from the repository.
 * Returns { affected, error? }.
 */
mergeTags(sources: string[], target: string): { affected: number; error?: string } {
  if (sources.length < 2) return { affected: 0, error: 'need at least 2 tags to merge' }
  const normTarget = target.toLowerCase().trim()
  const normSources = sources.map(s => s.toLowerCase().trim())
  if (!normSources.includes(normTarget)) return { affected: 0, error: 'target must be one of the source tags' }

  const toReplace = normSources.filter(s => s !== normTarget)
  const matter = require('gray-matter')
  let affected = 0

  let files: string[]
  try {
    files = fs.readdirSync(this.notesDir).filter(f => f.endsWith('.md'))
  } catch {
    return { affected: 0 }
  }

  for (const file of files) {
    const filePath = path.join(this.notesDir, file)
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = matter(raw)
      const tags: string[] = parsed.data.tags ?? []
      const lower = tags.map(t => t.toLowerCase())

      const hasAnySource = toReplace.some(s => lower.includes(s))
      if (!hasAnySource) continue

      // Replace source tags with target, then deduplicate
      const newTags = tags
        .map(t => toReplace.includes(t.toLowerCase()) ? normTarget : t)
        .filter((t, i, arr) => arr.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i)

      parsed.data.tags = newTags
      parsed.data.modified = new Date().toISOString()
      fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8')
      affected++
    } catch { /* skip */ }
  }

  // Remove source tags from repository (keep target)
  for (const src of toReplace) {
    delete this.repo.tags[src]
  }
  // Ensure target exists in repo
  if (!this.repo.tags[normTarget]) {
    this.repo.tags[normTarget] = { count: 0, description: '' }
  }
  this.saveRepository()
  this.recountTags()

  return { affected }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test --import tsx test/main/tag-merge.test.ts
```

---

## Task 2: Tag Merge — IPC + UI

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc-hub.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/components/TagManager.tsx`

- [ ] **Step 1: Add IPC channel**

In `src/shared/ipc-channels.ts`, add after NOTES_TAG_DELETE:
```typescript
  NOTES_TAG_MERGE: 'cipher-mux:notes:tag-merge',
```

- [ ] **Step 2: Add IPC handler in ipc-hub.ts**

Find the tag handler section and add:
```typescript
ipcMain.handle(IPC.NOTES_TAG_MERGE, async (_e, { sources, target }: { sources: string[]; target: string }) => {
  const result = this.noteTagging.mergeTags(sources, target)
  if (result.affected > 0) {
    this.tagIndex.rebuild()
    this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'tags-updated' })
  }
  return result
})
```

- [ ] **Step 3: Expose in preload**

Add to the notes section:
```typescript
tagMerge: (sources: string[], target: string) => ipcRenderer.invoke(IPC.NOTES_TAG_MERGE, { sources, target }),
```

- [ ] **Step 4: Add merge UI to TagManager**

Add multi-select state and merge action:
```tsx
const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set())
const [mergeMode, setMergeMode] = useState(false)

const toggleMergeSelect = (name: string) => {
  setSelectedForMerge(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })
}

const handleMerge = async () => {
  if (selectedForMerge.size < 2) return
  const sources = [...selectedForMerge]
  const target = sources[0] // first selected = target
  const confirmed = window.confirm(`Merge ${sources.length} tags into "${target}"?`)
  if (!confirmed) return
  await api.notes.tagMerge(sources, target)
  setSelectedForMerge(new Set())
  setMergeMode(false)
  await loadTags()
}
```

Add merge toggle button in header alongside the create button:
```tsx
<button
  class={`tag-manager__merge-btn${mergeMode ? ' tag-manager__merge-btn--active' : ''}`}
  onClick={() => { setMergeMode(!mergeMode); setSelectedForMerge(new Set()) }}
>
  {mergeMode ? 'Cancel Merge' : 'Merge'}
</button>
```

Add checkboxes in each row (when mergeMode active) and a merge action bar when 2+ selected.

---

## Task 3: Exclusive Categories + Cycle-Click

**Files:**
- Modify: `src/main/notes/tag-repository.ts`
- Modify: `src/renderer/components/TagBar.tsx`

- [ ] **Step 1: Add exclusive class list to TagClassRepo**

In `tag-repository.ts`, add after SEED_CLASSES:
```typescript
/** Classes where only one value may be set per note. */
export const EXCLUSIVE_CLASSES = new Set(['status', 'kind'])
```

- [ ] **Step 2: Export exclusive classes for renderer**

Add method to TagClassRepo:
```typescript
static getExclusiveClasses(): string[] {
  return [...EXCLUSIVE_CLASSES]
}
```

Expose via IPC: Already available through tagClassRepo — add `exclusive` field to the response or use a static constant in shared/constants.ts.

Simpler approach: add to `src/shared/constants.ts`:
```typescript
/** Tag classes where only one value is allowed per note. */
export const EXCLUSIVE_TAG_CLASSES = ['status', 'kind']
```

- [ ] **Step 3: Enforce exclusivity in TagBar addTag()**

In `src/renderer/components/TagBar.tsx`, modify `addTag`:
```typescript
import { EXCLUSIVE_TAG_CLASSES } from '../../shared/constants'

const addTag = useCallback((tag: string) => {
  const trimmed = tag.trim().toLowerCase()
  if (!trimmed) return
  if (!isValidTag(trimmed)) {
    setWarning('Format: klasse:wert (z.B. status:open)')
    return
  }
  if (tags.includes(trimmed)) {
    setWarning('Tag bereits vorhanden')
    return
  }
  if (tags.length >= MAX_TAGS) {
    setWarning(`Max ${MAX_TAGS} Tags pro Note`)
    return
  }

  // Exclusive categories: remove existing tag of same class
  const colonIdx = trimmed.indexOf(':')
  const tagClass = colonIdx > 0 ? trimmed.slice(0, colonIdx) : null
  let newTags = [...tags]
  if (tagClass && EXCLUSIVE_TAG_CLASSES.includes(tagClass)) {
    newTags = newTags.filter(t => !t.startsWith(tagClass + ':'))
  }
  newTags.push(trimmed)

  onTagsChange(newTags)
  setInput('')
  setShowSuggestions(false)
}, [tags, onTagsChange])
```

- [ ] **Step 4: Add cycle-click to tag chips**

In TagBar, modify the tag chip rendering to add cycle on click:

```tsx
import { EXCLUSIVE_TAG_CLASSES } from '../../shared/constants'

// Precompute class values for cycling (loaded once)
const [classValues, setClassValues] = useState<Record<string, string[]>>({})
useEffect(() => {
  const api = (window as any).cipherMux
  if (!api?.notes?.tagClassRepo) return
  api.notes.tagClassRepo().then((repo: { classes: Record<string, { values: string[] }> }) => {
    const cv: Record<string, string[]> = {}
    for (const [cls, data] of Object.entries(repo.classes)) {
      if (EXCLUSIVE_TAG_CLASSES.includes(cls)) {
        cv[cls] = data.values
      }
    }
    setClassValues(cv)
  }).catch(() => {})
}, [])

const cycleTag = useCallback((tag: string) => {
  const colonIdx = tag.indexOf(':')
  if (colonIdx <= 0) return
  const cls = tag.slice(0, colonIdx)
  const val = tag.slice(colonIdx + 1)
  const values = classValues[cls]
  if (!values || values.length < 2) return
  const idx = values.indexOf(val)
  const nextIdx = (idx + 1) % values.length
  const newTag = `${cls}:${values[nextIdx]}`
  const newTags = tags.map(t => t === tag ? newTag : t)
  onTagsChange(newTags)
}, [tags, classValues, onTagsChange])
```

Modify chip rendering:
```tsx
{tags.map(tag => {
  const colonIdx = tag.indexOf(':')
  const cls = colonIdx > 0 ? tag.slice(0, colonIdx) : null
  const canCycle = cls && EXCLUSIVE_TAG_CLASSES.includes(cls) && (classValues[cls]?.length ?? 0) > 1

  return (
    <span key={tag} class={`tag-bar__chip${canCycle ? ' tag-bar__chip--cyclable' : ''}`}>
      <span
        class="tag-bar__chip-text"
        onClick={canCycle ? () => cycleTag(tag) : undefined}
        title={canCycle ? `Click to cycle ${cls} values` : undefined}
        style={canCycle ? { cursor: 'pointer' } : undefined}
      >{tag}</span>
      <button class="tag-bar__chip-remove" onClick={() => removeTag(tag)} title="Tag entfernen">×</button>
    </span>
  )
})}
```

- [ ] **Step 5: Add cyclable chip CSS**

In `src/renderer/styles/components.css`:
```css
.tag-bar__chip--cyclable .tag-bar__chip-text:hover {
  text-decoration: underline;
  opacity: 0.8;
}
```

---

## Task 4: Notes File Watcher — Backend

**Files:**
- Create: `src/main/notes/note-watcher.ts`
- Create: `test/main/note-watcher.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// test/main/note-watcher.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { NoteWatcher } from '../../src/main/notes/note-watcher'

describe('NoteWatcher', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-watcher-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('emits change event when .md file is modified', async () => {
    const filePath = path.join(tmpDir, 'test.md')
    fs.writeFileSync(filePath, 'initial')

    const changes: string[] = []
    const watcher = new NoteWatcher(tmpDir, (noteId) => changes.push(noteId))
    watcher.start()

    // Modify file
    await new Promise(r => setTimeout(r, 100))
    fs.writeFileSync(filePath, 'updated')
    await new Promise(r => setTimeout(r, 600)) // debounce is 500ms

    watcher.stop()
    assert.ok(changes.length >= 1)
    assert.equal(changes[0], 'test')
  })

  it('ignores non-.md files', async () => {
    const changes: string[] = []
    const watcher = new NoteWatcher(tmpDir, (noteId) => changes.push(noteId))
    watcher.start()

    fs.writeFileSync(path.join(tmpDir, 'test.json'), '{}')
    await new Promise(r => setTimeout(r, 600))

    watcher.stop()
    assert.equal(changes.length, 0)
  })

  it('deduplicates rapid changes to same file', async () => {
    const filePath = path.join(tmpDir, 'rapid.md')
    fs.writeFileSync(filePath, 'v1')

    const changes: string[] = []
    const watcher = new NoteWatcher(tmpDir, (noteId) => changes.push(noteId))
    watcher.start()

    await new Promise(r => setTimeout(r, 100))
    fs.writeFileSync(filePath, 'v2')
    fs.writeFileSync(filePath, 'v3')
    fs.writeFileSync(filePath, 'v4')
    await new Promise(r => setTimeout(r, 600))

    watcher.stop()
    // Should only emit once despite 3 rapid writes
    assert.equal(changes.length, 1)
  })

  it('ignores changes triggered by internal writes (suppression)', async () => {
    const filePath = path.join(tmpDir, 'internal.md')
    fs.writeFileSync(filePath, 'initial')

    const changes: string[] = []
    const watcher = new NoteWatcher(tmpDir, (noteId) => changes.push(noteId))
    watcher.start()

    await new Promise(r => setTimeout(r, 100))
    watcher.suppressNext('internal')
    fs.writeFileSync(filePath, 'internal-write')
    await new Promise(r => setTimeout(r, 600))

    watcher.stop()
    assert.equal(changes.length, 0) // suppressed
  })
})
```

- [ ] **Step 2: Implement NoteWatcher**

```typescript
// src/main/notes/note-watcher.ts
import fs from 'node:fs'
import path from 'node:path'

/**
 * Watches the notes directory for external file changes.
 * Debounces and deduplicates rapid events. Supports suppression
 * for changes triggered by the app itself (via NoteManager.save).
 */
export class NoteWatcher {
  private dir: string
  private onChange: (noteId: string) => void
  private watcher: fs.FSWatcher | null = null
  private pending = new Map<string, NodeJS.Timeout>()
  private suppressed = new Set<string>()
  private debounceMs = 500

  constructor(dir: string, onChange: (noteId: string) => void) {
    this.dir = dir
    this.onChange = onChange
  }

  start(): void {
    if (this.watcher) return
    try {
      this.watcher = fs.watch(this.dir, (eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return
        const noteId = filename.replace(/\.md$/, '')
        this.debounce(noteId)
      })
      this.watcher.on('error', () => {
        // Non-fatal — watcher may close on directory rename etc.
        this.stop()
      })
    } catch {
      // Directory may not exist yet
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    for (const timer of this.pending.values()) clearTimeout(timer)
    this.pending.clear()
    this.suppressed.clear()
  }

  /** Suppress the next change event for a specific noteId (internal write). */
  suppressNext(noteId: string): void {
    this.suppressed.add(noteId)
    // Auto-clear after 2s in case the fs event never fires
    setTimeout(() => this.suppressed.delete(noteId), 2000)
  }

  private debounce(noteId: string): void {
    // Clear any existing pending event for this note
    const existing = this.pending.get(noteId)
    if (existing) clearTimeout(existing)

    this.pending.set(noteId, setTimeout(() => {
      this.pending.delete(noteId)

      // Check suppression
      if (this.suppressed.has(noteId)) {
        this.suppressed.delete(noteId)
        return
      }

      this.onChange(noteId)
    }, this.debounceMs))
  }
}
```

- [ ] **Step 3: Run tests**

```bash
node --test --import tsx test/main/note-watcher.test.ts
```

---

## Task 5: Notes File Watcher — Integration

**Files:**
- Modify: `src/main/ipc-hub.ts`
- Modify: `src/main/notes/note-manager.ts` (suppress on save)
- Modify: `src/renderer/components/NotesCell.tsx`

- [ ] **Step 1: Start watcher in ipc-hub, forward changes**

In ipc-hub.ts, import and initialize:
```typescript
import { NoteWatcher } from './notes/note-watcher'
```

In the constructor or init, after NoteManager initialization:
```typescript
this.noteWatcher = new NoteWatcher(this.noteManager.getNotesDir(), (noteId) => {
  console.log(`[NoteWatcher] External change detected: ${noteId}`)
  this.tagIndex.rebuild()
  this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, {
    action: 'external-update',
    id: noteId,
  })
})
this.noteWatcher.start()
```

Add field to class: `private noteWatcher: NoteWatcher`

- [ ] **Step 2: Add getNotesDir() to NoteManager**

In `note-manager.ts`, add:
```typescript
getNotesDir(): string {
  return this.notesDir
}
```

- [ ] **Step 3: Suppress internal writes**

In ipc-hub's NOTES_SAVE handler, before calling noteManager.save:
```typescript
this.noteWatcher?.suppressNext(id)
```

Same for NOTES_CREATE, NOTES_DELETE, NOTES_TRASH, tag operations that modify files.

- [ ] **Step 4: Reload open tabs in NotesCell on NOTES_CHANGED**

In `NotesCell.tsx`, add a useEffect:
```typescript
// Listen for external note changes — reload open tabs
useEffect(() => {
  const apiObj = (window as any).cipherMux
  if (!apiObj?.notes?.onChanged) return
  const unsub = apiObj.notes.onChanged(async (event: any) => {
    const action = event?.action
    const noteId = event?.id
    if (!noteId) return

    // Only reload if this note is open in a tab
    const tab = tabs.find(t => t.id === noteId)
    if (!tab) return

    // Don't reload if tab is dirty (user has unsaved changes)
    if (tab.dirty) return

    try {
      const result = await apiObj.notes.read(noteId)
      if (!result) return

      // Check if content actually changed
      if (result.body === tab.content) return

      let testcase: ParsedTestcase | undefined
      if (result.info?.tags?.includes('testcase')) {
        const parsed = await apiObj.notes.parseTestcase(noteId)
        testcase = parsed ?? undefined
      }

      setTabs(prev => prev.map(t =>
        t.id === noteId
          ? { ...t, content: result.body, title: result.info?.title ?? t.title, tags: result.info?.tags ?? t.tags, testcase }
          : t
      ))
    } catch (err) {
      console.warn('[NotesCell] Failed to reload note after external change:', err)
    }
  })
  return unsub
}, [tabs])
```

---

## Task 6: Tests + Verification

- [ ] **Step 1: Run all new tests**
```bash
node --test --import tsx test/main/tag-merge.test.ts test/main/note-watcher.test.ts
```

- [ ] **Step 2: Run full test suite**
```bash
npm run test
```

- [ ] **Step 3: Build verification**
```bash
npm run build
```

---

## Task 7: Testcases + Feature Note Tags + Commit

- [ ] **Step 1: Add testcases**

Section: `## Welle F2: Tag Management + File Watching`

```
- [ ] **T-F2.1** Tag-Merge: 2 Tags auswaehlen und mergen — Notes werden aktualisiert
- [ ] **T-F2.2** Tag-Merge: Note mit beiden Source-Tags behaelt nur den Target-Tag (kein Duplikat)
- [ ] **T-F2.3** Exklusive Kategorien: status:open setzen, dann status:done setzen — open wird automatisch entfernt
- [ ] **T-F2.4** Exklusive Kategorien: kind:bugreport setzen, dann kind:feature — bugreport wird ersetzt
- [ ] **T-F2.5** Cycle-Click: Klick auf status:open Tag-Chip wechselt zu status:in-progress
- [ ] **T-F2.6** Cycle-Click: Weiterer Klick wechselt zu status:done, dann zurueck zu open
- [ ] **T-F2.7** File Watching: Externe Aenderung an Note-Datei wird im offenen Editor sofort sichtbar
- [ ] **T-F2.8** File Watching: Interne Saves (via App) loesen keinen doppelten Reload aus
- [ ] **T-F2.9** File Watching: Dirty Tab (ungespeicherte Aenderungen) wird nicht ueberschrieben
- [ ] **T-F2.10** TagManager zeigt Merge-Button, Multi-Select funktioniert
```

- [ ] **Step 2: Update feature note tags**

- [ ] **Step 3: Commit Welle F2**

```bash
git commit -m "feat: Welle F2 — tag management (merge, exclusive, cycle) + notes file watching

F-N5+N1: Tag Management System
- Merge: combine multiple tags into one, propagate to all notes
- Exclusive categories: status/kind enforce single value per note
- Cycle-click: click tag chips to cycle through class values
- TagManager UI: merge mode with multi-select

F-N2: Notes Editor Live File Watching
- fs.watch on notes directory with debounce + dedup
- Suppression for internal writes (no double-reload)
- Open tabs auto-reload on external changes (dirty tabs protected)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
