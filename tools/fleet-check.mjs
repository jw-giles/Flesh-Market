// fleet-check
//
// Verifies the ship art the client asks for actually exists on disk, and that
// the ambient traffic rules behave. Ambient ships (scoundrels) are
// decoration: they must never enter the server fleet list and must never be
// interceptable, so this asserts the separation as well as the look.
//
// Requires jsdom:  npm i jsdom && node tools/fleet-check.mjs   (from repo root)
import fs from 'fs';
import path from 'path';
// jsdom is deliberately not a project dependency, so this check cannot run on a
// bare clone. It used to die with an ERR_MODULE_NOT_FOUND stack, which reads as
// "this tool is broken" and gets scrolled past, and that is exactly how a real
// failure in here survived: the assertion that catches it could not run. A loud
// SKIP says NOT RUN instead of pretending nothing was wrong.
let JSDOM = null;
try { ({ JSDOM } = await import('jsdom')); } catch (_) {}
if (!JSDOM) {
  console.log('\n  !!  NOT RUN  !!  jsdom is not installed, so none of these assertions executed.');
  console.log('      npm i jsdom      (from the repo root), then run this again.\n');
  process.exit(0);
}

const ROOT = process.cwd();
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; failures.push(n + (d ? '  [' + d + ']' : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); } };

const src = fs.readFileSync(path.join(ROOT, 'client/assets/galaxy.js'), 'utf8');

