// src/shared/workspace-key.ts — The one mapping from a workspace binding to a key.
//
// Main uses it for run directory paths and entity lookups, the renderer for the
// launcher's running-state derivation. Two copies of "null means _global" would
// drift apart, and the drift would only show up as sessions landing in the
// wrong place.

/** Path segment and lookup key for sessions with no workspace binding. */
export const GLOBAL_WORKSPACE_KEY = '_global'

/**
 * Map a workspace binding to its key.
 * null/undefined → '_global'. Never returns an empty string.
 */
export function workspaceKey(workspaceId: string | null | undefined): string {
  return workspaceId ?? GLOBAL_WORKSPACE_KEY
}
