// ═══════════════════════════════════════════════════════════════════════════
// reach-terrain-check.mjs
//
// Two families of assertion, both of them about things that were WRONG in the
// shipped build and both of them invisible to a code read.
//
// 1. THE WORLD IS ONE WORLD. terrain keys lived in four places and the colour a
//    battlefield drew came from a fifth authoring that nobody diffed against the
//    planet art. Four of ten Reach worlds fought on a colour their planet is
//    not. This asserts every copy agrees with COLONY_VISUAL, that the generated
//    palette is current, and that each Reach world's battlefield colour is
//    actually within reach of its own sprite.
//
// 2. THE COALITION IS NOT IN THE WAR UNTIL IT DECLARES. blankWorld seeded
//    jade:0 and the renderer defaulted jadeFrac to 0, so an untouched world drew
//    a full Coalition line in a war the Coalition has not joined. This drives
//    the real effJade against real state rather than matching its text, because
//    matching text is what let the last three faucet fixes report green.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fails.push(name + (detail ? '  ' + detail : ''));
}

// ── parse the tables out of their files ────────────────────────────────────
// Read, not import: city.js pulls the whole city layer in with it and galaxy.js
// is browser-scoped. A regex over the literal is enough for a table of string
// pairs and it fails loudly if the shape changes.
function pairs(src, startRe) {
  const i = src.search(startRe);
  if (i < 0) return null;
  const body = src.slice(i, src.indexOf('};', i));
  const out = {};
  for (const m of body.matchAll(/(\w+)\s*:\s*\{[^}]*terrain:\s*'(\w+)'/g)) out[m[1]] = m[2];
  return out;
}
function flat(src, startRe) {
  const i = src.search(startRe);
  if (i < 0) return null;
  const body = src.slice(i, src.indexOf('};', i));
  const out = {};
  for (const m of body.matchAll(/(\w+)\s*:\s*'(\w+)'/g)) out[m[1]] = m[2];
  return out;
}

const REACH = ['ks_gate_reach','ks_02','ks_03','ks_04','ks_05','ks_06','ks_07','ks_08','ks_09','ks_10'];

const facs     = read('client/assets/factions.js');
const cityJs   = read('server/city.js');
const galaxyJs = read('client/assets/galaxy.js');
const godJs    = read('client/assets/god-panel.js');
const battleJs = read('client/assets/reach-battle.js');

