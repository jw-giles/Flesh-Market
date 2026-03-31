
// trade-limit.js -- Day-trade display (server-authoritative)
// Server enforces the 3-trade cap per 30-min EOD cycle.
// This file: displays the badge, greys out trade buttons at 0,
// shows countdown timer, syncs from server-pushed dt_update/portfolio messages,
// and exposes gate functions for shorts.js / sound.js early-warning checks.
(function(){
  // Server-pushed remaining count (default 3 until first server message)
  window._dtServerRemaining = 3;
  var _countdownInterval = null;

  // ── Inject CSS for greyed-out state + timer overlay ──
  if (!document.getElementById('dtLimitCSS')){
    var st = document.createElement('style'); st.id = 'dtLimitCSS';
    st.textContent = [
      '.dt-locked{opacity:.3!important;cursor:not-allowed!important;pointer-events:none!important;filter:grayscale(.8)}',
      '#dt-timer-overlay{display:none;position:absolute;inset:0;background:rgba(10,5,0,.85);z-index:20;align-items:center;justify-content:center;flex-direction:column;gap:4px;border-radius:6px;pointer-events:none}',
      '#dt-timer-overlay.show{display:flex}',
      '#dt-timer-overlay .dt-timer-label{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#ff6b6b;font-family:monospace}',
      '#dt-timer-overlay .dt-timer-clock{font-size:1.1rem;color:#e6c27a;font-weight:bold;font-family:monospace;letter-spacing:.08em}',
      '#dayTradeBadge.dt-exhausted{color:#ff6b6b!important;font-weight:bold}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function getNextResetMs(){
    // Day trades reset every 30 minutes aligned to :00 and :30
    var now = new Date();
    var m = now.getMinutes();
    var nextMin = m < 30 ? 30 : 60;
    var target = new Date(now);
    if (nextMin === 60){
      target.setHours(target.getHours() + 1);
      target.setMinutes(0);
    } else {
      target.setMinutes(30);
    }
    target.setSeconds(0); target.setMilliseconds(0);
    return Math.max(0, target.getTime() - now.getTime());
  }

  function fmtCountdown(ms){
    var totalSec = Math.ceil(ms / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    return (min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function ensureTimerOverlay(){
    if (document.getElementById('dt-timer-overlay')) return;
    var limitPanel = document.getElementById('limitPanel');
    if (limitPanel){
      limitPanel.style.position = 'relative';
      var ov = document.createElement('div');
      ov.id = 'dt-timer-overlay';
      ov.innerHTML = '<div class="dt-timer-label">\u274C Day Trades Exhausted</div><div class="dt-timer-clock" id="dt-timer-clock">--:--</div><div class="dt-timer-label">Resets in</div>';
      limitPanel.appendChild(ov);
    }
  }

  function setTradeButtonsLocked(locked){
    var ids = ['buy','sell','shortBtn','limitPlaceBtn'];
    for (var i = 0; i < ids.length; i++){
      var btn = document.getElementById(ids[i]);
      if (btn){
        if (locked){ btn.classList.add('dt-locked'); }
        else { btn.classList.remove('dt-locked'); }
      }
    }
    ensureTimerOverlay();
    var ov = document.getElementById('dt-timer-overlay');
    if (ov){
      if (locked){ ov.classList.add('show'); }
      else { ov.classList.remove('show'); }
    }
  }

  function startCountdown(){
    if (_countdownInterval) return;
    _countdownInterval = setInterval(function(){
      if (window._dtServerRemaining > 0){
        stopCountdown();
        return;
      }
      var ms = getNextResetMs();
      var el = document.getElementById('dt-timer-clock');
      if (el) el.textContent = fmtCountdown(ms);
    }, 500);
  }

  function stopCountdown(){
    if (_countdownInterval){ clearInterval(_countdownInterval); _countdownInterval = null; }
    var el = document.getElementById('dt-timer-clock');
    if (el) el.textContent = '--:--';
  }

  function setBadge(){
    try{
      var el = document.getElementById('dayTradeBadge') || (function(){
        var cashEl = document.getElementById('cash');
        if (cashEl && cashEl.parentElement){
          var b = document.createElement('span');
          b.id = 'dayTradeBadge';
          b.className = 'muted';
          b.style.marginLeft = '8px';
          cashEl.parentElement.appendChild(b);
          return b;
        }
        return null;
      })();
      if (el){
        var left = window._dtServerRemaining;
        if (left <= 0){
          var ms = getNextResetMs();
          el.textContent = '(Day Trades: 0 / 3 \u00b7 resets ' + fmtCountdown(ms) + ')';
          el.classList.add('dt-exhausted');
        } else {
          el.textContent = '(Day Trades left: ' + left + ' / 3)';
          el.classList.remove('dt-exhausted');
        }
      }
    }catch(e){}
  }

  function applyState(){
    var left = window._dtServerRemaining;
    setBadge();
    if (left <= 0){
      setTradeButtonsLocked(true);
      startCountdown();
    } else {
      setTradeButtonsLocked(false);
      stopCountdown();
    }
  }

  // ── Stubs for backwards compat (sound.js, index.html) ──
  window.__dtLoad   = function(){ return { roundTrips: 3 - (window._dtServerRemaining||3) }; };
  window.__dtSave   = function(){};
  window.__dtEnsure = function(st){ return st; };

  // ── Gate functions for shorts.js ──────────────────────────────────────────
  window.__dtOpenShort = function(){
    if ((window._dtServerRemaining||0) <= 0){
      try{ window.showToast('\u274C Day-trade limit reached (3). Resets at next EOD.', '#ff6a6a'); }catch(e){}
      return false;
    }
    return true;
  };
  window.__dtCoverShort = function(){
    if ((window._dtServerRemaining||0) <= 0){
      try{ window.showToast('\u274C Day-trade limit reached (3). Resets at next EOD.', '#ff6a6a'); }catch(e){}
      return false;
    }
    return true;
  };

  // ── Listen for server updates ─────────────────────────────────────────────
  document.addEventListener('fm_ws_msg', function(e){
    var msg = e.detail; if(!msg) return;
    if (msg.type === 'dt_update' && msg.data && typeof msg.data.dayTradesRemaining === 'number'){
      window._dtServerRemaining = msg.data.dayTradesRemaining;
      applyState();
    }
    if (msg.type === 'portfolio' && msg.data && typeof msg.data.dayTradesRemaining === 'number'){
      window._dtServerRemaining = msg.data.dayTradesRemaining;
      applyState();
    }
  });

  function boot(){
    applyState();
    setInterval(function(){ setBadge(); }, 5000);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
