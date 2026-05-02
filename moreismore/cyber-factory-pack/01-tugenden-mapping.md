---
title: "Tugenden-Mapping: Whitepaper auf Preset-Rollen"
status: v0.1
date: 2026-04-30
quelle: Whitepaper_VibeCoding_Tugenden (2026-04-29)
---

# Tugenden-Mapping

Diese Datei ordnet die Tugenden und Praktiken aus dem Whitepaper ([Whitepaper_VibeCoding_Tugenden.pages](../../Whitepaper_VibeCoding_Tugenden.pages), Stand 2026-04-29) den Preset-Rollen im neuen cipher-mux-Konzept zu. Sie ist Arbeitsgrundlage fuer:

- `02-base-rules.md` (universelle Tugenden)
- `03-preset-akzente.md` (rolle-spezifische Akzente)
- `04-presets-funktional.md` (funktionale Prompts)

Die Whitepaper-Kapitel 3, 6 und 7 liefern die Tugenden-Liste; die Preset-Rollen folgen aus Ebene 2 dieses Packs.

## Tugenden-Liste (aus Whitepaper)

### Klassische Tugenden (Whitepaper Kap. 3)

| Tugend | Kurzform |
|--------|----------|
| Sprechende Namen, kleine Funktionen | Clean Code 3.2 |
| Single Responsibility, SOLID | Strukturprinzip 3.3 |
| DRY, KISS, YAGNI, SoC | Strukturprinzip 3.3 |
| Boy Scout Rule | Clean Code 3.2 |
| Command-Query-Trennung | Clean Code 3.2 |
| Test-Driven Development | Disziplin 3.4 |
| Code Review jeder Aenderung | Disziplin 3.4 |
| CI/CD, Versionskontrolle | Disziplin 3.4 |
| Architecture Decision Records | Disziplin 3.4 |
| Ehrliche Schaetzungen, kein Bagatellisieren | Craftsmanship 3.1 |
| Verantwortung fuer Korrektheit durch Testen | Craftsmanship 3.1 |
| Boy-Scout: Code sauberer hinterlassen | Craftsmanship 3.1 |

### Vibe-/Agentic-Coding-Praktiken (Whitepaper Kap. 6)

| Praxis | Kapitel | Worauf sie antwortet |
|--------|---------|----------------------|
| Context Engineering | 6.1 | Kontext-Drift bei zu viel Repository-Input |
| Spec-Driven Development | 6.2 | Code als alleinige Wahrheitsquelle versagt |
| Plan-Modus + Plan/Code-Reviewer | 6.3 | Direktes Implementieren ohne Plan |
| Memory-Files (CLAUDE.md, AGENTS.md) | 6.4 | Implizites Team-Wissen geht verloren |
| Off-Limits-Listen + Risk-Review | 6.5 | Stille Aenderungen an Auth/Payment/Migration |
| TDD als Reinforcement-Signal | 6.6 | LLM braucht engmaschiges Feedback |
| Layered Prompting | 6.7 | Mega-Prompt erlaubt zu viele falsche Annahmen |
| Subagents/Worktrees, Writer/Reviewer | 6.8 | Selber-Pruefen ist verzerrt |
| Hoarding Techniques | 6.9 | LLM rekombiniert nur was du kennst |
| Cognitive-Debt-Tilgung | 6.10 | Black-Box-Code wird unwartbar |
| Ralph-Loop / automat. Verifikation | 6.11 | Manuelle Schleifen sind langsam |
| Autonomy Slider | 6.12 | Risiko-Dosierung pro Domaene |

### Risiko-Domaenen (Whitepaper Kap. 7.2)

| Domaene | Empfohlene Autonomie |
|---------|----------------------|
| Boilerplate, Scaffolding | Hoch |
| Tests, Doku, Erst-Refactoring | Hoch |
| Geschaeftslogik, Integrationen | Mittel (Plan-Review) |
| Architektur, Datenmodell | Niedrig (Mensch entwirft) |
| Auth, Payments, PII, Krypto | Sehr niedrig (Off-Limits) |

## Mapping Tugenden → Presets

Die Matrix ordnet pro Preset zu, welche Tugenden dort *Akzent* (= im Preset-Prompt explizit gemacht) und welche *Selbstverstaendlichkeit* aus den Basisregeln sind. Eine Tugend kann in mehreren Presets Akzent sein.

