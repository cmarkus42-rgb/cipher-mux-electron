# ISSUE — Projektlauncher ist eine Nullnummer

**Status:** offen
**Erfasst:** 2026-04-16
**Priorität:** hoch
**Betrifft:** Kickoff-Dialog (`Cmd+N`), `KickoffManager`, `_template/`

---

## Kurzbeschreibung

Der aktuelle Kickoff-Dialog in `cipher-mux-electron` legt zwar ein Verzeichnis an, Requirements-Datei rein und generiert eine minimale `CLAUDE.md` — aber er ist **keine** Umsetzung des Projektlauncher-Konzepts. Es fehlen die wichtigen Schritte, die das Launcher-Vorbild (`/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher`) und die erfolgreichen SDD-Projekte (z.B. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox`) ausmachen.

## Was aktuell passiert (`cipher-mux-electron`)

`KickoffDialog` → `KickoffManager.kickoff()`:

1. Projekt-Dir anlegen (oder existierendes nehmen — seit heute, 2026-04-16)
2. `docs/` anlegen
3. Requirements-Datei nach `docs/requirements.md` kopieren
4. Minimale `CLAUDE.md` generieren (statischer Phase-1-Stub)
5. SDD-Skills aus `.claude/skills/` des App-Bundles nach `<project>/.claude/skills/` kopieren

**Was fehlt:**

- Keine LLM-gestützte Analyse des Inputs (Freitext / Datei / URL / Kombination)
- Kein Rückfragen bei unvollständigem Input
- Kein Tech-Stack-Erkennen und keine stack-spezifischen Hooks
- Kein Kopieren eines reichen `_template/`-Verzeichnisses (nur ein Skelett)
- Kein Entwurf von `docs/requirements.md` basierend auf dem Input — es wird **nur kopiert**, nicht bearbeitet
- Kein `docs/SPEC.md`-Skelett mit erkennbaren Entscheidungspunkten
- Kein Git-Init
- Kein Ausgabe des "Next Steps"-Befehls (`cd … && claude` mit Phase-1-Prompt)
- **Settings-Hooks nicht stack-spezifisch:** `.claude/settings.json` hat keinen PostToolUse-Hook für Linter (ktlint / eslint / ruff / echo)

## Vorbild / Referenz-Implementierung

### `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/`

Funktioniert als eigenes Claude-Code-Verzeichnis, dem man einen Konzept-Input gibt. Claude (per `/launch`-Skill) macht:

1. **Input verstehen** (Freitext, Dateipfad, Miro-URL, Kombination)
2. **Projektname ableiten** (kebab-case)
3. **Tech-Stack erkennen** (Kotlin / TS / Python / …)
4. **`_template/` kopieren** nach `ClaudeCode01/{projektname}/`
5. **Platzhalter ersetzen:** `{{PROJEKTNAME}}`, `{{BESCHREIBUNG}}`, …
6. **Linter-Hook setzen:** je nach Stack ktlint / eslint / ruff / echo
7. **`docs/requirements.md` entwerfen** aus dem Input (nicht nur kopieren)
8. **`docs/SPEC.md` vorbereiten** mit erkannten Entscheidungspunkten als offene Checkboxen
9. **Git init + Initial Commit**
10. **"Next Steps" ausgeben:** exakter `cd`- und `claude`-Befehl mit Phase-1-Prompt

Das `_template/` enthält dort:

```
_template/
├── CLAUDE.md.template         (mit Platzhaltern)
├── .claude/
│   ├── settings.json          (mit Linter-Hook-Slot)
│   └── skills/
│       ├── interview/SKILL.md
│       ├── spec/SKILL.md
│       ├── decide/SKILL.md
│       ├── decompose/SKILL.md
│       ├── implement/SKILL.md
│       └── doc-review/SKILL.md
├── docs/
│   ├── SPEC.md                (Skelett, Entscheidungspunkte als Checkboxen)
│   ├── requirements.md        (Vorlage mit Struktur)
│   ├── todo.md
│   └── decisions/.gitkeep
└── .gitignore
```

### `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox/`

Beispiel eines Projekts, das **mit** diesem Launcher aufgesetzt wurde und in dem die Skills hervorragend funktioniert haben. Struktur:

- `CLAUDE.md` (mit konkreten Phase-Infos, Tech-Stack, ADR-Links)
- `docs/` mit SPEC / requirements / todo / decisions/ / issues/
- `.claude/` mit commands, settings.json, settings.local.json, skills, worktrees
- gradle-basierte Android-Build-Struktur (kommt vom User)

## Anforderung an die neue Lösung

Die Kickoff-Funktion in `cipher-mux-electron` muss das Launcher-Verhalten nativ abbilden — idealerweise so, dass der User in der App einen Input-Textbereich hat (Freitext / Dateipfad-Referenzen / Miro-URL) und nach dem Submit:

1. Eine Session startet, die den vorhandenen `projectlauncher` als Arbeitsverzeichnis nutzt **oder** eine adäquate Logik intern hat
2. Die 10 Schritte aus `projectlauncher/CLAUDE.md` durchführt (LLM-gestützt, also über Claude in dieser Session)
3. Nach Abschluss automatisch eine Session im neu erzeugten Projektverzeichnis öffnet — mit Phase-1-Prompt bereits eingelegt

### Optionen, die diskutiert werden müssen

- **Variante A (dünn):** Cmd+N öffnet Session in `projectlauncher/`, der User tippt seinen Input, Claude macht den Rest via `/launch`-Skill. Kickoff-Manager fällt weg. Minimal-invasiv.
- **Variante B (integriert):** Kickoff-Dialog wird Input-Bereich (Freitext + File-Refs), App kopiert `_template/` und ruft Claude headless auf mit `/launch`-Prompt. Mehr Engineering, bessere UX.
- **Variante C (hybrid):** Wie A, aber der Dialog hat einen Input-Editor statt Felder. Beim Submit startet eine Session in `projectlauncher/`, und der Input wird als Prompt eingefügt.

## Referenzen

- Launcher-Konzept: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/README.md`
- Launcher-Skill-Anweisung: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/CLAUDE.md`
- Launcher-Template: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/_template/`
- Gutes Beispielprojekt (mit Skills erfolgreich): `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox`
- Aktuelle Implementierung: `src/main/project/kickoff-manager.ts`, `src/renderer/components/KickoffDialog.tsx`

## Hinweise aus heutiger Session

- Kickoff legt Projekt an und startet Session (seit 2026-04-16) — aber das ist nur der Session-Start-Teil. Der inhaltliche Launcher-Teil fehlt komplett.
- Existierende Verzeichnisse werden akzeptiert (seit 2026-04-16): `docs/requirements.md` wird reingelegt, existierende `CLAUDE.md` bleibt unverändert.
- Scan-Pfade-Verwaltung und Scan-Tiefe sind jetzt im Info-Tab konfigurierbar — das ist unabhängig von diesem Issue.
