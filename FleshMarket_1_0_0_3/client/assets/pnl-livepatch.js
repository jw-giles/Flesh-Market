(function(){
  function emit(){ try{ window.dispatchEvent(new Event('market:updated')); }catch(e){} }
  function tryHook(){
    if (!window.marketAPI) return false;
    ['buy','sell','deposit','withdraw','transfer'].forEach(function(k){

    // --- PnL Bridge trade hints (synthesize trades for the store) ---
    function synthTrade(side, args){
      try{
        if (!window.PnLBridge || !window.PnLBridge.onTrade) return;
        const a = args && args[0] || {};
        const symbol = (a.ticker || a.symbol || a.sym || a.t || '').toUpperCase();
        const qty = Math.max(1, Math.floor(a.amount || a.qty || a.shares || 0));
        if (!symbol || !qty) return;
        let px = 0;
        try{
          if (window.marketAPI && typeof window.marketAPI.getPrice === 'function'){
            px = Number(window.marketAPI.getPrice(symbol));
          }
        }catch(e){}
        window.PnLBridge.onTrade({ id: 'synthetic:'+Date.now()+Math.random(), side: side.toUpperCase(), symbol, qty, price: px||0 });
      }catch(e){}
    }

      var orig = window.marketAPI[k];
      if (typeof orig === 'function'){
        window.marketAPI[k] = async function(){
          var res = await orig.apply(this, arguments);
          try{ if(k==='buy'||k==='sell') synthTrade(k, arguments); }catch(e){}
          emit();
          return res;
        };
      }
    });
    // Fallback DOM observers: cash label & positions list mutations
    try{
      var cash = document.getElementById('cash');
      if (cash && window.MutationObserver){
        var mo = new MutationObserver(function(){ emit(); });
        mo.observe(cash, { childList:true, characterData:true, subtree:true });
        window.__pnlCashMO = mo;
      }
      var pos = document.getElementById('positions');
      if (pos && window.MutationObserver){
        var mo2 = new MutationObserver(function(){ emit(); });
        mo2.observe(pos, { childList:true, subtree:true });
        window.__pnlPosMO = mo2;
      }
    }catch(e){}
    // Emit on tab clicks (market / pnl) to be safe
    document.addEventListener('click', function(e){
      var id = (e.target && e.target.id) || '';
      if (id === 'marketTab' || id === 'pnlTab' || id === 'tab-market' || id === 'tab-pnl'){
        setTimeout(emit, 0);
      }
    }, true);
    return true;
  }
  function start(){
    if(tryHook()) return;
    var tries=0, id=setInterval(function(){
      tries++;
      if(tryHook() || tries>20) clearInterval(id);
    }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

  // Hook into renderPositions so P&L mirrors the same live updates as the bottom stats
  (function hookRenderPositions(){
    function emit(){ try{ window.dispatchEvent(new Event('market:updated')); }catch(e){} }
    var tries=0;
    (function wait(){
      tries++;
      var fn = window.renderPositions;
      if (typeof fn === 'function' && !fn.__pnlWrapped){
        window.renderPositions = function(){
          var res = fn.apply(this, arguments);
          // Next tick to allow DOM/ME updates to settle
          try{ setTimeout(emit, 0); }catch(e){}
          return res;
        };
        window.renderPositions.__pnlWrapped = true;
        emit();
        return;
      }
      if (tries < 200) setTimeout(wait, 100);
    })();
  })();


// Emit market:updated on every price tick by wrapping renderTickers()
(function hookRenderTickers(){
  function emit(){ try{ window.dispatchEvent(new Event('market:updated')); }catch(e){} }
  var tries=0;
  (function wait(){
    tries++;
    var fn = window.renderTickers;
    if (typeof fn === 'function' && !fn.__pnlWrapped){
      window.renderTickers = function(){
        var res = fn.apply(this, arguments);
        try{ setTimeout(emit, 0); }catch(e){}
        return res;
      };
      window.renderTickers.__pnlWrapped = true;
      return;
    }
    if (tries < 200) setTimeout(wait, 100);
  })();
})();

// Prefer live TICKERS prices for P&L getPrice
(function overrideGetPriceForTickers(){
  var tries=0;
  (function wait(){
    tries++;
    var api = window.marketAPI;
    if (api && typeof api.getPrice === 'function' && !api.getPrice.__pnlWrapped){
      var orig = api.getPrice;
      api.getPrice = async function(symbol){
        try{
          if (Array.isArray(window.TICKERS)){
            var t = window.TICKERS.find(function(x){ return x && (x.symbol===symbol || x.symbol===String(symbol)); });
            if (t && typeof t.price === 'number'){ return t.price; }
          }
        }catch(e){}
        return orig.apply(this, arguments);
      };
      api.getPrice.__pnlWrapped = true;
      return;
    }
    if (tries < 200) setInterval(wait, 100);
  })();
})();

// Store latest portfolio snapshot so P&L can fall back if adapters don't supply it
(function captureLastPortfolio(){
  var tries=0;
  (function wait(){
    tries++;
    var fn = window.renderPositions;
    if (typeof fn === 'function' && !fn.__pnlCaptureWrapped){
      window.renderPositions = function(){
        var p = arguments && arguments[0];
        try { if (p && typeof p === 'object') { window.__PnLLastPortfolio = p; } } catch(e){}
        var res = fn.apply(this, arguments);
        try{ setTimeout(function(){ window.dispatchEvent(new Event('market:updated')); }, 0); }catch(e){}
        return res;
      };
      window.renderPositions.__pnlCaptureWrapped = true;
      return;
    }
    if (tries < 200) setTimeout(wait, 100);
  })();
})();

// === Persistence: cache portfolio & cash so refresh doesn't blank UI ===
;(function persistPnL(){
  function save(){
    try{
      if (window.__PnLLastPortfolio) localStorage.setItem('pnl:lastPortfolio', JSON.stringify(window.__PnLLastPortfolio));
      if (window.ME && typeof window.ME.cash === 'number') localStorage.setItem('pnl:lastCash', String(window.ME.cash));
    }catch(e){}
  }
  // Save on each update event
  window.addEventListener('market:updated', function(){ setTimeout(save, 0); });
  // Save after renderPositions wrapper too (already emits market:updated)
  // Restore early on load so P&L has something immediately
  function restore(){
    try{
      var p = localStorage.getItem('pnl:lastPortfolio');
      if (p && !window.__PnLLastPortfolio){
        try{ window.__PnLLastPortfolio = JSON.parse(p); }catch(e){}
      }
      var c = localStorage.getItem('pnl:lastCash');
      if (c && window.ME && typeof window.ME.cash !== 'number'){
        var v = Number(c); if (!isNaN(v)) window.ME.cash = v;
      }
      // Nudge P&L
      try{ window.dispatchEvent(new Event('market:updated')); }catch(e){}
    }catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restore); else restore();
})();
