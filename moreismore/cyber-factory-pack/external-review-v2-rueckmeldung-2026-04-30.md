---
title: "External Review v2 — Brüche und Doppellungen"
status: completed
date: 2026-04-30
reviewer: External-Agent
fokus: Verzahnung mit cipher-mux-Konzepten
---

# External Review v2 — Rückmeldung

## Executive Summary

Das Pack verzahnt sich technisch sauber mit der Multi-Session-Architektur und dem bestehenden EN-2-Basisregel-Rahmen — die L0/L1/L2/RV-Schichtung wird konsistent übernommen, die Persona-Injection funktioniert parallel. Aber es gibt drei Konflikt-Felder: (1) die MPO-Migrationsphase läuft parallel zur Pack-Übernahme mit aktuell offenen Handoffs, (2) die "Watchdog → Testing Assistant"-Umbenennung übersieht inhaltliche Unterschiede in der Testphilosophie (Watchdog ist manuell-checklisten-basiert, Pack-Testing-Assistant ist Adversarial-fokussiert), (3) das Workspace-Memory-Konzept im Pack unterscheidet sich in der Scoping-Strategie vom konzept-projekt-workspace-struktur.md. Diese sind nicht blocker-schwer, aber Abräumung vor Wellen-Start empfohlen.

---

## Fund-Liste

### Fund 1: MPO-Handoff vom 29. April läuft parallel zur Cyber-Factory-Übernahme
**Pack-Datei:** `05-cyber-factory.md` (Sektion "Migration aus MPO")  
**Bestehendes Dokument:** `handoff-mpo-session-2026-04-29.md`  
**Art:** Bruch (Prozess)  
**Schwere:** Hoch  
**Beobachtung:** Der Handoff nennt sieben offene Retests (RT-1 bis RT-16) und offene Punkte (Grid-Zelle flackert, STT/BugReport Voice-State, hardcoded orchestratorSessionId). Der Pack definiert Cyber Factory als Ersatz für MPO und plant Parallel-Migration (Welle 2). Aber der Handoff war vom 29. April mit aktivem Test-Durchlauf. Unklar: Gehen die sieben offenen Retests verloren, oder werden sie vom Cyber-Factory-Code erledigt?  
**Empfehlung:** Im Pack-Dokument `05-cyber-factory.md` explizit aufnehmen: "Offene Retests aus MPO-Handoff 2026-04-29 (RT-1..RT-16, W1..W8) werden **vor** Welle-2-Start in eine Cyber-Factory-Test-Spec konvertiert. Kein Test wird verworfen." Evtl. neue Task in `14-offene-punkte.md`.

---

### Fund 2: Cyber-Factory-Handoff-Punkt zu Refinement unterspecifiziert
**Pack-Datei:** `05-cyber-factory.md` (Sektion "Refinement → Cyber Factory Handoff — Review-Fund 2")  
**Bestehendes Dokument:** `multi_session_architecture.md` (Sektion "Reviewer-Checkliste")  
**Art:** Luecke  
**Schwere:** Mittel  
**Beobachtung:** Pack definiert den Handoff als Tool-Call `mux_refinement_handoff_cyber_factory({wellePlanPath, projectPath, offLimits})` mit Note-Eintrag + User-Bubble. Das Multi-Session-Konzept hat aber keinen "Refinement endet" Punkt — es hat nur L0 als dauerhaften Koordinator. Frage: Ist Refinement eine L0-Variante, die sich selbst abmeldet? Oder koexistieren Refinement und L0?  
**Empfehlung:** `05-cyber-factory.md` um ein Sequenz-Diagramm erweitern oder explizit: "Refinement ist L0 für Cyber-Factory-Runs. Handoff = Refinement meldet sich ab, Cyber-Factory übernimmt die L1-Koordination."

---

