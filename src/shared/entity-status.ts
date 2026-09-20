// src/shared/entity-status.ts — Entity running-state derived from the session list.
//
// Lives in shared/ because the renderer needs it for the launcher and the test
// must import it without pulling in Electron. Deliberately does NOT depend on
// SessionInfo so the test can pass plain literals.

import { workspaceKey as key } from './workspace-key'

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

/** Session ID of an entity inside one workspace, or null. */
export function findEntitySessionId(
  sessions: readonly StatusSession[],
  entityId: string,
  workspaceId: string | null,
): string | null {
  const k = key(workspaceId)
  return sessions.find(
    s => s.entityId === entityId && s.status === 'active' && key(s.workspaceId) === k,
  )?.id ?? null
}
