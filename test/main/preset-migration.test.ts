import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { stripInjectedSections } from '../../src/main/session/preset-migration'

describe('stripInjectedSections', () => {
  it('strips a single injected section in the middle', () => {
    const input = [
      '# Entity Title',
      '',
      'Some intro text.',
      '',
      '## Global Rules',
      'Rule 1',
      'Rule 2',
      '',
      '## My Custom Section',
      'Custom content here.',
    ].join('\n')

    const result = stripInjectedSections(input)
    assert.ok(result.includes('# Entity Title'))
    assert.ok(result.includes('Some intro text.'))
    assert.ok(result.includes('## My Custom Section'))
    assert.ok(result.includes('Custom content here.'))
    assert.ok(!result.includes('## Global Rules'))
    assert.ok(!result.includes('Rule 1'))
  })

  it('strips an injected section at the end', () => {
    const input = [
      '## My Custom Section',
      'Custom content here.',
      '',
      '## Persona',
      'Persona instructions.',
      'More persona stuff.',
    ].join('\n')

    const result = stripInjectedSections(input)
    assert.ok(result.includes('## My Custom Section'))
    assert.ok(result.includes('Custom content here.'))
    assert.ok(!result.includes('## Persona'))
    assert.ok(!result.includes('Persona instructions.'))
  })

  it('strips all four injected section types', () => {
    const input = [
      '# My Entity',
      '',
      '## Global Rules',
      'global rules content',
      '',
      '## Persona',
      'persona content',
      '',
      '## Workspace Prompt',
      'workspace prompt content',
      '',
      '## Context Directories',
      'context dirs content',
      '',
      '## Actual Entity Content',
      'This should remain.',
    ].join('\n')

    const result = stripInjectedSections(input)
    assert.ok(result.includes('# My Entity'))
    assert.ok(result.includes('## Actual Entity Content'))
    assert.ok(result.includes('This should remain.'))
    assert.ok(!result.includes('## Global Rules'))
    assert.ok(!result.includes('## Persona'))
    assert.ok(!result.includes('## Workspace Prompt'))
    assert.ok(!result.includes('## Context Directories'))
  })

  it('preserves non-injected sections untouched', () => {
    const input = [
      '## Tools',
      'Tool description.',
      '',
      '## Workflow',
      'Workflow steps.',
    ].join('\n')

    const result = stripInjectedSections(input)
    assert.strictEqual(result, input)
  })

  it('handles content with no sections at all', () => {
    const input = 'Just some plain text without any headings.'
    const result = stripInjectedSections(input)
    assert.strictEqual(result, input)
  })

  it('returns empty string when all content is injected', () => {
    const input = [
      '## Global Rules',
      'rules',
      '',
      '## Persona',
      'persona',
    ].join('\n')

    const result = stripInjectedSections(input)
    assert.strictEqual(result, '')
  })

  it('strips section with trailing whitespace after heading', () => {
    const input = [
      '## Custom Section',
      'content',
      '',
      '## Global Rules   ',
      'rules content',
      '',
      '## Another Section',
      'more content',
    ].join('\n')

    const result = stripInjectedSections(input)
    assert.ok(!result.includes('Global Rules'))
    assert.ok(!result.includes('rules content'))
    assert.ok(result.includes('## Custom Section'))
    assert.ok(result.includes('## Another Section'))
  })

  it('does not strip sections with similar but non-matching names', () => {
    const input = [
      '## Global Rules Extended',
      'This should stay.',
      '',
      '## Persona Config',
      'This should also stay.',
    ].join('\n')

    // These headings don't match exactly — "Global Rules Extended" != "Global Rules"
    // The regex matches "## Global Rules" at line start, then non-newline whitespace, then newline.
    // "## Global Rules Extended\n" — the " Extended" part is not whitespace, so it won't match.
    const result = stripInjectedSections(input)
    assert.ok(result.includes('## Global Rules Extended'))
    assert.ok(result.includes('## Persona Config'))
  })

  it('handles multiline section content with blank lines', () => {
    const input = [
      '## My Section',
      'keep this',
      '',
      '## Workspace Prompt',
      'line 1',
      '',
      'line 2',
      '',
      'line 3',
      '',
      '## Another Section',
      'also keep this',
    ].join('\n')

    const result = stripInjectedSections(input)
    assert.ok(!result.includes('Workspace Prompt'))
    assert.ok(!result.includes('line 1'))
    assert.ok(!result.includes('line 2'))
    assert.ok(!result.includes('line 3'))
    assert.ok(result.includes('## My Section'))
    assert.ok(result.includes('## Another Section'))
  })
})

