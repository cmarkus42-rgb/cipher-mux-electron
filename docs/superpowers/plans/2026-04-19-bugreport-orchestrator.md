# Bugreport-Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend cipher-mux so that submitted bugreports automatically trigger the Orchestrator to spawn a worker session that debugs and fixes the bug on a feature branch.

**Architecture:** BugreportManager gets MessageBus injection and sends a `bug` topic message on submit. A new MCP tool `mux_bugreport_resolve` handles the completion lifecycle (outbox → inbox, chatroom notification). The Orchestrator CLAUDE.md template gets a new section with bugreport-consumption rules that instruct the Claude session to read bugs, delegate to workers, and call the resolve tool.

**Tech Stack:** TypeScript, Node.js test runner, better-sqlite3 (MessageBus), MCP SDK (zod schemas)

---

### Task 1: BugreportManager — Add MessageBus injection and bug trigger

**Files:**
- Modify: `src/main/bugreport/bugreport-manager.ts`
- Modify: `src/main/ipc-hub.ts:54` (constructor call)

- [ ] **Step 1: Write the failing test**

Create `test/main/bugreport-manager.test.ts`:

```typescript
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BugreportManager } from '../../src/main/bugreport/bugreport-manager'

// Minimal MessageBus stub
class StubMessageBus {
  sent: Array<{ topic: string; sender: string; payload: Record<string, unknown> }> = []
  send(msg: { topic: string; sender: string; payload: Record<string, unknown> }) {
    this.sent.push(msg)
    return { id: 'msg-1', ...msg, createdAt: Date.now() }
  }
}

describe('BugreportManager', () => {
  let mgr: BugreportManager
  let bus: StubMessageBus
  let outboxDir: string

  beforeEach(() => {
    bus = new StubMessageBus()
    // Use a temp outbox to avoid touching real config
    outboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugreport-test-'))
    mgr = new BugreportManager({ messageBus: bus as any, outboxDir })
  })

  it('submit writes projectPath into frontmatter', async () => {
    const projectPath = '/test/project'
    const id = await mgr.submit('test bug', [], 'test-project', projectPath)

    const file = fs.readFileSync(path.join(outboxDir, `${id}.md`), 'utf-8')
    assert.ok(file.includes(`projectPath: ${projectPath}`))
  })

  it('submit sends bug message to MessageBus', async () => {
    const projectPath = '/test/project'
    await mgr.submit('test bug', [], 'test-project', projectPath)

    assert.equal(bus.sent.length, 1)
    assert.equal(bus.sent[0].topic, 'bug')
    assert.equal(bus.sent[0].sender, 'bugreport-manager')
    const payload = bus.sent[0].payload as { bugId: string; projectPath: string }
    assert.equal(payload.projectPath, projectPath)
    assert.ok(payload.bugId.startsWith('BUG-'))
  })

  it('submit works without messageBus (graceful)', async () => {
    const mgrNoBus = new BugreportManager({ outboxDir })
    const id = await mgrNoBus.submit('test bug', [])
    assert.ok(id.startsWith('BUG-'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern 'BugreportManager'`
Expected: FAIL — BugreportManager constructor doesn't accept options yet.

- [ ] **Step 3: Update BugreportManager to accept options**

Modify `src/main/bugreport/bugreport-manager.ts`:

Change the class to accept an options object with optional `messageBus` and `outboxDir`:

```typescript
import type { MessageBus } from '../message-bus/message-bus'

interface BugreportManagerOpts {
  messageBus?: MessageBus
  outboxDir?: string
}

export class BugreportManager {
  private messageBus: MessageBus | null
  private outboxDir: string

  constructor(opts?: BugreportManagerOpts) {
    this.messageBus = opts?.messageBus ?? null
    this.outboxDir = opts?.outboxDir ?? OUTBOX_DIR
  }
  // ...
}
```

- [ ] **Step 4: Update submit() to add projectPath and send bug message**

In `src/main/bugreport/bugreport-manager.ts`, update the `submit` method:

- Add `projectPath?: string` parameter (4th argument)
- Add `projectPath: ${projectPath ?? process.cwd()}` to the frontmatter block (after `project:` line)
- After `fs.writeFileSync`, add:

```typescript
    if (this.messageBus) {
      try {
        this.messageBus.send({
          topic: 'bug' as any,
          sender: 'bugreport-manager',
          payload: { bugId: id, projectPath: projectPath ?? process.cwd() },
        })
      } catch (err) {
        console.error('[BugreportManager] Failed to send bug message:', err)
      }
    }
```

