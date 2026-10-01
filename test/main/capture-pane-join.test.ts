import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'child_process'

/**
 * Warum dieser Test gegen das echte tmux laeuft.
 *
 * Die Behauptung ist eine ueber **tmux**, nicht ueber unseren Code: dass
 * `capture-pane` ohne `-J` eine umgebrochene Zeile zerlegt und mit `-J` nicht.
 * Ein Mock wuerde genau die Annahme festschreiben, die zu pruefen ist — und der
 * Zerfall im xterm-Puffer ist **dauerhaft**, kein spaeterer Reflow holt ihn
 * zurueck. Diese Eigenschaft ist es wert, gegen die Wirklichkeit zu stehen.
 *
 * tmux ist ohnehin harte Voraussetzung des Projekts (einziges Session-Backend).
 */

const SESSION = 'cmux-test-capture-join'
const WIDTH = 40
const LINE_LENGTH = 95
/** Kurz genug, dass sie sicher nicht umgebrochen wird, und eindeutig wiederfindbar. */
const SHORT_LINE = 'ZEILE-OHNE-UMBRUCH'

function tmux(...args: string[]): string {
  return execFileSync('tmux', args, { encoding: 'utf-8', timeout: 15_000 })
}

function tmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore', timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

describe('capture-pane und umgebrochene Zeilen', { skip: tmuxAvailable() ? false : 'tmux nicht verfuegbar' }, () => {
  before(() => {
    try { tmux('kill-session', '-t', SESSION) } catch { /* lief nicht */ }
    tmux('new-session', '-d', '-s', SESSION, '-x', String(WIDTH), '-y', '12')
    // Eine Zeile, die deutlich breiter ist als der Pane.
    tmux('send-keys', '-t', SESSION, `printf 'A%.0s' {1..${LINE_LENGTH}}; echo; echo '${SHORT_LINE}'`, 'Enter')
    // tmux braucht einen Moment, bis die Shell geantwortet hat.
    execFileSync('sh', ['-c', 'sleep 2'])
  })

  after(() => {
    try { tmux('kill-session', '-t', SESSION) } catch { /* schon weg */ }
  })

  it('OHNE -J zerfaellt die Zeile in mehrere physische Zeilen', () => {
    // Das ist der Zustand, der den Fehler erzeugte: aus einer logischen Zeile
    // werden drei, und im xterm-Puffer bleiben sie fuer immer drei.
    const out = tmux('capture-pane', '-t', SESSION, '-p', '-e')
    const aLines = out.split('\n').filter(l => l.includes('AAA'))
    assert.ok(aLines.length > 1, `erwartet: mehr als eine Zeile, war ${aLines.length}`)
  })

  it('MIT -J kommt sie als genau eine Zeile zurueck', () => {
    const out = tmux('capture-pane', '-t', SESSION, '-p', '-e', '-J')
    const aLines = out.split('\n').filter(l => l.includes('AAA'))
    assert.equal(aLines.length, 1, `erwartet: genau eine Zeile, war ${aLines.length}`)
  })

  it('und sie traegt alle Zeichen', () => {
    const out = tmux('capture-pane', '-t', SESSION, '-p', '-e', '-J')
    const line = out.split('\n').find(l => l.includes('AAA')) ?? ''
    const aCount = (line.match(/A/g) ?? []).length
    assert.equal(aCount, LINE_LENGTH)
  })

  it('eine nie umgebrochene Zeile bleibt Zeichen fuer Zeichen gleich', () => {
    // Die bekannte Nebenwirkung von -J ist, dass eine zuvor **umgebrochene**
    // Zeile ihr Leerzeichen am Ende behaelt. Eine, die nie umgebrochen wurde,
    // darf sich nicht aendern.
    //
    // Geprueft wird eine eigens ausgegebene Zeile, nicht „alles unter
    // Panebreite": ein umgebrochenes Segment kommt ohne -J um sein
    // abgeschnittenes Leerzeichen **kuerzer** zurueck und sieht damit aus wie
    // eine kurze Zeile. Genau daran ist eine erste Fassung dieses Tests
    // gescheitert — die Heuristik war falsch, nicht der Code.
    // **Exakt**, nicht „enthaelt": der Suchbegriff steht auch im Echo des
    // Befehls, der ihn ausgibt — und dieses Echo ist umgebrochen. Eine erste
    // Fassung pruefte dadurch die falsche Zeile.
    const finde = (out: string) => out.split('\n').find(l => l.trim() === SHORT_LINE)
    const ohne = finde(tmux('capture-pane', '-t', SESSION, '-p', '-e'))
    const mit = finde(tmux('capture-pane', '-t', SESSION, '-p', '-e', '-J'))
    assert.ok(ohne, 'Testzeile ohne -J nicht gefunden')
    assert.equal(mit, ohne)
  })
})
