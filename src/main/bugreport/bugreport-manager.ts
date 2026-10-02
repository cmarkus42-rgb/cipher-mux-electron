import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import { ulid } from 'ulidx'
import type { BugreportData, SessionInfo } from '../../shared/types'
import { APP_VERSION } from '../../shared/constants'
import { runCommand } from '../util/exec-util'
import { deliverToGitHub } from './github-delivery'
import { enrichBugreport, baueReportText } from './enrich'
import { sammleSchnappschuesse, schnappschuesseAlsMarkdown } from './session-snapshot'
import type { MessageBus } from '../message-bus/message-bus'
import { BRAND } from '../../shared/brand'

const BUGREPORT_BASE = path.join(os.homedir(), '.config', BRAND.appName, 'bugreports')
const DEFAULT_OUTBOX_DIR = path.join(BUGREPORT_BASE, 'outbox')
const INBOX_DIR = path.join(BUGREPORT_BASE, 'inbox')
const ARCHIV_DIR = path.join(BUGREPORT_BASE, 'archiv')

export interface BugreportManagerOptions {
  messageBus?: MessageBus
  outboxDir?: string
  /**
   * Ablage fuer die Notiz zum Report. Optional, weil der Manager auch ohne
   * Notes-System arbeiten koennen muss — die Datei in der outbox ist der
   * verlaessliche Teil, die Notiz der bequeme.
   *
   * **Als Funktion, nicht als Instanz.** Im `IpcHub` entsteht der
   * `BugreportManager` vor dem `NoteManager`; eine direkt uebergebene Instanz
   * waere dort `undefined` — und zwar still: es gaebe nie eine Notiz, ohne Fehler
   * und ohne Hinweis. Die Funktion wird erst beim Absenden ausgewertet, da steht
   * alles.
   */
  noteManager?: () => NoteAblage | undefined
}

/**
 * Der Ausschnitt des NoteManagers, den der Bugreport braucht.
 *
 * Bewusst ein eigener Typ und kein Import der Klasse: so haengt der
 * Bugreport-Pfad nicht am ganzen Notes-Modul, und der Test kann eine Attrappe
 * einsetzen, ohne eine SQLite-Datenbank aufzumachen.
 */
export interface NoteAblage {
  create(
    title: string,
    body: string,
    tags?: string[],
    opts?: { type?: string; mirrorsFile?: string; mirrorCommit?: string; anchorRepo?: string },
  ): Promise<{ id: string }>
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
  private noteManager: (() => NoteAblage | undefined) | undefined

  constructor(opts: BugreportManagerOptions = {}) {
    this.messageBus = opts.messageBus
    this.outboxDir = opts.outboxDir ?? DEFAULT_OUTBOX_DIR
    this.noteManager = opts.noteManager
  }

  /**
   * Commit, auf dem der Fehler auftrat.
   *
   * Der Anker ist das eine Stueck Weltzustand, das sich spaeter nicht mehr
   * rekonstruieren laesst: welcher Stand lief, als es kaputt war. Alles andere
   * (Diff, Logs, Dateien) laesst sich daraus herleiten — ohne ihn nicht.
   */
  private async ankerCommit(cwd: string): Promise<string | null> {
    try {
      const out = await runCommand('git', ['rev-parse', 'HEAD'], { cwd })
      const sha = out.trim()
      return /^[0-9a-f]{40}$/.test(sha) ? sha : null
    } catch {
      return null
    }
  }

