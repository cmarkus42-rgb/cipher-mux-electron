# SP-9 Persona-Optimization — Changelog

> 2026-04-25 | Alle Aenderungen sind Prompt-Drafts, kein Code.

---

## Uebersicht der Deliverables

| Datei | Typ | Status |
|---|---|---|
| `00-analysis.md` | Analyse | Bestandsaufnahme, Luecken, Staerken |
| `relay-core.md` | Neuer Kern-Prompt | Ersetzt SPEC.md §7 Entwurf |
| `overlay-companion.md` | Entity-Overlay | Ersetzt `the how-to-session/CLAUDE.md` |
| `overlay-refinement.md` | Entity-Overlay | Ersetzt `the refinement session/CLAUDE.md` |
| `overlay-orchestrator.md` | Entity-Overlay | Ersetzt `orchestrator-template.ts` Inhalt |
| `overlay-mpo.md` | Entity-Overlay | Ersetzt `~/.config/cipher-mux/mpo/CLAUDE.md` |
| `overlay-launcher.md` | Entity-Overlay | Ergaenzt `launcher-prompt.ts` |
| `overlay-voice-relay.md` | Entity-Overlay | NEU, von Grund auf |

---

## relay-core.md — Aenderungen gegenueber SPEC.md §7 Entwurf

| Was | Vorher | Nachher | Warum |
|---|---|---|---|
| Charakter-Definition | 3 Zeilen, abstrakt | Ausfuehrlich mit Do/Don't-Beispielen (4+4) | Q4: Ton-Kalibrierung braucht Beispiele |
| User-Profil-Nutzung | `{{user_profile_yaml}}` ohne Anleitung | 3 Level-spezifische Beispiel-Antworten | Q6: Mindestens 2 Beispiele wie Profil die Antwort beeinflusst |
| Memory-Heuristiken | Grob skizziert | Explizite Trigger-Woerter fuer recall, Do/Don't-Liste fuer remember | Q7: Klare Recall/Write-Heuristiken |
| Sicherheit | 3 Bullet Points | + Credentials-Klausel (Mimir-Regel) | Konsistenz mit CLAUDE.md Global-Instruktionen |
| Sprache | DE durchgehend | DE durchgehend (konsistent) | L2: Sprach-Inkonsistenz behoben |
| Anti-Patterns | Fehlten im Entwurf | 4 Don't-Beispiele | Q2: Praezision statt vager Anweisungen |

## overlay-companion.md — Aenderungen gegenueber `the how-to-session/CLAUDE.md`

| Was | Vorher | Nachher | Warum |
|---|---|---|---|
| Persona-Block | Eigene Identitaets-Definition | Verweist auf relay-core.md | Q1: Konsistenz, eine Person |
| Sprache | EN/DE gemischt | Komplett DE | L2: Sprach-Inkonsistenz |
| MCP-Tools | Nicht erwaehnt | 5 Tools mit Nutzungs-Kontext | Q3: MCP-Awareness |
| Companion-Memory | Nicht erwaehnt | Integriert via relay-core | Q7/L4: Memory fehlt |
| Ton-Beispiele | Fehlten | 3 Beispiel-Dialoge | Q4: 3 Ton-Beispiele |
| Didaktik-Regeln | 9 Regeln | 6 Kern-Regeln (reduziert, Rest in relay-core) | Vermeidung Dopplung |
| User-Profil | Detaillierte Onboarding-Logik | Verweist auf relay-core fuer Onboarding | Q1: Konsistenz |
| Routing-Tabelle | Beibehalten | Beibehalten (Staerke) | War bereits gut |
| Analogien | Beibehalten | Beibehalten (Staerke) | War bereits gut |

**Entfernt:**
- Eigene Identitaets-Sektion (→ relay-core)
- Eigene User-Profil-Erstellung (→ relay-core / Companion First-Run)
- EN-Passagen

## overlay-refinement.md — Aenderungen gegenueber `the refinement session/CLAUDE.md`

| Was | Vorher | Nachher | Warum |
|---|---|---|---|
| Persona-Block | Eigene Identitaets-Definition (fast identisch mit Companion) | Verweist auf relay-core.md | Q1: Konsistenz |
| MCP-Tools | Nur implizit (mux_create_session in Phase 5) | Explizite Tool-Liste mit Wann-Tabelle | Q3: MCP-Awareness |
| Companion-Memory | Nicht erwaehnt | Integriert via relay-core | L4: Memory fehlt |
| Ton-Beispiele | Fehlten | 4 Beispiel-Dialoge | Q4: 3+ Ton-Beispiele |
| 5-Phasen-Modell | Ausfuehrlich (Staerke) | Kompakter, gleiche Substanz | Kuerzer bei gleicher Tiefe |
| Skills-Tabelle | Beibehalten | Beibehalten | War gut |
| Brain-Regeln | Beibehalten | Beibehalten | War gut |

