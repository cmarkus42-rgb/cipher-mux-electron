import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import { ulid } from 'ulidx'
import type { BugreportData, SessionInfo } from '../../shared/types'
import { APP_VERSION } from '../../shared/constants'
import { runCommand } from '../util/exec-util'

const BUGREPORT_BASE = path.join(os.homedir(), '.config', 'cipher-mux', 'bugreports')
const OUTBOX_DIR = path.join(BUGREPORT_BASE, 'outbox')
const INBOX_DIR = path.join(BUGREPORT_BASE, 'inbox')
const ARCHIV_DIR = path.join(BUGREPORT_BASE, 'archiv')

function ensureDirs(): void {
  for (const dir of [OUTBOX_DIR, INBOX_DIR, ARCHIV_DIR]) {
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

  async submit(description: string, sessions: SessionInfo[], project?: string): Promise<string> {
    ensureDirs()
    const diagnostics = await this.collectDiagnostics(sessions)
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const id = `BUG-${dateStr}-${ulid().slice(-6)}`
    const filename = `${id}.md`

    const content = `---
id: ${id}
status: open
project: ${project ?? 'cipher-mux-electron'}
created: ${now.toISOString()}
---

## Beschreibung

${description}

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

    fs.writeFileSync(path.join(OUTBOX_DIR, filename), content, 'utf-8')
    return id
  }
}
