// src/shared/entity-status.ts — Entity running-state derived from the session list.
//
// Lives in shared/ because the renderer needs it for the launcher and the test
// must import it without pulling in Electron. Deliberately does NOT depend on
// SessionInfo so the test can pass plain literals.

import { workspaceKey as key, GLOBAL_WORKSPACE_KEY } from './workspace-key'

export interface StatusSession {
  id: string
  entityId?: string | null
  status: string
  workspaceId?: string | null
}

/**
 * entityId → workspace keys the entity is currently running in.
 *
 * Replaces the old Record<entityId, boolean>: "runs somewhere" cannot express
 * a preset that runs in one workspace but is startable in another, which is
 * exactly the decision the launcher has to make.
 */
export function deriveEntityStatus(
  sessions: readonly StatusSession[],
): Record<string, string[]> {
  const status: Record<string, string[]> = {}
  for (const s of sessions) {
    if (!s.entityId || s.status !== 'active') continue
    const list = status[s.entityId] ?? (status[s.entityId] = [])
    const k = key(s.workspaceId)
    if (!list.includes(k)) list.push(k)
  }
  return status
}

/**
 * Session ID of an entity inside one workspace, or null.
 *
 * An unbound session (workspaceId null, key `_global`) is visible from every
 * workspace, not from none — see the ruling in commit 333de16 and the spec
 * section "Was 'global' konkret heißt". A bound session in the requested
 * workspace always wins over an unbound one: the widening is a fallback for
 * "this entity has no instance of its own here", not a way to prefer the
 * unbound instance when a local one already exists.
 */
export function findEntitySessionId(
  sessions: readonly StatusSession[],
  entityId: string,
  workspaceId: string | null,
): string | null {
  const k = key(workspaceId)
  const bound = sessions.find(
    s => s.entityId === entityId && s.status === 'active' && key(s.workspaceId) === k,
  )
  if (bound) return bound.id
  // Already looked for _global directly above if that's what was requested —
  // no further fallback in that case.
  if (k === GLOBAL_WORKSPACE_KEY) return null
  const unbound = sessions.find(
    s => s.entityId === entityId && s.status === 'active' && key(s.workspaceId) === GLOBAL_WORKSPACE_KEY,
  )
  return unbound?.id ?? null
}
