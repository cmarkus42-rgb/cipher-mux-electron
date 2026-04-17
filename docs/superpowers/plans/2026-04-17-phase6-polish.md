# Phase 6 — Polish & Split-Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring cipher-mux-electron to production-level UX with split-view terminals, keyboard shortcuts, session recovery, info page, and bugreport outbox.

**Architecture:** Shortcut registry as foundation → split-layout rendering on top → session recovery with layout-aware orphan handling → info/settings view consuming the registry → bugreport collection writing to outbox. All features use existing IPC channel patterns and ConfigStore persistence.

**Tech Stack:** Preact, xterm.js (WebGL/Canvas), TypeScript strict, Electron IPC (contextBridge), ConfigStore (JSON), tmux control mode.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/shortcut-registry.ts` | Central shortcut map, keydown handler, `getAll()` for info page |
| `src/renderer/hooks/useShortcuts.ts` | Registers shortcuts on mount, provides registry to components |
| `src/renderer/hooks/useLayout.ts` | Split-tree state, split/close/resize methods, debounced persistence |
| `src/renderer/components/SplitContainer.tsx` | Recursive layout renderer: SplitNode → flex + divider, PaneNode → TerminalPane |
| `src/renderer/components/RecoveryDialog.tsx` | Modal dialog for orphaned session handling |
| `src/renderer/components/InfoSettingsView.tsx` | Replaces SettingsView: shortcuts table + features + settings |
| `src/main/bugreport/bugreport-manager.ts` | Collects diagnostics, writes markdown to outbox |
| `src/renderer/components/BugreportDialog.tsx` | User-facing bugreport form |

### Modified Files
| File | Changes |
|------|---------|
| `src/renderer/app.tsx` | SplitContainer integration, shortcut registry mount, recovery dialog, bugreport dialog |
| `src/main/session/session-manager.ts` | Type-aware recovery (no auto-kill orphans), `killed[]` in result |
| `src/shared/types.ts` | `RecoveryResult.killed`, `BugreportSubmission` |
| `src/shared/ipc-channels.ts` | Recovery + bugreport submit channels |
| `src/main/ipc-hub.ts` | Recovery event forwarding, bugreport collect/submit handlers |
| `src/main/preload.ts` | Recovery + bugreport submit API |
| `src/renderer/components/ActivityRail.tsx` | Tooltip update |
| `src/renderer/styles/components.css` | Split divider, recovery dialog, bugreport dialog styles |

---

## Task 1: Shortcut Registry

**Files:**
- Create: `src/renderer/shortcut-registry.ts`
- Create: `src/renderer/hooks/useShortcuts.ts`
- Modify: `src/renderer/app.tsx:114-124`
- Test: `test/main/shortcut-registry.test.ts`

- [ ] **Step 1: Write shortcut-registry.ts**

```typescript
// src/renderer/shortcut-registry.ts

export interface ShortcutEntry {
  combo: string
  label: string
  category: 'Navigation' | 'Layout' | 'Aktionen'
  action: () => void
}

interface ParsedCombo {
  meta: boolean
  key: string
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split('+')
  return {
    meta: parts.includes('cmd') || parts.includes('meta'),
    key: parts[parts.length - 1],
  }
}

function matchEvent(e: KeyboardEvent, parsed: ParsedCombo): boolean {
  if (parsed.meta && !e.metaKey) return false
  return e.key.toLowerCase() === parsed.key || e.code.toLowerCase() === parsed.key
}

export class ShortcutRegistry {
  private shortcuts: Map<string, ShortcutEntry & { parsed: ParsedCombo }> = new Map()

  register(entry: ShortcutEntry): void {
    this.shortcuts.set(entry.combo, {
      ...entry,
      parsed: parseCombo(entry.combo),
    })
  }

  unregister(combo: string): void {
    this.shortcuts.delete(combo)
  }

  getAll(): ShortcutEntry[] {
    return Array.from(this.shortcuts.values()).map(({ parsed: _, ...entry }) => entry)
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    for (const entry of this.shortcuts.values()) {
      if (matchEvent(e, entry.parsed)) {
        e.preventDefault()
        e.stopPropagation()
        entry.action()
        return true
      }
    }
    return false
  }
}
```

- [ ] **Step 2: Write unit test for registry**

```typescript
// test/main/shortcut-registry.test.ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ShortcutRegistry } from '../../src/renderer/shortcut-registry'

