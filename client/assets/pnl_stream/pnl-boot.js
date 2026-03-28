'use strict';
// Minimal, collision-proof P&L boot
(function(){
  if (window.__PNL_BOOT_OK__) return; // idempotent
  window.__PNL_BOOT_OK__ = true;

  function pickEl(){
    const kpiNode = document.getElementById('pnl-kpis') ||
                    document.querySelector('[data-role="pnl-kpis"], .pnl-kpis');
    const canvasNode = document.getElementById('pnl-canvas') ||
                       document.querySelector('[data-role="pnl-canvas"], .pnl-canvas');
    return { kpiNode, canvasNode };
  }

  function pickState(){
    return window.ME || window.state || window.GameState || window.appState || {};


  // Resolve arbitrary input (symbol or company name) to a canonical ticker symbol
  function resolveSym(s){
    try{
      const raw = String(s||'').trim();
      if (!raw) return '';
      // If it already looks like a ticker (A-Z digits, length<=6), return upper-cased
      if (/^[A-Za-z]{2,6}\d?$/.test(raw)) return raw.toUpperCase();
      const needle = raw.replace(/\d+$/,'').toLowerCase();

      // Prefer explicit TICKERS map if present
      if (window.TICKERS && typeof TICKERS === 'object'){
        for (const k in TICKERS){
          const rec = TICKERS[k] || {};
          const nm = String(rec.name||'').replace(/\d+$/,'').toLowerCase();
          if (nm === needle) return String(k).toUpperCase();
        }
        // fuzzy: startsWith
        for (const k in TICKERS){
          const rec = TICKERS[k] || {};
          const nm = String(rec.name||'').replace(/\d+$/,'').toLowerCase();
          if (nm.startsWith(needle)) return String(k).toUpperCase();
        }
      }

      // Fallback: scan DOM if list is rendered
      try{
        const rows = document.querySelectorAll('.ticker .sym');
        for (const el of rows){
          const sym = String(el.textContent||'').trim();
          const nmEl = el.parentElement && el.parentElement.querySelector('.muted');
          const nm = String(nmEl && nmEl.textContent || '').replace(/\d+$/,'').toLowerCase();
          if (nm === needle) return sym.toUpperCase();
        }
      }catch(_e){}

      return raw.toUpperCase();
    }catch(_e){ return String(s||'').toUpperCase(); }
  }


  }

  // ----- Getters -----
  const getPositions = ()=>{
      // Try multiple sources and normalize into an object map {SYM: {qty: number, last?: number}}
      const out = {};
      function add(sym, qty, px){
        if (!sym) return;
        const u = resolveSym(sym);
        const q = Number(qty)||0, p = Number(px)||0;
        if (!out[u]) out[u] = { qty:0, last:0 };
        out[u].qty += q;
        if (p) out[u].last = p;
      }
      try{
        const s = (window.ME||window.state||window.GameState||window.appState||{});
        const cand = [ s.positions, s.holdings, s.portfolio, window.POSITIONS, window.HOLDINGS ];
        for (const src of cand){
          if (!src) continue;
          if (Array.isArray(src)){
            for (const it of src){
              const sym = it && (it.sym||it.symbol);
              const qty = it && (it.qty ?? it.shares ?? it.amount ?? it.position);
              const px  = it && (it.px ?? it.price ?? it.last);
              add(sym, qty, px);
            }
          } else if (typeof src === 'object'){
            for (const k in src){
              const v = src[k];
              const qty = (typeof v==='number') ? v : (v && (v.qty ?? v.shares ?? v.amount ?? v.position));
              const px  = v && (v.px ?? v.price ?? v.last);
              add(k, qty, px);
            }
          }
        }
        // Also try most recent portfolio snapshot if present
        const lastEq = (Array.isArray(window.EQUITY) && window.EQUITY.length) ? window.EQUITY[window.EQUITY.length-1] : null;
        const port = (window.__PnLLastPortfolio && window.__PnLLastPortfolio.positions) || (lastEq && lastEq.positions);
        if (port){
          if (Array.isArray(port)){
            for (const it of port){
              add(it && (it.sym||it.symbol), it && (it.qty ?? it.shares), it && (it.px ?? it.price ?? it.last));
            }
          } else if (typeof port==='object'){
            for (const k in port){
              const v=port[k];
              add(resolveSym(k), (typeof v==='number')?v:(v && (v.qty ?? v.shares)), v && (v.px ?? v.price ?? v.last));
            }
          }
        }
      }catch(e){}
      return out;
    };

    

const getMark = (sym) => { sym = resolveSym(sym);
  try {
    const S = String(sym || '').toUpperCase();
    const m = window.marketAPI || window.market || window.Market;
    if (m) {
      if (typeof m.getLastPrice === 'function') {
        const v = Number(m.getLastPrice(S));
        if (Number.isFinite(v) && v > 0) return v;
      }
      if (typeof m.getPrice === 'function') {
        const v = Number(m.getPrice(S));
        if (Number.isFinite(v) && v > 0) return v;
      }
      if (typeof m.last === 'function') {
        const v = Number(m.last(S));
        if (Number.isFinite(v) && v > 0) return v;
      }
      if (m.marks && m.marks[S] != null) {
        const v = Number(m.marks[S]);
        if (Number.isFinite(v) && v > 0) return v;
      }
      if (m.prices && m.prices[S] != null) {
        const v = Number(m.prices[S]);
        if (Number.isFinite(v) && v > 0) return v;
      }
      if (m.tickers && m.tickers[S]) {
        const q = m.tickers[S] || {};
        const v = Number(q.last ?? q.mark ?? q.price ?? q.px);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
    if (window.TICKERS && TICKERS[S] && typeof TICKERS[S].last === 'number') {
      const v = Number(TICKERS[S].last);
      if (Number.isFinite(v) && v > 0) return v;
    }
    if (window.MARKS && MARKS[S] != null) {
      const v = Number(MARKS[S]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    if (window.QUOTES && QUOTES[S]) {
      const q = QUOTES[S] || {};
      const v = Number(q.last ?? q.mark ?? q.price ?? q.px);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch (e) {
    // silent fail
  }
  return 0;
};


  const getRealized = ()=>{
    try{
      const s = pickState();
      return Number(s.realized || s.realizedPnL || 0) || 0;
    }catch(e){ return 0; }
  };

  const getCash = ()=>{
    const s = pickState();
    const v = (s.cash ?? s.playerCash ?? s.balance);
    if (typeof v === 'number') return v;
    try{ if (typeof window.__PnLLastCash === 'number') return window.__PnLLastCash; }catch(e){}
    return 0;
  };

  const getEquity = ()=>{
    try{
      if (Array.isArray(window.EQUITY) && window.EQUITY.length){
        const last = window.EQUITY[window.EQUITY.length-1];
        if (last && typeof last.equity === 'number') return last.equity;
      }
    }catch(e){}
    try{
      if (window.__PnLLastPortfolio && typeof window.__PnLLastPortfolio.equity === 'number'){
        return window.__PnLLastPortfolio.equity;
      }
    }catch(e){}
    try{
      const pos = getPositions() || {};
      let eq = 0;
      for (const sym in pos){
        const p = pos[sym] || {};
        const qty = Number(p.qty ?? p.shares ?? p.amount ?? p.position) || 0;
        const px = getMark(sym);
        eq += qty * px;
      }
      return eq;
    }catch(e){}
    return 0;
  };

  function mount(){
    try{
      if (!window.PnLBridge || !window.PnLStore) return; // store required
      // init store bridge (no DOM touched)
      if (!window.PnLBridge._inited){
        window.PnLBridge.init({ getCash, getPositions, getMark, getRealized, getEquity });
      }
      // mount canvas if present
      const { kpiNode, canvasNode } = pickEl();
      if (!kpiNode || !canvasNode) return;
      if (!window.PnLCanvas) return;
      const store = window.PnLBridge.store;
      const pnl = new window.PnLCanvas({ canvas: canvasNode, kpiNode, store });
      pnl.start();
      window.__PNL_CANVAS__ = pnl;
    }catch(e){
      console.error('[PnL boot] mount failed', e);
    }
  }

  function onReady(fn){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn, { once:true });
    } else { fn(); }
  }

    // wire market bus if available (optional)
  try {
    const bus = window.market || window.Market || window.marketBus;
    if (bus && typeof bus.on === 'function') {
      ['tick','price','quote','mark'].forEach(function(evt){
        try {
          const flag = '__PNL_WIRED_' + String(evt).toUpperCase() + '__';
          if (!window[flag]) {
            bus.on(evt, function(sym, px){
              try {
                if (window.PnLBridge && typeof window.PnLBridge.onPriceTick === 'function') {
                  window.PnLBridge.onPriceTick({ symbol: sym, price: px, ts: performance.now() });
                }
              } catch (_e) {}
            });
            window[flag] = true;
          }
        } catch (_e) {}
      });
      if (!window.__PNL_WIRED_TRADE__) {
        bus.on('trade', function(t){
          try { if (window.PnLBridge && window.PnLBridge.onTrade) window.PnLBridge.onTrade(t); } catch (_e) {}
        });
        window.__PNL_WIRED_TRADE__ = true;
      }
    }
  } catch (e) {}

  onReady(mount);

  // Sanity validator (soft warnings)
  try{
    const warn = (m)=> console.warn('[PnL:validator]', m);
    if (typeof window.PnLCanvas !== 'function') warn('PnLCanvas missing');
    if (!window.PnLBridge || typeof window.PnLBridge.init!=='function') warn('PnLBridge missing');
  }catch(e){}
})();
