import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { validateBearer, generateApiKey } from '../../src/main/mcp/mcp-auth'

describe('generateApiKey', () => {
  it('returns a 32-character hex string', () => {
    const key = generateApiKey()
    assert.equal(key.length, 32)
    assert.match(key, /^[0-9a-f]{32}$/)
  })

  it('returns unique keys on consecutive calls', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    assert.notEqual(a, b)
  })
})

describe('validateBearer', () => {
  const apiKey = generateApiKey()

  it('accepts a valid Bearer token', () => {
    assert.equal(validateBearer(`Bearer ${apiKey}`, apiKey), true)
  })

  it('rejects undefined header', () => {
    assert.equal(validateBearer(undefined, apiKey), false)
  })

  it('rejects empty string', () => {
    assert.equal(validateBearer('', apiKey), false)
  })

  it('rejects header without space after Bearer', () => {
    assert.equal(validateBearer(`Bearer${apiKey}`, apiKey), false)
  })

  it('rejects header with double space', () => {
    assert.equal(validateBearer(`Bearer  ${apiKey}`, apiKey), false)
  })

  it('rejects wrong scheme', () => {
    assert.equal(validateBearer(`Basic ${apiKey}`, apiKey), false)
  })

  it('rejects token with length mismatch', () => {
    assert.equal(validateBearer('Bearer abc', apiKey), false)
  })

  it('rejects wrong token of correct length', () => {
    const wrongKey = 'a'.repeat(apiKey.length)
    assert.equal(validateBearer(`Bearer ${wrongKey}`, apiKey), false)
  })

  it('rejects token-only without scheme', () => {
    assert.equal(validateBearer(apiKey, apiKey), false)
  })

  it('rejects extra segments', () => {
    assert.equal(validateBearer(`Bearer ${apiKey} extra`, apiKey), false)
  })
})
