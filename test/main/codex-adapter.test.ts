import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import {
  CodexAdapter,
  buildCodexProjectConfig,
  CODEX_FALLBACK_CONTEXT_WINDOW,
} from '../../src/main/agent/adapters/codex'
import type { CodexConfigReader } from '../../src/main/agent/adapters/codex'
import { buildCodexUsageHookScript } from '../../src/main/monitoring/codex-usage-hook'
import { AdapterRegistry } from '../../src/main/agent/registry'

function reader(skipPermissions: boolean): CodexConfigReader {
  return { getSkipPermissions: () => skipPermissions }
}

const baseOpts = { projectPath: '/tmp/proj', sessionName: 'cmux-test' }

describe('CodexAdapter — Identitaet', () => {
  const adapter = new CodexAdapter(reader(false))

  it('ist tier-2, nicht tier-1', () => {
    assert.equal(adapter.id, 'codex')
    assert.equal(adapter.displayName, 'Codex CLI')
    // Tier-1 hiesse: jede Capability gemessen. Zwei sind es nicht.
    assert.equal(adapter.tier, 'tier-2')
  })

  it('nennt AGENTS.md als Projektmarker, nicht CLAUDE.md', () => {
    assert.deepEqual(adapter.getProjectMarkers(), ['AGENTS.md', '.codex'])
  })
})

describe('CodexAdapter — Startkommando', () => {
  it('uebergibt das Arbeitsverzeichnis ausdruecklich und unterdrueckt den Alternate Screen', () => {
    const { cmd, args } = new CodexAdapter(reader(false)).buildLaunchCommand(baseOpts)
    assert.equal(cmd, 'codex')
    const cd = args.indexOf('-C')
    assert.ok(cd >= 0, '-C fehlt')
    assert.equal(args[cd + 1], '/tmp/proj')
    // Ohne das frisst die TUI die Scrollback-Historie des Panes.
    assert.ok(args.includes('--no-alt-screen'))
  })

  it('setzt ohne skipPermissions keines der beiden Bypass-Flags', () => {
    const { args } = new CodexAdapter(reader(false)).buildLaunchCommand(baseOpts)
    assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'))
    assert.ok(!args.includes('--dangerously-bypass-hook-trust'))
  })

  it('setzt mit skipPermissions BEIDE Bypass-Flags', () => {
    // Das Trust-Flag ist nicht Beiwerk: ohne es feuert ein frisch geschriebener
    // PreToolUse-Hook nicht, und zwar ohne jede Meldung. Eine Rollengrenze waere
    // dann geschrieben und wirkungslos.
    const { args } = new CodexAdapter(reader(true)).buildLaunchCommand(baseOpts)
    assert.ok(args.includes('--dangerously-bypass-approvals-and-sandbox'))
    assert.ok(args.includes('--dangerously-bypass-hook-trust'))
  })

  it('resume ist ein Unterkommando mit ID und steht an erster Stelle', () => {
    const { args } = new CodexAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      resumeClaudeSessionId: 'abc-123',
    })
    assert.equal(args[0], 'resume')
    assert.equal(args[1], 'abc-123')
  })

  it('resume ohne ID nimmt --last statt den interaktiven Picker', () => {
    // Eine unbeaufsichtigte Entity-Session sitzt sonst im Picker statt an einem Prompt.
    const { args } = new CodexAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      resume: true,
    })
    assert.deepEqual(args.slice(0, 2), ['resume', '--last'])
  })

  it('fork schlaegt resume, wenn beides gesetzt ist', () => {
    const { args } = new CodexAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      resumeClaudeSessionId: 'alt',
      forkFromClaudeSessionId: 'neu',
    })
    assert.equal(args[0], 'fork')
    assert.equal(args[1], 'neu')
    assert.ok(!args.includes('resume'))
  })

  it('reicht das Modell als --model durch', () => {
    const { args } = new CodexAdapter(reader(false)).buildLaunchCommand({
      ...baseOpts,
      model: 'gpt-6-astra',
    })
    const i = args.indexOf('--model')
    assert.ok(i >= 0)
    assert.equal(args[i + 1], 'gpt-6-astra')
  })

  it('gibt niemals einen Shell-String zurueck', () => {
    const { args } = new CodexAdapter(reader(true)).buildLaunchCommand(baseOpts)
    assert.ok(Array.isArray(args))
    for (const a of args) assert.equal(typeof a, 'string')
  })
})

