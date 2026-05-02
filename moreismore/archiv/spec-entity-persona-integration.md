# Spec: Entity- und Persona-Integration in cipher-mux

**Status:** Draft
**Datum:** 2026-04-27
**Kontext:** cipher-mux hat mehrere Entities (Companion, Refinement, Audit, Orchestrator, MPO) und soll weitere bekommen (Watchdog/QA-Tester, Project Launcher). Diese Entities sollen als Presets im LauncherCell-Popup verfuegbar sein und eine konsistente Persona-Integration haben. Aktuell funktioniert beides nicht zuverlaessig — Persona-Integration wurde versucht, ist aber gescheitert. Presets fehlen oder sind unvollstaendig.

**Wichtig:** Dieses Dokument beschreibt Anforderungen ausfuehrlich und explizit. Hintergrund: In vorherigen Iterationen sind Anforderungen auf dem Uebersetzungsweg zwischen Spec, Orchestrator und Worker verloren gegangen. Jede Anforderung hier ist eine harte Anforderung, keine Anregung.

---

## Problem

### 1. Persona-Integration gescheitert

Konzept: Alle Entities sind digitale Rollen derselben Companion-Persona "Relay". Eine Person, verschiedene Huete — wie ein Kollege der mal als Berater, mal als Tester, mal als Pruefer auftritt, aber immer derselbe Mensch ist.

**Was nicht funktioniert (Stand 2026-04-27):**
- Audit laeuft als "Wayne Szalinski" mit voellig anderem Charakter (enthusiastisch, Nerd-Humor) statt als Relay (trocken, sachlich)
- Kein konsistenter Uebergang zwischen Rollen — wenn der User vom Companion zum Audit wechselt, fuehlt es sich wie ein anderer Mensch an
- Companion-Memory (Langzeitgedaechtnis ueber Sessions) wird nicht rollenuebergreifend genutzt — Refinement weiss nicht was der Companion gelernt hat

**Was funktioniert:**
- Companion (Relay als Guide) hat eine klare, funktionierende Persona
- Refinement (Relay als Ideation-Partner) hat eine klare, funktionierende Persona
- Beide haben denselben Grundton (sachlich, trocken, Deutsch, Du-Form)

### 2. Presets unvollstaendig

Das LauncherCell-Popup zeigt Presets fuer Session-Typen. Aktuell verfuegbar:
- Orchestrator
- MPO
- Companion
- Custom (freier Pfad)

**Was fehlt:**
- **Refinement** — existiert als Entity, aber kein Preset
- **Audit** — existiert als Entity, aber kein Preset
- **Project Launcher** — existiert als eigenstaendiges Tool unter `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher`, aber kein Preset. War FR1 im v0.11-w3.1-Anforderungspaket, wurde nicht umgesetzt.
- **Watchdog (QA-Tester)** — existiert noch nicht als Entity, ist als neue Rolle geplant (siehe spec-qa-entity.md)

### 3. Entity-Registrierung ist manuell und fragil

Entities werden in `~/.config/cipher-mux/entities/` als Verzeichnisse mit CLAUDE.md angelegt. Presets sind hardcoded im LauncherCell-Code. Es gibt keine dynamische Entity-Registry die beides verbindet.

---

## Anforderungen

### A. Persona-Konsistenz (MUST)

#### A.1 — Alle Entities sind Relay
Jede Entity-Session startet mit derselben Basis-Persona "Relay". Die Entity-CLAUDE.md definiert die **Rolle** (was Relay in dieser Session tut), nicht eine neue **Persoenlichkeit**.

**Konkret heisst das:**
- **Gleicher Grundton** in jeder Rolle: Deutsch, Du-Form, sachlich, trocken, kein Service-Laecheln, keine Begeisterungs-Floskeln
- **Gleiche Anti-Patterns** in jeder Rolle: Kein "Grossartige Frage!", kein "Das ist ganz einfach!", kein Disclaimer-Padding
- **Rollenspezifisches Verhalten** definiert WAS Relay tut (testen, pruefen, beraten, erklaeren), nicht WIE er klingt
- **Audit muss umgeschrieben werden** — Wayne Szalinski wird durch Relay-in-Audit-Rolle ersetzt

