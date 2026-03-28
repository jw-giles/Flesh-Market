
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

// Lore names replace generic sector labels — ordered to match server SECTOR_NAMES indices
// (0=Finance,1=Biotech,2=Insurance,3=Manufacturing,4=Energy,5=Logistics,6=Tech,7=Misc)
const HEAT_SECTOR_LORE = [
  { icon: '⬡', name: 'The Capital Syndicate',    sub: 'Banking, lending & exchange houses'         },
  { icon: '⬡', name: 'Flesh & Gene Corps',        sub: 'Biomedical, pharma & augmentation firms'    },
  { icon: '⬡', name: 'The Indemnity Brokers',     sub: 'Risk underwriters & liability cartels'      },
  { icon: '⬡', name: 'The Iron Foundries',        sub: 'Heavy manufacturing & industrial output'    },
  { icon: '⬡', name: 'Power Cartels',             sub: 'Fuel, grid operators & energy monopolies'  },
  { icon: '⬡', name: 'The Transit Guild',         sub: 'Freight, shipping & supply infrastructure' },
  { icon: '⬡', name: 'Neural Networks Inc.',      sub: 'Software, hardware & data brokers'         },
  { icon: '⬡', name: 'The Gray Bazaar',           sub: 'Unlisted, unclassified & shadow ventures'  },
];

// Track collapsed state per sector across refreshes
const _heatCollapsed = {};

function _makeHeatCell(t) {
  const pct = t.pct != null ? t.pct : 0;
  const abs = Math.abs(pct);
  const intensity = Math.min(1, abs / 5);
  let bg, textColor;
  if (pct > 0.05) {
    const g = Math.round(80 + 175 * intensity);
    bg = `rgba(0,${g},40,0.85)`;
    textColor = '#aaffaa';
  } else if (pct < -0.05) {
    const r = Math.round(80 + 175 * intensity);
    bg = `rgba(${r},20,20,0.85)`;
    textColor = '#ffaaaa';
  } else {
    bg = 'rgba(30,30,30,0.8)';
    textColor = '#888';
  }
  const cell = document.createElement('div');
  cell.className = 'hc';
  cell.style.background = bg;
  cell.style.color = textColor;
  cell.style.cursor = 'pointer';
  const sign = pct > 0 ? '+' : '';
  const lore = HEAT_SECTOR_LORE[t.sector] || {};
  cell.innerHTML = `<div class="hs">${t.symbol}</div><div style="font-size:.72rem">${sign}${pct.toFixed(2)}%</div><div style="font-size:.65rem;opacity:.55">Ƒ${t.price>=1000?(t.price/1000).toFixed(1)+'k':t.price.toFixed(2)}</div>`;
  cell.title = `${t.name || t.symbol}\nƑ${(t.price||0).toFixed(2)}  ${sign}${pct.toFixed(2)}%\nSector: ${lore.name || ''}\nClick to open chart`;
  cell.addEventListener('click', () => {
    try {
      const symEl = document.getElementById('sym');
      if (symEl) symEl.value = t.symbol;
      window.CURRENT = t.symbol;
      if (typeof sendWS === 'function') sendWS({ type: 'chart', symbol: t.symbol });
      if (typeof showTab === 'function') {
        showTab('market');
      } else {
        const mktTab = document.querySelector('[data-tab="market"]');
        if (mktTab) mktTab.click();
      }
      try { document.querySelector('.panel #chart')?.scrollIntoView({behavior:'smooth', block:'nearest'}); } catch(_) {}
    } catch(e) {}
  });
  return cell;
}

