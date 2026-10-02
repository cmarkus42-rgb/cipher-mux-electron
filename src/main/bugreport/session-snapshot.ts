/**
 * Was tmux im Moment der Meldung hatte.
 *
 * **Warum das in jeden Bugreport gehoert.** Am 2026-10-02 lag ein Screenshot des
 * Nutzers sechs Minuten vor meinem `capture-pane`, und daran scheiterte die
 * einfachste Frage: Steht da falscher Inhalt, oder wird richtiger Inhalt falsch
 * gezeichnet? Beides sieht auf einem Bild gleich aus. Erst die **Gleichzeitigkeit**
 * von Bild und Panezustand trennt die zwei — bei den zerfallenden Zeilen entschied
 * genau sie den Fall (`docs/superpowers/specs/2026-10-01-terminal-darstellung.md`,
 * Abschnitt 3.4). Dafuer gab es `scripts/zerfall-beweis.sh`; von Hand gestartet, im
 * richtigen Moment. Das nimmt der Report jetzt selbst mit.
 *
 * **Begrenzt, mit Absicht.** Nur der sichtbare Bereich, nicht die Historie: ein
 * Darstellungsfehler zeigt sich dort, wo der Nutzer hinsieht, und 1000 Zeilen
 * Scrollback pro Session machen aus einem Report eine Datenhalde. Ebenso gedeckelt
 * sind Anzahl der Sessions und Zeichen je Pane.
 */

import { execFile } from 'node:child_process'

/** Mehr Sessions bringen fuer die Fehlersuche nichts und blaehen den Report. */
export const MAX_SESSIONS = 6
/** Deckel je Pane. 82x15 Zeichen plus ANSI liegen deutlich darunter. */
export const MAX_ZEICHEN = 8000
/** Ein haengendes tmux darf das Absenden nicht aufhalten. */
export const TMUX_TIMEOUT_MS = 3000

export interface PaneSchnappschuss {
  session: string
  /** Breite x Hoehe des Panes, als `82x15`. */
  groesse?: string
  /** `1`, wenn eine Anwendung den Alternate-Screen haelt. */
  alternateOn?: string
  /** Zeilen im Scrollback. */
  historySize?: string
  /** Was im Pane steht, mit Farben (`-e`) und zusammengefuegten Zeilen (`-J`). */
  inhalt?: string
  /** Warum nichts gesammelt werden konnte. */
  fehler?: string
}

function lauf(args: string[], timeoutMs = TMUX_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('tmux', args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

/**
 * Panezustand einer tmux-Session lesen.
 *
 * Wirft nicht. Eine Session, die gerade verschwunden ist, liefert einen Eintrag mit
 * `fehler` — das ist fuer die Fehlersuche wertvoller als eine Luecke.
 */
export async function schnappschussVon(session: string): Promise<PaneSchnappschuss> {
  try {
    const meta = await lauf([
      'display-message', '-p', '-t', session,
      '#{pane_width}x#{pane_height}\t#{alternate_on}\t#{history_size}',
    ])
    const [groesse, alternateOn, historySize] = meta.trim().split('\t')
    let inhalt: string | undefined
    try {
      const roh = await lauf(['capture-pane', '-t', session, '-p', '-e', '-J'])
      inhalt = roh.length > MAX_ZEICHEN ? roh.slice(0, MAX_ZEICHEN) + '\n[…gekürzt]' : roh
    } catch {
      // Maße ohne Inhalt sind immer noch eine Aussage.
    }
    return { session, groesse, alternateOn, historySize, inhalt }
  } catch (err) {
    return { session, fehler: err instanceof Error ? err.message : 'tmux nicht erreichbar' }
  }
}

/** Panezustand mehrerer Sessions, gedeckelt auf {@link MAX_SESSIONS}. */
export async function sammleSchnappschuesse(sessions: string[]): Promise<PaneSchnappschuss[]> {
  const ziele = sessions.filter(Boolean).slice(0, MAX_SESSIONS)
  return Promise.all(ziele.map(schnappschussVon))
}

/**
 * Markdown fuer den Report.
 *
 * Der Inhalt steht in einem Codeblock, damit ANSI-Reste nichts zerschiessen, und
 * die Maße stehen **ueber** dem Inhalt — beim Lesen ist „82x15, alternate_on=1" die
 * erste Frage, nicht die letzte.
 */
export function schnappschuesseAlsMarkdown(schuesse: PaneSchnappschuss[]): string {
  if (!schuesse.length) return ''
  const teile = ['## Panezustand bei der Meldung\n']
  for (const s of schuesse) {
    if (s.fehler) {
      teile.push(`### ${s.session}\n\n_nicht lesbar: ${s.fehler}_\n`)
      continue
    }
    teile.push(`### ${s.session}\n`)
    teile.push(`\`${s.groesse ?? '?'}\` · alternate_on=\`${s.alternateOn ?? '?'}\` · history=\`${s.historySize ?? '?'}\`\n`)
    if (s.inhalt?.trim()) {
      teile.push('```\n' + s.inhalt.replace(/```/g, '`‌``') + '\n```\n')
    }
  }
  return teile.join('\n')
}
