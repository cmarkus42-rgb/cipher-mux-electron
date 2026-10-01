/**
 * Die Rollen→CLI-Zuordnung, als reine Funktionen.
 *
 * Sie stand als Handler-Rumpf in `ipc-hub.ts` und war damit nur zu pruefen,
 * indem man die App startet und hinsieht. Das ist bei einer Zuordnung, deren
 * Fehler „die Rolle startet still die falsche CLI" heisst, zu wenig — dieselbe
 * Klasse Fehler hat die Codex-Abnahme viermal geliefert.
 *
 * Die Drei-Zustands-Disziplin gilt hier wie beim Workspace: **ein fehlender
 * Eintrag ist nicht dasselbe wie ein leerer.** „Keine Praeferenz" (dann greift
 * `agent.defaultAdapter`) muss von „ausdruecklich dieser Adapter" unterscheidbar
 * bleiben, sonst faellt die Auflösung in `entity-runtime.ts` auf einen Adapter
 * namens `""` zurueck — und der ist in keiner Registry.
 */

/** Die Zuordnung, wie sie in `app.entityAdapters` liegt. */
export type EntityAdapterMap = Readonly<Record<string, string>>

/**
 * Liest die Praeferenz einer Rolle.
 *
 * `null` heisst „keine" — und zwar auch fuer einen leeren oder nur aus
 * Leerzeichen bestehenden Eintrag, denn so raeumt eine UI ein Feld.
 */
export function readEntityAdapter(map: EntityAdapterMap | undefined, entityId: string): string | null {
  if (!map || typeof map !== 'object') return null
  const raw = (map as Record<string, unknown>)[entityId]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Setzt oder entfernt die Praeferenz einer Rolle und gibt eine **neue** Zuordnung zurueck.
 *
 * `null` loescht den Schluessel, statt einen leeren Wert zu hinterlassen. Die
 * Eingabe bleibt unveraendert, damit ein Aufrufer die alte Fassung noch hat,
 * wenn das Schreiben scheitert.
 */
export function withEntityAdapter(
  map: EntityAdapterMap | undefined,
  entityId: string,
  adapterId: string | null,
): Record<string, string> {
  const next: Record<string, string> = { ...(map ?? {}) }
  const trimmed = adapterId?.trim() ?? ''
  if (trimmed === '') delete next[entityId]
  else next[entityId] = trimmed
  return next
}
