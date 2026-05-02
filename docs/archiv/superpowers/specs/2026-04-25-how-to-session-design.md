# Design: How-To Session — "Relay" Knowledge Base

**Date:** 2026-04-25
**Status:** Draft
**Author:** cipher + Claude

## Summary

A self-contained knowledge base and advisor session for cipher-mux-electron. When a user starts a Claude Code session in `the how-to-session/`, they meet **Relay** — a calm, nerdy IT buddy who teaches cipher-mux, Claude Code, and prompting fundamentals through guided learning paths and reference material.

**Goals:**
1. Frontloaded knowledge — invest tokens now, save them in daily use
2. Haiku-executable — even Claude Haiku can run this effectively
3. Non-coder friendly — vibe-coding onboarding for people who don't code
4. Token-efficient routing — CLAUDE.md loads ~3K tokens, guides loaded on demand (2-5K each)
5. Dual-purpose — serves as advisor AND produces `how-to-info-popup.md` for app integration

## Persona: Relay

**Character:**
- Calm, unagitated IT professional. "Can do" attitude without cheerfulness.
- Nerdy, slightly weird — typical ITler. Dry humor, occasional off-beat analogies.
- Encouraging without pushing: "Probier's mal, schlimmstenfalls machen wir's rückgängig"
- When things go wrong: "Ah, das passiert. Komm, wir fixen das"
- Never condescending, never enthusiastic. Just competent and present.

**Language:**
- German output, Du-Form, short sentences
- Technical terms used but immediately contextualized: "Der Orchestrator — quasi dein Projektleiter"
- No marketing speak, no "Großartige Frage!", no emojis
- Internal knowledge files in English (token efficiency, Haiku performance)

**Greeting (new user):**
> "Hallo. Ich bin Relay — ich kenn mich mit cipher-mux und Claude Code aus und helfe dir, das Beste rauszuholen. Kurze Frage vorab: wie viel Erfahrung hast du mit Coding und KI-Tools?"

**Greeting (returning user):**
> "Hallo [Name]. Letztes Mal hast du [Guide X] durchgearbeitet. Weitermachen mit [nächster Guide], oder hast du was Konkretes?"

## Didactic Principles

Based on research (Diataxis Framework, Worked Example Effect, Progressive Disclosure):

1. **Skill level persisted** — ask once at first contact, store in `user-profile.json`, never ask again
2. **One concept per explanation** — never three features in one breath
3. **Always a concrete example** — "Das sieht dann so aus: ..."
4. **Worked Example → Guided Task → Independent** — show first, assist second, let go third
5. **After explanation: invite action** — "Willst du das mal ausprobieren?" not passive doc wall
6. **On errors: validate → fix → explain** — "Zeig mal was passiert ist" before jumping to solutions
7. **Path awareness** — Relay knows where the user is in the learning journey, suggests next step
8. **Analogies over jargon** — Context Window = RAM, Sessions = parallel phone calls, Orchestrator = air traffic controller, Message Bus = shared Slack channel, Workspace = pre-arranged conference room
9. **Separate document types** (Diataxis) — tutorials teach, how-tos solve, explanations deepen, references list. Never mix them.

## User Profile Persistence

File: `user-profile.json` (in session directory, gitignored)

```json
{
  "name": "...",
  "level": "einsteiger | fortgeschritten | power-user",
  "background": "...",
  "interests": ["..."],
  "completedGuides": ["01-first-steps", "04-prompting-fundamentals"],
  "lastSession": "2026-04-25"
}
```

- Created during first interaction (Relay asks 2-3 questions)
- Updated when guides are completed
- Read at every session start
- `completedGuides` drives "next step" suggestions

## File Structure

```
the how-to-session/
├── CLAUDE.md                    # Relay persona + routing logic (~3K tokens)
├── user-profile.json            # Generated at first use (gitignored)
├── .gitignore                   # Ignores user-profile.json
├── guides/
│   ├── 01-first-steps.md        # Tutorial: first launch → first result (~2.5K)
│   ├── 02-daily-workflow.md     # How-To: sessions, voice, notes, sidebar (~3.5K)
│   ├── 03-power-moves.md        # Explanation+Tutorial: orchestrator, MPO, launcher, workspaces (~5K)
│   ├── 04-prompting-fundamentals.md  # Explanation: universal LLM prompting (~4.5K)
│   ├── 05-prompting-in-mux.md   # How-To: mux-specific prompting (~3.5K)
│   └── 06-token-craft.md        # Explanation: context windows, models, efficiency (~3.5K)
├── ref/
│   ├── features.md              # Reference: complete feature catalog (~4K)
│   ├── mcp-tools.md             # Reference: all MCP tools + parameters (~2.5K)
│   └── shortcuts.md             # Reference: keyboard shortcuts + UI actions (~1K)
└── how-to-info-popup.md         # Artifact: condensed feature overview for app (~3K, German)
```

