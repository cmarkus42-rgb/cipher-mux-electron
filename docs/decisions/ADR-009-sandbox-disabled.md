# ADR-009: Electron Sandbox Disabled

- **Status:** Accepted
- **Date:** 2026-05-12
- **Context:** Audit Report v0.9.996, Finding H-1

## Context

All four BrowserWindow types in `window-manager.ts` (main, workspaces, sidebar, detached) set `sandbox: false` in their webPreferences. This disables the Chromium sandbox for renderer processes, which is a security-sensitive configuration.

## Decision

We accept `sandbox: false` as a known trade-off for the current release (v0.9.x / v1.0).

### Why sandbox is off

The preload scripts (`preload.ts`) require Node.js APIs for IPC communication that are not available in a sandboxed renderer. Specifically:

- `electron.ipcRenderer` is used extensively for bidirectional main↔renderer communication
- `contextBridge.exposeInMainWorld()` alone cannot cover all current IPC patterns (streaming, event subscriptions, callback-based APIs)
- Refactoring the preload layer to work within sandbox constraints requires significant architectural changes

### Mitigations in place

Despite sandbox being disabled, the following security measures are active:

1. **`contextIsolation: true`** — renderer JavaScript cannot access the preload scope directly
2. **`nodeIntegration: false`** — renderer code cannot use Node.js APIs directly
3. **Bearer-Auth on MCP server** — the local MCP endpoint (`127.0.0.1:3100`) requires authentication, preventing unauthorized local access
4. **No remote content** — all renderer content is loaded from local files (`file://` protocol), no external URLs are loaded in BrowserWindows

### Risk assessment

The combination of `contextIsolation: true` + `nodeIntegration: false` means a compromised renderer still cannot directly execute Node.js code. The primary risk vector would be a preload script vulnerability, which is mitigated by the fact that preload scripts are bundled application code, not user-supplied.

## Planned remediation

Target: **v1.1** — Preload Refactoring

- Migrate all IPC patterns to `contextBridge`-compatible APIs
- Replace streaming/callback patterns with message-port-based alternatives
- Re-enable `sandbox: true` on all window types
- Validate with Electron security checklist

## Consequences

- Security audits will flag `sandbox: false` — this ADR serves as the documented rationale
- The v1.1 preload refactoring is tracked as a planned improvement
- No user-facing impact; this is an internal hardening measure
