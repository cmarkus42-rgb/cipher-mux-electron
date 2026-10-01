import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import * as vm from 'vm'
import {
  extractCodexPaths,
  buildCodexBoundaryScript,
  writeCodexBoundaryScript,
} from '../../src/main/agent/adapters/codex-boundary'
import { ENTITY_BOUNDARIES } from '../../src/main/session/entity-boundaries'

/** So sah der gemessene apply_patch-Aufruf von codex-cli 0.155.1 aus. */
const REAL_APPLY_PATCH = {
  command: '*** Begin Patch\n*** Add File: /run/dir/probe-datei.txt\n+hallo\n*** End Patch',
}

describe('extractCodexPaths — gegen den gemessenen Aufruf', () => {
  it('findet den Pfad im apply_patch-Umschlag', () => {
    // Das ist der Grund, warum es diese Datei gibt: `tool_input.file_path` ist
    // hier leer, und das generische Skript haette jeden Zugriff durchgelassen.
    assert.deepEqual(extractCodexPaths(REAL_APPLY_PATCH), ['/run/dir/probe-datei.txt'])
    assert.equal((REAL_APPLY_PATCH as Record<string, unknown>).file_path, undefined)
  })

  it('kennt alle vier Patch-Koepfe', () => {
    const cmd = [
      '*** Begin Patch',
      '*** Add File: /a/neu.ts',
      '*** Update File: /a/alt.ts',
      '*** Delete File: /a/weg.ts',
      '*** Move to: /a/woanders.ts',
      '*** End Patch',
    ].join('\n')
    assert.deepEqual(
      extractCodexPaths({ command: cmd }),
      ['/a/neu.ts', '/a/alt.ts', '/a/weg.ts', '/a/woanders.ts'],
    )
  })

  it('nimmt file_path und path weiterhin mit', () => {
    // Kostet nichts und faengt ab, falls Codex das Feld doch einmal liefert.
    assert.deepEqual(extractCodexPaths({ file_path: '/x.ts' }), ['/x.ts'])
    assert.deepEqual(extractCodexPaths({ path: '/y.ts' }), ['/y.ts'])
  })

  it('haelt eine Patchzeile, die wie ein Kopf aussieht, fuer Text', () => {
    // Ein Patchrumpf darf alles enthalten. Nur was am Zeilenanfang steht, zaehlt.
    const cmd = '*** Begin Patch\n*** Add File: /echt.ts\n+ *** Add File: /erfunden.ts\n*** End Patch'
    assert.deepEqual(extractCodexPaths({ command: cmd }), ['/echt.ts'])
  })

  it('gibt eine leere Liste fuer einen Shell-Aufruf', () => {
    // Bash traegt keinen Pfad. Die Luecke ist bekannt und bleibt.
    assert.deepEqual(extractCodexPaths({ command: 'rm -rf /src' }), [])
  })

  it('wirft bei Unsinn nicht', () => {
    for (const bad of [null, undefined, 42, 'text', [], { command: 42 }]) {
      assert.deepEqual(extractCodexPaths(bad), [])
    }
  })
})

describe('Das erzeugte Skript laeuft und entscheidet richtig', () => {
  let dir: string
  let script: string
  const DENY = ['/src/', '/test/']
  const REASON = 'Diese Rolle plant, sie baut nicht.'

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-boundary-'))
    script = writeCodexBoundaryScript(dir, DENY, REASON)
  })
  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  function decide(toolInput: unknown): { permissionDecision: string; permissionDecisionReason?: string } {
    const out = execFileSync('node', [script], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: toolInput }),
      encoding: 'utf-8',
      timeout: 10_000,
    })
    return JSON.parse(out).hookSpecificOutput
  }

  it('blockiert einen apply_patch auf einen verbotenen Pfad', () => {
    const d = decide({ command: '*** Begin Patch\n*** Add File: /repo/src/neu.ts\n+x\n*** End Patch' })
    assert.equal(d.permissionDecision, 'deny')
    assert.equal(d.permissionDecisionReason, REASON)
  })

  it('laesst einen erlaubten Pfad durch', () => {
    const d = decide({ command: '*** Begin Patch\n*** Add File: /repo/docs/plan.md\n+x\n*** End Patch' })
    assert.equal(d.permissionDecision, 'allow')
    assert.equal(d.permissionDecisionReason, undefined)
  })

  it('blockiert den ganzen Patch, wenn EINE Datei darin verboten ist', () => {
    // Ein Patch laesst sich nicht zur Haelfte anwenden.
    const cmd = '*** Begin Patch\n*** Add File: /repo/docs/ok.md\n+x\n*** Update File: /repo/src/boese.ts\n+y\n*** End Patch'
    assert.equal(decide({ command: cmd }).permissionDecision, 'deny')
  })

  it('blockiert ein Move AUS einem geschuetzten Verzeichnis heraus', () => {
    const cmd = '*** Begin Patch\n*** Move to: /repo/src/verschoben.ts\n*** End Patch'
    assert.equal(decide({ command: cmd }).permissionDecision, 'deny')
  })

  it('laesst einen Shell-Aufruf durch — die bekannte Luecke', () => {
    // Steht so im Kopfkommentar: die Grenze ist eine Leitplanke, kein Sandkasten.
    assert.equal(decide({ command: 'rm -rf /repo/src' }).permissionDecision, 'allow')
  })

  it('laesst bei unlesbarem Input durch, statt die Rolle lahmzulegen', () => {
    const out = execFileSync('node', [script], { input: 'kein json', encoding: 'utf-8', timeout: 10_000 })
    assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecision, 'allow')
  })

  it('antwortet immer mit dem PreToolUse-Protokoll', () => {
    const out = execFileSync('node', [script], { input: '{}', encoding: 'utf-8', timeout: 10_000 })
    assert.equal(JSON.parse(out).hookSpecificOutput.hookEventName, 'PreToolUse')
  })
})

