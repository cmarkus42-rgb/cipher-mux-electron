import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'

/**
 * Das Repo ist oeffentlich. Eine Adresse aus dem eigenen Tailnet oder ein Pfad von der
 * eigenen Maschine gehoert weder in den Code noch in die Doku; einmal gepusht ist er kaum
 * zurueckzuholen.
 */
const VERBOTEN: Array<[string, RegExp]> = [
  ['Tailnet-Adresse', /\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/],
  ['Pfad unter /Users/Shared', /\/Users\/Shared\/[A-Za-z]/],
]

describe('Oeffentliches Repo', () => {
  it('enthaelt keine Adressen und Pfade der eigenen Maschine', () => {
    const dateien = execFileSync('git', ['ls-files'], { encoding: 'utf-8', maxBuffer: 1 << 26 })
      .split('\n')
      .filter((f) => f && f !== 'package-lock.json' && f !== 'test/main/public-hygiene.test.ts')
    const treffer: string[] = []
    for (const datei of dateien) {
      if (!fs.existsSync(datei) || fs.statSync(datei).size > 5_000_000) continue
      const inhalt = fs.readFileSync(datei)
      if (inhalt.includes(0)) continue
      const text = inhalt.toString('utf-8')
      for (const [art, muster] of VERBOTEN) {
        if (muster.test(text)) treffer.push(`${datei}: ${art}`)
      }
    }
    assert.deepEqual(treffer, [])
  })
})