describe('ShortcutRegistry', () => {
  let registry: ShortcutRegistry

  beforeEach(() => {
    registry = new ShortcutRegistry()
  })

  it('registers and retrieves shortcuts', () => {
    registry.register({ combo: 'Cmd+K', label: 'Toggle Chat', category: 'Navigation', action: () => {} })
    const all = registry.getAll()
    assert.equal(all.length, 1)
    assert.equal(all[0].combo, 'Cmd+K')
  })

  it('unregisters shortcuts', () => {
    registry.register({ combo: 'Cmd+K', label: 'Toggle Chat', category: 'Navigation', action: () => {} })
    registry.unregister('Cmd+K')
    assert.equal(registry.getAll().length, 0)
  })

  it('handles matching keydown event', () => {
    let called = false
    registry.register({ combo: 'Cmd+K', label: 'Toggle Chat', category: 'Navigation', action: () => { called = true } })
    const event = {
      metaKey: true,
      key: 'k',
      code: 'KeyK',
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as KeyboardEvent
    const handled = registry.handleKeyDown(event)
    assert.equal(handled, true)
    assert.equal(called, true)
  })

  it('ignores non-matching events', () => {
    let called = false
    registry.register({ combo: 'Cmd+K', label: 'Toggle Chat', category: 'Navigation', action: () => { called = true } })
    const event = {
      metaKey: false,
      key: 'k',
      code: 'KeyK',
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as KeyboardEvent
    const handled = registry.handleKeyDown(event)
    assert.equal(handled, false)
    assert.equal(called, false)
  })
})
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "ShortcutRegistry"`
Expected: 4 tests PASS

- [ ] **Step 4: Write useShortcuts hook**

```typescript
// src/renderer/hooks/useShortcuts.ts
import { useEffect, useMemo } from 'preact/hooks'
import { ShortcutRegistry } from '../shortcut-registry'
import type { ShortcutEntry } from '../shortcut-registry'

export function useShortcuts(entries: ShortcutEntry[]): ShortcutEntry[] {
  const registry = useMemo(() => new ShortcutRegistry(), [])

  useEffect(() => {
    for (const entry of entries) {
      registry.register(entry)
    }

    const handler = (e: KeyboardEvent) => registry.handleKeyDown(e)
    window.addEventListener('keydown', handler, true)

    return () => {
      window.removeEventListener('keydown', handler, true)
      for (const entry of entries) {
        registry.unregister(entry.combo)
      }
    }
  }, [entries, registry])

  return registry.getAll()
}
```

- [ ] **Step 5: Integrate into app.tsx — replace Cmd+N handler with registry**

In `src/renderer/app.tsx`, add imports:
```typescript
import { useShortcuts } from './hooks/useShortcuts'
```
and add `useMemo` to the preact/hooks import.

Remove the existing Cmd+N useEffect (lines 114-124):
```typescript
  // Cmd+N keyboard shortcut for kickoff dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'n') {
        e.preventDefault()
        setKickoffVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
```

Add after `handleAddSession` (before `const activeSession`):
```typescript
  const shortcutEntries = useMemo(() => [
    { combo: 'Cmd+0', label: 'Cockpit', category: 'Navigation' as const, action: () => handleViewChange('cockpit') },
    { combo: 'Cmd+K', label: 'Chatroom toggle', category: 'Navigation' as const, action: toggleChatroom },
    { combo: 'Cmd+N', label: 'Neues Projekt', category: 'Aktionen' as const, action: () => setKickoffVisible((v) => !v) },
  ], [handleViewChange, toggleChatroom])

  const registeredShortcuts = useShortcuts(shortcutEntries)
```

Note: Cmd+1-9, Cmd+\, Cmd+-, Cmd+W are added in Task 2 when the layout system exists.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shortcut-registry.ts src/renderer/hooks/useShortcuts.ts src/renderer/app.tsx test/main/shortcut-registry.test.ts
git commit -m "feat(shortcuts): add shortcut registry with Cmd+0, Cmd+K, Cmd+N"
```

---

## Task 2: Split-Layout System

**Files:**
- Create: `src/renderer/hooks/useLayout.ts`
- Create: `src/renderer/components/SplitContainer.tsx`
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/styles/components.css`

- [ ] **Step 1: Write useLayout hook**

```typescript
// src/renderer/hooks/useLayout.ts
import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import type { LayoutNode, SplitNode, PaneNode, SplitDirection, LayoutState } from '../../shared/types'
import { LAYOUT_SAVE_DEBOUNCE_MS } from '../../shared/constants'

const api = () => (window as any).cipherMux

export interface UseLayoutResult {
  layout: LayoutState
  splitPane: (paneSessionId: string, direction: SplitDirection, newSessionId: string) => void
  closePane: (paneSessionId: string) => void
  updateRatio: (path: number[], ratio: number) => void
  setActivePane: (sessionId: string) => void
  pruneInvalidPanes: (validSessionIds: Set<string>) => void
}

function findAndReplace(
  node: LayoutNode,
  sessionId: string,
  replacer: (pane: PaneNode) => LayoutNode,
): LayoutNode | null {
  if (node.type === 'pane') {
    return node.sessionId === sessionId ? replacer(node) : null
  }
  for (let i = 0; i < node.children.length; i++) {
    const result = findAndReplace(node.children[i], sessionId, replacer)
    if (result) {
      const newChildren = [...node.children]
      newChildren[i] = result
      return { ...node, children: newChildren as [LayoutNode, LayoutNode] }
    }
  }
  return null
}

function removePane(node: LayoutNode, sessionId: string): LayoutNode | null {
  if (node.type === 'pane') {
    return node.sessionId === sessionId ? null : node
  }
  const results = node.children.map((c) => removePane(c, sessionId))
  if (results[0] === null && results[1] !== null) return results[1]
  if (results[1] === null && results[0] !== null) return results[0]
  if (results[0] === null && results[1] === null) return null
  return { ...node, children: results as [LayoutNode, LayoutNode] }
}

function updateRatioAtPath(node: LayoutNode, path: number[], ratio: number): LayoutNode {
  if (path.length === 0 && node.type === 'split') {
    return { ...node, ratio }
  }
  if (node.type === 'split' && path.length > 0) {
    const [head, ...rest] = path
    const newChildren = [...node.children]
    newChildren[head] = updateRatioAtPath(node.children[head], rest, ratio)
    return { ...node, children: newChildren as [LayoutNode, LayoutNode] }
  }
  return node
}

function collectSessionIds(node: LayoutNode): string[] {
  if (node.type === 'pane') return [node.sessionId]
  return node.children.flatMap(collectSessionIds)
}

export function useLayout(): UseLayoutResult {
  const [layout, setLayout] = useState<LayoutState>({ root: null, activePaneId: null })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api().config.get('ui').then((ui: any) => {
      if (ui?.layout?.root) {
        setLayout(ui.layout)
      }
    })
  }, [])

  const persist = useCallback((next: LayoutState) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      api().config.saveLayout(next)
    }, LAYOUT_SAVE_DEBOUNCE_MS)
  }, [])

  const update = useCallback((updater: (prev: LayoutState) => LayoutState) => {
    setLayout((prev) => {
      const next = updater(prev)
      persist(next)
      return next
    })
  }, [persist])

  const splitPane = useCallback((paneSessionId: string, direction: SplitDirection, newSessionId: string) => {
    update((prev) => {
      if (!prev.root) {
        const root: SplitNode = {
          type: 'split',
          direction,
          ratio: 0.5,
          children: [
            { type: 'pane', sessionId: paneSessionId },
            { type: 'pane', sessionId: newSessionId },
          ],
        }
        return { root, activePaneId: newSessionId }
      }
      const newRoot = findAndReplace(prev.root, paneSessionId, (pane) => ({
        type: 'split',
        direction,
        ratio: 0.5,
        children: [pane, { type: 'pane', sessionId: newSessionId }],
      } as SplitNode))
      return { root: newRoot ?? prev.root, activePaneId: newSessionId }
    })
  }, [update])

  const closePane = useCallback((paneSessionId: string) => {
    update((prev) => {
      if (!prev.root) return prev
      const newRoot = removePane(prev.root, paneSessionId)
      let newActive = prev.activePaneId === paneSessionId ? null : prev.activePaneId
      if (!newActive && newRoot) {
        const ids = collectSessionIds(newRoot)
        newActive = ids[0] ?? null
      }
      return { root: newRoot, activePaneId: newActive }
    })
  }, [update])

  const updateRatioFn = useCallback((path: number[], ratio: number) => {
    const clamped = Math.max(0.15, Math.min(0.85, ratio))
    update((prev) => {
      if (!prev.root) return prev
      return { ...prev, root: updateRatioAtPath(prev.root, path, clamped) }
    })
  }, [update])

  const setActivePane = useCallback((sessionId: string) => {
    update((prev) => ({ ...prev, activePaneId: sessionId }))
  }, [update])

  const pruneInvalidPanes = useCallback((validSessionIds: Set<string>) => {
    update((prev) => {
      if (!prev.root) return prev
      let root = prev.root
      const currentIds = collectSessionIds(root)
      for (const id of currentIds) {
        if (!validSessionIds.has(id)) {
          const pruned = removePane(root, id)
          if (!pruned) return { root: null, activePaneId: null }
          root = pruned
        }
      }
      let newActive = prev.activePaneId
      if (newActive && !validSessionIds.has(newActive)) {
        const ids = collectSessionIds(root)
        newActive = ids[0] ?? null
      }
      return { root, activePaneId: newActive }
    })
  }, [update])

  return { layout, splitPane, closePane, updateRatio: updateRatioFn, setActivePane, pruneInvalidPanes }
}
```

- [ ] **Step 2: Write SplitContainer component**

```typescript
// src/renderer/components/SplitContainer.tsx
import { useCallback, useRef } from 'preact/hooks'
import type { LayoutNode, SessionInfo, ContextUsage } from '../../shared/types'
import { TerminalPane } from './TerminalPane'

