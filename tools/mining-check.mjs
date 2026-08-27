// ═══════════════════════════════════════════════════════════════════════════
// mining-check.mjs — the mining credit bound, driven rather than read.
//
// WHY THIS EXISTS. This hole was declared closed twice and was open both times.
//
// The first fix retired the client-reported TOTAL (`mining_bank` with a `sync`
// field) in favour of a bounded delta protocol. Correct as far as it went.
//
// The second kept the run window open across cargo drone banks, because
// deleting it on the first positive delta meant every later message fell
// through to a fresh full fallback budget. Its comment described that failure
// precisely and the code closed exactly one path to it: the window was still
// deleted on any settlement that was not a drone, and a client that never sent
// a loadout at all never had a window to delete. Ƒ36,000 per message, unbounded
// in count, throttled only by the 30 message per second connection limit. That
// is Ƒ3.9 billion an hour against a war layer whose whole daily burn is Ƒ240m.
//
// IT SURVIVED A LATER AUDIT BECAUSE THE COMMENT WAS BELIEVED. Reading the
// handler, the guard is there and the reasoning above it is right. The bug is
// only visible if you run the state machine and ask what happens on the second
// message, or on the first one from a client that skipped the loadout.
//
// So every assertion here DRIVES the real handler body, lifted out of
// server.js, rather than matching its text.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';

let pass = 0; const fails = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  [' + detail + ']' : '')); }
}
function section(t) { console.log('\n' + t); }

const srv = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');

// Constants read out of the source, so a retune moves the expectations with it
// instead of failing this file for a deliberate change.
function constOf(name, fallback) {
  // Split on the name rather than interpolating it into a pattern: building the
  // regex as a string needed four levels of backslash escaping and produced an
  // unterminated group, which threw before a single assertion ran.
  const i = srv.indexOf('const ' + name);
  if (i < 0) return fallback;
  const m = srv.slice(i, i + 200).match(/\|\|\s*'([\d.]+)'/);
  return m ? parseFloat(m[1]) : fallback;
}
const RATE     = constOf('MINING_MAX_YIELD_PER_SEC', 400);
const FALLBACK = constOf('MINING_RUN_FALLBACK_SEC', 90);
const CEILING  = constOf('MINING_MAX_RUN_BANK', 500000);

section('The handler body lifts and runs');
const a = srv.indexOf('      let run = _miningRuns.get(actor.id);');
const b = srv.indexOf('      const nearCap  =', a);
ok('the credit block resolves as a span', a > 0 && b > a, a + '..' + b);
let step = null;
if (a > 0 && b > a) {
  try {
    step = new Function('actor', 'now', 'delta', '_miningRuns',
      'MINING_MAX_YIELD_PER_SEC', 'MINING_RUN_FALLBACK_SEC', 'MINING_MAX_RUN_BANK',
      srv.slice(a, b) + '\n run.banked = already + credited; return credited;');
  } catch (e) { /* reported next */ }
}
ok('and evaluates', typeof step === 'function');

