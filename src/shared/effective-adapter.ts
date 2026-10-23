/**
 * Welche CLI eine Rolle beim naechsten Start tatsaechlich faehrt.
 *
 * Dieselbe Kette wie `session/entity-runtime.ts`: Wahl pro Rolle
 * (`app.entityAdapters`) > Rollen-Default aus der Registry > globaler Default.
 * Der Renderer braucht sie, um Anzeige und Modellliste an die wirksame CLI zu
 * haengen — ohne den Rollen-Default zeigte der Preset-Editor beim Local Worker
 * Claude Code an, obwohl opencode startet.
 *
 * Leere Zeichenketten zaehlen als „nichts gewaehlt", wie `null`.
 */
export function resolveEffectiveAdapterId(input: {
  override: string | null
  roleDefault: string | null
  globalDefault: string
}): string {
  return input.override || input.roleDefault || input.globalDefault
}
