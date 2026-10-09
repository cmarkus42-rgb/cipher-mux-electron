import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  generateLocalFactoryPreset,
  generateLocalWorkerPreset,
  LOCAL_WORKER_DISPATCH_TOOL,
} from '../../../src/main/local-factory/presets'

describe('Local Cyber Factory presets', () => {
  it('Architekt nennt das Werkzeug, die 2-Versuche-Grenze und dass er nicht codet', () => {
    const p = generateLocalFactoryPreset()
    assert.match(p, new RegExp(LOCAL_WORKER_DISPATCH_TOOL))
    assert.match(p, /2 Versuche/)
    assert.match(p, /codest nicht/i)
  })
  it('Architekt pollt nicht', () => {
    assert.match(generateLocalFactoryPreset(), /nicht.*capture-pane|kein.*Polling/i)
  })
  it('Worker endet mit REPORT.md und fasst Abnahmetests nicht an', () => {
    const p = generateLocalWorkerPreset()
    assert.match(p, /REPORT\.md/)
    assert.match(p, /Abnahmetest/)
  })
  it('Worker: keine Rückfragen, Unklares in REPORT.md vermerken (R16)', () => {
    const p = generateLocalWorkerPreset()
    assert.match(p, /Keine Rückfragen — niemand antwortet\. Wenn etwas unklar ist, entscheide und vermerke es in REPORT\.md\./)
  })
})

describe('Architekten-Preset — Ablauf (Final-Fix 2)', () => {
  const p = generateLocalFactoryPreset()
  it('R13: Testskript, Setup/Config und Fixtures gehören in geschuetzteTests', () => {
    assert.match(p, /geschuetzteTests/)
    assert.match(p, /package\.json/)
    assert.match(p, /Fixtures/)
    assert.match(p, /Test-Setup|Testkonfiguration/)
  })
  it('R13: jede weitere offene Datei wird als „Arbeitsbaum nicht sauber" abgelehnt', () => {
    assert.match(p, /Arbeitsbaum nicht sauber/)
  })
  it('laufId: beim ersten Dispatch zurückgegeben, bei jedem weiteren Häppchen und Retry mitgeben', () => {
    assert.match(p, /laufId/)
    assert.match(p, /ersten\s+Dispatch/)
    assert.match(p, /jedem\s+weiteren\s+Häppchen/)
  })
  it('nennt alle Weckzeilen-Formate', () => {
    for (const s of ['GRÜN', 'ROT', 'HÄNGT', 'ESKALIERT', 'Läuferfehler', 'Nicht bereit']) {
      assert.ok(p.includes(s), s)
    }
  })
  it('während ein Worker läuft: Ziel-Repo nicht anfassen', () => {
    assert.match(p, /Ziel-Repo\s+nicht\s+an/)
  })
  it('accept-Aufruf wie das Schema ihn nimmt: nur accept, laufId, haeppchen', () => {
    assert.match(p, /\{ accept: true, laufId: "…", haeppchen: N \}/)
  })
  it('Abnahmetests nicht unter /src/ oder /lib/', () => {
    assert.match(p, /\/src\//)
    assert.match(p, /\/lib\//)
    assert.match(p, /test\//)
  })
})
