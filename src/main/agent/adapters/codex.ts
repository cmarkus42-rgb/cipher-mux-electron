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
import type { AdapterFeature, AdapterCapabilities, ContextUsage } from '../../../shared/types'
import { writeCodexUsageHookScript, CODEX_USAGE_HOOK_FILENAME } from '../../monitoring/codex-usage-hook'
import { BOUND_TOKEN_ENV_VAR } from '../../mcp/bound-token'
import { trustRunDirectory } from './codex-trust'

/**
 * Codex-CLI-Adapter — Tier-2.
 *
 * Alles hier steht auf Messungen an **codex-cli 0.155.1 vom 2026-10-01**, nicht
 * auf Dokumentation. Die vier, die den Weg bestimmen, und die beim naechsten
 * CLI-Update kippen koennen:
 *
 * 1. **`AGENTS.md` wird befolgt**, hierarchisch nach Scope, und eine direkte
 *    Instruktion schlaegt sie. Das ist dieselbe Eigenschaft, auf der die
 *    CLAUDE.md-Injektion bei Claude Code aufsetzt — Workspace-Prompt und
 *    Context-Paths koennen also genauso als Sektionen in eine Datei wandern,
 *    statt als Argument an der Kommandozeile zu haengen und ein `/clear` nicht
 *    zu ueberleben.
 *
 * 2. **`PreToolUse`-Hooks existieren und tragen wortgleich das
 *    Claude-Code-Protokoll**: `hookSpecificOutput.permissionDecision` mit
 *    `allow` / `deny` / `ask`, dazu `permissionDecisionReason`. Ein `deny`
 *    wirkt auch unter `--dangerously-bypass-approvals-and-sandbox`, und der
 *    Grund erreicht das Modell wortwoertlich. Rollengrenzen sind hier also
 *    durchsetzbar, nicht nur behauptet.
 *
 * 3. **Ohne `--dangerously-bypass-hook-trust` feuert ein frisch geschriebener
 *    Hook nicht — still.** Keine Warnung, keine Logzeile, der Werkzeugaufruf
 *    laeuft durch. Deshalb setzt `buildLaunchCommand` das Flag zusammen mit dem
 *    Approval-Bypass: eine geschriebene und nicht feuernde Grenze ist schlimmer
 *    als keine, weil sie wie eine aussieht. Die Alternative waere, den
 *    `trusted_hash` vorab zu berechnen — dessen Bildung ist nicht gemessen.
 *
 * 4. **Der `matcher` traegt den Claude-Code-Werkzeugnamen, nicht den
 *    codex-internen.** Der Hook-Input meldet `tool_name: "Bash"`, obwohl die
 *    Ausgabe `exec` und `/bin/zsh -lc` zeigt. Ein `matcher = "shell"` passt auf
 *    nichts und ueberspringt den Hook — wieder still. Deshalb schreibt dieser
 *    Adapter **keinen** Matcher und filtert im Hook-Skript selbst: ein Name, der
 *    sich mit der naechsten CLI-Version aendert, soll nicht entscheiden, ob eine
 *    Rollengrenze greift.
 *
 * Und eine Grenze, um die herum gebaut werden musste: **Codex kann keine freien
 * HTTP-Header für MCP-Server.** Die Serverkonfiguration kennt `url` und
 * `bearer_token_env_var`, sonst nichts; unbekannte Felder werden stillschweigend
 * verworfen. `X-Mux-Workspace` und `X-Mux-Entity` — ueber die der Mux Workspace
 * und Rolle pro Verbindung bindet — lassen sich so nicht uebertragen. Die
 * Bindung reist deshalb im Bearer-Token mit (`mcp/bound-token.ts`); siehe
 * `postLaunchInjection`. opencode kann die Header, die Luecke ist also eine
 * Eigenschaft dieser CLI und keine des Adapter-Vertrags.
 */

