import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  OpenCodeAdapter,
  buildOpenCodeMcpEntry,
  mergeOpenCodeConfig,
  toOpenCodePluginSpec,
  OPENCODE_CONFIG_FILENAME,
  OPENCODE_SCHEMA_URL,
  OPENCODE_PLUGIN_SUBDIR,
  OPENCODE_FALLBACK_CONTEXT_WINDOW,
} from '../../src/main/agent/adapters/opencode'
import type { OpenCodeConfigReader } from '../../src/main/agent/adapters/opencode'
import type { AgentAdapter } from '../../src/main/agent/agent-adapter'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { OPENCODE_BOUNDARY_PLUGIN_FILENAME } from '../../src/main/session/entity-boundaries'
import { OPENCODE_USAGE_PLUGIN_FILENAME } from '../../src/main/monitoring/opencode-usage-plugin'

function reader(skipPermissions: boolean): OpenCodeConfigReader {
  return { getSkipPermissions: () => skipPermissions }
}

const baseOpts = { projectPath: '/tmp/proj', sessionName: 'cmux-test' }

const baseCtx = {
  projectPath: '/tmp/proj',
  mcpUrl: 'http://127.0.0.1:3100/mcp',
  mcpApiKey: 'deadbeef',
  sessionId: '01KQ-session',
  workspaceId: 'ws-mux',
  entityId: 'companion',
}

describe('OpenCodeAdapter — Identitaet', () => {
  const adapter = new OpenCodeAdapter(reader(false))

  it('ist tier-2, nicht tier-1', () => {
    assert.equal(adapter.id, 'opencode')
    assert.equal(adapter.displayName, 'opencode')
    // Tier-1 hiesse: jede Capability gemessen. Zwei sind es nicht.
    assert.equal(adapter.tier, 'tier-2')
  })

  it('nennt AGENTS.md, opencode.json und .opencode als Projektmarker', () => {
    assert.deepEqual(adapter.getProjectMarkers(), ['AGENTS.md', 'opencode.json', '.opencode'])
  })
})

