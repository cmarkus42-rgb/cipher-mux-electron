# Cyber Factory Spec-Pack — INDEX

**Stand:** 2026-04-30
**Auftrag:** Drei-Ebenen-Konzept fuer den naechsten cipher-mux-Schritt — Preset-System mit Tugenden-Verankerung, Trennung Cyber Factory ↔ Debugger ↔ Ideation Partner, Workspace-Memory-Integration.
**Migrationspfad:** Komplett-Rebuild parallel mit Cutover (alte Welt bleibt bis v1.0, neue Welt entsteht daneben, Feature-Flag schaltet um).
**Adressat:** Claude Code zur Umsetzung im cipher-mux-electron-Repository.

---

## Worum es geht

cipher-mux ist heute eine Electron-App mit Grid-basierten Claude-Code-Sessions, Persona-System (Charakter/Sprachstil), Companion-Memory, MCP-Server und Workspace-Editor. Was fehlt: eine konsequente Verankerung der Whitepaper-Tugenden ([Whitepaper VibeCoding Tugenden](../../Whitepaper_VibeCoding_Tugenden.pages), Stand 2026-04-29) im Preset-System, eine saubere Phasen-Trennung entlang des Software-Lebenszyklus, und eine Multi-Session-Architektur, die nicht den Launcher mit der Entwicklungs-Orchestrierung vermischt.

Das Spec-Pack adressiert drei Ebenen, die zusammen ein konsistentes Bild ergeben:

- **Ebene 1 — Tugenden-Verankerung im Preset-System.** Globale Basisregeln (universelle Whitepaper-Tugenden) plus pro Preset rolle-spezifische Akzente. Persona bleibt rein tonal (Relay/Wayne), Companion bleibt Gedaechtnis. Preset = Funktion + Tugenden-Akzente.
- **Ebene 2 — Phasen-Architektur entlang Software-Lebenszyklus.** Sechs Presets, die je eine Phase abdecken: Ideation Partner → Refinement → Cyber Factory (multi-session) → Testing Assistant → Debugger → Audit. Plus Companion und Voice Companion als Querschnittsrollen.
- **Ebene 3 — Multi-Session mit Workspace-Memory.** Cyber Factory als Multi-Session-Orchestrator mit gemeinsamem Gedaechtnis aller beteiligten Sessions; Anbindung an Workspace-Memory-Konzept; Tag-basiertes Routing und Filterung.

## Phasenmodell (Ueberblick)

```
Ideation Partner  →  Refinement  →  Cyber Factory  →  Testing Assistant  →  Debugger  →  Audit
   Recherche/      (Anforderungen      (Multi-Session       (Test/QA          (Bugfix/      (Final-
   Synthese        + Detail-Specs       Build)              + Adversarial)    Polish)       Quality)
   + Brain)        + Scaffolding)
```

Querschnitt: **Companion** (Gedaechtnis und User-Profil), **Voice Companion** (Sprach-Adapter).

## Struktur des Spec-Packs

