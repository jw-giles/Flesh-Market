// ═══════════════════════════════════════════════════════════════════════════
// reach-check.mjs — Khai'sultull Reach and the galaxy registry.
//
// The galaxy system used to be a boolean wearing a string: two values, an
// if/else portal, a ternary nebula, a toggle swap. This asserts it is now a
// registry, that adding the Reach did not move the Circuit, and that the
// Reach's gate is deliberately absent from the galaxy map.
//
//   node tools/reach-check.mjs
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';

const gx  = fs.readFileSync('client/assets/galaxy.js', 'utf8');
const srv = fs.readFileSync('server/server.js', 'utf8');
const core= fs.readFileSync('client/assets/core.js', 'utf8');
const city= fs.readFileSync('server/city.js', 'utf8');
const ks  = fs.readFileSync('client/assets/khai-script.js', 'utf8');
const cityc = fs.readFileSync('client/assets/city.js', 'utf8');
const troops = fs.readFileSync('client/assets/coalition-sprites.js', 'utf8');
const facs   = fs.readFileSync('client/assets/factions.js', 'utf8');
const idx = fs.readFileSync('client/index.html', 'utf8');

// Evaluate the script module in a fake window so the checks exercise the real
// renderer rather than grepping it. A regex cannot tell you that Ossuveth draws.
let KS = null;
try { const w = {}; new Function('window', ks)(w); KS = w.KhaiScript; }
catch (e) { console.error('[check] khai-script did not evaluate:', e.message); }

let pass = 0; const fails = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fails.push(label + (detail ? '  [' + detail + ']' : '')); console.log('  FAIL  ' + label + (detail ? '  [' + detail + ']' : '')); }
}
function section(t) { console.log('\n' + t); }

// A SLICE BOUNDED BY IDENTIFIERS CAN COME BACK EMPTY. If a terminator moves
// above the start, or either anchor is renamed or deleted, indexOf yields a
// range that produces ''. Every ABSENCE check against '' passes, so a vacuous
// span silently converts a real assertion into a yes.
//
// That is not hypothetical: deleting a dead export in 1.5.0.3 broke a raid
// slice, and it only failed loudly because the terminator vanished entirely
// rather than moving earlier. This proves a span exists before anything is
// asserted about its contents, so the failure is the span rather than the
// property.
function span(label, text, min) {
  const n = (text || '').length;
  ok('span resolves: ' + label, n >= (min === undefined ? 40 : min), n + ' chars');
  return text || '';
}

