# Recherche: Notes-Management bei 100-500 Notes

**Datum:** 2026-04-27
**Kontext:** cipher-mux-electron Notes-System (Markdown + YAML-Frontmatter in `~/.config/cipher-mux/notes/`). Aktuell flache Liste mit Suchfeld und Tags. Ziel: brauchbare Organisation bei 100-500 Notes.

---

## 1. Referenz-Apps: Wie loesen andere das Problem?

### Notable (Electron, Markdown + YAML-Frontmatter)

- **Architektur:** Exakt unser Stack — plain Markdown-Dateien mit YAML-Frontmatter fuer Metadaten.
- **Organisation:** Ausschliesslich Tag-basiert, KEINE Ordner. Tags sind beliebig tief verschachtelbar (`project/trading/ui`).
- **Navigation:** Sidebar zeigt Tag-Baum. Klick auf Tag filtert die Notizliste. Multi-Tag-Filter moeglich.
- **Erkenntnis:** Beweist, dass Tag-only ohne Ordner funktionieren kann — aber nur mit gutem Tag-Browser und schneller Suche. Bei 100+ Notes ohne Tag-Disziplin wird es unuebersichtlich.

### Joplin (Electron, SQLite-Backend)

- **Architektur:** Notes in SQLite (nicht als Dateien), UUIDs als Identifier.
- **Organisation:** Hierarchische Notebooks (Ordner + Unterordner) UND Tags parallel.
- **Navigation:** Drei-Spalten-Layout: Notebook-Baum | Notizliste | Editor.
- **Schwaeche:** Default-Sidebar hat keinen unified Tree View — Community-Plugin "Joplin Explorer" loest das mit einem kombinierten Baum (Notebooks + Notes in einem Tree).
- **Erkenntnis:** Die Kombination Ordner + Tags ist der Goldstandard fuer skalierbare Organisation. Aber: Joplin braucht Plugins, um es richtig gut zu machen.

### Obsidian (nicht Electron, aber relevantes UX-Vorbild)

- **Organisation:** Ordner-basiert (echte Dateisystem-Ordner) + Tags + Backlinks.
- **Navigation:** File Explorer in der Sidebar (Baum-View), plus separater Tag-Pane.
- **Community-Loesung "Notebook Navigator":** Ersetzt Default-Explorer durch Dual-Pane: Ordner/Tag-Baum links, Dateiliste mit Preview rechts. Pinned Notes oben, Keyboard-Navigation, Drag-and-Drop.
- **Erkenntnis:** Dual-Pane (Tree + Liste) ist das Pattern das bei Power-Usern am besten ankommt. Quick-Filter ueber dem Baum reduziert Scroll-Aufwand.

### Simplenote

- **Organisation:** Tags statt Ordner. Global Search. Sorting.
- **Erkenntnis:** Minimalistischer Ansatz — funktioniert bei 50 Notes, kollabiert bei 200+.

---

## 2. UI-Patterns fuer Sidebar mit begrenztem Platz

### Pattern A: Ordner-/Tag-Baum (Tree View)

```
[Suchfeld________________________] [+]
v Projekte
  v Trading Dashboard
    - API-Design-Notes
    - Backtesting-Ergebnisse
  > Cipher-MUX
v Bugs
  - Sidebar-Scroll-Bug
  - Theme-Wechsel-Flicker
> Archiv (23)
```

**Vorteile:**
- Vertrautes Mental Model (Dateisystem, VS Code, Obsidian)
- Schnelle visuelle Orientierung durch Hierarchie
- Collapse/Expand reduziert Informations-Overload

**Nachteile:**
- Braucht Ordner-Verwaltung (erstellen, umbenennen, verschieben)
- Eine Note kann nur in einem Ordner sein (ohne Symlinks/Aliase)

### Pattern B: Tag-Filter + flache Liste

