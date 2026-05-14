import * as fs from 'fs';
import * as path from 'path';

const SKILL_FUTURE_BACKWARDS = `---
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

   \\\`\\\`\\\`
   ## Q-1 (ein Quartal vor Ziel)

   Was muss am Ende dieses Quartals wahr sein?
   - <konkrete, messbare Zwischenzustaende>

   Wie glaubwuerdig ist das?
   - [Fakt] — bereits heute vorhanden
   - [Trajektorie] — plausibler naechster Schritt
   - [Sprung] — setzt etwas voraus das heute nicht in Sicht ist
   - [Wunsch] — Hoffnung ohne Substanz
   \\\`\\\`\\\`

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

7. **Ablage.** Ergebnis als Note: \\\`brain/future-backwards.md\\\`. Spruenge und Wuensche in den Risiken des Anforderungsdokuments referenzieren.

## Regeln

- **Zielzustand muss zaehlbar sein.** Kein Datum, keine Zahl, keine Szene → zurueck zu Schritt 1.
- **Ehrliche Markierung.** Sprung als Trajektorie zu markieren ist die haeufigste Selbsttaeuschung. Wenn die Unsicherheit spuerbar ist: mindestens Sprung.
- **Kein Glaetten.** Lueckenhaftes Bild bleibt lueckenhaft. Das ist die Erkenntnis.

## Anti-Pattern

- *Vager Zielzustand.* "Die App laeuft gut." Das kann alles bedeuten.
- *Linear glaetten.* Jedes Quartal gleich viel Fortschritt. Realitaet hat Spruenge und Plateaus.
- *Wunsch als Fakt markieren.* Relay hinterfragt jede Fakt-Markierung: "Woher weisst du das heute?"
- *Methode als Projektplan nutzen.* Das sind keine Milestones, das sind Diagnose-Instrumente.
`;

