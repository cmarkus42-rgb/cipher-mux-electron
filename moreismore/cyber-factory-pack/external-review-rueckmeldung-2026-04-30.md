---
title: "External Review — Cyber-Factory-Pack"
status: 2026-04-30
reviewer: External Agent
---

# External Review: Cyber-Factory-Pack

## Executive Summary

Das Pack ist konzeptionell kohärent und gut strukturiert — die Drei-Ebenen-Architektur (Basisregeln, Presets+Akzente, Workflow-Phasen) bildet ein stabiles Fundament. Die Operationalisierbarkeit für Claude Code ist in den meisten Bereichen gegeben, mit klaren Modul-Spezifikationen und IPC-Konventionen. Kritische Lücken existieren bei der Persona-Resolver-Hierarchie (zwei unterschiedliche Interpretationen in Paket-Dateien), bei der Geschwindigkeit von Welle 1a (technisch realistisch, aber eng kalkuliert), und bei einigen Schnittstellenbeschreibungen zwischen Phasen (Debugger→Testing Assistant Routing, Refinement→Cyber Factory Handoff).

---

## Fund-Liste

### Fund 1: Persona-Resolution — zwei Darstellungen widersprechen sich
**Datei:** `16-persona-presets.md`, Zeilen 40–52 vs. `03-preset-akzente.md`, Zeile 181  
**Stelle:** Zuweisungs-Hierarchie: `16` beschreibt (1) Global, (2) Preset, (3) Relay-Fallback. `03` erwähnt "globale Persona" ohne explizite Prio und sagt "User kann pro Preset eine andere Persona wählen".  
**Schwere:** mittel  
**Beobachtung:** `16-persona-presets.md` (Zeile 40–52) formuliert eine klare Prioritätskette, aber `03` (Zeile 181) erwähnt nur "Default beim Seed; User kann pro Preset wählen" ohne explizite Prio-Ordnung. Das erzeugt beim Lesen von `03` zuerst Verwirrung über die Konfliktauflösung.  
**Empfehlung:** In `03` explizit verweisen auf die Prioritätskette aus `16` statt sie implizit vorauszusetzen. Z.B. "Die Persona wird nach der Hierarchie in `16-persona-presets.md`, Zeilen 40–52 aufgelöst."

---

### Fund 2: Raffinement-Scaffolding – Übergabemechanismus unklar
**Datei:** `04-presets-funktional.md`, Zeilen 43–54 (Refinement Phase 6) vs. `05-cyber-factory.md`, Zeilen 73–88  
**Stelle:** Refinement Phasen 5–6 sagen "Scaffolding aufsetzen... Aufruf des `kickoff_complete`-Äquivalents", aber `05` erwähnt kein `kickoff_complete` Tool — es spricht von "Welle-Plan schreiben". `04` sagt auch nicht, wer das `kickoff_complete` aufruft — Refinement selbst oder wird es vom User/Companion aufgerufen?  
**Schwere:** mittel  
**Beobachtung:** Das ist eine reale Schnittstelle: Refinement endet, Cyber Factory beginnt. Ohne klaren Mechanismus bleibt unklar, wer das Handoff triggert. Das Pack sagt "auf User-Wunsch" nicht explizit.  
**Empfehlung:** Explizit dokumentieren: "Refinement meldet 'Scaffolding fertig' als Note und bietet dem User an, eine Cyber-Factory-Session zu starten. User triggert Start oder Refinement ruft `mux_cyber_factory_handoff_ready`-Tool auf (falls implementiert)." Oder: "Benutzer startet Cyber Factory manuell aus dem Workspace-Grid."

---

