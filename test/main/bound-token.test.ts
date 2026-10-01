import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBoundToken,
  splitBoundToken,
  stripBindingFromAuthHeader,
  parseAuthHeaderBinding,
  BOUND_TOKEN_ENV_VAR,
} from '../../src/main/mcp/bound-token'
import { validateBearer } from '../../src/main/mcp/mcp-auth'

const KEY = 'DEADBEEF00112233445566778899AABB'

describe('buildBoundToken', () => {
  it('gibt ohne Bindung den blanken Schluessel zurueck', () => {
    // Nicht ein Token mit leerer Bindung: ein ungebundener Client soll von einem
    // Client vor dieser Aenderung nicht unterscheidbar sein.
    assert.equal(buildBoundToken(KEY, null, null), KEY)
  })

  it('haengt Workspace und Rolle an, getrennt durch einen Punkt', () => {
    const t = buildBoundToken(KEY, 'ws-1777957373268', 'companion')
    assert.ok(t.startsWith(`${KEY}.`))
    assert.deepEqual(splitBoundToken(t), {
      apiKey: KEY,
      workspaceId: 'ws-1777957373268',
      entityId: 'companion',
      bound: true,
    })
  })

  it('traegt auch nur eines der beiden', () => {
    assert.deepEqual(splitBoundToken(buildBoundToken(KEY, 'ws-1', null)), {
      apiKey: KEY, workspaceId: 'ws-1', entityId: null, bound: true,
    })
    assert.deepEqual(splitBoundToken(buildBoundToken(KEY, null, 'debugger')), {
      apiKey: KEY, workspaceId: null, entityId: 'debugger', bound: true,
    })
  })

  it('erzeugt ein Token ohne Zeichen, die in einem HTTP-Header stoeren', () => {
    const t = buildBoundToken(KEY, 'ws-1', 'companion')
    // base64url: keine +, /, = und kein Leerzeichen.
    assert.match(t, /^[A-Za-z0-9._-]+$/)
  })
})

describe('splitBoundToken — Robustheit', () => {
  it('ein Token ohne Punkt ist der Schluessel und ungebunden', () => {
    assert.deepEqual(splitBoundToken(KEY), {
      apiKey: KEY, workspaceId: null, entityId: null, bound: false,
    })
  })

  it('ein unlesbarer Zusatz macht das Token nicht ungueltig', () => {
    // Dieselbe Haltung wie resolveWorkspaceId: ein Client mit kaputter Bindung
    // arbeitet weiter, er arbeitet eben ungebunden.
    const r = splitBoundToken(`${KEY}.das-ist-kein-base64url-json`)
    assert.equal(r.apiKey, KEY)
    assert.equal(r.workspaceId, null)
    assert.equal(r.entityId, null)
  })

  it('trennt am ERSTEN Punkt, damit weitere Punkte den Schluessel nicht fressen', () => {
    assert.equal(splitBoundToken(`${KEY}.a.b.c`).apiKey, KEY)
  })

  it('weist ein JSON-Array als Bindung ab', () => {
    const encoded = Buffer.from('["ws-1"]', 'utf-8').toString('base64url')
    const r = splitBoundToken(`${KEY}.${encoded}`)
    assert.equal(r.workspaceId, null)
    assert.equal(r.bound, false)
  })

  it('behandelt leere und reine Leerzeichen-Werte als nicht gesetzt', () => {
    const encoded = Buffer.from(JSON.stringify({ w: '   ', e: '' }), 'utf-8').toString('base64url')
    const r = splitBoundToken(`${KEY}.${encoded}`)
    assert.equal(r.workspaceId, null)
    assert.equal(r.entityId, null)
  })

  it('ignoriert Bindungswerte, die keine Strings sind', () => {
    const encoded = Buffer.from(JSON.stringify({ w: 42, e: { x: 1 } }), 'utf-8').toString('base64url')
    const r = splitBoundToken(`${KEY}.${encoded}`)
    assert.equal(r.workspaceId, null)
    assert.equal(r.entityId, null)
  })
})

describe('Auth bleibt unveraendert — die Bindung ist keine Berechtigung', () => {
  it('ein gebundenes Token besteht validateBearer nach dem Abstreifen', () => {
    const t = buildBoundToken(KEY, 'ws-1777957373268', 'companion')
    assert.equal(validateBearer(stripBindingFromAuthHeader(`Bearer ${t}`), KEY), true)
  })

  it('ein gebundenes Token besteht validateBearer OHNE Abstreifen nicht', () => {
    // Das ist der Grund, warum stripBindingFromAuthHeader existiert. Ohne den
    // Schritt waere jede Codex-Verbindung ein 401 — und zwar erst, wenn jemand
    // sie benutzt, nicht beim Schreiben der Config.
    const t = buildBoundToken(KEY, 'ws-1', 'companion')
    assert.equal(validateBearer(`Bearer ${t}`, KEY), false)
  })

  it('ein falscher Schluessel mit gueltiger Bindung wird abgewiesen', () => {
    const t = buildBoundToken('0'.repeat(KEY.length), 'ws-1', 'companion')
    assert.equal(validateBearer(stripBindingFromAuthHeader(`Bearer ${t}`), KEY), false)
  })

  it('eine Bindung allein, ohne Schluessel, wird abgewiesen', () => {
    const encoded = Buffer.from(JSON.stringify({ w: 'ws-1' }), 'utf-8').toString('base64url')
    assert.equal(validateBearer(stripBindingFromAuthHeader(`Bearer .${encoded}`), KEY), false)
  })

  it('laesst einen Kopf ohne Bearer-Form unveraendert', () => {
    // Die Zurueckweisung gehoert in validateBearer, nicht ins Abstreifen.
    assert.equal(stripBindingFromAuthHeader('Basic abc'), 'Basic abc')
    assert.equal(stripBindingFromAuthHeader('Bearer'), 'Bearer')
    assert.equal(stripBindingFromAuthHeader(undefined), undefined)
  })

  it('ein blankes Token bleibt Zeichen fuer Zeichen gleich', () => {
    assert.equal(stripBindingFromAuthHeader(`Bearer ${KEY}`), `Bearer ${KEY}`)
  })
})

describe('parseAuthHeaderBinding', () => {
  it('liest beide Felder aus dem Kopf', () => {
    const t = buildBoundToken(KEY, 'ws-1777957373268', 'debugger')
    assert.deepEqual(parseAuthHeaderBinding(`Bearer ${t}`), {
      workspaceId: 'ws-1777957373268',
      entityId: 'debugger',
    })
  })

  it('gibt bei fehlendem oder fremdem Kopf zweimal null', () => {
    for (const h of [undefined, '', 'Basic xyz', 'Bearer', `Bearer ${KEY}`]) {
      assert.deepEqual(parseAuthHeaderBinding(h), { workspaceId: null, entityId: null })
    }
  })
})

describe('Die Umgebungsvariable', () => {
  it('heisst CIPHER_MUX_MCP_TOKEN und ist nicht CIPHER_MUX_MCP_KEY', () => {
    // Zwei Variablen mit Absicht: der blanke Schluessel bleibt, wo er war, damit
    // nichts bricht, was ihn heute liest.
    assert.equal(BOUND_TOKEN_ENV_VAR, 'CIPHER_MUX_MCP_TOKEN')
    assert.notEqual(BOUND_TOKEN_ENV_VAR, 'CIPHER_MUX_MCP_KEY')
  })
})
