---
name: pre-mortem
description: Scheitern vorwegnehmen — die Idee wird als in 2 Jahren gescheitert angenommen, Gründe werden systematisch gesammelt und nach Wahrscheinlichkeit × Schwere gewichtet. Verwende diesen Skill, bevor eine Idee in die Umsetzung geht (am Ende von Phase 2 oder nach v0.1 des Konzepts). Aktiviert auf Anfrage ("Pre-Mortem", "Was kann schiefgehen", "Welche Risiken") oder wenn eine Idee zu rund klingt.
---

# Pre-Mortem

## Zweck

Eine Idee, die nach Begeisterung klingt, hat oft unsichtbare Schwachstellen. Das klassische Pre-Mortem (Gary Klein) dreht die Perspektive: *Nimm an, das Projekt ist in zwei Jahren gescheitert. Was ist passiert?* Die Frage öffnet Einsichten, die eine Risikoanalyse im Gegenwartstempus nicht liefert — weil das Gehirn Vergangenheit erzählbar macht und Zukunft wegdrängt.

## Ablauf

1. **Zeitrahmen setzen.** Standard: 2 Jahre. Bei schnellen Märkten kürzer (6 Monate), bei Hardware/Infrastruktur länger (3-5 Jahre). Der Zeitraum beeinflusst, welche Arten von Scheitern plausibel werden.

2. **Prämisse aussprechen.** *"Die Idee ist in <X> Jahren gescheitert. Das Projekt ist tot. Was ist passiert?"* Claude formuliert das als Ausgangspunkt der Analyse, nicht als Warnung.

3. **Gründe sammeln.** Sieben Gründe, nicht drei, nicht zwanzig. Sieben zwingt zur Spezifität — die ersten drei sind meist offensichtlich, die letzten drei müssen erarbeitet werden.

   Jeder Grund muss:
   - **konkret** sein (*"Nidal hat das CMS nach 3 Monaten nicht mehr bedient"*, nicht *"Adoption scheiterte"*),
   - **erzählbar** sein (*als ob es passiert ist, Vergangenheitsform*),
   - **falsifizierbar** sein (es muss erkennbar sein, wenn er nicht eintritt).

4. **Gewichten.** Für jeden Grund zwei Werte auf Skala 1-5:
   - *Eintrittswahrscheinlichkeit* (1 = unwahrscheinlich, 5 = wahrscheinlich)
   - *Schaden bei Eintritt* (1 = Kratzer, 5 = Totalausfall)

   Das Produkt ist der Risiko-Score. Score ≥ 12 = kritisch, 8-11 = beobachten, < 8 = dokumentieren und weiter.

5. **Visualisieren.** Matrix als Artifact/Visualize-Widget. X-Achse Wahrscheinlichkeit, Y-Achse Schaden, jeder Grund ein Punkt. Kritischer Quadrant rechts oben. Alternativ Fishbone bei komplexen Ursachenketten.

6. **Ableiten.** Pro kritischem Grund (Score ≥ 12):
   - Ist er *entschärfbar*? Wenn ja: welche Entscheidung/Vorkehrung im Konzept?
   - Ist er *strukturell*? Dann gehört er ins `brain/annahmen.md` als explizite Annahme — und das Konzept muss klarmachen, unter welcher Annahme es trägt.
   - Ist er *unkalkulierbar*? Dann ist die Idee möglicherweise zu früh oder braucht ein Vorab-Experiment.

7. **Ablage.** Ergebnis als Note: `brain/pre-mortem-<thema>-YYYYMMDD.md`. Die kritischen Gründe werden zusätzlich in `brain/_index.md` unter *Risiken* verlinkt und in `brief.md` referenziert.

## Regeln

- **Vergangenheitsform ist Pflicht.** "Der Kunde hat nicht bezahlt" erzählt anders als "Der Kunde könnte nicht zahlen". Die Form öffnet das Denken.
- **Keine Sammelkategorien.** "Der Markt war nicht reif" ist leer. *"Die Zielgruppe hat keine 3 Stunden Einarbeitungszeit investiert, weil das Problem für sie nicht groß genug war"* — das ist ein Grund.
- **Zahlen ehrlich.** Score 5/5 ist selten. Wenn drei Gründe Score 25 haben, lügt die Gewichtung — dann neu kalibrieren.
- **Keine Dopplungen.** Zwei Gründe, die auf dieselbe Ursache zurückgehen, sind ein Grund.

## Anti-Pattern

- *Generischer Risiko-Katalog* — "Wettbewerb, Finanzierung, Team". Das ist keine Pre-Mortem, das ist ein MBA-Folienanhang.
- *Ausweichen auf externe Faktoren* — "Makrolage, Zinsen, Weltlage". Selten das, was eigene Ideen wirklich killt.
- *Keine Konsequenz* — Pre-Mortem ohne Ableitung in Entscheidung/Annahme/Experiment ist Zeitverschwendung.
- *Pre-Mortem zu früh* — vor Phase 2 ist die Idee oft zu unscharf, um spezifische Scheiter-Szenarien zu erzeugen.