console.log('== Art referenced by the hull registry exists ==');
const reg = src.slice(src.indexOf('var FLEET_HULLS = {'), src.indexOf('function hullSrc'));
const keys = [...reg.matchAll(/^\s{2}([a-z_]+):\{/gm)].map(m => m[1]);
// The registry key is the class name and f is the file on disk. They diverged
// in 1.6.0.2 when the Circuit hulls were renamed, so resolve through f exactly
// as hullSrc does, or this check goes looking for sanban_map.png.
const fileOf = {};
for (const m of reg.matchAll(/^\s{2}([a-z_]+):\{ f:'([a-z_]+)'/gm)) fileOf[m[1]] = m[2];
const artFile = k => (fileOf[k] || k);
ok('the registry has hulls', keys.length >= 20, String(keys.length));
ok('every hull declares the file it is drawn from',
   keys.every(k => !!fileOf[k]), keys.filter(k => !fileOf[k]).join(','));
const missing = [];
for (const k of keys) for (const kind of ['map', 'detail']) {
  const p = path.join(ROOT, 'client/assets/space/ships/fleet', artFile(k) + '_' + kind + '.png');
  if (!fs.existsSync(p)) missing.push(artFile(k) + '_' + kind + '.png');
}
ok('every map and detail sprite is on disk', missing.length === 0, missing.slice(0, 5).join(','));

// Declared sizes must match the actual files, or the map draws stretched.
const declared = {};
for (const m of reg.matchAll(/^\s{2}([a-z_]+):\{[^}]*mw:(\d+), mh:(\d+), dw:(\d+), dh:(\d+)/gm))
  declared[m[1]] = { mw: +m[2], mh: +m[3], dw: +m[4], dh: +m[5] };
const png = f => { const b = fs.readFileSync(f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const wrong = [];
for (const k of keys) {
  const d = declared[k]; if (!d) { wrong.push(k + ' has no declared size'); continue; }
  const m = png(path.join(ROOT, 'client/assets/space/ships/fleet', artFile(k) + '_map.png'));
  const t = png(path.join(ROOT, 'client/assets/space/ships/fleet', artFile(k) + '_detail.png'));
  if (m.w !== d.mw || m.h !== d.mh) wrong.push(k + ' map ' + m.w + 'x' + m.h + ' declared ' + d.mw + 'x' + d.mh);
  if (t.w !== d.dw || t.h !== d.dh) wrong.push(k + ' detail ' + t.w + 'x' + t.h + ' declared ' + d.dw + 'x' + d.dh);
}
ok('declared sprite sizes match the files', wrong.length === 0, wrong.slice(0, 4).join('; '));

console.log('\n== Ships face right, which is what atan2(dy,dx)=0 means ==');
// Nose-right art has its mass to the left of centre for these hulls; a simple
// proxy is that every map sprite is wider than it is tall after rotation.
const portrait = keys.filter(k => declared[k].mw <= declared[k].mh);
ok('no map sprite is still portrait', portrait.length === 0, portrait.join(','));

console.log('\n== Ambient traffic rules ==');
const dom = new JSDOM('<!doctype html><body><svg id="gShips"></svg></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.fetch = () => new Promise(() => {});
window.requestAnimationFrame = () => 0;
window.cancelAnimationFrame = () => {};
window.t = (k, fb) => fb;
// A real tf, not a passthrough. The refusal lines interpolate {id} and {cls}
// through it precisely because a fallback built with + cannot be translated,
// so a stub that returns the raw fallback would let an uninterpolated string
// ship and still pass every check that only greps for a keyword.
window.tf = (k, fb, v) => String(fb).replace(/\{(\w+)\}/g, (m, key) =>
  (v && v[key] !== undefined) ? v[key] : m);
window.ME = { id: 'p', faction: 'coalition' };
try { window.eval(src); } catch (e) { console.log('  (galaxy.js threw on load: ' + e.message + ')'); }

const A = window._fmAmbient;
ok('the ambient module is exposed for checking', !!A);
if (A) {
  const pools = A.pools();
  const coalition = Object.values(pools.m).flat();
  const circuit   = Object.values(pools.j).flat();
  ok('the Circuit and Coalition merchant pools share no hull',
     !circuit.some(h => coalition.includes(h)));
  ok('scoundrels are in neither merchant pool',
     !pools.s.some(h => coalition.includes(h) || circuit.includes(h)));
  ok('Yujing is Circuit space and New Anchor is not',
     A.isJadeWorld('yujing') && !A.isJadeWorld('new_anchor'));

  // The whole point of 1.6.0.2: a Circuit lane must never be painted with a
  // Coalition hull, and vice versa. This is the assertion that would have
  // caught the original bug.
  for (const v of ['v1','v2','v3']) {
    ok('a Circuit lane on ' + v + ' draws only Changzheng hulls',
       A.poolForLane('yujing','tiangong',v).every(h => circuit.includes(h)),
       A.poolForLane('yujing','tiangong',v).join('/'));
    ok('a Coalition lane on ' + v + ' draws no Changzheng hull',
       A.poolForLane('new_anchor','cascade_station',v).every(h => coalition.includes(h)),
       A.poolForLane('new_anchor','cascade_station',v).join('/'));
  }

  let greyHits = 0;
  for (let i = 0; i < 4000; i++) { const l = A.pickScoundrelLane();
    if (['the_hollow','null_point','the_ledger','the_escrow','dust_basin']
        .some(g => l.from === g || l.to === g)) greyHits++; }
  console.log('  4000 scoundrel rolls: ' + (100*greyHits/4000).toFixed(1) + '% on grey routes');
  ok('scoundrels favour the routes nobody files paperwork on', greyHits / 4000 > 0.2,
     (100*greyHits/4000).toFixed(1) + '%');

  ok('hull choice is deterministic for the same seed',
     A.hullFor(pools.j.v2, 'abc') === A.hullFor(pools.j.v2, 'abc'));
  const spread = new Set(); for (let i = 0; i < 400; i++) spread.add(A.hullFor(pools.j.v2, 'seed' + i));
  ok('and spreads across the whole Changzheng v2 pool', spread.size === pools.j.v2.length,
     spread.size + '/' + pools.j.v2.length);

  A.clear();
  for (let i = 0; i < 12; i++) A.spawn('scoundrel');
  const list = A.list();
  ok('ambient ships spawn', list.length > 0, String(list.length));
  ok('every ambient ship is flagged ambient and carries no npc payload',
     list.every(s => s.ambient === true && !s.npc));
  ok('ambient ships never enter the server fleet list',
     !window.gShipList || !window.gShipList.some(s => s.ambient));
  ok('each has an ident and a hull', list.every(s => !!s.ident && !!s.hullKey));
  const idents = list.map(s => s.ident);
  ok('every ambient ship is a scoundrel', list.every(s => s.kind === 'scoundrel'));
  ok('no ambient hull carries a VDF ident any more',
     list.every(s => !s.ident.startsWith('VDF-')), idents.join(' '));
  ok('the readout entry point exists', typeof window.openAmbientReadout === 'function');
  A.clear();
  ok('clearing removes them all', A.list().length === 0);
}

console.log('\n== Thrust sits ON the stern, and clicks actually do something ==');
if (A) {
  A.clear();
  window._spawnServerShipForce({ id:'chk1', from:'new_anchor', to:'cascade_station',
    variant:'v2', progress:0.4, startTs:Date.now()-1000, arriveTs:Date.now()+60000,
    cargo:[{commodityName:'Optic Cabling', qty:49}] });
  const grp = window.document.getElementById('gShips').querySelector('g');
  ok('a merchant ship rendered', !!grp);
  window._fmTickOnce();
  const imgs = [...grp.querySelectorAll('image')];
  const thrust = imgs.find(i => /thrust/.test(i.getAttribute('href') || ''));
  const body   = imgs.find(i => !/thrust/.test(i.getAttribute('href') || ''));
  const tx = parseFloat(thrust.getAttribute('x')), tw = parseFloat(thrust.getAttribute('width'));
  const ty = parseFloat(thrust.getAttribute('y')), th = parseFloat(thrust.getAttribute('height'));
  const bh = parseFloat(body.getAttribute('height'));
  console.log('  hull h ' + bh + '   thrust x ' + tx + ' w ' + tw + ' -> ends at ' + (tx + tw));
  // The stern is local x=0. The plume must reach it, not burn in open space.
  ok('the plume touches the stern instead of floating behind it',
     tx + tw >= 0 && tx + tw <= 2, 'ends at ' + (tx + tw));
  ok('the plume is behind the hull, not on top of it', tx < 0, String(tx));
  ok('the plume is vertically centred on the hull',
     Math.abs((ty + th / 2) - bh / 2) < 1.01, 'plume mid ' + (ty + th/2) + ' hull mid ' + bh/2);
  ok('the plume is scaled to the hull, not left at a fixed size', th <= bh + 1, th + ' vs ' + bh);
  // 1.6.0.2: the v3 base carried a ventral plume pinned at local (9,14) that
  // defWithHull never overwrote. On the 9 tall Pocket Carrier that rect began
  // five pixels below the hull. Nothing may render outside the hull band now.
  const strays = imgs.filter(i => {
    const y = parseFloat(i.getAttribute('y') || '0');
    const h2 = parseFloat(i.getAttribute('height') || '0');
    return y > bh + 1 || y + h2 < -1;
  });
  ok('nothing renders below or above the hull band', strays.length === 0,
     strays.map(i => i.getAttribute('href')).join(' '));

  // No hull may wear a plume longer than about a third of its own length.
  const H = window._fmFleet.HULLS;
  const fat = Object.keys(H).map(k => {
    const hl = H[k];
    const w2 = Math.max(5, Math.round(Math.min(hl.mh * 0.85, hl.mw * 0.35)));
    return { k, r: w2 / hl.mw };
  }).filter(e => e.r > 0.40);
  ok('no hull wears a plume over 40% of its own length', fat.length === 0,
     fat.map(e => e.k + ' ' + (100*e.r).toFixed(0) + '%').join(' '));

  let opened = null;
  const realOpen = window.openShipManifest;
  window.openShipManifest = s2 => { opened = s2; realOpen(s2); };
  grp.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles:true, cancelable:true }));
  const modal = window.document.getElementById('ship-manifest-modal');
  ok('clicking a merchant opens the transit log', !!opened && modal &&
     modal.className.indexOf('open') >= 0, modal ? modal.className : 'no modal');
  // The hull is picked deterministically from the npc id, so assert it is one of
  // the pool for this variant rather than pinning a specific name.
  const shown = (window.document.getElementById('smm-class') || {}).textContent;
  const v2names = A.pools().m.v2.map(k => window._fmFleet.HULLS[k].n);
  ok('and it names the hull it is actually drawing', v2names.includes(shown),
     shown + ' not in ' + v2names.join('/'));
  ok('and lists the real cargo',
     /Optic Cabling/.test((window.document.getElementById('smm-cargo') || {}).textContent || ''));

  if (modal) modal.className = '';
  let toast = null;
  window.gToast = m => { toast = m; };
  ok('gToast is exported from its IIFE', typeof window.gToast === 'function');
  for (const kind of ['scoundrel']) {
    A.clear(); toast = null;
    A.spawn(kind);
    A.list()[0].grp.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles:true, cancelable:true }));
    ok(kind + ' refuses the scan instead of opening a panel',
       !!toast && /REFUSED/.test(toast) && modal.className.indexOf('open') < 0,
       toast || 'no toast');
  }
  A.clear();
}

