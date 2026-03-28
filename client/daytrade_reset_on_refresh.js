// AUTO-INSERTED: reset day trade limit on refresh while accounts are not implemented
(function(){
  if (typeof window !== 'undefined') {
    window.addEventListener('load', function(){
      try {
        try { localStorage.setItem('dayTradesUsed','0'); } catch(e){}
        try { localStorage.setItem('dayTradeCount','0'); } catch(e){}
        try { localStorage.setItem('day_trades_used','0'); } catch(e){}
        try { localStorage.setItem('day_trades','0'); } catch(e){}
        try { localStorage.setItem('dt_used','0'); } catch(e){}
        try { localStorage.setItem('globalDayTradesUsed','0'); } catch(e){}
        try { localStorage.removeItem('dayTradesRemaining'); } catch(e){}
        try { localStorage.removeItem('dayTradesLeft'); } catch(e){}
        try { localStorage.setItem('dayTradesRemaining','3'); } catch(e){}
        try { localStorage.setItem('dayTradesLeft','3'); } catch(e){}
      } catch(e) {}
    });
  }
})();
