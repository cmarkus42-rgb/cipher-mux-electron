---
title: "Bestehende Projekte — Migrations-Funktion (Ebene 3)"
status: v0.1
date: 2026-04-30
ebene: 3
quelle: User-Anforderung 2026-04-30, abgeleitet aus konzept-projekt-workspace-struktur.md (Punkt 3, Brownfield)
referenz: 17-projekt-struktur.md, 08-refinement-extended.md, 11-workspace-memory.md
---

# 19 — Bestehende Projekte: Migrations-Funktion

## Zweck

Das Cyber-Factory-Pack ist primaer fuer Greenfield-Projekte konzipiert (Idee → Refinement → Cyber Factory). Reale Praxis ist aber meistens Brownfield: cipher-mux-electron selbst hat schon eine Codebasis, andere User-Projekte ebenso. Diese Spec definiert, wie das Pack ein **bestehendes** Claude-Code-Projekt adoptieren kann — vollstaendig oder selektiv.

Drei Adoptions-Modi:

1. **Voll-Adoption** — Projekt wird komplett in Pack-Konventionen ueberfuehrt (Ordner-Struktur, REQ-IDs, Persona-System, Workspace-Memory). Sinnvoll bei aktiv-entwickelten Projekten, in denen die Pack-Mechanik echten Nutzen bringt.
2. **Pack-Light** — selektive Adoption nur einzelner Pack-Komponenten (z.B. nur Persona-System + `/bugreport`-Skill, ohne Cyber-Factory-Wellen). Sinnvoll fuer kleine Projekte oder zum schrittweisen Einstieg.
3. **Bestandsaufnahme-only** — nur Inventur ohne Aenderung. Liefert Migrations-Plan-Vorschlag, User entscheidet ob/welche Schritte er umsetzen will.

## Abgrenzung

| Was diese Spec tut | Was sie nicht tut |
|---------------------|---------------------|
| Brownfield-Projekt erkennen und inventarisieren | Greenfield-Anforderungs-Klaerung (Refinement-Greenfield-Modus) |
| REQ-ID-Mapping aus existierenden Specs ableiten | Code-Refactoring (Cyber-Factory-Wellen) |
| Subsystem-Schnitt aus Code-Struktur vorschlagen | Implementations-Aufgaben (Worker-Wellen) |
| Pfad-Aliase fuer abweichende Projekt-Strukturen | Bug-Fixes am Bestand (Debugger) |
| Migrations-Plan mit drei Sektionen produzieren | Test-Befunde am Bestandscode (Testing Assistant) |

## Brownfield-Detektion (Heuristiken)

Vor dem Migrations-Lauf prueft das Modul, ob ein Brownfield-Projekt vorliegt:

| Signal | Bedeutung |
|--------|-----------|
| `.git/` vorhanden + Commits > 10 | Aktiv versioniertes Projekt |
| `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` etc. | Stack erkennbar, Dependencies vorhanden |
| `CLAUDE.md` im Root | Bestehendes Claude-Code-Setup |
| `docs/`, `src/`, `tests/`, `lib/`, `source/` | Existierende Code-Struktur |
| Bestehende `.claude/settings.local.json` | Frueheres MCP-/Modell-Setup |
| `README.md` mit Projekt-Beschreibung | Verwendungszweck-Quelle |

Wenn 3+ dieser Signale: Brownfield. Wenn 0-2: Greenfield-Pfad ueber Refinement empfehlen.

### Verschaerfter Filter — "dezidierter Claude-Code-Projektordner"

Fuer den **automatischen Setup-Run** (Hub-Migration aus `20-cipher-mux-hub.md`) gilt ein verschaerfter Filter — nicht jedes Brownfield-Verzeichnis ist ein Code-Projekt im Sinne der Pack-Mechanik:

**Pflicht-Trio fuer Auto-Migration:**
1. Stack-Manifest vorhanden (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `requirements.txt`, `Gemfile`, `pom.xml`, `build.gradle`, `Makefile` mit Build-Targets)
2. Code-Verzeichnis vorhanden (`src/`, `lib/`, `app/`, `source/`, `cmd/`, `pkg/`)
3. `.git/` mit eigener Historie (nicht nur als Untermodul anderer Repos)

