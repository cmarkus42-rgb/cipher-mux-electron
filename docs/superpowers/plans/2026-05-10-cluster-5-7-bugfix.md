# Cluster 5+7 Bugfix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 bugs across Detachable Windows (Cluster 5) and Tag-Delete (Cluster 7).

**Architecture:** Targeted fixes in renderer components (NotesCell, DetachedNoteView, app.tsx, TagManager). No new files, no architectural changes. Each task is one isolated fix.

**Tech Stack:** Preact, TypeScript, Electron IPC, Lucide icons

---

### Task 1: Notes Cell Icons — Align with Session Cell

**Problem:** NotesCell uses `Maximize2/Minimize2` for both Focus Mode AND Height Toggle — same icon for two different actions. SessionCell uses `Scan` for Focus and `ChevronDown/ChevronUp` for Height.

**Files:**
- Modify: `src/renderer/components/NotesCell.tsx:11` (import), `:401` (Focus icon), `:409` (Height icon)

- [ ] **Step 1: Update Lucide imports**

In `src/renderer/components/NotesCell.tsx`, change the import:

```typescript
// OLD (line 11):
import { ExternalLink, Maximize2, Minimize2, X } from 'lucide-preact'

// NEW:
import { ExternalLink, Scan, Maximize2, Minimize2, ChevronDown, ChevronUp, X } from 'lucide-preact'
```

- [ ] **Step 2: Replace Focus Mode icons**

Change Focus Mode button (line 401) from `Maximize2/Minimize2` to `Scan`:

```tsx
// OLD:
>{isFocusMode ? <Minimize2 size={ICON_SIZE} /> : <Maximize2 size={ICON_SIZE} />}</button>

// NEW:
><Scan size={ICON_SIZE} /></button>
```

- [ ] **Step 3: Replace Height Toggle icons**

Change Height Toggle button (line 409) from `Maximize2/Minimize2` to `ChevronDown/ChevronUp`:

```tsx
// OLD:
>{isAtMax ? <Minimize2 size={ICON_SIZE} /> : <Maximize2 size={ICON_SIZE} />}</button>

// NEW:
>{isAtMax ? <ChevronUp size={ICON_SIZE} /> : <ChevronDown size={ICON_SIZE} />}</button>
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/NotesCell.tsx
git commit -m "fix(notes-cell): align Focus/Height icons with SessionCell (Scan, ChevronDown/Up)"
```

---

### Task 2: TestcaseView in Detached Notes Window

**Problem:** `DetachedNoteView.tsx` always renders `NoteEditor`, never checks for `kind:testcase` tag. Testcase notes show raw markdown instead of interactive TestcaseView.

**Files:**
- Modify: `src/renderer/components/DetachedNoteView.tsx`

- [ ] **Step 1: Add TestcaseView import and type**

At top of `DetachedNoteView.tsx`, add imports:

```typescript
// After existing imports:
import { TestcaseView } from './TestcaseView'
import type { ParsedTestcase, TestcaseSection } from '../../main/notes/testcase-parser'
```

- [ ] **Step 2: Add testcase state**

Inside the component function, after the existing `useState` calls (after line 18):

```typescript
const [testcase, setTestcase] = useState<ParsedTestcase | null>(null)
```

- [ ] **Step 3: Parse testcase on load**

In the existing `useEffect` that loads note content (the one starting at line 41), after setting tags (line 56), add testcase parsing:

```typescript
// After: setTags(result.info?.tags ?? [])
// Add testcase detection
if (result.info?.tags?.includes('kind:testcase')) {
  try {
    const parsed = await api.notes.parseTestcase(noteId)
    if (parsed) setTestcase(parsed)
  } catch (err) {
    console.error('[DetachedNoteView] Failed to parse testcase:', err)
  }
}
```

- [ ] **Step 4: Add testcase update handler**

After `handleTagsChange` (after line 80), add:

