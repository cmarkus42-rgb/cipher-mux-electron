import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BugreportManager } from '../../src/main/bugreport/bugreport-manager'

// Minimal MessageBus stub
class StubMessageBus {
  sent: Array<{ topic: string; sender: string; payload: Record<string, unknown> }> = []
  send(msg: { topic: string; sender: string; payload: Record<string, unknown> }) {
    this.sent.push(msg)
    return { id: 'msg-1', ...msg, createdAt: Date.now() }
  }
}

describe('BugreportManager', () => {
  let mgr: BugreportManager
  let bus: StubMessageBus
  let outboxDir: string

  beforeEach(() => {
    bus = new StubMessageBus()
    outboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugreport-test-'))
    mgr = new BugreportManager({ messageBus: bus as any, outboxDir })
  })

  it('submit writes projectPath into frontmatter', async () => {
    const projectPath = '/test/project'
    const id = await mgr.submit('test bug', [], 'test-project', projectPath)
    const file = fs.readFileSync(path.join(outboxDir, `${id}.md`), 'utf-8')
    assert.ok(file.includes(`projectPath: ${projectPath}`))
  })

  it('submit sends bug message to MessageBus', async () => {
    const projectPath = '/test/project'
    await mgr.submit('test bug', [], 'test-project', projectPath)
    assert.equal(bus.sent.length, 1)
    assert.equal(bus.sent[0].topic, 'bug')
    assert.equal(bus.sent[0].sender, 'bugreport-manager')
    const payload = bus.sent[0].payload as { bugId: string; projectPath: string }
    assert.equal(payload.projectPath, projectPath)
    assert.ok(payload.bugId.startsWith('BUG-'))
  })

  it('submit works without messageBus (graceful)', async () => {
    const mgrNoBus = new BugreportManager({ outboxDir })
    const id = await mgrNoBus.submit('test bug', [])
    assert.ok(id.startsWith('BUG-'))
  })
})
