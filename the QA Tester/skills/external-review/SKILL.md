---
name: external-review
description: Übergabe des Deliverables an eine frische Session für einen Außen-Blick. Verwende diesen Skill, wenn der Nutzer nach Iteration sagt "passt schon" oder wenn v1.0 ansteht und eine zweite Lesart sinnvoll wäre. Der Skill liefert ein Review-Briefing, die nötigen Artefakte und die Rück-Integrations-Schleife. Aktiviert auf Anfrage ("External Review", "Zweite Meinung", "Lass das mal eine frische Session checken") oder proaktiv vom Main-Agent vor v1.0.
---

# External Review

## Zweck

Der Main-Agent einer Ideation hat nach mehreren Iterationen einen **blinden Fleck**: Er sieht das Deliverable durch die Linse aller vorhergegangenen Entscheidungen. Dinge, die in Phase 2 entschieden und in Phase 4 angewandt wurden, sind für ihn selbstverständlich — aber möglicherweise nicht für den tatsächlichen Adressaten.

Eine frische Session liest das Deliverable ohne diese Historie. Sie findet Stellen, an denen der Main-Agent seine eigenen Vorentscheidungen nicht mehr hinterfragt, an denen Scope unbemerkt gewachsen ist, an denen ein Begriff eingeführt aber nicht erklärt wurde, an denen die Deliverables intern nicht passen. Das ist keine zweite Meinung zur Substanz — das ist ein **Kohärenz- und Lesbarkeits-Check**, den die eingebettete Session nicht mehr leisten kann.

## Wann einsetzen

Zwei Auslöser:

- **Nutzer-getrieben:** Der Nutzer sagt nach Iteration sinngemäß *"passt schon"*, *"ich glaub das steht jetzt"*, *"lass uns abschließen"*. Das ist das Signal, **eine letzte Schleife** anzubieten — nicht als weitere Iteration durch den Main-Agent (der liefert nichts Neues), sondern als externe Sicht.
- **Agent-getrieben:** Vor dem Sprung auf v1.0 schlägt der Main-Agent den Review proaktiv vor, wenn das Deliverable substantiell ist (Konzept für externen Adressaten, Strategiepapier, Designdokument für Umsetzungs-Flow).

Nicht einsetzen bei: Kleinen Deliverables (unter 3 Seiten), reinen Brain-Ausgaben, Zwischenständen vor Phase 4. Der Review kostet den Nutzer eine neue Session und ist nur sinnvoll, wenn das zu prüfende Artefakt diesen Aufwand lohnt.

## Ablauf

1. **Nutzer-Einladung.** Der Main-Agent formuliert die Frage explizit: *"Willst du das Deliverable vor v1.0 durch eine frische Session challengen lassen? Ich bereite ein Review-Briefing vor — du startest einen neuen Chat oder eine neue Cowork-Session, übergibst das Paket, liest die Rückmeldung. Der Aufwand ist 20-40 Minuten."* Nur bei Ja weiter.

2. **Review-Briefing schreiben** als `brain/external-review-briefing_YYYYMMDD.md`. Inhalt:

   - *Was ist das?* — Zwei, drei Sätze zum Projekt. Genug Kontext, um das Deliverable einzuordnen, aber nicht so viel, dass die externe Session meine Brille aufsetzt.
   - *Was soll geprüft werden?* — Konkrete Leit-Fragen. Drei bis fünf Stück. Siehe "Standard-Leitfragen" unten.
   - *Was soll NICHT geprüft werden?* — Explizit die Fragen, die schon entschieden sind und nicht wieder aufgemacht werden sollen. Sonst läuft die externe Session in Grundsatz-Debatten.
   - *Welche Artefakte liegen bei?* — Liste der Dateien, die die externe Session lesen soll. Typisch: das Deliverable selbst (aktuelle Version), der `brief.md`, optional `brain/_index.md` als Kontext. Nicht die ganze Brain-Historie, nicht die früheren Deliverable-Versionen (außer die Scope-Evolution ist Teil der Frage).
   - *Wie soll zurückgemeldet werden?* — Format der Rückmeldung. Typisch: Markdown-Dokument mit Fund-Liste (pro Fund: Stelle, Art, Schwere, Empfehlung). Alternativ frei formuliertes Review-Gutachten.

3. **Übergabe.** Der Nutzer startet eine neue Session (frischer Cowork-Kontext oder Web-Chat), übergibt das Briefing plus die Artefakte. Der Main-Agent bleibt in der Ursprungs-Session und wartet.

