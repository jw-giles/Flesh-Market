// ═══════════════════════════════════════════════════════════════════════════
// citybattle-harness.mjs — headless driver for client/assets/city-battle.js,
// the live city battlefield viewer, and for client/citybattle-mock.html, the
// bench that works on it.
//
//   node tools/citybattle-harness.mjs [seed] [settle-seconds] [outdir]
//
// WHY A HEADLESS DRIVER FOR A BENCH THAT ALREADY OPENS IN A BROWSER. Because
// the bench is where the city battlefield renderer is being designed, and a
// renderer that can only be checked by looking at it can only be checked by
// somebody looking at it. This loads the SAME three shipped modules the page
// loads, in the same order, runs the same citybattle-mock.js, steps the same
// local sim and writes frames — so a change to factions.js, to the tint loop,
// to a sheet's geometry or to the mock itself either still renders or does not.
//
// IT IS ALSO WHAT CAUGHT FOUR BUGS THE BROWSER HID:
//   * pats() cached an object of nulls when the sheets had not decoded. The
//     same shape exists in reach-battle.js and survives only because the load
//     order happens to be kind.
//   * the band under the horizon covers 172000 x 56000 world units, four
//     million tiles for a 26px strip; canvas clips it and cairo dies.
//   * `horizon` is the planet's LIT GROUND value, not sky. Using it as sky put
//     a blue field on the screen.
//   * the tinted base patch spans luminance 41 to 65, which is why a plain
//     reads as a flat mat, and buildPatterns has always built an unused rock
//     pattern that fixes it.
//
// REQUIRES node-canvas:  npm i -D canvas
// A devDependency of the harness, not of the game. Nothing in client/ or
// server/ imports it and the bench in a browser does not need it.
//
// EXIT CODES: 0 frames written, 1 a required module is missing.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createHash } from 'crypto';

const require = createRequire(import.meta.url);
let canvasMod;
try {
  canvasMod = require('canvas');
} catch {
  console.error('citybattle-harness: node-canvas is not installed.\n' +
                '  npm i -D canvas\n' +
                'The browser bench does not need it; only this driver does.');
  process.exit(1);
}
const { createCanvas, Image, DOMMatrix } = canvasMod;

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(ROOT, 'client');
const OUT    = path.resolve(process.argv[4] || path.join(ROOT, 'tools', '_citybattle'));
fs.mkdirSync(OUT, { recursive: true });

// ── DOM shims ──────────────────────────────────────────────────────────────
const g = globalThis;
g.window = g;
g.DOMMatrix = DOMMatrix;
g.requestAnimationFrame = () => 0;
g.cancelAnimationFrame = () => {};
/* A DOM stub with getElementById, because the open path is the half of this
   that a rendering check cannot see. The renderer can be perfect and cityWatch
   can still fail on a missing id, a missing gState or a colony that turns out
   not to be contested, and all three are silent. */
const _els = Object.create(null);
function stubEl(id) {
  return _els[id] || (_els[id] = {
    id, style: {}, className: '', textContent: '',
    width: 1440, height: 810,
    getContext: () => shotCanvas.getContext('2d'),
    getBoundingClientRect: () => ({ width: 1440, height: 810, left: 0, top: 0 }),
    addEventListener() {}, removeEventListener() {},
    toDataURL: () => '',
  });
}
const shotCanvas = createCanvas(1440, 810);
g.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error('harness shim: only canvas, got ' + tag);
    return createCanvas(1, 1);
  },
  getElementById: (id) => _els[id] || null,
};
g.performance = { now: () => Number(process.hrtime.bigint()/1000n)/1000 };
let _clock = 0;
g.devicePixelRatio = 1;
g.addEventListener = () => {};
/* Resolves relative asset URLs against client/ and hands back a REAL
   node-canvas Image, because drawImage is native and a Proxy over it
   segfaults — only the src setter is replaced. Buffers decode synchronously,
   so onload fires before the setter returns, which is what the harness wants
   and never what a browser does. The mock is written not to care either way. */
