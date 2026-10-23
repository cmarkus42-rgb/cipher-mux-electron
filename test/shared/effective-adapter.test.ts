import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveEffectiveAdapterId } from '../../src/shared/effective-adapter'

// Der Preset-Editor zeigte fuer eine Rolle ohne eigene Wahl den globalen
// Default — auch beim Local Worker, der laut Registry opencode faehrt. Anzeige
// und Modellliste logen damit ueber die CLI, die beim Start tatsaechlich kommt.
// Die Kette muss dieselbe sein wie in `session/entity-runtime.ts`.

describe('resolveEffectiveAdapterId', () => {
  it('die Wahl pro Rolle schlaegt alles', () => {
    assert.equal(
      resolveEffectiveAdapterId({ override: 'codex', roleDefault: 'opencode', globalDefault: 'claude-code' }),
      'codex',
    )
  })

  it('ohne eigene Wahl gilt der Rollen-Default, nicht der globale', () => {
    assert.equal(
      resolveEffectiveAdapterId({ override: null, roleDefault: 'opencode', globalDefault: 'claude-code' }),
      'opencode',
    )
  })

  it('ohne Rollen-Default gilt der globale', () => {
    assert.equal(
      resolveEffectiveAdapterId({ override: null, roleDefault: null, globalDefault: 'codex' }),
      'codex',
    )
  })

  it('eine leere Zeichenkette ist keine Wahl', () => {
    assert.equal(
      resolveEffectiveAdapterId({ override: '', roleDefault: '', globalDefault: 'claude-code' }),
      'claude-code',
    )
  })
})
