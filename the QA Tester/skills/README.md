# Ideation Skills

Fünf Skills für die Phasen 1 bis 4 einer Ideation. Sie bleiben als Verzeichnis im Template, werden mitkopiert, und stehen damit in jeder neuen Ideation-Session zur Verfügung.

## Überblick

| Skill | Phase | Zweck |
|-------|-------|-------|
| `persona-roundtable` | 3 oder nach v0.1 | Mehrere definierte Personas kommentieren die Idee nacheinander — keine Absprachen, eigene Synthese am Ende. |
| `pre-mortem` | 3 oder nach v0.1 | Scheiter-Szenario 2 Jahre voraus, 7 konkrete Gründe, Gewichtung, Ableitung in Annahmen/Entscheidungen. |
| `future-backwards` | 2 oder 3 | Konkreter Endzustand in 3-5 Jahren, rückwärts in Jahresscheiben, Substanz-vs-Wunsch-Test. |
| `oss-telescope` | 1 / 2 | Open-Source-Bausteine systematisch kartieren, Stückliste + Lückenliste + Lizenz-Check. |
| `external-review` | vor v1.0 | Deliverable durch frische Session auf Kohärenz, Lesbarkeit, Scope-Realismus prüfen. |

## Zwei Klassen von Skills

**In-Session-Skills** (`persona-roundtable`, `pre-mortem`, `future-backwards`, `oss-telescope`) werden vom Main-Agent im laufenden Kontext angewandt. Sie prüfen **Annahmen** des Deliverables.

**Übergabe-Skills** (`external-review`) reichen das Deliverable an eine frische Session weiter. Sie prüfen **Kohärenz, Lesbarkeit und Scope-Realismus** — das, was der Main-Agent nach mehreren Iterationen selbst nicht mehr sehen kann.

Beides hat seinen Platz. Wer nur External Review macht, hat unsaubere Annahmen in saubere Worte gefasst. Wer nur In-Session-Skills macht, hat saubere Annahmen, die niemand versteht.

## Zwei Pflicht-Momente

**Skill-Check nach v0.1** — zwischen erstem Konzept-Entwurf und v0.2. *Welcher In-Session-Skill würde die Annahmen des v0.1-Entwurfs jetzt am stärksten prüfen?* Die Antwort darf "keiner — die Annahmen sind durch den Phase-2-Brief bereits hinreichend geprüft" sein, aber sie muss **bewusst gegeben** werden. Stillschweigendes Überspringen ist der häufigste Fehler.

**External Review vor v1.0** — wenn der Nutzer nach Iteration sinngemäß sagt *"passt schon"* oder der Main-Agent fühlt, dass das Deliverable rund ist, **aktiv anbieten**: *"Sollen wir das vor v1.0 durch eine frische Session challengen lassen?"* Nicht Pflicht, aber Pflicht-Angebot. Der Nutzer entscheidet.

## Typische Skill-Wahl

- *Neue Produkt-/Angebots-Idee:* `pre-mortem` auf die 2-Jahres-Sicht, dann `persona-roundtable` mit 3-4 relevanten Stakeholder-Blicken, dann `external-review` vor v1.0.
- *Ambitioniertes Ziel ohne klare Skalierung:* `future-backwards`.
- *Technisches/AI-Konzept mit Eigenbau-Anteil:* `oss-telescope` noch einmal auf die Lückenliste, plus `pre-mortem` auf das Maintainer-Risiko.
- *Designdokument für Umsetzungs-Flow:* `persona-roundtable` mit Umsetzer-Personas, dann `external-review` mit Fokus auf Scope-Realismus.

## Aktivierung

In Cowork oder Claude Code: Skill wird automatisch vorgeschlagen, wenn der Kontext passt (Description im Frontmatter steuert das). Explizite Auslösung per Schlagwort: *"Mach ein Roundtable"*, *"Pre-Mortem bitte"*, *"Future Backwards auf dieses Ziel"*, *"OSS-Telescope für die Komponenten"*, *"External Review bitte"*.

**Hinweis zur Cowork-Beta:** Ob Skills aus einem beliebigen Unterverzeichnis automatisch geladen werden, ist nicht zuverlässig verifiziert. Im Zweifel explizit sagen: *"Lies die Skills in `skills/` und nutze sie, wenn passend."*

## Kombinationen

Die Skills sind einzeln nutzbar, aber sie spielen zusammen:

- Nach `oss-telescope` oft nützlich: `pre-mortem` — speziell auf das Risiko "Maintainer verschwindet" bei kritischen Bausteinen.
- Nach `future-backwards` fast immer: `pre-mortem` auf den Sollbruchstellen-Jahren.
- Nach v0.1 des Konzepts: `persona-roundtable` als Breiten-Check, dann `pre-mortem` als Tiefen-Check.
- Vor v1.0 des Deliverables: `external-review` als letzter Schritt vor Freigabe.

Keine feste Reihenfolge erzwingen. Die Auswahl folgt dem, was die Idee gerade braucht.

## Output immer ins Brain

Jeder Skill legt seinen Output als eigenständige Note in `brain/` ab. Nicht als Chat-Turn hängen lassen, nicht als lose Datei irgendwo. Verlinkung aus `brain/_index.md` ist Pflicht — tote Notes sind kein Erkenntnisgewinn.

Bei `external-review` sind es zwei Notes: `brain/external-review-briefing_YYYYMMDD.md` (vor dem Review) und `brain/external-review-rueckmeldung_YYYYMMDD.md` (nach dem Review).

## Was (noch) nicht hier ist

Weitere Skills, die auf der Liste standen aber nicht gebaut wurden:

- `domain-shift` — Cross-Industry-Bisociation, Problem in fremde Domänen verschieben
- `constraint-injector` — Harte Randbedingungen zur Provokation
- `brain-probe` — Den eigenen Obsidian-Vault als Analogie-Fundus nutzen
- `narrative-test` — Kann die Idee in 30 Sekunden / 3 Minuten / 15 Minuten erzählt werden

Werden gebaut, wenn ein realer Durchlauf zeigt, wo sie tatsächlich gebraucht würden.
