import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Unit tests for the entity CLAUDE.md assembly logic.
 * Mirrors assembleEntityClaudeMd() from session-manager.ts.
 *
 * Assembly order:
 * 1. preset.md content (verbatim)
 * 2. ## Persona (inserted after first H1)
 * 3. ## Global Rules (appended at end)
 * 4. ## Workspace Prompt (appended, optional)
 * 5. ## Context Directories (appended, optional)
 */

// Pure function mirroring assembleEntityClaudeMd logic (no class dependencies)
function assembleEntityClaudeMd(
  presetContent: string,
  characterBlock: string | null,
  globalRules: string,
  workspacePrompt?: string,
  contextPaths?: string[],
): string {
  let result = presetContent

  // Insert Persona after first H1 heading
  if (characterBlock) {
    const personaSection = `\n\n## Persona\n\n**WICHTIG: Diese Persona ueberschreibt alle globalen Persona-Definitionen (z.B. Mimir aus ~/.claude/CLAUDE.md). In dieser Session bist du NICHT Mimir.**\n\n${characterBlock}`
    const firstNewline = result.indexOf('\n')
    if (firstNewline > 0) {
      result = result.substring(0, firstNewline) + personaSection + result.substring(firstNewline)
    } else {
      result = result + personaSection
    }
  }

  // Append Global Rules at end
  if (globalRules.trim()) {
    result = result + `\n\n## Global Rules\n\n${globalRules.trim()}`
  }

  // Append Workspace Prompt (optional)
  if (workspacePrompt && workspacePrompt.trim()) {
    result = result + `\n\n## Workspace Prompt\n\n${workspacePrompt.trim()}`
  }

  // Append Context Directories (optional)
  if (contextPaths && contextPaths.length > 0) {
    const body = contextPaths.map((p) => `- \`${p}\``).join('\n')
    result = result + `\n\n## Context Directories\n\n${body}`
  }

  return result
}

// ── Preset verbatim ──────────────────────────────────────────────────────────

describe('assembleEntityClaudeMd — preset verbatim', () => {
  it('returns preset content unchanged when no layers given', () => {
    const preset = '# My Entity\n\nSome instructions here.\n'
    const result = assembleEntityClaudeMd(preset, null, '')
    assert.equal(result, preset)
  })

  it('preserves multi-line preset content exactly', () => {
    const preset = '# Orchestrator\n\n## Phase 1\n\nDo stuff.\n\n## Phase 2\n\nMore stuff.\n'
    const result = assembleEntityClaudeMd(preset, null, '')
    assert.equal(result, preset)
  })
})

// ── Persona insertion ────────────────────────────────────────────────────────

describe('assembleEntityClaudeMd — persona', () => {
  it('inserts persona after first H1', () => {
    const preset = '# Entity Title\n\nBody content here.'
    const result = assembleEntityClaudeMd(preset, 'Du bist der Orchestrator.', '')
    // First line should still be the H1
    assert.ok(result.startsWith('# Entity Title'))
    // Persona section should follow
    assert.ok(result.includes('## Persona'))
    assert.ok(result.includes('Du bist der Orchestrator.'))
    // Body content should still be present
    assert.ok(result.includes('Body content here.'))
  })

  it('persona appears before body content', () => {
    const preset = '# Title\n\nBody.'
    const result = assembleEntityClaudeMd(preset, 'My persona.', '')
    const personaIdx = result.indexOf('## Persona')
    const bodyIdx = result.indexOf('Body.')
    assert.ok(personaIdx < bodyIdx, 'Persona should appear before body content')
  })

  it('appends persona at end if no newline in preset', () => {
    const preset = '# Title'
    const result = assembleEntityClaudeMd(preset, 'Persona text.', '')
    assert.ok(result.includes('## Persona'))
    assert.ok(result.includes('Persona text.'))
  })

  it('skips persona when characterBlock is null', () => {
    const preset = '# Title\n\nBody.'
    const result = assembleEntityClaudeMd(preset, null, '')
    assert.ok(!result.includes('## Persona'))
  })

  it('skips persona when characterBlock is empty', () => {
    const preset = '# Title\n\nBody.'
    const result = assembleEntityClaudeMd(preset, '', '')
    // Empty string is falsy, so no persona
    assert.ok(!result.includes('## Persona'))
  })
})

// ── Global Rules ─────────────────────────────────────────────────────────────

describe('assembleEntityClaudeMd — global rules', () => {
  it('appends global rules at end', () => {
    const preset = '# Entity\n\nBody.'
    const rules = '1. Do not hallucinate.\n2. Be concise.'
    const result = assembleEntityClaudeMd(preset, null, rules)
    assert.ok(result.includes('## Global Rules'))
    assert.ok(result.includes('1. Do not hallucinate.'))
    // Global rules should be at the end
    const rulesIdx = result.indexOf('## Global Rules')
    assert.ok(rulesIdx > result.indexOf('Body.'))
  })

  it('skips global rules when empty/whitespace', () => {
    const preset = '# Title\n\nBody.'
    const result = assembleEntityClaudeMd(preset, null, '   ')
    assert.ok(!result.includes('## Global Rules'))
  })

  it('trims global rules content', () => {
    const preset = '# Title\n\nBody.'
    const result = assembleEntityClaudeMd(preset, null, '  rule1  \n')
    assert.ok(result.includes('rule1'))
    // Check it's trimmed (no leading spaces before rule1 in the section body)
    const rulesSection = result.split('## Global Rules\n\n')[1]
    assert.ok(rulesSection.startsWith('rule1'))
  })
})