describe('CodexAdapter — Capabilities sind gemessen, nicht geraten', () => {
  const adapter = new CodexAdapter(reader(false))

  it('meldet sub-agents als unbewiesen', () => {
    // false heisst hier „nicht gemessen". Ein Gate, das auf einer Vermutung true
    // sagt, laesst den Mux ein Werkzeug rufen, das ins Leere greift.
    assert.equal(adapter.supports('sub-agents'), false)
  })

  it('meldet companion-mcp als verfuegbar — die Rolle reist im Token', () => {
    // Die vier companion_memory_* haengen an der Rollenbindung. Codex kann den
    // Kopf X-Mux-Entity nicht senden, aber das gebundene Token traegt dieselbe
    // Tatsache, und der Server bindet sie beim initialize genauso.
    assert.equal(adapter.supports('companion-mcp'), true)
  })

  it('meldet status-line als verfuegbar — ueber den Hook, nicht ueber eine Statusline', () => {
    assert.equal(adapter.supports('status-line'), true)
  })

  it('supports und getCapabilities widersprechen sich nicht', () => {
    const caps = adapter.getCapabilities()
    for (const [feature, value] of Object.entries(caps)) {
      assert.equal(adapter.supports(feature as keyof typeof caps), value, `${feature} weicht ab`)
    }
    assert.equal(Object.keys(caps).length, 7)
  })
})

describe('CodexAdapter — Projektanweisungen', () => {
  let dir: string
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-adapter-')) })
  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('liest AGENTS.md', async () => {
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Regeln\n')
    const res = await new CodexAdapter(reader(false)).readProjectInstructions(dir)
    assert.ok(res)
    assert.equal(res.content, '# Regeln\n')
    assert.equal(res.filePath, path.join(dir, 'AGENTS.md'))
  })

  it('liest NICHT CLAUDE.md', async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-adapter-cmd-'))
    fs.writeFileSync(path.join(other, 'CLAUDE.md'), '# Falsch\n')
    const res = await new CodexAdapter(reader(false)).readProjectInstructions(other)
    assert.equal(res, null)
    fs.rmSync(other, { recursive: true, force: true })
  })
})

