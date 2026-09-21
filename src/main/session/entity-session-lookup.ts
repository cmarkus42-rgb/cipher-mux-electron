// src/main/session/entity-session-lookup.ts — Pure lookups over a session list.
//
// Kept free of SessionManager so the same rules can be applied by the handoff
// kernel and mirrored by the renderer's status derivation without three
// slightly different implementations drifting apart.

import { workspaceKey } from '../../shared/workspace-key'

export interface LookupSession {
  id: string
  entityId?: string | null
  status: string
  workspaceId?: string | null
}

/** Active sessions of one entity inside one workspace. */
export function findEntitySessions<T extends LookupSession>(
  sessions: readonly T[],
  entityId: string,
  workspaceId: string | null,
): T[] {
  const key = workspaceKey(workspaceId)
  return sessions.filter(
    s => s.entityId === entityId
      && s.status === 'active'
      && workspaceKey(s.workspaceId) === key,
  )
}

/** Whether the entity already runs in this workspace. */
export function hasActiveEntitySession(
  sessions: readonly LookupSession[],
  entityId: string,
  workspaceId: string | null,
): boolean {
  return findEntitySessions(sessions, entityId, workspaceId).length > 0
}

/**
 * Mutex key for the concurrent-start guard. Per (entity, workspace) — a
 * key of just the entity would block starting the same preset in two
 * workspaces at once.
 */
export function entityStartKey(entityId: string, workspaceId: string | null): string {
  return `${entityId}@${workspaceKey(workspaceId)}`
}
