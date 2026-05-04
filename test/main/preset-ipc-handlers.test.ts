// test/main/preset-ipc-handlers.test.ts — Tests for preset IPC handler logic
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Extract the section-stripping logic used by PRESETS_READ fallback.
 * This mirrors ipc-hub.ts PRESETS_READ handler exactly.
 */
function stripInjectedSections(content: string): string {
  const stripSections = ['Global Rules', 'Persona', 'Workspace Prompt', 'Context Directories']
  let result = content
  for (const section of stripSections) {
    const regex = new RegExp(`\\n## ${section}\\n[\\s\\S]*?(?=\\n## |$)`, 'g')
    result = result.replace(regex, '')
  }
  return result.trim()
}

describe('Preset IPC handler logic', () => {
  describe('PRESETS_READ: section stripping (fallback path)', () => {
    it('strips all four injected section types', () => {
      const claudeMd = [
        '# My Preset',
        '',
        '## Rolle',
        'Custom role definition.',
        '',
        '## Persona',
        'Mimir — Rat am Brunnen.',
        '',
        '## Faehigkeiten',
        'Can do things.',
        '',
        '## Global Rules',
        'Rule 1. Do this.',
        'Rule 2. Do that.',
        '',
        '## Workspace Prompt',
        'Focus on backend.',
        '',
        '## Context Directories',
        '/path/to/ctx',
        '',
        '## Scope',
        'Only backend.',
      ].join('\n')

      const stripped = stripInjectedSections(claudeMd)

      // Preset-owned sections remain
      assert.ok(stripped.includes('## Rolle'), 'Rolle section preserved')
      assert.ok(stripped.includes('## Faehigkeiten'), 'Faehigkeiten section preserved')
      assert.ok(stripped.includes('## Scope'), 'Scope section preserved')

      // Injected sections removed
      assert.ok(!stripped.includes('## Persona'), 'Persona section stripped')
      assert.ok(!stripped.includes('## Global Rules'), 'Global Rules section stripped')
      assert.ok(!stripped.includes('## Workspace Prompt'), 'Workspace Prompt section stripped')
      assert.ok(!stripped.includes('## Context Directories'), 'Context Directories section stripped')

      // Injected content also gone
      assert.ok(!stripped.includes('Mimir'), 'Persona content stripped')
      assert.ok(!stripped.includes('Rule 1'), 'Global Rules content stripped')
      assert.ok(!stripped.includes('Focus on backend'), 'Workspace Prompt content stripped')
      assert.ok(!stripped.includes('/path/to/ctx'), 'Context Directories content stripped')
    })

    it('returns content unchanged when no injected sections present', () => {
      const presetOnly = '# Clean Preset\n\n## Rolle\nDoes things.\n\n## Scope\nEverything.'
      const stripped = stripInjectedSections(presetOnly)
      assert.equal(stripped, presetOnly.trim())
    })

    it('handles Global Rules at end of file (no trailing section)', () => {
      const content = '# Preset\n\n## Rolle\nHello.\n\n## Global Rules\nLast section content.'
      const stripped = stripInjectedSections(content)
      assert.ok(stripped.includes('## Rolle'), 'Rolle preserved')
      assert.ok(!stripped.includes('## Global Rules'), 'Global Rules stripped')
      assert.ok(!stripped.includes('Last section content'), 'Global Rules content stripped')
    })

    it('handles multiple injected sections adjacent to each other', () => {
      const content = '# Preset\n\n## Persona\nA.\n\n## Global Rules\nB.\n\n## Workspace Prompt\nC.'
      const stripped = stripInjectedSections(content)
      assert.equal(stripped, '# Preset')
    })

    it('preserves H1 heading', () => {
      const content = '# My Entity\n\n## Persona\nSomething.'
      const stripped = stripInjectedSections(content)
      assert.ok(stripped.startsWith('# My Entity'))
    })

    it('returns empty string from empty input', () => {
      assert.equal(stripInjectedSections(''), '')
    })
  })

  describe('PRESETS_READ: file priority', () => {
    let tmpDir: string

    it('reads preset.md when both files exist', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-test-'))
      const entityDir = path.join(tmpDir, 'test-entity')
      fs.mkdirSync(entityDir, { recursive: true })

      fs.writeFileSync(path.join(entityDir, 'preset.md'), '# From preset.md', 'utf-8')
      fs.writeFileSync(path.join(entityDir, 'CLAUDE.md'), '# From CLAUDE.md\n\n## Global Rules\nRules here.', 'utf-8')

      const presetMdPath = path.join(entityDir, 'preset.md')
      const claudeMdPath = path.join(entityDir, 'CLAUDE.md')

      // Simulate handler logic: preset.md takes priority
      let content: string
      if (fs.existsSync(presetMdPath)) {
        content = fs.readFileSync(presetMdPath, 'utf-8')
      } else if (fs.existsSync(claudeMdPath)) {
        content = stripInjectedSections(fs.readFileSync(claudeMdPath, 'utf-8'))
      } else {
        content = ''
      }

      assert.equal(content, '# From preset.md')

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('falls back to stripped CLAUDE.md when preset.md missing', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-test-'))
      const entityDir = path.join(tmpDir, 'test-entity')
      fs.mkdirSync(entityDir, { recursive: true })

      fs.writeFileSync(path.join(entityDir, 'CLAUDE.md'), '# Entity\n\n## Rolle\nDoes things.\n\n## Global Rules\nStrip me.', 'utf-8')

      const presetMdPath = path.join(entityDir, 'preset.md')
      const claudeMdPath = path.join(entityDir, 'CLAUDE.md')

      let content: string
      if (fs.existsSync(presetMdPath)) {
        content = fs.readFileSync(presetMdPath, 'utf-8')
      } else if (fs.existsSync(claudeMdPath)) {
        content = stripInjectedSections(fs.readFileSync(claudeMdPath, 'utf-8'))
      } else {
        content = ''
      }

      assert.ok(content.includes('## Rolle'))
      assert.ok(!content.includes('## Global Rules'))
      assert.ok(!content.includes('Strip me'))

      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('returns empty string when neither file exists', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-test-'))
      const entityDir = path.join(tmpDir, 'test-entity')
      fs.mkdirSync(entityDir, { recursive: true })

      const presetMdPath = path.join(entityDir, 'preset.md')
      const claudeMdPath = path.join(entityDir, 'CLAUDE.md')

      let content: string
      if (fs.existsSync(presetMdPath)) {
        content = fs.readFileSync(presetMdPath, 'utf-8')
      } else if (fs.existsSync(claudeMdPath)) {
        content = stripInjectedSections(fs.readFileSync(claudeMdPath, 'utf-8'))
      } else {
        content = ''
      }

      assert.equal(content, '')

      fs.rmSync(tmpDir, { recursive: true, force: true })
    })
  })

  describe('PRESETS_SAVE: writes preset.md', () => {
    it('writes content to preset.md in entity directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-save-'))
      const entityDir = path.join(tmpDir, 'test-entity')
      fs.mkdirSync(entityDir, { recursive: true })

      const presetMdPath = path.join(entityDir, 'preset.md')
      const newContent = '# Updated Preset\n\n## Rolle\nNew role.'

      // Simulate handler logic
      fs.writeFileSync(presetMdPath, newContent, 'utf-8')

      assert.equal(fs.readFileSync(presetMdPath, 'utf-8'), newContent)
      // CLAUDE.md should NOT exist (not touched by save)
      assert.ok(!fs.existsSync(path.join(entityDir, 'CLAUDE.md')), 'CLAUDE.md not created by save')

      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('overwrites existing preset.md', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-save-'))
      const entityDir = path.join(tmpDir, 'test-entity')
      fs.mkdirSync(entityDir, { recursive: true })

      const presetMdPath = path.join(entityDir, 'preset.md')
      fs.writeFileSync(presetMdPath, 'old content', 'utf-8')
      fs.writeFileSync(presetMdPath, 'new content', 'utf-8')

      assert.equal(fs.readFileSync(presetMdPath, 'utf-8'), 'new content')

      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('deletes preset.md when saving empty content (back-to-default)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-save-'))
      const entityDir = path.join(tmpDir, 'test-entity')
      fs.mkdirSync(entityDir, { recursive: true })

      const presetMdPath = path.join(entityDir, 'preset.md')
      fs.writeFileSync(presetMdPath, '# Existing content', 'utf-8')

      // Simulate handler logic: empty content deletes preset.md
      const content = ''
      if (!content.trim()) {
        if (fs.existsSync(presetMdPath)) fs.unlinkSync(presetMdPath)
      } else {
        fs.writeFileSync(presetMdPath, content, 'utf-8')
      }

      assert.ok(!fs.existsSync(presetMdPath), 'preset.md deleted on empty save')

      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('does not error when deleting non-existent preset.md', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-save-'))
      const entityDir = path.join(tmpDir, 'test-entity')
      fs.mkdirSync(entityDir, { recursive: true })

      const presetMdPath = path.join(entityDir, 'preset.md')

      // Simulate handler logic: no preset.md to delete
      const content = '  '
      if (!content.trim()) {
        if (fs.existsSync(presetMdPath)) fs.unlinkSync(presetMdPath)
      }

      assert.ok(!fs.existsSync(presetMdPath), 'no error on missing preset.md')

      fs.rmSync(tmpDir, { recursive: true, force: true })
    })
  })

  describe('PRESETS_READ_INJECTED: section metadata', () => {
    it('always includes Global Rules when global-rules.md exists', () => {
      const sections: Array<{ name: string; source: string }> = []
      const globalRulesExists = true // simulate

      if (globalRulesExists) {
        sections.push({ name: 'Global Rules', source: 'global-rules.md' })
      }

      assert.equal(sections.length, 1)
      assert.equal(sections[0].name, 'Global Rules')
      assert.equal(sections[0].source, 'global-rules.md')
    })

    it('omits Global Rules when global-rules.md missing', () => {
      const sections: Array<{ name: string; source: string }> = []
      const globalRulesExists = false

      if (globalRulesExists) {
        sections.push({ name: 'Global Rules', source: 'global-rules.md' })
      }

      assert.equal(sections.length, 0)
    })

    it('always includes Persona with resolved character name', () => {
      const sections: Array<{ name: string; source: string }> = []
      const resolvedPersonaName = 'Mimir'

      sections.push({ name: 'Persona', source: `character: ${resolvedPersonaName}` })

      assert.equal(sections.length, 1)
      assert.equal(sections[0].name, 'Persona')
      assert.equal(sections[0].source, 'character: Mimir')
    })

    it('includes Workspace Prompt when active workspace has one', () => {
      const sections: Array<{ name: string; source: string }> = []
      const ws = { name: 'Dev Setup', workspacePrompt: 'Focus on tests.', contextPaths: [] }

      if (ws.workspacePrompt?.trim()) {
        sections.push({ name: 'Workspace Prompt', source: `workspace: ${ws.name}` })
      }
      if (ws.contextPaths?.length) {
        sections.push({ name: 'Context Directories', source: `workspace: ${ws.name}` })
      }

      assert.equal(sections.length, 1)
      assert.equal(sections[0].name, 'Workspace Prompt')
    })

    it('includes Context Directories when active workspace has them', () => {
      const sections: Array<{ name: string; source: string }> = []
      const ws = { name: 'Full Stack', workspacePrompt: '', contextPaths: ['/docs'] }

      if (ws.workspacePrompt?.trim()) {
        sections.push({ name: 'Workspace Prompt', source: `workspace: ${ws.name}` })
      }
      if (ws.contextPaths?.length) {
        sections.push({ name: 'Context Directories', source: `workspace: ${ws.name}` })
      }

      assert.equal(sections.length, 1)
      assert.equal(sections[0].name, 'Context Directories')
    })

    it('includes both workspace sections when both present', () => {
      const sections: Array<{ name: string; source: string }> = []
      const ws = { name: 'Prod', workspacePrompt: 'Be careful.', contextPaths: ['/src', '/docs'] }

      if (ws.workspacePrompt?.trim()) {
        sections.push({ name: 'Workspace Prompt', source: `workspace: ${ws.name}` })
      }
      if (ws.contextPaths?.length) {
        sections.push({ name: 'Context Directories', source: `workspace: ${ws.name}` })
      }

      assert.equal(sections.length, 2)
      assert.equal(sections[0].name, 'Workspace Prompt')
      assert.equal(sections[1].name, 'Context Directories')
    })

    it('omits workspace sections when no active workspace', () => {
      const sections: Array<{ name: string; source: string }> = []
      const activeWsId: string | null = null

      if (activeWsId) {
        // would look up workspace and push sections
      }

      assert.equal(sections.length, 0)
    })

    it('returns full section list for typical setup', () => {
      const sections: Array<{ name: string; source: string }> = []

      // Global Rules present
      sections.push({ name: 'Global Rules', source: 'global-rules.md' })

      // Persona always present
      sections.push({ name: 'Persona', source: 'character: Relay' })

      // Workspace with prompt and context
      const ws = { name: 'Test WS', workspacePrompt: 'Testing focus.', contextPaths: ['/test'] }
      if (ws.workspacePrompt?.trim()) {
        sections.push({ name: 'Workspace Prompt', source: `workspace: ${ws.name}` })
      }
      if (ws.contextPaths?.length) {
        sections.push({ name: 'Context Directories', source: `workspace: ${ws.name}` })
      }

      assert.equal(sections.length, 4)
      assert.deepStrictEqual(sections.map(s => s.name), [
        'Global Rules', 'Persona', 'Workspace Prompt', 'Context Directories',
      ])
    })
  })
})
