(function(){
  // Keep UI in lockstep with pnl-store
  const REALIZE_AGAINST = 'MARK'; // 'MARK' or 'AVG'

  // Lightweight DOM/helpers
  function el(tag, cls, text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=String(text); return e; }
  const fmt = n => Number.isFinite(+n) ? (+n).toLocaleString(undefined,{maximumFractionDigits:2}) : '—';
  const pct = (last, avg) => (!avg ? 0 : ((last/avg)-1)*100);
  function livePrice(sym){
    // rolling series for mini chart
    const __series = { equity: [], cash: [] };
    const __pushPoint = (t, equity, cash) => {
      const lim = 600;
      __series.equity.push([t, Number(equity)||0]);
      __series.cash.push([t, Number(cash)||0]);
      if (__series.equity.length>lim) __series.equity.shift();
      if (__series.cash.length>lim) __series.cash.shift();
    };
    function __computeEquityFrom(state){
      try{
        let eq=0;
        const pos = state.positions||[];
        for (const p of pos){
          const last = livePrice(p.sym);
          if (typeof last==='number') eq += (p.qty||0) * last;
        }
        return eq;
      }catch(e){ return 0; }
    }
    function __drawMiniChart(canvas){
      if(!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width = canvas.clientWidth;
      const H = canvas.height = canvas.clientHeight;
      // background
      ctx.fillStyle = '#060806';
      ctx.fillRect(0,0,W,H);
      // grid
      ctx.strokeStyle = 'rgba(0,255,140,0.15)';
      ctx.lineWidth = 1;
      for (let i=1;i<4;i++){ const y = Math.round((H*i)/4)+0.5; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      // extents
      const allY = __series.equity.map(x=>x[1]).concat(__series.cash.map(x=>x[1]));
      if (!allY.length) return;
      let minY = Math.min(...allY), maxY = Math.max(...allY);
      if (minY===maxY){ minY-=1; maxY+=1; }
      const t0 = __series.equity.length?__series.equity[0][0]:Date.now()-1;
      const t1 = __series.equity.length?__series.equity[__series.equity.length-1][0]:Date.now();
      const tx = (t)=> ( (t - t0) / (t1 - t0 || 1) ) * (W-2) + 1;
      const ty = (v)=> H - ((v - minY)/(maxY-minY || 1))*(H-2) - 1;
      function plot(series, alphaMul){
        ctx.beginPath();
        const a = Math.max(0.6*alphaMul,0.2);
        ctx.strokeStyle = `rgba(0,255,140,${a})`;
        ctx.shadowBlur = 6; ctx.shadowColor = 'rgba(0,255,140,0.35)';
        let first=true;
        for (const [t,v] of series){ const x=tx(t), y=ty(v); if(first){ctx.moveTo(x,y); first=false;} else {ctx.lineTo(x,y);} }
        ctx.stroke(); ctx.shadowBlur = 0;
      }
      plot(__series.equity,1.0); // bright line
      plot(__series.cash,0.5);   // dim line
      // last dots
      const lastE = __series.equity[__series.equity.length-1]; const lastC = __series.cash[__series.cash.length-1];
      ctx.fillStyle = 'rgba(0,255,140,0.9)'; if (lastE){ ctx.beginPath(); ctx.arc(tx(lastE[0]), ty(lastE[1]), 2.2, 0, Math.PI*2); ctx.fill(); }
      ctx.fillStyle = 'rgba(0,255,140,0.6)'; if (lastC){ ctx.beginPath(); ctx.arc(tx(lastC[0]), ty(lastC[1]), 2.0, 0, Math.PI*2); ctx.fill(); }
    }

    try{
      if (Array.isArray(window.TICKERS)){
        const t = window.TICKERS.find(x=>x && (x.symbol===sym||String(x.symbol)===String(sym)));
        if (t && typeof t.price==='number') return t.price;
      }
    }catch(e){}
    return null;
  }

  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  // Tiny pie
  function drawPie(canvas, slices){
    const ctx = canvas.getContext('2d'); const dpr = window.devicePixelRatio||1;
    const w=canvas.clientWidth|0, h=canvas.clientHeight|0; canvas.width=w*dpr; canvas.height=h*dpr; ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,w,h);
    const r=Math.min(w,h)/2-8, cx=w/2, cy=h/2;
    let ang=-Math.PI/2;
    const total=slices.reduce((t,s)=>t+(+s.value||0),0) || 1;
    slices.forEach((s,i)=>{
      const frac=(+s.value||0)/total, a2=ang+frac*2*Math.PI;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,ang,a2); ctx.closePath();
      // auto palette
      const hue = Math.floor((i*47)%360);
      ctx.fillStyle = `hsl(${hue} 60% 45%)`; ctx.fill();
      ang=a2;
    });
  }

  // Public entry: window.initPnLPanel(container, adapters, opts)
  window.initPnLPanel = function(container, adapters, opts){
    opts = Object.assign({ title:'P&L', pollMs:1500 }, opts||{});
    const state = {
      rows: [], cash: 0, realized: 0, search:'', sortKey:'value', sortDir:-1, filterMinValue:0,
      history: [], selectedTicker: null
    };

    // Frame
    const root = el('div','pnl-panel');
    const card = el('div','card'); root.appendChild(card);
    const header = el('div','header');
    header.appendChild(el('h2', null, opts.title));
    const controls = el('div','controls'); header.appendChild(controls);
    // filters / sort
    const search = el('input'); search.placeholder='Filter by ticker…'; controls.appendChild(search);
    const minVal = el('input'); minVal.type='number'; minVal.placeholder='Min position $'; controls.appendChild(minVal);
    const sortSel = el('select'); ['value','gainPct','ticker','shares','last','avgPrice'].forEach(k=>{ const o=el('option',null,k); o.value=k; sortSel.appendChild(o); }); controls.appendChild(sortSel);
    const dirBtn = el('button','btn small', '↑/↓'); controls.appendChild(dirBtn);

    // quick actions
    const quick = el('div','quick-actions');
    const btnCSV = el('button','btn small ghost','Export CSV');
    const btnCloseWinners = el('button','btn small', 'Close Winners');
    const btnCloseLosers  = el('button','btn small danger', 'Close Losers');
    quick.append(btnCSV, btnCloseWinners, btnCloseLosers);

    
header.appendChild(quick);

// Quick action handlers
btnCSV.onclick = ()=>{
  try{
    const rows = state.rows.map(r=>({ticker:r.ticker, shares:r.shares, avgPrice:r.avgPrice, last:r.last, value:r.value}));
    const head = 'ticker,shares,avg,last,value\n';
    const body = rows.map(r=>[r.ticker,r.shares,r.avgPrice,r.last,r.value].join(',')).join('\n');
    const blob = new Blob([head+body], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='pnl.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 500);
  }catch(e){ alert('Export failed: '+(e&&e.message||e)); }
};

btnCloseWinners.onclick = async ()=>{
  try{
    for (const r of state.rows) {
      const basis=(REALIZE_AGAINST==='MARK'?r.last:r.avgPrice); const plNow=(r.last-basis)*r.shares;
      if (plNow > 0 && r.shares>0) { await adapters.sell({ticker:r.ticker, amount:r.shares}); }
    }
    await refresh();
  }catch(e){ alert('Close winners failed: '+(e&&e.message||e)); }
};

btnCloseLosers.onclick = async ()=>{
  try{
    for (const r of state.rows) {
      const basis=(REALIZE_AGAINST==='MARK'?r.last:r.avgPrice); const plNow=(r.last-basis)*r.shares;
      if (plNow < 0 && r.shares>0) { await adapters.sell({ticker:r.ticker, amount:r.shares}); }
    }
    await refresh();
  }catch(e){ alert('Close losers failed: '+(e&&e.message||e)); }
};

    card.appendChild(header);

    // KPIs
    const kpis = el('div','kpis'); card.appendChild(kpis);
    const kpi = (label)=>{ const d=el('div','kpi'); d.appendChild(el('div','label',label)); d.appendChild(el('div','value','—')); return d; };
    const kEquity=kpi('Equity'), kCash=kpi('Cash'), kUPL=kpi('Unrealized P&L'), kDailyIncome=kpi('Daily Income');
    kpis.append(kEquity,kCash,kDailyIncome);

// Mini Equity+Cash Chart (CRT-green)
const chartWrap = el('div','minichart-wrap');
const chartTitle = el('h3', null, 'Equity & Cash');
const mini = document.createElement('canvas'); mini.className='minichart'; mini.width=600; mini.height=42;
chartWrap.append(chartTitle, mini);
card.appendChild(chartWrap);

// series state
const __series = { equity: [], cash: [] };
function __pushPoint(t, eq, cash){
  const lim=600;
  __series.equity.push([t,eq]); if(__series.equity.length>lim) __series.equity.shift();
  __series.cash.push([t,cash]); if(__series.cash.length>lim) __series.cash.shift();
}
function __drawMini(canvas){
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const W=canvas.width=canvas.clientWidth, H=canvas.height=canvas.clientHeight;
  ctx.fillStyle='#060806'; ctx.fillRect(0,0,W,H);
  const all=__series.equity.concat(__series.cash); if(!all.length) return;
  let min=Math.min(...all.map(d=>d[1])), max=Math.max(...all.map(d=>d[1]));
  if(min===max){min-=1;max+=1;}
  const t0=__series.equity[0]?__series.equity[0][0]:Date.now()-1;
  const t1=__series.equity[__series.equity.length-1]?__series.equity[__series.equity.length-1][0]:Date.now();
  const tx=t=>((t-t0)/(t1-t0||1))*W, ty=v=>H-((v-min)/(max-min||1))*H;
  const plot=(series,a)=>{ctx.beginPath();ctx.strokeStyle=`rgba(0,255,140,${a})`;let first=true;
    for(const [t,v] of series){const x=tx(t),y=ty(v);if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);}ctx.stroke();};
  plot(__series.equity,0.9); plot(__series.cash,0.5);
}


// after KPIs created, nothing else


    // Body: table + right col
    const body = el('div','body'); card.appendChild(body);
    const tableWrap = el('div','table-wrap'); body.appendChild(tableWrap);
    const table = el('table'); tableWrap.appendChild(table);
    table.innerHTML = `<thead><tr>
      <th>Ticker</th><th>Shares</th><th>Avg</th><th>Last</th><th>Value</th><th>$ Gain</th><th>%</th><th>Actions</th>
    </tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');

    const right = el('div','right-col'); body.appendChild(right); right.style.display='none'; // hidden per user request
    const chartCard = el('div','card chart-card'); right.appendChild(chartCard); chartCard.style.display='none';
    const pie = el('canvas'); pie.style.width='100%'; pie.style.height='260px'; chartCard.appendChild(pie);
    const foot = el('div','footnote','Holdings allocation (positions vs cash).'); chartCard.appendChild(foot);

    const history = el('div','card history'); right.appendChild(history); history.style.display='none';
    const histHeader = el('div','header'); histHeader.append(el('h2',null,'Trade History'), el('div','muted','(select a row)'));
    const histList = el('ul'); history.append(histHeader, histList);


    function computeKPIs(){
      const equity = state.rows.reduce((t,r)=>t+r.value,0);
      const upl = state.rows.reduce((t,r)=>{ const basis=(REALIZE_AGAINST==='MARK'?r.last:r.avgPrice); return t+(r.last-basis)*r.shares; },0);
      kEquity.querySelector('.value').textContent = '$'+fmt(equity);
      kCash.querySelector('.value').textContent   = '$'+fmt(state.cash);
      const net = equity + (Number(state.cash)||0);
      
      kUPL.querySelector('.value').textContent = (upl>=0?'+$':'-$') + fmt(Math.abs(upl));
      // Daily income = passive per 30min × 48 cycles per day
      try {
        const pi = window.__passiveIncome;
        if (pi) {
          const daily = (pi.total||0) * 48;
          const diEl = kDailyIncome.querySelector('.value');
          if (diEl) { diEl.textContent = 'Ƒ'+daily.toLocaleString(); diEl.style.color='#51cf66'; }
        }
      } catch(_) {}
      const slices = state.rows.map(r=>({label:r.ticker, value:r.value}));
      if(state.cash>0) slices.push({label:'$CASH', value: state.cash});
      // drawPie disabled (user request)
    }

    async function renderHistory(){
      const t = state.selectedTicker;
      histHeader.querySelector('.muted').textContent = t ? t : '(select a row)';
      histList.innerHTML = '';
      try{
        const arr = (t && adapters.getHistory) ? await adapters.getHistory(t) : [];
        if(!arr || !arr.length){ histList.appendChild(el('li',null, t ? `No history for ${t}` : 'Select a row')); return; }
        arr.slice(-50).reverse().forEach(x=> histList.appendChild(el('li',null, JSON.stringify(x))));
      }catch(e){
        histList.appendChild(el('li',null,'History unavailable.'));
      }
    }

    function renderTable(){
      const q = (state.search||'').trim().toLowerCase();
      const filtered = state.rows.filter(r=>{
        if(q && !r.ticker.toLowerCase().includes(q)) return false;
        if(state.filterMinValue && r.value < state.filterMinValue) return false;
        return true;
      }).sort((a,b)=>{
        const k = state.sortKey; const av=a[k], bv=b[k];
        if(av<bv) return -1*state.sortDir; if(av>bv) return 1*state.sortDir; return 0;
      });
      tbody.innerHTML='';
      filtered.forEach(r=>{
        const tr = el('tr');
        const basis=(REALIZE_AGAINST==='MARK'?r.last:r.avgPrice); const pl=(r.last-basis)*r.shares;
        const p  = pct(r.last, r.avgPrice);
        tr.innerHTML = `
          <td><strong>${r.ticker}</strong></td>
          <td>${fmt(r.shares)}</td>
          <td>$${fmt(r.avgPrice)}</td>
          <td>$${fmt(r.last)}</td>
          <td>$${fmt(r.value)}</td>
          <td class="${pl>=0?'pos':'neg'}">${pl>=0?'+':'-'}$${fmt(Math.abs(pl))}</td>
          <td class="${p>=0?'pos':'neg'}">${p>=0?'+':'-'}${fmt(Math.abs(p))}%</td>
          <td></td>`;

        // Actions cell
        const actions = el('div','row-actions');
        const btnAll  = el('button','btn small danger','Sell All');
        const btnHalf = el('button','btn small','Sell ½');
        const qty     = el('input','qty'); qty.type='number'; qty.min='1'; qty.step='1'; qty.value=String(Math.max(1, Math.floor(r.shares/4)||1));
        const btnSome = el('button','btn small','Sell Qty');
        const btnHist = el('button','btn small ghost','History');
        actions.append(btnAll, btnHalf, qty, btnSome, btnHist);

        const btnByVal = el('button','btn small','Sell $…');
        const btnCloseGreen = el('button','btn small','Close Green');
        actions.append(btnByVal, btnCloseGreen);

        btnHist.onclick = async ()=>{ state.selectedTicker = r.ticker; await renderHistory(); };

        btnAll.onclick = async ()=>{
          if(!r.shares) return;
          btnAll.disabled=btnHalf.disabled=btnSome.disabled=true;
          try{ await adapters.sell({ticker:r.ticker, amount:r.shares}); await refresh(); }
          catch(e){ alert('Sell all failed: '+(e&&e.message||e)); }
          finally{ btnAll.disabled=btnHalf.disabled=btnSome.disabled=false; }
        };

        btnHalf.onclick = async ()=>{
          const amt = Math.max(1, Math.floor(r.shares/2));
          btnHalf.disabled=true;
          try{ await adapters.sell({ticker:r.ticker, amount: Math.min(amt, r.shares)}); await refresh(); }
          catch(e){ alert('Sell ½ failed: '+(e&&e.message||e)); }
          finally{ btnHalf.disabled=false; }
        };

        btnSome.onclick = async ()=>{
          const v = Math.max(0, Math.floor(+qty.value||0));
          if(!v) return;
          btnSome.disabled=true;
          try{ await adapters.sell({ticker:r.ticker, amount: Math.min(v, r.shares)}); await refresh(); }
          catch(e){ alert('Sell qty failed: '+(e&&e.message||e)); }
          finally{ btnSome.disabled=false; }
        };

        btnByVal.onclick = async ()=>{
          const val = prompt(`Sell by $ value for ${r.ticker}:`);
          if(val==null) return;
          const dollars = parseFloat(val)||0;
          if(!(dollars>0) || !(r.last>0)) return;
          const sharesAmt = Math.min(r.shares, Math.floor(dollars / r.last));
          if(!sharesAmt) return;
          btnByVal.disabled = true;
          try{ await adapters.sell({ticker:r.ticker, amount: sharesAmt}); await refresh(); }
          catch(e){ alert('Sell $ failed: '+(e&&e.message||e)); }
          finally{ btnByVal.disabled = false; }
        };

        btnCloseGreen.onclick = async ()=>{
          const basis=(REALIZE_AGAINST==='MARK'?r.last:r.avgPrice); const plNow=(r.last-basis)*r.shares;
          if(plNow<=0) { alert('Not a winner.'); return; }
          btnCloseGreen.disabled = true;
          try{ await adapters.sell({ticker:r.ticker, amount:r.shares}); await refresh(); }
          catch(e){ alert('Close green failed: '+(e&&e.message||e)); }
          finally{ btnCloseGreen.disabled = false; }
        };

        tr.lastElementChild.appendChild(actions);
        tbody.appendChild(tr);
      });
    }

    async function refresh(){
      // Fallbacks if adapters don't supply live data
      const fallbackPortfolio = (function(){
        try{
          var p = window.__PnLLastPortfolio;
          if (p && Array.isArray(p.positions)) {
            return p.positions.map(function(po){
              return { ticker: po.sym, shares: po.qty, avgPrice: po.px };
            });
          }
        }catch(e){}
        return null;
      })();
      const fallbackCash = (function(){
        try{ if (window.ME && typeof window.ME.cash === 'number') return window.ME.cash; }catch(e){}
        return null;
      })();

      try{
        const portfolio = (await adapters.getPortfolio?.()) || fallbackPortfolio || [];
        const prices = await Promise.all((portfolio||[]).map(p=>adapters.getPrice(p.ticker)));
        /*__LIVE_ROWS_COMPUTE__*/
      state.rows = (portfolio||[]).map((p,i)=>{
          let last = +prices[i]||0; if (!last){ const lp = livePrice(p.ticker); if (lp) last = lp; }
          if (!last && +p.avgPrice) { last = +p.avgPrice; } // guard to avoid -100% before first tick
          const shares = +p.shares||0, avg = +p.avgPrice||0;
          return { ticker:p.ticker, shares, avgPrice:avg, last, value: shares*last, gainPct: pct(last, avg) };
        });
        state.cash = (await adapters.getCash?.()) ?? fallbackCash ?? 0;
        state.realized = (await adapters.getRealized?.()) ?? 0;
      }catch(e){
        // Keep UI visible even if data fails
        console.warn('[PnL] refresh error', e);
      }
      computeKPIs(); renderTable();
    }

    // wire inputs
    search.oninput = ()=>{ state.search = search.value; renderTable(); };
    minVal.oninput = ()=>{ state.filterMinValue = parseFloat(minVal.value)||0; renderTable(); };
    sortSel.onchange = ()=>{ state.sortKey = sortSel.value; renderTable(); };
    dirBtn.onclick = ()=>{ state.sortDir *= -1; renderTable(); };

    container.innerHTML=''; container.appendChild(root);
    // Listen for immediate market updates (buy/sell/cash changes) to refresh without waiting for poll
    const onMarketUpdated = ()=>{ try{ refresh(); }catch(e){} };
    window.addEventListener('market:updated', onMarketUpdated);

    // Also refresh when P&L tab becomes visible
    try{
      const pnlTabEl = document.getElementById('pnlTab') || container.closest('#pnlTab');
      if (pnlTabEl && window.MutationObserver){
        const visObs = new MutationObserver(()=>{
          const vis = getComputedStyle(pnlTabEl).display !== 'none';
          if (vis) { onMarketUpdated(); }
        });
        visObs.observe(pnlTabEl, { attributes:true, attributeFilter:['style','class'] });
        // store for cleanup
        root.__visObs = visObs;
      }
    }catch(e){}


    // Polling disabled — pnlBox is now driven by liveUpdatePnL() on every market tick.
    // This panel is kept for its sell actions / CSV export; display is handled upstream.
    let dead = false;

    
    

    // Persist cash periodically so refresh restores balance
    ;(function persistCashLoop(){
      try{
        var c = (window.ME && typeof window.ME.cash==='number') ? window.ME.cash : null;
        if (c!=null) localStorage.setItem('pnl:lastCash', String(c));
      }catch(e){}
      setTimeout(persistCashLoop, 2000);
    })();
    
    
    // seed series once on init
    try{ const eq0 = state.rows.reduce((t,r)=>t+r.value,0); __pushPoint(Date.now(), eq0, state.cash||0); __drawMini(mini); }catch(_){}
    return function destroy(){
      dead=true;
      try{ window.removeEventListener('market:updated', onMarketUpdated); }catch(e){}
      try{ if(root.__visObs){ root.__visObs.disconnect(); delete root.__visObs; } }catch(e){}
      container.innerHTML='';
    };

  };
})();

// (legacy PnL refresh injector removed; streaming boot handles updates)
