// assets/index-browser.js
// Index browser. Adds an "Index Funds" button beside the History button in the Companies
// panel; clicking it opens an overlay listing every Capital House that has listed its
// NAV-per-share as a tradeable ticker. Each row shows price, NAV/share, premium or
// discount to NAV, float, and manager, and clicks through to the normal chart (fund
// tickers are real entries on the tape). Data comes from the server index_listings
// WS message. Self-contained: injects its own button and overlay, listens on fm_ws_msg.
(function () {
  'use strict';

  var listings = [];
  var overlayBuilt = false;

  function fmtP(x) {
    var n = Number(x);
    if (!isFinite(n)) return '-';
    return 'Ƒ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtN(x) {
    var n = Number(x);
    if (!isFinite(n)) return '-';
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function requestListings() {
    var msg = { type: 'index_listings' };
    try { sendWS(msg); }
    catch (_) {
      try { if (window.ws && window.ws.readyState === 1) window.ws.send(JSON.stringify(msg)); } catch (__) {}
    }
  }

  // ---- Overlay ----------------------------------------------------------------
  function buildOverlay() {
    if (overlayBuilt) return;
    var ov = document.createElement('div');
    ov.id = 'idx-overlay';
    ov.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10050;background:rgba(2,4,6,.72);' +
      'align-items:center;justify-content:center;font-family:inherit';
    ov.innerHTML =
      '<div style="width:min(860px,94vw);height:min(78vh,680px);background:#070505;' +
        'border:1px solid #3a2a08;border-radius:12px;box-shadow:0 10px 50px #000c;display:flex;flex-direction:column;overflow:hidden">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #2a1e06">' +
          '<div><span style="color:var(--amber,#f0b454);letter-spacing:.12em;text-transform:uppercase;font-size:.74rem;font-weight:800">Index Funds</span>' +
          '<span style="opacity:.6;font-size:.68rem;margin-left:8px">player-run funds trading as tickers, priced off NAV per share</span></div>' +
          '<button id="idx-close" style="background:none;border:none;color:var(--amber,#f0b454);font-size:1.1rem;cursor:pointer;line-height:1;padding:0 2px">✕</button>' +
        '</div>' +
        '<div id="idx-body" style="flex:1;min-height:0;overflow:auto;padding:12px">' +
          '<div style="opacity:.6;font-size:.82rem">Loading listings...</div>' +
        '</div>' +
        '<div style="padding:7px 14px;border-top:1px solid #2a1e06;font-size:.66rem;opacity:.5">' +
          'Premium/discount is the tape price versus book value (NAV per share). Fund tickers cannot be shorted.' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) { if (e.target === ov) closeOverlay(); });
    var closeBtn = document.getElementById('idx-close');
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    overlayBuilt = true;
  }

  function openOverlay() {
    buildOverlay();
    var ov = document.getElementById('idx-overlay');
    if (ov) ov.style.display = 'flex';
    render();
    requestListings();
  }
  function closeOverlay() {
    var ov = document.getElementById('idx-overlay');
    if (ov) ov.style.display = 'none';
  }
  function isOpen() {
    var ov = document.getElementById('idx-overlay');
    return ov && ov.style.display !== 'none';
  }

  function render() {
    var box = document.getElementById('idx-body');
    if (!box) return;
    if (!listings.length) {
      box.innerHTML = '<div style="opacity:.6;font-size:.82rem">No houses are listed on the Index yet. ' +
        'A Capital House with a NAV above the threshold can list from its owner panel.</div>';
      return;
    }
    var rows = listings.slice().sort(function (a, b) { return (b.nav || 0) - (a.nav || 0); });
    var head =
      '<table style="width:100%;border-collapse:collapse;font-size:.8rem;font-family:ui-monospace,monospace">' +
        '<thead><tr style="text-align:left;opacity:.55;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em">' +
          '<th style="padding:0 10px 5px 0">Ticker</th>' +
          '<th style="padding:0 10px 5px 0">House</th>' +
          '<th style="padding:0 10px 5px 0;text-align:right">Price</th>' +
          '<th style="padding:0 10px 5px 0;text-align:right">NAV/sh</th>' +
          '<th style="padding:0 10px 5px 0;text-align:right">Prem/Disc</th>' +
          '<th style="padding:0 10px 5px 0;text-align:right">Float</th>' +
          '<th style="padding:0 0 5px 0">Manager</th>' +
        '</tr></thead><tbody>';
    var body = rows.map(function (r) {
      var prem = Number(r.premiumPct);
      var pcol = prem > 0 ? '#5fe08a' : (prem < 0 ? '#ff6b6b' : '#9a9a9a');
      var psign = prem > 0 ? '+' : '';
      return '<tr class="idx-row" data-sym="' + esc(r.symbol) + '" ' +
        'style="cursor:pointer;border-top:1px solid #1a1206">' +
        '<td style="padding:5px 10px 5px 0"><b style="color:var(--amber,#f0b454)">' + esc(r.symbol) + '</b></td>' +
        '<td style="padding:5px 10px 5px 0">' + esc(r.name) + '</td>' +
        '<td style="padding:5px 10px 5px 0;text-align:right">' + fmtP(r.price) + '</td>' +
        '<td style="padding:5px 10px 5px 0;text-align:right;opacity:.85">' + (r.navPerShare != null ? fmtP(r.navPerShare) : '-') + '</td>' +
        '<td style="padding:5px 10px 5px 0;text-align:right;color:' + pcol + '">' + psign + (isFinite(prem) ? prem.toFixed(2) : '0.00') + '%</td>' +
        '<td style="padding:5px 10px 5px 0;text-align:right;opacity:.7">' + fmtN(r.floatShares) + '</td>' +
        '<td style="padding:5px 0;opacity:.75">' + esc(r.manager) + '</td>' +
      '</tr>';
    }).join('');
    box.innerHTML = head + body + '</tbody></table>';

    Array.prototype.forEach.call(box.querySelectorAll('.idx-row'), function (el) {
      el.addEventListener('mouseenter', function () { el.style.background = '#140f04'; });
      el.addEventListener('mouseleave', function () { el.style.background = 'transparent'; });
      el.addEventListener('click', function () {
        var sym = el.getAttribute('data-sym');
        if (sym && typeof window.FMGotoSymbol === 'function') { window.FMGotoSymbol(sym); closeOverlay(); }
      });
    });
  }

  // ---- Button injection into the watchlist bar --------------------------------
  function injectButton() {
    var bar = document.getElementById('watchlist-bar');
    if (!bar) return false;
    if (document.getElementById('idxBtn')) return true;
    var b = document.createElement('button');
    b.id = 'idxBtn';
    b.title = 'Index Funds: player-run houses trading as tickers';
    b.textContent = 'Index Funds';
    b.style.cssText =
      'background:none;border:1px solid rgba(240,180,84,0.3);border-radius:4px;color:#b8893a;' +
      'font-size:.72rem;padding:3px 10px;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap';
    b.addEventListener('mouseenter', function () { b.style.borderColor = '#f0b454'; b.style.color = '#f0b454'; });
    b.addEventListener('mouseleave', function () { b.style.borderColor = 'rgba(240,180,84,0.3)'; b.style.color = '#b8893a'; });
    b.addEventListener('click', openOverlay);
    // Place it right after the History button if present, else after the count.
    var hist = document.getElementById('cyhistBtn');
    if (hist && hist.parentNode === bar) { bar.insertBefore(b, hist.nextSibling); }
    else {
      var count = document.getElementById('wlCount');
      if (count) bar.insertBefore(b, count); else bar.appendChild(b);
    }
    return true;
  }

  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (injectButton() || tries > 40) clearInterval(iv);
  }, 250);

  // ---- WS wiring --------------------------------------------------------------
  document.addEventListener('fm_ws_msg', function (e) {
    var m = e && e.detail;
    if (!m) return;
    if (m.type === 'index_listings' && m.data && Array.isArray(m.data.listings)) {
      listings = m.data.listings;
      if (isOpen()) render();
      return;
    }
    // Live-refresh the open browser when a listing/delisting happens.
    if ((m.type === 'index_listed' || m.type === 'index_delisted') && isOpen()) {
      requestListings();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) closeOverlay();
  });
})();
