import * as fs from 'fs'
import * as path from 'path'
import type {
  AgentAdapter,
  AdapterModel,
  LaunchCommand,
  LaunchOpts,
  AdapterContext,
  ProjectInstructions,
  InstructionsTarget,
  SendOpts,
} from '../agent-adapter'
import type { AdapterFeature, AdapterCapabilities, ContextUsage } from '../../../shared/types'
import { buildMcpServerConfig } from '../../mcp/workspace-header'
import {
  getEntityBoundary,
  buildOpenCodeBoundaryPlugin,
  OPENCODE_BOUNDARY_PLUGIN_FILENAME,
} from '../../session/entity-boundaries'
import {
  writeOpenCodeUsagePlugin,
  OPENCODE_USAGE_PLUGIN_FILENAME,
} from '../../monitoring/opencode-usage-plugin'
import {
  buildIdlePlugin,
  IDLE_PLUGIN_FILENAME,
  IDLE_SIGNAL_FILENAME,
} from '../../local-factory/worker-done'
import { parseOpenCodeModels } from '../adapter-models'
import { runCommand } from '../../util/exec-util'
import {
  readLocalProfileFile,
  resolveLocalWorkerProfile,
  buildLocalProviderBlock,
  localModelSpec,
  LOCAL_PROVIDER_ID,
  type LocalWorkerConfig,
} from '../../local-factory/local-provider'

/**
 * opencode-Adapter — Tier-2.
 *
 * Gemessen an **opencode 2.0.29 vom 2026-10-14** (Spec
 * `docs/superpowers/specs/2026-10-14-opencode-2-anpassung.md`); die Messungen an
 * 1.18.34/35 vom 2026-10-01/09 stehen im Handover `2026-10-01-drei-cli-adapter.md`.
 * Wie beim Codex-Adapter gilt: erst gegen die Unit-Tests, dann gegen die laufende
 * CLI — die zweite Runde ist die, die zaehlt. Was hier steht, steht in keinem Diff
 * und kann mit der naechsten CLI-Version kippen.
 *
 * Was sich mit opencode 2 geaendert hat, und jedes davon waere still gewesen:
 *
 * 1. **Ein V1-Plugin laeuft nicht.** opencode 2 weist `export default async () =>
 *    ({…})` mit „Plugin must export a default definition with an id and an effect
 *    or setup function" ab — eine WARN-Zeile im Server-Log, sonst nichts. Die Session
 *    startet gesund und laeuft ohne Rollengrenze, ohne Usage, ohne Idle-Signal. Die
 *    drei generierten Plugins sind jetzt Definitionen `{ id, setup }`.
 *
 * 2. **Plugins laufen im Server, nicht in der TUI — deshalb `--standalone`.** Im
 *    geteilten Hintergrunddienst las ein Plugin als `CIPHER_MUX_SESSION_ID` die ID
 *    der Session, die den Dienst gestartet hat (gemessen: zwei Laeufe mit je
 *    eigener Variable bekamen beide „projekt-a"), und sah die Ereignisse aller
 *    Verzeichnisse. Unter `--standalone` ist der Server ein Kind der CLI und erbt
 *    die Umgebung (gemessen korrekt). Ein Prozess = eine Mux-Session.
 *
 * 3. **`--model`, `--fork` und `--pure` gibt es am Top-Level nicht.** Eine
 *    unbekannte Option wird nicht gemeldet: die CLI druckt die Hilfe und beendet
 *    sich, im Pane steht danach eine Shell. `--model` und `--fork` kennt nur
 *    `opencode run`. Das Modell der Rolle reist deshalb als `model` in der
 *    `opencode.json`; ein Fork wird sichtbar verweigert (siehe `buildLaunchCommand`).
 *
 * 4. **`CLAUDE.md` wird nicht mehr gelesen.** opencode 2 entdeckt nur `AGENTS.md`.
 *    Die V1-Messung („liegt nur eine CLAUDE.md da, liest es sie") gilt nicht mehr.
 *    `instructionsTarget` schreibt wie bei Codex immer nach `AGENTS.md`, mit
 *    Verweis auf eine vorhandene `CLAUDE.md`.
 *
 * 5. **Plugins liegen in `.opencode/plugins/` und stehen NICHT in der Config.** Die
 *    Auto-Entdeckung ist gemessen; ob Auto-Entdeckung plus Eintrag in V2 doppelt
 *    laedt, nicht. Alte V1-Dateien in `.opencode/plugin/` und ihre Eintraege im
 *    `plugin`-Feld werden entfernt — ein stehengebliebener Eintrag auf eine V1-Datei
 *    erzeugt bei jedem Start eine WARN-Zeile, und ein altes Grenzen-Plugin sieht
 *    aus, als schuetze es.
 *
 * Unveraendert aus der 1.x-Zeit und weiter gueltig:
 *
 * a. **MCP mit freien HTTP-Headern funktioniert.** `authorization`,
 *    `x-mux-workspace` und `x-mux-entity` kamen an (1.18.34, Horchposten). Deshalb
 *    nutzt dieser Adapter den **normalen** Weg — `buildMcpServerConfig` aus
 *    `mcp/workspace-header.ts` — und **nicht** die Token-Bindung aus
 *    `mcp/bound-token.ts`, die einzig existiert, weil Codex keine Header senden
 *    kann. Die V1-Form `mcp.<name>` wird von 2.x still normalisiert (`opencode
 *    debug config` zeigt die Normalform); die laufende projekt-b-Session selbst
 *    haengt an einer solchen Datei.
 *
 * b. **Kein positionales Projektargument.** `opencode [directory]` nimmt ein
 *    Verzeichnis entgegen, und der Adapter gab `opts.projectPath` dorthin — bis die
 *    Abnahme zeigte, dass genau das die Session aus dem richtigen Verzeichnis
 *    herauszieht: `LaunchOpts.projectPath` ist bei einer Entity-Session das
 *    **authored**-Verzeichnis, `postLaunchInjection` schreibt ins **Run**-Verzeichnis,
 *    wo der tmux-Pane schon steht. Die generierte `opencode.json` wurde nie gelesen:
 *    keine MCP-Werkzeuge, keine Rollengrenze, kein Usage — lautlos. Also wird das
 *    cwd geerbt, wie Claude Code es tut.
 *
 * c. **Rollengrenzen laufen ueber `ctx.tool.hook("execute.before")`** und feuern:
 *    ein Wurf verhindert den Aufruf (`executed: false`), der Grund erreicht das
 *    Modell wortwoertlich, `--auto` umgeht es nicht. Begruendung und Messprotokoll
 *    in `session/entity-boundaries.ts`.
 *
 * d. **Context-Usage ohne Statusline, ueber dasselbe Plugin-System.** Details und die
 *    Grenze der Messung in `monitoring/opencode-usage-plugin.ts`.
 *
 * Eine projektlokale `opencode.json` im Arbeitsverzeichnis greift (`opencode debug
 * config` zeigt sie aufgeloest, V1-Formen normalisiert).
 */

