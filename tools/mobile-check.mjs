// mobile-check
//
// Drives client/assets/mobile.js against the real client/index.html markup in
// jsdom and asserts the shell actually shows and hides the right nodes.
//
// WHY THIS IS NOT A REGEX SUITE. The bug this shell replaces was that the 1.2.5
// bottom nav called window.showTab(), which is defined in market-state.js and
// knows only 9 of the 12 tab ids and performs none of the per-tab init that
// core.js does on a .tab click. Grepping the source for "showTab" would have
// reported that navigation existed and was wired. It was wired to the wrong
// thing. The only assertion that catches that class of bug is one that listens
// for the event the real handler listens for.
//
// Requires jsdom, which is not a project dependency:
//   npm i jsdom && node tools/mobile-check.mjs
// Run from the repo root.

import fs from 'fs';
import { JSDOM } from 'jsdom';

const ROOT = process.cwd();
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; failures.push(n + (d ? '  [' + d + ']' : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); }
};
const section = (s) => console.log('\n' + s);

const html    = fs.readFileSync(ROOT + '/client/index.html', 'utf8');
const mobJs   = fs.readFileSync(ROOT + '/client/assets/mobile.js', 'utf8');
const mobCss  = fs.readFileSync(ROOT + '/client/assets/mobile.css', 'utf8');
const coreJs  = fs.readFileSync(ROOT + '/client/assets/core.js', 'utf8');
const stateJs = fs.readFileSync(ROOT + '/client/assets/market-state.js', 'utf8');

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE CHECKS
// ═══════════════════════════════════════════════════════════════════════════

section('SOURCE');

ok('index.html loads assets/mobile.js', /<script src="assets\/mobile\.js">/.test(html));
ok('index.html links assets/mobile.css', /assets\/mobile\.css/.test(html));

// The reason clicking is mandatory. If someone ever fixes market-state's
// showTab to cover all 12 ids and run init, this check flips and the comment
// in mobile.js should be revisited rather than the check deleted.
const stIds = stateJs.match(/function showTab\(name\)\{\s*var ids = \[([^\]]*)\]/);
ok('market-state showTab still omits mining/fleshbook/arena, so click is required',
  !!stIds && !/miningTab|fleshbookTab|arenaTab/.test(stIds[1]),
  stIds ? stIds[1] : 'showTab ids not found');

ok('core.js .tab click handler is the one that lazy loads bugs/fleshbook/arena',
  /\$all\('\.tab'\)\.forEach/.test(coreJs) &&
  /sel==='bugs'[\s\S]{0,120}lazyLoad/.test(coreJs) &&
  /sel==='arena'[\s\S]{0,120}lazyLoad/.test(coreJs));

ok('mobile.js navigates by dispatching a click on the .tab node',
  /function clickTab[\s\S]{0,400}?t\.click\(\)/.test(mobJs));

