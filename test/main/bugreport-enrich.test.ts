import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { gatewayChat, readGatewayKey, readGatewayUrl, normalisiereBasis, waehleBasis, LiteLlmError, DEFAULT_TIER, KEY_NAMEN } from '../../src/main/llm/litellm-client'
import { enrichBugreport, baueReportText, SYSTEM_PROMPT, ERWARTETE_FELDER } from '../../src/main/bugreport/enrich'

/**
 * Warum hier ein echter HTTP-Server laeuft und kein Mock.
 *
 * Die Behauptungen sind welche ueber ein **Protokoll** — dass das Gateway
 * OpenAI-Form spricht, dass ein 401 anders zu behandeln ist als ein 500, dass ein
 * haengender Server nach der Frist abgebrochen wird. Ein Mock schriebe genau die
 * Annahme fest, die zu pruefen ist. Der Server hier ist klein, lokal und
 * deterministisch; das echte Gateway wird damit nicht angefasst.
 */

let server: http.Server
let port = 0
/** Was der Testserver als naechstes tun soll. */
let modus: 'ok' | 'leer' | 'kaputt' | 'fehler401' | 'fehler500' | 'haengen' = 'ok'
/** Was die letzte Anfrage trug — fuer Behauptungen ueber das, was wir senden. */
interface ChatAnfrage { model?: string; messages?: Array<{ role: string; content: string }> }
let letzteAnfrage: { auth?: string; body?: ChatAnfrage } = {}

const ANTWORT_GUT = `title: Zeilen zerfallen beim ersten Aufruf
severity: mid
tags: [terminal, darstellung]
steps_to_reproduce:
- Session oeffnen
- Zelle zum ersten Mal anzeigen
expected_behavior: Die Trennlinien werden durchgezogen gezeichnet
actual_behavior: Statt der Linien stehen Rauten
summary: Beim ersten Aufruf einer Zelle kommen Block- und Rahmenzeichen falsch heraus.`

function starteServer(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        letzteAnfrage = { auth: req.headers.authorization }
        try { letzteAnfrage.body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) } catch { /* egal */ }

        if (modus === 'haengen') return                      // nie antworten
        if (modus === 'fehler401') { res.writeHead(401); res.end('{"error":{"message":"bad key"}}'); return }
        if (modus === 'fehler500') { res.writeHead(500, {'Content-Type':'application/json'}); res.end('{"error":{"message":"upstream weg"}}'); return }
        if (modus === 'kaputt')   { res.writeHead(200); res.end('kein json'); return }

        const inhalt = modus === 'leer' ? '' : ANTWORT_GUT
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { content: inhalt } }] }))
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const adr = server.address()
      port = typeof adr === 'object' && adr ? adr.port : 0
      resolve()
    })
  })
}

const basis = () => `http://127.0.0.1:${port}/v1`

