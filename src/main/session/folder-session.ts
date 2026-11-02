/**
 * Ordner-Sessions — eine CLI in einem beliebigen Verzeichnis, gestartet aus dem
 * Launcher, ohne Rolle.
 *
 * Zwei reine Entscheidungen, damit `SessionManager.start()` sie nicht inline
 * trifft:
 *
 * 1. **Was eine Session ueber ihren Workspace erfaehrt.** Bis 0.14.2 stand das
 *    als Sektionen in der CLAUDE.md des Projekts; seitdem reist es als
 *    Sitzungskontext in der Startzeile (siehe unten, `buildMuxKontext`). In die
 *    Datei schreibt der Mux nur noch bei Rollen, im Run-Verzeichnis.
 * 2. **Wie die Startzeile aussieht.** Der Renderer baute sie selbst, fest als
 *    `claude …`, waehrend der Main-Prozess MCP fuer die Default-CLI einrichtete.
 *    Jetzt baut sie der Adapter, der auch injiziert.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { LaunchCommand, InstructionsTarget } from '../agent/agent-adapter'

export interface WorkspaceSectionSource {
  id: string
  name?: string
  cells?: ReadonlyArray<{ project?: string } | null>
  workspacePrompt?: string
  contextPaths?: string[]
}

export interface WorkspaceSectionRequest {
  /** Drei Zustaende: undefined = keine Entscheidung, null = ohne, String = dieser. */
  workspaceId?: string | null
  workspacePrompt?: string
  contextPaths?: string[]
}

export interface WorkspaceSections {
  /** false = CLAUDE.md nicht anfassen. true = Sektionen genau auf diesen Stand bringen. */
  reconcile: boolean
  /** Set when the session belongs to a known workspace — named in the section. */
  workspaceId?: string
  workspaceName?: string
  /** Projects of the workspace's cells — role directories excluded. */
  workspaceProjects?: string[]
  workspacePrompt?: string
  contextPaths?: string[]
}

/**
 * Ausdrueckliche Werte gewinnen — so kommt der Workspace-Apply mit seinem
 * Zellen-Prompt durch. Sonst entscheidet `workspaceId`:
 *
 * - `undefined`: nicht anfassen. Das ist die Shell aus dem Zellenkopf und jeder
 *   Aufrufer, der von Workspaces nichts weiss; fuer sie aendert sich nichts.
 * - `null`: ohne Workspace — vorhandene Sektionen werden **entfernt**.
 * - ID: Prompt und Kontextpfade dieses Workspaces; ein unbekannter ist wie
 *   keiner, statt einen anderen zu raten.
 */
/**
 * Die Projekte eines Workspaces: was in seinen Zellen als Projekt steht. Zellen,
 * die auf ein Rollenverzeichnis zeigen (Altlast aus der Zeit vor `presetId`),
 * sind keine Projekte und fallen raus. Die Zellen kommen ungeprueft aus der
 * Config — jeder Eintrag wird geprueft, nichts wirft.
 */
export function workspaceProjects(ws: WorkspaceSectionSource, entitiesRoot: string): string[] {
  const root = entitiesRoot.replace(/\/+$/, '') + '/'
  const out: string[] = []
  for (const cell of Array.isArray(ws.cells) ? ws.cells : []) {
    const p = typeof cell?.project === 'string' ? cell.project.trim() : ''
    if (!p || p.startsWith(root) || out.includes(p)) continue
    out.push(p)
  }
  return out
}

export function resolveWorkspaceSections(
  req: WorkspaceSectionRequest,
  workspaces: readonly WorkspaceSectionSource[] | null | undefined,
  entitiesRoot = '',
): WorkspaceSections {
  // Die Liste kommt ungeprueft aus der Config — defensiv lesen.
  const ws = typeof req.workspaceId === 'string' && Array.isArray(workspaces)
    ? workspaces.find(w => w?.id === req.workspaceId)
    : undefined
  const projects = ws && entitiesRoot ? workspaceProjects(ws, entitiesRoot) : []
  const identity = ws
    ? {
      workspaceId: ws.id,
      ...(ws.name?.trim() ? { workspaceName: ws.name.trim() } : {}),
      ...(projects.length ? { workspaceProjects: projects } : {}),
    }
    : {}

  if (req.workspacePrompt?.trim() || req.contextPaths?.length) {
    return {
      reconcile: true,
      ...identity,
      ...(req.workspacePrompt?.trim() ? { workspacePrompt: req.workspacePrompt.trim() } : {}),
      ...(req.contextPaths?.length ? { contextPaths: req.contextPaths } : {}),
    }
  }
  if (req.workspaceId === undefined) return { reconcile: false }
  if (!ws) return { reconcile: true }

  const prompt = ws.workspacePrompt?.trim()
  const paths = Array.isArray(ws.contextPaths) && ws.contextPaths.length ? ws.contextPaths : undefined
  return {
    reconcile: true,
    ...identity,
    ...(prompt ? { workspacePrompt: prompt } : {}),
    ...(paths ? { contextPaths: paths } : {}),
  }
}

