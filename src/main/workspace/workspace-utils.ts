import type { Workspace } from '../../shared/persona-types'
import { configStore } from '../config/config-store'

/**
 * Resolve the currently active workspace from ConfigStore.
 * Returns null when no workspace is active or the ID doesn't match.
 */
export function getActiveWorkspace(): Workspace | null {
  const activeWsId = configStore.get('activeWorkspaceId') as string | null
  if (!activeWsId) return null
  const workspaces = (configStore.get('workspaces') ?? []) as Workspace[]
  return workspaces.find(w => w.id === activeWsId) ?? null
}

/**
 * Resolve the workspace an entity session should use.
 *
 * undefined = caller expressed no preference → fall back to the active one.
 * null      = caller explicitly wants no binding → stays unbound.
 *
 * Pure: takes the workspace list and the active id as arguments so the
 * decision can be tested without ConfigStore.
 */
export function resolveEntityWorkspace(
  workspaceId: string | null | undefined,
  workspaces: readonly Workspace[],
  activeWorkspaceId: string | null,
): Workspace | null {
  if (workspaceId === null) return null
  const targetId = workspaceId ?? activeWorkspaceId
  if (!targetId) return null
  return workspaces.find(w => w.id === targetId) ?? null
}