### Fund 3: Worker-Phasenmodell – Referenzen sind konsistent, aber Konkretisierung fehlt
**Datei:** `02-base-rules.md`, Zeilen 116–129 (Worker-Phasenmodell) vs. mehrere Stellen  
**Stelle:** Das Modell ist in `02` definiert und wird in `05` (Cyber Factory, Zeile 82) referenziert, aber die konkrete Umsetzung bleibt vage. "Worker-Phasenmodell ist Pflicht" — aber wie erzwingt die Cyber Factory das technisch?  
**Schwere:** niedrig  
**Beobachtung:** Das ist eher ein Design-Vertrauen-Problem als eine echte Inkonsistenz. `05` sagt implizit, dass die Cyber Factory bei Worker-Session-Start das Modell als Auftrag-Teil mitsendet. Das ist verstanden, aber nicht explizit dokumentiert, dass z.B. ein fehlgeschlagener Worker, der das Modell ignoriert, eskaliert wird (Level 5?).  
**Empfehlung:** In `05-cyber-factory.md` explizit: "Worker-Sessions, die das 7-Phasen-Modell aus `02` nicht befolgen (z.B. sofort Code ohne Plan), werden bei erster Abweichung mit Eskalation Level 3 korrigiert. Nach 2 Fehlversuchen → Level 5."

---

### Fund 4: Workspace-Memory – unklare Zeitpunkt der DB-Erstellung
**Datei:** `11-workspace-memory.md`, Zeilen 164–197 (Sequence Diagram)  
**Stelle:** Der Sequence Diagram zeigt `WS.createMemory()` beim Workspace-Anlegen. Aber `04-presets-funktional.md` und `05-cyber-factory.md` sprechen nicht davon, dass Workspace-Memory ein Prerequisite für Cyber Factory ist.  
**Schwere:** niedrig  
**Beobachtung:** Die Annahme ist wohl: alte Workspaces (vor Welle 4) haben kein Memory, neue haben es (opt-in via `workspaceMemoryEnabled`). Aber es ist nicht dokumentiert, was passiert, wenn die Cyber Factory startet ohne Workspace-Memory zu existieren. Grace-fallback zu "Memory deaktiviert"?  
**Empfehlung:** In `11` explizit: "Wenn `workspaceMemoryEnabled=false` oder die DB existiert nicht: Cyber Factory funktioniert ohne Memory-Tools. Memory-Tools zeigen einen Hinweis 'nicht verfügbar in diesem Workspace'."

---

### Fund 5: Audit – "Final-Quality"-Assertion widerspricht dem Lifecycle
**Datei:** `04-presets-funktional.md`, Zeilen 171–174 vs. `03-preset-akzente.md`, Zeilen 106–123 (Audit)  
**Stelle:** `04` sagt Audit kommt "vor Release" (Phase-Ende-Stempel). `03` beschreibt Audit als "Final-Quality-Instanz" und erwähnt als Anti-Pattern "Audit überspringen weil kleine Welle".  
**Schwere:** niedrig  
**Beobachtung:** Das ist konsistent, aber die Darstellung in `04` suggeriert, dass Audit immer der letzte Schritt ist. Tatsächlich kann eine Welle aber mehrfach den Zyklus (Build→Test→Debug→Audit) durchlaufen, bis alle Findings weg sind. Das ist implementierungstechnisch eine Schleife, nicht ein lineares Finale.  
**Empfehlung:** In `04` klarstellen: "Audit kann innerhalb einer Welle mehrfach aufgerufen werden (nach jeder Bug-Fixing-Iteration). Release-Freigabe erfolgt erst, wenn Audit keine kritischen Findings mehr produziert."

---

### Fund 6: Cyber Factory Welle-Planung – Max-Parallelität ist nicht in allen Kontexten dokumentiert
**Datei:** `05-cyber-factory.md`, Zeile 102 vs. `04-presets-funktional.md`, Zeile 102  
**Stelle:** `05` sagt "Maximal 5 Worker parallel" als Grenze. `04` wiederholt das. Aber `03` (Cyber Factory Akzente, Zeile 66) nennt das Anti-Pattern und referenziert Whitepaper 6.8. Kein Problem. Aber: Was passiert technisch, wenn User mehr parallel starten will? Error? Automatic queueing?  
**Schwere:** niedrig  
**Beobachtung:** Das ist eine Implementierungs-Frage, die vom Pack nicht beantwortet werden muss, aber bei Claude Code könnte die Frage auftauchen: "Wird das erzwungen oder ist es nur ein Hinweis?"  
**Empfehlung:** Optional: In `05` ein kurzer Satz "Diese Limit wird bei `mux_create_session` für Worker unter Cyber-Factory-Kontext erzwungen; Versuch, mehr zu starten, gibt Fehler Level 4 (Eskalation) zurück."

