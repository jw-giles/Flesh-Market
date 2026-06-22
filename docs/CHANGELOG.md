# FleshMarket - Changelog

All versions in chronological order. Each entry corresponds to a former `PATCH_NOTES_X.md` file, now unified here.

---

## v1.1.8.4 (2026-06-22) - Ƒbay Title Exchange: trade collectible custom titles (SERVER + DB + CLIENT)

Server, DB, and client. Hard-refresh after deploy. **DB adds a `title_market` table on boot** (additive, `CREATE IF NOT EXISTS`).

Builds on 1.1.8.3's collectible titles to let players trade them, modeled on the existing card market (escrow on list, atomic buy, full price to seller, no fee).

- **Exchange UI lives inside the existing Ƒbay** (the inventory marketplace), not a separate panel or header button. A new `👑 Titles` option in the Ƒbay slot filter swaps the listings area to titles: For Sale (each title in its color with its rarity, by seller) and Your Listings (delist). The existing `+ List` form, in this mode, lists one of your held titles at a price; the rarity and sort controls apply. Buy/list/cancel go over WebSocket. (`title-market.js` renders into the Ƒbay `marketListings` area; `inventory.js` market functions `loadMarket`/`applyMarketFilters`/`showListForm`/`submitListing` branch to title mode when the Titles category is selected.)
- **Server** (`server.js`): handlers `title_listings`, `list_title`, `cancel_title_listing`, `buy_title_listing`. Listing escrows the title (removed from the seller and from their `ownedTitles`, unequipped if worn) and creates a listing snapshot. Buying runs one DB transaction: validate listing is active and not your own and not already held, check funds, debit buyer, credit seller the full price, grant the title, mark sold. Cancel returns the escrowed title.
- **Ownership is table-authoritative**: `buildAvailableTitles` now unions a player's `gifted_titles` rows, so a bought title surfaces in the picker from the table alone. Trade handlers therefore never re-save a stale player object (buyer cash is synced in-memory for the snapshot only; the seller is read fresh), avoiding any cash clobber. Concurrency is safe via the `sold=0` guard inside the transaction.
- **DB** (`db.js`): `title_market` table (id, seller, label/color/badge/rarity snapshot, price, sold flag, buyer) and functions `listTitleForSale`, `buyTitle`, `cancelTitleListing`, `getTitleListings`, `getMyTitleListings`. Rarity drives display value (common, rare, epic, legendary, custom).

---

## v1.1.8.3 (2026-06-22) - Collectible custom titles (multi-hold); FRS prepaid balance readout (SERVER + DB + CLIENT)

Server, DB, and client. Hard-refresh after deploy. **DB migration runs on boot** and preserves existing gifted titles.

### Custom titles are now collectible (hold many)
In 1.1.8.0 the `gifted_titles` table used `player_id` as the primary key, so a player could physically hold only one gifted title and granting a new one overwrote the old. Now a player can hold any number.

- **Schema**: `gifted_titles` moves to one row per title with `id` PK and `UNIQUE(player_id,label)`, plus a `rarity` column (`db.js`). A boot migration detects the legacy single-row table (no `id` column), renames it aside, builds the new table, copies the rows over, and drops the legacy table. Idempotent and additive; no titles lost.
- **Granting** (`gift_title`) now adds a title without disturbing any the player already holds (re-granting the same label refreshes its color/badge/rarity), adds it to `ownedTitles`, and auto-equips it. The dossier and ack report how many custom titles the player holds.
- **Color resolution** is now by equipped label: a gifted title's color/badge apply in chat, whispers, and portfolio only while that specific title is the equipped one, so each held title shows its own color when worn (`server.js`).
- **Removing** (`ungift_title`) removes one specific title by label, or the currently-equipped gifted title if no label is given (was: cleared the single title). The God Panel Remove button uses the custom-label field for this; the dossier lists held titles with the equipped one marked.
- **Client** (`market-state.js`): `title_state` now carries a `gifted` array; the title picker renders every held custom title in its own color with its badge, all individually equippable.
- New db helpers: `addGiftedTitle`, `removeGiftedTitle`, `getGiftedTitles`, `getGiftedTitleByLabel`, and `transferGiftedTitle` (groundwork for marketplace trading).

### FRS prepaid balance
- The tax panel's Pay Ahead section now shows the prepaid amount as a prominent deposit-account balance, so players can see their running FRS prepaid balance at the point of prepaying (`tax-panel.js`).

Groundwork note: `rarity` and `transferGiftedTitle` exist so titles can later be listed and traded on Ƒbay as collectible, rarity-valued items. That marketplace integration is not in this patch.

---

## v1.1.8.2 (2026-06-22) - Gifted Titles become selectable equippable titles (SERVER + CLIENT)

Server and client. Hard-refresh after deploy. **No DB change** (`gifted_titles` table and the `ownedTitles` player field already existed in 1.1.8.0).

In 1.1.8.0 a gifted title was an invisible auto-overlay stored in a side table, disconnected from the owned-titles system. It never appeared in the title picker (the picker renders owned/available titles, and the gifted label was in neither) and only recolored the chat name on the next message, never showing the label text. Now:

- **Granting a title** (`gift_title`) adds the label to the player's `ownedTitles`, drops any previously gifted label, and auto-equips it. It appears in the title inventory picker as a selectable Equip/Unequip row, rendered in its custom color with its badge, and the chat-name recolor shows immediately (`server.js`).
- **Color and badge are tied to equipping.** The gifted color/badge apply in chat, whispers, and the portfolio snapshot only while the gifted title is the equipped title (was: applied unconditionally whenever a gifted title existed). The player can equip a different title and switch back at will, like any other title.
- **Removing a title** (`ungift_title`) pulls the label from `ownedTitles` and unequips it if it was active.
- `title_state` now carries a `gifted: {label,color,badge}` field so the client picker can render the custom role in its real color (`market-state.js`: `getTitleColor` and the inventory row use it; gifted info is cleared on ungift). `sendTitleState` and the gift/ungift pushes include it.

Design note: the gift now auto-equips and is opt-in to keep visible (the player can unequip or swap it). If a gifted title should be forced-always-on regardless of what the player equips, that is a different model and not what shipped here.

---

## v1.1.8.1 (2026-06-22) - God Panel tab bar overflow fix (CLIENT)

Client-only. Hard-refresh after deploy. **No server/DB change.**

- The God Panel grew to 9 tabs in 1.1.8.0 (added `🏛 FRS`), but the tab row was a single non-wrapping flex row in a panel capped at `max-width:400px` with `overflow:hidden`, so the last tab clipped off-screen and the FRS tab was unreachable (`index.html`, `god-panel.css`). Fix: the tab row now wraps (`flex-wrap:wrap`); `.god-tab` is `flex:1 1 auto` with `min-width:84px` so tabs flow into two even rows; the panel widened to `max-width:460px`; and the scrollable content offset went from `calc(88vh - 95px)` to `calc(88vh - 135px)` to allow for the taller two-row header. Scales to further tabs without clipping.

---

## v1.1.8.0 (2026-06-22) - Gifted Titles; FRS weekly income tax; FRS surveillance (SERVER + DB + CLIENT)

Server, DB, and client. Hard-refresh after deploy. **DB migration runs on boot** (`initFRSTables`, additive `ALTER`/`CREATE IF NOT EXISTS`, no data loss). The tax engine **ships dormant** (`frs_settings.enabled = 0`); nothing touches a live balance until an admin enables it from the God Panel FRS tab.