const _proto = Object.getPrototypeOf(new Image());
const _src = Object.getOwnPropertyDescriptor(_proto, 'src');
const missingArt = [];
g.Image = function () {
  const im = new Image();
  Object.defineProperty(im, 'src', {
    configurable: true,
    get() { return _src.get.call(im); },
    set(v) {
      const rel = String(v).split('?')[0];           // strip the cache bust
      try { _src.set.call(im, fs.readFileSync(path.join(CLIENT, rel))); }
      catch {
        /* An emissive map that does not exist is the PACK being correct: a
           roof has no lit windows in it. The renderer asks for one anyway
           because asking is cheaper than maintaining a second table of which
           sheets have them, and it handles the miss. Counting it as missing
           art made this check cry wolf over a scene that was working. */
        if (!/_emiss\.png$/.test(rel)) missingArt.push(rel);
        if (im.onerror) im.onerror(new Error(rel));
      }
    },
  });
  return im;
};
// meshes.json is injected rather than fetched; there is no fetch here.
/* ── A Path2D shim, so the BROWSER branch is actually tested ──────────────
   node-canvas has no Path2D, so the renderer's fast path - build the street
   clip once as a Path2D and clip against it - was never executed here. It
   shipped green and threw on the first frame in Chrome, because a Path2D has
   no beginPath. That is the second browser-only path to get through this
   harness; the first was COLONY_VISUAL, which the harness supplied for itself.
   Both are the same failure: THE CHECK AND THE PRODUCT DISAGREED ABOUT THE
   ENVIRONMENT.

   This shim is deliberately MINIMAL and deliberately NOT a working path. It
   records the calls and, like the real thing, HAS NO beginPath - so any code
   that assumes one throws here exactly as it would in a browser. ctx.clip
   accepts it and ignores it, which loses the clipping in the headless render
   and is the right trade: a slightly wrong headless picture in exchange for
   the browser code path being run at all. Set CB_NO_PATH2D=1 to test the
   fallback instead. */
if (!process.env.CB_NO_PATH2D) {
  g.Path2D = function Path2D() {
    this.ops = 0;
    this.moveTo = function () { this.ops++; };
    this.lineTo = function () { this.ops++; };
    this.closePath = function () { this.ops++; };
    // NO beginPath, on purpose. See above.
  };
  const _proto2 = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d'));
  const _clip = _proto2.clip;
  _proto2.clip = function (a) {
    if (a instanceof g.Path2D) return;      // shimmed path: nothing to clip to
    return _clip.apply(this, arguments);
  };
}

g.CB_ASSETS = 'assets/space/';
try {
  g.CB_MODERN_SRC = JSON.parse(fs.readFileSync(path.join(CLIENT,'assets/space/city/modern.json'),'utf8'));
g.CB_KIT_SRC = JSON.parse(fs.readFileSync(path.join(CLIENT,'assets/space/city/kit.json'),'utf8'));
g.CB_NATURE_SRC = JSON.parse(
    fs.readFileSync(path.join(CLIENT, 'assets/space/nature/meshes.json'), 'utf8'));
} catch {
  console.error('citybattle-harness: assets/space/nature/meshes.json missing — flora off');
}

// ── the shipped modules, in the order the page loads them ──────────────────
// Not copies. If this list and the <script> tags in citybattle-mock.html ever
// disagree, the harness is testing a different build from the bench.
const MODULES = [
  'assets/planet-palette.js',
  'assets/factions.js',
  'assets/coalition-sprites.js',
];
for (const mod of MODULES) {
  const p = path.join(CLIENT, mod);
  if (!fs.existsSync(p)) { console.error('FATAL: missing ' + mod); process.exit(1); }
  (0, eval)(fs.readFileSync(p, 'utf8'));
}
(0, eval)(fs.readFileSync(path.join(CLIENT, 'assets/city-battle.js'), 'utf8'));

