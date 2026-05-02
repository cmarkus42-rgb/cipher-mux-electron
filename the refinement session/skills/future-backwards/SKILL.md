---
name: future-backwards
description: "Rueckwaerts vom Zielzustand — der User benennt wo das Projekt in 1-2 Jahren stehen soll, Relay arbeitet rueckwaerts und prueft was davon Substanz hat und was Wunschdenken ist. Verwende diesen Skill wenn die Ambition geprueft werden soll oder die Kluft zwischen Heute und Ziel sichtbar werden muss. Aktiviert auf Anfrage ('Future Backwards', 'Ist das realistisch', 'Wo soll das in einem Jahr stehen') oder wenn Relay es vorschlaegt."
---

# Future Backwards

## Zweck

Eine Idee im Gegenwartstempus zu diskutieren verleitet zum Schoenen der naechsten Schritte. Future Backwards dreht die Richtung: Der Zielzustand wird als gegeben angenommen. Die Frage: *Was muesste jedes Quartal bereits passiert sein?* Das trennt Plan von Wunschkette.

Im Software-Kontext: Trennt realistische Projekt-Roadmaps von Feature-Wunschlisten. Besonders nuetzlich wenn ein User "alles auf einmal" will.

## Ablauf

1. **Zielzustand festlegen.** Der User formuliert. Relay fordert Praezision wenn der Zustand schwammig ist.

   Schlecht: "Meine App ist erfolgreich."
   Gut: "Meine App hat 50 aktive Nutzer die sie mindestens 3x pro Woche oeffnen. Es gibt ein Abo-Modell das 500 EUR/Monat einbringt. Die Kern-Features funktionieren stabil."

   Konkret heisst: zaehlbar, datiert, verortet.

2. **Zeitraum bestimmen.** Standard: 1 Jahr fuer Software-Projekte. 2 Jahre fuer Plattformen. 6 Monate fuer kleine Tools.

3. **Rueckwaerts in Quartalscheiben.** Fuer jedes Quartal:

   ```
   ## Q-1 (ein Quartal vor Ziel)

   Was muss am Ende dieses Quartals wahr sein?
   - <konkrete, messbare Zwischenzustaende>

   Wie glaubwuerdig ist das?
   - [Fakt] — bereits heute vorhanden
   - [Trajektorie] — plausibler naechster Schritt
   - [Sprung] — setzt etwas voraus das heute nicht in Sicht ist
   - [Wunsch] — Hoffnung ohne Substanz
   ```

   Markierungen Fakt / Trajektorie / Sprung / Wunsch sind Pflicht.

4. **Heute — das Sollbruchstellen-Quartal.** Das wichtigste Quartal ist das aktuelle. Hier sammelt sich die konkrete Arbeit der naechsten 3 Monate. Wenn ueberwiegend Sprung/Wunsch: der Zielzustand ist zu ambitioniert — oder die ersten Schritte werden unterschaetzt.

5. **Auswertung.**
   - *Dichte der Fakten:* Wenige Fakten, viel Wunsch → Vision, kein Plan.
   - *Sprungstellen:* Wo muss etwas Diskontinuierliches passieren? (Erster Nutzer, erstes Bezahl-Feature, erste externe API-Anbindung.) Das sind die Punkte wo Strategie wichtig wird.
   - *Ketten-Fragilitaet:* Haengt alles an einem einzigen Schritt?

6. **Rueckfluss.** Die Auswertung beeinflusst die Anforderungen:
   - Zu viele Spruenge → Scope reduzieren, MVP schaerfer schneiden
   - Fragile Kette → Abhaengigkeiten in den Anforderungen explizit benennen
   - Viel Wunsch im ersten Quartal → User-Erwartungen kalibrieren

7. **Ablage.** Ergebnis als Note: `brain/future-backwards.md`. Spruenge und Wuensche in den Risiken des Anforderungsdokuments referenzieren.

## Regeln

- **Zielzustand muss zaehlbar sein.** Kein Datum, keine Zahl, keine Szene → zurueck zu Schritt 1.
- **Ehrliche Markierung.** Sprung als Trajektorie zu markieren ist die haeufigste Selbsttaeuschung. Wenn die Unsicherheit spuerbar ist: mindestens Sprung.
- **Kein Glaetten.** Lueckenhaftes Bild bleibt lueckenhaft. Das ist die Erkenntnis.

## Anti-Pattern

- *Vager Zielzustand.* "Die App laeuft gut." Das kann alles bedeuten.
- *Linear glaetten.* Jedes Quartal gleich viel Fortschritt. Realitaet hat Spruenge und Plateaus.
- *Wunsch als Fakt markieren.* Relay hinterfragt jede Fakt-Markierung: "Woher weisst du das heute?"
- *Methode als Projektplan nutzen.* Das sind keine Milestones, das sind Diagnose-Instrumente.
