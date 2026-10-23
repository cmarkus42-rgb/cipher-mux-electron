import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { handleLocalFactoryCall } from '../../../src/main/local-factory/tool-call'
import type { DispatchArgs, AcceptResult, DispatchAccepted, DispatchRejected } from '../../../src/main/local-factory/runner'

function fakeRunner(acceptRes: AcceptResult = { ok: true }) {
  const calls: { dispatch: DispatchArgs[]; accept: [string, number][] } = { dispatch: [], accept: [] }
  return {
    calls,
    async dispatch(a: DispatchArgs): Promise<DispatchAccepted | DispatchRejected> {
      calls.dispatch.push(a)
      return { ok: false, error: 'Auftrag ungültig: ziel: leer' }
    },
    accept(laufId: string, n: number): AcceptResult {
      calls.accept.push([laufId, n])
      return acceptRes
    },
    async judge(): Promise<AcceptResult> { return { ok: true } },
  }
}

describe('handleLocalFactoryCall — accept-Fluss', () => {
  it('accept ohne laufId/haeppchen → Fehler, kein Dispatch', async () => {
    for (const args of [{ accept: true }, { accept: true, laufId: 'L1' }, { accept: true, haeppchen: 1 }]) {
      const r = fakeRunner()
      const res = await handleLocalFactoryCall(r, args)
      assert.equal(res.isError, true)
      assert.match(JSON.stringify(res.result), /laufId und haeppchen/)
      assert.equal(r.calls.dispatch.length, 0)
      assert.equal(r.calls.accept.length, 0)
    }
  })
  it('accept mit beidem → Status des Läufers wird durchgereicht', async () => {
    const ok = fakeRunner({ ok: true })
    const a = await handleLocalFactoryCall(ok, { accept: true, laufId: 'L1', haeppchen: 2 })
    assert.equal(a.isError, false)
    assert.deepEqual(a.result, { ok: true, abgenommen: 2 })
    assert.deepEqual(ok.calls.accept, [['L1', 2]])

    const nein = fakeRunner({ ok: false, error: 'Häppchen #2 ist nicht grün-wartend' })
    const b = await handleLocalFactoryCall(nein, { accept: true, laufId: 'L1', haeppchen: 2 })
    assert.equal(b.isError, true)
    assert.deepEqual(b.result, { ok: false, error: 'Häppchen #2 ist nicht grün-wartend' })
  })
  it('ohne accept → dispatch, fehlende Felder lehnt validateAuftrag ab (nicht das Schema)', async () => {
    const r = fakeRunner()
    const res = await handleLocalFactoryCall(r, { ziel: '' })
    assert.equal(r.calls.dispatch.length, 1)
    assert.equal(res.isError, true)
  })

  it('profil wird an dispatch durchgereicht', async () => {
    const r = fakeRunner()
    await handleLocalFactoryCall(r, { projekt: '/p', profil: 'mac' })
    assert.equal(r.calls.dispatch[0].profil, 'mac')
  })
})

describe('handleLocalFactoryCall — Workshop-Urteil', () => {
  it('local-workshop: accept geht an judge mit dem Urteil, nicht an accept', async () => {
    const r = fakeRunner()
    const got: unknown[] = []
    const res = await handleLocalFactoryCall(
      { ...r, async judge(...a: unknown[]) { got.push(a); return { ok: true } } } as any,
      { accept: true, laufId: 'L1', haeppchen: 1, ergebnis: 'uebernommen', kategorie: 'ui' }, 'local-workshop')
    assert.equal(res.isError, false)
    assert.deepEqual(got, [['L1', 1, { ergebnis: 'uebernommen', kategorie: 'ui', notiz: undefined }]])
    assert.equal(r.calls.accept.length, 0)
  })
  it('local-factory: accept bleibt accept', async () => {
    const r = fakeRunner()
    await handleLocalFactoryCall(r, { accept: true, laufId: 'L1', haeppchen: 1 })
    assert.equal(r.calls.accept.length, 1)
  })
})

describe('mux_local_worker_dispatch: Paket-3-Felder', () => {
  it('ersetzungen, architektenfehler und rotGrund gehen unverändert an dispatch', async () => {
    const r = fakeRunner()
    const ersetzungen = [{ datei: 'src/a.ts', alt: 'x', neu: 'y' }]
    await handleLocalFactoryCall(r, { projekt: '/p', ersetzungen, architektenfehler: 'Test falsch', rotGrund: 'gewollt', haeppchen: 1 })
    assert.deepEqual(r.calls.dispatch[0].ersetzungen, ersetzungen)
    assert.equal(r.calls.dispatch[0].architektenfehler, 'Test falsch')
    assert.equal(r.calls.dispatch[0].rotGrund, 'gewollt')
  })
  it('kein Schemafeld laeuferfehler: Läuferfehler zählen automatisch nicht (User-Entscheid)', async () => {
    const { DISPATCH_INPUT_SCHEMA } = await import('../../../src/main/mcp/local-factory-tool')
    assert.equal('laeuferfehler' in DISPATCH_INPUT_SCHEMA, false)
  })
  it('das Schema nimmt die Felder an und weist kaputte ersetzungen ab', async () => {
    const { z } = await import('zod')
    const { DISPATCH_INPUT_SCHEMA } = await import('../../../src/main/mcp/local-factory-tool')
    const s = z.object(DISPATCH_INPUT_SCHEMA)
    assert.equal(s.safeParse({ ersetzungen: [{ datei: 'a', alt: 'b', neu: '' }], architektenfehler: 'x', rotGrund: 'y' }).success, true)
    assert.equal(s.safeParse({ ersetzungen: [{ datei: 'a' }] }).success, false)
  })
  it('die Beschreibung nennt die neuen Felder und die Projekt-Config, für beide Rollen', async () => {
    const { buildDispatchDescription } = await import('../../../src/main/mcp/local-factory-tool')
    for (const rolle of ['local-factory', 'local-workshop'] as const) {
      const d = buildDispatchDescription(rolle)
      for (const wort of ['ersetzungen', 'architektenfehler', 'rotGrund', '.cipher-mux/local-factory.json',
        'pflichtGates', 'vorpruefung', 'worktreeVorbereitung', 'sauberkeitIgnoriert', 'verboteneMuster']) {
        assert.ok(d.includes(wort), `${rolle}: ${wort} fehlt`)
      }
    }
  })
})