// The bench and the harness must load the same set. Asserted rather than
// trusted, because the failure is silent and looks like a rendering bug.
const html = fs.readFileSync(path.join(CLIENT, 'citybattle-mock.html'), 'utf8');
for (const mod of MODULES) {
  /* MATCHED WITHOUT THE QUERY. The bench busts its script tags with ?v= so it
     cannot serve a stale renderer, and an exact-string check broke the moment
     that landed - correctly reporting a mismatch that was not one. */
  if (!new RegExp('src="' + mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\?[^"]*)?"').test(html)) {
    console.error('FATAL: citybattle-mock.html does not load ' + mod +
                  ' — bench and harness would be testing different builds');
    process.exit(1);
  }
}

// ── the wiring assertions ──────────────────────────────────────────────────
// THE MODULE BEING GREEN IS NOT THE SAME AS THE GAME REACHING IT. Every one of
// these is a way the viewer can be perfectly correct and completely unreachable,
// which is the failure mode a rendering harness is blindest to.
const index = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');
const cityJs = fs.readFileSync(path.join(CLIENT, 'assets/city.js'), 'utf8');
const wiring = [
  ["index.html lazy-loads the module", index.includes("lazyLoad('assets/city-battle.js')")],
  ["index.html carries #cityBattle",   index.includes('id="cityBattle"')],
  ["index.html carries #cbCanvas",     index.includes('id="cbCanvas"')],
  ["index.html carries #cbStat",       index.includes('id="cbStat"')],
  ["index.html carries #cbTitle",      index.includes('id="cbTitle"')],
  ["index.html carries #cbSub",        index.includes('id="cbSub"')],
  ["close button calls cityWatchClose",index.includes('window.cityWatchClose')],
  ["city.js offers WATCH ENGAGEMENT",  cityJs.includes('window.cityWatch(')],
];
let wbad = 0;
for (const [what, ok] of wiring) {
  if (!ok) { console.error('FATAL: ' + what + ' — NO'); wbad = 1; }
}
if (wbad) process.exit(1);
console.log('wiring   : ' + wiring.length + ' checks ok');

// THE ID MAP MUST BE TOTAL OVER galaxy.js's OWN TABLE, or a colony held by a
// faction the registry cannot name draws as somebody else or as nothing.
const galaxy = fs.readFileSync(path.join(CLIENT, 'assets/galaxy.js'), 'utf8');
const gFacs = [...galaxy.matchAll(/control_([a-z]+)/g)].map(m => m[1]);
const seen = [...new Set(gFacs)];
const api = window.FM_FAC_API;
const unmapped = seen.filter(g => !api.fromGalaxy(g));
console.log('id map   : ' + seen.map(g => g + '->' + (api.fromGalaxy(g) || 'NONE')).join(' '));
if (unmapped.length) {
  console.error('FATAL: galaxy factions with no registry row: ' + unmapped.join(', '));
  process.exit(1);
}

// ── run ────────────────────────────────────────────────────────────────────
const W = 1440, H = 810;
const cv = createCanvas(W, H);
const fatal = CB.attach(cv, 1);
if (fatal) { console.error('FATAL:', fatal); process.exit(1); }
CB.resize(W, H);

/* THE COLONY DATA, so the harness can drive a real zone rather than the
   fallback map. Parsed out of the shipped files the same way the check tool
   does it - no copies. */
function braceBlock(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  let d = 0, j = src.indexOf('{', i), st = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) { j++; break; } }
  }
  return (0, eval)('(' + src.slice(st, j) + ')');
}
g._FM_COLONY_META = braceBlock(
  fs.readFileSync(path.join(CLIENT, 'assets/galaxy.js'), 'utf8'), 'var COLONY_META = {');
g.FM_COLONY_VISUAL = braceBlock(
  fs.readFileSync(path.join(ROOT, 'server/city.js'), 'utf8'), 'export const COLONY_VISUAL = {');

