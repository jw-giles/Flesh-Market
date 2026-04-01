
(function(){
'use strict';

// ── Sound System ─────────────────────────────────────────────────────────────
const SECTOR_NAMES = window.V5_SECTOR_NAMES = ['Finance','Biotech','Insurance','Manufacturing','Energy','Logistics','Tech','Misc'];
let _soundOn = false;
let _audioCtx = null;

// ── Chat font size accessibility ──────────────────────────────────────────────
(function initChatFont() {
  const STORAGE_KEY = 'fm_chat_font_pct';
  const STEPS = [70, 80, 90, 100, 110, 120, 130];

  function applySize(pct) {
    const box = document.getElementById('chatBox');
    if (box) box.style.setProperty('--chat-font-scale', pct / 100);
    localStorage.setItem(STORAGE_KEY, pct);
  }

  const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '100', 10);
  let current = STEPS.includes(saved) ? saved : 100;
  applySize(current);

  document.getElementById('chatFontDec')?.addEventListener('click', function() {
    const idx = STEPS.indexOf(current);
    if (idx > 0) { current = STEPS[idx - 1]; applySize(current); }
  });
  document.getElementById('chatFontInc')?.addEventListener('click', function() {
    const idx = STEPS.indexOf(current);
    if (idx < STEPS.length - 1) { current = STEPS[idx + 1]; applySize(current); }
  });
})();

window.toggleSound = function() {
  _soundOn = !_soundOn;
  const btn = document.getElementById('soundToggle');
  if (btn) { btn.textContent = _soundOn ? '🔊 Sound' : '🔇 Sound'; btn.className = _soundOn ? 'on' : ''; }
};

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

window.playSound = function(type) {
  if (!_soundOn) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'buy') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(660, now + 0.1);
      gain.gain.setValueAtTime(0.15, now); gain.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'sell') {
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.linearRampToValueAtTime(330, now + 0.12);
      gain.gain.setValueAtTime(0.15, now); gain.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'fill') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.linearRampToValueAtTime(1100, now + 0.05);
      gain.gain.setValueAtTime(0.12, now); gain.gain.linearRampToValueAtTime(0, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
      [0, 0.08, 0.16].forEach((t, i) => {
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.type = 'triangle';
        o2.frequency.setValueAtTime([523, 659, 784][i], now + t);
        g2.gain.setValueAtTime(0.12, now + t); g2.gain.linearRampToValueAtTime(0, now + t + 0.12);
        o2.start(now + t); o2.stop(now + t + 0.12);
      });
    }
  } catch(e) {}
};

// ── Toast System ─────────────────────────────────────────────────────────────
window.showToast = function(text, color) {
  const area = document.getElementById('toastArea'); if (!area) return;
  const div = document.createElement('div');
  div.className = 'v5toast';
  div.textContent = text;
  div.style.borderColor = color || '#ffb547';
  div.style.color = color || '#ffb547';
  area.appendChild(div);
  requestAnimationFrame(() => { div.classList.add('show'); });
  setTimeout(() => {
    div.classList.remove('show');
    setTimeout(() => div.remove(), 300);
  }, 3500);
};

// ── Trade Feed ─────────────────────────────────────────────────────────────
const TRADE_FEED_MAX = 40;
window.renderTradeFeed = function(d) {
  const panel = document.getElementById('tradeFeedPanel'); if (!panel) return;
  const row = document.createElement('div');
  const side = d.side === 'buy' ? 'BUY' : 'SELL';
  const cls = d.side === 'buy' ? 'tf-buy' : 'tf-sell';
  const tag = d.isLimit ? '[L]' : '';
  row.className = 'tf-row ' + cls;
  row.textContent = `${side} ${d.qty}× ${d.symbol} @ Ƒ${d.price.toFixed(2)} ${tag}`;
  panel.insertBefore(row, panel.firstChild);
  // Trim
  while (panel.children.length > TRADE_FEED_MAX) panel.removeChild(panel.lastChild);
};

// Trade feed is positioned in marketTab after XP bar (no injection needed)

// ── Heatmap ───────────────────────────────────────────────────────────────────

// Lore names — ordered to match server SECTOR_NAMES indices
// (0=Finance,1=Biotech,2=Insurance,3=Manufacturing,4=Energy,5=Logistics,6=Tech,7=Misc)
const HEAT_SECTOR_LORE = [
  { name: 'The Capital Syndicate',    sub: 'Banking, lending & exchange houses'         },
  { name: 'Flesh & Gene Corps',       sub: 'Biomedical, pharma & augmentation firms'    },
  { name: 'The Indemnity Brokers',    sub: 'Risk underwriters & liability cartels'      },
  { name: 'The Iron Foundries',       sub: 'Heavy manufacturing & industrial output'    },
  { name: 'Power Cartels',            sub: 'Fuel, grid operators & energy monopolies'   },
  { name: 'The Transit Guild',        sub: 'Freight, shipping & supply infrastructure'  },
  { name: 'Neural Networks Inc.',     sub: 'Software, hardware & data brokers'          },
  { name: 'The Gray Bazaar',          sub: 'Unlisted, unclassified & shadow ventures'   },
];

