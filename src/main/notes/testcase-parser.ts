// src/main/notes/testcase-parser.ts
// Parser for markdown testcase notes (type: testcase in frontmatter).
// Format: sections with checkbox items, tri-state (unchecked/PASS/FAIL).

import matter from 'gray-matter'

// ─── Types ──────────────────────────────────────────────────

export type TestcaseStatus = 'open' | 'pass' | 'fail'

export interface TestcaseItem {
  id: string             // e.g. "T-UI.1"
  description: string    // text after the ID
  status: TestcaseStatus
  comment: string        // user comment (appended after description)
  screenshotRef?: string // relative path to screenshot file
  lineIndex: number      // 0-based line index in original markdown
}

export interface TestcaseSection {
  title: string
  items: TestcaseItem[]
}

export interface TestcaseFrontmatter {
  title: string
  type: 'testcase'
  version?: string
  created?: string
  source?: string
  archived?: boolean
  archivedAt?: string
  summary?: string
}

export interface ParsedTestcase {
  frontmatter: TestcaseFrontmatter
  sections: TestcaseSection[]
  rawBody: string
}

export interface TestcaseSummary {
  total: number
  pass: number
  fail: number
  open: number
}

// ─── Parser ─────────────────────────────────────────────────

// Checkbox patterns:
// - [ ] **T-ID.N** Description         → open
// - [x] **T-ID.N** Description         → pass
// - [-] **T-ID.N** Description         → fail
// Also supports without bold: - [ ] T-ID.N Description

const CHECKBOX_RE = /^-\s+\[([ x\-])\]\s+(?:\*\*(.+?)\*\*|(\S+))\s*(.*)/

export function parseTestcaseItem(line: string, lineIndex: number): TestcaseItem | null {
  const match = line.match(CHECKBOX_RE)
  if (!match) return null

  const [, check, boldId, plainId, rest] = match
  const id = (boldId || plainId || '').trim()
  if (!id) return null

  let status: TestcaseStatus = 'open'
  if (check === 'x') status = 'pass'
  else if (check === '-') status = 'fail'

  // Split rest into description and comment (comment after " // " or " — ")
  let description = rest
  let comment = ''
  const commentSep = rest.indexOf(' // ')
  if (commentSep !== -1) {
    description = rest.slice(0, commentSep).trim()
    comment = rest.slice(commentSep + 4).trim()
  }

  // Screenshot ref: ![screenshot](path)
  let screenshotRef: string | undefined
  const imgMatch = comment.match(/!\[.*?\]\((.+?)\)/)
  if (imgMatch) {
    screenshotRef = imgMatch[1]
  }

  return { id, description, status, comment, screenshotRef, lineIndex }
}

const SECTION_RE = /^##\s+(.+)/

export function parseTestcaseBody(body: string): TestcaseSection[] {
  const lines = body.split('\n')
  const sections: TestcaseSection[] = []
  let currentSection: TestcaseSection = { title: 'General', items: [] }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Section heading
    const sectionMatch = line.match(SECTION_RE)
    if (sectionMatch) {
      if (currentSection.items.length > 0 || currentSection.title !== 'General') {
        sections.push(currentSection)
      }
      currentSection = { title: sectionMatch[1].trim(), items: [] }
      continue
    }

    // Checkbox item
    const item = parseTestcaseItem(line, i)
    if (item) {
      currentSection.items.push(item)
    }
  }

  // Push last section
  if (currentSection.items.length > 0) {
    sections.push(currentSection)
  }

  return sections
}

export function parseTestcase(raw: string): ParsedTestcase | null {
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(raw)
  } catch {
    return null
  }

  const fm = parsed.data as Record<string, unknown>
  if (fm.type !== 'testcase') return null

  const frontmatter: TestcaseFrontmatter = {
    title: (fm.title as string) ?? 'Untitled Testcase',
    type: 'testcase',
    version: fm.version as string | undefined,
    created: fm.created as string | undefined,
    source: fm.source as string | undefined,
    archived: fm.archived as boolean | undefined,
    archivedAt: fm.archivedAt as string | undefined,
    summary: fm.summary as string | undefined,
  }

  const sections = parseTestcaseBody(parsed.content)

  return {
    frontmatter,
    sections,
    rawBody: parsed.content,
  }
}

// ─── Summary ────────────────────────────────────────────────

export function summarizeTestcase(sections: TestcaseSection[]): TestcaseSummary {
  let total = 0, pass = 0, fail = 0, open = 0
  for (const section of sections) {
    for (const item of section.items) {
      total++
      if (item.status === 'pass') pass++
      else if (item.status === 'fail') fail++
      else open++
    }
  }
  return { total, pass, fail, open }
}

// ─── Serializer ─────────────────────────────────────────────

function statusToCheckbox(status: TestcaseStatus): string {
  if (status === 'pass') return '[x]'
  if (status === 'fail') return '[-]'
  return '[ ]'
}

export function serializeTestcaseItem(item: TestcaseItem): string {
  let line = `- ${statusToCheckbox(item.status)} **${item.id}** ${item.description}`
  if (item.comment) {
    line += ` // ${item.comment}`
  }
  return line
}

export function serializeTestcaseBody(sections: TestcaseSection[]): string {
  const parts: string[] = []
  for (const section of sections) {
    parts.push(`## ${section.title}`)
    for (const item of section.items) {
      parts.push(serializeTestcaseItem(item))
    }
    parts.push('')
  }
  return parts.join('\n')
}

export function serializeTestcase(tc: ParsedTestcase): string {
  const body = serializeTestcaseBody(tc.sections)
  return matter.stringify('\n' + body, tc.frontmatter as Record<string, unknown>)
}

// ─── Detect ─────────────────────────────────────────────────

export function isTestcaseNote(raw: string): boolean {
  try {
    const parsed = matter(raw)
    return parsed.data.type === 'testcase'
  } catch {
    return false
  }
}