---

### Fund 7: Migration Welle 1a – "Anwendungs-Beleg" ist schwer zu operationalisieren
**Datei:** `12-migration-rebuild.md`, Zeilen 104–106 (Akzeptanz-Kriterien 1a)  
**Stelle:** "Anwendungs-Beleg: User dokumentiert ein reales Mini-Beispiel, in dem die Basisregeln tatsächlich Verhalten geaendert haben... UND... Persona-Zuweisung sichtbar wirkte."  
**Schwere:** niedrig  
**Beobachtung:** Das ist ein gutes Kriterium, aber es hängt davon ab, wie die User-Dokumentation strukturiert wird. "User dokumentiert" — wo? Als Note in cipher-mux? Als Markdown-Datei? Unklar. Und: Wer beurteilt, ob der Beleg "realistisch" genug ist?  
**Empfehlung:** Konkretisieren: "User schreibt oder zeichnet (Screenshot) einen 2–5-Minuten-Dialog auf, in dem (1) eine Basisregel eine Entscheidung blockiert hat oder (2) eine Persona-Zuweisung die Tonalität erkennbar verändert hat. Diese Dokumentation wird in `moreismore/cyber-factory-pack/wave-1a-evidence/` gesammelt."

---

### Fund 8: Debugger — "Verhaltens-Test schreiben (rot)" vor Worker-Start als Voraussetzung
**Datei:** `06-debugger.md`, Zeilen 129–130  
**Stelle:** "Phase 4 — Verhaltens-Test schreiben. Bevor der Fix passiert: Test, der das Bug-Verhalten exakt reproduziert (rot)."  
**Schwere:** niedrig  
**Beobachtung:** Das ist korrekt, aber Phase 4 wird NACH dem Fix-Plan und BEVOR der Worker startet sequenzialisiert. Das ist richtig, aber nicht in der Sequence eingefroren. Code-seitig könnte der Debugger versuchen, Phase 3 (Fix-Plan) und Phase 4 zu parallelisieren. Sollte nicht sein, aber unklar genug für Risk.  
**Empfehlung:** Optional explizit in `06` Lifecycle: "Phase 3 und Phase 4 sind nicht parallelisierbar — Phase 3 must finish und User confirmieren, DANN Phase 4."

---

### Fund 9: Ideation Partner – Brain-Verzeichnis und Speicherort
**Datei:** `04-presets-funktional.md`, Zeile 30 vs. `08-ideation-partner.md` (nicht in Pflicht-Liste, aber referenziert)  
**Stelle:** `04` sagt "Brain-Dateien (`brain/*.md`) sind dein primaeres Gedaechtnis". Das Verzeichnis wird nicht konkret angegeben, aber es ist implizit im Projekt-Root. Ist das `~/.config/cipher-mux/` oder `./<projekt>/brain/`?  
**Schwere:** niedrig  
**Beobachtung:** Für Ideation Partner macht es Sinn, dass Brain lokal im Projekt ist, aber das sollte explizit stehen. `12-migration-rebuild.md` Zeile 138 erwähnt User dokumentiert "ein reales Mini-Beispiel" — aber wo landen die Brain-Notes?  
**Empfehlung:** In `04` Ideation Partner, nach Zeile 30: "Brain-Verzeichnis: `./<projekt>/brain/` oder `~/.config/cipher-mux/brain/` (project-scoped)?". Unklar aus Pack. Das ist eine User-Entscheidung, die vorher geklärt werden sollte.

---

### Fund 10: Companion – Modi-Rotation und User-Cue-Erkennung
**Datei:** `03-preset-akzente.md`, Zeilen 135–139 (Companion Modi)  
**Stelle:** "Du wechselst je nach User-Cue zwischen drei Modi... Den Modus erkennst du an User-Cue: 'Erklaer mir...' vs. 'Ich will...'".  
**Schwere:** niedrig  
**Beobachtung:** Das ist eine implizite Prompt-Engineering-Heuristik. Sie funktioniert, aber ist nicht fehlersicher (z.B. "Erkläre mir, wie ich das aufbaue" ist Mischform). Keine Implementierungs-Lücke, aber ein kognitiver Risikobereich für Claude Code: Wann muss explizit user-input-requested werden vs. wann "erkannt"?  
**Empfehlung:** Optional: "Bei Unsicherheit über Mode-Erkennung: Companion fragt explizit ('Möchtest du, dass ich das erkläre, oder sollen wir es zusammen debuggen?'), statt zu raten."