const _heatCollapsed = {};

// Color ramp: smooth green → neutral → red based on pct
function _heatColor(pct) {
  const abs = Math.abs(pct);
  const t = Math.min(1, abs / 15); // saturate at ±15% (beta model daily range)
  if (pct > 1.0) {
    // Green ramp: dark → bright
    const r = Math.round(10 - 10 * t);
    const g = Math.round(50 + 180 * t);
    const b = Math.round(15 + 20 * t);
    return { bg: `rgb(${r},${g},${b})`, text: t > 0.3 ? '#c8ffc0' : '#8aba80' };
  } else if (pct < -1.0) {
    // Red ramp: dark → bright
    const r = Math.round(50 + 170 * t);
    const g = Math.round(15 - 10 * t);
    const b = Math.round(15 - 5 * t);
    return { bg: `rgb(${r},${g},${b})`, text: t > 0.3 ? '#ffc8c0' : '#ba8a80' };
  }
  // Neutral band (±1%) — subtle warm/cool lean
  if (pct > 0.15) return { bg: `rgb(18,${Math.round(25+pct*8)},18)`, text: '#8a9a78' };
  if (pct < -0.15) return { bg: `rgb(${Math.round(25+abs*8)},16,16)`, text: '#9a7878' };
  return { bg: '#1a1a18', text: '#666' };
}

function _makeHeatCell(t) {
  const pct = t.pct != null ? t.pct : 0;
  const price = t.price != null ? t.price : 0;
  const { bg, text } = _heatColor(pct);
  const sign = pct > 0 ? '+' : '';
  const priceStr = price >= 1000 ? (price / 1000).toFixed(1) + 'k' : price.toFixed(2);

  const cell = document.createElement('div');
  cell.className = 'hc';
  cell.style.background = bg;
  cell.style.color = text;
  cell.innerHTML = `<div class="hs">${t.symbol}</div><div class="hp">${sign}${Math.abs(pct)>=10?pct.toFixed(1):pct.toFixed(2)}%</div><div class="hpr">Ƒ${priceStr}</div>`;

  const lore = HEAT_SECTOR_LORE[t.sector] || {};
  cell.title = `${t.name || t.symbol}\nƑ${price.toFixed(2)}  ${sign}${pct.toFixed(2)}%\nSector: ${lore.name || ''}\nClick to open chart`;

  cell.addEventListener('click', () => {
    try {
      const symEl = document.getElementById('sym');
      if (symEl) symEl.value = t.symbol;
      window.CURRENT = t.symbol;
      if (typeof sendWS === 'function') sendWS({ type: 'chart', symbol: t.symbol });
      if (typeof showTab === 'function') { showTab('market'); }
      else { const mktTab = document.querySelector('[data-tab="market"]'); if (mktTab) mktTab.click(); }
      try { document.querySelector('.panel #chart')?.scrollIntoView({behavior:'smooth', block:'nearest'}); } catch(_) {}
    } catch(e) {}
  });
  return cell;
}

// Build a mini distribution bar showing the spread of + and - within a sector
function _makeDistBar(stocks) {
  const sorted = stocks.map(t => t.pct || 0).sort((a, b) => b - a);
  const bar = document.createElement('div');
  bar.className = 'heat-dist';
  for (const pct of sorted) {
    const pip = document.createElement('span');
    pip.className = 'heat-pip';
    pip.style.background = _heatColor(pct).bg;
    bar.appendChild(pip);
  }
  return bar;
}

