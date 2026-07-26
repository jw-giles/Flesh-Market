// city-commodity-sim
//
// Does joining the city layer to the commodity grid break the commodity grid?
//
// The city layer invents its own food/med/tech supply and the commodity grid
// prices 40 agri, 40 med and 40 tech per colony. They have never touched. The
// proposal is that a colony's unmet civic demand presses on its own commodity
// prices, so a well zoned world is where that class is cheap and a besieged
// one is where it is dear.
//
// That is a persistent, directional pressure on a model that was tuned without
// it, so it gets simulated before it gets written. What this measures:
//   - where `supply` settles, against the +/-0.4 clamp that bounds it
//   - whether prices stay inside the [0.5x, 1.8x] target band
//   - whether colony to colony spread SURVIVES, which is the real risk here.
//     The model cannot run away; supplyMod and the price band are both clamped.
//     It can flatten, and a flat commodity map has no trade in it.
//
// Run:  node tools/city-commodity-sim.mjs [ticks] [runs]
import { CITY_TUNE } from '../server/city.js';

const TICKS = Number(process.argv[2]) || 4032;   // 5 min ticks, 14 days
const RUNS  = Number(process.argv[3]) || 200;

// ── The commodity model, lifted from server.js verbatim ──────────────────────
const COMMODITY_SUPPLY_DECAY = 0.04;
const REVERT = 0.25;
function supplyMod(supply) { return 1 - Math.max(-0.4, Math.min(0.4, supply)); }
function stepPrice(price, target, vol, facVol) {
  const noise = (Math.random() * 2 - 1) * vol * facVol * price;
  let p = price + (target - price) * REVERT + noise;
  return Math.max(target * 0.5, Math.min(target * 1.8, p));
}

// ── The proposed coupling ────────────────────────────────────────────────────
// pressure is unmet civic demand as a fraction of demand, signed: positive when
// the colony must import, negative when its zoned districts run a surplus and
// it exports. A blockade multiplies what is already unmet.
function civicPressure(demand, local, blk, amp) {
  const raw = (demand - local) / Math.max(1e-9, demand);
  return Math.max(-1, Math.min(1, raw)) * (1 + amp * blk);
}
// Per tick nudge. Steady state supply under a constant nudge r is r / decay,
// i.e. 25r, so DRAW is chosen against the effect wanted at full pressure.
function draw(pressure, DRAW) { return -DRAW * pressure; }

// ── Colony shapes, from the real numbers ─────────────────────────────────────
function districtCount(popM){ return Math.max(3, Math.min(14, Math.round(3 + Math.sqrt(popM)/3.2))); }
function baselineDev(ppd){ return Math.max(1, Math.min(11, Math.round(1.4*Math.log2(Math.max(1,ppd))))); }

// population in millions, and how many of its districts zone the class
const COLONIES = [
  { id:'new_anchor',      pop:12400, zoned:0 },
  { id:'cascade_station', pop:8100,  zoned:3 },
  { id:'aurora_prime',    pop:6400,  zoned:6 },
  { id:'frontier_outpost',pop:900,   zoned:1 },
  { id:'wukong_deep',     pop:640,   zoned:0 },
  { id:'yujing',          pop:9200,  zoned:8 },
];
const DEMAND_BASE = { food:0.35, med:0.16, tech:0.10 };

function localProduction(popM, zoned, devBonus, worksLv) {
  const n = districtCount(popM), ppd = popM / n;
  const dev = Math.min(14, baselineDev(ppd) + devBonus);
  const outMult = 1.0;
  return zoned * (dev * CITY_TUNE.SUPPLY_PER_DEV + worksLv * CITY_TUNE.WORKS_SUPPLY) * outMult * ppd;
}

function run(DRAW, AMP, blockadeOn) {
  const out = [];
  for (const c of COLONIES) {
    const demand = c.pop * DEMAND_BASE.food;
    const local  = localProduction(c.pop, c.zoned, 2, 0);
    const blk    = blockadeOn && c.id === 'cascade_station' ? 1 : 0;
    const press  = civicPressure(demand, local, blk, AMP);
    const r      = draw(press, DRAW);

    // 40 commodities of the class, each with its own affinity and volatility.
    let worstBand = 0, clampHits = 0, n = 0;
    const rel = [];
    for (let k = 0; k < 40; k++) {
      const base = 200 + Math.random() * 4000;
      const affinity = 0.80 + Math.random() * 0.40;
      const vol = 0.05 + Math.random() * 0.10;
      const facVol = 1.0;
      let supply = 0;
      let target = base * affinity * supplyMod(supply);
      let price = target;
      for (let t = 0; t < TICKS; t++) {
        supply = supply * (1 - COMMODITY_SUPPLY_DECAY) + r;
        if (Math.abs(supply) >= 0.4 - 1e-9) clampHits++;
        n++;
        target = base * affinity * supplyMod(supply);
        price = stepPrice(price, target, vol, facVol);
      }
      const neutral = base * affinity;   // what the price would be with no city
      rel.push(price / neutral);
      worstBand = Math.max(worstBand, Math.abs(price / target - 1));
    }
    rel.sort((a,b)=>a-b);
    out.push({ id:c.id, press, ss: -25*DRAW*press,
               med: rel[20], lo: rel[2], hi: rel[37],
               clampPct: 100*clampHits/n, worstBand });
  }
  return out;
}

function report(title, DRAW, AMP, blockadeOn) {
  const acc = {};
  for (let i = 0; i < RUNS; i++) {
    for (const r of run(DRAW, AMP, blockadeOn)) {
      const a = acc[r.id] = acc[r.id] || { press:0, ss:0, med:0, clamp:0, band:0, n:0 };
      a.press += r.press; a.ss += r.ss; a.med += r.med;
      a.clamp += r.clampPct; a.band = Math.max(a.band, r.worstBand); a.n++;
    }
  }
  console.log('\n' + title + '   DRAW=' + DRAW + ' AMP=' + AMP);
  console.log('  colony            pressure  steady supply   price vs no-city   supply clamp');
  const meds = [];
  for (const [id, a] of Object.entries(acc)) {
    const med = a.med / a.n;
    meds.push(med);
    console.log('  ' + id.padEnd(18) +
      (a.press/a.n).toFixed(2).padStart(6) +
      (a.ss/a.n).toFixed(3).padStart(14) +
      ('x' + med.toFixed(3)).padStart(19) +
      ((a.clamp/a.n).toFixed(1) + '%').padStart(15));
  }
  const spread = Math.max(...meds) / Math.min(...meds);
  console.log('  cheapest to dearest colony spread: ' + ((spread-1)*100).toFixed(1) + '%');
  return spread;
}

console.log('city -> commodity coupling, ' + RUNS + ' runs x ' + TICKS +
            ' ticks (' + (TICKS*5/60/24).toFixed(1) + ' days)');
console.log('the model is already bounded: supplyMod clamps at +/-0.4 and price at [0.5x,1.8x]');
console.log('so the question is not runaway, it is whether the map goes flat');

for (const DRAW of [0.004, 0.008, 0.012, 0.020]) report('peacetime', DRAW, 1.5, false);
report('one colony blockaded', 0.008, 1.5, true);