**Wenn alle drei:** dezidierter Claude-Code-Projektordner → wird in Auto-Liste fuer Migration aufgenommen.

**Wenn nicht:** Konzept-/Template-Verzeichnis → wird ausgegraut. User kann manuell picken (z.B. fuer Konzept-Adoption-Modus), aber Default ist *nicht migriert*.

**Beispiele aus typischer cipher-mux-User-Welt:**

| Verzeichnis | Stack | Code | .git | → Auto-Pick? |
|-------------|-------|------|------|--------------|
| `cipher-mux-electron/` | package.json | src/ | ja | **ja** |
| `cipher-mux/` (v1) | package.json | src/ | ja | **ja** |
| `cipher-desktop-electron/` | package.json | src/ | ja | **ja** |
| `ideation MultiSessionCoding/` | nein | nein | ja | **nein** (Template) |
| `WebsiteDesigner/` | nein | nein | ja | **nein** (Konzept-Arbeit) |
| `mux_community/` | nein | nein | ja | **nein** (Konzept) |
| `wissenstransfer-ideation/` | nein | nein | ja | **nein** (Ideation) |
| `pebblebeach/` Inhalte | nein | nein | nein | **nein** (Obsidian-Vault) |

## Batch-Modus (fuer CIPHER-MUX-Hub-Setup)

Setup-Run aus `20-cipher-mux-hub.md` Welle 4 nutzt einen Batch-Modus, der mehrere Projekte gleichzeitig durchgeht:

1. **Auto-Detection auf Quell-Verzeichnis** (Default: `/Users/Shared/Nextcloud/Claude/`)
2. **Filter anwenden** (verschaerfte Heuristik oben)
3. **Vorschlag-Liste** dem User vorlegen — "X Code-Projekte gefunden, Y Konzept-Verzeichnisse (ausgegraut)"
4. **User-Pick** pro Projekt: aktiv (default fuer Code-Projekte) / skip / manuell-picken-fuer-Konzept-Adoption
5. **Modus-Wahl pro Projekt** (Default: Voll-Adoption fuer Code-Projekte)
6. **Sequentielle Verarbeitung** — pro Projekt: Komplett-Kopie nach Hub → Inventur → Migrations-Plan → User-Bestaetigung → Apply → Build/Test-Verifikation → Status-Update

Bei Batch-Lauf: nach jedem Projekt User-Pause-Option ("weiter mit naechstem Projekt? / pause / abbrechen"). Verhindert, dass ein zwischendurch entdeckter Konflikt den ganzen Lauf zum Crashen bringt.

## Konzept-Adoption-Modus (manueller Pick)

Wenn der User explizit ein Konzept-/Template-Verzeichnis ins Hub holen will (z.B. das Ideation-Template, weil er es regelmaessig nutzt):

- *Modus:* Konzept-Adoption (vereinfachter Migrations-Lauf)
- *Was passiert:*
  - Komplett-Kopie nach `CIPHER-MUX/concepts/<name>/`
  - `.project-meta.json` mit `lifecycle_phase: 'concept-adopted'` und `archived_origin`
  - Workspace-Konfig in `CIPHER-MUX/workspaces/ws-<name>.json` mit Tag-Default-Set
  - **Kein** RE-Audit, **kein** Subsystem-Schnitt, **kein** REQ-ID-Mapping
- *Aufwand:* deutlich kleiner als Voll-Adoption fuer Code-Projekte (~10-30 Min pro Konzept-Verzeichnis)

## Modi im Detail

### Modus 1: Voll-Adoption

**Ziel:** Projekt nutzt nach Migration alle Pack-Mechaniken.

**Phasen:**

