## Summary

Brief description of the changes and their purpose.

## Checklist

- [ ] Tests added or updated for changed behavior
- [ ] `npm run lint` passes (includes TSDoc checks)
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds
- [ ] CHANGELOG.md updated (if user-facing change)
- [ ] TSDoc comments on new public APIs
- [ ] ADR written if an architectural decision was made (`docs/decisions/`)
- [ ] **If this touches an agent adapter:** every capability you set to `true` was observed, not assumed — and the PR says against which CLI version. An unverified capability belongs on `false` with a comment saying what you tried. See CONTRIBUTING.md §"Measure, do not assume".

## Related Issues

Closes #

## Test Plan

How were these changes tested?

For adapter work, name the manual pass separately from the suite: four of the Codex findings only showed up in the running app and none in the tests.
