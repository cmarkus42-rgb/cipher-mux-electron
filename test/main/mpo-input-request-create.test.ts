import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { InputRequestWatcher } from '../../src/main/session/input-request-watcher'

describe('InputRequestWatcher.createRequest', () => {
  let tmpDir: string
  let filePath: string
  let watcher: InputRequestWatcher

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpo-ir-test-'))
    filePath = path.join(tmpDir, 'input-requests.json')
    fs.writeFileSync(filePath, JSON.stringify({ requests: [], lastUpdated: '' }))
    watcher = new InputRequestWatcher(filePath)
  })

  afterEach(() => {
    watcher.stop()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('appends a new request to the file', () => {
    watcher.createRequest({
      id: 'ir-test-1',
      type: 'bubble',
      projectId: 'test-project',
      question: 'Which database?',
      context: 'We need persistence',
      options: [
        { key: 'pg', label: 'PostgreSQL', description: 'Relational' },
        { key: 'mongo', label: 'MongoDB', description: 'Document' },
      ],
      recommendation: 'pg',
      status: 'open',
      answer: null,
      createdAt: new Date().toISOString(),
      answeredAt: null,
    })

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    assert.equal(data.requests.length, 1)
    assert.equal(data.requests[0].id, 'ir-test-1')
    assert.equal(data.requests[0].question, 'Which database?')
    assert.equal(data.requests[0].options.length, 2)
  })

  it('preserves existing requests when appending', () => {
    const existing = {
      requests: [{
        id: 'ir-existing', type: 'bubble', projectId: 'p',
        question: 'Old?', context: '', options: [],
        status: 'open', answer: null, createdAt: '2026-01-01T00:00:00Z', answeredAt: null,
      }],
      lastUpdated: '2026-01-01T00:00:00Z',
    }
    fs.writeFileSync(filePath, JSON.stringify(existing))

    watcher.createRequest({
      id: 'ir-new', type: 'bubble', projectId: 'p',
      question: 'New?', context: '', options: [],
      status: 'open', answer: null, createdAt: new Date().toISOString(), answeredAt: null,
    })

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    assert.equal(data.requests.length, 2)
    assert.equal(data.requests[0].id, 'ir-existing')
    assert.equal(data.requests[1].id, 'ir-new')
  })

  it('updates lastUpdated timestamp', () => {
    const before = new Date().toISOString()
    watcher.createRequest({
      id: 'ir-ts', type: 'bubble', projectId: 'p',
      question: 'Q?', context: '', options: [],
      status: 'open', answer: null, createdAt: before, answeredAt: null,
    })

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    assert.ok(data.lastUpdated >= before)
  })

  it('leaves no .tmp file after write', () => {
    watcher.createRequest({
      id: 'ir-tmp', type: 'bubble', projectId: 'p',
      question: 'Q?', context: '', options: [],
      status: 'open', answer: null, createdAt: new Date().toISOString(), answeredAt: null,
    })

    const files = fs.readdirSync(tmpDir)
    const tmpFiles = files.filter(f => f.endsWith('.tmp'))
    assert.equal(tmpFiles.length, 0)
  })
})
