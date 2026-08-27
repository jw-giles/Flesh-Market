// ═══════════════════════════════════════════════════════════════════════════
// controls-check.mjs
//
// EVERY CONTROL IN THE REACH AND WAR PANELS, TRACED END TO END.
//
// The god panel's own comment names the failure this file exists for: "a switch
// wired to nothing rots untested. That is exactly how the trial gate sat broken
// across 120 routes for four patches while static checks passed." Both panels
// have since grown past thirty controls, they are dev-gated so nobody stumbles
// over a broken one, and they are the instruments a live session is run from.
// A dead button here is not found until it is needed.
//
// So this walks the whole chain for each control, and a break at ANY link is a
// failure:
//
//   1. the panel has a handler that sends a named command
//   2. server.js has a branch for that exact command string
//   3. that branch calls the reach.js export that does the work
//   4. reach.js actually exports it
//   5. the branch broadcasts, where a change other clients must see
//
// WHAT THIS CANNOT DO is click the button. It is a wiring check, not a
// behavioural one: it proves the wire is continuous, not that the current at the
// far end is the right shape. The behaviour of the model underneath is driven in
// reach-check.mjs, which lifts and runs the functions this file only proves are
// reachable. Both are needed and neither is the other.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const panel  = read('client/assets/god-panel.js');
const server = read('server/server.js');
const reach  = read('server/reach.js');
const idx    = read('client/index.html');

let pass = 0;
const fails = [];
const ok = (label, cond, detail) => {
  if (cond) { pass++; return; }
  fails.push(label + (detail ? '  [' + detail + ']' : ''));
};
function section(t) { console.log('\n' + t); }

/* Comments stripped before any "is this called" test. Four separate assertions
   in this codebase have already gone red because they matched the prose
   EXPLAINING a call rather than the call, and the pressure when that happens is
   to delete the explanation. */
const strip = t => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const panelC  = strip(panel);
const serverC = strip(server);
const reachC  = strip(reach);

/* ── The table ─────────────────────────────────────────────────────────────
   Every row is one control a GM can press. `fn` is the window function the
   button calls, `cmd` is what it puts on the wire, `impl` is the reach.js export
   that must end up doing the work, and `bcast` is whether the result has to
   reach other clients rather than only the person who pressed it.

   THE LIST IS AUTHORED, NOT DERIVED. Deriving it from the panel would make the
   check agree with whatever the panel currently does, including doing nothing:
   a control that was deleted would quietly leave the list and the file would
   still pass. This is a statement of what the panel is SUPPOSED to have. */
