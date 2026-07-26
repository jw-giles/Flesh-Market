// FleshMarket City Charters, simulation core (1.3.0.0).
//
// v3 topology. The galaxy's cities are permanent world objects, built out on
// arrival to a scale their planet's population justifies: New Anchor reads as
// an 820 million citizen metropolis because it is one. Players never own the
// ground. They buy the MAYORAL SEAT of a district and govern it, the way the
// Presidency is bought rather than homesteaded.
//
// Why this shape:
//   A seat is priced exponentially by how developed its district already is,
//   so opting into a built out metropolis costs orders of magnitude more than
//   taking a frontier borough nobody wants. That is the whole progression: you
//   start somewhere cheap, you govern it well, you work up.
//   A seat is contestable, but ousting COMPENSATES the incumbent, because a
//   district someone has developed for months is not the Presidency and
//   uncompensated seizure would kill every reason to build.
//   A neglected seat lapses back to NPC administration and the district drifts
//   toward its population baseline. Nothing is ever razed to unusable rubble,
//   so a planet cannot silt up with dead ground.
//
// All balance knobs live in CITY_TUNE. Retune from live play.

import {
  ensureCityState, getCityState, getAllCityStates, updateCityState,
  seedDistrict, getDistrict, getDistricts, getAllDistricts, updateDistrict,
  vacateDistrict, vacateColonySeats, colonyInvested,
  getCityShops, getDistrictShops, countDistrictShops, addShopPaid,
  clearDistrictShops, clearColonyShops, leaseShop, colonyWorks, addDistrictWorks,
  npcOwnerId, isNpcShop, deleteShop, countNpcShops, setShopEstablished,
  beginBatch, endBatch,
} from './db_city.js';

// ── Tuning ───────────────────────────────────────────────────────────────────

export const CITY_TUNE = {
  WEEK_MS:          7 * 24 * 60 * 60 * 1000,
  // Colonial administration runs every district nobody has bought, and it has
  // to run them COMPETENTLY. At 18 the floor was a failed state: solved for
  // its own fixed point it lands on crime 95, prosperity 5, output 5, so
  // every one of the 148 districts decayed to a slum within twelve weeks of
  // boot whether or not a player ever logged in, and city commerce fell 95%.
  // 50 is the lowest floor whose equilibrium is a working, dull city
  // (crime 45, unrest 45, prosperity 44, output 60). A governed district
  // still clears it by roughly 3x on commerce, which is the whole point of
  // buying the seat.
  NPC_BASE:         50,      // NPC administration floor on every lever
  RELAX:            0.35,    // weekly fraction each scalar moves toward target
  SCALAR_MIN:       5,
  SCALAR_MAX:       95,

  // Districts
  DEV_MAX:          14,      // absolute ceiling including mayoral development
  // How many levels a mayor may build ABOVE the population baseline. Cost
  // grows 2.4x a level while the commercial return per level is roughly
  // flat, so beyond four levels the marginal payback runs past five years
  // and then past fifteen. The old absolute cap of 14 advertised up to ten
  // purchasable levels on a frontier district, six of which could never
  // repay. A district is now finished when it is finished.
  DEV_LEVELS_MAX:   4,
  DEV_BASE:         15_000_000,  // cost of the first development level
  DEV_GROWTH:       2.4,     // each further level multiplies by this

  // Seats. Price tracks current development, so a well governed district is
  // expensive to take and its holder is paid more when taken.
  SEAT_BASE:        500_000,
  SEAT_GROWTH:      2.4,
  SEAT_COMPENSATION: 0.75,   // share of INVESTED capital an ousted mayor recovers
  SEAT_MIN_HOLD_MS: 7 * 24 * 60 * 60 * 1000,  // a new mayor cannot be taken for a week

  // Mayoral finances
  BILL_PER_M:       90_000,  // weekly civic bill per million citizens at full levers
  CUT_MIN:          0.05,    // mayor's commerce cut, band the mayor sets within
  CUT_MAX:          0.25,
  CUT_DEFAULT:      0.12,
  ARREARS_LAPSE_WK: 4,       // weeks of unpaid bill before the seat vacates
  // The rate and the zoning are set once a settlement period, not per second.
  // Nothing prices off them any more, but a mayor who can move both instantly
  // can still whipsaw every tenant in the district between two ticks.
  LEVER_COOLDOWN_MS: 60 * 60 * 1000,
  // Tick clock. dtWeeks used to be CITY_TICK_MS/WEEK_MS, a constant, with the
  // tick also firing unconditionally at boot: every restart paid a full period
  // of income to the whole galaxy no matter how long had actually passed, and
  // every real outage paid one period no matter how long it lasted. Elapsed
  // time now comes off a persisted clock.
  TICK_MIN_MS:      60 * 1000,            // below this, the tick is a no-op
  TICK_CATCHUP_MAX_MS: 24 * 60 * 60 * 1000, // most one tick may settle at once

  // ── Player draw ───────────────────────────────────────────────────────────
  // A player storefront and one of the twenty five thousand established firms
  // counted identically toward how busy a district reads, so nothing about a
  // district improved when real people moved in and a mayor had no reason to
  // court anyone. Keyed on DISTINCT owners, not shop count, or one player
  // leasing twenty units collects the whole bonus and the incentive inverts
  // into exactly the monopoly it is supposed to discourage.
  PLAYER_DRAW_MAX:  0.35,   // ceiling on the bonus to the commercial pool
  PLAYER_DRAW_K:    3.0,    // distinct owners for ~63% of the ceiling

  // ── Legitimacy ────────────────────────────────────────────────────────────
  // Legitimacy was simulated, displayed, and read by nothing except its own
  // contribution to unrest. It now prices the seat. Governing badly already
  // cost occupancy through TAX_FLIGHT, which is slow and private; this makes
  // it public, because a district that despises its mayor is cheap to take.
  // Applied to the BASELINE term only. The invested term passes through at
  // face value and compensation is a fraction of it, and that is the property
  // that stops seat trading being a money printer.
  SEAT_LEGIT_SWING: 0.60,   // +/- this share of base price across the range

  // ── Petitions ─────────────────────────────────────────────────────────────
  // The tenant side of the same lever. Weighted by stake and rate limited,
  // because the payoff is a cheaper seat and the obvious abuse is to lease in,
  // petition, and buy the seat you just devalued.
  PETITION_MIN_AGE_MS: 6 * 7 * 24 * 60 * 60 * 1000,  // half the ramp
  PETITION_COOLDOWN_MS: 24 * 60 * 60 * 1000,
  PETITION_HIT:     6,      // legitimacy points per filing, before stake weight

  // ── Charter ───────────────────────────────────────────────────────────────
  // A colony level office above the district mayors, held by whoever has the
  // most capital standing on that world. charter_owner has been in the schema
  // since cities shipped and was read in exactly one place, the conquest path,
  // and written nowhere, so the branch that spares a city held by one of the
  // capturing faction's own could never fire.
  CHARTER_MIN_BOOK: 50_000_000,

  // ── City demand on the commodity grid ─────────────────────────────────────
  // Unmet civic demand presses on the colony's own commodity prices. Sized by
  // tools/city-commodity-sim.mjs: steady state supply is draw/decay = 25x the
  // per tick nudge, and supplyMod clamps at +/-0.4. At 0.020 three of six test
  // colonies sat on the clamp 98% of the time, which flattens the map and
  // deletes the arbitrage. At 0.008 nothing clamps in peacetime, the spread
  // between cheapest and dearest colony is 47%, and a blockade still bites.
  COMMODITY_DRAW:   0.008,
  COMMODITY_BLOCKADE_AMP: 1.5,

  // ── Corruption ────────────────────────────────────────────────────────────
  // Corruption was in exactly the position legitimacy was in before 1.6.2.0:
  // simulated, shown to the player, and read by nothing except its own feed
  // into crime and output. It now skims the civic bill, so a district that has
  // rotted costs its mayor more to run than the levers claim, and lv_politics
  // stops being a slider that moves a number nobody can act on.
  //
  // Only the SKIM is corrupt, not the whole bill. At the ceiling a mayor pays
  // BILL_SKIM_MAX more than the services they are actually buying.
  BILL_SKIM_MAX:    0.45,
  BILL_SKIM_FLOOR:  20,     // corruption below this is ordinary friction, free

  // ── Stockpiles ────────────────────────────────────────────────────────────
  // A blockade used to leave a mayor with nothing to do but zone, which is a
  // decision measured in weeks against a siege measured in days. Cover can be
  // bought ahead of time. It is deliberately expensive and it deliberately
  // rots: a stockpile is insurance, not a second economy.
  STOCK_UNIT_COST:  240_000,     // per supply unit
  STOCK_DECAY_WK:   0.14,        // fraction that spoils per week
  STOCK_MAX_WK:     6,           // most weeks of local demand one district may hold

  // ── Firm churn ────────────────────────────────────────────────────────────
  // Twenty five thousand businesses that never failed and never opened. Churn
  // is small on purpose: it exists so a badly run district visibly loses its
  // trade and so the buyout market has fresh stock, not to move the economy.
  CHURN_BASE_WK:    0.010,       // share of NPC firms that fold per week at rest
  CHURN_STRESS_WK:  0.055,       // additional share at maximum unrest and crime

  // Zoning: a mayor nominates one trade to favour
  FAVOUR_BONUS:     0.35,    // favoured trade earns this much more
  FAVOUR_PENALTY:   0.12,    // everything else earns this much less

  // NPC businesses. A city's frontage is not empty: established firms already
  // trade there, in numbers set by how much economy the place has. They pay
  // the mayoral cut like anyone else, so a seat earns from the day it is
  // bought rather than waiting for players to arrive, and they can be bought
  // out, which is how a player enters a district whose frontage is taken.
  NPC_OCC_BASE:     0.14,    // floor occupancy on the poorest world
  NPC_OCC_POP:      0.46,    // weight of citizens served
  NPC_OCC_CAPITAL:  0.10,    // capitals run busier
  NPC_OCC_DEV:      0.20,    // weight of development above baseline
  NPC_OCC_MAX:      0.78,
  // Businesses respond to what the district charges them. Without this the
  // commerce rate was a fake lever: take rose monotonically with the rate, so
  // the maximum was always correct and there was nothing to decide. Firms now
  // leave a district that taxes hard, which puts a real optimum somewhere in
  // the middle and makes undercutting a neighbour an actual strategy.
  TAX_FLIGHT:       0.62,    // share of occupancy lost at the maximum rate
  NPC_BUYOUT_WEEKS: 20,      // premium over a bare lease, in weeks of net income

  // A new storefront takes time to matter. It opens on a fraction of its
  // eventual trade and climbs to full over SHOP_RAMP_WK. This is what a
  // buyout actually purchases: an established firm is already at full trade,
  // so taking one over skips the climb entirely. Without a ramp there is no
  // reason to ever buy a business rather than lease the vacancy next door.
  SHOP_RAMP_WK:     12,
  SHOP_RAMP_FLOOR:  0.18,    // share of full trade on opening day

  // Commerce
  COMMERCE_DEV_POW: 1.6,     // pool scales with development RELATIVE to baseline
  COMMERCE_POP_K:   2_100,   // weekly consumer spend per thousand citizens, at full frontage
  SHOP_SLOT_PER_DEV: 34,     // storefront capacity per development level
  SHOP_CEIL_WK:     45_000,  // per shop weekly floor ceiling, per dev level
  // The ceiling exists to stop ONE storefront taking a whole trade, not to
  // cap the district. As a flat number it did the second thing: a capital's
  // 117 firms could physically absorb F47M of a F97M pool, so most of the
  // city's commerce was unreachable no matter who governed or who traded.
  // The real cap is a share of the trade the shop is in, with the flat
  // number kept as a floor so a thin frontier district still has headroom.
  SHOP_CEIL_SHARE:  0.35,
  SHOP_LEASE_BASE:  3_000_000,
  SHOP_SCARCITY:    1.6,     // how hard a shortage tilts demand toward a trade
  SHOP_KIND_WEIGHT: { export: 0.25, food: 0.40, med: 0.20, tech: 0.15 },

  // Supply
  SUPPLY_PER_DEV:   0.09,    // supply units per dev level of civic-favoured district
  W_FOOD:           55,
  W_MED:            25,
  W_TECH:           15,

  // Occupation
  STRIP_HOLD_MS:    7 * 24 * 60 * 60 * 1000,
  STRIP_EVERY_MS:   24 * 60 * 60 * 1000,
  STRIP_RATE:       0.05,
  WAR_RATE_K:       4.42,
  WAR_RATE_POW:     0.75,
  WAR_TRIGGER_PTS:  15,

  // ── Civic works ───────────────────────────────────────────────────────────
  // Development is an income instrument and it is capped at four levels because
  // past that a level cannot repay. Civic works is the opposite instrument and
  // is uncapped on purpose: it is a declared money sink, priced in billions,
  // that returns NOTHING in commerce. What it buys is a skyline, a quieter
  // city, local supply, and weight against an invader. A monument is not
  // supposed to pay for itself, which is exactly why it can cost this much.
  // Scale check: at growth 1.9 to eight levels a single district cost F375B to
  // finish, which is more than the galaxy has. Six levels at 1.55 tops out at
  // F46.8B for a completed district, the fourth landmark lands around F10B and
  // the fifth around F29B. Those are whale numbers and endgame numbers rather
  // than impossible ones, which is what a monument should be.
  WORKS_BASE:       2_000_000_000,  // first monument
  WORKS_GROWTH:     1.55,           // each further one multiplies by this
  WORKS_MAX:        6,              // levels per district
  WORKS_UNREST:     3.0,            // unrest target reduction per works level
  WORKS_PROSPERITY: 3.0,            // prosperity target lift per works level
  WORKS_SUPPLY:     0.05,           // supply units per works level, favoured trade
  // Works count into the war book but NOT into salvage. A monumented city is
  // dear to take and yields nothing extra to the raider who takes it. That
  // asymmetry is the whole defensive value: you cannot loot a cathedral.
  WORKS_WAR_WEIGHT: 1.0,

  // Jade Circuit: Circuit members trading in Circuit cities take this much more
  // on export gross. Deliberately LOCAL rather than a global buff bought once
  // with a single cheap storefront somewhere in Jade space.
  JADE_EXPORT_BONUS: 0.05,
};