describe('buildCodexProjectConfig', () => {
  const cfg = buildCodexProjectConfig({
    mcpUrl: 'http://127.0.0.1:3100/mcp',
    usageHookPath: '/run/dir/usage.js',
  })

  it('traegt den MCP-Server mit URL ein', () => {
    assert.match(cfg, /\[mcp_servers\.cipher-mux\]/)
    assert.match(cfg, /url = "http:\/\/127\.0\.0\.1:3100\/mcp"/)
  })

  it('verweist auf die Umgebungsvariable und schreibt das Token NICHT hinein', () => {
    // Eine generierte Datei im Run-Verzeichnis ist kein Ort fuer ein Geheimnis.
    assert.match(cfg, /bearer_token_env_var = "CIPHER_MUX_MCP_TOKEN"/)
    assert.ok(!/Bearer /.test(cfg))
  })

  it('schreibt keinen headers-Block — Codex verwirft ihn stillschweigend', () => {
    assert.ok(!cfg.includes('headers'))
    assert.ok(!cfg.includes('X-Mux-Workspace'))
  })

  it('schreibt KEINEN matcher', () => {
    // Der passende Name ist `Bash`, nicht `shell`; ein Matcher, der nicht passt,
    // ueberspringt den Hook still. Gefiltert wird im Hook-Skript.
    assert.ok(!cfg.includes('matcher'))
  })

  it('registriert den Usage-Hook auf PostToolUse und SessionStart', () => {
    assert.match(cfg, /\[\[hooks\.PostToolUse\]\]/)
    assert.match(cfg, /\[\[hooks\.SessionStart\]\]/)
    assert.match(cfg, /command = "node \/run\/dir\/usage\.js"/)
  })

  it('traegt den Grenzen-Hook nur ein, wenn die Rolle einen hat', () => {
    assert.ok(!cfg.includes('PreToolUse'))
    const withBoundary = buildCodexProjectConfig({
      mcpUrl: 'http://x/mcp',
      usageHookPath: '/a.js',
      boundaryHookPath: '/b.js',
    })
    assert.match(withBoundary, /\[\[hooks\.PreToolUse\]\]/)
    assert.match(withBoundary, /command = "node \/b\.js"/)
  })

  it('maskiert Anfuehrungszeichen in Pfaden, statt die Datei zu sprengen', () => {
    const evil = buildCodexProjectConfig({
      mcpUrl: 'http://x/mcp',
      usageHookPath: '/pfad/mit"quote/usage.js',
    })
    assert.match(evil, /command = "node \/pfad\/mit\\"quote\/usage\.js"/)
  })
})

describe('codex-usage-hook — das erzeugte Skript laeuft wirklich', () => {
  let dir: string
  let outDir: string
  let scriptPath: string
  let transcript: string

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-usage-'))
    outDir = path.join(dir, 'ctx')
    scriptPath = path.join(dir, 'hook.js')
    transcript = path.join(dir, 'rollout.jsonl')

    fs.writeFileSync(scriptPath, buildCodexUsageHookScript({
      contextWindowSize: 100_000,
      modelId: 'test-model',
      statusLineDir: outDir,
    }))

    // Zwei Usage-Records; der letzte gilt. Dazwischen eine kaputte Zeile, wie
    // sie am Dateiende einer noch wachsenden JSONL vorkommt.
    fs.writeFileSync(transcript, [
      JSON.stringify({ type: 'token_usage_record', payload: { usage: { input_tokens: 10, output_tokens: 1 } } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message' } }),
      JSON.stringify({ type: 'token_usage_record', payload: { usage: { input_tokens: 24_000, cached_input_tokens: 8_000, output_tokens: 1_000 } } }),
      '{"type":"token_usage_record","payl',
    ].join('\n'))
  })

  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  function run(input: unknown, env: Record<string, string> = {}): void {
    execFileSync('node', [scriptPath], {
      input: JSON.stringify(input),
      env: { ...process.env, ...env },
      timeout: 10_000,
    })
  }

  it('schreibt die Messung unter die Mux-Session-ID', () => {
    run(
      { session_id: 'codex-sess-1', transcript_path: transcript, model: 'gpt-6-astra' },
      { CIPHER_MUX_SESSION_ID: 'mux-1' },
    )
    const data = JSON.parse(fs.readFileSync(path.join(outDir, 'mux-1.json'), 'utf-8'))
    // 24000 + 1000 von 100000 = 25 %
    assert.equal(data.context_window.used_percentage, 25)
    assert.equal(data.context_window.remaining_percentage, 75)
    assert.equal(data.context_window.context_window_size, 100_000)
    assert.equal(data.context_window.current_usage.cached_input_tokens, 8_000)
  })

  it('nimmt den LETZTEN Usage-Record, nicht den ersten', () => {
    const data = JSON.parse(fs.readFileSync(path.join(outDir, 'mux-1.json'), 'utf-8'))
    assert.equal(data.context_window.total_input_tokens, 24_000)
  })

  it('traegt die Codex-Session-ID mit — daran haengt Keep Working', () => {
    const data = JSON.parse(fs.readFileSync(path.join(outDir, 'mux-1.json'), 'utf-8'))
    assert.equal(data.session_id, 'codex-sess-1')
    assert.equal(data.model.id, 'gpt-6-astra')
  })

  it('schreibt die Session-ID auch ohne brauchbare Zahlen', () => {
    // Eine frisch gestartete Session hat noch keinen Usage-Record. Ihre ID ist
    // genau die, die ein Restore braucht — sie darf nicht mit den fehlenden
    // Zahlen zusammen verworfen werden.
    run({ session_id: 'codex-sess-2' }, { CIPHER_MUX_SESSION_ID: 'mux-2' })
    const data = JSON.parse(fs.readFileSync(path.join(outDir, 'mux-2.json'), 'utf-8'))
    assert.equal(data.session_id, 'codex-sess-2')
    assert.equal(data.context_window, undefined)
  })

  it('schreibt keine namenlose Datei, wenn CIPHER_MUX_SESSION_ID fehlt', () => {
    // Sonst entstuende '<dir>/.json', die der Monitor ohnehin ueberspringt.
    const env = { ...process.env }
    delete env.CIPHER_MUX_SESSION_ID
    execFileSync('node', [scriptPath], {
      input: JSON.stringify({ session_id: 'x', transcript_path: transcript }),
      env,
      timeout: 10_000,
    })
    assert.ok(!fs.existsSync(path.join(outDir, '.json')))
  })

  it('haelt die Session nicht auf, wenn das Transkript fehlt', () => {
    run({ session_id: 'c3', transcript_path: '/gibt/es/nicht.jsonl' }, { CIPHER_MUX_SESSION_ID: 'mux-3' })
    const data = JSON.parse(fs.readFileSync(path.join(outDir, 'mux-3.json'), 'utf-8'))
    assert.equal(data.context_window, undefined)
  })

  it('laesst den Werkzeugaufruf immer durch — ein Usage-Hook entscheidet nichts', () => {
    const out = execFileSync('node', [scriptPath], {
      input: JSON.stringify({ session_id: 'c4', transcript_path: transcript }),
      env: { ...process.env, CIPHER_MUX_SESSION_ID: 'mux-4' },
      encoding: 'utf-8',
      timeout: 10_000,
    })
    assert.deepEqual(JSON.parse(out), { continue: true })
  })

  it('ueberlebt voelligen Unsinn auf stdin', () => {
    const out = execFileSync('node', [scriptPath], {
      input: 'kein json',
      env: { ...process.env, CIPHER_MUX_SESSION_ID: 'mux-5' },
      encoding: 'utf-8',
      timeout: 10_000,
    })
    assert.deepEqual(JSON.parse(out), { continue: true })
  })

  it('backt das Kontextfenster ein, statt es zur Laufzeit zu erfragen', () => {
    const script = buildCodexUsageHookScript({ contextWindowSize: 272_000, modelId: 'm' })
    assert.match(script, /CONTEXT_WINDOW = 272000/)
    assert.equal(CODEX_FALLBACK_CONTEXT_WINDOW, 272_000)
  })
})

describe('codex-usage-hook — der bestehende StatusLineMonitor liest das Ergebnis', () => {
  // Das ist das Glied, an dem die Kette haengt: der Hook schreibt nicht in ein
  // eigenes Format, sondern in das, was der Monitor seit Claude Code 2.x liest.
  // Faellt dieser Test, ist Context-Usage fuer Codex-Sessions still weg — die
  // Anzeige bliebe einfach leer.
  let dir: string
  let outDir: string

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-monitor-'))
    outDir = path.join(dir, 'ctx')
    const scriptPath = path.join(dir, 'hook.js')
    const transcript = path.join(dir, 'rollout.jsonl')

    fs.writeFileSync(scriptPath, buildCodexUsageHookScript({
      contextWindowSize: 272_000,
      modelId: 'gpt-6-astra',
      statusLineDir: outDir,
    }))
    fs.writeFileSync(transcript, JSON.stringify({
      type: 'token_usage_record',
      payload: { usage: { input_tokens: 16_912, cached_input_tokens: 16_640, output_tokens: 27 } },
    }))

    execFileSync('node', [scriptPath], {
      input: JSON.stringify({
        session_id: '01a0f737-0df4-72c1-8dcf-c50cb6dce015',
        transcript_path: transcript,
        model: 'gpt-6-astra',
      }),
      env: { ...process.env, CIPHER_MUX_SESSION_ID: 'mux-monitor-1' },
      timeout: 10_000,
    })
  })

  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('der Monitor zieht Prozent, Fenstergroesse und Modell heraus', async () => {
    const { StatusLineMonitor } = await import('../../src/main/monitoring/statusline-monitor')
    const monitor = new StatusLineMonitor(outDir)
    monitor.start()
    const usage = monitor.get('mux-monitor-1')
    monitor.stop()

    assert.ok(usage, 'der Monitor hat die Datei des Hooks nicht angenommen')
    assert.equal(usage.usedPercentage, 6.2)
    assert.equal(usage.contextWindowSize, 272_000)
    assert.equal(usage.modelId, 'gpt-6-astra')
  })

  it('der Monitor meldet die Codex-Session-ID als claude-session-id', async () => {
    // Der Kanal heisst historisch nach Claude Code; was durchlaeuft, ist die ID
    // der jeweiligen CLI. Keep Working braucht sie fuer `codex resume <id>`.
    const { StatusLineMonitor } = await import('../../src/main/monitoring/statusline-monitor')
    const monitor = new StatusLineMonitor(outDir)
    const seen: Array<[string, string]> = []
    monitor.on('claude-session-id', (mux: string, cli: string) => { seen.push([mux, cli]) })
    monitor.start()
    monitor.stop()

    assert.deepEqual(seen, [['mux-monitor-1', '01a0f737-0df4-72c1-8dcf-c50cb6dce015']])
  })
})

describe('AdapterRegistry mit zwei Adaptern', () => {
  it('kennt codex neben claude-code', () => {
    const reg = new AdapterRegistry()
    assert.ok(reg.listIds().includes('codex'))
    assert.ok(reg.listIds().includes('claude-code'))
  })

  it('bleibt bei claude-code als Default', () => {
    // Der Wechsel ist eine Entscheidung des Nutzers, keine Vorgabe des Codes.
    assert.equal(new AdapterRegistry().getDefault().id, 'claude-code')
  })

  it('setDefault schaltet auf codex und wieder zurueck', () => {
    const reg = new AdapterRegistry()
    reg.setDefault('codex')
    assert.equal(reg.getDefault().id, 'codex')
    reg.setDefault('claude-code')
    assert.equal(reg.getDefault().id, 'claude-code')
  })

  it('setDefault weist einen unbekannten Adapter ab', () => {
    assert.throws(() => new AdapterRegistry().setDefault('gibtsnicht'), /not registered/)
  })
})