```
[Suchfeld________________________]
Tags: [bugreport x] [open x]     <- aktive Filter als Chips
---
Alle (147) | Bugs (23) | Features (18) | ...
---
- BUG: Sidebar-Scroll         vor 2h
- BUG: Theme-Flicker          vor 1d
- FEATURE: Grid-Presets        vor 3d
```

**Vorteile:**
- Keine Ordner-Verwaltung noetig
- Eine Note kann mehrere Tags haben (flexible Zuordnung)
- Kompakt, wenig UI-Overhead

**Nachteile:**
- Wird bei 20+ Tags unuebersichtlich ohne Gruppierung
- Kein raeumliches Mental Model ("wo liegt meine Note?")

### Pattern C: Hybrid (Empfehlung)

```
[Suchfeld________________________] [+]
[bugreport x] [open x]            <- aktive Tag-Filter
---
v Pinned (3)                       <- gepinnte Notes oben
  - Projekt-Uebersicht
  - Aktuelle Todos
v Zuletzt bearbeitet               <- Smart-Ordner
  - BUG: Sidebar-Scroll    2h
  - Design-Notizen          1d
v Tags                             <- aufklappbarer Tag-Baum
  v bugreport (23)
    v open (12)
    > resolved (11)
  v feature-request (18)
  > meeting-notes (7)
```

**Warum Hybrid:**
- Pinned Notes geben schnellen Zugriff auf wichtige Dokumente
- Smart-Ordner (zuletzt bearbeitet, heute erstellt) reduzieren Suche
- Tag-Baum erlaubt hierarchische Navigation ohne echte Ordner
- Suchfeld + Tag-Chips fuer gezielten Zugriff
- Kein Ordner-Management noetig — Tags reichen, da unsere Notes schon YAML-Frontmatter haben

---

## 3. React-Komponenten und Libraries

### Empfehlung 1: react-arborist (Top-Pick fuer Tree View)

- **GitHub:** github.com/brimdata/react-arborist
- **Was es kann:** Kompletter Tree View a la VS Code Sidebar. Drag-and-Drop, Inline-Rename, Multi-Select, Keyboard-Navigation.
- **Virtualisierung:** Eingebaut. Rendert nur sichtbare Nodes — performant bei 10.000+ Nodes.
- **Such-/Filter-API:** `searchTerm` Prop filtert den Baum automatisch. Eltern-Nodes bleiben sichtbar wenn Kinder matchen.
- **Callbacks:** `onCreate`, `onRename`, `onMove`, `onDelete` — passt exakt auf unser Notes-CRUD.
- **Bundle Size:** Mittel (~30kB). Gut fuer Electron, wo Bundle Size weniger kritisch ist.
- **Bewertung:** Beste Balance aus Features und Anpassbarkeit. Out-of-the-box fast alles was wir brauchen.

### Empfehlung 2: @headless-tree/react (Lightweight Alternative)

- **GitHub:** github.com/lukasbach/headless-tree
- **Was es kann:** Reine Logik (State, Keyboard-Nav, Drag-and-Drop, Suche, Rename). KEIN Markup/CSS — volle Kontrolle ueber Rendering.
- **Virtualisierung:** Nicht eingebaut, aber designed fuer Integration mit TanStack Virtual oder react-window.
- **Bundle Size:** 9.5kB + 0.4kB React-Bindings. Extrem leicht.
- **Bewertung:** Perfekt wenn wir eigenes Styling brauchen und die bestehende Sidebar-Aesthetik beibehalten wollen. Mehr Arbeit, mehr Kontrolle.

### Empfehlung 3: TanStack Virtual (fuer flache Listen / Performance)

- **URL:** tanstack.com/virtual/latest
- **Was es kann:** Headless Virtual-Scrolling. Rendert nur sichtbare Items. 60fps bei Tausenden von Elementen.
- **Integration:** `useVirtualizer` Hook. Framework-agnostisch. Perfekt kombinierbar mit headless-tree.
- **Bewertung:** Wenn wir beim Flat-List-Ansatz bleiben (Pattern B), ist das die Performance-Loesung. Auch als Ergaenzung zu headless-tree nutzbar.