/** Minimale Sicht auf die Agent-Konfiguration. Spiegelbild zu CodexConfigReader. */
export interface OpenCodeConfigReader {
  getSkipPermissions(): boolean
  /** Lokales Modell für `local-worker`, aus der Profil-Datei des Run-Verzeichnisses. Spec 2026-10-12 §4.4. */
  getLocalWorker?(runDir: string): LocalWorkerConfig | null
}

const defaultConfigReader: OpenCodeConfigReader = {
  getSkipPermissions(): boolean {
    // Lazy require, damit der Adapter ohne Electron testbar bleibt.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { configStore } = require('../../config/config-store')
    return configStore.get('agent').skipPermissions
  },
  getLocalWorker(runDir: string): LocalWorkerConfig | null {
    // Die Datei schreibt der Worker-Host vor dem Start. Fehlt sie, gilt das Standardprofil.
    // Achtung: ein von Hand gestarteter Worker liest eine liegengebliebene Datei des
    // letzten Laufs -- das Standardprofil gilt nur, wenn gar keine da ist.
    const fromFile = readLocalProfileFile(runDir)
    if (fromFile) return fromFile.cfg
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { configStore } = require('../../config/config-store')
    const r = resolveLocalWorkerProfile(configStore.get('agent') ?? {})
    return r.ok ? r.cfg : null
  },
}

/** Die Rolle, für die der lokale Anbieter geschrieben wird. */
export const LOCAL_WORKER_ENTITY_ID = 'local-worker'

/** Name der Konfigurationsdatei, die dieser Adapter schreibt. */
export const OPENCODE_CONFIG_FILENAME = 'opencode.json'

/**
 * Variante, die der Mux **nicht** schreibt, aber kennen muss.
 *
 * opencode liest `opencode.json` oder `opencode.jsonc`. Welche von beiden
 * gewinnt, wenn beide liegen, ist nicht gemessen — und JSONC laesst sich ohne
 * neue Abhaengigkeit nicht verlustfrei lesen-mergen-schreiben. Deshalb schreibt
 * der Adapter nur die `.json` und sagt es laut, wenn daneben eine `.jsonc`
 * liegt, statt stillschweigend eine Datei zu pflegen, die vielleicht ignoriert
 * wird.
 */
export const OPENCODE_CONFIG_FILENAME_JSONC = 'opencode.jsonc'

/** Schema-Verweis, den opencode in seinen Beispielen fuehrt. */
export const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json'

/**
 * Verzeichnis, aus dem opencode 2 Plugins von sich aus laedt.
 *
 * Gemessen an 2.0.29: ein Plugin dort wird ohne Config-Eintrag geladen (Log:
 * `loading plugin id=…/.opencode/plugins/…`). Die Doku nennt den Plural als
 * bevorzugt. Nur eines von beiden wird beschrieben, damit dieselbe Datei nicht
 * zweimal liegt.
 */
export const OPENCODE_PLUGIN_SUBDIR = path.join('.opencode', 'plugins')

/**
 * Das V1-Verzeichnis. Dort liegen nach einem Upgrade noch die alten Plugins, die
 * 2.x abweist. Der Mux schreibt dort nichts mehr und raeumt seine eigenen Dateien
 * weg — nur diese.
 */