### Fund 3: Worker-Phasenmodell-Durchsetzung doppelt und inkonsistent definiert
**Pack-Datei:** `02-base-rules.md` (Sektion "Worker-Phasenmodell") + `05-cyber-factory.md` (Sektion "Worker-Phasenmodell-Durchsetzung — Review-Fund 3")  
**Bestehendes Dokument:** `multi_session_architecture.md` (kein explizites Phasenmodell), EN-2 (Sektion "Worker-Phasenmodell — wo steht es?")  
**Art:** Doppellung + Inkonsistenz  
**Schwere:** Mittel  
**Beobachtung:** `02-base-rules.md` nennt 7 Phasen (Untersuchen, Plan, Prüfen, Umsetzen, Umsetzung prüfen, Tests, Fertig melden). `05-cyber-factory.md` hat dann eine **Durchsetzungs-Heuristik** (Worker im ersten 3min Code ohne Plan = plan-skipping, Level-3-Eskalation). Das EN-2-Dokument merkt an, dass das Phasenmodell aktuell "nur im MPO steht". Pack definiert es als global geltend (Basisregeln), aber die Durchsetzungslogik ist Cyber-Factory-spezifisch. Das ist asymmetrisch: globale Regel, lokale Enforcement.  
**Empfehlung:** Klarheit: Entweder (a) Phasenmodell ist global (gehört in `02-base-rules.md`, Enforcement in `05-cyber-factory.md` ist OK), oder (b) es ist Cyber-Factory-spezifisch (gehört nur in `05-cyber-factory.md`, nicht in Basisregeln). (a) ist transparenter.

---

### Fund 4: Watchdog → Testing Assistant ist Namensänderung + Konzeptwandel
**Pack-Datei:** `09-testing-assistant.md`  
**Bestehendes Dokument:** `spec-qa-entity.md` (Watchdog-Definition)  
**Art:** Bruch (konzeptionell)  
**Schwere:** Hoch  
**Beobachtung:** `spec-qa-entity.md` definiert Watchdog als "Systematischer Tester. Prueft ob Features tun was die Spec sagt" mit Fokus auf Checklisten, Happy Path, Edge Cases, Regressions. Das ist **manuell und checklisten-getrieben**. Der Pack sagt in `00-INDEX.md`, Watchdog wird "Umbenennung und Schaerfung" in Testing Assistant. Aber `09-testing-assistant.md` existiert nicht (nur im INDEX genannt, nicht gelesen für diesen Review). **Annahme:** Der Pack schwenkt um zu "Adversarial Testing", was konzeptionell anders ist als Spec-Conformance-Checking. Das ist ein echtes Konzeptwechsel, keine bloße Umbenennung.  
**Empfehlung:** `09-testing-assistant.md` lesen (war optional-Liste). Falls das Pack wirklich zu Adversarial schwenkt: in `00-INDEX.md` klarstellen: "Watchdog → Testing Assistant ist nicht nur Umbenennung, sondern Konzeptverschiebung von Spec-Conformance-Checking zu Adversarial Probing. Alte Watchdog-Spec bleibt für andere Use-Cases?" Falls Umbenennung OK: `spec-qa-entity.md` updaten um zu reflektieren, dass Testing Assistant das Erbe ist.

---

### Fund 5: Persona × Preset Default-Matrix bricht mit EN-2d Inline-Edit-Erwartung
**Pack-Datei:** `16-persona-presets.md` (Sektion "Zuweisungs-Architektur", "Kein Inline-Edit")  
**Bestehendes Dokument:** `EN-2__globale-basisregeln-persona-system.md` (Sektion 1.4 "PresetEditor-Parser", Zeile 113: "Persona-Sektion wird vom Parser ignoriert")  
**Art:** Bruch  
**Schwere:** Mittel  
**Beobachtung:** EN-2d hatte vorgesehen: "Toggle 'Eigene Persona verwenden' + Inline-Edit im PresetEditor". Der Pack ersetzt das durch: "Kein Inline-Edit, nur Dropdown mit im Companion-Tab erstellten Personas." Das ist bewusst und steht in `16-persona-presets.md` explizit ("Aenderung gegenueber EN-2d"). **Aber:** EN-2 `00-INDEX.md` / `external-review-rueckmeldung-2026-04-30.md` listet noch EN-2d als offene Anforderung. Widerspruch.  
**Empfehlung:** EN-2 (`EN-2__globale-basisregeln-persona-system.md`) hat ein Frontmatter-Datum oder Version — updaten auf "ersetzt durch cyber-factory-pack v0.3, Sektion 16-persona-presets.md, Aenderung EN-2d". Oder explizit im EN-2-Dokument markieren "EN-2d — SUPERSEDED".

