// lane-check
//
// The client draws lanes from client/assets/galaxy.js LANES. Everything on the
// server that moves cargo walks server/server.js LANES_SERVER: npcPickLane,
// findLane, the findRoute BFS, the shipping contract board, the blockade hooks.
// The two are hand maintained copies of each other and nothing enforced that.
//
// It drifted. The 16 Jade Circuit worlds and their 26 lanes were added to the
// client in 1.5.0.0 and never copied to the server, so for two minor versions
// the Circuit had colony state, commodity markets and a map, and no way to move
// a single unit of anything into or out of it. Nothing threw. The Circuit
// simply had no freight, and every smuggling run to a Circuit world answered
// 'No lane exists'.
//
// No dependencies. Run from the repo root:  node tools/lane-check.mjs
import fs from 'fs';
import vm from 'vm';

const ROOT = process.cwd();
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; failures.push(n + (d ? '  [' + d + ']' : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); } };

const slice = (src, open, close) => {
  const i = src.indexOf(open); if (i < 0) return null;
  const j = src.indexOf(close, i); if (j < 0) return null;
  return src.slice(i + open.length - 1, j + 1);
};

const clientSrc = fs.readFileSync(ROOT + '/client/assets/galaxy.js', 'utf8');
const serverSrc = fs.readFileSync(ROOT + '/server/server.js', 'utf8');
const dbSrc     = fs.readFileSync(ROOT + '/server/db.js', 'utf8');

const CLIENT = eval(slice(clientSrc, 'var LANES=[', '];'));
const SERVER = eval(slice(serverSrc, 'const LANES_SERVER = [', '];'));

const key = l => [l.from, l.to].sort().join('|');
const cmap = new Map(CLIENT.map(l => [key(l), l]));
const smap = new Map(SERVER.map(l => [key(l), l]));

console.log('== The two lane tables are the same table ==');
console.log('  client ' + CLIENT.length + ' lanes, server ' + SERVER.length + ' lanes');
ok('both tables have lanes', CLIENT.length > 0 && SERVER.length > 0);

const missing = [...cmap.keys()].filter(k => !smap.has(k));
ok('every lane the client draws exists on the server', missing.length === 0,
   missing.length + ' missing: ' + missing.slice(0, 6).join(', '));

const extra = [...smap.keys()].filter(k => !cmap.has(k));
ok('the server has no lane the client cannot draw', extra.length === 0,
   extra.length + ' extra: ' + extra.slice(0, 6).join(', '));

const drift = [...cmap.keys()].filter(k => smap.has(k) &&
  (smap.get(k).vol !== cmap.get(k).vol || smap.get(k).type !== cmap.get(k).type));
ok('vol and type agree on every shared lane', drift.length === 0,
   drift.slice(0, 6).join(', '));

ok('no lane duplicates itself under either direction',
   cmap.size === CLIENT.length && smap.size === SERVER.length,
   'client ' + cmap.size + '/' + CLIENT.length + ' server ' + smap.size + '/' + SERVER.length);

