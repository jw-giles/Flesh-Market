
// P&L Streaming Boot (hard mount, single-pipeline)
(function(){
  if (window.__PNL_BOOT__) return; window.__PNL_BOOT__ = true;

  // Kill legacy init if something tries to call it
  window.initSimplePnL = function(){ console.warn('[PnL] legacy init suppressed'); };

  function pickEl(){
    const kpi = document.getElementById('kpis') || document.getElementById('pnl-kpis') ||
                document.querySelector('[data-role="pnl-kpis"]') || document.querySelector('.pnl-kpis');
    const canvas = document.getElementById('pnl-canvas') ||
                   document.querySelector('[data-role="pnl-canvas"]') || document.querySelector('.pnl-canvas');
    return { kpi, canvas };
  }

  function hasAPI(){
  try{
    if (typeof window.marketAPI !== 'undefined' && typeof window.marketAPI.getLastPrice === 'function') return true;
    if (Array.isArray(window.TICKERS) && window.TICKERS.length) return true;
    if (document.querySelector('[data-sym][data-qty]') || document.getElementById('positions')) return true;
  }catch(e){}
  return false;
}


  function pickState(){
    return window.state || window.GameState || window.ME || window.appState || {};
  }

  function wireEvents(){
    // Prefer a market event bus if present
    const market = window.market || window.Market || window.marketBus;
    let wired = false;
    if (market && typeof market.on === 'function') {
      try{
        if (!window.__PNL_WIRED_TICK__){
          market.on('tick', (sym, px)=> window.PnLBridge.onPriceTick({ symbol:sym, price:px, ts:performance.now() }));
          window.__PNL_WIRED_TICK__ = true;
          wired = true;
        }
        if (!window.__PNL_WIRED_TRADE__){
          market.on('trade', (t)=> window.PnLBridge.onTrade(t));
          window.__PNL_WIRED_TRADE__ = true;
          wired = true;
        }
      }catch(e){ /* fall back below */ }
    }
    if (!wired){
      // Fallback sampler: push point every 250ms so KPIs/series stay fresh even without explicit events
      if (!window.__PNL_SAMPLER__){
        window.__PNL_SAMPLER__ = setInterval(()=>{
          try{
            if (window.PnLBridge && window.PnLBridge.store){
              window.PnLBridge.store._pushPoint();
              window.PnLBridge.store.markDirty();
            }
          }catch(e){}
        }, 250);
      }
    }
  }

  function initOnce(){
    if (window.__PnL_INIT__) return false;

    const { kpi, canvas } = pickEl();
    if (!kpi || !canvas) return false;
    if (!hasAPI() || !window.PnLBridge) return false;

    const s = pickState();
    const getCash = ()=>{
  const v = (s.cash ?? s.playerCash);
  if (typeof v === 'number') return v;
  try{ if (window.__PnLLastCash) return window.__PnLLastCash; }catch(e){}
  try{
    const el = document.getElementById('cash');
    if (el){ const n = Number(el.textContent.replace(/[^\d.-]/g,'')); if (!Number.isNaN(n)) return n; }
  }catch(e){}
  return 0;
};
    const getPositions = ()=>{
  const obj = (s.positions ?? s.holdings);
  if (obj && typeof obj === 'object') return obj;
  try{ if (window.__PnLLastPortfolio && window.__PnLLastPortfolio.positions) return window.__PnLLastPortfolio.positions; }catch(e){}
  const rows = document.querySelectorAll('[data-sym][data-qty]');
  const out = {};
  rows.forEach(row=>{
    const sym = row.getAttribute('data-sym');
    const qty = Number(row.getAttribute('data-qty')||'0');
    if (sym && qty) out[sym]=qty;
  });
  return out;
};
    const getMark = (sym)=>{
  try{
    if (window.marketAPI && typeof window.marketAPI.getLastPrice==='function') return window.marketAPI.getLastPrice(sym);
  }catch(e){}
  try{
    if (Array.isArray(window.TICKERS)){
      const t = window.TICKERS.find(x=>x && (x.symbol===sym||String(x.symbol)===String(sym)));
      if (t && typeof t.price==='number') return t.price;
    }
  }catch(e){}
  try{
    const row = document.querySelector(`[data-sym="$${sym}"][data-price]`);
    if (row){ const n = Number(row.getAttribute('data-price')||''); if (!Number.isNaN(n)) return n; }
  }catch(e){}
  return 0;
};

    try{
      if (!window.PnLBridge) throw new Error('PnLBridge missing');
      window.PnLBridge.init({
        getCash, getPositions, getMark,
        mountKpiEl: kpi,
        mountCanvasEl: canvas
      });
      window.PnLBridge.start();
      wireEvents();
      window.__PnL_INIT__ = true;
      console.log('[PnL] streaming mounted');
      return true;
    }catch(e){
      console.warn('[PnL] init failed, will retry', e);
      return false;
    }
  }

  function ready(cb){
    if (document.readyState === 'complete' || document.readyState === 'interactive') cb();
    else document.addEventListener('DOMContentLoaded', cb, { once:true });
  }

  // Expose manual hook for login flows
  window.initPnLStreaming = function(){ initOnce(); };

  // Retry loop to catch auth + DOM mounts
  ready(function(){
    let tries = 0;
    const iv = setInterval(()=>{
      tries++;
      if (initOnce() || tries > 240) clearInterval(iv);
    }, 250);
  });
})();
