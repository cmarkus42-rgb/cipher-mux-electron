/**
 * Role boundaries as a constraint, not as a request.
 *
 * The project already states its boundaries — in prompt text. "Du bist kein
 * Coder — du koordinierst. Workers schreiben Code." (workshop preset). "Kein
 * Code fixen. Du findest Fehler, andere fixen sie." (testing preset). And the
 * strategy paper: a session that wrote a spec is anchored on its own decisions
 * and does not notice the spec is wrong, "deshalb darf Refinement nicht bauen,
 * nachdem es gespect hat".
 *
 * A prompt can be ignored. That is the whole point of turning these into
 * constraints.
 *
 * ── How, and why not the obvious way ──────────────────────────────────────
 *
 * The roadmap proposed `settings.local.json` permissions, since the Mux
 * already writes an allowlist per entity. Measured against the live CLI before
 * building on it:
 *
 *  1. `permissions.deny` is honoured normally, and only `Edit(glob)` matches
 *     file edits. A `Write(glob)` rule is rejected outright — the CLI says so:
 *     "only Edit(path) rules are. Use Edit(src/**) instead (Edit rules cover
 *     all file-editing tools)."
 *  2. But entity sessions launch with `--dangerously-skip-permissions`, and
 *     that flag bypasses deny rules. Verified: with the rule in place and the
 *     flag set, the edit went through. Writing those rules would have produced
 *     a boundary that looks enforced and is not — the failure mode this whole
 *     module exists to avoid.
 *  3. A PreToolUse hook DOES still fire under that flag and can refuse the
 *     call. Verified the same way: the edit was refused, the reason surfaced,
 *     and the model did not route around it via the shell.
 *
 * So the boundary is a generated hook. The allowlist stays what it is — a list
 * that matters only when permissions are actually being checked.
 */

import * as fs from 'fs'
import * as path from 'path'

/** What a role may not touch, and why. */
export interface EntityBoundary {
  /**
   * Path fragments that must not be edited. Matched as plain substrings
   * against the absolute path, so `/src/` means "inside a src directory" and
   * does not match `mysrc/` or a file merely named `src-layout.md`.
   */
  denyPathPatterns: string[]
  /** Why this boundary exists, in words a human can check against the project. */
  reason: string
  /**
   * Absolute path to a JSON array of further deny patterns, read on every
   * tool call. For `local-worker`, whose protected acceptance tests change per
   * work item (Spec 2026-10-09 §5). Only the opencode plugin honours it — the
   * worker runs nowhere else. An unreadable file adds nothing; the gate is
   * what enforces test protection, this is the guard rail.
   */
  denyListFile?: string
  /**
   * Ausnahmen von `denyPathPatterns`, als Teilstring verglichen mit dem Pfad AB
   * DER REPO-WURZEL (erster Vorfahr mit `.git` oder Projekt-Config). Nicht mit
   * dem absoluten Pfad: liegt das Repo selbst unter `/test/`, oeffnete das jede
   * Datei. Ohne gefundene Wurzel wird der ganze Pfad verglichen.
   */
  allowPathPatterns?: string[]
  /**
   * Die `testpfade` aus `.cipher-mux/local-factory.json` des Ziel-Repos gelten
   * als weitere Ausnahmen — nur Eintraege mit Testmerkmal (siehe
   * `checkTestPaths`). Gelesen zur Laufzeit, bei jedem Aufruf.
   */
  projectTestPaths?: boolean
  /** Immer gesperrt; keine Ausnahme hebt das auf. */
  lockPathPatterns?: string[]
  /**
   * Regex-Quellen, geprueft gegen den normalisierten Shell-Befehl (siehe
   * `normalizeBoundaryCommand`). Claude Code: Matcher `Bash`; opencode: `shell`
   * und `bash`.
   */
  denyCommandPatterns?: string[]
  /** Begruendung fuer eine Befehlssperre; ohne sie gilt `reason`. */
  commandReason?: string
}

/** File the runner writes the current work item's protected paths into. */
export const PROTECTED_PATHS_FILENAME = '.cipher-mux-protected.json'

/** Projekt-Config der Local Factory, relativ zur Wurzel des Ziel-Repos. */
export const PROJECT_CONFIG_RELPATH = '.cipher-mux/local-factory.json'

