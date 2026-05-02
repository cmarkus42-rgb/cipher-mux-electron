# Token Craft — Working Efficiently with Context and Models

This guide covers the practical side of AI efficiency: choosing the right model, managing context windows, knowing when to start fresh, and making every token count.

**Type:** Explanation (understanding-oriented)
**Prerequisites:** Guide 04 (Prompting Fundamentals — especially the Token Window and Context Rot sections)
**Time:** 15-20 minutes

---

## Models: When to Use What

Claude comes in three tiers, each with different strengths. Knowing which to use when is the first efficiency lever.

### Claude Opus 4.6 / 4.7

The most capable model. Best at: complex multi-step reasoning, architectural decisions, creative work, ambiguous tasks that need judgment. Largest context window (1M tokens). Most expensive in terms of compute budget.

Use for: orchestration, planning, code review, complex debugging, anything where getting it right the first time matters more than speed.

### Claude Sonnet 4.6

The daily driver. Fast, capable, cost-effective. Same 1M context window. Handles most coding tasks, refactoring, feature implementation, and documentation without breaking a sweat.

Use for: implementation work, routine coding, file modifications, test writing. This is your default for worker sessions.

### Claude Haiku 4.5

The lightweight model. 200K context window (smaller but still substantial). Fastest response times. Lowest compute cost. Excellent at well-specified tasks where the instructions are clear and the scope is narrow.

Use for: simple changes, formatting, file operations, tasks with detailed specs, high-volume work. Also: Haiku excels when given frontloaded context — a well-written CLAUDE.md or spec makes Haiku surprisingly effective.

### Multi-Model in cipher-mux

cipher-mux's architecture naturally supports multi-model routing:
- **Orchestrator:** use the most capable model (Opus). It makes decisions, decomposes problems, and coordinates — reasoning quality matters most here.
- **Workers:** use Sonnet for implementation tasks. Good balance of quality and speed.
- **Simple tasks:** if a worker's task is well-specified (e.g., "rename all instances of X to Y in files A, B, C"), Haiku is sufficient and faster.

The MPO's escalation system is an implicit multi-model pattern: Level 1-4 decisions (autonomous) could run on Sonnet, while Level 5 escalations (to the user) naturally involve the most capable model.

---

## Context Window Management

Guide 04 introduced the context window as RAM. Here is how to manage it actively.

### The "Lost in the Middle" Problem

Transformer attention creates pairwise relationships between tokens. In very long contexts, information in the middle gets less attention than information at the start or end — up to 30% less. This is a fundamental property of the architecture, not a bug.

**Practical consequence:** Put the most important information at the very beginning or very end of your context. Your CLAUDE.md loads at the top (good — it gets strong attention). Your current question goes at the end (good — recency bias helps). The danger zone is the middle: hours of accumulated conversation history, old corrections, abandoned approaches.

### The todo.md Attention Hack

A technique from the Manus AI team: maintain a `todo.md` or `progress.md` file that gets updated as work progresses. At the end of each major step, the model updates this file — pushing the current state and remaining tasks into the recency zone of the context.

In cipher-mux terms: the Orchestrator does this naturally via the task system (`mux_task_update`). The tasks' current state is always queryable, always recent.

### When to /compact vs. Start Fresh

**`/compact`** compresses the conversation history, keeping key information and discarding noise. Good when: you want to continue in the same direction, just with more room. Tip: add focus instructions: `/compact Focus on the auth module changes and ignore the earlier discussion about database schema.`

**Starting fresh** clears the entire context and begins from scratch. Surprisingly, this often outperforms compaction. Why? Claude can rediscover the current state by reading the filesystem — git log, file contents, test results. A fresh session with "Read the project state and continue the auth work" is cleaner than a compacted session carrying forward noise.

**Rule of thumb:**
- Working on the same narrow task? `/compact`
- Switching focus or session feels degraded? Start fresh
- After two failed fix attempts? Always start fresh (doom loop escape)

---

## Token-Efficient Work Patterns

### /clear Between Tasks

If you switch topics in the same session, use `/clear` to reset the context. This is the single highest-impact habit for token efficiency. Without it, your database schema discussion pollutes your CSS debugging.

### Subagents for Exploration

When you need to investigate something (scan the codebase for patterns, read documentation, explore alternatives), use a subagent. The subagent works in its own context window and returns a summary. Your main session stays clean.

In cipher-mux, this happens naturally: the Orchestrator delegates exploration to workers, keeping its own context focused on coordination.

### /btw for Side Questions

Claude Code has `/btw` — it answers a question in an overlay without entering the conversation history. Perfect for quick lookups: "/btw what is the default port for PostgreSQL?" You get the answer. The context is untouched.

### Stable Prompt Prefixes