- Update `ensureDirs()` calls to use `this.outboxDir` instead of the module-level `OUTBOX_DIR`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern 'BugreportManager'`
Expected: 3 tests PASS.

- [ ] **Step 6: Wire MessageBus into BugreportManager in IpcHub**

In `src/main/ipc-hub.ts`, change line 54 from:

```typescript
this.bugreportManager = new BugreportManager()
```

to:

```typescript
this.bugreportManager = new BugreportManager({
  messageBus: this.messageBus,
})
```

- [ ] **Step 7: Update IPC handler to pass projectPath**

In `src/main/ipc-hub.ts`, the `BUGREPORT_SUBMIT` handler at line 459 already gets `project` from the renderer. The `projectPath` is the cipher-mux-electron repo itself. Add it:

```typescript
ipcMain.handle(IPC.BUGREPORT_SUBMIT, async (_e, { description, project }: {
  description: string
  project?: string
}) => {
  // For self-reports, projectPath is the app's own repo
  const projectPath = app.getAppPath()
  const id = await this.bugreportManager.submit(
    description, this.sessionManager.list(), project, projectPath
  )
  return { id }
})
```

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing + 3 new).

- [ ] **Step 9: Commit**

```bash
git add src/main/bugreport/bugreport-manager.ts src/main/ipc-hub.ts test/main/bugreport-manager.test.ts
git commit -m "feat: BugreportManager sends bug message to MessageBus on submit"
```

---

### Task 2: MCP Tool — mux_bugreport_resolve

**Files:**
- Modify: `src/main/mcp/mcp-tools.ts`
- Create: `src/main/bugreport/bugreport-resolve.ts`
- Create: `test/main/bugreport-resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/main/bugreport-resolve.test.ts`:

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { resolveBugreport } from '../../src/main/bugreport/bugreport-resolve'

describe('resolveBugreport', () => {
  let baseDir: string
  let outboxDir: string
  let inboxDir: string

  const sampleReport = `---
id: BUG-2026-04-19-abc123
status: open
project: cipher-mux-electron
projectPath: /test/project
created: 2026-04-19T12:00:00.000Z
---

## Beschreibung

Terminal crashes on resize

## Diagnostik

- **App-Version:** 0.1.0
`

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'))
    outboxDir = path.join(baseDir, 'outbox')
    inboxDir = path.join(baseDir, 'inbox')
    fs.mkdirSync(outboxDir, { recursive: true })
    fs.mkdirSync(inboxDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true })
  })

  it('resolves a fixed bug: writes inbox, deletes outbox', async () => {
    fs.writeFileSync(path.join(outboxDir, 'BUG-2026-04-19-abc123.md'), sampleReport)

    const result = await resolveBugreport({
      bugId: 'BUG-2026-04-19-abc123',
      status: 'fixed',
      summary: 'Off-by-one in resize handler',
      branchName: 'fix/BUG-2026-04-19-abc123',
      filesChanged: ['src/main/tmux/tmux-manager.ts'],
    }, { outboxDir, inboxDir })

    assert.ok(result.ok)
    // Outbox deleted
    assert.ok(!fs.existsSync(path.join(outboxDir, 'BUG-2026-04-19-abc123.md')))
    // Inbox created
    const inbox = fs.readFileSync(path.join(inboxDir, 'BUG-2026-04-19-abc123.md'), 'utf-8')
    assert.ok(inbox.includes('status: fixed'))
    assert.ok(inbox.includes('Off-by-one in resize handler'))
    assert.ok(inbox.includes('fix/BUG-2026-04-19-abc123'))
    assert.ok(inbox.includes('src/main/tmux/tmux-manager.ts'))
    assert.ok(inbox.includes('resolved:'))
  })

  it('resolves a failed bug: writes inbox with failed status', async () => {
    fs.writeFileSync(path.join(outboxDir, 'BUG-2026-04-19-abc123.md'), sampleReport)

    const result = await resolveBugreport({
      bugId: 'BUG-2026-04-19-abc123',
      status: 'failed',
      summary: 'Could not reproduce the issue',
    }, { outboxDir, inboxDir })

    assert.ok(result.ok)
    const inbox = fs.readFileSync(path.join(inboxDir, 'BUG-2026-04-19-abc123.md'), 'utf-8')
    assert.ok(inbox.includes('status: failed'))
    assert.ok(inbox.includes('Could not reproduce'))
    assert.ok(!inbox.includes('branchName:'))
  })

  it('returns error when outbox file not found', async () => {
    const result = await resolveBugreport({
      bugId: 'BUG-nonexistent',
      status: 'fixed',
      summary: 'test',
    }, { outboxDir, inboxDir })

    assert.ok(!result.ok)
    assert.ok(result.error?.includes('not found'))
  })

  it('preserves original report content in inbox', async () => {
    fs.writeFileSync(path.join(outboxDir, 'BUG-2026-04-19-abc123.md'), sampleReport)

    await resolveBugreport({
      bugId: 'BUG-2026-04-19-abc123',
      status: 'fixed',
      summary: 'Fixed it',
      branchName: 'fix/BUG-2026-04-19-abc123',
    }, { outboxDir, inboxDir })

    const inbox = fs.readFileSync(path.join(inboxDir, 'BUG-2026-04-19-abc123.md'), 'utf-8')
    assert.ok(inbox.includes('Terminal crashes on resize'))
    assert.ok(inbox.includes('## Diagnostik'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern 'resolveBugreport'`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement bugreport-resolve.ts**

