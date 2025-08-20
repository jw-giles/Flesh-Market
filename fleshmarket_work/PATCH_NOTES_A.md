
# FleshMarket v2.1 — Patch A (Safe Start + Health Check)

This tiny patch makes no UI changes. It adds:
1) A **/health** endpoint for quick status checks (`http://localhost:7777/health`).
2) Safer Windows start scripts that **free port 7777** before launching, preventing the self‑kill loop.

## Files added/updated
- `server/server.js` (added `/health` route)
- `server/free_port.bat` (new)
- `server/start_server.bat` (now calls `free_port.bat` automatically)
- `server/start_server_safe.bat` (alternative launcher)
- This `PATCH_NOTES_A.md`

## How to run (Windows)
1. Double‑click **server/start_server.bat** (or **start_server_safe.bat**).
2. Your browser opens to `http://localhost:7777/` automatically.
3. Optional: check health at `http://localhost:7777/health` — should return `{ status: "ok", ... }`.

## How to run (macOS/Linux)
- Use `server/start_server.sh` as before. If port 7777 is busy, free it (e.g., `lsof -i :7777` then `kill -9 <pid>`).

## Rollback
- To revert, restore your original `server/server.js` and `server/start_server.bat` from v2.1.
