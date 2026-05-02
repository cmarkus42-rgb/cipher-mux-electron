# Format: Konzeptpapier für einen Adressaten (XPRESS-Muster)

Struktur für AI-first-Konzeptpapiere, die einem konkreten Kunden oder Stakeholder als Lesefassung übergeben werden. Entstanden beim XPRESS-Projekt (2026-04, Nidal Sevim, Umzugsfirma), verallgemeinert im KI-Nutzungskonzepte-Leitfaden.

Referenz: `/Users/Shared/Nextcloud/Claude/WebsiteDesigner/KI-Nutzungskonzepte_Leitfaden_v1.0.docx`.

## Wann dieses Format?

- Konzeptpapier für einen identifizierten Adressaten (Kunden, Stakeholder, Mit-Entscheider).
- Adressat soll auf Basis des Papiers eine **Entscheidung** treffen können — kaufen, freigeben, anstoßen.
- AI-first-Ansatz: Das Papier beschreibt nicht nur die Lösung, sondern den Aufbau und Betrieb mit KI-Unterstützung.

Nicht geeignet für: Reine interne Strategie-Papiere (→ anderes Format). Technische Spezifikationen (→ SPEC.md im Launcher). Pitches (→ Pitch-Deck).

## Grundstruktur

Zwei synchrone Fassungen aus derselben Markdown-Quelle:

- **Lesefassung** (Word/PDF, ~15-25 Seiten) für den Adressaten.
- **Ausführungsfassung** (Markdown, CLAUDE.md im Projektordner) für die KI-gestützte Umsetzung.

Beide werden aus derselben Markdown-Quelle gebaut, können nicht auseinanderlaufen. Das ist der *Kern* des AI-first-Prinzips: Dokumentation ist zugleich Instruktion.

## Kapitel-Struktur (Lesefassung)

### Teil 1 — Einführung (ca. 2-3 Seiten)

1. *Management Summary* — Eine Seite, die für sich steht. Problem, Lösungs-Ansatz, was der Adressat danach hat.
2. *Ausgangssituation* — Was ist heute? Ohne Bewertung, nur Zustand.
3. *Der Ansatz in drei Absätzen* — Überblick, keine Details.

### Teil 2 — Methodisches Fundament (ca. 3-5 Seiten)

4. *Das AI-first-Prinzip* — Was KI selbst aufsetzen kann, wird der KI überlassen. Mensch entscheidet, Maschine führt aus.
5. *Zwei-Artefakte-Architektur* — Lesefassung + Ausführungsanweisung. Warum das zusammen gehört.
6. *Rollen und Verantwortlichkeiten* — Wer macht was? Adressat, Berater, Maschine.

### Teil 3 — Die Bausteine (ca. 8-12 Seiten)

7. *Projektordner und Setup-Logik* — Wie ist alles organisiert?
8. *Berechtigungen und Ausführungsmodi* — Was darf die KI autonom, was braucht Freigabe?
9. *Personas und Skills* — Rollen-Konzept. Welche Personas aktiviert der Adressat für welche Aufgabe?
10. *Arbeitsregeln* — CLAUDE.md als projektspezifisches Gedächtnis.
11. *(Je nach Projekt) Sichtbarkeit, Infrastruktur, besondere Querschnittsthemen.*

### Teil 4 — Der Prozess (ca. 3-5 Seiten)

12. *Vom Erstgespräch zur Produktivsetzung* — Schritt für Schritt.
13. *Phasen, Deliverables, Investition* — Was kostet was, wann gibt's was?
14. *Begleitung in den ersten Wochen* — Fine-tuning, Bugfixing.
15. *Backup und Sicherheit* — Betriebs-Basics.

### Teil 5 — Fallstudie oder Praxisbeispiel (ca. 5-10 Seiten, optional)

16. *Ausgangssituation eines konkreten Falls* — reale oder fiktive Firma.
17. *Konzeptentwurf und Refining* — Wie lief die Anpassung?
18. *Produktivsetzung* — Was wurde gebaut?
19. *Ergebnis nach N Wochen* — Messbar.
20. *Learnings* — Was lässt sich übertragen?

### Anhang (ca. 5-10 Seiten)

- A1. Beispiel-Templates (CLAUDE.md, Settings, Deploy-Skripte)
- A2. Beispiel-Skills
- A3. Beispiel-Rollen/Personas
- A4. Glossar
- A5. Weiterführende Ressourcen

## Tonfall (Drei-Stufen-Mischung)

- *Methodik (Teil 2, 3):* neutrale dritte Person. *"Der Projektordner enthält..."*, *"Die Persona wird aktiviert durch..."*
- *Handlungsempfehlungen:* imperativisch ohne Anrede. *"Pro-Abo abschließen. Desktop-App installieren."*
- *Prozess- und Angebotsteile (Teil 4):* Berater-"wir", klar zuordenbar. *"Wir empfehlen..."*, *"In unserer Praxis hat sich bewährt..."*
- *Fallstudie:* narrativ, dritte Person.

Kein "du", nirgends. Kein "Sie" — außer wenn das Publikum strikt konservativ ist. Claude bleibt aus dem Text heraus.

## Begleitende Artefakte

Ein Konzeptpapier nach diesem Muster entsteht selten allein. Typische Geschwister:

- **Companion** (siehe `companion-als-ordner.md`) — Template-Sammlung zum Anwenden.
- **Business Use Case** — Angebots-Rahmen mit Preis, Abgrenzung, Investition. Eine Seite, klar zitierbar.
- **Sandbox** (optional) — Lauffähiges Testset mit synthetischen Daten, Demo-Zweck oder Pilot-Basis.

## Anti-Pattern

- *Kapitelschlachten auf 50+ Seiten.* Der Adressat muss das lesen *können*. Klares Limit bei 30 Seiten Kerntext plus Anhang.
- *Berater-Tiefe über Adressaten-Ebene.* Methodisch saubere Zwischenschritte können im Anhang stehen, sollen aber nicht den Hauptstrang blähen.
- *Zu viele Konditionale.* "*Möglicherweise könnte in manchen Fällen eine ...*" ist ein Zeichen mangelnder Fokussierung. Der Brief (Phase 2) sollte die Konditionale schon weggekürzt haben.
- *Neutraler Ton in Teil 4.* Wenn das "Wir" des Beraters ausbleibt, verliert der Adressat den Gesprächspartner.
