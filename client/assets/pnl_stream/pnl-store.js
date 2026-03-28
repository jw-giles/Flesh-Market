// PnL Store — single source of truth + dedupe + snapshots
(function(global){
  // === CONFIG: Realization basis ===
  // 'AVG' (default legacy) realizes P&L against position's average cost.
  // 'MARK' realizes P&L against the last marked price (current listed market mark),
  // which captures profit from the most recent market move.
  const REALIZE_AGAINST = 'MARK'; // change to 'AVG' to restore legacy behavior

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  class PnLStore {
    constructor() {
      this.seq = 0;
      this.cash = 0;
      this.realized = 0;
      this.positions = {}; // sym -> { qty, avg, last }
      this.seenTrades = new Set(); // dedupe by trade id
      this.ticks = 0;

      // ring buffer of snapshots (time, equity)
      this.capacity = 3000;
      this.bufferT = new Float64Array(this.capacity);
      this.bufferV = new Float64Array(this.capacity);
      this.head = 0;
      this.size = 0;

      this.listeners = new Set();
      this._pushedThisCycle = false;
      this._dirty = false;
    }

    subscribe(fn){
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    markDirty(){ this._dirty = true; this._pushedThisCycle = false; }

    // Called per animation frame by renderer
    flush(){
      if (!this._dirty) return;
      this._dirty = false;
      const snap = this.snapshot();
      for (const fn of this.listeners) fn(snap);
    }

    // External hooks
    setGetters({ getCash, getPositions, getMark, getRealized, getEquity }){
      this.getCash = getCash;
      this.getPositions = getPositions;
      this.getMark = getMark;
      this.getRealized = getRealized;
      this.getEquity = getEquity;
    }

    // Price tick
    onPriceTick({ symbol, price }){
      if (!this.positions[symbol]) {
        // track last mark even without pos for equity calc accuracy
        this.positions[symbol] = { qty: 0, avg: 0, last: price };
      } else {
        this.positions[symbol].last = price;
      }
      this.ticks++;
      if ((this.ticks & 1) === 0) this._pushPoint(); // half-rate point insert
      this.markDirty();
    }

    // Trade exec
    onTrade({ id, side, symbol, qty, price }){
      if (id && this.seenTrades.has(id)) return; // dedupe
      if (id) this.seenTrades.add(id);

      const p = this.positions[symbol] || (this.positions[symbol] = { qty: 0, avg: 0, last: price });
      qty = (side === "SELL" ? -Math.abs(qty) : Math.abs(qty));

      const newQty = p.qty + qty;

      if (qty > 0) { // buy
        // new avg price
        p.avg = (p.avg * p.qty + price * qty) / (p.qty + qty);
        p.qty = newQty;
      } else { // sell
        const sellQty = -qty;
        let realizedAdd;
        if (REALIZE_AGAINST === 'MARK') {
          // Transfer current UPL to realized at the moment of sale (mark-to-market)
          realizedAdd = (p.last - p.avg) * Math.min(sellQty, p.qty);
        } else {
          // Legacy: realize versus average cost at execution price
          realizedAdd = (price - p.avg) * Math.min(sellQty, p.qty);
        }
        this.realized += realizedAdd; if(!Number.isFinite(this.realized)||Number.isNaN(this.realized)) this.realized = 0;
        p.qty = newQty;
        if (p.qty <= 0.000001) { p.qty = 0; p.avg = 0; }
      }

      p.last = price;
      this._pushPoint();
      this.markDirty();
    try{ this._pushPoint(); }catch(e){}
    }

    // compute equity from current marks (fallback to getters if provided)
    
  _computeEquity(){
      // Robust equity calc: supports positions as object map or array
      try{
        // If app provides getEquity, prefer it (already wired via setGetters)
        if (this.getEquity){
          const v = Number(this.getEquity());
          if (Number.isFinite(v)) return v;
        }
      }catch(e){}
      let equity = 0;
      const positions = this.getPositions ? this.getPositions() : this.positions || {};
      if (Array.isArray(positions)){
        for (const it of positions){
          const sym = it && (it.sym || it.symbol);
          const qty = Number((it && (it.qty ?? it.shares ?? it.amount ?? it.position)) || 0);
          // prefer inline price, else use getter
          let px = Number(it && (it.px ?? it.price ?? it.last)) || 0;
          if ((!px || !isFinite(px)) && sym && this.getMark) px = Number(this.getMark(sym)) || 0;
          equity += qty * px;
        }
      } else {
        for (const sym in positions) {
          const pos = positions[sym];
          const qty = (typeof pos === "number") ? Number(pos) :
                      Number((pos && (pos.qty ?? pos.shares ?? pos.amount ?? pos.position)) || 0);
          let last = 0;
          if (pos && (pos.last!=null || pos.px!=null || pos.price!=null)) {
            last = Number(pos.last ?? pos.px ?? pos.price) || 0;
          } else if (this.getMark) {
            last = Number(this.getMark(sym)) || 0;
          }
          equity += qty * last;
        }
      }
      if (!Number.isFinite(equity)) equity = 0;
      return equity;
    }


    _pushPoint(){
      const t = performance.now();
      const cash = this.getCash ? this.getCash() : this.cash;
      const equity = this._computeEquity();
      const total = equity; // store equity only; cash tracked separately

      const i = (this.head + this.size) % this.capacity;
      this.bufferT[i] = t;
      this.bufferV[i] = total;
      if (this.size < this.capacity) this.size++;
      else this.head = (this.head + 1) % this.capacity;
      this.seq++;
      this._pushedThisCycle = true;
    }

    snapshot(){
      const out = {
        seq: this.seq,
        cash: this.getCash ? this.getCash() : this.cash,
        realized: this.realized,
        equity: this._computeEquity(),
        series: this._seriesSlice(1200), // last ~1200 points
        positions: this.positions,
      };
      return out;
    }

    _seriesSlice(n){
      const take = Math.min(n, this.size);
      const arr = new Array(take);
      for (let k=0; k<take; k++){
        const idx = (this.head + this.size - take + k) % this.capacity;
        arr[k] = [this.bufferT[idx], this.bufferV[idx]];
      }
      return arr;
    }
  }

  global.PnLStore = PnLStore;
})(window);