| Preset | Phase im Lebenszyklus | Akzentuierte Tugenden (Whitepaper-Kap.) |
|--------|----------------------|------------------------------------------|
| **Ideation Partner** | Recherche/Synthese (vor-Spec) | Hoarding 6.9 · Cognitive-Debt-Bewusstsein 6.10 · Layered Thinking 6.7 (auf Konzept-Ebene) · Ehrliche Annahmen 3.1 · Persona-Roundtable + Pre-Mortem als Skills · Confirmation-Bias-Vermeidung |
| **Refinement** | L0 — Anforderungen klaeren mit RE-Disziplin | Requirements-Engineering-Disziplin 6.2 + 3.4 · Lückenpruefung gegen professionelle Anforderungskataloge · Verwendungszweck + OSS-Lizenz-Sondierung · REQ-ID-Pflicht (Anti-Vergessens-Anker) · YAGNI 3.3 · Single Responsibility 3.3 · 5%-Fall-Bewusstsein |
| **Cyber Factory** | L1 + Architekt — Architekt-Phase plus Multi-Session-Build | Architekt-Disziplin 7.2 + 3.3 (Systems Engineering: Subsysteme entlang Kommunikation/Schnittstellen, Testbarkeit als Designziel, Schnittstellen-Verträge mit Augenmerk) · Architecture Decision Records 3.4 · Scaffolding · Plan-Modus 6.3 · Subagents/Writer-Reviewer 6.8 · Off-Limits-Listen 6.5 · TDD-Reinforcement 6.6 · Layered Implementation 6.7 · Autonomy Slider 6.12 · Risk-Review 6.5 · **Token-Disziplin** 6.1 + 5.2 · **Model-Routing** 7.2 + 6.12 + 7.4 |
| **Testing Assistant** | Test/QA (nach Build) | TDD 3.4 · Verhaltens-Tests statt Implementations-Tests 6.6 · Adversarial Testing · Empirische Failure-Modes 4 · Off-Limits-Audit 6.5 (prueft ob die anderen sich an Off-Limits gehalten haben) |
| **Debugger** | Bugfix/Polishing (nach Test) | Plan-Modus 6.3 · Layered Prompting 6.7 (Skelett→Logik→Edge→Refactor in Bugfix-Form) · Linear Walkthrough 6.10 · Risk-Review 6.5 (was hat der Fix angefasst?) · Verhaltens-Test als Reinforcement 6.6 · Confirmation-Bias-Vermeidung (Ist der gefundene Bug wirklich der relevante?) |
| **Audit** | Final-Quality (vor Release) | Code Review 3.4 · Off-Limits-Audit 6.5 · Empirische Sicherheits-Checks 5.1 · ADR-Konsistenz 3.4 · Slopsquatting/Dependency-Verifikation 8 · Cognitive-Debt-Tilgung anbieten 6.10 |
| **Companion** | Querschnitt: Wissensdatenbank + Gedaechtnis + User-Profil + Tutor/Berater/Helfer + Einrichtungs-Guide + Erklaerer aller Konzepte + (auf Wunsch) Steuerung via MCP | Hoarding 6.9 (Wissens-Hub zu Vibe-/Agentic-Coding und cipher-mux selbst) · Cognitive-Debt-Tilgung 6.10 (Linear Walkthrough on demand) · Memory-File-Disziplin 6.4 · Didaktik-Rotation Tutor/Berater/Helfer (level-bewusst aus Companion-Memory) · Erklaer-Faehigkeit fuer alle Preset-Konzepte aus diesem Pack · Steuerungs-Faehigkeit via MCP-Tools (Sessions starten/stoppen, Workspaces wechseln, Notes anlegen) — auf User-Wunsch · Vendor-Lock-in-Bewusstsein 8 |
| **Voice Companion** | Querschnitt: Sprach-Adapter | Kein eigener Tugend-Akzent — uebernimmt vom aktiven Preset, passt nur Tonalitaet an. Sicherheitsregel: keine Credentials laut sprechen |
| **Orchestrator** (bestehende Builtin) | Allgemein-Delegierer (legacy) | Bleibt verfuegbar fuer einfache Delegation. Wird in der neuen Welt von Cyber Factory abgeloest fuer Multi-Session-Builds. Nicht aktiv erweitert — Erbe-Rolle |

## Abgrenzungs-Logik

Welche Tugenden in welchen Preset gehoeren, folgt drei Heuristiken:

**1. Wenn die Tugend in jeder Sitzung relevant ist → Basisregeln, nicht Preset-Akzent.** Beispiel: "Credentials nie lesen" (Sicherheit), "Test-Suite muss gruen sein" (CI-Disziplin). Diese leben in `02-base-rules.md`.

**2. Wenn die Tugend an einer Phase im Lebenszyklus haengt → Preset-Akzent.** Beispiel: Spec-Driven Development gehoert akzentuiert zur Refinement-Phase, nicht zur Cyber-Factory (die liest die Spec, schreibt sie nicht). Confirmation-Bias-Vermeidung gehoert in Ideation Partner und Debugger (beide leiden besonders darunter), aber nicht zwingend in Audit (das ist ohnehin systematisch).

