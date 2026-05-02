# Showcase — Rezept-Extraktor

**Status:** IDEE
**Quelle:** Startprompt aus ct3003-Video (Keno, Vibe-Coding)
**Ziel:** cipher-mux-Workflow demonstrieren — von Prompt zu fertigem Tool in einer Sitzung

---

## Original-Prompt

> ich koche gerne und stoße häufig auf instagram, tiktok, www und youtube auf rezepte in unterschiedlichen darreichungsformen (bild, video, text). ich möchte gerne, dass ich einfach die url irgendwo hinschicke und dann wird das rezept extrahiert und in eine notion-seite exportiert. Die Rezepte sollen am Ende deutsch mit europäischen Metriken sein. Auf der Notionseite soll dann am Ende sein: Ein großes Bild vom Essen, ein passendes Emoji, die Zubereitungs-Dauer (kurz, mittel, lang), Tags, Foto-Eigenschaft mit Link, Ausprobiert (ja/nein) und Kalorienangabe.

---

## Warum dieser Prompt als Showcase taugt

1. **Wiedererkennbar** — stammt von bekanntem Tech-Redakteur, Vibe-Coding-Kontext
2. **Alltagsproblem** — jeder versteht "Rezept-URL rein, schoene Seite raus"
3. **Mehrere Schichten** — URL-Scraping, Rezept-Parsing, API-Integration, Design
4. **Kompakte Groesse** — in einer Session durchziehbar, kein Mammutprojekt
5. **Visuell ansprechend** — Essen, Bilder, schoene Notion-Seiten = gutes Videomaterial

---

## Demo-Ablauf (geplant)

### Phase 1: Refinement (5 Min)
- Prompt in Refinement-Session geben
- Anforderungen schaerfen: Welche Plattformen? Auth-Handling? Fehlerbehandlung?
- Refinement liefert strukturierte Requirements

### Phase 2: MPO plant und verteilt (3 Min)
- MPO bekommt Requirements
- Plant Sub-Projekte: Scraper, Parser, Notion-Export, (optional) Web-UI
- Spawnt Worker-Sessions

### Phase 3: Worker bauen (10-15 Min, im Zeitraffer)
- Worker 1: URL-Scraper (Instagram, TikTok, YouTube, Web)
- Worker 2: Rezept-Parser (LLM-basiert: Zutaten, Schritte, Metriken umrechnen)
- Worker 3: Notion-Integration (API-Client, Seiten-Template)
- Grid zeigt alle Sessions parallel — der Zuschauer sieht Live-Coding

### Phase 4: Testing (3 Min)
- Testcase-View zeigt automatisch generierte Tests
- User (oder Companion) geht Testcases durch
- Ein paar echte URLs testen

### Phase 5: Webdesign (3 Min)
- Webdesign-Session optimiert Notion-Template
- Oder: Landing-Page / Web-UI fuer URL-Eingabe

### Phase 6: Demo (2 Min)
- Instagram-URL reinkopieren
- Rezept wird extrahiert
- Notion-Seite erscheint: Bild, Emoji, Tags, Kalorien — alles da

**Gesamtdauer Video:** ~10-15 Min (geschnitten)

---

## Technische Notizen

### Notion-API
- Braucht Notion Integration Token (einmalig im Notion-Account erstellen)
- Datenbank-ID fuer die Rezept-Sammlung
- REST-API: `POST https://api.notion.com/v1/pages`
- Properties: Title, Emoji, Select (Dauer), Multi-Select (Tags), URL, Checkbox (Ausprobiert), Number (Kalorien)
- Content-Blocks: Image, Heading, Bulleted List (Zutaten), Numbered List (Schritte)

### Alternative ohne Notion-Auth (einfacher fuer Demo)
- Markdown-Dateien generieren statt Notion-API
- Oder: Notion-CSV-Import vorbereiten
- Weniger Wow, aber kein Setup-Overhead im Video

### Scraping-Herausforderungen
- Instagram/TikTok: oft kein direkter Rezepttext, LLM muss aus Bild/Video extrahieren
- YouTube: Transcript/Beschreibung parsen
- Web: Schema.org Recipe-Markup nutzen wo vorhanden

---

## Offene Fragen

- [ ] Reicht der Umfang fuer einen ueberzeugenden Showcase? (Christian: "ich weiss nicht ob er gross genug ist")
- [ ] Notion-Auth im Video zeigen oder vorher einrichten?
- [ ] Welche Plattform-URLs konkret demonstrieren?
- [ ] Video-Format: Screencast mit Voice-Over? Companion erklaert?
- [ ] Soll das gleichzeitig der erste Test des Video-Modes sein (Feature F-companion-video)?
