# Vollstaendigkeitscheck -- MPO-Auftrag Konsolidiert

**Datum:** 2026-04-28
**Pruefer:** QA-Agent (Orchestrator-delegiert)
**Geprueftes Dokument:** `moreismore/MPO-AUFTRAG-KONSOLIDIERT-2026-04-28.md`

---

## Methodik

15 Quelldokumente gelesen und granular gegen das konsolidierte Dokument abgeglichen:

1. `docs/v0.11-w3.1-testcases.md` (708 Zeilen, 90+ Einzelbefunde)
2. `moreismore/spec-entity-persona-integration.md` (204 Zeilen)
3. `moreismore/spec-qa-entity.md` (219 Zeilen)
4. `moreismore/spec-learning-separation.md` (264 Zeilen)
5. `moreismore/feature-testcase-modus.md` (165 Zeilen)
6. `moreismore/plan-testcase-modus.md` (107 Zeilen)
7. `moreismore/notes-management-system.md` (77 Zeilen)
8. `moreismore/tag-management-ui.md` (44 Zeilen)
9. `moreismore/feature-stt-in-notes-editor.md` (25 Zeilen)
10. `moreismore/feature-compact-background-sessions.md` (35 Zeilen)
11. `moreismore/bug-copy-paste-notes-editor.md` (36 Zeilen)
12. `moreismore/bug-mcp-connection-drops.md` (31 Zeilen)
13. `moreismore/handoff-orchestrator-2026-04-28.md` (134 Zeilen)
14. `moreismore/CompanionPrompt.md` (User-Korrekturen, 74 Zeilen)
15. `moreismore/MPO-AUFTRAG-KONSOLIDIERT-2026-04-28.md` (das Pruef-Objekt, 870 Zeilen)

Insgesamt 187 granulare Anforderungen extrahiert und einzeln geprueft.

---

## Ergebnis-Zusammenfassung

| Kategorie | Anzahl |
|-----------|--------|
| ENTHALTEN | 139 |
| FEHLT (kritisch) | 21 |
| UNVOLLSTAENDIG | 14 |
| VERALTET / FALSCH | 13 |
| **Gesamt extrahiert** | **187** |

**Bewertung:** Das Dokument deckt ca. 74% der Anforderungen korrekt ab. Die fehlenden und falschen Punkte konzentrieren sich auf zwei Bereiche: (1) **Cluster E ist fundamental falsch konzipiert** (User-Korrekturen nicht eingearbeitet) und (2) **diverse Einzel-Bugs/Features aus den Testcases fehlen oder sind unvollstaendig**.

---

## FEHLENDE Anforderungen (kritisch)

### FE-01: Preset Editor im Companion-Editor-Fenster
**Quelle:** CompanionPrompt.md (User-Korrektur 3)
**Was fehlt:** Komplett neue Anforderung -- der Companion-Editor soll um einen Preset Editor erweitert werden, in dem ALLE Entities/Presets bearbeitbar sind:
- Reiter-basierte Organisation (Rolle, Faehigkeiten, Arbeitsregeln, Scope)
- Scrollbares Fenster mit guter Hoehe
- Warnung bevor man editiert ("Bist du sicher?")
- Transparenz: man soll sehen WIE es gemacht ist
- Anpassbarkeit: man soll es aendern koennen
- Neue Presets erstellen die wie andere Entities integriert werden
- Companion Memory wird NICHT im Editor angeboten (teilt sich ohnehin)

**Im Dokument:** Komplett nicht vorhanden. Weder in E noch anderswo erwaehnt.

---

### FE-02: Persona ist AUSWAHLBAR und EDITIERBAR, nicht fest "Relay"
**Quelle:** CompanionPrompt.md (User-Korrektur 1, 2)
**Was fehlt:** Das Grundkonzept von E.1 ist falsch. Die Persona kommt aus der Companion-Steuerung (Workspace-Fenster, Companion-Tab), ist dort auswaehlbar (Relay, Wayne, oder custom), und die GEWAEHLTE Persona wirkt dann konsistent ueber alle Entities.

**Im Dokument:** E.1 sagt "Alle Entities sind Relay" -- das ist ein Missverstaendnis. Es geht nicht um Relay, sondern um KONSISTENZ der gewaehlten Persona.

---

### FE-03: Preset-Zusammensetzung = Companion-Persona + entity-spezifische Faehigkeiten
**Quelle:** CompanionPrompt.md (User-Korrektur 2)
**Was fehlt:** Ein Preset setzt sich zusammen aus:
1. Companion-Persona (Charakter, Ton, Humor, Regeln) -- auswaehlbar
2. Entity-spezifische Faehigkeiten -- pro Preset definiert

Der Rollenname kommt aus der Persona, nicht fest "Relay".

**Im Dokument:** E.4 zeigt Template mit "# Relay -- [Rollenname]" -- das ist falsch, sollte "# [Persona-Rollenname] -- [Entity-Funktion]" sein.

---

### FE-04: ALLE Entity-CLAUDE.md muessen umgeschrieben werden
**Quelle:** CompanionPrompt.md (User-Korrektur 4)
**Was fehlt:** Nicht nur Audit, sondern ALLE Entity-CLAUDE.md muessen ins neue Konzept. Persona getrennt von Faehigkeiten, Persona kommt aus der Companion-Steuerung.

