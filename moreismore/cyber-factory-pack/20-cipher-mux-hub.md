---
title: "CIPHER-MUX-Hub — neue Ordnerstruktur als Quelle der Wahrheit (Ebene 3)"
status: v0.1
date: 2026-04-30
ebene: 3
quelle: User-Anforderung 2026-04-30 spaet
referenz: 17-projekt-struktur.md, 19-bestehende-projekte-migration.md, 12-migration-rebuild.md
---

# 20 — CIPHER-MUX-Hub

## Zweck

Mit der Pack-Einfuehrung entsteht ein zentraler Hub unter `/Users/Shared/Nextcloud/Claude/CIPHER-MUX/`, der **die neue Quelle der Wahrheit** fuer alle cipher-mux-bezogene Arbeit wird. Bestehende Claude-Code-Projekte aus `/Users/Shared/Nextcloud/Claude/` und seinen Unterverzeichnissen werden komplett in diesen Hub kopiert (Variante B aus `19-bestehende-projekte-migration.md`). Originale bleiben am Originalort als Archiv, lauffaehig bis zum Freitesten der migrierten Welt.

## Grundsaetze

1. **Quelle der Wahrheit ist das Neue.** Migrierte Projekte unter `CIPHER-MUX/projects/<name>/` sind ab Migrations-Abschluss der primaere Arbeitsort.
2. **Originale bleiben unangetastet.** `/Users/Shared/Nextcloud/Claude/<urspruenglicher-pfad>/` wird nicht veraendert. Kein Verschieben, kein Loeschen.
3. **Fallback bis Freitesten.** Solange die migrierte Version eines Projekts nicht final getestet und freigegeben ist, bleibt das Original lauffaehig. User kann jederzeit zurueckwechseln.
4. **Komplett-Kopie pro Projekt** — keine Symlinks, keine Pfad-Verweise. Vermeidet Sync-Probleme und ermoeglicht klare Abnahme pro Projekt.
5. **Code-Projekte vs. Konzept-Verzeichnisse.** Nur dezidierte Claude-Code-Projektordner (Stack-Manifest + Code-Verzeichnis + `.git`) werden im Setup-Run automatisch migriert. Konzept-Verzeichnisse (Ideation-Templates, XPRESS-Konzeptarbeit etc.) bleiben am Originalort, ausser User pickt manuell.

## Hub-Struktur

```
/Users/Shared/Nextcloud/Claude/CIPHER-MUX/
├── CLAUDE.md                          # Hub-CLAUDE.md (jede Session, die hier arbeitet, liest sie)
├── ARCHIV-VERWEIS.md                  # Verweis auf Original-Pfade + Status pro Projekt
├── projects/                          # migrierte Code-Projekte (Komplett-Kopien)
│   ├── cipher-mux-electron/           # die App selbst, Pack-Wellen laufen hier
│   ├── cipher-mux/                    # v1, falls noch relevant
│   ├── cipher-desktop-electron/       # Referenz-Projekt
│   └── <weitere>/
├── workspaces/                        # cipher-mux Workspace-Konfigurationen (eine pro Projekt)
│   ├── ws-cipher-mux-electron.json
│   ├── ws-cipher-mux-v1.json
│   └── <weitere>.json
├── migrations/                        # Migrations-Plaene + Apply-Logs pro Projekt
│   └── <projekt-name>/
│       ├── inventory-<datum>.md
│       ├── migration-plan-<datum>.md
│       └── apply-log-<datum>.md
├── notes/                             # Hub-zentrale Notes (Symlink oder Direktverzeichnis)
│   └── *.md                           # Bug-Reports, Feature-Requests, Lessons Learned, Handover
└── concepts/                          # (optional) migrierte Konzept-Verzeichnisse, falls User pickt
    └── <projekt>/
```

`notes/` kann entweder ein eigenes Verzeichnis sein oder ein Symlink auf `~/.config/cipher-mux/notes/` — User-Entscheidung in Welle -1.

## Welle -1 — Hub-Skelett (vor Pack-Welle 0)

Aufgaben:

0. **Analyse-Phase (Pflicht, vor jeder Aenderung).**
   - Aktuelle Mux-Version aus `package.json` lesen und dokumentieren — Basis ist **0.9.9** (Stand 2026-04-30)
   - Test-Status erfassen: `npm run test` Original ausfuehren, gruene Tests-Anzahl dokumentieren (ca. 591 Tests aktuell)
   - Freigetestete Bereiche dokumentieren: Mux-Kern (tmux, Message Bus, MCP, IPC, Renderer-Grid) ist freigetestet; **Presets sind nicht freigetestet**
   - Output: `migrations/cipher-mux-electron/inventory-2026-MM-DD.md` mit Ist-Stand-Dokumentation
   - User-Klaerung: Inventur korrekt? Liste der nicht-freigetesteten Bereiche (Presets) bestaetigt?

1. **0.9.9-Basis-Tag setzen** im Original-Repo (vor jeder Hub-Aktion):
   ```bash
   cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
   git tag v0.9.9-getestet
   ```
   Dieser Tag markiert den freigetesteten Stand und ist Fallback-Anker.

2. **`CIPHER-MUX/`-Verzeichnis anlegen.** Pflicht-Unterordner: `projects/`, `workspaces/`, `migrations/`. Optional: `notes/`, `concepts/`.

3. **Hub-CLAUDE.md schreiben** (siehe naechster Abschnitt).

4. **`ARCHIV-VERWEIS.md` schreiben** mit Liste der erkannten Originale + Pack-Light-/Voll-Adoption-Status (initial leer, wird waehrend Welle 4 gefuellt).

5. **cipher-mux-electron als erstes Projekt migrieren.** Komplett-Kopie nach `CIPHER-MUX/projects/cipher-mux-electron/`. Alle Pack-Wellen 0-6 laufen ab da **dort**, nicht mehr im Original-Pfad. Original bleibt unveraendert als Fallback.

6. **Workspace-Konfig fuer cipher-mux-electron anlegen** unter `CIPHER-MUX/workspaces/ws-cipher-mux-electron.json` mit `projectPath` auf die migrierte Version.

7. **`.project-meta.json`** im migrierten cipher-mux-electron mit `lifecycle_phase: 'pack-implementation'`, `archived_origin: '/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron'`, `base_version: '0.9.9'`, `freigetestete_bereiche: ['kern', 'tmux', 'mcp', 'ipc', 'renderer-grid']`, `nicht_freigetestet: ['presets']`.

8. **Git-Tag im migrierten Repo** setzen: `v0.9.9-pre-pack-cyber-factory` (markiert den Hub-Migrations-Punkt).

**Akzeptanz-Kriterien Welle -1:**
- Analyse-Inventur dokumentiert in `migrations/cipher-mux-electron/inventory-<datum>.md`
- 0.9.9-Tag im Original-Repo gesetzt
- `CIPHER-MUX/`-Skelett existiert
- Hub-CLAUDE.md ist da
- cipher-mux-electron ist 1:1 kopiert (Diff-Check: 0 Unterschiede)
- Build laeuft im migrierten Verzeichnis (`npm install && npm run build` gruen)
- Tests laufen im migrierten Verzeichnis (`npm run test` gruen, gleiche Anzahl wie im Original)
- Workspace-Konfig zeigt auf migrierte Version
- Original bleibt unveraendert (Mtime + 0.9.9-Tag bleibt erhalten)

**Aufwand:** 1-2 Tage. Hauptzeit: Build + Tests im migrierten Verzeichnis verifizieren plus Inventur-Dokumentation.

## Welle 4 — Voll-Migration anderer Code-Projekte

Nach Welle 4 sind die Brownfield-Migrations-Tools (`mux_brownfield_*`) implementiert. Damit kann der Setup-Run die anderen Code-Projekte verarbeiten.

Aufgaben:

1. **Brownfield-Auto-Detection** auf `/Users/Shared/Nextcloud/Claude/`. Filter: Stack-Manifest + Code-Verzeichnis + `.git`. Konzept-Verzeichnisse werden ausgegraut, nicht in Auto-Liste.