/** Minimale Sicht auf die Agent-Konfiguration. Spiegelbild zu ClaudeCodeAdapter. */
export interface CodexConfigReader {
  getSkipPermissions(): boolean
  /** Ob der Mux dem Run-Verzeichnis Codex-Vertrauen erteilen darf. */
  getTrustRunDirs(): boolean
}

const defaultConfigReader: CodexConfigReader = {
  getSkipPermissions(): boolean {
    // Lazy require, damit der Adapter ohne Electron testbar bleibt.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { configStore } = require('../../config/config-store')
    return configStore.get('agent').skipPermissions
  },
  getTrustRunDirs(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { configStore } = require('../../config/config-store')
    return configStore.get('agent').codexTrustRunDirs !== false
  },
}

/**
 * Kontextfenster, wenn der Katalog nicht erreichbar ist.
 *
 * `codex debug models --json` nennt fuer `gpt-6-astra` ein `context_window` von
 * 272000. Der Wert steht hier als Rueckfalloption, nicht als Wahrheit: er gilt
 * fuer ein Modell zu einem Zeitpunkt. Eine falsche Prozentzahl ist besser als
 * keine Anzeige, aber nur, solange sie als Schaetzung erkennbar bleibt.
 */
export const CODEX_FALLBACK_CONTEXT_WINDOW = 272_000

export class CodexAdapter implements AgentAdapter {
  readonly id = 'codex'
  readonly displayName = 'Codex CLI'
  readonly tier = 'tier-2' as const

  private readonly configReader: CodexConfigReader

  constructor(configReader?: CodexConfigReader) {
    this.configReader = configReader ?? defaultConfigReader
  }

  buildLaunchCommand(opts: LaunchOpts): LaunchCommand {
    const args: string[] = []

    // `resume` und `fork` sind Unterkommandos, keine Flags — anders als bei
    // Claude Code, wo `--resume <id>` an derselben Kommandozeile haengt. Beide
    // nehmen die Optionen danach entgegen (gemessen), deshalb steht das
    // Unterkommando zuerst.
    //
    // Die Reihenfolge fork-vor-resume ist dieselbe Entscheidung wie dort: wer
    // forken will, will keine Fortsetzung derselben Unterhaltung.
    if (opts.forkFromClaudeSessionId) {
      args.push('fork', opts.forkFromClaudeSessionId)
    } else if (opts.resumeClaudeSessionId) {
      args.push('resume', opts.resumeClaudeSessionId)
    } else if (opts.resume) {
      // Ohne ID oeffnet `resume` den interaktiven Picker, und eine unbeaufsichtigte
      // Entity-Session sitzt dann darin statt an einem Prompt. `--last` ist das,
      // was „weitermachen" ohne bekannte ID ueberhaupt bedeuten kann.
      args.push('resume', '--last')
    }

    if (this.configReader.getSkipPermissions()) {
      args.push('--dangerously-bypass-approvals-and-sandbox')
      // Siehe Kopfkommentar Punkt 3: ohne dieses Flag ist eine Rollengrenze
      // geschrieben und wirkungslos, ohne jede Meldung.
      args.push('--dangerously-bypass-hook-trust')
    }

    // **Kein `-C`.** Codex nimmt ein Arbeitsverzeichnis entgegen, und das sah
    // nach der belastbareren Variante aus — bis die Abnahme zeigte, dass es die
    // Session aus dem richtigen Verzeichnis herauszieht.
    //
    // Der Grund: `LaunchOpts.projectPath` ist bei einer Entity-Session das
    // **authored**-Verzeichnis (`entities/<id>`, dort liegen preset.md und
    // Skills), nicht das Arbeitsverzeichnis. Gearbeitet wird im
    // **Run**-Verzeichnis (`runs/<workspaceId>/<entityId>`), und genau dorthin
    // schreibt `postLaunchInjection` die `.codex/config.toml`. Der tmux-Pane
    // startet bereits dort — ein `-C` auf das authored-Verzeichnis liess Codex
    // seine eigene Konfiguration nicht finden: keine MCP-Werkzeuge, kein
    // Usage-Hook, keine Rollengrenze. Und zwar lautlos.
    //
    // Claude Code hat dieses Problem nie gehabt, weil es kein cwd-Flag kennt und
    // das cwd des Panes erbt. Hier wird dasselbe getan, aus demselben Grund.

    if (opts.model) {
      args.push('--model', opts.model)
    }

    // Die TUI laeuft sonst im Alternate Screen, und der frisst die
    // Scrollback-Historie des Panes — genau das, was xterm.js anzeigt.
    args.push('--no-alt-screen')

    // Der Update-Hinweis ist ein **blockierender** Auswahldialog, kein Banner:
    // „1. Update now / 2. Skip / 3. Skip until next version", und davor kommt
    // die Session nicht an ihren Prompt. In einer unbeaufsichtigten
    // Entity-Session heisst das: sie haengt, bis ein Mensch hinsieht.
    //
    // Gemessen am 2026-10-01: dieser Schalter nimmt ihn weg. Der Name stammt aus
    // dem Binary, nicht aus einer Dokumentation — unbekannte Config-Keys
    // akzeptiert Codex stillschweigend, ein angenommener Key beweist also nichts.
    // Belegt ist hier der Effekt, nicht die Annahme.
    args.push('-c', 'check_for_update_on_startup=false')

    return { cmd: 'codex', args }
  }