// Colonies that can host a city. Flesh Station is the dev megastructure and
// Abaddon has no surface. Jade galaxy colonies are outside colony_state.
export const CITY_COLONIES = {
  new_anchor:       { pop: 820, capital: 1 },
  cascade_station:  { pop: 340, capital: 0 },
  frontier_outpost: { pop: 40,  capital: 0 },
  the_hollow:       { pop: 610, capital: 1 },
  vein_cluster:     { pop: 280, capital: 0 },
  aurora_prime:     { pop: 450, capital: 0 },
  null_point:       { pop: 380, capital: 1 },
  limbosis:         { pop: 120, capital: 0 },
  lustandia:        { pop: 210, capital: 0 },
  gluttonis:        { pop: 260, capital: 0 },
  eyejog:           { pop: 190, capital: 1 },
  dust_basin:       { pop: 90,  capital: 0 },
  nova_reach:       { pop: 150, capital: 0 },
  iron_shelf:       { pop: 230, capital: 0 },
  the_ledger:       { pop: 170, capital: 0 },
  signal_run:       { pop: 110, capital: 0 },
  scrub_yard:       { pop: 130, capital: 0 },
  the_escrow:       { pop: 160, capital: 0 },
  margin_call:      { pop: 140, capital: 0 },
  // Jade Circuit. Populations set from the Circuit's own scale rather than
  // copied off the Coalition: Yujing is the Circuit capital and reads like one,
  // Chiyou Marches is a war frontier nobody wants to live on.
  yujing:            { pop: 760, capital: 1, jade: 1 },
  tiangong:          { pop: 540, capital: 1, jade: 1 },
  xuanwu_bastion:    { pop: 400, capital: 1, jade: 1 },
  quanzhou_docks:    { pop: 350, capital: 0, jade: 1 },
  zhenghe_anchorage: { pop: 310, capital: 0, jade: 1 },
  shennong_reach:    { pop: 290, capital: 0, jade: 1 },
  changzheng_yards:  { pop: 270, capital: 0, jade: 1 },
  houtu_foundry:     { pop: 240, capital: 0, jade: 1 },
  mozi_array:        { pop: 220, capital: 0, jade: 1 },
  zhurong_foundry:   { pop: 200, capital: 0, jade: 1 },
  houji_fields:      { pop: 180, capital: 0, jade: 1 },
  haisi_waystation:  { pop: 160, capital: 0, jade: 1 },
  lingtai_reach:     { pop: 110, capital: 0, jade: 1 },
  fuxi_observatory:  { pop: 95,  capital: 0, jade: 1 },
  wukong_deep:       { pop: 130, capital: 0, jade: 1 },
  chiyou_marches:    { pop: 70,  capital: 0, jade: 1 },
};

// A Circuit world. Drives the seat gate, the district name pool and the
// Jade Circuit export bonus.
export function isJadeColony(colonyId) {
  const m = CITY_COLONIES[colonyId];
  return !!(m && m.jade);
}

export const COLONY_VISUAL = {
  new_anchor:       { layout: 'radial',      terrain: 'tether'  },
  cascade_station:  { layout: 'grid',        terrain: 'station' },
  frontier_outpost: { layout: 'archipelago', terrain: 'ice'     },
  the_hollow:       { layout: 'terraced',    terrain: 'rift'    },
  vein_cluster:     { layout: 'spine',       terrain: 'veins'   },
  dust_basin:       { layout: 'organic',     terrain: 'dust'    },
  aurora_prime:     { layout: 'radial',      terrain: 'ice'     },
  null_point:       { layout: 'radial',      terrain: 'rift'    },
  limbosis:         { layout: 'terraced',    terrain: 'rift'    },
  lustandia:        { layout: 'organic',     terrain: 'tether'  },
  gluttonis:        { layout: 'grid',        terrain: 'dust'    },
  eyejog:           { layout: 'radial',      terrain: 'dust'    },
  nova_reach:       { layout: 'spine',       terrain: 'ice'     },
  iron_shelf:       { layout: 'terraced',    terrain: 'veins'   },
  the_ledger:       { layout: 'grid',        terrain: 'station' },
  signal_run:       { layout: 'spine',       terrain: 'station' },
  scrub_yard:       { layout: 'archipelago', terrain: 'dust'    },
  the_escrow:       { layout: 'organic',     terrain: 'veins'   },
  margin_call:      { layout: 'grid',        terrain: 'veins'   },
  yujing:            { layout: 'radial',      terrain: 'tether'  },
  tiangong:          { layout: 'radial',      terrain: 'station' },
  xuanwu_bastion:    { layout: 'terraced',    terrain: 'ice'     },
  quanzhou_docks:    { layout: 'archipelago', terrain: 'tether'  },
  zhenghe_anchorage: { layout: 'spine',       terrain: 'station' },
  shennong_reach:    { layout: 'organic',     terrain: 'dust'    },
  changzheng_yards:  { layout: 'grid',        terrain: 'station' },
  houtu_foundry:     { layout: 'terraced',    terrain: 'veins'   },
  mozi_array:        { layout: 'grid',        terrain: 'ice'     },
  zhurong_foundry:   { layout: 'spine',       terrain: 'veins'   },
  houji_fields:      { layout: 'organic',     terrain: 'dust'    },
  haisi_waystation:  { layout: 'archipelago', terrain: 'station' },
  lingtai_reach:     { layout: 'spine',       terrain: 'ice'     },
  fuxi_observatory:  { layout: 'radial',      terrain: 'ice'     },
  wukong_deep:       { layout: 'terraced',    terrain: 'rift'    },
  chiyou_marches:    { layout: 'archipelago', terrain: 'dust'    },
};