/**
 * Der Text der Sektion `## Workspace Prompt`. Eine Ordner-Session erfuhr bis
 * 0.12.1 nur, was der Workspace-Prompt sagte — hatte der Workspace keinen, wusste
 * sie nicht, dass es ihn gibt. Rollen tragen dafuer `## Session Identity`.
 * `undefined` = Sektion entfernen.
 */
export function formatWorkspacePrompt(
  s: Pick<WorkspaceSections, 'workspaceId' | 'workspaceName' | 'workspaceProjects' | 'contextPaths' | 'workspacePrompt'>,
): string | undefined {
  let who: string | undefined
  if (s.workspaceId) {
    who = `Du arbeitest im Workspace **${s.workspaceName ?? s.workspaceId}** (\`${s.workspaceId}\`).`
    if (s.workspaceProjects?.length) {
      who += '\n\nProjekte in diesem Workspace:\n'
        + s.workspaceProjects.map(p => `- \`${p}\``).join('\n')
    }
    if (s.contextPaths?.length) {
      who += '\n\nDazu gehören die Kontextordner unter `## Context Directories`.'
    }
  }
  const parts = [who, s.workspacePrompt?.trim() || undefined].filter((p): p is string => !!p)
  return parts.length ? parts.join('\n\n') : undefined
}

/**
 * Inhalt einer Anweisungsdatei, die der Mux neu anlegt. Der Verweis ist der
 * Grund, warum das Anlegen vertretbar ist: liegt eine AGENTS.md im Projekt, liest
 * opencode die CLAUDE.md nicht mehr (gemessen) — ohne den Satz verloere es die
 * eigentlichen Projektanweisungen, sobald einmal eine Codex-Session dort lief.
 */
export function newInstructionsFile(target: InstructionsTarget): string {
  const kopf = `${MUX_OWNED_MARKER}\n# Projektanweisungen\n`
  if (!target.pointerTo) return kopf
  return kopf + '\n'
    + `Die eigentlichen Projektanweisungen stehen in \`${target.pointerTo}\` in diesem Verzeichnis. `
    + 'Lies sie zu Beginn der Session vollständig; was dort steht, gilt hier genauso.\n'
}

// ─── Sitzungskontext ohne Injektion (2026-11-02) ─────────────
//
// Bis 0.14.2 schrieb der Mux Global Rules, Workspace Prompt und Context
// Directories dauerhaft in die CLAUDE.md des Projekts. Dort blieben sie stehen,
// wurden mitcommittet und widersprachen sich, sobald ein Workspace sich
// aenderte. Jetzt steht der Kontext in einer Datei, die dem Mux gehoert, und
// reist beim Start mit: Claude Code `--append-system-prompt-file`, Codex
// `-c developer_instructions`. opencode 2.0.29 hat dafuer keinen Weg — sein
// `instructions` in der Config wirkt nicht (gemessen) —, dort bekommt nur eine
// AGENTS.md den Kontext, die der Mux selbst angelegt hat.

/** Erste Zeile einer Anweisungsdatei, die der Mux angelegt hat und pflegen darf. */
export const MUX_OWNED_MARKER = '<!-- cipher-mux: vom Mux angelegt -->'

/** Kopf der Kontext-Sektion in einer Mux-eigenen AGENTS.md. Alles danach schreibt der Mux neu. */
export const MUX_KONTEXT_HEADING = '## Sitzungskontext (cipher-mux)'