Create `src/main/bugreport/bugreport-resolve.ts`:

```typescript
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const BUGREPORT_BASE = path.join(os.homedir(), '.config', 'cipher-mux', 'bugreports')

export interface ResolveArgs {
  bugId: string
  status: 'fixed' | 'failed'
  summary: string
  branchName?: string
  filesChanged?: string[]
}

interface ResolveDirs {
  outboxDir?: string
  inboxDir?: string
}

export interface ResolveResult {
  ok: boolean
  inboxPath?: string
  error?: string
}

export async function resolveBugreport(
  args: ResolveArgs,
  dirs?: ResolveDirs
): Promise<ResolveResult> {
  const outboxDir = dirs?.outboxDir ?? path.join(BUGREPORT_BASE, 'outbox')
  const inboxDir = dirs?.inboxDir ?? path.join(BUGREPORT_BASE, 'inbox')

  const outboxFile = path.join(outboxDir, `${args.bugId}.md`)

  if (!fs.existsSync(outboxFile)) {
    return { ok: false, error: `Bugreport ${args.bugId} not found in outbox` }
  }

  const originalContent = fs.readFileSync(outboxFile, 'utf-8')

  // Extract body (everything after the closing ---)
  const frontmatterEnd = originalContent.indexOf('---', 4)
  const body = frontmatterEnd >= 0
    ? originalContent.slice(originalContent.indexOf('\n', frontmatterEnd) + 1)
    : originalContent

  // Build resolved frontmatter
  const now = new Date().toISOString()
  let frontmatter = `---
id: ${args.bugId}
status: ${args.status}
resolved: ${now}`

  if (args.branchName) {
    frontmatter += `\nbranchName: ${args.branchName}`
  }

  // Carry over project and projectPath from original
  const projectMatch = originalContent.match(/^project:\s*(.+)$/m)
  const projectPathMatch = originalContent.match(/^projectPath:\s*(.+)$/m)
  const createdMatch = originalContent.match(/^created:\s*(.+)$/m)

  if (projectMatch) frontmatter += `\nproject: ${projectMatch[1]}`
  if (projectPathMatch) frontmatter += `\nprojectPath: ${projectPathMatch[1]}`
  if (createdMatch) frontmatter += `\ncreated: ${createdMatch[1]}`

  frontmatter += '\n---'

  // Build result section
  let resultSection = `\n\n## Ergebnis\n\n**Status:** ${args.status}\n**Summary:** ${args.summary}`
  if (args.branchName) {
    resultSection += `\n**Branch:** ${args.branchName}`
  }
  if (args.filesChanged && args.filesChanged.length > 0) {
    resultSection += '\n**Geänderte Dateien:**'
    for (const f of args.filesChanged) {
      resultSection += `\n- ${f}`
    }
  }

  const inboxContent = frontmatter + body + resultSection + '\n'

  // Write inbox, delete outbox
  fs.mkdirSync(inboxDir, { recursive: true })
  const inboxPath = path.join(inboxDir, `${args.bugId}.md`)
  fs.writeFileSync(inboxPath, inboxContent, 'utf-8')
  fs.unlinkSync(outboxFile)

  return { ok: true, inboxPath }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern 'resolveBugreport'`
Expected: 4 tests PASS.

- [ ] **Step 5: Register mux_bugreport_resolve as MCP tool**

Add to `src/main/mcp/mcp-tools.ts`, after the `kickoff_complete` tool (after line 259):

```typescript
  // 9. mux_bugreport_resolve — Resolve a bugreport (outbox → inbox)
  ;(server.registerTool as any)(
    'mux_bugreport_resolve',
    {
      description:
        'Resolve a bugreport: move from outbox to inbox with result, '
        + 'send chatroom notification. Called by worker sessions after fixing or failing.',
      inputSchema: {
        bugId: z.string().describe('Bug ID (e.g. BUG-2026-04-19-abc123)'),
        status: z.enum(['fixed', 'failed']).describe('Resolution status'),
        summary: z.string().describe('What was done — analysis, fix description, or failure reason'),
        branchName: z.string().optional().describe('Git branch with the fix (only for status=fixed)'),
        filesChanged: z.array(z.string()).optional().describe('List of changed files'),
      },
    },
    async (args: {
      bugId: string
      status: 'fixed' | 'failed'
      summary: string
      branchName?: string
      filesChanged?: string[]
    }) => {
      const { resolveBugreport } = await import('../bugreport/bugreport-resolve.js')

      const result = await resolveBugreport(args)
      if (!result.ok) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          isError: true,
        }
      }

      // Send chatroom notification
      if (ctx.messageBus) {
        const statusText = args.status === 'fixed'
          ? `fixed auf Branch ${args.branchName ?? '(unknown)'}`
          : `failed nach Analyse`
        ctx.messageBus.send({
          topic: 'chat' as Topic,
          sender: 'bugreport-orchestrator',
          payload: { text: `${args.bugId}: ${statusText}. ${args.summary}` },
        })
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      }
    }
  )
