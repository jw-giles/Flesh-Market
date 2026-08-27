// ═══════════════════════════════════════════════════════════════════════════
// city-battle.js - the live battlefield viewer for a CITY war in settled space.
//
// The Reach has reach-battle.js. This is its counterpart for a colony: two
// polities fighting over a district on the outskirts of a Coalition-space city,
// with the city itself standing behind the fight in wireframe.
//
// IT INVENTS NO MECHANICS, AND THAT IS DELIBERATE. The city war already exists
// and has for a long time: server/city.js prices every point of faction control
// at WAR_FUND_BASE_PER_PCT + warRate(cityBook), war_fund_pool accumulates it,
// onColonyCaptured vacates every seat, and maybeStripOccupied salvages what a
// mayor built. Control percentages arrive in colony_state and the client
// already holds them in gState. Adding a second combat model next to that would
// fork the thing the economy is actually built on.
//
// So this is a VIEW. Who is fighting comes from the colony's own control
// figures; the ground, the casualties and the tracers are local and decide
// nothing, exactly as the Reach's ambient attrition does. Nothing here writes,
// no socket is opened, no state is touched.
//
//     window.cityWatch(colonyId)   open it
//     window.cityWatchClose()      close it
//     window.cbSetCam(mode)        flank / orbit / free
//
// The same module drives client/citybattle-mock.html, which is a bench for it
// and is where the camera and the tables get worked on.
//
// SAME SHAPE AS THE REACH MOCKUP THIS PROJECT ALREADY DID ONCE. It is a
// throwaway that owns its own fake server, so every number in here is local and
// decides nothing. What survives the port is the RENDERER and the tables, not
// the simulation: attrition between anonymous soldiers resolves locally for the
// same reason it does in reach-battle.js, which is that it has no economic
// consequence.
//
// The camera maths, bandPass, pushMeshAt, paintFace and the sprite tint loop
// are ported verbatim from reach-battle.js / coalition-sprites.js rather than
// rewritten, so what this draws is what the ported renderer draws.
//
// WHAT IS ACTUALLY NEW, and therefore what the port costs:
//   1. genTowers      wireframe skyline where genSpires puts the far scenery
//   2. MAT            a material per face instead of one far->rock ramp
//   3. the road       bandPass with a clip, plus kerb and lane quads
//   4. urban cover    barriers, planters, lamps, blocks alongside the meshes
//   5. FLORA urban    a climate row that finally spends the pack's trees
//
// SERVE IT OVER HTTP, NOT file://. The sprite tint needs getImageData and a
// file:// canvas is tainted, which throws. It degrades to untinted sheets
// rather than dying, but every faction will look identical.
//     cd client && python3 -m http.server 8080
//     http://localhost:8080/citybattle-mock.html
// ═══════════════════════════════════════════════════════════════════════════
(function (global) {
'use strict';

var CB = global.CB = {};
var ASSETS = global.CB_ASSETS || 'assets/space/';
/* ── Cache busting, and it is the reason the bench showed the old build ───
   NONE OF THIS MODULE'S ASSETS CARRIED A BUST AND EVERY ONE OF THEM IS NEW.
   coalition-sprites.js states the rule in its own header and it is worth
   repeating because it just bit: A BROWSER CACHES A 404 AS READILY AS A 200.
   The grass patches and the whole city/ directory did not exist until this
   week, so any browser that opened the bench before they landed remembers the
   miss and will never ask again - which presents as a scene rendering with the
   PREVIOUS build's graphics while the file on disk is current. It is not a
   stale script; it is a remembered absence.

   FM_BUILD comes from coalition-sprites.js, which tools/reach-check.mjs ties
   to client/version.json, so there is no second literal here to rot. Absent,
   the query is dropped and the browser caches normally - which is worse than a
   bust and much better than a stale wrong one. */
function bust() { return global.FM_BUILD ? ('?v=' + global.FM_BUILD) : ''; }

// ── field, exactly the Reach's ─────────────────────────────────────────────
var FIELD_W = 420, FIELD_D = 320, NEAR = 0.75;
var SUN = [0.55, 0.0, -0.84];
var PATCH_PX = 512, PATCH_TILES = 8, TILE_M = 6.0;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function mix3(a, b, k) {
  return [Math.round(a[0] + (b[0] - a[0]) * k),
          Math.round(a[1] + (b[1] - a[1]) * k),
          Math.round(a[2] + (b[2] - a[2]) * k)];
}

// ── palette ────────────────────────────────────────────────────────────────
// Derived the way every other world's is: forest_no_clouds_1's hue under
// terran_1's sky. A Coalition garden world at dusk. No new sampling step.
/* THE FIRST VERSION OF THIS TABLE WAS INVENTED AND IT PUT A BLUE FIELD ON THE
   SCREEN. `horizon` is not the colour of the sky at the horizon - it is the
   planet's LIT GROUND value, and buildPatterns tints the whole plain with it
   for exactly that reason. Filling it with a haze blue tinted the grass blue
   and the mistake was invisible until the pattern actually rendered, because
   until then the ground was not being drawn at all.
   So these are the shipped animated/forest_no_clouds_1 numbers verbatim.
   `sky` is the ONE value overridden, to dusk, because the fight is at dusk and
   sky is the only entry the ground never reads. */
var PAL_BODY = 'animated/forest_no_clouds_1';   // fallback only; MAP overrides
var PAL = null;
function buildPal() {
  var body = (MAP && MAP.body) || PAL_BODY;
  var row = global.PLANET_PALETTE[body] || global.PLANET_PALETTE[PAL_BODY];
  PAL = { sky: row.sky, horizon: row.horizon, ground: row.ground, far: row.far,
          rock: row.rock, edge: row.edge, mean: row.mean };
  /* THE ONE OVERRIDE, AND IT IS THE ONLY ENTRY THE GROUND NEVER READS.
     buildPatterns tints the whole plain with `horizon`, which is the planet's
     LIT GROUND value and not the colour of the sky - getting that backwards is
     what put a blue field on the screen the first time this was written. `sky`
     is safe to move because nothing but the gradient looks at it. */
  MAT.veg = [PAL.far, PAL.rock];     // vegetation IS the far -> rock ramp
  /* ── The sky belongs to the world, and it was a constant ──────────────
     `PAL.sky = [22,34,52]` sat here as a hardcoded dusk, with a comment saying
     it was safe to override because the ground never reads it. That was true
     and it was still wrong: it meant an ice world, a lava world and a garden
     world all fought under IDENTICAL SKIES, so the one part of the frame that
     covers half the screen carried no information about where you were.

     planet-palette already ships a `sky` per body, sampled off that world's own
     art. It is a DAYLIGHT value, which is why it could not be used raw - a
     battle at dusk under a noon sky reads as two images. So the row's sky is
     graded toward night rather than replaced: hue and relative saturation are
     the world's, value is the engagement's. A lava world's sky stays warm and
     a tundra world's stays cold, and neither is bright. */
  var dusk = [10, 14, 26];
  PAL.sky = mix3(row.sky, dusk, 0.52);
  /* The zenith is the same grade taken further, so the gradient is the world's
     own sky darkening upward rather than a fixed blue-black everywhere. */
  PAL.zenith = mix3(row.sky, dusk, 0.86);

  /* ── Haze is AIR, not ground ──────────────────────────────────────────
     reach-battle hazes toward `horizon` and that is right there, because on a
     brood world the lit ground value and the sky are within a few degrees of
     each other. Here they are not: `horizon` on a garden world is a saturated
     green, so hazing toward it painted a green fog over a city at dusk and the
     whole middle distance read as a park.

     The atmosphere between the camera and a building four hundred metres away
     is not made of grass. Mostly sky, with enough of the ground value left in
     it that the fog still belongs to this world rather than to a grey one. */
  PAL.haze = mix3(PAL.horizon, PAL.sky, 0.58);
}
// ── materials ──────────────────────────────────────────────────────────────
// paintFace has exactly ONE ramp, far -> rock, and that is correct on a world
// where every surface is the same dead mineral. It stops being correct the
// moment a kerb stands next to a hedge: one ramp cannot say "this is concrete
// and that is a bush" and the whole street comes out mossy.
var MAT = {
  veg:   [[37, 76, 63], [70, 186, 141]],   // agrees with far -> rock
  /* DARKER THAN IT WAS, because concrete is now TRIM rather than the whole
     building. When every wall was a concrete fill it had to carry the scene
     and was lit to suit; now the facades carry it and the same value on a
     cornice or a lamp post reads as a white line drawn over a dark street. */
  conc:  [[18, 21, 26], [68, 74, 84]],
  rust:  [[38, 33, 30], [134, 100, 78]],
  glass: [[20, 32, 46], [70, 116, 168]],
  asph:  [[20, 22, 26], [66, 72, 80]],
  /* `lit` is retired. It existed to fake a warm shopfront with a coloured
     band; the facade textures carry real doors and real lit windows in their
     emissive map, so the fake is now competing with the real thing. */
  pave:  [[30, 32, 36], [116, 120, 126]],
};

// ── the shipped modules, and NOT a copy of them ────────────────────────────
// THE FIRST DRAFT OF THIS FILE CARRIED ITS OWN FACTION TABLE, ITS OWN FRAMES
// TABLE AND ITS OWN COPY OF THE TINT LOOP, and client/battle-test.html already
// contains the argument against that, written before I got here: "a test bench
// that contains its own copy of the renderer drifts from the real one and
// starts lying the first time either is touched". It is the same lesson the
// faction registry consolidation learned five times over - the fifth copy of a
// faction's identity was the one nobody remembered to edit.
//
// So all of it is gone. This page loads factions.js and coalition-sprites.js
// with plain script tags and reads them, which means a change to a uniform, an
// optic, a skin policy or a sheet's geometry shows up here without anyone
// touching this file.
//
// NO FALLBACK, DELIBERATELY, and that is the second half of the same lesson.
// reach-battle.js keeps fallbacks because it can be parsed before factions.js
// lands in the live client and must not draw a black field. A bench controls
// its own script order, so a fallback here buys nothing and costs the exact
// failure battle-test.html shipped with: it rendered the FALLBACK registry for
// months, looked fine, and was showing a build that no longer existed. Missing
// module is a loud stop.
function TR()  { return global.FMTroops; }
function REG() { return global.FM_FACTIONS; }
function API() { return global.FM_FAC_API; }
function missing() {
  var m = [];
  if (!global.PLANET_PALETTE) m.push('assets/planet-palette.js');
  if (!REG() || !API())       m.push('assets/factions.js');
  if (!TR())                  m.push('assets/coalition-sprites.js');
  return m;
}
function facRow(f) { return (REG() && REG()[f]) || null; }
function skinFor(fac, i) {
  var t = API().skinFor(fac, i);
  return t === null ? null : t;
}
function kitFor(fac, i) { return API().kitFor(fac, i); }
/* WHICH FACTIONS CAN STAND ON A LINE HERE. The registry carries khai so that
   facOf() has somewhere to land, but the brood is not a polity: it wears a
   creature pack routed through BROOD_SPRITE, which this bench does not drive.
   Excluded by NAME rather than by a guess at its shape, and stated, because
   silently dropping a registry row is how a bench stops covering something. */
var NOT_A_POLITY = { khai: 1 };
function polities() {
  var out = [], k;
  for (k in REG()) if (!NOT_A_POLITY[k]) out.push(k);
  return out;
}

// ── canvas + camera ────────────────────────────────────────────────────────
var cv = null, ctx = null, W = 0, H = 0, DPR = 1, focal = 800;
var cam = { x: 0.5, y: 12, z: -6, yaw: 0, pitch: -0.075 };
var Fv = [0,0,1], Rv = [1,0,0], Uv = [0,1,0];
function camBasis() {
  var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  Fv[0] = sy*cp; Fv[1] = sp; Fv[2] = cy*cp;
  Rv[0] = cy;    Rv[1] = 0;  Rv[2] = -sy;
  // U = F x R. Reversed, the whole scene renders upside down.
  Uv[0] = Fv[1]*Rv[2] - Fv[2]*Rv[1];
  Uv[1] = Fv[2]*Rv[0] - Fv[0]*Rv[2];
  Uv[2] = Fv[0]*Rv[1] - Fv[1]*Rv[0];
}
var _v = [0,0,0];
function toView(x, y, z, o) {
  var dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
  o[0] = dx*Rv[0] + dy*Rv[1] + dz*Rv[2];
  o[1] = dx*Uv[0] + dy*Uv[1] + dz*Uv[2];
  o[2] = dx*Fv[0] + dy*Fv[1] + dz*Fv[2];
}
function project(x, y, z, o) {
  toView(x, y, z, _v);
  if (_v[2] < NEAR) return false;
  o[0] = W*0.5 + _v[0]/_v[2]*focal;
  o[1] = H*0.5 - _v[1]/_v[2]*focal;
  o[2] = _v[2];
  return true;
}
function horizonY() { return H*0.5 + Math.tan(cam.pitch)*focal; }

function resize(w, h) {
  W = Math.max(1, w|0); H = Math.max(1, h|0);
  cv.width = W*DPR; cv.height = H*DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  focal = (H*0.5) / Math.tan(0.52);   // ~60 deg vertical fov
}

// ── ground patterns and the band pass ──────────────────────────────────────
var _ter = {}, _terPend = {}, PATS = null;
function terSheet(key) {
  if (_ter[key] !== undefined) return _ter[key];
  if (_terPend[key]) return null;
  _terPend[key] = 1;
  var im = new global.Image();
  im.onload  = function () { _ter[key] = im;   PATS = null; };
  im.onerror = function () {
    _ter[key] = null; PATS = null;
    /* A MISSING ASSET TREE LOOKS EXACTLY LIKE A BROKEN RENDERER, and that cost
       a debugging session already. The renderer is supposed to degrade when art
       is absent - it does, all the way down to an empty plain - so the degraded
       state has to SAY it is degraded rather than sit there being dark. */
    CB.warn = 'assets not found at ' + ASSETS + ' - run this from client/ over http';
  };
  im.src = ASSETS + 'terrain/' + key + '.png' + bust();
  return null;
}
function lumOf(c) { return (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255; }
function tintedPattern(key, tint, wantLum) {
  var im = terSheet(key);
  if (!im) return null;
  var c = CB.newCanvas(PATCH_PX, PATCH_PX);
  var g = c.getContext('2d');
  g.drawImage(im, 0, 0, PATCH_PX, PATCH_PX);
  // 'color' takes hue and saturation from the fill and luminosity from
  // underneath, which is why one greyscale patch set covers every world.
  g.globalCompositeOperation = 'color';
  g.fillStyle = 'rgb(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ')';
  g.fillRect(0, 0, PATCH_PX, PATCH_PX);
  // Measure, do not guess: the patches do not share a mean.
  var mean = 0.5;
  try {
    var probe = CB.newCanvas(1, 1);
    var pg = probe.getContext('2d', { willReadFrequently: true });
    pg.drawImage(c, 0, 0, 1, 1);
    var d = pg.getImageData(0, 0, 1, 1).data;
    mean = (0.2126*d[0] + 0.7152*d[1] + 0.0722*d[2]) / 255;
  } catch (e) {}
  var f = clamp(wantLum / Math.max(0.02, mean), 0.05, 2.4);
  if (f < 0.995) {
    g.globalCompositeOperation = 'multiply';
    var k = clamp(Math.round(f*255), 0, 255);
    g.fillStyle = 'rgb(' + k + ',' + k + ',' + k + ')';
    g.fillRect(0, 0, PATCH_PX, PATCH_PX);
  } else if (f > 1.005) {
    g.globalCompositeOperation = 'screen';
    var k2 = clamp(Math.round((1 - 1/f)*255), 0, 255);
    g.fillStyle = 'rgb(' + k2 + ',' + k2 + ',' + k2 + ')';
    g.fillRect(0, 0, PATCH_PX, PATCH_PX);
  }
  g.globalCompositeOperation = 'source-over';
  return ctx.createPattern(c, 'repeat');
}
/* NOT CACHED UNTIL IT IS COMPLETE. terSheet invalidates PATS from inside its
   own onload, so a build that starts before the sheets decode can finish AFTER
   the invalidation and cache a set of nulls that nothing ever clears again. In
   a browser it happens to recover, because the last sheet to load invalidates
   after the last build; with a synchronous loader it does not, and the ground
   is simply missing. Same class of bug either way - the fix is to not cache a
   half-built thing rather than to rely on the load order. */
var _patsTry = { grass:null, scrub:null, asph:null, pave:null };
function pats() {
  if (PATS) return PATS;
  var m = PAL.mean;
  var patch = (MAP && MAP.patch) || 'grass';
  var p = {
    /* GRASS, NOT GRAVEL WEARING GREEN. This read `dust_base` until now, which
       is the CODESPREE bake: sand, pebbles, dryland. Tinting a stone tile with
       a forest palette gives you a green stone tile, and that is most of why
       the plain looked flat no matter what was done to the palette over it.
       grass_base is generated by tools/terrain-synth.py out of arithmetic -
       clump noise, aligned blade strokes and bare scrapes - so it is actually
       turf, it is owned outright, and it carries no licence question at all. */
    /* THE PATCH FOLLOWS THE WORLD. COLONY_VISUAL has said which terrain every
       colony is made of since before cities shipped; this reads it rather than
       holding a second opinion, so a battle on Nova Reach is fought on ice
       because Nova Reach IS ice. */
    grass: tintedPattern(patch + '_base', PAL.horizon, clamp(lumOf(m)*0.52, 0.16, 0.66)),
    scrub: tintedPattern(patch + '_rock', PAL.rock,    clamp(lumOf(m)*0.62, 0.20, 0.76)),
    /* LARGER TILE, LOWER CONTRAST. The first setting tiled the patch every
       fourteen metres and the carriageway came out as speckle - grain at the
       size of gravel, which at this camera height is noise rather than
       material. Tarmac at forty metres reads as broad patching and a slight
       sheen, not as individual stones. The tile scale is set at the call site;
       what changes here is the target luminance, lifted so the pattern's own
       range compresses and stops fighting the markings. */
    asph:  tintedPattern('station_base', [86, 92, 102], 0.21),
    /* ITS OWN PATTERN, BECAUSE THE PAVEMENT WAS BORROWING THE SCRUB ONE AND
       THE SCRUB ONE IS TINTED WITH PAL.rock - which on this world is the
       VEGETATION colour. The concrete came out streaked green, which looked
       like a shading bug and was actually a material wearing another
       material's tint. Same patch, tinted as concrete. */
    /* CONTRAST, NOT TILE SIZE, IS THE DIAL FOR "CLEANER". Enlarging the tile
       to kill speckle just turns speckle into SMEARS - the same noise at a
       scale where each blob is a metre across, which on a pavement reads as
       damp patches. The fix is to keep the tile near the size of a slab and
       compress the pattern's own range instead, which is what the luminance
       target does. */
    pave:  tintedPattern('station_base', [120, 124, 130], 0.46),
  };
  if (p.grass && p.scrub && p.asph && p.pave) PATS = p;
  return (_patsTry = p);
}
/* One band pass over a horizontal plane. clipFn, if given, receives ctx and is
   expected to build a path and call ctx.clip(). Taking a callback rather than a
   Path2D keeps this working on engines without Path2D, which matters because
   the road is drawn through it. */
function bandPass(pattern, planeY, clipFn, scale, flat, maxT) {
  if (!pattern) return;
  var eye = cam.y - planeY;
  if (eye <= 0.05) return;
  var hy = horizonY();
  var y0 = Math.max(0, Math.floor(hy) + 1);
  try {
    pattern.setTransform(new global.DOMMatrix().scale(
      (TILE_M * PATCH_TILES * (scale || 1)) / PATCH_PX));
  } catch (e) {}
  /* ── Band height is ADAPTIVE, and this is the fix for the crawling road ──
     bandPass approximates a perspective plane with one affine per horizontal
     band. With zero camera roll a SCANLINE maps to the ground exactly - depth
     is constant along it - so there is no horizontal error at all. All of the
     error is VERTICAL: depth is linearised across the band's height, and the
     band edges are pinned to SCREEN space, so as the camera moves the world
     slides through them and the piecewise seams crawl. That is the "textures
     move awkwardly when free camming".

     MEASURED, at 1440x810 and a 60 degree vertical fov, as texture slip in
     pixels against the true projection:

       fixed 26px band   5.94px worst   18 bands   <- what shipped
       fixed 12px band   2.78px worst   38 bands
       fixed  6px band   1.30px worst   74 bands
       adaptive          0.81px worst   25 bands   <- this

     The error is not spread evenly: it is concentrated just under the horizon,
     because that is where depth changes fastest per pixel. Sizing the band by
     its distance from the horizon puts the small bands exactly where the error
     is and pays nothing for the rest of the screen - seven times less slip
     than the fixed band, for forty percent more bands, and better than a
     uniform 6px band that costs four times as many. */
  for (var y = y0, yb = 0; y < H; y = yb) {
    var bh = Math.max(4, Math.min(44, 3 + (y - hy) * 0.13));
    yb = y + bh;
    var dyA = (H*0.5 - y )*Uv[1] + focal*Fv[1];
    var dyB = (H*0.5 - yb)*Uv[1] + focal*Fv[1];
    if (dyA >= -1e-6 || dyB >= -1e-6) continue;
    var tA = -eye/dyA, tB = -eye/dyB;
    if (tA <= 0 || tB <= 0 || tA > 40000) continue;
    /* DETAIL PASSES STOP WHERE DETAIL STOPS BEING VISIBLE. Measured: the ground
       was 240ms of a 389ms frame under cairo and it is three passes over the
       same plane, every one of them drawn all the way to the horizon. The
       second and third passes are grain and broad shading; past a couple of
       hundred metres the haze is over them at three quarters alpha and they are
       contributing nothing but fill. The base pass still runs to the horizon,
       because THAT one is the ground. */
    if (maxT && tA > maxT) continue;
    var ax = cam.x + tA*((0 - W*0.5)*Rv[0] + (H*0.5 - y)*Uv[0] + focal*Fv[0]);
    var az = cam.z + tA*((0 - W*0.5)*Rv[2] + (H*0.5 - y)*Uv[2] + focal*Fv[2]);
    var e1x = tA*Rv[0]*W, e1z = tA*Rv[2]*W;
    var cx2 = cam.x + tB*((0 - W*0.5)*Rv[0] + (H*0.5 - yb)*Uv[0] + focal*Fv[0]);
    var cz2 = cam.z + tB*((0 - W*0.5)*Rv[2] + (H*0.5 - yb)*Uv[2] + focal*Fv[2]);
    var e2x = cx2 - ax, e2z = cz2 - az;
    var det = e1x*e2z - e1z*e2x;
    if (!det || !isFinite(det)) continue;
    var L00 =  W*e2z/det,        L01 = -W*e2x/det;
    var L10 = -bh*e1z/det,       L11 =  bh*e1x/det;
    /* DEGENERATE BAND GUARD, and it is not just belt and braces. The band one
       pixel below the horizon maps a 26px strip onto tens of kilometres of
       ground, so the affine gets a scale in the thousands and the fill below
       covers a world-space rectangle of five field widths at that scale. A
       browser clips it and shrugs; cairo tries to rasterize it and dies with
       an allocation failure. The band is entirely inside the haze either way,
       so dropping it costs nothing visible and it is the same fix in both. */
    if (!isFinite(L00) || !isFinite(L11) ||
        Math.abs(L00) > 4000 || Math.abs(L11) > 4000 ||
        Math.abs(L01) > 4000 || Math.abs(L10) > 4000) continue;
    var bx0 = Math.min(ax, ax+e1x, ax+e2x, ax+e1x+e2x);
    var bx1 = Math.max(ax, ax+e1x, ax+e2x, ax+e1x+e2x);
    var bz0 = Math.min(az, az+e1z, az+e2z, az+e1z+e2z);
    var bz1 = Math.max(az, az+e1z, az+e2z, az+e1z+e2z);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, W, bh + 0.5); ctx.clip();
    if (clipFn) clipFn(ctx);
    /* THE BAND JUST BELOW THE HORIZON COVERS 170 KILOMETRES OF GROUND, and that
       is not an edge case, it is every frame. Measured: the first band under
       the horizon has a world footprint of 172000 x 56000 units, which at a 48m
       tile is four million tiles for a strip 26 pixels tall. A browser clips it
       and the cost is invisible; cairo tries to render every tile and dies with
       an allocation failure.

       At that distance a tiled pattern is sub-pixel noise whose average IS the
       flat colour, and the haze is sitting on top of it at three quarters
       alpha. So past the threshold the band is filled flat and nothing is lost
       except the work. This is a real saving in the browser too - it is the
       band that was always the most expensive and always the least visible. */
    if (flat && (bx1-bx0)*(bz1-bz0) > 4e6) {
      ctx.fillStyle = flat;
      ctx.fillRect(0, y, W, bh + 0.5);
      ctx.restore();
      continue;
    }
    ctx.transform(L00, L10, L01, L11, 0 - (L00*ax + L01*az), y - (L10*ax + L11*az));
    ctx.fillStyle = pattern;
    /* FILL THE BAND'S OWN FOOTPRINT, NOT A FIXED WORLD RECTANGLE. The original
       fills five field widths on every band so the plain does not stop where
       the field does - correct, and it is also what kills this. Near the
       horizon the affine has a scale in the thousands, so a 2100-unit world
       rect becomes a device rect of millions of pixels; the browser clips it
       and shrugs, cairo tries to allocate it. The four corners of the band ARE
       the ground it covers, so filling their bounding box draws exactly the
       same pixels and asks for nothing outside the clip.

       Padded by a quarter, because the box is computed from the band's top and
       bottom edges and the pattern needs a little slack at the corners. */
    var padx = (bx1-bx0)*0.25 + 2, padz = (bz1-bz0)*0.25 + 2;
    ctx.fillRect(bx0-padx, bz0-padz, (bx1-bx0)+padx*2, (bz1-bz0)+padz*2);
    ctx.restore();
  }
}

/* ── Every front line in settled space ────────────────────────────────────
   THIRTY-FIVE COLONIES AND SIXTY-EIGHT ZONES NEED A BATTLEFIELD EACH, AND
   NOT ONE OF THEM IS HAND WRITTEN. That is a deliberate refusal. Sixty-eight
   authored maps is sixty-eight things to keep in step with a lore file, a
   sector table and a terrain table that already exist and already disagree
   with nothing - and this repo has learned five times over what happens to
   the fifth copy of a fact.

   EVERYTHING HERE IS DERIVED FROM DATA THAT WAS ALREADY AUTHORED:

     COLONY_VISUAL.layout   radial, grid, archipelago, terraced, spine,
                            organic. Six of them, set per colony, and shipped
                            since before cities did - server/city.js even says
                            "layouts are placeholders until city geometry
                            exists". This is that geometry. The layout has been
                            sitting there describing how a colony is built and
                            nothing has ever drawn it.
     COLONY_VISUAL.terrain  which ground patch the plain is tiled with, so a
                            battle on Nova Reach is fought on ice because Nova
                            Reach IS ice, not because a battlefield table says
                            so separately.
     planet.sector          what the zone DOES - Finance, Manufacturing, Gray
                            Bazaar, Energy - which is the single best predictor
                            of what its streets look like. A finance district
                            is tall and narrow-lotted; a foundry is low, wide
                            and set back; a bazaar is dense and short.
     galaxy                 Circuit or Coalition space, which biases the
                            facade pool.

   So a new colony added to COLONY_META gets a battlefield for free, and moving
   a colony's terrain moves the ground it is fought on. THAT is the property
   worth having; sixty-eight tables would not have it.

   WHAT THIS IS NOT: it is not six bespoke renderers. The layouts modulate one
   street generator - avenue count, spacing, jitter, block fill and setback -
   rather than each building a city a different way. radial and archipelago in
   particular are APPROXIMATED within a rectilinear grid, because the sprite
   pack needs the fighting to cross the x axis and a genuinely radial street
   plan would put lanes at angles the art cannot be drawn along. Stated plainly
   rather than discovered: a colony marked 'radial' gets converging spacing and
   a plaza, not a wheel. */

/* Ground patch per terrain key. These are the keys COLONY_VISUAL already uses;
   `grass` is the generated patch and is reached through GARDEN below rather
   than by adding a seventh key to a server table this file does not own. */
var TERRAIN_PATCH = {
  dust: 'dust', ice: 'ice', ocean: 'ocean', rift: 'rift',
  station: 'station', tether: 'tether', veins: 'veins', grass: 'grass',
};
/* WHICH WORLDS ARE GREEN, and it is read from the landscape art rather than
   decided here. galaxy.js already assigns every colony a landscape sprite for
   its surface backdrop, and the three that get `forest_1` are the three the
   game has always drawn as green. A fourth opinion about which worlds have
   grass on them is exactly the kind of thing that drifts. */
var GARDEN = { lustandia: 1, houji_fields: 1, lingtai_reach: 1 };

/* ── The two that have no ground to fight on ──────────────────────────────
   Abaddon and Flesh Station are the only colonies with NO COLONY_VISUAL row,
   and that is not an omission - galaxy.js maps both to a space-station
   landscape and SP_SECTOR_CITY explicitly gives them a null city. They are
   orbital, so there is no street to hold and no terrain to stand on.

   NAMED AND REFUSED rather than defaulted. Falling through to dust/grid would
   have produced a perfectly convincing city battlefield on a station that has
   no surface, and that is worse than having none: the picture would be lying
   about the world, confidently, and nothing downstream could tell. A boarding
   action on a station is a different scene and should be built as one. */
var NO_SURFACE = { abaddon: 1, flesh_station: 1 };

/* Palette body per terrain, taken from the shipped planet-palette table so the
   ground of a battle is the colour of the world it is fought on. */
var TERRAIN_BODY = {
  dust:    'animated/desert_1',
  ice:     'animated/ice',
  ocean:   'animated/ocean_no_clouds',
  rift:    'animated/barren_2',
  station: 'animated/barren_1',
  tether:  'animated/tundra_1',
  veins:   'animated/lava_2',
  grass:   'animated/forest_no_clouds_1',
};

/* What a district's TRADE does to its streets. The numbers are ratios applied
   to the base layout, not absolutes, so a Finance district on a spine colony
   is still a spine - taller and tighter than the same colony's foundry, which
   is the point. */
var SECTOR_PLAN = {
  //                    height  lot     setback  density
  'Finance':           { h: 1.55, lot: 0.78, set: 0.9, den: 1.00 },
  'Capital Syndicate': { h: 1.50, lot: 0.80, set: 0.9, den: 1.00 },
  'Insurance':         { h: 1.30, lot: 0.86, set: 1.0, den: 0.95 },
  'Indemnity Brokers': { h: 1.28, lot: 0.86, set: 1.0, den: 0.95 },
  'Tech':              { h: 1.20, lot: 0.90, set: 1.1, den: 0.90 },
  'Neural Networks':   { h: 1.24, lot: 0.88, set: 1.1, den: 0.90 },
  'Biotech':           { h: 1.05, lot: 1.00, set: 1.3, den: 0.80 },
  'Flesh & Gene':      { h: 1.05, lot: 1.00, set: 1.3, den: 0.80 },
  'Manufacturing':     { h: 0.72, lot: 1.30, set: 1.4, den: 0.70 },
  'Industrial':        { h: 0.72, lot: 1.30, set: 1.4, den: 0.70 },
  'Iron Foundries':    { h: 0.66, lot: 1.40, set: 1.5, den: 0.65 },
  'Energy':            { h: 0.90, lot: 1.35, set: 1.5, den: 0.60 },
  'Power Cartels':     { h: 0.90, lot: 1.35, set: 1.5, den: 0.60 },
  'Logistics':         { h: 0.60, lot: 1.45, set: 1.2, den: 0.72 },
  'Transit Guild':     { h: 0.64, lot: 1.40, set: 1.2, den: 0.74 },
  'Gray Bazaar':       { h: 0.80, lot: 0.62, set: 0.5, den: 1.30 },
  'Agriculture':       { h: 0.55, lot: 1.60, set: 2.0, den: 0.45 },
  'Defense':           { h: 0.95, lot: 1.15, set: 1.6, den: 0.70 },
  'Misc':              { h: 1.00, lot: 1.00, set: 1.0, den: 1.00 },
};
function sectorPlan(n) { return SECTOR_PLAN[n] || SECTOR_PLAN.Misc; }

/* How a colony is BUILT. avenues/cross are counts, spread is how far apart,
   jitter is how far each street wanders off its ideal position, and fill is
   how much of each block is actually built on. */
var LAYOUT_PLAN = {
  grid:        { av: 3, cr: 3, spread: 1.00, jitter: 0.00, fill: 1.00, hw: 6.2 },
  // A spine is one wide artery with short ribs: fewer avenues, wider.
  spine:       { av: 2, cr: 4, spread: 1.45, jitter: 0.06, fill: 1.00, hw: 8.4 },
  // Terraced steps back as it climbs, so blocks thin out with depth.
  terraced:    { av: 3, cr: 4, spread: 0.92, jitter: 0.04, fill: 0.92, hw: 5.8 },
  // Organic never quite lines up. The jitter IS the layout.
  organic:     { av: 3, cr: 3, spread: 1.05, jitter: 0.24, fill: 0.94, hw: 6.0 },
  // Radial: spacing converges toward the centre and the middle block is a
  // plaza rather than a building. Approximated, see the note above.
  radial:      { av: 4, cr: 3, spread: 0.86, jitter: 0.10, fill: 0.86, hw: 6.6 },
  // Archipelago is islands: wide gaps and a lot of empty lot.
  archipelago: { av: 3, cr: 3, spread: 1.30, jitter: 0.18, fill: 0.62, hw: 6.0 },
};
function layoutPlan(n) { return LAYOUT_PLAN[n] || LAYOUT_PLAN.grid; }

/* ── Which colourway a world builds in ────────────────────────────────────
   THE SAME IDEA THE FACADE POOLS CARRIED, MOVED ONTO THE KIT. The kit ships
   ten coordinated palettes; Circuit worlds draw from the colder, cleaner half
   and Coalition frontier colonies from the warmer, dirtier half, with a Gray
   Bazaar drawing from all ten because that is what a bazaar is. A building
   picks one and every piece on it matches, which is what makes a block read as
   buildings rather than as a pile of parts. */
/* BLACK IS IN THE KIT AND IS NOT USED. Measured off the bake, WallBlack is
   rgb(9,15,11) - it is a daylight colour that only reads against a lit sky, and
   at night, under an ambient grade, it is a hole in the street. The pack is
   right to ship it; a night scene is wrong to pick it. Every other palette
   survives the grade. */
var PAL_JADE = ['DeepNavy', 'MidnightBlue', 'SteelBlue', 'Slate', 'DarkCharcoal'];
var PAL_COAL = ['DarkUmber', 'EspressoBrown', 'Khaki', 'DarkGrey', 'Slate'];
var PAL_ANY  = ['DeepNavy', 'MidnightBlue', 'SteelBlue', 'Slate', 'DarkCharcoal',
                'DarkUmber', 'EspressoBrown', 'Khaki', 'DarkGrey'];

function hashStr(str) {
  var h = 2166136261, i;
  for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* THE MAP FOR ONE ZONE. Pure function of ids and the shipped tables, so it is
   the same map on every client and after every reload without anything being
   stored anywhere. */
CB.mapFor = function (colonyId, zoneIdx) {
  zoneIdx = zoneIdx || 0;
  if (NO_SURFACE[colonyId]) return null;
  /* THREE SOURCES, IN ORDER OF AUTHORITY. In the live client galaxy.js
     publishes _FM_COLONY_META and the generated city-fronts.js supplies the
     visual rows the SERVER owns and never sends. The harness injects both
     directly, which is why the harness was the one consumer that could never
     hit the bug where COLONY_VISUAL was simply absent in a browser. */
  var PUB  = global.FM_CITY_FRONTS || {};
  var META = global._FM_COLONY_META || PUB.meta || {};
  var VIS  = global.FM_COLONY_VISUAL || PUB.visual || {};
  var col  = META[colonyId] || {};
  var vis  = VIS[colonyId] || {};
  var zone = (col.planets && col.planets[zoneIdx]) || {};
  var terrain = GARDEN[colonyId] ? 'grass' : (vis.terrain || 'dust');
  var jade = col.galaxy === 'jade';
  var sect = zone.sectorName || 'Misc';
  return {
    colonyId: colonyId, zoneIdx: zoneIdx,
    name: zone.name || col.name || colonyId,
    colony: col.name || colonyId,
    sector: sect,
    jade: jade,
    layout: vis.layout || 'grid',
    terrain: terrain,
    patch: TERRAIN_PATCH[terrain] || 'dust',
    body: TERRAIN_BODY[terrain] || TERRAIN_BODY.dust,
    plan: sectorPlan(sect),
    palette: sect === 'Gray Bazaar' ? PAL_ANY : (jade ? PAL_JADE : PAL_COAL),
    lay: layoutPlan(vis.layout || 'grid'),
    seed: hashStr(colonyId + '#' + zoneIdx),
  };
};
var MAP = null;                  // the zone currently being drawn

/* ── The block grid ───────────────────────────────────────────────────────
   A SINGLE BOULEVARD WITH A LINE ON EACH VERGE IS A FIELD BATTLE WITH TARMAC
   DOWN THE MIDDLE. It reads fine and it is not urban: nothing is ever between
   the two lines except distance, there is no flank that is not the whole
   flank, and no man ever loses sight of the enemy. An urban front is the
   opposite of all three - it is short sightlines, cover that runs out, and
   ground taken a building at a time.

   So: three avenues running with the camera, three cross streets across it,
   and blocks of buildings in the cells between. THE AVENUES RUN ALONG Z ON
   PURPOSE. The sprite pack is single facing, so the fighting has to happen
   across the x axis for a profile to be the correct drawing of a man; avenues
   along z make every street a firing lane pointing the right way, and the
   blocks either side are what break those lanes up.

   The centre avenue is the seam the front starts on. It does not stay there. */
var CELLS = [];
/* GRID IS BUILT, NOT WRITTEN. The three avenues and three cross streets were a
   literal, which is fine for one map and is exactly wrong for sixty-eight: the
   layout key decides how many streets there are, how far apart, and how far
   each wanders off its ideal line. */
var GRID = { ax: [-72, 0, 72], az: [58, 168, 278], hw: 6.2,
             z0: -600, z1: 900, x0: -300, x1: 300 };
function buildGrid(m) {
  var lay = m.lay, rnd = mulberry32(m.seed ^ 0x9317);
  var gapX = 74 * lay.spread, gapZ = 112 * lay.spread;
  var ax = [], az = [], i, t;
  for (i = 0; i < lay.av; i++) {
    t = i - (lay.av - 1) / 2;
    /* RADIAL CONVERGES. Spacing shrinks toward the centre, which inside a
       rectilinear plan is what a radial city actually feels like at street
       level - blocks getting tighter as you walk in - without putting a single
       lane at an angle the sprite pack cannot be drawn along. */
    var conv = m.layout === 'radial' ? (0.62 + Math.abs(t) * 0.40) : 1;
    ax.push(t * gapX * conv + (rnd() - 0.5) * gapX * lay.jitter);
  }
  for (i = 0; i < lay.cr; i++) {
    az.push(50 + i * gapZ + (rnd() - 0.5) * gapZ * lay.jitter);
  }
  // The contested avenue is always the middle one, and it is always at x=0,
  // because the front and the whole camera arc are built around that seam.
  var mid = ax[(lay.av / 2) | 0];
  for (i = 0; i < ax.length; i++) ax[i] -= mid;
  ax.sort(function (a, b) { return a - b; });
  GRID.ax = ax; GRID.az = az; GRID.hw = lay.hw;
  /* ONE BLOCK OUTSIDE THE OUTERMOST STREET, both ways. That is the width a
     flank has to swing through and no more; past it the men would be fighting
     over ground the camera never looks at. */
  var span = Math.max(Math.abs(ax[0]), Math.abs(ax[ax.length-1])) + gapX*0.62;
  ARENA.x0 = -span; ARENA.x1 = span;
  /* Behind the camera line and one block past the last cross street. The near
     bound is negative because the camera stands at z ~ 50 and the rank nearest
     the viewer has to have somewhere to be. */
  ARENA.z0 = -34;
  /* ── AND THE DEPTH IS CAPPED, WHICH THE FIRST VERSION WAS NOT ───────────
     Derived straight off the last cross street it came out between 326 and 663
     metres depending on layout - a spine colony spaces its ribs at 1.45 and
     ends up with a SIX HUNDRED AND SIXTY METRE corridor. Swept across all 66
     fronts: archipelago 452-468, grid 370, organic 372-391, radial 326-334,
     spine 658-663, terraced 448-452.

     That is not a bigger arena, it is a mostly invisible one. The locked
     camera stands at z0+62 and the view radius is 150, so on a spine world
     five hundred metres of the fight sits permanently in fog and half the army
     spawns into it. The Reach's field is a FLAT 320 deep on every world for
     exactly this reason: the extent is a property of the ENGAGEMENT, not of
     the terrain generator that happens to be underneath it.

     Capped to 330, which is the Reach's number and about twice what the camera
     can see - deliberately, because men fighting in a street you cannot see
     yet is what a front line is, and men fighting four hundred metres past the
     last thing you will ever look at is just wasted simulation. */
  ARENA.z1 = Math.min(az[az.length-1] + gapZ*0.55, ARENA.z0 + 330);
  ARENA.w = ARENA.x1 - ARENA.x0;
  ARENA.d = ARENA.z1 - ARENA.z0;
}
var PAVE = 3.2, VERGE = 1.8;

/* ── THE ARENA, WHICH IS THE REACH'S RECTANGLE WEARING A STREET PLAN ──────
   THE CITY HAD NO EDGES. The block generator ran cells from x -300 to 300 and
   z -600 to 900, the front was clamped to a literal +/-58 that no other number
   agreed with, units spawned anywhere in a 350m band, and the camera could
   walk out of all of it. Nothing was wrong in the sense of throwing; it just
   meant the scene had no answer to "how big is this fight", so every system
   answered separately and none of them matched.

   THE REACH ANSWERED IT ONCE AND EVERYTHING ELSE READS THE ANSWER. There, a
   field is FIELD_W x FIELD_D, units live in normalized coordinates mapped
   through wx()/wz(), the front is one scalar with a clamped usable travel, and
   every depth offset in the sim is measured off that scalar. The camera is
   anchored to the front rather than to the map. Copied here exactly, with one
   substitution: the Reach's front runs across DEPTH toward the hive, and a
   city's runs across WIDTH along the contested avenue, because that is the
   axis the sprite pack can be drawn along.

   *** TWO EXTENTS, NOT ONE, AND THIS IS THE PART THAT IS EASY TO GET WRONG. ***
   The Reach's ground deliberately runs five field-widths past the field, and
   the comment there gives the reason: filling only the playable extent leaves
   a hard straight edge in the middle distance and the world reads as a rug on
   a floor. So ARENA is the GAMEPLAY extent - where cover exists, where units
   are, how far the front can travel - and the built city keeps running past it
   into the haze as backdrop. Bounding the drawing as well as the fight would
   trade a scene with no edges for a scene with a visible one.

   Derived from the grid rather than written down, because the grid is derived
   from the layout: a spine colony has two wide avenues and an archipelago has
   three at 1.3 spacing, and a literal arena would be too tight on one and
   half-empty on the other. */
var ARENA = { x0: -140, x1: 140, z0: -30, z1: 340, w: 280, d: 370 };
function inArena(x, z) {
  return x > ARENA.x0 && x < ARENA.x1 && z > ARENA.z0 && z < ARENA.z1;
}
/* The usable travel of the front, inset from the arena wall. The Reach insets
   its own for the same reason - at the very edge every offset measured off the
   front lands outside the field, and a line pinned against the boundary has
   nowhere to fall back to, which reads as a bug rather than as a rout. */
var FRONT_INSET = 34;

var _q3 = [[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
/* A planar quad projects to the polygon of its projected corners, so a strip
   needs no subdivision for correctness - only for near plane clipping, which
   is what the segmentation is actually for. */
/* A planar quad projects to the polygon of its projected corners, so a strip
   needs no subdivision for CORRECTNESS. It needs it for NEAR PLANE CLIPPING,
   and that is where the first version was wrong in a way that only showed once
   the camera stood in the street.

   IT TOOK A SEGMENT COUNT, NOT A LENGTH. Thirty-four segments over a fifteen
   hundred metre avenue is a forty-four metre segment, and a segment with ANY
   corner behind the near plane is dropped whole - so standing anywhere in the
   middle of one punched a forty-four metre HOLE in the road clip, centred on
   the camera. The carriageway underneath it drew as whatever the ground pass
   had put there, which on this world is grass. It read as a shading bug and it
   was a tessellation bug.

   Segments are a fixed WORLD LENGTH now, and the strip is walked only over the
   span the camera can actually see. Short segments where it matters, and no
   more of them than the view needs. */
var STRIP_SEG = 9;
function stripPath(g, x0, x1, z0, z1) {
  var any = false, i;
  var alongZ = (z1 - z0) > (x1 - x0);
  // Window the strip to what is in front of the camera, with a little behind
  // so a quad straddling the near plane is still tessellated finely.
  var lo, hi, n, a0, a1;
  if (alongZ) {
    lo = Math.max(z0, cam.z - 60); hi = Math.min(z1, cam.z + 900);
    if (hi <= lo) return false;
    n = Math.min(160, Math.max(2, Math.ceil((hi - lo) / STRIP_SEG)));
    for (i = 0; i < n; i++) {
      a0 = lo + (hi-lo)*(i/n); a1 = lo + (hi-lo)*((i+1)/n);
      if (!project(x0, 0, a0, _q3[0])) continue;
      if (!project(x1, 0, a0, _q3[1])) continue;
      if (!project(x1, 0, a1, _q3[2])) continue;
      if (!project(x0, 0, a1, _q3[3])) continue;
      g.moveTo(_q3[0][0], _q3[0][1]); g.lineTo(_q3[1][0], _q3[1][1]);
      g.lineTo(_q3[2][0], _q3[2][1]); g.lineTo(_q3[3][0], _q3[3][1]);
      g.closePath(); any = true;
    }
  } else {
    lo = Math.max(x0, cam.x - 320); hi = Math.min(x1, cam.x + 320);
    if (hi <= lo) return false;
    n = Math.min(160, Math.max(2, Math.ceil((hi - lo) / STRIP_SEG)));
    for (i = 0; i < n; i++) {
      a0 = lo + (hi-lo)*(i/n); a1 = lo + (hi-lo)*((i+1)/n);
      if (!project(a0, 0, z0, _q3[0])) continue;
      if (!project(a1, 0, z0, _q3[1])) continue;
      if (!project(a1, 0, z1, _q3[2])) continue;
      if (!project(a0, 0, z1, _q3[3])) continue;
      g.moveTo(_q3[0][0], _q3[0][1]); g.lineTo(_q3[1][0], _q3[1][1]);
      g.lineTo(_q3[2][0], _q3[2][1]); g.lineTo(_q3[3][0], _q3[3][1]);
      g.closePath(); any = true;
    }
  }
  return any;
}
function fillStrip(x0, x1, z0, z1, col, seg) {
  ctx.beginPath();
  if (stripPath(ctx, x0, x1, z0, z1, seg)) { ctx.fillStyle = col; ctx.fill(); }
}
function eachCarriageway(fn) {
  for (var i = 0; i < GRID.ax.length; i++)
    fn(GRID.ax[i]-GRID.hw, GRID.ax[i]+GRID.hw, GRID.z0, GRID.z1, 'z');
  for (var j = 0; j < GRID.az.length; j++)
    fn(GRID.x0, GRID.x1, GRID.az[j]-GRID.hw, GRID.az[j]+GRID.hw, 'x');
}
/* ── THE LOTS ARE PART OF THE PAVED SURFACE AND THE CLIP DID NOT KNOW IT ──
   eachPavement walks the STRIPS beside the streets, which is all the clip ever
   needed while the lots were being paved with flat kit tiles. Standing those
   tiles down and drawing only the strips through the band pass left every yard
   between the buildings showing the PLAIN underneath - green grass inside a
   city, which is not a subtle failure. The lot is a paved surface; it goes in
   the same clip as the pavement it runs into. */
function eachPaved(fn) {
  eachPavement(fn);
  for (var i = 0; i < CELLS.length; i++)
    fn(CELLS[i][0]-PAVE, CELLS[i][1]+PAVE, CELLS[i][2]-PAVE, CELLS[i][3]+PAVE);
}
function eachPavement(fn) {
  for (var i = 0; i < GRID.ax.length; i++) {
    fn(GRID.ax[i]-GRID.hw-PAVE, GRID.ax[i]-GRID.hw, GRID.z0, GRID.z1);
    fn(GRID.ax[i]+GRID.hw, GRID.ax[i]+GRID.hw+PAVE, GRID.z0, GRID.z1);
  }
  for (var j = 0; j < GRID.az.length; j++) {
    fn(GRID.x0, GRID.x1, GRID.az[j]-GRID.hw-PAVE, GRID.az[j]-GRID.hw);
    fn(GRID.x0, GRID.x1, GRID.az[j]+GRID.hw, GRID.az[j]+GRID.hw+PAVE);
  }
}
/* ── The clip, built once a frame instead of once a band ──────────────────
   *** MEASURED: 49,357 QUADS PER FRAME ACROSS 1,486 CALLS TO stripPath. ***
   bandPass takes a clip callback and invokes it PER BAND, and these two
   callbacks re-tessellated the entire street network every time: six streets,
   each up to 160 segments, projected from scratch, twenty-five times a frame,
   twice over for the pavement and the carriageway. The clip is IDENTICAL for
   every band - only the rect it is intersected with changes.

   Built ONCE per frame into a flat array of screen coordinates and replayed.
   The projection work drops from ~1,486 tessellations to 12, and what is left
   per band is moveTo/lineTo over numbers that already exist, which is what a
   clip should have cost in the first place.

   PATH2D WHERE IT EXISTS. A browser takes the whole thing as a Path2D and
   clips against it directly, skipping even the replay. node-canvas has no
   Path2D, so the cached replay is the floor and the Path2D is the fast path on
   the surface that actually matters. */
var _clipCache = { key: '', road: null, pave: null, roadP: null, paveP: null };
function tessellate(each) {
  var out = [];
  var rec = {
    moveTo: function (x, y) { out.push(0, x, y); },
    lineTo: function (x, y) { out.push(1, x, y); },
    closePath: function () { out.push(2, 0, 0); },
  };
  each(function (x0, x1, z0, z1) { stripPath(rec, x0, x1, z0, z1); });
  return out;
}
/* *** A Path2D HAS NO beginPath, AND THAT KILLED THE WHOLE RENDERER. ***
   This is called with two different kinds of target: a canvas context, which
   needs beginPath before a fresh path, and a Path2D, which IS a fresh path and
   has no such method. Calling it on the second throws, drawRoad throws, frame
   throws, and the animation loop dies on its FIRST FRAME - black canvas, every
   counter stuck on a dash, and no error anywhere a person would look.

   THE HARNESS COULD NOT SEE IT because node-canvas has no Path2D, so the
   browser branch was never taken. That is the SECOND time a browser-only path
   has shipped green - the first was COLONY_VISUAL, which the harness supplied
   for itself. Both have the same shape: the check and the product disagree
   about the environment. The harness now shims a Path2D so this branch is
   actually exercised. */
function replay(g, ops) {
  if (g.beginPath) g.beginPath();
  for (var i = 0; i < ops.length; i += 3) {
    if (ops[i] === 0) g.moveTo(ops[i+1], ops[i+2]);
    else if (ops[i] === 1) g.lineTo(ops[i+1], ops[i+2]);
    else g.closePath();
  }
}
function buildClips() {
  /* Keyed on the camera, because the projection depends on nothing else. A
     still camera rebuilds nothing at all. */
  var key = cam.x.toFixed(2)+','+cam.y.toFixed(2)+','+cam.z.toFixed(2)+','+
            cam.yaw.toFixed(4)+','+cam.pitch.toFixed(4)+','+W+'x'+H;
  if (_clipCache.key === key) return;
  _clipCache.key = key;
  _clipCache.road = tessellate(eachCarriageway);
  _clipCache.pave = tessellate(eachPaved);
  _clipCache.roadP = _clipCache.paveP = null;
  if (typeof global.Path2D === 'function') {
    _clipCache.roadP = new global.Path2D();
    replay(_clipCache.roadP, _clipCache.road);
    _clipCache.paveP = new global.Path2D();
    replay(_clipCache.paveP, _clipCache.pave);
  }
}
function roadClip(g) {
  if (_clipCache.roadP) { g.clip(_clipCache.roadP); return; }
  replay(g, _clipCache.road); g.clip();
}
function paveClip(g) {
  if (_clipCache.paveP) { g.clip(_clipCache.paveP); return; }
  replay(g, _clipCache.pave); g.clip();
}
function onStreet(x, z, pad) {
  var p = pad || 0, i;
  for (i = 0; i < GRID.ax.length; i++)
    if (Math.abs(x - GRID.ax[i]) < GRID.hw + PAVE + p) return true;
  for (i = 0; i < GRID.az.length; i++)
    if (Math.abs(z - GRID.az[i]) < GRID.hw + PAVE + p) return true;
  return false;
}

/* ── Drawing the surface ──────────────────────────────────────────────────
   Five things, in the order they go down, and every one of them is a quad or
   a band pass on a plane already being drawn:

     verge      a worn strip at the pavement's outer edge. Real ground does not
                change material along a ruled line; it wears through where
                people step off.
     pavement   a walkable WIDTH, textured through the same band pass the
                ground uses so it takes grain rather than sitting next to grain
                as a flat fill.
     joints     expansion lines across it. The cheapest thing that turns a grey
                ribbon into concrete: a slab has edges, a ribbon does not.
     patching   deterministic darker rectangles on the carriageway. Off a fixed
                seed, because a road that re-patches every frame shimmers.
     markings   lane dashes, and stop bars at every intersection.

   ALL OF IT IS DEPTH BOUNDED except the base ground pass. Detail stops where
   detail stops being visible; the plain does not, because the plain IS the
   ground. */
/* ── The ground under the city ────────────────────────────────────────────
   THE CARRIAGEWAY, PAVEMENT, KERBS AND MARKINGS ARE THE KIT'S JOB NOW. What is
   left here is the plain the city stands on and the lots between the buildings
   - a band pass and one quad per cell, neither of which the kit has a piece
   for. Drawing the road twice put a tinted noise pattern under every road tile
   and a painted dash under every real one. */
function drawRoad() {
  /* The lot fill stays a flat quad and stays UNDER the kit tiles. It is the
     yard between the buildings, most of it is covered by them, and paving the
     whole block would be thousands of one-face tiles to render the few metres
     that show between a building and its kerb. The tiles that DO show are laid
     by queueKitStreet; this is what is behind them. */
  var lot = 'rgba(46,50,54,0.86)';
  for (var i = 0; i < CELLS.length; i++)
    fillStrip(CELLS[i][0]-PAVE, CELLS[i][1]+PAVE,
              CELLS[i][2]-PAVE, CELLS[i][3]+PAVE, lot);

  /* ── THE BUG WORLDS' GROUND, AND IT WAS NEVER REMOVED - ONLY ORPHANED ───
     v1.9.9.0 stopped drawing the carriageway and the pavement through the
     band pass and paved them with flat kit tiles instead, because a 512px
     patch at TILE_M 6 covers forty-eight metres and smears when the camera
     stands on it. What it did NOT do is delete anything: pats() still builds
     `asph` and `pave` every time it runs - the same CodeSpree sheets the Reach
     draws, tinted per world through the same tintedPattern - and buildClips,
     tessellate, replay, roadClip, paveClip, eachCarriageway and eachPavement
     have all sat here since with no caller at all. The bug worlds' ground was
     one draw call away the whole time, not a rebuild.

     SO IT IS A DIAL RATHER THAN A DECISION, exactly like roadWear, and for the
     same recorded reason: this question has been settled by opinion, reversed,
     and settled again, and a taste call that keeps flipping belongs behind a
     number where it can be looked at instead of argued about.

       CB.opt.groundTex   0  flat kit tiles - exact, never smears, ~5400 faces
                          1  the Reach's tiled ground, clipped to the street
       CB.opt.texScale       patch size multiplier; 1 is a 48m patch, 0.2 a
                             9.6m one. THIS is the smear dial. Small enough and
                             the magnification stops; too small and the
                             carriageway reads as speckle, which is what the
                             fourteen-metre first attempt did.

     I cannot settle texScale by reasoning and will not pretend otherwise - the
     pats() notes already record one loop of enlarge-to-kill-speckle turning
     speckle into smears. It wants an eye on it. */
  if (CB.opt.groundTex <= 0) return;
  var P = pats();
  if (!P.asph || !P.pave) return;
  buildClips();
  /* ── THE FAR FILL IS THE SURFACE'S OWN COLOUR, NOT THE GROUND'S ────────
     bandPass fills flat past four million square units of band footprint,
     which is most of the frame and every frame - at that distance a tiled
     pattern is sub-pixel noise whose average IS a flat colour. So the flat
     colour has to BE that average, and the first attempt handed it the plain's
     ground/haze mix: the near ten metres came out tarmac and everything beyond
     it came out the colour of the field outside the city. Graded off the kit's
     own baked values instead - Road bakes #585753 and Pavement #332f2c, which
     are the exact colours the flat tiles were painting - so the pass and the
     tiles it replaces agree at every distance. */
  var sc = CB.opt.texScale;
  var kf = KIT_AMBIENT * 0.86;
  var roadFlat = rgba([(0x58*kf)|0, (0x57*kf)|0, (0x53*kf)|0], 1);
  var paveFlat = rgba([(0x33*kf)|0, (0x2f*kf)|0, (0x2c*kf)|0], 1);
  ctx.save();
  ctx.globalAlpha = CB.opt.groundTex;
  bandPass(P.pave, 0, paveClip, sc, paveFlat);
  bandPass(P.asph, 0, roadClip, sc, roadFlat);
  ctx.restore();
}


/* ── The skyline, in the city view's own language ─────────────────────────
   THE FIRST VERSION WAS LINE ART AND THE CITY VIEW IS NOT. city.js draws a
   district as TRANSLUCENT FILLED PRISMS with stroked edges - three face values
   per mass, a lighter roof slab so the silhouette edge reads, band lines up the
   shaft, windows on a GRID, and a mast with a glowing beacon on anything tall.
   A skyline made of hairlines next to that is a different game's UI.

   So this is tower() from city.js, in perspective instead of isometric, with
   the same five decisions:

     three values per mass   right face, left face, roof slab. A box needs the
                             two visible walls to differ or it has no volume.
     setbacks by height      taller means more steps, each narrower - the same
                             h>10 ? 3 : h>5.5 ? 2 : 1 rule, scaled up.
     bands up the shaft      every few floors, at low alpha.
     WINDOWS ON A GRID       not a scatter. This is the load-bearing one: a
                             scatter reads as noise and a grid reads as a
                             building, and it is the single thing that made the
                             old skyline look like a wireframe test.
     roof furniture          mast and beacon over 9, a tank or vent under it.

   FACE COUNT IS THE BUDGET, as it is everywhere else in this renderer. Canvas
   fills one polygon per call, so the near ring gets windows and roof furniture
   and the far rings do not - they are past the point where either resolves. */
var towers = [];
var TOWER_KIND = ['slab', 'step', 'taper', 'twin', 'crown'];
function genTowers(seed) {
  var rnd = mulberry32(seed ^ 0xC17E);
  towers = [];
  var ch = skylineChar();
  //        n   zNear  zFar   hMin hMax spread  lod
  var rings = [[10,  620, 1100,  120, 280, 4.2, 2],
               [13, 1200, 2400,  200, 450, 6.0, 1],
               [9,  2600, 4200,  260, 580, 8.5, 0]];
  for (var r = 0; r < rings.length; r++) {
    var g = rings[r];
    var count = Math.max(2, Math.round(g[0] * ch.dens));
    for (var i = 0; i < count; i++) {
      var t = (i + 0.5) / count;
      /* A CIRCUIT CAPITAL LEANS TO STEPPED AND CROWNED, A FRONTIER COLONY TO
         SLABS. Same five kinds, different weighting - which is the difference
         between a city that was built over centuries and one that was put up
         in a hurry, and it costs a biased index rather than new geometry. */
      /* A BAND INTO TOWER_KIND RATHER THAN A NUDGE. The old bias was two
         cases - taller than average or not - which could not express "slabs
         and steps ONLY" or "every kind, evenly". A foundry draws from the
         bottom of the list and nothing else; a bazaar draws from all of it;
         a finance capital from the top. Same five kinds, no new geometry. */
      var kr = ch.lo + (ch.hi - ch.lo) * rnd();
      var kind = TOWER_KIND[Math.min(TOWER_KIND.length - 1,
                                     (kr * TOWER_KIND.length) | 0)];
      var w = 22 + rnd() * 44;
      towers.push({
        x: (t - 0.5)*FIELD_W*g[5] + (rnd()-0.5)*FIELD_W*0.5,
        z: g[1] + (g[2]-g[1])*rnd(),
        // Footprints stay near square. Past about 2:1 a plan stops reading as
        // a tower and starts reading as a wall seen end on.
        w: w, d: w * (0.72 + rnd()*0.56),
        h: (g[3] + (g[4]-g[3])*rnd()) * ch.tall,
        kind: kind, lod: g[6], seed: (rnd()*1e9)|0,
        dens: 0.24 + rnd()*0.26,
      });
    }
  }
  towers.sort(function (a, b) { return b.z - a.z; });
}

var _q4 = [[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
function quad(ax, ay, az, bx, by, bz, cx2, cy2, cz2, dx2, dy2, dz2) {
  if (!project(ax, ay, az, _q4[0])) return false;
  if (!project(bx, by, bz, _q4[1])) return false;
  if (!project(cx2, cy2, cz2, _q4[2])) return false;
  if (!project(dx2, dy2, dz2, _q4[3])) return false;
  ctx.beginPath();
  ctx.moveTo(_q4[0][0], _q4[0][1]);
  ctx.lineTo(_q4[1][0], _q4[1][1]);
  ctx.lineTo(_q4[2][0], _q4[2][1]);
  ctx.lineTo(_q4[3][0], _q4[3][1]);
  ctx.closePath();
  return true;
}
function tcol(c, a, k) {
  return 'rgba(' + Math.round(c[0]*k) + ',' + Math.round(c[1]*k) + ',' +
         Math.round(c[2]*k) + ',' + a + ')';
}
/* One mass: two visible walls at different values, a lighter roof slab, a
   stroked edge. The same three fills city.js uses, and for the same reason -
   two walls at one value is a flat sticker, not a box. */
function mass(cx, cz, hw0, hd0, hw1, hd1, y0, y1, c, a, at, sa) {
  var facing = cx < cam.x ? 1 : -1;          // which side wall the camera sees
  var ok = false;
  // near wall in x
  if (quad(cx + facing*hw1, y1, cz - hd1, cx + facing*hw1, y1, cz + hd1,
           cx + facing*hw0, y0, cz + hd0, cx + facing*hw0, y0, cz - hd0)) {
    ctx.fillStyle = tcol(c, a, 0.34); ctx.fill(); ok = true;
  }
  // near wall in z, the darker of the two
  if (quad(cx - hw1, y1, cz - hd1, cx + hw1, y1, cz - hd1,
           cx + hw0, y0, cz - hd0, cx - hw0, y0, cz - hd0)) {
    ctx.fillStyle = tcol(c, a, 0.19); ctx.fill(); ok = true;
  }
  // roof slab, lighter so the skyline edge reads against the sky
  if (quad(cx - hw1, y1, cz - hd1, cx + hw1, y1, cz - hd1,
           cx + hw1, y1, cz + hd1, cx - hw1, y1, cz + hd1)) {
    ctx.fillStyle = tcol(c, at, 0.66); ctx.fill();
    ctx.strokeStyle = tcol(c, sa, 1.15); ctx.lineWidth = 1; ctx.stroke();
    ok = true;
  }
  return ok;
}
/* WINDOWS ON A GRID, walked in world metres exactly as city.js walks them in
   plate units. Regular spacing is the whole point: the old scatter is why the
   skyline read as noise with lights in it rather than as offices with people
   still in them. */
function towerWindows(cx, cz, hw, hd, y0, y1, c, rnd, dens) {
  var warm = 'rgba(255,206,77,0.9)', cool = tcol(c, 0.85, 1.35);
  var stepY = Math.max(4.5, (y1-y0)/14), stepX = Math.max(4.0, hw*2/9);
  var p = [0,0,0], wy, wx2;
  for (wx2 = cx - hw + stepX*0.5; wx2 < cx + hw - 0.5; wx2 += stepX) {
    for (wy = y0 + stepY*0.6; wy < y1 - stepY*0.3; wy += stepY) {
      if (rnd() > dens) continue;
      if (!project(wx2, wy, cz - hd, p)) continue;
      ctx.fillStyle = rnd() < 0.32 ? warm : cool;
      ctx.fillRect(p[0]-1, p[1]-1, 2, 2);
    }
  }
  var facing = cx < cam.x ? 1 : -1, stepZ = Math.max(4.0, hd*2/8);
  for (var wz = cz - hd + stepZ*0.5; wz < cz + hd - 0.5; wz += stepZ) {
    for (wy = y0 + stepY*0.6; wy < y1 - stepY*0.3; wy += stepY) {
      if (rnd() > dens*0.7) continue;
      if (!project(cx + facing*hw, wy, wz, p)) continue;
      ctx.fillStyle = rnd() < 0.28 ? warm : cool;
      ctx.fillRect(p[0]-1, p[1]-1, 2, 2);
    }
  }
}
/* ── The glyph skyline ────────────────────────────────────────────────────
   A SECOND SKYLINE STYLE, NOT A REPLACEMENT. The prism style below speaks the
   city view's language and that is worth keeping; this one draws the far city
   as a grid of CHARACTERS instead, which reads as a different kind of distance
   - a readout of a city rather than a picture of one, which is arguably more
   honest about what a battlefield HUD is.

   THE TECHNIQUE IS GENERIC AND THE IMPLEMENTATION IS OURS. Text-mode skylines
   are decades old; nothing here is copied from anyone's art, palette or
   composition, and given that three of the four art packs in this repo already
   cannot legally sit in a public directory, that distinction is worth keeping
   sharp rather than blurring it.

   BAKED ONCE PER TOWER, THEN BILLBOARDED. A tower is twenty columns by forty
   rows, so drawing it live is eight hundred fillText calls per building and
   thirty buildings is twenty-four thousand a frame - which is not a skyline,
   it is a text editor. Each tower is rendered once into its own offscreen
   canvas keyed on its seed, and the frame draws one scaled image. The towers
   are hundreds of metres out, so the parallax a real prism would give across
   the near faces is under a pixel; a billboard loses nothing that could be
   seen and costs one drawImage.

   ASCII RATHER THAN BOX DRAWING, deliberately. Block and box characters are
   the obvious choice and they are the ones a font is most likely not to have:
   a missing glyph renders as a tofu box, which on a skyline is indistinguishable
   from a lit window, so the failure is invisible and wrong. Plain ASCII exists
   in every font that has ever shipped. */
var GLYPH_W = 5, GLYPH_H = 7;
var _glyph = {};
/* Hue per building. The far city is not one faction's property - it is the
   city being fought over, and giving every tower the belligerent's colour says
   the opposite. Low saturation and low value so it stays distance. */
var GLYPH_HUE = [
  [96, 170, 246], [88, 214, 176], [214, 200, 110], [222, 128, 108],
  [166, 138, 232], [110, 206, 214], [200, 150, 200], [140, 196, 130],
];
function glyphSprite(tw) {
  var got = _glyph[tw.seed];
  if (got) return got;
  var rnd = mulberry32(tw.seed ^ 0x6C7F);
  var cols = Math.max(4, Math.min(20, Math.round(tw.w / 3.4)));
  var rows = Math.max(8, Math.min(56, Math.round(tw.h / 5.2)));
  var c = CB.newCanvas(cols * GLYPH_W, rows * GLYPH_H);
  var g = c.getContext('2d');
  g.font = GLYPH_H + 'px monospace';
  g.textBaseline = 'top';
  var hue = GLYPH_HUE[tw.seed % GLYPH_HUE.length];
  var body = 'rgba(' + hue[0] + ',' + hue[1] + ',' + hue[2] + ',0.62)';
  var edge = 'rgba(' + hue[0] + ',' + hue[1] + ',' + hue[2] + ',0.92)';
  var lit  = 'rgba(255,226,150,0.95)';
  var cool = 'rgba(210,238,255,0.9)';
  /* A PROFILE PER COLUMN, so the roofline is a shape rather than a flat cut.
     The column's top row is where that column's mass stops; a taper pulls the
     outer columns down, a step drops them in blocks, a slab leaves them level. */
  var top = new Array(cols);
  for (var x = 0; x < cols; x++) {
    var t = Math.abs((x + 0.5) / cols - 0.5) * 2;      // 0 centre, 1 edge
    var drop;
    if (tw.kind === 'taper')      drop = t * rows * 0.46;
    else if (tw.kind === 'crown') drop = (t > 0.72 ? rows * 0.16 : 0);
    else if (tw.kind === 'twin')  drop = (Math.abs(t) < 0.30 ? rows * 0.44 : 0);
    else if (tw.kind === 'step')  drop = Math.floor(t * 3) * rows * 0.13;
    else                          drop = t > 0.86 ? rows * 0.05 : 0;
    top[x] = Math.min(rows - 2, Math.round(drop + rnd() * 1.4));
  }
  for (x = 0; x < cols; x++) {
    for (var y = top[x]; y < rows; y++) {
      var px = x * GLYPH_W, py = y * GLYPH_H;
      var atTop = (y === top[x]);
      var atEdge = (x === 0 || x === cols - 1 || top[x - 1] > y || top[x + 1] > y);
      if (atTop) {
        g.fillStyle = edge;
        g.fillText(rnd() < 0.3 ? '=' : '-', px, py);
        continue;
      }
      var r = rnd();
      if (r < 0.19) {                       // a lit window
        g.fillStyle = rnd() < 0.34 ? lit : cool;
        g.fillText(rnd() < 0.5 ? '8' : '0', px, py);
      } else if (atEdge) {
        g.fillStyle = edge;
        g.fillText('|', px, py);
      } else {
        g.fillStyle = body;
        g.fillText(r < 0.52 ? '#' : (r < 0.78 ? ':' : '.'), px, py);
      }
    }
  }
  // Mast and beacon, in characters, on anything with the height for one.
  if (rows > 22) {
    var mx = Math.floor(cols / 2) * GLYPH_W;
    g.fillStyle = edge;
    for (var k = 1; k <= 2; k++) g.fillText('|', mx, top[Math.floor(cols/2)] * GLYPH_H - k * GLYPH_H);
    g.fillStyle = 'rgba(255,120,110,0.95)';
    g.fillText('*', mx, top[Math.floor(cols/2)] * GLYPH_H - 3 * GLYPH_H);
  }
  _glyph[tw.seed] = c;
  return c;
}
var _gb = [0,0,0], _gt = [0,0,0];
function drawGlyphTowers() {
  ctx.imageSmoothingEnabled = false;
  for (var n = 0; n < towers.length; n++) {
    var tw = towers[n];
    var fade = clamp(1 - (tw.z - 500)/3000, 0, 1);
    if (fade <= 0.03) continue;
    if (!project(tw.x, 0, tw.z, _gb)) continue;
    if (!project(tw.x, tw.h, tw.z, _gt)) continue;
    var hpx = _gb[1] - _gt[1];
    if (hpx < 12) continue;                 // smaller than a few glyphs: skip
    var sp = glyphSprite(tw);
    var wpx = hpx * (sp.width / sp.height);
    ctx.globalAlpha = clamp(0.30 + fade*0.72, 0, 1);
    ctx.drawImage(sp, _gt[0] - wpx*0.5, _gt[1], wpx, hpx);
  }
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
}

/* ── The far city says who built it ───────────────────────────────────────
   THE SKYLINE WAS THE SAME CITY ON EVERY WORLD, in the belligerent's colour.
   That is two errors in one: the towers are not the army's property - they are
   the city being fought OVER - and a Circuit capital that has held the same
   ledger for eleven generations does not look like a frontier colony that was
   a mining claim thirty years ago.

   Three things vary, all read off tables that already exist:

     colour   the CONTROLLING faction's line colour, not the attacker's,
              because the skyline belongs to whoever holds the ground.
     density  population. A nine-billion capital has a dense core; an outpost
              has a handful of masts on the horizon.
     age      Circuit worlds get taller, more stepped, more crowned towers;
              Coalition frontier colonies get slabs and fewer of them. The
              Circuit built with time and the frontier built with what it had. */
/* ── A SKYLINE PER WORLD, AND WHERE THE LORE ACTUALLY COMES FROM ──────────
   THE SKYLINE WAS THE SAME CITY EVERYWHERE, twice over. The first version was
   one silhouette recoloured by the holder; this one varies density and height
   by POPULATION and by whether the world is Circuit, which is two dials and
   thirty-seven colonies. Nova Reach and Yujing come out the same shape at the
   same population, which is the definition of generic.

   THE SECTOR IS ALREADY THE LORE AND IT IS ALREADY IN THE REPO. Every front
   carries a sectorName - Finance, Iron Foundries, Gray Bazaar, Flesh & Gene,
   Power Cartels, Transit Guild - and ROOF_STYLE and FURNITURE have keyed off
   it since the kit landed, so a foundry world already gets fencing and service
   covers where a bank gets railings and signage. The horizon is the one place
   that never read it. A foundry skyline is stacks and low sheds; a finance
   capital is crowned towers; a bazaar is a jumble of mid-rise with no plan.
   That is thirty-seven worlds distinguished from data that already exists,
   with nothing invented.

   *** AND THE PER-COLONY TABLE IS DELIBERATELY NEARLY EMPTY, WHICH IS NOT ME
   BEING LAZY. *** Jacob is the GM and the author; the lore of a named world is
   his to state, and filling thirty-seven rows here would be me writing canon
   into a renderer where nobody would ever find it again. SKYLINE_WORLD is the
   hook for it. The four rows in it are the ones the repo already asserts
   somewhere else - Flesh Station has no ground, the Circuit built with time,
   the frontier built with what it had - and every other world falls through to
   its sector. Add a row per world as the lore gets written. */
var SKYLINE_SECTOR = {
  // kinds: index bias into TOWER_KIND (slab, step, taper, twin, crown).
  // tall/dens multiply what population already decided. mast lights the tops.
  'Finance':            { lo: 0.35, hi: 1.00, tall: 1.22, dens: 1.00, mast: 1 },
  'Capital Syndicate':  { lo: 0.35, hi: 1.00, tall: 1.22, dens: 1.00, mast: 1 },
  'Insurance':          { lo: 0.20, hi: 0.85, tall: 1.05, dens: 0.92, mast: 1 },
  'Indemnity Brokers':  { lo: 0.20, hi: 0.85, tall: 1.05, dens: 0.92, mast: 1 },
  'Tech':               { lo: 0.40, hi: 0.90, tall: 1.14, dens: 1.06, mast: 1 },
  'Neural Networks':    { lo: 0.40, hi: 0.90, tall: 1.14, dens: 1.06, mast: 1 },
  'Biotech':            { lo: 0.30, hi: 0.78, tall: 0.98, dens: 1.10, mast: 0 },
  'Flesh & Gene':       { lo: 0.30, hi: 0.78, tall: 0.98, dens: 1.10, mast: 0 },
  // A works is WIDE and LOW and there is a lot of it. Slabs and steps only.
  'Manufacturing':      { lo: 0.00, hi: 0.42, tall: 0.68, dens: 1.24, mast: 0 },
  'Industrial':         { lo: 0.00, hi: 0.42, tall: 0.68, dens: 1.24, mast: 0 },
  'Iron Foundries':     { lo: 0.00, hi: 0.34, tall: 0.62, dens: 1.30, mast: 0 },
  'Energy':             { lo: 0.00, hi: 0.50, tall: 0.80, dens: 1.02, mast: 1 },
  'Power Cartels':      { lo: 0.00, hi: 0.50, tall: 0.80, dens: 1.02, mast: 1 },
  'Logistics':          { lo: 0.00, hi: 0.46, tall: 0.72, dens: 1.16, mast: 0 },
  'Transit Guild':      { lo: 0.05, hi: 0.55, tall: 0.78, dens: 1.12, mast: 1 },
  // No plan and no zoning: every kind, evenly, packed tight and short.
  'Gray Bazaar':        { lo: 0.00, hi: 1.00, tall: 0.74, dens: 1.34, mast: 0 },
  'Agriculture':        { lo: 0.00, hi: 0.38, tall: 0.52, dens: 0.58, mast: 0 },
  'Defense':            { lo: 0.10, hi: 0.62, tall: 0.86, dens: 0.94, mast: 1 },
  _:                    { lo: 0.10, hi: 0.80, tall: 1.00, dens: 1.00, mast: 0 },
};
/* GM TERRITORY. One row per world as its lore gets written; these four are the
   ones already asserted elsewhere in the repo rather than invented here. */
var SKYLINE_WORLD = {
  // The Circuit built with time. Stepped, crowned, and lit to the top.
  yujing:        { lo: 0.55, hi: 1.00, tall: 1.34, dens: 1.06, mast: 1 },
  // A frontier colony put up in a hurry: slabs, and not many of them.
  frontier_outpost: { lo: 0.00, hi: 0.30, tall: 0.60, dens: 0.52, mast: 0 },
  // The Hollow is a rift world. What stands is what the rift left standing.
  the_hollow:    { lo: 0.00, hi: 1.00, tall: 0.66, dens: 0.80, mast: 0 },
  // Mr Flesh's own. Nothing here was built to a plan and everything is tall.
  flesh_station: { lo: 0.45, hi: 1.00, tall: 1.50, dens: 1.20, mast: 1 },
};
function skylineChar() {
  var m = MAP;
  if (!m) return { dens: 1, tall: 1, hue: null };
  var PUB = global.FM_CITY_FRONTS || {};
  var META = global._FM_COLONY_META || PUB.meta || {};
  var col = META[m.colonyId] || {};
  // pop ships as a string like '9.2B' or '340M'. Parsed, not guessed at.
  var p = String(col.pop || '1M');
  var n = parseFloat(p) || 1;
  if (/B/i.test(p)) n *= 1000;
  else if (/K/i.test(p)) n /= 1000;
  var dens = clamp(0.35 + Math.log(1 + n) / 8.2, 0.35, 1.25);
  /* Population and allegiance still set the BASE - a Circuit capital of nine
     billion is taller and denser than a frontier post of three hundred million
     whatever either of them does for a living - and the sector then says what
     SHAPE that mass takes. Two terms rather than one, and the second is the
     one that stops two worlds of the same size being the same city. */
  var row = SKYLINE_WORLD[m.colonyId] ||
            SKYLINE_SECTOR[m.sector] || SKYLINE_SECTOR._;
  return { dens: dens * row.dens,
           tall: (m.jade ? 1.25 : 0.88) * row.tall,
           lo: row.lo, hi: row.hi, mast: row.mast, hue: null };
}

function drawTowers(col) {
  if (!CB.opt.skyline) return;
  if (CB.opt.skylineStyle === 'model') {
    out_sky.length = 0;
    drawModelSkyline(col);
    out_sky.sort(function (a, b) { return b.z - a.z; });
    for (var q = 0; q < out_sky.length; q++) paintFace(out_sky[q]);
    return;
  }
  if (CB.opt.skylineStyle === 'glyph') return drawGlyphTowers();
  var p0 = [0,0,0], p1 = [0,0,0];
  for (var n = 0; n < towers.length; n++) {
    var tw = towers[n], rnd = mulberry32(tw.seed);
    var fade = clamp(1 - (tw.z - 500)/3000, 0, 1);
    if (fade <= 0.02) continue;
    /* Alpha carries the distance, exactly as the haze does for the ground. The
       far ring is nearly transparent and that is the fog, not a style. */
    var a = 0.34*fade, at = 0.46*fade, sa = 0.55*fade;
    var cx = tw.x, cz = tw.z, hw = tw.w*0.5, hd = tw.d*0.5, i;

    var segs = [];                       // [y0, y1, hw0, hd0, hw1, hd1]
    if (tw.kind === 'step' || tw.kind === 'slab') {
      // The city view's own rule, scaled: taller means more steps.
      var steps = tw.kind === 'slab' ? 1 : (tw.h > 260 ? 3 : tw.h > 170 ? 2 : 1);
      var z0 = 0;
      for (var s2 = 0; s2 < steps; s2++) {
        var f = s2*(0.13 + rnd()*0.06);
        var top = tw.h*((s2+1)/steps)*(s2 === steps-1 ? 1 : 0.94 + rnd()*0.10);
        segs.push([z0, top, hw*(1-f), hd*(1-f), hw*(1-f), hd*(1-f)]);
        z0 = top;
      }
    } else if (tw.kind === 'taper') {
      for (i = 0; i < 4; i++) {
        var k0 = i/4, k1 = (i+1)/4, s0 = 1 - k0*0.60, s1 = 1 - k1*0.60;
        segs.push([tw.h*k0, tw.h*k1, hw*s0, hd*s0, hw*s1, hd*s1]);
      }
    } else if (tw.kind === 'crown') {
      segs.push([0, tw.h*0.88, hw, hd, hw*0.92, hd*0.92]);
      segs.push([tw.h*0.88, tw.h, hw*1.13, hd*1.13, hw*1.02, hd*1.02]);
    } else {                                   // twin: podium plus two shafts
      var pod = tw.h*0.20;
      segs.push([0, pod, hw, hd, hw, hd]);
      var gap = hw*0.50, shw = hw*0.40, shd = hd*0.70;
      segs.push([pod, tw.h,             -gap, shw, shd, 0]);   // marked below
      segs.push([pod, tw.h*(0.76 + rnd()*0.18), gap, shw, shd, 0]);
    }

    for (var g2 = 0; g2 < segs.length; g2++) {
      var sg = segs[g2];
      if (tw.kind === 'twin' && g2 > 0) {
        // [y0, y1, xOffset, hw, hd, _]
        if (!mass(cx + sg[2], cz, sg[3], sg[4], sg[3]*0.94, sg[4]*0.94,
                  sg[0], sg[1], col, a, at, sa)) continue;
        if (tw.lod >= 2) towerWindows(cx + sg[2], cz, sg[3], sg[4], sg[0], sg[1],
                                      col, rnd, tw.dens);
        continue;
      }
      if (!mass(cx, cz, sg[2], sg[3], sg[4], sg[5], sg[0], sg[1],
                col, a, at, sa)) continue;
      // Band lines up the shaft. Cheap, and they are what give a mass scale.
      var span = sg[1]-sg[0], stepB = Math.max(9, span/12);
      ctx.strokeStyle = tcol(col, 0.20*fade, 1);
      ctx.lineWidth = 1;
      ctx.beginPath();
      var any = false;
      for (var y = sg[0]+stepB; y < sg[1]-0.5; y += stepB) {
        var k2 = (y-sg[0])/span;
        var bw = sg[2]+(sg[4]-sg[2])*k2, bd = sg[3]+(sg[5]-sg[3])*k2;
        var fc = cx < cam.x ? 1 : -1;
        if (project(cx - bw, y, cz - bd, p0) && project(cx + bw, y, cz - bd, p1)) {
          ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); any = true;
        }
        if (project(cx + fc*bw, y, cz - bd, p0) && project(cx + fc*bw, y, cz + bd, p1)) {
          ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); any = true;
        }
      }
      if (any) ctx.stroke();
      if (tw.lod >= 2 && span > 12)
        towerWindows(cx, cz, sg[4], sg[5], sg[0], sg[1], col, rnd, tw.dens);
    }

    // ── roof furniture, near ring only ───────────────────────────────────
    if (!tw.lod) continue;
    var roofY = tw.kind === 'twin' ? tw.h : segs[segs.length-1][1];
    if (tw.kind === 'twin' || rnd() < 0.62) {
      var mh = roofY + 10 + rnd()*22;
      ctx.strokeStyle = tcol(col, 0.75*fade, 1.3); ctx.lineWidth = 1;
      if (project(cx, roofY, cz, p0) && project(cx, mh, cz, p1)) {
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
        // The beacon, glowed. city.js glows it and it is the one warm point on
        // a cold skyline, so it is worth the shadow blur.
        ctx.save();
        ctx.shadowColor = 'rgba(255,120,110,0.9)'; ctx.shadowBlur = 7;
        ctx.fillStyle = 'rgba(255,150,140,' + (0.95*fade) + ')';
        ctx.beginPath(); ctx.arc(p1[0], p1[1], 1.7, 0, 6.284); ctx.fill();
        ctx.restore();
      }
    } else {
      // A tank or a vent: a small mass off centre, exactly as the short
      // buildings in the city view carry one.
      var tw2 = hw*0.28, td = hd*0.28;
      var tx = cx + (rnd()-0.5)*hw, tz = cz + (rnd()-0.5)*hd;
      mass(tx, tz, tw2, td, tw2, td, roofY, roofY + 6 + rnd()*5, col, a*1.1, at, sa*0.8);
    }
  }
}
/* ── The facade pipeline is retired, and this is the note it leaves ───────
   ~450 LINES DELETED HERE: the papptimus atlas loader, the night bake, the
   composed-cell sheets, the affine texQuad and the roof mapper. All of it
   worked, none of it could ever be correct, and the reason is one sentence:
   CANVAS 2D DRAWS AN IMAGE THROUGH AN AFFINE TRANSFORM AND A RECTANGLE IN
   PERSPECTIVE IS A PROJECTIVE MAP. Subdivision shrinks that error and never
   removes it; the bowing and the hairline seams WERE the residue.

   The kit replaces it with geometry whose faces each carry one baked colour,
   which canvas fills exactly at any angle. The lesson is not "textures are
   bad" - it is that a renderer's asset class is a consequence of what the
   renderer can actually do, and this one was chosen before that was checked.
   client/assets/space/city/KIT_ATTRIBUTION.txt records what replaced it. */

/* ── The modular kit ──────────────────────────────────────────────────────
   BUILDINGS ARE ASSEMBLED FROM SQUARES NOW, WHICH IS WHAT THEY SHOULD ALWAYS
   HAVE BEEN. Every wall, window, door and roof piece in Voloshka's kit is the
   same 200-unit tile, and every face of every piece carries ONE baked palette
   colour - so a wall is a flat-filled polygon, which canvas 2D draws exactly,
   instead of a texture-mapped quad, which it cannot draw at all without
   bowing. The whole facade pipeline is retired with this.

   FACE COST IS THE ENTIRE BUDGET AND THE PIECES ARE WILDLY UNEQUAL. Measured
   from the bake: a wall is ONE face, a window is TWENTY-TWO, a door sixteen, a
   roof centre one. A three storey elevation four bays wide is twelve modules -
   twelve faces if they are walls and 264 if they are windows. So windows are
   spent on a BUDGET, nearest building first, and everything past it wears
   plain wall. A wall and a window are the same silhouette at distance; what
   you lose is the thing you could not see anyway. */
/* ── The far city, as real buildings ──────────────────────────────────────
   THE GLYPH SKYLINE WAS A GRID OF CHARACTERS AND THE PRISM ONE WAS A BOX, and
   both were standing in for something the game did not have: actual towers.
   The modern city pack has thirteen, and once its Lcl Scaling is applied they
   come out with real proportions - building_12 is 30 by 90 by 30 units, which
   is a tower, and it costs FOUR HUNDRED AND TWENTY FACES.

   That last number is the whole reason this is affordable. The pack's
   buildings range from 420 to 4,400 faces and the cheap ones are the TALL
   ones, because a plain tower is a few extruded boxes while a detailed
   low-rise is a hundred window mullions. A skyline wants the tall cheap ones,
   which is the opposite of what a street wants, so the two draw from
   different ends of the same pack. */
var MODERN = null, _modPend = 0;
function loadModern() {
  if (MODERN || _modPend) return MODERN;
  _modPend = 1;
  var src = global.CB_MODERN_SRC || (ASSETS + 'city/modern.json' + bust());
  if (typeof src === 'object') { MODERN = src; return MODERN; }
  global.fetch(src).then(function (r) { return r.json(); })
        .then(function (j) { MODERN = j; })
        .catch(function () { _modPend = 2; });
  return null;
}
/* The cheap tall ones, with the face cost that earns them the place. */
var SKY_MESH = ['building_12', 'building_13', 'building_3', 'building_4',
                'building_9', 'building_6', 'building_11'];
var MODERN_S = 0.02;
var SKY_AMBIENT = 0.30;
function drawModelSkyline(col) {
  if (!MODERN) return;
  var i, p = [0,0,0];
  for (i = 0; i < towers.length; i++) {
    var tw = towers[i];
    /* PUSHED OUT AND FADED HARD. The ring distances were tuned for glyph
       SPRITES, which are flat and read as far away whatever their size. Real
       geometry does not: a 280m tower at 620m subtends a huge angle and reads
       as a building at the end of the street rather than as a skyline. The
       rings start where the city stops and the haze does most of the work. */
    var fade = clamp(1 - (tw.z - 1400)/2800, 0, 1);
    /* The near ring is SKIPPED entirely. It was authored at 620-1100m for flat
       sprites; a real 280m tower that close is a building at the end of the
       street, not a skyline, and no amount of haze fixes a silhouette that
       large. The skyline starts where the city ends. */
    if (fade <= 0.05 || tw.z < 1400) continue;
    var name = SKY_MESH[tw.seed % SKY_MESH.length];
    var m = MODERN[name];
    if (!m) continue;
    if (!project(tw.x, 0, tw.z, p)) continue;
    /* Scaled so the piece reaches the height genTowers already decided, which
       keeps the ring structure - near ring shorter, far ring taller - and
       means the skyline still answers to the colony's population. */
    var v = m.v, hUnits = 1;
    for (var q = 1; q < v.length; q += 3) if (v[q] > hUnits) hUnits = v[q];
    var sc = (tw.h / (hUnits * MODERN_S)) * MODERN_S;
    pushModern(m, tw.x, tw.z, sc, tw.seed, col, fade);
  }
}
var _mv2 = [0,0,0];
function pushModern(m, X, Z, sc, seed, col, fade) {
  var rot = (seed % 4) * 1.5708;
  var ca = Math.cos(rot), sa = Math.sin(rot);
  var V = m.v, F = m.f, N = m.n, C = m.c;
  /* Tinted toward the holder's line colour and washed into the haze, which is
     what made the glyph towers read as DISTANCE rather than as objects sitting
     on the ground in front of you. */
  /* Squared, so the wash comes on early and the far ring is nearly pure haze.
     A linear fade leaves distant towers legible as objects, and legible is the
     opposite of distant. */
  var hz = 1 - fade*fade;
  for (var i = 0; i < F.length; i++) {
    var face = F[i];
    var nx0 = N[i*3], ny0 = N[i*3+1], nz0 = N[i*3+2];
    var nx = nx0*ca - nz0*sa, nz = nx0*sa + nz0*ca;
    var v0 = face[0]*3;
    var wx0 = X + (V[v0]*ca - V[v0+2]*sa)*sc;
    var wy0 = V[v0+1]*sc;
    var wz0 = Z + (V[v0]*sa + V[v0+2]*ca)*sc;
    if (nx*(wx0-cam.x) + ny0*(wy0-cam.y) + nz*(wz0-cam.z) > 0) continue;
    var pts = [], ok = true, zs = 0;
    for (var k = 0; k < face.length; k++) {
      var vi = face[k]*3;
      if (!project(X + (V[vi]*ca - V[vi+2]*sa)*sc, V[vi+1]*sc,
                   Z + (V[vi]*sa + V[vi+2]*ca)*sc, _mv2)) { ok = false; break; }
      pts.push(_mv2[0], _mv2[1]); zs += _mv2[2];
    }
    if (!ok) continue;
    var c = C[i];
    /* THE PACK'S MATERIALS ARE DAYLIGHT: plain 0.8 grey and a saturated blue
       glass, straight out of a lit viewport. Dropped to a night value the same
       way the kit's palette is, or the far city glows brighter than the street
       in front of it - which is what the first attempt did. */
    var lit = SKY_AMBIENT * (0.26 + 0.74*Math.max(0, nx*SUN[0] + ny0*0.42 + nz*SUN[2]));
    var r = ((c>>16)&255)*lit, g = ((c>>8)&255)*lit, b = (c&255)*lit;
    r = r*(1-hz) + PAL.haze[0]*hz;
    g = g*(1-hz) + PAL.haze[1]*hz;
    b = b*(1-hz) + PAL.haze[2]*hz;
    out_sky.push({ z: zs/face.length, kind: 'face',
                   col: (Math.min(255,r|0)<<16)|(Math.min(255,g|0)<<8)|Math.min(255,b|0),
                   emi: 0, lit: 1, p: pts });
  }
  void col;
}
var out_sky = [];

var KIT = null, _kitPend = 0;
function loadKit() {
  if (KIT || _kitPend) return KIT;
  _kitPend = 1;
  var src = global.CB_KIT_SRC || (ASSETS + 'city/kit.json' + bust());
  if (typeof src === 'object') { KIT = src; return KIT; }
  global.fetch(src).then(function (r) { return r.json(); })
        .then(function (j) { KIT = j; })
        .catch(function () {
          _kitPend = 2;
          CB.warn = 'city kit not found - buildings will be plain blocks';
        });
  return null;
}
/* The kit's ten coordinated colourways. A building picks one and every piece
   on it matches, which is what the pack is built for and is why a block reads
   as buildings rather than as a pile of parts. */
var KIT_PAL = ['Black', 'DarkCharcoal', 'DarkGrey', 'DarkUmber', 'DeepNavy',
               'EspressoBrown', 'Khaki', 'MidnightBlue', 'Slate', 'SteelBlue'];
var KIT_S = 0.02;                  // 200 kit units = one 4 m module
var MOD_M = 200 * KIT_S;
/* MEASURED RATHER THAN PICKED. A window is 22 faces and only two of them are
   the glass, so the budget buys far fewer LIT PANES than its size suggests: at
   2600 the whole street produced twenty-nine emissive faces and read as an
   unlit city with window frames drawn on it. The budget is the thing that
   decides how far back a building still has windows, and mid-distance
   buildings are most of the frame. */
/* RAISED, BECAUSE THE FRAME COST STOPPED BEING THE CONSTRAINT. It is spent
   nearest-first on visible elevations only, so raising it extends the detail
   outward rather than piling it on the front row. */
/* *** AND IT IS NOT THE LEVER THIS COMMENT USED TO CLAIM IT WAS. *** The line
   above said "the single biggest lever on how detailed the city looks", which
   was reasoning rather than measurement. Measured through the harness at a
   150m radius: 16000, 32000 and 64000 all render 28144 faces. It is not the
   binding constraint and has not been for a while - `allow`, the per-building
   floor of visMods*26, covers roughly one window per visible module already,
   so the budget is never exhausted and raising it buys literally nothing.

   THE REAL LEVER IS viewRadius, because the thing actually limiting detail is
   how much of the city is drawn at all: 150m is 28144 faces, 220m is 40803,
   300m is 56108. Detail here is bought by drawing more city, not by spending
   more on the part already drawn - and that trade runs through the fog, which
   is why it is a decision about what the scene IS rather than a number. */
/* ── The ground floor is not another storey ───────────────────────────────
   EVERY MODULE ON A FACADE WAS DRAWN FROM THE SAME POOL, so a building's
   ground floor was a row of office windows with a door punched in the middle
   of it. That is what an elevation looks like from four hundred metres up and
   it is not what a street looks like from a pavement, which is where this
   camera actually stands. A ground floor is glazed differently from the eight
   storeys above it in every city that has ever existed.

   *** THIS IS WHAT Window2 IS FOR, AND IT IS THE PIECE THE POOLS DELIBERATELY
   EXCLUDE. *** At 146 faces it is worth eight cheap windows, and the note on
   WIN_RICH rules it out on the grounds that "this scene has no camera close
   enough for one to pay". That was true of the piece as an UPPER storey
   window, where it is one cell in a grid of forty. It is not true of a
   shopfront: nine of its faces are emissive, it is the widest glazing in the
   pack, and at street level it is the thing directly in front of you.

   IT GETS ITS OWN BUDGET RATHER THAN A SHARE OF THE WINDOW ONE. Spending it
   out of KIT_WINDOW_BUDGET would let two near buildings' ground floors starve
   every upper storey in the frame, which trades a detail you can see for a
   detail you can also see. Separate budget, spent nearest-first because the
   building list is already distance-sorted, so it lands on the two or three
   buildings the camera is standing among and stops.

   FIVE IN EIGHT LIT rather than the facade's three, because a shop at night is
   lit or it is shuttered - there is no half-occupied office floor version of
   it - and a lit ground floor is what makes a street read as somewhere people
   go rather than as a canyon of stock. */
/* RANGE FIRST, BUDGET SECOND, for the same reason the window pools moved off
   rank: spent purely nearest-first, a shopfront row switched on and off as the
   queue reshuffled around it, and a ground floor blinking between glazing and
   plain wall is the single most visible version of this fault - it is the part
   of the building at eye level. Forty metres is about where Window2's mullions
   stop resolving, so past it the 146 faces buy nothing anyway. */
var SHOP_RANGE = 40;               // metres: past this a shopfront is a smear
var SHOP_BUDGET = 3000;            // faces spent on shopfront glazing per frame
var KIT_WINDOW_BUDGET = 16000;     // faces spent on windows per frame
var KIT_AMBIENT = 0.78;            // daylight palette, graded to dusk

/* Per-instance colour jitter. THE KIT'S ROAD IS ONE FLAT COLOUR PER TILE and a
   carriageway of identical tiles is a featureless slab at eye level - which is
   what the near road looked like. Jittering each tile a few percent off the
   palette gives the surface variation without new art, without a texture and
   without an alignment problem, because the variation IS the tile. */
function tintCol(c, k) {
  var r = Math.min(255, (((c >> 16) & 255) * k) | 0);
  var g = Math.min(255, (((c >> 8) & 255) * k) | 0);
  var b = Math.min(255, ((c & 255) * k) | 0);
  return (r << 16) | (g << 8) | b;
}
/* A hash of the tile's own position, so a tile is the same shade every frame
   and neighbouring tiles disagree. A per-frame roll would make the road boil. */
/* ── Road wear is a dial, not a decision I keep re-making ─────────────────
   THIS HAS MOVED THREE TIMES NOW - flat, then jittered because the near road
   read as a featureless slab, then wider still, and now asked to be flat
   again. That is a taste call rather than a correctness one, and a taste call
   that keeps flipping belongs behind a number rather than in the source.

   CB.opt.roadWear scales BOTH terms from a single value:
     0     every tile the palette colour exactly - a poured, uniform surface
     0.35  a hint of variation, visible up close and invisible at range
     1     the full spread, with repair patches cut into it

   At zero the patch pass does not run at all, so flat is also the cheapest
   setting - one face per tile and nothing else. */
function tileJitter(x, z) {
  var w = CB.opt.roadWear;
  if (w <= 0) return 1;
  var h = hashStr(((x*7.31)|0) + ':' + ((z*7.31)|0));
  var spread = ((h >>> 9) & 255) / 255 - 0.5;      // -0.5 .. +0.5
  return 1 + spread * 0.62 * w;
}
/* A repair patch. Real tarmac is not one age - it is the original surface with
   repairs cut into it - but it is the first thing to go when a uniform road is
   wanted, so it is gated on the same dial and rarer as the dial comes down. */
function tilePatch(x, z) {
  var w = CB.opt.roadWear;
  if (w < 0.5) return false;
  return (hashStr(((x*3.7)|0) + '#' + ((z*3.7)|0)) >>> 5) % 7 === 0;
}

var _kv = [0,0,0];
/* One kit mesh, placed and rotated about Y, pushed into the sorted queue with
   its baked colours. Same shape as pushMeshAt for the nature pack - the only
   difference is that the colour comes from the mesh instead of the palette
   ramp, because these faces already know what they are. */
/* ── Not every piece in this pack is authored at the module scale ─────────
   MEASURED, PIECE BY PIECE, AT THE 200-UNIT MODULE SCALE: a lamp comes out
   5.8m, a bin 1.3m, a road sign 4.9m, a fence 2.0m - all correct. A TREE COMES
   OUT AT 32 METRES. A rooftop barrel comes out at 5.6m and the big one at 8.5m,
   which is a barrel the size of a house. A flight of steps comes out 6m tall.

   So the kit is modular at module scale and its SET PIECES are not, and
   dropping them in at KIT_S gives a street lined with trees taller than the
   buildings - which is exactly what the first attempt produced. The scale is a
   property of the piece, measured once and recorded, rather than a global
   anyone can be surprised by. */
var PROP_SCALE = {
  Tree1: 0.30, Tree2: 0.32, Tree3: 0.30,      // ~9m, a street tree
  RoofBarrel: 0.22, RoofBarrelBig: 0.20,      // ~1.2m and ~1.7m, oil drums
  Steps1: 0.22, Steps2: 0.22, Steps3: 0.22,   // ~1.3m, a stoop and not a storey
};
function pushKit(name, X, Y, Z, rot, out, tint, flipCull) {
  var m = KIT && KIT[name];
  if (!m) return 0;
  var ca = Math.cos(rot), sa = Math.sin(rot);
  var KS = KIT_S * (PROP_SCALE[name] || 1);
  var V = m.v, F = m.f, N = m.n, C = m.c, E = m.e, n = 0;
  for (var i = 0; i < F.length; i++) {
    var face = F[i];
    var nx0 = N[i*3], ny0 = N[i*3+1], nz0 = N[i*3+2];
    var nx = nx0*ca - nz0*sa, nz = nx0*sa + nz0*ca;
    var v0 = face[0]*3;
    var wx0 = X + (V[v0]*ca - V[v0+2]*sa)*KS;
    var wy0 = Y + V[v0+1]*KS;
    var wz0 = Z + (V[v0]*sa + V[v0+2]*ca)*KS;
    var facing = nx*(wx0-cam.x) + ny0*(wy0-cam.y) + nz*(wz0-cam.z);
    if (flipCull ? facing < 0 : facing > 0) continue;
    var pts = [], ok = true, zsum = 0;
    for (var k = 0; k < face.length; k++) {
      var vi = face[k]*3;
      if (!project(X + (V[vi]*ca - V[vi+2]*sa)*KS,
                   Y + V[vi+1]*KS,
                   Z + (V[vi]*sa + V[vi+2]*ca)*KS, _kv)) { ok = false; break; }
      pts.push(_kv[0], _kv[1]);
      zsum += _kv[2];
    }
    if (!ok) continue;
    /* ── SORTED ON THE CENTROID, NOT THE NEAREST CORNER ───────────────────
       The painter's sort used each face's MINIMUM depth, and a long wall seen
       obliquely has one corner very close to the camera and the rest far away
       - so it sorted as if the whole wall were at its nearest point and popped
       in front of things it is actually behind. It shows as flicker on an
       orbiting camera, which is exactly where it was reported. The centroid is
       the same cost and is what the face is actually AT. It is still an
       approximation - painter sorting cannot resolve interpenetrating or
       cyclically overlapping polygons at all - but it removes the case that
       was firing on every long wall. */
    var lit = Math.max(0, nx*SUN[0] + ny0*0.42 + nz*SUN[2]);
    out.push({ z: zsum / face.length, kind: 'face',
               col: tint ? tintCol(C[i], tint) : C[i], emi: E[i],
               lit: lit, p: pts });
    n++;
  }
  return n;
}

/* A building, as modules. Four elevations of wall/window/door and a flat roof.
   The door goes on the elevation that FACES THE STREET and only on the ground
   storey, which is the whole reason the atlas mapping was wrong before. */
var kitB = [];
function kitBuilding(bx, bz, bw, bd, bh, seed) {
  var pool = (MAP && MAP.palette) || KIT_PAL;
  kitB.push({ x: bx, z: bz, w: bw, d: bd, h: bh, seed: seed,
              pal: pool[Math.abs(seed) % pool.length] });
}
/* ── The street, laid from the kit ────────────────────────────────────────
   THE ROAD WAS A TINTED NOISE PATTERN AND THE LAMPS WERE GREY BOXES, which is
   what you build when the only tools are a band pass and a prism. The kit
   ships the actual pieces - Road, Pavement, PavementCurb, Crossing,
   DashedLine, SolidLine, Lamp1, Lamp2 - all on the same 200-unit module as the
   buildings, so the street and the blocks line up by construction rather than
   by two sets of numbers being kept in agreement.

   TILED ONLY WHERE IT IS SEEN. A road tile is one face and a pavement tile is
   one, which is cheap per tile and ruinous over a field: 400 metres square at
   four metres a tile is ten thousand of them. So the tiling runs over the view
   radius rather than the map, which is the same rule the props and flora
   already follow and the same reason the fog exists.

   THE LAMPS ARE THE EXPENSIVE PIECE AND ARE TREATED AS ONE. Lamp1 is 142 faces
   - as much as five buildings' worth of walls - so they are spaced along the
   avenues, culled to the radius, and capped. A lamp you cannot see is a lamp
   worth 142 faces of nothing. */
/* ── Window kinds cost between 18 and 146 faces ───────────────────────────
   MEASURED, AND IT IS AN EIGHT-FOLD SPREAD. Window10 is 18 faces and Window2
   is 146. The picker chose uniformly across all ten, so roughly one window in
   ten cost as much as EIGHT of the cheap ones - which is what emptied the
   budget partway down the sorted list and left every building past that point
   with blank walls. From the orbit camera, where twenty buildings are in
   range instead of fourteen, the cliff lands in the middle of the frame.

   Split by cost and spent by rank: the nearest buildings can afford the
   detailed frames, everything further takes a cheap one, and the difference is
   invisible at the range where it applies. */
/* *** Window2 IS NOT IN EITHER POOL. *** At 146 faces it is worth eight cheap
   windows, and a building's whole allowance buys four of them - which is how
   the NEAREST building in the orbit shot ended up the blankest one in the
   frame. A window that expensive can only ever be a centrepiece, and this
   scene has no camera close enough for one to pay. The rest of the spread is
   mild enough to spend: 34, 28, 22 for the near ranks and 18 to 22 beyond. */
/* Roof family per sector. All three exist in all ten colourways. */
var ROOF_STYLE = {
  'Finance': [2, 2, 1], 'Capital Syndicate': [2, 2, 1],
  'Insurance': [2, 1, 3], 'Indemnity Brokers': [2, 1, 3],
  'Tech': [1, 2, 1], 'Neural Networks': [1, 2, 1],
  'Biotech': [1, 3, 1], 'Flesh & Gene': [1, 3, 1],
  'Manufacturing': [1, 1, 2], 'Industrial': [1, 1, 2], 'Iron Foundries': [1, 1, 1],
  'Energy': [1, 1, 2], 'Power Cartels': [1, 1, 2],
  'Logistics': [1, 1, 3], 'Transit Guild': [1, 3, 1],
  'Gray Bazaar': [3, 3, 1, 2], 'Agriculture': [3, 1, 3], 'Defense': [1, 1, 2],
  _: [1, 3, 2],
};
var RICH_RANGE = 62;                   // metres: where the two pools diverge
var WIN_RICH  = [7, 5, 1];             // 34, 28, 22 faces
var WIN_CHEAP = [10, 8, 9, 1];         // 18, 20, 20, 22 faces
var LAMP_SPACING = 22, LAMP_MAX = 30, FURN_MAX = 46, TREE_MAX = 7;
/* The paving family, by name, because the guard has to be a property of the
   PIECE and not of the loop that happens to be placing it. Road, Crossing,
   DashedLine, SolidLine and Sewerage all belong on a carriageway and are
   deliberately absent from this list. */
/* *** ONLY Pavement NOW, AND DROPPING THE OTHERS IS THE POINT RATHER THAN A
   RELAXATION. *** This guard was written when the kerb was believed to sit
   BESIDE the carriageway, so "its centre is on the road" meant it was misplaced
   and had to go. The kerb STRADDLES: half of it is road by design and its
   centre sits exactly on the kerb line. Testing that centre against
   |x - ax| < hw is then a coin flip on floating point - 5.799999 < 5.8 is true
   - and it deleted most of the kerbs on terraced and spine, leaving sixty
   metre holes where the walkway should be. Measured: 542 kerbs down to 198 on
   terraced, and a 57.5m bare run.

   PavementCornerBig straddles its corner for the same reason and goes with it.
   What keeps kerbs and mitres out of a junction is the jz/jx gate, which tests
   the JUNCTION rather than the carriageway and is the right test for it.
   Pavement is the only piece here that is pure walkway and must never be laid
   over a road. */
var NEVER_ON_ROAD = { Pavement: 1 };
/* The two pieces that are pure surface and nothing else - one face, no
   profile, no silhouette. These are the only ones a tiled ground can replace
   without losing something. */
var SURFACE_ONLY = { Road: 1, Pavement: 1 };
/* What a district leaves on its pavement. `rate` is how often a slot is taken,
   which is as much a character statement as the pieces are - a bazaar's verge
   is crowded and an agricultural zone's is nearly bare. */
var FURNITURE = {
  'Finance':           { rate: 0.30, pool: ['Fence', 'FenceSmall', 'RoadSign', 'Bin'] },
  'Capital Syndicate': { rate: 0.30, pool: ['Fence', 'FenceSmall', 'RoadSign', 'Bin'] },
  'Insurance':         { rate: 0.26, pool: ['Fence', 'RoadSign', 'Bin', 'Steps1'] },
  'Tech':              { rate: 0.24, pool: ['FenceSmall', 'RoadSign', 'Sewerage', 'Bin'] },
  'Neural Networks':   { rate: 0.24, pool: ['FenceSmall', 'RoadSign', 'Sewerage'] },
  'Biotech':           { rate: 0.22, pool: ['Fence', 'Sewerage', 'Bin', 'Steps2'] },
  'Flesh & Gene':      { rate: 0.22, pool: ['Fence', 'Sewerage', 'Bin'] },
  'Manufacturing':     { rate: 0.34, pool: ['Fence', 'FenceCorner', 'Sewerage', 'BigRoadSign'] },
  'Industrial':        { rate: 0.34, pool: ['Fence', 'FenceCorner', 'Sewerage', 'BigRoadSign'] },
  'Iron Foundries':    { rate: 0.38, pool: ['Fence', 'FenceCorner', 'Sewerage'] },
  'Energy':            { rate: 0.30, pool: ['Fence', 'FenceCorner', 'Sewerage', 'BigRoadSign'] },
  'Power Cartels':     { rate: 0.30, pool: ['Fence', 'FenceCorner', 'Sewerage'] },
  'Logistics':         { rate: 0.32, pool: ['Fence', 'BigRoadSign', 'Sewerage', 'UndergroundTrashBin'] },
  'Transit Guild':     { rate: 0.32, pool: ['BigRoadSign', 'RoadSign', 'Fence'] },
  'Gray Bazaar':       { rate: 0.52, pool: ['Bin', 'UndergroundTrashBin', 'Steps1', 'Steps2', 'Steps3', 'RoadSign'] },
  'Agriculture':       { rate: 0.12, pool: ['Fence', 'FenceSmall'] },
  'Defense':           { rate: 0.30, pool: ['Fence', 'FenceCorner', 'BigRoadSign'] },
  _:                   { rate: 0.26, pool: ['Bin', 'Fence', 'RoadSign', 'Sewerage'] },
};
function queueKitStreet(out) {
  if (!KIT) return;
  var R = CB.opt.viewRadius, R2 = R * R, i, j;
  var t0 = MOD_M;
  /* ── NOTHING IS PAVED OVER A CARRIAGEWAY ──────────────────────────────
     Three separate loops lay Pavement without asking what is underneath, and
     two of them run through every intersection: the avenue's two pavement
     strips continue across the cross street and the cross street's two
     continue across the avenue. Pavement wins where they meet because it is
     HIGHER - the kit's Road sits ten units low, which is exactly the kerb drop
     and is the whole reason the pavement reads as raised without an offset
     anywhere in this file. Coplanar it would be a z-fighting flicker; twenty
     centimetres up it is a clean, silent overpaint at the pavement's darker
     value. Road bakes #585753 and pavement #332f2c, so the swap is 45,45,42
     down to 26,24,22 wherever it happens.

     *** MEASURED, AND SMALLER THAN IT LOOKS - SAID SO BECAUSE I FIRST WROTE
     THAT IT WAS THE WHOLE ROAD PROBLEM AND IT IS NOT. *** Same camera, guard
     off and on: 25588 faces against 25518, seventy faces, and 16150 changed
     pixels of 791010 - two per cent of the frame, entirely inside one bounding
     box around the junction. It is a real fault at every intersection and it
     is worth fixing; it is not a road failing to render. Every Road tile is
     laid, every kit name resolves, and the carriageway takes its correct baked
     colour at every distance - all three instrumented before this was touched.

     Enforced HERE rather than at the five call sites, for the same reason the
     arena bound is enforced at addCover: a rule with five copies has five
     chances to be forgotten, and a sixth paving loop will be written. */
  function onCarriageway(x, z) {
    for (var a = 0; a < GRID.ax.length; a++)
      if (Math.abs(x - GRID.ax[a]) < GRID.hw) return true;
    for (var b = 0; b < GRID.az.length; b++)
      if (Math.abs(z - GRID.az[b]) < GRID.hw) return true;
    return false;
  }
  /* ── AND NOTHING STANDS IN THE MIDDLE OF A CROSS STREET ────────────────
     THE VERGE FURNITURE AND THE LAMPS WALK DOWN THE AVENUE AT A FIXED PITCH -
     nine metres for the litter, twenty-two for the lamps - AND NOTHING EVER
     ASKED WHETHER THE NEXT STOP WAS A JUNCTION. It is on the verge of the
     avenue, which is correct; it is also in the middle of the cross street's
     carriageway, which is not. Counted on new_anchor at one camera: two bins,
     two fences, two small fences and four lamp posts standing in the road.
     That is the "random objects in the roads" - not random at all, it is every
     intersection where the pitch happens to land.

     THE MANHOLES STAY. Sewerage is the one piece that BELONGS on a
     carriageway; it was moved out of the furniture pool for exactly that
     reason and it is placed by the lane loop rather than by this one. */
  function standsInRoad(x, z) {
    for (var a = 0; a < GRID.ax.length; a++)
      if (Math.abs(x - GRID.ax[a]) < GRID.hw + 0.8) return true;
    for (var b = 0; b < GRID.az.length; b++)
      if (Math.abs(z - GRID.az[b]) < GRID.hw + 0.8) return true;
    return false;
  }
  function tile(name, x, z, rot, jit) {
    var dx = x - cam.x, dz = z - cam.z;
    if (dx*dx + dz*dz > R2) return;
    if (NEVER_ON_ROAD[name] && onCarriageway(x, z)) return;
    /* THE TWO SURFACE TILES STAND DOWN WHEN THE BAND PASS IS DRAWING THEM.
       Only these two: Road and Pavement are one flat face apiece and carry no
       relief at all, so the pattern replaces them exactly. Everything else in
       the family - the kerb, the mitre, the crossing, the lines - has a
       PROFILE, and a profile is the thing a ground texture cannot draw. */
    if (CB.opt.groundTex > 0 && SURFACE_ONLY[name]) return;
    pushKit(name, x, 0, z, rot || 0, out, jit ? tileJitter(x, z) : 0);
  }
  /* ── Where a street stops being a street ──────────────────────────────
     THE KERBS RAN STRAIGHT THROUGH EVERY JUNCTION and the cross streets had no
     kerb or pavement at all - only carriageway. Both are the same omission:
     the grid was laid as three independent avenues rather than as a street
     NETWORK, so nothing described what happens where two of them meet.

     A junction needs three things and the kit ships all of them. The straight
     kerb must STOP short of the crossing. The corner where two kerbs meet
     needs a mitre - PavementCornerBig, measured off the bake as an outer
     corner with the carriageway in its (+X,+Z) quadrant, which fixes all four
     rotations. And the cross street needs the same kerb-and-pavement treatment
     the avenues already had, or it reads as a service road cut through a
     proper one. */
  /* ── THE SKIP RADIUS HAS TO MATCH WHAT THE MITRE ACTUALLY COVERS ───────
     It was hw + t0*1.6 = 13.0m on a radial world, and PavementCornerBig sits
     at hw + t0*0.5 with a half-module reach, so the mitre covers |dz| 6.6 to
     10.6 and nothing else. The straight kerb was being skipped for 2.4 metres
     of approach that the corner never reached - and that band, between the
     road edge and the pavement strips at hw+10.6, is KERB-ONLY territory, so
     what showed there was bare ground. Two rows per junction on new_anchor.

     hw + t0 is exactly the mitre's outer edge, so the straight kerb now stops
     where the corner starts instead of well short of it. */
  function inJunction(x, z) {
    for (var a = 0; a < GRID.ax.length; a++) {
      if (Math.abs(x - GRID.ax[a]) > GRID.hw + t0) continue;
      for (var b = 0; b < GRID.az.length; b++)
        if (Math.abs(z - GRID.az[b]) < GRID.hw + t0) return true;
    }
    return false;
  }
  // Carriageways. The kit's Road sits 10 units low, which is exactly the kerb
  // drop, so the pavement reads as raised without anything being offset here.
  var zLo = Math.max(GRID.z0, cam.z - R), zHi = Math.min(GRID.z1, cam.z + R);
  var xLo = Math.max(GRID.x0, cam.x - R), xHi = Math.min(GRID.x1, cam.x + R);
  for (i = 0; i < GRID.ax.length; i++) {
    /* ── THE STRIP OF PLAIN ALONG EVERY KERB, AND IT WAS A ROUNDING ───────
       *** THE LANE COUNT WAS ROUNDED AND THE REMAINDER WAS LEFT BARE. ***
       lanes = round(hw*2 / t0) and the run was laid from ax - hw, so the road
       covered lanes*t0 metres of a carriageway 2*hw wide and whatever was left
       over showed the PLAIN underneath - the tinted grass patch, which on a
       garden world is bright green and on any world is the one thing in the
       frame that is not city. Not fog and not the haze: bare ground, in a
       strip running the entire length of the avenue, hard against the kerb.

       IT IS INVISIBLE ON HALF THE WORLDS, which is why it survived. The gap is
       exactly 2*hw - round(2*hw/t0)*t0, so it depends entirely on the layout's
       kerb half-width against the four-metre module:

           grid      hw 6.0   12.0 / 4 = 3 exactly      no gap
           hollow    hw 6.2   12.4 / 4 -> 3             0.4m, sub-pixel at range
           radial    hw 6.6   13.2 / 4 -> 3             1.2m, the full length
           spine     hw 8.4   16.8 / 4 -> 4             0.8m

       Swept across four worlds: lustandia clean, yujing and new_anchor both
       showing a 1m-plus uncovered run at ax+5.5..ax+6.5 over every z row in
       the near field. Both are radial, which is the layout in the screenshot.

       CEILING AND CENTRED, rather than rounding and hoping. The run is now at
       least as wide as the carriageway and any overhang lands UNDER the kerb -
       the kit's Road sits ten units low and PavementCurb carries its road side
       at the same drop, so an overhanging road tile is below the kerb that
       covers it rather than fighting it. One extra one-face tile per avenue on
       the layouts that need it. */
    /* *** AND CEILING-AND-CENTRE WAS THE WRONG FIX, WHICH THE MARKED RENDER
       SHOWED IMMEDIATELY. *** It closed the bare strip by overhanging the road
       past the kerb line, on the argument that the overhang lands UNDER the
       kerb. It is the other way round: the kerb piece carries its own road
       side at the same ten unit drop, so an overhanging road tile is coplanar
       with it, and what you get is a dark tab of kerb geometry drawn ON the
       carriageway once per module - a ladder of dark rungs down the road edge,
       which is the "square empty spots".

       FLOOR PLUS TWO FLUSH EDGE TILES instead. The centred run covers what
       divides evenly and one extra tile per side sits with its OUTER edge
       exactly on the kerb line, so the union is exactly the carriageway and
       nothing crosses it. Road over road is invisible - same piece, same
       colour, same height - so the overlap in the middle costs nothing.

           hw 6.0  floor 3, centred +/-6.0, edges at +/-4.0  ->  +/-6.0
           hw 6.6  floor 3, centred +/-6.0, edges at +/-4.6  ->  +/-6.6
           hw 8.4  floor 4, centred +/-8.0, edges at +/-6.4  ->  +/-8.4

       Two extra one-face tiles per z step per avenue. */
    var lanes = Math.max(1, Math.floor(GRID.hw * 2 / t0));
    var lane0 = -lanes * t0 * 0.5;
    var edge = GRID.hw - t0 * 0.5;
    for (var z = Math.floor(zLo/t0)*t0; z < zHi; z += t0) {
      tile('Road', GRID.ax[i] - edge, z + t0*0.5, 0, 1);
      tile('Road', GRID.ax[i] + edge, z + t0*0.5, 0, 1);
      for (j = 0; j < lanes; j++) {
        var lx = GRID.ax[i] + lane0 + t0*(j + 0.5);
        tile('Road', lx, z + t0*0.5, 0, 1);
        if (tilePatch(lx, z)) {
          var dz2 = lx - cam.x, dz3 = z - cam.z;
          if (dz2*dz2 + dz3*dz3 <= R2)
            pushKit('Road', lx, 0.012, z + t0*0.5, 0, out, 0.52);
        }
      }
      var jz = inJunction(GRID.ax[i], z + t0*0.5);
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        if (!jz) {
          /* ── AND BOTH AVENUE KERBS WERE TURNED THE WRONG WAY ──────────
             *** THIS IS THE BROKEN ROAD EDGE, AND IT IS A HUNDRED AND EIGHTY
             DEGREES, NOT A GAP. *** Read off the bake face by face rather than
             reasoned about, because reasoning about it is what got it wrong:
             PavementCurb's pavement deck sits at y=0 over z -100..-10, its lip
             rises to y=3 across z -10..0, and the ROAD half is at y=-10 over
             z 0..+100 and is the only face in the piece carrying the road
             colour #585753. So the road side is +Z and the pavement side -Z.

             Rotating by theta maps that +Z to (sin theta, 0, cos theta). On
             the +x side of an avenue the kerb stands at ax + hw + 2 and the
             road is toward -X, which is theta = -PI/2. The code had +PI/2,
             which points the road half AWAY from the street; and -PI/2 on the
             -x side, which does the same there. BOTH SIDES WERE FLIPPED.

             What that draws is a road-coloured trench two metres wide sunk
             twenty centimetres into the PAVEMENT along every avenue, with the
             raised pavement deck cantilevered out over the carriageway - which
             from a camera standing on that pavement is a broken road edge with
             a row of pale squares along it.

             THE CROSS STREETS WERE ALWAYS RIGHT, which is why this only ever
             showed on an avenue: they use PI and 0, and the piece's own axis
             is Z, so no quarter turn is involved and there was nothing to get
             backwards. */
          /* ── AND IT WAS ALSO TWO METRES TOO FAR OUT ───────────────────
             *** THE PIECE STRADDLES THE KERB LINE; IT DOES NOT SIT BESIDE
             IT. *** Measured off the bake: the module is 4m across, and the
             lip - the vertical face between the pavement deck and the drop -
             is at LOCAL Z ZERO, which is the CENTRE of the piece. Two metres
             of road on one side of it, two metres of pavement on the other.

             So the centre belongs ON the kerb line at ax + hw, not at
             ax + hw + 2. Placed two metres out, the piece's road half - the
             one face in it wearing the road colour #585753 - lands entirely on
             the PAVEMENT, painting a two metre band of road grey down both
             sides of every avenue. Measured at one camera before this: 4407
             sampled pixels of road colour drawn by PavementCurb, broken into
             module lengths by the junction skips and the corner mitres, which
             is what makes it read as squares rather than as a stripe.

             THE BARE-RUN SWEEP COULD NEVER HAVE FOUND THIS and that is worth
             recording: at ax + hw + 2 the piece still COVERED the ground
             continuously, deck meeting the first pavement strip at hw + 4
             exactly. Nothing was missing. It was the wrong colour, and a
             coverage probe does not look at colour.

             Straddling, the road half overlaps the carriageway tiles - same
             #585753, same ten unit drop - so it is invisible, which is plainly
             what the pack intends by putting road inside a kerb piece. */
          tile('PavementCurb', GRID.ax[i] + sgn*GRID.hw, z + t0*0.5,
               sgn > 0 ? -Math.PI/2 : Math.PI/2);
          // The edge line, against the kerb, where the kit's dashes are not.
          tile('SolidLine', GRID.ax[i] + sgn*(GRID.hw - 0.35), z + t0*0.5,
               Math.PI/2);
        }
        /* TWO TILES OF PAVEMENT, NOT ONE. Counted from the author's own demo
           city: 738 pavement tiles against 617 of road, so the walkway is
           WIDER than the carriageway there. Ours had one tile against three
           lanes, which is why the street read as a road with edges rather than
           as a street. */
        /* Moved in by half a module with the kerb. The deck now covers
           hw..hw+2 and these two cover hw+2..hw+10, so the walkway is
           continuous from the lip outward instead of starting where the
           mis-placed kerb happened to end. */
        tile('Pavement', GRID.ax[i] + sgn*(GRID.hw + t0), z + t0*0.5, 0, 1);
        tile('Pavement', GRID.ax[i] + sgn*(GRID.hw + t0*2), z + t0*0.5, 0, 1);
      }
      if (!jz && ((z/t0)|0) % 2 === 0) tile('DashedLine', GRID.ax[i], z + t0*0.5);
      /* Service covers sit in the ROAD. They were in the furniture pool, which
         put them on the pavement, where a manhole is not. */
      if (!jz && (((z/t0)|0) % 7) === 3)
        tile('Sewerage', GRID.ax[i] - GRID.hw*0.45, z + t0*0.5);
    }
  }
  // Cross streets, with the kerb and pavement the avenues already had.
  for (j = 0; j < GRID.az.length; j++) {
    // Same ceiling-and-centre as the avenues; the cross streets had the
    // identical remainder and left the identical strip along their own kerbs.
    var rows = Math.max(1, Math.floor(GRID.hw * 2 / t0));
    var row0 = -rows * t0 * 0.5;
    var redge = GRID.hw - t0 * 0.5;
    for (var x = Math.floor(xLo/t0)*t0; x < xHi; x += t0) {
      tile('Road', x + t0*0.5, GRID.az[j] - redge, 0, 1);
      tile('Road', x + t0*0.5, GRID.az[j] + redge, 0, 1);
      for (i = 0; i < rows; i++)
        tile('Road', x + t0*0.5, GRID.az[j] + row0 + t0*(i + 0.5), 0, 1);
      var jx = inJunction(x + t0*0.5, GRID.az[j]);
      for (var sg2 = -1; sg2 <= 1; sg2 += 2) {
        if (!jx) {
          // A cross street runs along X, which is the piece's own axis, so the
          // kerb needs no quarter turn here - only the mirror.
          tile('PavementCurb', x + t0*0.5, GRID.az[j] + sg2*GRID.hw,
               sg2 > 0 ? Math.PI : 0);
          tile('SolidLine', x + t0*0.5, GRID.az[j] + sg2*(GRID.hw - 0.35), 0);
        }
        tile('Pavement', x + t0*0.5, GRID.az[j] + sg2*(GRID.hw + t0), 0, 1);
        tile('Pavement', x + t0*0.5, GRID.az[j] + sg2*(GRID.hw + t0*2), 0, 1);
      }
    }
    // Crossings on the approach, and the mitred corners of the junction.
    for (i = 0; i < GRID.ax.length; i++) {
      tile('Crossing', GRID.ax[i], GRID.az[j] - GRID.hw - t0*0.5);
      tile('Crossing', GRID.ax[i], GRID.az[j] + GRID.hw + t0*0.5);
      // The mitre is the same 4m module on the same convention: it straddles
      // the corner rather than sitting outside it.
      var cx2 = GRID.hw, cz2 = GRID.hw;
      /* Rotations derived from the bake: the piece keeps its carriageway in
         the (+X,+Z) quadrant, so each corner turns to put the junction there. */
      tile('PavementCornerBig', GRID.ax[i]-cx2, GRID.az[j]-cz2, 0);
      tile('PavementCornerBig', GRID.ax[i]+cx2, GRID.az[j]-cz2, Math.PI/2);
      tile('PavementCornerBig', GRID.ax[i]+cx2, GRID.az[j]+cz2, Math.PI);
      tile('PavementCornerBig', GRID.ax[i]-cx2, GRID.az[j]+cz2, -Math.PI/2);
    }
  }

  /* ── The litter, and a foundry does not litter like a bank ────────────
     The kit ships bins, fences, signs, steps and sewerage and none of it was
     placed. Weighting it by SECTOR costs nothing and is the cheapest character
     the scene can buy: a finance district gets railings and signage, a foundry
     gets fencing and service covers, a bazaar gets bins and steps because a
     bazaar is where people actually are.

     Kept on the PAVEMENT, capped, and culled to the radius. Bin is 40 faces
     and RoadSign 25, so this is not free - but it is spent where the eye is,
     which is the near verge. */
  var furn = FURNITURE[(MAP && MAP.sector)] || FURNITURE._;
  var fr = mulberry32((MAP ? MAP.seed : 1) ^ 0xF0F0);
  var placed = 0;
  for (i = 0; i < GRID.ax.length && placed < FURN_MAX; i++) {
    for (var fz = Math.floor(zLo/9)*9; fz < zHi && placed < FURN_MAX; fz += 9) {
      if (fr() > furn.rate) continue;
      var fs2 = fr() < 0.5 ? -1 : 1;
      var fx = GRID.ax[i] + fs2*(GRID.hw + t0*1.1 + fr()*1.6);
      var fdx = fx - cam.x, fdz = fz - cam.z;
      if (fdx*fdx + fdz*fdz > R2) continue;
      if (standsInRoad(fx, fz)) continue;        // not in the crossing
      var pick = furn.pool[(fr()*furn.pool.length)|0];
      pushKit(pick, fx, 0, fz, fs2 > 0 ? Math.PI : 0, out);
      placed++;
    }
  }

  /* ── Trees, and they are the most expensive object in the scene ───────
     627 to 835 faces EACH - more than a whole building's walls - which is why
     they were left out while the renderer was fighting for frames. They are
     affordable now and they are still capped hard and taken nearest-first,
     because four of them cost as much as forty lamps. Planted on the verge
     between kerb and building line, which is where a street tree goes. */
  var trees = [];
  for (i = 0; i < GRID.ax.length; i++) {
    for (var tz = Math.floor(zLo/17)*17; tz < zHi; tz += 17) {
      for (var tg = -1; tg <= 1; tg += 2) {
        var tx = GRID.ax[i] + tg*(GRID.hw + t0*1.5);
        if (inJunction(tx, tz)) continue;
        var tdx = tx - cam.x, tdz = tz - cam.z, td2 = tdx*tdx + tdz*tdz;
        if (td2 > R2) continue;
        trees.push({ x: tx, z: tz, d: td2 });
      }
    }
  }
  trees.sort(function (a, b) { return a.d - b.d; });
  for (i = 0; i < trees.length && i < TREE_MAX; i++)
    pushKit('Tree' + (1 + ((Math.abs(Math.round(trees[i].x + trees[i].z))) % 3)),
            trees[i].x, 0, trees[i].z, (i * 1.7) % 6.28, out);

  /* ── The lots are PAVED, not painted ──────────────────────────────────
     THE GROUND BETWEEN THE BUILDINGS WAS A TILED LUMINANCE PATCH STRETCHED
     OVER A PLANE, and at a steep angle over a large flat area that smears into
     horizontal streaks - which is what the yards looked like from above and
     why they did not match the Reach's ground. The depth ratio across a band
     was MEASURED at 1.23 looking down, so it is not the band affine failing;
     it is a 512px pattern covering forty metres of world and being asked to
     hold up at close range.

     A flat-coloured face cannot smear. The kit's Pavement is one face, it is
     already the surface the kerbs and the buildings sit on, and paving the
     lots with it removes the artifact from the only place it was visible -
     inside the city, where the fighting is. The plain outside keeps the band
     pass, because out there it is forty metres per tile of distant ground and
     that is exactly what the pattern is for.

     Radius-culled like everything else, so this is a few hundred tiles in
     view rather than the several thousand the whole grid would be. */
  for (i = 0; i < CELLS.length; i++) {
    var c0 = CELLS[i];
    var lx0 = Math.max(c0[0], cam.x - R), lx1 = Math.min(c0[1], cam.x + R);
    var lz0 = Math.max(c0[2], cam.z - R), lz1 = Math.min(c0[3], cam.z + R);
    for (var px2 = Math.floor(lx0/t0)*t0; px2 < lx1; px2 += t0)
      for (var pz2 = Math.floor(lz0/t0)*t0; pz2 < lz1; pz2 += t0)
        tile('Pavement', px2 + t0*0.5, pz2 + t0*0.5, 0, 1);
  }

  // Lamps: paired down each avenue, nearest first, capped.
  var lamps = [];
  for (i = 0; i < GRID.ax.length; i++) {
    for (var lz = Math.floor(zLo/LAMP_SPACING)*LAMP_SPACING; lz < zHi; lz += LAMP_SPACING) {
      for (var sg = -1; sg <= 1; sg += 2) {
        var px = GRID.ax[i] + sg*(GRID.hw + 1.6);
        var ddx = px - cam.x, ddz = lz - cam.z;
        var d2 = ddx*ddx + ddz*ddz;
        if (d2 > R2) continue;
        if (standsInRoad(px, lz)) continue;      // not in the crossing
        lamps.push({ x: px, z: lz, d: d2, rot: sg > 0 ? Math.PI : 0 });
      }
    }
  }
  lamps.sort(function (a, b) { return a.d - b.d; });
  /* TWO LAMPS, AND THE CHEAP ONE IS THE POINT. Lamp1 is 142 faces and Lamp2 is
     47 - a three-fold difference for something that is a silhouette and two
     glowing heads past thirty metres. The near ones get the detailed post and
     everything behind gets the simple one, which buys three times the lamps
     for the same faces and, incidentally, stops the street being lined with
     one repeated object. */
  /* COUNTED FROM THE AUTHOR'S DEMO CITY: 55 of Lamp2 against 6 of Lamp1. The
     cheap post is the STANDARD one and the heavy 142-face lamp is the
     exception, not the other way round - which is both what the pack intends
     and three times the lamps per face. */
  for (i = 0; i < lamps.length && i < LAMP_MAX; i++)
    pushKit(i < 3 ? 'Lamp1' : 'Lamp2', lamps[i].x, 0, lamps[i].z,
            lamps[i].rot, out);
}

var _kitSort = [];
/* ── THE CIRCLE HAS TO CONTAIN THE BUILDING, NOT ITS CENTRE ───────────────
   *** THIS IS MOST OF THE POPPING. *** Every other cull in this file measures
   the object's REACH and adds it to the radius - queueProps has done it since
   it was written, with the comment "so a long block is not culled because its
   middle is just outside". Buildings never got that treatment, and buildings
   are the largest things in the frame: a forty metre block whose centre sits
   at 151m is entirely absent, and one step of the camera later the whole
   facade - walls, windows, roof, parapet - arrives at once, forty metres wide
   and unmissable.

   A small prop appearing at the fog line is invisible. A BUILDING appearing at
   the fog line is the whole complaint. The half-diagonal is the right term
   because the footprint is axis aligned and the test is a circle: no corner of
   the box can be nearer than centre distance minus half the diagonal. */
function nearR2(b, R) {
  var lim = R + Math.sqrt(b.w*b.w + b.d*b.d) * 0.5;
  return lim * lim;
}
function queueKitBuildings(out) {
  if (!KIT) return;
  var R = CB.opt.viewRadius, i;
  _kitSort.length = 0;
  for (i = 0; i < kitB.length; i++) {
    var b = kitB[i];
    var dx = b.x - cam.x, dz = b.z - cam.z;
    var d2 = dx*dx + dz*dz;
    if (d2 > nearR2(b, R)) continue;
    /* SORTED ON THE NEAREST CORNER RATHER THAN THE CENTRE, so a wide block
       across the street does not rank behind a narrow one further away whose
       middle happens to be closer. The sort decides nothing about detail any
       more (see below), but it still decides paint order. */
    var near = Math.max(0, Math.sqrt(d2) - Math.sqrt(b.w*b.w + b.d*b.d)*0.5);
    _kitSort.push({ b: b, d: d2, near: near });
  }
  _kitSort.sort(function (p, q) { return p.near - q.near; });
  var budget = KIT_WINDOW_BUDGET, shopBudget = SHOP_BUDGET;
  for (i = 0; i < _kitSort.length; i++) {
    var bb = _kitSort[i].b;
    /* ── A BUILDING THE CAMERA IS INSIDE IS A ROOM, NOT A SHELL ─────────
       Every wall is a single-sided quad with its normal outward, so from
       inside the box every one of them faces away and every one is culled -
       and you see straight out through your own building at the whole street.
       A free camera reaches that state in about a second of flying.

       Inverting the cull for that ONE building draws the far walls instead of
       the near ones, which is exactly what standing in a room looks like. It
       costs a boolean and it is only ever true for a single building. */
    var inside = cam.x > bb.x - bb.w/2 && cam.x < bb.x + bb.w/2 &&
                 cam.z > bb.z - bb.d/2 && cam.z < bb.z + bb.d/2 &&
                 cam.y > 0 && cam.y < bb.h;
    /* ── EVERY VISIBLE BUILDING GETS SOME WINDOWS ────────────────────────
       A single first-come budget is a CLIFF: the first few buildings take all
       of it and the rest are blank walls, which does not read as detail
       falling off with distance, it reads as half the city being unfinished.
       An allowance per building spreads the same budget down the whole sorted
       list - the nearest still get the most, because they are also the ones
       with the most modules on screen, but nothing is left bare. */
    /* ── AND DETAIL IS A FUNCTION OF DISTANCE, NOT OF RANK ────────────────
       *** THE REST OF THE POPPING IS HERE, AND IT IS NOT A CULL AT ALL. ***
       Two things were decided by a building's POSITION IN THE QUEUE: `rich`
       was `i < 8`, and the window budget was spent nearest-first down the
       sorted list. Both make a building's appearance depend on its NEIGHBOURS.

       Walk the camera four metres and a block behind you leaves the radius.
       Every building after it moves up one rank. The ninth building becomes
       the eighth and its whole facade switches window pools - 34/28/22 faces
       instead of 18/20/20/22, a visibly different window - while standing
       perfectly still at an unchanged distance. Further down the list a
       building that was inside the budget falls outside it and goes to blank
       wall, or the reverse. Nothing moved and nothing crossed the fog line;
       the queue reshuffled underneath them.

       That is why it reads as textures flickering rather than as things
       entering view. Keyed on distance both are STABLE: a building at 60m has
       the rich pool at 60m no matter what else is on screen, and it keeps it
       while the camera holds still.

       THE BUDGET STAYS, AS A CEILING RATHER THAN AS THE DECIDER. It was
       measured at 16000, 32000 and 64000 rendering the identical frame, so it
       has not been the binding constraint for a while - which is exactly what
       makes this swap free. It is kept because an unbounded per-building
       allowance is one pathological layout away from a spike. */
    var left = _kitSort.length - i;
    /* The floor matters more than the share. A building needs enough to cover
       the elevation you are looking at or it reads as unfinished rather than
       as distant, and a whole cheap facade is about five hundred faces. */
    /* SCALED TO THE BUILDING, NOT JUST TO THE QUEUE. A flat floor still
       starves a tall tower: a nine storey elevation has three times the
       modules of a three storey one and was given the same allowance, so the
       biggest thing in the frame stayed the emptiest. The floor is per visible
       module now. */
    var visMods = 0;
    /* Sixty-two metres, which is where the measured spread between the two
       pools stops being visible: a 34 face window and an 18 face one differ by
       about two pixels of mullion at that range. Picked off the range the
       pools already describe rather than off the rank they used to use. */
    var rich = _kitSort[i].near < RICH_RANGE;
    var rnd = mulberry32(bb.seed ^ 0x5A17);
    var nx = Math.max(1, Math.round(bb.w / MOD_M));
    var nz = Math.max(1, Math.round(bb.d / MOD_M));
    var ns = Math.max(1, Math.round(bb.h / MOD_M));
    var wallW = 'Wall' + bb.pal;
    // The elevation facing the contested avenue is the one with the door.
    var faceStreet = bb.x < 0 ? 1 : 3;
    /* ── Which way a module faces, derived rather than guessed ────────────
       Every wall, window and door piece in the kit is authored in the XY
       plane with its normal along +Z and its origin at the CENTRE of the
       module - measured off the bake, not assumed. Rotation about Y by theta
       maps that normal to (sin theta, 0, cos theta), so the outward direction
       of each elevation fixes theta exactly:

           front  outward -Z   theta = PI
           back   outward +Z   theta = 0
           left   outward -X   theta = +PI/2
           right  outward +X   theta = -PI/2

       *** THE LEFT AND RIGHT WERE SWAPPED AND THAT IS WHY BUILDINGS WERE OPEN
       ON TWO SIDES. *** Rotating (0,0,1) about Y by theta gives
       (-sin theta, 0, cos theta) - the MINUS is the part I got wrong by
       reasoning about it instead of evaluating it. At -PI/2 that is (+1,0,0),
       which is the RIGHT elevation's outward direction, and it was being used
       for the LEFT. Both side walls therefore faced INTO the building, were
       back-face culled, and the box was missing two of its four elevations -
       which reads as a building you can see straight through.

       Getting this backwards does not draw the wall inside out - it CULLS it,
       because a single-sided quad facing away is discarded, and a building
       with half its elevations culled reads as a handful of loose cards
       standing in the street. Which is exactly how it first came out. */
    var s, j, sideRot = [Math.PI, 0, Math.PI/2, -Math.PI/2];
    /* ── SPEND THE BUDGET ON THE SIDES YOU CAN SEE ───────────────────────
       The elevations were walked in a fixed order - front, back, left, right -
       and windows were assigned until the allowance ran out. Two of those four
       sides face AWAY from the camera and are back-face culled, so on a
       building seen from the front-right the allowance was spent on the back
       and left elevations, every one of those windows was thrown away, and the
       two sides actually on screen got plain wall.

       That is why the NEAREST building in the orbit shot was the blankest one:
       the more modules a building has, the faster it exhausted an allowance on
       geometry nobody would ever see.

       Visibility is the sign of the outward normal against the direction to
       the camera, which is the same test pushKit already does per face - done
       once per side here, before anything is spent. A hidden side is skipped
       entirely now rather than pushed and culled, which is also why the frame
       got cheaper rather than dearer. */
    var sideVis = [], sideOut = [[0,0,-1], [0,0,1], [-1,0,0], [1,0,0]];
    for (var sv = 0; sv < 4; sv++) {
      var o = sideOut[sv];
      var fx2 = bb.x + o[0]*bb.w/2, fz2 = bb.z + o[2]*bb.d/2;
      sideVis[sv] = inside ||
        (o[0]*(cam.x - fx2) + o[2]*(cam.z - fz2)) > 0;
    }
    for (var sv2 = 0; sv2 < 4; sv2++)
      if (sideVis[sv2]) visMods += ((sv2 < 2) ? nx : nz) * ns;
    /* Twenty-six faces a module is roughly the cheap-window average, so this
       is "enough to cover what you can see", bounded by what is left. */
    var allow = Math.min(budget, Math.max(260, visMods * 26));
    for (var side = 0; side < 4; side++) {
      if (!sideVis[side]) continue;              // nothing here reaches screen
      var along = (side < 2) ? nx : nz;
      var halfA = (side < 2) ? bb.w : bb.d;
      var halfB = (side < 2) ? bb.d : bb.w;
      for (j = 0; j < along; j++) {
        var t = -halfA/2 + MOD_M*(j + 0.5);
        for (s = 0; s < ns; s++) {
          var px, pz;
          if (side === 0)      { px = bb.x + t; pz = bb.z - halfB/2; }
          else if (side === 1) { px = bb.x + t; pz = bb.z + halfB/2; }
          else if (side === 2) { px = bb.x - halfB/2; pz = bb.z + t; }
          else                 { px = bb.x + halfB/2; pz = bb.z + t; }
          var name = wallW, isShop = false;
          if (s === 0 && side === faceStreet && j === (along >> 1)) {
            /* ── HALF THE DOORS IN THE CITY WERE THE SAME DOOR ───────────
               The kit does NOT name its three door families the same way.
               Door1 and Door2 have no lit variant at all; Door3 has no plain
               variant and exists ONLY as Door3Lit and Door3Unlit. The old
               composition appended 'Lit' to whichever family it rolled, so
               three of its six combinations - Door1Lit, Door2Lit, Door3 -
               named nothing, and the fallback quietly turned all three into
               Door1. Result: Door1 took half of every entrance in the city,
               Door2 a sixth, and Door3Unlit was never drawn once.

               Nothing was broken and nothing warned, which is the whole
               problem with a fallback that lands on a real piece. Named the
               way the pack names them, all four are reachable and each family
               gets a third of the doors. */
            var dFam = 1 + ((bb.seed >>> 4) % 3);
            name = dFam === 3
                 ? 'Door3' + (((bb.seed >>> 6) & 1) ? 'Lit' : 'Unlit') + bb.pal
                 : 'Door' + dFam + bb.pal;
            if (!KIT[name]) name = 'Door1' + bb.pal;
            /* A door opening onto bare pavement is a door in a wall. The kit
               has three step blocks and they are what makes it an ENTRANCE. */
            var stName = 'Steps' + (1 + ((bb.seed >>> 9) % 3));
            if (KIT[stName])
              pushKit(stName, px + sideOut[side][0]*1.1, 0,
                      pz + sideOut[side][2]*1.1, sideRot[side], out, 0, inside);
          } else if (s === 0 && shopBudget > 0 &&
                     _kitSort[i].near < SHOP_RANGE &&
                     KIT['Window2Lit' + bb.pal]) {
            /* The shopfront. Stable per bay for the life of the building, on
               a hash that shares no bits with the facade's, or a ground floor
               would light in lockstep with the storey above it. */
            var slit = ((((bb.seed >>> 17) ^ (j * 23)) >>> 0) & 7) < 5;
            name = 'Window2' + (slit ? 'Lit' : 'Unlit') + bb.pal;
            isShop = true;
          } else if (allow > 0 && budget > 0) {
            /* Lit, unlit or dark, decided per module and stable for the life
               of the building - a window that re-rolls every frame is a
               building with a strobe in it. */
            /* Two in five lit. A city at night with one window in ten lit
               reads as abandoned; with all of them lit it reads as a render.
               Stable per module, so nothing strobes. */
            /* ── A WINDOW HAS THREE STATES AND ONLY TWO WERE EVER NAMED ───
               The pack ships Halflit variants for Window1, 4, 5, 6 and 7 -
               fourteen pieces - and nothing in this file has ever composed
               that name, so they have sat in the bake unused since the kit
               landed. They are FREE: Window7Lit is 34 faces and Window7Halflit1
               is 34 faces, and the halflit carries exactly half the emissive
               panes of its lit sibling in every family. That is a third state
               on a facade at zero cost, and a third state is the difference
               between a grid of on/off cells and a building somebody lives in.

               SPLIT SO THE CITY DOES NOT CHANGE BRIGHTNESS. Four rolls in
               eight were lit before. Three are fully lit now and two are half,
               which is 3 + 2*0.5 = 4 lit panes' worth - the same emissive area
               spread over five windows instead of four. A family with no
               halflit piece splits its fallback between lit and unlit on the
               next hash bit rather than defaulting to lit, or the cheap pool
               (Window10, 8 and 9, none of which ship one) would come out a
               quarter brighter than the rich pool and the near buildings would
               read dimmer than the far ones. */
            var wst = (((bb.seed >>> 2) ^ (j * 13) ^ (s * 31)) & 7);
            var lit = wst < 3, halfLit = wst >= 3 && wst < 5;
            /* ── A BAY CAN BE ONE WINDOW OR A COLUMN OF GLASS ──────────────
               The pack ships Bot / Mid / Top segments of Window10 - the
               cheapest kind at 18 faces - which stack into a CONTINUOUS
               vertical strip up a bay. The author's own demo city uses 373 of
               the Mid segment alone, more than any other single piece, and
               that is what gives those buildings a curtain wall instead of a
               grid of punched holes.

               Whether a bay is glazed is a property of the BAY, not of the
               module, so it is hashed on the bay index and holds all the way
               up. A strip that starts and stops halfway is a mistake, not a
               variation. */
            var strip = ns > 2 && (((bb.seed >>> 11) ^ (j * 29)) & 3) === 0;
            if (strip) {
              var seg = (s === 0) ? 'Bot' : (s === ns - 1 ? 'Top' : 'Mid');
              name = 'Window10' + seg + (lit ? 'Lit' : 'Unlit') + bb.pal;
            } else {
              var pool = rich ? WIN_RICH : WIN_CHEAP;
              var w = pool[(((bb.seed >>> (j % 8)) ^ (s * 7)) >>> 0) % pool.length];
              if (halfLit) {
                /* Window4 and 6 ship three halflit patterns, the rest two.
                   Rolled high and walked down, so a family with two takes the
                   spare roll rather than losing the window to a name miss. */
                var hv = 1 + ((bb.seed >>> 14) ^ (s * 5)) % 3;
                name = '';
                for (; hv >= 1; hv--) {
                  var cand = 'Window' + w + 'Halflit' + hv + bb.pal;
                  if (KIT[cand]) { name = cand; break; }
                }
                // No halflit in this family: split, do not default to lit.
                if (!name)
                  name = 'Window' + w + ((wst & 1) ? 'Lit' : 'Unlit') + bb.pal;
              } else {
                name = 'Window' + w + (lit ? 'Lit' : 'Unlit') + bb.pal;
              }
            }
            if (!KIT[name]) name = wallW;
          }
          /* The piece is centred on its own origin, spanning half a module
             either side, so a storey sits at its MIDDLE height. Placing it at
             s*MOD_M put the ground floor half underground. */
          var used = pushKit(name, px, s*MOD_M + MOD_M*0.5, pz, sideRot[side],
                             out, 0, inside);
          if (name !== wallW) {
            if (isShop) shopBudget -= used;
            else { budget -= used; allow -= used; }
          }
        }
      }
    }
    /* ── The roof, with an edge on it ─────────────────────────────────────
       A FLAT SLAB IS MOST OF WHAT AN ORBIT OR OVERHEAD CAMERA SEES, and the
       roof was one untextured colour with a hard cut at the wall. The kit has
       the parapet pieces for exactly this: Roof1 is a four-face edge and
       Roof1Corner a ten-face corner, so a whole building's perimeter costs
       less than three windows.

       Measured off the bake rather than assumed - twice bitten now: Roof1
       carries its parapet on the +Z edge and Roof1Corner on the (+Z, -X)
       corner, which fixes every rotation below. */
    /* ── Three roofs, and they are three silhouettes ─────────────────────
       The kit ships three roof families and only the plainest was used. Read
       off the bake: Roof1 is a low parapet (4 faces, 10 at the corner), Roof2
       a TALL parapet with railing posts (26/64), Roof3 a cornice that PROJECTS
       past the wall (7/19) with its deck raised a notch. That is a bank, a
       plant room and a pre-war block, and the difference is visible at a
       hundred metres because it changes the OUTLINE rather than the surface.

       Chosen by sector first and seed second: finance and insurance get the
       railed parapet, foundries and logistics the plain one, everything else
       the cornice about half the time. */
    var rk = ROOF_STYLE[(MAP && MAP.sector)] || ROOF_STYLE._;
    var rstyle = rk[(bb.seed >>> 5) % rk.length];
    var rEdge = 'Roof' + rstyle, rCent = 'Roof' + rstyle + 'Center';
    var rLift = rstyle === 3 ? 0.4 : 0;            // Roof3's deck sits a notch up
    var rx0 = bb.x - bb.w/2, rz0 = bb.z - bb.d/2, ry = ns*MOD_M;
    for (j = 0; j < nx; j++) {
      for (s = 0; s < nz; s++) {
        var cxr = rx0 + MOD_M*(j+0.5), czr = rz0 + MOD_M*(s+0.5);
        var edgeX = (j === 0) ? -1 : (j === nx-1 ? 1 : 0);
        var edgeZ = (s === 0) ? -1 : (s === nz-1 ? 1 : 0);
        if (edgeX && edgeZ) {
          // corner piece: the bake's corner is (-X, +Z)
          var crot = (edgeX < 0 && edgeZ > 0) ? 0
                   : (edgeX > 0 && edgeZ > 0) ? -Math.PI/2
                   : (edgeX > 0 && edgeZ < 0) ? Math.PI
                   : Math.PI/2;
          pushKit(rEdge + 'Corner' + bb.pal, cxr, ry, czr, crot, out, 0, inside);
        } else if (edgeX || edgeZ) {
          var erot = edgeZ > 0 ? 0 : edgeZ < 0 ? Math.PI
                   : edgeX > 0 ? -Math.PI/2 : Math.PI/2;
          pushKit(rEdge + bb.pal, cxr, ry, czr, erot, out, 0, inside);
        } else {
          pushKit(rCent + bb.pal, cxr, ry - rLift, czr, 0, out, 0, inside);
        }
      }
    }
    /* Rooftop barrels: eighteen faces, on the near buildings only, and the
       one thing that stops a roof reading as a lid. */
    if (i < 6 && nx > 1 && nz > 1) {
      var nb = 1 + ((bb.seed >>> 8) % 3);
      for (j = 0; j < nb; j++) {
        pushKit(((bb.seed >>> (3+j)) & 1) ? 'RoofBarrelBig' : 'RoofBarrel',
                rx0 + MOD_M*(1 + ((bb.seed >>> (2*j)) % Math.max(1, nx-1))),
                ry + 0.4,
                rz0 + MOD_M*(1 + ((bb.seed >>> (2*j+1)) % Math.max(1, nz-1))),
                (bb.seed >> j) * 0.7, out, 0, inside);
      }
    }
    void rnd;
  }
}

// ── meshes ─────────────────────────────────────────────────────────────────
var MESHES = null, _meshPend = 0;
function loadMeshes() {
  if (MESHES || _meshPend) return MESHES;
  _meshPend = 1;
  var src = global.CB_NATURE_SRC || (ASSETS + 'nature/meshes.json' + bust());
  if (typeof src === 'object') { MESHES = src; return MESHES; }
  global.fetch(src).then(function (r) { return r.json(); })
        .then(function (j) { MESHES = j; })
        .catch(function () {
          _meshPend = 2;
          CB.warn = 'meshes.json not found - flora is off, everything else runs';
        });
  return null;
}
var _mv = [0,0,0];
function pushMeshAt(m, X, Z, h, sx, sz, rot, mat, tone, out) {
  var ca = Math.cos(rot), sa = Math.sin(rot);
  var V = m.v, F = m.f, N = m.n, np = 0;
  for (var i = 0; i < F.length; i++) {
    var face = F[i];
    var nx0 = N[i*3], ny0 = N[i*3+1], nz0 = N[i*3+2];
    var nx = nx0*ca - nz0*sa, nz = nx0*sa + nz0*ca;
    var v0 = face[0]*3;
    var wx0 = X + (V[v0]*ca - V[v0+2]*sa)*sx;
    var wy0 = V[v0+1]*h;
    var wz0 = Z + (V[v0]*sa + V[v0+2]*ca)*sz;
    if (nx*(wx0-cam.x) + ny0*(wy0-cam.y) + nz*(wz0-cam.z) > 0) continue;
    var pts = [], ok = true, zsum = 0;
    for (var k = 0; k < face.length; k++) {
      var vi = face[k]*3;
      if (!project(X + (V[vi]*ca - V[vi+2]*sa)*sx, V[vi+1]*h,
                   Z + (V[vi]*sa + V[vi+2]*ca)*sz, _mv)) { ok = false; break; }
      pts.push(_mv[0], _mv[1]);
      zsum += _mv[2];
    }
    if (!ok) continue;
    out.push({ z: zsum / face.length, kind: 'face', mat: mat, tone: tone || 0,
               lit: Math.max(0, nx*SUN[0] + ny0*0.42 + nz*SUN[2]), p: pts });
    np++;
  }
  return np > 0;
}
var _sq = [[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
function pushPrism(poly, y0, h, mat, out, cap, tex) {
  var n = poly.length, i, cx = 0, cz = 0;
  for (i = 0; i < n; i++) { cx += poly[i][0]; cz += poly[i][1]; }
  cx /= n; cz /= n;
  for (var k = 0; k < n; k++) {
    var a = poly[k], b = poly[(k+1) % n];
    var nx = -(b[1]-a[1]), nz = (b[0]-a[0]);
    var nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    var mx = (a[0]+b[0])*0.5, mz = (a[1]+b[1])*0.5;
    if (nx*(mx-cx) + nz*(mz-cz) < 0) { nx = -nx; nz = -nz; }
    if (nx*(mx-cam.x) + nz*(mz-cam.z) > 0) continue;
    if (!project(a[0], y0, a[1], _sq[0])) continue;
    if (!project(b[0], y0, b[1], _sq[1])) continue;
    if (!project(b[0], h,  b[1], _sq[2])) continue;
    if (!project(a[0], h,  a[1], _sq[3])) continue;
    out.push({ z: Math.min(_sq[0][2], _sq[1][2]), kind: 'face', mat: mat, tone: 0,
               wall: 1, tex: tex, wa: a, wb: b, y0: y0, y1: h,
               lit: Math.max(0, nx*SUN[0] + nz*SUN[2]),
               p: [_sq[0][0],_sq[0][1], _sq[1][0],_sq[1][1],
                   _sq[2][0],_sq[2][1], _sq[3][0],_sq[3][1]] });
  }
  if (cap !== false) {
    var pts = [], zc = 1e9, ok = true, pc = [0,0,0];
    for (i = 0; i < n; i++) {
      if (!project(poly[i][0], h, poly[i][1], pc)) { ok = false; break; }
      pts.push(pc[0], pc[1]); if (pc[2] < zc) zc = pc[2];
    }
    if (ok) out.push({ z: zc, kind: 'face', mat: mat, tone: 0, lit: 0.62, p: pts,
                       roof: tex ? poly : null, roofY: h });
  }
}
/* ── Painting a face ──────────────────────────────────────────────────────
   FLAT FILLS ARE WHY EVERYTHING LOOKED LIKE CARDBOARD. One value per face is
   correct for a diffuse surface under a single distant light and it is not
   what any real wall does: the bottom of a wall sits in the bounce from the
   ground it stands on and the sky is a huge source overhead, so a vertical
   surface is always darker at the base and lighter at the top. That gradient
   is what the eye reads as HEIGHT, and without it a five storey block and a
   kerbstone are the same object at two sizes.

   A GRADIENT PER FACE IS NOT FREE, so it is gated on screen size. Anything
   under about twenty pixels tall gets the flat fill it always had - at that
   size the ramp is under a value per pixel and nobody could see it - which
   keeps it off the thousands of small mesh faces and on the couple of hundred
   that are actually walls. */
var GRAD_MIN_PX = 22;
function paintFace(it) {
  var c, k;
  if (it.col !== undefined) {
    /* A KIT FACE ALREADY KNOWS WHAT COLOUR IT IS. The palette ramp exists to
       give an untextured mesh a material; these faces were baked with one, so
       the only thing left to apply is the light - and the emissive on top of
       it, because a lit window is a source and must survive the shading. */
    /* THE PACK IS AUTHORED FOR DAYLIGHT AND THIS WORLD IS AT DUSK. The baked
       palette colours come out of a lit scene, so they are graded down here
       the same way the terrain patches are - otherwise a night street is full
       of buildings lit like noon, which is the two-images problem the sky and
       the haze were already fixed for. Emissive is added AFTER, at full
       strength, because a lit window is a source and must not be graded with
       the brick around it. */
    k = KIT_AMBIENT * (0.42 + it.lit * 0.58);
    var cr = ((it.col >> 16) & 255) * k, cg = ((it.col >> 8) & 255) * k, cb = (it.col & 255) * k;
    if (it.emi) {
      cr += (it.emi >> 16) & 255; cg += (it.emi >> 8) & 255; cb += it.emi & 255;
    }
    c = [Math.min(255, cr|0), Math.min(255, cg|0), Math.min(255, cb|0)];
  } else {
    var m = MAT[it.mat] || MAT.veg;
    k = (0.16 + it.lit*0.46) * (1 - (it.tone||0));
    c = mix3(m[0], m[1], k);
  }
  var q = it.p, s = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  var i, ylo = q[1], yhi = q[1];
  for (i = 3; i < q.length; i += 2) {
    if (q[i] < ylo) ylo = q[i];
    if (q[i] > yhi) yhi = q[i];
  }
  ctx.beginPath();
  ctx.moveTo(q[0], q[1]);
  for (i = 2; i < q.length; i += 2) ctx.lineTo(q[i], q[i+1]);
  ctx.closePath();
  if (it.wall && (yhi - ylo) > GRAD_MIN_PX) {
    var top = mix3(m[0], m[1], Math.min(1, k*1.34 + 0.06));
    var bot = mix3(m[0], m[1], Math.max(0, k*0.52));
    var g = ctx.createLinearGradient(0, ylo, 0, yhi);
    g.addColorStop(0, 'rgb(' + top[0] + ',' + top[1] + ',' + top[2] + ')');
    g.addColorStop(0.72, s);
    g.addColorStop(1, 'rgb(' + bot[0] + ',' + bot[1] + ',' + bot[2] + ')');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = s; ctx.lineWidth = 1; ctx.stroke();
    return;
  }
  // Stroked in its own colour: canvas antialiases polygon edges and abutting
  // faces of one mesh leave a hairline of the background along every seam.
  ctx.fillStyle = s; ctx.fill();
  ctx.strokeStyle = s; ctx.lineWidth = 1; ctx.stroke();
}

// ── what grows here ────────────────────────────────────────────────────────
// The pack's trees have been baked since the nature pass and no climate has
// ever spent them, because the only battlefield in the game is a brood world.
// This is the row that was being held for a Coalition or Circuit world.
var FLORA_SPEC = {
  tree_a:{h:[2.6,5.0], w:[0.55,0.90], tone:0.10}, tree_b:{h:[3.0,6.0], w:[0.55,0.90], tone:0.10},
  tree_c:{h:[3.0,6.0], w:[0.55,0.90], tone:0.10}, tree_d:{h:[3.5,6.5], w:[0.60,1.00], tone:0.10},
  scrub_a:{h:[0.7,1.5],w:[1.10,1.80],tone:0.18},  scrub_c:{h:[0.9,1.9],w:[1.00,1.60],tone:0.18},
  scrub_d:{h:[1.0,2.1],w:[1.00,1.60],tone:0.18},  tuft:{h:[0.4,0.9],w:[1.20,2.00],tone:0.16},
  rock_c:{h:[0.8,1.8], w:[1.20,2.00],tone:0.30},  rock_d:{h:[0.9,2.2],w:[1.20,2.00],tone:0.30},
  /* RUBBLE. Small, common, and CONCRETE rather than vegetation - a city fight
     leaves broken kerb and slab, and the material ramp is what says which. The
     nature pack's scatter rocks are the right shape for it and were already
     baked; only the tone and the material entry are new. */
  rock_a:{h:[0.35,0.8],w:[1.10,1.90],tone:0.34}, rock_b:{h:[0.4,0.95],w:[1.10,1.90],tone:0.34},
  cact_a:{h:[1.8,3.4], w:[0.45,0.75],tone:0.26},
  snag_a:{h:[4.0,7.5], w:[0.55,0.85],tone:0.34}, snag_b:{h:[5.0,9.0],w:[0.60,0.95],tone:0.36},
  snag_c:{h:[4.5,8.0], w:[0.70,1.10],tone:0.34}, snag_d:{h:[2.4,4.5],w:[0.90,1.40],tone:0.38},
  snag_e:{h:[4.0,7.0], w:[0.90,1.30],tone:0.36},
  scrub_b:{h:[0.8,1.7],w:[1.10,1.80],tone:0.32},
  wint_a:{h:[3.0,5.5], w:[0.55,0.90],tone:0.16}, wint_b:{h:[4.0,7.5],w:[0.60,0.95],tone:0.16},
  snowb_a:{h:[0.7,1.5],w:[1.10,1.80],tone:0.14}, snowb_b:{h:[0.8,1.7],w:[1.10,1.80],tone:0.14},
  rock_e:{h:[0.3,0.7], w:[1.20,2.10],tone:0.34},
  shrm_a:{h:[0.5,1.4], w:[0.90,1.50],tone:0.20}, shrm_b:{h:[0.6,1.8],w:[0.90,1.50],tone:0.20},
};
var MESH_MAT = { rock_a:'conc', rock_b:'conc', rock_c:'conc',
                 rock_d:'conc', rock_e:'conc' };
/* WEIGHTED TOWARD THE LOW STUFF, on purpose. A field of evenly spaced trees is
   an orchard; what makes ground look like ground is that most of what is on it
   is ankle high and only a few things are not. */
/* ── What grows on THIS world ─────────────────────────────────────────────
   ONE MIX FOR EVERY COLONY WAS THE SAME MISTAKE AS ONE SKY. A single urban
   pool put the same scrub and the same broadleaf trees on an ice world, a lava
   world and a garden world, tinted a different colour and otherwise identical -
   so the planting said nothing about where the fight was.

   reach-battle.js already solved this shape for the Reach: growth is decided by
   the world's TERRAIN KEY, because that key is already the climate statement
   the palette and the ground patch read. Nothing can appear on a world whose
   recipe does not name it, which is a stronger guarantee than a blanket ban
   and a more useful one, because it can say yes.

   These are the URBAN versions of those recipes - rubble is in every one,
   because a city fight makes rubble wherever it happens, and the timber is
   thinned everywhere because a street is not a forest. */
var FLORA_CLIMATE = {
  // Sand and dryland: cactus, tough scrub, nothing with a canopy.
  dust:    { n: 0.75, pool: [['tuft',8],['scrub_a',6],['scrub_d',4],['cact_a',5],
                             ['snag_a',2],['rock_a',4],['rock_b',3],['rock_e',2]] },
  // Basalt and ore country. Dead standing timber, no living canopy.
  veins:   { n: 0.60, pool: [['tuft',5],['scrub_b',4],['scrub_c',4],['snag_d',4],
                             ['snag_b',3],['snag_c',2],['rock_a',4],['rock_c',2]] },
  // Fungal, damp, lit from below. The one world with mushrooms in the street.
  rift:    { n: 0.70, pool: [['tuft',5],['scrub_a',4],['shrm_a',5],['shrm_b',4],
                             ['scrub_c',3],['snag_e',2],['rock_a',3],['rock_b',2]] },
  // Cold tundra scrub with a little hardy timber.
  tether:  { n: 0.70, pool: [['tuft',6],['scrub_a',4],['scrub_b',4],['snag_c',3],
                             ['tree_a',2],['rock_a',3],['rock_b',3]] },
  // A station deck grows almost nothing. Rubble and a few planters.
  station: { n: 0.28, pool: [['tuft',4],['scrub_b',2],['scrub_a',2],
                             ['rock_a',6],['rock_b',5],['rock_e',4]] },
  // Drowned world: fungus and snags, no scrub that minds wet feet.
  ocean:   { n: 0.65, pool: [['tuft',4],['scrub_a',3],['shrm_a',4],['shrm_b',3],
                             ['snag_a',3],['rock_a',3],['rock_e',2]] },
  // Ice: snowbanks and winter timber. No scrub, no fungus, no cactus.
  ice:     { n: 0.45, pool: [['snowb_a',7],['snowb_b',5],['wint_a',4],['wint_b',3],
                             ['tuft',2],['rock_a',3],['rock_b',2]] },
  // The garden worlds, and the only ones that get a real canopy.
  grass:   { n: 1.00, pool: [['tuft',9],['scrub_a',6],['scrub_c',5],['scrub_d',4],
                             ['tree_b',5],['tree_c',4],['tree_d',3],['tree_a',3],
                             ['rock_a',2],['rock_b',2],['shrm_a',1]] },
};
function floraMix() {
  return FLORA_CLIMATE[(MAP && MAP.terrain) || 'grass'] || FLORA_CLIMATE.grass;
}
function pickWeighted(pool, r) {
  var tot = 0, i;
  for (i = 0; i < pool.length; i++) tot += pool[i][1];
  var t = r*tot;
  for (i = 0; i < pool.length; i++) { t -= pool[i][1]; if (t <= 0) return pool[i][0]; }
  return pool[pool.length-1][0];
}
var flora = [];
function genFlora(seed, n) {
  var rnd = mulberry32(seed ^ 0xF10AA);
  flora = [];
  /* DENSITY IS PART OF THE CLIMATE. A station deck and a garden world do not
     differ only in WHICH plants they carry, they differ in HOW MANY, and a
     station with a garden world's density reads as a garden world that happens
     to grow different weeds. */
  var mix = floraMix();
  n = Math.round(n * mix.n);
  for (var i = 0; i < n; i++) {
    var X, Z, street = 0;
    /* AVENUE PLANTING, then whatever survives in the lots. Street trees line
       the verge; everything else is what grows in the gaps between buildings,
       which is scrub and rubble rather than timber. */
    if (rnd() < 0.5) {
      var av = GRID.ax[(rnd()*GRID.ax.length)|0];
      var side = rnd() < 0.5 ? -1 : 1;
      X = av + side*(GRID.hw + PAVE*0.55 + rnd()*1.2);
      Z = -50 + rnd()*440;
      street = 1;
    } else {
      X = (rnd()-0.5)*FIELD_W*1.25;
      Z = -40 + rnd()*470;
    }
    // Nothing grows on a carriageway or a pavement. The verge is the first
    // place anything can stand.
    if (onStreet(X, Z, -PAVE + 0.4)) continue;
    var name = pickWeighted(mix.pool, rnd());
    var sp = FLORA_SPEC[name]; if (!sp) continue;
    flora.push({
      name: name, x: X, z: Z,
      /* A STREET TREE IS PRUNED AND A FIELD TREE IS NOT. The same six metre
         timber that reads as scenery on the outskirts stands taller than the
         shopfront behind it and blocks the lane it is planted beside, which is
         the one thing a street tree is never allowed to do. */
      h: (sp.h[0] + (sp.h[1]-sp.h[0])*rnd()) * (street ? 0.55 : 1),
      wr: sp.w[0] + (sp.w[1]-sp.w[0])*rnd(),
      rot: rnd()*6.283, tone: sp.tone, mat: MESH_MAT[name] || 'veg',
    });
  }
}
var _fv = [0,0,0], _floraSort = [];
var FLORA_FACE_BUDGET = 2600;
function queueFlora(out) {
  if (!MESHES || !flora.length) return;
  /* ── SORTED ON WORLD DISTANCE, NOT ON VIEW Z ──────────────────────────
     The budget is spent down this list, so whatever the list is ordered by
     decides which trees exist. View z changes when the camera TURNS - a tree
     forty metres to your left is at z=40 facing it and z=4 facing away - so
     turning on the spot reshuffled the whole order and trees at the tail
     switched on and off while nothing moved. World distance does not care
     which way you are looking, which is the whole point of a circle. */
  var R = CB.opt.viewRadius, R2 = R * R;
  _floraSort.length = 0;
  for (var i = 0; i < flora.length; i++) {
    var f = flora[i], m = MESHES[f.name];
    if (!m) continue;
    var fdx = f.x - cam.x, fdz = f.z - cam.z;
    var d2 = fdx*fdx + fdz*fdz;
    if (d2 > R2) continue;                     // outside the radius: not drawn
    if (!project(f.x, f.h*0.5, f.z, _fv)) continue;
    if ((f.h*focal)/_fv[2] < 5) continue;      // one divide, removes most of it
    _floraSort.push({ f: f, m: m, z: d2 });
  }
  _floraSort.sort(function (a, b) { return a.z - b.z; });
  var budget = FLORA_FACE_BUDGET;
  for (i = 0; i < _floraSort.length; i++) {
    var it = _floraSort[i];
    if (budget <= 0) break;
    budget -= it.m.f.length;
    pushMeshAt(it.m, it.f.x, it.f.z, it.f.h, it.f.h*it.f.wr, it.f.h*it.f.wr,
               it.f.rot, it.f.mat, it.f.tone, out);
  }
}

// ── the built environment, and the cover it provides ───────────────────────
// A feature still has a footprint, a height and a set of cover slots, and the
// AI still reads all three. Only what gets DRAWN at that spot is urban.
var props = [], cover = [];
function rect(cx, cz, w, d, rot) {
  var hw = w*0.5, hd = d*0.5, c = Math.cos(rot||0), s = Math.sin(rot||0);
  var o = [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]], r = [];
  for (var i = 0; i < 4; i++)
    r.push([cx + (o[i][0]*c - o[i][1]*s), cz + (o[i][0]*s + o[i][1]*c)]);
  return r;
}
/* COVER IS ARENA-ONLY, and this is where the two extents actually bite. A
   building outside the arena is still drawn - it is backdrop, and the haze
   eats it - but it offers nothing to claim, so no unit is ever given a reason
   to walk out there. The bound is enforced at the one function that creates
   cover rather than at each of its five call sites, because a bound with five
   copies is a bound with five chances to be forgotten. */
function addCover(x, z, faceX) {
  if (!inArena(x, z)) return;
  cover.push({ x: x, z: z, fx: faceX, by: null });
}
function genProps(seed) {
  var rnd = mulberry32(seed ^ 0x0B10C);
  props = []; cover = []; kitB = [];
  var i, j, k;
  var m = MAP || CB.mapFor('', 0);
  var plan = m.plan, lay = m.lay;

  /* ── The blocks ───────────────────────────────────────────────────────
     Each cell between two avenues and two cross streets gets a row of
     buildings set back from the pavement, with ALLEYS between them. The alleys
     are the point: they are the only way through a block that is not a street,
     which is what makes a flank possible without making it a walk in the open.

     A building carries four things and none of them is geometry for its own
     sake: floors counted FROM HEIGHT (a 14m block and a 40m block do not have
     the same number of storeys and drawing them as if they did makes a whole
     rank read as one model at two scales), a warm SHOPFRONT at street level,
     a cornice WIDER than the shaft so the roof is an edge rather than a cut,
     and a second offset mass turning the plan into an L. */
  CELLS.length = 0;
  var cellsX = [], cellsZ = [];
  for (i = 0; i < GRID.ax.length - 1; i++)
    cellsX.push([GRID.ax[i] + GRID.hw + PAVE, GRID.ax[i+1] - GRID.hw - PAVE]);
  cellsX.unshift([GRID.ax[0] - GRID.hw - PAVE - 120, GRID.ax[0] - GRID.hw - PAVE]);
  cellsX.push([GRID.ax[GRID.ax.length-1] + GRID.hw + PAVE,
               GRID.ax[GRID.ax.length-1] + GRID.hw + PAVE + 120]);
  for (j = 0; j < GRID.az.length - 1; j++)
    cellsZ.push([GRID.az[j] + GRID.hw + PAVE, GRID.az[j+1] - GRID.hw - PAVE]);
  /* THE NEAR CELL RUNS WELL BEHIND THE CAMERA. It stopped sixty metres short,
     so everything nearer than that was lawn - and the near ground is the
     largest thing on screen. A lot costs one quad whether it is sixty metres
     deep or two hundred. */
  cellsZ.unshift([GRID.az[0] - GRID.hw - PAVE - 210, GRID.az[0] - GRID.hw - PAVE]);
  cellsZ.push([GRID.az[GRID.az.length-1] + GRID.hw + PAVE,
               GRID.az[GRID.az.length-1] + GRID.hw + PAVE + 140]);

  /* ── One building ─────────────────────────────────────────────────────
     THE GLAZING BANDS AND THE WARM SHOPFRONT BAND ARE GONE. They were prisms
     wrapped around the shaft to SUGGEST storeys and a lit ground floor, which
     is what you do when the only tool you have is a coloured box. The facade
     textures are the actual thing - windows, shutters, brick courses, doors,
     and an emissive map that lights the right rectangles - so keeping the
     bands would be painting stripes over a picture of a wall.

     Four prisms per building now instead of nine or ten: the shaft, the L
     wing, the cornice and the parapet, plus roof plant. The detail moved from
     geometry into the surface, which is where it belongs and where it costs a
     draw rather than a sort. */
  /* ── One building, as modules ─────────────────────────────────────────
     THE PRISM AND ITS TEXTURED FACADE ARE GONE. What is left here is the
     FOOTPRINT and the COVER - the two things the simulation reads - and the
     building itself is emitted as kit modules by queueKitBuildings. That split
     is deliberate: the block generator decides where a building is and how big,
     the kit decides what it looks like, and neither needs to know the other's
     business.

     A FALLBACK BLOCK IS STILL PUSHED. The kit is fetched, so it can be late or
     absent, and a city of invisible buildings with working collision is the
     worst possible failure - you would walk into nothing. The plain block is
     drawn only while the kit is missing. */
  function building(bx, bz, bw, bd, bh) {
    /* ── SNAP THE FOOTPRINT TO WHOLE MODULES ──────────────────────────────
       The generator sizes a building in metres and the kit builds it in
       four-metre tiles, and nothing was reconciling the two: a 17m frontage
       became four modules of 4m laid across 17m of lot, so every building
       overhung its plot by up to half a module. On the ground that reads as
       walls standing slightly in the road; from above it is unmistakable, and
       it is the reason the blocks looked misaligned in the orbit view.

       Snapped here rather than in the placer, so the COLLISION BOX and the
       COVER SLOTS use the same numbers the walls do. Making the drawing agree
       with itself while the simulation used the old footprint would be worse
       than the overhang: men would take cover against a wall that is not
       where they think it is. */
    bw = Math.max(1, Math.round(bw / MOD_M)) * MOD_M;
    bd = Math.max(1, Math.round(bd / MOD_M)) * MOD_M;
    bh = Math.max(1, Math.round(bh / MOD_M)) * MOD_M;
    var seed = Math.abs(Math.round(bx*7919 + bz*104729 + bw*31));
    kitBuilding(bx, bz, bw, bd, bh, seed);
    props.push({ poly: rect(bx, bz, bw, bd, 0), y0: 0, h: bh, mat: 'conc',
                 kitOnly: 1 });

    /* COVER AT THE CORNERS, FACING THE STREET IT IS ON. A corner is the only
       piece of cover in a city that lets a man see down a lane without
       standing in it, and it is where an urban firefight actually happens. */
    var av = nearestAvenue(bx);
    var toward = av < bx ? -1 : 1;
    addCover(bx + toward*(bw*0.5 + 1.4), bz - bd*0.42, toward);
    addCover(bx + toward*(bw*0.5 + 1.4), bz + bd*0.42, toward);
    addCover(bx + toward*(bw*0.5 + 0.8), bz + (rnd()-0.5)*bd*0.4, toward);
  }
  function nearestAvenue(x) {
    var best = GRID.ax[0];
    for (var q = 1; q < GRID.ax.length; q++)
      if (Math.abs(GRID.ax[q]-x) < Math.abs(best-x)) best = GRID.ax[q];
    return best;
  }

  for (i = 0; i < cellsX.length; i++) {
    for (j = 0; j < cellsZ.length; j++) {
      var cx0 = cellsX[i][0], cx1 = cellsX[i][1];
      var cz0 = cellsZ[j][0], cz1 = cellsZ[j][1];
      var cw = cx1-cx0, cd = cz1-cz0;
      if (cw < 14 || cd < 14) continue;
      CELLS.push([cx0, cx1, cz0, cz1]);
      var near = Math.abs((cx0+cx1)*0.5) < 130 && (cz0+cz1)*0.5 < 320;
      // The overrun cells are FLOORED BUT NOT BUILT ON. They exist so the
      // ground beside and behind the camera is city rather than lawn.
      if (cd > 150 || cw > 150) continue;
      // Two or three buildings down the cell, with an alley between each.
      /* THE SECTOR SETS THE LOT SIZE AND THE LAYOUT SETS HOW MUCH OF THE BLOCK
         IS BUILT ON. A foundry has few big sheds set well back; a bazaar has
         many small frontages hard against the pavement; an archipelago colony
         leaves a third of every block as empty lot. */
      var n = Math.max(1, Math.round((cd > 70 ? 3 : 2) * plan.den / plan.lot));
      var alley = (5 + rnd()*4) * plan.set;
      var slot = (cd - alley*(n-1)) / n;
      for (k = 0; k < n; k++) {
        if (rnd() > lay.fill) continue;      // empty lot
        var bz = cz0 + slot*(k+0.5) + alley*k;
        var bw = cw * (0.62 + rnd()*0.26) * clamp(plan.lot, 0.5, 1.15);
        var bd = slot * (0.72 + rnd()*0.20);
        // Pushed toward the avenue side of the cell so the street has a wall.
        var side = (cx0 + cx1) * 0.5;
        var bx = side + (rnd()-0.5)*(cw - bw)*0.5;
        /* HEIGHT RISES AWAY FROM THE CONTESTED AVENUE. The centre of the
           field is where the fighting is and where the camera has to be able
           to see; a forty metre wall on both sides of it is a canyon that
           swallows the whole engagement. Frontage on the middle avenue is low
           rise, and the city gets taller behind it - which is also how a real
           one is built, so the constraint costs nothing. */
        var fromMid = Math.abs(bx) / 90;
        /* TERRACED STEPS BACK AS IT CLIMBS, so height also rises with depth on
           those colonies and stays flat on the others. One term, read from the
           layout, rather than a second generator. */
        var terr = m.layout === 'terraced' ? clamp(bz / 340, 0, 1) * 14 : 0;
        var bh = (9 + clamp(fromMid, 0, 1)*(near ? 14 : 30) + rnd()*(near ? 7 : 14) + terr)
                 * plan.h;
        building(bx, bz, bw, bd, bh);
      }
    }
  }

  /* ── Street furniture ─────────────────────────────────────────────────
     Barriers at the intersections rather than in an unbroken line down a
     verge. An unbroken line is a trench; what a city fight actually has is
     cover at the corners and nothing in between, which is why crossing a
     street costs something. */
  for (i = 0; i < GRID.ax.length; i++) {
    for (j = 0; j < GRID.az.length; j++) {
      for (k = 0; k < 4; k++) {
        var sx = (k & 1) ? 1 : -1, sz = (k & 2) ? 1 : -1;
        var bx2 = GRID.ax[i] + sx*(GRID.hw + 1.6);
        var bz2 = GRID.az[j] + sz*(GRID.hw + 2.4);
        if (rnd() < 0.75) {
          props.push({ poly: rect(bx2, bz2, 1.9, 6.2), y0: 0, h: 1.1, mat: 'conc' });
          addCover(bx2 + sx*1.7, bz2, sx);
        }
        // Rubble where a corner has been fought over.
        if (rnd() < 0.5)
          props.push({ poly: rect(bx2 + sx*2.6, bz2 + sz*3.4, 2.4, 2.2, rnd()),
                       y0: 0, h: 0.5 + rnd()*0.6, mat: 'conc' });
      }
    }
    // Lamps down each avenue.
    /* The prism lamps are gone. The kit ships Lamp1 and Lamp2, and drawing
       both put a grey gantry inside every real lamp post. */
  }
  /* ── THE BURNT HAULER IS GONE ─────────────────────────────────────────
     It was two untextured prisms - a 4.4x10.6x2.5 body and a 3.9x3.6x3.3 cab
     in 'rust' - parked across the centre avenue, and it was the last piece of
     invented box geometry standing in a street built entirely out of a kit.
     Next to real kerbs, real lamps and real shopfronts it reads as exactly
     what it is: a brown crate somebody left in the road.

     ITS COVER SLOTS GO WITH IT, and that is the part worth arguing about. The
     Reach's rule when its wireframe camps were removed was to keep the data
     and the AI that reads it and stop drawing the geometry. That is right when
     the thing being removed was ABSTRACT - a camp is a claim over ground and
     the ground can carry it instead. It is wrong here: a cover slot is a
     specific place a man crouches BEHIND something, and a slot with nothing at
     it puts two soldiers kneeling in open tarmac in the middle of a road.
     Invisible cover is worse than no cover.

     WHAT IS LOST, PLAINLY: this was the only hard cover in the open and
     therefore the only reason anybody was ever in the middle of a street. The
     avenue is now crossed rather than fought over. Getting it back needs a
     vehicle MESH, not another prism - and the modern pack has trucks and
     forklifts that the bake already produces and the shipping subset excludes.
     That is the fix, and it is an asset decision rather than a code one. */

  cover.sort(function (p, q) { return p.x - q.x; });
}

/* ── Contact shadows ──────────────────────────────────────────────────────
   NOTHING IN THIS SCENE TOUCHED THE GROUND. Every prism was a flat fill
   standing on another flat fill, with a hard edge between them and no
   transition, so a forty metre tower and a one metre barrier sat on the plane
   in exactly the same way - which is to say, hovering.

   city.js has had the fix since it shipped and this did not: a dark quad on
   the plate, inset from the footprint, drawn before the mass. It is one fill
   per prop, it is the single cheapest thing in this renderer per unit of depth
   bought, and it is why the city view's towers look planted and these did not.

   DRAWN ON THE GROUND PASS, NOT IN THE SORTED QUEUE. A shadow is part of the
   surface: it has to go under everything, including under the men standing in
   front of it, and a depth-sorted quad at ground level would sort against
   those men rather than beneath them. */
var _ao = [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
function drawContactShadows() {
  var n = 0;
  ctx.beginPath();
  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    // Only things that stand ON the ground cast one. A glazing band nine
    // metres up does not, and its footprint would double-darken the wall it
    // is wrapped around.
    if (p.y0 > 0.35) continue;
    var poly = p.poly, k, ok = true;
    // Spread with height, and softened by drawing the pad rather than the
    // footprint: a tall mass throws further than a kerbstone.
    var pad = Math.min(2.6, 0.35 + p.h * 0.055);
    var cx = 0, cz = 0;
    for (k = 0; k < poly.length; k++) { cx += poly[k][0]; cz += poly[k][1]; }
    cx /= poly.length; cz /= poly.length;
    for (k = 0; k < poly.length && k < 8; k++) {
      var dx = poly[k][0] - cx, dz = poly[k][1] - cz;
      var L = Math.hypot(dx, dz) || 1;
      if (!project(poly[k][0] + dx/L*pad, 0.02, poly[k][1] + dz/L*pad, _ao[k])) {
        ok = false; break;
      }
    }
    if (!ok) continue;
    ctx.moveTo(_ao[0][0], _ao[0][1]);
    for (k = 1; k < poly.length && k < 8; k++) ctx.lineTo(_ao[k][0], _ao[k][1]);
    ctx.closePath();
    n++;
  }
  if (!n) return;
  /* ── AND THEY FADE AS THE CAMERA CLIMBS ────────────────────────────────
     A contact shadow is a cheat that works from ONE place. It is a flat pad
     around a footprint standing in for the darkening where a mass meets the
     ground, and from eye level that is exactly what it looks like. From
     overhead it is a black rectangle offset from a building, and a city seen
     from above turns into acres of grey with black mats scattered over it -
     which is most of what is wrong with the skyview and is not a texture
     problem at all.

     Faded on pitch rather than removed, because at the pitch the shipped
     camera actually uses it is doing its job and it is the cheapest depth in
     the renderer. The bench's orbit and free cams get progressively less of
     it as they climb, which is the honest amount: the cheat is worth what the
     angle it was authored for is worth. */
  var lift = clamp((cam.pitch + 0.62) / 0.55, 0.10, 1);
  ctx.fillStyle = 'rgba(0,0,0,' + (0.34 * lift).toFixed(3) + ')';
  ctx.fill();
}

/* ── Buildings you cannot walk through ────────────────────────────────────
   MEN WERE WALKING THROUGH BLOCKS. Cover slots sit against the outside of a
   building, so the line LOOKED right - and the path to a slot on the far side
   went straight through forty metres of concrete, which is visible the moment
   you free-cam and is nonsense the rest of the time.

   A BLOCK GRID IS THE ONE CASE WHERE THIS IS CHEAP. Every building is an axis
   aligned box on a street grid, so collision is a rectangle test - no polygons,
   no sweeps, no broadphase beyond the list. Only masses that reach above knee
   height block: a kerb, a barrier and a planter are cover, not walls, and a
   soldier who cannot step over a 0.9m planter looks worse than one who walks
   through a wall.

   SLIDE, DO NOT STOP. A unit refused both axes at once gets stuck against a
   corner and stands there for the rest of the engagement; refused one axis at
   a time it slides along the frontage, which is also what a man does. */
var solids = [];
function buildSolids() {
  solids = [];
  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    if (p.h < 2.2 || p.y0 > 0.4) continue;      // cover and trim are not walls
    var poly = p.poly, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (var k = 0; k < poly.length; k++) {
      if (poly[k][0] < x0) x0 = poly[k][0];
      if (poly[k][0] > x1) x1 = poly[k][0];
      if (poly[k][1] < z0) z0 = poly[k][1];
      if (poly[k][1] > z1) z1 = poly[k][1];
    }
    if ((x1-x0) < 1.4 && (z1-z0) < 1.4) continue;   // lamp posts are not walls
    solids.push([x0 - 0.45, x1 + 0.45, z0 - 0.45, z1 + 0.45]);
  }
}
function blocked(x, z) {
  for (var i = 0; i < solids.length; i++) {
    var s2 = solids[i];
    if (x > s2[0] && x < s2[1] && z > s2[2] && z < s2[3]) return true;
  }
  return false;
}

var _propCull = 0;
function queueProps(out) {
  var R = CB.opt.viewRadius, R2 = R * R;
  _propCull = 0;
  for (var i = 0; i < props.length; i++) {
    var p = props[i], poly = p.poly;
    /* Centre distance against the radius plus the prop's own reach, so a long
       block is not culled because its middle is just outside. */
    var cx = (poly[0][0] + poly[2][0]) * 0.5, cz = (poly[0][1] + poly[2][1]) * 0.5;
    var dx = cx - cam.x, dz = cz - cam.z;
    var reach = Math.abs(poly[2][0] - poly[0][0]) + Math.abs(poly[2][1] - poly[0][1]);
    var lim = R + reach;
    if (dx*dx + dz*dz > lim*lim) { _propCull++; continue; }
    // A building's block is the KIT's job unless the kit never arrived.
    if (p.kitOnly && KIT) continue;
    pushPrism(p.poly, p.y0, p.h, p.mat, out, p.cap !== false, p.tex);
  }
}

// ── the fight ──────────────────────────────────────────────────────────────
// LOCAL AND DECIDING NOTHING, same rule as reach-battle.js. Two POLITIES, and
// they cannot be the same one: a faction does not fight itself, so the picker
// refuses the pairing rather than drawing two identical uniforms and hoping
// the player can tell which line is theirs.
/* ── Who turns up to a city fight ────────────────────────────────────────
   NO SHIELD TROOPERS, AND THE REASON IS THE SHIELD TROOPER'S OWN JOB. v1.7.4.0
   settled what he is for: a shield is for stopping the thing that CLOSES, which
   is why a charging class is weighted at half distance and wins out to twice
   the range. A city fight between two polities has no charging class in it -
   both lines are riflemen behind cover trading fire across a street - so he
   arrives with nothing to bash and falls through to the hold branch, which is
   exactly the state that produced the sideways drift.

   He is not banned as a unit; he is absent because nothing here is his target.
   Put a melee class on a city line and this table is where he comes back. */
var CLS = { inf: 'assault', eng: 'engineer' };
var units = [], rounds = [], nades = [], nextI = 0, casualties = { 1: 0, '-1': 0 };
var simT = 0;

/* WITHOUT THE SHIELD THE LINE IS ONE SILHOUETTE, so the engineer's share goes
   up rather than his 10% being handed to the riflemen. He is the only other
   shape on the field and he carries the turret, which is the only thing on a
   city line that is not a man. */
function rollClass(rnd) {
  return rnd() < 0.78 ? 'inf' : 'eng';
}
function spawn(side, fac, rnd) {
  var cls = rollClass(rnd);
  var i = nextI++;
  // A man spawned inside a wall can never leave it, and collision is what
  // makes that permanent rather than merely odd.
  var sx = 0, sz = 0, tries = 0;
  do {
    /* CLOSER THAN BEFORE, BECAUSE COLLISION LENGTHENED THE WALK. Men used to
       cross a block by going through it; now they go round, and the sweep
       measured the difference - every front engaged inside thirty seconds
       before collision and six of them needed forty-five after. Moving the
       spawn in restores the old time to contact rather than making the check
       wait for a slower version of the same fight. */
    /* MEASURED OFF THE ARENA AND THE FRONT, the way every depth offset in the
       Reach is measured off CL.front. The old literals - +/-68 to 102 across a
       350m band - were the hardcoded grid's numbers and put a spine colony's
       whole line inside its own buildings and an archipelago's outside the
       city entirely. */
    var half = (ARENA.x1 - ARENA.x0) * 0.5;
    sx = frontX - side * (half * (0.46 + rnd()*0.34));
    sx = clamp(sx, ARENA.x0 + 6, ARENA.x1 - 6);
    sz = ARENA.z0 + 8 + rnd() * (ARENA.d - 16);
  } while (blocked(sx, sz) && ++tries < 24);
  units.push({
    i: i, side: side, fac: fac, cls: cls,
    x: sx, z: sz,
    hp: cls === 'eng' ? 110 : 130,
    st: 'advance', hdg: side === 1 ? Math.PI/2 : -Math.PI/2,
    tgt: null, cov: null, fireAt: -1e9, hitT: 0, dead: 0, deadAt: 0,
    // Staggered so a rank does not stand up as one man.
    boundAt: -1e9, boundIv: 3200 + rnd()*4200,
    stall: 0, detour: 0, detSide: 1,
    sk: skinFor(fac, i), kt: kitFor(fac, i),
    spd: 5.2 + rnd()*2.4, jit: rnd()*1000,
  });
}
function resetSim(seed) {
  units = []; rounds = []; nades = []; nextI = 0; simT = 0;
  casualties = { 1: 0, '-1': 0 };
  frontX = 0; frontV = 0;
  var rnd = mulberry32(seed ^ 0x1234);
  for (var i = 0; i < cover.length; i++) cover[i].by = null;
  for (i = 0; i < CB.opt.perSide; i++) { spawn(1, CB.sides.home, rnd); spawn(-1, CB.sides.away, rnd); }
}
function nearestEnemy(u) {
  var best = null, bd = 1e9;
  for (var i = 0; i < units.length; i++) {
    var e = units[i];
    if (e.side === u.side || e.dead) continue;
    var dx = e.x - u.x, dz = e.z - u.z, d = dx*dx + dz*dz;
    if (d < bd) { bd = d; best = e; }
  }
  /* SIXTY METRES, DOWN FROM A HUNDRED AND THIRTY. An urban sightline is a
     street width and a block length, not a field, and a line that engages at
     field range never bothers to close - which is the whole behaviour an urban
     front is supposed to show. */
  return bd < 62*62 ? best : null;
}
/* ── The front ────────────────────────────────────────────────────────────
   A LINE THAT DOES NOT MOVE IS A PICTURE THAT HAS STOPPED REPORTING. The whole
   reason to draw a city fight rather than a field one is that ground changes
   hands a building at a time, and that only shows if the cover a side can
   claim moves with it.

   frontX is where the two lines meet, in world x. It drifts toward whichever
   side is winning the exchange, bounded to the middle avenue's neighbours so
   the fight never leaves the blocks entirely. Cover is claimable only on your
   own side of it, so when the front moves a whole rank of corners opens up and
   the line BOUNDS forward to take them - which is the back and forth. */
var frontX = 0, frontV = 0;
function updateFront(dt) {
  // Pressure is a difference of losses, damped hard. A single casualty must
  // not move a city block.
  var d = (casualties[-1] - casualties[1]) * 0.55;
  /* CLAMPED TO THE ARENA, NOT TO A LITERAL. It was +/-58 on every world, which
     was a number picked when the grid was the hardcoded [-72, 0, 72] and has
     been wrong for every layout since: a spine colony's avenues sit at +/-107
     and its front could never reach either of them, so one side could not lose
     its own street no matter how badly it was beaten. */
  var lo = ARENA.x0 + FRONT_INSET, hi = ARENA.x1 - FRONT_INSET;
  var target = clamp(d, lo, hi);
  frontV += (target - frontX) * 0.00018 * dt;
  frontV *= 0.94;
  frontX = clamp(frontX + frontV * dt * 0.06, lo, hi);
}
/* ── Taking ground, one corner at a time ──────────────────────────────────
   THE FIRST VERSION SCORED COVER BY DISTANCE AND THE WHOLE ARMY PARKED IN THE
   BACK ROW. It is obvious afterwards and it was not before: the nearest free
   slot to a man who has just spawned is the one behind him, so fifty-two units
   took the rearmost corners, none of them ever came within sixty metres of an
   enemy, and the harness reported zero casualties after thirty seconds. That
   report is the only reason it was caught, because the frame looked fine.

   So the score is FRONT FIRST, DISTANCE SECOND. How far a slot is from the
   front dominates; how far it is from the man breaks ties between slots at
   similar depth. A rifleman still takes the corner beside him over an
   identical one forty metres up the street, and he will not sit at the back of
   the block while there is a corner on the line going spare. */
function coverScore(u, c) {
  var dx = c.x - u.x, dz = c.z - u.z;
  var toFront = c.x - frontX;
  return toFront*toFront + (dx*dx + dz*dz) * 0.16;
}
function claimable(u, c) {
  if (c.by !== null) return false;
  // Only cover if it faces the enemy, only claimable on your side of the front.
  if (u.side === 1 ? c.fx < 0 : c.fx > 0) return false;
  return u.side === 1 ? (c.x < frontX + 6) : (c.x > frontX - 6);
}
function bestCover(u) {
  var best = null, bs = 1e18;
  for (var i = 0; i < cover.length; i++) {
    var c = cover[i];
    if (!claimable(u, c)) continue;
    var sc = coverScore(u, c);
    if (sc < bs) { bs = sc; best = c; }
  }
  return best;
}
function takeCover(u) {
  if (u.cov) {
    /* A slot the front has passed over is not cover any more, it is behind the
       enemy line. Dropping it is what makes a losing side fall back rather
       than stand and be overrun in place. */
    var own = u.side === 1 ? (u.cov.x < frontX + 10) : (u.cov.x > frontX - 10);
    if (!own) { u.cov.by = null; u.cov = null; }
    else return u.cov;
  }
  var best = bestCover(u);
  if (best) { best.by = u.i; u.cov = best; }
  return best;
}
/* BOUNDING. A man in cover looks up every few seconds and, if there is a free
   slot meaningfully closer to the front, goes to it. This is the movement:
   nobody crosses a street in the open because there is somewhere to be, they
   cross it because the next corner opened up. It is also why the line visibly
   flows back when it is losing - the front moves, the slots they were holding
   stop being on their side, and the whole rank re-seeks at once. */
function maybeBound(u) {
  if (u.st !== 'hold' || !u.cov) return;
  if (simT - u.boundAt < u.boundIv) return;
  u.boundAt = simT;
  var here = Math.abs(u.cov.x - frontX);
  var best = null, bs = 1e18;
  for (var i = 0; i < cover.length; i++) {
    var c = cover[i];
    if (!claimable(u, c)) continue;
    if (Math.abs(c.x - frontX) > here - 9) continue;   // not enough of a gain
    var sc = coverScore(u, c);
    if (sc < bs) { bs = sc; best = c; }
  }
  if (!best) return;
  u.cov.by = null;
  best.by = u.i; u.cov = best; u.st = 'advance';
}

function step(dt) {
  simT += dt;
  updateFront(dt);
  var i, u;
  for (i = 0; i < units.length; i++) {
    u = units[i];
    if (u.dead) { if (simT - u.deadAt > 14000) { u._gone = 1; } continue; }
    if (u.hitT > 0) u.hitT -= dt;
    u.tgt = (u.tgt && !u.tgt.dead) ? u.tgt : nearestEnemy(u);
    var wantX = frontX - u.side * (GRID.hw + 4);
    maybeBound(u);
    if (u.st === 'advance') {
      var c = takeCover(u);
      var tx = c ? c.x : wantX, tz = c ? c.z : u.z;
      var dx = tx - u.x, dz = tz - u.z, L = Math.hypot(dx, dz);
      if (L < 1.2) { u.st = 'hold'; }
      else {
        /* ── Wall following, because axis rejection alone traps them ───────
           SLIDING ON ONE AXIS IS NOT ENOUGH AND THE SWEEP PROVED IT. With
           collision in, one front stopped engaging entirely and the counters
           said why: thirty-three of fifty-two units still advancing after
           forty-five seconds, thirty-two of them more than three metres from
           the cover they had claimed. A man walking at a wall that lies across
           his path slides along it - and if the wall runs the wrong way he
           slides along it FOREVER, or sits in a concave corner where both axes
           are refused and never moves again.

           COLLISION THAT TRAPS UNITS IS WORSE THAN NO COLLISION. So progress
           is measured, and a unit that has not made any for a second and a
           half commits to a DETOUR: a fixed perpendicular push, one side
           chosen and held, for long enough to clear the frontage. Holding the
           side is the important part - re-choosing every frame is how you get
           a man oscillating in a doorway. */
        var spd = u.spd*dt/1000;
        var stepX = dx/L*spd, stepZ = dz/L*spd;
        if (u.detour > 0) {
          u.detour -= dt;
          // perpendicular to the desired heading, on the committed side
          stepX = -dz/L*spd*u.detSide;
          stepZ =  dx/L*spd*u.detSide;
        }
        var moved = 0;
        if (!blocked(u.x + stepX, u.z)) { u.x += stepX; moved += Math.abs(stepX); }
        if (!blocked(u.x, u.z + stepZ)) { u.z += stepZ; moved += Math.abs(stepZ); }
        u.stall = moved < spd*0.35 ? u.stall + dt : 0;
        if (u.stall > 1500 && u.detour <= 0) {
          u.detour = 1400 + (u.i % 5) * 260;
          // The side is taken from the unit's index rather than rolled, so two
          // men in the same doorway do not both pick the same way out.
          u.detSide = (u.i % 2) ? 1 : -1;
          u.stall = 0;
        }
        u.hdg = Math.atan2(dx, dz);
      }
    } else {
      // Facing is snapped back across the street once in cover: a man behind a
      // barrier is looking over it, not at the man beside him.
      u.hdg = u.side === 1 ? Math.PI/2 : -Math.PI/2;
      if (u.tgt) {
        var cd = u.cls === 'eng' ? 1200 : 1050;
        if (simT - u.fireAt > cd + (u.jit % 400)) {
          u.fireAt = simT;
          rounds.push({ x: u.x, z: u.z, tx: u.tgt.x, tz: u.tgt.z, t: 0,
                        dur: 90 + Math.hypot(u.tgt.x-u.x, u.tgt.z-u.z)*2.4,
                        side: u.side, tgt: u.tgt,
                        dmg: u.cls === 'eng' ? 26 : 30 });
        }
      }
    }
  }
  for (i = rounds.length - 1; i >= 0; i--) {
    var r = rounds[i];
    r.t += dt;
    if (r.t >= r.dur) {
      var e = r.tgt;
      if (e && !e.dead) {
        // Cover is worth something, which is the only reason the AI seeks it.
        var mitig = e.cov ? 0.55 : 1.0;
        if (Math.random() < 0.62) {
          e.hp -= r.dmg*mitig;
          e.hitT = 260;
          if (e.hp <= 0) {
            e.dead = 1; e.deadAt = simT; casualties[e.side]++;
            if (e.cov) { e.cov.by = null; e.cov = null; }
          }
        }
      }
      rounds.splice(i, 1);
    }
  }
  for (i = units.length - 1; i >= 0; i--) if (units[i]._gone) units.splice(i, 1);
  // Reinforcement: both sides are topped back up, because a mockup that runs
  // out of men after ninety seconds cannot be looked at.
  if (CB.opt.reinforce) {
    var live = { 1: 0, '-1': 0 };
    for (i = 0; i < units.length; i++) if (!units[i].dead) live[units[i].side]++;
    for (var s = -1; s <= 1; s += 2) {
      if (live[s] < CB.opt.perSide) {
        spawn(s, s === 1 ? CB.sides.home : CB.sides.away, Math.random);
      }
    }
  }
}
function animOf(u) {
  var c = CLS[u.cls];
  if (u.dead) return c + '_death';
  if (u.hitT > 0) return c + '_hitted';
  if (u.st === 'advance') return c + '_walk_prepared';
  var since = simT - u.fireAt;
  if (since < 420) return c + '_sit_single_shot';
  return c + '_sit_prepare';
}
function frameOf(u, anim) {
  var n = TR().FRAMES[anim] || 1;
  if (u.dead) return Math.min(n-1, ((simT - u.deadAt)/110)|0);
  if (u.hitT > 0) return Math.min(n-1, ((260 - u.hitT)/90)|0);
  var since = simT - u.fireAt;
  if (since < 420 && u.st !== 'advance') return Math.min(n-1, (since/105)|0);
  var fps = u.st === 'advance' ? 9 : 5;
  return ((simT*0.001*fps + u.i*0.37)|0);
}
var _up = [0,0,0], _uf = [0,0,0];
function queueUnits(out) {
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    if (!project(u.x, 0, u.z, _up)) continue;
    var anim = animOf(u);
    if (!TR().FRAMES[anim]) continue;
    /* CLAIM ONLY WHAT CAN ACTUALLY BE PAINTED. Asking after the fact takes the
       unit off every path and it is drawn as neither. */
    if (!TR().ready(anim)) { TR().sheet(anim); continue; }
    /* SCALE AND CUTOFF COME OFF THE SHEET, not off a constant sized for a
       rifleman. g.unit is that sheet's pixels per world unit and g.ch its cell
       height; forcing one figure on every sheet makes whichever lost the
       argument permanently the wrong size. */
    var g = TR().geom(anim);
    var scale = focal/(_up[2]*g.unit);
    if (scale*g.ch < 2) continue;       // too small to read: skip
    project(u.x + Math.sin(u.hdg)*4, 0, u.z + Math.cos(u.hdg)*4, _uf);
    out.push({ z: _up[2], kind: 'unit', a: anim, f: frameOf(u, anim),
               x: _up[0], y: _up[1], s: scale,
               // Mirror AGAINST the way the sheet is drawn, not merely when the
               // unit faces left: the Hound's art faces left and inverts this.
               flip: g.faceLeft ? ((_uf[0] - _up[0]) > 0) : ((_uf[0] - _up[0]) < 0),
               fac: u.fac, sk: u.sk, kt: u.kt });
  }
}

// ── frame ──────────────────────────────────────────────────────────────────
var _queue = [];
function paintSky() {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgba(PAL.zenith || [12,17,30], 1));
  g.addColorStop(0.60, rgba(PAL.sky, 1));
  g.addColorStop(1, rgba(PAL.haze, 1));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
/* The horizon wash. Its onset is tied to the view radius so the fog is already
   solid where the geometry stops - see the note on CB.opt.viewRadius. */
function paintHaze() {
  var hy = horizonY();
  if (hy > H) return;
  /* THE FOG CLOSES WHERE THE GEOMETRY STOPS. The screen row at which the
     ground reaches the view radius is computed rather than guessed, so the
     wash is already solid by the time there is nothing left to draw. Wind the
     radius down and the fog comes in with it; nothing has to be re-tuned,
     because the two numbers are one number.

     Solid from the horizon down to that row, then falling off toward the
     camera, which is the profile smoke has: thick in the distance and thin
     where you are standing. */
  var R = CB.opt.viewRadius;
  var yR = H;
  var eye = cam.y;
  if (eye > 0.05) {
    // invert the ground mapping: which screen y is `R` metres away
    var dy = -eye / R * Math.hypot(1, 0);
    var t = (focal * Fv[1] - dy * 0) ;
    // solve (H/2 - y)*U1 + focal*F1 = -eye/R  for y
    var target = -eye / R;
    if (Math.abs(Uv[1]) > 1e-6) yR = H * 0.5 - (target - focal * Fv[1]) / Uv[1];
  }
  yR = clamp(yR, hy + 8, H);
  var y0 = Math.max(0, hy - 40);
  var g = ctx.createLinearGradient(0, y0, 0, Math.min(H, yR + (H - yR) * 0.55));
  g.addColorStop(0, rgba(PAL.haze, 0.0));
  g.addColorStop(0.16, rgba(PAL.haze, CB.opt.fog));
  g.addColorStop(0.55, rgba(PAL.haze, CB.opt.fog * 0.55));
  g.addColorStop(1, rgba(PAL.haze, 0));
  ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
  void t;
}
function drawRounds() {
  if (!rounds.length) return;
  for (var pass = 0; pass < 2; pass++) {
    var side = pass ? -1 : 1;
    ctx.beginPath();
    var any = false;
    for (var i = 0; i < rounds.length; i++) {
      var r = rounds[i];
      if (r.side !== side) continue;
      var k = r.t/r.dur, k0 = Math.max(0, k - 0.16);
      var ax = r.x + (r.tx-r.x)*k0, az = r.z + (r.tz-r.z)*k0;
      var bx = r.x + (r.tx-r.x)*k,  bz = r.z + (r.tz-r.z)*k;
      if (!project(ax, 1.15, az, _sq[0])) continue;
      if (!project(bx, 1.15, bz, _sq[1])) continue;
      ctx.moveTo(_sq[0][0], _sq[0][1]); ctx.lineTo(_sq[1][0], _sq[1][1]);
      any = true;
    }
    if (!any) continue;
    ctx.strokeStyle = side === 1 ? 'rgba(255,216,152,0.85)' : 'rgba(255,150,112,0.85)';
    ctx.lineWidth = 1; ctx.stroke();
  }
}
function frame() {
  camBasis();
  paintSky();
  var P0 = pats();
  bandPass(P0.grass, 0, null, 1, rgba(mix3(PAL.ground, PAL.haze, 0.62), 1));
  /* SECOND PASS, AND buildPatterns HAS ALWAYS BUILT THIS PATTERN WITHOUT ANYONE
     DRAWING IT. Measured, the tinted base patch spans luminance 41 to 65 - a
     24-value range - which is the palette crush doing its job and is also why
     a plain reads as a flat mat rather than as ground. The rock patch at a
     different tile size and a third alpha puts the variation back without a
     second texture, a second load or a second licence. */
  ctx.save();
  /* Grain, at a third alpha rather than a third of the surface. Enough to
     break a flat fill up, not enough to read as texture in its own right. */
  ctx.globalAlpha = 0.26;
  bandPass(P0.scrub, 0, null, 3.2, rgba(PAL.far, 1), 260);
  /* A THIRD PASS AT A HUNDRED-METRE TILE WAS HERE AND IT IS GONE, and the
     reason is measurement rather than taste. It was meant to add broad light
     and shade under the grain, on the argument that one frequency never looks
     like ground - which is true. It cost 60ms of a 240ms ground stage under
     cairo for an effect at a fifth alpha, underneath a haze already sitting at
     three quarters. Worst value of the three passes by a wide margin.

     Kept as a note rather than deleted silently, because the ARGUMENT for it
     was sound and somebody will have it again. If broad variation is wanted,
     it has to come from something that is not a third full-plane tiled fill. */
  ctx.restore();
  drawRoad();
  drawContactShadows();
  paintHaze();
  /* THE SKYLINE IS THE HOLDER'S, NOT THE ATTACKER'S. It was drawn in
     CB.sides.home's colour, which is whoever happens to be listed first -
     so a city changed colour when the roster was reordered, and the far
     towers claimed to belong to an army rather than to the place. */
  drawTowers((facRow(MAP && MAP.holder ? MAP.holder : CB.sides.home) || {}).line
             || [84,148,236]);
  _queue.length = 0;
  queueProps(_queue);
  queueKitBuildings(_queue);
  queueKitStreet(_queue);
  queueFlora(_queue);
  queueUnits(_queue);
  _queue.sort(function (a, b) { return b.z - a.z; });   // back to front
  ctx.imageSmoothingEnabled = false;
  for (var i = 0; i < _queue.length; i++) {
    var q = _queue[i];
    if (q.kind === 'face') { paintFace(q); continue; }
    TR().drawAnchored(ctx, q.a, q.f, q.x, q.y, q.s, q.fac, q.flip, q.sk, q.kt);
  }
  ctx.imageSmoothingEnabled = true;
  drawRounds();
}

// ── cameras ────────────────────────────────────────────────────────────────
// THE PACK IS SINGLE FACING AND THE CAMERA IS WHERE THAT GETS PAID FOR. A
// profile sprite is correct from either flank and from nowhere else; the flip
// buys two of the eight rotations and the remaining six do not exist. So
// 'flank' holds the arc where the art is right, and 'orbit' deliberately does
// not, so the failure can be looked at rather than argued about.
var SAFE_YAW = 0.62;   // radians either side of straight down the street
var camMode = 'flank', autoT = 0;
function yawOffAxis() {
  var y = Math.abs(((cam.yaw + Math.PI) % (2*Math.PI)) - Math.PI);
  return Math.min(y, Math.abs(Math.PI - y));
}
/* ── The cut, which is the Reach's cinematic with a street to stand in ────
   Orbit and the locked rig are GEOMETRIC: neither one knows where anything
   interesting is. The Reach solves that with a mode that tracks hotspots and
   cuts between them, and notes the constraint that decides the framing - the
   art is profile only, so the camera picks one of the two FLANKS with a little
   jitter rather than a random yaw, which keeps every sprite in a pose the pack
   actually has. Identical here, and cheaper, because a city already has the
   place to stand: the contested avenue runs the length of the fight, so a cut
   is a choice of z rather than a choice of position. */
var cine = { z: 40, hold: 0, side: 1 };
function pickHotspotZ() {
  /* The densest knot of men still fighting, weighted toward the ones actually
     in contact. Two passes over a list of fifty-two, once every six seconds. */
  var sz = 0, n = 0, i, u;
  for (i = 0; i < units.length; i++) {
    u = units[i];
    if (u.dead || !u.tgt) continue;
    sz += u.z; n++;
  }
  if (n >= 4) return sz / n;
  for (i = 0; i < units.length; i++) {
    u = units[i];
    if (u.dead) continue;
    sz += u.z; n++;
  }
  return n ? sz / n : (ARENA.z0 + ARENA.d * 0.35);
}
function updateCam(dt) {
  autoT += dt;
  if (camMode === 'flank') {
    /* ── FIXED, AND THAT IS THE WHOLE CHANGE ───────────────────────────────
       IT USED TO WANDER ON FOUR SINE TERMS - yaw, x, z and height, all on
       different periods - which is what you write when the scene has no edges
       and you are trying to make one shot feel like several. It cost more than
       it bought. A camera drifting up and down the avenue re-frames the fight
       every few seconds, so nothing ever settles; the eye spends the shot
       re-finding the line instead of watching it. And a moving height plus a
       moving yaw is exactly the combination that walks the off-axis readout
       toward the arc where the sprite pack has no drawings.

       Locked now: fixed standoff, fixed height, fixed pitch, square down the
       street. The ONLY thing that moves is x, which tracks the front - which
       is not camera motion at all, it is the camera holding still while the
       battle moves under it. That is the Reach's 'follow', which sits at a
       fixed offset behind CL.front and does nothing else.

       Bounded to the carriageway because the alternative is standing inside a
       building. */
    cam.yaw = 0;
    cam.x = clamp(frontX, -GRID.hw + 1.2, GRID.hw - 1.2);
    cam.z = ARENA.z0 + 62;
    cam.y = 6.0;
    cam.pitch = -0.045;
  } else if (camMode === 'cine') {
    cine.hold -= dt;
    if (cine.hold <= 0) {
      cine.z = clamp(pickHotspotZ(), ARENA.z0 + 26, ARENA.z1 - 26);
      cine.side = Math.sin(autoT * 0.37) < 0 ? -1 : 1;
      cine.hold = 6200;
    }
    // Eased rather than snapped: a hard cut on a canvas with no motion blur
    // reads as a dropped frame.
    cam.z += (cine.z - 46 - cam.z) * 0.05;
    cam.x += (clamp(frontX + cine.side * 3.4, -GRID.hw + 1.2, GRID.hw - 1.2)
              - cam.x) * 0.05;
    cam.y += (7.4 - cam.y) * 0.04;
    cam.yaw = 0;
    cam.pitch = -0.05;
  } else if (camMode === 'orbit') {
    // Deliberately NOT bounded: this is the mode that shows what the single
    // facing pack cannot do, and the off-axis readout goes red while it does.
    var a = autoT*0.00011, R0 = 110;
    cam.x = Math.sin(a)*R0; cam.z = 150 + Math.cos(a)*R0;
    cam.yaw = Math.atan2(-cam.x, 150 - cam.z);
    cam.y = 42; cam.pitch = -0.24;
  }
  // 'free' is driven by input only.
}

// ── boot ───────────────────────────────────────────────────────────────────
/* ── View radius, and the fog that pays for it ────────────────────────────
   A CITY DOES NOT GET CHEAPER BY BEING SMALLER, IT GETS CHEAPER BY BEING
   NEARER. Shrinking the map would cost the thing the map is for - a front line
   running through blocks - so instead the whole city still EXISTS, and only
   what is inside the radius is DRAWN. The sim, the cover slots and the front
   are untouched; men keep fighting in streets you cannot see, which is what a
   front line is.

   THE FOG IS NOT A DISGUISE FOR THE CUT, IT IS WHAT MAKES THE CUT LEGAL. If
   the haze is already opaque at the radius then nothing is missing at the edge
   - there is nothing to see there either way - and the two numbers are tied
   together for that reason rather than tuned separately. Wind the radius down
   and the fog closes in with it. That is also why it reads as a war rather
   than as a draw distance: smoke over a contested block is a thing that
   happens, and a hard horizon is not. */
/* ── The skyline is OFF by default, and the reason is not performance ─────
   MEASURED BEFORE REMOVING IT: 35 cached sprites totalling 1.25 megapixels,
   40 drawImage calls, and 2.3ms of a 472ms frame - under half a percent. It
   was never a frame cost and about five megabytes of texture is not a memory
   problem on any machine that can run the rest of this.

   *** AND THE MODEL SKYLINE IS OFF FOR A REASON THE GLYPH ONE NEVER HAD. ***
   Turning it back on for real geometry was the right experiment and it failed
   in the wide shot: at 1400m and beyond a 280m tower is a SILHOUETTE, so every
   face on it lands within a few luminance values of every other, and the haze
   wash closes the rest of the gap. What arrives on screen is not a tower, it
   is a flat coloured rectangle four hundred pixels across sitting behind the
   street, and there are several of them. The street in front of it has
   windows, kerbs, lamps and parapets; the horizon has a slab. The slab wins on
   area and loses on everything else, which is the opposite of what a backdrop
   is for.

   That is a LOOK failure and not a bug, so nothing is deleted: all three
   styles stay behind CB.opt.skylineStyle and the toggle is right here. WHAT
   YOU LOSE by leaving it off: the horizon goes flat, because the towers were
   the only thing occupying the far half of a wide shot. That is a real loss
   and the answer to it is detail lower in the frame rather than a bigger shape
   higher up. WHAT WOULD MAKE IT WORTH TURNING BACK ON: something that varies
   ACROSS a far facade - lit window rows, a vertical value break, a roof line
   that is not one silhouette - because at that range variation is the only
   thing distance cannot flatten. */
/* ── AND IT IS BACK ON, AS PRISM, WHICH IS A DIFFERENT DECISION ───────────
   v1.10.0.1 turned the skyline off and the reason was specific: real geometry
   at 1400m is a SILHOUETTE, every face within a few luminance values of every
   other, so the model style arrives as a flat coloured rectangle four hundred
   pixels wide. That verdict was about the MODEL style and it still stands.

   It was never a verdict on having a horizon. The note left the condition for
   earning one back: something that VARIES ACROSS a far facade, because at that
   range variation is the only thing distance cannot flatten. The prism style
   already does exactly that - three face values per mass, a lighter roof slab
   so the edge reads, a window grid, and a mast with a beacon on anything tall.
   It is the city view's own language and it is what the sector table needs to
   say anything at all: a crowned tower and a slab are only different if the
   renderer draws the difference.

   One flag either way. If it still reads wrong, `skyline: false` and the whole
   thing is gone again without touching anything else. */
CB.opt = { groundTex: 0, texScale: 0.30,
  skyline: true, skylineStyle: 'prism', viewRadius: 150, fog: 0.86,
  roadWear: 0, floraN: 260, perSide: 26, reinforce: true, paused: false };
CB.sides = { home: 'coal', away: 'synd' };
// A faction does not fight itself. Enforced here rather than in the picker so
// the rule holds however the pairing is set.
CB.newCanvas = function (w, h) {
  var c = global.document.createElement('canvas');
  c.width = w; c.height = h; return c;
};
CB.setFactions = function (home, away) {
  if (home === away) return 'a faction does not fight itself';
  CB.sides.home = home; CB.sides.away = away;
  for (var i = 0; i < units.length; i++)
    units[i].fac = units[i].side === 1 ? home : away;
  for (i = 0; i < units.length; i++) {
    units[i].sk = skinFor(units[i].fac, units[i].i);
    units[i].kt = kitFor(units[i].fac, units[i].i);
  }
  return null;
};
/* SETTING THE ZONE REBUILDS EVERYTHING, and it has to: the palette, the ground
   patch, the street grid, the lot plan and the facade pool all come off the
   map, so changing zone is not a tint change, it is a different city. */
CB.setZone = function (colonyId, zoneIdx) {
  var m = CB.mapFor(colonyId, zoneIdx);
  if (!m) return null;
  MAP = m;
  PAL = null; PATS = null;
  buildPal();
  buildGrid(MAP);
  CB.reseed(MAP.seed);
  return MAP;
};
CB.map = function () { return MAP; };
CB.reseed = function (s) {
  var seed = (s === undefined) ? (Math.random()*4294967296)>>>0 : s;
  CB.seed = seed;
  if (!MAP) { MAP = CB.mapFor('', 0); buildGrid(MAP); }
  genTowers(seed); genProps(seed); buildSolids();
  genFlora(seed, CB.opt.floraN); resetSim(seed);
};
CB.setCam = function (m) { camMode = m; };
CB.camMode = function () { return camMode; };
CB.cam = cam;
CB.offAxis = function () { return yawOffAxis(); };
CB.safeYaw = SAFE_YAW;
CB.stats = function () {
  var live = { 1: 0, '-1': 0 };
  for (var i = 0; i < units.length; i++) if (!units[i].dead) live[units[i].side]++;
  return { home: live[1], away: live[-1], hk: casualties[-1], ak: casualties[1],
           front: frontX, faces: _queue.length, ready: !!MESHES };
};
/* ── Who is fighting over this colony ─────────────────────────────────────
   READ FROM THE COLONY, NOT CHOSEN HERE. gState carries control_coalition,
   control_syndicate, control_void and control_guild for every colony because
   the server already sends them; the two strongest are the belligerents and
   the strongest of those is the defender. That is the same fact the war fund
   is priced against, so the picture cannot disagree with the economy.

   THE IDS HAVE TO BE TRANSLATED and the translation is not this file's to own:
   galaxy.js says 'coalition', the uniform registry says 'coal', and three of
   the six ids collide by luck. FM_FAC_API.fromGalaxy is the one map.

   A FACTION DOES NOT FIGHT ITSELF, so a colony with one belligerent has no
   battle to show and says so rather than drawing a mirror match. */
CB.rosterFor = function (colonyId) {
  var st = global.gState && global.gState[colonyId];
  if (!st) return null;
  var api = API(), out = [];
  ['coalition', 'syndicate', 'void', 'guild'].forEach(function (g) {
    var pct = st['control_' + g] || 0;
    var f = api.fromGalaxy(g);
    if (f && pct > 0 && !NOT_A_POLITY[f]) out.push({ fac: f, pct: pct });
  });
  out.sort(function (a, b) { return b.pct - a.pct; });
  if (out.length < 2) return null;
  return { home: out[0].fac, away: out[1].fac,
           homePct: out[0].pct, awayPct: out[1].pct };
};

/* A COUNT OF WHAT THE GENERATOR ACTUALLY PRODUCED. stats() reports the fight;
   this reports the WORLD, which is what a sweep across sixty-six zones needs -
   a battlefield with no buildings and no cover still reports a healthy fight
   right up until you look at it. */
CB.arena = function () {
  return { x0: ARENA.x0, x1: ARENA.x1, z0: ARENA.z0, z1: ARENA.z1,
           w: ARENA.w, d: ARENA.d, frontLo: ARENA.x0 + FRONT_INSET,
           frontHi: ARENA.x1 - FRONT_INSET };
};
CB.diag = function () {
  var held = 0;
  for (var i = 0; i < cover.length; i++) if (cover[i].by !== null) held++;
  return { props: props.length, cover: cover.length, held: held,
           flora: flora.length, towers: towers.length,
           layout: MAP && MAP.layout, terrain: MAP && MAP.terrain };
};
CB.skylineCost = function () {
  var n=0, px=0;
  for (var k in _glyph) { n++; px += _glyph[k].width * _glyph[k].height; }
  return { sprites:n, megapixels:+(px/1048576).toFixed(2), towers:towers.length };
};
CB.buildings = function () {
  return kitB.map(function (b) { return { x:b.x, z:b.z, w:b.w, d:b.d, h:b.h }; });
};
CB.polities = polities;
/* ── Opening it from the client ───────────────────────────────────────────
   Same shape as reachWatch: bind a canvas inside a fixed overlay, run a loop
   while it is open, stop dead when it is not. A viewer that keeps stepping
   behind a closed panel is a battery drain nobody can see. */
var _raf = null, _last = 0, _open = false;
function tick(now) {
  if (!_open) return;
  var dt = Math.min(64, now - _last); _last = now;
  CB.step(dt); CB.frame();
  var el = global.document.getElementById('cbStat');
  if (el) {
    var st = CB.stats();
    el.textContent = (REG()[CB.sides.home].short) + ' ' + st.home + '   vs   ' +
                     (REG()[CB.sides.away].short) + ' ' + st.away +
                     '   \u00b7   losses ' + st.hk + ' / ' + st.ak;
  }
  _raf = global.requestAnimationFrame(tick);
}
CB.watch = function (colonyId, zoneIdx) {
  var host = global.document.getElementById('cityBattle');
  var canvas = global.document.getElementById('cbCanvas');
  if (!host || !canvas) return 'city battlefield overlay is not in the page';
  var roster = CB.rosterFor(colonyId);
  if (!roster) return 'no contested control on this colony';
  if (NO_SURFACE[colonyId])
    return 'this colony is orbital - there is no surface to fight over';
  host.style.display = 'block';
  var fatal = CB.attach(canvas, global.devicePixelRatio || 1);
  if (fatal) { host.style.display = 'none'; return fatal; }
  var r = canvas.getBoundingClientRect();
  CB.resize(r.width || 960, r.height || 540);
  CB.setZone(colonyId, zoneIdx || 0);
  if (MAP) MAP.holder = roster.home;      // strongest control holds the city
  CB.setFactions(roster.home, roster.away);
  var t = global.document.getElementById('cbTitle');
  var sub = global.document.getElementById('cbSub');
  if (t) t.textContent = (MAP.name + '  \u00b7  ' + MAP.sector).toUpperCase();
  if (sub) sub.textContent =
    (API().name(roster.home) + '  ' + roster.homePct.toFixed(0) + '%   \u00b7   ' +
     API().name(roster.away) + '  ' + roster.awayPct.toFixed(0) + '%').toUpperCase();
  _open = true; _last = (global.performance || Date).now();
  _raf = global.requestAnimationFrame(tick);
  return null;
};
CB.close = function () {
  _open = false;
  if (_raf) { global.cancelAnimationFrame(_raf); _raf = null; }
  var host = global.document.getElementById('cityBattle');
  if (host) host.style.display = 'none';
};
CB.isOpen = function () { return _open; };

CB.attach = function (canvas, dpr) {
  var m = missing();
  if (m.length) { CB.fatal = 'missing: ' + m.join(', '); return CB.fatal; }
  if (!MAP) MAP = CB.mapFor('', 0);
  buildPal();
  buildGrid(MAP);
  cv = canvas; ctx = cv.getContext('2d');
  DPR = Math.min(dpr || 1, 2);
  loadMeshes();
  loadKit();
  loadModern();
  // Warm the sheets this bench actually uses, so the first seconds are not a
  // field of men popping in one animation at a time.
  var want = ['assault','engineer'], suff = ['_walk_prepared','_sit_prepare',
              '_sit_single_shot','_hitted','_death'];
  for (var i = 0; i < want.length; i++)
    for (var j = 0; j < suff.length; j++)
      if (TR().FRAMES[want[i]+suff[j]]) TR().sheet(want[i]+suff[j]);
  CB.reseed();
  return null;
};
CB.resize = resize;
CB.step = function (dt) { if (!CB.opt.paused) { updateCam(dt); step(dt); } else updateCam(0); };
CB.frame = frame;
CB.reg = REG;
CB.PAL = PAL;
CB.MAT = MAT;

/* Bound at module scope rather than per open, because an overlay that is
   opened and closed twenty times should not accumulate twenty listeners. */
if (global.addEventListener) {
  global.addEventListener('resize', function () {
    if (!_open) return;
    var c = global.document.getElementById('cbCanvas');
    if (!c) return;
    var r = c.getBoundingClientRect();
    CB.resize(r.width || 960, r.height || 540);
  });
  global.addEventListener('keydown', function (e) {
    if (_open && e.key === 'Escape') CB.close();
  });
}

/* The names the client calls, alongside reachWatch. */
global.cityWatch = function (colonyId, zoneIdx) {
  var err = CB.watch(colonyId, zoneIdx);
  if (err && global.toast) global.toast(err);
  else if (err) console.warn('[cityWatch]', err);
  return err;
};
global.cityWatchClose = function () { CB.close(); };
global.cbSetCam = function (m) {
  CB.setCam(m);
  ['flank', 'orbit', 'free'].forEach(function (k) {
    var b = global.document.getElementById('cbCam_' + k);
    if (b) b.className = 'cb-cam' + (k === m ? ' on' : '');
  });
};

})(typeof window !== 'undefined' ? window : globalThis);
