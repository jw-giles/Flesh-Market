# NPC Traders — Removed in v0.9.0

The client-side NPC trading engine (`npc_traders.js`, `strategies.js`) was
removed in v0.9.0.

## Why it was removed

The engine was never wired into the game — no script imported it and no
market logic called it. It had zero effect on prices or the trade feed.

More importantly, the server already runs a full GBM + GARCH price engine
with sector shocks, mean reversion, volatility clustering, earnings events,
and anti-runaway gravity. NPCs would have been redundant at best.

The lore decision also guided this: **players are the story**. NPC activity
in the trade feed would dilute real player decisions with fake volume.

## What drives markets instead

- Server-side GBM tick (every 500ms) with GARCH volatility clustering
- Sector-wide shocks (0.08% chance per tick)
- Earnings events every 8 minutes (±6-20% price swing)
- IPO windows every 90 minutes
- Player buy/sell orders directly applied to log-price
- Limit order fills at market cross
- Anti-runaway gravity kicks in above +100% from spawn price
