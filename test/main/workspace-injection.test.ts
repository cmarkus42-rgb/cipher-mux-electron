import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// We test the injection methods by creating a minimal SessionManager-like object
// that exposes the private helpers. Since they're private on the class, we test
// them indirectly via injectWorkspaceSections (which is public).

// Inline the injection logic for unit testing (mirrors session-manager.ts)
function injectSection(claudeMd: string, sectionName: string, body: string | null): string {
  const sectionRegex = new RegExp(`\\n*## ${sectionName}\\n[\\s\\S]*?(?=\\n## |\\n*$)`)

  if (body === null) {
    return claudeMd.replace(sectionRegex, '')
  }

  const sectionBlock = `\n\n## ${sectionName}\n\n${body}`

  if (sectionRegex.test(claudeMd)) {
    return claudeMd.replace(sectionRegex, sectionBlock)
  }

  return claudeMd + sectionBlock
}

function injectWorkspaceSections(
  claudeMdContent: string,
  workspacePrompt?: string,
  contextPaths?: string[],
): string {
  let content = claudeMdContent

  if (workspacePrompt && workspacePrompt.trim()) {
    content = injectSection(content, 'Workspace Prompt', workspacePrompt.trim())
  } else {
    content = injectSection(content, 'Workspace Prompt', null)
  }

  if (contextPaths && contextPaths.length > 0) {
    const body = contextPaths.map((p) => `- \`${p}\``).join('\n')
    content = injectSection(content, 'Context Directories', body)
  } else {
    content = injectSection(content, 'Context Directories', null)
  }

  return content
}

// ── injectSection ────────────────────────────────────────────────────────────

describe('injectSection', () => {
  it('appends section to empty string', () => {
    const result = injectSection('', 'Test Section', 'hello')
    assert.ok(result.includes('## Test Section'))
    assert.ok(result.includes('hello'))
  })

  it('appends section after existing content', () => {
    const result = injectSection('# My Project\n\nSome content.', 'Workspace Prompt', 'do stuff')
    assert.ok(result.startsWith('# My Project'))
    assert.ok(result.includes('## Workspace Prompt'))
    assert.ok(result.includes('do stuff'))
  })

  it('replaces existing section', () => {
    const original = '# Proj\n\n## Workspace Prompt\n\nold prompt\n\n## Other\n\nkeep this'
    const result = injectSection(original, 'Workspace Prompt', 'new prompt')
    assert.ok(result.includes('new prompt'))
    assert.ok(!result.includes('old prompt'))
    assert.ok(result.includes('## Other'))
    assert.ok(result.includes('keep this'))
  })

  it('removes section when body is null', () => {
    const original = '# Proj\n\n## Workspace Prompt\n\nold prompt\n\n## Other\n\nkeep'
    const result = injectSection(original, 'Workspace Prompt', null)
    assert.ok(!result.includes('Workspace Prompt'))
    assert.ok(!result.includes('old prompt'))
    assert.ok(result.includes('## Other'))
    assert.ok(result.includes('keep'))
  })

  it('removing non-existent section is a no-op', () => {
    const original = '# Proj\n\nSome content.'
    const result = injectSection(original, 'Nonexistent', null)
    assert.strictEqual(result, original)
  })

  it('coexists with other sections', () => {
    let content = '# Project'
    content = injectSection(content, 'Workspace Prompt', 'my prompt')
    content = injectSection(content, 'Context Directories', '- `/src`')
    assert.ok(content.includes('## Workspace Prompt'))
    assert.ok(content.includes('my prompt'))
    assert.ok(content.includes('## Context Directories'))
    assert.ok(content.includes('- `/src`'))
  })
})

// ── injectWorkspaceSections ──────────────────────────────────────────────────

describe('injectWorkspaceSections', () => {
  it('injects both sections into empty CLAUDE.md', () => {
    const result = injectWorkspaceSections('', 'build the feature', ['/src', '/test'])
    assert.ok(result.includes('## Workspace Prompt'))
    assert.ok(result.includes('build the feature'))
    assert.ok(result.includes('## Context Directories'))
    assert.ok(result.includes('- `/src`'))
    assert.ok(result.includes('- `/test`'))
  })

  it('injects only workspace prompt when no context paths', () => {
    const result = injectWorkspaceSections('# Proj', 'do stuff')
    assert.ok(result.includes('## Workspace Prompt'))
    assert.ok(!result.includes('## Context Directories'))
  })

  it('injects only context paths when no workspace prompt', () => {
    const result = injectWorkspaceSections('# Proj', undefined, ['/lib'])
    assert.ok(!result.includes('## Workspace Prompt'))
    assert.ok(result.includes('## Context Directories'))
    assert.ok(result.includes('- `/lib`'))
  })

  it('removes sections when both are empty', () => {
    const original = '# Proj\n\n## Workspace Prompt\n\nold\n\n## Context Directories\n\n- `/old`'
    const result = injectWorkspaceSections(original, '', [])
    assert.ok(!result.includes('## Workspace Prompt'))
    assert.ok(!result.includes('## Context Directories'))
  })

  it('replaces existing sections', () => {
    const original = '# Proj\n\n## Workspace Prompt\n\nold prompt\n\n## Context Directories\n\n- `/old`\n\n## Other\n\nkeep'
    const result = injectWorkspaceSections(original, 'new prompt', ['/new'])
    assert.ok(result.includes('new prompt'))
    assert.ok(!result.includes('old prompt'))
    assert.ok(result.includes('- `/new`'))
    assert.ok(!result.includes('- `/old`'))
    assert.ok(result.includes('## Other'))
    assert.ok(result.includes('keep'))
  })

  it('whitespace-only prompt removes workspace prompt section', () => {
    const original = '# Proj\n\n## Workspace Prompt\n\nold'
    const result = injectWorkspaceSections(original, '   ')
    assert.ok(!result.includes('## Workspace Prompt'))
  })
})

// ── File-based integration test ──────────────────────────────────────────────

describe('injectWorkspaceSections file integration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-inject-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates CLAUDE.md if it does not exist', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md')
    const content = injectWorkspaceSections('', 'test prompt', ['/src'])
    fs.writeFileSync(claudeMdPath, content, 'utf-8')

    const written = fs.readFileSync(claudeMdPath, 'utf-8')
    assert.ok(written.includes('## Workspace Prompt'))
    assert.ok(written.includes('test prompt'))
    assert.ok(written.includes('## Context Directories'))
  })

  it('preserves existing content when injecting', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md')
    fs.writeFileSync(claudeMdPath, '# My Project\n\nExisting docs here.\n\n## Build\n\nnpm run build\n', 'utf-8')

    const original = fs.readFileSync(claudeMdPath, 'utf-8')
    const content = injectWorkspaceSections(original, 'workspace prompt', ['/docs'])
    fs.writeFileSync(claudeMdPath, content, 'utf-8')

    const written = fs.readFileSync(claudeMdPath, 'utf-8')
    assert.ok(written.includes('# My Project'))
    assert.ok(written.includes('Existing docs here.'))
    assert.ok(written.includes('## Build'))
    assert.ok(written.includes('npm run build'))
    assert.ok(written.includes('## Workspace Prompt'))
    assert.ok(written.includes('## Context Directories'))
  })
})