export function isCityColony(colonyId) {
  return Object.prototype.hasOwnProperty.call(CITY_COLONIES, colonyId);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Deterministic randomness ─────────────────────────────────────────────────

export function seedFromId(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── District count and baseline development ──────────────────────────────────
// A forty million citizen outpost with eleven boroughs reads as filler. Count
// scales with population so a planet's political weight is legible on sight.

export function districtCount(populationM) {
  return Math.max(3, Math.min(14, Math.round(3 + Math.sqrt(populationM) / 3.2)));
}

// What development a district has purely from the citizens it serves. This is
// the lore-accurate arrival state, before any player has ever governed it.
export function baselineDev(popPerDistrictM) {
  return clamp(Math.round(1.4 * Math.log2(Math.max(1, popPerDistrictM))), 1, 11);
}

// Cumulative capital required to add `levels` of development above baseline.
export function devCost(levels) {
  const T = CITY_TUNE;
  if (levels <= 0) return 0;
  return T.DEV_BASE * (Math.pow(T.DEV_GROWTH, levels) - 1) / (T.DEV_GROWTH - 1);
}
// A level count derived by logarithm lands a hair under the integer: a district
// that has paid exactly for level 2 reads as 1.99926, floors to 1, and gets
// charged a token amount for level 2 again forever. Snap to the integer when
// we are within a rounding error of it.
function snapLevel(raw) {
  const r = Math.round(raw);
  return Math.abs(raw - r) < 1e-6 ? r : raw;
}
// Inverse: how many levels a given investment has bought.
export function devFromInvested(invested) {
  const T = CITY_TUNE;
  if (!invested || invested <= 0) return 0;
  const x = invested * (T.DEV_GROWTH - 1) / T.DEV_BASE + 1;
  return snapLevel(Math.log(x) / Math.log(T.DEV_GROWTH));
}
// Marginal cost of the next whole level above what is already bought.
export function nextLevelCost(invested) {
  const have = Math.floor(devFromInvested(invested));
  return Math.max(1, devCost(have + 1) - invested);
}

// Same geometric shape as development, different scale and no cap on returns
// because there are none: works buy standing, not income.
export function worksCost(levels) {
  const T = CITY_TUNE;
  if (levels <= 0) return 0;
  return T.WORKS_BASE * (Math.pow(T.WORKS_GROWTH, levels) - 1) / (T.WORKS_GROWTH - 1);
}
export function worksFromSpend(spent) {
  const T = CITY_TUNE;
  if (!spent || spent <= 0) return 0;
  const x = spent * (T.WORKS_GROWTH - 1) / T.WORKS_BASE + 1;
  return Math.min(T.WORKS_MAX, snapLevel(Math.log(x) / Math.log(T.WORKS_GROWTH)));
}
export function nextWorksCost(spent) {
  const have = Math.floor(worksFromSpend(spent));
  if (have >= CITY_TUNE.WORKS_MAX) return 0;
  return Math.max(1, worksCost(have + 1) - spent);
}
export function worksLevel(d) { return worksFromSpend(d ? (d.works || 0) : 0); }
export function worksComplete(d) { return worksLevel(d) >= CITY_TUNE.WORKS_MAX - 1e-9; }

export function popPerDistrict(colonyId) {
  const st = getCityState(colonyId);
  const pop = st ? st.population : (CITY_COLONIES[colonyId] ? CITY_COLONIES[colonyId].pop : 60);
  return pop / Math.max(1, districtCount(pop));
}

// Effective development: the population baseline plus whatever the mayor built
// on top of it, capped at DEV_MAX. Frontier boroughs have the most headroom,
// capitals have the most prestige, which is the intended asymmetry.
export function districtDev(colonyId, d) {
  const base = baselineDev(popPerDistrict(colonyId));
  const bonus = Math.min(devFromInvested(d ? d.invested : 0), CITY_TUNE.DEV_LEVELS_MAX);
  return clamp(base + bonus, 1, CITY_TUNE.DEV_MAX);
}
// True when no further level may be bought: either the mayor has built their
// allowance above baseline, or the absolute ceiling is reached.
export function devComplete(colonyId, d) {
  const built = devFromInvested(d ? d.invested : 0);
  if (built >= CITY_TUNE.DEV_LEVELS_MAX - 1e-9) return true;
  return districtDev(colonyId, d) >= CITY_TUNE.DEV_MAX;
}

// ── Seats ────────────────────────────────────────────────────────────────────

// Two terms, deliberately different shapes.
//
// The BASELINE term is exponential in the district's population development,
// and it is the thing that makes opting into a built out metropolis cost
// orders of magnitude more than taking a frontier borough. It is pure sink.
//
// The INVESTED term passes through at face value what the sitting mayor has
// put in. It must NOT be exponential: an earlier pass priced the seat off
// total development, which meant a F2.2B investment on a high baseline
// district pushed the seat to F1.68T and paid out over a trillion in
// compensation. That is a money printer. Passing invested capital through at
// cost, and compensating a fraction of it, means an ousted mayor can never
// recover more than they spent.
export function seatBasePrice(colonyId) {
  const base = baselineDev(popPerDistrict(colonyId));
  return Math.round(CITY_TUNE.SEAT_BASE * Math.pow(CITY_TUNE.SEAT_GROWTH, base));
}
// 0.4x on a despised district, 1.6x on a well run one, at SEAT_LEGIT_SWING 0.6.
export function seatLegitimacyMult(d) {
  const legit = clamp(Number(d && d.s_legitimacy) || 50, CITY_TUNE.SCALAR_MIN, CITY_TUNE.SCALAR_MAX);
  return 1 + CITY_TUNE.SEAT_LEGIT_SWING * ((legit - 50) / 50);
}
export function seatPrice(colonyId, d) {
  return Math.round(seatBasePrice(colonyId) * seatLegitimacyMult(d)
    + (d ? (d.invested || 0) : 0));
}
export function seatCompensation(colonyId, d) {
  return Math.round((d ? (d.invested || 0) : 0) * CITY_TUNE.SEAT_COMPENSATION);
}
export function seatTakeable(d) {
  if (!d || !d.mayor) return true;
  return Date.now() - (d.took_office || 0) >= CITY_TUNE.SEAT_MIN_HOLD_MS;
}

// ── Sector geometry ──────────────────────────────────────────────────────────
// Sectors are Voronoi cells: rectangles read as machine output, irregular
// convex cells read as districts. The server generates once per colony, caches,
// and sends the polygons to the client, which never regenerates them.

function clipHalf(poly, ax, ay, bx, by) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2, nx = bx - ax, ny = by - ay, out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = (p[0] - mx) * nx + (p[1] - my) * ny;
    const dq = (q[0] - mx) * nx + (q[1] - my) * ny;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}
function voronoi(seeds, bounds) {
  return seeds.map(function (s, i) {
    let cell = bounds.slice();
    for (let j = 0; j < seeds.length; j++) {
      if (i === j) continue;
      cell = clipHalf(cell, s[0], s[1], seeds[j][0], seeds[j][1]);
      if (cell.length < 3) break;
    }
    return cell;
  });
}
function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}
function centroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    const f = p[i][0] * q[1] - q[0] * p[i][1];
    a += f; cx += (p[i][0] + q[0]) * f; cy += (p[i][1] + q[1]) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
  return [cx / (6 * a), cy / (6 * a)];
}
function insetPoly(p, f) {
  const c = centroid(p);
  return p.map(v => [c[0] + (v[0] - c[0]) * (1 - f), c[1] + (v[1] - c[1]) * (1 - f)]);
}
function inPoly(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (((p[i][1] > y) !== (p[j][1] > y))
      && (x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0])) c = !c;
  }
  return c;
}
function bboxOf(p) {
  const a = [1e9, 1e9, -1e9, -1e9];
  p.forEach(v => {
    a[0] = Math.min(a[0], v[0]); a[1] = Math.min(a[1], v[1]);
    a[2] = Math.max(a[2], v[0]); a[3] = Math.max(a[3], v[1]);
  });
  return a;
}

export const CITY_WORLD = { w: 230, h: 170 };
const WW = CITY_WORLD.w, WH = CITY_WORLD.h;
const BOUNDS = [[6, 6], [WW - 6, 6], [WW - 6, WH - 6], [6, WH - 6]];

function chanC(y) { return 118 + Math.sin(y * 0.052) * 20 + Math.sin(y * 0.15) * 6; }
function chanW(y) { return 9 + Math.sin(y * 0.09) * 3; }
function inWater(x, y) { return Math.abs(x - chanC(y)) < chanW(y); }

function seedsRadial(rng, n) {
  const out = [[WW / 2, WH / 2]];
  const inner = Math.max(1, Math.floor((n - 1) * 0.4));
  for (let i = 0; i < inner; i++) {
    const a = i / inner * 6.283 + 0.3;
    out.push([WW / 2 + Math.cos(a) * 40 + (rng() - 0.5) * 7,
              WH / 2 + Math.sin(a) * 30 + (rng() - 0.5) * 6]);
  }
  const outer = n - 1 - inner;
  for (let j = 0; j < outer; j++) {
    const b = j / Math.max(1, outer) * 6.283 + 0.9;
    out.push([WW / 2 + Math.cos(b) * 84 + (rng() - 0.5) * 9,
              WH / 2 + Math.sin(b) * 62 + (rng() - 0.5) * 8]);
  }
  return out;
}
function seedsSpine(rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    out.push([14 + t * (WW - 28) + (rng() - 0.5) * 9,
              WH / 2 + Math.sin(t * Math.PI * 1.25) * 44 + ((i % 2) ? 1 : -1) * 15 + (rng() - 0.5) * 8]);
  }
  return out;
}
function seedsGrid(rng, n) {
  const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.4))), rows = Math.ceil(n / cols), out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push([22 + c * ((WW - 44) / Math.max(1, cols - 1)) + (rng() - 0.5) * 10,
              24 + r * ((WH - 48) / Math.max(1, rows - 1)) + (rng() - 0.5) * 9]);
  }
  return out;
}
function seedsArchipelago(rng, n) {
  const out = []; let tries = 0;
  const sep = Math.max(22, 46 - n * 1.4);
  while (out.length < n && tries++ < 4000) {
    const p = [14 + rng() * (WW - 28), 14 + rng() * (WH - 28)];
    let ok = true;
    for (let i = 0; i < out.length; i++) {
      if (Math.hypot(p[0] - out[i][0], p[1] - out[i][1]) < sep) { ok = false; break; }
    }
    if (ok) out.push(p);
  }
  while (out.length < n) out.push([14 + rng() * (WW - 28), 14 + rng() * (WH - 28)]);
  return out;
}
function seedsTerraced(rng, n) {
  const rows = Math.max(2, Math.min(4, Math.ceil(n / 3))), out = [], per = Math.ceil(n / rows);
  for (let r = 0; r < rows && out.length < n; r++) {
    const cnt = Math.min(per, n - out.length);
    for (let c = 0; c < cnt; c++) {
      out.push([24 + c * ((WW - 48) / Math.max(1, cnt - 1)) + (rng() - 0.5) * 8,
                26 + r * ((WH - 52) / Math.max(1, rows - 1)) + (rng() - 0.5) * 5]);
    }
  }
  return out;
}
function seedsOrganic(rng, n) {
  const out = []; let tries = 0;
  const sep = Math.max(18, 36 - n * 0.9);
  while (out.length < n && tries++ < 4000) {
    const p = [12 + rng() * (WW - 24), 12 + rng() * (WH - 24)];
    let ok = true;
    for (let i = 0; i < out.length; i++) {
      if (Math.hypot(p[0] - out[i][0], p[1] - out[i][1]) < sep) { ok = false; break; }
    }
    if (ok) out.push(p);
  }
  while (out.length < n) out.push([12 + rng() * (WW - 24), 12 + rng() * (WH - 24)]);
  const cells = voronoi(out, BOUNDS);
  return out.map((s, i) => cells[i].length >= 3 ? centroid(cells[i]) : s);
}
const SEEDS = {
  radial: seedsRadial, spine: seedsSpine, grid: seedsGrid,
  archipelago: seedsArchipelago, terraced: seedsTerraced, organic: seedsOrganic,
};

