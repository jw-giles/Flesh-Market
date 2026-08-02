#!/usr/bin/env node
/**
 * mobile-136-check.mjs
 *
 * Guards the three v1.3.6 mobile fixes. Two kinds of assertion here:
 *
 *   FIX   the change is present and shaped the way it has to be
 *   ANCHOR the thing the fix was measured against has not moved
 *
 * The ANCHOR block is the point of this file. mobile.js scales three casino
 * boards using hardcoded natural widths, because none of the three can be
 * measured reliably from CSS. If someone changes chess S from 45, or the
 * solitaire track minimum from 56px, or the minesweeper cell from 28px, the
 * scale silently becomes wrong and nothing throws. These assertions fail
 * instead.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0;
const fails = [];

function has(label, text, needle) {
  const ok = typeof needle === 'string' ? text.includes(needle) : needle.test(text);
  if (ok) pass++; else fails.push(label);
}
function hasNot(label, text, needle) {
  const bad = typeof needle === 'string' ? text.includes(needle) : needle.test(text);
  if (!bad) pass++; else fails.push(label);
}

const mjs = read('client/assets/mobile.js');
const mcss = read('client/assets/mobile.css');
// Negative assertions run against a comment-stripped copy. The comments in this
// release quote the exact patterns the guards look for, which is the same trap
// mathtest-check fell into: the first draft failed two of its own checks
// because the prose explaining a bug contained the bug's signature.
const mcssNC = mcss.replace(/\/\*[\s\S]*?\*\//g, '');
const core = read('client/assets/core.js');
const chess = read('client/assets/casino-chess.js');
const sol = read('client/assets/casino-solitaire.js');
const mine = read('client/assets/casino-minesweeper.js');
const html = read('client/index.html');

/* ── FIX 1: drawer lockup ───────────────────────────────────────────────── */

has('menu button toggles instead of always opening',
  mjs, "drawer(!body.classList.contains('fm-drawer'))");
hasNot('old open-only menu handler is gone',
  mjs, /fmt-menu'\)\.addEventListener\('click', function \(\) \{ drawer\(true\); \}\)/);

// The whole reason the scrim could swallow every tap on iOS: the pointer:coarse
// block strips cursor:pointer from every element, which is one of the signals
// Safari uses to decide a bare div is clickable.
has('scrim binds pointerdown, not click alone', mjs, "scrim.addEventListener('pointerdown'");
has('scrim keeps a click fallback', mjs, "scrim.addEventListener('click', shut)");
has('scrim carries a button role', mjs, "scrim.setAttribute('role', 'button')");
has('cursor:auto blanket rule still present, which is why the above is needed',
  mcss, /pointer: coarse\)[\s\S]{0,200}cursor: auto !important/);