describe('OpenCodeAdapter — Startkommando', () => {
  it('uebergibt das Arbeitsverzeichnis NICHT — weder positional noch als Flag', () => {
    // `opencode [project]` nimmt eines entgegen, und der Adapter gab es auch
    // weiter. Die Abnahme gegen die echte CLI zeigte: das Argument zieht die
    // Session aus dem Verzeichnis heraus, in dem postLaunchInjection die
    // opencode.json ablegt — bei einer Entity-Session ist `projectPath` das
    // authored-Verzeichnis, gearbeitet wird im Run-Verzeichnis. Gemessen mit
    // null MCP-Verbindungen als Folge, lautlos. Deshalb wird das cwd des Panes
    // geerbt, wie bei Claude Code.
    const { cmd, args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand(baseOpts)
    assert.equal(cmd, 'opencode')
    assert.ok(!args.includes('/tmp/proj'), `projectPath steht in der Kommandozeile: ${args.join(' ')}`)
    assert.ok(!args.includes('--dir'), '--dir waere derselbe Fehler mit anderem Namen')
  })

  it('laesst --pure weg — das Flag laedt die Session ohne Plugins', () => {
    // Ohne Plugins gibt es keine Rollengrenze und kein Usage. Ein Flag, das
    // beides still abschaltet, gehoert in kein Startkommando des Mux.
    const adapter = new OpenCodeAdapter(reader(true))
    for (const opts of [baseOpts, { ...baseOpts, resume: true }]) {
      assert.ok(!adapter.buildLaunchCommand(opts).args.includes('--pure'))
    }
  })

  it('setzt ohne skipPermissions kein --auto', () => {
    const { args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand(baseOpts)
    assert.ok(!args.includes('--auto'))
  })

  it('setzt mit skipPermissions --auto', () => {
    // Das Gegenstueck zu --dangerously-skip-permissions. Ohne das bleibt eine
    // unbeaufsichtigte Session an der ersten Rueckfrage stehen.
    const { args } = new OpenCodeAdapter(reader(true)).buildLaunchCommand(baseOpts)
    assert.ok(args.includes('--auto'))
  })

  it('resume mit ID wird --session <id>, ohne --fork', () => {
    const { args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      resumeClaudeSessionId: 'abc-123',
    })
    const i = args.indexOf('--session')
    assert.ok(i >= 0, '--session fehlt')
    assert.equal(args[i + 1], 'abc-123')
    assert.ok(!args.includes('--fork'))
  })

  it('resume ohne ID wird --continue, nicht ein nacktes --session', () => {
    const { args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      resume: true,
    })
    assert.ok(args.includes('--continue'))
    assert.ok(!args.includes('--session'))
  })

  it('fork nennt die Sitzung ausdruecklich: --session <id> --fork', () => {
    const { args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      forkFromClaudeSessionId: 'neu',
    })
    const i = args.indexOf('--session')
    assert.ok(i >= 0)
    assert.equal(args[i + 1], 'neu')
    assert.equal(args[i + 2], '--fork')
  })

  it('fork schlaegt resume, wenn beides gesetzt ist', () => {
    const { args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      resumeClaudeSessionId: 'alt',
      forkFromClaudeSessionId: 'neu',
    })
    const i = args.indexOf('--session')
    assert.equal(args[i + 1], 'neu')
    assert.ok(!args.includes('alt'))
    assert.ok(!args.includes('--continue'))
  })

  it('--fork steht nie allein — die CLI nimmt es nur mit --session oder --continue', () => {
    // Das ist die Bedingung aus `opencode --help`. Faellt dieser Test, startet
    // ein Fork gar nicht, und zwar mit einem Nutzungsfehler statt einer Session.
    const adapter = new OpenCodeAdapter(reader(true))
    for (const opts of [
      baseOpts,
      { ...baseOpts, resume: true },
      { ...baseOpts, resumeClaudeSessionId: 'x' },
      { ...baseOpts, forkFromClaudeSessionId: 'y' },
    ]) {
      const { args } = adapter.buildLaunchCommand(opts)
      if (args.includes('--fork')) {
        assert.ok(
          args.includes('--session') || args.includes('--continue'),
          `--fork ohne --session/--continue bei ${JSON.stringify(opts)}`,
        )
      }
    }
  })

  it('reicht das Modell als --model durch', () => {
    const { args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      model: 'anthropic/claude-sonnet-4-5',
    })
    const i = args.indexOf('--model')
    assert.ok(i >= 0)
    assert.equal(args[i + 1], 'anthropic/claude-sonnet-4-5')
  })

  it('gibt niemals einen Shell-String zurueck', () => {
    const { args } = new OpenCodeAdapter(reader(true)).buildLaunchCommand({
      ...baseOpts,
      resume: true,
      model: 'opencode/grok-code',
    })
    assert.ok(Array.isArray(args))
    for (const a of args) assert.equal(typeof a, 'string')
  })
})

describe('OpenCodeAdapter — Capabilities sind gemessen, nicht geraten', () => {
  const adapter = new OpenCodeAdapter(reader(false))

  it('meldet sub-agents als unbewiesen', () => {
    // `false` heisst hier „nicht gemessen", nicht „gibt es nicht": `--agent`
    // allein belegt keine Unteragenten, die der Mux sieht. Ein Gate, das auf
    // einer Vermutung true sagt, laesst den Mux ins Leere greifen.
    assert.equal(adapter.supports('sub-agents'), false)
  })

  it('meldet status-line — der event-Hook eines Plugins traegt die Zahlen', () => {
    // Gemessen: ein Plugin sieht `message.updated` mit sessionID, modelID und
    // tokens. Daraus entsteht dasselbe JSON, das der StatusLineMonitor liest.
    assert.equal(adapter.supports('status-line'), true)
  })

  it('bietet beide Status-Line-Methoden an, weil es die Capability meldet', () => {
    // Der Vertrag erlaubt getContextUsage/attachStatusHook nur, wenn
    // supports('status-line') gilt — und verlangt sie dann auch. Die Capability
    // zu melden und nichts zu liefern waere dasselbe Versprechen auf Umwegen.
    const asContract: AgentAdapter = adapter
    assert.equal(typeof asContract.getContextUsage, 'function')
    assert.equal(typeof asContract.attachStatusHook, 'function')
  })

  it('meldet mcp-injection und companion-mcp als verfuegbar — die Header kamen an', () => {
    assert.equal(adapter.supports('mcp-injection'), true)
    assert.equal(adapter.supports('companion-mcp'), true)
  })

  it('meldet project-instructions und skip-permissions als verfuegbar', () => {
    assert.equal(adapter.supports('project-instructions'), true)
    assert.equal(adapter.supports('skip-permissions'), true)
  })

  it('supports und getCapabilities widersprechen sich nicht', () => {
    const caps = adapter.getCapabilities()
    for (const [feature, value] of Object.entries(caps)) {
      assert.equal(adapter.supports(feature as keyof typeof caps), value, `${feature} weicht ab`)
    }
    assert.equal(Object.keys(caps).length, 7)
  })
})

