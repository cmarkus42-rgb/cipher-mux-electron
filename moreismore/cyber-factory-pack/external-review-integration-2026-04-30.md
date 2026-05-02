---
title: "External Review — Integrations-Notiz"
status: v0.1
date: 2026-04-30
reviewer: External Agent (frische Session)
funde_gesamt: 25
hoch: 0
mittel: 5
niedrig: 20
---

# External Review — Integrations-Notiz

Pflichtdokumentation der Funde-Verarbeitung gemaess `external-review`-Skill (siehe `/Users/Shared/Nextcloud/Claude/ideation MultiSessionCoding/skills/external-review/SKILL.md`).

Quelldokumente:
- Briefing: `external-review-briefing-2026-04-30.md`
- Rueckmeldung: `external-review-rueckmeldung-2026-04-30.md`

## Verarbeitungs-Status pro Fund

| Fund | Schwere | Status | Patch in |
|------|---------|--------|----------|
| 1 — Persona-Resolution-Hierarchie in `03` zu implizit | mittel | uebernommen | `03-preset-akzente.md` (Disambiguation-Sektion erweitert mit expliziter Hierarchie) |
| 2 — Refinement→Cyber Factory Handoff vage | mittel | uebernommen | `05-cyber-factory.md` (neue Sektion "Refinement → Cyber Factory Handoff") |
| 3 — Worker-Phasenmodell-Durchsetzung | niedrig | uebernommen | `05-cyber-factory.md` (Sektion "Worker-Phasenmodell-Durchsetzung") |
| 4 — Workspace-Memory Grace-Fallback | niedrig | uebernommen | `11-workspace-memory.md` (Sektion "Grace-Fallback bei deaktiviertem Memory") |
| 5 — Audit als Schleife nicht Finale | niedrig | uebernommen | `04-presets-funktional.md` (Audit-Sektion erweitert) |
| 6 — Max-5-Worker-Durchsetzung | niedrig | uebernommen | `05-cyber-factory.md` (Sektion "Max-Workers-Durchsetzung") |
| 7 — Anwendungs-Beleg konkretisieren | niedrig | uebernommen | `12-migration-rebuild.md` (Welle 1a Akzeptanz-Kriterien praezisiert) |
| 8 — Phase 3/4-Sequenz Debugger | niedrig | offen — niedrige Prio | bleibt implizit; Lifecycle-Diagramm zeigt Sequenz |
| 9 — Brain-Verzeichnis-Scope | niedrig | uebernommen | `03-preset-akzente.md` (Hoarding-Akzent praezisiert) |
| 10 — Companion Mode-Erkennung Mischformen | niedrig | uebernommen | `04-presets-funktional.md` (Companion Spezial-Sub-Modi) |
| 11 — Tag-Policy Workspace-Memory | niedrig | uebernommen | `11-workspace-memory.md` (Sektion "Tag-Policy") |
| 12 — Welle-1a-Schaetzung Puffer | mittel | uebernommen | `12-migration-rebuild.md` (Puffer-Empfehlung in Welle 1a) |
| 13 — Stuck-Heuristik Cyber Factory | niedrig | uebernommen | `05-cyber-factory.md` (Sektion "Stuck-Heuristik") |
| 14 — Risk-Review-Format | mittel | uebernommen | `05-cyber-factory.md` (Sektion "Risk-Review-Format") |
| 15 — Adversarial-Heuristics LLM-Abhaengigkeit | niedrig | offen — niedrige Prio | akzeptiert als Eigenschaft des Presets; bleibt im Review-Doc dokumentiert |
| 16 — Severity-Matrix Audit | niedrig | offen — niedrige Prio | OWASP-Konvention im Audit-Akzent erwaehnt; explizite Matrix in `10-audit.md` Folge-Iteration |
| 17 — Liste irreversibler Aktionen | niedrig | uebernommen | `04-presets-funktional.md` (Companion Spezial-Sub-Modi) |
| 18 — Welle-Plan-Format Cyber Factory | niedrig | uebernommen | `05-cyber-factory.md` (Sektion "Welle-Plan-Format") |
| 19 — Template-Variablen-Doku | niedrig | uebernommen | `02-base-rules.md` (Sektion "Template-Engine fuer Persona-Variablen") |
| 20 — Off-Limits-Quelle Cyber Factory | niedrig | uebernommen | `05-cyber-factory.md` (Sektion "Off-Limits-Liste — Quelle") |
| 21 — Testing→Debugger Routing | mittel | uebernommen | `05-cyber-factory.md` (Sektion "Testing → Debugger Routing") |
| 22 — Brain Workspace-Isolation | niedrig | uebernommen via Fund 9 | abgedeckt durch `03-preset-akzente.md` Hoarding-Praezisierung |
| 23 — Salience-Definition | niedrig | uebernommen | `11-workspace-memory.md` (Sektion "Salience") |
| 24 — Audit→Debugger Loop | niedrig | uebernommen | `04-presets-funktional.md` (Audit-Sektion mit Schleife + Auto-Routing-Regel) |
| 25 — Phasen-Idempotenz | niedrig | uebernommen | `05-cyber-factory.md` (Sektion "Phasen-Idempotenz") |