// ── Workspace Prompt ─────────────────────────────────────────────────────────

describe('assembleEntityClaudeMd — workspace prompt', () => {
  it('appends workspace prompt after global rules', () => {
    const preset = '# Entity\n\nBody.'
    const rules = 'Rule 1.'
    const wsPrompt = 'Focus on security.'
    const result = assembleEntityClaudeMd(preset, null, rules, wsPrompt)
    assert.ok(result.includes('## Workspace Prompt'))
    assert.ok(result.includes('Focus on security.'))
    const rulesIdx = result.indexOf('## Global Rules')
    const wsIdx = result.indexOf('## Workspace Prompt')
    assert.ok(wsIdx > rulesIdx, 'Workspace Prompt should follow Global Rules')
  })

  it('skips workspace prompt when undefined', () => {
    const result = assembleEntityClaudeMd('# T\n\nB.', null, '', undefined)
    assert.ok(!result.includes('## Workspace Prompt'))
  })

  it('skips workspace prompt when empty/whitespace', () => {
    const result = assembleEntityClaudeMd('# T\n\nB.', null, '', '   ')
    assert.ok(!result.includes('## Workspace Prompt'))
  })

  it('trims workspace prompt', () => {
    const result = assembleEntityClaudeMd('# T\n\nB.', null, '', '  hello  ')
    const section = result.split('## Workspace Prompt\n\n')[1]
    assert.ok(section.startsWith('hello'))
  })
})

// ── Context Directories ──────────────────────────────────────────────────────

describe('assembleEntityClaudeMd — context directories', () => {
  it('appends context directories at end', () => {
    const result = assembleEntityClaudeMd('# T\n\nB.', null, 'R.', 'WP.', ['/a', '/b'])
    assert.ok(result.includes('## Context Directories'))
    assert.ok(result.includes('- `/a`'))
    assert.ok(result.includes('- `/b`'))
    const wsIdx = result.indexOf('## Workspace Prompt')
    const ctxIdx = result.indexOf('## Context Directories')
    assert.ok(ctxIdx > wsIdx, 'Context Dirs should follow Workspace Prompt')
  })

  it('skips context directories when empty array', () => {
    const result = assembleEntityClaudeMd('# T\n\nB.', null, '', '', [])
    assert.ok(!result.includes('## Context Directories'))
  })

  it('skips context directories when undefined', () => {
    const result = assembleEntityClaudeMd('# T\n\nB.', null, '', '', undefined)
    assert.ok(!result.includes('## Context Directories'))
  })
})

// ── Full assembly ────────────────────────────────────────────────────────────

describe('assembleEntityClaudeMd — full assembly', () => {
  it('assembles all layers in correct order', () => {
    const preset = '# Cyber Factory\n\nFactory instructions.'
    const persona = 'Du bist die Cyber Factory.'
    const rules = 'Global rule 1.'
    const wsPrompt = 'Workspace focus.'
    const ctxPaths = ['/project/a', '/project/b']

    const result = assembleEntityClaudeMd(preset, persona, rules, wsPrompt, ctxPaths)

    // Verify order: H1 → Persona → Body → Global Rules → Workspace Prompt → Context Dirs
    const h1Idx = result.indexOf('# Cyber Factory')
    const personaIdx = result.indexOf('## Persona')
    const bodyIdx = result.indexOf('Factory instructions.')
    const rulesIdx = result.indexOf('## Global Rules')
    const wsIdx = result.indexOf('## Workspace Prompt')
    const ctxIdx = result.indexOf('## Context Directories')

    assert.ok(h1Idx >= 0, 'H1 present')
    assert.ok(personaIdx >= 0, 'Persona present')
    assert.ok(bodyIdx >= 0, 'Body present')
    assert.ok(rulesIdx >= 0, 'Global Rules present')
    assert.ok(wsIdx >= 0, 'Workspace Prompt present')
    assert.ok(ctxIdx >= 0, 'Context Directories present')

    assert.ok(h1Idx < personaIdx, 'H1 before Persona')
    assert.ok(personaIdx < bodyIdx, 'Persona before Body')
    assert.ok(bodyIdx < rulesIdx, 'Body before Global Rules')
    assert.ok(rulesIdx < wsIdx, 'Global Rules before Workspace Prompt')
    assert.ok(wsIdx < ctxIdx, 'Workspace Prompt before Context Directories')
  })

  it('no regex replacement — preset.md sections preserved', () => {
    // Preset already has a ## Global Rules section from a previous assembly.
    // Pure concatenation should NOT replace it — it just appends another one.
    // This verifies we're NOT using regex-based injectSection.
    const preset = '# Entity\n\n## Global Rules\n\nOld rules.\n'
    const result = assembleEntityClaudeMd(preset, null, 'New rules.')

    // Both old and new should be present (concatenation, not replacement)
    assert.ok(result.includes('Old rules.'))
    assert.ok(result.includes('New rules.'))
  })

  it('assembly without optional layers', () => {
    const preset = '# Entity\n\nBody.'
    const persona = 'Persona text.'
    const rules = 'Rule.'
    const result = assembleEntityClaudeMd(preset, persona, rules)

    assert.ok(result.includes('## Persona'))
    assert.ok(result.includes('## Global Rules'))
    assert.ok(!result.includes('## Workspace Prompt'))
    assert.ok(!result.includes('## Context Directories'))
  })
})