export const OPENCODE_LEGACY_PLUGIN_SUBDIR = path.join('.opencode', 'plugin')

/**
 * Wo sich der Mux merkt, was er in `model` geschrieben und was er dabei ersetzt
 * hat. Ein Feld `model` ist ein String; ihm laesst sich nicht ansehen, wer es
 * gesetzt hat. Ohne Marker muesste der Mux entweder jedes `model` fuer fremd halten
 * (ein Rollen-Override bliebe fuer immer stehen) oder jedes fuer eigen (das Modell
 * des Projekts ginge verloren).
 */
export const OPENCODE_MODEL_MARKER_FILE = path.join('.opencode', 'cipher-mux-model.json')

/**
 * Die Plugins, die der Mux besitzt — und nur die.
 *
 * `mergeOpenCodeConfig` raeumt genau diese Namen aus dem `plugin`/`plugins`-Feld;
 * jeder fremde Eintrag bleibt. Ohne diese Liste waere die Alternative, das ganze
 * Feld zu uebernehmen, und damit ein Plugin des Projekts zu verlieren.
 */
export const OPENCODE_OWNED_PLUGIN_FILENAMES: readonly string[] = [
  OPENCODE_USAGE_PLUGIN_FILENAME,
  OPENCODE_BOUNDARY_PLUGIN_FILENAME,
  IDLE_PLUGIN_FILENAME,
]

/**
 * Kontextfenster, wenn es sich nicht erfragen laesst — und das ist hier der
 * Normalfall.
 *
 * Gemessen: `GET /api/model` eines laufenden opencode liefert ohne angemeldeten
 * Anbieter eine **leere** Liste, und einen selbst eingetragenen Anbieter kennt
 * der Katalog nie. Es gibt damit keinen gepruefften Weg, pro Modell die echte
 * Grenze zu lesen. Der Wert steht hier als Rueckfalloption, nicht als Wahrheit —
 * dieselbe Entscheidung wie `CODEX_FALLBACK_CONTEXT_WINDOW`: die Tokenzahlen in
 * der Anzeige sind gemessen, die Prozentzahl ist eine Schaetzung.
 */
export const OPENCODE_FALLBACK_CONTEXT_WINDOW = 200_000

/** Der `mcp.<name>`-Eintrag, wie opencode ihn erwartet. */
export interface OpenCodeMcpEntry {
  type: 'remote'
  url: string
  enabled: true
  headers: Record<string, string>
}

/**
 * Baut den MCP-Eintrag fuer opencode.
 *
 * Die Kopfzeilen kommen aus `buildMcpServerConfig`, damit die Kopfnamen an genau
 * einer Stelle stehen: `WORKSPACE_HEADER_CANONICAL` und
 * `ENTITY_HEADER_CANONICAL` sind dieselben Namen, die der Server beim
 * `initialize` bindet. Umgeformt wird nur die Huelle — opencode nennt den Typ
 * `remote`, wo Claude Code `http` sagt, und will ein ausdrueckliches `enabled`.
 */
export function buildOpenCodeMcpEntry(
  mcpUrl: string,
  apiKey: string,
  workspaceId: string | null,
  entityId?: string | null,
): OpenCodeMcpEntry {
  const { headers } = buildMcpServerConfig(mcpUrl, apiKey, workspaceId, entityId)
  return { type: 'remote', url: mcpUrl, enabled: true, headers }
}

/**
 * Entfernt die eigenen Plugin-Eintraege aus einem `plugin`/`plugins`-Feld.
 * Fremde Eintraege bleiben in ihrer Reihenfolge; ein Feld, das kein Array ist,
 * bleibt wie es ist — es laesst sich nicht filtern, und raten waere schlimmer.
 * Erkannt wird ein Eintrag als String oder als `{ package }` (V2-Objektform) am
 * Dateinamen.
 */
function dropOwnedPluginEntries(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  const isOwned = (spec: unknown): boolean => {
    const name =
      typeof spec === 'string' ? spec
      : spec && typeof spec === 'object' && typeof (spec as { package?: unknown }).package === 'string'
        ? (spec as { package: string }).package
        : null
    return name !== null && OPENCODE_OWNED_PLUGIN_FILENAMES.some(f => name.endsWith(f))
  }
  return value.filter(spec => !isOwned(spec))
}

/**
 * Mischt den Mux-Eintrag in eine bestehende `opencode.json`.
 *
 * Lesen-mergen-schreiben wie `claude-code.ts` es mit `settings.local.json` tut,
 * und aus demselben Grund: die Datei gehoert dem Projekt, nicht dem Mux. Besitz
 * hat der Mux nur an `mcp['cipher-mux']` — alles andere, auch fremde
 * MCP-Server, bleibt unberuehrt.
 *
 * `$schema` wird nur **ergaenzt**, wenn es fehlt. Einen vorhandenen Wert zu
 * ueberschreiben hiesse, dem Projekt eine Entscheidung wegzunehmen, die es
 * schon getroffen hat.
 *
 * **Plugins: der Mux traegt keine mehr ein, er raeumt nur auf.** opencode 2
 * entdeckt `.opencode/plugins/` von selbst. Aus `plugin` (V1) und `plugins` (V2)
 * werden die **eigenen** Namen herausgefiltert — ein stehengebliebener Eintrag auf
 * eine V1-Datei erzeugte bei jedem Start eine WARN-Zeile, ein Grenzen-Eintrag
 * erzwaenge weiter eine Regel, die niemand mehr erklaert. Leere Felder werden
 * entfernt, aber nur, wenn das Filtern sie geleert hat.
 *
 * Das **Rollen-Modell** (`model`) setzt `postLaunchInjection` selbst, mit Marker —
 * hier geht es nur um den lokalen Anbieter des Workers.
 */
