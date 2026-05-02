// test/main/persona-skill-sync.test.ts — TDD tests for persona-skill-sync

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

import type { Persona } from '../../src/shared/persona-types'
import { generateSkillContent, syncPersonaSkills } from '../../src/main/workspace/persona-skill-sync'

// ── helpers ───────────────────────────────────────────────────────────────────

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'test-persona',
    name: 'Test Persona',
    color: '#123456',
    defaultPrompt: 'You are a test persona. Do test things.',
    ...overrides,
  }
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'persona-skill-sync-test-'))
}

// ── generateSkillContent ──────────────────────────────────────────────────────

describe('generateSkillContent', () => {
  it('generates valid skill markdown with persona prompt', () => {
    const persona = makePersona()
    const content = generateSkillContent(persona)
    assert.ok(content !== null, 'should return non-null for valid persona')
    assert.ok(content!.includes('name: persona-test-persona'), 'should include skill name with persona id')
    assert.ok(content!.includes('description: Load the Test Persona persona into the current session'), 'should include description')
    assert.ok(content!.includes('# Persona: Test Persona'), 'should include heading with persona name')
    assert.ok(content!.includes('You are a test persona. Do test things.'), 'should include persona defaultPrompt')
  })

  it('returns null for empty persona (id === "empty")', () => {
    const persona = makePersona({ id: 'empty', name: '(empty)', defaultPrompt: '' })
    const result = generateSkillContent(persona)
    assert.strictEqual(result, null)
  })

  it('returns null for persona with whitespace-only defaultPrompt', () => {
    const persona = makePersona({ id: 'whitespace-persona', defaultPrompt: '   \t\n  ' })
    const result = generateSkillContent(persona)
    assert.strictEqual(result, null)
  })

  it('includes persona name in heading and bold marker', () => {
    const persona = makePersona({ name: 'Senior Architect' })
    const content = generateSkillContent(persona)
    assert.ok(content !== null)
    assert.ok(content!.includes('# Persona: Senior Architect'), 'should include heading with exact persona name')
    assert.ok(content!.includes('**Senior Architect**'), 'should include persona name in bold marker')
  })
})

// ── syncPersonaSkills ─────────────────────────────────────────────────────────

describe('syncPersonaSkills', () => {
  it('creates skill files for all non-empty personas', () => {
    const skillsDir = makeTempDir()
    const personas: Persona[] = [
      makePersona({ id: 'orchestrator', name: 'Orchestrator', defaultPrompt: 'You coordinate.' }),
      makePersona({ id: 'worker', name: 'Worker', defaultPrompt: 'You execute tasks.' }),
    ]

    syncPersonaSkills(personas, skillsDir)

    const orchDir = path.join(skillsDir, 'persona-orchestrator')
    const workerDir = path.join(skillsDir, 'persona-worker')
    assert.ok(fs.existsSync(orchDir), 'orchestrator dir should exist')
    assert.ok(fs.existsSync(workerDir), 'worker dir should exist')

    const orchSkill = path.join(orchDir, 'SKILL.md')
    const workerSkill = path.join(workerDir, 'SKILL.md')
    assert.ok(fs.existsSync(orchSkill), 'SKILL.md should exist for orchestrator')
    assert.ok(fs.existsSync(workerSkill), 'SKILL.md should exist for worker')

    const orchContent = fs.readFileSync(orchSkill, 'utf8')
    assert.ok(orchContent.includes('name: persona-orchestrator'))
    assert.ok(orchContent.includes('You coordinate.'))
  })

  it('skips empty persona (no dir created)', () => {
    const skillsDir = makeTempDir()
    const personas: Persona[] = [
      makePersona({ id: 'empty', name: '(empty)', defaultPrompt: '' }),
      makePersona({ id: 'worker', name: 'Worker', defaultPrompt: 'You execute tasks.' }),
    ]

    syncPersonaSkills(personas, skillsDir)

    const emptyDir = path.join(skillsDir, 'persona-empty')
    assert.ok(!fs.existsSync(emptyDir), 'persona-empty dir should NOT exist')

    const workerDir = path.join(skillsDir, 'persona-worker')
    assert.ok(fs.existsSync(workerDir), 'persona-worker dir should exist')
  })

  it('removes skill dirs for deleted personas', () => {
    const skillsDir = makeTempDir()

    // Set up old persona dir that should be removed
    const oldDir = path.join(skillsDir, 'persona-old-persona')
    fs.mkdirSync(oldDir, { recursive: true })
    fs.writeFileSync(path.join(oldDir, 'SKILL.md'), '# Old persona skill')

    const personas: Persona[] = [
      makePersona({ id: 'worker', name: 'Worker', defaultPrompt: 'You execute tasks.' }),
    ]

    syncPersonaSkills(personas, skillsDir)

    assert.ok(!fs.existsSync(oldDir), 'old persona dir should be removed')
    const workerDir = path.join(skillsDir, 'persona-worker')
    assert.ok(fs.existsSync(workerDir), 'worker dir should still exist')
  })

  it('only writes when content changes (check mtime)', () => {
    const skillsDir = makeTempDir()
    const personas: Persona[] = [
      makePersona({ id: 'worker', name: 'Worker', defaultPrompt: 'You execute tasks.' }),
    ]

    syncPersonaSkills(personas, skillsDir)

    const skillFile = path.join(skillsDir, 'persona-worker', 'SKILL.md')
    const mtime1 = fs.statSync(skillFile).mtimeMs

    // Wait a small tick and call again with same data
    // On fast systems, mtime granularity may be 1ms — use a short spin
    const start = Date.now()
    while (Date.now() - start < 10) { /* spin */ }

    syncPersonaSkills(personas, skillsDir)
    const mtime2 = fs.statSync(skillFile).mtimeMs

    assert.strictEqual(mtime1, mtime2, 'mtime should not change when content is unchanged')
  })

  it('creates skillsDir if it does not exist', () => {
    const tmpBase = makeTempDir()
    const skillsDir = path.join(tmpBase, 'deep', 'nested', 'skills')
    assert.ok(!fs.existsSync(skillsDir), 'skillsDir should not exist yet')

    const personas: Persona[] = [
      makePersona({ id: 'worker', name: 'Worker', defaultPrompt: 'You execute tasks.' }),
    ]

    syncPersonaSkills(personas, skillsDir)

    assert.ok(fs.existsSync(skillsDir), 'skillsDir should be created')
    const workerDir = path.join(skillsDir, 'persona-worker')
    assert.ok(fs.existsSync(workerDir), 'persona dir should exist inside created skillsDir')
  })
})