### Gifted Titles (display-only name recolor)
- New God Panel **FRS** tab can grant a player a display title that recolors their name. Presets: `🍇 S'weet Trader` (#b83265), `😇 Angel Investor` (#8ab8ff), `💰 Loan Shark` (#7a3fb0), plus fully custom label/color/badge. `god_cmd gift_title` / `ungift_title`.
- Title color and badge apply in chat, whispers, and the portfolio snapshot, inserted **above** Patreon tier and **below** structural roles (President, Owner, Dev, Debtor, escaped Syndicate, Cyborg/Guild). New `gifted_titles` table; `setGiftedTitle` / `clearGiftedTitle` / `getGiftedTitle` in `db.js`.

### FRS weekly income tax
- New engine in `server.js` assesses tax every **Sunday 12:00 America/Los_Angeles** (DST-correct via `Intl.DateTimeFormat` offset math; a per-minute `frsScheduleTick` fires once per boundary and is crash-safe via `last_run_ts`).
- Taxes the **week's gain** in taxable net worth (cash + long/short equity + short collateral), default **15%**. Fund stake is excluded from taxable net worth. Losses can carry forward as a credit that offsets later gains (runtime toggle). Dev and Owner accounts are exempt. First assessment baselines with no retroactive tax.
- **Pooled funds are taxed at withdrawal, not weekly.** Applies to both Capital Houses (`/api/funds/:id`) and the Guild hedge fund (`/api/fund`). Deposits and withdrawals adjust the income-tax basis symmetrically so moving money between your own cash and a fund is income-tax-neutral; the only charge on fund money is a withdrawal tax (separate `withdraw_tax_bps`, default 15%), routed to the treasury. This closes the shelter where fund stake (excluded from taxable net worth) could otherwise dodge the weekly tax.
- **Pay Taxes Here**: a `🏛 Taxes` header button (new `tax-panel.js`) appears once the FRS is active. Shows next assessment time, taxable net worth, gain this cycle, estimated tax, balance owed, and prepaid/loss credit. Players can pay a balance (`pay_tax`) or prepay ahead of going idle (`prepay_tax`); `tax_status` reports current state. Prepaid credit is applied before cash on future assessments.
- New columns on `players` (`play_seconds`, `tax_basis`, `tax_owed`, `tax_prepaid`, `tax_loss_credit`) and new `frs_settings`, `frs_tax_history` tables. God controls: `set_frs`, `get_frs`, `run_frs_now`, `frs_forgive`.
- Tutorial gains an FRS slide (UNIT-7) before orientation complete.

### FRS surveillance (dev-facing)
- Per-minute playtime accrual for online players (`addPlaySecondsBulk`), 15-minute position snapshots (`frs_position_snapshots`, capped 200/player), and a global executed-trade log (`frs_purchase_log`, capped 20000). God Panel `frs_player` pulls a per-player dossier (playtime, tax state, recent trades, tax history); `frs_recent` streams recent market activity with a min-notional filter.

---

## v1.1.7.9 (2026-06-16) - News watchlist filter; Corpo-Cards collection sort (CLIENT)

Client-only. Hard-refresh after deploy. **No server/DB change.** Batch B continued.

- **News watchlist filter** (`market-tools.js`, `core.js`) - the existing news filter (text search + good/bad/neutral tone) gains a `★` toggle that shows only news whose ticker is on your watchlist (`fm:watchlist`). `renderNews` now stamps each `.news-line` with `data-sym`; the filter reads it and dims/collapses non-watchlisted lines. Clearing the filter resets the toggle.
- **Corpo-Cards collection sort** (`tcg/tcg-app.js`) - `renderCollection` previously hardcoded a cost sort. Added a Sort by selector: Cost (asc, default - unchanged behavior), Attack (desc), Health (desc), Rarity (desc by rank common<rare<epic<legendary), Name. Non-unit cards (no attack/health) fall back to 0 and sort last on those keys. Faction/shiny filters and the click-to-list behavior are untouched.

---

## v1.1.7.8 (2026-06-16) - Chart time axis fixed to real elapsed time; DOUBLE DOWN button (CLIENT)

Client-only, `client/assets/core.js`. Hard-refresh after deploy. **No server/DB change.** First two of Batch B.

- **Chart time axis** - OHLC bars are 5s each (`BAR_MS_F=5000`), but the bottom time axis assumed 500ms/point (`secTotal = n * 0.5`), so it understated the real span by ~10x and never widened when you owned the extended-history (`price_history`) upgrade. Now a parallel `_waveTimes` buffer keeps a real timestamp per point (OHLC `t` was being discarded on seed); the axis labels are computed from actual timestamps and fall back to the old estimate only if timestamps are missing. The visible window now grows with the upgrade.
- **DOUBLE DOWN** - each long position row in `#pnlBox` now has a `2×` button that buys an equal number of additional shares at market via `marketAPI.buy`, doubling the position, behind a single confirm showing approx cost. `event.stopPropagation()` so it doesn't trigger the row's navigate. Cash, day-trade cap, and buy cooldown stay enforced server-side. Longs only (`p.qty > 0`).

---

## v1.1.7.7 (2026-06-16) — Batch A UI: clickable P&L tickers, sell fee, dividend badge, tappable stock toasts, auto-accum wording (CLIENT)

Client-only UI batch. CLIENT (`client/assets/core.js`, `sound.js`, `market-orders.js`, `market-upgrades.js`, `client/index.html`): hard-refresh after deploy (assets are served `no-cache`). **No server or DB change.**

- **P&L tickers clickable** — `#pnlBox` position rows now navigate to the stock's Market page on click (`FMGotoSymbol`), matching the house holdings and bar-chart behavior.
- **Sell dialog shows the fee** — the sell modal now displays the trade fee (0.25%, mirrors server `TRADE_TAX_BPS=25`) and net proceeds, alongside sale value.
- **Dividend badge** — positions in dividend-paying sectors (Finance/Insurance/Energy/Tech, mirrors server `DIVIDEND_SECTORS`) show a 💰 badge in the P&L list.
- **Tappable stock toasts** — `showToast` gained an optional `symbol` (and now honors the `duration` arg callers were already passing, which was previously ignored). Earnings toasts are wired to open the stock on tap; other stock toasts can opt in by passing the symbol.
- **Auto-Accumulate wording** — clarified the reserve as cash you set aside per symbol that auto-buys spend (not your spendable cash), funded/withdrawn any time. Removed the contradictory "never touches your main balance" line and reworded the cancel prompt away from "returns to your balance."

---

## v1.1.7.6 (2026-06-16) — Trade integrity: market-impact fill exploit + auto-accumulate day-trade dodge (SERVER)

Server-only. Closes a money exploit in the large-order impact model and a day-trade-cap bypass. SERVER (`server/server.js`): `pm2 restart fleshmarket` required; **no client or DB change** in this patch (it carries the earlier 1.1.7.4/1.1.7.5 client + DB changes if not yet deployed).

**Market — fills now execute at the price they create (the short "always profits" exploit)**
- Large orders (> impact threshold) filled at `c.price * (1 ± slip/2)` but moved the tape the full `slip` (`lnP ± slip`). So the order filled at *half* the impact while the market settled at the *full* impact — a permanent gap between the trader's fill and the resulting price. That gap was harvestable: short big (fill above the depressed market) then cover in sub-threshold chunks at the depressed price, or symmetrically buy big then sell small. Most visible as "short while holding nets more than just selling," and as the short's locked collateral (set from the fill) exceeding its cover liability (marked at the moved price), so net worth jumped the instant a short opened.
- Fix: all eight fill sites (personal buy/sell/short/cover, Capital House trades, legacy guild vote-passed trades) now fill at `c.price * Math.exp(±slip)` — exactly the post-tape price. Fill == resulting market price on both sides, so the round trip nets ≈ −tax and the gap is gone. Sub-threshold fills (`slip == 0`) are unchanged. **Trade-off:** orders above the threshold now pay the *full* slippage they cause (was half) — this is the cost of keeping the price impact intact while killing the arb.

**Market — auto-accumulate no longer dodges the day-trade cap**
- The day-trade cap counts round trips; a manual buy issues a ticket and the closing sell consumes it. Auto-Accumulate buys issued **no** ticket, so selling auto-accumulated shares never counted as a round trip — an end-run around the cap. Auto-Accumulate buys now issue a buy ticket like a manual buy. (Side effect: selling auto-accumulated shares in the same cycle now correctly counts as a round trip, including the 2× scalping tax.)

---

## v1.1.7.5 (2026-06-16) — Capital House cost basis + short liquidity gate (SERVER + DB + CLIENT)

Two changes: give house holdings a real cost basis (so the Portfolio %-column is gain-vs-entry like personal P&L, not the ticker's daily move), and require liquid cash backing to open a short. SERVER + DB + CLIENT (`server/db.js`, `server/server.js`, `client/assets/funds.js`): `pm2 restart fleshmarket` required; client assets are served `no-cache` and revalidate on next load (hard-refresh if in doubt). **DB migration is additive + idempotent.**

**Capital House — real cost basis on holdings**
- `fund_portfolios` previously stored `(symbol, qty)` only, so the Portfolio %-column showed the *ticker's daily market move*, not the house's gain — buying a stock up 4% on the day read as `+4%` even at your entry. Houses now carry a weighted-average entry price.
- DB (`server/db.js`): additive `avg_cost` column on `fund_portfolios` (`ALTER … ADD COLUMN`, idempotent). `setFundPortfolioBuy` maintains the weighted average on buys (mirrors `player_cargo.addCargo`); `setFundPortfolioQty` now **preserves** `avg_cost` on sells (the old `INSERT OR REPLACE` would have wiped it). `getFundPortfolio` returns `avg_cost`.
- Backfill: on startup, existing holdings with no basis are reconstructed by replaying the logged `fund_activity` buy/sell history (price is recorded per trade). The replay is **validated against the current qty** — if it reconciles, the basis is set; if not (incomplete history), basis stays 0 and the client shows a `·` placeholder rather than a wrong number. `fund_activity` is never trimmed, so normally-traded houses reconcile fully.
- Server snapshot returns `avgCost` per holding; client `_gBuildHoldings` computes `((price/avgCost)-1)*100` (gain vs entry, `null` → `·` when unknown). The holdings list and the bars both switch to gain-vs-entry, matching personal P&L. Funds can't short (sells cap at holdings), so no negative-basis edge.

**Market — short liquidity gate**
- Opening a short now requires **liquid cash ≥ 3× the shorted notional** (`price × shortQty`), checked server-side at order time in the `order` handler before any state changes. It's a **balance check, not a lock** — cash isn't consumed; the short's proceeds are still locked as collateral and the 1.65× margin call is unchanged. This re-adds an entry barrier on top of the collateral model (which had removed upfront margin).
- A mixed order that both clears a long and opens a short is **rejected as a whole** if the short portion fails the check (the long isn't partially sold). Limit orders can't open shorts (sell fills cap at holdings), so the gate sits only on the market-order naked-short path the short modal uses.

---

## v1.1.7.4 (2026-06-16) — Capital House pane retention + per-recipient broadcast, sector allocation, automated-trade markers (SERVER + CLIENT)

Four fixes: stop in-house actions bouncing to Overview, stop `fund_update` leaking the actor's perspective to every member, add a Sector Allocation panel to the house Overview, and mark automated trades in the live feed. SERVER + CLIENT (`server/server.js`, `client/assets/funds.js`, `client/assets/sound.js`, `client/index.html`): `pm2 restart fleshmarket` required; client assets are served `no-cache` and revalidate on next load (hard-refresh if in doubt). **No DB schema change.**

**Capital House — Portfolio/Manage stop bouncing to Overview**
- Buying/selling, inviting, depositing, and every other in-house action used to call `openFund()`, which force-reset the sub-pane to **Overview**. `openFund` now detects an *in-place refresh* (re-opening the house already in view) and re-asserts the **current** pane instead, so a trade from **Portfolio** stays on Portfolio and the holdings list re-renders with the new position. The trade hint still prints `✓ BUY n× SYM executed`.

**Capital House — `fund_update` is now per-recipient (Manage invite/join bug)**
- Every `fund_update` broadcast computed **one** `fundDetailSnapshot(fund, ACTOR)` and sent that identical payload to all members. `isOwner` / `isMember` / `myRole` / `my*` are viewer-specific, so a non-actor viewer rendered the *actor's* perspective: the owner sitting on **Manage** when a member was invited/joined got `isOwner:false`, which hid the owner panels and bounced them to **Overview** ("elements missing"). Members also briefly saw each other's personal stake.
- New `broadcastFundDetail(fundId)` loops the membership and sends **each member their own** `fundDetailSnapshot(fundId, member)`. All nine live route broadcasts, `broadcastHouseUpdate`, and the edit-name/description broadcast now route through it. Client `onFundUpdate` keeps `__currentFundData` in sync with the push. The legacy single-guild path and the commented-out savings-interest block are untouched.

**Capital House — Sector Allocation (Overview)**
- New **Sector Allocation** bars under the Performance block on the house **Overview**, mirroring the personal P&L sector breakdown (reuses the global `sb-*` styles). `_renderFundSectors` groups the house's live-valued holdings by sector and shows each sector's share of position equity. Allocation only — not gain/loss.

**Market — automated-trade markers in the live feed**
- `broadcastTradeFeed` carries `auto` + `src`; the feed renders `*L` for limit-order fills, `*A` for auto-accumulate fills (`*` generic automated), and leaves **manual** clicks unmarked. NPC market-sim trades are intentionally left unmarked (they would swamp the feed). Auto-accumulate fills now pass the flag; limit fills already carried `isLimit`.

**Known gap (separate change)**
- The Portfolio holdings **%-column** under the breakdown graph still shows the **ticker's daily market move**, not gain-vs-entry, because `fund_portfolios` stores no cost basis. A true house cost-basis P&L (to match personal P&L) is staged but not in this patch — it needs an additive `avg_cost` schema change + backfill from `fund_activity`.

---

## v1.1.7.3 (2026-06-15) — Capital House buy-cooldown UI: red-out + live countdown (SERVER + CLIENT)

Makes the 30-min house buy cooldown obvious instead of dumping a raw `buy_rate_limited` string on a blocked click. SERVER + CLIENT (`server/server.js` snapshot field, `client/assets/funds.js`): `pm2 restart fleshmarket` required; `funds.js` is served `no-cache` so it revalidates on next load.

**What players see**
- After a house buy, the **Execute** button reds out (disabled, red/monospace) and a `⏳ NEXT BUY mm:ss` line ticks down below the trade row — the same lock-and-clock idiom as the day-trade limit.
- **SELL stays enabled** during the cooldown (sells are uncapped). Flipping the side toggle to SELL unlocks the button; flipping back to BUY relocks it while time remains.
- The trade hint now shows the friendly server message (with the wait time) instead of the error code — `guildPost` prefers `d.msg` over `d.error`.

**How it stays correct (server-authoritative, mirrors day trades)**
- `fundDetailSnapshot` now returns `buyCooldownMs` (remaining, derived from `getLastFundTradeTs` — 0 for non-player funds) and `buyCooldownWindowMs` (the full window, so the client never hardcodes 30 min). `renderFundDetail` calls `applyBuyCooldown(f.buyCooldownMs)`, so the countdown is right on first open, immediately after a buy (via `openFund`'s re-fetch), on reload, and on every `fund_update` broadcast.
- The button click handler keeps a fallback: a buy that still returns `buy_rate_limited` (clock skew, stale panel, direct API) syncs the lock to the response's `retryInMs`.
- The countdown element is injected once and reused; a 500ms ticker re-paints and self-clears when the window elapses.
- Dev (`flsh`) and guild (`patreon`) funds report `buyCooldownMs: 0`, so the lock never shows there — matching the server-side exemption.

**Tested**
- UI functions exercised against a DOM mock (the real functions, eval'd from source): lock on buy+cooldown, counter shown with time, unlock on SELL, relock on flip back, unlock at 0, single element creation, `mm:ss` formatting.

---

## v1.1.7.2 (2026-06-15) — Capital House trade integrity: tape impact + buy rate limit (SERVER + DB)

Closes a frictionless extraction path worth ~1B SC/day, plus a defense-in-depth buy cooldown. SERVER + DB-logic (`server/server.js`, `server/db.js` — additive helper, no schema change): `pm2 restart fleshmarket` required, no client cache concern.

**The hole**
- Personal market orders move the ticker: orders above `IMPACT_THRESHOLD_C` (Ƒ1,000,000) notional pay slippage and push the tape, and the trader eats their own impact (fills off the post-impact price). Capital House trades (`executeFundTrade`) and the legacy guild fund (`processFundProposals`) did neither — they filled flat at the live quote and never touched `c.lnP`.
- That asymmetry is the exploit: a house buys a block flat (no impact), the price gets pumped (by personal orders or a second account), and the house dumps the block flat at the top — no slippage on the cheap entry, none on the expensive exit, and the dump doesn't drag the realized price down. Round-trip is free money; the player's stake in the house's NAV balloons.

**Fix 1 — impact symmetry**
- Extracted the slip formula and tape-application into two shared module functions, `impactSlip(notionalC, sideSign)` and `applyTapeMove(c, lnDelta)`, so personal orders, Capital Houses, and the legacy guild fund all price impact through one code path (no drift between them). The personal hot path now calls these — verified byte-identical to the previous inline math (0 mismatches across a price×qty×side sweep).
- `executeFundTrade` (Capital Houses) and `processFundProposals` (legacy guild): buys now fill at `price·(1 + slip/2)` and push the tape up; sells fill at `price·(1 − slip/2)` and push the tape down — exactly the personal model. Activity logs and headlines now show the actual fill price, not the pre-impact quote.
- Under threshold, `slip = 0`: fund trades fill flat and move nothing, so ordinary house activity is unchanged. Only large (exploit-scale) orders bite, capped at `IMPACT_MAX_FRAC` (12%) per order. A simulated immediate pump-dump round-trip now posts a net loss instead of a profit. This makes fund round-trips negative-sum exactly like personal trades, so cross-account pump-dump (house A pumps, account B sells into it) is net-negative across the two accounts — the same invariant as two colluding personal accounts the game already tolerates.
- Special/pinned stocks (e.g. FLSH) are held to `slip = 0` in the guild path so the pin can't be disturbed; `executeFundTrade` already excludes `_special` symbols.

**Fix 2 — Capital House buy rate limit**
- A player house may execute at most one buy per `HOUSE_BUY_COOLDOWN_MS` (default 30 min, env-tunable). Enforced inside `executeFundTrade`, so it covers EVERY buy path: direct executive/Trader trades, vote-passed proposals (timer auto-resolve and `maybeResolveEarly`), and owner-executed proposals. A rate-limited proposal buy resolves as `failed_exec` — the same graceful outcome as an insufficient-cash buy; the direct-trade and owner-execute routes return `400 { error:'buy_rate_limited', retryInMs, msg }`.
- **Sells are uncapped.** The cooldown only gates accumulation.
- Restart-safe with no new schema: the window is derived from the fund activity log via a new `getLastFundTradeTs(fundId, type)` (`MAX(ts) WHERE type='trade_buy'`). A rejected buy writes no activity row, so only a *successful* buy advances the window. Tested against the real SQLite engine (window boundary, sells-don't-block, latest-buy-wins, per-house isolation, exemptions).
- Per-house, not per-actor: a 5-member house still gets one buy / 30 min, not five. Dev (`flsh`) and guild (`patreon`) funds are exempt.

**Out of scope, flagged**
- The rate limit closes the *direct executive trade* fast path and the *self-passed proposal* fast path (a solo house in vote mode passing its own proposals). It does not touch sells or sub-threshold grinding; with Fix 1 those are no longer free-money anyway.
- Price impact removes the *free* extraction (the asymmetry), not all coordinated wash-trading. The residual cost to a patient cross-account pumper is set by the `IMPACT_K` / `IMPACT_MAX_FRAC` constants and applies equally to personal-account collusion; that's a tuning question, not a structural hole.
- The 30-min cooldown also applies to legitimate vote-passed buys: if a house buys twice within the window (e.g. an owner direct-buy then a vote passes 10 min later), the second resolves `failed_exec`. Acceptable for an anti-grind cap; raise `HOUSE_BUY_COOLDOWN_MS` or scope it to direct trades only if it bites real governance.

---

## v1.1.7.1 (2026-06-15) - Collapsible right-panel sections + flex chat (CLIENT)

Right panel: Wire Credits and Leaderboard collapse to reclaim vertical space for chat. CLIENT-only (`client/index.html` + `client/style.css`): hard-refresh, no `pm2 restart`.

- Wire Credits (`#transferSection`) and Leaderboard (`#leaderboardCompact`) are now collapsible. Each header is a clickable toggle (`role=button`, keyboard Enter/Space) with a chevron that rotates to show open/closed state. Both default to collapsed.
- The real mechanism: `#chatBox` was a fixed `height:420px`, so collapsing the sections below it would only have left dead space. It is now `flex:1 1 auto; min-height:240px`, so within the viewport-bounded `#rightPanel` flex column the chat box grows to fill whatever the collapsed sections free up. Side effect (intended): on tall desktop viewports the chat now grows past 420px even with both sections expanded, instead of capping at 420 with empty space below.
- State persists per section in `localStorage` (`fm_wire_collapsed`, `fm_lb_collapsed`), matching the existing `fm_chat_font_pct` pattern. No saved value = collapsed (markup default); `0` = expanded, `1` = collapsed.
- DOM-safe: `#board` (leaderboard render target) and all transfer input ids (`#toName`, `#amt`, `#xfer`) are unchanged; the leaderboard rows are now one level deeper but `#leaderboardCompact #board` is a descendant selector so styling and the renderer are unaffected.
- No player-visible prose changed; no em dashes introduced.

**Known tradeoff:** the Leaderboard (net-worth flex board) now starts hidden, so the social-proof/competition signal is off by default until a player expands it. If that costs more in engagement than it gains in chat space, flip the leaderboard's default by removing `collapsed` from its class in `index.html` (one token); Wire Credits defaulting collapsed is uncontroversial.

---

## v1.1.7.0 (2026-06-14) - Corpo-Cards: the in-game card game (SERVER + DB + CLIENT)

The in-game trading card game, **Corpo-Cards**, plus a player card market, deck-listing rules, and a casino card-art pass. SERVER + DB + CLIENT: `pm2 restart fleshmarket` AND hard-refresh.

**Where it lives**
- Tab structure: the in-game card game is now ONE top-level **Corpo-Cards** tab (formerly **Arena**). The card-pack store moved out of Store -> Corpo-Cards into a **Card Packs** view inside this tab; the Store tab now holds Titles / Inventory / Ƒbay / Slots only. The Corpo-Cards tab views are Play, Decks, Collection, Rules, Card Packs, Ƒbay.
- Ƒbay card market: a new **Ƒbay** view in the Corpo-Cards nav where players buy and sell Corpo-Cards for Social Credits. Cards are pack-only assets listable at any player-chosen price (free, player-driven collectables market, no fee, mirroring the item market's no-sink model). List from the Collection tab (click a card -> price dialog); browse and buy on the Ƒbay tab; cancel your own listings there. Server-authoritative: `tcg_list_card` / `tcg_buy_card` / `tcg_cancel_card_listing` / `tcg_card_listings`. Listing escrows one copy by decrementing collection qty (`tcg_card_market` table); buy delivers the card and moves cash in ONE SQLite transaction with RELATIVE cash updates (`cash=cash±price`), which is safe because the server loads each player fresh from the DB per message. Seller is notified live if online. Listing a card removes it from play: a saved deck is only playable if you currently own (un-listed) every card it uses, so listing a card a deck needs makes that deck unplayable (the row shows `N listed`, Play disabled) until you cancel the listing (the copy returns) or sell it (then you swap the card out). Enforced at the deck list, the play picker, and match start (`startMatch`), with a note in the deck builder; starter decks are exempt. PvE matches run client-side, so the gate is client-side.
- Rules tab: a Rules view was added to the Corpo-Cards nav (right of Collection) covering objective, turn structure, Assets, Orders, Battlecry/Deathrattle, all keywords (Taunt, Charge, Rush, Divine Shield, Lifesteal, Poisonous, Windfury), decks, fatigue, and factions, in the game's own terms (House/Solvency/Liquidity/Assets/Orders). No em dashes in the copy.
- Match view compaction: the in-match layout was tightened to fit a standard viewport without scrolling (hero bars, board min-heights, the log panel, and inter-section margins trimmed; board and hand cards kept full-size). Measured ~723px tall vs ~838px before.
- Cache-busting: the TCG scripts (`tcg-app.js` and its deps, where the card CSS and logic live) are loaded with a `?v=` query so a deploy is never served from a stale browser cache (this also covers the shared `lazyLoad` used by galaxy/fleshbook/dev-comms). In addition, the server now sends `Cache-Control: no-cache` on all `.html` and `.js` (forcing revalidation every load: 304 when unchanged, fresh on deploy) and `max-age=86400` on static art. Together these stop the browser from running an outdated `tcg-app.js` after a deploy. The dynamically-injected TCG script was previously cached past hard-refreshes, which froze Abaddon cards (and panel changes) on an old version.
- Corpo-Cards tab (right of Fleshbook, formerly "Arena") -> the game hub: **Play** (start a PvE match vs the AI using a faction starter or a saved deck), **Decks** (deck-builder gated to cards you own, saved to your account), **Collection** (everything you own, faction filter + shiny-only toggle), plus Rules, Card Packs, and Ƒbay.
- Bugs tab button removed (Fleshbook covers bug reports); `dev-comms.js` and `#bugsTab` left intact and unlinked, so restoring it is one line.

**Server-authoritative pack economy (`server/tcg/packs.js`, `server/server.js`)**
- Pack buying does NOT use the casino's client-trusted pattern. The server owns the price, the rarity roll, the shiny roll, the cash debit (`safeAddCash`), and the collection/deck writes. The client sends `tcg_buy_pack` / `tcg_save_deck` / `tcg_delete_deck` and only renders what it is sent.
- Five packs, tunable constants in `packs.js`: Starter (F25,000, mostly commons, no floor, 2% shiny), Standard (F150,000, >=1 Rare, 4% shiny), Premium (F750,000, >=1 Epic, 9% shiny), Guild Crate (F500,000, Dwarves-only pool, >=1 Rare, 10% shiny), and The Vault (F5,000,000, guaranteed Legendary, epic-heavy, 15% shiny). Prices are scaled to the live economy (a typical player clears ~100k in days and is a millionaire inside a week or two), so anything that reliably rolls Epic or Legend is priced high. `packs.js` gains a per-faction pool filter (`buildPool` / `poolFor`) for the Guild Crate, and uses `floorRarity:'legend'` for the Vault guarantee.
- WS handlers: `tcg_collection`, `tcg_buy_pack`, `tcg_save_deck`, `tcg_delete_deck`.

**Persistence (`server/tcg/tcg-db.js`, `server/db.js`)**
- New additive tables: `tcg_collection(player_id, card_id, variant, qty)` and `tcg_decks(player_id, slot, name, faction, cards, updated_at)`. CREATE TABLE IF NOT EXISTS, no migration risk. `db.js` calls `initTcg(db)` at the end of `initDB()`.

**Deck-builder + play (`client/assets/tcg/`)**
- Builder is gated to cards you own and enforces the same `validateDeck` the server uses: 20 cards, one faction + neutrals, max 2 of a card (1 for legendaries), and you cannot add more copies than you own. Decks save to one of 9 slots.
- PvE matches run the rules engine client-side (deck save/load is server-backed). Opponent is the heuristic AI on a faction starter. Faction starters are always playable, so a new account with an empty collection can play immediately and build custom decks as it collects.
- Shiny is an orthogonal collectible variant: any card can roll shiny, tracked as a distinct `(card_id, variant)` row, rendered with a holographic sheen + SHINY tag. Matches deal in card ids, so shiny is cosmetic only.

**Content: Dwarves faction, Abaddon faction (`cards.js`, `deck.js`, `card-art.js`)**
- New sixth faction **Dwarves**: 50 deck-legal cards (24 common / 16 rare / 6 epic / 4 legend) plus two summon tokens (Apprentice, Pit Crew). Identity is the Guild labor caste: value through work, continuity through ruin. Mechanics are tribe synergy (anthems that buff your other Dwarves), summon-swarm, deathrattle continuity, taunt / divine-shield walls, priest heal and lifesteal, and traveler draw. Every effect uses helpers already in the engine, so no new keyword was added and the rules engine is untouched. Each member carries `tribe:'dwarf'` so synergy reads it.
- The **Abaddon** legendaries are now their own seventh faction (`faction:'abaddon'`), no longer a neutral splash. All ten are legendaries, so a mono-Abaddon deck is a deliberately top-heavy boss deck; its starter pairs the ten legends with cheap neutrals for an early game. `set:'abaddon'` is retained so the purple-glow styling survives. Pre-launch change, so no live deck is affected by pulling them out of neutral.
- Both factions are registered in `FACTIONS`, each gets a starter deck (so the AI opponent and an empty-collection player can use them), and both are wired into the builder faction picker, the collection filter, and per-faction card colors (Dwarves bronze, Abaddon purple).
- Art: 50 vintage archival portraits added at `client/assets/tcg/art/dwarves/` (grayscale + alpha, ~44KB each, ~2.15 MB total), resolved via a new `['dwarf', name]` branch in `card-art.js`.

**UI fixes**
- Artist credit: an "Art by subotai" link (to subotai-khudozhnik.itch.io, opens in a new tab) sits under the Corpo-Cards header title, matching the portrait-picker credit, added per the artist's request for use of the card and portrait art.
- Tab strip is a single strand: `.tab` gets `white-space:nowrap` + `flex-shrink:0` (labels never wrap, tabs never squish) and `.tabs` gets `flex-wrap:nowrap` + `overflow-x:auto` (the row scrolls horizontally if it overflows instead of wrapping to a second line or growing taller). This fixes both the earlier thick-tab wrap and the Arena-on-a-second-row wrap.
- Bug-report button moved from the tab strip into the header, right of Discord. The `#bugsTab` pane and `dev-comms.js` are unchanged; a hidden `data-tab="bugs"` element keeps the existing tab handler wiring, and the header button triggers it.

**Pre-ship hardening**
- `cards.js` (dual CommonJS/browser file) is now loaded in `packs.js` via `createRequire` instead of a default ESM import. A default import of it returns undefined on Node 22.5/22.6 (no ESM syntax-detection), which crashed the server on boot; `createRequire` resolves it on the CommonJS loader on every supported Node. The card loader no longer constrains the Node floor (`node:sqlite` already requires >=22.5, which the VPS runs).
- `tcg_buy_pack` grants the cards first and debits cash (`safeAddCash`) only after the grant transaction commits. Previously a throw inside the grant could take the cash and leave the player with phantom cards; the new order fails closed (error sent, no charge).
- Em dashes purged from player-visible card-game strings (tooltips, banners, reveal caption, log marker). Remaining em dashes are code comments only; the U+2212 in the deck-builder is the minus-button glyph.
- Fixed blank cards in Collection, the pack-opening reveal, and the deck-builder pool. `cardEl` resolved a card's def from a live entity (`.def`) or a `.defId` object but not from a bare string id, which is exactly what those three callers pass; a string fell through and rendered an empty frame. It now resolves a string id through `CARDS`. In-match board/hand cards were unaffected (they pass live entities). Pre-existing since the card game was built; surfaced on first real pack-open.
- Card faces and pack-opening reveal. Cards now render an element-motif background tinted by faction color (cropped from the wrapper art, full-bleed behind the portrait) instead of a flat dark gradient, so there is no black behind the figures. The pack-open reveal shows each card as a sealed wrapper of the same motif and color that peels open frame by frame, then the card pops in, flowing straight into the matching background. Wrapper sprites under `client/assets/tcg/wrap/<element>-<color>/` (27 sets x 8 frames); background tiles under `client/assets/tcg/bg/<element>-<color>.png` (27 tiles). `FAC_WRAP` in `tcg-app.js` maps faction to color (one-line dict). Non-portrait cards (ships, orders) drop the old small element-face and show the motif alone. The bottom name/text panel is a light gradient, and the name and description text each carry their own dark outline (text-shadow), so the text reads on bright gold and white motifs without needing a near-opaque dark panel behind it. Earlier the panel had to be dark enough for unshadowed text, which read as a black box over the lower third of text-heavy cards. The pack-open reveal preloads the motif tiles when the TCG UI mounts and waits for each card's motif to finish loading before flipping it face-up, so a card never reveals on its black base while the tile is still downloading behind the wrapper-frame load storm (this showed as black backgrounds during opening but not in the collection). Separately, the rarity glow on rare/epic/legendary/shiny cards in the reveal was a `box-shadow` on the slot, which is larger than the card (150x170 vs 104x158); the near-opaque reveal backdrop showed through the gap between the card and the glowing slot edge and read as a black box framing only the glowing cards. The glow now sits on the card element itself, so it hugs the card and there is no gap to frame.
- Dwarves appear less often in cheaper packs, via a per-pack `dwarfBias` weight in `packs.js` applied when picking a card within a rolled rarity. Starter pulls Dwarves ~12% of the time (down from a ~48% pool baseline), Standard ~28%, Premium ~46%; the Guild Crate stays Dwarves-only and the Vault is unbiased. Tunable constants.

**Casino: pixel-art playing cards (`casino-cards.js`, `casino-blackjack.js`, `casino-poker.js`)**
- Blackjack and Poker now render real pixel-art cards from a shared sprite-sheet renderer instead of Unicode card glyphs. New `casino-cards.js` exposes `FMPokerCard` (canvas) and `FMPokerCardHTML` (markup), backed by a sprite sheet at `assets/cards/poker-deck.png` (880x464, 48x80 cells, clubs/spades/hearts/diamonds per rank group). Both tables call it when loaded and fall back to the old text glyphs if it is not, so a failed sheet load degrades gracefully rather than breaking the table. Card backs and face-down hands use the sheet's back tile.

**Not yet built**
- PvP / server-authoritative match loop. Matches are PvE for now.

---

## v1.1.6.0 (2026-06-13) - market dynamics rework + large-order impact (SERVER + DB)

Ships as one patch. The pieces are coupled: making news a real driver creates a front-running vector, so the gap mechanic lands with it; removing the gravity that auto-reverts price requires persisting the spawn origin or the runaway backstop fires off a stale value. SERVER + DB only, no client change. Deploy is `pm2 restart fleshmarket`, no hard-refresh.

**Predictability cut (`server/server.js`, `stepMarket`)**
- Removed the 6-hour spawn re-home. Re-anchoring the gravity reference to the current price every 6h produced the predictable "always returns to recent center" oscillation traders farmed. `_spawnLnP` is now a fixed origin.
- Removed the +50% graduated pullback (40% trigger, 0.8-2% yank). This was the core "fade the extremes always pays" mechanic and the single most farmable pattern in the engine. Trends are now allowed to run; direction is no longer auto-reverted. The far lifetime-gain backstop (+394%, +1500%) and the F5000 split are the only remaining ceilings.

**Wildness cut (`server/server.js`, `stepMarket`)**
- Per-stock sigma ceiling lowered 0.0015 -> 0.0009 in the vol-clustering clamp.
- Fat-tail multipliers softened 2.2/1.4 -> 1.7/1.25.
- Removed the invisible rare in-tick event (0.05%/tick, 0.3-0.9% uncaused jump). Uncaused spikes read as rigged and are un-tradeable noise. All discrete moves now carry a headline.

**News is now a real driver (`server/server.js`, `genHeadline`)**
- A company headline previously moved price ~0.02-0.08% (flavor). It now moves ~0.8-2% on a real headline, ~0.4% on weird. The move splits into an instant gap (70%, applied the moment the headline prints so reading the public feed gives no tradeable lead) plus a thin decaying drift delivered over ~2 minutes (`c.newsBias` / `c.newsBiasTicks`, summed into the per-tick delta). Earnings remain an instant gap and are unchanged.

**Large-order market impact (`server/server.js`, `order` handler)**
- Orders above F1,000,000 notional now pay slippage and move the tape; sub-threshold orders are unchanged (fill at quote, zero impact). Computed per executed leg, not per order qty, so a tiny short-cover attached to a huge order cannot move the tape.
- The trader eats their own impact: the fill is priced off the move they cause (buy avg ~ +slip/2, sell avg ~ -slip/2), then the tape (`c.lnP`) is pushed once after all money math. A big correct bet partly closes its own edge instead of printing free size.
- Symmetric by default: big buys and covers push up, big sells and short-opens push down. Curve: F1.5M -> 2%, F2M -> 4%, F3M -> 8%, F4M+ -> 12% cap (stock at F20). `IMPACT_SELL_SIDE=0` makes it buys-only.
- Threaded through all four legs (short cover, long buy, normal sell, short open incl. long-clear). Long-buy now sends an explicit "Insufficient funds." error instead of failing silently.

**Required companion fix (`server/server.js` restore, `server/db.js` save)**
- `_spawnLnP` (the origin the lifetime-gain backstop measures from) was set at module-load to `log(random 8-60)` and never persisted or restored. The 6h re-home masked it. With the re-home gone it would fire the backstop off a stale value after every restart. `_spawnLnP` is now saved in market state and restored, falling back to the restored price if no persisted origin exists.
- Init price is now seeded deterministically by company name (`rngSeeded(name,'initprice')`) instead of `Math.random()`. Masked by restore on the live DB; only affects fresh boots and newly added companies.

**Tunables (env)**
- `IMPACT_THRESHOLD_C` (default 100000000 = F1,000,000 notional in cents), `IMPACT_K` (0.04), `IMPACT_MAX_FRAC` (0.12), `IMPACT_SELL_SIDE` (1 = symmetric, 0 = buys-only), `NEWS_GAP_FRAC` (0.7), `NEWS_DRIFT_TICKS` (240).

**Known limitation**
- Notional gating is per-order. A determined whale can split a large buy into multiple sub-F1,000,000 orders to dodge entry impact (accumulation costs no day-trades; only paired sells consume the 3-per-cycle cap). Closing this needs rolling cumulative-notional tracking per player and symbol, deferred. The symbol-reshuffle reroll vector (restore keyed by symbol, symbols assigned by an order-dependent dedup loop) is also still open; seeded init only makes fresh boots deterministic.

---

## v1.1.5.8 (2026-06-11) - Father Xen branching codec dialogue + faction-sync fix (CLIENT)

**Codec engine (`client/assets/codec.js`)**
- New faction-router tree node: `id:{ branch:{ faction, match, other } }`. When the engine reaches it, it silently redirects to `match` if the caller's faction equals `faction`, else to `other` - no text, no button, the player never sees the branch. Reads `window.gPlayerFaction` (falls back to `window.ME.faction`). Linear quests and the Mr. Flesh tree are untouched.

**Father Xen lore conversation (`client/assets/codec-data.js`)**
- Father Xen (Void Collective tech-priest) gets a GM-authored branching tree (14 nodes) and is now `enabled`. Opens on a greeting with two paths: the question menu and a work stub ("Not yet. Return to me later.").
- Question menu: the Collective's goal (deflects into a "have you been talking about me" Yes/No that converges, then the mission monologue, then a follow-up on why others dislike them), why they hack other factions (surveillance / outer-planet isolation), their beliefs (unity, then an Abraxas explainer), and his read on Mr. Flesh's mandate.
- Faction-aware augment beat: after the augment line, the priest "scans" the caller. Void Collective members get the recognition line ("two scholars of Abraxas..."); everyone else gets the rejection ("you lack the augment..."). Implemented with the router node.
- The placeholder COMMUNION quest is parked (kept as dormant data, `quests:[]` set) so the lore tree plays in the idle slot, mirroring Mr. Flesh. Restore the quest by removing that empty array once the Void questline ships. Rep `ver` v0.13 -> v0.14.
- Graph-validated (no dangling refs, all 14 nodes reachable, every node can reach a hangup, faction-branch targets resolve, no em dashes in player-visible text) and flow-smoke-tested including the void/non-void routing.

**Faction-sync fix (`client/assets/galaxy.js`, `client/assets/core.js`)**
- Found while testing the augment branch: it routed everyone to the rejection line even after joining Void. Root cause was not the dialogue. `galaxy.js` is an IIFE, so its `gPlayerFaction` is a module-local variable; the `welcome` and `faction_joined` handlers updated only that local, never `window.gPlayerFaction` - the global the codec (and the header badge, and any cross-module reader) actually uses. `ME.faction` is set only at login, so it was stale after a mid-session join, and `core.js` gated its `window.gPlayerFaction` write behind a `typeof ... !== 'undefined'` check that never passed.
- `galaxy.js`: `welcome` and `faction_joined` now mirror the faction to `window.gPlayerFaction` and `window.ME.faction`, so a mid-session join is reflected immediately without a reload.
- `core.js`: portfolio sync now sets both whenever the snapshot carries a faction (removed the dead guard). The portfolio refresh the join already requests reinforces it.
- Effect: joining Void routes Father Xen to the recognition line live; every other consumer of `window.gPlayerFaction` is fixed too.

**Planet-detail lore: cold-terminal rewrite (`client/assets/galaxy.js`)**
- The detail page is a trader's data feed, not a lore page. Stripped the AI prose cadence (antithesis "it is not X, it is Y", editorializing, faction personhood) from every planet detail that was not hand-authored. Rewrote 16 colonies as cold descriptions of what the place is plus its economic and control facts: the 13 outer/financial/industrial colonies (New Anchor, Cascade Station, Frontier Outpost, The Hollow, Vein Cluster, Aurora Prime, Dust Basin, Nova Reach, Iron Shelf, The Ledger, Signal Run, Scrub Yard, Margin Call), the two Void-home colonies (Null Point, The Escrow), and Limbosis. Limbosis was re-anchored to Mr. Flesh's canonical line about it (former weapons lab, built the laser aimed at Abaddon's black holes, design later installed at Flesh Station) and rendered cold. Population and the corporation list are dropped from the lore text since the panel already renders them separately. The five remaining authored colonies (Lustandia, Gluttonis, Abaddon, Eyejog, Flesh Station) are left untouched. Lore text only; no mechanics, companies, or bonuses changed. No em dashes in any player-visible string.

CLIENT-only: hard-refresh, no server restart needed. Sits on top of 1.1.5.7.

---

## v1.1.5.7 (2026-06-11) - short-selling rework: collateral, gated margin calls, debt settlement, Debtor brand, net-worth fixes + countdown UI (SERVER + DB + CLIENT)

Everything below ships as one patch. The short mechanic was rebuilt end to end; the pieces are coupled (a margin trigger without locked proceeds just re-opens the money printer), so they land together.

**Net-worth correctness (`server/server.js`, `server/db.js`)**
- Two sites computed equity with `price * Math.abs(qty)`, counting a short as a positive asset - net worth rose as a short went underwater. Now signed `price * qty` everywhere: a short subtracts its cover cost. This fixed a live overcharge on the 45% dunce-escape fine for short-holders.
- One net-worth helper (`playerNetWorth`) is now the single source of truth for the portfolio snapshot, the dunce-escape fine, and the leaderboard: cash + signed equity + locked short collateral + Capital House stake.

**Collateral-locked shorts (new `short_coll` table)**
- Shorting no longer credits proceeds to spendable cash. Proceeds (minus tax) lock as per-symbol collateral (`shortCollC`); the only way to realize cash from a short is to cover at a profit. This kills the short-extract-then-get-wiped exploit at the source.
- No share cap, no upfront cash margin (the old 500-share cap and 50% margin gate are gone). Cover releases the proportional collateral and pays the cover cost from it; cash is only needed for a loss beyond collateral.
- Migration-free: collateral is 0 for shorts opened before this deploy (their proceeds are already in cash), so legacy positions are auto-grandfathered with no double-count - unit-proven that legacy and new shorts net to the identical figure.

**Gated margin calls (new `margin_calls` table)**
- A short crossing 1.65x its average entry (65% underwater) issues a margin call with a 3-hour deadline, persisted so the clock survives restart and logoff. Covering the position or the price recovering below 1.60x clears it (hysteresis stops flapping). A 5s sweep issues/clears for connected players and enforces deadlines for all active calls, re-checking live state so a player who covered or recovered is never settled.

**Debt settlement at the deadline - NOT a total wipe**
- If a short is still >= 1.65x at the deadline, it's force-closed and the realized loss becomes a debt, collected from cash first, then by liquidating long holdings (largest first) only as much as the debt needs. A player who can pay keeps the rest and is NOT dunced. Only a player whose loss exceeds their entire account is zeroed - the natural bankruptcy case - and that player gets the Debtor brand + dunce. Wealth (including stock) is on the hook, so you can't shield it in holdings and walk away. Fund stake is never touched.
- Dunce keeps trade access (gates chat only); escape is reason-gated - margin-call dunce = flat Ƒ25,000, mod (`/dunce`) dunce = 45% of net worth.

**Debtor brand**
- Bankruptcy grants the `Debtor` title (auto-owned, equippable). Worn, name + chat go poop-brown (`#6b4423`), below structural roles but overriding tier/cyborg colour.

**Net worth counts tied-up money**
- Leaderboard and net worth now include locked short collateral and each player's Capital House stake (their share of every fund's NAV, across the legacy fund and multi-house funds - pro-rata by shares, not credited to the owner).

**Client (`client/index.html`, `client/assets/core.js`, `client/assets/shorts.js`)**
- Margin-call banner: shows the called symbol, a live countdown (HH:MM:SS, red in the final 15m, "SETTLING…" at zero), and a COVER NOW button. Driven by the `marginCall` field in the portfolio snapshot, so it survives reconnect and clears on resolve; the server pushes a portfolio refresh on issue/clear so it appears/clears instantly.
- Short modal fixed for the collateral model: removed the stale 500 cap and 50% margin gate (which were blocking the now-allowed shorts), relabeled "proceeds received" to "collateral locked (held, not cash)" and added the liquidation price (entry x1.65).

Unit-tested: net-worth signed/invariance, collateral lock (zero spendable cash from shorting), cover P&L, 1.65x trigger, gating state machine (issue/clear/recover/hysteresis), debt settlement (solvent-from-cash, solvent-via-liquidation, bankruptcy, healthy-assets-preserved), and the countdown banner. Limit orders confirmed unable to open shorts (no bypass).

Untested live (no DB/WS in the build sandbox): schema auto-create on first boot, WS broadcasts on settlement, and the per-call fund-stake DB reads in `snapshotPortfolio` (fine at current concurrency, cacheable later).

SERVER + DB (two new tables, `short_coll` and `margin_calls`, both `CREATE TABLE IF NOT EXISTS` on boot; no manual migration) + CLIENT. Back up `server/fleshmarket.db`, `pm2 restart fleshmarket`, then hard-refresh (client assets aren't cache-busted).


---

## v1.1.5.6 (2026-06-11) - Mr. Flesh branching codec dialogue (CLIENT)

**Codec engine (`client/assets/codec.js`)**
- New branching dialogue mode alongside the linear quest scripts. A rep may carry `tree:{ start, nodes }`; each node is one NPC line plus response options rendered as left-aligned amber buttons. Selecting an option jumps straight to the next NPC line - the option label is NOT re-spoken as a player line (the player already read it on the button, so echoing it made them read it twice). Options either chain to another node, loop back to a question menu, or hang up (`end:true` -> CHANNEL CLOSED). Trees play only in the idle/all-done slot, so a future Mr. Flesh quest pitch or active-quest line still takes priority over the lore tree.
- `typeLine` gained a completion callback and the skip-typing path was unified into `finishLine` (full text from `st.fullText` instead of re-reading `st.cur.lines[idx]`, which would have thrown in tree mode). `buttons()` clears the `opts` column layout on every repaint so quest/close buttons render normally after a tree. Option hotkeys 0-9 (0 selects the 10th option, if present). Linear quest scripts (with authored `from:'you'` lines and the YOU frame) are unchanged - the no-echo rule is specific to button-selected tree options.

**Mr. Flesh lore conversation (`client/assets/codec-data.js`)**
- Replaced the idle "Get back to work..." brush-off with a GM-authored branching lore tree (21 nodes). Call opens on "Make it quick." with two paths: "I have some questions" (the lore menu) and "Do you have any work?" (stub: "Not now, but do you need anything?" - the future questline entry point; "A few things" returns to the opening, the other option hangs up).
- Lore menu has nine questions: the four faction threads (Coalition, Void, Merchant Guild, Syndicate, each chaining per the source script and looping back to the menu) plus five single-answer questions (origin, why anyone plays a rigged game, who sets Social Credit value, debt consequences, why the casino floor exists). Each single answer closes back to the menu or hangs up.
- War-timeline lore lives entirely in the Coalition thread: co1 has the Coalition formed from the fourteenth corporate war sixty years ago, then winning the fifteenth (and last) war twenty-nine years ago and holding the ruling seat into the modern day. The earlier standalone "when is the sixteenth war" question was removed as redundant; its fact was folded into co1.
- `idleLine` kept as a fallback if the tree is ever removed. Rep `ver` bumped v0.11 -> v0.12. Graph validated (no dangling node refs, all nodes reachable, every node has a path to hangup, no em dashes in player-visible text); jsdom smoke test covers the no-echo tree flow, the work stub loop, faction-thread loops, hangup, the folded co1 lore, hotkey selection, and a linear-quest regression (30 assertions).

CLIENT-ONLY: hard-refresh, no server restart needed.


---

## v1.1.5.5 (2026-06-10) - cancel auto-accumulate (SERVER + CLIENT)

**Auto-Accumulate cancel (`server/server.js`, `server/db.js`, `client/assets/market-upgrades.js`)**
- You could arm/pause/fund/withdraw an auto-accumulate but never remove one. Added a Cancel button per config: it deletes the config and returns the full segregated reserve to your main balance.
- New `auto_accum_cancel` WS handler reads the reserve, deletes the row (`deleteAutoAccum`), then credits cash by the exact reserve. Single-threaded + synchronous SQLite means the read/delete/refund completes before the accumulate engine can fire again, so there is no overspend race; money is conserved by construction, and cancelling a nonexistent config is a no-op. Verified against an in-memory SQLite copy of the schema (row removed, sibling configs and other players untouched, cash up by exactly the reserve).

SERVER CHANGE: requires `pm2 restart`, then hard-refresh the client.

---

## v1.1.5.4 (2026-06-09) - Ƒbay listings show item art (CLIENT)

**Ƒbay market listings (`client/assets/inventory.js`)**
- Listings rendered the slot emoji (`SLOT_ICONS[item.slot]`) instead of the item sprite, so every entry showed a generic glyph. Swapped in the existing `itemIcon()` helper, which renders the pixel-art `item.img` when present and falls back to the slot emoji otherwise. Catalog art is available for all listings regardless of ownership (`ITEM_CATALOG_CLIENT` lives in this module), so no lazy-load was needed. Inventory/equip views already used `itemIcon`; only the market list was missing it. The SLOTS spin reels keep slot emojis on the outer reels by design.

CLIENT-ONLY: hard-refresh, no server restart needed.

---

## v1.1.5.3 (2026-06-09) - Capital House holdings click-to-ticker nav (CLIENT)

**Capital House portfolio (`client/assets/funds.js`)**
- Applied the personal-P&L click-to-navigate behavior to Capital House / fund holdings. Clicking a holding row in the text list, or a bar in the portfolio chart, now opens that symbol in Market (via `window.FMGotoSymbol`). Bar-chart hit-test uses the deterministic row geometry (`PAD_T + i*ROW_H`), the same pattern as the personal P&L chart, and reads `canvas._gRows` live so it stays correct across re-marks, filtering, and sector grouping.

CLIENT-ONLY: hard-refresh, no server restart needed.

---

## v1.1.5.2 (2026-06-09) - ticker-list separator + Galaxy contracts legibility (CLIENT)

**Companies list (`client/assets/core.js`)**
- Restored the dash separator between ticker and lore name (the em-dash sweep had turned "SYM — Name" into "SYM, Name"). Deliberate scoped exception to the no-em-dash rule: this separator is a data label, not prose.

**Galaxy > Contracts legibility (`client/assets/galaxy.js`)**
- The lane-shares positions/table and shipping-contracts board read dulled. Cause: hardcoded dim grays (#444 route separator, #555 labels/column headers, #666 label dash + expiry, #778 strike/expiry) that the --muted brighten never reached (galaxy.js uses literal hex, not the CSS var). Brightened those values inside the contracts render only; other Galaxy sub-pages untouched.

NOTE: the v1.1.5.1 "net zero player-visible em dashes" claim was incomplete. The sweep matched the literal "—" character only; galaxy.js still has \u2014 unicode-escaped em dashes (contracts description, contract toasts) the sweep never saw. Not addressed here.

---

## v1.1.5.1 (2026-06-09) - news overhaul + live header + dev breaking-news + FLSH/BRNC + phosphor + em-dash cleanup (SERVER)

**Phosphor legibility (`client/style.css`, `client/assets/core.js`)**
- Text read too faded. Root cause was the CRT overlay (`mix-blend-mode:multiply`) dimming the bright green, plus a dim `--muted` token. Brightened `--muted` (#72e09c -> #9af2bf), removed the .9 opacity on `small`/`.muted`, retargeted dim-as-text to muted, and reduced the CRT scanline/vignette darkening (0.22 -> 0.15, 0.35 -> 0.26) so text reads brighter while keeping the scanline look. Fixed the over-dark news-header subtitle. Primary `--green` left unchanged (it was already bright).

**Em-dash cleanup (entire game)**
- Removed em dashes from all player-visible text across server and client (news strings, headlines, chat/system messages, NPC dialogue, item text, UI labels, placeholders). Comments and changelogs keep em dashes per house rule. Net zero player-visible em dashes verified game-wide.


**News content (`server/server.js`)**
- Three new headline categories with their own `genHeadline` branches: faction political/economic moves (`FACTION_NEWS`, ~12%), Mr. Flesh / FLSH house flavor (`FLESH_NEWS`, ~5%), rare cosmic-weird drip (`RARE_WEIRD`, ~3%). All tickerless, no price impact.
- New `COMPANY_GENERIC` good/bad/weird pool merged into the per-company branch so any ticker draws sector lore plus a cross-sector pool (roughly doubles company-headline variety).
- Expanded `MARKET_WIDE` (+15) and `COLONY_FLAVOR` (+8). Routing rebalanced: 3% void / 12% faction / 5% flesh / 13% market / 10% colony / ~57% company. New strings are em-dash-free per the player-text rule; pre-existing strings still use them (not touched).

**Live news header (`client/index.html`, `client/assets/core.js`, `server/server.js`)**
- New `#news-header` bar above the feed. Default shows a LIVE NEWSFEED label; a dev can push custom breaking news (tone-colored banner). Server holds `breakingNews`, broadcasts `breaking_news`, and includes current state in the `init` payload. `renderNewsHeader` handles init + live updates + a default on DOM ready.

**Dev breaking-news control (`client/index.html`, `client/assets/god-panel.js`, `server/server.js`)**
- God panel News tab: text + tone + Set Breaking / Reset to Default. New dev-gated `god_cmd` sub-command `breaking_news` sets or clears the header for all clients.

**FLSH fund -> 100T (`server/db.js`)**
- Fee accrual was glitched/unused; pinned to a flat 100,000,000,000,000 marker via a one-shot guarded by a `fund_state` sentinel (`flsh_100t`). Runs once on deploy, never resets a later manual change. Fresh-DB seed bumped to 100T.

**BRNC -> flat Ƒ0.50 (`server/server.js`)**
- Hard-locked flat at Ƒ0.50 in `stepMarket`, identical treatment to SWT (price + lnP pinned, flat OHLC bars). Excluded from company-news nudges. Reprice from Ƒ65 — existing holders take the haircut.

---

## v1.1.5.0 (2026-06-09) - market upgrades tier + P&L click-to-navigate (SERVER)

Help-desk feature drop. A purchasable market-upgrades tier (modeled on the mining-upgrade system) plus a P&L navigation fix.

**Market upgrades (`server/db.js`, `server/server.js`)**
- New `MARKET_UPGRADE_CATALOG`: `sma` (Ƒ250k), `price_history` (Ƒ500k), `auto_accumulate` (Ƒ5M). Ownership in new `player_market_upgrades` table; `initMarketUpgradeTables` / `getMarketUpgrades` / `hasMarketUpgrade` / `grantMarketUpgrade`. WS: `market_upgrades_list`, `market_upgrade_buy` -> `market_upgrades_state` / `market_upgrade_purchased`.
- SMA overlay (`client/assets/core.js` `drawChart`): SMA-20 line drawn in the chart's own coordinate space, gated on owning `sma`.
- Extended price history: chart handler serves up to 400 bars (vs 199) when the player owns `price_history`. Data was already retained server-side; this lifts the send cap.

**Auto-Accumulate (`server/db.js`, `server/server.js`)**
- Segregated-reserve model: a per-symbol reserve funded out of main cash up front. The engine spends ONLY from reserve_c; main cash is never touched by auto-buys. `player_auto_accum` table; `setAutoAccumConfig`, `adjustAutoAccumReserve` (overdraw-guarded), `getArmedAutoAccum`, `spendAutoAccumReserve` (atomic debit guard). All money in cents, no bitwise ops (values exceed 32-bit).
- Engine (`setInterval`, 15s; 60s per-symbol cooldown): for each armed config on an online player, if last price <= avg cost * (1 - drop_bps/10000), buy a clip sized by min(clip, reserve) accounting for trade tax, atomically debit the reserve, update holdings + basis, take the FLSH cut + treasury tax, broadcast the fill, notify the player. Self-throttling: buying below avg lowers avg, which lowers the next trigger. Online players only (v1); offline is a future extension.
- WS: `auto_accum_get` / `auto_accum_set` / `auto_accum_fund` / `auto_accum_withdraw` -> `auto_accum_state`. Fund deducts cash first then credits reserve; withdraw debits reserve (guarded) first then credits cash, so a failure can never create credits.
- Control surface: `client/assets/market-upgrades.js` panel in the market tab (buy upgrades; configure threshold/clip; fund/withdraw reserve; arm/pause per symbol).

**P&L click-to-navigate (`client/assets/core.js`)**
- Shared `window.FMGotoSymbol(sym)` helper (set symbol input, request chart, switch to Market, scroll). Wired to the positions list rows and the P&L bar chart (canvas click hit-test by row height). News lines now route through the same helper.

**Chat avatar fix for item-backed portraits (`client/assets/core.js`, `client/assets/player-profile.js`)**
- Item-backed chat avatars (clothing/implant portraits, Mr. Flesh's Preserved Brain) resolve from the item catalog, which is lazy-loaded only on the inventory/store tab. Viewers who had not opened those tabs saw a blank avatar; the owner saw their own fine. Chat now lazy-loads the catalog on demand when an item-backed avatar appears and refills any avatars that could not resolve. New shared `FMPortraitNeedsCatalog` helper mirrors the existing header/picker pattern. Note: Mr. Flesh's avatar only shows if his account portrait is actually set (select the Preserved Brain in his profile).

---

## v1.1.4.0 (2026-06-09) - codec quest system + gated portraits + Mr. Flesh (SERVER)

One feature drop, built across several internal checkpoints and shipped together. Codec calls go live, quests persist and complete server-side, portraits can be unlocked by equipping items, and Mr. Flesh joins the contact list.

**Codec calls + quests**
- Codec calls enabled. RE4-style call UI with a BACK control (Backspace) and tuned panel/portrait sizing.
- Quest persistence (`server/db.js`): new `player_quests` table (CREATE TABLE IF NOT EXISTS) with `initQuestTables`, `acceptQuest`, `getPlayerQuests`, `getQuestStatus`, `completeQuest`. `completeQuest` transitions `active -> completed` once only, so a quest can never pay out twice.
- Declarative completion framework (`server/server.js`): `QUEST_DEFS` maps quest id -> objective + reward; `tryCompleteQuest(player, eventType, ev)` completes the first matching active quest and grants the reward in one place. Objective types: smuggle, ship_arrive, war_fund, blockade, short_hold. Reward supports delivered/seized branches, spins, cash, stake refund, item drops.
- Multi-quest-per-rep engine (`client/assets/codec.js`, `codec-data.js`): reps carry `quests:[]` (linear chain; current = first not completed), with legacy single-`quest` fallback and a rep-level `allDoneLine`.
- COLD OPEN is the first wired quest: smuggle Encrypted Data Cores (`data_cores`) New Anchor -> The Hollow; seized = stake refund + 1 spin, delivered = 3 spins. Hooked via `resolveSmuggling`; `resolveShipping` success calls `ship_arrive` (no-op until a deliver quest exists).
  - LIMITS: only COLD OPEN has a def + dialogue. war_fund / blockade / short_hold types exist in the matcher but have no call sites yet (one-line hook each when those quests are written). "Standing" still cosmetic.

**Live-gated portraits** (`server/server.js`, `server/db.js`, `client/assets/player-profile.js`, `core.js`)
- A portrait can require a specific equipped item: equip to unlock it as your avatar, unequip (or equip over it) and the avatar reverts. First entry: the Preserved Brain (`jarred_brain` implant). Server gates `/api/portrait` and clears the stored portrait on unequip (`enforcePortraitGate`); `isItemEquipped` added. Shared `FMPortraitSrc` resolver feeds header, profile, chat, and picker; the picker shows gated portraits under "Equipped Unlocks" only while their item is equipped.

**Mr. Flesh contact** (`client/assets/codec-data.js`)
- Added as a fifth contact under a new `flesh` faction (gold). Portrait reuses item art via an `item:<id>` form resolved from `ITEM_CATALOG_CLIENT` (data-URI sprites); item-backed portraits render `image-rendering:pixelated` so they stay crisp scaled up. The item catalog (lazy `inventory.js`) is loaded on demand by the codec / picker / header when an `item:` portrait needs it. role/blurb are functional stand-ins pending his real voice.

**This deploy's call state:** all four faction reps (McHallan, Rahtan, Jaquet, Xen) Offline; only Mr. Flesh callable ("Get back to work..."). Re-enable faction reps for testing after the push.

SERVER + client change; `pm2 restart` required (new `player_quests` table auto-creates), then hard-refresh.

---

## v1.1.3.6 (2026-06-08) - codec contacts copy + portrait pass

- **Contact descriptions rewritten** (`client/assets/codec-data.js`): all four faction-rep blurbs (McHallan, Rahtan, Jaquet, Father Xen) replaced with in-world briefing text framing each rep's relationship to FLSH station. No em dashes in player-visible copy. Roles and faction ids unchanged; Xen stays Void Collective (resolved a "Null Syndicate" naming collision with Jaquet's Syndicate).
- **Contacts list readability** (`client/assets/codec.js` CSS only): contact portrait avatars 48px to 76px; cards top-align so the larger portrait sits beside the now-longer multi-line text; blurb color `#5f8f74` to `#9fc7b5` and size .66rem to .74rem with looser line-height; panel width 460px to 520px to fit the longer copy.

Files: `client/assets/codec-data.js`, `client/assets/codec.js`, `client/version.json`.

Client change; hard-refresh required after deploy. Codec calls remain disabled (`CALLS_ENABLED = false`).

---

## v1.1.3.5 (2026-06-06) - fix commodity round-trip exploit

- **Commodity exploit closed** (`server/server.js`): a same-colony buy then immediate sell of the same lot printed credits. Both legs priced off the same stored mid, and the buy committed its upward price impact before the sell read it, so a trader front-ran their own market impact; the sell's downward nudge only eased 60% back, so repeat cycling ratcheted the baseline up and compounded. There was no spread and no sell-side friction, so the round trip on any non-guild colony was pure profit (~Ƒ14.8M on a 100k lot of a high-base commodity). Fix: fills now price off the POST-impact price. `nudgeCommoditySupply` was split into a non-writing `previewCommodityPrice` plus a commit step; buys gate funds on the previewed post-impact price then commit the nudge; sells apply impact first then price the fill off the depressed price. A round trip now eats slippage both ways (the same 100k lot that printed ~Ƒ14.8M now costs ~Ƒ8.9M). Legitimate cross-colony arbitrage is unaffected.

Files: `server/server.js`, `client/version.json`.

Server-only logic change; no client cache-bust or hard-refresh needed.

---

## v1.1.3.4 (2026-06-06) - temporarily disable codec calls

- **Calls disabled** (`codec.js`): codec calls are gated behind a new `CALLS_ENABLED = false` flag until the quest system and fixes land. The Contacts list and rep profiles still open, but each call button is redded out (class `.off`), relabeled "Offline", and inactive; clicking it (or a card) only toasts. `FMCodec.call` also early-returns while disabled. Flip the one flag to re-enable.

Files: `client/assets/codec.js`, `client/version.json`.

Cumulative over v1.1.3.3 and earlier (note: 1.1.2.9 through here are one combined push if you have not pushed since the portraits upload).

---

## v1.1.3.3 (2026-06-06) - bigger chat avatar + glowing art credit

- **Larger chat avatar** (`core.js`): chat-line portrait bumped from 30px to 40px.
- **Glowing credit** (`player-profile.js`): the "Art by subotai" link now pulses with a phosphor glow and is larger/bolder so it reads clearly when the picker opens.

Files: `client/assets/core.js`, `client/assets/player-profile.js`, `client/version.json`.

Cumulative over v1.1.3.2, v1.1.3.1, v1.1.3.0, v1.1.2.9 (portraits) and earlier - none of which have been pushed yet.

---

## v1.1.3.2 (2026-06-06) - portrait artist credit

- **Art credit** (`player-profile.js`): the portrait picker now shows an "Art by subotai" link under the title, opening https://subotai-khudozhnik.itch.io/ in a new tab (rel=noopener).

Files: `client/assets/player-profile.js`, `client/version.json`.

Cumulative over v1.1.3.1 and earlier.

---

## v1.1.3.1 (2026-06-06) - header portrait badge + bigger chat avatar

- **Header identity face** (`client/index.html`, `funds.js`, `core.js`, `player-profile.js`): a circular portrait now sits left of your name in the header (`#fm-header-portrait`), styled like a company-account badge. Clicking it opens the portrait picker, so portraits are reachable from both the header and the profile popup. Empty state shows a + prompt. Portrait is now included in the login, session-restore, and WS welcome payloads so the face paints on load; `window.FMHeaderPortrait()` repaints it live on change and on auth.
- **Chat avatar legibility** (`core.js`): chat-line avatar bumped from 20px to 30px with a 2px faction-colored ring.
- **Rename** (`portrait-manifest.js`): the "Nano-Infected" portrait category is now "S'weet Addict".

Files: `server/server.js`, `client/index.html`, `client/assets/core.js`, `client/assets/funds.js`, `client/assets/player-profile.js`, `client/assets/portrait-manifest.js`, `client/version.json`.

Cumulative over v1.1.3.0 and earlier.

---

## v1.1.3.0 (2026-06-06) - faction rep contacts + codec calls

- **Contacts + codec calls** (new `client/assets/codec.js`, new `client/assets/codec-data.js`, `client/index.html`): a "☎ Contacts" button in the chat tab bar opens a list of four faction reps. Calling one launches a codec-style transmission overlay (ring -> accept -> portraits + name + typewriter dialogue -> contract offer with accept/decline), faction-themed via a `--fac` CSS var, using the real portrait set. The player's own selected portrait appears in the outgoing window.
  - Three-layer split from the prototype is preserved: `codec.js` is the dumb engine (knows nothing about quests), `codec-data.js` is GM-authored rep/conversation data, and the quest payload is handed to a single `onQuestAccepted` hook. That hook is a thin stub for now: it records the accepted contract in an in-memory `window.FM_QUESTS` and toasts. No server changes this patch; live quest tracking + persistence is the next decision.
  - Reps: Captain Trisha McHallan (Coalition, corpo2), Rahtan (Merchant Guild, corpo7), Jaquet (Syndicate, hacker1), Father Xen (Void Collective, cyborg11). Rep portraits are assigned from the selectable set and easy to swap. The Contacts button is intentionally not a `.chat-tab` so it does not trigger channel switching.

Files: `client/assets/codec.js` (new), `client/assets/codec-data.js` (new), `client/index.html`, `client/version.json`, `docs/MANIFEST.txt`.

Cumulative over v1.1.2.9 and earlier.

---

## v1.1.2.9 (2026-06-06) - player portraits in chat + profile

- **Selectable player portraits** (new `client/assets/portraits/` 60 PNGs, new `portrait-manifest.js`): players choose a portrait and it renders as a small avatar next to their name in every chat room.
  - Server: new `portrait` column on `players` (migration in db.js `_migrations`), exposed on the hydrated player and via `setPlayerPortrait`. New `POST /api/portrait` validates the chosen id against `PORTRAIT_SET`, an allowlist read from the portraits dir at boot (so the client can never inject an arbitrary `<img src>`). Portrait is added to the main + dunce chat payloads and to the `/api/items/profile/:name` response (alongside `faction`).
  - Client: `addChat` renders a 20px avatar from `item.portrait` (sanitized, clickable to open the profile). The profile popup shows the portrait; on your own profile a "change" link / clickable avatar opens a grouped picker modal (`window.openPortraitPicker`) that POSTs the choice and updates live. Manifest is generated from the asset filenames, grouped Corporate/Cyborg/Hacker/Nano-Infected/Street.

Files: `server/db.js`, `server/server.js`, `client/assets/core.js`, `client/assets/player-profile.js`, `client/index.html`, `client/assets/portrait-manifest.js` (new), `client/assets/portraits/` (60 PNGs, new), `client/version.json`, `docs/MANIFEST.txt`.

Cumulative over v1.1.2.8 and earlier.

---

## v1.1.2.8 (2026-06-06) - trader's calculator under Ship Cargo

- **Pixel-art calculator** (`calc.js` new, `calc/buttons/*.png` new, `galaxy.js`, `index.html`): added a self-contained calculator widget below the Ship Cargo console in the Galaxy Markets view, for working out spreads and shipping math without leaving the tab. Uses the supplied key sprites with a CSS body and screen matched to the art palette (body #736fa1, screen #4b4173/#2e2747, keys are the sprite PNGs). Supports digits, decimal, + - * /, square root, percent, sign toggle, clear, and delete via an accumulator state machine (no eval). Mouse/touch only so it never steals keystrokes from the adjacent commodity search field. Mounted by `renderMarketsTab` after render; state is module-level so the displayed value survives a view re-render. Arithmetic verified against the same state machine (chained ops, sqrt, percent, divide-by-zero -> ERR).

Files: `client/assets/calc.js` (new), `client/assets/calc/buttons/` (28 PNGs, new), `client/assets/galaxy.js`, `client/index.html`, `client/version.json`, `docs/MANIFEST.txt`.

Cumulative over v1.1.2.7 and earlier.

---

## v1.1.2.7 (2026-06-06) - clear announcements + shipping-risk cap order fix

- **Clear pinned announcements** (`core.js`): announcements were stuck until their duration expired with no way to remove one early. The pinned banner now shows an admin-only clear control (✕) that calls the existing `/api/admin/broadcast/clear` and removes the banner for everyone via the `announcement_clear` broadcast. No server change; the endpoint already existed from v1.1.2.2, it just had no UI.
- **Shipping risk cap-before-subtract** (`server.js`): in `/api/cargo/quote` and `/api/cargo/ship` the interception chance was computed as `min(0.50, raw - guardCut)`, so a run whose raw risk exceeded 50% stayed pinned at 50% even after buying an escort, because the escort cut was subtracted from the pre-cap number and the result was still above the cap. Now the risk-increasing terms (base + ship mod + fly-by) are capped at 50% first, then the escort cut (including Private Army's 26%) is subtracted: `max(0.03, min(0.50, raw) - guardCut)`. Example: an 80% raw run with Private Army now shows 24% instead of 50%. Both endpoints use the identical formula so the quote preview matches the resolution roll. Runs already below the cap are unaffected.

Files: `server/server.js`, `client/assets/core.js`, `client/version.json`.

Cumulative over v1.1.2.6 and earlier.

---

## v1.1.2.6 (2026-06-06) - Fleshbook UI reskin (in-universe terminal feed)

- **Removed the top blurb** (`fleshbook.js`): the "the colonies talk, Mr. Flesh listens..." line read as filler and contained an em dash (an AI tell banned from player-visible text). Gone.
- **Platform-matched chrome** (`fleshbook.js`, `index.html`): the panel previously used `#4ecdc4` (the Coalition faction colour) as its accent and Courier, so it looked like a teal app bolted onto the game. Now uses the platform tokens: amber (`#f0b454`) and green chrome, `IBM Plex Mono` inherited from the body, dark green-tinted surfaces. A compact sticky terminal header replaces the paragraph: FLESHBOOK wordmark, a dim PUBLIC FEED label, and a small live indicator.
- **Faction colour reserved for identity** (`fleshbook.js`): each post carries a left accent stripe in the author's faction colour (gold if pinned), and the faction label is uppercased next to the name. GM posts are tagged FLESH CORP in gold.
- **Vocabulary** (`fleshbook.js`): upvote is reframed as a signal boost (▲) since boost is already the platform's language; replies collapse to a ↳ glyph with a count; the post button reads BROADCAST; empty state reads "No broadcasts yet." No em dashes in any player-visible string.
- **Layout fix** (`index.html`): the Fleshbook tab overlapped the tab bar. Cause: every other pane is listed in the `#marketTab,...,#bugsTab{flex:1;min-height:0;overflow-y:auto}` rule in `style.css`, but `#fleshbookTab` was not, so it had no height constraint while still carrying the `margin:-8px` copied from bugsTab, pulling it up into the tabs. Gave the container `flex:1;min-height:0` inline and dropped the negative margin so it sits below the tabs like the other panes.
- No behaviour or API changes; this is presentation only.

Files: `client/assets/fleshbook.js`, `client/index.html`, `client/version.json`.

Cumulative over v1.1.2.5 / v1.1.2.4 / v1.1.2.3 / v1.1.2.2.

---

## v1.1.2.5 (2026-06-06) - Fleshbook features: rate limit, edit/delete own, sort, pin, mentions, composer polish

- **Rate limits** (`server.js`): per-author cooldowns via in-memory maps, 30s for posts and 12s for replies, returned as HTTP 429 with `seconds` remaining. Admin/dev accounts are exempt so seeding is not throttled.
- **Edit + delete own content** (`db.js`, `server.js`, `fleshbook.js`): `/api/fleshbook/delete` changed from admin-only to owner-or-admin; new `/api/fleshbook/edit`. Added `edited` columns to `fb_posts` and `fb_replies` (with ALTER migrations for already-created test DBs), `fbPostOwner` / `fbReplyOwner` / `fbEditPost` / `fbEditReply`. Client shows edit/delete on your own items (and devs on anything), inline edit box, and an "(edited)" marker. Server enforces ownership by `author_id` regardless of the client.
- **New vs Top sort** (`db.js`, `server.js`, `fleshbook.js`): `fbGetFeed` takes a sort arg; Top orders by upvote count. Added `p.id DESC` as a final tiebreaker so newest-first is deterministic even when two posts land in the same millisecond. Client sort toggle re-fetches.
- **Dev pin** (`db.js`, `server.js`, `fleshbook.js`): new `pinned` column + `fbSetPinned` + `/api/fleshbook/pin` (admin). Pinned posts sort first in both New and Top and show a 📌 marker; dev gets a pin/unpin control.
- **@mention notifications** (`server.js`): both posts and replies parse `@name` (deduped, capped at 12 scans, excludes self/GM), resolve via `getPlayerByName`, and notify each mentioned player through the shared `fbNotify` helper (chat cross-post + unread dot), reusing the reply-notification path. Reply recipients are deduped so the OP is not pinged twice when also mentioned. Client highlights `@mentions` in post and reply bodies.
- **Composer polish** (`fleshbook.js`): live character counter (`n / 1000`) and Enter-to-post with Shift+Enter for a newline. Reply inputs already send on Enter.
- **Fix**: the "No posts yet" empty-state line was removed by a selector matching the `style` attribute for text it never contained, so it lingered under the first post. Tagged it `.fb-empty` and remove by class.

Files: `server/db.js`, `server/server.js`, `client/assets/fleshbook.js`, `client/version.json`.

Cumulative over v1.1.2.4 (Fleshbook base), v1.1.2.3 (chat liveliness), v1.1.2.2 (chat robustness). One deploy ships all of them.

---

## v1.1.2.4 (2026-06-06) - Fleshbook: in-house social feed

- **Feed + schema** (`db.js`): new `fb_posts`, `fb_replies`, `fb_votes`, `fb_notifications` tables with indices on `fb_replies(post_id)` and `fb_notifications(recipient_id, seen)`. Functions: `fbAddPost`, `fbGetFeed` (returns upvote count, reply count, and the viewer's own vote state in one query), `fbGetReplies`, `fbAddReply` (returns the post author for notification routing), `fbToggleVote`, `fbDeletePost` / `fbDeleteReply` (soft delete via a `deleted` flag), `fbAddNotification`, `fbUnreadCount`, `fbMarkSeen`. All DB functions runtime-tested end to end against a temp database.
- **Routes** (`server.js`): `GET /api/fleshbook/feed` (open; reads token if present for vote state), `GET /api/fleshbook/post/:id/replies`, `POST /api/fleshbook/post`, `POST /api/fleshbook/reply`, `POST /api/fleshbook/vote`, `GET /api/fleshbook/unread`, `POST /api/fleshbook/seen`, `POST /api/fleshbook/delete` (admin), `POST /api/fleshbook/gm-post` (admin, in-character). Posting and replying are gated on mute/dunce state via `fbPostBlock`, reusing the existing moderation system.
- **Reply notification loop** (`server.js`): when someone replies to your post, the server cross-posts a transient 60s line into your chat ("X replied to your Fleshbook post") and pushes a `fleshbook_unread` count so the tab dot lights even before the module loads. Self-replies and replies to GM posts do not notify.
- **Client module** (`fleshbook.js`, new, lazy-loaded): composer, feed render with faction-coloured author tags and GM gold badge, per-post upvote toggle, expand-to-replies with an inline reply box, relative timestamps refreshed every 60s, and dev-only soft-delete controls. Mirrors the existing lazy-tab pattern (`window.fleshbookTabLoad`).
- **Layout fix** (`index.html`): `#fleshbookTab` was first inserted just outside the center panel close, so it rendered in the chat column with the main area blank. Moved inside the center `panel` as a sibling of the other tab panes (mirrors `#bugsTab`), so it renders in the main content area.
- **Wiring** (`index.html`, `core.js`, `god-panel.js`): new "📣 Fleshbook" main tab with an unread dot; `core.js` shows/hides + lazy-loads it, handles `fleshbook_unread`, and fetches the unread count on `fm:authed` so the dot is correct on login. New God panel control posts to the feed in character (default author "Mr. Flesh", tagged GM). Added `fleshbook.js` to the MANIFEST.

Anti-ghost-town note: the GM posting path exists so the feed is never empty and reads as in-fiction corporate bulletins rather than an abandoned board. Seed it before pointing players at it.

Files: `server/db.js`, `server/server.js`, `client/assets/fleshbook.js` (new), `client/assets/core.js`, `client/assets/god-panel.js`, `client/index.html`, `client/version.json`, `docs/MANIFEST.txt`.

Cumulative over v1.1.2.3 (chat liveliness) and v1.1.2.2 (chat robustness).

---

## v1.1.2.3 (2026-06-06) - chat liveliness: display cap, ring match, relative timestamps

- **Client display cap 15 to 200** (`core.js`): `addChat` trimmed each pane to 15 nodes, so even though the server hands a new connection up to a full room of history, the client showed only the most recent 15 and evicted one on every new line. This was the real reason chat felt short. Raised `MAX_CHAT_MSGS` to 200; the client now shows the scrollback the server actually keeps.
- **Server ring 120 to 200** (`server.js`): bumped `CHAT_RING_MAX` to match the client cap so the model is simply "the client shows everything the server retained." Still well under ~2MB total, fixed regardless of population.
- **Relative timestamps** (`core.js`): each chat line now carries a dim inline relative time (`now` / `5m` / `2h` / `1d`) with the absolute time on hover, refreshed in place every 60s via a single `.cm-time` sweep. Undated scrollback could not signal whether a room was active-now or stale; the timestamp is the dead-or-alive signal. Styled small and low-opacity in the line's own colour to sit inside the phosphor aesthetic rather than fight it. Falls back to render-time `Date.now()` for lines that ship without a `t` (e.g. local system notices).
- Decided against a separate system room: mechanical notifications (income, confirms, dividends, fills) keep their 60s TTL and remain in the active room. Lore/social broadcasts (faction, president, splits) stay in global as ambient liveliness.

Files: `server/server.js`, `client/assets/core.js`, `client/version.json`.

Cumulative over v1.1.2.2 (per-room history, transient TTL, pinned announcements).

---

## v1.1.2.2 (2026-06-06) - chat robustness: per-room history, transient TTL, pinned announcements

- **Per-room count-bounded chat history** (`server.js`): replaced the single 30-minute, 200-message global ring (`CHAT_HISTORY` / `CHAT_HISTORY_MS`) with per-room rings keyed by `channel:room`, capped at `CHAT_RING_MAX` (120) each with no time expiry. Quiet rooms now keep scrollback instead of pruning to empty and reading as a dead server. Memory is fixed at rooms x 120 regardless of population (rejected the per-user-cap idea: per-user is unbounded in population and would cost more memory, not less). Messages flagged `data.transient` are never stored.
- **Transient notification TTL** (`core.js`): `addChat` now honours an optional `ttlMs` and self-removes the line after it elapses. Applied 60s TTL to passive income, `chat_system` confirms, dividend, and limit-fill lines. Faction / president / stock-split broadcasts (`type:'chat'`, `user:'SYSTEM'`) carry no TTL and remain as scrollback. Most of these notifications were already per-socket (never in history), so this is the client-side half of the same cut.
- **Persisted pinned announcements** (`db.js`, `server.js`, `core.js`, `god-panel.js`, `index.html`): new `announcements` table (text, author, created_at, expires_at) with `addAnnouncement` / `getActiveAnnouncements` / `clearAnnouncement` / `pruneExpiredAnnouncements`. The dev-panel God Broadcast now pins a DB-backed announcement above every chat room for a duration set in the panel (new "Pin duration (min)" input, default 30, range 1 min .. 7 days). Active announcements are re-sent on every WS connect, so they survive PM2 restarts and alt-logins. A 30s server loop expires them and broadcasts `announcement_clear`; the client also self-expires each banner at its `expires_at`. New REST routes `/api/admin/broadcast` (now persists + takes `durationMin`) and `/api/admin/broadcast/clear`.
- **Bug fixed**: admin announcements vanished when logging in on a second account. Root cause: the old `admin_broadcast` was broadcast live but never written to chat history and rendered as a scrolling line, so a fresh connection never received it. Announcements are now persistent server state, not an in-flight message.

Files: `server/server.js`, `server/db.js`, `client/assets/core.js`, `client/assets/god-panel.js`, `client/index.html`, `client/version.json`.

Note: Fleshbook (in-house social feed) is designed but not in this build. Backend + tab are gated on scope confirmation (single global feed, one-level replies, upvote, reply-notification dot, dev-pin).

---

## v1.1.2.1 (2026-06-06) - blockade funding status bar + durability

- **Two-phase blockade status bar** (`galaxy.js`): the blockade panel now shows a live bar for the selected lane. Building phase fills toward the Ƒ1,000,000 activation threshold; active phase shows remaining integrity as counter-funding drains the pool toward 0. Refreshes on lane select, on every `blockade_update`, and on panel open.
- **Building-phase pools no longer discarded client-side** (`galaxy.js`): `blockade_update` with `active:false` used to delete the lane entry, throwing away partial funding so it was invisible until activation. Now the entry is retained whenever `pool > 0`, and only dropped on break/expiry. `threshold` added to the active + counter broadcasts so the bar has its denominator.
- **Stale text fixed** (`galaxy.js`): the blockade panel helper line read "Ƒ50k activates a 2-hour blockade" (encoded `\u01925\u0030k`, missed by the earlier 50k sweep); now reads Ƒ1,000,000.
- **False-blockade on the map fixed** (`galaxy.js`): the map painted the red ⛔ for any lane present in the blockade map, including lanes merely accumulating funding. The indicator (and the share-count offset, and the lane dropdown label) now require `active === true`; building lanes show `[FUNDING]` in the dropdown instead. Also hardened the server restore (`server.js`): an active blockade restored without a valid future expiry is cleared rather than resurrected as a permanent lockdown, so a stuck entry can't keep showing a lane as blockaded.
- **Over-funded bar** (`galaxy.js`): the bar fill clamps to 100% for layout, but the label shows the true percentage (e.g. 140%) and notes how much counter-funding a over-funded active blockade actually needs to break.
- **Immediate blockade persistence** (`server.js`): blockade fund / counter / Private Army handlers now call `saveGalaxySystems()` right after mutating, instead of relying solely on the 60s autosave. Pools already survived restarts via `restoreGalaxySystems()` (market_state table) on boot + graceful shutdown; this closes the up-to-60s window where a hard crash could drop recent contributions. No new table.
- **Legible blockade panel** (`style.css`, `galaxy.js`): the panel inherited the global phosphor glow, blurring the status bar and helper text. Added `#gBlkPanel` (and its children) to the glow-exclusion list and bumped the status/helper font sizes and contrast so the funding bar reads clearly.

Files: `server/server.js`, `client/assets/galaxy.js`, `client/style.css`, `client/version.json`.

---

## v1.1.2.0 (2026-06-06) - shipping risk rebalance, escort/insurance, blockade + war-funding repricing

- **Per-hop shipping risk up 4x** (`server.js`): cargo arbitrage fly-by risk raised from `(hops-1)*0.025` to `(hops-1)*0.10` in both `/api/cargo/quote` and `/api/cargo/ship`. Each intermediate colony now adds 10% interception risk instead of 2.5%, pushing multi-hop runs toward the 10-25% band. NOTE: direct (1-hop) runs are unaffected and still sit at base (~10% corporate, ~15% grey); raise `SHIPPING_BASE_RISK` if those also need to move.
- **Escort fees +1/3** (`server.js`, `galaxy.js`): `GUARD_TIERS` feeFrac light 0.04 to 0.0533, medium 0.10 to 0.1333, heavy 0.22 to 0.2933. Shared with smuggling, so smuggling escort costs the same 1/3 more. Cargo dropdown labels and the smuggling fallback array updated to match.
- **Insurance in the cargo console** (`galaxy.js`, `server.js`): added an Insurance checkbox beside Escort. Wires `insure` into `/api/cargo/quote` (now returns `insurancePremium` + `upfrontTotal`) and `insured` into `/api/cargo/ship`. On interception, insurance now refunds **half** the cargo cost (not the full stake), so an insured loss still hurts; premium and escort fee are gone regardless. It does not lower the interception roll. Stacking with an escort pays both off the top.
- **Blockades repriced 50k to 1M** (`server.js`, `galaxy.js`): `BLOCKADE_THRESHOLD` 50000 to 1_000_000. Governs raise, counter-break, and the Private Army instant-break (all tied to the constant). All five client text strings + stale comments updated.
- **War funding pooled, 10M per 1%** (`server.js`, `db.js`, `galaxy.js`): `/api/galaxy/fund` no longer converts per-donation. All contributions to a (colony, faction) bank into a shared pool (`war_fund_pool` table, persisted); every full Ƒ10,000,000 in the pool converts to +1% control, remainder carries forward so partial contributions are never wasted. No per-donation cap (pool size + the 96% ceiling are the only limits); SC blocked by the ceiling stays banked. Min donation restored to Ƒ1,000. Endpoint returns `pctGained`/`pctToNext`; both fund toasts show control gained or SC banked toward the next 1%.
- **Removed outdated savings text** (`funds.js`): dropped the `0.040%/hr` line from Capital House directory cards (fund savings interest has been disabled since v1.0.2.4).

Files: `server/server.js`, `server/db.js`, `client/assets/galaxy.js`, `client/assets/funds.js`, `client/version.json`.

---

## v1.1.1.6 (2026-06-04) — de-fog company + fund detail panels

- **Crisp detail panels** (`style.css`): extended the glow-exclusion rule to `#companyDetail` (market company detail), `#guild-detail` (Capital House fund view), and `#transferSection` (Wire Credits panel). They were inheriting the global `body` phosphor glow, blurring the "No base dividend" / "Dividend eligible" line, the fund type badge ("Capital House" / "Guild" / "FLSH"), the Overview/Portfolio/Governance/Manage sub-tabs, and the wire transfer-tax disclaimer. One-line CSS change; no logic touched. Follows the same v1.1.1.5 store fix.

Files: `client/style.css`, `client/version.json`.

---

## v1.1.1.5 (2026-06-04) — store/title text de-fogged

- **Crisp store text** (`style.css`): the global `body` phosphor glow (`text-shadow:0 0 3px rgba(70,255,125,.30)`) was being inherited by the store panes, making title names and blurbs read blurry. Added `.store-pane` to the existing glow-exclusion rule alongside markets/tickers/news/board, so all four store subtabs (Titles, Inventory, Ƒbay, Slots) render crisp. One-line CSS change; no logic touched.

Files: `client/style.css`, `client/version.json`.

---

## v1.1.1.4 (2026-06-03) — dev text -> gold; neutral news -> amber

- **Dev text gold** (`galaxy.js`): the Flesh Station (dev) faction was still light green (`#9dff5a`) despite its gold dim/bg — fixed its faction color, the DEV ONLY badge, the galaxy-map FLESH STATION label, and the HOME OF MR. FLESH banner to gold (`#ffce4d`), matching the Capital Houses dev fund.
- **Neutral news amber** (`style.css`): neutral headlines reverted from pale to amber (good=green / bad=red still override via the tone classes).

Files: `client/assets/galaxy.js`, `client/style.css`, `client/version.json`.

---

## v1.1.1.3 (2026-06-03) — news feed redesign + ASCII title sizing

- **News feed (layout A)** (`core.js`, `style.css`): each story is now a row with a tone-colored left accent bar and faint wash (green up / red down / amber neutral), a meta header line (time + a color-coded category chip), and the headline on its own line in pale (green/red tint for good/bad). Replaces the old single inline wrapping line. Category chips recolored to a coherent set: market=green, colony=amber, sector=purple, system=blue, trade=teal.
- **ASCII titles** (`index.html`): FLESH MARKET wordmark to 9px with a bit more glow; NEWS ASCII title to 7.5px.

Files: `client/assets/core.js`, `client/style.css`, `client/index.html`, `client/version.json`.

---

## v1.1.1.2 (2026-06-03) — amber section titles

Established "title text = amber" across the UI (cosmetic).

- All `h2` panel titles recolored green -> amber (Companies, Leaderboard + Net Worth, Wire Credits, Limit Orders, Price Alerts, Drone Mining, etc.) via the global `h2` rule.
- FLESH MARKET wordmark recolored to amber; NEWS title converted to ASCII-art (figlet) in amber to match.
- Chat room badge (`global · room N`) and the A-/A+ chat font-size buttons recolored to amber.

Files: `client/style.css`, `client/index.html`, `client/version.json`.

---

## v1.1.1.1 (2026-06-03) — amber navigation chrome

Tabs and watchlist to amber (cosmetic). Amber now also carries primary navigation, not just places/neutral/symbols/chat.

- Main tabs, Galaxy subtabs, and chat room tabs: border, text, active highlight, and glow recolored green -> amber.
- Watchlist toggle: border/text/count and the active (filter-on) state recolored to amber.

Files: `client/style.css`, `client/assets/market-tools.js`, `client/index.html`, `client/version.json`.

---

## v1.1.1.0 (2026-06-03) — green CRT phosphor reskin (Ellen's Theme)

Full visual reskin to a permanent green-phosphor CRT look, plus one gameplay fix. Cosmetic unless noted.

- **Theme:** permanent green-phosphor CRT (amber retired, theme selector removed), always-on scanlines, re-saturated palette with a pale to dim green readability hierarchy.
- **Fonts:** self-hosted (no Google Fonts) — Share Tech Mono on chrome (wordmark/headings/tabs/EOD timer), IBM Plex Mono on body/data. Header wordmark is ASCII-art (figlet 'small').
- **Signal palette:** green = data/structure; amber (#f0b454) = places, neutral news, ticker symbols, chat text; gold (#ffce4d) = Patreon/premium + FLSH dev guild + golden share; red = loss/danger. Faction/rainbow/tension colors kept as identity.
- **Polish:** softened glow + de-glowed dense tables, muddy greys lifted to green tiers, pale company-list text, heatmap warm tiles fixed and sector headers colored from the P&L wheel palette, faint amber button outlines removed.
- **Fix (functional):** cargo shipping now allows only one in-transit shipment per player at a time, enforced server-side.

---

## v1.1.0.0 (2026-06-01) — major content drop: free starter ship, shipping overhaul + escorts, P&L sector tools, brighter donuts

A single large release consolidating the post-governance sprint. Four things land together.

**Free starter Skiff.** New accounts (and any existing account that never commissioned a ship) were locked out of the entire commodity loop — `/api/commodities/buy`, `/api/commodities/sell`, and `/api/cargo/ship` all hard-gate on `shipClassFor()`, which returned `null` until you spent Ƒ150k on a Courier. Added a free `skiff` class scaled off the Courier row (capacity 2,500u = 25% of Courier, `riskMod` +0.03, `price` 0) and made `shipClassFor()` fall back to it instead of returning null. `/api/ships` floors `owned` to `skiff`; `/api/ships/buy` rejects `classId==='skiff'` (`starter_ship`) since it's the floor, not an upgrade. No DB migration — the fallback is virtual, so the Skiff is never persisted and the first real purchase still sets `ship_class` normally. The Shipyard renders any `price<=0` class as a non-buyable "Starter ship," so it shows as ACTIVE for new players with no UI change.

**Commodity interception rebalanced.** The "40–55% no matter the lane" was the lane base being swamped by stacked modifiers, not the lane itself. Fixes in `cargoShipmentInterceptChance()` and the two cargo endpoints, tuned via Monte Carlo over the weighted run space so the riskiest unescorted hauls land in a 45–50% band with a hard 50% backstop:
- Cargo-value scaling no longer reuses the steep abstract `shippingBetRisk` curve (0/0.05/0.10/0.15). New `CARGO_VALUE_RISK_TIERS`: 0 / +3% / +5% / +7% at Ƒ25k / 100k / 500k / ∞.
- Fly-by risk cut from 5% to 2.5% per extra hop.
- Lane factor trimmed from `laneRisk.intercept * 0.4` to `* 0.35` (lane ordering corporate→dark preserved).
- Tension divisor raised 1500→1800 (max tension ~5% instead of ~6.7%).
- Blockade surcharge cut from +10% to +6%.
- Inner clamp 0.60→0.52; final clamp 0.70→**0.50** hard ceiling, floor 2%→3% so a fully-escorted corporate run keeps a sliver of risk.
- Simulated outcome (200k runs): all-runs median ~18%, p99 39%; risky subset (dark/contested, ≥100k, no escort) p99 46%, max 50%; lane means corp 14% / grey 18% / contested 22% / dark 27%.

**Shipping escorts.** Added guard escorts to the commodity shipping console, reusing the smuggling `GUARD_TIERS` verbatim (None / Light -8% / Armed Convoy -16% / Private Army -26%). Fee is `feeFrac` × cargo value, paid up front and lost if intercepted (the escort dies with the cargo). The cut is baked into the stored `interceptChance`, so the resolution roll reflects it — no schema change. Plumbed through `/api/cargo/quote` (`?guard=`) and `/api/cargo/ship` (`guardTier` in body); quote returns `guardFee`/`guardCut`. Console gains an Escort selector; preview shows the cut and fee. Worked example, dark 3-hop 800k haul: unescorted 48%, Light 40% (Ƒ32k), Armed Convoy 32% (Ƒ80k), Private Army 22% (Ƒ176k).

**P&L sector tools.** Personal P&L (`core.js`) and the Capital House portfolio (`funds.js`) gained a themed sector control beside the search box: `All positions` / `Grouped by sector` plus every sector listed by name (Finance, Biotech, Insurance, Manufacturing, Energy, Logistics, Tech, Misc). Picking a sector filters the row list **and** the %-move bars to that sector; "Grouped" clusters by sector with a faint per-row tag. New `.sector-select` style (panel-matched fill, gold border, custom caret). `_pnlArrange` / `_gArrange` apply search + sector filter/group in one pass shared by bars and list; sector-aware empty states. Sector indices/names come from `window.TICKERS` `.sector` + `V5_SECTOR_NAMES`.

**Allocation donut flood bug fixed (the real cause of the "dim/washed" wheel).** Both donuts (`_drawDonut`, `renderFundDonut`) computed each slice as `sweep = frac*2π - GAP` and drew the outer arc from `ang + GAP/2` to `ang + sweep`. For any slice under ~0.6% of the total (typically the cash sliver on a large fund) `sweep` falls below `GAP/2`, so the arc's end angle drops below its start angle and the default-clockwise arc wraps nearly 360°, flooding the entire ring with that one slice's color. That is why the wheel read as a uniform pale tan with only the true colors glinting at the edges — it was never a palette or dark-mode issue. Reproduced and confirmed headlessly with node-canvas. Fix: the slice guard is now `if (sweep <= GAP/2) return;` (was `<= 0`), so sub-threshold wedges are skipped instead of wrapping. The donuts now render their full vivid palette.

Alongside the fix, both wheels share one vivid palette (`FM_DONUT_PAL`, defined in `core.js`, read by `funds.js`) with a per-segment glow (`shadowBlur 6`), bolder ring (outer radius +2px, inner ratio 0.6), and warmer center text — luminosity from the glow, not from lightening the colors.

Scope: all exploitable paths stay server-authoritative. Guard cut and value scaling are computed server-side; the client only mirrors them for preview. Donut and sector changes are client-side reorders/redraws of already-computed data.

---

## v1.0.3.9 (2026-05-31) — guild Portfolio: live-priced holdings + %-move bars


The Capital House Portfolio pane only rendered holdings on `openFund`/`fund_update` (fund trades, deposits), so between those events the prices were stale and you couldn't watch companies move. `fund_holdings` stores only `(symbol, qty)` — no cost basis — so there's no gain-vs-entry to show; the available, and more relevant, metric is today's % move.

Changes (funds.js, index.html, core.js):
- `_gBuildHoldings(f)` re-marks each holding at the live price from `window.TICKERS` and pulls today's `pct`; value recomputed at live price.
- `_renderGuildHoldings` rows now show live price + color-coded today's % alongside qty/value.
- New `_drawGuildBars` / `_drawGuildBarsAxis` render a per-holding %-move bar chart into `#g-pnl-bars` with a pinned `#g-pnl-bars-axis`, fixed 24px rows growing inside a 180px scroll wrapper — same shape as the personal P&L bars.
- `window.refreshGuildHoldingsLive()` re-renders on every market tick (hooked in core.js after `refreshHeatmap`), gated on `#g-pane-portfolio` being visible (`offsetParent`), so it's idle unless you're looking at it.
- `setHousePane('portfolio')` triggers a redraw so the canvas sizes correctly after being hidden (zero clientWidth).
- The 1.0.3.8 holdings filter and scroll still apply; search narrows rows and bars.
- Scope: fund NAV/cash/per-share remain server-authoritative; only the holdings rows and bars are re-priced client-side.

## v1.0.3.8 (2026-05-31) — P&L: scrollable + searchable position list (personal + guild)

With a large book the P&L bar chart packed every position into a fixed 180px canvas. `rowH = min(28, floor((H-22)/n))` collapsed to ~6px at ~25 holdings, so bars overlapped and the left-edge symbol labels overprinted into an unreadable smear (the donut/net-worth side was fine). The `#pnlBox` list below had no height cap or filter, and the guild Capital House portfolio (`#g-d-holdings`) had no filter either.

Changes:
- Personal P&L: added `#pnlSearch` ticker filter; `#pnlBox` capped at 360px with `overflow-y:auto`. `_drawBars` rewritten to use a fixed 24px row height and grow the canvas vertically inside a 180px-max scroll wrapper (`#pnl-bars-wrap`) instead of compressing rows. The `+/-%` scale is drawn into a separate pinned canvas (`#pnl-bars-axis`) above the scroll wrapper so it stays fixed while the bars scroll (shared geometry keeps the zero line aligned). Search filters the visible list and bars via `_pnlMatch` / `window.pnlApplySearch`.
- Guild portfolio: added `#g-holdings-search`; holdings render refactored into `_renderGuildHoldings(f)` driven by `window.guildHoldingsSearch`, filtering `__currentFundData.holdings`.
- KPIs, net worth, equity, unrealized P&L, and the allocation donut still compute on the full portfolio; the filter only narrows the readable list/bars.

## v1.0.3.7 (2026-05-31) — fix: golden-share badge shown on wrong member

The golden-share ★ in the member list was rendered by matching the holder's name against each member's name (f.goldenHolder===m.name). Name collisions (or a treasurer/other officer whose name matched) could show the badge on the wrong person. The members array didn't expose player_id to the client, so a name match was the only thing available. Fixed by computing an isGolden boolean per member server-side off player_id and badging on that. Purely cosmetic — both veto endpoints already gate on getGoldenHolder()===actor.id, so the share's actual authority was never mis-assigned; only the badge was wrong.

## v1.0.3.6 (2026-05-31) — fix: smuggling countdown froze (real fix)

v1.0.3.5 anchored the smuggling countdown to resolveTs but updated the wrong element: the RUN IN PROGRESS panel renders its timer into #gShipCountdownTimer (a shipping-named id it reuses), while the interval was writing to #gSmugStatus. So the visible number never moved. Replaced both with one shared ticker (_smugTick / _ensureSmugTicker / _stopSmugTicker) that recomputes from resolveTs each second and writes to whichever countdown element is present, re-armed at the end of renderShippingTab so tab switches and re-renders keep it live. Known minor gap: a full page refresh mid-run doesn't restore the run panel (no smuggling_status client handler yet) — separate follow-up.

## v1.0.3.5 (2026-05-31) — fix: smuggling countdown drift

The smuggling run timer counted down a local `secLeft--` once per `setInterval` tick instead of recomputing from the run's resolve timestamp. Background-tab throttling and interval drift made the displayed time desync from the real arrival, and the interval wasn't cleared on resolve or before a new run (so they could stack). Rewrote it to mirror the shipping countdown: recompute remaining time from `resolveTs` every tick, store the interval on window, and clear it on resolve and before starting a new one.

## v1.0.3.4 (2026-05-31) — governance: officer roles

Second half of the God-Complex set. The owner can delegate specific powers to members — concentrated authority that an officer can use (or abuse) until it's revoked.

- **Treasurer** — can move fund cash: withdraw from the fund and assign cash to members, same as the owner.
- **Trader** — can execute trades directly, bypassing the fund's governance mode entirely (even vote mode, where everyone else must propose). Trade-without-a-vote is the role's whole point.
- **Whip** — can force-call any open proposal: voting closes immediately and the current tally decides it. Owner can do this too.
- Owner appoints/revokes from the Manage panel (name + role). One role per member; the owner implicitly holds every power. Role badges (and the golden-share ★) now show in the member list.
- New endpoints: officer/appoint, officer/revoke, proposal/:pid/force. New fund_officers table (created on boot). Gates updated on the trade, withdraw, and assign endpoints to admit the relevant officer.
- NOTE: still no coup. Officers add more delegable owner power to an owner who cannot yet be removed. The seize / no-confidence proposal is the outstanding counterweight.

## v1.0.3.3 (2026-05-31) — governance: tenure voting + golden share

First half of the God-Complex governance set. Concentration levers — the counterweight (coup / no-confidence) is a separate follow-up.

- **Tenure-weighted voting**: new vote-weight option alongside equal and share-weighted. Weight = 1 on join, +1 per full day in the fund. Entrenched elders out-vote rich newcomers — a different tyranny than buying control with shares.
- **Golden Share**: a single transferable veto token per fund. The owner holds it at creation. The holder can veto ANY open proposal — it dies regardless of the vote tally — and can hand the token to any member (permanent, instant). It's the purest God-Complex artifact and, because it's transferable, the prime target of a future coup.
- New endpoints: POST /api/funds/:id/golden/veto and /golden/transfer. New funds.golden_holder column (lazy migration on boot, backfilled to owner). Governance panel shows the holder, veto buttons appear on open proposals for the holder, and a hand-over control for transfers.

## v1.0.3.2 (2026-05-31) — fund deposit/withdraw is cash, not shares

Deposit and withdraw now work in raw cash amounts. The percentage dropdown is gone — one Amount field, Deposit moves that cash player to fund, Withdraw pulls that cash fund to player.

- Withdraw is capped only by the fund's liquid cash. Positions stay locked. If the fund holds Ƒ300k cash against a Ƒ2M NAV, only the Ƒ300k is withdrawable; the rest is tied up in trades until governance votes to sell. Intended harshness.
- No per-member ceiling. Governance is the gate (owner-controlled / executive). A withdrawal that exceeds available cash caps to what's there rather than erroring blind.
- Shares are now display-only. The "My Value" card became "Contributed" (lifetime gross deposited, never decreases). Per Share / NAV / drawdown stay as house performance, not a personal claim.
- Shares are still burned to match cash pulled so the per-share line stays honest; pulling beyond your own stake (allowed) zeroes your shares and visibly drags spp for everyone.
- A withdrawable/locked hint shows under the panel so the liquidity cap is transparent.

## v1.0.3.1 (2026-05-31) — item scrapping

Slot-machine items can now be scrapped from the bag for a flat Ƒ500, same payout for every rarity. It's a clutter sink, not a fair-value buyback — the point is to give players a one-click way to dump junk instead of listing it on Ƒbay forever.

- ⊘ Ƒ500 control on each bag item; click stops propagation so it doesn't trigger equip. Confirm dialog since the item is destroyed permanently.
- Equipped items and items currently listed on Ƒbay can't be scrapped (the listed guard prevents orphaning an active listing).
- New `POST /api/items/scrap`. Payout + delete run inside a single DB transaction; portfolio is pushed over WS on success so cash updates live.

## v1.0.3.0e (2026-05-30) — route risk preview

You can now gauge a shipment's risk BEFORE committing. The Shipping Console shows a live preview as you change the commodity, origin, destination, or quantity:
- **Route** (full hop path) and **hop count**, **transit time**, and **interception risk**, color-coded (green <25%, amber 25-45%, red 45%+), including the fly-by surcharge for multi-hop routes.
- Flags when you don't own a ship yet, and when no route exists.
- Per-row SHIP buttons also trigger the preview after pre-filling.
- New `GET /api/cargo/quote` endpoint runs the same routing + risk math as the ship endpoint without executing it.

## v1.0.3.0d (2026-05-30) — routing fix: cluster gateways

Multi-hop routing wrongly refused to pass through non-market colonies, which made the entire Abaddon cluster (Limbosis / Lustandia / Gluttonis) unreachable — their only link to the galaxy is the gluttonis/lustandia/limbosis <-> abaddon lanes, and Abaddon is a non-market anchor. Shipping to any cluster colony returned "no route". Fixed: a ship can fly THROUGH any colony as a transit waypoint (it just can't buy/sell at a non-market one). Endpoints are still validated as market colonies. Example now works: Nova Reach -> Gluttonis routes in 4 hops through Abaddon.

## v1.0.3.0c (2026-05-30) — multi-hop auto-routing

Shipping to a colony with no direct lane now **auto-routes** the shortest path through intermediate colonies (BFS over the lane graph) instead of returning "no lane." It stays one shipment with one delivery at the final destination — a simple auto-queue, not manual leg-chaining.

- **Transit time scales per hop:** a 3-hop route takes ~30 min (3 × the 10-min leg), not three separate runs. Phase tracker stretches across the whole journey.
- **Fly-by risk:** each extra hop adds +5% interception chance (skipping past colonies without docking). A 3-hop run carries +10%.
- **Route risk** is based on the riskiest lane type anywhere on the path, so routing through a dark lane is appropriately dangerous.
- Routes only pass THROUGH market colonies as waypoints; non-market anchors can still be endpoints but aren't used as transit stops.
- The launch confirmation shows the hop count, the full route, the time, and the risk.

## v1.0.3.0b (2026-05-30) — Shipping Console UX

- Commodity picker in the Shipping Console is now a **searchable type-to-filter** field (datalist) instead of a 120-item scroll `<select>` — type a few letters to narrow it.
- The commodity list and both colony dropdowns (From / To) are now sorted **alphabetically**.

## v1.0.3.0a (2026-05-30) — shipping risk rebalance

Commodity shipment interception was too punishing for legitimate trade. The base shipping risk was a flat 18% on every run before any modifiers, stacking to ~41% on an ordinary grey-lane haul. Lowered:
- `SHIPPING_BASE_RISK` 0.18 -> 0.05.
- Faction-away penalty (shipping through colonies your faction doesn't control) halved from +0.04 to +0.02 per endpoint.

Result: corporate lane ~14% (was 27%), grey lane ~24% (was 41%), while contested/dark lanes with big cargo stay 44-51%. The risk gradient is preserved; legitimate shipping is now viable. Smuggling uses a separate risk path and is unchanged (contraband stays dangerous).

## v1.0.3.0 (2026-05-30) — The Commodity Economy Update

The largest single update to FleshMarket: a full inter-colony trade economy layered on
top of the stock market. Everything below ships as one release.

### Commodity market
- **120 commodities** across Tech, Med, and Agri, each with pixel art, priced
  independently at every one of the 19 market colonies. Per-colony, per-commodity
  affinity means each colony is cheap in some goods and dear in others — 2,280 live
  prices, real arbitrage, routes that span the galaxy.
- **Arbitrage Board** in the Markets tab surfaces the best buy-low/sell-high spread per
  good, with class filters (Tech/Med/Agri) and name search.
- **Live ticker prices.** Prices update in place like a stock ticker — no page jump —
  flashing green/red as player trades, NPC trades, and ambient drift move them.

### Shipping & logistics
- **Ship-based shipping.** Commodity trade requires a ship (Courier / Freighter /
  Hauler, bought in the Shipyard). Cargo is **located** — it physically sits at the
  colony where you bought it. To profit from a spread you must run a real, timed,
  phased shipment (loading → undocking → transit → dropoff → return) to another colony
  and sell it there. You can only sell where your cargo actually is — no instant
  cross-colony arbitrage.
- **Shipping Console** in the Markets tab: pick commodity, origin, destination, and
  quantity from dropdowns and launch a run without touching the sector map. A per-row
  SHIP button pre-fills it from the board.
- **Domino-style in-transit tracker** shows each shipment advancing through its phases.
- Shipments can be **intercepted** en route (cargo lost, ship survives); whole-route
  insurance optional.

### Server NPC trade fleet
- Up to **17 server-authoritative NPC haulers** travel real lanes carrying 1–3 real
  commodities each, buying at origin and selling at destination — they genuinely move
  prices, and every player sees the same fleet. Click any ship for its manifest.

### Shipping Contracts (options)
- A financial layer on the commodity market: **cash-settled options on lane spreads.**
  Pay a premium for the right to capture a spread by expiry (1h/4h/8h); profit if it
  widens past your strike, lose only the premium if not. No ship needed — an
  entry-level commodity play. Priced with a verified ~12% house edge; blockades raise
  premiums; lane shareholders earn a kickback on contract profits.

### Smuggling & Guards
- The legacy freight bet is retired; the tab is now a dedicated **💀 Smuggling**
  operation. Stake on contraband runs for up to ×3 payouts. A new **Guard escort**
  system replaces insurance: pay for muscle to cut interception odds, but the fee is
  lost if you're caught — a spend-to-lower-odds bet, not a safety net.

### Supporting work
- Commodity trading consolidated entirely into the Markets tab (removed from the planet
  details panel, closing an instant buy/sell exploit).
- Tutorial rewritten with Commodity Market, Shipping Contracts, and Smuggling & Guards
  slides. Galaxy tab renamed to 💀 Smuggling.
- **Database:** additive only — one new column on players (`ship_class`) and four new
  tables (commodity_prices, player_cargo, cargo_shipments, shipping_contracts);
  player_cargo is keyed per-colony. No existing profile data is modified. Back up the DB
  before the first restart.

## v1.0.2.9a (2026-05-30) — gating + tab order

Players no longer start with a free Courier — you must commission a ship (Courier now ƒ150,000) before you can buy, sell, or ship commodities. All three commodity actions are gated server-side on ship ownership (`no_ship`), with client prompts pointing to the Shipyard. Reordered the Galaxy tabs: Sector Map → Markets → Shipping → Contracts → Factions.

## v1.0.2.9 (2026-05-30)

**Shipping V2 — stages A+B: logistics phases + buyable ships.**

Cargo shipping is no longer an instant action with a hidden end-roll. A run now takes **10 minutes flat**, split across five visible phases — Loading → Undocking → Transit → Drop-off → Returning — with risk weighted toward Transit (it carries ~65% of the interception chance; loading/undocking/dropoff/return are low). The interception roll is distributed: each phase rolls its share as the shipment enters it. On interception, **cargo is lost but the ship survives** and finishes the return phase empty. Insurance is bought at launch, whole-route, value-scaled (unchanged model). A per-run **fuel/return cost** is charged up front, scaling with ship size and cargo value, so long hauls on big ships cost real credits.

A Domino's-style **phase tracker** shows each in-transit shipment's current phase (pips), live ETA, and risk on the Markets tab. Phase changes and outcomes push over WebSocket (`cargo_phase`, `cargo_ship_result`).

**Buyable ships.** Three classes set your cargo capacity per run: **Courier** (free starter, 10,000u), **Freighter** (ƒ1,500,000, 35,000u, +2% risk), **Hauler** (ƒ5,000,000, 70,000u, +4% risk). Bought from the new Shipyard on the Markets tab. Capacity caps how much you can ship in one run. Everyone starts with a Courier. Ship class persists per player (new `ship_class` column).

Shipments persist in `cargo_shipments` (new phase/ship columns) and resume correctly across a restart — the phase stepper advances them by elapsed time on a 3s tick instead of per-shipment timers. Verified: boot clean, phase math (fracs + risk shares both sum to 1.0, transit is the long dangerous stretch), ship purchase/capacity, restart resume.

## v1.0.2.8b (2026-05-30) — UI

Markets tab arbitrage board is now actionable: each row has BUY (purchases at the cheapest colony shown) and SELL (offloads at the dearest, when held) buttons, with an inline result line — no need to leave for the Sector Map to trade. Reduced the per-colony commodity panel font back down (the 1.0.2.8a bump was too large and wrapped the buttons).

## v1.0.2.8a (2026-05-30) — UI tweak

Markets tab moved to sit directly after Sector Map (was after Shipping) for quick back-and-forth between the arbitrage board and the map. Bumped font sizes up across the Markets tab and the per-colony commodity panel — the prior sizing was too small to read comfortably.

## v1.0.2.8 (2026-05-30)

**Commodity market — dedicated Markets tab.**

Trading was only reachable by opening each colony's detail panel, which made the galaxy-wide arbitrage invisible. Added a Markets tab to the Galaxy view (sibling to Sector Map / Factions / Shipping / Contracts). It shows your cargo hold, in-transit shipments, and an Arbitrage Board: for every commodity, the cheapest buy colony vs the dearest sell colony and the spread % right now — so profitable routes are visible at a glance. Buy/sell/ship still happen on a colony (open it from the Sector Map); the per-colony market panel from stage 2 remains.

New endpoint `GET /api/commodities-grid` returns the full colony×commodity price grid in one call. Verified live: grid returns 12 commodities × 20 colonies with control-driven prices.

## v1.0.2.7a (2026-05-30) — hotfix

Fix a fatal crash introduced in 1.0.2.7: while inserting the arbitrage-shipping block, the `const SHARE_MAX_SLOTS = 100;` definition for the Lane Shares system was accidentally dropped. The first WebSocket message that hit the lane-share path threw `ReferenceError: SHARE_MAX_SLOTS is not defined` and killed the server process (connection-refused for everything after). Restored the definition. Verified the server now boots clean and seeds commodity prices.

## v1.0.2.7 (2026-05-30)

**Commodity market — stage 3: arbitrage shipping (the payoff).**

Buy a commodity cheap at one colony, ship it through a lane, sell it dear at another. Each held commodity in the market panel now has a SHIP button: pick a connected destination + lane, optionally insure, and launch. Shipments reuse the existing lane/risk/blockade model — corporate lanes are safe and slow-cheap, dark lanes fast-risky; tension, enemy territory, blockades, and haul value all push intercept odds up; your faction controlling the route lowers them.

Cargo is escrowed out of your hold on launch and persisted in a new `cargo_shipments` table, so shipments survive a server restart (in-flight runs are rescheduled on boot; overdue ones resolve immediately). On delivery the goods land in your hold at the destination, ready to sell at its live price. On interception the units are lost — insurance refunds the buy cost (premium scales with value); uninsured losses feed the Void raiding kickback like other shipping. A 10s sweep is a safety net for missed timers.

Endpoints: `POST /api/cargo/ship`, `GET /api/cargo/transit`. In-transit shipments show under the market with destination, risk %, and ETA. Verified the full escrow→deliver / escrow→loss lifecycle and the double-resolve guard.

This completes the commodity arc: control sets prices (stage 1), players trade locally (stage 2), and now they move goods between colonies to exploit control-driven spreads (stage 3).

---
## v1.0.2.6 (2026-05-30)

**Commodity market — stage 2: local buy/sell + cargo hold.**

Players can now trade commodities at a colony. The colony detail panel has a Commodity Market section listing all 12 goods with live buy/sell prices (Guild tithe shown where it applies) and BUY/SELL buttons. Bought goods go into a persistent cargo hold (`player_cargo` table, survives disconnect) tracked with weighted-average cost. Selling requires holding the good; over-selling clamps to what you have.

Trading moves the local market: buying tightens local supply and nudges the price up, selling floods it and nudges the price down (scaled by lot size, eased toward a supply-adjusted target, and decaying back over the 5-min tick). No inter-colony shipping yet — buy and sell happen at the same colony. Stage 3 adds arbitrage shipping (buy cheap here, ship through the lane/risk/insurance system, sell dear there).

Endpoints: `POST /api/commodities/buy`, `POST /api/commodities/sell`, `GET /api/cargo/me`. Verified: weighted-avg cost, over-sell clamp, and supply-driven price movement.

---
## v1.0.2.5 (2026-05-30)

**Commodity market — stage 1: control-driven price grid (backend).**

First piece of the new shipping/commodity economy. 12 commodities across three classes (Tech/Industrial, Medical, Agricultural), each tied to a market sector. Every colony has a live price per commodity that floats on which faction leads it: Coalition subsidizes medical (cheap), Syndicate gouges it (dear), Void has cheap tech but dear agriculture (can't farm), Guild keeps narrow efficient spreads plus a small buy-side tithe. Prices mean-revert toward a control-driven target on a 5-min tick with per-faction volatility, clamped to a sane band. Contested colonies carry a scarcity premium.

New `commodity_prices` table (colony × commodity grid). Read endpoints: `GET /api/commodities` (definitions) and `GET /api/commodities/:colonyId` (live grid with buy/sell prices, Guild tithe applied to buys). Prices seed on boot and lazily on first colony read. No trading or shipping yet — that's stage 2 (buy/sell + cargo) and stage 3 (arbitrage shipping). Verified: medical arbitrage spread Coalition→Syndicate ~58%.

Also fixed a leftover 3-faction control object in `runGalaxyTick` (now includes Guild).

---
## v1.0.2.4 (2026-05-29)

**Capital Houses — guild redesign: rename, faucet removal, performance P&L, and governance/voting.**

### Renamed to Capital Houses
The player-fund system is now "Capital Houses" (tab, directory, create form). "Merchants Guild" now refers only to the Patreon tier and its chat channels, ending the three-way collision on the word "Guild." Internal `type`/route ids unchanged. The Merchants Guild "Join" button is now a "★ Become a Patron" CTA that opens patreon.com/FLSH instead of POSTing `/join`.

### Passive faucets removed
Both minted passive-income paths on funds are gone — houses earn through trading performance, not yield: hourly savings interest (`applyFundSavingsInterest`, cron disabled) and the 30-min profit distribution (`DIST_RATE`, removed; the loop now only snapshots NAV). Savings-rate UI badge removed.

### Performance P&L
New `fund_nav_history` table (`fund_id, nav, spp, total_shares, ts`, 1000-row cap) + `recordFundNAVFn` writer and `GET /api/funds/:id/history`. Funds are snapshotted on every trade/deposit/withdraw and on the 30-min loop. The house view shows an allocation donut (NAV composition, NAV in center) plus six metric cards (Max Drawdown, Best/Worst Period, Volatility, Win Rate, Total Return) computed from the value-per-share series — matching the player P&L. spp is the performance line (not raw NAV), so it reflects trading rather than deposits/withdrawals. History begins at deploy.

### Four-pane house view
The detail panel is restructured into sub-views: **Overview** (stats, performance, deposit/withdraw, members), **Portfolio** (holdings, direct trade, activity), **Governance** (mode, proposals, polls), **Manage** (owner: slots, withdraw, assign, invite, edit, disband). Single withdraw control; destructive actions isolated in Manage (owner-only tab).

### Merchants Guild as a 4th controlling faction
The Merchants Guild is now a full galaxy faction alongside Coalition, Syndicate, and Void — fundable on the colony detail page and in the God Panel, able to contest and conquer colonies the same way. Added a `control_guild` column to `colony_state` (lazy ALTER for live DBs). The funding endpoint now redistributes control four ways with a proportional drain that always re-sums to 100, with no faction below 1%. The Guild starts holding **Eyejog** and **Dust Basin** as its territory; a one-time boot correction assigns those two to the Guild only if untouched (war_chest 0, no prior guild control), so it never clobbers live state. Removed Eyejog's old "Patreon-only / cannot be contested" sovereign lock — it is now a normal guild-held colony. Guild players earn the same per-colony passive and bonuses; conquest, leading-faction, and shipping/smuggling risk calcs all recognize the Guild. Also fixed a latent bug where one funding path sent `faction` instead of `factionId` and silently failed.

### Galaxy grey-lane visibility
Grey-market shipping lanes used `#999`, which was nearly invisible against the dark space background. The newly-connected frontier colonies (Eyejog, Dust Basin, Nova Reach, Iron Shelf, Margin Call) link only via grey lanes, so they appeared orphaned even though the lanes were present and clickable. Brightened grey lanes to `#c8cdd6` and matched the map legend swatch.

### Galaxy faction-control fix
The lower-cluster colonies (Eyejog, Dust Basin, Nova Reach, Iron Shelf, The Ledger, Signal Run, Scrub Yard, The Escrow, Margin Call) were rendered on the map but never seeded into `colony_state`, so funding faction control on them returned "colony not found." Added all nine to the colony defaults, and made the seeder backfill per-colony on boot (INSERT OR IGNORE each, instead of bailing whenever any rows already exist) so existing servers pick up the missing colonies without resetting live control/tension on the others.

### Portfolio dividends
Capital Houses (and the Merchants Guild) now earn dividends on the shares they hold, paid into fund cash on the same 2h cycle and base sector rates as players (full rate on Finance/Insurance/Energy/Tech, base rate elsewhere). Funds use the same continuous-holding eligibility as players via a parallel `fund_holding_snapshots` table — no faction/guild bonuses (player-only). A house must hold a position through the eligibility window before it pays, so dividends begin a few cycles after deploy.

### Governance & voting
Owner sets a per-house mode:
- **Executive** — owner trades directly; members passive. (Default for player houses.)
- **Majority Vote** — members propose; passes when yes-weight beats no-weight; direct trades blocked. (Default for the Merchants Guild.)
- **Executive + Council** — members vote (advisory); owner holds final execute/veto and may trade directly.

**Vote weight:** `equal` (one member, one vote) or `shares` (weighted by holdings). **Threshold:** majority of votes *cast*. A proposal resolves the moment every eligible member has voted (owner included; 0-weight members don't block it), otherwise on the owner-set **voting window** — a per-house dropdown of 30m / 1h / 6h / 24h / 3d (default 6h). Proposer auto-casts a yes.

Schema: `house_proposals` + `house_votes` tables (fund-scoped); `governance`, `vote_weight`, `vote_duration_ms` columns on `funds` (lazy ALTER). Endpoints: `POST /api/funds/:id/governance` / `/propose` / `/vote` / `/proposal/:pid/resolve`. Trade execution unified in a shared `executeFundTrade` (direct trades, passed votes, owner overrides). A 60s tick resolves expired proposals; the legacy global-guild proposal system is untouched.

---

## v1.0.2.3 (2026-05-29)

**Weekend bugfix batch.**

### Hedge fund disband payout
`POST /api/funds/:id/delete` refunded each member their original `deposited` amount, ignoring any gains or losses on the fund's holdings — members effectively cashed out at cost basis. Disband now pays each non-owner member their **current share value** (`shares × NAV/totalShares`), with holdings valued at live ticker price. Owner still receives the flat Ƒ5M creation-cost rebate.

### Drone-mining instant kills
Enemies were placed at a uniform-random point inside each newly loaded chunk with no floor on distance to the drone. A chunk overlapping the drone could spawn a hostile on top of the player, one-shotting the drone the moment the chunk loaded. Spawns now reject any position inside `ENEMY_AGGRO_BASE × aggroBoost × 1.25` of the drone (up to 8 retries, then the spawn is skipped), guaranteeing enemies appear outside their own aggro range.

### SWT hard-locked
SWT ran through the beta-model tick with strong anchored mean-reversion around Ƒ4500. That produced a tight, predictable oscillation traders could exploit. SWT is now pinned flat at Ƒ4500 every tick (no drift, no noise, no reversion); a flat OHLC bar is still recorded so the chart renders a clean horizontal line.

### Patreon webhook email matching
The webhook read the patron email only from `included[type=user].attributes.email`. First-time activations match solely on email (no `patreon_member_id` stored yet), so a missing/oddly-cased field meant the role never assigned. The handler now reads the member resource email first, falls back to the included user email, and normalizes (trim + lowercase) to match the stored value (lookup is already `COLLATE NOCASE`).

---

## v1.0.2.2 (2026-04-19)

**NPC ship classes + friendly variants + class-scaled salvage.**

### NPC ship classes
NPCs now spawn as one of five ship classes instead of a single fighter type. Each class has distinct stats (HP, speed, fire rate, hitbox, render size) that stack with existing faction stats.

| Class | HP | Speed | Fire rate | Salvage | Notes |
|---|---|---|---|---|---|
| Fighter | 2 | 1.0× | 1.0× | 1.0× | Baseline, same as before |
| Scout | 1 | 1.4× | 1.1× | 1.2× | Fast, fragile |
| Prospector | 3 | 0.95× | 0.9× | 1.6× | Tanky, slower |
| Hauler | 4 | 0.75× | 0.8× | 2.2× | Slow, hard to kill, big target |
| Dreadnought | 8 | 0.70× | 1.5× | 4.0× | Rare boss encounter |

Class spawn distribution shifts by depth band — NEAR zone is mostly fighters, VOID is mostly haulers. Dreadnoughts have a flat 1% chance at any band, making them an RNG threat even in starter zones.

NPC ships use the existing buyable ship sprites (Scout/Prospector/Hauler/Dreadnought × Coalition/Syndicate/Void variants). Hauler and Dreadnought render noticeably larger than Fighter.

### Dreadnought warning label
Dreadnoughts wear a `⚠ DREADNOUGHT` label instead of the standard `HOSTILE` tag so players immediately know they're staring down a capital-class threat. Label font is bumped and the glow plate is slightly larger.

### Class-scaled salvage
`salvageValueForEnemy` now multiplies the base band value by class salvageMul. A Dreadnought kill in VOID with chase bonus can hit ~Ƒ1,200. Bigger hulls = bigger scrap drops, matching the effort required to kill them. Still worthwhile to engage capital ships if you've got combat-oriented gear.

### Friendly variants (same ship faction = ally)
New `isPlayerAlly(faction)` helper: a faction is friendly to the player if it matches either their FM account faction OR their equipped ship's faction. Flying a Syndicate hull into Syndicate space means the patrol ships there are your allies, even if your FM account is Coalition.

In rival sectors, 20% of NPCs spawn flying the player's ship-faction colors instead of the sector's. This creates a sense of contested territory — Coalition patrols show up in Syndicate space and vice versa. Dreadnoughts never spawn as allies; they're always hostile to preserve the threat.

Ally NPCs get a green `ALLY` label instead of red `HOSTILE`, making them visually distinguishable at a glance.

All aggro / beam / bullet checks updated to use `isPlayerAlly` — your escorts' beam passes through ally NPCs, enemy bullets from ally factions don't hit you, etc.

### Files modified
- `client/assets/drone-mining/index.html` — `NPC_SHIP_CLASSES` table, `NPC_CLASS_TABLE` spawn weights per band, `pickNpcClass()`, `isPlayerAlly()` + `isPlayerEnemy()` helpers, refactored enemy spawn in `buildChunk`, refactored `drawEnemy` to use class sprite + dynamic size + maxHp-aware HP bar, DREADNOUGHT/ALLY labels, `salvageValueForEnemy` class multiplier, all faction aggro checks updated to use the helpers.

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
