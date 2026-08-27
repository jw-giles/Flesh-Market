// ═══════════════════════════════════════════════════════════════════════════
// planet-palette.mjs - derive each planet's battlefield palette FROM ITS ART.
//
// The battlefield used to colour its ground from a seven-entry hand-written
// TERRAIN_COL table keyed on the terrain SHAPE key. That table and the planet
// sprite a player had just been looking at from orbit were two separate
// authorings, and four of the ten Reach worlds disagreed outright:
//
//   ks_02 / ks_06  desert_2 sprite is RED (185,46,43); dust drew tan
//   ks_04          lava_2   sprite is ORANGE-RED     ; veins drew gold
//   ks_05          barren_2 sprite is TEAL           ; rift  drew violet
//
// So this reads the shipped frames and emits the palette. A world's ground is
// its own colour by construction rather than by eye, and new planet art gets a
// matching battlefield for free the next time this is run.
//
// SHAPE STAYS HAND-AUTHORED. terrain (dust/veins/rift/ice/ocean/station/tether)
// is a cover vocabulary and it is a design decision; nothing here touches it.
// This file decides colour only.
//
//   node tools/planet-palette.mjs          write client/assets/planet-palette.js
//   node tools/planet-palette.mjs --check  verify the committed file is current
//
// No dependencies. PNG is zlib over filtered scanlines and node ships zlib.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLANETS = path.join(ROOT, 'client/assets/space/planets');
const OUT = path.join(ROOT, 'client/assets/planet-palette.js');

// ── minimal PNG decode ─────────────────────────────────────────────────────
// Colour types 2 (RGB), 3 (palette), 6 (RGBA) at bit depth 8, which is every
// frame in the pack. Anything else throws loudly rather than sampling garbage.
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, pal = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9];
      if (data[12] !== 0) throw new Error('interlaced png unsupported');
    } else if (type === 'PLTE') pal = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error('bit depth ' + depth + ' unsupported');
  const CH = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (CH === undefined) throw new Error('colour type ' + ctype + ' unsupported');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * CH;
  const out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++];
    const line = raw.subarray(q, q + stride); q += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= CH ? cur[i - CH] : 0;
      const b = prev ? prev[i] : 0;
      const c = (prev && i >= CH) ? prev[i - CH] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
  }
  // Normalize to RGBA
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0, n = w * h; i < n; i++) {
    let r, g, b, a = 255;
    if (ctype === 6) { r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3]; }
    else if (ctype === 2) { r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; }
    else if (ctype === 0) { r = g = b = out[i]; }
    else if (ctype === 4) { r = g = b = out[i * 2]; a = out[i * 2 + 1]; }
    else { const ix = out[i]; r = pal[ix * 3]; g = pal[ix * 3 + 1]; b = pal[ix * 3 + 2]; if (trns && ix < trns.length) a = trns[ix]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

// ── sampling ───────────────────────────────────────────────────────────────
// A planet sprite is a lit sphere: one limb is in shadow and the terminator is
// a gradient, so a flat mean reads far darker than the world looks. Sampling
// the LIT DISC and taking percentiles off it gives ground and rock that match
// what a player sees, and the shadow limb is what the night side is for.
//
// Sampled off several frames, not one. An animated world rotates, and frame 1
// of a body whose interesting hemisphere is turned away is not that body.
const FRAME_PICKS = 6;

function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

function samplePlanet(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  if (!files.length) return null;
  const picks = [];
  for (let i = 0; i < FRAME_PICKS; i++) {
    const f = files[Math.floor(i * files.length / FRAME_PICKS)];
    if (f && picks.indexOf(f) < 0) picks.push(f);
  }
  const px = [];
  for (const f of picks) {
    let im;
    try { im = decodePNG(fs.readFileSync(path.join(dir, f))); }
    catch (e) { throw new Error(dir + '/' + f + ': ' + e.message); }
    const { w, h, rgba } = im;
    for (let i = 0, n = w * h; i < n; i++) {
      if (rgba[i * 4 + 3] < 200) continue;
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      px.push([r, g, b, lum(r, g, b)]);
    }
  }
  if (px.length < 64) return null;
  px.sort((a, b) => a[3] - b[3]);
  const at = q => px[Math.min(px.length - 1, Math.max(0, Math.round(q * (px.length - 1))))];
  // The lit half decides the world's colour. Below the 45th percentile is
  // terminator and night side, which is a lighting condition, not a hue.
  const lit = px.slice(Math.floor(px.length * 0.45));
  const mean = lit.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0])
    .map(v => Math.round(v / lit.length));
  return {
    dark: at(0.12).slice(0, 3),
    ground: at(0.55).slice(0, 3),
    rock: at(0.80).slice(0, 3),
    light: at(0.95).slice(0, 3),
    mean,
  };
}

