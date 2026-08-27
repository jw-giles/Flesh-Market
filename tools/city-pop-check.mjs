// ═══════════════════════════════════════════════════════════════════════════
// city-pop-check.mjs — measures TEXTURE POPPING in the city battlefield.
//
//   node tools/city-pop-check.mjs
//
// WHAT POPPING ACTUALLY IS, AND WHY A FACE COUNT DOES NOT MEASURE IT. The
// obvious probe is frame-to-frame |delta faces| while walking the camera, and
// it is misleading: most of that number is faces crossing the NEAR PLANE,
// which is normal and unavoidable. Turning on the spot produces a large delta
// and no popping whatsoever.
//
// The fault is a building CHANGING ITS DETAIL STATE while its own distance did
// not move. That happened because two things were keyed on a building's RANK
// in the distance-sorted queue rather than on its distance: `rich` was `i < 8`,
// and the window budget was spent nearest-first down the list. Walk four
// metres, let one block leave the radius, and every building after it moves up
// a rank - so the ninth becomes the eighth and switches window pools while
// standing perfectly still at an unchanged distance.
//
// So this counts STATE FLIPS and splits them in two: a building that entered or
// left the circle, or whose own distance crossed a threshold, is LEGITIMATE. A
// building that changed state with neither is SPURIOUS, and spurious is the
// number that has to be zero.
//
// MEASURED BEFORE AND AFTER the v1.10.0.3 change, over three camera walks:
//   dolly 2m/step    0.19 -> 0.00 spurious flips per frame
//   yaw   3deg/step  0.00 -> 0.00   (turning never popped; it only jittered)
//   strafe 2m/step   0.27 -> 0.00
//
// REQUIRES node-canvas, same as citybattle-harness.mjs and for the same reason.
// EXIT CODES: 0 green, 1 spurious flips found or a module is missing.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let canvasMod;
try { canvasMod = require('canvas'); }
catch {
  /* run-all reads this banner and reports SKIPPED rather than FAILED. canvas is
     an OPTIONAL dependency on purpose - a native build that fails on plenty of
     machines - so a missing one must not turn the whole suite red. */
  console.log('!! NOT RUN !! city-pop-check needs node-canvas:  npm i -D canvas');
  process.exit(0);
}
const { createCanvas, Image, DOMMatrix } = canvasMod;
const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(ROOT, 'client');

const g = globalThis;
g.window = g; g.DOMMatrix = DOMMatrix; g.Image = Image;
const cv = createCanvas(1280, 720);
g.document = { getElementById: (id) => (id === 'cbCanvas' ? cv : null),
               createElement: (t) => (t === 'canvas' ? createCanvas(8, 8) : { style: {} }) };
g.devicePixelRatio = 1;
g.requestAnimationFrame = () => 0;
g.performance = { now: () => 0 };
g.fetch = () => Promise.reject(new Error('offline'));
g.CB_KIT_SRC = JSON.parse(fs.readFileSync(
  path.join(CLIENT, 'assets/space/city/kit.json'), 'utf8'));

const _err = console.error; console.error = () => {};   // sheet-load noise
for (const f of ['assets/space/city-fronts.js', 'assets/planet-palette.js',
                 'assets/factions.js', 'assets/coalition-sprites.js',
                 'assets/city-battle.js'])
  new Function(fs.readFileSync(path.join(CLIENT, f), 'utf8')).call(g);
console.error = _err;

CB.attach(cv, 1); CB.resize(1280, 720);

let fails = 0, passes = 0;
function ok(name, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '  [' + detail + ']'));
  if (cond) passes++; else fails++;
}

/* The rules under test, restated here rather than reached into. They are the
   thresholds in city-battle.js, and if either moves this file has to move with
   it - which is the point: the numbers are asserted, not inferred. */
const RICH_RANGE = 62, SHOP_RANGE = 40;
function stateOf(R) {
  const out = new Map();
  const list = CB.buildings().map((b) => {
    const dx = b.x - CB.cam.x, dz = b.z - CB.cam.z;
    const half = Math.hypot(b.w, b.d) * 0.5;
    return { k: b.x + ':' + b.z, near: Math.max(0, Math.hypot(dx, dz) - half) };
  }).filter((a) => a.near <= R);
  for (const a of list)
    out.set(a.k, { rich: a.near < RICH_RANGE, shop: a.near < SHOP_RANGE, near: a.near });
  return out;
}
function walk(label, steps, mut) {
  const R = CB.opt.viewRadius;
  let prev = null, spurious = 0, legit = 0, frames = 0, worst = '';
  for (let k = 0; k < steps; k++) {
    mut(k);
    const s = stateOf(R);
    if (prev) {
      for (const key of new Set([...prev.keys(), ...s.keys()])) {
        const a = prev.get(key), b = s.get(key);
        if (!a || !b) { legit++; continue; }          // entered or left the circle
        if (a.rich === b.rich && a.shop === b.shop) continue;
        const lo = Math.min(a.near, b.near), hi = Math.max(a.near, b.near);
        const crossed = (lo < RICH_RANGE && hi >= RICH_RANGE) ||
                        (lo < SHOP_RANGE && hi >= SHOP_RANGE);
        if (crossed) legit++;
        else { spurious++; if (!worst) worst = key + ' @ ' + b.near.toFixed(1) + 'm'; }
      }
      frames++;
    }
    prev = s;
  }
  const per = spurious / frames;
  ok(label.padEnd(16) + ' no detail changes without a distance change',
     spurious === 0, per.toFixed(2) + '/frame, first at ' + worst);
  console.log('          (' + (legit / frames).toFixed(2) + ' legitimate changes per frame)');
}

console.log('\n== Detail is a function of distance, not of queue rank ==');
for (const [cid, zi] of [['lustandia', 0], ['yujing', 0], ['hollow', 0]]) {
  if (!CB.mapFor(cid, zi)) continue;
  CB.setZone(cid, zi); CB.reseed(7);
  console.log('  -- ' + cid);
  walk('dolly',  120, (k) => Object.assign(CB.cam, { x: 1.5, y: 6, z: -30 + k*2, yaw: 0, pitch: -0.045 }));
  walk('yaw',    120, (k) => Object.assign(CB.cam, { x: 1.5, y: 6, z: 60, yaw: k*0.0524, pitch: -0.045 }));
  walk('strafe', 120, (k) => Object.assign(CB.cam, { x: -120 + k*2, y: 6, z: 60, yaw: 0, pitch: -0.045 }));
}

/* THE CIRCLE HAS TO CONTAIN THE BUILDING, NOT ITS CENTRE. A forty metre block
   whose middle sits one metre outside the radius is entirely absent, and one
   camera step later the whole facade arrives at once. queueProps has measured
   reach since it was written; buildings never did, and buildings are the
   largest things in the frame. */
console.log('\n== The cull measures the building, not its centre ==');
{
  const src = fs.readFileSync(path.join(CLIENT, 'assets/city-battle.js'), 'utf8');
  ok('buildings are culled on a reach-expanded radius', /function nearR2\(b, R\)/.test(src));
  ok('and sorted on the nearest corner', /p\.near - q\.near/.test(src));
  ok('flora orders on world distance, not view z',
     /_floraSort\.push\(\{ f: f, m: m, z: d2 \}\)/.test(src));
}

console.log('\ncity-pop: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
