import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ProjectScanner } from '../../src/main/project/project-scanner'

describe('ProjectScanner', () => {
  let tmpDir: string
  let scanner: ProjectScanner

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-test-'))
    scanner = new ProjectScanner()

    // Create test projects
    const proj1 = path.join(tmpDir, 'project-alpha')
    fs.mkdirSync(proj1)
    fs.writeFileSync(
      path.join(proj1, 'CLAUDE.md'),
      '# project-alpha\n\n**Phase: 3 — Technische Entscheidungen**\n',
    )
    fs.mkdirSync(path.join(proj1, '.git'))

    const proj2 = path.join(tmpDir, 'project-beta')
    fs.mkdirSync(proj2)
    fs.mkdirSync(path.join(proj2, 'docs'))

    // Not a project — no markers
    const notProj = path.join(tmpDir, 'random-folder')
    fs.mkdirSync(notProj)
    fs.writeFileSync(path.join(notProj, 'readme.txt'), 'not a project')

    // Excluded dirs
    fs.mkdirSync(path.join(tmpDir, 'node_modules'))
    fs.mkdirSync(path.join(tmpDir, '.hidden-dir'))
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should find projects with CLAUDE.md', async () => {
    const projects = await scanner.scan([tmpDir])
    const alpha = projects.find((p) => p.name === 'project-alpha')
    assert.ok(alpha, 'project-alpha should be found')
    assert.equal(alpha!.hasClaudeMd, true)
  })

  it('should find projects with docs/ directory', async () => {
    const projects = await scanner.scan([tmpDir])
    const beta = projects.find((p) => p.name === 'project-beta')
    assert.ok(beta, 'project-beta should be found')
    assert.equal(beta!.hasClaudeMd, false)
  })

  it('should exclude non-project directories', async () => {
    const projects = await scanner.scan([tmpDir])
    const random = projects.find((p) => p.name === 'random-folder')
    assert.equal(random, undefined, 'random-folder should not be found')
  })

  it('should exclude node_modules and hidden dirs', async () => {
    const projects = await scanner.scan([tmpDir])
    const names = projects.map((p) => p.name)
    assert.ok(!names.includes('node_modules'))
    assert.ok(!names.includes('.hidden-dir'))
  })

  it('should extract SDD phase from CLAUDE.md', async () => {
    const projects = await scanner.scan([tmpDir])
    const alpha = projects.find((p) => p.name === 'project-alpha')
    assert.ok(alpha!.sddPhase)
    assert.ok(alpha!.sddPhase!.includes('3'))
  })

  it('should return sorted results', async () => {
    const projects = await scanner.scan([tmpDir])
    assert.equal(projects[0].name, 'project-alpha')
    assert.equal(projects[1].name, 'project-beta')
  })

  it('should handle empty scan paths', async () => {
    const projects = await scanner.scan([])
    assert.deepEqual(projects, [])
  })

  it('should handle non-existent scan paths', async () => {
    const projects = await scanner.scan(['/tmp/does-not-exist-cmux-test'])
    assert.deepEqual(projects, [])
  })
})