describe('OpenCodeAdapter — Projektanweisungen', () => {
  let dir: string
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-adapter-')) })
  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('liest AGENTS.md', async () => {
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Regeln\n')
    const res = await new OpenCodeAdapter(reader(false)).readProjectInstructions(dir)
    assert.ok(res)
    assert.equal(res.content, '# Regeln\n')
    assert.equal(res.filePath, path.join(dir, 'AGENTS.md'))
  })

  it('liest NICHT CLAUDE.md', async () => {
    // opencode liest CLAUDE.md zur Vertraeglichkeit mit, aber die Datei, in die
    // der Mux schreibt, muss eindeutig sein — sonst injizieren zwei Adapter in
    // dasselbe Projekt und ueberschreiben sich die Sektionen.
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-adapter-cmd-'))
    fs.writeFileSync(path.join(other, 'CLAUDE.md'), '# Falsch\n')
    const res = await new OpenCodeAdapter(reader(false)).readProjectInstructions(other)
    assert.equal(res, null)
    fs.rmSync(other, { recursive: true, force: true })
  })
})

describe('buildOpenCodeMcpEntry', () => {
  it('traegt alle drei Kopfzeilen', () => {
    const entry = buildOpenCodeMcpEntry('http://x/mcp', 'key123', 'ws-mux', 'companion')
    assert.equal(entry.headers.Authorization, 'Bearer key123')
    assert.equal(entry.headers['X-Mux-Workspace'], 'ws-mux')
    assert.equal(entry.headers['X-Mux-Entity'], 'companion')
  })

  it('nennt den Typ remote und schaltet den Server ausdruecklich ein', () => {
    // opencode sagt `remote`, wo Claude Code `http` sagt, und will ein
    // ausdrueckliches `enabled`.
    const entry = buildOpenCodeMcpEntry('http://x/mcp', 'k', null)
    assert.equal(entry.type, 'remote')
    assert.equal(entry.enabled, true)
    assert.equal(entry.url, 'http://x/mcp')
  })

  it('laesst Workspace- und Rollenkopf weg, wenn es keine Bindung gibt', () => {
    // Ein Client ohne Bindung soll von einem vor dieser Aenderung nicht
    // unterscheidbar sein.
    const entry = buildOpenCodeMcpEntry('http://x/mcp', 'k', null, null)
    assert.ok(!('X-Mux-Workspace' in entry.headers))
    assert.ok(!('X-Mux-Entity' in entry.headers))
    assert.equal(entry.headers.Authorization, 'Bearer k')
  })

  it('nimmt den blanken Schluessel, nicht das gebundene Token', () => {
    // Die Token-Bindung aus mcp/bound-token.ts existiert nur, weil Codex keine
    // Header senden kann. Hier kommen sie an — ein Token mit Zusatz waere also
    // Identitaet und Berechtigung ohne Not vermischt.
    const entry = buildOpenCodeMcpEntry('http://x/mcp', 'abcdef', 'ws-mux', 'companion')
    assert.equal(entry.headers.Authorization, 'Bearer abcdef')
    assert.ok(!entry.headers.Authorization.includes('.'))
  })
})