describe('Skript und TypeScript-Fassung stimmen ueberein', () => {
  // Die Extraktion steht zweimal da — einmal als Funktion, einmal im generierten
  // Skript, weil dieses keine Importe haben darf. Dieser Test ist der Grund,
  // warum die Verdopplung vertretbar ist: liefen sie auseinander, wuerde die
  // getestete Fassung etwas anderes sagen als die laufende.
  let dir: string
  let script: string
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-boundary-parity-'))
    script = writeCodexBoundaryScript(dir, ['/verboten/'], 'r')
  })
  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  const cases: unknown[] = [
    REAL_APPLY_PATCH,
    { command: '*** Begin Patch\n*** Update File: /verboten/x.ts\n*** End Patch' },
    { command: '*** Begin Patch\n*** Move to: /erlaubt/x.ts\n*** End Patch' },
    { file_path: '/verboten/y.ts' },
    { path: '/erlaubt/z.ts' },
    { command: 'echo hallo' },
    {},
  ]

  for (const [i, input] of cases.entries()) {
    it(`Fall ${i} entscheidet in beiden Fassungen gleich`, () => {
      const tsDenied = extractCodexPaths(input).some(p => p.includes('/verboten/'))
      const out = execFileSync('node', [script], {
        input: JSON.stringify({ tool_input: input }),
        encoding: 'utf-8',
        timeout: 10_000,
      })
      const scriptDenied = JSON.parse(out).hookSpecificOutput.permissionDecision === 'deny'
      assert.equal(scriptDenied, tsDenied, `Fassungen weichen ab bei ${JSON.stringify(input)}`)
    })
  }
})

describe('Die Grenzen selbst bleiben die aus entity-boundaries.ts', () => {
  it('das Skript traegt die echten Muster einer Rolle', () => {
    // Keine zweite Quelle fuer die Regeln — nur fuer die Frage, wo der Pfad steht.
    const entries = Object.entries(ENTITY_BOUNDARIES)
    assert.ok(entries.length > 0, 'keine Rollengrenzen definiert')
    const [, boundary] = entries[0]
    const script = buildCodexBoundaryScript(boundary.denyPathPatterns, boundary.reason)
    for (const pattern of boundary.denyPathPatterns) {
      assert.ok(script.includes(JSON.stringify(pattern).slice(1, -1)), `Muster fehlt: ${pattern}`)
    }
  })

  it('maskiert Anfuehrungszeichen in der Begruendung, statt Code daraus zu machen', () => {
    const script = buildCodexBoundaryScript(['/x/'], 'Sie "plant" nur — \\ und so')
    assert.ok(script.includes('\\"plant\\"'))
    // Und das Ergebnis muss weiterhin gueltiges JS sein. `new vm.Script`
    // kompiliert nur — es fuehrt nichts aus. `new Function` wuerde das, und ein
    // Generator, dessen Ausgabe man zum Pruefen ausfuehrt, ist eine Stelle, an
    // der aus generiertem Text generierter Code wird.
    assert.doesNotThrow(() => new vm.Script(script.replace('#!/usr/bin/env node', '')))
  })
})
