
(function(){
  function upper(x){ return String(x||'').toUpperCase(); }

  // Helpers (prefer store, then portfolio, then ME)
  window.getOwnedQty = function(sym){
  sym = String(sym||'').toUpperCase();
  // __MY_POSITIONS is keyed by symbol, set directly from server portfolio msg — most reliable
  try { if (window.__MY_POSITIONS && __MY_POSITIONS[sym] != null) return Number(__MY_POSITIONS[sym].qty)||0; } catch(e){}
  try { if (window.__POSITIONS_MAP && __POSITIONS_MAP[sym]!=null) return Number(__POSITIONS_MAP[sym])||0; } catch(e){}
  try { if (window.PnLBridge && PnLBridge.store && PnLBridge.store.positions && PnLBridge.store.positions[sym]) {
    const p = PnLBridge.store.positions[sym];
    return Number((p.qty!=null?p.qty:p.position)||0) || 0;
  }} catch(e){}
  try { if (window.__PnLLastPortfolio && __PnLLastPortfolio.positions && __PnLLastPortfolio.positions[sym]!=null) {
    const p = __PnLLastPortfolio.positions[sym];
    if (typeof p === 'number') return Number(p)||0;
    return Number((p.qty!=null?p.qty:p.position)||0) || 0;
  }} catch(e){}
  try { if (window.ME && ME.positions && ME.positions[sym]!=null) {
    const p = ME.positions[sym];
    if (typeof p === 'number') return Number(p)||0;
    return Number((p.qty!=null?p.qty:p.position)||0) || 0;
  }} catch(e){}
  return 0;
};

  window.getAvgCost = function(sym){
    sym = upper(sym);
    // __MY_POSITIONS is keyed by symbol and set directly from server portfolio msg — most reliable
    try { if (window.__MY_POSITIONS?.[sym]?.avg) return Number(__MY_POSITIONS[sym].avg); } catch(e){}
    try { if (window.PnLBridge && PnLBridge.store?.positions?.[sym]) {
      const p = PnLBridge.store.positions[sym]; return Number(p.avg ?? p.average ?? 0) || 0; } } catch(e){}
    try { if (window.__PnLLastPortfolio?.positions?.[sym]) {
      const p = __PnLLastPortfolio.positions[sym]; return Number(p.avg ?? p.average ?? 0) || 0; } } catch(e){}
    return 0;
  };

  window.getLastPrice = function(sym){
    sym = upper(sym);
    try { if (window.__LAST_MARKS && __LAST_MARKS[sym] != null) return Number(__LAST_MARKS[sym].price)||0; } catch(e){}
    try {
      if (Array.isArray(window.TICKERS)) {
        const t = window.TICKERS.find(x=>x && upper(x.symbol)===sym);
        if (t && t.price != null) return Number(t.price)||0;
      }
    } catch(e){}
    return 0;
  };

  // Modal controller (assumes modal HTML exists)
  const SM = {
    el: ()=>document.getElementById('sell-modal'),
    open(sym){
      const E = this.el(); if (!E) return;
      const owned = getOwnedQty(sym);
      let avg = getAvgCost(sym); if (!avg || !Number.isFinite(avg)) { try { avg = Number(document.querySelector(`[data-sym='${sym}'] .avg`)?.textContent)||0; } catch(e){} }
      const last = getLastPrice(sym);
      E.style.display = 'flex';
      document.getElementById('sm-title').textContent = `SELL ${sym}`;
      document.getElementById('sm-symbol').textContent = sym;
      document.getElementById('sm-owned').textContent = owned;
      document.getElementById('sm-avg').textContent = (avg||0).toFixed(2);
      document.getElementById('sm-last').textContent = (last||0).toFixed(2);
      const max = Math.max(0, owned|0);
      document.getElementById('sm-max').textContent = max;
      const qtyEl = document.getElementById('sm-qty');
      qtyEl.max = String(max);
      qtyEl.value = String(Math.min(Math.max(1, max), max||1));
      this.updatePreview();
      qtyEl.oninput = ()=>this.updatePreview();
    },
    close(){ const E=this.el(); if (E) E.style.display='none'; },
    updatePreview(){
      const sym = document.getElementById('sm-symbol').textContent;
      const qty = Math.max(0, Number(document.getElementById('sm-qty').value||0));
      const avg = Number(document.getElementById('sm-avg').textContent||0);
      const last = getLastPrice(sym) || Number(document.getElementById('sm-last').textContent||0);
      document.getElementById('sm-last').textContent = last.toFixed(2);
      const saleValue = last * qty;
      const pnl = avg > 0 ? (last - avg) * qty : 0;
      const valueEl = document.getElementById('sm-value');
      if (valueEl) valueEl.textContent = 'Ƒ' + saleValue.toFixed(2);
      const pnlEl = document.getElementById('sm-pnl');
      if (pnlEl) {
        const sign = pnl >= 0 ? '+' : '';
        pnlEl.textContent = avg > 0 ? (sign + pnl.toFixed(2)) : '(no basis)';
        pnlEl.className = pnl >= 0 ? 'ok' : 'warn';
      }
    },
    confirm(){
      const sym = document.getElementById('sm-symbol').textContent;
const qty = Math.max(0, Math.min(Number(document.getElementById('sm-qty').value||0), getOwnedQty(sym)));
const last = getLastPrice(sym);
// Optimistic local updates so UI reflects the sell immediately
try {
  if (window.PnLBridge && PnLBridge.store && PnLBridge.store.positions) {
    const p = PnLBridge.store.positions[sym];
    if (p) {
      p.qty = Math.max(0, Number(p.qty||p.position||0) - qty);
      if (p.qty === 0) delete PnLBridge.store.positions[sym];
    }
    // also record the trade to store if bridge supports it
    if (typeof PnLBridge.onTrade === 'function') {
      PnLBridge.onTrade({ id:`cli-${Date.now()}-s`, side:'SELL', symbol:sym, qty, price:last, ts: performance.now() });
    }
  }
} catch(e){}
try {
  if (window.__PnLLastPortfolio && __PnLLastPortfolio.positions) {
    const p = __PnLLastPortfolio.positions[sym];
    if (typeof p === 'number') {
      __PnLLastPortfolio.positions[sym] = Math.max(0, Number(p) - qty);
      if (!__PnLLastPortfolio.positions[sym]) delete __PnLLastPortfolio.positions[sym];
    } else if (p) {
      p.qty = Math.max(0, Number(p.qty||p.position||0) - qty);
      if (!p.qty) delete __PnLLastPortfolio.positions[sym];
    }
  }
} catch(e){}
try {
  if (window.__POSITIONS_MAP) {
    __POSITIONS_MAP[sym] = Math.max(0, Number(__POSITIONS_MAP[sym]||0) - qty);
    if (!__POSITIONS_MAP[sym]) delete __POSITIONS_MAP[sym];
  }
} catch(e){}
// Update modal preview immediately
try { document.getElementById('sm-owned').textContent = getOwnedQty(sym); __SellModal.updatePreview(); } catch(e){}
// Send order to server
try{ window.marketAPI && window.marketAPI.sell && window.marketAPI.sell(sym, qty); }catch(e){}this.close();
    }
  };
  window.__SellModal = SM;

  document.addEventListener('DOMContentLoaded', ()=>{
    const c = document.getElementById('sm-cancel'); if (c) c.onclick = ()=>SM.close();
    const ok = document.getElementById('sm-confirm'); if (ok) ok.onclick = ()=>SM.confirm();
  });

  // Allow live refresh while open
  window.__onPriceTickForModal = function(){
    const E = document.getElementById('sell-modal');
    if (E && E.style.display === 'flex' && window.__SellModal) {
      try { __SellModal.updatePreview(); } catch(e){}
    }
  };
})();