### Weitere Libraries (erwaehnenswert)

| Library | Typ | Bundle | Virtualisierung | Bemerkung |
|---|---|---|---|---|
| MUI Tree View | Opinionated | Gross (MUI-Abhaengigkeit) | Nein | Nur sinnvoll wenn schon MUI im Projekt |
| react-complex-tree | Headless-ish | Mittel | Teilweise | Vorgaenger von headless-tree, noch maintained |
| magicui/file-tree | Styled Component | Klein | Nein | Huebsch, aber wenig Features |

---

## 4. Virtual Scrolling: Wann brauchen wir es?

| Notes-Anzahl | DOM-Nodes (flache Liste) | Spuerbare Verzoegerung? | Virtualisierung noetig? |
|---|---|---|---|
| < 100 | ~100-200 | Nein | Nein |
| 100-300 | ~200-600 | Minimal | Nice-to-have |
| 300-500 | ~600-1000 | Ja, beim Scrollen | Empfohlen |
| 500+ | ~1000+ | Deutlich | Pflicht |

**Fazit:** Bei unserem Zielbereich (100-500) ist Virtualisierung kein Day-1-Must, aber sollte von Anfang an eingeplant werden. react-arborist hat sie eingebaut. Bei headless-tree + TanStack Virtual ist sie trivial nachzuruesten.

---

## 5. Minimum Viable Feature (MVP)

### Phase 1: Sofort umsetzbar (Low Effort, High Impact)

1. **Sortierung:** Zuletzt bearbeitet als Default (statt alphabetisch oder Erstelldatum)
2. **Tag-Filter-Chips:** Klick auf einen Tag in der Liste fuegt ihn als aktiven Filter hinzu. Mehrfach-Selektion moeglich. Aktive Filter als entfernbare Chips ueber der Liste.
3. **Pinned Notes:** Ein Pin-Icon pro Note. Gepinnte Notes erscheinen immer oben, unabhaengig von Sortierung/Filter. Persistent in Frontmatter (`pinned: true`).
4. **Gruppierte Tag-Sidebar:** Tags nicht als flache Liste, sondern als aufklappbaren Baum anzeigen (z.B. `bugreport/open`, `bugreport/resolved` als Hierarchie).

**Geschaetzter Aufwand:** 2-3 Tage fuer alle vier Punkte.

### Phase 2: Tree View (Medium Effort)

5. **Vollstaendiger Tree View** mit react-arborist oder headless-tree:
   - Tag-Hierarchie als Baum
   - Smart-Ordner (Zuletzt bearbeitet, Heute erstellt, Untagged)
   - Inline-Suche filtert den Baum
   - Keyboard-Navigation (Pfeiltasten, Enter zum Oeffnen)

**Geschaetzter Aufwand:** 3-5 Tage.

### Phase 3: Power-Features (Nice-to-have)

6. **Drag-and-Drop:** Notes zwischen Tags verschieben
7. **Bulk-Operations:** Mehrere Notes selektieren, Tags aendern
8. **Saved Searches / Smart-Ordner:** Persistente Filter-Kombinationen als virtuelle Ordner
9. **Note-Preview on Hover:** Erste 2-3 Zeilen der Note als Tooltip

---

## 6. Architektur-Empfehlung

### Kein echtes Ordner-System einfuehren

Unser Notes-System nutzt bereits YAML-Frontmatter mit Tags. Ordner im Dateisystem wuerden bedeuten:
- Dateien verschieben bei Reorg
- Pfad-Referenzen brechen
- MCP-Tools muessen Unterverzeichnisse durchsuchen
- Komplexitaet ohne proportionalen Mehrwert

