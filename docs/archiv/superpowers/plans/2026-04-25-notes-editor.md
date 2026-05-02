# Notes Editor Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a markdown notes editor as third grid cell type, with CodeMirror 6, Ollama auto-tagging, workspace-bound notes storage, and sidebar integration.

**Architecture:** NoteManager in main process handles filesystem CRUD on `~/.config/cipher-mux/notes/`. IPC bridge exposes notes API to renderer. NotesCell component renders CodeMirror 6 editor with tab bar. Sidebar gets a Notes tab for browsing/filtering. GridSlot gains a `type` field to distinguish session vs notes cells.

**Tech Stack:** CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/language`), gray-matter (frontmatter parsing), existing OllamaClient for auto-tagging.

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install CodeMirror 6 and gray-matter**

```bash
npm install @codemirror/view @codemirror/state @codemirror/lang-markdown @codemirror/language @codemirror/commands @codemirror/search gray-matter
```

- [ ] **Step 2: Verify installation**

Run: `node -e "require('@codemirror/view'); require('gray-matter'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add codemirror 6 + gray-matter dependencies for notes editor"
```

---

### Task 2: Shared Types & IPC Channels

**Files:**
- Modify: `src/shared/types.ts` (add NoteInfo, NoteContent, TagEntry, TagRepository types + extend AppConfig)
- Modify: `src/shared/ipc-channels.ts` (add NOTES_* channels)
- Modify: `src/shared/grid-types.ts` (add type to GridSlot)
- Modify: `src/shared/persona-types.ts` (add type to WorkspaceCell)

- [ ] **Step 1: Write failing test for GridSlot type field**

Create: `test/main/notes-grid-slot-type.test.ts`

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyGrid, assignSessionToGrid } from '../../src/shared/grid-types'

describe('GridSlot type field', () => {
  it('defaults to session type on empty grid', () => {
    const grid = createEmptyGrid()
    for (const slot of grid.slots) {
      assert.strictEqual(slot.type, 'session')
    }
  })

  it('preserves type on assignSessionToGrid', () => {
    const grid = createEmptyGrid()
    grid.slots[0].type = 'notes'
    const { state } = assignSessionToGrid(grid, 'test-123')
    // Should assign to first empty 'session' slot, not the notes slot
    assert.strictEqual(state.slots[0].type, 'notes')
    assert.strictEqual(state.slots[0].sessionId, null) // notes slot untouched
    assert.strictEqual(state.slots[1].sessionId, 'test-123')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "GridSlot type field"`
Expected: FAIL — `type` property doesn't exist on GridSlot

- [ ] **Step 3: Add type to GridSlot in grid-types.ts**

Modify `src/shared/grid-types.ts`:

At the `GridSlot` interface (line 10-15), add `type` field:

```typescript
export interface GridSlot {
  /** Session ID occupying this slot, or null for an empty (launcher) cell. */
  sessionId: string | null
  /** Vertical span (1–3). Width is always 1 column. */
  rowSpan: number
  /** Cell type — 'session' (default) or 'notes' editor. */
  type: 'session' | 'notes'
}
```

Update `createEmptyGrid` (line 41-48) to include type:

```typescript
export function createEmptyGrid(config: GridConfig = DEFAULT_GRID_CONFIG): GridState {
  const totalSlots = config.cols * config.rows
  const slots: GridSlot[] = Array.from({ length: totalSlots }, () => ({
    sessionId: null,
    rowSpan: 1,
    type: 'session' as const,
  }))
  return { config, slots }
}
```

Update `assignSessionToGrid` (line 56-65) to skip notes slots:

```typescript
export function assignSessionToGrid(
  state: GridState,
  sessionId: string,
): { state: GridState; slotIndex: number } {
  const idx = state.slots.findIndex((s) => s.sessionId === null && s.type !== 'notes')
  if (idx === -1) return { state, slotIndex: -1 }
  const newSlots = [...state.slots]
  newSlots[idx] = { ...newSlots[idx], sessionId }
  return { state: { ...state, slots: newSlots }, slotIndex: idx }
}
```

Update `findFirstEmptySlot` (line 50-53) to skip notes slots:

```typescript
export function findFirstEmptySlot(state: GridState): number {
  return state.slots.findIndex((s) => s.sessionId === null && s.type !== 'notes')
}
```

Update `resizeGrid` (line 98-114) to preserve type in new slots:

```typescript
export function resizeGrid(state: GridState, newConfig: GridConfig): GridState {
  const newTotal = newConfig.cols * newConfig.rows
  const newSlots: GridSlot[] = Array.from({ length: newTotal }, (_, i) => {
    if (i < state.slots.length) return { ...state.slots[i] }
    return { sessionId: null, rowSpan: 1, type: 'session' as const }
  })
  const overflow = state.slots.slice(newTotal).filter((s) => s.sessionId !== null)
  for (const orphan of overflow) {
    const emptyIdx = newSlots.findIndex((s) => s.sessionId === null && s.type !== 'notes')
    if (emptyIdx !== -1) {
      newSlots[emptyIdx] = { ...orphan }
    }
  }
  return { config: newConfig, slots: newSlots }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "GridSlot type field"`
Expected: PASS

- [ ] **Step 5: Add Note types to shared/types.ts**

Add after the Tasks section (after line 341) in `src/shared/types.ts`:

```typescript
// ─── Notes ──────────────────────────────────────────────

export interface NoteInfo {
  /** Unique note ID (filename without extension). */
  id: string
  /** Note title (from frontmatter or first heading). */
  title: string
  /** Tags (manual + auto-generated). */
  tags: string[]
  /** Workspace scope ('global' or workspace ID). */
  scope: string
  /** File path relative to notes root. */
  relativePath: string
  /** Created timestamp (ISO). */
  createdAt: string
  /** Last modified timestamp (ISO). */
  modifiedAt: string
}

export interface NoteContent {
  info: NoteInfo
  /** Raw markdown content (without frontmatter). */
  body: string
}

export interface TagEntry {
  count: number
  description: string
}

export interface TagRepository {
  tags: Record<string, TagEntry>
}
```

- [ ] **Step 6: Add NOTES_* channels to ipc-channels.ts**

Add after the Tasks section (after line 126) in `src/shared/ipc-channels.ts`:

```typescript
  // Notes
  NOTES_LIST: 'cipher-mux:notes:list',
  NOTES_READ: 'cipher-mux:notes:read',
  NOTES_SAVE: 'cipher-mux:notes:save',
  NOTES_CREATE: 'cipher-mux:notes:create',
  NOTES_DELETE: 'cipher-mux:notes:delete',
  NOTES_TAGS: 'cipher-mux:notes:tags',
  NOTES_CHANGED: 'cipher-mux:notes:changed',
```

- [ ] **Step 7: Add type to WorkspaceCell**

Modify `src/shared/persona-types.ts` WorkspaceCell interface (line 11-15):

```typescript
export interface WorkspaceCell {
  persona: string    // persona.id
  project: string    // project path or slug
  prompt: string     // per-cell override (empty = use persona/workspace default)
  /** Cell type — 'session' (default) or 'notes' editor. */
  type?: 'session' | 'notes'
}
```

- [ ] **Step 8: Run all tests to verify no regressions**

Run: `npm test`
Expected: All existing tests pass (some may need minor fixes for the new `type` field in GridSlot)

