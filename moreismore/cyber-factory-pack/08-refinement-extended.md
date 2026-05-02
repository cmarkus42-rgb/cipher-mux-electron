---
title: "Refinement — Anforderungs-Klärung mit Requirements-Engineering-Disziplin (Ebene 2)"
status: v0.2
date: 2026-04-30
ebene: 2
rolle: L0 (Stakeholder + Spec)
extends: persona-drafts/overlay-refinement.md
---

# 08 — Refinement

## Zweck

Refinement ist die L0-Stufe der L0/L1/L2/RV-Architektur, fokussiert auf **Requirements-Engineering**. Der Refinement-Lauf nimmt eine rohe Idee oder ein Anforderungs-Paket vom Ideation Partner an, prueft systematisch auf Lücken, schaerft die Anforderungen entlang professioneller RE-Praxis und liefert eine **hardwired-Detail-Spec** an die Cyber Factory.

**Was Refinement nicht mehr tut (gegenueber v0.1):** Scaffolding-Aufgaben (Projekt-Geruest aufsetzen) und ADR-Schreiben sind in die Cyber-Factory-Architekt-Phase verschoben (siehe `05-cyber-factory.md` Phase 2). Refinement ist reine Requirements-Arbeit, nicht Architektur-Arbeit.

## Abgrenzung

| Was Refinement tut | Was es nicht tut |
|---------------------|--------------------|
| Anforderungs-Pakete vom Ideation Partner schaerfen | Recherchieren (Ideation Partner) |
| Anforderungs-Lücken-Audit gegen professionelle Kataloge | Code schreiben (Cyber Factory) |
| Verwendungszweck pruefen + OSS-Lizenz-Sondierung | Architektur-Entscheidungen + Subsystem-Zerlegung (Cyber Factory) |
| Detail-Spec mit REQ-IDs liefern (hardwired-Format) | ADRs anlegen (Cyber Factory) |
| Auf Wunsch alternative Output-Formate (5%-Fall) | Projekt-Skeleton aufsetzen (Cyber Factory) |
| 95%-Fall: Übergabe an Cyber Factory | Sub-Sessions starten (Cyber Factory) |

**Faustregel:** Refinement weiss *was* gebaut werden soll und *für wen*. Cyber Factory weiss *wie* es zerlegt und gebaut wird.

## Aenderungen gegenueber v0.1 des Packs

| v0.1 (alt) | v0.2 (neu) |
|------------|------------|
| 6 Phasen mit Detail-Spec + ADRs + Scaffolding | 7 Phasen, alle auf Requirements-Klärung fokussiert |
| Output: Detail-Spec + Projekt-Skeleton | Output: Detail-Spec mit REQ-IDs (hardwired für CF) |
| ADRs in Refinement | ADRs in Cyber-Factory-Architekt-Phase |
| Scaffolding in Refinement | Scaffolding in Cyber-Factory-Architekt-Phase |

## Aenderungen gegenueber heutigem Refinement im Repository

Aus `docs/mpo-specs/persona-drafts/overlay-refinement.md`:

| Heute | Pack v0.2 |
|-------|-----------|
| 5-Phasen-Modell (Ankommen → Einfangen → Landschaft → Schaerfen → Anforderungen) | 7-Phasen-Modell mit RE-Audit, Verwendungszweck-Pruefung, REQ-ID-Pflicht |
| Output: Anforderungs-Paket (geht zum Launcher) | Output: Detail-Spec mit REQ-IDs (geht zur Cyber Factory) |
| Brain-Gedaechtnis (`seed.md`, `brief.md`) | Brain bleibt — wandert eher zum Ideation Partner; Refinement nutzt es als Eingang |
| Skill-Angebote als Trigger im Refinement | Skill-Angebote primaer beim Ideation Partner; Refinement nutzt nur skopiert (z.B. RE-Pattern-Pruefung) |

Wenn der User direkt mit dem Refinement startet (ohne Ideation-Partner-Phase davor — z.B. weil der Auftrag schon klar ist), uebernimmt das Refinement die Phase-0..2-Funktion des Ideation Partners als Light-Variante.

