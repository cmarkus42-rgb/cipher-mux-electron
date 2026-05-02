---
title: "Offene Punkte und Folge-Specs"
status: v0.1
date: 2026-04-30
querschnitt: true
---

# 14 — Offene Punkte und Folge-Specs

Diese Datei sammelt, was bewusst **nicht** in diesem Spec-Pack adressiert ist und in eigenen Folge-Specs gehoert oder als bewusste Nicht-Entscheidung dokumentiert wird.

## Bewusst ausserhalb dieses Packs

### UI-Detail-Specs

Der Spec-Pack definiert Verhalten und Architektur, nicht Layouts. Die folgenden UI-Themen brauchen eigene Specs:

- *Cyber-Factory-Run-Visualisierung in der Sidebar.* Tab, Listen, Status-Indikatoren. Nach Welle 2.
- *Debugger-Findings-Liste mit Severity-Filter.* Nach Welle 3.
- *Workspace-Memory-Browser.* Filter, Such, Edit, Delete. Nach Welle 4.
- *Audit-Report-Viewer.* Strukturierte Anzeige, Klick auf Finding → Source-Datei. Nach Welle 4.
- *Companion-Onboarding-Flow* fuer den Cutover (Welle 5). (entfällt -> noch keine regulären User - sind pre alpha)

### Spec-Learning-Separation Integration (Review-v2-Fund 9)

`moreismore/spec-learning-separation.md` definiert eine Trennung zwischen privatem Wissen (User-Vorlieben, Hack-Notizen) und produktivem Wissen (fuer Release). Diese Trennung wird durch das Pack teilweise abgedeckt:

- *Privat:* Memory mit `scope_kind='user'` (User-Praeferenzen, persoenliche Patterns) — siehe `11-workspace-memory.md`
- *Produkt:* Notes in `docs/specs/`, `docs/decisions/`, `docs/audit/` (committbar) — siehe `17-projekt-struktur.md`

Was im Pack nicht explizit adressiert ist: das Migrations-Mechanik fuer Memory → Notes wenn ein User-Pattern reift zu einem Produkt-Wissen. Das geplante Tool `mux_learning_suggest` aus `spec-learning-separation.md` koennte das automatisieren — aber: nicht im Pack-Scope. Phase 2 nach v1.0.

### BugReport-Popup für Endnutzer (User → Entwickler)

`konzept-projekt-workspace-struktur.md` Punkt 7 beschreibt eine zweite Variante des Bug-Reportings: ein Info-Bereich-Popup mit lokalem LLM, das **Endbenutzern** von cipher-mux ermoeglicht, Bugs an den Entwickler (Christian) zu melden. Lokales LLM hilft beim Formulieren, Report wird per API/Mail/GitHub Issue uebermittelt.

Diese Variante ist explizit **nicht** Teil des Cyber-Factory-Packs. Der Pack-Bug-Report-Skill (`18-bugreport-skill.md`) ist der Entwickler-Kanal. Das Endnutzer-Popup ist Folge-Spec, nachdem das Pack-Setup stabil laeuft. Schwierigkeit: Endnutzer-Identifikation, Datenschutz, Uebermittlungs-Kanal.

Folge-Spec: `20-bugreport-popup-endnutzer.md` (irgendwann nach v1.0).

### Voice Companion vollstaendige Implementierung

`04-presets-funktional.md` skizziert Voice Companion. Die volle Voice-Pipeline (TTS-Output + tieferes STT-Routing) braucht eine eigene Spec. Voice-Companion erbt heute von `voice-relay`-Builtin, was funktional reicht, aber nicht die Cyber-Factory-Phasen mitlaeuft.

Empfehlung: Voice-Detail-Spec nach Welle 5 (Cutover), wenn die anderen Phasen stabil sind.

### Modell-Wahl und Tarifierung — Korrektur 2026-04-30

**Frueherer Stand:** Diese Sektion sagte, Modell-Wahl liege "User-Entscheidung und ausserhalb der Konzeption". Das war falscher Reflex.

**Aktueller Stand:** Model-Routing pro Sub-Projekt-Typ ist Teil der Cyber-Factory-Spezifikation (siehe `05-cyber-factory.md` Sektion "Model-Routing pro Sub-Projekt-Typ"). Default-Tabelle plus User-Override-Mechanik plus Cost-Awareness in der Welle-Bilanz.

**Was bleibt offen:**

- *Lokale Modell-Optionen fuer Companion-Memory-Embeddings.* Phase 2 — siehe Folge-Spec `19-embedding-retrieval.md`.
- *Tarif-Mehrkosten bei parallelen Sub-Sessions.* Wird durch Welle-Bilanz (Phase 10) sichtbar gemacht; konkrete Tarif-Konfiguration pro User-Account bleibt Settings-Frage.
- *Auto-Lernen der Routing-Defaults aus Welle-Bilanzen.* Bei genug historischer Daten koennten die Default-Defaults pro Sub-Projekt-Typ aus Welle-Bilanz-Statistik nachjustiert werden — Folge-Iteration.