```typescript
const handleTestcaseUpdate = useCallback(async (sections: TestcaseSection[]) => {
  if (!testcase) return
  const api = (window as any).cipherMux
  const updated: ParsedTestcase = { ...testcase, sections }
  const body = await api.notes.serializeTestcaseBody(sections)
  if (!body) { console.error('[DetachedNoteView] serializeTestcaseBody returned null'); return }
  const result = await api.notes.save(noteId, body, undefined, true)
  if (result?.title) setTitle(result.title)
  setContent(body)
  setTestcase(updated)
}, [noteId, testcase])
```

- [ ] **Step 5: Render TestcaseView conditionally**

Replace the editor section (lines 142-150) with conditional rendering:

```tsx
{/* Editor or TestcaseView */}
<div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} class="notes-editor-area">
  {testcase ? (
    <TestcaseView
      key={noteId}
      testcase={testcase}
      onUpdate={handleTestcaseUpdate}
    />
  ) : (
    <NoteEditor
      key={noteId}
      content={content}
      onSave={handleSave}
      onAutoSave={handleAutoSave}
    />
  )}
</div>
```

- [ ] **Step 6: Hide TagBar for testcase notes**

Testcase notes manage their own tags. Change TagBar render (line 140):

```tsx
{/* Tag bar — hide for testcase notes (they have their own UI) */}
{!testcase && <TagBar tags={tags} onTagsChange={handleTagsChange} />}
```

- [ ] **Step 7: Build and verify**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/DetachedNoteView.tsx
git commit -m "fix(detached-note): render TestcaseView for kind:testcase notes"
```

---

### Task 3: Dock Button — Fix Notes Placement

**Problem:** When docking a note, `app.tsx:823` checks `sessionsRef` for the entity — but notes aren't sessions, so the alive check fails and no placement popup is shown. The detached window just closes silently.

**Root cause:** The dock handler treats all entities as sessions. It needs to also handle notes.

**Files:**
- Modify: `src/main/window-manager.ts:334-338` (send type with dockedEntityId)
- Modify: `src/renderer/app.tsx:815-831` (handle note type in dock flow)

- [ ] **Step 1: Send dockedType alongside dockedEntityId from WindowManager**

In `src/main/window-manager.ts`, the `closed` handler (line 329) sends `dockedEntityId` but not the type. We need the type so the renderer knows whether it's a session or note.

The type is available from `this.detachedWindows.get(entityId)` — but the window was already deleted on line 331. Read the type before deletion:

```typescript
// OLD (lines 329-340):
    win.on('closed', () => {
      const wasDock = this.dockInitiated.delete(entityId)
      this.detachedWindows.delete(entityId)
      // Notify main window so renderer can update detachedIds
      // (covers both X-button close and programmatic close via dock)
      this.sendToMainWindow(IPC.DETACH_STATE_CHANGED, {
        entries: this.getDetachedEntries(),
        // dockedEntityId tells renderer to show placement popup (dock-button).
        // X-close omits it — session just goes to background.
        ...(wasDock ? { dockedEntityId: entityId } : {}),
      })
    })

// NEW:
    win.on('closed', () => {
      const wasDock = this.dockInitiated.delete(entityId)
      const dockedType = this.detachedWindows.get(entityId)?.entry.type
      this.detachedWindows.delete(entityId)
      this.sendToMainWindow(IPC.DETACH_STATE_CHANGED, {
        entries: this.getDetachedEntries(),
        ...(wasDock ? { dockedEntityId: entityId, dockedType } : {}),
      })
    })
