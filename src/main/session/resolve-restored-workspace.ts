/**
 * Resolution rule for re-binding a recovered session's workspace during
 * Keep-Working restore (see restoreKeepWorkingFromRecovery() in
 * ipc-hub.ts).
 *
 * The recovered session's own binding wins. `sessions.json` is the
 * continuously-maintained, structured record — every session change calls
 * persistSession(), and recover() reads it straight back into
 * `recoveredWorkspaceId`. `keepWorkingSnapshot` is a parallel, coarser
 * record written once at quit and matched back to sessions heuristically
 * (by name, falling back to projectPath), so it can point at the wrong
 * session or simply predate this field. Preferring the recovered value
 * means:
 *   - an old snapshot with no workspaceId key can't clobber a binding
 *     recovery already restored correctly, and
 *   - a projectPath-fallback mismatch (snapshot entry for a *different*
 *     session than the one actually matched) can't stamp the wrong
 *     workspace onto a survivor.
 * The snapshot entry is consulted only as a fallback, for the one case
 * where the recovered session has no binding of its own but the snapshot
 * does — a pre-upgrade `sessions.json` paired with a post-upgrade
 * snapshot. That's a reasonable best guess and can't make things worse,
 * since the alternative there is null.
 */
export function resolveRestoredWorkspaceId(
  recoveredWorkspaceId: string | null | undefined,
  snapshotEntryWorkspaceId: string | null | undefined,
): string | null {
  return recoveredWorkspaceId ?? snapshotEntryWorkspaceId ?? null
}