### Konkurrenz- und Markt-Analyse

Der Pack vergleicht nicht mit Cursor, Cline, Replit, Lovable usw. Whitepaper-Kapitel 7.4 hat eine Tooling-Tabelle, die als Orientierung reicht.

## Fehlende Bausteine, die kommen

### overlay-audit.md

Aktuelle Luecke (siehe Sub-Agent-Bericht). Wird in Welle 1 erstellt — basierend auf `03-preset-akzente.md` Audit-Sektion und `10-audit.md`. Format-Vorlage: `relay-core.md` + Overlay-Konvention.

### Template-Engine fuer relay-core

`{{display_name}}`, `{{user_profile_yaml}}`, `{{evolved_annotations}}` werden heute nicht aufgeloest. EN-2__globale-basisregeln benennt das. Die Template-Engine wird in Welle 1 (Foundation) miterledigt — nicht als separate Welle.

### Skill-Plugin-System

Der Ideation Partner referenziert Skills aus `~/.config/cipher-mux/skills/ideation/` oder `docs/skills/ideation/`. Heute existiert kein Skill-Plugin-System im cipher-mux. Der Ideation Partner kann aber direkt mit Markdown-Dateien arbeiten, daher ist das System-Plugin-System nicht blockierend.

Folge-Spec: Skill-Plugin-Architektur (irgendwann nach v1.0).

### MCP-Tool-Erweiterungen

Insgesamt schlaegt das Pack folgende neue MCP-Tools vor:

| Tool | Spec | Welle |
|------|------|-------|
| `mux_cyber_factory_handoff_testing` | 05 | 2 |
| `mux_cyber_factory_handoff_debugger` | 05 | 2 |
| `mux_debugger_findings_intake` | 06 | 3 |
| `mux_ideation_skill_run` | 07 | 1 |
| `mux_ideation_handoff_refinement` | 07 | 1 |
| `mux_refinement_handoff_cyber_factory` | 08 | 1 |
| `mux_refinement_handoff_ideation` | 08 | 1 |
| `mux_testing_run_start` | 09 | 4 |
| `mux_testing_findings_handoff_debugger` | 09 | 4 |
| `mux_testing_run_complete` | 09 | 4 |
| `mux_audit_run_start` | 10 | 4 |
| `mux_audit_run_complete` | 10 | 4 |
| `mux_workspace_memory_recall` | 11 | 4 |
| `mux_workspace_memory_search` | 11 | 4 |
| `mux_workspace_memory_write` | 11 | 4 |
| `mux_workspace_memory_forget` | 11 | 4 |

Diese werden in `src/main/mcp/mcp-tools.ts` registriert und in der MCP-Tool-Doku (`docs/mcp-tools.md`) dokumentiert.

## Konzept-Aenderung gegenueber EN-2 (Persona-Zuweisung)

`moreismore/EN-2__globale-basisregeln-persona-system.md` (Section EN-2d) sah vor:
- Toggle pro Preset "Eigene Persona verwenden"
- Inline-Edit-Feld fuer Custom-Persona-Prompt im PresetEditor
- Lokale Persona-Definition pro Preset

Die hier formulierte Architektur (siehe `16-persona-presets.md`) ersetzt das durch:
- Companion-Tab als einzige Erstellungs-/Edit-Stelle fuer Personas
- PresetEditor: Dropdown aus Editor-Pool, kein Inline-Edit
- Default-Matrix beim Seed (verbindlich), User-Auswahl pro Preset moeglich
- Globaler Override per Toggle "Diese Persona global aktivieren" im Companion-Tab

**Begruendung:** Vermeidet Doppel-Pflege (Inline-Persona im Preset driftet vom Editor). Companion-Tab ist Single Source of Truth.

**Aktion:** EN-2d wird in Welle 1a entsprechend umgesetzt — nicht wie urspruenglich in EN-2 spezifiziert. EN-2-Dokument bekommt eine Aenderungs-Notiz im Frontmatter ("EN-2d ueberschrieben durch cyber-factory-pack/16-persona-presets.md ab 2026-04-30").

## Bewusste Nicht-Entscheidungen (mit Begruendung)

### Multi-Instance-Cyber-Factory

Mehrere Cyber-Factory-Sessions parallel sind moeglich (jede in eigenem Workspace), aber **nicht** mehrere Cyber-Factory-Runs in derselben Session. Begruendung: Komplexitaets-Vermeidung. Wer Multi-Run will, oeffnet zwei Workspaces.

### Worker-darf-Sub-Sub-Sessions

Cyber-Factory-Worker duerfen heute *nicht* selbst Sub-Sub-Sessions starten. Begruendung: Hierarchie-Tiefe begrenzen, sonst wird Eskalations-Routing unhaltbar. Wenn ein Worker mehr Hilfe braucht, eskaliert er an Cyber Factory, die entscheidet.

