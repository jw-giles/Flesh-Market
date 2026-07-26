// assets/cycle-history.js
// Price history browser. Adds a "History" button beside the Watchlist button in the
// Companies panel; clicking it opens an overlay listing all tickers with the start and
// end price of each 30-minute market cycle for the last ~5 months (newest first).
// Data comes from the server price_cycles table via the cycle_history WS message.
// Self-contained: injects its own button and overlay, listens on fm_ws_msg.
(function () {
  'use strict';

  var tickers = [];       // [{symbol, name}]
  var selected = null;    // current symbol
  var overlayBuilt = false;
  var lastCount = 0;

  // Date filter state. Presets are rolling windows from "now"; 'custom' uses the
  // two date inputs (local-day boundaries, matching the local-time rendering below).
  var PRESETS = { '24h': 24 * 3600 * 1000, '7d': 7 * 24 * 3600 * 1000, '30d': 30 * 24 * 3600 * 1000 };
  var range = { preset: '7d' }; // default: last 7 days (~336 cycles), not the full archive

  function dayStartMs(v) {
    if (!v) return null;
    var p = String(v).split('-');
    if (p.length !== 3) return null;
    var t = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0, 0).getTime();
    return isFinite(t) ? t : null;
  }
  function rangeBounds() {
    if (range.preset === 'custom') {
      var f = dayStartMs(range.fromStr);
      var t = dayStartMs(range.toStr);
      if (t != null) t += 86399999; // inclusive end of the picked day
      if (f != null && t != null && f > t) { var tmp = f; f = t - 86399999; t = tmp + 86399999; }
      return { from: f, to: t };
    }
    var w = PRESETS[range.preset];
    return w ? { from: Date.now() - w, to: null } : { from: null, to: null }; // 'all'
  }
  function rangeLabel() {
    if (range.preset === 'custom') {
      var f = range.fromStr || 'start', t = range.toStr || 'now';
      return f + ' to ' + t;
    }
    return { '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days', 'all': 'full archive (~5 months)' }[range.preset] || '';
  }

  function fmtP(x) {
    var n = Number(x);
    if (!isFinite(n)) return '-';
    return 'Ƒ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtT(ms) {
    try {
      return new Date(Number(ms)).toLocaleString(undefined,
        { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (_) { return String(ms); }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function seedTickers() {
    if (tickers.length) return;
    var src = window.TICKERS || window.__companies_g || [];
    if (Array.isArray(src) && src.length) {
      tickers = src.map(function (c) { return { symbol: c.symbol, name: c.name }; });
    }
  }

  // ---- Overlay ----------------------------------------------------------------
  function buildOverlay() {
    if (overlayBuilt) return;
    var ov = document.createElement('div');
    ov.id = 'cyhist-overlay';
    ov.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10050;background:rgba(2,4,6,.72);' +
      'align-items:center;justify-content:center;font-family:inherit';
    ov.innerHTML =
      '<div style="width:min(920px,94vw);height:min(80vh,720px);background:#070505;' +
        'border:1px solid #3a2a08;border-radius:12px;box-shadow:0 10px 50px #000c;display:flex;flex-direction:column;overflow:hidden">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #2a1e06">' +
          '<div><span style="color:var(--amber,#f0b454);letter-spacing:.12em;text-transform:uppercase;font-size:.74rem;font-weight:800">'+(window.t?window.t('cy.title','Cycle Price History'):'Cycle Price History')+'</span>' +
          '<span style="opacity:.6;font-size:.68rem;margin-left:8px">'+(window.t?window.t('cy.subtitle','start / end price per 30-min cycle'):'start / end price per 30-min cycle')+'</span></div>' +
          '<button id="cyhist-close" style="background:none;border:none;color:var(--amber,#f0b454);font-size:1.1rem;cursor:pointer;line-height:1;padding:0 2px">✕</button>' +
        '</div>' +
        '<div id="cyhist-filter" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 14px;border-bottom:1px solid #2a1e06;font-size:.72rem">' +
          '<span style="opacity:.55;text-transform:uppercase;letter-spacing:.08em;font-size:.62rem">'+(window.t?window.t('cy.range','Range'):'Range')+'</span>' +
          '<button class="cyhist-chip" data-preset="24h">24H</button>' +
          '<button class="cyhist-chip" data-preset="7d">7D</button>' +
          '<button class="cyhist-chip" data-preset="30d">30D</button>' +
          '<button class="cyhist-chip" data-preset="all" title="Full retention window (~5 months)">ALL</button>' +
          '<span style="width:1px;height:16px;background:#2a1e06;margin:0 4px"></span>' +
          '<label style="opacity:.7">'+(window.t?window.t('cy.from','From'):'From')+' <input id="cyhist-from" type="date" style="background:#0d0a06;border:1px solid rgba(240,180,84,.3);border-radius:4px;color:#cbb78a;font-family:inherit;font-size:.72rem;padding:2px 4px;color-scheme:dark"/></label>' +
          '<label style="opacity:.7">'+(window.t?window.t('cy.to','To'):'To')+' <input id="cyhist-to" type="date" style="background:#0d0a06;border:1px solid rgba(240,180,84,.3);border-radius:4px;color:#cbb78a;font-family:inherit;font-size:.72rem;padding:2px 4px;color-scheme:dark"/></label>' +
        '</div>' +
        '<div style="display:flex;flex:1;min-height:0">' +
          '<div style="width:240px;min-width:180px;border-right:1px solid #2a1e06;display:flex;flex-direction:column;min-height:0">' +
            '<div style="padding:8px"><input id="cyhist-search" class="input" placeholder="'+(window.t?window.t('cy.searchPh','Search symbol or name'):'Search symbol or name')+'" style="width:100%;font-size:.82rem"/></div>' +
            '<div id="cyhist-list" style="flex:1;min-height:0;overflow:auto;padding:0 4px 8px"></div>' +
          '</div>' +
          '<div id="cyhist-detail" style="flex:1;min-height:0;overflow:auto;padding:12px">' +
            '<div style="opacity:.6;font-size:.82rem">'+(window.t?window.t('cy.selectTicker','Select a ticker to view its cycle history.'):'Select a ticker to view its cycle history.')+'</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) { if (e.target === ov) closeOverlay(); });
    var closeBtn = document.getElementById('cyhist-close');
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    var search = document.getElementById('cyhist-search');
    if (search) search.addEventListener('input', renderList);

    Array.prototype.forEach.call(ov.querySelectorAll('.cyhist-chip'), function (b) {
      b.style.cssText =
        'background:none;border:1px solid rgba(240,180,84,0.3);border-radius:4px;color:#b8893a;' +
        'font-size:.68rem;padding:2px 9px;cursor:pointer;font-family:inherit;transition:all .15s';
      b.addEventListener('click', function () {
        range = { preset: b.getAttribute('data-preset') };
        var f = document.getElementById('cyhist-from'), t = document.getElementById('cyhist-to');
        if (f) f.value = ''; if (t) t.value = '';
        paintChips();
        requestHistory();
      });
    });
    function onDateChange() {
      var f = document.getElementById('cyhist-from'), t = document.getElementById('cyhist-to');
      var fv = f ? f.value : '', tv = t ? t.value : '';
      if (!fv && !tv) { range = { preset: '7d' }; }         // both cleared: back to default
      else { range = { preset: 'custom', fromStr: fv, toStr: tv }; }
      paintChips();
      requestHistory();
    }
    var fi = document.getElementById('cyhist-from');
    var ti = document.getElementById('cyhist-to');
    if (fi) fi.addEventListener('change', onDateChange);
    if (ti) ti.addEventListener('change', onDateChange);

    paintChips();
    overlayBuilt = true;
  }

  function paintChips() {
    var ov = document.getElementById('cyhist-overlay');
    if (!ov) return;
    Array.prototype.forEach.call(ov.querySelectorAll('.cyhist-chip'), function (b) {
      var on = (b.getAttribute('data-preset') === range.preset);
      b.style.background = on ? '#2a1e06' : 'none';
      b.style.color = on ? 'var(--amber,#f0b454)' : '#b8893a';
      b.style.borderColor = on ? '#f0b454' : 'rgba(240,180,84,0.3)';
    });
  }

  function openOverlay() {
    buildOverlay();
    seedTickers();
    var ov = document.getElementById('cyhist-overlay');
    if (ov) ov.style.display = 'flex';
    renderList();
    var s = document.getElementById('cyhist-search');
    if (s) { try { s.focus(); } catch (_) {} }
  }
  function closeOverlay() {
    var ov = document.getElementById('cyhist-overlay');
    if (ov) ov.style.display = 'none';
  }
  function isOpen() {
    var ov = document.getElementById('cyhist-overlay');
    return ov && ov.style.display !== 'none';
  }

  function renderList() {
    var box = document.getElementById('cyhist-list');
    if (!box) return;
    if (!tickers.length) {
      box.innerHTML = '<div style="opacity:.5;font-size:.78rem;padding:8px">Loading tickers...</div>';
      return;
    }
    var q = '';
    var s = document.getElementById('cyhist-search');
    if (s && s.value) q = s.value.trim().toLowerCase();
    var rows = tickers.slice().filter(function (t) {
      if (!q) return true;
      return (t.symbol && t.symbol.toLowerCase().indexOf(q) >= 0) ||
             (t.name && t.name.toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return String(a.symbol).localeCompare(String(b.symbol)); });

    box.innerHTML = rows.map(function (t) {
      var on = (t.symbol === selected);
      return '<div class="cyhist-item" data-sym="' + esc(t.symbol) + '" ' +
        'style="cursor:pointer;padding:5px 8px;border-radius:4px;font-size:.82rem;' +
        (on ? 'background:#2a1e06;color:var(--amber,#f0b454)' : 'color:#cbb78a') + '">' +
        '<b>' + esc(t.symbol) + '</b> <span style="opacity:.6">' + esc(window.tickerNameZh ? window.tickerNameZh(t.name || '') : (t.name || '')) + '</span></div>';
    }).join('') || '<div style="opacity:.5;font-size:.78rem;padding:8px">No match.</div>';

    Array.prototype.forEach.call(box.querySelectorAll('.cyhist-item'), function (el) {
      el.addEventListener('click', function () { selectSymbol(el.getAttribute('data-sym')); });
    });
  }

  function selectSymbol(sym) {
    if (!sym) return;
    selected = sym;
    renderList();
    requestHistory();
  }

  function requestHistory() {
    if (!selected) return;
    var d = document.getElementById('cyhist-detail');
    if (d) d.innerHTML = '<div style="opacity:.6;font-size:.82rem">Loading ' + esc(selected) + ' history...</div>';
    var b = rangeBounds();
    var msg = { type: 'cycle_history', symbol: selected };
    if (b.from != null) msg.from = b.from;
    if (b.to != null) msg.to = b.to;
    try { sendWS(msg); }
    catch (_) {
      try { if (window.ws && window.ws.readyState === 1) window.ws.send(JSON.stringify(msg)); } catch (__) {}
    }
  }

  function renderDetail(data) {
    var d = document.getElementById('cyhist-detail');
    if (!d) return;
    if (!data || data.symbol !== selected) return; // stale response for a different ticker
    var cycles = data.cycles || [];
    if (!cycles.length) {
      var why = (range.preset === 'all')
        ? 'No history yet. This table fills forward from the next 30-minute cycle.'
        : 'No cycles in this range (' + esc(rangeLabel()) + '). Try a wider range or ALL.';
      d.innerHTML = '<div style="font-weight:800;color:var(--amber,#f0b454);margin-bottom:6px">' + esc(data.symbol) + '</div>' +
        '<div style="opacity:.6;font-size:.82rem">' + why + '</div>';
      return;
    }
    var head =
      '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">' +
        '<span style="font-weight:800;color:var(--amber,#f0b454);font-size:1rem">' + esc(data.symbol) + '</span>' +
        '<span style="opacity:.6;font-size:.72rem">' + cycles.length + ' cycles, ' + esc(rangeLabel()) + '</span>' +
      '</div>';
    var body = cycles.map(function (r) {
      var sp = Number(r.s), ep = Number(r.e);
      var pct = (isFinite(sp) && sp !== 0) ? ((ep - sp) / sp * 100) : 0;
      var col = pct > 0 ? '#5fe08a' : (pct < 0 ? '#ff6b6b' : '#9a9a9a');
      var sign = pct > 0 ? '+' : '';
      return '<tr>' +
        '<td style="padding:3px 10px 3px 0;white-space:nowrap;opacity:.8">' + esc(fmtT(r.t)) + '</td>' +
        '<td style="padding:3px 10px 3px 0;text-align:right">' + fmtP(sp) + '</td>' +
        '<td style="padding:3px 10px 3px 0;text-align:right">' + fmtP(ep) + '</td>' +
        '<td style="padding:3px 0;text-align:right;color:' + col + '">' + sign + pct.toFixed(2) + '%</td>' +
      '</tr>';
    }).join('');
    d.innerHTML = head +
      '<table style="width:100%;border-collapse:collapse;font-size:.8rem;font-family:ui-monospace,monospace">' +
        '<thead><tr style="text-align:left;opacity:.55;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em">' +
          '<th style="padding:0 10px 4px 0">Cycle open</th>' +
          '<th style="padding:0 10px 4px 0;text-align:right">Start</th>' +
          '<th style="padding:0 10px 4px 0;text-align:right">End</th>' +
          '<th style="padding:0 0 4px 0;text-align:right">Change</th>' +
        '</tr></thead><tbody>' + body + '</tbody>' +
      '</table>';
  }

  // ---- Button injection into the watchlist bar --------------------------------
  function injectButton() {
    var bar = document.getElementById('watchlist-bar');
    if (!bar) return false;
    if (document.getElementById('cyhistBtn')) return true;
    var b = document.createElement('button');
    b.id = 'cyhistBtn';
    b.title = (window.t?window.t('mp.historyTip','Price history: start and end price per market cycle'):'Price history: start and end price per market cycle');
    b.textContent = '📈 '+(window.t?window.t('mp.history','History'):'History');
    b.style.cssText =
      'background:none;border:1px solid rgba(240,180,84,0.3);border-radius:4px;color:#b8893a;' +
      'font-size:.72rem;padding:3px 10px;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap';
    b.addEventListener('mouseenter', function () { b.style.borderColor = '#f0b454'; b.style.color = '#f0b454'; });
    b.addEventListener('mouseleave', function () { b.style.borderColor = 'rgba(240,180,84,0.3)'; b.style.color = '#b8893a'; });
    b.addEventListener('click', openOverlay);
    var count = document.getElementById('wlCount');
    if (count) bar.insertBefore(b, count); else bar.appendChild(b);
    return true;
  }

  // The watchlist bar is built by market-tools.js after load; poll briefly for it.
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (injectButton() || tries > 40) clearInterval(iv);
  }, 250);

  // ---- WS wiring --------------------------------------------------------------
  document.addEventListener('fm_ws_msg', function (e) {
    var m = e && e.detail;
    if (!m) return;
    if (m.type === 'cycle_history' && m.data) { renderDetail(m.data); return; }
    if (m.data && Array.isArray(m.data.companies) && m.data.companies.length) {
      var incoming = m.data.companies;
      if (incoming.length >= tickers.length) {
        tickers = incoming.map(function (c) { return { symbol: c.symbol, name: c.name }; });
        if (isOpen() && tickers.length !== lastCount) { lastCount = tickers.length; renderList(); }
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) closeOverlay();
  });
})();
