import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Set HUB_ROOT_OVERRIDE before importing hub modules
const tmpDir = path.join(os.tmpdir(), `hub-apply-test-${Date.now()}`)
process.env.HUB_ROOT_OVERRIDE = tmpDir

import { hubApply, parseMigrationPlan, findLatestPlan } from '../../../src/main/hub/apply'

describe('hub apply (REQ-HUB-004)', () => {
  const projectName = 'test-project'
  const projectDir = path.join(tmpDir, 'projects', projectName)
  const migrationsDir = path.join(tmpDir, 'migrations', projectName)

  before(() => {
    // Create hub structure
    fs.mkdirSync(path.join(tmpDir, 'projects', projectName), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'migrations', projectName), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'workspaces'), { recursive: true })

    // Create ARCHIV-VERWEIS.md
    fs.writeFileSync(path.join(tmpDir, 'ARCHIV-VERWEIS.md'), [
      '# Archiv-Verweis',
      '',
      '## Migrations-Status',
      '',
      '| Projekt | Original-Pfad | Hub-Pfad | Status | Freigabe-Datum |',
      '|---------|---------------|----------|--------|----------------|',
      `| ${projectName} | /tmp/original | projects/${projectName} | kopiert | — |`,
      '',
    ].join('\n'))

    // Create migration plan
    fs.writeFileSync(path.join(migrationsDir, 'migration-plan-2026-05-01.md'), [
      '# Migration Plan: test-project',
      '',
      '## Bleibt unveraendert',
      '',
      '- [ ] **STEP-1** Bestehende Config — Config-Dateien bleiben',
      '- [ ] **STEP-2** Bestehende Tests — Tests bleiben',
      '',
      '## Bleibt, wird erweitert',
      '',
      '- [ ] **STEP-3** CLAUDE.md erweitern — Workspace-Section hinzufuegen',
      '',
      '## Kommt neu hinzu',
      '',
      '- [ ] **STEP-4** Workspace-Config — ws-test-project.json anlegen',
      '',
    ].join('\n'))
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.HUB_ROOT_OVERRIDE
  })

  describe('parseMigrationPlan', () => {
    it('parses steps from markdown plan', () => {
      const content = fs.readFileSync(path.join(migrationsDir, 'migration-plan-2026-05-01.md'), 'utf-8')
      const plan = parseMigrationPlan(content, projectName)

      assert.equal(plan.steps.length, 4)
      assert.equal(plan.steps[0].id, 'STEP-1')
      assert.equal(plan.steps[0].section, 'unchanged')
      assert.equal(plan.steps[2].id, 'STEP-3')
      assert.equal(plan.steps[2].section, 'extended')
      assert.equal(plan.steps[3].id, 'STEP-4')
      assert.equal(plan.steps[3].section, 'new')
    })

    it('returns empty steps for content without checkboxes', () => {
      const plan = parseMigrationPlan('# Just a heading\n\nSome text.', 'x')
      assert.equal(plan.steps.length, 0)
    })
  })

  describe('findLatestPlan', () => {
    it('finds the latest plan file', () => {
      const result = findLatestPlan(projectName)
      assert.ok(result)
      assert.ok(result.includes('migration-plan-2026-05-01.md'))
    })

    it('returns null for unknown project', () => {
      const result = findLatestPlan('nonexistent')
      assert.equal(result, null)
    })
  })

  describe('hubApply', () => {
    it('executes plan steps and writes apply log', async () => {
      const result = await hubApply({ projectName })

      assert.equal(result.stepsTotal, 4)
      assert.equal(result.stepsApplied, 4)
      assert.equal(result.stepsSkipped, 0)
      assert.equal(result.stepsFailed, 0)
      assert.ok(fs.existsSync(result.applyLogPath))
      assert.ok(result.projectMetaCreated)
      assert.ok(result.workspaceCreated)

      // Verify .project-meta.json
      const meta = JSON.parse(fs.readFileSync(path.join(projectDir, '.project-meta.json'), 'utf-8'))
      assert.equal(meta.archived_origin, '/tmp/original')
      assert.equal(meta.lifecycle_phase, 'brownfield-adopted')

      // Verify workspace config
      const ws = JSON.parse(fs.readFileSync(path.join(tmpDir, 'workspaces', `ws-${projectName}.json`), 'utf-8'))
      assert.ok(ws.projectPath.includes(projectName))
    })

    it('is idempotent — skips already-applied steps', async () => {
      const result = await hubApply({ projectName })

      // All steps were applied in previous test, so they show as already applied
      assert.equal(result.stepsApplied, 4)
      assert.equal(result.projectMetaCreated, false) // already exists
      assert.equal(result.workspaceCreated, false) // already exists
    })

    it('dryRun mode does not create files', async () => {
      const dryProjectName = 'dry-project'
      const dryMigDir = path.join(tmpDir, 'migrations', dryProjectName)
      fs.mkdirSync(path.join(tmpDir, 'projects', dryProjectName), { recursive: true })
      fs.mkdirSync(dryMigDir, { recursive: true })

      // Add to ARCHIV-VERWEIS
      const avContent = fs.readFileSync(path.join(tmpDir, 'ARCHIV-VERWEIS.md'), 'utf-8')
      fs.writeFileSync(
        path.join(tmpDir, 'ARCHIV-VERWEIS.md'),
        avContent.trimEnd() + `\n| ${dryProjectName} | /tmp/dry | projects/${dryProjectName} | kopiert | — |\n`,
      )

      fs.writeFileSync(path.join(dryMigDir, 'migration-plan-2026-05-02.md'), [
        '## Kommt neu hinzu',
        '',
        '- [ ] **DRY-1** Test step — do something',
      ].join('\n'))

      const result = await hubApply({ projectName: dryProjectName, dryRun: true })

      assert.equal(result.stepsApplied, 0)
      assert.equal(result.projectMetaCreated, false)
      assert.equal(result.workspaceCreated, false)
    })

    it('throws when no plan exists', async () => {
      await assert.rejects(
        hubApply({ projectName: 'no-plan-project' }),
        /Kein Migrations-Plan gefunden/,
      )
    })

  })
})