**Im Dokument:** E.4 erwaehnt nur "Audit-CLAUDE.md muss komplett umgeschrieben werden". Alle anderen fehlen.

---

### FE-05: T-UI.X25 Persona-Injection fuer ALLE Entities (zwei-teilig)
**Quelle:** CompanionPrompt.md (User-Korrektur 5), Testcases T-UI.X25
**Was fehlt:** Die Persona muss in zwei Teile getrennt werden:
1. **Charakter** (Ton, Sprache, Humor, Do/Don't) -- wird an ALLE Entities injiziert
2. **Skillset/Aufgaben** -- bleibt entity-spezifisch

Der Charakter kommt aus der Companion-Steuerung im Workspace-Fenster, nicht fest Relay.

**Im Dokument:** T-UI.X25 ist in der Bug-Tabelle erwaehnt (Zeile "Persona-Injection nur fuer Companion", Cluster E.1), aber die ZWEI-TEILUNG der Persona und die dynamische Herkunft aus der Companion-Steuerung fehlen komplett. Das Testcases-Dokument beschreibt es korrekt (T-UI.X25), das konsolidierte Dokument hat es nicht uebernommen.

---

### FE-06: mux_ui_open Toggle/Close-Faehigkeit
**Quelle:** Testcases T-UI.X36
**Was fehlt:** `mux_ui_open` kann Popups oeffnen aber nicht schliessen. Empfehlung: Toggle-Verhalten oder Parameter `action: "open" | "close" | "toggle"`.

**Im Dokument:** Nicht erwaehnt. B.5 behandelt Demo-Mode-Feinsteuerung, aber T-UI.X36 ist ein eigenstaendiger Bug.

---

### FE-07: Einzelne Notes in Sidebar highlighten
**Quelle:** Testcases T-UI.X37
**Was fehlt:** Dynamisches Highlight-Target `side-note-{id}` um einzelne Notes hervorzuheben. Gilt analog fuer andere Sidebar-Eintraege.

**Im Dokument:** Nicht erwaehnt.

---

### FE-08: Auto-Start Companion bei keinem Workspace
**Quelle:** Testcases Feature-Requests (Zeile 687)
**Was fehlt:** "Auto-Start Companion wenn kein Workspace geladen (mit Setting zum Abschalten)"

**Im Dokument:** Nicht erwaehnt.

---

### FE-09: Testcase-Modus als Preset/Entity im Entity-Modell (Cluster E Integration)
**Quelle:** Plan-Testcase-Modus, Konsolidiertes Dokument D.1 (eigener Hinweis)
**Was fehlt:** D.1 erwaehnt explizit: "er muss in Abstimmung -- im Konzept folgend auf -- Cluster E abgestimmt umgesetzt werden, da der Modus -- die Persona -- eines der Presets sein soll". Die konkrete Integration des Testing-Modus als Preset im neuen Entity-Modell aus E ist unzureichend beschrieben. B2 (UI/Tool-Integration, Preset) verweist nur auf E.3, aber E.3 beschreibt den Watchdog, nicht die Testcase-Modus-Entity.

---

### FE-10: LLM-gestuetzte Tag-Reorganisation
**Quelle:** notes-management-system.md
**Was fehlt:** "LLM-gestuetzte Reorganisation wenn zu viele Tags entstehen (Auto-Vorschlaege fuer Umstrukturierung, Zusammenfuehrung, Aufteilung)"

**Im Dokument:** C.1 erwaehnt dies nicht.

---

### FE-11: Tag-Management: Seed-Tags vs. Custom unterscheiden
**Quelle:** tag-management-ui.md
**Was fehlt:** "UI sollte zwischen Seed und Custom unterscheiden koennen"

**Im Dokument:** C.2 erwaehnt dies nicht.

---

### FE-12: Watchdog Workflow-Integration mit anderen Entities
**Quelle:** spec-qa-entity.md (Zusammenspiel-Tabelle)
**Was fehlt:** Konkretes Zusammenspiel:
- Audit meldet Code-Problem -> Watchdog prueft Verhaltens-Impact
- Companion meldet User-Bug -> Watchdog reproduziert systematisch
- Orchestrator fix ist done -> Watchdog verifiziert
- Refinement liefert Spec -> Watchdog erstellt Testplan vorab (Shift-Left)
- Orchestrator-CLAUDE.md erweitern: nach Worker-Done optional Watchdog triggern
- Companion-Routing: "Bug gefunden" -> an Watchdog weiterleiten

**Im Dokument:** E.3 erwaehnt nur "Orchestrator triggered nach Worker-Done" -- die anderen Integrationspunkte fehlen.

---

### FE-13: Learning-Separation: Migrations-Plan fuer bestehende Learnings
**Quelle:** spec-learning-separation.md (Abschnitt "Migration")
**Was fehlt:** Konkrete Migrations-Tabelle mit 14 Orchestrator-Eintraegen (9 produkt, 5 privat), plus Companion/Refinement/Audit-Inventarisierung als eigene Aufgaben.

**Im Dokument:** E.5 erwaehnt die Routing-Regel, aber nicht den konkreten Migrations-Backlog.

---

### FE-14: Learning-Separation: Dateiformat fuer Learning-Vorschlaege
**Quelle:** spec-learning-separation.md
**Was fehlt:** Definiertes MD-Format fuer Learning-Vorschlaege (Quelle, Typ, Ziel-Entity, Erkenntnis, Kontext, vorgeschlagene Aenderung).

**Im Dokument:** Nicht erwaehnt.

---

### FE-15: BugReport z-Index Problem (T-VC.4 Detail)
**Quelle:** Testcases T-VC.4
**Was fehlt:** Info-Popup schwebt UEBER dem BugReport-Popup. BugReport wird einen Layer zu tief geoeffnet.

**Im Dokument:** T-VC.4/5 sind in der Bug-Tabelle, aber das z-Index-Detail fehlt.

---

### FE-16: BugReport STT-Ablauf (T-VC.4 Detail)
**Quelle:** Testcases T-VC.4
**Was fehlt:** Erwarteter Ablauf: BugReport auswaehlen -> STT aus -> BugReport-Popup oeffnet (Voice deaktiviert) -> User erfasst Report -> Popup schliessen -> falls vorher STT an: STT wieder aktivieren.

**Im Dokument:** Nur als einzeiliger Bug erwaehnt, nicht der konkrete Soll-Ablauf.

---

### FE-17: mux_send Duale Delivery (T-UI.X6)
**Quelle:** Testcases T-UI.X6
**Was fehlt:** Architektur-Entscheidung steht: jedes mux_send mit Push-Delivery soll BEIDES tun: tmux send-keys UND Message-Bus-Eintrag. Fuer User sichtbar in Sidebar.

**Im Dokument:** T-UI.X6 ist in der Tabelle "Weitere Bugs" erwaehnt, aber die Architektur-Entscheidung (tmux + Bus gleichzeitig) ist nicht als Anforderung formuliert.

---

### FE-18: mux_create_session: Zwei Modi (Entity-Start vs. Plain)
**Quelle:** Testcases T-UI.X23
**Was fehlt:** Bei Entity-Presets soll Claude mit den richtigen Optionen gestartet werden. Bei Plain Sessions nur tmux-Session ohne Claude. Zwei explizite Modi.

**Im Dokument:** T-UI.X23 ist in der Bug-Tabelle erwaehnt ("Feature: zwei Modi"), aber die Anforderung ist nicht ausformuliert.

---

### FE-19: T-LC.5 GridSelector-Popup bei eindeutiger Zelle
**Quelle:** Testcases T-LC.5
**Was fehlt:** "Bei Klick auf andere Zelle im Popup wird Session doppelt angezeigt (nur eine tatsaechliche Session, aber in zwei Zellen sichtbar)". Als eigener Bug im Testcases-Dokument erkannt.

**Im Dokument:** Nur als einzeilige Tabellen-Zeile ("Regression von RT-X2? Re-Test noetig"), das Doppelanzeigesymptom fehlt.

---

### FE-20: Testcase-Modus: Nicht-funktionale Anforderungen
**Quelle:** feature-testcase-modus.md
**Was fehlt:**
- Design: Pixel-Art / CSS-Art gemaess cipher-mux Design-Direktive, keine Emojis
- Performance: 50+ Items fluessig
- Plattform: macOS (Electron), Screenshot-Capture nutzt macOS-native APIs
- Dateigroesse: Screenshots als separate Dateien

**Im Dokument:** D.1 erwaehnt teilweise (Format), aber nicht die nicht-funktionalen Constraints.

---

### FE-21: Testcase-Modus: Bekannte Risiken
**Quelle:** feature-testcase-modus.md, plan-testcase-modus.md
**Was fehlt:** macOS Screen Recording Permission, Parser-Robustheit, Format-Versionierung, grosse Testcases. D.1 erwaehnt nur den Screenshot-Spike.

---

## UNVOLLSTAENDIGE Anforderungen

### UV-01: E.1 -- Persona-Konsistenz
**Was drinsteht:** "Alle Entities sind Relay -- gleicher Grundton, verschiedene Rollen"
**Was fehlt:** Die Persona ist auswaehlbar, nicht fest Relay. Der Charakter-Teil wird an alle Entities injiziert, der Skillset-Teil bleibt entity-spezifisch. Komplett neue Beschreibung noetig (siehe FALSCH-Abschnitt).

### UV-02: E.4 -- Entity-CLAUDE.md Template
**Was drinsteht:** Template-Struktur mit "# Relay -- [Rollenname]"
**Was fehlt:**
- Header sollte den Persona-Rollennamen verwenden, nicht "Relay"
- ALLE Entity-CLAUDE.md muessen umgeschrieben werden (nicht nur Audit)
- Persona-Sektion verweist auf die gewaehlte Companion-Persona, nicht auf eine feste Relay-Base

### UV-03: C.1 -- Notes-Verwaltungssystem
**Was drinsteht:** Kernkonzept, Funktionen, Technische Basis
**Was fehlt:** LLM-gestuetzte Tag-Reorganisation (Auto-Vorschlaege)

### UV-04: C.2 -- Tag-Management UI
**Was drinsteht:** Grundfunktionen (umbenennen, loeschen, anlegen, editieren)
**Was fehlt:** Seed-Tags vs. Custom unterscheiden, IPC-Channel-Liste, URL-Routing-Details

### UV-05: B.7 -- Highlight-Design
**Was drinsteht:** Border-Glow statt flaechiger Glow, einheitliche Helligkeit
**Was fehlt:** Outline-Style muss sich SICHTBAR vom Glow unterscheiden (T-DM.2 FAIL). Aktuell wird nur erwaehnt "Zusaetzlich: Outline-Style muss sich sichtbar unterscheiden" -- kein konkreter Design-Vorschlag.

### UV-06: F.2 -- TTS Konzept-Review
**Was drinsteht:** Gewuenschtes Vorgehen, relevanter Code
**Was fehlt:** Konkrete Alternativen aus dem Testcases-Dokument: Text-Marker im Voice-Relay Output, MCP-Tool das Text direkt an TTS sendet, Latenz-Prioritaet

### UV-07: D.1 -- Testcase-Modus
**Was drinsteht:** Workstreams A+B mit Unterpunkten
**Was fehlt:**
- Screenshot-Methode Detail (desktopCapturer vs. screencapture -i -c)
- MPO-Vertrag Format-Details (Regeln: YAML-Frontmatter, Checkbox-Format, Sektionen)
- Archivierung: abgearbeitete Testcases read-only, mit Datum + Zusammenfassung
- Auslagern-Feature: Button "Als Feature-Request auslagern" im Kommentarfeld
- Rueckkanal: Sessions lesen Ergebnis ueber bestehende Notes-Tools

### UV-08: E.3 -- Watchdog Entity
**Was drinsteht:** Rolle, Phasen, Persona, Abgrenzung
**Was fehlt:**
- Phase 4 (Regressions-Tracking) Details: Regressions-DB als Note, bei jedem Testlauf pruefen
- Werkzeuge: Regressions-DB-Template, Testplan-Template, Testbericht-Template, Bugreport-Shortcut

### UV-09: E.5 -- Learning-Separation
**Was drinsteht:** Zwei-Klassen-System, Routing-Regel, Code-Features
**Was fehlt:** Rueckkanal-Design (moreismore/ als Sammelstelle), Dateiformat, Migrations-Plan

### UV-10: A.3 -- Verwaiste Sessions
**Was drinsteht:** Root-Cause-Hypothese, Loesungsoptionen, Empfehlung
**Was fehlt:** Konkrete Reproduktions-Schritte (App starten ohne Workspace, 2 Sessions manuell, LauncherCell -> alle 5 "laeuft")

### UV-11: F.1 -- STT-Bugs
**Was drinsteht:** T-VC.X1 in Bug-Tabelle
**Was fehlt:** STT Leerzeichen-Bug (T-VC.X3 / T-UI.X7) ist in der Bug-Tabelle, aber kein konkreter Fix-Vorschlag ("nach jedem STT-Segment ein Leerzeichen anhaengen")

### UV-12: H.1 -- Template-Learnings
**Was drinsteht:** 5 Aenderungen, betroffene Dateien
**Was fehlt:** Konkreter Inhalt der Aenderungen (aus dem Handoff-Dokument):
- Bugfix-Phasenmodell, Macro-Analysis Eskalation, Worker-Briefing-Regeln, Thematisches Clustering, Worker lebt bis Re-Test PASS, Context-Uebergabe bei >80%, Subagents fuer Debugging

### UV-13: Sidebar-Fenster (T-UI.X1)
**Was drinsteht:** In Bug-Tabelle als "Sidebar-Fenster komplett"
**Was fehlt:** Das 4-Punkte-Soll-Verhalten aus den Testcases:
1. Sidebar-Button = Show/Hide-Toggle bei ausgepopptem Fenster
2. Fenster-X = Sidebar weg (nicht reintegrieren)
3. Separater Andock-Button zum Reintegrieren
4. Fenstergroesse merken

### UV-14: Workspaces-Fenster schwarz (T-UI.X24)
**Was drinsteht:** In Bug-Tabelle
**Was fehlt:** Kein Detail. Testcases sagen: "oeffnet sich mit schwarzem Hintergrund und Fehlermeldung. Inhalt nicht sichtbar/nutzbar."

---

## VERALTETE / FALSCHE Anforderungen

### FA-01: E.1 -- "Alle Entities sind Relay" (FALSCH)
**Was drinsteht:** "A.1: Alle Entities sind Relay -- gleicher Grundton, verschiedene Rollen"
**Richtig laut User:** Es geht NICHT darum, dass alles Relay ist. Die gewaehlte Persona (auswaehlbar im Companion-Editor) wirkt konsistent ueber alle Entities. Relay ist nur ein Default, nicht die Pflicht-Persona.

### FA-02: E.1 -- "RELAY-BASE.md" als eigene Datei (VERALTET)
**Was drinsteht:** "Persona-Konsolidierung: RELAY-BASE.md"
**Richtig laut User:** Es gibt keinen festen Relay-Base. Die Persona kommt aus der Companion-Steuerung im Workspace-Fenster und ist dynamisch (kann Relay, Wayne oder custom sein).

### FA-03: E.4 -- Template mit "# Relay -- [Rollenname]" (FALSCH)
**Was drinsteht:** Feste Template-Struktur mit Relay im Header
**Richtig laut User:** Der Rollenname kommt aus der gewaehlten Persona, nicht fest "Relay".

### FA-04: E.4 -- "Audit-CLAUDE.md muss komplett umgeschrieben werden" (UNVOLLSTAENDIG)
**Was drinsteht:** Nur Audit
**Richtig laut User:** ALLE Entity-CLAUDE.md muessen umgeschrieben werden. Persona getrennt von Faehigkeiten.

### FA-05: E.1 Implementierung Phase 1 (FALSCH)
**Was drinsteht:** "Persona-Konsolidierung: RELAY-BASE.md, Audit-Rewrite, Watchdog-CLAUDE.md, einheitliche Struktur"
**Richtig:** Die Implementierung muss stattdessen:
- Companion-Editor um Preset-Editor erweitern
- Persona-Injection fuer alle Entities (Charakter-Teil aus Companion-Steuerung)
- Alle CLAUDE.md umschreiben (Persona und Faehigkeiten trennen)

### FA-06: E.2 -- Entity-Scanner als einziger Mechanismus (UNVOLLSTAENDIG)
**Was drinsteht:** "Entity-Scanner beim App-Start, dynamische Registrierung"
**Was fehlt:** Der Preset-Editor im Companion-Fenster ist der primaere Ort wo Presets verwaltet, erstellt und editiert werden. Der Scanner ist nur ein Implementierungs-Detail.

### FA-07: E.3 -- Watchdog Persona-Beschreibung (VERALTET)
**Was drinsteht:** "Persona: Gruendlich, skeptisch, fair. Deutsch, Du-Form, sachlich."
**Richtig laut neuem Konzept:** Die Persona kommt aus der Companion-Steuerung (gewaehlter Charakter). "Gruendlich, skeptisch, fair" sind Faehigkeits-Attribute des Watchdog-Presets, nicht seine Persona.

### FA-08: D.1 Hinweis zur Entity-Integration unverarbeitet
**Was drinsteht:** D.1 enthaelt einen eigenen Absatz der explizit sagt: "er muss in Abstimmung mit Cluster E umgesetzt werden, da der Modus eines der Presets sein soll" und "Dies betrifft insbesondere den Workstream B, da dieser sich auf die Persona aus E.3 bezieht."
**Problem:** Dieser Hinweis ist als Text vorhanden, aber die konkreten Implikationen sind nicht in den Anforderungen verarbeitet. D.1/B2 verweist auf E.3, aber E.3 (Watchdog) ist nach den User-Korrekturen grundlegend anders (Persona kommt nicht mehr fest aus der Entity, sondern aus der Companion-Steuerung).

### FA-09: "Testing Assistant" als separate Entity in E.2
**Was drinsteht:** E.2 listet sowohl "Watchdog" als auch "Testing Assistant" als separate Presets
**Richtig:** Offene Frage 4 im Dokument klaert selbst: "GEKLAERT: Eine Entity." -- aber E.2 listet trotzdem beide.

### FA-10: Abhaengigkeitsgraph E.1/E.4 "kein Code"
**Was drinsteht:** "E.1/E.4 (Persona/Template) -> kein Code, sofort machbar"
**Richtig laut User-Korrekturen:** E.1 erfordert erheblichen Code-Aufwand: Preset-Editor UI, Persona-Injection fuer alle Entities, Companion-Editor-Erweiterung. "Kein Code" ist falsch.

### FA-11: Empfohlene Reihenfolge Wave 2
**Was drinsteht:** "Wave 2 (Fundament): E.1/E.4 (Persona, kein Code)"
**Richtig:** E.1/E.4 nach User-Korrekturen ist KEIN reines Fundament ohne Code. Es erfordert UI-Arbeit (Preset-Editor), Backend-Arbeit (Persona-Injection fuer alle Entities), und alle CLAUDE.md-Rewrites.

### FA-12: E.2 "Presets NICHT hardcoden" als einzige Strategie
**Was drinsteht:** Dynamische Registrierung via Entity-Scanner
**Was fehlt:** User will Presets im Editor ERSTELLEN und EDITIEREN koennen. Der Scanner ist nur ein Teil des Bildes.

### FA-13: spec-entity-persona-integration.md Section A.1 unreflektiert uebernommen
**Quelle:** Die Quelle selbst (spec-entity-persona-integration.md) beschreibt "Alle Entities sind Relay" -- das Konsolidierungs-Dokument hat diese Quelle unreflektiert uebernommen, obwohl der User in CompanionPrompt.md explizit korrigiert hat.

---

## ENTHALTENE Anforderungen (Referenz)

### Cluster A: Grid- und Session-Bugs

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| A.1 | Grid-Session verschwindet beim Verschieben | T-UI.X28 | ENTHALTEN |
| A.1-detail | Reproduktionsschritte | T-UI.X28 | ENTHALTEN |
| A.1-screenshots | Screenshots referenziert | T-UI.X28 | ENTHALTEN |
| A.2 | Leere Grid-Zellen ohne LauncherCell | T-UI.X29 | ENTHALTEN |
| A.2-repro | Reproduktionsschritte | T-UI.X29 | ENTHALTEN |
| A.3 | Verwaiste Sessions blockieren Presets | T-UI.X27 | ENTHALTEN |
| A.3-hypothesis | Root-Cause-Hypothese | T-UI.X27 | ENTHALTEN |
| A.3-options | Loesungsoptionen | T-UI.X27 | ENTHALTEN |
| A.4 | MCP-Verbindung droppt spontan | bug-mcp-connection-drops | ENTHALTEN |
| A.4-fix | Bisheriger Fix erwaehnt (9187e1d) | Handoff | ENTHALTEN |
| A.4-question | Offene Frage upstream vs. eigen | Testcases | ENTHALTEN |

### Cluster B: Demo-Mode / UI-Highlighting

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| B.1 | Implementierte MCP-Tools (3 Tools) | Commit 0c38666 | ENTHALTEN |
| B.1-schema | Element-Identifikation data-highlight | Showcase-Spec | ENTHALTEN |
| B.2 | Kompletter Test-Status aller 17 Tests | Testcases SP-DM | ENTHALTEN |
| B.3 | launcher-popup oeffnet nicht | T-DM.12 | ENTHALTEN |
| B.4 | Unbekanntes Target gibt keinen Fehler | T-DM.7 | ENTHALTEN |
| B.5 | Demo-Mode Feinsteuerung (3 Luecken) | T-UI.X33 | ENTHALTEN |
| B.5-scroll | Scroll-to-Element | T-UI.X33 | ENTHALTEN |
| B.5-tabs | Tab-Navigation in Popups | T-UI.X33 | ENTHALTEN |
| B.5-input | Input waehrend Popup | T-UI.X33 | ENTHALTEN |
| B.6 | Popup-Backdrop zu dunkel | T-UI.X34 | ENTHALTEN |
| B.7 | Highlight Border-Glow statt flaechig | T-UI.X31 | ENTHALTEN |
| B.7-outline | Outline-Style muss sich unterscheiden | T-DM.2 | UNVOLLSTAENDIG |
| B-toggle | mux_ui_open Toggle/Close | T-UI.X36 | FEHLT |
| B-single-note | Einzelne Notes highlighten | T-UI.X37 | FEHLT |

### Cluster C: Notes-System Ausbau

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| C.1 | Notes-Verwaltungssystem mit Tag-Hierarchie | notes-management-system | ENTHALTEN |
| C.1-tree | Aufklappbarer Baum links | notes-management-system | ENTHALTEN |
| C.1-search | FlexSearch Volltextsuche | notes-management-system | ENTHALTEN |
| C.1-levels | Drei Textlevel (Titel, Tags, Preview) | notes-management-system | ENTHALTEN |
| C.1-click | Einfach-/Doppelklick Verhalten | notes-management-system | ENTHALTEN |
| C.1-bulk | Mehrfachselektion Bulk-Ops | notes-management-system | ENTHALTEN |
| C.1-tech | Technische Basis (MD+YAML, FlexSearch) | notes-management-system | ENTHALTEN |
| C.1-compat | Abwaertskompatibilitaet flache Tags | notes-management-system | ENTHALTEN |
| C.1-llm | LLM-gestuetzte Tag-Reorganisation | notes-management-system | FEHLT |
| C.2 | Tag-Management UI (dritter Tab) | tag-management-ui | ENTHALTEN |
| C.2-funcs | Umbenennen, Loeschen, Editieren, Anlegen | tag-management-ui | ENTHALTEN |
| C.2-nice | Mergen, Gruppen, Sortierung, Bulk-Ops | tag-management-ui | ENTHALTEN |
| C.2-tech | IPC-Channels, URL-Routing | tag-management-ui | UNVOLLSTAENDIG |
| C.2-seed | Seed vs. Custom unterscheiden | tag-management-ui | FEHLT |
| C.3 | Copy/Paste Notes-Editor | bug-copy-paste | ENTHALTEN |
| C.3-vermutung | Electron Keyboard-Handler | bug-copy-paste | ENTHALTEN |
| C.4 | STT im Notes-Editor | feature-stt | ENTHALTEN |
| C.5 | Kompakte Hintergrundsessions | feature-compact | ENTHALTEN |
| C.5-minimal | 2 Zeilen Default | feature-compact | ENTHALTEN |
| C.5-detail | Einfachklick aufklappen | feature-compact | ENTHALTEN |
| C.5-doppel | Doppelklick oeffnen | feature-compact | ENTHALTEN |
| C.6 | Drag & Drop Sidebar -> Grid | Note | ENTHALTEN |
| C.6-sessions | Hintergrundsessions auf Zelle | Note | ENTHALTEN |
| C.6-notes | Notes auf Zelle/Session | Note | ENTHALTEN |

### Cluster D: Testcase-Modus

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| D.1 | Workstream A (View) + Workstream B (Entity) | Plan | ENTHALTEN |
| D.1-A1 | Datenmodell + Parser | Plan | ENTHALTEN |
| D.1-A2 | UI-Komponente (Grid, Tri-State, Kommentar) | Plan | ENTHALTEN |
| D.1-A3 | Screenshot-Integration | Plan | ENTHALTEN |
| D.1-A4 | MPO-Workflow | Plan | ENTHALTEN |
| D.1-B1 | Entity-Struktur | Plan | ENTHALTEN |
| D.1-B2 | UI/Tool-Integration | Plan | ENTHALTEN |
| D.1-parallel | Parallelisierung A1+B1, A2+B2 | Plan | ENTHALTEN |
| D.1-spike | Screenshot-Methode Spike | Plan | ENTHALTEN |
| D.1-format | MPO-Vertrag Testcase-Format | Feature-Spec | ENTHALTEN |
| D.1-archive | Archivierung (read-only, Datum) | Feature-Spec | UNVOLLSTAENDIG |
| D.1-export | Feature-Request auslagern | Feature-Spec | UNVOLLSTAENDIG |
| D.1-rueckkanal | Sessions lesen Ergebnis ueber Notes-Tools | Feature-Spec | UNVOLLSTAENDIG |
| D.1-nfr | Nicht-funktionale Anforderungen | Feature-Spec | FEHLT |
| D.1-risiken | Bekannte Risiken | Feature-Spec | FEHLT |
| D.1-entity-integration | Integration in Entity-Modell Cluster E | D.1 Hinweis | UNVOLLSTAENDIG |

### Cluster E: Entity- und Persona-Integration

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| E.1 | Persona-Konsistenz | Spec | FALSCH (s.o.) |
| E.1-auswahl | Persona auswaehlbar im Companion-Editor | User-Korrektur | FEHLT |
| E.1-charakter | Charakter-Teil an alle Entities injiziert | User-Korrektur | FEHLT |
| E.1-skillset | Skillset bleibt entity-spezifisch | User-Korrektur | FEHLT |
| E.1-zusammensetzung | Preset = Persona + Entity-Faehigkeiten | User-Korrektur | FEHLT |
| E.1-rollenname | Rollenname aus Persona, nicht fest Relay | User-Korrektur | FEHLT |
| E.2 | Preset-Vollstaendigkeit | Spec | ENTHALTEN |
| E.2-scanner | Entity-Scanner dynamisch | Spec | ENTHALTEN |
| E.2-status | Status-Indikator laufende Sessions | Spec | ENTHALTEN |
| E.2-duplikat | Testing Assistant + Watchdog doppelt | E.2 vs. Frage 4 | FALSCH (s.o.) |
| E.2-editor | Preset-Editor im Companion-Fenster | User-Korrektur | FEHLT |
| E.3 | Watchdog Entity | QA-Spec | ENTHALTEN |
| E.3-phasen | Vier Phasen | QA-Spec | ENTHALTEN |
| E.3-persona | Persona-Beschreibung | QA-Spec | VERALTET (s.o.) |
| E.3-abgrenzung | Abgrenzung Audit/Companion | QA-Spec | ENTHALTEN |
| E.3-integration | Workflow-Integration andere Entities | QA-Spec | UNVOLLSTAENDIG |
| E.3-werkzeuge | Templates und Tools | QA-Spec | FEHLT |
| E.4 | Entity-CLAUDE.md Template | Spec | FALSCH (s.o.) |
| E.4-alle-rewrite | Alle CLAUDE.md umschreiben | User-Korrektur | FEHLT |
| E.5 | Learning-Separation | Learning-Spec | ENTHALTEN |
| E.5-routing | Routing-Regel | Learning-Spec | ENTHALTEN |
| E.5-code | Code-Features (4 Stueck) | Learning-Spec | ENTHALTEN |
| E.5-migration | Migrations-Plan bestehende Learnings | Learning-Spec | FEHLT |
| E.5-format | Dateiformat Learning-Vorschlaege | Learning-Spec | FEHLT |
| E.6 | Preset-Button Resume + Start-Prompt | Note | ENTHALTEN |

### Cluster F: Voice-Relay

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| F.1 | STT funktioniert, TTS fehlt | Testcases | ENTHALTEN |
| F.2 | TTS Konzept-Review | Note, Testcases | ENTHALTEN |
| F.2-alternativen | Konkrete Alternativen | Testcases | UNVOLLSTAENDIG |
| F.3 | STT Pin-to-Session | Note | ENTHALTEN |
| F.4 | STT im Notes-Editor | Feature-Spec | ENTHALTEN |
| F-vc4-zindex | BugReport z-Index | T-VC.4 | FEHLT |
| F-vc4-ablauf | BugReport STT Soll-Ablauf | T-VC.4 | FEHLT |
| F-vc-x1 | STT an Hintergrundsession | T-VC.X1 | ENTHALTEN |
| F-vc-x2 | STT Fokus-Following nicht kaputtmachen | T-VC.X2 | ENTHALTEN |
| F-vc-x3 | STT Leerzeichen nach Segment | T-VC.X3 | ENTHALTEN |

### Cluster G: Settings / UI-Polish

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| G.1 | Settings-Dialog Tabs | T-UI.X32 | ENTHALTEN |
| G.1-tabs | Reiter-Vorschlag (5 Tabs) | T-UI.X32 | ENTHALTEN |
| G.1-versioninfo | Versioninfo auf eigene Seite | T-UI.X32 | ENTHALTEN |
| G.2 | Info-Button umbenennen | T-UI.X35 | ENTHALTEN |
| G.3 | Shortcuts-Fenster unvollstaendig | T-UI.X30 | ENTHALTEN |
| G.4 | Context-Farbbalken Design | Handoff | ENTHALTEN |
| G.4-farben | Farbverlauf Gruen->Gelb->Orange->Rot | Handoff | ENTHALTEN |
| G.4-schwelle | 65% angezeigt = komplett gefuellt | Handoff | ENTHALTEN |
| G.4-visual | Halbtransparent hinter Schrift | Handoff | ENTHALTEN |
| G-sidebar | Sidebar-Fenster Gesamtverhalten (4 Punkte) | T-UI.X1 | UNVOLLSTAENDIG |
| G-ui4 | Default-Workspace setzbar | T-UI.4 | ENTHALTEN |
| G-ui10 | Browse Unified Popup statt Finder | T-UI.X10 | ENTHALTEN |
| G-ui20 | Theme-Editor Live-Preview | T-UI.X20 | ENTHALTEN |
| G-ui24 | Workspaces-Fenster schwarz | T-UI.X24 | UNVOLLSTAENDIG |
| G-ui26 | Projektwechseln-Button alle Entities | T-UI.X26 | ENTHALTEN |
| G-ui21 | Muelleimer-Icon Pixel-Position | T-UI.X21 | ENTHALTEN |
| G-rt3 | GridSelector weicht vom Grid ab | RT-X3 | ENTHALTEN |

### Cluster H: Architektur / Infrastruktur

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| H.1 | Template-Learnings einpflegen (5 Punkte) | Note, Handoff | ENTHALTEN |
| H.1-detail | Konkreter Inhalt der Learnings | Handoff | UNVOLLSTAENDIG |
| H.2 | CLAUDE.md-Architektur (geloest + offen) | Note | ENTHALTEN |
| H.2-migration | Migrations-Mechanismus fuer Templates | Note | ENTHALTEN |
| H.3 | Konfigurierbare LLM-Provider | Note | ENTHALTEN |
| H.3-provider | LP-01 bis LP-06 | Note | ENTHALTEN |
| H.3-bugreport | BR-01 bis BR-03 | Note | ENTHALTEN |
| H-ui6 | mux_send Duale Delivery | T-UI.X6 | UNVOLLSTAENDIG |
| H-ui8 | Push-Delivery kein Enter | T-UI.X8 | ENTHALTEN |
| H-ui9 | Push-Delivery Base64-Blob | T-UI.X9 | ENTHALTEN |
| H-ui1 | Orchestrator kann keine Messages senden | T-UI.1 | ENTHALTEN |
| H-lc7 | Terminal-Zeilen xterm.js fit() | T-LC.7/RT-3 | ENTHALTEN |
| H-ui23 | mux_create_session startet Claude nicht | T-UI.X23 | UNVOLLSTAENDIG |
| H-ui9-context | Context-%-Anzeige upstream Bug | T-UI.9 | ENTHALTEN |
| H-sl3 | Restore-Dialog (geparkt) | RT-4 | ENTHALTEN |

### Cluster I: Showcase

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| I.1 | Companion Video + Demo Mode | Showcase-Spec | ENTHALTEN |
| I.1-szenarien | 3 Szenarien | Showcase-Spec | ENTHALTEN |
| I.2 | Demo Skills Vision | Skills-Vision | ENTHALTEN |
| I.2-types | 3 Skill-Typen | Skills-Vision | ENTHALTEN |
| I.2-fragen | Offene Fragen | Skills-Vision | ENTHALTEN |
| I.3 | Showcase Rezept-Extraktor | Showcase | ENTHALTEN |

### Cluster J: Zukunftsmusik

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| J.1 | Multi-Provider, Cross-Platform | Note | ENTHALTEN |
| J.1-leitplanken | v1 macOS only, v2 offen | Note | ENTHALTEN |
| J.1-fragen | Architektur-Fragen | Note | ENTHALTEN |
| J.1-relevanz | v2 nicht verbauen | Note | ENTHALTEN |

### Sonstige (Testcases-spezifisch)

| ID | Anforderung | Quelle | Status |
|----|-------------|--------|--------|
| autostart | Auto-Start Companion ohne Workspace | Testcases FR | FEHLT |
| lc5-doppel | Session doppelt angezeigt bei Grid-Click | T-LC.5 | FEHLT |
| rt4-geparkt | Session Restore ruht | Testcases | ENTHALTEN |
| gefixt-liste | Alle gefixten Items | Testcases | ENTHALTEN |
| recherche | Recherche-Dokumente referenziert | Handoff | ENTHALTEN |
| dm18 | MCP-Tool-Docs aktualisieren | T-DM.18 | ENTHALTEN |
| dm19 | Showcase-Doku aktualisieren | T-DM.19 | ENTHALTEN |
| vc-x2-warnung | STT Fokus-Following nicht kaputtmachen | T-VC.X2 | ENTHALTEN |

---

## Handlungsempfehlung

### Sofort korrigieren (vor MPO-Uebergabe):

1. **Cluster E komplett neu schreiben** -- das ist das Herzstuck und aktuell fundamental falsch
   - E.1: Persona ist auswaehlbar, nicht fest Relay
   - E.2: Preset-Editor als neue UI-Anforderung
   - E.4: Template mit dynamischem Persona-Rollennamen, ALLE CLAUDE.md umschreiben
   - E.5: Persona-Injection zweigeteilt (Charakter + Skillset)
   - Abhaengigkeitsgraph anpassen: E ist KEIN "kein Code"-Cluster

2. **Fehlende Anforderungen nachtragen:**
   - FE-01 (Preset Editor), FE-06 (mux_ui_open Toggle), FE-07 (Notes highlighten), FE-08 (Auto-Start Companion)
   - FE-17 (Duale Delivery als Architektur-Anforderung), FE-18 (mux_create_session zwei Modi)

3. **Unvollstaendige Anforderungen ergaenzen:**
   - D.1 Testcase-Details (Archivierung, Export, Rueckkanal, NFRs)
   - E.3 Watchdog Werkzeuge und Integration
   - Sidebar-Fenster 4-Punkte-Verhalten

### Empfohlene Reihenfolge der Korrektur:

1. Cluster E neu schreiben (hoechste Auswirkung, beeinflusst D und I)
2. Fehlende Bugs/Features nachtragen (15min, reine Text-Arbeit)
3. Unvollstaendige Anforderungen auffuellen (30min)
4. Abhaengigkeitsgraph und Wellenplanung aktualisieren

---

*Erstellt: 2026-04-28, QA-Agent*
