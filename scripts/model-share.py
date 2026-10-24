#!/usr/bin/env python3
"""Modellanteile aus den Claude-Code-Session-JSONL (Messplan Modell-Routing, 2026-10-24).

Liest ~/.claude/projects/**/*.jsonl, zählt Tokens pro Modell getrennt nach
Hauptsessions und Subagenten (Dateien unter */subagents/*). Dedupliziert nach
message.id + requestId — Claude Code schreibt eine Antwort mit mehreren
Inhaltsblöcken als mehrere Zeilen mit derselben usage; ohne Deduplizierung
zählt man rund das Doppelte.

    python3 scripts/model-share.py            # letzte 7 Tage
    python3 scripts/model-share.py --days 30
    python3 scripts/model-share.py --since 2026-10-25

Gezählt werden input, output, cache_read und cache_creation. Zeitfenster über den
Zeitstempel jeder Zeile, nicht über das Datei-Datum.
"""
import argparse
import collections
import datetime as dt
import glob
import json
import os

KEYS = ('input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')


def family(model: str) -> str:
    for f in ('opus', 'sonnet', 'haiku', 'fable'):
        if f in model:
            return f
    return model


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=7)
    ap.add_argument('--since', help='YYYY-MM-DD, schlägt --days')
    args = ap.parse_args()
    since = (dt.datetime.fromisoformat(args.since).replace(tzinfo=dt.timezone.utc) if args.since
             else dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=args.days))

    totals = {'haupt': collections.Counter(), 'subagent': collections.Counter()}
    runs = collections.defaultdict(collections.Counter)
    base = os.path.expanduser('~/.claude/projects')
    for f in glob.glob(os.path.join(base, '**', '*.jsonl'), recursive=True):
        if os.path.getmtime(f) < since.timestamp():
            continue
        kind = 'subagent' if f'{os.sep}subagents{os.sep}' in f else 'haupt'
        seen = set()
        first = None
        with open(f, errors='ignore') as fh:
            for line in fh:
                if '"assistant"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                if d.get('type') != 'assistant':
                    continue
                ts = d.get('timestamp')
                if ts and dt.datetime.fromisoformat(ts.replace('Z', '+00:00')) < since:
                    continue
                msg = d.get('message') or {}
                model = msg.get('model')
                key = (msg.get('id'), d.get('requestId'))
                if not model or model == '<synthetic>' or key in seen:
                    continue
                seen.add(key)
                first = first or model
                usage = msg.get('usage') or {}
                totals[kind][family(model)] += sum(usage.get(k) or 0 for k in KEYS)
        if kind == 'subagent' and first:
            meta = f[:-6] + '.meta.json'
            agent_type = '?'
            if os.path.exists(meta):
                try:
                    agent_type = json.load(open(meta)).get('agentType', '?')
                except ValueError:
                    pass
            runs[agent_type][family(first)] += 1

    print(f'Seit {since:%Y-%m-%d %H:%M} UTC')
    grand = collections.Counter()
    for kind, c in totals.items():
        t = sum(c.values()) or 1
        grand.update(c)
        print(f'\n{kind:9s} {sum(c.values()) / 1e6:10.1f} Mio. Tokens')
        for m, v in c.most_common():
            print(f'  {m:10s} {100 * v / t:5.1f} %')
    g = sum(grand.values()) or 1
    print(f'\nOpus-Anteil gesamt: {100 * grand["opus"] / g:.1f} %')
    print('\nSubagent-Läufe nach Typ → Modell:')
    for t, c in sorted(runs.items(), key=lambda x: -sum(x[1].values())):
        print(f'  {t:24s} {dict(c)}')


if __name__ == '__main__':
    main()