**3. Wenn die Tugend einer Risikodomaene zugeordnet ist → entscheidet ueber Autonomie-Default des Presets.** Beispiel: Cyber Factory hat hohe Autonomie fuer Boilerplate/Scaffolding (Whitepaper 7.2), niedrige fuer Datenmodell-Aenderungen, sehr niedrige fuer Auth/Payment. Das wird im Preset-Prompt als Default-Verhalten verankert.

## Cross-Cutting: Anti-Pattern aus Whitepaper Kap. 4

Das Pack adressiert die acht Failure-Modes aus Whitepaper Kap. 4 systematisch. Pro Failure-Mode wird benannt, welcher Preset oder welche Basisregel die Gegenmassnahme traegt:

| Failure-Mode (Reinform-Vibe-Coding) | Gegenmassnahme im Pack |
|--------------------------------------|------------------------|
| `Accept All` ohne Review | Cyber Factory: Risk-Review vor Accept (Pflicht). Audit: Code Review jedes nicht-trivialen Diff. Basisregel. |
| Code nicht lesen | Companion: Linear Walkthrough als Service. Debugger: Linear Walkthrough nach jedem Fix |
| Tests nachgereicht | Refinement: Test-First in Detail-Spec verankert. Cyber Factory: Test-First-Pflicht bei Worker-Start. Testing Assistant: Verhaltens-Tests pruefen |
| Modellausgabe unkontrolliert | Cyber Factory: Layered Implementation. Refinement: Architektur-Skelett vor Implementierung |
| Fehler-Copy-Paste | Debugger: Phasen-Workflow zwingt zu Verstehen-vor-Fixen |
| YAGNI/KISS-Bruch (Ueberengineering) | Refinement: Scope-Knife. Audit: ADR-Konsistenz-Check |
| `Build me a SaaS in a day` | Refinement: Phase-Gate "Robustheits-Check" |
| Cognitive Debt akkumuliert | Companion: Linear Walkthrough on demand. Audit: Cognitive-Debt-Findings im Final-Report |

## Empirische Risiken (Whitepaper Kap. 5) und ihre Adressierung

| Risiko | Statistik (Whitepaper) | Adressierung im Pack |
|--------|------------------------|----------------------|
| Sicherheitsluecken in AI-Code | 40-62% der Outputs verwundbar | Audit-Preset: Sicherheits-Phase mit OWASP-Checkliste. Off-Limits-Listen aus Basisregeln |
| Iterative Degradation | 37% mehr Schwachstellen nach 5 Iterationen | Cyber Factory: Refactoring-Limit pro Sub-Session. Debugger: Max 2 Retries (uebernommen aus MPO-Overlay) |
| Slopsquatting (halluz. Pakete) | ~20% der LLM-Outputs | Audit: Dependency-Verifikation gegen offizielle Registry. Basisregel: keine `npm install` ohne Verifikation |
| Hardcoded Secrets | `supersecretkey` in 1182 von 20000 Apps | Basisregel: Secret-Scan bei jedem Pre-Commit. Audit: Secret-Scan im Final-Report |
| BOLA / Auth-Fehler in Real-Vorfaellen | Lovable, Moltbook | Audit: Auth-Pfade gehoeren zu Off-Limits-Standardliste; Cyber Factory: Auth-Aenderungen brauchen explizite User-Freigabe (Eskalations-Level 5) |

## Was bewusst nicht gemappt wird

- *Ralph-Loop (Whitepaper 6.11)* ist als allgemeine Praxis im Pack erwaehnt, aber nicht zur Pflicht erhoben. Die Praxis ist umstritten (Token-Verbrennen vs. Selbstheilung), und cipher-mux hat mit MCP-Tools und Watcher-Mechaniken bereits eigene Verifikationsschleifen.
- *Hoarding Techniques (Whitepaper 6.9)* werden als Companion-Akzent aufgenommen — aber die konkrete Umsetzung (TIL-Blog, GitHub-Repo) ist user-seitig, nicht Tooling-Aufgabe.
- *Modellwahl (Whitepaper 7.4)* — bewusste Nicht-Festlegung. Das Pack referenziert MCP-Tools generisch.

## Naechste Schritte

`02-base-rules.md` schreibt die universellen Tugenden aus.
`03-preset-akzente.md` schreibt pro Preset die Akzente aus dieser Matrix aus.
`04-presets-funktional.md` integriert Akzente in die funktionalen Prompts.