has('explicit drawer close control exists', mjs, "xb.id = 'fmDrawerClose'");
has('close control is styled when the drawer is open',
  mcss, /body\.fm-mobile\.fm-drawer #fmDrawerClose/);
has('top bar is lifted above the 9994 scrim while the drawer is open',
  mcss, /body\.fm-mobile\.fm-drawer #fmTop \{ z-index: 999[5-9]/);
has('escape and popstate close the drawer', mjs, 'wireDrawerEscapes');
has('escapes are wired in enter()', mjs, /enter\(\)[\s\S]{0,400}wireDrawerEscapes\(\)/);

/* ── FIX 1b: the Bugs dead end ──────────────────────────────────────────── */

// The drawer Bugs button clicks a real .tab node directly, which core.js
// handles and mobile.js never heard about, leaving #fmCenter with .fm-off.
has('drawer Bugs button still routes through a real .tab node',
  html, "getElementById('bugsTabBtnHidden')");
has('bugsTabBtnHidden is still a .tab', html, /class="tab" data-tab="bugs" id="bugsTabBtnHidden"/);
has('raw .tab clicks resync the shell', mjs, 'bridgeTabClicks');
has('tab bridge is wired in enter()', mjs, /enter\(\)[\s\S]{0,400}bridgeTabClicks\(\)/);
has('tab bridge respects the syncing guard so shell clicks do not recurse',
  mjs, /bridgeTabClicks[\s\S]{0,600}if \(!active \|\| syncing\) return;/);

/* ── FIX 1c: the drawer never rendered at all ───────────────────────────
   #fm-header-user sits at .wrap > .row:first-child > .row > span, and that
   row used to be display:none !important. A position:fixed descendant of a
   display:none ancestor generates no box, so every drawer rule in this file
   was decorating something that did not exist. The four 1.3.6 gaps made that
   unrecoverable; this is what made it empty.

   Static CSS cannot prove a computed display, so these assert the shape of
   the rules and the DOM position they depend on, which is the part that
   silently rots. */

has('ANCHOR drawer is still nested inside the first header row',
  html, /<div class="wrap">[\s\S]{0,3000}?id="fm-header-user"/);
has('ANCHOR drawer is still inside a nested .row, not a direct child',
  html, /<div class="row">[\s\S]{0,400}?id="fm-header-user"/);

hasNot('header row is NOT display:none, which would erase the drawer',
  mcssNC, /\.row:first-child\s*(,|\{)[^}]*display:\s*none/);
has('header row and its nested row are kept in the box tree',
  mcss, /body\.fm-mobile \.wrap > \.row:first-child,\s*\n\s*body\.fm-mobile \.wrap > \.row:first-child > \.row \{[\s\S]{0,120}display: block !important/);
has('the chain is collapsed to zero height rather than hidden',
  mcss, /\.row:first-child > \.row \{[\s\S]{0,160}height: 0 !important/);
has('the wordmark and eod block are the thing actually hidden',
  mcss, 'body.fm-mobile .wrap > .row:first-child > div:not(.row) { display: none !important; }');
has('drawer overrides the pre-login inline display:none',
  mcss, /body\.fm-mobile #fm-header-user \{[\s\S]{0,600}display: flex !important;/);
hasNot('no rule hides the drawer itself on mobile',
  mcssNC, /#fm-header-user\s*\{[^}]*display:\s*none/);
has('mirror still reads the eod clock by textContent, which display:none does not affect',
  mjs, /var eod = el\('eod-timer'\)/);

/* ── FIX 2: touch-only system locks ─────────────────────────────────────── */

has('touch gate uses pointer coarse AND no fine pointer anywhere',
  mjs, /\(pointer: coarse\)'\)\.matches &&[\s\S]{0,80}\(any-pointer: fine\)'\)\.matches/);
hasNot('touch gate is not a width check', mjs, /TOUCH_ONLY[^\n]*innerWidth/);
has('mining is in the locked table', mjs, /LOCKED = \{[\s\S]{0,200}mining:/);
has('locked tiles get the fm-locked class', mjs, "' fm-locked'");
has('fm-locked is reddened', mcss, /\.fm-tile\.fm-locked \{[\s\S]{0,80}border-color: #6a1e1e/);
has('lock tag element is styled', mcss, /\.fm-tile \.lk \{/);
has('mining lock notice is injected', mjs, "note.id = 'fmMiningLock'");
has('mining launch button is disabled in JS', mjs, "launch.setAttribute('disabled', 'disabled')");
has('mining launch button is inert in CSS',
  mcss, /fm-touchonly #miningLaunchBtn \{[\s\S]{0,140}pointer-events: none/);
has('fm-touchonly is set on body', mjs, "body.classList.toggle('fm-touchonly', TOUCH_ONLY)");
has('fm-touchonly is cleared on leave', mjs, /remove\('fm-mobile', 'fm-kbd', 'fm-touchonly'\)/);
has('mining launch button still exists to attach to', html, 'id="miningLaunchBtn"');

// Every user visible string in a JS built surface needs a key or it stays
// English in Jade mode. This is the recurring hazard, so assert it here.
has('lock tag carries an i18n key', mjs, "data-i18n=\"mob.lock.tag\"");
has('lock body carries an i18n key', mjs, "data-i18n=\"mob.lock.miningLong\"");

/* ── FIX 3: casino widths ───────────────────────────────────────────────── */

has('roulette wheel canvas is capped', mcss, /#wheelCanvas \{[\s\S]{0,120}max-width: 300px/);
has('roulette number cells reflow', mcss, /\.rl-num-cell \{[\s\S]{0,60}width: auto !important/);
has('roulette controls min-width released', mcss, '#rl-controls { min-width: 0 !important; }');
has('fitBoard pulls the layout box in, not just the paint',
  mjs, /marginRight = \(-\(nat \* \(1 - k\)\)\)/);
has('fitBoards covers chess, solitaire and minesweeper',
  mjs, /fitBoards[\s\S]{0,900}chessBoard[\s\S]{0,400}sol-board[\s\S]{0,400}ms-board/);
has('minesweeper has a scale floor', mjs, /FIT_FLOOR = \{ msBoard: 0\.5[0-9] \}/);
has('minesweeper scrolls past the floor', mcss, /#ms-wrap \{ overflow-x: auto/);
has('solitaire drag ghost tracks the board scale', mcss, 'var(--fm-sol-k, 1)');
has('fit runs after layout settles, not during render',
  mjs, /requestAnimationFrame\(fitBoards\)/);
has('fit survives board redraws', mjs, 'watchFittedPanes');
has('fit transforms are cleared on leave', mjs, /leave\(\)[\s\S]{0,900}chessBoard', 'ms-board'/);

/* ── ANCHORS: the measurements the scale depends on ─────────────────────── */

has('ANCHOR chess board is still 360px', chess, 'width:360px;height:360px');
has('ANCHOR chess square is still 45', chess, /const S = 45;/);
has('ANCHOR solitaire track minimum is still 56px', sol, 'repeat(7,minmax(56px,1fr))');
has('ANCHOR solitaire gap is still 8px', sol, /\.sol-board\{display:grid;grid-template-columns:repeat\(7,minmax\(56px,1fr\)\);gap:8px/);
has('ANCHOR minesweeper cell is still 28px', mine, /gridTemplateColumns=`repeat\(\$\{m\.cols\},28px\)`/);
has('ANCHOR minesweeper expert is still 30 columns', mine, /cols:30,\s*rows:16/);
has('ANCHOR roulette canvas is still 400 wide', core, '<canvas id="wheelCanvas" width="400"');

// 362 in mobile.js is 360 plus the 1px border on each side.
has('chess natural width matches the anchor', mjs, 'fitBoard(el(\'chessBoard\'), 362, 0)');
has('solitaire natural width matches the anchor', mjs, '7 * 56 + 6 * 8');

/* ── House rules ────────────────────────────────────────────────────────── */

hasNot('no em dashes in mobile.js', mjs, '\u2014');
hasNot('no em dashes in mobile.css', mcss, '\u2014');

/* ── Report ─────────────────────────────────────────────────────────────── */

const total = pass + fails.length;
if (fails.length) {
  console.error(`FAIL  ${fails.length}/${total}`);
  for (const f of fails) console.error(`  x ${f}`);
  process.exit(1);
}
console.log(`OK  ${pass}/${total} assertions`);