1. **Brownfield-Inventur (Lese-Phase, idempotent).**
   - Stack-Erkennung aus `package.json` / `pyproject.toml` etc.
   - Code-Struktur kartieren: vorhandene Verzeichnisse, abweichende Konventionen (`source/` statt `src/`, `__tests__/` statt `tests/`)
   - Existierende Specs lesen (`docs/SPEC.md`, `docs/specs/*.md`, `docs/decisions/ADR-*.md`)
   - Test-Suite erfassen (Test-Datei-Anzahl, Test-Framework, gruene/rote Status)
   - Bestehende `CLAUDE.md` lesen (Konventionen, Off-Limits, Build-Befehle)
   - README + package.json fuer Verwendungszweck-Detektion

2. **Verwendungszweck-Detektion.**
   - Heuristiken: `private: true` in package.json → wahrscheinlich persoenlich/intern; OSS-Lizenz im `LICENSE` → wahrscheinlich Release; `homepage`-Feld auf kommerzielle Domain → kommerziell; `name` mit Scope `@company/...` → intern
   - User-Bestaetigung: detektierter Verwendungszweck + Vorschlag fuer Lizenz-Policy
   - Ergebnis als Memory-Eintrag (`scope_kind=workspace, kind=fact, tag=verwendungszweck`)

3. **Subsystem-Schnitt-Vorschlag aus Code-Struktur.**
   - Erste-Ebene-Verzeichnisse unter `src/` (oder Aequivalent) als Subsystem-Kandidaten
   - Cross-Importe analysieren: welche Verzeichnisse referenzieren welche → Abhaengigkeitsgraph
   - Vorschlag: Subsystem-Liste mit Schnittstellen-Hypothesen, fuer jedes ein REQ-ID-Schema (`REQ-S<N>-...`)
   - User-Bestaetigung pro Subsystem, ggf. Korrektur

4. **REQ-ID-Mapping aus existierenden Specs.**
   - Existierende Detail-Specs lesen, Anforderungen extrahieren
   - Pro Anforderung: REQ-ID vergeben, Akzeptanz-Kriterien erfassen oder anlegen, Test-Pfad-Verweis pruefen
   - Bei Anforderung ohne klare Akzeptanz-Kriterien: User-Klaerung
   - Output: REQ-ID-Inventar als `docs/specs/<subsystem>.md` (Pack-Format) — bestehende Specs bleiben, Pack-Format wird zusaetzlich angelegt

5. **RE-Audit auf Brownfield (Lückenpruefung).**
   - Vergleichsmaßstab wie in Refinement: nicht-funktionale Anforderungen, externe Schnittstellen, Privacy-Profil, Test-Strategie
   - Ergebnis: Liste der erkannten Lücken plus Empfehlung pro Lücke (z.B. "Logging-Strategie nicht dokumentiert — ADR-Vorschlag in Migrations-Plan")

6. **Pfad-Aliase.**
   - Wenn Code-Struktur abweicht: `.project-meta.json` mit Pfad-Aliasen anlegen
   ```json
   {
     "path_aliases": {
       "src": "source",
       "tests": "__tests__",
       "docs/specs": "documentation/requirements"
     }
   }
   ```
   - Pack-Sessions (Worker, Audit, etc.) lesen die Aliase und respektieren sie

7. **Migrations-Plan-Output.**
   - Strukturiertes Markdown mit drei Sektionen:
     - *Bleibt unveraendert* — was schon Pack-konform ist (z.B. existierende ADRs in `docs/decisions/`)
     - *Bleibt aber wird erweitert* — was angepasst wird (z.B. existierende Specs werden um REQ-IDs ergaenzt, ohne Inhalt zu aendern)
     - *Kommt neu hinzu* — was das Pack ergaenzt (z.B. `.project-meta.json`, `17-projekt-struktur.md`-Konventionen, Workspace-Default-Tags)
   - User bestaetigt pro Sektion oder pro Eintrag

8. **Uebergabe an Cyber Factory** (optional).
   - Wenn der User nach der Migration eine Cyber-Factory-Welle starten will: REQ-IDs aus Inventar werden Eingang fuer Welle-Plan
   - Wenn nicht: Migrations-Lauf endet hier, Workspace ist Pack-konform aufgesetzt

