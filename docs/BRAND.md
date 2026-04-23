# Brand & Visual Identity

The design language for cipher-mux. Source of truth for the repo README, the app itself, the project website, store listings, and any future marketing material.

The aesthetic is **brutalist-terminal**: heavy monochrome, exposed grid, monospace typography where it belongs, one restrained accent color. It reflects what the tool is — a cockpit for terminals — and what it is not — a polished lifestyle app.

---

## Design Principles

1. **Honest, not ornamental.** The tool is utilitarian. The brand should be too. No gradients, no drop shadows, no glassmorphism. Flat surfaces, hard edges, deliberate grain.
2. **Monospace where it belongs.** Code, paths, session names, status lines — always Fira Code. Prose and headings can use Rajdhani, but never mix them inside a line.
3. **One accent color, barely.** Monochrome black and ivory do 90 % of the work. The cyan accent is reserved for states (active, listening, connected) and single highlight elements — never backgrounds, never large surfaces.
4. **Grid is the grid.** The app is a grid of panes. The brand echoes that: align everything to a 4 px base, use visible rules and dividers, don't pretend layout is soft.
5. **Keep it self-hostable.** Fonts are SIL OFL. No tracking, no CDN dependency. The banner is SVG.

---

## Color Palette

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| Primary surface | Void | `#000000` | Dark backgrounds, banner ground, terminal |
| Secondary surface | Ivory | `#F5F5EC` | Light backgrounds, Ivory theme body, wordmarks on dark |
| Primary ink (on light) | Void | `#000000` | Body text, wordmarks on ivory |
| Primary ink (on dark) | Ivory | `#F5F5EC` | Body text, wordmarks on black |
| Accent | Signal Cyan | `#0088A0` | Active state, link hover, bracket-prompt sigil. WCAG AA on both Void and Ivory. |
| Accent (darker for light bg) | Deep Cyan | `#006B7A` | Cyan accent when sitting on Ivory and needing AA contrast (5.0:1). |
| Positive state | Terminal Green | `#00FF88` | Session status dot "active" only. Never for text. |
| Warning | Amber | `#E0A040` | Context usage ≥ 85 %, dependency missing |
| Error | Flare | `#E04040` | Crashed session, error toast. Reserve. |
| Muted ink | Lichen | `#8A8A82` | Metadata, timestamps, secondary labels |
| Hairline | Dust | `#1A1A1A` on dark / `#D8D8CE` on light | Grid lines, dividers |

### Accent-color decision record

The Signal Cyan `#0088A0` replaces the original `#007A8A` / `#00AACC` pair. That change came out of the WCAG contrast fix in `fix/BUG-2026-04-19-6R8FFE` (Ivory Theme ANSI blue/cyan had ~4.24:1 against `#F5F5EC`, below AA 4.5:1). `#0088A0` hits ~3.5:1 as a non-text UI element (WCAG AA non-text 3:1 ✓), and `#006B7A` is the darker variant for text roles that need AA 4.5:1.

Do not reintroduce `#00AACC` — it fails AA on ivory.

### Don'ts

- No purple, no orange-red-pink anywhere outside the warning/error palette.
- Do not use Terminal Green as a background or for type. It's a dot.
- Do not tint Void or Ivory. They are pure.

---

## Typography

### Rajdhani (Display)

- **Weight used:** 700 (headings), 500 (subheads)
- **Purpose:** wordmark, large headings, the "CIPHER-MUX" text in the banner
- **Tracking:** +4 to +6 on uppercase settings
- **License:** SIL Open Font License 1.1 (bundled under `/fonts/`)
- **Why:** condensed proportions, geometric, reads as infrastructure. No personality for its own sake.

### Fira Code (Monospace)

- **Weight used:** 400 (body, terminal), 500 (UI labels)
- **Purpose:** everything that is code, path, command, session name, status line, terminal content
- **Ligatures:** enabled in-app, disabled in marketing (ligatures in screenshots confuse non-devs)
- **License:** SIL Open Font License 1.1 (bundled)
- **Why:** the in-app font is the in-marketing font. No brand voice gap.

### Pairing rules

- Heading in Rajdhani, body in Fira Code, or everything in Fira Code. Do not use Rajdhani for prose.
- Never use a system sans-serif as fallback in marketing material. If Rajdhani/Fira are unavailable, fall back to `Impact` / `Arial Narrow` for display and `Courier New` for mono — noted in the banner SVG's `font-family` stacks.

### Type scale (web / README)

| Role | Size (px) | Weight | Font |
|------|-----------|--------|------|
| Banner wordmark | 150 | 700 | Rajdhani |
| H1 | 40 | 700 | Rajdhani |
| H2 | 28 | 700 | Rajdhani |
| H3 | 20 | 500 | Rajdhani |
| Body | 15 | 400 | Fira Code |
| Caption | 12 | 400 | Fira Code |
| Code inline | 14 | 400 | Fira Code |

