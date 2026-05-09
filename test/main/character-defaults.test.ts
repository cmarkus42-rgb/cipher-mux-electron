import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SEED_CHARACTERS,
  DEFAULT_CHARACTER_ID,
  extractCharacterBlock,
  RELAY_CHARACTER_BLOCK,
  CIPHER_CHARACTER_BLOCK,
  WAYNE_CHARACTER_BLOCK,
  KYNIKER_CHARACTER_BLOCK,
  THEAITETOS_CHARACTER_BLOCK,
  GLITCH_CHARACTER_BLOCK,
} from '../../src/main/character/character-defaults'

describe('SEED_CHARACTERS', () => {
  it('contains exactly 6 personas', () => {
    assert.equal(SEED_CHARACTERS.length, 6)
  })

  it('contains all expected IDs', () => {
    const ids = SEED_CHARACTERS.map(c => c.id)
    assert.deepEqual(ids.sort(), ['cipher', 'glitch', 'kyniker', 'relay', 'theaitetos', 'wayne'])
  })

  it('has relay as default', () => {
    assert.equal(DEFAULT_CHARACTER_ID, 'relay')
    const relay = SEED_CHARACTERS.find(c => c.id === 'relay')
    assert.ok(relay)
    assert.equal(relay!.isDefault, true)
  })

  it('non-default characters have isDefault=false', () => {
    const nonDefault = SEED_CHARACTERS.filter(c => c.id !== 'relay')
    for (const char of nonDefault) {
      assert.equal(char.isDefault, false, `${char.id} should have isDefault=false`)
    }
  })

  it('all characters have non-empty prompts', () => {
    for (const char of SEED_CHARACTERS) {
      assert.ok(char.prompt.trim().length > 0, `${char.id} should have a non-empty prompt`)
    }
  })

  it('all characters have security section in their prompt', () => {
    for (const char of SEED_CHARACTERS) {
      assert.ok(
        char.prompt.includes('Sicherheit'),
        `${char.id} prompt should contain security section`
      )
    }
  })
})

describe('extractCharacterBlock', () => {
  it('returns known block for all built-in characters', () => {
    const expected: Record<string, string> = {
      relay: RELAY_CHARACTER_BLOCK,
      cipher: CIPHER_CHARACTER_BLOCK,
      wayne: WAYNE_CHARACTER_BLOCK,
      kyniker: KYNIKER_CHARACTER_BLOCK,
      theaitetos: THEAITETOS_CHARACTER_BLOCK,
      glitch: GLITCH_CHARACTER_BLOCK,
    }

    for (const [id, block] of Object.entries(expected)) {
      const char = SEED_CHARACTERS.find(c => c.id === id)!
      const result = extractCharacterBlock(char)
      assert.equal(result, block, `extractCharacterBlock for ${id} should return the known block`)
    }
  })

  it('extracts character section from custom character with ## Companion', () => {
    const custom = { id: 'custom-1', prompt: 'Character part\n\n## Companion\n\nCompanion part' }
    const result = extractCharacterBlock(custom)
    assert.equal(result, 'Character part')
  })

  it('returns full prompt for custom character without ## Companion', () => {
    const custom = { id: 'custom-2', prompt: 'Just the whole prompt' }
    const result = extractCharacterBlock(custom)
    assert.equal(result, 'Just the whole prompt')
  })
})