const CONTROLS = [
  // ── The Reach: the ground itself ────────────────────────────────────────
  /* setControl, not setHive. The first cut of this table guessed the export
     name off the command name and went red on correct code, which is the worst
     failure mode a check has: the pressure is to rename the function to suit
     the test. Every impl below is now the name reach.js actually exports. */
  { label: 'hive control slider',   fn: 'reachControl',  cmd: 'reach_control',  impl: 'setControl',   bcast: 1 },
  { label: 'garrison slider',       fn: 'reachGarrison', cmd: 'reach_garrison', impl: 'setGarrison',  bcast: 1 },
  { label: 'open / close front',    fn: 'reachFront',    cmd: 'reach_front',    impl: 'setFront',     bcast: 1 },
  { label: 'reveal / conceal name', fn: 'reachReveal',   cmd: 'reach_reveal',   impl: 'setRevealed',  bcast: 1 },
  { label: 'take / lose the world', fn: 'reachFlip',     cmd: 'reach_flip',     impl: 'flipWorld',    bcast: 1 },
  { label: 'wave count',            fn: 'reachWaves',    cmd: 'reach_waves',    impl: 'setWaves',     bcast: 1 },
  { label: 'per-zone control',      fn: 'reachZone',     cmd: 'reach_zone',     impl: 'setZone',      bcast: 1 },
  { label: 'war fund top-up',       fn: 'reachFund',     cmd: 'reach_fund',     impl: 'setFund',      bcast: 1 },
  { label: 'raid a work',           fn: 'reachRaid',     cmd: 'reach_raid',     impl: 'raidFob',      bcast: 1 },

  // ── The Reach: the story around it ──────────────────────────────────────
  { label: 'envoy line open/close', fn: 'reachEnvoy',    cmd: 'reach_envoy',    impl: 'setEnvoy',     bcast: 1 },
  { label: 'jade commitment',       fn: 'jadeCommit',    cmd: 'jade_commit',    impl: 'setJade',      bcast: 1 },
  { label: 'coalition declares',    fn: 'coalitionEnter',cmd: 'coalition_enter',impl: 'setCoalitionEntry', bcast: 1 },

  // ── War Controls ────────────────────────────────────────────────────────
  { label: 'compose a line',        fn: 'warRoster',     cmd: 'war_roster',       impl: 'setRoster',   bcast: 1 },
  { label: 'revert to Reach model', fn: 'warClear',      cmd: 'war_roster_clear', impl: 'clearRoster', bcast: 1 },
  { label: 'set the forward band',  fn: 'warForward',    cmd: 'war_forward',      impl: 'setForward',  bcast: 1 },
  { label: 'declare a faction in',  fn: 'warBelligerent',cmd: 'war_belligerent',  impl: 'setBelligerent', bcast: 1 },
  /* No reach.js export: the portrait tables live in server.js, so `impl` is the
     resolver that decides which Khai'sultull art is installed. Listed here
     anyway - the point of this table is that every control a GM can press has a
     handler, and this one shipped as an HTTP route with NO BUTTON AT ALL for a
     release. That is what the table is for. */
  { label: 'assign a dev portrait', fn: 'devPortrait',   cmd: 'dev_portrait',     impl: null,             bcast: 1 },
];

/* Which local name server.js gave each reach.js export. Parsed once from the
   import block, so a rename there cannot silently break every assertion below
   and cannot be papered over by loosening a regex. */
const ALIAS = (() => {
  const m = /import \{([\s\S]*?)\} from '\.\/reach\.js';/.exec(server);
  const out = {};
  if (!m) return out;
  for (const part of m[1].split(',')) {
    const a = /^\s*(\w+)\s+as\s+(\w+)\s*$/.exec(part);
    if (a) out[a[1]] = a[2];
  }
  return out;
})();