/**
 * Testmerkmale im Pfad. Eine Datei, die eines davon traegt, ist ein Test — und
 * einen Test zu schreiben ist nicht, den Code zu schreiben (LESSONS L1: unter
 * SvelteKit liegen die vitest-Tests in `src/`).
 */
const TEST_PATH_MARKERS = ['.test.', '.spec.', '/tests/', '/__tests__/', '/test/']

/**
 * Only roles the project itself describes as non-building appear here.
 *
 * A role that is absent is deliberately unconstrained — Cyber Factory writes
 * code, and constraining it would be constraining the point of it. Adding a
 * role means adding a line with a reason that can be checked, not a rule
 * someone guessed.
 */
export const ENTITY_BOUNDARIES: Record<string, EntityBoundary> = {
  workshop: {
    denyPathPatterns: ['/src/'],
    reason:
      'Workshop koordiniert und schreibt keinen Code — "Du bist kein Coder, du koordinierst. '
      + 'Workers schreiben Code." (workshop preset).',
  },
  'testing-assistant': {
    denyPathPatterns: ['/src/'],
    reason:
      'Der Testing Assistant findet Fehler und behebt sie nicht — "Kein Code fixen. Du findest '
      + 'Fehler, andere fixen sie." (testing preset). Tests schreiben bleibt erlaubt.',
  },
  refinement: {
    denyPathPatterns: ['/src/'],
    reason:
      'Refinement spezifiziert und uebergibt an die Cyber Factory. Wer gespect hat, ist auf die '
      + 'eigenen Entscheidungen verankert und merkt nicht, dass die Spec falsch ist '
      + '(Strategiepapier, Abschnitt 3). Specs und Dokumente bleiben erlaubt.',
  },
  'ideation-partner': {
    denyPathPatterns: ['/src/'],
    reason:
      'Der Ideation Partner erarbeitet Anforderungen und uebergibt sie per '
      + 'mux_ideation_handoff_refinement weiter. Er baut nicht.',
  },
  audit: {
    denyPathPatterns: ['/src/'],
    reason:
      'Audit begutachtet und reicht das Urteil an die Cyber Factory zurueck, "so CF can act on '
      + 'the audit outcome" (mux_audit_handoff_cyber_factory). Wer selbst aendert, begutachtet '
      + 'die eigene Arbeit.',
  },
  'local-factory': {
    denyPathPatterns: ['/src/', '/lib/'],
    allowPathPatterns: TEST_PATH_MARKERS,
    projectTestPaths: true,
    // Die Config entscheidet, was als Test gilt. Wer sie aendern darf, hebt die
    // Grenze auf. Ueber die Shell bleibt das moeglich (offen dokumentiert).
    lockPathPatterns: ['/' + PROJECT_CONFIG_RELPATH],
    // LESSONS L5/L9: `stash` liegt im gemeinsamen refs/stash aller Worktrees,
    // `checkout`/`switch`/`reset --hard` stellen einen fremden Checkout um.
    denyCommandPatterns: [
      '\\bgit stash\\b',
      '\\bgit checkout\\b',
      '\\bgit switch\\b',
      '\\bgit reset\\b[^;&|]*\\s--hard(?![\\w-])',
    ],
    commandReason:
      'Die Local Cyber Factory stellt keinen Checkout um und benutzt keinen Stash: refs/stash '
      + 'gehoert allen Worktrees gemeinsam, und checkout/switch/reset --hard aendern einen Baum, '
      + 'auf dem andere arbeiten (LESSONS L5, L9). Gegenproben ueber '
      + '`git archive <basis> | tar -x -C <scratch>`; ein neuer Worktree ueber `git worktree add`.',
    reason:
      'Die Local Cyber Factory schneidet zu und prueft, sie codet nicht — sonst wandert die '
      + 'Arbeit still zurueck in die Cloud und die Messung, was das lokale Modell kann, ist '
      + 'wertlos (Spec 2026-10-09, E3). Abnahmetests und Auftraege bleiben erlaubt.',
  },
  'local-worker': {
    denyPathPatterns: ['/AUFTRAG.md'],
    denyListFile: PROTECTED_PATHS_FILENAME,
    reason:
      'Abnahmetests und Auftrag gehoeren dem Architekten. Wer den Test aendert, den er '
      + 'bestehen soll, beweist nichts (Keel C-001). Eigene Unit-Tests sind erlaubt.',
  },
  debugger: {
    denyPathPatterns: ['/src/'],
    reason:
      'Der Debugger diagnostiziert und liefert Befunde samt Empfehlungen an die Cyber Factory '
      + '(mux_debugger_handoff_cyber_factory). Das Beheben liegt dort.',
  },
}