---

### Fund 6: Max-Workers-Limit (5 parallel) nicht mit MPO-Architektur abgestimmt
**Pack-Datei:** `05-cyber-factory.md` (Sektion "Max-Workers-Durchsetzung — Review-Fund 6")  
**Bestehendes Dokument:** `MPO-IMPLEMENTIERUNGSPLAN-2026-04-28.md` (Section "Worker-Übersicht": 5 Haupt-Worker + 1 Background)  
**Art:** Inkonsistenz  
**Schwere:** Niedrig  
**Beobachtung:** Pack setzt `maxParallelWorkers = 5` (Default). MPO-Plan hatte genau 5 Haupt-Worker plus 1 Background (=6 insgesamt, aber Background läuft nicht parallel). Das ist kompatibel, aber nicht dokumentiert. Bei Welle 2 (Cyber-Factory-Rebuild parallel zu MPO): Wenn MPO noch läuft und Cyber Factory parallel startet, werden beide das Limit konkurrenzieren? Oder sind das getrennte Limits (einer pro Orchestrator)?  
**Empfehlung:** `05-cyber-factory.md` klarstellen: "`maxParallelWorkers` ist ein **globales Limit über alle Cyber-Factory-Runs**, nicht pro Session. Wenn zwei Cyber-Factory-Runs gleichzeitig starten (Welle 1 + Welle 2): Worker-Slots werden geteilt. Default 5 ist konservativ, kann per ConfigStore erhöht werden."

---

### Fund 7: Workspace-Memory Scoping unterscheidet sich von konzept-projekt-workspace-struktur
**Pack-Datei:** `11-workspace-memory.md`  
**Bestehendes Dokument:** `konzept-projekt-workspace-struktur.md` (Sektion 1 "Tags statt Unterordner")  
**Art:** Inkonsistenz  
**Schwere:** Mittel  
**Beobachtung:** Pack `11-workspace-memory.md` definiert Memory als "Companion / Workspace / Session"-Ebenen mit Workspace-Scoping. Konzept-Dokument schlägt vor: "Scope-Zuordnung komplett über Tags abbilden. Workspace setzt nur Default-Filter, nicht separate Ordnerstruktur." Das Pack scheint das alte Ordner-Scoping-Modell zu verwenden (separate Scope-Ebenen). Das ist nicht inkompatibel, aber nicht konsistent mit der Tag-Proposal.  
**Empfehlung:** `11-workspace-memory.md` hat Abschnitt "Integration im Workspace" — dort klären: "Memory-Scoping folgt der Tag-basierten Strategie aus konzept-projekt-workspace-struktur.md. Workspace-Memory ist globales Memory mit Default-Tags aus der Workspace-Config. Keine separaten Workspace-Ordner." Falls das noch nicht geplant ist: Nota-Bene in `14-offene-punkte.md`.

---

### Fund 8: Token-Disziplin-Tabelle im Pack referenziert EN-2, ist aber ausführlicher
**Pack-Datei:** `02-base-rules.md` (Sektion 12 "Token-Disziplin")  
**Bestehendes Dokument:** `EN-2__globale-basisregeln-persona-system.md` (Sektion 1.6 "Globale Regeln — wo stehen sie?")  
**Art:** Doppellung (mit Erweiterung)  
**Schwere:** Niedrig  
**Beobachtung:** EN-2 hat Token-Disziplin als verteilte Regel (MPO nur, nicht global). Pack hat `02-base-rules.md` Section 12 mit einer ausführlichen Tabelle und Budget-Profilen pro Aufgabentyp. Das ist eine **Erweiterung**, keine Doppellung — Pack konkretisiert was EN-2 skizziert.  
**Empfehlung:** Keine Action nötig. Das ist gutes Zusammenspiel: EN-2 nennt das Problem, Pack löst es. Nur dokumentieren für Clarity: EN-2 ist Diagnose, `02-base-rules.md` Section 12 ist Rezept.

