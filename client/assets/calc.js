// ═══════════════════════════════════════════════════════════════════════════════
// FMCalc — pixel-art trader's calculator (sits under the Ship Cargo console)
// Uses the provided key sprites (assets/calc/buttons/buttons_NN.png) with a CSS
// body/screen matched to the art palette. Plain arithmetic; mouse/touch only so it
// never steals keystrokes from the commodity search field next to it.
// Mount: window.FMCalc.mount(containerEl). State persists across re-mounts.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var S = { cur: '', acc: null, op: null, overwrite: false };

  // [action, sprite file number] in display order (matches the asset layout)
  var LAYOUT = [
    ['clr', 21], ['del', 22], ['sqrt', 26], ['div', 18],
    ['d7', 10], ['d8', 11], ['d9', 12], ['sub', 16],
    ['d4', 7],  ['d5', 8],  ['d6', 9],  ['add', 15],
    ['d1', 4],  ['d2', 5],  ['d3', 6],  ['mul', 17],
    ['pm', 20], ['d0', 13], ['dot', 2], ['eq', 14],
  ];

  function fmt(n) {
    if (!isFinite(n)) return 'ERR';
    var s = (Math.round(n * 1e9) / 1e9).toString();
    if (s.replace('-', '').replace('.', '').length > 14) {
      s = Number(n.toPrecision(10)).toString();
    }
    return s;
  }
  function dispVal() {
    if (S.cur !== '') return S.cur;
    if (S.acc !== null) return fmt(S.acc);
    return '0';
  }
  function curNum() { return S.cur !== '' ? Number(S.cur) : (S.acc !== null ? S.acc : 0); }
  function apply(a, o, b) {
    a = Number(a) || 0;
    if (o === '+') return a + b;
    if (o === '-') return a - b;
    if (o === '*') return a * b;
    if (o === '/') return b === 0 ? NaN : a / b;
    return b;
  }
  function inputDigit(d) {
    if (S.overwrite) { S.cur = d; S.overwrite = false; }
    else if (S.cur === '0') S.cur = d;
    else S.cur += d;
    if (S.cur.replace('-', '').replace('.', '').length > 14) S.cur = S.cur.slice(0, -1);
  }
  function inputDot() {
    if (S.overwrite) { S.cur = '0.'; S.overwrite = false; return; }
    if (S.cur === '') S.cur = '0.';
    else if (S.cur.indexOf('.') < 0) S.cur += '.';
  }
  function setOp(o) {
    if (S.op !== null && S.cur !== '') S.acc = apply(S.acc, S.op, Number(S.cur));
    else if (S.cur !== '') S.acc = Number(S.cur);
    else if (S.acc === null) S.acc = 0;
    S.op = o; S.cur = ''; S.overwrite = false;
  }
  function equals() {
    if (S.op !== null) {
      var x = S.cur !== '' ? Number(S.cur) : (S.acc !== null ? S.acc : 0);
      S.acc = apply(S.acc !== null ? S.acc : 0, S.op, x);
      S.op = null; S.cur = ''; S.overwrite = true;
    } else if (S.cur !== '') { S.acc = Number(S.cur); S.cur = ''; S.overwrite = true; }
  }
  function unary(fn) { S.acc = fn(curNum()); S.cur = ''; S.op = null; S.overwrite = true; }
  function plusminus() {
    if (S.cur !== '') S.cur = S.cur.charAt(0) === '-' ? S.cur.slice(1) : '-' + S.cur;
    else if (S.acc !== null) S.acc = -S.acc;
  }
  function clearAll() { S.cur = ''; S.acc = null; S.op = null; S.overwrite = false; }
  function del() { if (S.cur !== '') S.cur = S.cur.slice(0, -1); }

  function handle(k) {
    if (S.acc !== null && !isFinite(S.acc) && k !== 'clr' && k !== 'del') return; // ERR locks until C
    if (k.charAt(0) === 'd' && k.length === 2 && k >= 'd0' && k <= 'd9') return inputDigit(k.charAt(1));
    if (k === 'dot') return inputDot();
    if (k === 'add') return setOp('+');
    if (k === 'sub') return setOp('-');
    if (k === 'mul') return setOp('*');
    if (k === 'div') return setOp('/');
    if (k === 'eq') return equals();
    if (k === 'sqrt') return unary(Math.sqrt);
    if (k === 'pm') return plusminus();
    if (k === 'clr') return clearAll();
    if (k === 'del') return del();
  }

  function injectStyleOnce() {
    if (document.getElementById('fmcalc-style')) return;
    var st = document.createElement('style');
    st.id = 'fmcalc-style';
    st.textContent =
      '.fmcalc-body{display:inline-block;background:#736fa1;border:2px solid #4b4173;border-radius:6px;padding:10px;box-shadow:0 3px 0 #00000055;user-select:none}' +
      '.fmcalc-screen{background:#2e2747;border:2px solid #4b4173;border-radius:3px;color:#ffe1c4;' +
      "font:1.05rem/1 'IBM Plex Mono',ui-monospace,monospace;text-align:right;padding:9px 10px;margin-bottom:8px;min-height:18px;overflow:hidden;letter-spacing:.04em;text-shadow:none}" +
      '.fmcalc-grid{display:grid;grid-template-columns:repeat(4,38px);gap:5px}' +
      '.fmcalc-key{width:38px;height:38px;border:0;padding:0;background:transparent center/contain no-repeat;image-rendering:pixelated;cursor:pointer;display:block}' +
      '.fmcalc-key:active{transform:translateY(1px)}' +
      '.fmcalc-cap{color:#d7d2ee;font-size:.6rem;letter-spacing:.18em;margin:0 0 6px 2px;text-transform:uppercase;text-shadow:none}';
    document.head.appendChild(st);
  }

  function keysHtml() {
    return LAYOUT.map(function (k) {
      var n = ('0' + k[1]).slice(-2);
      return '<button class="fmcalc-key" data-k="' + k[0] + '" style="background-image:url(assets/calc/buttons/buttons_' + n + '.png)"></button>';
    }).join('');
  }

  window.FMCalc = {
    mount: function (el) {
      if (!el) return;
      injectStyleOnce();
      el.innerHTML = '<div class="fmcalc-body"><div class="fmcalc-cap">Calc</div>' +
        '<div class="fmcalc-screen" id="fmcalc-screen">0</div>' +
        '<div class="fmcalc-grid">' + keysHtml() + '</div></div>';
      var screen = el.querySelector('#fmcalc-screen');
      screen.textContent = dispVal();
      el.querySelector('.fmcalc-grid').addEventListener('click', function (e) {
        var b = e.target.closest('.fmcalc-key');
        if (!b) return;
        handle(b.dataset.k);
        screen.textContent = dispVal();
      });
    }
  };
})();