/** Der Sitzungskontext einer Session ohne Rolle, wie er beim Start mitgegeben wird. */
export interface MuxKontext {
  /** Datei unter `runs/folder/` — Claude Code liest sie selbst. */
  file: string
  /** Derselbe Text, fuer CLIs, die ihn als Argument brauchen (Codex). */
  text: string
  /** Kontextordner, die es gibt — Claude Code bekommt sie zusaetzlich als `--add-dir`. */
  contextDirs: string[]
}

/**
 * Der Text des Sitzungskontexts. Dieselben Inhalte wie die frueheren Sektionen,
 * in derselben Form, nur in einer Datei des Mux statt im Projekt.
 */
export function buildMuxKontext(sections: WorkspaceSections, globalRules: string): string {
  const parts: string[] = [
    MUX_KONTEXT_HEADING,
    'Diesen Kontext gibt der cipher-mux beim Start mit; er steht in keiner Datei des Projekts. '
      + 'Die Mux-Werkzeuge (`mux_*`) kommen über den MCP-Server `cipher-mux`.',
  ]
  const ws = formatWorkspacePrompt(sections)
  if (ws) parts.push(`## Workspace Prompt\n\n${ws}`)
  if (sections.contextPaths?.length) {
    parts.push(`## Context Directories\n\n${sections.contextPaths.map(p => `- \`${p}\``).join('\n')}`)
  }
  if (globalRules.trim()) parts.push(`## Global Rules\n\n${globalRules.trim()}`)
  return parts.join('\n\n') + '\n'
}

/**
 * Wo der Kontext einer Session liegt. Pro Projekt und Workspace, nicht pro
 * Session: Keep Working und Fork bauen die Startzeile, bevor es eine Session-ID
 * gibt. Zwei Sessions im selben Projekt und Workspace teilen ihn — wie vorher die
 * CLAUDE.md, nur ohne das Projekt anzufassen.
 */
export function muxKontextPath(runsBase: string, projectPath: string, workspaceId: string | null | undefined): string {
  let h = 0x811c9dc5
  for (const ch of `${path.resolve(projectPath)}\0${workspaceId ?? ''}`) {
    h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0
  }
  const name = `${path.basename(projectPath).replace(/[^A-Za-z0-9_.-]/g, '_')}-${h.toString(16).padStart(8, '0')}.md`
  return path.join(runsBase, 'folder', name)
}

/**
 * Den Kontext in eine **Mux-eigene** AGENTS.md schreiben (opencode). Eine Datei
 * ohne `MUX_OWNED_MARKER` in der ersten Zeile hat jemand anders geschrieben und
 * bleibt unangetastet; eine fehlende legt der Mux nicht hier an, das tut
 * `ensureInstructionsFile`. Gibt zurueck, ob geschrieben wurde.
 */
export function syncOwnedInstructionsKontext(filePath: string, kontext: string): boolean {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return false
  }
  if (!content.startsWith(MUX_OWNED_MARKER)) return false
  const idx = content.indexOf(`\n${MUX_KONTEXT_HEADING}`)
  const head = (idx >= 0 ? content.slice(0, idx) : content).replace(/\s+$/, '')
  fs.writeFileSync(filePath, `${head}\n\n${kontext}`, 'utf-8')
  return true
}

/**
 * Die Anweisungsdatei, die die CLI dieser Session wirklich liest — angelegt, wenn
 * die CLI eine braucht und sie fehlt. Gibt den Dateinamen zurueck.
 *
 * Ein Adapter ohne `instructionsTarget` bleibt bei `CLAUDE.md` (Claude Code). Eine
 * vorhandene `AGENTS.md` wird nie ueberschrieben. Fehlt das Verzeichnis, wird
 * nichts geschrieben — der Aufrufer haengt an einer Init-Kette, und ein Wurf dort
 * kostet still den ganzen Restore.
 *
 * **Auch fuer Run-Verzeichnisse von Rollen.** opencode 2 liest `CLAUDE.md` nicht
 * mehr; ohne den Verweis in einer `AGENTS.md` arbeitete eine Rolle ohne ihr Preset,
 * ihre Persona und ihre Global Rules, und nichts meldete es.
 */