describe('litellm-Klient gegen einen echten Server', () => {
  before(starteServer)
  after(() => new Promise<void>((r) => server.close(() => r())))

  it('spricht OpenAI-Form und traegt das Tier als Modell', async () => {
    modus = 'ok'
    const text = await gatewayChat({ system: 's', user: 'u', tier: 't3', baseUrl: basis(), apiKey: 'test-key' })
    assert.match(text, /^title: /)
    assert.equal(letzteAnfrage.body?.model, 't3', 'Tier gehoert ins model-Feld')
    assert.equal(letzteAnfrage.body?.messages?.[0].role, 'system')
    assert.equal(letzteAnfrage.body?.messages?.[1].content, 'u')
  })

  it('schickt den Schluessel als Bearer', async () => {
    modus = 'ok'
    await gatewayChat({ system: 's', user: 'u', baseUrl: basis(), apiKey: 'test-key' })
    assert.equal(letzteAnfrage.auth, 'Bearer test-key')
  })

  it('haengt /chat/completions an, statt den Pfad zu ersetzen', async () => {
    modus = 'ok'
    // Mit und ohne Schraegstrich am Ende muss dasselbe herauskommen.
    await gatewayChat({ system: 's', user: 'u', baseUrl: basis() + '/', apiKey: 'k' })
    assert.ok(letzteAnfrage.body, 'Anfrage kam nicht an — Pfad falsch zusammengesetzt')
  })

  it('ohne Schluessel wird gar nicht erst gefragt', async () => {
    modus = 'ok'
    letzteAnfrage = {}
    await assert.rejects(
      () => gatewayChat({ system: 's', user: 'u', baseUrl: basis(), apiKey: null }),
      (err: unknown) => err instanceof LiteLlmError && err.permanent,
    )
    assert.equal(letzteAnfrage.auth, undefined, 'es haette keine Anfrage rausgehen duerfen')
  })

  it('ein abgewiesener Schluessel ist dauerhaft, eine Stoerung nicht', async () => {
    modus = 'fehler401'
    await assert.rejects(
      () => gatewayChat({ system: 's', user: 'u', baseUrl: basis(), apiKey: 'k' }),
      (err: unknown) => err instanceof LiteLlmError && err.permanent === true,
    )
    modus = 'fehler500'
    await assert.rejects(
      () => gatewayChat({ system: 's', user: 'u', baseUrl: basis(), apiKey: 'k' }),
      (err: unknown) => err instanceof LiteLlmError && err.permanent === false,
    )
  })

  it('nennt den Schluessel in keiner Fehlermeldung', async () => {
    modus = 'fehler401'
    const geheim = 'sk-streng-geheim-nicht-leaken'
    const err = await gatewayChat({ system: 's', user: 'u', baseUrl: basis(), apiKey: geheim })
      .then(() => null, (e: Error) => e)
    assert.ok(err)
    assert.ok(!err.message.includes(geheim), 'Schluessel steht in der Fehlermeldung')
    assert.ok(!err.message.includes('sk-'), 'Schluesselfragment in der Fehlermeldung')
  })

  it('bricht ab, wenn das Gateway nicht antwortet', async () => {
    modus = 'haengen'
    const t0 = Date.now()
    await assert.rejects(() => gatewayChat({ system: 's', user: 'u', baseUrl: basis(), apiKey: 'k', timeoutMs: 400 }))
    assert.ok(Date.now() - t0 < 3000, 'Frist wurde nicht eingehalten')
  })
})

describe('Schluessel aus der Env-Datei', () => {
  const tmp = path.join(os.tmpdir(), `litellm-key-test-${process.pid}`)
  after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* egal */ } })

  const schreibe = (inhalt: string) => {
    fs.mkdirSync(tmp, { recursive: true })
    const f = path.join(tmp, '.cipher-litellm.env')
    fs.writeFileSync(f, inhalt)
    return f
  }

  it('liest LLM_API_KEY', () => {
    assert.equal(readGatewayKey(schreibe('LLM_API_KEY=abc123\n')), 'abc123')
  })

  it('vertraegt export, Anfuehrungszeichen und Kommentare', () => {
    assert.equal(readGatewayKey(schreibe('# Kommentar\nexport LLM_API_KEY="abc 123"\n')), 'abc 123')
  })

  it('nimmt auch LITELLM_API_KEY', () => {
    assert.equal(readGatewayKey(schreibe('LITELLM_API_KEY=zzz\n')), 'zzz')
  })

  it('gibt null zurueck, wenn die Datei fehlt', () => {
    assert.equal(readGatewayKey(path.join(tmp, 'gibtsnicht.env')), null)
  })

  it('gibt null zurueck bei leerem Wert', () => {
    assert.equal(readGatewayKey(schreibe('LLM_API_KEY=\n')), null)
  })
})