- [ ] **Step 9: Fix any failing tests**

If existing tests create GridSlot objects without `type`, add `type: 'session'` to those test fixtures. The `grid-types.test.ts` file likely creates slots — update those.

- [ ] **Step 10: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts src/shared/grid-types.ts src/shared/persona-types.ts test/main/notes-grid-slot-type.test.ts
git commit -m "feat(notes): add Note types, IPC channels, GridSlot type field"
```

---

### Task 3: NoteManager — CRUD & File Operations

**Files:**
- Create: `src/main/notes/note-manager.ts`
- Create: `src/main/notes/note-types.ts`
- Create: `test/main/note-manager.test.ts`

- [ ] **Step 1: Write failing test for NoteManager**

Create `test/main/note-manager.test.ts`:

```typescript
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { NoteManager } from '../../src/main/notes/note-manager'

describe('NoteManager', () => {
  const tmpDir = path.join(os.tmpdir(), `cipher-mux-notes-test-${Date.now()}`)
  let manager: NoteManager

  before(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    manager = new NoteManager(tmpDir)
  })

  after(() => {
    manager.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a note with frontmatter', async () => {
    const note = await manager.create('global', 'Test Note', 'Hello **world**')
    assert.ok(note.id)
    assert.strictEqual(note.title, 'Test Note')
    assert.strictEqual(note.scope, 'global')
    assert.ok(note.createdAt)

    // Verify file on disk
    const filePath = path.join(tmpDir, 'global', `${note.id}.md`)
    assert.ok(fs.existsSync(filePath))
    const raw = fs.readFileSync(filePath, 'utf-8')
    assert.ok(raw.includes('title: Test Note'))
    assert.ok(raw.includes('Hello **world**'))
  })

  it('lists notes for a scope', async () => {
    const notes = await manager.list('global')
    assert.ok(notes.length >= 1)
    assert.ok(notes.some(n => n.title === 'Test Note'))
  })

  it('reads note content', async () => {
    const notes = await manager.list('global')
    const content = await manager.read(notes[0].id, 'global')
    assert.ok(content)
    assert.strictEqual(content.body, 'Hello **world**')
  })

  it('saves note with updated content', async () => {
    const notes = await manager.list('global')
    await manager.save(notes[0].id, 'global', 'Updated content', ['manual-tag'])
    const content = await manager.read(notes[0].id, 'global')
    assert.strictEqual(content!.body, 'Updated content')
    assert.deepStrictEqual(content!.info.tags, ['manual-tag'])
  })

  it('creates workspace-scoped notes', async () => {
    const note = await manager.create('workspace-trading', 'Trading Note', 'Buy low sell high')
    assert.strictEqual(note.scope, 'workspace-trading')
    const notes = await manager.list('workspace-trading')
    assert.strictEqual(notes.length, 1)
  })

  it('lists all notes across scopes', async () => {
    const all = await manager.listAll()
    assert.ok(all.length >= 2) // global + workspace
  })

  it('deletes a note', async () => {
    const notes = await manager.list('workspace-trading')
    await manager.delete(notes[0].id, 'workspace-trading')
    const after = await manager.list('workspace-trading')
    assert.strictEqual(after.length, 0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "NoteManager"`
Expected: FAIL — module not found

- [ ] **Step 3: Create note-types.ts**

Create `src/main/notes/note-types.ts`:

```typescript
export interface NoteFrontmatter {
  title: string
  tags: string[]
  created: string
  modified: string
}

export interface NoteFile {
  frontmatter: NoteFrontmatter
  body: string
  filePath: string
}
```

- [ ] **Step 4: Create NoteManager**

Create `src/main/notes/note-manager.ts`:

```typescript
import * as fs from 'fs'
import * as path from 'path'
import matter from 'gray-matter'
import { ulid } from 'ulidx'
import type { NoteInfo, NoteContent } from '../../shared/types'
import type { NoteFrontmatter } from './note-types'

export class NoteManager {
  constructor(private notesDir: string) {
    fs.mkdirSync(path.join(notesDir, 'global'), { recursive: true })
  }

  async create(scope: string, title: string, body: string): Promise<NoteInfo> {
    const id = ulid().toLowerCase()
    const now = new Date().toISOString()
    const frontmatter: NoteFrontmatter = {
      title,
      tags: [],
      created: now,
      modified: now,
    }
    const content = matter.stringify(body, frontmatter)
    const scopeDir = path.join(this.notesDir, scope)
    fs.mkdirSync(scopeDir, { recursive: true })
    const filePath = path.join(scopeDir, `${id}.md`)
    fs.writeFileSync(filePath, content, 'utf-8')

    return {
      id,
      title,
      tags: [],
      scope,
      relativePath: `${scope}/${id}.md`,
      createdAt: now,
      modifiedAt: now,
    }
  }

  async list(scope: string): Promise<NoteInfo[]> {
    const scopeDir = path.join(this.notesDir, scope)
    if (!fs.existsSync(scopeDir)) return []

    const files = fs.readdirSync(scopeDir).filter(f => f.endsWith('.md'))
    const notes: NoteInfo[] = []

    for (const file of files) {
      const filePath = path.join(scopeDir, file)
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const parsed = matter(raw)
        const fm = parsed.data as Partial<NoteFrontmatter>
        notes.push({
          id: path.basename(file, '.md'),
          title: fm.title ?? path.basename(file, '.md'),
          tags: Array.isArray(fm.tags) ? fm.tags : [],
          scope,
          relativePath: `${scope}/${file}`,
          createdAt: fm.created ?? '',
          modifiedAt: fm.modified ?? '',
        })
      } catch {
        // Skip malformed files
      }
    }

    return notes.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  }

  async listAll(): Promise<NoteInfo[]> {
    const scopes = fs.readdirSync(this.notesDir).filter(f => {
      const full = path.join(this.notesDir, f)
      return fs.statSync(full).isDirectory() && !f.startsWith('.')
    })
    const all: NoteInfo[] = []
    for (const scope of scopes) {
      const notes = await this.list(scope)
      all.push(...notes)
    }
    return all.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  }

  async read(id: string, scope: string): Promise<NoteContent | null> {
    const filePath = path.join(this.notesDir, scope, `${id}.md`)
    if (!fs.existsSync(filePath)) return null

    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = matter(raw)
    const fm = parsed.data as Partial<NoteFrontmatter>

    return {
      info: {
        id,
        title: fm.title ?? id,
        tags: Array.isArray(fm.tags) ? fm.tags : [],
        scope,
        relativePath: `${scope}/${id}.md`,
        createdAt: fm.created ?? '',
        modifiedAt: fm.modified ?? '',
      },
      body: parsed.content.trim(),
    }
  }

  async save(id: string, scope: string, body: string, tags?: string[]): Promise<NoteInfo> {
    const filePath = path.join(this.notesDir, scope, `${id}.md`)
    const now = new Date().toISOString()
    let title = id
    let created = now

    // Read existing frontmatter to preserve created date and title
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = matter(raw)
      const fm = parsed.data as Partial<NoteFrontmatter>
      title = fm.title ?? id
      created = fm.created ?? now
    }

    // Derive title from first heading if present
    const headingMatch = body.match(/^#\s+(.+)$/m)
    if (headingMatch) {
      title = headingMatch[1].trim()
    }

    const frontmatter: NoteFrontmatter = {
      title,
      tags: tags ?? [],
      created,
      modified: now,
    }

    const content = matter.stringify(body, frontmatter)
    fs.writeFileSync(filePath, content, 'utf-8')

    return {
      id,
      title,
      tags: frontmatter.tags,
      scope,
      relativePath: `${scope}/${id}.md`,
      createdAt: created,
      modifiedAt: now,
    }
  }

  async delete(id: string, scope: string): Promise<boolean> {
    const filePath = path.join(this.notesDir, scope, `${id}.md`)
    if (!fs.existsSync(filePath)) return false
    fs.unlinkSync(filePath)
    return true
  }

  destroy(): void {
    // Clean up resources (file watchers, etc.) — placeholder for now
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "NoteManager"`
Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/notes/note-manager.ts src/main/notes/note-types.ts test/main/note-manager.test.ts
git commit -m "feat(notes): NoteManager with CRUD, frontmatter parsing, scope support"
```

---

### Task 4: NoteTagging — Ollama Auto-Tagging + Tag Repository

**Files:**
- Create: `src/main/notes/note-tagging.ts`
- Create: `test/main/note-tagging.test.ts`

- [ ] **Step 1: Write failing test for tag prompt generation and tag repo**

Create `test/main/note-tagging.test.ts`:

```typescript
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { NoteTagging, parseTagResponse, SEED_TAGS } from '../../src/main/notes/note-tagging'

describe('NoteTagging', () => {
  const tmpDir = path.join(os.tmpdir(), `cipher-mux-tagging-test-${Date.now()}`)
  let tagging: NoteTagging

  before(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    tagging = new NoteTagging(tmpDir)
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('initializes tag repository with seed tags', () => {
    const repo = tagging.getTagRepository()
    assert.ok(Object.keys(repo.tags).length > 0)
    assert.ok(repo.tags['trading'])
    assert.ok(repo.tags['infra'])
  })

  it('parses JSON array tag response', () => {
    const result = parseTagResponse('["trading", "risk", "strategie"]')
    assert.deepStrictEqual(result, ['trading', 'risk', 'strategie'])
  })

  it('parses comma-separated tag response', () => {
    const result = parseTagResponse('trading, risk, strategie')
    assert.deepStrictEqual(result, ['trading', 'risk', 'strategie'])
  })

  it('limits to 5 tags', () => {
    const result = parseTagResponse('a, b, c, d, e, f, g')
    assert.strictEqual(result.length, 5)
  })

  it('updates tag repository after tagging', () => {
    tagging.updateRepository(['trading', 'new-tag'])
    const repo = tagging.getTagRepository()
    assert.ok(repo.tags['new-tag'])
    assert.strictEqual(repo.tags['new-tag'].count, 1)
    // Trading count should have incremented
    assert.ok(repo.tags['trading'].count > 0)
  })

  it('seed tags cover the cipher ecosystem', () => {
    const seedKeys = Object.keys(SEED_TAGS)
    // Core domains
    assert.ok(seedKeys.includes('trading'))
    assert.ok(seedKeys.includes('infra'))
    assert.ok(seedKeys.includes('coding'))
    assert.ok(seedKeys.includes('project'))
    assert.ok(seedKeys.includes('research'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "NoteTagging"`
Expected: FAIL — module not found

- [ ] **Step 3: Create NoteTagging**

Create `src/main/notes/note-tagging.ts`:

```typescript
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'node:http'
import type { TagRepository, TagEntry } from '../../shared/types'

const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11433
const TIMEOUT_MS = 60_000

/**
 * Seed tags — the Grundstock for the cipher ecosystem.
 * These establish a shared vocabulary so auto-tagging stays consistent.
 */
export const SEED_TAGS: Record<string, TagEntry> = {
  // Trading & Finance
  'trading': { count: 0, description: 'Handelsstrategien, Marktanalyse, Backtesting' },
  'risk': { count: 0, description: 'Risikomanagement, Position Sizing, Drawdown' },
  'market-data': { count: 0, description: 'Kursdaten, Feeds, historische Daten' },
  'portfolio': { count: 0, description: 'Portfoliostruktur, Allocation, Rebalancing' },

  // Infrastructure
  'infra': { count: 0, description: 'Server, Netzwerk, Deployment, Docker' },
  'tailscale': { count: 0, description: 'Tailscale VPN, Mesh-Netzwerk, Node-Verbindungen' },
  'truenas': { count: 0, description: 'TrueNAS, ZFS, Storage, Datasets' },
  'monitoring': { count: 0, description: 'Observability, Logging, Metriken, Alerting' },

  // Development
  'coding': { count: 0, description: 'Programmierung, Implementierung, Code-Patterns' },
  'typescript': { count: 0, description: 'TypeScript, Node.js, npm, Electron' },
  'python': { count: 0, description: 'Python, Skripte, Data-Processing' },
  'testing': { count: 0, description: 'Unit-Tests, Integration-Tests, TDD' },
  'architecture': { count: 0, description: 'Systemarchitektur, ADRs, Design-Entscheidungen' },
  'debugging': { count: 0, description: 'Fehlersuche, Bugfixes, Troubleshooting' },

  // Projects
  'project': { count: 0, description: 'Projektplanung, Milestones, Roadmap' },
  'cipher-mux': { count: 0, description: 'cipher-mux Electron App, Session Grid' },
  'cipher-boox': { count: 0, description: 'cipher-boox E-Book Reader' },
  'openclaw': { count: 0, description: 'OpenClaw Plattform, API, Integration' },

  // Research & Learning
  'research': { count: 0, description: 'Recherche, Papers, Artikel, Analysen' },
  'ai-ml': { count: 0, description: 'KI, Machine Learning, LLMs, Prompting' },
  'idea': { count: 0, description: 'Ideen, Konzepte, Brainstorming-Notizen' },

  // Operations
  'automation': { count: 0, description: 'Workflows, n8n, Skripte, Cron-Jobs' },
  'security': { count: 0, description: 'Sicherheit, SSH, Credentials, Auth' },
  'backup': { count: 0, description: 'Backups, Snapshots, Disaster Recovery' },

  // Personal
  'journal': { count: 0, description: 'Tagesnotizen, Reflexionen, Learnings' },
  'reference': { count: 0, description: 'Nachschlagewerk, Links, Dokumentation' },
  'todo': { count: 0, description: 'Aufgaben, Checklisten, Action Items' },
}

const TAGGING_PROMPT = `Du bist ein aufmerksamer Archivar, der Notizen liest und ihnen passende Tags zuweist. Deine Aufgabe ist es, den Kern einer Notiz zu erfassen und die treffendsten Schlagworte dafür zu finden.

Regeln:
- Wähle maximal 5 Tags
- Bevorzuge Tags aus dem bestehenden Repository (unten aufgelistet) — Konsistenz ist wichtiger als Kreativität
- Erfinde nur dann einen neuen Tag, wenn wirklich nichts Bestehendes passt
- Neue Tags: kurz, lowercase, Bindestrich statt Leerzeichen
- Antworte NUR mit den Tags als JSON-Array, z.B. ["trading", "risk", "strategie"]

Bestehendes Tag-Repository:
{TAGS}

Notiz:
{CONTENT}`

export function parseTagResponse(text: string): string[] {
  const trimmed = text.trim()

  // Try JSON array first
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed
        .map((t: unknown) => String(t).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 5)
    }
  } catch {
    // Not valid JSON
  }

  // Try extracting JSON array from text
  const arrayMatch = trimmed.match(/\[([^\]]+)\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(`[${arrayMatch[1]}]`)
      if (Array.isArray(parsed)) {
        return parsed
          .map((t: unknown) => String(t).trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 5)
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: comma-separated
  return trimmed
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .slice(0, 5)
}

export class NoteTagging {
  private repoPath: string
  private repository: TagRepository

  constructor(notesDir: string) {
    this.repoPath = path.join(notesDir, '.tags.json')
    this.repository = this.loadRepository()
  }

  private loadRepository(): TagRepository {
    if (fs.existsSync(this.repoPath)) {
      try {
        const raw = fs.readFileSync(this.repoPath, 'utf-8')
        const parsed = JSON.parse(raw) as TagRepository
        // Merge seed tags that don't exist yet
        for (const [key, entry] of Object.entries(SEED_TAGS)) {
          if (!parsed.tags[key]) {
            parsed.tags[key] = { ...entry }
          }
        }
        return parsed
      } catch {
        // Corrupted file — start fresh
      }
    }
    const repo: TagRepository = { tags: { ...SEED_TAGS } }
    this.saveRepository(repo)
    return repo
  }

  private saveRepository(repo: TagRepository): void {
    fs.mkdirSync(path.dirname(this.repoPath), { recursive: true })
    fs.writeFileSync(this.repoPath, JSON.stringify(repo, null, 2), 'utf-8')
  }

  getTagRepository(): TagRepository {
    return this.repository
  }

  updateRepository(tags: string[]): void {
    for (const tag of tags) {
      if (this.repository.tags[tag]) {
        this.repository.tags[tag].count++
      } else {
        this.repository.tags[tag] = { count: 1, description: '' }
      }
    }
    this.saveRepository(this.repository)
  }

  /**
   * Auto-tag a note via Ollama. Fire-and-forget — returns null if Ollama
   * is not reachable. Caller handles the fallback.
   */
  async autoTag(content: string): Promise<string[] | null> {
    try {
      const tagList = Object.entries(this.repository.tags)
        .map(([name, entry]) => `  ${name}: ${entry.description}`)
        .join('\n')

      const prompt = TAGGING_PROMPT
        .replace('{TAGS}', tagList)
        .replace('{CONTENT}', content.slice(0, 3000)) // Limit content to avoid huge prompts

      const body = JSON.stringify({
        model: 'gemma4:27b',
        prompt,
        stream: false,
        keep_alive: -1,
      })

      const raw = await this.ollamaPost('/api/generate', body)
      const data = JSON.parse(raw) as Record<string, unknown>
      const text = (data.response as string | undefined)?.trim()
      if (!text) return null

      const tags = parseTagResponse(text)
      if (tags.length > 0) {
        this.updateRepository(tags)
      }
      return tags
    } catch {
      return null
    }
  }

  private ollamaPost(urlPath: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: OLLAMA_HOST,
          port: OLLAMA_PORT,
          path: urlPath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Ollama HTTP ${res.statusCode}`))
              return
            }
            resolve(Buffer.concat(chunks).toString('utf-8'))
          })
        },
      )
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Ollama request timed out'))
      })
      req.write(body)
      req.end()
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "NoteTagging"`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/notes/note-tagging.ts test/main/note-tagging.test.ts
git commit -m "feat(notes): NoteTagging with Ollama auto-tagging + seed tag repository"
```

