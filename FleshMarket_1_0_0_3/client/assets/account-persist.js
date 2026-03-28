
// account-persist.js
// Client-only persistence of per-user cash & portfolio snapshots.
// No VPS/server required. Uses localStorage with a generated stable account id.

(function(){
  const LS_ID = 'acct:id';
  const LS_PREFIX = 'acct:data:'; // -> acct:data:<id> = JSON
  const START_CASH_KEY = 'pnl:lastCash'; // legacy fallback key

  function uuidv4(){
    // simple RFC4122-ish uuid
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  function getId(){
    // Do NOT auto-create. Return null if missing; login/create will set it.
    let id = (window.AccountStorage||localStorage).getItem(LS_ID);
    return id || null;
  }

  function load(){
    const id = getId();
    if (!id) return null;
    const raw = (window.AccountStorage||localStorage).getItem(LS_PREFIX + id);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e){ return null; }
  }

  function save(patch){
    const id = getId();
    const cur = load() || {};
    const data = Object.assign({}, cur, patch || {});
    data.updatedAt = Date.now();
    (window.AccountStorage||localStorage).setItem(LS_PREFIX + id, JSON.stringify(data));
    // Keep legacy keys in sync so existing P&L fallback still works
    if (typeof data.cash === 'number') {
      (window.AccountStorage||localStorage).setItem('pnl:lastCash', String(data.cash));
    }
    if (data.portfolio) {
      (window.AccountStorage||localStorage).setItem('pnl:lastPortfolio', JSON.stringify(data.portfolio));
    }
  }

  function applyToRuntime(){
    // Restore cash early for UI
    const data = load();
    if (!data) return;
    try {
      if (window.ME){
        if (typeof data.cash === 'number') window.ME.cash = data.cash;
        if (data.name && !window.ME.name) window.ME.name = data.name;
      }
      // Provide portfolio snapshot for P&L
      if (data.portfolio && !window.__PnLLastPortfolio){
        window.__PnLLastPortfolio = data.portfolio;
      }
      window.dispatchEvent(new Event('market:updated'));
    } catch(e){}
  }

  function capturePortfolioSnapshot(){
    // Best-effort: look for a global positions object or scrape DOM
    let portfolio = null;
    try {
      if (window.ME && window.ME.positions) {
        portfolio = window.ME.positions;
      } else if (window.__PnLLastPortfolio) {
        portfolio = window.__PnLLastPortfolio;
      } else {
        // DOM scrape of #positions list into a minimal { sym: qty }
        const list = document.getElementById('positions');
        if (list){
          const entries = {};
          list.querySelectorAll('[data-sym][data-qty]').forEach(row => {
            const sym = row.getAttribute('data-sym');
            const qty = Number(row.getAttribute('data-qty')||'0');
            if (sym && qty) entries[sym] = qty;
          });
          if (Object.keys(entries).length) portfolio = { positions: entries };
        }
      }
    } catch(e){}
    return portfolio;
  }

  function currentCash(){
    try{
      if (window.ME && typeof window.ME.cash === 'number') return window.ME.cash;
      // Try read from cash label "$12,345"
      const el = document.getElementById('cash');
      if (el){
        const m = (el.textContent||'').replace(/[^0-9.\-]/g,''); 
        const v = Number(m);
        if (!isNaN(v)) return v;
      }
    }catch(e){}
    return undefined;
  }

  function wire(){
    // Apply on load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyToRuntime);
    } else {
      applyToRuntime();
    }

    // Save on any market updates
    function onUpdate(){
      const data = {};
      const c = currentCash();
      if (typeof c === 'number') data.cash = c;
      const pf = capturePortfolioSnapshot();
      if (pf) data.portfolio = pf;
      save(data);
    }
    window.addEventListener('market:updated', function(){ setTimeout(onUpdate, 0); });

    // Also hook typical APIs as triggers
    const api = window.marketAPI || {};
    ['buy','sell','deposit','withdraw','transfer'].forEach(k=>{
      const fn = api[k];
      if (typeof fn === 'function' && !fn.__persistWrapped){
        api[k] = async function(){
          const r = await fn.apply(this, arguments);
          try{ window.dispatchEvent(new Event('market:updated')); }catch(e){}
          return r;
        };
        api[k].__persistWrapped = true;
      }
    });
    window.marketAPI = api;

    // Periodic autosave (safety net)
    setInterval(function(){ try{ window.dispatchEvent(new Event('market:updated')); }catch(e){} }, 5000);

    // Save before unload
    window.addEventListener('beforeunload', function(){
      try{ window.dispatchEvent(new Event('market:updated')); }catch(e){}
    });

    // Expose Account helper
    window.Account = {
      get id(){ return getId(); },
      load, save,
      reset: function(){
        const id = getId();
        (window.AccountStorage||localStorage).removeItem(LS_PREFIX + id);
        (window.AccountStorage||localStorage).removeItem('pnl:lastCash');
        (window.AccountStorage||localStorage).removeItem('pnl:lastPortfolio');
      }
    };
  }

  wire();
})();