**Total knowledge base:** ~36K tokens. Per interaction Relay loads CLAUDE.md (~3K) + 1-2 relevant files (2-5K each) = **5-8K tokens per query**. Haiku's 200K window has 190K+ left for actual work.

## Learning Paths

### Path 1: "Ich bin neu" (Einsteiger)
```
01-first-steps → 02-daily-workflow → 04-prompting-fundamentals
```
Gets user to productive daily use. ~10K tokens total if read sequentially.

### Path 2: "Ich will mehr" (Fortgeschritten)
```
03-power-moves → 05-prompting-in-mux → 06-token-craft
```
Unlocks orchestration, advanced prompting, efficiency. ~12K tokens.

### Path 3: "Wie geht X?" (Nachschlagen)
```
ref/* directly — no learning path, just lookup
```
Relay picks the right ref file based on the question.

## Content Plan Per File

### CLAUDE.md (~150 lines, ~3K tokens)

Sections:
1. **Persona definition** — Relay character, language, tone rules
2. **Didactic rules** — the 9 principles above, as instructions
3. **User profile logic** — read `user-profile.json`, create if missing, update on guide completion
4. **Routing table** — maps user intents to files (see design section above)
5. **Anti-patterns** — things Relay must NOT do (dump entire files, overwhelm, be patronizing)
6. **Scope** — this session is about teaching and advising, not about coding cipher-mux itself

### guides/01-first-steps.md

**Type:** Tutorial (worked example)
**Audience:** Complete beginner, first contact with cipher-mux
**Content:**
- What is cipher-mux? (one paragraph, analogy: command center with multiple screens)
- The Grid: your workspace (analogy: desk with multiple monitors)
- Starting the app: what you see first
- Opening your first project: click "projekt" → select directory → session appears
- What is a session? (analogy: a phone call with Claude)
- The status bar: your control panel (walk through each button)
- Creating a second session: side-by-side work
- Closing sessions, rearranging the grid
- "What you learned" summary + next step suggestion

### guides/02-daily-workflow.md

**Type:** How-To Guide (task-oriented)
**Audience:** User who completed 01, ready for daily use
**Content:**
- Managing multiple sessions: focus, switch, resize
- The Sidebar: messages, background sessions, input requests, notes
- Detaching the sidebar (separate window)
- Voice input: enable, talk, submit ("abschicken"), tips for clear dictation
- Notes: create, edit, auto-tagging with Ollama, search and filter by tags
- Themes: switching, what's available, finding your preference
- Session Dialog vs Project Popup: when to use which
- Grid resizing: columns and rows via status bar
- Recovery: what happens when the app crashes (RecoveryDialog)
- Settings: scan paths, agent permissions, theme selection

### guides/03-power-moves.md

**Type:** Explanation + Tutorial (hybrid)
**Audience:** User comfortable with basics, wants orchestration power
**Content:**

**The Orchestrator:**
- What it is (analogy: air traffic controller)
- When to use it: complex multi-step tasks, bug processing
- How to start it (status bar button)
- What it does behind the scenes: MCP tools, worker sessions, message bus
- The Worker-Startup Protocol (why timing matters)
- Bug report flow: submit → orchestrator picks up → worker fixes → resolve
- Monitoring: context usage, status messages in sidebar

**The MPO (Multi-Project Orchestrator):**
- What it is (analogy: film director planning a multi-location shoot)
- The 10-Phase Lifecycle: explained in plain language
  - Phase 1-2: understanding what you want
  - Phase 3-4: breaking it into pieces, writing specs
  - Phase 5: launching parallel workers (waves)
  - Phase 6-8: monitoring, answering questions, escalating
  - Phase 9-10: tracking progress, wrapping up
- The 5-Level Escalation: when MPO asks you vs. decides alone
- Input Requests: the sidebar bubbles, how to answer them
- When MPO is overkill vs. when it shines

**The Project Launcher:**
- What it is (analogy: a construction site foreman who sets up before workers arrive)
- Kickoff Dialog: what to fill in, what the fields mean
- What happens behind the scenes: /launch skill, scaffold, CLAUDE.md generation
- The two stages: scaffold → interview
- Requirements file: what makes a good one
- Completion detection and auto-transition to interview session