// One pool of fourteen was used for every city in the galaxy, and districtCount
// tops out at fourteen, so every world had a Harbor Gate and a Cinder Rows. Two
// pools now, drawn by culture, and both are longer than the district ceiling so
// two cities of the same culture do not come out as the same list in the same
// order.
export const DISTRICT_NAMES = ['Harbor Gate', 'Manifest Row', 'Salt Quarter', 'Foundry Cut',
  'Dry Basin', 'Lantern Walk', 'The Bonded Yard', 'Nine Wharf', 'Tide Stair',
  'The Long Quay', 'Cinder Rows', 'Grave Market', 'Ashford Line', 'Kettle Row',
  'Low Bastion', 'Coldwater', 'The Weighbridge', 'Slag End', 'Tallow Street',
  'Anchor Field', 'Brine Steps', 'The Drawn Yard'];
export const DISTRICT_NAMES_JADE = ['Baochuan Slip', 'Nine Lantern Ward', 'Cinnabar Gate',
  'Silk Ledger', 'Vermilion Quay', 'Bronze Bell Row', 'The Salt Registry',
  'Lacquer Walk', 'Jade Scale Yard', 'Nine Rivers Landing', 'Pillar Court',
  'Kiln Terrace', 'The Long Tally', 'Cloud Stair', 'Iron Ox Crossing',
  'Grain Tribute Row', 'Azure Dock', 'Millstone Ward', 'Paper Lantern Cut',
  'The Weighing House', 'Red Gate Yard', 'Ash Kiln Line'];
export function districtNamePool(colonyId) {
  return isJadeColony(colonyId) ? DISTRICT_NAMES_JADE : DISTRICT_NAMES;
}
const DISTRICT_ZONES = ['commercial', 'commercial', 'residential', 'industrial',
  'industrial', 'commercial', 'industrial', 'residential', 'residential',
  'industrial', 'commercial', 'industrial', 'commercial', 'residential'];

const _geomCache = new Map();

export function cityGeometry(colonyId) {
  if (_geomCache.has(colonyId)) return _geomCache.get(colonyId);
  const vis = COLONY_VISUAL[colonyId] || { layout: 'organic', terrain: 'dust' };
  const meta = CITY_COLONIES[colonyId];
  const pop = meta ? meta.pop : 60;
  const want = districtCount(pop);
  const rng = mulberry32(seedFromId('sector:' + colonyId));
  // Deterministic per colony rotation into the name pool, so two cities of the
  // same culture do not open with the same list in the same order.
  const pool = districtNamePool(colonyId);
  const nameOff = Math.floor(mulberry32(seedFromId('names:' + colonyId))() * pool.length);
  const pts = SEEDS[vis.layout](rng, want);
  const cells = voronoi(pts, BOUNDS);
  const sectors = [];
  cells.forEach(function (cell, i) {
    if (cell.length < 3) return;
    if (Math.abs(polyArea(cell)) < 140) return;
    const poly = insetPoly(cell, vis.layout === 'archipelago' ? 0.24 : 0.13);
    const ctr = centroid(poly), bb = bboxOf(poly);
    const angR = mulberry32(seedFromId('ang:' + colonyId + ':' + i));
    const s = {
      poly, ctr, bb,
      name: pool[(i + nameOff) % pool.length],
      zone: DISTRICT_ZONES[i % DISTRICT_ZONES.length],
      zb: vis.layout === 'terraced' ? Math.max(0, (3 - Math.floor(i / 3))) * 7 : 0,
      ang: angR() * Math.PI,
      blocks: [],
    };
    // Blocks are pure render furniture: the massing inside a district. They
    // carry no ownership and no economy, so nothing about them needs to be
    // authoritative beyond looking like a city.
    const lr = mulberry32(seedFromId('blocks:' + colonyId + ':' + i));
    const ca = Math.cos(s.ang), sa = Math.sin(s.ang);
    const step = 6.4 + lr() * 1.6, sw = 1.9;
    const rad = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2 + 8;
    for (let u = -rad; u < rad; u += step + sw) {
      for (let v = -rad; v < rad; v += step + sw) {
        const lx = ctr[0] + u * ca - v * sa, ly = ctr[1] + u * sa + v * ca;
        const w = step * 0.82, d = step * 0.82;
        if (!inPoly(poly, lx, ly) || !inPoly(poly, lx + w * 0.7, ly + d * 0.7)) continue;
        if (vis.terrain === 'ice' && inWater(lx, ly)) continue;
        s.blocks.push({ x: lx, y: ly, w, d, hv: 0.6 + lr() * 0.8, tall: lr() < 0.10 });
      }
    }
    s.blocks.sort((p, q) => (p.x + p.y) - (q.x + q.y));
    if (s.blocks.length >= 4) sectors.push(s);
  });
  sectors.sort((a, b) => (a.ctr[0] + a.ctr[1]) - (b.ctr[0] + b.ctr[1]));
  const geom = { world: CITY_WORLD, layout: vis.layout, terrain: vis.terrain, sectors };
  _geomCache.set(colonyId, geom);
  return geom;
}

export function validDistrict(colonyId, idx) {
  const g = cityGeometry(colonyId);
  return Number.isInteger(idx) && idx >= 0 && idx < g.sectors.length;
}

export function geometryPayload(colonyId) {
  const g = cityGeometry(colonyId);
  const r2 = v => Math.round(v * 100) / 100;
  return {
    world: g.world, layout: g.layout, terrain: g.terrain,
    sectors: g.sectors.map(s => ({
      name: s.name, zone: s.zone, zb: s.zb, ang: r2(s.ang),
      poly: s.poly.map(p => [r2(p[0]), r2(p[1])]),
      ctr: [r2(s.ctr[0]), r2(s.ctr[1])],
      blocks: s.blocks.map(l => ({ x: r2(l.x), y: r2(l.y), w: r2(l.w), d: r2(l.d),
        hv: r2(l.hv), tall: l.tall ? 1 : 0 })),
    })),
  };
}

// ── Seeding ──────────────────────────────────────────────────────────────────

export function seedAllCityStates(seedFn) {
  for (const [id, meta] of Object.entries(CITY_COLONIES)) {
    seedFn(id, meta.pop, meta.capital);
  }
}

// Districts arrive already governed by NPC administration, with scalars that
// reflect a working city rather than a blank one.
export function seedDistrictsFor(colonyId) {
  const g = cityGeometry(colonyId);
  const rng = mulberry32(seedFromId('scalars:' + colonyId));
  g.sectors.forEach((s, i) => {
    seedDistrict(colonyId, i, s.name, s.zone, {
      crime:      Math.round(30 + rng() * 30),
      unrest:     Math.round(18 + rng() * 22),
      corruption: Math.round(30 + rng() * 25),
      prosperity: Math.round(35 + rng() * 25),
      legitimacy: Math.round(35 + rng() * 20),
      output:     Math.round(45 + rng() * 25),
    });
  });
}

// ── Economy ──────────────────────────────────────────────────────────────────

function effLever(v) { return Math.max(Number(v) || 0, CITY_TUNE.NPC_BASE); }

// Consumer spend in one district per week. Scales with the citizens it serves
// and with how developed it is, modulated by prosperity and output, so a
// mayor's governance sets the size of every tenant's market.
export function commercialPool(colonyId, d) {
  if (!d) return 0;
  const ppd = popPerDistrict(colonyId);
  const base = baselineDev(ppd);
  const dev = districtDev(colonyId, d);
  // Development grows the pie RELATIVE to what population alone supports. A
  // flat per-level bonus made investment pointless: it added storefront
  // capacity without adding customers, so building only diluted the tenants
  // already there. Scaling against baseline means a district developed well
  // beyond its natural size really is a bigger market.
  const devMult = Math.pow(Math.max(1, dev) / Math.max(1, base), CITY_TUNE.COMMERCE_DEV_POW);
  const prosperity = clamp(d.s_prosperity / 70, 0.15, 1.4);
  const output = clamp(d.s_output / 70, 0.2, 1.3);
  return ppd * 1000 * CITY_TUNE.COMMERCE_POP_K * devMult * prosperity * output;
}

export function shopCapacity(colonyId, d) {
  return Math.max(1, Math.round(districtDev(colonyId, d) * CITY_TUNE.SHOP_SLOT_PER_DEV));
}
export function shopLeaseCost(colonyId, d) {
  const dev = districtDev(colonyId, d);
  return Math.round(CITY_TUNE.SHOP_LEASE_BASE * Math.max(1, dev) * 0.5);
}
export function shopCeiling(colonyId, d) {
  return CITY_TUNE.SHOP_CEIL_WK * Math.max(1, districtDev(colonyId, d));
}

// Local production of each civic good, from districts whose mayor has
// favoured that trade. Under blockade this is all that keeps a city alive.
export function supplyOf(colonyId, blockadeLevel) {
  const st = getCityState(colonyId);
  const blk = clamp(Number(blockadeLevel) || 0, 0, 1);
  const out = {};
  if (!st) {
    for (const k of ['food', 'med', 'tech']) out[k] = { ratio: 1, prod: 0, demand: 0 };
    return out;
  }
  const demandBase = { food: 0.35, med: 0.16, tech: 0.10 };
  const prod = { food: 0, med: 0, tech: 0 };
  for (const d of getDistricts(colonyId)) {
    if (!d.favoured || !(d.favoured in prod)) continue;
    const dev = districtDev(colonyId, d);
    const outMult = clamp(d.s_output / 70, 0.05, 1.36);
    prod[d.favoured] += (dev * CITY_TUNE.SUPPLY_PER_DEV
      + worksLevel(d) * CITY_TUNE.WORKS_SUPPLY) * outMult * popPerDistrict(colonyId);
  }
  for (const k of ['food', 'med', 'tech']) {
    const demand = st.population * demandBase[k];
    const local = prod[k] || 0;
    const importCover = Math.max(0, demand - local) * (1 - blk);
    const ratio = demand > 0 ? clamp((local + importCover) / demand, 0, 1) : 1;
    out[k] = { ratio, prod: local, demand };
  }
  return out;
}

