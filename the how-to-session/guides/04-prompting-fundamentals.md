# Prompting Fundamentals — Getting Real Results from AI

This guide covers universal principles for working with large language models (LLMs) like Claude. These skills apply everywhere — in cipher-mux, in raw Claude Code, in the browser, in any AI tool. Master these and everything else gets easier.

**Type:** Explanation (understanding-oriented)
**Prerequisites:** None — this is foundational knowledge
**Time:** 20-30 minutes to read, a lifetime to practice

---

## The 5-Building-Block Prompt

Every effective prompt has five components. Not always in this order, not always all five — but the more you include, the better the result.

### 1. Role

Tell the AI who it is for this task.

> "Du bist Frontend-Entwickler für eine PHP-Website."

Why it matters: the role shapes depth, vocabulary, assumptions, and which knowledge the model draws on. A "security auditor" looks at code differently than a "performance engineer." Same code, different eyes.

### 2. Context

What does the AI need to know about your situation?

> "Die Website ist statisches PHP auf Strato-Hosting. Ich pflege sie allein, kein Team."

Without context, the AI guesses — sometimes accurately, sometimes not. Context is cheap to provide and expensive to lack. Include: tech stack, constraints, who will use the result, what has been tried already.

### 3. Task

What exactly should happen?

> "Ändere den Preis für 'Komplettumzug Standard' auf preise.php von 450 auf 490."

The more specific the task, the less room for interpretation. "Make the homepage better" is an invitation for the AI to do whatever it feels like. "Reduce homepage load time by optimizing images and deferring non-critical CSS" is a task.

### 4. Constraints

What should the AI NOT do?

> "Keine neuen Abhängigkeiten. Kein Tailwind. Erst Plan zeigen, dann Code."

Constraints prevent the AI's default behaviors from kicking in. Without them, Claude will happily add a new framework, refactor surrounding code, and create helper utilities you never asked for. Constraints are guardrails.

### 5. Format

How should the answer be structured?

> "Antworte mit: 1. Was geändert wurde, 2. Warum, 3. Wie ich es teste."

Format instructions save you from parsing walls of text. You know what you need — tell the AI, so it delivers in that shape.

### Bad vs. Good — Same Task

**Bad:** "Mach die Startseite besser."

**Good:** "Du bist Frontend-Entwickler für meine PHP-Website. Die Startseite lädt auf dem Handy langsam. Bitte: 1. Analysiere index.php und die verlinkten CSS/JS-Dateien. 2. Zeig mir die drei größten Performance-Hebel, sortiert nach Aufwand vs. Effekt. 3. Erst Plan zeigen, dann Code. Keine neuen Frameworks."

The difference is not length — it is precision. The good prompt takes 30 seconds longer to write and saves 15 minutes of back-and-forth.

---

## Your AI's Working Memory: The Token Window

Every AI model has a limit on how much text it can hold in "working memory" at once. This is the **context window**, measured in tokens (roughly: one token ≈ 0.75 English words, one long German word ≈ 3-5 tokens).

**Current specs (April 2026):**
- Claude Opus 4.6/4.7, Sonnet 4.6: 1,000,000 tokens (~750K English words, ~1,500 book pages)
- Claude Haiku 4.5: 200,000 tokens

Think of it as **RAM vs. ROM vs. Disk:**
- **Context window = RAM.** What the AI is actively thinking about right now. Limited, fast, everything here is "in focus."
- **Training data = ROM.** Background knowledge from training. Always accessible but not actively loaded — the AI draws on it implicitly.
- **Files on disk = external storage.** Vast but requires explicit loading. When Claude reads a file, it enters the context window (RAM).

For most daily work, you will never hit the raw capacity limit. A million tokens is enormous. But quality degrades long before you hit the wall — that is context rot.

---

## Context Rot: When Quality Degrades

Long sessions degrade even within the window limit. After hours of back-and-forth, corrections, tangents, and accumulated context, the AI's attention spreads thin. The "lost in the middle" problem is real: information buried in the middle of a long context gets up to 30% less attention than information at the start or end.

**Signs of context rot:**
- Claude forgets rules you established earlier in the session
- Answers contradict something it said 20 messages ago
- It starts hallucinating file names or function names that do not exist
- It references things you never said

**The fix is simple: start a new session.** This is not failure — it is craft. Experienced users start fresh every 1-2 hours as a habit, not because something went wrong. A new session with a clear prompt almost always outperforms a degraded long session.

**The handover technique:** Before closing a session, ask Claude to summarize the current state in half a page. Save it as a file. Start a new session. First message: "Lies diese Zusammenfassung und mach da weiter wo wir aufgehört haben." Clean context, full state.

---

## The 150-Instruction Budget

Claude Code's CLAUDE.md file — the project instructions that load automatically — has roughly 150 effective instruction slots. The system prompt already uses about 50 of them. Every instruction you add competes with the others for attention.

**The pruning test:** For every line in a CLAUDE.md, ask: "Would removing this cause Claude to make a mistake?" If Claude already does it correctly on its own, the instruction is noise. Remove it.

This applies beyond CLAUDE.md. Every prompt has an attention budget. Front-load the important parts. Put the critical instruction at the very beginning or very end — never bury it in the middle.

---

## Hallucinations: When AI Invents

LLMs do not "know" things the way a database knows things. They predict the most likely next words based on patterns. Sometimes the most likely continuation is wrong — confidently, fluently wrong. This is a hallucination.

