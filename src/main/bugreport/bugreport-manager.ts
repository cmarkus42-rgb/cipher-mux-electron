import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import { ulid } from 'ulidx'
import type { BugreportData, SessionInfo } from '../../shared/types'
import { APP_VERSION } from '../../shared/constants'
import { runCommand } from '../util/exec-util'
import { parseEnrichedOutput, type EnrichedBugreport } from './ollama-client'
import { deliverToGitHub } from './github-delivery'
import type { MessageBus } from '../message-bus/message-bus'
import { BRAND } from '../../shared/brand'

const BUGREPORT_BASE = path.join(os.homedir(), '.config', BRAND.appName, 'bugreports')
const DEFAULT_OUTBOX_DIR = path.join(BUGREPORT_BASE, 'outbox')
const INBOX_DIR = path.join(BUGREPORT_BASE, 'inbox')
const ARCHIV_DIR = path.join(BUGREPORT_BASE, 'archiv')

export interface BugreportManagerOptions {
  messageBus?: MessageBus
  outboxDir?: string
}

function ensureDirs(outboxDir: string): void {
  for (const dir of [outboxDir, INBOX_DIR, ARCHIV_DIR]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

async function getTmuxVersion(): Promise<string | null> {
  try {
    return await runCommand('tmux', ['-V'], { timeout: 5000 })
  } catch {
    return null
  }
}

function getRecentLogs(maxLines = 100): string[] {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(logDir)) return []
    const files = fs.readdirSync(logDir)
      .filter((f) => f.endsWith('.log'))
      .sort()
      .reverse()
    if (files.length === 0) return []
    const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
    return content.split('\n').slice(-maxLines)
  } catch {
    return []
  }
}

export class BugreportManager {
  private messageBus: MessageBus | undefined
  private outboxDir: string

  constructor(opts: BugreportManagerOptions = {}) {
    this.messageBus = opts.messageBus
    this.outboxDir = opts.outboxDir ?? DEFAULT_OUTBOX_DIR
  }

  async collectDiagnostics(sessions: SessionInfo[]): Promise<BugreportData> {
    const tmuxVersion = await getTmuxVersion()
    return {
      appVersion: APP_VERSION,
      osVersion: `${os.type()} ${os.release()}`,
      electronVersion: process.versions.electron ?? 'unknown',
      nodeVersion: process.version,
      sessions,
      tmuxVersion,
      config: {},
      logs: getRecentLogs(),
      timestamp: Date.now(),
    }
  }