export function mergeOpenCodeConfig(
  existing: Record<string, unknown>,
  entry: OpenCodeMcpEntry,
  local: { provider: Record<string, unknown>; model: string } | null = null,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing }

  if (typeof merged.$schema !== 'string') {
    merged.$schema = OPENCODE_SCHEMA_URL
  }

  const mcp =
    merged.mcp && typeof merged.mcp === 'object' && !Array.isArray(merged.mcp)
      ? { ...(merged.mcp as Record<string, unknown>) }
      : {}
  mcp['cipher-mux'] = entry
  merged.mcp = mcp

  for (const field of ['plugin', 'plugins'] as const) {
    if (!(field in merged)) continue
    const before = merged[field]
    const after = dropOwnedPluginEntries(before)
    if (Array.isArray(before) && Array.isArray(after)) {
      // Nur ein Feld, das das Filtern GELEERT hat, verschwindet — ein leeres
      // Feld, das das Projekt schon so hatte, ist nicht Sache des Mux.
      if (after.length === 0 && before.length > 0) delete merged[field]
      else merged[field] = after
    }
  }

  // Lokaler Anbieter (Local Cyber Factory). Besitz hat der Mux nur an
  // provider['cipher-local'] und an einem model, das darauf zeigt — ein vom
  // Projekt gesetztes anderes model bleibt, wenn die Rolle keinen lokalen
  // Anbieter (mehr) hat.
  const provider =
    merged.provider && typeof merged.provider === 'object' && !Array.isArray(merged.provider)
      ? { ...(merged.provider as Record<string, unknown>) }
      : {}
  const ownModel =
    typeof merged.model === 'string' && merged.model.startsWith(`${LOCAL_PROVIDER_ID}/`)
  if (local) {
    provider[LOCAL_PROVIDER_ID] = local.provider
    merged.model = local.model
  } else {
    delete provider[LOCAL_PROVIDER_ID]
    if (ownModel) delete merged.model
  }
  if (Object.keys(provider).length > 0) merged.provider = provider
  else delete merged.provider

  return merged
}

/** Was der Mux zuletzt in `model` geschrieben hat, und was dort vorher stand. */
export interface OpenCodeModelMarker {
  written: string
  replaced: string | null
}

/** Liest den Marker; fehlt er oder ist er kaputt, gibt es keinen. */
function readModelMarker(projectPath: string): OpenCodeModelMarker | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(projectPath, OPENCODE_MODEL_MARKER_FILE), 'utf-8'))
    if (raw && typeof raw.written === 'string' && (raw.replaced === null || typeof raw.replaced === 'string')) {
      return { written: raw.written, replaced: raw.replaced }
    }
  } catch {
    // Kein Marker: dann hat der Mux nichts zu erinnern.
  }
  return null
}

/**
 * Macht den frueheren Mux-Eintrag in `model` rueckgaengig — und nur ihn.
 *
 * Steht dort noch genau das, was der Mux geschrieben hat, kommt der ersetzte Wert
 * zurueck (oder das Feld verschwindet, wenn es keinen gab). Steht dort etwas
 * anderes, hat der Nutzer es seitdem selbst geaendert, und es bleibt.
 */
function restoreOwnedModel(config: Record<string, unknown>, marker: OpenCodeModelMarker): Record<string, unknown> {
  if (config.model !== marker.written) return config
  const restored = { ...config }
  if (marker.replaced !== null) restored.model = marker.replaced
  else delete restored.model
  return restored
}

export class OpenCodeAdapter implements AgentAdapter {
  readonly id = 'opencode'
  readonly displayName = 'opencode'
  readonly tier = 'tier-2' as const
  /**
   * Woran man die TUI an ihrer Eingabe erkennt — gemessen an opencode 2 am
   * 2026-10-23 (Probe: `test/fixtures/panes/opencode-2-idle.txt`). Die
   * Unterkante des Eingabekastens (`╹▀▀…`) und die Fußzeile mit
   * `ctrl+p commands`. Ein `❯` zeichnet opencode nicht; mit den Markern von
   * Claude Code lief jede Zustellung in „neither a status-line report nor a
   * visible prompt", gesendet wurde nichts. Eine Shell nach der Hilfe-Ausgabe
   * zeigt keins von beiden.
   */
  readonly promptMarkers = ['╹▀▀', 'ctrl+p commands'] as const

  private readonly configReader: OpenCodeConfigReader

  constructor(configReader?: OpenCodeConfigReader) {
    this.configReader = configReader ?? defaultConfigReader
  }

