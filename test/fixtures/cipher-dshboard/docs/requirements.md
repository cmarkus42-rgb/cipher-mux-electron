# Requirements — cipher-dashboard

## Projektziel

Ein Web-Dashboard zur Echtzeit-Überwachung von CI/CD-Pipelines. Zeigt Build-Status, Deployment-History und Alerts für alle Projekte einer Organisation auf einen Blick.

## Funktionale Anforderungen

### F-01: Pipeline-Übersicht
- Alle aktiven Pipelines als Cards in einem Grid
- Jede Card zeigt: Projektname, Branch, Status (running/passed/failed), Dauer, Trigger-User
- Auto-Refresh alle 10 Sekunden

### F-02: Build-Detail-Ansicht
- Klick auf Pipeline-Card öffnet Detail-View
- Log-Output als scrollbarer Terminal-View (ähnlich xterm.js)
- Step-by-Step Fortschrittsanzeige

### F-03: Deployment-History
- Tabellarische Ansicht der letzten 50 Deployments pro Projekt
- Filter nach Environment (staging, production)
- Rollback-Button mit Bestätigungsdialog

### F-04: Alert-System
- Webhook-basierte Benachrichtigungen bei Pipeline-Failure
- Alert-Badge im Header mit Unread-Count
- Alert-Detail mit Fehler-Kontext und Link zum Build-Log

## Nicht-funktionale Anforderungen

### NF-01: Performance
- Dashboard-Load unter 2 Sekunden
- Max 500ms Latenz für Status-Updates

### NF-02: Stack
- Frontend: Preact + TypeScript
- Backend: Node.js + SQLite
- API: REST + SSE für Echtzeit-Updates

### NF-03: Design
- Dunkles Theme (cipher ivory kompatibel)
- Responsive ab 1024px Breite
