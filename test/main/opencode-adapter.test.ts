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
} from '../../src/main/agent/adapters/opencode'
import type { OpenCodeConfigReader } from '../../src/main/agent/adapters/opencode'
import type { AgentAdapter } from '../../src/main/agent/agent-adapter'
import { AdapterRegistry } from '../../src/main/agent/registry'

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
  it('uebergibt das Arbeitsverzeichnis als positionales Argument an erster Stelle', () => {
    // `opencode [project]` — kein Flag wie Codex' `-C`.
    const { cmd, args } = new OpenCodeAdapter(reader(false)).buildLaunchCommand(baseOpts)
    assert.equal(cmd, 'opencode')
    assert.equal(args[0], '/tmp/proj')
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

  it('meldet status-line und sub-agents als unbewiesen', () => {
    // `false` heisst hier „nicht gemessen", nicht „gibt es nicht". Fuer
    // status-line fehlt ein Weg, pro Session das JSON zu schreiben, das der
    // StatusLineMonitor liest; `--agent` allein belegt keine Unteragenten. Ein
    // Gate, das auf einer Vermutung true sagt, laesst den Mux ins Leere greifen.
    assert.equal(adapter.supports('status-line'), false)
    assert.equal(adapter.supports('sub-agents'), false)
  })

  it('bietet keine Status-Line-Methoden an, wenn es die Capability nicht meldet', () => {
    // Der Vertrag erlaubt getContextUsage/attachStatusHook nur, wenn
    // supports('status-line') gilt. Beides anzubieten und nichts zu liefern
    // waere dasselbe Versprechen auf Umwegen.
    const asContract: AgentAdapter = adapter
    assert.equal(asContract.getContextUsage, undefined)
    assert.equal(asContract.attachStatusHook, undefined)
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
