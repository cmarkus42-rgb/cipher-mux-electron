# Bug/Feature: Message Bus Push-Delivery an Worker-Sessions

## Status: Bug + Feature Request

**Erstellt:** 2026-04-23
**Getestet von:** Orchestrator-Session (manueller Test)
**Prioritaet:** Hoch — der Message Bus erfuellt ohne dieses Feature seinen Kernzweck nicht

---

## Problem

Der Message Bus ist aktuell ein **reines Log-System**. Messages, die per `mux_send` gepostet werden, landen zwar persistent im Bus, aber **kein Worker liest sie aktiv**. Claude-Code-Sessions in tmux pollen den Bus nicht und haben keinen Mechanismus, um auf eingehende Messages zu reagieren.

### Konkretes Testergebnis (2026-04-23)

**Test-Setup:**
- Orchestrator-Session (ID: `01KPX77HAMBF0HP05GD01K855B`)
- Worker-Session `cipher-desktop-electron` (ID: `01KPXATTRZZNHM71ZHQHTYY1QZ`, Pane: `$20`)

**Test 1 — mux_send an topic "system":**
```
mux_send(topic: "system", sender: "Orchestrator", text: "Bitte poste eine Test-Nachricht...")
```
- Ergebnis: Message landet im Bus (ID: `01KPXBECQJRSJHD0W9D5RXTFB5`)
- Worker reagiert **nicht** — er weiss nicht, dass eine Message fuer ihn da ist
- Nach 15 Sekunden Wartezeit: keine Antwort im Chat-Topic

**Test 2 — tmux send-keys direkt:**
```
tmux send-keys -t '$20' 'Bitte poste eine Test-Nachricht...' Enter
```
- Ergebnis: Worker empfaengt die Instruktion sofort
- Worker postet innerhalb von ~20 Sekunden seine Antwort in den Bus
- Antwort erfolgreich im Bus (ID: `01KPXBGMSZ4EEAY6ME0VD56MJP`)

**Fazit:** Der Bus funktioniert als Speicher, aber nicht als Kommunikationskanal. Der einzige Weg, einen Worker zu erreichen, ist `tmux send-keys` — das macht den Bus fuer Inter-Session-Kommunikation nutzlos.

---

## Ist-Zustand (Architektur-Problem)

```
Orchestrator                    Message Bus                    Worker
    |                               |                            |
    |--- mux_send(topic, text) ---->|                            |
    |                               |  (Message gespeichert)     |
    |                               |                            |
    |                               |  KEINE Zustellung!         |
    |                               |                            |
    |--- tmux send-keys ------------|--------------------------->|
    |                               |                            |
    |                               |<--- mux_send (Antwort) ---|
    |<-- mux_read ------------------|                            |
```

Das bedeutet:
1. Der Orchestrator muss **zwei Systeme** parallel nutzen (Bus + tmux)
2. Der Bus ist nur ein glorifiziertes Logfile
3. Die Message-Bus-Abstraktion ist undicht — der Orchestrator muss tmux-Details kennen (Pane-ID, Session-Name)
4. Race Conditions: tmux send-keys kann ankommen bevor Claude bereit ist

---

## Soll-Zustand (Feature Request)

### Option A: Push-Delivery via tmux (empfohlen fuer v1)

Bei `mux_send` soll der Server automatisch die Message per `tmux send-keys` in die Ziel-Session injizieren, wenn eine Session adressiert wird.

**Neuer Parameter fuer mux_send:**
```typescript
mux_send({
  topic: "system",
  sender: "Orchestrator",
  text: "Instruktion fuer den Worker...",
  sessionId?: string,    // Optional: Ziel-Session fuer Push-Delivery
  sessionName?: string   // Alternative: Ziel-Session per Name
})
```

**Verhalten:**
1. Message wird wie bisher im Bus persistiert (Log bleibt erhalten)
2. Wenn `sessionId` oder `sessionName` angegeben:
   a. Session-Record nachschlagen (tmuxSession, tmuxPane, status)
   b. Pruefen ob Session `status === 'active'`
   c. `tmux send-keys -t <pane> "<text>" Enter` ausfuehren
   d. Response enthaelt `delivered: true/false` Flag
3. Wenn Session nicht aktiv oder Pane nicht erreichbar: `delivered: false` + Fehlerdetails

**Vorteile:**
- Einheitlicher Kommunikationskanal
- Messages bleiben im Bus-Log nachvollziehbar
- Orchestrator braucht keine tmux-Details mehr
- Bestehende Clients brechen nicht (sessionId ist optional)

### Option B: Polling-basiert (langfristig, komplexer)

