// ═══════════════════════════════════════════════════════════════════════════
// city-battle-check.mjs — the city battlefield viewer is REACHABLE and the
// faction id map is total.
//
//   node tools/city-battle-check.mjs
//
// SPLIT FROM THE HARNESS ON PURPOSE. tools/citybattle-harness.mjs draws frames
// and needs node-canvas, which is a native build and not a dependency this repo
// should acquire to run its checks. Everything in here is text and plain
// JavaScript, so run-all.mjs picks it up and runs it everywhere.
//
// WHAT IT IS ACTUALLY GUARDING. The viewer can be pixel perfect and completely
// unreachable, and every way that happens is silent:
//
//   * index.html stops lazy-loading the module        - nothing opens, no error
//   * an overlay id is renamed                        - cityWatch refuses quietly
//   * city.js loses the button                        - no way in from the game
//   * a faction is added to galaxy.js with no registry row
//                                                     - a colony held by it
//                                                       draws as somebody else
//
// The last one is the one that bites hardest, because galaxy.js and factions.js
// have ALWAYS used different ids for the same factions - 'coalition' against
// 'coal', 'syndicate' against 'synd' - and three of the six collide by luck,
// which is exactly why nobody noticed. The map lives on the registry row now,
// and this asserts it covers every faction galaxy.js keys a control percentage
// on.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(ROOT, 'client');
const read = (rel) => fs.readFileSync(path.join(CLIENT, rel), 'utf8');

let pass = 0;
const fails = [];
function ok(what, cond) { if (cond) pass++; else fails.push(what); }

// ── the module exists and is parseable in isolation ────────────────────────
const factionsSrc = read('assets/factions.js');
const battleSrc   = read('assets/city-battle.js');
const indexSrc    = read('index.html');
const citySrc     = read('assets/city.js');
const benchSrc    = read('citybattle-mock.html');
const harnessSrc  = fs.readFileSync(path.join(ROOT, 'tools/citybattle-harness.mjs'), 'utf8');

// ── reachable from the client ──────────────────────────────────────────────
ok('index.html lazy-loads assets/city-battle.js',
   indexSrc.includes("lazyLoad('assets/city-battle.js')"));
ok('the module rides behind the galaxy bundle, like reach-battle.js',
   indexSrc.indexOf("lazyLoad('assets/city-battle.js')") >
   indexSrc.indexOf("lazyLoad('assets/galaxy.js'"));
for (const id of ['cityBattle', 'cbCanvas', 'cbStat', 'cbTitle', 'cbSub']) {
  ok('index.html carries #' + id, indexSrc.includes('id="' + id + '"'));
}
for (const m of ['flank', 'orbit', 'free']) {
  ok('index.html carries the ' + m + ' camera button',
     indexSrc.includes('id="cbCam_' + m + '"'));
}
ok('the close button calls cityWatchClose',
   indexSrc.includes('window.cityWatchClose'));
ok('city.js offers a way in', citySrc.includes('window.cityWatch('));
ok('city.js only offers it when two factions hold ground',
   citySrc.includes('CB.rosterFor'));

// ── the module publishes what the page calls ───────────────────────────────
for (const g of ['cityWatch', 'cityWatchClose', 'cbSetCam']) {
  ok('city-battle.js publishes ' + g, battleSrc.includes('global.' + g + ' ='));
}
ok('city-battle.js binds #cbCanvas', battleSrc.includes("'cbCanvas'"));
ok('city-battle.js reads gState rather than owning a roster',
   battleSrc.includes('global.gState'));
ok('city-battle.js crosses the id gap through the registry',
   battleSrc.includes('fromGalaxy'));

// ── it is not a second copy of the renderer ────────────────────────────────
// The lesson battle-test.html already wrote down: a bench holding its own copy
// drifts from the real one and starts lying the first time either is touched.
/* Matched without the query, because the bench now busts its script tags. */
ok('the bench drives the shipped module',
   /src="assets\/city-battle\.js(\?[^"]*)?"/.test(benchSrc));
ok('the bench holds no faction table of its own',
   !/var\s+FACTIONS\s*=/.test(battleSrc));
ok('the module holds no frames table of its own',
   !/var\s+FRAMES\s*=/.test(battleSrc));
ok('the module holds no skin table of its own',
   !/var\s+SKIN_TONES\s*=/.test(battleSrc));
ok('the module draws through FMTroops',
   battleSrc.includes('TR().drawAnchored'));

// ── the id map is total over galaxy.js ─────────────────────────────────────
/* new Function rather than eval, because indirect eval runs in GLOBAL scope and
   cannot see a local sandbox - which is the whole point of having one. Both
   files are plain scripts that assign onto `window`, so handing them a window
   is the entire shim. Nothing leaks into this process. */
function loadInto(sandbox, src) { new Function('window', src).call(sandbox, sandbox); }

const win = { addEventListener() {}, document: { getElementById: () => null } };
loadInto(win, factionsSrc);
const api = win.FM_FAC_API;
ok('factions.js exposes fromGalaxy', typeof api.fromGalaxy === 'function');
ok('factions.js exposes toGalaxy', typeof api.toGalaxy === 'function');

const galaxySrc = read('assets/galaxy.js');
const keyed = [...new Set([...galaxySrc.matchAll(/control_([a-z]+)/g)].map(m => m[1]))];
ok('galaxy.js keys control on at least four factions', keyed.length >= 4);
for (const g of keyed) {
  ok('galaxy faction "' + g + '" has a registry row', !!api.fromGalaxy(g));
}
// Round trip, both ways, for everything that maps.
for (const g of keyed) {
  const f = api.fromGalaxy(g);
  if (f) ok('"' + g + '" round trips', api.toGalaxy(f) === g);
}
// fleshstation is a station, not a polity. It must map to NOTHING rather than
// to whatever happens to be first, so a caller can refuse to draw it.
ok('fleshstation deliberately maps to nothing',
   galaxySrc.includes('fleshstation:') && api.fromGalaxy('fleshstation') === null);
ok('the brood has no galaxy id', api.toGalaxy('khai') === null);

// ── cache busting, which is why the bench showed the old build ─────────────
/* A BROWSER CACHES A 404 AS READILY AS A 200. coalition-sprites.js has said so
   since it shipped, and it just bit: the grass patches and the whole city/
   directory are NEW, so any browser that opened the bench before they existed
   remembers the miss and never asks again - which presents as the scene
   rendering with the previous build's graphics while the file on disk is
   current. Not a stale script: a remembered absence. */
