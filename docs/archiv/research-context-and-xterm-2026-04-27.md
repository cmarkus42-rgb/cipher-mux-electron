# Recherche: Context-Anzeige + xterm.js Rendering

Datum: 2026-04-27

---

## 1. Context-Nutzungsanzeige

### Wie Claude Code es macht

Claude Code bietet zwei eingebaute Mechanismen:

**StatusLine (stdin JSON)**
- Claude Code piped bei jedem Update ein JSON-Objekt an den StatusLine-Befehl via stdin
- Relevante Felder:
  - `context_window.used_percentage` (0-100)
  - `context_window.remaining_percentage` (0-100)
  - `model.display_name`
  - `rate_limits.five_hour.utilization` / `rate_limits.seven_day.utilization`
- Konfiguration in `~/.claude/settings.json` unter `statusLine.command`
- Doku: https://code.claude.com/docs/en/statusline

**Slash-Commands**
- `/context` — zeigt Token-Verbrauch pro Kategorie (System, Tools, MCP, Messages)
- `/usage` (alias `/cost`, `/stats`) — Session-Kosten und Plan-Limits

### Bekannte Bugs: used_percentage ist ungenau

**Das ist ein dokumentiertes, aktives Problem mit mehreren GitHub Issues:**

| Issue | Kern-Problem |
|---|---|
| [#34537](https://github.com/anthropics/claude-code/issues/34537) | used_percentage weicht signifikant von interner Auto-Compact-Berechnung ab |
| [#17959](https://github.com/anthropics/claude-code/issues/17959) | used_percentage stimmt nicht mit interner Context-Warning ueberein |
| [#28167](https://github.com/anthropics/claude-code/issues/28167) | Zaehlt nur Input-Tokens, "Context limit reached" bei ~20% |
| [#21651](https://github.com/anthropics/claude-code/issues/21651) | StatusLine-Prozent stimmt nicht mit UI-Prozent ueberein |
| [#8792](https://github.com/anthropics/claude-code/issues/8792) | UI zeigt 1% remaining, obwohl 45% verfuegbar |
| [#15005](https://github.com/anthropics/claude-code/issues/15005) | Context-Low-Warning bei 7%, obwohl 36% frei |

**Ursache:** `used_percentage` zaehlt nur User/Assistant-Message-Tokens. Es fehlen:
- System-Prompts
- CLAUDE.md-Inhalte
- Tool-Definitionen (MCP-Server, Built-in Tools)
- Plugin-Metadata
- Cache-Tokens (teilweise)

**Konkretes Beispiel aus Issue #34537:** StatusLine zeigt 78% Verbrauch, aber Auto-Compact-Warning sagt gleichzeitig "7% remaining" (= 93% real). Das ist eine Diskrepanz von ~15 Prozentpunkten.

**Fazit:** Die 14% vs 10% Diskrepanz in cipher-mux ist NICHT unser Bug — das ist ein upstream Problem in Claude Code selbst. Die StatusLine-Daten sind strukturell ungenau.

### Andere Multi-Session-Tools

**claude-squad** (https://github.com/smtg-ai/claude-squad)
- TUI fuer mehrere Claude Code / Codex / Amp Sessions
- Nutzt tmux + git worktrees
- Zeigt Session-Status, aber kein eigenes Context-Tracking sichtbar
- Konfiguration in `~/.claude-squad/config.json`

**amux** (https://github.com/mixpeek/amux)
- Open-Source Agent-Multiplexer, Python + tmux
- Web-Dashboard mit Live-Status und Token-Spend pro Session
- **Context-Tracking:** Parst ANSI-gestrippten tmux-Output, erkennt Zustaende (working, stuck, needs input, context low)
- **Self-Healing:** Wenn Context unter 20% faellt, sendet es automatisch `/compact`
- Alles in einer Datei (`amux-server.py`)
- Mobile PWA + iOS App

**Codeman** (https://github.com/Ark0N/Codeman)
- WebUI fuer 20+ parallele Sessions
- Per-Session Token- und Cost-Tracking
- Tab-basierte Navigation, tmux-backed

**dmux** (https://github.com/formkit/dmux)
- Lightweight: tmux pane + git worktree + Agent
- Kein eigenes Context-Tracking

**claude-tmux** (https://github.com/nielsgroen/claude-tmux)
- TUI fuer Claude Code in tmux
- Session-Lifecycle-Management, git worktree + PR Support

**claude-hud** (https://github.com/jarrodwatts/claude-hud)
- Claude Code Plugin fuer Context-Usage, aktive Tools, Todo-Progress
- Nutzt StatusLine-API

**Weitere Tracking-Tools (kein Mux, aber relevant):**
- ccusage (https://github.com/ryoppippi/ccusage) — CLI-Tool, analysiert lokale JSONL-Logs
- claude-usage (https://github.com/phuryn/claude-usage) — Dashboard fuer Token/Kosten/Sessions
- Claude-Code-Usage-Monitor (https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) — Realtime-Chart mit Predictions

### Empfehlung fuer cipher-mux

1. **Nicht auf `used_percentage` allein verlassen.** Der Wert ist dokumentiert ungenau (zaehlt System-Overhead nicht mit). Upstream-Fix ist offen aber nicht geloest.

2. **Mehrere Datenpunkte kombinieren:**
   - `context_window.used_percentage` aus StatusLine als Basis
   - `/context`-Output parsen fuer detailliertere Aufschluesselung (zeigt Tool-Definitionen, MCP-Overhead etc.)
   - Alternativ: Eigene Token-Zaehlung aus den lokalen JSONL-Logs (wie ccusage es macht)

3. **Amux-Ansatz als Inspiration:** ANSI-gestrippten Terminal-Output parsen und auf Context-Warnings reagieren. Das ist unabhaengig von der StatusLine-API und faengt den Moment ab, wenn Claude Code selbst "Context low" meldet.

4. **UI-seitig ehrlich sein:** Anzeige als "~X%" oder mit Disclaimer "geschaetzt" markieren, solange upstream nicht gefixt. Alternativ: Farbcodierung (gruen/gelb/rot) statt exakter Prozente — da ist +-5% weniger stoerend.

5. **Auto-Compact-Trigger:** Wie amux: bei niedrigem Context automatisch `/compact` senden. Das ist pragmatischer als exakte Messung.

---

## 2. xterm.js Terminal-Rendering

### Bekannte Probleme

**Grundsaetzlich: xterm.js + dynamische Container = bekannte Problemzone.**

Die relevanten Issues auf GitHub:

| Issue | Problem |
|---|---|
| [#3873](https://github.com/xtermjs/xterm.js/issues/3873) | FitAddon + tmux/vim in Electron: Resize geht nicht |
| [#622](https://github.com/xtermjs/xterm.js/issues/622) | Reflow bei Resize (Long-Standing Feature Request, mittlerweile implementiert) |
| [#1701](https://github.com/xtermjs/xterm.js/issues/1701) | Resize von links: Flickering + misplaced Characters |
| [#325](https://github.com/xtermjs/xterm.js/issues/325) | Data Loss bei Resize |
| [#1914](https://github.com/xtermjs/xterm.js/issues/1914) | Terminal Resize Roundtrip: Race Condition zwischen xterm.js und pty |
| [#3118](https://github.com/xtermjs/xterm.js/issues/3118) | fit() auf unsichtbarem Terminal wirft Error |
| [#4841](https://github.com/xtermjs/xterm.js/issues/4841) | FitAddon resizes incorrectly |
| [#3564](https://github.com/xtermjs/xterm.js/issues/3564) | FitAddon: Shrinking funktioniert nicht |
| [#2394](https://github.com/xtermjs/xterm.js/issues/2394) | fit() passt nicht zum Container |
| [#5299](https://github.com/xtermjs/xterm.js/discussions/5299) | FitAddon: Dimensionen stimmen nicht exakt mit Parent ueberein |

**Kern-Probleme die cipher-mux betreffen:**

1. **Zero-Size-Container:** Wenn `terminal.open()` oder `fit()` aufgerufen wird, bevor der Container sichtbare Dimensionen hat (z.B. Grid-Zelle noch nicht gerendert), resultiert das in falschen Dimensionen oder Errors. Das erklaert "Zeilen fallen auseinander beim Oeffnen".

2. **Race Condition tmux <-> xterm.js:** pty-Resize ist asynchron. Daten im Buffer wurden unter alten Dimensionen geschrieben. Wenn xterm.js die neuen Dimensionen setzt, bevor tmux reagiert hat, entstehen "Garbage Lines".

3. **Kein automatischer Reflow bei Container-Resize:** xterm.js reflowed Text nur wenn `terminal.resize(cols, rows)` explizit aufgerufen wird. Ein CSS-Resize des Containers allein bewirkt nichts.

4. **FitAddon misst falsch bei Flex/Grid:** Die Berechnung der verfuegbaren Pixel kann bei CSS Grid/Flexbox off sein, besonders bei Sub-Pixel-Werten.

### Best Practices

**1. ResizeObserver + Debounced fit()**
```
Standard-Pattern:
- ResizeObserver auf den Container
- Debounce 100-200ms
- fitAddon.fit() im Callback
- Nach fit(): tmux resize-Befehl mit neuen cols/rows senden
```
Das ist der De-facto-Standard in Electron-Terminal-Apps.

**2. Sichtbarkeits-Check vor fit()**
```
Niemals fit() aufrufen wenn:
- Container display:none
- Container width/height === 0
- Container nicht im DOM

Workaround: IntersectionObserver oder eigener Visibility-Check.
fit() erst aufrufen wenn Container tatsaechlich sichtbare Pixel hat.
```

**3. Reihenfolge bei Session-Attach**
```
1. Container im DOM mit korrekten Dimensionen sicherstellen
2. terminal.open(container)
3. requestAnimationFrame oder setTimeout(0) abwarten
4. fitAddon.fit()
5. tmux resize-pane -t <pane> -x <cols> -y <rows>
6. Optional: zweites fit() nach 100-200ms als Safety-Net
```

**4. tmux-Sync**
```
Nach jedem fit():
- Neue Dimensionen aus terminal.cols / terminal.rows lesen
- tmux resize-pane explizit aufrufen
- NICHT darauf verlassen dass tmux das SIGWINCH automatisch bekommt
```

**5. Reflow aktivieren**
- Reflow ist in xterm.js seit v4.x implementiert (PR #1864)
- Funktioniert nur mit dem TypedArray-Buffer (Standard seit v4)
- Performance: ~5-20ms fuer 1000 Zeilen Scrollback

**6. Double-Fit-Pattern (Workaround fuer Initialisierungsprobleme)**
```
Viele Electron-Terminal-Apps machen:
1. fit() sofort nach open()
2. fit() nochmal nach 50-100ms
Das faengt Timing-Probleme ab wo der erste fit() mit falschen Container-Dimensionen arbeitet.
```

### Wie andere Apps es loesen

**VS Code (integriertes Terminal)**
- Nutzt xterm.js direkt
- Eigene Resize-Logik mit debounced ResizeObserver
- Terminal-Panel hat feste Layout-Integration (kein dynamisches Grid)

**Hyper** (https://github.com/vercel/hyper)
- Electron + xterm.js
- Resize via window resize events + fit()
- Splitpane-Support mit manuellen Resize-Handlern

**Tabby** (https://github.com/Eugeny/tabby)
- Electron + xterm.js
- Eigener Resize-Manager der Container-Dimensionen ueberwacht
- Tab-basiert, kein dynamisches Grid-Layout

**Gemeinsam:** Keine dieser Apps hat ein dynamisches Grid-Layout wie cipher-mux. Das Grid-Problem ist spezifischer als ein normaler Tab/Split-Ansatz.

### Empfehlung fuer cipher-mux

1. **Visibility-Gate einbauen:** Kein `terminal.open()` und kein `fit()` solange der Grid-Container keine sichtbaren Dimensionen hat. ResizeObserver oder IntersectionObserver als Gate nutzen.

2. **ResizeObserver pro Grid-Zelle:** Jede Grid-Zelle braucht ihren eigenen ResizeObserver. Callback: debounced fit() mit 150ms Delay.

3. **Double-Fit bei Attach/Unhide:**
   ```
   Wenn Session in den Vordergrund kommt:
   1. Container-Dimensionen pruefen (> 0?)
   2. fitAddon.fit()
   3. requestAnimationFrame(() => fitAddon.fit())
   4. tmux resize-pane sync
   ```

4. **tmux-Resize explizit synchronisieren:** Nach jedem fit() die neuen cols/rows an tmux senden. Nicht auf automatische Propagation verlassen.

5. **Grid-Resize-Events korrekt behandeln:** Bei Grid-Layout-Aenderungen (Zelle wird groesser/kleiner):
   - Alle betroffenen Terminals identifizieren
   - Sequenziell (nicht parallel) resizen
   - Debounce auf Container-Ebene, nicht auf Window-Ebene

6. **"Doppelte Hoehe fixt es"-Symptom untersuchen:** Das deutet stark darauf hin, dass der initiale fit() mit falschen Container-Dimensionen arbeitet. Der Resize danach triggert einen korrekten fit(). Loesung: sicherstellen dass der Container beim ersten fit() bereits seine finale Groesse hat.

7. **Scrollback begrenzen:** Bei vielen parallelen Terminals den Scrollback pro Terminal begrenzen (z.B. 1000-2000 Zeilen). Reflow-Performance skaliert linear mit Scrollback-Groesse.

---

## Quellen

### Context-Anzeige

- [Claude Code StatusLine Docs](https://code.claude.com/docs/en/statusline)
- [StatusLine Complete Guide (Gist)](https://gist.github.com/AKCodez/ffb420ba6a7662b5c3dda2edce7783de)
- [Issue #34537: used_percentage significantly inaccurate](https://github.com/anthropics/claude-code/issues/34537)
- [Issue #17959: used_percentage doesn't match internal calculation](https://github.com/anthropics/claude-code/issues/17959)
- [Issue #28167: Only counts input tokens](https://github.com/anthropics/claude-code/issues/28167)
- [Issue #21651: StatusLine vs UI mismatch](https://github.com/anthropics/claude-code/issues/21651)
- [Issue #15005: Context low warning at 7% when 36% free](https://github.com/anthropics/claude-code/issues/15005)
- [Issue #27969: Expose context usage to hooks](https://github.com/anthropics/claude-code/issues/27969)
- [Claude Code Monitoring Docs](https://code.claude.com/docs/en/monitoring-usage)
- [Claude Blog: Session Management + 1M Context](https://claude.com/blog/using-claude-code-session-management-and-1m-context)

### Multi-Session-Tools

- [claude-squad](https://github.com/smtg-ai/claude-squad)
- [amux](https://github.com/mixpeek/amux) — besonders relevant: ANSI-Parsing + Auto-Compact
- [Codeman](https://github.com/Ark0N/Codeman)
- [dmux](https://github.com/formkit/dmux)
- [claude-tmux](https://github.com/nielsgroen/claude-tmux)
- [claude-hud](https://github.com/jarrodwatts/claude-hud)
- [ccusage](https://github.com/ryoppippi/ccusage)
- [claude-usage](https://github.com/phuryn/claude-usage)

### xterm.js

- [Issue #3873: FitAddon + tmux/vim in Electron](https://github.com/xtermjs/xterm.js/issues/3873)
- [Issue #622: Reflow on resize](https://github.com/xtermjs/xterm.js/issues/622)
- [Issue #1914: Resize roundtrip race condition](https://github.com/xtermjs/xterm.js/issues/1914)
- [Issue #3118: fit() on non-visible terminal](https://github.com/xtermjs/xterm.js/issues/3118)
- [Issue #4841: FitAddon resizes incorrectly](https://github.com/xtermjs/xterm.js/issues/4841)
- [Issue #3564: Shrinking doesn't work](https://github.com/xtermjs/xterm.js/issues/3564)
- [Issue #2394: fit() doesn't fit container](https://github.com/xtermjs/xterm.js/issues/2394)
- [Discussion #5299: FitAddon dimensions mismatch](https://github.com/xtermjs/xterm.js/discussions/5299)
- [Issue #1701: Resize flickering](https://github.com/xtermjs/xterm.js/issues/1701)
- [PR #1864: Reflow implementation](https://github.com/xtermjs/xterm.js/pull/1864)
- [xterm.js FitAddon npm](https://www.npmjs.com/package/@xterm/addon-fit)
