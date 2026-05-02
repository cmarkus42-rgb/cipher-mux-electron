---
title: "Standardisierte Projekt-Struktur (Ebene 3)"
status: v0.1
date: 2026-04-30
ebene: 3
quelle: konzept-projekt-workspace-struktur.md
referenz: 11-workspace-memory.md, 08-refinement-extended.md, 05-cyber-factory.md, 10-audit.md
---

# 17 — Standardisierte Projekt-Struktur

## Zweck

cipher-mux verwaltet Projekte, in denen mehrere Sessions zusammenarbeiten — Refinement schreibt Specs, Cyber Factory baut Subsysteme, Worker schreiben Code, Audit prueft. Wenn diese Sessions ihre Outputs in willkuerliche Pfade schreiben, entsteht Wildwuchs. Eine standardisierte Projekt-Ordner-Struktur loest das, ohne sie zu erzwingen — wenn Ordner nicht gebraucht werden, bleiben sie leer oder werden nicht angelegt.

Quelle: `moreismore/konzept-projekt-workspace-struktur.md`. Diese Spec macht die Konventionen aus dem Konzept-Doc verbindlich fuer das Cyber-Factory-Pack.

## Ordner-Struktur

```
projekt-name/
├── .claude/                 # Claude Code Config (CLAUDE.md, settings.local.json)
├── .cyber-factory/          # Cyber-Factory-Run-Konfig (Welle-Plan, Off-Limits, Detail-Spec-Verweise)
├── docs/                    # Spezifikationen, Anforderungen, Architektur — committbar
│   ├── specs/               # Refinement-Output: Detail-Specs mit REQ-IDs (.md, mit YAML-Frontmatter)
│   ├── decisions/           # ADRs aus Cyber-Factory-Architekt-Phase (ADR-NNN.md)
│   ├── research/            # Recherche-Ergebnisse aus Ideation Partner (Brain-Notes-Export)
│   └── audit/               # Audit-Berichte aus Audit-Preset
├── src/                     # Quellcode — committbar
├── tests/                   # Tests — committbar
├── moreismore/              # Ideen, Feature-Requests, Parkplatz, Bug-Reports — meist nicht committbar
├── brain/                   # nur waehrend Ideation aktiv (siehe Ideation Partner)
└── .project-meta.json       # cipher-mux Projekt-Metadaten
```

Ordner werden nur angelegt, wenn sie tatsaechlich Inhalte bekommen. Idempotent.

## Entity → Ordner-Mapping

| Entity | Schreibt nach | Liest aus |
|--------|--------------|-----------|
| **Ideation Partner** | `brain/` (waehrend aktiver Ideation), `docs/research/` (bei Uebergabe) | `brain/` selbst, optional Workspace-Memory |
| **Refinement** | `docs/specs/<subsystem>.md` (Detail-Spec mit REQ-IDs) | User-Input, Notes mit Tag `verwendungszweck`, optional `brain/` |
| **Cyber Factory (Architekt-Phase)** | `docs/decisions/ADR-NNN.md`, `.claude/`, `docs/SPEC.md`, `.gitignore`, `tests/`-Skeleton, `.project-meta.json` | `docs/specs/` |
| **Cyber Factory Worker** | `src/`, `tests/` | `docs/specs/`, `docs/decisions/`, Workspace-Memory (Konventionen) |
| **Testing Assistant** | `tests/` (Findings-Test-Suite), Findings-Reports als Notes | `src/`, `tests/`, `docs/specs/` |
| **Debugger** | `src/` (Fixes), `tests/` (Verhaltens-Tests fuer Bugs), Walkthrough-Notes | Findings-Notes, `src/`, `tests/` |
| **Audit** | `docs/audit/<datum>-<run-id>.md` | `src/`, `tests/`, `docs/specs/`, `docs/decisions/` |
| **Companion** | Notes (mit Workspace-Default-Tags), optional Memory-Updates | alles, querschnittlich |

## .project-meta.json

Pro-Projekt-Metadaten-Datei im Projekt-Root. Format:

```json
{
  "version": "1",
  "name": "cipher-mux-electron",
  "createdBy": "cipher-mux",
  "createdAt": "2026-04-30T14:00:00Z",
  "workspace_id": "ws-cipher-mux",
  "default_tags": ["project:cipher-mux", "workspace:hauptprojekt"],
  "verwendungszweck": "hobby-tool",
  "lizenz_policy": "MIT-default",
  "entities_initialized": ["refinement", "cyber-factory"],
  "lifecycle_phase": "architect"
}
```

Diese Datei dient zwei Zwecken:

- *Workspace-Bindung:* cipher-mux erkennt beim Workspace-Wechsel, welcher Projektordner zu welchem Workspace gehoert.
- *Status-Tracking:* der aktuelle Lifecycle-Stand (Anforderungen, Architektur, Build, Test, Audit) ist sichtbar fuer alle Sessions ohne dass sie das aus Datei-Inspektion ableiten muessen.

