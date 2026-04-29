---
title: "BUG: MCP-Verbindung droppt spontan waehrend Session"
tags:
  - bugreport
  - open
  - mcp
scope: global
---

# BUG: MCP-Verbindung droppt spontan

## Beschreibung

Die MCP-Tools (mux_ui_highlight, mux_notes_create, etc.) verschwinden waehrend einer laufenden Session ohne erkennbaren Ausloeseer. Tools die vorher funktionierten sind ploetzlich nicht mehr verfuegbar ("No such tool available").

## Reproduzierbar

Ja — passiert in mehreren Sessions hintereinander (2026-04-28, mindestens 2x).

## Auswirkung

- Companion-Session wird unbrauchbar fuer alles was MCP-Tools braucht
- Tests der Demo-Mode-Tools koennen nicht durchgefuehrt werden
- Notes koennen nicht ueber MCP angelegt werden
- User muss App neustarten um Verbindung wiederherzustellen

## Kontext

- Kein offensichtlicher Trigger (User hat nichts in der App gemacht als die Verbindung starb)
- Betrifft alle cipher-mux MCP-Tools gleichzeitig, nicht einzelne

## Gemeldet

- Von: Christian via Companion Session
- Datum: 2026-04-28
