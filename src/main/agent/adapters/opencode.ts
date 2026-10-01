import * as fs from 'fs'
import * as path from 'path'
import type {
  AgentAdapter,
  LaunchCommand,
  LaunchOpts,
  AdapterContext,
  ProjectInstructions,
  SendOpts,
} from '../agent-adapter'
import type { AdapterFeature, AdapterCapabilities } from '../../../shared/types'
import { buildMcpServerConfig } from '../../mcp/workspace-header'

/**
 * opencode-Adapter — Tier-2.
 *
 * Gemessen an **opencode 1.18.34 vom 2026-10-01**. Wie beim Codex-Adapter steht
 * hier nur, was gegen die laufende CLI geprueft wurde; alles andere ist als
 * ungemessen markiert, statt geraten.
 *
 * Die drei Eigenschaften, die den Adapter bestimmen:
 *
 * 1. **`AGENTS.md` ist die Projektanweisung**, `CLAUDE.md` wird zusaetzlich zur
 *    Vertraeglichkeit gelesen. Dieselbe Injektionsmechanik wie bei Claude Code
 *    und Codex traegt also — Workspace-Prompt und Context-Paths koennen als
 *    Sektionen in eine Datei wandern und ueberleben ein `/clear`.
 *
 * 2. **MCP mit freien HTTP-Headern funktioniert.** Gegen einen Horchposten
 *    belegt: `authorization`, `x-mux-workspace` und `x-mux-entity` kamen alle an.
 *    Deshalb nutzt dieser Adapter den **normalen** Weg — `buildMcpServerConfig`
 *    aus `mcp/workspace-header.ts`, also dieselben Kopfnamen, die Claude Code
 *    schreibt — und **nicht** die Token-Bindung aus `mcp/bound-token.ts`. Die
 *    existiert einzig, weil Codex keine Header senden kann; sie hier zu nehmen
 *    hiesse, Identitaet und Berechtigung ohne Not zu vermischen.
 *
 * 3. **Rollengrenzen laufen ueber ein Plugin, nicht ueber Hook-Dateien.**
 *    opencode kennt Plugin-Events (`tool.execute.before`, `tool.execute.after`,
 *    `permission.ask`, `chat.message`, `chat.params`) statt einer
 *    `PreToolUse`-Hook-Konfiguration. Das ist der strukturelle Unterschied zu
 *    Codex und Claude Code — und der Grund, warum dieser Adapter noch **keine**
 *    Grenze verdrahtet: dass `tool.execute.before` einen Aufruf tatsaechlich
 *    ablehnen kann, ist nicht gemessen. Eine geschriebene und nicht feuernde
 *    Grenze ist schlimmer als keine, weil sie wie eine aussieht.
 */

/** Minimale Sicht auf die Agent-Konfiguration. Spiegelbild zu CodexConfigReader. */
export interface OpenCodeConfigReader {
  getSkipPermissions(): boolean
}

const defaultConfigReader: OpenCodeConfigReader = {
  getSkipPermissions(): boolean {
    // Lazy require, damit der Adapter ohne Electron testbar bleibt.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { configStore } = require('../../config/config-store')
    return configStore.get('agent').skipPermissions
  },
}

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
 */
export function mergeOpenCodeConfig(
  existing: Record<string, unknown>,
  entry: OpenCodeMcpEntry,
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

  return merged
}

export class OpenCodeAdapter implements AgentAdapter {
  readonly id = 'opencode'
  readonly displayName = 'opencode'
  readonly tier = 'tier-2' as const

  private readonly configReader: OpenCodeConfigReader

  constructor(configReader?: OpenCodeConfigReader) {
    this.configReader = configReader ?? defaultConfigReader
  }

