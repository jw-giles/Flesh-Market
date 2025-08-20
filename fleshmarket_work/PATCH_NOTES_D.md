
# FleshMarket v2.1 — Patch D (Unique Usernames)

**Goal:** No two players can share the same username (case-insensitive).

## Behavior
- Name uniqueness is enforced on **/claim** and **/rename**. If taken → `409 name_taken`.
- Server maintains a case-insensitive index of names.
- Auto-created players (when no token is provided on WS connect) get a **unique** `Player-XXXX` style name if needed.
- Saving players also rebuilds the index to keep it consistent.

## Endpoints
- `GET /name_available?name=Foo` → `{ ok:true, available: true|false }`
- `POST /claim?name=Foo` → creates if free; else 409.
- `POST /rename?token=<id>&name=Bar` → renames if free; else 409.

## Notes
- This change is backward compatible with existing clients. UI wiring can make use of `/name_available` to give instant feedback.
