---
name: spec
description: "Erstellt die technische Spezifikation aus den Requirements (Phase 2). Analysiert Anforderungen, recherchiert Frameworks/APIs und schreibt docs/SPEC.md."
---

# Phase 2: Technische Spezifikation erstellen

Du erstellst autonom die technische Spezifikation auf Basis der erhobenen Anforderungen.

## Eingabe lesen

1. Lies `docs/requirements.md` — das ist deine Primärquelle
2. Lies `CLAUDE.md` — Tech-Stack, Constraints, Infrastruktur
3. Wenn Referenz-Projekte angegeben sind: deren Struktur analysieren (CLAUDE.md, Projektstruktur)

## Research (bei Bedarf)

Nutze Subagenten für:
- API-Dokumentation der eingesetzten Frameworks
- Best Practices für den gewählten Tech-Stack
- Patterns aus Referenz-Projekten

## SPEC.md schreiben

Fülle `docs/SPEC.md` mit konkretem Inhalt:

### 1. Systemübersicht
- Architekturdiagramm (ASCII/Mermaid)
- Komponentenübersicht mit Verantwortlichkeiten

### 2. Module & Verantwortlichkeiten
- Pro Modul: Name, Zweck, öffentliche API, Abhängigkeiten
- Modulstruktur als Verzeichnisbaum

### 3. Datenmodell
- Entities mit Feldern und Typen
- Beziehungen (1:n, n:m)
- Persistenz-Strategie (Room, SQLite, File, etc.)

### 4. API-Kontrakte / Schnittstellen
- Interne APIs zwischen Modulen
- Externe API-Anbindungen (Endpoints, Auth, Formate)
- Protokolle (REST, WebSocket, gRPC)

### 5. UI-Architektur
- Screen-Liste mit Navigation
- State-Management-Strategie
- Plattform-spezifische Patterns

### 6. Offene Entscheidungspunkte
- Jeder Punkt als Checkbox: `- [ ] Entscheidung XY`
- Kontext und warum eine Entscheidung nötig ist
- Diese werden in Phase 3 via `/decide` adressiert

### 7. Akzeptanzkriterien
- Pro Feature: messbare Kriterien
- Testbare Aussagen ("User kann X tun und sieht Y")

### 8. Nicht-funktionale Anforderungen
- Performance-Ziele (konkrete Zahlen)
- Sicherheit, Offline, Skalierung

## Abschluss

1. Prüfe: Sind alle Requirements aus `docs/requirements.md` in der SPEC abgedeckt?
2. Aktualisiere `CLAUDE.md` Projektstruktur-Sektion mit der tatsächlichen Modulstruktur
3. Aktualisiere den Status in `CLAUDE.md`:
   ```
   **Phase: 2 → 3 — Technische Entscheidungen**
   **Nächster Schritt:** `/decide` für jeden offenen Entscheidungspunkt starten
   ```
4. Liste alle offenen Entscheidungspunkte auf, die in Phase 3 adressiert werden müssen
