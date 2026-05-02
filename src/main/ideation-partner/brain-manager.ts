// src/main/ideation-partner/brain-manager.ts — Brain directory management
//
// Manages the brain/ directory for an ideation run: init, note CRUD, index.

import * as fs from 'fs'
import * as path from 'path'
import type { BrainNote } from './types'

const INDEX_FILE = '_index.md'
const BRAIN_SUBDIR = 'brain'

/**
 * Initialize a new ideation working directory with brain/ subdirectory.
 *
 * @param baseDir   The ideation run's root directory
 * @returns         Path to the brain/ directory
 */
export function initBrainDir(baseDir: string): string {
  const brainDir = path.join(baseDir, BRAIN_SUBDIR)
  fs.mkdirSync(brainDir, { recursive: true })

  // Create initial index if it doesn't exist
  const indexPath = path.join(brainDir, INDEX_FILE)
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, '# Brain Index\n\nArgumentations-Geruest fuer diese Ideation.\n', 'utf-8')
  }

  // Create deliverables/ directory
  const deliverablesDir = path.join(baseDir, 'deliverables')
  fs.mkdirSync(deliverablesDir, { recursive: true })

  return brainDir
}

/**
 * Create a new note in the brain directory.
 *
 * @param brainDir  Path to brain/
 * @param title     Note title (used as filename slug and H1 heading)
 * @param content   Markdown body (without title heading)
 * @returns         The created BrainNote
 */
export function createNote(brainDir: string, title: string, content: string): BrainNote {
  const slug = slugify(title)
  const filepath = path.join(brainDir, `${slug}.md`)
  const fullContent = `# ${title}\n\n${content}`

  fs.writeFileSync(filepath, fullContent, 'utf-8')

  return {
    id: slug,
    title,
    filepath,
    createdAt: Date.now(),
  }
}

/**
 * List all notes in the brain directory.
 */
export function listNotes(brainDir: string): BrainNote[] {
  if (!fs.existsSync(brainDir)) return []

  const files = fs.readdirSync(brainDir).filter(f =>
    f.endsWith('.md') && f !== INDEX_FILE
  )

  return files.map(f => {
    const filepath = path.join(brainDir, f)
    const content = fs.readFileSync(filepath, 'utf-8')
    const title = extractTitle(content, f)
    const stat = fs.statSync(filepath)

    return {
      id: f.replace('.md', ''),
      title,
      filepath,
      createdAt: stat.birthtimeMs,
    }
  })
}

/**
 * Read a note's content by its ID (filename without .md).
 */
export function readNote(brainDir: string, noteId: string): string | null {
  const filepath = path.join(brainDir, `${noteId}.md`)
  try {
    return fs.readFileSync(filepath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Update the brain index file with current note titles and wiki-links.
 */
export function updateIndex(brainDir: string): void {
  const notes = listNotes(brainDir)
  const lines = ['# Brain Index', '', 'Argumentations-Geruest fuer diese Ideation.', '']

  for (const note of notes) {
    lines.push(`- [[${note.id}]] — ${note.title}`)
  }

  const indexPath = path.join(brainDir, INDEX_FILE)
  fs.writeFileSync(indexPath, lines.join('\n') + '\n', 'utf-8')
}

/**
 * Check if a sub-agent note has the required uncertainty markers.
 *
 * @param content       Note markdown content
 * @param requiredCount Number of uncertainty markers required (default: 3)
 * @returns             Object with count and whether requirement is met
 */
export function checkUncertaintyMarkers(content: string, requiredCount = 3): { count: number; sufficient: boolean } {
  // Match patterns like [unsicher], [unklar], [nicht verifiziert], **unsicher**, (?), etc.
  const markers = content.match(/\[unsicher\]|\[unklar\]|\[nicht verifiziert\]|\[ungesichert\]|\(\?\)|\*\*unsicher\*\*|\*\*unklar\*\*/gi)
  const count = markers?.length ?? 0
  return { count, sufficient: count >= requiredCount }
}

function extractTitle(content: string, filename: string): string {
  const firstLine = content.split('\n').find(l => l.startsWith('#'))
  if (firstLine) {
    return firstLine.replace(/^#+\s*/, '').trim()
  }
  return filename.replace('.md', '')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}
