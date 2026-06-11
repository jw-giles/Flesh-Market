// ═══════════════════════════════════════════════════════════════════════════════
// FMCodec — codec-call ENGINE (layer 1) + contacts list. Plays a conversation from
// FM_CODEC.reps: linear quest scripts (lines[]) or branching dialogue trees (rep.tree);
// emits onQuestAccepted at the end. Knows nothing about quest tracking.
//   window.FMContacts.open()      -> contacts list of faction reps
//   window.FMCodec.call(repId)    -> place a codec call to that rep
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  // Master switch. Per-rep gating is done with rep.enabled (see FM_CODEC data);
  // a rep is callable only when CALLS_ENABLED && rep.enabled === true.
  var CALLS_ENABLED = true;
  let st = { rep:null, idx:0, typing:false, typer:null };

  function styleOnce() {
    if ($('fmcodec-style')) return;
    const s = document.createElement('style');
    s.id = 'fmcodec-style';
    s.textContent = `
    .fmc-ov{position:fixed;inset:0;z-index:12000;background:rgba(2,6,8,.86);display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',ui-monospace,monospace;--fac:#42ff7e}
    .fmc-wrap{position:relative;width:min(720px,92vw)}
    .fmc-wrap::before{content:"";position:absolute;inset:0;z-index:40;border-radius:14px;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px);mix-blend-mode:multiply;opacity:.5}
    .fmc-dev{position:relative;border-radius:14px;padding:16px;max-height:92vh;overflow-y:auto;background:linear-gradient(180deg,#0c1a15,#070f0c);border:1px solid #1c3a30;box-shadow:0 0 0 1px #000 inset,0 0 50px rgba(0,0,0,.7),0 0 60px color-mix(in srgb,var(--fac) 14%,transparent)}
    .fmc-hdr{display:flex;align-items:center;gap:10px;font-size:.6rem;letter-spacing:.26em;color:#5f8f74;text-transform:uppercase;margin-bottom:12px;border-bottom:1px solid #1c3a30;padding-bottom:8px}
    .fmc-live{width:7px;height:7px;border-radius:50%;background:#444}
    .fmc-live.on{background:var(--fac);box-shadow:0 0 8px var(--fac)}
    .fmc-id{margin-left:auto;color:var(--fac);opacity:.85}
    .fmc-x{background:none;border:none;color:#5f8f74;font-size:1rem;cursor:pointer;margin-left:8px}
    .fmc-stage{display:grid;grid-template-columns:1fr 150px;gap:12px}
    .fmc-port{position:relative;border:1px solid #1c3a30;border-radius:6px;overflow:hidden;background:#040a08;min-height:0;display:flex;align-items:center;justify-content:center}
    .fmc-port.them{height:min(40vh,330px)}
    .fmc-port.them img{object-fit:contain}
    .fmc-port img{width:100%;height:100%;object-fit:cover;filter:saturate(.92) contrast(1.03)}
    .fmc-port .meta{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;font-size:.54rem;letter-spacing:.13em;color:#5f8f74;padding:5px 7px;z-index:3;background:linear-gradient(180deg,rgba(0,0,0,.65),transparent)}
    .fmc-port .scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 2px,rgba(0,0,0,.18) 2px 4px);mix-blend-mode:multiply}
    .fmc-port.you{min-height:150px;align-self:end}
    .fmc-port.you .meta{color:#f0b454}
    .fmc-ring .fmc-port.them{animation:fmcGlitch .14s steps(2) infinite}
    @keyframes fmcGlitch{50%{filter:brightness(1.3) saturate(1.4);transform:translateY(1px)}}
    .fmc-dlg{grid-column:1/-1;margin-top:14px;border:1px solid #1c3a30;border-radius:8px;background:#06110d;position:relative;min-height:96px}
    .fmc-name{position:absolute;top:-11px;left:14px;background:var(--fac);color:#03100a;font-weight:700;font-size:.7rem;letter-spacing:.08em;padding:2px 12px;border-radius:3px;text-transform:uppercase}
    .fmc-line{padding:20px 18px 16px;font-size:1rem;line-height:1.55;color:#b6ffcf;min-height:58px}
    .fmc-line .cur{color:var(--fac);animation:fmcBlink 1s steps(1) infinite}
    @keyframes fmcBlink{50%{opacity:0}}
    .fmc-hint{position:absolute;right:14px;bottom:8px;font-size:.56rem;letter-spacing:.16em;color:#5f8f74;text-transform:uppercase}
    .fmc-quest{grid-column:1/-1;margin-top:6px;border:1px dashed var(--fac);border-radius:6px;padding:12px 14px;display:none}
    .fmc-quest.show{display:block}
    .fmc-qt{color:var(--fac);font-weight:700;letter-spacing:.05em;font-size:.84rem;margin-bottom:4px}
    .fmc-qd{font-size:.78rem;color:#b6ffcf;line-height:1.5;margin-bottom:6px}
    .fmc-qr{font-size:.68rem;color:#f0b454;letter-spacing:.03em}
    .fmc-ctl{grid-column:1/-1;display:flex;gap:10px;margin-top:12px;justify-content:center;min-height:38px}
    .fmc-ctl button{font-family:inherit;cursor:pointer;border-radius:4px;padding:9px 22px;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;background:transparent}
    .fmc-accept{border:1px solid var(--fac);color:var(--fac)}.fmc-accept:hover{background:color-mix(in srgb,var(--fac) 18%,transparent)}
    .fmc-decline{border:1px solid #7a3030;color:#ff7a7a}.fmc-decline:hover{background:#ff7a7a18}
    /* contacts */
    .fmc-contacts{background:#060f0b;border:1px solid #1c3a30;border-radius:12px;width:min(520px,94vw);max-height:84vh;overflow:auto;box-shadow:0 10px 40px #000c}
    .fmc-chead{position:sticky;top:0;background:#08120d;border-bottom:1px solid #1c3a30;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;z-index:2}
    .fmc-ctitle{color:#42ff7e;letter-spacing:.18em;font-size:.78rem;text-transform:uppercase}
    .fmc-card{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-bottom:1px solid #102219;cursor:pointer;transition:background .12s}
    .fmc-card:hover{background:#0a1813}
    .fmc-cav{width:76px;height:76px;border-radius:8px;object-fit:cover;border:2px solid var(--fac);flex:0 0 auto}
    .fmc-cmeta{flex:1;min-width:0}
    .fmc-cname{color:#cdebe0;font-size:.86rem;font-weight:600}
    .fmc-crole{color:var(--fac);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;margin:2px 0 5px}
    .fmc-cblurb{color:#9fc7b5;font-size:.74rem;line-height:1.55}
    .fmc-callbtn{flex:0 0 auto;align-self:center;border:1px solid var(--fac);color:var(--fac);background:transparent;border-radius:4px;padding:7px 12px;font:inherit;font-size:.62rem;letter-spacing:.08em;cursor:pointer;text-transform:uppercase}
    .fmc-callbtn.off{border-color:#7a3030;color:#ff6a6a;cursor:not-allowed;opacity:.85}
    /* branching dialogue options (player lines) */
    .fmc-ctl.opts{flex-direction:column;align-items:stretch;gap:7px}
    .fmc-ctl button.fmc-opt{border:1px solid #f0b45455;color:#f0b454;text-align:left;text-transform:none;letter-spacing:.02em;font-size:.8rem;line-height:1.45;padding:9px 14px}
    .fmc-ctl button.fmc-opt:hover{background:#f0b45418;border-color:#f0b454}
    `;
    document.head.appendChild(s);
  }

  function facColor(f){ return (window.FM_CODEC && FM_CODEC.factions[f] && FM_CODEC.factions[f].color) || '#42ff7e'; }
  function facSys(f){ return (window.FM_CODEC && FM_CODEC.factions[f] && FM_CODEC.factions[f].sys) || 'COMMS'; }
  // Player address resolver: their profile name, or "President" if they hold the seat.
  function fmAddress(){
    var me = window.ME || {}, pres = window.FM_PRESIDENT;
    if (pres && me.name && pres.name === me.name) return 'President';
    return (me && me.name) || 'Trader';
  }
  function fmIsPresident(){
    var me = window.ME || {}, pres = window.FM_PRESIDENT;
    return !!(pres && me.name && pres.name === me.name);
  }
  function resolveTokens(s){ return String(s == null ? '' : s).replace(/\{name\}/g, fmAddress()); }
  function repEnabled(r){ return CALLS_ENABLED && !!(r && r.enabled === true); }
  // Persistent quest status for a quest id, from the server-synced window.FM_QUESTS.
  function fmQuestStatus(qid){
    var list = window.FM_QUESTS || [];
    for (var i = 0; i < list.length; i++){ if (list[i].id === qid) return list[i].status || 'active'; }
    return null;
  }
  function sani(id){ return String(id||'').replace(/[^a-z0-9_]/gi,''); }
  // Resolve a rep.portrait value to an image URL.
  //   'item:<id>'  -> that item's image from the client catalog (data URI art)
  //   'data:...'   -> used as-is
  //   real path/filename -> as-is
  //   bare stem    -> the portraits dir
  function portraitSrc(id){
    var s = String(id || '');
    if (!s) return '';
    if (/^data:/.test(s)) return s;
    var m = /^item:(.+)$/.exec(s);
    if (m) { var it = (window.ITEM_CATALOG_CLIENT || {})[m[1]]; return (it && it.img) || ''; }
    if (/[./]/.test(s)) return s.replace(/[^a-z0-9_./-]/gi, '');
    return 'assets/portraits/' + s.replace(/[^a-z0-9_]/gi, '') + '.png';
  }
  // Item art is low-res pixel sprites; upscale nearest-neighbor so it stays crisp
  // instead of blurring. Full-res portraits-dir images are left smooth.
  function pixelArt(id, src){ return /^item:/.test(String(id)) || /^data:/.test(String(src)); }
  function portImg(id, who, col){
    const src = portraitSrc(id);
    if (src) {
      const ir = pixelArt(id, src) ? ' style="image-rendering:pixelated;image-rendering:crisp-edges"' : '';
      return '<img'+ir+' src="'+src+'" alt="" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{innerHTML:\'\'}))">';
    }
    return '<svg viewBox="0 0 100 120" width="60%" style="opacity:.5"><circle cx="50" cy="42" r="22" fill="none" stroke="'+col+'" stroke-width="2"/><path d="M18 112 q32 -46 64 0" fill="none" stroke="'+col+'" stroke-width="2"/></svg>';
  }
  // Item-backed portraits ('item:<id>') need ITEM_CATALOG_CLIENT, which lives in
  // the lazy-loaded inventory.js. If a render needs it and it isn't loaded yet,
  // pull it in (lazyLoad dedupes) and re-run the render via cb.
  function needsItemArt(portrait){ return /^item:/.test(String(portrait || '')) && !window.ITEM_CATALOG_CLIENT; }
  function ensureItemArt(cb){
    if (window.ITEM_CATALOG_CLIENT || !window.lazyLoad) return false;
    window.lazyLoad('assets/inventory.js', cb);
    return true;
  }

  function closeAll(){
    const o = $('fmcodecOverlay'); if (o) o.remove();
    const c = $('fmcontactsOverlay'); if (c) c.remove();
    if (st.typer) clearInterval(st.typer);
    st = { rep:null, idx:0, typing:false, typer:null };
    document.removeEventListener('keydown', onKey);
  }

  // Leave the active call and reopen the contacts list. FMContacts.open() calls
  // closeAll() first, so this both ends the call and navigates back.
  function backToContacts(){
    if (window.FMContacts) FMContacts.open(); else closeAll();
  }

  // ── Contacts list ──────────────────────────────────────────────────────────
  window.FMContacts = {
    open: function () {
      if (!window.FM_CODEC) return;
      if (FM_CODEC.reps.some(function (r) { return needsItemArt(r.portrait); }) && ensureItemArt(function () { FMContacts.open(); })) return;
      styleOnce();
      closeAll();
      const ov = document.createElement('div');
      ov.id = 'fmcontactsOverlay'; ov.className = 'fmc-ov';
      let h = '<div class="fmc-contacts"><div class="fmc-chead"><div class="fmc-ctitle">☎ Contacts</div><button class="fmc-x" id="fmcContactsClose">✕</button></div>';
      FM_CODEC.reps.forEach(function (r) {
        const col = facColor(r.faction);
        h += '<div class="fmc-card" data-rep="' + r.id + '" style="--fac:' + col + '">'
          + '<img class="fmc-cav"' + (pixelArt(r.portrait, portraitSrc(r.portrait)) ? ' style="image-rendering:pixelated"' : '') + ' src="' + portraitSrc(r.portrait) + '" alt="" onerror="this.style.visibility=\'hidden\'">'
          + '<div class="fmc-cmeta"><div class="fmc-cname">' + r.name + '</div>'
          + '<div class="fmc-crole">' + r.role + '</div>'
          + '<div class="fmc-cblurb">' + r.blurb + '</div></div>'
          + '<button class="fmc-callbtn' + (repEnabled(r) ? '' : ' off') + '" data-call="' + r.id + '"' + (repEnabled(r) ? '' : ' title="Offline"') + '>☎ ' + (repEnabled(r) ? 'Call' : 'Offline') + '</button></div>';
      });
      h += '</div>';
      ov.innerHTML = h;
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) closeAll(); });
      $('fmcContactsClose').onclick = closeAll;
      ov.querySelectorAll('[data-call]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var rr = FM_CODEC.reps.find(function (x) { return x.id === b.dataset.call; });
          if (!repEnabled(rr)) { if (window.showToast) window.showToast('That contact is offline', '#ff6a6a', 2500); return; }
          FMCodec.call(b.dataset.call);
        };
      });
      ov.querySelectorAll('.fmc-card').forEach(function (card) {
        var rr = FM_CODEC.reps.find(function (x) { return x.id === card.dataset.rep; });
        if (repEnabled(rr)) { card.onclick = function () { FMCodec.call(card.dataset.rep); }; }
        else { card.style.cursor = 'default'; }
      });
    }
  };

  // ── Codec call engine ────────────────────────────────────────────────────────
  window.FMCodec = {
    call: function (repId) {
      if (!window.FM_CODEC) return;
      const rep = FM_CODEC.reps.find(function (r) { return r.id === repId; });
      if (!rep) return;
      if (needsItemArt(rep.portrait) && ensureItemArt(function () { FMCodec.call(repId); })) return;
      if (!repEnabled(rep)) { if (window.showToast) window.showToast('That contact is offline', '#ff6a6a', 2500); return; }
      styleOnce();
      const cExisting = $('fmcontactsOverlay'); if (cExisting) cExisting.remove();
      const old = $('fmcodecOverlay'); if (old) old.remove();
      var qlist = Array.isArray(rep.quests) ? rep.quests
        : (rep.quest ? [{ id:rep.quest.id, title:rep.quest.title, lines:rep.lines, quest:rep.quest, activeLine:rep.questActiveLine }] : []);
      st = { rep:rep, idx:0, typing:false, typer:null, locked:!!(rep.presidentLock && fmIsPresident()), qlist:qlist, cur:null };
      const col = facColor(rep.faction);
      const myPort = (window.ME && window.ME.portrait) ? window.ME.portrait : '';
      const ov = document.createElement('div');
      ov.id = 'fmcodecOverlay'; ov.className = 'fmc-ov fmc-ring';
      ov.style.setProperty('--fac', col);
      ov.innerHTML =
        '<div class="fmc-wrap"><div class="fmc-dev">'
        + '<div class="fmc-hdr"><span class="fmc-live" id="fmcLive"></span><span id="fmcState">INCOMING TRANSMISSION</span>'
        + '<span class="fmc-id">FLESH COMMS // ' + facSys(rep.faction) + '</span>'
        + '<button class="fmc-x" id="fmcBack" title="Back to contacts" style="font-size:.66rem;letter-spacing:.12em">\u25c2 BACK</button>'
        + '<button class="fmc-x" id="fmcX" title="Close">✕</button></div>'
        + '<div class="fmc-stage">'
        + '<div class="fmc-port them"><div class="meta"><span>' + facSys(rep.faction).split(' ')[0] + ' SYSTEM</span><span>' + (rep.ver || '') + '</span></div>' + portImg(rep.portrait, 'them', col) + '<div class="scan"></div></div>'
        + '<div class="fmc-port you"><div class="meta"><span>OUTGOING</span><span>YOU</span></div>' + portImg(myPort, 'you', '#f0b454') + '<div class="scan"></div></div>'
        + '<div class="fmc-dlg"><div class="fmc-name" id="fmcName">' + rep.name + '</div><div class="fmc-line" id="fmcLine"></div><div class="fmc-hint" id="fmcHint"></div></div>'
        + '<div class="fmc-quest" id="fmcQuest"><div class="fmc-qt" id="fmcQt"></div><div class="fmc-qd" id="fmcQd"></div><div class="fmc-qr" id="fmcQr"></div></div>'
        + '<div class="fmc-ctl" id="fmcCtl"></div>'
        + '</div></div></div>';
      document.body.appendChild(ov);
      $('fmcX').onclick = closeAll;
      var _bk = $('fmcBack'); if (_bk) _bk.onclick = backToContacts;
      $('fmcName').textContent = '\u2014';
      buttons([['ACCEPT', 'fmc-accept', connect], ['DECLINE', 'fmc-decline', function () { endCall('declined'); }]]);
      ov.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        if (ov.classList.contains('fmc-connected') && $('fmcCtl').children.length === 0) advance();
      });
      document.addEventListener('keydown', onKey);
    }
  };

  function onKey(e){
    const ov = $('fmcodecOverlay'); if (!ov) return;
    if (e.code === 'Escape') { closeAll(); return; }
    if (e.code === 'Backspace') { e.preventDefault(); backToContacts(); return; }
    // 1-9 select a dialogue option when the option list is on screen.
    var dg = /^Digit([1-9])$/.exec(e.code);
    if (dg) {
      const c = $('fmcCtl');
      if (c && c.classList.contains('opts')) {
        const b = c.children[+dg[1] - 1];
        if (b) { e.preventDefault(); b.click(); }
        return;
      }
    }
    if ((e.code === 'Space' || e.code === 'Enter') && ov.classList.contains('fmc-connected') && $('fmcCtl').children.length === 0) {
      e.preventDefault(); advance();
    }
  }
  function connect(){
    const ov = $('fmcodecOverlay'); if (!ov) return;
    ov.classList.remove('fmc-ring'); ov.classList.add('fmc-connected');
    $('fmcLive').classList.add('on'); $('fmcState').textContent = 'CHANNEL OPEN';
    if (st.locked) { presidentBlock(); return; }
    var sel = selectCurrentQuest(st.qlist);
    if (sel.empty)   { if (st.rep.tree) return startTree(st.rep.tree); statusBlock(st.rep.idleLine || 'Channel open. Nothing for you right now.'); return; }
    if (sel.allDone) { if (st.rep.tree) return startTree(st.rep.tree); statusBlock(st.rep.allDoneLine || st.rep.questDoneLine || 'Nothing new from me right now. Stay close.'); return; }
    if (sel.status === 'active') { statusBlock(sel.def.activeLine || st.rep.questActiveLine || 'You are still on that. Finish it, then we talk.'); return; }
    st.cur = sel.def; st.idx = 0; play();
  }
  // Linear chain: the current quest is the first one not yet completed. A later
  // quest is unreachable until the earlier one is done.
  function selectCurrentQuest(qlist){
    if (!qlist || !qlist.length) return { empty:true };
    for (var i = 0; i < qlist.length; i++){
      var def = qlist[i];
      var status = fmQuestStatus(def.id);
      if (status !== 'completed') return { def:def, status:status };
    }
    return { allDone:true };
  }
  function statusBlock(text){
    $('fmcName').textContent = st.rep.name;
    $('fmcName').style.background = 'var(--fac)';
    $('fmcLine').textContent = resolveTokens(text);
    $('fmcHint').textContent = '';
    buttons([['CLOSE', 'fmc-accept', closeAll]]);
  }
  function presidentBlock(){
    $('fmcName').textContent = st.rep.name;
    $('fmcName').style.background = 'var(--fac)';
    $('fmcLine').textContent = resolveTokens(st.rep.presidentLine || 'I have nothing for you at this time.');
    $('fmcHint').textContent = '';
    buttons([['CLOSE', 'fmc-accept', closeAll]]);
  }
  function play(){
    if (!st.rep || !st.cur) return;
    if (st.idx >= st.cur.lines.length) return offerQuest();
    const l = st.cur.lines[st.idx];
    $('fmcName').textContent = l.from === 'you' ? 'YOU' : st.rep.name;
    $('fmcName').style.background = l.from === 'you' ? '#f0b454' : 'var(--fac)';
    typeLine(resolveTokens(l.text));
    buttons([]);
  }
  function typeLine(text, onDone){
    st.typing = true; st.fullText = text; st.onTyped = onDone || null;
    let i = 0; const el = $('fmcLine'); $('fmcHint').textContent = '';
    clearInterval(st.typer);
    st.typer = setInterval(function () {
      el.innerHTML = esc(text.slice(0, i)) + '<span class="cur">\u258c</span>';
      i++;
      if (i > text.length) finishLine();
    }, 18);
  }
  // Finish the current line (natural end or skip): show full text, then either run
  // the node's completion (tree mode shows options) or show the advance hint.
  function finishLine(){
    clearInterval(st.typer); st.typing = false;
    $('fmcLine').textContent = st.fullText || '';
    if (st.onTyped) { var f = st.onTyped; st.onTyped = null; f(); }
    else $('fmcHint').textContent = '\u25b8 click / space';
  }
  function advance(){
    if (st.typing) { finishLine(); return; }
    if (st.tree) { treeAdvance(); return; }
    st.idx++; play();
  }
  // ── Branching dialogue trees ────────────────────────────────────────────────
  // rep.tree = { start:'nodeId', nodes:{ id:{ text:'npc line', options:[
  //   { text:'player line', next:'nodeId' } | { text:'player line', end:true } ] } } }
  // Plays in the idle/all-done slot only; quest pitches and active-quest lines win.
  function startTree(tree){
    st.tree = { nodes: tree.nodes || {}, mode:'npc', nextId:null };
    showTreeNode(tree.start || 'root');
  }
  function showTreeNode(id){
    var n = st.tree.nodes[id];
    if (!n) { endCall('hangup'); return; }
    st.tree.mode = 'npc';
    $('fmcName').textContent = st.rep.name;
    $('fmcName').style.background = 'var(--fac)';
    buttons([]);
    if (n.text != null) typeLine(resolveTokens(n.text), function(){ showOptions(n); });
    else showOptions(n);
  }
  function showOptions(n){
    $('fmcHint').textContent = '';
    var opts = n.options || [];
    if (!opts.length) { buttons([['CLOSE', 'fmc-accept', closeAll]]); return; }
    const c = $('fmcCtl'); c.innerHTML = ''; c.classList.add('opts');
    opts.forEach(function (o, i) {
      const b = document.createElement('button');
      b.className = 'fmc-opt';
      b.textContent = (i + 1) + '. ' + resolveTokens(o.text);
      b.onclick = function(){ pickOption(o); };
      c.appendChild(b);
    });
  }
  function pickOption(o){
    st.tree.mode = 'you';
    st.tree.nextId = o.end ? '__end' : (o.next || '__end');
    buttons([]);
    $('fmcName').textContent = 'YOU';
    $('fmcName').style.background = '#f0b454';
    typeLine(resolveTokens(o.text));
  }
  function treeAdvance(){
    if (st.tree.mode !== 'you') return; // npc mode: the option buttons do the advancing
    if (st.tree.nextId === '__end') { endCall('hangup'); return; }
    showTreeNode(st.tree.nextId);
  }
  function offerQuest(){
    const q = st.cur.quest; $('fmcHint').textContent = ''; $('fmcName').textContent = st.rep.name;
    $('fmcQt').textContent = '\u25c8 ' + resolveTokens(q.title); $('fmcQd').textContent = resolveTokens(q.desc); $('fmcQr').textContent = 'Reward: ' + resolveTokens(q.reward);
    $('fmcQuest').classList.add('show');
    $('fmcLine').textContent = 'Transmission complete. The offer stands.';
    buttons([['ACCEPT CONTRACT', 'fmc-accept', function () { onQuestAccepted(st.rep, q); }],
             ['DECLINE', 'fmc-decline', function () { endCall('declined'); }]]);
  }
  // ── LAYER 3 HOOK: quest tracking would take over here. Thin stub for now. ──
  function onQuestAccepted(rep, quest){
    window.FM_QUESTS = window.FM_QUESTS || [];
    if (!window.FM_QUESTS.some(function (q) { return q.id === quest.id; }))
      window.FM_QUESTS.push({ id:quest.id, rep:rep.id, faction:rep.faction, title:quest.title, status:'active', acceptedAt:Date.now() });
    // Persist + start tracking server-side (layer 3).
    try { if (typeof window.sendWS === 'function') window.sendWS({ type:'quest_accept', data:{ questId: quest.id } }); } catch(_){}
    $('fmcQuest').classList.remove('show');
    $('fmcLine').textContent = 'Contract logged. ' + rep.name + ' cuts the channel.';
    if (window.showToast) window.showToast('\u25c8 Contract accepted: ' + quest.title, facColor(rep.faction), 3000);
    endCall('accepted');
  }
  function endCall(how){
    const ov = $('fmcodecOverlay'); if (!ov) return;
    ov.classList.remove('fmc-ring', 'fmc-connected');
    $('fmcLive').classList.remove('on');
    $('fmcState').textContent = how === 'accepted' ? 'CONTRACT ACCEPTED' : 'CHANNEL CLOSED';
    $('fmcName').textContent = '\u2014'; $('fmcHint').textContent = '';
    if (how === 'declined') $('fmcLine').textContent = 'You cut the line.';
    buttons([['CLOSE', 'fmc-accept', closeAll]]);
  }
  function buttons(list){
    const c = $('fmcCtl'); if (!c) return; c.classList.remove('opts'); c.innerHTML = '';
    list.forEach(function (x) { const b = document.createElement('button'); b.className = x[1]; b.textContent = x[0]; b.onclick = x[2]; c.appendChild(b); });
  }
  function esc(s){ return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
})();
