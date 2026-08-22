// tools/guest-check.mjs
//
// GUEST_BLOCKED_TYPES and GUEST_LOCKED_ALLOW are lists of websocket message type
// strings. Nothing links them to the dispatcher, so renaming a handler silently
// removes a gate and the failure is invisible: a trial account quietly gains an
// action it should not have, and nothing errors.
//
// This asserts every name in both sets still exists as a handled type in
// server.js. Same job lane-check.mjs does for the lane tables.
//
//   node tools/guest-check.mjs

import fs from 'fs';
import path from 'path';
import url from 'url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const serverSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
const guestSrc  = fs.readFileSync(path.join(ROOT, 'server', 'guest.js'),  'utf8');

// Every type the dispatcher actually branches on.
const handled = new Set();
for (const m of serverSrc.matchAll(/msg\.type\s*===\s*'([a-z_0-9]+)'/g)) handled.add(m[1]);

function setFrom(name) {
  const re = new RegExp(`export const ${name}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`, 'm');
  const block = guestSrc.match(re);
  if (!block) throw new Error(`could not parse ${name} out of guest.js`);
  return [...block[1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]);
}

const blocked = setFrom('GUEST_BLOCKED_TYPES');
const allowed = setFrom('GUEST_LOCKED_ALLOW');

let fail = 0;

const deadBlocks = blocked.filter(t => !handled.has(t));
if (deadBlocks.length) {
  fail = 1;
  console.error(`FAIL: ${deadBlocks.length} entr${deadBlocks.length===1?'y':'ies'} in GUEST_BLOCKED_TYPES match no handler in server.js.`);
  console.error('       A blocked type that no longer exists is a gate that stopped gating.');
  for (const t of deadBlocks) console.error(`         ${t}`);
}

const deadAllows = allowed.filter(t => !handled.has(t));
if (deadAllows.length) {
  fail = 1;
  console.error(`FAIL: ${deadAllows.length} entr${deadAllows.length===1?'y':'ies'} in GUEST_LOCKED_ALLOW match no handler in server.js.`);
  for (const t of deadAllows) console.error(`         ${t}`);
}

// A type in both sets is a contradiction: blocked for live guests but readable
// once locked makes no sense in either direction.
const both = blocked.filter(t => allowed.includes(t));
if (both.length) {
  fail = 1;
  console.error(`FAIL: ${both.length} type(s) appear in BOTH the blocked and locked-allow sets:`);
  for (const t of both) console.error(`         ${t}`);
}

// GUEST_BLOCKED_EXACT names REST routes by full path. A renamed or removed route
// leaves a dead entry that blocks nothing, with no error anywhere, so the same
// check applies: every exact path must resolve to a real app.post/app.delete.
const routes = new Set();
for (const m of serverSrc.matchAll(/app\.(?:post|get|delete|put)\('([^']+)'/g)) routes.add(m[1]);

const exactRe = /export const GUEST_BLOCKED_EXACT\s*=\s*\[([\s\S]*?)\]/m;
const exactBlock = guestSrc.match(exactRe);
if (!exactBlock) {
  fail = 1;
  console.error('FAIL: could not parse GUEST_BLOCKED_EXACT out of guest.js');
} else {
  const exact = [...exactBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const deadPaths = exact.filter(p => !routes.has(p));
  if (deadPaths.length) {
    fail = 1;
    console.error(`FAIL: ${deadPaths.length} path(s) in GUEST_BLOCKED_EXACT match no route in server.js:`);
    for (const p of deadPaths) console.error(`         ${p}`);
  } else {
    console.log(`OK: ${exact.length} exact-path blocks all resolve to live routes.`);
  }
}

// The trial REST gate must be GLOBAL MIDDLEWARE, not a check inside
// requirePlayer. requirePlayer covers 22 of 142 routes: every /api/funds,
// /api/warehouses, /api/council and /api/patreon route resolves its token
// inline with tokenFrom instead. A gate inside requirePlayer runs on a sixth of
// the API and silently does nothing on the rest. This was shipped that way in
// 1.4.0.0 and only surfaced by hitting /api/funds/create on a live guest.
{
  const inRequirePlayer = /function requirePlayer[\s\S]{0,900}?guestBlocksPath/.test(serverSrc);
  const asMiddleware = /app\.use\(\(req, res, next\) => \{[\s\S]{0,1800}?guestBlocksPath/.test(serverSrc);
  if (inRequirePlayer) {
    fail = 1;
    console.error('FAIL: the trial gate is inside requirePlayer, which covers only ~22 of ~142 routes.');
    console.error('       Move it to the global app.use middleware or most of the API is ungated.');
  }
  if (!asMiddleware) {
    fail = 1;
    console.error('FAIL: no global app.use middleware calling guestBlocksPath was found.');
  } else if (!inRequirePlayer) {
    console.log('OK: trial REST gate is mounted as global middleware.');
  }
}

// Fleshbook player write paths must all run the text gate. Adding a fourth write
// route and forgetting fbCleanBody puts the hole straight back, and the failure
// is invisible because a post looks the same either way.
const FB_WRITE_ROUTES = ['/api/fleshbook/post', '/api/fleshbook/reply', '/api/fleshbook/edit'];
const gateCalls = (serverSrc.match(/fbCleanBody\(/g) || []).length - 1;  // minus the declaration
if (gateCalls < FB_WRITE_ROUTES.length) {
  fail = 1;
  console.error(`FAIL: fbCleanBody is called ${gateCalls} time(s) but there are ${FB_WRITE_ROUTES.length} Fleshbook write routes.`);
  console.error('       An unfiltered write path is the whole filter defeated by one extra request.');
} else {
  console.log(`OK: fbCleanBody called on all ${FB_WRITE_ROUTES.length} Fleshbook write paths.`);
}

if (!fail) {
  console.log(`OK: ${blocked.length} blocked and ${allowed.length} locked-allow types all resolve to live handlers.`);
  console.log(`    Dispatcher handles ${handled.size} message types and ${routes.size} REST routes.`);
}

process.exit(fail);