describe('mergeOpenCodeConfig', () => {
  it('ergaenzt $schema nur, wenn es fehlt', () => {
    const entry = buildOpenCodeMcpEntry('http://x/mcp', 'k', null)
    assert.equal(mergeOpenCodeConfig({}, entry).$schema, OPENCODE_SCHEMA_URL)
    assert.equal(
      mergeOpenCodeConfig({ $schema: './eigenes.json' }, entry).$schema,
      './eigenes.json',
    )
  })

  it('laesst fremde Schluessel und fremde MCP-Server stehen', () => {
    // Die Datei gehoert dem Projekt. Besitz hat der Mux nur an mcp['cipher-mux'].
    const entry = buildOpenCodeMcpEntry('http://x/mcp', 'k', 'ws-mux')
    const merged = mergeOpenCodeConfig(
      {
        theme: 'tokyonight',
        model: 'anthropic/claude-sonnet-4-5',
        mcp: { 'fremder-server': { type: 'local', command: ['./x'] } },
      },
      entry,
    )
    assert.equal(merged.theme, 'tokyonight')
    assert.equal(merged.model, 'anthropic/claude-sonnet-4-5')
    const mcp = merged.mcp as Record<string, unknown>
    assert.ok(mcp['fremder-server'], 'fremder MCP-Server verschwunden')
    assert.deepEqual(mcp['cipher-mux'], entry)
  })

  it('ersetzt einen bestehenden cipher-mux-Eintrag, statt ihn zu mischen', () => {
    // Der Eintrag ist der des Mux, und eine halb alte URL waere schlimmer als
    // eine frische: die Session haengt sonst am Server der letzten Sitzung.
    const entry = buildOpenCodeMcpEntry('http://neu/mcp', 'k2', 'ws-neu')
    const merged = mergeOpenCodeConfig(
      { mcp: { 'cipher-mux': { type: 'remote', url: 'http://alt/mcp', headers: { Authorization: 'Bearer alt' } } } },
      entry,
    )
    assert.deepEqual((merged.mcp as Record<string, unknown>)['cipher-mux'], entry)
  })

  it('setzt mcp neu auf, wenn es dort etwas anderes als ein Objekt war', () => {
    const entry = buildOpenCodeMcpEntry('http://x/mcp', 'k', null)
    for (const broken of [{ mcp: 'kaputt' }, { mcp: ['auch kaputt'] }, { mcp: null }]) {
      const merged = mergeOpenCodeConfig(broken as Record<string, unknown>, entry)
      assert.deepEqual((merged.mcp as Record<string, unknown>)['cipher-mux'], entry)
    }
  })

  it('veraendert das uebergebene Objekt nicht', () => {
    const entry = buildOpenCodeMcpEntry('http://x/mcp', 'k', null)
    const original = { mcp: { fremd: 1 } }
    mergeOpenCodeConfig(original, entry)
    assert.deepEqual(original, { mcp: { fremd: 1 } })
  })
})