ADR ggf. in Welle 2 anlegen.

### Cross-Workspace-Memory-Lookup

Workspace-Memory ist heute pro-Workspace skopiert. Cross-Lookup (Workspace A liest Memory von Workspace B) ist nicht vorgesehen. Begruendung: Privatheit, Klarheit. Wenn das spaeter benoetigt wird, mit Read-Permission-Kontrolle als Folge-Spec.

### Lokales Embedding-Modell

Workspace-Memory hat ein `embedding`-Feld (BLOB) fuer spaetere Hybrid-Retrieval. Heute leer, wird in Phase 2 (post-v1.0) ueber lokales Modell (Ollama-basiert) befuellt. Whitepaper Kap. 8 (Vendor-Lock-in-Bewusstsein) → lokal bleiben.

## Risiko-Liste

Aufzaehlung der bekannten Risiken in der Umsetzung. Mehr Risiken kommen ggf. nach Pre-Mortem-Skill-Lauf.

| Risiko | Wahrscheinlichkeit | Impact | Mitigationsstrategie |
|--------|---------------------|--------|----------------------|
| Welle 2 (Cyber Factory) komplexer als geschaetzt — Multi-Session-Race-Conditions | Mittel | Hoch | Plan-Modus konsequent, Worker-Startup-Protokoll dokumentiert, Tests vor Cutover |
| Cutover (Welle 5) bricht User-Setup | Niedrig | Hoch | Backup-Skript + Reverse-Modus + manuelle Migration-Tests vor Default-Aenderung |
| Test-Drift in Doppel-Welt-Phase | Mittel | Mittel | CI laeuft beide Welten, Pre-Push-Hook erzwingt beide |
| Confirmation Bias im Konzept selbst (User + Agent zusammen schreiben sich was schoen) | Mittel | Mittel | Pre-Mortem-Skill nach Pack v0.1, External Review nach Welle 4 |
| Iterative Degradation in Spec-Iterationen | Mittel | Mittel | Spec-Aenderungen mit Versionierung im Frontmatter, Aenderungs-Notiz |
| Ideation-Partner-Confirmation-Bias (Persona Wayne als Default) | Niedrig | Mittel | Persona im Ideation-Preset auf Relay sperren oder warnen |
| Workspace-Memory wird zur Pseudo-CLAUDE.md (Doppel-Pflege) | Mittel | Mittel | Konventions-Klarheit: CLAUDE.md ist statische Konvention, Workspace-Memory ist Run-Stand |

## Folge-Specs (post-Pack)

| Spec | Trigger | Inhalt |
|------|---------|--------|
| `15-ui-detail.md` | Nach Welle 4 | Cyber-Factory-Sidebar, Debugger-Findings-Liste, Workspace-Memory-Browser, Audit-Report-Viewer |
| `16-voice-detail.md` | Nach Welle 5 | Voice Companion vollstaendig (TTS-Output, deeperes STT-Routing) |
| `17-cross-workspace-memory.md` | Bei Bedarf | Wenn Anwender-Use-Case erscheint |
| `18-skill-plugin-system.md` | Post-v1.0 | Skill-Plugins als Marketplace |
| `19-embedding-retrieval.md` | Post-v1.0 | Hybrid FTS+Embedding fuer Memory |

## Dokumentations-Pflichten

Mit dem Cutover (Welle 5) werden folgende Dokumente aktualisiert:

- `README.md` — Erwaehnung Cyber Factory, Debugger, Testing Assistant, neue Phasen-Architektur
- `CLAUDE.md` — neue Modul-Liste in Projektstruktur, neue Builtin-Entities
- `ARCHITECTURE.md` — neue Phasen-Architektur, Workspace-Memory
- `docs/mcp-tools.md` — neue MCP-Tools dokumentiert
- `docs/decisions/ADR-XXX-cyber-factory-rebuild.md` — ADR fuer den Rebuild-Ansatz
- `docs/decisions/ADR-XXX-workspace-memory.md` — ADR fuer Workspace-Memory-Architektur
- `CHANGELOG.md` — pro Welle ein Eintrag

## Spec-Pack-Lifecycle

Diese Spec-Sammlung lebt. Aenderungen pflegen den Frontmatter:

```yaml
---
status: v0.1 → v0.2 → v1.0
date: 2026-04-30
last_change: 2026-05-XX
change_log:
  - 2026-05-XX: Welle-2-Implementation-Erfahrung integriert
---
```

Aenderungen an mehreren Dateien gleichzeitig brauchen einen INDEX-Update (`00-INDEX.md` Versions-Notiz).

## Pre-Mortem-Erinnerung

Skill-Check ist Pflicht nach v0.1 (siehe `15` falls erstellt). `pre-mortem` wird vor Welle 1 ausgefuehrt. `external-review` wird vor Welle 5 ausgefuehrt.