/** The boundary for a role, or null when it has none. */
export function getEntityBoundary(entityId: string | null | undefined): EntityBoundary | null {
  if (!entityId) return null
  return ENTITY_BOUNDARIES[entityId] ?? null
}

/**
 * Whether an edit to this path is refused under the given patterns.
 *
 * Substring matching on purpose: the hook receives an absolute path, and the
 * rule wants to say "inside a src directory" without pulling a glob library
 * into a generated standalone script.
 */
export function isPathDenied(
  filePath: string | undefined | null,
  denyPathPatterns: readonly string[],
): boolean {
  if (!filePath) return false
  return denyPathPatterns.some(pattern => filePath.includes(pattern))
}

/**
 * Generate the standalone PreToolUse hook for a boundary.
 *
 * Rules and reason are embedded with JSON.stringify rather than pasted into a
 * template — a quote or backslash in the reason would otherwise close the
 * string literal and turn generated text into generated code.
 *
 * The script is deliberately dependency-free: it runs from the entity's run
 * directory, which has no node_modules.
 */
export function buildBoundaryHookScript(boundary: EntityBoundary): string {
  return `#!/usr/bin/env node
// Generated by cipher-mux (entity-boundaries.ts). Do not edit — regenerated on
// every entity start. The rule and its reason are baked in below.
'use strict'
const fs = require('fs')
const path = require('path')

const RULES = ${JSON.stringify(boundaryRules(boundary))}
const REASON = ${JSON.stringify(boundary.reason)}
${BOUNDARY_DECISION_SOURCE}
const io = {
  read(p) { try { return fs.readFileSync(p, 'utf-8') } catch { return null } },
  exists(p) { try { fs.statSync(p); return true } catch { return false } },
}

let raw = ''
process.stdin.on('data', chunk => { raw += chunk })
process.stdin.on('end', () => {
  let input = null
  try {
    input = JSON.parse(raw)
  } catch {
    // Unparseable input is not a reason to block work — allow and let the
    // normal permission machinery deal with it.
  }
  const tool = input && input.tool_name
  const toolInput = (input && input.tool_input) || {}

  if (tool === 'Bash') {
    // Ein erlaubter Befehl bekommt KEINE Entscheidung: ein "allow" wuerde die
    // Shell an der normalen Rechtepruefung vorbeiwinken.
    const decision = boundaryDecideCommand(toolInput.command, RULES)
    if (decision.denied) write(decision)
    return
  }

  let filePath = toolInput.file_path || toolInput.notebook_path || ''
  if (typeof filePath !== 'string') filePath = ''
  // Relativ und mit '..' kommt vor; verglichen wird der aufgeloeste Pfad.
  if (filePath) filePath = path.resolve((input && input.cwd) || process.cwd(), filePath)
  const decision = boundaryDecidePath(filePath, RULES, io)
  write(decision)
})

function write(decision) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision.denied ? 'deny' : 'allow',
      ...(decision.denied ? { permissionDecisionReason: decision.reason || REASON } : {}),
    },
  }))
}
`
}

/** Die Regeln einer Grenze, so wie die eingebettete Entscheidung sie liest. */
export interface BoundaryRules {
  deny: string[]
  allow: string[]
  lock: string[]
  denyCommands: string[]
  projectTestPaths: boolean
  reason: string
  commandReason: string
}

export interface BoundaryDecision {
  denied: boolean
  reason?: string
}

/** Dateizugriff der Entscheidung — injiziert, damit sie selbst rein bleibt. */
export interface BoundaryIo {
  read(p: string): string | null
  exists(p: string): boolean
}

export interface TestPathCheck {
  accepted: string[]
  hints: string[]
}

export function boundaryRules(boundary: EntityBoundary): BoundaryRules {
  return {
    deny: [...boundary.denyPathPatterns],
    allow: [...(boundary.allowPathPatterns ?? [])],
    lock: [...(boundary.lockPathPatterns ?? [])],
    denyCommands: [...(boundary.denyCommandPatterns ?? [])],
    projectTestPaths: boundary.projectTestPaths === true,
    reason: boundary.reason,
    commandReason: boundary.commandReason ?? boundary.reason,
  }
}