export function ensureInstructionsFile(
  projectPath: string,
  adapter: { instructionsTarget?: (present: { agentsMd: boolean; claudeMd: boolean }) => InstructionsTarget },
): string {
  const present = {
    agentsMd: fs.existsSync(path.join(projectPath, 'AGENTS.md')),
    claudeMd: fs.existsSync(path.join(projectPath, 'CLAUDE.md')),
  }
  const target = adapter.instructionsTarget?.(present) ?? { file: 'CLAUDE.md' as const }
  if (target.file === 'AGENTS.md' && !present.agentsMd && fs.existsSync(projectPath)) {
    fs.writeFileSync(path.join(projectPath, 'AGENTS.md'), newInstructionsFile(target), 'utf-8')
  }
  return target.file
}

/** Liegt `dir` echt unterhalb von `base`? Die Basis selbst und Nachbarn mit gleichem Praefix nicht. */
function liegtUnter(dir: string, base: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(dir))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * Die Anweisungsdatei einer **Rolle** in ihrem Run-Verzeichnis. Liest die CLI
 * `AGENTS.md` (opencode, Codex), steht dort der volle Rollentext — eine Kopie der
 * eben zusammengesetzten `CLAUDE.md`, inklusive Versionsmarker —, nicht nur ein
 * Verweis. Mit Verweis kam der Rollentext nur an, wenn das Modell der Bitte folgte,
 * die Datei zu lesen (LESSONS L20a).
 *
 * Ueberschreiben ist nur hier vertretbar: das Run-Verzeichnis gehoert dem Mux, und
 * die `CLAUDE.md` daneben wird ohnehin bei jedem Start neu geschrieben. Liegt
 * `runDir` nicht unter `runsBase`, oder fehlt die `CLAUDE.md`, gilt
 * `ensureInstructionsFile` — eine vorhandene AGENTS.md bleibt dann unangetastet.
 */
export function ensureEntityInstructionsFile(
  runDir: string,
  adapter: { instructionsTarget?: (present: { agentsMd: boolean; claudeMd: boolean }) => InstructionsTarget },
  runsBase: string,
): string {
  const claudeMd = path.join(runDir, 'CLAUDE.md')
  const target = adapter.instructionsTarget?.({ agentsMd: false, claudeMd: fs.existsSync(claudeMd) }) ?? { file: 'CLAUDE.md' as const }
  if (target.file !== 'AGENTS.md' || !liegtUnter(runDir, runsBase) || !fs.existsSync(claudeMd)) {
    return ensureInstructionsFile(runDir, adapter)
  }
  fs.writeFileSync(path.join(runDir, 'AGENTS.md'), fs.readFileSync(claudeMd, 'utf-8'), 'utf-8')
  return target.file
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

function shellArg(s: string): string {
  return /^[A-Za-z0-9_\-.=/:@,+]+$/.test(s) ? s : shellQuote(s)
}

/**
 * Die Zeile, die nach TERMINAL_READY ins Pane getippt wird. `launch = null`
 * heisst „nur Shell". Das `cd` steht davor, weil die Shell ihr Startverzeichnis
 * nicht in jedem Fall behaelt (Login-Profile, die woanders hin wechseln).
 */
export function buildFolderAutoLaunch(dirPath: string, launch: LaunchCommand | null): string {
  const cd = `cd ${shellQuote(dirPath)} && clear`
  if (!launch) return `${cd}\n`
  return `${cd}; ${launchLine(launch)}\n`
}

/**
 * Die Startzeile mit gequoteten Argumenten. Ein schlichtes `join(' ')` reicht
 * nicht mehr, seit Argumente Text tragen (Codex `developer_instructions`).
 */
export function launchLine(launch: LaunchCommand): string {
  return [launch.cmd, ...launch.args].map(shellArg).join(' ')
}

/**
 * Die CLI fuer eine wiederhergestellte Session (Keep Working, Recovery).
 *
 * Eine Rolle loest ihre CLI weiter selbst auf — sie kann seit dem Speichern
 * umgestellt worden sein, und dann gilt die neue Wahl. Eine Ordner-Session hat
 * keine Rolle; ohne die gespeicherte ID kaeme eine Codex-Session nach dem
 * Neustart als Default-CLI zurueck, und das saehe nach Erfolg aus.
 * `undefined` heisst: Rolle bzw. Default entscheiden.
 */
export function restoreAdapterId(
  entry: { entityId?: string | null; adapterId?: string | null },
  isKnown: (adapterId: string) => boolean,
): string | undefined {
  if (entry.entityId) return undefined
  const id = entry.adapterId ?? null
  return id && isKnown(id) ? id : undefined
}
