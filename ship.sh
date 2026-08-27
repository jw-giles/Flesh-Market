#!/usr/bin/env bash
# FleshMarket one-command deploy. Run from the repo root after local testing: ./ship.sh
# Commits everything (message from client/version.json), pushes to GitHub, then
# pulls and restarts on the VPS in one remote line.
set -euo pipefail
main() {
  cd "$(dirname "$0")"
  url="$(git config --get remote.origin.url || true)"
  case "$url" in
    *jw-giles/Flesh-Market*) ;;
    *) echo "[ship] SAFETY STOP: this folder's git remote is '$url', not jw-giles/Flesh-Market."; exit 1 ;;
  esac
  ver="$(grep -o '"version": *"[^"]*"' client/version.json | head -1 | cut -d'"' -f4)"

  # Divergence guard. apply.sh mirrors the zip over the whole tree, so the working
  # tree is always dirty here and a plain 'git pull --ff-only' would abort on it.
  # Instead: fetch, classify, and hard-stop BEFORE committing if local history is
  # behind or diverged. Committing on a stale base is what produced the divergence
  # that needed 'git merge -s ours' to unpick. A stop here is cheap; a bad commit
  # is not. If local is behind, origin has commits the zip does not contain, so
  # shipping would silently revert them.
  echo "[ship] Checking history against origin/main..."
  git fetch --quiet origin main
  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse origin/main)"
  base_sha="$(git merge-base HEAD origin/main)"
  if [ "$local_sha" = "$remote_sha" ]; then
    echo "[ship] In sync with origin/main."
  elif [ "$local_sha" = "$base_sha" ]; then
    echo "[ship] SAFETY STOP: local is BEHIND origin/main. origin has commits this build does not."
    echo "[ship]   Inspect with:  git log --oneline HEAD..origin/main"
    echo "[ship]   Shipping now would revert them. Reconcile before running ./ship.sh again."
    exit 1
  elif [ "$remote_sha" = "$base_sha" ]; then
    echo "[ship] Local is ahead of origin/main. Fine, continuing."
  else
    echo "[ship] SAFETY STOP: local and origin/main have DIVERGED."
    echo "[ship]   Theirs:  git log --oneline HEAD..origin/main"
    echo "[ship]   Ours:    git log --oneline origin/main..HEAD"
    echo "[ship]   If this build is authoritative:  git merge -s ours origin/main"
    exit 1
  fi

  # ── Licence gate ───────────────────────────────────────────────────────────
  # THE ART DIRECTORIES ARE GITIGNORED AND THIS PROVES IT BEFORE COMMITTING.
  # A single missing .gitignore line puts licence-restricted art into a public
  # repo, and once it is pushed, deleting it later does NOT remove it: it stays
  # in history and stays fetchable. There is no cheap undo, so the check is here
  # rather than after the fact.
  restricted="client/assets/space/vehicles client/assets/space/brood"
  leaked=""
  for d in $restricted; do
    [ -d "$d" ] || continue
    if git ls-files --error-unmatch "$d" >/dev/null 2>&1; then leaked="$leaked $d"; fi
  done
  if git ls-files --error-unmatch 'client/assets/space/terrain/*.png' >/dev/null 2>&1; then
    leaked="$leaked client/assets/space/terrain/*.png"
  fi
  if [ -n "$leaked" ]; then
    echo "[ship] SAFETY STOP: licence-restricted art is TRACKED by git:$leaked"
    echo "[ship]   This repo is public and these packs forbid redistributing the art."
    echo "[ship]   Untrack without deleting:  git rm -r --cached <dir>"
    echo "[ship]   Then confirm .gitignore covers it and run ./ship.sh again."
    exit 1
  fi

  git add -A
  if git diff --cached --quiet; then
    echo "[ship] Nothing new to commit; pushing and restarting anyway."
  else
    git commit -m "v$ver"
  fi
  git push
  echo "[ship] Deploying to VPS..."
  # One remote one-liner on purpose: anything pasted before ssh finishes
  # connecting is swallowed by the login banner. --ff-only so prod can never
  # grow a merge commit, and a dirty-tree check first because a file edited
  # on the server aborts the pull halfway and leaves a confusing failure.
  ssh root@5.78.119.169 'set -e
    cd /root/Flesh-Market
    if ! git diff --quiet || ! git diff --cached --quiet; then
      echo "[ship] SERVER STOP: /root/Flesh-Market has local modifications, the pull would abort."
      git status --porcelain | head -20
      echo "[ship]   Never edit files on the server. Discard one:  git checkout -- <file>"
      echo "[ship]   Or discard all of it:                         git reset --hard origin/main"
      exit 1
    fi
    git pull --ff-only'

  # ── Art push ───────────────────────────────────────────────────────────────
  # The art the repo deliberately does not carry. Sent over ssh as a tar stream
  # rather than with rsync, because tar and ssh are the only two things this
  # deploy has ever assumed are on the box, and a deploy step that works until
  # the day someone rebuilds the VPS without rsync is a worse deploy step.
  #
  # AFTER the pull, not before: git pull can create the directories it does not
  # own, and unpacking first then pulling would race for no reason.
  #
  # NOT --delete. This only ever adds and overwrites. A bug in the local file
  # list should cost a stale asset on the server, never a wiped one.
  art=""
  for d in client/assets/space/terrain client/assets/space/vehicles client/assets/space/brood; do
    # `|| :` because set -e is on and a bare `[ -d x ] && y` that finds no
    # directory returns 1, which would abort the deploy AFTER the push has
    # already happened. A missing art directory is a normal state, not a fault.
    [ -d "$d" ] && art="$art $d" || :
  done
  if [ -n "$art" ]; then
    echo "[ship] Pushing licence-restricted art (not in git)..."
    tar czf - $art | ssh root@5.78.119.169 'cd /root/Flesh-Market && tar xzf -'
  else
    echo "[ship] No local art directories to push; the server keeps what it has."
  fi

  # The restart is last, so the process only ever comes up against a tree that
  # has both the new code and the new art. Restarting between the two serves a
  # client that asks for sheets which are still in flight.
  ssh root@5.78.119.169 'pm2 restart fleshmarket'
  echo "[ship] Live: v$ver deployed. Hard-refresh the game client."
}
main "$@"
