
// ══════════════════════════════════════════════════════════════
// GUILDS / HEDGE FUNDS SYSTEM
// ══════════════════════════════════════════════════════════════

const _mfmt = n => 'Ƒ' + (Math.round(Number(n||0)*100)/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const _TIER = {1:'★',2:'⚖',3:'♛'};
const TYPE_LABEL  = { flsh:'FLSH', patreon:'Guild', player:'Capital House' };
const TYPE_COLOR  = { flsh:'#ffce4d', patreon:'#2ecc71', player:'#a0a0a0' };
let __currentFundId = null;
let __currentFundData = null;
let __myPlayerId_g = null;
let __isOwner_g    = false;
let __isMember_g   = false;
let __isDev_g      = false;
let __isAdmin_g    = false;
let __isPrime_g    = false;

// ── Directory ────────────────────────────────────────────────
async function loadGuildDirectory() {
  try {
    const tok = window.FM_TOKEN; if (!tok) return;
    const r = await fetch('/api/funds', { headers:{'Authorization':'Bearer '+tok} });
    const d = await r.json();
    if (!d.ok) return;
    renderGuildDirectory(d.funds);
  } catch(e) { console.warn('guild dir error', e); }
}

function renderGuildDirectory(funds) {
  const list  = document.getElementById('guild-fund-list');
  const empty = document.getElementById('guild-dir-empty');
  if (!list) return;
  if (!funds || !funds.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = funds.map(f => {
    const navStr = _mfmt(f.nav);
    const color  = TYPE_COLOR[f.type] || '#aaa';
    const label  = TYPE_LABEL[f.type] || '';
    const memberStr = `${f.memberCount}/${f.maxMembers}`;
    const badge     = f.isMember ? '<span style="color:#86ff6a;font-size:.72rem">● MEMBER</span>' : '';

    // Lock indicators — server now sends f.locked
    const isFlshLocked    = f.type === 'flsh'    && f.locked;
    const isPatreonLocked = f.type === 'patreon' && f.locked;
    const lockBadge = isFlshLocked
      ? '<span style="color:#ffce4d;font-size:.68rem;opacity:.7">⬡ DEV ONLY</span>'
      : isPatreonLocked
      ? '<span style="color:#ffce4d;font-size:.68rem;opacity:.7">★ PATREON</span>'
      : '';
    const cardOpacity = f.locked ? '0.55' : '1';

    return `
      <div class="g-fund-card" onclick="openFund('${f.id}')" style="cursor:pointer;opacity:${cardOpacity}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-weight:700;color:#46ff7d">${f.name}</span>
            <span style="font-size:.72rem;padding:1px 7px;border-radius:8px;border:1px solid ${color};color:${color}">${label}</span>
            ${badge}${lockBadge}
          </div>
          <div style="text-align:right">
            <div style="font-weight:700">${navStr}</div>
            <div style="font-size:.72rem;opacity:.5">NAV</div>
          </div>
        </div>
        <div style="font-size:.75rem;opacity:.55;margin-top:3px;display:flex;gap:14px">
          <span>👥 ${memberStr}</span>
          ${f.description ? `<span style="opacity:.5;font-style:italic">${f.description.slice(0,80)}${f.description.length>80?'…':''}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── Fund detail ──────────────────────────────────────────────
async function openFund(fundId) {
  // Opening a DIFFERENT house lands on Overview; re-opening the house already in view is
  // an in-place refresh (after a trade, invite, deposit, etc.) and must keep the active
  // pane so the user isn't bounced to Overview mid-task.
  const isRefresh = (fundId === __currentFundId);
  __currentFundId = fundId;
  try {
    const tok = window.FM_TOKEN; if (!tok) return;
    const r = await fetch('/api/funds/'+fundId, { headers:{'Authorization':'Bearer '+tok} });
    const d = await r.json();
    if (!d.ok) { alert(d.error); return; }
    __currentFundData = d.fund;
    renderFundDetail(d.fund);
    setHousePane(isRefresh ? __housePane : 'overview');
    renderFundPerformance(fundId);
  } catch(e) { console.warn('openFund error', e); }
}

// ── Performance chart: NAV-per-share over time ───────────────────
// spp isolates trading performance from member cashflows. Series begins when
// the server started snapshotting (v1.0.2.4), so new/old houses start sparse.
// ── Performance: allocation donut + metrics (matches the player P&L) ─────
const _GPAL = (typeof window !== 'undefined' && window.FM_DONUT_PAL) ? window.FM_DONUT_PAL
  : ['#2dd4c4','#ff3b3b','#b86bff','#27e36b','#9dff5a','#ff8c2e','#5dff7a','#e0b85a','#3aa0ff','#ff7a45'];

function _gFmtC(v){ v=Number(v)||0; return v>=1e9?(v/1e9).toFixed(1)+'B':v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'k':v.toFixed(0); }

// Allocation donut from the fund's current holdings + cash. Center = NAV.
function renderFundDonut(f) {
  const canvas = document.getElementById('g-perf-donut');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const S = 160;
  canvas.width = canvas.height = S * dpr;
  canvas.style.width = canvas.style.height = S + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle = '#0a0804'; ctx.fillRect(0,0,S,S);

  const cx=S/2, cy=S/2, ro=S/2-8, ri=ro*0.6;
  const slices = (f.holdings||[]).map((h,i)=>({ label:h.symbol, value:Math.max(0,h.value||0), color:_GPAL[i%_GPAL.length] }));
  if ((f.cash||0) > 0) slices.push({ label:'CASH', value:f.cash, color:'rgba(228,200,140,0.85)' });
  const total = slices.reduce((s,x)=>s+x.value,0) || 0;

  if (total <= 0) {
    ctx.beginPath(); ctx.arc(cx,cy,ro,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,180,50,0.12)'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='rgba(212,184,122,0.25)'; ctx.font='11px monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('Empty house', cx, cy);
    return;
  }

  const GAP=0.025; let ang=-Math.PI/2;
  slices.forEach(s=>{
    const sweep=(s.value/total)*(Math.PI*2)-GAP;
    // Guard tiny slices: if the drawn span (sweep - GAP/2) would be <= 0 the arc
    // end angle falls below its start and the default-clockwise arc wraps ~360°,
    // flooding the whole ring with this slice's color. Drop sub-~0.6% wedges.
    if (sweep<=GAP/2) return;
    ctx.beginPath();
    ctx.moveTo(cx+ri*Math.cos(ang+GAP/2), cy+ri*Math.sin(ang+GAP/2));
    ctx.arc(cx,cy,ro,ang+GAP/2,ang+sweep);
    ctx.arc(cx,cy,ri,ang+sweep,ang+GAP/2,true);
    ctx.closePath();
    // Per-segment glow so the ring reads luminous against the near-black panel.
    ctx.save();
    ctx.shadowColor=s.color; ctx.shadowBlur=6;
    ctx.fillStyle=s.color; ctx.fill();
    ctx.restore();
    if (s.value/total > 0.08) {
      const midA=ang+sweep/2+GAP/2, lr=(ro+ri)/2;
      ctx.fillStyle='rgba(0,0,0,0.78)'; ctx.font='bold 8px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(s.label, cx+lr*Math.cos(midA), cy+lr*Math.sin(midA));
    }
    ang += sweep+GAP;
  });
  ctx.shadowBlur=0;
  ctx.fillStyle='#0a0804'; ctx.beginPath(); ctx.arc(cx,cy,ri-2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#9dffb0'; ctx.font='bold 13px monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('Ƒ'+_gFmtC(f.nav), cx, cy-7);
  ctx.fillStyle='rgba(230,200,140,0.55)'; ctx.font='12px monospace';
  ctx.fillText('NAV', cx, cy+7);
}

function _gSetMetric(id, val, color){ const el=document.getElementById(id); if(el){ el.textContent=val; if(color) el.style.color=color; } }

// Metrics from the value-per-share (spp) series — same math as the player P&L.
async function renderFundPerformance(fundId) {
  const empty = document.getElementById('g-perf-empty');
  const delta = document.getElementById('g-perf-delta');
  let series = [];
  try {
    const tok = window.FM_TOKEN;
    const r = await fetch('/api/funds/'+fundId+'/history?limit=300', { headers: tok?{'Authorization':'Bearer '+tok}:{} });
    const d = await r.json();
    if (d.ok && Array.isArray(d.history)) series = d.history;
  } catch(e) { /* leave empty */ }
  if (fundId !== __currentFundId) return; // stale fetch

  const spp = series.map(h=>Number(h.spp)).filter(v=>isFinite(v) && v>0);
  const ids = ['gm-drawdown','gm-best','gm-worst','gm-vol','gm-winrate','gm-return'];

  if (spp.length < 2) {
    ids.forEach(id=>_gSetMetric(id,'-'));
    if (delta) delta.textContent = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const n=spp.length, first=spp[0], last=spp[n-1];
  const totalReturn = first>0 ? ((last-first)/first*100) : 0;
  _gSetMetric('gm-return', (totalReturn>=0?'+':'')+totalReturn.toFixed(1)+'%', totalReturn>=0?'#86ff6a':'#ff6b6b');
  if (delta) { delta.textContent = (totalReturn>=0?'+':'')+totalReturn.toFixed(2)+'%'; delta.style.color = totalReturn>=0?'#2ecc71':'#e74c3c'; }

  const returns=[];
  for (let i=1;i<n;i++){ if (spp[i-1]>0) returns.push((spp[i]-spp[i-1])/spp[i-1]); }

  let peak=spp[0], maxDD=0;
  for (let i=1;i<n;i++){ if (spp[i]>peak) peak=spp[i]; const dd=(peak-spp[i])/peak; if (dd>maxDD) maxDD=dd; }
  _gSetMetric('gm-drawdown', '-'+(maxDD*100).toFixed(1)+'%');

  if (returns.length>0){
    _gSetMetric('gm-best', '+'+(Math.max(...returns)*100).toFixed(2)+'%', '#86ff6a');
    _gSetMetric('gm-worst', (Math.min(...returns)*100).toFixed(2)+'%', '#ff6b6b');
    const wins = returns.filter(r=>r>0).length;
    _gSetMetric('gm-winrate', (wins/returns.length*100).toFixed(0)+'%', '#4ecdc4');
  }
  if (returns.length>1){
    const mean=returns.reduce((s,r)=>s+r,0)/returns.length;
    const variance=returns.reduce((s,r)=>s+(r-mean)**2,0)/(returns.length-1);
    _gSetMetric('gm-vol', (Math.sqrt(variance)*100).toFixed(2)+'%', '#46ff7d');
  }
}

window.__guildHoldSearch = window.__guildHoldSearch || '';
// 'default' | 'group' (cluster by sector) | '0'..'7' (show one sector)
window.__guildHoldSort = window.__guildHoldSort || 'default';

// Sector index + readable name for a symbol, from the live market snapshot.
function _gSectorOf(sym){
  try {
    const t = (window.TICKERS||[]).find(x => x && String(x.symbol) === String(sym));
    if (t && t.sector != null) return Number(t.sector);
  } catch(e){}
  return 99;
}
function _gSectorName(idx){
  const names = window.V5_SECTOR_NAMES || [];
  return (idx != null && names[idx]) ? names[idx] : 'Misc';
}
// Apply the search filter + the active sector view (filter-to-one or group) so
// the holdings list and the %-move bars always agree.
function _gArrange(rows){
  const q = window.__guildHoldSearch;
  let out = (rows || []).filter(h => !q || String(h.symbol||'').toLowerCase().includes(q));
  const s = window.__guildHoldSort;
  if (s === 'group') {
    out = out.slice().sort((a,b) => {
      const sa = _gSectorOf(a.symbol), sb = _gSectorOf(b.symbol);
      if (sa !== sb) return sa - sb;
      return String(a.symbol).localeCompare(String(b.symbol));
    });
  } else if (s !== 'default') {
    const idx = Number(s);
    out = out.filter(h => _gSectorOf(h.symbol) === idx);
  }
  return out;
}

// Live price + today's % for a symbol from the global market snapshot.
function _gLive(sym){
  try{
    if (Array.isArray(window.TICKERS)){
      const t = window.TICKERS.find(x => x && String(x.symbol) === String(sym));
      if (t) return { price: Number(t.price)||0, pct: Number(t.pct)||0 };
    }
  }catch(e){}
  return null;
}

// Build live-priced holding rows. Funds now track weighted-average cost per position, so
// the metric is gain-vs-entry (matches personal P&L), not the ticker's daily move. pct is
// null when the house has no recorded basis (legacy position) and renders as a placeholder.
// Value is re-marked at the live price; fund NAV/cash stay server-authoritative.
function _gBuildHoldings(f){
  const all = (f && f.holdings) ? f.holdings : [];
  return all.map(h => {
    const live    = _gLive(h.symbol);
    const price   = (live && live.price) ? live.price : (Number(h.price)||0);
    const qty     = Number(h.qty)||0;
    const avgCost = Number(h.avgCost)||0;
    const pct     = avgCost > 0 ? ((price/avgCost)-1)*100 : null;
    return { symbol:h.symbol, qty, price, pct, avgCost, value: price*qty };
  });
}

function _renderGuildHoldings(f){
  const rowsAll = _gBuildHoldings(f);
  const q = window.__guildHoldSearch;

  const hBox = document.getElementById('g-d-holdings');
  if (hBox){
    if (!rowsAll.length){
      hBox.innerHTML = '<span style="opacity:.4">No positions</span>';
    } else {
      const rows = _gArrange(rowsAll);
      const bySector = window.__guildHoldSort === 'group';
      const emptyMsg = /^[0-9]+$/.test(String(window.__guildHoldSort))
        ? ('No holdings in ' + _gSectorName(Number(window.__guildHoldSort)))
        : 'No holdings match filter';
      hBox.innerHTML = rows.length
        ? rows.map(h => {
            const hasG = (h.pct != null);
            const sign = hasG && h.pct >= 0 ? '+' : '';
            const col  = !hasG ? '#7a6a4a' : (h.pct >= 0 ? '#86ff6a' : '#ff6b6b');
            const pctStr = hasG ? (sign + h.pct.toFixed(2) + '%') : '\u00B7';
            const secTag = bySector ? ` <span style="font-size:.6rem;color:#7a6a4a;letter-spacing:.04em">${_gSectorName(_gSectorOf(h.symbol))}</span>` : '';
            return `<div class="ticker" style="cursor:pointer" title="Open ${h.symbol} in Market" onclick="window.FMGotoSymbol('${h.symbol}')"><span class="sym">${h.symbol}${secTag}</span>`
              + `<span style="display:flex;gap:12px;align-items:baseline;justify-content:flex-end">`
              + `<span style="color:#b6ffcf">Ƒ${h.price.toFixed(2)}</span>`
              + `<span style="color:${col};min-width:64px;text-align:right">${pctStr}</span>`
              + `<span style="min-width:120px;text-align:right">${h.qty}× <b>${_mfmt(h.value)}</b></span>`
              + `</span></div>`;
          }).join('')
        : `<span style="opacity:.4">${emptyMsg}</span>`;
    }
  }

  _drawGuildBars(rowsAll);
}

window.guildHoldingsSearch = function(v){
  window.__guildHoldSearch = (v||'').trim().toLowerCase();
  if (__currentFundData) _renderGuildHoldings(__currentFundData);
};

window.guildHoldingsSort = function(v){
  const ok = (v === 'group') || (v === 'default') || /^[0-9]+$/.test(String(v));
  window.__guildHoldSort = ok ? String(v) : 'default';
  if (__currentFundData) _renderGuildHoldings(__currentFundData);
};

// Re-mark holdings on every market tick while the Portfolio pane is visible.
window.refreshGuildHoldingsLive = function(){
  try{
    const pane = document.getElementById('g-pane-portfolio');
    if (!pane || pane.offsetParent === null) return; // detail/pane not visible
    if (!__currentFundData) return;
    _renderGuildHoldings(__currentFundData);
  }catch(e){}
};

// ── Pinned axis: today's %-move scale, stays put while bars scroll ──────────
function _drawGuildBarsAxis(W, maxAbs){
  const c = document.getElementById('g-pnl-bars-axis');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const H = 20;
  c.width = W*dpr; c.height = H*dpr;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle = '#0a0804';
  ctx.fillRect(0,0,W,H);
  if (maxAbs == null) return;
  const PAD_L = 52, PAD_R = 58;
  const plotW = W - PAD_L - PAD_R;
  const zeroX = PAD_L + plotW/2;
  ctx.strokeStyle = 'rgba(212,184,122,0.18)';
  ctx.lineWidth = 1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(zeroX, 5); ctx.lineTo(zeroX, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(212,184,122,0.42)'; ctx.font = '12px monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';  ctx.fillText('+'+maxAbs.toFixed(0)+'%', W-PAD_R+4, H/2);
  ctx.textAlign = 'right'; ctx.fillText('-'+maxAbs.toFixed(0)+'%', PAD_L-4,    H/2);
}

// ── Bars: gain vs entry per holding (mirrors personal P&L bars) ──────────────
function _drawGuildBars(rowsIn){
  const canvas = document.getElementById('g-pnl-bars');
  if (!canvas) return;
  const rows = _gArrange(rowsIn);

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 400;
  const PAD_L = 52, PAD_R = 58, PAD_T = 8, PAD_B = 10;
  const ROW_H = 24, BAR_H = 15;
  const n = rows.length;
  const H = Math.max(120, PAD_T + PAD_B + n*ROW_H);

  canvas.style.height = H + 'px';
  canvas.width = W*dpr; canvas.height = H*dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle = '#0a0804';
  ctx.fillRect(0,0,W,H);

  if (!n){
    _drawGuildBarsAxis(W, null);
    ctx.fillStyle = 'rgba(212,184,122,0.2)'; ctx.font = '11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(
      window.__guildHoldSearch ? 'No holdings match filter'
        : (/^[0-9]+$/.test(String(window.__guildHoldSort)) ? ('No holdings in ' + _gSectorName(Number(window.__guildHoldSort))) : 'No positions'),
      W/2, H/2);
    return;
  }

  const plotW = W - PAD_L - PAD_R;
  let maxAbs = 0.001;
  for (const h of rows){ const v=(h.pct==null?0:h.pct); if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v); }
  maxAbs = Math.max(maxAbs, 5);

  const zeroX = PAD_L + plotW/2;
  ctx.strokeStyle = 'rgba(212,184,122,0.18)';
  ctx.lineWidth = 1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(zeroX, PAD_T-6); ctx.lineTo(zeroX, H-PAD_B+2); ctx.stroke();
  ctx.setLineDash([]);

  _drawGuildBarsAxis(W, maxAbs);

  rows.forEach((h, i) => {
    const y = PAD_T + i*ROW_H + (ROW_H - BAR_H)/2;
    const pct = Math.max(-maxAbs, Math.min(maxAbs, (h.pct==null?0:h.pct)));
    const barPx = (Math.abs(pct)/maxAbs) * (plotW/2);
    const isPos = pct >= 0;
    const color = isPos ? PNL_COLORS[i % PNL_COLORS.length] : '#e06b5a';

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(PAD_L, y, plotW, BAR_H);

    const bx = isPos ? zeroX : zeroX - barPx;
    ctx.fillStyle = color + (isPos ? 'cc' : '99');
    ctx.fillRect(bx, y, barPx, BAR_H);

    ctx.fillStyle = color;
    if (isPos) ctx.fillRect(bx + barPx - 1, y, 1, BAR_H);
    else       ctx.fillRect(bx, y, 1, BAR_H);

    ctx.fillStyle = '#72e09c'; ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(h.symbol, PAD_L - 4, y + BAR_H/2);

    const sign = pct >= 0 ? '+' : '';
    ctx.fillStyle = isPos ? color : '#e06b5a';
    ctx.textAlign = 'left';
    ctx.fillText(sign + pct.toFixed(2)+'%', W - PAD_R + 4, y + BAR_H/2);
  });

  // Click a bar to open that symbol in Market (mirrors personal P&L bar-chart nav).
  // Row y is deterministic (PAD_T + i*ROW_H), so map click y to a row index.
  canvas._gRows = rows;
  if (!canvas._gClickBound){
    canvas._gClickBound = true;
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', function(e){
      try {
        const rr = canvas._gRows || [];
        const idx = Math.floor((e.offsetY - PAD_T) / ROW_H);
        if (idx >= 0 && idx < rr.length && rr[idx] && rr[idx].symbol) window.FMGotoSymbol(rr[idx].symbol);
      } catch(_){}
    });
  }
}

// Sector allocation breakdown for the house — mirrors the personal P&L sector bars and
// reuses the global sb-* styles. Groups live-valued holdings by sector and shows each
// sector's share of position equity. Allocation only; this is not gain/loss.
function _renderFundSectors(f){
  const bars = document.getElementById('g-sector-bars'); if (!bars) return;
  const rows = _gBuildHoldings(f);
  const byS = {}; let equity = 0;
  for (const h of rows){
    const v = Math.max(0, h.value||0); if (v <= 0) continue;
    const name = _gSectorName(_gSectorOf(h.symbol));
    byS[name] = (byS[name]||0) + v; equity += v;
  }
  if (equity <= 0){ bars.innerHTML = '<span style="opacity:.3;font-size:.75rem">No positions</span>'; return; }
  bars.innerHTML = '';
  for (const [name,val] of Object.entries(byS).sort((a,b)=>b[1]-a[1])){
    const pct = Math.min(100, (val/equity)*100);
    const row = document.createElement('div');
    row.className = 'sb-row';
    row.innerHTML = '<div class="sb-name">'+name+'</div><div class="sb-bg"><div class="sb-fill" style="width:'+pct.toFixed(1)+'%"></div></div><div class="sb-val">\u0191'+Math.round(val).toLocaleString()+'</div>';
    bars.appendChild(row);
  }
}

function renderFundDetail(f) {
  if (!f) return;
  __isOwner_g  = f.isOwner;
  __isMember_g = f.isMember;

  // Switch views
  document.getElementById('guild-dir').style.display         = 'none';
  document.getElementById('guild-detail').style.display      = 'block';
  document.getElementById('guild-create-form').style.display = 'none';

  // Header
  const nameEl = document.getElementById('g-detail-name');
  const typeEl = document.getElementById('g-detail-type-badge');
  const descEl = document.getElementById('g-detail-desc');
  if (nameEl) nameEl.textContent = f.name;
  if (typeEl) {
    typeEl.textContent  = TYPE_LABEL[f.type] || f.type;
    typeEl.style.color  = TYPE_COLOR[f.type] || '#aaa';
    typeEl.style.borderColor = TYPE_COLOR[f.type] || '#aaa';
  }
  if (descEl) descEl.textContent = f.type === 'patreon' ? 'Patreon tier, Capital House access + member perks. patreon.com/FLSH' : (f.description || '');

  // Stats
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('g-d-nav',   _mfmt(f.nav));
  set('g-d-cash',  _mfmt(f.cash));
  set('g-d-myval', _mfmt(f.myDeposited || 0));
  set('g-d-spp',   _mfmt(f.spp));

  // Withdrawable hint: only liquid fund cash can be pulled; positions are locked.
  const wbEl = document.getElementById('g-d-withdrawable');
  if (wbEl) wbEl.textContent = `Withdrawable: ${_mfmt(f.withdrawable||0)} fund cash · ${_mfmt(f.lockedInPositions||0)} locked in positions`;

  // Holdings
  _renderGuildHoldings(f);

  // Members
  const mBox = document.getElementById('g-d-members');
  const cntEl = document.getElementById('g-member-count');
  if (cntEl) cntEl.textContent = `(${f.memberCount}/${f.maxMembers})`;
  const isPlayerFund = f.type === 'player';
  const _roleBadge = { treasurer:'#86ff6a', trader:'#4ecdc4', whip:'#72e09c' };
  const _officerByName = {}; (f.officers||[]).forEach(o=>{ _officerByName[o.name]=o.role; });
  if (mBox) mBox.innerHTML = (f.members||[]).map(m=>{
    const g = _TIER[m.patreon_tier]||'';
    const own = m.isOwner ? ' 👑' : '';
    const role = _officerByName[m.name];
    const roleTag = role ? ` <span style="font-size:.58rem;color:${_roleBadge[role]||'#aaa'};border:1px solid ${_roleBadge[role]||'#aaa'}55;padding:0 4px;border-radius:3px;text-transform:uppercase;letter-spacing:.05em">${role}</span>` : '';
    const goldTag = m.isGolden ? ' <span title="Golden share" style="color:#ffce4d">★</span>' : '';
    const kickBtn = (f.isOwner && !m.isOwner && isPlayerFund)
      ? `<button onclick="kickMember('${m.name}')" style="font-size:.65rem;padding:1px 5px;background:#2a0d0d;border:1px solid #4a1a1a;color:#ff8080;border-radius:4px;cursor:pointer;margin-left:4px">kick</button>`
      : '';
    return `<div class="ticker"><span>${g} ${m.name}${own}${goldTag}${roleTag}${kickBtn}</span><span>${_mfmt(m.deposited||0)} <span style="opacity:.4">deposited</span></span></div>`;
  }).join('') || '<span style="opacity:.4">No members</span>';

  // Guild bonus bar — EXCLUSIVE to Merchants Guild (patreon fund only)
  const bonusBar = document.getElementById('g-guild-bonus-bar');
  if (bonusBar) {
    if (f.type === 'patreon') {
      const guildCount = f.memberCount || 0;
      const bonusPct = guildCount; // 1% per member
      if (guildCount > 0) {
        bonusBar.innerHTML = `⚖ Guild bonus: <b style="color:#2ecc71">+${bonusPct}%</b> passive income &nbsp;<span style="opacity:.45;font-size:.7rem">(${guildCount} member${guildCount===1?'':'s'} × 1% each)</span>`;
      } else {
        bonusBar.innerHTML = `<span style="opacity:.4">No members yet, each member adds +1% to everyone's passive income</span>`;
      }
    } else {
      bonusBar.innerHTML = ''; // Player guilds do not have the passive bonus
    }
  }

  // Activity
  const aBox = document.getElementById('g-d-activity');
  if (aBox) aBox.innerHTML = (f.activity||[]).map(a=>{
    const ts = new Date(a.ts).toLocaleTimeString();
    return `<div>${ts}, ${a.note||a.type}</div>`;
  }).join('') || '<span style="opacity:.4">No activity yet</span>';

  // Panels visibility
  const show = (id, v) => { const el=document.getElementById(id); if(el) el.style.display = v?'block':'none'; };

  // Remove any previous lock notice
  const oldLock = document.getElementById('g-lock-notice');
  if (oldLock) oldLock.remove();

  const isDevFund     = f.type === 'flsh';
  const isPatreonFund = f.type === 'patreon';
  const canInteract   = !f.locked;

  if (!canInteract && (isDevFund || isPatreonFund)) {
    // Insert a lock notice
    const lockEl = document.createElement('div');
    lockEl.id = 'g-lock-notice';
    const lockColor = isDevFund ? '#ffce4d' : '#ffce4d';
    const lockMsg   = isDevFund
      ? '⬡ This is the developer fund. Access is restricted to developer accounts.'
      : '★ This fund requires an active Patreon membership. Join at <a href="https://www.patreon.com/FLSH" target="_blank" style="color:#ffce4d">patreon.com/FLSH</a>.';
    lockEl.innerHTML = lockMsg;
    lockEl.style.cssText = [
      'padding:10px 14px;margin-bottom:12px',
      'border:1px solid '+lockColor+'44',
      'border-left:3px solid '+lockColor,
      'border-radius:0 6px 6px 0',
      'font-size:.8rem;color:'+lockColor,
      'background:#0a0a0a',
      'opacity:.8',
    ].join(';');
    const detailEl = document.getElementById('guild-detail');
    const descEl2  = document.getElementById('g-detail-desc');
    if (detailEl && descEl2) detailEl.insertBefore(lockEl, descEl2.nextSibling);
  }

  show('g-dw-panel',    f.isMember && f.type !== 'player');  // non-player funds: deposit only for members
  // Join button: player funds are invite-only, flsh is dev. Patreon shows it as a
  // "Become a Patron" CTA that links out (handled in the click listener).
  show('g-join-panel',  !f.isMember && f.type!=='player' && f.type!=='flsh');
  const joinBtn = document.getElementById('g-join-btn');
  const joinHint = joinBtn ? joinBtn.nextElementSibling : null;
  if (joinBtn && f.type === 'patreon') {
    joinBtn.textContent = '★ Become a Patron';
    joinBtn.style.borderColor = '#ffce4d';
    joinBtn.style.color = '#ffce4d';
    if (joinHint) joinHint.textContent = 'Opens patreon.com/FLSH, membership unlocks the Guild';
  } else if (joinBtn) {
    joinBtn.textContent = 'Join Fund';
    if (joinHint) joinHint.textContent = 'Free to join, deposit anytime';
  }
  show('g-slots-panel', f.isOwner);
  show('g-owner-panel', f.isOwner && f.type==='player');  // owner controls for player funds

  // ── Index listing panel (owner, player funds only) ──
  try {
    const ip = document.getElementById('g-index-panel');
    if (ip) {
      const showIndex = f.isOwner && f.type === 'player';
      ip.style.display = showIndex ? 'block' : 'none';
      if (showIndex && f.index) {
        const statusEl = document.getElementById('g-index-status');
        const listBtn  = document.getElementById('g-index-list-btn');
        const delistBtn= document.getElementById('g-index-delist-btn');
        const fmt = (n) => 'Ƒ' + Math.round(Number(n)||0).toLocaleString();
        if (f.index.listed) {
          const prem = f.index.premiumPct;
          const premTxt = prem == null ? '' :
            ` · ${prem >= 0 ? '+' : ''}${prem.toFixed(2)}% ${prem >= 0 ? 'premium' : 'discount'} to NAV`;
          if (statusEl) statusEl.innerHTML =
            `Listed as <b style="color:#f0b454">${f.index.symbol}</b> · ` +
            `price ${fmt(f.index.price)} · NAV/share ${f.index.navPerShare != null ? fmt(f.index.navPerShare) : '-'}${premTxt}` +
            ` · float ${Math.round(f.index.floatShares).toLocaleString()}`;
          if (listBtn)   listBtn.style.display = 'none';
          if (delistBtn) delistBtn.style.display = 'inline-block';
        } else {
          const nav = f.index.nav;
          const meets = nav != null && nav >= f.index.minNav;
          const gateTxt = meets
            ? `House NAV ${fmt(nav)} (meets ${fmt(f.index.minNav)})`
            : `House NAV ${fmt(nav)}, need ${fmt(f.index.minNav)} to list`;
          const feeTxt = f.index.haveCashForFee ? '' : ` · house cash below the ${fmt(f.index.listFee)} fee`;
          if (statusEl) statusEl.innerHTML =
            `Not listed. ${gateTxt}${feeTxt}<br>` +
            `<span style="opacity:.6">Lists ${Math.round(f.index.floatShares).toLocaleString()} public shares at ~${fmt(f.index.targetPrice)}; fee ${fmt(f.index.listFee)} (burned).</span>`;
          if (listBtn) {
            listBtn.style.display = 'inline-block';
            listBtn.disabled = !f.index.eligible;
            listBtn.style.opacity = f.index.eligible ? '1' : '0.4';
            listBtn.style.cursor  = f.index.eligible ? 'pointer' : 'not-allowed';
          }
          if (delistBtn) delistBtn.style.display = 'none';
        }
      }
    }
  } catch(_) {}
  // For player funds, members can deposit; owner OR treasurer can withdraw
  if (f.isMember && f.type === 'player') {
    show('g-dw-panel', true);
    const wBtn = document.getElementById('g-d-withdraw-btn');
    if (wBtn) wBtn.style.display = (f.isOwner || f.myRole==='treasurer') ? 'inline-block' : 'none';
  }

  // Trade panel: owner and appointed Trader can trade directly in any mode; others
  // only in executive/council per the existing rules.
  const gov = f.governance || 'executive';
  const canDirectTrade = (f.isOwner || f.myRole==='trader') ||
    ((gov !== 'vote') && ((isDevFund && __isDev_g) || (isPatreonFund && f.isMember && gov === 'executive')));
  show('g-trade-panel', canDirectTrade);
  const tradePanelTitle = document.querySelector('#g-trade-panel div[style*="opacity:.5"]');
  if (tradePanelTitle) tradePanelTitle.textContent = gov === 'council' ? 'Fund Trade (Owner Override)' : 'Fund Trade';
  // Buy cooldown lock + countdown (server-authoritative; 0 for non-player funds).
  try { applyBuyCooldown(f.buyCooldownMs || 0); } catch(_){}

  // Manage tab is owner-only
  const stabManage = document.getElementById('g-stab-manage');
  if (stabManage) stabManage.style.display = f.isOwner ? 'block' : 'none';
  if (!f.isOwner && __housePane === 'manage') setHousePane('overview');

  // Governance (mode badge, owner selector, propose panel, proposals)
  try { renderGovernance(f); } catch(_){}

  // Polls visible to members of any house
  const pollsSection = document.getElementById('g-polls-section');
  if (pollsSection) pollsSection.style.display = f.isMember ? 'block' : 'none';

  // Render polls
  renderFundPolls(f.polls || [], f.isOwner);
  // Allocation donut (current NAV composition)
  try { renderFundDonut(f); } catch(_){}
  // Sector allocation bars (Overview), mirrors personal P&L
  try { _renderFundSectors(f); } catch(_){}

  const slotsInfo = document.getElementById('g-slots-info');
  if (slotsInfo) slotsInfo.textContent = `${f.memberCount}/${f.maxMembers} slots used`;
}

// ── Render polls ─────────────────────────────────────────────
function renderFundPolls(polls, isOwner) {
  const box = document.getElementById('g-polls-list');
  if (!box) return;
  if (!polls || !polls.length) { box.innerHTML = '<span style="opacity:.4">No polls yet. Create one!</span>'; return; }
  box.innerHTML = polls.map(p => {
    const totalVotes = Object.keys(p.votes || {}).length;
    const isOpen = p.status === 'open' && Date.now() < p.expires_at;
    const myVote = window.__myPlayerId_g ? p.votes[window.__myPlayerId_g] : undefined;
    const closeBtn = (isOwner && isOpen)
      ? `<button onclick="closePoll(${p.id})" style="font-size:.65rem;padding:1px 6px;background:#2a0d0d;border:1px solid #4a1a1a;color:#ff8080;border-radius:4px;cursor:pointer;margin-left:6px">Close</button>`
      : '';
    const optionHtml = (p.options||[]).map((opt, i) => {
      const count = Object.values(p.votes||{}).filter(v=>v===i).length;
      const pct = totalVotes ? Math.round(count/totalVotes*100) : 0;
      const isMyVote = myVote === i;
      const voteBtn = (isOpen && myVote === undefined)
        ? `<button onclick="votePoll(${p.id},${i})" style="font-size:.65rem;padding:1px 8px;background:#0a1a0a;border:1px solid #1a4a1a;color:#86ff6a;border-radius:4px;cursor:pointer">Vote</button>`
        : '';
      return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:4px">
            <span ${isMyVote ? 'style="color:#4ecdc4"' : ''}>${opt}</span>
            ${voteBtn}
            ${isMyVote ? '<span style="color:#4ecdc4;font-size:.7rem">✓ your vote</span>' : ''}
          </div>
          <div style="background:#1a1a1a;border-radius:3px;height:4px;margin-top:2px">
            <div style="background:#4ecdc4;height:4px;border-radius:3px;width:${pct}%"></div>
          </div>
        </div>
        <span style="opacity:.5;min-width:40px;text-align:right">${count} (${pct}%)</span>
      </div>`;
    }).join('');
    const statusBadge = isOpen
      ? '<span style="color:#86ff6a;font-size:.7rem">● OPEN</span>'
      : '<span style="color:#666;font-size:.7rem">● CLOSED</span>';
    return `<div style="border:1px solid #1a1a04;border-radius:5px;padding:8px;margin-bottom:6px;background:#050403">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        ${statusBadge}
        <span style="font-weight:600">${p.question}</span>
        ${closeBtn}
      </div>
      <div style="font-size:.72rem;opacity:.5;margin-bottom:6px">${totalVotes} vote${totalVotes===1?'':'s'}</div>
      ${optionHtml}
    </div>`;
  }).join('');
}

window.kickMember = async function(name) {
  if (!__currentFundId) return;
  if (!confirm(`Kick ${name} from the fund? Their shares will be returned as cash.`)) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/kick`, {targetName:name}, 'g-owner-hint', `✓ ${name} kicked`);
  if (d?.ok) openFund(__currentFundId);
};

window.votePoll = async function(pollId, optionIndex) {
  if (!__currentFundId) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/poll/vote`, {pollId, optionIndex}, 'g-poll-hint', '✓ Vote cast');
  if (d?.ok) openFund(__currentFundId);
};

window.closePoll = async function(pollId) {
  if (!__currentFundId) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/poll/close`, {pollId}, 'g-poll-hint', '✓ Poll closed');
  if (d?.ok) openFund(__currentFundId);
};

// ── Refresh detail (on fund_update WS push) ──────────────────
function onFundUpdate(data) {
  if (!data.fundId) return;
  if (data.fundId === __currentFundId) {
    __currentFundData = data;          // keep live re-marks + pane refresh in sync with the push
    renderFundDetail(data);
  }
  // Also refresh directory card if visible
  if (document.getElementById('guild-dir').style.display !== 'none') loadGuildDirectory();
}

// ── House buy cooldown (button red-out + live countdown) ──────
let __buyCooldownUntil = 0;   // epoch ms when the next house buy is allowed
let __buyCooldownTimer = null;
function _fmtCooldown(ms){
  const s = Math.max(0, Math.ceil(ms/1000)), m = Math.floor(s/60), ss = s%60;
  return (m<10?'0':'')+m+':'+(ss<10?'0':'')+ss;
}
// Lazily create the countdown line under the trade row.
function _ensureBuyCdEl(){
  let el = document.getElementById('g-buy-cd');
  if (el) return el;
  const panel = document.getElementById('g-trade-panel');
  if (!panel) return null;
  el = document.createElement('div'); el.id = 'g-buy-cd';
  const hint = document.getElementById('g-trade-hint');
  if (hint && hint.parentElement === panel) panel.insertBefore(el, hint); else panel.appendChild(el);
  return el;
}
// Paint current lock state from __buyCooldownUntil. Only locks when side === 'buy'.
function _renderBuyCooldown(){
  const btn  = document.getElementById('g-t-exec-btn');
  const side = document.getElementById('g-t-side');
  const cd   = _ensureBuyCdEl();
  if (!btn) return;
  const remaining = __buyCooldownUntil - Date.now();
  const onBuy = !side || side.value === 'buy';
  if (remaining > 0 && onBuy){
    btn.classList.add('g-buy-locked'); btn.disabled = true;
    if (cd){ cd.classList.add('show'); cd.innerHTML = '\u23F3 NEXT BUY <span class="g-buy-cd-clock">'+_fmtCooldown(remaining)+'</span>'; }
  } else {
    btn.classList.remove('g-buy-locked'); btn.disabled = false;
    if (cd) cd.classList.remove('show');
  }
}
// Set the remaining window (ms) from the server and start/refresh the ticker.
function applyBuyCooldown(ms){
  __buyCooldownUntil = Date.now() + Math.max(0, Number(ms)||0);
  _renderBuyCooldown();
  if (!__buyCooldownTimer){
    __buyCooldownTimer = setInterval(function(){
      _renderBuyCooldown();
      if (__buyCooldownUntil - Date.now() <= 0){ clearInterval(__buyCooldownTimer); __buyCooldownTimer = null; }
    }, 500);
  }
}

// ── Actions ──────────────────────────────────────────────────
async function guildPost(path, body, hintId, successMsg) {
  const tok = window.FM_TOKEN; if (!tok) return null;
  const hint = hintId ? document.getElementById(hintId) : null;
  try {
    const r = await fetch(path, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (hint) {
      hint.textContent = d.ok ? (successMsg||'✓ Done') : ('✗ ' + (d.msg || d.error || 'Error'));
      hint.style.color = d.ok ? '#86ff6a' : '#ff6b6b';
    }
    return d;
  } catch(e) {
    if (hint) { hint.textContent = '✗ Network error'; hint.style.color = '#ff6b6b'; }
    return null;
  }
}

// ── Sub-view panes ───────────────────────────────────────────
let __housePane = 'overview';
function setHousePane(name) {
  __housePane = name;
  ['overview','portfolio','governance','manage'].forEach(p => {
    const pane = document.getElementById('g-pane-'+p);
    if (pane) pane.style.display = (p === name) ? 'block' : 'none';
  });
  document.querySelectorAll('#g-subtabs .g-stab').forEach(t => {
    const on = t.getAttribute('data-gpane') === name;
    t.style.borderBottomColor = on ? '#46ff7d' : 'transparent';
    t.style.color = on ? '#46ff7d' : '#6a5a3a';
  });
  // Canvas has zero width while the pane is hidden; redraw once it's visible.
  if (name === 'portfolio' && __currentFundData) {
    try { _renderGuildHoldings(__currentFundData); } catch(e){}
  }
}

function _gEsc(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ── Governance render ────────────────────────────────────────
function renderGovernance(f) {
  const setDisp = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? 'block' : 'none'; };
  const gov = f.governance || 'executive';
  const weight = f.voteWeight || 'equal';
  const wLabel = weight === 'shares' ? 'share-weighted' : weight === 'tenure' ? 'tenure-weighted' : 'one vote each';
  const badge = document.getElementById('g-gov-mode-badge');
  const label = gov === 'executive' ? 'Executive, owner trades directly'
    : gov === 'vote' ? `Majority Vote, members decide (${wLabel})`
    : `Council, members vote, owner has final say (${wLabel})`;
  if (badge) badge.innerHTML = `<span style="opacity:.5">Mode:</span> <b style="color:#46ff7d">${label}</b>`;

  setDisp('g-gov-owner', f.isOwner);
  if (f.isOwner) {
    const sel = document.getElementById('g-gov-select'); if (sel) sel.value = gov;
    const w   = document.getElementById('g-gov-weight'); if (w) w.value = weight;
    const dur = document.getElementById('g-gov-duration'); if (dur) dur.value = String(f.voteDurationMs || 21600000);
  }
  setDisp('g-propose-panel', f.isMember && (gov === 'vote' || gov === 'council'));

  // Golden share
  const ghEl = document.getElementById('g-golden-holder');
  if (ghEl) ghEl.innerHTML = f.goldenHolder
    ? `Held by <b style="color:#72e09c">${_gEsc(f.goldenHolder)}</b>${f.iHoldGolden?' (you)':''}`
    : '<span style="opacity:.5">Unassigned</span>';
  const gc = document.getElementById('g-golden-controls');
  if (gc) gc.style.display = f.iHoldGolden ? 'block' : 'none';

  renderProposals(f);
}

function renderProposals(f) {
  const box = document.getElementById('g-proposals-list');
  if (!box) return;
  const props = f.proposals || [];
  if (!props.length) { box.innerHTML = '<span style="opacity:.4">No open proposals</span>'; return; }
  const gov = f.governance || 'executive';
  box.innerHTML = props.map(p => {
    const yes = Number(p.votes_yes||0), no = Number(p.votes_no||0), total = yes+no;
    const pctYes = total > 0 ? Math.round(yes/total*100) : 0;
    const open = p.status === 'open';
    const statusTag = open ? '' : ` <span style="opacity:.5">[${String(p.status).replace('_',' ')}]</span>`;
    const sideCol = p.side === 'buy' ? '#86ff6a' : '#ff8080';
    const btn = (txt,col,call) => `<button onclick="${call}" style="font-size:.7rem;padding:2px 9px;background:none;border:1px solid ${col};color:${col};border-radius:4px;cursor:pointer">${txt}</button>`;
    const voteBtns = (f.isMember && open && (gov==='vote'||gov==='council'))
      ? btn('Yes','#2ecc71',`houseVote('${p.id}','yes')`) + btn('No','#e74c3c',`houseVote('${p.id}','no')`) : '';
    const ownerBtns = (f.isOwner && gov==='council' && ['open','advisory_pass','advisory_fail'].includes(p.status))
      ? btn('Execute','#86ff6a',`houseResolve('${p.id}','execute')`) + btn('Veto','#ff6b6b',`houseResolve('${p.id}','veto')`) : '';
    const goldenBtn = (f.iHoldGolden && open) ? btn('Veto (Golden)','#72e09c',`goldenVeto('${p.id}')`) : '';
    const whipBtn = ((f.isOwner || f.myRole==='whip') && open && (gov==='vote'||gov==='council')) ? btn('Force Call','#7fc090',`forceVote('${p.id}')`) : '';
    let closes = '';
    if (open && p.expires_at) {
      const ms = p.expires_at - Date.now();
      if (ms > 0) {
        const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000);
        const rel = h > 0 ? `${h}h ${m}m` : `${m}m`;
        closes = `<div style="font-size:.66rem;opacity:.4;margin-top:2px">closes in ${rel} · or when all eligible members vote</div>`;
      }
    }
    return `<div style="border:1px solid #1a1409;border-radius:5px;padding:6px 8px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;gap:6px">
        <span><b style="color:${sideCol}">${String(p.side).toUpperCase()}</b> ${p.qty}× ${_gEsc(p.symbol)}${statusTag}</span>
        <span style="opacity:.5;font-size:.72rem">by ${_gEsc(p.proposer_name||'?')}</span>
      </div>
      ${p.reason?`<div style="opacity:.55;font-size:.72rem;margin:2px 0">${_gEsc(p.reason)}</div>`:''}
      <div style="font-size:.72rem;opacity:.7;margin-top:3px">Yes ${yes} · No ${no} <span style="opacity:.5">(${pctYes}% yes)</span></div>
      ${closes}
      <div style="display:flex;gap:4px;margin-top:5px">${voteBtns}${ownerBtns}${goldenBtn}${whipBtn}</div>
    </div>`;
  }).join('');
}

async function houseVote(proposalId, vote) {
  if (!__currentFundId) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/vote`, {proposalId, vote});
  if (d?.ok) openFund(__currentFundId);
}
async function houseResolve(proposalId, action) {
  if (!__currentFundId) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/proposal/${proposalId}/resolve`, {action});
  if (d?.ok) openFund(__currentFundId);
}
window.houseVote = houseVote;
window.houseResolve = houseResolve;

async function goldenVeto(proposalId) {
  if (!__currentFundId) return;
  if (!confirm('Veto this proposal with the golden share? It dies regardless of the vote.')) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/golden/veto`, {proposalId}, 'g-golden-hint', '✓ Vetoed');
  if (d?.ok) openFund(__currentFundId);
}
window.goldenVeto = goldenVeto;

async function forceVote(proposalId) {
  if (!__currentFundId) return;
  if (!confirm('Force-call this vote now? Voting closes immediately and the current tally decides it.')) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/proposal/${proposalId}/force`, {}, 'g-gov-hint', '✓ Vote force-called');
  if (d?.ok) openFund(__currentFundId);
}
window.forceVote = forceVote;

function initGuildUI() {
  // Back button
  document.getElementById('g-back-btn')?.addEventListener('click', () => {
    document.getElementById('guild-dir').style.display    = 'block';
    document.getElementById('guild-detail').style.display = 'none';
    __currentFundId = null;
    loadGuildDirectory();
  });

  // Create fund toggle
  document.getElementById('g-create-btn')?.addEventListener('click', () => {
    const form = document.getElementById('guild-create-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('g-create-cancel')?.addEventListener('click', () => {
    document.getElementById('guild-create-form').style.display = 'none';
  });

  // Create fund submit
  document.getElementById('g-create-submit')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    const name = document.getElementById('g-new-name')?.value?.trim();
    const desc = document.getElementById('g-new-desc')?.value?.trim();
    const d = await guildPost('/api/funds/create', {name, description:desc}, 'g-create-hint', '✓ Fund created!');
    btn.disabled = false;
    if (d?.ok) {
      document.getElementById('guild-create-form').style.display = 'none';
      document.getElementById('g-new-name').value = '';
      document.getElementById('g-new-desc').value = '';
      await loadGuildDirectory();
      if (d.fundId) openFund(d.fundId);
    }
  });

  // Deposit
  document.getElementById('g-d-deposit-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const amt = parseFloat(document.getElementById('g-d-amount')?.value);
    if (!amt || amt < 1) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/deposit`, {amount:amt}, 'g-dw-hint', `✓ Deposited ${_mfmt(amt)}`);
    if (d?.ok) openFund(__currentFundId);
  });

  // Withdraw (raw cash amount, capped at fund liquidity)
  document.getElementById('g-d-withdraw-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const amt = parseFloat(document.getElementById('g-d-amount')?.value);
    if (!amt || amt < 1) { const h=document.getElementById('g-dw-hint'); if(h) h.textContent='Enter an amount to withdraw'; return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/withdraw`, {amount:amt}, 'g-dw-hint');
    if (d?.ok) { document.getElementById('g-dw-hint').textContent = `✓ Withdrew ${_mfmt(d.cashOut)}`; openFund(__currentFundId); }
  });

  // Join fund
  document.getElementById('g-join-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    // Merchants Guild is Patreon-gated — you can't join via the API, you become a
    // patron. Send the button to the Patreon page instead of a guaranteed 403.
    if (__currentFundData?.type === 'patreon') {
      window.open('https://www.patreon.com/FLSH', '_blank', 'noopener');
      return;
    }
    const d = await guildPost(`/api/funds/${__currentFundId}/join`, {}, 'g-dw-hint', '✓ Joined fund');
    if (d?.ok) openFund(__currentFundId);
  });

  // Buy slot
  document.getElementById('g-buy-slot-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/buy-slots`, {count:1}, 'g-dw-hint', '✓ Slot purchased');
    if (d?.ok) openFund(__currentFundId);
  });

  // Owner withdraw (raw cash amount, capped at fund liquidity)
  document.getElementById('g-owner-withdraw-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const amt = parseFloat(document.getElementById('g-owner-withdraw-amt')?.value);
    if (!amt || amt < 1) { const h=document.getElementById('g-owner-hint'); if(h) h.textContent='Enter an amount to withdraw'; return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/withdraw`, {amount:amt}, 'g-owner-hint');
    if (d?.ok) { document.getElementById('g-owner-hint').textContent = `✓ Withdrew ${_mfmt(d.cashOut)}`; openFund(__currentFundId); }
  });

  // Assign cash to member
  document.getElementById('g-assign-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const targetName = document.getElementById('g-assign-name')?.value?.trim();
    const amount = parseFloat(document.getElementById('g-assign-amt')?.value);
    if (!targetName || !amount) { const h=document.getElementById('g-owner-hint'); if(h){h.textContent='Enter member name and amount';h.style.color='#ff6b6b';} return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/assign`, {targetName,amount}, 'g-owner-hint', `✓ Assigned ${_mfmt(amount)} to ${targetName}`);
    if (d?.ok) { document.getElementById('g-assign-name').value=''; document.getElementById('g-assign-amt').value=''; openFund(__currentFundId); }
  });

  // Invite member to fund
  document.getElementById('g-invite-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const targetName = document.getElementById('g-invite-name')?.value?.trim();
    if (!targetName) { const h=document.getElementById('g-owner-hint'); if(h){h.textContent='Enter player name to invite';h.style.color='#ff6b6b';} return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/invite`, {targetName}, 'g-owner-hint', `✓ ${targetName} invited`);
    if (d?.ok) { document.getElementById('g-invite-name').value=''; openFund(__currentFundId); }
  });

  // Edit and delete are wired via onclick in HTML — see window._fmEditFund / window._fmDeleteFund below

  // Poll: toggle form
  document.getElementById('g-create-poll-btn')?.addEventListener('click', () => {
    const form = document.getElementById('g-poll-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('g-poll-cancel')?.addEventListener('click', () => {
    const form = document.getElementById('g-poll-form'); if(form) form.style.display = 'none';
  });
  document.getElementById('g-poll-add-opt')?.addEventListener('click', () => {
    const list = document.getElementById('g-poll-options-list');
    const opts = list.querySelectorAll('.g-poll-opt');
    if (opts.length >= 6) return;
    const inp = document.createElement('input');
    inp.className = 'input g-poll-opt';
    inp.placeholder = `Option ${opts.length+1}`;
    inp.style.cssText = 'width:100%;margin-bottom:4px;box-sizing:border-box';
    list.appendChild(inp);
  });
  document.getElementById('g-poll-submit')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const question = document.getElementById('g-poll-question')?.value?.trim();
    const options  = Array.from(document.querySelectorAll('.g-poll-opt')).map(el=>el.value.trim()).filter(Boolean);
    const d = await guildPost(`/api/funds/${__currentFundId}/poll/create`, {question,options}, 'g-poll-hint', '✓ Poll created');
    if (d?.ok) { document.getElementById('g-poll-form').style.display='none'; document.getElementById('g-poll-question').value=''; openFund(__currentFundId); }
  });

  // ── House buy cooldown UI ────────────────────────────────────
  // Mirrors the day-trade lock: after a house buy, the Execute button reds out and
  // shows a live mm:ss countdown to the next allowed buy. Server-authoritative — the
  // remaining window arrives in the fund snapshot (f.buyCooldownMs) and, as a
  // fallback, in a rate-limited trade's retryInMs. SELL is never locked (uncapped).
  if (!document.getElementById('gBuyCdCSS')) {
    const st = document.createElement('style'); st.id = 'gBuyCdCSS';
    st.textContent = [
      '#g-t-exec-btn.g-buy-locked{background:#2a0a0a!important;border-color:#ff6b6b!important;color:#ff6b6b!important;cursor:not-allowed!important;font-family:monospace;letter-spacing:.04em;min-width:96px}',
      '#g-buy-cd{display:none;margin-top:6px;font-family:monospace;font-size:.78rem;letter-spacing:.06em;color:#ff6b6b}',
      '#g-buy-cd.show{display:block}',
      '#g-buy-cd .g-buy-cd-clock{color:#72e09c;font-weight:bold}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // Execute trade
  document.getElementById('g-t-exec-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const side   = document.getElementById('g-t-side')?.value;
    const symbol = document.getElementById('g-t-sym')?.value?.toUpperCase().trim();
    const qty    = parseInt(document.getElementById('g-t-qty')?.value);
    if (!symbol || !qty) { const h=document.getElementById('g-trade-hint'); if(h){h.textContent='Symbol and qty required';h.style.color='#ff6b6b';} return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/trade`, {side,symbol,qty}, 'g-trade-hint',
      `✓ ${side.toUpperCase()} ${qty}× ${symbol} executed`);
    if (d?.ok) openFund(__currentFundId);
    // Fallback sync: if a buy slipped through and got rate-limited, lock to the
    // server's remaining window (normally the button is already locked, so this
    // only fires on clock skew / stale state / a direct API hit).
    else if (d && d.error === 'buy_rate_limited' && typeof d.retryInMs === 'number') applyBuyCooldown(d.retryInMs);
  });

  // Re-evaluate the lock when the side flips: the cooldown gates BUYS only, so SELL
  // must stay clickable even mid-cooldown.
  document.getElementById('g-t-side')?.addEventListener('change', () => { try { _renderBuyCooldown(); } catch(_){} });

  // Sub-tab navigation
  document.querySelectorAll('#g-subtabs .g-stab').forEach(tab => {
    tab.addEventListener('click', () => setHousePane(tab.getAttribute('data-gpane')));
  });

  // Governance: owner saves mode + weight
  document.getElementById('g-gov-save-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const governance = document.getElementById('g-gov-select')?.value;
    const voteWeight = document.getElementById('g-gov-weight')?.value;
    const voteDurationMs = document.getElementById('g-gov-duration')?.value;
    const d = await guildPost(`/api/funds/${__currentFundId}/governance`, {governance, voteWeight, voteDurationMs}, 'g-gov-hint', '✓ Governance updated');
    if (d?.ok) openFund(__currentFundId);
  });

  // Hand over the golden share (holder only)
  document.getElementById('g-golden-transfer-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const targetName = document.getElementById('g-golden-target')?.value?.trim();
    if (!targetName) { const h=document.getElementById('g-golden-hint'); if(h){h.textContent='Enter a member name';h.style.color='#ff6b6b';} return; }
    if (!confirm(`Hand the golden share to ${targetName}? This is permanent, they get full veto power and you lose it.`)) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/golden/transfer`, {targetName}, 'g-golden-hint', '✓ Golden share transferred');
    if (d?.ok) openFund(__currentFundId);
  });

  // Appoint / revoke officers (owner only)
  document.getElementById('g-officer-appoint-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const targetName = document.getElementById('g-officer-name')?.value?.trim();
    const role = document.getElementById('g-officer-role')?.value;
    if (!targetName) { const h=document.getElementById('g-officer-hint'); if(h){h.textContent='Enter a member name';h.style.color='#ff6b6b';} return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/officer/appoint`, {targetName, role}, 'g-officer-hint', `✓ Appointed ${role}`);
    if (d?.ok) openFund(__currentFundId);
  });
  document.getElementById('g-officer-revoke-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const targetName = document.getElementById('g-officer-name')?.value?.trim();
    if (!targetName) { const h=document.getElementById('g-officer-hint'); if(h){h.textContent='Enter a member name';h.style.color='#ff6b6b';} return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/officer/revoke`, {targetName}, 'g-officer-hint', '✓ Office revoked');
    if (d?.ok) openFund(__currentFundId);
  });

  // Propose a trade (vote / council)
  document.getElementById('g-pr-submit')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const side   = document.getElementById('g-pr-side')?.value;
    const symbol = document.getElementById('g-pr-sym')?.value?.toUpperCase().trim();
    const qty    = parseInt(document.getElementById('g-pr-qty')?.value);
    const reason = document.getElementById('g-pr-reason')?.value?.trim();
    if (!symbol || !qty) { const h=document.getElementById('g-pr-hint'); if(h){h.textContent='Symbol and qty required';h.style.color='#ff6b6b';} return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/propose`, {side,symbol,qty,reason}, 'g-pr-hint',
      `✓ Proposed ${side.toUpperCase()} ${qty}× ${symbol}`);
    if (d?.ok) { document.getElementById('g-pr-sym').value=''; document.getElementById('g-pr-qty').value=''; document.getElementById('g-pr-reason').value=''; openFund(__currentFundId); }
  });
}

