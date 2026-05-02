// src/main/workspace-memory/session-scope-cleanup.ts
import type Database from 'better-sqlite3'

/**
 * Delete all memory entries with scope_kind='session' and scope_id=sessionId.
 * Called when a session ends (configurable via sessionScopeAutoDelete).
 */
export function cleanupSessionMemory(db: Database.Database, sessionId: string): number {
  const result = db.prepare(
    `DELETE FROM memories WHERE scope_kind = 'session' AND scope_id = ?`
  ).run(sessionId)
  return result.changes
}

/**
 * Archive workspace memory entries (move scope_kind to 'archived-workspace').
 * Called when a workspace is deleted with archiveOnWorkspaceDelete=true.
 */
export function archiveWorkspaceMemory(db: Database.Database, workspaceId: string): number {
  const result = db.prepare(
    `UPDATE memories SET scope_kind = 'archived-workspace' WHERE scope_kind = 'workspace' AND scope_id = ?`
  ).run(workspaceId)
  return result.changes
}

/**
 * Permanently delete workspace memory entries.
 * Called when archiveOnWorkspaceDelete=false.
 */
export function deleteWorkspaceMemory(db: Database.Database, workspaceId: string): number {
  const result = db.prepare(
    `DELETE FROM memories WHERE scope_kind = 'workspace' AND scope_id = ?`
  ).run(workspaceId)
  return result.changes
}
