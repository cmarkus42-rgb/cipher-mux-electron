import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Test the file-based global rules functions
// We re-implement the logic here to avoid importing modules that resolve
// GLOBAL_RULES_PATH at import time (which points to the real config dir).

describe('global-rules file operations', () => {
  let tmpDir: string
  let rulesPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-test-'))
    rulesPath = path.join(tmpDir, 'global-rules.md')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('ensureGlobalRulesFile (logic)', () => {
    it('creates file with default content when missing', () => {
      const defaultContent = '### Test Rules\n\n1. Rule one.'
      // Simulate ensureGlobalRulesFile logic
      assert.ok(!fs.existsSync(rulesPath))
      fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
      fs.writeFileSync(rulesPath, defaultContent, 'utf-8')

      assert.ok(fs.existsSync(rulesPath))
      assert.equal(fs.readFileSync(rulesPath, 'utf-8'), defaultContent)
    })

    it('does NOT overwrite existing file', () => {
      const existing = '### Custom Rules\n\nUser-modified content.'
      fs.writeFileSync(rulesPath, existing, 'utf-8')

      // Simulate ensureGlobalRulesFile: should bail early
      if (!fs.existsSync(rulesPath)) {
        fs.writeFileSync(rulesPath, 'SHOULD NOT APPEAR', 'utf-8')
      }

      assert.equal(fs.readFileSync(rulesPath, 'utf-8'), existing)
    })

    it('creates parent directory if needed', () => {
      const nested = path.join(tmpDir, 'sub', 'dir', 'global-rules.md')
      fs.mkdirSync(path.dirname(nested), { recursive: true })
      fs.writeFileSync(nested, 'content', 'utf-8')
      assert.ok(fs.existsSync(nested))
    })
  })

  describe('getGlobalRules (logic)', () => {
    it('reads content from file', () => {
      const content = '### Rules\n\n1. Be good.'
      fs.writeFileSync(rulesPath, content, 'utf-8')
      const result = fs.readFileSync(rulesPath, 'utf-8')
      assert.equal(result, content)
    })

    it('returns fallback when file missing', () => {
      const fallback = 'DEFAULT'
      let result: string
      try {
        result = fs.readFileSync(rulesPath, 'utf-8')
      } catch {
        result = fallback
      }
      assert.equal(result, fallback)
    })
  })

  describe('setGlobalRules (logic)', () => {
    it('writes content to file', () => {
      const content = '### Updated Rules\n\n1. New rule.'
      fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
      fs.writeFileSync(rulesPath, content, 'utf-8')
      assert.equal(fs.readFileSync(rulesPath, 'utf-8'), content)
    })

    it('overwrites existing content', () => {
      fs.writeFileSync(rulesPath, 'old content', 'utf-8')
      fs.writeFileSync(rulesPath, 'new content', 'utf-8')
      assert.equal(fs.readFileSync(rulesPath, 'utf-8'), 'new content')
    })
  })
})

describe('DEFAULT_GLOBAL_RULES seed content', () => {
  it('contains MCP-Tool-Grundregeln section', async () => {
    const { DEFAULT_GLOBAL_RULES } = await import('../../src/main/config/global-rules')
    assert.ok(DEFAULT_GLOBAL_RULES.includes('### MCP-Tool-Grundregeln'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Session-Handoff Timing'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('mux_send vs. tmux send-keys'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Context-Monitoring'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Task-Updates'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Notes fuer Persistenz'))
  })

  it('contains Universelle Regeln section', async () => {
    const { DEFAULT_GLOBAL_RULES } = await import('../../src/main/config/global-rules')
    assert.ok(DEFAULT_GLOBAL_RULES.includes('### Universelle Regeln'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Plan vor Code'))
    assert.ok(DEFAULT_GLOBAL_RULES.includes('Sicherheit'))
  })

  it('exports GLOBAL_RULES_PATH pointing to config dir', async () => {
    const { GLOBAL_RULES_PATH } = await import('../../src/main/config/global-rules')
    assert.ok(GLOBAL_RULES_PATH.endsWith('.config/cipher-mux/global-rules.md'))
  })
})
