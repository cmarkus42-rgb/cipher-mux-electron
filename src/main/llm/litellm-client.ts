/**
 * Klient fuer das litellm-Tier-Gateway auf ms01.
 *
 * **Warum ein Gateway und nicht wieder ein eigener Modellzoo.** Der Mux hatte mit
 * `bugreport/ollama-client.ts` angefangen, Host, Port und Modellnamen selbst zu
 * verwalten. Jede Anwendung im Haus, die das tut, pflegt dieselbe Tabelle noch
 * einmal — und sie altert in jeder einzeln. Das Gateway hat sie genau einmal
 * (`CIPHER-MUX/projects/DGX/litellm-ms01/config.yaml`), spricht OpenAI-Protokoll
 * und benennt Modelle als **Tiers**: `t1`/`t2` laufen lokal auf ms01 und kosten
 * nichts, `t3` ist das guenstige Arbeitstier, `t4`/`t5` sind die teuren. Wer hier
 * ein Tier waehlt, waehlt eine Preis- und Qualitaetsklasse, kein Modell — und ein
 * Modellwechsel am Gateway erreicht den Mux ohne Codeaenderung.
 *
 * **`node:http`, nicht `fetch`.** Dieselbe Begruendung, die schon am Ollama-Klienten
 * steht: `fetch` im Main-Prozess geht ueber Electrons Chromium-Netzstack und faellt
 * dort ueber System-Proxy-Einstellungen. Das Node-Modul umgeht Chromium ganz.
 *
 * **Der Schluessel steht nicht in der Config.** Er kommt aus `~/.cipher-litellm.env`,
 * derselben Konvention wie die uebrigen Zugaenge des Nutzers, und wird weder
 * geloggt noch in eine Fehlermeldung aufgenommen. Die Config traegt nur, was
 * unkritisch ist: Basis-URL und Tier.
 */

import * as http from 'node:http'
import * as https from 'node:https'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/** Basis-URL des Gateways, wenn die Config nichts sagt. */
export const DEFAULT_GATEWAY_URL = 'http://100.67.95.13:4000/v1'

/** Datei mit dem Gateway-Schluessel. Bewusst im Home, nicht im Repo. */
export const KEY_FILE = path.join(os.homedir(), '.cipher-litellm.env')

/** Tier fuer das Aufraeumen eines diktierten Bugreports. */
export const DEFAULT_TIER = 't3'

export class LiteLlmError extends Error {
  constructor(
    message: string,
    /** `true`, wenn ein erneuter Versuch sinnlos ist (Konfiguration statt Stoerung). */
    readonly permanent = false,
  ) {
    super(message)
    this.name = 'LiteLlmError'
  }
}

/**
 * Den Schluessel aus `~/.cipher-litellm.env` lesen.
 *
 * Akzeptiert `LLM_API_KEY=wert` und `LITELLM_API_KEY=wert`, mit oder ohne
 * Anfuehrungszeichen, Kommentarzeilen werden uebersprungen. Gibt `null` zurueck,
 * wenn die Datei fehlt oder keinen Schluessel traegt — **nie** eine Fehlermeldung,
 * die den Inhalt enthaelt.
 */
export function readGatewayKey(file: string = KEY_FILE): string | null {
  let roh: string
  try {
    roh = fs.readFileSync(file, 'utf-8')
  } catch {
    return null
  }
  for (const zeile of roh.split('\n')) {
    const t = zeile.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^(?:export\s+)?(LLM_API_KEY|LITELLM_API_KEY)\s*=\s*(.*)$/)
    if (!m) continue
    const wert = m[2].trim().replace(/^["']|["']$/g, '')
    if (wert) return wert
  }
  return null
}

/** Basis-URL und Tier aus der Config, mit Defaults. */
function getGatewayConfig(): { baseUrl: string; tier: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- synchrones Lazy-Load, CommonJS-Ziel
    const { configStore } = require('../config/config-store')
    const llm = configStore.get('llm')
    return {
      baseUrl: llm?.gatewayUrl || DEFAULT_GATEWAY_URL,
      tier: llm?.gatewayTier || DEFAULT_TIER,
    }
  } catch {
    return { baseUrl: DEFAULT_GATEWAY_URL, tier: DEFAULT_TIER }
  }
}