---

## Logo System

There are two marks. They do different jobs.

### 1. The App Icon (dock, launcher, DMG background)

- Composition: lock + circuit traces **plus** the terminal window frame and the 4-cell grid overlay.
- Location: `/cipher-mux-icon.png` (1024×1024), `/assets/icon.png` (512×512), `/assets/icon.icns` (macOS).
- Use: wherever an OS-level app icon is expected. DMG, dock, About dialog, Linux `.desktop`.
- **Do not** use this as a content/brand mark. It's too busy at small sizes.

### 2. The Brand Mark (sparse use)

- Composition: lock + circuit traces only. No terminal, no grid. Monochrome.
- Location: `/assets/screenshots/brand-mark.{svg,png}` (add when needed).
- Use: favicon, social preview thumbnail, watermark on slides, About-dialog secondary mark.
- Sizing: minimum 32×32 px on screen, 12 mm in print.

### 3. The Wordmark

- "CIPHER-MUX" in Rajdhani 700, uppercase, `letter-spacing: 6` at 150 px.
- Hyphen is part of the name. Never "cipher mux" or "ciphermux".
- Lowercase rendering (`cipher-mux`) is allowed in body text and tagged identifiers (package name, CLI) — never in the banner or heading.

### Clearspace

Minimum clearspace around the wordmark: one capital-letter height (`1×cap`). Respect this on banners, social cards, slide title pages.

### Banner

The repo banner lives at `/assets/banner.svg`. It composes the wordmark + tagline + a session-grid motif + status-line hints. Regenerate on version bumps by updating the `v0.8.3-beta` text string in the SVG. Do not replace the banner's background with a photo or a texture image — the grain is a filter, not an asset.

---

## Voice & Tone

For anything written (docs, commit messages, release notes, store listings, social):

- **Direct, not marketing.** "cipher-mux orchestrates multiple Claude Code sessions" — not "Unleash the power of parallel AI coding!".
- **State limitations up front.** The README explicitly says what cipher-mux is *not*. Keep that pattern. It builds trust and filters bad-fit users.
- **Avoid superlatives.** No "best", "revolutionary", "game-changing". Use specific numbers, real tradeoffs.
- **German is allowed in the author's personal communication**, but English is the default for the repo, docs, and release notes. `package.json` description is German, as the sole exception, because it reflects the author.
- **No emojis in docs, readmes, or the UI.** Commits may use them sparingly only if a codebase convention requires it; this one doesn't.

---

## Imagery

### Screenshots

- Use the in-app Ivory theme for README and landing imagery (reads better on GitHub dark mode).
- Use the Void theme for in-context screenshots inside the HOWTO when showing terminal content.
- No annotations, arrows, or call-outs burned into screenshots. If you need annotation, do it in the surrounding markdown.
- Strip personal paths from visible content (`~/Desktop/secret-client-code/` → `~/code/my-app/`).

### Textures

- Grain is OK (SVG `feTurbulence` filter at low opacity, ~0.08).
- Photographic textures are not.
- Gradient fills are not.

### Diagrams

- ASCII box-drawing (as in ARCHITECTURE.md) is the default. Matches the monospace brand.
- For complex diagrams that don't fit ASCII: black-on-ivory or ivory-on-black SVG, hairline `#8A8A82` rules, Rajdhani labels.
- No Mermaid gradients or default color palettes — override if Mermaid is used.

---

## Applications

### GitHub README

Banner → tagline → badges → screenshot → TOC → content. See the current `README.md` as the canonical implementation.

### Social preview (1280×640)

Banner SVG scales cleanly. Add a second-line subtitle: "Terminal cockpit · Claude Code · Open Source · MIT". Store in `/assets/social-preview.png` when generated.

### Favicon

32×32 PNG derived from the brand mark (no terminal motif at that size). `/assets/favicon.png`.

### Slide decks (when needed)

- Title slide: wordmark centered on Void, tagline in Signal Cyan below, slide number in Fira Code 14 bottom-right.
- Content slides: Ivory ground, hairline dividers, Rajdhani 28 titles, Fira Code 16 body.
- Theme reference: `docs/BRAND-slide-template.pptx` when created.

---

## Checklist for new visual assets

Before committing any new brand asset, run through:

- [ ] Monochrome first? Accent used sparingly?
- [ ] Rajdhani + Fira Code only, with the stated fallbacks?
- [ ] Flat surfaces, no gradients / shadows / glassmorphism?
- [ ] Grid-aligned (4 px base)?
- [ ] Wordmark spelled `cipher-mux` (lowercase) in body, `CIPHER-MUX` (uppercase) in display?
- [ ] WCAG AA contrast on text and non-text UI elements?
- [ ] License-clean (SIL OFL fonts, MIT or compatible imagery)?
- [ ] No emoji, no marketing adjectives, no confident superlatives?

If all boxes tick, commit.
