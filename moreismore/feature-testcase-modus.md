# Anforderungen — Testcase-Modus

## Vision

cipher-mux bekommt eine integrierte Testcase-Abarbeitung. Nach einem MPO-Build-Run kann der User die generierten Testcases direkt im Grid durcharbeiten — strukturiert, kommentierbar, mit Screenshot-Support. Kein Wechsel zu externen Tools, kein Freitext-Chaos in MD-Dateien.

## Zielgruppe

Der cipher-mux-User, der nach einem Build-Run Ergebnisse abnimmt. Kennt die App, kennt den Workflow, braucht keine Erklaerung was ein Testcase ist. Perspektivisch auch externe Nutzer nach Veroeffentlichung.

## Funktionale Anforderungen

### Testcase-Ablage

1. [MUST] Testcases werden als spezialisierter Note-Typ gespeichert (technisch auf dem Notes-System basierend, aber eigener Bereich in der UI)
2. [MUST] Der MPO legt nach Abschluss eines Build-Runs automatisch ein Testcase-Dokument ab
3. [MUST] Testcase-Dokumente folgen einem festen MD-Format (siehe Abschnitt "Testcase-Format")

### Testcase-View

4. [MUST] Eigener Bereich in der UI — nicht der allgemeine Notes-Editor
5. [MUST] Testcase-View kann in einer Grid-Zelle geoeffnet werden
6. [MUST] Jeder Testcase-Item wird als Zeile dargestellt mit: ID, Beschreibung, Status-Checkbox
7. [MUST] Status pro Item: bestanden / nicht bestanden / uebersprungen
8. [MUST] Aufklappbares Kommentarfeld pro Item — Klick auf Item oder Button oeffnet Textfeld unterhalb
9. [MUST] Kommentarfeld unterstuetzt Freitext (Markdown)
10. [MUST] Gesamtstatus sichtbar: "12/20 bestanden, 3 fehlgeschlagen, 5 uebersprungen"

### Screenshot-Support

11. [MUST] Screenshot-Button pro Kommentarfeld — triggert macOS-Region-Capture, fuegt Ergebnis automatisch in den Kommentar ein
12. [MUST] Paste-Support (Cmd+V) im Kommentarfeld — Bild aus Zwischenablage wird eingefuegt
13. [SHOULD] Screenshots werden als Dateien im Testcase-Verzeichnis gespeichert (nicht Base64 inline)
14. [SHOULD] Eingefuegte Screenshots werden als Vorschau im Kommentar angezeigt

### Auslagern von Ideen

15. [SHOULD] Button oder Option im Kommentarfeld: "Als Feature-Request auslagern"
16. [SHOULD] Auslagern erstellt eine separate Note / einen separaten Eintrag mit dem Kommentar-Inhalt und Referenz auf den Testcase

### Archivierung

17. [MUST] Abgearbeitete Testcases werden archiviert, nicht geloescht
18. [MUST] Archivierte Testcases bleiben einsehbar (read-only)
19. [SHOULD] Archiv-Bereich zeigt abgeschlossene Testcases mit Datum und Ergebnis-Zusammenfassung

### Rueckkanal

20. [MUST] Claude-Sessions koennen abgearbeitete Testcases ueber die bestehenden MCP Notes-Tools lesen
21. [SHOULD] Das Ergebnis-Format ist so strukturiert, dass eine Session die Kommentare, Screenshots-Referenzen und Status pro Item parsen kann

## Nicht-funktionale Anforderungen

- **Design:** Pixel-Art / CSS-Art gemaess cipher-mux Design-Direktive. Keine Emojis.
- **Performance:** Testcase-View muss auch mit 50+ Items fluessig scrollen und reagieren
- **Plattform:** macOS (Electron). Screenshot-Capture nutzt macOS-native APIs.
- **Dateigroesse:** Screenshots als separate Dateien, damit Notes nicht aufgeblaehen

## Kern-Workflow

1. MPO schliesst Build-Run ab
2. MPO erstellt Testcase-Dokument im definierten Format und legt es als Note ab
3. User sieht im Testcase-Bereich: neuer Testcase verfuegbar
4. User oeffnet Testcase im Grid
5. User geht Item fuer Item durch:
   - Status setzen (Klick: pass / fail / skip)
   - Optional: Kommentarfeld aufklappen, Text schreiben
   - Optional: Screenshot machen (Button) oder einfuegen (Cmd+V)
   - Optional: Kommentar als Feature-Request auslagern
