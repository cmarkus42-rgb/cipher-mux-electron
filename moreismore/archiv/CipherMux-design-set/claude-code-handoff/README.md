# cipher-mux · Claude Code Handoff

Zwei unabhängige Features für **cipher-mux-electron**:

1. **Theme-System** — 10 Themes statt 2, mit Settings-Picker
2. **Workspaces + Personas** — gespeicherte Session-Grids mit wiederverwendbaren Rollen

Beide Pakete sind in sich abgeschlossen. Die komplette Implementation-Anleitung für Claude Code steht in [`PROMPT.md`](./PROMPT.md).

---

## 📁 Dateien

```
claude-code-handoff/
├── README.md                  ← du bist hier (Übersicht)
├── PROMPT.md                  ← Implementations-Prompt für Claude Code (Teil 1 + 2)
│
│   ── Teil 1: Themes ──────────────────────────────────────────
├── themes.css                 Entry-Point, importiert alle theme-*.css
├── themes.json                Master-Manifest (id, name, mode, swatches, tokens, ansi)
├── themes/
│   ├── theme-cipher-ivory.css (default, light)
│   ├── theme-cipher-dark.css  (default, dark)
│   ├── theme-blueprint.css
│   ├── theme-warm-paper.css
│   ├── theme-gruvbox-dark.css
│   ├── theme-nord.css
│   ├── theme-synthwave.css
│   ├── theme-matrix.css
│   ├── theme-brutalist.css
│   └── theme-high-contrast.css
├── src-snippets/
│   └── terminal-themes.generated.ts   xterm.js-Paletten pro Theme
├── settings-theme-picker.html  Mockup: Settings-Dropdown mit 8-Farb-Swatches
│
│   ── Teil 2: Workspaces + Personas ───────────────────────────
├── personas.js                 Referenz-Datenmodell (Personas, Workspaces, Prompt-Auflösung)
├── workspaces.css              Shared Design-Tokens für die drei Mockups
├── settings-personas.html      Mockup: Settings → Personas-Tab
├── settings-workspaces.html    Mockup: Settings → Workspaces-Tab (Grid-Editor)
└── workspaces-popup.html       Mockup: Appbar-Popup unten links zum schnellen Laden
```

---

## Teil 1 — Themes

**Kurz**: `useTheme.ts` schaltet aktuell per `body.theme-dark` um. Neu: alle 10 Themes an `body[data-theme="<id>"]` hängen. Alle Components lesen unverändert über CSS-Variablen — keine Komponenten-Edits nötig.

**Legacy-Migration**: alte Configs mit `ui.theme: 'ivory'` / `'dark'` werden zu `'cipher-ivory'` / `'cipher-dark'` gemappt.

**Terminal**: `getTerminalTheme(themeId)` liest aus der generierten `terminal-themes.generated.ts`.

Alle Schritte, Imports, Typen, Test-Anforderungen: **`PROMPT.md` Teil 1**.

---

## Teil 2 — Workspaces + Personas

**Das Konzept**:

- **Persona** = benannte Rolle (Orchestrator, MPO, Worker + eigene) mit Farbe + Default-Prompt. Global über alle Workspaces.
- **Workspace** = gespeichertes Session-Grid: `cols × rows`, Zellen-Merges, pro Zelle eine Persona + ein Projekt + optional ein per-cell Prompt.
- **Popup unten links in der Appbar**: Schnell-Picker zum Laden eines gespeicherten Workspaces.

**Datenmodell**:
```ts
interface Persona {
  id: string; name: string; color: string;
  defaultPrompt: string; builtin?: boolean;
}
interface WorkspaceCell { persona: string; project: string; prompt: string; }
interface Workspace {
  id: string; name: string;
  cols: number; rows: number;           // cols 1..10, rows 1..6
  cells: WorkspaceCell[];               // row-major
  merges: Record<string, true>;         // "col:row" → merged DOWN into col:row+1
  promptOverrides: Record<string, string>; // personaId → workspace-scoped prompt
}
```

**Prompt-Auflösung pro Zelle** (wichtig!):
```
1. cell.prompt                          → use it  [cell]
2. workspace.promptOverrides[persona]   → use it  [workspace-override]
3. persona.defaultPrompt                → use it  [persona-default]
```

**Built-in Personas** (immutable IDs, nur `defaultPrompt` editierbar — Name/Farbe/Delete gelockt):
- `orchestrator` — `#B8601A` — koordiniert, gated merges via MPO
- `mpo` — `#2d8a4e` — Meta-Prompt Officer, verifiziert Claims
- `worker` — `#6A6A72` — ein fokussierter Task
- `empty` — Platzhalter

**Grid-Darstellung**: einheitlich **line-style** (1px Borders), kein Pixel-Variante. Merge-Handles liegen auf der unteren Kante jeder Zelle — hovern zeigt Accent-Linie, Klick mergt nach unten. Nur vertikale Merges, Spalten bleiben fix.

**Apply-Logik** beim Laden eines Workspace: fehlende Personas → Zellen fallen auf `empty` zurück (Toast), tmux-Sessions werden im cwd des Projekts gespawned, aufgelöster Prompt wird beim Boot injiziert, Merge-Topologie wird als `grid-row: N / span K` angewendet.

**Persistenz**: drei neue `ConfigStore`-Keys — `personas`, `workspaces`, `activeWorkspaceId`. Migration seeded Built-ins + einen Default-Workspace.

Alle Details (UI-Specs, CRUD-Flows, Edge-Cases, Test-Anforderungen): **`PROMPT.md` Teil 2**.

---

## Mockups durchklicken

Die drei Mockups in Teil 2 teilen sich `localStorage` via `personas.js`, also bleiben Änderungen zwischen den Seiten sichtbar:

1. `workspaces-popup.html` — das Popup (bottom-left Appbar)
2. `settings-workspaces.html` — Grid-Editor mit Merge-Handles + Inspector + Overrides
3. `settings-personas.html` — Personas-CRUD, Built-ins gelockt

## Für Claude Code

Start mit `PROMPT.md`. Die beiden Teile sind unabhängig — Theme-System kann ohne Workspaces deployed werden und umgekehrt.
