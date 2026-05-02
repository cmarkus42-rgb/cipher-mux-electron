# Requirements: Projekt-Workspace-System

> Erstellt: 2026-04-28, Refinement-Session
> Quelle: konzept-projekt-workspace-struktur.md + User-Input (Voice)
> Status: Draft v2

---

## Projektziel

cipher-mux organisiert Projekte automatisch in einer einheitlichen, vorhersagbaren Ordnerstruktur. Sessions wissen durch CLAUDE.md-Generierung (nicht per Prompt), in welchem Workspace und Projekt sie arbeiten. Notes werden ueber Tags statt starre Ordner-Scopes organisiert. Projekt-Artefakte (Issues, Features, Specs) leben als Dateien im Projektordner UND sind als getaggte Notes in cipher-mux sichtbar.

**Qualitaetsmerkmal:** Projekte die in cipher-mux bearbeitet werden sind von Anfang an ordentlich strukturiert und dokumentiert — das ist Auslieferungsumfang, kein internes Organisationstool.

## Zielgruppe

cipher-mux-Nutzer (Power-User, Entwickler). Nutzen moeglicherweise Markdown-Tools wie Obsidian, VS Code o.ae. parallel — die Struktur muss mit reinen Markdown-Tools kompatibel bleiben (kein proprietaeres Format, sauberes Frontmatter, logische Ordnerstruktur).

---

## Phase 1: Tag-basiertes Notes-Scoping

### Funktionale Anforderungen

| Prio | ID | Anforderung |
|------|----|-------------|
| MUST | WS-01 | Notes haben keinen `workspace-<id>` Scope mehr. Alles ist global, Filterung ueber Tags. |
| MUST | WS-02 | Ein Workspace definiert ein Set von Default-Tags (z.B. `project:cipher-mux`). Bei aktivem Workspace werden diese Tags als Filter vorausgewaehlt. |
| MUST | WS-03 | Notes koennen mehreren Projekten zugeordnet sein (Multi-Tag). |
| MUST | WS-04 | Workspace-Wechsel aendert nur den aktiven Filter, nicht den Zugriff auf Notes. |
| SHOULD | WS-05 | Bug-Reports (Companion-Skill) erhalten automatisch den Projekt-Tag des aktiven Workspace. |
| SHOULD | WS-06 | Sidebar filtert Notes nach aktiven Workspace-Tags (nur projektrelevante Notes sichtbar). |
| COULD | WS-07 | Cross-Projekt-Notes: eine Note mit Tags zweier Projekte erscheint in beiden Filtern. |

### Abwaertskompatibilitaet

- Bestehende Notes mit `workspace-<id>` Scope migrieren (Tag ableiten aus Workspace-Name).
- Bestehende flache Tags bleiben erhalten.

### Abhaengigkeit

- Baut auf dem Notes-Verwaltungssystem (Cluster C.1/C.2 im MPO-Auftrag) auf.
- Tag-Namenskonvention: `project:<name>` als Praefix fuer Projekt-Zuordnung.

---

## Phase 2: Workspace = Projektkontext

### Funktionale Anforderungen

| Prio | ID | Anforderung |
|------|----|-------------|
| MUST | WS-10 | Ein Workspace bindet neben Grid-Layout und Theme auch: Projektordner, Tag-Filter, Entity-Presets. |
| MUST | WS-11 | Sessions erhalten ihren Projektkontext ueber die generierte CLAUDE.md — nicht per Prompt-Injection zur Laufzeit. |
| MUST | WS-12 | Die CLAUDE.md-Generierung ist konfigurierbar und fuegt sich ins Entity-Konzept (Cluster E) ein. Konkreter Mechanismus wird bei Implementierung anhand des aktuellen Codes entschieden. |
| MUST | WS-13 | Jede Entity/Preset und jeder Skill hat Richtlinien, welche Outputs wohin gehoeren (Teil der Preset-Definition). |
| SHOULD | WS-14 | Standardisierte Projektordner-Struktur wird bei Projekt-Initialisierung angelegt. Nicht erzwungen — Ordner entstehen bei Bedarf. |
| COULD | WS-15 | Projekt-Metadaten (Workspace-ID, Tags, Entity-Zuordnungen) werden in einer geeigneten Form persistiert (Format offen). |
| COULD | WS-16 | Bestehende Projekte koennen integriert werden ohne deren Struktur zu zerstoeren (additive Integration). |

### Projektordner-Struktur (Referenz)

```
projekt-name/
+-- .claude/              # Claude Code Config (CLAUDE.md, generiert)
+-- docs/
|   +-- specs/
|   |   +-- open/
|   |   +-- in-progress/
|   |   +-- resolved/
|   +-- plans/
|   |   +-- open/
|   |   +-- in-progress/
|   |   +-- resolved/
|   +-- issues/
|   |   +-- open/
|   |   +-- in-progress/
|   |   +-- resolved/
|   +-- feature-requests/
|   |   +-- open/
|   |   +-- in-progress/
|   |   +-- resolved/
|   +-- research/
|   +-- audit/
+-- src/                  # Quellcode
+-- tests/                # Tests
```

**Prinzip:** Alles was eingesammelt und bearbeitet wird hat einen Status-Flow (open → in-progress → resolved). Status = Ordner, nicht Tag — sichtbar im Dateisystem ohne Tool.

---

## Phase 3: Artefakt-Management via MCP-Tools

### Kernkonzept

Entities und Skills speichern Projekt-Artefakte nicht direkt ins Dateisystem, sondern ueber MCP-Tools. Die Tools kennen die Ordnerstruktur und das Routing. Die CLAUDE.md bleibt schlank (ein Tool-Verweis statt Ordner-Dokumentation).

