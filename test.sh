#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# test.sh — one command:  ./test.sh
#
# The bash half of test.bat. Same four steps, same rules:
#
#   * it does NOT touch the game server. server/server.js opens a database,
#     holds sockets and runs the market day; none of that is needed to check a
#     renderer, and starting a real world to look at a battlefield is how test
#     state ends up in a live database.
#   * it never stops on a missing OPTIONAL dependency. jsdom and node-canvas
#     are both optional; without them some checks report SKIPPED, which
#     run-all.mjs treats as a first-class outcome and prints loudly, because a
#     check that silently asserts nothing is worse than one that says it did
#     not run.
#   * the benches are served over http, not opened from file://. A canvas that
#     has drawn a file:// image is tainted, getImageData throws, and every
#     faction silently comes out in the sprite pack's own colours.
#
#   ./test.sh --no-serve    checks and frames only, no browser, exits with the
#                           suite's status. This is the CI shape.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8177}"
SERVE=1
for a in "$@"; do
  case "$a" in
    --no-serve|--ci) SERVE=0 ;;
    --port=*) PORT="${a#*=}" ;;
    *) echo "test: unknown argument '$a'"; exit 2 ;;
  esac
done

hr() { printf '  %s\n' '============================================================'; }
echo; hr
echo '   FLESHMARKET TEST'
hr; echo

command -v node >/dev/null 2>&1 || {
  echo '  ERROR: Node.js is not on PATH. Install from https://nodejs.org'; exit 1; }
echo "  node  $(node -v)"
echo "  build $(node -p "require('./client/version.json').version" 2>/dev/null || echo '?')"
echo

# ---- optional dev dependencies ---------------------------------------------
if [ ! -d node_modules ]; then
  echo '  [1/4] Installing dev dependencies (first run only)...'
  echo '        jsdom and canvas are OPTIONAL. If either fails to build, the'
  echo '        checks that need it report SKIPPED and the rest still run.'
  npm install --no-audit --no-fund || echo '  (install had problems; continuing)'
  echo
else
  echo '  [1/4] Dev dependencies present.'; echo
fi

# ---- the suites -------------------------------------------------------------
echo '  [2/4] Running checks...'; echo
node tools/run-all.mjs
SUITE=$?
echo

# ---- battlefield frames -----------------------------------------------------
echo '  [3/4] Drawing city battlefield frames...'
if node -e "require.resolve('canvas')" >/dev/null 2>&1; then
  node tools/citybattle-harness.mjs
  FRAMES=$?
  [ $FRAMES -eq 0 ] && echo '        Frames written to tools/_citybattle/'
else
  FRAMES=0
  echo '        SKIPPED - node-canvas is not installed.'
  echo '        The browser bench below does not need it; only the headless'
  echo '        frame writer does.  npm i -D canvas'
fi
echo

# ---- the benches ------------------------------------------------------------
if [ "$SERVE" = "0" ]; then
  echo '  [4/4] --no-serve: skipping the browser.'
  echo
  if [ $SUITE -ne 0 ] || [ $FRAMES -ne 0 ]; then
    echo '  ONE OR MORE CHECKS FAILED - scroll up.'; exit 1
  fi
  echo '  All checks green.'; exit 0
fi

echo '  [4/4] Serving client/ and opening the benches...'
echo

# ORDER MATTERS AND THE OLD ORDER WAS A BUG. This opened the browser and THEN
# started the server. If a server from an earlier session still held the port -
# started from a DIFFERENT, OLDER FOLDER - the new one exited with EADDRINUSE
# and the tab that had just opened connected to the OLD process, serving last
# week's tree. Every symptom looked like a browser cache and none of it was.
if command -v lsof >/dev/null 2>&1; then
  HOLD="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
elif command -v fuser >/dev/null 2>&1; then
  HOLD="$(fuser "$PORT"/tcp 2>/dev/null || true)"
else
  HOLD=""
fi
if [ -n "$HOLD" ]; then
  echo "        Port $PORT is held by PID $HOLD - almost certainly a serve.mjs"
  echo "        left running from another folder. Closing it so THIS tree is served."
  kill -9 $HOLD 2>/dev/null || true
  sleep 1
fi

echo "        City battlefield   http://localhost:$PORT/citybattle-mock.html"
echo "        Reach battlefield  http://localhost:$PORT/battle-test.html"
echo

node tools/serve.mjs "$PORT" &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

# Wait until it actually answers, then check WHICH tree answered.
ONDISK="$(node -p "require('./client/version.json').version" 2>/dev/null || echo '?')"
SERVED=''
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  SERVED="$(node -e "fetch('http://localhost:$PORT/version.json').then(r=>r.json()).then(v=>console.log(v.version)).catch(()=>process.exit(1))" 2>/dev/null || true)"
  [ -n "$SERVED" ] && break
done
if [ -z "$SERVED" ]; then
  echo '  ERROR: the server did not come up.'; exit 1
fi
# SELF HEAL RATHER THAN JUST COMPLAIN. Not every machine has lsof or fuser, so
# the eviction above can silently do nothing - and then the old server is still
# answering and ours never bound. Detecting that is the easy half; the useful
# half is moving to a port nobody is squatting and telling you the new URL,
# because the point of this script is to put the CURRENT tree in front of you.
if [ "$SERVED" != "$ONDISK" ]; then
  echo
  echo '  *** ANOTHER SERVER IS HOLDING THIS PORT ***'
  echo "      port $PORT answers with build $SERVED, this folder is $ONDISK."
  echo '      Could not evict it. Moving to a free port instead.'
  kill $SRV 2>/dev/null || true
  node tools/serve.mjs "$PORT" --auto &
  SRV=$!
  SERVED=''
  for P in $(seq "$PORT" $((PORT+12))); do
    V="$(node -e "fetch('http://localhost:$P/version.json').then(r=>r.json()).then(v=>console.log(v.version)).catch(()=>process.exit(1))" 2>/dev/null || true)"
    if [ "$V" = "$ONDISK" ]; then PORT="$P"; SERVED="$V"; break; fi
  done
  if [ -z "$SERVED" ]; then
    sleep 2
    for P in $(seq "$PORT" $((PORT+12))); do
      V="$(node -e "fetch('http://localhost:$P/version.json').then(r=>r.json()).then(v=>console.log(v.version)).catch(()=>process.exit(1))" 2>/dev/null || true)"
      if [ "$V" = "$ONDISK" ]; then PORT="$P"; SERVED="$V"; break; fi
    done
  fi
  if [ -z "$SERVED" ]; then
    echo '  ERROR: could not start a server on any free port.'; exit 1
  fi
  echo "      Now serving build $ONDISK on port $PORT."
  echo
else
  echo "        Serving build $ONDISK from $(pwd). Opening browser..."
fi

URL="http://localhost:$PORT/citybattle-mock.html"
( sleep 1
  if   command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  elif command -v open     >/dev/null 2>&1; then open "$URL"
  fi ) >/dev/null 2>&1 &

if [ $SUITE -ne 0 ]; then
  echo '  NOTE: one or more checks FAILED above.'
else
  echo '  All checks green.'
fi
echo '        ctrl-c to stop the server.'
wait $SRV
