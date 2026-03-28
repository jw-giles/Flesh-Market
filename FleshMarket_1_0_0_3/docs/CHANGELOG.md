# FleshMarket — Changelog

All versions in chronological order. Each entry corresponds to a former `PATCH_NOTES_X.md` file, now unified here.

---

## v1.0.0.3 (2026-03-28)

**Viewport lock, layout overhaul, Wire Credits hardening, leaderboard relocation.**

### Wire Credits — Security Fix
- Blocked self-transfers (previously allowed infinite money duplication by wiring to yourself)
- Transfers no longer broadcast to public news headlines — now private between sender and recipient
- Both sender and recipient receive ⚡ SYSTEM chat messages confirming the wire
- Recipient's portfolio auto-refreshes on receive

### Viewport — Full-Screen Fit
- Entire UI now fits within the browser viewport with no scrolling required
- `.wrap` converted to a flex column locked to `100vh`
- CSS grid row constrained with `grid-template-rows:minmax(0,1fr)` to prevent content overflow
- Left panel scrolls internally; center and right panels use flex column layout
- All hardcoded `calc(100vh - ...)` heights removed from galaxy map, factions, contracts, guild, and bugs tabs — replaced with `flex:1;min-height:0` for natural fill
- Bottom bar (live market ticker) pinned at bottom with `flex-shrink:0`

### Leaderboard — Compact Right Panel
- Moved from bottom bar into right panel, below Wire Credits
- Shows top 10 players only — compact `.72rem` rows, no scrolling
- If you're outside top 10, your entry appears as the 11th row with a dashed separator and your actual rank number
- Your own row highlighted with amber border
- Removed level display for compactness
- Bottom bar now contains only the live market ticker strip

### Galaxy Map — Layout Fix
- Galaxy tab switched from `display:block` to `display:flex` with `flex-direction:column`
- Fixed conflicting tab handler in `market-state.js` that was overriding `display:flex` with `display:block` — the root cause of the galaxy map overflow
- Map pane, factions pane, and contracts pane all use `flex:1` to fill available space
- Shipping lanes legend fully visible at bottom of map

### Live Trades — Relocated
- Moved from left panel (under news) to center panel (under XP bar) in the Market tab
- Removed the `injectTradeFeed()` DOM-move function from `sound.js` — feed is now statically positioned in HTML

---

## v1.0.0.2 (2026-03-28)

**Market stabilization, economy rebalancing, chat/leaderboard overhaul.**

### P&L Fix
- Smuggling interception path now sends `snapshotPortfolio` immediately — P&L updates in real time after both successful and intercepted runs (previously only success pushed portfolio)
- Smuggling start also pushes portfolio after stake deduction

### Wire Credits (replaces legacy Transfer)
- UI renamed from "Transfer (2% tax)" to "Wire Credits"; send button relabeled to "Wire"
- **90% Merchant Guild surcharge** on the portion of any transfer exceeding Ƒ10,000 (server-enforced, additive with standard 2% base tax)
- Fine print under the Wire Credits UI explicitly states the tax tiers
- Insufficient funds error now returns exact breakdown: amount + base tax + Guild surcharge
- Headlines show both fees separately when Guild surcharge applies

### A−/A+ Chat Font Buttons
- Increased from `.72rem` transparent ghost buttons to `.85rem` bold amber buttons with dark background, visible border, and bright hover state

### Chat Auto-Scroll
- Each chat pane caps at 20 messages; oldest messages pruned on every append to keep chat in eyeline
- Auto-scrolls to bottom on every new message

### SWT / BRNC Ticker Normalization
- **Root cause**: Both had sigma values designed for daily ticks but running on 500ms ticks (172,800×/day). SWT `sigma: 0.042` compounded to ~1,750% daily volatility. No ceiling, no mean-reversion.
- **Fix**: Removed `_special` flag entirely. SWT and BRNC now run through the normal `stepMarket` GBM+GARCH loop with sector mean-reversion, anti-runaway gravity, graduated pullbacks, and 1:1000 stock split at Ƒ5,000 — identical to every other ticker.
- SWT: `offset: 2.23` (gravitates toward ~Ƒ280 within sector 7)
- BRNC: `offset: 0.77` (gravitates toward ~Ƒ65 within sector 3)
- Removed `updateSpecialCompanyPrice` function entirely
- On first boot, any saved prices above Ƒ5,000 (from the explosion bug) are reset to compiled defaults