window.refreshHeatmap = function() {
  const grid = document.getElementById('heatGrid'); if (!grid) return;
  const tab = document.getElementById('heatTab');
  const tickers = window.TICKERS || [];
  if (!tickers.length) return;
  if (!tab || tab.style.display === 'none') return;

  const bySector = {};
  for (const t of tickers) {
    if (t.symbol === 'FLSH') continue;
    const sid = t.sector != null ? t.sector : 7;
    if (!bySector[sid]) bySector[sid] = [];
    bySector[sid].push(t);
  }

  const scrollTop = tab.scrollTop;
  grid.innerHTML = '';

  const sectorIds = Object.keys(bySector).map(Number).sort((a, b) => a - b);
  for (const sid of sectorIds) {
    try {
      // Sort stocks: biggest gainers first, biggest losers last
      const stocks = bySector[sid].sort((a, b) => (b.pct || 0) - (a.pct || 0));
      const lore = HEAT_SECTOR_LORE[sid] || { name: `Sector ${sid}`, sub: '' };
      const isCollapsed = !!_heatCollapsed[sid];

      // Stats
      const avgPct = stocks.reduce((s, t) => s + (t.pct || 0), 0) / stocks.length;
      const up = stocks.filter(t => (t.pct || 0) > 1.0).length;
      const dn = stocks.filter(t => (t.pct || 0) < -1.0).length;
      const flat = stocks.length - up - dn;
      const best = stocks[0];
      const worst = stocks[stocks.length - 1];
      const avgSign = avgPct >= 0 ? '+' : '';
      const avgCol = _heatColor(avgPct);
      const avgStr = Math.abs(avgPct) >= 10 ? avgPct.toFixed(1) : avgPct.toFixed(2);

      const block = document.createElement('div');
      block.className = 'heat-sector';

      // ── Header ──
      const hdr = document.createElement('div');
      hdr.className = 'heat-hdr';
      hdr.innerHTML = `
        <span class="heat-caret" style="transform:rotate(${isCollapsed ? '-90deg' : '0deg'})">▾</span>
        <div class="heat-hdr-info">
          <div class="heat-hdr-top">
            <span class="heat-name">${lore.name}</span>
            <span class="heat-avg" style="color:${avgCol.text}">${avgSign}${avgStr}%</span>
          </div>
          <div class="heat-hdr-bot">
            <span class="heat-sub">${lore.sub}</span>
            <span class="heat-counts"><span style="color:#6c6">▲${up}</span> <span style="color:#888">—${flat}</span> <span style="color:#c66">▼${dn}</span></span>
          </div>
        </div>
      `;

      // ── Distribution bar ──
      const distRow = document.createElement('div');
      distRow.className = 'heat-dist-row';
      distRow.style.display = isCollapsed ? 'none' : '';
      distRow.appendChild(_makeDistBar(stocks));

      // ── Top mover callouts ──
      const movers = document.createElement('div');
      movers.className = 'heat-movers';
      movers.style.display = isCollapsed ? 'none' : '';
      if (best && (best.pct || 0) > 0.1) {
        const bp = best.pct || 0;
        movers.innerHTML += `<span class="heat-mover-up" title="Click to view ${best.symbol}"
          onclick="try{document.getElementById('sym').value='${best.symbol}';window.CURRENT='${best.symbol}';sendWS({type:'chart',symbol:'${best.symbol}'});showTab('market');}catch(e){}">
          ▲ ${best.symbol} +${bp.toFixed(2)}%</span>`;
      }
      if (worst && (worst.pct || 0) < -0.1) {
        const wp = worst.pct || 0;
        movers.innerHTML += `<span class="heat-mover-dn" title="Click to view ${worst.symbol}"
          onclick="try{document.getElementById('sym').value='${worst.symbol}';window.CURRENT='${worst.symbol}';sendWS({type:'chart',symbol:'${worst.symbol}'});showTab('market');}catch(e){}">
          ▼ ${worst.symbol} ${wp.toFixed(2)}%</span>`;
      }

      // ── Cell grid ──
      const subGrid = document.createElement('div');
      subGrid.className = 'heat-grid';
      subGrid.style.cssText = isCollapsed
        ? 'display:none;'
        : 'display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:3px;padding:5px 6px 6px;';
      for (const t of stocks) { try { subGrid.appendChild(_makeHeatCell(t)); } catch (_) {} }

      // ── Collapse toggle ──
      hdr.addEventListener('click', () => {
        _heatCollapsed[sid] = !_heatCollapsed[sid];
        const c = _heatCollapsed[sid];
        subGrid.style.display = c ? 'none' : 'grid';
        distRow.style.display = c ? 'none' : '';
        movers.style.display = c ? 'none' : '';
        const caret = hdr.querySelector('.heat-caret');
        if (caret) caret.style.transform = `rotate(${c ? '-90deg' : '0deg'})`;
      });

      block.appendChild(hdr);
      block.appendChild(distRow);
      block.appendChild(movers);
      block.appendChild(subGrid);
      grid.appendChild(block);
    } catch (e) { console.warn('[Heatmap] Sector', sid, 'error:', e); }
  }

  tab.scrollTop = scrollTop;
};

// Refresh heatmap when clicking the tab
document.addEventListener('click', function(e) {
  if (e.target && e.target.getAttribute && e.target.getAttribute('data-tab') === 'heat') {
    setTimeout(refreshHeatmap, 60);
  }
});