interface SplitContainerProps {
  node: LayoutNode
  path: number[]
  sessions: SessionInfo[]
  contextUsages: Record<string, ContextUsage>
  activePaneId: string | null
  onUpdateRatio: (path: number[], ratio: number) => void
  onPaneClick: (sessionId: string) => void
}

export function SplitContainer({
  node,
  path,
  sessions,
  contextUsages,
  activePaneId,
  onUpdateRatio,
  onPaneClick,
}: SplitContainerProps) {
  if (node.type === 'pane') {
    const session = sessions.find((s) => s.id === node.sessionId)
    const isActive = activePaneId === node.sessionId
    return (
      <div
        class={`split-pane ${isActive ? 'split-pane--active' : ''}`}
        style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}
        onClick={() => onPaneClick(node.sessionId)}
      >
        <TerminalPane
          sessionId={node.sessionId}
          sessionName={session?.name}
          contextUsage={contextUsages[node.sessionId]?.usedPercentage}
        />
      </div>
    )
  }

  const { direction, ratio, children } = node
  const isVertical = direction === 'vertical'
  const containerRef = useRef<HTMLDivElement>(null!)
  const dragging = useRef(false)

  const handleMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      let newRatio: number
      if (isVertical) {
        newRatio = (ev.clientX - rect.left) / rect.width
      } else {
        newRatio = (ev.clientY - rect.top) / rect.height
      }
      onUpdateRatio(path, newRatio)
    }

    const onMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [isVertical, path, onUpdateRatio])

  const pctA = `${(ratio * 100).toFixed(2)}%`

  return (
    <div
      ref={containerRef}
      class="split-container"
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ flexBasis: pctA, flexGrow: 0, flexShrink: 0, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        <SplitContainer
          node={children[0]}
          path={[...path, 0]}
          sessions={sessions}
          contextUsages={contextUsages}
          activePaneId={activePaneId}
          onUpdateRatio={onUpdateRatio}
          onPaneClick={onPaneClick}
        />
      </div>
      <div
        class={`split-divider split-divider--${isVertical ? 'vertical' : 'horizontal'}`}
        onMouseDown={handleMouseDown}
      />
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        <SplitContainer
          node={children[1]}
          path={[...path, 1]}
          sessions={sessions}
          contextUsages={contextUsages}
          activePaneId={activePaneId}
          onUpdateRatio={onUpdateRatio}
          onPaneClick={onPaneClick}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add split divider CSS to components.css**

Append to `src/renderer/styles/components.css`:

```css
/* ================================================================
   Split Layout
   ================================================================ */

.split-container {
  position: relative;
}

.split-pane {
  position: relative;
  display: flex;
  flex-direction: column;
}

.split-pane--active {
  outline: 1px solid var(--color-neon-green);
  outline-offset: -1px;
}

.split-divider {
  flex-shrink: 0;
  background: var(--color-border);
  transition: background var(--transition-base);
  z-index: 10;
}

.split-divider:hover,
.split-divider:active {
  background: var(--color-neon-green);
}

.split-divider--vertical {
  width: 4px;
  cursor: col-resize;
}

.split-divider--horizontal {
  height: 4px;
  cursor: row-resize;
}
```

- [ ] **Step 4: Integrate SplitContainer into app.tsx**

Add imports at top of `src/renderer/app.tsx`:
```typescript
import { useLayout } from './hooks/useLayout'
import { SplitContainer } from './components/SplitContainer'
```

Add `useLayout` hook call after existing hooks (after line 26):
```typescript
  const { layout, splitPane, closePane, updateRatio, setActivePane } = useLayout()
```

Add split handler and close handler after `handleAddSession`:
```typescript
  const handleSplit = useCallback(async (direction: 'vertical' | 'horizontal') => {
    const currentId = layout.activePaneId ?? activeSessionId
    if (!currentId) return
    const cipherMuxApi = (window as any).cipherMux
    const dir = await cipherMuxApi.dialog.openDir({ title: 'Session-Verzeichnis für neue Pane' })
    if (!dir) return
    const name = dir.split('/').pop() || 'shell'
    const session = await startSession({ name, projectPath: dir })
    splitPane(currentId, direction, session.id)
    setActiveView('terminal')
  }, [layout.activePaneId, activeSessionId, startSession, splitPane])

  const handleClosePane = useCallback(() => {
    const currentId = layout.activePaneId ?? activeSessionId
    if (!currentId) return
    closePane(currentId)
  }, [layout.activePaneId, activeSessionId, closePane])
```

Update `shortcutEntries` to include all shortcuts:
```typescript
  const shortcutEntries = useMemo(() => [
    { combo: 'Cmd+0', label: 'Cockpit', category: 'Navigation' as const, action: () => handleViewChange('cockpit') },
    { combo: 'Cmd+\\', label: 'Vertikaler Split', category: 'Layout' as const, action: () => handleSplit('vertical') },
    { combo: 'Cmd+-', label: 'Horizontaler Split', category: 'Layout' as const, action: () => handleSplit('horizontal') },
    { combo: 'Cmd+W', label: 'Pane schließen', category: 'Layout' as const, action: handleClosePane },
    { combo: 'Cmd+K', label: 'Chatroom toggle', category: 'Navigation' as const, action: toggleChatroom },
    { combo: 'Cmd+N', label: 'Neues Projekt', category: 'Aktionen' as const, action: () => setKickoffVisible((v) => !v) },
    ...sessions.filter(s => s.status === 'active').slice(0, 9).map((s, i) => ({
      combo: `Cmd+${i + 1}`,
      label: `Session ${i + 1}: ${s.name}`,
      category: 'Navigation' as const,
      action: () => handleSessionSelect(s.id),
    })),
  ], [handleViewChange, handleSplit, handleClosePane, toggleChatroom, sessions, handleSessionSelect])
```

Update `handleSessionSelect` to also update layout pane:
```typescript
  const handleSessionSelect = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
    setActiveView('terminal')
    if (layout.root) {
      setActivePane(sessionId)
    }
  }, [layout.root, setActivePane])
```

Replace the terminal rendering section (lines 203-215) in the JSX:
```tsx
            {activeView === 'terminal' && layout.root && (
              <SplitContainer
                node={layout.root}
                path={[]}
                sessions={sessions}
                contextUsages={contextUsages}
                activePaneId={layout.activePaneId}
                onUpdateRatio={updateRatio}
                onPaneClick={(sessionId) => {
                  setActivePane(sessionId)
                  setActiveSessionId(sessionId)
                }}
              />
            )}
            {activeView === 'terminal' && !layout.root && activeSession && (
              <TerminalPane
                sessionId={activeSession.id}
                sessionName={activeSession.name}
                contextUsage={contextUsages[activeSession.id]?.usedPercentage}
              />
            )}
            {activeView === 'terminal' && !layout.root && !activeSession && (
              <div class="empty-state">
                <div class="empty-state__title">Terminal</div>
                <div class="empty-state__text">No active session. Start a session from the Cockpit.</div>
              </div>
            )}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Clean compile, no errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hooks/useLayout.ts src/renderer/components/SplitContainer.tsx src/renderer/app.tsx src/renderer/styles/components.css
git commit -m "feat(layout): split-view terminal system with keyboard shortcuts"
```

---

## Task 3: Session Recovery

**Files:**
- Modify: `src/main/session/session-manager.ts:140-191`
- Modify: `src/shared/types.ts:31-34`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc-hub.ts:74-77`
- Modify: `src/main/preload.ts`
- Create: `src/renderer/components/RecoveryDialog.tsx`
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/styles/components.css`

- [ ] **Step 1: Update RecoveryResult type to include killed[]**

In `src/shared/types.ts`, change:
```typescript
export interface RecoveryResult {
  recovered: SessionInfo[]
  orphaned: SessionInfo[]
}
```
to:
```typescript
export interface RecoveryResult {
  recovered: SessionInfo[]
  orphaned: SessionInfo[]
  killed: SessionInfo[]
}
```

- [ ] **Step 2: Add IPC channels for recovery**

In `src/shared/ipc-channels.ts`, add after `SESSIONS_RECOVER`:
```typescript
  SESSIONS_RECOVERY_RESULT: 'cipher-mux:sessions:recovery-result',
  SESSIONS_RECOVERY_ACTION: 'cipher-mux:sessions:recovery-action',
```

- [ ] **Step 3: Update SessionManager.recover() — no auto-kill, type-aware**

Replace the `recover()` method in `src/main/session/session-manager.ts` (lines 140-191) with:

```typescript
  async recover(): Promise<RecoveryResult> {
    const tmuxSessions = await this.tmux.listSessions()
    const recovered: SessionInfo[] = []
    const orphaned: SessionInfo[] = []
    const killed: SessionInfo[] = []

    for (const tmuxSession of tmuxSessions) {
      if (!tmuxSession.name.startsWith('cmux-')) continue

      let found = false
      for (const session of this.sessions.values()) {
        if (session.tmuxSession === tmuxSession.name) {
          session.status = 'active'
          session.updatedAt = Date.now()
          recovered.push(session)
          found = true
          break
        }
      }

      if (!found) {
        const info: SessionInfo = {
          id: ulid(),
          name: tmuxSession.name,
          projectPath: null,
          tmuxSession: tmuxSession.name,
          tmuxPane: null,
          status: 'orphaned',
          createdAt: tmuxSession.created * 1000,
          updatedAt: Date.now(),
        }

        // Launcher sessions are fire-and-forget — kill automatically
        if (tmuxSession.name.includes('launcher') || tmuxSession.name.includes('kickoff')) {
          console.log(`[SessionManager] killing launcher session: ${tmuxSession.name}`)
          try { await this.tmux.killSession(tmuxSession.name) } catch { /* may be gone */ }
          info.status = 'stopped'
          killed.push(info)
        } else {
          orphaned.push(info)
        }
      }
    }

    // Restore orchestrator link if a recovered session is named "Orchestrator"
    for (const session of recovered) {
      if (session.name === 'Orchestrator') {
        this.orchestratorSessionId = session.id
        break
      }
    }

    return { recovered, orphaned, killed }
  }

  /**
   * Adopt an orphaned tmux session into the registry.
   */
  async adoptOrphan(tmuxSessionName: string, displayName?: string): Promise<SessionInfo> {
    const id = ulid()
    const now = Date.now()
    const session: SessionInfo = {
      id,
      name: displayName ?? tmuxSessionName,
      projectPath: null,
      tmuxSession: tmuxSessionName,
      tmuxPane: tmuxSessionName,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    this.sessions.set(id, session)
    this.tmux.watchSession(tmuxSessionName, id)
    this.emit('session-changed', session)
    return session
  }

  /**
   * Kill an orphaned tmux session (not in registry).
   */
  async killOrphan(tmuxSessionName: string): Promise<void> {
    try { await this.tmux.killSession(tmuxSessionName) } catch { /* may be gone */ }
  }
```

- [ ] **Step 4: Update IPC hub for recovery result forwarding and orphan actions**

In `src/main/ipc-hub.ts`, update the recovery call in `init()` (lines 74-77):
```typescript
    this.sessionManager.recover().then((result) => {
      if (result.orphaned.length > 0) {
        this.windowManager.sendToMainWindow(IPC.SESSIONS_RECOVERY_RESULT, result)
      }
    }).catch((err) => {
      console.error('[IpcHub] session recovery failed:', err)
    })
```

Add orphan action handler in `registerSessionChannels()` (after the SESSIONS_RECOVER handler):
```typescript
    ipcMain.handle(IPC.SESSIONS_RECOVERY_ACTION, async (_e, { action, tmuxSession, displayName }: {
      action: 'adopt' | 'kill'
      tmuxSession: string
      displayName?: string
    }) => {
      if (action === 'adopt') {
        return this.sessionManager.adoptOrphan(tmuxSession, displayName)
      } else {
        await this.sessionManager.killOrphan(tmuxSession)
        return { ok: true }
      }
    })
```

- [ ] **Step 5: Update preload.ts**

In `src/main/preload.ts`, add to the `sessions` section (after `onStopped`):
```typescript
    onRecoveryResult: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.SESSIONS_RECOVERY_RESULT, handler)
      return () => ipcRenderer.removeListener(IPC.SESSIONS_RECOVERY_RESULT, handler)
    },
    recoveryAction: (action: string, tmuxSession: string, displayName?: string) =>
      ipcRenderer.invoke(IPC.SESSIONS_RECOVERY_ACTION, { action, tmuxSession, displayName }),
```

- [ ] **Step 6: Create RecoveryDialog component**

```typescript
// src/renderer/components/RecoveryDialog.tsx
import { useState, useEffect, useCallback } from 'preact/hooks'
import type { RecoveryResult, SessionInfo } from '../../shared/types'

const api = () => (window as any).cipherMux

interface RecoveryDialogProps {
  onDone: () => void
}

export function RecoveryDialog({ onDone }: RecoveryDialogProps) {
  const [orphans, setOrphans] = useState<SessionInfo[]>([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsub = api().sessions.onRecoveryResult((result: RecoveryResult) => {
      if (result.orphaned.length > 0) {
        setOrphans(result.orphaned)
        setVisible(true)
      }
    })
    return () => unsub()
  }, [])

  const handleAdopt = useCallback(async (orphan: SessionInfo) => {
    await api().sessions.recoveryAction('adopt', orphan.tmuxSession, orphan.name)
    setOrphans((prev) => prev.filter((o) => o.id !== orphan.id))
  }, [])

  const handleKill = useCallback(async (orphan: SessionInfo) => {
    await api().sessions.recoveryAction('kill', orphan.tmuxSession)
    setOrphans((prev) => prev.filter((o) => o.id !== orphan.id))
  }, [])

  const handleKillAll = useCallback(async () => {
    for (const orphan of orphans) {
      await api().sessions.recoveryAction('kill', orphan.tmuxSession)
    }
    setOrphans([])
  }, [orphans])

  useEffect(() => {
    if (visible && orphans.length === 0) {
      setVisible(false)
      onDone()
    }
  }, [visible, orphans.length, onDone])

  if (!visible) return null

  return (
    <div class="dialog-overlay">
      <div class="dialog recovery-dialog">
        <h3 class="dialog__title">Session-Recovery</h3>
        <p class="dialog__text">
          {orphans.length} verwaiste Session{orphans.length > 1 ? 's' : ''} gefunden:
        </p>
        <ul class="recovery-list">
          {orphans.map((o) => (
            <li key={o.id} class="recovery-list__item">
              <span class="font-mono text-sm">{o.tmuxSession}</span>
              <span class="text-xs text-dim">
                {new Date(o.createdAt).toLocaleString('de-DE')}
              </span>
              <div class="recovery-list__actions">
                <button class="btn btn--sm btn--primary" onClick={() => handleAdopt(o)}>
                  Übernehmen
                </button>
                <button class="btn btn--sm" onClick={() => handleKill(o)}>
                  Beenden
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div class="dialog__footer">
          <button class="btn btn--sm" onClick={handleKillAll}>
            Alle beenden
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Add RecoveryDialog to app.tsx and CSS**

Add import in `src/renderer/app.tsx`:
```typescript
import { RecoveryDialog } from './components/RecoveryDialog'
```

Add before closing `</div>` of app-shell (after KickoffDialog):
```typescript
      <RecoveryDialog onDone={() => {}} />
```

Append to `src/renderer/styles/components.css`:
```css
/* ================================================================
   Recovery Dialog
   ================================================================ */

.recovery-dialog {
  max-width: 520px;
}

.recovery-list {
  list-style: none;
  padding: 0;
  margin: var(--space-sm) 0;
  max-height: 300px;
  overflow-y: auto;
}

.recovery-list__item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--color-border);
}

