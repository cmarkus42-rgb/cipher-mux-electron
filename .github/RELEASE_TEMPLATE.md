# Release Notes Template

Copy this structure into the GitHub release body when publishing a new version. Keep the language direct; no marketing.

---

## cipher-mux vX.Y.Z — <one-line theme, e.g. "voice pipeline hardening">

**Platform support:** macOS (DMG) · Linux (AppImage)
**Requires:** tmux, Claude Code CLI
**Release date:** YYYY-MM-DD

### Highlights

- Bullet 1 — the single most important thing in this release.
- Bullet 2.
- Bullet 3.

(Keep to 2–4 bullets. If you can't pick three highlights, this is a point release, not a minor release.)

---

### Added

- `feat(scope): description` — PR #123

### Fixed

- `fix(scope): description` — PR #124

### Changed

- `refactor/chore(scope): description` — PR #125

### Security

- `security: description` — CVE-XXXX-YYYY (if applicable) — PR #126

### Breaking

- **Removed / changed API surface.** Migration steps:
  ```
  # before
  # after
  ```

(Omit any section that has no entries. Do not write "(none)" — an empty section is noise.)

---

### Downloads

| Platform | Artifact | SHA-256 |
|----------|----------|---------|
| macOS (arm64) | `cipher-mux-X.Y.Z-arm64.dmg` | `…` |
| macOS (x64) | `cipher-mux-X.Y.Z-x64.dmg` | `…` |
| Linux (x64) | `cipher-mux-X.Y.Z.AppImage` | `…` |

Verify with: `shasum -a 256 cipher-mux-*.dmg` (macOS) or `sha256sum` (Linux).

---

### Upgrading

- From the previous minor: drop-in replacement, config is backward-compatible.
- From ≥ 2 versions back: read [CHANGELOG.md](../CHANGELOG.md) for the intermediate steps.
- Config location unchanged: `~/Library/Application Support/cipher-mux/` (macOS), `~/.config/cipher-mux/` (Linux).

### Known issues

- List anything caught in QA that made the cut but with a workaround.
- Link to the tracking issue.

### Contributors

Thanks to: @handle, @handle.

Full changelog: [X.Y.Z-1…X.Y.Z](https://github.com/cmarkus42/cipher-mux-electron/compare/vX.Y.Z-1...vX.Y.Z)
