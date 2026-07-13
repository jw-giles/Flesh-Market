#!/usr/bin/env bash
# FleshMarket local build applier. Run from the repo root: ./apply.sh [path-to-zip]
# Takes the newest FleshMarket_*.zip from ~/Downloads (or the given path) and makes
# this folder exactly match it. Only git-tracked files are replaced, so local state
# that is gitignored (.env, *.db, node_modules) survives untouched.
# After it runs: test locally as usual, then ./ship.sh to go live.
set -euo pipefail
main() {
  cd "$(dirname "$0")"
  url="$(git config --get remote.origin.url || true)"
  case "$url" in
    *jw-giles/Flesh-Market*) ;;
    *) echo "[apply] SAFETY STOP: this folder's git remote is '$url', not jw-giles/Flesh-Market."; exit 1 ;;
  esac
  zip_path="${1:-$(ls -t "$HOME"/Downloads/FleshMarket_*.zip 2>/dev/null | head -1 || true)}"
  if [ -z "${zip_path:-}" ] || [ ! -f "$zip_path" ]; then
    echo "[apply] No FleshMarket_*.zip found in ~/Downloads and no path given."; exit 1
  fi
  echo "[apply] Using build: $zip_path"
  tmp="$(mktemp -d)"
  unzip -q "$zip_path" -d "$tmp"
  src="$tmp/Flesh-Market-main"; [ -d "$src" ] || src="$tmp"
  if [ ! -f "$src/client/version.json" ]; then
    echo "[apply] That zip does not look like a FleshMarket build (no client/version.json)."; rm -rf "$tmp"; exit 1
  fi
  # Remove tracked files only. gitignored local state survives by definition.
  git ls-files -z | grep -zv -e '^apply\.sh$' -e '^ship\.sh$' | xargs -0r rm -f --
  cp -r "$src"/. .
  find . -type d -empty -not -path './.git*' -not -path './node_modules*' -delete 2>/dev/null || true
  rm -rf "$tmp"
  ver="$(grep -o '"version": *"[^"]*"' client/version.json | head -1 | cut -d'"' -f4)"
  echo "[apply] Working tree now matches build v$ver. Changes vs last commit:"
  git status --short | head -40
  echo "[apply] Test locally now (start the server as usual). When happy: ./ship.sh"
}
main "$@"
