// ═══════════════════════════════════════════════════════════════════════════
// reach-depth-check.mjs
//
// THE BUG THIS EXISTS FOR: a zone opens at hive 100, reachWatch turns that into
// CL.front = 0.95, and every depth offset in stepField was a flat constant added
// to front. A tank stood at front+0.20 and reversed to y=1.15; wz(y)=(1-y)*D
// makes that negative z, behind our own baseline and on top of the camera. It
// did not stop there because nothing clamped it. The armour a player had just
// paid for drove out of the world and kept shooting from off screen.
//
// It is checked by RUNNING THE ARITHMETIC, not by matching the text around it.
// The expressions below are lifted out of client/assets/reach-battle.js by
// regex at load time and evaluated, so this fails when the formula changes and
// cannot pass on a comment that says the right thing. That distinction is the
// whole reason this file exists: two previous "verified" fixes in this codebase
// read correctly and were live.
//
// It also drives the collision hull and the detour steer, by extracting those
// functions whole and running units at rocks.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'client/assets/reach-battle.js'), 'utf8');

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; return; }
  fails.push(name + (detail ? '  ' + detail : ''));
};

// ── lift a function body out of the source by brace matching ───────────────
function fnSrc(name) {
  const i = SRC.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('function ' + name + ' not found in reach-battle.js');
  let d = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
function constSrc(re) {
  const m = re.exec(SRC);
  if (!m) throw new Error('constant not found: ' + re);
  return m[0];
}

// ── the field bounds and the room scaler, as shipped ───────────────────────
const bounds = constSrc(/const Y_LO = [\d.]+, Y_HI = [\d.]+;/);
const needH  = constSrc(/const DEPTH_NEED_HOME = [\d.]+;/);
const needK  = constSrc(/const DEPTH_NEED_HIVE = [\d.]+;/);
const env = {};
new Function('E', bounds + needH + needK + fnSrc('roomK')
  + ';E.Y_LO=Y_LO;E.Y_HI=Y_HI;E.roomK=roomK;'
  + 'E.NEED_HOME=DEPTH_NEED_HOME;E.NEED_HIVE=DEPTH_NEED_HIVE;')(env);
const { Y_LO, Y_HI, roomK } = env;

// ── the band and standoff expressions, as shipped ──────────────────────────
const loSrc    = constSrc(/const lo = Math\.max\(Y_LO[^\n]+/);
const hiSrc    = constSrc(/const hi = Math\.max\(Y_LO[^\n]+/);
const standSrc = constSrc(/const stand = front \+ dirH\*[^\n]+/);

const bandAt = new Function('front', 'rk', 'fwd', 'isTank', 'isEng', 'u', 'Y_LO', 'Y_HI',
  loSrc + hiSrc + 'return [lo,hi];');
const standAt = new Function('front', 'dirH', 'u', 'roomK',
  standSrc + 'return stand;');

/* THE MAPPING, LIFTED WHOLE. This used to lift the clamp EXPRESSION out of
   reachWatch, which worked only while the mapping was one inline line - and
   there were two copies of that line, in reachWatch and in the two second tick,
   so the expression this harness tested was not necessarily the one that ran.
   It is one function now and this drives that function, which is both simpler
   and the only version that can be trusted. */
const frontFn = (() => {
  const c = /const REACH_FRONT_LO = [\d.]+, REACH_FRONT_HI = [\d.]+;/.exec(SRC);
  const i = SRC.indexOf('function frontFor(');
  let d = 0; const start = SRC.indexOf('{', i);
  for (let k = start; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}' && --d === 0)
      return new Function(c[0] + SRC.slice(i, k + 1) + '; return frontFor;')();
  }
  throw new Error('frontFor not liftable');
})();
const frontOf = z => frontFn(z && z.hive);

// ── 1. the front range that can actually reach the renderer ────────────────
/* THE RANGE MOVED FROM 0.05-0.95 TO 0.20-0.80, and the reason is measured: at
   0.95 there is 0.03 of field behind the line, roomK scales 0.455 of offsets
   into it, and the entire home line stands in 0.011 of depth - seven hundred men
   in a stripe one percent deep. That is the huddle. At 0.80 it is 0.121. */
ok('a zone at hive 100 no longer pins the line against the wall',
   Math.abs(frontOf({ hive: 100 }) - 0.80) < 1e-9, '= ' + frontOf({ hive: 100 }));
/* Still monotonic and still a pure function of hive, which is what every camp,
   ownership test and the advance rule depend on. A front that never moves is a
   picture that has stopped reporting anything, which is why this is a RANGE and
   not a fixed midfield value. */
{
  let mono = true, prev = -1;
  for (let h = 0; h <= 100; h++) { const f = frontOf({ hive: h }); if (f < prev) mono = false; prev = f; }
  ok('the front is still monotonic in hive control', mono);
  ok('and still travels far enough to read who is winning',
     frontOf({ hive: 100 }) - frontOf({ hive: 0 }) >= 0.55,
     'travel ' + (frontOf({ hive: 100 }) - frontOf({ hive: 0 })).toFixed(2));
}
// This was 0.5, not 0.05: `(z.hive||50)` cannot distinguish a cleared zone from
// a missing field, so winning outright drew a line at midfield.
ok('a zone at hive 0 produces the bottom of the range, not the default',
   Math.abs(frontOf({ hive: 0 }) - 0.20) < 1e-9, '= ' + frontOf({ hive: 0 }));
ok('a zone with no hive field still falls back to the middle of the range',
   Math.abs(frontOf({}) - 0.5) < 1e-9, '= ' + frontOf({}));
/* ONE MAPPING, USED BY BOTH SITES. reachWatch set the front when an engagement
   opened and the tick set it again from live state, each with its own copy of
   the clamp - so a change to one was silently reverted by the other two seconds
   later, and the duplicate had been carrying the `||50` falsy bug since after it
   was fixed at the other site. */
ok('there is exactly one front mapping', (SRC.match(/CL\.front = frontFor\(/g) || []).length === 2
   && !/CL\.front = Math\.max\(0\.05/.test(SRC));
/* COUNTED IN CODE, NOT IN PROSE, for the sixth time in this codebase: the only
   remaining occurrence of that expression is the comment explaining why it is
   gone. A check that cannot tell a branch from a description of one forces the
   history out of the file to go green. */
{
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('and it does not use a falsy check on a numeric field', !/\(Z\.hive\|\|50\)/.test(code));
  ok('but it still records why not', /\(Z\.hive\|\|50\)/.test(SRC));
}

// ── 2. no band, on either side, ever leaves the field ──────────────────────
// Every hive percentage the server can hold, against every class that has its
// own offset, against both jade postures.
const CLASSES = [
  { cls: 'inf',    isTank: false, isEng: false },
  { cls: 'eng',    isTank: false, isEng: true  },
  { cls: 'tank',   isTank: true,  isEng: false },
  { cls: 'enf',    isTank: false, isEng: false },
  { cls: 'spit',   isTank: false, isEng: false },
  { cls: 'rush',   isTank: false, isEng: false },
];
let worstHome = -Infinity, worstHive = Infinity, worstAt = null;
for (let hive = 0; hive <= 100; hive++) {
  const front = frontOf({ hive });
  for (const side of [1, -1]) {
    const rk = roomK(side, front);
    for (const c of CLASSES) {
      for (const fwd of [0, 0.055, -0.055]) {
        const u = { side, cls: c.cls };
        const [lo, hi] = bandAt(front, rk, side === 1 ? fwd : 0, c.isTank, c.isEng, u, Y_LO, Y_HI);
        if (side === 1 && hi > worstHome) { worstHome = hi; worstAt = [hive, c.cls, fwd]; }
        if (side === -1 && lo < worstHive) { worstHive = lo; }
        ok('band stays on the field: hive ' + hive + ' side ' + side + ' ' + c.cls,
           lo >= Y_LO - 1e-9 && hi <= Y_HI + 1e-9 && lo <= hi,
           'lo=' + lo.toFixed(4) + ' hi=' + hi.toFixed(4));
      }
    }
  }
}
ok('the deepest home band tops out inside the field',
   worstHome <= Y_HI + 1e-9, 'max hi ' + worstHome.toFixed(4) + ' at ' + JSON.stringify(worstAt));
ok('the deepest hive band bottoms out inside the field',
   worstHive >= Y_LO - 1e-9, 'min lo ' + worstHive.toFixed(4));

// ── 3. the tank standoff, which is the one that was reversing ──────────────
// The regression, stated as the number it produced: front 0.95 used to give
// 1.15 unhit and 1.25 hit.
for (let hive = 0; hive <= 100; hive++) {
  const front = frontOf({ hive });
  for (const hitT of [0, 400]) {
    const s1 = standAt(front, 1, { side: 1, hitT }, roomK);
    ok('home tank standoff on field: hive ' + hive + (hitT ? ' hit' : ''),
       s1 >= Y_LO - 1e-9 && s1 <= Y_HI + 1e-9, 'stand=' + s1.toFixed(4));
    const s2 = standAt(front, -1, { side: -1, hitT }, roomK);
    ok('hive tank standoff on field: hive ' + hive + (hitT ? ' hit' : ''),
       s2 >= Y_LO - 1e-9 && s2 <= Y_HI + 1e-9, 'stand=' + s2.toFixed(4));
  }
}
{
  const front = frontOf({ hive: 100 });
  const s = standAt(front, 1, { side: 1, hitT: 0 }, roomK);
  ok('the opening-zone tank no longer stands past the baseline', s <= Y_HI,
     'was 1.1500, now ' + s.toFixed(4));
  // And it is still standing BEHIND the line rather than on the wrong side.
  ok('the opening-zone tank still stands on its own side of the line', s >= front,
     'stand=' + s.toFixed(4) + ' front=' + front.toFixed(4));
}

// ── 4. layering survives compression ───────────────────────────────────────
// The reason this scales instead of clamping: a clamp puts eng, tank and
// rifleman on the same y at the extreme and the line loses its shape.
{
  const front = frontOf({ hive: 96 });      // 0.95, the worst case
  const rk = roomK(1, front);
  const inf  = bandAt(front, rk, 0, false, false, { side: 1, cls: 'inf'  }, Y_LO, Y_HI);
  const tank = bandAt(front, rk, 0, true,  false, { side: 1, cls: 'tank' }, Y_LO, Y_HI);
  const eng  = bandAt(front, rk, 0, false, true,  { side: 1, cls: 'eng'  }, Y_LO, Y_HI);
  ok('a pinned line still puts the rifleman nearest the enemy', inf[0] < tank[0],
     'inf lo ' + inf[0].toFixed(5) + ' tank lo ' + tank[0].toFixed(5));
  ok('a pinned line still puts the engineer deepest', eng[1] > tank[1],
     'eng hi ' + eng[1].toFixed(5) + ' tank hi ' + tank[1].toFixed(5));
}

// ── 5. DEPTH_NEED has not drifted from the offsets it describes ────────────
// These two constants exist only to be the widest offset on each line. If
// somebody widens a band and not the constant, the scaling under-compresses
// and units leave the field again - the original bug, quietly restored.
{
  const nums = s => (s.match(/0\.\d+/g) || []).map(Number);
  const homeMax = Math.max(...nums(hiSrc.slice(hiSrc.indexOf('u.side===1 ?'), hiSrc.indexOf(' : '))));
  ok('DEPTH_NEED_HOME still covers the widest home offset plus the jade posture',
     env.NEED_HOME >= homeMax + 0.055 - 1e-9,
     'need ' + env.NEED_HOME + ' vs offset ' + homeMax + ' + 0.055');
  const hiveMax = Math.max(...nums(loSrc.slice(loSrc.lastIndexOf(' : '))));
  // 0.30 rather than the band's 0.22, because a struck tank's standoff is
  // measured off front on this side too and is the wider of the two.
  const standMax = Math.max(...(standSrc.match(/0\.\d+/g) || []).map(Number));
  ok('DEPTH_NEED_HIVE still covers the widest hive offset, standoff included',
     env.NEED_HIVE >= Math.max(hiveMax, standMax) - 1e-9,
     'need ' + env.NEED_HIVE + ' vs band ' + hiveMax + ' / standoff ' + standMax);
}

// ── 6. collision: the hull, the grid, and the detour ───────────────────────
// genTerrain and its callers are lifted whole so this drives the shipped
// geometry rather than a copy of it.
const terEnv = {};
new Function('E',
  fnSrc('mulberry32')
  + constSrc(/const TERRAIN_KIND = \{[\s\S]*?\n\};/)
  + constSrc(/const PASSABLE_KIND = \{[^}]*\};/)
  + constSrc(/const TGRID_N = \d+;/)
  + 'var terrain=[],slots=[],terCount=52,terGrid=null;'
  + 'var _T="dust"; function worldTerrain(){ return _T; }'
  + fnSrc('blocksMove') + fnSrc('buildTerGrid') + fnSrc('terCell')
  + fnSrc('pushOut') + fnSrc('avoidX') + fnSrc('genTerrain')
  + ';E.gen=function(t,s){_T=t;genTerrain(s);};'
  + 'E.get=function(){return {terrain:terrain,slots:slots,grid:terGrid};};'
  + 'E.only=function(i){terrain=[terrain[i]];buildTerGrid();};'
  + 'E.pushOut=pushOut;E.avoidX=avoidX;E.blocksMove=blocksMove;'
)(terEnv);

// Every terrain key the game can hand a battlefield, not just the one that
// happened to be open. The point of keying the rule on kind was that it covers
// all seven without a per-world table; this is that claim, tested.
const TERRAINS = ['dust', 'veins', 'rift', 'ice', 'station', 'tether', 'ocean'];
for (const t of TERRAINS) {
  terEnv.gen(t, 0x1234);
  const { terrain, grid } = terEnv.get();
  ok('terrain generates on ' + t, terrain.length === 52, terrain.length + ' features');
  const solid = terrain.filter(f => terEnv.blocksMove(f)).length;
  ok('every map has solid cover to collide with: ' + t, solid > 0,
     solid + ' of ' + terrain.length + ' block');
  ok('the collision grid is populated on ' + t,
     grid && grid.some(c => c.length > 0));

  // A unit dropped at the centre of every solid feature must end up outside it.
  let stuck = 0, moved = 0;
  for (const f of terrain) {
    if (!terEnv.blocksMove(f)) continue;
    const u = { x: f.cx, y: f.cy, alt: 0, cls: 'inf' };
    terEnv.pushOut(u);
    const rx = f.w * 0.5, ry = f.h * 0.5;
    const dx = (u.x - f.cx) / rx, dy = (u.y - f.cy) / ry;
    if (dx * dx + dy * dy < 1 - 1e-6) stuck++;
    else moved++;
  }
  ok('nothing is left inside a solid feature on ' + t, stuck === 0,
     stuck + ' stuck, ' + moved + ' cleared');

  // A crater is passable on purpose: it is the one feature you fight from
  // inside. Turning it solid would make the field's only shelter into a wall.
  const craters = terrain.filter(f => f.kind === 'crater');
  ok('craters stay passable on ' + t, craters.every(f => !terEnv.blocksMove(f)),
     craters.length + ' craters');
  // A chasm is what the generator's own comment calls impassable.
  const chasms = terrain.filter(f => f.kind === 'chasm');
  if (chasms.length)
    ok('chasms block on ' + t, chasms.every(f => terEnv.blocksMove(f)));

  // Cover has to survive collision. Every slot the generator placed must sit
  // outside the hull of its own feature, or a man can never reach the firing
  // position the rock exists to provide.
  const { slots } = terEnv.get();
  let unreachable = 0;
  for (const s of slots) {
    const f = terrain[s.f];
    if (!terEnv.blocksMove(f)) continue;
    const pad = 0.004;
    const rx = f.w * 0.5 + pad, ry = f.h * 0.5 + pad;
    const dx = (s.x - f.cx) / rx, dy = (s.y - f.cy) / ry;
    if (dx * dx + dy * dy < 1) unreachable++;
  }
  ok('every cover slot stays reachable through the hull on ' + t, unreachable === 0,
     unreachable + ' of ' + slots.length + ' slots inside their own feature');
}

// Air is not affected by ground.
{
  terEnv.gen('station', 0x1234);
  const { terrain } = terEnv.get();
  const f = terrain.find(x => terEnv.blocksMove(x));
  const u = { x: f.cx, y: f.cy, alt: 16, cls: 'heli' };
  terEnv.pushOut(u);
  ok('a gunship flies over solid cover', u.x === f.cx && u.y === f.cy);
}

// The detour steers to an edge rather than through the middle.
// Isolated to ONE feature on purpose. The first cut of this asserted that a man
// standing past a rock is not diverted by it, ran against all fifty two, and
// failed because a DIFFERENT rock in the same column was correctly diverting
// him. The assertion was wrong, not the code, and a test that cannot tell those
// apart is worse than no test.
{
  terEnv.gen('dust', 0x99);
  const all = terEnv.get().terrain;
  const fi = all.findIndex(x => terEnv.blocksMove(x) && x.w > 0.06
                             && x.cx > 0.2 && x.cx < 0.8 && x.cy > 0.3 && x.cy < 0.7);
  terEnv.only(fi);
  const f = terEnv.get().terrain[0];

  const u = { x: f.cx + f.w * 0.1, y: f.cy - 0.05, alt: 0, cls: 'inf' };
  const tx = terEnv.avoidX(u, f.cx, f.cy + 0.2);   // objective straight through it
  ok('a man walking into a rock is steered to its edge',
     Math.abs(tx - f.cx) >= f.w * 0.5, 'target ' + tx.toFixed(4) + ' cx ' + f.cx.toFixed(4));
  ok('he is steered to the edge he is already nearer',
     tx > f.cx, 'approached from +x, steered to ' + tx.toFixed(4));
  ok('the detour target stays on the field', tx >= 0.02 && tx <= 0.98);

  // Behind him is not his problem: a detour for ground already crossed is how
  // a line ends up walking sideways forever instead of forward.
  const back = { x: f.cx, y: f.cy + 0.30, alt: 0, cls: 'inf' };
  ok('a rock already passed does not divert anybody',
     terEnv.avoidX(back, 0.5, 0.99) === 0.5);

  // Nor is one far enough ahead that he has not committed to a line yet.
  const far = { x: f.cx, y: f.cy - 0.40, alt: 0, cls: 'inf' };
  ok('a rock still well ahead does not divert anybody yet',
     terEnv.avoidX(far, 0.5, 0.99) === 0.5);

  // A man standing still has no direction to be diverted in.
  const still = { x: f.cx, y: f.cy - 0.05, alt: 0, cls: 'inf' };
  ok('a stationary unit is not diverted',
     terEnv.avoidX(still, 0.42, still.y) === 0.42);
}

// ── 7. the shield line engages humans ──────────────────────────────────────
/* IT LOOKED FOR MELEE_CLS AND NOTHING ELSE, AND MELEE_CLS IS BROOD-ONLY:
   rush, brute, leap, grub, maw. A shield trooper facing enemy INFANTRY or an
   enemy SHIELD TROOPER found nothing, kept u.mel at -1, and fell into the hold
   branch - drifting sideways along the line past men it should have been
   bashing. Humans against humans, the shield line did not engage at all.

   AND THE HOLD BRANCH IS WHERE THE OTHER REPORT CAME FROM. It marched to
   `front+0.055`, a hardcoded home-side offset, so an away shield trooper walked
   ACROSS the front and stood in the home line. "Shield enemies seem to join the
   attacking line" was never a targeting fault: he was doing what he was told. */
{
  const bashSrc = (() => {
    const i = SRC.indexOf('function nearestBash(');
    let d = 0; const st = SRC.indexOf('{', i);
    for (let k = st; k < SRC.length; k++) {
      if (SRC[k] === '{') d++;
      else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1);
    }
    return '';
  })();
  ok('there is a bash target search', !!bashSrc);
  ok('the shield line no longer filters to brood classes only',
     !/if\(!v\|\|!MELEE_CLS\[v\.cls\]\|\|v\.dead>0\) continue;/.test(SRC));
  ok('and it marches to its OWN side of the front',
     /const hold=front\+\(u\.side===1\?1:-1\)\*0\.055;/.test(SRC));
  ok('and strikes in its own colours', /flash\(v\.x,v\.y,u\.side,1,0\)/.test(SRC));

  const env = {};
  const lift = n => { const i = SRC.indexOf('function ' + n + '('); let d = 0, j = SRC.indexOf('{', i);
    for (let k = j; k < SRC.length; k++){ if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1); } };
  const MEL = /const MELEE_CLS = \{[^}]*\};/.exec(SRC)[0];
  new Function('E', 'const TGT_COLS=32;var tgtIdx=[null,null];var units=[];' + MEL
    + lift('rebuildTargets') + bashSrc
    + 'E.set=u=>{units.length=0;for(const x of u.slice())units.push(x);rebuildTargets();};'
    + 'E.bash=nearestBash;E.units=()=>units;')(env);

  /* THE CASE THAT FOUND NOTHING BEFORE: two shield troopers, opposite sides,
     standing next to each other. */
  {
    const U = [{i:0,side:1,cls:'enf',x:0.50,y:0.50,dead:0,alt:0},
               {i:1,side:-1,cls:'enf',x:0.51,y:0.50,dead:0,alt:0},
               {i:2,side:1,cls:'enf',x:0.505,y:0.50,dead:0,alt:0}];
    env.set(U);
    const j = env.bash(U[0]);
    ok('a shield trooper engages an adjacent enemy shield trooper', j === 1, String(j));
    /* The old scan had no side test at all - safe only while every melee class
       was on one side by definition. */
    ok('and never the closer friendly', j !== 2);
  }
  /* A PREFERENCE, NOT A FILTER. A filter is what caused this bug; a shield is
     for stopping the thing that closes, so a charging class wins out to twice
     the range and a rifleman at arm's length is still bashed. */
  {
    const pick = (infD, rushD) => {
      const V = [{i:0,side:1,cls:'enf',x:0.5,y:0.5,dead:0,alt:0},
                 {i:1,side:-1,cls:'inf',x:0.5+infD,y:0.5,dead:0,alt:0},
                 {i:2,side:-1,cls:'rush',x:0.5+rushD,y:0.5,dead:0,alt:0}];
      env.set(V); const k = env.bash(V[0]);
      return k < 0 ? 'none' : env.units()[k].cls;
    };
    ok('a charging class outranks a rifleman inside twice the distance',
       pick(0.015, 0.020) === 'rush', pick(0.015, 0.020));
    ok('but a rifleman at arm\u2019s length is still bashed',
       pick(0.015, 0.040) === 'inf', pick(0.015, 0.040));
    ok('and one alone in reach is taken whatever it is',
       pick(0.015, 0.090) === 'inf');
  }
  {
    const W = [{i:0,side:1,cls:'enf',x:0.5,y:0.5,dead:0,alt:0},
               {i:1,side:-1,cls:'inf',x:0.8,y:0.5,dead:0,alt:0}];
    env.set(W);
    ok('nothing out of reach is a target', env.bash(W[0]) === -1);
    const A = [{i:0,side:1,cls:'enf',x:0.5,y:0.5,dead:0,alt:0},
               {i:1,side:-1,cls:'flyer',x:0.505,y:0.5,dead:0,alt:14}];
    env.set(A);
    ok('and nothing bashes an aircraft', env.bash(A[0]) === -1);
  }
  /* Thirty-four random draws out of seven hundred was the third instance of
     that pattern in this file; even with the class filter fixed it would have
     missed the man standing next to it most of the time. */
  {
    const U = [{i:0,side:1,cls:'enf',x:0.5,y:0.5,dead:0,alt:0}];
    for (let i = 1; i < 700; i++)
      U.push({i,side:1,cls:'inf',x:Math.random(),y:Math.random(),dead:0,alt:0});
    U.push({i:700,side:-1,cls:'enf',x:0.508,y:0.5,dead:0,alt:0});
    env.set(U);
    let found = 0;
    for (let t = 0; t < 200; t++) if (env.bash(U[0]) === 700) found++;
    ok('the one enemy in a crowd of seven hundred is found every time',
       found === 200, found + '/200');
  }
}

// ── report ─────────────────────────────────────────────────────────────────
if (fails.length) {
  for (const f of fails) console.log('  FAIL  ' + f);
  console.log('reach-depth: ' + pass + ' passed, ' + fails.length + ' failed.');
  process.exit(1);
}
console.log('reach-depth: ' + pass + ' passed, 0 failed.');