  async submit(
    description: string,
    sessions: SessionInfo[],
    project?: string,
    projectPath?: string,
    screenshots?: string[],
    reportType?: string,
    enriched?: EnrichedBugreport | null,
  ): Promise<string> {
    ensureDirs(this.outboxDir)
    const diagnostics = await this.collectDiagnostics(sessions)
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const type = reportType === 'feature-request' ? 'feature-request' : 'bug'
    const prefix = type === 'feature-request' ? 'FEA' : 'BUG'
    const id = `${prefix}-${dateStr}-${ulid().slice(-6)}`
    const filename = `${id}.md`
    const resolvedProjectPath = projectPath ?? process.cwd()

    // Copy screenshots to bugreport directory
    const copiedScreenshots: string[] = []
    if (screenshots && screenshots.length > 0) {
      const screenshotDir = path.join(this.outboxDir, `${id}-screenshots`)
      fs.mkdirSync(screenshotDir, { recursive: true })
      for (const src of screenshots) {
        const basename = path.basename(src)
        const dest = path.join(screenshotDir, basename)
        try {
          fs.copyFileSync(src, dest)
          copiedScreenshots.push(basename)
        } catch (err) {
          console.error(`[BugreportManager] Failed to copy screenshot ${src}:`, err)
        }
      }
    }

    const screenshotSection = copiedScreenshots.length > 0
      ? `\n## Screenshots\n\n${copiedScreenshots.map((f) => `![${f}](${id}-screenshots/${f})`).join('\n')}\n`
      : ''

    const content = `---
id: ${id}
type: ${type}
status: open
project: ${project ?? 'cipher-mux-electron'}
projectPath: ${resolvedProjectPath}
created: ${now.toISOString()}
---

## Beschreibung

${description}
${screenshotSection}
## Diagnostik

- **App-Version:** ${diagnostics.appVersion}
- **OS:** ${diagnostics.osVersion}
- **Electron:** ${diagnostics.electronVersion}
- **Node:** ${diagnostics.nodeVersion}
- **tmux:** ${diagnostics.tmuxVersion ?? 'nicht verfügbar'}
- **Aktive Sessions:** ${diagnostics.sessions.filter((s) => s.status === 'active').length}

### Sessions

${diagnostics.sessions.map((s) => `- ${s.name} (${s.status}) — ${s.tmuxSession}`).join('\n')}

### Letzte Logs

\`\`\`
${diagnostics.logs.slice(-50).join('\n')}
\`\`\`
`

    fs.writeFileSync(path.join(this.outboxDir, filename), content, 'utf-8')

    if (this.messageBus) {
      try {
        this.messageBus.send({
          topic: 'bug',
          sender: 'bugreport-manager',
          payload: { bugId: id, projectPath: resolvedProjectPath },
        })
      } catch (err) {
        console.error('[BugreportManager] Failed to send bug message:', err)
      }
    }

    // GitHub delivery — fire-and-forget, local outbox is the source of truth
    if (type === 'bug') {
      const issueTitle = enriched?.title ?? id
      const issueBody = enriched
        ? `## Summary\n\n${enriched.summary}\n\n## Steps to Reproduce\n\n${enriched.steps_to_reproduce.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n## Expected Behavior\n\n${enriched.expected_behavior}\n\n## Actual Behavior\n\n${enriched.actual_behavior}\n\n---\n*Filed via cipher-mux bugreport (${id})*`
        : `${description}\n\n---\n*Filed via cipher-mux bugreport (${id})*`
      deliverToGitHub(issueTitle, issueBody, enriched?.severity, enriched?.tags).then((result) => {
        if (result.issueUrl) {
          // Write issue URL back into the local outbox file
          try {
            const filePath = path.join(this.outboxDir, filename)
            const existing = fs.readFileSync(filePath, 'utf-8')
            fs.writeFileSync(filePath, existing.replace(/^---$/m, `githubIssue: ${result.issueUrl}\n---`), 'utf-8')
          } catch { /* non-critical */ }
        }
      }).catch((err) => {
        console.error('[BugreportManager] GitHub delivery failed:', err)
      })
    }

    return id
  }

  async processBugreport(
    description: string,
    sessionManager: any,
  ): Promise<EnrichedBugreport | null> {
    const TIMEOUT_MS = 120_000
    const POLL_INTERVAL_MS = 3_000
    const MARKER_START = '```yaml'
    const MARKER_END = '```'

    const session = await sessionManager.startEntity('bugreport')
    const tmuxSession = session.tmuxSession

    try {
      // Wait for Claude to be ready
      await new Promise(resolve => setTimeout(resolve, 10_000))

      // Send the description as prompt
      const escaped = description.replace(/'/g, "'\\''")
      await runCommand('tmux', [
        'send-keys', '-t', tmuxSession,
        `Verarbeite diesen Bugreport und gib das Ergebnis als YAML-Block aus:\n\n${escaped}`,
        'Enter',
      ], { timeout: 5000 })

      // Poll for structured output
      const startTime = Date.now()
      while (Date.now() - startTime < TIMEOUT_MS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        try {
          const capture = await runCommand('tmux', [
            'capture-pane', '-t', tmuxSession, '-p',
          ], { timeout: 5000 })
          const yamlStart = capture.lastIndexOf(MARKER_START)
          if (yamlStart !== -1) {
            const afterStart = capture.slice(yamlStart + MARKER_START.length)
            const yamlEnd = afterStart.indexOf(MARKER_END)
            if (yamlEnd !== -1) {
              const yamlText = afterStart.slice(0, yamlEnd).trim()
              const result = parseEnrichedOutput(yamlText)
              if (result) return result
            }
          }
        } catch { /* capture failed, retry */ }
      }
      return null
    } finally {
      try {
        await sessionManager.stop(session.id)
      } catch { /* session may already be gone */ }
    }
  }
}