### Smuggling Cooldown
- Increased from 60 seconds → 15 minutes
- Error message now shows remaining time ("Cooldown active — 12m 18s remaining")

### Leaderboard — EOD Freeze
- Leaderboard is now frozen at each 30-minute income cycle via `snapshotLeaderboard()`
- `broadcastLeaderboard()` sends the frozen snapshot, not a live query
- Init message and `request_state` handler both use the snapshot
- **Client caching**: leaderboard payload cached to `localStorage` under `fm:lb_snapshot`; restored immediately on page load before WebSocket connects, so the board survives browser refresh
- Removed `leaderboard-local.js` — was computing net worth client-side every 5 seconds and overwriting `#board`, fighting the server snapshot

---

## v0.9.0 — Modular Client + Polish (2026-03-24)

**Client architecture refactor.** The monolithic `index.html` (909 KB) has been split into 18 JavaScript modules and 13 CSS files. `index.html` is now ~102 KB and serves as a thin shell.

### New module files (`client/assets/`)
| File | Contents | Size |
|---|---|---|
| `core.js` | WebSocket, market engine, tab routing, chart | 113 KB |
| `inventory.js` | Pixel art data, item/slot UI, slot machine | 331 KB |
| `galaxy.js` | Galaxy map, faction system, colony UI | 108 KB |
| `casino-blackjack.js` | Blackjack with 5 AI opponents | 31 KB |
| `casino-poker.js` | Texas Hold'em vs AI | 19 KB |
| `casino-chess.js` | Chess with engine integration | 19 KB |
| `casino-sudoku.js` | Sudoku | 11 KB |
| `casino-mathgame.js` | Math quiz game | 10 KB |
| `casino-minesweeper.js` | Minesweeper | 8 KB |
| `funds.js` | Guild and hedge fund system | 26 KB |
| `market-state.js` | Persistence helpers, full tab switcher | 20 KB |
| `god-panel.js` | Dev/admin tools panel | 22 KB |
| `sound.js` | Web Audio system, sector name constants | 17 KB |
| `shorts.js` | Short position UI and borrow fee tracking | 11 KB |
| `player-profile.js` | Player profile popup | 10 KB |
| `chat-ui.js` | Chat tab switching, room indicators | 7 KB |
| `block-users.js` | Client-side user blocking | 6 KB |
| `market-orders.js` | Buy/sell modal controllers | 6 KB |

### Lazy loading
- `galaxy.js` (108 KB) — loads only on first Galactic tab click
- `inventory.js` (331 KB) — loads only on first Inventory/Store tab click
- Casino scripts (poker, chess, sudoku, mathgame, minesweeper) — load on first subtab click; blackjack loads eagerly as the second-most-visited tab

### Removed
- Client-side NPC engine (`npc_traders.js`, `strategies.js`, `npc_config.json`) — dead code, never connected. Server GBM+GARCH handles all price movement. Lore decision: players are the story; fake volume dilutes that.

### Bug fixes in this release
- Cursor PNG paths corrected after CSS extraction (double `assets/` prefix stripped)
- Galaxy map black screen fixed — `window.__galaxyOpen` exposed for post-DOMContentLoaded lazy init
- Five missing CSS `<link>` tags restored (`sell-modal`, `casino-roulette`, `casino-sudoku`, `casino-mathgame`, `casino-minesweeper`)
- Orphaned HTML in unmod-warning-modal div restored after bad style-block extraction

---

## v0.8.x — Cyberpunk Augmentation Update

*Formerly `PATCH_NOTES_I.md`*