---

### Task 5: IPC Registration — Preload Bridge + IpcHub

**Files:**
- Modify: `src/main/preload.ts` (add notes namespace)
- Modify: `src/main/ipc-hub.ts` (add NoteManager init + registerNoteChannels)

- [ ] **Step 1: Add notes namespace to preload.ts**

Add after the Tasks section (after line 187) in `src/main/preload.ts`:

```typescript
  // ─── Notes ──────────────────────────────────────────────
  notes: {
    list: (scope?: string) => ipcRenderer.invoke(IPC.NOTES_LIST, { scope }),
    read: (id: string, scope: string) => ipcRenderer.invoke(IPC.NOTES_READ, { id, scope }),
    save: (id: string, scope: string, body: string, tags?: string[]) =>
      ipcRenderer.invoke(IPC.NOTES_SAVE, { id, scope, body, tags }),
    create: (scope: string, title: string, body: string) =>
      ipcRenderer.invoke(IPC.NOTES_CREATE, { scope, title, body }),
    delete: (id: string, scope: string) =>
      ipcRenderer.invoke(IPC.NOTES_DELETE, { id, scope }),
    tags: () => ipcRenderer.invoke(IPC.NOTES_TAGS),
    onChanged: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.NOTES_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC.NOTES_CHANGED, handler)
    },
  },
```