.recovery-list__item:last-child {
  border-bottom: none;
}

.recovery-list__actions {
  margin-left: auto;
  display: flex;
  gap: var(--space-xs);
  flex-shrink: 0;
}
```

- [ ] **Step 8: Build and verify**

Run: `npm run build`
Expected: Clean compile

- [ ] **Step 9: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts src/main/session/session-manager.ts src/main/ipc-hub.ts src/main/preload.ts src/renderer/components/RecoveryDialog.tsx src/renderer/app.tsx src/renderer/styles/components.css
git commit -m "feat(recovery): type-aware session recovery with orphan dialog"
```

---

## Task 4: Info & Settings View

**Files:**
- Create: `src/renderer/components/InfoSettingsView.tsx`
- Remove: `src/renderer/components/SettingsView.tsx`
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/components/ActivityRail.tsx:112`
- Modify: `src/renderer/styles/components.css`

- [ ] **Step 1: Create InfoSettingsView component**

```typescript
// src/renderer/components/InfoSettingsView.tsx
import { useCallback, useEffect, useState } from 'preact/hooks'
import type { ShortcutEntry } from '../shortcut-registry'

interface InfoSettingsViewProps {
  shortcuts: ShortcutEntry[]
  onRescan: () => void | Promise<void>
  scanning: boolean
}