---

### Fund 11: Workspace-Memory Tags – Seed-Tags und dynamisches Wachstum
**Datei:** `11-workspace-memory.md`, Zeile 73 ff.  
**Stelle:** Das MemoryKind-Schema ist definiert (decision, architecture, welle, finding, etc.), aber nirgends ist dokumentiert, wer entscheidet, welche Tags neu hinzukommen oder wie die `WS_MEMORY_TAG`-Tabelle ihre Default-Tags setzt.  
**Schwere:** niedrig  
**Beobachtung:** Ein Worker könnte spontan ein Tag 'critical-bug' vergeben — aber wo ist die Policy? User-Freiheit oder kontrollierte Liste? Das ist ein Quality-of-Memory-Issue.  
**Empfehlung:** In `11`, neue Untersektion "Tag-Policy": "Tags starten mit einem Seed-Set (z.B. 'open', 'resolved', 'critical', 'architectural'). Worker und Testing Assistant können neue Tags hinzufügen. Audit kontrolliert Konvention."

---

### Fund 12: Welle 1a Aufwands-Schätzung – Persona-Ausbau und Injections
**Datei:** `12-migration-rebuild.md`, Zeilen 75–85 (Welle 1a Details)  
**Stelle:** "Neue Seed-Charaktere in `character-defaults.ts`: Cipher, Kyniker, Sokrates, Glitch" (4 neue Personas, jeweils mit Prompt-Injection aus `16`). Gleichzeitig Template-Engine, Basisregeln-ConfigStore, PresetEditor-Umbau, Session-Injector.  
**Schwere:** mittel  
**Beobachtung:** Die Schätzung ist 4–6 Tage. Das ist eng, nicht unrealistisch, aber abhängig davon, wie viel bestehender PresetEditor-Code wiederverwendet wird. Der Prompt-Injections-Teil (~250 Zeilen Persona-Text aus `16`) ist Copy-Paste, aber der Resolver-Modul (`persona-resolver.ts`) ist neu und muss robust testen.  
**Empfehlung:** Schätzung realistisch, aber Risiko: "Falls `persona-resolver.ts` mehr als 3 Bugs in Tests findet, Welle 1a kann in 5 Tage + 2 Puffer nach hinten verschoben werden."

---

### Fund 13: Cyber Factory Diagnose-Tool – Platzierung und Trigger
**Datei:** `05-cyber-factory.md`, Zeilen 43–51 (diagnose.ts)  
**Stelle:** "CLI-Befehl: `mux cyber-factory diagnose <run-id>`. Auch ueber MCP-Tool `mux_cyber_factory_diagnose` verfuegbar."  
**Schwere:** niedrig  
**Beobachtung:** Das ist gut für den User, aber nicht dokumentiert, wann Claude Code diese Tools ruft. Selbstständig bei jedem stuck-Signal? Nur auf Anfrage? Diagnose ist schwer, und die Heuristik, um Stuck zu erkennen, ist nicht spezifiziert.  
**Empfehlung:** In `05` oder `06` explizit: "Worker wird als stuck klassifiziert, wenn kein heartbeat seit 7 Minuten OR Output flacht ab (< 100 Zeichen seit 3 min). Bei Stuck: Diagnose auto-aufgerufen, Report an User eskaliert (Level 5)."

---