window.refreshHeatmap = function() {
  const grid = document.getElementById('heatGrid'); if (!grid) return;
  const tab = document.getElementById('heatTab');
  const tickers = window.TICKERS || TICKERS || [];
  if (!tickers.length) return;
  if (!tab || tab.style.display === 'none') return;

  // Group tickers by sector index
  const bySector = {};
  for (const t of tickers) {
    if (t.symbol === 'FLSH') continue;
    const sid = t.sector != null ? t.sector : 7;
    if (!bySector[sid]) bySector[sid] = [];
    bySector[sid].push(t);
  }

  // Preserve scroll position
  const scrollTop = tab.scrollTop;
  grid.innerHTML = '';

  // Render one collapsible block per sector, in sector-index order
  const sectorIds = Object.keys(bySector).map(Number).sort((a,b)=>a-b);
  for (const sid of sectorIds) {
    const stocks = bySector[sid];
    const lore = HEAT_SECTOR_LORE[sid] || { icon:'⬡', name:`Sector ${sid}`, sub:'' };
    const isCollapsed = !!_heatCollapsed[sid];

    // Sector wrapper
    const block = document.createElement('div');
    block.style.cssText = 'border:1px solid rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;';

    // Header — click to collapse/expand
    const avgPct = stocks.reduce((s,t)=> s + (t.pct||0), 0) / stocks.length;
    const avgSign = avgPct >= 0 ? '+' : '';
    const avgCol  = avgPct > 0.05 ? '#86ff6a' : avgPct < -0.05 ? '#ff6b6b' : '#888';

    const hdr = document.createElement('div');
    hdr.style.cssText = `
      display:flex;align-items:center;gap:8px;padding:6px 10px;
      background:rgba(255,255,255,0.04);cursor:pointer;user-select:none;
      border-bottom:1px solid rgba(255,255,255,0.06);
    `;
    hdr.innerHTML = `
      <span style="font-size:.9rem;opacity:.45;transition:transform .2s;display:inline-block;transform:rotate(${isCollapsed?'-90deg':'0deg'})" class="heat-caret">▾</span>
      <div style="flex:1;display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:.82rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9">${lore.name}</span>
        <span style="font-size:.72rem;opacity:.6;font-style:italic;letter-spacing:.03em" class="heat-sub">${lore.sub}</span>
      </div>
      <span style="font-size:.8rem;color:${avgCol};font-weight:600;min-width:60px;text-align:right">${avgSign}${avgPct.toFixed(2)}%</span>
      <span style="font-size:.72rem;opacity:.35;min-width:36px;text-align:right">${stocks.length} co.</span>
    `;

    // Cell grid for this sector
    const subGrid = document.createElement('div');
    subGrid.style.cssText = `
      display:${isCollapsed ? 'none' : 'grid'};
      grid-template-columns:repeat(auto-fill,minmax(72px,1fr));
      gap:4px;padding:6px;
    `;
    for (const t of stocks) subGrid.appendChild(_makeHeatCell(t));

    // Toggle collapse on header click
    hdr.addEventListener('click', () => {
      _heatCollapsed[sid] = !_heatCollapsed[sid];
      const collapsed = _heatCollapsed[sid];
      subGrid.style.display = collapsed ? 'none' : 'grid';
      const caret = hdr.querySelector('.heat-caret');
      if (caret) caret.style.transform = `rotate(${collapsed ? '-90deg' : '0deg'})`;
    });

    block.appendChild(hdr);
    block.appendChild(subGrid);
    grid.appendChild(block);
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

      // ── Day-trade check ───────────────────────────────────────────────────
      // Limit buys issue a ticket; limit sells consume a round-trip if a ticket exists.
      try {
        const _load   = window.__dtLoad   || function(){ return {}; };
        const _save   = window.__dtSave   || function(){};
        const _ensure = window.__dtEnsure || function(st){ return st; };
        let st = _ensure(_load());
        const left = Math.max(0, 3 - st.roundTrips);
        if (left <= 0) {
          try{ showToast('❌ Day-trade limit reached (3). Cannot place limit order.', '#ff6a6a'); }catch(e){ alert('Day-trade limit reached for today (3).'); }
          return;
        }
        if (side === 'buy') {
          st.tickets[sym] = Number(st.tickets[sym]||0) + 1;
          _save(st);
        } else {
          if (Number(st.tickets[sym]||0) > 0) {
            st.tickets[sym] = Number(st.tickets[sym]) - 1;
            st.roundTrips = Math.min(3, st.roundTrips + 1);
            _save(st);
          }
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
