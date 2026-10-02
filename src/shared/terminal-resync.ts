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
