import { describe, it, before, after, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

const ARCHIV_TEMPLATE = `# Archiv-Verweis: Original-Pfade und Migrations-Status

## Migrations-Status

| Projekt | Original-Pfad | Hub-Pfad | Status | Freigabe-Datum |
|---------|---------------|----------|--------|----------------|
| alpha | /orig/alpha | projects/alpha | nicht-migriert | — |
| beta | /orig/beta | projects/beta | kopiert | — |

## Status-Werte

- \`nicht-migriert\` — Original existiert, Hub leer
`

describe('archiv-verweis', () => {
  let tmpDir: string
  let archivPath: string

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archiv-test-'))
    process.env.HUB_ROOT_OVERRIDE = tmpDir
    archivPath = path.join(tmpDir, 'ARCHIV-VERWEIS.md')
  })

  after(async () => {
    delete process.env.HUB_ROOT_OVERRIDE
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await fs.writeFile(archivPath, ARCHIV_TEMPLATE)
    // Clean up any lock files
    try { await fs.unlink(archivPath + '.lock') } catch { /* ok */ }
  })

  it('readEntries parses table rows', async () => {
    const { readEntries } = await import('../../../src/main/hub/archiv-verweis')
    const entries = readEntries(archivPath)
    assert.equal(entries.length, 2)
    assert.equal(entries[0].projekt, 'alpha')
    assert.equal(entries[0].status, 'nicht-migriert')
    assert.equal(entries[1].projekt, 'beta')
    assert.equal(entries[1].status, 'kopiert')
  })

  it('readEntries returns empty for missing file', async () => {
    const { readEntries } = await import('../../../src/main/hub/archiv-verweis')
    const entries = readEntries('/nonexistent/path')
    assert.equal(entries.length, 0)
  })

  it('getEntry finds by name', async () => {
    const { getEntry } = await import('../../../src/main/hub/archiv-verweis')
    const entry = getEntry('alpha', archivPath)
    assert.ok(entry)
    assert.equal(entry.originalPfad, '/orig/alpha')
  })

  it('getEntry returns null for unknown', async () => {
    const { getEntry } = await import('../../../src/main/hub/archiv-verweis')
    assert.equal(getEntry('nonexistent', archivPath), null)
  })

  it('updateStatus changes status in file', async () => {
    const { updateStatus, readEntries } = await import('../../../src/main/hub/archiv-verweis')
    await updateStatus('alpha', 'kopiert', undefined, archivPath)
    const entries = readEntries(archivPath)
    const alpha = entries.find(e => e.projekt === 'alpha')
    assert.equal(alpha?.status, 'kopiert')
  })

  it('updateStatus rejects invalid status', async () => {
    const { updateStatus } = await import('../../../src/main/hub/archiv-verweis')
    await assert.rejects(
      () => updateStatus('alpha', 'invalid-status' as any, undefined, archivPath),
      /Invalid hub status/,
    )
  })

  it('updateStatus throws for unknown project', async () => {
    const { updateStatus } = await import('../../../src/main/hub/archiv-verweis')
    await assert.rejects(
      () => updateStatus('nonexistent', 'kopiert', undefined, archivPath),
      /not found/,
    )
  })

  it('updateStatus sets freigabeDatum', async () => {
    const { updateStatus, readEntries } = await import('../../../src/main/hub/archiv-verweis')
    await updateStatus('beta', 'freigegeben', '2026-05-03', archivPath)
    const entries = readEntries(archivPath)
    const beta = entries.find(e => e.projekt === 'beta')
    assert.equal(beta?.status, 'freigegeben')
    assert.equal(beta?.freigabeDatum, '2026-05-03')
  })

  it('addEntry appends new row', async () => {
    const { addEntry, readEntries } = await import('../../../src/main/hub/archiv-verweis')
    await addEntry({
      projekt: 'gamma',
      originalPfad: '/orig/gamma',
      hubPfad: 'projects/gamma',
      status: 'kopiert',
      freigabeDatum: null,
    }, archivPath)
    const entries = readEntries(archivPath)
    assert.equal(entries.length, 3)
    assert.equal(entries[2].projekt, 'gamma')
    assert.equal(entries[2].status, 'kopiert')
  })

  it('addEntry rejects duplicate', async () => {
    const { addEntry } = await import('../../../src/main/hub/archiv-verweis')
    await assert.rejects(
      () => addEntry({
        projekt: 'alpha',
        originalPfad: '/orig/alpha',
        hubPfad: 'projects/alpha',
        status: 'kopiert',
        freigabeDatum: null,
      }, archivPath),
      /already exists/,
    )
  })

  it('addEntry rejects invalid status', async () => {
    const { addEntry } = await import('../../../src/main/hub/archiv-verweis')
    await assert.rejects(
      () => addEntry({
        projekt: 'delta',
        originalPfad: '/orig/delta',
        hubPfad: 'projects/delta',
        status: 'bogus' as any,
        freigabeDatum: null,
      }, archivPath),
      /Invalid hub status/,
    )
  })
})
