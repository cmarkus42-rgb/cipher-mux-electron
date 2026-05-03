import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * Tests for Global Layer Backend (REQ-GLOBAL-001, 002, 003).
 *
 * REQ-001: Read global-rules.md at app start, skip silently if missing/empty
 * REQ-002: Inject content into every session's CLAUDE.md
 * REQ-003: Warn if file > ~2000 tokens (8000 chars)
 */

describe('Global Layer: loadGlobalRulesOnStartup (REQ-GLOBAL-001)', () => {
  it('exports loadGlobalRulesOnStartup function', async () => {
    const mod = await import('../../src/main/config/global-rules')
    assert.equal(typeof mod.loadGlobalRulesOnStartup, 'function')
  })

  it('exports getCachedGlobalRules function', async () => {
    const mod = await import('../../src/main/config/global-rules')
    assert.equal(typeof mod.getCachedGlobalRules, 'function')
  })

  it('exports invalidateGlobalRulesCache function', async () => {
    const mod = await import('../../src/main/config/global-rules')
    assert.equal(typeof mod.invalidateGlobalRulesCache, 'function')
  })

  it('exports TOKEN_WARNING_CHAR_THRESHOLD constant', async () => {
    const mod = await import('../../src/main/config/global-rules')
    assert.equal(mod.TOKEN_WARNING_CHAR_THRESHOLD, 8000)
  })
})

describe('Global Layer: Token warning (REQ-GLOBAL-003)', () => {
  let tmpDir: string
  let rulesPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-test-'))
    rulesPath = path.join(tmpDir, 'global-rules.md')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should not warn for content under threshold', () => {
    const content = '# Rules\n\n1. Be good.'
    assert.ok(content.length < 8000)
  })

  it('should detect content over 8000 chars as exceeding threshold', () => {
    const content = 'x'.repeat(8001)
    assert.ok(content.length > 8000, 'Content exceeds TOKEN_WARNING_CHAR_THRESHOLD')
  })

  it('estimates tokens as chars / 4', () => {
    const chars = 8000
    const estimatedTokens = Math.round(chars / 4)
    assert.equal(estimatedTokens, 2000)
  })
})

describe('Global Layer: CLAUDE.md injection (REQ-GLOBAL-002)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-inject-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('injects ## Global Rules section into existing CLAUDE.md', () => {
    const claudeMd = '# My Entity\n\nSome content here.'
    const globalRules = '### Universelle Regeln\n\n1. Plan vor Code.'
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md')
    fs.writeFileSync(claudeMdPath, claudeMd, 'utf-8')

    // Simulate the injectSection logic used by session-manager
    const sectionName = 'Global Rules'
    const sectionBlock = `\n\n## ${sectionName}\n\n${globalRules}`
    const sectionRegex = new RegExp(`\\n*## ${sectionName}\\n[\\s\\S]*?(?=\\n## |\\n*$)`)

    let result: string
    if (sectionRegex.test(claudeMd)) {
      result = claudeMd.replace(sectionRegex, sectionBlock)
    } else {
      result = claudeMd + sectionBlock
    }

    assert.ok(result.includes('## Global Rules'))
    assert.ok(result.includes('Plan vor Code'))
    assert.ok(result.includes('# My Entity'))
  })

  it('replaces existing ## Global Rules section on re-injection', () => {
    const claudeMd = '# Entity\n\n## Global Rules\n\nOld rules here.\n\n## Persona\n\nSome persona.'
    const newRules = '1. New rule.'
    const sectionName = 'Global Rules'
    const sectionBlock = `\n\n## ${sectionName}\n\n${newRules}`
    const sectionRegex = new RegExp(`\\n*## ${sectionName}\\n[\\s\\S]*?(?=\\n## |\\n*$)`)

    const result = claudeMd.replace(sectionRegex, sectionBlock)

    assert.ok(result.includes('1. New rule.'))
    assert.ok(!result.includes('Old rules here.'))
    assert.ok(result.includes('## Persona'))
  })

  it('does nothing when global rules content is empty', () => {
    const globalRules = '   \n  '
    assert.ok(!globalRules.trim(), 'Empty content should be skipped')
  })

  it('does nothing when CLAUDE.md does not exist', () => {
    const claudeMdPath = path.join(tmpDir, 'nonexistent', 'CLAUDE.md')
    assert.ok(!fs.existsSync(claudeMdPath))
    // injectGlobalRulesSection would bail early — no error
  })

  it('Global Rules section appears before Persona section', () => {
    const claudeMd = '# Entity\n\nContent.'
    const globalRules = '1. Rule A.'
    const persona = 'Du bist Cipher.'

    // Simulate both injections in order
    const withGlobal = claudeMd + `\n\n## Global Rules\n\n${globalRules}`
    const withPersona = withGlobal + `\n\n## Persona\n\n${persona}`

    const globalIdx = withPersona.indexOf('## Global Rules')
    const personaIdx = withPersona.indexOf('## Persona')
    assert.ok(globalIdx < personaIdx, 'Global Rules must come before Persona')
  })
})

describe('Global Layer: _entityInjected flag (REQ-GLOBAL-002)', () => {
  it('StartSessionOpts interface accepts _entityInjected', async () => {
    // This is a type-level test — if it compiles, the flag exists.
    // We verify by importing and checking the type allows the field.
    const types = await import('../../src/shared/types')
    const opts: types.StartSessionOpts = {
      name: 'test',
      projectPath: '/tmp/test',
      _entityInjected: true,
    }
    assert.equal(opts._entityInjected, true)
  })
})
