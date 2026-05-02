# Umsetzungsplan: Testcase-Modus

> Basierend auf: `moreismore/feature-testcase-modus.md`
> Erstellt: 2026-04-26, Orchestrator

## Ueberblick

4 Phasen, sequentiell durch den Orchestrator koordiniert. Jede Phase = eine Worker-Session.

---

## Phase 1 — Datenmodell & Parser

**Ziel:** Testcases als eigenen Note-Typ etablieren, Parser fuer das MD-Format bauen.

- Note-Typ `testcase` im bestehenden Notes-System registrieren
- YAML-Frontmatter-Schema: `type: testcase`, `version`, `source: mpo`, `created`
- MD-Parser fuer das Testcase-Format:
  - Sektionen (H2) als Gruppierung
  - Checkboxen mit `T-XX.N` IDs als Items
  - Nummerierte Listen unter `## Vorbereitung` als Info-Block
- Ergebnis-Format definieren (Status pro Item, Kommentare, Screenshot-Referenzen)
  - Damit der Rueckkanal (Req #20/#21) von Anfang an steht
  - Sessions muessen das Ergebnis ueber bestehende MCP Notes-Tools lesen koennen

**Lieferobjekte:** Parser-Modul, Typ-Registrierung, Format-Dokumentation

---

## Phase 2 — Testcase-View (UI)

**Ziel:** Eigene UI-Komponente fuer die Testcase-Abarbeitung im Grid.

- Eigene Grid-Zellen-Komponente (NICHT der allgemeine Notes-Editor)
- Zeilen pro Item: ID, Beschreibung, Tri-State-Status (pass / fail / skip)
- Aufklappbares Kommentarfeld pro Item
  - Klick auf Item oder Button oeffnet Textfeld unterhalb
  - Markdown-faehig
- Statusleiste: "12/20 bestanden, 3 fehlgeschlagen, 5 uebersprungen"
- Archiv-Bereich:
  - Abgearbeitete Testcases read-only einsehbar
  - Datum + Ergebnis-Zusammenfassung
- Design: Pixel-Art / CSS-Art gemaess cipher-mux Design-Direktive, keine Emojis
- Performance: 50+ Items muessen fluessig laufen (ggf. virtualisiertes Scrolling)

**Lieferobjekte:** TestcaseView-Komponente, Archiv-Ansicht, Grid-Integration

---

## Phase 3 — Screenshot-Integration

**Ziel:** Screenshots direkt im Kommentarfeld aufnehmen und einfuegen.

- Screenshot-Button pro Kommentarfeld → macOS Region-Capture
  - Electron `desktopCapturer` oder native API
  - Screen-Recording-Permission muss einmalig vom User bestaetigt werden
- Cmd+V Paste-Support im Kommentarfeld (Bild aus Zwischenablage)
- Screenshots als Dateien im Testcase-Verzeichnis speichern (nicht Base64 inline)
- Vorschau des Screenshots im Kommentar anzeigen

**Lieferobjekte:** Screenshot-Capture-Modul, Paste-Handler, Datei-Speicherung, Vorschau-Rendering

---

## Phase 4 — MPO-Workflow + Feature-Request-Auslagern

**Ziel:** MPO erstellt Testcases automatisch, User kann Kommentare als Feature-Requests auslagern.

- Testcase-Erstellung als **feste Phase** im MPO-Workflow (Post-Build, nicht optional)
- MPO muss das Format aus `feature-testcase-modus.md § Testcase-Format` einhalten
- "Als Feature-Request auslagern"-Button im Kommentarfeld
  - Erstellt separate Note mit Kommentar-Inhalt + Referenz auf Testcase
- End-to-End-Validierung: MPO erstellt Testcase → View zeigt ihn → User arbeitet ab → Session liest Ergebnis

**Lieferobjekte:** MPO-Phase, Feature-Request-Export, E2E-Test

---

## Abhaengigkeiten

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
(Parser)   (View)    (Screenshots)  (MPO + Glue)
```

Strikt sequentiell — jede Phase baut auf der vorherigen auf.

---

## Bewusst draussen (v1)

- Keine eigenen MCP-Tools fuer Testcases (Rueckkanal ueber bestehende Notes-Tools)
- Kein Tagging-System
- Keine klappbaren Sektionen / Akkordeon-UI
- Keine Retention-Policy
- Keine GitHub-Issues-Anbindung

---

## Risiken

| Risiko | Mitigation |
|--------|-----------|
| Screen Recording Permission | User muss einmalig bestaetigen — Permission-Dialog beim ersten Capture |
| Parser-Robustheit bei MPO-Varianz | Defensiv parsen, klare Fehlermeldungen bei Format-Abweichungen |
| 50+ Items Performance | Virtualisiertes Scrolling einplanen falls noetig |
| Format-Aenderungen in Zukunft | Parser modular halten, Format-Version im Frontmatter |
