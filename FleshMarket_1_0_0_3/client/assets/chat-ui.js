
(function(){
  // ── Chat tab switching ────────────────────────────────────────────────────
  var _activeChatChannel = 'global';
  var ROOMED_CHANNELS = ['global','patreon','guild','unmod'];
  document.querySelectorAll('.chat-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.chat-tab').forEach(function(t){ t.classList.remove('active'); });
      document.querySelectorAll('.chat-channel').forEach(function(c){ c.classList.remove('active'); c.style.display='none'; });
      tab.classList.add('active');
      _activeChatChannel = tab.dataset.channel;
      // Show/hide all room pagers — only the active channel's pager is visible
      ROOMED_CHANNELS.forEach(function(ch){
        var p = document.getElementById(ch + 'RoomPager');
        if (p) p.style.display = ch === _activeChatChannel ? 'flex' : 'none';
      });
      if (ROOMED_CHANNELS.indexOf(_activeChatChannel) !== -1) {
        // Show current room for this channel
        var room = (window.__chatRooms && window.__chatRooms[_activeChatChannel]) || 1;
        var roomId = room === 1 ? 'chatch-' + _activeChatChannel : 'chatch-' + _activeChatChannel + '-r' + room;
        var pane = document.getElementById(roomId) || document.getElementById('chatch-' + _activeChatChannel);
        if (pane) { pane.style.display=''; pane.classList.add('active'); pane.scrollTop = pane.scrollHeight; }
        if (window.updateChannelRoomDots) window.updateChannelRoomDots(_activeChatChannel);
      } else {
        // Dunce or other single-room channels
        var pane = document.getElementById('chatch-' + _activeChatChannel);
        if (pane) { pane.style.display=''; pane.classList.add('active'); pane.scrollTop = pane.scrollHeight; }
      }
      // Guild tab: update placeholder based on guild membership
      if (_activeChatChannel === 'guild') {
        var ph = document.getElementById('guildPlaceholder');
        if (ph && window.ME) {
          var isGuild = (window.ME.patreon_tier && window.ME.patreon_tier >= 2) || window.ME.is_dev || window.ME.is_prime || window.ME.is_admin;
          if (isGuild) {
            ph.textContent = 'Merchants Guild chat. Members only.';
          } else {
            ph.textContent = 'Merchants Guild members only.';
          }
        }
      }
      // Clear unread
      var unread = document.getElementById('unread-' + _activeChatChannel);
      if (unread) { unread.style.display = 'none'; unread.textContent = '0'; }
      var badge = document.getElementById('chatChannelBadge');
      if (badge) {
        if (_activeChatChannel === 'whisper') badge.textContent = '';
        else if (ROOMED_CHANNELS.indexOf(_activeChatChannel) !== -1) {
          var rm = (window.__chatRooms && window.__chatRooms[_activeChatChannel]) || 1;
          badge.textContent = _activeChatChannel + ' · room ' + rm;
        } else badge.textContent = _activeChatChannel;
      }
      var wtbSw=document.getElementById('whisperTargetBadge');
      var ciSw=document.getElementById('chatInput');
      if (_activeChatChannel === 'whisper') {
        if (wtbSw) { if (window._whisperTarget){wtbSw.style.display='inline';wtbSw.textContent='→ '+window._whisperTarget;}else{wtbSw.style.display='none';} }
        if (ciSw) ciSw.placeholder = window._whisperTarget ? ('Whisper to '+window._whisperTarget+'…') : '@name message…';
      } else {
        if (wtbSw) wtbSw.style.display='none';
        if (ciSw && _activeChatChannel !== 'dunce') ciSw.placeholder = 'Say something… @mention';
      }
    });
  });

  // ── @mention autocomplete ────────────────────────────────────────────────
  var drop = document.getElementById('chatMentionDrop');
  var input = document.getElementById('chatInput');
  var _mentionStart = -1;

  function getKnownNames(){
    var names = [];
    try {
      document.querySelectorAll('#board .ticker, #board div').forEach(function(el){
        var t = el.textContent.replace(/.*?\.\s*/,'').replace(/\s*Ƒ.*/,'').trim();
        if(t && t.length>1 && t.length<32) names.push(t);
      });
    } catch(e){}
    if (window.ME && window.ME.name) names.unshift(window.ME.name);
    return [...new Set(names)];
  }

  if (input) {
    input.addEventListener('input', function(){
      var val = input.value;
      var cursor = input.selectionStart;
      var at = val.lastIndexOf('@', cursor-1);
      if (at !== -1 && (at===0 || /\s/.test(val[at-1]))) {
        var partial = val.slice(at+1, cursor).toLowerCase();
        var names = getKnownNames().filter(function(n){ return n.toLowerCase().startsWith(partial) && n.toLowerCase() !== partial; });
        if (names.length) {
          _mentionStart = at;
          drop.innerHTML = '';
          names.slice(0,8).forEach(function(name){
            var item = document.createElement('div');
            item.textContent = '@' + name;
            item.style.cssText = 'padding:5px 10px;cursor:pointer;border-bottom:1px solid #1a1208;color:#ffb547';
            item.addEventListener('mousedown', function(e){
              e.preventDefault();
              var before = val.slice(0, _mentionStart);
              var after = val.slice(cursor);
              input.value = before + '@' + name + ' ' + after;
              drop.style.display = 'none';
              input.focus();
            });
            drop.appendChild(item);
          });
          drop.style.display = 'block';
        } else { drop.style.display = 'none'; }
      } else { drop.style.display = 'none'; }
    });
    input.addEventListener('blur', function(){ setTimeout(function(){ drop.style.display='none'; }, 150); });
    input.addEventListener('keydown', function(e){
      if (e.key === 'Escape') drop.style.display = 'none';
      if (e.key === 'Enter') { e.preventDefault(); sendChatMsg(); }
    });
  }

  // ── Send message ─────────────────────────────────────────────────────────
  window.sendChatMsg = function(){
    var input = document.getElementById('chatInput');
    if (!input) return;
    var t = input.value.trim();
    if (!t) return;
    drop.style.display = 'none';
    if (typeof ws !== 'undefined' && ws) {
      if (_activeChatChannel === 'whisper') {
        var toName = window._whisperTarget || null;
        var msgText = t;
        var atM = t.match(/^@([A-Za-z0-9_\-]+)\s+([\s\S]*)/);
        if (atM) { toName = atM[1]; msgText = atM[2].trim(); window._whisperTarget = toName; }
        if (!toName) { try{showToast('Type @name message to start a whisper','#ff6a6a');}catch(e){} input.value=''; return; }
        if (!msgText) { input.value=''; return; }
        ws.send(JSON.stringify({type:'whisper', to:toName, text:msgText}));
        var wtb=document.getElementById('whisperTargetBadge');
        if(wtb){wtb.style.display='inline';wtb.textContent='→ '+toName;}
        var ci2=document.getElementById('chatInput');
        if(ci2)ci2.placeholder='Whisper to '+toName+'…';
      } else {
        var msgPayload = {type:'chat', text:t, channel:_activeChatChannel};
        // Send room for all roomed channels (everything except dunce)
        if (ROOMED_CHANNELS.indexOf(_activeChatChannel) !== -1) {
          msgPayload.room = (window.__chatRooms && window.__chatRooms[_activeChatChannel]) || 1;
        }
        ws.send(JSON.stringify(msgPayload));
      }
    }
    input.value = '';
  };
  var sendBtn = document.getElementById('chatSend');
  if (sendBtn) sendBtn.addEventListener('click', window.sendChatMsg);
  var wtbClear=document.getElementById('whisperTargetBadge');
  if(wtbClear){wtbClear.addEventListener('click',function(){
    window._whisperTarget=null;
    wtbClear.style.display='none';
    var ci4=document.getElementById('chatInput');
    if(ci4){ci4.placeholder='@name message…';ci4.focus();}
  });}
})();
