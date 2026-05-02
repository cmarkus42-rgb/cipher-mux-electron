---
title: "Pre-Mortem fuer das Cyber-Factory-Pack"
status: v0.1
date: 2026-04-30
zweck: Skill-Check nach v0.1 (Pflicht laut Ideation-Template)
zeitrahmen: 2 Jahre (April 2028)
---

# 15 — Pre-Mortem

## Praemisse

> Es ist April 2028. Das Cyber-Factory-Pack ist in cipher-mux nie ueber Welle 4 hinausgekommen, und die Teile, die umgesetzt wurden, werden nicht produktiv genutzt. Was ist passiert?

Sieben Gruende, sortiert nach Risiko-Score (Wahrscheinlichkeit × Schaden, Skala 1-5).

## Sieben Gruende

### Grund 1 — Doppel-Welt-Sehnsucht (Score 16, kritisch)

Was passiert ist: Die Cyber Factory wurde in Welle 2 sauber als paralleles Modul gebaut. Sie funktionierte. Aber der MPO funktionierte auch noch — und User hat aus Bequemlichkeit beide weiterbenutzt. Mal Cyber Factory fuer neue Projekte, mal MPO fuer bekannte Workflows ("der laeuft halt, warum aendern"). Welle 5 (Cutover) wurde drei Mal verschoben. Nach einem Jahr war das Cockpit eine zweikoepfige Hydra mit divergierenden Tests. Code-Bloat-Erkenntnis kam zu spaet, Aufraeumen war teuer.

- Wahrscheinlichkeit: 4 (Doppel-Welt-Sehnsucht ist bei Ein-Personen-Setups strukturell — wer den Cutover-Schmerz vermeidet, gewinnt kurzfristig, verliert langfristig)
- Schaden: 4 (Code-Bloat, Konfusion, kognitive Last beim Lesen)
- Score: **16 — kritisch**

Entschaerfungs-Frage: Ist es entschaerfbar?
**Ja.** Cutover-Datum (Welle 5) muss vorab zeitlich gebunden werden. Wenn Welle 4 abgeschlossen ist, gibt es ein Cutover-Fenster (z.B. 14 Tage). Ueberschreitet User das Fenster, wird Cutover automatisch oder per User-Reminder erzwungen.

Konkrete Vorkehrung:
- *In `12-migration-rebuild.md` als hartes Akzeptanz-Kriterium fuer Welle 4*: "Cutover-Datum in Welle 5 darf nicht weiter als 14 Tage nach Welle-4-Abschluss liegen, sonst gilt Welle 4 als nicht abgeschlossen."
- Companion erinnert User aktiv am Cutover-Datum.

### Grund 2 — Welle 1 ist im Sand verlaufen (Score 16, kritisch)

Was passiert ist: Welle 1 wurde mit vier Komponenten geplant — globale Basisregeln, Audit-Overlay, Ideation Partner, Refinement-Erweiterung. Klang vernuenftig in der Spec; in der Realitaet waren das vier komplette Sub-Projekte mit eigenen Datenmodellen, eigenen MCP-Tools und eigener Test-Suite. Nach sechs Wochen Welle 1 war User erschoepft, die Motivation weg. Nur die globalen Basisregeln wurden tatsaechlich implementiert. Die anderen drei lagen halbfertig brach.

- Wahrscheinlichkeit: 4 (Welle 1 wie spezifiziert ist objektiv zu fett)
- Schaden: 4 (gesamter Pack haengt davon ab, dass Welle 1 abgeschlossen ist)
- Score: **16 — kritisch**

Entschaerfungs-Frage: Ist es entschaerfbar?
**Ja.** Welle 1 in Sub-Wellen splitten:
- Welle 1a — globale Basisregeln + Audit-Overlay (kleine Welle, 3-5 Tage)
- Welle 1b — Refinement-Erweiterung (mittlere Welle, 5-7 Tage)
- Welle 1c — Ideation Partner (mittlere Welle, 5-8 Tage)

Konkrete Vorkehrung:
- *In `12-migration-rebuild.md` Welle 1 in 1a/1b/1c splitten.*
- Pre-Welle-Pre-Mortem: vor jedem Sub-Welle-Start eine Schaetzung dokumentieren, am Ende vergleichen ("war's wirklich so?").

