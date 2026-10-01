/**
 * Rollengrenzen fuer Codex — dieselbe Regel, ein anderer Pfadbegriff.
 *
 * Die Grenzen selbst stehen in `session/entity-boundaries.ts` und gelten
 * unveraendert: welche Rolle wo nicht schreiben darf, und warum. Was sich
 * unterscheidet, ist die Frage **wo im Hook-Input der Pfad steht**.
 *
 * Claude Code liefert `tool_input.file_path`. Codex liefert das nicht. Gemessen
 * an codex-cli 0.155.1 am 2026-10-01: sein Datei-Werkzeug heisst `apply_patch`,
 * und der Input sieht so aus —
 *
 * ```json
 * { "command": "*** Begin Patch\n*** Add File: /abs/pfad.txt\n+hallo\n*** End Patch" }
 * ```
 *
 * Kein `file_path`, nirgends. Der Pfad steckt in einem Patch-Umschlag innerhalb
 * von `command`. Das generische Skript aus `entity-boundaries.ts` haette hier
 * einen leeren String gelesen, `denied = false` gerechnet und **jeden**
 * Dateizugriff durchgelassen — eine Grenze, die geschrieben ist und nicht
 * greift, also genau das, was dieser Adapter an drei anderen Stellen vermeidet.
 *
 * **Was dieser Weg nicht abdeckt.** `Bash` traegt keinen Pfad, nur ein
 * Kommando. Eine Datei laesst sich damit weiterhin ueber die Shell aendern.
 * Dieselbe Luecke hat Claude Code, und sie wird hier nicht geschlossen: einen
 * Shell-Befehl auf verbotene Pfade zu pruefen hiesse, Shell-Syntax zu parsen,
 * und ein halbherziger Parser waere wieder eine Grenze, die nur so aussieht.
 * Die Grenze ist eine Leitplanke gegen Versehen, kein Sandkasten.
 */

import * as fs from 'fs'
import * as path from 'path'

/** Wie das erzeugte Skript im Run-Verzeichnis heisst. */
export const CODEX_BOUNDARY_FILENAME = 'cipher-mux-codex-boundary.js'

/**
 * Zieht alle Pfade aus einem Codex-Werkzeugaufruf.
 *
 * Drei Quellen, in dieser Reihenfolge der Wahrscheinlichkeit:
 *  1. `tool_input.file_path` — falls Codex es doch einmal liefert. Kostet
 *     nichts und faengt eine zukuenftige Aenderung ab.
 *  2. Der `apply_patch`-Umschlag in `tool_input.command`: `*** Add File:`,
 *     `*** Update File:`, `*** Delete File:` und `*** Move to:`. Alle vier,
 *     denn ein Verschieben **aus** einem geschuetzten Verzeichnis heraus ist
 *     genauso eine Aenderung daran wie ein Schreiben hinein.
 *  3. `tool_input.path` — die andere gelaeufige Schreibweise.
 *
 * Gibt eine Liste zurueck, keinen einzelnen Pfad: ein Patch darf mehrere
 * Dateien anfassen, und **eine** verbotene darunter verbietet den ganzen
 * Aufruf. Ein Patch teilweise anzuwenden gibt es nicht.
 */
export function extractCodexPaths(toolInput: unknown): string[] {
  if (!toolInput || typeof toolInput !== 'object') return []
  const input = toolInput as Record<string, unknown>
  const out: string[] = []

  for (const key of ['file_path', 'path']) {
    const v = input[key]
    if (typeof v === 'string' && v.trim() !== '') out.push(v.trim())
  }

  const command = input.command
  if (typeof command === 'string' && command.includes('*** ')) {
    // Zeilenweise statt mit einem Regex ueber den ganzen Text: ein Patchrumpf
    // darf alles enthalten, auch Zeilen, die wie ein Kopf aussehen. Nur eine
    // Zeile, die mit dem Marker **beginnt**, ist einer.
    for (const line of command.split('\n')) {
      const m = /^\*\*\* (?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/.exec(line)
      if (m && m[1]) out.push(m[1])
    }
  }

  return out
}

/**
 * Baut das abhaengigkeitsfreie Hook-Skript.
 *
 * Abhaengigkeitsfrei, weil es im Run-Verzeichnis liegt und dort kein
 * `node_modules` steht. Regeln und Begruendung werden per `JSON.stringify`
 * eingesetzt, nicht in ein Template geklebt — ein Anfuehrungszeichen in der
 * Begruendung wuerde sonst aus generiertem Text generierten Code machen.
 *
 * Bei unlesbarem Input wird **durchgelassen**. Ein Hook, der bei einem
 * Formatwechsel der CLI alles blockiert, legt die Rolle lahm; einer, der
 * durchlaesst, verliert eine Leitplanke. Das zweite ist das kleinere Uebel —
 * und es faellt frueher auf, weil die Arbeit weitergeht.
 */
export function buildCodexBoundaryScript(
  denyPathPatterns: readonly string[],
  reason: string,
): string {
  return `#!/usr/bin/env node
// Auto-generiert von cipher-mux (codex-boundary.ts). Nicht editieren — wird bei
// jedem Sessionstart neu geschrieben. Regel und Begruendung stehen unten.
'use strict'

const DENY = ${JSON.stringify(denyPathPatterns)}
const REASON = ${JSON.stringify(reason)}

/** Siehe extractCodexPaths in codex-boundary.ts — hier bewusst dupliziert, weil
 *  dieses Skript keine Importe haben darf. Der Test prueft beide gegeneinander. */
function extractPaths(input) {
  if (!input || typeof input !== 'object') return []
  const out = []
  for (const key of ['file_path', 'path']) {
    const v = input[key]
    if (typeof v === 'string' && v.trim() !== '') out.push(v.trim())
  }
  const command = input.command
  if (typeof command === 'string' && command.indexOf('*** ') !== -1) {
    const lines = command.split('\\n')
    for (let i = 0; i < lines.length; i++) {
      const m = /^\\*\\*\\* (?:Add File|Update File|Delete File|Move to):\\s*(.+?)\\s*$/.exec(lines[i])
      if (m && m[1]) out.push(m[1])
    }
  }
  return out
}

let raw = ''
process.stdin.on('data', chunk => { raw += chunk })
process.stdin.on('end', () => {
  let paths = []
  try {
    const input = JSON.parse(raw)
    paths = extractPaths(input && input.tool_input)
  } catch {
    // Unlesbarer Input ist kein Grund, Arbeit zu blockieren.
  }

  // Eine verbotene Datei verbietet den ganzen Aufruf: ein Patch laesst sich
  // nicht zur Haelfte anwenden.
  const denied = paths.some(p => DENY.some(pattern => p.indexOf(pattern) !== -1))

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

/** Schreibt das Skript ins Projekt und gibt seinen Pfad zurueck. */
export function writeCodexBoundaryScript(
  projectPath: string,
  denyPathPatterns: readonly string[],
  reason: string,
): string {
  const scriptPath = path.join(projectPath, CODEX_BOUNDARY_FILENAME)
  fs.writeFileSync(scriptPath, buildCodexBoundaryScript(denyPathPatterns, reason), {
    encoding: 'utf-8',
    mode: 0o755,
  })
  return scriptPath
}