```

Update the comment on line 29 from `Register all 7 MCP tools` to `Register all MCP tools`.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/bugreport/bugreport-resolve.ts src/main/mcp/mcp-tools.ts test/main/bugreport-resolve.test.ts
git commit -m "feat: add mux_bugreport_resolve MCP tool for outbox→inbox lifecycle"
```

---

### Task 3: Orchestrator Template — Add bugreport consumption section

**Files:**
- Modify: `src/main/session/orchestrator-template.ts`
- Modify: `test/main/orchestrator-template.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `test/main/orchestrator-template.test.ts`:

```typescript
  it('contains bugreport consumption section', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('## Bugreport-Verarbeitung'))
    assert.ok(md.includes('mux_bugreport_resolve'))
  })

  it('contains bugreport outbox path', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('.config/cipher-mux/bugreports/outbox'))
  })

  it('lists mux_bugreport_resolve in MCP tools section', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('mux_bugreport_resolve'))
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern 'generateOrchestratorClaudeMd'`
Expected: 3 new tests FAIL.

- [ ] **Step 3: Add bugreport section to orchestrator template**

In `src/main/session/orchestrator-template.ts`, add `mux_bugreport_resolve` to the MCP-Tools list and append the bugreport section before the closing backtick of the template string:

Add to the MCP-Tools section:
```
- **mux_bugreport_resolve** — Bugreport abschliessen (outbox → inbox + Chatroom-Notification)
```

Add new section at the end of the template:
```markdown

## Bugreport-Verarbeitung

Du überwachst eingehende Bugreports und bearbeitest sie **seriell** (einer nach dem anderen).

### Ablauf bei neuer Bug-Message (topic: 'bug')

1. **mux_read(topic: 'bug')** — Bug-ID und projectPath aus der Message lesen
2. **Prüfe** ob bereits ein Worker an einem Bug arbeitet → warte bis er fertig ist
3. **mux_create_session** mit:
   - name: "fix-{bugId}"
   - projectPath: projectPath aus der Bug-Message
   - command: "claude --dangerously-skip-permissions"
4. **mux_send** an den Worker (topic: 'system') mit dieser Instruktion:
   "Lies die Datei ~/.config/cipher-mux/bugreports/outbox/{bugId}.md.
    Erstelle einen Git-Branch fix/{bugId}.
    Analysiere und fixe den Bug. Nutze systematic-debugging und TDD.
    Wenn fertig: Rufe mux_bugreport_resolve auf mit status='fixed', summary, branchName, filesChanged.
    Wenn nach 2 Versuchen gescheitert: Rufe mux_bugreport_resolve auf mit status='failed' und summary."
5. **Warte** auf Worker-Abschluss via mux_read(topic: 'status')
6. **Nächsten Bug** aus der Queue verarbeiten

### Wichtig

- NIEMALS mehrere Bugs parallel bearbeiten — ein Repo, ein Fix gleichzeitig
- NIEMALS git push ausführen — der User merged und pusht selbst
- Outbox-Pfad: ~/.config/cipher-mux/bugreports/outbox/
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern 'generateOrchestratorClaudeMd'`
Expected: All 12 tests PASS (9 existing + 3 new).

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/session/orchestrator-template.ts test/main/orchestrator-template.test.ts
git commit -m "feat: orchestrator template with bugreport consumption rules"
```

---

### Task 4: Build verification and final integration

**Files:**
- No new files — verify everything compiles and passes.

- [ ] **Step 1: TypeScript build check**

Run: `npm run build`
Expected: Clean compilation, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: All tests pass (133 existing + ~10 new = ~143 total).

- [ ] **Step 3: Verify bugreport frontmatter in dev mode (manual)**

Start the app with `npm run dev`, open the BugreportDialog, submit a test bug. Check that:
- `~/.config/cipher-mux/bugreports/outbox/BUG-*.md` contains `projectPath:` in frontmatter
- The Chatroom shows a message on topic `bug` (if MessageBus is functional — may require production build due to ABI mismatch)

- [ ] **Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: Phase 7 bugreport-orchestrator integration complete"
```