interface ChatAntwort {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

/**
 * Eine Anfrage an das Gateway, OpenAI-Protokoll (`/chat/completions`).
 *
 * `baseUrl` darf mit oder ohne `/v1` enden; der Pfad wird angehaengt, nicht ersetzt.
 */
export async function gatewayChat(opts: {
  system: string
  user: string
  /** Tier-Name; ohne Angabe der aus der Config. */
  tier?: string
  /** Obergrenze fuer die Antwort. */
  maxTokens?: number
  /** Abbruch nach dieser Zeit. Ein haengendes Gateway darf nichts blockieren. */
  timeoutMs?: number
  /** Nur fuer Tests: Basis-URL und Schluessel direkt setzen. */
  baseUrl?: string
  apiKey?: string | null
}): Promise<string> {
  const cfg = getGatewayConfig()
  const baseUrl = opts.baseUrl ?? cfg.baseUrl
  const tier = opts.tier ?? cfg.tier
  const key = opts.apiKey !== undefined ? opts.apiKey : readGatewayKey()

  if (!key) {
    throw new LiteLlmError(
      `Kein Gateway-Schluessel. Erwartet wird LLM_API_KEY in ${KEY_FILE}.`,
      true,
    )
  }

  const url = new URL(baseUrl.replace(/\/+$/, '') + '/chat/completions')
  const koerper = JSON.stringify({
    model: tier,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    max_tokens: opts.maxTokens ?? 1200,
    temperature: 0.2,
  })

  const transport = url.protocol === 'https:' ? https : http
  const timeoutMs = opts.timeoutMs ?? 45_000

  return new Promise<string>((resolve, reject) => {
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(koerper),
          Authorization: `Bearer ${key}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          const status = res.statusCode ?? 0
          if (status === 401 || status === 403) {
            // Den Schluessel nicht in die Meldung nehmen, auch nicht gekuerzt.
            reject(new LiteLlmError('Gateway weist den Schluessel ab (HTTP ' + status + ')', true))
            return
          }
          if (status < 200 || status >= 300) {
            let grund = `HTTP ${status}`
            try {
              const j = JSON.parse(text) as ChatAntwort
              if (j.error?.message) grund += ` — ${j.error.message}`
            } catch { /* Rohtext ist hier nicht hilfreich */ }
            reject(new LiteLlmError(`Gateway-Fehler: ${grund}`, status === 404))
            return
          }
          try {
            const j = JSON.parse(text) as ChatAntwort
            const inhalt = j.choices?.[0]?.message?.content
            if (typeof inhalt !== 'string' || !inhalt.trim()) {
              reject(new LiteLlmError('Gateway lieferte eine leere Antwort'))
              return
            }
            resolve(inhalt)
          } catch {
            reject(new LiteLlmError('Gateway-Antwort ist kein gueltiges JSON'))
          }
        })
      },
    )
    req.on('error', (err) => reject(new LiteLlmError(`Gateway nicht erreichbar: ${err.message}`)))
    req.on('timeout', () => {
      req.destroy()
      reject(new LiteLlmError(`Gateway antwortet nicht binnen ${timeoutMs} ms`))
    })
    req.write(koerper)
    req.end()
  })
}

/** Ist das Gateway erreichbar und der Schluessel gueltig? Fuer Einstellungen und Diagnose. */
export async function testGateway(baseUrl?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await gatewayChat({
      system: 'Antworte mit genau einem Wort.',
      user: 'ping',
      maxTokens: 5,
      timeoutMs: 15_000,
      baseUrl,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verbindung fehlgeschlagen' }
  }
}