- [ ] **Step 2: Add NoteManager to IpcHub**

In `src/main/ipc-hub.ts`:

Add imports at the top (after line 19):
```typescript
import { NoteManager } from './notes/note-manager'
import { NoteTagging } from './notes/note-tagging'
```

Add properties to IpcHub class (after line 49):
```typescript
  private noteManager: NoteManager
  private noteTagging: NoteTagging
```

In constructor (after line 76, after bugreportManager init):
```typescript
    const notesDir = path.join(os.homedir(), '.config', 'cipher-mux', 'notes')
    this.noteManager = new NoteManager(notesDir)
    this.noteTagging = new NoteTagging(notesDir)
```

Add `this.registerNoteChannels()` in `init()` (after line 106, after registerWorkspaceChannels):
```typescript
    this.registerNoteChannels()
```

Add the registerNoteChannels method (before the `destroy()` method):

```typescript
  // ─── Notes ─────────────────────────────────────────────
  private registerNoteChannels(): void {
    ipcMain.handle(IPC.NOTES_LIST, async (_e, { scope }: { scope?: string }) => {
      if (scope) return this.noteManager.list(scope)
      return this.noteManager.listAll()
    })

    ipcMain.handle(IPC.NOTES_READ, async (_e, { id, scope }: { id: string; scope: string }) => {
      return this.noteManager.read(id, scope)
    })

    ipcMain.handle(IPC.NOTES_SAVE, async (_e, { id, scope, body, tags }: {
      id: string; scope: string; body: string; tags?: string[]
    }) => {
      const note = await this.noteManager.save(id, scope, body, tags)
      this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'updated', note })
      // Async auto-tagging (fire-and-forget, only on manual save)
      if (!tags) {
        this.noteTagging.autoTag(body).then(async (autoTags) => {
          if (autoTags && autoTags.length > 0) {
            const updated = await this.noteManager.save(id, scope, body, autoTags)
            this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'tagged', note: updated })
          }
        }).catch(() => { /* Ollama not available — ignore */ })
      }
      return note
    })

    ipcMain.handle(IPC.NOTES_CREATE, async (_e, { scope, title, body }: {
      scope: string; title: string; body: string
    }) => {
      const note = await this.noteManager.create(scope, title, body)
      this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'created', note })
      return note
    })

    ipcMain.handle(IPC.NOTES_DELETE, async (_e, { id, scope }: { id: string; scope: string }) => {
      const ok = await this.noteManager.delete(id, scope)
      if (ok) {
        this.windowManager.sendToMainWindow(IPC.NOTES_CHANGED, { action: 'deleted', id, scope })
      }
      return { ok }
    })

    ipcMain.handle(IPC.NOTES_TAGS, async () => {
      return this.noteTagging.getTagRepository()
    })
  }
```