if (typeof step === 'function') {
  const runs = new Map();
  let cash = 0;
  function bank(delta, reason, now) {
    if (delta < 0 || reason === 'loadout') { runs.set('p', { startTs: now, banked: 0 }); return 0; }
    const c = step({ id: 'p' }, now, delta, runs, RATE, FALLBACK, CEILING);
    cash += c; return c;
  }
  const reset = () => { runs.clear(); cash = 0; };

  section('A settlement message is not a fresh budget');
  {
    // THE EXPLOIT, EXACTLY AS IT WAS. No loadout, same message repeated.
    reset(); let t = 1e6;
    const first  = bank(1e9, 'banked', t += 10);
    const second = bank(1e9, 'banked', t += 10);
    const third  = bank(1e9, 'banked', t += 10);
    ok('the first message with no open run is granted once', first > 0 && first <= RATE * FALLBACK + 1,
       Math.round(first).toLocaleString());
    // This was another full Ƒ36,000 before the fix, and so was every message
    // after it, forever.
    ok('and the second one is not', second < first / 100,
       Math.round(second).toLocaleString() + ' vs ' + Math.round(first).toLocaleString());
    ok('nor the third', third < first / 100);

    // The shape the previous fix DID close, kept as a regression guard.
    reset(); t = 2e6;
    bank(-500, 'loadout', t);
    t += 120000;
    const settle = bank(1e9, 'banked', t);
    const after  = bank(1e9, 'banked', t += 10);
    ok('a settlement after a real run is bounded by the run', settle <= RATE * 121 + 1,
       Math.round(settle).toLocaleString());
    ok('and a second settlement on top of it credits nothing meaningful',
       after < settle / 1000, Math.round(after).toLocaleString());
  }

  section('The ceiling is a rate, not a per message cap');
  {
    // The message count is the thing that used to multiply the cap. It has to
    // stop mattering entirely, which is the property, rather than "the cap is
    // smaller now", which is a number.
    const drain = (msgs, gapMs) => {
      reset(); let t = 3e6;
      for (let i = 0; i < msgs; i++) bank(1e9, 'banked', t += gapMs);
      return cash;
    };
    const few  = drain(5, 33);
    const many = drain(30 * 60, 33);          // a minute flat out at the socket limit
    ok('sending 360 times as many messages does not pay 360 times as much',
       many < few * 3, Math.round(few).toLocaleString() + ' -> ' + Math.round(many).toLocaleString());

    // An hour flat out. Bounded by the per run ceiling and nothing else.
    reset(); let t = 4e6;
    for (let s = 0; s < 3600; s++) for (let i = 0; i < 30; i++) bank(1e9, 'banked', t += 33);
    ok('an hour flat out cannot exceed the per run ceiling', cash <= CEILING + 1,
       Math.round(cash).toLocaleString() + ' vs ceiling ' + CEILING.toLocaleString());

    // A LOADOUT MUST NOT REFILL THE BUCKET. It resets the window to zero
    // elapsed, so it resets the budget to zero rather than to full.
    reset(); t = 5e6;
    for (let k = 0; k < 20; k++) { bank(-1, 'loadout', t); for (let i = 0; i < 30; i++) bank(1e9, 'banked', t += 33); }
    ok('cycling the loadout does not refill it', cash <= RATE * 25,
       Math.round(cash).toLocaleString() + ' from 20 resets and 600 messages');

    // The best an attacker can do: open a run, wait for the bucket to reach the
    // ceiling, drain it, repeat. That is the design rate and it should be.
    // MEASURED AGAINST THE CLOCK THAT ACTUALLY ADVANCED. The first version of
    // this ran nine cycles of twenty one minutes, which is 3.15 hours, and then
    // divided by three. It reported 1,500,000/hr against a 1,440,000 ceiling
    // and read as a breach when the real figure was 396/sec against a 400/sec
    // design rate. A rate assertion has to divide by elapsed, not by intent.
    reset(); t = 6e6;
    const t0 = t;
    for (let k = 0; k < 9; k++) { bank(-1, 'loadout', t); t += 21 * 60000; bank(1e9, 'banked', t); }
    const perSec = cash / ((t - t0) / 1000);
    ok('and optimal cycling lands at the design rate rather than above it',
       perSec <= RATE + 0.5, perSec.toFixed(1) + ' F/sec against a design rate of ' + RATE);
  }

  section('Honest play is not clamped');
  {
    // A bound that clamps real runs is a bug wearing a fix's clothes.
    reset(); let t = 7e6;
    bank(-500, 'loadout', t);
    t += 300000;                                    // a five minute run
    const claim = 42000;                            // about 140 Ƒ/sec, a good run
    ok('a good five minute run pays in full', bank(claim, 'banked', t) === claim,
       claim.toLocaleString());

    // Cargo drones bank mid run and there can be many. This is the case the
    // previous patch existed for and it still has to work.
    reset(); t = 8e6;
    bank(-500, 'loadout', t);
    let drones = 0;
    for (let i = 0; i < 4; i++) { t += 60000; drones += bank(8000, 'cargo_drone', t); }
    t += 60000;
    const final = bank(8000, 'banked', t);
    ok('four mid run drone banks plus a settlement all pay',
       drones === 32000 && final === 8000, drones.toLocaleString() + ' + ' + final.toLocaleString());
  }

  section('A negative delta still cannot mint');
  {
    reset(); let t = 9e6;
    ok('a loadout credits nothing', bank(-1e9, 'loadout', t) === 0);
    ok('and neither does a bare negative delta', bank(-1e9, '', t) === 0);
  }
}

section('The retired total protocol stays retired');
{
  ok('a reported total is ignored', /if \(msg\.type === 'mining_bank'\) \{[\s\S]{0,400}return;/.test(srv));
  ok('and the delta path is the only one that credits',
     /if \(msg\.type === 'mining_bank_delta'\) \{/.test(srv));
  // The window must never be deleted on a credit path again. That single line
  // is what made the cap a per message figure.
  const blk = srv.slice(srv.indexOf("if (msg.type === 'mining_bank_delta')"),
                        srv.indexOf("if (msg.type === 'mining_leaderboard')"));
  ok('the delta handler resolves as a span', blk.length > 800, blk.length + ' chars');
  ok('and nothing in it closes the window on a credit',
     !/_miningRuns\.delete/.test(blk));
  ok('every credit is deducted from the budget, for every reason',
     /run\.banked = already \+ credited;/.test(blk) && !/reason === 'cargo_drone' && run/.test(blk));
}

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exit(1); }
