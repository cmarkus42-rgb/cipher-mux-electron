// src/main/mcp/bound-token.ts — Workspace- und Rollenbindung im Bearer-Token.
//
// Der normale Weg ist der Verbindungskopf: `X-Mux-Workspace` und `X-Mux-Entity`,
// einmalig beim `initialize` gebunden (siehe workspace-header.ts und
// entity-header.ts). Er ist der bessere, weil Identitaet und Berechtigung
// getrennt bleiben.
//
// Er setzt aber voraus, dass die CLI freie HTTP-Header mitgeben kann. **Codex
// kann das nicht** — gemessen an codex-cli 0.155.1 am 2026-10-01 gegen einen
// Horchposten: die Verbindung kommt an, die `X-Mux-*`-Header nicht. Seine
// Serverkonfiguration kennt `url` und `bearer_token_env_var`, und ein
// `headers`-Schlüssel wird stillschweigend verworfen. opencode kann es dagegen
// (dieselbe Messung, alle drei Header kamen an) — die Lücke ist also nicht
// allgemein, sondern eine Eigenschaft einer CLI.
//
// Darum dieser zweite Weg: die Bindung reist im Token mit. Das Format ist
// `<apiKey>.<base64url(JSON)>`, und drei Eigenschaften machen es tragbar:
//
//  - **Rückwärtsverträglich.** Ein Token ohne Punkt ist der blanke Schlüssel und
//    heisst „ungebunden" — genau das, was jeder bestehende Client schickt.
//  - **Zustandslos.** Keine Tokenverwaltung, keine Ablaufzeit, keine Tabelle,
//    die beim Neustart mit den Session-IDs auseinanderlaeuft.
//  - **Kein neues Geheimnis.** Der Schlüsselteil ist derselbe wie bisher und
//    wird genauso zeitkonstant geprueft. Der Zusatz ist keine Berechtigung,
//    sondern eine Behauptung ueber die Herkunft — und wird, wie die Header
//    auch, gegen die bekannten IDs geprueft, bevor sie gilt.
//
// Das Letzte ist der Punkt, an dem man sich vertun kann: der Zusatz ist nicht
// signiert. Wer den Schlüssel hat, kann sich jeden Workspace ausgeben — aber wer
// den Schlüssel hat, kann ohnehin jedes Werkzeug rufen. Der Zusatz erweitert
// also keine Rechte, er benennt nur, wer anruft. Haette der Schlüssel eine
// feinere Rechtestruktur, waere eine Signatur Pflicht.

/** Trennzeichen zwischen Schlüssel und Bindung. Der Schlüssel ist Hex, er enthaelt keinen Punkt. */
const SEP = '.'

export interface TokenBinding {
  /** Workspace-ID, oder null fuer ausdruecklich ungebunden. */
  workspaceId: string | null
  /** Rollen-ID, oder null fuer ausdruecklich ohne Rolle. */
  entityId: string | null
}

export interface SplitToken extends TokenBinding {
  /** Der Schlüsselteil — das, was gegen den API-Key geprueft wird. */
  apiKey: string
  /** Ob ueberhaupt ein Bindungsteil vorhanden war. */
  bound: boolean
}

/**
 * Baut ein Token, das Workspace und Rolle mittraegt.
 *
 * Ohne beides wird der blanke Schlüssel zurueckgegeben, nicht ein Token mit
 * leerer Bindung: ein Client ohne Bindung soll von einem Client vor dieser
 * Aenderung nicht unterscheidbar sein.
 */
export function buildBoundToken(
  apiKey: string,
  workspaceId: string | null,
  entityId: string | null,
): string {
  if (!workspaceId && !entityId) return apiKey
  const payload: Record<string, string> = {}
  if (workspaceId) payload.w = workspaceId
  if (entityId) payload.e = entityId
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')
  return `${apiKey}${SEP}${encoded}`
}

/**
 * Zerlegt ein Token in Schlüssel und Bindung.
 *
 * Getrennt wird am **ersten** Punkt, weil der Schlüssel keinen enthaelt. Ein
 * unlesbarer Zusatz macht das Token nicht ungueltig — er wird verworfen und das
 * Token gilt als ungebunden. Das ist dieselbe Haltung wie bei
 * `resolveWorkspaceId`: ein Client mit kaputter Bindung muss weiterarbeiten
 * koennen, er arbeitet dann eben ungebunden.
 */
export function splitBoundToken(token: string): SplitToken {
  const i = token.indexOf(SEP)
  if (i < 0) return { apiKey: token, workspaceId: null, entityId: null, bound: false }

  const apiKey = token.slice(0, i)
  const encoded = token.slice(i + 1)

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { apiKey, workspaceId: null, entityId: null, bound: false }
    }
    const p = parsed as Record<string, unknown>
    const str = (v: unknown): string | null => {
      if (typeof v !== 'string') return null
      const t = v.trim()
      return t === '' ? null : t
    }
    return { apiKey, workspaceId: str(p.w), entityId: str(p.e), bound: true }
  } catch {
    // Kein base64url, kein JSON, oder beides. Der Schlüsselteil bleibt gueltig.
    return { apiKey, workspaceId: null, entityId: null, bound: false }
  }
}

/**
 * Zieht den Schlüsselteil aus einem `Authorization`-Kopf, damit die
 * zeitkonstante Pruefung unveraendert gegen den API-Key laufen kann.
 *
 * Gibt den Kopf unveraendert zurueck, wenn er nicht die Form `Bearer <token>`
 * hat — die Zurueckweisung gehoert in `validateBearer`, nicht hierher.
 */
export function stripBindingFromAuthHeader(authHeader: string | undefined): string | undefined {
  if (!authHeader) return authHeader
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return authHeader
  return `Bearer ${splitBoundToken(parts[1]).apiKey}`
}

/**
 * Liest die Bindung aus einem `Authorization`-Kopf.
 *
 * Beide Felder sind `null`, wenn der Kopf fehlt, anders aussieht oder keine
 * Bindung traegt.
 */
export function parseAuthHeaderBinding(authHeader: string | undefined): TokenBinding {
  if (!authHeader) return { workspaceId: null, entityId: null }
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return { workspaceId: null, entityId: null }
  const { workspaceId, entityId } = splitBoundToken(parts[1])
  return { workspaceId, entityId }
}

/** Name der Umgebungsvariablen, aus der Codex das gebundene Token liest. */
export const BOUND_TOKEN_ENV_VAR = 'CIPHER_MUX_MCP_TOKEN'