// How a district's consumer spend splits across the four trades. Appetite
// tilts toward whatever the city is short of, so a besieged planet pays its
// grocers well while everything else craters. This moves over weeks, which is
// the point: it is a trend to read, never a tick to time.
export function commercialSplit(colonyId, blockadeLevel) {
  const sup = supplyOf(colonyId, blockadeLevel || 0);
  const W = CITY_TUNE.SHOP_KIND_WEIGHT;
  const raw = {}; let sum = 0;
  for (const k of ['export', 'food', 'med', 'tech']) {
    const ratio = (k === 'export') ? 1 : (sup[k] ? sup[k].ratio : 1);
    raw[k] = W[k] * (1 + CITY_TUNE.SHOP_SCARCITY * (1 - clamp(ratio, 0, 1)));
    sum += raw[k];
  }
  const out = {};
  for (const k of Object.keys(raw)) out[k] = sum > 0 ? raw[k] / sum : 0;
  return out;
}

// Unmet civic demand for one class, signed, as a fraction of demand. Positive
// means the colony must import and its prices for that class should firm.
// Negative means its zoned districts run a surplus and it is the cheap place to
// buy. A blockade multiplies whatever is already unmet, so a self sufficient
// world shrugs a siege off and an import dependent one does not, which is the
// whole reason zoning for food is a decision.
export function civicPressure(colonyId, cls, blockadeLevel) {
  const st = getCityState(colonyId);
  if (!st) return 0;
  const demandBase = { food: 0.35, med: 0.16, tech: 0.10 };
  if (!(cls in demandBase)) return 0;
  const demand = st.population * demandBase[cls];
  if (!(demand > 0)) return 0;
  let local = 0;
  for (const d of getDistricts(colonyId)) {
    if (d.favoured !== cls) continue;
    const dev = districtDev(colonyId, d);
    const outMult = clamp(d.s_output / 70, 0.05, 1.36);
    local += (dev * CITY_TUNE.SUPPLY_PER_DEV + worksLevel(d) * CITY_TUNE.WORKS_SUPPLY)
      * outMult * popPerDistrict(colonyId);
  }
  // Stores cover the shortfall while they last, and no faster. demand and
  // local are RATES, per week. A stockpile is a QUANTITY. Adding one to the
  // other made six weeks of cover read as six weeks of production EVERY week,
  // which flipped a besieged world from maximum scarcity straight to maximum
  // surplus. What cover contributes to the rate is capped at the gap it is
  // there to fill: full stores take a besieged world to self sufficient, which
  // is what cover means, and no further.
  const held = Math.max(0, Number(stockOf(colonyId, cls)) || 0);
  local += Math.min(held, Math.max(0, demand - local));
  const raw = clamp((demand - local) / demand, -1, 1);
  const blk = clamp(Number(blockadeLevel) || 0, 0, 1);
  return raw * (1 + CITY_TUNE.COMMODITY_BLOCKADE_AMP * blk);
}
// Every district's cover for one class, summed. Held per district because a
// mayor buys for the ground they govern, spent colony wide because that is the
// scale demand is measured at.
export function stockOf(colonyId, cls) {
  const col = STOCK_COL[cls];
  if (!col) return 0;
  let t = 0;
  for (const d of getDistricts(colonyId)) t += Math.max(0, Number(d[col]) || 0);
  return t;
}
export const STOCK_COL = { food:'stock_food', med:'stock_med', tech:'stock_tech' };

// One week of the WHOLE colony's demand. This is the scale a stockpile is
// actually measured against, because the shortfall it covers is colony wide.
export function colonyWeekUnits(colonyId, cls) {
  const st = getCityState(colonyId);
  const demandBase = { food: 0.35, med: 0.16, tech: 0.10 };
  if (!st || !(cls in demandBase)) return 0;
  return st.population * demandBase[cls];
}
// A week of this district's SHARE of that. Purchases are sized and priced in
// these; cover is reported in colony weeks. Mixing the two is how the panel
// first came to claim eighty four weeks of cover for what was really six.
export function stockWeekUnits(colonyId, cls) {
  const st = getCityState(colonyId);
  const demandBase = { food: 0.35, med: 0.16, tech: 0.10 };
  if (!st || !(cls in demandBase)) return 0;
  const n = Math.max(1, getDistricts(colonyId).length);
  return (st.population * demandBase[cls]) / n;
}
export function stockCapacity(colonyId, cls) {
  return stockWeekUnits(colonyId, cls) * CITY_TUNE.STOCK_MAX_WK;
}
export function stockCost(units) {
  return Math.round(Math.max(0, units) * CITY_TUNE.STOCK_UNIT_COST);
}
// The weekly gap between what a colony needs and what its own ground grows,
// ignoring anything in store. Positive means the stores are feeding somebody.
export function shortfallUnits(colonyId, cls) {
  const st = getCityState(colonyId);
  const demandBase = { food: 0.35, med: 0.16, tech: 0.10 };
  if (!st || !(cls in demandBase)) return 0;
  const demand = st.population * demandBase[cls];
  let local = 0;
  for (const d of getDistricts(colonyId)) {
    if (d.favoured !== cls) continue;
    const dev = districtDev(colonyId, d);
    const outMult = clamp(d.s_output / 70, 0.05, 1.36);
    local += (dev * CITY_TUNE.SUPPLY_PER_DEV + worksLevel(d) * CITY_TUNE.WORKS_SUPPLY)
      * outMult * popPerDistrict(colonyId);
  }
  return Math.max(0, demand - local);
}

// Stores are eaten, and what is left spoils. Once per COLONY per tick, because
// the shortfall cover has to meet is a colony level number and drawing it down
// per district would have every district paying for the whole world's deficit.
// A colony that is not short eats nothing and only loses the spoilage, which is
// what makes laying cover in early cost something.
export function drawStock(colonyId, dtWeeks) {
  const dt = Math.max(0, Number(dtWeeks) || 0);
  if (!(dt > 0)) return;
  const ds = getDistricts(colonyId);
  if (!ds.length) return;
  const spoil = clamp(CITY_TUNE.STOCK_DECAY_WK * dt, 0, 1);

  for (const cls of Object.keys(STOCK_COL)) {
    const col = STOCK_COL[cls];
    const held = ds.reduce((a, d) => a + Math.max(0, Number(d[col]) || 0), 0);
    if (held <= 0) continue;
    const eaten = Math.max(0, Math.min(held, shortfallUnits(colonyId, cls) * dt));
    const factor = (1 - eaten / held) * (1 - spoil);
    for (const d of ds) {
      const have = Math.max(0, Number(d[col]) || 0);
      if (have <= 0) continue;
      const left = have * factor;
      updateDistrict(colonyId, d.idx, { [col]: left < 1 ? 0 : left });
    }
  }
}

// The per tick supply nudge that pressure implies. Negative supply reads as
// scarcity in commodityTargetPrice, so importing pushes the price up.
export function civicCommodityNudge(colonyId, cls, blockadeLevel) {
  return -CITY_TUNE.COMMODITY_DRAW * civicPressure(colonyId, cls, blockadeLevel);
}

// ── NPC businesses ──────────────────────────────────────────────────────────
// Target share of a district's frontage already trading before any player
// arrives. Driven by the economy of the place: a Coalition capital serving
// tens of millions runs busy, a frontier outpost mostly does not.
export function npcOccupancy(colonyId, d) {
  const T = CITY_TUNE;
  const st = getCityState(colonyId);
  const ppd = popPerDistrict(colonyId);
  const base = baselineDev(ppd);
  const dev = districtDev(colonyId, d);
  const popF = clamp(Math.log2(Math.max(1, ppd)) / 7, 0, 1);
  const devF = clamp((dev - base) / 5, 0, 1);
  const cap = (st && st.is_capital) ? 1 : 0;
  const raw = T.NPC_OCC_BASE + popF * T.NPC_OCC_POP + cap * T.NPC_OCC_CAPITAL
    + devF * T.NPC_OCC_DEV;
  // Tax flight. A district at the maximum rate supports far fewer firms than
  // one at the minimum, and the shift happens over ticks rather than instantly,
  // so a mayor who spikes the rate watches the frontage empty.
  const cut = clamp(Number(d && d.commerce_cut) || T.CUT_DEFAULT, T.CUT_MIN, T.CUT_MAX);
  const pressure = (cut - T.CUT_MIN) / Math.max(1e-6, T.CUT_MAX - T.CUT_MIN);
  return clamp(raw * (1 - pressure * T.TAX_FLIGHT), 0.03, T.NPC_OCC_MAX);
}

// Generic trading names. Deliberately plain: a bought-out business can be
// renamed, and the contrast between the stock names and the player-authored
// ones is what makes a developing quarter legible.
const NPC_NOUN = {
  export: ['Freight', 'Haulage', 'Consignment', 'Bonded Store', 'Cartage', 'Shipping Agent', 'Depot'],
  food:   ['Grocer', 'Provisions', 'Victuallers', 'Produce', 'Granary', 'Market Stall', 'Foodhall'],
  med:    ['Dispensary', 'Clinic', 'Apothecary', 'Surgery', 'Med Post', 'Infirmary'],
  tech:   ['Data Post', 'Relay Office', 'Systems', 'Repairs', 'Terminal', 'Uplink'],
};
const NPC_PREFIX = ['Old', 'New', 'Lower', 'Upper', 'North', 'South', 'Inner', 'Outer', ''];
function npcName(rng, districtName, kind) {
  const nouns = NPC_NOUN[kind] || NPC_NOUN.export;
  const noun = nouns[Math.floor(rng() * nouns.length)];
  const pre = NPC_PREFIX[Math.floor(rng() * NPC_PREFIX.length)];
  const stem = districtName || 'Colonial';
  return ((pre ? pre + ' ' : '') + stem + ' ' + noun).slice(0, 40);
}