console.log('\n== Every lane endpoint is a colony the server knows about ==');
const seeded = new Set([...dbSrc.matchAll(/\{ id:'([a-z_]+)',\s+faction:'[a-z]+'/g)].map(m => m[1]));
ok('the colony seed parsed', seeded.size >= 30, String(seeded.size));
const orphans = [...new Set(SERVER.flatMap(l => [l.from, l.to]))].filter(c => !seeded.has(c));
ok('no lane runs to a colony that has no server row', orphans.length === 0, orphans.join(', '));

const noMarket = eval(slice(serverSrc, 'const NO_MARKET_COLONIES = new Set([', ']'));
console.log('  no-market colonies: ' + noMarket.join(', '));

console.log('\n== The Circuit is reachable and self contained ==');
const JADE = [...seeded].filter(id => new RegExp("\\{ id:'" + id + "',\\s+faction:'jade'").test(dbSrc));
ok('the Circuit has its sixteen worlds', JADE.length === 16, String(JADE.length));

// npcSpawn bails unless BOTH endpoints are market colonies, so a Circuit world
// sitting in NO_MARKET_COLONIES would silently kill freight on every lane it
// touches without producing an error anywhere.
const dead = JADE.filter(id => noMarket.includes(id));
ok('no Circuit world is excluded from the commodity market', dead.length === 0, dead.join(', '));

const adj = {};
for (const l of SERVER) {
  (adj[l.from] = adj[l.from] || []).push(l.to);
  (adj[l.to]   = adj[l.to]   || []).push(l.from);
}
const reach = start => {
  const seen = new Set([start]); const q = [start];
  while (q.length) for (const n of (adj[q.shift()] || [])) if (!seen.has(n)) { seen.add(n); q.push(n); }
  return seen;
};
const fromYujing = reach('yujing');
const unreached = JADE.filter(id => !fromYujing.has(id));
ok('every Circuit world is reachable from Yujing over server lanes',
   unreached.length === 0, unreached.join(', '));

// 1.2.2 REVERSES THE INVARIANT THIS USED TO ASSERT. Until now the two sectors
// were separate graph components and no cargo could move between them, which
// made the Circuit a place you could look at and not trade with. Exactly ONE
// lane crosses the border now, the passage, and trade across it opens and
// closes on the Circuit's word.
const mixed = SERVER.filter(l => JADE.includes(l.from) !== JADE.includes(l.to));
ok('exactly one lane crosses the Circuit border', mixed.length === 1,
   mixed.map(l => l.from + '->' + l.to).join(', '));
ok('and it is the passage, flagged as such',
   mixed.length === 1 && mixed[0].passage === true && mixed[0].type === 'passage',
   JSON.stringify(mixed[0] || null));
ok('it runs between the two named anchors',
   mixed.length === 1 && [mixed[0].from, mixed[0].to].sort().join('|') === 'cascade_station|mozi_array',
   mixed.length ? mixed[0].from + '|' + mixed[0].to : 'none');
ok('no OTHER lane crosses the border',
   SERVER.filter(l => JADE.includes(l.from) !== JADE.includes(l.to) && !l.passage).length === 0);
ok('so the Circuit is reachable from Coalition space when it is open',
   fromYujing.has('new_anchor'));

// Sealed, the sectors part again. Rebuild the graph without the passage.
{
  const adj2 = {};
  for (const l of SERVER) {
    if (l.passage) continue;
    (adj2[l.from] = adj2[l.from] || []).push(l.to);
    (adj2[l.to]   = adj2[l.to]   || []).push(l.from);
  }
  const seen = new Set(['yujing']); const q = ['yujing'];
  while (q.length) for (const n of (adj2[q.shift()] || [])) if (!seen.has(n)) { seen.add(n); q.push(n); }
  ok('and unreachable again the moment it is sealed', !seen.has('new_anchor'));
  ok('while the Circuit stays whole on its own side',
     JADE.every(id => seen.has(id)), JADE.filter(id => !seen.has(id)).join(','));
}

const wOf = l => l.vol === 'high' ? 4 : l.vol === 'medium' ? 2 : 1;
const tw = SERVER.reduce((a, l) => a + wOf(l), 0);
const jw = SERVER.filter(l => JADE.includes(l.from) && JADE.includes(l.to)).reduce((a, l) => a + wOf(l), 0);
console.log('  Circuit share of npcPickLane weight: ' + (100 * jw / tw).toFixed(1) + '%');
ok('Circuit lanes can actually win an NPC spawn roll', jw > 0, String(jw));

console.log('\n== The passage gates the commodity market, not just the exchange ==');
{
  // WORMHOLE_OPEN was read in exactly two places, the ticker list at init and
  // the stock order handler, so sealing the passage hid the Jade Exchange and
  // left the Circuit's sixteen COMMODITY markets listed, priced and tradeable.
  // The dev switch appeared to do nothing to commodities because it did
  // nothing to commodities. This asserts the gate reaches every path.
  const srv = fs.readFileSync(ROOT + '/server/server.js', 'utf8');

  ok('there is a single sealed predicate', /function jadeSealed\(/.test(srv));

  /* Every route that can reach a Circuit commodity market has to consult it.
     jadeSealed TAKES THE ACTOR NOW - a GM has to be able to run a lane inside a
     sealed Circuit to test it before the passage opens - so these match the
     actor form. The exception is deliberate at each route rather than inside
     the predicate, which is why the arbitrage grid below still passes none: a
     shared price board published to everyone listening is not the same act as a
     GM acting on a colony. */
  const guarded = [
    ['the arbitrage grid drops sealed colonies', /filter\(c => !jadeSealed\(c\.id\)\)/],
    ['the per-colony price board refuses', /jadeSealed\(colonyId, p\)\) return res\.status\(403\)/],
    ['freight cannot set out inside a sealed Circuit', /jadeSealed\(from, actor\) \|\| jadeSealed\(to, actor\)/],
  ];
  for (const [name, re] of guarded) ok(name, re.test(srv));
  /* And the exception itself: one predicate, taking an actor, absent meaning no
     exception - so a caller that forgets to pass one keeps the behaviour it had
     rather than silently opening. */
  ok('the dev exception is one predicate, not a bypass at each call site',
     /function devPassesSeal\(actor\)/.test(srv));
  ok('and an absent actor means no exception',
     /const id = actor && \(actor\.id \|\| actor\.playerId\);\s*\n\s*if \(!id\) return false;/.test(srv));
  ok('the shared price board deliberately passes no actor',
     /NO ACTOR ON PURPOSE/.test(srv));

  // buy and sell are separate handlers and both need it; counting stops one
  // being gated and the other quietly left open.
  const guards = (srv.match(/jadeSealed\(colonyId, p\)\) return res\.status\(403\)/g) || []).length;
  ok('both trade handlers and the price board are gated', guards === 3, String(guards));
  const runGuards = (srv.match(/jadeSealed\(from, actor\) \|\| jadeSealed\(to, actor\)/g) || []).length;
  ok('both smuggling and shipping are gated', runGuards === 2, String(runGuards));
  /* NO CALL SITE MAY DROP THE ACTOR SILENTLY. Counting the gated forms proves
     the ones that should pass one do; this proves nothing else calls the
     predicate bare except the one place that is documented as deliberate. */
  const bare = (srv.match(/jadeSealed\([^,)]*\)/g) || [])
    .filter(x => !/jadeSealed\(colonyId, p\)|jadeSealed\(from, actor\)|jadeSealed\(to, actor\)/.test(x));
  ok('the only actorless call is the shared price board', bare.length === 1, bare.join(' '));

  // The predicate has to actually recognise every Circuit world, or the gate
  // is enforced on some of them and not others.
  const city = fs.readFileSync(ROOT + '/server/city.js', 'utf8');
  const cityJade = new Set([...city.matchAll(/^  ([a-z_]+):\s*\{[^}]*jade:\s*(?:true|1)/gm)].map(m => m[1]));
  const missed = JADE.filter(id => !cityJade.has(id));
  ok('isJadeColony recognises every Circuit world', missed.length === 0, missed.join(','));
  console.log('  Circuit worlds the gate covers: ' + JADE.length);

  // And the client has to rebuild, or an open Markets tab keeps showing a
  // board the server has started refusing.
  const gx = fs.readFileSync(ROOT + '/client/assets/galaxy.js', 'utf8');
  /* THE FUNCTION, NOT A FIXED BYTE WINDOW. This sliced 1200 characters from
     window._setWormhole and broke the moment _setPassage grew an eject branch -
     the calls it looks for were still there, three lines further down. A window
     measured in bytes fails on any unrelated edit above the thing it wants,
     which is the worst kind of check: it goes red on correct code and the
     pressure is to widen the number until it stops complaining. Brace matched
     to the end of _setPassage, which is where those calls actually live. */
  const setW = (function () {
    const i = gx.indexOf('window._setPassage = function');
    let d = 0; const start = gx.indexOf('{', i);
    for (let k = start; k < gx.length; k++) {
      if (gx[k] === '{') d++;
      else if (gx[k] === '}' && --d === 0) return gx.slice(i, k + 1);
    }
    return '';
  })();
  ok('toggling the passage refreshes the markets view', /renderMarketsTab\(\)/.test(setW));
  ok('and the shipping view', /window\.renderShippingTab\(\)/.test(setW));
}