describe('Prompt und Parser passen zueinander', () => {
  it('der Prompt nennt jedes Feld, das der Parser liest', () => {
    // Das ist die Naht, an der es still bricht: nennt der Prompt ein Feld anders,
    // faellt es im Parser auf seinen Default zurueck — ohne Fehler, ohne Hinweis.
    for (const feld of ERWARTETE_FELDER) {
      assert.ok(
        SYSTEM_PROMPT.includes(`${feld}:`),
        `Prompt nennt "${feld}:" nicht — der Parser liest es und bekaeme den Default`,
      )
    }
  })

  it('der Prompt verlangt kein JSON', () => {
    // Der Parser liest zeilenweise. Ein hilfsbereites Modell, das JSON liefert,
    // waere unlesbar — deshalb steht das Verbot im Prompt.
    assert.match(SYSTEM_PROMPT, /kein JSON/i)
  })
})

describe('enrichBugreport', () => {
  before(starteServer)
  after(() => new Promise<void>((r) => server.close(() => r())))

  it('macht aus Diktat einen strukturierten Report', async () => {
    modus = 'ok'
    const e = await enrichBugreport('die zeilen zerfallen beim ersten aufruf',
      { baseUrl: basis(), apiKey: 'k' })
    assert.ok(e.enriched)
    assert.equal(e.enriched.severity, 'mid')
    assert.deepEqual(e.enriched.steps_to_reproduce, ['Session oeffnen', 'Zelle zum ersten Mal anzeigen'])
    assert.equal(e.fehler, undefined)
  })

  it('wirft nie — ein totes Gateway liefert einen Grund, keine Ausnahme', async () => {
    modus = 'fehler500'
    const e = await enrichBugreport('text', { baseUrl: basis(), apiKey: 'k' })
    assert.equal(e.enriched, null)
    assert.ok(e.fehler && e.fehler.length > 0)
  })

  it('auch eine unlesbare Antwort ist kein Wurf', async () => {
    modus = 'kaputt'
    const e = await enrichBugreport('text', { baseUrl: basis(), apiKey: 'k' })
    assert.equal(e.enriched, null)
    assert.ok(e.fehler)
  })

  it('leere Beschreibung geht gar nicht erst raus', async () => {
    const e = await enrichBugreport('   ', { baseUrl: basis(), apiKey: 'k' })
    assert.equal(e.enriched, null)
    assert.match(e.fehler!, /leer/)
  })
})

