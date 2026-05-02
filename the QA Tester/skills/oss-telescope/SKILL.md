---
name: oss-telescope
description: Kartiert Open-Source-Bausteine für eine Idee, bevor etwas selbst gebaut wird. Scannt GitHub, HuggingFace, Dockerhub, Awesome-Listen, n8n-Community-Nodes nach Komponenten, die Teile des Problems abdecken. Verwende diesen Skill in Phase 1 (Recherche) oder Phase 2 (Fokussierung), besonders bei AI-Use-Cases und Automatisierungskonzepten. Aktiviert auf Anfrage ("OSS-Telescope", "Was gibt es schon", "Bausteine scannen") oder wenn die Idee technische Komponenten enthält, für die ein Eigenbau voreilig wäre.
---

# OSS-Telescope

## Zweck

Open-Source-first. Die meisten Ideen brauchen kein neues Python-Projekt — sie brauchen eine Kombination aus vorhandenen Bausteinen plus etwas eigenes Drumherum. Dieser Skill macht die Baustein-Landschaft systematisch sichtbar, bevor Code-Arbeit beginnt. Ergebnis: eine Stückliste, was vorhanden ist, und eine Lückenliste, was tatsächlich selbst gebaut oder zugekauft werden muss.

## Ablauf

1. **Idee in Komponenten zerlegen.** Claude liest den aktuellen Stand (meist aus `brief.md` oder `00_seed.md`) und zerlegt die Idee in funktionale Bausteine. Beispiel AI-Agent: LLM-Layer, Orchestrierung, Memory/Retrieval, UI, Tool-Integration, Deployment, Monitoring. Ohne Zerlegung keine saubere Suche.

2. **Pro Komponente suchen.** Quellen in dieser Reihenfolge:
   - **GitHub** — direkte Suche, Filter auf Sterne/letzter Commit/Sprache.
   - **Awesome-Listen** — `awesome-<thema>` auf GitHub. Oft der schnellste Weg zu kuratiertem Stand der Kunst.
   - **HuggingFace** — bei Modellen/Datasets/Spaces.
   - **Dockerhub / GHCR** — für lauffähige Container-Images.
   - **n8n Community Nodes** — bei Automatisierungs-Workflows. (community.n8n.io + n8n-nodes-\* auf npm)
   - **Package-Registries** — PyPI, npm, crates.io — wenn die Komponente eine Library ist.

   Web-Suche nutzen, nicht raten. Ergebnisse prüfen: letzter Commit, Issue-Tempo, Maintainer-Aktivität, Lizenz.

3. **Stückliste aufbauen.** Pro Komponente maximal 3 Kandidaten. Mehr ist Lärm. Format:

   ```markdown
   ### <Komponente>
   
   | Projekt | Link | Letzter Commit | Lizenz | Eignung | Anmerkung |
   |---------|------|----------------|--------|---------|-----------|
   | ... | ... | ... | ... | ✓ / ⚠ / ✗ | Warum / Warum nicht |
   ```

   **Eignung** ist bewusst knapp dreistufig:
   - ✓ passt direkt oder mit geringer Anpassung
   - ⚠ passt nur mit spürbarer Arbeit oder ist wackelig (Maintenance, Lizenz, Stabilität)
   - ✗ technisch nahe, praktisch nicht verwendbar

4. **Lückenliste.** Was bleibt, wenn alle Bausteine gesetzt sind? Das ist der Eigenanteil. Drei Kategorien:
   - **Glue** — Code, der nur die Bausteine verbindet. Typischerweise klein, aber projekt-spezifisch.
   - **Domain-Logik** — Das eigentlich Eigene. Hier liegt der Wert.
   - **Gaps** — Funktionalität, die kein Baustein liefert und die signifikanten Bau-Aufwand bedeutet. Wenn hier viel steht: prüfen, ob die Idee zu ambitioniert ist oder ob ein kommerzieller Baustein pragmatischer wäre.

5. **Lizenz-Check.** Pro verwendetem Baustein die Lizenz nennen. Kritische Punkte:
   - **Copyleft-Lizenzen** (GPL/AGPL) bei Komponenten, die in eigenes Produkt einfließen sollen.
   - **Nicht-kommerzielle Lizenzen** (z.B. manche ML-Modelle, RAIL-Lizenzen) bei Beratungsangeboten.
   - **Keine Lizenz gefunden** — dann ist der Baustein rechtlich nicht nutzbar, auch wenn Code öffentlich liegt.

6. **Ablage.** Ergebnis als Note: `brain/oss-telescope-<thema>-YYYYMMDD.md`. Verlinkt aus `brain/_index.md` unter *Bausteine*. Die Lückenliste fließt in `brief.md` zurück als *Eigenanteil* im Scope.

## Regeln

- **Keine Empfehlung ohne Lizenz-Klarheit.** Wenn die Lizenz nicht eindeutig feststellbar ist, markier es — verschweig es nicht.
- **Maintenance ist ein Risikosignal.** Letzter Commit vor 18 Monaten bei aktiver Konkurrenz ist ein ✗, nicht ein ⚠.
- **Sterne sind nicht Eignung.** Ein 30k-Sterne-Projekt, das nicht zur konkreten Anwendung passt, ist nicht besser als ein 200-Sterne-Projekt, das passt.
- **Kommerziell mitdenken.** OSS-first heißt nicht OSS-only. Wenn eine kommerzielle Lösung den Eigenanteil halbiert, gehört sie in die Liste mit explizitem Kosten-Hinweis.
- **Version und Release-Geschwindigkeit** sind bei AI-nahen Komponenten wichtiger als Sterne.

## Anti-Pattern

- *Fünf Bausteine pro Komponente.* Ist Recherche-Theater. Drei ist das Maximum, die Auswahl ist Teil der Arbeit.
- *Copyleft-Blindheit.* GPL-Libraries in einem Beratungsprojekt, das Code an Kunden liefert, sind selten das, was der Kunde will.
- *Keine Lückenliste.* Nur Bausteine aufzählen, ohne zu sagen was fehlt, ist wertlos für die Entscheidung über Eigenanteil.
- *Einsatz vor Phase 1.* Vor dem Seed keinen OSS-Telescope starten — ohne klaren Scope ist jede Suche zu breit.

## Kombinationen

- Nach `oss-telescope` oft sinnvoll: `pre-mortem` — speziell zum Risiko "Maintainer verschwindet" bei kritischen Bausteinen.
- Bei Lückenliste mit `Gaps`: `persona-roundtable` mit *Pragmatischer Umsetzer* — deckt auf, wie viel die Lücken tatsächlich kosten.