section('Every control reaches a handler');
for (const c of CONTROLS) {
  // 1. The panel exposes it and it sends the command.
  const fnRe = new RegExp('window\\.' + c.fn + '\\s*=\\s*function');
  ok(c.label + ': the panel exposes ' + c.fn, fnRe.test(panel));
  /* SLICED BY REGEX, NOT BY indexOf ON A LITERAL. The first cut searched for
     `window.reachControl =` with exactly one space and these are column-aligned
     in the panel - `window.reachControl  = function` - so it found nothing and
     reported five perfectly good controls as unwired. A matcher that cannot
     survive an extra space is a matcher that reports formatting as breakage. */
  const body = (() => {
    const m = new RegExp('window\\.' + c.fn + '\\s*=\\s*function[\\s\\S]*?\\n(?=window\\.|\\n)').exec(panel);
    if (m) return m[0];
    const i = panel.search(new RegExp('window\\.' + c.fn + '\\s*='));
    return i < 0 ? '' : panel.slice(i, i + 900);
  })();
  ok(c.label + ': ' + c.fn + " sends '" + c.cmd + "'",
     new RegExp("cmd\\s*:\\s*'" + c.cmd + "'").test(body), c.cmd);

  // 2. The server has a branch for exactly that string.
  ok(c.label + ": server handles '" + c.cmd + "'",
     new RegExp("cmd === '" + c.cmd + "'").test(serverC), c.cmd);

  // 3. That branch calls the implementation, and 5. broadcasts if it must.
  const br = (() => {
    const i = serverC.indexOf("cmd === '" + c.cmd + "'");
    if (i < 0) return '';
    const j = serverC.indexOf("else if (cmd === '", i + 10);
    return serverC.slice(i, j < 0 ? i + 2200 : j);
  })();
  /* THE ALIAS MAP IS PARSED FROM THE IMPORT BLOCK, NOT GUESSED FROM THE NAME.
     The first cut assumed server.js renames `flipWorld` to `reachFlipWorld` and
     it actually imports it as `reachFlip`, so a correctly wired control was
     reported dead. Guessing a convention the code never promised is how a check
     ends up dictating naming. */
  if (c.impl) {
    const alias = ALIAS[c.impl] || c.impl;
    ok(c.label + ': the branch calls ' + c.impl + (alias !== c.impl ? ' (as ' + alias + ')' : ''),
       new RegExp('\\b' + alias + '\\s*\\(').test(br), c.impl + ' / ' + alias);
  }
  /* BROADCAST, NOT ws.send. This is the assertion that earned the file: every
     reach_* write broadcasts except reach_garrison, which replied only to the
     socket that sent it. Garrison is what forcesFor reads to decide how hard the
     brood pushes back, so a GM raising it changed the fight for himself and
     nobody else - and it went unnoticed because the panel it is pressed from is
     the one surface that DID update. A ws.send does not satisfy this. */
  if (c.bcast)
    ok(c.label + ': the branch broadcasts the result, not just echoes to the sender',
       /broadcast\(\s*\{/.test(br), 'ws.send only');

  // 4. reach.js exports it.
  if (c.impl)
    ok(c.label + ': reach.js exports ' + c.impl,
       new RegExp('export function ' + c.impl + '\\b').test(reachC), c.impl);
}

section('Nothing on the wire is unreachable, and nothing on screen is dead');
{
  /* THE OTHER DIRECTION. The table above proves every control Jacob should have
     is wired; this proves the server is not carrying commands nothing can send.
     A handler with no button is a feature that exists and cannot be used, which
     is the same waste as a button with no handler and much harder to notice. */
  const known = new Set(CONTROLS.map(c => c.cmd));
  const wireCmds = [...serverC.matchAll(/cmd === '(reach_\w+|war_\w+|jade_\w+|coalition_\w+)'/g)]
    .map(m => m[1]);
  for (const cmd of new Set(wireCmds)) {
    if (known.has(cmd)) continue;
    /* Not in the table is not automatically wrong - some commands are read-only
       fetches or arm/disarm pairs with no dedicated button - so this asserts the
       panel can send it AT ALL rather than that it is in the list. */
    /* SEARCHED IN THE MARKUP TOO. reach_disarm is sent by an inline onclick in
       index.html rather than through a named panel function, which is a
       perfectly good way to send a command with no arguments - and the first cut
       of this looked only in god-panel.js and called it dead. Where a control
       lives is not the same question as whether it exists. */
    ok("the panel can send '" + cmd + "'",
       new RegExp("cmd\\s*:\\s*'" + cmd + "'").test(panelC)
       || new RegExp("cmd\\s*:\\s*'" + cmd + "'").test(idx), cmd + ' has no sender');
  }

  /* And every window function the panel's own markup calls has to exist. An
     onclick naming a function that was renamed is a button that throws into the
     console and looks like it did nothing. */
  const called = new Set();
  for (const m of idx.matchAll(/onclick="(\w+)\(/g)) called.add(m[1]);
  for (const m of panel.matchAll(/onclick="(\w+)\(/g)) called.add(m[1]);
  const GLOBALS = new Set(['godTab', 'godSend', 'godCmd', 'confirm', 'alert']);
  for (const fn of called) {
    if (GLOBALS.has(fn)) continue;
    if (!/^(god|reach|jade|war|coalition)/.test(fn)) continue;
    ok('inline handler ' + fn + ' is defined',
       new RegExp('window\\.' + fn + '\\s*=').test(panel)
       || new RegExp('function ' + fn + '\\b').test(panel), fn);
  }
}

section('The advance runs from the passage inward');
{
  /* THE BUG THAT PROMPTED THIS PASS. REACH_WORLDS is not a list of worlds, it
     is the ROUTE: index 0 is where the war starts, frontAllowed unlocks each
     entry off the one before it, and the panel renders in this sequence. It was
     id order, and the map was drawn later, so the campaign was told to begin at
     the far side of the Reach and creep back toward the door. */
  const order = (() => {
    const m = /export const REACH_WORLDS = \[([\s\S]*?)\];/.exec(reach);
    return m ? [...m[1].matchAll(/'([\w]+)'/g)].map(x => x[1]) : [];
  })();
  ok('REACH_WORLDS is liftable', order.length === 10, order.length + ' entries');

  // Positions from the map, and the return gate the ships arrive through.
  const gx = read('client/assets/galaxy.js');
  const meta = (() => {
    const i = gx.indexOf('var COLONY_META');
    let d = 0; const start = gx.indexOf('{', i);
    for (let k = start; k < gx.length; k++) {
      if (gx[k] === '{') d++;
      else if (gx[k] === '}' && --d === 0) return new Function('return ' + gx.slice(start, k + 1))();
    }
    return null;
  })();
  ok('COLONY_META is liftable', !!meta);
  const ret = /ret:\s*\{\s*x:(\d+),\s*y:(\d+)/.exec(gx.slice(gx.indexOf('khaisultull:')));
  ok('the Reach declares a return gate', !!ret);

  if (meta && ret && order.length) {
    const GX = Number(ret[1]), GY = Number(ret[2]);
    const dist = id => {
      const m = meta[id];
      return m ? Math.hypot(m.x - GX, m.y - GY) : Infinity;
    };
    /* MONOTONIC, NOT MERELY "STARTS AT THE RIGHT ONE". The route is walked one
       step at a time by frontAllowed, so every step has to lead away from the
       passage; a list that starts correctly and then jumps back is a campaign
       that doubles back on itself halfway through. */
    let bad = null;
    for (let i = 1; i < order.length; i++)
      if (dist(order[i]) < dist(order[i - 1])) { bad = [order[i - 1], order[i]]; break; }
    ok('the advance never doubles back toward the passage', !bad,
       bad ? bad[0] + ' -> ' + bad[1] : '');
    ok('the war starts at the world nearest the passage',
       order[0] === Object.keys(meta).filter(k => meta[k].galaxy === 'khaisultull')
         .sort((a, b) => dist(a) - dist(b))[0],
       order[0] + ' at ' + dist(order[0]).toFixed(0));
    /* The id whose name says `gate` is now the FARTHEST, which is exactly the
       thing that made this hard to see. Asserted so nobody reorders it back by
       reading the identifier. */
    ok('ks_gate_reach is the far end now, whatever its id says',
       order[order.length - 1] === 'ks_gate_reach',
       'index ' + order.indexOf('ks_gate_reach'));
  }

  /* The panel must take the route from the payload rather than keeping its own
     copy, or the next reorder desynchronises the two. */
  ok('the server ships the route', /order: REACH_WORLDS\.slice\(\)/.test(reach));
  ok('and the unlock threshold with it', /openAt: REACH_OPEN_AT/.test(reach));
  ok('the panel renders in the route the server sent',
     /const REACH_ORDER = \(d\.order && d\.order\.length\) \? d\.order : Object\.keys\(d\.worlds\)/.test(panel));
  ok('and states the unlock rule on the card rather than only in a rejection',
     /% is needed before this world unlocks/.test(panel));
  ok('the threshold on the card comes from the server, not a literal',
     /const OPEN_AT = \(typeof d\.openAt === 'number'\)/.test(panel));

  /* Membership and route are two different facts and live in two lists on
     purpose. They must hold the same members. */
  const cityIds = (() => {
    const m = /REACH_CITY_IDS = new Set\(\[([\s\S]*?)\]\)/.exec(read('server/city.js'));
    return m ? [...m[1].matchAll(/'([\w]+)'/g)].map(x => x[1]) : [];
  })();
  ok('the city membership set holds the same worlds as the route',
     cityIds.length === order.length && order.every(id => cityIds.includes(id)),
     cityIds.length + ' vs ' + order.length);
}

section('A declaration changes the ground, not just a flag');
{
  const fx = read('server/factions.js');
  /* A DECLARATION THAT CHANGES NOTHING IS A FLAG, NOT AN EVENT - the mistake
     setCoalitionEntry already made once, where declaring an interstellar power
     left every world entirely Jade until ten were dialled by hand. */
  ok('declared factions reach the derived roster',
     /FX\.belligerentsOf\(s\)/.test(reach)
     && /rosterFromReach\(coalIn, jadeFrac, jadeFwd, extras\)/.test(fx));
  ok('and they share the ground Jade is not holding, not Jade\u2019s floor',
     /const rest = Math\.max\(0, 1 - jadeW\);/.test(fx));
  /* The Coalition is routed rather than duplicated: it has an entry gate, a
     jadeSet interaction and a floor, and a second field would be two
     authorities on whether it is at war. */
  ok('asking for the Coalition routes to the one place that owns it',
     /if \(fac === 'coal'\) return setCoalitionEntry\(inWar, actor\);/.test(reach));
  ok('Jade cannot be declared into its own war', /cannot leave it/.test(reach));
  ok('and the brood is not a party that declares', /not a party that declares/.test(reach));
  /* Off the restore list, a restart would withdraw every declared faction while
     leaving the Coalition declared: a war that half-forgot itself. */
  ok('belligerents survive a restart',
     /'coalIn', 'belligerents'\]/.test(reach));
  ok('a composed line is never rewritten by a declaration',
     /if \(w && w\.roster\) return w\.roster;/.test(reach));
  ok('the payload carries who is in the war', /belligerents: FX\.belligerentsOf\(s\)/.test(reach));
  ok('and the panel shows it rather than making a GM remember',
     /id="war-belligerents"/.test(idx) && /war-belligerents/.test(panel));
  ok('the brood is not offered as something to declare',
     /row\.short === 'KHAI'\) return;/.test(panel));

  /* DRIVEN. The derivation is lifted and run, because "does the share come out
     right for three parties" is arithmetic and reading it proves nothing. */
  /* IMPORTED, NOT TEXT-EVALUATED. Stripping `export` and running the file in a
     Function body reordered nothing but changed the binding rules enough that
     REACH_JADE_MIN - a const declared below its first use and hoisted fine as a
     module - became a temporal-dead-zone error. Lifting source text is right for
     a function; for a whole module the module loader is right, and it also means
     this drives exactly what the server imports. */
  const F = await import('../server/factions.js');
  const share = (r, fac) => {
    const e = F.rosterWire(r).home.find(x => x.fac === fac);
    return e ? e.share : 0;
  };
  const solo = F.rosterFromReach(0, 1, 1, []);
  ok('an undeclared war is entirely Jade', Math.abs(share(solo, 'jade') - 1) < 1e-9);
  const coal = F.rosterFromReach(1, 0.6, 1, []);
  ok('the Coalition alone takes the whole remainder',
     Math.abs(share(coal, 'coal') - 0.4) < 1e-9, String(share(coal, 'coal')));
  const three = F.rosterFromReach(1, 0.6, 1, ['void']);
  ok('a third power splits the remainder with the Coalition',
     Math.abs(share(three, 'coal') - 0.2) < 1e-9 && Math.abs(share(three, 'void') - 0.2) < 1e-9,
     JSON.stringify(F.rosterWire(three).home));
  ok('and Jade keeps exactly what it had', Math.abs(share(three, 'jade') - 0.6) < 1e-9);
  const noCoal = F.rosterFromReach(0, 0.6, 1, ['void']);
  ok('a faction can be declared without the Coalition being in at all',
     Math.abs(share(noCoal, 'void') - 0.4) < 1e-9 && share(noCoal, 'coal') === 0);
  ok('an undeclarable id cannot sneak onto the line through extras',
     share(F.rosterFromReach(1, 0.6, 1, ['khai', 'nope']), 'khai') === 0);
}

section('The hive lord can actually be given his face');
{
  /* THE BUG THIS SECTION EXISTS FOR: the assignment shipped as `/api/dev/portrait`
     with no control anywhere. controls-check walks SOCKET commands, so an HTTP
     route with no caller sailed past it - a feature that exists and cannot be
     used, which reads as done. It is a socket command now, so the table above
     covers it and this covers the rest. */
  ok('the unreachable HTTP route is gone', !/app\.post\('\/api\/dev\/portrait'/.test(server));
  ok('there is a field to name the player', /id="god-portrait-name"/.test(idx));
  ok('and one for the portrait, defaulting to the resolver alias',
     /id="god-portrait-id"[\s\S]{0,200}?value="hive"/.test(idx));
  ok('the button calls the panel function', /onclick="devPortrait\(\)"/.test(idx));
  ok("'hive' resolves server side rather than in the panel",
     /if \(pid === 'hive'\) pid = hiveLordPortrait\(\);/.test(serverC)
     && !/hiveLordPortrait/.test(strip(panel)));
  /* WRITING THE ROW IS NOT ENOUGH. It changes what the next login sends and
     nothing else, so the target keeps the old face until they reload - which is
     exactly what "it did not load to the account" looks like from outside. */
  ok('the target is told immediately',
     /broadcastToPlayer\(target\.id, \{ type: 'portrait_set'/.test(serverC));
  ok('and the client acts on being told', /msg\.type === 'portrait_set'/.test(read('client/assets/core.js')));
  ok('everyone else learns of it too so the next line carries the new face',
     /broadcast\(\{ type: 'player_portrait'/.test(serverC));
  ok('a bad portrait id is refused rather than written',
     /return err\('No such portrait: ' \+ pid\);/.test(serverC));
}

section('The panels are laid out, not stacked');
{
  const css = read('client/assets/god-panel.css');
  /* Every row used to carry its own inline cssText, so the label column was 52px
     here and 42px there and nothing lined up. A grid with a fixed label column
     is what makes eight controls read as eight controls. */
  for (const cls of ['gw-card', 'gw-head', 'gw-sec', 'gw-row', 'gw-lab', 'gw-val', 'gw-zone', 'gw-b'])
    ok('the stylesheet defines .' + cls, new RegExp('\\.' + cls + '[\\s,{.:]').test(css));
  ok('the row is a grid with a fixed label column',
     /\.gw-row\{display:grid;grid-template-columns:74px 1fr 58px/.test(css));
  ok('and values are tabular so they can be compared down the card',
     /font-variant-numeric:tabular-nums/.test(css));
  ok('the card no longer hand-rolls its label widths',
     !/min-width:52px/.test(panel));
  /* A disabled control with no reason attached is a control a GM goes hunting
     for an explanation for. */
  ok('a refusing control explains itself on the card', /\.gw-note/.test(css)
     && /function note\(text, warn\)/.test(panel));
  ok('and the Coalition gate says why the commitment slider is dead',
     /The Coalition has not declared/.test(panel));
  /* Position on the route, on the card, because that is the fact that was
     invisible while the order was wrong. */
  ok('each world shows its position on the advance',
     /Position on the advance\. 1 is nearest the passage\./.test(panel));
}

console.log('\ncontrols: ' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