### Grund 3 — Worker-Tests waren unzuverlaessig (Score 12, kritisch)

Was passiert ist: Cyber-Factory-Worker laufen in echten tmux-Sessions mit echten Claude-Code-Instanzen. Die Test-Strategie (`13-test-strategy.md`) hat Mock-Claude-Skript erwaehnt, aber das wurde nicht sauber gepflegt. Echte E2E-Tests waren manuell, also selten. Wenn Cyber Factory in der Praxis brach (z.B. tmux-send-keys race condition), gab es keine schnelle Diagnose. User hat Sessions neu gestartet, manchmal drei Mal pro Tag, und das Vertrauen in Cyber Factory schwand.

- Wahrscheinlichkeit: 4 (Cyber-Factory-Worker-Tests sind objektiv schwer)
- Schaden: 3 (User kann manuell weiter, aber Vertrauen sinkt — Cyber Factory wird gemieden)
- Score: **12 — kritisch**

Entschaerfungs-Frage: Ist es entschaerfbar?
**Teilweise.** Mock-Claude-Skript braucht **fruehzeitige Investition** und **regelmaessige Pflege**. Plus eine Diagnose-Schicht in Cyber Factory selbst.

Konkrete Vorkehrungen:
- *Mock-Claude-Skript ist in Welle 2 ein Akzeptanz-Kriterium, nicht ein nice-to-have.*
- *Cyber-Factory-Diagnose-Tool*: ein eigenes Sub-Modul, das fuer einen aktiven Run einen Health-Report erzeugt (Worker-Status, tmux-Status, Context-Usage, letzte Outputs). Wenn etwas bricht, gibt's was zum Anschauen.
- *Pre-Cutover-Test*: 5 echte E2E-Runs mit Sub-Tasks variabler Komplexitaet, dokumentiert. Bei Failure-Quote >20% wird Cutover blockiert.

### Grund 4 — Tool wird Selbstzweck (Score 12, kritisch)

Was passiert ist: Beide (User und Agent) waren begeistert vom Drei-Ebenen-Modell. Nach v1.0 war das Cockpit selbst zum primaeren Wartungsprojekt geworden — Specs ausarbeiten, Wellen abfeiern, neue Sub-Specs schreiben. Der eigentliche Zweck (mit cipher-mux Software bauen, also: Anwendungs-Projekte) trat in den Hintergrund. cipher-mux wurde zur perfekt eingerichteten Werkstatt, in der nichts mehr gebaut wurde, weil die Werkstatt-Optimierung den ganzen Tag aufgefressen hat.

Lessons aus `ideation-lessons.md`: *"Agent-Begeisterung ist ein Risiko-Signal."* Plus: *"Main-Agent hat selbst eine Ambitions-Expansions-Tendenz."*

- Wahrscheinlichkeit: 3 (Selbstbeobachtung ist schwer, aber das User-Profil-Memory hilft)
- Schaden: 4 (Tool-Zweck-Inversion ist subtil, schwer zu korrigieren wenn etabliert)
- Score: **12 — kritisch**

Entschaerfungs-Frage: Ist es entschaerfbar?
**Teilweise.** Das ist eine Disziplin-Frage. Gegenmittel: jede Welle muss einen Anwendungs-Beleg haben.

Konkrete Vorkehrungen:
- *Pro Welle ein User-Anwendungs-Test*: User benutzt cipher-mux nach Welle-Abschluss fuer ein **echtes** kleines Projekt (z.B. ein Hobby-Skript, eine SAP-PLM-Notiz, ein Recherche-Lauf). Wenn das Projekt nicht entsteht, ist die Welle akademisch, nicht produktiv.
- *Companion-Erinnerung*: nach 14 Tagen Pack-Arbeit ohne neues Anwendungs-Projekt fragt der Companion: *"Du hast 2 Wochen am Cockpit gearbeitet. Welches reale Projekt hast du in der Zeit damit gebaut?"*
- *Confirmation-Bias-Check vor Welle 1*: Diese Frage explizit beantworten — *"Welcher Aspekt dieses Packs ist objektiv noetig fuer reale Projekte, welcher Aspekt ist eine Cockpit-Verbesserung um ihrer selbst willen?"*

