import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  generateTemplate,
  writeAnforderungspaket,
  validateAnforderungspaket,
} from '../../../src/main/ideation-partner/anforderungspaket-generator'
import { ANFORDERUNGSPAKET_FIELDS } from '../../../src/main/ideation-partner/types'

const TEST_DIR = path.join(os.tmpdir(), `anforderung-test-${Date.now()}`)

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('generateTemplate', () => {
  it('includes all required fields as H2 headings', () => {
    const template = generateTemplate('/tmp/brain', 'TestProject')
    for (const field of ANFORDERUNGSPAKET_FIELDS) {
      assert.ok(template.includes(`## ${field}`), `missing heading for ${field}`)
    }
  })

  it('includes project name in H1', () => {
    const template = generateTemplate('/tmp/brain', 'MyCoolApp')
    assert.ok(template.includes('# Anforderungs-Paket: MyCoolApp'))
  })

  it('includes optional sections', () => {
    const template = generateTemplate('/tmp/brain', 'Test')
    assert.ok(template.includes('## Referenz-Projekte'))
    assert.ok(template.includes('## Bekannte Risiken'))
  })
})

describe('writeAnforderungspaket', () => {
  it('writes file to deliverables/ directory', () => {
    const content = '# Test\n\nContent.'
    const filepath = writeAnforderungspaket(TEST_DIR, content)
    assert.ok(filepath.includes('deliverables/anforderungspaket.md'))
    assert.ok(fs.existsSync(filepath))
    assert.equal(fs.readFileSync(filepath, 'utf-8'), content)
  })
})

describe('validateAnforderungspaket', () => {
  it('detects all fields missing in empty content', () => {
    const result = validateAnforderungspaket('')
    assert.equal(result.missingFields.length, ANFORDERUNGSPAKET_FIELDS.length)
    assert.equal(result.isComplete, false)
  })

  it('detects present fields with content', () => {
    const content = `
## Projektziel
Ein CLI-Tool zum Sortieren.

## Zielgruppe
Entwickler.

## Funktionale Anforderungen
- Dateien sortieren

## Meta-Requirements
Node.js, TypeScript

## Wirksamkeits-Test
Manuell: 50 Dateien sortieren.

## Ausgeschlossener Scope
Keine GUI.
`
    const result = validateAnforderungspaket(content)
    assert.equal(result.missingFields.length, 0)
    assert.equal(result.isComplete, true)
    assert.equal(result.presentFields.length, ANFORDERUNGSPAKET_FIELDS.length)
  })

  it('detects field with heading but no content as missing', () => {
    const content = `
## Projektziel
Ein Tool.

## Zielgruppe
<!-- Bitte ergaenzen -->
`
    const result = validateAnforderungspaket(content)
    assert.ok(result.presentFields.includes('Projektziel'))
    assert.ok(result.missingFields.includes('Zielgruppe'))
  })

  it('handles fields with only whitespace as missing', () => {
    const content = `
## Projektziel

## Zielgruppe
Devs.
`
    const result = validateAnforderungspaket(content)
    assert.ok(result.missingFields.includes('Projektziel'))
    assert.ok(result.presentFields.includes('Zielgruppe'))
  })
})