const seed = Number(process.argv[2] || 0x51713);
const settle = Number(process.argv[3] || 30);
CB.reseed(seed);

const DT = 33;
for (let i = 0; i < Math.round(settle * 1000 / DT); i++) CB.step(DT);

// Proof the bench reads the SHIPPED registry rather than a list of its own: if
// this shrinks, a faction was lost somewhere between here and there.
console.log('build    :', window.FMTroops.BUILD);
console.log('polities :', CB.polities().join(','));

/* TWO SHOTS FROM DIFFERENT CAMERAS MUST NOT BE THE SAME PICTURE, and while
   adding a street-level angle I hit exactly that: two frames written byte for
   byte identical from cameras a hundred metres and forty degrees apart. A
   renderer that ignores the camera is a serious fault and it presents as
   "that screenshot looks wrong", which is not something anyone chases.

   So the writer remembers the last frame's digest and says so when a new shot
   matches it. Cheap, and it turns an invisible fault into a line of output. */
const _seen = new Map();
let _lastDigest = null;
function shoot(name, cam) {
  Object.assign(CB.cam, cam);
  try { CB.frame(); } catch (e) { console.error('   FRAME THREW:', e.message); }
  const p = path.join(OUT, name + '.png');
  const buf = cv.toBuffer('image/png');
  fs.writeFileSync(p, buf);
  const digest = createHash('md5').update(buf).digest('hex').slice(0, 10);
  if (digest === _lastDigest)
    console.error('   *** IDENTICAL TO THE PREVIOUS SHOT - the camera was ignored ***');
  const prior = _seen.get(digest);
  if (prior && prior !== name)
    console.error('   *** same picture as ' + prior + ' ***');
  _seen.set(digest, name);
  _lastDigest = digest;
  console.log('wrote    :', path.relative(ROOT, p), ' ' + digest);
}
/* FOUR ZONES, DELIBERATELY UNLIKE EACH OTHER: a radial Circuit finance spire,
   a terraced Gray Bazaar on a rift world, an archipelago logistics station on
   ice, and an organic garden world. If the derivation ever collapses into one
   city with four tints, these four frames are where it shows. */
const ZONES = [
  ['yujing', 0, 'zone_yujing_finance'],
  ['the_hollow', 0, 'zone_hollow_bazaar'],
  ['frontier_outpost', 0, 'zone_frontier_ice'],
  ['lustandia', 1, 'zone_lustandia_garden'],
];
/* ── --all: every front, rendered and checked ─────────────────────────────
   FOUR HAND-PICKED ZONES PROVE THE DERIVATION WORKS AND NOTHING MORE. Sixty-six
   of them exist and any one can be broken in a way the other sixty-five are
   not: a colony whose lot plan collapses to nothing, a terrain with no patch on
   disk, a layout whose avenues land on top of each other, a sector so dense the
   cover slots never resolve. None of that shows in a screenshot of Yujing.

   So --all walks every zone, renders it, and asserts the things that are true
   of a working battlefield regardless of which world it is. It is slow on
   purpose - it is the sweep you run before shipping, not the one you run on
   every save. */
