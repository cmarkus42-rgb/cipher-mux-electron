# Brain — Index

Dieses Verzeichnis ist das eigentliche Produkt der Phasen 1-3. Hier sammeln sich Erkenntnisse aus Recherche, Fokussierung und Interview als eigenständige Notes.

## Regeln für Notes

Jede Note ist ein eigenständiges Dokument — aussagekräftiger Titel, zusammenhängender Inhalt. Wiki-Links (`[[Note-Name]]`) im Fließtext, nicht als lose Bullet-Liste. Eine Note, die nirgends verlinkt ist, ist eine tote Note. Entweder einbinden oder löschen.

**Spekulative Wiki-Links sind verboten.** Keine Links auf Notes, die nicht existieren. Wenn eine Note später entstehen könnte, im Fließtext erwähnen ("*ein späterer Strang könnte X sein*"), aber nicht verlinken.

## Regeln für den Index

Dieser Index (`_index.md`) ist **Argumentations-Gerüst**, kein **Inhaltsverzeichnis**. Das bedeutet:

- Fließtext, der die Erkenntnis-Struktur trägt. Nicht: Bullet-Liste mit "Siehe Note X".
- Wiki-Links stehen im Satz, nicht in Listen.
- Ein Dritter, der nur den Index liest, soll die *Argumentation* des Denkstands verstehen, nicht nur die *Ablage*.
- Index wächst mit neuen Erkenntnissen — er ist kein Starter-Dokument, das einmal geschrieben und dann ignoriert wird.
- Index-Pflege macht der Main-Agent, nicht Sub-Agenten einer parallelen Phase-1-Recherche.

Struktur des Index (typisch, nicht Pflicht):

- *Was gibt's da draußen zum Thema?* — Zusammenfassung der Phase-1-Recherche in Fließtext.
- *Querverweise zwischen den Strängen* — Wo konvergieren zwei oder mehr Notes? Wo widersprechen sie sich?
- *Zu verhandeln in Phase 2* — Welche Fragen bleiben offen? Was muss entschieden werden?
- *Brief* — Verweis auf `brief.md`, sobald Phase 2 erreicht.

## Versionierung

Brain-Notes sind *lebende Dokumente*. Kein v0.1/v0.2-Versioning. Änderungen werden direkt in die Note geschrieben.

Ausnahme: `brief.md` hat eine Doppelrolle (Fokussierungs-Output und Eingabe für Phase 4). Bei substanziellen Struktur-Änderungen im Dialog: Datum im Frontmatter aktualisieren, am Ende ein kurzer Änderungshinweis ("*Nach Dialog am YYYY-MM-DD: XYZ hinzugefügt.*"). Keine v-Sprünge.

## Brief

Der zentrale Fokussierungs-Output aus Phase 2 gehört in `brief.md` (wird dort angelegt, wenn Phase 2 erreicht ist). Enthält: Adressat, Scope, Zielformat, wichtige Entscheidungen.

*Granularitäts-Regel:* Der Brief entscheidet Richtung, nicht Zahlen. Preis-Korridore, Tool-Picks, Paket-Schnitte gehören nicht in den Brief, sondern in Phase 4 (Konzeptentwurf).

## Stand der Ideation (2026-04-27)

Diese Ideation hat das Phasenmodell nicht klassisch durchlaufen — die Substanz kam aus einer Vor-Session als `spec-qa-entity.md` direkt in den Spec-Stand. Phase 1 und 2 wurden bewusst uebersprungen (kein Recherche-Bedarf, Adressat und Scope waren ueber den cipher-mux-Kontext implizit gesetzt). Der Hauptarbeitsschritt war Refinement der bestehenden Spec zu `spec-qa-entity-v0.2.md` mit korrigiertem Phasenmodell, Skalierungsregeln und ausgeklammerter Persona/Integration. Anschliessend Robustheits-Pruefung via [[pre-mortem-watchdog-v0.2-20260427]] — vier kritische Gruende identifiziert, fuenf konkrete Aenderungen fuer v0.3 abgeleitet.