// A SUBSTRING MATCH IS SATISFIED BY A COMMENT. Commenting out the one call
// that drives works from the payload left the text in the file and the
// assertion went on passing, which is the vacuous-pass class this suite exists
// to find, caught here by a negative control rather than by review.
//
// Block comments and comments that OWN their line are removed. Trailing `//`
// after code is left alone deliberately: stripping it needs a real tokenizer to
// avoid eating the inside of a regex literal or a string, and this file is full
// of both. The property that matters is that a call has not been commented
// OUT, and commenting a call out puts the marker at the head of the line.
function live(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const rbLive = () => live(fs.readFileSync('client/assets/reach-battle.js', 'utf8'));

// Pull the registry object out of the source and evaluate it in isolation.
const rs = gx.indexOf('var GALAXIES = {');
const re = gx.indexOf('function galaxyOf(');
let GALAXIES = null;
try {
  GALAXIES = eval('(' + gx.slice(rs, re).replace('var GALAXIES = ', '').replace(/;\s*$/, '') + ')');
} catch (e) { /* reported below */ }

section('Registry');
ok('GALAXIES parses as an object literal', !!GALAXIES);
if (!GALAXIES) { console.log('\n0 passed, 1 failed'); process.exit(1); }

const ids = Object.keys(GALAXIES);
ok('three galaxies registered', ids.length === 3, ids.join(','));
ok('coalition is the home galaxy', GALAXIES.coalition.home === true);
ok('home galaxy has no inbound gate', GALAXIES.coalition.gate === null);
for (const id of ids) {
  const d = GALAXIES[id];
  ok(id + ': label, nebula and accent present', !!(d.label && d.nebula && d.accent));
  if (!d.home) {
    ok(id + ': declares a seal key', !!d.sealKey);
    ok(id + ': gate kind is map or orbit', ['map', 'orbit'].includes(d.gate && d.gate.kind), d.gate && d.gate.kind);
    ok(id + ': reachable from coalition space', d.gate && d.gate.from === 'coalition');
    ok(id + ': has a way home', !!d.ret);
    ok(id + ': has sealed wording', !!d.sealBanner);
  }
}

section('The Circuit must not have moved');
ok('jade gate still at (990,150) size 120',
   GALAXIES.jade.gate.x === 990 && GALAXIES.jade.gate.y === 150 && GALAXIES.jade.gate.size === 120);
ok('jade return still at (990,250)', GALAXIES.jade.ret.x === 990 && GALAXIES.jade.ret.y === 250);
ok('jade nebula unchanged', GALAXIES.jade.nebula === 'assets/space/backgrounds/jade_green.png');
ok('jade seal key still "jade" so the DB row still matches', GALAXIES.jade.sealKey === 'jade');
ok('server still persists the Circuit under wormhole_open',
   /const WORMHOLE_KEY = 'wormhole_open';/.test(srv));

section('The Reach gate sits above Abaddon');
const kg = GALAXIES.khaisultull.gate;
ok('Reach gate is on the map, not inside a system view', kg.kind === 'map');
ok('positioned above Abaddon (x 490, y 22)', kg.x === 490 && kg.y < 0);
ok('labels render above the sprite so they clear Abaddon', kg.labelAbove === true);
{
  // geometry, against the shipped numbers
  const lab1 = kg.y - kg.size * 0.62 - 18;
  const spriteBot = kg.y + kg.size / 2;
  const abaddonTop = 22 - 18;
  const vbTop = Number((GALAXIES.coalition.viewBox || '').split(/\s+/)[1]);
  ok('gate sprite clears Abaddon', spriteBot < abaddonTop, String(abaddonTop - spriteBot));
  ok('labels clear Abaddon', lab1 < abaddonTop);
  ok('everything fits inside the coalition viewBox', lab1 > vbTop, lab1 + ' vs ' + vbTop);
}
const mapFrom = (g) => ids.filter(k => GALAXIES[k].gate && GALAXIES[k].gate.kind === 'map' && GALAXIES[k].gate.from === g);
ok('coalition map now draws two portals: the Circuit and the Reach',
   mapFrom('coalition').length === 2, mapFrom('coalition').join(','));
ok('renderPortal iterates gates rather than rendering one',
   /mapGates\(activeGalaxy\)\.forEach/.test(gx));
ok('the system-view gate renderer is gone', !/og\.g\.orbitPad/.test(gx));
ok('every galaxy declares a viewBox', ids.every(k => !!GALAXIES[k].viewBox));
ok('swap applies the galaxy viewBox', /svg\.setAttribute\('viewBox', vb\)/.test(gx));
ok('index.html ships the extended coalition viewBox',
   /viewBox="-150 -210 1200 1030"/.test(fs.readFileSync('client/index.html','utf8')));

section('Binary assumptions are gone');
ok('swapGalaxy takes a destination', /function swapGalaxy\(to\)/.test(gx));
ok('nebula comes from the registry, not a ternary',
   /galaxyDef\(activeGalaxy\)\.nebula/.test(gx));
ok('seal banner text comes from the registry',
   /galaxyDef\(activeGalaxy\)\.sealBanner/.test(gx));
/* ASKS THE SEAL, NOT THE PERMISSION. This matched passageOpen, which now
   returns true for a dev - so with it the banner would go dark for the one
   reader who most needs to know the passage is shut: the person about to open
   it. passageSealed reports the state of the seal regardless of who is asking. */
ok('seal banner shows for any sealed non-home galaxy',
   /activeGalaxy==='coalition' \|\| !passageSealed\(activeGalaxy\)/.test(gx));
ok('and the seal state and the viewer permission are two different questions',
   /function passageSealed\(galaxyId\)/.test(gx) && /function devBypassesSeal\(\)/.test(gx));
ok('passageEndpoints no longer hardcodes jade',
   !/isJadeWorld\(fromId\) === \(activeGalaxy === 'jade'\)/.test(gx));
ok('no live reads of the old WORMHOLE_OPEN binding remain',
   (gx.match(/[^_]WORMHOLE_OPEN/g) || []).length === 0,
   String((gx.match(/[^_]WORMHOLE_OPEN/g) || []).length));

section('Reach worlds');
const worlds = (gx.match(/galaxy:'khaisultull'/g) || []).length;
ok('ten Reach worlds declared', worlds === 10, String(worlds));
ok('every Reach world carries a terrain key',
   (gx.match(/khai:true, revealed:false/g) || []).length === worlds);
ok('every Reach world has a hidden true name',
   (gx.match(/khaiName:/g) || []).length === worlds);
ok('Reach worlds start unrevealed', !/revealed:true/.test(gx));
ok('Reach worlds carry no companies or lanes yet',
   !/ks_\d[\s\S]{0,400}?companies:\['/.test(gx));
const visual = city.slice(city.indexOf('export const COLONY_VISUAL'));
const ksTerrain = (visual.match(/ks_[a-z0-9_]+:\s*\{ layout/g) || []).length;
ok('terrain authored server-side for all ten', ksTerrain === 10, String(ksTerrain));

section('Passage plumbing');
ok('server holds a separate Reach flag', /let REACH_OPEN = false;/.test(srv));
ok('Reach defaults SEALED', /let REACH_OPEN = false;/.test(srv));
ok('Reach persists under its own key', /const REACH_KEY = 'passage_khaisultull';/.test(srv));
ok('Reach state restored at boot', /getCityKV\(REACH_KEY\)/.test(srv));
ok('dev endpoint exists', /app\.post\('\/api\/dev\/reach'/.test(srv));
ok('dev endpoint is dev-gated', /\/api\/dev\/reach'[\s\S]{0,600}?isDevAccount\(actor\.id\)/.test(srv));
ok('Reach state ships in the init payload', /reachOpen:REACH_OPEN/.test(srv));
ok('client handles the generic passage broadcast',
   /msg\.type === 'passage'/.test(core));
ok('client applies reachOpen on init', /_setPassage\('khaisultull'/.test(core));
ok('_setWormhole still works for the Circuit', /window\._setWormhole = function\(open\)\{ window\._setPassage\('jade', open\); \};/.test(gx));

const panel = fs.readFileSync('client/assets/god-panel.js','utf8');
const html  = fs.readFileSync('client/index.html','utf8');
const reach = fs.readFileSync('server/reach.js','utf8');

section('War state module');
ok('reach.js exists and exports the world list', /export const REACH_WORLDS/.test(reach));
{
  const listed = (reach.match(/'ks_[a-z0-9_]+'/g) || []).map(x => x.replace(/'/g,''));
  const metaBlock = gx.slice(gx.indexOf('var COLONY_META'), gx.indexOf('var LANES'));
  const inMeta = [...metaBlock.matchAll(/^\s*(ks_[a-z0-9_]+):\s*\{/gm)].map(m => m[1]);
  const same = listed.length === inMeta.length && listed.every(id => inMeta.includes(id));
  ok('server world list matches COLONY_META exactly', same,
     listed.length + ' vs ' + inMeta.length);
}
ok('front cap is enforced server-side', /frontCount\(\) >= MAX_FRONTS/.test(reach));
ok('two fronts maximum', /export const MAX_FRONTS = 2;/.test(reach));
ok('state is one KV blob, not a new table', /const KEY = 'reach_state';/.test(reach));
ok('loader merges rather than trusts a stale save', /if \(parsed\.worlds\[id\]\) Object\.assign/.test(reach));
ok('taking a world reveals its name', /if \(toSide === 'coalition'\) w\.revealed = 1;/.test(reach));
ok('an accord closes fronts but keeps the map', /for \(const id of REACH_WORLDS\) s\.worlds\[id\]\.front = 0;/.test(reach));
ok('no cash path anywhere in the war state',
   !/\.cash\b|savePlayer|giveCash/.test(reach));

section('Announce then execute');
ok('arming is action and world specific',
   /s\.armed\.action !== action \|\| s\.armed\.world !== id/.test(reach));
ok('arm window is bounded', /ARM_WINDOW_MS/.test(reach));
ok('flip arms on first call', /if \(!reachIsArmed\(tag, world\)\)/.test(srv));
ok('accord arms on first call', /if \(!reachIsArmed\('accord', '\*'\)\)/.test(srv));
ok('reset arms on first call', /if \(!reachIsArmed\('reset', '\*'\)\)/.test(srv));

section('Dispatcher');
for (const c of ['reach_get','reach_passage','reach_control','reach_garrison','reach_reveal',
                 'reach_front','reach_flip','reach_disarm','reach_say','reach_demand',
                 'reach_demand_answer','reach_peace','reach_accord','reach_reset'])
  ok('handler: ' + c, new RegExp("cmd === '" + c + "'").test(srv));
ok('handlers sit inside the dev-gated god_cmd block',
   srv.indexOf("cmd === 'reach_get'") > srv.indexOf("if (!isDevAccount(playerId))"));
ok('voice uses the real headline function, not a guessed one',
   /pushHeadline\("KHAI'SULTULL/.test(srv) && !/injectHeadline/.test(srv));

section('Panel');
ok('tab button present', /data-tab="reach"/.test(html));
ok('tab body present', /id="godTab-reach"/.test(html));
ok('opening the tab pulls state', /if \(tab === 'reach'\) godCmd\(\{ cmd:'reach_get' \}\)/.test(panel));
ok('renderer defined', /window\.reachRender = function/.test(panel));
ok('client routes reach_state', /msg\.type === 'reach_state'/.test(core));
ok('client routes reach_voice', /msg\.type === 'reach_voice'/.test(core));
// The original list guarded against controls for a layer that had not been
// built. Waves are built now and reach_waves is a real handler with a real
// control, so it comes off the list; tempo and blast are still renderer knobs
// with no business on a GM panel.
ok('no tuning controls wired to a war layer that does not exist',
   !/reach_tempo|reach_blast/.test(panel + srv));

const codec = fs.readFileSync('client/assets/codec.js','utf8');
const cdata = fs.readFileSync('client/assets/codec-data.js','utf8');

section('Envoy');
{
  const w = {};
  (new Function('window', cdata + '\nreturn window;'))(w);
  const reps = w.FM_CODEC.reps;
  const envoy = reps.find(r => r.id === 'khaisultull');
  ok('faction registered with its own relay name',
     w.FM_CODEC.factions.khaisultull && w.FM_CODEC.factions.khaisultull.sys === 'TRANSLATION LAYER');
  ok('envoy present', !!envoy);
  ok('envoy static enabled is false', envoy && envoy.enabled === false);
  ok('envoy gates on live state, not shipped data', typeof (envoy && envoy.gate) === 'function');
  ok('exactly one rep uses a live gate', reps.filter(r => r.gate).length === 1);
  ok('portrait needs no asset file', /^data:image\/svg/.test(envoy.portrait));
  ok('no em dashes in the envoy', !JSON.stringify(envoy).includes('\u2014'));

  // Walk every rep's tree, modelling BOTH node kinds the engine supports:
  // option nodes and faction routers ({branch:{faction,match,other}}). A walker
  // that only knows about options reports routers as dead ends, which is a
  // false positive against four shipped contacts.
  function walk(nodes, k, seen) {
    seen = seen || new Set();
    if (seen.has(k)) return false;
    seen.add(k);
    const n = nodes[k];
    if (!n) return true;
    if (n.branch) return walk(nodes, n.branch.match, seen) || walk(nodes, n.branch.other, seen);
    const o = n.options || [];
    if (!o.length) return true;
    return o.some(x => x.end || (x.next && walk(nodes, x.next, seen)));
  }
  let stuck = 0, dangling = 0, reps_walked = 0;
  for (const r of reps) {
    if (!r.tree) continue;
    reps_walked++;
    const n = r.tree.nodes;
    for (const k of Object.keys(n)) if (!walk(n, k)) stuck++;
    for (const [k, v] of Object.entries(n)) {
      (v.options || []).forEach(o => { if (o.next && !n[o.next]) dangling++; });
      if (v.branch) for (const d of [v.branch.match, v.branch.other]) if (d && !n[d]) dangling++;
    }
  }
  ok('every contact tree walked', reps_walked >= 6, String(reps_walked));
  ok('no node in any contact can trap a caller', stuck === 0, String(stuck));
  ok('no dangling links in any contact', dangling === 0, String(dangling));

  const nodes = envoy.tree.nodes;
  ok('envoy has six topics off root', nodes.root.options.length - 1 === 6);
  const seen = new Set(), q = [envoy.tree.start];
  while (q.length) { const k = q.pop(); if (seen.has(k)) continue; seen.add(k);
    (nodes[k].options || []).forEach(o => { if (o.next) q.push(o.next); }); }
  ok('every envoy node reachable from start',
     Object.keys(nodes).every(k => seen.has(k)));
  ok('the demand node quotes live state', /\{demand\}/.test(nodes.want1.text));
}

section('Codec engine');
ok('repEnabled consults a live gate', /typeof r\.gate === 'function'/.test(codec));
ok('a throwing gate fails closed', /catch\(e\)\{ return false; \}/.test(codec));
ok('resolveTokens resolves {demand}', /out\.indexOf\('\{demand\}'\)/.test(codec));
ok('an unset demand falls back rather than printing the token',
   /Nothing at this time/.test(codec));
ok('envoy flag lives in the war state', /envoy: 0,/.test(reach));
ok('envoy handler exists', /cmd === 'reach_envoy'/.test(srv));
ok('panel exposes the line switch', /window\.reachEnvoy = function/.test(panel));
ok('contacts list refreshes when the line opens', /window\.FMContacts\.open\(\)/.test(core));

const seed = fs.readFileSync('server/seed_devaccounts.mjs','utf8');
const man  = fs.readFileSync('client/assets/portrait-manifest.js','utf8');

section('Ships must not leak between galaxies');
// The old tag was 'both' and tagShipGalaxy read it as "show everywhere". With
// two galaxies that was right by accident. With three it put Circuit traffic
// in Khai'sultull space.
ok('crossing runs are tagged with their two ends, not "both"',
   /a === b \? a : \(a < b \? a \+ '\|' \+ b : b \+ '\|' \+ a\)/.test(gx));
ok("no 'both' tag remains", !/return 'both';/.test(gx));
ok('a single visibility rule exists', /function shipVisibleIn\(tag, gx\)/.test(gx));
ok('tagShipGalaxy uses it', /grp\.style\.display = shipVisibleIn\(gx, activeGalaxy\)/.test(gx));
ok('applyShipGalaxyFilter uses the same rule',
   /kids\[i\]\.style\.display=shipVisibleIn\(gx,activeGalaxy\)/.test(gx));
ok('isPassageRun compares galaxies, not jade-or-not',
   /return galaxyOf\(fromId\) !== galaxyOf\(toId\);/.test(gx));
{
  // exercise the real rule
  const shipGalaxy = (a,b) => a === b ? a : (a < b ? a+'|'+b : b+'|'+a);
  const vis = (tag,g) => !tag ? false : tag === g ? true
            : tag.indexOf('|') >= 0 && tag.split('|').indexOf(g) >= 0;
  ok('a Circuit passage run is hidden in the Reach',
     !vis(shipGalaxy('coalition','jade'), 'khaisultull'));
  ok('a Circuit passage run still shows on both its own ends',
     vis(shipGalaxy('coalition','jade'),'coalition') && vis(shipGalaxy('coalition','jade'),'jade'));
  ok('an internal Reach run shows only in the Reach',
     vis(shipGalaxy('khaisultull','khaisultull'),'khaisultull')
     && !vis(shipGalaxy('khaisultull','khaisultull'),'coalition'));
  ok('a Coalition run is hidden in the Reach',
     !vis(shipGalaxy('coalition','coalition'),'khaisultull'));
}

section('God panel connectivity');
ok('godSend uses the queueing shim, not a raw socket reference',
   /window\.ws && typeof window\.ws\.send === 'function'/.test(panel));
ok('the raw reference is refreshed on open, not only on message',
   /_wsReal\.onopen[\s\S]{0,300}?window\._ws = _wsReal;/.test(core));

section('The Reach is green');
ok('Reach uses the green nebula plate',
   /khaisultull:[\s\S]{0,700}?nebula:'assets\/space\/backgrounds\/khai_green\.png'/.test(gx));
ok('the plate exists', fs.existsSync('client/assets/space/backgrounds/khai_green.png'));
ok('the ocean photograph is no longer referenced', !/glowing_sea\.png/.test(gx));

section('Swapping galaxies leaves nothing behind');
// THESE TWO USED TO PIN THE BROKEN LINE IN PLACE. They asserted that swapGalaxy
// contained `shipLayer.innerHTML=''` and `gShipList = []; gServerShips = {}`,
// which is the literal text of the defect: those two vars are scoped inside the
// ship IIFE and swapGalaxy is outside it, so that assignment made two globals
// and left the real maps stale, and the NPC fleet never respawned after a swap.
// A check that names an implementation line cannot tell you the line is wrong,
// and this one would have failed the correct fix. Assert the guarantee instead:
// the swap clears the fleet through the module that owns it, and does NOT reach
// into its internals from outside. The behaviour is proven in fleet-check.
ok('the swap clears the fleet through the module that owns the state',
   /window\._fmFleetReset/.test(gx));
ok('the ship module exports that reset rather than being reached into',
   /window\._fmFleetReset = function/.test(gx));
ok('swapGalaxy does not assign the IIFE-scoped fleet vars from outside',
   !/try \{ gShipList = \[\]; gServerShips = \{\}; \} catch/.test(gx));
ok('and does not guard on a function it cannot see either',
   !/typeof clearAmbient==='function'/.test(gx));
ok('lanes and colonies are rebuilt', /renderLanes\(\); renderMap\(\); renderPortal\(\);/.test(gx));

section('Zharkofin');
ok('account seeded', /name:\s+'Zharkofin'/.test(seed));
ok('no plaintext password in the seeder',
   !/sable-plinth|password:\s*'/.test(seed));
ok('hash is 128 hex chars (PBKDF2-SHA512, 64 bytes)',
   /'758e623acbe7ebf92c15ba1b31f123dc41b88647c615eb5e155358bea44167ff5628f3afb3cefb3e834d84bb00e98b0237d82a74468c15f82b79e97cc4b40487'/.test(seed));
ok('salt is 32 hex chars', /password_salt:\s+'857701f98a5bc83fbe8c4515014a1299'/.test(seed));
ok('not an owner account', !/name:\s+'Zharkofin'[\s\S]{0,400}?is_prime:\s+true/.test(seed));
ok('portrait and title seeded with the account', /portrait:\s+'prawn1'/.test(seed) && /title:\s+'Hivelord'/.test(seed));
ok('look is applied on both create and update paths',
   (seed.match(/applyLook\(/g) || []).length >= 3);
ok('title goes through gifted_titles, not just a string on the row',
   /INSERT OR IGNORE INTO gifted_titles/.test(seed));
ok('portrait art present', fs.existsSync('client/assets/portraits/prawn1.png'));
/* IT IS DELIBERATELY NOT IN THE MANIFEST NOW. This asserted the hive portrait
   was selectable, which it was and should not have been: the Reach reads as a
   standing threat because exactly ONE VOICE speaks with that face, and any
   account could put it on. The property flipped, so the assertion flips with it
   and says why, rather than being deleted. */
/* CHECKED AGAINST THE PARSED MANIFEST, NOT THE FILE TEXT - and for the fifth
   time in this codebase, because the first cut grepped for the group name and
   matched the COMMENT EXPLAINING WHY IT IS GONE. Loading the object also tests
   the thing that actually matters: not that a string is absent from a file, but
   that the picker's own data does not offer the portrait. */
{
  const w = {};
  new Function('window', man)(w);
  const P = w.FM_PORTRAITS || { groups: [], all: [], credits: {} };
  ok('the hive portrait is NOT in the public picker',
     !P.all.some(id => /^prawn/.test(id))
     && !P.groups.some(g => /Khai/.test(g[0])),
     P.all.filter(id => /^prawn/.test(id)).join(','));
  ok('but the manifest still records why it is missing', /Khai'sultull/.test(man));
}
ok('but the art is still on disk, so the boot sweep does not strip it off the wearer',
   fs.existsSync('client/assets/portraits/prawn1.png'));
ok('and the server keeps it assignable, dev-only',
   /const DEV_PORTRAITS = new Set\(\['prawn1', 'prawn_commander'\]\);/.test(srv));
ok('the ordinary set route refuses it whoever is asking',
   /DEV_PORTRAITS\.has\(pid\)[\s\S]{0,400}?error: 'portrait_not_selectable'/.test(srv));
/* A SOCKET COMMAND, NOT AN HTTP ROUTE, AND THAT MATTERED. The first cut was
   `/api/dev/portrait` with no control anywhere in the panel - a feature that
   exists and cannot be used, which is why the portrait "did not load". Moved to
   the same godCmd path as every other dev control, so controls-check walks it. */
ok('there is a dev command that can assign it', /cmd === 'dev_portrait'/.test(srv));
ok('and the unreachable route is gone', !/app\.post\('\/api\/dev\/portrait'/.test(srv));
/* Writing the row changes what the NEXT LOGIN sends and nothing else, so without
   a push the target keeps the old face until they reload. */
ok('and the target is told immediately, rather than on next login',
   /broadcastToPlayer\(target\.id, \{ type: 'portrait_set'/.test(srv));
/* The resolver prefers the commander and falls back to the drone rather than
   naming a file that may not exist. It shipped BEFORE the art did, which is why
   it is a resolver and not a constant - and the art has now landed. */
ok('the hive lord portrait resolves to the commander when installed',
   /PORTRAIT_SET\.has\('prawn_commander'\) \? 'prawn_commander' : 'prawn1'/.test(srv));
{
  /* DRIVEN AGAINST THE REAL DIRECTORY. PORTRAIT_SET is built from the folder at
     boot, so "is the commander installed" is a question about the filesystem and
     not about any source file. Lifting the resolver and running it against the
     actual listing is the only way to answer it. */
  const set = new Set(fs.readdirSync('client/assets/portraits')
    .filter(f => /\.png$/i.test(f)).map(f => f.replace(/\.png$/i, '')));
  ok('the commander art is installed', set.has('prawn_commander'));
  ok('and the drone is still there as the fallback', set.has('prawn1'));
  const body = srv.slice(srv.indexOf('function hiveLordPortrait'));
  const resolve = new Function('PORTRAIT_SET',
    body.slice(0, body.indexOf('\n}') + 2) + '; return hiveLordPortrait;')(set);
  ok('and the resolver actually picks it', resolve() === 'prawn_commander', resolve());

  /* CONFORMED TO THE PACK, not just dropped in. Every portrait is exactly
     393x397 with the subject run to the bottom edge; the source was 111x168 at a
     different aspect, so a straight copy would have been the one portrait in the
     set that framed differently from all 258 others. */
  const dim = (() => {
    const b = fs.readFileSync('client/assets/portraits/prawn_commander.png');
    return [b.readUInt32BE(16), b.readUInt32BE(20)];   // PNG IHDR
  })();
  const ref = (() => {
    const b = fs.readFileSync('client/assets/portraits/prawn1.png');
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  })();
  ok('the commander is on the pack canvas', dim[0] === ref[0] && dim[1] === ref[1],
     dim.join('x') + ' vs ' + ref.join('x'));

  /* It must stay OUT of the picker. The whole point of DEV_PORTRAITS is that
     adding art does not add a costume, and a manifest regenerated carelessly is
     exactly how it would come back. */
  const w = {};
  new Function('window', man)(w);
  ok('installing the art did not put it in the picker',
     !(w.FM_PORTRAITS.all || []).some(id => /^prawn/.test(id)));
  ok('and it is still on the dev-only list',
     /const DEV_PORTRAITS = new Set\(\['prawn1', 'prawn_commander'\]\);/.test(srv));
}
ok('portrait NOT in the frame map (antennae would break head measurement)',
   !/"prawn1":\[/.test(man));
ok('and its credit slot went with it, rather than dangling',
   !/"Khai'sultull":\{"name"/.test(man));
/* A group with no credit and a credit with no group are both wrong; the manifest
   header already says a wrong attribution is worse than a missing one. */
{
  const w = {}; new Function('window', man)(w);
  const P = w.FM_PORTRAITS;
  ok('no credit entry names a group that no longer exists',
     Object.keys(P.credits).every(k => P.groups.some(g => g[0] === k)),
     Object.keys(P.credits).filter(k => !P.groups.some(g => g[0] === k)).join(','));
}

const dbjs = fs.readFileSync('server/db.js','utf8');

section('Dev flag survives boot');
// syncDevAccounts blanket-resets is_dev on every non-owner then re-flags only
// names in DEV_ACCOUNTS. seed_devaccounts.mjs sets the same column. Two
// authorities, and the env one runs last, so boot silently stripped Zharkofin.
ok('seeder records the accounts it owns',
   /'seeded_dev_accounts'/.test(seed) && /INSERT INTO city_kv/.test(seed));
ok('boot reads that list', /seeded_dev_accounts/.test(dbjs));
ok('boot unions the two lists rather than letting env win',
   /if \(!seen\.has\(n\.trim\(\)\.toLowerCase\(\)\)\) devNames\.push\(n\);/.test(dbjs));
ok('the union happens before the reset',
   dbjs.indexOf('devNames.push(n)') <
   dbjs.indexOf("UPDATE players SET is_dev=0, is_admin=0 WHERE is_prime=0"));
ok('seeder warns loudly if it cannot record the list',
   /ADD THESE NAMES TO IT or boot will strip them/.test(seed));
{
  // exercise the union rule itself
  const union = (env, seeded) => {
    const out = env.slice(), seen = new Set(env.map(n => n.toLowerCase()));
    for (const n of seeded) if (!seen.has(n.toLowerCase())) out.push(n);
    return out;
  };
  ok('a stale env list still keeps a seeded account',
     union(['MrFlesh','DEV-SMASHER'], ['MrFlesh','DEV-SMASHER','Zharkofin']).includes('Zharkofin'));
  ok('no duplicates when both lists name the same account',
     union(['MrFlesh'], ['MrFlesh']).length === 1);
  ok('case differences do not duplicate',
     union(['mrflesh'], ['MrFlesh']).length === 1);
  ok('an empty seeded list changes nothing',
     union(['MrFlesh','DEV-SMASHER'], []).join() === 'MrFlesh,DEV-SMASHER');
}

const auth = fs.readFileSync('client/assets/fm-auth.js','utf8');

section('Logging in out of a trial');
// Boot puts every visitor on a trial and sets FM_GUEST.active. The interactive
// login and register handlers never cleared it, so signing into a permanent
// account from a trial session left the guest bar, the Claim Account button and
// FM_Auth.isGuest() all still reporting a trial. The upgrade path already did
// this teardown and explained the reload in its own comment.
ok('a shared teardown exists', (auth.match(/function leaveTrial\(/g) || []).length === 1);
ok('login clears the trial',
   /const data = await apiPost\('\/api\/login'[\s\S]{0,400}?leaveTrial\(data\)/.test(auth));
ok('register clears the trial',
   /const data = await apiPost\('\/api\/register'[\s\S]{0,400}?leaveTrial\(data\)/.test(auth));
ok('both reload when leaving a trial, like upgrade does',
   (auth.match(/if \(wasTrial\) \{ location\.reload\(\); return; \}/g) || []).length === 2);
ok('teardown removes the guest bar and the lock screen',
   /leaveTrial[\s\S]{0,500}?fm-guest-bar[\s\S]{0,200}?fm-guest-lock/.test(auth));
ok('teardown defaults to non-trial if the server omits the field',
   /data && data\.is_guest !== undefined/.test(auth));
ok('login emits is_guest so downstream listeners are not left undefined',
   /apiPost\('\/api\/login'[\s\S]{0,900}?is_guest:false/.test(auth));
ok('/api/login states is_guest explicitly',
   /app\.post\('\/api\/login'[\s\S]{0,2000}?is_guest:false/.test(srv));
ok('/api/register states is_guest explicitly', /patreon_tier:0,is_guest:false/.test(srv));

section('Reach worlds render');
{
  const REACH_IDS = ['ks_gate_reach','ks_02','ks_03','ks_04','ks_05','ks_06','ks_07','ks_08','ks_09','ks_10'];
  // Every world needs map art, a sun, single-body treatment and a surface zone.
  // Without art it renders as a bare circle; without a zone the system view
  // reads "0 ZONES" and clicking through lands on nothing.
  const artBlock = gx.slice(gx.indexOf('var COLONY_PLANET'), gx.indexOf('var COLONY_PLANET') + 9000);
  let missingArt = 0, badFrames = 0, desert = 0;
  for (const id of REACH_IDS) {
    const m = new RegExp(id + ":\\s*\\{folder:'([^']+)',\\s*frames:(\\d+)\\}").exec(artBlock);
    if (!m) { missingArt++; continue; }
    if (/desert/.test(m[1])) desert++;
    const dir = 'client/assets/space/planets/' + m[1];
    if (!fs.existsSync(dir)) { badFrames++; continue; }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).length;
    if (files < Number(m[2])) badFrames++;
  }
  ok('all ten worlds have map art', missingArt === 0, String(missingArt) + ' missing');
  ok('every art folder exists with enough frames', badFrames === 0, String(badFrames) + ' bad');
  ok('mostly desert worlds', desert >= 5 && desert < REACH_IDS.length, desert + ' of 10');
  const sunBlock = gx.slice(gx.indexOf('var SP_COLONY_SUN'), gx.indexOf('var SP_COLONY_SUN') + 1200);
  ok('every world has a star', REACH_IDS.every(id => new RegExp(id + ':\\d').test(sunBlock)));
  const sbBlock = gx.slice(gx.indexOf('var SP_SINGLE_BODY'), gx.indexOf('var SP_SINGLE_BODY') + 500);
  ok('every world is a single body, not an empty star system',
     REACH_IDS.every(id => new RegExp(id + ':1').test(sbBlock)));
  ok('every world has one surface zone',
     (gx.match(/contestBonus:'Contested ground'/g) || []).length === 10);
  ok('no Reach world still ships an empty planet list',
     !/khai:true[\s\S]{0,600}?planets:\[\],/.test(gx));
}

section('The front replaces faction control on Reach worlds');
ok('Reach worlds render a front block', /if\(m\.galaxy==='khaisultull'\)\{/.test(gx));
ok('it reads live war state', /window\._REACH && window\._REACH\.worlds && window\._REACH\.worlds\[id\]/.test(gx));
ok('faction bars are now the else branch',
   /\/\/ Control bars \(not for flesh station, not for the Reach\)\n  else if\(!isFlesh\)\{/.test(gx));
{
  // Fund a Faction must be inside that else branch, or a player could pour
  // money into a control track that does not exist past the passage.
  const b = gx.indexOf('// Control bars (not for flesh station, not for the Reach)');
  const c = gx.indexOf("T('galx.fundFaction'");
  let depth = 0;
  for (const ch of gx.slice(b, c)) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  ok('Fund a Faction is suppressed on Reach worlds', depth > 0, 'depth ' + depth);
}

section('Dev console wiring');
{
  const tab = html.slice(html.indexOf('id="godTab-reach"'), html.indexOf('id="godTab-frs"'));
  // WIDENED TO jade_* AS WELL. The Jade panel writes into the same war through
  // its own namespace, and a check that only knew about reach_* let jade_commit
  // ship as a handler with no control, which is the exact omission this has
  // already caught three times on the Reach side.
  const handlers = [...new Set([...srv.matchAll(/cmd === '((?:reach|jade)_[a-z_]+)'/g)].map(m => m[1]))];
  const sent = new Set([
    ...[...panel.matchAll(/cmd:'((?:reach|jade)_[a-z_]+)'/g)].map(m => m[1]),
    ...[...html.matchAll(/cmd:'((?:reach|jade)_[a-z_]+)'/g)].map(m => m[1]),
  ]);
  ok('every server handler is reachable from the panel',
     handlers.every(h => sent.has(h)), handlers.filter(h => !sent.has(h)).join(','));
  ok('the panel sends nothing the server ignores',
     [...sent].every(c => handlers.includes(c)), [...sent].filter(c => !handlers.includes(c)).join(','));
  const onclicks = [...new Set([...tab.matchAll(/onclick="([a-zA-Z_$][\w$]*)\(/g)].map(m => m[1]))];
  ok('every onclick in the tab resolves to a defined function',
     onclicks.every(fn => new RegExp('window\\.' + fn + '\\s*=').test(panel)
                       || new RegExp('window\\.' + fn + '\\s*=').test(core)),
     onclicks.filter(fn => !new RegExp('window\\.' + fn + '\\s*=').test(panel)
                        && !new RegExp('window\\.' + fn + '\\s*=').test(core)).join(','));
  const ids = new Set([...tab.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]));
  const refs = [...new Set([...panel.matchAll(/getElementById\('(reach-[a-zA-Z0-9_-]+)'\)/g)].map(m => m[1]))];
  ok('every element the panel reaches for exists in the markup',
     refs.every(r => ids.has(r)), refs.filter(r => !ids.has(r)).join(','));
  // Dead switches are the specific thing this panel was built to avoid.
  // WIDENED TO jade*, for the same reason the handler check was: the Jade
  // panel writes into the same war through its own namespace, and a check
  // that only knew about reach* let jadeSay ship as a defined function that
  // nothing calls. That is the dead switch this check exists to prevent,
  // one namespace over.
  const defs = [...new Set([...panel.matchAll(/window\.((?:reach|jade)[A-Za-z]+)\s*=/g)].map(m => m[1]))];
  const unreachable = defs.filter(d => {
    const inPanel = (panel.match(new RegExp('(?<!window\\.)\\b' + d + '\\(', 'g')) || []).length;
    const inHtml  = (html.match(new RegExp(d + '\\(', 'g')) || []).length;
    const inCore  = (core.match(new RegExp('\\b' + d + '\\(', 'g')) || []).length;
    return inPanel + inHtml + inCore === 0;
  });
  ok('no control is defined but unreachable', unreachable.length === 0, unreachable.join(','));
  ok('garrison has a control, not just a handler', /reachGarrison\(id, this\.value\)/.test(panel));
}

section('Hive cities are decoration until a world is taken');
ok('Reach worlds carry city data', /ks_gate_reach:\s+\{ pop:/.test(city));
ok('they are flagged as Reach in the table', (city.match(/reach: 1/g) || []).length === 10);
ok('isCityColony gates Reach worlds on capture',
   /if \(REACH_CITY_IDS\.has\(colonyId\)\) return isReachTaken\(colonyId\);/.test(city));
ok('the resolver is injected, not imported, so city.js stays acyclic',
   /export function setReachResolver/.test(city) && !/from '\.\/reach\.js'/.test(city));
ok('with no resolver a Reach world is NOT a city (fails closed)',
   /return !!\(_reachTaken && _reachTaken\(colonyId\)\)/.test(city));
ok('boot seeding skips unconverted worlds',
   /if \(REACH_CITY_IDS\.has\(id\) && !isReachTaken\(id\)\) continue;/.test(city));
ok('taken means the brood holds NONE of it, not most of it',
   /return !!\(w && w\.hive <= 0\);/.test(reach));

section('Conversion fires on every path');
ok('control changes fire it', /fireConversion\(id, was, w\.hive <= 0\)/.test(reach));
ok('flips fire it', /fireConversion\(id, wasTaken, w\.hive <= 0\)/.test(reach));
ok('reset closes every converted world',
   /const before = REACH_WORLDS\.filter\(id => worldTaken\(id\)\)/.test(reach));
ok('it only fires on an actual change',
   /if \(wasTaken === isTaken\) return;/.test(reach));
ok('a hook that throws cannot break the mutator', /catch \(e\) \{ console\.error\('\[Reach\] conversion hook'/.test(reach));
ok('the server installs the resolver BEFORE seeding cities',
   srv.indexOf('setReachResolver(worldTaken);') < srv.indexOf('seedAllCityStates(seedColonyMeta);'));
ok('taking a world seeds its city and districts',
   /seedColonyMeta\(colonyId, meta\.pop, meta\.capital\);[\s\S]{0,120}?seedDistrictsFor\(colonyId\)/.test(srv));
ok('losing a world does not delete what was built',
   /rows are left alone[\s\S]{0,120}?rather than deleted/.test(srv));
ok('conversion is broadcast', /type:'reach_converted'/.test(srv));
ok('the client rebuilds on conversion', /msg\.type === 'reach_converted'/.test(core));
ok('the payload carries taken state', /taken: w\.hive <= 0 \? 1 : 0/.test(reach));
ok('the detail panel distinguishes decoration from a charter',
   /Hive settlement, unsurveyed/.test(gx) && /COALITION ADMINISTRATION/.test(gx));

const rb = fs.readFileSync('client/assets/reach-battle.js','utf8');

section('Battle zones');
ok('zone count is a function of population', /export function zoneCount/.test(reach));
ok('capped at three', /export const MAX_ZONES = 3;/.test(reach));
ok('population mirrored for all ten', (reach.match(/ks_[a-z0-9_]+: \d+/g) || []).length === 10);
// WAS: the flat mean of live zone control. That was correct while a zone was
// fought once, and hands back won ground the moment waves exist, because a
// fresh wave opens at 100 and the mean reads the planet as untouched again.
ok('world control banks waves rather than averaging live zones',
   /w\.hive = worldHive\(w\);/.test(reach)
   && !/w\.hive = Math\.round\(w\.zones\.reduce/.test(reach));
ok('old saves get zones built rather than crashing',
   /if \(w\.zones\.length !== want\)/.test(reach));
ok('zones ride the wire', /zones: \(w\.zones \|\| \[\]\)\.map/.test(reach));
ok('GM can drive a zone', /cmd === 'reach_zone'/.test(srv));
ok('the panel renders whatever zones exist, not a fixed three',
   /\(w\.zones\|\|\[\]\)\.forEach/.test(panel));

section('The battlefield is in the game');
ok('renderer shipped as a client module', fs.existsSync('client/assets/reach-battle.js'));
ok('loaded behind the galaxy bundle', /lazyLoad\('assets\/reach-battle\.js'\)/.test(html));
ok('overlay and canvas exist', /id="reachBattle"/.test(html) && /id="rbCanvas"/.test(html));
ok('opened from a zone row', /window\.reachWatch\(/.test(gx));
ok('quiet zones are not watchable', /if \(!z \|\| !z\.live\) return;/.test(rb));
ok('seeded deterministically per world and zone', /function seedFor\(colonyId, zoneIdx\)/.test(rb));
ok('it reads live zone state rather than drifting', /RB\.tickIv = setInterval/.test(rb));
ok('it closes itself when the zone goes quiet',
   /if \(!Z \|\| !Z\.live\) \{ window\.reachWatchClose\(\); return; \}/.test(rb));
ok('escape closes it', /e\.key === 'Escape'/.test(rb));
// The module is lazy loaded, so the overlay canvas is not guaranteed to be in
// the document when it runs. Binding pointer handlers at parse time threw on a
// null canvas and took the whole module down with it.
ok('canvas binding is deferred to open time', /function bindCanvas\(\)/.test(rb));
ok('nothing binds to the canvas at load', !/^cv\.addEventListener/m.test(rb));
ok('camera keys only fire while the viewer is open',
   (rb.match(/if\(!RB\.open\) return;/g) || []).length >= 2);
ok('hive cities render in the viewer', /function gHiveCity/.test(rb));
ok('the viewer decides nothing', /it draws\n\/\/ what the server says/.test(rb) || /decides nothing/.test(rb));

section('Reach surface panel');
ok('Reach worlds get the war, not a market', /spBuildReachHUD\(colonyId, planet, planetIdx\)/.test(gx));
ok('standard worlds keep market, control and fund',
   /spRestoreHUDSections\(\);[\s\S]{0,140}?spUpdateHUDControl/.test(gx));
ok('the standard sections are rebuilt after a Reach visit',
   /function spRestoreHUDSections/.test(gx) && /spPriceList'\)\)/.test(gx));
ok('engagements are listed on the surface', /ENGAGEMENTS \('\+zones\.length/.test(gx));

section('KS-07 is an ocean world');
ok('terrain is ocean server-side', /ks_07:\s+\{ layout: 'archipelago', terrain: 'ocean'\s+\}/.test(city));
ok('ocean is a real terrain the city renderer draws',
   /if\(Tn==='ocean'\)/.test(fs.readFileSync('client/assets/city.js','utf8')));
ok('map art is an ocean world', /ks_07:\s+\{folder:'animated\/ocean_clouds'/.test(gx));
ok('it is no longer a station', !/ks_07:\s+\{folder:'static\/tech'/.test(gx));

section('Detail banner');
ok('the panel leads with a banner', /space-detail-banner/.test(gx));
ok('Reach banners use the brood colour and name the Reach',
   /KHAI'SULTULL REACH/.test(gx) && /isKhai2 \? '#c2551f'/.test(gx));
ok('an unrevealed world still shows its designation', /revealed && m\.khaiName/.test(gx));

section('Detail banner is ONE element');
ok('each detail renderer has exactly one titled banner', (() => {
  // renderJadeDetail is defined BEFORE the main renderer in the file, so
  // splitting the source on it puts both banners on the same side. Slice the
  // Circuit function by its own bounds instead of by position.
  const j0 = gx.indexOf('function renderJadeDetail');
  const j1 = gx.indexOf('\nfunction ', j0 + 10);
  const jade = gx.slice(j0, j1 > j0 ? j1 : undefined);
  const rest = gx.slice(0, j0) + (j1 > j0 ? gx.slice(j1) : '');
  return (jade.match(/space-detail-banner/g) || []).length === 1
      && (rest.match(/space-detail-banner/g) || []).length === 1;
})());
ok('the panel carries the strip AND the titled banner',
   /class="space-banner"/.test(gx) && /space-detail-banner/.test(gx));
ok('landscape, planet and title composite into one box',
   /space-detail-banner[\s\S]{0,1800}?landscapes\/[\s\S]{0,1200}?gDetailPlanetImg/.test(gx));
ok('missing art degrades instead of showing a broken image',
   (gx.match(/onerror="this\.style\.display=/g) || []).length >= 2);
ok('every Reach world has a landscape', (() => {
  const blk = gx.slice(gx.indexOf('var COLONY_BANNER'), gx.indexOf('};', gx.indexOf('var COLONY_BANNER')));
  return (blk.match(/ks_[a-z0-9_]+:'/g) || []).length === 10;
})());
ok('every banner references art that exists', (() => {
  const blk = gx.slice(gx.indexOf('var COLONY_BANNER'), gx.indexOf('};', gx.indexOf('var COLONY_BANNER')));
  const have = new Set(fs.readdirSync('client/assets/space/landscapes').map(f => f.replace('.png','')));
  return [...blk.matchAll(/[a-z_0-9]+\s*:\s*'([a-z_0-9]+)'/g)].every(m => have.has(m[1]));
})());

section('The map covers its own viewBox');
ok('stars are seeded from the galaxy viewBoxes, not a hardcoded box',
   /Object\.keys\(GALAXIES\)\.forEach\(function\(k\)\{[\s\S]{0,200}?viewBox/.test(gx));
ok('star density holds as the box grows', /220\*\(sW\*sH\)\/\(1000\*700\)/.test(gx));
{
  const vbs = [...gx.matchAll(/viewBox:'([^']+)'/g)].map(m => m[1].split(/\s+/).map(Number));
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for (const v of vbs) { x0=Math.min(x0,v[0]); y0=Math.min(y0,v[1]); x1=Math.max(x1,v[0]+v[2]); y1=Math.max(y1,v[1]+v[3]); }
  const neb = /<image id="gNebula"[^>]*x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/.exec(html);
  ok('the nebula covers every galaxy viewBox', !!neb
     && Number(neb[1]) <= x0 && Number(neb[1]) + Number(neb[3]) >= x1
     && Number(neb[2]) <= y0 && Number(neb[2]) + Number(neb[4]) >= y1,
     neb ? neb.slice(1).join(',') : 'no nebula');
  ok('every galaxy declares a viewBox', vbs.length === 3);
}

section('Brood worlds offer nothing that cannot happen');
ok('smuggling, blockades and lane shares are gated', /if \(!isFlesh && !_reachLocked\) \{/.test(gx));
ok('the gate is capture, not merely being in the Reach',
   /_reachLocked = \(m\.galaxy==='khaisultull'\) && !\(_reachRow && _reachRow\.taken\)/.test(gx));
ok('the city charter card is gated client-side too',
   /_cityLocked[\s\S]{0,200}?renderCityCard/.test(gx));
ok('a stale charter card is removed rather than left behind',
   /_stale=document\.getElementById\('gCityCard'\); if\(_stale\) _stale\.remove\(\)/.test(gx));

section('Engagements are on the detail panel');
ok('the detail panel lists engagements', /T\('galx\.engagements','Engagements'\)/.test(gx));
ok('live zones carry a watch control', /window\.reachWatch&&window\.reachWatch\(/.test(gx));
ok('quiet zones do not', /T\('galx\.quiet','QUIET'\)/.test(gx));

const hive = fs.readFileSync('client/assets/reach-hive.js','utf8');

section('Hive works are a city, not a battlefield');
ok('hive city module shipped', fs.existsSync('client/assets/reach-hive.js'));
ok('it uses the city view projection, not the battlefield camera',
   /function px\(x,y\)\{ return OX\+\(x-y\)\*S; \}/.test(hive) && !/function seg\(path/.test(hive));
ok('towers are built from stacked rings, so they taper like growth',
   /var RINGS = Math\.max\(5/.test(hive));
ok('towers lean', /LEAN_X/.test(hive));
ok('brood spires anchor clusters', /spire:true/.test(hive));
ok('skyways connect towers into a settlement', /function drawSkyways/.test(hive));
ok('ambient flyers orbit the towers', /function drawFlyers/.test(hive));
ok('flyers split around depth so they are not drawn over spires',
   /Math\.sin\(a\)<0\?far:near/.test(hive));
ok('terrain is keyed off the world, as the city view is',
   /var TERRAIN_BASE = \{/.test(hive));
ok('every Reach terrain has a plate, ocean included', (() => {
  const blk = hive.slice(hive.indexOf('var TERRAIN_BASE'), hive.indexOf('};', hive.indexOf('var TERRAIN_BASE')));
  return ['dust','veins','rift','ice','tether','station','ocean'].every(t => blk.includes(t + ':'));
})());
ok('density follows how much the brood holds', /Math\.round\(2\+hold\*4\)/.test(hive));
ok('deterministic per world', /seedFromId\('hive:'\+colonyId\)/.test(hive));
ok('reachable from both panels',
   (gx.match(/window\.reachHive&&window\.reachHive\(/g) || []).length === 2);
ok('terrain map exported for it', /window\.REACH_TERRAIN =/.test(gx));
ok('loaded behind the galaxy bundle', /lazyLoad\('assets\/reach-hive\.js'\)/.test(html));
ok('overlay and canvas exist', /id="reachHive"/.test(html) && /id="rhCanvas"/.test(html));
ok('escape closes it', /e\.key==='Escape' && HV\.open/.test(hive));

section('Battlefields match the world');
ok('every world terrain has a battlefield vocabulary', (() => {
  const blk = rb.slice(rb.indexOf('const TERRAIN_KIND'), rb.indexOf('};', rb.indexOf('const TERRAIN_KIND')));
  const kinds = [...blk.matchAll(/^\s{2}(\w+):\s+\[/gm)].map(m => m[1]);
  const worlds = [...new Set([...rb.matchAll(/terrain:'(\w+)'/g)].map(m => m[1]))];
  return worlds.every(t => kinds.includes(t));
})());
ok('ocean is one of them, since KS-07 became an ocean world',
   /ocean:\s+\['pressure'/.test(rb));
ok('the ocean world fights on ocean, not station',
   /\{ id:'ks_07',[^}]*terrain:'ocean'/.test(rb));

section('Every panel carries both banners');
ok('two topline strips: the main panel and the Circuit',
   (gx.match(/class="space-banner"/g) || []).length === 2);
ok('two titled banners, one per renderer',
   (gx.match(/space-detail-banner/g) || []).length === 2);
ok('no bare globe blocks remain', !/class="space-detail-planet"/.test(gx));
ok('the Circuit panel got the titled banner too',
   /function renderJadeDetail[\s\S]{0,3000}?space-detail-banner/.test(gx));
{
  // strip must precede the titled banner in BOTH renderers
  const jade = gx.slice(gx.indexOf('function renderJadeDetail'));
  const jStrip = jade.indexOf('class="space-banner"');
  const jBan = jade.indexOf('space-detail-banner');
  ok('Circuit draws the strip first', jStrip >= 0 && jStrip < jBan);
  const main = gx.slice(gx.indexOf('// \u2500\u2500 Detail banner'));
  const mStrip = main.indexOf('class="space-banner"');
  const mBan = main.indexOf('space-detail-banner');
  ok('main panel draws the strip first', mStrip >= 0 && mStrip < mBan);
}

section('The map draws no hardcoded regions');
{
  const svg = html.slice(html.indexOf('id="galaxySVG"'), html.indexOf('</svg>', html.indexOf('id="galaxySVG"')));
  // Six tinted ellipses and a reference grid were hardcoded in Coalition
  // coordinates and drew on EVERY galaxy, so the Circuit and the Reach both
  // inherited the Coalition's faction blobs and its Abaddon nebula.
  ok('no tinted region ellipses remain', !/<ellipse/.test(svg));
  ok('no hardcoded reference grid remains', !/<line /.test(svg));
  ok('the layer stack is intact',
     ['gNebula','gStars','gLanes','gShips','gColonies'].every(i => svg.includes('id="' + i + '"')));
}

section("Worlds carry Khai'sultull names");
{
  const meta = gx.slice(gx.indexOf('var COLONY_META'), gx.indexOf('var LANES'));
  const ids = ['ks_gate_reach','ks_02','ks_03','ks_04','ks_05','ks_06','ks_07','ks_08','ks_09','ks_10'];
  const names = [], zones = [], meanings = [];
  for (const id of ids) {
    const i = meta.indexOf('  ' + id + ': {'), j = meta.indexOf('\n  },\n', i);
    const b = meta.slice(i, j);
    const n = /name:"([^"]+)"/.exec(b), k = /khaiName:"([^"]+)"/.exec(b), z = /\{ name:"([^"]+)", sector:/.exec(b);
    if (n) names.push(n[1]); if (k) meanings.push(k[1]); if (z) zones.push(z[1]);
  }
  ok('all ten renamed', names.length === 10, names.join(','));
  ok('no KS designations remain as names', !/name:'KS-\d/.test(span('colony meta', meta)));
  ok('all ten surface zones renamed', zones.length === 10, zones.join(','));
  ok('no Coalition survey labels on brood ground',
     !zones.some(z => /Decks|Ground|Fields$|Flats$|Seat$|Shelf$|Point$|Floor$|Concession$/.test(z))
     || zones.every(z => /['a-z]/.test(z)));
  ok('names follow the established phonology',
     names.filter(n => /^(Kh|Zh|Th|Ss|V|N|M|T|S|U|O)/.test(n)).length === 10, names.join(','));
  ok('several carry the glottal stop Khai\'sultull uses',
     names.filter(n => n.indexOf("'") >= 0).length >= 3);
  ok('every world still has a translation held back', meanings.length === 10);
  ok('names and meanings are distinct', names.every((n, i) => n !== meanings[i]));
}
ok('the banner shows their name and holds the meaning for capture',
   /var bnTitle = m\.name\.toUpperCase\(\);/.test(gx)
   && /reachRow && reachRow\.revealed && m\.khaiName/.test(gx));
ok('lore no longer claims they offered no designation',
   !/have not offered a designation/.test(gx));
ok('the KS-07 station lore is gone now it is an ocean world',
   !/Not a planet\. A hive platform/.test(gx) && !/Interior decks, hard cover, no sky/.test(gx));

section('War zones are named after their world');
ok('zone names descend from a per-world stem', /const WORLD_STEM = \{/.test(reach));
ok('a stem with a glottal stop does not double it', /stem\.indexOf\("'"\) >= 0/.test(reach));
ok('the shared name pool is gone', !/const ZONE_NAMES/.test(reach));
ok('battlefield labels use their names', !/tag:'KS-\d/.test(rb));
ok('the GM panel uses their names', !/'KS-\d+'/.test(panel));

// ═══════════════════════════════════════════════════════════════════════════
// PUSH WINDOWS
// These assert GUARANTEES rather than decisions. Three separate patches shipped
// assertions that described what the code happened to do that day, so the bar
// here is: would this still need to be true if the numbers were retuned?
// The tuning constants are deliberately NOT pinned to their current values.
// ═══════════════════════════════════════════════════════════════════════════
section('Push windows: the mechanic exists at all');
ok('reach.js has a window state machine',
   /export function openWindow\(/.test(reach) && /export function commit\(/.test(reach)
   && /export function resolveWindow\(/.test(reach));
ok('a funder minimum exists', /PUSH_MIN_FUNDERS/.test(reach));
ok('a per funder cap exists', /PUSH_PLAYER_CAP/.test(reach));
ok('a commitment floor exists', /PUSH_MIN_COMMIT/.test(reach));
ok('the cap is enforced against the funder total, not the single commit',
   /had \+ amt > PUSH_PLAYER_CAP/.test(reach));

section('Push windows: reach.js still cannot touch a wallet');
// The file header promises this and the promise is the reason there is exactly
// one place to audit. An import of a player module here would break it silently.
/* THE RULE IS "NO PLAYER STATE", NOT "NO IMPORTS", and counting imports was a
   proxy for it that stops working the moment the file legitimately needs a
   second one. reach.js now imports the faction registry, which is a pure model
   with no IO of its own - the dependency runs war-layer to model, which is the
   right direction and the reason it is allowed. The assertion below about
   safeAddCash/savePlayer is the one that was always doing the real work. */
ok('reach.js imports only the KV store and the faction model',
   (reach.match(/^import .*$/gm) || []).length === 2
   && /from '\.\/db_city\.js'/.test(reach)
   && /from '\.\/factions\.js'/.test(reach));
ok('reach.js never calls safeAddCash or savePlayer',
   !/safeAddCash|savePlayer|getPlayer\(/.test(reach));
ok('resolveWindow hands refunds back rather than paying them',
   /return \{[\s\S]{0,200}refunds,/.test(reach));
ok('server.js is the only file that pays a refund',
   /function payReachRefunds\(/.test(srv) && !/payReachRefunds/.test(reach));

section('Push windows: escrow cannot be orphaned');
// Every path that can delete the ground a window is fought over must return the
// credits in it. This is the assertion that would catch a fifth such path being
// added later without one.
ok('a harvest helper exists', /export function harvestWindows\(/.test(reach));
for (const fn of ['flipWorld', 'signAccord', 'resetReach']) {
  const i = reach.indexOf('export function ' + fn + '(');
  const body = i < 0 ? '' : reach.slice(i, reach.indexOf('\nexport function ', i + 10));
  ok(fn + ' harvests open windows before rewriting the ground',
     /harvestWindows\(/.test(body), fn);
  ok(fn + ' returns the refunds to its caller', /refunds/.test(body), fn);
}
for (const cmd of ['reach_flip', 'reach_accord', 'reach_reset', 'reach_window_close']) {
  const i = srv.indexOf("cmd === '" + cmd + "'");
  const body = i < 0 ? '' : srv.slice(i, i + 1400);
  ok(cmd + ' pays out whatever it harvested', /payReachRefunds\(/.test(body), cmd);
}

section('Push windows: resolution is swept, never timed');
// PM2 forgets setTimeout on restart. An unresolved window is both a front that
// never moves and player credits nobody gets back, so this must be a sweep.
ok('due windows are found by query, not by timer', /export function dueWindows\(/.test(reach));
ok('the sweep is on an interval', /setInterval\(sweepReachWindows/.test(srv));
ok('no setTimeout schedules a window resolution', !/setTimeout\([^)]*[Ww]indow/.test(srv));

section('Push windows: the commit route');
{
  const i = srv.indexOf("app.post('/api/reach/push'");
  const body = i < 0 ? '' : srv.slice(i, srv.indexOf("app.post('/api/reach/state'"));
  ok('the commit route exists', i > 0);
  ok('it rejects anonymous callers', /not_logged_in/.test(body));
  ok('it rejects guests, who are the cheap way to fake a distinct funder',
     /isGuest/.test(body) && /guest_blocked/.test(body));
  /* Through reachSealed(p) now rather than the bare flag, because a GM has to be
     able to stand in a sealed Reach to test it before opening it to anybody.
     The gate is unchanged for everyone else: reachSealed is !REACH_OPEN plus the
     dev exception, and it takes the actor so the exception is a decision at each
     route rather than a hole. */
  ok('it refuses while the passage is sealed', /reachSealed\(p\)/.test(body));
  ok('and the seal predicate takes the actor rather than reading a bare flag',
     /function reachSealed\(actor\)/.test(srv)
     && /return !REACH_OPEN && !devPassesSeal\(actor\);/.test(srv));
  ok('commit max is resolved server side against both cap and wallet',
     /reachPushRoom\(/.test(body) && /Math\.min\(room, Math\.floor\(p\.cash\)\)/.test(body));
  ok('state is only accepted after commit() approves it',
     body.indexOf('reachCommit(') < body.indexOf('safeAddCash(p, -amt)'));
  ok('the debit happens once', (body.match(/safeAddCash/g) || []).length === 1);
}

section('Push windows: funder identity is not a live leaderboard');
ok('funder names are withheld while the window is open',
   /roll: open \? null :/.test(reach));
ok('the viewer only ever sees their own total',
   /mine: viewerId && win\.funders\[viewerId\]/.test(reach));
// The signature gained a dev actor for the digest. What this protects is that
// identity rides on viewerId and nothing else, so it asserts the parameter
// rather than the whole list.
ok('a viewerless payload leaks nobody', /reachPayload\(forDev, viewerId(, devActor)?\)/.test(reach));

section('Push windows: the client can find them');
// A funding control reachable from one surface and not the other is the
// dead-switch problem with money attached, which is why both call one function.
ok('one block function serves both surfaces', /function reachWinBlock\(/.test(gx));
ok('the detail panel renders it', /h\+=reachWinBlock\(id, zi, z, false\)/.test(gx));
ok('the surface HUD renders it', /ch \+= reachWinBlock\(colonyId, zi, z, true\)/.test(gx));
ok('commit clicks do not bubble into the battle viewer',
   (gx.match(/event\.stopPropagation\(\);window\.reachPush/g) || []).length === 2);
ok('one shared clock ticks every visible window rather than one timer each',
   /_reachWinTick/.test(gx) && (gx.match(/setInterval\([\s\S]{0,60}reach-win/g) || []).length <= 1);
ok('the GM panel can open and pull a window',
   /window\.reachWindow = function/.test(panel) && /window\.reachWindowClose = function/.test(panel));
ok('the GM panel only offers a window where the server would accept one',
   /w\.front && z\.live && z\.hive > 0/.test(panel));

section('Two god commands that were wired to nothing');
// reach_zone and reach_envoy called functions server.js never imported. Both
// threw ReferenceError on every use while every static check passed.
for (const fn of ['reachSetZone', 'reachSetEnvoy', 'reachOpenWindow', 'reachCancelWindow',
                  'reachCommit', 'reachPushRoom', 'reachDueWindows', 'reachResolveWindow']) {
  const imported = new RegExp('as ' + fn + '\\b').test(srv) || new RegExp('\\b' + fn + ',').test(srv);
  ok(fn + ' is actually imported, not just called', imported, fn);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE KHAI'SULTULL SCRIPT
// ═══════════════════════════════════════════════════════════════════════════
section("The script: it matches the GM's sheet, which is the authority");
// These pin the actual VALUES, and that is correct here rather than the usual
// mistake: the sheet is canon handed down, not an implementation detail this
// file gets to choose. An earlier build reconstructed the inventory from the
// phonology, produced a self consistent system, and was wrong in every value.
// The one thing to test loosely is the drawing; the one thing to test exactly
// is the table.
ok('the script module exists', ks.length > 0);
ok('sixteen signs', KS && KS.SIGNS.length === 16, KS ? String(KS.SIGNS.length) : 'no module');
ok('seven marks', KS && KS.MARKS.length === 7, KS ? String(KS.MARKS.length) : 'no module');
{
  const SHEET = ["'", 's', 'r', 'th', 'l', 'n', 't', 'k',
                 'v', 'm', 'zh', 'kh', 'h', 'f', 'sh', 'ng'];
  ok('every sign sits at the value the sheet gives it',
     KS && SHEET.every((g, v) => KS.VALUE[g] === v),
     KS ? SHEET.map((g, v) => KS.VALUE[g] === v ? '' : g + '=' + KS.VALUE[g] + '/' + v).filter(Boolean).join(' ') : '');
  ok('THE GLOTTAL STOP IS SIGN ZERO, not a mark',
     KS && KS.SIGNS[0] === "'" && KS.VALUE["'"] === 0 && !KS.MARKS.includes("'"));
  ok('aa is a mark in its own right', KS && KS.MARKS.includes('aa'));
  ok('no bare z was invented', KS && !KS.SIGNS.includes('z'));
  ok('no voiced stops among the signs',
     KS && !['b', 'd', 'g', 'p'].some(x => KS.SIGNS.includes(x)), KS ? KS.SIGNS.join(',') : '');
  ok('the corpus itself contains no voiced stop',
     !/[bdgp]/i.test([...gx.matchAll(/name:"([^"]+)", x:\d+, y:\d+, pop:'REDACTED'/g)].map(m => m[1]).join('')));
  ok('hooks encode the arithmetic rather than being memorised',
     /var right = v >> 2, left = v & 3;/.test(ks));
  // The single hardest thing to get wrong by accident, and the sheet states it
  // outright: Zharkofin reads zh r k f n = A 2 7 D 5 = 665557.
  ok("the sheet's worked example computes", KS && KS.value('Zharkofin') === 665557,
     KS ? String(KS.value('Zharkofin')) : '');
}

section("The script: the overflow rule as the sheet words it");
// "A doubled sign doubles its value and must be PRECEDED BY A VOWEL. No word
// opens on one." The second sentence falls out of the first rather than being a
// separate rule, so the code enforces the first and the test proves the second.
ok('the rule is enforced on the preceding unit, not on position',
   KS && typeof KS.overflowViolations === 'function');
ok('an overflow after a vowel is legal', KS && KS.isWritable('Ossuveth'));
ok('an overflow after a CONSONANT is rejected', KS && !KS.isWritable('vesksskan'));
ok('an overflow opening a word is rejected', KS && !KS.isWritable('ssuveth'));
ok('and the violation names the offending sign',
   KS && KS.overflowViolations('ssuveth')[0] === 'ss');

section("The script: it renders the corpus that already shipped");
{
  const canon = ["Khai'sultull", 'Zharkofin', "Sahn'tekk", 'Ussaleth', "Khai'ru", 'Tessul',
                 "Zhaal'un", 'Marokketh', 'Ossuveth', 'Nikkathaal', 'Thennsur', 'Vesskanoth'];
  // The world names in galaxy.js are the source of truth, not this list. If a
  // world is renamed and this list is not updated the check must fail, which is
  // the difference between asserting a guarantee and restating a decision.
  const shipped = [...gx.matchAll(/name:"([^"]+)", x:\d+, y:\d+, pop:'REDACTED'/g)].map(m => m[1]);
  ok('the canon list still matches what galaxy.js ships',
     shipped.length === 10 && shipped.every(n => canon.includes(n)), shipped.join(','));
  for (const n of canon) ok('renders ' + n, !!(KS && KS.glyphs(n)), n);
  ok('every canon name is writable under the rule',
     KS && canon.every(n => KS.isWritable(n)),
     KS ? canon.filter(n => !KS.isWritable(n)).join(',') : '');
  ok('every zone stem renders and is writable',
     KS && ["Ossu'kar", "Ossu'thal", "Nikka'kar", "Vessa'vekk", "Thenn'thal"]
       .every(n => KS.glyphs(n) && KS.isWritable(n)));
  // Zero is drawn, not skipped: a name carrying a glottal stop has a zero digit
  // in its figure and a ring on its line.
  ok('the glottal stop draws as a ring rather than hooks',
     /if \(v === 0\)/.test(ks) && /<circle cx=/.test(ks));
  ok('and it still occupies a digit position',
     KS && KS.parse("Khai'ru").filter(u => u.sign).some(u => u.value === 0));
}

section("The script: the sheet ships with the code");
// The values in this file are copied from the GM's sheet. If the sheet only
// ever lives in a downloads folder, the copy in the code becomes the de facto
// canon the first time anybody checks. Shipping it means the authority is in
// the repo next to the thing derived from it.
ok('the alphabet sheet is in the repo', fs.existsSync('docs/lore/khaisultull-alphabet.svg'));
{
  const sheet = fs.existsSync('docs/lore/khaisultull-alphabet.svg')
    ? fs.readFileSync('docs/lore/khaisultull-alphabet.svg', 'utf8') : '';
  // Parse the sheet and compare it to the module rather than trusting either.
  const pairs = [];
  for (const g of sheet.match(/<g>[\s\S]*?<\/g>/g) || []) {
    const rom = g.match(/class="rom">([^<]*)</);
    const val = g.match(/class="val">(\d+)</);
    if (rom && val) pairs.push([rom[1].replace('\u2019', "'"), +val[1]]);
  }
  ok('the sheet declares sixteen signs', pairs.length === 16, String(pairs.length));
  ok('THE MODULE AGREES WITH THE SHEET, sign for sign',
     !!KS && pairs.length === 16 && pairs.every(([g, v]) => KS.VALUE[g] === v),
     KS ? pairs.filter(([g, v]) => KS.VALUE[g] !== v).map(([g, v]) => g + ' sheet ' + v + ' code ' + KS.VALUE[g]).join('; ') : '');
  ok('the sheet states the preceded-by-a-vowel rule',
     /must be preceded by a vowel/i.test(sheet));
}

section("The script: wiring");
ok('it is loaded before the galaxy bundle', /lazyLoad\('assets\/khai-script\.js'\)/.test(idx));
ok('every call site guards on it having loaded',
   /if\(!window\.KhaiScript\) return '';/.test(gx));
ok('the world name carries its glyphs', /isKhai2 \? reachGlyphLine\(m\.name/.test(gx));
ok('zone names carry theirs', /reachGlyphLine\(z\.name/.test(gx));
ok('the glyphs inherit colour rather than hardcoding it',
   /stroke="currentColor"/.test(ks));
ok('no em dashes in the shipped script module', !/\u2014/.test(ks));

section("Zharkofin renders as the Hivelord, not as a dev account");
// This needed BOTH layers. The server colour chain and core.js each apply their
// own dev override, and the client one repaints whatever the server sent, so a
// server-only fix is invisible. Asserting both is the point of these.
ok('the seed still carries the Hivelord colour',
   /title:\s+'Hivelord'/.test(seed) && /title_color:\s+'#c2551f'/.test(seed));
{
  const i = srv.indexOf('const chatBadge = _isOwner');
  const chain = i < 0 ? '' : srv.slice(i, srv.indexOf('const chatText =', i));
  ok('server: an equipped gifted title is resolved before the dev branch',
     chain.indexOf('_giftEquipped.color') > 0
     && chain.indexOf('_giftEquipped.color') < chain.indexOf('else if (_isDev) chatColor = null;'));
  ok('server: the gift badge is resolved before the dev branch',
     chain.indexOf('_giftEquipped.badge') < chain.indexOf('_isDev ? null'));
  ok('server: owner still outranks a gifted title',
     chain.indexOf("chatColor = '#ff6a00'") < chain.indexOf('_giftEquipped.color'));
  ok('server: a council seat still outranks a gifted title',
     chain.indexOf('_seatColor') < chain.indexOf('_giftEquipped.color'));
  ok('server: no unreachable gift arm left below the dev branch',
     !/else if \(_giftActive\) chatColor = _giftEquipped\.color;/.test(srv));
}
{
  const i = srv.indexOf('const wBadge=_isOwner');
  const chain = i < 0 ? '' : srv.slice(i, i + 1600);
  ok('whisper: the same ordering, or a GM reverts to a dev account mid conversation',
     chain.indexOf('_wGiftEquipped.color') < chain.indexOf('else if(_isDev) wColor=null;'));
  ok('whisper: the payload carries giftTitle so the client can stand down',
     /from:actor\.name[^}]*giftTitle:/.test(srv));
}
ok('client: the chat dev override stands down for an equipped gifted title',
   /const isDev\s+= !isOwner && !!\(item\.is_dev\) && !item\.giftTitle;/.test(core));
ok('client: the whisper dev override stands down too',
   /const _wDev=!d\.is_prime&&!!d\.is_dev&&!d\.giftTitle;/.test(core));
ok('client: a dev with no gifted title still paints as a dev',
   /_DEV_COLOR/.test(core) && /isDev \? _DEV_COLOR/.test(core));

section('Terrain agrees across every source that declares it');
// Ossuveth shipped as an ocean world in 1.4.4.0 and TWO of its five terrain
// declarations still said station. The old check asserted the station TEXT was
// gone, which is a different thing from the station TERRAIN, and passed while
// the GM panel still labelled the world STATION. This compares the sources to
// each other rather than to a list written here, so it fails on any future
// divergence without needing to be updated.
{
  const grab = (src, re) => {
    const m = src.match(re);
    if (!m) return null;
    const out = {};
    for (const p of m[1].matchAll(/(ks_[a-z0-9_]+)\s*:\s*'([a-z]+)'/g)) out[p[1]] = p[2];
    return out;
  };
  const fromReachTerrain = grab(gx,    /window\.REACH_TERRAIN = \{([\s\S]*?)\};/);
  // Renamed to _FALLBACK when the panel stopped treating its private copy as an
  // authority and started preferring window.REACH_TERRAIN. Still checked: a
  // fallback that disagrees with the server is a fallback that renders a lie
  // whenever the galaxy bundle has not loaded, which is every cold panel open.
  const fromPanel        = grab(panel, /const REACH_TERRAIN_FALLBACK = \{([\s\S]*?)\};/);
  // city.js writes a nested form, so it needs its own pattern rather than the
  // flat one. Folding it in as a fifth source is the point: it is the SERVER's
  // opinion of the ground, and a client that disagrees with it is the exact
  // shape of the bug this section exists to catch.
  const fromCityVisual = {};
  for (const m of city.matchAll(/(ks_[a-z0-9_]+):\s*\{[^}]*terrain:\s*'([a-z]+)'/g)) fromCityVisual[m[1]] = m[2];
  const fromMeta = {};
  for (const m of gx.matchAll(/(ks_[a-z0-9_]+): \{[\s\S]{0,220}?terrain:'([a-z]+)'/g)) fromMeta[m[1]] = m[2];
  const fromBattle = {};
  for (const m of rb.matchAll(/id:'(ks_[a-z0-9_]+)',\s*tag:"[^"]*",\s*terrain:'([a-z]+)'/g)) fromBattle[m[1]] = m[2];

  const sources = { 'REACH_TERRAIN (galaxy)': fromReachTerrain, 'COLONY_META.terrain': fromMeta,
                    'REACH_TERRAIN (panel)': fromPanel, 'reach-battle WORLDS': fromBattle,
                    'COLONY_VISUAL (server)': fromCityVisual };
  ok('every terrain source parsed', Object.entries(sources).every(([, v]) => v && Object.keys(v).length === 10),
     Object.entries(sources).map(([k, v]) => k + '=' + (v ? Object.keys(v).length : 'null')).join(' '));
  const worlds = Object.keys(fromReachTerrain || {});
  for (const w of worlds) {
    const vals = Object.entries(sources).map(([k, v]) => [k, v && v[w]]);
    const distinct = [...new Set(vals.map(v => v[1]))];
    ok(w + ' has one terrain across all sources', distinct.length === 1,
       vals.map(v => v[0] + '=' + v[1]).join(' '));
  }
  ok('no Reach world still claims the station terrain',
     !worlds.some(w => fromReachTerrain[w] === 'station'));
  ok('the server visual is the ocean world too',
     fromCityVisual.ks_07 === 'ocean', fromCityVisual.ks_07 || 'unparsed');
}

section('Vesskanoth is red ground, and New Anchor is not');
// tether is a SHAPE vocabulary shared by the Reach and the Coalition. The two
// must not share a palette, and the risk is somebody unifying them later as a
// tidy-up, so this asserts they are different rather than asserting either
// value. Retuning the red keeps passing; merging the two files does not.
{
  const hiveTether = (hive.match(/tether:'(rgba\([^)]*\))'/) || [])[1];
  const battTether = (rb.match(/tether:'(rgba\([^)]*\))'/)   || [])[1];
  const cityTether = (cityc.match(/tether:'(rgba\([^)]*\))'/)|| [])[1];
  const red = v => { const p = (v||'').match(/rgba\((\d+),(\d+),(\d+)/); return p && +p[1] > +p[2] + 25 && +p[1] > +p[3] + 25; };
  ok('the hive survey paints Reach tether red', red(hiveTether), hiveTether);
  ok('the battlefield paints Reach tether red', red(battTether), battTether);
  ok('the two Reach renderers agree on the family', red(hiveTether) === red(battTether));
  ok('the Coalition city view is untouched and still not red', !red(cityTether), cityTether);
  ok('the Reach and the city do not share a tether value', hiveTether !== cityTether);
  ok('the tether spokes are no longer green', !/rgba\(120,200,150/.test(hive));
}

section('Coalition forces scale to what players funded');
// The model is EXECUTED here rather than grepped: the two functions are pure,
// so they are lifted out of the file and run. A regex can tell you a constant
// exists and cannot tell you 150% funding does not put 900 men on a 700 man
// field.
{
  let FF = null, AF = null, sharesOf = null;
  try {
    const a = rb.indexOf('function forcesFor(zone){');
    const b = rb.indexOf('/* Armour and air are what money buys');
    const c = rb.indexOf('function applyFunding(ratio){');
    const d = rb.indexOf('\n}', c) + 2;
    const body = 'var armShare, heliShare;\n' + rb.slice(a, b) + rb.slice(c, d)
               + '\nreturn { forcesFor, applyFunding, shares: () => ({ armShare, heliShare }) };';
    ({ forcesFor: FF, applyFunding: AF, shares: sharesOf } = new Function(body)());
  } catch (e) { /* FF stays null and the assertions below fail loudly */ }
  ok('the force model lifts out and runs', !!FF && !!AF);

  if (FF && AF) {
    const Z = (hive, win) => ({ hive, win });
    const W = (pool, target, extra) => Object.assign({ pool, target, open: 1, funders: 4 }, extra || {});
    const T = 7_200_000;

    ok('an unfunded push on brood-held ground is outnumbered',
       FF(Z(100, null)).coalFrac < 0.35, String(FF(Z(100, null)).coalFrac));
    ok('holding ground raises the baseline without any funding',
       FF(Z(0, null)).coalFrac > FF(Z(100, null)).coalFrac);
    ok('funding raises it', FF(Z(100, W(T, T))).coalFrac > FF(Z(100, null)).coalFrac);

    // The design claim, asserted rather than asserted-in-a-comment: money is
    // the bigger lever than ground, because money is the thing players pull.
    const ctrl = FF(Z(0, null)).coalFrac - FF(Z(100, null)).coalFrac;
    const fund = FF(Z(100, W(T, T))).coalFrac - FF(Z(100, null)).coalFrac;
    ok('funding moves the field more than control does', fund > ctrl,
       'control ' + ctrl.toFixed(2) + ' vs funding ' + fund.toFixed(2));

    ok('a fully funded push roughly doubles the Coalition presence',
       FF(Z(100, W(T, T))).coalFrac / FF(Z(100, null)).coalFrac > 1.7);
    ok('overfunding cannot run away', FF(Z(0, W(T * 20, T))).coalFrac <= 0.78,
       String(FF(Z(0, W(T * 20, T))).coalFrac));
    ok('the field never has fewer than a fifth on either side',
       [0, 50, 100].every(h => [null, W(0, T), W(T * 9, T)]
         .every(w => { const f = FF(Z(h, w)).coalFrac; return f >= 0.20 && f <= 0.78; })));

    // It is a RATIO against the target, not a credit count, because the target
    // already scales on garrison and remaining control. The same Ƒ against
    // cheap ground and against the last hard world are not the same push.
    ok('the same credits against a dearer target buy less',
       FF(Z(50, W(T, T))).coalFrac > FF(Z(50, W(T, T * 2))).coalFrac);

    // Which resolved windows still count. Spent is spent; refunded is not.
    ok('a carried window still counts, the credits were spent',
       FF(Z(50, W(T, T, { open: 0, resolved: 'carried' }))).fundRatio === 1);
    ok('a repelled window still counts too, for the same reason',
       FF(Z(50, W(T, T, { open: 0, resolved: 'repelled' }))).fundRatio === 1);
    ok('an UNANSWERED window does not, every credit was returned',
       FF(Z(50, W(T, T, { open: 0, resolved: 'unanswered' }))).fundRatio === 0);
    ok('nor a cancelled one', FF(Z(50, W(T, T, { open: 0, resolved: 'cancelled' }))).fundRatio === 0);

    ok('no zone at all does not throw', FF(null).coalFrac > 0);
    ok('a zero target does not divide by zero',
       FF(Z(50, W(5, 0))).fundRatio === 0 && Number.isFinite(FF(Z(50, W(5, 0))).coalFrac));

    AF(0);   const lo = sharesOf();
    AF(1);   const hi = sharesOf();
    // The field converges on these over minutes, because reinforcement replaces
    // losses at the CURRENT shares. So the ceiling is what a fully funded field
    // eventually LOOKS like, not a transient.
    ok('a fully funded field converges on armour that is still a minority',
       hi.armShare <= 0.12, String(hi.armShare));
    /* GUNSHIPS ARE BENCHED WAITING ON ART, so their share is pinned at zero and
       "money buys air" cannot be asserted through them. It has to keep being
       asserted through SOMETHING, or the claim that funding changes the field's
       composition quietly stops being tested: armour is now the whole of it.

       The gunship arithmetic is still checked - just below the clamp rather than
       after it - so restoring the flag restores a tested feature rather than an
       untested one. */
    ok('gunships are pinned at zero while they are benched', hi.heliShare === 0);
    ok('and the curve underneath still prices them rarely',
       /heliShare   = 0\.008 \+ \(0\.028 \+ FB\.air\)\*r;/.test(rb));
    ok('armour is what money buys', hi.armShare > lo.armShare * 2,
       'armour ' + lo.armShare + '->' + hi.armShare + ', air ' + lo.heliShare + '->' + hi.heliShare);
    ok('infantry is always the floor, some armour shows up unfunded',
       lo.armShare > 0 && lo.armShare + lo.heliShare < 0.15);
  }
}

section('Reinforcement arrives, it does not teleport the battle');
// A reseed would move every surviving unit back to the baseline and restart the
// fight, which reads as the viewer glitching rather than as help landing.
{
  // Scope this to the two functions that must never reseed, rather than to a
  // window of text near the tick. The first version looked only at the 2000ms
  // block and passed when a seedField() was planted inside reinforceToward,
  // which is the same defect one call deeper.
  const fnBody = (name) => {
    const i = rb.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = rb.indexOf('\nfunction ', i + 1);
    return rb.slice(i, j < 0 ? rb.length : j);
  };
  const tick = rb.slice(rb.indexOf('RB.tickIv = setInterval'), rb.indexOf('}, 2000);') + 9);
  ok('the tick calls the reinforcement path', /reinforceToward\(/.test(tick));
  ok('the tick does not reseed', !/seedField\(/.test(span('watch tick', tick)));
  ok('and neither does the reinforcement path itself',
     !/seedField\(/.test(fnBody('reinforceToward')) && !/seedField\(/.test(fnBody('reviveAsCoalition')));
  ok('seedField is only reached from opening a view',
     (rb.match(/seedField\(\);/g) || []).length <= 2, String((rb.match(/seedField\(\);/g) || []).length));
}
// Superseded: they come in on the rearmost camp held now, and only fall back
// to the map edge when we hold none. Asserted in the camps section.
ok('reinforcements still arrive behind the line, not into it',
   /rly\+0\.02\+rnd\(\)\*0\.05/.test(rb) && /: 0\.94\+rnd\(\)\*0\.06\)/.test(rb));
// An emplacement has no speed. Marched on from the rear it would sit at the
// back edge for the whole engagement, so it is dug in near the line instead.
ok('but an emplacement is dug in near the line, not marched on',
   /cls==='turret' \? Math\.min\(0\.92, CL\.front/.test(rb));
ok('they reuse dead slots so the draw cost stays flat',
   /deadIdx/.test(rb) && /reviveAsCoalition/.test(rb));
ok('a single tick cannot pop the whole reinforcement in at once',
   /want = Math\.min\(want, 24\);/.test(rb));
// seedField fills every slot alive, so a fresh engagement has no corpse to
// recycle. Funding it in the first minute must still place hardware.
ok('the hardware quota does not wait for a casualty',
   /units\.length < CEIL/.test(rb) && /units\.push\(nu\)/.test(rb));
ok('and growing the array is bounded',
   /var CEIL = Math\.round\(cap\*1\.12\);/.test(rb));
ok('only the quota may grow it, never plain bodies',
   /else if \(forced && units\.length < CEIL\)/.test(rb));
ok('reinforcement only ever adds, attrition is what takes away',
   /if \(want <= 0 && !quota\.length\) return 0;/.test(rb));
ok('a revived unit releases the cover slot its corpse was holding',
   /releaseSlot\(u\); u\.slot=-1;/.test(rb));
ok('the seeded split honours the funded fraction, not a hardcoded half',
   /Math\.round\(n\*FORCE\.coalFrac\)/.test(rb) && !/const n=cap, half=\(n\/2\)\|0;/.test(rb));
ok('the readout is cleared in survey mode, which has no war on it',
   /if \(RB\.mode !== 'battle'\)\{ el\.textContent = ''; return; \}/.test(rb));

section('Coalition muster strip');
// The strip is DERIVED from the same two numbers the battlefield uses. The
// first version of it scaled the shield line with funding and gated an
// engineer at 85%, which looked right and told a different story than the
// field: reach-battle.js holds knifeShare at a constant, so money buys
// hardware there and must buy hardware here. These assert the agreement, not
// the artwork.
{
  let T = null;
  try {
    const w = {};
    new Function('window','Image','requestAnimationFrame', troops)
      (w, function(){}, function(){ return 0; });
    T = w.FMTroops;
  } catch (e) { /* T stays null */ }
  ok('the troop module loads', !!T);

  if (T) {
    const n = (r,k) => T.roster(r,9).filter(x => x===k).length;
    ok('an unfunded muster is bodies only',
       T.roster(0,9).every(x => x==='assault' || x==='enforcer'), T.roster(0,9).join(','));
    ok('no emplacement on an unfunded push', n(0,'turret') === 0);
    ok('emplacements appear as the window fills', n(0.5,'turret') === 1 && n(1,'turret') === 2);
    ok('an engineer comes with them', n(0,'engineer') === 0 && n(1,'engineer') === 1);
    // The load-bearing one: blade troopers are NOT bought with credits.
    ok('the shield line does not scale with money',
       Math.abs(n(0,'enforcer') - n(1,'enforcer')) <= 1,
       n(0,'enforcer') + ' vs ' + n(1,'enforcer'));
    // Blade troopers were retired; the shield line inherited the job and the
    // property that matters, which is that it is not bought with credits.
    ok('blade troopers are gone from the battlefield entirely',
       !/'knife'/.test(rb) && !/knifeShare/.test(rb) && !/knifeCount/.test(rb));
    ok('the strip and the battlefield agree on the shield share',
       /SHIELD_SHARE = 0\.18/.test(troops));
    ok('and reach-battle holds the shield share constant',
       /const ENF_SHARE=0\.18;/.test(rb));
    // Turrets are no longer a share at all: engineers build them, so funding
    // buys engineers and how many guns each may run.
    ok('while engineers scale on the funded ratio',
       /engShare\s*= 0\.02 \+ 0\.04\*r;/.test(rb));
    ok('and turrets come from engineers, not from a share',
       /turretShare = 0;/.test(rb) && /spawnTurretAt\(/.test(rb));
    ok('hardware displaces bodies rather than adding to them',
       n(1,'assault') < n(0,'assault'));
  }
}

section('Muster strip: the frame table matches the files on disk');
// Every sheet is (width - 16) / 80 frames. Measured off the PNG headers rather
// than trusted, because a manifest that drifts from the art draws the wrong
// frame silently and forever.
{
  const dir = 'client/assets/space/troops/';
  const have = fs.existsSync(dir);
  ok('the troop art shipped', have);
  ok('the vehicle art shipped', fs.existsSync('client/assets/space/vehicles/'));
  if (have) {
    let T = null;
    try { const w = {}; new Function('window','Image','requestAnimationFrame', troops)
      (w, function(){}, function(){ return 0; }); T = w.FMTroops; } catch (e) {}
    const names = T ? Object.keys(T.FRAMES) : [];
    ok('the manifest is populated', names.length > 40, String(names.length));
    /* THIS ASSUMED EVERY SHEET IS A MAN, which was true until the Hound.
       80x64 cells, 16px pad, one row, directory hardcoded. A vehicle sheet is
       none of those, so the pitch comes from FMTroops.geom now and the check
       measures each sheet against ITS OWN declared geometry rather than against
       the troop pack's.

       That makes this stronger, not weaker. Before, it verified one hardcoded
       pitch; now it verifies that what geom CLAIMS about a sheet is what is
       actually on disk, which is the thing that silently rots when art is
       replaced. A cols/rows grid is checked both ways: the sheet must be big
       enough for the frame count, and not so big that frames were declared
       missing. */
    const bad = [];
    for (const nm of names) {
      const g = T.geom(nm);
      // g.base is CLIENT-relative because it is a URL at runtime; this check
      // runs from the repo root, so it needs the client/ prefix back on.
      const f = 'client/' + g.base + nm + '.png';
      if (!fs.existsSync(f)) { bad.push(nm + ' missing'); continue; }
      const b = fs.readFileSync(f);
      const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      const cols = g.cols || T.FRAMES[nm];
      const rows = Math.ceil(T.FRAMES[nm] / cols);
      if ((w - g.pad) < cols * g.cw) { bad.push(nm + ' w=' + w + ' needs ' + (g.pad + cols*g.cw)); continue; }
      if (h < rows * g.ch) { bad.push(nm + ' h=' + h + ' needs ' + (rows*g.ch)); continue; }
      // A frame declared past the end of the grid is a blank cel on screen.
      if (T.FRAMES[nm] > cols * Math.floor(h / g.ch))
        bad.push(nm + ' declares ' + T.FRAMES[nm] + ' frames, grid holds ' + (cols * Math.floor(h/g.ch)));
      // The anchor has to be inside the cell or the figure is drawn off it.
      if (g.ax < 0 || g.ax > g.cw || g.ay < 0 || g.ay > g.ch)
        bad.push(nm + ' anchor ' + g.ax + ',' + g.ay + ' outside ' + g.cw + 'x' + g.ch);
    }
    ok('every declared animation matches its sheet', bad.length === 0, bad.slice(0,4).join('; '));
    const onDisk = fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.slice(0,-4));
    const orphan = onDisk.filter(nm => !T.FRAMES[nm] && !nm.endsWith('_static'));
    ok('no sheet on disk is missing from the manifest', orphan.length === 0, orphan.join(','));
    // Every animation the strip actually plays must be one that exists.
    const used = [...troops.matchAll(/(?:idle|walk|fire):\s*'([a-z_]+)'/g)].map(m => m[1]);
    ok('every animation the strip plays is in the manifest',
       used.length >= 9 && used.every(u => T.FRAMES[u]),
       used.filter(u => !T.FRAMES[u]).join(','));
  }
}

section('Muster strip: it is mounted, and it is cleaned up');
ok('the strip is lazy loaded behind the galaxy bundle',
   /lazyLoad\('assets\/coalition-sprites\.js'\)/.test(idx));
ok('the window block emits a canvas for it', /canvas class="reach-muster"/.test(gx));
ok('it is only on the wide surface, not the narrow HUD rail',
   gx.indexOf('reach-muster') > gx.indexOf('if(!compact){'));
ok('live handles are reused rather than rebuilt each repaint',
   /if\(m && m\.el === el\)\{ m\.h\.set\(ratio\); continue; \}/.test(gx));
ok('a strip whose window closed has its loop stopped',
   /if\(seen\[k\]\) continue;[\s\S]{0,140}?\.h\.stop\(\)/.test(gx));
ok('the module explains why it is not in the battlefield',
   /single facing|SINGLE FACING/i.test(troops) && /orbit/i.test(troops));

section('Sprite sheets: a load failure must not be silent');
// This is the bug that shipped as "the example did not use the sprites": the
// standalone harness had no assets directory beside it, every sheet 404ed, and
// every Coalition unit fell back to wireframe without a word. The client path
// was fine the whole time, which is exactly why nothing caught it.
ok('the sheet source is overridable for pages with no assets directory',
   /function srcFor\(name\)/.test(troops) && /window\.FM_TROOP_SRC/.test(troops));
ok('a failed load warns once rather than failing silently',
   /im\.onerror/.test(troops) && /console\.warn\('\[troops\]/.test(troops));
ok('the warning names the url it could not fetch', /srcFor\(name\)/.test(troops));
ok('the client default path is unchanged',
   /var BASE = 'assets\/space\/troops\/';/.test(troops));
{
  // Every animation ANY file can ask for must exist on disk, or a unit hits a
  // sheet that will never load and silently reverts to wireframe forever.
  //
  // THIS ONLY SCANNED reach-battle.js AND THAT IS HOW turret_deploy GOT OUT.
  // coalition-sprites.js has its own preload list, which named a sheet the
  // renderer never played, and the check could not see it because it was
  // looking in the wrong file. Both are scanned now, and the grenade sheets
  // are included since they are named nowhere near a class prefix.
  const pat = /'((?:assault|enforcer|engineer|turret|grenade)_[a-z_]+)'/g;
  const asks = [...rb.matchAll(pat), ...troops.matchAll(pat)].map(m => m[1]);
  const uniq = [...new Set(asks)];
  const missing = uniq.filter(n => !fs.existsSync('client/assets/space/troops/' + n + '.png'));
  ok('every animation ANY file asks for is on disk', missing.length === 0, missing.join(','));
  ok('and both files are scanned, not just the renderer', uniq.length >= 14, String(uniq.length));
  // A sheet that is preloaded but never played is bandwidth for nothing, and
  // is exactly the shape of the one that 404ed in production.
  // sprAnim BUILDS most names (c + '_walk'), so a literal-only scan sees none
  // of them and reports every preloaded sheet as unplayed. Reconstruct the
  // concatenated ones from the class list crossed with the suffixes used.
  const classes = [...rb.matchAll(/(?:inf|enf|eng|turret):'([a-z]+)'/g)].map(m => m[1]);
  const suffixes = [...rb.matchAll(/c\s*\+\s*'(_[a-z_]+)'/g)].map(m => m[1]);
  const built = [];
  for (const c of classes) for (const sf of suffixes) built.push(c + sf);
  const played = [...new Set([...[...rb.matchAll(pat)].map(m => m[1]), ...built])];
  const pre = (troops.match(/function preload[\s\S]*?\];/) || [''])[0];
  const preNames = [...pre.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  const unplayed = preNames.filter(n => !played.includes(n));
  ok('nothing is preloaded that the renderer never draws',
     unplayed.length === 0, unplayed.join(','));
}

section('Sprite classes behave like what they are');
// EVERY ONE OF THESE WAS A REAL DEFECT, and they share a cause: three classes
// were added to the force model without being added to the simulation, so they
// fell through to the generic infantry path. That path was harmless while
// everything was a wireframe stick and is not harmless now that u.st chooses
// an animation.
{
  const i = rb.indexOf("if(u.cls==='turret'){");
  const tb = i < 0 ? '' : rb.slice(i, i + 1400);
  ok('an emplacement has its own branch', i > 0);
  // The generic path claims a cover slot and walks to it at u.sp. A turret's
  // speed is zero, so it never arrived, never left S_BOUND, and bounding units
  // do not fire: a gun that had never shot, playing a walk cycle on the spot.
  ok('it never manoeuvres to a cover slot', /releaseSlot\(u\);\s*\n\s*u\.slot=-1;/.test(tb));
  ok('it holds rather than bounding', /u\.st=S_HOLD/.test(tb));
  ok('and it actually fires', /fire\(u,units\[tj\]/.test(tb));
  ok('its branch runs BEFORE the infantry path that would strand it',
     i < rb.indexOf("const isTank=u.cls==='tank';"));
  ok('it outranges a rifleman, which is the point of it',
     /Math\.abs\(u\.y-front\)>0\.34/.test(tb));
}
{
  const i = rb.indexOf("if(u.cls==='enf'){");
  const eb = i < 0 ? '' : rb.slice(i, rb.indexOf("if(u.cls==='heli'){"));
  ok('the shield trooper sets its own state', /u\.st=S_BOUND/.test(eb) && /u\.st=S_HOLD/.test(eb));
  // It set no state at all, so it kept the S_BOUND it was seeded with and
  // played the walk cycle forever: closing, standing, and hitting things.
  ok('it walks while closing and holds at contact',
     /u\.st=S_BOUND;\s*\/\/ closing/.test(eb) && /u\.st=S_HOLD;\s*\/\/ at contact/.test(eb));
  ok('and holds once it is stood on the line',
     /u\.st = gap>0\.012 \? S_BOUND : S_HOLD;/.test(eb));
  ok('it can still catch a rusher, which is its whole job',
     /cls==='enf'  \? 0\.0019/.test(rb));
}
ok('bash is a contact animation, not a has-a-target-somewhere animation',
   /u\.mel>=0 && u\.st===S_HOLD && c==='enforcer'/.test(rb));
ok('the engineer works behind the firing line, not on it',
   /const isEng=u\.cls==='eng';/.test(rb) && /isEng\?0\.16/.test(rb));

section('Emplacements are built, grenades are thrown');
{
  const i = rb.indexOf("if(u.cls==='eng'){");
  const eb = i < 0 ? '' : rb.slice(i, rb.indexOf('/* ── emplacements', i));
  ok('engineers build emplacements rather than them being seeded', /spawnTurretAt\(/.test(eb));
  // Count scales on BOTH levers: funding sets guns per engineer, and how many
  // engineers are alive is the disposition of the force.
  ok('how many each may run scales on funding',
     /const allow=1\+Math\.floor\(FORCE\.fundRatio\*2\);/.test(eb));
  ok('and the total therefore scales on engineers alive too', /u\.built<allow/.test(eb));
  ok('the flat turret share is retired', /turretShare = 0;/.test(rb));
  ok('a gun being bolted down does not shoot', /if\(u\.deploy>0\)\{ u\.deploy-=dt; continue; \}/.test(rb));
  ok('the placing animation covers real work, not a spawn effect',
     /u\.place>0\) return 'engineer_placing_turret'/.test(rb));
  // The ceiling scales with what funding bought (engineers) instead of being a
  // flat 48, and it is checked at BUILD COMPLETION as well as at build start:
  // thirty engineers starting a 1.4s build in the same frame all finished, and
  // a limit of twenty produced thirty-seven guns.
  ok('there is a ceiling on emplacements and it scales with funding',
     /function turretCeiling\(\)/.test(rb) && /FORCE\.fundRatio\*14/.test(rb));
  ok('it is re-checked when the build completes, not only when it starts',
     (rb.match(/turretLive < turretCeiling\(\)|turretLive<turretCeiling\(\)/g) || []).length >= 2);
  ok('and a new emplacement is counted immediately, not at the next recount',
     /turretLive\+\+;/.test(rb));
}
{
  ok('grenades exist and use the pack arc, landing and burst',
     /'grenade_flying'/.test(rb) && /'grenade_landing'/.test(rb) && /'grenade_explosion'/.test(rb));
  ok('a grenade damages through the same call an airstrike uses',
     /damageNear\(g\.tx,g\.ty,NADE_R,-1,NADE_DMG\)/.test(rb));
  // It probed with random draws and cleared its own bar under one percent of
  // the time: a rifleman would have thrown about once an hour.
  ok('the crowd probe strides the field rather than rolling dice',
     /for\(let k=_nadeScan;k<L;k\+=step\)/.test(rb) && !/for\(let k=0;k<26;k\+\+\)\{\s*\n\s*const v=units\[\(Math\.random/.test(rb));
  ok('only riflemen throw', /u\.cls==='inf' && u\.side===1/.test(rb));
  ok('the throw has its own pose', /'assault_grenade_throw'/.test(rb));
}
ok('a hit registers long enough to be seen',
   /u\.hitT>0\) return c==='enforcer'/.test(rb) && /_v\.hitT=260;/.test(rb));
ok('and it is stamped in one place, not at every caller',
   (rb.match(/hitT=260/g) || []).length === 1);

section('Camera, and what a shot looks like');
// The camera was not fixed, it was UNREACHABLE: cinematic is the default, it
// cuts to its own hotspots and ignored the drag entirely, and the mode keys
// were undiscoverable on a bare canvas.
ok('a drag takes control away from cinematic',
   /if\(cam\.mode==='cine'\|\|cam\.mode==='follow'\) setCam\('orbit'\);/.test(rb));
ok('the overlay has visible camera controls', /id="camOrbit"/.test(idx) && /id="camCine"/.test(idx));
ok('and setCam is reachable from outside the module', /window\.rbSetCam = function/.test(rb));
ok('setCam can highlight the button that is on', /getElementById\('camOrbit'\)|'camOrbit'/.test(rb));
ok('orbit yaw is unbounded, so it goes all the way round',
   /cam\.orbA-=dx\*0\.005;/.test(rb) && !/orbA=Math\.max/.test(rb));
ok('and it can go below the dust line and high above it',
   /cam\.orbH=Math\.max\(-24,Math\.min\(260/.test(rb));

// The shooting sheets have muzzle flash and bullets painted in, which is why
// the pack ships No Flashes variants. Drawing a wireframe tracer on top was
// two sets of bullets for one shot.
/* The brood is on the sprite path too now, so the suppressor has to ask both
   tables. Asking only the Coalition's meant every creature got a wireframe
   tracer drawn over a muzzle flash its own sheet had already painted. */
ok('a round knows whether a sprite already drew it',
   /p\.spr = \(SPRITE_CLS\[u\.cls\] \|\| BROOD_SPRITE\[u\.cls\]\) \? 1 : 0;/.test(rb));
ok('and the round pool initialises that field', /dmg:0,spr:0\}/.test(rb));
ok('sprite shots skip the wireframe tracer', /if\(p\.spr\) continue;/.test(rb));
ok('tanks still get one, because a tank is wireframe',
   /seg\(p\.heavy\?trH:tr,bx,by,bz,ax,ay,az\);/.test(rb));

// A straight bright segment reads as an energy bolt from a species that has no
// energy weapons anywhere in its design.
ok('brood fire is a thrown barb, not a line', /function gClaw\(path,X,Y,Z,ang,spin\)/.test(rb));
ok('it is drawn for brood rounds', /gClaw\(sp2,ax,ay,az/.test(rb));
ok('and it spins along its arc', /p\.t\*0\.028/.test(rb));
ok('the old straight spit segment is gone', !/else seg\(sp2,bx,by,bz,ax,ay,az\);/.test(rb));

section('The battle test bench cannot drift from the game');
// A bench that carries its own copy of the renderer starts lying the first
// time either side is touched. This one loads the real modules with script
// tags, which is the only property that makes it worth having.
{
  const P = 'client/battle-test.html';
  ok('the bench is in the repo', fs.existsSync(P));
  if (fs.existsSync(P)) {
    const bt = fs.readFileSync(P, 'utf8');
    ok('it loads the real renderer, it does not embed one',
       /<script src="assets\/reach-battle\.js"><\/script>/.test(bt)
       && !/function stepField/.test(bt) && !/function seedField/.test(bt));
    ok('and the real sprite module',
       /<script src="assets\/coalition-sprites\.js"><\/script>/.test(bt)
       && !/window\.FMTroops =/.test(bt));
    // Compare the SCRIPT TAGS, not the filenames: both names appear in the
    // header comment above them, and the comment mentions the renderer first.
    ok('the sprite module is loaded BEFORE the renderer that asks it questions',
       bt.indexOf('<script src="assets/coalition-sprites.js">')
       < bt.indexOf('<script src="assets/reach-battle.js">'));
    // It sits beside index.html, so art resolves from the same relative path
    // the client uses. That makes it a deploy check as well as a bench.
    ok('it lives beside index.html so asset paths match the client',
       fs.existsSync('client/index.html'));
    ok('every script it references exists',
       [...bt.matchAll(/src="([^"]+)"/g)].map(m => m[1])
         .every(u => fs.existsSync('client/' + u)),
       [...bt.matchAll(/src="([^"]+)"/g)].map(m => m[1])
         .filter(u => !fs.existsSync('client/' + u)).join(','));
    // Its only job beyond wiring is faking the socket payload.
    ok('it fakes window._REACH and nothing else', /window\._REACH = \{/.test(bt));
    ok('it opens no socket and writes no game state',
       !/WebSocket/.test(bt) && !/fetch\(/.test(bt) && !/localStorage/.test(bt));
    ok('it surfaces missing sheets rather than failing quietly',
       /FMTroops\.failed\(\)/.test(bt) && /WIREFRAME/.test(bt));
    ok('every sheet its status list names is on disk',
       [...(bt.match(/var want = \[[\s\S]*?\];/) || [''])[0].matchAll(/'([a-z_]+)'/g)]
         .map(m => m[1]).every(n => fs.existsSync('client/assets/space/troops/' + n + '.png')));
    ok('it is marked noindex, being a dev surface', /name="robots" content="noindex"/.test(bt));
    // The bench prices ground itself, so its formula has to track the server's.
    ok('its pushTarget mirrors the server formula',
       /0\.6 \+ g\/125/.test(bt) && /0\.7 \+ h\/200/.test(bt)
       && /0\.6 \+ g \/ 125/.test(reach) && /0\.7 \+ h \/ 200/.test(reach));
  }
}

section('Stationary units stand still');
// u.ph is ADVANCED every step to drive the idle bob and the rotor. sprFrame
// used it as a per-unit phase OFFSET, so the frame index was being pushed by a
// term that moves on its own: a five frame per second idle actually cycled at
// about twenty-seven, unevenly. Every stationary soldier flickered through his
// idle loop several times a second.
ok('the animation offset is constant per unit, not an advancing phase',
   /\(u\.i\|\|0\)\*0\.37/.test(rb) && !/T\*0\.001\*fps \+ u\.ph\*3/.test(rb));
ok('u.ph is still advanced, which is why it could not be the offset',
   /u\.ph \+= dtRaw\*0\.006\*u\.sk/.test(rb));
// The bob was sub-centimetre in world terms and the sprite layer rounds to
// whole pixels, so it landed as a one pixel twitch rather than a settle.
ok('a man holding a position is not nudged every frame',
   /if\(s\)\{ coverCount\+\+; u\.y=s\.y; u\.x=s\.x; \}/.test(rb));

section('The gunship stays wireframe, and earns it');
{
  const c0 = rb.indexOf('/* ── Coalition gunship');
  const i = rb.indexOf('function gHeli(p,u,lod){');
  // Slice from the header comment: the rationale lives above the function.
  const gh = i < 0 ? '' : rb.slice(c0 >= 0 ? c0 : i, rb.indexOf('\nfunction gSpit', i));
  ok('it takes a level of detail tier like the infantry does', i > 0);
  // Loosened from the literal path array name to the property it protects:
  // the dispatch has to hand the band to the drawer. Faction routing made the
  // path an expression, and pinning its text would fail on every future
  // faction for no reason.
  ok('and the dispatch passes one', /case 'heli': gHeli\(.*\[b\],u,b\); break;/.test(rb));
  // A gunship holds a lateral orbit and reverses at the field edge, so it flies
  // left half the time and right the other half while the camera orbits
  // independently. Two facings cannot cover that, and nothing banks in a
  // side-view pack.
  // Comments wrap, so match against the text with whitespace collapsed rather
  // than reflowing the source to suit a regex.
  const ghFlat = gh.replace(/\s+/g, ' ');
  ok('the file records why it is not a sprite',
     /single-facing sprite/.test(ghFlat) && /reverses at the field edge/.test(ghFlat));
  ok('the gunship still reverses at the edge, which is the reason',
     /if\(u\.x<0\.06\|\|u\.x>0\.94\) u\.vx\*=-1;/.test(rb));
  ok('the main rotor turns on the advancing phase', /const spin=u\.ph\*9/.test(gh));
  ok('and the tail rotor turns on its own axis', /spin\*1\.6/.test(gh));
  ok('it has the stub wings that say gunship rather than transport',
     /Stub wings and pods/.test(gh));
  ok('a chin turret that recoils with the hull', /Chin turret/.test(gh) && /rec=u\.fire>0/.test(gh));
  ok('and skids on struts rather than two floating lines', /Skids on struts/.test(gh));
  ok('the far tier keeps the old cheap silhouette', /if\(lod>=2\)\{/.test(gh));
}

section('Armour and gunships carry their detail');
// There are a dozen tanks and two gunships on a field of seven hundred, so
// detail on these is close to free and they are the units the cine camera
// actually gets close to. Measured at 0.26ms a frame for all of them at full
// detail, which is 1.5% of a 60fps budget.
{
  const lift = (name) => {
    const i = rb.indexOf('function ' + name + '(p,u,lod){');
    if (i < 0) return null;
    const j = rb.indexOf('\nfunction ', i + 1);
    const body = rb.slice(i, j < 0 ? rb.length : j);
    return (lod) => {
      let n = 0;
      new Function('rseg','setPose','wx','wz', body + '; return ' + name + ';')
        (() => { n++; }, () => {}, x => x, y => y)
        (null, { x:.5, y:.5, hdg:0, ph:1, alt:17, fire:0 }, lod);
      return n;
    };
  };
  const tank = lift('gTank'), heli = lift('gHeli');
  ok('both take a level of detail tier', !!tank && !!heli);
  if (tank && heli) {
    // The shape that matters: detail near, cheap far, and monotonic between.
    for (const [nm, f] of [['armour', tank], ['gunship', heli]]) {
      ok(nm + ' gets more detailed as it gets closer',
         f(0) > f(1) && f(1) > f(2), f(0) + '/' + f(1) + '/' + f(2));
      ok(nm + ' near tier is worth the name', f(0) >= 60, String(f(0)));
      ok(nm + ' far tier stays cheap', f(2) <= 20, String(f(2)));
    }
    // Whole-field ceiling, so a future detail pass has a number to check against.
    const worst = tank(0) * 16 + heli(0) * 2;
    ok('all armour and air at full detail stays well under the infantry cost',
       worst < 2600, String(worst) + ' segments');
  }
}
{
  const i = rb.indexOf('function gTank(p,u,lod){');
  const gt = i < 0 ? '' : rb.slice(i, rb.indexOf('\n/* ── Coalition gunship', i));
  ok('the hull has a raked glacis rather than a flat face', /glacis/.test(gt));
  ok('it has running gear, not just a box on the ground',
     /drive sprocket|sprocket/.test(gt) && /road wheels/i.test(gt));
  ok('the turret is six sided so it is not a second crate', /six sided/.test(gt));
  // The recoil has to move the barrel THROUGH the mantlet, or it reads as a
  // stick sliding in open air.
  ok('the gun recoils through a mantlet', /mantlet/.test(gt) && /mz-rec/.test(gt));
  ok('and the mantlet itself does not move', !/my.*mz.*-rec.*mantlet/.test(span('gTank body', gt)));
}
{
  const i = rb.indexOf('function gHeli(p,u,lod){');
  const gh = i < 0 ? '' : rb.slice(i, rb.indexOf('\nfunction gSpit', i));
  ok('the rotor disc is coned rather than flat', /dp=0\.22/.test(gh) && /DROOP/.test(gh));
  ok('it has engine housings and exhausts', /Engine housings/.test(gh) && /exhaust stack/.test(gh));
  ok('a sensor ball under the nose', /Sensor ball/.test(gh));
  ok('and a stabiliser with a tail rotor shroud', /Horizontal stabiliser/.test(gh));
}

section('Nothing in the render dispatch is undefined');
// THE CRASH THIS EXISTS FOR. Rebuilding the tank in 1.4.8.4 replaced the span
// of text from gTank to the gunship header, and gTurret was sitting inside
// that span. It went with it.
//
// Nothing complained, and nothing could: a case arm calling an undefined
// function is valid JavaScript right up until that arm runs. This one only
// runs when a turret exists AND its sheet is unavailable, so it survived every
// static check and every headless run, then took the render loop down a few
// seconds into a funded battle, which is precisely when the first emplacement
// goes up. Regex checks cannot see this class of fault. Resolving the call
// graph can.
{
  const called = [...new Set([...rb.matchAll(/\b(g[A-Z]\w*)\s*\(/g)].map(m => m[1]))];
  const defined = new Set([...rb.matchAll(/function\s+(g[A-Z]\w*)\s*\(/g)].map(m => m[1]));
  const missing = called.filter(n => !defined.has(n));
  ok('every geometry function called is also defined', missing.length === 0, missing.join(', '));
  ok('and there is a real set of them to check', called.length >= 12, String(called.length));

  // Same rule for the dispatch specifically, which is where a missing arm is
  // most expensive: it is the one place a class can silently have no drawer.
  /* The dispatch is found by the sprite gate that opens it, and that gate grew
     a brood clause. Anchored on queueSprite alone now rather than on the exact
     condition, so the next thing added to it does not blank this whole section
     silently: an empty `dispatch` makes every assertion below vacuously pass. */
  const d0 = rb.indexOf('&& queueSprite(u)) continue;');
  const dispatch = d0 < 0 ? '' : rb.slice(d0, rb.indexOf('}', rb.indexOf("case 'flyer'", d0)));
  /* Arms share a drawer now - rush, brute and grub all fall through to gRush -
     so a case label may be followed by another case label before the call. */
  const arms = [...dispatch.matchAll(/case '(\w+)':(?:\s*case '\w+':)*\s*(g[A-Z]\w*)\(/g)];
  const fallthrough = [...dispatch.matchAll(/case '(\w+)':\s*(?=case ')/g)].map(m => m[1]);
  ok('every dispatch arm names a defined function',
     arms.length > 0 && arms.every(m => defined.has(m[2])),
     arms.filter(m => !defined.has(m[2])).map(m => m[1] + '->' + m[2]).join(', '));

  // And every class the sim can create must have an arm or a sprite path, or
  // it draws as nothing at all.
  /* The seeded classes no longer come from a ternary ladder inline in the spawn
     loop: the brood's come from broodClass, which is a chain of returns. Both
     shapes are collected, or the check silently stops covering the half of the
     roster that moved. */
  const classes = [...new Set([
    ...[...rb.matchAll(/cls\s*=\s*r<[^?]*\?\s*'(\w+)'/g)].map(m => m[1]),
    ...(function () {
      const i = rb.indexOf('function broodClass(');
      if (i < 0) return [];
      const body = rb.slice(i, rb.indexOf('\n}', i));
      return [...body.matchAll(/return '(\w+)';/g)].map(m => m[1]);
    })(),
  ])];
  const armed = new Set([...arms.map(m => m[1]), ...fallthrough]);
  const spriteCls = [...rb.matchAll(/(\w+):'(?:assault|enforcer|engineer|turret|hound)'/g)].map(m => m[1]);
  const broodSpr = (function () {
    const i = rb.indexOf('const BROOD_SPRITE = {');
    if (i < 0) return [];
    return [...rb.slice(i, rb.indexOf('};', i)).matchAll(/(\w+):\s*'/g)].map(m => m[1]);
  })();
  const orphan = classes.filter(c => !armed.has(c) && !spriteCls.includes(c) && !broodSpr.includes(c));
  ok('every class the sim seeds has something that draws it',
     orphan.length === 0, orphan.join(', '));
}
ok('the emplacement wireframe exists and takes a detail tier',
   /function gTurret\(p,u,lod\)/.test(rb) && /case 'turret': gTurret\(.*\[b\],u,b\); break;/.test(rb));
ok('and it rises as it deploys rather than popping in whole',
   /u\.deploy>0\?Math\.min\(1,1-u\.deploy\/900\):1/.test(rb));

section('Troop sheets cannot be pinned to a cached miss');
// A browser caches a 404 exactly as readily as a 200. These sheets were added
// after players already had the page cached, so any host that served a miss
// once has clients that will never ask again, no matter how many times the
// files are deployed afterwards.
{
  const ver = JSON.parse(fs.readFileSync('client/version.json', 'utf8')).version;
  const m = troops.match(/var BUILD = '([^']+)';/);
  ok('the troop module carries a build stamp', !!m);
  // The stamp is bumped by hand, which is exactly the kind of thing that rots.
  ok('and it matches client/version.json', !!m && m[1] === ver,
     m ? m[1] + ' vs ' + ver : 'absent');
  ok('sheet urls carry it', /'\.png\?v=' \+ BUILD/.test(troops));
  ok('an explicit src map still wins, for pages with art inlined',
     /if \(m && m\[name\]\) return m\[name\];/.test(troops));
}

section('Both sides are replaced, or the picture is a lie');
// Only the Coalition was ever reinforced. A zone held for a few minutes drained
// to an all-Coalition field chasing a handful of survivors: measured in a sixty
// second soak, the brood went 442 -> 310 and was heading to zero, on ground the
// server still calls contested.
ok('the brood has a revive path of its own', /function reviveAsHive\(u, rnd\)/.test(rb));
ok('reinforcement counts the brood as well as the Coalition', /hiveLive/.test(rb));
ok('and tops it up toward its share of the field',
   /var wantHive = Math\.round\(cap \* \(1 - FORCE\.coalFrac\)\);/.test(rb));
// Nobody buys the Khai'sultull anything. Their replacement rate is the same
// number that already decides how hard they push back.
ok('the brood is replaced from GARRISON, not from funding',
   /garrisonOf\(\)\/100/.test(rb) && !/reviveAsHive[\s\S]{0,600}?fundRatio/.test(rb));
{
  // Slice the function rather than regexing across it: a lazy [\s\S]*? runs
  // straight past the closing brace and finds fundRatio somewhere else in the
  // file, which is a false failure, not a finding.
  const i = rb.indexOf('function reviveAsHive(u, rnd){');
  const body = i < 0 ? '' : rb.slice(i, rb.indexOf('\nfunction ', i + 1));
  ok('reviveAsHive takes no funding term at all',
     body.length > 0 && !/fundRatio|FORCE\./.test(body));
}
// One cursor over the dead list, or both sides revive the same corpses.
ok('the two revive passes share one cursor over the dead',
   /deadIdx\[cursor\+\+\]/.test(rb) && (rb.match(/deadIdx\[cursor\+\+\]/g) || []).length === 2);

section('The grenade timer drains in real time');
// It was decremented inside the aimed-fire block, which is only reached after
// the weapon cooldown elapses: it lost one frame per three seconds, so a four
// second timer took twelve and a half minutes and no grenade was ever thrown.
ok('the cooldown is decremented where seconds are counted',
   /if\(u\.nade>0\) u\.nade=Math\.max\(0,u\.nade-dtRaw\);/.test(rb));
ok('and not behind the fire gate any more', !/\n\s*u\.nade-=dt;/.test(rb));

section('A pose is chosen from movement, not from a flag');
// The crouch was keyed on u.sup>900, which is a suppression LEVEL and not a
// state, so a unit bounding while suppressed played the crouch and slid across
// the ground. S_PINNED moves every frame and had no case at all, so it fell
// through to idle and slid too.
ok('movement is measured from the position last frame',
   /u\.mv = u\.mv===undefined \? 0 : u\.mv\*0\.6/.test(rb) && /u\.px = u\.x; u\.py = u\.y;/.test(rb));
ok('the walk pose follows the measurement, not the state flag',
   /const moving = \(u\.mv\|\|0\) > 0\.000018;/.test(rb)
   && /if\(moving\) return c==='enforcer' \? 'enforcer_shielded_walk'/.test(rb));
ok('a crouch is only used while genuinely still',
   /if\(!moving && \(u\.st===S_SUPP \|\| u\.sup>900\)\)/.test(rb));
ok('and the frame rate follows it too, so the stride matches the pace',
   /const fps = \(\(u\.mv\|\|0\) > 0\.000018\)/.test(rb));
ok('no pose is chosen from S_BOUND any more', !/u\.st===S_BOUND \? 9/.test(rb));

section('Cover is rationed');
// Measured before: 12 of 12 tanks and 27 of 27 engineers were sitting in cover
// slots, while 194 riflemen competed for the ~60 that exist.
{
  const i = rb.indexOf("if(u.cls==='tank'){");
  const tb = i < 0 ? '' : rb.slice(i, rb.indexOf('/* ── emplacements', i));
  ok('armour has its own branch and never claims a slot',
     i > 0 && /if\(u\.slot>=0\)\{ releaseSlot\(u\); u\.slot=-1; \}/.test(tb));
  ok('it holds a standoff line rather than driving to a rock', /const stand = front \+/.test(tb));
  ok('and backs off when it has just been hit', /u\.hitT>0 \? 0\.30 : 0\.20/.test(tb));
}
ok('the cover rule lives where claiming happens, not where releasing does',
   /const noCover = \(u\.cls==='eng'\) \|\| \(u\.cls==='inf' && \(u\.i%3\)===0\);/.test(rb));
ok('and the claim itself is gated on it', /if\(!s && !noCover\)\{/.test(rb));
// A third of the infantry never digs in, so there is always a body of men
// moving forward rather than a firing line behind rocks.
ok('a third of the riflemen never take cover at all', /\(u\.i%3\)===0/.test(rb));
ok('the field is bigger, so cover is spread rather than contested',
   /const FIELD_W=420, FIELD_D=320;/.test(rb) && /terCount=52/.test(rb));

section('Wireframe units fire gunfire, not lasers');
ok('the cyan tracer is gone', !/rgba\(150,255,240/.test(rb));
ok('what is left reads warm', /rgba\(255,214,138/.test(rb) && /rgba\(255,176,72/.test(rb));
// A sprite unit has a muzzle flash painted into its sheet. A wireframe one has
// nothing, so a tank fired a line out of a silent hull.
ok('a wireframe shooter gets a muzzle flash of its own',
   /if\(!p\.spr\) flash\(u\.x,u\.y,u\.side,0,!!heavy\);/.test(rb));

section('Camps display server control, they do not decide it');
// THE CONSTRAINT THIS FEATURE WAS BUILT UNDER. The obvious version, camps
// captured client-side which then decide where the front sits, would make the
// client an authority on ground state the server already owns. Two authorities
// on one number is how a client starts disagreeing with the server about who
// holds a zone. So ownership is a PURE FUNCTION of the front the server sent.
ok('camps exist and are seeded per zone', /function genCamps\(seed\)/.test(rb) && /const CAMP_N=5;/.test(rb));
ok('ownership is a one-line function of the front',
   /function campOwner\(c\)\{ return c\.y > CL\.front \? 1 : -1; \}/.test(rb));
{
  // The load-bearing assertion: nothing in the camp code may WRITE the front.
  const i = rb.indexOf('const CAMP_N=5;');
  const j = rb.indexOf('function genHiveCities', i);
  const block = i < 0 ? '' : rb.slice(i, j);
  ok('no camp code assigns to CL.front', !/CL\.front\s*=/.test(block));
  ok('nor to the world control the server owns', !/\.hive\s*=/.test(block));
  ok('and it only ever reads it', /CL\.front/.test(block));
}
ok('a flip is presentation only: a flash and a blast, no state',
   /c\.own=o; c\.flash=2600;/.test(rb) && /blast\(c\.x,c\.y,BLAST\*1\.4\);/.test(rb));
// A camp reads as a spawn point without being one in any authoritative sense:
// the camp derives from the front, so where men appear derives from it too.
ok('reinforcements rally on the rearmost camp held', /const rly = rallyY\(1\);/.test(rb));
ok('the brood does the same from its own side', /const hly = rallyY\(-1\);/.test(rb));
ok('holding none puts them back on the map edge', /: 0\.94\+rnd\(\)\*0\.06\)/.test(rb));
ok('a Coalition camp and a brood camp are different KINDS of thing',
   /function gCamp\(p,c,own\)/.test(rb) && /octagonal berm/.test(rb) && /in the brood's idiom/.test(rb));
ok('camps are surfaced in the readout', /campsHeld\(1\) \+ '\/' \+ CAMP_N/.test(rb));


section('The brood takes level of detail tiers too');
// EVERY COALITION CLASS TOOK A TIER AND NO BROOD CLASS DID. The dispatch
// handed the depth band to gInf, gTank, gTurret and gHeli and handed nothing
// to the three hive drawers, so a rusher at two hundred units cost exactly
// what a rusher at ten did. That is backwards: the far band is where almost
// every unit is, and it is the band where none of the detail survives.
{
  const rI = rb.indexOf('function gRush(p,u,lod){');
  const fI = rb.indexOf('function gFlyer(p,u,lod){');
  ok('the rusher takes a tier', rI > 0);
  ok('the flyer takes a tier', fI > 0);
  /* The arms share drawers now (rush, brute and grub all fall through to gRush;
     flyer and wing to gFlyer), so this can no longer match one exact line. What
     it has to defend is unchanged and is the reason the section exists: the
     depth band still reaches the brood drawers, because the far band is where
     almost every unit is and it is where none of the detail survives. */
  ok('and the dispatch passes one to each',
     /gRush\(pRush\[b\],u,b\); break;/.test(rb) &&
     /gFlyer\(pFly\[b\],u,b\); break;/.test(rb));
  // Every melee creature reaches a drawer, not just the one the arm is named for.
  ok('and every closing creature has a wireframe fallback',
     /case 'rush': case 'brute': case 'grub':/.test(rb) && /case 'leap':/.test(rb));
  ok('and both flyers do', /case 'flyer':case 'wing':/.test(rb));

  // THE POINT OF THE REBUILD IS THAT THE SWARM DID NOT GET MORE EXPENSIVE.
  // A rusher's far tier is ten segments, which is what the whole old model
  // cost at every distance. Everything added is spent inside the near band.
  const rFar = rb.slice(rb.indexOf('if(lod>=2){', rI), rb.indexOf('return;', rI));
  ok('the rusher far tier is still ten segments', (rFar.match(/rseg\(/g) || []).length === 10);
  const fFar = rb.slice(rb.indexOf('if(lod>=2){', fI), rb.indexOf('return;', fI));
  ok('and the flyer far tier is cheaper than the model it replaced',
     (fFar.match(/rseg\(/g) || []).length === 6);

  // Same fault as the cover bob taken out of the sprite path, reached from the
  // other side: an animation whose amplitude lands under a pixel is cost with
  // no picture. A far model holds its pose.
  ok('nothing animates in the rusher far tier', !/Math\.sin|u\.ph/.test(span('gRush far tier', rFar)));
  ok('nor in the flyer far tier, beyond the wingbeat it is drawn from',
     !/Math\.sin/.test(span('gFlyer far tier', fFar)));

  const rBody = rb.slice(rI, rb.indexOf('\nfunction ', rI + 20));
  const frI = rb.indexOf('function broodFrame(p,u,lod,B,bulge){');
  const frame = frI < 0 ? '' : rb.slice(frI, rb.indexOf('\nfunction ', frI + 20));
  ok('it walks on an alternating tripod, not six legs in unison',
     /const g=\(i===1\)===\(s<0\)\?g1:g2;/.test(frame));
  ok('and the mandibles close when it makes contact',
     /const mo=mel\?/.test(rBody));
  ok('the scythe rotates about a real elbow',
     /ex,B\+1\.05,ez,\s+tx,B\+1\.70,tz/.test(rBody));

  const fBody = rb.slice(fI, rb.indexOf('\nfunction ', fI + 20));
  ok('the flyer has four wings on two offset beats',
     /b2=Math\.sin\(u\.ph\*11\+1\.1\)/.test(fBody));

  // WHY THE ORDER OF THESE FUNCTIONS IS LOAD BEARING. The gunship's own
  // assertions slice from gHeli up to the first gSpit, so anything moved in
  // between would silently widen that slice and the gunship checks would start
  // passing against text that is not the gunship.
  const hI = rb.indexOf('function gHeli(p,u,lod){');
  const sI = rb.indexOf('function gSpit(p,u,lod){');
  ok('gSpit still terminates the gunship slice', hI > 0 && sI > hI);
  ok('and the rebuilt brood models sit beyond it', rI > sI && fI > sI);
}


section('One skeleton for the brood, and an air arm sized like the other one');
// THE BLADE TROOPER IS DRAWN FROM THE RIFLEMAN'S SKELETON ON PURPOSE. The
// brood had no such frame: a rusher was one flat diamond and a spitter was a
// different flat diamond, two shapes that happened to share a colour. And the
// spitter is the unit the player actually sees, because rushers are three in
// ten and flyers are now under four in a hundred.
{
  const frI = rb.indexOf('function broodFrame(p,u,lod,B,bulge){');
  const sI  = rb.indexOf('function gSpit(p,u,lod){');
  ok('there is a shared brood frame', frI > 0);
  ok('the rusher is built on it', /broodFrame\(p,u,lod,B,1\);/.test(rb));
  ok('and so is the spitter, carrying a swollen abdomen',
     /broodFrame\(p,u,lod,B,1\.30\);/.test(rb));
  ok('the spitter takes a tier at last', sI > 0);
  ok('and the dispatch passes it one',
     /case 'spit': gSpit\(pSpit\[b\],u,b\); break;/.test(rb));

  // The frame must sit beyond gSpit or it lands inside the span the gunship
  // assertions slice, and those checks start passing against the wrong text.
  ok('the shared frame sits beyond the gunship slice terminator', frI > sI);

  const sFar = rb.slice(rb.indexOf('if(lod>=2){', sI), rb.indexOf('return;', sI));
  ok('the spitter far tier is eight segments', (sFar.match(/rseg\(/g) || []).length === 8);
  ok('and nothing animates in it', !/Math\.sin|u\.ph/.test(span('gSpit far tier', sFar)));
}

// FLYERS WERE A FLAT SEVEN PERCENT while a gunship never exceeds three and a
// half even fully funded, so the sky ran two to nine flyers per gunship.
// Nobody funds the brood, so its lever is the world's garrison, on the same
// curve heliShare uses against funding.
{
  ok('the flyer share is derived, not seeded flat',
     /function applyGarrison\(\)/.test(rb) && !/flyerShare=0\.07/.test(rb));
  // The gunship line now carries a Pad's ceiling bonus inside the coefficient,
  // so this asserts the two curves share their base and slope rather than
  // pinning the gunship expression character for character.
  ok('it uses the gunship curve against the garrison',
     /flyerShare = 0\.008 \+ 0\.028\*g;/.test(rb) &&
     /heliShare   = 0\.008 \+ \(0\.028 \+ FB\.air\)\*r;/.test(rb));
  const seeds = (rb.match(/applyFunding\(FORCE\.fundRatio\);/g) || []).length;
  const gars  = (rb.match(/applyGarrison\(\);/g) || []).length;
  ok('and it is recomputed everywhere funding is', gars >= seeds, gars + ' vs ' + seeds);
}

// A ROUND FIRED AT SOMETHING IN THE AIR HAS TO GO UP. fire() took a target
// altitude from the day it was written, stored it on the round, and no caller
// ever passed one and no line in the draw ever read one.
{
  ok('the tracer interpolates to the target altitude',
     /\+\(p\.tz\?p\.tz\*k:0\)/.test(rb) && /\+\(p\.tz\?p\.tz\*tail:0\)/.test(rb));
  const calls = [...rb.matchAll(/\bfire\(u,units\[(\w+)\][\s\S]{0,180}?\);/g)];
  ok('every aimed shot passes the target altitude', calls.length >= 4 &&
     calls.every(m => m[0].includes('units[' + m[1] + '].alt')),
     calls.filter(m => !m[0].includes('.alt')).length + ' without');
  ok('and so does the round the server credits',
     /fire\(shooter,victim\.x,victim\.y,best,hv,hv\?\(n\|\|1\):0,undefined,0,victim\.alt\);/.test(rb));
}


section('A zone is never silently dropped, and the strip stops quoting the renderer');
// THE BUG THIS EXISTS FOR HAS NOT HAPPENED YET, which is the only reason it is
// cheap to fix. loadReach rebuilt every world's zone array against zoneCount(),
// copying only indices below the population derived figure. That was the right
// repair for exactly as long as REACH_POP was the only thing that could set the
// number. The moment a GM can open a fourth battle, the same loop becomes
// silent data loss at the next cold start, taking the zone's live window and
// everything committed to it, and logging nothing, because from inside it looks
// like the repair it used to be.
{
  ok('the population figure is a floor, not a target',
     /const want = Math\.max\(w\.zones\.length, zoneCount\(id\)\);/.test(reach));
  ok('and blankZones can be asked for a specific count',
     /function blankZones\(colonyId, count\)/.test(reach));
  ok('the truncating form is gone', !/const want = zoneCount\(id\);/.test(reach));

  // Prove the property rather than the text: a longer stored array survives.
  const m = reach.match(/const want = Math\.max\(w\.zones\.length, zoneCount\(id\)\);[\s\S]{0,320}?\n      \}/);
  ok('the repair block still copies existing zones over the fresh ones',
     !!m && /Object\.assign\(fresh\[i\], w\.zones\[i\]\)/.test(m[0]));
}

// A LINE ON THE PLAYER STRIP HAS TO CHANGE WHAT SOMEBODY DOES. coalFrac decides
// how many wireframes get drawn and this file says outright that the field is a
// picture; quoting it back as a percentage invited players to read it as a
// casualty count.
{
  ok('the field share line is gone from the funding strip',
     !/OF THE FIELD IS OURS/.test(rb));
  ok('the funder count is shown against the minimum',
     /FORCE\.minFunders/.test(rb) && /' of ' \+ FORCE\.minFunders/.test(rb));
  ok('and the minimum is read from the payload root, not the window',
     /window\._REACH\.push && window\._REACH\.push\.minFunders/.test(rb));
  ok('guarded so the headless force model can still lift it out',
     /typeof window !== 'undefined' && window\._REACH/.test(rb));  ok('time remaining is shown while a window is open',
     /FORCE\.closesAt && FORCE\.windowOpen/.test(rb));

  // The server has written this sentence since windows shipped and nothing has
  // ever put it on screen, so a player arriving between windows saw an idle bar.
  ok('the last outcome is surfaced between windows',
     /rbOutcome/.test(rb) && /FORCE\.outcome/.test(rb));
  ok('and forcesFor carries it off the window payload',
     /outcome: \(w && w\.outcome\) \|\| '',/.test(rb));

  // Frame diagnostics stay, behind the flag that exists for them.
  ok('fps and unit counts are behind the debug flag',
     /window\._fmReachStats/.test(rb));
  ok('and the strip is empty without it', /\? f \+ ' fps/.test(rb) && /: ''\);/.test(rb));
}


section('Waves, and control that banks rather than averages');
// A WORLD'S CONTROL WAS THE FLAT MEAN OF ITS ZONES' LIVE CONTROL, which was
// right while a zone was fought exactly once. With waves it hands back ground
// already won: a fresh wave opens at 100 and the mean puts the planet straight
// back where it started. Control is banked waves plus progress inside the
// current one, floored so a live wave can never subtract from a banked one.
{
  ok('world control is derived by worldHive', /function worldHive\(w\)/.test(reach));
  ok('and the averaging form is gone',
     !/w\.hive = Math\.round\(w\.zones\.reduce/.test(reach));
  ok('a zone carries its banked waves', /cleared: 0,     \/\/ waves banked/.test(reach));
  ok('and when the current wave came up, for duration', /waveAt: 0,/.test(reach));

  // Prove the floor rather than the wording: lift worldHive out and drive it.
  const g = (sig, end) => { const a = reach.indexOf(sig); return reach.slice(a, reach.indexOf(end, a) + end.length); };
  const model = new Function('report', 'const WAVES_DEFAULT=3;const WAVE_GARRISON_STEP=' + 12 + ';\n'
    + g('function clampPct(n)', '}\n').replace('export ', '')
    + g('function worldHive(w)', '\n}\n')
    + g('export function effGarrison', '\n}\n').replace('export ', '')
    + `
      const w={garrison:50,waves:3,hive:100,zones:[{hive:100,cleared:0}]}, z=w.zones[0];
      const fresh=worldHive(w);
      z.hive=40; const part=worldHive(w);
      z.cleared=1; z.hive=100; const banked=worldHive(w);
      z.hive=100; const reversed=worldHive(w);
      const gEsc=effGarrison(w,z);
      z.cleared=3; z.hive=0; const done=worldHive(w);
      report({fresh,part,banked,reversed,gEsc,done});
    `);
  let R = null; model(o => { R = o; });
  ok('an untouched world reads 100', R && R.fresh === 100, R && String(R.fresh));
  ok('progress inside a live wave shows', R && R.part === 80, R && String(R.part));
  ok('banking a wave ratchets control down', R && R.banked === 67, R && String(R.banked));
  ok('and a wave going badly cannot undo a banked one',
     R && R.reversed === R.banked, R && (R.reversed + ' vs ' + R.banked));
  ok('the garrison escalates per wave banked', R && R.gEsc === 62, R && String(R.gEsc));
  ok('every wave on every zone reads zero, which is what conversion keys on',
     R && R.done === 0, R && String(R.done));
}

// The brood digs in as it is driven back. Applied at the call site rather than
// by mutating w.garrison, so the GM's figure stays the GM's figure and the
// bench's mirrored pricing formula keeps its signature.
{
  // Both now carry a FOB multiplier on the outside, so these assert the
  // escalated garrison is the input rather than pinning the whole expression.
  ok('a push is priced against the escalated garrison',
     /pushTarget\(effGarrison\(w, z\), z\.hive\)/.test(reach));
  ok('and a repel is scaled by it too',
     /4 \+ effGarrison\(w, z\) \/ 20/.test(reach));
  ok('pushTarget itself still takes garrison and hive, so the bench mirror holds',
     /export function pushTarget\(garrison, zoneHive\)/.test(reach));

  ok('clearing a wave banks it and brings up the next',
     /z\.cleared = Math\.max\(0, z\.cleared \| 0\) \+ 1;/.test(reach)
     && /z\.hive = 100;/.test(reach) && /z\.waveAt = Date\.now\(\);/.test(reach));
  ok('the last wave finishes the zone instead of reopening it',
     /z\.live = 0;[\s\S]{0,120}is clear\./.test(reach));
  ok('and a finished zone refuses new windows',
     /if \(zoneDone\(w, z\)\) return \{ ok: false/.test(reach));
  ok('a repelled window is what puts a brood node on that ground',
     /win\.broodNode = 1;/.test(reach));
}

// Growth is the GM's, and re-opening cleared ground is deliberate enough to be
// its own command rather than a side effect of some other one.
{
  ok('the wave count is a GM control', /export function setWaves\(id, n, actor\)/.test(reach));
  ok('bounded so a typo cannot open a hundred battles',
     /Math\.min\(WAVES_MAX, Number\(n\) \| 0\)/.test(reach));
  ok('and it is wired to the console', /cmd === 'reach_waves'/.test(srv));
  ok('the payload ships waves and each zone\'s banked count',
     /waves: \(w\.waves \| 0\) \|\| WAVES_DEFAULT,/.test(reach)
     && /cleared: z\.cleared \| 0,/.test(reach) && /done: zoneDone\(w, z\)/.test(reach));
}


section('Faction is not side, and a tint is not a second art pass');
// SIDE IS +1 AND -1 IN TWO DOZEN PLACES AND IS USED ARITHMETICALLY, including
// -p.side in the damage path. A third value there breaks combat in ways that do
// not announce themselves. Faction is a separate tag: side is which line you
// are on, fac is whose uniform you wear, and two factions share a side.
{
  /* THE TABLE MOVED, THE PROPERTY DID NOT. A faction's identity is one row in
     client/assets/factions.js now, and reach-battle keeps a view onto it with a
     fallback for the pre-load frame. What this defends is that faction is a
     first-class thing here and not a synonym for side, so it asserts the view
     and the fallback rather than a literal that has been deleted. */
  ok('there is a faction table', /var FAC = new Proxy/.test(rb)
     && /var FAC_FALLBACK = \{/m.test(rb));
  ok('with the brood in it, so amber is a faction colour and not a side',
     /khai: \{ line:\[194,85,31\]/.test(rb));
  ok('and a resolver that falls back on side', /function facOf\(u\)/.test(rb));
  ok('side is untouched: no third value anywhere',
     !/u\.side\s*=\s*(0|2|-2)\b/.test(rb) && !/side:\s*(0|2)\b/.test(rb));

  /* A SCALAR CANNOT NAME ANYBODY. `rnd() < jadeFrac ? 'jade' : 'coal'` works
     only because there are exactly two candidates and the reader knows which;
     it cannot express a Void and Guild line, or any away side that is not the
     brood. Both spawn paths sample the roster now. The property defended is
     unchanged: every unit carries a faction from the moment it exists. */
  ok('seeded units carry a faction', /const fac = pickFac\(side, rnd\);/.test(rb)
     && /i, side, cls, fac,/.test(rb));
  ok('away revives are tagged too', /u\.side = -1; u\.cls = cls; u\.fac = fac;/.test(rb));
  /* AND THE FACTION IS DRAWN BEFORE THE CLASS, at both spawn sites, because the
     away class table now depends on it: a brood faction draws creatures and a
     polity draws infantry. The other order gives a Syndicate soldier a crawling
     horror's class and then a uniform. */
  ok('faction is drawn before class at both spawn sites',
     rb.indexOf('const fac = pickFac(side, rnd);') < rb.indexOf('cls = awayClass(rnd, fac);')
     && rb.indexOf('var fac = pickFac(-1, rnd);') < rb.indexOf('var cls = awayClass('));
  // Replacement draws from the CURRENT mix, which is what makes the line turn
  // over from grey to teal as funding lands rather than snapping.
  ok('and home replacement draws from the current mix',
     /u\.fac = pickFac\(1, rnd\);/.test(rb));
  /* Which is what makes the line visibly turn over as a GM changes the mix,
     rather than snapping. The sampler has to read the LIVE roster, not a copy
     taken at seed. */
  ok('the sampler reads the live roster',
     /const L = side===1 \? ROSTER\.home : ROSTER\.away;/.test(rb));

  // Every one of these was a hardcoded literal keyed on side.
  ok('no hardcoded Coalition cyan is left in the draw call',
     !/'rgba\(78,205,196/.test(rb) && !/band\(pInf ,78,205,196/.test(rb));
  ok('no hardcoded brood amber either',
     !/'rgba\(214,112,44/.test(rb));
  /* Still off the faction table, and no longer off a hand-written list of which
     factions exist. Two named sets meant a THIRD faction on the field drew in
     the first one's colour, which is the "same unit changes faction when it gets
     far enough away" failure arriving through the fallback path. */
  ok('the bands stroke from the faction table',
     /var FC = FAC\[fk\], gp = facPaths\[fk\];/.test(rb));
  ok('and every faction present has its own paths, since a path strokes in one colour',
     /function pathsFor\(fac\)/.test(rb) && /const fp = pathsFor\(facOf\(u\)\);/.test(rb));
  /* Allocated on demand, so a field with one faction a side pays for two sets
     and not six, and the stroke loop walks what was actually created. */
  ok('and the sets are allocated on demand rather than up front',
     /facPaths\[fac\] = \{ inf:mk\(\), tank:mk\(\), heli:mk\(\), knife:mk\(\) \}/.test(rb));
  ok('the old two-faction switch is gone', !/const jd = u\.fac === 'jade';/.test(rb));

  /* THE BUG THIS PATCH IS ABOUT. sprAnim named the animation off u.side, so an
     away-side polity was routed into broodAnim, found no creature entry for a
     rifleman, returned null, and dropped to wireframe. Humans against humans
     loaded wireframes. Which sheet pack a unit draws from is its FACTION's
     question in all three places now: the class table, the sprite gate, and the
     animation picker. */
  ok('the animation picker asks the faction, not the side',
     /if\(isBroodFac\(u\.fac\)\)\{ const b=broodAnim\(u\); return b; \}/.test(rb));
  ok('and no sprite routing still tests the side', !/if\(u\.side===-1\)\{ const b=broodAnim/.test(rb));

  // Posture is a depth offset and nothing more: who stands nearer the enemy.
  /* Still one number and still the band clamp. It is asked about whichever
     faction the roster names as forward rather than about Jade specifically,
     because a composed line may contain no Jade at all. */
  ok('posture moves the band clamp rather than being its own system',
     /const fwd = \(u\.side!==1 \|\| !fwdFac \|\| ROSTER\.home\.length < 2\) \? 0/.test(rb)
     && /\(u\.fac === fwdFac \? -0\.055 : 0\.055\)/.test(rb));
  ok('and the commitment dial retunes arrivals, not the live field',
     /window\.reachJade = function\(frac, forward\)/.test(rb));
}

// FOUR COALITION CLASSES ARE SPRITES, so a second faction in the same kit is
// pixels, not a stroke colour. A second set of sheets on disk means an art pass
// per faction forever; a tint means every faction after the first is a hex.
{
  ok('the sprite module tints', /function tinted\(name, fac, skin, kit\)/.test(troops));
  // THE KEY IS FACTION PLUS ANIMATION. Keying on animation alone works right up
  // until two factions are on screen, then whichever drew first wins and the
  // other wears its colours: a bug that looks like it works.
  /* THE KEY GAINED A SKIN VARIANT. It still has to name everything that varies
     - that is the property this section defends, and the reason it defends it is
     unchanged: two factions on screen with a key that cannot tell them apart
     means whichever drew first wins and the other wears its colours. Skin is now
     a third thing that varies, and a key that omitted it would put one soldier's
     face on the whole line the same way. */
  /* Still three parts. sk is now nullable - null means "this faction does not
     remap skin" and -1 means "steel casing" - so it is stringified to keep those
     two from colliding, which they would if null were coerced to 0. */
  /* FOUR PARTS NOW, NOT THREE. The Syndicate issues no uniform and draws a kit
     per soldier, so the same sheet has five tinted copies for that faction and
     one for everyone else. The kit only joins the key where the faction HAS
     kits, so nothing else grows an entry it does not need. */
  ok('and the cache key is faction, skin, kit and animation',
     /var key = fac \+ '\|' \+ \(sk === null \? 'n' : sk\) \+ '\|' \+ kt \+ '\|' \+ name;/.test(troops));
  ok('and the kit is only in the key where the faction has kits',
     /var kt = facKits\(fac\) \? \(kit === undefined \? -1 : kit\) : -1;/.test(troops));
  // FIRST ATTEMPT WASHED THE SHEET toward a mid grey with a partial source-atop
  // fill, which compresses rather than desaturates: darks lift, lights drop,
  // and the figure lands in a narrow band around the fill. At field size the
  // turret nearly vanished. Luminance is preserved now and only hue is thrown
  // away, so the shading that makes pixel art read at 32px survives.
  ok('luminance is preserved rather than washed',
     /0\.299 \* px\[i\] \+ 0\.587 \* px\[i \+ 1\] \+ 0\.114 \* px\[i \+ 2\]/.test(troops));
  ok('and the washing fill is gone', !/0\.62\)/.test(troops));
  ok('alpha is never written, so the figure keeps its own edge',
     !/px\[i \+ 3\] =/.test(troops));
  // Arithmetic rather than the 'saturation' blend: shorter to write, and it
  // renders slightly differently per browser. This is the same everywhere.
  ok('done as arithmetic, not a blend mode whose result varies',
     /getImageData/.test(troops) && !/globalCompositeOperation = 'saturation'/.test(troops));
  /* THESE TWO PINNED THE OLD ROLES and both were faithful descriptions of the
     model 1.5.3.1 inverted. Jade wore a steel recolour of Coalition kit because
     the Coalition was the default force; it is not, the war is Jade's, and the
     art ships green. So Jade is the UNTINTED one and the Coalition is blue. */
  /* The numbers are in the registry now, so this reads them there. Same three
     values, same reason: blue rather than teal because the old teal sat a few
     degrees from the Hound's own turquoise. */
  ok('the Coalition is blue, with a little lift so the darks stay separated',
     /tint: \{ r: 0\.62, g: 0\.82, b: 1\.30, lift: 0\.10 \}/.test(facs));
  /* Steel was `jade: { r: 0.96, ... }` in FAC_TINT. Jade now has a HULL_GRADE
     entry - `jade: { r: 0.88, g: 1.04, b: 0.70 }` - which is a different table
     doing a different job, and a search for `jade: { r: 0.` cannot tell them
     apart. Scoped to FAC_TINT, which is where steel lived. */
  ok('and steel is gone rather than left lying about', (function () {
    return /jade: \{[^}]*tint: null/.test(facs.replace(/\s+/g, ' '));
  })());
  ok('the Circuit has a hull colour of its own',
     /hull: \{ r: 0\.88, g: 1\.04, b: 0\.70 \}/.test(facs));
  /* NO FACTION IS HARDCODED AS THE IDENTITY. The guard read `fac === 'coal' ||`
     BEFORE consulting the table, so adding a coal tint would have been silently
     ignored: a hex value in FAC_TINT that never reaches a pixel. A faction is
     untinted when, and only when, it has no entry. */
  /* A SHEET CAN NEED WORK WITHOUT ITS FACTION HAVING A TINT, and this assertion
     pinned the bug that made. Jade has no FAC_TINT entry by design - it wears
     the art as drawn - so this returned the raw image before anything else could
     look at the sheet, which is why the Jade Hound stayed turquoise while Jade
     infantry were olive. The gate is "does this faction need anything doing to
     THIS sheet", not "does it have a tint". */
  /* The gate has grown two more ways to be true, because a faction can now need
     work on a sheet without having a tint OR a hull: it may remap skin, or burn
     its optics. The property is unchanged - "does this faction need anything
     doing to this sheet", never "does it have a tint" - and the Syndicate is the
     row that proves the negative branch still exists. */
  ok('an untinted faction gets the original image back, not a copy',
     /if \(!facTint\(fac, kit\) && !\(hulled\(name\) && hullGrade\(fac\)\)\s*\n\s*&& !hasSkinPolicy\(fac\) && !hasRemap\(fac, name\)\) return im;/.test(troops));
  /* Matched as CODE, not as prose. The first version of this assertion looked
     for the old guard's text anywhere in the file and fired on the comment that
     explains why the old guard was wrong, which is a check that fails hardest
     on a file that documents its own history. Anchored on the `if (` now. */
  ok('and no faction is short-circuited ahead of the table',
     !/if \(!fac \|\| fac === '/.test(troops));
  // A tint that throws must not lose the figure: drawFrame returning false
  // after the unit was claimed off the wireframe path makes it vanish entirely.
  ok('and a tint that throws falls back to the untinted sheet',
     /catch \(e\) \{ return im; \}/.test(troops));

  /* AND A KIT. A faction that issues no uniform draws one per soldier, so the
     identity of a figure is now three things rather than two. */
  ok('drawFrame takes a faction, a skin and a kit',
     /function drawFrame\(ctx, name, frame, x, y, scale, fac, skin, kit\)/.test(troops));
  /* The flip is computed a line earlier now, because it has to ask the SHEET
     which way its art faces rather than assume right. The property this defends
     is unchanged: whatever the queue decides has to reach the blit. */
  ok('the queue carries it from the unit to the blit',
     /flip:flip,\s*\n?\s*fc:facOf\(u\),sk:skinOf\(u\),kt:kitOf\(u\)/.test(rb)
     && /drawAnchored\(ctx,q\.a,q\.f,q\.x,q\.y,q\.s,q\.fc,q\.flip,q\.sk,q\.kt\)/.test(rb));
  /* Fixed for a soldier's life and off his own index, like his tone, so he does
     not change coats when he takes cover or is reinforced back on. */
  ok('and the kit comes off the unit index, not a roll',
     /function kitOf\(u\)\{[\s\S]{0,200}?api\.kitFor\(u\.fac, u\.i\|\|0\)/.test(rb));
  /* THE MIRROR MOVED INTO THE SHEET LAYER. The battlefield used to translate by
     the CELL WIDTH and flip the context, which is right only while every figure
     is centred in an 80px cell. The Hound is centred in neither of its cells,
     and not in the same place in the two of them, so a cell-centred mirror slid
     the tank sideways whenever it turned - by a different amount walking than
     firing. drawAnchored mirrors about the ground contact point instead. */
  ok('the mirror is about the anchor, not the cell',
     /function drawAnchored\(ctx, name, frame, x, y, scale, fac, flip, skin, kit\)/.test(troops)
     && /ctx\.translate\(x, y\); ctx\.scale\(-1, 1\); ctx\.translate\(-x, -y\);/.test(troops));
  ok('the battlefield no longer mirrors about the cell width', !/ctx\.translate\(q\.x\+ax\*q\.s,0\)/.test(rb));
}


section('Every declared animation resolves to a file that exists');
/* THE BUG THIS EXISTS FOR. srcFor turns a name into a URL through geom(name),
   and sheet() resolves an animation to its SHEET first. The sheet key had no
   GEOM entry, so it fell through to the default base and every brood sheet was
   requested out of assets/space/troops/. All of them 404'd in the real client
   and every creature silently fell back to wireframe.

   THE BENCH CANNOT CATCH THIS, STRUCTURALLY. It inlines every sheet into
   FM_TROOP_SRC keyed by filename, and srcFor consults that map BEFORE it touches
   geom - so the one code path a self-contained bench can never exercise is the
   one that turns a name into a URL. That is exactly the path that broke.

   So this resolves every animation the manifest declares, through the real
   srcFor, and checks the file is on disk. No browser, no network. */
{
  let T = null;
  try {
    const w = { FM_BROOD_GEOM: JSON.parse(fs.readFileSync('client/assets/space/brood/geometry.json', 'utf8')) };
    new Function('window', 'Image', 'requestAnimationFrame', 'fetch', troops)(
      w, function () {}, function () { return 0; },
      function () { return { then() { return this; }, catch() {} }; });
    T = w.FMTroops;
    if (T && T.loadBrood) T.loadBrood();
  } catch (e) { /* reported by the assertion below */ }

  ok('the sprite module evaluates headless', !!T);
  if (T) {
    const bad = [], seen = new Set();
    for (const anim of Object.keys(T.FRAMES)) {
      const url = T.srcFor(T.imgKey(anim));
      if (/^data:/.test(url)) continue;              // inlined by a harness
      const rel = 'client/' + url.split('?')[0];
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (!fs.existsSync(rel)) bad.push(anim + ' -> ' + rel);
    }
    ok('every animation resolves to a file on disk', bad.length === 0, bad.slice(0, 5).join('; '));
    ok('and a real number of them were checked', seen.size >= 20, String(seen.size));
    // The specific fault, named, so a future refactor that reintroduces it fails
    // with the reason rather than with a list of missing files.
    ok('a brood animation resolves into the brood directory',
       /space\/brood\//.test(T.srcFor(T.imgKey('horror_s_move'))));
    ok('and the sheet key is registered, not just its animations',
       !!T.geom('horror_s').sheet);
  }
}


section('Declaring the Coalition has to change the field');
/* THE BENCH'S COALITION TOGGLE DID NOTHING VISIBLE AND THE SERVER HAD THE SAME
   TRAP. coalIn only gates whether a world's jade share MEANS anything; the share
   itself sits at 1 from blankWorld, so effJade returned an all-Jade line and the
   GM could declare an interstellar power into the war and watch nothing happen
   on any of ten worlds until they dialled each one by hand.

   The declaration is the event. Untouched worlds now take a default mix on
   entry; worlds the GM has explicitly dialled keep their value, which is what
   jadeSet exists for - there is no value of `jade` that can mean "unset", so it
   had to be a flag rather than a comparison against 1. */
{
  ok('a world records whether its share was ever set', /jadeSet: 0,/.test(reach));
  ok('and setJade records it', /w\.jadeSet = 1;/.test(reach));
  ok('entry has a default mix', /export const COAL_ENTRY_JADE = 0\.6;/.test(reach));
  ok('applied on entry, to untouched worlds only',
     /if \(!wl \|\| wl\.jadeSet\) continue;/.test(reach));
  ok('and logged, so the GM knows what moved', /untouched worlds set to/.test(reach));
  // Leaving the dials alone means re-declaring restores the war as it was.
  ok('withdrawal does not reset the dials',
     /Withdrawal does not put them back/.test(reach));

  /* Driven, not matched: the real entry path run against real state. */
  const setEntry = (function () {
    const m = reach.match(/export function setCoalitionEntry\(inWar, actor\) \{[\s\S]*?\n\}/);
    if (!m) return null;
    let state = null;
    const body = m[0]
      .replace('export function', 'function')
      .replace(/const s = loadReach\(\);/, 'const s = state;');
    const fn = new Function('getState', 'REACH_WORLDS', 'COAL_ENTRY_JADE', 'note', 'saveReach',
      'let state = getState();' + body + '; return setCoalitionEntry;');
    return (st) => {
      state = st;
      return fn(() => st, ['a', 'b', 'c'], 0.6, () => {}, () => {})(true, 'test');
    };
  })();
  ok('setCoalitionEntry lifted from source', typeof setEntry === 'function');
  if (setEntry) {
    const st = { coalIn: 0, worlds: {
      a: { jade: 1, jadeSet: 0 },        // never touched
      b: { jade: 1, jadeSet: 1 },        // GM chose all-Jade deliberately
      c: { jade: 0.4, jadeSet: 1 },      // GM chose a mix
    } };
    const r = setEntry(st);
    ok('entry succeeds', r && r.ok === true);
    ok('an untouched world gains a Coalition share', st.worlds.a.jade === 0.6);
    ok('a deliberate all-Jade world is left alone', st.worlds.b.jade === 1);
    ok('and so is a world already dialled', st.worlds.c.jade === 0.4);
    ok('and the war is now on', st.coalIn > 0);
  }

  /* The bench duplicates the constant because it has no server. Asserted equal
     so it cannot drift silently, the way the terrain tables once did. */
  const bench = fs.readFileSync('tools/battle-bench.py', 'utf8');
  const bm = bench.match(/var COAL_ENTRY_JADE = ([\d.]+);/);
  const sm = reach.match(/export const COAL_ENTRY_JADE = ([\d.]+);/);
  ok('the bench mirrors the entry constant', !!bm && !!sm && bm[1] === sm[1],
     (bm && bm[1]) + ' vs ' + (sm && sm[1]));
  ok('and its toggle sets the share, not just the flag',
     /S\.jade = S\.coalIn \? COAL_ENTRY_JADE : 1;/.test(bench));
  ok('the bench can report the faction mix', /facMix: function\(\)/.test(rb));
}


section('The war advances from the gate');
/* Everything in the Reach arrives through ks_gate_reach, so a front on
   Vesskanoth with the gate world untouched is an army that skipped nine worlds
   to reach the tenth. The map already told that story and nothing enforced it. */
{
  ok('there is an advance rule', /export function frontAllowed\(s, id\)/.test(reach));
  ok('the gate is always open', /if \(i <= 0\) return true;/.test(reach));
  // A whitelist would need editing every time the war moved.
  ok('and it is an advance, not a whitelist',
     /REACH_WORLDS\[i - 1\]/.test(reach) && /REACH_OPEN_AT/.test(reach));
  ok('broken into, not fully taken', /100 - \(prev\.hive \|\| 0\)\) >= REACH_OPEN_AT/.test(reach));
  ok('setFront enforces it', /!force && !frontAllowed\(s, id\)/.test(reach));
  // Jacob runs this live: a rule with no override is a rule in the way.
  ok('the GM can force one', /export function setFront\(id, on, actor, force\)/.test(reach));
  ok('and forcing is logged rather than silent', /front FORCED open out of order/.test(reach));
  ok('the command carries the override', /!!msg\.force/.test(srv));
  ok('and the panel offers it', /ev && ev\.shiftKey/.test(panel));
  /* A FRESH REACH IS QUIET AND THE WAR STARTS WHEN THE GM STARTS IT. This
     asserted the opposite - that seeding opens the gate world - on the reasoning
     that ten quiet worlds read as a war that has not started. The causality was
     backwards: that reading is CORRECT when the war has not started, and what
     was actually wrong was a server coming up for the first time already
     fighting somebody, with no moment left for a GM to declare anything.
     The property that replaces it is the one that makes starting it possible. */
  ok('a new state leaves every world quiet', !/worlds\[REACH_WORLDS\[0\]\]\.front = 1;/.test(reach));
  ok('and the gate can still be opened from the panel with no override',
     /if \(i <= 0\) return true;/.test(reach));

  /* Driven, not matched. frontAllowed is lifted and run against real state. */
  const fa = (function () {
    const m = reach.match(/export function frontAllowed\(s, id\) \{[\s\S]*?\n\}/);
    if (!m) return null;
    return new Function('REACH_WORLDS', 'REACH_OPEN_AT',
      m[0].replace('export function', 'function') + '; return frontAllowed;')(
      ['ks_gate_reach','ks_02','ks_03'], 40);
  })();
  ok('frontAllowed lifted from source', typeof fa === 'function');
  if (fa) {
    const S = h => ({ worlds: { ks_gate_reach: { hive: h }, ks_02: { hive: 100 } } });
    ok('the gate opens on a fresh war', fa(S(100), 'ks_gate_reach') === true);
    ok('the second world does not', fa(S(100), 'ks_02') === false);
    ok('nor at a token dent', fa(S(80), 'ks_02') === false);
    ok('but does once the gate is broken into', fa(S(55), 'ks_02') === true);
    ok('and a missing predecessor fails OPEN, not shut',
       fa({ worlds: {} }, 'ks_02') === true);
  }
}


section('Asset credits, which one licence requires and none of them had');
/* THE CREATURE PACK'S LICENCE REQUIRES ATTRIBUTION TO WILL TICE IN THE CREDITS,
   for USE, independently of anything to do with redistribution. Before this
   FleshMarket credited nobody anywhere, so the obligation was simply unmet.

   Asserted rather than trusted because a credit is exactly the kind of thing
   that survives one refactor and quietly does not survive the next, and nothing
   about the game breaks when it goes. Nothing would ever tell you. */
{
  const credits = fs.existsSync('docs/CREDITS.md') ? fs.readFileSync('docs/CREDITS.md', 'utf8') : '';
  const ac = fs.existsSync('client/assets/asset-credits.js')
    ? fs.readFileSync('client/assets/asset-credits.js', 'utf8') : '';
  ok('there is a credits file', credits.length > 200);
  ok('and a client module that renders it', ac.length > 500);
  ok('the panel is built from ONE table, not from markup', /var CREDITS = \[/.test(ac));

  /* Both lists are maintained by hand and this is the only thing stopping them
     drifting apart - which they would, in the direction of the client having
     fewer names, because that is the direction nobody notices. */
  const names = [...ac.matchAll(/who: '([^']+)'/g)].map(m => m[1]);
  ok('the table has a real roster', names.length >= 4, String(names.length));
  for (const who of names)
    ok('also in docs/CREDITS.md: ' + who, credits.indexOf(who.split(' / ')[0]) >= 0);
  ok('and the licence-required name is one of them', names.some(n => /Will Tice/.test(n)));
  ok('marked as required rather than offered', /who: 'Will Tice[^}]*req: true/s.test(ac));
  ok('the CC0 author is credited though not obliged',
     names.some(n => /RGS_Dev/.test(n)) && /req: false/.test(ac));
  /* THIS ASSERTED THE LIST WAS EMPTY AND THAT WAS THE WRONG INVARIANT. It fired
     the moment the list correctly stopped being empty - crediting Helianthus for
     the spinning planets exposed the black hole, the suns and the system icons
     that had been hidden behind them in the same directory. The check was
     telling me not to admit something I had just found out.

     What actually has to hold is that the unattributed list is HONEST: whatever
     is in it is also in docs/CREDITS.md, and the panel shows it when it is
     non-empty and hides the heading when it is not. Empty is a state, not a
     requirement. */
  ok('the heading hides itself rather than showing an empty list',
     /if \(UNKNOWN\.length\) \{/.test(ac));
  {
    const i = ac.indexOf('var UNKNOWN = [');
    const body = ac.slice(i, ac.indexOf('];', i));
    const items = [...body.matchAll(/'([^']{12,})'/g)].map(m => m[1]);
    // Every unattributed item is named in the file too, so the two cannot drift
    // in the direction of the client admitting less than the docs do.
    const doc = credits.toLowerCase();
    const missing = items.filter(t => {
      const key = t.split(',')[0].split(' and ')[0].trim().toLowerCase();
      return key.length > 8 && doc.indexOf(key.slice(0, 24)) < 0;
    });
    ok('unattributed items are admitted in docs/CREDITS.md too', missing.length === 0,
       missing.slice(0, 2).join('; '));
  }

  // The button lives beside the end-of-day clock, not in the tab row.
  ok('the button exists', /id="assetCreditsBtn"/.test(html));
  ok('and sits inside the timer wrap', (function () {
    const i = html.indexOf('id="eod-timer-wrap"');
    const j = html.indexOf('assetCreditsBtn');
    const k = html.indexOf('<div class="row">', i);
    return i >= 0 && j > i && j < k;
  })());
  ok('it is titled Asset Credits', />Asset Credits</.test(html));
  // Eager, not lazy: a credit that depends on a loader firing can silently not
  // be there, and this is the one surface a licence obliges to exist.
  ok('the module is loaded eagerly', /<script src="assets\/asset-credits\.js"><\/script>/.test(html));
  ok('and not through the lazy loader', !/lazyLoad\('assets\/asset-credits/.test(html));
  ok('there is a way to open it', /window\.openAssetCredits/.test(ac) && /openAssetCredits\(\)/.test(html));

  // A credits panel that silently omits people READS AS COMPLETE, which is
  // worse than one that says it is not.
  ok('unattributed art is listed rather than left out', /var UNKNOWN = \[/.test(ac));
  ok('with an invitation to come forward', /credited properly/.test(ac));
  ok('and docs/CREDITS.md says the same', /Unattributed|unattributed|not yet/i.test(credits));

  // Names are interpolated into innerHTML.
  ok('names are escaped before they reach the DOM', /function esc\(s\)/.test(ac)
     && /esc\(c\.who\)/.test(ac));
}


section('Licence-restricted art stays out of a public repo');
/* THREE OF FOUR ART PACKS FORBID REDISTRIBUTING THE ART and this repo is
   public. Deleting art after it has been pushed does NOT remove it: it stays in
   history and stays fetchable, so there is no cheap undo and the guard has to be
   before the commit rather than after. */
{
  /* MATCHED AGAINST CODE, NOT PROSE, and it took three failures in this one
     block to stop writing it the other way. Both files explain at length WHY
     they do what they do, so a naive search for 'rsync' or 'space/nature' finds
     the sentence saying it is deliberately not used, and the assertion fails on
     the very comment that documents the decision. Strip comments first. This is
     the third time this exact mistake has landed in this suite. */
  const uncomment = (t, mark) => t.split('\n')
    .filter(l => !l.trim().startsWith(mark)).join('\n');
  const gi = uncomment(fs.readFileSync('.gitignore', 'utf8'), '#');
  for (const d of ['client/assets/space/vehicles/', 'client/assets/space/brood/'])
    ok('gitignored: ' + d, gi.indexOf(d) >= 0);
  ok('and the terrain patches, by extension not the whole directory',
     /client\/assets\/space\/terrain\/\*\.png/.test(gi));
  // ATTRIBUTION.txt is the licence position and belongs in the repo; ignoring
  // the whole directory would have taken it with the art.
  ok('so ATTRIBUTION.txt is still tracked', !/space\/terrain\/$/m.test(gi));
  // CC0 art has no reason to leave.
  ok('the CC0 meshes stay in the repo', gi.indexOf('space/nature') < 0);

  const shipRaw = fs.readFileSync('ship.sh', 'utf8');
  const shipSh = uncomment(shipRaw, '#');
  ok('ship.sh refuses to commit tracked restricted art', /licence-restricted art is TRACKED by git/.test(shipSh));
  ok('and the gate runs BEFORE git add', shipRaw.indexOf('licence-restricted art is TRACKED') < shipRaw.indexOf('git add -A'));
  ok('the art is pushed separately over ssh', /tar czf - \$art \| ssh/.test(shipSh));
  // rsync is not assumed: tar and ssh are the only two things this deploy has
  // ever required on the box.
  ok('without assuming rsync exists on the box', !/rsync/.test(shipSh));
  // A bug in the file list should cost a stale asset, never a wiped one.
  ok('and it never deletes on the far end', !/--delete/.test(shipSh));
  ok('the restart happens after both the pull and the art',
     shipRaw.lastIndexOf('pm2 restart') > shipRaw.indexOf('tar czf - $art'));
}


section('The war fund, which is what makes the war continue without a GM');
// TAXES COVER QUIET GROUND AND NOTHING ELSE. The tax is a fixed figure and the
// burn scales on the same two things pushTarget scales on, so a self funding
// war is arithmetically impossible: the Coalition holds what it owns and
// players pay for everything past that. A war that funds itself is a war
// nobody needs to attend.
{
  ok('there is a fixed tax and a scaling burn',
     /export const FUND_TAX_PER_DAY/.test(reach) && /export const FUND_BURN_PER_DAY/.test(reach));
  ok('and both are marked provisional, being the only figures set by live data',
     /PROVISIONAL/.test(reach));
  ok('a quiet world burns nothing', /if \(!w\.front\) return 0;/.test(reach));
  ok('and the burn scales the way ground is priced',
     /FUND_BURN_PER_DAY \* \(0\.6 \+ g \/ 125\) \* \(0\.7 \+ h \/ 200\)/.test(reach));

  // Drive it rather than read it.
  const g = (sig, end) => { const a = reach.indexOf(sig); return reach.slice(a, reach.indexOf(end, a) + end.length); };
  const consts = reach.match(/export const FUND_[A-Z_]+\s*=\s*[\d_]+;/g).map(x => x.replace('export ', '')).join('\n');
  const M = new Function('report', consts + '\n'
    + g('function clampPct(n)', '}\n').replace('export ', '')
    + g('export function fundBurnPerDay', '\n}\n').replace('export ', '')
    + g('export function fundCover', '\n}\n').replace('export ', '')
    + `
      const quiet={front:0,garrison:50,hive:100,fund:0};
      const fresh={front:1,garrison:50,hive:100,fund:0};
      const hard ={front:1,garrison:100,hive:100,fund:0};
      const paid ={front:1,garrison:50,hive:100,fund:2000000000};
      report({ qb:fundBurnPerDay(quiet), qc:fundCover(quiet),
               fb:fundBurnPerDay(fresh), fc:fundCover(fresh),
               hb:fundBurnPerDay(hard),  pc:fundCover(paid) });
    `);
  let R = null; M(o => { R = o; });
  ok('a quiet world is fully covered by definition', R && R.qb === 0 && R.qc === 1);
  ok('taxes alone cannot hold a contested world',
     R && R.fc > 0 && R.fc < 0.5, R && (Math.round(R.fc * 100) + '%'));
  ok('and a hard world costs more than a fresh one', R && R.hb > R.fb);
  ok('coverage is clamped at one however much is banked', R && R.pc === 1);
}

// A FUND THAT EMPTIES IS WHAT MAKES A WORLD SLIP, with a reason a player can
// name, rather than a decay constant nobody can see. It cannot eat a banked
// wave, because worldHive floors on cleared and this only ever writes z.hive.
{
  const fn = reach.slice(reach.indexOf('export function tickFunds'), reach.indexOf('\n}\n', reach.indexOf('export function tickFunds')));
  ok('the fund ticks', /export function tickFunds\(now\)/.test(reach));
  ok('the balance floors at zero rather than going negative',
     /w\.fund = Math\.max\(0, Math\.round/.test(fn));
  ok('ground slips only when the fund is dry AND the world is contested',
     /const dry = burn > 0 && w\.fund <= 0 && FUND_TAX_PER_DAY < burn;/.test(fn)
     && /if \(dry\) \{/.test(fn));
  // Noted on the TRANSITION rather than every tick: this runs every thirty
  // seconds, and a line per tick would bury the log it exists to summarise.
  ok('and a world going dry is logged once, not every tick',
     /if \(dry !== !!w\.dry\)/.test(fn));
  ok('and never on a zone with a window open, or a finished one',
     /if \(!z\.live \|\| zoneDone\(w, z\) \|\| liveWin\(z\)\) continue;/.test(fn));
  ok('the slip is bounded per day', /FUND_DRIFT_PER_DAY \* days/.test(fn));
  // THE SAFETY PROPERTY: nothing in here touches banked waves.
  ok('nothing in the tick writes a banked wave count', !/z\.cleared\s*=/.test(span('tickFunds body', fn)));

  // Same invariant as the rest of the file and as the Chamber treasuries: a
  // pool that funds troops and can also be drained back out is a laundering
  // route, not a war fund.
  ok('the fund pays nothing out: reach.js still moves no cash',
     !/safeAddCash|addCash|savePlayer/.test(reach));

  // PM2 forgets setTimeout on restart, which is why the window sweep is a
  // sweep. A fund on its own timer would freeze the same way.
  ok('the tick rides the window sweep rather than its own timer',
     /reachTickFunds\(Date\.now\(\)\)/.test(srv) && !/setInterval\([^)]*[Ff]und/.test(srv));
}

// Between pushes the field fell back to a skeleton, which read as the war
// stopping rather than continuing without a push on it. The fund is the
// standing army; the window is the offensive.
{
  ok('the payload ships the fund, its burn and its coverage',
     /fund: Math\.max\(0, w\.fund \|\| 0\),/.test(reach) && /burn: fundBurnPerDay\(w\),/.test(reach));
  ok('and days left, which is the number that actually gets read',
     /daysLeft:/.test(reach));
  // forcesFor takes a zone and coverage is a world property, so it rides on the
  // zone rather than widening a signature the suite lifts out headless.
  ok('coverage is replicated onto each zone for forcesFor',
     /cover: Math\.round\(fundCover\(w\) \* 1000\) \/ 1000,[\s\S]{0,80}win: winView/.test(reach));
  ok('the battlefield takes the greater of the push and the standing budget',
     /var ratio = Math\.max\(wr, cover\);/.test(rb));
  ok('and the fund control is on the panel', /cmd:'reach_fund'/.test(panel));
}


section('One vote, three jobs');
// FOB choice, the hive lord's demands and Jade's requests are all decisions
// somebody has to make, and all three are decisions the GM would otherwise be
// making alone on behalf of a room whose mind he has to guess.
{
  ok('the primitive exists', /export function openVote\(colonyId, kind, question, options, hours, defaultId, actor\)/.test(reach));
  ok('a ballot is cast by player, not by wallet',
     /export function castVote\(colonyId, playerId, playerName, optionId\)/.test(reach));
  // ONE DONOR ONE VOTE. Weighting by credits rebuilds the whale button inside
  // the mechanism built to prevent it, somewhere less visible than a funding bar.
  ok('and nothing in the vote reads an amount',
     !/ballots\[[^\]]+\]\s*=\s*\{[^}]*amt/.test(reach));
  ok('eligibility is recent rather than ever',
     /export const VOTE_ELIGIBLE_DAYS/.test(reach)
     && /Date\.now\(\) - \(v\.at \|\| 0\)\) <= VOTE_ELIGIBLE_DAYS/.test(reach));
  // Recorded at commit rather than derived from the window roll later, because
  // the roll is trimmed to twelve names for display and eligibility must not
  // depend on a display concern.
  ok('and it is earned by funding the world, recorded at commit',
     /w\.voters\[playerId\] = \{ name: playerName \|\| 'unknown', at: Date\.now\(\) \};/.test(reach));
  ok('a ballot can be changed until the vote closes',
     /const had = v\.ballots\[playerId\];/.test(reach));

  // Drive the tally rather than read it.
  const i = reach.indexOf('  let win = v.defaultId;'), j = reach.indexOf('  v.result = win;');
  const M = new Function('report', 'const VOTE_MIN_BALLOTS=3;\n'
    + 'function resolve(options, defaultId, ballots){\n'
    + '  const v={options,defaultId,ballots}; const ids=Object.keys(ballots), tally={};\n'
    + '  for(const o of options) tally[o.id]=0;\n'
    + '  for(const id of ids) if(tally[ballots[id].opt]!==undefined) tally[ballots[id].opt]++;\n'
    + reach.slice(i, j).replace(/v\.resolved/g, 'var _r; _r')
    + '  return {win, n:ids.length};\n}\n'
    + `
      const O=[{id:'bastion'},{id:'pad'},{id:'cut'},{id:'spire'}];
      const B=(...v)=>Object.fromEntries(v.map((o,i)=>['p'+i,{opt:o}]));
      report({
        none:      resolve(O,'bastion',B()).win,
        under:     resolve(O,'bastion',B('pad','pad')).win,
        carried:   resolve(O,'bastion',B('pad','pad','pad')).win,
        tie2:      resolve(O,'bastion',B('pad','pad','cut','cut')).win,
        tie3:      resolve(O,'bastion',B('pad','cut','spire')).win,
        plurality: resolve(O,'bastion',B('cut','cut','cut','pad','spire')).win,
      });
    `);
  let R = null; M(o => { R = o; });
  ok('nobody answering lands the default', R && R.none === 'bastion');
  ok('and so does missing quorum', R && R.under === 'bastion');
  ok('three agreeing carries it', R && R.carried === 'pad');
  ok('a clear plurality carries without a majority', R && R.plurality === 'cut');
  // SEEDING THE RUNNING BEST FROM THE DEFAULT'S OWN COUNT and taking the first
  // strict improvement hands a 2-2 split to whichever option is earlier in the
  // list, so the outcome depends on the order the options were typed in.
  ok('a two way tie goes to the default, not to list order', R && R.tie2 === 'bastion');
  ok('and so does a three way tie', R && R.tie3 === 'bastion');
}

// A LIVE TALLY IS PRESSURE AND A BANDWAGON. Same rule winView follows for the
// funder roll: what matters to somebody deciding whether to answer is how many,
// not which way. Counts ride along once it is history.
{
  ok('a live vote ships ballot count but never a tally',
     /tally: open \? null : \(v\.tally \|\| null\)/.test(reach));
  ok('and tells a viewer whether they may vote at all', /canVote: viewerId/.test(reach));

  // NOTHING IN THIS LAYER MAY BLOCK WAITING FOR THE GM.
  ok('votes resolve on the clock from the sweep',
     /for \(const world of reachDueVotes\(Date\.now\(\)\)\)/.test(srv));
  ok('the player route moves no money',
     /app\.post\('\/api\/reach\/vote'/.test(srv)
     && !/reach\/vote'[\s\S]{0,1400}safeAddCash/.test(srv));
  ok('and it refuses guests, like the push route does',
     /reach\/vote'[\s\S]{0,400}guest_blocked/.test(srv));
  ok('the panel opens all three kinds', /REACH_VOTE_PRESETS/.test(panel)
     && /fob:/.test(panel) && /demand:/.test(panel) && /jade:/.test(panel));
  ok('FOB votes default to Bastion', /defaultId:'bastion'/.test(panel));
  // A demand that passes by silence teaches players that not turning up
  // concedes territory.
  ok('and a demand defaults to refusal', /defaultId:'refuse'/.test(panel));
}


section('Donations, and the cap that makes the burn mean something');
// THE CAP IS GLOBAL, NOT PER WORLD. A per world cap lets one wallet give the
// daily maximum on every world at once, which across ten worlds is ten times
// the figure the burn was reasoned against. The whole arithmetic here is
// minimum funders = burn over cap, and a cap that multiplies by the number of
// fronts is not a cap.
{
  ok('there is a daily cap and a floor',
     /export const DONATE_DAILY_CAP/.test(reach) && /export const DONATE_MIN/.test(reach));
  ok('the ledger sits at the state root, not on a world',
     /donors: \{\},         \/\/ playerId -> \{ day, amt, name \}/.test(reach));
  ok('and it is keyed per player per day', /function dayKey\(t\)/.test(reach)
     && /d\.day !== dayKey\(\)/.test(reach));
  // Left off the merge list it is rebuilt blank on every load, which turns a
  // restart into a cap reset.
  // coalIn joined this list in 1.5.2.0 for the same reason donors is on it: off
  // it, a restart silently un-declares the Coalition and every line in the Reach
  // reverts to Jade. Asserted as a prefix so the next field added does not have
  // to come back here, but donors and seen are still pinned by position.
  ok('the ledger survives a reload',
     /'log', 'donors', 'seen'[,\]]/.test(reach));
  /* PINNED BY MEMBERSHIP, NOT BY BEING LAST. This matched `'seen', 'coalIn']`
     and broke the moment `belligerents` was appended, which is a check that
     fails whenever the list it guards is extended correctly - the pressure then
     is to stop extending it. What matters is that the key is on the list. */
  ok('and so does the Coalition entry flag', /'coalIn'/.test(reach));
  /* Off the list a restart withdraws every declared faction while leaving the
     Coalition declared: a war that half-forgot itself, which is harder to
     diagnose than one that forgot itself entirely. */
  ok('and so do the other declared belligerents', /'belligerents'\]/.test(reach));

  // THE FLOOR IS DELIBERATELY LOW. A high minimum excludes exactly the small
  // donors whose COUNT is what matters, and their credits are marginal at these
  // burn figures anyway: what they bring is a head.
  ok('the floor matches the window floor rather than gating on wealth',
     /export const DONATE_MIN       = 100_000;/.test(reach));

  // A donation is not a commitment. A window refunds when it goes unanswered
  // because nothing was attempted; a donation is consumed by time passing.
  ok('the terms are stated in the payload, not left to the client',
     /export const DONATE_TERMS/.test(reach) && /terms: DONATE_TERMS/.test(reach));
  const dn = reach.slice(reach.indexOf('export function donate('), reach.indexOf('function blankState'));
  ok('and nothing in the donate path builds a refund', !/refund/i.test(span('donate body', dn)));
  ok('giving to a world earns a say on it, same record as funding a push',
     /w\.voters\[playerId\] = \{ name: playerName \|\| 'unknown', at: Date\.now\(\) \};/.test(dn));

  // Drive the cap.
  const consts = reach.match(/export const DONATE_[A-Z_]+\s*=\s*[\d_]+;/g).map(x => x.replace('export ', '')).join('\n');
  const M = new Function('report', consts + `
    function dayKey(){ return '2026-01-01'; }
    const S={donors:{}};
    function give(id, amt){
      if (amt < DONATE_MIN) return 'floor';
      const d=S.donors[id], had=(d&&d.day===dayKey())?(d.amt||0):0;
      if (had+amt > DONATE_DAILY_CAP) return 'capped';
      S.donors[id]={day:dayKey(),amt:had+amt}; return 'ok';
    }
    report({
      low:   give('a', DONATE_MIN - 1),
      atMin: give('a', DONATE_MIN),
      toCap: give('a', DONATE_DAILY_CAP - DONATE_MIN),
      over:  give('a', DONATE_MIN),
      other: give('b', DONATE_DAILY_CAP),
      cap:   DONATE_DAILY_CAP,
    });
  `);
  let R = null; M(o => { R = o; });
  ok('under the floor is refused', R && R.low === 'floor');
  ok('the floor itself is accepted', R && R.atMin === 'ok');
  ok('a player can reach the cap exactly', R && R.toCap === 'ok');
  ok('and is refused past it, even for the floor amount', R && R.over === 'capped');
  ok('another player has their own allowance', R && R.other === 'ok');

  // THIS IS THE DESIGN RELATIONSHIP, and it is the thing that breaks silently
  // if either constant is edited alone: how many people it takes to hold one
  // contested world for a day. Too few and it is a whale button; too many and
  // the world cannot be held at all.
  const cap = Number(reach.match(/DONATE_DAILY_CAP = ([\d_]+)/)[1].replace(/_/g, ''));
  const base = Number(reach.match(/FUND_BURN_PER_DAY  = ([\d_]+)/)[1].replace(/_/g, ''));
  const tax = Number(reach.match(/FUND_TAX_PER_DAY   = ([\d_]+)/)[1].replace(/_/g, ''));
  const fresh = Math.round(base * (0.6 + 50 / 125) * (0.7 + 100 / 200));
  const need = Math.ceil((fresh - tax) / cap);
  ok('holding a fresh contested world takes a real group, not one wallet',
     need >= 3 && need <= 12, need + ' donors at cap');
}

// Mirrors /api/reach/push, including the ordering that matters: every rejection
// inside donate() runs before it touches state, so debiting after a successful
// call cannot leave a charge against a fund that refused it.
{
  ok('there is a donation route', /app\.post\('\/api\/reach\/fund'/.test(srv));
  const rt = srv.slice(srv.indexOf("app.post('/api/reach/fund'"), srv.indexOf("app.post('/api/reach/push'"));
  ok('it refuses guests', /guest_blocked/.test(rt));
  ok('it refuses a sealed passage', /passage_sealed/.test(rt));
  ok('give max is resolved server side against cap and wallet',
     /Math\.min\(room, Math\.floor\(p\.cash\)\)/.test(rt));
  ok('and the debit happens only after the fund accepted it',
     rt.indexOf('reachDonate(') < rt.indexOf('safeAddCash') && /safeAddCash\(p, -amt\)/.test(rt));
}


section('What a cleared wave leaves standing');
// A CLEARED WAVE HAS TO LEAVE SOMETHING, or the structure is a bar that
// refills. A FOB is the ratchet made visible: it stands on ground already
// taken, it is still there when the next wave forms in front of it, and it
// grants something specific so losing one is a specific loss.
{
  ok('there are four works and a default', /export const FOB_TYPES/.test(reach)
     && /export const FOB_DEFAULT = 'bastion';/.test(reach));
  // EACH TYPE COUNTS ONCE. Without it, four types across five cleared waves is
  // a multiplier stack landing on the same two ceilings that already had to be
  // corrected once when a funded field converged on seventy five tanks.
  ok('a second of a type is a thing to defend, not more of its passive',
     /export function fobKinds\(w\)/.test(reach) && /out\[f\.type\] = 1;/.test(reach));

  // Drive the stacking rules.
  const g = (sig, end) => { const a = reach.indexOf(sig); return reach.slice(a, reach.indexOf(end, a) + end.length); };
  const effect = reach.slice(reach.indexOf('export const FOB_EFFECT'), reach.indexOf('export const DONATE_DAILY_CAP'));
  const M = new Function('report', effect.replace(/export /g, '')
    + g('export function fobKinds', '\n}\n').replace('export ', '')
    + g('export function fobBonus', '\n}\n').replace('export ', '')
    + g('export function nodeMass', '\n}\n').replace('export ', '')
    + `
      const one  = { fobs:[{type:'bastion'}] };
      const two  = { fobs:[{type:'bastion'},{type:'bastion'}] };
      const all  = { fobs:[{type:'bastion'},{type:'pad'},{type:'cut'},{type:'spire'}] };
      report({ oneArm:fobBonus(one).arm, twoArm:fobBonus(two).arm,
               allArm:fobBonus(all).arm, allPrice:fobBonus(all).price,
               kinds:fobKinds(all).length,
               mass1:nodeMass({nodes:[{}]}), mass99:nodeMass({nodes:new Array(99).fill({}) }) });
    `);
  let R = null; M(o => { R = o; });
  ok('one Bastion raises the armour ceiling', R && R.oneArm > 0);
  ok('and a second Bastion raises it no further', R && R.twoArm === R.oneArm);
  ok('four different works all count', R && R.kinds === 4);
  ok('a Spire makes ground on that world cheaper', R && R.allPrice < 1);
  // Mass is the one brood passive that cannot create a dead end: more brood is
  // always answerable with more force, where a stacked price penalty could put
  // a world past reach with no counterplay.
  ok('brood mounds stack but are bounded', R && R.mass1 > 0 && R.mass99 <= 0.24);
}

// THE ASYMMETRY THAT STOPS BROOD PASSIVES COMPOUNDING FOREVER: our works are
// permanent because we are taking ground, theirs are reclaimable because they
// are holding it.
{
  ok('a repelled window leaves a mound on that ground',
     /w\.nodes\.push\(\{ zone: idx, at: Date\.now\(\) \}\);/.test(reach));
  ok('and carrying there clears it',
     /w\.nodes = w\.nodes\.filter\(n => \(n\.zone \| 0\) !== idx\);/.test(reach));
  ok('clearing a wave queues the work the room will choose',
     /w\.pendingFob = \{ zone: idx, at: Date\.now\(\) \};/.test(reach));
  ok('and the vote is opened from the sweep, so a 4am clear still gets one',
     /if \(!st \|\| !st\.pendingFob \|\| \(st\.vote && !st\.vote\.resolved\)\) continue;/.test(srv));
  // The reward is not forfeit for a quiet room: the ground was taken either way.
  ok('a defaulted vote still raises a work',
     /if \(v\.kind === 'fob' && w\.pendingFob\)/.test(reach));
}

// A RAID MAY COST THE WORK AND MUST NEVER COST BANKED CONTROL. A lever pullable
// at any moment that unwinds weeks of real time is the one shape of mistake
// this layer cannot absorb.
{
  // Sliced to the NEXT export rather than to a named one. Anchoring on an
  // identifier means deleting that identifier silently changes what this
  // assertion reads: too far and it fails on unrelated code, too near and it
  // passes on a region that no longer contains the function at all.
  const _ri = reach.indexOf('export function raidFob');
  const fn = reach.slice(_ri, reach.indexOf('\nexport ', _ri + 10));
  ok('a raid destroys a work', /export function raidFob\(colonyId, type, actor\)/.test(reach));
  ok('and touches no ground at all',
     !/\.hive\s*=/.test(span('raidFob body', fn)) && !/\.cleared\s*=/.test(fn) && !/z\.live\s*=/.test(fn));
  ok('the panel can raid and can raise', /cmd:'reach_raid'/.test(panel) && /cmd:'reach_fob'/.test(panel));
}

// A PASSIVE THAT NOTHING READS IS A NUMBER IN A PAYLOAD.
{
  ok('the battlefield reads the works', /function applyWorks\(world\)/.test(rb));
  ok('and recomputes them wherever funding is recomputed',
     (rb.match(/applyWorks\(/g) || []).length >= 3);
  // A FOB RAISES THE CEILING, IT DOES NOT ADD A SHARE. Flat share would put
  // armour on an unfunded field, which says money is not what buys a tank.
  ok('a Bastion raises the armour ceiling rather than adding armour',
     /armShare    = 0\.04 \+ \(0\.07 \+ FB\.arm\)\*r;/.test(rb));
  ok('and a Pad raises the air ceiling the same way',
     /heliShare   = 0\.008 \+ \(0\.028 \+ FB\.air\)\*r;/.test(rb));
  ok('a Pad also shortens the gap between strikes',
     /strikeCd=\(24000\+Math\.random\(\)\*22000\)\*FOB_BONUS\.strike;/.test(rb));
  ok('and mounds put more brood on the field',
     /- \(typeof BROOD_MASS === 'number' \? BROOD_MASS : 0\)/.test(rb));
  // The suite lifts applyFunding out and runs it headless, where module scope
  // does not come with it, so a free reference there is a crash rather than a
  // failed assertion.
  ok('the lifted force model still runs without module scope',
     /typeof FOB_BONUS !== 'undefined'/.test(rb));
}


section('The digest, which is the most used thing on the panel and not a control');
// A GM WHO RUNS THE WHOLE GAME drops into the Reach every few days and needs
// "what changed and what is waiting on me" before a single slider is worth
// showing. This gets read a hundred times for every time garrison is touched.
{
  ok('there is a digest', /export function digestFor\(actor\)/.test(reach));
  ok('and it is per actor, against their own last visit',
     /const since = s\.seen\[key\] \|\| 0;/.test(reach));
  // Marking seen is a separate call from reading it, so opening the panel twice
  // does not blank the digest before it has been read.
  ok('marking seen is separate from reading',
     /export function markSeen\(actor\)/.test(reach)
     && !/s\.seen\[key\] = Date\.now\(\)/.test(reach.slice(reach.indexOf('export function digestFor'), reach.indexOf('export function markSeen'))));
  ok('the panel reads it and the mark moves after',
     /reachPayload\(true, null, actor\.name\)/.test(srv)
     && srv.indexOf('reachPayload(true, null, actor.name)') < srv.indexOf('reachMarkSeen(actor.name)'));
  ok('and seen survives a reload, like the donor ledger', /'donors', 'seen'[,\]]/.test(reach));

  // TWO HALVES AND THE SECOND MATTERS MORE. History is a list; a decision
  // currently waiting is the only part that costs anything to miss.
  ok('it carries both what happened and what is waiting',
     /events: events\.slice/.test(reach) && /attention: attention\(s\)/.test(reach));
  const att = reach.slice(reach.indexOf('function attention(s)'), reach.indexOf('export function digestFor'));
  ok('a vote closing is surfaced', /kind: 'vote'/.test(att));
  ok('ground held with no work chosen is surfaced', /kind: 'fob'/.test(att));
  ok('a dry fund is surfaced', /kind: 'dry'/.test(att));
  ok('and a window that will refund for want of funders',
     /kind: 'window'/.test(att) && /funders < PUSH_MIN_FUNDERS/.test(att));

  // 40 was a session's worth. A war that runs unattended for a week generates
  // more than that, so the window has to be wider than the absence it covers.
  ok('the log reaches back further than one session',
     /if \(s\.log\.length > 200\)/.test(reach));
  // Events the digest needs that nothing was recording.
  ok('a banked wave is logged', /WAVE \$\{z\.cleared\} BANKED/.test(reach));
  ok('a brood mound raised and cleared are logged',
     /brood mound raised/.test(reach) && /brood mound cleared/.test(reach));

  ok('the digest sits above every control on the tab',
     html.indexOf('id="reach-digest"') > 0
     && html.indexOf('id="reach-digest"') < html.indexOf('id="reach-worlds"'));
  // A missing container must not take the world list down with it.
  ok('and a missing container degrades rather than aborting the render',
     /if \(dg && box\) \{/.test(panel));
}


section('The bench prices the war the game is actually running');
// bt is scoped to the bench block further up, so it is read again here
// rather than reaching into another block's local.
const bt = fs.readFileSync('client/battle-test.html', 'utf8');
// THIS DRIFTED FOR TWO RELEASES AND THE CHECK WENT ON PASSING. The bench
// mirrors the server's pricing so what it shows costs what the game charges.
// The server then gained wave garrison escalation, and then a Spire discount,
// and the bench stayed on the raw garrison with no multiplier. The old
// assertion looked for the base formula terms in both files, and both files
// still contained them, so it never fired.
//
// A MIRROR CHECK HAS TO ASSERT EVERY FACTOR, not the shape of one of them.
// Each piece of the price is now named on both sides and checked on its own,
// so adding a fifth factor to the server and not the bench fails here.
{
  ok('the base curve still matches',
     /0\.6 \+ g\/125/.test(bt) && /0\.7 \+ h\/200/.test(bt)
     && /0\.6 \+ g \/ 125/.test(reach) && /0\.7 \+ h \/ 200/.test(reach));

  ok('the bench escalates the garrison per banked wave, as the server does',
     /function effGarrison\(garrison, cleared\)/.test(bt)
     && /WAVE_GARRISON_STEP/.test(bt));
  const step = (reach.match(/WAVE_GARRISON_STEP = (\d+)/) || [])[1];
  ok('and by the same number of points', step && new RegExp('WAVE_GARRISON_STEP = ' + step + ';').test(bt),
     'server ' + step);

  ok('the bench applies a Spire discount, as the server does',
     /function fobPrice\(fobs\)/.test(bt) && /SPIRE_PRICE/.test(bt));
  const spire = (reach.match(/spire:   \{ price: ([\d.]+) \}/) || [])[1];
  const spire_f = spire;
  ok('and by the same factor', spire && new RegExp('SPIRE_PRICE = ' + spire + ';').test(bt),
     'server ' + spire);

  // Both sides priced end to end, over the range, rather than by reading text.
  const B = new Function('report', bt.slice(bt.indexOf('var TARGET_BASE'), bt.indexOf('function setFund'))
    + 'report({effGarrison, fobPrice, pushTarget});');
  let F = null; B(o => { F = o; });
  const g2 = (sig, end) => { const a = reach.indexOf(sig); return reach.slice(a, reach.indexOf(end, a) + end.length); };
  const S = new Function('report',
    'const WAVE_GARRISON_STEP=' + step + ';\n'
    + 'const PUSH_TARGET_BASE=' + (reach.match(/PUSH_TARGET_BASE  = ([\d_]+);/)[1].replace(/_/g,'')) + ';\n'
    + g2('function clampPct(n)', '}\n').replace('export ', '')
    + g2('export function pushTarget', '\n}\n').replace('export ', '')
    + g2('export function effGarrison', '\n}\n').replace('export ', '')
    + 'report({pushTarget, effGarrison});');
  let R = null; S(o => { R = o; });
  let same = true, sample = '';
  for (const gar of [0, 25, 50, 75, 100]) {
    for (const hv of [5, 40, 100]) {
      for (const cl of [0, 1, 2]) {
        const srvT = Math.round(R.pushTarget(R.effGarrison({ garrison: gar }, { cleared: cl }), hv) / 100000) * 100000;
        const benT = F.pushTarget(F.effGarrison(gar, cl), hv);
        if (srvT !== benT) { same = false; sample = `g${gar} h${hv} w${cl}: server ${srvT} bench ${benT}`; }
      }
    }
  }
  ok('and the two agree at every sampled garrison, control and wave count', same, sample);

  // THE FIRST VERSION OF THIS CHECK CALLED THE BENCH'S HELPERS DIRECTLY, which
  // proves they agree with the server and proves nothing about whether the
  // bench USES them. Reverting retarget() to the exact historic bug passed it.
  // That is the same gap as the assertion this section replaced, one level in.
  // Drive the real call site instead.
  const RT = new Function('report',
    bt.slice(bt.indexOf('var TARGET_BASE'), bt.indexOf('function setFund'))
    + `
      var _w;
      function W(){ return _w; }
      report(function(world){ _w = world; retarget(); return world; });
    `);
  let run = null; RT(f => { run = f; });
  let wired = true, wsample = '';
  for (const cl of [0, 2]) {
    for (const spire of [false, true]) {
      const world = { garrison: 50, fobs: spire ? [{ type: 'spire' }] : [],
                      zones: [{ hive: 100, cleared: cl, win: { target: 0 } }] };
      run(world);
      const raw = R.pushTarget(R.effGarrison({ garrison: 50 }, { cleared: cl }), 100);
      const want = Math.round(Math.round(raw / 100000) * 100000 * (spire ? Number(spire_f) : 1) / 100000) * 100000;
      if (world.zones[0].win.target !== want) {
        wired = false;
        wsample = `wave ${cl}${spire ? ' +spire' : ''}: bench ${world.zones[0].win.target} want ${want}`;
      }
    }
  }
  ok('and the bench actually routes its own targets through them', wired, wsample);
}

// The raid check used to slice from one named export to another named export.
// Deleting the terminator made indexOf return -1 and the slice run to the end
// of the file, which failed loudly. Moving it EARLIER would have shrunk the
// slice and passed vacuously, which is the same fault silently.
ok('the raid slice is bounded structurally, not by an identifier',
   /reach\.indexOf\('\\nexport ', _ri \+ 10\)/.test(fs.readFileSync('tools/reach-check.mjs', 'utf8')));


section('Peace does not mint a war chest');
// THE TAX EXISTS TO OFFSET A BURN, and a quiet world has no burn to offset, so
// accruing on one is a war chest built by peace. The first version did accrue.
// With MAX_FRONTS at two against ten worlds, most of them sit quiet for months:
// ninety days of quiet banked about 8.6b, forty five days of contested cover,
// before a single player had done anything. Every world opened late in the
// campaign would have arrived pre-funded and the donation loop would simply not
// engage on it. 808 assertions did not notice.
{
  const fn = reach.slice(reach.indexOf('export function tickFunds'),
                         reach.indexOf('\n}\n', reach.indexOf('export function tickFunds')));
  span('tickFunds body', fn);
  ok('accrual is gated on there being something to pay for',
     /if \(burn > 0\) \{[\s\S]{0,200}w\.fund = Math\.max\(0, Math\.round/.test(fn));
  // Written as a position test rather than a negated pattern: the obvious
  // regex for "the ungated line is gone" also matches the gated one, since the
  // assignment still starts a line inside the block. Assert instead that there
  // is exactly one place the balance is written and that it sits after the gate.
  const gate = fn.indexOf('if (burn > 0) {');
  const writes = (fn.match(/w\.fund = /g) || []).length;
  ok('the balance is written in exactly one place, inside the gate',
     writes === 1 && gate >= 0 && fn.indexOf('w.fund = ') > gate,
     writes + ' write(s)');

  // Drive the rule rather than read it: a quiet world over a year.
  const tax = Number(reach.match(/FUND_TAX_PER_DAY   = ([\d_]+)/)[1].replace(/_/g, ''));
  const rule = new Function('burn', 'days', 'fund',
    'if (burn > 0) { const net = ' + tax + ' - burn; fund = Math.max(0, Math.round(fund + net*days)); } return fund;');
  ok('a quiet world banks nothing over a day', rule(0, 1, 0) === 0);
  ok('nor over a year', rule(0, 365, 0) === 0, String(rule(0, 365, 0)));
  // Donations still land on a quiet world: pre-funding one before the front
  // opens is a real thing to want to do. They are just not minted.
  ok('and a donation to a quiet world is not eroded', rule(0, 30, 500_000_000) === 500_000_000);
  ok('a contested world still drains', rule(288_000_000, 1, 500_000_000) < 500_000_000);
}

// Voters accumulated on every commit and every donation and nothing ever removed
// one, so the ledger grew for the life of the world while eligibility only ever
// read the last fortnight of it.
ok('the voter ledger is bounded by the eligibility window, not by campaign length',
   /function pruneVoters\(w\)/.test(reach)
   && (reach.match(/pruneVoters\(w\);/g) || []).length >= 2);


section('The fund and the vote are reachable by the people who pay for them');
// BOTH ROUTES WERE SERVER COMPLETE AND PLAYER INVISIBLE. /api/reach/fund and
// /api/reach/vote had no caller anywhere in the client, so the entire donation
// and decision loop existed and could not be touched from the game.
{
  ok('the fund route has a caller', /api\/reach\/fund/.test(gx));
  ok('the vote route has a caller', /api\/reach\/vote/.test(gx));
  ok('and both render into the world panel',
     /h\+=reachFundBlock\(id, R\);/.test(gx) && /h\+=reachVoteBlock\(id, R\);/.test(gx));
  // A fund and a vote belong to the WORLD, so rendering them per zone would
  // show one copy per engagement.
  ok('once per world rather than once per engagement',
     (gx.match(/reachFundBlock\(/g) || []).length === 2);

  // THE TERMS COME FROM THE SERVER. Writing them in the panel lets the copy
  // drift from the rule it describes.
  ok('the no-refund terms are taken from the payload, not written in the panel',
     /D\.terms/.test(gx) && !/never returned'/.test(gx));
  ok('the daily cap is described as spanning the whole Reach',
     /left of your daily limit, across the whole Reach/.test(gx));
  // The reason a small donor should turn up at all.
  ok('and the vote says outright that the amount does not weigh it',
     /What you gave does not weigh it/.test(gx));
  ok('a live vote shows how many answered and never which way',
     /ANSWERED/.test(gx) && !/tally/.test(gx.slice(gx.indexOf('function reachVoteBlock'), gx.indexOf('window.reachFund'))));
}

// reachPayload(false) ships no viewerId, so after any broadcast a player's own
// ballot reads null, their eligibility reads false, and their remaining daily
// allowance reads as the full cap: the vote block would tell an eligible funder
// to go fund the world they had just funded.
{
  ok('there is a viewer scoped refresh', /function reachScopeMine\(\)/.test(gx));
  // The route has existed since the Reach shipped and nothing called it.
  ok('and it uses the route built for exactly this', /api\/reach\/state/.test(gx));
  ok('debounced, and stamped before the request so re-renders cannot stack',
     /_reachScopedAt = Date\.now\(\);[\s\S]{0,120}fetch\(apiBase\(\)\+'\/api\/reach\/state'/.test(gx));
  ok('the server still scopes that route to the caller',
     /reachPayload\(false, p \? p\.id : null\)/.test(srv));
}


section('Every Reach route has something that calls it');
// THREE FINDINGS IN A ROW WERE CODE THAT EXISTED AND WAS WIRED TO NOTHING: a
// dead export, two player routes with no caller anywhere in the client, and a
// viewer scoped endpoint that had never been called by anything. The suite is
// good at proving code does what it claims and has no way to notice that
// nothing reaches it.
//
// The GM side has had this check since turret_deploy and it has caught three
// separate omissions. This is the same check pointed at HTTP.
{
  const routes = [...new Set([...srv.matchAll(/app\.post\('(\/api\/reach\/[a-z_]+)'/g)].map(m => m[1]))];
  ok('there are reach routes to check', routes.length >= 3, routes.join(', '));
  // MATCHED WITH THE CLOSING QUOTE, not as a bare substring. The first version
  // used includes(route), which a caller to any longer path with the same prefix
  // satisfies: renaming the fetch to '/api/reach/statex' left the check passing,
  // because the orphaned route's own name is a prefix of the typo. A check with
  // a vacuous pass mode is the exact thing this section exists to find.
  const clientSrc = gx + core + idx + panel;
  const orphan = routes.filter(r => !clientSrc.includes(r + "'"));
  ok('and every one of them has a caller in the client',
     orphan.length === 0, orphan.join(', '));
}


section('Jade is server state, not a console call');
// THE COMMITMENT DIAL SHIPPED AS window.reachJade AND NOTHING ELSE. Client
// local: it did not survive a refresh, no other player saw it, and the GM
// setting it on one machine changed nothing for anyone watching. Same shape as
// the routes with no caller: the seam was right and nothing was wired to it.
{
  /* THREE OF THESE ASSERTIONS WERE PINNING THE BUG. They asserted jade:0 in
     blankWorld, a 0.75 ceiling, and a payload that clamped the raw dial, and all
     three were correct descriptions of code that seeded a full Coalition line
     into a war the Coalition had not entered. A check can only pin what it was
     told to pin: this one was told the Coalition was the default force, and it
     defended that faithfully. Inverted in 1.5.2.0 along with the model.

     The gate itself is driven, not matched, in tools/reach-terrain-check.mjs. */
  ok('commitment and posture are world state', /jade: 1,          \/\/ share/.test(reach)
     && /jadeFwd: 1,/.test(reach));
  ok('bounded so neither faction carries the whole line alone',
     /export const JADE_MIN = 0\.25;/.test(reach)
     && /Math\.max\(JADE_MIN, Math\.min\(1, Number\(frac\) \|\| 0\)\)/.test(reach));
  ok('shipped in the payload, through the entry gate rather than raw',
     /jade: effJade\(s, w\)/.test(reach) && !/jade: Math\.max\(0, Math\.min\(JADE_MAX/.test(reach));
  ok('and the battlefield takes it from there rather than from a console call',
     /if \(world && world\.jade !== undefined\) \{/.test(rb));
  // The override stays: the bench has no server and poking at it live is useful.
  ok('the manual override still exists for the bench', /window\.reachJade = function/.test(rb));

  // SEPARATE NAMESPACE ON PURPOSE. When the faction war happens, the Jade panel
  // has to point at a different enemy without being untangled from Reach state.
  ok('Jade has its own command namespace', /cmd === 'jade_commit'/.test(srv)
     && /cmd:'jade_commit'/.test(panel));
  // NOT ASSERTED HERE. The obvious check is a regex over this file's own source
  // proving the handler matcher mentions jade, which is a claim about spelling
  // rather than about behaviour, and it took two attempts to write and still
  // matched nothing. The property is already covered where it matters: the
  // reachability check itself carries jade in its matcher, and it was verified
  // by failing on jade_commit before the control existed.
}


section('A council seat is a chair, a mode, and a position on the graphic');
// ADDING A SEAT TO COUNCIL_SEATS IS NOT ENOUGH TO ADD A CHAIR. The chamber is
// positioned from four-entry maps keyed by seat id, so a fifth id renders at
// seatX[undefined] and the graphic breaks with nothing thrown. That coupling
// was real and undocumented, and it is the reason the Jade chair is a layout
// job rather than a data change.
{
  const council = fs.readFileSync('server/db_council.js', 'utf8');
  const cjs = fs.readFileSync('client/assets/council.js', 'utf8');
  const seats = (council.match(/export const COUNCIL_SEATS = \[([^\]]+)\]/) || [])[1] || '';
  const ids = [...seats.matchAll(/'([a-z]+)'/g)].map(m => m[1]);
  ok('the seat list resolves', ids.length >= 4, ids.join(', '));

  // Every seat needs a declared mode. 'not in PURCHASABLE_SEATS' is a fact
  // about a different array, not a statement about the seat.
  const modes = council.slice(council.indexOf('export const SEAT_MODE'), council.indexOf('export const PURCHASABLE_SEATS'));
  span('seat modes', modes);
  const noMode = ids.filter(id => !new RegExp('\\b' + id + ':\\s*\'').test(modes));
  ok('every seat declares how it is held', noMode.length === 0, noMode.join(', '));
  ok('and the purchasable list is derived from those modes rather than kept by hand',
     /COUNCIL_SEATS\.filter\(s => SEAT_MODE\[s\] === 'purchasable'\)/.test(council));

  // THE COUPLING, RESTATED. Positions used to be a hand kept map of id to pixel
  // and this checked each id appeared in it. They are derived from the seat's
  // mode now, which removes the wrong-row and unplaced-id failures but adds a
  // new one in the same family: the rows have fixed capacity, and a seat beyond
  // it is dropped by slice() and then skipped by an undefined guard, so it
  // vanishes from the chamber without an error.
  const rows = cjs.slice(cjs.indexOf('var FRONT_X = ['), cjs.indexOf('var seatX = {}'));
  span('chamber rows', rows, 30);
  const cap = (rows.match(/FRONT_X = \[([^\]]*)\]/)[1].split(',').length)
            + (rows.match(/BACK_X = \[([^\]]*)\]/)[1].split(',').length);
  ok('the two rows have room for every seat', cap >= ids.length,
     cap + ' positions for ' + ids.length + ' seats');
  ok('and the row a seat lands in is decided by its mode, not by a map',
     /v\.mode === 'never' \|\| v\.mode === 'gm' \? back : front/.test(cjs));
  ok('which means the server has to ship one', (srv.match(/mode: SEAT_MODE/g) || []).length >= 4);
  const short = cjs.slice(cjs.indexOf('var SHORT = {'), cjs.indexOf('var SHORT = {') + 300);
  span('short names', short, 60);
  const unnamed = ids.filter(id => !short.includes(id + ':'));
  ok('and a short name that fits the plate', unnamed.length === 0, unnamed.join(', '));

  // SEAT_COLOR is the last per seat map that must cover every id. A miss makes
  // stroke="undefined", which is an invisible chair rather than an error.
  const cols = cjs.slice(cjs.indexOf('var SEAT_COLOR = {'), cjs.indexOf('var SEAT_ORDER'));
  span('seat colours', cols, 60);
  const uncoloured = ids.filter(id => !new RegExp('\\b' + id + ':').test(cols));
  ok('every seat has a colour, or its chair strokes as undefined',
     uncoloured.length === 0, uncoloured.join(', '));
}


section('The Jade voice, and votes that land somewhere');
// THE CHAMBER VOICE NEEDED NO CODE. gmRegents is COUNCIL_SEATS filtered by
// whether the chair sits in regency, and the Jade seat view returns regent true
// unconditionally, so adding the seat put Circuit Envoy Sarn in the GM's voice
// picker on its own. That path was DERIVED where the position map was hardcoded,
// which is exactly why one survived the change and the other broke.
{
  ok('the GM voice list is derived from regency rather than listed',
     /COUNCIL_SEATS\.filter\(sd => seatView\(sd\)\.regent\)/.test(srv));
  ok('and the Jade chair is always in regency, so the voice comes free',
     /if \(seatId === 'jade'\)[\s\S]{0,400}regent: true/.test(srv));
  ok('the envoy has a name and a face', /regent: 'Circuit Envoy Sarn'/.test(srv));

  // The other surface. The hive lord has spoken into the war feed since the
  // beginning; Jade had no way to say anything at all.
  ok('Jade can speak into the war feed too', /cmd === 'jade_say'/.test(srv));
  ok('and it is reachable', /cmd:'jade_say'/.test(panel) && /jadeSay\(\)/.test(panel));
  ok('the transmission is tagged so the client can tell the two apart',
     /voice:'jade'/.test(srv));
  // A TAG NOTHING READS IS NOT A TAG. The handler hardcoded the hive lord's
  // name and colour, so the envoy's first transmission would have arrived
  // labelled as the enemy, in the brood's colour, saying the opposite of what
  // it meant. Shipping the field and reading it are two different patches and
  // this is the second one.
  ok('and the client actually reads the tag',
     /msg\.data\.voice === 'jade'/.test(core));
  ok('an untagged transmission is still the hive lord, as every old one is',
     /JADE CIRCUIT ENVOY[\s\S]{0,120}KHAI'SULTULL/.test(core));
}

// A VOTE THAT CHANGES NOTHING IS A POLL. All three kinds land somewhere now.
{
  const rv = reach.slice(reach.indexOf('export function resolveVote'), reach.indexOf('export function cancelVote'));
  span('resolveVote body', rv);
  ok('a Jade request moves who holds the forward band',
     /w\.jadeFwd = win === 'support' \? 0 : 1;/.test(rv));
  // fundBurnPerDay returns zero on a world with no front, so closing it stops
  // the burn, the drain and the slip in one move.
  ok('an accepted demand closes the front, which is what stops the burn',
     /if \(v\.kind === 'demand' && win === 'accept'\)/.test(rv) && /w\.front = 0;/.test(rv));
  ok('and it is logged, since a front closing is the kind of thing a GM must not miss',
     /FRONT CLOSED by accepted demand/.test(rv));

  // THE INVARIANT THE WHOLE LAYER RESTS ON. A ceasefire stops a war; it does
  // not hand back the ground the war already took.
  // WRITTEN WITHOUT A RECEIVER NAME. The first version tested z.hive and
  // w.hive, which only catches a write through a variable spelled exactly that
  // way: a mutation using z0.hive passed it, and so would `const zone = ...;
  // zone.hive = 100`. The property is that control is not written here, by
  // anything, under any name.
  ok('no vote outcome touches banked control',
     !/\.cleared\s*=[^=]/.test(rv) && !/\.hive\s*=[^=]/.test(rv));
}


section('Works stand on the ground, and a wave takes time to form');

// ── 1. THE WORKS ARE DRAWN ────────────────────────────────────────
// Four works have priced pushes, scaled repels and raised ceilings since the
// FOB vote shipped, and the only place any of it was visible was a line of
// text in the GM panel. The payload carried fobs and nodes per world and the
// battlefield read neither. Same shape as the voice tag: shipped, unread.
{
  ok('the payload carries each work with its own identity',
     /fobs: \(w\.fobs \|\| \[\]\)\.map\(f => \(\{ type: f\.type, zone: f\.zone \| 0, at: f\.at \| 0 \}\)\)/.test(reach));
  ok('and each mound with the moment it was raised',
     /nodes: \(w\.nodes \|\| \[\]\)\.map\(n => \(\{ zone: n\.zone \| 0, at: n\.at \| 0 \}\)\)/.test(reach));

  // THE END THAT WAS MISSING EVERY OTHER TIME. Not that the field is sent:
  // that something consumes it.
  ok('the battlefield builds structures from that payload', /function genWorks\(world, zoneIdx\)/.test(rb));
  // ASSERTED AGAINST COMMENT-STRIPPED SOURCE. The first version of this matched
  // the raw file, so commenting the call out passed: the negative control found
  // it, review did not.
  ok('and applyWorks drives it, so a work raised mid engagement appears',
     /genWorks\(world, RB\.zone\);/.test(rbLive()));
  ok('all four types have their own geometry branch',
     /if\(k\.type==='pad'\)/.test(rb) && /if\(k\.type==='cut'\)/.test(rb)
     && /if\(k\.type==='spire'\)/.test(rb) && /function gWork\(p,k\)/.test(rb));
  ok('a spawning mound is its own object, not the brood camp',
     /function gMound\(p,m\)/.test(rb) && /function gCamp\(p,c,own\)/.test(rb));
  /* THIS PINNED THE WIREFRAME SCENERY AND THE SCENERY IS GONE. Camps, works,
     hive settlements and mound domes were line drawings on a field where
     everything else is art, which reads as a placeholder rather than as a style.
     Nothing draws them now.

     WHAT REPLACES THE ASSERTION IS THE THING THAT ACTUALLY MATTERS: the DATA is
     untouched. works[], mounds[], camps[] and hiveCities[] are still generated
     and still read by the AI, so removing a drawing did not quietly remove a
     system. If that stops being true, this fires. */
  ok('their data is still generated even though nothing draws it',
     /works\.push\(/.test(rb) && /mounds\.push\(/.test(rb)
     && /camps\.push\(/.test(rb) && /hiveCities\.push\(/.test(rb));
  ok('and the AI still reads it', /MELEE_CLS\[u\.cls\] && hiveCities\.length/.test(rb));
  ok('the geometry is kept rather than deleted with the call sites',
     /function gWork\(p,k\)/.test(rb) && /function gCamp\(p,c,own\)/.test(rb)
     && /function gHiveCity\(p,c\)/.test(rb));
  // The mound's only visible part is its clutch, which is art.
  ok('a mound still shows as its eggs', /function queueEggs\(\)/.test(rbLive()));
  // Control was the camps' job. It has to land somewhere or a system was cut.
  ok('and zone control is shown on the ground instead',
     /function paintControl\(\)/.test(rb) && /paintControl\(\);/.test(rbLive()));

  // NOT COVER, DELIBERATELY. A hive city seeds firing positions because it has
  // no server side effect and cover is the only way it can mean anything. A
  // work already means something the server computes, and giving it cover too
  // prices one structure twice in two systems that would never agree.
  const gw = rb.slice(rb.indexOf('function genWorks('), rb.indexOf('function genHiveCities('));
  span('genWorks body', gw);
  ok('works seed no firing positions and no terrain',
     !/slots\.push/.test(gw) && !/terrain\.push/.test(gw));
}

// ── 2. GEOMETRY, DRIVEN RATHER THAN READ ─────────────────────────────
// A regex proving a branch exists cannot see that the branch emits nothing, or
// emits NaN, which is the failure mode that draws an empty path and throws
// nothing. The functions are lifted and run.
{
  function lift(name){
    const i = rb.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let d = 0;
    for (let k = rb.indexOf('{', i); k < rb.length; k++) {
      if (rb[k] === '{') d++;
      else if (rb[k] === '}') { d--; if (!d) return rb.slice(i, k + 1); }
    }
    return null;
  }
  const parts = ['mulberry32','hashStr','genWorks','gWork','gMound'].map(lift);
  ok('every geometry function lifts cleanly', parts.every(Boolean));
  let G = null;
  if (parts.every(Boolean)) {
    try {
      G = new Function(`
        const FIELD_W=420, FIELD_D=320;
        function wx(x){ return (x-0.5)*FIELD_W; }
        function wz(y){ return (1-y)*FIELD_D; }
        function seg(p,ax,ay,az,bx,by,bz){ p.push([ax,ay,az,bx,by,bz]); }
        var CL={seed:123456789}; var works=[], mounds=[];
        ${parts.join('\n')}
        return { genWorks, gWork, gMound, W:()=>works, M:()=>mounds };
      `)();
    } catch (e) { /* reported by the next assertion */ }
  }
  ok('and evaluates', !!G);

  // A THROW IN LIFTED CODE MUST NOT TAKE THE SUITE WITH IT. Driving real
  // functions is the point of this section, and real functions can reference
  // something the harness does not provide: a negative control that made
  // genWorks touch `slots` killed the whole run before the summary printed, so
  // every assertion after this section reported nothing at all. A checker that
  // stops is worse than one that fails, because a failure is visible.
  let threw = null;
  if (G) try {
    const world = {
      fobs: [{type:'bastion',zone:0,at:1},{type:'pad',zone:0,at:2},
             {type:'cut',zone:0,at:3},{type:'spire',zone:0,at:4},
             {type:'bastion',zone:1,at:5}],
      nodes:[{zone:0,at:1111},{zone:0,at:2222},{zone:2,at:3333}],
    };
    G.genWorks(world, 0);
    ok('a work on another zone does not stand on this one', G.W().length === 4, G.W().length + ' of 5');
    ok('nor does a mound', G.M().length === 2, G.M().length + ' of 3');

    // POSITION IS SEEDED FROM IDENTITY. Index seeding means raising a work
    // slides every standing one sideways, mid engagement, for no reason a
    // viewer could account for.
    const before = G.W().map(w => [w.type, w.x, w.y]);
    const stillThere = (list) => {
      G.genWorks({ fobs: list, nodes: world.nodes }, 0);
      return before.filter(([t, x, y]) => {
        const now = G.W().find(w => w.type === t);
        if (!now) return false;                 // gone is not moved
        return Math.abs(now.x - x) > 1e-12 || Math.abs(now.y - y) > 1e-12;
      });
    };
    const onAdd = stillThere(world.fobs.concat([{ type: 'spire', zone: 0, at: 9 }]));
    ok('standing works do not move when another goes up', onAdd.length === 0,
       onAdd.map(m => m[0]).join(',') || 'none moved');
    // REMOVAL IS THE HARDER HALF and the reason the first negative control for
    // this passed. Seeding from an index survives an APPEND, because appending
    // does not renumber anything already in the array. A raid splices from the
    // middle, every later work renumbers, and the field rearranges itself for a
    // reason no viewer can account for.
    // THERE IS NO EQUIVALENT ASSERTION FOR MOUNDS, and writing one would be
    // writing a test that cannot fail. Mounds are only ever appended one at a
    // time or removed for a whole zone at once by the filter in resolveWindow,
    // so no removal can renumber a survivor and index seeding would be stable
    // here. They carry `at` anyway because it costs nothing and settles the
    // question, but the property does not exist to be asserted.
    const onRaid = stillThere(world.fobs.filter(f => f.type !== 'pad'));
    ok('nor when one in the middle is raided out from under them', onRaid.length === 0,
       onRaid.map(m => m[0]).join(',') || 'none moved');
    G.genWorks(world, 0);

    G.genWorks(world, 0);
    const seg = {};
    let bad = null, off = null;
    for (const k of G.W()) {
      const path = []; G.gWork(path, k);
      seg[k.type] = path.length;
      for (const sgm of path) for (const v of sgm) if (!Number.isFinite(v)) bad = k.type;
      for (const sgm of path) if (Math.abs(sgm[0]) > 250 || Math.abs(sgm[3]) > 250) off = k.type;
    }
    ok('every work emits segments', Object.values(seg).every(n => n > 8), JSON.stringify(seg));
    ok('no work emits a non finite coordinate', !bad, bad || 'all finite');
    ok('and none of them is drawn off the field', !off, off || 'all on field');
    // Four structures that emit the same shape are one structure four times.
    ok('the four silhouettes are actually different',
       new Set(Object.values(seg)).size === 4, JSON.stringify(seg));

    let mbad = null, tall = 0;
    for (const m of G.M()) {
      const path = []; G.gMound(path, m);
      if (!path.length) mbad = 'empty';
      for (const sgm of path) for (const v of sgm) if (!Number.isFinite(v)) mbad = 'NaN';
      for (const sgm of path) tall = Math.max(tall, sgm[1], sgm[4]);
    }
    ok('a mound emits finite geometry', !mbad, mbad || 'clean');
    // A node is a source, not a marker: it has to read taller than the low
    // spined camp mound gCamp draws for ordinary held ground.
    ok('and stands taller than a held-ground camp', tall > 5, tall.toFixed(1) + ' units');
  } catch (e) { threw = e.message; }
  ok('driving the geometry raises nothing', !threw, threw || 'clean');
}

// ── 3. THE WAVE GATE ─────────────────────────────────────────
// The only thing in this layer that spends the clock rather than credits.
// Nothing gated on time before it, so a zone could be opened, carried, banked
// and opened again inside one sitting.
{
  ok('a wave takes time to form', /export const WAVE_FORM_MS = 20 \* 3600 \* 1000;/.test(reach));
  ok('and how long is derived from waveAt rather than stored twice',
     /export function waveFormsIn\(z\) \{/.test(reach)
     && /return Math\.max\(0, WAVE_FORM_MS - \(Date\.now\(\) - z\.waveAt\)\);/.test(reach));
  ok('openWindow refuses an unformed wave',
     /const wait = waveFormsIn\(z\);/.test(reach) && /if \(wait > 0 && !force\)/.test(reach));

  // A REPEL IS NOT GATED. openWindow used to stamp waveAt, which under this
  // gate would lock a zone out after a loss: the room already paid the pool
  // and already lost the ground, and charging them a day for it as well is
  // charging twice for one failure.
  const ow = reach.slice(reach.indexOf('export function openWindow'), reach.indexOf('export function cancelWindow'));
  span('openWindow body', ow);
  ok('and openWindow does not stamp waveAt, so a repel can be fought again at once',
     !/z\.waveAt = Date\.now\(\)/.test(ow));
  ok('waveAt moves when a wave comes up and not otherwise',
     /z\.hive = 100;\s*\n\s*z\.waveAt = Date\.now\(\);/.test(reach));
  ok('a zone with no recorded wave is ready rather than waiting forever',
     /if \(!z \|\| !z\.waveAt\) return 0;/.test(reach));

  // BE HONEST ABOUT WHAT THIS IS. The GM is the only actor who can open a
  // window, so a gate he can wave through is a default and not a rule. The
  // value is that running past it is a separate act that lands in the log.
  ok('the GM can run past it', /export function openWindow\(colonyId, idx, minutes, actor, force\)/.test(reach));
  ok('and forcing is recorded as forcing',
     /\[FORCED, wave unformed\]/.test(reach));
  ok('the force flag reaches the server', /!!msg\.force/.test(srv));
  ok('and the panel offers it rather than hiding the button',
     /reachWindow\(id, zi, 20, 1\)/.test(panel));

  // waveAt HAS TWO READERS NOW, WHICH IS THE POINT. It shipped in 1.4.9.x
  // annotated 'for duration on the strip' and no strip ever read it. Both ends
  // are asserted, in both panels.
  ok('the window length ships so a panel can count down from waveAt',
     /waveFormMs: WAVE_FORM_MS,/.test(reach));
  ok('the GM panel counts down from waveAt rather than a stale remainder',
     /z\.waveAt \+ _fms - Date\.now\(\)/.test(panel));
  ok('and the player panel does the same', /z\.waveAt \+ fms - Date\.now\(\)/.test(gx));
  // Both ends, plainly. The clever version of this stripped the definition out
  // of the source with replace() and then matched the call, which is a trick
  // where the call site is a literal you can just assert.
  ok('the player panel shows banked waves, which is the only number that never goes back',
     /function reachWaveLine\(R, z\)\{/.test(gx) && /h\+=reachWaveLine\(R, z\);/.test(gx));
}

// ── 4. THE GATE, TRACED ──────────────────────────────────────
{
  const body = reach.slice(reach.indexOf('export function waveFormsIn'), reach.indexOf('export function zoneDone'));
  span('waveFormsIn body', body);
  let F = null;
  try {
    F = new Function('WAVE_FORM_MS', body.replace('export function', 'function') + '\nreturn waveFormsIn;')(20 * 3600 * 1000);
  } catch (e) { /* next assertion */ }
  ok('waveFormsIn evaluates', typeof F === 'function');
  if (typeof F === 'function') {
    const H = 3600000;
    ok('a wave that just came up is 20h out', Math.round(F({ waveAt: Date.now() }) / H) === 20);
    ok('one that came up 19h ago is still forming', F({ waveAt: Date.now() - 19 * H }) > 0);
    ok('one that came up 21h ago is ready', F({ waveAt: Date.now() - 21 * H }) === 0);
    ok('a zone that never recorded one is ready', F({ waveAt: 0 }) === 0);
    ok('and so is a zone with no wave field at all', F({}) === 0);
  }
}

// ── 5. EACH WORK COUNTS ONCE, SO EACH WORK IS RAISED ONCE ──────────────
// fobBonus counts a TYPE once, and both callers pushed into w.fobs directly, so
// a second bastion was worth nothing while raidFob spliced one instance and
// reported the work destroyed with every effect still standing. The no-op was
// survivable; the message asserting something false was not.
{
  ok('there is one place a work is raised', /function placeFob\(w, type, zone\)/.test(reach));
  ok('and it refuses a type that already stands',
     /if \(w\.fobs\.some\(f => f\.type === t\)\) return null;/.test(reach));
  const av = reach.slice(reach.indexOf('export function addFob'), reach.indexOf('// A RAID MAY COST'));
  span('addFob body', av);
  ok('the GM path goes through it', /const t = placeFob\(w, type, zone\);/.test(av) && !/w\.fobs\.push/.test(av));
  const rvf = reach.slice(reach.indexOf("if (v.kind === 'fob' && w.pendingFob)"), reach.indexOf('const label = (v.options'));
  span('vote fob arm', rvf);
  ok('and so does the vote path', /placeFob\(w, win, w\.pendingFob\.zone \| 0\);/.test(rvf) && !/w\.fobs\.push/.test(rvf));

  // A BALLOT SHOULD NOT OFFER SOMETHING THAT BUYS THE ROOM NOTHING. The sweep
  // had the four options written out by hand and offered a bastion on a world
  // that already had one.
  ok('the ballot offers only what is not already standing', /export function fobOpen\(w\)/.test(reach)
     && /const open = fobOpen\(w\);/.test(reach));
  ok('and the default is one of them', /kind: 'fob', hours: VOTE_DEFAULT_HOURS, defaultId: open\[0\],/.test(reach));
  ok('with every work standing, no ballot is put and the flag is cleared',
     /if \(!open\.length\) \{[\s\S]{0,200}w\.pendingFob = null;/.test(reach));
  ok('the sweep asks reach.js rather than listing the options itself',
     /const P = reachFobVoteParams\(world\);/.test(srv)
     && !/label:'Bastion, walled compound/.test(srv)
     && !/label:'Pad, landing strip/.test(srv));
  ok('and the ballot text lives beside the effect it describes',
     /export const FOB_LABEL = \{/.test(reach));
}

// ── 5b. THE DEDUPE, TRACED ────────────────────────────────────
// The old bug was not the duplicate. It was that raidFob spliced ONE instance
// and returned 'destroyed. Ground unchanged.' while fobKinds still saw the type
// and every effect stayed live. A no-op that reports success is worse than a
// no-op, so this drives the real functions rather than matching their text.
{
  const lift = (name, kw) => {
    const i = reach.indexOf(kw + ' ' + name + '(');
    if (i < 0) return null;
    let d = 0;
    for (let k = reach.indexOf('{', i); k < reach.length; k++) {
      if (reach[k] === '{') d++;
      else if (reach[k] === '}') { d--; if (!d) return reach.slice(i, k + 1); }
    }
    return null;
  };
  const src = [lift('fobKinds', 'export function'), lift('fobOpen', 'export function'),
               lift('placeFob', 'function')];
  ok('the fob functions lift', src.every(Boolean));
  let D = null;
  if (src.every(Boolean)) {
    try {
      D = new Function('FOB_TYPES', 'FOB_DEFAULT', 'FOB_EFFECT', `
        ${src.join('\n').replace(/export function/g, 'function')}
        return { fobKinds, fobOpen, placeFob };
      `)(['bastion','pad','cut','spire'], 'bastion',
         { bastion:{arm:0.015}, pad:{air:0.02,strike:0.65}, cut:{repel:0.55}, spire:{price:0.88} });
    } catch (e) { /* next */ }
  }
  ok('and evaluate', !!D);
  if (D) {
    const w = { fobs: [] };
    ok('a first bastion goes up', D.placeFob(w, 'bastion', 0) === 'bastion');
    ok('a second one does not', D.placeFob(w, 'bastion', 1) === null);
    ok('and the array holds exactly one', w.fobs.length === 1, w.fobs.length + ' entries');
    // The raid can now only be a lie if the array can hold two, which it cannot.
    ok('so raiding it leaves nothing of that type standing',
       (function(){ w.fobs.splice(w.fobs.findIndex(f => f.type === 'bastion'), 1);
                    return D.fobKinds(w).length === 0; })());
    const w2 = { fobs: [{type:'pad'},{type:'spire'}] };
    ok('the ballot offers only the two that are left',
       D.fobOpen(w2).join(',') === 'bastion,cut', D.fobOpen(w2).join(','));
    ok('and offers nothing at all when every work stands',
       D.fobOpen({ fobs: [{type:'bastion'},{type:'pad'},{type:'cut'},{type:'spire'}] }).length === 0);
    // An unknown type must not become a fifth work through the back door.
    const w3 = { fobs: [] };
    D.placeFob(w3, 'redoubt', 0);
    ok('an unknown type falls back to the default rather than inventing a work',
       w3.fobs.length === 1 && w3.fobs[0].type === 'bastion', JSON.stringify(w3.fobs));
  }
}

// ── 6. THE BENCH CARRIES THE NEW SHAPE ────────────────────────────
// The bench drifted for two releases once because a field was added on one side
// only. It is the only place to look at a work without winning a wave first.
{
  ok('the bench can raise each work', /function work\(type\)/.test(bt)
     && /onclick="work\('spire'\)"/.test(bt));
  ok('and raise a mound', /function mound\(d\)/.test(bt));
  ok('it writes the shape the server ships', /w\.fobs\.push\(\{ type:type, zone:0, at:Date\.now\(\) \}\)/.test(bt));
  // Rebuilding the field to move one structure restarts every unit on it.
  ok('and it does not reseed the field to redraw a structure',
     /var el = \$\('workList'\);/.test(bt)
     && !/afterWorks[\s\S]{0,600}reopen\(\);/.test(bt));
}

// ═══ The Reach hijacks the banner instead of scrolling past in the wire ═══
/* THE PRAWN WAR WAS COMPETING WITH MARKET NEWS AS IF IT WERE MARKET NEWS. The
   feed is a wire - rotations, fills, cargo, blockades, dozens of lines an hour -
   and a headline's whole life is the seconds before the next one pushes it up.
   A Khai'sultull transmission scrolled past at the same weight as a fund buying
   two hundred shares.

   None of the eight call sites changed: they already carried cat:'reach', which
   is the only reason this is a seam and not a rewrite. */
section('The Reach takes the banner, not the wire');
{
  const sv = fs.readFileSync('server/server.js', 'utf8');
  ok('a reach headline routes to the banner and never broadcasts as news',
     /if\(item\.cat==='reach'\)\{[\s\S]{0,400}?type:'breaking_news'[\s\S]{0,200}?return;/.test(sv));
  ok('and the eight reach sites still tag the category that routes them',
     (sv.match(/'reach', null\)/g) || []).length >= 7);

  /* TWO LAYERS. A GM's banner is a deliberate act with no timer on it, and a war
     that silently ate it would make the panel unreliable in the exact moment a
     GM is leaning on it. */
  ok('the reach line is transient and the GM banner is not',
     /const REACH_BREAK_MS = \d+;/.test(sv) && /reachBreaking = \{ text, tone/.test(sv));
  ok('the GM banner survives underneath and comes back',
     /if \(breakingNews\) return \{ active:true, text:breakingNews\.text/.test(sv));
  ok('precedence lives in one function, so nothing can disagree about it',
     /function breakingPayload\(\)/.test(sv)
     && (sv.match(/data: ?breakingPayload\(\)/g) || []).length >= 4);
  /* Pushed, not polled: nobody asks for the banner, so nothing would notice the
     expiry until the next unrelated broadcast. */
  ok('the stand-down is scheduled rather than computed at read time',
     /function scheduleReachStandDown\(\)/.test(sv) && /clearTimeout\(_reachBreakT\)/.test(sv));
  ok('and a newer reach line supersedes the pending stand-down',
     /if \(reachBreakActive\(\)\) return;\s*\/\/ superseded/.test(sv));

  /* THE ARRAY IS THE ARCHIVE AND THE FEED IS NOT. Filing it keeps /state and the
     snapshot complete; filtering the wire stops a player who joins an hour later
     getting a war headline pushed into a market scroll, which would be the same
     bug deferred to reconnect. */
  /* Filed BEFORE the routing branch, not inside the non-reach arm, which is the
     difference between "kept for the archive" and "kept for market news only".
     Asserted by ordering rather than by matching the comment above it: the first
     cut anchored on a `/*` that moved. */
  ok('a reach line is still filed for the archive',
     sv.indexOf('headlines.push(item); if(headlines.length>200)headlines.shift();')
     < sv.indexOf("if(item.cat==='reach'){"));
  ok('but never handed out in a feed', /function wireHeadlines\(n\)/.test(sv)
     && /headlines\[i\]\.cat !== 'reach'/.test(sv));
  ok('both feed handouts go through the filter',
     (sv.match(/wireHeadlines\(30\)/g) || []).length === 2
     && !/headlines\.slice\(-30\)/.test(sv));
  /* Sliced after the filter or a burst of Reach traffic empties the thirty a new
     client gets. */
  ok('and it fills to n after filtering rather than before',
     /out\.length < n/.test(sv));

  ok('the client labels a reach line as the Reach, not as BREAKING',
     /b\.src === 'reach'/.test(core) && /THE REACH/.test(core));
  ok('and falls through to the old label on a server that does not send src',
     /\} else \{\s*\n\s*elh\.innerHTML = `<span data-i18n="news\.breaking"/.test(core));
}

// ═══ A fresh Reach is quiet until the GM starts the war ═══
/* This opened the gate world at seed, on the reasoning that a map with no war on
   it reads as a war that has not started. The causality was backwards: that
   reading is CORRECT when the war has not started, and what was wrong was a
   server coming up for the first time already fighting somebody. */
section('A fresh Reach is quiet');
{
  const rj = fs.readFileSync('server/reach.js', 'utf8');
  ok('seeding no longer opens a front', !/worlds\[REACH_WORLDS\[0\]\]\.front = 1;/.test(rj));
  ok('and no longer marks a world contested at seed',
     !/worlds\[REACH_WORLDS\[0\]\]\.status = 'contested';/.test(rj));
  ok('every world still starts quiet in blankWorld',
     /front: 0,/.test(rj) && /status: 'quiet',/.test(rj));
  /* The gate has to remain openable with no force, or the war cannot be started
     from the panel at all - frontAllowed returns true for index 0. */
  ok('the gate is still always allowed, so the panel can start the war',
     /if \(i <= 0\) return true;/.test(rj));
  ok('and the GM command to open one already exists', /export function setFront/.test(rj)
     && /cmd === 'reach_front'/.test(fs.readFileSync('server/server.js', 'utf8')));
  /* Only a fresh seed. Rewriting live war state to enforce a new default is a
     migration, and this is not one. */
  ok('the change is scoped to a fresh seed, not to existing saves',
     /THIS ONLY AFFECTS A FRESH SEED/.test(rj));
}

// ═══ Sealed means sealed, and quiet means quiet ═══
/* THREE HOLES, ALL OF THEM "THE FLAG EXISTS AND NOTHING CONSULTS IT".

   The seal drew a banner, hid the lane and hid the portal sprite, and swapGalaxy
   - the function that actually moves the player - never asked. So the map said
   PASSAGE SEALED with the player standing on it.

   blankZones seeded `live: i === 0 ? 1 : 0`, so the first zone of every world
   came up live at seed. Even after the gate world stopped opening its own front,
   ten worlds each had a running engagement underneath: `live` was never a
   consequence of the war having started, it was a property the ground was born
   with. A player could watch Jade fighting the brood on a war nobody declared.

   And the engagement row set its CURSOR from z.live and then bound the click
   handler unconditionally, so a row labelled QUIET opened a battle anyway. */
section('Sealed means sealed, quiet means quiet');
{
  const gx = fs.readFileSync('client/assets/galaxy.js', 'utf8');
  const rj = fs.readFileSync('server/reach.js', 'utf8');
  const rb = fs.readFileSync('client/assets/reach-battle.js', 'utf8');

  ok('swapGalaxy refuses a sealed galaxy',
     /if\(to!=='coalition' && !passageOpen\(to\)\) return false;/.test(gx));
  /* Home is always reachable: a player who cannot get anywhere is worse than
     one who got somewhere he should not have. */
  ok('and the Coalition is always reachable', /to!=='coalition' &&/.test(gx));
  /* Sealing while somebody is inside would otherwise strand them with no lane
     and no portal to leave by, which is worse than the bug being fixed. */
  ok('sealing a passage ejects anyone standing in it',
     /if\(!open && activeGalaxy!=='coalition' && !passageOpen\(activeGalaxy\)\)/.test(gx)
     && /swapGalaxy\('coalition'\)/.test(gx));

  ok('no zone is born live', /\n      live: 0,/.test(rj)
     && !/live: i === 0 \? 1 : 0/.test(rj));
  ok('opening a front is what lights ground',
     /const z0 = \(w\.zones \|\| \[\]\)\.find\(z => !zoneDone\(w, z\)\);/.test(rj));
  ok('and closing one quiets it', /for \(const z of w\.zones \|\| \[\]\) z\.live = 0;/.test(rj));
  /* cleared is the banked progress and neither touches it, so a front closed
     and reopened resumes rather than restarting the world. */
  ok('closing a front does not discard banked progress',
     !/z\.cleared = 0/.test(rj.slice(rj.indexOf('export function setFront'),
                                     rj.indexOf('export const ARM_WINDOW_MS'))));
  /* The same hole arriving through a different command. */
  ok('raising the wave count cannot light ground under no front',
     /for \(const z of w\.zones \|\| \[\]\) \{\s*\n\s*if \(!w\.front\) break;/.test(rj));

  ok('the engagement row only binds a handler when the ground is live',
     /ch \+= '<div '\+\(z\.live\?'onclick="window\.reachWatch/.test(gx));
  ok('the other watch entry already gated on live, and still does',
     /\?\s*'<span onclick="window\.reachWatch&&window\.reachWatch/.test(gx));
  ok('and reachWatch refuses a world with no front', /if \(!R\.front\) return;/.test(rb));

  /* DRIVEN. blankState is lifted and run: a fresh Reach must be silent on every
     count at once, which is the property, rather than three separate literals
     that each look right. */
  const env = {};
  const lift = n => { const i = rj.indexOf('function ' + n + '('); let d = 0, j = rj.indexOf('{', i);
    for (let k = j; k < rj.length; k++){ if (rj[k] === '{') d++; else if (rj[k] === '}' && --d === 0) return rj.slice(i, k + 1); } };
  new Function('E', 'var REACH_WORLDS=["ks_gate_reach","ks_02","ks_03"];'
    + 'function zoneCount(){return 2;} function zoneName(c,i){return c+"_z"+i;}'
    + 'var WAVES_DEFAULT=3;'
    + lift('blankZones') + lift('blankWorld') + lift('blankState') + 'E.st=blankState;')(env);
  const st = env.st();
  const ws = Object.values(st.worlds);
  ok('a fresh Reach opens no front at all', ws.every(w => !w.front),
     ws.filter(w => w.front).length + ' open');
  ok('a fresh Reach has no live ground anywhere',
     ws.every(w => (w.zones || []).every(z => !z.live)),
     ws.reduce((a, w) => a + (w.zones || []).filter(z => z.live).length, 0) + ' live');
  ok('and every world reads quiet', ws.every(w => w.status === 'quiet'),
     [...new Set(ws.map(w => w.status))].join(','));
  ok('the Coalition has not declared either', !st.coalIn);

  /* The seal itself defaults sealed on a server with no saved key. */
  const sv = fs.readFileSync('server/server.js', 'utf8');
  ok('the passage defaults sealed', /let REACH_OPEN = false;/.test(sv));
  ok('and only a stored key can open it',
     /if \(savedR === '0' \|\| savedR === '1'\) REACH_OPEN = \(savedR === '1'\);/.test(sv));
}

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
