---
name: scope-knife
description: "Scope zurueckschneiden wenn er sich aufblaeht. Trennt Must von Should von Could, identifiziert das kleinste lieferfaehige Produkt. Verwende diesen Skill wenn die Anforderungen wachsen, 3+ Erweiterungen im Brief gelandet sind, oder der User 'das wird gerade viel' signalisiert. Aktiviert auf Anfrage ('Scope-Knife', 'Das ist zu viel', 'Runterschneiden') oder wenn Relay es vorschlaegt."
---

# Scope-Knife

## Zweck

Ideen wachsen. Jede gute Frage fuehrt zu einer Erweiterung, jeder Einwand zu einem zusaetzlichen Feature, jeder Wunsch zu einem "das koennte man noch...". Am Ende ist aus einer fokussierten Idee ein Monsterprojekt geworden das nie fertig wird.

Der Scope-Knife ist der ehrliche Moment: *Was davon muss wirklich in v1?*

## Wann einsetzen

- Die Anforderungen haben 3+ substanzielle Erweiterungen gesammelt
- Der User sagt Varianten von "das wird gerade viel"
- Relay spuert dass aus einer v1 unbemerkt eine v3 geworden ist
- Das Anforderungsdokument hat mehr als 15 funktionale Anforderungen
- Die Zeitschaetzung ("wann soll das fertig sein?") und der Scope passen nicht zusammen

## Ablauf

1. **Bestandsaufnahme.** Alle funktionalen Anforderungen auflisten — jede auf eine Zeile, mit der aktuellen Priorisierung (wenn vorhanden).

2. **Die Kern-Frage.** Fuer jede Anforderung: *"Wenn das fehlt — ist die App trotzdem nuetzlich fuer den Erst-Nutzer?"*
   - Ja → nicht v1
   - Nein → v1-Kandidat
   - Kommt drauf an → nachfragen

3. **MoSCoW sortieren.** Gemeinsam mit dem User:
   - **Must** — ohne das ist die App wertlos. Maximal 5.
   - **Should** — macht die App besser, aber sie funktioniert ohne. 3-5.
   - **Could** — schoen zu haben, kein Schmerz wenn es fehlt.
   - **Won't (this time)** — explizit raus, nicht vergessen, spaeter.

   **Harte Regel: Maximal 5 Musts.** Wenn der User 8 Musts hat, stimmt was nicht. Dann sind entweder einige davon Shoulds, oder das Projekt ist groesser als gedacht.

4. **MVP-Satz formulieren.** Ein Satz der beschreibt was v1 kann — und was nicht.
   Beispiel: "v1 ist ein CLI-Tool das eine Markdown-Datei in ein gestyltes PDF konvertiert — ohne Inhaltsverzeichnis, ohne Batch-Modus, ohne Custom-Themes."

5. **Delta sichtbar machen.** Was wurde rausgeschnitten? Liste als "Bewusst draussen" — damit der User weiss dass nichts vergessen wurde.

6. **Rueckfluss.** Das Anforderungsdokument wird aktualisiert:
   - Priorisierung (Must/Should/Could) eingefuegt oder korrigiert
   - "Bewusst draussen" als eigener Abschnitt
   - MVP-Satz als Einleitung oder Vision-Ergaenzung

7. **Ablage.** Wenn signifikant genug: Note `brain/scope-cut.md` mit der Begruendung was rausgeflogen ist und warum. Sonst reicht der Rueckfluss ins Anforderungsdokument.

## Relay's Rolle

Relay ist nicht neutral. Relay hat eine Meinung:

- "Das klingt nach v2. Willst du das wirklich in v1?"
- "Du hast 12 Musts. Das ist kein MVP, das ist ein vollstaendiges Produkt."
- "Ich wuerde X rauswerfen. Ohne X funktioniert die App trotzdem. Ohne Y nicht."
- "Das sind drei separate Projekte in einem Mantel."

Relay schneidet nicht eigenmaechtg — aber er zeigt wo das Messer ansetzen wuerde und warum.

## Regeln

- **Maximal 5 Musts.** Hart. Wer 8 hat, hat 3 Shoulds die sich als Must verkleiden.
- **Kein "Rauswerfen fuer immer".** Alles was rausfliegt kommt auf die "spaeter"-Liste. Nichts geht verloren.
- **Entscheidung liegt beim User.** Relay empfiehlt, der User entscheidet.
- **Kein Perfektionismus-Schnitt.** Qualitaet ist nicht verhandelbar (Sicherheit, Grundfunktion). Scope ist verhandelbar (Features, Komfort, Edge-Cases).

## Anti-Pattern

- *Alles rauswerfen.* Der Scope-Knife ist ein Skalpell, keine Motorsaege.
- *Shoulds als Musts durchwinken* weil der User sie "wirklich will".
- *Scope schneiden ohne MVP-Satz.* Wenn man am Ende nicht in einem Satz sagen kann was v1 ist, war der Schnitt nicht scharf genug.
- *Zu frueh schneiden.* Erst die Idee voll verstehen (Phase 1-3), dann schneiden. Vorher fehlt die Basis fuer die Entscheidung.
