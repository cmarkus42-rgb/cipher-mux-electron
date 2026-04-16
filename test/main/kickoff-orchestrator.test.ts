import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { EventEmitter } from 'events'
import { KickoffOrchestrator } from '../../src/main/project/kickoff-orchestrator'
import type { SessionInfo, StartSessionOpts } from '../../src/shared/types'

// Minimal SessionManager stand-in. Only the methods the orchestrator uses.
class MockSessionManager extends EventEmitter {
  public starts: StartSessionOpts[] = []
  public sendKeysCalls: Array<{ sessionId: string; keys: string }> = []

  async start(opts: StartSessionOpts): Promise<SessionInfo> {
    this.starts.push(opts)
    const id = `mock-${this.starts.length}`
    return {
      id,
      name: opts.name,
      projectPath: opts.projectPath,
      tmuxSession: `cmux-${id}`,
      tmuxPane: null,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  async sendKeys(sessionId: string, keys: string): Promise<void> {
    this.sendKeysCalls.push({ sessionId, keys })
  }
}

describe('KickoffOrchestrator', () => {
  let tmpRoot: string
  let projectDir: string
  let launcherDir: string
  let mockSm: MockSessionManager
  let orchestrator: KickoffOrchestrator

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-orch-'))
    projectDir = path.join(tmpRoot, 'my-project')
    fs.mkdirSync(projectDir)
    launcherDir = path.join(tmpRoot, 'projectlauncher')
    fs.mkdirSync(launcherDir)
    mockSm = new MockSessionManager()
    orchestrator = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 60_000,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })
  })

  afterEach(() => {
    orchestrator.destroy()
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('rejects when projectDir does not exist', async () => {
    await assert.rejects(
      () => orchestrator.start({ projectDir: path.join(tmpRoot, 'nope') }),
      /not found|not exist/i,
    )
  })

  it('rejects when projectDir is a file, not a directory', async () => {
    const filePath = path.join(tmpRoot, 'a-file.md')
    fs.writeFileSync(filePath, 'x')
    await assert.rejects(
      () => orchestrator.start({ projectDir: filePath }),
      /not a directory/i,
    )
  })

  it('starts a launcher session in projectlauncherPath', async () => {
    const handle = await orchestrator.start({ projectDir })
    assert.equal(mockSm.starts.length, 1)
    assert.equal(mockSm.starts[0].projectPath, launcherDir)
    assert.ok(mockSm.starts[0].name.startsWith('Launcher:'))
    assert.equal(handle.projectName, 'my-project')
    assert.ok(handle.launcherSessionId)
  })

  it('copies external requirements file with original extension', async () => {
    const reqFile = path.join(tmpRoot, 'concept.docx')
    fs.writeFileSync(reqFile, 'binary-content')
    await orchestrator.start({
      projectDir,
      requirementsFile: reqFile,
    })
    const expected = path.join(projectDir, 'docs', 'requirements.docx')
    assert.ok(fs.existsSync(expected), `expected ${expected} to exist`)
    assert.equal(fs.readFileSync(expected, 'utf-8'), 'binary-content')
  })

  it('creates docs/ directory if missing before copying requirements', async () => {
    const reqFile = path.join(tmpRoot, 'req.txt')
    fs.writeFileSync(reqFile, 'hi')
    await orchestrator.start({ projectDir, requirementsFile: reqFile })
    assert.ok(fs.existsSync(path.join(projectDir, 'docs')))
  })

  it('rejects when external requirements file is unreadable', async () => {
    await assert.rejects(
      () => orchestrator.start({
        projectDir,
        requirementsFile: path.join(tmpRoot, 'missing.md'),
      }),
      /not found|not exist/i,
    )
  })

  it('sends a prompt that includes projectDir and /launch invocation', async () => {
    await orchestrator.start({ projectDir })
    // Wait for promptSendDelayMs (10ms) + a bit of safety.
    await new Promise((r) => setTimeout(r, 60))
    const combined = mockSm.sendKeysCalls.map((c) => c.keys).join('\n')
    assert.ok(
      combined.includes(projectDir),
      'sendKeys should include projectDir',
    )
    assert.ok(
      combined.includes('/launch'),
      'sendKeys should include /launch invocation',
    )
  })

  it('emits kickoff-complete when handleCompletion is called', async () => {
    const handle = await orchestrator.start({ projectDir })
    let fired: any = null
    orchestrator.on('kickoff-complete', (e) => { fired = e })

    orchestrator.handleCompletion({
      projectPath: projectDir,
      projectName: 'my-project',
      detectedStack: 'kotlin',
    })

    // Allow async work inside handleCompletion.
    await new Promise((r) => setTimeout(r, 80))
    assert.ok(fired, 'event not emitted')
    assert.equal(fired.handle.projectName, 'my-project')
    assert.equal(fired.payload.detectedStack, 'kotlin')
    // A follow-up session was started in projectDir.
    const followup = mockSm.starts.find((s) => s.projectPath === projectDir)
    assert.ok(followup, 'follow-up session not started')
    assert.equal(followup.name, 'my-project')
  })

  it('fires kickoff-timeout if neither MCP nor marker signals arrive', async () => {
    // Short-timeout orchestrator for this test.
    const shortOrch = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 100,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })
    let timedOut = false
    shortOrch.on('kickoff-timeout', () => { timedOut = true })
    await shortOrch.start({ projectDir })
    await new Promise((r) => setTimeout(r, 250))
    assert.equal(timedOut, true)
    shortOrch.destroy()
  })

  it('fires kickoff-complete via marker-file fallback', async () => {
    await orchestrator.start({ projectDir })
    let completeFired = false
    orchestrator.on('kickoff-complete', () => { completeFired = true })
    fs.writeFileSync(path.join(projectDir, '.kickoff-complete'), '', 'utf-8')
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(completeFired, true)
  })

  it('tags kickoff-complete reason=marker when triggered via marker file', async () => {
    await orchestrator.start({ projectDir })
    let fired: any = null
    orchestrator.on('kickoff-complete', (e) => { fired = e })
    fs.writeFileSync(path.join(projectDir, '.kickoff-complete'), '', 'utf-8')
    await new Promise((r) => setTimeout(r, 200))
    assert.ok(fired, 'event not emitted')
    assert.equal(fired.reason, 'marker')
  })

  it('tags kickoff-complete reason=normal when triggered via MCP handleCompletion', async () => {
    await orchestrator.start({ projectDir })
    let fired: any = null
    orchestrator.on('kickoff-complete', (e) => { fired = e })
    orchestrator.handleCompletion({
      projectPath: projectDir,
      projectName: 'my-project',
    })
    await new Promise((r) => setTimeout(r, 80))
    assert.ok(fired, 'event not emitted')
    assert.equal(fired.reason, 'normal')
  })

  it('treats timeout as implicit complete when CLAUDE.md exists in projectDir', async () => {
    const shortOrch = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 80,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })

    let completeEvent: any = null
    let timeoutFired = false
    shortOrch.on('kickoff-complete', (e) => { completeEvent = e })
    shortOrch.on('kickoff-timeout', () => { timeoutFired = true })

    // Scaffold has "happened" — CLAUDE.md is there but marker is missing.
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# my-project\n', 'utf-8')
    await shortOrch.start({ projectDir })

    // Wait past timeout + handleCompletion async work.
    await new Promise((r) => setTimeout(r, 300))

    assert.equal(timeoutFired, false, 'kickoff-timeout should NOT fire when CLAUDE.md exists')
    assert.ok(completeEvent, 'kickoff-complete should fire as implicit')
    assert.equal(completeEvent.reason, 'implicit')
    shortOrch.destroy()
  })

  it('still fires kickoff-timeout when CLAUDE.md is absent at timeout', async () => {
    const shortOrch = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 80,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })

    let completeFired = false
    let timeoutFired = false
    shortOrch.on('kickoff-complete', () => { completeFired = true })
    shortOrch.on('kickoff-timeout', () => { timeoutFired = true })

    // No CLAUDE.md — scaffold never got there.
    await shortOrch.start({ projectDir })
    await new Promise((r) => setTimeout(r, 300))

    assert.equal(timeoutFired, true, 'kickoff-timeout should fire')
    assert.equal(completeFired, false, 'kickoff-complete should NOT fire without CLAUDE.md')
    shortOrch.destroy()
  })
})