### Modus 2: Pack-Light

**Ziel:** Nur ausgewaehlte Pack-Komponenten adoptieren.

Auswahl-Modus per User-Entscheidung. Verfuegbare Komponenten:

| Komponente | Was es bedeutet | Aufwand |
|------------|------------------|---------|
| Persona-System | Companion-Tab, 6 Personas, Default-Matrix pro Preset | klein |
| `/bugreport`-Skill | Bug-Reports/Feature-Requests/Lessons-Learned als Notes mit Workspace-Tags | klein |
| Workspace-Tags fuer Notes | bestehende Notes-Datei-Struktur, plus Tag-Filter im Workspace | klein |
| Globale Basisregeln | universelle Tugenden, in Persona-Sektion injiziert | klein-mittel |
| Workspace-Memory in Companion-DB | Schema-Erweiterung, Sub-Sessions schreiben in Workspace-Scope | mittel |
| Refinement-RE-Disziplin | Vor-Implementierungs-Sessions nutzen RE-Audit-Modus | mittel |
| Cyber-Factory-Wellen-Mechanik | volle Multi-Session-Orchestrierung | gross |
| Architekt-Phase + ADR-Schreib-Mechanik | Systems-Engineering-Werkzeug fuer naechstes Refactoring | gross |

User entscheidet pro Komponente Ja/Nein. Modul setzt nur die gewaehlten um.

**Beispiel-Pack-Light-Lauf:**
> User: "Ich will nur Personas und /bugreport, keine Wellen-Mechanik."
> Modul: Migration nur fuer Persona-System + Bug-Report-Skill. Workspace-Default-Tags werden gesetzt, sonst keine Aenderung.
> Ergebnis: Projekt nutzt diese zwei Pack-Komponenten, der Rest des Setups bleibt wie er ist.

### Modus 3: Bestandsaufnahme-only

**Ziel:** Inventur ohne Aenderung.

Nur Phase 1 + Phase 2 + Phase 5 (Lückenpruefung) werden ausgefuehrt. Output ist ein Migrations-Plan-Vorschlag — User entscheidet spaeter, ob/welche Schritte umgesetzt werden.

Sinnvoll, wenn der User erst sehen will, was der Pack ihm bringen wuerde, bevor er etwas aendert.

## ConfigStore-Keys

```typescript
interface BrownfieldMigrationConfig {
  enabled: boolean;
  defaultMode: 'voll' | 'pack-light' | 'bestandsaufnahme'; // Default 'bestandsaufnahme'
  autoDetectVerwendungszweck: boolean;                    // Default true
  preserveExistingFiles: boolean;                          // Default true (idempotent)
  pathAliasesAllowed: boolean;                             // Default true (Brownfield-Realitaet)
}
```

ConfigStore-Sektion: `brownfield_migration`.

## MCP-Tools

| Tool | Status | Zweck |
|------|--------|-------|
| `mux_brownfield_detect` | **Neu** | Heuristik-Lauf: ist das ein Brownfield-Projekt? |
| `mux_brownfield_inventory` | **Neu** | Phase-1-Inventur (idempotent, lesend) |
| `mux_brownfield_migration_plan` | **Neu** | Plan generieren — drei Sektionen-Markdown |
| `mux_brownfield_apply` | **Neu** | Plan-Schritte ausfuehren (User-bestaetigt pro Schritt) |
| `mux_project_init` | Bestehend (siehe `17-projekt-struktur.md`) | wird im Voll-Adoption-Modus aufgerufen |
| `mux_companion_memory_write` | Bestehend | fuer Verwendungszweck + Lizenz-Policy als Workspace-Memory |
| `mux_input_request_create` | Bestehend | User-Bestaetigungen pro Migrations-Schritt |

## Pfad-Aliase — `.project-meta.json` erweitert