## Workspace = Projekt-Bindung

Aus `konzept-projekt-workspace-struktur.md`:

Ein Workspace selektiert nicht nur Grid-Belegung und Theme, sondern auch:

- **Projektordner** — der Claude-Code-Arbeitsordner fuer alle Sessions in diesem Workspace
- **Tag-Filter** — welche Notes/Bugs/Features standardmaessig sichtbar sind
- **Entity-Presets** — welche Sessions mit welchen Einstellungen gestartet werden

Wenn ein Workspace aktiv ist, wissen alle Sessions automatisch, an welchem Projekt sie arbeiten. Der `/bugreport`-Skill (siehe `18-bugreport-skill.md`) taggt einen neuen Bug automatisch mit dem Projekt-Tag des aktiven Workspace.

### Workspace-Typ-Erweiterung (cipher-mux Code-seitig)

```typescript
// src/shared/persona-types.ts — Workspace-Erweiterung
interface Workspace {
  // bestehend ...
  projectPath?: string;            // Projekt-Verzeichnis (absoluter Pfad)
  defaultTags: string[];           // z.B. ['project:cipher-mux', 'workspace:hauptprojekt']
  workspaceMemoryEnabled: boolean; // wirkt auf Memory-Scope-Auto-Erbung
}
```

`projectPath` ist optional. Wenn gesetzt: alle Sessions in diesem Workspace starten dort, alle relativen Pfade werden dagegen aufgeloest. `.project-meta.json` lebt am `projectPath`-Root.

## Tag-Konvention

Format: `<klasse>:<wert>`. Beispiele:

| Klasse | Beispiel-Werte | Verwendung |
|--------|----------------|------------|
| `project` | `project:cipher-mux`, `project:trading-app` | Projekt-Identifizierung |
| `workspace` | `workspace:hauptprojekt`, `workspace:experiment-1` | Workspace-Identifizierung |
| `kind` | `kind:bugreport`, `kind:feature-request`, `kind:handover`, `kind:lesson-learned` | Note-Klassifikation |
| `severity` | `severity:hoch`, `severity:mittel`, `severity:niedrig` | bei Findings, Bug-Reports |
| `status` | `status:open`, `status:resolved`, `status:archived` | Bug-/Finding-Lifecycle |
| `verwendungszweck` | `verwendungszweck:hobby`, `verwendungszweck:oss-release`, `verwendungszweck:kommerziell` | aus Refinement |
| `lizenz` | `lizenz:mit`, `lizenz:apache-2`, `lizenz:gpl-3` | aus Refinement |

Tags duerfen frei gewaehlt werden, aber das Klassen-Schema ist die Empfehlung. Auto-Complete im Notes-Editor priorisiert die Klassen.

## Veroeffentlichung vs. Lokal

Klare Trennung im Default-`.gitignore`-Template, das Cyber Factory beim Scaffolding anlegt:

**Committbar:**
- `src/`, `tests/`
- `docs/specs/`, `docs/decisions/`
- `.claude/CLAUDE.md` (Projekt-spezifische Konventionen sind oeffentlich)
- `.gitignore` selbst
- `package.json`, `tsconfig.json`, etc.

**Nicht committbar (Default):**
- `moreismore/` (Ideen, Bug-Reports, persoenliche Parkplaetze)
- `docs/audit/` (kann sensible Findings enthalten)
- `docs/research/` (oft Brain-Dump)
- `brain/` (Ideation-Workspace)
- `.cyber-factory/` (Run-Konfig, oft mit User-Pfaden)
- `.project-meta.json` (kann Workspace-IDs enthalten)
- `.claude/settings.local.json` (User-spezifische Settings)

User kann pro Projekt umstellen — z.B. wenn das Projekt im Team genutzt wird und Audit-Reports geteilt werden sollen, wird `docs/audit/` committbar.

## Projekt-Initialisierung

**Wer legt die Struktur an?**

Reihenfolge typisch:

1. *Ideation Partner* (optional) legt `brain/` und Brain-Notes an, im eigenen Working Directory unter `<workspace.projectPath>/brain/` oder noch losgeloest unter `~/.config/cipher-mux/ideations/<run>/brain/`.
2. *Refinement* schreibt nach Phase 6 die Detail-Spec nach `docs/specs/<subsystem>.md`. Wenn der Projektordner noch nicht existiert: Refinement legt ihn an mit minimaler Struktur (`.claude/`, `docs/specs/`).
3. *Cyber Factory (Architekt-Phase)* macht den Vollausbau: `.claude/CLAUDE.md`, `.cyber-factory/`, `docs/decisions/`, `docs/SPEC.md`, `.gitignore` mit Default-Off-Limits, Test-Setup je nach Stack, `.project-meta.json` mit `lifecycle_phase: 'architect'`.
4. *Worker* erweitert `src/` und `tests/` waehrend des Builds.
5. *Audit* schreibt `docs/audit/<datum>-<run-id>.md` bei Bedarf.

