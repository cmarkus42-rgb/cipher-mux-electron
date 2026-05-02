# Pre-Mortem — Watchdog v0.2

**Datum:** 2026-04-27
**Gegenstand:** `spec-qa-entity-v0.2.md`
**Zeitrahmen:** 1 Jahr
**Praemisse:** Die Watchdog-Persona ist nach 12 Monaten Nutzung als gescheitert markiert — User nutzt sie nicht mehr regelmaessig oder vertraut den Findings nicht. Was ist passiert?

---

## Die sieben Gruende

### 1. Die Skip-Heuristik der Phase 1 traf systematisch falsch

Watchdog uebersprang die Free-Form-Phase oft, weil Plaene formal "unter 20 Cases UND eindeutig formuliert" aussahen. In der Praxis war "eindeutig formuliert" eine Selbsttaeuschung — Testcases sahen formal sauber aus, brauchten aber explorative Beobachtung um sinnvoll geprueft zu werden. Bugs blieben unentdeckt, der User merkte das spaeter und kam selten zurueck.

**W = 4 (Heuristiken treffen oft daneben), S = 3 (User-Vertrauen erodiert, reparabel) → 12**

### 2. Race-Conditions auf dem Testplan-File haben das Vertrauen ins File zerstoert

Die Live-Synchronisation User <-> Watchdog auf demselben md-File war im Spec-Stand v0.2 nicht reglementiert. Beide schrieben parallel — der User notierte eigene Beobachtungen, Watchdog setzte gleichzeitig Status-Werte. Konflikte gingen verloren oder wurden dupliziert. Nach mehreren Vorfaellen begann der User Versions-Backups zu fuehren, das File war nicht mehr Single Source of Truth.

**W = 4 (klassisches Live-Sync-Problem), S = 4 (zerstoert das Kern-Feature) → 16**

### 3. Das Verwerfen des Mitschnitts hat einmal richtig wehgetan

Eine Woche nach einem Lauf fiel dem User auf: "Moment, ich hatte doch was zu X gesagt." Mitschnitt war verworfen, Watchdog hatte das Detail nicht als Bug klassifiziert, Quelle weg. Ein Vorfall reichte nicht zum Scheitern, aber das Vertrauen in die Loesch-Strategie blieb beschaedigt. Der User redete in spaeteren Laeufen weniger frei, weil "wenn das eh nicht aufgehoben wird, kann ich's auch lassen".

**W = 3 (passiert vielleicht ein-, zweimal pro Jahr), S = 3 (kein akutes Versagen, aber Kollateralschaden auf Phase 1) → 9**

### 4. Die Persona war zu nett, weil sie aus Relay uebernommen wurde

Default-Charakter aus Relay funktionierte fuer den Zuhoer-Teil der Phase 1 sehr gut. Aber Relays Grundton — ruhig, geduldig, zugewandt — verwaesserte das Adversarial-Mindset. Bugs wurden zu hoeflich formuliert ("Mir ist aufgefallen dass..."). Findings wurden im MPO ueberlesen, weil sie nicht alarmig genug klangen. Watchdog wurde zum sympathischen Hilfsfeature statt zur ernstgenommenen Qualitaets-Instanz.

**W = 4 (Default-Uebernahme ohne expliziten Charakterbruch), S = 3 (verwaessert den Kern-Mehrwert) → 12**

### 5. Watchdog wurde kaum aufgerufen, weil die Aktivierung umstaendlich war

Die Integrations-Session lieferte die Sidebar-Karte und einen Voice-Command "Watchdog starten" — aber kein MCP-Tool, das der MPO oder Orchestrator nach Worker-Completion automatisch triggern konnte. In der Praxis vergass der User die Aktivierung, der MPO entschied selbst weiter, Bugs blieben in der Pipeline haengen. Nach drei Monaten lag Watchdog brach.

**W = 3 (haengt an der Folge-Session, aber Risiko ist da), S = 4 (Persona ohne Nutzung ist tot) → 12**

### 6. Plan-Luecken-Meldungen versickerten in den Abschluss-Berichten

Watchdog hat seine Guardrail eingehalten — keine Plan-Erweiterung von allein, nur Meldung in der Abschluss-Nachricht. Aber niemand las die Abschluss-Nachrichten systematisch nach Plan-Kritik. Der MPO scannte nach Bug-IDs und ignorierte den Rest. Plan-Qualitaet degradierte ueber Monate, ohne dass jemand merkte woher das schlechtere Test-Ergebnis kam.

**W = 4 (typisches Multi-Agenten-Loop-Problem), S = 3 (lange Erosion, kein akutes Versagen) → 12**

### 7. Die Free-Form-Phase uferte aus

Phase 1 hatte keine Begrenzung. Der User redete oft 45 Minuten frei, die Sortier-Phase wurde laenger als alle anderen zusammen. Watchdog wurde gefuehlt zur Persona-fuer-grosse-Audits, nicht zum Alltagswerkzeug. Bei Tests die in 20 Minuten haetten erledigt sein sollen, vermied der User Watchdog und ging direkt durch den Plan.

**W = 3 (User-abhaengig, aber wahrscheinlich), S = 3 (Nutzungsfrequenz sinkt, Persona wird Spezial-Fall) → 9**

---

## Scoring-Tabelle