| Datei | Inhalt |
|-------|--------|
| `00-INDEX.md` | dieses Dokument — Einstiegspunkt fuer Claude Code |
| `01-tugenden-mapping.md` | Whitepaper-Tugenden auf Preset-Rollen gemappt — Arbeitsgrundlage fuer alle Preset-Specs |
| `02-base-rules.md` | Globale Basisregeln (Ebene 1) — universelle Tugenden, MCP-Tools, Sicherheit, Worker-Phasenmodell |
| `03-preset-akzente.md` | Pro Preset: rolle-spezifische Tugenden-Akzente und Verhaltensregeln (Ebene 1) |
| `04-presets-funktional.md` | Funktionale Prompts pro Preset (Ebene 1) — Rolle, Phasen, Tools, Grenzen |
| `05-cyber-factory.md` | Multi-Session-Orchestrierung (Ebene 2) — Architektur, Phasen, Tools, Sub-Session-Protokoll |
| `06-debugger.md` | Bugfixing-Spezialist nach Build-Run (Ebene 2) — Phasen, Tool-Set, Uebergabe |
| `07-ideation-partner.md` | Neuer Preset (Ebene 2) — Brain/Recherche/Synthese, Uebergabe an Refinement |
| `08-refinement-extended.md` | Refinement uebernimmt Scaffolding-Anteil (Ebene 2) — Phasen, Detail-Spec-Generierung |
| `09-testing-assistant.md` | Watchdog-Umbenennung und Schaerfung (Ebene 2) — Adversarial Testing, Findings, Eskalation |
| `10-audit.md` | Audit-Preset (Ebene 2) — Security, Quality, Doku, Findings |
| `11-workspace-memory.md` | Multi-Session-Memory + Workspace-Anbindung (Ebene 3) — Datenmodell, Tools, Filterung |
| `12-migration-rebuild.md` | Komplett-Rebuild-Plan mit Cutover (Migrations-Spec) — Reihenfolge, Feature-Flags, Roll-back |
| `13-test-strategy.md` | Test-Plan fuer Spec-Pack (Whitepaper 6.6: Tests als Reinforcement) |
| `14-offene-punkte.md` | Was bewusst ausserhalb dieses Packs liegt und in Folge-Specs gehoert |
| `15-pre-mortem.md` | Skill-Check: 7 Scheiter-Gruende mit Risk-Score + Konsequenzen (eingearbeitet) |
| `16-persona-presets.md` | Sechs ausgelieferte Personas (Cipher, Relay, Wayne, Kyniker, Sokrates, Glitch) + Persona × Preset Empfehlungs-Matrix |
| `17-projekt-struktur.md` | Standardisierte Projektordner-Struktur, Entity → Ordner-Mapping, `.project-meta.json`, Tag-Konvention |
| `18-bugreport-skill.md` | `/bugreport`-Skill als allgemein verfuegbares Werkzeug: Bug-Reports, Feature-Requests, Lessons Learned, Handover |
| `19-bestehende-projekte-migration.md` | Brownfield-Migrations-Funktion: bestehende Projekte in Pack-Welt bringen. Drei Modi (Voll-Adoption / Pack-Light / Bestandsaufnahme), verschaerfter Code-Projekt-Filter (Stack+Code+Git), Batch-Modus fuer Setup-Run, Konzept-Adoption als Sondermodus |
| `20-cipher-mux-hub.md` | CIPHER-MUX-Hub als neue Quelle der Wahrheit unter `/Users/Shared/Nextcloud/Claude/CIPHER-MUX/`. Komplett-Kopie aller Code-Projekte, Originale bleiben als Archiv. Welle -1 (Hub-Skelett + cipher-mux-electron) plus Welle 4 (alle anderen Code-Projekte) |
| `CLAUDE.md` | Pack-Verzeichnis-CLAUDE.md fuer Sessions, die im Pack arbeiten (Konventionen, Workflow, Sicherheitsregeln) |

Jede Spec ist eigenstaendig lesbar. Die Dateien `02`–`04` zusammen decken Ebene 1 ab, `05`–`10` decken Ebene 2 ab, `11` deckt Ebene 3 ab. `12`–`14` sind Querschnitt.

## Implementierungs-Reihenfolge (empfohlen)

Die Migrations-Spec (`12-migration-rebuild.md`) definiert die genauen Wellen. Grobe Reihenfolge:

