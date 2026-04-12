---
name: interview
description: "Führt ein strukturiertes Anforderungsinterview durch (Phase 1). Erhebt systematisch alle Anforderungen und schreibt das Ergebnis in docs/requirements.md."
---

# Phase 1: Anforderungsinterview

Du führst ein strukturiertes Interview mit dem Auftraggeber durch. Ziel: Alle Anforderungen systematisch erheben, bevor Code geschrieben wird.

## Vorbereitung

1. Lies `docs/requirements.md` — dort stehen bereits Vorab-Informationen aus dem Konzept-Input
2. Lies `CLAUDE.md` — dort stehen bekannte Constraints und Infrastruktur
3. Identifiziere Lücken: Was fehlt noch für eine vollständige Spezifikation?

## Interview-Ablauf

Stelle Fragen in diesen Kategorien (überspringe was bereits bekannt ist):

### Kern-Funktionalität
- Was sind die 3–5 wichtigsten Features?
- Welches Problem löst die App konkret?
- Wer sind die Nutzer?

### Technische Tiefe
- Datenmodell: Welche Entitäten gibt es? Beziehungen?
- Persistenz: Lokal, Server, beides? Sync-Strategie?
- APIs: Welche externen Services werden angebunden?
- Authentifizierung: Wie loggen sich Nutzer ein?

### UI/UX
- Hauptscreens und Navigation?
- Plattform-spezifische Anforderungen (E-Ink, Mobile, Desktop)?
- Offline-Fähigkeit?

### Edge Cases & Risiken
- Was passiert bei Netzwerkverlust?
- Bekannte Performance-Constraints?
- Sicherheitsanforderungen?
- Was ist explizit NICHT im Scope?

### Abgrenzung
- Was ist MVP (Phase 1 Scope)?
- Was kommt später?

## Regeln

- Frage proaktiv nach Dingen, die der Auftraggeber vermutlich nicht bedacht hat
- Stelle KEINE offensichtlichen Fragen — grabe in die schwierigen Teile
- Maximal 5 Fragen pro Runde, dann warte auf Antwort
- Wenn eine Antwort neue Fragen aufwirft: nachfragen
- Interview beenden wenn alle Kategorien abgedeckt sind

## Abschluss

Wenn das Interview vollständig ist:

1. Schreibe `docs/requirements.md` komplett neu mit allen erhobenen Anforderungen
2. Strukturiere nach: Vision, Features, Datenmodell, Nicht-funktionale Anforderungen, Scope/MVP, Risiken
3. Markiere verbleibende Unsicherheiten mit `[KLÄREN]`
4. Aktualisiere den Status in `CLAUDE.md`:
   ```
   **Phase: 1 → 2 — Spezifikation erstellen**
   **Nächster Schritt:** `/spec` starten
   ```
5. Fasse zusammen was erhoben wurde und was der nächste Schritt ist
