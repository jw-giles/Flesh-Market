
// trade-limit.js -- Day-trade pairing by event (buy->sell pairs), 3 per day hard cap
// Regular trades: each SELL that follows at least one unpaired BUY of the same symbol = 1 day-trade.
// Short trades:   opening a short issues a shortTicket; covering pairs it and = 1 day-trade.
// Total cap = 3 round trips across all symbols per calendar day.
(function(){
  // RESET day-trade state every fresh load (no accounts yet)
  try {
    const _now = new Date();
    const _k = `FM:dt:${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    localStorage.removeItem(_k);
    localStorage.removeItem('dayTradesUsed');
    localStorage.removeItem('dayTradeCount');
    localStorage.removeItem('day_trades_used');
    localStorage.removeItem('day_trades');
    localStorage.removeItem('dt_used');
    localStorage.removeItem('globalDayTradesUsed');
    localStorage.setItem('dayTradesRemaining','3');
    localStorage.setItem('dayTradesLeft','3');
  } catch(e) {}

  function todayKey(){
    try{ const d=new Date(); return `FM:dt:${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }catch(e){ return 'FM:dt'; }
  }
  function load(){ try{ return JSON.parse(localStorage.getItem(todayKey())||'{}'); }catch(e){} return {}; }
  function save(st){ try{ localStorage.setItem(todayKey(), JSON.stringify(st||{})); }catch(e){} }
  function ensure(st){
    st.roundTrips   = Number(st.roundTrips||0)|0;
    st.tickets      = st.tickets||{};
    st.shortTickets = st.shortTickets||{};
    return st;
  }
  function symOf(symbol){
    if (symbol) return String(symbol).toUpperCase();
    try{ const e=document.getElementById('sym'); if (e && e.value) return String(e.value).toUpperCase(); }catch(e){}
    try{ if (typeof window.CURRENT==='string' && window.CURRENT) return String(window.CURRENT).toUpperCase(); }catch(e){}
    return '';
  }
  function remaining(st){ return Math.max(0, 3 - st.roundTrips); }

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
        const st = ensure(load());
        el.textContent = `(Day Trades left: ${remaining(st)} / 3)`;
      }
    }catch(e){}
  }

  // ── Shared public state accessors (used by limit order handler in index.html) ──
  window.__dtLoad   = load;
  window.__dtSave   = save;
  window.__dtEnsure = ensure;

  // ── Public API for short modal ──────────────────────────────────────────────
  // Opening a short: issues a shortTicket (mirrors a "buy ticket" for longs).
  // Returns false if limit hit (blocks the action), true if allowed.
  window.__dtOpenShort = function(symbol){
    let st = ensure(load());
    const SYM = symOf(symbol);
    if (remaining(st) <= 0){
      try{ window.showToast('❌ Day-trade limit reached (3). Cannot open new short.', '#ff6a6a'); }catch(e){ alert('Day-trade limit reached for today (3).'); }
      setBadge(); return false;
    }
    if (SYM){ st.shortTickets[SYM] = Number(st.shortTickets[SYM]||0) + 1; save(st); }
    setBadge(); return true;
  };

  // Covering a short: pairs with shortTicket and consumes one round trip.
  // Returns false if limit hit, true if allowed.
  window.__dtCoverShort = function(symbol){
    let st = ensure(load());
    const SYM = symOf(symbol);
    if (remaining(st) <= 0){
      try{ window.showToast('❌ Day-trade limit reached (3). Cannot cover short today.', '#ff6a6a'); }catch(e){ alert('Day-trade limit reached for today (3).'); }
      setBadge(); return false;
    }
    if (SYM && Number(st.shortTickets[SYM]||0) > 0){
      st.shortTickets[SYM] = Number(st.shortTickets[SYM]) - 1;
      st.roundTrips = Math.min(3, Number(st.roundTrips||0) + 1);
      save(st);
    }
    setBadge(); return true;
  };

  function wrap(){
    if (!window.marketAPI || typeof window.marketAPI.buy!=='function' || typeof window.marketAPI.sell!=='function') return false;
    if (window.__DT_WRAPPED__) return true;
    window.__DT_WRAPPED__ = true;
    const origBuy = window.marketAPI.buy;
    const origSell = window.marketAPI.sell;

    window.marketAPI.buy = async function(symbol, qty){
      let st = ensure(load());
      const SYM = symOf(symbol);
      if (remaining(st) <= 0){ try{ alert('Day-trade limit reached for today (3).'); }catch(e){}; setBadge(); return; }
      if (SYM){ st.tickets[SYM] = Number(st.tickets[SYM]||0) + 1; save(st); }
      setBadge();
      return await origBuy.apply(this, arguments);
    };

    window.marketAPI.sell = async function(symbol, qty){
      let st = ensure(load());
      const SYM = symOf(symbol);
      if (remaining(st) <= 0){ try{ alert('Day-trade limit reached for today (3).'); }catch(e){}; setBadge(); return; }
      const res = await origSell.apply(this, arguments);
      if (SYM && Number(st.tickets[SYM]||0) > 0){
        st.tickets[SYM] = Number(st.tickets[SYM]) - 1;
        st.roundTrips = Math.min(3, Number(st.roundTrips||0)+1);
        save(st);
      }
      setBadge();
      return res;
    };
    return true;
  }

  function boot(){
    setBadge();
    if (!wrap()){
      const iv = setInterval(()=>{ if (wrap()){ clearInterval(iv); setBadge(); } }, 500);
      setTimeout(()=>{ try{ clearInterval(iv); }catch(e){} }, 20000);
    }
    setInterval(setBadge, 2000);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
