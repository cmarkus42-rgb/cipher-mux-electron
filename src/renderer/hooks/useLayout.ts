// src/renderer/hooks/useLayout.ts
import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { LayoutState, LayoutNode, SplitNode, PaneNode, SplitDirection } from '../../shared/types'
import { LAYOUT_SAVE_DEBOUNCE_MS } from '../../shared/constants'

// ─── Pure tree helpers ──────────────────────────────────────

/** Collect all sessionIds from a layout tree. */
export function collectSessionIds(node: LayoutNode | null): Set<string> {
  const ids = new Set<string>()
  if (!node) return ids
  if (node.type === 'pane') {
    ids.add(node.sessionId)
  } else {
    for (const child of node.children) {
      for (const id of collectSessionIds(child)) {
        ids.add(id)
      }
    }
  }
  return ids
}

/** Find a PaneNode by sessionId and replace it with a new node. Returns null if not found. */
function findAndReplace(
  node: LayoutNode,
  sessionId: string,
  replacer: (pane: PaneNode) => LayoutNode,
): LayoutNode | null {
  if (node.type === 'pane') {
    return node.sessionId === sessionId ? replacer(node) : null
  }
  const newChildren: LayoutNode[] = []
  let found = false
  for (const child of node.children) {
    const replaced = findAndReplace(child, sessionId, replacer)
    if (replaced) {
      newChildren.push(replaced)
      found = true
    } else {
      newChildren.push(child)
    }
  }
  if (!found) return null
  return { ...node, children: newChildren }
}

/** Remove a pane by sessionId from the tree. Returns the pruned tree (or null if tree is now empty). */
function removePane(node: LayoutNode, sessionId: string): LayoutNode | null {
  if (node.type === 'pane') {
    return node.sessionId === sessionId ? null : node
  }
  const remaining: LayoutNode[] = []
  for (const child of node.children) {
    const result = removePane(child, sessionId)
    if (result) remaining.push(result)
  }
  if (remaining.length === 0) return null
  if (remaining.length === 1) return remaining[0] // collapse: sibling moves up
  return { ...node, children: remaining }
}

/** Update ratio at a specific path in the tree. */
function updateRatioAtPath(node: LayoutNode, path: number[], ratio: number): LayoutNode {
  if (path.length === 0) {
    if (node.type === 'split') {
      return { ...node, ratio: Math.max(0.15, Math.min(0.85, ratio)) }
    }
    return node
  }
  if (node.type === 'pane') return node
  const [idx, ...rest] = path
  const newChildren = node.children.map((child, i) =>
    i === idx ? updateRatioAtPath(child, rest, ratio) : child,
  )
  return { ...node, children: newChildren }
}

/** Remove all panes whose sessionId is not in validIds. */
function pruneTree(node: LayoutNode, validIds: Set<string>): LayoutNode | null {
  if (node.type === 'pane') {
    return validIds.has(node.sessionId) ? node : null
  }
  const remaining: LayoutNode[] = []
  for (const child of node.children) {
    const result = pruneTree(child, validIds)
    if (result) remaining.push(result)
  }
  if (remaining.length === 0) return null
  if (remaining.length === 1) return remaining[0]
  return { ...node, children: remaining }
}

// ─── Hook ───────────────────────────────────────────────────

export function useLayout() {
  const [layout, setLayout] = useState<LayoutState>({ root: null, activePaneId: null })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist layout with debounce
  const persistLayout = useCallback((next: LayoutState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const api = (window as any).cipherMux
      api.config.saveLayout(next).catch((err: unknown) =>
        console.error('[useLayout] persist failed:', err),
      )
    }, LAYOUT_SAVE_DEBOUNCE_MS)
  }, [])

  // Load persisted layout on mount
  useEffect(() => {
    const api = (window as any).cipherMux
    api.config.get('ui').then((ui: any) => {
      if (ui?.layout?.root) {
        setLayout(ui.layout)
      }
    }).catch((err: unknown) => {
      console.error('[useLayout] load failed:', err)
    })
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const updateLayout = useCallback((next: LayoutState) => {
    setLayout(next)
    persistLayout(next)
  }, [persistLayout])

  const splitPane = useCallback((paneSessionId: string, direction: SplitDirection, newSessionId: string) => {
    setLayout((prev) => {
      const { root } = prev
      if (!root) {
        // No layout yet — create initial split from the single active pane
        const newRoot: SplitNode = {
          type: 'split',
          direction,
          ratio: 0.5,
          children: [
            { type: 'pane', sessionId: paneSessionId },
            { type: 'pane', sessionId: newSessionId },
          ],
        }
        const next: LayoutState = { root: newRoot, activePaneId: newSessionId }
        persistLayout(next)
        return next
      }
      const newRoot = findAndReplace(root, paneSessionId, () => ({
        type: 'split' as const,
        direction,
        ratio: 0.5,
        children: [
          { type: 'pane' as const, sessionId: paneSessionId },
          { type: 'pane' as const, sessionId: newSessionId },
        ],
      }))
      const next: LayoutState = {
        root: newRoot ?? root,
        activePaneId: newSessionId,
      }
      persistLayout(next)
      return next
    })
  }, [persistLayout])

  const closePane = useCallback((paneSessionId: string) => {
    setLayout((prev) => {
      const { root } = prev
      if (!root) return prev
      const newRoot = removePane(root, paneSessionId)
      // Pick a new active pane if the closed one was active
      let newActive = prev.activePaneId
      if (newActive === paneSessionId) {
        const remaining = collectSessionIds(newRoot)
        newActive = remaining.size > 0 ? remaining.values().next().value ?? null : null
      }
      const next: LayoutState = { root: newRoot, activePaneId: newActive }
      persistLayout(next)
      return next
    })
  }, [persistLayout])

  const updateRatio = useCallback((path: number[], ratio: number) => {
    setLayout((prev) => {
      if (!prev.root) return prev
      const newRoot = updateRatioAtPath(prev.root, path, ratio)
      const next: LayoutState = { ...prev, root: newRoot }
      persistLayout(next)
      return next
    })
  }, [persistLayout])

  const setActivePane = useCallback((sessionId: string) => {
    setLayout((prev) => {
      if (prev.activePaneId === sessionId) return prev
      const next: LayoutState = { ...prev, activePaneId: sessionId }
      persistLayout(next)
      return next
    })
  }, [persistLayout])

  const pruneInvalidPanes = useCallback((validSessionIds: Set<string>) => {
    setLayout((prev) => {
      if (!prev.root) return prev
      const newRoot = pruneTree(prev.root, validSessionIds)
      if (newRoot === prev.root) return prev
      let newActive = prev.activePaneId
      if (newActive && !validSessionIds.has(newActive)) {
        const remaining = collectSessionIds(newRoot)
        newActive = remaining.size > 0 ? remaining.values().next().value ?? null : null
      }
      const next: LayoutState = { root: newRoot, activePaneId: newActive }
      persistLayout(next)
      return next
    })
  }, [persistLayout])

  return {
    layout,
    splitPane,
    closePane,
    updateRatio,
    setActivePane,
    pruneInvalidPanes,
  }
}