describe('baueReportText', () => {
  it('traegt das Diktat woertlich, auch wenn es geklappt hat', async () => {
    // Das Original ist die Rueckversicherung gegen ein Modell, das glaettet.
    const diktat = 'die zeilen zerfallen, beim ersten aufruf, ganz komisch'
    const e = { enriched: { title: 'T', severity: 'mid', tags: [], steps_to_reproduce: ['a'],
      expected_behavior: 'E', actual_behavior: 'A', summary: 'S' }, tier: 't3' }
    const text = baueReportText(diktat, e)
    assert.match(text, /## T/)
    assert.match(text, /## Original \(Diktat\)/)
    assert.ok(text.includes(diktat), 'Diktat fehlt im Report')
  })

  it('macht den Ausfall im Report sichtbar', () => {
    const text = baueReportText('rohtext', { enriched: null, fehler: 'Gateway nicht erreichbar' })
    assert.ok(text.includes('rohtext'))
    assert.match(text, /Nicht aufbereitet/)
    assert.match(text, /Gateway nicht erreichbar/)
  })
})

describe('Voreinstellungen', () => {
  it('das Arbeitstier ist t3', () => {
    // t1/t2 liefen lokal auf ms01 und kosten nichts, taugen aber nicht zum
    // Formulieren; t4/t5 sind dafuer zu teuer. Steht hier, damit eine Aenderung
    // eine bewusste ist.
    assert.equal(DEFAULT_TIER, 't3')
  })
})

describe('Die Notiz-Ablage wird spaet ausgewertet', () => {
  it('eine erst spaeter erzeugte Ablage wird trotzdem gefunden', async () => {
    // Im `IpcHub` entsteht der BugreportManager **vor** dem NoteManager. Eine
    // direkt uebergebene Instanz waere dort `undefined` — still: keine Notiz,
    // kein Fehler, kein Hinweis. Deshalb eine Funktion, die erst beim Absenden
    // ausgewertet wird. Dieser Test haelt genau das fest.
    const { BugreportManager } = await import('../../src/main/bugreport/bugreport-manager')
    interface NoteOpts { type?: string; mirrorsFile?: string; mirrorCommit?: string; anchorRepo?: string }
    const angelegt: Array<{ title: string; tags: string[]; opts: NoteOpts }> = []
    // Ein Halter statt einer Neuzuweisung: so steht das Feld beim Bau des
    // Managers nachweislich auf `undefined` und wird erst danach gefuellt —
    // genau die Reihenfolge, die im `IpcHub` herrscht.
    const halter: { ablage?: { create(t: string, b: string, tags: string[], o: NoteOpts): Promise<{ id: string }> } } = {}

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bugreport-note-'))
    const mgr = new BugreportManager({ outboxDir: tmp, noteManager: () => halter.ablage })
    assert.equal(halter.ablage, undefined, 'Vorbedingung: beim Bau ist die Ablage noch nicht da')

    // ... erst jetzt entsteht sie
    halter.ablage = {
      async create(title: string, _body: string, tags: string[], opts: NoteOpts) {
        angelegt.push({ title, tags, opts })
        return { id: 'NOTE1' }
      },
    }

    const res = await mgr.submit('die zeilen zerfallen', [], undefined, tmp, undefined, 'bug')
    assert.equal(angelegt.length, 1, 'keine Notiz angelegt — die Ablage wurde zu frueh ausgewertet')
    assert.equal(res.noteId, 'NOTE1')
    assert.ok(angelegt[0].tags.includes('kind:bugreport'))
    assert.ok(angelegt[0].tags.includes('status:open'))
    assert.equal(angelegt[0].opts.type, 'bugreport')
    assert.ok(angelegt[0].opts.mirrorsFile?.endsWith('.md'), 'Notiz spiegelt die Datei nicht')
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('ohne Ablage geht der Report trotzdem raus', async () => {
    const { BugreportManager } = await import('../../src/main/bugreport/bugreport-manager')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bugreport-ohne-'))
    const mgr = new BugreportManager({ outboxDir: tmp })
    const res = await mgr.submit('text', [], undefined, tmp, undefined, 'bug')
    assert.ok(res.id)
    assert.equal(res.noteId, undefined)
    assert.ok(fs.readdirSync(tmp).some((f) => f.endsWith('.md')), 'Datei fehlt')
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('nur Tags aus den bekannten Achsen', async () => {
    // `mux_notes_create` weist unbekannte Tags hart ab, und ein abgewiesener Tag
    // kostet die ganze Notiz. severity kommt vom Modell und darf deshalb nicht
    // ungeprueft durchgereicht werden.
    const { BugreportManager } = await import('../../src/main/bugreport/bugreport-manager')
    const gesehen: string[][] = []
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bugreport-tags-'))
    const mgr = new BugreportManager({
      outboxDir: tmp,
      noteManager: () => ({ async create(_t: string, _b: string, tags: string[]) { gesehen.push(tags); return { id: 'N' } } }),
    })
    await mgr.submit('text', [], undefined, tmp, undefined, 'bug')
    const erlaubt = /^(kind|status|severity|phase|component|workspace|entity):[a-z0-9-]+$/
    for (const t of gesehen[0]) {
      assert.match(t, erlaubt, `Tag "${t}" gehoert zu keiner bekannten Achse`)
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})


describe('Basis-URL normalisieren', () => {
  // Beide Funde stammen aus dem ersten Rauchtest gegen das echte Gateway am
  // 2026-10-02. Gegen den Testserver oben war nichts davon zu sehen: der nimmt
  // jeden Pfad an und kennt jeden Schluesselnamen, den man ihm gibt.

  it('ergaenzt /v1, wenn es fehlt', () => {
    // Die Env-Datei traegt `http://…:4000`, die Config `http://…:4000/v1`.
    // Ohne /v1 landet die Anfrage auf /chat/completions, und litellm antwortet
    // dort GAR NICHT — der Aufruf laeuft in die Frist statt in einen 404. Ein
    // 45-Sekunden-Timeout sieht aus wie ein ueberlastetes Gateway, nicht wie ein
    // Pfadfehler; genau daran ist der erste Rauchtest gescheitert.
    assert.equal(normalisiereBasis('http://host:4000'), 'http://host:4000/v1')
    assert.equal(normalisiereBasis('http://host:4000/'), 'http://host:4000/v1')
  })

  it('laesst ein vorhandenes /v1 in Ruhe', () => {
    assert.equal(normalisiereBasis('http://host:4000/v1'), 'http://host:4000/v1')
    assert.equal(normalisiereBasis('http://host:4000/v1/'), 'http://host:4000/v1')
  })

  it('verdoppelt auch eine andere Versionsnummer nicht', () => {
    assert.equal(normalisiereBasis('http://host:4000/v2'), 'http://host:4000/v2')
  })
})

describe('Schluessel- und URL-Namen in der Env-Datei', () => {
  const tmp = path.join(os.tmpdir(), `litellm-namen-${process.pid}`)
  after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* egal */ } })
  const schreibe = (inhalt: string) => {
    fs.mkdirSync(tmp, { recursive: true })
    const f = path.join(tmp, '.cipher-litellm.env')
    fs.writeFileSync(f, inhalt)
    return f
  }

  it('LITELLM_MASTER_KEY wird erkannt', () => {
    // So ist die Datei tatsaechlich geschrieben, und so heisst der Schluessel
    // auch im Betriebslog von topic-briefings. Der Klient kannte zunaechst nur
    // LLM_API_KEY und fand deshalb nichts — gegen einen Mock waere das nie
    // aufgefallen.
    assert.equal(readGatewayKey(schreibe('LITELLM_MASTER_KEY=geheim\n')), 'geheim')
  })

  it('LITELLM_MASTER_KEY steht an erster Stelle der akzeptierten Namen', () => {
    assert.equal(KEY_NAMEN[0], 'LITELLM_MASTER_KEY')
  })

  it('LITELLM_BASE_URL wird als Basis-URL gelesen', () => {
    const f = schreibe('LITELLM_BASE_URL=http://host:4000\nLITELLM_MASTER_KEY=k\n')
    assert.equal(readGatewayUrl(f), 'http://host:4000')
    assert.equal(readGatewayKey(f), 'k')
  })

  it('ein aehnlich benannter Schluessel wird nicht verwechselt', () => {
    // `MEIN_LITELLM_MASTER_KEY_BACKUP` ist nicht der Schluessel.
    assert.equal(readGatewayKey(schreibe('MEIN_LITELLM_MASTER_KEY_BACKUP=x\n')), null)
  })
})


describe('Vorrang der Basis-URL', () => {
  it('die Env-Datei schlaegt die Config', () => {
    // Dort steht der Schluessel. Haette die Config Vorrang, liefen Adresse und
    // Schluessel auseinander — mit einem Fehlerbild, das nach "Schluessel
    // ungueltig" aussieht, obwohl nur die Adresse alt ist.
    assert.equal(waehleBasis(undefined, 'http://env:4000', 'http://config:4000/v1'), 'http://env:4000')
  })

  it('ohne Env-Datei gilt die Config', () => {
    assert.equal(waehleBasis(undefined, null, 'http://config:4000/v1'), 'http://config:4000/v1')
  })

  it('ein ausdrueckliches Argument schlaegt beides', () => {
    assert.equal(waehleBasis('http://test:1', 'http://env:4000', 'http://config:4000'), 'http://test:1')
  })
})
