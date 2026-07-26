// city-check
//
// Boots the real city persistence layer against an in-memory database and
// drives the real economy functions. No mocks of the things under test: the
// tables, the queries, the pool resolution and the settlement are the ones
// that ship.
//
// What it is guarding, in the order the faults were found:
//   1. dtWeeks was a constant derived from the configured tick interval, and
//      the tick also ran unconditionally at module load, so every deploy paid
//      a full hour of city income to the whole galaxy and every real outage
//      paid one hour no matter how long it lasted.
//   2. NPC buyouts were quoted off live income, and two of live income's
//      inputs are levers the sitting mayor moves in one message each.
//   3. The dispatcher had no rate limit of any kind.
//
// Requires the sqlite flag:
//   node --experimental-sqlite tools/city-check.mjs      (from the repo root)
import { DatabaseSync } from 'node:sqlite';
import {
  initCityDb, seedColonyMeta, ensureCityState, seedDistrict, getDistrict,
  getDistricts, updateDistrict, leaseShop, getDistrictShops, setShopEstablished,
  npcOwnerId, getCityKV, setCityKV, getShop, getCityState, isNpcShop,
  pushCityHistory, getCityHistory, getColonyHistory,
  lastPetition, recordPetition, setCharterOwner,
} from '../server/db_city.js';
import {
  CITY_TUNE, cityTickAdvance, resolveDistrictShops, shopBuyoutCost,
  quoteShopBuyout, creditCityIncome, civicBill, commercialPool,
  seatPrice, seatCompensation, seatLegitimacyMult, civicPressure,
  civicCommodityNudge, civicBillBase, billSkim, stockOf, stockWeekUnits,
  stockCapacity, stockCost, drawStock, shortfallUnits, colonyWeekUnits,
  churnNpcShops, ensureNpcShops,
} from '../server/city.js';
import { newBuckets, checkRate, RL, HEAVY_TYPES } from '../server/ratelimit.js';

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; failures.push(n + (d ? '  [' + d + ']' : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);

const db = new DatabaseSync(':memory:');
initCityDb(db);

const COL = 'new_anchor';
seedColonyMeta(COL, 12400, 1);
ensureCityState(COL);
// popPerDistrict divides the population by districtCount(pop), NOT by how many
// rows exist, so a fixture with fewer districts than the colony implies makes
// every per-district supply figure wrong. Seed the real count.
import { districtCount } from '../server/city.js';
const NDIST = districtCount(12400);
for (let i = 0; i < NDIST; i++) {
  seedDistrict(COL, i, 'District ' + i, 'commercial', {
    crime: 40, unrest: 20, corruption: 30, prosperity: 50, legitimacy: 50, output: 60,
  });
}
console.log('  fixture: ' + NDIST + ' districts on a ' + 12400 + 'M colony');

// ── 1. The tick clock ────────────────────────────────────────────────────────
console.log('== The tick advances by elapsed time, not by the interval ==');
{
  const HOUR = 3600_000, WEEK = CITY_TUNE.WEEK_MS;

  const fresh = cityTickAdvance(0, 1_000_000, HOUR);
  ok('a database with no clock resyncs and pays nothing',
     fresh.reset === true && fresh.dtWeeks === 0);

  const back = cityTickAdvance(2_000_000, 1_000_000, HOUR);
  ok('a clock in the future resyncs and pays nothing',
     back.reset === true && back.dtWeeks === 0, 'dt ' + back.dtWeeks);

  // The whole point. A restart seconds after the last tick used to pay a full
  // interval; it must now pay nothing at all.
  const restart = cityTickAdvance(1_000_000, 1_000_000 + 5_000, HOUR);
  ok('a restart five seconds after a tick settles nothing',
     restart.skip === true && restart.dtWeeks === 0, 'dt ' + restart.dtWeeks);

  const hour = cityTickAdvance(1_000_000, 1_000_000 + HOUR, HOUR);
  ok('an hour of elapsed time settles an hour',
     near(hour.dtWeeks, HOUR / WEEK, 1e-12), String(hour.dtWeeks));

  const half = cityTickAdvance(1_000_000, 1_000_000 + HOUR / 2, HOUR);
  ok('half an hour settles half an hour, not a whole one',
     near(half.dtWeeks, (HOUR / 2) / WEEK, 1e-12), String(half.dtWeeks));

  // Outage. The backlog is bounded per tick and the remainder is carried, so a
  // long outage catches up over several ticks instead of one giant payout.
  const outage = cityTickAdvance(1_000_000, 1_000_000 + 72 * HOUR, HOUR);
  ok('a long outage is capped at the catch-up ceiling',
     near(outage.dtWeeks, CITY_TUNE.TICK_CATCHUP_MAX_MS / WEEK, 1e-12), String(outage.dtWeeks));
  ok('and reports that it capped', outage.capped === true);
  ok('and carries the remainder rather than discarding it',
     outage.applyTo === 1_000_000 + CITY_TUNE.TICK_CATCHUP_MAX_MS,
     String(outage.applyTo - 1_000_000));

  // Walking the carry forward to exhaustion must land exactly on `now` and
  // never overshoot it, or the clock drifts into the future and every later
  // tick resyncs and pays nothing.
  let clock = 1_000_000; const target = 1_000_000 + 100 * HOUR; let steps = 0, paid = 0;
  for (; steps < 50; steps++) {
    const a = cityTickAdvance(clock, target, HOUR);
    if (a.skip || a.reset) break;
    paid += a.dtWeeks; clock = a.applyTo;
  }
  ok('the carry forward converges on the real elapsed time',
     near(paid, (100 * HOUR) / WEEK, 1e-9) && clock === target,
     'paid ' + paid.toFixed(6) + ' over ' + steps + ' ticks, clock off by ' + (target - clock));

  setCityKV('tick_at', 12345);
  ok('the clock round-trips through the kv table', Number(getCityKV('tick_at')) === 12345);
}

// ── 2. Buyouts cannot be marked down by the mayor ────────────────────────────
console.log('\n== A buyout is quoted off neutral governance ==');
{
  const d0 = getDistrict(COL, 0);
  const est = Date.now() - CITY_TUNE.SHOP_RAMP_WK * CITY_TUNE.WEEK_MS * 1.4;
  const ids = [];
  for (const kind of ['food', 'food', 'food', 'export', 'export', 'tech']) {
    const id = leaseShop(COL, 0, npcOwnerId(), kind, 'Test ' + kind + ids.length, '');
    setShopEstablished(id, est);
    ids.push(id);
  }
  const target = ids[0];   // a 'food' shop
  ok('the district has shops to price', getDistrictShops(COL, 0).length === 6);

  const quoteNow = () => quoteShopBuyout(COL, getDistrict(COL, 0), target, 0);
  const liveNet = () => {
    const r = resolveDistrictShops(COL, getDistrict(COL, 0), 0).filter(x => x.id === target)[0];
    return r ? r.net : 0;
  };

  // Ordinary governance: default rate, food favoured.
  updateDistrict(COL, 0, { commerce_cut: CITY_TUNE.CUT_DEFAULT, favoured: 'food' });
  const baseQuote = quoteNow(), baseLive = liveNet();

  // The manipulation: maximum rate, favour something else. Two messages, both
  // reversible, both mayor-only.
  updateDistrict(COL, 0, { commerce_cut: CITY_TUNE.CUT_MAX, favoured: 'tech' });
  const badQuote = quoteNow(), badLive = liveNet();

  ok('the manipulation really does move live income',
     badLive < baseLive * 0.75,
     'live ' + Math.round(baseLive) + ' -> ' + Math.round(badLive));
  ok('and the quote does not move at all',
     baseQuote === badQuote, baseQuote + ' vs ' + badQuote);

  // And the other direction: a mayor cannot inflate a rival's entry price
  // either, which is the same lever pointed the other way.
  updateDistrict(COL, 0, { commerce_cut: CITY_TUNE.CUT_MIN, favoured: 'food' });
  ok('nor can it be inflated', quoteNow() === baseQuote, quoteNow() + ' vs ' + baseQuote);

  // The old pricing, reproduced here, is what the guard is measured against.
  // Two baselines, because the saving depends on how the district was being
  // run before the mayor reached for the levers.
  const lease = shopBuyoutCost(COL, getDistrict(COL, 0), 0);
  const priced = () => shopBuyoutCost(COL, getDistrict(COL, 0), liveNet()) - lease;

  updateDistrict(COL, 0, { commerce_cut: CITY_TUNE.CUT_DEFAULT, favoured: null });
  const oldPlain = priced();
  updateDistrict(COL, 0, { commerce_cut: CITY_TUNE.CUT_DEFAULT, favoured: 'food' });
  const oldFavoured = priced();
  updateDistrict(COL, 0, { commerce_cut: CITY_TUNE.CUT_MAX, favoured: 'tech' });
  const oldManipulated = priced();

  const dPlain = 1 - oldManipulated / oldPlain;
  const dFav = 1 - oldManipulated / oldFavoured;
  console.log('  old pricing, unfavoured district: ' + (dPlain * 100).toFixed(1) + '% off');
  console.log('  old pricing, favoured district:   ' + (dFav * 100).toFixed(1) + '% off');
  ok('the old pricing allowed a material discount on an ordinary district',
     dPlain > 0.2, (dPlain * 100).toFixed(1) + '%');
  ok('and a bigger one where the trade was favoured',
     dFav > dPlain + 0.1, (dFav * 100).toFixed(1) + '%');

  updateDistrict(COL, 0, { commerce_cut: CITY_TUNE.CUT_DEFAULT, favoured: null });
}

// ── 3. Settlement scales with the slice it is given ──────────────────────────
console.log('\n== Income scales with the time settled ==');
{
  const players = { p1: { id: 'p1', cash: 0 } };
  const getP = id => players[id] || null;
  const addCash = (p, amt) => { if (p) p.cash = (p.cash || 0) + amt; };
  const save = () => {};

  updateDistrict(COL, 0, { mayor: 'p1', arrears: 0, took_office: Date.now() });
  const shops = getDistrictShops(COL, 0);
  // Hand two shops to the player so there is tenant income as well as tax.
  db.prepare('UPDATE city_shops SET owner=? WHERE id=?').run('p1', shops[0].id);
  db.prepare('UPDATE city_shops SET owner=? WHERE id=?').run('p1', shops[1].id);

  const HOUR = 3600_000;
  players.p1.cash = 0;
  creditCityIncome(getP, addCash, save, HOUR / CITY_TUNE.WEEK_MS, () => 0, null);
  const oneHour = players.p1.cash;

  players.p1.cash = 0;
  creditCityIncome(getP, addCash, save, (2 * HOUR) / CITY_TUNE.WEEK_MS, () => 0, null);
  const twoHours = players.p1.cash;

  ok('settling twice the time pays twice the money',
     near(twoHours, oneHour * 2, Math.abs(oneHour) * 1e-9 + 1e-6),
     oneHour.toFixed(2) + ' vs ' + twoHours.toFixed(2));

  players.p1.cash = 0;
  creditCityIncome(getP, addCash, save, 0, () => 0, null);
  ok('and settling no time pays nothing', near(players.p1.cash, 0),
     String(players.p1.cash));
  console.log('  one hour of this district: F' + Math.round(oneHour).toLocaleString());
}

// ── 4. Schema hardening ──────────────────────────────────────────────────────
console.log('\n== updateDistrict will not write a column it does not know ==');
{
  const before = getDistrict(COL, 0).name;
  updateDistrict(COL, 0, { name: 'Renamed', 'arrears=0, mayor': 'x' });
  const after = getDistrict(COL, 0);
  ok('a known column is written', after.name === 'Renamed', after.name);
  ok('and an unknown key is dropped instead of concatenated into the SET',
     after.mayor === 'p1', String(after.mayor));
  ok('cut_at and fav_at exist on the districts table',
     'cut_at' in after && 'fav_at' in after, Object.keys(after).join(','));
}

// ── 5. Rate limiting ─────────────────────────────────────────────────────────
console.log('\n== The dispatcher has a budget ==');
{
  const t0 = 1_000_000;
  const s = newBuckets(t0);
  let allowed = 0;
  for (let i = 0; i < 500; i++) if (checkRate(s, 'chat', t0).ok) allowed++;
  ok('a burst of ordinary messages is capped at the burst ceiling',
     allowed === RL.BURST, allowed + ' of 500');

  const s2 = newBuckets(t0);
  let heavy = 0;
  for (let i = 0; i < 500; i++) if (checkRate(s2, 'city_data_request', t0).ok) heavy++;
  ok('and the expensive handlers are capped far lower',
     heavy === RL.HEAVY_BURST, heavy + ' of 500');

  // A heavy message must also spend a global token, or the two buckets can be
  // farmed independently.
  const s3 = newBuckets(t0);
  for (let i = 0; i < RL.HEAVY_BURST; i++) checkRate(s3, 'city_data_request', t0);
  ok('heavy messages also spend from the global bucket',
     s3.g.t <= RL.BURST - RL.HEAVY_BURST + 1e-9, String(s3.g.t));

  const s4 = newBuckets(t0);
  for (let i = 0; i < 500; i++) checkRate(s4, 'city_data_request', t0);
  ok('the bucket refills over time',
     checkRate(s4, 'city_data_request', t0 + 5000).ok === true);

  const s5 = newBuckets(t0);
  let pings = 0;
  for (let i = 0; i < 500; i++) if (checkRate(s5, 'ping', t0).ok) pings++;
  ok('keepalives are never throttled', pings === 500, String(pings));

  const s6 = newBuckets(t0);
  for (let i = 0; i < 500; i++) checkRate(s6, 'chat', t0);
  let notices = 0;
  for (let i = 0; i < 100; i++) if (checkRate(s6, 'chat', t0).notify) notices++;
  ok('a client stuck in a loop is told once, not flooded', notices === 0, String(notices));
  // After the window the bucket has also refilled, so drain it again before
  // asking: the notice only fires on a message that is actually refused.
  const t7 = t0 + RL.NOTICE_MS + 1;
  let later = 0;
  for (let i = 0; i < 500; i++) if (checkRate(s6, 'chat', t7).notify) later++;
  ok('and told exactly once more after the notice window', later === 1, String(later));

  ok('every city mutation is on the heavy list',
     ['city_buy_seat','city_invest','city_works','city_lease_shop','city_buy_shop',
      'city_set_cut','city_set_favoured','city_set_levers','city_rename_district',
      'city_rename_shop','city_close_shop'].every(t => HEAVY_TYPES.has(t)));
}

// ── 6. Real traders bring real trade ─────────────────────────────────────────
console.log('\n== A district is worth more when several different players trade in it ==');
{
  const d = () => getDistrict(COL, 1);
  const est = Date.now() - CITY_TUNE.SHOP_RAMP_WK * CITY_TUNE.WEEK_MS * 1.4;
  const add = owner => { const id = leaseShop(COL, 1, owner, 'food', 'S' + Math.random(), ''); setShopEstablished(id, est); return id; };
  const total = () => resolveDistrictShops(COL, d(), 0).reduce((a, r) => a + r.gross, 0);

  for (let i = 0; i < 8; i++) add(npcOwnerId());
  const npcOnly = total();

  // One player with four units.
  const stacked = [];
  for (let i = 0; i < 4; i++) stacked.push(add('whale'));
  const oneOwner = total();

  // Same four units, four different owners.
  stacked.forEach((id, i) => db.prepare('UPDATE city_shops SET owner=? WHERE id=?').run('p' + i, id));
  const fourOwners = total();

  ok('players trading in a district grow its market', oneOwner > npcOnly,
     Math.round(npcOnly) + ' -> ' + Math.round(oneOwner));
  ok('and four separate traders are worth more than one holding four units',
     fourOwners > oneOwner * 1.05,
     Math.round(oneOwner) + ' -> ' + Math.round(fourOwners));
  console.log('  draw: NPC only ' + Math.round(npcOnly) +
              ', one owner x4 ' + Math.round(oneOwner) +
              ', four owners ' + Math.round(fourOwners));

  // The bonus has to stop, or a district full of players outruns everything.
  // Measured at a FIXED shop count, reassigning owners, because adding shops
  // also moves activity and the raw pool and would flatter the result.
  const ids = getDistrictShops(COL, 1).map(sh => sh.id);
  const setOwners = fn => ids.forEach((id, i) =>
    db.prepare('UPDATE city_shops SET owner=? WHERE id=?').run(fn(i), id));
  setOwners(() => npcOwnerId());
  const allNpc = total();
  setOwners(i => 'z' + i);
  const allPlayers = total();
  const mult = allPlayers / allNpc;
  console.log('  draw ceiling at ' + ids.length + ' distinct owners: ' + mult.toFixed(3) + 'x');
  ok('the bonus saturates rather than scaling forever',
     mult <= 1 + CITY_TUNE.PLAYER_DRAW_MAX + 1e-6, mult.toFixed(3) + 'x');
  ok('and it is actually worth something', mult > 1.2, mult.toFixed(3) + 'x');
  setOwners(() => npcOwnerId());
}

// ── 7. Legitimacy prices the seat ────────────────────────────────────────────
console.log('\n== A district that has turned on its mayor is cheap to take ==');
{
  const d0 = () => getDistrict(COL, 0);
  updateDistrict(COL, 0, { invested: 40_000_000, s_legitimacy: 50 });
  const mid = seatPrice(COL, d0());
  updateDistrict(COL, 0, { s_legitimacy: 95 });
  const hi = seatPrice(COL, d0());
  updateDistrict(COL, 0, { s_legitimacy: 5 });
  const lo = seatPrice(COL, d0());

  ok('a well governed seat costs more than a middling one', hi > mid, hi + ' vs ' + mid);
  ok('and a despised one costs less', lo < mid, lo + ' vs ' + mid);
  ok('the multiplier is symmetric about the midpoint',
     near(seatLegitimacyMult({ s_legitimacy: 50 }), 1, 1e-9));

  // The property that stops seat trading printing money: whatever legitimacy
  // does to the price, an ousted mayor can never recover more than they spent.
  for (const L of [5, 25, 50, 75, 95]) {
    updateDistrict(COL, 0, { s_legitimacy: L });
    const dd = d0();
    if (seatCompensation(COL, dd) > (dd.invested || 0)) {
      ok('compensation never exceeds what was invested, at legitimacy ' + L, false);
    }
  }
  ok('compensation never exceeds what was invested, at any legitimacy', true);
  updateDistrict(COL, 0, { s_legitimacy: 50, invested: 0 });
}

// ── 8. Civic demand reaches the commodity grid ───────────────────────────────
console.log('\n== The city eats, and the commodity board can see it ==');
{
  for (const d of getDistricts(COL)) updateDistrict(COL, d.idx, { favoured: null });
  const hungry = civicPressure(COL, 'food', 0);
  ok('a world that grows nothing imports its food', hungry > 0.9, hungry.toFixed(3));

  // Zone enough districts and the world feeds itself, then exports. How many
  // is the actual design question, so print it.
  let breakEven = 0;
  for (let n = 0; n <= NDIST; n++) {
    getDistricts(COL).forEach((d, i) => updateDistrict(COL, d.idx, { favoured: i < n ? 'food' : null }));
    if (civicPressure(COL, 'food', 0) <= 0) { breakEven = n; break; }
  }
  console.log('  districts that must zone for food before the world feeds itself: '
              + breakEven + ' of ' + NDIST);
  ok('self sufficiency is reachable but costs most of the map',
     breakEven > 1 && breakEven < NDIST, String(breakEven));
  for (const d of getDistricts(COL)) updateDistrict(COL, d.idx, { favoured: 'food' });
  const fed = civicPressure(COL, 'food', 0);
  ok('and a world that zones for it runs a surplus instead', fed < 0, fed.toFixed(3));
  ok('the sign of the nudge follows: importing firms prices, exporting softens them',
     civicCommodityNudge(COL, 'food', 0) > 0 && (() => {
       for (const d of getDistricts(COL)) updateDistrict(COL, d.idx, { favoured: null });
       return civicCommodityNudge(COL, 'food', 0) < 0;
     })());

  // Blockade amplifies what is already unmet, so a self sufficient world
  // shrugs a siege off. That asymmetry is the reason zoning is a decision.
  const openPress = civicPressure(COL, 'food', 0);
  const siegePress = civicPressure(COL, 'food', 1);
  ok('a siege bites a world that imports', siegePress > openPress, siegePress.toFixed(2));

  for (const d of getDistricts(COL)) updateDistrict(COL, d.idx, { favoured: 'food' });
  const fedSiege = civicPressure(COL, 'food', 1);
  // A world that feeds itself is not starved by a siege. It cannot ship the
  // surplus out either, so it gluts and its own prices soften. Both halves of
  // that are the intended reading of a negative pressure under blockade.
  ok('a world that feeds itself is never starved by a siege', fedSiege <= 0, fedSiege.toFixed(2));
  console.log('  zoning for food turns a ' + siegePress.toFixed(2) +
              ' siege pressure into ' + fedSiege.toFixed(2));

  // Steady state supply is nudge/decay. The sim showed the map goes flat once
  // this reaches the +/-0.4 clamp, so peacetime has to stay well inside it.
  for (const d of getDistricts(COL)) updateDistrict(COL, d.idx, { favoured: null });
  const ss = Math.abs(civicCommodityNudge(COL, 'food', 0)) / 0.04;
  console.log('  worst case peacetime steady-state supply: ' + ss.toFixed(3) + ' (clamp 0.400)');
  ok('peacetime pressure stays clear of the supply clamp', ss < 0.30, ss.toFixed(3));
  // A siege IS allowed to pin the clamp. That is the one time the map is
  // supposed to go extreme, and it is the difference between a blockade being
  // a panel readout and a blockade being a thing traders fly toward.
  const siegeSs = Math.abs(civicCommodityNudge(COL, 'food', 1)) / 0.04;
  console.log('  besieged steady-state supply: ' + siegeSs.toFixed(3) + ' (clamps, deliberately)');
  ok('a siege is allowed to reach the clamp', siegeSs > 0.4, siegeSs.toFixed(3));
  ok('tech and med are wired too',
     civicPressure(COL, 'med', 0) > 0 && civicPressure(COL, 'tech', 0) > 0);
  ok('a class the city does not consume is inert', civicPressure(COL, 'export', 0) === 0);
}

// ── 9. Charter, history, petitions ───────────────────────────────────────────
console.log('\n== The colony remembers ==');
{
  setCharterOwner(COL, 'p1', null);
  ok('the charter can be held', getCityState(COL).charter_owner === 'p1');
  setCharterOwner(COL, 'p2', 'p1');
  const st = getCityState(COL);
  ok('and changing hands records who held it before',
     st.charter_owner === 'p2' && st.prev_charter === 'p1');

  for (let i = 0; i < 60; i++) pushCityHistory(COL, 0, 'seated', 'p1', 'entry ' + i);
  const h = getCityHistory(COL, 0, 40);
  ok('history is kept', h.length > 0, String(h.length));
  ok('and trimmed per district so a busy capital cannot bury a quiet one',
     h.length <= 40, String(h.length));
  ok('newest first', h[0].detail === 'entry 59', String(h[0].detail));
  pushCityHistory(COL, 1, 'works', 'p2', 'other district');
  ok('a second district keeps its own record',
     getCityHistory(COL, 1, 5).length === 1);
  ok('the colony view spans districts', getColonyHistory(COL, 60).length > 1);

  ok('a player who has never petitioned has no stamp', lastPetition(COL, 0, 'nobody') === 0);
  recordPetition(COL, 0, 'p9');
  const t1 = lastPetition(COL, 0, 'p9');
  ok('a filing is recorded', t1 > 0);
  recordPetition(COL, 0, 'p9');
  ok('and refiling replaces rather than duplicates', lastPetition(COL, 0, 'p9') >= t1);
}

// ── 10. The record can be read in Chinese ────────────────────────────────────
console.log('\n== Every history kind has a template on both sides ==');
{
  const fs = await import('node:fs');
  const srv = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
  const core = fs.readFileSync(new URL('../client/assets/core.js', import.meta.url), 'utf8');
  const cli = fs.readFileSync(new URL('../client/assets/city.js', import.meta.url), 'utf8');

  // Every kind the server can write, including the ones chosen by a ternary.
  const kinds = new Set();
  for (const m of srv.matchAll(/pushCityHistory\(\s*[^,]+,\s*[^,]+,\s*([^,]+),/g)) {
    for (const q of m[1].matchAll(/'([a-zA-Z]+)'/g)) kinds.add(q[1]);
  }
  console.log('  kinds the server writes: ' + [...kinds].sort().join(', '));
  ok('the server writes some history', kinds.size >= 5, String(kinds.size));

  // The failure this guards is adding a seventh kind and rendering its raw
  // English forever, which is exactly what all six of these did on first ship.
  const missingZh = [...kinds].filter(k => core.indexOf("'city.hist." + k + "'") < 0);
  ok('every kind has an i18n key', missingZh.length === 0, missingZh.join(','));
  const missingFb = [...kinds].filter(k => !new RegExp('\\b' + k + ':').test(
    cli.slice(cli.indexOf('var HIST_FALLBACK'), cli.indexOf('function histLine'))));
  ok('and an English fallback in the renderer', missingFb.length === 0, missingFb.join(','));

  // Both keys carry a zh, and neither zh is just the English copied across.
  const bad = [];
  for (const k of kinds) {
    const m = new RegExp("'city\\.hist\\." + k + "':\\{en:'([^']*)',zh:'([^']*)'\\}").exec(core);
    if (!m) { bad.push(k + ' unparsed'); continue; }
    if (m[2] === m[1]) bad.push(k + ' zh==en');
    // Token parity: a template that drops {who} renders a sentence with a hole.
    const toks = t => (t.match(/\{\w+\}/g) || []).sort().join(',');
    if (toks(m[1]) !== toks(m[2])) bad.push(k + ' tokens ' + toks(m[1]) + ' vs ' + toks(m[2]));
  }
  ok('every zh template is translated and keeps its tokens', bad.length === 0, bad.join(' | '));

  // Rows written before params existed have to keep reading.
  pushCityHistory(COL, 3, 'seated', 'p1', 'Legacy English row', null);
  const legacy = getCityHistory(COL, 3, 1)[0];
  ok('a row with no params still carries its English', !legacy.params && !!legacy.detail,
     String(legacy.detail));
  pushCityHistory(COL, 3, 'works', 'p1', 'Someone commissions civic works, level 2', { who:'Someone', lv:2 });
  const fresh = getCityHistory(COL, 3, 1)[0];
  ok('and a new row carries structured params', !!fresh.params, String(fresh.params));
  ok('which round-trip as an object', JSON.parse(fresh.params).lv === 2);
}

// ── 11. Corruption costs money ───────────────────────────────────────────────
console.log('\n== A rotten district costs more to run than its levers claim ==');
{
  const d = () => getDistrict(COL, 0);
  updateDistrict(COL, 0, { s_corruption: 0 });
  const clean = civicBill(COL, d()), base = civicBillBase(COL, d());
  ok('a clean district pays exactly what its services cost', near(clean, base, 1e-6),
     Math.round(clean) + ' vs ' + Math.round(base));

  updateDistrict(COL, 0, { s_corruption: CITY_TUNE.BILL_SKIM_FLOOR });
  ok('and low level graft is free, not a cliff', near(civicBill(COL, d()), base, 1e-6));

  updateDistrict(COL, 0, { s_corruption: 100 });
  const rotten = civicBill(COL, d());
  ok('a fully rotten one pays the maximum skim',
     near(rotten / base, 1 + CITY_TUNE.BILL_SKIM_MAX, 1e-6),
     (rotten / base).toFixed(3) + 'x');
  console.log('  bill at corruption 0 / 50 / 100: ' + Math.round(base) + ' / ' +
    (updateDistrict(COL, 0, { s_corruption: 50 }), Math.round(civicBill(COL, d()))) + ' / ' +
    Math.round(rotten));

  // Monotonic, or a mayor could game the sim into a cheaper bill by getting
  // MORE corrupt, which would invert the whole point.
  let prev = -1, mono = true;
  for (let c = 0; c <= 100; c += 5) {
    updateDistrict(COL, 0, { s_corruption: c });
    const v = civicBill(COL, d());
    if (v < prev - 1e-9) mono = false;
    prev = v;
  }
  ok('the bill never falls as corruption rises', mono);
  ok('the skim is a fraction, never a subsidy', billSkim({ s_corruption: 0 }) === 0
     && billSkim({ s_corruption: 100 }) > 0);
  updateDistrict(COL, 0, { s_corruption: 30 });
}

// ── 12. Cover against a siege ────────────────────────────────────────────────
console.log('\n== A mayor can buy their way through a blockade ==');
{
  for (const dd of getDistricts(COL)) updateDistrict(COL, dd.idx, {
    favoured: null, stock_food: 0, stock_med: 0, stock_tech: 0 });
  const siegeBare = civicPressure(COL, 'food', 1);

  const perWeek = stockWeekUnits(COL, 'food');
  ok('a week of cover is a real quantity', perWeek > 0, perWeek.toFixed(1));
  ok('and it is priced', stockCost(perWeek) > 0, String(stockCost(perWeek)));

  // Every district lays in its full allowance.
  for (const dd of getDistricts(COL)) updateDistrict(COL, dd.idx, { stock_food: stockCapacity(COL, 'food') });
  const siegeStocked = civicPressure(COL, 'food', 1);
  ok('stores blunt a siege', siegeStocked < siegeBare,
     siegeBare.toFixed(2) + ' -> ' + siegeStocked.toFixed(2));
  // demand and local are RATES and a stockpile is a QUANTITY. The first cut of
  // this added the quantity straight to the rate, so full stores flipped a
  // besieged world from maximum scarcity to maximum SURPLUS. Cover must reach
  // self sufficiency and stop.
  ok('cover reaches self sufficiency and goes no further', siegeStocked >= -1e-9,
     siegeStocked.toFixed(3));
  console.log('  siege pressure with full stores: ' + siegeBare.toFixed(2) +
              ' -> ' + siegeStocked.toFixed(2));

  // A world that is not short eats nothing and only loses the spoilage.
  for (const dd of getDistricts(COL)) updateDistrict(COL, dd.idx, { favoured: 'food' });
  const fedBefore = stockOf(COL, 'food');
  drawStock(COL, 1);
  const fedAfter = stockOf(COL, 'food');
  ok('a world that feeds itself only loses the spoilage',
     near(fedAfter / fedBefore, 1 - CITY_TUNE.STOCK_DECAY_WK, 0.02),
     (1 - fedAfter / fedBefore).toFixed(3));

  // A world that is short eats into them as well.
  for (const dd of getDistricts(COL)) updateDistrict(COL, dd.idx, {
    favoured: null, stock_food: stockCapacity(COL, 'food') });
  const before = stockOf(COL, 'food');
  drawStock(COL, 1);
  const after = stockOf(COL, 'food');
  ok('and a world that is short eats them faster than they spoil',
     after < before * (1 - CITY_TUNE.STOCK_DECAY_WK) - 1,
     Math.round(before) + ' -> ' + Math.round(after));
  ok('the shortfall it is covering is a real weekly quantity',
     shortfallUnits(COL, 'food') > 0, shortfallUnits(COL, 'food').toFixed(0));

  let n = 0;
  for (; n < 400; n++) { drawStock(COL, 1); if (stockOf(COL, 'food') <= 0) break; }
  ok('and stores eventually run out rather than trailing forever',
     stockOf(COL, 'food') === 0, n + ' weeks');
  console.log('  full stores under permanent siege last ' + n + ' weeks');

  // The panel reports cover in COLONY weeks while purchases are sized in a
  // district's share of them. Reporting one in the other's units claimed
  // eighty four weeks of cover for what was really six.
  for (const dd of getDistricts(COL)) updateDistrict(COL, dd.idx, { stock_food: stockCapacity(COL, 'food') });
  const shownWeeks = stockOf(COL, 'food') / colonyWeekUnits(COL, 'food');
  console.log('  full stores read as ' + shownWeeks.toFixed(1) + ' colony weeks of cover');
  ok('cover is reported in colony weeks, not district shares',
     shownWeeks > 1 && shownWeeks <= CITY_TUNE.STOCK_MAX_WK + 0.01, shownWeeks.toFixed(1));
  ok('and a district share is smaller than a colony week',
     stockWeekUnits(COL, 'food') < colonyWeekUnits(COL, 'food'));
  for (const dd of getDistricts(COL)) updateDistrict(COL, dd.idx, { stock_food: 0, favoured: null });
  for (const dd of getDistricts(COL)) updateDistrict(COL, dd.idx, { stock_food: 0 });
}

// ── 13. Firms fold and firms open ────────────────────────────────────────────
console.log('\n== The NPC pool is not a fixed set of rows ==');
{
  const IDX = 5;
  const est = Date.now() - CITY_TUNE.SHOP_RAMP_WK * CITY_TUNE.WEEK_MS * 1.4;
  for (let i = 0; i < 40; i++) setShopEstablished(leaseShop(COL, IDX, npcOwnerId(), 'food', 'F' + i, ''), est);
  const d = () => getDistrict(COL, IDX);

  // Refound between weeks, exactly as the tick does. Without that both cases
  // simply drain to the four shop floor and the WORSE district stops churning
  // first, which reads as calm districts losing more trade. The first cut of
  // this check measured that and reported it as a failure of the mechanic.
  const refill = () => {
    for (let i = getDistrictShops(COL, IDX).length; i < 40; i++)
      setShopEstablished(leaseShop(COL, IDX, npcOwnerId(), 'food', 'R' + Math.random(), ''), est);
  };
  const measure = (unrest, crime) => {
    updateDistrict(COL, IDX, { s_unrest: unrest, s_crime: crime });
    let closed = 0;
    for (let i = 0; i < 400; i++) { refill(); closed += churnNpcShops(COL, d(), 1); }
    return closed / 400;
  };
  const calmRate = measure(5, 5);
  const hotRate = measure(95, 95);

  console.log('  firms lost per week out of 40: calm ' + calmRate.toFixed(2) +
              ', unrest and crime at 95 ' + hotRate.toFixed(2));
  ok('firms fold', hotRate > 0, hotRate.toFixed(2));
  ok('and a district in trouble loses them faster than a quiet one',
     hotRate > calmRate * 1.5, calmRate.toFixed(2) + ' vs ' + hotRate.toFixed(2));
  ok('the calm rate is close to the configured baseline',
     near(calmRate / 40, CITY_TUNE.CHURN_BASE_WK, 0.006),
     (calmRate / 40).toFixed(4) + ' vs ' + CITY_TUNE.CHURN_BASE_WK);

  // The floor exists so churn cannot empty a thin district into nothing.
  while (getDistrictShops(COL, IDX).length > 3) {
    const sh = getDistrictShops(COL, IDX).filter(isNpcShop)[0];
    if (!sh) break;
    db.prepare('DELETE FROM city_shops WHERE id=?').run(sh.id);
  }
  const thin = getDistrictShops(COL, IDX).length;
  let removed = 0;
  for (let i = 0; i < 50; i++) removed += churnNpcShops(COL, d(), 1);
  ok('a district below the floor is never churned further',
     removed === 0 && getDistrictShops(COL, IDX).length === thin,
     'had ' + thin + ', removed ' + removed);

  // A single tick may never gut a district, however bad it gets.
  for (let i = getDistrictShops(COL, IDX).length; i < 40; i++)
    setShopEstablished(leaseShop(COL, IDX, npcOwnerId(), 'food', 'H' + i, ''), est);
  const start = getDistrictShops(COL, IDX).length;
  const worst = churnNpcShops(COL, d(), 52);   // a year in one step
  ok('one settlement can never take more than a quarter of the trade',
     worst <= Math.ceil(start * 0.25), worst + ' of ' + start);
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
failures.forEach(f => console.log('  - ' + f));
process.exit(fail ? 1 : 0);