const api = (window as any).cipherMux

interface AppSection {
  scanPaths: string[]
  scanDepth: number
}

type TabId = 'shortcuts' | 'features' | 'settings'

export function InfoSettingsView({ shortcuts, onRescan, scanning }: InfoSettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('shortcuts')
  const [scanPaths, setScanPaths] = useState<string[]>([])
  const [scanDepth, setScanDepth] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const app: AppSection | null = await api.config.get('app')
    setScanPaths(app?.scanPaths ?? [])
    setScanDepth(app?.scanDepth ?? 1)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const persist = useCallback(async (next: Partial<AppSection>) => {
    const current: AppSection | null = await api.config.get('app')
    await api.config.set('app', { ...current, ...next })
  }, [])

  const handleAdd = useCallback(async () => {
    const dir = await api.dialog.openDir({ title: 'Scan-Pfad hinzufügen' })
    if (!dir) return
    if (scanPaths.includes(dir)) return
    const next = [...scanPaths, dir]
    setScanPaths(next)
    await persist({ scanPaths: next })
    await onRescan()
  }, [scanPaths, persist, onRescan])

  const handleRemove = useCallback(async (p: string) => {
    const next = scanPaths.filter((x) => x !== p)
    setScanPaths(next)
    await persist({ scanPaths: next })
    await onRescan()
  }, [scanPaths, persist, onRescan])

  const handleDepthChange = useCallback(async (value: number) => {
    const clamped = Math.max(1, Math.min(5, Math.floor(value)))
    setScanDepth(clamped)
    await persist({ scanDepth: clamped })
  }, [persist])

  const grouped = shortcuts.reduce<Record<string, ShortcutEntry[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s)
    return acc
  }, {})

  return (
    <div class="settings-view">
      <div class="info-tabs">
        {(['shortcuts', 'features', 'settings'] as TabId[]).map((tab) => (
          <button
            key={tab}
            class={`info-tab ${activeTab === tab ? 'info-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'shortcuts' ? 'Shortcuts' : tab === 'features' ? 'Features' : 'Einstellungen'}
          </button>
        ))}
      </div>

      {activeTab === 'shortcuts' && (
        <section class="settings-section">
          {Object.entries(grouped).map(([category, entries]) => (
            <div key={category}>
              <div class="settings-section__title">{category}</div>
              <table class="shortcut-table">
                <tbody>
                  {entries.map((s) => (
                    <tr key={s.combo}>
                      <td class="shortcut-table__combo"><kbd>{s.combo}</kbd></td>
                      <td class="shortcut-table__label">{s.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'features' && (
        <section class="settings-section">
          <div class="settings-section__title">Terminals & Splits</div>
          <div class="settings-section__hint">
            Eingebettete Terminals über tmux-Sessions. Cmd+\ und Cmd+- für vertikale/horizontale Splits, Cmd+W zum Schließen.
          </div>

          <div class="settings-section__title">Message Bus & Chatroom</div>
          <div class="settings-section__hint">
            SQLite-basierter Nachrichtenkanal zwischen Sessions. Chatroom (Cmd+K) zeigt den Bus-Feed.
          </div>

          <div class="settings-section__title">MCP-Server</div>
          <div class="settings-section__hint">
            Lokaler HTTP-Server für Machine-to-Machine-Kommunikation. Wird automatisch in jede Session injiziert.
          </div>

          <div class="settings-section__title">Orchestrator</div>
          <div class="settings-section__hint">
            Zentrale Claude-Session, die andere Sessions via MCP steuert und koordiniert.
          </div>

          <div class="settings-section__title">Kickoff / Projektstart</div>
          <div class="settings-section__hint">
            Neues Projekt aus Obsidian-Notizen scaffolden (Cmd+N). Nutzt den projectlauncher-Skill.
          </div>
        </section>
      )}

      {activeTab === 'settings' && !loading && (
        <section class="settings-section">
          <div class="settings-section__title">Scan-Pfade</div>
          <div class="settings-section__hint">
            Verzeichnisse, die beim Scan nach Claude-Code-Projekten durchsucht werden.
          </div>
          <ul class="settings-list">
            {scanPaths.length === 0 && (
              <li class="settings-list__empty">Keine Pfade hinterlegt.</li>
            )}
            {scanPaths.map((p) => (
              <li key={p} class="settings-list__item">
                <span class="font-mono text-sm truncate" title={p}>{p}</span>
                <button class="btn btn--sm" onClick={() => handleRemove(p)} title="Entfernen">✕</button>
              </li>
            ))}
          </ul>
          <div class="settings-row">
            <button class="btn btn--primary btn--sm" onClick={handleAdd}>+ Pfad hinzufügen</button>
            <button class="btn btn--sm" onClick={onRescan} disabled={scanning}>
              {scanning ? 'Scanne…' : 'Jetzt rescannen'}
            </button>
          </div>
          <div class="settings-row" style={{ marginTop: '12px' }}>
            <label class="settings-label">
              <span>Scan-Tiefe</span>
              <input
                class="input input--sm"
                type="number"
                min={1}
                max={5}
                value={scanDepth}
                onInput={(e) => handleDepthChange(Number((e.target as HTMLInputElement).value))}
                style={{ width: '64px' }}
              />
            </label>
            <span class="text-xs text-dim">1 = nur direkte Kinder · max. 5</span>
          </div>

          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>Über</div>
          <div class="settings-section__hint">
            cipher-mux v0.2.0 — Electron-basierte Kommandozentrale für Claude Code Projekte.
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add info-tab and shortcut-table CSS**

Append to `src/renderer/styles/components.css`:

```css
/* ================================================================
   Info Tabs
   ================================================================ */

.info-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-md);
}

.info-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary);
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  transition: color var(--transition-base), border-color var(--transition-base);
}

.info-tab:hover {
  color: var(--color-text-primary);
}

.info-tab--active {
  color: var(--color-neon-green);
  border-bottom-color: var(--color-neon-green);
}

.shortcut-table {
  width: 100%;
  border-collapse: collapse;
  margin: var(--space-xs) 0 var(--space-md);
}

.shortcut-table td {
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--color-border);
}