  buildLaunchCommand(opts: LaunchOpts): LaunchCommand {
    // **Fork: sichtbar verweigern, weder werfen noch still fortsetzen.**
    // Das Top-Level-opencode 2.0.29 hat kein `--fork` (nur `opencode run`), und
    // `opencode session` kennt kein `fork`; der Weg ueber `POST
    // /api/session/{id}/fork` ist ungemessen. Ein Wurf waere falsch: start() ruft
    // diese Methode erst NACH tmux.createSession und sessions.set auf und
    // hinterliesse eine registrierte, leere Session. Ein stilles --continue oder
    // --session wuerde die QUELLE fortsetzen statt sie zu verzweigen. Also steht im
    // Pane eine Zeile — als Shell-Zeile ohne ein einziges Sonderzeichen, denn
    // cmd + args werden mit Leerzeichen zusammengefuegt.
    if (opts.forkFromClaudeSessionId || opts.forkLatest) {
      return { cmd: 'echo', args: ['opencode', 'Fork', 'ist', 'in', 'opencode', '2', 'nicht', 'verfuegbar'] }
    }

    // **Immer `--standalone`.** Ein V2-Plugin laeuft im Server. Im geteilten
    // Hintergrunddienst ist `process.env.CIPHER_MUX_SESSION_ID` die ID der Session,
    // die den Dienst gestartet hat, und das Plugin sieht die Ereignisse aller
    // Verzeichnisse — gemessen an 2.0.29. Unter --standalone ist der Server ein
    // Kind der CLI, erbt die Umgebung und sieht nur die eigene Session. Siehe
    // Kopfkommentar Punkt 2.
    const args: string[] = ['--standalone']

    // **Kein positionales Projektargument.** Siehe Kopfkommentar Punkt b:
    // `opts.projectPath` bleibt Teil des Vertrags und wird hier bewusst nicht
    // benutzt; das cwd des Panes ist die Wahrheit, wie bei Claude Code.

    if (opts.resumeClaudeSessionId) {
      args.push('--session', opts.resumeClaudeSessionId)
    } else if (opts.resume) {
      // Ohne ID bleibt nur „die letzte Unterhaltung dieses Verzeichnisses".
      // Das ist genau die Lesart, die `LaunchOpts.resume` vorschreibt — kein
      // interaktiver Picker, in dem eine unbeaufsichtigte Entity-Session
      // sitzen bleibt.
      args.push('--continue')
    }

    // **Kein `--model`.** Das Top-Level-opencode kennt es nicht, und eine
    // unbekannte Option wird nicht gemeldet — die CLI druckt die Hilfe und beendet
    // sich. Das Modell der Rolle schreibt `postLaunchInjection` als `model` in die
    // opencode.json (Kopfkommentar Punkt 3). Auch das Profil des lokalen Workers
    // wird dort gegen den Override entschieden, nicht hier.

    if (opts.skipPermissions ?? this.configReader.getSkipPermissions()) {
      // Das Gegenstueck zu `--dangerously-skip-permissions`: Permissions
      // werden automatisch erlaubt. Ohne das bleibt eine Entity-Session an der
      // ersten Rueckfrage stehen, und niemand antwortet.
      args.push('--auto')
    }

    return { cmd: 'opencode', args }
  }

  /**
   * Schreibt `opencode.json` plus die Plugins ins Projekt.
   *
   * **Die Bindung reist im Kopf, nicht im Token.** Workspace (`ctx.workspaceId`)
   * und Rolle (`ctx.entityId`) gehen als `X-Mux-Workspace` und `X-Mux-Entity`
   * mit; dass opencode freie Header sendet, ist gegen einen Horchposten belegt.
   * Damit ist dies der Normalfall des Vertrags und nicht der Sonderweg, den
   * Codex gehen muss.
   *
   * **Die Rollengrenze entsteht hier und nicht im SessionManager.** Dort wird
   * sie fuer Claude Code geschrieben — als Hook in `.claude/settings.local.json`,
   * eine Datei, die opencode nicht liest. Eine Grenze gehoert dorthin, wo die
   * Datei entsteht, die sie traegt; sonst schreibt eine Stelle die Regel und
   * eine andere vergisst, sie zu verdrahten.
   *
   * **Das Rollen-Modell reist als `model`** (kein `--model` am Top-Level). Vor dem
   * Mischen wird ein frueherer Mux-Eintrag zurueckgenommen (Marker), danach der
   * neue gesetzt. Der lokale Worker hat Vorrang: sein Profil bestimmt das Modell.
   *
   * Projektlokal und nicht global, aus demselben Grund wie bei Codex: die
   * globale Konfiguration gehoert dem Nutzer, und zwei Workspaces wuerden sich
   * darin gegenseitig ueberschreiben.
   *
   * Ein Fehlschlag wird geloggt, nicht geworfen: `postLaunchInjection` haengt an
   * der Session-Init-Kette, und ein Wurf dort kostet still den gesamten
   * Restore.
   */
  async postLaunchInjection(ctx: AdapterContext): Promise<void> {
    try {
      const configPath = path.join(ctx.projectPath, OPENCODE_CONFIG_FILENAME)

      if (fs.existsSync(path.join(ctx.projectPath, OPENCODE_CONFIG_FILENAME_JSONC))) {
        // Welche der beiden Dateien gewinnt, ist nicht gemessen. Lieber eine
        // Logzeile als die Annahme, der Mux habe hier etwas erreicht.
        console.warn(
          `[OpenCodeAdapter] ${OPENCODE_CONFIG_FILENAME_JSONC} liegt daneben — Vorrang ungemessen, geschrieben wird ${OPENCODE_CONFIG_FILENAME}`,
        )
      }

      let existing: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existing = parsed as Record<string, unknown>
        }
      } catch {
        // Datei fehlt oder ist kein brauchbares JSON — dann faengt der Mux neu
        // an. Bewusst nicht: eine unlesbare Datei als Grund, nichts zu tun.
      }

