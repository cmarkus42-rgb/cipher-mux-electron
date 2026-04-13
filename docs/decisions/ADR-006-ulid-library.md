# ADR-006: ULID-Generierung

**Status:** Entschieden
**Datum:** 2026-04-13
**Betrifft:** SPEC.md Abschnitt 3 (Datenmodell — Message-IDs, Session-IDs)

## Kontext

Session-IDs und Message-IDs nutzen ULIDs (Universally Unique Lexicographically Sortable Identifier). ULIDs sind zeitbasiert sortierbar, was natürliche chronologische Ordnung in SQLite ermöglicht (kein ORDER BY timestamp nötig, PRIMARY KEY reicht).

## Optionen

### Option A: `ulid` (npm)

Original-Implementierung von Alizain Feerasta.

- **Vorteile:**
  - Original-Library, weit verbreitet (~2.5M weekly downloads)
  - Monotonic factory verfügbar (`monotonicFactory()`)
  - Tiny (~1KB)
- **Nachteile:**
  - Letztes Update 2023, kein aktiver Maintainer
  - Kein ESM-Export (CommonJS only)
- **Risiko:** niedrig (stabile API, keine Bugs bekannt)

### Option B: `ulidx` (npm)

Modernerer Fork mit TypeScript-Support.

- **Vorteile:**
  - TypeScript-native
  - ESM + CJS Dual-Export
  - Aktiv maintained (2024+)
  - Monotonic ULID eingebaut
  - Decode-Utilities (Timestamp-Extraktion)
- **Nachteile:**
  - Weniger verbreitet (~200K weekly downloads)
- **Risiko:** niedrig

### Option C: Custom (crypto.randomUUID + Timestamp)

Eigene Implementierung mit Node.js Bordmitteln.

- **Vorteile:** Keine Dependency
- **Nachteile:** ULID-Spec korrekt implementieren ist nicht trivial (Crockford Base32, Monotonicity)
- **Risiko:** mittel (Fehlerquelle, Wartungsaufwand)

## Empfehlung

**Option B: `ulidx`**

TypeScript-native, ESM-Support, aktiv maintained — passt am besten zum Tech-Stack (TypeScript strict mode). Die Decode-Utilities (Timestamp aus ULID extrahieren) sind nützlich für Message-Retention-Cleanup.

## Entscheidung

**Option B: ulidx** — TypeScript-native, ESM-Support, aktiv maintained, Decode-Utilities.

## Konsequenzen

- `npm install ulidx`
- Zentrale Factory in `src/shared/ulid.ts`: `export const nextId = monotonicFactory()`
- Session-IDs und Message-IDs via `nextId()` generiert
- Timestamp-Extraktion für Cleanup: `decodeTime(ulid)` statt separater `created_at`-Query
