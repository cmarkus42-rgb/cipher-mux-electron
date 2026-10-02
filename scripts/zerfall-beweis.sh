#!/bin/bash
# Nimmt im Moment eines sichtbaren Zerfalls beides gleichzeitig auf:
# was tmux hat, und was auf dem Bildschirm steht. Nur so laesst sich
# "falsch gezeichnet" von "falscher Inhalt im Puffer" trennen.
set -e
ZIEL="${1:-$HOME/Desktop/zerfall-$(date +%H%M%S)}"
mkdir -p "$ZIEL"
for s in $(tmux ls -F '#{session_name}' 2>/dev/null | grep '^cmux-'); do
  tmux capture-pane -t "$s" -p -e -J      > "$ZIEL/$s.ansi.txt" 2>/dev/null || true
  tmux capture-pane -t "$s" -p -J         > "$ZIEL/$s.text.txt" 2>/dev/null || true
  tmux display-message -p -t "$s" \
    'pane=#{pane_width}x#{pane_height} alt=#{alternate_on} hist=#{history_size} cmd=#{pane_current_command}' \
    > "$ZIEL/$s.meta.txt" 2>/dev/null || true
done
screencapture -x "$ZIEL/bildschirm.png"
echo "Beweis liegt in: $ZIEL"
ls "$ZIEL"
