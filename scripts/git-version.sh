#!/bin/bash
# scripts/git-version.sh — Generate version string from git tags.
# Output: "0.3.0+42" (tag + commit count since tag)
# Falls back to package.json version + "dev" if no tags exist.

set -e

TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -z "$TAG" ]; then
  # No tags — use package.json version
  VERSION=$(node -p "require('./package.json').version")
  echo "v${VERSION}-dev"
  exit 0
fi

# Strip leading 'v' if present for the base version
BASE=${TAG#v}
COMMITS=$(git rev-list --count "${TAG}..HEAD" 2>/dev/null || echo "0")

if [ "$COMMITS" = "0" ]; then
  echo "v${BASE}"
else
  echo "v${BASE}+${COMMITS}"
fi
