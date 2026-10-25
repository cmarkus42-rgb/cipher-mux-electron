# Pane-Proben

Echte `tmux capture-pane -p`-Ausschnitte, nur gelesen, nie gesendet.

- `opencode-2-idle.txt` — opencode 2 (TUI) an seiner Eingabe, nach einer Antwort.
  Gezogen am 2026-10-23 aus `cmux-local-factory-w759` (`| tail -40`).
- `opencode-2-idle-e.txt` — dieselbe Lage, aber so, wie der Mux sie liest: mit
  `-e` (Farbcodes). Gezogen am 2026-10-23 20:35 aus der laufenden
  `opencode-local-factory` (`capture-pane -p -e -J -S -15`). Hier sind `╹`/`▀▀`
  und `ctrl+p`/`commands` verschieden eingefärbt — die Probe zu T-LFH.7.
