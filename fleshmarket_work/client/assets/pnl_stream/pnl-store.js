// PnL Store — single source of truth + dedupe + snapshots
(function(global){
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
      this._dirty = false;
    }

    subscribe(fn){
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    markDirty(){ this._dirty = true; }

    // Called per animation frame by renderer
    flush(){
      if (!this._dirty) return;
      this._dirty = false;
      const snap = this.snapshot();
      for (const fn of this.listeners) fn(snap);
    }

    // External hooks
    setGetters({ getCash, getPositions, getMark }){
      this.getCash = getCash;
      this.getPositions = getPositions;
      this.getMark = getMark;
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
        const realizedAdd = (price - p.avg) * Math.min(sellQty, p.qty);
        this.realized += realizedAdd;
        p.qty = newQty;
        if (p.qty <= 0.000001) { p.qty = 0; p.avg = 0; }
      }

      p.last = price;
      this._pushPoint();
      this.markDirty();
    }

    // compute equity from current marks (fallback to getters if provided)
    _computeEquity(){
      let equity = 0;
      const positions = this.getPositions ? this.getPositions() : this.positions;
      for (const sym in positions) {
        const pos = positions[sym];
        const last = this.getMark ? this.getMark(sym) ?? pos.last : pos.last;
        equity += (pos.qty || 0) * (last || 0);
      }
      return equity;
    }

    _pushPoint(){
      const t = performance.now();
      const cash = this.getCash ? this.getCash() : this.cash;
      const equity = this._computeEquity();
      const total = cash + equity;

      const i = (this.head + this.size) % this.capacity;
      this.bufferT[i] = t;
      this.bufferV[i] = total;
      if (this.size < this.capacity) this.size++;
      else this.head = (this.head + 1) % this.capacity;
      this.seq++;
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