// ── Limit Order Panel ─────────────────────────────────────────────────────────
window.renderOpenOrders = function(orders) {
  const box = document.getElementById('openOrders'); if (!box) return;
  if (!orders || !orders.length) { box.innerHTML = '<span style="opacity:.4">No open orders</span>'; return; }
  box.innerHTML = '';
  for (const o of orders) {
    const row = document.createElement('div');
    row.className = 'oo-row';
    const cls = o.side === 'buy' ? 'oo-buy' : 'oo-sell';
    const expiry = Math.max(0, Math.round((o.ts + 86400000 - Date.now()) / 3600000));
    row.innerHTML = `<span class="${cls}">${o.side.toUpperCase()}</span><span>${o.qty}×</span><span>${o.symbol}</span><span>@ Ƒ${o.limitPrice.toFixed(2)}</span><span style="opacity:.45;font-size:.7rem">~${expiry}h</span><span class="oo-cancel" data-oid="${o.id}" title="Cancel">✕</span>`;
    box.appendChild(row);
  }
  box.querySelectorAll('.oo-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof sendWS === 'function') sendWS({ type: 'cancel_limit', orderId: btn.dataset.oid });
    });
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const placeBtn = document.getElementById('limitPlaceBtn');
  if (placeBtn) {
    placeBtn.addEventListener('click', () => {
      const side = document.getElementById('limitSide')?.value || 'buy';
      const sym  = (document.getElementById('limitSym')?.value || '').toUpperCase();
      const qty  = parseInt(document.getElementById('limitQty')?.value || '0');
      const lp   = parseFloat(document.getElementById('limitPrice')?.value || '0');
      const hint = document.getElementById('limitHint');
      if (!sym || !qty || !lp) { if (hint) hint.textContent = 'Fill all fields.'; return; }

      // ── Day-trade check (server-authoritative, client shows early warning) ──
      try {
        const left = typeof window._dtServerRemaining === 'number' ? window._dtServerRemaining : 3;
        if (left <= 0) {
          try{ showToast('❌ Day-trade limit reached (3). Cannot place limit order.', '#ff6a6a'); }catch(e){ alert('Day-trade limit reached (3).'); }
          return;
        }
      } catch(e) {}
      // ─────────────────────────────────────────────────────────────────────

      if (typeof sendWS === 'function') sendWS({ type: 'limit_order', side, symbol: sym, shares: qty, limitPrice: lp });
      if (hint) hint.textContent = `${side.toUpperCase()} limit placed ✓`;
      setTimeout(() => { if (hint) hint.textContent = ''; }, 2000);
      playSound('buy');
    });
  }
  // Populate limitSym from main sym input when it changes
  const symInput = document.getElementById('sym');
  if (symInput) {
    symInput.addEventListener('change', () => {
      const li = document.getElementById('limitSym');
      if (li) li.value = symInput.value.toUpperCase();
    });
  }
});

// ── Sector Breakdown ──────────────────────────────────────────────────────────
window.renderSectorBreakdown = function(breakdown, totalEquity) {
  const bars = document.getElementById('sectorBars'); if (!bars) return;
  if (!breakdown || !totalEquity || totalEquity <= 0) { bars.innerHTML = '<span style="opacity:.3;font-size:.75rem">No positions</span>'; return; }
  const sorted = Object.entries(breakdown).sort((a,b) => b[1]-a[1]);
  bars.innerHTML = '';
  for (const [name, val] of sorted) {
    const pct = Math.min(100, (val / totalEquity) * 100);
    const row = document.createElement('div');
    row.className = 'sb-row';
    row.innerHTML = `<div class="sb-name">${name}</div><div class="sb-bg"><div class="sb-fill" style="width:${pct.toFixed(1)}%"></div></div><div class="sb-val">Ƒ${Math.round(val).toLocaleString()}</div>`;
    bars.appendChild(row);
  }
};

// ── Short Modal wiring ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const shortBtn = document.getElementById('shortBtn');
  if (shortBtn) {
    shortBtn.addEventListener('click', () => {
      const sym = (document.getElementById('sym')?.value || '').toUpperCase();
      if (window.__ShortModal) window.__ShortModal.open(sym || '');
    });
  }

  // Transfer feedback
  const xferBtn = document.getElementById('xfer');
  if (xferBtn) {
    xferBtn.addEventListener('click', () => {
      const toName = document.getElementById('toName')?.value?.trim();
      const amt = parseFloat(document.getElementById('amt')?.value || '0');
      if (!toName || !amt) { showToast('Enter recipient name and amount.', '#ff9966'); return; }
      showToast(`Sending Ƒ${amt} to ${toName}…`, '#ffb547');
    });
  }
});

})();
