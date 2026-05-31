# FleshMarket — Polish & Balance Assessment Before First Main Push

Written against the actual code in this build (1.0.3.3). Tied to real constants, not
generic advice. Ordered by priority: blockers first, then balance, then features.
Nothing here is done yet — this is a reading doc to decide what's worth doing before
the commodity arc goes live on the VPS.

---

## TIER 1 — Should decide before pushing to main

### 1. The 1,000 SC start vs the 150,000 SC ship wall (the big one)
New players start with **1,000 SC** (db.js:61). The cheapest ship, the Courier, costs
**150,000 SC** (server.js:687), and commodity buy/sell/ship are ALL gated behind owning
a ship (the `no_ship` guard). So a brand-new player cannot touch the entire commodity
economy — the headline feature of this arc — until they've earned 150x their starting
cash through the *stock* game.

This may be exactly what you want (commodities as a mid/late-game system you graduate
into), or it may wall off your newest players from the thing that's most fun to show
off. Three ways to think about it:
- **Keep it.** Commodities are an earned, aspirational system. Stocks are the on-ramp.
  Pro: protects the economy from zero-stakes spam. Con: a new Patreon supporter who
  came for "complex shipping" can't ship anything for hours.
- **Cheap entry tier.** Add a "Junker" ship below Courier — e.g. 5,000 SC, 1,000-unit
  hold, +8% risk. Lets new players dip into commodities immediately at small scale,
  with real ships as the upgrade path. Most reversible / least economically risky.
- **Lower the Courier** to something a few good stock trades reach (e.g. 25k–50k).
  Simplest, but compresses the whole ship ladder.

This is a design call only you can make. My lean: a cheap Junker tier, because it opens
the feature without flattening the Courier→Freighter→Hauler progression you built.

### 2. Two parallel shipping systems now coexist
There's an OLDER cargo system still in the code (server.js ~492–520):
`synth_organs`, `contraband_arms`, `sweet_wine`, etc. with `baseMult`/`riskMod`, plus
freight tiers (`standard_freight`/`premium_goods`/`luxury_supplies`). This predates the
27→120 commodity arc and the phased-shipping rewrite. The new system (commodities +
player_cargo + cargo_shipments + 10-min phases) is what the Markets/Shipping tabs use.

Risk: players may find two different "shipping" concepts, or the old one may have its own
UI entry points that now feel vestigial. Before main, decide: retire the old smuggling
system, or keep it as a distinct "contraband" mechanic that's deliberately separate from
legal commodity freight. Either is fine — but two half-overlapping systems shipping at
once is the kind of thing that confuses a new player. Worth an explicit decision, not a
drift.

### 3. prompt() dialogs for buy/sell/ship quantity
Three spots still use the browser `prompt()` box (galaxy.js:2161, 2178, 2917). It works,
but it's jarring, unstyled, blocks the page, and on mobile it's genuinely bad. For the
headline feature's primary interaction (entering a trade quantity), an inline input or a
small in-panel stepper would feel dramatically more finished. This is the single biggest
"feels unpolished" item a new player hits immediately. Recommended before main.

---

## TIER 2 — Balance tuning (now testable since it's playable)

### 4. NPC volume + drift were tuned for 27 commodities, not 120
Current constants: NPC_MAX_SHIPS=14, NPC_SPAWN_MS=6s (server.js:3148-49), light drift
hits 4 random colony/commodity pairs every 12s (server.js:6640). With the catalog now at
**120 commodities × 19 colonies = 2,280 prices**, the same NPC fleet and drift are spread
across ~4x more surface. Net effect: each individual commodity moves LESS often than it
did at 27. The board may feel quieter per-item than intended.

Levers, all one-number changes:
- Raise NPC_MAX_SHIPS (14 → 20–25) for more ambient traffic.
- Shorten NPC_SPAWN_MS (6s → 4s) to spawn faster.
- Raise the drift count (4 → 8–10 pairs per tick) so more of the board breathes.
Recommend: play 20 minutes, watch whether arbitrage spreads feel alive or static, then
nudge. Don't over-correct — too much movement makes spreads un-actionable.

