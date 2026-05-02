# Deliverables

Hier liegen die aus dem `brain/` destillierten Ausgaben. Versioniert in echten v-Sprüngen (v0.1, v0.2, …, v1.0). Format je nach Zielformat-Entscheidung aus Phase 2.

## Versionierungs-Konvention

**Im Gegensatz zum Brain**, wo Notes lebende Dokumente sind, sind Deliverables strikt versioniert:

- `v0.1` — Erster Entwurf aus dem Brief heraus.
- `v0.2`, `v0.3` … — Iterationen nach Skill-Checks (Pre-Mortem, Persona-Roundtable, etc.) oder nach Kunden-Feedback.
- `v1.0` — Freigegebene Fassung. Ab hier ist das Deliverable "live" — Änderungen ergeben neue Minor-Versionen (v1.1, v1.2).

Neue Versionen werden als **neue Dateien** abgelegt, nicht als Überschreibungen. Das macht die Evolution sichtbar und erlaubt Rückgriffe. Beispiel: `konzept_v0.1.md` → `konzept_v0.2.md` → `konzept_v1.0.md` + `konzept_v1.0.docx`.

Beim Sprung von v0.1 auf v0.2 ist der Skill-Check Pflicht (siehe `START_PROMPT.md` und `skills/README.md`).

## Typische Ablagemuster

- **Konzeptpapier**: `konzept_v0.1.md` → `konzept_v1.0.md` + gebaute `konzept_v1.0.docx`. Struktur siehe `_formate/konzept-fuer-adressat.md`.
- **Companion**: als Ordner `companion_v0.1/` mit numerierten Arbeits-Dokumenten. Struktur siehe `_formate/companion-als-ordner.md`.
- **Sandbox** (AI-Use-Case): Eigener Unterordner `sandbox/` mit Docker-Compose, n8n-Flows, Claude-Config, Testdaten, `README.md`. Open-Source-first. Sandboxen werden datumsstempel-versioniert (`sandbox_2026-04-19/`), nicht v-Sprung-versioniert, weil sie als Momentaufnahme funktionieren.
- **Pitch**: `pitch_v0.1.md` + generierte Slides.
- **Business Use Case**: einseitiges Dokument, `business-use-case_v0.1.md`.
- **Nur Brain**: Dieses Verzeichnis bleibt leer — das Brain ist das Deliverable.

Mehrere parallele Deliverables sind erlaubt (z.B. Konzeptpapier + Companion + Business Use Case).