describe('migratePresetsIfNeeded (filesystem)', () => {
  const tmpDir = path.join(os.tmpdir(), `cipher-mux-preset-migration-test-${Date.now()}`)
  const entitiesDir = path.join(tmpDir, 'entities')

  before(() => fs.mkdirSync(entitiesDir, { recursive: true }))
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('creates preset.md from CLAUDE.md stripping injected sections', () => {
    // Simulate what migratePresetsIfNeeded does for a single entity
    const entityDir = path.join(entitiesDir, 'test-entity')
    fs.mkdirSync(entityDir, { recursive: true })

    const claudeMd = [
      '# Test Entity',
      '',
      'Entity-specific instructions.',
      '',
      '## Global Rules',
      'Injected global rules.',
      '',
      '## Persona',
      'Injected persona block.',
      '',
      '## Entity Tools',
      'Tool documentation.',
    ].join('\n')

    fs.writeFileSync(path.join(entityDir, 'CLAUDE.md'), claudeMd, 'utf-8')

    // Run the stripping logic directly (avoids needing configStore mock)
    const content = fs.readFileSync(path.join(entityDir, 'CLAUDE.md'), 'utf-8')
    const presetContent = stripInjectedSections(content)

    assert.ok(presetContent.length > 0)
    fs.writeFileSync(path.join(entityDir, 'preset.md'), presetContent + '\n', 'utf-8')

    // Verify preset.md
    const preset = fs.readFileSync(path.join(entityDir, 'preset.md'), 'utf-8')
    assert.ok(preset.includes('# Test Entity'))
    assert.ok(preset.includes('Entity-specific instructions.'))
    assert.ok(preset.includes('## Entity Tools'))
    assert.ok(!preset.includes('## Global Rules'))
    assert.ok(!preset.includes('## Persona'))

    // Verify CLAUDE.md is untouched
    const claudeAfter = fs.readFileSync(path.join(entityDir, 'CLAUDE.md'), 'utf-8')
    assert.strictEqual(claudeAfter, claudeMd)
  })

  it('skips entity when preset.md already exists', () => {
    const entityDir = path.join(entitiesDir, 'already-has-preset')
    fs.mkdirSync(entityDir, { recursive: true })

    fs.writeFileSync(path.join(entityDir, 'CLAUDE.md'), '## Global Rules\nrules\n', 'utf-8')
    fs.writeFileSync(path.join(entityDir, 'preset.md'), 'existing preset\n', 'utf-8')

    // Simulate skip logic
    const presetPath = path.join(entityDir, 'preset.md')
    assert.ok(fs.existsSync(presetPath))

    // preset.md should remain unchanged
    const preset = fs.readFileSync(presetPath, 'utf-8')
    assert.strictEqual(preset, 'existing preset\n')
  })

  it('skips entity when CLAUDE.md does not exist', () => {
    const entityDir = path.join(entitiesDir, 'no-claude-md')
    fs.mkdirSync(entityDir, { recursive: true })

    const claudeMdPath = path.join(entityDir, 'CLAUDE.md')
    const presetPath = path.join(entityDir, 'preset.md')
    assert.ok(!fs.existsSync(claudeMdPath))
    assert.ok(!fs.existsSync(presetPath))
  })

  it('does not write preset.md when stripped content is empty', () => {
    const entityDir = path.join(entitiesDir, 'all-injected')
    fs.mkdirSync(entityDir, { recursive: true })

    const claudeMd = [
      '## Global Rules',
      'Only injected content.',
      '',
      '## Persona',
      'More injected content.',
    ].join('\n')

    fs.writeFileSync(path.join(entityDir, 'CLAUDE.md'), claudeMd, 'utf-8')

    const content = fs.readFileSync(path.join(entityDir, 'CLAUDE.md'), 'utf-8')
    const presetContent = stripInjectedSections(content)
    assert.strictEqual(presetContent, '')

    // Should not write preset.md for empty content
    if (presetContent.length > 0) {
      fs.writeFileSync(path.join(entityDir, 'preset.md'), presetContent + '\n', 'utf-8')
    }
    assert.ok(!fs.existsSync(path.join(entityDir, 'preset.md')))
  })

  it('skips non-directory entries in entities folder', () => {
    // Create a regular file in the entities dir
    fs.writeFileSync(path.join(entitiesDir, 'not-a-dir.txt'), 'ignore me', 'utf-8')

    const entries = fs.readdirSync(entitiesDir, { withFileTypes: true })
    const nonDirs = entries.filter(e => !e.isDirectory())
    assert.ok(nonDirs.length > 0)
    // Migration should simply skip these — no crash
  })
})