document.addEventListener('fm:authed', (ev) => {
  const tok = ev.detail?.token || window.FM_TOKEN || localStorage.getItem('fm_token') || '';
  wsConnect(tok);
  if (window.startApp) window.startApp(ev.detail);

  // Populate window.ME with auth data so client-side checks have correct tier/flags immediately
  window.ME = Object.assign(window.ME || {}, {
    id:           ev.detail?.token        || window.ME?.id   || '',
    token:        ev.detail?.token        || window.ME?.token|| '',
    name:         ev.detail?.name         || window.ME?.name || '',
    faction:      ev.detail?.faction      || window.ME?.faction || null,
    patreon_tier: ev.detail?.patreon_tier || 0,
    is_dev:       !!(ev.detail?.is_dev),
    is_admin:     !!(ev.detail?.is_admin),
    is_prime:     !!(ev.detail?.is_prime),
    portrait:     ev.detail?.portrait    || window.ME?.portrait || null,
  });
  if (window.FMHeaderPortrait) window.FMHeaderPortrait(window.ME.portrait);

  // Restore tier badge in header + show account name
  const tierBadge  = document.getElementById('fm-tier-badge');
  const tierColors = {1:'#c8a040',2:'#2ecc71',3:'#9dff5a'};
  const tierGlyphs = {1:'★',2:'⚖',3:'♛'};
  const tier = ev.detail?.patreon_tier || 0;
  if (tierBadge) { tierBadge.textContent = tierGlyphs[tier]||''; tierBadge.style.color = tierColors[tier]||''; }
  // Header user display
  const hdrUser = document.getElementById('fm-header-user');
  const hdrName = document.getElementById('fm-header-name');
  const hdrBadge= document.getElementById('fm-tier-badge-hdr');
  if (hdrUser) hdrUser.style.display = 'flex';
  if (hdrName) hdrName.textContent = ev.detail?.name || '';
  if (hdrBadge){ hdrBadge.textContent = tierGlyphs[tier]||''; hdrBadge.style.color = tierColors[tier]||''; }

  // Guild tab — visible to all logged-in players (directory is public)
  const guildBtn = document.getElementById('guildTabBtn');
  if (guildBtn) guildBtn.style.display = 'inline-block';
  __isDev_g = !!(ev.detail?.is_dev);
  __isAdmin_g = !!(ev.detail?.is_admin || ev.detail?.is_dev || ev.detail?.is_prime);
  __isPrime_g = !!(ev.detail?.is_prime);
  __myPlayerId_g = ev.detail?.id || null;

  // Override header badge for owner account — deep-orange ★ instead of tier badge
  if (__isPrime_g) {
    if (tierBadge)  { tierBadge.textContent  = '★'; tierBadge.style.color  = _OWNER_COLOR; }
    if (hdrBadge)   { hdrBadge.textContent   = '★'; hdrBadge.style.color   = _OWNER_COLOR; }
    if (hdrName)    { hdrName.style.color     = _OWNER_COLOR; }
  }

  initGuildUI();
  // Load directory when guild tab is clicked (handled in tab switcher below)

  // Apply dunce state immediately if flagged — this fires before WS connects
  // so the UI is already in dunce mode by the time welcome arrives
  if (ev.detail?.is_dunced) {
    window.__IS_DUNCED = true;
    // Slight defer so DOM is fully settled after auth modal closes
    setTimeout(() => {
      try { applyDunceState('You are in the dunce corner.'); } catch(_) {}
    }, 150);
  }

  // Wire up Patreon email link button
  const linkBtn  = document.getElementById('patreon-link-btn');
  const emailInp = document.getElementById('patreon-email');
  const hint     = document.getElementById('patreon-hint');
  if (linkBtn && emailInp && hint) {
    linkBtn.onclick = async () => {
      const email = emailInp.value.trim();
      if (!email || !email.includes('@')) { hint.textContent='Enter a valid email.'; hint.style.color='#ff6b6b'; return; }
      if (!window.FM_TOKEN) { hint.textContent='Log in first.'; hint.style.color='#ff6b6b'; return; }
      linkBtn.disabled = true;
      linkBtn.textContent = '…';
      try {
        const r = await fetch('/api/patreon/link', {
          method:'POST',
          headers:{'Content-Type':'application/json','x-auth-token': window.FM_TOKEN},
          body: JSON.stringify({email})
        });
        const d = await r.json();
        if (d.ok) {
          hint.textContent = '✓ Email linked. Tier will activate when Patreon confirms your membership.';
          hint.style.color = '#86ff6a';
          emailInp.value = '';
        } else {
          hint.textContent = d.error || 'Failed to link.';
          hint.style.color = '#ff6b6b';
        }
      } catch(e) {
        hint.textContent = 'Server unreachable.';
        hint.style.color = '#ff6b6b';
      }
      linkBtn.disabled = false;
      linkBtn.textContent = 'Link Account';
    };
    emailInp.addEventListener('keydown', e => { if(e.key==='Enter') linkBtn.click(); });
  }

  // ── Fund edit/delete (global onclick handlers) ─────────────────────────────
  window._fmEditFund = async function() {
    if (!__currentFundId) return;
    const newName = prompt('New fund name (3-40 chars):');
    if (!newName || newName.trim().length < 3) return;
    const newDesc = prompt('New description (optional, max 200 chars):') || '';
    const d = await guildPost(`/api/funds/${__currentFundId}/edit`, {name:newName.trim(),description:newDesc.trim()}, 'g-owner-hint', `✓ Fund renamed to "${newName.trim()}"`);
    if (d?.ok) openFund(__currentFundId);
  };

  window._fmDeleteFund = async function() {
    if (!__currentFundId) return;
    if (!confirm('Disband this fund? All members will be kicked and refunded their deposits. You will receive Ƒ5,000,000.')) return;
    if (!confirm('Are you sure? This cannot be undone.')) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/delete`, {}, 'g-owner-hint', '✓ Fund disbanded');
    if (d?.ok) {
      __currentFundId = null;
      try {
        document.getElementById('guild-detail').style.display = 'none';
        document.getElementById('guild-dir').style.display = 'block';
        loadGuildDirectory();
      } catch(_){}
    }
  };

  window._fmListIndex = async function() {
    if (!__currentFundId) return;
    if (!confirm('List this house on the Index?\n\nA public float of 100,000 shares will be sold into the market at ~Ƒ1,000/share. The house pays a Ƒ25,000,000 listing fee (burned) and eats the slippage on the float sale. Members and holdings are unaffected in value.')) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/list`, {}, 'g-index-hint',
      '✓ Listed on the Index');
    if (d?.ok) openFund(__currentFundId);
  };

  window._fmDelistIndex = async function() {
    if (!__currentFundId) return;
    if (!confirm('Delist this house from the Index?\n\nAll public float holders are bought out at the current NAV per share from house cash. If the house lacks the cash to cover the buyout, delisting is blocked until you sell holdings to cash.')) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/delist`, {}, 'g-index-hint',
      '✓ Delisted');
    if (d?.ok) openFund(__currentFundId);
  };
});