**Brownfield-Sonderfall:** Wenn der User Refinement auf einem **bestehenden** Projekt aufruft (Code da, Specs evtl. da, Konventionen abweichend), nutze nicht die Greenfield-Phasen, sondern uebergib an die Brownfield-Migrations-Funktion (`19-bestehende-projekte-migration.md`). Diese hat eigene Inventur-Phase, Verwendungszweck-Detektion und Pfad-Alias-Mechanik. Erkennungs-Heuristik: 3+ Brownfield-Signale (`.git`, `package.json`, `CLAUDE.md`, `docs/`, `src/`, etc.) — siehe `19-...md` Sektion "Brownfield-Detektion".

## Lifecycle (7 Phasen)

```
Phase 1: Anforderungs-Paket lesen + Pflichtfeld-Check
    ↓
Phase 2: Anforderungs-Lücken-Check + RE-Audit
    ↓
Phase 3: Validierung + Ambiguitaeten + User-Eskalation
    ↓
Phase 4: Anforderungen schaerfen (System-Ebene, funktional, user-facing, UI/UX)
    ↓
Phase 5: Verwendungszweck-Pruefung + OSS-Lizenz-Sondierung
    ↓
Phase 6: Detail-Spec mit REQ-IDs (hardwired-Format)
    ↓
Phase 7: Uebergabe an Cyber Factory (oder 5%-Fall: alternatives Output-Format)
```

### Phase-Details

**Phase 1 — Anforderungs-Paket lesen + Pflichtfeld-Check.**
Eingang vom Ideation Partner per `mux_ideation_handoff_refinement` oder direkt vom User. Pflichtfelder:

- Projektziel
- Zielgruppe / Adressat
- Funktionale Anforderungen
- Meta-Requirements (Stack, Constraints)
- Wirksamkeits-Test
- Ausgeschlossener Scope

Bei fehlenden Pflichtfeldern: User-Input-Request mit Empfehlung, **nicht** raten. Die Pflichtfelder sind hardwired — keine RE-Disziplin ohne diese Basis.

**Phase 2 — Anforderungs-Lücken-Check + RE-Audit.**
Vergleichsmaßstab: professionelle Anforderungskataloge für professionelle Software. Du prüfst systematisch:

- Fehlen funktionale Anforderungen, die bei vergleichbaren Projekten Standard sind?
- Sind nicht-funktionale Anforderungen benannt? (Performance, Sicherheit, Wartbarkeit, Skalierbarkeit, Internationalisierung, Barrierefreiheit, Logging, Observability)
- Sind Schnittstellen zu externen Systemen vollständig beschrieben?
- Sind User-Flows und Use-Cases nachvollziehbar?
- Ist das Datenschutz-/Privacy-Profil benannt? (PII-Handhabung, Speicherort, Löschpflichten)
- Ist die UI/UX-Erwartung skizziert oder zumindest negativ abgegrenzt?
- Gibt es eine Test-Strategie auf Anforderungsebene? (Welche Akzeptanz-Tests sind sinnvoll?)

Bei Lücken: User-Input-Request mit Empfehlung. Bei systematischen Lücken-Mustern: Vorschlag, zurueck zum Ideation Partner zu gehen (`mux_refinement_handoff_ideation`).

**Phase 3 — Validierung + Ambiguitaeten + User-Eskalation.**
Widersprueche und Unklarheiten identifizieren. Selber loesen, was Level 1-2 ist (siehe Eskalations-Hierarchie aus Cyber Factory). Geschmacksentscheidungen, Strategie-Fragen, Irreversibles → User via `mux_input_request_create`.

**Phase 4 — Anforderungen schaerfen.**
Vier Schichten:

- *System-Ebene:* App, Webservice, CLI-Tool, Library, Plugin? Architektur-Stil-Vorgaben (event-driven, request-response, batch)?
- *Funktional:* Was kann das System? Welche Eingaben, welche Ausgaben, welche Zustände?
- *User-facing:* Welche Personas nutzen es? Welche Use-Cases? Welche Prioritäten?
- *UI/UX:* Welche Bedienparadigmen? Welche Visualisierungen? Welche Tonalität?

Hier können auch ganz große Basisentscheidungen gehören (App vs. Webservice, lokal vs. Cloud, Sync vs. Async). **Nicht** die Architektur-Zerlegung — das ist Cyber-Factory-Aufgabe.

**Phase 5 — Verwendungszweck-Pruefung + OSS-Lizenz-Sondierung.**
Wofür wird die Software entwickelt? Persönliches Tool, Open-Source-Release, kommerzielles Produkt, internes Werkzeug, Hobby-Hub? Daraus folgt OSS-Lizenz-Politik (was darf eingebaut werden, was nicht):

