#!/usr/bin/env node
// Schreibt docs/mcp-tools.md als Modul, das der Companion als ref/mcp-tools.md bekommt.
// Eine Quelle statt zwei Abschriften: bis 2026-10-10 pflegte der Companion eine
// eigene Fassung, und in der fehlten 33 von 68 Werkzeugen, sechs mit falschen
// Parameternamen. test/main/companion-mcp-ref.test.ts schlaegt an, wenn die
// beiden auseinanderlaufen — dann dieses Skript ausfuehren.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const doc = readFileSync(join(root, 'docs/mcp-tools.md'), 'utf-8')
const out = `// Generiert von scripts/gen-companion-mcp-ref.mjs aus docs/mcp-tools.md — nicht von Hand aendern.
// npm run gen:companion-ref
export const REF_MCP_TOOLS = ${JSON.stringify(doc)}
`
writeFileSync(join(root, 'src/main/entity-content/companion-mcp-ref.generated.ts'), out, 'utf-8')
console.log('companion-mcp-ref.generated.ts geschrieben')