### Grund 5 — Multi-Session war ueberzogen (Score 9, beobachten)

Was passiert ist: User hat in der Praxis selten 3+ Worker parallel laufen lassen. Meistens 1-2. Multi-Session-Code wurde geschrieben, aber wenig genutzt. Komplexitaets-Zunahme ohne Use-Case.

- Wahrscheinlichkeit: 3 (User-Praxis kann anders aussehen als geplant)
- Schaden: 3 (Komplexitaets-Zunahme ohne entsprechenden Wert)
- Score: **9 — beobachten**

Entschaerfungs-Frage: Ist es entschaerfbar?
**Teilweise.** Multi-Session ist trotzdem fuer Welle-Plan-Faehigkeit da — auch bei 1 Worker pro Welle ist die Welle-Architektur sinnvoll. Aber: Cyber-Factory funktioniert sinnvoll auch mit `maxParallelWorkers: 1`.

Konkrete Vorkehrung:
- *Default-Wert `maxParallelWorkers` neu evaluieren nach Welle 4*. Wenn die Praxis zeigt, dass User selten >2 startet, dann Default 2.
- *Single-Worker-Mode als first-class:* Cyber Factory mit `maxParallelWorkers: 1` ist ein gueltiger und idiomatischer Modus, nicht ein "halb genutzter Multi-Session".

### Grund 6 — Workspace-Memory wurde Pseudo-CLAUDE.md (Score 9, beobachten)

Was passiert ist: User hat angefangen, Konventionen zweimal zu pflegen — in CLAUDE.md (statisch) und im Workspace-Memory (dynamisch). Nach 3 Monaten waren beide nicht mehr synchron, der Companion hat widerspruechliche Antworten gegeben, und User hat das Workspace-Memory zunehmend ignoriert.

- Wahrscheinlichkeit: 3 (Doppel-Pflege ist real)
- Schaden: 3 (Konfusion, aber kein Total-Ausfall)
- Score: **9 — beobachten**

Entschaerfungs-Frage: Ist es entschaerfbar?
**Ja.** Konventions-Klarheit:
- CLAUDE.md = statische Konvention, wird selten geaendert
- Workspace-Memory = Run-Stand, dynamisch
- Bei Konflikt: CLAUDE.md gewinnt, aber Workspace-Memory wird in der Companion-Antwort referenziert ("CLAUDE.md sagt X, im Workspace-Memory steht Y vom 2026-05-XX — was gilt?")

Konkrete Vorkehrung:
- *In `11-workspace-memory.md` einen Abschnitt "Konventions-Hierarchie" einbauen.* CLAUDE.md > Workspace-Memory > Companion-Memory bei Konflikten.
- *Companion-Verhalten*: bei Konflikt aktiv ansprechen, nicht still eine Quelle waehlen.

### Grund 7 — Pre-Mortem ohne Konsequenz (Score 9, beobachten)

Was passiert ist: Dieses Pre-Mortem wurde geschrieben, in `15-pre-mortem.md` abgelegt, und nie wieder gelesen. Die kritischen Gruende wurden nicht in `12-migration-rebuild.md` als Akzeptanz-Kriterien einbezogen. Pre-Mortem als Pflichtuebung, nicht als Werkzeug.

- Wahrscheinlichkeit: 3 (Pre-Mortems werden oft als Hausaufgabe gemacht, dann vergessen)
- Schaden: 3 (Pack-Risiken bleiben latent, wirken sich aus, ohne dass sie expliziert wurden)
- Score: **9 — beobachten**

Entschaerfungs-Frage: Ist es entschaerfbar?
**Ja.** Konsequenz erzwingen.

Konkrete Vorkehrungen:
- *In `12-migration-rebuild.md` direkt nach Wellen-Plan*: Verweis auf Pre-Mortem-Erkenntnisse mit Pflicht-Pruefung pro Welle.
- *Welle-Akzeptanz-Kriterien aktualisieren*: Welle 1a-c Splittung (aus Grund 2), Cutover-Frist (aus Grund 1), Mock-Claude-Skript (aus Grund 3), Anwendungs-Beleg pro Welle (aus Grund 4).