2. **User-Pick** aus der Liste:
   - Vorgeschlagen: alle erkannten Code-Projekte
   - Optional manuell: Konzept-Verzeichnisse (Ideation-Templates etc.) — ausgegraut, User pickt explizit
   - Default-Modus pro Projekt: **Voll-Adoption** (passt zu "Quelle der Wahrheit ist das Neue")
   - Per-Projekt-Override: Pack-Light (nur ausgewaehlte Pack-Komponenten) oder Skip

3. **Pro gewaehltem Projekt:**
   - Komplett-Kopie nach `CIPHER-MUX/projects/<name>/`
   - Brownfield-Inventur durchlaufen (`mux_brownfield_inventory`)
   - Migrations-Plan generieren (`mux_brownfield_migration_plan`)
   - User bestaetigt Plan
   - Apply (`mux_brownfield_apply`)
   - Workspace-Konfig anlegen unter `CIPHER-MUX/workspaces/ws-<name>.json`
   - `.project-meta.json` mit `archived_origin`-Verweis schreiben
   - Eintrag in `CIPHER-MUX/ARCHIV-VERWEIS.md` ergaenzen mit Status

4. **Build/Test-Verifikation** pro migriertem Projekt — Original-Build-Befehle laufen lassen, Tests gruen muessen sein.

5. **Freigabe pro Projekt** — User markiert in `ARCHIV-VERWEIS.md` "freigegeben fuer Hub-Nutzung". Ab dann ist das migrierte das primaere, Original bleibt als Backup.

**Akzeptanz-Kriterien Welle 4 (Hub-Anteil):**
- Alle vom User gewaehlten Code-Projekte sind in `CIPHER-MUX/projects/` migriert
- Pro Projekt: Inventur, Migrations-Plan, Apply-Log dokumentiert
- Pro Projekt: Build + Tests im migrierten Verzeichnis gruen
- `ARCHIV-VERWEIS.md` aktualisiert mit Status pro Projekt
- Workspaces in cipher-mux-App alle aktivierbar

## Hub-CLAUDE.md (Inhalt)

Die `CIPHER-MUX/CLAUDE.md` primt jede Session, die im Hub arbeitet:

```markdown
# CIPHER-MUX-Hub — Verzeichnis-CLAUDE.md

> Wenn du in diesem Verzeichnis arbeitest, lies diese Datei zuerst.

## Was das ist

Der CIPHER-MUX-Hub ist die zentrale Anlaufstelle fuer alle cipher-mux-bezogene Arbeit.
Alle migrierten Claude-Code-Projekte liegen unter `projects/`, Workspace-Konfigs unter
`workspaces/`, Migrations-Logs unter `migrations/`. Der Hub ist die neue Quelle der
Wahrheit — Originale unter `/Users/Shared/Nextcloud/Claude/...` bleiben als Archiv und
Fallback bis zum Freitesten.

## Konventionen

- Alle Code-Arbeit findet im migrierten Verzeichnis unter `projects/<name>/` statt
- `archived_origin`-Feld in `.project-meta.json` zeigt auf Original-Pfad
- Bei Konflikt zwischen Hub-Version und Original-Version: Hub gewinnt, Original wird
  nicht angefasst
- Workspace-Aktivierung in cipher-mux-App setzt `projectPath` auf Hub-Version

## Sicherheitsregeln

**Mux-Eingriffe (uebergeordnet):**

- Basis ist freigetestete Mux-Version **0.9.9** (Stand 2026-04-30, Presets ausgenommen)
- Vor jedem Pack-Welle-Eingriff in Mux-Code: Ist-Code lesen, Plan mit User abstimmen
- Pack-Spec ist nicht autoritativ gegen den freigetesteten Mux — bei Konflikt
  wird Pack-Spec angepasst, nicht der Mux verbogen
- Detail in `projects/cipher-mux-electron/moreismore/cyber-factory-pack/02-base-rules.md`
  Punkt 13

**Hub-spezifisch:**

- Niemals Original-Pfade ueberschreiben (Fallback-Garantie)
- Original-Repo unter `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
  bleibt unveraendert. Git-Tag `v0.9.9-getestet` ist dort gesetzt und bleibt