Add cleanup in `destroy()` (before the existing lines):
```typescript
    this.noteManager.destroy()
```

- [ ] **Step 3: Build to verify compilation**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 4: Commit**

```bash
git add src/main/preload.ts src/main/ipc-hub.ts
git commit -m "feat(notes): IPC bridge — preload API + IpcHub registration for notes"
```

---

### Task 6: useNotes Hook

**Files:**
- Create: `src/renderer/hooks/useNotes.ts`

- [ ] **Step 1: Create useNotes hook**

Create `src/renderer/hooks/useNotes.ts`:

```typescript
import { useState, useEffect, useCallback } from 'preact/hooks'
import type { NoteInfo, NoteContent, TagRepository } from '../../shared/types'

const api = () => (window as any).cipherMux

export function useNotes(activeScope: string = 'global') {
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [tagRepo, setTagRepo] = useState<TagRepository>({ tags: {} })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [list, tags] = await Promise.all([
      api().notes.list(activeScope),
      api().notes.tags(),
    ])
    setNotes(list)
    setTagRepo(tags)
    setLoading(false)
  }, [activeScope])

  useEffect(() => {
    refresh()
    const unsub = api().notes.onChanged(() => refresh())
    return () => unsub()
  }, [refresh])

  const createNote = useCallback(async (title: string, body: string) => {
    return api().notes.create(activeScope, title, body) as Promise<NoteInfo>
  }, [activeScope])

  const readNote = useCallback(async (id: string, scope: string) => {
    return api().notes.read(id, scope) as Promise<NoteContent | null>
  }, [])

  const saveNote = useCallback(async (id: string, scope: string, body: string, tags?: string[]) => {
    return api().notes.save(id, scope, body, tags) as Promise<NoteInfo>
  }, [])

  const deleteNote = useCallback(async (id: string, scope: string) => {
    return api().notes.delete(id, scope) as Promise<{ ok: boolean }>
  }, [])

  return {
    notes,
    tagRepo,
    loading,
    refresh,
    createNote,
    readNote,
    saveNote,
    deleteNote,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/hooks/useNotes.ts
git commit -m "feat(notes): useNotes hook for renderer-side note operations"
```

---

### Task 7: NotesCell Component — CodeMirror Editor + Tab Bar

**Files:**
- Create: `src/renderer/components/NotesCell.tsx`
- Create: `src/renderer/components/NoteEditor.tsx`

- [ ] **Step 1: Create NoteEditor (CodeMirror wrapper)**

Create `src/renderer/components/NoteEditor.tsx`:

```typescript
import { useEffect, useRef, useCallback } from 'preact/hooks'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'

interface NoteEditorProps {
  content: string
  onSave: (content: string) => void
  onAutoSave: (content: string) => void
}

function createCipherTheme(): typeof EditorView.theme {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: 'var(--font-size-base)',
      fontFamily: 'var(--font-mono)',
      backgroundColor: 'var(--color-bg-terminal)',
      color: 'var(--color-text)',
    },
    '.cm-content': {
      padding: 'var(--space-md)',
      caretColor: 'var(--color-accent)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--color-accent)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--color-accent-soft)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--color-accent-soft) !important',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    // Markdown highlighting
    '.cm-header-1': {
      fontSize: '1.4em',
      fontWeight: 'bold',
      color: 'var(--color-accent)',
    },
    '.cm-header-2': {
      fontSize: '1.2em',
      fontWeight: 'bold',
      color: 'var(--color-accent)',
    },
    '.cm-header-3': {
      fontSize: '1.1em',
      fontWeight: 'bold',
      color: 'var(--color-text-accent)',
    },
    '.cm-strong': {
      fontWeight: 'bold',
      color: 'var(--color-text)',
    },
    '.cm-emphasis': {
      fontStyle: 'italic',
    },
    '.cm-link': {
      color: 'var(--color-neon-cyan)',
      textDecoration: 'underline',
    },
    '.cm-url': {
      color: 'var(--color-text-dim)',
    },
    '.cm-monospace, .cm-inlineCode': {
      fontFamily: 'var(--font-mono)',
      color: 'var(--color-neon-green)',
      backgroundColor: 'var(--color-bg-sunken)',
      padding: '1px 4px',
      borderRadius: '2px',
    },
    '.cm-list': {
      color: 'var(--color-accent)',
    },
  })
}

export function NoteEditor({ content, onSave, onAutoSave }: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef(content)

  // Store latest callbacks in refs to avoid recreating editor
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onAutoSaveRef = useRef(onAutoSave)
  onAutoSaveRef.current = onAutoSave

  useEffect(() => {
    if (!containerRef.current) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: (view) => {
          onSaveRef.current(view.state.doc.toString())
          return true
        },
      },
    ])

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const doc = update.state.doc.toString()
        contentRef.current = doc
        // Debounced auto-save
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
        autoSaveTimer.current = setTimeout(() => {
          onAutoSaveRef.current(doc)
        }, 2000)
      }
    })

    const state = EditorState.create({
      doc: content,
      extensions: [
        createCipherTheme(),
        markdown(),
        saveKeymap,
        keymap.of([...defaultKeymap, indentWithTab, ...searchKeymap]),
        updateListener,
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      view.destroy()
      viewRef.current = null
    }
  }, []) // Only mount once

  // Update content when prop changes (different note selected)
  const prevContentProp = useRef(content)
  useEffect(() => {
    if (content !== prevContentProp.current && viewRef.current) {
      prevContentProp.current = content
      const view = viewRef.current
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      })
    }
  }, [content])

  return <div ref={containerRef} class="note-editor" style={{ height: '100%', overflow: 'hidden' }} />
}
```

- [ ] **Step 2: Create NotesCell**

Create `src/renderer/components/NotesCell.tsx`:

