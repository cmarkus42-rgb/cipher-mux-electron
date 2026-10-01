import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * Verzeichnis-Vertrauen fuer Codex — der letzte Blocker unbeaufsichtigter Sessions.
 *
 * Codex fragt beim Start, ob man dem Arbeitsverzeichnis vertraut, und zwar
 * woertlich: *„Trusting the directory allows project-local config, hooks, and
 * exec policies to load."* Ohne Vertrauen haengt eine Entity-Session in diesem
 * Dialog, bis ein Mensch hinsieht — und ein nachtraegliches „Yes" laedt die
 * Konfiguration **nicht mehr**, weil sie nur beim Start gelesen wird. Die
 * Session steht dann am Prompt und hat trotzdem keine MCP-Werkzeuge, keinen
 * Usage-Hook und keine Rollengrenze.
 *
 * **Was gemessen wurde und nicht hilft** (codex-cli 0.155.1, 2026-10-01):
 *  - `-c projects."<pfad>".trust_level="trusted"` — der Dialog kommt trotzdem.
 *    Das ist plausibel Absicht: ein Override kann aus dem unvertrauten
 *    Verzeichnis selbst stammen, und dann wuerde Vertrauen sich selbst erteilen.
 *  - `CODEX_NON_INTERACTIVE=1`
 *  - `--dangerously-bypass-approvals-and-sandbox` und
 *    `--dangerously-bypass-hook-trust`
 *
 * `codex exec` fragt nicht — aber der Mux braucht die TUI im Pane.
 *
 * Bleibt ein Eintrag in der **globalen** `~/.codex/config.toml`. Das ist die
 * Datei des Nutzers, und der Adapter vermeidet es an jeder anderen Stelle
 * ausdruecklich, dort zu schreiben. Hier ist es vertretbar, und der Grund ist
 * nicht Bequemlichkeit:
 *
 * **Der Dialog schuetzt vor fremdem Inhalt. Das Run-Verzeichnis hat keinen.**
 * Unter `runs/<workspaceId>/<entityId>/` liegt ausschliesslich, was der Mux
 * selbst erzeugt hat — CLAUDE.md, AGENTS.md, `.codex/config.toml`, die
 * Hook-Skripte. Der Mux ist der Autor. Einem Projektverzeichnis des Nutzers
 * automatisch zu vertrauen waere etwas voellig anderes, und das tut diese Datei
 * nicht: `trustRunDirectory` weist jeden Pfad ab, der nicht unter dem
 * Run-Basisverzeichnis liegt.
 *
 * Abschaltbar bleibt es trotzdem (`agent.codexTrustRunDirs`). Wer es abschaltet,
 * bestaetigt einmal pro Workspace × Rolle von Hand; Vertrauen haelt dauerhaft.
 */

/** Wie Codex Vertrauen ablegt. Gemessen an einem Eintrag, den Codex selbst schrieb. */
const TRUST_LEVEL_LINE = 'trust_level = "trusted"'

/** Pfad der globalen Codex-Konfiguration. `CODEX_HOME` schlaegt den Standard. */
export function codexConfigPath(): string {
  const home = process.env.CODEX_HOME?.trim()
  return path.join(home && home !== '' ? home : path.join(os.homedir(), '.codex'), 'config.toml')
}

/** Basisverzeichnis, unterhalb dessen Vertrauen erteilt werden darf. */
export function runDirBase(): string {
  return path.join(os.homedir(), '.config', 'cipher-mux', 'runs')
}

/**
 * Ob ein Pfad ein Mux-Run-Verzeichnis ist — die Grenze dessen, was diese Datei
 * vertrauen darf.
 *
 * Geprueft wird auf dem aufgeloesten Pfad, damit `…/runs/../../woanders` nicht
 * durchkommt. Ein Pfad, der nur **mit demselben Text beginnt**
 * (`…/runs-woanders`), ist ebenfalls aussen — deshalb der Separator.
 */
export function isRunDirectory(dir: string, base: string = runDirBase()): boolean {
  const resolved = path.resolve(dir)
  const resolvedBase = path.resolve(base)
  if (resolved === resolvedBase) return false
  return resolved.startsWith(resolvedBase + path.sep)
}

/** Ob die Datei fuer diesen Pfad schon einen Vertrauenseintrag traegt. */
export function hasTrustEntry(configText: string, dir: string): boolean {
  const header = `[projects.${JSON.stringify(path.resolve(dir))}]`
  const i = configText.indexOf(header)
  if (i < 0) return false
  // Der Abschnitt reicht bis zum naechsten Tabellenkopf. Nur dann gilt der
  // Eintrag, wenn `trust_level` **darin** steht und nicht irgendwo sonst.
  const rest = configText.slice(i + header.length)
  const nextHeader = rest.search(/^\s*\[/m)
  const section = nextHeader < 0 ? rest : rest.slice(0, nextHeader)
  return section.includes(TRUST_LEVEL_LINE)
}

/** Hängt den Vertrauenseintrag an, wenn er fehlt. Gibt den neuen Text zurueck. */
export function withTrustEntry(configText: string, dir: string): string {
  if (hasTrustEntry(configText, dir)) return configText
  const header = `[projects.${JSON.stringify(path.resolve(dir))}]`
  const prefix = configText === '' ? '' : configText.replace(/\n+$/, '') + '\n\n'
  return `${prefix}# von cipher-mux erteilt — generiertes Run-Verzeichnis, kein fremder Inhalt\n${header}\n${TRUST_LEVEL_LINE}\n`
}

export interface TrustResult {
  /** Ob der Eintrag danach vorhanden ist. */
  trusted: boolean
  /** Ob diese Aufruf etwas geschrieben hat. */
  written: boolean
  /** Warum nicht, wenn nicht. */
  reason?: string
}

/**
 * Erteilt Vertrauen fuer ein Run-Verzeichnis.
 *
 * Idempotent, und **still bei jedem Fehler**: ein nicht erteiltes Vertrauen
 * kostet einen Dialog, ein geworfener Fehler in der Init-Kette kostet die
 * Session. Der Rueckgabewert sagt, was passiert ist.
 */
export function trustRunDirectory(
  dir: string,
  opts: { configPath?: string; base?: string } = {},
): TrustResult {
  if (!isRunDirectory(dir, opts.base ?? runDirBase())) {
    // Die eigentliche Schutzlinie dieser Datei. Fremde Verzeichnisse bekommen
    // kein Vertrauen, auch nicht auf Zuruf.
    return { trusted: false, written: false, reason: 'kein Mux-Run-Verzeichnis' }
  }
  const configPath = opts.configPath ?? codexConfigPath()
  try {
    let text = ''
    try {
      text = fs.readFileSync(configPath, 'utf-8')
    } catch {
      // Codex ist vielleicht noch nie gelaufen. Dann wird die Datei angelegt.
    }
    if (hasTrustEntry(text, dir)) return { trusted: true, written: false }
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, withTrustEntry(text, dir), 'utf-8')
    return { trusted: true, written: true }
  } catch (err) {
    return {
      trusted: false,
      written: false,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}