- Bei Hub-Setup-Konflikten (z.B. Build-Fehler im migrierten Verzeichnis): User
  eskalieren, Original-Pfad als Fallback markieren, Hub-Version als "nicht-freigegeben"
- Nicht-Code-Verzeichnisse (Ideation-Templates, Konzept-Arbeiten) bleiben unter
  `/Users/Shared/Nextcloud/Claude/...`, ausser User pickt sie explizit fuer Hub

## Pflichtlektuere

1. Diese CLAUDE.md
2. `projects/cipher-mux-electron/moreismore/cyber-factory-pack/00-INDEX.md`
3. `projects/cipher-mux-electron/moreismore/cyber-factory-pack/CLAUDE.md` (Pack-Konventionen)
4. `ARCHIV-VERWEIS.md` (Status pro Projekt)

## Persona-Default fuer Hub-Sessions

- Setup-/Verwaltungs-Arbeit: Sokrates oder Cipher
- Code-Arbeit in `projects/<name>/`: gemaess Workspace-Persona-Konfig
```

## ARCHIV-VERWEIS.md (Inhalt)

```markdown
# Archiv-Verweis: Original-Pfade und Migrations-Status

Dieser Hub spiegelt Claude-Code-Projekte aus `/Users/Shared/Nextcloud/Claude/` und
Unterverzeichnissen. Originale bleiben unveraendert; Hub-Versionen sind die neue
Quelle der Wahrheit ab Freigabe pro Projekt.

## Migrations-Status

| Projekt | Original-Pfad | Hub-Pfad | Status | Freigabe-Datum |
|---------|---------------|----------|--------|----------------|
| cipher-mux-electron | /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron | projects/cipher-mux-electron | freigegeben | 2026-MM-DD |
| cipher-mux | /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux | nicht-migriert | offen | — |
| <weitere> | ... | ... | ... | ... |

## Status-Werte

- `nicht-migriert` — Original existiert, Hub leer
- `kopiert` — Hub hat Kopie, aber noch nicht inventarisiert/migriert
- `migriert-nicht-getestet` — Migration durchgelaufen, Build/Tests stehen aus
- `migriert-getestet` — Build + Tests gruen, User-Freigabe steht aus
- `freigegeben` — User-Freigabe erteilt, Hub ist primaer
- `parallel-betrieben` — User nutzt beide Versionen gleichzeitig (Spezialfall)

## Fallback

