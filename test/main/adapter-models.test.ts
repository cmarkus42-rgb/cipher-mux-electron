import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCodexModels,
  parseOpenCodeModels,
  CLAUDE_CODE_MODEL_ALIASES,
} from '../../src/main/agent/adapter-models'

/** Gekuerzte, aber echte Ausgabe von `codex debug models` (0.155.1, 2026-10-01). */
const CODEX_JSON = JSON.stringify({
  models: [
    { slug: 'gpt-6-astra', display_name: 'GPT-6 Astra', context_window: 272000, description: 'Standard' },
    { slug: 'gpt-6-sol', display_name: 'GPT-6 Sol', context_window: 272000 },
    { slug: 'codex-auto-review', context_window: 272000 },
  ],
})

/** Echte Ausgabe von `opencode models` ohne angemeldeten Anbieter. */
const OPENCODE_OUT = `opencode/big-pickle
opencode/ling-3.0-flash-fin-free
opencode/nemotron-3-ultra-free
`

describe('parseCodexModels', () => {
  it('liest den Namen aus `slug`, nicht aus `id`', () => {
    // Genau hier bin ich beim Bauen hereingefallen: `id` gibt es in diesen
    // Eintraegen gar nicht. Wer darauf liest, bekommt eine Liste leerer Namen.
    const ms = parseCodexModels(CODEX_JSON)
    assert.deepEqual(ms.map(m => m.id), ['gpt-6-astra', 'gpt-6-sol', 'codex-auto-review'])
  })

  it('nimmt display_name als Beschriftung, faellt sonst auf die ID zurueck', () => {
    const ms = parseCodexModels(CODEX_JSON)
    assert.equal(ms[0].label, 'GPT-6 Astra')
    assert.equal(ms[2].label, 'codex-auto-review')
  })

  it('reicht Kontextfenster und Beschreibung durch, wenn vorhanden', () => {
    const ms = parseCodexModels(CODEX_JSON)
    assert.equal(ms[0].contextWindow, 272_000)
    assert.equal(ms[0].description, 'Standard')
    assert.equal(ms[1].description, undefined)
  })

  it('behaelt die Reihenfolge der CLI', () => {
    // Die CLI nennt in der Regel das Aktuellste zuerst. Alphabetisch zu
    // sortieren wuerde diese Aussage zerstoeren.
    const ms = parseCodexModels(CODEX_JSON)
    assert.equal(ms[0].id, 'gpt-6-astra')
  })

  it('ueberspringt Eintraege ohne slug, statt leere Namen zu zeigen', () => {
    const ms = parseCodexModels(JSON.stringify({ models: [{ display_name: 'Ohne Slug' }, { slug: 'gut' }] }))
    assert.deepEqual(ms.map(m => m.id), ['gut'])
  })

  it('gibt bei kaputtem oder fremdem JSON eine leere Liste', () => {
    for (const bad of ['', 'kein json', '{}', '{"models":"text"}', 'null', '[]']) {
      assert.deepEqual(parseCodexModels(bad), [])
    }
  })

  it('vertraegt auch ein blankes Array statt des models-Objekts', () => {
    const ms = parseCodexModels(JSON.stringify([{ slug: 'a' }, { slug: 'b' }]))
    assert.deepEqual(ms.map(m => m.id), ['a', 'b'])
  })
})

describe('parseOpenCodeModels', () => {
  it('liest anbieter/modell je Zeile', () => {
    const ms = parseOpenCodeModels(OPENCODE_OUT)
    assert.equal(ms.length, 3)
    assert.equal(ms[0].id, 'opencode/big-pickle')
    assert.equal(ms[0].label, ms[0].id)
  })

  it('verwirft Zeilen, die kein Modell sind', () => {
    // Die CLI schreibt gelegentlich ein Banner oder eine Warnung dazwischen.
    const out = 'Loading providers...\nopencode/gut\n\n  \nFehler: kein Anbieter angemeldet\nnurEinWort\n'
    assert.deepEqual(parseOpenCodeModels(out).map(m => m.id), ['opencode/gut'])
  })

  it('verwirft Zeilen mit Leerzeichen im Namen', () => {
    assert.deepEqual(parseOpenCodeModels('anbieter/mit leerzeichen\nanbieter/ohne\n').map(m => m.id), ['anbieter/ohne'])
  })

  it('entfernt Doppelte und behaelt die erste Reihenfolge', () => {
    assert.deepEqual(parseOpenCodeModels('a/x\nb/y\na/x\n').map(m => m.id), ['a/x', 'b/y'])
  })

  it('gibt bei leerer Ausgabe eine leere Liste', () => {
    assert.deepEqual(parseOpenCodeModels(''), [])
  })
})

describe('CLAUDE_CODE_MODEL_ALIASES', () => {
  it('nennt genau die drei, die `claude --help` als Beispiel auffuehrt', () => {
    assert.deepEqual([...CLAUDE_CODE_MODEL_ALIASES].map(m => m.id), ['opus', 'sonnet', 'fable'])
  })

  it('behauptet kein haiku', () => {
    // Es gibt ihn, aber die Hilfe der CLI nennt ihn nicht. Was nicht belegt ist,
    // steht hier nicht — das Freitextfeld nimmt ihn trotzdem entgegen.
    assert.ok(![...CLAUDE_CODE_MODEL_ALIASES].some(m => m.id === 'haiku'))
  })

  it('jeder Eintrag traegt eine Beschriftung', () => {
    for (const m of CLAUDE_CODE_MODEL_ALIASES) {
      assert.equal(typeof m.label, 'string')
      assert.ok(m.label.length > 0)
    }
  })
})