/**
 * Die eine Entscheidung, als Quelltext.
 *
 * Claude-Hook (CommonJS, gebacken beim Entity-Start) und opencode-Plugin (ESM)
 * laufen ohne node_modules; sie bekommen genau diesen Text eingebettet. Der Mux
 * wertet denselben Text per `new Function` aus, statt ihn ein zweites Mal in
 * TypeScript zu schreiben — zwei Fassungen driften, und die Drift waere eine
 * stille Luecke in genau einem der beiden Werkzeuge. Ein Paritaetstest schickt
 * dieselben Faelle durch alle drei.
 *
 * Darum: nur Sprachkern, keine Imports, kein Backtick (der Text steht in einem
 * Template-Literal), Dateizugriff ueber das uebergebene `io`.
 */
const BOUNDARY_DECISION_SOURCE = String.raw`
var BOUNDARY_TEST_MARKER = /(^|[\/._-])(test|spec)/i
var BOUNDARY_CONFIG_RELPATH = '.cipher-mux/local-factory.json'

// Glob mit *, ** und ?, gegen den ganzen Pfad. Kein Paket: der Text laeuft ohne node_modules.
function boundaryGlobMatch(pattern, relPath) {
  var p = String(pattern).replace(/^\.\//, '')
  var out = ''
  var i = 0
  while (i < p.length) {
    var c = p.charAt(i)
    if (c === '*' && p.charAt(i + 1) === '*') {
      if (p.charAt(i + 2) === '/') { out += '(?:.*/)?'; i += 3 } else { out += '.*'; i += 2 }
    } else if (c === '*') {
      out += '[^/]*'; i += 1
    } else if (c === '?') {
      out += '[^/]'; i += 1
    } else {
      out += c.replace(/[\\^$.|+()[\]{}]/g, '\\$&'); i += 1
    }
  }
  return new RegExp('^' + out + '$').test(String(relPath).replace(/^\.\//, ''))
}

// Ein testpfade-Eintrag gilt nur mit Testmerkmal, und nicht, wenn er nur aus src/lib besteht.
function boundaryCheckTestPaths(list) {
  var accepted = []
  var hints = []
  if (list === undefined || list === null) return { accepted: accepted, hints: hints }
  if (!Array.isArray(list)) {
    hints.push('testpfade ist keine Liste und wird ignoriert.')
    return { accepted: accepted, hints: hints }
  }
  for (var i = 0; i < list.length; i++) {
    var entry = list[i]
    if (typeof entry !== 'string' || !entry.trim()) {
      hints.push('testpfade-Eintrag ' + JSON.stringify(entry) + ' ist kein Pfad und wird ignoriert.')
      continue
    }
    var rest = entry.replace(/(^|\/)(src|lib)(?=\/|$)/g, '').replace(/[\/.*?]/g, '')
    if (!rest || !BOUNDARY_TEST_MARKER.test(entry)) {
      hints.push('testpfade-Eintrag ' + JSON.stringify(entry)
        + ' traegt kein Testmerkmal (test, spec, tests, __tests__) und wird ignoriert.')
      continue
    }
    accepted.push(entry)
  }
  return { accepted: accepted, hints: hints }
}

// rel beginnt mit '/'. Mit Wildcard: Glob (Eintrag auf '/' = Verzeichnis); sonst Teilstring ab Segmentanfang.
function boundaryTestPathMatches(entry, rel) {
  if (/[*?]/.test(entry)) {
    var g = entry.replace(/^\/+/, '')
    if (/\/$/.test(g)) g += '**'
    return boundaryGlobMatch(g, rel.replace(/^\/+/, ''))
  }
  return rel.indexOf(entry.charAt(0) === '/' ? entry : '/' + entry) !== -1
}

function boundaryDirname(p) {
  var i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

// Erster Vorfahr mit .git (Datei oder Ordner, Worktrees haben eine Datei) oder Projekt-Config.
function boundaryFindRoot(absPath, io) {
  var dir = boundaryDirname(absPath)
  for (var n = 0; n < 256; n++) {
    var base = dir === '/' ? '' : dir
    if (io.exists(base + '/.git') || io.exists(base + '/' + BOUNDARY_CONFIG_RELPATH)) return dir
    if (dir === '/') return null
    dir = boundaryDirname(dir)
  }
  return null
}

function boundaryHas(list, s) {
  return (list || []).some(function (p) { return s.indexOf(p) !== -1 })
}

function boundaryDecidePath(filePath, rules, io) {
  if (typeof filePath !== 'string' || !filePath) return { denied: false }
  if (boundaryHas(rules.lock, filePath)) return { denied: true, reason: rules.reason }
  if (!boundaryHas(rules.deny, filePath)) return { denied: false }

  var root = filePath.charAt(0) === '/' ? boundaryFindRoot(filePath, io) : null
  var rel = root && root !== '/' ? filePath.slice(root.length) : filePath
  if (boundaryHas(rules.allow, rel)) return { denied: false }

  var hints = []
  if (rules.projectTestPaths && root) {
    var raw = io.read((root === '/' ? '' : root) + '/' + BOUNDARY_CONFIG_RELPATH)
    if (typeof raw === 'string') {
      var data = null
      try {
        data = JSON.parse(raw)
      } catch (e) {
        hints.push(BOUNDARY_CONFIG_RELPATH + ' ist kein gueltiges JSON; testpfade werden ignoriert.')
      }
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        var check = boundaryCheckTestPaths(data.testpfade)
        for (var i = 0; i < check.accepted.length; i++) {
          if (boundaryTestPathMatches(check.accepted[i], rel)) return { denied: false }
        }
        hints = hints.concat(check.hints)
      }
    }
  }
  return { denied: true, reason: hints.length ? rules.reason + ' Hinweis: ' + hints.join(' ') : rules.reason }
}

// Mehrfach-Leerraum, Pfad vor git und globale git-Optionen (-C, -c, --git-dir, ...) fallen weg.
function boundaryNormalizeCommand(command) {
  var s = String(command).replace(/\\\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/(^|[\s;&|(\x60])[^\s;&|(\x60]*\/git(?= |$)/g, '$1git')
  var opt = /\bgit (?:(?:-C|-c|--git-dir|--work-tree|--namespace|--exec-path|--config-env)(?:=| )(?:"[^"]*"|'[^']*'|[^\s;&|]+)|--no-pager|--paginate|-p|-P|--bare|--no-replace-objects|--literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|--no-optional-locks) /g
  var prev
  do {
    prev = s
    s = s.replace(opt, 'git ')
  } while (s !== prev)
  return s
}

function boundaryDecideCommand(command, rules) {
  var list = rules.denyCommands || []
  if (!list.length || typeof command !== 'string') return { denied: false }
  var norm = boundaryNormalizeCommand(command)
  for (var i = 0; i < list.length; i++) {
    var re = null
    try { re = new RegExp(list[i]) } catch (e) { re = null }
    if (re && re.test(norm)) return { denied: true, reason: rules.commandReason || rules.reason }
  }
  return { denied: false }
}
`

