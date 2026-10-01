/**
 * Ob eine ausgelieferte `preset.md` hinter ihrer Code-Vorlage zurueckliegt.
 *
 * **Das Problem.** `preset.md` wird write-once geschrieben (`session-manager.ts`,
 * Zweig je Rolle), damit Handarbeit daran ueberlebt. Der Preis: eine korrigierte
 * Vorlage im Code erreicht die bestehende Datei **nie**. Am 2026-10-01 trugen
 * dadurch 16 von 16 Rollen Tag-Anweisungen, die der Mux hart abweist — wochenlang,
 * ohne dass es jemandem auffiel. Behoben wurde es von Hand; ein Mechanismus
 * entstand dabei nicht.
 *
 * **Was diese Datei tut und was nicht.** Sie *erkennt* den Rueckstand. Sie
 * repariert ihn nicht. Automatisch zu ueberschreiben waere genau das, was
 * write-once verhindern soll — und ein Dialog beim Sessionstart waere wieder
 * etwas, das eine unbeaufsichtigte Session aufhaelt. Der Befund gehoert dorthin,
 * wo jemand die Datei ohnehin ansieht: in den Preset-Editor.
 *
 * **Die Konvention gab es schon halb.** Drei Vorlagen tragen seit laengerem einen
 * Marker (`<!-- companion-v2 -->` und Geschwister) — ausgewertet hat ihn nie
 * jemand. Hier wird er ausgewertet.
 */

/** Ein Marker der Form `<!-- companion-v2 -->` am Anfang einer Vorlage. */
const MARKER = /<!--\s*([a-z][a-z0-9-]*)-v(\d+)\s*-->/

export interface PresetVersion {
  /** Die Rolle, wie sie im Marker steht. */
  entityId: string
  /** Die Nummer hinter dem `v`. */
  version: number
}

/**
 * Liest den Marker aus einem Text.
 *
 * Gesucht wird **der erste** im Text: ein Preset darf in seinem Rumpf ueber
 * Marker schreiben, ohne dass daraus eine Versionsangabe wird. Fehlt er, ist das
 * kein Fehler, sondern eine Aussage — die Datei stammt aus der Zeit vor der
 * Konvention.
 */
export function parsePresetVersion(text: string): PresetVersion | null {
  const m = MARKER.exec(text)
  if (!m) return null
  const version = Number.parseInt(m[2], 10)
  if (!Number.isFinite(version)) return null
  return { entityId: m[1], version }
}

export type PresetStatus =
  /** Datei und Vorlage sind auf demselben Stand. */
  | 'aktuell'
  /** Die Vorlage ist neuer — die Datei hat die Aenderung nie gesehen. */
  | 'veraltet'
  /** Die Datei ist neuer als die Vorlage. Kommt vor, wenn jemand die Nummer von Hand hochsetzt. */
  | 'voraus'
  /** Die Vorlage traegt keinen Marker — fuer diese Rolle laesst sich nichts sagen. */
  | 'ohne-vorlage-marker'
  /** Nur die Datei hat keinen: sie stammt aus der Zeit vor der Konvention, ist also aelter. */
  | 'ohne-datei-marker'

export interface PresetComparison {
  status: PresetStatus
  fileVersion: number | null
  templateVersion: number | null
  /** Ob der Nutzer etwas davon wissen sollte. */
  stale: boolean
}

/**
 * Vergleicht eine ausgelieferte Datei mit ihrer Code-Vorlage.
 *
 * `ohne-datei-marker` zaehlt als veraltet: die Marker wurden eingefuehrt, *weil*
 * sich etwas geaendert hat, und eine Datei ohne Marker hat diese Aenderung per
 * Definition nicht. `ohne-vorlage-marker` zaehlt **nicht** als veraltet — ueber
 * eine Rolle ohne Vorlagenmarker laesst sich schlicht nichts sagen, und eine
 * Warnung ohne Aussage ist Laerm.
 */
export function comparePresetVersion(fileText: string, templateText: string): PresetComparison {
  const file = parsePresetVersion(fileText)
  const template = parsePresetVersion(templateText)

  if (!template) {
    return { status: 'ohne-vorlage-marker', fileVersion: file?.version ?? null, templateVersion: null, stale: false }
  }
  if (!file) {
    return { status: 'ohne-datei-marker', fileVersion: null, templateVersion: template.version, stale: true }
  }
  if (file.version < template.version) {
    return { status: 'veraltet', fileVersion: file.version, templateVersion: template.version, stale: true }
  }
  if (file.version > template.version) {
    // Kein Grund zur Warnung, aber auch nicht „aktuell" — wer das sieht, hat
    // von Hand an der Nummer gedreht, und das soll sichtbar bleiben.
    return { status: 'voraus', fileVersion: file.version, templateVersion: template.version, stale: false }
  }
  return { status: 'aktuell', fileVersion: file.version, templateVersion: template.version, stale: false }
}