```json
{
  "version": "1",
  "name": "<projekt>",
  "createdBy": "cipher-mux-brownfield-migration",
  "createdAt": "2026-MM-DDT...",
  "workspace_id": "<id>",
  "default_tags": [...],
  "verwendungszweck": "<detektiert oder bestaetigt>",
  "lizenz_policy": "<...>",
  "lifecycle_phase": "brownfield-adopted",
  "path_aliases": {
    "src": "source",
    "tests": "__tests__",
    "docs/specs": "documentation/requirements"
  },
  "pack_components": ["persona-system", "bugreport-skill"]  // bei Pack-Light
}
```

`pack_components` ist im Voll-Modus weggelassen (alle Komponenten aktiv) oder enthaelt nur die Pack-Light-Auswahl.

## Migrations-Plan-Format (Phase 7)

```markdown
---
title: "Migrations-Plan: <projekt>"
created: <ISO>
modus: voll | pack-light | bestandsaufnahme
brownfield_signals: 5/6 (Git, package.json, CLAUDE.md, src, README)
verwendungszweck_detektiert: <wert>
---

## Bleibt unveraendert
- `docs/decisions/ADR-001-database-choice.md` — bereits Pack-konformes Format
- `tests/` — Vitest-basiert, Pack-kompatibel
- `.gitignore` — enthaelt schon notwendige Pfade

## Bleibt, wird erweitert
- `docs/SPEC.md` — bekommt REQ-IDs ergaenzt (kein Inhalts-Aenderung)
  - Vorschlag: 12 Requirements identifiziert, REQ-S1-001..REQ-S1-012 vergeben
- `CLAUDE.md` (Root) — bekommt Pack-Konventions-Hinweis am Ende
- `package.json` — keine Aenderung, aber fuer Workspace-Default-Tags ausgewertet

## Kommt neu hinzu
- `.project-meta.json` mit Workspace-ID `ws-<projekt>`, default_tags `[project:<name>]`
- Pfad-Aliase: `src` → `source` (abweichende Code-Struktur)
- Pack-Workspace-Konfig in cipher-mux ConfigStore mit `projectPath=<pfad>`
- (im Voll-Modus zusaetzlich:) Persona-Default-Matrix-Anwendung, Memory-Schema-Erweiterung

## Lücken aus RE-Audit
- Logging-Strategie nicht dokumentiert → ADR-Vorschlag oder Akzeptanz "kein Logging-Bedarf"
- Privacy-Profil unklar → User-Klaerung empfohlen
- Internationalisierungs-Bedarf nicht benannt → falls relevant, in REQ-Inventar nachtragen

## Naechste Schritte (User-Entscheidung pro Punkt)
- [ ] Pack-Komponenten-Auswahl bestaetigen (bei Pack-Light)
- [ ] Subsystem-Schnitt-Vorschlag bestaetigen
- [ ] REQ-ID-Inventar pruefen + Lücken klaeren
- [ ] `.project-meta.json` schreiben
- [ ] Workspace im cipher-mux anlegen
- [ ] (optional) Cyber-Factory-Welle starten
```

## Idempotenz

Alle Brownfield-Phasen sind idempotent:

- Bestehende Dateien werden **nie** ueberschrieben
- Bestehende Konventionen werden **nie** umgeschrieben (z.B. abweichende Ordner-Namen werden via Aliases respektiert, nicht umbenannt)
- Mehrfaches Ausfuehren eines Migrations-Schritts hat den gleichen Effekt wie einmaliges
- Bei bereits laufender Migration (erkennbar an `.project-meta.json` mit `lifecycle_phase: brownfield-adopted`): Modul fragt, ob neu inventarisiert werden soll oder bestehender Plan fortgesetzt wird

## User-Erfahrung im Migrations-Lauf

Der User wird nicht mit einer Wand voller Optionen konfrontiert. Statt dessen:

1. *Brownfield erkannt* → Modul meldet Erkenntnis, schlaegt Modus vor (Default: Bestandsaufnahme)
2. *Inventur laeuft* → kurzer Status-Bericht, dann Verwendungszweck-Detektions-Bestaetigung
3. *Subsystem-Vorschlag* → User bestaetigt oder korrigiert
4. *Migrations-Plan* → User liest, bestaetigt pro Sektion oder pro Eintrag
5. *Apply* → User bestaetigt pro Schritt, kann jederzeit abbrechen

