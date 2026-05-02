# Profile System

cipher-mux uses a YAML-based profile system to separate environment-specific configuration (paths, defaults) from the application code.

## How It Works

1. The `BUILD_PROFILE` environment variable selects a profile (default: `community`)
2. `src/shared/brand.ts` loads `profile.<name>.yaml` from the project root
3. All environment-specific values are accessed via the `BRAND` singleton
4. If the profile file is missing, community defaults are used (no crash)

## Profiles

| Profile | File | In Git? | Purpose |
|---------|------|---------|---------|
| `community` | `profile.community.yaml` | Yes | Neutral defaults for public builds |
| `cipher` | `profile.cipher.yaml` | No | Private paths for cipher's environment |

## Building with a Profile

```bash
# Community build (default)
npm run build:community

# Cipher build
npm run build:cipher

# Or set manually
BUILD_PROFILE=cipher npm run build
```

## Adding a New Brand Value

1. Add the field to `BrandConfig` interface in `src/shared/brand.ts`
2. Add a default in `COMMUNITY_DEFAULTS`
3. Add the key to both `profile.community.yaml` and `profile.cipher.yaml`
4. Add parsing logic in `loadProfile()` (follow existing pattern)
5. If the value should not appear in community builds, add a pattern to `scripts/profile-lint.ts`

## Why the Name Stays "cipher-mux"

The application name `cipher-mux` is used for:
- IPC channel prefix (`cipher-mux:sessions:list`, etc.)
- Preload API namespace (`window.cipherMux`)
- npm package name
- Config directory (`~/.config/cipher-mux/`)

Changing these would break existing user configs and require coordinated updates across all consumers. The profile system controls **paths and defaults**, not the brand name.

## CI Checks

- `npm run profile-lint` — verifies no cipher-specific paths leak into `src/`
- ESLint rule warns against `/Users/Shared/Nextcloud` literals in source files
