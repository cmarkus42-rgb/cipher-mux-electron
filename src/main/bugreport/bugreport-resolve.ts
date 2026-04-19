import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const BUGREPORT_BASE = path.join(os.homedir(), '.config', 'cipher-mux', 'bugreports')

export interface ResolveArgs {
  bugId: string
  status: 'fixed' | 'failed'
  summary: string
  branchName?: string
  filesChanged?: string[]
}

interface ResolveDirs {
  outboxDir?: string
  inboxDir?: string
}

export interface ResolveResult {
  ok: boolean
  inboxPath?: string
  error?: string
}

export async function resolveBugreport(
  args: ResolveArgs,
  dirs?: ResolveDirs
): Promise<ResolveResult> {
  const outboxDir = dirs?.outboxDir ?? path.join(BUGREPORT_BASE, 'outbox')
  const inboxDir = dirs?.inboxDir ?? path.join(BUGREPORT_BASE, 'inbox')

  const outboxFile = path.join(outboxDir, `${args.bugId}.md`)

  if (!fs.existsSync(outboxFile)) {
    return { ok: false, error: `Bugreport ${args.bugId} not found in outbox` }
  }

  const originalContent = fs.readFileSync(outboxFile, 'utf-8')

  // Extract body (everything after the closing ---)
  const frontmatterEnd = originalContent.indexOf('---', 4)
  const body = frontmatterEnd >= 0
    ? originalContent.slice(originalContent.indexOf('\n', frontmatterEnd) + 1)
    : originalContent

  // Build resolved frontmatter
  const now = new Date().toISOString()
  let frontmatter = `---
id: ${args.bugId}
status: ${args.status}
resolved: ${now}`

  if (args.branchName) {
    frontmatter += `\nbranchName: ${args.branchName}`
  }

  // Carry over project and projectPath from original
  const projectMatch = originalContent.match(/^project:\s*(.+)$/m)
  const projectPathMatch = originalContent.match(/^projectPath:\s*(.+)$/m)
  const createdMatch = originalContent.match(/^created:\s*(.+)$/m)

  if (projectMatch) frontmatter += `\nproject: ${projectMatch[1]}`
  if (projectPathMatch) frontmatter += `\nprojectPath: ${projectPathMatch[1]}`
  if (createdMatch) frontmatter += `\ncreated: ${createdMatch[1]}`

  frontmatter += '\n---'

  // Build result section
  let resultSection = `\n\n## Ergebnis\n\n**Status:** ${args.status}\n**Summary:** ${args.summary}`
  if (args.branchName) {
    resultSection += `\n**Branch:** ${args.branchName}`
  }
  if (args.filesChanged && args.filesChanged.length > 0) {
    resultSection += '\n**Geänderte Dateien:**'
    for (const f of args.filesChanged) {
      resultSection += `\n- ${f}`
    }
  }

  const inboxContent = frontmatter + body + resultSection + '\n'

  // Write inbox, delete outbox
  fs.mkdirSync(inboxDir, { recursive: true })
  const inboxPath = path.join(inboxDir, `${args.bugId}.md`)
  fs.writeFileSync(inboxPath, inboxContent, 'utf-8')
  fs.unlinkSync(outboxFile)

  return { ok: true, inboxPath }
}