```typescript
import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { NoteEditor } from './NoteEditor'
import { useNotes } from '../hooks/useNotes'
import type { NoteInfo, NoteContent } from '../../shared/types'

interface NoteTab {
  id: string
  scope: string
  title: string
  content: string
  dirty: boolean
}

interface NotesCellProps {
  rowSpan: number
  maxRows: number
  activeWorkspaceId: string | null
  onClose: () => void
  onToggleExpand: () => void
  onDragStart: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function NotesCell({
  rowSpan, maxRows, activeWorkspaceId,
  onClose, onToggleExpand, onDragStart, onDragOver, onDrop,
}: NotesCellProps) {
  const scope = activeWorkspaceId ? `workspace-${activeWorkspaceId}` : 'global'
  const { saveNote } = useNotes(scope)
  const [tabs, setTabs] = useState<NoteTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  const openNote = useCallback(async (info: NoteInfo) => {
    // Check if already open
    const existing = tabs.find(t => t.id === info.id)
    if (existing) {
      setActiveTabId(info.id)
      return
    }
    // Read content
    const api = (window as any).cipherMux
    const content: NoteContent | null = await api.notes.read(info.id, info.scope)
    if (!content) return

    const tab: NoteTab = {
      id: info.id,
      scope: info.scope,
      title: info.title,
      content: content.body,
      dirty: false,
    }
    setTabs(prev => [...prev, tab])
    setActiveTabId(info.id)
  }, [tabs])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId) {
        setActiveTabId(filtered.length > 0 ? filtered[filtered.length - 1].id : null)
      }
      return filtered
    })
  }, [activeTabId])

  const handleCreateNote = useCallback(async () => {
    const api = (window as any).cipherMux
    const note = await api.notes.create(scope, '', '# ')
    const tab: NoteTab = {
      id: note.id,
      scope: note.scope,
      title: '(new)',
      content: '# ',
      dirty: false,
    }
    setTabs(prev => [...prev, tab])
    setActiveTabId(note.id)
  }, [scope])

  const handleSave = useCallback((content: string) => {
    if (!activeTab) return
    saveNote(activeTab.id, activeTab.scope, content)
    setTabs(prev => prev.map(t =>
      t.id === activeTab.id ? { ...t, content, dirty: false } : t
    ))
  }, [activeTab, saveNote])

  const handleAutoSave = useCallback((content: string) => {
    if (!activeTab) return
    const api = (window as any).cipherMux
    // Auto-save writes file but doesn't trigger tagging
    api.notes.save(activeTab.id, activeTab.scope, content)
    setTabs(prev => prev.map(t =>
      t.id === activeTab.id ? { ...t, content, dirty: false } : t
    ))
  }, [activeTab])

  // Expose openNote for external calls (from sidebar)
  useEffect(() => {
    const handler = (_e: unknown, data: { note: NoteInfo }) => {
      if (data?.note) openNote(data.note)
    }
    ;(window as any).__notesCell_openNote = openNote
    return () => { delete (window as any).__notesCell_openNote }
  }, [openNote])

  const expanded = rowSpan > 1
  const cellStyle = expanded ? { gridRow: `span ${rowSpan}` } : undefined

  return (
    <div class="session-cell notes-cell" style={cellStyle} onDragOver={onDragOver} onDrop={onDrop}>
      <div class="cell-header" draggable onDragStart={onDragStart}>
        <div class="cell-header__left">
          <span class="neon-dot neon-dot--info" />
          <span class="cell-name">NOTES</span>
          <span class="cell-sep">·</span>
          <span class="cell-ctx ctx-ok">{scope === 'global' ? 'global' : activeWorkspaceId}</span>
        </div>
        <div class="cell-header__right">
          {maxRows > 1 && (
            <button
              class={`cell-btn ${expanded ? 'cell-btn--active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
              title={expanded ? 'höhe zurücksetzen' : 'volle höhe'}
            >{expanded ? '↥' : '↧'}</button>
          )}
          <button class="cell-btn" onClick={(e) => { e.stopPropagation(); onClose() }} title="notes schließen">✕</button>
        </div>
      </div>

      {/* Tab bar */}
      <div class="notes-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            class={`notes-tab ${tab.id === activeTabId ? 'notes-tab--active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span class="notes-tab__title">{tab.title || '(new)'}</span>
            <button
              class="notes-tab__close"
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
            >×</button>
          </div>
        ))}
        <button class="notes-tab notes-tab--add" onClick={handleCreateNote} title="neue note">+</button>
      </div>

      {/* Editor */}
      <div class="notes-editor-area">
        {activeTab ? (
          <NoteEditor
            key={activeTab.id}
            content={activeTab.content}
            onSave={handleSave}
            onAutoSave={handleAutoSave}
          />
        ) : (
          <div class="notes-empty">
            <p>Doppelklick auf eine Note in der Sidebar</p>
            <p>oder</p>
            <button class="btn btn--sm" onClick={handleCreateNote}>+ neue note</button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build to verify compilation**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/NoteEditor.tsx src/renderer/components/NotesCell.tsx
git commit -m "feat(notes): NotesCell + NoteEditor components with CodeMirror 6"
```

---

### Task 8: CSS — Notes Cell + Tab Bar Styling

**Files:**
- Modify: `src/renderer/styles/components.css`

- [ ] **Step 1: Add notes-specific CSS**

Append to `src/renderer/styles/components.css`:

```css
/* ─── Notes Cell ──────────────────────────────────── */

.notes-cell {
  display: flex;
  flex-direction: column;
}

.notes-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--color-bg-sunken);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  scrollbar-width: none;
  min-height: 28px;
}

.notes-tabs::-webkit-scrollbar {
  display: none;
}

.notes-tab {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  color: var(--color-text-dim);
  cursor: pointer;
  border-right: 1px solid var(--color-border);
  white-space: nowrap;
  user-select: none;
}

.notes-tab:hover {
  color: var(--color-text-secondary);
  background: var(--color-bg-elevated);
}

.notes-tab--active {
  color: var(--color-text);
  background: var(--color-bg-terminal);
  border-bottom: 2px solid var(--color-accent);
}

.notes-tab__title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes-tab__close {
  background: none;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  line-height: 1;
}

.notes-tab__close:hover {
  color: var(--color-neon-red);
}

.notes-tab--add {
  color: var(--color-text-dim);
  border-right: none;
  font-size: 14px;
  padding: var(--space-xs) var(--space-sm);
}

.notes-tab--add:hover {
  color: var(--color-accent);
}

.notes-editor-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.notes-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-sm);
  color: var(--color-text-dim);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
}

/* CodeMirror overrides for full integration */
.note-editor .cm-editor {
  height: 100%;
}

