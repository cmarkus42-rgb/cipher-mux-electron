import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { endpointProbeUrl, readUsageFile } from '../../../src/main/local-factory/worker-host-util'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('worker-host Hilfen', () => {
  it('Probe-URL hängt /models an, ohne doppelten Slash', () => {
    assert.equal(endpointProbeUrl('http://h:8000/v1'), 'http://h:8000/v1/models')
    assert.equal(endpointProbeUrl('http://h:8000/v1/'), 'http://h:8000/v1/models')
  })
  it('readUsageFile: mtime und Tokens, fehlende Datei → null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-'))
    assert.equal(readUsageFile(dir, 's'), null)
    fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({
      context_window: { total_input_tokens: 7, total_output_tokens: 3 },
    }))
    const u = readUsageFile(dir, 's')!
    assert.deepEqual(u.tokens, { input: 7, output: 3 })
    assert.ok(u.mtime > 0)
  })
})
