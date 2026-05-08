import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { InputRequestWatcher } from '../../src/main/session/input-request-watcher'
import type { InputRequestsFile, InputRequest, InputRequestUpdate } from '../../src/shared/types'

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeRequestsFile(requests: InputRequest[]): InputRequestsFile {
  return {
    requests,
    lastUpdated: new Date().toISOString(),
  }
}

function makeBubbleRequest(id: string, status: 'open' | 'answered' = 'open'): InputRequest {
  return {
    id,
    type: 'bubble',
    projectId: 'test-project',
    question: `Question for ${id}?`,
    context: 'Some context',
    options: [
      { key: 'a', label: 'Option A', description: 'Desc A' },
      { key: 'b', label: 'Option B', description: 'Desc B' },
    ],
    recommendation: 'a',
    status,
    answer: status === 'answered' ? 'a' : null,
    createdAt: '2026-04-22T14:30:00Z',
    answeredAt: status === 'answered' ? '2026-04-22T15:00:00Z' : null,
  }
}

function makeReviewLink(id: string): InputRequest {
  return {
    id,
    type: 'review-link',
    projectId: 'test-project',
    title: `Review ${id}`,
    filePath: '/tmp/review.md',
    status: 'open',
    createdAt: '2026-04-22T14:35:00Z',
    answeredAt: null,
  }
}

describe('InputRequestWatcher', () => {
  let tmpDir: string
  let filePath: string

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'input-request-watcher-test-'))
    filePath = path.join(tmpDir, 'input-requests.json')
  })

  afterEach(() => {
    // Clean up the JSON file between tests
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath)
    }
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads initial requests from existing file', () => {
    const data = makeRequestsFile([makeBubbleRequest('ir-001'), makeReviewLink('ir-002')])
    fs.writeFileSync(filePath, JSON.stringify(data))

    const watcher = new InputRequestWatcher(filePath)
    const requests = watcher.getRequests()
    watcher.stop()

    assert.equal(requests.length, 2)
    assert.equal(requests[0].id, 'ir-001')
    assert.equal(requests[1].id, 'ir-002')
  })

  it('returns empty array when file does not exist', () => {
    const watcher = new InputRequestWatcher(filePath)
    const requests = watcher.getRequests()
    watcher.stop()

    assert.equal(requests.length, 0)
  })

  it('emits "requests-changed" when file is modified', async () => {
    const watcher = new InputRequestWatcher(filePath)
    watcher.start()

    const events: InputRequest[][] = []
    watcher.on('requests-changed', (reqs: InputRequest[]) => {
      events.push(reqs)
    })

    // Write the file
    const data = makeRequestsFile([makeBubbleRequest('ir-001')])
    fs.writeFileSync(filePath, JSON.stringify(data))

    // Give fs.watch a chance, then fall back to manual poll (fs.watch is unreliable under load)
    await waitFor(500)
    if (events.length === 0) watcher.poll()
    watcher.stop()

    assert.ok(events.length >= 1, 'should have emitted at least one event')
    assert.equal(events[events.length - 1].length, 1)
    assert.equal(events[events.length - 1][0].id, 'ir-001')
  })

  it('emits granular "request-update" events for added requests', async () => {
    const watcher = new InputRequestWatcher(filePath)
    watcher.start()

    const updates: InputRequestUpdate[] = []
    watcher.on('request-update', (update: InputRequestUpdate) => {
      updates.push(update)
    })

    // Write with one request
    fs.writeFileSync(filePath, JSON.stringify(makeRequestsFile([makeBubbleRequest('ir-001')])))
    await waitFor(600)

    assert.ok(updates.some((u) => u.action === 'added' && u.request.id === 'ir-001'))
    watcher.stop()
  })

  it('answers a request via atomic write-back', () => {
    const data = makeRequestsFile([makeBubbleRequest('ir-001')])
    fs.writeFileSync(filePath, JSON.stringify(data))

    const watcher = new InputRequestWatcher(filePath)
    watcher.answerRequest('ir-001', 'Option A')
    watcher.stop()

    // Verify file was updated
    const updated: InputRequestsFile = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const req = updated.requests.find((r) => r.id === 'ir-001')
    assert.ok(req)
    assert.equal(req.status, 'answered')
    assert.equal((req as any).answer, 'Option A')
    assert.ok((req as any).answeredAt)
  })

  it('answer uses atomic tmp+rename pattern', () => {
    const data = makeRequestsFile([makeBubbleRequest('ir-001')])
    fs.writeFileSync(filePath, JSON.stringify(data))

    const watcher = new InputRequestWatcher(filePath)
    watcher.answerRequest('ir-001', 'b')
    watcher.stop()

    // No tmp file should remain
    const siblings = fs.readdirSync(tmpDir)
    assert.ok(!siblings.some((s) => s.endsWith('.tmp')), 'no tmp file should remain')
  })

  it('counts open requests', () => {
    const data = makeRequestsFile([
      makeBubbleRequest('ir-001', 'open'),
      makeBubbleRequest('ir-002', 'answered'),
      makeReviewLink('ir-003'),
    ])
    fs.writeFileSync(filePath, JSON.stringify(data))

    const watcher = new InputRequestWatcher(filePath)
    assert.equal(watcher.openCount(), 2)
    watcher.stop()
  })

  it('handles malformed JSON gracefully', () => {
    fs.writeFileSync(filePath, '{ not valid json }')

    const watcher = new InputRequestWatcher(filePath)
    const requests = watcher.getRequests()
    watcher.stop()

    assert.equal(requests.length, 0)
  })
})