ok('mobile.js never calls window.showTab for navigation',
  !/(?<!window\.)\bshowTab\s*\(\s*['"]/.test(mobJs.replace(/orig\.apply[^\n]*/g, '')));

ok('the 1.2.5 touchend preventDefault-then-click hack is gone',
  !/touchend[\s\S]{0,200}preventDefault/.test(mobJs));

ok('touch-action:manipulation replaces it in CSS',
  /touch-action:\s*manipulation/.test(mobCss));

ok('.fm-off exempts the margin call and dunce banners',
  /\.fm-off\s*>\s*\*:not\(#margin-call-banner\):not\(#dunce-banner\)/.test(mobCss));

ok('banners are pinned so they are reachable from any view',
  /#margin-call-banner[\s\S]{0,200}position:\s*fixed/.test(mobCss));

ok('the grid is the only scroll region',
  /body\.fm-mobile \.grid\s*\{[\s\S]{0,400}?overflow-y:\s*auto/.test(mobCss) &&
  /body\.fm-mobile\s*\{[\s\S]{0,300}?overflow:\s*hidden/.test(mobCss));

ok('the drawer is #fm-header-user repositioned, not a duplicate menu',
  /body\.fm-mobile #fm-header-user\s*\{[\s\S]{0,300}?position:\s*fixed/.test(mobCss) &&
  !/createElement\('div'\)[\s\S]{0,200}fmDrawerMenu/.test(mobJs));

ok('galaxy map opts out of scroll gestures',
  /#galaxySVG\s*\{[\s\S]{0,120}?touch-action:\s*none/.test(mobCss));

ok('chat input is 16px so iOS does not zoom on focus',
  /#chatInput\s*\{\s*font-size:\s*16px/.test(mobCss));

// drawChart is scheduled from _pushWave on every price tick regardless of which
// tab is open. Without the visibility guard each tick starts its own 100ms
// self rescheduling chain that never terminates while the tab is hidden.
ok('drawChart does not retry while its canvas is hidden',
  /if \(W < 10 \|\| H < 10\)[\s\S]{0,1200}?offsetParent !== null\) setTimeout\(drawChart, 100\)/.test(coreJs));
ok('drawChart has no unguarded retry left',
  !/if \(W < 10 \|\| H < 10\) \{ setTimeout\(drawChart, 100\); return; \}/.test(coreJs));
ok('the shell nudges the chart when Market becomes visible',
  /function nudgeChart[\s\S]{0,300}?window\.drawChart\(\)/.test(mobJs));

// ── i18n parity ──────────────────────────────────────────────────────────────
section('I18N');

// Only complete keys. 'mob.tile.' appears as a concatenation prefix in the
// title painter and is not itself a key.
const keys = [...new Set(
  [...mobJs.matchAll(/'(mob(?:\.[a-z0-9]+)+)'/g)].map(m => m[1])
)].filter(k => !k.endsWith('.'));
ok('mobile.js declares i18n keys for its own strings', keys.length >= 20, keys.length + ' keys');

let missing = [], noHan = [];
for (const k of keys) {
  const re = new RegExp("'" + k.replace(/\./g, '\\.') + "'\\s*:\\s*\\{[^}]*\\}");
  const m = coreJs.match(re);
  if (!m) { missing.push(k); continue; }
  const zh = m[0].match(/zh\s*:\s*'([^']*)'/);
  if (!zh || !/[\u4e00-\u9fff]/.test(zh[1])) noHan.push(k);
}
ok('every mob.* key exists in window.I18N', missing.length === 0, missing.join(','));
ok('every mob.* key has a Han zh value', noHan.length === 0, noHan.join(','));

ok('More tile labels carry data-i18n, not bare English',
  /class="lb" data-i18n="/.test(mobJs));

// ═══════════════════════════════════════════════════════════════════════════
// LIVE DOM
// ═══════════════════════════════════════════════════════════════════════════

section('LIVE DOM');

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;

Object.defineProperty(window, 'innerWidth', { value: 390, writable: true, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: 844, writable: true, configurable: true });

// Minimal globals mobile.js touches. Deliberately NOT a full core.js: the shell
// must work without knowing anything about the modules it navigates to.
window.showTab = function () { window.__origShowTabCalls++; };
window.__origShowTabCalls = 0;
window.__drawChartCalls = 0;
window.drawChart = function () { window.__drawChartCalls++; };
window.t = (k, f) => (f !== undefined ? f : k);
window.applyI18n = () => {};

window.eval(mobJs);

const waitFor = async (fn, ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 20));
  }
  return false;
};

const $ = (s) => doc.querySelector(s);
const off = (el) => el.classList.contains('fm-off');
const hid = (el) => el.classList.contains('fm-hide');

const run = async () => {
  const booted = await waitFor(() => window.FM_MOBILE && doc.body.classList.contains('fm-mobile'));
  ok('shell activates at 390px', booted);
  if (!booted) return;

  const M = window.FM_MOBILE;
  const left = $('#fmLeft'), center = $('#fmCenter'), right = $('#rightPanel');

  ok('chrome is mounted', !!$('#fmTop') && !!$('#fmCtx') && !!$('#fmNav') && !!$('#fmScrim'));
  ok('bottom nav has exactly 5 slots', doc.querySelectorAll('#fmNav button').length === 5,
    String(doc.querySelectorAll('#fmNav button').length));
  ok('desktop tab strip is not the mobile navigation', !!$('#fmCenter > .tabs'));

  // ── Default view ──
  ok('default view is market', M.view() === 'market');
  ok('market shows the centre panel only', !off(center) && off(left) && off(right));

  // The chart is sized from clientWidth, so returning to Market at a new width
  // must trigger a redraw rather than waiting on a single ResizeObserver.
  M.setView('chat');
  window.__drawChartCalls = 0;
  M.setView('market');
  const drew = await waitFor(() => window.__drawChartCalls > 0, 500);
  ok('entering Market redraws the chart', drew, 'calls=' + window.__drawChartCalls);
  window.__drawChartCalls = 0;
  M.setView('chat');
  await new Promise(r => setTimeout(r, 60));
  ok('leaving Market does not redraw the chart', window.__drawChartCalls === 0,
    'calls=' + window.__drawChartCalls);
  M.setView('market');

  // ── THE REGRESSION TEST ──
  // Attach a listener to the same node core.js listens on. If navigation ever
  // goes back through window.showTab, this counter stays at zero.
  let pnlClicks = 0;
  $('.tab[data-tab="pnl"]').addEventListener('click', () => { pnlClicks++; });
  let arenaClicks = 0;
  $('.tab[data-tab="arena"]').addEventListener('click', () => { arenaClicks++; });

  M.setView('wallet');
  ok('Wallet fires a real click on the P&L tab node', pnlClicks === 1, 'clicks=' + pnlClicks);
  ok('Wallet defaults to the P&L segment', M.seg() === 'pnl');
  ok('P&L shows the centre panel', !off(center) && off(left) && off(right));

  M.openTab('arena', 'Corpo-Cards');
  ok('Corpo-Cards fires a real click on its tab node', arenaClicks === 1, 'clicks=' + arenaClicks);
  ok('a More destination is depth 1', M.depth() === 1 && doc.body.dataset.fmdepth === '1');
  ok('back chevron is exposed at depth 1', !!$('#fmTop .fmt-back'));

  // ── Board segments, the left panel split at the <hr> ──
  M.setView('board');
  ok('Board defaults to Companies', M.seg() === 'companies');
  ok('Board shows the left panel', !off(left) && off(center) && off(right));
  ok('Companies shows the ticker list', !hid($('#tickers')));
  ok('Companies hides the news feed', hid($('#news')));
  ok('Companies keeps the search box', !hid($('#search')));

  M.setSeg('board', 'news');
  ok('News shows the news feed', !hid($('#news')));
  ok('News hides the ticker list', hid($('#tickers')));

  M.setSeg('board', 'heat');
  ok('Heat swaps to the centre panel', !off(center) && off(left));
  ok('Heat is still the Board nav slot',
    $('#fmNav button[data-fmv="board"]').classList.contains('on'));

  // ── Wallet segments live in the right panel ──
  M.setView('wallet');
  M.setSeg('wallet', 'wire');
  ok('Wire shows the transfer section', !off(right) && !hid($('#transferSection')));
  ok('Wire hides the chat box', hid($('#chatBox')));
  ok('Wire force expands the collapsible', !$('#transferSection').classList.contains('collapsed'));

  M.setSeg('wallet', 'ranks');
  ok('Ranks shows the leaderboard', !hid($('#leaderboardCompact')));
  ok('Ranks force expands the collapsible', !$('#leaderboardCompact').classList.contains('collapsed'));
  ok('Ranks hides the transfer section', hid($('#transferSection')));

  // ── A margin call must never be buried by the shell ──
  const banner = $('#margin-call-banner');
  const dunce  = $('#dunce-banner');
  ok('banners are not group tagged', !banner.hasAttribute('data-fmgrp') && !dunce.hasAttribute('data-fmgrp'));
  let buried = [];
  for (const v of ['market', 'board', 'chat', 'wallet', 'more']) {
    M.setView(v);
    if (banner.matches('.fm-off > *:not(#margin-call-banner):not(#dunce-banner)')) buried.push(v);
    if (banner.classList.contains('fm-hide')) buried.push(v + ':hide');
  }
  ok('margin call banner survives every root view', buried.length === 0, buried.join(','));

  // ── Chat ──
  M.setView('chat');
  ok('Chat shows the chat box', !off(right) && !hid($('#chatBox')));
  ok('Chat stops the region scrolling so the input can pin', doc.body.dataset.fmfill === '1');
  ok('Chat reuses the existing channel strip', !!$('#chatTabs') && !hid($('#chatTabs').parentElement));

  // ── Context bar presence ──
  const ctxFor = (v) => { M.setView(v); return doc.body.dataset.fmctx; };
  ok('Board has a context bar', ctxFor('board') === '1');
  ok('Wallet has a context bar', ctxFor('wallet') === '1');
  ok('Market has none', ctxFor('market') === '0');
  ok('Chat has none, its own channel strip serves', ctxFor('chat') === '0');
  ok('More has none', ctxFor('more') === '0');

  // ── More grid ──
  const tiles = doc.querySelectorAll('#fmMore .fm-tile');
  ok('More grid has a tile per remaining destination', tiles.length === 12, String(tiles.length));
  ok('every More tile has a localisable label',
    [...tiles].every(t => t.querySelector('.lb[data-i18n]')));
  ok('every More tile declares an action',
    [...tiles].every(t => !!t.dataset.fmgo));

  // ── Casino lobby ──
  const subtabs = doc.querySelectorAll('#casinoTabs .subtab');
  const lobby = doc.querySelectorAll('#fmCasinoLobby .fm-tile');
  ok('casino lobby has one tile per game', lobby.length === subtabs.length && lobby.length === 11,
    lobby.length + ' vs ' + subtabs.length);
  ok('lobby tiles inherit the subtab i18n keys',
    [...lobby].every(t => !!t.querySelector('.lb[data-i18n]')));

  let bjClicks = 0;
  $('#casinoTabs .subtab[data-subtab="blackjack"]').addEventListener('click', () => { bjClicks++; });
  M.openTab('casino', 'Casino');
  ok('casino opens on the lobby, not a game', M.game() === 0 && doc.body.dataset.fmgame === '0');
  M.openGame('blackjack');
  ok('picking a game clicks the real subtab', bjClicks === 1, 'clicks=' + bjClicks);
  ok('picking a game leaves the lobby', M.game() === 1 && doc.body.dataset.fmgame === '1');
  M.back();
  ok('back from a game returns to the lobby', M.game() === 0 && M.tab() === 'casino');
  M.back();
  ok('back from the lobby returns to More', M.view() === 'more');

  // ── showTab bridge ──
  window.__origShowTabCalls = 0;
  window.showTab('market');
  ok('an internal showTab link still reaches the original', window.__origShowTabCalls === 1);
  ok('an internal showTab link moves the shell too', M.view() === 'market');

  // ── Leaving mobile must not strand a hidden panel ──
  window.innerWidth = 1400;
  window.dispatchEvent(new window.Event('resize'));
  const stranded = await waitFor(() => !doc.body.classList.contains('fm-mobile'), 1000);
  ok('shell deactivates above the breakpoint', stranded);
  ok('no panel is left hidden on desktop',
    doc.querySelectorAll('.fm-off').length === 0 && doc.querySelectorAll('.fm-hide').length === 0,
    doc.querySelectorAll('.fm-off,.fm-hide').length + ' left');
  ok('shell data attributes are cleared', !doc.body.dataset.fmv && !doc.body.dataset.fmtab);

  window.innerWidth = 390;
  window.dispatchEvent(new window.Event('resize'));
  const back = await waitFor(() => doc.body.classList.contains('fm-mobile'), 1000);
  ok('shell reactivates on rotate back', back);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
};

run();
