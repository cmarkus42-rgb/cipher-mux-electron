/* =====================================================================
 * personas.js — shared data module for the mockups
 * ---------------------------------------------------------------------
 * In the real Electron app this would live in the main process /
 * app-data JSON. Here we keep it in localStorage so the two mockups
 * (settings-personas.html + settings-workspaces.html) stay in sync
 * when opened in the same browser context.
 * ===================================================================== */

(function () {
  'use strict';

  const KEY_PERSONAS = 'cm-personas';
  const KEY_WORKSPACES = 'cm-workspaces';

  // ---- Built-in (immutable) personas ----
  const BUILTINS = [
    {
      id: 'orchestrator',
      name: 'Orchestrator',
      color: '#B8601A',
      builtin: true,
      defaultPrompt:
        'You coordinate the work in this session grid. Read the user goal, split it into concrete tasks, assign them to worker cells, and gate merges via the MPO. Keep a short running plan at the top of every reply.'
    },
    {
      id: 'mpo',
      name: 'MPO',
      color: '#2d8a4e',
      builtin: true,
      defaultPrompt:
        'You are the Meta-Prompt Officer. Verify every claim the orchestrator or workers make by reading source. Block merges with concrete evidence. Keep a compact log: file:line → claim → verdict.'
    },
    {
      id: 'worker',
      name: 'Worker',
      color: '#6A6A72',
      builtin: true,
      defaultPrompt:
        'You execute one focused task at a time. Read what you need, do the thing, report back concisely. No speculation, no extra work. Surface blockers immediately.'
    },
    {
      id: 'empty',
      name: '(empty)',
      color: '#D4D4C8',
      builtin: true,
      defaultPrompt: ''
    },
  ];

  // ---- Seed custom personas (examples) ----
  const SEED_CUSTOM = [
    {
      id: 'researcher',
      name: 'Researcher',
      color: '#4A6FA5',
      builtin: false,
      defaultPrompt:
        'You research open questions. Read widely, cite sources with file:line or URL, surface contradictions. Output a tight brief the orchestrator can act on.'
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      color: '#A8322E',
      builtin: false,
      defaultPrompt:
        'You review diffs before merge. Check for logic errors, missed edge cases, and style drift. Reply with line-referenced comments only. No prose summary.'
    },
  ];

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
  }

  // Migration-aware loader: first time, seed with built-ins + samples.
  function getPersonas() {
    const stored = load(KEY_PERSONAS, null);
    if (stored && Array.isArray(stored)) return stored;
    const initial = [...BUILTINS, ...SEED_CUSTOM];
    save(KEY_PERSONAS, initial);
    return initial;
  }
  function setPersonas(list) { save(KEY_PERSONAS, list); }

  function getPersonaById(id) {
    return getPersonas().find(p => p.id === id) || BUILTINS.find(p => p.id === 'empty');
  }

  // ---- Workspaces, also persisted ----
  const SEED_WORKSPACES = [
    {
      id: 'triage', name: 'TRIAGE 3×2', cols: 3, rows: 2,
      // per-workspace prompt overrides, keyed by persona id
      // null/unset = use persona.defaultPrompt
      promptOverrides: {
        orchestrator: 'You coordinate a triage. Read the latest failing CI run from cipher-mux, split into a repro task (→ worker A) and a code-read task (→ worker B). Gate merges via MPO.'
      },
      cells: [
        { persona: 'orchestrator', project: 'cipher-mux', prompt: '' },
        { persona: 'mpo',          project: 'cipher-mux', prompt: '' },
        { persona: 'worker',       project: 'cipher-mux', prompt: 'grep stacktrace' },
        { persona: 'worker',       project: 'cipher-mux', prompt: 'read changelog'  },
        { persona: 'reviewer',     project: 'cipher-mux', prompt: 'review open PR'  },
        { persona: 'empty',        project: '',           prompt: ''                },
      ],
      merges: {},
    },
    {
      id: 'hacker-tall', name: 'HACKER TALL', cols: 3, rows: 3,
      promptOverrides: {
        orchestrator: 'Plan a Jitsi redeploy on the hostinger VPS. SSH in, snapshot config, roll forward. Keep a rollback plan open.',
        mpo: 'Verify every command against the self-hosting guide. Flag any drift from docker-jitsi-meet upstream defaults.'
      },
      cells: [
        { persona: 'orchestrator', project: 'softstatics-infra', prompt: '' },
        { persona: 'mpo',          project: 'softstatics-infra', prompt: '' },
        { persona: 'worker',       project: 'meet-proxy',        prompt: 'tail logs' },
        { persona: 'researcher',   project: 'softstatics-infra', prompt: 'check upstream changelog' },
        { persona: 'worker',       project: 'softstatics-infra', prompt: 'chore: bump deps' },
        { persona: 'empty',        project: '',                  prompt: '' },
        { persona: 'empty',        project: '',                  prompt: '' },
        { persona: 'empty',        project: '',                  prompt: '' },
        { persona: 'empty',        project: '',                  prompt: '' },
      ],
      merges: { '0:0': true, '2:0': true, '2:1': true },
    },
    {
      id: 'dual', name: 'DUAL SPLIT', cols: 2, rows: 2,
      promptOverrides: {
        orchestrator: 'Outline a short essay. Structure: hook, three beats, close.'
      },
      cells: [
        { persona: 'orchestrator', project: 'ivory-guide', prompt: '' },
        { persona: 'researcher',   project: 'ivory-guide', prompt: 'research' },
        { persona: 'reviewer',     project: 'ivory-guide', prompt: 'review copy' },
        { persona: 'empty',        project: '',            prompt: '' },
      ],
      merges: {},
    },
  ];

  function getWorkspaces() {
    const stored = load(KEY_WORKSPACES, null);
    if (stored && Array.isArray(stored)) return stored;
    save(KEY_WORKSPACES, SEED_WORKSPACES);
    return JSON.parse(JSON.stringify(SEED_WORKSPACES));
  }
  function setWorkspaces(list) { save(KEY_WORKSPACES, list); }

  // ---- Mock projects list (would come from the Electron app's project picker) ----
  const MOCK_PROJECTS = [
    'cipher-mux', 'softstatics-infra', 'meet-proxy',
    'notes', 'ivory-guide', 'napkin-rewrite'
  ];

  // Resolve effective prompt for a cell:
  //   1. cell.prompt wins if non-empty
  //   2. workspace.promptOverrides[persona.id] if set
  //   3. persona.defaultPrompt otherwise
  function resolvePrompt(workspace, cell) {
    if (cell.prompt && cell.prompt.trim()) return { text: cell.prompt, source: 'cell' };
    if (workspace.promptOverrides && workspace.promptOverrides[cell.persona]) {
      return { text: workspace.promptOverrides[cell.persona], source: 'workspace-override' };
    }
    const p = getPersonaById(cell.persona);
    return { text: p.defaultPrompt, source: 'persona-default' };
  }

  // Expose API
  window.CM = {
    getPersonas, setPersonas, getPersonaById,
    getWorkspaces, setWorkspaces,
    resolvePrompt,
    BUILTIN_IDS: BUILTINS.map(p => p.id),
    MOCK_PROJECTS,
  };
})();