const SKILL_OSS_TELESCOPE = `---
name: oss-telescope
description: "Kartiert existierende Loesungen und Bausteine fuer eine Idee, bevor etwas selbst gebaut wird. Scannt nach Tools, Libraries, Services die Teile des Problems abdecken. Verwende diesen Skill in Phase 2 wenn technische Komponenten in der Idee stecken. Aktiviert auf Anfrage ('Was gibt es schon', 'Bausteine', 'OSS-Telescope') oder wenn Relay es vorschlaegt."
---

# OSS-Telescope

## Zweck

Die meisten Ideen brauchen kein neues Projekt von Grund auf — sie brauchen eine Kombination aus vorhandenen Bausteinen plus etwas Eigenes drumherum. Dieser Skill macht die Baustein-Landschaft sichtbar bevor Code-Arbeit beginnt.

Im Anforderungs-Kontext: Nicht um den Tech-Stack zu waehlen (das macht die Ziel-Session), sondern um zu verstehen was es schon gibt und wo die Idee Neuland betritt. Das beeinflusst den Scope und die Realitaet der Anforderungen.

## Ablauf

1. **Idee in Komponenten zerlegen.** Relay liest den aktuellen Stand (aus \\\`brain/seed.md\\\` oder \\\`brain/brief.md\\\`) und zerlegt die Idee in funktionale Bausteine. Beispiel Web-App: Frontend-Framework, Backend, Datenbank, Auth, Hosting, APIs, CI/CD.

2. **Pro Komponente suchen.** Quellen:
   - **Bestehende Tools** — Gibt es ein fertiges Produkt das das Problem loest? (Auch kommerzielle.)
   - **Open-Source-Projekte** — GitHub, Awesome-Listen, Package-Registries
   - **APIs und Services** — Stripe, Auth0, Supabase, etc.
   - **Templates und Starter-Kits** — Existiert ein Boilerplate das 80% abdeckt?

   Web-Suche nutzen, nicht raten. Ergebnisse pruefen: letzter Commit, Aktivitaet, Lizenz.

3. **Stueckliste aufbauen.** Pro Komponente maximal 3 Kandidaten:

   \\\`\\\`\\\`markdown
   ### <Komponente>

   | Loesung | Art | Eignung | Anmerkung |
   |---------|-----|---------|-----------|
   | ... | OSS/Service/Tool | gut/bedingt/nein | Warum |
   \\\`\\\`\\\`

4. **Lueckenliste.** Was bleibt wenn alle Bausteine gesetzt sind? Drei Kategorien:
   - **Glue** — Code der nur die Bausteine verbindet. Klein, aber projekt-spezifisch.
   - **Domain-Logik** — Das eigentlich Eigene. Hier liegt der Wert.
   - **Gaps** — Funktionalitaet die kein Baustein liefert und signifikanten Aufwand bedeutet.

5. **Rueckfluss.** Die Stueckliste beeinflusst die Anforderungen:
   - Fertiges Tool deckt 80% ab → Scope auf die fehlenden 20% fokussieren
   - Grosse Gaps → Scope pruefen, vielleicht ist das Projekt groesser als gedacht
   - Existierende Loesung tut genau das → Frage an den User: "Brauchst du wirklich ein eigenes Projekt?"

6. **Ablage.** Ergebnis als Note: \\\`brain/oss-telescope.md\\\`. Lueckenliste fliesst in \\\`brain/brief.md\\\` als *Eigenanteil*.

## Regeln

- **Ehrlich ueber "Build vs. Buy".** Wenn ein fertiges Tool das Problem loest, sag es — auch wenn der User bauen will.
- **Maintenance ist ein Signal.** Letzter Commit vor 18 Monaten bei aktiver Konkurrenz → nicht empfehlen.
- **Sterne sind nicht Eignung.** Ein 30k-Sterne-Projekt das nicht passt ist schlechter als ein 200-Sterne-Projekt das passt.
- **Kommerziell mitdenken.** OSS-first heisst nicht OSS-only.

## Anti-Pattern

- *Fuenf Kandidaten pro Komponente.* Drei ist Maximum.
- *Keine Lueckenliste.* Nur Bausteine aufzaehlen ohne zu sagen was fehlt ist wertlos.
- *Zu frueh.* Vor dem Seed keinen Telescope starten — ohne Scope ist jede Suche zu breit.
- *Tech-Stack-Entscheidungen treffen.* Das ist nicht der Job dieser Session. Nur kartieren, nicht entscheiden.
`;