1. **Welle 0 — Vorbereitung.** Git-Tag, ConfigStore-Backup-Skript, Test-Suite gruen baseline. Globale Basisregeln (`02-base-rules.md`) als ConfigStore-Sektion implementieren. Template-Engine fuer relay-core einbauen.
2. **Welle 1 — Bestehende Presets refactor-faehig machen.** Refinement-Overlay erweitern um Scaffolding-Phasen. Ideation Partner als neuer Preset anlegen. Audit-Overlay schreiben (heute Luecke).
3. **Welle 2 — Cyber Factory parallel zur MPO.** Neuer Cyber-Factory-Code als Modul `src/main/cyber-factory/`. Multi-Session-Mechanik. Feature-Flag `experimental.cyber_factory` aus.
4. **Welle 3 — Debugger parallel zum Launcher.** Neuer Debugger-Code. Phasen-Workflow nach Build-Run. Feature-Flag `experimental.debugger`.
5. **Welle 4 — Workspace-Memory-Integration.** Datenbankschema-Migration. Tag-basiertes Routing. MCP-Tool-Erweiterungen.
6. **Welle 5 — Cutover.** Feature-Flags default auf neu. ConfigStore-Migration alter User-Setups. Alte Module deprecated.
7. **Welle 6 — Cleanup.** v1.0 — alte Module entfernen. Tests konsolidieren.

## Was dieses Pack NICHT macht

- *Keine UI-Mockups.* Das Pack definiert Verhalten und Architektur, nicht Komponenten-Layouts. UI-Detail-Specs entstehen separat, sobald die ConfigStore- und IPC-Schichten fertig sind.
- *Keine endgueltige Modell-Wahl.* Das Pack referenziert MCP-Tools generisch (mux_*) — die Frage, welches Modell mit welchem Tarif fuer Cyber-Factory-Sub-Sessions Standard wird, bleibt User-Entscheidung.
- *Keine Feature-Vollstaendigkeit fuer Voice.* Voice Companion bleibt im Pack als Querschnittsrolle skizziert; die volle Voice-Implementation laeuft in eigener Spec.
- *Keine Konkurrenz-Analyse.* Das Pack vergleicht nicht Cursor/Cline/Replit. Falls eine Stelle eine externe Best Practice referenziert, geschieht das ueber Whitepaper-Verweis (`Whitepaper Kap. 6.X`).

## Architektur-Anker im Repository

Vor diesem Pack existierte bereits ein durchdachtes Multi-Session-Architektur-Dokument unter `/moreismore/multisession_concept/multi_session_architecture.md` (mit zugehoerigem SVG `multi_session_architecture.svg`). Es definiert die **L0/L1/L2/RV-Schichtung**:

- **L0** Stakeholder + Spec (langlebig, opusplan, schreibt nur Doku)
- **L1** Subsystem-Koordinator (Sonnet, Plan-Modus zwingend, eine Session pro Subsystem)
- **L2** Worker (Subagents in eigenem Worktree, Sonnet/Haiku, TDD-first)
- **RV** Reviewer (frischer Kontext, Sonnet, kein Subagent der schreibenden Session)

Das Pack baut darauf auf, statt es zu ersetzen. Mapping in `05-cyber-factory.md` Sektion "Model-Routing pro Sub-Projekt-Typ":

| L-Schicht | Pack-Aequivalent |
|-----------|------------------|
| L0 | Refinement (Detail-Spec + ADR) plus Welle-Plan-Phase der Cyber Factory |
| L1 | Cyber-Factory-Hauptsession (eine Welle = ein Subsystem) |
| L2 | Cyber-Factory-Worker-Sub-Sessions |
| RV | Testing Assistant + Audit + Code-Review-Subagents |

Anti-Vergessens-Mechanik aus dem Architektur-Doc (REQ-IDs in Spec, Anforderungen in jedem Uebergabeprompt, Spec-Conformance-Check beim Welle-Abschluss) ist Bestandteil der Refinement-Detail-Spec und des Audit-Lifecycles. Worktree-Konvention (`feature/<subsystem>` pro L1) wird vom Welle-Planner umgesetzt.

## Whitepaper-Bezug