```

- [ ] **Step 2: Handle note dock in app.tsx**

In `src/renderer/app.tsx`, the `onStateChanged` handler (lines 815-831) needs to handle both session and note docking:

```typescript
// OLD (lines 815-831):
    const unsub = api.detach.onStateChanged((data: { entries: Array<{ type: string; entityId: string }>; dockedEntityId?: string }) => {
      // dockedEntityId is set when dock-button was used (not X-close).
      // Show placement popup so user can pick a grid slot.
      if (data.dockedEntityId) {
        const eid = data.dockedEntityId
        const inGrid = gridRef.current.slots.some(s => s.sessionId === eid)
        if (!inGrid) {
          // Verify session still exists before showing popup
          const alive = sessionsRef.current.some(s => s.id === eid)
          if (alive) {
            setPlacementPopup({ sessionId: eid })
          }
        }
      }
      // X-close: session just goes to background (no popup) — detachedIds sync is sufficient
      syncDetachedIds(data.entries)
    })

// NEW:
    const unsub = api.detach.onStateChanged((data: { entries: Array<{ type: string; entityId: string }>; dockedEntityId?: string; dockedType?: string }) => {
      if (data.dockedEntityId) {
        const eid = data.dockedEntityId
        if (data.dockedType === 'note') {
          // Note dock: show placement popup with note info
          setPlacementPopup({ note: { id: eid } })
        } else {
          // Session dock: existing logic
          const inGrid = gridRef.current.slots.some(s => s.sessionId === eid)
          if (!inGrid) {
            const alive = sessionsRef.current.some(s => s.id === eid)
            if (alive) {
              setPlacementPopup({ sessionId: eid })
            }
          }
        }
      }
      syncDetachedIds(data.entries)
    })
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/window-manager.ts src/renderer/app.tsx
git commit -m "fix(dock): handle note dock with placement popup (was session-only)"
```

---

### Task 4: STT Focus for Detached Notes — Verify and Fix

**Problem:** Bug report says STT isn't shown/usable in detached note windows. Investigation shows NoteEditor already handles `setNotesFocus` and `onNotesInsert` — STT text insertion should work. The missing piece is likely the **visual STT indicator** not being rendered in DetachedNoteView.

**Files:**
- Modify: `src/renderer/components/DetachedNoteView.tsx` (add STT status indicator)

- [ ] **Step 1: Investigate STT visual indicator**

Check what the main window shows when STT is recording into notes. Search for any visual indicator component:

```bash
grep -rn "stt\|recording\|voice-active\|listening" src/renderer/components/NoteEditor.tsx src/renderer/components/NotesCell.tsx | head -30
```

If a visual indicator exists only in NotesCell (not NoteEditor), we need to add it to DetachedNoteView.

- [ ] **Step 2: Add STT active indicator to DetachedNoteView**

After the titlebar in DetachedNoteView, add a minimal STT status line. Inside the component, add state tracking:

```typescript
const [sttActive, setSttActive] = useState(false)

// Listen for STT state changes
useEffect(() => {
  const api = (window as any).cipherMux
  if (!api?.voice?.onSttStateChanged) return
  const unsub = api.voice.onSttStateChanged((data: { recording: boolean }) => {
    setSttActive(data.recording)
  })
  return () => unsub()
}, [])
```

Then render a minimal indicator below the titlebar (before TagBar):

```tsx
{sttActive && (
  <div style={{
    padding: '2px 8px',
    fontSize: 10,
    color: 'var(--color-neon-red, #ef4444)',
    background: 'var(--color-bg-sunken, #111)',
    textAlign: 'center',
    flexShrink: 0,
  }}>
    STT recording...
  </div>
)}
```

- [ ] **Step 3: Verify `onSttStateChanged` exists in preload**

```bash
grep -n "onSttStateChanged\|STT_STATE" src/main/preload.ts src/shared/ipc-channels.ts
```

If it doesn't exist, we need to check what channel broadcasts STT state and wire it up. This step is investigative — skip the indicator if no IPC channel exists for this.

- [ ] **Step 4: Build and verify**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/DetachedNoteView.tsx
git commit -m "fix(detached-note): add STT recording indicator"
```

---

### Task 5: Tag-Delete Button — Replace window.confirm

