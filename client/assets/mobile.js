/**
 * mobile.js - FleshMarket Mobile Shell (v1.3.0)
 *
 * Replaces the 1.2.5 approach, which stacked all three panels into one document
 * scroll and bolted a six button nav underneath. That produced the clutter: any
 * fixed or absolutely positioned child measured itself against a viewport that
 * no longer matched its container.
 *
 * The shell instead pins chrome and leaves exactly one scrolling region:
 *
 *   +---------------------------+
 *   | #fmTop      46px  fixed   |
 *   +---------------------------+
 *   | #fmCtx      34px  fixed   |  (only when a view defines segments)
 *   +---------------------------+
 *   |                           |
 *   | .grid       the ONLY      |
 *   |             scroll region |
 *   |                           |
 *   +---------------------------+
 *   | #fmNav      56px  fixed   |
 *   +---------------------------+
 *
 * DESIGN RULES, do not break these when extending:
 *
 * 1. NO DOM MOVES. Every view is an existing panel or tab body shown in place.
 *    The drawer is #fm-header-user repositioned by CSS, not relocated, so all
 *    of its listeners, ids and data-i18n attributes survive untouched.
 *
 * 2. NAVIGATION GOES THROUGH .tab CLICKS, never through window.showTab().
 *    There are two independent tab systems in this client. core.js binds a
 *    click listener to .tab that does the real work: lazy loading dev-comms,
 *    fleshbook and tcg, calling loadGuildDirectory, drawEquity and
 *    __devlogsSync. market-state.js separately defines window.showTab(), which
 *    knows only 9 of the 12 tab ids and performs none of that init. The 1.2.5
 *    nav called showTab(), so reaching P&L from mobile never drew the equity
 *    line and reaching Bugs or Corpo-Cards did nothing at all. Dispatching a
 *    click on the real .tab node runs BOTH listeners, which is the complete
 *    path and is what a desktop player triggers.
 *
 * 3. PANELS ARE NEVER display:none. They get .fm-off, which hides their
 *    children except the margin call and dunce banners. Those two are pinned
 *    by CSS so they are visible from any view.
 */