console.log('\n---------------------------------------------');
console.log('\n== Circuit lanes fly Circuit hulls end to end ==');
if (A) {
  A.clear();
  // The Coalition ship from the previous block is still parked in gShips and
  // querySelector would hand back its <g>, so empty the layer first.
  window.document.getElementById('gShips').innerHTML = '';
  window._spawnServerShipForce({ id:'czchk', from:'yujing', to:'tiangong',
    variant:'v3', progress:0.4, startTs:Date.now()-1000, arriveTs:Date.now()+60000,
    cargo:[{commodityName:'Optic Cabling', qty:12}] });
  const H = window._fmFleet.HULLS;
  const grp2 = window.document.getElementById('gShips').querySelector('g');
  ok('a Circuit freighter rendered', !!grp2);
  if (grp2) {
    window._fmTickOnce();
    const body2 = [...grp2.querySelectorAll('image')]
      .map(i => i.getAttribute('href') || '')
      .find(h => /fleet\//.test(h) && !/thrust/.test(h)) || '';
    const file = (body2.split('/').pop() || '').replace('_map.png', '');
    const circuitFiles = Object.keys(H).filter(k => H[k].faction === 'jade').map(k => H[k].f);
    const coalitionFiles = Object.keys(H).filter(k => H[k].role === 'merchant' && H[k].faction !== 'jade').map(k => H[k].f);
    ok('and it is drawn from a Changzheng hull', circuitFiles.includes(file), body2);
    ok('and not from a Coalition one', !coalitionFiles.includes(file), body2);

    // 1.6.0.5: a Circuit hull carries real freight and moves real prices, and
    // the station still cannot read it. The deep-scan stops at the border, so
    // the click has to produce a refusal and leave the panel shut.
    const modal2 = window.document.getElementById('ship-manifest-modal');
    if (modal2) modal2.className = '';
    let toast2 = null;
    window.gToast = m => { toast2 = m; };
    grp2.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles:true, cancelable:true }));
    ok('clicking it is refused by the Flesh Station deep-scan',
       !!toast2 && /REFUSED/.test(toast2), String(toast2));
    // 1.2.3 reframed this: the scan is a SENSOR, not a jurisdiction. Flesh
    // Station reads a Changzheng hull fine once it is on this side of the gate;
    // what it cannot do is see past the gate, because it is not in that
    // cluster. So the refusal has to give range as the reason, and must not
    // read as the hull being unregistered or the Circuit refusing to file.
    ok('the refusal gives sensor range as the reason',
       !!toast2 && /sensor range/i.test(toast2) && !/unregistered/.test(toast2), String(toast2));
    ok('and names the passage as the limit', !!toast2 && /passage/i.test(toast2), String(toast2));
    ok('and it names the hull actually being drawn',
       !!toast2 && /CZ-\d/.test(toast2), String(toast2));
    ok('and the transit log stays shut',
       !window.document.getElementById('ship-manifest-modal') ||
       window.document.getElementById('ship-manifest-modal').className.indexOf('open') < 0);
  }

  // The refusal is a border rule, not a hull rule: a Coalition hull would be
  // refused too if it were somehow flying a Circuit lane, and a Circuit hull
  // on a Coalition lane would be scanned. Assert the rule reads the lane.
  const SG = window._fmFleet.shipGalaxy;
  ok('the scan rule keys off the lane, not the hull art',
     SG('yujing','tiangong') === 'jade' &&
     SG('new_anchor','cascade_station') === 'coalition');
}