console.log('\n== The passage is a lane, not property ==');
{
  const srv = fs.readFileSync(ROOT + '/server/server.js', 'utf8');
  const gx  = fs.readFileSync(ROOT + '/client/assets/galaxy.js', 'utf8');

  ok('the server can recognise a passage lane', /function isPassageLane\(/.test(srv));
  ok('findLane hides it while the passage is sealed',
     /if \(isPassageLane\(l\) && !WORMHOLE_OPEN\) return undefined;/.test(srv));
  ok('the routing graph drops it while sealed',
     /isPassageLane\(l\) && !WORMHOLE_OPEN\) continue;\s*\/\/ sealed: not an edge/.test(srv));
  ok('and no NPC freighter is spawned onto a sealed passage',
     (srv.match(/isPassageLane\(l\) && !WORMHOLE_OPEN\) continue;/g) || []).length === 2);

  // Nobody buys a toll booth on the only door between two galaxies, and nobody
  // besieges it either. Counted, because there are two share handlers and one
  // blockade handler and gating two of the three would be worse than none.
  const owned = (srv.match(/isPassageLane\(lane\)\) \{/g) || []).length;
  ok('shares, swaps and blockades all refuse the passage', owned === 3, String(owned));

  ok('the client knows the anchor colony on each side',
     /PASSAGE_ANCHOR=\{ coalition:'cascade_station', jade:'mozi_array' \}/.test(gx));
  ok('renderLanes skips it, since its ends are in different views',
     /if\(laneIsPassage\(l\)\) return;/.test(gx));
  ok('the connector is drawn to the gate instead', /function renderPassageLink\(/.test(gx));
  ok('and is drawn again after every lane repaint',
     (gx.match(/renderPassageLink\(\)/g) || []).length >= 3);
  // Was pinned to the literal `if(!WORMHOLE_OPEN) return;`. That asserted the
  // implementation string rather than the guarantee, so moving the seal flag
  // into the galaxy registry failed a check that had lost nothing. It now
  // asserts what actually matters: renderPassageLink bails before drawing
  // anything when the relevant passage is sealed.
  {
    const body = gx.slice(gx.indexOf('function renderPassageLink'),
                          gx.indexOf('function renderPortal'));
    const guard = /if\(!passageOpen\([^)]*\)\) return;/.test(body)
               || /if\(!WORMHOLE_OPEN\) return;/.test(body);
    const guardBeforeDraw = guard &&
      body.search(/if\(!(passageOpen\([^)]*\)|WORMHOLE_OPEN)\) return;/) < body.indexOf('createElementNS');
    ok('a sealed passage draws no line at all', guardBeforeDraw);
  }
  ok('decorative traffic and scoundrels stay off it',
     (gx.match(/laneIsPassage\(l\)\) return;/g) || []).length === 3);
}