#### A.2 — Rollen-Uebergang sichtbar aber natuerlich
Wenn der User von einer Session zur anderen wechselt, soll Relay seinen Rollenwechsel kurz und natuerlich machen. Kein theatralischer Wechsel, kein "Ich bin jetzt der Tester". Eher wie ein Kollege der von einem Meeting ins naechste geht.

**Beispiel:**
- User wechselt von Companion zu Audit: "So, Code-Review. Welches Projekt?"
- User wechselt von Refinement zurueck zum Companion: "Gut, Spec steht. Was als naechstes?"

#### A.3 — Companion-Memory rollenuebergreifend
Relay soll in jeder Rolle auf dasselbe Companion-Memory zugreifen koennen. Wenn der Companion lernt "User baut Trading-App", soll Refinement das wissen. Wenn Audit ein Security-Pattern findet, soll der Companion das beim naechsten Mal erwaehnen koennen.

**Technisch:** Companion-Memory-Tools (`companion_memory_write`, `companion_memory_recall`, `companion_memory_search`) muessen in jeder Entity-CLAUDE.md verfuegbar und instruiert sein.

### B. Preset-Vollstaendigkeit (MUST)

#### B.1 — Alle Entities als Presets
Jede registrierte Entity muss als Preset im LauncherCell-Popup erscheinen. Folgende Presets muessen vorhanden sein:

| Preset | Entity-Pfad | Beschreibung im Popup |
|--------|------------|----------------------|
| Companion | `~/.config/cipher-mux/entities/companion` | Interaktiver Coding-Companion mit Gedaechtnis |
| Refinement | `~/.config/cipher-mux/entities/refinement` | Von der Idee zur Spec — Ideation und Anforderungen |
| Audit | `~/.config/cipher-mux/entities/audit` | Code-Qualitaet, Security und Dokumentation pruefen |
| Orchestrator | `~/.config/cipher-mux/orchestrator` | Task-Delegation und Worker-Koordination |
| MPO | `~/.config/cipher-mux/mpo` | Multi-Projekt-Orchestrierung fuer grosse Vorhaben |
| Project Launcher | `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher` | Neues SDD-Projekt bootstrappen (6-Phasen-Prozess) |
| Watchdog | `~/.config/cipher-mux/entities/watchdog` | Systematisches Testing und QA |

#### B.2 — Presets dynamisch aus Entity-Registry
Presets sollen NICHT hardcoded sein. Stattdessen:
1. Beim App-Start: `~/.config/cipher-mux/entities/` scannen
2. Jede Entity mit CLAUDE.md wird als Preset registriert
3. Zusaetzlich: Orchestrator und MPO aus ihren bekannten Pfaden
4. Zusaetzlich: Project Launcher aus seinem Pfad (konfigurierbar)
5. Preset-Reihenfolge und -Anzeige konfigurierbar (spaeter, nicht V1)

#### B.3 — Preset-Darstellung
Jedes Preset im LauncherCell-Popup zeigt:
- **Name** (fett): z.B. "COMPANION"
- **Beschreibung** (eine Zeile): z.B. "Interaktiver Coding-Companion mit Gedaechtnis"
- **Status-Indikator** wenn eine Session dieses Typs schon laeuft: "Laeuft" in der Entity-Farbe
- **Kein Emoji**, nur Text und ggf. Entity-Farbe als Akzent

### C. Neue Entity: Watchdog / QA-Tester (SHOULD)

#### C.1 — Entity-Definition
Verzeichnis `~/.config/cipher-mux/entities/watchdog/` mit CLAUDE.md nach den Vorgaben in `moreismore/spec-qa-entity.md`. Persona ist Relay in QA-Rolle (siehe A.1).

#### C.2 — Kern-Faehigkeiten
- Testcases aus Spec oder Testcases-Dokument lesen und systematisch durchgehen
- Akzeptanzkriterien pruefen
- Edge Cases aktiv suchen
- Bugs als Bugreports filen (in Outbox oder als Notes)
- Regressions-Tracking (bekannte Bugs erneut pruefen)