if (process.argv.includes('--all')) {
  /* THIRTY SECONDS, AND THE NUMBER IS NOT ARBITRARY. The first sweep settled
     for fifteen and reported 58 of 66 fronts as "never engaged", which looked
     like a catastrophic bug in the derivation and was the CHECK BEING
     IMPATIENT: the lines spawn about ninety metres out and have to close to a
     sixty-two metre engagement range, which at infantry pace is a bit over
     twenty seconds before the first shot. Driven: 15s = 58 failures, 30s = 0,
     60s = 0. A threshold that fails on a working scene teaches you to ignore
     the sweep, which is worse than not having one. SWEEP_S overrides it.

     RAISED TO FORTY-FIVE WHEN BUILDINGS GOT COLLISION. Men used to cross a
     block by walking through it and now they go round, which is slower and is
     the entire point of the change. Re-driven with collision in: 30s = 5 or 6
     failures, 45s = 0, 60s = 0. Moving the spawn closer was tried first and
     recovered most but not all of it, so the honest answer is that contact
     genuinely takes longer now and the check waits for it. */
  const SWEEP_STEPS = Math.round((Number(process.env.SWEEP_S || 45) * 1000) / DT);
  const META = g._FM_COLONY_META || {};
  const sheetW = 8, thumbW = 320, thumbH = 180;
  const ids = Object.keys(META).filter((k) => !/^ks_/.test(k));
  const all = [];
  for (const id of ids) {
    const zn = (META[id].planets || []).length;
    for (let z = 0; z < zn; z++) if (CB.mapFor(id, z)) all.push([id, z]);
  }
  const rows = Math.ceil(all.length / sheetW);
  const sheet = createCanvas(sheetW * thumbW, rows * thumbH);
  const sg = sheet.getContext('2d');
  sg.fillStyle = '#05070c'; sg.fillRect(0, 0, sheet.width, sheet.height);
  let broken = 0, n = 0;
  console.log('');
  console.log('front'.padEnd(30) + 'layout'.padEnd(13) + 'terrain'.padEnd(9) +
              'props  cover  quads  losses');
  console.log('-'.repeat(86));
  for (const [cid, zi] of all) {
    const m = CB.setZone(cid, zi);
    CB.setCam('free');
    Object.assign(CB.cam, { x: 1.5, y: 11, z: 24, yaw: 0, pitch: -0.055 });
    for (let i = 0; i < SWEEP_STEPS; i++) CB.step(DT);
    CB.frame();
    const st = CB.stats(), d = CB.diag();
    const bad = [];
    /* A zone with no buildings, no cover or nothing on screen is broken, and
       these are the three ways the derivation can produce an empty world. */
    if (d.props < 40) bad.push('props=' + d.props);
    if (d.cover < 12) bad.push('cover=' + d.cover);
    if (st.faces < 250) bad.push('quads=' + st.faces);
    if (st.home === 0 || st.away === 0) bad.push('a side is empty');
    if (st.hk + st.ak === 0) bad.push('never engaged');
    if (bad.length) { broken++; }
    console.log(
      (m.name + ' / ' + m.colony).slice(0, 29).padEnd(30) +
      m.layout.padEnd(13) + m.terrain.padEnd(9) +
      String(d.props).padStart(5) + String(d.cover).padStart(7) +
      String(st.faces).padStart(7) + String(st.hk + st.ak).padStart(8) +
      (bad.length ? '   <-- ' + bad.join(', ') : ''));
    // thumbnail into the contact sheet
    const col = n % sheetW, row = (n / sheetW) | 0;
    sg.drawImage(cv, col * thumbW, row * thumbH, thumbW, thumbH);
    sg.fillStyle = 'rgba(0,0,0,0.6)';
    sg.fillRect(col * thumbW, row * thumbH + thumbH - 16, thumbW, 16);
    sg.fillStyle = bad.length ? '#e2564a' : '#9fb4c8';
    sg.font = '11px monospace';
    sg.fillText((m.name + '  ' + m.layout + '/' + m.terrain).slice(0, 44),
                col * thumbW + 4, row * thumbH + thumbH - 4);
    n++;
  }
  const sp = path.join(OUT, 'all_fronts.png');
  fs.writeFileSync(sp, sheet.toBuffer('image/png'));
  console.log('');
  console.log('fronts rendered :', all.length);
  console.log('contact sheet   :', path.relative(ROOT, sp));
  console.log(broken ? ('*** ' + broken + ' FRONT(S) WITH PROBLEMS - see the arrows above ***')
                     : 'every front renders and fights');
  process.exit(broken ? 1 : 0);
}

