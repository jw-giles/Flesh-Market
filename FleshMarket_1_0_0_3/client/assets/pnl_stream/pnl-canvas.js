function __computeEquity(){
  try {
    const pos = (window.__POSITIONS_MAP || {});
    const marks = (window.__LAST_MARKS || {});
    let equity = 0, shares = 0;
    for (const sym in pos){
      const qty = Number(pos[sym]) || 0;
      const last = Number(marks[sym] ?? 0);
      equity += qty * last;
      shares += qty;
    }
    return { equity, shares };
  } catch (e) {
    return { equity: 0, shares: 0 };
  }
}

(function(global){
  class PnLCanvas {
    constructor({ canvas, kpiEl, kpiNode, store }){
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.kpiEl = kpiEl || kpiNode;
      this.store = store;
      this.lastSeq = -1;
      this._cashSeries = [];
      this._resize();
      addEventListener('resize', ()=>this._resize());
    }

    _normSeries(raw){
      if (!Array.isArray(raw)) return [];
      if (raw.length && Array.isArray(raw[0])) return raw; // already [t,v]
      // plain numeric array -> map to [index,value]
      const out = new Array(raw.length);
      for (let i=0;i<raw.length;i++){ const v = Number(raw[i])||0; out[i] = [i, v]; }
      return out;
    }

    _resize(){
      const dpr = devicePixelRatio || 1;
      this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
      this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
      this.ctx.setTransform(dpr,0,0,dpr,0,0);
      this._clear();
      this._needsFullRedraw = true;
    }
    _clear(){
      const { ctx, canvas } = this;
      ctx.clearRect(0,0,canvas.clientWidth, canvas.clientHeight);
    }
    _drawSeries(series){
      const { ctx, canvas } = this;
      const W = canvas.clientWidth|0, H = canvas.clientHeight|0;
      const eqRaw = this._normSeries(Array.isArray(series) ? series.slice(-600) : []);
      const csRaw = this._normSeries(Array.isArray(this._cashSeries) ? this._cashSeries.slice(-600) : []);
      if ((eqRaw.length + csRaw.length) < 2) return;
      function toPct(arr){
        if (!arr || arr.length===0) return [];
        let base = Number(arr[0][1]) || 1;
        if (!isFinite(base) || base===0) base = 1;
        return arr.map(([t,v],i)=> [i, ((Number(v)-base)/base)*100 ]);
      }
      const eq = toPct(eqRaw);
      const cs = toPct(csRaw);
      const all = eq.concat(cs);
      let vmin = Infinity, vmax = -Infinity;
      for (let i=0;i<all.length;i++){ 
        const v = Number(all[i][1]); 
        if (isFinite(v)){ if (v<vmin) vmin=v; if (v>vmax) vmax=v; } 
      }
      if (!isFinite(vmin) || !isFinite(vmax)){ return; }
      if (vmin===vmax){ vmin-=1; vmax+=1; }
      const maxAbs = Math.max(Math.abs(vmin), Math.abs(vmax));
      vmin = -maxAbs*1.1; vmax = maxAbs*1.1;
      const xi = (i,n)=> (n<=1?0:(i/(n-1))*(W-2)+1);
      const yv = (v)=> H - ((v - vmin)/(vmax - vmin || 1))*(H-2) - 1;
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle = '#0a0804'; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle = 'rgba(0,255,140,0.12)'; ctx.lineWidth = 1;
      for(let gy=1;gy<4;gy++){ const y=Math.round((H*gy)/4)+0.5; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(0,255,140,0.28)';
      const y0 = Math.round(yv(0))+0.5; ctx.beginPath(); ctx.moveTo(0,y0); ctx.lineTo(W,y0); ctx.stroke();
      function plot(arr, alpha){
        if (!arr || arr.length<2) return;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0,255,140,${alpha})`;
        ctx.lineWidth = 1.25; ctx.lineJoin='round'; ctx.lineCap='round';
        const n = arr.length;
        for (let i=0;i<n;i++){ const x=xi(i,n), y=yv(Number(arr[i][1])); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
        ctx.stroke();
        const xL = xi(n-1,n), yL = yv(Number(arr[n-1][1]));
        ctx.beginPath(); ctx.fillStyle = `rgba(0,255,140,${Math.max(alpha,0.45)})`; ctx.arc(xL,yL,2.3,0,Math.PI*2); ctx.fill();
      }
      plot(eq,0.95);
      plot(cs,0.55);
    }
    _renderKpis(snap){
      if (!this.kpiEl) return;
      let equityNow = 0;
      try {
        const eqSer = this._normSeries(snap.series||[]);
        if (eqSer.length) equityNow = Number(eqSer[eqSer.length-1][1])||0;
      } catch(e){ equityNow = 0; }
      const cashNow = Number(snap.cash)||0;
      const eqPct = (function(){ try{ const _eq=this._normSeries(snap.series||[]); const a=(_eq[0]&&Number(_eq[0][1])||0), b=(_eq[_eq.length-1]&&Number(_eq[_eq.length-1][1])||0); if(!a) return '0%'; const p=((b-a)/a*100); return (p>=0?'+':'')+p.toFixed(2)+'%'; }catch(e){ return '0%'; } })();
      const cashPct = (function(){ try{ const s=(this._cashSeries||[]); const a=(s[0]&&Number(s[0][1])||0), b=(s[s.length-1]&&Number(s[s.length-1][1])||0); if(!a) return '0%'; const p=((b-a)/a*100); return (p>=0?'+':'')+p.toFixed(2)+'%'; }catch(e){ return '0%'; } }).call(this);
      this.kpiEl.innerHTML = [
        `<div class="kpi"><div class="lbl">Equity</div><div class="val">¤${(equityNow>=0?equityNow:0).toLocaleString(undefined,{maximumFractionDigits:2})} <span class="muted">(${eqPct})</span></div></div>`,
        `<div class="kpi"><div class="lbl">Cash</div><div class="val">¤${(cashNow>=0?cashNow:0).toLocaleString(undefined,{maximumFractionDigits:2})} <span class="muted">(${cashPct})</span></div></div>`
      ].join("");
    }
    start(){
      if (!this.store || !this.canvas) return;
      const loop = ()=>{ try{ this.store.flush && this.store.flush(); }catch(e){} requestAnimationFrame(loop); };
      this.unsubscribe = this.store.subscribe((snap)=>{
        if (!snap || snap.seq === this.lastSeq) return;
        this.lastSeq = snap.seq;
        this._clear();
        this._renderKpis(snap);
        try{
          const now = (performance && performance.now)? performance.now() : Date.now();
          this._cashSeries.push([now, Number(snap.cash)||0]);
          if (this._cashSeries.length>1800) this._cashSeries.shift();
        }catch(e){}
        this._drawSeries(snap.series || []);
      });
      loop();
    }
  }
  global.PnLCanvas = PnLCanvas;
})(window);
