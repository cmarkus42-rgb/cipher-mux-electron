/**
 * Mitschrift der Terminalgroessen: was die Zellen verlangt haben, was tmux
 * gemeldet hat, und wann der Groessenwaechter eingegriffen hat.
 *
 * Laeuft immer mit, weil die Reste im Eingabefeld sich nicht auf Zuruf
 * nachstellen lassen. Faellt einem welche auf, liest man hier nach, ob um diese
 * Zeit eine Abweichung zwischen Zelle und tmux bestand — oder eben nicht, dann
 * ist die Ursache eine andere. Die Konsolenausgabe hilft dafuer nicht: die App
 * wird per `open` gestartet, ihr stdout geht verloren.
 *
 * Kosten: eine Zeile pro Resize einer Zelle und pro Meldung von tmux, also nur,
 * wenn sich an der Groesse etwas tut. Ueber `maxBytes` wird auf die juengere
 * Haelfte gekuerzt. Nichts hier wirft — eine Mitschrift darf kein Terminal
 * aufhalten.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export type SizeLogKind =
  /** Die Zelle verlangt eine Groesse. */
  | 'zelle'
  /** tmux meldet eine Fenstergroesse (`%layout-change`). */
  | 'tmux'
  /** Nach dem Nachmessen weicht tmux ab — es wird zurueckgestellt. */
  | 'korrektur'
  /** Zu viele Korrekturen im Fenster — es wird nicht mehr zurueckgestellt. */
  | 'aufgegeben'

export interface SizeLogEntry {
  kind: SizeLogKind
  /** tmux-Sessionname, z.B. `cmux-workshop-rzvt`. */
  session: string
  cols: number
  rows: number
  /** Bei `korrektur`/`aufgegeben`: die Groesse, die die Zelle verlangt hat. */
  wantCols?: number
  wantRows?: number
}

export type SizeLogSink = (entry: SizeLogEntry) => void

export const DEFAULT_SIZE_LOG = path.join(os.homedir(), '.config', 'cipher-mux', 'terminal-size.jsonl')
const DEFAULT_MAX_BYTES = 512 * 1024

export function createSizeLog(filePath: string = DEFAULT_SIZE_LOG, maxBytes: number = DEFAULT_MAX_BYTES): SizeLogSink {
  let dirReady = false
  return (entry) => {
    try {
      if (!dirReady) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        dirReady = true
      }
      const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'
      fs.appendFileSync(filePath, line, 'utf-8')
      if (fs.statSync(filePath).size > maxBytes) {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
        fs.writeFileSync(filePath, lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n', 'utf-8')
      }
    } catch (err) {
      console.warn('[SizeLog] konnte nicht schreiben:', err)
    }
  }
}
