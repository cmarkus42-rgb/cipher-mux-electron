/** CSI- und OSC-Sequenzen; capture-pane liefert mit -e die Farbcodes mit. */
const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g

/** Text einer Pane ohne Farb- und Steuersequenzen, so wie man ihn sieht. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}
