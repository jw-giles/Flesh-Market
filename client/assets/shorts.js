
(function(){
  const BORROW_RATE = 0.001; // mirror server: 0.1% per 30min
  const MARGIN_RATE = 0.50;  // 50% of position value required as collateral
  const MAX_SHORT   = 500;   // max shares shorted per symbol

  function upper(x){ return String(x||'').toUpperCase().trim(); }
  function price(sym){ return (typeof getLastPrice==='function') ? (getLastPrice(sym)||0) : 0; }
  function owned(sym){ return (typeof getOwnedQty==='function') ? (getOwnedQty(sym)||0) : 0; }
  function cash(){
    try{ if(typeof ME==='object'&&ME&&typeof ME.cash==='number') return ME.cash; }catch(e){}
    try{ if(window.__MY_CASH!=null) return Number(window.__MY_CASH)||0; }catch(e){}
    try{ if(window.__PnLLastCash!=null) return Number(window.__PnLLastCash)||0; }catch(e){}
    // Last resort: parse the #cash display element
    try{
      const t = document.getElementById('cash')?.textContent||'';
      const n = parseFloat(t.replace(/[^0-9.]/g,''));
      if(n>0) return n;
    }catch(e){}
    return 0;
  }
  function fmt(n){ return 'Ƒ'+Number(n).toFixed(2); }
  function avgCost(sym){ return (typeof getAvgCost==='function') ? (getAvgCost(sym)||0) : 0; }

  function getShortPositions(){
    // __MY_POSITIONS is set from the portfolio WS message and stores raw qty including negatives
    // __POSITIONS_MAP uses Math.max(0,qty) so shorts are stripped — don't use it here
    try{
      const src = window.__MY_POSITIONS || {};
      const out = {};
      for(const [sym, val] of Object.entries(src)){
        const q = typeof val === 'number' ? val : Number(val?.qty ?? val?.position ?? 0);
        if(q < 0) out[sym] = q;
      }
      if(Object.keys(out).length > 0) return out;
    }catch(e){}
    // Fallback: server positions map (has qty objects)
    try{
      const src2 = window.__SERVER_POSITIONS || window.__PnLLastPortfolio?.positions || {};
      const out2 = {};
      for(const [sym, val] of Object.entries(src2)){
        const q = typeof val === 'number' ? val : Number(val?.qty ?? val?.position ?? 0);
        if(q < 0) out2[sym] = q;
      }
      return out2;
    }catch(e){ return {}; }
  }

  const SM = {
    mode: 'open',
    _ticker: null,

    el(){ return document.getElementById('short-modal'); },

    open(sym){
      const E = this.el(); if (!E) return;
      E.style.display = 'flex';
      // Auto-detect: if user already short on this sym, default to cover
      const shortPos = getShortPositions();
      if(sym && shortPos[sym] != null){
        this.setMode('cover');
        document.getElementById('shc-sym').value = sym;
        this.updateCover();
      } else {
        this.setMode('open');
        if(sym) document.getElementById('sho-sym').value = sym;
        this.updateOpen();
      }
      this._ticker = setInterval(()=>{ try{ if(this.mode==='open') this.updateOpen(); else this.updateCover(); }catch(e){} }, 1500);
    },

    close(){
      const E = this.el(); if(E) E.style.display = 'none';
      clearInterval(this._ticker); this._ticker = null;
    },

    setMode(mode){
      this.mode = mode;
      document.getElementById('short-open-body').style.display  = mode==='open'  ? '' : 'none';
      document.getElementById('short-cover-body').style.display = mode==='cover' ? '' : 'none';
      document.getElementById('sho-confirm-btn').style.display  = mode==='open'  ? '' : 'none';
      document.getElementById('shc-confirm-btn').style.display  = mode==='cover' ? '' : 'none';
      document.getElementById('short-tab-open').classList.toggle('active', mode==='open');
      document.getElementById('short-tab-cover').classList.toggle('active', mode==='cover');
      if(mode==='cover') this.updateCover(); else this.updateOpen();
    },

    updateOpen(){
      const sym = upper(document.getElementById('sho-sym').value);
      const qty = Math.max(1, parseInt(document.getElementById('sho-qty').value||'1')||1);
      const px  = price(sym);
      const priceEl  = document.getElementById('sho-price');
      const procEl   = document.getElementById('sho-proceeds');
      const margEl   = document.getElementById('sho-margin');
      const feeEl    = document.getElementById('sho-fee');
      const warnEl   = document.getElementById('sho-warn');
      const okEl     = document.getElementById('sho-ok');
      const confirmBtn = document.getElementById('sho-confirm-btn');

      priceEl.textContent  = px ? fmt(px) : '—';
      procEl.textContent = px ? fmt(px * qty * 0.997) : '—';
      margEl.textContent = px ? fmt(px * qty * MARGIN_RATE) : '—';
      feeEl.textContent  = px ? fmt(px * qty * BORROW_RATE) : '—';

      warnEl.style.display='none'; okEl.style.display='none';
      confirmBtn.disabled = !sym;

      if(!sym) return;

      if(!px){
        okEl.textContent = `✓ Ready to short ${qty}× ${sym} (price loading...)`;
        okEl.style.display='block'; return;
      }

      const proceeds  = px * qty * 0.997;
      const margin    = px * qty * MARGIN_RATE;
      const fee       = px * qty * BORROW_RATE;
      const myCash    = cash();
      const curShort  = Math.abs(Math.min(0, owned(sym)));
      const newShort  = curShort + qty;

      if(newShort > MAX_SHORT){
        warnEl.textContent = `⚠ Max short per symbol is ${MAX_SHORT} shares. You already have ${curShort} shorted.`;
        warnEl.style.display='block'; return;
      }
      if(myCash > 0 && myCash < margin){
        warnEl.textContent = `⚠ Insufficient margin. Need ${fmt(margin)} cash collateral, have ${fmt(myCash)}.`;
        warnEl.style.display='block';
        // still allow click — server will reject with proper message
      } else {
        okEl.textContent = `✓ Sell short ${qty}× ${sym} @ ~${fmt(px)} · receive ${fmt(proceeds)} · ${fmt(fee)}/30m fee`;
        okEl.style.display='block';
      }
    },

    updateCover(){
      const sym = upper(document.getElementById('shc-sym').value);
      const shortPos = getShortPositions();
      const posListEl = document.getElementById('shc-pos-list');

      // Populate short positions list
      const entries = Object.entries(shortPos);
      if(entries.length === 0){
        posListEl.innerHTML = '<span style="opacity:.5">No open short positions.</span>';
      } else {
        posListEl.innerHTML = entries.map(([s, q])=>{
          const px2 = price(s), avg2 = avgCost(s);
          const pnl = avg2 ? (avg2 - px2) * Math.abs(q) : 0;
          const cls = pnl >= 0 ? 'profit' : 'loss';
          return `<div class="spos-row"><span class="spos-sym">${s}</span><span class="spos-qty">${q} shares</span><span class="spos-pnl ${cls}">${fmt(pnl)}</span> <span style="opacity:.4;font-size:.7rem">@ Ƒ${px2.toFixed(2)}</span></div>`;
        }).join('');
      }

      const posQty = Math.abs(shortPos[sym]||0);
      document.getElementById('shc-position').textContent = sym ? (posQty > 0 ? `-${posQty} shares` : 'No short position') : '—';
      const qty  = Math.max(1, Math.min(parseInt(document.getElementById('shc-qty').value||'1')||1, posQty||1));
      const px   = price(sym);
      const avg  = avgCost(sym);
      document.getElementById('shc-price').textContent = px   ? fmt(px)  : '—';
      document.getElementById('shc-avg').textContent   = avg  ? fmt(avg) : '—';
      const costEl = document.getElementById('shc-cost');
      const pnlEl  = document.getElementById('shc-pnl');
      const warnEl = document.getElementById('shc-warn');
      const confirmBtn = document.getElementById('shc-confirm-btn');

      if(!sym || !px || posQty === 0){
        costEl.textContent='—'; pnlEl.textContent='—';
        warnEl.style.display='none'; confirmBtn.disabled = !sym || posQty===0;
        return;
      }

      document.getElementById('shc-qty').max = String(posQty);
      const totalCost = px * qty * 1.003;
      const pnl = avg ? (avg - px) * qty : 0;
      costEl.textContent = fmt(totalCost);
      pnlEl.textContent  = (pnl>=0?'+':'')+fmt(pnl);
      pnlEl.style.color  = pnl>=0 ? '#90ffa8' : '#ff7878';
      warnEl.style.display='none'; confirmBtn.disabled=false;

      if(cash() > 0 && cash() < totalCost){
        warnEl.textContent=`⚠ Need ${fmt(totalCost)} to cover. Current cash: ${fmt(cash())}.`;
        warnEl.style.display='block';
        // still allow click, server enforces
      }
    },

    confirmShort(){
      const sym = upper(document.getElementById('sho-sym').value);
      const qty = Math.max(1, parseInt(document.getElementById('sho-qty').value||'1')||1);
      if(!sym) return;
      // Check day-trade limit before sending
      if(typeof window.__dtOpenShort === 'function' && !window.__dtOpenShort(sym)) return;
      const curOwned = Math.max(0, owned(sym));
      const totalSell = curOwned + qty;
      try{
        const payload = {type:'order', side:'sell', symbol:sym, shares:totalSell, qty:totalSell};
        ws.send(JSON.stringify(payload));
        try{ showToast(`⬇ Shorting ${qty}× ${sym}…`, '#ff9090'); }catch(e){}
      }catch(e){}
      this.close();
    },

    confirmCover(){
      const sym = upper(document.getElementById('shc-sym').value);
      const shortPos = getShortPositions();
      const posQty = Math.abs(shortPos[sym]||0);
      const qty = Math.max(1, Math.min(parseInt(document.getElementById('shc-qty').value||'1')||1, posQty));
      if(!sym||!qty) return;
      // Check day-trade limit before sending
      if(typeof window.__dtCoverShort === 'function' && !window.__dtCoverShort(sym)) return;
      try{
        const payload = {type:'order', side:'buy', symbol:sym, shares:qty, qty:qty};
        ws.send(JSON.stringify(payload));
        try{ showToast(`✅ Covering ${qty}× ${sym} short…`, '#90ffa8'); }catch(e){}
      }catch(e){}
      this.close();
    }
  };

  window.__ShortModal = SM;

  document.addEventListener('DOMContentLoaded',()=>{
    const cancelBtn  = document.getElementById('sho-cancel-btn');
    const confirmOpen= document.getElementById('sho-confirm-btn');
    const confirmCov = document.getElementById('shc-confirm-btn');
    if(cancelBtn)   cancelBtn.onclick   = ()=>SM.close();
    if(confirmOpen) confirmOpen.onclick = ()=>SM.confirmShort();
    if(confirmCov)  confirmCov.onclick  = ()=>SM.confirmCover();

    const shoSym = document.getElementById('sho-sym');
    const shoQty = document.getElementById('sho-qty');
    const shcSym = document.getElementById('shc-sym');
    const shcQty = document.getElementById('shc-qty');
    if(shoSym) shoSym.addEventListener('input', ()=>SM.updateOpen());
    if(shoQty) shoQty.addEventListener('input', ()=>SM.updateOpen());
    if(shcSym) shcSym.addEventListener('input', ()=>SM.updateCover());
    if(shcQty) shcQty.addEventListener('input', ()=>SM.updateCover());

    // Close on backdrop click
    const modal = document.getElementById('short-modal');
    if(modal) modal.addEventListener('click', (e)=>{ if(e.target===modal) SM.close(); });
  });
})();