Bei Problemen mit Hub-Version: Original-Pfad bleibt lauffaehig. User kann zurueckwechseln,
indem er Workspace-Konfig auf Original-Pfad zeigen laesst (oder cipher-mux ohne Workspace
startet und manuell im Original-Pfad arbeitet).
```

## Konzept-Verzeichnisse (nicht im Auto-Setup-Run)

Diese werden **nicht** automatisch migriert, weil sie keine dezidierten Code-Projekte sind:

- `ideation MultiSessionCoding/` — Ideation-Template (Konzept-Arbeit)
- `WebsiteDesigner/` — XPRESS-Konzeptarbeit
- `mux_community/`, `wissenstransfer-ideation/` — Konzept-Verzeichnisse
- `pebblebeach/` Inhalte — Obsidian-Vault-Material

Wenn der User einzelne dieser Verzeichnisse trotzdem migrieren will: manueller Pick im Setup-Run, eigener Modus "Konzept-Adoption" (kein RE-Audit, kein Subsystem-Schnitt — nur Komplett-Kopie + Workspace-Konfig + Tag-System).

## ConfigStore-Keys

```typescript
interface CipherMuxHubConfig {
  hubPath: string;                     // Default '/Users/Shared/Nextcloud/Claude/CIPHER-MUX'
  archiveSourcePaths: string[];        // Default ['/Users/Shared/Nextcloud/Claude/']
  defaultMigrationMode: 'voll-adoption' | 'pack-light' | 'bestandsaufnahme'; // Default 'voll-adoption'
  copyOriginal: boolean;               // Default true (Variante B)
  preserveOriginal: boolean;           // Default true (Original-Schutz)
  notesLinkMode: 'symlink' | 'direct'; // Default 'symlink' auf ~/.config/cipher-mux/notes/
}
```

ConfigStore-Sektion: `cipher_mux_hub`.

## MCP-Tools

| Tool | Status | Zweck |
|------|--------|-------|
| `mux_hub_init` | **Neu** | Hub-Skelett anlegen (Welle -1 Aufgabe 1) |
| `mux_hub_migrate_project` | **Neu** | Einzelnes Projekt nach Hub kopieren + migrieren |
| `mux_hub_status` | **Neu** | Liste aller Projekte mit Status (aus ARCHIV-VERWEIS.md) |
| `mux_hub_release` | **Neu** | Projekt-Freigabe-Markierung setzen |
| `mux_hub_rollback` | **Neu** | Workspace zurueck auf Original-Pfad zeigen lassen (Fallback) |

## Tests

1. *Hub-Init Idempotenz:* zweimal `mux_hub_init` → keine Datei wird ueberschrieben, ARCHIV-VERWEIS.md unveraendert
2. *Komplett-Kopie:* `mux_hub_migrate_project` → Diff zwischen Original und Hub-Kopie ist 0 (vor Migration), gleiche Datei-Anzahl, gleiche Sizes
3. *Original-Schutz:* nach Migration → Original-Mtime unveraendert
4. *Build im Hub:* `npm install && npm run build` im migrierten cipher-mux-electron → gruen
5. *Tests im Hub:* `npm run test` im migrierten Verzeichnis → gruen
6. *Status-Update:* nach Apply → ARCHIV-VERWEIS.md zeigt korrekten Status
7. *Fallback:* `mux_hub_rollback` → Workspace-Konfig zeigt wieder auf Original-Pfad
8. *Konzept-Filter:* Brownfield-Auto-Detection auf `/Users/Shared/Nextcloud/Claude/` → `ideation MultiSessionCoding/` ist nicht in Vorschlags-Liste (nur Code-Projekte)

## Aufwands-Schaetzung

- **Welle -1 (Hub-Skelett + cipher-mux-electron):** 1-2 Tage. Hauptzeit Build/Test-Verifikation.
- **Welle 4 (andere Code-Projekte):** je nach Projekt-Anzahl. Pro Projekt ~2-4 Stunden (Inventur, Migrations-Plan-Review, Apply, Build/Test).

Bei 5-6 Code-Projekten zusaetzlich zu cipher-mux-electron: 2-3 Welle-4-Tage zusaetzlich.

## Offene Punkte

- *Speicher-Bedarf.* Komplett-Kopie aller Code-Projekte braucht Platz. cipher-mux-electron allein ist mit `node_modules/` mehrere GB. `node_modules/`/`dist/`/`.git/` sind potenzielle Ausschluss-Kandidaten — koennen nach Migration im Hub-Verzeichnis neu generiert werden (`npm install`). Empfehlung: Migrations-Skript hat `--exclude-build-artifacts`-Modus, dann werden im Hub frische `node_modules` installiert.
- *Cross-Projekt-Referenzen.* Wenn ein Projekt auf relative Pfade ausserhalb seines Roots referenziert (z.B. `../shared/lib/`), brechen die nach Migration. Vor Migration pruefen, dann ggf. Aliase oder Kopien.
- *Original-Schutz-Garantie technisch.* Read-only-Markierung der Originale waere robust — aber dann kann der User nichts mehr daran aendern. Empfehlung: User-Hinweis "fasse Original nicht an", aber keine technische Sperre.
- *Cleanup nach Freigabe.* Wenn alle Hub-Versionen freigegeben sind: kann das Original irgendwann weg? Empfehlung: nicht im Setup-Run, eigene Folge-Aufgabe nach z.B. 3 Monaten Bewaehrung. User-Entscheidung.