**Stattdessen:** Virtuelle Ordner auf Basis von Tags. Der Tag `bugreport/open` erzeugt im Tree automatisch die Hierarchie `bugreport > open`. Im Dateisystem bleibt alles flach in `~/.config/cipher-mux/notes/`.

### Datenfluss

```
Dateisystem (flach)              UI (hierarchisch)
notes/                           v Pinned
  abc123.md                        - Projekt-Uebersicht
  def456.md          ------>     v bugreport
  ghi789.md          parse         v open
  ...                frontmatter     - Sidebar-Bug
                     + tags          - Theme-Flicker
                                   v feature-request
                                     - Grid-Presets
```

### Index/Cache

Bei 500 Notes dauert das Parsen aller YAML-Frontmatter-Bloecke ca. 50-200ms (abhaengig von Dateigroesse). Optionen:
- **Lazy:** Beim Start einmal alle Frontmatter parsen, im Memory halten. Reicht bis 500.
- **Cache:** JSON-Index-Datei (`notes-index.json`) die beim Start geladen und bei Aenderungen aktualisiert wird. Sinnvoll ab 500+.
- **Watcher:** `fs.watch` auf das Notes-Verzeichnis, um Aenderungen von aussen (MCP-Tools, andere Sessions) mitzubekommen.

---

## 7. Zusammenfassung

| Frage | Antwort |
|---|---|
| MVP fuer 100-500 Notes? | Sortierung + Tag-Filter-Chips + Pinned Notes + gruppierter Tag-Baum |
| Bestes UI-Pattern fuer Sidebar? | Hybrid: Suchfeld + Tag-Chips + Tree View (Pinned, Smart-Ordner, Tag-Hierarchie) |
| Beste React-Library? | **react-arborist** (Features + Virtualisierung) oder **headless-tree** (Kontrolle + lightweight) |
| Virtualisierung noetig? | Ab 300 Notes empfohlen. react-arborist hat es eingebaut. |
| Echte Ordner einfuehren? | Nein. Virtuelle Ordner via Tags. Dateisystem bleibt flach. |
| Vorbild-App? | Notable (gleiches Datenmodell), Obsidian Notebook Navigator (bestes UX-Pattern) |

---

## Quellen

- [Notable — The Markdown-based note-taking app that doesn't suck](https://notable.app/)
- [Joplin Architecture](https://joplinapp.org/help/dev/spec/architecture/)
- [Joplin Forum: Tree View / Notebooks / Folders / Notes](https://discourse.joplinapp.org/t/tree-view-notebooks-folders-notes/49571)
- [Joplin Explorer Plugin](https://joplinapp.org/plugins/plugin/com.github.joplin-explorer/)
- [Obsidian Notebook Navigator Plugin](https://github.com/johansan/notebook-navigator)
- [Why I swapped the Obsidian sidebar (HowToGeek)](https://www.howtogeek.com/why-i-swapped-the-obsidian-sidebar-for-a-third-party-file-explorer/)
- [react-arborist (GitHub)](https://github.com/brimdata/react-arborist)
- [headless-tree (GitHub)](https://github.com/lukasbach/headless-tree)
- [TanStack Virtual](https://tanstack.com/virtual/latest)
- [7 Best React Tree View Components (2026)](https://reactscript.com/best-tree-view/)
- [Tag Cloud UI Pattern](https://ui-patterns.com/patterns/TagCloud)
- [Filter UX Design Patterns (LogRocket)](https://blog.logrocket.com/ux-design/filtering-ux-ui-design-patterns-best-practices/)
- [Designing better file organization around tags, not hierarchies](https://www.nayuki.io/page/designing-better-file-organization-around-tags-not-hierarchies)
- [TanStack Virtual: Speed up long lists (LogRocket)](https://blog.logrocket.com/speed-up-long-lists-tanstack-virtual/)
- [All the ways to structure your notes (Medium)](https://medium.com/@paralloid/all-the-ways-to-structure-your-notes-cf809b411b13)
