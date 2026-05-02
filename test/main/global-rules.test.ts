import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_GLOBAL_RULES,
  resolveTemplateVariables,
  buildInjectionBlock,
} from '../../src/main/config/global-rules'

describe('DEFAULT_GLOBAL_RULES', () => {
  it('contains key rules', () => {
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Plan vor Code'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Test-First'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Off-Limits'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Token-Disziplin'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Sicherheit'))
  })
})

describe('resolveTemplateVariables', () => {
  it('replaces display_name', () => {
    const result = resolveTemplateVariables('Hallo {{display_name}}!', { displayName: 'Christian' })
    assert.equal(result, 'Hallo Christian!')
  })

  it('replaces user_profile_yaml', () => {
    const yaml = 'level: fortgeschritten\npreferences:\n  - vitest > jest'
    const result = resolveTemplateVariables('Profil:\n{{user_profile_yaml}}', { userProfileYaml: yaml })
    assert.ok(result.includes('level: fortgeschritten'))
  })

  it('replaces evolved_annotations', () => {
    const result = resolveTemplateVariables('Anpassungen: {{evolved_annotations}}', {
      evolvedAnnotations: 'User bevorzugt knappere Antworten',
    })
    assert.ok(result.includes('User bevorzugt knappere Antworten'))
  })

  it('replaces missing variables with empty string', () => {
    const result = resolveTemplateVariables('Name: {{display_name}}, Profil: {{user_profile_yaml}}', {})
    assert.equal(result, 'Name: , Profil: ')
  })

  it('handles multiple occurrences of same variable', () => {
    const result = resolveTemplateVariables('{{display_name}} sagt {{display_name}}', { displayName: 'Test' })
    assert.equal(result, 'Test sagt Test')
  })

  it('leaves non-template text unchanged', () => {
    const result = resolveTemplateVariables('No variables here.', {})
    assert.equal(result, 'No variables here.')
  })
})

describe('buildInjectionBlock', () => {
  it('combines rules and character block', () => {
    const result = buildInjectionBlock('Rule 1\nRule 2', 'Du bist Cipher.')
    assert.ok(result.includes('Rule 1'))
    assert.ok(result.includes('Du bist Cipher.'))
    assert.ok(result.indexOf('Rule 1') < result.indexOf('Du bist Cipher.'))
  })

  it('omits empty rules', () => {
    const result = buildInjectionBlock('', 'Du bist Cipher.')
    assert.equal(result, 'Du bist Cipher.')
  })

  it('omits empty character block', () => {
    const result = buildInjectionBlock('Rule 1', '')
    assert.equal(result, 'Rule 1')
  })

  it('returns empty string when both empty', () => {
    const result = buildInjectionBlock('', '')
    assert.equal(result, '')
  })
})