interface BoundaryDecisionFns {
  boundaryGlobMatch(pattern: string, relPath: string): boolean
  boundaryCheckTestPaths(list: unknown): TestPathCheck
  boundaryNormalizeCommand(command: string): string
  boundaryDecidePath(filePath: unknown, rules: BoundaryRules, io: BoundaryIo): BoundaryDecision
  boundaryDecideCommand(command: unknown, rules: BoundaryRules): BoundaryDecision
}

const shared = new Function(`${BOUNDARY_DECISION_SOURCE}
return { boundaryGlobMatch, boundaryCheckTestPaths, boundaryNormalizeCommand, boundaryDecidePath, boundaryDecideCommand }`,
)() as BoundaryDecisionFns

const nodeIo: BoundaryIo = {
  read(p) { try { return fs.readFileSync(p, 'utf-8') } catch { return null } },
  exists(p) { return fs.existsSync(p) },
}

/** Darf diese Rolle die Datei aendern? Dieselbe Entscheidung wie Hook und Plugin. */
export function decideBoundaryPath(
  filePath: string | null | undefined,
  rules: BoundaryRules,
  io: BoundaryIo = nodeIo,
): BoundaryDecision {
  return shared.boundaryDecidePath(filePath, rules, io)
}

/** Darf diese Rolle den Shell-Befehl ausfuehren? */
export function decideBoundaryCommand(command: string | null | undefined, rules: BoundaryRules): BoundaryDecision {
  return shared.boundaryDecideCommand(command, rules)
}

