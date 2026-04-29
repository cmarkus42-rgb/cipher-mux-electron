---
title: "BUG: Copy & Paste im Notes-Editor funktioniert nicht"
tags:
  - bugreport
  - open
  - notes
scope: global
---

# BUG: Copy & Paste im Notes-Editor funktioniert nicht

## Beschreibung

Im Notes-Editor (Sidebar) funktioniert Copy & Paste nicht. Cmd+C / Cmd+V werden nicht korrekt verarbeitet.

## Warum relevant

User will Notes auch fuer Prompts, Snippets und andere Inhalte nutzen, die man reinkopieren oder rauskopieren will. Ohne Copy/Paste ist der Editor stark eingeschraenkt.

## Ort

Notes-Editor in der Sidebar (CodeMirror 6 Instanz)

## Vermutung

Kein CodeMirror-Problem — CM6 kann Copy/Paste out of the box. Vermutlich wird das Clipboard-Event irgendwo in der Electron-Integration geschluckt (globaler Keyboard-Handler oder fehlende webContents-Permission).

## Reproduzierbar

Ja

## Gemeldet

- Von: Christian via Companion Session
- Datum: 2026-04-28
