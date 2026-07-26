/**
 * casino-solitaire.js - Klondike (draw-3, no recycle), server-authoritative.
 *
 * The deal, PRNG, and move rules below are mirrored VERBATIM from
 * server/solitaire.js. The client plays locally for responsiveness and records a
 * move log; the server owns the deal (derived from the same round id) and the
 * score. On finish the client sends only the move log and the server replays it.
 * A cross-check test asserts client and server produce identical deals.
 *
 * IMPORTANT: seedFromId / mulberry32 / deal / the rule helpers must stay
 * byte-identical to server/solitaire.js or honest games will score wrong.
 */
(function(){
  'use strict';
  var pane = document.getElementById('casino-solitaire');
  if (!pane || pane.__solInit) return;
  pane.__solInit = true;
  var _T=function(k,fb){return window.t?window.t(k,fb):fb;};
  var _TF=function(k,fb,v){return window.tf?window.tf(k,fb,v):fb;};

  // ── Shared engine mirror (must match server/solitaire.js) ───────────────────
  function seedFromId(id){
    var h = 0x811c9dc5 >>> 0;
    var s = String(id);
    for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a){
    var x = a >>> 0;
    return function(){
      x = (x + 0x6D2B79F5) >>> 0;
      var t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
      t = (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0;
      t = (t ^ (t >>> 14)) >>> 0;
      return t / 4294967296;
    };
  }
  function isRed(s){ return s >= 2; }
  function buildDeck(){ var d=[]; for (var s=0;s<4;s++) for (var r=0;r<13;r++) d.push({r:r,s:s}); return d; }
  function deal(id){
    var rnd = mulberry32(seedFromId(id));
    var deck = buildDeck();
    for (var i = deck.length - 1; i > 0; i--){
      var j = Math.floor(rnd() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    var tableau = [[],[],[],[],[],[],[]];
    var k = 0;
    for (var c = 0; c < 7; c++){
      for (var row = 0; row <= c; row++){
        tableau[c].push({ r: deck[k].r, s: deck[k].s, up: (row === c) });
        k++;
      }
    }
    var stock = [];
    for (; k < deck.length; k++) stock.push({ r: deck[k].r, s: deck[k].s });
    return { tableau: tableau, stock: stock, waste: [], foundations: [[],[],[],[]] };
  }
  function canFoundation(F, c){ return F[c.s].length === c.r; }
  function canTableau(col, c){
    if (col.length === 0) return c.r === 12;
    var top = col[col.length - 1];
    if (!top.up) return false;
    return (isRed(top.s) !== isRed(c.s)) && (top.r === c.r + 1);
  }
  function isValidRun(col, start){
    for (var i = start; i < col.length - 1; i++){
      var a = col[i], b = col[i + 1];
      if (!a.up || !b.up) return false;
      if (!(isRed(a.s) !== isRed(b.s) && a.r === b.r + 1)) return false;
    }
    return true;
  }
  function flipIfNeeded(col){ if (col.length){ var t = col[col.length - 1]; if (!t.up) t.up = true; } }
  function foundationCount(st){ return st.foundations.reduce(function(a,f){ return a + f.length; }, 0); }
  function applyMove(st, m){
    if (!m || typeof m !== 'object') return false;
    var T = st.tableau, F = st.foundations, W = st.waste, S = st.stock;
    switch (m.t){
      case 'draw': {
        if (S.length === 0) return false;
        var n = Math.min(3, S.length);
        for (var i = 0; i < n; i++) W.push(S.pop());
        return true;
      }
      case 'w2f': {
        if (W.length === 0) return false;
        var c = W[W.length - 1];
        if (!canFoundation(F, c)) return false;
        F[c.s].push(W.pop()); return true;
      }
      case 'w2t': {
        var col = T[m.col]; if (!col || W.length === 0) return false;
        var cw = W[W.length - 1];
        if (!canTableau(col, cw)) return false;
        col.push({ r: cw.r, s: cw.s, up: true }); W.pop(); return true;
      }
      case 't2f': {
        var tc = T[m.col]; if (!tc || tc.length === 0) return false;
        var ct = tc[tc.length - 1]; if (!ct.up) return false;
        if (!canFoundation(F, ct)) return false;
        F[ct.s].push(tc.pop()); flipIfNeeded(tc); return true;
      }
      case 't2t': {
        var src = T[m.col], dst = T[m.dest];
        if (!src || !dst || m.col === m.dest) return false;
        var nn = m.n | 0; if (nn <= 0 || nn > src.length) return false;
        var start = src.length - nn;
        if (!src[start].up || !isValidRun(src, start)) return false;
        if (!canTableau(dst, src[start])) return false;
        var cards = src.splice(start, nn).map(function(x){ return { r:x.r, s:x.s, up:true }; });
        for (var q = 0; q < cards.length; q++) dst.push(cards[q]);
        flipIfNeeded(src); return true;
      }
      default: return false;
    }
  }

  // ── Card rendering ──────────────────────────────────────────────────────────
  var RANK = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  var SUIT = ['C','S','H','D'];
  function cardHTML(card, faceDown){
    if (faceDown || !card) return window.FMPokerCardHTML('back', null, { w:54, faceDown:true });
    return window.FMPokerCardHTML(RANK[card.r], SUIT[card.s], { w:54 });
  }

  // ── State ───────────────────────────────────────────────────────────────────
  var game = null;    // { tableau, stock, waste, foundations, roundId, buyin, perCard, winBonus, moves, over }
  var sel  = null;    // { zone:'waste' } | { zone:'tableau', col, idx }
  var busy = false;

  function getBalance(){
    if (window.ME && typeof window.ME.cash === 'number') return window.ME.cash;
    var c = document.getElementById('cash');
    if (c){ var n = Number(String(c.textContent).replace(/[^0-9.\-]/g,'')); if (!isNaN(n)) return n; }
    return 0;
  }
  function fmt(n){ return 'Ƒ' + (Math.round(n*100)/100).toLocaleString(); }

  // ── WS request / await (self-contained; casino-net.js does not carry solitaire) ─
  function sock(){
    if (window.ws && window.ws.readyState === 1) return window.ws;
    if (window._ws && window._ws.readyState === 1) return window._ws;
    return null;
  }
  function req(payload, ackType, timeoutMs){
    return new Promise(function(resolve){
      var done = false;
      function cleanup(){ if (done) return; done = true; document.removeEventListener('fm_ws_msg', onMsg); clearTimeout(timer); }
      function onMsg(e){ var m = e && e.detail; if (!m || m.type !== ackType) return; cleanup(); resolve(m.data || {}); }
      var timer = setTimeout(function(){ cleanup(); resolve({ ok:false, error:'timeout' }); }, timeoutMs || 12000);
      document.addEventListener('fm_ws_msg', onMsg);
      var w = sock();
      if (!w){ cleanup(); resolve({ ok:false, error:'Not connected.' }); return; }
      try { w.send(JSON.stringify(payload)); } catch(_){ cleanup(); resolve({ ok:false, error:'send failed' }); }
    });
  }

  // ── Moves ───────────────────────────────────────────────────────────────────
  function doMove(m){
    if (!game || game.over) return false;
    if (applyMove(game, m)){ game.moves.push(m); afterMove(); return true; }
    return false;
  }
  function afterMove(){
    sel = null;
    if (foundationCount(game) === 52){ render(); finishGame(true); return; }
    render();
  }
  function tryToColumn(destCol){
    if (!sel) return false;
    if (sel.zone === 'waste') return doMove({ t:'w2t', col:destCol });
    var col = game.tableau[sel.col];
    return doMove({ t:'t2t', col:sel.col, dest:destCol, n: col.length - sel.idx });
  }
  function tryToFoundation(){
    if (!sel) return false;
    if (sel.zone === 'waste') return doMove({ t:'w2f' });
    var col = game.tableau[sel.col];
    if (sel.idx !== col.length - 1) return false;   // only a single top card goes to foundation
    return doMove({ t:'t2f', col: sel.col });
  }
  function autoCollect(){
    if (!game || game.over) return;
    var moved = true;
    while (moved){
      moved = false;
      if (game.waste.length){ var c = game.waste[game.waste.length-1]; if (canFoundation(game.foundations, c)){ if (doMove({ t:'w2f' })){ moved = true; continue; } } }
      for (var i = 0; i < 7; i++){ var col = game.tableau[i]; if (col.length){ var t = col[col.length-1]; if (t.up && canFoundation(game.foundations, t)){ if (doMove({ t:'t2f', col:i })){ moved = true; break; } } } }
    }
  }

  // ── Drag and drop (primary interaction; click-to-move kept as fallback) ─────
  // Pointer events unify mouse + touch. A press that moves past a small threshold
  // becomes a drag (ghost follows the pointer, drop is hit-tested with
  // elementFromPoint); a press without movement falls through to the click
  // handler as a tap. Drag and tap both trigger the same validated doMove path.
  var drag = null;              // { zone, col, idx, ghost, sx, sy, active, captureEl, pid }
  var suppressClick = false;    // true for the click that fires right after a drag
  var DRAG_THRESH = 6;

  function draggableFrom(el){
    var z = el.getAttribute('data-z');
    if (z === 'waste'){ return game.waste.length ? { zone:'waste' } : null; }
    if (z === 't'){
      var col = +el.getAttribute('data-col'), idx = +el.getAttribute('data-idx');
      var card = game.tableau[col][idx];
      // only a face-up card that begins a valid run can be picked up
      if (card && card.up && isValidRun(game.tableau[col], idx)) return { zone:'tableau', col:col, idx:idx };
    }
    return null;
  }
  function movingCards(src){
    if (src.zone === 'waste'){ var w = game.waste; return w.length ? [w[w.length-1]] : []; }
    return game.tableau[src.col].slice(src.idx);
  }
  function makeGhost(src){
    var cards = movingCards(src);
    var g = document.createElement('div'); g.className = 'sol-ghost';
    var html = '';
    for (var i = 0; i < cards.length; i++){ html += '<div class="sol-gcard'+(i===0?' first':'')+'">' + cardHTML(cards[i], false) + '</div>'; }
    g.innerHTML = html; document.body.appendChild(g); return g;
  }
  function markSource(src, on){
    if (src.zone === 'waste'){ var wel = pane.querySelector('.sol-wc[data-z="waste"]'); if (wel) wel.classList.toggle('sol-dragging', on); return; }
    var col = src.col;
    for (var i = src.idx; i < game.tableau[col].length; i++){
      var e2 = pane.querySelector('.sol-card[data-col="'+col+'"][data-idx="'+i+'"]');
      if (e2) e2.classList.toggle('sol-dragging', on);
    }
  }
  function clearHover(){ var hs = pane.querySelectorAll('.sol-hover'); for (var i = 0; i < hs.length; i++) hs[i].classList.remove('sol-hover'); }
  function targetAt(x, y){
    var el = document.elementFromPoint(x, y); if (!el || !el.closest) return null;
    var z = el.closest('[data-z]'); if (!z) return null;
    var zt = z.getAttribute('data-z');
    if (zt === 'foundation') return { kind:'foundation', el:z };
    if (zt === 't' || zt === 'tcol') return { kind:'column', col:+z.getAttribute('data-col'), el: z.closest('.sol-col') || z };
    return null;
  }
  function endDrag(remove){
    if (drag && drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    clearHover(); if (remove) drag = null;
  }
  function onPointerDown(e){
    if (busy || !game || game.over) return;
    if (e.button !== undefined && e.button !== 0) return;   // primary button / touch only
    var el = e.target.closest && e.target.closest('[data-z]'); if (!el) return;
    var src = draggableFrom(el); if (!src) return;
    drag = { zone:src.zone, col:src.col, idx:src.idx, ghost:null, sx:e.clientX, sy:e.clientY, active:false };
    try { if (el.setPointerCapture){ el.setPointerCapture(e.pointerId); drag.captureEl = el; drag.pid = e.pointerId; } } catch(_){}
  }
  function onPointerMove(e){
    if (!drag) return;
    if (!drag.active){
      if (Math.abs(e.clientX - drag.sx) < DRAG_THRESH && Math.abs(e.clientY - drag.sy) < DRAG_THRESH) return;
      drag.active = true; sel = null;               // a drag supersedes any tap-selection
      drag.ghost = makeGhost(drag); markSource(drag, true);
    }
    if (e.cancelable) e.preventDefault();
    drag.ghost.style.left = (e.clientX - 24) + 'px';
    drag.ghost.style.top  = (e.clientY - 20) + 'px';
    clearHover();
    var tgt = targetAt(e.clientX, e.clientY);
    if (tgt && tgt.el) tgt.el.classList.add('sol-hover');
  }
  function onPointerUp(e){
    if (!drag) return;
    var d = drag;
    if (!d.active){ drag = null; return; }           // was a tap -> let the click handler run
    suppressClick = true; setTimeout(function(){ suppressClick = false; }, 0);
    endDrag(false);
    var tgt = targetAt(e.clientX, e.clientY);
    sel = { zone:d.zone, col:d.col, idx:d.idx };      // tryTo* read sel
    var moved = false;
    if (tgt){
      if (tgt.kind === 'foundation') moved = tryToFoundation();
      else if (tgt.kind === 'column') moved = tryToColumn(tgt.col);
    }
    drag = null;
    if (!moved){ sel = null; render(); }              // illegal / off-target -> snap back
  }
  function onPointerCancel(){
    if (!drag) return;
    var wasActive = drag.active; endDrag(false); drag = null;
    if (wasActive){ sel = null; render(); }
  }

  // ── Click handling (tap fallback) ───────────────────────────────────────────
  function onClick(e){
    if (suppressClick){ suppressClick = false; return; }   // this click closed out a drag
    if (busy || !game || game.over) return;
    var el = e.target.closest && e.target.closest('[data-z]');
    if (!el){ sel = null; render(); return; }
    var z = el.getAttribute('data-z');
    if (z === 'stock'){ doMove({ t:'draw' }); return; }
    if (z === 'foundation'){ tryToFoundation(); render(); return; }
    if (z === 'waste'){
      if (sel && sel.zone === 'waste'){ sel = null; } else { sel = { zone:'waste' }; }
      render(); return;
    }
    if (z === 'tcol'){ var dc = +el.getAttribute('data-col'); if (sel){ if (!tryToColumn(dc)){ sel = null; render(); } } else { render(); } return; }
    if (z === 't'){
      var col = +el.getAttribute('data-col'), idx = +el.getAttribute('data-idx');
      var card = game.tableau[col][idx];
      if (sel && !(sel.zone==='tableau' && sel.col===col && sel.idx===idx)){
        // a card in another (or same) column was clicked as a destination
        if (tryToColumn(col)) return;
        // move failed -> treat as a fresh selection if this card is face up
        if (card && card.up){ sel = { zone:'tableau', col:col, idx:idx }; } else { sel = null; }
        render(); return;
      }
      if (card && card.up){ sel = { zone:'tableau', col:col, idx:idx }; } else { sel = null; }
      render(); return;
    }
  }
  function onDblClick(e){
    if (busy || !game || game.over) return;
    var el = e.target.closest && e.target.closest('[data-z]');
    if (!el) return;
    var z = el.getAttribute('data-z');
    if (z === 'waste'){ sel = { zone:'waste' }; tryToFoundation(); render(); return; }
    if (z === 't'){
      var col = +el.getAttribute('data-col'), idx = +el.getAttribute('data-idx');
      if (idx === game.tableau[col].length - 1){ sel = { zone:'tableau', col:col, idx:idx }; tryToFoundation(); render(); }
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────
  function selMatch(zone, col, idx){
    if (!sel) return false;
    if (zone === 'waste') return sel.zone === 'waste';
    return sel.zone === 'tableau' && sel.col === col && idx >= sel.idx;
  }
  function render(){
    if (!game){ renderIdle(); return; }
    var foundHTML = '';
    for (var s = 0; s < 4; s++){
      var f = game.foundations[s];
      var top = f.length ? f[f.length-1] : null;
      foundHTML += '<div class="sol-slot" data-z="foundation" data-suit="'+s+'">' +
        (top ? cardHTML(top,false) : '<div class="sol-empty">'+SUIT[s]+'</div>') + '</div>';
    }
    var wasteHTML = '';
    var wlen = game.waste.length, showN = Math.min(3, wlen);
    for (var wi = 0; wi < showN; wi++){
      var wc = game.waste[wlen - showN + wi];
      var isTop = (wi === showN - 1);
      wasteHTML += '<div class="sol-wc'+(isTop && selMatch('waste')?' sel':'')+'" data-z="'+(isTop?'waste':'x')+'" style="margin-left:'+(wi===0?0:18)+'px">' + cardHTML(wc,false) + '</div>';
    }
    var stockHTML = game.stock.length
      ? '<div class="sol-slot" data-z="stock">' + cardHTML(null,true) + '<div class="sol-badge">'+game.stock.length+'</div></div>'
      : '<div class="sol-slot sol-stockx" data-z="stock"><div class="sol-empty">'+(0)+'</div></div>';

    var colsHTML = '';
    for (var c = 0; c < 7; c++){
      var col = game.tableau[c];
      var inner = '';
      if (col.length === 0){
        inner = '<div class="sol-empty sol-drop">K</div>';
      } else {
        for (var i = 0; i < col.length; i++){
          var card = col[i];
          var cls = 'sol-card' + (i===0?' first':'') + (card.up?'':' down') + (card.up && selMatch('tableau',c,i)?' sel':'');
          inner += '<div class="'+cls+'" data-z="t" data-col="'+c+'" data-idx="'+i+'">' + cardHTML(card, !card.up) + '</div>';
        }
      }
      colsHTML += '<div class="sol-col" data-z="tcol" data-col="'+c+'">' + inner + '</div>';
    }

    var fc = foundationCount(game);
    var potential = fc * game.perCard + (fc === 52 ? game.winBonus : 0);
    var status = _TF('casino.sol.statusPlaying','Foundations <b>{fc} / 52</b> &nbsp; Cash-out value <b>{val}</b>',{fc:fc,val:fmt(potential)});

    pane.querySelector('.sol-top').innerHTML =
      '<div class="sol-piles"><div class="sol-lhs">'+stockHTML+'<div class="sol-waste">'+wasteHTML+'</div></div>' +
      '<div class="sol-foundations">'+foundHTML+'</div></div>';
    pane.querySelector('.sol-board').innerHTML = colsHTML;
    pane.querySelector('.sol-status').innerHTML = status;
    var cashOut = pane.querySelector('#sol-cashout'); if (cashOut) cashOut.disabled = busy || game.over;
    refreshHeader();
  }
  function renderIdle(){
    pane.querySelector('.sol-top').innerHTML = '<div class="sol-idle">'+_T('casino.sol.idle','Klondike - draw 3, one pass through the stock, no redeal.')+'</div>';
    pane.querySelector('.sol-board').innerHTML = '';
    pane.querySelector('.sol-status').innerHTML = _TF('casino.sol.idleStatus','Buy-in <b>{buyin}</b>. Move cards to the foundations and cash out for <b>{perCard}</b> per foundation card. Clearing all 52 pays a <b>{bonus}</b> bonus. The buy-in is committed when you start and forfeited if you leave a game unfinished.',{buyin:fmt(SOL.buyin),perCard:fmt(SOL.perCard),bonus:fmt(SOL.winBonus)});
    refreshHeader();
  }
  function refreshHeader(){
    var b = pane.querySelector('.sol-bal'); if (b) b.textContent = fmt(getBalance());
  }

  // ── Buy-in / finish flow ────────────────────────────────────────────────────
  var SOL = { buyin: 250, perCard: 20, winBonus: 500 }; // display defaults; server ack overrides
  function log(msg, cls){
    var bn = pane.querySelector('.sol-banner');
    if (bn){ bn.className = 'sol-banner' + (cls?(' '+cls):''); bn.textContent = msg; bn.style.display = msg ? 'block' : 'none'; }
  }
  async function newGame(){
    if (busy) return;
    if (game && !game.over){
      if (!window.confirm(_T('casino.sol.confirmNew','Start a new game? Your current game will be forfeited and the buy-in lost.'))) return;
    }
    busy = true; setButtons();
    log(_T('casino.sol.dealing','Dealing...'), '');
    var r = await req({ type:'solitaire_start' }, 'solitaire_start_ack');
    busy = false;
    if (!r || !r.ok){ log(_TF('casino.sol.couldNotStart','Could not start: {err}',{err:((r&&r.error)||'unknown')}), 'lose'); setButtons(); return; }
    SOL.buyin = r.buyin; SOL.perCard = r.perCard; SOL.winBonus = r.winBonus;
    game = deal(r.roundId);
    game.roundId = r.roundId; game.buyin = r.buyin; game.perCard = r.perCard; game.winBonus = r.winBonus;
    game.moves = []; game.over = false;
    sel = null;
    log('', '');
    setButtons(); render();
  }
  async function finishGame(auto){
    if (!game || game.over || busy) return;
    busy = true; setButtons();
    var r = await req({ type:'solitaire_finish', roundId: game.roundId, moves: game.moves }, 'solitaire_finish_ack');
    busy = false;
    if (!r || !r.ok){ busy = false; setButtons(); log(_TF('casino.sol.cashoutFailed','Cash-out failed: {err} (try again)',{err:((r&&r.error)||'unknown')}), 'lose'); return; }
    game.over = true;
    var net = (typeof r.net === 'number') ? r.net : (r.credited - game.buyin);
    var head = r.won ? _T('casino.sol.solved','SOLVED - all 52 cleared') : _TF('casino.sol.headFoundations','{n} of 52 to foundations',{n:r.foundations});
    if (net > 0) log(_TF('casino.sol.bannerWin','W {head}. Won {net} (paid {paid})',{head:head,net:fmt(net),paid:fmt(r.credited)}), 'win');
    else if (net === 0) log(_TF('casino.sol.bannerPush','{head}. Broke even (paid {paid})',{head:head,paid:fmt(r.credited)}), 'push');
    else log(_TF('casino.sol.bannerLose','L {head}. Lost {loss} (paid {paid})',{head:head,loss:fmt(Math.abs(net)),paid:fmt(r.credited)}), 'lose');
    setButtons(); render();
  }
  function setButtons(){
    var ng = pane.querySelector('#sol-new'); if (ng) ng.disabled = busy;
    var co = pane.querySelector('#sol-cashout'); if (co) co.disabled = busy || !game || game.over;
    var au = pane.querySelector('#sol-auto'); if (au) au.disabled = busy || !game || game.over;
  }

  // ── Shell ───────────────────────────────────────────────────────────────────
  function css(){
    if (document.getElementById('sol-css')) return;
    var st = document.createElement('style'); st.id = 'sol-css';
    st.textContent =
      '#casino-solitaire{padding:10px 4px;color:#bfe6c8}' +
      '.sol-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}' +
      '.sol-bar button{background:#0b2413;color:#7dffa0;border:1px solid #2f9f4a;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit}' +
      '.sol-bar button:disabled{opacity:.45;cursor:default}' +
      '.sol-bar .sol-balbox{margin-left:auto;font-size:13px;opacity:.9}' +
      '.sol-banner{display:none;margin:6px 0;padding:6px 10px;border:1px solid #2f9f4a;border-radius:4px;background:#08160c;font-size:13px}' +
      '.sol-banner.win{border-color:#37d867;color:#8effb0}.sol-banner.lose{border-color:#c0603a;color:#ffb38f}.sol-banner.push{border-color:#c9a227;color:#f2dd8a}' +
      '.sol-status{font-size:13px;margin:4px 0 8px;opacity:.95}' +
      '.sol-piles{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px}' +
      '.sol-lhs{display:flex;gap:10px;align-items:flex-start}' +
      '.sol-waste{display:flex;align-items:flex-start}' +
      '.sol-foundations{display:flex;gap:8px}' +
      '.sol-slot,.sol-wc,.sol-card{position:relative;cursor:pointer;line-height:0}' +
      '.sol-empty{width:54px;height:76px;border:1px dashed #2f6f42;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#3f8f5a;font-size:15px;background:#06120a}' +
      '.sol-badge{position:absolute;bottom:2px;right:2px;background:#04110a;border:1px solid #2f9f4a;border-radius:3px;font-size:11px;padding:0 4px;color:#7dffa0;line-height:14px}' +
      '.sol-board{display:grid;grid-template-columns:repeat(7,minmax(56px,1fr));gap:8px;align-items:start}' +
      '.sol-col{min-height:96px;position:relative;border-radius:6px}' +
      '.sol-card{margin-top:-46px}.sol-card.down{margin-top:-56px}.sol-card.first{margin-top:0}' +
      '.sol-drop{width:54px;height:76px}' +
      '.sol-wc.sel>*,.sol-card.sel>*{outline:2px solid #ffd23f;outline-offset:-1px;border-radius:5px}' +
      '.sol-card,.sol-wc,.sol-slot,.sol-col,.sol-drop{touch-action:none}' +
      '.sol-ghost{position:fixed;pointer-events:none;z-index:99999;opacity:.9;line-height:0}' +
      '.sol-gcard{position:relative;margin-top:-46px}.sol-gcard.first{margin-top:0}' +
      '.sol-dragging{opacity:.32}' +
      '.sol-hover{outline:2px dashed #7dffa0;outline-offset:1px;border-radius:6px}' +
      '.sol-idle{font-size:13px;opacity:.85;padding:6px 0}';
    document.head.appendChild(st);
  }
  function shell(){
    css();
    pane.innerHTML =
      '<div class="sol-bar">' +
        '<button id="sol-new" data-i18n="casino.sol.newGame">New Game</button>' +
        '<button id="sol-cashout" disabled data-i18n="casino.sol.cashOut">Cash Out</button>' +
        '<button id="sol-auto" disabled title="Send every available card to the foundations" data-i18n="casino.sol.auto">Auto</button>' +
        '<span class="sol-balbox"><span data-i18n="casino.sol.balance">Balance</span> <b class="sol-bal">Ƒ0</b></span>' +
      '</div>' +
      '<div class="sol-banner"></div>' +
      '<div class="sol-status"></div>' +
      '<div class="sol-top"></div>' +
      '<div class="sol-board"></div>';
    if(window.applyI18n) window.applyI18n(pane);
    pane.querySelector('#sol-new').onclick = newGame;
    pane.querySelector('#sol-cashout').onclick = function(){ finishGame(false); };
    pane.querySelector('#sol-auto').onclick = autoCollect;
    pane.addEventListener('click', onClick);
    pane.addEventListener('dblclick', onDblClick);
    pane.addEventListener('pointerdown', onPointerDown);
    pane.addEventListener('pointermove', onPointerMove);
    pane.addEventListener('pointerup', onPointerUp);
    pane.addEventListener('pointercancel', onPointerCancel);
    renderIdle();
  }

  document.addEventListener('fm_ws_msg', function(e){
    var m = e && e.detail; if (!m) return;
    if (m.type === 'me' || m.type === 'portfolio') refreshHeader();
  });

  shell();
})();
