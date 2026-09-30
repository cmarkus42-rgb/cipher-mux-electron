/**
 * Outline of a spec note.
 *
 * The requirement was two words: readable, and easy to comment on. A spec note
 * therefore stays an editor — that is how corrections get written, and the
 * round trip through a handoff depends on the text being editable. Rendering
 * it read-only would have taken the work surface away to gain nothing.
 *
 * What long documents actually lack is orientation. The bestandsaufnahme has
 * seven sections, and in a scrolling text field none of them are visible at
 * once. So this derives the headings and nothing else: navigation, not a
 * second representation of the content.
 *
 * Derived rather than maintained. A table of contents somebody keeps by hand
 * is one more thing that can drift from the text — the same failure the whole
 * mirror mechanism exists to prevent.
 */

export interface SpecOutlineEntry {
  /** Heading depth, 1–6. */
  level: number
  title: string
  /** Zero-based line in the body, for jumping there. */
  line: number
}

// ATX headings only: one to six hashes, then a space. Setext (underlined with
// === or ---) is not used in this project's documents, and guessing at it
// would misread the frontmatter fence.
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const FENCE_RE = /^\s*(```|~~~)/

export function buildSpecOutline(body: string): SpecOutlineEntry[] {
  const entries: SpecOutlineEntry[] = []
  const lines = body.split('\n')
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // A '#' inside a fenced block is a comment in someone's shell snippet,
    // not a heading. Without this the outline of any spec containing a code
    // example fills up with its comments.
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = line.match(HEADING_RE)
    if (!match) continue

    // Closed ATX form: "## Titel ##" — the trailing hashes are decoration.
    const title = match[2].replace(/\s+#+\s*$/, '').trim()
    if (!title) continue

    entries.push({ level: match[1].length, title, line: i })
  }

  return entries
}