### Fund 14: Risk-Review pro Worker – Struktur und Tool-Integration
**Datei:** `05-cyber-factory.md`, Zeilen 84–86 und `06-debugger.md`, Zeilen 148–150  
**Stelle:** Cyber Factory sagt "Risk-Review pro Worker-Session", Debugger sagt "Risk-Review... als strukturierte Note". Aber das Format ist nicht definiert. Wohin geht dieser Risk-Review: Workspace-Memory? Note-Pool? Sidebar-Alert?  
**Schwere:** mittel  
**Beobachtung:** Das ist eine User-Experience-Frage. Ohne konkrete Struktur (Markdown-Template, Rendering-Ort) bleibt unklar, wie Claude Code das praktisch umsetzen soll.  
**Empfehlung:** "Risk-Review wird als strukturiertes Markdown-Template (Datei, Zeile, Severity, Empfehlung — siehe `10-audit.md` Findings-Format) als Note unter Workspace-Memory geschrieben (`mux_notes_create` mit Kind='risk-review'). Sidebar zeigt diese Notes in einem Risk-Review-Tab an."

---

### Fund 15: Testing Assistant – Adversarial Testing ohne konkrete Heuristics
**Datei:** `04-presets-funktional.md`, Zeilen 108–120 (Testing Assistant Phasen)  
**Stelle:** Phase 3 sagt "Adversarial Probing: Edge Cases, ungewoehnliche Inputs, Race Conditions..." aber gibt keine Heuristiken. Wie erkennt Claude Code, welche Edge Cases zu testen sind?  
**Schwere:** niedrig  
**Beobachtung:** Das ist nicht falsch — Testing Assistant ist ein LLM und wird kreativ sein müssen. Aber Pre-Mortem oder ADRs sollten warnen, dass dieser Preset sehr stark von Prompt-Quality abhängt.  
**Empfehlung:** Optional in `09-testing-assistant.md` oder in Leit-Fragen: "Dieser Preset verlässt sich auf LLM-Intuition. Backup-Plan: Testing-Findings ohne Adversarial-Coverage können User eskaliert werden."

---

### Fund 16: Audit Findings – Severity-Klassifizierung ohne Matrix
**Datei:** `04-presets-funktional.md`, Zeilen 175–183 vs. `03-preset-akzente.md`, Zeilen 110–118  
**Stelle:** Beide beschreiben Severity (hoch/mittel/niedrig), aber nirgends ist eine Matrix wie "SQL Injection = hoch, fehlende Kommentare = niedrig" definiert.  
**Schwere:** niedrig  
**Beobachtung:** Das ist ein strukturiertes Konzept, aber ohne Konkretisierung besteht Risiko, dass unterschiedliche Audits unterschiedliche Klassifizierungen geben.  
**Empfehlung:** Optional: Severity-Matrix in `10-audit.md` hinzufügen. Oder: "Severity wird nach OWASP-Konvention klassifiziert: High = exploitable, Medium = requires workaround, Low = hygiene."

---

### Fund 17: Companion Steuerung – "Irreversible Aktionen" sind nicht aufgelistet
**Datei:** `03-preset-akzente.md`, Zeilen 142–143 (Companion Tool-Nutzung)  
**Stelle:** "Du fragst vor irreversiblen Aktionen (Sessions kill, Workspaces loeschen)."  
**Schwere:** niedrig  
**Beobachtung:** Gutes Prinzip, aber die Liste der "irreversibel" ist unvollständig. Ist Workspace-Memory-Löschung dabei? Ist ein großer Refactor-Start dabei?  
**Empfehlung:** Explizite Liste: "Irreversible Aktionen: (1) Session kill/terminate, (2) Workspace löschen, (3) Workspace-Memory vergessen, (4) User-Profil reset. Vor jeder dieser: Confirmation-Dialog."

---

### Fund 18: Welle-Plan Übergabe – Struktur nicht spezifiziert
**Datei:** `05-cyber-factory.md`, Zeilen 99–100 (Phase 2)  
**Stelle:** "Phase 2: Welle-Plan schreiben + User-Bestaetigung".  
**Schwere:** niedrig  
**Beobachtung:** Wie sieht dieser Plan aus? Markdown? MCP-Tool Output? Sidebar-Popup? Das ist eine UX-Frage, die im Pack nicht beantwortet wird (auch bewusst, siehe `00-INDEX.md` "Keine UI-Mockups").  
**Empfehlung:** Optional: "Welle-Plan wird als strukturiertes Markdown (yaml-frontmatter mit dependencies, Wellen-Sequenz, Worker-Zuweisungen) ausgegeben und dem User zur Bestätigung via `mux_input_request_create` vorgelegt."

