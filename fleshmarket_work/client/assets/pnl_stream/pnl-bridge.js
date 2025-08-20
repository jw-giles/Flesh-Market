// Minimal adapter so you can call these from your game code
(function(global){
  const Bridge = {
    init(opts){
      if (this._inited) return;
      this._inited = true;
      this.getCash = opts.getCash;
      this.getPositions = opts.getPositions;
      this.getMark = opts.getMark;

      this.store = new PnLStore();
      this.store.setGetters({ getCash: this.getCash, getPositions: this.getPositions, getMark: this.getMark });

      this.canvas = new PnLCanvas({
        canvas: opts.mountCanvasEl,
        kpiEl: opts.mountKpiEl,
        store: this.store
      });
    },
    start(){
      if (this._started) return;
      this._started = true;
      this.canvas.start();
    },
    onPriceTick(evt){ this.store.onPriceTick(evt); },
    onTrade(evt){ this.store.onTrade(evt); },
  };

  global.PnLBridge = Bridge;
})(window);