**Workspaces & Personas:**
- What's a persona (role with name, color, default prompt)
- What's a workspace (pre-arranged grid layout with persona assignments)
- Builtin vs custom personas
- Creating a workspace: grid editor, merge handles, cell inspector
- Applying a workspace: what happens (grid resize, sessions spawn)
- Prompt resolution: cell > workspace override > persona default
- Persona Skill Sync: how personas become .claude/skills/

### guides/04-prompting-fundamentals.md

**Type:** Explanation (understanding-oriented)
**Audience:** Anyone wanting to work effectively with LLMs
**Sources:** XPRESS Konzept Kap. 10-11 + research findings
**Content:**

**The 5-Building-Block Prompt:**
- Role, Context, Task, Constraints, Format
- Bad vs. good example (from XPRESS doc)
- Why each block matters

**The Token Window — Your AI's Working Memory:**
- Analogy: RAM vs ROM vs disk
- Current specs: Opus/Sonnet 1M, Haiku 200K
- Context Rot: quality degrades in long sessions even within limits
- Signs of degradation: forgotten rules, contradictions, hallucinated names
- Fix: new session. Not failure, craft.

**The 150-Instruction Budget:**
- CLAUDE.md has ~150 effective instruction slots
- System prompt uses ~50 already
- Every unnecessary line dilutes the important ones
- The pruning test: "Would removing this cause mistakes?"

**Hallucinations — When AI Invents:**
- What they are, why they happen
- Detection: always test locally, never trust function names blindly
- The anti-hallucination prompt pattern
- "Bist du sicher? Falls unsicher, schlag einen verifizierten Weg vor."

**The Confirmation Trap:**
- AI is trained to be helpful → defaults to agreement
- How to force honest feedback: "Nenn mir zwei Gründe warum das schlecht sein könnte"
- The XPRESS rule: Claude is a tool, not a colleague

**Focused Sessions:**
- One topic per session, theme switch = new session
- The Handover technique: summarize → save → restart → load summary
- /clear between unrelated tasks

**Forcing Research:**
- LLMs overestimate their knowledge
- "Recherchier das vorher" actually works
- Pattern: research first, then outline, then execute

**The Doom Loop (Vibe Coding):**
- The central failure mode: agent claims to fix without actually fixing
- After 2 failed fix attempts: fresh session with better prompt
- Plan in markdown, not code. Discarded ideas in code = tech debt.

**The Two-Pass Pattern:**
- Generate draft → separate review pass
- Three focused agents beat one generalist working 3x longer

### guides/05-prompting-in-mux.md

**Type:** How-To (task-oriented, mux-specific)
**Audience:** User who understands prompting basics, wants to use cipher-mux effectively
**Content:**

**Writing Instructions for the Orchestrator:**
- What the orchestrator expects: clear task decomposition
- Good vs bad orchestrator instructions (examples)
- How to scope worker tasks: 60-80% context window each
- Status updates: what to watch for in sidebar messages

**Writing Requirements for the Launcher:**
- What makes a good requirements document
- Structure: goal, target audience, functional requirements, constraints
- The quality baseline: reference projects as examples
- Common mistake: too vague ("build an app") vs. too detailed (implementation prescriptions)

**Writing for MPO Input Requests:**
- What the bubbles ask, how to answer effectively
- When to pick an option vs. write a custom answer
- Decision speed matters: MPO workers are waiting

**Voice Input Tips:**
- Speak clearly, complete thoughts
- Voice commands: "abschicken" (submit), "neue zeile" (newline)
- Dictation without auto-submit: text appears, you review, then voice-submit
- Don't dictate code — voice is for natural language instructions

**Bugreport Writing:**
- What makes a useful bug report for the orchestrator
- Steps to reproduce > vague "it's broken"
- Voice interview mode: let Ollama enrich your description
- Screenshot capture: when visual context matters

**Inter-Session Communication:**
- Message Bus topics: chat, status, bug, system
- What goes to message bus vs. what gets injected via tmux
- Reading sidebar messages: what matters, what's noise

### guides/06-token-craft.md

**Type:** Explanation (understanding-oriented)
**Audience:** User who wants efficiency and understands basics
**Content:**

**Models — When to Use What:**
- Opus 4.6/4.7: complex reasoning, architecture, creative work. Most capable, most expensive.
- Sonnet 4.6: daily coding, most tasks. Best value.
- Haiku 4.5: simple tasks, high-volume, fast. 200K window. Great for well-specified work.
- Multi-model in cipher-mux: orchestrator on Opus, workers on Sonnet, simple tasks on Haiku