if (process.argv.includes('--prof')) {
  CB.setZone('yujing', 0);
  CB.setCam('free');
  Object.assign(CB.cam, { x: 1.5, y: 11, z: 24, yaw: 0, pitch: -0.055 });
  for (let i = 0; i < 300; i++) CB.step(DT);
  CB.prof = {};
  const N = 40, t0 = Date.now();
  for (let i = 0; i < N; i++) CB.frame();
  const total = (Date.now() - t0) / N;
  const d = CB.diag(), st = CB.stats();
  console.log('');
  console.log('props', d.props, ' cover', d.cover, ' flora', d.flora,
              ' towers', d.towers, ' quads', st.faces);
  const rows = Object.entries(CB.prof).sort((a,b)=>b[1]-a[1]);
  for (const [k, v] of rows) console.log('  ' + k.padEnd(9), (v/N).toFixed(1) + ' ms');
  console.log('  ' + 'TOTAL'.padEnd(9), total.toFixed(1) + ' ms/frame');
  console.log('');
  console.log('  per frame ops:');
  console.log('    bandPass calls  ', ((CB._bp||0)/N).toFixed(1));
  console.log('    bands filled    ', ((CB._bands||0)/N).toFixed(0));
  console.log('    paintFace calls ', ((CB._pf||0)/N).toFixed(0));
  console.log('    texQuad calls   ', ((CB._tq||0)/N).toFixed(0), '  <- each is save+clip+transform+drawImage+restore');
  process.exit(0);
}

/* ── --angles: the same city from every kind of camera ────────────────────
   A SCENE THAT IS CORRECT FROM ONE ANGLE IS NOT A CORRECT SCENE. Every fault
   in this renderer so far has been visible from exactly one viewpoint and
   invisible from the others: walls facing inward look fine head-on and hollow
   from a corner; a kerb laid across the street reads as texture from above and
   as a ladder at eye level; a roof at the wrong height is invisible until you
   are over it. So the audit is a fixed set of viewpoints, rendered together,
   with the frame digests compared - and every one of them is a camera somebody
   will actually put there. */
if (process.argv.includes('--angles')) {
  CB.setZone('new_anchor', 0);
  CB.setCam('free');
  for (let i = 0; i < 1364; i++) CB.step(DT);
  {
    const bs = CB.buildings().filter(function(b){return b.w>10 && b.d>10 && b.h>10;});
    bs.sort(function(a,b){return (a.x*a.x+a.z*a.z)-(b.x*b.x+b.z*b.z);});
    const b = bs[0];
    console.log('  nearest big building', JSON.stringify(b));
    g._INSIDE = b;
  }
  const ANGLES = [
    ['a_street',    { x: -8.5, y: 1.9,  z: 100, yaw: -1.35, pitch:  0.30 }],
    ['a_eye',       { x: 1.5,  y: 1.8,  z: 40,  yaw: 0,     pitch:  0.02 }],
    ['a_avenue',    { x: 1.5,  y: 11,   z: 24,  yaw: 0,     pitch: -0.06 }],
    ['a_corner',    { x: -26,  y: 4.6,  z: 104, yaw: 0.55,  pitch: -0.02 }],
    ['a_orbit',     { x: 110,  y: 42,   z: 150, yaw: -1.20, pitch: -0.24 }],
    ['a_top',       { x: 0,    y: 150,  z: 150, yaw: 0,     pitch: -1.30 }],
    ['a_low_up',    { x: -13,  y: 0.8,  z: 128, yaw: -1.55, pitch:  0.55 }],
    /* The angle from the report: standing on the pavement looking down at it,
       which is where a stretched ground pattern smears worst. */
    ['a_ground',    { x: -14,  y: 7,    z: 120, yaw: 0.5,  pitch: -0.62 }],
    ['a_behind',    { x: 1.5,  y: 9,    z: 300, yaw: Math.PI, pitch: -0.06 }],
    /* INSIDE A BUILDING. A shell with no floor and no interior faces lets the
       camera see straight out through its own walls, which is a real state a
       free cam reaches in one second of flying. */
    ['a_inside',    { x: g._INSIDE.x, y: g._INSIDE.h*0.4, z: g._INSIDE.z, yaw: 0.6, pitch: 0.05 }],
  ];
  let bad = 0;
  for (const [n, c] of ANGLES) {
    Object.assign(CB.cam, c);
    let threw = null;
    try { CB.frame(); } catch (e) { threw = e.message; }
    const st = CB.stats();
    const buf = cv.toBuffer('image/png');
    fs.writeFileSync(path.join(OUT, n + '.png'), buf);
    /* A frame that draws almost nothing from a legitimate camera is a fault,
       not a viewpoint. The threshold is deliberately low - this is catching
       "everything was culled", not "this angle is sparse". */
    const flags = [];
    if (threw) flags.push('THREW: ' + threw);
    if (st.faces < 120) flags.push('only ' + st.faces + ' quads');
    if (flags.length) bad++;
    console.log('  ' + n.padEnd(12) + String(st.faces).padStart(6) + ' quads' +
                (flags.length ? '   <-- ' + flags.join(', ') : ''));
  }
  console.log('  skyline cache:', JSON.stringify(CB.skylineCost()));
  { const t0=Date.now(); for(let i=0;i<30;i++) CB.frame(); const withSky=(Date.now()-t0)/30;
    CB.opt.skyline=false; const t1=Date.now(); for(let i=0;i<30;i++) CB.frame(); const without=(Date.now()-t1)/30;
    CB.opt.skyline=true;
    console.log('  frame with skyline', withSky.toFixed(1)+'ms   without', without.toFixed(1)+'ms'); }
  console.log(bad ? ('*** ' + bad + ' ANGLE(S) WITH PROBLEMS ***')
                  : 'every angle renders');
  process.exit(bad ? 1 : 0);
}

