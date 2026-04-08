/**
 * market-tools.js — FleshMarket v1.0.1.2
 * Features: Watchlist, Price Alerts, Portfolio Metrics, Company Detail, News Filter
 * Pure client-side module. Zero server changes.
 */
(function(){
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = n => 'Ƒ' + (Math.round(n*100)/100).toLocaleString();

// ═══════════════════════════════════════════════════════════════════════════════
// 1. WATCHLIST — localStorage-backed, toggle per ticker, filter mode
// ═══════════════════════════════════════════════════════════════════════════════

const WL_KEY = 'fm:watchlist';
let _watchlistMode = false;

function getWatchlist() {
  try { return JSON.parse(localStorage.getItem(WL_KEY)) || []; } catch(_) { return []; }
}
function saveWatchlist(list) {
  localStorage.setItem(WL_KEY, JSON.stringify(list));
}
function isWatched(sym) {
  return getWatchlist().includes(sym);
}
function toggleWatch(sym) {
  const list = getWatchlist();
  const idx = list.indexOf(sym);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(sym);
  saveWatchlist(list);
  return idx < 0; // returns true if now watched
}

// Inject watchlist UI into ticker panel
function initWatchlistUI() {
  const searchInput = $('#search');
  if (!searchInput) return;
  const wrap = document.createElement('div');
  wrap.id = 'watchlist-bar';
  wrap.style.cssText = 'display:flex;gap:5px;align-items:center;margin-bottom:6px';
  wrap.innerHTML = `
    <button id="wlToggle" style="background:none;border:1px solid #2a1a04;border-radius:4px;
      color:#665533;font-size:.72rem;padding:3px 10px;cursor:pointer;font-family:inherit;
      transition:all .15s;white-space:nowrap" title="Show only watchlisted tickers">
      ★ Watchlist
    </button>
    <span id="wlCount" style="font-size:.65rem;color:#553333;opacity:.7"></span>`;
  searchInput.parentNode.insertBefore(wrap, searchInput);

  const btn = $('#wlToggle');
  btn.addEventListener('click', () => {
    _watchlistMode = !_watchlistMode;
    btn.style.borderColor = _watchlistMode ? '#ffb547' : '#2a1a04';
    btn.style.color = _watchlistMode ? '#ffb547' : '#665533';
    btn.style.background = _watchlistMode ? 'rgba(255,181,71,.08)' : 'none';
    if (typeof renderTickers === 'function') renderTickers();
  });
  updateWatchlistCount();
}

function updateWatchlistCount() {
  const el = $('#wlCount');
  if (el) {
    const n = getWatchlist().length;
    el.textContent = n > 0 ? `(${n})` : '';
  }
}

// Patch renderTickers to add ★ buttons and filter by watchlist
function patchRenderTickers() {
  const _original = window.renderTickers;
  if (!_original) return;

  window.renderTickers = function() {
    // Call original
    _original.call(this);

    // Now augment each ticker row with a ★ button
    const box = $('#tickers');
    if (!box) return;
    const rows = box.querySelectorAll('.ticker');
    const wl = getWatchlist();

    rows.forEach(row => {
      const symEl = row.querySelector('.sym');
      if (!symEl) return;
      const sym = symEl.textContent.trim();

      // Hide non-watchlisted in watchlist mode
      if (_watchlistMode && !wl.includes(sym)) {
        row.style.display = 'none';
        return;
      }

      // Add star button if not already present
      if (row.querySelector('.wl-star')) return;
      const star = document.createElement('span');
      star.className = 'wl-star';
      star.textContent = wl.includes(sym) ? '★' : '☆';
      star.title = wl.includes(sym) ? 'Remove from watchlist' : 'Add to watchlist';
      star.style.cssText = `cursor:pointer;font-size:.9rem;padding:0 4px;flex-shrink:0;
        color:${wl.includes(sym) ? '#ffb547' : '#333'};user-select:none;
        transition:color .15s;z-index:2`;
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowWatched = toggleWatch(sym);
        star.textContent = nowWatched ? '★' : '☆';
        star.style.color = nowWatched ? '#ffb547' : '#333';
        star.title = nowWatched ? 'Remove from watchlist' : 'Add to watchlist';
        updateWatchlistCount();
      });
      // Insert before the price element (last direct child of row)
      const lastChild = row.lastElementChild;
      if (lastChild) row.insertBefore(star, lastChild);
      else row.appendChild(star);
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PRICE ALERTS — localStorage-backed, checked on every tick
// ═══════════════════════════════════════════════════════════════════════════════

const ALERT_KEY = 'fm:price_alerts';

function getAlerts() {
  try { return JSON.parse(localStorage.getItem(ALERT_KEY)) || []; } catch(_) { return []; }
}
function saveAlerts(alerts) {
  localStorage.setItem(ALERT_KEY, JSON.stringify(alerts));
}
function addAlert(sym, condition, price) {
  const alerts = getAlerts();
  // Prevent duplicates
  if (alerts.find(a => a.sym === sym && a.condition === condition && a.price === price)) return;
  alerts.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2,6), sym, condition, price, created: Date.now(), fired: false });
  saveAlerts(alerts);
}
function removeAlert(id) {
  saveAlerts(getAlerts().filter(a => a.id !== id));
}

// Check alerts against current prices (called on every tick)
function checkAlerts(tickData) {
  if (!Array.isArray(tickData)) return;
  const alerts = getAlerts();
  if (!alerts.length) return;
  const priceMap = {};
  for (const t of tickData) { if (t && t.symbol) priceMap[t.symbol] = t.price; }

  let changed = false;
  for (const a of alerts) {
    if (a.fired) continue;
    const px = priceMap[a.sym];
    if (px == null) continue;
    let triggered = false;
    if (a.condition === 'above' && px >= a.price) triggered = true;
    if (a.condition === 'below' && px <= a.price) triggered = true;
    if (triggered) {
      a.fired = true;
      changed = true;
      const dir = a.condition === 'above' ? '▲' : '▼';
      try { showToast(`🔔 ${a.sym} hit ${fmt(a.price)} ${dir} (now ${fmt(px)})`, '#ffb547'); } catch(_) {}
      try { playSound('mention'); } catch(_) {}
    }
  }
  if (changed) saveAlerts(alerts);
}

// Alert UI — injected below the limit orders panel
function initAlertUI() {
  const limitPanel = $('#limitPanel');
  if (!limitPanel) return;

  const panel = document.createElement('div');
  panel.id = 'alertPanel';
  panel.style.cssText = 'margin-top:6px;padding:8px;border:1px solid #2a1a04;border-radius:6px;background:#050403';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;opacity:.5">Price Alerts</div>
      <span id="alertCount" style="font-size:.65rem;color:#553333"></span>
    </div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
      <input id="alertSym" class="input" placeholder="Symbol" style="max-width:80px;text-transform:uppercase" maxlength="5"/>
      <select id="alertCond" class="input" style="max-width:80px">
        <option value="above">Above</option>
        <option value="below">Below</option>
      </select>
      <input id="alertPrice" class="input" type="number" min="0.01" step="0.01" placeholder="Price" style="max-width:90px"/>
      <button class="btn" id="alertAddBtn" style="font-size:.78rem">🔔 Set</button>
    </div>
    <div id="alertList" style="margin-top:6px;font-size:.75rem;max-height:80px;overflow:auto"></div>`;
  limitPanel.after(panel);

  $('#alertAddBtn').addEventListener('click', () => {
    const sym = ($('#alertSym').value || '').toUpperCase().trim();
    const cond = $('#alertCond').value;
    const price = parseFloat($('#alertPrice').value);
    if (!sym || !price || price <= 0) return;
    addAlert(sym, cond, price);
    $('#alertSym').value = '';
    $('#alertPrice').value = '';
    renderAlertList();
  });

  // Auto-fill symbol from current selection
  try {
    const symInput = $('#alertSym');
    if (symInput) {
      symInput.addEventListener('focus', () => {
        if (!symInput.value && window.CURRENT) symInput.value = window.CURRENT;
      });
    }
  } catch(_) {}

  renderAlertList();
}

function renderAlertList() {
  const list = $('#alertList');
  if (!list) return;
  const alerts = getAlerts().filter(a => !a.fired);
  const countEl = $('#alertCount');
  if (countEl) countEl.textContent = alerts.length > 0 ? `${alerts.length} active` : '';

  if (!alerts.length) {
    list.innerHTML = '<div style="opacity:.4;font-size:.68rem">No active alerts</div>';
    return;
  }
  list.innerHTML = alerts.map(a => {
    const dir = a.condition === 'above' ? '▲' : '▼';
    const color = a.condition === 'above' ? '#86ff6a' : '#ff6b6b';
    return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px solid #1a0a04">
      <span style="color:${color};font-size:.8rem">${dir}</span>
      <span style="color:#c8a86a;font-weight:600">${a.sym}</span>
      <span style="opacity:.6">${a.condition} ${fmt(a.price)}</span>
      <span style="flex:1"></span>
      <button onclick="window._fmRemoveAlert('${a.id}')" style="background:none;border:none;color:#553333;cursor:pointer;font-size:.7rem;padding:0 4px">✕</button>
    </div>`;
  }).join('');
}
window._fmRemoveAlert = function(id) {
  removeAlert(id);
  renderAlertList();
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PORTFOLIO PERFORMANCE METRICS — computed from net_worth_history
// ═══════════════════════════════════════════════════════════════════════════════

function initMetricsPanel() {
  const pnlTab = $('#pnlTab');
  if (!pnlTab) return;

  const panel = document.createElement('div');
  panel.id = 'metricsPanel';
  panel.style.cssText = 'margin-top:10px;padding:10px;border:1px solid #2a1a04;border-radius:6px;background:#050403';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;opacity:.5">Performance Metrics</div>
      <button id="metricsRefresh" class="btn" style="font-size:.68rem;padding:2px 8px">Refresh</button>
    </div>
    <div id="metricsGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <div class="metric-card" style="text-align:center;padding:6px;border:1px solid #1a0a04;border-radius:4px">
        <div style="font-size:.6rem;color:#665533;text-transform:uppercase;letter-spacing:.08em">Max Drawdown</div>
        <div id="m-drawdown" style="font-size:1rem;font-weight:700;color:#ff6b6b">—</div>
      </div>
      <div class="metric-card" style="text-align:center;padding:6px;border:1px solid #1a0a04;border-radius:4px">
        <div style="font-size:.6rem;color:#665533;text-transform:uppercase;letter-spacing:.08em">Best Period</div>
        <div id="m-best" style="font-size:1rem;font-weight:700;color:#86ff6a">—</div>
      </div>
      <div class="metric-card" style="text-align:center;padding:6px;border:1px solid #1a0a04;border-radius:4px">
        <div style="font-size:.6rem;color:#665533;text-transform:uppercase;letter-spacing:.08em">Worst Period</div>
        <div id="m-worst" style="font-size:1rem;font-weight:700;color:#ff6b6b">—</div>
      </div>
      <div class="metric-card" style="text-align:center;padding:6px;border:1px solid #1a0a04;border-radius:4px">
        <div style="font-size:.6rem;color:#665533;text-transform:uppercase;letter-spacing:.08em">Volatility</div>
        <div id="m-vol" style="font-size:1rem;font-weight:700;color:#ffb547">—</div>
      </div>
      <div class="metric-card" style="text-align:center;padding:6px;border:1px solid #1a0a04;border-radius:4px">
        <div style="font-size:.6rem;color:#665533;text-transform:uppercase;letter-spacing:.08em">Win Rate</div>
        <div id="m-winrate" style="font-size:1rem;font-weight:700;color:#4ecdc4">—</div>
      </div>
      <div class="metric-card" style="text-align:center;padding:6px;border:1px solid #1a0a04;border-radius:4px">
        <div style="font-size:.6rem;color:#665533;text-transform:uppercase;letter-spacing:.08em">Total Return</div>
        <div id="m-return" style="font-size:1rem;font-weight:700;color:#c8a86a">—</div>
      </div>
    </div>`;
  pnlTab.appendChild(panel);

  $('#metricsRefresh').addEventListener('click', fetchAndComputeMetrics);
}

async function fetchAndComputeMetrics() {
  const token = window.FM_TOKEN || window.__fmToken || (window.ME && window.ME.id) || '';
  if (!token) return;
  try {
    const resp = await fetch('/api/pnl/' + encodeURIComponent(token));
    const data = await resp.json();
    if (!data.ok || !Array.isArray(data.history) || data.history.length < 2) {
      setMetric('m-drawdown', '—'); setMetric('m-best', '—');
      setMetric('m-worst', '—'); setMetric('m-vol', '—');
      setMetric('m-winrate', '—'); setMetric('m-return', '—');
      return;
    }
    computeMetrics(data.history);
  } catch(e) { console.error('[Metrics]', e); }
}

function setMetric(id, val, color) {
  const el = document.getElementById(id);
  if (el) { el.textContent = val; if (color) el.style.color = color; }
}

function computeMetrics(history) {
  // history = [{net_worth, cash, equity, ts}, ...] sorted by ts ASC
  const nw = history.map(h => h.net_worth);
  const n = nw.length;

  // Total return
  const first = nw[0], last = nw[n-1];
  const totalReturn = first > 0 ? ((last - first) / first * 100) : 0;
  setMetric('m-return', (totalReturn >= 0 ? '+' : '') + totalReturn.toFixed(1) + '%',
    totalReturn >= 0 ? '#86ff6a' : '#ff6b6b');

  // Period returns (consecutive snapshots)
  const returns = [];
  for (let i = 1; i < n; i++) {
    if (nw[i-1] > 0) returns.push((nw[i] - nw[i-1]) / nw[i-1]);
  }

  // Max drawdown
  let peak = nw[0], maxDD = 0;
  for (let i = 1; i < n; i++) {
    if (nw[i] > peak) peak = nw[i];
    const dd = (peak - nw[i]) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  setMetric('m-drawdown', '-' + (maxDD * 100).toFixed(1) + '%');

  // Best / Worst period return
  if (returns.length > 0) {
    const best = Math.max(...returns);
    const worst = Math.min(...returns);
    setMetric('m-best', '+' + (best * 100).toFixed(2) + '%', '#86ff6a');
    setMetric('m-worst', (worst * 100).toFixed(2) + '%', '#ff6b6b');
  }

  // Volatility (std dev of returns)
  if (returns.length > 1) {
    const mean = returns.reduce((s,r) => s+r, 0) / returns.length;
    const variance = returns.reduce((s,r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const vol = Math.sqrt(variance) * 100;
    setMetric('m-vol', vol.toFixed(2) + '%', '#ffb547');
  }

  // Win rate (% of periods with positive return)
  if (returns.length > 0) {
    const wins = returns.filter(r => r > 0).length;
    const winRate = (wins / returns.length * 100);
    setMetric('m-winrate', winRate.toFixed(0) + '%',
      winRate >= 50 ? '#86ff6a' : '#ff6b6b');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. COMPANY DETAIL PANEL — expanded info when a ticker is selected
// ═══════════════════════════════════════════════════════════════════════════════

const SECTOR_NAMES = ['Finance','Biotech','Insurance','Manufacturing','Energy','Logistics','Tech','Misc'];
const DIVIDEND_SECTORS = new Set([0, 2, 4, 6]);
const HQ_DISPLAY = {
  new_anchor:'New Anchor',cascade_station:'Cascade Station',frontier_outpost:'Frontier Outpost',
  the_hollow:'The Hollow',vein_cluster:'Vein Cluster',aurora_prime:'Aurora Prime',
  null_point:'Null Point',flesh_station:'Flesh Station',limbosis:'Limbosis',
  lustandia:'Lustandia',gluttonis:'Gluttonis',abaddon:'Abaddon',eyejog:'Eyejog',
  dust_basin:'Dust Basin',nova_reach:'Nova Reach',iron_shelf:'Iron Shelf',
  the_ledger:'The Ledger',signal_run:'Signal Run',scrub_yard:'Scrub Yard',
  the_escrow:'The Escrow',margin_call:'Margin Call',
};

function initCompanyDetail() {
  const chart = $('#chart');
  if (!chart) return;
  const panel = document.createElement('div');
  panel.id = 'companyDetail';
  panel.style.cssText = 'display:none;padding:8px;border:1px solid #2a1a04;border-radius:6px;background:#050403;margin-top:6px;font-size:.78rem';
  chart.after(panel);
}

function updateCompanyDetail() {
  const panel = $('#companyDetail');
  if (!panel) return;
  const sym = window.CURRENT;
  if (!sym || !Array.isArray(window.TICKERS)) { panel.style.display = 'none'; return; }

  const t = window.TICKERS.find(x => x.symbol === sym);
  if (!t) { panel.style.display = 'none'; return; }

  panel.style.display = 'block';
  const sector = SECTOR_NAMES[t.sector] || 'Unknown';
  const sectorColor = ['#3498db','#e91e63','#2ecc71','#ff9800','#f44336','#9c27b0','#00bcd4','#795548'][t.sector] || '#888';
  const hq = HQ_DISPLAY[t.hq] || t.hq || '—';
  const pct = t.pct != null ? t.pct : 0;
  const pctColor = pct >= 0 ? '#86ff6a' : '#ff6b6b';
  const pctSign = pct >= 0 ? '+' : '';
  const isDivSector = DIVIDEND_SECTORS.has(t.sector);

  // Short interest from positions
  let shortInfo = '—';
  try {
    const pos = window.__MY_POSITIONS || {};
    const myPos = pos[sym];
    if (myPos && myPos.qty < 0) {
      shortInfo = `${Math.abs(myPos.qty)} shares short @ ${fmt(myPos.avg)}`;
    }
  } catch(_) {}

  // Holdings
  let holdingInfo = '—';
  try {
    const pos = window.__MY_POSITIONS || {};
    const myPos = pos[sym];
    if (myPos && myPos.qty > 0) {
      const val = myPos.qty * t.price;
      const upl = (t.price - myPos.avg) * myPos.qty;
      const uplColor = upl >= 0 ? '#86ff6a' : '#ff6b6b';
      holdingInfo = `${myPos.qty} shares · ${fmt(val)} · <span style="color:${uplColor}">${upl >= 0 ? '+' : ''}${fmt(upl)}</span>`;
    }
  } catch(_) {}

  // Open limit orders for this symbol
  let orderInfo = '';
  try {
    const ordersEl = $('#openOrders');
    if (ordersEl) {
      const orderItems = ordersEl.querySelectorAll('[data-sym]');
      let count = 0;
      orderItems.forEach(el => { if (el.dataset.sym === sym) count++; });
      if (count > 0) orderInfo = `<span style="color:#ffb547">${count} open order(s)</span>`;
    }
  } catch(_) {}

  panel.innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:4px">
          <span style="font-size:1rem;font-weight:700;color:#c8a86a">${sym}</span>
          <span style="font-size:.85rem;color:#888">${t.name || ''}</span>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px">
          <span style="color:${sectorColor};border:1px solid ${sectorColor}44;padding:1px 6px;border-radius:3px;font-size:.68rem">${sector}</span>
          <span style="color:#4ecdc4;font-size:.68rem" title="Headquarters colony">HQ: ${hq}</span>
          ${isDivSector ? '<span style="color:#86ff6a;font-size:.68rem">💰 Dividend eligible</span>' : '<span style="color:#553333;font-size:.68rem">No base dividend</span>'}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:1.1rem;font-weight:700">${fmt(t.price)}</div>
        <div style="font-size:.78rem;color:${pctColor}">${pctSign}${pct.toFixed(2)}%</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-top:6px;padding-top:6px;border-top:1px solid #1a0a04">
      <div><span style="opacity:.5">Position:</span> ${holdingInfo}</div>
      <div><span style="opacity:.5">Short:</span> ${shortInfo}</div>
      ${orderInfo ? `<div style="grid-column:1/-1">${orderInfo}</div>` : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. NEWS FILTER — search/filter input above news feed
// ═══════════════════════════════════════════════════════════════════════════════

function initNewsFilter() {
  // Find the h2 that says "News"
  const h2s = $$('.panel h2');
  let newsH2 = null;
  for (const h of h2s) { if (h.textContent.trim() === 'News') { newsH2 = h; break; } }
  if (!newsH2) return;

  const filterWrap = document.createElement('div');
  filterWrap.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:4px';
  filterWrap.innerHTML = `
    <input id="newsFilter" class="input" placeholder="Filter news…" style="flex:1;font-size:.72rem;padding:3px 6px"/>
    <select id="newsToneFilter" class="input" style="max-width:70px;font-size:.68rem;padding:3px 4px">
      <option value="">All</option>
      <option value="good">Good</option>
      <option value="bad">Bad</option>
      <option value="neutral">Neutral</option>
    </select>
    <button id="newsClearFilter" style="background:none;border:1px solid #2a1010;border-radius:3px;
      color:#553333;font-size:.68rem;padding:2px 6px;cursor:pointer;font-family:inherit">✕</button>`;
  newsH2.after(filterWrap);

  const filterInput = $('#newsFilter');
  const toneFilter = $('#newsToneFilter');
  const clearBtn = $('#newsClearFilter');

  function applyNewsFilter() {
    const q = (filterInput.value || '').toLowerCase().trim();
    const tone = toneFilter.value;
    const newsBox = $('#news');
    if (!newsBox) return;
    const items = newsBox.querySelectorAll('.news-line');
    items.forEach(item => {
      const text = (item.textContent || '').toLowerCase();
      const matchText = !q || text.includes(q);
      // Tone matching via CSS classes
      let matchTone = true;
      if (tone) {
        const hasGood = item.querySelector('.n-good');
        const hasBad = item.querySelector('.n-bad');
        const hasNeutral = item.querySelector('.n-neutral');
        if (tone === 'good') matchTone = !!hasGood;
        else if (tone === 'bad') matchTone = !!hasBad;
        else if (tone === 'neutral') matchTone = !!hasNeutral;
      }
      item.style.opacity = (matchText && matchTone) ? '1' : '.15';
      item.style.maxHeight = (matchText && matchTone) ? '' : '18px';
      item.style.overflow = 'hidden';
    });
  }

  filterInput.addEventListener('input', applyNewsFilter);
  toneFilter.addEventListener('change', applyNewsFilter);
  clearBtn.addEventListener('click', () => {
    filterInput.value = '';
    toneFilter.value = '';
    applyNewsFilter();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TICK HOOK — wire into price ticks for alerts + company detail updates
// ═══════════════════════════════════════════════════════════════════════════════

function hookTickMessages() {
  document.addEventListener('fm_ws_msg', (e) => {
    const msg = e.detail;
    if (!msg) return;
    if (msg.type === 'tick' && Array.isArray(msg.data)) {
      checkAlerts(msg.data);
      updateCompanyDetail();
    }
    if (msg.type === 'portfolio') {
      updateCompanyDetail();
    }
  });

  // Also update company detail when CURRENT changes
  let _currentVal = window.CURRENT;
  try {
    Object.defineProperty(window, 'CURRENT', {
      get() { return _currentVal; },
      set(v) {
        _currentVal = v;
        setTimeout(updateCompanyDetail, 50);
      },
      configurable: true
    });
  } catch(_) {
    // Fallback: poll for changes
    setInterval(() => {
      if (window.CURRENT !== _currentVal) {
        _currentVal = window.CURRENT;
        updateCompanyDetail();
      }
    }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT — wait for DOM + core.js to be ready
// ═══════════════════════════════════════════════════════════════════════════════

function init() {
  // Purge fired alerts from previous sessions
  saveAlerts(getAlerts().filter(a => !a.fired));

  initWatchlistUI();
  patchRenderTickers();
  initAlertUI();
  initMetricsPanel();
  initCompanyDetail();
  initNewsFilter();
  hookTickMessages();

  // Auto-fetch metrics when P&L tab is first opened
  const pnlTab = document.querySelector('[data-tab="pnl"]');
  if (pnlTab) {
    let _metricsFetched = false;
    pnlTab.addEventListener('click', () => {
      if (!_metricsFetched) {
        _metricsFetched = true;
        setTimeout(fetchAndComputeMetrics, 300);
      }
    });
  }

  // Initial render
  if (typeof renderTickers === 'function') {
    setTimeout(() => { try { renderTickers(); } catch(_) {} }, 100);
  }

  console.log('[Market Tools] Watchlist, Alerts, Metrics, Detail, News Filter — loaded');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
} else {
  setTimeout(init, 200);
}

})();