/** Der Befehl so, wie die Befehlssperre ihn sieht. */
export function normalizeBoundaryCommand(command: string): string {
  return shared.boundaryNormalizeCommand(command)
}

/** `testpfade` pruefen: angenommen wird nur, was ein Testmerkmal traegt. Wirft nie. */
export function checkTestPaths(list: unknown): TestPathCheck {
  return shared.boundaryCheckTestPaths(list)
}

/** Glob mit `*`, `**`, `?` gegen den ganzen (relativen) Pfad. */
export function matchGlob(pattern: string, relPath: string): boolean {
  return shared.boundaryGlobMatch(pattern, relPath)
}

/**
 * The file-editing tools of opencode 2, by their own names.
 *
 * Not guessed and not translated from Claude Code: read off `ctx.tool.list()` of
 * a running opencode 2.0.29 (2026-10-14), which answers `patch, edit, glob,
 * grep, …, question, read, shell, skill, subagent, webfetch, websearch, write`.
 * Three of those write files: `write`, `edit`, `patch`. V1 called the last one
 * `apply_patch`, and the binary keeps that as an alias — so both names are
 * listed. A name that never appears costs nothing; a missing one is a hole.
 *
 * Why the list and not "anything carrying a path": `read` carries one too, and
 * the Claude Code boundary does not block reads. A boundary that also blinds the
 * role is a different rule than the one declared above.
 */
export const OPENCODE_EDIT_TOOLS = ['write', 'edit', 'patch', 'apply_patch'] as const

/**
 * Die Shell von opencode. In opencode 2 heisst sie `shell`, Eingabe
 * `{ command, workdir, … }` (abgelesen am Schema im Binary 2.0.29,
 * "Shell command string to execute"); `bash` ist der fruehere Name. Beide
 * stehen hier — ein fehlender Name ist eine Luecke, ein ueberzaehliger kostet nichts.
 */
export const OPENCODE_SHELL_TOOLS = ['shell', 'bash'] as const

/** Filename of the generated opencode boundary plugin. */
export const OPENCODE_BOUNDARY_PLUGIN_FILENAME = 'cipher-mux-role-boundary.js'

/** Stable plugin id. opencode 2 keys storage and diagnostics on it. */
export const OPENCODE_BOUNDARY_PLUGIN_ID = 'cipher-mux.role-boundary'

/**
 * Generate the boundary as an opencode 2 **plugin**, not a hook file.
 *
 * opencode has no PreToolUse configuration. It has plugin modules, and the
 * hook that can stop a call is `ctx.tool.hook("execute.before")`. Measured
 * against opencode 2.0.29 on 2026-10-14 (`opencode run`, `--auto`):
 *
 *  - A throw in the callback prevents the call: the file was never created, the
 *    event stream shows `session.tool.failed` with `executed: false`, and the
 *    session ran on. The second call of the same turn, to an allowed path,
 *    completed — selective, not a blanket lock.
 *  - The message reaches the model verbatim, wrapped as
 *    `{"error":{"type":"unknown","message":"<REASON>"}}`.
 *  - `--auto` does not bypass it: it answers permission requests, and this is
 *    not one — which is why a hook and not the `permissions` ruleset.
 *
 * What changed from opencode 1.x, each of which would have been SILENT:
 *
 *  1. **A V1 plugin is rejected.** `export default async () => ({…})` fails with
 *     "Plugin must export a default definition with an id and an effect or setup
 *     function" — a WARN line, nothing on the screen. The export is now an object
 *     `{ id, setup }`. A plain object loads without importing `@opencode/plugin`,
 *     so the file stays dependency-free.
 *  2. **The path field is `path`, not `filePath`.** A port that kept reading
 *     `filePath` would match nothing and the boundary would be dead. `filePath`
 *     stays as a fallback; and an edit tool with NO readable path is now refused
 *     (fail-closed) — the V1 rule let it through, which is exactly how a field
 *     rename turns into a hole.
 *  3. **Paths arrive relative.** The model passes `path: "t.txt"` to `edit`. The
 *     rule is a substring match on `/src/`, which `src/x.ts` does not contain, so
 *     paths are resolved against `ctx.location.directory` (and `..` collapsed)
 *     before the comparison.
 *  4. **`patch` carries `{ patchText }`**, not a path: a text with
 *     `*** Add File:`, `*** Update File:`, `*** Delete File:` and optionally
 *     `*** Move to:` headers, possibly several files at once. Every path in it is
 *     checked, destinations of a move included. (Read off the binary's own parser;
 *     the test model was not offered `patch`, so this is not yet measured on a
 *     live call.)
 */