console.log('\n== Circuit freight works the gate, and the station sees what it can reach ==');
{
  const srv = fs.readFileSync(ROOT + '/server/server.js', 'utf8');
  const gx  = fs.readFileSync(ROOT + '/client/assets/galaxy.js', 'utf8');

  // The passage is one lane in sixty four. At an ordinary weight a 113-sample
  // fleet observation produced ZERO crossings, which for the single most
  // interesting route in the game is the same as not having built it.
  const wm = /const PASSAGE_TRAFFIC_WEIGHT = Number\(process\.env\.PASSAGE_TRAFFIC_WEIGHT\) \|\| (\d+)/.exec(srv);
  ok('the passage has its own spawn weight', !!wm, wm ? wm[1] : 'missing');
  if (wm) {
    const W = Number(wm[1]);
    const others = SERVER.filter(l => !l.passage)
      .reduce((a, l) => a + (l.vol === 'high' ? 4 : l.vol === 'medium' ? 2 : 1), 0);
    const share = W / (others + W);
    console.log('  passage share of NPC spawn weight: ' + (share * 100).toFixed(1) +
                '% (1 in ' + ((others + W) / W).toFixed(1) + ' spawns)');
    ok('busy enough to actually be seen', share > 0.05, (share * 100).toFixed(1) + '%');
    ok('but not so busy it becomes a conveyor belt', share < 0.25, (share * 100).toFixed(1) + '%');
  }

  // Circuit hulls work their own gate: a run with ONE end in the Circuit is
  // Circuit freight, so what arrives at Cascade Station is a Changzheng hull.
  ok('a run with either end in the Circuit draws Changzheng hulls',
     /isJadeWorld\(fromId\) \|\| isJadeWorld\(toId\)\) \? JADE_POOL : MERCHANT_POOL/.test(gx));

  // A crossing belongs to both sides, or the gate visibly carries nothing.
  // These were pinned to the literal tag 'both'. That string was only correct
  // because there were exactly two galaxies, which made "both" and "everywhere"
  // the same set. With the Reach they are not, and tagShipGalaxy was showing
  // Circuit traffic in Khai'sultull space. A run is now tagged with the two
  // galaxies it actually touches; the guarantee is unchanged.
  ok('a passage run is tagged to the sector at each end',
     /a === b \? a : \(a < b \? a \+ '\|' \+ b : b \+ '\|' \+ a\)/.test(gx));
  ok('and is shown in either view, and only those two',
     /shipVisibleIn\(gx, activeGalaxy\)/.test(gx)
     && /function shipVisibleIn\(tag, gx\)/.test(gx));
  ok('drawn anchor-to-gate, since its ends sit in different views',
     /function passageEndpoints\(/.test(gx));

  // The scan is a sensor, not a jurisdiction. Flesh Station sits in the
  // Coalition cluster: it reads a Changzheng hull at Cascade Station fine, and
  // cannot see past the gate at all.
  // The DEFINITION, not the first call site: openShipManifest is invoked from
  // two spawn handlers long before it is defined further down the file.
  const scanAt = gx.indexOf('window.openShipManifest = function');
  const scan = gx.slice(scanAt, scanAt + 2600);
  ok('the scan refuses only a run that is wholly inside the Circuit',
     /FJ\.shipGalaxy\(fromId, toId\) === 'jade'/.test(scan));
  // Verified against the live tagging rule rather than a tag string, so
  // retagging cannot silently change which runs are scannable.
  {
    const sg = (a, b) => a === b ? a : (a < b ? a + '|' + b : b + '|' + a);
    ok('a crossing is still scannable', sg('coalition', 'jade') !== 'jade');
    ok('a run wholly inside the Circuit is still refused', sg('jade', 'jade') === 'jade');
    ok('Reach runs are scannable', sg('khaisultull', 'khaisultull') !== 'jade');
  }
  const core = fs.readFileSync(ROOT + '/client/assets/core.js', 'utf8');
  ok('and the refusal says sensor range, not registry',
     /outside station sensor range/.test(core) && !/Circuit registry/.test(core));

  // A passage sealed as a story beat must not quietly reopen on the next deploy.
  ok('the passage state is persisted', /const WORMHOLE_KEY = 'wormhole_open'/.test(srv));
  ok('written on every dev command', /setCityKV\(WORMHOLE_KEY, open \? '1' : '0'\)/.test(srv));
  ok('and restored at boot', /getCityKV\(WORMHOLE_KEY\)/.test(srv));
  ok('defaulting to open when it has never been set',
     /let WORMHOLE_OPEN = true;/.test(srv));
}