// Each district has a NATIVE TRADE: the thing it has always mostly done. It is
// dealt from a bag proportional to the colony's demand, so a city gets a
// sensible spread (more grocers than data houses) while every district still
// has one dominant character.
//
// This exists because seeding NPC firms straight from the city-wide demand
// split made food the modal trade in all 148 districts, so every district on
// every world rendered the same colour. Character has to be per district.
const _nativeCache = new Map();
export function districtNativeTrade(colonyId, idx) {
  const key = colonyId;
  if (!_nativeCache.has(key)) {
    const ds = getDistricts(colonyId);
    const n = Math.max(1, ds.length);
    const W = CITY_TUNE.SHOP_KIND_WEIGHT;
    const bag = [];
    for (const k of ['export', 'food', 'med', 'tech']) {
      const want = Math.max(1, Math.round(W[k] * n));
      for (let i = 0; i < want; i++) bag.push(k);
    }
    // Deterministic shuffle, then deal one per district.
    const rng = mulberry32(seedFromId('native:' + colonyId));
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    const map = {};
    ds.forEach((d, i) => { map[d.idx] = bag[i % bag.length]; });
    _nativeCache.set(key, map);
  }
  const m = _nativeCache.get(key);
  return m[idx] || 'export';
}

// Tops a district up to its target NPC occupancy, counting player shops
// against the target so players displace NPC firms rather than adding to
// them. Called on boot and on the tick, so a developing district fills in.
// Firms fold and firms open. Twenty five thousand businesses that did neither
// were scenery; a district that has been run into the ground should visibly
// lose its trade, and the buyout market should have stock that was not all
// founded on the same afternoon.
//
// Deliberately small. This exists to make the place feel inhabited and to keep
// the NPC pool from being a fixed set of rows, NOT to move anyone's income.
// ensureNpcShops runs immediately after and refounds to target, so churn is a
// replacement rate rather than a drain.
export function churnNpcShops(colonyId, d, dtWeeks) {
  const shops = getDistrictShops(colonyId, d.idx).filter(isNpcShop);
  if (shops.length < 4) return 0;
  const stress = (clamp(d.s_unrest, 0, 100) / 100 * 0.6
    + clamp(d.s_crime, 0, 100) / 100 * 0.4);
  const rate = (CITY_TUNE.CHURN_BASE_WK + CITY_TUNE.CHURN_STRESS_WK * stress) * dtWeeks;
  if (!(rate > 0)) return 0;
  const expect = shops.length * rate;
  // Fractional expectation resolved by a coin flip, so a quiet district with
  // eight firms still turns one over occasionally instead of never.
  let n = Math.floor(expect);
  if (Math.random() < expect - n) n += 1;
  n = Math.min(n, Math.max(1, Math.floor(shops.length * 0.25)));
  if (n <= 0) return 0;
  // The oldest go first. A firm that has been trading since the district was
  // founded is the one with the most to lose when the district turns.
  shops.sort((a, b) => (a.leased_at || 0) - (b.leased_at || 0));
  for (let i = 0; i < n && i < shops.length; i++) deleteShop(shops[i].id);
  return n;
}

export function ensureNpcShops(colonyId, d) {
  const slots = shopCapacity(colonyId, d);
  const shops = getDistrictShops(colonyId, d.idx);
  const target = Math.round(slots * npcOccupancy(colonyId, d));
  const players = shops.filter(s => !isNpcShop(s)).length;
  const npcs = shops.length - players;
  const want = Math.max(0, Math.min(target - players, slots - shops.length + npcs));
  if (want === npcs) return 0;
  if (want < npcs) {
    // District shrank or players moved in: retire the surplus.
    const surplus = shops.filter(isNpcShop).slice(0, npcs - want);
    for (const sh of surplus) deleteShop(sh.id);
    return -(npcs - want);
  }
  const rng = mulberry32(seedFromId('npc:' + colonyId + ':' + d.idx + ':' + shops.length));
  // Weighted toward the district's native trade rather than the city's overall
  // demand, so a quarter reads as a quarter instead of every district on every
  // world coming out the same.
  const native = districtNativeTrade(colonyId, d.idx);
  const kinds = [];
  for (let i = 0; i < 13; i++) kinds.push(native);
  for (const k of ['export', 'food', 'med', 'tech']) {
    if (k === native) continue;
    for (let i = 0; i < 2; i++) kinds.push(k);
  }
  let made = 0;
  for (let i = npcs; i < want; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)] || 'export';
    const est = leaseShop(colonyId, d.idx, npcOwnerId(), kind, npcName(rng, d.name, kind), '');
    setShopEstablished(est, Date.now() - CITY_TUNE.SHOP_RAMP_WK * CITY_TUNE.WEEK_MS * 1.4);
    made++;
  }
  return made;
}

export function ensureNpcShopsFor(colonyId) {
  let n = 0;
  for (const d of getDistricts(colonyId)) n += ensureNpcShops(colonyId, d);
  return n;
}

// What a player pays to take over a going concern: the lease it sits on plus a
// multiple of what it currently earns. Priced off live income, so a business
// in a thriving district costs more than the same frontage in a dead one.
export function shopBuyoutCost(colonyId, d, weeklyNet) {
  return Math.round(shopLeaseCost(colonyId, d)
    + Math.max(0, weeklyNet) * CITY_TUNE.NPC_BUYOUT_WEEKS);
}
// The only quote anything should use. Resolves the district neutrally, finds
// the shop, and prices it. Callers cannot accidentally pass a live net.
export function quoteShopBuyout(colonyId, d, shopId, blockadeLevel) {
  const rows = resolveDistrictShops(colonyId, d, blockadeLevel || 0, { neutral: true });
  const row = rows.filter(r => r.id === shopId)[0];
  return shopBuyoutCost(colonyId, d, row ? row.net : 0);
}

// Who belongs to which faction. server.js installs this once at boot rather
// than threading a lookup through four call sites. Left unset (tests, tools)
// the Jade bonus simply never applies, which is the safe default.
let _factionOf = null;
export function setFactionResolver(fn) { _factionOf = typeof fn === 'function' ? fn : null; }

// Resolves every storefront in one district to a weekly gross. Share weight
// decays with how many shops that player already runs here, applied inside the
// pool so the pool always conserves and stacking never inflates the city.
// opts.neutral prices a district as if it were governed at the default rate
// with no zoning. Buyouts are quoted off that rather than off live income,
// because live income has two inputs the sitting mayor can move in one message
// each: the commerce rate (0.05 to 0.25) and the favoured trade (+35% / -12%).
// Dropping both before a buyout and restoring them after took 25% off the
// price of an ordinary business and 44% off one in the favoured trade, for
// free, reversibly, and only for the one player who could also see the books.
// A going concern is now worth what it earns under ordinary governance.
export function resolveDistrictShops(colonyId, d, blockadeLevel, opts) {
  const neutral = !!(opts && opts.neutral);
  const shops = getDistrictShops(colonyId, d.idx);
  if (!shops.length) return [];
  // Trade scales with how much of the frontage is actually open. Without this
  // the pool was a fixed pie and fewer firms simply took bigger slices, so
  // total gross barely moved and taxing at the maximum was always correct.
  // With it, driving firms out costs the district real commerce, which is what
  // puts an interior optimum on the commerce rate.
  const slots = Math.max(1, shopCapacity(colonyId, d));
  const activity = clamp(shops.length / slots, 0, 1);
  // Real traders bring real trade. Counted by distinct owner so that stacking
  // units does nothing: a mayor wants SEVERAL players, which is the behaviour
  // worth creating. Saturating, so the first arrival is worth the most.
  const owners = new Set();
  for (const sh of shops) if (String(sh.owner).indexOf('npc:') !== 0) owners.add(sh.owner);
  const drawMult = 1 + CITY_TUNE.PLAYER_DRAW_MAX *
    (1 - Math.exp(-owners.size / CITY_TUNE.PLAYER_DRAW_K));
  const pool = commercialPool(colonyId, d) * activity * drawMult;
  const split = commercialSplit(colonyId, blockadeLevel);
  const ceilFloor = shopCeiling(colonyId, d);
  const cut = neutral ? CITY_TUNE.CUT_DEFAULT
    : clamp(Number(d.commerce_cut) || CITY_TUNE.CUT_DEFAULT,
        CITY_TUNE.CUT_MIN, CITY_TUNE.CUT_MAX);
  const favoured = neutral ? null : d.favoured;

  const now = Date.now();
  const rampMs = CITY_TUNE.SHOP_RAMP_WK * CITY_TUNE.WEEK_MS;
  const seen = {}, rows = [];
  for (const sh of shops) {
    seen[sh.owner] = (seen[sh.owner] || 0) + 1;
    const age = sh.leased_at ? (now - sh.leased_at) : rampMs;
    const ramp = clamp(CITY_TUNE.SHOP_RAMP_FLOOR
      + (1 - CITY_TUNE.SHOP_RAMP_FLOOR) * (age / rampMs), CITY_TUNE.SHOP_RAMP_FLOOR, 1);
    rows.push({ shop: sh, rank: seen[sh.owner], ramp });
  }
  const byKind = {};
  for (const row of rows) {
    row.weight = (1 / Math.sqrt(row.rank)) * row.ramp;
    byKind[row.shop.kind] = (byKind[row.shop.kind] || 0) + row.weight;
  }
  // The per shop ceiling caps what ONE storefront can take, it must not delete
  // the trade. Clamping each share independently destroyed everything above the
  // cap: 22% of all commerce in the galaxy and 60% in a well governed capital,
  // which meant governing well made money evaporate. Overflow now spills to the
  // shops still under the cap, and only stops when every shop in that trade is
  // capped, at which point the residue is genuinely unspent consumer demand.
  const grossOf = {};
  for (const k of Object.keys(byKind)) {
    const kindPool = pool * (split[k] || 0);
    const ceiling = Math.max(ceilFloor, kindPool * CITY_TUNE.SHOP_CEIL_SHARE);
    const mine = rows.filter(r => r.shop.kind === k);
    let remaining = kindPool;
    let live = mine.slice();
    for (let pass = 0; pass < 8 && live.length && remaining > 1e-6; pass++) {
      const wSum = live.reduce((a, r) => a + r.weight, 0);
      if (wSum <= 0) break;
      let spilled = 0;
      const next = [];
      for (const r of live) {
        const want = remaining * (r.weight / wSum);
        const have = grossOf[r.shop.id] || 0;
        const room = ceiling - have;
        if (want >= room) { grossOf[r.shop.id] = ceiling; spilled += want - room; }
        else { grossOf[r.shop.id] = have + want; next.push(r); }
      }
      remaining = spilled;
      live = next;
    }
  }
  // The Jade Circuit bonus is local: it applies to Circuit members trading on
  // Circuit ground, not to anyone who once bought a shop there. That is what
  // makes it a reason to build in Jade space rather than a global buff bought
  // once with a single frontier lease.
  const jade = isJadeColony(colonyId) && !!_factionOf;
  const facCache = {};
  const isCircuit = owner => {
    if (!jade || owner.indexOf('npc:') === 0) return false;
    if (!(owner in facCache)) {
      try { facCache[owner] = _factionOf(owner) === 'jade'; } catch (_) { facCache[owner] = false; }
    }
    return facCache[owner];
  };

  const out = [];
  for (const row of rows) {
    const k = row.shop.kind;
    let gross = grossOf[row.shop.id] || 0;
    // Zoning and the Circuit bonus are both SUBSIDIES on top of the pool split,
    // not redistributions inside it, exactly as the favoured trade has always
    // been. A district can therefore pay out somewhat above its raw consumer
    // pool. That is deliberate and is the only place the city creates value.
    if (favoured) {
      gross *= (k === favoured) ? (1 + CITY_TUNE.FAVOUR_BONUS) : (1 - CITY_TUNE.FAVOUR_PENALTY);
    }
    let circuit = false;
    if (k === 'export' && isCircuit(row.shop.owner)) {
      gross *= (1 + CITY_TUNE.JADE_EXPORT_BONUS);
      circuit = true;
    }
    const tax = gross * cut;
    out.push({
      id: row.shop.id, owner: row.shop.owner, kind: k, rank: row.rank,
      name: row.shop.name, descr: row.shop.descr, ramp: row.ramp, circuit,
      gross, tax, net: gross - tax,
    });
  }
  return out;
}

