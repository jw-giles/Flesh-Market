
(function(){
  // ── Blocked users (client-side only, stored in localStorage) ─────────────
  var BLOCK_KEY = 'fm_blocked_users';
  function getBlocked(){
    try { return JSON.parse(localStorage.getItem(BLOCK_KEY)||'[]'); } catch(e){ return []; }
  }
  function saveBlocked(arr){
    try { localStorage.setItem(BLOCK_KEY, JSON.stringify(arr)); } catch(e){}
  }
  window.FM_Block = {
    isBlocked: function(name){ return getBlocked().map(function(n){return n.toLowerCase();}).indexOf((name||'').toLowerCase()) !== -1; },
    block: function(name){
      if(!name) return;
      var list = getBlocked();
      if(list.map(function(n){return n.toLowerCase();}).indexOf(name.toLowerCase()) === -1){
        list.push(name);
        saveBlocked(list);
      }
      // Hide all existing messages from this user in all channels
      document.querySelectorAll('.chat-msg[data-user]').forEach(function(el){
        if((el.dataset.user||'').toLowerCase() === name.toLowerCase()) el.style.display='none';
      });
      try{ showToast('🚫 Blocked ' + name + ' (this session only)', '#ff6644'); }catch(e){}
    },
    unblock: function(name){
      var list = getBlocked().filter(function(n){ return n.toLowerCase() !== (name||'').toLowerCase(); });
      saveBlocked(list);
      document.querySelectorAll('.chat-msg[data-user]').forEach(function(el){
        if((el.dataset.user||'').toLowerCase() === name.toLowerCase()) el.style.display='';
      });
      try{ showToast('✅ Unblocked ' + name, '#90ffa8'); }catch(e){}
    },
    list: function(){ return getBlocked(); },
    clearAll: function(){ saveBlocked([]); document.querySelectorAll('.chat-msg[data-user]').forEach(function(el){ el.style.display=''; }); }
  };

  // addChat block filtering: injected into the global function after DOM ready
  // The addChat function already checks FM_Block at render via data-user attribute
  // We also do a late-patch here so any runtime calls are intercepted
  document.addEventListener('DOMContentLoaded', function(){
    var _orig = window.addChat;
    if(_orig){
      window.addChat = function(item){
        if(item && item.user && item.user !== 'SYSTEM' && window.FM_Block && window.FM_Block.isBlocked(item.user)) return;
        return _orig.apply(this, arguments);
      };
    }
  });

  // ── Unmoderated chat 18+ modal ─────────────────────────────────────────────
  var UNMOD_AGREED_KEY = 'fm_unmod_agreed';
  var _pendingUnmodSwitch = false;

  function hasAgreedUnmod(){
    try { return localStorage.getItem(UNMOD_AGREED_KEY) === '1'; } catch(e){ return false; }
  }
  function setAgreedUnmod(){
    try { localStorage.setItem(UNMOD_AGREED_KEY, '1'); } catch(e){}
  }

  function showUnmodWarningModal(){
    var m = document.getElementById('unmod-warning-modal');
    if(m){ m.style.display='flex'; }
  }
  function hideUnmodWarningModal(){
    var m = document.getElementById('unmod-warning-modal');
    if(m){ m.style.display='none'; }
  }
  function showPatronGateModal(){
    var m = document.getElementById('unmod-patron-gate-modal');
    if(m){ m.style.display='flex'; }
  }
  function hidePatronGateModal(){
    var m = document.getElementById('unmod-patron-gate-modal');
    if(m){ m.style.display='none'; }
  }

  // Revert UI back to global tab (when modal is cancelled)
  function revertToGlobalTab(){
    document.querySelectorAll('.chat-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelectorAll('.chat-channel').forEach(function(c){ c.classList.remove('active'); });
    var tab  = document.querySelector('.chat-tab[data-channel="global"]');
    var pane = document.getElementById('chatch-global');
    if(tab)  tab.classList.add('active');
    if(pane) pane.classList.add('active');
    // Trigger a real click on global so the chat IIFE closure variable is updated
    if(tab) tab.click();
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Gate check on unmod tab — runs AFTER the general tab listener sets _activeChatChannel
    var unmodTab = document.getElementById('unmod-chat-tab');
    if(unmodTab){
      unmodTab.addEventListener('click', function(e){
        var tier = (window.ME && window.ME.patreon_tier) || 0;
        var isPatron = tier >= 1 || !!(window.ME && (window.ME.is_dev || window.ME.is_prime || window.ME.is_admin));
        if(!isPatron){
          // Revert immediately then show gate
          revertToGlobalTab();
          showPatronGateModal();
          return;
        }
        if(!hasAgreedUnmod()){
          // Revert immediately then show warning — accept will re-click the tab
          revertToGlobalTab();
          showUnmodWarningModal();
        }
        // else: general listener already set _activeChatChannel = 'unmod' correctly, nothing to do
      });
    }

    // Accept button — save agreement then click the tab (general listener will set channel correctly)
    var acceptBtn = document.getElementById('unmod-accept-btn');
    if(acceptBtn){
      acceptBtn.addEventListener('click', function(){
        setAgreedUnmod();
        hideUnmodWarningModal();
        var unmodTab = document.getElementById('unmod-chat-tab');
        if(unmodTab) unmodTab.click();
      });
    }
    // Decline button
    var declineBtn = document.getElementById('unmod-decline-btn');
    if(declineBtn){
      declineBtn.addEventListener('click', function(){
        hideUnmodWarningModal();
        revertToGlobalTab();
      });
    }
    // Patron gate close
    var gateClose = document.getElementById('unmod-gate-close-btn');
    if(gateClose){
      gateClose.addEventListener('click', function(){
        hidePatronGateModal();
        revertToGlobalTab();
      });
    }
    // Click outside modals to close
    var pgModal = document.getElementById('unmod-patron-gate-modal');
    if(pgModal){
      pgModal.addEventListener('click', function(e){
        if(e.target === pgModal){ hidePatronGateModal(); revertToGlobalTab(); }
      });
    }
    var wModal = document.getElementById('unmod-warning-modal');
    if(wModal){
      wModal.addEventListener('click', function(e){
        if(e.target === wModal){ hideUnmodWarningModal(); revertToGlobalTab(); }
      });
    }
  });
})();