export function buildOpenCodeBoundaryPlugin(
  boundary: EntityBoundary,
  denyListFile?: string,
): string {
  return `// Generated by cipher-mux (entity-boundaries.ts). Do not edit — regenerated on
// every entity start. The rule and its reason are baked in below.
//
// opencode 2: default-export a plugin DEFINITION ({ id, setup }). The V1 shape,
// a function returning a hook object, is rejected with a WARN line only.
import * as fs from 'node:fs'
import * as path from 'node:path'

const RULES = ${JSON.stringify(boundaryRules(boundary))}
const REASON = ${JSON.stringify(boundary.reason)}
const EDIT_TOOLS = new Set(${JSON.stringify(OPENCODE_EDIT_TOOLS)})
const PATCH_TOOLS = new Set(['patch', 'apply_patch'])
const SHELL_TOOLS = new Set(${JSON.stringify(OPENCODE_SHELL_TOOLS)})
const PATCH_HEADERS = ['*** Add File: ', '*** Update File: ', '*** Delete File: ', '*** Move to: ']
const DENY_LIST_FILE = ${JSON.stringify(denyListFile ?? null)}
${BOUNDARY_DECISION_SOURCE}
const io = {
  read(p) { try { return fs.readFileSync(p, 'utf-8') } catch { return null } },
  exists(p) { try { fs.statSync(p); return true } catch { return false } },
}

function extraDeny() {
  if (!DENY_LIST_FILE) return []
  try {
    const list = JSON.parse(fs.readFileSync(DENY_LIST_FILE, 'utf-8'))
    return Array.isArray(list) ? list.filter(p => typeof p === 'string' && p) : []
  } catch {
    // Fehlt oder kaputt: nur die festen Regeln. Durchgesetzt wird im Gate.
    return []
  }
}

// A single path from write/edit. 'path' is the opencode 2 name; 'filePath' the V1 one.
function singlePath(input) {
  for (const key of ['path', 'filePath']) {
    if (typeof input[key] === 'string' && input[key]) return [input[key]]
  }
  return null
}

// Every path a patch touches, destinations of a move included. null = none readable.
function patchPaths(text) {
  if (typeof text !== 'string') return null
  const out = []
  for (const raw of text.split('\\n')) {
    const line = raw.replace(/\\r$/, '').trim()
    for (const header of PATCH_HEADERS) {
      if (line.startsWith(header)) {
        const p = line.slice(header.length).trim()
        if (p) out.push(p)
      }
    }
  }
  return out.length ? out : null
}

export default {
  id: ${JSON.stringify(OPENCODE_BOUNDARY_PLUGIN_ID)},
  async setup(ctx) {
    const cwd = (ctx && ctx.location && ctx.location.directory) || process.cwd()

    await ctx.tool.hook('execute.before', (event) => {
      if (!event || typeof event.tool !== 'string') return
      const input = event.input && typeof event.input === 'object' ? event.input : {}

      // Die Shell nur, wenn die Rolle Befehle sperrt. opencode 2 nennt sie
      // 'shell' (Eingabe { command, workdir }), aeltere Fassungen 'bash'.
      if (SHELL_TOOLS.has(event.tool)) {
        if (!RULES.denyCommands.length) return
        if (typeof input.command !== 'string') {
          throw new Error(
            'Der Befehl dieses ' + event.tool + '-Aufrufs ist nicht lesbar; die Rollengrenze lässt ihn deshalb nicht durch. ' + RULES.commandReason,
          )
        }
        const decision = boundaryDecideCommand(input.command, RULES)
        if (decision.denied) throw new Error(decision.reason)
        return
      }

      // Only the file-editing tools. 'read' carries a path as well, and
      // blinding the role is not the rule that was declared.
      if (!EDIT_TOOLS.has(event.tool)) return

      const paths = PATCH_TOOLS.has(event.tool) ? patchPaths(input.patchText) : singlePath(input)

      // Fail closed. An edit that names no readable path is a finding, not a free
      // pass — otherwise a renamed field silently disables the boundary.
      if (!paths) {
        throw new Error(
          'Der Pfad dieses ' + event.tool + '-Aufrufs ist nicht lesbar; die Rollengrenze lässt ihn deshalb nicht durch. ' + REASON,
        )
      }

      // Die Sperrliste des Laeufers ist hart: keine Testpfad-Ausnahme hebt sie auf.
      const rules = Object.assign({}, RULES, { lock: RULES.lock.concat(extraDeny()) })
      for (const p of paths) {
        // Relative paths are the normal case; resolve them (and collapse '..')
        // before the comparison, or '/src/' never matches 'src/x.ts'. The raw
        // path is checked as well — a '..' walking out of src/ stays denied.
        const resolved = path.resolve(cwd, p)
        for (const candidate of resolved === p ? [p] : [resolved, p]) {
          const decision = boundaryDecidePath(candidate, rules, io)
          // The throw is what stops the call. opencode surfaces the message as
          // the tool's error, which is how the reason reaches the model.
          if (decision.denied) throw new Error(decision.reason)
        }
      }
    })
  },
}
`
}

