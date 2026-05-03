import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { shellEscapePath, shellEscapePaths } from '../../src/shared/shell-escape'

describe('shellEscapePath', () => {
  it('wraps simple path in single quotes', () => {
    assert.equal(shellEscapePath('/usr/local/bin/node'), "'/usr/local/bin/node'")
  })

  it('escapes spaces in path', () => {
    assert.equal(shellEscapePath('/Users/me/My Documents/file.txt'), "'/Users/me/My Documents/file.txt'")
  })

  it('escapes parentheses', () => {
    assert.equal(shellEscapePath('/path/to/file (1).txt'), "'/path/to/file (1).txt'")
  })

  it('escapes Umlaute and special chars', () => {
    assert.equal(shellEscapePath('/path/to/Übersicht.md'), "'/path/to/Übersicht.md'")
  })

  it('escapes embedded single quotes', () => {
    assert.equal(shellEscapePath("/path/to/it's a file.txt"), "'/path/to/it'\\''s a file.txt'")
  })

  it('escapes dollar signs and backticks (inside single quotes they are literal)', () => {
    const result = shellEscapePath('/path/$HOME/`cmd`/file')
    assert.equal(result, "'/path/$HOME/`cmd`/file'")
  })

  it('escapes double quotes', () => {
    assert.equal(shellEscapePath('/path/to/"quoted".txt'), "'/path/to/\"quoted\".txt'")
  })

  it('handles empty string', () => {
    assert.equal(shellEscapePath(''), "''")
  })
})

describe('shellEscapePaths', () => {
  it('joins multiple paths space-separated', () => {
    const result = shellEscapePaths(['/path/a.txt', '/path/b.txt'])
    assert.equal(result, "'/path/a.txt' '/path/b.txt'")
  })

  it('escapes each path independently', () => {
    const result = shellEscapePaths(['/My Files/doc.txt', "/it's here/file.md"])
    assert.equal(result, "'/My Files/doc.txt' '/it'\\''s here/file.md'")
  })

  it('handles single file', () => {
    assert.equal(shellEscapePaths(['/simple.txt']), "'/simple.txt'")
  })

  it('handles empty array', () => {
    assert.equal(shellEscapePaths([]), '')
  })
})