  /**
   * Schreibt `.codex/config.toml` ins Projekt: MCP-Server und Usage-Hook.
   *
   * **Warum projektlokal und nicht global:** gemessen greift eine
   * `.codex/config.toml` im Arbeitsverzeichnis. Das ist die Voraussetzung dafuer,
   * dass der Mux hier ueberhaupt etwas konfigurieren darf — die globale
   * `~/.codex/config.toml` gehoert dem Nutzer, und zwei Workspaces wuerden sich
   * darin gegenseitig ueberschreiben. Dieselbe Trennung wie bei
   * `runs/<workspaceId>/<entityId>/`.
   *
   * **Workspace und Rolle reisen im Token, nicht im Kopf.** Codex kann dem
   * MCP-Server keine freien Header mitgeben — gemessen gegen einen Horchposten:
   * die Verbindung kommt an, `X-Mux-Workspace` und `X-Mux-Entity` nicht, und ein
   * `headers`-Schluessel in der TOML wird stillschweigend verworfen. Die
   * Serverkonfiguration kennt `url` und `bearer_token_env_var`.
   *
   * Deshalb traegt das Bearer-Token die Bindung (`mcp/bound-token.ts`), und die
   * TOML verweist nur auf die Umgebungsvariable, in die der SessionManager das
   * gebundene Token geschrieben hat. Der Vorteil gegenueber einem Pfad-Praefix:
   * die Bindung bleibt an der Identitaet und nicht am Transport, und der Server
   * prueft sie gegen die bekannten IDs wie die Header-Variante auch.
   *
   * Das Token steht **nicht** in dieser Datei. Es steht in der Umgebung der
   * tmux-Session — eine generierte Datei im Run-Verzeichnis ist kein Ort fuer
   * ein Geheimnis.
   */
  async postLaunchInjection(ctx: AdapterContext): Promise<void> {
    try {
      const codexDir = path.join(ctx.projectPath, '.codex')
      fs.mkdirSync(codexDir, { recursive: true })

      const usageScript = writeCodexUsageHookScript(ctx.projectPath, {
        contextWindowSize: CODEX_FALLBACK_CONTEXT_WINDOW,
        modelId: '',
      })

      fs.writeFileSync(
        path.join(codexDir, 'config.toml'),
        buildCodexProjectConfig({ mcpUrl: ctx.mcpUrl, usageHookPath: usageScript }),
        'utf-8',
      )

      // Und jetzt das Vertrauen, sonst war alles davor umsonst: Codex laedt
      // projektlokale Config, Hooks und exec-Policies **nur** aus einem
      // vertrauten Verzeichnis, und fragt sonst in einem blockierenden Dialog.
      // Ein nachtraegliches „Yes" laedt sie nicht mehr nach — die Session steht
      // dann am Prompt und hat trotzdem keine Werkzeuge.
      //
      // Vertraut wird ausschliesslich das Run-Verzeichnis; `trustRunDirectory`
      // weist jeden anderen Pfad ab. Begruendung im Kopf von codex-trust.ts.
      if (this.configReader.getTrustRunDirs()) {
        const res = trustRunDirectory(ctx.projectPath)
        if (!res.trusted) {
          console.warn(
            `[CodexAdapter] Verzeichnis-Vertrauen nicht erteilt (${res.reason}) — `
            + 'die Session wird beim Start nach Vertrauen fragen und ohne '
            + 'MCP-Werkzeuge, Usage-Hook und Rollengrenze laufen.',
          )
        }
      }
    } catch (err) {
      console.warn('[CodexAdapter] .codex/config.toml write failed:', err)
    }
  }

