# Format: Companion als Ordner

Alternative zur monolithischen Companion-Datei: Der Companion ist ein **numerierter Ordner mit Arbeits-Dokumenten**. Vorteil: Einzelne Dokumente sind situativ greifbar nutzbar — für Consultant und Kunde — statt eine große Datei erst durchsuchen zu müssen.

Entstanden beim Wissenstransfer-Durchlauf (2026-04-19). Referenz-Implementierung: `/Users/Shared/Nextcloud/Claude/wissenstransfer-ideation/deliverables/companion_v0.1/`.

## Wann dieses Format?

- Beratungsprodukte mit mehreren wiederkehrenden Session-Typen (Interview-Leitfäden, Vorlagen, Persona-Skripte)
- Companions, die *während* der Arbeit griffbereit sein müssen, nicht nur *vor* der Arbeit gelesen werden
- Templates, die einzeln an Kunden weitergegeben werden können sollen

Nicht geeignet für: Kleine Companions (< 5 Arbeits-Dokumente) — dann ist eine Datei klarer. Oder Companions, deren Dokumente stark aufeinander aufbauen — dann ist die Linearität einer Datei ein Feature.

## Struktur

```
companion_v0.1/
├── README.md                    — Wegweiser, Überblick, Nutzungs-Hinweise
├── 01_<name>.md                 — Nummerierte Arbeits-Dokumente
├── 02_<name>.md
├── 03_<name>.md
...
└── 99_glossar.md                — Optional: Glossar / Begriffe
```

## Nummerierung

- Zweistellige Nummern mit führender Null (`01_`, `02_` ... `99_`).
- Nummer signalisiert **empfohlene Reihenfolge der Nutzung**, nicht der Entstehung.
- Glossar/Referenz-Dokumente am Ende (`99_`).
- Lücken in der Nummerierung sind erlaubt, um spätere Einfügungen zu ermöglichen (z.B. `01_`, `02_`, `05_`, `99_` — Platz für `03_` und `04_`).

## Frontmatter-Konvention

Jedes Arbeits-Dokument hat ein schlankes Frontmatter:

```yaml
---
titel: <Kurzer Titel>
typ: <Session-Leitfaden | Persona | Vorlage | Checkliste | Roadmap | Glossar>
nutzung: <Phase des Kundenprozesses, in der das Dokument greift>
version: 0.1
---
```

## `README.md` als Wegweiser

Die `README.md` des Companion-Ordners ist kein Glossar und kein Inhaltsverzeichnis, sondern ein *Wegweiser*: Sie erklärt, *wann* man welches Dokument zieht. Struktur:

- Kurz: Was ist dieser Companion?
- Nutzungs-Logik: In welcher Reihenfolge werden die Dokumente typischerweise gezogen? Welche sind Pflicht, welche optional?
- Liste der Dokumente mit Einzeilern (nicht mehr).
- Versions-Notiz.

## Dokumenten-Typen (typische Beispiele)

**Session-Leitfäden** — Was passiert in Session X? Welche Fragen, welche Methoden, welche Zielergebnisse? Ein Dokument pro Session-Typ, nicht pro Session-Nummer.

**Personas** — Rollen, die der Consultant (oder der KI-Assistent) in bestimmten Momenten einnimmt. Beispiel: `butler.md`, `sparring.md`, `senior-voice.md`.

**Vorlagen** — Leere Strukturen, die der Kunde füllt. Beispiel: Mindmap-Vorlage, Interview-Protokoll-Vorlage, Roadmap-Template.

**Checklisten** — Abarbeitbare Punkte vor/während/nach einem Meilenstein.

**Roadmaps** — Zeitliche Struktur eines typischen Kundenprojekts oder einer Kundenphase.

**Glossar** — Begriffe, die im Beratungsprodukt eine definierte Bedeutung haben (z.B. "Brain" vs. "Vault" vs. "Companion").

## Anti-Pattern

- *Ein Dokument pro Micro-Thema.* Wenn zwei Dokumente thematisch zusammengehören und gemeinsam gezogen werden, sollen sie ein Dokument sein.
- *Linearität erzwingen.* Wenn die Dokumente nur in genau einer Reihenfolge nutzbar sind, ist eine einzelne Datei besser.
- *README aufblähen.* Der Wegweiser soll kurz bleiben — nicht den Inhalt der Dokumente wiederholen.
- *Nummerierung als Entstehungs-Chronologie.* Nummerierung signalisiert Nutzungs-Reihenfolge, nicht "wann ich das geschrieben habe".
