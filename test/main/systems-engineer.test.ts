import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { EntityRegistry, registerBuiltinEntities } from '../../src/main/session/entity-registry'
import { resolveEntityRuntime } from '../../src/main/session/entity-runtime'
import {
  generateSystemsEngineerPreset,
  deploySystemsEngineerCapabilities,
  SE_CAPABILITIES,
} from '../../src/main/systems-engineer/se-preset'
import { ENTITY_BOUNDARIES } from '../../src/main/session/entity-boundaries'
import { presetTemplateFor } from '../../src/main/entity-content/preset-templates'

// ─── Systems Engineer (aus cipher keel übersetzt, 2026-10-24) ──

function registry() {
  const r = new EntityRegistry()
  registerBuiltinEntities(r)
  return r
}

describe('Systems Engineer: Registry', () => {
  it('ist registriert, einmal pro Workspace, auf Opus', () => {
    const se = registry().get('systems-engineer')
    assert.ok(se)
    assert.equal(se.singleInstance, true)
    assert.equal(resolveEntityRuntime(se, {}).model, 'opus')
  })

  it('ist die einzige Rolle mit Opus-Default', () => {
    const opus = registry().list().filter(e => /opus/i.test(e.model ?? '')).map(e => e.id)
    assert.deepEqual(opus, ['systems-engineer'])
  })

  it('Bau- und Prüfrollen laufen auf Sonnet, Zuarbeit auf Haiku', () => {
    const r = registry()
    for (const id of ['workshop', 'cyber-factory', 'refinement', 'debugger', 'audit', 'testing-assistant', 'companion']) {
      assert.equal(r.get(id)?.model, 'sonnet', id)
    }
    for (const id of ['launcher', 'voice-relay']) assert.equal(r.get(id)?.model, 'haiku', id)
    assert.equal(r.get('local-worker')?.model, undefined, 'der lokale Worker nimmt sein Profil')
  })
})

describe('Systems Engineer: Preset', () => {
  const md = generateSystemsEngineerPreset()

  it('bleibt knapp — das Preset ist selbst Kontext', () => {
    assert.ok(md.length <= 2600, `${md.length} Zeichen`)
  })

  it('nennt die vier Grenzen', () => {
    assert.match(md, /Keine Phasenarbeit/)
    assert.match(md, /Kein Code/)
    assert.match(md, /Übergaben zwischen Rollen laufen über dich/)
    assert.match(md, /Kein Eingriff in die interne Orchestrierung/)
  })

  it('führt strukturellen und inhaltlichen Befund getrennt', () => {
    assert.match(md, /strukturell/)
    assert.match(md, /inhaltlich/)
    assert.match(md, /nie verrechnet/)
  })

  it('verweist auf Capabilities statt sie zu injizieren', () => {
    for (const name of Object.keys(SE_CAPABILITIES)) assert.ok(md.includes(`capabilities/${name}`), name)
  })

  it('ist als write-once-Vorlage bekannt', () => {
    assert.equal(presetTemplateFor('systems-engineer'), md)
  })

  it('schreibt die Capabilities ins Rollenverzeichnis', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-'))
    try {
      deploySystemsEngineerCapabilities(dir)
      for (const name of Object.keys(SE_CAPABILITIES)) {
        assert.ok(fs.existsSync(path.join(dir, 'capabilities', name)), name)
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('Systems Engineer: Rollengrenze', () => {
  it('darf weder Produktionscode noch Tests schreiben', () => {
    const b = ENTITY_BOUNDARIES['systems-engineer']
    assert.ok(b)
    assert.ok(b.denyPathPatterns.includes('/src/'))
    assert.ok(b.denyPathPatterns.includes('/test/'))
  })
})
