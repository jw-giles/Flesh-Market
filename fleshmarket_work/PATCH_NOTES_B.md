
# FleshMarket v2.1 — Patch B (Autosave + Restore, read-only state)

**Scope:** No UI changes, compatible with existing clients.

## What’s included
- **Autosave** market state to `server/state.json` every 60s.
- **Restore on boot** if `state.json` exists (prices, drift, OHLC history, recent headlines).
- **Graceful shutdown** writes a final snapshot on Ctrl+C / SIGTERM.
- **Endpoints**
  - `GET /state` — read-only snapshot (sanitized: no user wallets).
  - `POST /snapshot` — manually trigger a save.

## Why this helps
For a single authoritative market instance, continuity across restarts matters more than a local speed knob. This patch preserves the live world and is neutral to tick rate and multiplayer logic.

## How to use
1. Start as usual: `server/start_server.bat`.
2. Optional: `http://localhost:7777/state` to inspect a compact view.
3. Optional: `curl -X POST http://localhost:7777/snapshot` to force a save.
