# ADR-007: Message-Retention

**Status:** Entschieden
**Datum:** 2026-04-13
**Betrifft:** SPEC.md Abschnitt 3 (Datenmodell), Abschnitt 8 (Performance)

## Kontext

Der Message Bus in SQLite sammelt kontinuierlich Messages aus bis zu 10 Sessions. Ohne Cleanup wächst die Datenbank unbegrenzt. Die Retention-Strategie muss WAL-Dateigrösse und Query-Performance balancieren, ohne wichtige Messages zu verlieren.

## Optionen

### Option A: Zeitbasiert (>7 Tage)

Messages älter als 7 Tage werden automatisch gelöscht.

- **Vorteile:**
  - Einfach zu implementieren und zu verstehen
  - Vorhersagbare Datenbankgrösse
  - 7 Tage reicht für typische Arbeitswoche
- **Nachteile:**
  - Bei Urlaub/Pause gehen alle Messages verloren
  - Keine Unterscheidung zwischen wichtigen und unwichtigen Messages
- **Risiko:** niedrig

### Option B: Anzahlbasiert (>1000 pro Topic)

Pro Topic werden maximal 1000 Messages behalten (älteste zuerst gelöscht).

- **Vorteile:**
  - Feste Obergrenzen pro Topic (5 Topics x 1000 = max 5000 Messages)
  - Keine zeitbasierte Überraschung
- **Nachteile:**
  - Bei hoher Aktivität werden wichtige Messages schnell verdrängt
  - Ungleichmässige Verteilung (system-Topic füllt sich schneller)
- **Risiko:** niedrig

### Option C: Hybrid (Zeit + Anzahl + Topic-Gewichtung)

- System/Status: 3 Tage oder max 500
- Chat/Bug/Review: 14 Tage oder max 2000
- Cleanup läuft alle 6 Stunden (oder bei App-Start)

- **Vorteile:** Differenzierte Retention je nach Topic-Wichtigkeit
- **Nachteile:** Komplexere Konfiguration
- **Risiko:** niedrig

## Empfehlung

**Option A: Zeitbasiert (7 Tage)** für den MVP.

Einfachste Lösung, die funktioniert. Single-User-App mit typischem täglichem Gebrauch — 7 Tage deckt eine Arbeitswoche ab. Cleanup läuft bei App-Start und alle 6 Stunden. Die 1000-Message-Grenze aus Option B ist bei 10 aktiven Sessions innerhalb von 7 Tagen unwahrscheinlich erreicht.

Falls sich herausstellt, dass bestimmte Topics mehr Retention brauchen: Upgrade auf Option C ist trivial.

## Entscheidung

**Option A: Zeitbasiert (7 Tage)** — Einfachste Lösung, Cleanup bei App-Start + alle 6 Stunden.

## Konsequenzen

- `MessageBus.cleanup(olderThan)` löscht Messages + zugehörige ReadStatus-Einträge
- Cleanup bei App-Start + setInterval alle 6 Stunden
- SQLite VACUUM nach Cleanup (WAL-Checkpoint)
- read_status wird kaskadierend gelöscht (WHERE message_id NOT IN messages)
- Konfigurierbar via ConfigStore: `app.messageRetentionDays` (Default: 7)
