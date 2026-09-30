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

/**
 * Die Achsen, auf die sich das Tagging beschränkt.
 *
 * `entity` kam am 2026-09-30 dazu, auf den Einwand hin, dass Phase und Status
 * ebenfalls den Prozess widerspiegeln — „ideation refinement audit und testing
 * tragen es ja quasi im namen". Das stimmt, und es macht `entity` zur
 * **Tatsache**: welche Rolle eine Note erzeugt hat, weiß der Mux aus der
 * Verbindung (X-Mux-Entity), er muss es nicht schätzen.
 *
 * Phase und Entity korrelieren stark, sind aber nicht dasselbe — ein Debugger
 * schreibt auch Specs. Deshalb leitet ENTITY_PHASE_DEFAULT die Phase aus der
 * Entity nur **ab**, als Vorschlag, den ein Mensch überschreibt.
 */
export const TAG_AXES = ['workspace', 'entity', 'kind', 'phase', 'status'] as const
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
  // Aus der Messung des Bestands am 2026-09-30 nachgetragen. Diese drei Typen
  // waren da, bevor es die Achse gab, und zwar in Mengen, die sich nicht in
  // einen benachbarten Wert pressen lassen: 63 Wellenplaene und 36 Fix-Plaene
  // sind Plaene, 59 Abschlussberichte sind Berichte, 24 Walkthroughs und 7
  // Guides sind Anleitungen. Eine geschlossene Liste soll knapp sein, nicht
  // unvollständig.
  'plan', 'report', 'guide',
]

/** Phase des Arbeitsablaufs. Mehrere sind erlaubt — eine Note darf zwei berühren. */
export const PHASE_VALUES: readonly string[] = [
  'research', 'architecture', 'coding', 'testing', 'debugging', 'automation', 'monitoring',
]

/** Zustand. Ausschließend: zwei Zustände gleichzeitig sind keine Aussage. */
export const STATUS_VALUES: readonly string[] = [
  'open', 'in-progress', 'blocked', 'verify', 'done', 'superseded',
]

/**
 * Die Rollen, die Notes erzeugen. Deckungsgleich mit der Entity-Registry —
 * ein Test hält das fest, damit eine neue Rolle nicht stillschweigend
 * aus der Achse fällt.
 */
export const ENTITY_VALUES: readonly string[] = [
  'workshop', 'cyber-factory', 'launcher', 'companion', 'refinement',
  'ideation-partner', 'voice-relay', 'audit', 'debugger', 'testing-assistant',
]

/**
 * Welche Phase eine Rolle normalerweise bearbeitet.
 *
 * Ein **Vorschlag**, keine Gleichsetzung: ein Debugger schreibt auch Specs,
 * und eine Cyber Factory testet ihren eigenen Code. Wer hier einen Eintrag
 * nicht findet, bekommt keine Phase vorgeschlagen — das ist besser als eine
 * falsche.
 */
export const ENTITY_PHASE_DEFAULT: Readonly<Record<string, string>> = {
  'ideation-partner': 'research',
  refinement: 'architecture',
  'cyber-factory': 'coding',
  'testing-assistant': 'testing',
  debugger: 'debugging',
  audit: 'monitoring',
  workshop: 'automation',
}

export const AXIS_VALUES: Partial<Record<TagAxis, readonly string[]>> = {
  kind: KIND_VALUES,
  entity: ENTITY_VALUES,
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
export const EXCLUSIVE_AXES: readonly TagAxis[] = ['kind', 'status', 'entity']

/**
 * Achsen, die der Prozess setzt und niemand schätzt.
 *
 * Beide sind Tatsachen über die Herkunft einer Note, keine Einschätzungen ihres
 * Inhalts: der Workspace kommt aus der Verbindung, die Entity aus dem Kopf
 * X-Mux-Entity. Ein Modell, das den Workspace errät, hängt eine Note in ein
 * fremdes Projekt; eine Rolle, die eine andere Rolle einträgt, verfälscht die
 * Herkunft.
 *
 * In der Oberfläche heißt das: **anzeigen, nicht zur Auswahl stellen.**
 */
export const PROCESS_SET_AXES: readonly TagAxis[] = ['workspace', 'entity']

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

  const allowed = AXIS_VALUES[parts.axis as TagAxis]
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
    if ((PROCESS_SET_AXES as readonly string[]).includes(parts.axis)) continue

    const normalized = `${parts.axis}:${parts.value}`
    if (!isAxisTag(normalized) || seen.has(normalized)) continue

    if ((EXCLUSIVE_AXES as readonly string[]).includes(parts.axis)) {
      if (usedExclusive.has(parts.axis)) continue
      usedExclusive.add(parts.axis)
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

/** Werte einer Achse aus einer Tag-Liste lesen — ohne Klassenpräfix. */
export function axisTagsOf(tags: readonly string[], axis: TagAxis): string[] {
  const prefix = `${axis}:`
  return tags.filter(t => t.toLowerCase().startsWith(prefix)).map(t => t.slice(prefix.length))
}

/**
 * Einen Achsenwert an- oder abwählen — die Bewegung hinter einem Klick.
 *
 * Bei einer ausschließenden Achse **wechselt** die Auswahl, sie sammelt nicht:
 * ohne das entstehen Notes, die zugleich `status:open` und `status:done`
 * tragen, und das ist keine Aussage, sondern deren Abwesenheit.
 *
 * Tags außerhalb der Achsen bleiben stehen. Was jemand selbst vergeben hat
 * oder was aus alten Runs stammt, nimmt ihm die Auswahl nicht weg.
 */
export function toggleAxisTag(tags: readonly string[], tag: string): string[] {
  const parts = splitTag(tag)
  if (!parts || !isAxisTag(tag)) return [...tags]

  const normalized = `${parts.axis}:${parts.value}`
  if (tags.some(t => t.toLowerCase() === normalized)) {
    return tags.filter(t => t.toLowerCase() !== normalized)
  }

  const exclusive = (EXCLUSIVE_AXES as readonly string[]).includes(parts.axis)
  const kept = exclusive
    ? tags.filter(t => !t.toLowerCase().startsWith(`${parts.axis}:`))
    : [...tags]
  return [...kept, normalized]
}

/**
 * Tags, die der Prozess beim Anlegen einer Note setzt.
 *
 * Alles hier ist bekannt, nichts geschätzt: der Workspace aus der Verbindung,
 * die Entity aus ihrem Kopf, der Typ aus dem Aufruf. Die Phase wird aus der
 * Entity abgeleitet und ist das einzige Stück Vermutung — korrigierbar.
 */
export function processTagsFor(opts: {
  workspaceId?: string | null
  entityId?: string | null
  noteType?: string | null
}): string[] {
  const tags: string[] = []
  if (opts.workspaceId) tags.push(`workspace:${opts.workspaceId.toLowerCase()}`)
  if (opts.entityId && ENTITY_VALUES.includes(opts.entityId)) {
    tags.push(`entity:${opts.entityId}`)
    const phase = ENTITY_PHASE_DEFAULT[opts.entityId]
    if (phase) tags.push(`phase:${phase}`)
  }
  if (opts.noteType && KIND_VALUES.includes(opts.noteType)) tags.push(`kind:${opts.noteType}`)
  return tags
}