// ── The seal state survives galaxy.js being lazy loaded ──────────────────────
//
// galaxy.js is loaded on the FIRST GALACTIC TAB CLICK. The init message that
// carries the seal state is sent on socket connect, which is always earlier, so
// core.js's `if (window._setWormhole)` guard could never be true at init and
// the server's answer was discarded on every load. galaxy.js then ran on its
// own literals - both passages sealed - and once swapGalaxy started refusing on
// that, the Circuit was shut to every player while the server had it open.
//
// DRIVEN, NOT MATCHED. The file is executed with a seed in place and the seal
// is asked afterwards, because the bug was invisible to a text read: every line
// involved was correct on its own and the fault was the ORDER they ran in.
console.log('');
console.log('== The seal state survives the lazy load ==');
{
  const gxSrc = fs.readFileSync(ROOT + '/client/assets/galaxy.js', 'utf8');
  const stub = new Proxy(function(){}, {
    get: (t, k) => k === 'style' ? {} : (k === 'children' ? [] : (typeof k === 'string' ? stub : undefined)),
    set: () => true, apply: () => stub, construct: () => stub });
  const load = seed => {
    const doc = { getElementById:()=>null, querySelectorAll:()=>[], querySelector:()=>null,
      createElement:()=>stub, createElementNS:()=>stub, addEventListener:()=>{}, body:stub, head:stub };
    const w = { document:doc, addEventListener:()=>{}, setTimeout:()=>0, setInterval:()=>0,
      clearInterval:()=>{}, localStorage:{ getItem:()=>null, setItem:()=>{} },
      location:{ href:'', origin:'' }, fetch:()=>Promise.resolve({ json:()=>Promise.resolve({}) }), console };
    w.window = w;
    if (seed) w._PASSAGE_SEED = seed;
    const ctx = vm.createContext(w);
    vm.runInContext(gxSrc, ctx, { filename:'galaxy.js' });
    return ctx;
  };
  let c = load({ jade:true, khaisultull:false });
  ok('an open Circuit seeded before load is open after it', c._fmGalaxyView.open('jade') === true);
  ok('and the Reach is still sealed in the same load',      c._fmGalaxyView.open('khaisultull') === false);
  c._fmGalaxyView.swap('jade');
  ok('so swapGalaxy actually moves the player in',          c._fmGalaxyView.get() === 'jade');

  c = load({ jade:false, khaisultull:true });
  ok('and it carries the other way round too',
     c._fmGalaxyView.open('jade') === false && c._fmGalaxyView.open('khaisultull') === true);

  c = load(null);
  ok('no seed at all still defaults to sealed',
     c._fmGalaxyView.open('jade') === false && c._fmGalaxyView.open('khaisultull') === false);

  c = load({ jade:false, khaisultull:false });
  c._setWormhole(true);
  ok('a live toggle writes back to the bank', c._PASSAGE_SEED.jade === true);

  // The other half of the pair: core.js has to bank it UNCONDITIONALLY, not
  // inside the setter guard, or there is nothing here to read.
  const coreSrc = fs.readFileSync(ROOT + '/client/assets/core.js', 'utf8');
  ok('core.js banks the Circuit flag at init',
     /_PASSAGE_SEED\.jade = window\._WORMHOLE_OPEN;/.test(coreSrc));
  ok('core.js banks the Reach flag at init',
     /_PASSAGE_SEED\.khaisultull = window\._REACH_OPEN;/.test(coreSrc));
  ok('and banks every broadcast, not just the ones with a setter to call',
     /_PASSAGE_SEED\[msg\.data\.galaxy\] = !!msg\.data\.open;/.test(coreSrc));
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
failures.forEach(f => console.log('  - ' + f));
process.exit(fail ? 1 : 0);
