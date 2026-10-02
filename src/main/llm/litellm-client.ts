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
 * Einen Wert aus einer Env-Datei lesen.
 *
 * Die Datei wird **nie** als Ganzes zurueckgegeben, geloggt oder in eine
 * Fehlermeldung aufgenommen — nur der eine gesuchte Wert verlaesst diese
 * Funktion.
 */
function leseEnvWert(file: string, namen: readonly string[]): string | null {
  let roh: string
  try {
    roh = fs.readFileSync(file, 'utf-8')
  } catch {
    return null
  }
  for (const zeile of roh.split('\n')) {
    const t = zeile.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m || !namen.includes(m[1])) continue
    const wert = m[2].trim().replace(/^["']|["']$/g, '')
    if (wert) return wert
  }
  return null
}

/**
 * Schluesselnamen, die akzeptiert werden.
 *
 * **`LITELLM_MASTER_KEY` steht zuerst, weil die Datei so geschrieben ist.** Es
 * ist der Master-Key des Gateways, und genau so heisst er auch im Betriebslog von
 * `topic-briefings`. Die anderen beiden sind geduldete Schreibweisen — ein
 * Rauchtest gegen das echte Gateway ist am 2026-10-02 daran gescheitert, dass der
 * Klient nur `LLM_API_KEY` kannte. Gegen einen Mock waere das nie aufgefallen.
 */
export const KEY_NAMEN = ['LITELLM_MASTER_KEY', 'LLM_API_KEY', 'LITELLM_API_KEY'] as const

/** Namen fuer die Basis-URL in derselben Datei. */
export const URL_NAMEN = ['LITELLM_BASE_URL', 'LLM_BASE_URL'] as const

/**
 * Den Schluessel aus `~/.cipher-litellm.env` lesen.
 *
 * Gibt `null` zurueck, wenn die Datei fehlt oder keinen Schluessel traegt —
 * **nie** eine Fehlermeldung, die den Inhalt enthaelt.
 */
export function readGatewayKey(file: string = KEY_FILE): string | null {
  return leseEnvWert(file, KEY_NAMEN)
}

/**
 * Die Basis-URL aus derselben Datei lesen.
 *
 * **Sie schlaegt die Config.** Wer das Gateway umzieht, aendert dann genau eine
 * Datei, und Schluessel und Adresse bleiben beieinander — eine Adresse in der
 * Config und ein Schluessel daneben laufen sonst auseinander.
 */
export function readGatewayUrl(file: string = KEY_FILE): string | null {
  return leseEnvWert(file, URL_NAMEN)
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

/**
 * Basis-URL auf die OpenAI-Form bringen.
 *
 * **`/v1` wird ergaenzt, wenn es fehlt.** Die Env-Datei des Nutzers traegt
 * `http://…:4000`, die Config `http://…:4000/v1` — beide meinen dasselbe Gateway.
 * Ohne diese Normalisierung landet die Anfrage auf `/chat/completions` statt
 * `/v1/chat/completions`, und litellm antwortet dort **gar nicht**: der Aufruf
 * laeuft in die Frist statt in einen 404. Genau so ist der erste Rauchtest am
 * 2026-10-02 gescheitert, und ein 45-Sekunden-Timeout sieht aus wie ein
 * ueberlastetes Gateway, nicht wie ein Pfadfehler.
 */
export function normalisiereBasis(baseUrl: string): string {
  const ohneSchraegstrich = baseUrl.replace(/\/+$/, '')
  return /\/v\d+$/.test(ohneSchraegstrich) ? ohneSchraegstrich : ohneSchraegstrich + '/v1'
}

/**
 * Welche Basis-URL gilt.
 *
 * Reihenfolge: ausdrueckliches Argument (nur Tests) > **Env-Datei** > Config.
 *
 * **Die Env-Datei schlaegt die Config mit Absicht.** Dort steht der Schluessel,
 * und wer das Gateway umzieht, aendert dann genau eine Datei. Haette die Config
 * Vorrang, liefen Adresse und Schluessel auseinander — mit einem Fehlerbild, das
 * nach „Schluessel ungueltig" aussieht, obwohl nur die Adresse alt ist.
 *
 * Als eigene Funktion, weil sich die Reihenfolge sonst nicht pruefen laesst:
 * `gatewayChat` liest die Datei aus dem Home, und ein Test kann die nicht
 * verschieben.
 */
export function waehleBasis(
  explizit: string | undefined,
  ausEnvDatei: string | null,
  ausConfig: string,
): string {
  return explizit ?? ausEnvDatei ?? ausConfig
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
  const baseUrl = waehleBasis(opts.baseUrl, readGatewayUrl(), cfg.baseUrl)
  const tier = opts.tier ?? cfg.tier
  const key = opts.apiKey !== undefined ? opts.apiKey : readGatewayKey()

  if (!key) {
    throw new LiteLlmError(
      `Kein Gateway-Schluessel. Erwartet wird ${KEY_NAMEN[0]} in ${KEY_FILE}.`,
      true,
    )
  }

  const url = new URL(normalisiereBasis(baseUrl) + '/chat/completions')
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