ok('terrain patches are cache busted', /'terrain\/' \+ key \+ '\.png' \+ bust\(\)/.test(battleSrc));
ok('meshes.json is cache busted', /nature\/meshes\.json' \+ bust\(\)/.test(battleSrc));
ok('the bust reads FM_BUILD rather than a second literal',
   /global\.FM_BUILD \? \('\?v=' \+ global\.FM_BUILD\)/.test(battleSrc));
/* The bench's own script tags cannot read FM_BUILD - it does not exist until
   one of them has loaded - so that literal IS a second copy of the version and
   is asserted here, exactly as reach-check does for coalition-sprites' BUILD. */
const ver = JSON.parse(fs.readFileSync(path.join(CLIENT, 'version.json'), 'utf8')).version;
for (const mod of ['planet-palette', 'factions', 'coalition-sprites', 'city-battle']) {
  ok('the bench busts ' + mod + '.js at the current build',
     benchSrc.includes('assets/' + mod + '.js?v=' + ver));
}

ok('the bench checks its own build against version.json',
   /STALE BUILD/.test(benchSrc) && /version\.json/.test(benchSrc));

// ── the modular kit, and the licence position on it ───────────────────────
const kitPath = path.join(CLIENT, 'assets/space/city/kit.json');
ok('the modular city kit is baked and shipped', fs.existsSync(kitPath));
if (fs.existsSync(kitPath)) {
  const kit = JSON.parse(fs.readFileSync(kitPath, 'utf8'));
  const names = Object.keys(kit);
  ok('the kit has the whole modular set', names.length > 400);
  const roles = new Set(names.map((n) => kit[n].role));
  for (const r of ['wall', 'window', 'door', 'roof', 'road', 'ground'])
    ok('the kit provides ' + r + ' pieces', roles.has(r));
  /* ONE COLOUR PER FACE IS THE WHOLE POINT. Canvas 2D can only map an image
     through an AFFINE transform, and a rectangle in perspective is a
     PROJECTIVE map - which is why the textured facades bowed and gapped no
     matter how finely they were subdivided. A flat-filled polygon has no such
     problem at any angle or distance. */
  const one = kit[names[0]];
  ok('every face carries a baked colour', one.c && one.c.length === one.f.length);
  ok('every face carries a baked emissive', one.e && one.e.length === one.f.length);
  ok('and no texture coordinates survive', one.uv === undefined);
  ok('some pieces are lit', names.some((n) => (kit[n].e || []).some((e) => e > 0)));
}
ok('the baker is shipped with it', fs.existsSync(path.join(ROOT, 'tools/city-meshes.py')));
const kitAttr = fs.existsSync(path.join(CLIENT, 'assets/space/city/KIT_ATTRIBUTION.txt'))
  ? fs.readFileSync(path.join(CLIENT, 'assets/space/city/KIT_ATTRIBUTION.txt'), 'utf8') : '';
ok('the kit names its author', /Author:\s+Voloshka/.test(kitAttr));
ok('and links its source', /viravoloshyn\.itch\.io/.test(kitAttr));
/* THE PACK WITH NO STATED TERMS IS NOT SHIPPED, and the check says so by name
   rather than trusting that nobody bakes it later. */
/* THIS PACK WAS BLOCKED AND IS NOW PURCHASED. The block was correct while the
   terms were unknown and unbought; the purchase settles USE, which is what was
   missing. It does not settle redistribution - the page still states no terms -
   so the posture is the same as the kit's: derived mesh data ships, the source
   FBX does not. */
ok('the purchase is recorded, not just assumed',
   /Terms:\s+PURCHASED/.test(kitAttr));
ok('and the source FBX is still not redistributed',
   !fs.existsSync(path.join(CLIENT, 'assets/space/city/building_1.fbx')));

// ── the window economy, which is where the detail actually lives ─────────
/* MEASURED: window kinds cost between 18 and 146 faces - an eight-fold spread
   the picker was sampling UNIFORMLY, so one window in ten cost as much as
   eight. That is what emptied the budget partway down the sorted list and left
   whole buildings in blank wall. */
ok('window kinds are split by cost', /WIN_RICH/.test(battleSrc) && /WIN_CHEAP/.test(battleSrc));
ok('the 146-face window is in neither pool',
   /Window2 IS NOT IN EITHER POOL/.test(battleSrc) &&
   !/WIN_RICH  = \[2,/.test(battleSrc));
/* THE BUDGET WAS BEING SPENT ON ELEVATIONS FACING AWAY FROM THE CAMERA. Two of
   four sides are back-face culled, so on a building seen from the front-right
   the allowance went on the back and left and the visible sides got plain
   wall - which is why the NEAREST building was the blankest in the frame. */
ok('only visible elevations are built', /SPEND THE BUDGET ON THE SIDES YOU CAN SEE/.test(battleSrc));
ok('a hidden side is skipped, not pushed and culled',
   /if \(!sideVis\[side\]\) continue;/.test(battleSrc));
/* A flat allowance starves a tall tower: nine storeys have three times the
   modules of three and were given the same. */
ok('the allowance scales with visible modules', /visMods \* 26/.test(battleSrc));

// ── measured against the author's own demo city ───────────────────────────
/* THE PAID DEMO SCENE IS USED AS A MEASUREMENT, NOT AS AN ASSET. Nothing from
   it is baked or shipped - see KIT_ATTRIBUTION.txt - but counting what the
   pack's author actually built with their own kit is free and it corrected
   three of our ratios: 738 pavement tiles against 617 of road (the walkway is
   WIDER than the carriageway), 55 of Lamp2 against 6 of Lamp1 (the cheap post
   is the STANDARD one), and roughly two windows for every plain wall. */
ok('the pavement is wider than one tile', /TWO TILES OF PAVEMENT, NOT ONE/.test(battleSrc));
ok('the cheap lamp is the default', /i < 3 \? 'Lamp1' : 'Lamp2'/.test(battleSrc));
ok('bays can be glazed as a continuous strip', /Window10' \+ seg/.test(battleSrc));
ok('a glazed bay holds all the way up, not half',
   /a property of the BAY, not of the\s+module/.test(battleSrc));

// ── the far city is real geometry now ─────────────────────────────────────
/* THE GLYPH SKYLINE WAS A GRID OF CHARACTERS AND THE PRISM ONE A BOX. Both
   stood in for towers the game did not have. The modern pack has thirteen, and
   the CHEAP ones are the TALL ones - building_12 is 30x90x30 units at FOUR
   HUNDRED AND TWENTY FACES - because a plain tower is a few extruded boxes
   while a detailed low-rise is a hundred mullions. */
const modernPath = path.join(CLIENT, 'assets/space/city/modern.json');
ok('the modern pack is baked and shipped', fs.existsSync(modernPath));
if (fs.existsSync(modernPath)) {
  const mo = JSON.parse(fs.readFileSync(modernPath, 'utf8'));
  ok('it carries buildings', Object.keys(mo).filter((n) => /^building/.test(n)).length >= 10);
  /* THE FIRST BAKE CAME OUT WITH EVERY BUILDING EXACTLY 2x2 UNITS: the meshes
     are unit cubes and ALL their shape is in the Model's Lcl Scaling, which
     the palette baker never had to read. Ignoring it turns a sixty storey
     tower and a corner shop into the same box. */
  const b12 = mo['building_12'];
  if (b12) {
    const ys = b12.v.filter((_, i) => i % 3 === 1);
    ok('the model transform was applied, not dropped',
       (Math.max(...ys) - Math.min(...ys)) > 1000);
  }
  ok('every face carries a material colour',
     mo['building_12'] && mo['building_12'].c.length === mo['building_12'].f.length);
}
ok('the pack is baked from material colours, having no textures',
   /def bake_materials/.test(fs.readFileSync(path.join(ROOT, 'tools/city-meshes.py'), 'utf8')));
ok('and the Z-up convention is converted', /Z-UP/i.test(
   fs.readFileSync(path.join(ROOT, 'tools/city-meshes.py'), 'utf8')));
ok('the skyline can be drawn as real buildings', /drawModelSkyline/.test(battleSrc));
ok('the near ring is skipped, being too close to be a skyline',
   /The skyline starts where the city ends/.test(battleSrc));
ok('the pack\'s daylight materials are graded to night', /SKY_AMBIENT/.test(battleSrc));

// ── the lots are paved, not painted ──────────────────────────────────────
/* THE GROUND BETWEEN THE BUILDINGS WAS A 512px LUMINANCE PATCH STRETCHED OVER
   A PLANE, and at a steep angle over a large flat area it smears into
   horizontal streaks. MEASURED FIRST: the depth ratio across a band is 1.23
   looking down, so this is NOT the band affine failing - it is a pattern
   covering forty metres of world being asked to hold at close range. A
   flat-coloured face cannot smear. */
ok('lots are paved with kit tiles', /The lots are PAVED, not painted/.test(battleSrc));
ok('the plain outside keeps the band pass, which is what it is for',
   /bandPass\(P0\.grass/.test(battleSrc));
ok('the audit has the angle this was reported from', /a_ground/.test(harnessSrc));

// ── road wear is a dial, not a decision made three times ──────────────────
/* FLAT, THEN JITTERED, THEN WIDER, THEN FLAT AGAIN. That is a taste call
   rather than a correctness one, and one that keeps flipping belongs behind a
   number. CB.opt.roadWear scales the jitter and the patches from one value,
   and at zero the patch pass does not run at all - so uniform is also the
   cheapest setting. */
ok('road wear is a single dial', /roadWear/.test(battleSrc));
ok('zero means exactly the palette colour, not nearly',
   /if \(w <= 0\) return 1;/.test(battleSrc));
ok('patches switch off well before the dial does',
   /if \(w < 0\.5\) return false;/.test(battleSrc));
ok('it defaults to flat', /roadWear: 0,/.test(battleSrc));
ok('the bench can move it', /rW/.test(benchSrc) && /roadWear = \(\+this\.value\)/.test(benchSrc));

// ── the skyline is off, and the measurement says why it is not a saving ───
/* MEASURED BEFORE REMOVING: 35 sprites, 1.25 megapixels, 2.3ms of a 472ms
   frame - under half a percent. It is off because it was asked for, which is a
   legitimate reason and a different one from performance. */
/* The skyline came back ON when it stopped being a grid of characters and
   became real towers - a different thing to have on the horizon than the one
   that was switched off. The measurement note stays because it is still the
   honest answer to "does this cost anything". */
ok('the skyline default is explicit either way', /skyline: (true|false)/.test(battleSrc));
ok('the measurement is recorded rather than the claim',
   /under half a percent/.test(battleSrc));
ok('the toggle still exists', /CB\.opt\.skyline/.test(battleSrc));
/* AND IT WENT BACK OFF, which is the third position this switch has held and
   the first one with a picture behind it. Real geometry at 1400m is a
   silhouette: every face lands within a few luminance values of every other,
   the haze closes the rest, and what reaches the screen is a flat coloured
   rectangle four hundred pixels wide behind a street that has windows, kerbs
   and parapets on it. A look failure, not a bug, so all three styles stay. */
ok('the reason the model skyline is off is recorded, not just the switch',
   /flat coloured rectangle/.test(battleSrc));
ok('none of the three styles was deleted for it',
   /drawModelSkyline/.test(battleSrc) && /drawGlyphTowers/.test(battleSrc) &&
   /skylineStyle === 'glyph'/.test(battleSrc));
/* ── THE BENCH HUD WAS HARDCODED AND THEREFORE WRONG ──────────────────────
   bSky was born class="on" and bStyle said "glyph" while the renderer's
   defaults were off and 'model'. The page opened misreporting the two things
   it exists to look at, and the first click on either moved it the wrong way.
   Both read CB.opt now, and 'model' is in the rotation - it was not, so the
   shipped default was the one style the bench could not get back to. */
ok('the bench reads the skyline default rather than asserting one',
   /bSky\.classList\.toggle\('on', CB\.opt\.skyline\)/.test(benchSrc));
ok('the bench cycles all three styles', /SKY_STYLES = \['model'/.test(benchSrc));

// ── not every piece is authored at the module scale ───────────────────────
/* MEASURED PIECE BY PIECE at the 200-unit module scale: a lamp is 5.8m, a bin
   1.3m, a sign 4.9m, a fence 2.0m - all correct. A TREE IS 32 METRES. A
   rooftop barrel is 5.6m and the big one 8.5m. A flight of steps is 6m tall.
   The kit is modular at module scale and its SET PIECES are not, so dropping
   them in at KIT_S lines the street with trees taller than the buildings. */
ok('oversized set pieces carry their own scale', /var PROP_SCALE = \{/.test(battleSrc));
ok('trees, barrels and steps are all in it',
   /Tree1: /.test(battleSrc) && /RoofBarrel: /.test(battleSrc) && /Steps1: /.test(battleSrc));
ok('the scale is applied to geometry and normals alike',
   /var KS = KIT_S \* \(PROP_SCALE\[name\] \|\| 1\);/.test(battleSrc) &&
   !/\*KIT_S;/.test(battleSrc));

// ── detail, once the frame budget stopped being the constraint ────────────
ok('three roof families are in use', /var ROOF_STYLE = \{/.test(battleSrc));
ok('roof style follows the sector', /'Iron Foundries': \[1, 1, 1\]/.test(battleSrc));
ok('doors get steps', /A door opening onto bare pavement is a door in a wall/.test(battleSrc));
ok('lamps have a cheap distance variant', /'Lamp1' : 'Lamp2'/.test(battleSrc));
ok('service covers are in the road, not on the pavement',
   /Service covers sit in the ROAD/.test(battleSrc));
ok('trees are capped hard, being the costliest object', /TREE_MAX/.test(battleSrc));

// ── the grid is a street NETWORK, not three parallel avenues ─────────────
/* THE KERBS RAN STRAIGHT THROUGH EVERY JUNCTION AND THE CROSS STREETS HAD NO
   KERB AT ALL. Both are the same omission: nothing described what happens
   where two streets meet, because the grid was laid as independent avenues. */
ok('the kerb stops short of a junction', /function inJunction/.test(battleSrc));
ok('junction corners are mitred', /PavementCornerBig/.test(battleSrc));
ok('the corner rotation came from the bake',
   /carriageway in its \(\+X,\+Z\) quadrant/.test(battleSrc));
ok('cross streets get kerbs and pavement too',
   /A cross street runs along X, which is the piece's own axis/.test(battleSrc));
ok('the road carries an edge line', /tile\('SolidLine'/.test(battleSrc));

// ── the kit's unused pieces, put to work ──────────────────────────────────
/* A FLAT SLAB IS MOST OF WHAT AN ORBIT OR OVERHEAD CAMERA SEES. Roof1 is a
   four-face edge and Roof1Corner a ten-face corner, so a whole perimeter costs
   less than three windows. */
/* These named 'Roof1' directly, and the roof family is now chosen per sector -
   so the literal correctly stopped existing. What matters is that an edge and
   a corner piece are placed at all, whichever family they come from. */
ok('roofs have a parapet edge', /pushKit\(rEdge \+ bb\.pal/.test(battleSrc));
ok('and mitred corners', /pushKit\(rEdge \+ 'Corner' \+ bb\.pal/.test(battleSrc));
ok('the parapet direction was measured, not assumed',
   /carries its parapet on the \+Z edge/.test(battleSrc));
ok('near roofs carry barrels', /RoofBarrel/.test(battleSrc));

// ── four faults found by looking, then fixed ──────────────────────────────
/* (1) THE CARRIAGEWAY WAS ONE FLAT COLOUR PER TILE and a road of identical
   tiles is a featureless slab at eye level. The jitter IS the tile, so it
   needs no texture and cannot misalign. Hashed on position, because a
   per-frame roll would make the road boil. */
ok('road tiles are jittered off the palette', /function tileJitter/.test(battleSrc));
ok('the jitter is hashed on position, not rolled',
   /hashStr\(\(\(x\*7\.31\)\|0\)/.test(battleSrc));
ok('roads and pavements take it', /tile\('Road', lx, z \+ t0\*0\.5, 0, 1\)/.test(battleSrc));

/* (2) A FOUNDRY DOES NOT LITTER LIKE A BANK. The kit's bins, fences, signs,
   steps and sewerage were shipped and never placed. */
ok('street furniture is placed', /var FURNITURE = \{/.test(battleSrc));
ok('and weighted by sector',
   /'Iron Foundries':/.test(battleSrc) && /'Gray Bazaar':/.test(battleSrc));
ok('with a cap, because Bin is 40 faces', /FURN_MAX/.test(battleSrc));

/* (3) EVERY WALL IS SINGLE-SIDED WITH ITS NORMAL OUTWARD, so from inside a
   building every one faces away, every one is culled, and you see straight out
   through your own building at the whole street. A free camera reaches that in
   about a second. Verified by putting the camera at a real building's centre
   rather than at a guessed coordinate. */
ok('a building the camera is inside inverts its cull', /flipCull/.test(battleSrc));
ok('and the audit stands inside a real building, not a guess',
   /CB\.buildings\(\)/.test(harnessSrc) && /a_inside/.test(harnessSrc));
ok('the renderer can report its buildings for that', /CB\.buildings = function/.test(battleSrc));

/* (4) THE PAINTER SORT USED EACH FACE'S NEAREST CORNER. A long wall seen
   obliquely has one corner close and the rest far, so it sorted as if the
   whole wall were at its nearest point and popped in front of things it is
   behind - which is the flicker on an orbiting camera. */
ok('faces sort on their centroid, not their nearest corner',
   /SORTED ON THE CENTROID, NOT THE NEAREST CORNER/.test(battleSrc) &&
   !/z: zmin, kind: 'face'/.test(battleSrc));

// ── it has to hold up from every camera ───────────────────────────────────
/* EVERY FAULT IN THIS RENDERER SO FAR HAS BEEN VISIBLE FROM EXACTLY ONE
   VIEWPOINT. Walls facing inward look fine head-on and hollow from a corner. A
   kerb laid across the street reads as texture from above and as a ladder at
   eye level. A roof at the wrong height is invisible until you are over it. A
   single screenshot is not evidence that a scene is correct. */
ok('there is a multi-angle audit', /--angles/.test(harnessSrc));
ok('it covers eye level, orbit and overhead',
   /a_eye/.test(harnessSrc) && /a_orbit/.test(harnessSrc) && /a_top/.test(harnessSrc));
ok('and it fails an angle that draws almost nothing',
   /only ' \+ st\.faces \+ ' quads/.test(harnessSrc));
/* MEASURED, TWICE NOW: a piece's geometry says which way it faces, and both
   times it was placed by assuming an axis instead of reading one. */
/* *** AND THIS ASSERTION PINNED THE WRONG HALF OF THAT LESSON. *** It froze
   the LITERAL - `Math.PI/2 : -Math.PI/2` - which is the exact pair that had
   both avenue kerbs turned a hundred and eighty degrees, road half facing the
   buildings and pavement deck cantilevered over the carriageway. So the check
   was actively holding the bug in place: any correct rotation would have
   failed it. Replaced above by one that derives the required angle from the
   BAKE - find the road-coloured face, see which side of z it sits on, and
   require sin(theta) to point it at the street - so the piece and its rotation
   cannot drift apart if either is re-authored. Only the quarter-turn itself is
   asserted here now. */
ok('the kerb is turned a quarter to run along an avenue',
   /BOTH AVENUE KERBS WERE TURNED THE WRONG WAY/.test(battleSrc) &&
   /sgn > 0 \? -?Math\.PI\/2 : -?Math\.PI\/2\);/.test(battleSrc));
ok('building footprints snap to whole modules',
   /SNAP THE FOOTPRINT TO WHOLE MODULES/.test(battleSrc) &&
   /bw = Math\.max\(1, Math\.round\(bw \/ MOD_M\)\) \* MOD_M;/.test(battleSrc));
ok('and the collision box uses the snapped footprint, not the original',
   battleSrc.indexOf('bw = Math.max(1, Math.round(bw / MOD_M))') <
   battleSrc.indexOf('props.push({ poly: rect(bx, bz, bw, bd, 0), y0: 0, h: bh'));

// ── the street is laid from the kit too ───────────────────────────────────
ok('roads, kerbs and crossings come from the kit', /function queueKitStreet/.test(battleSrc));
ok('the kit lamps replaced the prism ones',
   /'Lamp1' : 'Lamp2'/.test(battleSrc) && /The prism lamps are gone/.test(battleSrc));
ok('lamps are capped, because Lamp1 is 142 faces', /LAMP_MAX/.test(battleSrc));
ok('street tiles are laid over the view radius, not the map',
   /Tiled only where it is seen|TILED ONLY WHERE IT IS SEEN/i.test(battleSrc));
/* *** THIS ASSERTED THE PASS WAS DELETED AND THAT WAS THE WRONG INVARIANT. ***
   It was written when drawing the road twice put a tinted noise pattern under
   every road tile and a painted dash under every real one - the fault was
   BOTH at once, not the pass existing. Asserting absence made "never draw the
   ground the way the Reach draws it" a permanent rule on the strength of one
   double-draw, and the pass has been asked for back.

   What actually has to hold is that the two never draw at the same time: the
   pass runs only when CB.opt.groundTex is on, and the two pure-surface tiles
   stand down when it is. Absence is not the invariant; exclusivity is. */
ok('the painted surface and the flat tiles are mutually exclusive',
   /if \(CB\.opt\.groundTex <= 0\) return;/.test(battleSrc) &&
   /if \(CB\.opt\.groundTex > 0 && SURFACE_ONLY\[name\]\) return;/.test(battleSrc));
ok('and the pass is gated rather than deleted',
   /bandPass\(P\.asph/.test(battleSrc) && /bandPass\(P\.pave/.test(battleSrc));
ok('the ground plain survives, because the kit has no piece for it',
   /bandPass\(P0\.grass/.test(battleSrc));

// ── the city is assembled from the kit ────────────────────────────────────
ok('the renderer loads the kit', /function loadKit/.test(battleSrc));
ok('buildings are emitted as modules', /function kitBuilding/.test(battleSrc) &&
   /function queueKitBuildings/.test(battleSrc));
// The colour now passes through an optional per-instance tint on its way
// into the queue, so the assertion matches the tint site rather than a
// literal that the road jitter correctly displaced.
ok('kit faces carry their baked colour into the queue',
   /col: tint \? tintCol\(C\[i\], tint\) : C\[i\], emi: E\[i\]/.test(battleSrc));
ok('paintFace uses a baked colour when it has one', /it\.col !== undefined/.test(battleSrc));
/* THE WHOLE TEXTURE PIPELINE IS GONE, not disabled. Leaving it in would mean
   two ways to draw a wall and a future patch picking the wrong one. */
for (const dead of ['paintFacade', 'composeFacade', 'nightFacade', 'paintRoof', 'texQuad'])
  ok('the retired ' + dead + ' is deleted, not left dormant',
     !new RegExp('function ' + dead + '\\b').test(battleSrc));
ok('the deletion leaves its reasoning behind',
   /CANVAS 2D DRAWS AN IMAGE THROUGH AN AFFINE TRANSFORM/.test(battleSrc));
/* MEASURED OFF THE BAKE: WallBlack is rgb(9,15,11). It is a daylight colour and
   at night it is a hole in the street. */
ok('the unusable black palette is excluded by name',
   /BLACK IS IN THE KIT AND IS NOT USED/.test(battleSrc));
/* *** THE LEFT AND RIGHT WERE SWAPPED AND BUILDINGS WERE OPEN ON TWO SIDES. ***
   Rotating (0,0,1) about Y by theta gives (-sin theta, 0, cos theta); the MINUS
   is what I got wrong by reasoning instead of evaluating. Both side walls faced
   INTO the building and were culled. Asserted as the exact array so it cannot
   drift back. */
ok('module facing is evaluated, not reasoned about',
   /sideRot = \[Math\.PI, 0, Math\.PI\/2, -Math\.PI\/2\]/.test(battleSrc));
ok('a storey sits at its middle height', /MOD_M\*0\.5/.test(battleSrc));
/* kitB accumulated across setZone and stacked five cities on top of each other,
   which presented as a suspiciously detailed frame rather than as a fault. */
ok('the building list is cleared when the zone changes', /kitB = \[\]/.test(battleSrc));
ok('windows are spent on a budget', /KIT_WINDOW_BUDGET/.test(battleSrc));
ok('a missing kit still leaves solid blocks', /kitOnly/.test(battleSrc));

// ── the atlas facades are retired; their lesson is kept ───────────────────
/* The 2x2 atlas assertions lived here and are gone with the code they tested.
   What they were guarding - doors only at street level - is now a property of
   the KIT, which ships separate door, window and wall pieces, so it cannot
   recur by mis-mapping. The papptimus sheets remain credited in the panel
   because CC BY attribution is for USE and they were used. */

// ── browser-only code paths ───────────────────────────────────────────────
/* TWICE NOW A PATH THAT ONLY RUNS IN A BROWSER HAS SHIPPED GREEN. First
   COLONY_VISUAL, which the harness supplied for itself; then the Path2D clip,
   which node-canvas does not have so the branch was never taken - and it threw
   on the first frame in Chrome because a Path2D has no beginPath. Same shape
   both times: THE CHECK AND THE PRODUCT DISAGREED ABOUT THE ENVIRONMENT. */
ok('replay does not assume its target has beginPath',
   /if \(g\.beginPath\) g\.beginPath\(\);/.test(battleSrc));
ok('the harness shims Path2D so the browser branch is exercised',
   /g\.Path2D = function Path2D/.test(harnessSrc));
ok('the shim has no beginPath, on purpose',
   /NO beginPath, on purpose/.test(harnessSrc));
ok('the fallback path can still be tested', /CB_NO_PATH2D/.test(harnessSrc));
/* A THROW IN THE RENDER LOOP USED TO BE A BLACK SCREEN AND NOTHING ELSE.
   requestAnimationFrame swallows the exception and never re-queues, which
   looks exactly like "nothing loaded". */
ok('the bench reports a render throw on screen', /RENDER ERROR/.test(benchSrc));
ok('and keeps running rather than giving up', /The loop kept running/.test(benchSrc));

// ── performance: the ops that actually cost, and the cull that pays ───────
/* MEASURED, NOT GUESSED. 49,357 clip quads and 3,631 texQuad calls per frame
   at ten frames a second. The clip is identical for every band and was rebuilt
   per band; the facade was one quad per storey per layer when a taller texture
   and a baked emissive make it one per column. */
ok('the street clip is tessellated once a frame, not once a band',
   /var _clipCache/.test(battleSrc) && /function buildClips/.test(battleSrc));
ok('it is keyed on the camera so a still view rebuilds nothing',
   /_clipCache\.key === key/.test(battleSrc));
ok('Path2D is used where it exists', /typeof global\.Path2D === 'function'/.test(battleSrc));
ok('there is a view radius', /viewRadius/.test(battleSrc));
ok('props are culled against it', /_propCull/.test(battleSrc));
ok('flora is culled against it', /outside the radius: not drawn/.test(battleSrc));
ok('the fog onset is derived from the radius, not tuned separately',
   /THE FOG CLOSES WHERE THE GEOMETRY STOPS/.test(battleSrc));
ok('the bench can move the radius live', /rR/.test(benchSrc) && /viewRadius = \+this\.value/.test(benchSrc));

// ── buildings you cannot walk through ─────────────────────────────────────
ok('buildings have collision', /function blocked/.test(battleSrc) && /function buildSolids/.test(battleSrc));
ok('cover and trim are not walls', /cover and trim are not walls/.test(battleSrc));
ok('a refused move slides rather than stopping',
   /if \(!blocked\(u\.x \+ stepX, u\.z\)\) \{ u\.x \+= stepX;/.test(battleSrc));
/* SLIDING ALONE TRAPS THEM, WHICH THE SWEEP PROVED: one front stopped
   engaging, with 32 of 52 units more than three metres from the cover they had
   claimed. A wall that lies across your path is slid along; a wall that runs
   the wrong way is slid along forever. */
ok('a stalled unit commits to a detour', /u\.detour/.test(battleSrc) && /u\.stall/.test(battleSrc));
ok('the detour side is held, not re-rolled each frame',
   /detSide = \(u\.i % 2\)/.test(battleSrc));
ok('nobody spawns inside a wall', /blocked\(sx, sz\)/.test(battleSrc));

// ── the test runner cannot serve somebody else's tree ─────────────────────
/* THE ORDER WAS THE BUG. test.bat opened the browser and THEN started the
   server, so a serve.mjs left running from an OLDER FOLDER kept the port, the
   new server exited on EADDRINUSE, and the tab connected to the old process -
   which served last week's tree quite happily. Every symptom looked like a
   browser cache and none of it was. Reproduced, then fixed. */
const batSrc = fs.readFileSync(path.join(ROOT, 'test.bat'), 'utf8');
const shSrc = fs.readFileSync(path.join(ROOT, 'test.sh'), 'utf8');
const serveSrc = fs.readFileSync(path.join(ROOT, 'tools/serve.mjs'), 'utf8');
ok('test.bat frees the port before serving', /netstat/.test(batSrc) && /taskkill/.test(batSrc));
ok('test.bat starts the server BEFORE opening the browser',
   batSrc.indexOf('serve.mjs') < batSrc.indexOf('start "" "http://localhost'));
ok('test.bat verifies which build actually answered',
   /WRONG TREE IS BEING SERVED/.test(batSrc));
ok('test.sh starts the server before opening the browser',
   shSrc.indexOf('node tools/serve.mjs') < shSrc.indexOf('xdg-open'));
ok('test.sh verifies which build answered', /ANOTHER SERVER IS HOLDING THIS PORT/.test(shSrc));
ok('test.sh moves to a free port rather than only complaining',
   /serve\.mjs "\$PORT" --auto/.test(shSrc));
/* A busy port used to be a one line complaint, which is not actionable.
   It names the build the squatter is serving now. */
ok('a busy port names the build that is squatting it',
   /PORT \$\{PORT\} IS ALREADY IN USE|PORT ' \+ PORT \+ ' IS ALREADY IN USE/.test(serveSrc) &&
   /THAT IS WHY YOUR BROWSER SHOWS AN OLD BUILD/.test(serveSrc));
ok('serve.mjs prints which folder and build it is serving',
   /serving ' \+ CLIENT/.test(serveSrc) && /build ' \+ VERSION/.test(serveSrc));
ok('serve.mjs can step to a free port', /--auto/.test(serveSrc));

// ── the published colony table, and the bug it fixes ──────────────────────
/* CB.mapFor derives every front from COLONY_META and COLONY_VISUAL. META is on
   the client; VISUAL is exported from server/city.js and has NEVER been sent
   to a browser, so the live client fell through to grid/dust for all sixty-six
   fronts - rendering perfectly and describing the wrong world. The harness
   could not catch it because the harness INJECTS both tables itself. A test
   that supplies the input the product is missing will pass forever. */
const frontsPath = path.join(CLIENT, 'assets/space/city-fronts.js');
ok('the colony table is published to the client', fs.existsSync(frontsPath));
const frontsSrc = fs.existsSync(frontsPath) ? fs.readFileSync(frontsPath, 'utf8') : '';
ok('it is generated, not hand written', /GENERATED by tools\/city-fronts\.mjs/.test(frontsSrc));
ok('it carries the server-owned visual rows', /"visual"|visual:/.test(frontsSrc));
ok('the renderer reads it', /FM_CITY_FRONTS/.test(battleSrc));
ok('index.html loads it before the renderer',
   indexSrc.indexOf("lazyLoad('assets/space/city-fronts.js')") > 0 &&
   indexSrc.indexOf("lazyLoad('assets/space/city-fronts.js')") <
   indexSrc.indexOf("lazyLoad('assets/city-battle.js')"));
ok('the bench loads it too', /city-fronts\.js/.test(benchSrc));
/* THE COLLAPSE IS ASSERTED DIRECTLY. Without the published table every colony
   resolves to the same layout and terrain; with it, dozens. If that ever
   reverts, this is the line that goes red rather than a screenshot nobody
   compares. */
{
  const bare = { addEventListener() {}, document: { getElementById: () => null } };
  loadInto(bare, battleSrc);
  const pub = { addEventListener() {}, document: { getElementById: () => null } };
  loadInto(pub, frontsSrc); loadInto(pub, battleSrc);
  const ids = Object.keys((pub.FM_CITY_FRONTS || {}).meta || {});
  const lay = (w) => { const s2 = new Set(ids.map((i) => { const m = w.CB.mapFor(i, 0); return m && m.layout; }));
                       s2.delete(null); s2.delete(undefined); return s2; };
  const shapes = new Set(ids.map((i) => { const m = pub.CB.mapFor(i, 0); return m && m.layout + '/' + m.terrain; }));
  shapes.delete(null); shapes.delete(undefined);
  /* THE PRECISE CLAIM IS ABOUT LAYOUT. An earlier version asserted that the
     whole layout/terrain shape collapsed to one without the table and it
     failed - correctly - because GARDEN forces grass on three colonies from a
     table this file owns, so two shapes survive. The thing COLONY_VISUAL is
     the sole source of is the LAYOUT, and without it every colony is a grid. */
  ok('without the published table every colony is the same layout', lay(bare).size === 1);
  ok('with it, every shipped layout is reachable', lay(pub).size >= 5);
  ok('and the fronts are genuinely varied', shapes.size >= 15);
}

// ── the GM corporate wars board ───────────────────────────────────────────
const godSrc = fs.readFileSync(path.join(CLIENT, 'assets/god-panel.js'), 'utf8');
ok('the GM panel has a corporate wars board', /godWarsRefresh/.test(godSrc));
ok('it can open a front', /window\.godWarWatch/.test(godSrc) && /cityWatch\(colonyId/.test(godSrc));
/* IT MUST NOT BE A SECOND WAR MODEL. Everything it sends is the command the
   server already accepted; a new one here would be a second way to move
   control and the two would drift. */
ok('every lever it pulls is set_colony_control',
   (godSrc.match(/godCmd\(\{ cmd: 'set_colony_control'/g) || []).length >= 2);
ok('the board is markup in the war tab', /gw-board/.test(indexSrc));
ok('WATCH is disabled where there is no front', /needs two factions holding ground/.test(godSrc));

// ── climate reaches the sky, the planting and the skyline ─────────────────
ok('the sky is graded from the world, not a constant',
   /PAL\.sky = mix3\(row\.sky/.test(battleSrc) && !/PAL\.sky = \[22, 34, 52\]/.test(battleSrc));
ok('the zenith comes from the same grade', /PAL\.zenith/.test(battleSrc));
ok('planting is per climate, not one urban mix',
   /FLORA_CLIMATE/.test(battleSrc) && !/var FLORA_URBAN/.test(battleSrc));
ok('every shipped terrain key has a planting recipe',
   ['dust','veins','rift','tether','station','ocean','ice','grass']
     .every(t => new RegExp('\\n  ' + t + ':\\s*\\{ n:').test(battleSrc)));
ok('planting DENSITY varies too, not only the species',
   /n = Math\.round\(n \* mix\.n\)/.test(battleSrc));
ok('the skyline varies by who holds the world', /function skylineChar/.test(battleSrc));
ok('the skyline is the holder\'s colour, not the attacker\'s',
   /MAP && MAP\.holder/.test(battleSrc));

// ── a battlefield for every zone in settled space ─────────────────────────
ok('zones derive a map', /CB\.mapFor = function/.test(battleSrc));
ok('the map reads the shipped colony tables',
   /_FM_COLONY_META/.test(battleSrc) && /FM_COLONY_VISUAL/.test(battleSrc));
ok('the street grid is built from the layout, not written',
   /function buildGrid/.test(battleSrc) && /LAYOUT_PLAN/.test(battleSrc));
ok('all six shipped layouts are handled',
   ['grid','spine','terraced','organic','radial','archipelago']
     .every(l => new RegExp('\\b' + l + ':').test(battleSrc)));
ok('the sector shapes the lots', /SECTOR_PLAN/.test(battleSrc));
ok('the ground patch follows COLONY_VISUAL.terrain', /TERRAIN_PATCH/.test(battleSrc));
ok('the palette follows the terrain', /TERRAIN_BODY/.test(battleSrc));
ok('orbital colonies are named and refused, not defaulted',
   /NO_SURFACE = \{ abaddon: 1, flesh_station: 1 \}/.test(battleSrc));
ok('changing zone rebuilds the city rather than tinting it',
   /CB\.setZone = function/.test(battleSrc) && /PATS = null/.test(battleSrc));
ok('cityWatch takes a zone', /global\.cityWatch = function \(colonyId, zoneIdx\)/.test(battleSrc));
ok('the derivation has its own check',
   fs.existsSync(path.join(ROOT, 'tools/city-maps-check.mjs')));

// ── the retired facade pack ───────────────────────────────────────────────
/* The sheets are gone: a canvas 2D renderer cannot map a texture onto a wall
   in perspective, and the kit replaced the whole approach. What survives is
   the CREDIT - CC BY attribution is owed for USE and they were used. */
const cityDir = path.join(CLIENT, 'assets/space/city');
ok('the retired sheets are gone from the tree',
   !fs.existsSync(path.join(cityDir, 'building_1.png')));
ok('their retirement is recorded',
   /RETIRED\. THESE TEXTURES ARE NO LONGER SHIPPED/.test(
     fs.readFileSync(path.join(cityDir, 'ATTRIBUTION.txt'), 'utf8')));

/* The bake-order assertions retired with the bake. The kit carries a per-face
   emissive that paintFace adds after the light term, asserted where it lives. */

/* ── THE LICENCE BLOCKER ───────────────────────────────────────────────────
   CC BY 4.0 permits everything this repo needs and asks for exactly one thing
   back: name the creator. The archive arrived with no licence file, no readme
   and no author. This check FAILS until that is filled in, because the whole
   history of this repo's art is packs whose terms were "resolved later" and
   never were - and this is the first one where compliance is a single line of
   text away. */
const cityAttr = fs.readFileSync(path.join(cityDir, 'ATTRIBUTION.txt'), 'utf8');
ok('the facade pack records its licence', /creativecommons\.org\/licenses\/by\/4\.0/.test(cityAttr));
ok('the facade pack states the changes made', /CHANGES MADE/.test(cityAttr));
ok('*** the facade pack NAMES ITS AUTHOR (CC BY 4.0 requires it) ***',
   /Author:\s+papptimus/.test(cityAttr) && !/NOT SUPPLIED/.test(cityAttr));
ok('the facade pack records where it came from',
   /papptimus\.itch\.io\/cyber-city/.test(cityAttr));
/* THREE PLACES, AND THE ONE THAT MATTERS IS THE PANEL. A credit in a text file
   inside an asset directory is a credit nobody will ever read; CC BY asks for
   attribution in the medium the work appears in, and for this game that is the
   in-client Asset Credits panel. asset-credits.js's own header says the same
   thing about the creature pack. Asserted in all three so they cannot drift
   apart in the direction of the client having fewer names. */
const credJs = fs.readFileSync(path.join(CLIENT, 'assets/asset-credits.js'), 'utf8');
const credMd = fs.readFileSync(path.join(ROOT, 'docs/CREDITS.md'), 'utf8');
/* MATCHED ON THE `who` FIELD, NOT ON THE FILE. The first version tested that
   the string "papptimus" appeared anywhere in asset-credits.js, and it PASSED
   with the name field changed to somebody else - because the url and note
   fields still carried the word. A credit check that a wrong credit satisfies
   is not a credit check. */
ok('papptimus is named in the in-client credits panel',
   /who: 'papptimus'/.test(credJs));
ok('the panel marks the credit as licence-required',
   /who: 'papptimus'[\s\S]{0,400}req: true/.test(credJs));
// Same lesson: match the NAME, not any mention. The url line carries the
// word too, so a bare substring test passes on a doc that credits nobody.
ok('papptimus is named in docs/CREDITS.md', /\*\*papptimus\*\*/.test(credMd));
ok('Voloshka is named in the in-client credits panel', /who: 'Voloshka'/.test(credJs));
ok('Voloshka is named in docs/CREDITS.md', /\*\*Voloshka\*\*/.test(credMd));
ok('38491748 is named in the in-client credits panel', /who: '38491748'/.test(credJs));
ok('38491748 is named in docs/CREDITS.md', /\*\*38491748\*\*/.test(credMd));
ok('docs/CREDITS.md links the licence',
   /creativecommons\.org\/licenses\/by\/4\.0/.test(credMd));

// ── depth, ground and skyline ──────────────────────────────────────────────
/* Matched on the CALL, not on the file. The first version of this asserted
   that the string "dust_base" appeared nowhere in city-battle.js and it failed
   on the COMMENT explaining why dust_base is no longer used - a test that
   forbids you from writing down why you changed something is a test that
   punishes the documentation. */
/* THE PATCH IS NO LONGER A LITERAL AT ALL, which is the point: it comes from
   COLONY_VISUAL.terrain now, so a battle on an ice world is fought on ice. The
   old assertion demanded the string 'grass_base' in a call, and that call has
   correctly stopped existing. What matters is that the patch is DERIVED and
   that grass is reachable. */
ok('the ground patch is derived from the world, not hardcoded',
   /tintedPattern\(patch \+ '_base'/.test(battleSrc) &&
   !/tintedPattern\('dust_/.test(battleSrc));
ok('grass is one of the reachable patches',
   /grass: 'grass'/.test(battleSrc) && /GARDEN = \{/.test(battleSrc));
ok('the grass patches are shipped',
   fs.existsSync(path.join(CLIENT, 'assets/space/terrain/grass_base.png')) &&
   fs.existsSync(path.join(CLIENT, 'assets/space/terrain/grass_rock.png')));
ok('the grass generator is shipped with them',
   fs.existsSync(path.join(ROOT, 'tools/terrain-synth.py')));
ok('props cast contact shadows', /function drawContactShadows/.test(battleSrc));
ok('shadows are drawn on the ground, not sorted with the men',
   battleSrc.indexOf('drawContactShadows()') < battleSrc.indexOf('_queue.sort'));
ok('walls take a vertical gradient', /createLinearGradient/.test(battleSrc));
ok('the gradient is gated on screen size', /GRAD_MIN_PX/.test(battleSrc));
ok('both skyline styles exist',
   /drawGlyphTowers/.test(battleSrc) && /skylineStyle/.test(battleSrc));
ok('glyph towers are baked once, not drawn live',
   /_glyph\[tw\.seed\]/.test(battleSrc));
ok('the bench can switch skyline style', benchSrc.includes("bStyle"));

// ── a shot that says where it was taken from ─────────────────────────────
/* *** THIS EXISTS BECAUSE FIVE PATCHES WERE SPENT GUESSING AT A CAMERA. ***
   A screenshot of this bench is the whole bug report, and it carried the build
   number and nothing else - not the front, not the seed, not where the camera
   was standing. So a fault visible on one avenue of one layout at one angle
   got chased from renders that were never pointed at it, and twice the answer
   came back "cannot reproduce" about something in every frame being looked at.

   Burned INTO the png rather than only shown in the HUD, because the HUD can
   be cropped out and routinely is. */
ok('the shot carries its own camera', /function camLine\(\)/.test(benchSrc));
ok('and the line is drawn into the exported image, not just the HUD',
   /o\.fillText\(line/.test(benchSrc) && /out\.height = cv\.height \+ 20/.test(benchSrc));
ok('it names the front and the seed',
   /front ' \+ \(f \? f\[0\]/.test(benchSrc) && /seed ' \+ CB\.seed/.test(benchSrc));
ok('and every camera number needed to stand in the same spot',
   /c\.x\.toFixed\(1\)/.test(benchSrc) && /c\.yaw\.toFixed\(3\)/.test(benchSrc) &&
   /c\.pitch\.toFixed\(3\)/.test(benchSrc));
ok('and the dials that change what is drawn',
   /CB\.opt\.roadWear\.toFixed\(2\)/.test(benchSrc) &&
   /CB\.opt\.groundTex\.toFixed\(2\)/.test(benchSrc));
ok('the HUD shows the camera live too', /id="sCam"/.test(benchSrc));

// ── the kerb straddles the kerb line; it does not sit beside it ──────────
/* *** MEASURED OFF THE BAKE, AND IT IS THE SECOND HALF OF THE SAME FAULT. ***
   Last patch fixed the kerb's ROTATION. It was also two metres too far out.
   The module is 4m across and the LIP - the vertical face between the pavement
   deck and the drop - sits at LOCAL Z ZERO, which is the CENTRE of the piece:
   two metres of road on one side, two metres of pavement on the other. So the
   centre belongs ON the kerb line at ax + hw, not at ax + hw + 2.

   Placed two metres out, the piece's road half - the only face in it wearing
   the road colour #585753 - lands entirely on the PAVEMENT, painting a two
   metre band of road grey down both sides of every avenue, broken into module
   lengths by the junction skips and corner mitres, which is what makes it read
   as squares rather than as a stripe.

   THE BARE-RUN SWEEP COULD NEVER HAVE FOUND IT: at ax + hw + 2 the piece still
   COVERED the ground continuously, its deck meeting the first pavement strip
   at hw + 4 exactly. Nothing was missing. It was the wrong colour, and a
   coverage probe does not look at colour. Swept geometrically instead - does
   each kerb's road half land inside a carriageway - it was 555 of 555 kerbs
   wrong on radial, 526 of 526 on grid, and every kerb on every other layout.
   Zero of them after. */
{
  const kitJ = JSON.parse(fs.readFileSync(
    path.join(CLIENT, 'assets/space/city/kit.json'), 'utf8'));
  const cu = kitJ.PavementCurb;
  const zs = cu.v.filter((_, i) => i % 3 === 2);
  const lo = Math.min(...zs), hi = Math.max(...zs);
  ok('the kerb module is symmetric about its own origin',
     Math.abs(lo + hi) < 1e-6, lo + '..' + hi);
  /* The lip is the highest deck; its z tells you where the kerb face is. */
  let lipZ = null, topY = Math.max(...cu.v.filter((_, i) => i % 3 === 1));
  cu.f.forEach((face) => {
    if (!face.every((vi) => Math.abs(cu.v[vi*3+1] - topY) < 1e-6)) return;
    lipZ = face.reduce((a, vi) => Math.max(a, cu.v[vi*3+2]), -1e9);
  });
  ok('and its kerb face sits at the CENTRE, not at an edge',
     lipZ !== null && Math.abs(lipZ) < 1e-6, String(lipZ));
  ok('so the avenue kerb is centred on the kerb line',
     /tile\('PavementCurb', GRID\.ax\[i\] \+ sgn\*GRID\.hw,/.test(battleSrc));
  ok('and the cross-street kerb too',
     /tile\('PavementCurb', x \+ t0\*0\.5, GRID\.az\[j\] \+ sg2\*GRID\.hw,/.test(battleSrc));
  ok('the mitre straddles its corner on the same convention',
     /var cx2 = GRID\.hw, cz2 = GRID\.hw;/.test(battleSrc));
  ok('and the pavement strips moved in with the deck',
     /sgn\*\(GRID\.hw \+ t0\), z/.test(battleSrc) &&
     /sgn\*\(GRID\.hw \+ t0\*2\), z/.test(battleSrc));
}
/* *** AND THE ON-ROAD GUARD HAD TO LOSE THE STRADDLING PIECES. *** It was
   written when the kerb was believed to sit BESIDE the carriageway, so "its
   centre is on the road" meant misplaced. The kerb straddles: half of it is
   road by design and its centre sits exactly on the kerb line, so testing that
   centre against |x - ax| < hw is a coin flip on floating point - 5.799999 <
   5.8 is true - and it deleted most of the kerbs on terraced and spine. 542
   down to 198, and a 57.5m bare run where the walkway should be. What keeps
   kerbs and mitres out of a junction is the jz/jx gate, which tests the
   JUNCTION and is the right test for it. */
ok('only the pure walkway piece is barred from the road',
   /var NEVER_ON_ROAD = \{ Pavement: 1 \};/.test(battleSrc));
ok('the straddling pieces are not in it',
   !/NEVER_ON_ROAD = \{[^}]*(PavementCurb|PavementCornerBig)/.test(battleSrc));

// ── the broken road edge was the kerb, turned 180 degrees ────────────────
/* *** READ OFF THE BAKE FACE BY FACE, BECAUSE REASONING ABOUT IT IS WHAT GOT
   IT WRONG. *** PavementCurb's pavement deck sits at y=0 over z -100..-10, its
   lip rises to y=3 across z -10..0, and the ROAD half is at y=-10 over z
   0..+100 - and that road half is the ONLY face in the piece carrying the road
   colour #585753. So the road side is +Z and the pavement side is -Z.

   Rotating by theta maps +Z to (sin theta, 0, cos theta). On the +x side of an
   avenue the kerb stands at ax + hw + 2 and the road is toward -X, so theta
   must be -PI/2. The source had +PI/2 there and -PI/2 on the -x side: BOTH
   FLIPPED. What that draws is a road-coloured trench two metres wide sunk 20cm
   into the PAVEMENT along every avenue, with the pavement deck cantilevered
   out over the carriageway. From a camera on that pavement it is a broken road
   edge with a row of pale squares along it.

   THE CROSS STREETS WERE ALWAYS RIGHT, which is why it only ever showed on an
   avenue: they use PI and 0, the piece's own axis is Z, and no quarter turn is
   involved so there was nothing to get backwards.

   ASSERTED AGAINST THE BAKE rather than against the literal, so the piece and
   the rotation cannot drift apart if either is ever re-authored. */
{
  const kitJ = JSON.parse(fs.readFileSync(
    path.join(CLIENT, 'assets/space/city/kit.json'), 'utf8'));
  const cu = kitJ.PavementCurb;
  // The road half is the face wearing the road colour; find which side of z it is.
  const ROAD_COL = 0x585753;
  let zsum = 0, n = 0;
  cu.f.forEach((face, i) => {
    if (cu.c[i] !== ROAD_COL) return;
    face.forEach((vi) => { zsum += cu.v[vi*3 + 2]; n++; });
  });
  ok('the kerb has exactly one road-coloured half', n > 0);
  const roadOnPlusZ = zsum / n > 0;
  ok('and it is on +Z', roadOnPlusZ, String((zsum / n).toFixed(1)));
  /* theta for the +x side must send +Z to -X, i.e. sin(theta) = -1. */
  const m = battleSrc.match(/tile\('PavementCurb', GRID\.ax\[i\][\s\S]{0,140}?sgn > 0 \? (-?Math\.PI\/2) : (-?Math\.PI\/2)\)/);
  ok('the avenue kerb rotation is present to check', !!m);
  if (m) {
    const th = (t) => (t === 'Math.PI/2' ? Math.PI/2 : -Math.PI/2);
    const wantSin = roadOnPlusZ ? -1 : 1;    // +x side: road must point -X
    ok('the +x avenue kerb points its road half at the street',
       Math.abs(Math.sin(th(m[1])) - wantSin) < 1e-9, m[1]);
    ok('and the -x side points the other way',
       Math.abs(Math.sin(th(m[2])) + wantSin) < 1e-9, m[2]);
  }
  /* Cross streets: theta 0 sends +Z to +Z, PI sends it to -Z. The kerb on the
     +z side of az must point its road half at -Z. */
  const c2 = battleSrc.match(/tile\('PavementCurb', x \+ t0\*0\.5[\s\S]{0,140}?sg2 > 0 \? (Math\.PI|0) : (Math\.PI|0)\)/);
  ok('the cross-street kerb rotation is present to check', !!c2);
  if (c2) {
    ok('the +z cross kerb points its road half at the street',
       c2[1] === (roadOnPlusZ ? 'Math.PI' : '0'), c2[1]);
    ok('and the -z side points the other way',
       c2[2] === (roadOnPlusZ ? '0' : 'Math.PI'), c2[2]);
  }
}

// ── the square spots and the objects in the road ─────────────────────────
/* *** CEILING-AND-CENTRE WAS THE WRONG FIX AND A MARKED RENDER SHOWED IT. ***
   v1.10.0.6 closed the bare kerb strip by overhanging the road past the kerb
   line, arguing the overhang lands UNDER the kerb. It is the other way round:
   PavementCurb carries its own road side at the same ten unit drop, so an
   overhanging road tile is coplanar with it and what draws is a dark tab of
   kerb geometry ON the carriageway, once per module - a ladder of dark rungs
   down the road edge. Those are the "square empty spots".

   FLOOR PLUS TWO FLUSH EDGE TILES: the centred run covers what divides evenly
   and one extra tile per side sits with its OUTER edge exactly on the kerb
   line, so the union is exactly the carriageway and nothing crosses it. Road
   over road is invisible, so the overlap in the middle costs nothing. */
ok('the lane run floors and adds flush edges',
   /Math\.floor\(GRID\.hw \* 2 \/ t0\)/.test(battleSrc) &&
   /var edge = GRID\.hw - t0 \* 0\.5;/.test(battleSrc));
ok('and the cross streets do the same', /var redge = GRID\.hw - t0 \* 0\.5;/.test(battleSrc));
ok('nothing ceilings the lane count any more',
   !/Math\.ceil\(GRID\.hw \* 2 \/ t0\)/.test(battleSrc));
/* THE VERGE FURNITURE AND THE LAMPS WALK DOWN THE AVENUE AT A FIXED PITCH -
   nine metres for the litter, twenty-two for the lamps - AND NOTHING ASKED
   WHETHER THE NEXT STOP WAS A JUNCTION. On the avenue verge, which is right;
   in the middle of the cross street, which is not. Counted on new_anchor at
   one camera before the fix: two bins, two fences, two small fences and four
   lamp posts standing in the road. Not random - every intersection where the
   pitch happens to land. Swept after: zero on all six layouts. */
ok('nothing stands in a crossing', /function standsInRoad/.test(battleSrc));
ok('the lamps check it', /if \(standsInRoad\(px, lz\)\) continue;/.test(battleSrc));
ok('and the verge furniture checks it', /if \(standsInRoad\(fx, fz\)\) continue;/.test(battleSrc));
/* THE MANHOLES STAY. Sewerage is the one piece that BELONGS on a carriageway;
   it was moved out of the furniture pool for exactly that reason. */
ok('the manholes are still laid by the lane loop, not the verge pool',
   /tile\('Sewerage', GRID\.ax\[i\] - GRID\.hw\*0\.45/.test(battleSrc));
/* And the kerb's skip radius has to match what the mitre actually covers. It
   was hw + t0*1.6 = 13m while PavementCornerBig only reaches hw + t0 = 10.6,
   so the straight kerb was skipped for 2.4m of approach the corner never
   reached - and that band is KERB-ONLY territory, so it showed bare ground. */
ok('the kerb stops where the mitre starts',
   /Math\.abs\(x - GRID\.ax\[a\]\) > GRID\.hw \+ t0\)/.test(battleSrc) &&
   !/GRID\.hw \+ t0\*1\.6/.test(battleSrc));

// ── the strip of plain along every kerb was a rounding ───────────────────
/* *** THE LANE COUNT WAS ROUNDED AND THE REMAINDER WAS LEFT BARE. ***
   lanes = round(hw*2 / t0), laid from ax - hw, so the road covered lanes*t0
   metres of a carriageway 2*hw wide and the leftover showed the PLAIN - the
   tinted grass patch, which on a garden world is bright green. Not fog and not
   haze: bare ground, in a strip running the whole length of the avenue, hard
   against the kerb. INVISIBLE ON HALF THE WORLDS, which is why it survived:
   grid hw 6.0 divides exactly, hollow hw 6.2 leaves 0.4m, radial hw 6.6
   leaves 1.2m, spine hw 8.4 leaves 0.8m. Swept: yujing and new_anchor both
   showed a 1m-plus uncovered run at ax+5.5..ax+6.5 over every near z row, and
   both are radial, which is the layout in the screenshot. Ceiling and centred
   now - the run is at least as wide as the carriageway and any overhang lands
   UNDER the kerb, since Road and PavementCurb's road side share the same ten
   unit drop. Re-swept: widest bare run 0.0m on all six layouts. */
/* SUPERSEDED ONE PATCH LATER, and left as a note because the reasoning matters
   more than the line. Ceiling closed the bare strip and opened a worse one: the
   overhang past the kerb line put the kerb's own road-side geometry ON the
   carriageway. What the invariant always was is that the road covers exactly
   the carriageway and nothing crosses it - asserted below as floor plus flush
   edge tiles. Never rounds is the part that survives. */
ok('the lane count does not round',
   !/Math\.round\(GRID\.hw \* 2 \/ t0\)/.test(battleSrc));
ok('and the run is centred on the street',
   /var lane0 = -lanes \* t0 \* 0\.5;/.test(battleSrc) &&
   /var row0 = -rows \* t0 \* 0\.5;/.test(battleSrc));
ok('the per-layout remainders are recorded', /radial    hw 6\.6/.test(battleSrc));

// ── a skyline per world, from lore the repo already holds ────────────────
/* The skyline was the same city everywhere twice over: one silhouette
   recoloured by the holder, then density and height by population and Circuit
   membership - two dials across thirty-seven colonies, so Nova Reach and
   Yujing come out the same shape at the same population. THE SECTOR IS ALREADY
   THE LORE AND ALREADY IN THE REPO: every front carries a sectorName, and
   ROOF_STYLE and FURNITURE have keyed off it since the kit landed. A foundry
   is stacks and low sheds; a finance capital is crowned towers; a bazaar is a
   jumble with no plan. Thirty-seven worlds distinguished with nothing invented. */
ok('the skyline reads the sector', /var SKYLINE_SECTOR = \{/.test(battleSrc));
ok('a foundry draws only from the bottom of TOWER_KIND',
   /'Iron Foundries':\s*\{ lo: 0\.00, hi: 0\.3/.test(battleSrc));
ok('and a bazaar from all of it', /'Gray Bazaar':\s*\{ lo: 0\.00, hi: 1\.00/.test(battleSrc));
ok('the kind is a band rather than a two-way nudge',
   /var kr = ch\.lo \+ \(ch\.hi - ch\.lo\) \* rnd\(\);/.test(battleSrc));
ok('population and allegiance still set the base',
   /dens: dens \* row\.dens/.test(battleSrc) && /m\.jade \? 1\.25 : 0\.88/.test(battleSrc));
/* GM TERRITORY, AND DELIBERATELY NEARLY EMPTY. Jacob is the author; the lore
   of a named world is his to state, and filling thirty-seven rows inside a
   renderer would be writing canon where nobody would find it again. */
ok('there is a per-world hook', /var SKYLINE_WORLD = \{/.test(battleSrc));
ok('and it is a hook rather than invented canon',
   (battleSrc.slice(battleSrc.indexOf('var SKYLINE_WORLD'),
                    battleSrc.indexOf('function skylineChar'))
     .match(/\{ lo:/g) || []).length <= 6);
/* IT IS ON AS PRISM, WHICH IS A DIFFERENT DECISION FROM THE ONE 1.10.0.1 MADE.
   That verdict was about the MODEL style - real geometry at 1400m is one flat
   silhouette - and it still stands. The note left the condition for earning a
   horizon back: something that VARIES ACROSS a far facade. Prism does three
   face values per mass, a lighter roof slab, a window grid and a beacon mast,
   which is also the only way a crowned tower and a slab differ at all. */
ok('the skyline is on', /skyline: true/.test(battleSrc));
ok('as the style that varies across a facade', /skylineStyle: 'prism'/.test(battleSrc));
ok('the model verdict is still recorded', /flat coloured rectangle/.test(battleSrc));

// ── the bug worlds' ground, behind a dial ────────────────────────────────
/* IT WAS NEVER REMOVED - ONLY ORPHANED. v1.9.9.0 stopped drawing the
   carriageway and pavement through the band pass and paved them with flat kit
   tiles, because a 512px patch at TILE_M 6 covers forty-eight metres and
   smears when the camera stands on it. It deleted nothing: pats() still builds
   `asph` and `pave` every time it runs - the same CodeSpree sheets the Reach
   draws, tinted per world through the same tintedPattern - and buildClips,
   tessellate, replay, roadClip, paveClip, eachCarriageway and eachPavement all
   sat here since with NO CALLER. One draw call away, not a rebuild. */
ok('the ground pass is back behind a dial', /CB\.opt\.groundTex <= 0/.test(battleSrc));
ok('and the tile size is the smear dial', /var sc = CB\.opt\.texScale;/.test(battleSrc));
ok('it defaults OFF, so nothing shipped changes', /groundTex: 0,/.test(battleSrc));
ok('the clip machinery has a caller again', /buildClips\(\);/.test(battleSrc));
/* Only the two pieces that are PURE SURFACE stand down for it. Road and
   Pavement are one flat face apiece with no relief; the kerb, the mitre, the
   crossing and the lines all have a PROFILE, and a profile is the thing a
   ground texture cannot draw. */
ok('only the surface tiles stand down', /var SURFACE_ONLY = \{ Road: 1, Pavement: 1 \};/.test(battleSrc));
ok('the kerb and the markings are not in it',
   !/SURFACE_ONLY = \{[^}]*(Curb|Crossing|SolidLine|DashedLine)/.test(battleSrc));
/* THE LOTS ARE PART OF THE PAVED SURFACE AND THE CLIP DID NOT KNOW IT.
   eachPavement walks the strips beside the streets, which was all the clip
   needed while the lots were flat tiles. Standing those down and drawing only
   the strips left every yard between the buildings showing the PLAIN - green
   grass inside a city. */
ok('the lots are in the paved clip', /function eachPaved/.test(battleSrc));
ok('and the clip builds from it', /tessellate\(eachPaved\)/.test(battleSrc));
/* The far fill has to BE the average of the pattern it replaces. The first
   attempt handed bandPass the plain's ground/haze mix, so the near ten metres
   came out tarmac and everything beyond it came out the colour of the field
   outside the city. Graded off the kit's own baked #585753 and #332f2c. */
ok('the far flat fill is graded off the kit colours', /var kf = KIT_AMBIENT \* 0\.86;/.test(battleSrc));

// ── the industrial pack IS the shipped kit ───────────────────────────────
/* Worth an assertion because it was worth a whole patch to find out. The
   "industrial city assets" and the "city assets" are one pack - Voloshka's
   Industrial Low Poly City, 526 prefabs - and tools/city-meshes.py --check
   passes byte-for-byte against the shipped kit.json. There is no second, better
   road set being held back; Road, Crossing, DashedLine, SolidLine, PavementCurb,
   Pavement and the two corner mitres are everything the pack has. */
ok('the kit attribution names the industrial pack',
   /Industrial Low Poly City/.test(fs.readFileSync(
     path.join(CLIENT, 'assets/space/city/KIT_ATTRIBUTION.txt'), 'utf8')));
{
  const kitJ = JSON.parse(fs.readFileSync(
    path.join(CLIENT, 'assets/space/city/kit.json'), 'utf8'));
  ok('and the pack is 526 prefabs', Object.keys(kitJ).length === 526,
     String(Object.keys(kitJ).length));
  const surf = ['Road', 'Crossing', 'DashedLine', 'SolidLine', 'PavementCurb',
                'Pavement', 'PavementCornerBig', 'PavementCornerSmall'];
  ok('every road piece the pack has is present', surf.every((n) => !!kitJ[n]),
     surf.filter((n) => !kitJ[n]).join(','));
}

// ── nothing is paved over a carriageway ──────────────────────────────────
/* Three loops lay Pavement without asking what is underneath, and two run
   through every intersection - the avenue's strips across the cross street and
   the cross street's across the avenue. Pavement wins where they meet because
   it is HIGHER: the kit's Road sits ten units low, which is the kerb drop and
   the reason pavement reads as raised with no offset anywhere in the file.
   Coplanar it would flicker; 20cm up it is a silent overpaint at the darker
   value - road bakes #585753, pavement #332f2c, so 45,45,42 becomes 26,24,22.

   *** MEASURED, AND SMALLER THAN IT LOOKS. *** Same camera, guard off and on:
   25588 faces against 25518, and 16150 changed pixels of 791010 - two per cent
   of the frame, all inside one box around the junction. A real fault at every
   intersection, and NOT a road failing to render: every Road tile is laid,
   every kit name resolves, and the carriageway takes its correct baked colour
   at every distance. All three were instrumented before this was touched. */
ok('the paving family is named by piece, not by loop',
   /var NEVER_ON_ROAD = \{ Pavement: 1/.test(battleSrc));
ok('road markings and covers are NOT in it',
   !/NEVER_ON_ROAD = \{[^}]*(Road:|Crossing:|DashedLine:|SolidLine:|Sewerage:)/.test(battleSrc));
ok('the guard sits in tile(), not at its five call sites',
   /if \(NEVER_ON_ROAD\[name\] && onCarriageway\(x, z\)\) return;/.test(battleSrc));
ok('and the measurement is recorded rather than the claim',
   /25588 faces against 25518/.test(battleSrc));

// ── the unattributed list is empty again, and says why ───────────────────
/* The previous note refused to fold the black hole, the megastructure, the
   dyson and quasar bodies, the suns and the 16px icons into Helianthus on the
   grounds that sharing a directory is not evidence of sharing an author. That
   refusal was right; the conclusion turned out not to be needed. They ARE
   Helianthus, identified against the itch library every other attribution in
   the table comes from, so they move into that credit rather than being
   assumed into it. Empty is a state, not a requirement. */
{
  const acSrc = fs.readFileSync(path.join(CLIENT, 'assets/asset-credits.js'), 'utf8');
  const creditsMd = fs.readFileSync(path.join(ROOT, 'docs/CREDITS.md'), 'utf8');
  ok('the unattributed list is empty', /var UNKNOWN = \[\];/.test(acSrc));
  ok('the heading still hides itself rather than showing an empty list',
     /if \(UNKNOWN\.length\) \{/.test(acSrc));
  ok('and the list itself is kept for the next nameless pack',
     /var UNKNOWN = /.test(acSrc));
  ok('the items moved into the Helianthus credit rather than vanishing',
     /black hole[\s\S]{0,400}16px system-view icons/.test(acSrc.slice(
       acSrc.indexOf("who: 'Helianthus Games'"),
       acSrc.indexOf("who: 'CodeSpree'"))));
  ok('and docs/CREDITS.md says the same', /16px system-view icons/.test(creditsMd));
  ok('the reversal is recorded, not silently rewritten',
     /sharing a directory/.test(creditsMd) && /identified/.test(acSrc));
}

// ── detail is keyed on distance, not on queue rank ───────────────────────
/* *** THE POPPING WAS TWO DIFFERENT FAULTS AND ONLY ONE OF THEM WAS A CULL. ***
   (1) Buildings were culled on CENTRE distance with no reach term, alone among
   the culls in this file - queueProps has measured reach since it was written.
   A forty metre block whose middle sits one metre outside the radius is
   entirely absent, and one camera step later the whole facade arrives at once.
   (2) `rich` was `i < 8` and the window budget was spent nearest-first down
   the sorted list, so a building's appearance depended on its NEIGHBOURS.
   Walk four metres, let a block leave the radius, and everything after it
   moves up a rank - the ninth becomes the eighth and switches window pools
   while standing still at an unchanged distance. That is why it read as
   textures flickering rather than as things entering view. */
ok('buildings are culled on a reach-expanded radius', /function nearR2\(b, R\)/.test(battleSrc));
ok('rich is a distance, not a rank', /rich = _kitSort\[i\]\.near < RICH_RANGE/.test(battleSrc));
ok('shopfronts are range-gated before they are budget-gated',
   /near < SHOP_RANGE/.test(battleSrc));
/* THE CONSTANTS ARE ASSERTED HERE because tools/city-pop-check.mjs RESTATES
   them rather than reaching into the module. Restated numbers drift silently -
   the pop check would keep passing against its own stale copy while the
   renderer used something else - so the two are tied together at the literal. */
{
  const popSrc = fs.readFileSync(path.join(ROOT, 'tools/city-pop-check.mjs'), 'utf8');
  const lit = (src, name) => (src.match(new RegExp(name + '\\s*=\\s*(\\d+)')) || [])[1];
  ok('the pop check\'s RICH_RANGE matches the renderer\'s',
     lit(battleSrc, 'RICH_RANGE') === lit(popSrc, 'RICH_RANGE'),
     lit(battleSrc, 'RICH_RANGE') + ' vs ' + lit(popSrc, 'RICH_RANGE'));
  ok('and its SHOP_RANGE',
     lit(battleSrc, 'SHOP_RANGE') === lit(popSrc, 'SHOP_RANGE'),
     lit(battleSrc, 'SHOP_RANGE') + ' vs ' + lit(popSrc, 'SHOP_RANGE'));
}
/* Flora ordered on VIEW Z was the same fault in a third place: view z changes
   when the camera TURNS - a tree forty metres to your left is at z=40 facing it
   and z=4 facing away - so turning on the spot reshuffled the budget order and
   trees at the tail switched on and off while nothing moved. World distance
   does not care which way you are looking, which is the point of a circle. */
ok('flora orders on world distance, not view z',
   /_floraSort\.push\(\{ f: f, m: m, z: d2 \}\)/.test(battleSrc));

// ── the arena, and it is the Reach's rectangle wearing a street plan ──────
/* THE CITY HAD NO EDGES. Cells ran x -300..300 and z -600..900, the front was
   clamped to a literal +/-58 that no other number agreed with, units spawned
   in a 350m band, and the camera could walk out of all of it. Nothing threw;
   it meant the scene had no answer to "how big is this fight" and every system
   answered separately. The Reach answers it once - FIELD_W x FIELD_D, a front
   scalar with clamped travel, every offset measured off it - and everything
   reads that answer. Same here, with the front on WIDTH rather than DEPTH,
   because that is the axis a single-facing sprite pack can be drawn along. */
ok('the arena exists as a named extent', /var ARENA = \{/.test(battleSrc));
ok('it is derived from the grid, not written down',
   /ARENA\.x1 = span/.test(battleSrc) && /gapZ\*0\.55/.test(battleSrc));
/* TWO EXTENTS, NOT ONE. The Reach fills five field-widths of ground past the
   field and says why: bound the DRAWING and the world reads as a rug on a
   floor. So ARENA bounds the fight and the built city keeps running past it. */
ok('cover is bounded to the arena', /if \(!inArena\(x, z\)\) return;/.test(battleSrc));
ok('the bound is enforced once, at addCover, not at its call sites',
   (battleSrc.match(/inArena\(/g) || []).length <= 3);
ok('the front travel is clamped to the arena rather than a literal',
   /ARENA\.x0 \+ FRONT_INSET/.test(battleSrc) && !/clamp\(d, -58, 58\)/.test(battleSrc));
ok('spawning is measured off the arena and the front',
   /sx = frontX - side \* \(half/.test(battleSrc));
/* *** AND THE DEPTH IS CAPPED, WHICH THE FIRST VERSION WAS NOT. *** Derived
   straight off the last cross street it came out 326 to 663m by layout - a
   spine colony ends up with a 660m corridor. The locked camera stands at
   z0+62 with a 150m radius, so five hundred metres of that is permanently fog
   and half the army spawns into it. The Reach's field is a flat 320 on every
   world because the extent is a property of the ENGAGEMENT, not of the
   terrain generator underneath it. */
ok('the arena depth is capped rather than derived unbounded',
   /ARENA\.z0 \+ 330\)/.test(battleSrc));
ok('the sweep that found it is recorded', /spine 658-663/.test(battleSrc));

// ── the camera is fixed, and that is the whole change ────────────────────
/* It rode four sine terms - yaw, x, z and height on different periods - which
   is what you write when the scene has no edges and you are trying to make one
   shot feel like several. A camera drifting up and down the avenue re-frames
   the fight every few seconds, so the eye spends the shot re-finding the line
   instead of watching it, and a moving height plus a moving yaw is exactly the
   pair that walks off-axis toward the arc the sprite pack has no drawings for.
   The only thing that moves now is x, tracking the front - which is not camera
   motion, it is the camera holding still while the battle moves under it. */
ok('the locked camera has no wander terms',
   !/cam\.z = 30 \+ Math\.sin/.test(battleSrc) &&
   !/cam\.y = 5\.5 \+ Math\.sin/.test(battleSrc));
ok('it holds a fixed standoff, height and pitch',
   /cam\.z = ARENA\.z0 \+ 62;/.test(battleSrc) && /cam\.y = 6\.0;/.test(battleSrc));
ok('it is square down the street', /camMode === 'flank'[\s\S]{0,2600}cam\.yaw = 0;/.test(battleSrc));
ok('the only thing tracking is x, off the front',
   /cam\.x = clamp\(frontX, -GRID\.hw/.test(battleSrc));
/* Orbit and the locked rig are GEOMETRIC: neither knows where anything
   interesting is. The Reach solves that with a mode that cuts to hotspots, and
   frames each cut on a FLANK because the art is profile only. Same here, and
   cheaper: the avenue runs the length of the fight, so a cut is a choice of z. */
ok('there is a cine mode', /camMode === 'cine'/.test(battleSrc));
ok('it cuts to where the fighting is', /function pickHotspotZ/.test(battleSrc));
ok('the cut is eased, not snapped', /cam\.z \+= \(cine\.z - 46 - cam\.z\) \* 0\.05/.test(battleSrc));
ok('the bench exposes it', /data-cam="cine"/.test(benchSrc));
ok('the bench shows the derived arena', /CB\.arena\(\)/.test(benchSrc));

// ── the burnt hauler is gone ─────────────────────────────────────────────
/* Two untextured prisms in 'rust' parked across the centre avenue: the last
   piece of invented box geometry standing in a street built out of a kit. ITS
   COVER GOES WITH IT, which is where this departs from the Reach's rule for
   its removed camps. Keeping data and dropping geometry is right when the
   thing is ABSTRACT - a camp is a claim over ground and the ground can carry
   it. A cover slot is a specific place a man crouches BEHIND something, and a
   slot with nothing at it is two soldiers kneeling in open tarmac. */
ok('the hauler prisms are gone', !/rect\(-2\.6, 118/.test(battleSrc));
ok('its cover slots went with it', !/addCover\(-6\.4, 118/.test(battleSrc));
ok('what it cost is recorded rather than quietly dropped',
   /only hard cover in the open/.test(battleSrc));

// ── contact shadows fade as the camera climbs ────────────────────────────
/* A contact shadow is a cheat that works from ONE place: a flat pad standing
   in for the darkening where a mass meets the ground. From eye level that is
   what it looks like. From overhead it is a black rectangle offset from a
   building, and a city seen from above becomes acres of grey with black mats
   over it - which is most of what is wrong with the skyview and is not a
   texture problem at all. */
ok('the shadow alpha answers to pitch', /0\.34 \* lift/.test(battleSrc));
ok('it is faded rather than removed, and floors above zero',
   /clamp\(\(cam\.pitch \+ 0\.62\) \/ 0\.55, 0\.10, 1\)/.test(battleSrc));
/* ── THE GROUND FLOOR IS NOT ANOTHER STOREY ───────────────────────────────
   Every module came from the same pool, so a ground floor was a row of office
   windows with a door punched in the middle. That is an elevation seen from
   four hundred metres up; this camera stands on the pavement. Window2 is what
   the pack has for it - 146 faces, nine of them emissive, the widest glazing
   in the kit - and the window pools EXCLUDE it on the grounds that no camera
   is close enough for a centrepiece. True of an upper storey, where it is one
   cell in a grid of forty. Not true of a shopfront directly in front of you. */
ok('the ground floor is drawn from a different piece than the storeys above',
   /s === 0 && shopBudget > 0/.test(battleSrc));
ok('the shopfront is Window2, the piece the pools exclude',
   /'Window2' \+ \(slit \? 'Lit' : 'Unlit'\)/.test(battleSrc));
/* SEPARATE BUDGET, NOT A SHARE OF THE WINDOW ONE. Out of KIT_WINDOW_BUDGET,
   two near buildings' ground floors would starve every upper storey in the
   frame - trading a detail you can see for a detail you can also see. */
ok('the shopfronts have their own budget', /var SHOP_BUDGET = \d+/.test(battleSrc));
ok('shopfront faces are not charged to the window budget',
   /if \(isShop\) shopBudget -= used;/.test(battleSrc));
ok('the shop hash shares no bits with the facade hash',
   /bb\.seed >>> 17/.test(battleSrc) && /bb\.seed >>> 2/.test(battleSrc));
/* ── AND THE MEASUREMENT THAT CORRECTS THIS FILE'S OWN COMMENT ────────────
   KIT_WINDOW_BUDGET is described in the source as the single biggest lever on
   detail. It is not the constraint: 16000, 32000 and 64000 all render the
   same frame, because `allow` already covers about one window per visible
   module. The lever is viewRadius, which decides how much city exists. */
ok('the budget comment records the measurement rather than the claim',
   /16000, 32000 and 64000 all render 28144 faces/.test(battleSrc));
ok('the real lever is named', /THE REAL LEVER IS viewRadius/.test(battleSrc));
/* ── A WINDOW HAS THREE STATES AND TWO WERE NAMED ─────────────────────────
   The pack ships Halflit variants for Window1, 4, 5, 6 and 7 - fourteen
   pieces - and nothing composed that name, so they sat in the bake unused
   since the kit landed. Measured: Window7Lit is 34 faces and Window7Halflit1
   is 34 faces, and every family's halflit carries exactly half its lit
   sibling's emissive panes. A third facade state at zero face cost. */
{
  const kitJ = JSON.parse(fs.readFileSync(
    path.join(CLIENT, 'assets/space/city/kit.json'), 'utf8'));
  ok('the kit really ships halflit windows', !!kitJ.Window7Halflit1Slate);
  ok('halflit costs the same as lit',
     kitJ.Window7Halflit1Slate.f.length === kitJ.Window7LitSlate.f.length);
  ok('halflit is half the emissive of lit',
     kitJ.Window7Halflit1Slate.e.filter(Boolean).length * 2 ===
     kitJ.Window7LitSlate.e.filter(Boolean).length);
  ok('the renderer names them', /Halflit/.test(battleSrc));
  /* SPLIT SO THE CITY DOES NOT CHANGE BRIGHTNESS: four rolls in eight were
     lit, now three are lit and two are half, which is the same lit-pane area
     over five windows instead of four. A family with no halflit splits its
     fallback rather than defaulting to lit, or the cheap pool - Window10, 8
     and 9, none of which ship one - comes out brighter than the rich pool. */
  ok('the three-state split is the same emissive area',
     /wst < 3, halfLit = wst >= 3 && wst < 5/.test(battleSrc));
  ok('a family with no halflit splits rather than defaulting to lit',
     /\(wst & 1\) \? 'Lit' : 'Unlit'/.test(battleSrc));
  /* ── HALF THE DOORS IN THE CITY WERE THE SAME DOOR ──────────────────────
     Door1 and Door2 have no Lit variant; Door3 has no plain variant. The old
     composition appended 'Lit' to whichever family it rolled, so Door1Lit,
     Door2Lit and Door3 all named nothing and the fallback turned all three
     into Door1 - which took half of every entrance in the city while
     Door3Unlit was never drawn once. Nothing warned, because the fallback
     landed on a real piece. */
  ok('the kit names its doors three different ways',
     !!kitJ.Door1Slate && !kitJ.Door1LitSlate &&
     !!kitJ.Door3LitSlate && !kitJ.Door3UnlitSlate === false);
  ok('Door3Unlit is reachable', /'Door3' \+ \(\(\(bb\.seed >>> 6\) & 1\)/.test(battleSrc));
  ok('the plain families are not given a Lit suffix',
     /'Door' \+ dFam \+ bb\.pal/.test(battleSrc));
}
ok('band height is adaptive, so the road does not crawl',
   !/BAND_PX/.test(battleSrc) && /3 \+ \(y - hy\) \* 0\.13/.test(battleSrc));

// ── the city line has no shield trooper ────────────────────────────────────
// v1.7.4.0 settled what the shield trooper is FOR: stopping the thing that
// closes, which is why a charging class is weighted at half distance. A city
// fight between two polities has no charging class in it, so he arrives with
// nothing to bash and falls into the hold branch - the state that produced the
// sideways drift. Asserted rather than left to a comment, because a class table
// is exactly the kind of thing that gets a row added back to it.
ok('no shield trooper in the city class table',
   !/enforcer/.test(battleSrc));
ok('the class roll offers infantry and engineers only',
   /rnd\(\) < 0\.78 \? 'inf' : 'eng'/.test(battleSrc));

// ── the field is a city, not a boulevard ───────────────────────────────────
ok('the layout is a street grid', /var GRID = \{[\s\S]*?ax:\s*\[/.test(battleSrc));
ok('avenues run along z, so the fighting crosses x',
   /avenues along z make every street a firing lane/i.test(battleSrc) ||
   /THE AVENUES RUN ALONG Z ON\s*\n?\s*PURPOSE/i.test(battleSrc));
ok('blocks are floored rather than left as lawn', /CELLS/.test(battleSrc));
ok('the front moves', /function updateFront/.test(battleSrc));
ok('cover is scored by the front, not by distance alone',
   /function coverScore/.test(battleSrc));
ok('units bound between cover', /function maybeBound/.test(battleSrc));
ok('haze is air rather than the vegetation colour', /PAL\.haze/.test(battleSrc));
ok('strips are tessellated by world length, not by a fixed count',
   /STRIP_SEG/.test(battleSrc));

// ── rosterFor, with no canvas anywhere ─────────────────────────────────────
// The module is loaded against a bare window. Nothing here touches a context,
// so this runs without node-canvas and covers the decision the button makes.
const sand = { gState: {}, addEventListener() {},
               document: { getElementById: () => null } };
loadInto(sand, factionsSrc);
loadInto(sand, battleSrc);
const CB = sand.CB;
ok('the module attaches itself to the window', !!CB && !!CB.rosterFor);

sand.gState = {};
ok('an unknown colony has no roster', CB.rosterFor('nowhere') === null);

sand.gState = { solo: { control_coalition: 100 } };
ok('one belligerent is not a battle', CB.rosterFor('solo') === null);

sand.gState = { two: { control_coalition: 60, control_syndicate: 40 } };
const r = CB.rosterFor('two');
ok('two belligerents give a roster', !!r);
ok('the stronger holds the ground', r && r.home === 'coal');
ok('the weaker is the attacker', r && r.away === 'synd');

sand.gState = { three: { control_coalition: 20, control_syndicate: 55, control_void: 25 } };
const r3 = CB.rosterFor('three');
ok('three belligerents take the top two by control',
   r3 && r3.home === 'synd' && r3.away === 'void');

sand.gState = { st: { control_coalition: 70, control_fleshstation: 30 } };
ok('a faction with no uniform is left out rather than drawn as somebody else',
   CB.rosterFor('st') === null);

sand.gState = { same: { control_coalition: 50, control_coalition2: 50 } };
ok('a faction never appears on both lines',
   (() => { const x = CB.rosterFor('same'); return !x || x.home !== x.away; })());

// ── report ─────────────────────────────────────────────────────────────────
for (const f of fails) console.error('  FAIL  ' + f);
console.log(`\ncity-battle: ${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
