/**
 * Wann ein Resize den `capture-pane`-Resync braucht — und wie tief er greift.
 *
 * Der Resync ist ein **Neuschreiben des Puffers**: `term.reset()`, dann der
 * tmux-Schnappschuss hinein. `reset()` leert den Scrollback nicht, es ersetzt ihn
 * (`BufferSet.reset()` legt `new Buffer(...)` an, xterm 5.5.0). Was der Schnappschuss
 * nicht enthaelt, ist danach weg — und `capture-pane` liefert ohne `-S`
 * ausschliesslich den **sichtbaren** Bereich. Jeder Resync ohne Scrollback-Tiefe
 * kostet den Nutzer also seine Historie: hochscrollen geht nicht mehr.
 *
 * Gemessen am 2026-10-02 gegen tmux 3.7c, 80x15-Pane mit 488 Zeilen Historie:
 * `capture-pane -p -e -J` gibt **15** Zeilen zurueck und beginnt bei Zeile 487;
 * mit `-S -2000` sind es **503** Zeilen samt Historie.
 *
 * Deshalb zwei Dinge:
 *
 * 1. **Nur ein Spaltenwechsel braucht den Resync.** Sein Zweck ist der
 *    Reflow-Unterschied zwischen xterm und tmux (Kommentar an `scheduleResync`,
 *    T-LC.7), und der entsteht nur, wenn sich die Breite aendert. Gemessen bei
 *    reiner Hoehenaenderung 15 → 30 → 15 Zeilen, Breite konstant: tmux holt 15
 *    Zeilen aus der Historie in den sichtbaren Bereich (`history_size` 488 → 473)
 *    und schiebt sie beim Zurueck wieder hinein. Zeile „472" bleibt dabei Zeile
 *    „472" — **nichts wird umgebrochen**, es gibt also keinen Unterschied
 *    auszugleichen. xterm tut mit seinem eigenen Scrollback dasselbe.
 *
 *    Das ist der Fall, der in der Praxis vorkommt: eine Zelle auf doppelte Hoehe
 *    ziehen und zurueck. Vorher kostete jeder dieser Griffe den Scrollback.
 *
 * 2. **Laeuft er doch, nimmt er die Historie mit.** Worst Case gemessen an einem
 *    120x30-Pane mit 1976 Zeilen gefaerbter Historie: 72 kB in 530 Zeilen, 11 ms
 *    fuer den tmux-Aufruf. An den tatsaechlich laufenden Sessions sind es 1,2 bis
 *    2 kB, weil Claude Code an Ort und Stelle malt und kaum Scrollback erzeugt.
 */

/**
 * Scrollback-Tiefe fuer den Resync-`capture-pane`, in Zeilen vor dem sichtbaren
 * Bereich.
 *
 * 1000, weil xterms `scrollback`-Option genau so gross ist (Default in
 * `OptionsService.ts`, und `useTerminal` setzt sie nicht). Mehr zu holen hiesse,
 * tmux Zeilen zu entnehmen, die xterm beim Schreiben sofort wieder verwirft;
 * weniger hiesse, Historie wegzuwerfen, die xterm noch halten koennte. tmux'
 * eigenes `history-limit` liegt bei 2000 (globaler Default, der Mux setzt es
 * nicht) — die 1000 sind also durch xterm begrenzt, nicht durch tmux.
 */
export const RESYNC_SCROLLBACK_LINES = 1000

export interface TerminalSize {
  cols: number
  rows: number
}

/**
 * Braucht der Uebergang von `prev` nach `next` einen `capture-pane`-Resync?
 *
 * Nur bei einem Spaltenwechsel. Eine reine Hoehenaenderung bricht keine Zeile um
 * — Begruendung und Messung im Dateikopf.
 *
 * `prev` ist beim ersten Fit `{cols: 0, rows: 0}`; der Spaltenwechsel von 0 auf
 * die echte Breite ist damit ein Resync, und das ist gewollt: dort wird der Puffer
 * erstmals gegen tmux gestellt.
 */
export function needsReflowResync(prev: TerminalSize, next: TerminalSize): boolean {
  return prev.cols !== next.cols
}

/**
 * Was der Neuaufbau aus tmux braucht: der Inhalt **ungekürzt** und die
 * Cursorposition im sichtbaren Bereich (0-basiert, wie tmux sie meldet).
 *
 * Beides fehlte bis zum 2026-10-11. `runCommand` schneidet die Ausgabe mit
 * `trim()`, die leeren Zeilen am Ende des Bildschirms gingen also verloren und der
 * Inhalt rutschte um genau so viele Zeilen nach unten. Und nach dem Schreiben stand
 * der Cursor am Ende des Texts statt dort, wo tmux ihn hat. Claude Code malt
 * relativ zum Cursor („n Zeilen hoch, löschen, neu schreiben“) — der nächste
 * Neuzeichnen-Zug landete zu tief, und darüber blieben Reste alter Dialoge und
 * eine doppelte Statuszeile stehen. tmux selbst hatte die ganze Zeit den
 * richtigen Bildschirm.
 */
export interface PaneSnapshot {
  content: string
  cursorX: number
  cursorY: number
}

/**
 * Liest die Ausgabe von `display -p '#{cursor_x} #{cursor_y}' ; capture-pane -p`:
 * erste Zeile der Cursor, danach der Inhalt mit genau einem Zeilenwechsel pro
 * Zeile — der letzte davon gehört zu keiner Zeile mehr und fällt weg.
 */