**Bilanz:** 22 von 25 Funden uebernommen (5 von 5 mittleren, 17 von 20 niedrigen). 3 niedrige Funde bewusst offen gelassen mit Begruendung.

## Begruendete Verwerfungen / Offen-Lassungen

**Fund 8 — Phase 3/4-Sequenz Debugger:**
Empfehlung war "Phase 3 und 4 nicht parallelisierbar". Bewusst nicht expliziert: Das Lifecycle-Diagramm in `06-debugger.md` zeigt Phasen 1-8 sequenziell, mit User-Bestaetigung in Phase 3 als hartem Gate vor Phase 4. Eine Implementierung, die das ueberspringt, verletzt das Diagramm und braucht keine zusaetzliche Wort-Markierung. Falls Welle-3-Implementierung dies anders interpretiert: Fix in der Implementierungs-Welle.

**Fund 15 — Adversarial-Heuristics LLM-Abhaengigkeit:**
Empfehlung war "Backup-Plan dokumentieren falls LLM-Intuition nicht reicht". Bewusst nicht uebernommen: Adversarial Probing **ist** definitionsgemaess kreativ und LLM-getrieben. Eine vorgeschriebene Heuristik-Liste wuerde den Sinn des Adversarial Testings unterlaufen. User-Eskalation bei nicht ausreichender Coverage ist bereits durch Severity-Routing in Fund 21 abgedeckt.

**Fund 16 — Severity-Matrix Audit:**
Empfehlung war "explizite Severity-Matrix in `10-audit.md`". Bewusst noch nicht in dieser Iteration eingepflegt: OWASP-Konvention ist im Audit-Akzent erwaehnt (`03-preset-akzente.md`). Eine vollstaendige Severity-Matrix gehoert in eine eigene Folge-Iteration, idealerweise nach Welle-4-Implementierungs-Erfahrung — dann sind die echten Severity-Faelle bekannt, Matrix wird empirisch fundiert.

## Sekundaer-Empfehlungen aus dem Review

Der Review schloss mit drei Empfehlungen fuer ein "30-minuetiges Klaerungsgespraech mit User vor Implementierung":

1. **Wer triggert Handoff zwischen Phasen?** — Beantwortet durch Fund 2 (Refinement→Cyber Factory: User-Bestaetigung), Fund 21 (Testing→Debugger: severity-abhaengig auto/dialog), Fund 24 (Audit→Debugger: ConfigStore-Setting `audit.autoLoopOnHighSeverity`)
2. **Wo landen Risk-Reviews und Workspace-Memory in der UI?** — Risk-Review als Note mit Kind `risk-review` (Fund 14). UI-Detail bleibt `15-ui-detail.md` (Folge-Spec, siehe `14-offene-punkte.md`)
3. **Brain-Verzeichnis-Scope** — Beantwortet durch Fund 9: workspace-skopiert, mit Fallback ohne Workspace

Die drei Klaerungen sind durch die Patches abgedeckt.

## Versions-Notiz fuer das Pack

Das Pack ist nach Integration der Review-Funde **v0.2**. INDEX wird aktualisiert.

Anwendung der `external-review`-Skill-Regel:
> "Integrationsnotiz ins Deliverable. Am Ende des v1.0-Deliverables oder in der zugehoerigen Versions-Notiz kurz vermerken: External Review durchgefuehrt am YYYY-MM-DD, N Funde uebernommen, M begruendet verworfen."

Vermerk fuer die spaetere v1.0-Releasenotiz:
> "External Review durchgefuehrt am 2026-04-30, 22 Funde uebernommen, 3 begruendet offen-gelassen mit Folge-Iteration. Details in `external-review-rueckmeldung-2026-04-30.md` und `external-review-integration-2026-04-30.md`."
