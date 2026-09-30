/**
 * Anforderungen als Note-Typ.
 *
 * Requirements sind das interne Dokument, aus dem die offiziellen Specs
 * hervorgehen — die Spec ist das Ergebnis, nicht die Quelle. Sie dürfen nach
 * RE-Methoden mit Schema erfasst werden, unter zwei Bedingungen: gut lesbar
 * und gut kommentierbar.
 *
 * Daraus folgt das Format. Kein YAML-Block pro Anforderung: der wäre
 * strukturiert und unlesbar, und man könnte nicht eben eine Bemerkung
 * danebenschreiben. Stattdessen eine Zeile pro Anforderung, in derselben
 * Bauweise wie Testcases und Befunde — wer eines kennt, kennt alle:
 *
 *   - [ ] **R-1** (muss) Text [Quelle] {weil: Begründung} // Notiz
 *
 * Die Felder in der Reihenfolge ihrer Wichtigkeit beim Lesen: Zustand,
 * Nummer, Priorität, Aussage. Alles Weitere steht hinten und darf fehlen.
 *
 * Zwei Entscheidungen, die von den Befunden übernommen sind:
 *
 *  - Der Zustand steckt in der Checkbox, wo ein Mensch ihn sieht und ändert.
 *    Wer eine Anforderung erhebt, soll sie nicht im selben Zug als erfüllt
 *    abhaken — dieselbe Trennung, die bei den Testcases verlorenging.
 *  - Nichts wird geraten. Eine fehlende Priorität bleibt leer, statt
 *    stillschweigend „soll" zu werden.
 *
 * Priorität ist MoSCoW in deutschen Worten, weil die Dokumente deutsch sind.
 */
import matter from 'gray-matter'

export type RequirementPriority = 'muss' | 'soll' | 'kann'
export type RequirementStatus = 'offen' | 'teilweise' | 'erfuellt' | 'verworfen'

const PRIORITIES: readonly string[] = ['muss', 'soll', 'kann']

export interface RequirementItem {
  id: string
  text: string
  /** null, wenn die Zeile keine nennt — nie geraten. */
  priority: RequirementPriority | null
  status: RequirementStatus
  /** Woher die Anforderung stammt: Gespräch, Dokument, Befund. */
  source: string | null
  /** Warum es sie gibt. Das Feld, das nach Monaten den Unterschied macht. */
  rationale: string | null
  comment: string
  lineIndex: number
}

export interface RequirementSection {
  title: string
  items: RequirementItem[]
}

export interface ParsedRequirements {
  frontmatter: { title?: string; tags?: string[]; type?: string }
  sections: RequirementSection[]
}

export interface RequirementsSummary {
  total: number
  offen: number
  teilweise: number
  erfuellt: number
  verworfen: number
  /**
   * Offene Muss-Anforderungen. Die Zahl, an der Fertigsein hängt: eine offene
   * Muss-Anforderung heißt nicht fertig, eine offene Kann-Anforderung nicht.
   */
  offeneMuss: number
}

const CHECKBOX_RE = /^-\s+\[([ x~\-])\]\s+(?:\*\*(.+?)\*\*|(\S+))\s*(.*)/
const PRIORITY_RE = /^\(([a-zäöü]+)\)\s*/
const RATIONALE_RE = /\{weil:\s*([^}]*)\}\s*$/
const SOURCE_RE = /\[([^\]]+)\]\s*$/

const STATUS_BY_BOX: Record<string, RequirementStatus> = {
  ' ': 'offen',
  '~': 'teilweise',
  'x': 'erfuellt',
  '-': 'verworfen',
}

const BOX_BY_STATUS: Record<RequirementStatus, string> = {
  offen: ' ',
  teilweise: '~',
  erfuellt: 'x',
  verworfen: '-',
}

export function parseRequirementItem(line: string, lineIndex: number): RequirementItem | null {
  const match = line.match(CHECKBOX_RE)
  if (!match) return null

  const [, box, boldId, plainId, rest] = match
  const id = (boldId || plainId || '').trim()
  if (!/[A-Za-z0-9]/.test(id)) return null

  const status = STATUS_BY_BOX[box] ?? 'offen'
  let text = rest

  // Von hinten abtragen: Notiz, Begründung, Quelle. Die Reihenfolge ist die
  // umgekehrte der Schreibweise, damit jeder Teil am Zeilenende steht, wenn er
  // dran ist.
  let comment = ''
  const commentSep = text.indexOf(' // ')
  if (commentSep !== -1) {
    comment = text.slice(commentSep + 4).trim()
    text = text.slice(0, commentSep).trimEnd()
  }

  let rationale: string | null = null
  const ratMatch = text.match(RATIONALE_RE)
  if (ratMatch) {
    rationale = ratMatch[1].trim()
    text = text.slice(0, ratMatch.index).trimEnd()
  }

  let source: string | null = null
  const srcMatch = text.match(SOURCE_RE)
  if (srcMatch) {
    source = srcMatch[1].trim()
    text = text.slice(0, srcMatch.index).trimEnd()
  }

  let priority: RequirementPriority | null = null
  const prioMatch = text.match(PRIORITY_RE)
  if (prioMatch && PRIORITIES.includes(prioMatch[1])) {
    priority = prioMatch[1] as RequirementPriority
    text = text.slice(prioMatch[0].length)
  }

  return { id, text: text.trim(), priority, status, source, rationale, comment, lineIndex }
}

const SECTION_RE = /^##\s+(.+)/

export function parseRequirementsBody(body: string): RequirementSection[] {
  const lines = body.split('\n')
  const sections: RequirementSection[] = []
  let current: RequirementSection = { title: 'Allgemein', items: [] }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const sectionMatch = line.match(SECTION_RE)
    if (sectionMatch) {
      if (current.items.length > 0) sections.push(current)
      current = { title: sectionMatch[1].trim(), items: [] }
      continue
    }
    const item = parseRequirementItem(line, i)
    if (item) current.items.push(item)
  }
  if (current.items.length > 0) sections.push(current)
  return sections
}

export function parseRequirements(raw: string): ParsedRequirements | null {
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(raw)
  } catch {
    return null
  }
  const sections = parseRequirementsBody(parsed.content)
  if (sections.length === 0) return null
  return { frontmatter: parsed.data as ParsedRequirements['frontmatter'], sections }
}

export function summarizeRequirements(
  sections: readonly RequirementSection[],
): RequirementsSummary {
  const s: RequirementsSummary = {
    total: 0, offen: 0, teilweise: 0, erfuellt: 0, verworfen: 0, offeneMuss: 0,
  }
  for (const section of sections) {
    for (const item of section.items) {
      s.total++
      s[item.status]++
      // Teilweise erfüllt heißt nicht erfüllt — eine Muss-Anforderung zählt
      // solange als offen, bis sie ganz steht.
      if (item.priority === 'muss' && (item.status === 'offen' || item.status === 'teilweise')) {
        s.offeneMuss++
      }
    }
  }
  return s
}

/** Schreibt eine Anforderung zurück, byteidentisch für alles Gelesene. */
export function serializeRequirementItem(item: RequirementItem): string {
  const parts = [`- [${BOX_BY_STATUS[item.status]}] **${item.id}**`]
  if (item.priority) parts.push(`(${item.priority})`)
  if (item.text) parts.push(item.text)

  let line = parts.join(' ')
  if (item.source) line += ` [${item.source}]`
  if (item.rationale) line += ` {weil: ${item.rationale}}`
  if (item.comment) line += ` // ${item.comment}`
  return line
}
