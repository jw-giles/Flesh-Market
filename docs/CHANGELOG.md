# FleshMarket — Changelog

All versions in chronological order. Each entry corresponds to a former `PATCH_NOTES_X.md` file, now unified here.

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
