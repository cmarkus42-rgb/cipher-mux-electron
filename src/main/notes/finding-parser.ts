/**
 * Findings as a note type.
 *
 * Strategy paper 7.1 asked where review findings, parked minors and knowingly
 * open gaps belong, and recorded that there was no good answer: as plain notes
 * they flood the list, in a separate table they are invisible, which
 * contradicts the goal of visible artefacts.
 *
 * The answer is the mechanism testcases already use — a note type with its own
 * view. Findings stay notes, so they remain readable, taggable and handable;
 * the type keeps them out of the general list and gives them a surface where
 * severity and status are visible at a glance.
 *
 * ── A lesson borrowed from the testcases ──────────────────────────────────
 *
 * The testcase note drifted: it became a wave-completion log, and 47 of its
 * 380 passing entries say in their own comment that they were ticked by
 * reading code rather than by using the app. A list loses its purpose when the
 * thing that fills it also judges it.
 *
 * Findings carry the same risk in mirror image — a role that finds something
 * and immediately marks it resolved has reviewed its own work. So:
 *
 *   - status lives in the checkbox, where a human can see and change it
 *   - severity is optional and never guessed; unspecified stays unspecified
 *   - `wont_fix` and `parked` are distinct on purpose: one is a decision, the
 *     other is a deferral, and collapsing them hides which one happened
 *
 * ── Format ────────────────────────────────────────────────────────────────
 *
 *   - [ ] **F-1** (high) Beschreibung — `src/main/x.ts:42` // Notiz
 *   - [ ] **F-2** (low) Kleinigkeit {parked}
 *   - [x] **F-3** Behoben
 *   - [-] **F-4** (medium) Bewusst offen gelassen
 *
 * Close to the testcase format on purpose: same checkbox, same bold id, same
 * ` // ` comment separator. Whoever knows one knows the other.
 */
import matter from 'gray-matter'

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low'
export type FindingStatus = 'open' | 'parked' | 'resolved' | 'wont_fix'

const SEVERITIES: readonly string[] = ['critical', 'high', 'medium', 'low']

export interface FindingItem {
  id: string
  description: string
  /** null when the note does not say — never guessed. */
  severity: FindingSeverity | null
  status: FindingStatus
  /** Repo-relative path the finding refers to, if named. */
  file: string | null
  /** Line within that file, if named. */
  line: number | null
  comment: string
  /** Line number in the note body, for round-tripping an edit. */
  lineIndex: number
}

export interface FindingSection {
  title: string
  items: FindingItem[]
}

export interface FindingFrontmatter {
  title?: string
  tags?: string[]
  type?: string
  created?: string
  modified?: string
}

export interface ParsedFinding {
  frontmatter: FindingFrontmatter
  sections: FindingSection[]
}

export interface FindingSummary {
  total: number
  open: number
  parked: number
  resolved: number
  wontFix: number
  /**
   * Severity counts for OPEN findings only. A resolved critical is not a
   * reason for a red badge, and counting it as one would make the summary
   * useless exactly when it matters.
   */
  openBySeverity: Record<FindingSeverity, number>
}