6. Fortschritt sichtbar: Statusleiste zeigt "X/Y abgearbeitet"
7. User ist fertig — sagt Claude-Session: "Hol dir den Testcase"
8. Session liest Ergebnis ueber bestehende MCP Notes-Tools
9. Session verarbeitet Feedback (Bugs fixen, Aenderungen umsetzen)
10. Testcase wird archiviert

## Scope / MVP-Abgrenzung

### Drin (v1)
- Testcase-View mit Checkboxen und Kommentarfeldern
- Screenshot-Support (Button + Paste)
- Archivierung abgeschlossener Testcases
- Rueckkanal ueber bestehende Notes-Tools
- MPO-Format-Spezifikation
- MPO-Workflow-Erweiterung (automatische Testcase-Erstellung)

### Bewusst draussen (spaeter)
- Klappbare Sektionen / Akkordeon-UI
- Eigene MCP-Tools fuer Testcases
- Tagging-System
- Retention-Policy mit konfigurierbaren Zeitraeumen (separates Feature)
- Feature-Request-System als tiefer integrierter Bereich (separates Feature)
- GitHub-Issues-Anbindung

## Constraints

- Electron + bestehende cipher-mux-Architektur
- Notes-System als technische Basis (gleicher Speicherort, YAML-Frontmatter)
- MD als Austauschformat zwischen MPO und View
- macOS fuer Screenshot-Capture

## Testcase-Format (MPO-Vertrag)

Der MPO muss Testcases in folgendem Format liefern, damit der View sie parsen kann:

```markdown
---
title: "v0.11 Manual Testcases"
type: testcase
version: "0.11"
created: 2026-04-26
source: mpo
---

# v0.11 Manual Testcases

> Kontext-Zeile (optional, wird im View als Beschreibung angezeigt)

## Vorbereitung

1. Schritt eins
2. Schritt zwei

## Sektionsname

- [ ] **T-ID.1** Beschreibung des Testcase-Items
- [ ] **T-ID.2** Weiteres Item
```

Regeln:
- YAML-Frontmatter mit `type: testcase` (damit der View es erkennt)
- Items sind Markdown-Checkboxen mit fetter ID im Format `T-XX.N`
- Sektionen (H2) werden als visuelle Gruppierung dargestellt
- Vorbereitungsschritte (nummerierte Liste) werden als Info-Block angezeigt

## Bekannte Risiken und Annahmen

- **Annahme:** Das bestehende MD-Format aus v0.11 ist repraesentativ fuer kuenftige Testcases. Wenn sich das Format stark aendert, muss der Parser angepasst werden.
- **Annahme:** Screenshots als separate Dateien reichen aus — kein Cloud-Upload, keine externe Bildverwaltung noetig.
- **Risiko:** macOS-Screenshot-API in Electron benoetigt Screen-Recording-Berechtigung. Der User muss das einmalig erlauben.
- **Risiko:** Grosse Testcases (100+ Items) koennten den View unuebersichtlich machen. Ggf. spaeter Sektions-Kollaps nachruestbar.
- **MPO-Abhaengigkeit:** Der MPO muss das Format zuverlaessig einhalten. Die Testcase-Erstellung muss als feste Phase in seinen Workflow eingebaut werden — nicht optional, nicht auf Nachfrage.

## Referenzen und Kontext

- Negativ-Beispiel (unstrukturierte Abarbeitung): `cipher-mux-electron/docs/v0.10-manual-testcases.md`
- Positiv-Beispiel (sauberes Template): `cipher-mux-electron/docs/v0.11-manual-testcases.md`
- Bestehendes Notes-System als technische Basis
- Bugreport-System als Architektur-Vorbild (eigener Bereich, eigener Flow)

---

## Umsetzungsempfehlung

**Orchestrator-Session.** Kein neues Projekt (kein Launcher), keine voellig unabhaengigen Komponenten (kein MPO). Aber zu viel fuer eine einzelne Session — vier Baustellen die aufeinander aufbauen:

1. Testcase-Datenmodell (Note-Typ, Frontmatter-Schema)
2. Testcase-View (UI-Komponente im Grid)
3. Screenshot-Integration (macOS-Capture, Paste, Dateispeicherung)
4. MPO-Workflow (Testcase-Erstellung als feste Phase)

Sequentiell durch den Orchestrator koordinieren.

---

*Erstellt: 2026-04-26, Relay-Ideation v0.1*