  buildLaunchCommand(opts: LaunchOpts): LaunchCommand {
    const args: string[] = []

    // Das Arbeitsverzeichnis ist ein **positionales** Argument (`opencode
    // [project]`), kein Flag — anders als Codex' `-C`. Es steht zuerst, damit
    // die Kommandozeile der dokumentierten Form entspricht, und es steht
    // ausdruecklich da, statt sich auf das cwd des tmux-Panes zu verlassen.
    args.push(opts.projectPath)

    // Fork schlaegt Resume — dieselbe Entscheidung wie bei den anderen beiden:
    // wer forken will, will keine Fortsetzung derselben Unterhaltung.
    //
    // `--fork` ist laut `--help` nur **zusammen mit** `--session` oder
    // `--continue` gueltig. Weil hier eine ID bekannt ist, ist `--session <id>`
    // die praezisere der beiden Varianten: sie benennt, was geforkt wird,
    // statt es aus „die letzte" zu erraten.
    if (opts.forkFromClaudeSessionId) {
      args.push('--session', opts.forkFromClaudeSessionId, '--fork')
    } else if (opts.resumeClaudeSessionId) {
      args.push('--session', opts.resumeClaudeSessionId)
    } else if (opts.resume) {
      // Ohne ID bleibt nur „die letzte Unterhaltung dieses Verzeichnisses".
      // Das ist genau die Lesart, die `LaunchOpts.resume` vorschreibt — kein
      // interaktiver Picker, in dem eine unbeaufsichtigte Entity-Session
      // sitzen bleibt.
      args.push('--continue')
    }

    if (opts.model) {
      // Erwartet `provider/model`. Der Mux gibt weiter, was die Rolle oder der
      // Nutzer gesetzt hat, und validiert es nicht: eine Liste gueltiger
      // Modell-IDs waere eine Kopie, die veraltet.
      args.push('--model', opts.model)
    }

    if (this.configReader.getSkipPermissions()) {
      // Das Gegenstueck zu `--dangerously-skip-permissions`: Permissions
      // werden automatisch erlaubt. Ohne das bleibt eine Entity-Session an der
      // ersten Rueckfrage stehen, und niemand antwortet.
      args.push('--auto')
    }

    return { cmd: 'opencode', args }
  }

  /**
   * Schreibt `opencode.json` ins Projekt — MCP-Server samt Kopfzeilen.
   *
   * **Die Bindung reist im Kopf, nicht im Token.** Workspace (`ctx.workspaceId`)
   * und Rolle (`ctx.entityId`) gehen als `X-Mux-Workspace` und `X-Mux-Entity`
   * mit; dass opencode freie Header sendet, ist gegen einen Horchposten belegt.
   * Damit ist dies der Normalfall des Vertrags und nicht der Sonderweg, den
   * Codex gehen muss.
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

      const entry = buildOpenCodeMcpEntry(ctx.mcpUrl, ctx.mcpApiKey, ctx.workspaceId, ctx.entityId)
      const merged = mergeOpenCodeConfig(existing, entry)

      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
    } catch (err) {
      console.warn('[OpenCodeAdapter] opencode.json write failed:', err)
    }
  }

  getProjectMarkers(): string[] {
    return ['AGENTS.md', 'opencode.json', '.opencode']
  }

  async readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null> {
    // Nur `AGENTS.md`. opencode liest `CLAUDE.md` zusaetzlich zur
    // Vertraeglichkeit, aber die Datei, in die der Mux **schreibt**, muss
    // eindeutig sein — sonst injizieren zwei Adapter in dasselbe Projekt und
    // ueberschreiben sich gegenseitig die Sektionen.
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
      // **Nicht gemessen.** opencode hat ein `stats`-Unterkommando, aber kein
      // gepruefter Weg schreibt pro Session das JSON, das der bestehende
      // StatusLineMonitor liest. `false` heisst hier „unbewiesen", nicht „gibt
      // es nicht" — der Mux soll keine Zahl anzeigen, die er nicht hat.
      'status-line': false,
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

  async sendPrompt(_tmuxTarget: string, _prompt: string, _opts?: SendOpts): Promise<void> {
    // Wie bei den anderen beiden: Klartext via tmux send-keys, das macht der
    // SessionManager.
    throw new Error('sendPrompt should be called via SessionManager.sendKeys')
  }

  buildWorkshopPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session-Startup (opencode)

Starte Worker mit: \`opencode <projektpfad> --auto\`
Projektanweisungen liest opencode aus \`AGENTS.md\`; \`CLAUDE.md\` nur zusaetzlich.
Instruktionen DIREKT via tmux send-keys in den Pane schicken — nicht via mux_send.
`
    }
    return `### Worker Session Startup (opencode)

Start workers with: \`opencode <project-path> --auto\`
opencode reads project instructions from \`AGENTS.md\`; \`CLAUDE.md\` only in addition.
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

Projektanweisungen stehen in \`AGENTS.md\`. Eine direkte Instruktion schlaegt sie.
MCP-Server und Kopfzeilen stehen in \`opencode.json\` — die Datei wird gemischt,
nicht ersetzt; fremde Eintraege darin bleiben.
Rollengrenzen laufen hier ueber ein Plugin (\`tool.execute.before\`), nicht ueber
Hook-Dateien. Noch nicht verdrahtet — verlasse dich nicht darauf.
`
    }
    return `### opencode specifics

Project instructions live in \`AGENTS.md\`. A direct instruction overrides them.
MCP server and headers live in \`opencode.json\` — the file is merged, not
replaced; foreign entries survive.
Role boundaries here run through a plugin (\`tool.execute.before\`), not hook
files. Not wired up yet — do not rely on them.
`
  }
}
