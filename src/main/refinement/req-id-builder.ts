// src/main/refinement/req-id-builder.ts — REQ-ID generator for detail specs
//
// Generates requirement IDs in the schema REQ-<Subsystem>-<Number> and
// produces formatted markdown blocks with acceptance criteria templates.

export interface Requirement {
  subsystem: string
  title: string
  acceptanceCriteria?: string[]
  testPath?: string
  offLimits?: string
}

export interface ReqIdEntry {
  id: string
  subsystem: string
  number: number
  title: string
  acceptanceCriteria: string[]
  testPath: string
  offLimits: string | null
}

/**
 * Generate REQ-IDs for a list of requirements.
 *
 * @param requirements  List of requirements to assign IDs
 * @param startNumber   Starting number for sequential IDs (default: 1)
 * @returns             List of entries with assigned REQ-IDs
 */
export function generateReqIds(requirements: Requirement[], startNumber = 1): ReqIdEntry[] {
  const counters = new Map<string, number>()
  const entries: ReqIdEntry[] = []

  for (const req of requirements) {
    const sub = normalizeSubsystem(req.subsystem)
    const num = counters.get(sub) ?? startNumber
    counters.set(sub, num + 1)

    const id = `REQ-${sub}-${String(num).padStart(3, '0')}`
    entries.push({
      id,
      subsystem: sub,
      number: num,
      title: req.title,
      acceptanceCriteria: req.acceptanceCriteria ?? [],
      testPath: req.testPath ?? `tests/${sub.toLowerCase()}/${slugify(req.title)}.test.ts`,
      offLimits: req.offLimits ?? null,
    })
  }

  return entries
}

/**
 * Format a single REQ-ID entry as markdown block (hardwired format for Cyber Factory).
 */
export function formatReqIdMarkdown(entry: ReqIdEntry): string {
  const lines: string[] = []
  lines.push(`### ${entry.id} · ${entry.title}`)
  lines.push('')
  lines.push('**Akzeptanzkriterien:**')
  if (entry.acceptanceCriteria.length > 0) {
    for (const crit of entry.acceptanceCriteria) {
      lines.push(`- [ ] ${crit}`)
    }
  } else {
    lines.push('- [ ] (Akzeptanzkriterien ergaenzen)')
  }
  lines.push('')
  lines.push(`**Tests:** \`${entry.testPath}\``)
  if (entry.offLimits) {
    lines.push(`**Off-Limits:** ${entry.offLimits}`)
  }
  return lines.join('\n')
}

/**
 * Format all entries as a complete detail spec section.
 */
export function formatDetailSpec(entries: ReqIdEntry[], subsystemTitle?: string): string {
  const lines: string[] = []
  if (subsystemTitle) {
    lines.push(`## ${subsystemTitle}`)
    lines.push('')
  }
  for (const entry of entries) {
    lines.push(formatReqIdMarkdown(entry))
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Validate that all entries have unique IDs and non-empty titles.
 */
export function validateReqIds(entries: ReqIdEntry[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      errors.push(`Duplicate REQ-ID: ${entry.id}`)
    }
    seen.add(entry.id)

    if (!entry.title.trim()) {
      errors.push(`Empty title for ${entry.id}`)
    }

    if (entry.acceptanceCriteria.length === 0) {
      errors.push(`No acceptance criteria for ${entry.id}`)
    }
  }

  return errors
}

/** Normalize subsystem prefix to uppercase, max 4 chars. */
function normalizeSubsystem(sub: string): string {
  return sub.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
}

/** Simple slug for test file paths. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}
