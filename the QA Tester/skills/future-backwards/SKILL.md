---
name: future-backwards
description: Rückwärts vom Zielzustand — der User benennt einen konkreten Endzustand in 3-5 Jahren, Claude arbeitet rückwärts in Jahresscheiben und prüft, was davon heute Substanz hat und was Wunschdenken ist. Verwende diesen Skill in Phase 2 (Fokussierung), wenn die Ambition der Idee geprüft werden soll. Aktiviert auf Anfrage ("Future Backwards", "Denk rückwärts", "Ist das realistisch") oder wenn eine Idee sehr groß oder sehr klein gedacht wird und beides geprüft gehört.
---

# Future Backwards

## Zweck

Eine Idee im Gegenwartstempus zu diskutieren, verleitet zum Schönen der nächsten Schritte. *Future Backwards* dreht die Richtung: Der Zielzustand wird als gegeben angenommen, und die Frage lautet nicht *"Wie kommen wir dahin?"*, sondern *"Was müsste jedes Jahr bereits passiert sein?"* Das macht den Unterschied zwischen *Plan* und *Wunschkette* sichtbar.

## Ablauf

1. **Endzustand festlegen.** Der User formuliert. Claude fordert Präzision, wenn der Zustand schwammig ist. Schlecht: *"Mein Beratungsangebot läuft erfolgreich."* Gut: *"Ich habe zwischen Januar und Dezember 2029 acht KI-Nutzungskonzepte verkauft und umgesetzt, im Durchschnitt zu 9.500 €. Drei davon kamen über Empfehlung, nicht Outbound."* Konkret heißt: zählbar, datiert, verortet.

2. **Zeitraum bestimmen.** 3 Jahre ist oft richtig. 5 Jahre erlaubt größere Sprünge, wird aber ab der Halbzeit unscharf. 1 Jahr ist eher Planungshorizont als Ideation-Instrument.

3. **Rückwärts in Jahresscheiben.** Für jedes Jahr (Y-X, Y-X+1, ..., Y-1) eine Note im Format:

   ```
   ## Jahr Y-1 (z.B. 2028)
   
   Was muss am Ende dieses Jahres wahr sein, damit der Endzustand im nächsten Jahr eintritt?
   
   - <konkrete, messbare Zwischenzustände>
   
   Wie glaubwürdig ist das aus heutiger Sicht?
   - [Fakt] — bereits heute vorhanden
   - [Trajektorie] — plausibler nächster Schritt aus dem aktuellen Stand
   - [Sprung] — setzt etwas voraus, das heute nicht in Sicht ist
   - [Wunsch] — Hoffnung ohne Substanz
   ```

   Markierungen **Fakt / Trajektorie / Sprung / Wunsch** sind Pflicht. Sie trennen, was trägt, von dem, was getragen werden möchte.

4. **Heute — der Sollbruchstellen-Jahr.** Das wichtigste Jahr ist das aktuelle. Hier sammelt sich die konkrete Arbeit der nächsten 12 Monate. Wenn das Jahr überwiegend aus Sprung/Wunsch besteht, ist der Endzustand zu ambitioniert — oder die Arbeit der ersten 12 Monate wird unterschätzt.

5. **Auswertung.**
   - *Dichte der Fakten:* Wie viel aktuelle Substanz gibt es? Wenige Fakten, viel Wunsch → Idee ist Vision, kein Plan.
   - *Sprungstellen:* Wo sind die Stellen, an denen etwas Diskontinuierliches passieren muss (Kunde Nr. 1, erste Einstellung, Produktfreigabe)? Die Sprünge sind die Punkte, an denen Strategie wichtig wird.
   - *Ketten-Fragilität:* Hängt alles an einem einzelnen Schritt? Dann ist die Kette nur so stark wie dieser Schritt.

6. **Ablage.** Ergebnis als Note: `brain/future-backwards-<thema>-YYYYMMDD.md`. Die Sprünge und Wünsche werden in `brain/annahmen.md` zusätzlich explizit gelistet. Das macht sie zu überprüfbaren Hypothesen.

## Regeln

- **Endzustand muss zählbar sein.** Wenn kein Datum, keine Zahl, keine konkrete Szene — zurück zu Schritt 1.
- **Ehrliche Markierung.** Die Versuchung ist groß, einen Sprung als Trajektorie zu markieren. Wenn die Unsicherheit spürbar ist, ist es mindestens ein Sprung.
- **Kein Glätten.** Wenn das Bild lückenhaft ist, bleibt es lückenhaft. Das ist die Erkenntnis, nicht ein Fehler der Methode.

## Varianten

- **Branch-Future-Backwards.** Zwei Endzustände parallel, um zu sehen, welcher Pfad mehr Substanz hat. Nur sinnvoll, wenn die Zustände echte Alternativen sind, nicht Variationen.
- **Präsenz-Rückwärts.** Kombinierbar mit `pre-mortem`: Der Endzustand ist das Scheitern, nicht der Erfolg. Zeigt, was an Unterlassung schon heute sichtbar wäre.

## Anti-Pattern

- *Vager Endzustand.* "Ich bin in 5 Jahren unabhängig." — das kann alles bedeuten.
- *Linear glätten.* Jedes Jahr gleich viel Fortschritt. Realität ist selten linear; echte Pfade haben Sprünge und Plateaus.
- *Wunsch als Fakt markieren.* Die häufigste Selbsttäuschung. Claude hinterfragt jede Fakt-Markierung zurück: *Woher weißt du das heute?*
- *Methode als Planung nutzen.* Dies ist kein Projektplan. Die Jahresscheiben sind keine Milestones, sondern Diagnose-Instrumente.