Wenn der User mit einem **bestehenden** Projektordner startet (Cyber-Factory-Pack auf Brownfield-Projekt angewendet), legt das System keine Pflichtordner an. Es nutzt was da ist; Sessions schreiben in die Default-Pfade, wenn sie nicht ueberschrieben sind.

**Brownfield-Migration als eigene Funktion:** Fuer das systematische Adoptieren bestehender Projekte (mit Inventur, Verwendungszweck-Detektion, Pfad-Aliasen, Pack-Light-Auswahl) gibt es die eigene Spec `19-bestehende-projekte-migration.md`. Drei Modi: Voll-Adoption, Pack-Light (selektive Komponenten), Bestandsaufnahme-only. Pfad-Aliase fuer abweichende Code-Strukturen (`source/` statt `src/` etc.) werden in `.project-meta.json` gepflegt.

## Idempotenz

Alle Initialisierungs-Schritte sind idempotent:

- Bestehende Dateien werden **nie** ueberschrieben
- Bestehende Ordner werden **nie** geleert
- Bei Konflikt zwischen Default-Konvention und User-Setup: User-Setup gewinnt

Beispiel: Wenn `docs/specs/` schon existiert, schreibt Refinement seine neue Detail-Spec hinein, ohne den existierenden Inhalt anzufassen.

## ConfigStore-Keys

```typescript
interface ProjectStructureConfig {
  enabled: boolean;
  defaultGitignoreTemplate: string;  // Default: cipher-mux Standard-Template
  enforceMetaFile: boolean;          // Default true: jedes Projekt bekommt .project-meta.json
  publishingPolicy: 'default' | 'team' | 'oss-release'; // Default 'default'
}
```

ConfigStore-Sektion: `project_structure`.

## MCP-Tools

| Tool | Status | Zweck |
|------|--------|-------|
| `mux_project_init` | **Neu** | Projekt-Struktur fuer aktiven Workspace anlegen (idempotent) |
| `mux_project_meta_read` | **Neu** | `.project-meta.json` lesen, Lifecycle-Phase, Tags, Verwendungszweck |
| `mux_project_meta_update` | **Neu** | atomares Update der Meta-Datei |
| `mux_workspace_apply` | Bestehend | erweitert um automatischen `mux_project_init`-Aufruf wenn `projectPath` gesetzt |

## Tests

1. *Idempotenz:* `mux_project_init` zweimal nacheinander → keine Datei wird ueberschrieben
2. *Brownfield-Schutz:* Initialisierung in existierendem Projekt → bestehende Dateien bleiben, neue ergaenzt
3. *Meta-Datei-Update:* Lifecycle-Wechsel von 'architect' → 'build' → Meta-Datei zeigt aktuellen Stand
4. *.gitignore-Default:* nach `mux_project_init` enthaelt `.gitignore` `moreismore/`, `docs/audit/`, `.cyber-factory/`, `.project-meta.json`
5. *Workspace-Wechsel:* Workspace mit `projectPath=A` aktiv → Sessions starten in A; Wechsel zu Workspace mit `projectPath=B` → neue Sessions starten in B
6. *Tag-Auto-Add bei Notes:* Workspace mit `defaultTags=['project:foo']` aktiv → `mux_notes_create({ tags: [] })` → Note bekommt `project:foo` automatisch

## Migration

Bestehende Projekte (cipher-mux selbst, andere User-Projekte) werden **nicht** automatisch migriert. Der User entscheidet pro Projekt, ob er die Struktur uebernehmen will. Migrations-Pfad:

1. User aktiviert Workspace mit `projectPath`-Setting auf ein bestehendes Projekt
2. cipher-mux erkennt fehlende `.project-meta.json` und fragt: "Standard-Struktur initialisieren?"
3. Bei Ja: `mux_project_init` (idempotent, keine bestehenden Dateien werden ueberschrieben)
4. Bei Nein: Workspace funktioniert ohne Meta-Datei; einige Sessions verlieren Auto-Scoping-Funktionen, der Rest funktioniert

Welle-Mapping: Welle 4 (Workspace-Memory + Notes-Integration) implementiert auch das Project-Init-Modul.

## Offene Punkte

- *Cross-Projekt-Notes UX.* Eine Note mit Tags `project:cipher-mux` **und** `project:trading-app` — wie sieht das in der Sidebar aus? Gehoert in UI-Folge-Spec.
- *Veroeffentlichungs-Profile.* Default vs. Team vs. OSS-Release — sind das nur `.gitignore`-Variationen oder auch unterschiedliche Tag-Filter? Phase 2 klaeren.
- *Bestehende-Projekt-Migration.* Bei einem bestehenden komplexen Projekt mit eigener Ordnerstruktur (`source/` statt `src/`, `__tests__/` statt `tests/`) — soll das Pack die abweichenden Pfade akzeptieren? Vorschlag: `.project-meta.json` erlaubt Pfad-Aliase pro Entity.
