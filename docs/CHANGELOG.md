# FleshMarket — Changelog

All versions in chronological order. Each entry corresponds to a former `PATCH_NOTES_X.md` file, now unified here.

---

## v1.0.2.1 (2026-04-19)

**Mining: ship store, faction-style hulls, hull HP, auto-miner toggle, cargo drones, shipyard UI, HUD cleanup.**

### Ship Store — 12 buyable hulls with faction-style gameplay
- Dedicated **SHIPS** button in the loadout bar between STORE and LEADERS opens the Shipyard modal. Every ship is buyable regardless of FleshMarket account faction.
- **Three style tracks × four classes = 12 ships**, plus the free default Mining Drone.
  - **Coalition (Mining focus)** — Prospector Scout Ƒ500k, Auto-Miner Ƒ1.5M, Mining Barge Ƒ3M, Excavator Ƒ5M. Higher drill rate, higher heat cap, slower fire rate.
  - **Syndicate (Combat focus)** — Interceptor Ƒ500k, Gunship Ƒ1.5M, Raider Ƒ3M, Warship Ƒ5M. Higher fire rate, higher bullet speed, more free escorts (up to 4).
  - **Void (Drone focus)** — Courier Scout Ƒ500k, Commander Ƒ1.5M, Mothership Ƒ3M, Hivemind Ƒ5M. Built-in cargo drones and free escorts.
- Ship stats multiply with Fuel/Cargo/Heat loadout tiers and permanent perks (Cargo Optimizer, Salvage Magnet, Improved Scanner, Ion Engines, Cryo-Cooled Emitter).
- Stat axes: `speedMul`, `cargoMul`, `heatMul`, `drillMul`, `fireRateMul`, `bulletSpdMul`. Plus flags: `autoMiner`, `cargoDrones`, `freeEscorts`, `hp`.
- Server-persisted via new `mining_ships` SQLite table (owned JSON blob + equipped column).
- Ship picker tile row in the loadout shows all owned ships as clickable equip tiles, colored by faction.
- BUY/EQUIP buttons self-heal after 4 seconds with no server response, auto-resyncing state.

### Hull HP — armored ships take multiple hits
- Default Mining Drone: 1 HP (unchanged one-shot behavior).
- Scout: 2 HP. Prospector: 3 HP. Hauler: 4 HP. Dreadnought: 5 HP.
- Each non-fatal hit decrements HP, flashes the sprite red, and shows a toast "ARMOR HIT — X/Y HULL."
- 30-frame (0.5s) invulnerability grace after a hit prevents double-tap kills from packed bullets.
- **HP pips render above the player ship in world-space** (same visual as escort drones). Color shifts green → yellow → red as HP drops. Pip offset scales with ship size. No pips shown for 1-HP default drone.
- Shipyard cards display hull HP alongside other stats.
- Opening lore updated: "A single hostile round ends a stock drone — armored hulls take more."

### Auto-miner toggle
- Auto-miner ships (Coalition Prospector, Coalition Excavator, Void Hivemind) drill nearby rocks passively — but toggled OFF by default so low-band areas don't instantly cook your heat sink.
- Press **T** in-field to toggle ON/OFF. Toast confirmation on toggle. Pressing T on ships without auto-miner shows "No auto-miner on this hull."
- Bottom control legend shows `T · AUTO-MINE` when ship has the capability. The T key letter turns green when ON, gray when OFF.

### Cargo drones
- Ships with `cargoDrones > 0` (Void tier) spawn blue delegate drones that orbit the player.
- **New Cargo Drones loadout stepper** — Ƒ800 each, max 3 per run. Stacks on top of ship built-ins.
- When player cargo reaches 50% of cap, an idle drone loads up to Ƒ300 of cargo value, flies to the mothership autonomously, deposits to run-banked total, and returns. Proportional count transfer — the drone hauls the same per-unit value ratio the player keeps.
- 2 HP each, destroyed by enemy fire (loses carried cargo). Dead drones respawn at mothership after 20 seconds.
- **Bought cargo drones refund on safe return** if still alive at run end. Built-in ship drones don't refund.
- Render: 24×24 miniature default Mining Drone sprite. Gold tint + halo while carrying. Carried value shown as `Ƒ###` badge above drone. Health pips visible when damaged.

### Free escorts + faction-adoption
- Several ships spawn with built-in escort drones that don't cost loadout credits (Coalition Excavator 1, Syndicate Gunship 2, Syndicate Raider 3, Syndicate Warship 4, Void Commander 2, Void Mothership 2, Void Hivemind 3).
- Guard Drone perk still stacks on top. Bought escorts refund as before — free ones don't.
- **Escorts adopt ship faction sprite.** Flying a Syndicate ship → escorts wear Kla'ed fighter sprites. Default Mining Drone → escorts follow your FM account faction as before.

