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
}

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
export function buildBoundaryHookScript(
  denyPathPatterns: readonly string[],
  reason: string,
): string {
  return `#!/usr/bin/env node
// Generated by cipher-mux (entity-boundaries.ts). Do not edit — regenerated on
// every entity start. The rule and its reason are baked in below.
'use strict'

const DENY = ${JSON.stringify(denyPathPatterns)}
const REASON = ${JSON.stringify(reason)}

let raw = ''
process.stdin.on('data', chunk => { raw += chunk })
process.stdin.on('end', () => {
  let filePath = ''
  try {
    const input = JSON.parse(raw)
    filePath = (input && input.tool_input && input.tool_input.file_path) || ''
  } catch {
    // Unparseable input is not a reason to block work — allow and let the
    // normal permission machinery deal with it.
  }

  const denied = typeof filePath === 'string'
    && DENY.some(pattern => filePath.includes(pattern))

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: denied ? 'deny' : 'allow',
      ...(denied ? { permissionDecisionReason: REASON } : {}),
    },
  }))
})
`
}

/**
 * The file-editing tools of opencode, by their own names.
 *
 * Not guessed and not translated from Claude Code: read off
 * `GET /experimental/tool/ids` of a running opencode 1.18.34, which answers
 * `["invalid","question","bash","read","glob","grep","edit","write","task",
 * "webfetch","todowrite","websearch","skill","apply_patch"]`. Three of those
 * write files.
 *
 * Why the list and not "anything carrying a filePath": `read` carries one too,
 * and the Claude Code boundary does not block reads. A boundary that also
 * blinds the role is a different rule than the one declared above.
 */
export const OPENCODE_EDIT_TOOLS = ['write', 'edit', 'apply_patch'] as const

/** Filename of the generated opencode boundary plugin. */
export const OPENCODE_BOUNDARY_PLUGIN_FILENAME = 'cipher-mux-role-boundary.js'

/**
 * Generate the boundary as an opencode **plugin**, not a hook file.
 *
 * opencode has no PreToolUse configuration. It has plugin modules, and the
 * only one of its events that can stop a call is `tool.execute.before`: the
 * trigger runs before `tool.execute`, so a throw there means the tool never
 * runs. Measured against opencode 1.18.34 on 2026-10-01, in `opencode run`
 * **and** in the TUI under `--auto`:
 *
 *  - The refused call ends as `state.status: "error"` with `state.error` set to
 *    this exact REASON string — so the reason reaches the model verbatim, the
 *    same property the Codex route was chosen for.
 *  - The file was not written. Not "written and reverted" — never created.
 *  - The second call of the same turn, to an allowed path, completed. The throw
 *    is contained per tool call; it does not kill the turn or the session. That
 *    is what makes this selective rather than a blanket lock.
 *  - `--auto` does not bypass it. It auto-replies to permission requests, and
 *    this is not one — which is precisely why the plugin route was taken and
 *    not opencode's `permission` ruleset.
 *
 * Two silent failure modes measured around it, both the reason this is
 * generated and not hand-written:
 *
 *  1. **A CommonJS module is rejected.** `module.exports = fn` fails with
 *     "Plugin export is not a function", visible only under `--print-logs`.
 *     The export has to be an ESM `default` that is a *function* returning the
 *     hook object. Hence the shape below.
 *  2. **The documented `permission.ask` hook never fires.** opencode's own help
 *     text lists it; the binary never triggers it (`trigger("...")` appears for
 *     every other hook name, never for that one). A boundary built on it would
 *     be written and dead.
 */
export function buildOpenCodeBoundaryPlugin(
  denyPathPatterns: readonly string[],
  reason: string,
): string {
  return `// Generated by cipher-mux (entity-boundaries.ts). Do not edit — regenerated on
// every entity start. The rule and its reason are baked in below.
//
// ESM default export of a FUNCTION: opencode rejects a CommonJS module with
// "Plugin export is not a function", and says so only under --print-logs.

const DENY = ${JSON.stringify(denyPathPatterns)}
const REASON = ${JSON.stringify(reason)}
const EDIT_TOOLS = new Set(${JSON.stringify(OPENCODE_EDIT_TOOLS)})

export default async () => ({
  'tool.execute.before': async (input, output) => {
    // Only the file-editing tools. 'read' carries a filePath as well, and
    // blinding the role is not the rule that was declared.
    if (!input || !EDIT_TOOLS.has(input.tool)) return

    const filePath = output && output.args ? output.args.filePath : ''
    if (typeof filePath !== 'string' || !filePath) return

    if (DENY.some(pattern => filePath.includes(pattern))) {
      // The throw is what stops the call. opencode surfaces the message as the
      // tool's error, which is how the reason reaches the model.
      throw new Error(REASON)
    }
  },
})
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
export function buildBoundaryHookSettings(scriptPath: string): BoundaryHookSettings {
  return {
    PreToolUse: [
      {
        matcher: 'Edit|Write|MultiEdit|NotebookEdit',
        hooks: [{ type: 'command', command: `node ${JSON.stringify(scriptPath)}` }],
      },
    ],
  }
}