CB.setCam('free');
for (const [cid, zi, name] of ZONES) {
  const m = CB.setZone(cid, zi);
  if (!m) { console.error('FATAL: no map for ' + cid); process.exit(1); }
  for (let i = 0; i < 600; i++) CB.step(DT);
  console.log(('  ' + name).padEnd(30), m.layout.padEnd(12), m.terrain.padEnd(8), m.sector);
  shoot(name, { x: 1.5, y: 11, z: 24, yaw: 0, pitch: -0.055 });
}
CB.setZone('lustandia', 0);
CB.reseed(seed);
for (let i = 0; i < Math.round(settle * 1000 / DT); i++) CB.step(DT);
shoot('wide',    { x: 1.5, y: 11,  z: 24, yaw: 0,     pitch: -0.055 });
/* THE STYLE SHOT NEEDS THE SKYLINE ON, and it stopped having it when the
   default went to false: both frames came out as the same street with an empty
   sky, and the identical-digest warning fired on a comparison that was never
   going to differ. Forced on for the duration of the shot, which is what a
   bench comparing two styles has to do regardless of the default. */
{
  const _sky = CB.opt.skyline, _sty = CB.opt.skylineStyle;
  CB.opt.skyline = true;
  CB.opt.skylineStyle = 'prism';
  shoot('wide_prism', { x: 1.5, y: 11, z: 24, yaw: 0, pitch: -0.055 });
  CB.opt.skylineStyle = 'model';
  shoot('wide_model', { x: 1.5, y: 11, z: 24, yaw: 0, pitch: -0.055 });
  CB.opt.skyline = _sky; CB.opt.skylineStyle = _sty;
}
/* STREET LEVEL FIRST, AND THAT ORDERING IS A WORKAROUND RATHER THAN A FIX.
   Late in a long run this writer starts producing frames identical to the
   previous one - the guard below reports it - and the street shot is the one
   that matters most, so it is taken while the run is still honest. The cause
   is not yet found and is recorded in the changelog rather than papered over:
   a clean process renders these cameras correctly, so it is something this
   harness accumulates across many shots, not the renderer ignoring input. */
