# Ideation Template

Template-Verzeichnis für die Konzeptphase — von einer Idee bis zu einem Deliverable, das an einen Adressaten übergeben werden kann (oder als Brain bleibt, wenn das der Zweck ist).

Wird zu Beginn einer Ideation kopiert in ein eigenes Projektverzeichnis (z.B. `/Users/Shared/Nextcloud/Claude/<projektname>-ideation/`), dort gefüllt, bleibt dort liegen. Das Template selbst wird nicht pro Projekt gepflegt — Verbesserungen fließen zurück, sobald ein Durchlauf zeigt, wo es reibt.

## Phasen

**Phase 0 — Seed.** Freitext-Input in `00_seed.md`. Idee, Motivation, Bekanntes, Hypothesen zu Adressat und Zielformat. Felder dürfen leer bleiben, wenn offen — werden dann in Phase 2 geklärt.

**Phase 1 — Recherche (autonom).** Volle Landschaft kartieren: Markt, Lösungen (auch kommerzielle), Referenzen, Kontext. Ergebnisse wandern direkt ins `brain/` als eigenständige Wiki-Notes. Exit-Kriterium: Das Brain beantwortet "Was gibt's da draußen zum Thema?" ohne dass man zurück an den Startpunkt muss.

*Phase-1-Nachzug ist zulässig.* Wenn Phase 2 eine Recherche-Lücke aufdeckt (z.B. eine bislang nicht betrachtete Lieferanten-Klasse, ein neu genannter Zielgruppen-Cluster), darf Phase 1 nachträglich erweitert werden — mit denselben Qualitätsregeln (eigenständige Note im `brain/`, Wiki-Link-Integration, Index-Pflege durch Main-Agent). Das ist keine Regel-Umgehung, sondern sauberer als die Lücke ignorieren oder sie in Phase 2 als Nebensatz mitlaufen lassen.

**Phase 2 — Fokussierung (Dialog).** Adressat definieren, Scope schneiden, Zielformat festlegen. Open-Source-first-Filter wird hier angelegt — nicht in Phase 1, um nichts zu übersehen. Ergebnis: `brain/brief.md`.

*Granularitäts-Regel für Phase 2:* Phase 2 entscheidet **Richtung**, nicht **Zahlen**. Preis-Korridore, konkrete Tool-Picks, Paket-Schnitte, Zahlungspläne gehören nicht in den Brief — sie gehören in Phase 4. Der Brief soll so formuliert sein, dass mehrere denkbare Phase-4-Ausprägungen darin Platz hätten. Wenn der Brief schon Zahlen nennt, ist er zu weit.

Exit-Kriterium: Wenn ein Dritter den Brief liest, weiß er was gebaut wird, für wen, in welchem Format. **Härte-Check:** Drei konkrete Prüfpunkte:
- Kann der Brief in 5 Sätzen zusammengefasst werden, ohne dass Wesentliches verloren geht? Wenn nicht, ist er zu detailliert.
- Sind die *Entscheidungen* klar von den *Annahmen* getrennt?
- Ist der Wirksamkeits-Test benannt — woran erkennt man, dass das Ergebnis funktioniert?

*Scope-Diät-Moment bei iterierten Briefs.* Wenn der Brief mehr als drei substanzielle Änderungshinweise gesammelt hat (Scope-Erweiterung, Feature-Hinzunahme, Ziel-Verschiebung), zieht der Main-Agent eine bewusste Zäsur ein: *Kann das, was jetzt im Brief steht, in dem Zeitrahmen / mit den Mitteln / für den Adressaten tatsächlich geliefert werden — oder ist aus einer v1 unbemerkt eine v3 geworden?* Jede einzelne Iteration fühlte sich richtig an; zusammen können sie Scope-Drift bedeuten, die das Pre-Mortem nicht einfängt (weil es die Annahmen *im* Dokument prüft, nicht die Verdichtung *zwischen* Iterationen). Der Scope-Diät-Moment ist kein Blocker — er ist eine Frage und ihre ehrliche Beantwortung. Oft führt er zu einem Scope-Cut, der das Projekt realistischer macht.

**Phase 3 — Robustheits-Gate.** Nicht-linearer Check-Schritt, keine fixe Methode. Zwischen Brief (Phase 2) und v0.1 des Konzeptentwurfs (Phase 4) liegt ein Gate, das fragt: *Ist der Brief robust genug für den Entwurf, oder fehlen Annahme-Prüfungen?* Typische Instrumente: `pre-mortem` aus `skills/`, `persona-roundtable` für Stakeholder-Blicke, `future-backwards` für Ambitions-Prüfung, oder ein Interview-Dialog, wenn offene Fragen den Entwurf blockieren würden. Phase 3 wird oft implizit während Phase 2 geleistet — dann reicht eine kurze, bewusste Bestätigung "Gate passiert, keine Skills nötig". Weggelassen werden sollte Phase 3 *nie unmarkiert*.

**Phase 4 — Konzeptentwurf.** Aus dem Brain wird das Deliverable destilliert. Versioniert (v0.1, v0.2 …) in `deliverables/`. **Nach v0.1 ist ein Skill-Check Pflicht:** Welche der Skills in `skills/` würden die Annahmen des v0.1-Entwurfs jetzt robustester prüfen? Skill laufen lassen oder explizit begründet weglassen. Dann v0.2. Iteriert mit Rückfragen.

*External Review vor v1.0.* Wenn nach Iterationen das Gefühl "passt schon" eintritt, bietet der Main-Agent aktiv den `external-review`-Skill an — Übergabe des Deliverables an eine frische Session für Kohärenz-, Lesbarkeits- und Scope-Check. Nicht als Pflicht, aber als explizite Option. Der Review kostet eine neue Session und liefert dafür den Außenblick, den der Main-Agent nach mehreren Iterationen nicht mehr leisten kann. Details in `skills/external-review/SKILL.md`.

