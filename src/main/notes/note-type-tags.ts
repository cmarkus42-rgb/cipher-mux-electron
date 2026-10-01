import { filterToAxes } from '../../shared/tag-axes'

/**
 * Tags that carry a note's type — and survive auto-tagging.
 *
 * A typed note is recognised by its `kind:` tag: TestcaseView and FindingView
 * both key on it, and NoteManager derives `type` in the frontmatter from it.
 *
 * Auto-tagging replaces a note's tags wholesale. Its preserve-list named
 * exactly one type, `kind:testcase`, which was fine while that was the only
 * typed note and wrong the moment a second one existed. Observed on
 * 2026-09-30: a mirrored spec note came back tagged `kind:journal` while its
 * frontmatter still said `type: spec` — the tag and the type disagreeing is
 * precisely what makes a typed view lose its note.
 *
 * One list, not one special case per type. Adding a type means adding it here
 * and in NoteManager's derivation, which reads this same list.
 */

/** Note types a `kind:<type>` tag may set. */
export const TAG_DERIVED_NOTE_TYPES: readonly string[] = [
  'testcase',
  'finding',
  'spec',
  'requirements',
  'research',
]

/** Whether this tag sets a note type. */
export function isTypeCarryingTag(tag: string): boolean {
  if (!tag.startsWith('kind:')) return false
  return TAG_DERIVED_NOTE_TYPES.includes(tag.slice('kind:'.length))
}

/** The note type a tag list declares, if any. */
export function deriveTypeFromTags(tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    if (isTypeCarryingTag(tag)) return tag.slice('kind:'.length)
  }
  return undefined
}

/**
 * Merge auto-generated tags into a note's existing ones without losing what
 * carries meaning.
 *
 * Kept from the existing tags: the type, every axis the process sets (workspace
 * and entity — the note's origin), the handoff marker. Dropped from the auto
 * tags: any `kind:` tag, when the note already has a type — two kind tags would
 * make the type ambiguous, and the one the note was created with wins over one
 * a model guessed.
 *
 * **Die Regel ist umgedreht, und das ist der Punkt:** erhalten wird, was das
 * Auto-Tagging überhaupt nicht *vorschlagen* kann. Das entscheidet
 * `filterToAxes`, und damit ist es keine Liste, die jemand pflegen müsste.
 *
 * Dieselbe Falle ist dreimal zugeschnappt, jedes Mal als Aufzählung:
 *
 *  1. Die Erhaltungsliste nannte nur `kind:testcase` — jeder andere Notentyp
 *     ging beim Auto-Tagging verloren.
 *  2. Sie nannte `workspace:`, und als `entity` als Achse dazukam, hätte das
 *     Tagging die Herkunft überschrieben.
 *  3. Sie nannte die Prozess-Achsen, und `severity` und `component` standen
 *     nicht drin — also genau die Werte, die ein Mensch von Hand gewählt hat.
 *
 * Eine Liste, die beim Hinzufügen einer Klasse gepflegt werden muss, ist beim
 * nächsten Mal wieder unvollständig. Die Umkehrung kann nicht veralten.
 *
 * Preserved tags come first so a downstream tag limit truncates the
 * replaceable ones rather than the structural ones.
 */
export function preserveTypeTags(
  existing: readonly string[],
  autoTags: readonly string[],
): string[] {
  const preserved = existing.filter(t =>
    // Der Typ bleibt immer: zwei kind-Tags machen den Typ mehrdeutig.
    isTypeCarryingTag(t)
    // Und alles, was das Tagging nicht vorschlagen kann — Workspace und Entity
    // (Prozess-Tatsachen), severity und component (Registry-Klassen), freie
    // Schlagworte, der flache `handoff`-Marker.
    || filterToAxes([t]).length === 0,
  )
  const hasType = preserved.some(isTypeCarryingTag)
  const incoming = hasType
    ? autoTags.filter(t => !t.startsWith('kind:'))
    : autoTags

  return [...new Set([...preserved, ...incoming])]
}