  getProjectMarkers(): string[] {
    return ['AGENTS.md', '.codex']
  }

  async readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null> {
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
      'mcp-injection': true,
      // Nicht ueber eine Statusline wie bei Claude Code, sondern ueber einen
      // Hook, der die Rollout-JSONL ausliest. Siehe codex-usage-hook.ts.
      'status-line': true,
      'skip-permissions': true,
      // Nicht gemessen. `false` heisst hier „unbewiesen", nicht „gibt es nicht" —
      // und ein capability-gate, das auf einer Vermutung `true` sagt, laesst den
      // Mux ein Werkzeug rufen, das ins Leere greift.
      'sub-agents': false,
      'project-instructions': true,
      'message-bus-participant': true,
      // Haengt an der Rollenbindung. Codex kann den Kopf `X-Mux-Entity` nicht
      // senden, aber das gebundene Token traegt dieselbe Tatsache — und der
      // Server bindet sie beim `initialize` genauso. Siehe mcp/bound-token.ts.
      'companion-mcp': true,
    }
  }

  /**
   * Liest die zuletzt vom Usage-Hook geschriebene Messung.
   *
   * Der Hook schreibt in dasselbe Verzeichnis und dieselbe Form, die der
   * StatusLineMonitor ohnehin liest. Im Normalbetrieb kommt die Zahl von dort
   * ueber `usage-updated`; diese Methode ist der direkte Griff danach, wie der
   * Vertrag ihn fuer `supports('status-line')` vorsieht.
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
        remainingPercentage: typeof cw.remaining_percentage === 'number' ? cw.remaining_percentage : 100 - cw.used_percentage,
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

  async attachStatusHook(projectPath: string): Promise<void> {
    writeCodexUsageHookScript(projectPath, {
      contextWindowSize: CODEX_FALLBACK_CONTEXT_WINDOW,
      modelId: '',
    })
  }

  async sendPrompt(_tmuxTarget: string, _prompt: string, _opts?: SendOpts): Promise<void> {
    // Wie Claude Code: Klartext via tmux send-keys, das macht der SessionManager.
    throw new Error('sendPrompt should be called via SessionManager.sendKeys')
  }

  buildWorkshopPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session-Startup (Codex CLI)

Starte Worker mit: \`codex --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust\`
Projektanweisungen liest Codex aus \`AGENTS.md\`, nicht aus \`CLAUDE.md\`.
Instruktionen DIREKT via tmux send-keys in den Pane schicken — nicht via mux_send.
`
    }
    return `### Worker Session Startup (Codex CLI)

Start workers with: \`codex --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust\`
Codex reads project instructions from \`AGENTS.md\`, not \`CLAUDE.md\`.
Send instructions DIRECTLY via tmux send-keys — not via mux_send.
`
  }

  buildLauncherPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `Codex kennt kein \`/launch\`. Nenne das Vorhaben als Klartext-Prompt.
`
    }
    return `Codex has no \`/launch\` command. State the task as a plain prompt.
`
  }

  buildCyberFactoryPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Codex-Besonderheiten

Projektanweisungen stehen in \`AGENTS.md\`. Eine direkte Instruktion schlaegt sie —
was im Prompt steht, gilt gegen die Datei.
Rollengrenzen laufen ueber \`PreToolUse\`-Hooks in \`.codex/config.toml\`.
`
    }
    return `### Codex specifics

Project instructions live in \`AGENTS.md\`. A direct instruction overrides them —
what is in the prompt wins against the file.
Role boundaries run through \`PreToolUse\` hooks in \`.codex/config.toml\`.
`
  }
}

/** Was in die projektlokale config.toml geschrieben wird. */
export interface CodexProjectConfigOpts {
  mcpUrl: string
  usageHookPath: string
  /** Pfad des Rollengrenzen-Hooks, falls die Rolle einen hat. */
  boundaryHookPath?: string
}

