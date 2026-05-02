import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { containsCredentials } from '../../../src/main/companion/memory-store'

describe('credential-filter', () => {
  it('blocks password patterns', () => {
    assert.ok(containsCredentials('password = "supersecret123"') !== null)
    assert.ok(containsCredentials("api_key: 'sk-abc123def456'") !== null)
  })

  it('blocks Bearer JWT tokens', () => {
    assert.ok(containsCredentials('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw') !== null)
  })

  it('blocks AWS access keys', () => {
    assert.ok(containsCredentials('AKIAIOSFODNN7EXAMPLE') !== null)
  })

  it('blocks private keys', () => {
    assert.ok(containsCredentials('-----BEGIN RSA PRIVATE KEY-----') !== null)
  })

  it('allows normal text', () => {
    assert.equal(containsCredentials('User prefers TypeScript over JavaScript'), null)
    assert.equal(containsCredentials('The password reset flow needs improvement'), null)
  })

  it('allows text mentioning concepts without actual values', () => {
    assert.equal(containsCredentials('Store the API key in environment variables'), null)
    assert.equal(containsCredentials('token rotation policy is 90 days'), null)
  })
})