.shortcut-table__combo {
  width: 120px;
  white-space: nowrap;
}

.shortcut-table__combo kbd {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.shortcut-table__label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 3: Update app.tsx to use InfoSettingsView**

In `src/renderer/app.tsx`, replace import:
```typescript
import { SettingsView } from './components/SettingsView'
```
with:
```typescript
import { InfoSettingsView } from './components/InfoSettingsView'
```

Replace the info view render (line 216):
```typescript
            {activeView === 'info' && (
              <InfoSettingsView
                shortcuts={registeredShortcuts}
                onRescan={rescan}
                scanning={scanning}
              />
            )}
```

- [ ] **Step 4: Update ActivityRail tooltip**

In `src/renderer/components/ActivityRail.tsx`, change line 113:
```typescript
        label="Info & Einstellungen"
```

- [ ] **Step 5: Delete old SettingsView.tsx and build**

```bash
rm src/renderer/components/SettingsView.tsx
npm run build
```
Expected: Clean compile

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/InfoSettingsView.tsx src/renderer/app.tsx src/renderer/components/ActivityRail.tsx src/renderer/styles/components.css
git rm src/renderer/components/SettingsView.tsx
git commit -m "feat(info): replace SettingsView with InfoSettingsView (shortcuts, features, settings tabs)"
```

---

## Task 5: Bugreport (Outbox)

**Files:**
- Create: `src/main/bugreport/bugreport-manager.ts`
- Create: `src/renderer/components/BugreportDialog.tsx`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc-hub.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/app.tsx`
- Modify: `src/renderer/styles/components.css`

- [ ] **Step 1: Add BugreportSubmission type and update IPC channels**

In `src/shared/types.ts`, add after `BugreportData`:
```typescript
export interface BugreportSubmission {
  description: string
  project?: string
}
```

In `src/shared/ipc-channels.ts`, replace:
```typescript
  BUGREPORT_EXPORT: 'cipher-mux:bugreport:export',
```
with:
```typescript
  BUGREPORT_SUBMIT: 'cipher-mux:bugreport:submit',
```

- [ ] **Step 2: Create BugreportManager**

```typescript
// src/main/bugreport/bugreport-manager.ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import { ulid } from 'ulidx'
import type { BugreportData, SessionInfo } from '../../shared/types'
import { APP_VERSION } from '../../shared/constants'
import { runCommand } from '../util/exec-util'

const BUGREPORT_BASE = path.join(os.homedir(), '.config', 'cipher-mux', 'bugreports')
const OUTBOX_DIR = path.join(BUGREPORT_BASE, 'outbox')
const INBOX_DIR = path.join(BUGREPORT_BASE, 'inbox')
const ARCHIV_DIR = path.join(BUGREPORT_BASE, 'archiv')

function ensureDirs(): void {
  for (const dir of [OUTBOX_DIR, INBOX_DIR, ARCHIV_DIR]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

async function getTmuxVersion(): Promise<string | null> {
  try {
    return await runCommand('tmux', ['-V'], { timeout: 5000 })
  } catch {
    return null
  }
}

function getRecentLogs(maxLines = 100): string[] {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(logDir)) return []
    const files = fs.readdirSync(logDir)
      .filter((f) => f.endsWith('.log'))
      .sort()
      .reverse()
    if (files.length === 0) return []
    const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
    return content.split('\n').slice(-maxLines)
  } catch {
    return []
  }
}

export class BugreportManager {
  async collectDiagnostics(sessions: SessionInfo[]): Promise<BugreportData> {
    const tmuxVersion = await getTmuxVersion()
    return {
      appVersion: APP_VERSION,
      osVersion: `${os.type()} ${os.release()}`,
      electronVersion: process.versions.electron ?? 'unknown',
      nodeVersion: process.version,
      sessions,
      tmuxVersion,
      config: {},
      logs: getRecentLogs(),
      timestamp: Date.now(),
    }
  }

  async submit(description: string, sessions: SessionInfo[], project?: string): Promise<string> {
    ensureDirs()
    const diagnostics = await this.collectDiagnostics(sessions)
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const id = `BUG-${dateStr}-${ulid().slice(-6)}`
    const filename = `${id}.md`

    const content = `---
id: ${id}
status: open
project: ${project ?? 'cipher-mux-electron'}
created: ${now.toISOString()}
---

## Beschreibung

${description}

## Diagnostik

- **App-Version:** ${diagnostics.appVersion}
- **OS:** ${diagnostics.osVersion}
- **Electron:** ${diagnostics.electronVersion}
- **Node:** ${diagnostics.nodeVersion}
- **tmux:** ${diagnostics.tmuxVersion ?? 'nicht verfügbar'}
- **Aktive Sessions:** ${diagnostics.sessions.filter((s) => s.status === 'active').length}

### Sessions

${diagnostics.sessions.map((s) => `- ${s.name} (${s.status}) — ${s.tmuxSession}`).join('\n')}

### Letzte Logs

\`\`\`
${diagnostics.logs.slice(-50).join('\n')}
\`\`\`
`

    fs.writeFileSync(path.join(OUTBOX_DIR, filename), content, 'utf-8')
    return id
  }
}
```

- [ ] **Step 3: Wire BugreportManager into IpcHub**

In `src/main/ipc-hub.ts`, add import:
```typescript
import { BugreportManager } from './bugreport/bugreport-manager'
```

Add field and initialization in constructor:
```typescript
  private bugreportManager: BugreportManager
