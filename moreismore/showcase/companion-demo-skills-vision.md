# Vision: Companion Demo Skills

**Status:** Entwurf — wird interaktiv ausgearbeitet wenn MCP-Tools fertig sind
**Datum:** 2026-04-26
**Abhaengigkeit:** MCP-Tools aus `2026-04-26-companion-video-demo-mode-spec.md` muessen funktionieren

---

## Ueberblick

Die drei neuen MCP-Tools (`mux_ui_highlight`, `mux_ui_open`, `mux_theme_set`) plus die bestehenden 31 Tools ermoeglichen drei Szenarien. Die Umsetzung erfolgt ueber Companion-Skills (Markdown-Dateien mit Anweisungen) — kein neues Script-Format, kein Parser.

---

## Szenario 1: Showreel / Trailer (60-90s, geschnitten)

Companion-Skill der eine beeindruckende Sequenz abfaehrt. Latenzen werden im Schnitt entfernt.

**Grobe Struktur:**
- Eroeffnung: leeres Grid, Companion spawnt sich
- Aufbau: Sessions entstehen, Grid fuellt sich
- Orchestrierung: Orchestrator koordiniert mehrere Worker
- Kontrolle: Workspace-Wechsel, Theme-Wechsel
- Abschluss: Cleanup, Logo

**Produktionshinweise:**
- Companion-Text als Voice-Over oder Terminal-Output
- Musik/Sound separat
- Schnitt-Tempo: zuegig, kein Leerlauf

---

## Szenario 2: How-To-Clips (2-5 Min, geschnitten)

Ein Companion-Skill pro Clip. Jeder Clip eigenstaendig, kein Vorwissen noetig.

**Clip-Ideen:**
- "Deine erste Session" — LauncherCell, Projekt oeffnen, erste Eingabe
- "Das Grid verstehen" — Spalten/Zeilen, Drag, RowSpan, Background
- "Workspaces" — Laden, erstellen, als Default setzen
- "Der Orchestrator" — Starten, Worker beobachten, Message-Bus
- "Companion — dein Guide" — Frage stellen, Live-Highlighting

**Muster pro Clip:**
1. Companion highlightet relevantes UI-Element
2. Companion erklaert was es ist und wozu
3. Companion oeffnet zugehoeriges Menue/Dialog
4. Companion erklaert Optionen
5. User probiert selbst (bei How-To) oder Schnitt (bei Video)

---

## Szenario 3: Live-Hilfe (Echtzeit, Ziel-Szenario)

Kein Skill noetig — Companion reagiert ad-hoc auf User-Fragen.

**Beispiele:**
- "Wo stell ich Workspaces ein?" → Highlight auf Button, erklaert
- "Wie mach ich das Grid groesser?" → Highlight auf +/- Buttons
- "Was macht der Orchestrator?" → Highlight, oeffnet ggf. relevante UI, erklaert

Per Voice-Relay besonders stark: User spricht, Companion zeigt und erklaert.

---

## Offene Fragen (zu klaeren wenn es losgeht)

- Wie viel Humor/Persoenlichkeit in den Skills? (Relay-Persona vs. neutral)
- Voice-Over separat einsprechen oder Companion-Text im Terminal zeigen?
- Clip-Laenge: strikt 2-5 Min oder flexibel?
- Reihenfolge der Clips: welcher zuerst produzieren?
- Live-Hilfe: soll der Companion aktiv vorschlagen ("Soll ich dir X zeigen?") oder nur auf Fragen reagieren?

---

## Naechste Schritte

1. MCP-Tools implementieren und testen (siehe MCP-Spec)
2. Ersten Skill (z.B. einfachster How-To-Clip) interaktiv mit Companion entwickeln
3. Erfahrungen sammeln: was funktioniert, was nicht
4. Weitere Skills basierend auf Erfahrung ausbauen