### 5. Return-cost / fuel formula vs. profit
Return cost = `2000 + capacity*0.02 + buyCost*0.005` (server.js:3422). For a Hauler
(70k cap) that's a 2000 + 1400 = ~3,400 SC floor per run before cargo value. Worth
sanity-checking that a full Hauler run's arbitrage profit comfortably exceeds fuel +
insurance + the risk-adjusted expected loss, or big ships are a trap. A quick spreadsheet
pass (cheapest-buy to dearest-sell spread × capacity − fuel − expected interception loss)
would confirm each ship tier is worth its price. I can generate that table if you want.

### 6. Affinity ±20% may be too small or too large
The per-colony per-commodity price affinity is ±20% (commodityColonyAffinity). That's
what makes every colony a distinct market. Worth confirming the resulting spreads are big
enough to be worth a 10-minute shipping run after costs, but not so big that arbitrage is
risk-free money. This pairs with #5 — they're the same "is shipping worth it" question
from two directions.

### 7. Dividend / earning cadence vs. ship prices
Dividends pay 0.6% of position value every 2 hours (server.js:280), only sectors
0/2/4/6, only while connected. Faction colony control pays a passive bonus too. Worth a
back-of-envelope: how long does a typical player take to earn their first 150k ship?
If it's "many hours of stock trading," that reinforces the Tier-1 #1 concern.

---

## TIER 3 — Features that would be cool (post-main, ranked by impact/effort)

### A. Price history sparklines on the board  (high impact, medium effort)
You already push live `commodity_tick` updates. Storing a short rolling price history
per commodity (last N points, in memory) and drawing a tiny sparkline in each board row
would make the market read like a real trading terminal — your stated aesthetic. Players
could see "this is trending up" at a glance. Fits the stock-ticker direction you already
asked for.

### B. NPC fleet persistence across restart  (low effort, quality-of-life)
The NPC fleet is in-memory and reseeds on restart (deliberate, but it means a `pm2
restart` blips the whole market's in-flight pressure). Persisting active NPC ships to a
table — or just their net price effects — would make restarts seamless. Low effort,
mostly invisible-when-working polish.

### C. "Trade route" planner / saved runs  (medium, high player value)
Players manually scan the board for spreads. A "best route for my ship right now" helper
— given your capacity and current colony, here are the top 3 profitable runs — would make
the depth approachable instead of overwhelming at 120 commodities. Risk: too much
hand-holding (you've explicitly pushed back on that). Could be opt-in / advanced only.

### D. Commodity events / shocks  (medium, high flavor)
Tie commodity prices to the existing news/headline system: "Famine on Lustandia" spikes
agri prices there; "Tech embargo" tanks tech demand in a faction. Turns the static
affinity map into a living one players watch the news for. Strong fit with you being the
GM of a living narrative. Pairs naturally with Corporate Wars.

### E. Ship loss/damage stakes  (design-heavy)
Currently interception loses cargo but the ship always survives. A rare catastrophic
loss (ship destroyed, must re-buy) would add real weight to insurance and route choice —
but it's punishing and needs careful tuning. Cruelty Squad aesthetic says maybe yes;
new-player retention says be careful. Flag for later, not now.

### F. Manifest depth  (low effort, flavor)
NPC manifests now show real cargo (good, hand-holding removed). Could add flavor: ship
names, faction ownership, a tiny "scanned" log aesthetic. Pure texture, cheap, fits the
terminal voice.

---

## What I'd actually do before pushing main (the short list)
1. Decide the new-player ship-wall question (#1) — it's the one real design fork.
2. Replace the three prompt() dialogs with inline inputs (#3) — biggest polish-per-hour.
3. Decide the fate of the old smuggling system (#2) — retire or differentiate.
4. Play 20 min, tune NPC/drift volume for the 120-commodity catalog (#4).
5. (Optional, fast) Run the profitability table (#5/#6) so you KNOW shipping pays.

Everything in Tier 3 is post-main. None of it blocks the push. The arc is functionally
complete and DB-safe (one additive column, three new tables); these are about making the
first thing live players see feel intentional rather than raw.
