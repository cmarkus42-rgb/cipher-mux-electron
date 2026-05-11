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