  /**
   * Die Notiz zum Report anlegen.
   *
   * **Spiegelt die Datei**, statt sie zu ersetzen: `mirrors_file` zeigt auf die
   * `.md` in der outbox, `mirror_commit` traegt den Anker. Damit sieht das
   * Notes-System die Drift, falls die Datei spaeter von Hand geaendert wird —
   * sichtbare Abweichung statt behaupteter Autoritaet
   * (`notes/mirror-drift.ts`).
   *
   * Wirft nicht. Eine fehlende Notiz ist aergerlich, ein verlorener Bugreport
   * nicht hinnehmbar — die Datei ist zu diesem Zeitpunkt schon geschrieben.
   */
  private async legeNotizAn(opts: {
    id: string
    titel: string
    koerper: string
    severity?: string
    datei: string
    anker: string | null
    projektPfad: string
  }): Promise<string | null> {
    const ablage = this.noteManager?.()
    if (!ablage) return null
    try {
      // Nur Tags aus den bekannten Achsen — `mux_notes_create` weist alles
      // andere hart ab, und ein abgewiesener Tag kostet die ganze Notiz.
      const tags = ['kind:bugreport', 'status:open']
      const sev = (opts.severity ?? '').trim().toLowerCase()
      if (['low', 'mid', 'hi', 'now'].includes(sev)) tags.push(`severity:${sev}`)
      const note = await ablage.create(
        `${opts.id} — ${opts.titel}`,
        opts.koerper,
        tags,
        {
          type: 'bugreport',
          mirrorsFile: opts.datei,
          ...(opts.anker ? { mirrorCommit: opts.anker } : {}),
          anchorRepo: opts.projektPfad,
        },
      )
      return note.id
    } catch (err) {
      console.error('[BugreportManager] Notiz konnte nicht angelegt werden:', err)
      return null
    }
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
  ): Promise<{ id: string; issueUrl?: string; noteId?: string }> {
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

    // **Diktat aufraeumen.** Laeuft vor dem Schreiben, blockiert aber nichts:
    // `enrichBugreport` wirft nie, sondern liefert im Zweifel einen Grund, und
    // `baueReportText` macht daraus einen Report mit sichtbarem Vermerk. Ein
    // Bugreport, der an seiner Veredelung scheitert, waere der schlechteste Fall.
    const angereichert = await enrichBugreport(description, { typ: type })
    const beschreibung = baueReportText(description, angereichert)
    const titel = angereichert.enriched?.title ?? description.trim().split('\n')[0].slice(0, 80)

    // **Panezustand im Moment der Meldung.** Ohne diese Gleichzeitigkeit laesst
    // sich „falsch gezeichnet" nicht von „falscher Inhalt" trennen — siehe
    // `session-snapshot.ts`.
    let panezustand = ''
    try {
      const namen = sessions.filter((x) => x.status === 'active').map((x) => x.tmuxSession).filter(Boolean)
      panezustand = schnappschuesseAlsMarkdown(await sammleSchnappschuesse(namen))
    } catch (err) {
      console.error('[BugreportManager] Panezustand nicht lesbar:', err)
    }

    const anker = await this.ankerCommit(resolvedProjectPath)

    // GitHub delivery first — result determines frontmatter content
    const issueBody = `${beschreibung}\n\n---\n*Filed via cipher-mux bugreport (${id})*`
    let issueUrl: string | undefined
    try {
      const ghResult = await deliverToGitHub(id, issueBody)
      issueUrl = ghResult.issueUrl
    } catch (err) {
      console.error('[BugreportManager] GitHub delivery failed:', err)
    }

    const githubFrontmatterLine = issueUrl
      ? `githubIssue: ${issueUrl}`
      : `deliveryStatus: failed`

    const content = `---
id: ${id}
type: ${type}
status: open
project: ${project ?? 'cipher-mux-electron'}
projectPath: ${resolvedProjectPath}
created: ${now.toISOString()}
${githubFrontmatterLine}
${anker ? `anchorCommit: ${anker}` : ''}
${angereichert.enriched ? `severity: ${angereichert.enriched.severity}` : ''}
---

${beschreibung}
${screenshotSection}
${panezustand}
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

    const dateiPfad = path.join(this.outboxDir, filename)
    fs.writeFileSync(dateiPfad, content, 'utf-8')

    // Die Notiz **nach** der Datei: die Datei ist der verlaessliche Teil, und
    // waere die Reihenfolge umgekehrt, stuende eine Notiz da, die auf nichts zeigt.
    const noteId = await this.legeNotizAn({
      id,
      titel,
      koerper: content,
      severity: angereichert.enriched?.severity,
      datei: dateiPfad,
      anker,
      projektPfad: resolvedProjectPath,
    })

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

    return { id, issueUrl, noteId: noteId ?? undefined }
  }
}
