/**
 * Mitschrift: welches Signal hat eine Session bereit gemeldet?
 *
 * Die Bereitschaftsprüfung hat seit dem 2026-09-30 zwei Signale — die
 * Selbstmeldung der Session über ihren statusLine-Hook, und als Rückfall den
 * Prompt im Terminal (siehe session-readiness.ts).
 *
 * Der Rückfall bleibt bewusst, obwohl er die schwächere Prüfung ist: er hat
 * nachweislich funktioniert, die Selbstmeldung ist neu, und den funktionierenden
 * Weg abzuschalten, bevor der neue sich bewährt hat, wäre die falsche
 * Reihenfolge.
 *
 * Damit sich nach ein paar Wochen sagen lässt, ob die Selbstmeldung trägt,
 * schreibt diese Datei mit, welches Signal tatsächlich gegriffen hat. Das ist
 * der Unterschied zwischen „hat sich bewährt" und „wir vermuten es".
 *
 * Bewusst eine Datei und keine Datenbank: es ist eine Beobachtung über Wochen,
 * im Betrieb fragt sie niemand ab, und eine Zeile pro Zustellung ist auch in
 * einem Jahr keine Größe, die mehr rechtfertigt. Nichts hier wirft — eine
 * fehlgeschlagene Mitschrift darf keine Übergabe verhindern.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export type ReadinessSignal = 'status-line' | 'prompt'

export interface ReadinessEntry {
  ts: number
  entityId: string
  /** Welches Signal gegriffen hat, oder null wenn keines. */
  via: ReadinessSignal | null
  /** Wie viele Runden es gebraucht hat. */
  attempts: number
  /** Ob die Session schon lief oder frisch gestartet wurde. */
  wasExisting: boolean
}

export interface ReadinessSummary {
  total: number
  bySignal: Record<ReadinessSignal, number>
  /** Zustellungen, bei denen kein Signal kam. */
  failed: number
  /**
   * Anteil der Selbstmeldung an den erfolgreichen Prüfungen — die Zahl, um
   * die es geht. null, solange es nichts zu teilen gibt: ohne Daten gibt es
   * keinen Anteil, auch nicht null Prozent.
   */
  selfReportShare: number | null
  oldest: number | null
  newest: number | null
}

/** Voreinstellung: genug für Wochen, klein genug zum Durchlesen. */
const DEFAULT_MAX_ENTRIES = 500

export const DEFAULT_READINESS_LOG = path.join(
  os.homedir(), '.config', 'cipher-mux', 'readiness.jsonl',
)

export class ReadinessLog {
  constructor(
    private readonly filePath: string = DEFAULT_READINESS_LOG,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  /** Eine Zustellung mitschreiben. Schlägt nie fehl. */
  record(entry: Omit<ReadinessEntry, 'ts'>): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.appendFileSync(this.filePath, JSON.stringify({ ts: Date.now(), ...entry }) + '\n', 'utf-8')
      this.trim()
    } catch (err) {
      // Eine fehlgeschlagene Mitschrift darf keine Uebergabe verhindern.
      console.warn('[ReadinessLog] konnte nicht schreiben:', err)
    }
  }

  /** Alle Einträge, älteste zuerst. Kaputte Zeilen werden übersprungen. */
  read(): ReadinessEntry[] {
    let raw: string
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8')
    } catch {
      return []
    }

    const entries: ReadinessEntry[] = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed) as ReadinessEntry
        if (typeof parsed.ts === 'number') entries.push(parsed)
      } catch {
        // Eine unvollstaendig geschriebene Zeile verwirft nicht die Datei.
      }
    }
    return entries
  }

  summarize(): ReadinessSummary {
    const entries = this.read()
    const bySignal: Record<ReadinessSignal, number> = { 'status-line': 0, prompt: 0 }
    let failed = 0

    for (const e of entries) {
      if (e.via === 'status-line' || e.via === 'prompt') bySignal[e.via]++
      else failed++
    }

    const succeeded = bySignal['status-line'] + bySignal.prompt
    return {
      total: entries.length,
      bySignal,
      failed,
      selfReportShare: succeeded > 0 ? bySignal['status-line'] / succeeded : null,
      oldest: entries.length > 0 ? entries[0].ts : null,
      newest: entries.length > 0 ? entries[entries.length - 1].ts : null,
    }
  }

  /** Auf die jüngsten maxEntries kürzen. */
  private trim(): void {
    try {
      const entries = this.read()
      if (entries.length <= this.maxEntries) return
      const keep = entries.slice(-this.maxEntries)
      fs.writeFileSync(
        this.filePath,
        keep.map(e => JSON.stringify(e)).join('\n') + '\n',
        'utf-8',
      )
    } catch { /* Kuerzen ist Kosmetik, kein Grund zu scheitern */ }
  }
}