Exit-Kriterium: Deliverable liegt im Zielformat freigegeben vor — optional nach External Review.

**Phase 5 — Übergabe.** Abzweige: an den Adressaten, oder in die Umsetzung. Bei Code-Projekten: Übergabe an `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/`. Bei AI-Use-Cases mit Sandbox: die Sandbox selbst ist Teil des Deliverables.

## Brain — das eigentliche Produkt

Das `brain/` ist das Herzstück der Phasen 1-3. Keine Chat-Protokolle, keine losen Notizen.

**Qualität der Notes:**
- Jede Note ist ein eigenständiges Dokument mit aussagekräftigem Titel.
- Wiki-Links (`[[Note-Name]]`) leben im Fließtext, nicht in Bullet-Listen.
- Eine Note, die nirgends verlinkt ist, ist eine tote Note — entweder einbinden oder löschen.
- Keine *spekulativen* Wiki-Links auf Notes, die nicht existieren. Lieber weglassen, als versprechen.

**Qualität des Index:**
- `_index.md` ist der Einstiegspunkt. Er wächst mit den Erkenntnissen.
- Der Index ist **Argumentations-Gerüst**, kein **Inhaltsverzeichnis**. Fließtext, der die Erkenntnis-Struktur trägt. Nicht: Bullet-Liste mit "Siehe Note X".
- Index-Pflege macht der Main-Agent, nicht Sub-Agenten einer parallelen Phase-1-Recherche.

**Versionierung:**
- Brain-Notes sind *lebende Dokumente*, kein v0.1/v0.2-Versionierung.
- Eine Ausnahme: `brief.md` hat eine Doppelrolle (zentrales Fokussierungs-Dokument und Eingabe für Phase 4). Bei substanziellen Struktur-Änderungen in der gleichen Session: Datum im Frontmatter aktualisieren plus kurzer Änderungs-Hinweis am Ende ("*Nach Dialog am YYYY-MM-DD: XYZ hinzugefügt.*"). Keine v0.1/v0.2-Versionen für den Brief.
- `deliverables/` dagegen hat echte Versionierung (v0.1, v0.2, v1.0).

## Deliverables

Mehrere Formate pro Ideation möglich. Typisch:

- Konzeptpapier (Markdown + docx) für einen externen Adressaten
- Sandbox-Verzeichnis bei AI-Use-Cases (lauffähiges Testset mit n8n, Docker-Compose, Claude-Config, Testdaten — Open-Source-first)
- Pitch-Slides
- Strategiepapier für internen Gebrauch
- Designdokument für einen KI-Launcher-Flow (z.B. Übergabe an `projectlauncher`)
- Nur das Brain selbst, wenn das genug ist

*Freie Deliverable-Formate sind zulässig.* Wenn kein Format in `_formate/` passt, frei schreiben — mit kurzer Begründung im Deliverable selbst (Frontmatter oder Einleitung), warum es vom Standard abweicht. Wenn das freie Format sich bewährt, kann es nach dem Durchlauf als neues Format nach `_formate/` übernommen werden.

## Skills

Im Verzeichnis `skills/` liegen fünf spezialisierte Skills:

- `persona-roundtable` — Mehrere Personas kommentieren die Idee nacheinander. (Phase 3 / nach v0.1)
- `pre-mortem` — Scheiter-Szenario 2 Jahre voraus, Gewichtung, Ableitung. (Phase 3 / nach v0.1)
- `future-backwards` — Endzustand in 3-5 Jahren, rückwärts, Substanz-vs-Wunsch. (Phase 2 / 3)
- `oss-telescope` — Open-Source-Bausteine kartieren, Lizenzen prüfen, Lücken benennen. (Phase 1 / 2)
- `external-review` — Deliverable durch frische Session prüfen lassen. (vor v1.0)

Details siehe `skills/README.md`. Die Skills werden von Claude kontextabhängig vorgeschlagen oder explizit per Schlagwort aktiviert — **nach v0.1 im Konzeptentwurf ist ein Skill-Check Pflicht**, und **vor v1.0 wird `external-review` aktiv angeboten**.

## Formate

Im Verzeichnis `_formate/` liegen Referenz-Strukturen für wiederkehrende Deliverable-Formate. Aktuell:

- `companion-als-ordner.md` — Companion als numerierter Ordner mit Arbeits-Dokumenten (statt monolithischer Datei).
- `konzept-fuer-adressat.md` — Struktur des AI-first-Konzeptpapiers (XPRESS-Muster).

## Start

Inhalt von `START_PROMPT.md` an Claude übergeben (Cowork-Session im Projektverzeichnis).

## Lessons Learned

Haltungs-Wissen und Fallstricke aus echten Durchläufen liegen in `/Users/Shared/Nextcloud/Claude/ideation-lessons.md` — keine Template-Struktur, aber beim Session-Start kurz querlesen.

## Referenz-Durchläufe

- Muster empirisch validiert (vor Template-Anlage): `/Users/Shared/Nextcloud/Claude/WebsiteDesigner/` — XPRESS-Konzept für Nidal Sevim → Verallgemeinerung zum KI-Nutzungskonzepte-Leitfaden.
- Erster Durchlauf mit Template: `/Users/Shared/Nextcloud/Claude/wissenstransfer-ideation/` — Stille Wissensmigration als Beratungsangebot. Reflexion: `pipeline-reflexion_v0.1.md` im Projektverzeichnis.
- Zweiter Durchlauf mit Template: `/Users/Shared/Nextcloud/Claude/mux_community/` — Community-Version cipher-mux. Reflexion mit Scope-Diät-Entdeckung und External-Review-Erfahrung als Template-Beitrag.