// The mayor's weekly bill: services for the citizens of their district,
// scaled by how heavily they are governing.
// What the district's services actually cost, before anything is skimmed.
export function civicBillBase(colonyId, d) {
  if (!d) return 0;
  const avg = (effLever(d.lv_security) + effLever(d.lv_politics)
    + effLever(d.lv_services) + effLever(d.lv_upkeep)) / 400;
  return popPerDistrict(colonyId) * CITY_TUNE.BILL_PER_M * (0.35 + 0.65 * avg);
}
// The share of the bill that buys nothing. Zero on a clean district, rising to
// BILL_SKIM_MAX where the administration has rotted through.
export function billSkim(d) {
  const cor = clamp(Number(d && d.s_corruption) || 0, CITY_TUNE.SCALAR_MIN, CITY_TUNE.SCALAR_MAX);
  const over = Math.max(0, cor - CITY_TUNE.BILL_SKIM_FLOOR);
  const span = Math.max(1, CITY_TUNE.SCALAR_MAX - CITY_TUNE.BILL_SKIM_FLOOR);
  return CITY_TUNE.BILL_SKIM_MAX * (over / span);
}
export function civicBill(colonyId, d) {
  return civicBillBase(colonyId, d) * (1 + billSkim(d));
}
export function mayoralTake(colonyId, d, blockadeLevel) {
  return resolveDistrictShops(colonyId, d, blockadeLevel || 0)
    .reduce((a, r) => a + r.tax, 0);
}
export function mayoralNet(colonyId, d, blockadeLevel) {
  return mayoralTake(colonyId, d, blockadeLevel) - civicBill(colonyId, d);
}

// ── Simulation step ──────────────────────────────────────────────────────────
// One district, dt-scaled. The coefficient block is unchanged from the verified
// design harness: police state -> crime 10 / unrest 93 / output 39; neglect ->
// crime 92 / output 8; heavy services -> unrest 21 / output 85 / prosperity 93.

export function stepDistrict(colonyId, d, dtWeeks, blockadeLevel) {
  const T = CITY_TUNE;
  const sec = effLever(d.lv_security) / 100;
  const pol = effLever(d.lv_politics) / 100;
  const srv = effLever(d.lv_services) / 100;
  const upk = effLever(d.lv_upkeep) / 100;

  const sup = supplyOf(colonyId, blockadeLevel);
  const shortage = T.W_FOOD * (1 - sup.food.ratio)
    + T.W_MED * (1 - sup.med.ratio)
    + T.W_TECH * (1 - sup.tech.ratio);

  const cor = d.s_corruption / 100;
  const legit01 = d.s_legitimacy / 100;
  const crimeHi = clamp((d.s_crime - 50) / 45, 0, 1);
  const crimeT = clamp(98 - 102 * sec - 20 * srv + 28 * cor, T.SCALAR_MIN, T.SCALAR_MAX);
  const unrestT = clamp(58.5 + 39.7 * Math.pow(sec, 2.5) - 30 * srv - 14 * legit01
    + 20 * crimeHi + shortage, T.SCALAR_MIN, T.SCALAR_MAX);
  const corT = clamp(72 - 82 * pol - 14 * srv + 12 * sec, T.SCALAR_MIN, T.SCALAR_MAX);
  const legitT = clamp(16 + 52 * pol + 38 * srv - 0.42 * d.s_unrest, T.SCALAR_MIN, T.SCALAR_MAX);
  const prospT = clamp(20 + 76 * srv + 30 * upk - 0.34 * d.s_crime - 0.3 * d.s_unrest,
    T.SCALAR_MIN, T.SCALAR_MAX);
  const outT = clamp(60.5 + 52 * upk + 20 * srv - 0.30 * d.s_unrest - 0.42 * d.s_crime
    - 12 * cor - 0.55 * shortage, T.SCALAR_MIN, T.SCALAR_MAX);

  // Civic works. A city with monuments in it is a calmer and prouder place to
  // live. This is the only return works pay into the simulation, and it feeds
  // commerce only indirectly, through prosperity and output, so it can never
  // outrun the development curve it sits beside.
  const wl = worksLevel(d);
  const unrestW = clamp(unrestT - wl * T.WORKS_UNREST, T.SCALAR_MIN, T.SCALAR_MAX);
  const prospW  = clamp(prospT  + wl * T.WORKS_PROSPERITY, T.SCALAR_MIN, T.SCALAR_MAX);

  const k = clamp(T.RELAX * dtWeeks, 0, 1);
  const move = (cur, target) => clamp(cur + (target - cur) * k, T.SCALAR_MIN, T.SCALAR_MAX);

  const next = {
    s_crime:      move(d.s_crime, crimeT),
    s_unrest:     move(d.s_unrest, unrestW),
    s_corruption: move(d.s_corruption, corT),
    s_legitimacy: move(d.s_legitimacy, legitT),
    s_prosperity: move(d.s_prosperity, prospW),
    s_output:     move(d.s_output, outT),
    last_tick:    Date.now(),
  };
  updateDistrict(colonyId, d.idx, next);
  return { ...d, ...next };
}

// Colony population drifts toward what its districts can support, so a well
// governed planet visibly grows and a neglected one sags.
export function stepColonyPopulation(colonyId, dtWeeks) {
  const st = getCityState(colonyId);
  if (!st) return;
  const meta = CITY_COLONIES[colonyId];
  const basePop = meta ? meta.pop : st.population;
  const ds = getDistricts(colonyId);
  if (!ds.length) return;
  let devSum = 0, baseSum = 0;
  for (const d of ds) {
    devSum += districtDev(colonyId, d);
    baseSum += baselineDev(popPerDistrict(colonyId));
  }
  const lift = baseSum > 0 ? devSum / baseSum : 1;
  const prosp = ds.reduce((a, d) => a + d.s_prosperity, 0) / ds.length / 60;
  const target = basePop * clamp(lift * clamp(prosp, 0.55, 1.25), 0.5, 2.4);
  const k = clamp(0.012 * dtWeeks, 0, 1);
  const newPop = st.population + (target - st.population) * k;
  updateCityState(colonyId, {
    population: newPop,
    city_class: classifyCity(newPop, colonyInvested(colonyId)),
    last_tick: Date.now(),
  });
}

export function classifyCity(populationM, invested) {
  if (populationM >= 700 || invested >= 100_000_000_000) return 'metropolis';
  if (populationM >= 350 || invested >= 20_000_000_000) return 'city';
  if (populationM >= 120 || invested >= 3_000_000_000) return 'town';
  return 'outpost';
}

// ── Payouts ──────────────────────────────────────────────────────────────────

// Tenants keep their net; the mayor takes their cut and pays the civic bill.
// A mayor who cannot pay accrues arrears; sustained arrears vacate the seat
// and the district reverts to NPC administration rather than to rubble.
// How far the world may advance on this tick, given when it last advanced.
//
// Pure so it can be tested without a database or a clock. Returns the slice to
// apply and the timestamp the clock should be moved to, which is NOT always
// `now`: after an outage the backlog is settled a bounded slice per tick and
// the remainder is carried, so a week of downtime catches up over the next few
// ticks instead of dumping a week of income into one payout.
//
//   skip      nothing happened worth settling, leave the clock alone
//   reset     the clock is in the future (system time moved back, or a restore
//             from an older database). Do not pay anything, just resync.
export function cityTickAdvance(lastTick, now, tickMs) {
  const T = CITY_TUNE;
  const last = Number(lastTick) || 0;
  const n = Number(now) || 0;
  if (!last) return { skip: false, reset: true, dtWeeks: 0, applyTo: n, elapsedMs: 0 };
  const elapsed = n - last;
  if (elapsed < 0) return { skip: false, reset: true, dtWeeks: 0, applyTo: n, elapsedMs: elapsed };
  if (elapsed < Math.min(T.TICK_MIN_MS, Math.max(1, Number(tickMs) || 0)))
    return { skip: true, reset: false, dtWeeks: 0, applyTo: last, elapsedMs: elapsed };
  const slice = Math.min(elapsed, T.TICK_CATCHUP_MAX_MS);
  return { skip: false, reset: false, dtWeeks: slice / T.WEEK_MS,
           applyTo: last + slice, elapsedMs: elapsed, capped: slice < elapsed };
}

