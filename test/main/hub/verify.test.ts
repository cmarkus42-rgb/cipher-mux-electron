import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const tmpDir = path.join(os.tmpdir(), `hub-verify-test-${Date.now()}`)
process.env.HUB_ROOT_OVERRIDE = tmpDir

import { detectStack, hubVerify } from '../../../src/main/hub/verify'

describe('hub verify (REQ-HUB-005)', () => {
  const projectName = 'verify-project'
  const projDir = path.join(tmpDir, 'projects', projectName)

  before(() => {
    fs.mkdirSync(projDir, { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'migrations', projectName), { recursive: true })

    // Create ARCHIV-VERWEIS.md
    fs.writeFileSync(path.join(tmpDir, 'ARCHIV-VERWEIS.md'), [
      '# Archiv-Verweis',
      '',
      '## Migrations-Status',
      '',
      '| Projekt | Original-Pfad | Hub-Pfad | Status | Freigabe-Datum |',
      '|---------|---------------|----------|--------|----------------|',
      `| ${projectName} | /tmp/orig | projects/${projectName} | migriert-nicht-getestet | — |`,
      '',
    ].join('\n'))
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.HUB_ROOT_OVERRIDE
  })

  describe('detectStack', () => {
    it('detects Node.js project', () => {
      fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({
        scripts: { build: 'tsc', test: 'node --test' },
      }))
      fs.writeFileSync(path.join(projDir, 'package-lock.json'), '{}')

      const stack = detectStack(projDir)
      assert.equal(stack.runtime, 'node')
      assert.equal(stack.manifest, 'package.json')
      assert.equal(stack.installCommand, 'npm ci')
      assert.equal(stack.buildCommand, 'npm run build')
      assert.equal(stack.testCommand, 'npm run test')
    })

    it('detects Python project with pyproject.toml', () => {
      const pyDir = path.join(tmpDir, 'py-proj')
      fs.mkdirSync(pyDir, { recursive: true })
      fs.writeFileSync(path.join(pyDir, 'pyproject.toml'), '[build-system]')

      const stack = detectStack(pyDir)
      assert.equal(stack.runtime, 'python')
      assert.equal(stack.manifest, 'pyproject.toml')
      assert.equal(stack.installCommand, 'pip install -e .')
      assert.equal(stack.testCommand, 'pytest')
    })

    it('detects Rust project', () => {
      const rustDir = path.join(tmpDir, 'rust-proj')
      fs.mkdirSync(rustDir, { recursive: true })
      fs.writeFileSync(path.join(rustDir, 'Cargo.toml'), '[package]')

      const stack = detectStack(rustDir)
      assert.equal(stack.runtime, 'rust')
      assert.equal(stack.buildCommand, 'cargo build')
      assert.equal(stack.testCommand, 'cargo test')
    })

    it('detects Go project', () => {
      const goDir = path.join(tmpDir, 'go-proj')
      fs.mkdirSync(goDir, { recursive: true })
      fs.writeFileSync(path.join(goDir, 'go.mod'), 'module example.com/test')

      const stack = detectStack(goDir)
      assert.equal(stack.runtime, 'go')
      assert.equal(stack.buildCommand, 'go build ./...')
      assert.equal(stack.testCommand, 'go test ./...')
    })

    it('returns unknown for unrecognized stack', () => {
      const emptyDir = path.join(tmpDir, 'empty-proj')
      fs.mkdirSync(emptyDir, { recursive: true })

      const stack = detectStack(emptyDir)
      assert.equal(stack.runtime, 'unknown')
      assert.equal(stack.buildCommand, null)
    })
  })

  describe('hubVerify', () => {
    it('throws for non-existent project', async () => {
      await assert.rejects(
        hubVerify({ projectName: 'ghost' }),
        /Projekt nicht im Hub gefunden/,
      )
    })

    it('throws for unknown stack', async () => {
      const unknownProj = 'unknown-stack'
      const unknownDir = path.join(tmpDir, 'projects', unknownProj)
      fs.mkdirSync(unknownDir, { recursive: true })

      await assert.rejects(
        hubVerify({ projectName: unknownProj }),
        /Stack nicht erkannt/,
      )
    })

    it('runs install/build/test and writes verify log', async () => {
      // Create a minimal node project that will pass
      fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({
        name: 'verify-test',
        scripts: { build: 'echo build-ok', test: 'echo "# pass 3"' },
      }))

      const result = await hubVerify({
        projectName,
        installDeps: false, // skip install for test speed
        runBuild: true,
        runTests: true,
      })

      assert.equal(result.installSuccess, null) // skipped
      assert.equal(typeof result.buildSuccess, 'boolean')
      assert.equal(typeof result.testSuccess, 'boolean')
      assert.ok(fs.existsSync(result.verifyLogPath))

      const log = fs.readFileSync(result.verifyLogPath, 'utf-8')
      assert.ok(log.includes('Verify-Log'))
      assert.ok(log.includes('node'))
    })

    it('returns readyForRelease=false when build fails', async () => {
      const failProj = 'fail-build'
      const failDir = path.join(tmpDir, 'projects', failProj)
      fs.mkdirSync(failDir, { recursive: true })
      fs.mkdirSync(path.join(tmpDir, 'migrations', failProj), { recursive: true })
      fs.writeFileSync(path.join(failDir, 'package.json'), JSON.stringify({
        name: 'fail-test',
        scripts: { build: 'exit 1', test: 'echo ok' },
      }))

      const result = await hubVerify({
        projectName: failProj,
        installDeps: false,
      })

      assert.equal(result.buildSuccess, false)
      assert.equal(result.readyForRelease, false)
    })
  })
})