      const localCfg =
        ctx.entityId === LOCAL_WORKER_ENTITY_ID ? (this.configReader.getLocalWorker?.(ctx.projectPath) ?? null) : null
      const local = localCfg
        ? { provider: buildLocalProviderBlock(localCfg), model: localModelSpec(localCfg) }
        : null

      this.writePlugins(ctx.projectPath, ctx.entityId, localCfg?.contextWindow)

      const entry = buildOpenCodeMcpEntry(ctx.mcpUrl, ctx.mcpApiKey, ctx.workspaceId, ctx.entityId)

      // Frueheren Mux-Eintrag in `model` zuruecknehmen, dann neu mischen.
      const marker = readModelMarker(ctx.projectPath)
      const base = marker ? restoreOwnedModel(existing, marker) : existing
      const merged = mergeOpenCodeConfig(base, entry, local)

      // Das Profil des lokalen Workers schlaegt den Override — sonst fuehrte die
      // Bilanz ein Modell, das nie lief.
      let nextMarker: OpenCodeModelMarker | null = null
      if (!local && ctx.model) {
        nextMarker = { written: ctx.model, replaced: typeof merged.model === 'string' ? merged.model : null }
        merged.model = ctx.model
      }

      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')

      const markerPath = path.join(ctx.projectPath, OPENCODE_MODEL_MARKER_FILE)
      if (nextMarker) {
        fs.mkdirSync(path.dirname(markerPath), { recursive: true })
        fs.writeFileSync(markerPath, JSON.stringify(nextMarker) + '\n', 'utf-8')
      } else {
        try { fs.unlinkSync(markerPath) } catch { /* war nie da */ }
      }
    } catch (err) {
      console.warn('[OpenCodeAdapter] opencode.json write failed:', err)
    }
  }

  /**
   * Raeumt die V1-Dateien des Mux aus `.opencode/plugin/` weg. Nur die eigenen
   * Namen — was das Projekt dort selbst abgelegt hat, bleibt.
   */
  private removeLegacyPlugins(projectPath: string): void {
    for (const name of OPENCODE_OWNED_PLUGIN_FILENAMES) {
      try { fs.unlinkSync(path.join(projectPath, OPENCODE_LEGACY_PLUGIN_SUBDIR, name)) } catch { /* war nie da */ }
    }
  }

  /**
   * Legt Usage-Plugin und — falls die Rolle eine Grenze hat — Grenzen-Plugin
   * (und beim lokalen Worker das Idle-Plugin) in `.opencode/plugins/` an.
   * Eintraege in `opencode.json` gibt es nicht: die Auto-Entdeckung traegt.
   *
   * **Eine Rolle ohne Grenze verliert ihre Datei.** Nicht aus Ordnungsliebe: ein
   * stehengebliebenes Plugin wird weiter auto-entdeckt und erzwingt eine Regel,
   * die in `entity-boundaries.ts` niemand mehr nennt. Dasselbe tut der
   * SessionManager fuer den Claude-Code-Hook, und aus demselben Grund.
   */
  private writePlugins(
    projectPath: string,
    entityId?: string | null,
    contextWindow?: number,
  ): void {
    const pluginDir = path.join(projectPath, OPENCODE_PLUGIN_SUBDIR)

    this.removeLegacyPlugins(projectPath)

    // Ein bekannter Profilwert (lokaler Worker) behaelt Vorrang; sonst fragt das
    // Plugin den Katalog nach dem Modell und faellt auf die Schaetzung zurueck.
    writeOpenCodeUsagePlugin(pluginDir, {
      contextWindowSize: contextWindow ?? OPENCODE_FALLBACK_CONTEXT_WINDOW,
      lookupModelLimit: contextWindow === undefined,
    })

    const boundaryPath = path.join(pluginDir, OPENCODE_BOUNDARY_PLUGIN_FILENAME)
    const boundary = getEntityBoundary(entityId)
    if (boundary) {
      fs.writeFileSync(
        boundaryPath,
        buildOpenCodeBoundaryPlugin(
          boundary.denyPathPatterns,
          boundary.reason,
          boundary.denyListFile ? path.join(projectPath, boundary.denyListFile) : undefined,
        ),
        { encoding: 'utf-8', mode: 0o644 },
      )
    } else {
      try { fs.unlinkSync(boundaryPath) } catch { /* war nie da */ }
    }

    // Idle-Signal nur für den lokalen Worker — der Läufer liest es.
    const idlePath = path.join(pluginDir, IDLE_PLUGIN_FILENAME)
    if (entityId === LOCAL_WORKER_ENTITY_ID) {
      fs.writeFileSync(idlePath, buildIdlePlugin(path.join(projectPath, IDLE_SIGNAL_FILENAME)), {
        encoding: 'utf-8', mode: 0o644,
      })
    } else {
      try { fs.unlinkSync(idlePath) } catch { /* war nie da */ }
    }
  }

  /**
   * opencode 2 entdeckt nur `AGENTS.md` — die V1-Messung vom 2026-10-09 („liegt nur
   * CLAUDE.md da, liest es sie") gilt nicht mehr. Deshalb wie bei Codex: immer
   * `AGENTS.md`, und fehlt sie, legt der Mux sie mit Verweis auf eine vorhandene
   * `CLAUDE.md` an, damit die Session die eigentlichen Projektanweisungen nicht
   * verliert.
   */
  instructionsTarget(present: { agentsMd: boolean; claudeMd: boolean }): InstructionsTarget {
    return !present.agentsMd && present.claudeMd
      ? { file: 'AGENTS.md', pointerTo: 'CLAUDE.md' }
      : { file: 'AGENTS.md' }
  }

  getProjectMarkers(): string[] {
    return ['AGENTS.md', 'opencode.json', '.opencode']
  }

  async readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null> {
    // Nur `AGENTS.md` — die Datei, die opencode bevorzugt. Wohin der Mux bei
    // einer Ordner-Session schreibt, entscheidet `instructionsTarget`.
    const filePath = path.join(projectPath, 'AGENTS.md')
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { content, filePath }
    } catch {
      return null
    }
  }

  supports(feature: AdapterFeature): boolean {
    return this.getCapabilities()[feature]
  }

  getCapabilities(): AdapterCapabilities {
    return {
      // Gemessen: die Config-Form mit `type: "remote"` und `headers` laeuft
      // durch, die Verbindung kommt am Server an.
      'mcp-injection': true,
      // Nicht ueber eine Statusline und nicht ueber `stats` — das Unterkommando
      // zaehlt nur ueber alle Sessions zusammen und kennt keine einzelne.
      // Sondern ueber den `event`-Hook eines Plugins, der pro
      // Assistentennachricht Tokenzahlen und die opencode-Session-ID sieht.
      // Siehe monitoring/opencode-usage-plugin.ts.
      'status-line': true,
      // `--auto` erlaubt Permissions automatisch.
      'skip-permissions': true,
      // **Nicht gemessen.** Es gibt `--agent <name>` und ein
      // `agent`-Unterkommando; dass eine laufende Session daraus Unteragenten
      // startet und der Mux sie sieht, ist damit nicht belegt. Ein Gate, das
      // auf einer Vermutung `true` sagt, laesst den Mux ins Leere greifen.
      'sub-agents': false,
      // AGENTS.md wird befolgt.
      'project-instructions': true,
      // Folgt aus 'mcp-injection': der Message Bus ist nichts als die
      // MCP-Werkzeuge `mux_send` / `mux_read`, und die sind erreichbar.
      'message-bus-participant': true,
      // Haengt an der Rollenbindung — und `X-Mux-Entity` kam an. Damit
      // registriert der Server die vier `companion_memory_*` fuer eine
      // Companion-Verbindung genauso wie bei Claude Code.
      'companion-mcp': true,
    }
  }

  /**
   * Liest die zuletzt vom Usage-Plugin geschriebene Messung.
   *
   * Dieselbe Form und dasselbe Verzeichnis wie bei Claude Code und Codex, weil
   * der StatusLineMonitor sie ohnehin liest. Im Normalbetrieb kommt die Zahl von
   * dort ueber `usage-updated`; diese Methode ist der direkte Griff danach, wie
   * der Vertrag ihn fuer `supports('status-line')` vorsieht.
   */
  async getContextUsage(sessionId: string): Promise<ContextUsage | null> {
    try {
      // Lazy, damit der Adapter ohne Electron-Pfade testbar bleibt.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BRAND } = require('../../../shared/brand')
      const file = path.join(BRAND.statusLineDir, `${sessionId}.json`)
      const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
      const cw = data.context_window as Record<string, unknown> | undefined
      if (!cw || typeof cw.used_percentage !== 'number') return null
      const model = data.model as Record<string, unknown> | undefined
      return {
        usedPercentage: cw.used_percentage,
        remainingPercentage:
          typeof cw.remaining_percentage === 'number'
            ? cw.remaining_percentage
            : 100 - cw.used_percentage,
        totalInputTokens: typeof cw.total_input_tokens === 'number' ? cw.total_input_tokens : 0,
        totalOutputTokens: typeof cw.total_output_tokens === 'number' ? cw.total_output_tokens : 0,
        contextWindowSize: typeof cw.context_window_size === 'number' ? cw.context_window_size : 0,
        modelId: typeof model?.id === 'string' ? model.id : '',
        updatedAt: Date.now(),
      }
    } catch {
      return null
    }
  }

  /**
   * Schreibt das Usage-Plugin nach.
   *
   * `postLaunchInjection` tut das schon. Hier wird nur die Datei gelegt — die
   * Auto-Entdeckung aus `.opencode/plugins/` greift ohne Config-Eintrag (gemessen).
   * Das ist der Grund, warum beide Wege geschrieben werden: dieser Pfad des
   * Vertrags kann die Konfiguration nicht mitpflegen. Auch hier werden V1-Altlasten
   * weggeraeumt: ein altes Usage-Plugin in `.opencode/plugin/` erzeugte sonst bei
   * jedem Start eine WARN-Zeile.
   */
  async attachStatusHook(projectPath: string): Promise<void> {
    this.removeLegacyPlugins(projectPath)
    writeOpenCodeUsagePlugin(path.join(projectPath, OPENCODE_PLUGIN_SUBDIR), {
      contextWindowSize: OPENCODE_FALLBACK_CONTEXT_WINDOW,
      lookupModelLimit: true,
    })
  }

  async sendPrompt(_tmuxTarget: string, _prompt: string, _opts?: SendOpts): Promise<void> {
    // Wie bei den anderen beiden: Klartext via tmux send-keys, das macht der
    // SessionManager.
    throw new Error('sendPrompt should be called via SessionManager.sendKeys')
  }

  /**
   * `opencode models` listet, was **angemeldet** ist.
   *
   * Ohne angemeldeten Anbieter kommen nur die freien `opencode/*` zurueck —
   * gemessen: acht. Das ist kein Mangel der Abfrage, sondern die Wahrheit ueber
   * diese Installation: mehr ist dort gerade nicht benutzbar.
   *
   * Scheitert der Aufruf, kommt eine leere Liste. Siehe CodexAdapter.
   */
  async listModels(): Promise<AdapterModel[]> {
    try {
      const out = await runCommand('opencode', ['models'], { timeout: 25_000 })
      return parseOpenCodeModels(out)
    } catch {
      return []
    }
  }

  buildWorkshopPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session-Startup (opencode)