---

### Fund 19: Relay-Core Injection – Template-Variablen nicht dokumentiert
**Datei:** `12-migration-rebuild.md`, Zeile 83 erwähnt "Template-Engine fuer relay-core.md ({{display_name}}, {{user_profile_yaml}}, {{evolved_annotations}})"  
**Stelle:** Diese Variablen werden nicht anderswo in den Pflicht-Dateien dokumentiert.  
**Schwere:** niedrig  
**Beobachtung:** Das ist eine Referenz auf einen Prozess, der wahrscheinlich in früheren Docs definiert ist (relay-core-Konzept), aber in diesem Pack nicht erklärt wird. Claude Code könnte fragen: "Wo sind die {{Variable}}-Templates?"  
**Empfehlung:** Optional Link zu relay-core-Dokumentation oder kurz in `02-base-rules.md` erklären, dass relay-core als Template-Engine fungiert und die Variablen aus Personas/Basisregeln/User-Profil kommen.

---

### Fund 20: Off-Limits-Liste – Vererbung zwischen Phasen
**Datei:** `03-preset-akzente.md`, Zeilen 57–58 (Cyber Factory) vs. `04-presets-funktional.md`, Zeilen 80–81  
**Stelle:** Cyber Factory "verteilt die Off-Limits-Liste an alle Sub-Sessions". Aber wo kommt diese Liste ursprünglich her? Globale Basisregeln aus `02`? Projekt-spezifisch aus Refinement? User-Input?  
**Schwere:** niedrig  
**Beobachtung:** Die Liste wird referenziert, aber ihre Quelle/Erstellung ist nicht dokumentiert.  
**Empfehlung:** In `05-cyber-factory.md` explizit nach Phase 1: "Off-Limits-Liste wird zusammengesetzt aus: (1) Globale Basisregeln, Section 'Off-Limits' + (2) Projekt-spezifische Off-Limits aus Workspace-Memory (Kind='off_limit'). Diese kombinierte Liste wird in Worker-Session-Auftrag mitgegeben."

---

### Fund 21: TestingAssistant → Debugger Routing – Kein explizites Tool genannt
**Datei:** `04-presets-funktional.md`, Zeilen 120 und `05-cyber-factory.md`, Zeilen 121–122  
**Stelle:** "Uebergabe an Debugger oder direkt an User" / "Bei Bug-Findings vom Testing → Routing an Debugger".  
**Schwere:** mittel  
**Beobachtung:** Es ist unklar, ob das Routing via MCP-Tool (`mux_cyber_factory_handoff_debugger`?) oder manuell per Note/Dialog geschieht. Welche Präzedenz hat der Debugger?  
**Empfehlung:** Explizit: "Testing Assistant ruft `mux_cyber_factory_handoff_debugger` mit strukturiertem Findings-Report auf. Debugger-Session wird auto-gestartet oder vom User manuell gestartet, abhängig von Severity (Hoch → auto, Mittel/Niedrig → User-Dialog)."

---

### Fund 22: Welle 1c – Ideation Partner Brain-Verzeichnis parallel zum Projekt
**Datei:** `12-migration-rebuild.md`, Zeilen 130–139 (Welle 1c)  
**Stelle:** "Brain-Verzeichnis angelegt, Skills aufgelistet". Aber Welle 1c ist parallel zur Cyber Factory (Welle 2). Wenn ein User Ideation parallel zu einem laufenden Cyber-Factory-Projekt macht, wo landen die beiden Brain-Sets?  
**Schwere:** niedrig  
**Beobachtung:** Das ist ein Workspace-Isolation-Problem, das das Pack nicht addressiert.  
**Empfehlung:** Optional: "Brain ist workspace-scoped. Jeder Workspace hat ein `brain/`-Verzeichnis unter dem Workspace-Projekt-Path."

---