```
```typescript
    this.bugreportManager = new BugreportManager()
```

Replace `registerBugreportChannels()`:
```typescript
  private registerBugreportChannels(): void {
    ipcMain.handle(IPC.BUGREPORT_COLLECT, async () => {
      return this.bugreportManager.collectDiagnostics(this.sessionManager.list())
    })

    ipcMain.handle(IPC.BUGREPORT_SUBMIT, async (_e, { description, project }: {
      description: string
      project?: string
    }) => {
      const id = await this.bugreportManager.submit(description, this.sessionManager.list(), project)
      return { id }
    })
  }
```

- [ ] **Step 4: Update preload.ts**

Replace the bugreport section in `src/main/preload.ts`:
```typescript
  bugreport: {
    collect: () => ipcRenderer.invoke(IPC.BUGREPORT_COLLECT),
    submit: (description: string, project?: string) =>
      ipcRenderer.invoke(IPC.BUGREPORT_SUBMIT, { description, project }),
  },
```

- [ ] **Step 5: Create BugreportDialog component**

```typescript
// src/renderer/components/BugreportDialog.tsx
import { useState, useCallback } from 'preact/hooks'

const api = () => (window as any).cipherMux

interface BugreportDialogProps {
  visible: boolean
  onClose: () => void
}

export function BugreportDialog({ visible, onClose }: BugreportDialogProps) {
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) return
    setSubmitting(true)
    try {
      const res = await api().bugreport.submit(description)
      setResult(res.id)
      setDescription('')
    } catch (err) {
      console.error('[BugreportDialog] submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }, [description])

  const handleClose = useCallback(() => {
    setResult(null)
    setDescription('')
    onClose()
  }, [onClose])

  if (!visible) return null

  return (
    <div class="dialog-overlay" onClick={handleClose}>
      <div class="dialog bugreport-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 class="dialog__title">Bugreport</h3>

        {result ? (
          <>
            <p class="dialog__text">
              Report <strong>{result}</strong> in Outbox abgelegt.
            </p>
            <div class="dialog__footer">
              <button class="btn btn--sm btn--primary" onClick={handleClose}>OK</button>
            </div>
          </>
        ) : (
          <>
            <p class="dialog__text">
              Beschreibe das Problem. Diagnostik wird automatisch angehängt.
            </p>
            <textarea
              class="bugreport-textarea"
              rows={6}
              value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              placeholder="Was ist passiert? Was hast du erwartet?"
              autoFocus
            />
            <div class="dialog__footer">
              <button class="btn btn--sm" onClick={handleClose}>Abbrechen</button>
              <button
                class="btn btn--sm btn--primary"
                onClick={handleSubmit}
                disabled={submitting || !description.trim()}
              >
                {submitting ? 'Sende…' : 'Absenden'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add bugreport CSS and wire into app.tsx**

Append to `src/renderer/styles/components.css`:
```css
/* ================================================================
   Bugreport Dialog
   ================================================================ */

.bugreport-dialog {
  max-width: 480px;
}

.bugreport-textarea {
  width: 100%;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  padding: var(--space-sm);
  resize: vertical;
  outline: none;
  transition: border-color var(--transition-base);
}

.bugreport-textarea:focus {
  border-color: var(--color-neon-green);
}
```

In `src/renderer/app.tsx`, add import:
```typescript
import { BugreportDialog } from './components/BugreportDialog'
```

Add state:
```typescript
  const [bugreportVisible, setBugreportVisible] = useState(false)
```

Add to shortcutEntries:
```typescript
    { combo: 'Cmd+B', label: 'Bugreport', category: 'Aktionen' as const, action: () => setBugreportVisible((v) => !v) },
```

Add dialog before closing `</div>` of app-shell:
```typescript
      <BugreportDialog
        visible={bugreportVisible}
        onClose={() => setBugreportVisible(false)}
      />
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: Clean compile

- [ ] **Step 8: Commit**

```bash
git add src/main/bugreport/bugreport-manager.ts src/renderer/components/BugreportDialog.tsx src/shared/ipc-channels.ts src/shared/types.ts src/main/ipc-hub.ts src/main/preload.ts src/renderer/app.tsx src/renderer/styles/components.css
git commit -m "feat(bugreport): outbox-based bugreport system with diagnostics collection"
```

---

## Task 6: Smoke Test Preparation

**Files:**
- Modify: `docs/TESTCASE.md`

- [ ] **Step 1: Add Phase 6 test cases to TESTCASE.md**

Append:

```markdown
## Phase 6: Polish & Split-Layout

### Test 11: Keyboard Shortcuts
1. Start app
2. Press Cmd+0 → should switch to Cockpit
3. Start a session, press Cmd+1 → should focus session 1
4. Press Cmd+K → Chatroom should toggle
5. Press Cmd+N → Kickoff dialog should open
6. Press Cmd+B → Bugreport dialog should open

### Test 12: Split-View
1. Start a session (Cmd+N or from Cockpit)
2. Press Cmd+\ → should prompt for directory, then split vertically
3. Verify both terminals render and resize independently
4. Drag the divider — ratio should update
5. Press Cmd+- → should split the active pane horizontally
6. Press Cmd+W → should close the active pane, sibling collapses up
7. Close all panes → should return to empty-state or cockpit

### Test 13: Layout Persistence
1. Create a split layout (2-3 panes)
2. Quit app (Cmd+Q)
3. Restart app → layout should restore with same split ratios
4. Sessions should reconnect via recovery

### Test 14: Session Recovery
1. Create 2-3 sessions
2. Force-kill Electron (kill -9)
3. Restart app
4. Recovery dialog should show orphaned sessions
5. "Übernehmen" → session reappears in Activity Rail
6. "Beenden" → tmux session is killed
7. "Alle beenden" → all orphans cleared

### Test 15: Info & Settings
1. Click "i" in Activity Rail
2. Three tabs visible: Shortcuts, Features, Einstellungen
3. Shortcuts tab shows all registered shortcuts from registry
4. Features tab shows feature descriptions
5. Einstellungen tab shows Scan-Pfade + Über

### Test 16: Bugreport
1. Press Cmd+B → Bugreport dialog opens
2. Type description, click "Absenden"
3. Confirmation shows report ID
4. Check ~/.config/cipher-mux/bugreports/outbox/ → file exists with correct frontmatter
```

- [ ] **Step 2: Commit**

```bash
git add docs/TESTCASE.md
git commit -m "docs(test): add Phase 6 smoke test cases (Tests 11-16)"
```

---

## Execution Note

After all 6 tasks are complete, the user needs to manually run Tests 11-16 from TESTCASE.md. This is where user-side testing begins — no further autonomous implementation until feedback.