Starte Worker mit: \`opencode --standalone --auto\` — **im Projektverzeichnis**, ohne Pfadargument.
Ein positionales Verzeichnis zieht opencode aus dem Verzeichnis heraus, in dem
seine Konfiguration liegt; dann fehlen MCP-Werkzeuge, ohne jede Meldung.
\`--standalone\`: eigener Server pro Session. Im geteilten Dienst liefe das Plugin
mit der Umgebung einer fremden Session und schriebe deren Usage-Datei.
Kein \`--model\`, \`--fork\`, \`--pure\` — das Top-Level-opencode 2 kennt sie nicht und
druckt bei einer unbekannten Option nur die Hilfe.
Projektanweisungen liest opencode 2 nur aus \`AGENTS.md\`; eine \`CLAUDE.md\` wird nicht gelesen.
Instruktionen DIREKT via tmux send-keys in den Pane schicken — nicht via mux_send.
`
    }
    return `### Worker Session Startup (opencode)

Start workers with: \`opencode --standalone --auto\` — **inside the project directory**, no path argument.
A positional directory moves opencode out of the directory holding its config;
MCP tools then go missing with no message at all.
\`--standalone\`: a private server per session. In the shared service the plugin would
run with another session's environment and write that session's usage file.
No \`--model\`, \`--fork\`, \`--pure\` — top-level opencode 2 does not know them and
only prints its help on an unknown option.
opencode 2 reads project instructions from \`AGENTS.md\` only; \`CLAUDE.md\` is not read.
Send instructions DIRECTLY via tmux send-keys — not via mux_send.
`
  }

  buildLauncherPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `opencode kennt kein \`/launch\`. Nenne das Vorhaben als Klartext-Prompt.
`
    }
    return `opencode has no \`/launch\` command. State the task as a plain prompt.
`
  }

  buildCyberFactoryPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### opencode-Besonderheiten

Projektanweisungen stehen in \`AGENTS.md\` (opencode 2 liest keine \`CLAUDE.md\`). Eine direkte Instruktion schlaegt sie.
MCP-Server und Kopfzeilen stehen in \`opencode.json\` — die Datei wird gemischt,
nicht ersetzt; fremde Eintraege darin bleiben.
Rollengrenzen laufen hier ueber ein Plugin in \`.opencode/plugins/\`
(\`tool.execute.before\`-Hook), nicht ueber Hook-Dateien. Ein abgelehnter Aufruf
erscheint als Werkzeugfehler mit dem Grund im Text — er wurde nicht ausgefuehrt.
`
    }
    return `### opencode specifics

Project instructions live in \`AGENTS.md\` (opencode 2 does not read \`CLAUDE.md\`). A direct instruction overrides them.
MCP server and headers live in \`opencode.json\` — the file is merged, not
replaced; foreign entries survive.
Role boundaries run through a plugin in \`.opencode/plugins/\`
(an \`execute.before\` tool hook), not hook files. A refused call shows up as a tool
error carrying the reason — it was not executed.
`
  }
}
