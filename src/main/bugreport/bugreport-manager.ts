import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import { ulid } from 'ulidx'
import type { BugreportData, SessionInfo } from '../../shared/types'
import { APP_VERSION } from '../../shared/constants'
import { runCommand } from '../util/exec-util'
import { enrichBugreport, type EnrichedBugreport } from './ollama-client'
import type { MessageBus } from '../message-bus/message-bus'

const BUGREPORT_BASE = path.join(os.homedir(), '.config', 'cipher-mux', 'bugreports')
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
  ): Promise<string> {
    ensureDirs(this.outboxDir)
    const diagnostics = await this.collectDiagnostics(sessions)
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const id = `BUG-${dateStr}-${ulid().slice(-6)}`
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

    return id
  }

  async enrich(description: string): Promise<EnrichedBugreport | null> {
    return enrichBugreport(description)
  }
}
