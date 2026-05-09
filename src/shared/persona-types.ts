// src/shared/persona-types.ts — Persona & Workspace type definitions

export interface Persona {
  id: string
  name: string
  color: string
  defaultPrompt: string
  builtin?: boolean
}

export interface WorkspaceCell {
  persona: string    // persona.id — legacy, kept for backward compat with saved workspaces
  project: string    // project path or slug
  prompt: string     // per-cell prompt
  type?: 'session' | 'notes'
  presetId?: string  // entity preset id — when set, this entity is started in the cell on workspace load
  contextPaths?: string[]  // directories injected as ## Context Directories in CLAUDE.md on workspace apply
}

export interface Workspace {
  id: string
  name: string
  cols: number       // 1..10
  rows: number       // 1..6
  cells: WorkspaceCell[]  // row-major, length === cols * rows
  merges: Record<string, true>  // "col:row" → merged DOWN
  promptOverrides: Record<string, string>  // personaId → workspace-level prompt
  /** Tags auto-applied to new notes and pre-selected as sidebar filter when workspace is active. */
  defaultTags?: string[]
  /** Workspace-level prompt injected as ## Workspace Prompt into all project CLAUDE.md files on apply. */
  workspacePrompt?: string
  /** Workspace-level context directories injected as ## Context Directories into all project CLAUDE.md files on apply. */
  contextPaths?: string[]
  /** Sort order for workspace list (lower = first). Default: 100. */
  sortOrder?: number
  /** When true, new notes skip the workspace: scope tag and are visible in all workspaces. Default: false. */
  notesGlobal?: boolean
}

export type PromptSource = 'cell' | 'workspace-override' | 'persona-default'

export interface ResolvedPrompt {
  text: string
  source: PromptSource
}

export const BUILTIN_PERSONA_IDS = ['empty'] as const

export const BUILTIN_PERSONAS: readonly Persona[] = [
  {
    id: 'empty',
    name: '(empty)',
    color: '#D4D4C8',
    builtin: true,
    defaultPrompt: '',
  },
]

export const SEED_CUSTOM_PERSONAS: readonly Persona[] = [
  {
    id: 'requirements-engineer',
    name: 'Requirements Engineer',
    color: '#4A6FA5',
    builtin: false,
    defaultPrompt:
      'You elicit and structure requirements. Conduct stakeholder interviews, write user stories with acceptance criteria, and maintain docs/requirements.md. Ask clarifying questions before assuming.',
  },
  {
    id: 'system-engineer',
    name: 'System Engineer',
    color: '#0E7FA8',
    builtin: false,
    defaultPrompt:
      'You handle system architecture, infrastructure, CI/CD, deployment, and cross-subsystem integration. Focus on reliability, monitoring, and performance. Document decisions in ADRs.',
  },
  {
    id: 'developer',
    name: 'Developer',
    color: '#7B3F99',
    builtin: false,
    defaultPrompt:
      'You implement features and fix bugs. Write clean, tested code. Follow TDD — failing test first, then minimal implementation. Small focused commits. Surface blockers immediately.',
  },
  {
    id: 'architect',
    name: 'Architect',
    color: '#C79A2B',
    builtin: false,
    defaultPrompt:
      'You make technical decisions and write ADRs. Design APIs, evaluate tradeoffs, analyze dependencies. Keep specs in docs/SPEC.md. Patterns over point solutions.',
  },
  {
    id: 'auditor',
    name: 'Auditor',
    color: '#A8322E',
    builtin: false,
    defaultPrompt:
      'You review code for quality and security. Check OWASP top 10, test coverage, performance bottlenecks, and style drift. Output line-referenced findings as structured reports.',
  },
]

export const PERSONA_SWATCHES = [
  '#B8601A', '#2d8a4e', '#A8322E', '#4A6FA5',
  '#7B3F99', '#C79A2B', '#0E7FA8', '#8A6B2B',
  '#6A6A72', '#1A1A1D',
] as const

export const SEED_WORKSPACES: readonly Workspace[] = [
  {
    id: 'triage',
    name: 'TRIAGE 3×2',
    cols: 3,
    rows: 2,
    promptOverrides: {
      orchestrator: 'You coordinate a triage. Read the latest failing CI run, split into a repro task and a code-read task. Gate merges via Cyber Factory.',
    },
    cells: [
      { persona: 'orchestrator', project: '', prompt: '', presetId: 'orchestrator' },
      { persona: 'cyber-factory', project: '', prompt: '', presetId: 'cyber-factory' },
      { persona: 'empty',        project: '', prompt: 'grep stacktrace' },
      { persona: 'empty',        project: '', prompt: 'read changelog' },
      { persona: 'auditor',      project: '', prompt: 'review open PR' },
      { persona: 'empty',        project: '', prompt: '' },
    ],
    merges: {},
  },
  {
    id: 'dual',
    name: 'DUAL SPLIT',
    cols: 2,
    rows: 2,
    promptOverrides: {},
    cells: [
      { persona: 'orchestrator', project: '', prompt: '', presetId: 'orchestrator' },
      { persona: 'developer',    project: '', prompt: '' },
      { persona: 'auditor',      project: '', prompt: 'review' },
      { persona: 'empty',        project: '', prompt: '' },
    ],
    merges: {},
  },
]