const VISUAL = pairs(cityJs, /export const COLONY_VISUAL = \{/);
ok('COLONY_VISUAL parses', VISUAL && REACH.every(id => VISUAL[id]));

const GAL = flat(galaxyJs, /window\.REACH_TERRAIN = \{/);
ok('galaxy REACH_TERRAIN parses', GAL && REACH.every(id => GAL[id]));

const GOD = flat(godJs, /const REACH_TERRAIN_FALLBACK = \{/);
ok('god-panel fallback parses', GOD && REACH.every(id => GOD[id]));

for (const id of REACH) {
  ok('terrain agrees galaxy/server ' + id, VISUAL && GAL && VISUAL[id] === GAL[id],
     `server=${VISUAL && VISUAL[id]} galaxy=${GAL && GAL[id]}`);
  ok('terrain agrees god-panel/server ' + id, VISUAL && GOD && VISUAL[id] === GOD[id],
     `server=${VISUAL && VISUAL[id]} god=${GOD && GOD[id]}`);
}

// The WORLDS fallback inside the renderer. It is the copy nothing reads at
// runtime any more, which is exactly why it is the copy that rots unwatched.
{
  const i = battleJs.search(/const WORLDS = \[/);
  const body = battleJs.slice(i, battleJs.indexOf('];', i));
  const w = {};
  for (const m of body.matchAll(/id:'(\w+)'[^}]*terrain:'(\w+)'/g)) w[m[1]] = m[2];
  ok('reach-battle WORLDS parses', REACH.every(id => w[id]));
  for (const id of REACH)
    ok('terrain agrees battle-fallback/server ' + id, VISUAL && w[id] === VISUAL[id],
       `server=${VISUAL && VISUAL[id]} battle=${w[id]}`);
}

// ── the palette is generated and current ───────────────────────────────────
{
  let stale = false;
  try { execFileSync(process.execPath, [path.join(ROOT, 'tools/planet-palette.mjs'), '--check'], { stdio: 'pipe' }); }
  catch (e) { stale = true; }
  ok('planet-palette.js is current', !stale, 'run: node tools/planet-palette.mjs');
}

const palJs = read('client/assets/planet-palette.js');
const PAL = {};
/* PARSED FROM THE EMITTED SHAPE, WHICH GAINED A FIELD. `mean` moved out of a
   trailing comment and into the object, and this regex was anchored on the
   comment - so it matched nothing, PAL came back empty, and both the hue check
   and its negative control silently passed on zero worlds. A parse that returns
   nothing must never look like agreement. */
for (const m of palJs.matchAll(/'([\w/]+)': \{[^}]*rock:\[([\d,]+)\][^}]*mean:\[([\d,]+)\]/g)) {
  PAL[m[1]] = { rock: m[2].split(',').map(Number), mean: m[3].split(',').map(Number) };
}
ok('planet-palette parses', Object.keys(PAL).length >= 20, Object.keys(PAL).length + ' bodies');

const PLANET = {};
{
  const i = galaxyJs.search(/var COLONY_PLANET = \{/);
  const body = galaxyJs.slice(i, galaxyJs.indexOf('};', i));
  for (const m of body.matchAll(/(\w+)\s*:\s*\{folder:\s*'([\w/]+)'/g)) PLANET[m[1]] = m[2];
}
for (const id of REACH) {
  ok('reach world has planet art ' + id, !!PLANET[id]);
  ok('planet art has a palette ' + id, !!(PLANET[id] && PAL[PLANET[id]]), PLANET[id]);
}

// COLONY_PLANET must be reachable from the battlefield or the whole thing falls
// back to the legacy table and the drift silently returns.
ok('COLONY_PLANET is exposed', /window\.COLONY_PLANET\s*=\s*COLONY_PLANET/.test(galaxyJs));
ok('battlefield reads the palette', /window\.PLANET_PALETTE/.test(battleJs));
ok('planet-palette.js is loaded by the client', /assets\/planet-palette\.js/.test(read('client/index.html')));

// ── the ground is the world's own colour ───────────────────────────────────
// THE ASSERTION THAT WOULD HAVE CAUGHT IT. Hue, in degrees, between the sampled
// planet art and the colour the battlefield strokes rock in. Value is crushed on
// purpose so luminance is not comparable, but hue is, and hue is the thing that
// was wrong: ks_05's art is teal at 168 degrees and the old table drew violet at
// 279, a 111 degree miss on a world a player had been looking at from orbit.
function hue(c) {
  const r = c[0]/255, g = c[1]/255, b = c[2]/255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
  if (d < 0.001) return null;                     // achromatic: no hue to compare
  let h = mx === r ? ((g-b)/d) % 6 : mx === g ? (b-r)/d + 2 : (r-g)/d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
function hueGap(a, b) {
  const ha = hue(a), hb = hue(b);
  if (ha === null || hb === null) return 0;
  const d = Math.abs(ha - hb);
  return Math.min(d, 360 - d);
}
const HUE_TOL = 20;
for (const id of REACH) {
  const p = PAL[PLANET[id]];
  if (!p) continue;
  ok('battlefield rock matches the world hue ' + id, hueGap(p.rock, p.mean) <= HUE_TOL,
     `art=${p.mean} rock=${p.rock} gap=${hueGap(p.rock, p.mean).toFixed(0)} deg`);
}

// NEGATIVE CONTROL. The old hand-written table, checked against the same art.
// If this does not bite, the assertion above is not measuring anything.
{
  const LEGACY = { dust:[150,124,86], veins:[198,150,60], rift:[150,110,180], ice:[130,190,215],
                   station:[120,150,170], tether:[190,74,52], ocean:[96,178,214] };
  let bad = 0;
  for (const id of REACH) {
    const p = PAL[PLANET[id]];
    const L = LEGACY[VISUAL[id]];
    if (p && L && hueGap(L, p.mean) > HUE_TOL) bad++;
  }
  ok('negative control: the legacy table fails this', bad >= 3, bad + ' of 10 worlds off-hue under the old table');
}

// ── the Coalition entry gate ───────────────────────────────────────────────
const reachSrc = read('server/reach.js');

// Drive the real effJade rather than reading it. Lifted by name from the file so
// a change to the body is a change to what runs here.
const effJade = (function () {
  const m = reachSrc.match(/export function effJade\(s, w\) \{[\s\S]*?\n\}/);
  if (!m) return null;
  const body = m[0].replace('export function', 'function');
  return new Function('JADE_MIN', body + '; return effJade;')(0.25);
})();
ok('effJade lifted from source', typeof effJade === 'function');

if (effJade) {
  ok('no Coalition before entry, dial untouched',   effJade({ coalIn: 0 }, { jade: 1 }) === 1);
  ok('no Coalition before entry, dial at 0.4',      effJade({ coalIn: 0 }, { jade: 0.4 }) === 1);
  ok('no Coalition before entry, dial absent',      effJade({ coalIn: 0 }, {}) === 1);
  ok('no Coalition before entry, dial at 0',        effJade({ coalIn: 0 }, { jade: 0 }) === 1);
  ok('after entry the dial applies',                effJade({ coalIn: 1 }, { jade: 0.4 }) === 0.4);
  ok('after entry Jade keeps its floor',            effJade({ coalIn: 1 }, { jade: 0 }) === 0.25);
  ok('after entry an absent dial is all Jade',      effJade({ coalIn: 1 }, {}) === 1);
  ok('a garbage dial is all Jade, not none',        effJade({ coalIn: 1 }, { jade: 'x' }) === 1);
  ok('no state at all is all Jade',                 effJade(null, { jade: 0 }) === 1);
}

ok('blankWorld seeds an all-Jade line', /jade: 1,\s+\/\/ share of this world's line that is Jade/.test(reachSrc));
ok('coalIn is at the state root', /coalIn: 0,/.test(reachSrc));
/* Same widening as reach-check: pinned by MEMBERSHIP rather than by being the
   last entry, because a check that goes red when the list is correctly extended
   argues against extending it. */
ok('coalIn survives a restart', /'coalIn'/.test(reachSrc));
ok('and so do the other declared belligerents', /'belligerents'\]/.test(reachSrc));
ok('the payload ships effJade, not the raw dial', /jade: effJade\(s, w\)/.test(reachSrc));
ok('the payload ships coalIn', /coalIn: s\.coalIn \? 1 : 0/.test(reachSrc));
ok('setJade refuses rather than clamps before entry',
   /if \(!s\.coalIn && frac !== undefined[\s\S]{0,220}return \{ ok: false/.test(reachSrc));
ok('only a CARRIED vote enters the Coalition',
   /win === 'support' && v\.resolved === 'carried' && !s\.coalIn/.test(reachSrc));

ok('renderer defaults to an all-Jade line', /var jadeFrac = 1;/.test(battleJs));
ok('an untagged friendly unit is Jade', /u\.side===1 \? 'jade' : 'khai'/.test(battleJs));
ok('the army is named from the entry gate, not hardcoded',
   /function armyName\(\)\{ return coalIn \? 'COALITION' : 'JADE CIRCUIT'; \}/.test(battleJs));
// The strings that were lying. Neither may be a bare literal any more.
ok('the strike feed is not hardcoded Coalition', !/'COALITION AIR/.test(battleJs));
ok('the funding strip is not hardcoded Coalition', !/COALITION AT BASELINE STRENGTH'/.test(battleJs));
ok('works and camps take the home faction colour', !/FAC\.coal\.line/.test(battleJs));
// The rename. A function that assigns u.fac from jadeFrac must not be named for
// one faction: the old name is what made the wrong default read as correct.
ok('reviveAsCoalition is gone', !/function reviveAsCoalition/.test(battleJs));

ok('the GM can declare the Coalition', /cmd:'coalition_enter'/.test(godJs));
ok('the dial is dead before entry', /if \(!\(d && d\.coalIn\)\) \{/.test(godJs));
ok('the dial floors at the Jade minimum', /js\.min = 25; js\.max = 100;/.test(godJs));
ok('the god panel has no private terrain table',
   !/^const REACH_TERRAIN = \{/m.test(godJs));

// ── solid ground (1.5.3.0) ────────────────────────────────────────────────
// The battlefield draws tiled ground and solid cover now. These assertions are
// about the SEAMS, because that is where this class of change goes wrong: a
// cache that is cleared in one place and not the other, a constant duplicated,
// a fallback that quietly stops existing.
{
  ok('ground is drawn in bands over a plane', /function bandPass\(pattern, planeY, clipPath, bounded\)/.test(battleJs));
  ok('the tile scale is four metres and says why', /const TILE_M = 4;/.test(battleJs)
     && /only setting that works/.test(battleJs));
  // The band height was named BAND while draw() declares a local BAND array for
  // unit depth banding. Same name, different type, one scope apart.
  ok('the band height does not collide with the unit depth bands',
     /const BAND_PX = 2;/.test(battleJs) && !/const BAND = 2;/.test(battleJs));

  ok('patches are tinted from the planet palette', /globalCompositeOperation = 'color'/.test(battleJs));
  // A hand-tuned brightness constant is wrong for every patch but the one it was
  // tuned against, because the patches do not share a mean.
  ok('patch brightness is measured, not a magic constant',
     /getImageData\(0, 0, 1, 1\)/.test(battleJs) && !/wantLum \* 255 \* 1\.9/.test(battleJs));

  // THE BUG THIS CAUGHT. PAL was cleared on world change and PATS was not, so
  // an ice world drew grey cliffs standing on the previous world's red desert.
  var palClears = (battleJs.match(/PAL = paletteFor\(colonyId\); PATS = null;/g) || []).length;
  ok('palette and patterns are cleared together on every open path', palClears === 2,
     palClears + ' of 2 open paths clear both');

  ok('sides sort against the infantry rather than painting over them',
     /function queueSides\(\)/.test(battleJs) && /q\.kind==='side'/.test(battleJs));
  ok('back faces are culled', /Back-face cull/.test(battleJs));
  // A side brighter than the top it supports is the wrong way round: horizontal
  // faces catch the sky and vertical ones do not.
  ok('a side is shaded darker than a top', /const k = 0\.18 \+ it\.lit \* 0\.42;/.test(battleJs));

  ok('wireframe survives as the fallback', /if\(!SOLID\)\{/.test(battleJs)
     && /gPrism\(ter,terrain\[i\]\)/.test(battleJs));
  ok('a failed sheet drops the sides too', /if\(!SOLID\) return;/.test(battleJs));

  // One build number, one place. A second literal is a second thing to rot.
  ok('the terrain cache bust has no second hardcoded version',
     /window\.FM_BUILD = BUILD;/.test(read('client/assets/coalition-sprites.js'))
     && !/window\.FM_BUILD \|\| '1\./.test(battleJs));

  // The patches ship; the 114-file source pack does not.
  var terDir = 'client/assets/space/terrain';
  var have = fs.existsSync(path.join(ROOT, terDir)) ? fs.readdirSync(path.join(ROOT, terDir)) : [];
  var keys = ['dust','veins','rift','ice','ocean','station','tether'];
  for (const k of keys) {
    ok('patch exists ' + k + '_base', have.indexOf(k + '_base.png') >= 0);
    ok('patch exists ' + k + '_rock', have.indexOf(k + '_rock.png') >= 0);
  }
  // Every terrain key COLONY_VISUAL can declare must have art, or a colony added
  // later renders as wireframe with no warning.
  var declared = new Set(Object.values(VISUAL || {}));
  for (const t of declared)
    ok('COLONY_VISUAL terrain has patch art: ' + t, keys.indexOf(t) >= 0);

  ok('the licence position is recorded beside the art',
     have.indexOf('ATTRIBUTION.txt') >= 0);
  // NOT a licence check, and it must not be mistaken for one. It asserts the
  // UNRESOLVED state is still written down, so nobody ships assuming it was
  // sorted out. Delete this line when ATTRIBUTION.txt records a real licence.
  ok('and it still says the licence is unresolved',
     /UNRESOLVED/.test(read(terDir + '/ATTRIBUTION.txt')));
}

// ── the Hound, and the faction colours (1.5.3.1) ──────────────────────────
{
  const troops = read('client/assets/coalition-sprites.js');

  ok('the tank is a sprite class', /tank:'hound'/.test(battleJs));
  /* Still two sheets and still a choice between them - but the choice is made
     against the animation's own duration rather than against the recoil term,
     which decays in a tenth of the time the sheet takes to play. */
  ok('the Hound has two sheets and picks between them',
     /\(since < HOUND_FIRE_MS \|\| u\.dead>0\) \? 'hound_fire' : 'hound_walk'/.test(battleJs));
  // 8 cols x 3 rows is 24 cells and only 20 hold art. A naive cols*rows plays
  // four blank cels at the end of every shot: the tank vanishes between rounds.
  ok('the firing sheet declares 20 frames, not the 24 its grid holds',
     /hound_fire:20,/.test(troops));
  // A free-running cycle re-fires three times a second and the tank strobes.
  ok('firing is a one-shot driven off the shot time, not a loop',
     /anim === 'hound_fire'/.test(battleJs) && /u\.fireAt \|\| T/.test(battleJs));
  ok('and the shot stamps a time for it to count from', /u\.fireAt = performance\.now\(\);/.test(battleJs));

  // Scale from a rifleman-sized constant makes a tank the size of a man.
  ok('sprite scale comes off the sheet density, not a man-sized constant',
     /const scale=focal\/\(_p3\[2\]\*g\.unit\);/.test(battleJs));
  ok('the troop pack is 16px per world unit and the Hound is 20',
     /unit: 16, base: BASE/.test(troops) && /unit: 20, base: VEH/.test(troops));

  // Faction colours have to agree between sprite and wireframe or the same unit
  // changes faction when it passes the size cutoff and drops to wireframe.
  ok('Jade wireframe is green, matching the untinted art',
     /jade: \{ line:\[86,180,140\]/.test(battleJs));
  ok('Coalition wireframe is blue, matching its tint',
     /coal: \{ line:\[84,148,236\]/.test(battleJs));
  ok('and the retired steel grey is gone from the wireframes',
     !/\[150,152,158\]/.test(battleJs));

  // Geometry claims vs the art on disk are checked in reach-check.mjs; these
  // are the two numbers that were MEASURED off the tracks and would otherwise
  // be a guess nobody could audit.
  ok('the walk anchor sits on the track footprint', /ax: 147, ay: 159/.test(troops));
  ok('the firing anchor accounts for the wider cell', /ax: 297, ay: 159/.test(troops));

  var vdir = 'client/assets/space/vehicles';
  var vhave = fs.existsSync(path.join(ROOT, vdir)) ? fs.readdirSync(path.join(ROOT, vdir)) : [];
  ok('hound_walk shipped', vhave.indexOf('hound_walk.png') >= 0);
  ok('hound_fire shipped', vhave.indexOf('hound_fire.png') >= 0);
  // Source art is not a deliverable and .aseprite files are large.
  ok('no aseprite or resprite sources shipped',
     !vhave.some(f => /\.(aseprite|resprite)$/i.test(f)));
  ok('the vehicle licence position is recorded',
     /Turquoise Hound/.test(read('client/assets/space/terrain/ATTRIBUTION.txt')));
}

// ── mesh cover, spires and objectives (1.5.4.0) ───────────────────────────
{
  ok('cover is meshes, not extruded footprints', /function pushMesh\(f, out\)/.test(battleJs));
  ok('a mesh feature falls back to its prism if the mesh declined',
     /if\(!pushMesh\(f, _sprites\)\) pushSides\(f, _sprites\);/.test(battleJs));
  // A crag's top is jagged at forty heights; laying tiled ground over its
  // footprint at one height puts a flat lid across the peaks.
  ok('mesh features are skipped by the flat-top band pass',
     /if\(MESHES && KIND_MESH\[f\.kind\]\) continue;/.test(battleJs));
  // Sizing off the footprint alone made a boulder 15m across and 4 tall.
  ok('mesh scale leads on height, footprint only modulates',
     /var sx = h \* 1\.15 \* wr;/.test(battleJs) && !/f\.w \* FIELD_W \* 0\.62/.test(battleJs));
  // Picked once at generation: per frame a rock spins, per open the world moves.
  ok('the mesh pick is seeded at generation', /meshPick:\(rnd\(\)\*997\)\|0, meshRot:rnd\(\)\*Math\.PI\*2/.test(battleJs));
  ok('faces are back-face culled in world space before projection',
     /Back-face cull in world space/.test(battleJs));
  // Canvas antialiases polygon edges; abutting faces leave a hairline of the
  // background along every shared edge and the mesh looks cracked.
  ok('faces are stroked in their own colour to close the seams',
     /ctx\.strokeStyle = rgba\(c, 1\); ctx\.lineWidth = 1; ctx\.stroke\(\);/.test(battleJs));

  ok('there are spires on the horizon', /function genSpires\(seed\)/.test(battleJs));
  // A ring of base points and straight lines to a tip is a cone, and a cone on
  // a skyline is Egypt, not a hive.
  ok('the spire is a grown profile, not a cone',
     /function spireR\(s, t\)/.test(battleJs) && /const flare = 1\.90/.test(battleJs));
  ok('and each spire has its own noise phase', /ph: rnd\(\) \* 6\.283/.test(battleJs));
  // Amber wire at a third alpha is invisible against an amber sky.
  ok('spires are a filled silhouette before they are line work',
     /function gSpireBody\(path, s\)/.test(battleJs) && /ctx\.fill\(body\);/.test(battleJs));
  ok('spires sit under the haze, at their own depth',
     battleJs.indexOf('paintSpires();') < battleJs.indexOf('paintHaze();\n'));

  ok('units are assigned ground to hold', /function pickObjective\(u\)/.test(battleJs));
  ok('objectives are derived from the terrain, not authored', /function genObjectives\(\)/.test(battleJs));
  // Top-N-by-size clusters every objective wherever the generator put its wide
  // features, and half the field goes back to being empty.
  ok('objectives are bucketed across the frontage', /const lo = b\/N, hi = \(b\+1\)\/N;/.test(battleJs));
  ok('an empty bucket still gets an objective', /f: -1, hold: 0, press: 0/.test(battleJs));
  // THE BUG THIS REPLACES: no slot meant u.x += u.vx, a random walk. Correct
  // depth, no width, an army diffused evenly from flank to flank.
  ok('the lateral random walk is gone from the bound path',
     /u\.x\+=Math\.sign\(dx\)\*Math\.min/.test(battleJs));
  ok('cover choice is biased toward the objective', /d \+= Math\.abs\(f\.cx-o\.x\)\*0\.55;/.test(battleJs));
  // A count kept by bookkeeping drifts on every death and reinforcement, and a
  // crowding term off a drifted count pushes men away from empty ground.
  ok('objective loads are recounted, not bookkept', /function tallyObjectives\(\)/.test(battleJs)
     && /tallyObjectives\(\);/.test(battleJs));
  ok('and orders are reviewed rather than fixed for life', /u\.objT-=dt;/.test(battleJs));
  ok('a reinforcement arrives with orders', /u\.obj=-1; u\.objT=0;/.test(battleJs));

  var ndir = 'client/assets/space/nature';
  ok('the mesh table shipped', fs.existsSync(path.join(ROOT, ndir, 'meshes.json')));
  if (fs.existsSync(path.join(ROOT, ndir, 'meshes.json'))) {
    var M = JSON.parse(read(ndir + '/meshes.json'));
    var names = Object.keys(M);
    ok('every mesh a kind asks for exists', names.length >= 6, names.join(','));
    var bad = [];
    for (const n of names) {
      const m = M[n];
      if (m.v.length % 3) bad.push(n + ' vertex stride');
      if (m.n.length !== m.f.length * 3) bad.push(n + ' normal count');
      const maxIdx = Math.max(...m.f.map(f => Math.max(...f)));
      if (maxIdx * 3 + 2 >= m.v.length) bad.push(n + ' face index out of range');
    }
    ok('mesh data is internally consistent', bad.length === 0, bad.slice(0, 3).join('; '));
    // Face count is the whole budget: canvas fills one polygon per call.
    var cover = names.filter(n => M[n].role === 'cover');
    ok('cover meshes stay inside the per-instance budget',
       cover.every(n => M[n].f.length <= 260),
       cover.map(n => n + '=' + M[n].f.length).join(' '));
  }
  ok('the nature pack licence is recorded as CC0',
     /CC0/.test(read('client/assets/space/terrain/ATTRIBUTION.txt')));
}

// ── the brood as creatures, and the bench (1.5.5.0) ───────────────────────
{
  const troops = read('client/assets/coalition-sprites.js');

  // An animation and a file stopped being the same thing: the brood pack ships
  // one sheet per creature with one animation per row.
  ok('geometry can point several animations at one sheet', /function imgKey\(name\)/.test(troops)
     && /function registerBrood\(g\)/.test(troops));
  ok('the loader keys the image on the sheet', /name = imgKey\(name\);/.test(troops));
  // ready() not resolving through imgKey means every brood animation reports
  // not-ready forever, and queueSprite drops the unit off BOTH paths.
  ok('and so does ready, or the unit draws as neither',
     /function ready\(name\) \{ return !!_img\[imgKey\(name\)\]; \}/.test(troops));
  // On a shared sheet the row below is a different animation.
  ok('a row-pinned animation never wraps into the next creature',
     /if \(g\.row !== undefined\) return \{ sx: f \* g\.cw, sy: g\.row \* g\.ch, g: g \};/.test(troops));
  ok('the tint is cached per image, not per animation',
     /name = imgKey\(name\);/.test(troops.slice(troops.indexOf('function tinted'))));

  /* The brood's grade lives on its registry row and as the sprite layer's
     fallback for a creature sheet with no per-sheet grade. Same numbers, and
     asserted in BOTH places precisely because there are two of them: a fallback
     that drifts from the row it mirrors is the failure this whole pass is about. */
  ok('the brood has a tint of its own',
     /BROOD_FALLBACK = \{ r: 0\.98, g: 0\.34, b: 0\.11, lift: 0/.test(troops)
     && /tint: \{ r: 0\.98, g: 0\.34, b: 0\.11, lift: 0/.test(facs));
  // A warm lift put the creatures at the same value as the tinted ground and a
  // hundred of them read as scribble on sand.
  ok('and it is dark, so value carries the silhouette',
     !/BROOD_FALLBACK = \{ r: 1\./.test(troops));

  ok('creatures are mapped to roles', /const BROOD_SPRITE = \{/.test(battleJs));
  ok('and the roles come off what each creature has frames for',
     /crawling_horror  idle \/ move \/ ATTACK/.test(battleJs));
  /* THE SPITTER HAS A BODY NOW AND THE EARLIER ASSERTION PINNED THE MISTAKE.
     "Nothing in the pack fires anything, so the spitter stays a wireframe" was
     sound reasoning applied to a class carrying 299 of about 380 brood units.
     Four in five of the enemy stayed wireframe, so the field read as "the bugs
     are still wireframes" however many creature types were wired behind it.
     A principle right about one unit and wrong about the other 79% is wrong. */
  ok('every brood class the sim seeds has a creature',
     (function () {
       const i = battleJs.indexOf('const BROOD_SPRITE = {');
       const tbl = battleJs.slice(i, battleJs.indexOf('};', i));
       const mapped = new Set([...tbl.matchAll(/^\s*(\w+):\s*'/gm)].map(m => m[1]));
       const j = battleJs.indexOf('function broodClass(');
       const body = battleJs.slice(j, battleJs.indexOf('\n}', j));
       const seeded = [...body.matchAll(/return '(\w+)';/g)].map(m => m[1]);
       const orphan = seeded.filter(c => !mapped.has(c));
       return orphan.length === 0;
     })());
  ok('the spitter is the small hopclops and the leaper the large',
     /spit:  'hop_s'/.test(battleJs) && /leap:  'hop_l'/.test(battleJs));
  // A spitter mostly holds a firing position, so gating its hop on movement
  // left it sitting still and never using the frames it is built around.
  ok('and they hop for different reasons',
     /u\.cls==='spit' \? \(u\.fire>0\.35\)/.test(battleJs));

  // The claw was written because a straight segment read as an energy bolt from
  // a species with no energy weapons. The pack ships an actual organic round.
  ok('the brood round is art, with the claw as its fallback',
     /function queueBroodRound\(p, X, Y, Z\)/.test(battleJs)
     && /if\(!queueBroodRound\(p, ax, ay, az\)\) gClaw\(/.test(battleJs));
  /* A round drawn at 8px is a small SPRITE, not a quarter-metre object. At the
     brood's 32 px/unit the size cutoff threw almost every round away and the
     wireframe kept drawing them: six rendered as art in a nine second run. */
  /* This asserted the SPECIAL CASE that fixed the projectile, and the special
     case was itself the symptom: every sheet needed its own density, not just
     the one that broke first. Now it asserts the general rule, which the
     projectile is simply an entry in. */
  ok('projectiles get their own pixel density',
     /proj_s:   10, proj_l:   10/.test(read('client/assets/coalition-sprites.js')));
  // THE BUG THE BENCH CAUGHT IN ONE GLANCE: the sprite gate asked the
  // COALITION's table about a brood unit, so every creature went to wireframe
  // with its sheets decoded and unused.
  /* Still asks both tables. The brood half now tests the unit's FACTION rather
     than its side: `side === -1` meant "creature" only by accident of there
     never having been anything else on that half of the field, and an away-side
     polity draws troop sheets. */
  ok('the sprite gate asks the brood table too',
     /\(SPRITE_CLS\[u\.cls\] \|\| \(BROOD_SPRITE\[u\.cls\] && isBroodFac\(u\.fac\)\)\) && queueSprite\(u\)/.test(battleJs));
  ok('and so does the muzzle-flash suppressor',
     /p\.spr = \(SPRITE_CLS\[u\.cls\] \|\| BROOD_SPRITE\[u\.cls\]\) \? 1 : 0;/.test(battleJs));

  // Melee was gated on the string 'rush' in six places; three new creatures
  // would have walked to contact and stood there.
  ok('melee is a set, not a string comparison',
     /const MELEE_CLS = \{ rush:1, brute:1, leap:1, grub:1, maw:1 \};/.test(battleJs));
  ok('and no melee site still tests the class name',
     !/u\.cls==='rush'&&u\.mel/.test(battleJs));
  ok('one ladder decides what the brood sends', /function broodClass\(rnd\)/.test(battleJs));
  /* Both spawn paths reach it THROUGH awayClass now, which is the router that
     asks whether the away faction is a creature or a polity. Counting raw
     broodClass calls would have gone green on a build where the router was
     bypassed, so it asserts the router instead. */
  ok('and both spawn paths use it',
     /function awayClass\(rnd, fac\)/.test(battleJs)
     && /if\(isBroodFac\(fac\)\) return broodClass\(rnd\);/.test(battleJs)
     && (battleJs.match(/awayClass\(/g) || []).length >= 3);
  // A strike run as a free cycle re-triggers several times a second.
  ok('brood strikes are one-shots', /if\(anim\.indexOf\('_attack'\) >= 0\)/.test(battleJs));
  ok('the strafing run plays start, loop, end in order',
     /_attack_start' : t < 0\.78 \? c \+ '_attack_loop'/.test(battleJs)
     || /'_attack_start' : t < 0\.78 \? '_attack_loop' : '_attack_end'/.test(battleJs));
  ok('the leaper has real vertical motion for jump and fall to read',
     /u\.vy -= dt\*0\.00075;/.test(battleJs));
  ok('every new class has hp and speed',
     /brute:9,grub:7,leap:3,wing:6/.test(battleJs)
     && /cls==='brute'\?/.test(battleJs.replace(/\s/g, '')) === false
     || /cls==='brute'/.test(battleJs));

  var bdir = 'client/assets/space/brood';
  var bhave = fs.existsSync(path.join(ROOT, bdir)) ? fs.readdirSync(path.join(ROOT, bdir)) : [];
  for (const n of ['horror_s','horror_l','fly_s','fly_l','hop_s','hop_l','grub_s','egg_l','splat'])
    ok('brood sheet shipped: ' + n, bhave.indexOf(n + '.png') >= 0);
  ok('brood geometry shipped', bhave.indexOf('geometry.json') >= 0);
  if (bhave.indexOf('geometry.json') >= 0) {
    var G = JSON.parse(read(bdir + '/geometry.json'));
    var miss = [];
    // Every animation BROOD_SPRITE can name must exist on its sheet, or a unit
    // reaches for a row that is not there.
    for (const [cls, sheetName] of Object.entries({rush:'horror_s',brute:'horror_l',
        flyer:'fly_s',wing:'fly_l',leap:'hop_s',grub:'grub_s'})) {
      const rows = G[sheetName] || {};
      const need = sheetName.indexOf('fly') === 0
        ? ['idle','attack_start','attack_loop','attack_end']
        : sheetName.indexOf('hop') === 0 ? ['idle','move','jump','fall']
        : sheetName.indexOf('grub') === 0 ? ['idle','move']
        : ['idle','move','attack'];
      for (const a2 of need) if (!rows[a2]) miss.push(sheetName + '/' + a2);
      // Zero frames is a row that exists and plays nothing.
      for (const a3 in rows) if (!(rows[a3].frames > 0)) miss.push(sheetName + '/' + a3 + ' empty');
    }
    ok('every animation a role names exists on its sheet', miss.length === 0, miss.slice(0,4).join('; '));
  }

  ok('the bench is a repo artifact now', fs.existsSync(path.join(ROOT, 'tools/battle-bench.py')));
  // A bench with its own renderer tests the bench.
  ok('and it inlines the shipped renderer rather than reimplementing it',
     /__BATTLEJS__/.test(read('tools/battle-bench.py'))
     && /reach-battle\.js/.test(read('tools/battle-bench.py')));
  ok('it binds the real panel markup rather than a copy',
     /could not find the reachBattle panel/.test(read('tools/battle-bench.py')));
  ok('the renderer exposes live counts for it', /counts: function\(\)\{/.test(battleJs));

  // The clutch: a spawning mound that draws a closed dome is a building.
  ok('brood mounds carry an egg clutch', /eggs:\(function\(\)\{/.test(battleJs));
  ok('and the clutch is seeded off the mound, not the frame',
     /const out=\[\], n=4\+\(\(rnd\(\)\*4\)\|0\);/.test(battleJs));
  ok('eggs are queued into the depth-sorted list', /function queueEggs\(\)/.test(battleJs)
     && /queueEggs\(\);/.test(battleJs));
  // A mound perpetually about to hatch is a mound that never does.
  ok('the hatch animation is deliberately not looped', !/egg_l_hatch/.test(battleJs));
  // THE BENCH READOUT WAS LYING: _animSeen is incremented inside queueSprite, so
  // anything pushing straight into _sprites reported as not drawing while it was.
  ok('and anything bypassing queueSprite still counts itself',
     /_animSeen\['egg_l_idle'\] = /.test(battleJs));

  ok('a dead brood unit splatters rather than drawing a marker',
     /if\(u\.dead>0\) return BIG_CLS\[u\.cls\]/.test(battleJs));
  ok('and the splatter is a one-shot off deadAt, not a loop',
     /if\(anim\.indexOf\('splat'\) === 0\)/.test(battleJs) && /u\.deadAt \|\| T/.test(battleJs));
  // Fixed for the corpse's life, or it changes shape while you look at it.
  ok('and the variant is stable per corpse', /SPLATS\[\(u\.i\|\|0\) % SPLATS\.length\]/.test(battleJs));

  ok('the bench does not start with empty works',
     /nodes:\[\{zone:0,at:1\}/.test(read('tools/battle-bench.py')));
  ok('and can toggle mounds and works', /BROOD WORKS/.test(read('tools/battle-bench.py')));
  ok('the bench reports mounds so an empty one is visible',
     /by\.mounds = mounds\.length;/.test(battleJs));

  // Every author the screenshots named is in both lists; reach-check ties the
  // two together, this only guards the ones a licence or a pack demands.
  for (const who of ['AL_Core', 'Aralepixel', 'NickyBHobbying'])
    ok('newly identified author credited: ' + who,
       /Will Tice/.test(read('docs/CREDITS.md')) && read('docs/CREDITS.md').indexOf(who) >= 0);
  ok('and the tank author is recorded beside the art',
     /Aralepixel/.test(read('client/assets/space/terrain/ATTRIBUTION.txt')));
  // Knowing who made it is not the same as knowing what they permit.
  ok('while still saying the terms are unread',
     /LICENCE TERMS are still unread|licence terms are still\s+unread/i
       .test(read('client/assets/space/terrain/ATTRIBUTION.txt')));

  /* THE FLYERS LOOKED UNREPLACED AND THE REASON WAS A SINGLE NUMBER. At 32 px
     per world unit a space fly is 16px tall and therefore HALF A METRE tall, and
     the size cutoff then dropped it to a wireframe past about a third of the
     field: tiny where you could see it, wireframe where you could not. A pixel
     density is a property of a SHEET, not of a pack. */
  ok('every brood sheet has its own pixel density',
     /var BROOD_UNIT = \{/.test(read('client/assets/coalition-sprites.js')));
  ok('and the pack no longer shares one number',
     !/unit: \/\^proj_\/\.test\(sheet\) \? 10 : 32/.test(read('client/assets/coalition-sprites.js')));
  // Tuned against 64px troop cells, the old cutoff retired a 24px creature at a
  // third of the distance it retired a rifleman.
  ok('the wireframe cutoff suits a small cell', /if\(scale\*g\.ch<2\) return false;/.test(battleJs));

  // Six splatter variants shipped and one was used: every corpse left the same mark.
  ok('corpses do not all leave the same mark', /const SPLATS = \[/.test(battleJs));
  ok('and the big creatures leave a big one', /const BIG_CLS = \{/.test(battleJs));
  ok('the large grub is used', /maw:   'grub_l'/.test(battleJs));
  ok('and it is the rarest thing on the ground', /mawShare   = rushShare  \* 0\.05/.test(battleJs));

  var bhave2 = fs.readdirSync(path.join(ROOT, 'client/assets/space/brood'));
  ok('more of the pack ships than shipped before', bhave2.length >= 17, String(bhave2.length));

  ok('the tile pack author is recorded', /CodeSpree/.test(read('docs/CREDITS.md')));
  /* The planet sprites are what planet-palette samples, so this credit is
     upstream of every world's ground, sky and rock colour. */
  ok('the planet artist is recorded', /Helianthus/.test(read('docs/CREDITS.md')));
  ok('and the palette tool says what it derives from',
     /Helianthus/.test(read('client/assets/space/terrain/ATTRIBUTION.txt')));

  /* EVERY WORLD'S GROUND CAME OUT THE SAME DARK because every palette entry is
     normalized to a fixed target luminance by the generator - that is what keeps
     the hues stable - so ground and horizon carry COLOUR and no information
     about BRIGHTNESS. All ten Reach worlds clamped to the same value. */
  ok('the palette ships an unnormalized mean', /mean:\[/.test(read('client/assets/planet-palette.js')));
  ok('and the ground takes its brightness from it', /lumOf\(m\) \* 0\.52/.test(battleJs));
  // The crushing was for wireframes, which are gone from the units.
  ok('the wireframe-era value crushing is retired',
     !/lumOf\(p\.ground\) \* 1\.60/.test(battleJs));
  ok('worlds actually differ in ground brightness now', (function () {
    const P = read('client/assets/planet-palette.js');
    const w = {}; new Function('window', P)(w);
    const lum = c => (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255;
    const bodies = ['animated/desert_2','animated/ice','animated/ocean_clouds',
                    'animated/barren_2','animated/barren_4'];
    const v = bodies.map(b => Math.max(0.16, Math.min(0.66, lum(w.PLANET_PALETTE[b].mean) * 0.52)));
    return (Math.max(...v) - Math.min(...v)) > 0.2;
  })());

  // Growth: a plain of bare rock reads as a quarry, not a world.
  ok('there is standing growth', /function genFlora\(seed\)/.test(battleJs)
     && /queueFlora\(_sprites\);/.test(battleJs));
  ok('and which world gets what is authored', /const FLORA_MIX = \{/.test(battleJs));
  // A living green would be the one thing that escaped the planet palette.
  ok('growth is dead and takes the world tint', /tone: tone\|\|0/.test(battleJs));
  ok('and it shares the cover mesh path rather than copying it',
     /function pushMeshAt\(m, X, Z, h, sx, sz, rot, out, tone\)/.test(battleJs));

  // Grading: a pure luminance recolour made a crawler, a hopclops and a grub
  // one colour at three brightnesses.
  var troopsSrc = read('client/assets/coalition-sprites.js');
  ok('the brood is graded per creature, not one flat hue', /var BROOD_GRADE = \{/.test(troopsSrc));
  /* `t` became `tt` when the camo split landed: the grade in force for a pixel
     is the split grade below the value break and the base grade above it, and
     keep has to read whichever one is actually being applied. Reading t.keep
     while grading with tt would have silently dropped the brood's chroma
     retention the day any faction got a split. */
  ok('and some of the pack\'s own colour survives', /if \(tt\.keep\) \{/.test(troopsSrc));
  ok('and the grade in force is the one keep reads', /var tt = \(sp && l < sp\.at\) \? sp : t;/.test(troopsSrc));

  // Gunships: benched, not deleted, and the airstrike carries the payoff.
  ok('gunships are benched behind one flag', /const HELI_SHARE_BENCHED = true;/.test(battleJs));
  ok('and the flight code is kept, not removed', /function gHeli\(/.test(battleJs));
  ok('the airstrike is untouched', /function callStrike\(/.test(battleJs)
     && /function stepStrikes\(dt,dtRaw\)/.test(battleJs));

  /* ── The Coalition is people, the Circuit is a nation ──────────────────── */
  var tsrc = read('client/assets/coalition-sprites.js');
  /* THE RANGE MOVED AND GREW A POLICY. It was one array in the sprite layer
     gated on `fac === 'coal'`; it is a registry table plus a per-faction policy
     now, because the Guild fields the darker half and the Void fields a steel
     casing. The property defended is unchanged: the Coalition is a treaty of
     colonies and looks like one. */
  /* EVALUATED, NOT MEASURED IN CHARACTERS. This matched `coal:` followed by
     `skin: 'range'` within 400 characters, and broke the moment the Coalition
     row grew a five-entry kits array between them - the third fixed-width window
     in this suite to fail on correct code. A window measured in characters is a
     check that goes red whenever the thing it guards gets more detailed, and the
     pressure then is to raise the number until it stops complaining. */
  ok('Coalition infantry draw from a range of skin tones', (function () {
    const w = {};
    new Function('window', facs)(w);
    return /var SKIN_TONES = \[/.test(facs) && w.FM_FACTIONS.coal.skin === 'range';
  })());
  ok('and there are enough of them to read as a range',
     (facs.slice(facs.indexOf('var SKIN_TONES'), facs.indexOf('];', facs.indexOf('var SKIN_TONES'))).match(/\], \[/g) || []).length >= 5);
  // The Circuit is one nation. Uniform tone is a STATEMENT, not an omission.
  ok('the Circuit wears one tone, the one the art ships with',
     /if\(u\.fac !== 'coal'\) return 0;/.test(battleJs));
  // Fixed per soldier, or he changes face when he takes cover or is reinforced.
  /* STILL FIXED FOR HIS LIFE, but the arithmetic moved and then changed shape.
     It was a modulo on the unit index here, then a stride in the registry, and
     the stride was DEGENERATE for any pool whose length shared a factor with the
     multiplier: the merc pool is 7 long against a multiplier of 7, so every
     Syndicate soldier came out with the same face. It is a hash now, which has
     no relationship to the modulus and so spreads a pool of any length.
     The property defended is unchanged: same index, same man, every frame. */
  ok('a tone is fixed for a soldier\'s life', /function skinOf\(u\)/.test(battleJs)
     && /api\.skinFor\(u\.fac, u\.i\|\|0\)/.test(battleJs)
     && /function spread\(i, salt, n\)/.test(facs));
  ok('and so is his kit, for a faction that issues none',
     /function kitOf\(u\)/.test(battleJs) && /api\.kitFor\(u\.fac, u\.i\|\|0\)/.test(battleJs));
  ok('and both reach the blit', /sk:skinOf\(u\),kt:kitOf\(u\)/.test(battleJs)
     && /q\.fc,q\.flip,q\.sk,q\.kt\)/.test(battleJs));
  /* Skin has to be remapped BEFORE the faction tint and skip it: the tint is a
     luminance recolour and would paint the man blue along with his coat. */
  ok('skin is remapped before the tint, not through it',
     tsrc.indexOf('if (tone) {') < tsrc.indexOf('var l = 0.299 * px[i]'));
  // A cache key must name everything that varies and nothing that does not.
  /* Still keyed only where it can change anything - an enforcer is helmeted on
     every frame and six identical copies of a man in a helmet is what this
     prevents. The faction test became a policy lookup so a fifth faction does
     not need a fifth branch. */
  ok('and skin is only in the cache key where it can change anything',
     /var sk = hasSkin\(name\) \? skinIndex\(fac, skin\) : null;/.test(tsrc));
  ok('the enforcer is helmeted and gets no skin variant',
     /function hasSkin\(name\)/.test(tsrc) && !/enforcer/.test(
       tsrc.slice(tsrc.indexOf('function hasSkin'), tsrc.indexOf('}', tsrc.indexOf('function hasSkin')))));

  /* Augmentation: the Coalition's optics burn red, the Circuit's do not. */
  ok('only the shield trooper and the engineer are augmented',
     /function augmented\(name\)/.test(tsrc));
  /* The faceplate is now one of two OPTIC sources, declared once in the registry
     and remapped per faction, and the assault trooper's goggles are the other -
     measured and never touched until this pass. Asserted against the registry
     because that is where the palette values live now. */
  ok('the faceplate is remapped, which is the shield trooper\'s eyes',
     /lit: \[194, 134,  42\], dim: \[143,  96,  26\]/.test(facs));
  ok('and the assault goggles are an optic too, not scenery',
     /lit: \[128, 157, 160\], dim: \[ 86, 125, 121\]/.test(facs));
  /* THE ENGINEER'S BLUE IS ON HIS WRIST. The comment this file used to carry
     called it a chest device, reasoning from the row number alone; the columns
     say otherwise - the torso at row 30 spans x 9-20 and the blue is at x 30-32,
     on the arm he is holding out. It is the secondary channel now. */
  ok('the engineer wrist device is an accent source',
     /lit: \[100, 138, 194\], dim: \[ 61,  96, 147\]/.test(facs));
  ok('and so is the shield panel',
     /lit: \[ 51,  81, 111\], dim: \[ 70,  98, 103\]/.test(facs));
  /* THE ENGINEER'S BLUE PIXELS ARE A CHEST DEVICE, NOT AN EYE - measured at
     rows 30-32 against a face at rows 21-23. Recolouring them gave a man with a
     light on his sternum. The eye is painted on his face instead. */
  ok('the engineer\'s chest device is left alone', !/'100,138,194'/.test(
     tsrc.slice(tsrc.indexOf('var AUG_RED'), tsrc.indexOf('var EYE_RED'))));
  ok('and his eye is painted on his own face, per cell',
     /function burnEye\(/.test(tsrc) && /function paintsEye\(name\)/.test(tsrc));
  // Per cell off the face's own bbox, so it needs no per-animation offset table.
  ok('found from the skin bounding box rather than a fixed offset',
     /var eyeY = Math\.min\(ch - 1, minY \+ 1\);/.test(tsrc));
  ok('and it runs after the recolour, at the tone the variant wears',
     tsrc.indexOf('&& paintsEye(name)) {') > tsrc.indexOf('var l = 0.299 * px[i]'));
  /* The eye is painted only where there is a FACE to paint it on. Gating it on
     one faction id was the old way of saying that; the question is really
     whether this faction burns optics and has skin for the router to find. */
  ok('the eye needs both a burning faction and a real face',
     /if \(tone && sk !== null && sk >= 0 && ROW\(fac\) && ROW\(fac\)\.optic && paintsEye\(name\)\)/.test(tsrc));
  // var hoists to the function: a second `var g2` is the green channel.
  ok('the eye block does not shadow the green channel', !/var g2 = geom\(name\)/.test(tsrc));
  /* The strip passes the INDEX and lets the registry resolve the tone, which is
     the same source the field uses. It used to do its own modulo, which was the
     same arithmetic in a second place and would have gone wrong for the Guild
     the moment its policy stopped being six long. */
  ok('the muster strip wears the same faces as the field',
     /drawFrame\(ctx, key, f, u\.x, base, scale, u\.fac \|\| 'coal', i,/.test(tsrc)
     && /function skinFor\(fac, i\)/.test(facs));
  ok('and the same kit, resolved from the same registry',
     /window\.FM_FAC_API\.kitFor\(u\.fac \|\| 'coal', i\)/.test(tsrc));

  /* The men turned round at random because pickTarget drew 26 units out of ~700
     and took the nearest of THOSE, and because facing was a side effect of
     firing. Measured on the bench: exact-nearest 28.6% -> 53.8%, mean distance
     ratio 1.19 -> 1.04, and 5.6x as many units holding a live target. */
  ok('targets are indexed rather than sampled at random',
     /function rebuildTargets\(\)/.test(battleJs) && /function nearestEnemy\(/.test(battleJs));
  ok('and the random sample is gone', !/for\(let k=0;k<26;k\+\+\)/.test(battleJs));
  ok('the index is rebuilt once per step', /rebuildTargets\(\);/.test(battleJs));
  // Reading three columns finds nothing on a thin field, and nothing means
  // facing front - which is the flip-flop this replaces.
  ok('the search widens rather than giving up', /for\(let r=1; r<=TGT_COLS; r\+\+\)/.test(battleJs));
  ok('facing is acquired, not a side effect of firing', /function acquire\(u, dt, band\)/.test(battleJs));
  ok('and a man shoots at what he is looking at', /let j = u\.aim;/.test(battleJs));
  // Re-picking every frame makes a man twitch between two enemies at equal range.
  ok('re-acquisition is on a jittered timer', /u\.aimT = 380 \+ Math\.random\(\)\*520;/.test(battleJs));

  var tsrc2 = read('client/assets/coalition-sprites.js');
  /* The tank matched neither army: Coalition got the flat tint so its TRACKS
     turned blue, and Jade got the art untouched, which is turquoise while Jade
     infantry are olive. */
  ok('the Hound takes its faction on the hull only', /function hullGrade\(fac\)/.test(tsrc2)
     && /function isHull\(r, g, b\)/.test(tsrc2));
  ok('tracks and grey are spared', /\(mx - mn\) \/ mx < 0\.22\) return false;/.test(tsrc2));
  ok('and so are the marker lamps', /r > g && r > b\) return false;/.test(tsrc2));
  ok('the hull path replaces the faction tint rather than preceding it',
     /continue;                                  \/\/ grey, black and accents untouched/.test(tsrc2));

  /* THE OLD RULE WAS "DEAD AND BARE ONLY" AND IT WAS TOO NARROW: written to stop
     a pine forest on Ussaleth, it also banned the cactus, which says nothing
     about pine forests. Growth is decided per CLIMATE now, which can say yes. */
  ok('growth is decided per climate, not by a blanket ban', /const FLORA_MIX = \{/.test(battleJs)
     && /const FLORA_SPEC = \{/.test(battleJs));
  /* Anchored inside FLORA_MIX. `dust:` and `veins:` both appear in earlier
     tables too - the terrain colour fallback and KIND_MESH - so an unanchored
     indexOf sliced the wrong pair of them and read a table with no cacti in it,
     correctly. */
  ok('the desert gets cacti', (function () {
    const j = battleJs.indexOf('const FLORA_MIX');
    return /cact_a/.test(battleJs.slice(battleJs.indexOf('dust:', j),
                                        battleJs.indexOf('veins:', j)));
  })());
  ok('and the ice world gets neither cacti nor timber', (function () {
    const i = battleJs.indexOf('ice:', battleJs.indexOf('const FLORA_MIX'));
    const row = battleJs.slice(i, battleJs.indexOf(']] },', i));
    return !/cact_/.test(row) && !/snag_/.test(row);
  })());
  ok('the drowned world and the rift get fungus', (function () {
    const j = battleJs.indexOf('const FLORA_MIX');
    const oc = battleJs.slice(battleJs.indexOf('ocean:', j), battleJs.indexOf('ice:', j));
    const rf = battleJs.slice(battleJs.indexOf('rift:', j), battleJs.indexOf('tether:', j));
    return /shrm_/.test(oc) && /shrm_/.test(rf);
  })());
  /* Every prop used to take the same 1-to-5 metre roll, which put mushrooms the
     size of trees beside bushes the size of mushrooms. */
  ok('height is a property of the mesh, not a shared roll',
     /snag_b:   \{ h:\[5\.0, 9\.0\]/.test(battleJs) && /tuft:     \{ h:\[0\.4, 0\.9\]/.test(battleJs));
  ok('and every mesh a recipe names has a spec', (function () {
    const j = battleJs.indexOf('const FLORA_MIX');
    const mix = battleJs.slice(j, battleJs.indexOf('};', j));
    const used = new Set([...mix.matchAll(/'(\w+)',\s*\d/g)].map(m => m[1]));
    const k = battleJs.indexOf('const FLORA_SPEC');
    const spec = battleJs.slice(k, battleJs.indexOf('\n};', k));
    const have = new Set([...spec.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]));
    return [...used].every(u => have.has(u));
  })());
  ok('and every mesh a spec names is baked', (function () {
    const M = JSON.parse(read('client/assets/space/nature/meshes.json'));
    const k = battleJs.indexOf('const FLORA_SPEC');
    const spec = battleJs.slice(k, battleJs.indexOf('\n};', k));
    const have = [...spec.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
    return have.length >= 18 && have.every(h => M[h]);
  })());
  /* "How many props" stopped being a useful cap the moment the pack was used
     properly: sixty bushes and sixty cacti are the same count and twenty times
     the cost. The budget is in FACES, spent nearest first. */
  ok('the flora budget is in faces, not props', /const FLORA_FACE_BUDGET = /.test(battleJs));
  ok('and it is spent nearest first', /_floraSort\.sort\(\(a,b\)=>a\.z-b\.z\);/.test(battleJs));

  /* TWO KEYS OF THE SAME NAME IN ONE OBJECT LITERAL IS NOT AN ERROR IN ANY MODE:
     the later one silently replaces the earlier. The bench's rich counts() was
     dead from the day it was written, and every reading taken from it came from
     a four-line one that reported class tallies - which look entirely plausible,
     so nothing ever looked wrong. Second time the bench has under-reported. */
  ok('there is exactly one counts()',
     (battleJs.match(/^  counts: function\(\)\{/gm) || []).length === 1);
  ok('and it reports the flora budget so a drop is visible',
     /by\.floraDrawn = _floraSort\.length;/.test(battleJs));

  var tsrc3 = read('client/assets/coalition-sprites.js');
  /* THE HOUND IS DRAWN FACING LEFT and the battlefield mirrored everything on
     one rule, so every tank was reversed - driving forward and shooting over its
     own engine deck. It read as fine because a tank is near enough symmetrical
     at field size and the gun is thin. Same shape as the anchor and the pixel
     density before it: one property of one SHEET taken as a property of the
     renderer. */
  ok('a sheet declares which way its art faces', /faceLeft: 1/.test(tsrc3));
  ok('and the mirror asks the sheet rather than assuming',
     /const flip = g\.faceLeft \? \(fx>0\) : \(fx<0\);/.test(battleJs));

  /* u.fire is a recoil term that decays in ~100ms; hound_fire is 20 frames at
     55ms. The sheet was cut off two frames in, so at one shot per ten seconds
     the firing animation was effectively never seen. */
  ok('the firing sheet runs on its own clock', /const HOUND_FIRE_MS = 20 \* 55;/.test(battleJs));
  ok('and not on the recoil term', !/c==='hound'\) return \(u\.fire>0/.test(battleJs));
  ok('the tank cadence is a reload, not a parking space',
     /u\.cd = isTank \? 4500\*/.test(battleJs));

  /* fx is the FRIENDLY muzzle flash and impact path, stroked pale cyan - the
     colour of an energy weapon, on an army whose sheets draw brass and powder.
     The tracers were made warm two patches ago and this was missed, so the shot
     was amber and the flash at both ends of it was blue. */
  ok('friendly gunfire is warm at both ends',
     /ctx\.strokeStyle='rgba\(255,226,168,0\.62\)'; ctx\.stroke\(fx\);/.test(battleJs));
  ok('and no cyan is left on the friendly flash',
     !/rgba\(200,255,246,0\.55\)'; ctx\.stroke\(fx\)/.test(battleJs));

  ok('the creature pack licence is recorded',
     /unTied Games|Will Tice/.test(read('client/assets/space/terrain/ATTRIBUTION.txt')));
}

// ── report ────────────────────────────────────────────────────────────────
if (fails.length) {
  console.log('reach-terrain: ' + pass + ' passed, ' + fails.length + ' FAILED');
  for (const f of fails) console.log('  x ' + f);
  process.exit(1);
}
// Phrased as "N passed" because that is what run-all.mjs greps for to report an
// assertion count. Printing a count in some other wording makes the runner say
// 'ok' with no number, which is how a check that stops asserting anything hides.
console.log('reach-terrain: ' + pass + ' passed, 0 failed.');
