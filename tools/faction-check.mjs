// ═══════════════════════════════════════════════════════════════════════════
// faction-check.mjs
//
// A FACTION USED TO LIVE IN FIVE PLACES. FAC_TINT and HULL_GRADE and AUG_RED in
// coalition-sprites.js, FAC in reach-battle.js, and a `fac === 'coal'` test in
// four separate branches. Nothing checked that any of them agreed, and the
// failure mode is specific and ugly: infantry draw as sprites near the camera
// and as wireframe past the size cutoff, so a tint table and a colour table that
// disagree make the SAME SOLDIER CHANGE FACTION as he walks away from you.
//
// It is one row now. This asserts the row is the only authority:
//
//   1. The id sets on the two sides of the seam are identical. server/factions.js
//      owns who is fighting; client/assets/factions.js owns what they look like.
//   2. The reach-battle fallback agrees with the registry, so it cannot rot into
//      a second authority the way the god panel's terrain table did.
//   3. Every row is COMPLETE. A missing field is how a faction ends up half
//      painted, and it will not throw - it will just draw the art as-is.
//   4. The roster primitive reproduces effJade EXACTLY across its whole input
//      range. This is the one that matters: if the new shape cannot say
//      everything the old scalar said, migrating onto it silently drops a fact
//      the GM has already set.
//   5. The recolour actually runs, on the real sheets, and produces the colours
//      the brief asked for. Driven rather than matched, because a table that
//      reads correctly is exactly what shipped last time.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as SF from '../server/factions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; return; }
  fails.push(name + (detail ? '  ' + detail : ''));
};

// ── load the client registry in a browser-shaped shim ──────────────────────
const win = {};
new Function('window', read('client/assets/factions.js'))(win);
const FAC = win.FM_FACTIONS;
const API = win.FM_FAC_API;
ok('the client registry loads', !!FAC && !!API);

// ── 1. the seam ────────────────────────────────────────────────────────────
{
  const c = Object.keys(FAC).sort().join(',');
  const s = SF.FACTION_IDS.slice().sort().join(',');
  ok('client and server agree on the faction id set', c === s, c + '  vs  ' + s);
  for (const id of SF.FACTION_IDS) {
    ok('server row ' + id + ' names itself consistently', SF.FACTIONS[id].id === id);
    ok('client row ' + id + ' carries the same display name',
       FAC[id].name === SF.FACTIONS[id].name,
       FAC[id].name + ' vs ' + SF.FACTIONS[id].name);
    ok('client row ' + id + ' carries the same short tag',
       FAC[id].short === SF.FACTIONS[id].short);
  }
  ok('exactly one faction is the brood',
     SF.FACTION_IDS.filter(f => SF.FACTIONS[f].brood).length === 1);
  ok('the three new factions are the playable ones',
     SF.FACTION_IDS.filter(f => SF.FACTIONS[f].playable).sort().join(',') === 'guild,synd,void');
}

