// src/main/mcp/workspace-header.ts — Workspace identity on the MCP connection.
//
// The MCP server cannot otherwise tell its callers apart: one URL, one bearer
// token for everyone. Rather than asking the model to pass a workspace id as a
// tool parameter (which it can forget, silently writing into the wrong
// workspace), the identity rides on the connection headers and is bound once
// at initialize time.

/** Header name as Node normalises incoming headers: lowercase. */
export const WORKSPACE_HEADER = 'x-mux-workspace'

/** Header name as written into .mcp.json / settings.local.json. */
export const WORKSPACE_HEADER_CANONICAL = 'X-Mux-Workspace'

/**
 * Read the workspace binding off an incoming request's headers.
 * Returns null for absent, empty or whitespace-only values.
 */
export function parseWorkspaceHeader(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers[WORKSPACE_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Validate a raw header value against the workspaces that currently exist.
 * An unknown id is treated as unbound rather than as an error — a client
 * whose workspace was deleted mid-session must keep working.
 */
export function resolveWorkspaceId(
  raw: string | null,
  knownWorkspaceIds: readonly string[],
): string | null {
  if (raw === null) return null
  if (knownWorkspaceIds.includes(raw)) return raw
  console.warn(`[mcp] unknown workspace id in ${WORKSPACE_HEADER_CANONICAL}: "${raw}" — treating as unbound`)
  return null
}

/**
 * Build the `mcpServers['cipher-mux']` entry written into .mcp.json and
 * settings.local.json. Omits the workspace header when unbound so an unbound
 * session is indistinguishable from a pre-upgrade one.
 */
export function buildMcpServerConfig(
  mcpUrl: string,
  apiKey: string,
  workspaceId: string | null,
): { type: 'http'; url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` }
  if (workspaceId) headers[WORKSPACE_HEADER_CANONICAL] = workspaceId
  return { type: 'http', url: mcpUrl, headers }
}