### Inventory & Slot Machine
- All clothing slot items now display as 32×32 cyberpunk pixel art icons (hat, glasses, upper body, necklace, watch, pants, shoes)
- Slot machine win screen shows item art at 64×64
- 40 new clothing items across 7 slots with cyberpunk-themed names and pixel art

### New: Implant Slot
- 40 cyberpunk body augmentation items (Neural Combat Blade through Chrome Endoskeleton)
- Implants range Common (+20 Ƒ/30min) through Legendary (+750 Ƒ/30min)
- Existing databases auto-migrated to add the new column

### Set Bonuses
- Neon Syndicate, Crimson Wave, Ghost Protocol, Chrome Corp
- 2–5 piece stacking passive income bonuses
- Active set bonuses shown live in inventory panel

### God Mode
- All 40 clothing items and 40 implants available in the God Menu item picker
- `give_item` command works with all new item IDs

---

## Build H — UI & Casino Overhaul (2026-03-16)

*Formerly `PATCH_NOTES_H.md`*

### End-of-Day Timer
- Large green glowing countdown in header next to logo
- Turns urgent red with faster pulse when under 3 minutes remain

### Blackjack — Poker-Style UI + AI Players
- Full UI rebuilt: green felt table, shared card styles, seat ring layout
- 5 AI opponents: Vega, Oracle, Dread, Silk, Baron — each with stack, bet, card display
- AI plays basic strategy; async turn-by-turn animation
- Bet chip buttons (+10, +25, +100, +500, MAX)

### Roulette — Full Overhaul
- New canvas engine: gold rim, realistic fills, fret dividers, animated ball
- 13 bet types (was 8), interactive number grid, individual bet removal
- Spin history strip showing last 12 results

### Active Ticker Price Badge
- Selected ticker highlights with green border and live ± % badge

---

## v5.0 — Full Flesh

*Formerly `PATCH_NOTES_v5.md`*

### Server
- **Limit orders** — buy/sell limits with cash reservation, 24h expiry, auto-fill on tick
- **Short selling** — negative positions, 0.1% borrow fee per 30 minutes
- **Earnings events** — random company every 8 minutes, 6–20% swing, global broadcast
- **IPO events** — 90-minute windows, 15–35% discount, 100 share cap per player
- **Dividends** — 0.6% per 2h cycle for Finance, Insurance, Energy, Tech holders
- **Trade feed** — anonymised live feed of all fills
- **Daily quests** — 3 random quests per player per day, 10 quest types, XP rewards
- **Heatmap data** — `pct` and `sector` added to every tick broadcast
- **Portfolio snapshot** — `isShort`, `sectorName`, `shortExposure`, `sectorBreakdown`

### Client
- Heat tab — full market heatmap, click cell to switch chart
- Quests tab — progress bars, XP rewards, completion state
- Limit order panel — open orders list with cancel buttons
- Trade feed — live scroll below News, IPO buys in gold
- IPO banner — fixed overlay with countdown and buy input
- Earnings/dividend toasts
- Sound effects (Web Audio API) — off by default

---

## Patch G — Quest Removal + XP Overhaul

*Formerly `PATCH_NOTES_G.md`*

- Removed daily quest system entirely
- Replaced with pure activity-based XP rewarding trading skill and market participation
- 999-level scaling curve (floor(60 × 1.06^(n−1)) XP per level)

---

## Patch F — Casino Sanity Pass

*Formerly `PATCH_NOTES_F.md`*

- Chess timeout status message bug fixed
- Various casino UI stability fixes

---

## v3.0 / Patch E — SQLite Player Persistence

*Formerly `PATCH_NOTES_E.md`*

- Full SQLite persistence via Node.js built-in `node:sqlite`
- Player accounts, holdings, and market state survive server restarts
- Requires Node.js v22.5+

---

## v2.1 / Patches A–D — Foundation

*Formerly `PATCH_NOTES_A.md` through `PATCH_NOTES_D.md`*

**Patch A** — `/health` endpoint for status checks  
**Patch B** — Autosave + restore, read-only state endpoint  
**Patch C** — Player persistence via session tokens  
**Patch D** — Unique usernames enforced (case-insensitive)