**Context Window Management:**
- The "Lost in the Middle" problem: info in middle gets 30% less attention
- Put queries at the end, reference material at the top
- CLAUDE.md at top (automatic), your question at bottom (natural)
- The todo.md attention hack: push plans to end of context

**Token-Efficient Work Patterns:**
- Start fresh vs compact: fresh often wins (Claude rediscovers state from filesystem)
- /clear between tasks
- Subagents for exploration (separate context window, report summary back)
- /compact with focus instructions
- Stable prompt prefixes for KV-cache hits (10x cheaper)

**Session Lifecycle:**
- Signs it's time for a new session: repetition, contradictions, forgotten rules
- The Handover pattern: summarize → file → new session → "lies handover und mach weiter"
- Every 2 hours: consider fresh start (experienced users' heuristic)

**CLAUDE.md as Token Investment:**
- Good CLAUDE.md saves tokens across every interaction
- Bad CLAUDE.md wastes tokens every interaction
- The pruning test applied
- Prefer pointers over inline content

**Cipher-Mux's Built-in Efficiency:**
- StatusLine monitor: real-time context usage visible per session
- Context warnings at 80%+
- Orchestrator monitors worker context, can kill/restart stalled sessions
- Message Bus: lightweight async communication, not context-heavy synchronous calls

### ref/features.md

Complete feature catalog from research agent output, reformatted as quick-reference. Grouped:
- Grid & Sessions
- Sidebar (4 tabs)
- Status Bar Controls
- Voice Input
- Notes Editor
- Project Management (Scanner, Popup, Kickoff)
- Workspaces & Personas
- Orchestrator & MPO
- Themes
- Settings & Config

Per feature: name, one-line description, how to access.

### ref/mcp-tools.md

All 14 MCP tools:
- Tool name
- Parameters (name, type, required/optional)
- What it does (one sentence)
- Example use case
- Return value summary

### ref/shortcuts.md

Table format:
| Shortcut | Action | Context |
Quick, scannable, complete.

### how-to-info-popup.md

German. Condensed feature overview for the app's Info/Settings "features" tab.
- Grouped by area (same as ref/features.md but shorter)
- Each feature: 1-2 sentences max
- No tutorial content, no explanation — pure reference
- Formatted for rendering in the app (clean markdown, no frontmatter)

## Token Budget Summary

| File | Tokens | Loaded When |
|---|---|---|
| CLAUDE.md | ~3,000 | Always (auto-loaded) |
| user-profile.json | ~100 | Always (Relay reads at start) |
| 01-first-steps.md | ~2,500 | Path 1 or "ich bin neu" |
| 02-daily-workflow.md | ~3,500 | Path 1 or daily feature questions |
| 03-power-moves.md | ~5,000 | Path 2 or orchestrator/MPO questions |
| 04-prompting-fundamentals.md | ~4,500 | Path 1 or prompting questions |
| 05-prompting-in-mux.md | ~3,500 | Path 2 or mux-specific prompting |
| 06-token-craft.md | ~3,500 | Path 2 or efficiency questions |
| ref/features.md | ~4,000 | "What can X do?" lookups |
| ref/mcp-tools.md | ~2,500 | MCP tool questions |
| ref/shortcuts.md | ~1,000 | Shortcut lookups |
| how-to-info-popup.md | ~3,000 | Never by Relay (app artifact) |

**Typical interaction:** 3K (CLAUDE.md) + 3-5K (one guide or ref) = **6-8K tokens loaded**.
**Full knowledge base if needed:** ~36K tokens.
**Haiku headroom:** 200K - 8K = 192K tokens for conversation.

## Implementation Order

1. CLAUDE.md (Relay persona, routing, profile logic)
2. guides/01-first-steps.md
3. guides/04-prompting-fundamentals.md (most universally useful)
4. guides/02-daily-workflow.md
5. ref/features.md + ref/shortcuts.md
6. guides/03-power-moves.md
7. guides/05-prompting-in-mux.md
8. guides/06-token-craft.md
9. ref/mcp-tools.md
10. how-to-info-popup.md
11. .gitignore + user-profile.json template

## Success Criteria

- [ ] A complete beginner can open cipher-mux for the first time, start a Relay session, and within 15 minutes have a working project session running
- [ ] Relay can answer "Was ist der Orchestrator?" without loading more than 8K tokens total
- [ ] Haiku can run Relay effectively (tested with model override)
- [ ] how-to-info-popup.md is directly usable in the app's features tab
- [ ] User profile persists across sessions and drives personalized guidance
- [ ] All content is factually accurate against cipher-mux v0.9.6 codebase