Das Pack baut auf dem Whitepaper "Tugenden und Best Practices in der Softwareentwicklung" (Stand 2026-04-29) auf. Wo eine Spec eine Tugend einfuehrt, wird die Whitepaper-Quelle referenziert (z.B. *Plan-Modus, Whitepaper 6.3*). Das Whitepaper liegt unter `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/Whitepaper_VibeCoding_Tugenden.pages` (Quelle) und in der konvertierten Markdown-Fassung im `outputs/whitepaper-tugenden.md` (Arbeitsexemplar fuer dieses Pack).

## Status und Lebendigkeit

Das Pack ist nach Hub-Konzept-Erweiterung und Mux-Eingriffs-Disziplin in der Form **v0.6** (Stand 2026-04-30 spaet). Pack-Pfad: `moreismore/cyber-factory-pack/` im Repository-Root, neben dem operativen Multi-Session-Konzept.

**Aenderung v0.4 → v0.5:** neue Specs `19-bestehende-projekte-migration.md` (Brownfield-Migrations-Funktion mit drei Modi und Batch-Mechanik), `20-cipher-mux-hub.md` (CIPHER-MUX-Hub als neue Quelle der Wahrheit, Welle -1 + Welle-4-Erweiterung). Welle-Plan erweitert: Welle -1 vor Welle 0, Welle 4 voll-migriert alle anderen Code-Projekte.

**Aenderung v0.5 → v0.6:** **Basis-Version 0.9.9 verankert** (freigetesteter Mux-Stand 2026-04-30, ausser Presets). **Mux-Eingriffs-Disziplin** als neue Basisregel (`02-base-rules.md` Punkt 13): Analyse vor Eingriff, User-Abstimmung bei Mux-Integration, 0.9.9 als unverrueckbarer Fallback. Disziplin-Hinweis in jeder Welle (1a-4) explizit verankert. Git-Tag-Konvention korrigiert: Original-Tag `v0.9.9-getestet`, Hub-Pre-Pack-Tag `v0.9.9-pre-pack-cyber-factory`. Skill-Checks durchgefuehrt:
- `pre-mortem` (siehe `15-pre-mortem.md`) — vier kritische Scheiter-Gruende, Konsequenzen eingearbeitet
- `external-review` v1 durch frische Session — 22 von 25 Funden uebernommen, Details in `external-review-integration-2026-04-30.md`
- `external-review` v2 (Brueche/Doppellungen-Fokus) — 14 von 20 Funden uebernommen, 1 begruendet verworfen, 5 bereits adressiert. Details in `external-review-v2-integration-2026-04-30.md`. Strukturelle Aenderungen: Refinement-Rolle scharf gezogen (RE-Disziplin), CF mit Architekt-Phase, Watchdog komplett durch Testing Assistant ersetzt, Memory in Companion-DB konsolidiert (statt separate DBs).

Aenderungen an einzelnen Dateien werden im Frontmatter mit Datum dokumentiert; Strukturaenderungen brauchen einen INDEX-Update.

## Reviews und Verifikationen

| Datei | Zweck |
|-------|-------|
| `external-review-briefing-2026-04-30.md` | Briefing v1 (Verstaendlichkeit/Kohaerenz) |
| `external-review-rueckmeldung-2026-04-30.md` | 25 strukturierte Funde, Review v1 |
| `external-review-integration-2026-04-30.md` | Verarbeitungs-Status pro Fund, Review v1 |
| `external-review-v2-briefing-2026-04-30.md` | Briefing v2 (Brueche/Doppellungen mit cipher-mux-Konzepten) |
| `external-review-v2-rueckmeldung-2026-04-30.md` | 20 strukturierte Funde, Review v2 |
| `external-review-v2-integration-2026-04-30.md` | Verarbeitungs-Status pro Fund, Review v2 |
| `internal-validation-2026-04-30.md` | Konsistenz-Sweep durch Pack v0.4 (7 Inkonsistenzen, 6 behoben, 1 false positive) |
| `start-prompt-implementation-v0.4.md` | Komplett-Startprompt fuer Launcher-Session — sequentielle Pack-Implementierung Welle 0..6 |
