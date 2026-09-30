/**
 * Vier Achsen, nicht vierzehn.
 *
 * Festgelegt am 2026-09-30: wichtig sind **Workspace, Phase, Status und Typ**.
 *
 * Der Ist-Zustand war ein anderer, gemessen am selben Tag: 958 Notes,
 * 14 Klassen, 269 Tags ganz ohne Klasse. `kind` allein trug 29 Werte,
 * `workspace` dreizehn — darunter „Cipher Grow KIT" und „cipher grow kit"
 * nebeneinander —, und unter `phase` standen Wellennummern.
 *
 * Der Grund liegt im Verfahren: Das Auto-Tagging fragt ein lokales Modell und
 * übernimmt, was zurückkommt. Ein Modell, das Klassen erfinden darf, erfindet
 * welche — und jede erfundene Klasse ist eine Filterebene, die es nur einmal
 * gibt. Die Achsen sind die Antwort darauf, und zwar als Filter auf dem
 * Ergebnis statt als Bitte im Prompt: eine Bitte kann ein Modell überhören.
 *
 * **Gefiltert wird nur, was das Tagging vorschlägt.** Bestehende Tags an Notes
 * bleiben unangetastet — was jemand selbst vergeben hat, nimmt ihm hier
 * niemand weg.
 */

/** Die vier Achsen, auf die sich das Auto-Tagging beschränkt. */
export const TAG_AXES = ['workspace', 'kind', 'phase', 'status'] as const
export type TagAxis = (typeof TAG_AXES)[number]

/**
 * Typ einer Note.
 *
 * Die ersten fünf tragen eine eigene Ansicht (siehe note-type-tags.ts); die
 * übrigen beschreiben einen Zweck, für den es keine gibt, aber einen echten
 * Gegenstand — ein Bugreport ist eine Sache, die der Mux kennt.
 */
export const KIND_VALUES: readonly string[] = [
  'testcase', 'finding', 'spec', 'requirements', 'research',
  'bugreport', 'handoff', 'journal', 'reference', 'todo', 'idea',
]

/** Phase des Arbeitsablaufs. Mehrere sind erlaubt — eine Note darf zwei berühren. */
export const PHASE_VALUES: readonly string[] = [
  'research', 'architecture', 'coding', 'testing', 'debugging', 'automation', 'monitoring',
]

/** Zustand. Ausschließend: zwei Zustände gleichzeitig sind keine Aussage. */
export const STATUS_VALUES: readonly string[] = [
  'open', 'in-progress', 'blocked', 'verify', 'done', 'superseded',
]

const CLOSED_VALUES: Partial<Record<TagAxis, readonly string[]>> = {
  kind: KIND_VALUES,
  phase: PHASE_VALUES,
  status: STATUS_VALUES,
}

/**
 * Achsen, von denen eine Note nur einen Wert tragen darf.
 *
 * Zwei Typen machen den Typ mehrdeutig, zwei Zustände heben einander auf.
 * Phase ist bewusst nicht dabei: eine Spec kann Architektur und Testen
 * zugleich betreffen.
 */
const EXCLUSIVE: readonly TagAxis[] = ['kind', 'status']

/**
 * Achsen, die das Auto-Tagging nicht vorschlagen darf.
 *
 * Der Workspace wird vom Mux gesetzt — er ist eine Tatsache über die Herkunft
 * einer Note, keine Einschätzung ihres Inhalts. Ein Modell, das ihn errät,
 * hängt eine Note in den falschen Workspace.
 */
const NOT_INFERRABLE: readonly TagAxis[] = ['workspace']

function splitTag(tag: string): { axis: string; value: string } | null {
  const i = tag.indexOf(':')
  if (i <= 0 || i === tag.length - 1) return null
  return { axis: tag.slice(0, i).toLowerCase(), value: tag.slice(i + 1).toLowerCase() }
}

/** Ob ein Tag auf eine der vier Achsen passt — bei geschlossenen auch dem Wert nach. */
export function isAxisTag(tag: string): boolean {
  const parts = splitTag(tag)
  if (!parts) return false
  if (!(TAG_AXES as readonly string[]).includes(parts.axis)) return false

  const allowed = CLOSED_VALUES[parts.axis as TagAxis]
  // Offene Achse (workspace): jeder Wert ist möglich, die IDs sind nicht
  // aufzählbar.
  return allowed ? allowed.includes(parts.value) : true
}

/**
 * Vorschläge des Auto-Taggings auf die Achsen zurechtstutzen.
 *
 * Reihenfolge bleibt erhalten, damit bei einer ausschließenden Achse der
 * zuerst genannte Wert gewinnt — das ist der, den das Modell für den
 * wahrscheinlichsten hielt.
 */
export function filterToAxes(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const usedExclusive = new Set<string>()
  const result: string[] = []

  for (const raw of tags) {
    const parts = splitTag(raw)
    if (!parts) continue
    if ((NOT_INFERRABLE as readonly string[]).includes(parts.axis)) continue

    const normalized = `${parts.axis}:${parts.value}`
    if (!isAxisTag(normalized) || seen.has(normalized)) continue

    if ((EXCLUSIVE as readonly string[]).includes(parts.axis)) {
      if (usedExclusive.has(parts.axis)) continue
      usedExclusive.add(parts.axis)
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}