.note-editor .cm-scroller {
  font-family: var(--font-mono) !important;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/styles/components.css
git commit -m "feat(notes): CSS for notes cell, tab bar, and editor area"
```

---

### Task 9: Grid Integration — LauncherCell + SessionGrid + useGrid

**Files:**
- Modify: `src/renderer/components/LauncherCell.tsx`
- Modify: `src/renderer/components/SessionGrid.tsx`
- Modify: `src/renderer/hooks/useGrid.ts`

- [ ] **Step 1: Add notes button to LauncherCell**

Replace `src/renderer/components/LauncherCell.tsx`:

```typescript
// src/renderer/components/LauncherCell.tsx

interface LauncherCellProps {
  onLaunch: () => void
  onOpenSession: () => void
  onOpenNotes: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function LauncherCell({ onLaunch, onOpenSession, onOpenNotes, onDragOver, onDrop }: LauncherCellProps) {
  return (
    <div
      class="launcher-cell"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div class="launcher-circle"><span>+</span></div>
      <div class="launcher-buttons">
        <button class="btn btn--sm" onClick={onLaunch}>projekt</button>
        <button class="btn btn--sm" onClick={onOpenSession}>session</button>
        <button class="btn btn--sm" onClick={onOpenNotes}>notes</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update SessionGrid to render NotesCell**

Modify `src/renderer/components/SessionGrid.tsx`:

Add import at the top:
```typescript
import { NotesCell } from './NotesCell'
```

Add `onOpenNotes` and `onCloseNotes` and `activeWorkspaceId` to the props interface:

```typescript
interface SessionGridProps {
  grid: GridState
  sessions: SessionInfo[]
  contextUsages: Record<string, ContextUsage>
  focusedSessionId: string | null
  theme: ThemeName
  orchestratorSessionId: string | null
  activeWorkspaceId: string | null
  onFocusSession: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onSwitchProject: (sessionId: string) => void
  onToggleExpand: (sessionId: string) => void
  onShell: (sessionId: string, projectPath: string | null) => void
  onLaunch: (slotIndex: number) => void
  onOpenSession: (slotIndex: number) => void
  onOpenNotes: (slotIndex: number) => void
  onCloseNotes: (slotIndex: number) => void
  onToggleExpandSlot: (slotIndex: number) => void
  onSwap: (idxA: number, idxB: number) => void
}
```

Update the component function signature and add `onOpenNotes`, `onCloseNotes`, `activeWorkspaceId`, `onToggleExpandSlot` to destructuring.

Update the rendering logic inside `.map()` to handle three cases:

```typescript
{grid.slots.map((slot, idx) => {
  if (covered.has(idx)) return null

  // Notes cell
  if (slot.type === 'notes') {
    return (
      <NotesCell
        key={`notes-${idx}`}
        rowSpan={slot.rowSpan}
        maxRows={rows}
        activeWorkspaceId={activeWorkspaceId}
        onClose={() => onCloseNotes(idx)}
        onToggleExpand={() => onToggleExpandSlot(idx)}
        onDragStart={() => handleDragStart(idx)}
        onDragOver={handleDragOver}
        onDrop={() => handleDrop(idx)}
      />
    )
  }

  // Session cell
  const session = slot.sessionId
    ? sessions.find((s) => s.id === slot.sessionId)
    : null

  if (session) {
    return (
      <SessionCell
        key={slot.sessionId}
        session={session}
        contextUsage={contextUsages[session.id]}
        focused={session.id === focusedSessionId}
        isOrchestrator={session.id === orchestratorSessionId}
        theme={theme}
        rowSpan={slot.rowSpan}
        maxRows={rows}
        onFocus={onFocusSession}
        onClose={onCloseSession}
        onSwitchProject={onSwitchProject}
        onToggleExpand={onToggleExpand}
        onShell={onShell}
        onDragStart={() => handleDragStart(idx)}
        onDragOver={handleDragOver}
        onDrop={() => handleDrop(idx)}
      />
    )
  }

  return (
    <LauncherCell
      key={`launcher-${idx}`}
      onLaunch={() => onLaunch(idx)}
      onOpenSession={() => onOpenSession(idx)}
      onOpenNotes={() => onOpenNotes(idx)}
      onDragOver={handleDragOver}
      onDrop={() => handleDrop(idx)}
    />
  )
})}
```

- [ ] **Step 3: Add setSlotType and toggleExpandSlot to useGrid**

Add to `src/renderer/hooks/useGrid.ts` before the return statement:

```typescript
  const setSlotType = useCallback((slotIndex: number, type: 'session' | 'notes') => {
    setGrid((prev) => {
      // Max one notes cell validation
      if (type === 'notes' && prev.slots.some((s, i) => s.type === 'notes' && i !== slotIndex)) {
        console.warn('[useGrid] Only one notes cell allowed')
        return prev
      }
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], type, sessionId: null }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const clearSlotType = useCallback((slotIndex: number) => {
    setGrid((prev) => {
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], type: 'session', sessionId: null }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])

  const toggleExpandSlot = useCallback((slotIndex: number) => {
    setGrid((prev) => {
      if (slotIndex < 0 || slotIndex >= prev.slots.length) return prev
      const currentSpan = prev.slots[slotIndex].rowSpan
      const newSpan = currentSpan > 1 ? 1 : prev.config.rows
      const newSlots = [...prev.slots]
      newSlots[slotIndex] = { ...newSlots[slotIndex], rowSpan: newSpan }
      const next = { ...prev, slots: newSlots }
      persist(next)
      return next
    })
  }, [persist])
```

Update the return to include the new functions:

```typescript
  return { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand, applyMerges, setSlotType, clearSlotType, toggleExpandSlot }
```

- [ ] **Step 4: Build to verify compilation**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/LauncherCell.tsx src/renderer/components/SessionGrid.tsx src/renderer/hooks/useGrid.ts
git commit -m "feat(notes): grid integration — launcher button, grid rendering, slot type management"
```

---

### Task 10: App.tsx Wiring

**Files:**
- Modify: `src/renderer/app.tsx`

- [ ] **Step 1: Wire notes into App component**

Add imports to `src/renderer/app.tsx` (no new component imports needed — SessionGrid handles it internally).

Destructure new functions from useGrid (line 42):
```typescript
  const { grid, addSession, removeSession, swap, resize, setSessionAtSlot, toggleExpand, applyMerges, setSlotType, clearSlotType, toggleExpandSlot } = useGrid(panelWidthRef.current)
```

Add activeWorkspaceId state (it may already be accessible — check if workspaces.active() is called):
```typescript
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
```

Load active workspace on mount:
```typescript
  useEffect(() => {
    const api = (window as any).cipherMux
    api.workspaces.active().then((id: string | null) => {
      setActiveWorkspaceId(id)
    })
  }, [])
```

Add notes handlers:
```typescript
  const handleOpenNotes = useCallback((slotIndex: number) => {
    setSlotType(slotIndex, 'notes')
    setSidebarVisible(true) // Open sidebar with notes tab
  }, [setSlotType])

  const handleCloseNotes = useCallback((slotIndex: number) => {
    clearSlotType(slotIndex)
  }, [clearSlotType])
```

Update `handleWorkspaceApply` to set activeWorkspaceId:
```typescript
  // After the existing line `configStore.set('activeWorkspaceId', workspaceId)` in the apply result:
  setActiveWorkspaceId(workspaceId)
```

Pass new props to SessionGrid:
```typescript
  <SessionGrid
    grid={grid}
    sessions={sessions}
    contextUsages={contextUsages}
    focusedSessionId={focusedSessionId}
    theme={theme}
    orchestratorSessionId={orchestratorSessionId}
    activeWorkspaceId={activeWorkspaceId}
    onFocusSession={setFocusedSessionId}
    onCloseSession={handleCloseSession}
    onSwitchProject={handleSwitchProject}
    onToggleExpand={toggleExpand}
    onShell={handleShell}
    onLaunch={handleLaunch}
    onOpenSession={handleOpenSession}
    onOpenNotes={handleOpenNotes}
    onCloseNotes={handleCloseNotes}
    onToggleExpandSlot={toggleExpandSlot}
    onSwap={swap}
  />
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.tsx
git commit -m "feat(notes): wire notes cell into App — open/close/expand + workspace scope"
```

---

### Task 11: Sidebar Notes Tab

**Files:**
- Modify: `src/renderer/components/SidebarPanel.tsx`

- [ ] **Step 1: Add Notes section to SidebarPanel**

Add import:
```typescript
import { useNotes } from '../hooks/useNotes'
```

Add to the SidebarPanel props interface:
```typescript
  activeWorkspaceId: string | null
  hasNotesCell: boolean
```

Inside the component, add notes state:
```typescript
  const scope = activeWorkspaceId ? `workspace-${activeWorkspaceId}` : 'global'
  const { notes, tagRepo, refresh } = useNotes(scope)
  const [notesExpanded, setNotesExpanded] = useState(true)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showAllScopes, setShowAllScopes] = useState(false)

  const showNotes = true // Notes tab is always visible

  // Filter notes
  const filteredNotes = notes.filter(n => {
    if (tagFilter.length > 0 && !tagFilter.every(t => n.tags.includes(t))) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      return n.title.toLowerCase().includes(q) || n.tags.some(t => t.includes(q))
    }
    return true
  })

  // All unique tags from current notes
  const availableTags = [...new Set(notes.flatMap(n => n.tags))].sort()

  const handleNoteDoubleClick = useCallback((note: any) => {
    const openFn = (window as any).__notesCell_openNote
    if (openFn) openFn(note)
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setTagFilter(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }, [])
```

Add the Notes section after the Requests section (before the empty state check):

```typescript
      {showNotes && (
        <section class="sidebar-section">
          <div class="sidebar-section__head" onClick={() => setNotesExpanded(v => !v)}>
            <span>{notesExpanded ? '▾' : '▸'} NOTES ({filteredNotes.length})</span>
          </div>
          {notesExpanded && (
            <div class="sidebar-section__feed">
              {/* Search */}
              <input
                type="text"
                class="sidebar-notes__search"
                placeholder="suche..."
                value={searchTerm}
                onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
              />
              {/* Tag chips */}
              {availableTags.length > 0 && (
                <div class="sidebar-notes__tags">
                  {availableTags.map(tag => (
                    <span
                      key={tag}
                      class={`sidebar-notes__tag ${tagFilter.includes(tag) ? 'sidebar-notes__tag--active' : ''}`}
                      onClick={() => toggleTag(tag)}
                    >#{tag}</span>
                  ))}
                </div>
              )}
              {/* Note list */}
              {filteredNotes.map(note => (
                <div
                  key={note.id}
                  class="bg-card"
                  onDblClick={() => handleNoteDoubleClick(note)}
                  title="Doppelklick zum Öffnen"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer?.setData('text/plain', JSON.stringify(note))
                  }}
                >
                  <div class="bg-card__head">
                    <span class="bg-card__name">{note.title || note.id}</span>
                  </div>
                  <div class="bg-card__preview" style={{ fontSize: 'var(--font-size-xs)' }}>
                    {note.tags.map(t => `#${t}`).join(' ')}
                  </div>
                  <div class="bg-card__preview" style={{ fontSize: 'var(--font-size-xs)', opacity: 0.5 }}>
                    {note.modifiedAt ? new Date(note.modifiedAt).toLocaleDateString() : ''}
                  </div>
                </div>
              ))}
              {filteredNotes.length === 0 && (
                <div class="sidebar-panel__empty" style={{ padding: 'var(--space-sm)' }}>Keine Notes gefunden.</div>
              )}
            </div>
          )}
        </section>
      )}
```

Update the empty state check:
```typescript
      {!showMessages && !showBackground && !showRequests && !showNotes && (
        <div class="sidebar-panel__empty">No active background content.</div>
      )}
```

- [ ] **Step 2: Add sidebar notes CSS**

Append to `src/renderer/styles/components.css`:

```css
/* ─── Sidebar Notes ──────────────────────────────── */

.sidebar-notes__search {
  width: 100%;
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  padding: var(--space-xs) var(--space-sm);
  margin-bottom: var(--space-xs);
  outline: none;
}

.sidebar-notes__search:focus {
  border-color: var(--color-accent);
}

.sidebar-notes__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: var(--space-sm);
}