Persona-Default fuer Migrations-Sessions: **Sokrates** (deduktive Klaerung) — wechselt zu **Cipher**, wenn der User "los, mach" sagt.

## Tests

1. *Brownfield-Detektion:* Mock-Verzeichnis mit `.git`, `package.json`, `src/` → 3 Signale → Brownfield erkannt
2. *Idempotenz:* zweite Inventur auf gleichem Verzeichnis → keine Datei geaendert, identisches Ergebnis
3. *Pfad-Aliase:* Mock-Verzeichnis mit `source/` statt `src/` → `.project-meta.json` mit Alias `src → source`
4. *Pack-Light-Auswahl:* User waehlt nur Persona-System + Bug-Report-Skill → nur diese werden umgesetzt, andere unveraendert
5. *Verwendungszweck-Detektion:* `private: true` in package.json → Vorschlag "persoenlich"; OSS-Lizenz erkannt → Vorschlag "OSS-Release"
6. *RE-Audit-Lücken:* Mock-Spec ohne Logging-Strategie → Lücke gemeldet
7. *Migrations-Plan-Format:* drei Sektionen, alle Pflicht-Felder

## Beispiel-Lauf

User aktiviert Workspace `ws-my-project` mit `projectPath=/path/to/existing-project`:

```
[Brownfield-Detektion]
4/6 Signale erkannt: .git, package.json, CLAUDE.md, src/. Brownfield bestaetigt.

[Modus-Vorschlag]
Empfehlung: Bestandsaufnahme. Du siehst was rauskommt, dann entscheidest du.
[Voll-Adoption / Pack-Light / Bestandsaufnahme] → User waehlt Bestandsaufnahme

[Inventur]
Stack: Node.js + TypeScript + Vitest
Code-Struktur: src/, tests/, docs/ — Pack-konform
Bestehende Specs: docs/SPEC.md (8 Requirements ohne IDs)
Verwendungszweck: persoenlich (private: true im package.json) — bestaetigen?
→ User bestaetigt

[RE-Audit]
3 Lücken gefunden:
- Logging-Strategie nicht dokumentiert
- Test-Strategie auf Anforderungs-Ebene fehlt
- Privacy-Profil nicht benannt (bei privatem Projekt vermutlich ok)

[Migrations-Plan]
<Datei generiert>
Naechste Schritte zeigen dir, was kommen wuerde. Apply jetzt oder spaeter?
→ User: "spaeter"

[Lauf-Ende]
Plan unter docs/specs/migration-plan-2026-04-30.md gespeichert.
Bei Bedarf: mux_brownfield_apply mit Plan-Pfad aufrufen.
```

## Migration in Pack-Implementierung

Diese Brownfield-Funktion wird in **Welle 4** implementiert (siehe `12-migration-rebuild.md`), als Teil des Workspace-Memory + Notes-Konsolidierungs-Pakets. Begruendung: braucht ConfigStore-Erweiterung um `path_aliases`, neue MCP-Tools, und das `.project-meta.json`-Konzept aus `17-projekt-struktur.md`.

## Offene Punkte

- *Auto-Detect ungewoehnlicher Stacks.* Die Heuristiken decken Standard-Faelle ab (Node.js, Python, Rust, Go). Bei Embedded, FPGA, ungewoehnliche Sprachen: Heuristik-Lücken. Empfehlung: Stack-Detection-Plugin-System Phase 2.
- *Cross-Repo-Migration.* Wenn ein User mehrere Repos migrieren will: aktuell pro Repo einzeln. Batch-Modus als Folge-Spec.
- *Pack-Update nach Migration.* Wenn das Pack nach der Migration auf v0.5 hochgeht und neue Komponenten dazukommen: bestehende migrierte Projekte sollten ein Update-Tool bekommen. Folge-Spec.
