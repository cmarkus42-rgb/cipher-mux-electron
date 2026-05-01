/**
 * Terminal Registry — global maps for xterm.js Terminal instances and scroll markers.
 *
 * Allows IPC scroll handlers and MCP tools to reach Terminal instances
 * that are created inside useTerminal hooks.
 */
import type { Terminal } from '@xterm/xterm'

const terminals = new Map<string, Terminal>()
const markers = new Map<string, number>()

export function registerTerminal(sessionId: string, term: Terminal): void {
  terminals.set(sessionId, term)
}

export function unregisterTerminal(sessionId: string): void {
  terminals.delete(sessionId)
}

export function getTerminal(sessionId: string): Terminal | undefined {
  return terminals.get(sessionId)
}

/** Store the scrollback line number at the moment of user submission. */
export function setMarker(sessionId: string, line: number): void {
  markers.set(sessionId, line)
}

export function getMarker(sessionId: string): number | undefined {
  return markers.get(sessionId)
}

export function clearMarker(sessionId: string): void {
  markers.delete(sessionId)
}