export function creditCityIncome(getPlayer, safeAddCash, savePlayer, dtWeeks, blockadeOf, onLapse) {
  let toTenants = 0, toMayors = 0;
  const lapsed = [];
  const tx = beginBatch();
  try {
    for (const st of getAllCityStates()) {
      const colonyId = st.colony_id;
      if (st.locked_faction) continue;   // an occupied city trades with nobody
      const blk = blockadeOf ? blockadeOf(colonyId) : 0;
      const perPlayer = {};
      for (const d of getDistricts(colonyId)) {
        const rows = resolveDistrictShops(colonyId, d, blk);
        let tax = 0;
        for (const r of rows) {
          const net = r.net * dtWeeks;
          // NPC firms keep their own takings and are never written to. Paying
          // them was costing one UPDATE per shop per tick, which at seventeen
          // thousand established businesses blocked the process for fourteen
          // seconds an hour. Only their tax reaches the mayor.
          if (net > 0 && r.owner.indexOf('npc:') !== 0) {
            perPlayer[r.owner] = (perPlayer[r.owner] || 0) + net;
            addShopPaid(r.id, net);
            toTenants += net;
          }
          tax += r.tax * dtWeeks;
        }
        if (!d.mayor) continue;
        const bill = civicBill(colonyId, d) * dtWeeks;
        const net = tax - bill;
        if (net >= 0) {
          // Arrears come out of the surplus BEFORE the mayor is paid. Paying
          // the full net and reducing the debt by the same net cleared the
          // books for free, so running a district into debt and then governing
          // it well for one week wiped the whole balance at no cost.
          const owedNow = Math.max(0, d.arrears || 0);
          const repay = Math.min(owedNow, net);
          const keep = net - repay;
          if (keep > 0) { perPlayer[d.mayor] = (perPlayer[d.mayor] || 0) + keep; toMayors += keep; }
          if (repay > 0) updateDistrict(colonyId, d.idx, { arrears: owedNow - repay });
          continue;
        }
        // Shortfall: take what the mayor has, bank the rest as arrears.
        const p = getPlayer(d.mayor);
        const have = p ? Math.max(0, Number(p.cash) || 0) : 0;
        const owed = -net;
        const take = Math.min(have, owed);
        if (take > 0) { safeAddCash(p, -take); savePlayer(p); }
        const arrears = (d.arrears || 0) + (owed - take);
        const weekly = Math.max(1, civicBill(colonyId, d));
        if (arrears > weekly * CITY_TUNE.ARREARS_LAPSE_WK) {
          vacateDistrict(colonyId, d.idx);
          lapsed.push({ colonyId, idx: d.idx, mayor: d.mayor, name: d.name });
        } else {
          updateDistrict(colonyId, d.idx, { arrears });
        }
      }
      for (const [pid, amt] of Object.entries(perPlayer)) {
        const p = getPlayer(pid);
        if (!p) continue;
        safeAddCash(p, amt); savePlayer(p);
      }
    }
    endBatch(tx, true);
  } catch (e) { endBatch(tx, false); console.error('[City] income error:', e); }
  if (lapsed.length && typeof onLapse === 'function') { try { onLapse(lapsed); } catch(_) {} }
  return { tenants: toTenants, mayors: toMayors, lapsed };
}

// ── War ──────────────────────────────────────────────────────────────────────

// The war book: what it costs to take this ground. server.js prices every
// point of faction control at WAR_FUND_BASE_PER_PCT + warRate(cityBook), so
// anything added here raises the price of conquest directly.
//
// Works count. Salvage does NOT read this: stripYield and maybeStripOccupied
// both work off colonyInvested, so an occupier dismantles development and
// leaves the monuments standing. Dear to take, worth nothing to loot.
export function cityBook(colonyId) {
  return colonyInvested(colonyId) + colonyWorks(colonyId) * CITY_TUNE.WORKS_WAR_WEIGHT;
}
export function cityWorksBook(colonyId) { return colonyWorks(colonyId); }
export function warRate(book) {
  if (!book || book <= 0) return 0;
  return CITY_TUNE.WAR_RATE_K * Math.pow(Math.max(1, book), CITY_TUNE.WAR_RATE_POW);
}
export function warTriggerCost(book) {
  return warRate(book) * CITY_TUNE.WAR_TRIGGER_PTS;
}
export function warFundTrigger(colonyId) {
  const ds = getDistricts(colonyId);
  if (!ds.length) return 0;
  const avg = ds.reduce((a, d) => a + d.s_unrest, 0) / ds.length;
  return avg > 70 ? 1 : 0;
}

// Conquest removes every mayor and closes every storefront. The districts
// themselves survive under occupation, so a liberated city has something left
// to govern rather than a field of rubble.
export function onColonyCaptured(colonyId, newFaction) {
  try {
    const st = ensureCityState(colonyId);
    if (!st) return;
    vacateColonySeats(colonyId);
    clearColonyShops(colonyId);
    updateCityState(colonyId, {
      locked_faction: newFaction,
      strip_unlock:  Date.now() + CITY_TUNE.STRIP_HOLD_MS,
      last_strip:    0,
    });
    console.log(`[City] ${colonyId} seized by ${newFaction}, every seat vacated, salvage unlocks in 7d`);
  } catch (e) { console.error('[City] capture error:', e); }
}

export function onColonyReverted(colonyId) {
  try {
    const st = getCityState(colonyId);
    if (!st || !st.locked_faction) return;
    updateCityState(colonyId, { locked_faction: null, strip_unlock: 0, last_strip: 0 });
    console.log(`[City] ${colonyId} liberated, seats reopen`);
  } catch (e) { console.error('[City] revert error:', e); }
}

export function canStrip(colonyId) {
  const st = getCityState(colonyId);
  if (!st || !st.strip_unlock) return false;
  return Date.now() >= st.strip_unlock;
}
export function stripYield(colonyId) {
  return colonyInvested(colonyId) * CITY_TUNE.STRIP_RATE;
}

// Occupation salvage: mayoral development is dismantled a slice at a time and
// a fraction flows to the war chest. Baseline development is NOT strippable,
// because the citizens do not evaporate; only what players built comes down.
export function maybeStripOccupied(colonyId) {
  const st = getCityState(colonyId);
  if (!st || !st.locked_faction) return 0;
  if (!canStrip(colonyId)) return 0;
  const now = Date.now();
  if (st.last_strip && now - st.last_strip < CITY_TUNE.STRIP_EVERY_MS) return 0;
  let removed = 0;
  for (const d of getDistricts(colonyId)) {
    if (!(d.invested > 0)) continue;
    const have = devFromInvested(d.invested);
    const slice = d.invested - devCost(Math.max(0, Math.floor(have) - 1));
    const take = Math.max(0, Math.min(d.invested, slice));
    removed += take;
    updateDistrict(colonyId, d.idx, { invested: Math.max(0, d.invested - take) });
    clearDistrictShops(colonyId, d.idx);
  }
  updateCityState(colonyId, { last_strip: now });
  if (colonyInvested(colonyId) <= 0) {
    updateCityState(colonyId, { locked_faction: null, strip_unlock: 0, last_strip: 0 });
    console.log(`[City] ${colonyId} stripped back to its population baseline, seats reopen`);
  }
  return removed * CITY_TUNE.STRIP_RATE;
}

// ── Summaries ────────────────────────────────────────────────────────────────

export function districtSummary(colonyId, d, blockadeLevel) {
  const dev = districtDev(colonyId, d);
  return {
    idx: d.idx,
    name: d.name,
    zone: d.zone,
    mayor: d.mayor || null,
    dev: Math.round(dev * 100) / 100,
    baseline: baselineDev(popPerDistrict(colonyId)),
    invested: Math.round(d.invested),
    works: Math.round(d.works || 0),
    worksLv: Math.round(worksLevel(d) * 100) / 100,
    nextWorks: Math.round(nextWorksCost(d.works || 0)),
    seat: seatPrice(colonyId, d),
    compensation: seatCompensation(colonyId, d),
    takeable: seatTakeable(d),
    cut: clamp(Number(d.commerce_cut) || CITY_TUNE.CUT_DEFAULT, CITY_TUNE.CUT_MIN, CITY_TUNE.CUT_MAX),
    favoured: d.favoured || null,
    arrears: Math.round(d.arrears || 0),
    pop: Math.round(popPerDistrict(colonyId) * 10) / 10,
    pool: Math.round(commercialPool(colonyId, d)),
    slots: shopCapacity(colonyId, d),
    shops: countDistrictShops(colonyId, d.idx),
    lease: shopLeaseCost(colonyId, d),
    bill: Math.round(civicBill(colonyId, d)),
    billBase: Math.round(civicBillBase(colonyId, d)),
    skim: Math.round(billSkim(d) * 1000) / 1000,
    stock: { food: Math.round(d.stock_food || 0), med: Math.round(d.stock_med || 0),
             tech: Math.round(d.stock_tech || 0) },
    take: Math.round(mayoralTake(colonyId, d, blockadeLevel || 0)),
    levers: { security: d.lv_security, politics: d.lv_politics, services: d.lv_services,
              upkeep: d.lv_upkeep },
    scalars: { crime: Math.round(d.s_crime), unrest: Math.round(d.s_unrest),
               corruption: Math.round(d.s_corruption), prosperity: Math.round(d.s_prosperity),
               legitimacy: Math.round(d.s_legitimacy), output: Math.round(d.s_output) },
  };
}

export function citySummary(colonyId, blockadeLevel) {
  const st = getCityState(colonyId);
  if (!st) return null;
  const ds = getDistricts(colonyId);
  const sup = supplyOf(colonyId, blockadeLevel || 0);
  const vis = COLONY_VISUAL[colonyId] || { layout: 'organic', terrain: 'dust' };
  const avg = k => ds.length ? Math.round(ds.reduce((a, d) => a + d[k], 0) / ds.length) : 0;
  const book = colonyInvested(colonyId);
  return {
    colonyId,
    layout: vis.layout,
    terrain: vis.terrain,
    cls: st.city_class,
    pop: Math.round(st.population),
    districts: ds.length,
    mayors: ds.filter(d => d.mayor).length,
    book: Math.round(book),
    works: Math.round(colonyWorks(colonyId)),
    jade: isJadeColony(colonyId) ? 1 : 0,
    shops: getCityShops(colonyId).length,
    unrest: avg('s_unrest'),
    crime: avg('s_crime'),
    output: avg('s_output'),
    prosperity: avg('s_prosperity'),
    food: Math.round(sup.food.ratio * 100),
    med: Math.round(sup.med.ratio * 100),
    tech: Math.round(sup.tech.ratio * 100),
    blockade: clamp(Number(blockadeLevel) || 0, 0, 1),
    locked: st.locked_faction || null,
    stripAt: st.strip_unlock || 0,
  };
}
