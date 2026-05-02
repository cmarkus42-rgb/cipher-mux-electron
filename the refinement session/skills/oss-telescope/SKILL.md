---
name: oss-telescope
description: "Kartiert existierende Loesungen und Bausteine fuer eine Idee, bevor etwas selbst gebaut wird. Scannt nach Tools, Libraries, Services die Teile des Problems abdecken. Verwende diesen Skill in Phase 2 wenn technische Komponenten in der Idee stecken. Aktiviert auf Anfrage ('Was gibt es schon', 'Bausteine', 'OSS-Telescope') oder wenn Relay es vorschlaegt."
---

# OSS-Telescope

## Zweck

Die meisten Ideen brauchen kein neues Projekt von Grund auf — sie brauchen eine Kombination aus vorhandenen Bausteinen plus etwas Eigenes drumherum. Dieser Skill macht die Baustein-Landschaft sichtbar bevor Code-Arbeit beginnt.

Im Anforderungs-Kontext: Nicht um den Tech-Stack zu waehlen (das macht die Ziel-Session), sondern um zu verstehen was es schon gibt und wo die Idee Neuland betritt. Das beeinflusst den Scope und die Realitaet der Anforderungen.

## Ablauf

1. **Idee in Komponenten zerlegen.** Relay liest den aktuellen Stand (aus `brain/seed.md` oder `brain/brief.md`) und zerlegt die Idee in funktionale Bausteine. Beispiel Web-App: Frontend-Framework, Backend, Datenbank, Auth, Hosting, APIs, CI/CD.

2. **Pro Komponente suchen.** Quellen:
   - **Bestehende Tools** — Gibt es ein fertiges Produkt das das Problem loest? (Auch kommerzielle.)
   - **Open-Source-Projekte** — GitHub, Awesome-Listen, Package-Registries
   - **APIs und Services** — Stripe, Auth0, Supabase, etc.
   - **Templates und Starter-Kits** — Existiert ein Boilerplate das 80% abdeckt?

   Web-Suche nutzen, nicht raten. Ergebnisse pruefen: letzter Commit, Aktivitaet, Lizenz.

3. **Stueckliste aufbauen.** Pro Komponente maximal 3 Kandidaten:

   ```markdown
   ### <Komponente>

   | Loesung | Art | Eignung | Anmerkung |
   |---------|-----|---------|-----------|
   | ... | OSS/Service/Tool | gut/bedingt/nein | Warum |
   ```

4. **Lueckenliste.** Was bleibt wenn alle Bausteine gesetzt sind? Drei Kategorien:
   - **Glue** — Code der nur die Bausteine verbindet. Klein, aber projekt-spezifisch.
   - **Domain-Logik** — Das eigentlich Eigene. Hier liegt der Wert.
   - **Gaps** — Funktionalitaet die kein Baustein liefert und signifikanten Aufwand bedeutet.

5. **Rueckfluss.** Die Stueckliste beeinflusst die Anforderungen:
   - Fertiges Tool deckt 80% ab → Scope auf die fehlenden 20% fokussieren
   - Grosse Gaps → Scope pruefen, vielleicht ist das Projekt groesser als gedacht
   - Existierende Loesung tut genau das → Frage an den User: "Brauchst du wirklich ein eigenes Projekt?"

6. **Ablage.** Ergebnis als Note: `brain/oss-telescope.md`. Lueckenliste fliesst in `brain/brief.md` als *Eigenanteil*.

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
