#!/usr/bin/env bash
#
# Cut a release: tests, bump + commit + tag, push, bump the Homebrew tap,
# upgrade the local install and restart the service.
#
# Usage: npm run release -- patch|minor|major
#
# Expects a clean working tree on main — commit your changes first.

set -euo pipefail

BUMP="${1:-patch}"
case "$BUMP" in
  patch|minor|major) ;;
  *) echo "usage: npm run release -- patch|minor|major" >&2; exit 1 ;;
esac

REPO="cmolina/beeper-whatsapp-url"
TAP_DIR="${TAP_DIR:-$HOME/code/homebrew-tap}"
FORMULA="$TAP_DIR/Formula/beeper-whatsapp-url.rb"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "error: release from main" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "error: commit your changes first" >&2; exit 1; }
[ -f "$FORMULA" ] || { echo "error: formula not found at $FORMULA (set TAP_DIR)" >&2; exit 1; }

npm test
npm run typecheck

npm version "$BUMP" -m "v%s"
TAG="v$(node -p 'require("./package.json").version')"
git push origin main
git push origin "$TAG"

# GitHub builds the tag tarball on demand; retry while it becomes available.
SHA="$(curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors \
  "https://github.com/$REPO/archive/refs/tags/$TAG.tar.gz" | shasum -a 256 | cut -d' ' -f1)"

perl -pi -e "s|/tags/v[0-9.]+\.tar\.gz|/tags/$TAG.tar.gz|; s|sha256 \"[0-9a-f]{64}\"|sha256 \"$SHA\"|" "$FORMULA"
git -C "$TAP_DIR" diff --quiet && { echo "error: formula unchanged, is it at $TAG already?" >&2; exit 1; }
git -C "$TAP_DIR" add "$FORMULA"
git -C "$TAP_DIR" commit -m "beeper-whatsapp-url: bump to $TAG"
git -C "$TAP_DIR" push

brew update
brew upgrade beeper-whatsapp-url
brew services restart beeper-whatsapp-url

# launchd starts the service asynchronously; wait for it to bind.
tries=0
until curl -fsS http://127.0.0.1:8765/health; do
  tries=$((tries + 1))
  if [ "$tries" -ge 15 ]; then
    echo "error: service did not answer on http://127.0.0.1:8765" >&2
    exit 1
  fi
  sleep 1
done
echo
brew list --versions beeper-whatsapp-url