---

### Fund 9: Spec-Learning-Separation (privat vs. produkt-Wissen) wird in Pack nicht adressiert
**Pack-Datei:** Workspace-Memory, `11-workspace-memory.md`  
**Bestehendes Dokument:** `spec-learning-separation.md`  
**Art:** Luecke  
**Schwere:** Niedrig  
**Beobachtung:** `spec-learning-separation.md` existiert (Briefing nennt es als optional), wurde aber nicht gelesen. Annahme: Es definiert eine Trennung zwischen privatem Wissen (User-Vorlieben, Hack-Notizen) und produktivem Wissen (für Release). Pack hat "Workspace-Memory" als generisch. Unklar, ob das der Separation gerecht wird.  
**Empfehlung:** Falls relevant: `14-offene-punkte.md` Nota-Bene hinzufügen: "spec-learning-separation.md Integration bei Workspace-Memory-Phase klären."

---

### Fund 10: Model-Routing referenziert "opusplan", aber Versions-String ist hardcoded
**Pack-Datei:** `05-cyber-factory.md` (Sektion "Model-Routing") + ConfigStore-Keys  
**Bestehendes Dokument:** Multi-Session-Architektur nutzt `opusplan` symbolisch  
**Art:** Inkonsistenz (Versions-Handling)  
**Schwere:** Niedrig  
**Beobachtung:** Pack sagt: "Modell-Strings sind versions-gebunden. ConfigStore hält sie symbolisch (`'haiku' | 'sonnet' | 'opus'`); Resolver mappt auf aktuellen Versions-String." Aber dann: `opusplan` wird direkt in der Tabelle genannt (nicht als Symbol). Das ist asymmetrisch.  
**Empfehlung:** In `05-cyber-factory.md` Section "ConfigStore-Keys" (Zeile 527): Type-Definition auf `'opusplan'` als Symbol erweitern. Resolver muss auch `opusplan` → `claude-opus-4-6` konvertieren (nicht nur Basis-Modelle).

---

### Fund 11: Refinement-Extended (`08-refinement-extended.md`) ist Optional, aber critical für REQ-ID-Konsistenz
**Pack-Datei:** `05-cyber-factory.md` (Mapping L0 = Refinement, Abschnitt "Architektur-Anker"), `08-refinement-extended.md` im INDEX  
**Bestehendes Dokument:** `multi_session_architecture.md` (L0-Definition)  
**Art:** Luecke (Abhängigkeit nicht dokumentiert)  
**Schwere:** Mittel  
**Beobachtung:** Pack-INDEX listet `08-refinement-extended.md` als separate Datei, die "Refinement übernimmt Scaffolding-Anteil". Aber `05-cyber-factory.md` sagt: "Refinement = L0 für Cyber Factory" ohne darauf hinzuweisen, dass das eine Erweiterung von Refinement voraussetzt. Das ist eine Abhängigkeit.  
**Empfehlung:** `05-cyber-factory.md` in Sektion "Operative Vorlage" oder "Abhängigkeiten" notieren: "Refinement-Profil im Pack wird durch `08-refinement-extended.md` definiert. Ist Voraussetzung für Detail-Spec-Generierung und REQ-ID-Konsistenz."

---

### Fund 12: Persona-Resolver als Komponente im Code ist neu, wird aber nicht in Migrations-Plan genannt
**Pack-Datei:** `16-persona-presets.md` (ConfigStore-Integration, "Resolution beim Session-Start"), `02-base-rules.md`  
**Bestehendes Dokument:** `EN-2__globale-basisregeln-persona-system.md` (Sektion 1.4 "PresetEditor-Parser")  
**Art:** Luecke  
**Schwere:** Niedrig  
**Beobachtung:** `16-persona-presets.md` nennt neue Modul-Datei `src/main/session/persona-resolver.ts`. Migrations-Plan (`12-migration-rebuild.md`) wird nicht in diesem Review gelesen (war optional-Liste), aber keine Erwähnung im INDEX oder `05-cyber-factory.md`, dass dieser Modul neu ist und in Welle-0 oder Welle-1a liegt.  
**Empfehlung:** `12-migration-rebuild.md` lesen (war optional). Falls nicht gelistet: `16-persona-presets.md` Section "Migration" → "Welle 1a" → "Persona-Resolver-Modul implementieren" explizit nennen.

