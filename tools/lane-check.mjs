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

// The lore invariant: the Circuit trades with itself. If a lane is ever added
// with one Circuit end and one outside end, this flips and the split is gone.
const mixed = SERVER.filter(l => JADE.includes(l.from) !== JADE.includes(l.to));
ok('no lane crosses the Circuit border', mixed.length === 0,
   mixed.map(l => l.from + '->' + l.to).join(', '));
ok('and the Circuit is therefore its own component',
   !fromYujing.has('new_anchor'), 'new_anchor reachable from yujing');

const wOf = l => l.vol === 'high' ? 4 : l.vol === 'medium' ? 2 : 1;
const tw = SERVER.reduce((a, l) => a + wOf(l), 0);
const jw = SERVER.filter(l => JADE.includes(l.from) && JADE.includes(l.to)).reduce((a, l) => a + wOf(l), 0);
console.log('  Circuit share of npcPickLane weight: ' + (100 * jw / tw).toFixed(1) + '%');
ok('Circuit lanes can actually win an NPC spawn roll', jw > 0, String(jw));

console.log('');
console.log(`${pass} passed, ${fail} failed`);
failures.forEach(f => console.log('  - ' + f));
process.exit(fail ? 1 : 0);
