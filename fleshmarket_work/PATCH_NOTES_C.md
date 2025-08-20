
# FleshMarket v2.1 — Patch C (Player persistence via tokens)

**Scope:** No UI changes required yet (backward compatible).

## What this adds
- **Players DB (`server/players.json`)** with `id`, `name`, `cash`, `holdings`, `xp`, `level`, timestamps.
- **REST**
  - `POST /claim` → `{ id, name }` to mint a new player token (provide `?name=...` optionally).
  - `GET /whoami` with `?token=...` or `Authorization: Bearer <token>` → returns your wallet snapshot.
- **WebSocket attach**
  - On connection, if the client includes `?token=<id>`, orders/portfolio updates apply to the persisted wallet.
  - If no token is provided, the server auto-creates a player and replies once with `type:"hello"` containing `{ playerId, name }` (clients can ignore safely).

## Why this matters
This is the minimal backbone for a **single authoritative market** where **each player** has a durable wallet that persists across sessions and is shared across all clients they use.

## Next step (optional UI wiring)
- Save `playerId` in the browser (e.g., `localStorage`) and reconnect with `?token=<playerId>` so wallets persist across reloads.
- We can add this in a separate, small client patch.