---

### Fund 13: Stuck-Heuristik (7 Min Heartbeat + 3 Min Output-Plateau) hat keine Justierungsparameter
**Pack-Datei:** `05-cyber-factory.md` (Sektion "Stuck-Heuristik — Review-Fund 13")  
**Bestehendes Dokument:** `multi_session_architecture.md` (keine Worker-Diagnostik erwähnt)  
**Art:** Design-Lücke  
**Schwere:** Niedrig  
**Beobachtung:** Pack definiert: "kein heartbeat seit > 7 Minuten ODER Output flacht ab (< 100 Zeichen seit > 3 Minuten)". Das sind harte Konstanten. Bei unterschiedlichen Modellen (Haiku vs. Opus), unterschiedlichen Sub-Projekt-Typen und unterschiedlichen Netzwerk-Bedingungen kann das zu False Positives führen.  
**Empfehlung:** ConfigStore-Keys hinzufügen (optional in v0.3, aber gut zu dokumentieren): `cyber_factory.stuckDetection.heartbeatTimeoutMs`, `cyber_factory.stuckDetection.outputPlateauMs`, `cyber_factory.stuckDetection.minOutputChars`. Defaults wie gelistet, aber User kann tunen.

---

### Fund 14: Risk-Review-Format ist strukturiert, aber Kriterium "Gebrochenes testen" fehlt
**Pack-Datei:** `05-cyber-factory.md` (Sektion "Risk-Review-Format — Review-Fund 14")  
**Bestehendes Dokument:** `multi_session_architecture.md` (Reviewer-Checkliste nennt "Stille Schema-/API-Änderungen")  
**Art:** Luecke  
**Schwere:** Niedrig  
**Beobachtung:** Risk-Review-Template hat Sections: Geänderte Dateien, Gelöschte Dateien, Neue Abhängigkeiten, Potentiell Gebrochenes, Off-Limits-Status, Tests. Der Multi-Session-Reviewer hat aber "Stille Schema-/API-Änderungen" und "Externe Pakete: existieren in Registry (Slopsquatting-Check)". Das sind Checks, die aus dem Pack-Template fehlen.  
**Empfehlung:** `05-cyber-factory.md` Risk-Review-Template: Section "Potentiell Gebrochenes" erweitern um: "- Schema- oder API-Änderungen (stillschweigend?)" und neuer Punkt "Abhängigkeits-Validierung: alle neuen Pakete in offizieller Registry geprüft?"

---

### Fund 15: Testing → Debugger Routing hat User-Dialog als "Empfehlung", aber Severity-Mix ist hart
**Pack-Datei:** `05-cyber-factory.md` (Sektion "Testing → Debugger Routing — Review-Fund 21")  
**Bestehendes Dokument:** `spec-qa-entity.md` (Sektion "Integration ins Cockpit")  
**Art:** Inkonsistenz  
**Schwere:** Niedrig  
**Beobachtung:** Pack: "0 Hoch + ≤5 Mittel → User-Dialog mit Empfehlung". Aber was ist die Empfehlung? Standard "Debugger starten?" ist nicht sprechend, wenn das Testing 5 Mittel-Findings hat, aber 0 Hoch. Watchdog-Spec hat "Fair, kein Service-Lächeln" — da würde ein klarer Satz stehen: "5 Mittel-Bugs. Debugger nötig vor Release?" Das ist Tone-Detail, aber nicht trivial.  
**Empfehlung:** `05-cyber-factory.md` Sektion "Testing → Debugger Routing" — Beispiel-Dialog hinzufügen: "5 mittlere Findings (keine kritisch). Debugger starten vor Release?" (oder ähnlich, passt zu Pack-Tone).

---