4. **Rück-Integration.** Die externe Rückmeldung kommt zurück — als Datei, Copy-Paste oder Chat-Text. Ablage unter `brain/external-review-rueckmeldung_YYYYMMDD.md`. Der Main-Agent geht Fund für Fund durch:
   - *Übernehmen:* Fund ist valide, Änderung wird eingepflegt. Dokumentation im Änderungshinweis.
   - *Begründet verwerfen:* Fund beruht auf Missverständnis oder externem Kontext-Mangel. Begründung notieren, im Deliverable nichts ändern.
   - *Offen halten:* Fund ist interessant, aber braucht Nutzer-Entscheidung. In die Nutzer-Runde zurück.

5. **v1.0-Sprung.** Nach der Integration wird die freigegebene Fassung als v1.0 abgelegt. Der External-Review-Durchlauf ist damit abgeschlossen.

## Standard-Leitfragen

Diese Liste ist ein Ausgangspunkt. Das konkrete Briefing wählt drei bis fünf, nicht alle.

- **Verständlichkeit für den Adressaten.** Wer das Dokument erstmals liest — versteht er, worum es geht, was entschieden ist, was erwartet wird? An welchen Stellen stolpert ein erstmaliger Leser?
- **Innere Kohärenz.** Widersprechen sich Aussagen zwischen Kapiteln? Sind Begriffe konsistent verwendet? Verspricht das Dokument an einer Stelle, was es an anderer zurücknimmt?
- **Scope-Realismus.** Kann das Beschriebene in der genannten Zeit / mit den genannten Mitteln tatsächlich umgesetzt werden? Oder ist das Dokument ambitioniert an Stellen, an denen es konkret sein sollte?
- **Fehlende Stellen.** Was erwartet der Adressat, das im Dokument nicht vorkommt? Welche offensichtlichen Folge-Fragen bleiben unbeantwortet?
- **Nicht gerechtfertigte Selbstverständlichkeiten.** Welche Begriffe, Annahmen, Verweise werden als bekannt vorausgesetzt, ohne dass sie es sein müssten?
- **Tonfall-Brüche.** Stimmt der Ton durchgehend zum Adressaten? Wo driftet es zu didaktisch, zu marketing-lastig, zu fachlich?
- **Anti-Patterns des Adressaten.** Was würde den konkret gedachten Adressaten (z.B. "skeptischer KMU-Inhaber", "technischer Product Owner") abschrecken, obwohl es inhaltlich richtig ist?

## Regeln

- **Die externe Session kennt den Weg nicht.** Das ist Feature, nicht Bug. Nicht die Historie reinfüttern, um die Antwort vorzuprägen.
- **Briefing ist Pflicht.** Ohne konkrete Leit-Fragen produziert die externe Session generisches Feedback. Mit konkreten Fragen liefert sie brauchbare Funde.
- **Nicht alles übernehmen.** Eine externe Session, die 20 Punkte findet, hat oft 5 echte Funde und 15 Missverständnisse. Der Main-Agent filtert.
- **Begrenze den Umfang.** Drei bis fünf Leit-Fragen, das Deliverable selbst als Haupt-Artefakt, maximal zwei Begleit-Dokumente. Mehr überfrachtet die externe Session.
- **Integrationsnotiz ins Deliverable.** Am Ende des v1.0-Deliverables oder in der zugehörigen Versions-Notiz kurz vermerken: *"External Review durchgeführt am YYYY-MM-DD, N Funde übernommen, M begründet verworfen. Details in `brain/external-review-*`."*

## Anti-Pattern

- *External Review als Alibi.* Ein Review, nach dem nichts geändert wird, war entweder nicht nötig oder wurde nicht ernst genommen. Wenn die Rückmeldung keine Änderung erzwingt, prüfen, ob das Briefing zu weich war.
- *Full-Brain-Übergabe.* Die externe Session bekommt nicht das ganze `brain/`. Sonst läuft sie die Recherche nach, statt das Deliverable zu lesen.
- *External Review in zu früher Phase.* Vor v0.1 macht der Review keinen Sinn — es gibt noch kein Deliverable, nur Annahmen. Der Review sitzt zwischen "scheint fertig" und "wird v1.0".
- *Zwei externe Reviews parallel.* Zwei Sessions finden meist dieselben oberflächlichen Dinge plus inkompatible Detailkritik. Eine Session ist das richtige Maß.
- *Rückmeldung nicht archivieren.* Das Review gehört als Note ins Brain. Tote Rückmeldung ist verschwendeter Nutzer-Aufwand.

## Verhältnis zu den anderen Skills

`external-review` kommt **nach** den in-session Skills (`pre-mortem`, `persona-roundtable`, etc.), nicht statt ihnen. Die Reihenfolge:

- In-Session-Skills prüfen die *Annahmen* des Deliverables.
- External Review prüft die *Kommunizierbarkeit und Kohärenz* des Deliverables.

Beides hat seinen Platz. Wer nur External Review macht, hat unsaubere Annahmen in saubere Worte gefasst. Wer nur In-Session-Skills macht, hat saubere Annahmen, die niemand versteht.