### Fund 23: Compact Knowledge Representation – Salience in Workspace-Memory
**Datei:** `11-workspace-memory.md`, Zeilen 69–70 (salience float)  
**Stelle:** Workspace-Memory hat ein `salience`-Feld ohne Definition, was Salience-Werte bedeuten (0–1? 1–10?).  
**Schwere:** niedrig  
**Beobachtung:** Das ist ein implementierungs-Detail, aber für Filterung/Ranking relevant. Ist "hohe Salience" = "häufig abgerufen" oder "user-Priorität"?  
**Empfehlung:** In `11` kurz: "Salience: 0.0–1.0. Default 0.5. Wird bei jedem Recall inkrementiert (erfolgreiche Recalls) oder vom User manuell gesetzt (Favoriten). Verwendet für Ranking in `mux_workspace_memory_recall(limit=N)` — höchste Salience zuerst."

---

### Fund 24: Auditor als letzte Instanz – Keine Feedback-Loop zu Test/Debug
**Datei:** `04-presets-funktional.md`, Zeilen 190–195 (Audit Grenzen)  
**Stelle:** "Du tust nicht: Selbst fixen, selbst implementieren. Direktes User-Feedback einholen (Audit ist Beurteilung, nicht Dialog)."  
**Schwere:** niedrig  
**Beobachtung:** Wenn Audit kritische Findings hat, wer triggert den Fix? Der Debugger muss explizit vom User aufgerufen werden, oder passiert das automatisch auf Audit-Findings?  
**Empfehlung:** Klar machen: "Audit ist die letzte Beurteilung. Findings mit Hoch-Severity blockieren Release, erzwingen einen Rücklauf an Debugger (auto oder User-Trigger?, je nach Welle-Kontext)."

---

### Fund 25: Phasen-Idempotenz – Mehrfach-Durchläufe einer Phase
**Datei:** Mehrere (z.B. `04` Cyber Factory Phase 8)  
**Stelle:** Nirgends ist dokumentiert, ob Phasen idempotent sind (mehrfach laufen können ohne Duplizierung/Überraschung).  
**Schwere:** niedrig  
**Beobachtung:** Z.B. kann Cyber Factory Welle 2 mehrfach gestartet werden, oder blockiert das auf Auto-Lock? Das ist nicht spezifiziert.  
**Empfehlung:** Optional: "Phasen sind idempotent — Cyber Factory Welle N kann mehrfach neu-starten; State wird aus ConfigStore restauriert. Lock-Mechanismus (ConfigStore `run_lock`) verhindert parallele Executions der gleichen Welle."

---

## Gesamteindruck

Das Pack ist reif für Umsetzung. Die konzeptionelle Integrität ist gut, die Modular-Architektur ist klar, und die meisten Specs sind operationalisierbar für Claude Code. 

**Stärken:**
- Die Drei-Ebenen-Architektur ist konsistent über alle Dateien hinweg.
- Die Separation of Concerns (Persona ≠ Preset ≠ Basisregel) ist sauber.
- Die Migration mit Feature-Flags und Wellen-Plan ist realistisch und risikogerecht.
- Persona-Definitionen sind konkret und gut geschrieben.

**Schwachpunkte:**
- Drei Mittelschwere Lücken: (1) Refinement→Cyber Factory Handoff-Mechanismus, (2) Persona-Resolution in `03` zu implizit, (3) Risk-Review-Format und Speicherort nicht spezifiziert.
- Mehrere niedrigschwellige Detaillücken (Brain-Verzeichnis-Scope, Off-Limits-Quellen, Adversarial-Heuristiken), die Claude Code per Nachfrage klären wird — nicht blockierend.
- Welle 1a-Schätzung ist enge 4–6 Tage mit 4–5 parallelen Komponenten; realistisch, aber Puffer-Empfehlung.

**Empfehlung für Claude Code:**
Vor Start der Implementierung sollte ein 30-minütiges Klärungsgespräch mit User stattfinden zu: (1) Wer triggert Handoff zwischen Phases (Refinement→Cyber Factory)?, (2) Wo landen Risk-Reviews und Workspace-Memory Einträge in der UI?, (3) Wie ist die Brain-Verzeichnis-Scope (global oder per Workspace)?. Diese Klärungen sind nicht blockierend, aber sie reduzieren Implementierungs-Laufschleifen.

---

**Stand:** 2026-04-30  
**Reviewer:** External Agent (Frische Session)  
**Findings:** 25 (20 niedrig, 5 mittel, 0 hoch)