### Funktionale Anforderungen

| Prio | ID | Anforderung |
|------|----|-------------|
| MUST | WS-20 | `mux_project_save` — speichert ein Artefakt im richtigen Ordner. Parameter: `type` (spec, plan, issue, feature-request, research, audit), `title`, `content`, `status` (default: open). |
| MUST | WS-21 | `mux_project_move` — verschiebt ein Artefakt in einen anderen Status. Parameter: `file` (Titel oder Pfad), `status` (open, in-progress, resolved). |
| MUST | WS-22 | Dateien erhalten sauberes YAML-Frontmatter (Tags, Typ, Datum, Status). cipher-mux indexiert dieses Frontmatter und zeigt die Dateien als Notes in der Sidebar. |
| MUST | WS-23 | Die Tools wissen den aktiven Projektordner aus dem Workspace-Kontext (kein manueller Pfad noetig). |
| SHOULD | WS-24 | Dateiname-Konvention: `<datum>-<kurztitel>.md` (z.B. `2026-04-28-auth-refactor.md`). |
| SHOULD | WS-25 | Skills (Bug-Report, Feature-Request) nutzen `mux_project_save` — der Skill strukturiert den Inhalt, das Tool routet. |

### Hybrid-Modell: Dateisystem vs. interne Notes

| Im Projektordner (browsbar + indexiert) | Nur im mux (internes Notes-System) |
|-----------------------------------------|-------------------------------------|
| Issues / Bug-Reports | Uebergabeprompts / Handoffs |
| Feature-Requests | Session-interne Kommunikation |
| Specs / Plans | Companion-Memory |
| Research / Audit-Berichte | Alles ohne Dateisystem-Auftritt |

**Routing-Regel:** "Wuerde jemand das im Finder/VS Code/Obsidian suchen?" — Ja → Projektordner via `mux_project_save`. Nein → interne Note.

### Entity-Ordner-Zuordnung (Richtlinien in Presets)

| Entity | Produziert (Typ) | Liest aus |
|--------|------------------|-----------|
| Refinement | spec, plan | User-Input, feature-requests |
| Orchestrator | koordiniert | alles |
| MPO | koordiniert | alles |
| Worker | Code (`src/`, `tests/`) | specs, plans |
| Audit | audit | src, tests, specs |
| Watchdog | audit (Testberichte) | src, tests, specs |
| Companion | issue, feature-request (via Skills) | alles |

Diese Zuordnung wird Teil der jeweiligen Preset-Definition (Entity-CLAUDE.md, Cluster E.4).

---

## Meta-Requirements

| Prio | ID | Anforderung |
|------|----|-------------|
| MUST | WS-M1 | Reine Markdown-Struktur — kompatibel mit Obsidian, VS Code, jedem Texteditor. Kein proprietaeres Format. |
| MUST | WS-M2 | Fuegt sich ins Entity-Konzept (Cluster E) ein — Workspace-Kontext ist Teil der CLAUDE.md-Generierung. |
| MUST | WS-M3 | Kein Prompt-Overhead — Sessions werden nicht durch Ordner-Regeln zugespammt. Tools uebernehmen das Routing. |
| MUST | WS-M4 | Zentrale Strukturdefinition — Ordnerstruktur lebt im Tool-Code, nicht verteilt ueber Entity-Prompts. Aenderung an einer Stelle, wirkt ueberall. |
| SHOULD | WS-M5 | Selbstdokumentierend — die Ordnerstruktur ist ohne Erklaerung verstaendlich. |

---

## Constraints

- Integration mit bestehendem Entity-System (Cluster E) ist Pflicht.
- Konkreter Implementierungsmechanismus der CLAUDE.md-Generierung wird bei Umsetzung entschieden.
- Tag-Namenskonvention `project:<name>` als Standard, aber nicht hardcoded.
- Status-Ordner statt Status-Tags fuer Dateisystem-Artefakte (browsbar ohne Tool).

---

## Abgrenzung

**In Scope:**
- Tag-basiertes Scoping fuer Notes
- Workspace bindet Projektordner + Tags + Entities
- Standardisierte Ordnerstruktur mit Status-Flow
- MCP-Tools fuer Artefakt-Management (`mux_project_save`, `mux_project_move`)
- Entity/Skill-Richtlinien (was wohin gehoert)
- CLAUDE.md-Injection des Projektkontexts
- Indexierung von Projektordner-Dateien als Notes in cipher-mux

**Explizit NICHT in Scope:**
- BugReport-Popup fuer externe User (geparkt, separates Konzept)
- Architektur-Entscheidungen zur Implementierung (entscheidet der implementierende Kollege)
- Obsidian-spezifische Features (Kompatibilitaet ja, Plugin nein)

---

## Offene Punkte (vor Implementierung zu klaeren)

1. Exakter Mechanismus der CLAUDE.md-Generierung (separater Block? eigene Datei? dynamischer Abschnitt?)
2. Projekt-Initialisierung: wer legt die Struktur an — Workspace-Setup, Refinement, oder Companion auf Wunsch?
3. Wo leben die Projekt-Metadaten (im Projektordner oder Workspace-Config)?
4. Migration bestehender `workspace-<id>` Scopes
5. Braucht `mux_project_save` ein `mux_project_list` Pendant (Artefakte auflisten/suchen)?

---

## Referenzen

- Quell-Konzept: `moreismore/konzept-projekt-workspace-struktur.md`
- Entity-Konzept (Cluster E): `moreismore/MPO-AUFTRAG-KONSOLIDIERT-2026-04-28.md`
- Notes-System (Cluster C): ebenda
- Learning-Separation (E.6): Routing-Regel "shipped vs. privat" gilt auch hier