// - [ ] **F-1** rest   /   - [x] F-1 rest
const CHECKBOX_RE = /^-\s+\[([ x\-])\]\s+(?:\*\*(.+?)\*\*|(\S+))\s*(.*)/
const PARKED_RE = /\{parked\}\s*$/
// Leading (high) etc. Only consumed when it names a level we know.
const SEVERITY_RE = /^\(([a-z_-]+)\)\s*/
// Trailing — `path` or — `path:42`
const FILE_RE = /\s*[—-]\s*`([^`]+?)(?::(\d+))?`\s*$/

export function parseFindingItem(line: string, lineIndex: number): FindingItem | null {
  const match = line.match(CHECKBOX_RE)
  if (!match) return null

  const [, check, boldId, plainId, rest] = match
  const id = (boldId || plainId || '').trim()
  // An id needs at least one alphanumeric character. Without this a stray
  // `- [ ] **` parses as a finding whose id is two asterisks.
  if (!/[A-Za-z0-9]/.test(id)) return null

  let status: FindingStatus = check === 'x' ? 'resolved' : check === '-' ? 'wont_fix' : 'open'

  let text = rest

  // Comment first. The {parked} marker sits before it, so looking for the
  // marker at end-of-line while the comment is still attached only worked as
  // long as nobody wrote one — found by real content, not by a test.
  let comment = ''
  const commentSep = text.indexOf(' // ')
  if (commentSep !== -1) {
    comment = text.slice(commentSep + 4).trim()
    text = text.slice(0, commentSep).trimEnd()
  }

  // {parked} only means something for a finding still open. A resolved entry
  // carrying a stale marker is resolved — the checkbox is the stronger signal.
  const parkedMatch = text.match(PARKED_RE)
  if (parkedMatch) {
    text = text.slice(0, parkedMatch.index).trimEnd()
    if (status === 'open') status = 'parked'
  }

  // File reference at the end of the description
  let file: string | null = null
  let fileLine: number | null = null
  const fileMatch = text.match(FILE_RE)
  if (fileMatch) {
    file = fileMatch[1]
    fileLine = fileMatch[2] ? Number(fileMatch[2]) : null
    text = text.slice(0, fileMatch.index).trimEnd()
  }

  // Severity, only when it names a level we know. An unknown word stays part
  // of the description rather than disappearing into a field nobody reads.
  let severity: FindingSeverity | null = null
  const sevMatch = text.match(SEVERITY_RE)
  if (sevMatch && SEVERITIES.includes(sevMatch[1])) {
    severity = sevMatch[1] as FindingSeverity
    text = text.slice(sevMatch[0].length)
  }

  return {
    id,
    description: text.trim(),
    severity,
    status,
    file,
    line: fileLine,
    comment,
    lineIndex,
  }
}

const SECTION_RE = /^##\s+(.+)/

export function parseFindingBody(body: string): FindingSection[] {
  const lines = body.split('\n')
  const sections: FindingSection[] = []
  let current: FindingSection = { title: 'Allgemein', items: [] }
  let sawHeading = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    const sectionMatch = line.match(SECTION_RE)
    if (sectionMatch) {
      if (current.items.length > 0) sections.push(current)
      current = { title: sectionMatch[1].trim(), items: [] }
      sawHeading = true
      continue
    }

    const item = parseFindingItem(line, i)
    if (item) current.items.push(item)
  }

  if (current.items.length > 0) sections.push(current)
  // A note with headings but no findings is not a finding note.
  return sections.length === 0 && sawHeading ? [] : sections
}

export function parseFinding(raw: string): ParsedFinding | null {
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(raw)
  } catch {
    return null
  }

  const sections = parseFindingBody(parsed.content)
  // No findings means this is not a finding note, whatever the frontmatter says.
  if (sections.length === 0) return null

  return { frontmatter: parsed.data as FindingFrontmatter, sections }
}

export function summarizeFindings(sections: readonly FindingSection[]): FindingSummary {
  const summary: FindingSummary = {
    total: 0,
    open: 0,
    parked: 0,
    resolved: 0,
    wontFix: 0,
    openBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
  }

  for (const section of sections) {
    for (const item of section.items) {
      summary.total++
      switch (item.status) {
        case 'open':
          summary.open++
          if (item.severity) summary.openBySeverity[item.severity]++
          break
        case 'parked': summary.parked++; break
        case 'resolved': summary.resolved++; break
        case 'wont_fix': summary.wontFix++; break
      }
    }
  }

  return summary
}

/** Render a finding back to its line, byte-identical for anything parsed. */
export function serializeFindingItem(item: FindingItem): string {
  const box = item.status === 'resolved' ? 'x' : item.status === 'wont_fix' ? '-' : ' '
  const parts = [`- [${box}] **${item.id}**`]
  if (item.severity) parts.push(`(${item.severity})`)
  if (item.description) parts.push(item.description)

  let line = parts.join(' ')
  if (item.file) {
    line += ` — \`${item.file}${item.line !== null ? `:${item.line}` : ''}\``
  }
  if (item.status === 'parked') line += ' {parked}'
  if (item.comment) line += ` // ${item.comment}`
  return line
}