| # | Grund | W | S | Score | Klasse |
|---|-------|---|---|-------|--------|
| 2 | Race-Conditions auf Testplan-File | 4 | 4 | **16** | kritisch |
| 1 | Skip-Heuristik traf falsch | 4 | 3 | **12** | kritisch |
| 4 | Persona zu nett (Relay-Default) | 4 | 3 | **12** | kritisch |
| 5 | Aktivierung umstaendlich | 3 | 4 | **12** | kritisch |
| 6 | Plan-Luecken-Meldung versickerte | 4 | 3 | **12** | kritisch |
| 3 | Verworfener Mitschnitt aergert | 3 | 3 | 9 | beobachten |
| 7 | Free-Form-Phase uferte aus | 3 | 3 | 9 | beobachten |

Vier kritische Gruende, plus #2 als ausgepraegt kritisch (Score 16). Zwei zum Beobachten. Keine Schein-Sicherheit — die Spec hat echte Schwachstellen, aber kein einzelner Showstopper.

---

## Ableitungen pro kritischem Grund

### #2 Race-Conditions (Score 16)

**Strukturell**, gehoert in die Integrations-Session — *aber die Spec muss die Anforderung formulieren*. Konkrete Ergaenzung in v0.3:

> *"Schreibrecht auf das Testplan-File hat zu jedem Zeitpunkt entweder der User oder Watchdog, nicht beide. Die Integrations-Session implementiert ein Lock auf Section-Ebene oder ein Pull-Request-artiges Apply-Modell, in dem Watchdogs Status-Updates erst nach User-Bestaetigung im File landen. Live-Anzeige bleibt — Schreibkonflikt ausgeschlossen."*

Damit landet die Verantwortung dort wo sie hingehoert (Integration), aber die Spec verhindert dass das Problem in der Folge-Session uebersehen wird.

### #1 Skip-Heuristik (Score 12)

**Entschaerfbar.** Statt Black-Box-Skip soll Watchdog seine Empfehlung mit Begruendung aussprechen und der User entscheidet:

> *"Phase-Gate vor Phase 1 wird zur expliziten Empfehlung mit Begruendung: 'Plan hat 18 Cases, davon 12 UI-bezogen. Ich schlage Free-Form-Phase vor — willst du das?' statt 'Frei reden oder direkt durch?' allein."*

Verschiebt Entscheidung vom System ins Gespraech. Heuristik bleibt, aber transparent.

### #4 Persona zu nett (Score 12)

**Entschaerfbar.** In der Spec ein expliziter Persona-Marker, der vom Relay-Default abweicht:

> *"Watchdog uebernimmt aus Relay: ruhiger Ton, du-Form, kurze Saetze, kein Service-Laecheln. Watchdog uebernimmt NICHT: weichzeichnende Hoeflichkeit bei Befunden. Bugs werden in klarer Aussage formuliert ('Highlight verschwindet nicht nach Duration 0 + Clear. Bug.'), nicht eingehuellt ('Mir ist aufgefallen, dass...')."*

Damit ist der Persona-Default fuer die Folge-Session konkret begrenzt, ohne dass v0.2 in den Persona-Charakter abdriftet.

### #5 Aktivierung umstaendlich (Score 12)

**Strukturell**, Out-of-Scope der Spec — aber als harte Anforderung an die Integrations-Session formulieren:

> *"Mindest-Aktivierungs-Wege fuer Watchdog (in der Integrations-Session zu liefern): (a) Voice-Command, (b) MCP-Tool das vom MPO/Orchestrator nach Worker-Completion programmatisch gerufen werden kann, (c) Sidebar-Eintrag/Preset. Drei Trigger, nicht einer."*

(b) ist der entscheidende — ohne automatische Triggerbarkeit aus dem Workflow heraus laeuft Watchdog dem User immer hinterher.

### #6 Plan-Luecken versickern (Score 12)

**Entschaerfbar.** Plan-Luecken bekommen einen eigenen Output-Kanal:

> *"Plan-Luecken werden zusaetzlich zur Abschluss-Meldung als eigenstaendige Note mit Tag `plan-luecke` gespeichert. Damit sind sie auffindbar via Tag-Suche und der Pipe-Loop kann sie systematisch verarbeiten — unabhaengig davon ob jemand die Abschluss-Meldung liest."*

Loest das "versickert in der Sammelmeldung"-Problem ohne neue Eskalations-Logik.

---

## Beobachtete Gruende (Score 8-11)

**#3 Verworfener Mitschnitt:** dokumentiert als Annahme — wir nehmen den Vertrauensbruch in Kauf, um Datenmuell und Whisper-Halluzinationen zu vermeiden. Wenn das Problem nach einem Jahr Nutzung sichtbar wird, ist eine Mittelweg-Variante (Mitschnitt 7 Tage aufheben, dann auto-loeschen) der erste Anpassungs-Hebel.

**#7 Free-Form-Phase uferlos:** keine harte Grenze in v0.3 noetig, aber Watchdog sollte ein Soft-Signal nach 15-20 Minuten kennen ("Wir sind jetzt bei 18 Minuten freier Erkundung — willst du weitermachen oder zur Sortierung?"). Das ist eine Persona-Verhaltensregel, gehoert in die Folge-Session.

---

## Was in v0.3 der Spec landet

Fuenf konkrete Aenderungen aus den kritischen Gruenden:

1. Anforderung an Schreib-Recht auf dem Testplan-File (Single-Writer)
2. Phase-Gate vor Phase 1 als explizite Empfehlung mit Begruendung
3. Persona-Default-Marker: was aus Relay uebernommen wird, was nicht
4. Anforderung an Mindest-Aktivierungs-Wege (3 Trigger)
5. Plan-Luecken als eigene Note mit Tag, zusaetzlich zur Abschluss-Meldung

Plus: Die zwei Beobachtungs-Gruende (#3, #7) als Annahmen explizit dokumentieren — nicht entschaerfen, aber nennen.