### Fund 16: Companion-Memory vs. Workspace-Memory klare Abgrenzung fehlt
**Pack-Datei:** `11-workspace-memory.md` + `02-base-rules.md` (Template-Variablen)  
**Bestehendes Dokument:** `EN-2__globale-basisregeln-persona-system.md` (Schicht 7 "Companion-Memory global")  
**Art:** Luecke (Nomenklatur)  
**Schwere:** Niedrig  
**Beobachtung:** Pack hat Template-Variablen wie `{{user_profile_yaml}}` (aus Companion-Memory) in Persona-Injection. Aber `11-workspace-memory.md` definiert Workspace-Memory als separate Ebene. Wo gehört `user_profile_yaml` hin — zu Companion oder Workspace? Die Nomenklatur ist nicht klar.  
**Empfehlung:** `02-base-rules.md` Section "Template-Engine" um Satz ergänzen: "User-Profil kommt aus globalem Companion-Memory (Schicht 7 EN-2). Workspace-Memory (Schicht 6 EN-2) wird über mux_workspace_memory_recall separat abgerufen, nicht als Template-Variable injiziert."

---

### Fund 17: Companion-Sub-Modi (Tutor/Berater/Helfer) werden erwähnt, aber nicht in Pack-Presets abgebildet
**Pack-Datei:** `16-persona-presets.md` (Sektion "Companion-Sub-Modi")  
**Bestehendes Dokument:** `EN-2__globale-basisregeln-persona-system.md` (Sektion 2 nennt sieben Schichten, keine Sub-Modi)  
**Art:** Luecke (Feature nicht gelistet, aber nur im Persona-Doc erwähnt)  
**Schwere:** Niedrig  
**Beobachtung:** `16-persona-presets.md` sagt: "Companion wechselt seine Persona nach erkanntem Modus (Tutor/Berater/Helfer), nicht nach User-Auswahl pro Preset." Das ist eine smarte Idee, aber nicht in `04-presets-funktional.md` gelesen (optional). Unklar, ob Companion-Preset-Spec (`04-presets-funktional.md`) das implementiert.  
**Empfehlung:** `04-presets-funktional.md` lesen (war optional). Falls nicht im Companion-Preset beschrieben: im Pack-Persona-Doc notieren "Companion-Sub-Modi-Erkennung wird in eigener Spec definiert, nicht im Persona-Preset."

---

### Fund 18: Welle-Plan-Format als Markdown/YAML ist neu, kein Versionselement
**Pack-Datei:** `05-cyber-factory.md` (Sektion "Welle-Plan-Format — Review-Fund 18")  
**Bestehendes Dokument:** `multi_session_architecture.md` (hat kein Welle-Plan-Konzept, nur Spec + Übergabeprompt)  
**Art:** Luecke  
**Schwere:** Niedrig  
**Beobachtung:** Pack definiert Welle-Plan als persistierte Note mit Kind `welle-plan`. Format ist YAML-Frontmatter + Markdown. Aber kein `version` oder `schemaVersion` im Frontmatter. Falls das Welle-Plan-Format in v0.4 ändert, wie werden alte Pläne migriert?  
**Empfehlung:** Welle-Plan-YAML um `schemaVersion: "1"` ergänzen. Migrations-Plan (`12-migration-rebuild.md`) kann dann auf Schema-Versionen prüfen.

---

### Fund 19: Template-Engine für Persona-Variablen nicht mit Fallback-Strategie dokumentiert
**Pack-Datei:** `02-base-rules.md` (Sektion "Template-Engine für Persona-Variablen — Review-Fund 19")  
**Bestehendes Dokument:** EN-2 (Zeile 159: "Template-Variablen werden nirgends aufgelöst — es gibt keinen Template-Engine-Code")  
**Art:** Inkonsistenz  
**Schwere:** Niedrig  
**Beobachtung:** Pack sagt: "Wenn eine Variable nicht aufgelöst werden kann (leeres User-Profil), wird sie durch einen leeren String ersetzt — kein Error, keine Default-Phrase." Das ist ein klare Regel, aber der Code-Modul `src/main/session/session-injector.ts` wird nicht erwähnt, ob diese Logik dort liegt oder woanders.  
**Empfehlung:** `02-base-rules.md` Section "Template-Engine" um Code-Anker ergänzen: "Auflösung erfolgt in `src/main/session/session-injector.ts`. Unbekannte Variablen → leerer String (Silent Fallback)."