- Kommerziell? → Lizenz-Verträglichkeit kritisch (kein GPL ohne bewusste Entscheidung)
- Open Source Release? → Lizenz-Wahl explizit (MIT, Apache, GPL, andere)
- Persönlich/Hobby? → freier, aber dokumentiert
- Intern? → wenig Lizenz-Druck, aber Compliance je nach Branche

Ergebnis als Projektwissen in Workspace-Memory mit Tags `verwendungszweck`, `lizenz-policy`. Cyber Factory liest das in der Architekt-Phase, wenn Dependencies geprüft werden.

**Phase 6 — Detail-Spec mit REQ-IDs.**
Übernommen aus `multisession_concept/multi_session_architecture.md`: jede Anforderung bekommt eine ID nach Schema `REQ-<Subsystem>-<Nummer>`. Pro REQ:

- *Akzeptanz-Kriterien* als Checkbox-Liste
- *Tests* als Pfad-Verweis (welche Test-Datei deckt das ab — Tests werden später von Cyber Factory geschrieben, der Pfad ist Vorgabe)
- *Off-Limits* als explizite Markierung wo relevant
- *Verwendungszweck/Lizenz-Bezug* wo relevant

Ohne REQ-IDs gilt die Detail-Spec als unvollständig — Cyber Factory weist sie zurück.

Format-Beispiel:

```markdown
### REQ-S2-014 · MessageBus persistiert Nachrichten ueber Neustart hinweg

**Akzeptanzkriterien:**
- [ ] Nachrichten werden in SQLite gespeichert mit Timestamp und Session-ID
- [ ] Nach App-Neustart werden ungesendete Nachrichten zugestellt
- [ ] Wenn Empfaenger nicht existiert, Nachricht 7 Tage halten

**Tests:** `tests/messagebus/persistence.test.ts`
**Off-Limits:** keine Schema-Aenderung ohne Migration in `db/migrations/`
```

Ablage gemaess Multi-Session-Architektur unter `docs/specs/<subsystem>.md`. Subsystem-Schnitt ist hier nur **vorlaeufig** — die Cyber-Factory-Architekt-Phase bestaetigt oder revidiert ihn entlang Systems-Engineering-Methoden.

**95%-Fall vs. 5%-Fall:** In 95% der Fälle ist der Output hardwired für die Cyber Factory (REQ-IDs, Detail-Spec-Format). In 5% der Fälle (z.B. Konzept für externen Adressaten, Strategiepapier, Pitch) gibt der User ein anderes Output-Format vor. Dann fällt Phase 6 weg oder wird umformatiert; Phase 7 übergibt an User, nicht an Cyber Factory.

**Phase 7 — Uebergabe an Cyber Factory.**
- `mux_refinement_handoff_cyber_factory({detailSpecPath, projectPath, lifecyclePhase: 'architect'})` aufrufen
- Cyber Factory startet mit Architekt-Phase (Subsystem-Zerlegung, ADRs, Scaffolding) — nicht mit Welle-Plan
- Optional `mux_workspace_apply` mit dem neuen Workspace-Layout

Bei 5%-Fall: User-Bubble "Detail-Spec im alternativen Format fertig — was als naechstes?" statt automatischer Cyber-Factory-Handoff.

## ConfigStore-Keys

```typescript
interface RefinementConfig {
  enabled: boolean;
  hardwiredOutputFormat: 'cyber-factory' | 'custom'; // Default 'cyber-factory'
  reAuditDepth: 'basic' | 'standard' | 'deep'; // Default 'standard'
  ossLicenseSondierungEnabled: boolean; // Default true
}
```

ConfigStore-Sektion: `refinement` (existiert moeglicherweise schon, dann erweitern).

## MCP-Tools

| Tool | Status | Zweck |
|------|--------|-------|
| `mux_notes_create` | Bestehend | Detail-Specs als Notes (parallel zur Datei-Variante) |
| `mux_companion_recall` | Bestehend | User-Praeferenzen, Vor-Projekt-Konventionen |
| `mux_create_session` | Bestehend | bei Bedarf parallele Sub-Sessions fuer Sub-Specs |
| `mux_input_request_create` | Bestehend | User-Eskalation bei Ambiguitaeten |
| `mux_workspace_apply` | Bestehend | neuen Workspace fuer Cyber-Factory-Run aufsetzen |
| `mux_workspace_memory_write` | **Neu (Ebene 3)** | Verwendungszweck + Lizenz-Policy als Workspace-Memory |
| `mux_refinement_handoff_cyber_factory` | **Neu** | Strukturierte Uebergabe an Architekt-Phase |
| `mux_refinement_handoff_ideation` | **Neu** | Bei zu vielen Anforderungs-Lücken zurueck zum Ideation Partner |

