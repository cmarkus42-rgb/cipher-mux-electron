---
name: pre-mortem
description: "Scheitern vorwegnehmen — das Projekt wird als in 6 Monaten gescheitert angenommen, Gruende werden systematisch gesammelt und gewichtet. Verwende diesen Skill wenn die Idee zu rund klingt, niemand Einwaende hat, oder vor der finalen Anforderungs-Version. Aktiviert auf Anfrage ('Pre-Mortem', 'Was kann schiefgehen') oder wenn Relay es vorschlaegt."
---

# Pre-Mortem

## Zweck

Eine Idee die nach Begeisterung klingt hat oft unsichtbare Schwachstellen. Das Pre-Mortem (Gary Klein) dreht die Perspektive: *Nimm an, das Projekt ist in sechs Monaten gescheitert. Was ist passiert?* Die Frage oeffnet Einsichten die eine Risikoanalyse im Gegenwartstempus nicht liefert — weil das Gehirn Vergangenheit erzaehlbar macht und Zukunft wegdraengt.

Im Software-Kontext: Was wuerde dazu fuehren, dass das Projekt nach dem Bauen nicht benutzt wird, nicht funktioniert, oder nie fertig wird?

## Ablauf

1. **Zeitrahmen setzen.** Standard: 6 Monate (Software-Projekte sind kurzlebiger als Geschaeftsideen). Bei grossen Projekten: 12 Monate. Bei einem Weekend-Hack: 4 Wochen.

2. **Praemisse aussprechen.** *"Dein Projekt ist in <X> gescheitert. Es liegt brach, niemand benutzt es, oder es wurde nie fertig. Was ist passiert?"*

3. **Gruende sammeln.** Sieben Gruende. Die ersten drei sind offensichtlich, die letzten drei muessen erarbeitet werden.

   Jeder Grund muss:
   - **konkret** sein ("Niemand hat das Login gebaut weil unklar war ob OAuth oder Magic Link", nicht "Authentifizierung war schwierig")
   - **erzaehlbar** sein (Vergangenheitsform, als ob es passiert ist)
   - **falsifizierbar** sein (man kann erkennen wenn er nicht eintritt)

4. **Gewichten.** Pro Grund zwei Werte auf Skala 1-5:
   - *Eintrittswahrscheinlichkeit* (1 = unwahrscheinlich, 5 = wahrscheinlich)
   - *Schaden bei Eintritt* (1 = Kratzer, 5 = Projekt tot)

   Produkt = Risiko-Score. Score >= 12 = kritisch, 8-11 = beobachten, < 8 = dokumentieren.

5. **Ableiten.** Pro kritischem Grund (Score >= 12):
   - *Entschaerfbar?* → Welche Anforderung oder Entscheidung im Dokument verhindert das?
   - *Strukturell?* → Explizite Annahme in den Anforderungen, unter der das Projekt traegt.
   - *Unkalkulierbar?* → Vorab-Experiment oder Prototyp noetig, bevor volle Umsetzung.

6. **Rueckfluss.** Kritische Gruende fliessen zurueck in die Anforderungen:
   - Als "Bekannte Risiken und Annahmen"
   - Als Scope-Aenderung wenn ein Grund zeigt dass der Scope unrealistisch ist
   - Als Constraint wenn ein Grund eine technische Entscheidung erzwingt

7. **Ablage.** Ergebnis als Note: `brain/pre-mortem.md`. Kritische Gruende zusaetzlich in `brain/_index.md` unter *Risiken*.

## Regeln

- **Vergangenheitsform ist Pflicht.** "Der User hat nach dem dritten Screen aufgegeben" erzaehlt anders als "Der User koennte aufgeben".
- **Keine Sammelkategorien.** "Die Technik war zu komplex" ist leer. "Das Team hat 3 Wochen mit der Datenbankwahl verbrannt weil niemand sich entschieden hat" — das ist ein Grund.
- **Zahlen ehrlich.** Score 5/5 ist selten. Wenn drei Gruende 25 haben, luegt die Gewichtung.
- **Keine Dopplungen.** Zwei Gruende mit derselben Ursache sind ein Grund.

## Anti-Pattern

- *Generischer Risiko-Katalog.* "Wettbewerb, Zeit, Budget." Das ist kein Pre-Mortem.
- *Nur externe Faktoren.* "Der Markt war nicht reif." Selten das was eigene Projekte killt.
- *Keine Konsequenz.* Pre-Mortem ohne Rueckfluss in die Anforderungen ist Zeitverschwendung.
- *Zu frueh.* Vor Phase 3 ist die Idee zu unscharf fuer spezifische Scheiter-Szenarien.
