// Canvas renderer + KPI updater. Draws incrementally using RAF.
(function(global){
  class PnLCanvas {
    _color(name, fallback){ try{ return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback; }catch(e){ return fallback; } }
    
    constructor({ canvas, kpiEl, store }){
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.kpiEl = kpiEl;
      this.store = store;
      this.lastSeq = -1;
      this._resize();
      addEventListener('resize', ()=>this._resize());
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
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (series.length < 2) return;

      // scale
      const t0 = series[0][0], t1 = series[series.length-1][0];
      let vmin = Infinity, vmax = -Infinity;
      for (const [,v] of series){ if (v < vmin) vmin = v; if (v > vmax) vmax = v; }
      const pad = (vmax - vmin) * 0.1 || 1;
      vmin -= pad; vmax += pad;

      const tx = (t)=> ( (t - t0) / (t1 - t0 || 1) ) * (w-12) + 6;
      const ty = (v)=> h - (((v - vmin) / (vmax - vmin || 1)) * (h-12) + 6);

      // axes (minimal grid)
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.strokeStyle = this._color('--dim', 'rgba(255,198,98,0.35)');
      ctx.beginPath();
      ctx.moveTo(0.5, 0.5);
      ctx.lineTo(0.5, h-0.5);
      ctx.lineTo(w-0.5, h-0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // line
      ctx.beginPath();
      ctx.strokeStyle = this._color('--amber', '#FFC662');
      ctx.lineWidth = 1.5;
      ctx.moveTo(tx(series[0][0]), ty(series[0][1]));
      for (let i=1;i<series.length;i++){
        const [t, v] = series[i];
        ctx.lineTo(tx(t), ty(v));
      }
      ctx.stroke();

      // last point marker
      const [lt, lv] = series[series.length-1];
      ctx.beginPath();
      ctx.fillStyle = this._color('--amber', '#FFC662');
      ctx.arc(tx(lt), ty(lv), 2.5, 0, Math.PI*2);
      ctx.fill();
    }

    _renderKpis(snap){
      if (!this.kpiEl) return;
      const fmt = (n)=> (n>=1e9? (n/1e9).toFixed(2)+'B' : n>=1e6? (n/1e6).toFixed(2)+'M' : n>=1e3? (n/1e3).toFixed(2)+'k' : n.toFixed(2));
      const total = snap.cash + snap.equity;
      this.kpiEl.innerHTML = `
        <div class="kpi"><div class="lbl">Equity</div><div class="val">${fmt(snap.equity)}</div></div>
        <div class="kpi"><div class="lbl">Cash</div><div class="val">${fmt(snap.cash)}</div></div>
        <div class="kpi"><div class="lbl">Unrealized</div><div class="val">${fmt(total - snap.realized - snap.cash)}</div></div>
        <div class="kpi"><div class="lbl">Realized</div><div class="val">${fmt(snap.realized)}</div></div>
      `;
    }

    start(){
      const loop = ()=>{
        this.store.flush();
        requestAnimationFrame(loop);
      };
      this.unsubscribe = this.store.subscribe((snap)=>{
        if (snap.seq === this.lastSeq) return;
        this.lastSeq = snap.seq;
        this._clear();
        this._renderKpis(snap);
        this._drawSeries(snap.series);
      });
      loop();
    }
  }

  global.PnLCanvas = PnLCanvas;
})(window);