**Problem:** Tag delete button in TagManager calls `window.confirm()`. In Electron secondary windows (WorkspacesWindow), `window.confirm()` may show the dialog behind the window or behave unexpectedly, making it appear like nothing happens on click.

**Approach:** Replace `window.confirm()` with inline confirmation UI (a "confirm/cancel" button pair), matching the pattern used by VoiceSettingsTab which already avoids `window.confirm()`.

**Files:**
- Modify: `src/renderer/components/TagManager.tsx:163-168` (handleDelete + button render)

- [ ] **Step 1: Add confirmation state**

In `TagManager.tsx`, after existing state declarations (around line 40), add:

```typescript
const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
```

- [ ] **Step 2: Replace handleDelete to use inline confirm**

Replace the handleDelete function (lines 163-168):

```typescript
// OLD:
  const handleDelete = async (tag: string) => {
    const confirmed = window.confirm(t('tags.deleteConfirm', { name: tag }))
    if (!confirmed) return
    await api.notes.tagDelete(tag)
    await loadData()
  }

// NEW:
  const handleDelete = async (tag: string) => {
    await api.notes.tagDelete(tag)
    setDeleteConfirm(null)
    await loadData()
  }
```

- [ ] **Step 3: Replace delete button with confirm/cancel UI**

Replace the delete button in `renderValueRow` (lines 345-351):

```tsx
// OLD:
            <button
              class="tag-manager__action tag-manager__action--danger"
              onClick={(e) => { e.stopPropagation(); handleDelete(row.fullTag) }}
              title={t('tags.delete', 'Delete')}
            >
              x
            </button>

// NEW:
            {deleteConfirm === row.fullTag ? (
              <>
                <button
                  class="tag-manager__action tag-manager__action--danger"
                  onClick={(e) => { e.stopPropagation(); handleDelete(row.fullTag) }}
                  title={t('tags.delete', 'Delete')}
                >
                  {t('tags.confirmYes', 'Yes')}
                </button>
                <button
                  class="tag-manager__action"
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}
                >
                  {t('tags.confirmNo', 'No')}
                </button>
              </>
            ) : (
              <button
                class="tag-manager__action tag-manager__action--danger"
                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row.fullTag) }}
                title={t('tags.delete', 'Delete')}
              >
                x
              </button>
            )}
```

- [ ] **Step 4: Also fix handleClassDelete (line 240-251)**

The class delete handler at line 240 also uses `window.confirm()`. Apply the same pattern:

Add state:
```typescript
const [classDeleteConfirm, setClassDeleteConfirm] = useState<string | null>(null)
```

Replace `handleClassDelete`:
```typescript
// OLD:
  const handleClassDelete = async (name: string) => {
    const confirmed = window.confirm(
      t('tags.classDeleteConfirm', { ... })
    )
    if (!confirmed) return
    await api.notes.tagClassDelete(name)
    await loadData()
  }

// NEW:
  const handleClassDelete = async (name: string) => {
    await api.notes.tagClassDelete(name)
    setClassDeleteConfirm(null)
    await loadData()
  }
```

And update the class delete button similarly (line 403-409).

- [ ] **Step 5: Build and verify**

Run: `cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/TagManager.tsx
git commit -m "fix(tag-manager): replace window.confirm with inline confirmation UI"
```

---

## Summary

| Task | Cluster | Fix |
|------|---------|-----|
| 1 | 5 (DW) | NotesCell icons: `Scan` for focus, `ChevronDown/Up` for height |
| 2 | 5 (DW) | TestcaseView rendering in DetachedNoteView |
| 3 | 5 (DW) | Dock button: send `dockedType`, handle note dock in renderer |
| 4 | 5 (DW) | STT visual indicator in DetachedNoteView |
| 5 | 7 (TAG) | Inline confirmation replacing `window.confirm()` |

Cluster 9 (STT Hallucination): Verified fixed — no code change needed.