---

### Fund 20: Off-Limits-Liste Quellen-Hierarchie ist 3-Ebenen, aber Konflikt-Regel fehlt
**Pack-Datei:** `05-cyber-factory.md` (Sektion "Off-Limits-Liste — Quelle — Review-Fund 20")  
**Bestehendes Dokument:** `02-base-rules.md` (Sektion 5 "Off-Limits respektieren")  
**Art:** Luecke  
**Schwere:** Niedrig  
**Beobachtung:** Pack sagt: Off-Limits-Liste setzt sich zusammen aus (1) Globale Basisregeln, (2) Workspace-Memory, (3) Detail-Spec. Aber was, wenn Detail-Spec sagt "ändere src/auth/" und Basisregeln sagen "auth ist Off-Limits"? Konflikt-Auflösungsregel fehlt.  
**Empfehlung:** `05-cyber-factory.md` "Off-Limits-Liste"-Sektion: "Priorität bei Konflikt: Detail-Spec **überschreibt** globale Basisregeln (User hat Spec geschrieben und kennt die Konsequenzen). Workspace-Memory ist informativ, Detail-Spec hat Vorrang."

---

## Sauber verzahnt

1. **L0/L1/L2/RV-Mapping** — Pack übernimmt die Multi-Session-Architektur konsistent. Refinement=L0, Cyber Factory=L1, Worker=L2, Testing/Audit=RV. Keine Konflikte.

2. **Persona-Injection über Session-Manager** — Pack nutzt bestehende `injectPersonaSection()`, erweitert nur das Persona-Seed-Set. Architektur bleibt gleich.

3. **ConfigStore-Integration** — Pack definiert neue Keys (`cyber_factory`, `characters` Erweiterung, `globalRules`). Keine Kollisionen mit bestehenden Sektion-Namen.

4. **Basisregel-Verankerung** — `02-base-rules.md` konkretisiert das, was EN-2 als "globale Regeln sind verteilt" benannt hat. Gutes Zusammenspiel.

5. **Workspace-Editor + Persona-Dropdown** — Pack klammert sich an bestehende Workspace-Editor-Struktur, fügt nur Dropdown-Feld hinzu. UI-minimal-invasiv.

6. **MCP-Tools Erweiterung** — Pack nutzt bestehende `mux_*` Konventionen, adds `mux_cyber_factory_handoff_*` und `mux_workspace_memory_*`. Naming konsistent.

---

## Braucht Aufräumung (vor Wellen-Start)

1. **MPO-Handoff-Retests sichern** — Die 16 offenen Retests aus handoff-2026-04-29 müssen vor Cyber-Factory-Welle-2 in einen Test-Plan konvertiert werden. Aktuell Vakuum zwischen MPO-Phase und Cyber-Factory-Phase.

2. **EN-2d vs. Pack-Persona-Architektur klaren** — EN-2 nennt noch EN-2d-Anforderung (Inline-Edit), Pack ersetzt sie durch Dropdown. EN-2-Dokument updaten oder explizit supersede-Markierung.

3. **Watchdog vs. Testing Assistant klären** — Ist das eine bloße Umbenennung oder ein Konzeptwechsel zu Adversarial? `09-testing-assistant.md` lesen und dann `spec-qa-entity.md` updaten oder beide laufen lassen.

4. **Workspace-Memory Tag-Scoping abstimmen** — `11-workspace-memory.md` sollte mit `konzept-projekt-workspace-struktur.md` abgestimmt werden (Tag-basiertes vs. Ordner-basiertes Scoping).

5. **Refinement-Extended als Abhängigkeit dokumentieren** — `08-refinement-extended.md` ist nicht optional, wenn Cyber Factory L0=Refinement setzt. In Migrations-Plan Welle 1a eintragen.