#### C.3 — Abgrenzung zum Companion
- Companion: erklaert, begleitet, exploriert mit dem User zusammen
- Watchdog: testet systematisch, sucht Fehler, dokumentiert Befunde
- Companion kann weiterhin fuer lockere Walkthroughs und Smoke-Tests genutzt werden
- Watchdog uebernimmt bei strukturierten Testlaeufen und Abnahmen

### D. Entity-CLAUDE.md Konsolidierung (MUST)

#### D.1 — Einheitliche Struktur
Jede Entity-CLAUDE.md folgt dieser Struktur:

```markdown
# Relay — [Rollenname]

## Rolle
[1-3 Saetze was Relay in dieser Session tut]

## Persona
[Verweis auf gemeinsame Relay-Persona, KEINE eigene Persoenlichkeit definieren]
Relay-Basis: sachlich, trocken, Deutsch, Du-Form, kein Service-Laecheln.
Rollenspezifisch: [was in dieser Rolle anders ist, z.B. "adversarial beim Testen"]

## Companion-Memory
[Instruktionen fuer Memory-Nutzung in dieser Rolle]

## Faehigkeiten
[Was diese Rolle kann und tut]

## Arbeitsregeln
[Spezifische Regeln fuer diese Rolle]

## Scope
[Was diese Session ist und NICHT ist]
```

#### D.2 — Audit-CLAUDE.md Rewrite
Die aktuelle Audit-CLAUDE.md muss umgeschrieben werden:
- Wayne Szalinski Persona entfernen
- Durch Relay-in-Audit-Rolle ersetzen
- Gleicher Ton wie Companion und Refinement
- Audit-Faehigkeiten und Phasenmodell bleiben erhalten

---

## Abgrenzung

**In Scope:**
- Persona-Konsistenz ueber alle Entities
- Audit-CLAUDE.md Rewrite
- Preset-Dynamik aus Entity-Registry
- Watchdog Entity-Definition
- Project Launcher als Preset
- Entity-CLAUDE.md Template

**Out of Scope:**
- Companion-Memory-Architektur aendern (funktioniert, nur Zugriff erweitern)
- Workspace-Integration der Entities (separates Thema)
- Voice-Relay-Persona (hat eigene Constraints wegen TTS)
- Entity-spezifische UI-Elemente (z.B. Audit-Report-View)

---

## Implementierungs-Reihenfolge

### Phase 1: Persona-Konsolidierung (kein Code)
1. Relay-Basis-Persona als eigene Datei: `~/.config/cipher-mux/entities/RELAY-BASE.md`
2. Audit-CLAUDE.md umschreiben (Wayne → Relay)
3. Watchdog-CLAUDE.md erstellen
4. Alle Entity-CLAUDE.md auf einheitliche Struktur bringen

### Phase 2: Preset-Dynamik (Code)
5. Entity-Scanner: `~/.config/cipher-mux/entities/` beim Start lesen
6. LauncherCell: Presets dynamisch aus Entity-Liste generieren
7. Project Launcher als konfigurierbare Zusatz-Entity registrieren
8. Status-Indikator fuer laufende Entity-Sessions

### Phase 3: Companion-Memory-Erweiterung (Code + Config)
9. Companion-Memory-Tools in alle Entity-CLAUDE.md aufnehmen
10. Memory-Recall bei Session-Start fuer alle Entities instruieren

---

## Risiken

| Risiko | Mitigation |
|--------|-----------|
| Relay-Persona wird zu generisch wenn alle gleich klingen | Rollenspezifisches Verhalten klar definieren — gleicher Ton, verschiedene Haltung |
| Anforderungen gehen auf dem Weg zum Worker verloren | Diese Spec als Referenz mitgeben, Worker muss Spec lesen bevor er anfaengt |
| Entity-Scanner findet kaputte Entity-Verzeichnisse | Defensiv: nur Verzeichnisse mit valider CLAUDE.md als Entity registrieren |
| Project Launcher Pfad ist instanz-spezifisch | Pfad in Config-Store speichern, nicht hardcoden |
