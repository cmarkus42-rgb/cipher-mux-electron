// src/shared/workspace-badge.ts — One rule for when a session's workspace
// binding needs to be shown, shared by every place a session can appear
// (grid cell, sidebar background-session card, detached sidebar window).
//
// The rule (ADR: commit 333de16 established the null-branch): an unbound
// session (workspaceId === null) is visible from every workspace — hiding it
// entirely would make the launcher spawn duplicate instances of non-
// singleInstance presets. But while a workspace is active, an unbound
// session must stay distinguishable from one that actually belongs here, so
// it gets a "global" marker instead of silence.

/** Minimal shape needed to resolve a workspace id to a display name. */
export interface WorkspaceBadgeLookup {
  id: string
  name: string
}

export interface WorkspaceBadge {
  /** Text to show in the badge itself. */
  label: string
  /** True when the session's workspace id no longer resolves to a known workspace. */
  deleted: boolean
  /** True when the session is unbound (workspaceId === null) and a workspace is active. */
  global: boolean
}

/**
 * Decide whether a session's workspace badge should render, and what it
 * says. Returns null when no badge should be shown:
 *   - the session sits in the active workspace (nothing to contrast with)
 *   - the session is unbound and no workspace is active
 *
 * Callers own translation: `global` and `deleted` are booleans, not text, so
 * the UI layer can localize "no workspace" / "(deleted)" without this module
 * knowing about i18n.
 */
export function computeWorkspaceBadge(
  sessionWorkspaceId: string | null | undefined,
  activeWorkspaceId: string | null | undefined,
  workspaces: readonly WorkspaceBadgeLookup[],
): WorkspaceBadge | null {
  const sessionWs = sessionWorkspaceId ?? null
  const activeWs = activeWorkspaceId ?? null

  if (sessionWs === activeWs) return null
  if (sessionWs === null) {
    if (activeWs === null) return null
    return { label: '', deleted: false, global: true }
  }

  const ws = workspaces.find((w) => w.id === sessionWs)
  if (ws) return { label: ws.name, deleted: false, global: false }
  return { label: sessionWs, deleted: true, global: false }
}