describe('OpenCodeAdapter — postLaunchInjection schreibt opencode.json', () => {
  let dir: string
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-inject-')) })
  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  function read(d: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(d, OPENCODE_CONFIG_FILENAME), 'utf-8'))
  }

  it('legt die Datei mit allen drei Kopfzeilen an', async () => {
    await new OpenCodeAdapter(reader(false)).postLaunchInjection({ ...baseCtx, projectPath: dir })
    const cfg = read(dir)
    const server = (cfg.mcp as Record<string, Record<string, unknown>>)['cipher-mux']
    const headers = server.headers as Record<string, string>
    assert.equal(server.type, 'remote')
    assert.equal(server.enabled, true)
    assert.equal(server.url, 'http://127.0.0.1:3100/mcp')
    assert.equal(headers.Authorization, 'Bearer deadbeef')
    assert.equal(headers['X-Mux-Workspace'], 'ws-mux')
    assert.equal(headers['X-Mux-Entity'], 'companion')
  })

  it('verweist nicht auf die Token-Umgebungsvariable — das ist der Codex-Weg', () => {
    const raw = fs.readFileSync(path.join(dir, OPENCODE_CONFIG_FILENAME), 'utf-8')
    assert.ok(!raw.includes('CIPHER_MUX_MCP_TOKEN'))
  })

  it('zerstoert bestehende Schluessel nicht', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-inject-keep-'))
    fs.writeFileSync(
      path.join(d, OPENCODE_CONFIG_FILENAME),
      JSON.stringify({
        $schema: './lokal.json',
        theme: 'tokyonight',
        mcp: { fremd: { type: 'local', command: ['./x'], enabled: true } },
      }),
      'utf-8',
    )

    await new OpenCodeAdapter(reader(false)).postLaunchInjection({ ...baseCtx, projectPath: d })

    const cfg = read(d)
    assert.equal(cfg.$schema, './lokal.json')
    assert.equal(cfg.theme, 'tokyonight')
    const mcp = cfg.mcp as Record<string, unknown>
    assert.ok(mcp.fremd, 'fremder MCP-Server wurde ueberschrieben')
    assert.ok(mcp['cipher-mux'])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('laesst die Workspace- und Rollenkopfzeilen weg, wenn die Session ungebunden ist', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-inject-unbound-'))
    await new OpenCodeAdapter(reader(false)).postLaunchInjection({
      ...baseCtx,
      projectPath: d,
      workspaceId: null,
      entityId: null,
    })
    const server = (read(d).mcp as Record<string, Record<string, unknown>>)['cipher-mux']
    const headers = server.headers as Record<string, string>
    assert.deepEqual(Object.keys(headers), ['Authorization'])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('faengt eine unlesbare Bestandsdatei ab und schreibt trotzdem', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-inject-broken-'))
    fs.writeFileSync(path.join(d, OPENCODE_CONFIG_FILENAME), '{ das ist kein json', 'utf-8')
    await new OpenCodeAdapter(reader(false)).postLaunchInjection({ ...baseCtx, projectPath: d })
    assert.ok((read(d).mcp as Record<string, unknown>)['cipher-mux'])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('wirft nicht, wenn das Projektverzeichnis nicht existiert', async () => {
    // postLaunchInjection haengt an der Session-Init-Kette; ein Wurf dort kostet
    // still den gesamten Restore.
    await new OpenCodeAdapter(reader(false)).postLaunchInjection({
      ...baseCtx,
      projectPath: '/gibt/es/nicht/wirklich',
    })
  })
})

describe('mergeOpenCodeConfig — das plugin-Feld', () => {
  const entry = buildOpenCodeMcpEntry('http://x/mcp', 'k', null)

  it('laesst fremde Plugin-Eintraege stehen und haengt die eigenen an', () => {
    const merged = mergeOpenCodeConfig(
      { plugin: ['opencode-gemini-auth', './eigenes.ts'] },
      entry,
      ['file:///r/.opencode/plugin/cipher-mux-usage.js'],
    )
    assert.deepEqual(merged.plugin, [
      'opencode-gemini-auth',
      './eigenes.ts',
      'file:///r/.opencode/plugin/cipher-mux-usage.js',
    ])
  })

  it('raeumt eigene Eintraege aus, bevor es neu schreibt — kein Zuwachs bei jedem Start', () => {
    let cfg: Record<string, unknown> = {}
    for (let i = 0; i < 3; i++) {
      cfg = mergeOpenCodeConfig(cfg, entry, [
        `file:///r/${OPENCODE_PLUGIN_SUBDIR}/${OPENCODE_USAGE_PLUGIN_FILENAME}`,
        `file:///r/${OPENCODE_PLUGIN_SUBDIR}/${OPENCODE_BOUNDARY_PLUGIN_FILENAME}`,
      ])
    }
    assert.equal((cfg.plugin as string[]).length, 2)
  })

  it('entfernt den Grenzen-Eintrag, wenn die Rolle ihre Grenze verliert', () => {
    // Ein stehengebliebener Eintrag erzwingt weiter eine Regel, die niemand mehr
    // erklaert. Dasselbe Verhalten wie beim Claude-Code-Hook im SessionManager.
    const vorher = mergeOpenCodeConfig({}, entry, [
      `file:///r/${OPENCODE_USAGE_PLUGIN_FILENAME}`,
      `file:///r/${OPENCODE_BOUNDARY_PLUGIN_FILENAME}`,
    ])
    const nachher = mergeOpenCodeConfig(vorher, entry, [
      `file:///r/${OPENCODE_USAGE_PLUGIN_FILENAME}`,
    ])
    assert.deepEqual(nachher.plugin, [`file:///r/${OPENCODE_USAGE_PLUGIN_FILENAME}`])
  })

  it('hinterlaesst kein leeres plugin-Feld, wo das Projekt keines hatte', () => {
    const merged = mergeOpenCodeConfig({}, entry, [])
    assert.ok(!('plugin' in merged))
  })

  it('ueberlebt ein plugin-Feld, das kein Array ist', () => {
    const merged = mergeOpenCodeConfig({ plugin: 'kaputt' }, entry, ['file:///r/a.js'])
    assert.deepEqual(merged.plugin, ['file:///r/a.js'])
  })
})

describe('toOpenCodePluginSpec', () => {
  it('macht eine file://-URL aus dem absoluten Pfad', () => {
    // Gemessen: diese Form laedt ein Plugin auch ausserhalb von
    // .opencode/plugin/. Ein relativer Pfad gilt laut Doku „relative to the
    // declaring config" — eine Annahme mehr als noetig.
    assert.equal(toOpenCodePluginSpec('/r/a.js'), 'file:///r/a.js')
  })
})

describe('OpenCodeAdapter — Plugins im Run-Verzeichnis', () => {
  let dir: string
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-plugins-')) })
  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  const pluginDir = (): string => path.join(dir, OPENCODE_PLUGIN_SUBDIR)

  it('legt beide Plugins an, wenn die Rolle eine Grenze hat', async () => {
    await new OpenCodeAdapter(reader(true)).postLaunchInjection({
      ...baseCtx,
      projectPath: dir,
      entityId: 'workshop',
    })
    const files = fs.readdirSync(pluginDir()).sort()
    assert.deepEqual(files, [OPENCODE_BOUNDARY_PLUGIN_FILENAME, OPENCODE_USAGE_PLUGIN_FILENAME].sort())
  })

  it('traegt beide in opencode.json ein, als file://-URL', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, OPENCODE_CONFIG_FILENAME), 'utf-8'))
    const specs = cfg.plugin as string[]
    assert.equal(specs.length, 2)
    for (const spec of specs) assert.ok(spec.startsWith('file:///'), spec)
    assert.ok(specs.some(s => s.endsWith(OPENCODE_BOUNDARY_PLUGIN_FILENAME)))
    assert.ok(specs.some(s => s.endsWith(OPENCODE_USAGE_PLUGIN_FILENAME)))
  })

  it('schreibt das Grenzen-Plugin als ESM-Default-Export einer Funktion', () => {
    // CommonJS weist opencode mit „Plugin export is not a function" ab, und
    // zwar nur unter --print-logs. Faellt dieser Test, ist die Grenze
    // geschrieben und laedt nicht.
    const src = fs.readFileSync(path.join(pluginDir(), OPENCODE_BOUNDARY_PLUGIN_FILENAME), 'utf-8')
    assert.ok(src.includes('export default async () =>'), 'kein ESM-Default-Export einer Funktion')
    assert.ok(!src.includes('module.exports'))
    assert.ok(src.includes("'tool.execute.before'"))
    // Die Begruendung der Rolle muss wortwoertlich drinstehen — sie ist es, die
    // beim Modell ankommt.
    assert.ok(src.includes('Du bist kein Coder'), 'Begruendung aus entity-boundaries.ts fehlt')
  })

  it('nennt nur die schreibenden Werkzeuge, nicht read', () => {
    // read traegt ebenfalls einen filePath. Eine Grenze, die auch Lesen
    // blockiert, ist eine andere Regel als die erklaerte.
    const src = fs.readFileSync(path.join(pluginDir(), OPENCODE_BOUNDARY_PLUGIN_FILENAME), 'utf-8')
    const tools = JSON.parse(src.match(/new Set\((\[[^\]]*\])\)/)![1]) as string[]
    assert.deepEqual(tools.sort(), ['apply_patch', 'edit', 'write'])
  })

  it('schreibt kein Grenzen-Plugin fuer eine Rolle ohne Grenze und raeumt ein altes weg', async () => {
    // Cyber Factory schreibt Code; sie zu beschraenken waere, den Punkt der
    // Rolle zu beschraenken.
    await new OpenCodeAdapter(reader(true)).postLaunchInjection({
      ...baseCtx,
      projectPath: dir,
      entityId: 'cyber-factory',
    })
    assert.ok(!fs.existsSync(path.join(pluginDir(), OPENCODE_BOUNDARY_PLUGIN_FILENAME)))
    assert.ok(fs.existsSync(path.join(pluginDir(), OPENCODE_USAGE_PLUGIN_FILENAME)))
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, OPENCODE_CONFIG_FILENAME), 'utf-8'))
    assert.deepEqual(
      (cfg.plugin as string[]).filter(s => s.endsWith(OPENCODE_BOUNDARY_PLUGIN_FILENAME)),
      [],
    )
  })

  it('schreibt das Usage-Plugin auch ohne Rolle', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-plugins-norole-'))
    await new OpenCodeAdapter(reader(true)).postLaunchInjection({
      ...baseCtx,
      projectPath: d,
      entityId: null,
    })
    const files = fs.readdirSync(path.join(d, OPENCODE_PLUGIN_SUBDIR))
    assert.deepEqual(files, [OPENCODE_USAGE_PLUGIN_FILENAME])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('attachStatusHook legt das Usage-Plugin allein', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-attach-'))
    await new OpenCodeAdapter(reader(true)).attachStatusHook(d)
    assert.ok(fs.existsSync(path.join(d, OPENCODE_PLUGIN_SUBDIR, OPENCODE_USAGE_PLUGIN_FILENAME)))
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('OpenCodeAdapter — getContextUsage', () => {
  it('gibt null zurueck, wenn es keine Messung gibt', async () => {
    // Keine Zahl ist besser als eine erfundene.
    const res = await new OpenCodeAdapter(reader(false)).getContextUsage('gibt-es-nicht-01')
    assert.equal(res, null)
  })

  it('benennt das Rueckfall-Kontextfenster, statt es zu verstecken', () => {
    // Der Wert ist eine Schaetzung: /api/model eines laufenden opencode liefert
    // ohne angemeldeten Anbieter eine leere Liste. Die Tokenzahlen sind gemessen.
    assert.equal(typeof OPENCODE_FALLBACK_CONTEXT_WINDOW, 'number')
    assert.ok(OPENCODE_FALLBACK_CONTEXT_WINDOW > 0)
  })
})

describe('AdapterRegistry mit drei Adaptern', () => {
  it('kennt opencode neben codex und claude-code', () => {
    const ids = new AdapterRegistry().listIds()
    assert.ok(ids.includes('opencode'))
    assert.ok(ids.includes('codex'))
    assert.ok(ids.includes('claude-code'))
  })

  it('bleibt bei claude-code als Default', () => {
    // Der Wechsel ist eine Entscheidung des Nutzers, keine Vorgabe des Codes.
    assert.equal(new AdapterRegistry().getDefault().id, 'claude-code')
  })

  it('setDefault schaltet auf opencode und wieder zurueck', () => {
    const reg = new AdapterRegistry()
    reg.setDefault('opencode')
    assert.equal(reg.getDefault().id, 'opencode')
    reg.setDefault('claude-code')
    assert.equal(reg.getDefault().id, 'claude-code')
  })
})
