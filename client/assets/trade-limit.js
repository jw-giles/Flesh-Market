
// trade-limit.js -- Day-trade display (server-authoritative)
// Server enforces the 3-trade cap per 30-min EOD cycle.
// This file: displays the badge, syncs from server-pushed dt_update/portfolio messages,
// and exposes gate functions for shorts.js / sound.js early-warning checks.
(function(){
  // Server-pushed remaining count (default 3 until first server message)
  window._dtServerRemaining = 3;

  function setBadge(){
    try{
      const el = document.getElementById('dayTradeBadge') || (function(){
        const cashEl = document.getElementById('cash');
        if (cashEl && cashEl.parentElement){
          const b = document.createElement('span');
          b.id = 'dayTradeBadge';
          b.className = 'muted';
          b.style.marginLeft = '8px';
          cashEl.parentElement.appendChild(b);
          return b;
        }
        return null;
      })();
      if (el){
        const left = window._dtServerRemaining;
        el.textContent = '(Day Trades left: ' + left + ' / 3)';
      }
    }catch(e){}
  }

  // ── Stubs for backwards compat (sound.js, index.html) ──
  window.__dtLoad   = function(){ return { roundTrips: 3 - (window._dtServerRemaining||3) }; };
  window.__dtSave   = function(){};
  window.__dtEnsure = function(st){ return st; };

  // ── Gate functions for shorts.js ──────────────────────────────────────────
  window.__dtOpenShort = function(){
    if ((window._dtServerRemaining||0) <= 0){
      try{ window.showToast('\u274C Day-trade limit reached (3). Resets at next EOD.', '#ff6a6a'); }catch(e){}
      return false;
    }
    return true;
  };
  window.__dtCoverShort = function(){
    if ((window._dtServerRemaining||0) <= 0){
      try{ window.showToast('\u274C Day-trade limit reached (3). Resets at next EOD.', '#ff6a6a'); }catch(e){}
      return false;
    }
    return true;
  };

  // ── Listen for server updates ─────────────────────────────────────────────
  document.addEventListener('fm_ws_msg', function(e){
    var msg = e.detail; if(!msg) return;
    if (msg.type === 'dt_update' && msg.data && typeof msg.data.dayTradesRemaining === 'number'){
      window._dtServerRemaining = msg.data.dayTradesRemaining;
      setBadge();
    }
    if (msg.type === 'portfolio' && msg.data && typeof msg.data.dayTradesRemaining === 'number'){
      window._dtServerRemaining = msg.data.dayTradesRemaining;
      setBadge();
    }
  });

  function boot(){
    setBadge();
    setInterval(setBadge, 5000);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