(function () {
'use strict';

var BP = 900;
var isMobile = function () { return window.innerWidth <= BP; };

// A device with a coarse primary pointer and no fine pointer anywhere has no
// mouse and no physical keyboard. That is the real gate for "can this system be
// played here", not screen width: a 1024px tablet fails it and a 380px window on
// a desktop passes it. Systems in LOCKED below are gated on this, not on BP.
var TOUCH_ONLY = (function () {
  try {
    if (!window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches &&
           !window.matchMedia('(any-pointer: fine)').matches;
  } catch (e) { return false; }
})();

// Systems that cannot be played without a mouse and keyboard. The tile is
// reddened and the entry point inside the system is disabled, but the system is
// still reachable, because the brief screen carries the bank balance and the
// leaderboard and those are worth reading on a phone.
var LOCKED = {
  mining: { key: 'mob.lock.mining', text: 'Needs a mouse and keyboard. Play on desktop.' }
};

var body = document.body;
var active = false;
var syncing = false;

var state = { view: 'market', seg: {}, tab: null, depth: 0, game: 0, label: '', labelKey: '' };

// ═══════════════════════════════════════════════════════════════════════════
// Element handles
// ═══════════════════════════════════════════════════════════════════════════

function el(id) { return document.getElementById(id); }
function q(sel) { return document.querySelector(sel); }
function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

function panels() {
  var g = q('.grid');
  if (!g) return null;
  var ps = Array.prototype.filter.call(g.children, function (c) {
    return c.classList && c.classList.contains('panel');
  });
  if (ps.length < 3) return null;
  return { left: ps[0], center: ps[1], right: el('rightPanel') || ps[2] };
}

// ═══════════════════════════════════════════════════════════════════════════
// One time tagging. Splits the left panel into a Companies group and a News
// group at the <hr>, so Board can show one at a time without moving anything.
// ═══════════════════════════════════════════════════════════════════════════

function tagGroups(P) {
  if (!P.left.id) P.left.id = 'fmLeft';
  if (!P.center.id) P.center.id = 'fmCenter';

  if (!P.left.dataset.fmTagged) {
    P.left.dataset.fmTagged = '1';
    var seenHr = false;
    Array.prototype.forEach.call(P.left.children, function (c) {
      if (c.tagName === 'HR') seenHr = true;
      c.setAttribute('data-fmgrp', seenHr ? 'news' : 'companies');
    });
  }

  if (!P.right.dataset.fmTagged) {
    P.right.dataset.fmTagged = '1';
    var map = { chatBox: 'chat', transferSection: 'wire', leaderboardCompact: 'ranks' };
    Array.prototype.forEach.call(P.right.children, function (c) {
      if (c.id === 'margin-call-banner' || c.id === 'dunce-banner') return;
      c.setAttribute('data-fmgrp', map[c.id] || 'other');
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Chrome
// ═══════════════════════════════════════════════════════════════════════════

// [key, icon, English label, action, i18n key]
// Every user visible string here carries a key, because a grid built from a JS
// array is exactly the shape that silently stays English in Jade mode.
var MORE = [
  ['Play', 'mob.sect.play', [
    ['casino',    '\uD83C\uDFB0', 'Casino',         'tab',             'mob.tile.casino'],
    ['galactic',  '\u2B21',       'Galaxy',         'tab',             'mob.tile.galactic'],
    ['mining',    '\u26CF',       'Mining',         'tab',             'mob.tile.mining'],
    ['arena',     '\uD83C\uDCCF', 'Corpo-Cards',    'tab',             'mob.tile.arena'],
    ['store',     '\uD83D\uDED2', 'Store',          'tab',             'mob.tile.store'],
    ['guild',     '\u2696',       'Capital Houses', 'tab',             'mob.tile.guild']
  ]],
  ['Read', 'mob.sect.read', [
    ['fleshbook', '\uD83D\uDCE3', 'Fleshbook',      'tab',             'mob.tile.fleshbook'],
    ['devlogs',   '\uD83D\uDCFA', 'Dev Logs',       'tab',             'mob.tile.devlogs'],
    ['lore',      '\uD83D\uDCD6', 'Lore Events',    'lore',            'mob.tile.lore']
  ]],
  ['Account', 'mob.sect.account', [
    ['inventory', '\uD83C\uDF92', 'Inventory',      'store:inventory', 'mob.tile.inventory'],
    ['titles',    '\uD83C\uDFF7', 'Titles',         'store:titles',    'mob.tile.titles'],
    ['bugs',      '\uD83D\uDC1B', 'Bugs',           'tab',             'mob.tile.bugs']
  ]]
];

function T(key, fallback) {
  return (window.t ? window.t(key, fallback) : fallback);
}

var GAME_ICONS = {
  roulette: '\uD83C\uDFA1', blackjack: '\uD83C\uDCA1', poker: '\u2660',
  horseraces: '\uD83D\uDC0E', baccarat: '\uD83C\uDFB4', sicbo: '\uD83C\uDFB2',
  chess: '\u265F', sudoku: '\u2B1C', mathgame: '\u2797',
  minesweeper: '\uD83D\uDCA3', solitaire: '\uD83C\uDCCF'
};

function buildChrome() {
  var P = panels();
  if (!P) return false;
  tagGroups(P);

  // Top bar
  if (!el('fmTop')) {
    var top = document.createElement('div');
    top.id = 'fmTop';
    top.innerHTML =
      '<button class="fmt-back" type="button" aria-label="Back">\u25C0</button>' +
      '<div class="fmt-portrait" id="fmtPortrait">\uFF0B</div>' +
      '<div class="fmt-id">' +
        '<div class="fmt-name" id="fmtName"></div>' +
        '<div class="fmt-cash" id="fmtCash"></div>' +
      '</div>' +
      '<div class="fmt-eod">' +
        '<div class="fmt-eod-l" data-i18n="mob.eod">END OF DAY</div>' +
        '<div class="fmt-eod-v" id="fmtEod">--:--</div>' +
      '</div>' +
      '<button class="fmt-menu" type="button" aria-label="Menu">\u2630</button>';
    body.appendChild(top);
    top.querySelector('.fmt-back').addEventListener('click', goBack);
    // Toggle, not open. The old handler was drawer(true) unconditionally, and
    // the scrim sits at 9994 over the 9992 top bar, so once the drawer was open
    // the button was unreachable anyway. Both halves of that are fixed here:
    // this toggles, and the button is lifted above the scrim in CSS.
    top.querySelector('.fmt-menu').addEventListener('click', function () {
      drawer(!body.classList.contains('fm-drawer'));
    });
    el('fmtPortrait').addEventListener('click', function () {
      if (window.openPortraitPicker) window.openPortraitPicker();
    });
  }

  // Context bar
  if (!el('fmCtx')) {
    var ctx = document.createElement('div');
    ctx.id = 'fmCtx';
    body.appendChild(ctx);
  }

  // Bottom nav
  if (!el('fmNav')) {
    var nav = document.createElement('div');
    nav.id = 'fmNav';
    nav.innerHTML =
      navBtn('market', '\uD83D\uDCC8', 'Market', 'mob.nav.market') +
      navBtn('board',  '\u25A4',       'Board',  'mob.nav.board') +
      navBtn('chat',   '\uD83D\uDCAC', 'Chat',   'mob.nav.chat', 'fmNavChatBadge') +
      navBtn('wallet', '\u25C8',       'Wallet', 'mob.nav.wallet') +
      navBtn('more',   '\u22EF',       'More',   'mob.nav.more');
    body.appendChild(nav);
    qa('#fmNav button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.fmv); });
    });
  }

  // Scrim.
  //
  // This was a bare div with a click listener. iOS Safari only synthesizes a
  // click on a non-interactive element when the browser has decided the element
  // is clickable, and one of the signals it uses is cursor:pointer. The
  // pointer:coarse block at the top of mobile.css sets cursor:auto !important on
  // every element on the page, which strips that signal from the scrim. So on
  // iPhone the scrim could swallow every tap and never close, the top bar was
  // buried under it, and there was no other exit: the screen was locked until
  // reload. Bind pointerdown, which is not subject to that heuristic, keep click
  // as the fallback for anything without Pointer Events, and give it a role so
  // assistive tech and the browser both read it as a control.
  if (!el('fmScrim')) {
    var scrim = document.createElement('div');
    scrim.id = 'fmScrim';
    scrim.setAttribute('role', 'button');
    scrim.setAttribute('tabindex', '-1');
    scrim.setAttribute('aria-label', 'Close menu');
    var closed = 0;
    var shut = function (e) {
      // pointerdown and click both fire for one tap. Debounce so the second one
      // cannot immediately reopen anything.
      var now = Date.now();
      if (now - closed < 400) return;
      closed = now;
      if (e && e.preventDefault) e.preventDefault();
      drawer(false);
    };
    scrim.addEventListener('pointerdown', shut);
    scrim.addEventListener('touchstart', shut, { passive: false });
    scrim.addEventListener('click', shut);
    body.appendChild(scrim);
  }

  // Explicit close control. The drawer had no visible way out at all, which is
  // the second half of the lockup: even with a working scrim, nothing on screen
  // said the dimmed area was tappable.
  if (!el('fmDrawerClose')) {
    var xb = document.createElement('button');
    xb.id = 'fmDrawerClose';
    xb.type = 'button';
    xb.setAttribute('aria-label', 'Close menu');
    xb.textContent = '\u2715';
    xb.addEventListener('click', function () { drawer(false); });
    body.appendChild(xb);
  }

  // More grid, lives inside the scroll region
  if (!el('fmMore')) {
    var more = document.createElement('div');
    more.id = 'fmMore';
    more.innerHTML = MORE.map(function (sect) {
      return '<div class="fm-sect" data-i18n="' + sect[1] + '">' + T(sect[1], sect[0]) +
        '</div><div class="fm-grid3">' +
        sect[2].map(function (t) {
          var badge = (t[0] === 'fleshbook')
            ? '<span class="bg" id="fmMoreFbBadge" style="display:none">0</span>' : '';
          var lk = (TOUCH_ONLY && LOCKED[t[0]]) ? LOCKED[t[0]] : null;
          var lock = lk
            ? '<span class="lk" data-i18n="mob.lock.tag">' + T('mob.lock.tag', 'DESKTOP ONLY') + '</span>'
            : '';
          return '<div class="fm-tile' + (lk ? ' fm-locked' : '') +
                 '" data-fmgo="' + t[3] + '" data-fmkey="' + t[0] +
                 '" data-fmi18n="' + t[4] + '" role="button" tabindex="0">' + badge + lock +
                 '<span class="ic">' + t[1] + '</span>' +
                 '<span class="lb" data-i18n="' + t[4] + '">' + T(t[4], t[2]) + '</span></div>';
        }).join('') + '</div>';
    }).join('');
    q('.grid').appendChild(more);
    qa('#fmMore .fm-tile').forEach(function (t) {
      t.addEventListener('click', function () { moreGo(t); });
    });
  }

  // Casino lobby, replaces an 11 item horizontal scroller
  var casino = el('casinoTab');
  if (casino && !el('fmCasinoLobby')) {
    var lobby = document.createElement('div');
    lobby.id = 'fmCasinoLobby';
    lobby.innerHTML = '<div class="fm-grid3">' +
      qa('#casinoTabs .subtab').map(function (st) {
        var k = st.dataset.subtab;
        var key = st.getAttribute('data-i18n') || '';
        return '<div class="fm-tile" data-fmgame="' + k + '" role="button" tabindex="0">' +
               '<span class="ic">' + (GAME_ICONS[k] || '\u25C8') + '</span>' +
               '<span class="lb"' + (key ? ' data-i18n="' + key + '"' : '') + '>' +
               (st.textContent || k).trim() + '</span></div>';
      }).join('') + '</div>';
    casino.insertBefore(lobby, casino.firstChild);
    qa('#fmCasinoLobby .fm-tile').forEach(function (t) {
      t.addEventListener('click', function () { openGame(t.dataset.fmgame); });
    });
  }

  // Mining lock notice. Sits directly above LAUNCH EXPEDITION so the reason is
  // next to the thing that will not respond, rather than a toast that has faded
  // by the time the player scrolls down to the button.
  var launch = el('miningLaunchBtn');
  if (TOUCH_ONLY && launch && !el('fmMiningLock')) {
    var note = document.createElement('div');
    note.id = 'fmMiningLock';
    note.innerHTML =
      '<div class="fml-tag" data-i18n="mob.lock.tag">' + T('mob.lock.tag', 'DESKTOP ONLY') + '</div>' +
      '<div class="fml-body" data-i18n="mob.lock.miningLong">' +
      T('mob.lock.miningLong',
        'Drone Mining is a mouse aimed, keyboard flown game. There is no touch control scheme for it yet, so it is disabled on this device. Your bank and the leaderboard below stay live. Launch a run from a desktop browser.') +
      '</div>';
    launch.parentNode.insertBefore(note, launch);
    launch.setAttribute('disabled', 'disabled');
    launch.setAttribute('aria-disabled', 'true');
  }

  return true;
}

function navBtn(v, ic, label, key, badgeId) {
  return '<button type="button" data-fmv="' + v + '">' +
    '<span class="fmn-ic">' + ic + '</span>' +
    (badgeId ? '<span class="fmn-badge" id="' + badgeId + '" style="display:none">0</span>' : '') +
    '<span data-i18n="' + key + '">' + label + '</span></button>';
}

// ═══════════════════════════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dispatch a real click on the desktop tab node. See design rule 2 at the top
 * of this file. Returns false only if the node does not exist.
 */
function clickTab(name) {
  var t = q('.tab[data-tab="' + name + '"]');
  if (!t) return false;
  if (t.classList.contains('active')) return true;
  syncing = true;
  try { t.click(); } finally { syncing = false; }
  return true;
}

function setView(v) {
  state.view = v;
  state.tab = null;
  state.depth = 0;
  state.game = 0;
  state.label = '';
  state.labelKey = '';
  render();
  scrollTop();
}

function openTab(name, label) {
  state.view = 'tab';
  state.tab = name;
  state.depth = 1;
  state.game = 0;
  state.label = label || name;
  state.labelKey = 'mob.tile.' + name;
  render();
  scrollTop();
}

function goBack() {
  if (state.tab === 'casino' && state.game) { state.game = 0; render(); scrollTop(); return; }
  setView('more');
}

function tileLabel(tile) {
  var lb = tile && tile.querySelector('.lb');
  return lb ? lb.textContent.trim() : '';
}

function moreGo(tile) {
  var go = tile.dataset.fmgo, key = tile.dataset.fmkey, label = tileLabel(tile);
  // No toast here on purpose. gToast is inline styled at bottom:24px, which is
  // underneath the 56px nav, so it would be invisible. The reason lives inside
  // the system instead, pinned above its own entry point. See #fmMiningLock.
  if (go === 'tab') { openTab(key, label); return; }
  if (go === 'lore') {
    var b = el('loreBtn');
    if (b) b.click();
    return;
  }
  if (go.indexOf('store:') === 0) {
    openTab('store', label);
    var sub = go.split(':')[1];
    if (window.storeSubTab) { try { window.storeSubTab(sub); } catch (e) {} }
  }
}

function openGame(key) {
  var st = q('#casinoTabs .subtab[data-subtab="' + key + '"]');
  if (st) st.click();
  state.game = 1;
  var lb = q('#fmCasinoLobby .fm-tile[data-fmgame="' + key + '"] .lb');
  state.label = lb ? lb.textContent.trim() : 'Casino';
  state.labelKey = lb ? (lb.getAttribute('data-i18n') || '') : '';
  render();
  scrollTop();
}

function setSeg(v, id) {
  state.seg[v] = id;
  render();
  scrollTop();
}

function scrollTop() {
  var g = q('.grid');
  if (g) g.scrollTop = 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Render
// ═══════════════════════════════════════════════════════════════════════════

var SEGS = {
  board:  [['companies', 'Companies', 'mob.seg.companies'],
           ['news', 'News', 'mob.seg.news'],
           ['heat', 'Heat', 'mob.seg.heat']],
  wallet: [['pnl', 'P&L', 'mob.seg.pnl'],
           ['wire', 'Wire', 'mob.seg.wire'],
           ['ranks', 'Ranks', 'mob.seg.ranks']]
};

function render() {
  if (!active) return;
  var P = panels();
  if (!P) return;

  var v = state.view;
  var segs = SEGS[v] || [];
  var seg = state.seg[v] || (segs.length ? segs[0][0] : null);
  if (segs.length) state.seg[v] = seg;

  var leftGrp = null, centerOn = false, rightGrp = null, fill = false;

  if (v === 'market') {
    centerOn = clickTab('market');
  } else if (v === 'board') {
    if (seg === 'heat') centerOn = clickTab('heat');
    else leftGrp = seg;
  } else if (v === 'chat') {
    rightGrp = 'chat';
    fill = true;
  } else if (v === 'wallet') {
    if (seg === 'pnl') centerOn = clickTab('pnl');
    else rightGrp = seg;
  } else if (v === 'tab') {
    centerOn = clickTab(state.tab);
    if (state.tab === 'galactic') fill = true;
  }

  P.left.classList.toggle('fm-off', leftGrp === null);
  P.center.classList.toggle('fm-off', !centerOn);
  P.right.classList.toggle('fm-off', rightGrp === null);

  qa('#fmLeft [data-fmgrp]').forEach(function (n) {
    n.classList.toggle('fm-hide', leftGrp !== null && n.getAttribute('data-fmgrp') !== leftGrp);
  });
  qa('#rightPanel [data-fmgrp]').forEach(function (n) {
    n.classList.toggle('fm-hide', rightGrp !== null && n.getAttribute('data-fmgrp') !== rightGrp);
  });

  // Wire and Ranks are collapsibles that default to collapsed on desktop.
  // As a whole view they must be open or the screen is a single header.
  if (rightGrp === 'wire' || rightGrp === 'ranks') {
    var sec = el(rightGrp === 'wire' ? 'transferSection' : 'leaderboardCompact');
    if (sec) sec.classList.remove('collapsed');
  }

  body.dataset.fmv = v;
  body.dataset.fmdepth = String(state.depth);
  body.dataset.fmfill = fill ? '1' : '0';
  if (v === 'tab') body.dataset.fmtab = state.tab; else body.removeAttribute('data-fmtab');
  body.dataset.fmgame = String(state.game);

  buildCtx(v, segs, seg);
  paintNav();
  paintTitle();

  // The chart canvas is sized in JS from its own clientWidth. Switching views
  // changes that width, and while Market was hidden drawChart deliberately
  // does nothing (see the offsetParent guard in core.js). A ResizeObserver on
  // the canvas covers the come-back case in Chrome and Safari, but it is the
  // only thing covering it, so nudge explicitly rather than depending on one
  // observer firing for a display change.
  if (centerOn && (v === 'market' || (v === 'board' && seg === 'heat'))) {
    nudgeChart();
  }

  // After the layout settles, not during it: fitBoard measures parentElement
  // clientWidth and the panel it lives in was display:none one frame ago.
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(fitBoards);
  } else {
    setTimeout(fitBoards, 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Casino board fitting
//
// Three boards are laid out in hard pixels and cannot be reflowed from CSS,
// because the pixels are load bearing:
//
//   #chessBoard  360x360, squares absolutely positioned at x*45, y*45 in JS
//   .sol-board   7 columns of minmax(56px,1fr), cards drawn from a sprite
//                sheet whose background-position is computed from the card
//                width, so overriding the width in CSS tears the sprite
//   #ms-board    grid-template-columns written by JS as repeat(cols,28px)
//
// Overriding any of those widths in CSS breaks hit testing or the sprite math.
// Scaling the whole board does neither: every one of these uses real child
// elements with their own listeners, or document.elementFromPoint in the
// solitaire drag case, and the browser maps pointer coordinates through
// transforms for both.
//
// transform alone does not shrink the layout box, so the board would still
// force the pane wide. The negative margins pull the box in to match, which is
// what actually kills the horizontal overflow.
// ═══════════════════════════════════════════════════════════════════════════

var FIT_FLOOR = { msBoard: 0.58 };  // below this a minesweeper cell is untappable

function fitBoard(el, natW, floor) {
  if (!el) return;
  el.style.transform = '';
  el.style.marginRight = '';
  el.style.marginBottom = '';
  if (!el.offsetParent) return;                 // not on screen, nothing to measure
  var host = el.parentElement;
  if (!host) return;
  var nat = natW || el.offsetWidth;
  var natH = el.offsetHeight;
  var avail = host.clientWidth;
  if (!nat || !natH || !avail || avail >= nat) return;
  var k = avail / nat;
  if (floor && k < floor) k = floor;            // let it scroll rather than shrink further
  el.style.transformOrigin = 'top left';
  el.style.transform = 'scale(' + k.toFixed(4) + ')';
  el.style.marginRight = (-(nat * (1 - k))).toFixed(1) + 'px';
  el.style.marginBottom = (-(natH * (1 - k))).toFixed(1) + 'px';
  return k;
}

// The mirror tick alone would leave a board unscaled for up to a second after
// each move. Watch the three panes instead and refit on the next frame.
var FIT_PANES = ['casino-chess', 'casino-solitaire', 'casino-minesweeper'];
var fitPending = false;

function watchFittedPanes() {
  if (typeof window.MutationObserver !== 'function') return;
  FIT_PANES.forEach(function (id) {
    var pane = el(id);
    if (!pane || pane.dataset.fmFitWatched) return;
    pane.dataset.fmFitWatched = '1';
    new window.MutationObserver(function () {
      if (fitPending) return;
      fitPending = true;
      window.requestAnimationFrame(function () { fitPending = false; fitBoards(); });
    }).observe(pane, { childList: true, subtree: true });
  });
}

function fitBoards() {
  if (!active || state.tab !== 'casino' || !state.game) return;
  watchFittedPanes();

  fitBoard(el('chessBoard'), 362, 0);

  // 7 tracks at the 56px minimum plus six 8px gaps. Measuring instead would
  // read the container width, because .sol-board is a block level grid: it is
  // its CONTENT that overflows, not the box.
  var sol = q('.sol-board');
  var solK = fitBoard(sol, 7 * 56 + 6 * 8, 0);
  // The drag ghost is position:fixed and therefore outside the scaled board.
  // Match it or the card jumps size the instant the player picks it up.
  body.style.setProperty('--fm-sol-k', solK ? solK.toFixed(4) : '1');

  // inline-grid, so its own offsetWidth is already the natural width.
  fitBoard(el('ms-board'), 0, FIT_FLOOR.msBoard);
}

function nudgeChart() {
  if (typeof window.requestAnimationFrame !== 'function') return;
  window.requestAnimationFrame(function () {
    try { if (typeof window.drawChart === 'function') window.drawChart(); } catch (e) {}
  });
}

function buildCtx(v, segs, seg) {
  var bar = el('fmCtx');
  if (!bar) return;
  body.dataset.fmctx = segs.length ? '1' : '0';
  body.style.setProperty('--fm-ctx', segs.length ? '34px' : '0px');
  if (!segs.length) { bar.innerHTML = ''; return; }
  bar.innerHTML = '';
  segs.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'fm-seg' + (seg === s[0] ? ' on' : '');
    b.setAttribute('data-i18n', s[2]);
    b.textContent = (window.t ? window.t(s[2], s[1]) : s[1]);
    b.addEventListener('click', function () { setSeg(v, s[0]); });
    bar.appendChild(b);
  });
}

function paintNav() {
  var root = (state.view === 'tab') ? 'more' : state.view;
  qa('#fmNav button').forEach(function (b) {
    b.classList.toggle('on', b.dataset.fmv === root);
  });
}

function paintTitle() {
  var n = el('fmtName');
  if (!n) return;
  if (state.depth === 1) {
    var lbl = state.labelKey ? T(state.labelKey, state.label) : state.label;
    n.textContent = (lbl || '').toUpperCase();
  } else {
    var src = el('fm-header-name');
    n.textContent = src ? src.textContent : '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Mirrors. The top bar reads existing nodes rather than duplicating their
// wiring, so cash, name, portrait and the EOD clock stay authoritative in one
// place and the mobile bar cannot drift from them.
// ═══════════════════════════════════════════════════════════════════════════

function mirror() {
  if (!active) return;

  paintTitle();

  var cash = el('cash'), tc = el('fmtCash');
  if (cash && tc) tc.textContent = (cash.textContent || '').trim();

  var eod = el('eod-timer'), te = el('fmtEod');
  if (eod && te) {
    te.textContent = (eod.textContent || '').trim();
    te.classList.toggle('urgent', eod.classList.contains('urgent'));
  }

  var pt = el('fm-header-portrait'), tp = el('fmtPortrait');
  if (pt && tp) {
    var bg = pt.style.backgroundImage;
    if (bg && bg !== 'none') { tp.style.backgroundImage = bg; tp.textContent = ''; }
  }

  // Chat unread total across every visible channel counter.
  var total = 0;
  qa('#chatTabs .chat-unread').forEach(function (u) {
    if (u.style.display !== 'none') total += (parseInt(u.textContent, 10) || 0);
  });
  var nb = el('fmNavChatBadge');
  if (nb) {
    nb.textContent = total > 99 ? '99+' : String(total);
    nb.style.display = (total > 0 && state.view !== 'chat') ? 'block' : 'none';
  }

  var fb = el('unread-fleshbook'), fbm = el('fmMoreFbBadge');
  if (fb && fbm) {
    var c = parseInt(fb.textContent, 10) || 0;
    fbm.textContent = String(c);
    fbm.style.display = (c > 0 && fb.style.display !== 'none') ? 'block' : 'none';
  }

  // Capital Houses tile is only reachable once the player is in a house,
  // which is the same gate the desktop tab uses.
  var gt = el('guildTabBtn'), gtile = q('#fmMore .fm-tile[data-fmkey="guild"]');
  if (gt && gtile) gtile.style.display = (gt.style.display === 'none') ? 'none' : '';

  // Every one of the three fitted boards rebuilds its own innerHTML on each
  // move, new game and difficulty change, which drops the inline transform.
  // There is no single event to hang this on across three unrelated modules,
  // and fitBoard is a no-op unless the board is on screen AND overflowing, so
  // riding the mirror tick is cheaper than three MutationObservers.
  fitBoards();
}

// ═══════════════════════════════════════════════════════════════════════════
// Drawer
// ═══════════════════════════════════════════════════════════════════════════

function drawer(on) {
  body.classList.toggle('fm-drawer', !!on);
}

// Two more ways out, because the scrim being the only exit is how this became
// a lockup in the first place. A hardware back press or an Escape from a
// bluetooth keyboard should never be the thing that cannot dismiss a menu.
function wireDrawerEscapes() {
  if (window.__fmDrawerEsc) return;
  window.__fmDrawerEsc = true;
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && body.classList.contains('fm-drawer')) {
      drawer(false);
    }
  });
  window.addEventListener('popstate', function () {
    if (body.classList.contains('fm-drawer')) drawer(false);
  });
}

// Any tap inside the drawer that hits an actionable control closes it, so the
// player is not left staring at a menu after firing the thing they wanted.
function wireDrawerAutoClose() {
  var hu = el('fm-header-user');
  if (!hu || hu.dataset.fmDrawer) return;
  hu.dataset.fmDrawer = '1';
  hu.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('button, a, [onclick]')) {
      setTimeout(function () { drawer(false); }, 60);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// showTab bridge. Internal links (a ticker in the news feed, a mover in the
// sound panel, a colony market row) call window.showTab directly. Those must
// move the shell too, or the player taps a link and the panel changes behind a
// view that is still showing something else.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Some controls click a real .tab node directly instead of going through
 * window.showTab. The Bugs button in the drawer is one: its onclick is
 * `document.getElementById('bugsTabBtnHidden').click()`. core.js switches the
 * center panel, mobile.js never hears about it, and if the current view is not
 * a center-panel view then #fmCenter still carries .fm-off, so the player taps
 * Bugs, the drawer closes, and the screen does not change. Indistinguishable
 * from a hang.
 *
 * bridgeShowTab only covers window.showTab. This covers the other path, at the
 * root rather than per button, so any future control that clicks a tab node is
 * covered too.
 */
function bridgeTabClicks() {
  if (window.__fmTabClickBridged) return;
  window.__fmTabClickBridged = true;
  document.addEventListener('click', function (e) {
    if (!active || syncing) return;
    var t = e.target && e.target.closest && e.target.closest('.tab[data-tab]');
    if (!t) return;
    var name = t.getAttribute('data-tab');
    if (!name) return;
    // Let core.js's own listener run first, then follow it.
    setTimeout(function () {
      if (!active) return;
      if (name === 'market') { setView('market'); }
      else if (name === 'heat') { state.seg.board = 'heat'; setView('board'); }
      else if (name === 'pnl') { state.seg.wallet = 'pnl'; setView('wallet'); }
      else if (state.tab !== name) {
        var tile = q('#fmMore .fm-tile[data-fmkey="' + name + '"]');
        openTab(name, tile ? tileLabel(tile) : name);
      }
    }, 0);
  }, true);
}

function bridgeShowTab() {
  if (window.__fmShowTabBridged) return;
  var orig = window.showTab;
  if (typeof orig !== 'function') return;
  window.__fmShowTabBridged = true;
  window.showTab = function (name) {
    orig.apply(this, arguments);
    if (!active || syncing) return;
    if (name === 'market') { setView('market'); }
    else if (name === 'heat') { state.seg.board = 'heat'; setView('board'); }
    else if (name === 'pnl') { state.seg.wallet = 'pnl'; setView('wallet'); }
    else {
      var tile = q('#fmMore .fm-tile[data-fmkey="' + name + '"]');
      openTab(name, tile ? tileLabel(tile) : name);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Soft keyboard. iOS keeps the visual viewport short while the keyboard is up;
// without this the chat input sits under the nav.
// ═══════════════════════════════════════════════════════════════════════════

function watchKeyboard() {
  var vv = window.visualViewport;
  if (!vv) return;
  var base = vv.height;
  vv.addEventListener('resize', function () {
    if (!active) return;
    if (vv.height > base) base = vv.height;
    body.classList.toggle('fm-kbd', (base - vv.height) > 150);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Enter and leave
// ═══════════════════════════════════════════════════════════════════════════

function enter() {
  if (active) return;
  if (!buildChrome()) return;
  active = true;
  body.classList.add('fm-mobile');
  body.classList.toggle('fm-touchonly', TOUCH_ONLY);
  var t = el('fmTop'), n = el('fmNav');
  if (t) t.style.display = '';
  if (n) n.style.display = '';
  wireDrawerAutoClose();
  wireDrawerEscapes();
  bridgeShowTab();
  bridgeTabClicks();
  render();
  mirror();
  if (window.applyI18n) { try { window.applyI18n(); } catch (e) {} }
}

function leave() {
  active = false;
  drawer(false);
  body.classList.remove('fm-mobile', 'fm-kbd', 'fm-touchonly');
  ['data-fmv', 'data-fmctx', 'data-fmdepth', 'data-fmfill', 'data-fmtab', 'data-fmgame']
    .forEach(function (a) { body.removeAttribute(a); });
  body.style.removeProperty('--fm-ctx');
  body.style.removeProperty('--fm-sol-k');
  // The fit transforms are inline, so widening the window past the breakpoint
  // would otherwise leave a permanently shrunk chess board on the desktop
  // layout. Same class of bug as the .fm-off cleanup two lines down.
  ['chessBoard', 'ms-board'].forEach(function (id) {
    var e = el(id);
    if (e) { e.style.transform = ''; e.style.marginRight = ''; e.style.marginBottom = ''; }
  });
  var solb = q('.sol-board');
  if (solb) { solb.style.transform = ''; solb.style.marginRight = ''; solb.style.marginBottom = ''; }
  var t = el('fmTop'), n = el('fmNav');
  if (t) t.style.display = 'none';
  if (n) n.style.display = 'none';
  qa('.fm-off').forEach(function (e) { e.classList.remove('fm-off'); });
  qa('.fm-hide').forEach(function (e) { e.classList.remove('fm-hide'); });
}

function fixViewportHeight() {
  function setVH() {
    document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
  }
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', function () { setTimeout(setVH, 100); });
}

function init() {
  fixViewportHeight();
  watchKeyboard();
  if (isMobile()) enter(); else { buildChrome(); leave(); }
  setInterval(mirror, 1000);

  var last = isMobile();
  window.addEventListener('resize', function () {
    var now = isMobile();
    if (now !== last) {
      last = now;
      if (now) enter(); else leave();
      return;
    }
    // Same side of the breakpoint, but a rotation or a URL bar collapse still
    // changes the width the boards were fitted to.
    fitBoards();
  });
  window.addEventListener('orientationchange', function () { setTimeout(fitBoards, 150); });

  // Public surface for other modules and for tools/mobile-check.mjs.
  window.FM_MOBILE = {
    isActive: function () { return active; },
    view: function () { return state.view; },
    seg: function () { return state.seg[state.view] || null; },
    tab: function () { return state.tab; },
    depth: function () { return state.depth; },
    game: function () { return state.game; },
    setView: setView,
    openTab: openTab,
    setSeg: setSeg,
    openGame: openGame,
    back: goBack,
    drawer: drawer,
    isDrawerOpen: function () { return body.classList.contains('fm-drawer'); },
    touchOnly: function () { return TOUCH_ONLY; },
    locked: function () { return Object.keys(LOCKED); },
    fitBoards: fitBoards
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 300); });
} else {
  setTimeout(init, 300);
}

})();