`kickoff_complete` (alt) wird **nicht** mehr benoetigt — Scaffolding ist in Cyber Factory.

## Tests

1. *Pflichtfeld-Check:* Anforderungs-Paket ohne Wirksamkeits-Test → Phase 1 blockt mit User-Input-Request
2. *Lücken-Check:* fehlende nicht-funktionale Anforderungen → Phase 2 produziert Empfehlung
3. *Verwendungszweck-Persistenz:* Phase 5 schreibt Workspace-Memory mit `verwendungszweck`-Tag
4. *REQ-ID-Format:* Detail-Spec ohne REQ-IDs → Cyber-Factory-Handoff blockiert
5. *5%-Fall:* `hardwiredOutputFormat='custom'` → Phase 7 übergibt an User, nicht an CF
6. *Handoff-Routing:* zu viele Lücken → `mux_refinement_handoff_ideation` statt `_cyber_factory`

## Persona-Sprachstil

Erbt Relay (Default für Refinement laut Persona-Default-Matrix in `16-persona-presets.md`). Refinement-Akzent: präzise, klärend, leicht hartnäckig bei Unklarheiten. Bei Ambiguitäten nicht raten — fragen.

Beispiel-Output:

> "Anforderungs-Paket gelesen — 12 funktionale Anforderungen, 3 Module. Pflichtfeld 'Wirksamkeits-Test' ist leer. Ohne den weiss die Cyber Factory nicht, wann fertig wirklich fertig ist. Vorschlag: Wirksamkeits-Test = 'manuell laeuft Use-Case 1 + 2 ohne Fehler, Test-Suite gruen, Audit ohne Severity-Hoch'. Reicht das oder anders?"

> "Lücken-Audit: keine Aussage zu Logging, kein Privacy-Profil, kein Internationalisierungs-Bedarf. Bei einem persoenlichen Tool drei Mal akzeptabel; falls das mal extern laufen soll, sind das Stolpersteine. Wofuer ist das gedacht?"

> "Verwendungszweck = Hobby-Hub, kein Release. OSS-Lizenz: MIT als Default, GPL nur bei bewusster Entscheidung. Notiere ich als Workspace-Memory; Cyber Factory liest das beim Dependency-Check."

## Migration

Refinement existiert bereits als Builtin-Entity. Aenderungen:

1. Neuer Code unter `src/main/refinement/` wird um RE-Audit-Modul (`re-audit.ts`), Verwendungszweck-Modul (`purpose-check.ts`) und REQ-ID-Generator (`req-id-builder.ts`) erweitert.
2. Scaffolding-Modul wird **nicht** in Refinement aufgenommen — geht in Cyber Factory.
3. ADR-Generierung wird **nicht** in Refinement aufgenommen — geht in Cyber Factory.
4. Persona-Overlay (`overlay-refinement.md`) wird um die neuen Phasen 2 und 5 ergaenzt.
5. Feature-Flag `experimental.refinement_v2` schaltet die neue Form zu.

Cutover:
- Welle 1b (siehe `12-migration-rebuild.md`): neue Refinement-Funktion parallel zur alten verfuegbar
- Cutover: neue Form wird Default
- v1.0: alte Refinement-Form entfernt

## Offene Punkte

- *RE-Audit-Tiefe pro Verwendungszweck.* Hobby-Tool braucht weniger Audit als kommerzielles Produkt. Empfehlung: `reAuditDepth` als ConfigStore-Setting, Default 'standard', User kann pro Workspace überschreiben.
- *Auto-Detect des Verwendungszwecks.* Wenn der Anforderungs-Paket-Text Hinweise gibt (z.B. "für unsere Kunden", "Open-Source-Release"), kann Phase 5 das vorausfüllen und nur bestätigen lassen.
- *Subsystem-Schnitt im Refinement vs. in CF.* Refinement schlägt einen vorläufigen Schnitt vor (basierend auf REQ-IDs); Cyber Factory bestätigt oder revidiert. Soll Refinement das schon explizit vorschlagen? Empfehlung: ja, als Vorschlag, aber als "wird in CF-Architekt-Phase verifiziert" markiert.
