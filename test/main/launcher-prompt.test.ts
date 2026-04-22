import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { buildLauncherPrompt } from '../../src/main/project/launcher-prompt'

describe('buildLauncherPrompt', () => {
  it('includes the project directory path', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/path/to/proj' })
    assert.ok(prompt.includes('/path/to/proj'))
  })

  it('mentions merge-mode for existing directory', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.match(prompt, /merge/i)
    assert.match(prompt, /existiert schon/i)
  })

  it('mentions subagent usage', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.match(prompt, /subagent/i)
  })

  it('includes requirements file path when provided', () => {
    const prompt = buildLauncherPrompt({
      projectDir: '/any',
      requirementsRelPath: 'docs/requirements.docx',
    })
    assert.ok(prompt.includes('docs/requirements.docx'))
  })

  it('omits requirements hint when no file provided', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(!prompt.includes('Anforderungsdatei:'))
  })

  it('embeds extra context verbatim', () => {
    const prompt = buildLauncherPrompt({
      projectDir: '/any',
      extraContext: 'Stack ist Kotlin + Compose.',
    })
    assert.ok(prompt.includes('Kotlin + Compose'))
  })

  it('instructs to call kickoff_complete MCP tool', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(prompt.includes('kickoff_complete'))
  })

  it('mentions the fallback marker file', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(prompt.includes('.kickoff-complete'))
  })

  it('ends with /launch invocation', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.match(prompt.trimEnd(), /\/launch\s*$/)
  })

  it('includes quality baseline when BRAND provides one', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(typeof prompt === 'string')
    assert.ok(prompt.length > 100)
  })
})
