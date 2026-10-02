import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * Der Glyphen-Atlas wird nach dem Aufbau einmal verworfen.
 *
 * **Was dieser Test leistet und was nicht.** Er haelt fest, dass die Reparatur
 * verdrahtet *ist* — nicht, dass sie den Defekt behebt. Der Defekt liess sich am
 * 2026-10-02 in sieben Nachstellungen nicht ausloesen (kalter Schriftstart mit
 * verzoegerter woff2, Atlas mit 1400 Glyphen gefuellt, Themewechsel am laufenden
 * Terminal, Aufbau in einem 40x30-Container, WebGL/Canvas/DOM, Electron 34 wie
 * Chrome, DPR 1). Ein Test, der ihn nachstellt, waere also erfunden.
 *
 * Belegt ist der Defekt an etwas anderem: beim ersten Aufruf einer Zelle kamen
 * Block- und Rahmenzeichen als Rauten heraus, waehrend `capture-pane` zur selben
 * Zeit U+2588/U+259B und 82x U+2500 zeigte — der Inhalt war also richtig. Und die
 * Schriftgroesse einen Schritt zu aendern behob es **sofort**. Genau diese
 * Neurasterung ohne Anfassen des Puffers macht `clearTextureAtlas`.
 *
 * Dieser Test faengt deshalb den Fall, der real ist: dass jemand den Aufruf
 * entfernt oder aus der `fonts.ready`-Kette loest, und der Zerfall still
 * zurueckkommt.
 */

const HOOK = path.join(__dirname, '../../src/renderer/hooks/useTerminal.ts')

describe('Glyphen-Atlas nach dem Aufbau', () => {
  it('wird genau einmal verworfen', () => {
    const src = readFileSync(HOOK, 'utf-8')
    const treffer = [...src.matchAll(/clearTextureAtlas\(\)/g)]
    assert.equal(
      treffer.length,
      1,
      `erwartet: genau ein clearTextureAtlas(), waren ${treffer.length} — mehrfach pro Terminal kostet bei jedem Aufruf eine komplette Neurasterung`,
    )
  })

  it('haengt an document.fonts.ready', () => {
    // Die Schriften kommen per `font-display: swap` asynchron, und sonst wartet
    // niemand auf sie. Ein Verwerfen davor traefe den Atlas, den die Schrift gleich
    // wieder veralten laesst.
    const src = readFileSync(HOOK, 'utf-8')
    const kette = src.match(/document\.fonts\.ready[\s\S]{0,400}?clearTextureAtlas\(\)/)
    assert.ok(
      kette,
      'clearTextureAtlas() steht nicht in der document.fonts.ready-Kette',
    )
  })

  it('wartet einen Frame, damit das erste Rendern durch ist', () => {
    const src = readFileSync(HOOK, 'utf-8')
    const kette = src.match(/document\.fonts\.ready[\s\S]{0,400}?clearTextureAtlas\(\)/)
    assert.ok(kette)
    assert.match(
      kette[0],
      /requestAnimationFrame/,
      'ohne Frame-Grenze trifft das Verwerfen den Atlas, bevor er gefuellt ist',
    )
  })

  it('faengt einen Renderer ohne Atlas ab', () => {
    // Im DOM-Renderer gibt es keinen Textur-Atlas; der Aufruf darf dort nicht
    // die Terminal-Erzeugung mitreissen.
    const src = readFileSync(HOOK, 'utf-8')
    const kette = src.match(/requestAnimationFrame[\s\S]{0,200}?clearTextureAtlas\(\)[\s\S]{0,120}/)
    assert.ok(kette)
    assert.match(kette[0], /try\s*\{[\s\S]*?\}\s*catch/, 'Aufruf nicht abgesichert')
  })
})
