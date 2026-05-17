# Spec: Conditional Graceful Shutdown

## Problem

Sessions die nie benutzt wurden (kein User-Input, kein Greeting, keine MCP-Interaktion) bekommen trotzdem den vollen Graceful-Shutdown-Prompt. Beim Resume sind diese Sessions dann zugemuellt mit "Deine Session wird beendet..."-Text als einzigem Inhalt.

## Ziel

Graceful Shutdown nur ausfuehren, wenn die Session tatsaechlich Interaktionen hatte. Leere Sessions werden sofort hart gekillt — kein Prompt, kein Muell.

## Heuristik

**"Benutzt" = mindestens ein `sendKeys`-Aufruf auf diese Session.**

Das schliesst ein:
- startupGreeting (Entity wurde geweckt und hat gearbeitet)
- User-Input via UI
- MCP-Tool-Aufrufe die sendKeys nutzen (autoLaunch, pendingLaunch)
- Andere Sessions die via tmux send-keys kommunizieren

Das schliesst aus:
- Sessions die nur gestartet und nie angesprochen wurden

## Aenderungen

### 1. `src/shared/types.ts` — SessionInfo

Neues optionales Feld:

```ts
/** Number of sendKeys calls this session received. 0 = never used. */
interactionCount?: number
```

Default: `0` (bzw. `undefined`, behandelt als 0).

### 2. `src/main/session/session-manager.ts` — `sendKeys()`

Bei jedem Aufruf den Zaehler inkrementieren:

```ts
async sendKeys(sessionId: string, keys: string): Promise<void> {
  const session = this.sessions.get(sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)
  session.interactionCount = (session.interactionCount ?? 0) + 1
  const target = session.tmuxPane ?? session.tmuxSession
  await this.tmux.sendKeys(target, keys)
}
```

### 3. `src/main/session/session-manager.ts` — `gracefulStop()`

Vor dem Loeschen der Session den Zaehler auslesen und an `_backgroundGracefulKill` weitergeben:

```ts
async gracefulStop(sessionId: string, timeoutMs = 30_000): Promise<void> {
  const session = this.sessions.get(sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)

  const hadInteraction = (session.interactionCount ?? 0) > 0
  // ... bestehende Cleanup-Logik ...

  this._backgroundGracefulKill(tmuxName, timeoutMs, hadInteraction).catch(...)
}
```

### 4. `src/main/session/session-manager.ts` — `_backgroundGracefulKill()`

Neuer Parameter `hadInteraction`. Wenn `false`, Prompt ueberspringen:

```ts
private async _backgroundGracefulKill(
  tmuxName: string,
  timeoutMs: number,
  hadInteraction: boolean,
): Promise<void> {
  if (!hadInteraction) {
    console.log(`[SessionManager] Empty session "${tmuxName}", skipping graceful prompt`)
    try { await this.tmux.killSession(tmuxName) } catch { /* already gone */ }
    return
  }

  // ... bestehender Shutdown-Prompt + Poll-Logik ...
}
```

## Nicht betroffen

- `PersistedSession` / `session-store.ts` — `interactionCount` ist runtime-only, wird nicht persistiert.
- `PersistedGridState` — keine Aenderung.
- Recovery-Logik — recovered Sessions starten mit `interactionCount = 0`, was korrekt ist (bei Recovery weiss man nicht ob die alte Session benutzt war, aber das ist OK weil Recovery kein gracefulStop aufruft).

## Risiko

Niedrig. Einziger Edge-Case: eine Session die ausschliesslich ueber `mux_send` (Message Bus) kommuniziert hat, aber nie ueber `sendKeys`. Diese wuerde als "leer" gelten. Das ist akzeptabel — `mux_send` schreibt in den Message Bus, nicht in die Claude-Conversation, also gibt es nichts zu sichern.
