// src/main/ideation-partner/anforderungspaket-generator.ts — Brain → Anforderungspaket
//
// Generates a structured requirements package from brain notes and brief.

import * as fs from 'fs'
import * as path from 'path'
import { ANFORDERUNGSPAKET_FIELDS } from './types'
import type { Anforderungspaket } from './types'

/**
 * Generate an Anforderungspaket markdown template from brain content.
 *
 * @param brainDir       Path to brain/ directory
 * @param projectName    Project name for the heading
 * @returns              Markdown string with template sections
 */
export function generateTemplate(brainDir: string, projectName: string): string {
  const lines: string[] = []
  lines.push(`# Anforderungs-Paket: ${projectName}`)
  lines.push('')
  lines.push('> Generiert aus Brain-Notes. Felder muessen vor Refinement-Handoff befuellt sein.')
  lines.push('')

  for (const field of ANFORDERUNGSPAKET_FIELDS) {
    lines.push(`## ${field}`)
    lines.push('')
    lines.push(`<!-- ${fieldHint(field)} -->`)
    lines.push('')
  }

  // Optional sections
  lines.push('## Referenz-Projekte')
  lines.push('')
  lines.push('<!-- Vorbilder, aehnliche Loesungen, OSS-Bausteine -->')
  lines.push('')
  lines.push('## Bekannte Risiken')
  lines.push('')
  lines.push('<!-- Was koennte schiefgehen? Pre-Mortem-Findings hier. -->')
  lines.push('')

  return lines.join('\n')
}

/**
 * Write the Anforderungspaket to disk.
 *
 * @param baseDir      Ideation run root directory
 * @param content      Markdown content (filled template)
 * @returns            Path to the written file
 */
export function writeAnforderungspaket(baseDir: string, content: string): string {
  const delDir = path.join(baseDir, 'deliverables')
  fs.mkdirSync(delDir, { recursive: true })
  const filepath = path.join(delDir, 'anforderungspaket.md')
  fs.writeFileSync(filepath, content, 'utf-8')
  return filepath
}

/**
 * Validate an Anforderungspaket markdown for completeness.
 *
 * @param content  Markdown content of the Anforderungspaket
 * @returns        Validation result with present/missing fields
 */
export function validateAnforderungspaket(content: string): Anforderungspaket {
  const lower = content.toLowerCase()
  const presentFields: string[] = []
  const missingFields: string[] = []

  for (const field of ANFORDERUNGSPAKET_FIELDS) {
    const fieldLower = field.toLowerCase()
    // Check for heading and non-empty content after it
    const hasHeading = lower.includes(`## ${fieldLower}`)
    const hasContent = hasHeading && hasNonEmptySection(content, field)

    if (hasContent) {
      presentFields.push(field)
    } else {
      missingFields.push(field)
    }
  }

  return {
    filepath: '',
    presentFields,
    missingFields,
    isComplete: missingFields.length === 0,
  }
}

/**
 * Check if a section has actual content (not just comments/whitespace).
 */
function hasNonEmptySection(content: string, sectionTitle: string): boolean {
  // Split content into sections by ## headings, find our section
  const lines = content.split('\n')
  let inSection = false
  const sectionLines: string[] = []

  for (const line of lines) {
    if (line.match(new RegExp(`^##\\s+${escapeRegex(sectionTitle)}`, 'i'))) {
      inSection = true
      continue
    }
    if (inSection && /^##\s+/.test(line)) {
      break // next section started
    }
    if (inSection) {
      sectionLines.push(line)
    }
  }

  const sectionContent = sectionLines.join('\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()

  return sectionContent.length > 0
}

function fieldHint(field: string): string {
  const hints: Record<string, string> = {
    'Projektziel': 'Was wird gebaut und warum? Ein Satz.',
    'Zielgruppe': 'Wer ist der primaere Nutzer? Persona oder Segment.',
    'Funktionale Anforderungen': 'Was kann das System? Liste mit MUST/SHOULD/COULD.',
    'Meta-Requirements': 'Stack, Plattform, Constraints, Dependencies.',
    'Wirksamkeits-Test': 'Wie weiss man, dass es fertig und korrekt ist?',
    'Ausgeschlossener Scope': 'Was wird bewusst NICHT gebaut?',
  }
  return hints[field] || `Bitte ${field} ergaenzen.`
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
