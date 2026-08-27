// ═══════════════════════════════════════════════════════════════════════════
// city-maps.mjs — every front line in settled space, as a table.
//
//   node tools/city-maps-check.mjs           assert the derivation
//   node tools/city-maps-check.mjs --list    print every zone's battlefield
//
// Named *-check.mjs so tools/run-all.mjs discovers it, and it therefore DEFAULTS
// to asserting rather than printing: a check that has to be asked to check is a
// check that will not be run.
//
// WHY THIS IS A TOOL AND NOT SIXTY-EIGHT DATA ROWS. The maps are DERIVED from
// COLONY_META, COLONY_VISUAL and the sector on each zone - all of which shipped
// long before this renderer. Nothing new is authored, so nothing new can drift.
// What this tool does is make the derivation VISIBLE: you can read off what
// every colony's battlefield will look like without opening the game, and the
// --check mode asserts the two properties that matter.
//
//   TOTAL      every non-brood colony resolves to a real terrain, a real
//              layout and a real palette body. A colony that falls through to
//              a default is a colony whose battlefield lies about the world.
//   DISTINCT   the maps are not all the same city with a different tint. If
//              the layout/sector inputs collapse, this is where it shows.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(ROOT, 'client');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function braceBlock(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('not found: ' + marker);
  let d = 0, j = src.indexOf('{', i), st = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) { j++; break; } }
  }
  return (0, eval)('(' + src.slice(st, j) + ')');
}

const META = braceBlock(read('client/assets/galaxy.js'), 'var COLONY_META = {');
const VISUAL = braceBlock(read('server/city.js'), 'export const COLONY_VISUAL = {');

// Load the module the way the game does, against a bare window.
const sand = { _FM_COLONY_META: META, FM_COLONY_VISUAL: VISUAL,
               addEventListener() {}, document: { getElementById: () => null } };
new Function('window', read('client/assets/city-battle.js')).call(sand, sand);
const CB = sand.CB;
const PALETTE = (() => {
  const w = {}; new Function('window', read('client/assets/planet-palette.js')).call(w, w);
  return w.PLANET_PALETTE;
})();

const check = !process.argv.includes('--list');
const rows = [];
const orbital = [];
for (const id of Object.keys(META)) {
  if (/^ks_/.test(id)) continue;                 // the brood has reach-battle
  const col = META[id];
  const zones = col.planets || [];
  for (let z = 0; z < zones.length; z++) {
    const m = CB.mapFor(id, z);
    /* null is a legitimate answer: Abaddon and Flesh Station are orbital and
       have no surface. Counted separately so "no map" cannot hide a colony
       that should have had one. */
    if (m) rows.push(m); else orbital.push(id + '#' + z);
  }
}

let bad = 0;
const fail = (m) => { console.error('  FAIL  ' + m); bad = 1; };

if (!check) {
  console.log('zone'.padEnd(26) + 'colony'.padEnd(20) + 'space  ' +
              'layout'.padEnd(13) + 'terrain'.padEnd(9) + 'sector');
  console.log('-'.repeat(100));
}
const sig = new Set();
for (const m of rows) {
  if (!check) {
    console.log(String(m.name).slice(0, 25).padEnd(26) +
                String(m.colony).slice(0, 19).padEnd(20) +
                (m.jade ? 'JADE  ' : 'COAL  ') + ' ' +
                m.layout.padEnd(13) + m.terrain.padEnd(9) + m.sector);
  }
  if (!VISUAL[m.colonyId] && m.colonyId) fail(m.colonyId + ' has no COLONY_VISUAL row');
  if (!PALETTE[m.body]) fail(m.name + ' resolves to a palette body that does not exist: ' + m.body);
  // The facade pool retired with the texture pipeline; the kit COLOURWAY
  // replaced it, and it is the thing a zone must resolve now.
  if (!m.palette || !m.palette.length) fail(m.name + ' has no kit colourway');
  if (!m.lay || !m.plan) fail(m.name + ' did not resolve a layout or a sector plan');
  sig.add([m.layout, m.terrain, m.sector, m.jade].join('|'));
}

console.log('');
console.log('zones           :', rows.length);
console.log('orbital (no map):', orbital.length, orbital.length ? '- ' + [...new Set(orbital.map(o=>o.split('#')[0]))].join(', ') : '');
console.log('colonies        :', new Set(rows.map(r => r.colonyId)).size);
console.log('distinct shapes :', sig.size, '(layout x terrain x sector x space)');
const byLayout = {}, byTerrain = {}, bySector = {};
for (const m of rows) {
  byLayout[m.layout] = (byLayout[m.layout] || 0) + 1;
  byTerrain[m.terrain] = (byTerrain[m.terrain] || 0) + 1;
  bySector[m.sector] = (bySector[m.sector] || 0) + 1;
}
console.log('layouts         :', JSON.stringify(byLayout));
console.log('terrains        :', JSON.stringify(byTerrain));
console.log('sectors in use  :', Object.keys(bySector).length);

/* DISTINCTNESS IS ASSERTED, NOT ASSUMED. If every zone came out the same shape
   this whole derivation would be an expensive way to draw one city, and the
   failure would be invisible in any single screenshot. */
if (check) {
  if (sig.size < rows.length * 0.55)
    fail('only ' + sig.size + ' distinct shapes across ' + rows.length +
         ' zones - the derivation has collapsed');
  if (Object.keys(byLayout).length < 5)
    fail('only ' + Object.keys(byLayout).length + ' layouts in use');
  if (Object.keys(byTerrain).length < 5)
    fail('only ' + Object.keys(byTerrain).length + ' terrains in use');
  /* The orbital exclusions are asserted BY NAME. If a third colony ever falls
     out of the derivation it must be because somebody decided it is orbital,
     not because a table row went missing. */
  const orb = [...new Set(orbital.map(o => o.split('#')[0]))].sort().join(',');
  if (orb !== 'abaddon,flesh_station')
    fail('unexpected colonies have no battlefield: ' + (orb || '(none)'));
  console.log('');
  console.log(bad ? 'city-maps: FAILED' : 'city-maps: green');
}
process.exit(bad ? 1 : 0);