## Risiko-Matrix

```
Schaden ↑
  5 |
  4 |  G7?  |  G2  G1
    |       |
  3 |  G6   |  G5  G3  G4
    |       |
  2 |       |
    |       |
  1 |_______|_____________→ Wahrscheinlichkeit
       1  2     3   4   5
```

Vier Gruende im kritischen Quadranten (rechts oben, Score >=12). Drei im "beobachten"-Quadranten.

## Konsequenzen — was in den anderen Specs aktualisiert wird

Die folgenden konkreten Vorkehrungen werden in die existierenden Specs eingearbeitet:

| Vorkehrung | Spec | Sektion |
|------------|------|---------|
| Welle 1 in 1a/1b/1c splitten | `12-migration-rebuild.md` | Wellen-Plan |
| Cutover-Frist 14 Tage nach Welle 4 | `12-migration-rebuild.md` | Welle 5 Akzeptanz |
| Mock-Claude-Skript Pflicht in Welle 2 | `12-migration-rebuild.md` + `13-test-strategy.md` | Welle 2 |
| Diagnose-Tool fuer Cyber-Factory-Runs | `05-cyber-factory.md` | Code-Module |
| Pre-Cutover-E2E-Tests mit Failure-Quote-Schwelle | `12-migration-rebuild.md` | Welle 4 → 5 |
| Anwendungs-Beleg pro Welle | `12-migration-rebuild.md` | Akzeptanz-Kriterien |
| Companion-Erinnerung nach 14d Pack-Arbeit ohne Anwendung | `04-presets-funktional.md` Companion | Spezial-Sub-Modi |
| `maxParallelWorkers` Default neu evaluieren nach Welle 4 | `05-cyber-factory.md` | Offene Punkte |
| Konventions-Hierarchie CLAUDE.md > Workspace-Memory | `11-workspace-memory.md` | neue Sektion |
| Pre-Mortem-Konsequenz-Verweis | `12-migration-rebuild.md` | direkt nach Wellen-Plan |

Diese Aenderungen sind *Patches* an den existierenden Specs und werden im naechsten Schritt eingepflegt.

## Annahmen, unter denen das Pack traegt

Aus den nicht-entschaerfbaren Resten der kritischen Gruende:

1. *User behaelt Disziplin, den Cutover zeitnah durchzuziehen.* Das Pack kann nicht erzwingen — nur Reminder und Akzeptanz-Kriterien anbieten.
2. *User benutzt cipher-mux fuer reale Projekte, nicht nur fuer Cockpit-Wartung.* Das Pack kann nur stuppsen — die Disziplin liegt beim User.
3. *Mock-Claude-Skript laesst sich pflegen.* Wenn Claude-Code-CLI-API sich substanziell aendert, brechen die Mocks. Das ist ein Wartungs-Aufwand, der einkalkuliert werden muss.
4. *Multi-Session ist mehr als Marketing.* Wenn User in 6 Monaten nach Welle 5 nie >1 Worker startet, ist Multi-Session-Code nutzlos und sollte zur Reduktion erwogen werden.

## Naechster Schritt

Patches an `05-cyber-factory.md`, `11-workspace-memory.md`, `12-migration-rebuild.md`, `04-presets-funktional.md` einarbeiten. Dann External Review (Skill `external-review`) als zweite Verifikations-Stufe vor v0.2.

## Nicht-Bestandteile dieses Pre-Mortems

- *Marktrisiken* — gibt es nicht, ist Hobby-Hub.
- *Personal-Risiken* — Ein-Personen-Setup, also Disziplin-Frage statt Personal-Frage.
- *Finanzielle Risiken* — gibt es nicht, abgesehen von Zeit-Investment.
- *Hardware-Risiken* — vernachlaessigbar.
- *Anbieter-Risiken (Anthropic-API-Aenderung)* — relevant aber bereits in Whitepaper Kap. 8 (Vendor-Lock-in) abgehandelt; das Pack uebernimmt die dort empfohlenen Massnahmen.