export function parsePaneSnapshot(raw: string): PaneSnapshot {
  const nl = raw.indexOf('\n')
  const head = nl === -1 ? raw : raw.slice(0, nl)
  let content = nl === -1 ? '' : raw.slice(nl + 1)
  if (content.endsWith('\n')) content = content.slice(0, -1)
  const [x, y] = head.trim().split(/\s+/).map(Number)
  return {
    content,
    cursorX: Number.isFinite(x) ? x : 0,
    cursorY: Number.isFinite(y) ? y : 0,
  }
}

/**
 * Die Bytes, die ein frisch zurückgesetztes xterm in den Zustand von tmux bringen.
 *
 * Zeilen mit `\r\n` verbunden und **ohne** Zeilenwechsel am Ende — einer mehr rollte
 * alles um eine Zeile hoch. Danach Attribute zurück (`-e` kann mitten in einer
 * Farbe enden) und der Cursor absolut auf tmux' Position. Das setzt voraus, dass
 * xterm so viele Zeilen hat wie der Pane; der Aufrufer stellt das mit dem Resize
 * vorher sicher.
 */
export function buildRestoreSequence(s: PaneSnapshot): string {
  const body = s.content.split('\n').join('\r\n')
  return `${body}\x1b[0m\x1b[${s.cursorY + 1};${s.cursorX + 1}H`
}

/**
 * Ein Schnappschuss mit seiner Stelle im Livestream: `seq` ist die Nummer des
 * letzten Ausgabestuecks, das **schon im Schnappschuss steckt**. Alles mit einer
 * groesseren Nummer kam danach und gehoert obendrauf, alles mit einer kleineren
 * oder gleichen darf nicht noch einmal geschrieben werden.
 */
export interface SyncedSnapshot extends PaneSnapshot {
  seq: number
}

/**
 * Haelt den Livestream an, waehrend ein Terminal aus einem Schnappschuss neu
 * aufgebaut wird, und setzt ihn an der richtigen Stelle fort.
 *
 * **Warum es das braucht** (2026-10-16): Neben dem Eingabefeld von Claude Code
 * blieben Zeilen stehen, die tmux laengst geloescht hatte — `capture-pane` zeigte
 * zur selben Zeit ein leeres Feld. Der Neuaufbau nach einem Resize lief so:
 * Schnappschuss holen, `term.reset()`, Schnappschuss schreiben. Die laufende
 * Ausgabe schrieb dabei ungebremst weiter, und zwischen Schnappschuss und Strom
 * gab es keine Reihenfolge. Ein Stueck, das schon im Schnappschuss steckte, wurde
 * danach noch einmal angewendet, oder eines dazwischen ging verloren. Claude Code
 * malt relativ zum Cursor („n Zeilen hoch, loeschen, neu schreiben“) — ein
 * einziger doppelter oder fehlender Zug, und die Reste bleiben stehen.
 *
 * Der Ablauf mit dem Tor:
 *
 * 1. `hold()` vor dem Schnappschuss: ab jetzt wird gesammelt statt geschrieben.
 * 2. `release(token, cut)` mit dem Schnappschuss: `cut.rewrite()` setzt das
 *    Terminal neu auf, danach folgt nur, was **nach** `cut.seq` kam. Stuecke bis
 *    `cut.seq`, die spaeter noch eintreffen, werden verworfen.
 * 3. `release(token)` ohne Schnitt (leerer Schnappschuss, Fehler, Frist): das
 *    Gesammelte wird geschrieben wie vorher, nichts verworfen.
 *
 * Ueberlappen sich zwei Neuaufbauten, gilt nur der juengste. Ein aelteres
 * `release` wird ignoriert — das juengere kommt noch und gibt frei.
 */
export class StreamGate {
  private pending: Array<{ seq: number; data: string }> | null = null
  private token = 0
  private dropUpTo = -Infinity

  constructor(private readonly write: (data: string) => void) {}

  /** Ein Ausgabestueck aus dem Livestream. Ohne Nummer gilt es als neu. */
  data(seq: number | undefined, data: string): void {
    const s = seq ?? Infinity
    if (s <= this.dropUpTo) return
    if (this.pending) {
      this.pending.push({ seq: s, data })
      return
    }
    this.write(data)
  }

  /** Ab jetzt sammeln. Gibt das Zeichen zurueck, mit dem freigegeben wird. */
  hold(): number {
    if (!this.pending) this.pending = []
    return ++this.token
  }

  /** Ist `token` noch der juengste Neuaufbau? */
  isCurrent(token: number): boolean {
    return token === this.token && this.pending !== null
  }

  /**
   * Freigeben. Mit `cut`: neu aufsetzen, dann nur Stuecke nach `cut.seq`.
   * Ohne: alles Gesammelte schreiben. Gibt `false` zurueck, wenn `token` nicht
   * mehr der juengste ist — dann ist nichts passiert.
   */
  release(token: number, cut?: { seq: number; rewrite: () => void }): boolean {
    if (!this.isCurrent(token)) return false
    const held = this.pending!
    this.pending = null
    if (cut) {
      cut.rewrite()
      this.dropUpTo = Math.max(this.dropUpTo, cut.seq)
    }
    for (const p of held) {
      if (p.seq > this.dropUpTo) this.write(p.data)
    }
    return true
  }
}
