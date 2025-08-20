
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a; source .env; set +a
fi

if jq -e '.scripts.start' package.json >/dev/null 2>&1; then
  echo "[run] npm start"
  exec npm start --silent
fi

for entry in server/index.js index.js app.js dist/server.js build/server.js; do
  if [ -f "$entry" ]; then
    echo "[run] node $entry"
    exec node "$entry"
  fi
done

echo "ERROR: No start script or known entrypoint found."
exit 1