.sidebar-notes__tag {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--color-text-dim);
  background: var(--color-bg-sunken);
  padding: 1px 6px;
  cursor: pointer;
  user-select: none;
}

.sidebar-notes__tag:hover {
  color: var(--color-text-secondary);
}

.sidebar-notes__tag--active {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}
```

- [ ] **Step 3: Update SidebarPanel callers**

In `src/renderer/app.tsx`, pass the new props to SidebarPanel:

```typescript
  <SidebarPanel
    visible={sidebarVisible && sidebarHasContent}
    orchestratorActive={!!orchestratorSessionId}
    mpoActive={!!mpoSessionId}
    sessions={sessions}
    gridSessionIds={gridSessionIds}
    contextUsages={contextUsages}
    onAddToGrid={handleAddToGrid}
    onDetach={handleSidebarDetach}
    activeWorkspaceId={activeWorkspaceId}
    hasNotesCell={grid.slots.some(s => s.type === 'notes')}
  />
```

Update `sidebarHasContent` to include notes:
```typescript
  const sidebarHasContent = !!orchestratorSessionId || !!mpoSessionId ||
    sessions.some(s => s.status === 'active' && !gridSessionIds.includes(s.id)) ||
    grid.slots.some(s => s.type === 'notes')
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SidebarPanel.tsx src/renderer/styles/components.css src/renderer/app.tsx
git commit -m "feat(notes): sidebar Notes tab with search, tag filter, double-click open"
```

---

### Task 12: Workspace Apply — Notes Cell Type

**Files:**
- Modify: `src/main/workspace/workspace-manager.ts`
- Modify: `test/main/workspace-manager.test.ts` (if exists, else create)

- [ ] **Step 1: Update applyWorkspace to handle notes cells**

In `src/main/workspace/workspace-manager.ts`, update the loop in `applyWorkspace` (line 141-176):

After the `if (cell.persona === 'empty') continue` check, add:

```typescript
    // Skip notes cells — they don't spawn sessions, renderer handles them
    if (cell.type === 'notes') continue
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/main/workspace/workspace-manager.ts
git commit -m "feat(notes): workspace apply skips notes cells (no tmux needed)"
```

---

### Task 13: Integration Test + Smoke Test

**Files:**
- Run existing tests + manual verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (~450+ tests)

- [ ] **Step 2: Build the app**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 3: Manual smoke test**

Start the app with `npm start` and verify:
1. LauncherCell shows three buttons: projekt, session, notes
2. Click "notes" → NotesCell appears with empty state
3. Sidebar shows NOTES section with search and tag chips
4. Click "+" in tab bar → new note created, editor opens
5. Type markdown → syntax highlighting works, matches current theme
6. Cmd+S saves → tags appear after Ollama processes (if running)
7. Close notes cell → slot reverts to launcher
8. Switch theme → editor colors update

- [ ] **Step 4: Commit any fixes from smoke test**

```bash
git add -A
git commit -m "fix(notes): smoke test fixes"
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(notes): notes editor integration complete — CodeMirror 6, auto-tagging, sidebar"
```

---

### Spec Coverage Verification

| Spec Section | Task(s) |
|---|---|
| 1. Datenmodell & Storage | Task 2 (types), Task 3 (NoteManager) |
| 2. Auto-Tagging via Ollama | Task 4 (NoteTagging) |
| 3. Editor — CodeMirror 6 | Task 7 (NoteEditor), Task 8 (CSS) |
| 4. NotesCell — Grid-Zelle | Task 7 (NotesCell), Task 9 (grid integration) |
| 5. Sidebar — Notes-Tab | Task 11 (SidebarPanel) |
| 6. Workspace-Integration | Task 2 (WorkspaceCell type), Task 12 (applyWorkspace) |
| 7. IPC-Channels | Task 2 (channels), Task 5 (preload + IpcHub) |
| 8. Backend — NoteManager | Task 3 (CRUD), Task 4 (tagging), Task 5 (IPC) |
| 9. Nicht im Scope | N/A — verified nothing out-of-scope was added |