### Shipyard UI readability
- Modal widened 780→880px, more padding.
- Ship name 14→17px, bolder. Description 11→13px with lighter color (#d8c8a0). Stats line 10→12px with lighter color (#c8b088). Sprite preview 56→64px. Group headers 11→13px bolder.
- Faction-grouped ship cards with BASELINE / COALITION · MINING / SYNDICATE · COMBAT / VOID · DRONES section headers, color-coded.

### HUD cleanup
- Top-left HUD panel removed entirely (Sector / Zone / Weapon / Hull / Auto-Mine / Assets). Information moved to world-space pips (hull HP) and bottom-bar legend (auto-mine state).
- Fuel (bottom-left), Cargo (top-right), Heat (bottom-right) gauges unchanged.

### Mothership visual
- Replaced vector hexagon mothership with a Starlancer Dominion blue science vessel sprite. Pulsing dock-range rings and central blue docking light preserved.
- Sprite is ~160×136 on screen, reads clearly as a capital-class docking platform.

### Cryo-Cooled Emitter perk
- Ƒ1M permanent upgrade. Heat builds 30% slower while firing the mining beam. Mining laser renders blue instead of white/gold while owned.

### Camera zoom
- World renders at 1.25× zoom. Sprites and asteroids read larger without losing the sense of open belts. Viewport culling bounds and chunk-load radius account for the new effective viewport.

### One-life conversion
- Drone lives stepper removed from loadout. Every run is a single drone. Death ends the run immediately.
- Postmortem shows `Outcome: SURVIVED / DRONE LOST` instead of `Drones Lost X/Y`.

### Visual + mechanics polish
- Bullet sprite rotates +π/2 so projectile tip aligns with travel direction.
- Asteroid hit-boxes match visible sprite area (44% of render radius) rather than bounding box.
- HOSTILE red pulsing labels above every rival enemy.
- RMB auto-cannon with ±60° forward cone proximity aim-snap at ~140 units and 4-frame lead prediction.
- LMB dedicated to mining beam, SPACE removed from fire input.

### Server-crash fix
- `buyMiningShip` in db.js previously called `db.transaction()`, a `better-sqlite3` API. This codebase uses `node:sqlite` (`DatabaseSync`). Every ship purchase was crashing the node process with `TypeError: db.transaction is not a function`. Replaced with the module's own `transaction(fn)` wrapper.

### Files modified
- `server/db.js` — `MINING_SHIP_CATALOG` with 13 entries + `hp` field, `mining_ships` table, ship accessors.
- `server/server.js` — `mining_ships_list`, `mining_ship_buy`, `mining_ship_equip` WS handlers with validation and atomic cash sync.
- `client/assets/core.js` — `pushShipsToIframe`, ship purchase/equip forwarding, cache-buster on iframe src.
- `client/assets/drone-mining/index.html` — 16 new ship sprite registry entries, ship registry + `getEquippedShip()` helper, stat composition, auto-miner toggle, cargo-drone mechanics (built-in + loadout-bought + refund), dedicated SHIPS button and Shipyard modal, loadout ship picker, loadout Cargo Drones stepper, mothership sprite, camera zoom, one-life refund logic, BUY/EQUIP self-heal, HP pips world-space renderer, T key handler, HUD cleanup.
- `client/assets/drone-mining/sprites/` — 16 new ship PNGs (Scout/Prospector/Hauler/Dreadnought × Coalition/Syndicate/Void/Factionless) + mothership.png + updated bullet rotation.
- `client/index.html` — tutorial slide rewritten with Ships section including HP scaling and T toggle; opening lore updated.

### Deploy notes
- No `npm install` required.
- DB migrates automatically via `CREATE TABLE IF NOT EXISTS`.
- Existing player-owned upgrades preserved. Ship ownership starts empty (default Mining Drone always equipped).

---

## v1.0.2.0 (2026-04-18)

**Drone Mining minigame with sprite-based visuals, faction-specific ships, separated mining/combat, tiered salvage, and tutorial accuracy pass.**

### Drone Mining — new Mining tab
- New **⛏ Mining tab** added to the main tab bar between Galaxy and Bugs.
- **Brief screen** inside the tab shows a tutorial covering movement, mining, combat, heat, factions, depth bands, docking, death, refineries, and escorts. High-contrast body text (`#c8b088` on dark) at 16px.
- Clicking **⛏ LAUNCH EXPEDITION** opens the drone mining game in a fullscreen iframe overlay. An in-game "BACK TO FLESHMARKET" button tears down the iframe and returns to the brief screen.
- Bank is shared with the FleshMarket account via the `casino` WS sync pattern. Run-start loadout cost is deducted, run-end banked cargo is credited.
- Game lives at `assets/drone-mining/index.html` as a standalone HTML file that communicates with FM via `window.postMessage`. Runs isolated in an iframe, no CSS/DOM collisions. Still playable standalone (file://) with an internal Ƒ25,000 bank.
- **Cache-buster** on iframe src so updates propagate without manual browser refresh.

### Drone Mining — gameplay
- Single-drone expeditions into an infinite chunked asteroid belt. Depth bands NEAR / MID / DEEP / VOID with escalating mineral richness and hostile density.
- Minerals: Iron Ƒ5, Cobalt Ƒ12, Gold Ƒ25, Painite Ƒ60, Void Opal Ƒ120, Musgravite Ƒ250. Distribution weighted by depth.
- **Mining controls — LMB fires the mining laser beam.** The beam is a thin precision cutting tool that damages asteroids only. Hold to drill a rock; when the bar fills, the mineral and ore count are revealed. Empty rocks still require a full drill cycle and then explode with an 8-frame animation.
- **Combat controls — RMB fires the auto-cannon.** Projectile weapon independent of the mining beam. Bullets travel straight-forward from the ship's nose. Within a 140-unit proximity and a ±60° forward cone, the cannon snaps its aim to the nearest rival enemy with 4-frame lead prediction. Beyond that, manual aim by rotating the ship.
- **Hostile identification.** Every rival enemy shows a pulsing red **HOSTILE** tag above its sprite. Same-faction allies render without tags.
- **Faction-specific ship sprites.** Coalition players fly the Nairan fighter (teal). Syndicate players fly the Kla'ed fighter (red). Void players fly the Nautolan fighter (purple). Factionless players fly the neutral Main Ship. Escorts match player faction. Enemies render with their faction's fighter sprite. All ships render at 48px on-screen regardless of source sprite size.
- **Per-faction combat stats.** Coalition baseline; Syndicate +15% speed / +20% fire rate / +10% bullet speed (fast aggressive); Void -15% speed / -20% fire rate / +30% bullet speed (slow heavy).
- **Factionless = hostile to all.** Players with no FM faction set are treated as rival by every enemy patrol. Lone-wolf mode.
- **Tiered scrap drops.** Enemy salvage value scales by faction difficulty (Void 1.45×, Syndicate 1.10×, Coalition 1.00×), run threat (+15% per extra drone bought), and chase state (+20% if actively hunting you). Tougher fights pay better.
- **Asteroid hit-boxes match visible sprite**, not the full bounding box. Collision radius is 44% of render radius to match the 40% opacity coverage of the voidpack sprite.
- **Drone refund on safe return.** Docking at the mothership refunds the drone's Ƒ1,000 base cost in addition to banking cargo. Dead drones do not refund.
- **Open Range framing.** Game text reframed as unregulated asteroid extraction zones where every faction has agreed that mining is where conflict happens.
- One-shot death model, laser overheat with heat lockout (weapon + thrust both locked at 100% heat until cooling to 40%).
- **Mobile refineries** (Ƒ400) deployable with R — stationary fuel generators, 3 HP, destructible by enemies.
- **Escort drones** (Ƒ1,500 per drone) orbit and shoot automatically, 2 HP each, lost with the drone they escort.
- Enemies collide with asteroids and require line-of-sight to shoot through rocks; bullets are absorbed on asteroid hit.
- Em dashes scrubbed from player-visible UI strings per style rule.

### Drone Mining — permanent upgrade store
- **Mining Store** accessible from the brief-screen menu (STORE button). Server-persisted upgrades purchased with Social Credits.
- **Cosmetic titles:** Drone Pilot (Ƒ25k), Belt Runner (Ƒ250k, requires 25 runs), Void Diver (Ƒ1M, requires reaching VOID band), Scrap Baron (Ƒ5M, requires Ƒ10M lifetime profit). Granted titles also add to the main FleshMarket ownedTitles collection via `title_updated` WS broadcast.
- **Gameplay perks:** Guard Drone (Ƒ150k, free extra escort each run), Ion Engines (Ƒ1M, passive fuel regen), Salvage Magnet (Ƒ250k, pull radius 90→150), Improved Scanner (Ƒ400k, asteroids pre-revealed), Cargo Optimizer (Ƒ750k, +10 cargo cap), Rescue Beacon (Ƒ500k, one-per-run cargo recovery on death).
- Server-side validation prevents duplicate purchases, enforces gates, and atomically deducts cash.
- `LEADERS` button on the brief screen shows top 10 by best_run_profit with faction-color names and band badges.

### Drone Mining — sprite assets (all CC0 / permissive)
- Asteroid base + 8-frame explosion animation: **Foozle Void Environment Pack** (CC0)
- Player Main Ship: **Foozle Void Main Ship** (CC0)
- Kla'ed fighter (Syndicate), Nairan fighter (Coalition), Nautolan fighter (Void): **Foozle Void Fleet Packs 1/2/3** (CC0)
- Auto-cannon projectile: Main Ship weapons pack

### Onboarding tutorial
- **DRONE MINING slide** (10th of 13) between Casino and Social/Economy. Switches to the Mining tab when viewed.
- **Main tutorial "How Mining Works" slide** rewritten: LMB mining (not SPACE), RMB auto-cannon combat with proximity snap, HOSTILE tag explanation, new Scrap section explaining tiered salvage, factions section notes factionless = hostile to all.
- **SHORT SELLING slide rewritten** for accuracy: 50% cash collateral locked, 0.1% borrow fee per 30 minutes, 500-share cap per symbol, covering counts as a day trade.
- **DIVIDENDS AND ANALYSIS slide rewritten** for accuracy: Finance/Insurance/Energy/Tech pay 0.6% every 2 hours, all other sectors pay 0.2%, colony/faction bonuses stack, Merchants Guild members +1% per MG member. Seven-cycle (3.5 hour) continuous-hold requirement.

### Integration details
- `client/assets/core.js` — tab switcher wired for `mining` pane; `pushBankToIframe()`, `pushFactionToIframe()`, `pushUpgradesToIframe()`, `pushLeaderboardToIframe()` helpers; cache-buster on iframe src; faction defaults to `'none'` when `ME.faction` is not one of the three valid factions.
- `client/assets/tutorial.js` — DRONE MINING slide added; SHORT SELLING and DIVIDENDS AND ANALYSIS slides rewritten for accuracy.
- `client/index.html` — Mining tab button added; brief screen pane and fullscreen iframe host; main tutorial mining slide rewritten for current controls.
- `client/assets/drone-mining/index.html` — standalone game with FM-bridge postMessage hooks, sprite-based rendering with offscreen tint canvas, faction-specific ship selection, LMB/RMB split controls, tiered salvage drops, HOSTILE tags, proximity aim-snap, 8-frame explosion animations, scanner perk pre-reveal.
- `client/assets/drone-mining/sprites/` — 7 PNG sprites: asteroid, asteroid_explode (8-frame strip), main_ship, nairan_fighter, klaed_fighter, nautolan_fighter, player_bullet (4-frame strip).
- `server/db.js` — `mining_upgrades` and `mining_stats` tables; `MINING_UPGRADE_CATALOG`; `getMiningUpgrades`, `hasMiningUpgrade`, `getMiningStats`, `canBuyMiningUpgrade`, `grantMiningUpgrade`, `recordMiningRun`, `getMiningLeaderboard` helpers.
- `server/server.js` — `mining_upgrades_list`, `mining_upgrade_buy`, `mining_run_complete`, `mining_leaderboard` WS handlers.

### Deploy Notes
- Client-only changes for most of the mining surface, plus server.js + db.js for the upgrade store
- DB migrates automatically via `CREATE TABLE IF NOT EXISTS`
- No `npm install` required

---

## v1.0.1.9 (2026-04-16)

**Discord button + dividend hold-time exploit fix.**

### Changes
- Added Discord button to header bar, right of Patreon — links to https://discord.gg/H47DnbY33t
- Discord button uses Discord brand blue (#5865F2) muted toward game palette, with matching pulse animation
- **Dividend exploit fix:** stocks must now be held through at least 7 trading-day snapshots (7 × 30-min EOD cycles = 3.5 hours) to be eligible for dividend payouts
- Prevents the "buy right before dividend, collect, sell" exploit
- New `holding_snapshots` table records each player's stock positions at every 30-min EOD cycle
- `runDividends()` now computes eligible qty as `min(current_qty, min(qty) across last 7 snapshots)`; new purchases pay zero until they age in
- Selling immediately reduces eligibility — you cannot receive dividends on shares you no longer hold
- Snapshot cycles older than the 7-cycle window are automatically pruned

### Files Modified
- `client/index.html` — Discord button + pulse animation
- `client/version.json` — version bump
- `server/db.js` — added `holding_snapshots` table, `snapshotAllHoldings()`, `getEligibleDividendQtyBulk()`, `DIVIDEND_HOLD_CYCLES` constant
- `server/server.js` — `runDividends()` uses eligible qty; `_passiveIncomeTick` calls `snapshotAllHoldings()` each 30-min cycle

### Deploy Notes
- No `npm install` required
- New SQLite table created automatically on first `initDB()` call (idempotent `CREATE TABLE IF NOT EXISTS`)
- Migration behavior: dividend payouts pause for the first 7 EOD cycles (3.5 hours) after deploy, then resume normally — no grandfathering of existing positions (closes the exploit window)

---

## v1.0.1.8 (2026-04-12)

**FLSH permanently pinned at Ƒ1B.**

### Changes
- `updateFLSHPrice()` stripped of all drift, shocks, and stock split logic
- FLSH price now hardcoded at Ƒ1,000,000,000 every tick — no random walk, no GBM, no shocks
- Removed the 5:1 stock split mechanic (no longer reachable since price never moves)
- Removed the `chat_system` broadcast and headline announcement that fired on splits
- OHLC bar aggregation kept so the chart still renders flat at Ƒ1B
- FLSH continues to function as a stable reference asset and dev valuation marker

### Files Modified
- `server/server.js` — `updateFLSHPrice()` rewritten to pin price, no drift/split logic

---

## v1.0.1.7 (2026-04-12)

**SWT anchored at Ƒ4500, BRNC normal ticker, sawtooth fix.**

### The Bug
- SWT was cycling predictably between Ƒ4000 → Ƒ1500 → Ƒ4000 every couple days
- BRNC was stuck low with no recovery mechanism
- Root cause: SWT spawned at Ƒ280 with `offset 2.23` had a soft drag at Ƒ1387 and an emergency reversion target of Ƒ1675 from the anti-runaway gravity system. When SWT hit Ƒ4467 (lifetime gain > 2.77), the emergency reversion fired hard and yanked the price toward Ƒ1675. As it fell past the threshold, the trap released and natural drift pushed it back up. Predictable sawtooth.
- BRNC was running through the regular beta model but with very weak `ownKappa` (0.000005) — its `ownTargetLnP` drifted essentially randomly with no real pull toward any center. Combined with blockade hits, it had no recovery mechanism.

### SWT Fix — Anchored at Ƒ4500
- Spawn price + natural center both set to Ƒ4500
- `ownKappa = 0.00015` (~30x stronger than regular tickers — pulls hard toward Ƒ4500)
- `targetDriftSigma = 0.00006` (half regular drift — more stable target)
- New `_isAnchored = true` flag exempts SWT from the anti-runaway gravity that was causing the sawtooth
- Hard ceiling raised to Ƒ10,000 for anchored stocks (was Ƒ5,000) so SWT doesn't constantly bump the cap
- Startup forces `lnP`, `_spawnLnP`, `ownTargetLnP`, `_naturalCenter` to Ƒ4500 — overwrites any restored DB state
- Will oscillate naturally around Ƒ4500 with normal market noise but always pulled back

### BRNC Fix — Normal Beta-Model Ticker
- All special anchoring removed
- Uses regular `ownKappa`, `targetDriftSigma`, `targetSectorKappa` (manually applied since the main `companies.forEach` ran before BRNC was pushed)
- Anti-runaway gravity applies normally
- One-time fixup only triggers if price is broken (NaN, zero, > Ƒ5000)
- Will drift around its sector 3 fair value with normal volatility

### Files Modified
- `server/server.js` — SWT/BRNC config, beta-model init, anchored stock support in `stepMarket`, raised hard ceiling for anchored tickers, startup fixup

---

## v1.0.1.6 (2026-04-12)

**FLSH stock split, short cover rework, Private Army, short persistence fix.**

### FLSH Stock Split
- FLSH price forced to Ƒ1B on startup regardless of saved state
- When price crosses Ƒ5B during runtime, executes a 5:1 split
- All holders get 5× shares via `UPDATE holdings SET qty = qty * 5 WHERE symbol = 'FLSH'`
- Online players get in-memory update + portfolio push
- Price resets to Ƒ1B
- Headline + chat system message broadcast
- Cost basis total unchanged (per-share basis halves but total preserved)

### Short Cover Rework
- Buy handler now splits into two paths based on `have < 0`
- **Cover path**: caps qty at the short position size, charges cover cost + tax, calculates realized P&L from average entry price vs current price, closes the position, cleans up `basisC` proportionally on partial covers, sends P&L result to chat
- **Blocks buying through**: if a player tries to buy more than their short size, the excess is rejected with "close your short first before going long"
- **Normal long buy**: unchanged path when `have >= 0`
- Limit order fills still use the old blind-add pattern — known limitation, lower priority since covers go through market orders

### Short DB Persistence Fix [CRITICAL]
- Root cause of the cover-allocates-shares bug from earlier reports
- `db.js` had four filters that dropped all short positions on every save/load cycle:
  - Save filter at line 225: `if (qty>0)` — negative holdings (shorts) were never written to the `holdings` table
  - Save filter at line 229: `if (bc>0)` — negative basis (short entry tracking) was never saved
  - Hydration filter at line 267: `if (h.qty>0)` — negative holdings were never loaded from the `holdings` table
  - Hydration filter at line 269: `if (b.basis_c>0)` — negative basis was never loaded
- After any `pm2 restart` or `savePlayer()` call, all short positions silently vanished from the DB. When the player tried to cover, `have = 0`, so the cover path never triggered and the normal buy path ran — allocating shares instead of settling P&L.
- Fixed all four filters from `> 0` to `!== 0`
- SQLite INTEGER column accepts negatives natively — no schema change needed
- `snapshotPortfolio` already handled negative holdings correctly (line 3260 filters `qty !== 0`, lines 3263-3266 calculate avg/isShort properly) — only the persistence layer was broken

### Private Army (Blockade Break)
- New `private_army` WebSocket handler in server
- Costs Ƒ50,000 (same as `BLOCKADE_THRESHOLD`)
- Instantly breaks an active blockade — clears the timer, deletes the blockade entry, broadcasts a headline with the player's name, pushes `blockade_update` with `broken:true`
- Red "⚔ PRIVATE ARMY — Break Blockade (Ƒ50,000)" button added in two places:
  - Lane detail panel (always visible — server rejects with "No active blockade on this lane" if not active)
  - Main shipping tab blockade panel
- Confirmation dialog before sending
- Toast on success: "⚔ Private army deployed! Blockade destroyed."

### Files Modified
- `server/server.js` — FLSH split logic in `updateFLSHPrice`, buy handler split into cover vs long paths, `private_army` WS handler
- `server/db.js` — `executeStockSplit()` function added, holdings/basis save+hydrate filters changed `> 0` → `!== 0`
- `client/assets/galaxy.js` — Private Army button (lane detail + main shipping panel), `_gLanePrivateArmy` and `_gPrivateArmy` handlers, `private_army_result` WS handler

---

## v1.0.1.5 (2026-04-11)

**Eyejog system view re-enabled.**

### Eyejog
- Removed `isEyejog` from the System button exclusion list in the colony detail panel
- Eyejog now opens the standard single-body system view (same render path as Lustandia, Gluttonis, Abaddon)
- Only Flesh Station remains non-visitable
- Planet cards in the detail panel remain non-clickable (Eyejog is still flagged `SP_SINGLE_BODY`) — consistent with the lore of Eyejog as a single celestial body

### Files Modified
- `client/assets/galaxy.js` — one-line change to System button exclusion condition

---

## v1.0.1.4 (2026-04-10)

**Wall-clock aligned passive income and day-trade reset.**

### The Bug
- The passive income `setInterval` drifted from wall-clock because it started counting from server boot time, not from the next `:00` or `:30` boundary
- If the server started at 14:07, resets happened at 14:37 / 15:07 / 15:37, etc.
- Client countdown + EOD timer used wall-clock `:00` / `:30`, so players trading at 14:29 saw "resets in 1 minute" but actually had to wait 8 more minutes
- Player reported day trades not refilling at the expected EOD boundary

### The Fix
- Converted the passive income `setInterval` to a wall-clock aligned scheduler
- At server startup, `scheduleAlignedPassiveIncome()` calculates `msUntilNext` to hit the next `:00` or `:30` boundary exactly, fires the first tick there, then `setInterval` every 30 minutes from that point
- All subsequent ticks land on wall-clock `:00` / `:30` — matching what the client shows
- Startup log now reports: `[PassiveIncome] First tick in Xs (aligned to :00)` or `:30`

### Side Benefits
All 30-minute cycle events now align to wall-clock `:00` / `:30`:
- Day-trade counter reset
- Passive income payouts
- Leaderboard snapshot
- Hot stocks rotation
- President passive income
- Guild fund distributions
- Void Collective raid income

### Files Modified
- `server/server.js` — passive income loop refactored into named `_passiveIncomeTick` function invoked by a wall-clock aligned scheduler

---

## v1.0.1.3 (2026-04-10)

**Critical short-sell exploit fix, Eyejog detail panel fix.**

### Short-Sell Money Duplication Exploit [CRITICAL]
- Player reported duplicating ~Ƒ50,000 by shorting while holding long positions
- Root cause: in the short-sell branch of the order handler, the long-clear block credited cash for the existing long position but **never zeroed `actor.holdings[s]`**
- Subsequent `holdings[s] = (have) - shortQty` line then did `100 - 100 = 0`, leaving no short position recorded
- The short proceeds credit still fired, so the player received cash for both the long sale AND the "short" (which was never actually opened)
- Example: Own 100 shares at Ƒ50, short 200 at Ƒ60 → received Ƒ6,000 (long sale) + Ƒ6,000 (phantom short proceeds) = Ƒ12,000 cash with no holdings, no basis, no owed shares. Pure profit of Ƒ6,000 per occurrence.

### Fix
- Added `actor.holdings[s] = 0;` inside the long-clear block before the short delta is applied
- Traced all three scenarios to verify fix:
  - **Pure short (have=0)**: unchanged — long-clear block skipped, holdings goes from 0 to -qty
  - **Short through long (have>0)**: long cleared, cash credited, holdings zeroed, then shorted properly
  - **Add to existing short (have<0)**: unchanged — long-clear skipped, holdings goes more negative

### Eyejog Detail Panel
- Eyejog was flagged as `SP_SINGLE_BODY` (no star + orbiting planets) but its `COLONY_META` config still listed 2 planets (Guild Market, Sand Exchange) with clickable `spOpenSystem` handlers
- Clicking a planet card would call `spOpenSystem('eyejog')` which was also explicitly blocked, creating a dead-end interaction
- Fix: Added `SP_SINGLE_BODY[id]` check in the planet grid renderer — single-body colonies now render planet cards as static info cards (no onclick, no "ENTER ›" arrow)
- Also removed a duplicate `var isEyejog` declaration

### Files Modified
- `server/server.js` — short-sell handler, long-clear block
- `client/assets/galaxy.js` — detail panel planet grid, duplicate variable removal

---

## v1.0.1.2 (2026-04-08)

**Market tools, mobile responsiveness, tutorial rewrite.**

### Watchlist
- ★ toggle on every ticker row — click to add/remove from watchlist
- "★ Watchlist" filter button above search — shows only starred tickers when active
- Count badge updates live
- Persists in localStorage across sessions

### Price Alerts
- Alert panel below Limit Orders: set symbol / above or below / target price
- Alerts checked on every 500ms price tick via `fm_ws_msg` listener
- Fires toast notification + sound when triggered (one-shot, then removed)
- Active alert list with ✕ remove buttons
- Auto-fills current symbol on focus
- Fired alerts cleaned from localStorage on page load

### Portfolio Performance Metrics
- 6-card grid added to P&L tab: max drawdown, best period, worst period, volatility, win rate, total return
- Fetches from `/api/pnl/:token` on first P&L tab click
- Computed from `net_worth_history`: std dev of returns, peak-to-trough drawdown, % positive periods
- Color-coded: green for positive, red for negative, amber for volatility
- Manual refresh button

### Company Detail Panel
- Expanded info panel below chart canvas, updates on every tick and symbol change
- Shows: symbol, name, sector (color-coded badge), HQ colony, dividend eligibility
- Shows: current position size and unrealized P&L, short position info, open limit order count
- Symbol change detected via `Object.defineProperty` on `window.CURRENT` with polling fallback

### News Filter
- Search input + tone dropdown (Good/Bad/Neutral/All) between News heading and feed
- Non-matching headlines dimmed to 15% opacity with collapsed height
- ✕ clear button resets all filters
- Incoming headlines respect active filter state

### Mobile Responsiveness
- `mobile.css` — 5 breakpoint tiers: 1100px (shrink grid), 900px (stack to 1-column), 640px (phone), 400px (extreme compact), landscape short-height
- `mobile.js` — collapsible Companies/News/Wire Credits sections, mobile bottom nav bar, touch optimizations
- Custom cursor PNGs disabled on touch devices via `@media (pointer: coarse)`
- Bottom nav bar with 6 tabs (Market/Heat/Casino/Galaxy/Store/P&L) at ≤900px, syncs with desktop tab clicks
- Galaxy map colony sidebar stacks below map instead of beside it on narrow screens
- Safari `100dvh` viewport height fix
- Touch target minimum sizes: 36px tickers, 32px buttons, 28px tabs
- All modals/popups go full-width on phone
- God panel, mod panel, player profile adapt to small screens
- Original `<h2>` headings hidden when collapsible replacements active (no duplicates)

### Tutorial Rewrite
- Expanded from 9 slides to 12 slides covering all current features
- New slides: Market Tools (alerts, news filter), Short Selling (margin, borrow fees), The Store (titles, inventory, ƒbay, slots)
- Fixed: Casino slide listed Plinko (disabled) and Slot Machine (moved to Store), missed Roulette/Sudoku/Math Quiz
- Fixed: Blackjack described as "5 AI opponents" (removed in prior rewrite, now "6-deck shoe with card tracking")
- Fixed: Guild tab navigation (hidden for non-Patreon users, caused empty panel)
- Updated: Dividends slide now covers Heatmap + P&L + metrics
- Updated: Shipping slide now mentions Lane Shares inline
- Updated: Summary slide references all new features including bug reports tab
- Guild slide replaced with Social & Economy slide (navigates to Market tab, not hidden Guild tab)

### UI Polish
- Ticker/news divider: `<hr/>` changed from 1px dashed to 2px solid with amber glow
- Store sub-tabs (Titles/Inventory/Ƒbay/Slots): inactive color `#553333` → `#997755`, active `#c8a86a` → `#e6c27a`, underline brightened, font bumped, dark background added

### New Files
- `client/assets/market-tools.js` (620 lines) — watchlist, alerts, metrics, company detail, news filter
- `client/assets/mobile.css` (354 lines) — responsive breakpoints, bottom nav, collapsibles
- `client/assets/mobile.js` (244 lines) — collapsible sections, bottom nav behavior, touch fixes

### Files Modified
- `client/index.html` — 3 new references (mobile.css, market-tools.js, mobile.js), inline CSS for new features, store sub-tab color fix
- `client/style.css` — hr divider style updated
- `client/assets/tutorial.js` — full SLIDES array rewrite (9 → 12 slides)
- `client/version.json` — version bump to 1.0.1.2

### Server
- Zero changes. All features are pure client-side.

---

## v1.0.1.1 (2026-04-03)

**Title rework, store tab restructure, Patreon button glow.**

### Titles
- Renamed all 20 purchasable titles and 6 Patreon-exclusive titles
- Rewrote all title descriptions to read as colony dispatch notes rather than taglines
- DB migration on startup: renames equipped titles and owned_titles for existing players
- President of The Coalition description updated

### Store Tab Restructure
- Store tab now contains four sub-tabs: Titles, Inventory, Ƒbay, Slots
- Inventory panel (equipped gear + bag grid) moved from floating modal into Store
- Item market renamed to Ƒbay, moved from floating modal into Store
- Slot machine moved from standalone modal into Store
- Floating invPanel and slotModal removed
- Inventory and Slots buttons removed from top bar

### Top Bar
- Patreon button enlarged with amber pulse glow animation
- Cleaner layout with fewer buttons

---

## v1.0.1.0 (2026-04-01)

**Beta market model, news feed rewrite, heatmap fix.**

### Market Simulation — Beta Model
- Replaced sector-lockstep model with per-stock beta sensitivity system
- Each stock gets a `beta` (0.1–2.5) controlling reaction to sector *changes* (delta per tick), not absolute sector level
- Each stock has an independent `ownTargetLnP` (personal fair value) that drifts via random walk with very weak pull toward sector
- `ownKappa` tuned to 0.000005 (80× weaker than old model) — prevents both momentum and mean-reversion exploits
- Parameters validated through 5-iteration simulation sweep across 30 simulated days (5.1M ticks):
  - Lag-1 autocorrelation: -0.007 (essentially zero)
  - Momentum strategy Sharpe: 0.051 (not exploitable)
  - Mean-reversion strategy Sharpe: 0.051 (not exploitable)
  - 3-day streak persistence: 48% (coin-flip)
- Individual stock sigma boosted ~2.5× (0.0004–0.00075), fat tail probability widened (2% at 2.5×, 8% at 1.5×)
- Vol clustering range widened (0.00015–0.0015 vs old 0.00008–0.0008)
- Beta and ownTargetLnP persist through market state save/restore (db.js updated)
- Gravity, stock splits, admin bias, god panel, earnings all unchanged

### News Feed — Full Rewrite
- 56 sector-specific lore headlines across 8 sectors (good/bad/weird per sector)
- 20 market-wide headlines (no specific ticker — "dark pool activity surges", "flash crash in off-hours trading")
- 7 colony-flavored headlines referencing colony names ("Unrest simmers at Cascade Station")
- Price impact reduced ~10× (0.02–0.08% vs old 0.1–0.4%) — news is flavor, not market driver
- Clicking any company headline navigates to that ticker's chart (same behavior as heatmap cells)
- Category badges in feed: MKT (market-wide), COL (colony), SYS (system events)
- Tone coloring: green/red/amber with hover highlights and timestamps

### Heatmap Bug Fix
- Fixed: `_makeHeatCell` crashed on `t.price.toFixed(2)` when price was null, killing entire `refreshHeatmap` — only 3 of 8 sectors rendered
- Added null guard for price, wrapped each sector block and cell in try/catch
- Added `sector` to `/state` endpoint so heatmap groups correctly on first load before any tick
- Fixed: duplicate `COLONY_DISPLAY` const (function-scoped in fireTensionEvent vs module-level in news) — renamed news copy to `NEWS_COLONY_NAMES`

---

## v1.0.0.4 (2026-03-28)

**Faction persistence, server-authoritative day-trade enforcement.**

### Faction — Persistence Fix
- Fixed: faction assignment dropped on client refresh (showed unassigned after F5)
- Root cause: `hydratePlayer()` in db.js never read `faction` column from DB row
- Added `faction` to hydratePlayer return, /api/login response, fm:authed event, window.ME, and galaxy.js welcome handler
- Faction now survives refresh through four redundant paths covering every load order

### Day Trades — Server-Authoritative Enforcement
- Day-trade limit (3 per 30-min EOD cycle) now enforced server-side
- In-memory Map tracks round trips per player: buy ticket → sell pairs, short ticket → cover pairs
- Server rejects market orders, limit order placement, and limit order fills at cap
- `dt_update` WS message pushed to client after every trade and on EOD reset
- `dayTradesRemaining` included in portfolio snapshots for sync on connect
- Removed client-side localStorage tracking and marketAPI wrapper patching
- trade-limit.js rewritten as display-only badge synced from server state
- Eliminates all client-side exploits: console manipulation, localStorage clearing, raw WS sends

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