const SKILL_PERSONA_ROUNDTABLE = `---
name: persona-roundtable
description: "Strukturiertes Sparring mit mehreren Nutzer-Personas. Verwende diesen Skill wenn die Zielgruppe unklar ist, die Idee 'fuer alle' sein soll, oder nach v0.1 der Anforderungen. Aktiviert auf Anfrage ('Roundtable', 'Lass verschiedene Nutzer draufschauen') oder wenn Relay es vorschlaegt."
---

# Persona-Roundtable

## Zweck

Nicht eine Sparring-Stimme, sondern eine Runde. Jede Persona schaut aus einem anderen Winkel auf die Idee. Keine Absprachen, keine Harmonie. Die Synthese macht sichtbar wo Einwaende sich ueberlappen — und wo eine einzelne Stimme einen Punkt trifft den keine andere gesehen haette.

Im Software-Kontext: Verschiedene Nutzertypen pruefen ob die geplante App fuer sie funktionieren wuerde. Das ist Zielgruppen-Validierung durch Perspektivwechsel.

## Ablauf

1. **Scope klaeren.** Frag den User: *Was genau soll kommentiert werden?* Die Idee als Ganzes, ein bestimmtes Feature, die Zielgruppe? Halte den Scope eng.

2. **Personas auswaehlen.** Standard-Set unten. User darf ergaenzen, ersetzen, weglassen. Zwei bis vier Personas sind optimal, fuenf ist Obergrenze. Relay passt die Personas an den konkreten Projekt-Kontext an.

3. **Runde durchfuehren.** Pro Persona: max. 5 Saetze. Eigene Stimme, eigenes Vokabular. Die Persona darf widersprechen, loben, fremdeln — sie muss aber spezifisch werden. "Das sehe ich kritisch" ist keine Aussage.

4. **Synthese.** Nach allen Stimmen drei Bloecke:
   - *Ueberlappende Einwaende* — was mehrere Personas unabhaengig anmerken. Die haertesten Punkte.
   - *Unique Insights* — was nur eine Persona gesehen hat, das aber trifft.
   - *Entfernbare Einwaende* — Kritik die auf Missverstaendnis beruht oder durch kleine Aenderung verschwindet.

5. **Ablage.** Ergebnis als Note: \\\`brain/roundtable-<thema>.md\\\`. Verlinkung aus \\\`brain/_index.md\\\`.

## Standard-Personas (Software-Kontext)

Jede ist ein Template — der konkrete Zuschnitt passt sich an das Projekt an.

### Der Erste Nutzer
Die Person die das Tool als allererste benutzen wuerde. Beschreibt ihren Alltag, ihr Problem, was sie heute stattdessen tut. Fragt: "Wuerde ich das wirklich oeffnen? Oder ist mein Excel-Sheet gut genug?"

### Der Genervte Wechsler
Hat schon drei aehnliche Tools probiert und alle wieder geloescht. Weiss genau was ihn stoert. Sucht sofort den Friction-Point: "Ab welchem Schritt gebe ich auf?"

### Der Technische Pragmatiker
Die Person die das Ding betreiben oder warten muesste. Sieht versteckte Komplexitaet, Ops-Last, Abhaengigkeiten. Fragt: "Was passiert wenn der Server um 3 Uhr nachts abstuerzt und niemand da ist?"

### Der Zufall-Nutzer
Wurde von einem Freund eingeladen, hat keine Ahnung was das Tool soll. Klickt sich durch und urteilt in 30 Sekunden. Fragt: "Was soll ich hier tun? Wo fange ich an?"

### Der Power-User (6 Monate spaeter)
Benutzt das Tool taeglich und stoesst an Grenzen. Fragt: "Kann ich X automatisieren? Warum kann ich Y nicht anpassen? Wo ist der Export?"

## Regeln

- **Personas bleiben Personas.** Sichtbarer Wechsel (Ueberschrift). Kein Vermischen der Stimmen.
- **Spezifisch statt generisch.** Jede Persona geht auf die konkrete Idee ein, nicht auf das Thema im Allgemeinen.
- **Keine Moderation zwischendrin.** Einzelgutachten, kein Gruppengespraech.
- **Synthese ist nicht Durchschnitt.** Nicht alle Einwaende sind gleich viel wert. Die Synthese wertet.

## Anti-Pattern

- Alle fuenf Personas obligatorisch, auch wenn drei reichen.
- Personas die alle dasselbe sagen — dann ist die Wahl falsch.
- Relay faellt in Neutralton zurueck und die Persona wird zur Fussnote.
- Ergebnis bleibt im Chat und wandert nicht ins \\\`brain/\\\`.
`;

const SKILL_PRE_MORTEM = `---
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

7. **Ablage.** Ergebnis als Note: \\\`brain/pre-mortem.md\\\`. Kritische Gruende zusaetzlich in \\\`brain/_index.md\\\` unter *Risiken*.

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
`;

const SKILL_SCOPE_KNIFE = `---
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

7. **Ablage.** Wenn signifikant genug: Note \\\`brain/scope-cut.md\\\` mit der Begruendung was rausgeflogen ist und warum. Sonst reicht der Rueckfluss ins Anforderungsdokument.

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
`;

const SKILLS_MAP: Record<string, string> = {
  'future-backwards': SKILL_FUTURE_BACKWARDS,
  'oss-telescope': SKILL_OSS_TELESCOPE,
  'persona-roundtable': SKILL_PERSONA_ROUNDTABLE,
  'pre-mortem': SKILL_PRE_MORTEM,
  'scope-knife': SKILL_SCOPE_KNIFE,
};

export function deployRefinementSkills(projectPath: string): void {
  for (const [name, content] of Object.entries(SKILLS_MAP)) {
    const skillDir = path.join(projectPath, 'skills', name);
    const filePath = path.join(skillDir, 'SKILL.md');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}