// ── 2. the fallback has not drifted ────────────────────────────────────────
{
  const bs = read('client/assets/reach-battle.js');
  const i = bs.indexOf('var FAC_FALLBACK = {');
  ok('reach-battle keeps its fallback as a fallback', i > 0);
  const body = bs.slice(i, bs.indexOf('};', i));
  for (const m of body.matchAll(/(\w+):\s*\{\s*line:\[([\d,]+)\],\s*heavy:\[([\d,]+)\],\s*air:\[([\d,]+)\],\s*blade:\[([\d,]+)\]/g)) {
    const id = m[1], row = FAC[id];
    ok('the fallback for ' + id + ' exists in the registry', !!row);
    if (!row) continue;
    ok('fallback line colour for ' + id + ' matches the registry',
       row.line.join(',') === m[2], m[2] + ' vs ' + row.line.join(','));
    ok('fallback heavy colour for ' + id + ' matches', row.heavy.join(',') === m[3]);
    ok('fallback air colour for ' + id + ' matches',   row.air.join(',')   === m[4]);
    ok('fallback blade colour for ' + id + ' matches', row.blade.join(',') === m[5]);
  }
  // The old private tables must be gone, not merely unused.
  const cs = read('client/assets/coalition-sprites.js');
  ok('FAC_TINT is no longer a table', !/var FAC_TINT = \{/.test(cs));
  ok('HULL_GRADE is no longer a table', !/var HULL_GRADE = \{/.test(cs));
  ok('AUG_RED is no longer a table', !/var AUG_RED = \{/.test(cs));
  ok('SKIN_TONES is no longer a table in the sprite layer', !/var SKIN_TONES = \[/.test(cs));
  ok('reach-battle no longer owns a FAC table', !/^var FAC = \{/m.test(bs));
  /* And the four equality tests that were the real problem. COUNTED IN CODE,
     NOT IN PROSE: the first cut of this grepped the whole file and failed on
     five hits that were all inside comments explaining why the tests are gone.
     A check that cannot tell a branch from a description of a branch would have
     forced the history out of the file to go green, which is the opposite of
     what it is for. Comments are stripped first. */
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const coalTests = (strip(cs).match(/fac === 'coal'/g) || []).length;
  ok('the sprite layer no longer branches on one faction id in code', coalTests === 0,
     coalTests + ' remaining');
  ok('but it still explains why it used to', /fac === 'coal'/.test(cs));
  ok('skinOf no longer hardcodes a faction', !/u\.fac !== 'coal'\) return 0;/.test(bs)
     || /if\(!api\) return u\.fac === 'coal'/.test(bs));
}

// ── 3. every row is complete ───────────────────────────────────────────────
const FIELDS = ['name','short','tint','split','hull','skin','optic','opticOn','accent',
                'line','heavy','air','blade'];
for (const id of Object.keys(FAC)) {
  for (const f of FIELDS)
    ok('row ' + id + ' declares ' + f, f in FAC[id]);
  const r = FAC[id];
  ok('row ' + id + ' has a known skin policy', !!win.FM_SKIN_POLICY[r.skin], r.skin);
  ok('row ' + id + ' has a known optic policy',
     ['none','augmented','all'].indexOf(r.opticOn) >= 0, r.opticOn);
  // A faction that names an optic policy but has no optic, or the reverse, is
  // half a decision and will silently do nothing.
  ok('row ' + id + ' does not name an optic policy without an optic',
     (r.opticOn === 'none') === !r.optic);
  for (const c of ['line','heavy','air','blade'])
    ok('row ' + id + ' colour ' + c + ' is a triple in range', Array.isArray(r[c])
       && r[c].length === 3 && r[c].every(v => v >= 0 && v <= 255));
  // Wireframe colours are read at twenty pixels through haze. A row whose line
  // colour is too dark is invisible, which is the failure the Void row is most
  // at risk of and the reason its wireframe is violet rather than black.
  const lum = 0.299*r.line[0] + 0.587*r.line[1] + 0.114*r.line[2];
  ok('row ' + id + ' line colour is legible at field size', lum > 60, 'luma ' + lum.toFixed(0));
}
// The brief, as assertions. These are the design decisions, not implementation.
ok('the Void Collective wears steel rather than skin', FAC.void.skin === 'steel');
ok('the Void Collective marks both channels purple',
   !!FAC.void.optic && !!FAC.void.accent && FAC.void.optic.lit[2] > FAC.void.optic.lit[1]);
/* 'merc' rather than 'range': the whole human range PLUS the steel casing in
   one pool, so roughly one in seven is an android. A company that hires anyone
   hires machines too, and one pool expresses "occasionally" without a second
   mechanism. */
ok('the Syndicate is multiracial', FAC.synd.skin === 'merc');
ok('and occasionally fields an android',
   (win.FM_SKIN_POLICY.merc || []).indexOf(-1) >= 0);
/* MERCENARIES DO NOT HAVE A UNIFORM. Every other row is a polity that issues
   one; the Syndicate draws per soldier off his own index. */
ok('the Syndicate issues no uniform', Array.isArray(FAC.synd.kits) && FAC.synd.kits.length >= 4);
/* ── Who issues a uniform, and who does not ────────────────────────────────
   THE COALITION HAD KITS FOR ONE RELEASE AND GIVING THEM BACK IS THE POINT.
   The reasoning for them held - a treaty quartermaster issues one coat across
   nine colonies and gets nine batches - and the picture did not: five values of
   one hue read at field size as a line that is unevenly LIT rather than one with
   history, and the Coalition is the faction whose whole identity is being
   organised. Variation is the Syndicate's trait, and spending it on two
   factions spends it.

   So this asserts the KIND of thing each faction is, which is what the earlier
   version of this block got wrong by asserting a count. A faction that issues a
   uniform and one that does not are different kinds, and "one has a list of
   length one" would lose that - which is why the Coalition carries a plain
   `tint` rather than a single-entry `kits`. */
ok('the Syndicate is the only faction without a uniform',
   Object.keys(FAC).filter(f => (FAC[f].kits || []).length).join(',') === 'synd');
ok('and the Coalition issues one', !!FAC.coal.tint && !(FAC.coal.kits || []).length);
ok('the Syndicate has enough kits to not read as a pattern', FAC.synd.kits.length >= 4);
ok('and they span hues, since its men turned up in what they owned',
   new Set(FAC.synd.kits.map(k => (k.r > k.b ? 'warm' : k.b > k.r ? 'cool' : 'flat'))).size > 1);

/* GREEN GLASS OVER A BLUE MASS. At twenty pixels a faction is a colour mass and
   a couple of lit pixels; those two should not be doing the same job. */
ok('the Coalition visor is green, not red', FAC.coal.optic.lit[1] > FAC.coal.optic.lit[0]
   && FAC.coal.optic.lit[1] > FAC.coal.optic.lit[2]);
/* RED MEANS RED IS THE DOMINANT CHANNEL, not merely that it beats green. The
   first cut used `r > g + 40` and flagged the Void Collective, whose purple is
   186,104,246 - red does beat green by 82, and the highest channel is blue. A
   discriminator that cannot tell purple from red is not testing what it says. */
{
  const dominant = c => (c[0] >= c[1] && c[0] >= c[2]) ? 'r'
                      : (c[1] >= c[0] && c[1] >= c[2]) ? 'g' : 'b';
  ok('the Syndicate visor is red-dominant', dominant(FAC.synd.optic.lit) === 'r');
  const reds = Object.keys(FAC).filter(f => FAC[f].optic && dominant(FAC[f].optic.lit) === 'r');
  ok('and red is now the Syndicate\u2019s alone', reds.join(',') === 'synd', reds.join(','));
  /* Every faction that burns an optic burns a different dominant channel or a
     different hue within one, which is what makes two lit pixels readable at
     field size. */
  ok('no two factions burn the same colour',
     new Set(Object.keys(FAC).filter(f => FAC[f].optic)
       .map(f => FAC[f].optic.lit.join(','))).size
     === Object.keys(FAC).filter(f => FAC[f].optic).length);
}
/* The engineer's eye was a hardcoded red constant. Under a green faceplate that
   is one figure giving two answers to the same question. */
ok('the painted eye takes the faction optic rather than a constant',
   /function eyeColour\(fac\)/.test(read('client/assets/coalition-sprites.js'))
   && /burnEye\([^)]*eyeColour\(fac\)\)/.test(read('client/assets/coalition-sprites.js')));
/* THE VISOR IS THE ONE THING THE COMPANY ISSUES. No optic at all read as five
   unrelated men rather than one faction, because nothing in the frame said they
   were together. A mercenary company does not issue coats; it issues the thing
   that identifies you as being on the contract. The kit stays unmarked, which is
   now a contrast rather than just a gap. */
ok('the Syndicate issues a visor and nothing else',
   !!FAC.synd.optic && !FAC.synd.accent);
/* THE LOAD-BEARING HALF. The Coalition already burns red, so a shade alone does
   not separate them - two reds at twenty pixels are two reds. What separates
   them is WHICH CLASSES WEAR IT: the Coalition burns only its helmeted classes,
   so its assault trooper keeps his teal goggles, and the Syndicate's does not.
   That is a difference on the most numerous unit on the field. */
/* BOTH BURN EVERY CLASS NOW, so the distinction between them is carried by hue
   and by the coats, not by which classes are marked. The Coalition's gate was
   'augmented' while its optic was RED and meant augmentation - something lit
   behind the glass, which would have been a claim about the assault trooper, who
   has a face. Green means optics: issued kit, no claim about the man. The
   argument retired with the colour it was about, and the assault trooper is the
   most numerous unit on any line, so an optic he does not wear is an optic most
   of the army does not have. */
ok('every class wears its faction optic', FAC.synd.opticOn === 'all'
   && FAC.coal.opticOn === 'all');
{
  const lum = p => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  /* Measured, not eyeballed. It has to clear every coat underneath it and be as
     far from the Coalition's red as a red can be while still doing that. */
  ok('the Syndicate visor separates from its own coats',
     lum(FAC.synd.optic.lit) > 96, 'luma ' + lum(FAC.synd.optic.lit).toFixed(0));
  ok('and does not read as the Coalition\u2019s red',
     d(FAC.synd.optic.lit, FAC.coal.optic.lit) > 25,
     'distance ' + d(FAC.synd.optic.lit, FAC.coal.optic.lit).toFixed(0));
}
/* Was: the Syndicate keeps the visor as drawn. It does not any more - see the
   block above for why the absence stopped working as a design. */
ok('the Syndicate no longer keeps the visor as drawn', FAC.synd.optic !== null);
ok('the Merchant Guild fields the darker half of the range', FAC.guild.skin === 'dark');
ok('the Merchant Guild visor is blue',
   !!FAC.guild.optic && FAC.guild.optic.lit[2] > FAC.guild.optic.lit[0]);
ok('desert camo is two grades, not one', !!FAC.guild.split);
/* Was: the Coalition burns only its helmeted classes. That gate existed because
   the optic was RED and meant augmentation, which would have been a claim about
   the assault trooper's face. Green means optics - issued kit - so it burns
   every class, and the trooper is the most numerous unit on any line. */
ok('the Coalition burns every class now that its optic is green',
   FAC.coal.opticOn === 'all' && FAC.coal.optic.lit[1] > FAC.coal.optic.lit[0]);
/* The assault trooper is the whole reason that gate mattered, so he is asserted
   by name rather than left to the policy string. */
ok('which means the assault trooper wears one at last',
   ['all'].indexOf(FAC.coal.opticOn) >= 0);
ok('Jade still wears the art as drawn', FAC.jade.tint === null && FAC.jade.skin === 'none');

// ── 3b. the grade is DRIVEN on the pack's real colours ─────────────────────
/* THE TWO BUGS THIS CAUGHT, both invisible to a code read and both in tables
   that described themselves correctly:

   The Void Collective's first grade was 0.44/0.46/0.55 with a lift of 0.17. Dark,
   as asked. Also FLAT: driven against the pack's six real uniform colours it
   produced a luminance spread of 23 against Jade's 61, because a heavy lift on a
   small multiplier compresses the range rather than moving it. A figure whose
   shading spans 23 values has no readable limbs at twenty pixels.

   The Merchant Guild's camo break was `at: 96`, which looks like a midpoint of
   0-255 and is outside the art entirely: the pack's uniforms span 28 to 89, so
   every uniform pixel took the split grade and the base grade never ran. A flat
   brown that the table called camouflage.

   So the grade is applied here rather than inspected. UNIFORM is measured off
   the troop sheets - the six colours that are actually a coat. */
{
  const UNIFORM = [[25,30,24],[32,48,31],[60,73,51],[77,99,68],[41,43,40],[84,84,86]];
  const lum = p => 0.299*p[0] + 0.587*p[1] + 0.114*p[2];
  const srcSpread = Math.max(...UNIFORM.map(lum)) - Math.min(...UNIFORM.map(lum));
  ok('the pack colours used here still span a real range', srcSpread > 55,
     'spread ' + srcSpread.toFixed(0));

  for (const id of Object.keys(FAC)) {
    const row = FAC[id];
    if (id === 'khai') continue;                 // graded per creature, not per uniform
    /* A faction with kits is graded by whichever one the soldier turned up in,
       so the spread is checked across ALL of them: one bad kit in five would
       otherwise hide behind four good ones. */
    const grades = (row.kits && row.kits.length) ? row.kits : [row.tint];
    for (const gr of grades) {
    const out = UNIFORM.map(px => {
      if (!gr) return px;
      let l = lum(px);
      const tt = (row.split && l < row.split.at) ? row.split : gr;
      if (tt.lift) l = l + (255 - l) * tt.lift;
      let r = l*tt.r, g = l*tt.g, b = l*tt.b;
      if (tt.keep) { r += (px[0]-r)*tt.keep; g += (px[1]-g)*tt.keep; b += (px[2]-b)*tt.keep; }
      return [Math.min(255,r)|0, Math.min(255,g)|0, Math.min(255,b)|0];
    });
    const L = out.map(lum);
    const spread = Math.max(...L) - Math.min(...L);
    /* 34 is the floor, not a target. Below it the internal shading stops
       separating a limb from a torso at field size, which is the failure the
       whole pack is graded around. */
    ok('a graded ' + id + ' uniform keeps its shading', spread >= 34,
       'spread ' + spread.toFixed(0) + ' vs source ' + srcSpread.toFixed(0));
    ok('a graded ' + id + ' uniform does not blow out', Math.max(...L) <= 210,
       'max luma ' + Math.max(...L).toFixed(0));
    ok('a graded ' + id + ' uniform does not crush to black', Math.min(...L) >= 14,
       'min luma ' + Math.min(...L).toFixed(0));
    }
    /* A split that never fires is a table lying about what it does. Both grades
       have to be reachable within the art's own range. */
    if (row.split) {
      const below = UNIFORM.filter(px => lum(px) < row.split.at).length;
      ok('the ' + id + ' camo break sits inside the pack range', below > 0 && below < UNIFORM.length,
         below + ' of ' + UNIFORM.length + ' below the break');
    }
  }
  /* The factions have to be distinguishable FROM EACH OTHER, which no single
     row can assert about itself. Compared on the mid uniform value, the one
     that carries most of a figure at distance. */
  const mid = {};
  for (const id of Object.keys(FAC)) {
    const row = FAC[id];
    if (!row.tint) { mid[id] = UNIFORM[2]; continue; }
    let l = lum(UNIFORM[2]);
    const tt = (row.split && l < row.split.at) ? row.split : row.tint;
    if (tt.lift) l = l + (255 - l) * tt.lift;
    mid[id] = [Math.min(255,l*tt.r)|0, Math.min(255,l*tt.g)|0, Math.min(255,l*tt.b)|0];
  }
  const ids = Object.keys(FAC).filter(f => f !== 'khai');
  for (let a = 0; a < ids.length; a++)
    for (let b = a+1; b < ids.length; b++) {
      const d = Math.hypot(mid[ids[a]][0]-mid[ids[b]][0],
                           mid[ids[a]][1]-mid[ids[b]][1],
                           mid[ids[a]][2]-mid[ids[b]][2]);
      ok(ids[a] + ' and ' + ids[b] + ' are not the same uniform', d > 18,
         'distance ' + d.toFixed(1) + ' ' + mid[ids[a]] + ' vs ' + mid[ids[b]]);
    }
}

// ── 4. skin policy actually resolves ───────────────────────────────────────
for (const id of Object.keys(FAC)) {
  const pool = API.skinTones(id);
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const t = API.skinFor(id, i);
    if (t === null) { ok('policy none returns no tone for ' + id, pool.length === 0); break; }
    ok('tone for ' + id + ' at index ' + i + ' is in policy', pool.indexOf(t) >= 0);
    ok('tone for ' + id + ' at index ' + i + ' resolves to a pair',
       Array.isArray(API.toneAt(t)) && API.toneAt(t).length === 2);
    seen.add(t);
  }
  if (pool.length) {
    ok('every tone in ' + id + "'s policy is actually reachable", seen.size === pool.length,
       seen.size + ' of ' + pool.length);
    // Fixed for his life: the same index must always give the same tone.
    ok('a soldier of ' + id + ' does not change tone', API.skinFor(id, 41) === API.skinFor(id, 41));
    // And consecutive soldiers must not band along a fireteam.
    /* WHAT "DOES NOT BAND" MEANS CHANGED WITH THE SPREAD, AND THE OLD NUMBER
       WAS MEASURING THE OLD MECHANISM. skinFor used to be a stride, which by
       construction never repeats consecutively while the multiplier is coprime
       with the pool - so "under 40 adjacent repeats in 200" was really asserting
       "this is a stride", and any hash fails it. A hash gives random-like
       adjacency: 1-in-4 for the Guild's four tones is about 50 in 200, which is
       correct and not banding.
       Banding is a RUN, so the run is what is measured. Plus evenness, because
       a hash that spread badly would pass a run test by being uniformly wrong. */
    let run = 1, worst = 1;
    const hist = {};
    for (let i = 0; i < 600; i++) {
      const t = API.skinFor(id, i);
      hist[t] = (hist[t] || 0) + 1;
      if (i && t === API.skinFor(id, i - 1)) { run++; if (run > worst) worst = run; }
      else run = 1;
    }
    ok('a fireteam of ' + id + ' does not band', pool.length === 1 || worst <= 4,
       'longest run ' + worst);
    const want = 600 / pool.length;
    const off = Math.max(...pool.map(t => Math.abs((hist[t] || 0) - want) / want));
    ok('and every tone of ' + id + ' turns up about as often as the rest',
       pool.length === 1 || off < 0.35, 'worst bucket off by ' + (off * 100).toFixed(0) + '%');
  }
}

// ── 5. the roster reproduces effJade exactly ───────────────────────────────
// The live function, lifted rather than reimplemented.
const rs = read('server/reach.js');
const effSrc = rs.slice(rs.indexOf('export function effJade'));
const effBody = effSrc.slice(0, effSrc.indexOf('\n}') + 2).replace('export ', '');
const jmin = /export const JADE_MIN = ([\d.]+);/.exec(rs);
ok('reach.js still declares a Jade floor', !!jmin);
const effJade = new Function('JADE_MIN', effBody + '; return effJade;')(Number(jmin[1]));
// The bridge duplicates the floor rather than importing the war layer. That is
// the right dependency direction and the wrong thing to leave unchecked.
ok('the roster bridge floor matches reach.js', SF.REACH_JADE_MIN === Number(jmin[1]),
   SF.REACH_JADE_MIN + ' vs ' + jmin[1]);
{
  let worst = 0;
  for (const coalIn of [0, 1]) {
    for (let p = 0; p <= 100; p++) {
      const frac = p / 100;
      const want = effJade({ coalIn }, { jade: frac });
      const got = SF.jadeShareOf(SF.rosterFromReach(coalIn, frac, 1));
      const d = Math.abs(want - got);
      if (d > worst) worst = d;
      ok('roster reproduces effJade: coalIn ' + coalIn + ' jade ' + p,
         d < 1e-9, 'want ' + want + ' got ' + got);
    }
  }
  ok('the round trip is exact, not merely close', worst < 1e-9, 'worst delta ' + worst);
  // Before the declaration there is no Coalition on the ground AT ALL, and the
  // roster has to say that by absence rather than by a zero weight: a zero-weight
  // entry would still put the Coalition in the belligerent list.
  const pre = SF.rosterFromReach(0, 0.4, 1);
  ok('an undeclared Coalition is absent from the roster, not present at zero',
     !SF.inFight(pre, 'coal'));
  ok('the Circuit alone holds the whole line before the declaration',
     SF.majorityOf(pre, 'home') === 'jade' && SF.jadeShareOf(pre) === 1);
  const post = SF.rosterFromReach(1, 0.4, 1);
  ok('a declared Coalition is in the fight', SF.inFight(post, 'coal'));
  ok('the majority of a 40% Jade line is the Coalition',
     SF.majorityOf(post, 'home') === 'coal');
  ok('the brood is always the away side', SF.majorityOf(post, 'away') === 'khai');
  // Weights normalise, so a GM never has to make them add up.
  const r3 = SF.setSide(SF.blankRoster(), 'home',
    [{fac:'void',weight:3},{fac:'synd',weight:1}]);
  const sh = SF.sideOf(r3, 'home');
  ok('three-to-one weights normalise to three quarters',
     Math.abs(sh[0].share - 0.75) < 1e-9 && sh[0].fac === 'void', JSON.stringify(sh));
  ok('a side is ordered heaviest first', sh[0].share >= sh[1].share);
  // Garbage in must not produce a phantom belligerent.
  const bad = SF.setSide(SF.blankRoster(), 'home',
    [{fac:'nope',weight:5},{fac:'void',weight:0},{fac:'guild',weight:2}]);
  ok('an unknown faction is dropped from a roster',
     SF.sideOf(bad,'home').every(e => e.fac !== 'nope'));
  ok('a zero weight is not a belligerent', !SF.inFight(bad, 'void'));
  ok('the survivor takes the whole side',
     Math.abs(SF.sideOf(bad,'home')[0].share - 1) < 1e-9);
  ok('an empty side has no majority rather than a default',
     SF.majorityOf(SF.blankRoster(), 'home') === null);
}

// ── 6. the recolour, driven on the real sheets ─────────────────────────────
// The pack's accent colours are asserted to still BE in the art. If a sheet is
// ever re-exported with a shifted palette, every remap in this pass silently
// stops matching and every faction quietly loses its visor.
{
  const OPT = win.FM_OPTIC_SRC, ACC = win.FM_ACCENT_SRC;
  /* THE SHIELD PANEL IS AN OPTIC, NOT AN ACCENT. The shielded enforcer's
     faceplate and the panel on the shield he holds up in front of it are the
     same equipment doing the same job. Split across two channels, a Coalition
     trooper burned his faceplate red and kept a factory blue panel a hand's
     width in front of it. Accent is now exactly what it says: markings on kit. */
  ok('three optic sources are declared', OPT.length === 3);
  ok('one accent source is declared', ACC.length === 1);
  ok('the shield panel moved to the optic channel',
     OPT.some(o => o.lit.join(',') === '51,81,111'));
  ok('and is no longer an accent',
     !ACC.some(a => a.lit.join(',') === '51,81,111'));
  ok('the accent that remains is the wrist device',
     ACC[0].lit.join(',') === '100,138,194');
  const all = OPT.concat(ACC);
  for (const a of all)
    for (const b of all)
      if (a !== b) ok('accent sources do not collide',
        a.lit.join(',') !== b.lit.join(',') && a.dim.join(',') !== b.dim.join(','));
  // Skin must never be an accent source, or a face would be remapped as kit.
  const skinKeys = win.FM_SKIN_TONES[0].map(t => t.join(','))
    .concat(win.FM_STEEL_TONE.map(t => t.join(',')));
  for (const a of all)
    ok('no accent source collides with skin',
       skinKeys.indexOf(a.lit.join(',')) < 0 && skinKeys.indexOf(a.dim.join(',')) < 0);

  const dir = 'client/assets/space/troops';
  if (fs.existsSync(path.join(ROOT, dir))) {
    const sheets = fs.readdirSync(path.join(ROOT, dir));
    ok('the troop pack is present', sheets.length > 0);
    // Which sheets each source is expected on. Measured; see factions.js.
    ok('the enforcer sheets exist for the faceplate remap',
       sheets.some(f => f.startsWith('enforcer_shielded')));
    ok('the engineer sheets exist for the wrist remap',
       sheets.some(f => f.startsWith('engineer_')));
    ok('the assault sheets exist for the goggle remap',
       sheets.some(f => f.startsWith('assault_')));
  }
}

// ── 7. the tab is wired to a model the field actually reads ────────────────
/* THE ASSERTION THIS FILE EXISTS FOR, THE SECOND TIME. Last patch the roster
   shipped with nothing reading it and no tab, deliberately. This patch both
   landed, and the failure mode to guard is the one the god panel's own comment
   names: a control that writes state nothing consults. So every link in the
   chain is asserted, end to end - button, command, handler, model, field. */
{
  const gp = read('client/assets/god-panel.js');
  const ix = read('client/index.html');
  const sv = read('server/server.js');
  const rj = read('server/reach.js');
  const rb = read('client/assets/reach-battle.js');

  ok('there is a War Controls tab button', /data-tab="war"/.test(ix));
  ok('and a pane for it to render into', /id="godTab-war"/.test(ix)
     && /id="war-worlds"/.test(ix));
  ok('and godTab knows how to open it', /if \(tab === 'war'\) \{/.test(gp));
  ok('it renders from the same payload as the Reach tab, not a second fetch',
     /window\.warRender\(d\)/.test(gp) && !/cmd:'war_get'/.test(gp));

  for (const cmd of ['war_roster', 'war_roster_clear', 'war_forward']) {
    ok('the panel sends ' + cmd, new RegExp("cmd:'" + cmd + "'").test(gp));
    ok('and the server handles ' + cmd, new RegExp("cmd === '" + cmd + "'").test(sv));
  }
  ok('a roster change broadcasts, so open battlefields restock from the new mix',
     /cmd === 'war_roster'\)[\s\S]{0,900}?broadcast\(\{ type:'reach_state'/.test(sv));

  ok('the server exposes the roster commands', /export function setRoster/.test(rj)
     && /export function clearRoster/.test(rj) && /export function setForward/.test(rj));
  ok('and refuses an empty side', /A side needs at least one faction/.test(rj));
  ok('the roster ships on every world, composed or not', /roster: FX\.rosterWire\(rosterOf\(s, w\)\)/.test(rj));
  ok('and says which mode the world is in', /composed: w\.roster \? 1 : 0/.test(rj));
  /* PRESENCE IS THE SWITCH AND NOTHING WAS MIGRATED. w.jade is persisted state
     on a database seventy versions behind a deploy; rewriting it is a restore
     from backup when it goes wrong, not a patch. */
  ok('a world with no roster derives one rather than storing one',
     /if \(w && w\.roster\) return w\.roster;/.test(rj)
     && /return FX\.rosterFromReach/.test(rj));
  ok('effJade answers from a composed roster when there is one',
     /if \(w && w\.roster\) return FX\.jadeShareOf\(w\.roster\);/.test(rj));
  ok('reverting deletes rather than rewrites', /delete w\.roster;/.test(rj));

  /* THE FIELD END. A tab writing to a model the battlefield does not sample is
     the exact thing that was deferred last patch. */
  ok('the battlefield samples the roster for every unit it spawns',
     /function pickFac\(side, rnd\)/.test(rb)
     && /const fac = pickFac\(side, rnd\);/.test(rb)
     && /u\.fac = pickFac\(1, rnd\);/.test(rb));
  ok('and it ingests the roster off the payload', /world\.roster && world\.roster\.home/.test(rb));
  ok('an away polity draws infantry rather than creatures',
     /function awayClass\(rnd, fac\)/.test(rb));
  ok('and the brood test names the faction, not the side',
     /BROOD_SPRITE\[u\.cls\] && isBroodFac\(u\.fac\)/.test(rb));
  ok('no spawn path still splits a line with a scalar',
     !/rnd\(\) < jadeFrac \? 'jade' : 'coal'/.test(rb));
}

// ── 8. the bench renders the game, not the fallback ────────────────────────
/* THE FAILURE THIS GUARDS IS SILENT AND IT ALREADY HAPPENED ONCE. battle-test
   did not load factions.js, and both consumers hold a fallback for the frame
   before the registry arrives - so the bench rendered three factions instead of
   six, the pre-registry skin path and no accent remap at all, while looking
   entirely fine. A missing script tag is a quieter version of the bench
   embedding its own copy of the renderer, which is the one thing that file has
   warned against since it shipped.

   Also asserted: the fake payload carries every field the wire carries. The
   bench's own header has warned about this since it was written, and roster is
   exactly the kind of field that gets added to the server and forgotten here. */
{
  const bt = read('client/battle-test.html');

  ok('the bench loads the faction registry', /<script src="assets\/factions\.js"><\/script>/.test(bt));
  ok('and loads it BEFORE the modules that fall back without it',
     bt.indexOf('<script src="assets/factions.js">')
     < bt.indexOf('<script src="assets/coalition-sprites.js">')
     && bt.indexOf('<script src="assets/coalition-sprites.js">')
     < bt.indexOf('<script src="assets/reach-battle.js">'));
  ok('and still embeds no copy of the registry', !/window\.FM_FACTIONS = \{/.test(bt));
  ok('it warns when only the fallback is present', /FALLBACK ONLY/.test(bt));

  ok('the fake payload ships a roster, as the wire does', /roster:\{ home:/.test(bt));
  ok('and the entry gate flag the roster is derived from', /coalIn:0/.test(bt));
  ok('the roster is written in the wire shape, not a bench shape',
     /w\.roster = \{ home:home, away:away, fwd:fwd \};/.test(bt));
  /* A bench-only entry point into the faction model would be a second path that
     nothing else exercises. Composing a line here goes through the payload. */
  ok('the bench has no private hook into the faction model',
     !/reachJade\(/.test(bt) && !/pickFac\(/.test(bt) && !/ROSTER\s*=/.test(bt));
  ok('and it does not reseed to apply a line, as the game does not',
     !/function applyRoster[\s\S]{0,600}?reopen\(\)/.test(bt));

  /* Every faction has to be reachable from the editor, or the bench is a bench
     for whichever subset somebody typed out by hand. */
  ok('the editor enumerates the registry rather than a hand-written list',
     /function facIds\(\)/.test(bt) && /Object\.keys\(window\.FM_FACTIONS\)/.test(bt));
  for (const id of Object.keys(FAC))
    ok('the bench fallback list still covers ' + id,
       new RegExp("'" + id + "'").test(bt));

  /* The case the whole faction pass was for: two polities, no brood anywhere.
     Before awayClass routed on faction every Guild soldier here would have been
     a crawling horror, so a preset that produces it is the regression test a
     human can see. */
  ok('there is a polity-versus-polity preset', /vg:\s*\{ home:\[\{fac:'void'/.test(bt)
     && /away:\[\{fac:'guild'/.test(bt));
  ok('and a multi-faction home line', /three:\s*\{/.test(bt));

  /* The readouts for the two invisible bugs. Both should sit at zero, and both
     exist because the failure they cover for cannot be seen on screen: a tank
     that reversed off the map is off the map. */
  ok('the bench reports units off the field', /_fmReachDebug[\s\S]{0,80}?depth/.test(bt)
     || /D\.depth\(\)/.test(bt));
  ok('and units standing inside terrain', /D\.stuck\(\)/.test(bt));
  const rb2 = read('client/assets/reach-battle.js');
  ok('the renderer exposes both hooks', /  stuck: function\(\)/.test(rb2)
     && /  depth: function\(\)/.test(rb2));

  /* A label table that is a subset of the class table is a readout that lies by
     omission: a field full of brutes and leapers read as "no contact". */
  const ladder = ['inf','enf','eng','turret','tank','heli','spit','rush',
                  'brute','leap','grub','maw','flyer','wing'];
  for (const c of ladder)
    ok('the field readout can name ' + c, new RegExp('\\b' + c + ':').test(bt));
}

// ── 9. the bench reads keys the hooks actually return ──────────────────────
/* A READOUT THAT NAMES A KEY NOTHING RETURNS SHOWS A DASH, and a dash reads as
   "nothing is happening" rather than as "this is broken". The first cut of the
   AI panel guessed `exactlyNearest` against a hook returning `exactNearest`,
   with a fallback chain that made it fail silently in exactly that way.

   So the bench's reads are checked against the hooks' own return literals. This
   is the same class of assertion as the pricing mirror: two files that have to
   agree, with nothing but attention holding them together otherwise. */
{
  const bt = read('client/battle-test.html');
  const rb = read('client/assets/reach-battle.js');
  const dbg = rb.slice(rb.indexOf('window._fmReachDebug = {'));
  const dbgBody = dbg.slice(0, dbg.indexOf('\n};'));

  const hooks = ['tempo','pause','step','field','slots','terrain','states',
                 'aimQuality','nades','built','forceCoalClass','forceAwayClass',
                 'counts','facMix','camps','campsHeld','stuck','depth'];
  for (const h of hooks)
    ok('the renderer exposes ' + h, new RegExp('^  ' + h + ':', 'm').test(dbgBody));
  /* Two keys of the same name in one object literal is not an error in any
     mode: the later one silently replaces the earlier. That happened here once
     and a richer counts() was dead for six versions before anyone noticed. */
  const keys = [...dbgBody.matchAll(/^  ([a-zA-Z]+):/gm)].map(m => m[1]);
  ok('no debug hook is shadowed by a duplicate key',
     new Set(keys).size === keys.length,
     keys.filter((k, i) => keys.indexOf(k) !== i).join(','));

  // Every key the bench reads off aimQuality must be one it returns.
  const aq = dbgBody.slice(dbgBody.indexOf('  aimQuality:'));
  const aqRet = aq.slice(aq.indexOf('return {'), aq.indexOf('},'));
  for (const k of ['exactNearest','meanDistanceRatio','overThreeTimesTooFar'])
    ok('aimQuality returns ' + k, new RegExp(k + ':').test(aqRet));
  for (const m of bt.matchAll(/\bq\.([a-zA-Z]+)/g))
    ok('the bench reads an aimQuality key that exists: ' + m[1],
       new RegExp(m[1] + ':').test(aqRet));

  // Same for field(), which is the AI panel's main source.
  const fl = dbgBody.slice(dbgBody.indexOf('  field:'));
  const flRet = fl.slice(fl.indexOf('return {'), fl.indexOf('\n  },'));
  /* Scoped to `fld.`, which the bench uses for nothing else. The first cut
     scanned for `f.` and matched the fob local three functions up, so it
     demanded that field() return `type`, `length` and `toUpperCase`. A check
     that cannot tell two scopes apart fails on correct code, which is the worst
     kind: the pressure is to delete it. */
  for (const m of bt.matchAll(/\bfld\.([a-zA-Z]+)/g))
    ok('the bench reads a field() key that exists: ' + m[1],
       new RegExp(m[1] + ':').test(flRet), m[1]);

  ok('kills is documented as cumulative, since it reads as per-frame otherwise',
     /CUMULATIVE SINCE THE MODULE LOADED/.test(rb));
  ok('and the bench differences it rather than showing it as a rate',
     /fld\.kills - _kPrev/.test(bt));

  /* Pause holds the SIM and not the camera. A frozen field you cannot orbit is
     a screenshot, and orbiting a held exchange is most of the value. */
  ok('pause holds the simulation, not the camera',
     /if \(!_rbHold \|\| _rbStep > 0\)\{[\s\S]{0,200}?stepField\(dt\);[\s\S]{0,40}?\}\s*\n\s*stepCam\(dt\); draw\(\);/.test(rb));
  ok('and nothing in the client can set the hold flag',
     !/_rbHold\s*=/.test(read('client/assets/god-panel.js')));
  ok('the bench can slow the simulation', /D\(\)\.tempo\(t\)/.test(bt));
  ok('and isolate a class on either side',
     /D\(\)\.forceCoalClass\(c\)/.test(bt) && /D\(\)\.forceAwayClass\(c\)/.test(bt));
}

// ── 10. the bench cannot silently show a build without factions ────────────
/* THE SCREENSHOT THAT PROMPTED THIS. Opened from a file:// URL, the bench drew
   turquoise Hounds and five identical uniforms - which is what the game looked
   like BEFORE the faction pass, and is why it kept reading as outdated.

   Nothing was stale. tinted() reads the sheet back with getImageData to remap
   skin, optics and accents by exact palette value; a canvas holding an image
   loaded from file:// is tainted, getImageData throws, and the catch returns the
   raw image. That catch is CORRECT for the game - a tint that throws must not
   lose the figure - and it is indistinguishable on screen from a build that has
   no factions in it.

   This is the third silent-degradation failure in this bench in three patches:
   a missing script tag, a mis-spelled hook key, and now a tainted canvas. All
   three rendered something plausible instead of an error. So the assertion is
   about the SHOUTING, not about the recolour. */
{
  const bt = read('client/battle-test.html');
  const cs = read('client/assets/coalition-sprites.js');

  ok('tinted still fails soft in the game, which is why the bench must shout',
     /catch \(e\) \{ return im; \}/.test(cs));
  ok('and tinted is reachable for the bench to probe', /tinted: tinted/.test(cs));

  ok('the bench probes whether the recolour actually ran',
     /FMTroops\.tinted\(probe, 'void', 0\)/.test(bt)
     && /FMTroops\.tinted\(probe, 'guild', 0\)/.test(bt));
  /* PROBED FUNCTIONALLY, NOT BY SNIFFING THE PROTOCOL. location.protocol would
     be a proxy for the thing that matters and wrong in both directions: local
     file access can be enabled, and a misconfigured host can taint over http. */
  /* COUNTED IN CODE, NOT IN PROSE - for the third time in this file. The only
     occurrence of location.protocol in the bench is the comment explaining why
     it is NOT used, and a check that cannot tell a branch from a description of
     one forces the history out of the file to go green. Comments stripped. */
  const noComments = bt.replace(/<!--[\s\S]*?-->/g, '')
                       .replace(/\/\*[\s\S]*?\*\//g, '')
                       .replace(/^\s*\/\/.*$/gm, '');
  ok('and it does not sniff the protocol instead', !/location\.protocol/.test(noComments));
  ok('but it still explains why not', /location\.protocol/.test(bt));
  /* Two factions whose kit could not look more different must hand back two
     different objects. Both were chosen because neither can take tinted's early
     "nothing to do" return: both carry a tint, a skin policy and an optic. */
  for (const f of ['void', 'guild']) {
    ok('the probe faction ' + f + ' has a tint', !!FAC[f].tint);
    ok('the probe faction ' + f + ' has a skin policy', FAC[f].skin !== 'none');
    ok('the probe faction ' + f + ' burns an optic', !!FAC[f].optic);
  }
  ok('the probe compares object identity, which is what a failed tint returns',
     /a !== b/.test(bt));

  ok('a blocked recolour raises a banner, not a status row alone',
     /id="taint"/.test(bt) && /taint'\)\.style\.display = 'block'/.test(bt));
  ok('and the banner names the fix rather than only the fault',
     /battle-test\.html/.test(bt) && /localhost/.test(bt));
  /* THE REAL PORT, NOT A PLACEHOLDER, and mirrored rather than trusted. A
     banner telling someone to go and find out which port would be one step more
     than most people take when they are already being told something is broken.
     Same mirror discipline as the pricing block against reach.js. */
  const srvPort = (read('server/server.js').match(/const PORT\s+= process\.env\.PORT \|\| (\d+);/) || [])[1];
  ok('server.js still declares a default port', !!srvPort);
  ok('the banner quotes the port the server actually defaults to',
     srvPort && new RegExp('BENCH_PORT = ' + srvPort + ';').test(bt),
     'server ' + srvPort);
  ok('and the client is still served at the root, so that path resolves',
     /app\.use\('\/',express\.static\(path\.join\(__dirname,'\.\.','client'/.test(read('server/server.js')));
  ok('the banner points at the launcher, not just at an address',
     /start_server\.bat/.test(bt));
  ok('the panel carries it too, for anyone who scrolled past the banner',
     /id="pTint"/.test(bt));
  /* It must not claim the rest of the page is wrong. Geometry, AI counters,
     roster and pricing are all unaffected by the taint, and a banner that
     overstates gets dismissed. */
  /* IT STILL HAS TO SCOPE THE DAMAGE, and it now has to be RIGHT about the
     scope: the previous wording named terrain as unaffected while the reader was
     looking at untextured rocks and wireframe creatures. */
  ok('the banner scopes the damage honestly',
     /Geometry, AI counters, roster and pricing are accurate/.test(bt));
  ok('and explains why terrain and brood are not hit', /manifests are/.test(bt)
     && /bench-manifests\.mjs/.test(bt));
}

// ── 11. the bench draws the game's ground, not a fallback of it ────────────
/* REPORTED FIVE TIMES AS "THE TERRAIN IS WRONG" AND IT WAS THREE FALLBACKS
   STACKED, none of which said anything:

     no planet tables   paletteFor and terrainKey missed on every lookup and the
                        field fell through to TERRAIN_COL. EVERY REACH WORLD
                        RESOLVED TO dust / (150,124,86) - one tan for all ten -
                        and the terrain KEY was wrong too, so ks_04 generated
                        boulders and craters instead of seams, and ks_05 instead
                        of chasms. Wrong SHAPES, not only wrong colour, and
                        wrong over http as well as off the disk.
     no mesh manifest   loadMeshes fetches, fetch is blocked on file://, and
                        "wireframe keeps the field": every rock an untextured
                        prism.
     no brood manifest  loadBrood fetches, same block: every creature wireframe.

   All three degrade to something that DRAWS. That is the pattern in this bench
   now five times running, so each one gets its own status row and its own
   assertion. */
{
  const bt = read('client/battle-test.html');

  ok('the bench loads the planet palette', /<script src="assets\/planet-palette\.js">/.test(bt));
  ok('and the generated table shim', /<script src="assets\/space\/bench-manifests\.js">/.test(bt));
  /* FM_NATURE_SRC and FM_BROOD_GEOM are read at the moment the module decides
     whether to fetch, so the shim after the module is the shim doing nothing. */
  /* COMPARED AS SCRIPT TAGS, NOT AS FILENAMES - the third time this file has
     had to learn it. Every one of these names also appears in the header
     comment, which sits above all of them, so a bare indexOf compares a tag
     against a sentence and reports an ordering that is not the loading order. */
  const tagAt = u => bt.indexOf('<script src="' + u + '">');
  for (const u of ['assets/planet-palette.js', 'assets/space/bench-manifests.js',
                   'assets/factions.js', 'assets/coalition-sprites.js', 'assets/reach-battle.js'])
    ok('the bench has a script tag for ' + u, tagAt(u) > 0);
  ok('the tables load before the modules that read them',
     tagAt('assets/space/bench-manifests.js') < tagAt('assets/coalition-sprites.js')
     && tagAt('assets/space/bench-manifests.js') < tagAt('assets/reach-battle.js')
     && tagAt('assets/planet-palette.js') < tagAt('assets/reach-battle.js'));
  for (const row of ['pPal', 'pMesh', 'pBrood'])
    ok('the panel reports ' + row + ' on its own row', new RegExp('id="' + row + '"').test(bt));

  /* THE BANNER USED TO SAY TERRAIN WAS UNAFFECTED BY THE TAINT. It was flatly
     wrong: the same origin rules that block getImageData block fetch, and the
     ground and the brood are hit harder by file:// than the uniforms are. A
     banner that names what is fine has to be right about it. */
  ok('the banner no longer claims terrain is unaffected by the taint',
     !/terrain and pricing are all unaffected/.test(bt));

  // The generated shim must be current, the way planet-palette.js must be.
  const shimPath = 'client/assets/space/bench-manifests.js';
  ok('the shim exists', fs.existsSync(path.join(ROOT, shimPath)));
  if (fs.existsSync(path.join(ROOT, shimPath))) {
    const w = {};
    new Function('window', read(shimPath))(w);
    ok('the shim is generated, not hand-edited', /GENERATED by tools\/bench-manifests\.mjs/.test(read(shimPath)));
    ok('and the client never loads it', !/bench-manifests/.test(read('client/index.html')));

    /* Lifted the same way the generator lifts it - brace matching - rather than
       by slicing between two string landmarks. The landmark version broke on a
       comment sitting between the literal and the export, which is exactly the
       kind of thing that gets added later. */
    const gx = read('client/assets/galaxy.js');
    const braceLift = (src, decl) => {
      const i = src.indexOf(decl);
      if (i < 0) return null;
      let d = 0; const start = src.indexOf('{', i);
      for (let k = start; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}' && --d === 0) return src.slice(start, k + 1);
      }
      return null;
    };
    const gCPsrc = braceLift(gx, 'var COLONY_PLANET = ');
    ok('COLONY_PLANET is still liftable from galaxy.js', !!gCPsrc);
    const gCP = gCPsrc ? new Function('return ' + gCPsrc + ';')() : {};
    ok('the shim carries every world galaxy.js does',
       Object.keys(gCP).length === Object.keys(w.COLONY_PLANET || {}).length,
       Object.keys(gCP).length + ' vs ' + Object.keys(w.COLONY_PLANET || {}).length);
    for (const k of Object.keys(gCP))
      ok('the shim agrees with galaxy.js on ' + k,
         w.COLONY_PLANET && w.COLONY_PLANET[k]
         && w.COLONY_PLANET[k].folder === gCP[k].folder);

    const tj = JSON.parse(read('client/assets/space/nature/meshes.json'));
    ok('the shim mesh manifest is current',
       JSON.stringify(w.FM_NATURE_SRC) === JSON.stringify(tj),
       Object.keys(w.FM_NATURE_SRC || {}).length + ' vs ' + Object.keys(tj).length);
    const bj = JSON.parse(read('client/assets/space/brood/geometry.json'));
    ok('the shim brood manifest is current',
       JSON.stringify(w.FM_BROOD_GEOM) === JSON.stringify(bj));

    /* THE ASSERTION THAT MATTERS: run the real paletteFor and terrainKey against
       the bench's globals and confirm the ten Reach worlds no longer collapse to
       one colour. Driven, not read. */
    const rb = read('client/assets/reach-battle.js');
    const lift = n => { const i = rb.indexOf('function ' + n + '('); let d = 0, j = rb.indexOf('{', i);
      for (let k = j; k < rb.length; k++){ if (rb[k] === '{') d++; else if (rb[k] === '}' && --d === 0) return rb.slice(i, k + 1); } };
    const tc = rb.slice(rb.indexOf('const TERRAIN_COL'), rb.indexOf('};', rb.indexOf('const TERRAIN_COL')) + 2);
    const pp = {}; new Function('window', read('client/assets/planet-palette.js'))(pp);
    Object.assign(pp, w);
    const env = {};
    new Function('window', 'E', tc + lift('paletteFor') + lift('terrainKey')
      + 'var WORLDS=[];E.paletteFor=paletteFor;E.terrainKey=terrainKey;')(pp, env);
    const REACH = ['ks_gate_reach','ks_02','ks_03','ks_04','ks_05','ks_06','ks_07','ks_08','ks_09','ks_10'];
    const rocks = new Set(), keys = new Set();
    for (const id of REACH) {
      rocks.add(env.paletteFor(id).rock.join(','));
      keys.add(env.terrainKey(id));
    }
    ok('the Reach worlds no longer share one ground colour', rocks.size >= 6,
       rocks.size + ' distinct rock colours across ' + REACH.length + ' worlds');
    /* The KEY decides what cover is SHAPED like. Collapsed to dust, ks_04
       generated boulders where the game generates seams. */
    ok('and no longer share one terrain key', keys.size >= 4,
       [...keys].join(','));
    ok('ks_04 is a veins world, as COLONY_VISUAL says', env.terrainKey('ks_04') === 'veins');
    ok('ks_05 is a rift world', env.terrainKey('ks_05') === 'rift');
    ok('ks_07 is an ocean world', env.terrainKey('ks_07') === 'ocean');
    ok('ks_08 is an ice world', env.terrainKey('ks_08') === 'ice');
    ok('and no world is left on the legacy dust fallback colour',
       !REACH.some(id => env.paletteFor(id).rock.join(',') === '150,124,86'));
  }
}

// ── 12. the contact sheet is not a second recolour engine ──────────────────
/* tools/faction-sheet.py renders every faction against every class so colour can
   be argued about rather than described. Its one real risk is BEING A SECOND
   RECOLOUR ENGINE: coalition-sprites.js owns tinted(), and a Python copy that
   drifts would show a game that does not exist - which is exactly what made the
   battle bench worthless for three patches running.

   Two things keep it honest, and both are asserted here. It EXTRACTS every
   number from factions.js at run time rather than carrying its own, so a colour
   cannot be chosen in it. And its arithmetic is a transcription kept in the same
   order of operations, which is checked by running both against the pack's real
   uniform colours and requiring byte-equal output. */
{
  const sheet = fs.existsSync(path.join(ROOT, 'tools/faction-sheet.py'))
    ? read('tools/faction-sheet.py') : '';
  ok('the sheet generator exists', !!sheet);
  ok('and it lifts the tables out of factions.js rather than carrying its own',
     /lift\(src, 'var FACTIONS = '\)/.test(sheet)
     && /lift\(src, 'var OPTIC_SRC = '/.test(sheet)
     && /lift\(src, 'var SKIN_TONES = '/.test(sheet));
  ok('it hardcodes no faction colour',
     !/0\.66, ?'?g'?: ?0\.68/.test(sheet) && !/prawn/.test(sheet));
  /* ORDER OF OPERATIONS IS THE TRANSCRIPTION. The accent remap runs BEFORE the
     grade and skips the pixel entirely; the camo split is decided on RAW
     luminance before the lift; keep reads whichever grade is in force. Get any
     of the three wrong and the sheet is plausible and untrue. */
  ok('the accent remap short-circuits the grade, as it does in tinted()',
     /rep = rmap\.get\(\(r, g, b\)\)[\s\S]{0,160}?continue/.test(sheet));
  ok('the camo split is decided on raw luminance before the lift',
     /lum = 0\.299 \* r[\s\S]{0,200}?lum < sp\['at'\][\s\S]{0,120}?tt\.get\('lift'\)/.test(sheet));
  ok('and keep reads the grade actually in force', /\(r - nr\) \* k/.test(sheet));
  /* The brood wears no kit, so it is not a row - the same reason the bench
     parade filters it out. */
  ok('the brood is not given a uniform row', /not FACTIONS\[f\]\.get\('brood'\)/.test(sheet));
  ok('the cells cover both accent channels and the hull',
     /enforcer_shielded_idle/.test(sheet) && /engineer_idle/.test(sheet)
     && /hound_walk/.test(sheet));
}

// ── 13. air units hunt something that exists ───────────────────────────────
/* THE FLYERS HUNTED `cls === 'heli'` AND GUNSHIPS ARE BENCHED. HELI_SHARE_BENCHED
   has been true since the airstrike replaced them, so that class does not spawn,
   so the search never found anything, so every flyer drifted along front-0.16
   bouncing off the walls for the whole engagement. Not misbehaving: looking for
   a unit type that no longer exists. */
{
  const rb = read('client/assets/reach-battle.js');
  ok('gunships are still benched, which is what broke the flyers',
     /const HELI_SHARE_BENCHED = true;/.test(rb));
  ok('flyers no longer hunt only that class', !/v\.cls!=='heli'\|\|v\.dead>0/.test(rb));
  ok('they hunt armour', /const AIR_PREY = \{ heli:3, tank:2, turret:1 \};/.test(rb));
  /* The old scan had no side filter at all - harmless only because there was
     never more than one air unit in play. */
  ok('and only enemy armour', /v\.side!==u\.side/.test(rb));
  /* THE RANDOM SAMPLE WAS THE SECOND HALF AND WOULD HAVE SURVIVED FIXING THE
     FIRST. Thirty draws out of seven hundred finds one of eight tanks about a
     third of the time, so a flyer that "targets tanks" by sampling would still
     spend most of its life idle - the same fault pickTarget was fixed for. */
  ok('through the spatial index rather than a random sample',
     /function nearestPrey\(u\)/.test(rb) && /const col = tgtIdx\[u\.side===1\?0:1\];/.test(rb));
  ok('and it falls back to any enemy rather than idling',
     /return best>=0 \? best : anyBest;/.test(rb));
  /* Now that flyers hunt turrets, the turret has to see them coming - and it was
     scanning for them the same broken way. */
  ok('the turret spots inbound air through the index too',
     /v\.cls!=='flyer'&&v\.cls!=='wing'/.test(rb));
  ok('and asks for its OWN enemies rather than a hardcoded side',
     /j=pickTarget\(u\.side,u\.x,front,0\.18\)/.test(rb)
     && !/j=pickTarget\(1,u\.x,front,0\.18\)/.test(rb));
  /* The readout the "shield enemies joined the attacking line" report needed
     and nobody had. */
  ok('there is a per-side faction readout', /  sides: function\(\)/.test(rb));
  ok('and it flags men on the wrong side of their own roster', /o\.crossed\+\+/.test(rb));
  ok('the bench shows it', /D\.sides\(\)/.test(read('client/battle-test.html')));
}

if (fails.length) {
  for (const f of fails.slice(0, 40)) console.log('  FAIL  ' + f);
  if (fails.length > 40) console.log('  ... and ' + (fails.length - 40) + ' more');
  console.log('faction: ' + pass + ' passed, ' + fails.length + ' failed.');
  process.exit(1);
}
console.log('faction: ' + pass + ' passed, 0 failed.');
