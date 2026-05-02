import { test } from 'node:test'
import assert from 'assert/strict'
import { resolveModel, isValidModelChoice } from '../../../src/main/cyber-factory/model-resolver.js'

test('resolveModel — haiku resolves to versioned string', () => {
  assert.equal(resolveModel('haiku'), 'claude-haiku-4-5-20251001')
})

test('resolveModel — sonnet resolves to versioned string', () => {
  assert.equal(resolveModel('sonnet'), 'claude-sonnet-4-6')
})

test('resolveModel — opus resolves to versioned string', () => {
  assert.equal(resolveModel('opus'), 'claude-opus-4-6')
})

test('isValidModelChoice — valid choices return true', () => {
  assert.equal(isValidModelChoice('haiku'), true)
  assert.equal(isValidModelChoice('sonnet'), true)
  assert.equal(isValidModelChoice('opus'), true)
})

test('isValidModelChoice — invalid strings return false', () => {
  assert.equal(isValidModelChoice('gpt-4'), false)
  assert.equal(isValidModelChoice(''), false)
  assert.equal(isValidModelChoice('claude'), false)
  assert.equal(isValidModelChoice('SONNET'), false)
  assert.equal(isValidModelChoice('haiku3'), false)
})
