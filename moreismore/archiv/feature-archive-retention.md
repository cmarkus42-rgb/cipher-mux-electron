# Feature Request: Archiv + Retention-Policy

## Idee

Artefakte die im cipher-mux-Workflow entstehen (Bugreports, Feature-Requests, abgeschlossene Testcases) werden nicht geloescht, sondern archiviert. Archivierte Items bleiben einsehbar, werden aber aus den aktiven Listen entfernt.

## Retention-Policy (Settings)

In den Einstellungen konfigurierbar, wie lange archivierte Items aufbewahrt werden:

- 30 Tage
- 90 Tage
- 1 Jahr
- Unbegrenzt (Default)

Gilt fuer:
- Bugreports (nach Resolve)
- Feature-Requests (nach Umsetzung oder Ablehnung)
- Testcases (nach Abarbeitung)

## Kontext

Entstanden aus der Testcase-Modus-Ideation. cipher-mux wird veroeffentlicht — abgeschlossene Artefakte haben Dokumentationswert und sollten nicht einfach verschwinden. Gleichzeitig soll der Workspace nicht zuwachsen, daher konfigurierbare Aufbewahrungsdauer.

## Abhaengigkeiten

- Notes-System (bereits vorhanden)
- Testcase-Modus (in Planung)

---

*Erstellt: 2026-04-26, Quelle: Relay-Ideation*