shoot('street',  { x: -8.5, y: 1.9, z: 100, yaw: -1.35, pitch: 0.30 });
shoot('corner',  { x: -8.6, y: 3.5, z: 104, yaw: 0.26,  pitch: -0.012 });
shoot('offaxis', { x: 110, y: 42,  z: 150, yaw: -1.20, pitch: -0.24  });


const st = CB.stats();
console.log('sim      :', JSON.stringify(st));
let bad = 0;
const fail = (m) => { console.error('WARN: ' + m); bad = 1; };
if (!st.ready) fail('meshes did not load');
if (st.home === 0 || st.away === 0) fail('a side is empty');
if (st.hk + st.ak === 0) fail('no casualties after ' + settle + 's — the lines never engaged');
if (st.faces < 200) fail('only ' + st.faces + ' quads — the scene is nearly empty');
if (CB.warn) fail(CB.warn);
if (missingArt.length) {
  fail(missingArt.length + ' asset(s) missing');
  for (const m of [...new Set(missingArt)].slice(0, 6)) console.error('   ' + m);
}
// ── the open path ──────────────────────────────────────────────────────────
// Everything above proves the renderer draws. This proves the GAME can get to
// it: a stubbed overlay, a stubbed colony, and cityWatch driven exactly as the
// district button drives it.
function openCheck() {
  // The ids index.html actually provides.
  ['cityBattle', 'cbCanvas', 'cbStat', 'cbTitle', 'cbSub',
   'cbCam_flank', 'cbCam_orbit', 'cbCam_free'].forEach(stubEl);
  _els.cbCanvas.getContext = () => shotCanvas.getContext('2d');

  const fails = [];
  const t = (what, ok) => { if (!ok) fails.push(what); };

  // 1. no colony state at all -> refuses, does not throw
  g.gState = {};
  t('refuses an unknown colony', CB.watch('nowhere') !== null);

  // 2. one belligerent -> refuses. A faction does not fight itself.
  g.gState = { solo: { control_coalition: 100 } };
  t('refuses an uncontested colony', CB.watch('solo') !== null);

  // 3. fleshstation has no uniform -> must not be drawn as somebody else
  g.gState = { station: { control_coalition: 60, control_fleshstation: 40 } };
  const r3 = CB.rosterFor('station');
  t('ignores a faction with no registry row', r3 === null);

  // 4. genuinely contested -> opens, names both sides, and steps
  g.gState = { contested: { control_coalition: 58, control_syndicate: 31,
                            control_void: 11 } };
  const roster = CB.rosterFor('contested');
  t('picks the top two by control',
    roster && roster.home === 'coal' && roster.away === 'synd');
  const err = CB.watch('contested');
  t('opens without error: ' + err, err === null);
  t('overlay is shown', _els.cityBattle.style.display === 'block');
  t('sides were applied', CB.sides.home === 'coal' && CB.sides.away === 'synd');
  t('subtitle names both', /COALITION/.test(_els.cbSub.textContent) &&
                           /SYNDICATE/.test(_els.cbSub.textContent));

  // The loop is driven by requestAnimationFrame, which is stubbed to nothing
  // here, so step and frame are driven directly - the point is that the open
  // path leaves the module in a state that can render.
  for (let i = 0; i < 60; i++) CB.step(DT);
  CB.frame();
  t('still open after stepping', CB.isOpen());

  CB.close();
  t('closes', !CB.isOpen() && _els.cityBattle.style.display === 'none');

  // 5. missing overlay -> a named refusal, not a crash
  delete _els.cityBattle;
  t('names the missing overlay', /overlay/.test(String(CB.watch('contested'))));

  return fails;
}
const openFails = openCheck();
if (openFails.length) {
  for (const f of openFails) console.error('FAIL: ' + f);
  bad = 1;
} else {
  console.log('open path: 10 checks ok');
}

console.log(bad ? 'citybattle-harness: FRAMES WRITTEN WITH WARNINGS'
                : 'citybattle-harness: green');
if (bad) process.exit(1);