**Common forms:**
- Inventing function names that do not exist in your codebase
- Citing libraries or APIs with incorrect parameter names
- Claiming a feature exists when it does not
- Generating plausible-looking code that fails silently

**How to handle it:**
- Always test locally. Never deploy code you have not run.
- When uncertain, ask explicitly: "Bist du sicher, dass diese Funktion existiert? Falls nicht, schlag einen verifizierten Weg vor."
- Give Claude verification tools — tests, linters, type checkers. An AI with feedback loops hallucinates less than one without.
- The anti-hallucination pattern: include in your prompt or CLAUDE.md: "Never speculate about code you have not opened. Read the file before answering."

---

## The Confirmation Trap

AI models are trained to be helpful. Helpfulness defaults to agreement. If you say "I think we should use a microservice architecture," Claude will likely agree and explain why that is a great idea — even if a monolith would be better for your case.

**How to break the trap:**
- Ask for counterarguments: "Nenn mir zwei Gründe warum das eine schlechte Idee sein könnte."
- Ask for alternatives: "Was wären die Nachteile gegenüber Ansatz X?"
- State your assumption and ask Claude to challenge it: "Ich gehe davon aus, dass Y. Stimmt das, oder übersehe ich was?"

The meta-rule: Claude is a tool, not a colleague. A tool does not push back. You have to create the conditions for honest feedback by explicitly requesting it.

---

## Focused Sessions

One session, one topic. This is the single highest-leverage habit.

When you are fixing a bug and suddenly ask "Oh, and can you also quickly refactor that other component?" — the session loses focus. Context fills with unrelated information. Quality drops for both tasks.

**Rules:**
- One topic per session. Theme switch = new session.
- Between unrelated tasks in the same session: use `/clear` to reset context.
- After two failed correction attempts on the same issue: start a fresh session with a better initial prompt. The clean context almost always outperforms accumulated corrections.
- Side questions that do not need to persist: use `/btw` — it answers in an overlay without entering conversation history.

---

## Forcing Research

LLMs overestimate their own knowledge. They will answer confidently from training data even when that data is outdated or incomplete. The fix: explicitly ask them to research before answering.

**Instead of:** "Schreib einen Blogartikel über DSGVO-Anforderungen für Kontaktformulare."

**Try:** "Bevor du schreibst — was weißt du aus dem aktuellen Stand zu DSGVO bei Kontaktformularen? Gibt es neue Richtlinien 2025/2026? Recherchier das kurz, dann machen wir die Gliederung."

This pattern — research first, then outline, then execute — reduces hallucinations, brings in current information, and often surfaces considerations you had not thought of.

---

## The Doom Loop

This is the central failure mode of vibe coding: the AI claims to fix a bug but does not actually fix it. You point out it is still broken. The AI apologizes and "fixes" it again — differently broken. You correct again. Context fills with failed approaches. Quality spirals downward.

**How to break it:**
- After two failed fix attempts: stop. Start a fresh session.
- In the new session, describe the problem clearly — including what was already tried and why it failed. "Ich habe X und Y probiert, beides hat nicht funktioniert weil Z. Was ist die eigentliche Ursache?"
- The doom loop usually means the initial diagnosis was wrong. A fresh session forces re-diagnosis.

**Prevention:**
- Plan in markdown, not code. Iterate on requirements in a separate conversation. Discarded ideas in markdown cost nothing. Discarded ideas in code become tech debt.
- Require a diagnosis before a fix: "Erklär mir erst was das Problem ist. Dann fixen wir es zusammen."

---

## The Two-Pass Pattern

Generate first, review second — in separate passes. This is more effective than trying to get it perfect in one shot.

**How it works:**
1. First pass: generate the code, text, or plan. Accept that it will have issues.
2. Second pass: review it critically. Use a fresh session, a different prompt, or even a different model. "Hier ist ein Code-Entwurf. Prüf ihn auf Fehler, Sicherheitslücken, und fehlende Edge Cases."

Research consistently shows: three focused agents working in sequence (generate → review → fix) outperform one generalist working three times as long. This principle is built into cipher-mux's architecture — the Orchestrator delegates to specialized workers rather than doing everything in one session.

---

## The Meta-Rule

Claude is a tool. You decide. You verify. You own the result.

A good tool-user knows what they want, checks the output, and takes responsibility for what goes live. Claude does the heavy lifting and contributes ideas — the judgment and quality assurance stay with the human.

A controlled study in 2025 found that experienced developers were 19% slower with AI tools — while believing they were 24% faster. The subjective experience of speed masks the cost of context-switching, debugging AI-generated code, and the trust-then-verify gap.

The antidote: discipline. Clear prompts, focused sessions, verification before shipping, new sessions when quality drops. Those who internalize this work genuinely faster. Those who trust blindly accumulate invisible debt.

---

## Quick Reference: Patterns That Work

| Pattern | When to use |
|---|---|
| 5-building-block prompt | Every non-trivial request |
| Handover technique | Before ending a long session |
| /clear between tasks | When switching topics in same session |
| Fresh session after 2 failed fixes | When stuck in the doom loop |
| "Recherchier das vorher" | Before any content that needs current facts |
| "Nenn mir Gegenargumente" | Before any decision |
| Two-pass (generate + review) | For anything that will be shipped |
| Anti-hallucination prompt | In CLAUDE.md for critical projects |
| One topic per session | Always |

**Next step:** Guide 05 (Prompting in cipher-mux) covers how to write effective instructions for the Orchestrator, MPO, and Launcher specifically.
