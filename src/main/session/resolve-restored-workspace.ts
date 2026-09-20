/**
 * Three-way resolution rule for re-binding a recovered session's workspace
 * during Keep-Working restore (see restoreKeepWorkingFromRecovery() in
 * ipc-hub.ts).
 *
 * The snapshot entry's own workspaceId wins when present. Otherwise, the
 * value already restored onto the recovered session (by
 * SessionManager.recover(), from the persisted store) is kept — an old
 * snapshot written before this field existed must not clobber a binding
 * that recovery already correctly restored. Only when neither source has
 * a value does this resolve to null (no binding).
 */
export function resolveRestoredWorkspaceId(
  entryWorkspaceId: string | null | undefined,
  matchWorkspaceId: string | null | undefined,
): string | null {
  return entryWorkspaceId ?? matchWorkspaceId ?? null
}