console.log('\n== A sector shows its own traffic and only its own ==');
if (A) {
  const layer = window.document.getElementById('gShips');
  layer.innerHTML = '';
  const mk = (id,a,b,v) => window._spawnServerShipForce({ id, from:a, to:b, variant:v,
    progress:0.3, startTs:Date.now()-1000, arriveTs:Date.now()+60000,
    cargo:[{commodityName:'Optic Cabling', qty:5}] });
  mk('sc1','new_anchor','cascade_station','v2');
  mk('sc2','flesh_station','aurora_prime','v1');
  mk('sj1','yujing','tiangong','v3');
  mk('sj2','houtu_foundry','changzheng_yards','v1');

  const kids = () => [...layer.children];
  ok('every hull is tagged with the sector it flies in',
     kids().every(k => ['jade','coalition'].includes(k.getAttribute('data-gx'))),
     kids().map(k => k.getAttribute('data-gx')).join(','));
  ok('and the tag matches the lane, not the hull art',
     kids().filter(k => k.getAttribute('data-gx') === 'jade').length === 2,
     kids().map(k => k.getAttribute('data-gx')).join(','));

  const V = window._fmGalaxyView;
  ok('the view hook is exposed', !!V && typeof V.swap === 'function');
  if (V) {
    // A swap CLEARS the layer and lets the reconcile repopulate it, so the
    // ships spawned above do not survive it. The old version of this block
    // counted them after swapping and had been failing ever since the clear
    // landed; it needed jsdom to run, so nobody saw it. Respawn per phase,
    // which is what the reconcile does in production.
    /* *** THE JADE HALF OF THIS BLOCK HAS NEVER RUN, AND THAT IS THE WHOLE
       FAILURE. *** V.swap('jade') is REFUSED when the passage is sealed, and
       PASSAGE_OPEN starts { jade:false }, so the swap did nothing, the view
       stayed on coalition, and the block then asserted "the jade view shows
       nothing tagged coalition" against a coalition view. It reported two
       coalition hulls as a leak into Circuit space. They were not a leak. They
       were coalition hulls in the coalition view, drawn correctly, and the
       refusal that kept them there was the seal doing its job.

       A CHECK THAT SILENTLY TESTS THE WRONG STATE IS WORSE THAN ONE THAT
       FAILS, because the failure it produces names a bug that does not exist -
       and this one named a player-visible fault on the galaxy map for as long
       as it has been red. So the swap is asserted before anything is asserted
       about its consequences.

       Opened for the duration and restored afterwards, which is what a check
       exercising a gated view has to do: the alternative is asserting only the
       half of the behaviour the default state happens to reach. */
    const _wasOpen = !!(window._PASSAGE_OPEN && window._PASSAGE_OPEN.jade);
    if (typeof window._setPassage === 'function') window._setPassage('jade', true);
    for (const phase of ['coalition','jade']) {
      if (V.get() !== phase) V.swap(phase);
      /* THE SWAP IS ASSERTED, NOT ASSUMED. Everything below reads the view it
         thinks it is in; if the swap was refused, every one of them is testing
         a different galaxy than its own message claims. */
      ok('the view actually swapped to ' + phase, V.get() === phase, V.get());
      if (V.get() !== phase) continue;
      mk('sc1','new_anchor','cascade_station','v2');
      mk('sc2','flesh_station','aurora_prime','v1');
      mk('sj1','yujing','tiangong','v3');
      mk('sj2','houtu_foundry','changzheng_yards','v1');
      const L = window.document.getElementById('gShips');
      // The layer itself must never be hidden wholesale. Doing that is what
      // made Circuit space look like it had no freight at all while Circuit
      // hulls kept drawing over Coalition space, whose coordinates overlap.
      ok('the ship layer is not hidden wholesale in ' + phase + ' view',
         L.style.display !== 'none', L.style.display || '(default)');
      const shown = [...L.children].filter(k => k.style.display !== 'none');
      ok(phase + ' view shows some traffic after a swap', shown.length > 0, String(shown.length));
      const wrong = shown.filter(k => (k.getAttribute('data-gx') === 'jade') !== (phase === 'jade'));
      ok('and shows nothing from the other sector', wrong.length === 0,
         wrong.map(k => k.getAttribute('data-gx')).join(','));
    }
    if (V.get() !== 'coalition') V.swap('coalition');
    if (typeof window._setPassage === 'function') window._setPassage('jade', _wasOpen);
    /* AND THE SEAL ITSELF, which is what the old block was accidentally
       testing and never said so. Sealed, a swap to Circuit space is refused
       and the view does not move; the Coalition is always reachable because it
       is home. */
    /* Asserted on the VIEW rather than on a return value: the hook is
       swap:function(to){ swapGalaxy(to); } and returns undefined either way, so
       `V.swap(...) !== undefined || true` would be a tautology that passes on a
       broken seal. What the seal is for is that the view does not move. */
    V.swap('jade');
    ok('a sealed passage refuses the swap and the view does not move',
       V.get() === 'coalition', V.get());
    ok('home is always reachable', (V.swap('coalition'), V.get() === 'coalition'));
  }
}