// ── palette derivation ─────────────────────────────────────────────────────
// SKY IS NOT THE PLANET'S COLOUR AT FULL STRENGTH and this is the one place a
// literal reading of "make it look like the planet" would be wrong. The whole
// battlefield is stroked wireframes over the background; a saturated sky at the
// sprite's own luminance leaves the line invisible. So the planet's HUE is
// taken at full fidelity and its VALUE is crushed to a range the wireframes
// still read against. That is a rendering constraint, not a colour opinion:
// the world is recognisably itself and the units are still legible on it.
const SKY_V = 0.30, HORIZON_V = 0.46, GROUND_V = 0.17, FAR_V = 0.26;

function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
function mul(c, k) { return c.map(v => Math.max(0, Math.min(255, Math.round(v * k)))); }
// Push a colour to a target luminance while keeping its hue.
//
// A NAIVE SCALE CLIPS AND CLIPPING IS A HUE SHIFT, which is exactly the bug
// this whole file exists to stop. barren_4 scaled to horizon luminance wants
// (255,64,66) with the red channel pinned at the ceiling: the ratio between
// channels is gone and the world has silently changed colour on the way to
// being brightened. So: scale down freely, and when the target is brighter
// than full saturation can reach, pin at the ceiling and DESATURATE the rest of
// the way. That is what a real surface does under more light, and hue survives.
function atLum(c, target) {
  const L = Math.max(1, lum(c[0], c[1], c[2]));
  const k = (target * 255) / L;
  const peak = Math.max(c[0], c[1], c[2]) * k;
  if (peak <= 255) return mul(c, k);
  const s = mul(c, 255 / Math.max(1, Math.max(c[0], c[1], c[2])));
  const L2 = lum(s[0], s[1], s[2]);
  if (L2 >= target * 255) return s;
  const t = Math.min(1, (target * 255 - L2) / Math.max(1, 255 - L2));
  return mix(s, [255, 255, 255], t);
}

function paletteFor(s) {
  const base = s.mean;
  return {
    // sky at the top of frame, horizon glow, ground plane, distance haze
    sky: atLum(mix(base, [90, 104, 130], 0.35), SKY_V * 0.72),
    horizon: atLum(base, HORIZON_V),
    ground: atLum(base, GROUND_V),
    far: atLum(mix(base, s.light, 0.5), FAR_V),
    // what terrain wireframe strokes in
    rock: atLum(s.rock, 0.62),
    // rim light on feature tops
    edge: atLum(s.light, 0.80),
  };
}

// ── build ──────────────────────────────────────────────────────────────────
function walk(rel) {
  const dir = path.join(PLANETS, rel);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    out.push([rel + '/' + e.name, path.join(dir, e.name)]);
  }
  return out;
}

function build() {
  const rows = [];
  for (const [key, dir] of [...walk('animated'), ...walk('static'), ...walk('jade')]) {
    const s = samplePlanet(dir);
    if (!s) { console.warn('[planet-palette] skipped (no usable frames): ' + key); continue; }
    rows.push([key, paletteFor(s), s.mean]);
  }
  rows.sort((a, b) => a[0] < b[0] ? -1 : 1);
  const body = rows.map(([key, p, mean]) =>
    "  '" + key + "': { sky:[" + p.sky + "], horizon:[" + p.horizon + "], ground:[" + p.ground +
    "], far:[" + p.far + "], rock:[" + p.rock + "], edge:[" + p.edge +
    /* MEAN SHIPS AS A FIELD NOW, AND ITS ABSENCE WAS A REAL DEFECT. Every entry
       above is normalized to a FIXED target luminance - that is what atLum does
       and it is why the hues survive - so ground and horizon carry a world's
       COLOUR and carry no information about how BRIGHT it is. A client tinting
       from them gets the same value on an ice world as on a lava world, which is
       exactly what happened: every planet's ground came out equally dark and hue
       was the only thing separating them. The unnormalized art mean was already
       computed and was being written into a COMMENT. */
    "], mean:[" + mean + "] },"
  ).join('\n');
  return `// GENERATED by tools/planet-palette.mjs - DO NOT EDIT BY HAND.
// Re-run after changing or adding planet art:  node tools/planet-palette.mjs
//
// Each entry is sampled off the shipped sprite frames for that body, so the
// ground a war is fought on is the colour of the world it is fought on. Hue is
// the art's; value is crushed so stroked wireframes stay legible over it.
// See the tool header for why that split exists.
(function(){
'use strict';
window.PLANET_PALETTE = {
${body}
};
// Fallback for a body with no art entry: neutral rock, nothing implied.
window.PLANET_PALETTE_DEFAULT = {
  sky:[26,29,36], horizon:[58,62,72], ground:[24,26,31], far:[42,46,55],
  rock:[122,132,150], edge:[168,178,196], mean:[128,136,150]
};
})();
`;
}

const src = build();
if (process.argv.includes('--check')) {
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (have !== src) { console.error('planet-palette.js is STALE. Run: node tools/planet-palette.mjs'); process.exit(1); }
  console.log('planet-palette.js current (' + (src.match(/^  '/gm) || []).length + ' bodies)');
} else {
  fs.writeFileSync(OUT, src);
  console.log('wrote ' + path.relative(ROOT, OUT) + ' (' + (src.match(/^  '/gm) || []).length + ' bodies)');
}
