/**
 * In welchen Workspace gehört eine neue Note?
 *
 * Gemessen am 2026-10-01: zwei Werkzeuge auf derselben Verbindung antworteten
 * unterschiedlich.
 *
 *   `mux_notes_create`          nahm den **aktiven** Workspace
 *                               (`getActiveWorkspace`) und ignorierte die
 *                               Bindung der Verbindung.
 *   `mux_notes_handoff_create`  nahm die **Bindung** (`ctx.workspaceId`) und
 *                               ignorierte den aktiven Workspace.
 *
 * Beide sind halb richtig, und jede Hälfte hat ihren eigenen Schaden:
 *
 *  - **Nur der aktive Workspace:** eine Cyber-Factory-Session, die in Workspace
 *    A arbeitet, schreibt ihre Note nach B, weil der Mensch gerade dorthin
 *    schaut. Genau die Falle, die CLAUDE.md unter „Drei-Zustands-Disziplin"
 *    beschreibt.
 *  - **Nur die Bindung:** eine Verbindung ohne `X-Mux-Workspace`-Kopf erzeugt
 *    eine Note ohne Workspace-Tag, und die ist dann in *jedem* Workspace
 *    sichtbar. Die erste Übergabe-Note dieser Art ist genau so entstanden.
 *
 * Die Regel lautet deshalb: **Bindung schlägt Ansicht, und ohne Bindung die
 * Ansicht.**
 *
 * Die eigentliche Drei-Zustands-Unterscheidung ist hier nicht mehr zu haben:
 * `resolveWorkspaceId` (workspace-header.ts) macht aus „kein Kopf" schon an der
 * Verbindungsgrenze ein `null`, und damit ist „keine Präferenz" von
 * „ausdrücklich ungebunden" nicht zu trennen. Für eine Note ist der aktive
 * Workspace die brauchbarere Lesart — sie entsteht in einem Projekt. Wer die
 * Unterscheidung zurückhaben will, muss sie im Header-Pfad wiederherstellen,
 * nicht hier.
 */

/** Leere und nur-Leerzeichen-Werte sind keine Angabe. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * @param connectionWorkspaceId Bindung dieser MCP-Verbindung, oder null/undefined.
 * @param activeWorkspaceId     Workspace, den der Mensch gerade ansieht.
 * @returns Der Workspace für die Note, oder null für „ohne Workspace".
 */
export function resolveNoteWorkspaceId(
  connectionWorkspaceId: string | null | undefined,
  activeWorkspaceId: string | null | undefined,
): string | null {
  return clean(connectionWorkspaceId) ?? clean(activeWorkspaceId)
}
