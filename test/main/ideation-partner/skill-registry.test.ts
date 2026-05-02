import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  KNOWN_SKILLS,
  listSkills,
  readSkill,
  suggestSkillsForPhase,
} from '../../../src/main/ideation-partner/skill-registry'

const TEST_SKILLS_DIR = path.join(os.tmpdir(), `skills-test-${Date.now()}`)

describe('KNOWN_SKILLS', () => {
  it('contains 5 built-in skills', () => {
    assert.equal(KNOWN_SKILLS.length, 5)
  })

  it('includes pre-mortem and persona-roundtable', () => {
    assert.ok(KNOWN_SKILLS.some(s => s.id === 'pre-mortem'))
    assert.ok(KNOWN_SKILLS.some(s => s.id === 'persona-roundtable'))
  })

  it('all skills have id, name, description, suggestWhen', () => {
    for (const skill of KNOWN_SKILLS) {
      assert.ok(skill.id.length > 0)
      assert.ok(skill.name.length > 0)
      assert.ok(skill.description.length > 0)
      assert.ok(skill.suggestWhen.length > 0)
    }
  })
})

describe('listSkills', () => {
  it('marks skills as unavailable when dir does not exist', () => {
    const skills = listSkills('/nonexistent')
    assert.equal(skills.length, 5)
    for (const s of skills) {
      assert.equal(s.available, false)
      assert.equal(s.filepath, null)
    }
  })

  it('marks skill as available when file exists', () => {
    fs.mkdirSync(TEST_SKILLS_DIR, { recursive: true })
    fs.writeFileSync(path.join(TEST_SKILLS_DIR, 'pre-mortem.md'), '# Pre-Mortem', 'utf-8')

    const skills = listSkills(TEST_SKILLS_DIR)
    const preMortem = skills.find(s => s.id === 'pre-mortem')
    assert.ok(preMortem?.available)
    assert.ok(preMortem?.filepath?.endsWith('pre-mortem.md'))

    const roundtable = skills.find(s => s.id === 'persona-roundtable')
    assert.equal(roundtable?.available, false)

    fs.rmSync(TEST_SKILLS_DIR, { recursive: true, force: true })
  })
})

describe('readSkill', () => {
  it('returns null for unknown skill', () => {
    assert.equal(readSkill('/tmp', 'unknown-skill'), null)
  })

  it('returns content when file exists', () => {
    fs.mkdirSync(TEST_SKILLS_DIR, { recursive: true })
    fs.writeFileSync(path.join(TEST_SKILLS_DIR, 'oss-telescope.md'), '# OSS Telescope\nContent.', 'utf-8')

    const content = readSkill(TEST_SKILLS_DIR, 'oss-telescope')
    assert.ok(content?.includes('OSS Telescope'))

    fs.rmSync(TEST_SKILLS_DIR, { recursive: true, force: true })
  })
})

describe('suggestSkillsForPhase', () => {
  it('suggests oss-telescope for phase 1 (recherche)', () => {
    const suggestions = suggestSkillsForPhase(1)
    assert.ok(suggestions.includes('oss-telescope'))
  })

  it('suggests persona-roundtable for phase 2 (fokussierung)', () => {
    const suggestions = suggestSkillsForPhase(2)
    assert.ok(suggestions.includes('persona-roundtable'))
  })

  it('suggests pre-mortem and future-backwards for phase 3 (robustheits-gate)', () => {
    const suggestions = suggestSkillsForPhase(3)
    assert.ok(suggestions.includes('pre-mortem'))
    assert.ok(suggestions.includes('future-backwards'))
  })

  it('returns empty for phase 0 and 4', () => {
    assert.equal(suggestSkillsForPhase(0).length, 0)
    assert.equal(suggestSkillsForPhase(4).length, 0)
  })
})