export interface BoundaryHookSettings {
  PreToolUse: Array<{
    matcher: string
    hooks: Array<{ type: 'command'; command: string }>
  }>
}

/**
 * The `hooks` block that wires the generated script to every file-editing tool.
 *
 * One matcher covering all of them rather than a permission rule per tool:
 * the CLI's own guidance is that Edit rules cover all file-editing tools, and
 * the same reasoning applies here — a boundary that misses MultiEdit is not a
 * boundary.
 */
export function buildBoundaryHookSettings(
  scriptPath: string,
  opts: { commands?: boolean } = {},
): BoundaryHookSettings {
  const hooks = [{ type: 'command' as const, command: `node ${JSON.stringify(scriptPath)}` }]
  return {
    PreToolUse: [
      { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks },
      // Eigener Eintrag fuer die Shell, nur wenn die Rolle Befehle sperrt.
      // Unteragenten (Task) laufen im selben Prozess mit denselben Hooks.
      ...(opts.commands ? [{ matcher: 'Bash', hooks }] : []),
    ],
  }
}

/** Dateiname des gebackenen Claude-Hooks im `.claude/` des Run-Verzeichnisses. */
export const CLAUDE_BOUNDARY_HOOK_FILENAME = 'role-boundary.js'

/**
 * Legt die Grenze einer Rolle als PreToolUse-Hook in `<runDir>/.claude/` an —
 * Skript plus Eintrag in `settings.local.json` — oder raeumt beides weg, wenn
 * die Rolle keine Grenze (mehr) hat. Gibt den Skriptpfad zurueck, sonst null.
 *
 * Eine Rolle, die ihre Grenze verloren hat, muss auch den Hook verlieren — sonst
 * erzwingt ein stehengebliebenes Skript eine Regel, die niemand mehr nennt.
 */
export function writeClaudeBoundaryHook(runDir: string, entityId: string | null | undefined): string | null {
  const boundary = getEntityBoundary(entityId)
  const claudeDir = path.join(runDir, '.claude')
  const hookPath = path.join(claudeDir, CLAUDE_BOUNDARY_HOOK_FILENAME)
  const settingsPath = path.join(claudeDir, 'settings.local.json')
  fs.mkdirSync(claudeDir, { recursive: true })

  let settings: Record<string, unknown> = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch { /* doesn't exist yet */ }

  if (boundary) {
    fs.writeFileSync(hookPath, buildBoundaryHookScript(boundary), { encoding: 'utf-8', mode: 0o755 })
    settings.hooks = {
      ...((settings.hooks as Record<string, unknown>) ?? {}),
      ...buildBoundaryHookSettings(hookPath, { commands: (boundary.denyCommandPatterns ?? []).length > 0 }),
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    return hookPath
  }

  if ((settings.hooks as { PreToolUse?: unknown })?.PreToolUse) {
    const hooks = { ...(settings.hooks as Record<string, unknown>) }
    delete hooks.PreToolUse
    settings.hooks = hooks
    if (Object.keys(hooks).length === 0) delete settings.hooks
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }
  try { fs.unlinkSync(hookPath) } catch { /* already gone */ }
  return null
}