This is a technical detail that matters economically. The Anthropic API caches prompt prefixes. If your system prompt and CLAUDE.md are identical between calls (same text, same order), cached tokens cost 10x less than fresh ones. This means:

- Do not put timestamps in CLAUDE.md (they change every second, breaking the cache)
- Keep CLAUDE.md stable — edit it deliberately, not frequently
- Consistent session setup pays for itself through cache hits

### Prefer Pointers Over Inline Content

Instead of pasting 200 lines of code into your prompt, use `@path/to/file.ts:42-80`. Claude reads the file directly, and the reference is a few tokens instead of hundreds. Same result, fraction of the cost.

---

## Session Lifecycle

### Signs It Is Time for a New Session

- Claude repeats itself or contradicts earlier statements
- Rules you established are being ignored
- Hallucinated file names or function names appear
- The context usage indicator is orange or red (80%+)
- You have been in the same session for more than 2 hours

None of these are failures. They are signals. Acting on them promptly saves more tokens than pushing through.

### The Handover Pattern

Before ending a productive session:

1. Ask Claude: "Fass den aktuellen Stand zusammen. Was ist fertig, was ist offen, welche Entscheidungen wurden getroffen?"
2. Save the summary to a file: `docs/handover-YYYY-MM-DD.md`
3. Start a new session
4. First message: "Lies docs/handover-YYYY-MM-DD.md und mach da weiter."

The new session has a clean context loaded with exactly the state it needs. This is the session-level equivalent of rebooting a computer — same work, fresh resources.

### The 2-Hour Heuristic

Experienced Claude Code users often start fresh every 1-2 hours as a habit, not because something went wrong. The cost is one handover (2 minutes). The benefit is consistently high-quality responses for the next session. It is like regularly saving your game — a small investment that prevents large losses.

---

## CLAUDE.md as Token Investment

Your CLAUDE.md is loaded into every session automatically. This means:

- A good CLAUDE.md saves tokens in every single interaction (Claude does not need to be told things it already knows)
- A bad CLAUDE.md wastes tokens in every single interaction (Claude processes irrelevant instructions, or worse, follows wrong ones)

### The Pruning Test (Revisited)

For every line: "Would removing this cause Claude to make a mistake?"

- If yes → keep it
- If Claude does it correctly without the instruction → remove it
- If it is aspirational but Claude ignores it → either rewrite it more forcefully or remove it

### What Belongs in CLAUDE.md

- Commands Claude cannot guess (custom build scripts, test runners)
- Code style rules that differ from language defaults
- Architectural decisions specific to your project
- Common gotchas and non-obvious behaviors

### What Does NOT Belong in CLAUDE.md

- Standard language conventions (Claude already knows these)
- File-by-file descriptions of the codebase (Claude can read the files)
- Information that changes frequently (it becomes stale)
- Long code examples (they become stale; use `@file:line` pointers)

---

## cipher-mux's Built-in Efficiency

cipher-mux has several features that support token-efficient work without you thinking about it:

**StatusLine Monitor:** Real-time context usage per session, visible in each cell header. Green = healthy, orange = 80%+ (getting full), red = 90%+ (critical). This is your dashboard for session health.

**Orchestrator Context Monitoring:** The Orchestrator checks worker context usage every 2 minutes. If a worker hits 90%, the Orchestrator can take action — finish the current sub-task, summarize, and start a fresh worker.

**Message Bus:** Lightweight asynchronous messaging. A status update on the bus is a few dozen tokens. The alternative — having two sessions share a full conversation — would cost thousands of tokens. The bus architecture is inherently token-efficient.

**Session Survival:** tmux sessions survive app crashes. This means no token loss from unexpected restarts. Recovery adopts sessions without re-creating context.

**Workspace Apply:** Spawning five sessions with one click is not just convenient — it avoids the token cost of manually setting up each session with its persona and project instructions. The workspace does that frontloading for you.

---

## Quick Reference: Efficiency Patterns

| Pattern | Token impact |
|---|---|
| /clear between tasks | High — prevents context pollution |
| Start fresh after 2 hours | High — prevents context rot |
| Handover technique | Medium — clean state transfer |
| /compact with focus | Medium — preserves context, reduces noise |
| /btw for side questions | Low per use, high over time |
| Stable CLAUDE.md (no timestamps) | High — 10x cheaper cached tokens |
| @file:line instead of pasting | Medium — saves hundreds of tokens per reference |
| Subagents for exploration | High — protects main context |
| Multi-model routing | High — right model for right task |

**This is the final guide in the learning path.** You now have the foundations (Guides 01-02), the power features (Guide 03), the prompting skills (Guides 04-05), and the efficiency knowledge to use it all sustainably.
