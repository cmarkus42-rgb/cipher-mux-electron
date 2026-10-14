import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  OpenCodeAdapter,
  buildOpenCodeMcpEntry,
  mergeOpenCodeConfig,
  OPENCODE_CONFIG_FILENAME,
  OPENCODE_SCHEMA_URL,
  OPENCODE_PLUGIN_SUBDIR,
  OPENCODE_LEGACY_PLUGIN_SUBDIR,
  OPENCODE_MODEL_MARKER_FILE,
  OPENCODE_FALLBACK_CONTEXT_WINDOW,
} from '../../src/main/agent/adapters/opencode'
import type { OpenCodeConfigReader } from '../../src/main/agent/adapters/opencode'
import type { AgentAdapter } from '../../src/main/agent/agent-adapter'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { OPENCODE_BOUNDARY_PLUGIN_FILENAME } from '../../src/main/session/entity-boundaries'
import { OPENCODE_USAGE_PLUGIN_FILENAME } from '../../src/main/monitoring/opencode-usage-plugin'
import { IDLE_PLUGIN_FILENAME } from '../../src/main/local-factory/worker-done'

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

describe('OpenCodeAdapter — Startkommando (opencode 2)', () => {
  it('uebergibt das Arbeitsverzeichnis NICHT — weder positional noch als Flag', () => {
    // `opencode [directory]` nimmt eines entgegen, und der Adapter gab es auch
    // weiter. Die Abnahme gegen die echte CLI (1.18.34) zeigte: das Argument zieht
    // die Session aus dem Verzeichnis heraus, in dem postLaunchInjection die
    // opencode.json ablegt — bei einer Entity-Session ist `projectPath` das
    // authored-Verzeichnis, gearbeitet wird im Run-Verzeichnis. Gemessen mit
    // null MCP-Verbindungen als Folge, lautlos. Deshalb wird das cwd des Panes
    // geerbt, wie bei Claude Code.
    const { cmd, args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand(baseOpts)
    assert.equal(cmd, 'opencode')
    assert.ok(!args.includes('/tmp/proj'), `projectPath steht in der Kommandozeile: ${args.join(' ')}`)
    assert.ok(!args.includes('--dir'), '--dir waere derselbe Fehler mit anderem Namen')
  })

  it('startet mit --standalone — sonst gehoert das Plugin dem geteilten Dienst', () => {
    // Gemessen an 2.0.29: ein V2-Plugin laeuft im Server. Im geteilten
    // Hintergrunddienst las es als CIPHER_MUX_SESSION_ID die ID der Session, die
    // den Dienst gestartet hat, und sah die Ereignisse aller Verzeichnisse. Jede
    // opencode-Mux-Session haette in die Datei einer fremden geschrieben.
    // Unter --standalone ist der Server ein Kind der CLI und erbt die Umgebung.
    const adapter = new OpenCodeAdapter(reader(false))
    for (const opts of [
      baseOpts,
      { ...baseOpts, resume: true },
      { ...baseOpts, resumeClaudeSessionId: 'abc' },
    ]) {
      assert.ok(adapter.buildLaunchCommand(opts).args.includes('--standalone'), JSON.stringify(opts))
    }
  })

  it('kennt nur Flags, die das Top-Level-opencode 2.0.29 wirklich hat', () => {
    // Gemessen: ein unbekanntes Flag (`--model`, `--fork`, `--pure`, `--bogus`)
    // wird NICHT gemeldet — die CLI druckt die Hilfe und beendet sich, die Session
    // steht im Pane als Shell. Diese Liste ist der Wachposten dagegen.
    const ALLOWED = new Set(['--standalone', '--auto', '--continue', '--session'])
    const adapter = new OpenCodeAdapter(reader(true))
    for (const opts of [
      baseOpts,
      { ...baseOpts, resume: true },
      { ...baseOpts, resumeClaudeSessionId: 'abc-123' },
      { ...baseOpts, model: 'anthropic/claude-sonnet-4-5' },
      { ...baseOpts, entityId: 'local-worker', workDir: '/tmp/proj' },
    ]) {
      for (const a of adapter.buildLaunchCommand(opts).args) {
        if (a.startsWith('-')) assert.ok(ALLOWED.has(a), `unbekanntes Flag ${a} bei ${JSON.stringify(opts)}`)
      }
    }
  })

  it('laesst --pure weg — das Flag gibt es nicht mehr', () => {
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

  it('resume mit ID wird --session <id>', () => {
    const { args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      resumeClaudeSessionId: 'abc-123',
    })
    const i = args.indexOf('--session')
    assert.ok(i >= 0, '--session fehlt')
    assert.equal(args[i + 1], 'abc-123')
  })

  it('resume ohne ID wird --continue, nicht ein nacktes --session', () => {
    const { args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      resume: true,
    })
    assert.ok(args.includes('--continue'))
    assert.ok(!args.includes('--session'))
  })

  describe('Fork', () => {
    // Das Top-Level-opencode 2.0.29 hat KEIN --fork (nur `opencode run`), und
    // `opencode session` kennt kein `fork`. Der Weg ueber die API
    // (POST /api/session/{id}/fork) ist ungemessen. Ein Wurf waere falsch:
    // SessionManager.start() ruft buildLaunchCommand erst NACH tmux.createSession
    // und sessions.set — ein Wurf hinterliesse eine registrierte, leere Session.
    // Und ein stilles --continue/--session wuerde die QUELLE fortsetzen statt sie
    // zu verzweigen. Deshalb: eine sichtbare Zeile im Pane, sonst nichts.
    const adapter = new OpenCodeAdapter(reader(true))
    const fork = [
      { ...baseOpts, forkFromClaudeSessionId: 'quelle' },
      { ...baseOpts, forkLatest: true },
      { ...baseOpts, forkLatest: true, resume: true },
      { ...baseOpts, forkFromClaudeSessionId: 'quelle', resumeClaudeSessionId: 'alt' },
    ]

    it('wirft nicht', () => {
      for (const opts of fork) adapter.buildLaunchCommand(opts)
    })

    it('startet opencode NICHT — weder mit --fork noch als Fortsetzung der Quelle', () => {
      for (const opts of fork) {
        const { cmd, args } = adapter.buildLaunchCommand(opts)
        assert.notEqual(cmd, 'opencode', `startet opencode bei ${JSON.stringify(opts)}`)
        for (const flag of ['--fork', '--continue', '--session']) {
          assert.ok(!args.includes(flag), `${flag} bei ${JSON.stringify(opts)}`)
        }
      }
    })

    it('sagt im Pane, was los ist — und ist als Shell-Zeile ungefaehrlich', () => {
      const { cmd, args } = adapter.buildLaunchCommand(fork[0])
      // SessionManager fuegt cmd + args mit Leerzeichen zu EINER Shell-Zeile.
      const line = [cmd, ...args].join(' ')
      assert.match(line, /fork/i)
      assert.match(line, /opencode/i)
      assert.ok(!/[;&|`$<>(){}'"\\*?~#]/.test(line), `Sonderzeichen in ${line}`)
    })
  })

  it('reicht ein Modell NICHT als Flag durch — es gibt kein --model (siehe postLaunchInjection)', () => {
    const { args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      model: 'anthropic/claude-sonnet-4-5',
    })
    assert.ok(!args.includes('--model'))
    assert.ok(!args.includes('anthropic/claude-sonnet-4-5'))
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

describe('mergeOpenCodeConfig — Alteintraege im plugin-Feld', () => {
  const entry = buildOpenCodeMcpEntry('http://x/mcp', 'k', null)
  const V1_USAGE = `file:///r/.opencode/plugin/${OPENCODE_USAGE_PLUGIN_FILENAME}`
  const V1_BOUNDARY = `file:///r/.opencode/plugin/${OPENCODE_BOUNDARY_PLUGIN_FILENAME}`

  it('entfernt die eigenen V1-Eintraege und laesst fremde stehen', () => {
    // Ein stehengebliebener Eintrag auf eine V1-Datei erzeugt bei JEDEM Start
    // eine WARN-Zeile („failed to load plugin"); und ein Grenzen-Eintrag erzwaenge
    // weiter eine Regel, die niemand mehr erklaert.
    const merged = mergeOpenCodeConfig(
      { plugin: ['opencode-gemini-auth', V1_USAGE, './eigenes.ts', V1_BOUNDARY] },
      entry,
    )
    assert.deepEqual(merged.plugin, ['opencode-gemini-auth', './eigenes.ts'])
  })

  it('raeumt auch das plugins-Feld der V2-Form (String oder Objekt) auf', () => {
    const merged = mergeOpenCodeConfig(
      {
        plugins: [
          '@acme/opencode-plugin',
          V1_USAGE,
          { package: V1_BOUNDARY, options: {} },
          { package: './eigenes', options: { x: 1 } },
        ],
      },
      entry,
    )
    assert.deepEqual(merged.plugins, ['@acme/opencode-plugin', { package: './eigenes', options: { x: 1 } }])
  })

  it('traegt selbst NIE einen Plugin-Eintrag ein — die Auto-Entdeckung traegt', () => {
    // Gemessen an 2.0.29: .opencode/plugins/ wird ohne Eintrag geladen. Ob
    // Auto-Entdeckung plus Eintrag in V2 doppelt laedt, ist ungemessen.
    const merged = mergeOpenCodeConfig({}, entry)
    assert.ok(!('plugin' in merged) && !('plugins' in merged))
  })

  it('hinterlaesst kein leeres Feld, wenn nur eigene Eintraege dort standen', () => {
    const merged = mergeOpenCodeConfig({ plugin: [V1_USAGE, V1_BOUNDARY] }, entry)
    assert.ok(!('plugin' in merged))
  })

  it('ueberlebt ein plugin-Feld, das kein Array ist, und fasst es nicht an', () => {
    const merged = mergeOpenCodeConfig({ plugin: 'kaputt' }, entry)
    assert.equal(merged.plugin, 'kaputt')
  })

  it('erkennt auch den Idle-Eintrag des lokalen Workers als eigen', () => {
    const merged = mergeOpenCodeConfig({ plugin: [`file:///r/.opencode/plugin/${IDLE_PLUGIN_FILENAME}`] }, entry)
    assert.ok(!('plugin' in merged))
  })
})

describe('OpenCodeAdapter — Plugins im Run-Verzeichnis', () => {
  let dir: string
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-plugins-')) })
  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  const pluginDir = (d = dir): string => path.join(d, OPENCODE_PLUGIN_SUBDIR)

  it('liegen in .opencode/plugins/ — dem Verzeichnis, das die Doku fuer V2 nennt', () => {
    assert.equal(OPENCODE_PLUGIN_SUBDIR, path.join('.opencode', 'plugins'))
    assert.equal(OPENCODE_LEGACY_PLUGIN_SUBDIR, path.join('.opencode', 'plugin'))
  })

  it('legt beide Plugins an, wenn die Rolle eine Grenze hat', async () => {
    await new OpenCodeAdapter(reader(true)).postLaunchInjection({
      ...baseCtx,
      projectPath: dir,
      entityId: 'workshop',
    })
    const files = fs.readdirSync(pluginDir()).sort()
    assert.deepEqual(files, [OPENCODE_BOUNDARY_PLUGIN_FILENAME, OPENCODE_USAGE_PLUGIN_FILENAME].sort())
  })

  it('tragen KEINEN Eintrag in opencode.json ein', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, OPENCODE_CONFIG_FILENAME), 'utf-8'))
    assert.ok(!('plugin' in cfg) && !('plugins' in cfg))
  })

  it('schreibt das Grenzen-Plugin als ESM-Default-Export eines Objekts mit id und setup', () => {
    // Ein V1-Plugin (eine Funktion) weist opencode 2 ab, und zwar nur im WARN-Log.
    // Faellt dieser Test, ist die Grenze geschrieben und laedt nicht.
    const src = fs.readFileSync(path.join(pluginDir(), OPENCODE_BOUNDARY_PLUGIN_FILENAME), 'utf-8')
    assert.ok(/export default \{/.test(src), 'kein ESM-Default-Export eines Objekts')
    assert.ok(!src.includes('export default async () =>'), 'V1-Form')
    assert.ok(!src.includes('module.exports'))
    assert.ok(src.includes("'execute.before'"))
    // Die Begruendung der Rolle muss wortwoertlich drinstehen — sie ist es, die
    // beim Modell ankommt.
    assert.ok(src.includes('Du bist kein Coder'), 'Begruendung aus entity-boundaries.ts fehlt')
  })

  it('nennt nur die schreibenden Werkzeuge, nicht read', () => {
    // read traegt ebenfalls einen Pfad. Eine Grenze, die auch Lesen blockiert,
    // ist eine andere Regel als die erklaerte.
    const src = fs.readFileSync(path.join(pluginDir(), OPENCODE_BOUNDARY_PLUGIN_FILENAME), 'utf-8')
    const tools = JSON.parse(src.match(/new Set\((\[[^\]]*\])\)/)![1]) as string[]
    assert.deepEqual(tools.sort(), ['apply_patch', 'edit', 'patch', 'write'])
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
  })

  it('schreibt das Usage-Plugin auch ohne Rolle', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-plugins-norole-'))
    await new OpenCodeAdapter(reader(true)).postLaunchInjection({
      ...baseCtx,
      projectPath: d,
      entityId: null,
    })
    const files = fs.readdirSync(pluginDir(d))
    assert.deepEqual(files, [OPENCODE_USAGE_PLUGIN_FILENAME])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('attachStatusHook legt das Usage-Plugin allein', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-attach-'))
    await new OpenCodeAdapter(reader(true)).attachStatusHook(d)
    assert.ok(fs.existsSync(path.join(pluginDir(d), OPENCODE_USAGE_PLUGIN_FILENAME)))
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('das Usage-Plugin fragt das Kontextfenster beim Modell ab; der Profilwert des lokalen Workers nicht', async () => {
    const src = (d: string) => fs.readFileSync(path.join(pluginDir(d), OPENCODE_USAGE_PLUGIN_FILENAME), 'utf-8')

    const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-win-'))
    await new OpenCodeAdapter(reader(true)).postLaunchInjection({ ...baseCtx, projectPath: d1, entityId: 'companion' })
    assert.match(src(d1), /const LOOKUP_MODEL_LIMIT = true/)
    assert.match(src(d1), new RegExp(`const CONTEXT_WINDOW = ${OPENCODE_FALLBACK_CONTEXT_WINDOW}\\b`))

    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-win-lw-'))
    const lw = { baseUrl: 'http://h/v1', model: 'qwen', contextWindow: 65536, maxOutputTokens: 4096 }
    await new OpenCodeAdapter({ getSkipPermissions: () => true, getLocalWorker: () => lw })
      .postLaunchInjection({ ...baseCtx, projectPath: d2, entityId: 'local-worker' })
    assert.match(src(d2), /const LOOKUP_MODEL_LIMIT = false/)
    assert.match(src(d2), /const CONTEXT_WINDOW = 65536\b/)
    fs.rmSync(d1, { recursive: true, force: true })
    fs.rmSync(d2, { recursive: true, force: true })
  })

  describe('Altlasten aus opencode 1.x', () => {
    // Die V1-Plugins liegen in .opencode/plugin/ und stehen im plugin-Feld. 2.0.29
    // weist sie ab (WARN) — und ein altes Grenzen-Plugin dort wuerde nie mehr
    // laufen, aber weiter so aussehen, als schuetze es.
    it('loescht die eigenen Dateien aus .opencode/plugin/, laesst fremde stehen, und raeumt den Eintrag', async () => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-legacy-'))
      const legacy = path.join(d, OPENCODE_LEGACY_PLUGIN_SUBDIR)
      fs.mkdirSync(legacy, { recursive: true })
      for (const f of [OPENCODE_USAGE_PLUGIN_FILENAME, OPENCODE_BOUNDARY_PLUGIN_FILENAME, IDLE_PLUGIN_FILENAME, 'eigenes.ts']) {
        fs.writeFileSync(path.join(legacy, f), '// alt\n')
      }
      fs.writeFileSync(
        path.join(d, OPENCODE_CONFIG_FILENAME),
        JSON.stringify({ plugin: [`file://${path.join(legacy, OPENCODE_USAGE_PLUGIN_FILENAME)}`, './fremd.ts'] }),
      )

      await new OpenCodeAdapter(reader(true)).postLaunchInjection({ ...baseCtx, projectPath: d, entityId: 'workshop' })

      assert.deepEqual(fs.readdirSync(legacy), ['eigenes.ts'])
      const cfg = JSON.parse(fs.readFileSync(path.join(d, OPENCODE_CONFIG_FILENAME), 'utf-8'))
      assert.deepEqual(cfg.plugin, ['./fremd.ts'])
      fs.rmSync(d, { recursive: true, force: true })
    })

    it('raeumt ein leeres Altverzeichnis nicht weg, wenn dort noch etwas anderes liegt — und wirft nicht, wenn es fehlt', async () => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-legacy-none-'))
      await new OpenCodeAdapter(reader(true)).postLaunchInjection({ ...baseCtx, projectPath: d })
      assert.ok(!fs.existsSync(path.join(d, OPENCODE_LEGACY_PLUGIN_SUBDIR)))
      fs.rmSync(d, { recursive: true, force: true })
    })
  })
})

describe('OpenCodeAdapter — Modell der Rolle landet in der opencode.json', () => {
  // opencode 2.0.29 hat am Top-Level KEIN --model. Das Feld `model` der Config ist
  // V1/V2-gemeinsam; der Mux schreibt es, merkt sich was er geschrieben und was er
  // ersetzt hat, und stellt es beim naechsten Start ohne Override wieder her.
  // Eine Ordner-Session laeuft im Projekt des Nutzers: dort darf ein einmaliger
  // Launcher-Wunsch das `model` des Projekts nicht fuer immer verdraengen.
  const make = () => fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-model-'))
  const adapter = new OpenCodeAdapter(reader(false))
  const inject = (d: string, extra: Record<string, unknown> = {}) =>
    adapter.postLaunchInjection({ ...baseCtx, projectPath: d, entityId: null, ...extra })
  const cfgOf = (d: string): Record<string, unknown> =>
    JSON.parse(fs.readFileSync(path.join(d, OPENCODE_CONFIG_FILENAME), 'utf-8'))

  it('schreibt das Modell aus dem Kontext als model', async () => {
    const d = make()
    await inject(d, { model: 'anthropic/claude-sonnet-4-5' })
    assert.equal(cfgOf(d).model, 'anthropic/claude-sonnet-4-5')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('ohne Override und ohne frueheren Eintrag bleibt das model des Projekts unberuehrt', async () => {
    const d = make()
    fs.writeFileSync(path.join(d, OPENCODE_CONFIG_FILENAME), JSON.stringify({ model: 'projekt/modell' }))
    await inject(d)
    assert.equal(cfgOf(d).model, 'projekt/modell')
    assert.ok(!fs.existsSync(path.join(d, OPENCODE_MODEL_MARKER_FILE)))
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('verdraengt das model des Projekts — und stellt es beim naechsten Start ohne Override wieder her', async () => {
    const d = make()
    fs.writeFileSync(path.join(d, OPENCODE_CONFIG_FILENAME), JSON.stringify({ model: 'projekt/modell' }))
    await inject(d, { model: 'launcher/wunsch' })
    assert.equal(cfgOf(d).model, 'launcher/wunsch')

    await inject(d) // kein Override mehr
    assert.equal(cfgOf(d).model, 'projekt/modell', 'das Projekt-Modell ging verloren')
    assert.ok(!fs.existsSync(path.join(d, OPENCODE_MODEL_MARKER_FILE)), 'Marker bleibt liegen')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('entfernt das eigene model, wenn es kein Projekt-Modell gab', async () => {
    const d = make()
    await inject(d, { model: 'launcher/wunsch' })
    await inject(d)
    assert.ok(!('model' in cfgOf(d)))
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('ist idempotent: zweimal derselbe Override verliert das Projekt-Modell nicht', async () => {
    const d = make()
    fs.writeFileSync(path.join(d, OPENCODE_CONFIG_FILENAME), JSON.stringify({ model: 'projekt/modell' }))
    await inject(d, { model: 'launcher/wunsch' })
    await inject(d, { model: 'launcher/wunsch' })
    await inject(d)
    assert.equal(cfgOf(d).model, 'projekt/modell')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('wechselt von einem Override zum anderen, ohne das Projekt-Modell zu vergessen', async () => {
    const d = make()
    fs.writeFileSync(path.join(d, OPENCODE_CONFIG_FILENAME), JSON.stringify({ model: 'projekt/modell' }))
    await inject(d, { model: 'a/eins' })
    await inject(d, { model: 'b/zwei' })
    assert.equal(cfgOf(d).model, 'b/zwei')
    await inject(d)
    assert.equal(cfgOf(d).model, 'projekt/modell')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('fasst ein model nicht an, das der Nutzer nach dem Mux-Eintrag selbst geaendert hat', async () => {
    const d = make()
    await inject(d, { model: 'launcher/wunsch' })
    const c = cfgOf(d)
    fs.writeFileSync(path.join(d, OPENCODE_CONFIG_FILENAME), JSON.stringify({ ...c, model: 'nutzer/aenderung' }))
    await inject(d)
    assert.equal(cfgOf(d).model, 'nutzer/aenderung')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('ein kaputter Marker blockiert nichts', async () => {
    const d = make()
    fs.mkdirSync(path.join(d, '.opencode'), { recursive: true })
    fs.writeFileSync(path.join(d, OPENCODE_MODEL_MARKER_FILE), '{kaputt')
    await inject(d, { model: 'launcher/wunsch' })
    assert.equal(cfgOf(d).model, 'launcher/wunsch')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('das Profil des lokalen Workers schlaegt den Override — wie vorher bei --model', async () => {
    // Ein Override, der das Profil still ueberstimmt, liesse die Bilanz ein Modell
    // fuehren, das nie lief.
    const d = make()
    const lw = { baseUrl: 'http://h/v1', model: 'qwen', contextWindow: 1000, maxOutputTokens: 100 }
    await new OpenCodeAdapter({ getSkipPermissions: () => true, getLocalWorker: () => lw })
      .postLaunchInjection({ ...baseCtx, projectPath: d, entityId: 'local-worker', model: 'anthropic/x' })
    assert.equal(cfgOf(d).model, 'cipher-local/qwen')
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