Worker-Sessions koennten einen Background-Poller haben, der regelmaessig `mux_read` aufruft. Das ist aber deutlich komplexer:
- Braucht einen separaten Prozess/Thread pro Session
- Polling-Intervall ist ein Tradeoff (zu oft = Token-Verschwendung, zu selten = Latenz)
- Claude Code hat keinen nativen Background-Loop-Mechanismus

**Empfehlung:** Option A zuerst implementieren — loest das Problem sofort mit minimalem Aufwand.

### Option C: Hybrid (langfristig ideal)

Kombination aus A und B:
- Push-Delivery fuer sofortige Instruktionen (Option A)
- Optionaler Polling-Hook fuer Sessions, die asynchron auf Messages reagieren sollen
- Event-basierte Notifications via MCP-Resource-Subscriptions (falls MCP das unterstuetzt)

---

## Implementierungs-Details fuer Option A

### Aenderungen im MCP-Server

**1. `mux_send` Handler erweitern:**
```typescript
// Pseudo-Code
async function muxSend({ topic, sender, text, sessionId, sessionName }) {
  // 1. Message im Bus speichern (wie bisher)
  const msg = await bus.store({ topic, sender, text });

  // 2. Push-Delivery wenn Ziel angegeben
  if (sessionId || sessionName) {
    const session = sessionId
      ? await sessions.getById(sessionId)
      : await sessions.getByName(sessionName);

    if (!session) {
      return { ok: true, id: msg.id, delivered: false, error: "Session not found" };
    }
    if (session.status !== 'active') {
      return { ok: true, id: msg.id, delivered: false, error: "Session not active" };
    }

    try {
      await tmux.sendKeys(session.tmuxPane, text);
      return { ok: true, id: msg.id, delivered: true };
    } catch (e) {
      return { ok: true, id: msg.id, delivered: false, error: e.message };
    }
  }

  return { ok: true, id: msg.id };
}
```

**2. Readiness-Check vor Delivery:**
- Bevor `send-keys` ausgefuehrt wird: Pruefen ob die Claude-Session im Pane bereit ist (Prompt sichtbar)
- Falls nicht bereit: kurz warten (max 5s) und retry
- Das entschaerft die bekannte Race Condition (siehe Memory: `project_mux_race_condition.md`)

**3. Text-Escaping:**
- tmux send-keys braucht korrektes Escaping fuer Sonderzeichen
- Insbesondere: Quotes, Newlines, Semikolons
- Empfehlung: Base64-Encoding oder temporaere Datei fuer lange Messages

### Aenderungen im Tool-Schema

```json
{
  "name": "mux_send",
  "parameters": {
    "topic": { "type": "string", "required": true },
    "sender": { "type": "string", "required": true },
    "text": { "type": "string", "required": true },
    "sessionId": { "type": "string", "required": false },
    "sessionName": { "type": "string", "required": false }
  }
}
```

### Response-Format erweitert

```json
{
  "ok": true,
  "id": "message-id",
  "delivered": true,        // nur wenn sessionId/sessionName angegeben
  "deliveryError": null     // Fehlerdetails bei delivered: false
}
```

---

## Edge Cases

1. **Session existiert aber Claude ist nicht bereit** — Readiness-Check + Retry mit Timeout
2. **Sehr lange Messages** — tmux send-keys hat Limits bei langen Strings; fuer Messages >500 Zeichen: in temporaere Datei schreiben und Claude per send-keys anweisen, die Datei zu lesen
3. **Mehrere Sessions gleichzeitig adressieren** — Erstmal nicht unterstuetzt; Orchestrator kann mehrere mux_send Calls machen
4. **Session stirbt waehrend Delivery** — `delivered: false` zurueckgeben, Message bleibt im Bus

---

## Abgrenzung

Dieses Feature ersetzt NICHT:
- Das initiale Worker-Startup-Protokoll (Session erstellen, warten, CLAUDE.md laden)
- Die Bus-Persistenz (Messages bleiben auch ohne Delivery im Bus)
- mux_read (bleibt fuer Pull-basiertes Lesen bestehen)

Es ergaenzt den Bus um **aktive Zustellung** als Alternative zum manuellen `tmux send-keys`.

---

## Testplan

1. `mux_send` ohne sessionId — Verhalten unveraendert (Rueckwaertskompatibel)
2. `mux_send` mit gueltigem sessionId — Message im Bus UND per send-keys delivered
3. `mux_send` mit ungueltigem sessionId — `delivered: false`, Message trotzdem im Bus
4. `mux_send` mit sessionName statt sessionId — Lookup funktioniert
5. `mux_send` an inaktive Session — `delivered: false`
6. Lange Message (>500 Zeichen) — korrekt escaped/delivered
7. Race Condition: `mux_send` direkt nach `mux_create_session` — Readiness-Check greift