/**
 * Baut die projektlokale `config.toml`.
 *
 * Handgeschrieben statt ueber eine TOML-Bibliothek: es sind drei Tabellen mit
 * bekannten Werten, und eine Abhaengigkeit mehr im Main-Prozess waere ein
 * hoher Preis dafuer. Alle eingesetzten Werte werden als TOML-Basic-Strings
 * geschrieben, damit ein Pfad mit Anfuehrungszeichen die Datei nicht sprengt.
 *
 * **Kein `matcher`.** Siehe Kopfkommentar Punkt 4: der passende Name ist
 * `Bash`, nicht `shell`, und ein Matcher, der nicht passt, ueberspringt den Hook
 * still. Welche Werkzeuge eine Grenze betrifft, entscheidet das Hook-Skript.
 */
export function buildCodexProjectConfig(opts: CodexProjectConfigOpts): string {
  const q = (s: string): string => JSON.stringify(s)
  const lines: string[] = [
    '# Auto-generiert von cipher-mux (CodexAdapter). Nicht editieren —',
    '# diese Datei wird bei jedem Sessionstart neu geschrieben.',
    '',
    '[mcp_servers.cipher-mux]',
    `url = ${q(opts.mcpUrl)}`,
    '# Codex kann keine freien HTTP-Header, deshalb reisen Workspace und Rolle',
    '# im Token mit (siehe mcp/bound-token.ts). Hier steht nur der Name der',
    '# Umgebungsvariablen — das Token selbst gehoert nicht in eine Datei.',
    `bearer_token_env_var = ${q(BOUND_TOKEN_ENV_VAR)}`,
    '',
  ]

  if (opts.boundaryHookPath) {
    lines.push(
      '[[hooks.PreToolUse]]',
      '[[hooks.PreToolUse.hooks]]',
      'type = "command"',
      `command = ${q(`node ${opts.boundaryHookPath}`)}`,
      '',
    )
  }

  lines.push(
    '[[hooks.PostToolUse]]',
    '[[hooks.PostToolUse.hooks]]',
    'type = "command"',
    `command = ${q(`node ${opts.usageHookPath}`)}`,
    '',
    '# SessionStart ebenfalls, damit die Codex-Session-ID sofort bekannt ist:',
    '# ein Keep-Working-Restore braucht sie fuer `codex resume <id>` und nicht',
    '# den interaktiven Picker.',
    '[[hooks.SessionStart]]',
    '[[hooks.SessionStart.hooks]]',
    'type = "command"',
    `command = ${q(`node ${opts.usageHookPath}`)}`,
    '',
  )

  return lines.join('\n')
}

export { CODEX_USAGE_HOOK_FILENAME }