console.log('\n== A swap does not permanently kill the fleet ==');
// THE BUG THIS EXISTS FOR: gShipList and gServerShips are var-scoped inside the
// ship IIFE. swapGalaxy sits outside it and used to assign them directly, which
// made two globals nobody reads and left the real gServerShips holding every id
// it had seen. spawnServerShip opens with `if (gServerShips[npc.id]) return;`,
// so after ONE swap the reconcile refused to respawn anything for the rest of
// the session. This is behavioural on purpose: a grep for the old assignment
// would pass the moment somebody reintroduced it under another name.
if (A) {
  const L = () => window.document.getElementById('gShips');
  const mk2 = (id,a,b) => window._spawnServerShipForce({ id, from:a, to:b, variant:'v1',
    progress:0.3, startTs:Date.now()-1000, arriveTs:Date.now()+60000, cargo:[{commodityName:'X',qty:1}] });
  const V = window._fmGalaxyView;
  ok('a fleet reset is exported from the ship module',
     typeof window._fmFleetReset === 'function');
  L().innerHTML = ''; window._fmFleetReset();
  mk2('reuse1','new_anchor','cascade_station');
  ok('a ship spawns before the reset', L().children.length === 1, String(L().children.length));
  window._fmFleetReset();
  ok('the reset empties the layer', L().children.length === 0, String(L().children.length));
  mk2('reuse1','new_anchor','cascade_station');
  ok('THE SAME npc id can respawn after a reset', L().children.length === 1,
     'a stale gServerShips is what blocks this');
  if (V) {
    L().innerHTML = ''; window._fmFleetReset();
    mk2('swaptest','new_anchor','cascade_station');
    V.swap('jade'); V.swap('coalition');
    mk2('swaptest','new_anchor','cascade_station');
    ok('and after a full swap round trip', L().children.length === 1,
       String(L().children.length) + ' (0 means swap left gServerShips stale)');
  }
  ok('swapGalaxy does not write to the IIFE vars from outside',
     !/try \{ gShipList = \[\]; gServerShips = \{\}; \} catch/.test(src));
}

console.log(`${pass} passed, ${fail} failed`);
failures.forEach(f => console.log('  - ' + f));
process.exit(fail ? 1 : 0);
