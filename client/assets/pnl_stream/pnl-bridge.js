// Minimal adapter so your game can hook P&L
(function(global){
  const Bridge = {
    /** Force an immediate PnL sample so KPIs/graph reflect cash changes without waiting for a market tick. */
    pushNow(ts){ try{
      if (this.store && typeof this.store._pushSeries === 'function'){
        this.store._pushSeries(ts || (performance && performance.now ? performance.now() : Date.now()));
      }
    }catch(_e){} },
    init(opts){
      if (this._inited) return;
      this._inited = true;
      this.getCash = opts.getCash;
      this.getPositions = opts.getPositions;
      this.getMark = opts.getMark;
      this.getRealized = opts.getRealized;
      this.getEquity = opts.getEquity;

      this.store = new PnLStore();
      this.store.setGetters({
        getCash: this.getCash,
        getPositions: this.getPositions,
        getMark: this.getMark,
        getRealized: this.getRealized,
        getEquity: this.getEquity
      });
    },
    start(){ /* canvas is mounted from boot; noop */ },
    onPriceTick(evt){ try{ this.store && this.store.onPriceTick(evt); }catch(e){} },
    onTrade(evt){ try{ this.store && this.store.onTrade(evt); }catch(e){} },
  };
  global.PnLBridge = Bridge;
})(window);