**Entfernt:**
- Eigene Identitaets-Sektion (→ relay-core)
- Eigene User-Profil-Erstellung (→ relay-core)
- Analogien-Sektion (→ relay-core, leicht abweichend — normalisiert)
- Duplizierte Arbeitsregeln die in relay-core stehen

## overlay-orchestrator.md — Aenderungen gegenueber `orchestrator-template.ts`

| Was | Vorher | Nachher | Warum |
|---|---|---|---|
| Persona | Keine (nur Rolle) | Verweist auf relay-core.md | L1: Kein Persona-Kern |
| Ton | Nicht definiert | 3 Beispiel-Outputs (Status, Eskalation, Delegation) | Q4/Q5 |
| MCP-Tools | Auflistung | + Wann-Tabelle (welches Tool bei welcher Situation) | Q3: MCP-Awareness |
| Notes-Tools | Nicht erwaehnt | `mux_notes_create`, `mux_notes_handoff_create` | Neue Tools fehlen |
| Grenzen | Implizit | Explizite Do/Don't-Liste | Q5: Grenzen pro Entity |
| Task-Management | Vorhanden | Beibehalten, leicht gestrafft | War gut |
| Bugreport-Flow | Vorhanden | Beibehalten | War gut |

## overlay-mpo.md — Aenderungen gegenueber `~/.config/cipher-mux/mpo/CLAUDE.md`

| Was | Vorher | Nachher | Warum |
|---|---|---|---|
| Persona | "Wayne Szalinski light" | Relay-konsistenter Ton + MPO-spezifische Anpassung | Q1: Konsistenz |
| Ton-Beispiele | Fehlten | 3 Do-Beispiele, 2 Don't-Beispiele | Q4: Ton-Kalibrierung |
| MCP-Tools | Vorhanden | + Notes-Tools, klarere Struktur | Q3 |
| Lifecycle | 10 Phasen (Staerke) | Beibehalten, leicht kompakter | War gut |
| Eskalation | 5-Level (Staerke) | Beibehalten | War gut |
| Grenzen | "Kein Code" + Kern-Regeln | Explizite Do/Don't-Liste | Q5 |

**Groesste Aenderung:** Wayne Szalinski ist raus. Der MPO klingt jetzt wie Relay
mit pragmatischem Einschlag — weniger Persona-Karikatur, mehr konsistenter Charakter.
Die "begeistert, pragmatisch"-Beschreibung ist ersetzt durch konkrete Ton-Beispiele.

## overlay-launcher.md — NEU

Der Launcher hatte keinen eigenen Persona-Prompt, nur einen generierten Auftrag in
`launcher-prompt.ts`. Das Overlay definiert:
- Rolle und Kern-Auftrag
- Tool-Awareness (kickoff_complete)
- Grenzen
- 2 Ton-Beispiele

**Hinweis:** Der Launcher interagiert minimal mit dem User. Das Overlay ist entsprechend kurz.

## overlay-voice-relay.md — NEU (von Grund auf)

Komplett neues Entity-Overlay fuer den Sprach-Modus. Definiert:
- Sprach-Anpassungen (Satzstruktur, Tempo, Natuerlichkeit)
- MCP-Operator-Modus (proaktive Tool-Angebote)
- Regel: Keine technischen Details vorlesen (IDs, Pfade, Code)
- Tool-Aufrufe ankuendigen bevor sie passieren
- 4 Ton-Beispiele
- Grenzen (kein Terminal, kein Code-Diktieren, Verweis auf Companion fuer Langform)

---

## Quality Gate Pruefung

| # | Kriterium | Erfuellt? | Nachweis |
|---|---|---|---|
| Q1 | Konsistenz | Ja | Ein relay-core.md, 6 Overlays die darauf aufbauen |
| Q2 | Praezision | Ja | Keine "sei hilfreich"-Anweisungen. Nur konkrete Regeln mit Beispielen |
| Q3 | MCP-Awareness | Ja | Jedes Overlay hat Tool-Liste + Wann-Tabelle oder Nutzungs-Kontext |
| Q4 | Ton | Ja | relay-core: 4+4 Beispiele. Jedes Overlay: 2-4 eigene Beispiele |
| Q5 | Grenzen | Ja | Jedes Overlay hat explizite Do/Don't-Liste |
| Q6 | User-Profil | Ja | relay-core: 3 Level-spezifische Beispiel-Antworten |
| Q7 | Memory | Ja | relay-core: Trigger-Woerter, Do/Don't fuer remember, Heuristiken |
